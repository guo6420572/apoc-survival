#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《三国·将星录》自动战斗模拟器（第一阶段）
读取武将数据表，按 GDD 第 4 章的规则做 5v5 / 1v1 自动对战，
输出同档胜率、超标条目与废将清单。

明确简化（第一版）：
- 等级固定 1 级，不含突破/觉醒/装备；这是基线平衡，不是满级平衡。
- 兵力 = 统御 × 15 + 900（GDD 未给公式，按平均 12 回合、超时率 12% 校准）。
- 技能/天赋用关键词解析，复杂召唤、变身、互相攻击等效果仍未完全实现，计入“未覆盖”。
- 开场增益、持续伤害、控制、护盾、怒气、行动条、羁绊、阵营克制已实现。
"""

import argparse
import csv
import json
import math
import os
import random
import re
import statistics
import sys
from collections import Counter, defaultdict

import openpyxl

SIX = ['武勇', '智谋', '统御', '机变', '威仪', '天命']
LEVEL = 1
BT = 0
AW = 0
EQUIP = 0
HP_BASE = 900
HP_PER_TONG = 15
MAX_ROUNDS = 25
FACTIONS = ['魏', '蜀', '吴', '群雄']
COUNTER = {'魏': '蜀', '蜀': '吴', '吴': '魏'}
RARITY_COEF = {'普通': 1.0, '精良': 1.15, '传奇': 1.30, '绝世': 1.45}
BOND_TABLE = {2: (0.05, 0.0, 0.0), 3: (0.08, 0.08, 0.0),
              4: (0.12, 0.12, 0.05), 5: (0.15, 0.15, 0.10)}
# 兵种克制：步兵→骑兵→弓兵→方士→步兵（克制方伤害+12%，被克方-8%）
TROOP_COUNTER = {'步兵': '骑兵', '骑兵': '弓兵', '弓兵': '方士', '方士': '步兵'}
YELLOW = {'张角', '张宝', '张梁', '张燕', '管亥', '张勋', '桥蕤', '程远志', '邓茂', '高升', '裴元绍'}
HEBEI = {'颜良', '文丑', '袁绍'}
FEMALE = {'孙尚香', '大乔', '小乔', '孙鲁班', '甄姬', '貂蝉', '祝融夫人', '鲍三娘',
          '马云禄', '蔡文姬', '黄月英', '张春华', '王异', '卞夫人', '吴国太'}

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = os.path.join(HERE, '三国将星录_武将数据表_单机版.xlsx')


# ---------------------------------------------------------------- 数据读取
def load_data(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    H = list(wb['武将总表'].iter_rows(values_only=True))
    hdr = H[0]
    idx = {h: i for i, h in enumerate(hdr)}
    records = []
    for row in H[1:]:
        rec = {k: row[i] for k, i in idx.items()}
        records.append(rec)
    skills = defaultdict(dict)
    for s in list(wb['技能库'].iter_rows(values_only=True))[1:]:
        seq, name, faction, rarity, sname, stype, main, sub, mult, desc, cd = s
        skills[name][stype] = {
            'name': sname, 'type': stype, 'main': main, 'sub': sub,
            'mult': mult, 'desc': desc, 'cd': cd,
        }
    talents = defaultdict(list)
    for t in list(wb['天赋库'].iter_rows(values_only=True))[1:]:
        seq, name, faction, rarity, tname, cond, desc = t
        talents[name].append({'name': tname, 'cond': cond, 'desc': desc})
    bonds = set()
    for b in list(wb['羁绊'].iter_rows(values_only=True))[1:]:
        seq, a, c, bname, eff, note = b
        bonds.add(frozenset((a, c)))
    return records, skills, talents, bonds


# ---------------------------------------------------------------- 文本解析
DMG_RE = re.compile(r'造成(?:一次|3段共|3段|一段)?(\d+)%')
MULTI_RE = re.compile(r'(\d+)次[^。；]*?每次(\d+)%')
BUFF_RE = re.compile(r'(攻击|防御|暴击率|暴击伤害|速度|效果命中|效果抵抗|效果抗性|控制命中|减伤|受到伤害|治疗效果|兵力上限|策略伤害|全属性)([+＋\-－])(\d+(?:\.\d+)?)%')
SHIELD_RE = re.compile(r'护盾（(?:等同)?(统御|威仪|智谋)×(\d+(?:\.\d+)?)）')
HEAL_RE = re.compile(r'回复(\d+(?:\.\d+)?)%(?:兵力)?(?!效果)')
HEAL_STAT_RE = re.compile(r'回复兵力（(智谋|威仪|统御)×(\d+(?:\.\d+)?)）')
RAGE_RE = re.compile(r'怒气([+＋\-－])(\d+)')


def parse_target(desc):
    if '敌方全体' in desc:
        return ('enemy_all', 0)
    if '敌方前排' in desc:
        return ('enemy_front', 0)
    if '敌方后排' in desc:
        return ('enemy_back', 0)
    m = re.search(r'随机(\d+)名敌人', desc)
    if m:
        return ('enemy_random', int(m.group(1)))
    if '我方全体' in desc:
        return ('ally_all', 0)
    if '我方兵力最低' in desc:
        return ('ally_lowest', 0)
    if '随机一名友军' in desc or '随机友军' in desc:
        return ('ally_random', 0)
    if '自身' in desc:
        return ('self', 0)
    return ('enemy_single', 0)


def side_at(desc, pos):
    start = max(desc.rfind('；', 0, pos), desc.rfind('。', 0, pos), desc.rfind('，', 0, pos), desc.rfind('、', 0, pos)) + 1
    clause = desc[start:pos]
    cands = [(clause.find('我方'), 0, 'ally'), (clause.find('敌方'), 1, 'enemy'), (clause.find('自身'), 2, 'self')]
    cands = [x for x in cands if x[0] >= 0]
    if cands:
        return min(cands, key=lambda x: x[0])[2]
    return nearest_side(desc, pos)


def parse_damage_target(desc):
    if '敌方全体' in desc:
        return ('enemy_all', 0)
    if '敌方前排' in desc:
        return ('enemy_front', 0)
    if '敌方后排' in desc:
        return ('enemy_back', 0)
    m = re.search(r'随机(\d+)名敌人', desc)
    if m:
        return ('enemy_random', int(m.group(1)))
    return ('enemy_single', 0)


def parse_heal_target(desc):
    if '兵力最低' in desc:
        return ('ally_lowest', 0)
    if '我方全体' in desc:
        return ('ally_all', 0)
    if '随机一名友军' in desc or '随机友军' in desc:
        return ('ally_random', 0)
    if '自身' in desc and '我方' not in desc:
        return ('self', 0)
    return ('ally_all', 0)


def nearest_side(desc, pos):
    cands = [('ally', desc.rfind('我方', 0, pos)),
             ('enemy', desc.rfind('敌方', 0, pos)),
             ('self', desc.rfind('自身', 0, pos))]
    side, at = max(cands, key=lambda x: x[1])
    return side if at >= 0 else 'ally'


def parse_effect(skill):
    desc = skill['desc'] or ''
    mult = skill['mult']
    eff = {
        'damage': None, 'target': parse_damage_target(desc),
        'heal_target': parse_heal_target(desc),
        'heal': None, 'heal_stat': None, 'buffs': [], 'control': [],
        'shield': None, 'rage': None, 'raw': desc,
        'dispel': None, 'summon': None, 'true_pct': 0.0, 'extra_action': False,
        'hits': 1,
    }
    # 伤害
    if mult and str(mult) != '—':
        try:
            eff['damage'] = float(str(mult).replace('%', '')) / 100.0
        except ValueError:
            eff['damage'] = None
    if eff['damage'] is None:
        m = DMG_RE.search(desc)
        if m:
            eff['damage'] = int(m.group(1)) / 100.0
    # “N 次，每次 X%”：X% 是每次伤害，N 次分散结算；不能把总倍数套到每个目标
    mh = MULTI_RE.search(desc)
    if mh:
        eff['hits'] = max(1, int(mh.group(1)))
        eff['damage'] = float(mh.group(2)) / 100.0
    # 伤害类型
    if '策略' in desc:
        eff['dtype'] = 'strategy'
    elif '混合' in desc:
        eff['dtype'] = 'mixed'
    else:
        eff['dtype'] = 'physical'
    # 治疗
    m = HEAL_RE.search(desc)
    if m:
        eff['heal'] = float(m.group(1)) / 100.0
    m = HEAL_STAT_RE.search(desc)
    if m:
        eff['heal_stat'] = (m.group(1), float(m.group(2)))
    # 护盾
    m = SHIELD_RE.search(desc)
    if m:
        eff['shield'] = (m.group(1), float(m.group(2)))
    # 怒气
    m = RAGE_RE.search(desc)
    if m:
        eff['rage'] = int(m.group(2)) * (1 if m.group(1) in '+＋' else -1)
    # 增益/减益
    turns = 2
    m = re.search(r'持续(\d+)回合', desc)
    if m:
        turns = int(m.group(1))
    for m in BUFF_RE.finditer(desc):
        stat = m.group(1)
        sign = 1 if m.group(2) in '+＋' else -1
        val = float(m.group(3)) / 100.0 * sign
        side = side_at(desc, m.start())
        enemy_side = side == 'enemy'
        target_self = side == 'self'
        eff['buffs'].append((stat, val, turns, enemy_side, target_self))
    # 驱散
    m = re.search(r'驱散(\d+)个', desc)
    if m:
        eff['dispel'] = int(m.group(1))
    # 真实伤害
    m = re.search(r'已损失兵力的(\d+)%', desc)
    if m:
        eff['true_pct'] = int(m.group(1)) / 100.0
    # 召唤（兼容“召唤2个/一名……（40%属性……），持续N回合/可持续N回合”）
    m = re.search(r'召唤([一二三四五六七八九十\d]+)\s*[名个]?[^（(]*[（(][^）)]*?(\d+)%属性[^）)]*?[）)]', desc)
    if m:
        cn = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5}
        cnt = int(m.group(1)) if m.group(1).isdigit() else cn.get(m.group(1), 1)
        dm = re.search(r'持续\s*(\d+)\s*回合', desc[m.end():]) or re.search(r'持续\s*(\d+)\s*回合', desc)
        eff['summon'] = (cnt, int(m.group(2)) / 100.0, int(dm.group(1)) if dm else 3)
    if '额外行动' in desc:
        eff['extra_action'] = True
    # 控制
    for kind in ['眩晕', '沉默', '虚弱', '灼烧', '剧毒', '雷印', '混乱', '嘲讽', '恐惧', '魅惑']:
        if kind in desc:
            m = re.search(kind + r'(\d+)回合', desc)
            t = int(m.group(1)) if m else 1
            pos = desc.find(kind)
            enemy_side = side_at(desc, pos) == 'enemy'
            if not enemy_side and eff['damage'] and '我方' not in desc[:pos]:
                enemy_side = True
            if kind in ('灼烧', '剧毒', '雷印'):
                m2 = re.search(r'(?:附加|施加|叠加)?(\d+)层' + kind, desc)
                if not m2:
                    m2 = re.search(kind + r'(\d+)层', desc)
                stacks = int(m2.group(1)) if m2 else 1
                eff['control'].append((kind, stacks, turns, enemy_side))
            else:
                eff['control'].append((kind, t, enemy_side))
    return eff


def parse_static_buffs(text, skip_team=False):
    """提取静态数值。skip_team=True 时跳过同一句里带“我方”主体的数值，
    这部分交给 _parse_signature 作为团队光环处理，避免重复计成自身属性。"""
    out = []
    for m in re.finditer(r'(全属性|攻击|暴击率|暴击伤害|兵力上限|受到伤害|治疗效果|策略伤害|效果命中|效果抗性|控制命中|速度|吸血比例|吸血|护盾值|护盾效果|闪避率|闪避|无视防御|命中率)([+＋\-－])(\d+(?:\.\d+)?)%', text):
        if skip_team:
            head = re.split(r'[；;。]', text[:m.start()])[-1]
            if '我方' in head:
                continue
        stat = m.group(1)
        if stat in ('吸血比例',):
            stat = '吸血'
        elif stat in ('护盾值', '护盾效果'):
            stat = '护盾'
        elif stat in ('闪避率', '闪避'):
            stat = '闪避'
        elif stat == '命中率':
            stat = '效果命中'
        sign = 1 if m.group(2) in '+＋' else -1
        out.append((stat, float(m.group(3)) / 100.0 * sign))
    return out


# ---------------------------------------------------------------- 机制天赋
# 名字 -> 需要的数值个数；数值从效果描述里按顺序取
MECH = {
    '破阵之势': 1, '乘胜追击': 2, '背水一战': 1, '斩弱': 1, '反击之势': 2,
    '先声夺人': 1, '血勇': 1, '致命一击': 1,
    '铁壁': 2, '坚守': 1, '护盾': 1, '反震': 1, '抗暴': 1, '死守': 1,
    '运筹': 1, '奇正相生': 1, '乘隙': 1, '策略追击': 1, '抗压': 1, '破虚': 1,
    '号令': 1, '鼓舞': 1, '督战': 1, '军心': 1, '同袍': 1,
    '回春': 1, '悬壶': 1, '护佑': 1, '仁心': 1, '庇护': 1, '净化': 1,
    '凯旋': 1, '不屈': 0, '蓄势': 1, '疾行': 1, '连破': 0, '锐气': 1,
}
TEAM_MECH = {'督战', '军心', '仁心', '号令', '同袍', '运筹', '悬壶', '庇护', '策略追击'}
COND_WORDS = ['时', '后', '每', '若', '低于', '高于', '首次', '阵亡', '击杀', '开战', '期间', '回合开始', '回合结束']
# 团队属性光环词条 -> 字段名（长词在前，避免“攻击力”被“攻击”截断）
TEAM_AURA_STATS = (
    ('效果抗性', 'control_resist'), ('效果抵抗', 'control_resist'), ('效果命中', 'effect_hit'),
    ('策略伤害', 'strategy'), ('暴击率', 'crit'), ('攻击力', 'atk'),
    ('攻击', 'atk'), ('速度', 'speed'), ('闪避', 'dodge'), ('命中', 'effect_hit'),
)
TEAM_AURA_MAP = dict(TEAM_AURA_STATS)
TEAM_AURA_RE = re.compile(r'(效果抗性|效果抵抗|效果命中|策略伤害|暴击率|攻击力|攻击|速度|闪避|命中)[＋+]\s*(\d+(?:\.\d+)?)%')
TEAM_AURA_FIELDS = {
    'atk': 'team_atk', 'speed': 'team_speed', 'crit': 'team_crit',
    'strategy': 'team_strategy_dmg', 'dodge': 'team_dodge_aura',
    'effect_hit': 'team_effect_hit_aura', 'control_resist': 'team_control_resist',
}
# 明细事件开关：默认关闭，不影响正式战斗；分析工具可置 True 记录控制/负面/DoT 施加事件。
EMIT_DETAIL_EVENTS = False


# ---------------------------------------------------------------- 单位
# 2026-11-21 平衡补丁：单将全六维缩放（正式版与模拟器共用，倍率可回退）。
# 2026-11-24 P2 调参：两档同向离群 16 人，缩放 + 技能/天赋文本同步调整。
# 只缩放当期属性，不改一级基础属性 stats0（伤害公式固定系数）与卡面/战力数据。
BALANCE_SCALE = {
    '曹丕': 0.82, '羊祜': 0.68, '公孙瓒': 0.85, '贺齐': 0.85, '朱灵': 0.68,
    '马谡': 0.87, '胡车儿': 0.75, '程普': 0.88, '鲁肃': 0.89, '吴懿': 0.90, '曹休': 0.90,
    '逢纪': 1.16, '关兴': 1.11, '步骘': 1.10, '张允': 1.10, '关平': 1.09,
    '郭嘉': 1.08, '曹真': 1.08, '董袭': 1.25, '朱儁': 1.07, '沙摩柯': 1.07,
    '姜维': 1.05, '牛辅': 1.05, '木鹿大王': 1.05, '王凌': 1.06,
    '张翼': 0.80, '夏侯渊': 0.84, '马超': 0.76, '樊稠': 0.80,
    '张昭': 0.90, '蒋琬': 0.80, '吕范': 1.20, '朱桓': 0.72,
    '董卓': 0.75, '薛综': 1.05, '丁奉': 1.18, '诸葛瞻': 0.65, '虞翻': 1.10,
}


class Unit:
    def __init__(self, rec, skills, talents, level=None):
        level = LEVEL if level is None else level
        self.name = rec['姓名']
        self.faction = rec['阵营']
        self.rarity = rec['稀有度']
        self.role = rec['定位']
        self.troop = rec['兵种']
        self.level = level
        self.stats = {}
        mult = (1 + 0.08 * BT) * (1 + 0.05 * AW) * (1 + 0.15 * EQUIP)
        for k in SIX:
            base = rec.get(k, 0) or 0
            growth = rec.get(k + '成长', 0) or 0
            self.stats[k] = (base + growth * (level - 1)) * mult
        scale = BALANCE_SCALE.get(self.name)
        if scale and scale != 1.0:
            for k in SIX:
                self.stats[k] *= scale
        self.skills = {k: dict(v) for k, v in skills.items()}
        self.stats0 = {k: (rec.get(k, 0) or 0) for k in SIX}   # 一级基础属性，用于伤害公式的固定系数
        self.talent_texts = list(talents)
        self.perm = defaultdict(float)
        self.flags = {}
        self.team_flags = defaultdict(list)
        self.buffs = []
        self.status = defaultdict(int)
        self.dots = {}
        self.shield = 0.0
        self.chain = None            # 庞统 连环：{'turns': n, 'no_decay': bool}
        self.in_deathmatch = False   # 文丑 死斗
        self.rage = 20.0             # 初始怒气（约 1/5 槽）
        self.cd = {'奇谋': 0}
        self.alive = True
        self.side = 0
        self.row = 'front'
        self.next_time = 0.0
        self.extra_action = False
        self.unyielding_used = False
        self.unsupported = []
        self.is_summon = False
        self.summoner = None
        self.duration = None
        self.immune_control = False
        self.survive_lethal = 0
        self.used_survive = False
        self.backline_bonus = 0.0
        self.multi_hit_bonus = 0.0
        self.per_status = None
        self.kill_damage = None
        self.kill_heal = None
        self.kill_permanent = None
        self.kill_crit = False
        self.extra_action_on_kill = False
        self.first_round_bonus = 0.0
        self.low_hp = None
        self.high_hp = None
        self.crit_reduce = 0.0
        self.round_end_damage = None
        self.round_start_shield = None
        self.round_start_heal = None
        self.round_start_rage = None
        self.round_start_dispel = 0
        self.rage_zero = 0.0
        self.ally_dr = 0.0
        self.death_damage = 0.0
        self.death_team_atk = 0.0
        self.team_survive = False
        self.free_skill = False
        self.cd_rage = False
        self.buff_dur = 0
        self.buff_boost = 0.0
        self.dot_dur = 0
        self.summon_boost = None
        self.taunt_source = None
        self.forced_crit = 0
        # ---- 2026-11-19 天赋补齐新增字段
        self.shield_boost = 0.0
        self.team_shield_aura = 0.0
        self.heal_boost = 0.0
        self.control_resist = 0.0
        self.control_dur_plus = 0
        self.control_dur_reduce = 0
        self.random_control_dur = 0
        self.on_dodge_counter = 0.0
        self.on_dodge_heal = 0.0
        self.shield_break_heal = 0.0
        self.ally_death_action_faction = None
        self.enemy_death_allstats = 0.0
        self.immune_control_once = False
        self.after_skill_extra = False
        self.ignore_row_first = False
        self.first_round_chase = 0.0
        self.chase_bonus = 0.0
        self.charge_bonus = 0.0
        self.ambush_bonus = 0.0
        self.chain_bonus = 0.0
        self.mixed_pen = 0.0
        self.single_pen = 0.0
        self.multi_segment_plus = False
        self.consecutive_pen = 0.0
        self.dmg_vs_status = None
        self.dmg_vs_role = None
        self.dmg_vs_low = None
        self.dmg_vs_full = None
        self.armor_break_bonus = 0.0
        self.slow_strategy_vuln = 0.0
        self.burn_dot_bonus = 0.0
        self.regen_lowest = 0.0
        self.lowest_hot = None
        self.taunt_dr = 0.0
        self.copy_power = 0.0
        self.transfer_no_decay = False
        self.transfer_slow = 0.0
        self.self_damage_bonus = 0.0
        self.deathmatch_bonus = 0.0
        self.team_taunt_rage = 0.0
        self.main_low_atk = None
        self.team_faction_dr = None
        self.team_troop_dr = None
        self.backline_vuln = 0.0
        self.team_rage_start = 0.0
        self.team_dr_first5 = 0.0
        self.team_effect_resist = 0.0
        self.duo_with = None
        self.duo_crit = 0.0
        self.dot_stack_max = 0
        self.dot_crit = False
        self.dot_spread = 0.0
        self.team_dot_reduce = 0.0
        self.crit_vs_leiyin = False
        self.lei_stack_max = 0
        self.friendly_fire_bonus = 0.0
        self.kill_atk = 0.0
        self.first_attack_crit = False
        self.lost_hp_atk = 0.0
        self.resist_refund = 0.0
        # ---- 2026-11-20 特色/被动接入
        self.team_dr = 0.0
        self.team_dr_phys = 0.0
        self.team_dr_strat = 0.0
        self.team_dr_shield = 0.0
        self.team_dr_disadvantage = 0.0
        self.lowest_dr = 0.0
        self.self_dr = 0.0
        self.dr_ramp = None          # (每次受击加成, 上限)
        self.dr_low_hp = 0.0         # 每损失10%兵力的减伤
        self.hit_dr_stacks = 0
        self.team_heal_out = 0.0
        self.team_heal_in = 0.0
        self.team_regen = 0.0
        self.self_regen = 0.0
        self.team_rage_round = 0
        self.team_rage_gain = 0.0
        self.team_effect_hit_aura = 0.0
        self.team_dodge_aura = 0.0
        self.team_dodge_cavalry = 0.0
        self.team_atk = 0.0
        self.team_speed = 0.0
        self.team_crit = 0.0
        self.team_strategy_dmg = 0.0
        # 带兵种/阵营/性别/远程限制的团队光环：[{stat, value, cond}]
        self.team_rules = []
        self.team_debuff_vuln = 0.0
        self.dmg_vs_high = None
        self.enemy_effect_hit_down = 0.0
        self.enemy_rage_round = 0
        self.enemy_stat_wei = 0.0
        self.start_aoe = None       # (倍率, 降攻, 回合)
        self.team_backline_bonus = 0.0
        self.team_low_bonus = None   # (血量阈值%, 增伤)
        self.team_armor_break_bonus = 0.0
        self.team_control_bonus = 0.0
        self.team_first_round_bonus = 0.0
        self.team_first_attack_crit = False
        self.team_ignores_weak = False
        self.team_strat_ramp = None  # (每回合, 上限)
        self.team_burn_bonus = 0.0
        self.team_chain_bonus = 0.0
        self.team_multiseg = 0.0
        self.team_control_resist = 0.0
        self.round_start_confuse = 0.0
        self.control_immune_extra = set()
        self.first_round_untargetable = False
        self.first_round_dodge = 0.0
        self.first_round_speed = 0.0
        self.on_hit_weaken = None    # (概率, 降攻)
        self.untargetable = 0
        self.first_attack_pen = 0.0
        self.first_round_pen = 0.0
        self.backline_pen = 0.0
        self.extra_hit = None        # (概率, 倍率)
        self.basic_stun = None       # (概率, 回合)
        self.extra_action_chance = 0.0
        self.extra_action_used_round = -1
        self.kill_advance = 0.0
        self.death_dot = None        # (持续伤害类型, 层数)
        self.death_rage = 0
        self.death_summon = None
        self.low_hp_lifesteal = None # (血量阈值%, 吸血)
        self.counter_ramp = None     # (每次受击, 上限)
        self.counter_stacks = 0
        self.consecutive_bonus = None  # (每段, 上限)
        self.consecutive_stacks = 0
        self.per_debuff_bonus = 0.0
        self.ally_death_strike = 0.0
        self.team_revive = None      # 复活比例，触发后置 0
        self.start_summon = None
        # ---- 2026-11-20 剩余特色补完
        self.team_wei_per_ally = 0.0
        self.team_lost_wei = None      # (每损失比例, 加成, 上限)
        self.ally_death_heal = 0.0
        self.ally_death_heal_used = False
        self.start_confuse = None      # (回合, 易伤)
        self.basic_multi = None        # (段数, 每段倍率, 首段暴击)
        self.round_random_buff = None
        self.bodyguard = False
        self.bodyguard_heal = 0.0
        self.bodyguard_used = False
        self.start_stat_boost = 0.0
        self.start_faction_boost = 0.0
        self.start_invuln = None       # (回合, 全体回复)
        self.invuln_rounds = 0
        self.start_ban = None          # (敌阵营, 我阵营, 全属性, 否则减伤)
        self.ally_death_allstats = None  # (势力, 每名, 上限)
        self._ally_death_gain = 0.0
        self.hit_atk_ramp = None       # (每层, 上限)
        self.hit_atk_stacks = 0
        self.death_team_allstats = None  # (加成, 是否免死)
        self.first_rounds_atk = None   # (回合, 加成)
        self.first_rounds_speed = None
        self.duo_allstats = None       # (队友名, 加成)
        self.poison_heal_reduce = 0.0
        self.burn_rage = 0
        self.enemy_burn_vuln = None    # (层数, 增伤)
        self.team_wu_female_atk = 0.0
        self.crit_rage = 0
        self.round_allstats_ramp = None  # (每回合, 上限)
        self.round_ramp_stacks = 0
        self.main_death_atk = 0.0
        self.team_counter_dr = 0.0
        self.team_aoe_bonus = 0.0
        self.per_summon_strat = 0.0
        self.summon_death_aoe = 0.0
        self.team_bonus_vs = None      # (名字集合, 加成)
        self.team_troop_vs = None      # ((攻方兵种, 守方兵种), 加成)
        self.per_named_atk = None      # (名字集合, 每人加成)
        self.first_round_used = False
        self.last_target = None
        self.hots = []
        self.slow_count = 0
        self._parse_talents()
        self._finalize()

    # ---- 天赋
    def _parse_talents(self):
        for t in self.talent_texts:
            name = t['name']
            text = t['desc'] or ''
            if name in MECH:
                nums = [float(x) for x in re.findall(r'(\d+(?:\.\d+)?)', text)]
                self.flags[name] = nums
                if name in TEAM_MECH:
                    self.team_flags[name].append(nums)
                continue
            # 非机制天赋：只取无条件静态数值
            if any(w in text for w in COND_WORDS):
                if not self._parse_special_talent(text):
                    self.unsupported.append(name)
                continue
            applied = False
            for stat, val in parse_static_buffs(text, skip_team=True):
                self._add_perm(stat, val)
                applied = True
            if '我方' in text and self._parse_signature(text):
                applied = True
            if not applied and self._parse_special_talent(text):
                applied = True
            if not applied:
                self.unsupported.append(name)
        # 被动/特色：无条件静态数值 + 条件/团队光环
        for typ in ('被动', '特色'):
            sk = self.skills.get(typ)
            if not sk:
                continue
            text = sk['desc'] or ''
            if not any(w in text for w in COND_WORDS):
                for stat, val in parse_static_buffs(text, skip_team=True):
                    self._add_perm(stat, val)
            self._parse_signature(text)

    def _parse_special_talent(self, text):
        fields = ['kill_damage','round_end_damage','round_start_shield','round_start_heal','round_start_rage','rage_zero','ally_dr','low_hp','high_hp','crit_reduce','first_round_bonus','kill_permanent','multi_hit_bonus','backline_bonus','per_status','survive_lethal','kill_heal','kill_crit','extra_action_on_kill','cd_rage','free_skill','death_damage','death_team_atk','team_survive','buff_dur','buff_boost','dot_dur','summon_boost','immune_control',
                  'shield_break_heal','lowest_hot','lost_hp_atk','resist_refund','on_dodge_counter','team_faction_dr','taunt_dr','shield_boost','armor_break_bonus','first_attack_crit','dmg_vs_low','ally_death_action_faction','dot_crit','mixed_pen','copy_power','low_hp','extra_action_on_kill','heal_boost','dmg_vs_status','team_taunt_rage','ignore_row_first','dot_stack_max','dmg_vs_role','control_dur_reduce','regen_lowest','main_low_atk','burn_dot_bonus','team_effect_resist','team_dr_first5','after_skill_extra','ambush_bonus','dot_spread','first_round_chase','chain_bonus','consecutive_pen','transfer_slow','self_damage_bonus','multi_segment_plus','single_pen','on_dodge_heal','random_control_dur','lei_stack_max','crit_vs_leiyin','transfer_no_decay','control_dur_plus','friendly_fire_bonus','enemy_death_allstats','immune_control_once','team_rage_start','charge_bonus','team_dot_reduce','deathmatch_bonus','duo_with','duo_crit','dmg_vs_full','kill_atk','team_troop_dr','backline_vuln','control_resist','slow_strategy_vuln','chase_bonus']
        before = {k: getattr(self, k) for k in fields}
        before_perm = dict(self.perm)
        m = re.search(r'击杀敌人后本回合伤害[+＋](\d+)%且行动条推进(\d+)%', text)
        if m: self.kill_damage = (int(m.group(1)), int(m.group(2)))
        m = re.search(r'每回合结束[，,]?对随机(\d+)名敌人追加一次(\d+)%', text)
        if m: self.round_end_damage = (int(m.group(1)), int(m.group(2)))
        m = re.search(r'每回合开始[，,]?为全体附加护盾（威仪×(\d+(?:\.\d+)?)）', text)
        if m: self.round_start_shield = float(m.group(1))
        m = re.search(r'每回合开始，我方全体回复(\d+)%兵力并驱散(\d+)个', text)
        if m: self.round_start_heal = (int(m.group(1)), int(m.group(2)))
        m = re.search(r'每回合开始，全体怒气[+＋](\d+)', text)
        if m: self.round_start_rage = int(m.group(1))
        m = re.search(r'每回合开始有(\d+)%概率使敌方怒气最高者怒气清零', text)
        if m: self.rage_zero = int(m.group(1)) / 100.0
        m = re.search(r'每回合开始，随机一名友军获得1层护驾（减伤(\d+)%', text)
        if m: self.ally_dr = int(m.group(1)) / 100.0
        m = re.search(r'兵力低于(\d+)%时[，,]?[^，。；]*(攻击|防御|暴击率|闪避率|闪避|全属性)[+＋](\d+)%', text)
        if m:
            kind = '闪避' if m.group(2) == '闪避率' else m.group(2)
            self.low_hp = (int(m.group(1)), kind, int(m.group(3)))
        m = re.search(r'兵力高于(\d+)%时[，,]?[^，。；]*攻击[+＋](\d+)%', text)
        if m: self.high_hp = (int(m.group(1)), int(m.group(2)))
        m = re.search(r'受到暴击时[，,]?减免其中(\d+)%', text)
        if m: self.crit_reduce = int(m.group(1)) / 100.0
        m = re.search(r'(?:开战)?首回合伤害[+＋](\d+)%', text)
        if m: self.first_round_bonus = int(m.group(1)) / 100.0
        m = re.search(r'每次击杀后[，,]?攻击永久[+＋](\d+)%[，,]?最多叠加(\d+)次', text)
        if m: self.kill_permanent = (int(m.group(1)), int(m.group(2)))
        m = re.search(r'多段(?:攻击|射击)的?每段伤害[+＋](\d+)%', text)
        if m: self.multi_hit_bonus = int(m.group(1)) / 100.0
        m = re.search(r'对后排(?:目标)?伤害[+＋](\d+)%', text)
        if m: self.backline_bonus = int(m.group(1)) / 100.0
        m = re.search(r'每有一名敌人处于([^，。；]+)[，,]?我方全体策略伤害[+＋](\d+)%', text)
        if m: self.per_status = (m.group(1), int(m.group(2)) / 100.0)
        m = re.search(r'首次受到致命伤害时保留1点兵力', text)
        if m: self.survive_lethal = max(self.survive_lethal, 0.01)
        m = re.search(r'兵力归零时保留1点并回复(\d+)%兵力', text)
        if m: self.survive_lethal = max(self.survive_lethal, int(m.group(1)) / 100.0)
        m = re.search(r'击杀敌人后[，,]?回复自身(\d+)%兵力并驱散(\d+)个', text)
        if m: self.kill_heal = (int(m.group(1)), int(m.group(2)))
        if '击杀敌人后，本回合内所有攻击必定暴击' in text:
            self.kill_crit = True
        if '每击败一名敌人，本回合行动次数' in text:
            self.extra_action_on_kill = True
        if '战法冷却-1回合，且开战时立即充满怒气' in text:
            self.cd_rage = True
        if '每回合首次释放战法不消耗怒气' in text:
            self.free_skill = True
        m = re.search(r'阵亡时对敌方全体造成(\d+)%', text)
        if m: self.death_damage = int(m.group(1)) / 100.0
        m = re.search(r'(?:[^，。；]{1,8})?阵亡后?[，,]?我方全体攻击永久[+＋](\d+)%', text)
        if m: self.death_team_atk = int(m.group(1)) / 100.0
        if '我方全体首次受到致命伤害时保留1点兵力' in text:
            self.team_survive = True
        m = re.search(r'增益持续时间[+＋](\d+)回合', text)
        if m: self.buff_dur = int(m.group(1))
        m = re.search(r'战法的增益效果与持续时间[+＋](\d+)%', text)
        if m: self.buff_boost = int(m.group(1)) / 100.0
        m = re.search(r'持续伤害的持续时间[+＋](\d+)回合', text)
        if m: self.dot_dur = int(m.group(1))
        m = re.search(r'召唤物属性提升至(\d+)%[，,]?持续时间[+＋](\d+)回合', text)
        if m: self.summon_boost = (int(m.group(1)) / 100.0, int(m.group(2)))
        if '兵力低于25%时免疫一次致命伤害' in text or '以分身替死' in text:
            self.survive_lethal = max(self.survive_lethal, 0.01)
        if '免疫控制' in text:
            self.immune_control = True
        # ---- 2026-11-19 补齐的 80 条天赋
        if '对已被控制的敌人造成伤害' in text:
            m = re.search(r'造成伤害[+＋](\d+)%', text)
            self.dmg_vs_status = ('controlled', int(m.group(1)) / 100.0 if m else 0.2)
        if '护盾破碎时' in text:
            m = re.search(r'回复(\d+)%兵力', text)
            self.shield_break_heal = int(m.group(1)) / 100.0 if m else 0.1
        if '我方兵力最低者获得持续回复' in text:
            m = re.search(r'每回合(\d+)%[，,]?持续(\d+)回合', text)
            self.lowest_hot = (int(m.group(1)), int(m.group(2))) if m else (5, 3)
        if '每损失' in text and '攻击' in text:
            m = re.search(r'每损失(\d+)%兵力[，,]?攻击[+＋](\d+)%', text)
            if m: self.lost_hp_atk = (int(m.group(1)), int(m.group(2)))
        if '被抵抗时返还' in text:
            m = re.search(r'返还(\d+)%怒气', text)
            self.resist_refund = int(m.group(1)) / 100.0 if m else 0.5
        if '施加负面效果的命中率' in text:
            m = re.search(r'命中率[+＋](\d+)%', text)
            if m: self.perm['effect_hit'] += int(m.group(1)) / 100.0
        if '策略技能的命中率' in text:
            m = re.search(r'命中率[+＋](\d+)%', text)
            if m: self.perm['effect_hit'] += int(m.group(1)) / 100.0
        if '闪避成功后立即反击一次' in text:
            m = re.search(r'反击一次(\d+)%伤害', text)
            self.on_dodge_counter = int(m.group(1)) / 100.0 if m else 0.8
        if '我方魏将受到的伤害' in text:
            m = re.search(r'受到的伤害-(\d+)%', text)
            self.team_faction_dr = ('魏', int(m.group(1)) / 100.0 if m else 0.08)
        if '嘲讽状态下受到的伤害额外' in text:
            m = re.search(r'额外-(\d+)%', text)
            self.taunt_dr = int(m.group(1)) / 100.0 if m else 0.2
        if '护盾值' in text and '护盾值+' in text.replace('＋', '+'):
            m = re.search(r'护盾值[+＋](\d+)%', text)
            if m: self.shield_boost += int(m.group(1)) / 100.0
        if '对护甲低于' in text:
            m = re.search(r'目标伤害[+＋](\d+)%', text)
            self.armor_break_bonus = int(m.group(1)) / 100.0 if m else 0.18
        if '对破甲目标伤害' in text:
            m = re.search(r'对破甲目标伤害[+＋](\d+)%', text)
            if m: self.armor_break_bonus += int(m.group(1)) / 100.0
        if '每回合首次攻击必定暴击' in text:
            self.first_attack_crit = True
        if '对兵力低于' in text and '目标伤害' in text:
            m = re.search(r'兵力低于(\d+)%的目标伤害[+＋](\d+)%', text)
            self.dmg_vs_low = (int(m.group(1)), int(m.group(2)) / 100.0)
        if '我方蜀将阵亡时' in text and '额外行动' in text:
            self.ally_death_action_faction = '蜀'
        if '持续伤害可暴击' in text:
            self.dot_crit = True
        if '混合伤害无视目标' in text:
            m = re.search(r'无视目标(\d+)%抗性', text)
            self.mixed_pen = int(m.group(1)) / 100.0 if m else 0.1
        if '复制战法的威力提升至' in text:
            m = re.search(r'提升至(\d+)%', text)
            self.copy_power = int(m.group(1)) / 100.0 if m else 1.0
        if '治疗与护盾效果' in text:
            m = re.search(r'效果[+＋](\d+)%', text)
            v = int(m.group(1)) / 100.0 if m else 0.25
            self.heal_boost += v
            self.shield_boost += v
        if '每回合开始，全体怒气' in text and '兵力回复' in text:
            m = re.search(r'全体怒气[+＋](\d+)[，,]?兵力回复(\d+)%', text)
            if m:
                self.round_start_rage = int(m.group(1))
                self.round_start_heal = (int(m.group(2)), 0)
        if '对恐惧目标伤害' in text:
            m = re.search(r'对恐惧目标伤害[+＋](\d+)%', text)
            self.dmg_vs_status = ('恐惧', int(m.group(1)) / 100.0 if m else 0.3)
        if '敌方被嘲讽时' in text:
            m = re.search(r'怒气[+＋](\d+)', text)
            self.team_taunt_rage = int(m.group(1)) if m else 8
        if '传递伤害不衰减' in text:
            self.transfer_no_decay = True
        if '开战首回合可无视站位' in text:
            self.ignore_row_first = True
        if '剧毒层数上限' in text:
            m = re.search(r'上限[+＋](\d+)', text)
            self.dot_stack_max = 6 + (int(m.group(1)) if m else 2)
        if '对治疗型目标伤害' in text:
            m = re.search(r'对治疗型目标伤害[+＋](\d+)%', text)
            self.dmg_vs_role = ('医者', int(m.group(1)) / 100.0 if m else 0.25)
        if '受到的控制效果持续回合-' in text:
            m = re.search(r'持续回合-(\d+)', text)
            self.control_dur_reduce = int(m.group(1)) if m else 1
        if '我方兵力最低者每回合额外回复' in text:
            m = re.search(r'额外回复(\d+)%', text)
            self.regen_lowest = int(m.group(1)) if m else 5
        if '我方主将兵力低于' in text and '攻击' in text:
            m = re.search(r'低于(\d+)%时[，,]?[^，。]*攻击[+＋](\d+)%', text)
            self.main_low_atk = (int(m.group(1)), int(m.group(2))) if m else (50, 25)
        if '灼烧伤害' in text:
            m = re.search(r'灼烧伤害[+＋](\d+)%', text)
            if m: self.burn_dot_bonus = int(m.group(1)) / 100.0
        if '我方全体效果抵抗' in text:
            m = re.search(r'效果抵抗[+＋](\d+)%', text)
            self.team_effect_resist = int(m.group(1)) / 100.0 if m else 0.2
        if '战斗前' in text and '我方全体减伤' in text:
            m = re.search(r'战斗前(\d+)回合[，,]?我方全体减伤[+＋](\d+)%', text)
            if m: self.team_dr_first5 = (int(m.group(1)), int(m.group(2)) / 100.0)
        if '每次释放战法后立即获得一次额外行动' in text:
            self.after_skill_extra = True
        if '偷袭类伤害' in text:
            m = re.search(r'偷袭类伤害[+＋](\d+)%', text)
            self.ambush_bonus = int(m.group(1)) / 100.0 if m else 0.25
        if '持续伤害可叠加至' in text:
            m = re.search(r'叠加至(\d+)层', text)
            self.dot_stack_max = max(self.dot_stack_max, int(m.group(1)) if m else 6)
        if '灼烧传递概率' in text:
            m = re.search(r'传递概率[+＋](\d+)%', text)
            self.dot_spread = int(m.group(1)) / 100.0 if m else 0.4
        if '首回合必定触发一次追击' in text:
            self.first_round_chase = 0.8
        if '连射概率' in text:
            m = re.search(r'连射概率[+＋](\d+)%', text)
            self.chain_bonus = int(m.group(1)) / 100.0 if m else 0.15
        if '对同一目标连续攻击时无视' in text:
            m = re.search(r'无视(\d+)%防御', text)
            self.consecutive_pen = int(m.group(1)) / 100.0 if m else 0.1
        if '转移控制成功时' in text:
            m = re.search(r'减速(\d+)%', text)
            self.transfer_slow = int(m.group(1)) / 100.0 if m else 0.15
        if '自损类技能伤害' in text:
            m = re.search(r'伤害[+＋](\d+)%', text)
            self.self_damage_bonus = int(m.group(1)) / 100.0 if m else 0.3
        if '多段攻击的段数' in text:
            self.multi_segment_plus = True
        if '对单体攻击时无视目标' in text:
            m = re.search(r'无视目标(\d+)%防御', text)
            self.single_pen = int(m.group(1)) / 100.0 if m else 0.25
        if '闪避成功后回复' in text:
            m = re.search(r'回复(\d+)%兵力', text)
            self.on_dodge_heal = int(m.group(1)) / 100.0 if m else 0.1
        if '随机类控制效果持续回合' in text:
            m = re.search(r'持续回合[+＋](\d+)', text)
            self.random_control_dur = int(m.group(1)) if m else 1
        if '雷印可叠加至' in text:
            m = re.search(r'叠加至(\d+)层', text)
            self.lei_stack_max = int(m.group(1)) if m else 5
        if '战法对带雷印目标必定暴击' in text:
            self.crit_vs_leiyin = True
        if '魅惑、控制类效果持续回合' in text:
            m = re.search(r'持续回合[+＋](\d+)', text)
            self.control_dur_plus += int(m.group(1)) if m else 1
        if '敌方互相攻击时伤害' in text:
            m = re.search(r'伤害[+＋](\d+)%', text)
            self.friendly_fire_bonus = int(m.group(1)) / 100.0 if m else 0.5
        if '敌方阵亡时' in text and '全属性' in text:
            m = re.search(r'全属性[+＋](\d+)%', text)
            self.enemy_death_allstats = int(m.group(1)) / 100.0 if m else 0.08
            self.immune_control_once = True
        if '我方全体初始怒气' in text:
            m = re.search(r'初始怒气[+＋](\d+)', text)
            self.team_rage_start = int(m.group(1)) if m else 20
        if '骑兵闪避率' in text:
            m = re.search(r'骑兵闪避率[+＋](\d+)%', text)
            if self.troop == '骑兵':
                self.perm['dodge'] += int(m.group(1)) / 100.0 if m else 0.15
        if '冲锋类伤害' in text:
            m = re.search(r'冲锋类伤害[+＋](\d+)%', text)
            self.charge_bonus = int(m.group(1)) / 100.0 if m else 0.2
        if '我方受到的持续伤害-' in text:
            m = re.search(r'持续伤害-(\d+)%', text)
            self.team_dot_reduce = int(m.group(1)) / 100.0 if m else 0.5
        if '死斗期间伤害' in text:
            m = re.search(r'伤害[+＋](\d+)%', text)
            self.deathmatch_bonus = int(m.group(1)) / 100.0 if m else 0.25
        if '与颜良同队时' in text:
            m = re.search(r'暴击率[+＋](\d+)%', text)
            self.duo_with = '颜良'
            self.duo_crit = int(m.group(1)) / 100.0 if m else 0.15
        if '对满血目标伤害' in text:
            m = re.search(r'对满血目标伤害[+＋](\d+)%', text)
            self.dmg_vs_full = int(m.group(1)) / 100.0 if m else 0.2
        if '击杀目标后攻击' in text:
            m = re.search(r'攻击[+＋](\d+)%', text)
            self.kill_atk = int(m.group(1)) / 100.0 if m else 0.15
        if '我方步兵受到的伤害' in text:
            m = re.search(r'受到的伤害-(\d+)%', text)
            self.team_troop_dr = ('步兵', int(m.group(1)) / 100.0 if m else 0.08)
        if '敌方后排受到的伤害' in text:
            m = re.search(r'受到的伤害[+＋](\d+)%', text)
            self.backline_vuln = int(m.group(1)) / 100.0 if m else 0.1
        if '追击类伤害' in text:
            m = re.search(r'追击类伤害[+＋](\d+)%', text)
            self.chase_bonus = int(m.group(1)) / 100.0 if m else 0.25
        if '敌方每被减速一次' in text:
            m = re.search(r'策略伤害[+＋](\d+)%', text)
            self.slow_strategy_vuln = int(m.group(1)) / 100.0 if m else 0.04
        return any(getattr(self, k) != v for k, v in before.items()) or dict(self.perm) != before_perm

    def _parse_signature(self, text):
        """接入「特色 / 被动」中此前未解析的团队光环与条件效果。"""
        if not text:
            return False
        hit = False

        def n(m, i=1):
            return int(m.group(i))

        def p(m, i=1):
            return int(m.group(i)) / 100.0

        # ---- 减伤
        if '最低者减伤' in text:
            m = re.search(r'最低者减伤[＋+]\s*(\d+)%', text)
            if m:
                self.lowest_dr += p(m)
                hit = True
        elif '主将' not in text and '相邻' not in text:
            m = re.search(r'我方[^，。；]*?减伤[＋+]\s*(\d+)%', text)
            if m:
                self.team_dr += p(m)
                hit = True
        m = re.search(r'我方[^，。；]*?受到的?物理伤害[－-]\s*(\d+)%', text)
        if m:
            self.team_dr_phys += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?受到的?策略伤害[－-]\s*(\d+)%', text)
        if m:
            self.team_dr_strat += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?受到的?(?:伤害|远程伤害|骑兵伤害|步兵伤害|火伤)[－-]\s*(\d+)%', text)
        if m:
            self.team_dr += p(m)
            hit = True
        m = re.search(r'护盾存在时[^，。；]*?[－-]\s*(\d+)%', text)
        if m:
            self.team_dr_shield += p(m)
            hit = True
        m = re.search(r'兵力比低于敌方[^。；]*?减伤[＋+]\s*(\d+)%', text)
        if m:
            self.team_dr_disadvantage += p(m)
            hit = True
        m = re.search(r'自身受到的伤害[－-]\s*(\d+)%', text)
        if m:
            self.self_dr += p(m)
            hit = True
        m = re.search(r'每受(?:到)?一次攻击[^，。；]*?减伤[＋+]\s*(\d+)%（最多[＋+]\s*(\d+)%）', text)
        if m:
            self.dr_ramp = (p(m), p(m, 2))
            hit = True
        m = re.search(r'每损失\s*10%\s*兵力[^，。；]*?减伤[＋+]\s*(\d+)%', text)
        if m:
            self.dr_low_hp = p(m)
            hit = True
        m = re.search(r'兵力低于\s*(\d+)%时改为[－-]\s*(\d+)%', text)
        if m:
            self.low_hp = (n(m), '防御', n(m, 2))
            hit = True

        # ---- 回复
        m = re.search(r'我方[^，。；]*?每回合回复\s*(\d+)%兵力', text)
        if m and '最低' not in m.group(0):
            self.team_regen += p(m)
            hit = True
        m = re.search(r'(?:兵力最低者|最低血者)每回合回复\s*(\d+)%', text)
        if not m:
            m = re.search(r'每回合为我方[^，。；]*?最低血者回复\s*(\d+)%', text)
        if m:
            self.regen_lowest += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?受到(?:的)?治疗(?:效果)?[＋+]\s*(\d+)%', text)
        if m:
            self.team_heal_in += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?回复(?:效果)?[＋+]\s*(\d+)%', text)
        if m:
            self.team_heal_out += p(m)
            hit = True
        m = re.search(r'自身每回合回血\s*(\d+)%', text)
        if m:
            self.self_regen += p(m)
            hit = True
        m = re.search(r'每回合开始回复\s*(\d+)%兵力', text)
        if m:
            self.self_regen += p(m)
            hit = True
        if '我方' not in text:
            m = re.search(r'每回合回复\s*(\d+)%兵力', text)
            if m:
                self.self_regen += p(m)
                hit = True

        # ---- 怒气
        m = re.search(r'我方[^，。；]*?每回合怒气[＋+]\s*(\d+)', text)
        if m:
            self.team_rage_round += n(m)
            hit = True
        m = re.search(r'我方[^，。；]*?怒气获取[＋+]\s*(\d+)%', text)
        if m:
            self.team_rage_gain += p(m)
            hit = True

        # ---- 团队增伤光环
        m = re.search(r'我方[^，。；]*?对(?:敌方)?后排伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_backline_bonus += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?对残血目标伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_low_bonus = (50, p(m))
            hit = True
        m = re.search(r'我方[^，。；]*?对破甲目标伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_armor_break_bonus += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?对处于控制状态的敌人伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_control_bonus += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?首回合伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_first_round_bonus += p(m)
            hit = True
        if re.search(r'我方[^，。；]*?首次攻击必定暴击', text):
            self.team_first_attack_crit = True
            hit = True
        m = re.search(r'我方[^，。；]*?护盾值[＋+]\s*(\d+)%', text)
        if m:
            self.team_shield_aura += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?连射概率[＋+]\s*(\d+)%', text)
        if m:
            self.team_chain_bonus += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?连射伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_chain_bonus += p(m)
            hit = True
        m = re.search(r'我方[^，。；]*?连射段数[＋+]\s*(\d+)', text)
        if m:
            self.team_multiseg += n(m) * 0.1
            hit = True
        m = re.search(r'策略伤害每回合递增\s*(\d+)%（最多[＋+]\s*(\d+)%）', text)
        if m:
            self.team_strat_ramp = (p(m), p(m, 2))
            hit = True
        m = re.search(r'灼烧类伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_burn_bonus += p(m)
            hit = True
        if re.search(r'若目标带有虚弱[^。；]*?无视其\s*\d+%减伤', text):
            self.team_ignores_weak = True
            hit = True

        # ---- 团队属性光环（含兵种/阵营/性别/远程限制）
        if self._parse_team_auras(text):
            hit = True

        m = re.search(r'敌方每有\s*1?\s*个负面效果[^。；]*?减伤[－-]\s*(\d+)%', text)
        if m:
            self.team_debuff_vuln += p(m)
            hit = True
        m = re.search(r'敌方每有一名单位处于灼烧[^。；]*?策略伤害[＋+]\s*(\d+)%', text)
        if m:
            self.per_debuff_bonus = max(self.per_debuff_bonus, p(m))
            hit = True
        m = re.search(r'敌方每有\s*1\s*个负面效果[^。；]*?策略伤害[＋+]\s*(\d+)%', text)
        if m:
            self.per_debuff_bonus = max(self.per_debuff_bonus, p(m))
            hit = True
        m = re.search(r'对兵力高于\s*(\d+)%的目标伤害[＋+]\s*(\d+)%', text)
        if m:
            self.dmg_vs_high = (n(m), p(m, 2))
            hit = True
        m = re.search(r'兵力低于\s*(\d+)%时[，,]?\s*伤害[＋+]\s*(\d+)%', text)
        if m:
            self.low_hp = (n(m), '攻击', n(m, 2))
            hit = True
        m = re.search(r'兵力低于\s*(\d+)%时攻击[＋+]\s*(\d+)%', text)
        if m:
            self.low_hp = (n(m), '攻击', n(m, 2))
            hit = True
        m = re.search(r'敌方(?:全体|全员)?(?:的)?(?:效果抗性|命中)[－-]\s*(\d+)%', text)
        if m:
            self.enemy_effect_hit_down += p(m)
            hit = True
        m = re.search(r'敌方全体每回合怒气[－-]\s*(\d+)', text)
        if m:
            self.enemy_rage_round += n(m)
            hit = True
        m = re.search(r'敌方全体威仪[－-]\s*(\d+)%', text)
        if m:
            self.enemy_stat_wei += p(m)
            hit = True
        m = re.search(r'开战首回合对敌方全体造成\s*(\d+)%伤害并降低其攻击\s*(\d+)%', text)
        if m:
            self.start_aoe = (p(m), p(m, 2), 1)
            hit = True

        # ---- 自身条件增伤 / 穿透
        if '我方' not in text:
            m = re.search(r'对后排伤害[＋+]\s*(\d+)%', text)
            if m:
                self.backline_bonus += p(m)
                hit = True
            m = re.search(r'首回合[^，。；]*?伤害[＋+]\s*(\d+)%', text)
            if m:
                self.first_round_bonus += p(m)
                hit = True
        if '无视站位' in text:
            self.ignore_row_first = True
            hit = True
        m = re.search(r'对后排[^，。；]*?无视\s*(\d+)%防御', text)
        if m:
            self.backline_pen += p(m)
            hit = True
        m = re.search(r'首次攻击无视(?:目标)?\s*(\d+)%防御', text)
        if not m:
            m = re.search(r'首次出手[^，。；]*?无视\s*(\d+)%防御', text)
        if m:
            self.first_attack_pen += p(m)
            hit = True
        m = re.search(r'首回合[^，。；]*?无视(?:目标)?\s*(\d+)%防御', text)
        if m:
            self.first_round_pen += p(m)
            hit = True
        m = re.search(r'与同一目标连续交战时，?每回合伤害[＋+]\s*(\d+)%（单场最多[＋+]\s*(\d+)%）', text)
        if not m:
            m = re.search(r'我方对同一目标连续攻击时，?每段伤害[＋+]\s*(\d+)%（最多[＋+]\s*(\d+)%）', text)
        if m:
            self.consecutive_bonus = (p(m), p(m, 2))
            hit = True
        m = re.search(r'目标每有\s*(\d+)个负面效果[^，。；]*?倍率[＋+]\s*(\d+)%', text)
        if m:
            self.per_debuff_bonus = p(m, 2) / max(1, n(m))
            hit = True
        # 条件文本里的常驻穿透/暴击（无“首次/首回合/对后排”限定）
        if any(w in text for w in COND_WORDS):
            m = re.search(r'无视目标\s*(\d+)%防御', text)
            if m and '对后排' not in text and '首次' not in text and '首回合' not in text:
                self.perm['pen'] += p(m)
                hit = True
            m = re.search(r'暴击率[＋+]\s*(\d+)%', text)
            if m and '我方' not in re.split(r'[；;。]', text[:m.start()])[-1]:
                self.perm['crit'] += p(m)
                hit = True

        # ---- 普攻附加
        m = re.search(r'普攻\s*(\d+)%概率追加一次\s*(\d+)%伤害', text)
        if m:
            self.extra_hit = (p(m), p(m, 2))
            hit = True
        m = re.search(r'普攻\s*(\d+)%概率致晕\s*(\d+)回合', text)
        if m:
            self.basic_stun = (p(m), n(m, 2))
            hit = True
        m = re.search(r'对眩晕目标伤害[＋+]\s*(\d+)%', text)
        if m:
            self.dmg_vs_status = ('眩晕', p(m))
            hit = True

        # ---- 额外行动
        m = re.search(r'每回合有\s*(\d+)%概率额外行动一次', text)
        if not m:
            m = re.search(r'每次行动有\s*(\d+)%概率额外行动一次', text)
        if m:
            self.extra_action_chance = max(self.extra_action_chance, p(m))
            hit = True

        # ---- 首回合强化
        m = re.search(r'开战首回合闪避[＋+]\s*(\d+)%', text)
        if m:
            self.first_round_dodge += p(m)
            hit = True
        m = re.search(r'开战首回合速度[＋+]\s*(\d+)%', text)
        if m:
            self.first_round_speed += p(m)
            hit = True
        m = re.search(r'开战首回合[^。；]*?攻击[＋+]\s*(\d+)%', text)
        if m and '受到' not in text:
            self.first_round_bonus += p(m)
            hit = True
        m = re.search(r'受到攻击时[^。；]*?(\d+)%概率使攻击者[^。；]*?攻击力[－-]\s*(\d+)%', text)
        if m:
            self.on_hit_weaken = (p(m), p(m, 2))
            hit = True
        m = re.search(r'剧毒可叠加至\s*(\d+)层', text)
        if m:
            self.dot_stack_max = max(self.dot_stack_max, n(m))
            hit = True
        m = re.search(r'我方[^。]*?破甲效果[＋+]\s*(\d+)%', text)
        if m:
            self.team_armor_break_bonus += p(m)
            hit = True
        # ---- 不可选中
        if re.search(r'开战首回合[^，。；]*?不可被选中|首次出手不可被选中', text):
            self.first_round_untargetable = True
            hit = True

        # ---- 击杀 / 低血 / 反击
        m = re.search(r'击杀[^。]*?攻击永久[＋+]\s*(\d+)%', text)
        if m:
            self.kill_permanent = (n(m), 99)
            hit = True
        else:
            m = re.search(r'击杀[^。]*?攻击[＋+]\s*(\d+)%', text)
            if m:
                self.kill_atk += p(m)
                hit = True
        m = re.search(r'击杀后行动条推进\s*(\d+)%', text)
        if m:
            self.kill_advance += p(m)
            hit = True
        m = re.search(r'自身兵力低于\s*(\d+)%时，伤害[＋+]\s*(\d+)%且获得吸血\s*(\d+)%', text)
        if m:
            self.low_hp = (n(m), '攻击', n(m, 2))
            self.low_hp_lifesteal = (n(m), p(m, 3))
            hit = True
        else:
            m = re.search(r'兵力低于\s*(\d+)%时，伤害[＋+]\s*(\d+)%', text)
            if m:
                self.low_hp = (n(m), '攻击', n(m, 2))
                hit = True
        if '免死' in text and ('每场' in text or '触发1次' in text or '触发一次' in text):
            self.survive_lethal = max(self.survive_lethal, 0.01)
            hit = True
        m = re.search(r'每受到一次攻击[^。；]*?反击倍率[＋+]\s*(\d+)%（单场最多[＋+]\s*(\d+)%）', text)
        if m:
            self.counter_ramp = (p(m), p(m, 2))
            hit = True
        m = re.search(r'每回合开始有\s*(\d+)%概率使敌方随机1人叛变', text)
        if m:
            self.round_start_confuse = p(m)
            hit = True

        # ---- 阵亡触发
        m = re.search(r'阵亡时敌方全体受到灼烧\s*(\d+)层', text)
        if m:
            self.death_dot = ('灼烧', n(m))
            hit = True
        m = re.search(r'阵亡时全体怒气[＋+]\s*(\d+)', text)
        if m:
            self.death_rage = n(m)
            hit = True
        m = re.search(r'阵亡时召唤\s*(\d+)名?([^（(]+)[（(]\s*(\d+)%属性', text)
        if m:
            self.death_summon = (n(m), m.group(2).strip(), p(m, 3))
            hit = True
        m = re.search(r'我方任意武将阵亡时[^。；]*?对敌方后排造成\s*(\d+)%', text)
        if m:
            self.ally_death_strike = p(m)
            hit = True
        m = re.search(r'武将阵亡时，?立即以\s*(\d+)%兵力复活', text)
        if m:
            self.team_revive = p(m)
            hit = True

        # ---- 开场召唤
        if '阵亡时召唤' not in text:
            m = re.search(r'召唤\s*(\d+)名?(?:头)?([^（(]+)[（(]\s*(\d+)%属性[^）)]*[）)]', text)
            if m:
                dur = re.search(r'持续\s*(\d+)回合', text)
                self.start_summon = (n(m), m.group(2).strip(), p(m, 3),
                                     int(dur.group(1)) if dur else 3)
                hit = True

        # ---- 免疫与控制命中
        if '免疫恐惧与嘲讽' in text:
            self.control_immune_extra.update({'恐惧', '嘲讽'})
            hit = True
        m = re.search(r'效果[^。]*?成功率[＋+]\s*(\d+)%', text)
        if m:
            self.team_effect_hit_aura += p(m)
            hit = True

        # ---- 2026-11-20 剩余特色补完
        m = re.search(r'每有一名友军存活[^。；]*?全体威仪[＋+]\s*(\d+)%', text)
        if m:
            self.team_wei_per_ally = p(m)
            hit = True
        m = re.search(r'友军阵亡时回复其\s*(\d+)%兵力', text)
        if m:
            self.ally_death_heal = p(m)
            hit = True
        m = re.search(r'使敌方单体混乱\s*(\d+)回合[^。；]*?受到的伤害[＋+]\s*(\d+)%', text)
        if m:
            self.start_confuse = (n(m), p(m, 2))
            hit = True
        m = re.search(r'对单体连续突刺\s*(\d+)次[^。；]*?每次\s*(\d+)%伤害[^。；]*?首段必定暴击', text)
        if m:
            self.basic_multi = (n(m), p(m, 2), True)
            hit = True
        m = re.search(r'每累计损失\s*10%\s*总兵力[^。；]*?全体威仪[＋+]\s*(\d+)%[^。；]*?最多[＋+]\s*(\d+)%', text)
        if m:
            self.team_lost_wei = (0.10, p(m), p(m, 2))
            hit = True
        m = re.search(r'每回合开始随机获得攻击[＋+]\s*(\d+)%或效果命中[＋+]\s*(\d+)%', text)
        if m:
            self.round_random_buff = [('atk', p(m)), ('effect_hit', p(m, 2))]
            hit = True
        if re.search(r'主将[^。；]*?代为承受', text):
            self.bodyguard = True
            m = re.search(r'并为其回复\s*(\d+)%兵力', text)
            if m:
                self.bodyguard_heal = p(m)
            hit = True
        m = re.search(r'我方全体按最高属性额外[＋+]\s*(\d+)%', text)
        if m:
            self.start_stat_boost = p(m)
            hit = True
        m = re.search(r'同阵营人数.?(\d+)时再[＋+]\s*(\d+)%', text)
        if m:
            self.start_faction_boost = p(m, 2)
            hit = True
        m = re.search(r'获得\s*(\d+)回合无敌并回复全体\s*(\d+)%兵力', text)
        if m:
            self.start_invuln = (n(m), p(m, 2))
            hit = True
        m = re.search(r'开战时若敌方含(蜀|魏|吴|群雄)阵营，我方(蜀|魏|吴|群雄)将全属性[＋+]\s*(\d+)%；否则全体减伤[＋+]\s*(\d+)%', text)
        if m:
            self.start_ban = (m.group(1), m.group(2), p(m, 3), p(m, 4))
            hit = True
        m = re.search(r'我方每名(蜀|魏|吴|群雄)将阵亡[^。；]*?全属性[＋+]\s*(\d+)%（最多[＋+]\s*(\d+)%）', text)
        if m:
            self.ally_death_allstats = (m.group(1), p(m, 2), p(m, 3))
            hit = True
        m = re.search(r'受到攻击后获得1层[^。；]*?攻击[＋+]\s*(\d+)%[^。；]*?最多\s*(\d+)层', text)
        if m:
            self.hit_atk_ramp = (p(m), p(m) * n(m, 2))
            hit = True
        if '我方' not in text:
            m = re.search(r'闪避率?[＋+]\s*(\d+)%', text)
            if m:
                self.perm['dodge'] += p(m)
                hit = True
        m = re.search(r'阵亡时我方全体全属性[＋+]\s*(\d+)%', text)
        if m:
            self.death_team_allstats = (p(m), '无视' in text)
            hit = True
        m = re.search(r'开战前\s*(\d+)回合[^。；]*?攻击[＋+]\s*(\d+)%[^。；]*?速度[＋+]\s*(\d+)%', text)
        if m:
            self.first_rounds_atk = (n(m), p(m, 2))
            self.first_rounds_speed = (n(m), p(m, 3))
            hit = True
        m = re.search(r'与(关羽)同队时全属性[＋+]\s*(\d+)%', text)
        if m:
            self.duo_allstats = (m.group(1), p(m, 2))
            hit = True
        m = re.search(r'敌方每有一层剧毒[^。；]*?治疗效果[－-]\s*(\d+)%', text)
        if m:
            self.poison_heal_reduce = p(m)
            hit = True
        m = re.search(r'我方造成灼烧伤害时[^。；]*?获得\s*(\d+)点?怒气', text)
        if m:
            self.burn_rage = n(m)
            hit = True
        m = re.search(r'敌方灼烧层数.(\d+)时[^。；]*?受到火伤[＋+]\s*(\d+)%', text)
        if m:
            self.enemy_burn_vuln = (n(m), p(m, 2))
            hit = True
        m = re.search(r'我方吴将每有一名女性武将[^。；]*?攻击[＋+]\s*(\d+)%', text)
        if m:
            self.team_wu_female_atk = p(m)
            hit = True
        m = re.search(r'暴击后回复\s*(\d+)怒气', text)
        if m:
            self.crit_rage = n(m)
            hit = True
        m = re.search(r'每回合结束[^。；]*?全属性[＋+]\s*(\d+)%（最多[＋+]\s*(\d+)%）', text)
        if m:
            self.round_allstats_ramp = (p(m), p(m, 2))
            hit = True
        m = re.search(r'主将(?:撤退或)?阵亡时[^。；]*?攻击[＋+]\s*(\d+)%', text)
        if m:
            self.main_death_atk = p(m)
            hit = True
        m = re.search(r'我方[^。；]*?受到的反击伤害[－-]\s*(\d+)%', text)
        if m:
            self.team_counter_dr = p(m)
            hit = True
        m = re.search(r'我方[^。；]*?对多目标伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_aoe_bonus = p(m)
            hit = True
        m = re.search(r'场上每有一名召唤物[^。；]*?策略伤害[＋+]\s*(\d+)%', text)
        if m:
            self.per_summon_strat = p(m)
            hit = True
        m = re.search(r'召唤物阵亡时[^。；]*?造成\s*(\d+)%雷伤', text)
        if m:
            self.summon_death_aoe = p(m)
            hit = True
        m = re.search(r'我方(步兵)对黄巾系敌人伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_bonus_vs = (YELLOW, p(m, 2))
            hit = True
        m = re.search(r'我方(骑兵)对(骑兵|步兵)伤害[＋+]\s*(\d+)%', text)
        if m:
            self.team_troop_vs = ((m.group(1), m.group(2)), p(m, 3))
            hit = True
        m = re.search(r'场上每有一名河北系武将[^。；]*?攻击[＋+]\s*(\d+)%', text)
        if m:
            self.per_named_atk = (HEBEI, p(m))
            hit = True
        m = re.search(r'每有一名敌人处于恐惧状态[^。；]*?攻击[＋+]\s*(\d+)%', text)
        if m:
            self.per_status = ('恐惧', p(m))
            hit = True
        m = re.search(r'恐惧目标受到的伤害[＋+]\s*(\d+)%', text)
        if m:
            self.dmg_vs_status = ('恐惧', p(m))
            hit = True

        return hit

    def apply_extra_skill(self, desc):
        """装备技能书：把一件被动/特色技能文本叠加到本单位。"""
        if not desc:
            return
        if any(w in desc for w in COND_WORDS):
            self._parse_special_talent(desc)
        else:
            for stat, val in parse_static_buffs(desc):
                self._add_perm(stat, val)
        self._parse_signature(desc)
        self._finalize()

    def _add_perm(self, stat, val):
        if stat == '全属性':
            for k in SIX:
                self.perm['stat_' + k] += val
        elif stat == '攻击':
            self.perm['atk'] += val
        elif stat == '暴击率':
            self.perm['crit'] += val
        elif stat == '暴击伤害':
            self.perm['crit_dmg'] += val
        elif stat == '兵力上限':
            self.perm['hp'] += val
        elif stat == '受到伤害':
            self.perm['dr'] += -val
        elif stat == '治疗效果':
            self.perm['heal'] += val
        elif stat == '策略伤害':
            self.perm['strategy_dmg'] += val
        elif stat in ('效果命中', '控制命中'):
            self.perm['effect_hit'] += val
        elif stat == '效果抗性':
            self.perm['dr'] += val
        elif stat == '速度':
            self.perm['speed'] += val
        elif stat == '吸血':
            self.perm['lifesteal'] += val
        elif stat == '护盾':
            self.shield_boost += val
        elif stat == '闪避':
            self.perm['dodge'] += val
        elif stat == '无视防御':
            self.perm['pen'] += val
        elif stat == '效果抵抗':
            self.control_resist += val

    def _finalize(self):
        # 高等级兵力补偿：抵消伤害公式随属性成长快于兵力的部分
        hp_lv = 1 + 0.007 * (self.level - 1)
        self.base_hp = int((self.stats['统御'] * HP_PER_TONG + HP_BASE) * hp_lv)
        self.max_hp = int(self.base_hp * (1 + self.perm['hp']))
        self.hp = self.max_hp

    # ---- 数值
    def stat(self, k):
        v = self.stats[k] * (1 + self.perm['stat_' + k] + self.perm['atk'])
        if k == '威仪':
            team = [a for a in (getattr(self, 'team_units', None) or []) if a.alive]
            if team:
                per = sum(a.team_wei_per_ally for a in team)
                if per:
                    v *= 1 + per * len(team)
                for a in team:
                    if a.team_lost_wei:
                        step, per2, cap = a.team_lost_wei
                        b = getattr(a, 'battle', None)
                        if b is not None:
                            tot = sum(x.max_hp for x in b.units if x.side == a.side)
                            cur = sum(x.hp for x in b.units if x.alive and x.side == a.side)
                            lost = max(0.0, 1 - cur / max(1, tot))
                            v *= 1 + min(cap, per2 * int(lost / step))
        return v

    def _aura_applies(self, cond):
        if not cond:
            return True
        if cond.get('troop') and self.troop != cond['troop']:
            return False
        if cond.get('faction') and self.faction != cond['faction']:
            return False
        if cond.get('female') and self.name not in FEMALE:
            return False
        if cond.get('ranged') and self.troop not in ('弓兵', '方士'):
            return False
        return True

    def team_bonus(self, stat):
        """汇总全队该属性的光环：无限制光环 + 命中本单位的限制光环。"""
        v = 0.0
        for a in (getattr(self, 'team_units', None) or []):
            if not a.alive:
                continue
            v += getattr(a, TEAM_AURA_FIELDS[stat], 0.0)
            for rule in getattr(a, 'team_rules', ()):
                if rule['stat'] == stat and self._aura_applies(rule.get('cond')):
                    v += rule['value']
        return v

    @staticmethod
    def _aura_cond(seg):
        """从“我方…”从句里取限制条件：兵种 / 远程 / 女性 / 阵营。"""
        head = re.split(r'(?:效果抗性|效果抵抗|效果命中|策略伤害|暴击率|攻击力|攻击|速度|闪避|命中)', seg)[0]
        cond = {}
        for t in ('骑兵', '步兵', '弓兵'):
            if t in head:
                cond['troop'] = t
                break
        if '远程' in head:
            cond['ranged'] = True
        if '女性' in head:
            cond['female'] = True
        for f in ('吴', '魏', '蜀'):
            if f + '将' in head or f + '国' in head:
                cond['faction'] = f
                break
        if '群雄' in head or '群将' in head:
            cond['faction'] = '群'
        return cond

    def _parse_team_auras(self, text):
        """解析团队属性光环。无条件/常驻光环按全队生效；
        “我方骑兵/步兵/弓兵/远程/女性/吴将…”按接收者判定。
        含“受到/每有/敌方”的从句不作为常驻光环。"""
        hit = False
        team_ctx = False          # 分句省略主语时，沿用前文的“我方”语境
        for sent in re.split(r'[；;。]', text):
            carry = None          # 顿号续接的上一段限制条件
            for seg in re.split(r'[、，,]', sent):
                if '我方' in seg:
                    team_ctx = True
                    carry = None
                elif '敌方' in seg or '自身' in seg:
                    team_ctx = False
                    carry = None
                if not team_ctx:
                    continue
                if '受到' in seg or '每有' in seg:
                    carry = None
                    continue
                cond = self._aura_cond(seg)
                if cond:
                    carry = cond
                elif carry:
                    cond = carry

                def apply(stat, val):
                    if cond:
                        self.team_rules.append({'stat': stat, 'value': val, 'cond': dict(cond)})
                    else:
                        setattr(self, TEAM_AURA_FIELDS[stat],
                                getattr(self, TEAM_AURA_FIELDS[stat]) + val)

                m = re.search(r'(?:命中与闪避|闪避与命中)各[＋+]\s*(\d+(?:\.\d+)?)%', seg)
                if m:
                    for stat in ('effect_hit', 'dodge'):
                        apply(stat, float(m.group(1)) / 100.0)
                    hit = True
                for m in TEAM_AURA_RE.finditer(seg):
                    apply(TEAM_AURA_MAP[m.group(1)], float(m.group(2)) / 100.0)
                    hit = True
        return hit

    def speed(self):
        base = 100 + self.stats['机变'] * 0.8
        aura = self.team_bonus('speed')
        base *= (1 + self.perm['speed'] + self.buff_sum('speed') + aura)
        if self.first_round_speed and getattr(self, 'battle_round', 1) <= 1:
            base *= 1 + self.first_round_speed
        if self.first_rounds_speed and getattr(self, 'battle_round', 1) <= self.first_rounds_speed[0]:
            base *= 1 + self.first_rounds_speed[1]
        if self.flags.get('疾行') and getattr(self, 'battle_round', 1) <= 1:
            base *= (1 + self.flags['疾行'][0] / 100.0)
        return max(30.0, base)

    def crit(self):
        v = 0.05 + self.stats['天命'] * 0.004 + self.perm['crit'] + self.buff_sum('crit')
        v += self.team_bonus('crit')
        if self.flags.get('背水一战') and self.hp / max(1, self.max_hp) < 0.5:
            v += self.flags['背水一战'][0] / 100.0
        if self.low_hp and self.low_hp[1] == '暴击率' and self.hp / max(1, self.max_hp) < self.low_hp[0] / 100.0:
            v += self.low_hp[2] / 100.0
        return min(0.65, max(0.0, v))

    def crit_dmg(self):
        v = 1.5 + self.stats['天命'] * 0.003 + self.perm['crit_dmg'] + self.buff_sum('crit_dmg')
        if self.flags.get('致命一击'):
            v += self.flags['致命一击'][0] / 100.0
        return v

    def damage_reduction(self, dtype=None):
        tong = self.stat('统御')
        base = tong / (tong + 200 + 5 * self.level)
        base = min(0.6, base)
        v = base + self.perm['dr'] + self.buff_sum('dr') + self.self_dr
        team = [x for x in (getattr(self, 'team_units', None) or []) if x.alive]
        if team:
            low = min(team, key=lambda x: x.hp / max(1, x.max_hp))
            disadvantaged = False
            b = getattr(self, 'battle', None)
            if b is not None:
                mine = sum(x.hp / max(1, x.max_hp) for x in b.units if x.alive and x.side == self.side)
                theirs = sum(x.hp / max(1, x.max_hp) for x in b.units if x.alive and x.side != self.side)
                disadvantaged = mine < theirs
            for a in team:
                v += a.team_dr
                if dtype == 'strategy':
                    v += a.team_dr_strat
                elif dtype == 'physical':
                    v += a.team_dr_phys
                if self.shield > 0:
                    v += a.team_dr_shield
                if disadvantaged:
                    v += a.team_dr_disadvantage
                if a.lowest_dr and self is low:
                    v += a.lowest_dr
        if self.dr_ramp and self.hit_dr_stacks:
            v += min(self.dr_ramp[1], self.dr_ramp[0] * self.hit_dr_stacks)
        if self.dr_low_hp:
            v += self.dr_low_hp * int((1 - self.hp / max(1, self.max_hp)) * 10)
        if self.status or self.dots:
            v -= sum(a.team_debuff_vuln for a in team) * (len(self.dots) + len(self.status))
        if self.flags.get('坚守') and self.hp / max(1, self.max_hp) < 0.5:
            v += self.flags['坚守'][0] / 100.0
        if self.flags.get('死守') and self.hp / max(1, self.max_hp) < 0.3:
            v += self.flags['死守'][0] / 100.0
        if self.taunt_dr and self.status.get('嘲讽', 0) > 0:
            v += self.taunt_dr
        if self.dots.get('雷印'):
            info = self.dots['雷印']
            v -= info.get('lei_dr', 0.0) * min(5, info['stacks'])
        return min(0.85, max(0.0, v))

    def effect_hit(self):
        return min(0.85, 0.15 + self.stats['威仪'] * 0.005 + self.perm['effect_hit'] + self.buff_sum('effect_hit') + self.team_bonus('effect_hit'))

    def dodge_chance(self):
        v = self.perm.get('dodge', 0.0) + self.buff_sum('dodge')
        v += self.team_bonus('dodge')
        if self.troop == '骑兵':
            allies = [a for a in (getattr(self, 'team_units', None) or []) if a.alive]
            v += sum(a.team_dodge_cavalry for a in allies)
        if self.first_round_dodge and getattr(self, 'battle_round', 1) <= 1:
            v += self.first_round_dodge
        if self.low_hp and self.low_hp[1] == '闪避' and self.hp / max(1, self.max_hp) < self.low_hp[0] / 100.0:
            v += self.low_hp[2] / 100.0
        return min(0.45, max(0.0, v))

    def control_resist_value(self):
        return min(0.85, max(0.0, self.control_resist + self.perm.get('resist', 0.0) + self.team_bonus('control_resist')))

    def atk_bonus(self):
        v = self.perm['atk'] + self.buff_sum('atk')
        team = [a for a in (getattr(self, 'team_units', None) or []) if a.alive]
        v += self.team_bonus('atk')
        if self.hit_atk_ramp and self.hit_atk_stacks:
            v += min(self.hit_atk_ramp[1], self.hit_atk_ramp[0] * self.hit_atk_stacks)
        if self.per_named_atk:
            names, val = self.per_named_atk
            v += val * sum(1 for a in team if a.name in names)
        if self.first_rounds_atk and getattr(self, 'battle_round', 1) <= self.first_rounds_atk[0]:
            v += self.first_rounds_atk[1]
        if self.flags.get('锐气') and self.hp / max(1, self.max_hp) > 0.7:
            v += self.flags['锐气'][0] / 100.0
        if self.flags.get('血勇'):
            lost = max(0.0, 1 - self.hp / max(1, self.max_hp))
            v += self.flags['血勇'][0] / 100.0 * (lost * 10)
        if self.lost_hp_atk:
            per, gain = self.lost_hp_atk if isinstance(self.lost_hp_atk, tuple) else (10, 6)
            lost = max(0.0, 1 - self.hp / max(1, self.max_hp))
            v += gain / 100.0 * (lost * 100.0 / per)
        if self.main_low_atk:
            pct, gain = self.main_low_atk
            team = getattr(self, 'team_units', None) or []
            leader = team[0] if team else None
            if leader and leader.alive and leader.hp / max(1, leader.max_hp) < pct / 100.0:
                v += gain / 100.0
        return v

    def buff_sum(self, key):
        return sum(b['value'] for b in self.buffs if b['stat'] == key)

    def is_debuffed(self):
        return bool(self.dots) or any(s in self.status for s in ('虚弱', '防御下降'))

    def add_buff(self, stat, value, turns, src=None):
        if abs(value) < 1e-9:
            return
        self.buffs.append({'stat': stat, 'value': value, 'turns': turns, 'src': src})

    def tick(self):
        # 自身行动开始：递减 buff/状态
        self.buffs = [b for b in self.buffs if b['turns'] > 0]
        for b in self.buffs:
            b['turns'] -= 1
        for k in list(self.status.keys()):
            if k in ('沉默', '虚弱', '恐惧', '魅惑', '混乱', '嘲讽', '破甲'):
                self.status[k] -= 1
                if self.status[k] <= 0:
                    del self.status[k]


# ---------------------------------------------------------------- 战斗
class Battle:
    def __init__(self, units, seed=None):
        self.rng = random.Random(seed)
        self.units = units
        for u in units:
            u.battle = self
            u.next_time = 1000.0 / u.speed()
            u.battle_round = 1
        self.round = 1
        self.acted = set()
        self.done = False
        self.winner = None
        self.timeout = False
        self.pending = None
        self.events = []
        self.log = []
        self.strategy_history = {0: [], 1: []}   # 每方最近释放的战法，供姜维复制
        self.deathmatch = None                    # 文丑 死斗状态
        self.combos_a = []
        self.combo_used = False
        self._start()
        for u in units:
            u.next_time = 1000.0 / u.speed()

    def ev(self, kind, **kw):
        # 事件里的伤害/治疗/兵力一律取整，避免战斗日志出现长小数
        for key in ('dmg', 'amount', 'hp', 'dst_hp'):
            if key in kw and isinstance(kw[key], (int, float)):
                kw[key] = int(round(kw[key]))
        kw.update({'round': self.round, 'kind': kind})
        self.events.append(kw)

    def _start(self):
        # 羁绊
        for side in (0, 1):
            team = [u for u in self.units if u.side == side and u.alive]
            by_f = defaultdict(list)
            for u in team:
                by_f[u.faction].append(u)
            for f, group in by_f.items():
                n = len(group)
                if n in BOND_TABLE:
                    atk, hp, eff = BOND_TABLE[n]
                    for u in group:
                        u.perm['atk'] += atk
                        u.perm['hp'] += hp
                        u.perm['effect_hit'] += eff
                        if n == 5:
                            u.rage = min(100.0, u.rage + 20)
        # 团队机制
        for u in self.units:
            team = [x for x in self.units if x.side == u.side]
            for name, vals_list in u.team_flags.items():
                for vals in vals_list:
                    if name == '督战':
                        for a in team: a.perm['crit'] += vals[0] / 100.0
                    elif name == '军心':
                        for a in team: a.perm['dr'] += vals[0] / 100.0
                    elif name == '仁心':
                        for a in team: a.perm['heal'] += vals[0] / 100.0
                    elif name == '同袍':
                        same = sum(1 for a in team if a.faction == u.faction)
                        for a in team:
                            if a.faction == u.faction:
                                a.perm['atk'] += vals[0] / 100.0 * same
                    elif name == '号令':
                        for a in team:
                            a.add_buff('atk', vals[0] / 100.0, 1)
                            a.add_buff('atk', vals[0] / 100.0, 1)
        for u in self.units:
            u._finalize()
            if u.cd_rage:
                u.rage = 100.0
            if u.team_survive:
                for a in [x for x in self.units if x.side == u.side]:
                    a.survive_lethal = max(a.survive_lethal, 0.01)
            u.next_time = 1000.0 / u.speed()
        # 主将引用 + 初始怒气 + 双雄
        for side in (0, 1):
            team = [x for x in self.units if x.side == side and x.alive]
            for a in team:
                a.team_units = team
            for a in team:
                if a.team_rage_start:
                    for b in team:
                        b.rage = min(100.0, b.rage + a.team_rage_start)
            names = {x.name for x in team}
            for a in team:
                if a.duo_with and a.duo_with in names:
                    for b in team:
                        if b.name in (a.name, a.duo_with):
                            b.perm['crit'] += a.duo_crit
        # 敌方开场削弱 / 开场伤害
        for u in self.units:
            if not u.alive:
                continue
            enemies = [x for x in self.units if x.alive and x.side != u.side]
            for e in enemies:
                if u.enemy_effect_hit_down:
                    e.perm['effect_hit'] -= u.enemy_effect_hit_down
                if u.enemy_stat_wei:
                    e.perm['stat_威仪'] -= u.enemy_stat_wei
            if u.start_aoe:
                mult, down, turns = u.start_aoe
                for e in list(enemies):
                    if not e.alive:
                        continue
                    dmg = max(1, int(u.stat('武勇') * mult *
                                      (1 - min(0.9, e.damage_reduction('physical')))))
                    e.hp -= dmg
                    e.add_buff('atk', -down, turns, src=u)
                    self.ev('damage', src=u.name, src_side=u.side, dst=e.name, dst_side=e.side,
                            skill='虎牢之威', dmg=dmg, crit=False, dst_hp=round(e.hp))
                    if e.hp <= 0:
                        self._kill(e, u, 0)
        # 剩余特色：开场条件光环
        for u in self.units:
            if not u.alive:
                continue
            if u.start_ban:
                ef, af, allstats, else_dr = u.start_ban
                enemies = [x for x in self.units if x.alive and x.side != u.side]
                if any(e.faction == ef for e in enemies):
                    for a in [x for x in self.units if x.side == u.side and x.faction == af]:
                        for k in SIX:
                            a.perm['stat_' + k] += allstats
                else:
                    for a in [x for x in self.units if x.side == u.side]:
                        a.perm['dr'] += else_dr
            if u.duo_allstats:
                name, val = u.duo_allstats
                if any(a.name == name and a.side == u.side for a in self.units):
                    for k in SIX:
                        u.perm['stat_' + k] += val
            if u.start_stat_boost:
                for a in [x for x in self.units if x.side == u.side and x.alive]:
                    best = max(SIX, key=lambda k: a.stats[k])
                    a.perm['stat_' + best] += u.start_stat_boost
            if u.start_faction_boost:
                team = [x for x in self.units if x.side == u.side and x.alive]
                if sum(1 for x in team if x.faction == u.faction) >= 3:
                    for a in team:
                        for k in SIX:
                            a.perm['stat_' + k] += u.start_faction_boost
            if u.start_invuln:
                mine = sum(x.max_hp for x in self.units if x.side == u.side)
                theirs = sum(x.max_hp for x in self.units if x.side != u.side)
                if mine < theirs:
                    u.invuln_rounds = u.start_invuln[0]
                    for a in [x for x in self.units if x.side == u.side and x.alive]:
                        self.heal(u, a, pct=u.start_invuln[1])
            if u.start_confuse:
                es = [x for x in self.units if x.alive and x.side != u.side]
                if es:
                    t = self.rng.choice(es)
                    t.status['混乱'] = max(t.status.get('混乱', 0), u.start_confuse[0])
                    t.add_buff('dr', -u.start_confuse[1], u.start_confuse[0], src=u)
                    self.ev('control', src=u.name, src_side=u.side, dst=t.name,
                            dst_side=t.side, status='混乱')
            if u.first_rounds_atk:
                u.add_buff('atk', u.first_rounds_atk[1], u.first_rounds_atk[0], src=u)
            if u.first_rounds_speed:
                u.add_buff('speed', u.first_rounds_speed[1], u.first_rounds_speed[0], src=u)
            if u.team_wu_female_atk:
                team = [x for x in self.units if x.side == u.side and x.alive]
                cnt = sum(1 for x in team if x.faction == '吴' and x.name in FEMALE)
                if cnt:
                    for a in team:
                        if a.faction == '吴':
                            a.perm['atk'] += u.team_wu_female_atk * cnt
        # 首回合不可选中 / 开场召唤
        for u in self.units:
            if u.first_round_untargetable:
                u.untargetable = 1
        for u in [x for x in self.units if x.alive and x.start_summon]:
            cnt, _name, coef, dur = u.start_summon
            self.summon(u, (cnt, coef, dur))

    def run(self):
        guard = 0
        while not self.done and self.round <= MAX_ROUNDS:
            self.step(auto=True)
            guard += 1
            if guard > 20000:
                break
        if not self.done:
            self.judge()
        return self.winner

    def available_skills(self, u):
        silenced = u.status.get('沉默', 0) > 0
        out = []
        for typ in ('普攻', '战法', '奇谋'):
            if typ not in u.skills:
                continue
            ok, reason = True, ''
            if typ == '战法':
                ok = (not silenced) and u.rage >= 100
                reason = '怒气不足' if u.rage < 100 else ('沉默' if silenced else '')
            elif typ == '奇谋':
                ok = (not silenced) and u.cd.get('奇谋', 0) <= 0
                reason = f"冷却{u.cd.get('奇谋', 0)}回合" if u.cd.get('奇谋', 0) > 0 else ('沉默' if silenced else '')
            out.append({'type': typ, 'name': u.skills[typ].get('name', typ),
                        'available': ok, 'reason': reason,
                        'desc': u.skills[typ].get('desc', '')})
        return out

    def prepare_turn(self, u):
        u.battle_round = self.round
        if u.status.get('眩晕', 0) > 0:
            u.status['眩晕'] -= 1
            self.ev('skip', unit=u.name, side=u.side, reason='眩晕')
            return False
        if u.status.get('恐惧', 0) > 0:
            u.status['恐惧'] -= 1
            self.ev('skip', unit=u.name, side=u.side, reason='恐惧')
            return False
        u.tick()
        u.rage = min(100.0, u.rage + u.stats['威仪'] * 0.02)
        if u.cd.get('奇谋', 0) > 0:
            u.cd['奇谋'] -= 1
        return True

    def _auto_skill(self, u):
        silenced = u.status.get('沉默', 0) > 0
        if not silenced and u.rage >= 100 and '战法' in u.skills:
            return '战法'
        if not silenced and '奇谋' in u.skills and u.cd.get('奇谋', 0) <= 0:
            return '奇谋'
        return '普攻'

    def take_turn(self, u, skill_type=None):
        avail = {x['type']: x['available'] for x in self.available_skills(u)}
        if not skill_type or not avail.get(skill_type):
            skill_type = self._auto_skill(u)
        if skill_type == '战法':
            if not u.free_skill:
                u.rage = 0.0
            u.free_skill = False
        elif skill_type == '奇谋':
            u.cd['奇谋'] = int(u.skills['奇谋'].get('cd') or 3)
        sk = u.skills.get(skill_type)
        if not sk:
            return
        self.ev('action', unit=u.name, side=u.side, skill=sk['name'], hp=round(u.hp))
        self.cast(u, sk)
        if sk['type'] == '战法':
            hist = self.strategy_history[u.side]
            hist.append((u, sk))
            if len(hist) > 8:
                hist.pop(0)
        if u.forced_crit > 0:
            u.forced_crit -= 1

    def finish_turn(self, u):
        u.next_time += 1000.0 / u.speed()
        self.acted.add(u)
        if u.alive and u.extra_action_chance and u.extra_action_used_round != self.round:
            if self.rng.random() < u.extra_action_chance:
                u.extra_action = True
                u.extra_action_used_round = self.round
        if u.extra_action and u.alive:
            u.extra_action = False
            if self.prepare_turn(u):
                self.take_turn(u)
                u.next_time += 1000.0 / u.speed()
                self.acted.add(u)
        if self.check_end():
            return
        alive = [x for x in self.units if x.alive]
        if alive and all(x in self.acted for x in alive):
            self.end_round()

    def state_units(self):
        return [{
            'name': u.name, 'side': u.side, 'row': u.row, 'max_hp': u.max_hp,
            'hp': round(u.hp), 'rage': round(u.rage), 'alive': u.alive,
            'is_summon': u.is_summon, 'level': u.level, 'role': u.role,
            'rarity': u.rarity, 'faction': u.faction,
            'status': {**{k: v for k, v in u.status.items() if v > 0},
                       **({'连环': u.chain['turns']} if getattr(u, 'chain', None) else {})},
            'dots': {k: v.get('stacks', 1) for k, v in u.dots.items()},
            'cd': dict(u.cd),
        } for u in self.units]

    def use_combo(self, side=0):
        """释放合击技：由羁绊解锁，全队平均怒气≥60 时可用，每场一次。"""
        if self.done or self.combo_used or not getattr(self, 'combos_a', None):
            return None
        allies = [u for u in self.units if u.alive and u.side == side]
        if not allies:
            return None
        if self.round < 2:
            return {'error': '第 2 回合后才能释放合击'}
        combo = self.combos_a[0]
        start = len(self.events)
        main = combo.get('main', '武勇')
        src = max(allies, key=lambda u: u.stat(main))
        sk = {'name': combo.get('name', '合击'), 'main': main,
              'sub': combo.get('sub', '机变'), 'mult': '0%', 'desc': combo.get('desc', '')}
        kind = combo.get('effect')
        enemies = [u for u in self.units if u.alive and u.side != side]
        if kind == 'heal':
            for a in allies:
                self.heal(src, a, pct=0.25, skill=combo.get('name', '合击'))
                a.add_buff('dr', 0.10, 2)
        elif kind == 'damage_all':
            for e in list(enemies):
                if not e.alive:
                    continue
                self.deal_damage(src, e, sk, 0.8, is_basic=False, chain=False)
                if e.alive and self.rng.random() < 0.30:
                    e.status['眩晕'] = max(e.status.get('眩晕', 0), 1)
                    self.ev('status', src=src.name, src_side=side, dst=e.name,
                            dst_side=e.side, status='眩晕')
        elif kind == 'strategy_all':
            smart = max(allies, key=lambda u: u.stat('智谋'))
            ssk = {'name': combo.get('name', '合击'), 'main': '智谋',
                   'sub': '机变', 'mult': '0%', 'desc': '策略合击'}
            for e in list(enemies):
                if not e.alive:
                    continue
                self.deal_damage(smart, e, ssk, 0.8, is_basic=False, chain=False)
                if e.alive:
                    e.status['虚弱'] = max(e.status.get('虚弱', 0), 1)
                    self.ev('status', src=smart.name, src_side=side, dst=e.name,
                            dst_side=e.side, status='虚弱')
        elif kind == 'damage_single':
            if enemies:
                e = max(enemies, key=lambda u: u.hp)
                self.deal_damage(src, e, sk, 2.2, is_basic=False, chain=False)
                if e.alive:
                    e.status['眩晕'] = max(e.status.get('眩晕', 0), 1)
                    self.ev('status', src=src.name, src_side=side, dst=e.name,
                            dst_side=e.side, status='眩晕')
        elif kind == 'buff_team':
            for a in allies:
                a.add_buff('atk', 0.15, 2)
                self.heal(src, a, pct=0.15, skill=combo.get('name', '合击'))
        elif kind == 'shield_team':
            for a in allies:
                a.shield += a.max_hp * 0.15
                a.add_buff('dr', 0.10, 2)
        for a in allies:
            a.rage = max(0.0, a.rage - 30.0)
        self.combo_used = True
        self.ev('combo', name=combo.get('name', '合击'), side=side,
                desc=combo.get('desc', ''))
        if not any(u.alive for u in self.units if u.side != side):
            self.judge()
        return {'done': self.done, 'winner': self.winner, 'round': self.round,
                'events': self.events[start:], 'units': self.state_units(),
                'prompt': None, 'combo_used': True}

    def step(self, auto=True, skill_type=None):
        start = len(self.events)
        if self.done:
            return {'done': True, 'winner': self.winner, 'round': self.round,
                    'events': [], 'prompt': None, 'units': self.state_units()}
        if self.pending:
            pending = self.pending
            self.pending = None
            u = pending['unit']
            self.take_turn(u, skill_type or '普攻')
            self.finish_turn(u)
            return {'done': self.done, 'winner': self.winner, 'round': self.round,
                    'events': self.events[start:], 'prompt': None, 'units': self.state_units()}
        alive = [u for u in self.units if u.alive]
        if not alive:
            self.judge()
            return {'done': True, 'winner': self.winner, 'round': self.round,
                    'events': self.events[start:], 'prompt': None, 'units': self.state_units()}
        u = min(alive, key=lambda x: (x.next_time, self.rng.random()))
        if not self.prepare_turn(u):
            self.finish_turn(u)
            return {'done': self.done, 'winner': self.winner, 'round': self.round,
                    'events': self.events[start:], 'prompt': None, 'units': self.state_units()}
        if not auto and u.side == 0 and not u.is_summon:
            skills = self.available_skills(u)
            self.pending = {'unit': u, 'skills': skills}
            return {'done': self.done, 'winner': self.winner, 'round': self.round,
                    'events': self.events[start:],
                    'prompt': {'unit': u.name, 'side': u.side, 'hp': round(u.hp),
                               'max_hp': u.max_hp, 'rage': round(u.rage), 'skills': skills},
                    'units': self.state_units()}
        self.take_turn(u, skill_type if not auto else None)
        self.finish_turn(u)
        return {'done': self.done, 'winner': self.winner, 'round': self.round,
                'events': self.events[start:], 'prompt': None, 'units': self.state_units()}

    def cast(self, u, sk, power=1.0):
        eff = parse_effect(sk)
        desc = sk.get('desc') or ''
        # 姜维 继志：复制我方上一次释放的战法
        if '复制我方一名友军上一次释放的战法效果' in desc:
            self.copy_strategy(u)
            return
        # 制衡：重分配我方全体怒气，并为怒气最低者补足 50
        if '重新分配我方全体怒气' in desc:
            allies = [x for x in self.units if x.alive and x.side == u.side]
            if allies:
                avg = sum(a.rage for a in allies) / len(allies)
                for a in allies:
                    a.rage = min(100.0, avg)
                low = min(allies, key=lambda a: a.rage)
                low.rage = min(100.0, low.rage + 50.0)
                self.ev('rage', src=u.name, src_side=u.side, dst=low.name,
                        dst_side=low.side, amount=round(low.rage))
            return
        # 文丑 死斗：“减伤30%”属于自身，不能按敌方减益解析
        if '死斗' in desc and '互攻' in desc:
            eff['buffs'] = [b for b in eff['buffs'] if b[0] != '减伤']
        # 伤害
        hit_targets = []
        if eff['damage']:
            targets = self.targets(u, eff['target'])
            hit_targets = list(targets)
            mult = eff['damage']
            if u.multi_segment_plus:
                mm = MULTI_RE.search(desc)
                if mm:
                    n = int(mm.group(1))
                    mult *= (n + 1) / n
            mult *= power   # 复制战法时按威力折扣
            if sk.get('type') == '普攻':
                mult *= 1.25   # 普攻基础权重，避免被 AoE 技能完全压过
            hits = max(1, int(eff.get('hits') or 1))
            if hits > 1:
                for _ in range(hits):
                    t = targets[self.rng.randrange(len(targets))] if targets else None
                    if t and t.alive:
                        self.deal_damage(u, t, sk, mult, is_basic=(sk.get('type') == '普攻'))
            else:
                if eff['target'][0] in ('enemy_all', 'enemy_front', 'enemy_back') and len(targets) > 1:
                    mult *= 1.0 / math.sqrt(len(targets))
                for t in targets:
                    self.deal_damage(u, t, sk, mult, is_basic=(sk['type'] == '普攻'))
            # 甘宁 百骑：首回合必定追击一次
            if u.first_round_chase and self.round == 1 and not u.first_round_used:
                u.first_round_used = True
                for t in targets:
                    if t.alive:
                        self.deal_damage(u, t, sk, u.first_round_chase)
                        break
            if eff['true_pct']:
                for t in targets:
                    lost = max(0.0, t.max_hp - t.hp)
                    td = int(lost * eff['true_pct'] * power)
                    if td > 0 and t.alive:
                        t.hp -= td
                        self.ev('true_damage', src=u.name, src_side=u.side, dst=t.name, dst_side=t.side, dmg=td, dst_hp=round(t.hp))
                        if t.hp <= 0:
                            self._kill(t, u, 0)
        # 普攻附加：连续突刺 / 概率追击 / 概率眩晕
        if sk['type'] == '普攻' and hit_targets:
            if u.basic_multi:
                hits, per, first_crit = u.basic_multi
                for i in range(max(0, hits - 1)):
                    if i == 0 and first_crit:
                        u.forced_crit = 1
                    for t in list(hit_targets):
                        if t.alive:
                            self.deal_damage(u, t, sk, per, is_basic=True)
                u.forced_crit = 0
            if u.extra_hit and self.rng.random() < u.extra_hit[0]:
                for t in list(hit_targets):
                    if t.alive:
                        self.deal_damage(u, t, sk, u.extra_hit[1], is_basic=False)
            if u.basic_stun:
                for t in hit_targets:
                    if t.alive and self.rng.random() < u.basic_stun[0]:
                        t.status['眩晕'] = max(t.status.get('眩晕', 0), u.basic_stun[1])
                        self.ev('control', src=u.name, src_side=u.side, dst=t.name,
                                dst_side=t.side, status='眩晕')
        # 黄盖 苦肉计：自损兵力换群体伤害
        if '自身损失' in desc and '等同损失量' in desc:
            m = re.search(r'自身损失(\d+)%兵力', desc)
            pct = int(m.group(1)) / 100.0 if m else 0.3
            loss = int(min(max(0, u.hp - 1), u.max_hp * pct))
            if loss > 0:
                u.hp -= loss
                self.ev('self_damage', unit=u.name, side=u.side, amount=loss, hp=round(u.hp))
                mm = re.search(r'等同损失量[×xX*](\d+)', desc)
                amt = loss * (int(mm.group(1)) if mm else 3)
                amt *= (1 + u.self_damage_bonus) * power
                for t in [x for x in self.units if x.alive and x.side != u.side]:
                    self.flat_damage(u, t, amt, sk)
        # 文丑 死斗：与指定敌人互攻
        if '死斗' in desc and '互攻' in desc:
            self.start_deathmatch(u, desc)
        # 庞统 连环计：给敌方全体挂连环
        if '连环' in desc and '传递给相邻' in desc:
            m = re.search(r'持续(\d+)回合', desc)
            turns = int(m.group(1)) if m else 2
            for t in [x for x in self.units if x.alive and x.side != u.side]:
                t.chain = {'turns': turns, 'no_decay': u.transfer_no_decay}
                self.ev('chain', src=u.name, src_side=u.side, dst=t.name, dst_side=t.side)
        if eff['dispel']:
            enemy = '敌方' in eff['raw']
            pool = [x for x in self.units if x.alive and x.side != u.side] if enemy else [x for x in self.units if x.alive and x.side == u.side]
            for t in pool:
                if t.buffs:
                    for _ in range(min(eff['dispel'], len(t.buffs))):
                        t.buffs.pop()
                    self.ev('dispel', src=u.name, src_side=u.side, dst=t.name, dst_side=t.side)
        if eff['summon']:
            self.summon(u, eff['summon'])
        if eff['extra_action']:
            u.extra_action = True
        # 治疗
        if eff['heal'] or eff['heal_stat']:
            targets = self.targets(u, eff['heal_target'])
            for t in targets:
                if eff['heal_stat']:
                    st, coef = eff['heal_stat']
                    self.heal(u, t, flat=u.stat(st) * coef * power, skill=sk.get('name', ''))
                else:
                    self.heal(u, t, pct=eff['heal'] * power, skill=sk.get('name', ''))
        # 护盾
        if eff['shield']:
            stat, coef = eff['shield']
            targets = self.targets(u, eff['heal_target'])
            boost = 1 + u.shield_boost + sum(
                a.team_shield_aura for a in self.units if a.alive and a.side == u.side)
            for t in targets:
                t.shield += u.stat(stat) * coef * power * boost
        # 怒气
        if eff['rage']:
            targets = self.targets(u, eff['heal_target'])
            for t in targets:
                t.rage = max(0.0, min(100.0, t.rage + eff['rage']))
        # 增益/减益
        for item in eff['buffs']:
            stat, val, turns, enemy_side, target_self = item
            if target_self:
                targets = [u]
            else:
                targets = self.targets(u, ('enemy_all' if enemy_side else 'ally_all'))
            key = {'攻击': 'atk', '防御': 'dr', '暴击率': 'crit', '暴击伤害': 'crit_dmg',
                   '速度': 'speed', '效果命中': 'effect_hit', '效果抵抗': 'dr', '效果抗性': 'dr', '控制命中': 'effect_hit',
                   '减伤': 'dr', '受到伤害': 'dr', '治疗效果': 'heal',
                   '兵力上限': 'hp', '策略伤害': 'strategy', '全属性': 'atk'}.get(stat, 'atk')
            if stat == '受到伤害':
                val = -val
            if u.buff_boost:
                val *= 1 + u.buff_boost
                turns = max(1, int(round(turns * (1 + u.buff_boost))))
            turns += u.buff_dur
            for t in targets:
                t.add_buff(key, val, turns, src=u)
                if key == 'speed' and val < 0 and t.side != u.side:
                    t.slow_count += 1
        # 控制
        for item in eff['control']:
            if len(item) == 4:
                kind, stacks, turns, enemy_side = item
            else:
                kind, turns, enemy_side = item
                stacks = 1
            targets = self.targets(u, ('enemy_all' if enemy_side else 'ally_all'))
            for t in targets:
                if kind in ('灼烧', '剧毒', '雷印'):
                    cap = u.lei_stack_max if kind == '雷印' else u.dot_stack_max
                    old = t.dots.get(kind)
                    if old and cap:
                        stacks = min(cap, old['stacks'] + stacks)
                    elif old:
                        stacks = max(old['stacks'], stacks)
                    dur = max(1, turns + u.dot_dur)
                    if old:
                        dur = max(dur, old.get('turns', 0))
                    t.dots[kind] = {'stacks': stacks, 'turns': dur, 'src': u,
                                    'crit': u.dot_crit, 'burn': u.burn_dot_bonus,
                                    'lei_dr': 0.05 if u.lei_stack_max else 0.0}
                    if EMIT_DETAIL_EVENTS:
                        self.ev('dot_apply', src=u.name, src_side=u.side, dst=t.name,
                                dst_side=t.side, dot=kind, stacks=stacks)
                    if kind == '灼烧':
                        for a in self.units:
                            if a.alive and a.side == u.side and a.burn_rage:
                                a.rage = min(100.0, a.rage + a.burn_rage)
                    if kind == '灼烧' and u.dot_spread:
                        others = [x for x in self.units if x.alive and x.side == t.side and x is not t]
                        if others and self.rng.random() < u.dot_spread:
                            o = self.rng.choice(others)
                            od = o.dots.get('灼烧')
                            if od:
                                od['stacks'] += 1
                            else:
                                o.dots['灼烧'] = {'stacks': 1, 'turns': dur, 'src': u,
                                                  'crit': u.dot_crit, 'burn': u.burn_dot_bonus, 'lei_dr': 0.0}
                else:
                    if t.immune_control or kind in t.control_immune_extra:
                        continue
                    if t.immune_control_once:
                        t.immune_control_once = False
                        self.ev('immune_control', unit=t.name, side=t.side)
                        continue
                    resist = t.control_resist_value()
                    for a in self.units:
                        if a.alive and a.side == t.side:
                            resist += a.team_effect_resist
                    if self.rng.random() <= max(0.0, u.effect_hit() - resist):
                        dur = turns + u.control_dur_plus - t.control_dur_reduce
                        if '随机' in desc:
                            dur += u.random_control_dur
                        dur = max(1, dur)
                        t.status[kind] = max(t.status.get(kind, 0), dur)
                        if EMIT_DETAIL_EVENTS:
                            self.ev('control', src=u.name, src_side=u.side, dst=t.name,
                                    dst_side=t.side, status=kind)
                        if kind == '嘲讽':
                            t.taunt_source = u
                            if u.team_taunt_rage:
                                for a in [x for x in self.units if x.alive and x.side == u.side]:
                                    a.rage = min(100.0, a.rage + u.team_taunt_rage)
                    elif u.resist_refund:
                        u.rage = min(100.0, u.rage + 50.0 * u.resist_refund)
        # 破甲标记
        m = re.search(r'破甲(\d+)%', desc)
        if m:
            for t in [x for x in self.units if x.alive and x.side != u.side]:
                t.status['破甲'] = max(t.status.get('破甲', 0), 2)
                if EMIT_DETAIL_EVENTS:
                    self.ev('debuff', src=u.name, src_side=u.side, dst=t.name,
                            dst_side=t.side, status='破甲')
        # 大乔 流离：转移控制
        if '转移' in desc and '控制' in desc:
            allies = [x for x in self.units if x.alive and x.side == u.side]
            carrier = next((a for a in allies if a.status), None)
            enemies = [x for x in self.units if x.alive and x.side != u.side]
            if carrier and enemies:
                key = next(iter(carrier.status))
                turns = carrier.status.pop(key)
                tgt = self.rng.choice(enemies)
                tgt.status[key] = max(tgt.status.get(key, 0), turns)
                self.ev('transfer', src=u.name, src_side=u.side, dst=tgt.name, dst_side=tgt.side, status=key)
                if u.transfer_slow:
                    for e in enemies:
                        e.add_buff('speed', -u.transfer_slow, 2, src=u)
        # 左慈 遁甲天书：复制队友增益
        if '复制' in desc and '增益' in desc:
            allies = [x for x in self.units if x.alive and x.side == u.side]
            donors = [a for a in allies if a.buffs]
            if donors:
                src = self.rng.choice(donors)
                snapshot = list(src.buffs)
                for a in allies:
                    for b in snapshot:
                        a.add_buff(b['stat'], b['value'], b['turns'], src=u)
        # 战法后团队机制
        if sk['type'] == '战法':
            for name in ('奇正相生', '鼓舞'):
                if name in u.flags:
                    vals = u.flags[name]
                    team = [x for x in self.units if x.side == u.side and x.alive]
                    if name == '鼓舞':
                        for a in team: a.rage = min(100.0, a.rage + vals[0])
                    else:
                        for a in team: a.perm['effect_hit'] += vals[0] / 100.0
            if u.after_skill_extra:
                u.extra_action = True

    def flat_damage(self, src, dst, amount, sk):
        """固定值伤害（苦肉计等），只吃防御减伤与护盾，不走命中/暴击。"""
        if not dst.alive or amount <= 0:
            return
        ramp_start = 6 if sum(1 for x in self.units if not x.is_summon) <= 2 else 7
        if self.round > ramp_start:
            amount *= 1 + 0.14 * (self.round - ramp_start)
        dmg = max(1, int(amount * (1 - min(0.9, dst.damage_reduction()))))
        if dst.shield > 0:
            absorb = min(dst.shield, dmg)
            dst.shield -= absorb
            dmg -= absorb
            if dmg <= 0:
                return
        dst.hp -= dmg
        dst.rage = min(100.0, dst.rage + 15)
        self.ev('damage', src=src.name, src_side=src.side, dst=dst.name, dst_side=dst.side,
                skill=sk.get('name', ''), dmg=dmg, crit=False, dst_hp=round(dst.hp))
        if dst.hp <= 0:
            self._kill(dst, src, 0)
            if not dst.alive and src.alive:
                self.on_kill(src, dst)

    def _counter_dr(self, u):
        return min(0.8, sum(a.team_counter_dr for a in (getattr(u, 'team_units', None) or []) if a.alive))

    def transfer_chain(self, src, dst, dmg):
        """连环传递：把本次伤害按比例传给相邻的连环目标。"""
        info = getattr(dst, 'chain', None)
        if not info or dmg <= 0:
            return
        team = [x for x in self.units if x.alive and x.side == dst.side]
        if len(team) < 2:
            return
        try:
            i = team.index(dst)
        except ValueError:
            return
        amt = max(1, int(dmg * (1.0 if info.get('no_decay') else 0.5)))
        neighbors = []
        if i > 0:
            neighbors.append(team[i - 1])
        if i + 1 < len(team):
            neighbors.append(team[i + 1])
        for t in neighbors:
            if t is dst or not t.alive or not getattr(t, 'chain', None):
                continue
            t.hp -= amt
            t.rage = min(100.0, t.rage + 15)
            self.ev('chain_damage', src=src.name, src_side=src.side, dst=t.name, dst_side=t.side,
                    dmg=amt, dst_hp=round(t.hp))
            if t.hp <= 0:
                self._kill(t, src, 0)
                if not t.alive and src.alive:
                    self.on_kill(src, t)

    def copy_strategy(self, u):
        """姜维 继志：复制我方最近一次战法，按 copy_power（默认 70%）结算。"""
        hist = self.strategy_history.get(u.side) or []
        rec = None
        for caster, sk in reversed(hist):
            if caster is u:
                continue
            rec = (caster, sk)
            break
        if not rec:
            self.ev('copy_none', unit=u.name, side=u.side)
            return
        caster, sk = rec
        power = u.copy_power if u.copy_power > 0 else 0.7
        self.ev('copy', unit=u.name, side=u.side, src=caster.name, skill=sk.get('name', '战法'),
                power=round(power, 2))
        self.cast(u, sk, power=power)

    def start_deathmatch(self, u, desc):
        """文丑 死斗：选定一名敌人互攻，自身获得减伤。"""
        enemies = [x for x in self.units if x.alive and x.side != u.side]
        if not enemies:
            return
        if self.deathmatch:
            self.deathmatch['a'].in_deathmatch = False
            self.deathmatch = None
        foe = max(enemies, key=lambda x: x.stat('武勇'))
        m = re.search(r'死斗(\d+)回合', desc)
        turns = int(m.group(1)) if m else 2
        self.deathmatch = {'a': u, 'b': foe, 'turns': turns}
        u.in_deathmatch = True
        u.add_buff('dr', 0.3, turns, src=u)
        self.ev('deathmatch', unit=u.name, side=u.side, foe=foe.name, foe_side=foe.side, turns=turns)

    def resolve_deathmatch(self):
        """每回合结束时，死斗双方额外互攻一次。"""
        dm = self.deathmatch
        if not dm:
            return
        a, b = dm['a'], dm['b']
        if not a.alive or not b.alive:
            a.in_deathmatch = False
            self.ev('deathmatch_end', unit=a.name, side=a.side)
            self.deathmatch = None
            return
        basic = {'name': '互攻', 'type': '普攻', 'main': '武勇', 'sub': '机变',
                 'mult': '100%', 'desc': '', 'cd': 0}
        for src, dst in ((a, b), (b, a)):
            if not (src.alive and dst.alive):
                continue
            sk = src.skills.get('普攻') or basic
            self.deal_damage(src, dst, sk, 1.0, is_basic=True)
        dm['turns'] -= 1
        if dm['turns'] <= 0 or not a.alive or not b.alive:
            a.in_deathmatch = False
            self.ev('deathmatch_end', unit=a.name, side=a.side)
            self.deathmatch = None

    def summon(self, u, spec):
        count, coef, duration = spec
        if u.summon_boost:
            coef = max(coef, u.summon_boost[0])
            duration += u.summon_boost[1]
        for i in range(count):
            rec = {'姓名': f'{u.name}·召唤物{i+1}', '阵营': u.faction, '稀有度': u.rarity,
                   '定位': u.role, '兵种': '步兵'}
            for k in SIX:
                rec[k] = int(u.stats[k] * coef)
                rec[k + '成长'] = 0
            main = (u.skills.get('普攻') or {}).get('main', '武勇')
            sub = (u.skills.get('普攻') or {}).get('sub', '机变')
            basic = {'name': '召唤物攻击', 'type': '普攻', 'main': main, 'sub': sub,
                     'mult': '100%', 'desc': '对单体造成100%物理伤害', 'cd': 0}
            m = Unit(rec, {'普攻': basic}, [])
            m.stats = {k: u.stats[k] * coef for k in SIX}
            m.stats0 = {k: u.stats0[k] * coef for k in SIX}
            m.level = u.level
            m.is_summon = True
            m.summoner = u
            m.duration = duration
            m.side = u.side
            m.row = 'back'
            m.max_hp = max(1, int(u.max_hp * coef))
            m.hp = m.max_hp
            m.next_time = u.next_time
            m.battle = self
            m.team_units = [x for x in self.units if x.side == u.side]
            self.units.append(m)
            self.ev('summon', src=u.name, src_side=u.side, unit=m.name, side=u.side)

    def targets(self, u, target):
        if isinstance(target, str):
            target = (target, 0)
        allies = [x for x in self.units if x.alive and x.side == u.side]
        enemies = [x for x in self.units if x.alive and x.side != u.side and x.untargetable <= 0]
        if not enemies:
            enemies = [x for x in self.units if x.alive and x.side != u.side]
        kind, n = target
        if kind.startswith('enemy'):
            if u.status.get('嘲讽') and u.taunt_source and u.taunt_source.alive:
                return [u.taunt_source]
            if u.status.get('魅惑'):
                return allies
            if u.status.get('混乱'):
                pool = allies + enemies
                return [self.rng.choice(pool)] if pool else []
        if kind.startswith('enemy'):
            pool = enemies
            if u.ignore_row_first and self.round == 1 and kind in ('enemy_single', 'enemy_front', 'enemy_back'):
                return [self.rng.choice(pool)] if pool else []
            if kind == 'enemy_all':
                return pool
            if kind == 'enemy_front':
                r = [x for x in pool if x.row == 'front'] or pool
                return r[:1]
            if kind == 'enemy_back':
                r = [x for x in pool if x.row == 'back'] or pool
                return r[:1]
            if kind == 'enemy_random':
                return self.rng.sample(pool, min(n or 1, len(pool)))
            r = [x for x in pool if x.row == 'front'] or pool
            return r[:1]
        if kind == 'self':
            return [u]
        if kind == 'ally_lowest':
            return [min(allies, key=lambda x: x.hp / max(1, x.max_hp))] if allies else []
        if kind == 'ally_random':
            return [self.rng.choice(allies)] if allies else []
        return allies

    def deal_damage(self, src, dst, sk, mult, is_basic=False, depth=0, chain=True):
        if not dst.alive or not src.alive:
            return
        if getattr(dst, 'invuln_rounds', 0) > 0:
            self.ev('immune', unit=dst.name, side=dst.side)
            return
        # 闪避
        if self.rng.random() < dst.dodge_chance():
            self.ev('dodge', src=src.name, src_side=src.side, dst=dst.name, dst_side=dst.side)
            if dst.on_dodge_heal:
                self.heal(dst, dst, pct=dst.on_dodge_heal)
            if dst.on_dodge_counter and src.alive:
                base = max(1, int(dst.stat('武勇') * dst.on_dodge_counter))
                src.hp -= max(1, int(base * (1 - self._counter_dr(src))))
                if src.hp <= 0:
                    self._kill(src, dst, depth)
            return
        main = sk.get('main') or '武勇'
        sub = sk.get('sub') or '机变'
        atk = src.stat(main) * (1 + src.atk_bonus())
        # 系数用一级基础属性：避免属性成长带来伤害平方级膨胀、TTK 随等级崩塌
        m = mult * (1 + src.stats0.get(main, 0) * 0.0065 + src.stats0.get(sub, 0) * 0.0026)
        raw = atk * m
        _tc = TROOP_COUNTER.get(src.troop)
        if _tc == dst.troop:
            raw *= 1.12
        elif TROOP_COUNTER.get(dst.troop) == src.troop:
            raw *= 0.92
        if '策略' in (sk.get('desc') or ''):
            strat_aura = src.team_bonus('strategy')
            raw *= 1 + src.perm['strategy_dmg'] + src.buff_sum('strategy') + strat_aura
        # 天赋增伤
        if src.flags.get('斩弱') and dst.hp / max(1, dst.max_hp) < 0.5:
            raw *= 1 + src.flags['斩弱'][0] / 100.0
        if src.flags.get('先声夺人') and self.round == 1:
            raw *= 1 + src.flags['先声夺人'][0] / 100.0
        if src.flags.get('乘隙'):
            debuffs = len(dst.dots) + sum(1 for k in ('虚弱',) if dst.status.get(k))
            raw *= 1 + src.flags['乘隙'][0] / 100.0 * debuffs
        if src.flags.get('破虚') and dst.is_debuffed():
            raw *= 1 + src.flags['破虚'][0] / 100.0
        if getattr(src, 'chengsheng_turn', 0):
            raw *= 1 + (src.flags.get('乘胜追击') or [0])[0] / 100.0
        if src.kill_damage and getattr(src, 'chengsheng_turn', 0):
            raw *= 1 + src.kill_damage[0] / 100.0
        if src.low_hp and src.hp / max(1, src.max_hp) < src.low_hp[0] / 100.0:
            if src.low_hp[1] == '攻击' or src.low_hp[1] == '全属性':
                raw *= 1 + src.low_hp[2] / 100.0
        if src.high_hp and src.hp / max(1, src.max_hp) > src.high_hp[0] / 100.0:
            raw *= 1 + src.high_hp[1] / 100.0
        if src.deathmatch_bonus and getattr(src, 'in_deathmatch', False):
            raw *= 1 + src.deathmatch_bonus
        if src.backline_bonus and dst.row == 'back':
            raw *= 1 + src.backline_bonus
        if src.multi_hit_bonus and ('次' in (sk.get('desc') or '') or '段' in (sk.get('desc') or '')):
            raw *= 1 + src.multi_hit_bonus
        if src.per_status:
            cnt = sum(1 for x in self.units if x.alive and x.side != src.side and (src.per_status[0] in x.status or src.per_status[0] in x.dots))
            raw *= 1 + src.per_status[1] * cnt
        if src.first_round_bonus and self.round == 1:
            raw *= 1 + src.first_round_bonus
        desc = sk.get('desc') or ''
        allies = [x for x in self.units if x.alive and x.side == src.side]
        if dst.row == 'back' and allies:
            raw *= 1 + sum(a.team_backline_bonus for a in allies)
        if dst.status.get('破甲') and allies:
            raw *= 1 + sum(a.team_armor_break_bonus for a in allies)
        if (dst.status or dst.dots) and allies:
            raw *= 1 + sum(a.team_control_bonus for a in allies)
        if dst.hp / max(1, dst.max_hp) < 0.5:
            lb = max([a.team_low_bonus[1] for a in allies if a.team_low_bonus] or [0.0])
            raw *= 1 + lb
        if self.round == 1:
            raw *= 1 + sum(a.team_first_round_bonus for a in allies)
        if '策略' in desc:
            ramps = [a.team_strat_ramp for a in allies if a.team_strat_ramp]
            if ramps:
                per, cap = max(ramps)
                raw *= 1 + min(cap, per * (self.round - 1))
        if '连射' in desc and allies:
            raw *= 1 + sum(a.team_chain_bonus for a in allies)
        if ('段' in desc or '次' in desc) and allies:
            raw *= 1 + sum(a.team_multiseg for a in allies)
        if src.consecutive_bonus:
            if src.last_target is dst:
                src.consecutive_stacks += 1
            else:
                src.consecutive_stacks = 0
            raw *= 1 + min(src.consecutive_bonus[1], src.consecutive_bonus[0] * src.consecutive_stacks)
        if src.per_debuff_bonus:
            raw *= 1 + src.per_debuff_bonus * (len(dst.dots) + len(dst.status))
        for a in allies:
            if a.team_bonus_vs and dst.name in a.team_bonus_vs[0]:
                raw *= 1 + a.team_bonus_vs[1]
            if a.team_troop_vs and (src.troop, dst.troop) == a.team_troop_vs[0]:
                raw *= 1 + a.team_troop_vs[1]
        if '策略' in desc:
            per = sum(a.per_summon_strat for a in allies)
            if per:
                raw *= 1 + per * sum(1 for x in self.units
                                     if x.alive and x.side == src.side and x.is_summon)
        # ---- 2026-11-19 补齐天赋的增伤
        if src.dmg_vs_status:
            key, val = src.dmg_vs_status
            hit = (key == 'controlled' and (bool(dst.status) or bool(dst.dots))) or (key in dst.status or key in dst.dots)
            if hit:
                raw *= 1 + val
        if src.dmg_vs_role and dst.role.startswith(src.dmg_vs_role[0]):
            raw *= 1 + src.dmg_vs_role[1]
        if src.dmg_vs_low and dst.hp / max(1, dst.max_hp) < src.dmg_vs_low[0] / 100.0:
            raw *= 1 + src.dmg_vs_low[1]
        if src.dmg_vs_full and dst.hp >= dst.max_hp:
            raw *= 1 + src.dmg_vs_full
        if src.dmg_vs_high and dst.hp / max(1, dst.max_hp) >= src.dmg_vs_high[0] / 100.0:
            raw *= 1 + src.dmg_vs_high[1]
        if src.armor_break_bonus and dst.status.get('破甲'):
            raw *= 1 + src.armor_break_bonus
        if src.chase_bonus and ('追击' in desc or '连射' in desc or '次' in desc):
            raw *= 1 + src.chase_bonus
        if src.chain_bonus and '连射' in desc:
            raw *= 1 + src.chain_bonus
        if src.charge_bonus and src.troop == '骑兵':
            raw *= 1 + src.charge_bonus
        if src.ambush_bonus and dst.row == 'back':
            raw *= 1 + src.ambush_bonus
        if src.slow_strategy_vuln and '策略' in desc and dst.slow_count:
            if any(a.alive and a.side == src.side and a.slow_strategy_vuln for a in self.units):
                raw *= 1 + src.slow_strategy_vuln * dst.slow_count
        # 战意增长：1v1 从第 6 回合、团队战从第 7 回合起逐步增伤
        ramp_start = 6 if sum(1 for x in self.units if not x.is_summon) <= 2 else 7
        if self.round > ramp_start:
            raw *= 1 + 0.14 * (self.round - ramp_start)
        if src.side != dst.side:
            for a in self.units:
                if a.alive and a.side == src.side and a.backline_vuln and dst.row == 'back':
                    raw *= 1 + a.backline_vuln
                    break
        elif src.side == dst.side:
            for a in self.units:
                if a.alive and a.side != src.side and a.friendly_fire_bonus:
                    raw *= 1 + a.friendly_fire_bonus
                    break
        # 阵营克制
        if COUNTER.get(src.faction) == dst.faction:
            raw *= 1.25
        elif COUNTER.get(dst.faction) == src.faction:
            raw *= 0.85
        # 暴击
        is_first = getattr(src, 'first_attack_used', -1) != self.round
        is_crit = self.rng.random() < src.crit() or getattr(src, 'forced_crit', 0) > 0
        if src.first_attack_crit and is_first:
            src.first_attack_used = self.round
            is_crit = True
        if is_first and any(a.team_first_attack_crit for a in allies):
            is_crit = True
        if src.crit_vs_leiyin and sk.get('type') == '战法' and dst.dots.get('雷印'):
            is_crit = True
        if is_crit:
            raw *= src.crit_dmg()
        if is_crit and dst.crit_reduce:
            raw *= 1 - dst.crit_reduce
        # 防御减伤 + 天赋
        dtype = 'strategy' if '策略' in desc else 'physical'
        dr = dst.damage_reduction(dtype)
        if dst.status.get('虚弱') and any(a.team_ignores_weak for a in allies):
            dr -= 0.15
        if dst.low_hp and dst.low_hp[1] in ('防御', '全属性') and dst.hp / max(1, dst.max_hp) < dst.low_hp[0] / 100.0:
            dr += dst.low_hp[2] / 100.0
        if dst.flags.get('铁壁') and self.rng.random() < dst.flags['铁壁'][0] / 100.0:
            dr += dst.flags['铁壁'][1] / 100.0
        # 穿透
        pen = src.perm.get('pen', 0.0)
        if '混合' in desc:
            pen += src.mixed_pen
        if '单体' in desc:
            pen += src.single_pen
        if src.last_target is dst:
            pen += src.consecutive_pen
        if is_first:
            pen += src.first_attack_pen
        if self.round == 1:
            pen += src.first_round_pen
        if dst.row == 'back':
            pen += src.backline_pen
        if pen:
            dr -= pen
        # 团队减伤光环
        for a in self.units:
            if not a.alive or a.side != dst.side:
                continue
            if a.team_faction_dr and dst.faction == a.team_faction_dr[0]:
                dr += a.team_faction_dr[1]
            if a.team_troop_dr and dst.troop == a.team_troop_dr[0]:
                dr += a.team_troop_dr[1]
            if a.team_dr_first5:
                rounds, val = a.team_dr_first5 if isinstance(a.team_dr_first5, tuple) else (5, a.team_dr_first5)
                if self.round <= rounds:
                    dr += val
        if is_crit and dst.flags.get('抗暴'):
            raw *= 1 - dst.flags['抗暴'][0] / 100.0
        raw *= (1 - min(0.9, dr))
        dmg = max(1, int(raw))
        src.last_target = dst
        # 护盾
        shield_before = dst.shield
        if dst.shield > 0:
            absorb = min(dst.shield, dmg)
            dst.shield -= absorb
            dmg -= absorb
            if shield_before > 0 and dst.shield <= 0:
                for a in self.units:
                    if a.alive and a.side == dst.side and a.shield_break_heal:
                        self.heal(a, dst, pct=a.shield_break_heal)
                        break
        # 主将代伤（典韦/曹洪）
        main = (getattr(dst, 'team_units', None) or [dst])[0]
        if dmg >= dst.hp and dst is main:
            guard = next((a for a in self.units if a.alive and a.side == dst.side
                          and a.bodyguard and not a.bodyguard_used), None)
            if guard:
                half = dmg // 2
                guard.bodyguard_used = True
                guard.hp -= half
                dmg -= half
                self.ev('bodyguard', src=src.name, src_side=src.side, dst=dst.name,
                        dst_side=dst.side, guard=guard.name, guard_side=guard.side, dmg=half)
                if guard.bodyguard_heal:
                    self.heal(guard, dst, pct=guard.bodyguard_heal)
                if guard.hp <= 0:
                    self._kill(guard, src, 0)
        dst.hp -= dmg
        self.ev('damage', src=src.name, src_side=src.side, dst=dst.name, dst_side=dst.side, skill=sk['name'], dmg=dmg, crit=is_crit, dst_hp=round(dst.hp))
        if is_crit and src.crit_rage:
            src.rage = min(100.0, src.rage + src.crit_rage)
        if dst.hit_atk_ramp:
            dst.hit_atk_stacks += 1
        if chain and dmg > 0 and getattr(dst, 'chain', None):
            self.transfer_chain(src, dst, dmg)
        if dst.dr_ramp:
            dst.hit_dr_stacks += 1
        if dst.counter_ramp:
            dst.counter_stacks += 1
        if dst.on_hit_weaken and self.rng.random() < dst.on_hit_weaken[0] and src.alive:
            src.add_buff('atk', -dst.on_hit_weaken[1], 1, src=dst)
        rage_gain = 1 + sum(a.team_rage_gain for a in allies)
        dst.rage = min(100.0, dst.rage + 20 * rage_gain)   # 受击回怒
        if is_basic:
            src.rage = min(100.0, src.rage + 40 * rage_gain)   # 普攻回怒（普攻:受击 = 2:1）
        # 吸血
        if src.perm['lifesteal'] > 0:
            src.hp = min(src.max_hp, src.hp + dmg * src.perm['lifesteal'])
        if src.low_hp_lifesteal and src.hp / max(1, src.max_hp) < src.low_hp_lifesteal[0] / 100.0:
            src.hp = min(src.max_hp, src.hp + dmg * src.low_hp_lifesteal[1])
        # 受击反制
        counter_pct = (dst.flags.get('反震') or [0])[0]
        if dst.counter_ramp and dst.counter_stacks:
            counter_pct += min(dst.counter_ramp[1], dst.counter_ramp[0] * dst.counter_stacks) * 100
        if counter_pct:
            src.hp -= max(1, int(dmg * counter_pct / 100.0 * (1 - self._counter_dr(src))))
        if dst.flags.get('反击之势') and self.rng.random() < dst.flags['反击之势'][0] / 100.0 and src.alive:
            base = max(1, int(src.stat('武勇') * dst.flags['反击之势'][1] / 100.0))
            src.hp -= max(1, int(base * (1 - self._counter_dr(src))))
        if src.hp <= 0:
            self._kill(src, dst, depth)
        if dst.hp <= 0:
            self._kill(dst, src, depth)
        # 击杀奖励
        if not dst.alive and src.alive:
            self.on_kill(src, dst)

    def on_kill(self, src, dst):
        if src.flags.get('凯旋'):
            src.hp = min(src.max_hp, src.hp + src.max_hp * src.flags['凯旋'][0] / 100.0)
        if src.flags.get('乘胜追击'):
            src.chengsheng_turn = 1
            src.next_time -= 1000.0 * (src.flags['乘胜追击'][1] / 100.0) / src.speed()
        if src.flags.get('连破') is not None and '连破' in src.flags:
            src.extra_action = True
        if src.kill_damage:
            src.chengsheng_turn = 1
            src.next_time -= 1000.0 * (src.kill_damage[1] / 100.0) / src.speed()
        if src.kill_advance:
            src.next_time -= 1000.0 * src.kill_advance / src.speed()
        if src.kill_heal:
            src.hp = min(src.max_hp, src.hp + src.max_hp * src.kill_heal[0] / 100.0)
            if src.buffs:
                for _ in range(min(src.kill_heal[1], len(src.buffs))):
                    src.buffs.pop()
        if src.kill_permanent:
            src.perm['atk'] += src.kill_permanent[0] / 100.0
            src.kill_permanent = (src.kill_permanent[0], max(0, src.kill_permanent[1] - 1))
        if src.extra_action_on_kill:
            src.extra_action = True
        if src.kill_crit:
            src.forced_crit = 1
        if src.kill_atk:
            src.perm['atk'] += src.kill_atk

    def _kill(self, u, killer, depth):
        if u.flags.get('不屈') is not None and '不屈' in u.flags and not u.unyielding_used:
            u.unyielding_used = True
            u.hp = 1
            return
        if u.survive_lethal and not u.used_survive:
            u.used_survive = True
            u.hp = max(1, int(u.max_hp * (u.survive_lethal if u.survive_lethal > 0.05 else 0)))
            self.ev('survive', unit=u.name, side=u.side)
            return
        # 刘备 昭烈：友军阵亡时以 30% 兵力复活一次
        for a in self.units:
            if a is not u and a.alive and a.side == u.side and a.team_revive:
                u.hp = max(1, int(u.max_hp * a.team_revive))
                u.shield += a.stat('威仪') * max(1.0, a.team_revive * 5)
                a.team_revive = None
                self.ev('revive', src=a.name, src_side=a.side, dst=u.name, dst_side=u.side)
                return
        # 曹操 唯才是举：友军阵亡时回复其 20% 兵力（每场一次）
        for a in self.units:
            if a is not u and a.alive and a.side == u.side and a.ally_death_heal and not a.ally_death_heal_used:
                u.hp = max(1, int(u.max_hp * a.ally_death_heal))
                a.ally_death_heal_used = True
                self.ev('revive', src=a.name, src_side=a.side, dst=u.name, dst_side=u.side)
                return
        u.hp = 0
        u.alive = False
        self.ev('death', unit=u.name, side=u.side)
        # 姜维 天水麒麟儿：每名蜀将阵亡叠全属性
        for a in [x for x in self.units if x.alive and x.side == u.side and x.ally_death_allstats]:
            faction, per, cap = a.ally_death_allstats
            if u.faction == faction and a._ally_death_gain < cap - 1e-9:
                gain = min(per, cap - a._ally_death_gain)
                a._ally_death_gain += gain
                for k in SIX:
                    a.perm['stat_' + k] += gain
        # 诸葛瞻 绵竹之节：阵亡时全队全属性 + 免死
        if u.death_team_allstats:
            val, surv = u.death_team_allstats
            for a in [x for x in self.units if x.alive and x.side == u.side]:
                for k in SIX:
                    a.perm['stat_' + k] += val
                if surv:
                    a.survive_lethal = max(a.survive_lethal, 0.01)
        # 凌统：主将阵亡时加攻
        main = (getattr(u, 'team_units', None) or [u])[0]
        if u is main:
            for a in [x for x in self.units if x.alive and x.side == u.side]:
                if a.main_death_atk:
                    a.perm['atk'] += a.main_death_atk
        # 张角：召唤物阵亡时雷伤
        if u.is_summon:
            for a in [x for x in self.units if x.alive and x.side == u.side and x.summon_death_aoe]:
                for e in [x for x in self.units if x.alive and x.side != u.side]:
                    dmg = max(1, int(a.stat('智谋') * a.summon_death_aoe))
                    e.hp -= dmg
                    self.ev('damage', src=a.name, src_side=a.side, dst=e.name,
                            dst_side=e.side, skill='雷伤', dmg=dmg, crit=False, dst_hp=round(e.hp))
                    if e.hp <= 0:
                        self._kill(e, a, 0)
        # 赵云 常山赵子龙：友军阵亡时突入敌方后排
        for a in [x for x in self.units if x.alive and x.side == u.side and x.ally_death_strike]:
            pool = [x for x in self.units if x.alive and x.side != u.side]
            backs = [x for x in pool if x.row == 'back'] or pool
            if backs:
                sk = a.skills.get('普攻') or {'name': '突入', 'type': '普攻', 'main': '武勇',
                                               'sub': '机变', 'desc': '', 'mult': '100%', 'cd': 0}
                self.deal_damage(a, self.rng.choice(backs), sk, a.ally_death_strike)
        # 关羽 义绝：蜀将阵亡时获得额外行动
        for a in self.units:
            if a.alive and a.side == u.side and a.ally_death_action_faction == u.faction:
                a.extra_action = True
        # 董卓 太师：敌方阵亡时全属性提升并无视一次控制
        for a in self.units:
            if a.alive and a.side != u.side and a.enemy_death_allstats:
                a.perm['atk'] += a.enemy_death_allstats
                a.perm['dr'] += a.enemy_death_allstats
                a.immune_control_once = True
        if u.death_damage:
            for e in [x for x in self.units if x.alive and x.side != u.side]:
                e.hp -= max(1, int(u.stat('武勇') * u.death_damage))
                if e.hp <= 0:
                    self._kill(e, u, 0)
        if u.death_team_atk:
            for a in [x for x in self.units if x.alive and x.side == u.side]:
                a.perm['atk'] += u.death_team_atk
        if u.team_survive:
            for a in [x for x in self.units if x.alive and x.side == u.side]:
                a.survive_lethal = max(a.survive_lethal, 0.01)
        # 阵亡触发的特色
        if u.death_dot:
            kind, stacks = u.death_dot
            for e in [x for x in self.units if x.alive and x.side != u.side]:
                e.dots[kind] = {'stacks': stacks, 'turns': 2, 'src': u,
                                'crit': False, 'burn': u.burn_dot_bonus, 'lei_dr': 0.0}
        if u.death_rage:
            for a in [x for x in self.units if x.alive and x.side == u.side]:
                a.rage = min(100.0, a.rage + u.death_rage)
        if u.death_summon:
            cnt, _name, coef = u.death_summon
            before = len(self.units)
            self.summon(u, (cnt, coef, 99))
            for m in self.units[before:]:
                m.summoner = None
                m.duration = 99
        # 召唤物随召唤者消失
        if u.summoner is None:
            for m in [x for x in self.units if x.summoner is u]:
                m.alive = False
        u.buffs.clear()
        u.status.clear()
        u.dots.clear()
        u.chain = None
        u.in_deathmatch = False

    def heal(self, src, tgt, pct=None, flat=None, skill=''):
        if not tgt.alive:
            return
        base = flat if flat is not None else tgt.max_hp * (pct or 0)
        out_aura = sum(a.team_heal_out for a in (getattr(src, 'team_units', None) or []) if a.alive)
        in_aura = sum(a.team_heal_in for a in (getattr(tgt, 'team_units', None) or []) if a.alive)
        amount = base * (1 + src.perm['heal'] + src.buff_sum('heal') + src.heal_boost + out_aura + in_aura)
        red = max([a.poison_heal_reduce for a in self.units
                   if a.alive and a.side != tgt.side] or [0])
        if red and tgt.dots.get('剧毒'):
            amount *= max(0.0, 1 - min(0.5, red * tgt.dots['剧毒']['stacks']))
        if src.flags.get('回春'):
            amount *= 1 + src.flags['回春'][0] / 100.0
        healed = max(0, int(min(amount, tgt.max_hp - tgt.hp)))
        self.ev('heal', src=src.name, src_side=src.side, dst=tgt.name, dst_side=tgt.side,
                amount=healed, skill=skill, dst_hp=round(tgt.hp + healed))
        tgt.hp = min(tgt.max_hp, tgt.hp + amount)
        if src.flags.get('护佑'):
            tgt.add_buff('dr', src.flags['护佑'][0] / 100.0, 1, src=src)

    def end_round(self):
        # 回合开始类效果在下一回合起点结算
        self.round += 1
        self.acted.clear()
        if self.round > MAX_ROUNDS:
            self.judge()
            return
        # 召唤物持续时间
        for m in list(self.units):
            if m.is_summon:
                m.duration -= 1
                if m.duration <= 0 or (m.summoner and not m.summoner.alive):
                    m.alive = False
                    self.units.remove(m)
        for u in self.units:
            if not u.alive:
                continue
            u.battle_round = self.round
            if getattr(u, 'chain', None):
                u.chain['turns'] -= 1
                if u.chain['turns'] <= 0:
                    u.chain = None
            if u.untargetable > 0:
                u.untargetable -= 1
            if u.invuln_rounds > 0:
                u.invuln_rounds -= 1
            if u.round_random_buff:
                stat, val = self.rng.choice(u.round_random_buff)
                u.add_buff(stat, val, 2, src=u)
            if u.round_allstats_ramp:
                per, cap = u.round_allstats_ramp
                if u.round_ramp_stacks * per < cap - 1e-9:
                    for k in SIX:
                        u.perm['stat_' + k] += per
                    u.round_ramp_stacks += 1
            if u.team_regen:
                for a in [x for x in self.units if x.alive and x.side == u.side]:
                    self.heal(u, a, pct=u.team_regen)
            if u.self_regen:
                self.heal(u, u, pct=u.self_regen)
            if u.team_rage_round:
                for a in [x for x in self.units if x.alive and x.side == u.side]:
                    a.rage = min(100.0, a.rage + u.team_rage_round)
            if u.enemy_rage_round:
                for e in [x for x in self.units if x.alive and x.side != u.side]:
                    e.rage = max(0.0, e.rage - u.enemy_rage_round)
            if u.round_start_confuse and self.rng.random() < u.round_start_confuse:
                es = [x for x in self.units if x.alive and x.side != u.side]
                if es:
                    t = self.rng.choice(es)
                    t.status['混乱'] = max(t.status.get('混乱', 0), 1)
                    self.ev('control', src=u.name, src_side=u.side, dst=t.name,
                            dst_side=t.side, status='混乱')
            # 回合开始类
            if u.round_start_shield:
                team = [x for x in self.units if x.alive and x.side == u.side]
                boost = 1 + u.shield_boost + sum(a.team_shield_aura for a in team)
                for a in team:
                    a.shield += u.stat('威仪') * u.round_start_shield * boost
            if u.round_start_heal:
                pct, dis = u.round_start_heal
                team = [x for x in self.units if x.alive and x.side == u.side]
                for a in team:
                    a.hp = min(a.max_hp, a.hp + a.max_hp * pct / 100.0)
                    for _ in range(min(dis, len(a.buffs))):
                        if a.buffs and a.buffs[-1]['value'] < 0:
                            a.buffs.pop()
            if u.round_start_rage:
                for a in [x for x in self.units if x.alive and x.side == u.side]:
                    a.rage = min(100.0, a.rage + u.round_start_rage)
            if u.rage_zero and self.rng.random() < u.rage_zero:
                enemies = [x for x in self.units if x.alive and x.side != u.side]
                if enemies:
                    max(enemies, key=lambda x: x.rage).rage = 0.0
            if u.ally_dr:
                team = [x for x in self.units if x.alive and x.side == u.side]
                if team:
                    self.rng.choice(team).add_buff('dr', u.ally_dr, 1, src=u)
            if u.round_end_damage:
                n, dmg_pct = u.round_end_damage
                enemies = [x for x in self.units if x.alive and x.side != u.side]
                for t in self.rng.sample(enemies, min(n, len(enemies))):
                    t.hp -= max(1, int(u.stat('智谋') * dmg_pct / 100.0))
                    if t.hp <= 0:
                        self._kill(t, u, 0)
            # 天赋：最低兵力回复 / 持续回复
            team = [x for x in self.units if x.alive and x.side == u.side]
            if team:
                if u.regen_lowest:
                    low = min(team, key=lambda x: x.hp / max(1, x.max_hp))
                    self.heal(u, low, pct=u.regen_lowest / 100.0)
                if u.lowest_hot:
                    pct, turns = u.lowest_hot
                    low = min(team, key=lambda x: x.hp / max(1, x.max_hp))
                    low.hots = [h for h in low.hots if h['src'] != u.name]
                    low.hots.append({'pct': pct / 100.0, 'turns': turns, 'src': u.name})
            if u.hots:
                for h in list(u.hots):
                    self.heal(u, u, pct=h['pct'])
                    h['turns'] -= 1
                    if h['turns'] <= 0:
                        u.hots.remove(h)
            if u.team_taunt_rage:
                if any(x.alive and x.side != u.side and x.status.get('嘲讽') for x in self.units):
                    for a in [x for x in self.units if x.alive and x.side == u.side]:
                        a.rage = min(100.0, a.rage + u.team_taunt_rage)
            # 持续伤害
            for dot in list(u.dots.keys()):
                info = u.dots.get(dot)
                if not info:
                    continue
                amount = u.max_hp * 0.05 * info['stacks']
                if dot == '灼烧' and info.get('burn'):
                    amount *= 1 + info['burn']
                src = info.get('src')
                if dot == '灼烧' and src is not None:
                    amount *= 1 + sum(a.team_burn_bonus for a in self.units
                                      if a.alive and a.side == src.side)
                    stacks = info.get('stacks', 1)
                    for a in self.units:
                        if a.alive and a.side != u.side and a.enemy_burn_vuln and stacks >= a.enemy_burn_vuln[0]:
                            amount *= 1 + a.enemy_burn_vuln[1]
                            break
                if info.get('crit') and src and self.rng.random() < src.crit():
                    amount *= src.crit_dmg()
                for a in self.units:
                    if a.alive and a.side == u.side and a.team_dot_reduce:
                        amount *= 1 - a.team_dot_reduce
                        break
                dmg = max(1, int(amount))
                u.hp -= dmg
                self.ev('dot_damage', src=(src.name if src else ''), src_side=(src.side if src else -1),
                        dst=u.name, dst_side=u.side, dmg=dmg, dot=dot, dst_hp=round(u.hp))
                info['turns'] -= 1
                if info['turns'] <= 0:
                    u.dots.pop(dot, None)
                if u.hp <= 0:
                    self._kill(u, None, 0)
                    break
            # 团队回合机制
            if u.flags.get('运筹'):
                team = [x for x in self.units if x.alive and x.side == u.side]
                if team:
                    t = self.rng.choice(team)
                    t.rage = min(100.0, t.rage + u.flags['运筹'][0])
            if u.flags.get('悬壶'):
                team = [x for x in self.units if x.alive and x.side == u.side]
                if team:
                    low = min(team, key=lambda x: x.hp / max(1, x.max_hp))
                    low.hp = min(low.max_hp, low.hp + low.max_hp * u.flags['悬壶'][0] / 100.0)
            if u.flags.get('庇护'):
                team = [x for x in self.units if x.alive and x.side == u.side]
                if team:
                    low = min(team, key=lambda x: x.hp / max(1, x.max_hp))
                    low.shield += u.stats['威仪'] * u.flags['庇护'][0]
            if u.flags.get('护盾'):
                u.shield += u.stats['统御'] * u.flags['护盾'][0]
            if u.flags.get('蓄势'):
                u.rage = min(100.0, u.rage + u.flags['蓄势'][0])
            if u.flags.get('策略追击'):
                enemies = [x for x in self.units if x.alive and x.side != u.side]
                if enemies:
                    t = self.rng.choice(enemies)
                    t.hp -= max(1, int(u.stat('智谋') * u.flags['策略追击'][0] / 100.0))
                    if t.hp <= 0:
                        self._kill(t, u, 0)
        self.resolve_deathmatch()
        if self.check_end():
            return

    def check_end(self):
        a = any(u.alive and not u.is_summon for u in self.units if u.side == 0)
        b = any(u.alive and not u.is_summon for u in self.units if u.side == 1)
        if not a or not b:
            self.done = True
            self.winner = 0 if a else 1
            return True
        return False

    def judge(self):
        self.timeout = True
        hp0 = sum(u.hp / max(1, u.max_hp) for u in self.units if u.side == 0 and u.alive and not u.is_summon)
        hp1 = sum(u.hp / max(1, u.max_hp) for u in self.units if u.side == 1 and u.alive and not u.is_summon)
        if abs(hp0 - hp1) < 1e-9:
            self.winner = None
        else:
            self.winner = 0 if hp0 > hp1 else 1
        self.done = True


# ---------------------------------------------------------------- 组队
def assign_rows(team):
    front = [u for u in team if u.troop in ('步兵', '骑兵')]
    back = [u for u in team if u.troop not in ('步兵', '骑兵')]
    while len(front) < 3 and back:
        front.append(back.pop(0))
    while len(front) > 3:
        back.insert(0, front.pop())
    for u in team:
        u.row = 'front' if u in front[:3] else 'back'


def make_team(records, skills, talents, names):
    team = []
    for n in names:
        rec = next(r for r in records if r['姓名'] == n)
        u = Unit(rec, skills[n], talents[n])
        team.append(u)
    assign_rows(team)
    return team


def simulate(recA, recB, names, skills, talents, seed):
    """names = (teamA_list, teamB_list)"""
    rng = random.Random(seed)
    team = []
    for n in names[0]:
        u = Unit(recA[n], skills[n], talents[n]); u.side = 0; team.append(u)
    for n in names[1]:
        u = Unit(recB[n], skills[n], talents[n]); u.side = 1; team.append(u)
    assign_rows([u for u in team if u.side == 0])
    assign_rows([u for u in team if u.side == 1])
    b = Battle(team, seed=seed)
    return b.run(), b


# ---------------------------------------------------------------- 跑分
def run_1v1(records, skills, talents, sims, quick=False):
    rec = {r['姓名']: r for r in records}
    groups = defaultdict(list)
    for r in records:
        groups[(r['稀有度'], r['定位'])].append(r['姓名'])
    results = defaultdict(lambda: {'wins': 0, 'matches': 0})
    pairs = []
    for key, names in groups.items():
        if len(names) < 2:
            continue
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                pairs.append((names[i], names[j]))
    for a, b in pairs:
        for i in range(sims):
            # 交换先后手，抵消位置偏差
            if i % 2 == 0:
                ta, tb = [a], [b]
            else:
                ta, tb = [b], [a]
            w, _ = simulate(rec, rec, (ta, tb), skills, talents, seed=hash((a, b, i)) & 0xffffffff)
            win_name = a if (w == 0) == (i % 2 == 0) else b
            if w is None:
                continue
            results[win_name]['wins'] += 1
            results[win_name]['matches'] += 1
            other = b if win_name == a else a
            results[other]['matches'] += 1
    return results, len(pairs)


def role_group(pos):
    if pos.startswith('虎卫') or '猛将·护卫' in pos:
        return 'TANK'
    if pos.startswith('医者') or pos.startswith('谋主·续航'):
        return 'HEAL'
    if (pos.startswith('谋主·号令') or '增益' in pos or '仁德' in pos
            or pos.startswith('军师·控制') or '控场' in pos or '减益' in pos):
        return 'SUPPORT'
    return 'DAMAGE'


def balanced_team(pool, roles, rng):
    byg = defaultdict(list)
    for n in pool:
        byg[role_group(roles[n])].append(n)
    team = []
    for g, cnt in [('TANK', 1), ('HEAL', 1), ('SUPPORT', 1), ('DAMAGE', 2)]:
        cand = [x for x in byg[g] if x not in team]
        if cand:
            team += rng.sample(cand, min(cnt, len(cand)))
    while len(team) < 5:
        cand = [x for x in pool if x not in team]
        if not cand:
            break
        team.append(rng.choice(cand))
    return team


def run_5v5(records, skills, talents, matches, sims, quick=False):
    rec = {r['姓名']: r for r in records}
    by_rar = defaultdict(list)
    for r in records:
        by_rar[r['稀有度']].append(r['姓名'])
    rng = random.Random(20261118)
    stats = defaultdict(lambda: {'wins': 0, 'matches': 0, 'picks': 0})
    rounds = []
    timeouts = 0
    for m in range(matches):
        rar = rng.choice(['普通', '精良', '传奇', '绝世'])
        pool = by_rar[rar]
        if len(pool) < 5:
            continue
        roles = {r['姓名']: r['定位'] for r in records}
        a = balanced_team(pool, roles, rng)
        b = balanced_team(pool, roles, rng)
        for n in a + b:
            stats[n]['picks'] += 1
        for i in range(sims):
            w, bat = simulate(rec, rec, (a, b), skills, talents, seed=rng.randrange(1 << 30))
            rounds.append(bat.round)
            timeouts += int(bat.timeout)
            if w is None:
                continue
            for n in a:
                stats[n]['matches'] += 1
                if w == 0:
                    stats[n]['wins'] += 1
            for n in b:
                stats[n]['matches'] += 1
                if w == 1:
                    stats[n]['wins'] += 1
    return stats, matches * sims, (sum(rounds) / len(rounds) if rounds else 0), (timeouts / len(rounds) if rounds else 0)


def run_swapin(records, skills, talents, sims):
    """单将 A/B：同一队伍、同一位置，测试将 vs 随机同职能同稀有度同伴。
    胜率 >50% 表示该将强于同职能平均水平。"""
    rec = {r['姓名']: r for r in records}
    roles = {r['姓名']: r['定位'] for r in records}
    by_rar = defaultdict(list)
    for r in records:
        by_rar[r['稀有度']].append(r['姓名'])
    rng = random.Random(20261119)
    stats = {}
    for rar in ['普通', '精良', '传奇', '绝世']:
        pool = by_rar[rar]
        if len(pool) < 5:
            continue
        for name in pool:
            g = role_group(roles[name])
            peers = [x for x in pool if x != name and role_group(roles[x]) == g]
            if not peers:
                peers = [x for x in pool if x != name]
            wins = valid = 0
            for i in range(sims):
                peer = rng.choice(peers)
                sub = [x for x in pool if x not in (name, peer)]
                base = balanced_team(sub if len(sub) >= 5 else pool, roles, rng)
                slot = None
                for idx, u in enumerate(base):
                    if role_group(roles[u]) == g:
                        slot = idx
                        break
                if slot is None:
                    for idx, u in enumerate(base):
                        if role_group(roles[u]) == 'DAMAGE':
                            slot = idx
                            break
                if slot is None:
                    slot = len(base) - 1
                a = list(base); b = list(base)
                a[slot] = name; b[slot] = peer
                if i % 2 == 0:
                    A, B, side = a, b, 0
                else:
                    A, B, side = b, a, 1
                w, _ = simulate(rec, rec, (A, B), skills, talents, seed=rng.randrange(1 << 30))
                if w is None:
                    continue
                valid += 1
                wins += (w == side)
            rate = wins / max(1, valid)
            stats[name] = {'rarity': rar, 'role': roles[name], 'base': 0.5,
                           'rate': rate, 'delta': rate - 0.5, 'n': valid}
    return stats


def coverage(records, skills, talents):
    total_skills = sum(len(v) for v in skills.values())
    parsed = 0
    for rec in records:
        n = rec['姓名']
        u = Unit(rec, skills[n], talents[n])
        for sk in skills[n].values():
            if _skill_covered(u, sk):
                parsed += 1
    total_t = sum(len(v) for v in talents.values())
    mech = 0
    unsupported = 0
    for rec in records:
        n = rec['姓名']
        u = Unit(rec, skills[n], talents[n])
        for t in talents[n]:
            if t['name'] in MECH:
                mech += 1
        unsupported += len(u.unsupported)
    return {
        'skills_total': total_skills,
        'skills_parsed': parsed,
        'skills_coverage': round(parsed / max(1, total_skills), 3),
        'talents_total': total_t,
        'talents_mech': mech,
        'talents_unsupported': unsupported,
        'talents_coverage': round((mech + (total_t - unsupported - mech)) / max(1, total_t), 3),
    }


# 仅保留真正未实现的机制；召唤/嘲讽/恐惧/混乱/驱散/真实伤害/护盾破碎等均已接入
GAP_KW = ['互相攻击', '变身', '叛变']
# 在 cast() 中按描述文本特殊处理、但 parse_effect 不产出的技能
SPECIAL_MARKS = ('重新分配我方全体怒气', '复制我方一名友军上一次释放的战法效果')


def _skill_covered(u, sk):
    e = parse_effect(sk)
    if (e['damage'] or e['heal'] or e['heal_stat'] or e['buffs']
            or e['control'] or e['shield'] or e['rage'] or e['summon']):
        return True
    desc = sk.get('desc') or ''
    if sk.get('type') in ('特色', '被动') and u._parse_signature(desc):
        return True
    if ('死斗' in desc and '互攻' in desc) or ('连环' in desc and '传递给相邻' in desc):
        return True
    if '复制' in desc and '增益' in desc:
        return True
    return any(mark in desc for mark in SPECIAL_MARKS)


def unit_coverage(records, skills, talents):
    out = {}
    for r in records:
        n = r['姓名']
        parsed = 0
        gaps = set()
        u = Unit(r, skills[n], talents[n])
        for sk in skills[n].values():
            if _skill_covered(u, sk):
                parsed += 1
            for kw in GAP_KW:
                if kw in (sk['desc'] or ''):
                    gaps.add(kw)
        sup = len(talents[n]) - len(u.unsupported)
        for t in talents[n]:
            for kw in GAP_KW:
                if kw in (t['desc'] or ''):
                    gaps.add(kw)
        out[n] = {'skill_hit': parsed, 'skill_total': len(skills[n]),
                  'talent_hit': sup, 'talent_total': len(talents[n]),
                  'gaps': sorted(gaps)}
    return out


def write_reports(path, one, five, cov, cov_map, n_pairs, n5, avg_round=0, timeout_rate=0, swapin=None):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, '一v一_胜率.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['武将', '匹配数', '胜场', '胜率'])
        for n, s in sorted(one.items(), key=lambda x: -(x[1]['wins'] / max(1, x[1]['matches']))):
            w.writerow([n, s['matches'], s['wins'], round(s['wins'] / max(1, s['matches']), 3)])
    with open(os.path.join(path, '五v五_胜率.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['武将', '匹配数', '胜场', '胜率', '出场数'])
        for n, s in sorted(five.items(), key=lambda x: -(x[1]['wins'] / max(1, x[1]['matches']))):
            w.writerow([n, s['matches'], s['wins'], round(s['wins'] / max(1, s['matches']), 3), s['picks']])
    if swapin:
        with open(os.path.join(path, '单将换入.csv'), 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['武将', '稀有度', '定位', '基准胜率', '换入胜率', '差值', '样本'])
            for n, s0 in sorted(swapin.items(), key=lambda x: -x[1]['delta']):
                w.writerow([n, s0['rarity'], s0['role'], round(s0['base'], 3), round(s0['rate'], 3), round(s0['delta'], 3), s0['n']])
    with open(os.path.join(path, '解析覆盖.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['武将', '技能解析', '技能总数', '天赋支持', '天赋总数', '未实现机制'])
        for n, c in cov_map.items():
            w.writerow([n, c['skill_hit'], c['skill_total'], c['talent_hit'], c['talent_total'], '、'.join(c['gaps'])])
    # 报告
    def wr(s):
        return s['wins'] / max(1, s['matches'])
    one_valid = {n: s for n, s in one.items() if s['matches'] >= 20}
    five_valid = {n: s for n, s in five.items() if s['matches'] >= 20}
    top1 = sorted(one_valid.items(), key=lambda x: -wr(x[1]))[:10]
    bot1 = sorted(one_valid.items(), key=lambda x: wr(x[1]))[:10]
    top5 = sorted(five_valid.items(), key=lambda x: -wr(x[1]))[:10]
    bot5 = sorted(five_valid.items(), key=lambda x: wr(x[1]))[:10]
    lines = []
    lines.append('# 《三国·将星录》自动战斗模拟报告（第一版）\n')
    lines.append(f'- 1v1 对局：{n_pairs} 组对阵，每组若干场；有效样本 {sum(1 for s in one.values() if s["matches"]>=20)} 将')
    lines.append(f'- 5v5 对局：{n5} 场；有效样本 {sum(1 for s in five.values() if s["matches"]>=20)} 将；平均 {avg_round:.1f} 回合，超时率 {timeout_rate:.0%}')
    lines.append(f'- 等级 Lv{LEVEL}、突破 {BT} 段、觉醒 {AW} 星、套装 {EQUIP}')
    lines.append(f'- 技能解析覆盖：{cov["skills_parsed"]}/{cov["skills_total"]}（{cov["skills_coverage"]:.1%}）')
    lines.append(f'- 天赋机制覆盖：机制 {cov["talents_mech"]} / 未支持 {cov["talents_unsupported"]} / 共 {cov["talents_total"]}')
    lines.append(f'- 平衡补丁：{len(BALANCE_SCALE)} 名武将应用全属性缩放（见 core.BALANCE_SCALE）')
    low = [(n, c) for n, c in cov_map.items() if c['gaps']]
    low.sort(key=lambda x: (x[1]['skill_hit'] / max(1, x[1]['skill_total']), -len(x[1]['gaps'])))
    lines.append('- 低覆盖（结论仅供参考）：' + '、'.join(n for n, c in low[:15]))
    lowt = [(n, c) for n, c in cov_map.items() if c['talent_total'] and c['talent_hit'] / c['talent_total'] < 0.5]
    lines.append('- 天赋支持不足 50%：' + '、'.join(n for n, c in lowt[:20]) + '\n')
    lines.append('## 方法与限制')
    lines.append('- 1v1：同稀有度、同定位全循环对阵；5v5：同稀有度、均衡阵容（1坦1续航1辅2输出）')
    lines.append(f'- 等级 Lv{LEVEL}、突破 {BT} 段、觉醒 {AW} 星、套装 {EQUIP}；兵力按统御×15+900 校准（目标约 12 回合，实测见上）')
    lines.append('- 单将换入：同队同位置 A/B，测试将 vs 随机同职能同伴；>50% 为强于同职能平均')
    lines.append('- 已实现：召唤、嘲讽、恐惧、魅惑/混乱、驱散、真实伤害、保命、闪避、护盾破碎、伤害传递（连环）、复制战法、自损、死斗、制衡、护盾光环、骑兵闪避、回合触发；'
                 '未完全实现：貂蝉「连环离间」的互相攻击以混乱近似、变身、叛变\n')
    def trusted(n):
        c = cov_map.get(n)
        if not c:
            return False
        return (not c['gaps'] and c['skill_hit'] / max(1, c['skill_total']) >= 0.8
                and (c['talent_total'] == 0 or c['talent_hit'] / max(1, c['talent_total']) >= 0.75))
    t1 = [(n, s) for n, s in one_valid.items() if trusted(n)]
    t5 = [(n, s) for n, s in five_valid.items() if trusted(n)]
    lines.append('## 高置信度极值（覆盖≥80% 且无未实现机制）')
    lines.append('### 1v1 最高')
    for n, s in sorted(t1, key=lambda x: -wr(x[1]))[:8]:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('### 1v1 最低')
    for n, s in sorted(t1, key=lambda x: wr(x[1]))[:8]:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('### 5v5 最高')
    for n, s in sorted(t5, key=lambda x: -wr(x[1]))[:8]:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('### 5v5 最低')
    for n, s in sorted(t5, key=lambda x: wr(x[1]))[:8]:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('')
    if swapin:
        sv = sorted(swapin.items(), key=lambda x: -x[1]['delta'])
        lines.append('## 单将换入（固定队伍，替换同职能位）')
        lines.append('### 边际贡献最高')
        for n, s0 in sv[:10]:
            lines.append(f'- {n}：{s0["delta"]:+.1%}（换入 {s0["rate"]:.1%} / 基准 {s0["base"]:.1%}）')
        lines.append('### 边际贡献最低')
        for n, s0 in sv[-10:]:
            lines.append(f'- {n}：{s0["delta"]:+.1%}（换入 {s0["rate"]:.1%} / 基准 {s0["base"]:.1%}）')
        lines.append('')
    lines.append('## 1v1 同档同定位')
    lines.append('### 胜率最高')
    for n, s in top1:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('### 胜率最低')
    for n, s in bot1:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('\n## 5v5 同稀有度·均衡阵容（1 坦 1 续航 1 辅助 2 输出）')
    lines.append('### 胜率最高')
    for n, s in top5:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    lines.append('### 胜率最低')
    for n, s in bot5:
        lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    # 超标项
    outliers = [(n, wr(s)) for n, s in one_valid.items() if wr(s) > 0.60 or wr(s) < 0.40]
    lines.append(f'\n## 1v1 胜率超出 40%–60% 的条目（{len(outliers)} 个）')
    for n, v in sorted(outliers, key=lambda x: -x[1])[:40]:
        lines.append(f'- {n}：{v:.1%}')
    lines.append('\n## 废将候选（5v5 胜率 <45%，样本≥20）')
    for n, s in sorted(five_valid.items(), key=lambda x: wr(x[1]))[:20]:
        if wr(s) < 0.45:
            lines.append(f'- {n}：{wr(s):.1%}（{s["matches"]} 场）')
    with open(os.path.join(path, '平衡报告.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    with open(os.path.join(path, '覆盖率.json'), 'w', encoding='utf-8') as f:
        json.dump(cov, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default=DEFAULT_DATA)
    ap.add_argument('--out', default=os.path.join(HERE, '输出'))
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--sims', type=int, default=40)
    ap.add_argument('--matches', type=int, default=400)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--bt', type=int, default=0)
    ap.add_argument('--aw', type=int, default=0)
    ap.add_argument('--equip', type=int, default=0)
    ap.add_argument('--replay', default='', help='A,B;C,D')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--events-out', default='')
    args = ap.parse_args()
    global LEVEL, BT, AW, EQUIP
    LEVEL, BT, AW, EQUIP = args.level, args.bt, args.aw, args.equip
    if args.quick:
        args.sims = 10
        args.matches = 80
    print('读取数据…')
    records, skills, talents, bonds = load_data(args.data)
    if args.replay:
        sides = args.replay.split(';')
        a = sides[0].split(',')
        b = sides[1].split(',') if len(sides) > 1 else []
        rec = {r['姓名']: r for r in records}
        units = []
        for names, side in ((a, 0), (b, 1)):
            for n in names:
                u = Unit(rec[n], skills[n], talents[n]); u.side = side; units.append(u)
            assign_rows([u for u in units if u.side == side])
        bt = Battle(units, seed=args.seed)
        w = bt.run()
        print(f'胜方：{w}，回合：{bt.round}，超时：{bt.timeout}')
        for e in bt.events:
            print(e)
        if args.events_out:
            with open(args.events_out, 'w', encoding='utf-8') as f:
                json.dump(bt.events, f, ensure_ascii=False, indent=1)
        return
    print(f'武将 {len(records)}，技能 {sum(len(v) for v in skills.values())}，天赋 {sum(len(v) for v in talents.values())}')
    print('跑 1v1…')
    one, n_pairs = run_1v1(records, skills, talents, args.sims, quick=args.quick)
    print('跑 5v5…')
    five, n5, avg_round, timeout_rate = run_5v5(records, skills, talents, args.matches, max(3, args.sims // 4), quick=args.quick)
    cov = coverage(records, skills, talents)
    cov_map = unit_coverage(records, skills, talents)
    print('跑单将换入…')
    swapin = run_swapin(records, skills, talents, max(40, args.sims * 4))
    write_reports(args.out, one, five, cov, cov_map, n_pairs, n5, avg_round, timeout_rate, swapin)
    print(f'完成：{args.out}')
    print(json.dumps(cov, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
