#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《三国·将星录》正式版本地服务器。

启动：
    ~/opt/venv-learn/bin/python server.py
浏览器打开：
    http://localhost:8790
"""
import datetime
import gzip
import hashlib
import json
import os
import random
import secrets
import sys
import threading
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                  # 三国将星录/
PROJ = ROOT
sys.path.insert(0, HERE)
from engine import api, core  # noqa

CARD_DIR = os.path.join(ROOT, '美术素材', '卡面样张')
FRAME = os.path.join(ROOT, '美术素材', '模板', '卡牌框模板_空白.png')
PORTRAIT_DIR = os.path.join(ROOT, '美术素材', '立绘原图')
WEB = os.path.join(HERE, 'web')
IMG_DIR = os.path.join(HERE, 'img')          # tools/make_webp.py 生成的 WebP 派生图
CACHE_DIR = os.path.join(HERE, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)
SAVE_DIR = os.path.join(HERE, 'saves')
os.makedirs(SAVE_DIR, exist_ok=True)

RECORDS, SKILLS, TALENTS, BONDS = core.load_data(core.DEFAULT_DATA)
REC = {r['姓名']: r for r in RECORDS}

# ---------------- 羁绊 2.0 ----------------
# 每个武将至少属于：阵营 / 兵种 / 定位 三条羁绊，再加若干历史羁绊；
# 触发只看上阵 + 助阵名单，效果全部是特殊机制（不加纯属性）。
BOND_EFFECTS = {
    'shield': ('铁壁', '开场全体获得 12% 兵力护盾'),
    'rage': ('怒气', '每回合开始全体获得 15 点怒气'),
    'regen': ('回春', '全体每回合恢复 4% 兵力'),
    'dodge': ('灵动', '全体闪避 +8%'),
    'pen': ('破甲', '全体攻击穿透 +10%'),
    'burn': ('火势', '造成的持续伤害 +8%'),
    'first_crit': ('首击必暴', '第一回合全体攻击必定暴击'),
    'dr5': ('坚壁', '前 5 回合全体减伤 10%'),
    'cc_once': ('免控', '每名武将首次受到控制时免疫'),
    'chase': ('追击', '普攻后有 30% 概率追加一次 60% 攻击'),
    'stun': ('震慑', '普攻有 12% 概率眩晕目标 1 回合'),
    'kill_action': ('乘胜追击', '击杀目标后立即额外行动一次'),
    'counter': ('反击', '每次受击后反击伤害逐步提高（最高 +50%）'),
    'revenge': ('同仇敌忾', '友军阵亡时，存活友军立即反击一次（40% 攻击）'),
    'survive': ('不屈', '每名武将首次受到致死伤害时以 20% 兵力存活'),
    'revive': ('义结金兰', '友军阵亡时以 25% 兵力复活一次'),
    'first_untarget': ('先声夺人', '第一回合全体不可被选中'),
    'round_buff': ('随机应变', '每回合开始随机获得攻击或命中增益'),
    'low_hp': ('背水一战', '兵力低于 50% 时攻击 +20%'),
    'first_speed': ('疾驰', '第一回合全体速度 +15%'),
    'strat_ramp': ('运筹帷幄', '每回合战法伤害 +6%，最高 +30%'),
}
BOND_TROOP_EFFECT = {'步兵': 'shield', '骑兵': 'chase', '弓兵': 'first_crit', '方士': 'burn'}
BOND_FACTION_EFFECT = {'魏': 'dr5', '蜀': 'revenge', '吴': 'first_untarget', '群雄': 'round_buff'}
BOND_ROLE_EFFECT = {'谋主': 'rage', '猛将': 'kill_action', '虎卫': 'survive', '军师': 'strat_ramp',
                    '骁骑': 'first_speed', '弓手': 'pen', '术士': 'cc_once', '刺客': 'dodge', '医者': 'regen'}
BOND_ROLE_NAME = {'谋主': '庙算', '猛将': '陷阵', '虎卫': '铁壁', '军师': '运筹', '骁骑': '疾风',
                  '弓手': '穿杨', '术士': '幽术', '刺客': '无常', '医者': '回春'}
BOND_FACTION_NAME = {'魏': '霸业', '蜀': '忠义', '吴': '水战', '群雄': '割据'}
BOND_TROOP_NAME = {'步兵': '坚阵', '骑兵': '冲锋', '弓兵': '齐射', '方士': '奇门'}
# 历史羁绊：名称、成员、需要人数、效果
BOND_HISTORY = [
    ('桃园结义', ['刘备', '关羽', '张飞'], 3, 'revive'),
    ('五虎上将', ['关羽', '张飞', '赵云', '马超', '黄忠'], 3, 'first_crit'),
    ('卧龙凤雏', ['诸葛亮', '庞统'], 2, 'strat_ramp'),
    ('江东双璧', ['周瑜', '孙策'], 2, 'first_untarget'),
    ('五子良将', ['张辽', '乐进', '于禁', '张郃', '徐晃'], 3, 'dr5'),
    ('十二虎臣', ['程普', '黄盖', '韩当', '蒋钦', '周泰', '陈武', '董袭', '甘宁', '凌统', '徐盛', '潘璋', '丁奉'], 4, 'counter'),
    ('河北双雄', ['袁绍', '颜良', '文丑'], 2, 'kill_action'),
    ('黄巾起义', ['张角', '张宝', '张梁', '张燕', '管亥', '程远志', '邓茂', '高升'], 3, 'round_buff'),
    ('西凉铁骑', ['马腾', '马超', '马岱', '庞德', '韩遂'], 3, 'chase'),
    ('虎卫军', ['曹操', '典韦', '许褚', '曹洪'], 2, 'survive'),
    ('曹魏宗室', ['曹操', '曹丕', '曹仁', '曹真', '夏侯惇', '夏侯渊', '曹洪'], 3, 'shield'),
    ('孙吴宗室', ['孙坚', '孙策', '孙权', '孙尚香', '孙鲁班', '吴国太'], 3, 'regen'),
    ('蜀汉四相', ['诸葛亮', '蒋琬', '费祎', '董允'], 2, 'rage'),
    ('颍川谋士', ['荀彧', '荀攸', '郭嘉', '程昱', '陈群', '钟繇'], 3, 'strat_ramp'),
    ('吕布旧部', ['吕布', '陈宫', '张辽', '高顺'], 2, 'kill_action'),
    ('袁氏旧部', ['袁绍', '袁术', '颜良', '文丑', '张郃', '高览'], 2, 'stun'),
    ('刘表旧部', ['刘表', '蔡瑁', '张允', '黄祖', '文聘', '蒯越'], 2, 'dodge'),
    ('益州旧部', ['刘璋', '张任', '严颜', '吴懿', '法正', '李严'], 3, 'low_hp'),
    ('白马义从', ['公孙瓒', '赵云', '田豫'], 2, 'first_speed'),
    ('巾帼英杰', sorted(core.FEMALE & set(REC)), 3, 'cc_once'),
    ('水镜门下', ['司马徽', '诸葛亮', '庞统', '徐庶'], 2, 'rage'),
]


def _bond(bid, name, btype, members, need, effect, cond):
    members = [m for m in members if m in REC]
    if len(members) < need:
        return None
    eff_name, eff_desc = BOND_EFFECTS[effect]
    return {'id': bid, 'name': name, 'type': btype, 'members': members, 'need': need,
            'cond': cond, 'effect': effect, 'effectName': eff_name, 'effectDesc': eff_desc}


BONDS_DEFS = []
for _fac in ('魏', '蜀', '吴', '群雄'):
    _mem = [r['姓名'] for r in RECORDS if r['阵营'] == _fac]
    BONDS_DEFS.append(_bond('f_' + _fac, _fac + '·' + BOND_FACTION_NAME[_fac], 'faction', _mem, 3,
                            BOND_FACTION_EFFECT[_fac],
                            f'上阵/助阵中有 3 名「{_fac}」阵营武将'))
for _tr in ('步兵', '骑兵', '弓兵', '方士'):
    _mem = [r['姓名'] for r in RECORDS if r['兵种'] == _tr]
    BONDS_DEFS.append(_bond('t_' + _tr, _tr + '·' + BOND_TROOP_NAME[_tr], 'troop', _mem, 2,
                            BOND_TROOP_EFFECT[_tr],
                            f'上阵/助阵中有 2 名「{_tr}」兵种武将'))
for _role in BOND_ROLE_EFFECT:
    _mem = [r['姓名'] for r in RECORDS if str(r['定位']).split('·')[0] == _role]
    BONDS_DEFS.append(_bond('r_' + _role, _role + '·' + BOND_ROLE_NAME[_role], 'role', _mem, 3,
                            BOND_ROLE_EFFECT[_role],
                            f'上阵/助阵中有 3 名「{_role}」定位武将'))
for _name, _mem, _need, _eff in BOND_HISTORY:
    BONDS_DEFS.append(_bond('h_' + _name, _name, 'history', _mem, _need, _eff,
                            f'上阵/助阵中出现 {_need} 名：' + '、'.join(_mem)))
BONDS_DEFS = [b for b in BONDS_DEFS if b]
BONDS_BY_ID = {b['id']: b for b in BONDS_DEFS}
BOND_MAP = {r['姓名']: [] for r in RECORDS}
for _b in BONDS_DEFS:
    for _m in _b['members']:
        BOND_MAP[_m].append(_b['id'])


# 羁绊合击技：仅历史羁绊触发，一场一次，全队怒气≥60 可释放
BOND_COMBOS = {
    'h_桃园结义': {'id': 'taoyuan', 'name': '桃园结义·同心', 'effect': 'heal', 'main': '威仪', 'sub': '天命',
                   'desc': '全体回复 25% 兵力并获得减伤'},
    'h_五虎上将': {'id': 'wuhu', 'name': '五虎上将·破阵', 'effect': 'damage_all', 'main': '武勇', 'sub': '机变',
                   'desc': '对全体敌人造成攻击伤害，可能眩晕'},
    'h_卧龙凤雏': {'id': 'wolong', 'name': '卧龙凤雏·火计', 'effect': 'strategy_all', 'main': '智谋', 'sub': '机变',
                   'desc': '策略合击，对全体敌人造成伤害并虚弱'},
    'h_江东双璧': {'id': 'jiangdong', 'name': '江东双璧·东风', 'effect': 'damage_all', 'main': '武勇', 'sub': '机变',
                   'desc': '对全体敌人造成攻击伤害'},
    'h_河北双雄': {'id': 'hebei', 'name': '河北双雄·斩将', 'effect': 'damage_single', 'main': '武勇', 'sub': '机变',
                   'desc': '对血量最高的敌人造成 220% 伤害并眩晕'},
    'h_黄巾起义': {'id': 'huangjin', 'name': '黄巾起义·苍天', 'effect': 'buff_team', 'main': '智谋', 'sub': '天命',
                   'desc': '全体攻击提升并回复兵力'},
    'h_十二虎臣': {'id': 'shier', 'name': '十二虎臣·铁壁', 'effect': 'shield_team', 'main': '统御', 'sub': '天命',
                   'desc': '全体获得护盾与减伤'},
}


def resolve_bonds(names):
    """按上阵+助阵名单计算已触发羁绊。"""
    have = {n for n in names if n}
    out = []
    for b in BONDS_DEFS:
        if sum(1 for m in b['members'] if m in have) >= b['need']:
            out.append(b)
    return out
ORDER = {'绝世': 0, '传奇': 1, '精良': 2, '普通': 3}
BIO = {}
for _bio_path in (os.path.join(ROOT, '武将传记_20261121.json'),
                  os.path.join(HERE, '武将传记_20261121.json')):
    if os.path.isfile(_bio_path):
        try:
            with open(_bio_path, encoding='utf-8') as _f:
                BIO = json.load(_f)
            break
        except Exception:
            BIO = {}
UNITS = []
for r in sorted(RECORDS, key=lambda x: (ORDER.get(x['稀有度'], 9), x['编号'])):
    _scale = core.BALANCE_SCALE.get(r['姓名'], 1.0)
    UNITS.append({
        'name': r['姓名'], 'rarity': r['稀有度'], 'role': r['定位'],
        'faction': r['阵营'], 'troop': r['兵种'], 'card': f"{r['编号']}_{r['姓名']}.png",
        'stats': {k: int(round(r[k] * _scale)) for k in core.SIX},
        'growth': {k: int(round(r[k + '成长'] * _scale)) for k in core.SIX},
        'power': r['战力系数'],
        'skills': {t: {'name': sk['name'], 'mult': sk['mult'], 'cd': sk.get('cd'), 'desc': sk['desc']}
                   for t, sk in SKILLS[r['姓名']].items()},
        'talents': TALENTS[r['姓名']],
        'bonds': BOND_MAP.get(r['姓名'], []),
        'bio': (BIO.get(r['姓名']) or {}).get('bio', ''),
        'comment': (BIO.get(r['姓名']) or {}).get('comment', ''),
    })
CARD_FILE = {u['name']: u['card'] for u in UNITS}
POWER = {r['姓名']: r['战力系数'] for r in RECORDS}
# 技能书池：传奇/绝世武将的被动/特色技能
BOOK_SKILLS = {'传奇': [], '绝世': []}
_seen_book_skill = set()
for r in RECORDS:
    if r['稀有度'] in BOOK_SKILLS:
        for typ in ('被动', '特色'):
            sk = SKILLS[r['姓名']].get(typ)
            if sk and sk.get('desc') and sk.get('name') not in _seen_book_skill:
                BOOK_SKILLS[r['稀有度']].append(sk['name'])
                _seen_book_skill.add(sk['name'])


def _power(names, cfg):
    base = sum(POWER.get(n, 0) for n in names)
    mult = (1 + 0.08 * cfg.get('bt', 0)) * (1 + 0.05 * cfg.get('aw', 0)) * (1 + 0.15 * cfg.get('equip', 0))
    return int(round(base * mult))


SESSION_TTL = 1800          # 战斗会话闲置 30 分钟后回收
SESSION_MAX = 256           # 同时保留的会话上限
MAX_BODY = 1 << 20          # POST 请求体上限 1MB
ACCESS_TOKEN = (os.environ.get('SG_TOKEN') or '').strip()   # 可选公网访问口令
RATE_LOCK = threading.Lock()
RATE_HITS = {}


def _rate_ok(key, limit, window=60):
    """简单滑动窗口限流，返回 False 表示超限。"""
    now = time.time()
    with RATE_LOCK:
        arr = [t for t in RATE_HITS.get(key, ()) if now - t < window]
        if len(arr) >= limit:
            RATE_HITS[key] = arr
            return False
        arr.append(now)
        RATE_HITS[key] = arr
        return True
SESSIONS = {}
SESSION_SEEN = {}
SESSION_LOCK = threading.Lock()


def _session_put(sid, bt):
    """登记会话，并按上限淘汰最久未活动的会话。"""
    SESSIONS[sid] = bt
    SESSION_SEEN[sid] = time.time()
    extra = len(SESSIONS) - SESSION_MAX
    if extra > 0:
        for old, _ts in sorted(SESSION_SEEN.items(), key=lambda kv: kv[1])[:extra]:
            SESSIONS.pop(old, None)
            SESSION_SEEN.pop(old, None)


def _session_get(sid):
    """取会话并刷新活跃时间；过期直接丢弃。调用方需持有 SESSION_LOCK。"""
    bt = SESSIONS.get(sid)
    if bt is None:
        return None
    if time.time() - SESSION_SEEN.get(sid, 0) > SESSION_TTL:
        SESSIONS.pop(sid, None)
        SESSION_SEEN.pop(sid, None)
        return None
    SESSION_SEEN[sid] = time.time()
    return bt


def _session_drop(sid):
    SESSIONS.pop(sid, None)
    SESSION_SEEN.pop(sid, None)


def _session_janitor():
    while True:
        time.sleep(300)
        now = time.time()
        with SESSION_LOCK:
            for sid, ts in list(SESSION_SEEN.items()):
                if now - ts > SESSION_TTL:
                    SESSIONS.pop(sid, None)
                    SESSION_SEEN.pop(sid, None)
        with RATE_LOCK:
            for key, arr in list(RATE_HITS.items()):
                keep = [t for t in arr if now - t < 60]
                if keep:
                    RATE_HITS[key] = keep
                else:
                    RATE_HITS.pop(key, None)


threading.Thread(target=_session_janitor, name='session-janitor', daemon=True).start()

VOLUMES = {
    1: '黄巾之乱', 2: '群雄讨董', 3: '官渡之前', 4: '赤壁',
    5: '汉中与合肥', 6: '夷陵与南中', 7: '五丈原',
}

# (volume, chapter, chapter_name, enemy faction, boss)
CHAPTERS = [
    (1, 1, '广宗', '群雄', '张角'),
    (1, 2, '颍川', '群雄', '张梁'),
    (1, 3, '南阳', '群雄', '张宝'),
    (1, 4, '宛城', '群雄', '张燕'),
    (1, 5, '下曲阳', '群雄', '张角'),
    (1, 6, '苍亭', '群雄', '张宝'),
    (1, 7, '东郡', '群雄', '管亥'),
    (1, 8, '北海', '群雄', '张梁'),
    (1, 9, '青州', '群雄', '张角'),
    (1, 10, '黄巾覆灭', '群雄', '张角'),
    (2, 1, '董卓入京', '群雄', '董卓'),
    (2, 2, '废立天子', '群雄', '李儒'),
    (2, 3, '曹操献刀', '群雄', '董卓'),
    (2, 4, '诸侯会盟', '群雄', '袁绍'),
    (2, 5, '汜水关', '群雄', '华雄'),
    (2, 6, '虎牢关', '群雄', '吕布'),
    (2, 7, '三英战吕布', '群雄', '吕布'),
    (2, 8, '迁都长安', '群雄', '董卓'),
    (2, 9, '连环计', '群雄', '貂蝉'),
    (2, 10, '董卓伏诛', '群雄', '吕布'),
    (3, 1, '宛城之战', '魏', '张绣'),
    (3, 2, '下邳吕布', '群雄', '吕布'),
    (3, 3, '白门楼', '群雄', '吕布'),
    (3, 4, '衣带诏', '魏', '曹操'),
    (3, 5, '煮酒论英雄', '魏', '曹操'),
    (3, 6, '白马延津', '群雄', '袁绍'),
    (3, 7, '官渡对峙', '群雄', '袁绍'),
    (3, 8, '乌巢劫粮', '群雄', '淳于琼'),
    (3, 9, '仓亭之战', '群雄', '袁绍'),
    (3, 10, '河北平定', '群雄', '袁绍'),
    (4, 1, '长坂坡', '魏', '曹操'),
    (4, 2, '舌战群儒', '吴', '孙权'),
    (4, 3, '草船借箭', '吴', '周瑜'),
    (4, 4, '借东风', '吴', '周瑜'),
    (4, 5, '火烧赤壁', '魏', '曹操'),
    (4, 6, '华容道', '魏', '曹操'),
    (4, 7, '南郡争夺', '吴', '周瑜'),
    (4, 8, '合肥之战', '吴', '孙权'),
    (4, 9, '潼关之战', '群雄', '马超'),
    (4, 10, '汉中初战', '蜀', '刘备'),
    (5, 1, '濡须口', '吴', '孙权'),
    (5, 2, '定军山', '蜀', '黄忠'),
    (5, 3, '汉水之战', '蜀', '赵云'),
    (5, 4, '逍遥津', '魏', '张辽'),
    (5, 5, '瓦口关', '蜀', '张飞'),
    (5, 6, '葭萌关', '蜀', '马超'),
    (5, 7, '汉中之战', '蜀', '刘备'),
    (5, 8, '上庸之战', '蜀', '刘封'),
    (5, 9, '樊城之战', '蜀', '关羽'),
    (5, 10, '水淹七军', '蜀', '关羽'),
    (6, 1, '白衣渡江', '吴', '吕蒙'),
    (6, 2, '麦城', '吴', '孙权'),
    (6, 3, '夷陵之战', '吴', '陆逊'),
    (6, 4, '猇亭', '吴', '陆逊'),
    (6, 5, '火烧连营', '吴', '陆逊'),
    (6, 6, '南中平定', '群雄', '孟获'),
    (6, 7, '七擒孟获', '群雄', '孟获'),
    (6, 8, '泸水', '群雄', '孟获'),
    (6, 9, '藤甲兵', '群雄', '兀突骨'),
    (6, 10, '南中归附', '群雄', '孟获'),
    (7, 1, '街亭', '魏', '张郃'),
    (7, 2, '陈仓', '魏', '郝昭'),
    (7, 3, '祁山', '魏', '司马懿'),
    (7, 4, '木门道', '魏', '张郃'),
    (7, 5, '上方谷', '魏', '司马懿'),
    (7, 6, '五丈原', '魏', '司马懿'),
    (7, 7, '星落', '魏', '司马懿'),
    (7, 8, '姜维北伐', '魏', '邓艾'),
    (7, 9, '剑阁', '魏', '钟会'),
    (7, 10, '秋风原上', '魏', '司马懿'),
]

BASE_LEVELS = [
    {'id': 1, 'name': '黄巾前哨', 'sub': '第1战', 'desc': '黄巾军的前哨小队，五人都是普通渠帅。',
     'enemies': ['管亥', '张勋', '桥蕤', '胡轸', '牛辅'], 'config': {'level': 1, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 2, 'name': '广宗外围', 'sub': '第2战', 'desc': '张梁、张宝开始压阵，法术伤害出现。',
     'enemies': ['管亥', '张勋', '桥蕤', '张梁', '张宝'], 'config': {'level': 1, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 3, 'name': '黄巾力士', 'sub': '第3战', 'desc': '有医者续航，先集火后排。',
     'enemies': ['管亥', '张勋', '张梁', '张宝', '华佗'], 'config': {'level': 2, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 4, 'name': '渠帅张燕', 'sub': '第4战', 'desc': '张燕会切后排，注意保护输出。',
     'enemies': ['张燕', '管亥', '张梁', '张宝', '华佗'], 'config': {'level': 5, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 5, 'name': '汉室援军', 'sub': '第5战', 'desc': '卢植续航、朱儁强攻，正面硬仗。',
     'enemies': ['朱儁', '卢植', '张宝', '张梁', '华佗'], 'config': {'level': 8, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 6, 'name': '黄巾妖术', 'sub': '第6战', 'desc': '张角雷印与召唤，AOE 压力开始上升。',
     'enemies': ['张角', '张宝', '张梁', '张燕', '华佗'], 'config': {'level': 10, 'bt': 0, 'aw': 0, 'equip': 0}},
    {'id': 7, 'name': '广宗城下', 'sub': '第7战', 'desc': '双术士阵容，召唤物会拖长战斗。',
     'enemies': ['张角', '于吉', '张宝', '张梁', '张燕'], 'config': {'level': 12, 'bt': 1, 'aw': 0, 'equip': 0}},
    {'id': 8, 'name': '太平道场', 'sub': '第8战', 'desc': '左慈的控制与幻术，考验效果抵抗。',
     'enemies': ['张角', '于吉', '左慈', '张宝', '张梁'], 'config': {'level': 15, 'bt': 1, 'aw': 1, 'equip': 0}},
    {'id': 9, 'name': '黄巾亲卫', 'sub': '第9战', 'desc': '张角、于吉、左慈同时在场，控制链很密。',
     'enemies': ['张角', '于吉', '左慈', '张燕', '华佗'], 'config': {'level': 18, 'bt': 2, 'aw': 1, 'equip': 0}},
    {'id': 10, 'name': '广宗决战', 'sub': '第10战', 'desc': '第一卷第一章最终战，推荐 Lv20 / 突2 / 觉2。',
     'enemies': ['张角', '于吉', '左慈', '张宝', '张梁'], 'config': {'level': 20, 'bt': 2, 'aw': 2, 'equip': 0}},
]

BY_FACTION = {f: [r['姓名'] for r in RECORDS if r['阵营'] == f] for f in ('魏', '蜀', '吴', '群雄')}
GROUP = {r['姓名']: core.role_group(r['定位']) for r in RECORDS}


def _rewards(gid):
    first = {'铜钱': 2000 + 30 * gid, '兵书': 4 + gid // 10, '将魂': 1 + gid // 100}
    repeat = {'铜钱': 400 + 8 * gid, '兵书': 1 + gid // 20}
    # 章法关（每章第 3、7 关，敌军带专属增益）：首通加三成铜钱并多给一本兵书作补偿
    if gid % 10 in (3, 7):
        first['铜钱'] = int(first['铜钱'] * 1.3)
        first['兵书'] = first['兵书'] + 1
    if gid >= 400:
        first['玄铁'] = 1
    if gid % 10 == 0:
        first['招贤令'] = 1
    book_tier = max(1, min(5, 1 + gid // 140))
    book_pool = BOOK_SKILLS['传奇'] if book_tier <= 2 else BOOK_SKILLS['绝世']
    book_skill = random.choice(book_pool) if book_pool else '铁壁'
    drops = [{'item': '魂石', 'chance': 0.35, 'amount': 1},
             {'item': '神器碎片', 'chance': 0.22, 'amount': 1},
             {'item': f'技能书·{book_tier}阶·{book_skill}', 'chance': 0.16, 'amount': 1}]
    if gid >= 200:
        drops.append({'item': '图纸', 'chance': 0.18, 'amount': 1})
    if gid >= 300:
        drops.append({'item': '玄铁', 'chance': 0.12, 'amount': 1})
    if gid >= 500:
        drops.append({'item': '上古钥匙', 'chance': 0.08, 'amount': 1})
    return first, repeat, drops


# ---- 关卡敌将选择：全局出场均衡 + 老兵席 ----
# 200 将里有 20 人（蜀 12 / 吴 8，全部是普通·精良）从未在 700 关中登场，原因两个：
#   (1) 蜀吴 20 章全落在 gid 302~541，_allowed_rarities 在该区间只放传奇/绝世，低稀有度将进不了候选池；
#   (2) _fixed_team 按 ORDER（绝世优先）排序后取前 3 倍，低稀有度将永远排在候选尾部。
# 修法：所有选人改为"全局出场次数少的优先"，并每关给 1 个"老兵席"，
# 允许白名单之外的**更低稀有度**将登场（跳档仍然禁止），直到其出场达 VET_QUOTA 次后自动停用。
HITS = {}
VET_CYCLE = ('TANK', 'HEAL', 'SUPPORT', 'DAMAGE')
VET_QUOTA = 3


def _bump(names):
    for n in names:
        HITS[n] = HITS.get(n, 0) + 1


def _take(cands, need, rng):
    """按全局出场次数从少到多取 need 个（同次数用 rng 打散，保持确定性），并计入 HITS。"""
    if need <= 0 or not cands:
        return []
    jitter = {n: rng.random() for n in cands}
    cands = sorted(cands, key=lambda n: (HITS.get(n, 0), jitter[n]))
    picked = cands[:need]
    _bump(picked)
    return picked


def _rrank(rar):
    """稀有度档位序号：绝世 0 / 传奇 1 / 精良 2 / 普通 3（越大越低档）。"""
    return ORDER.get(rar, 3)


def _allowed_rarities(gid, local):
    if gid <= 100:
        r = ['普通', '精良']
        if local >= 7:
            r.append('传奇')
    elif gid <= 300:
        r = ['精良', '传奇']
        if local == 10:
            r.append('绝世')
    elif gid <= 500:
        r = ['传奇']
        if local >= 8:
            r.append('绝世')
    else:
        r = ['传奇', '绝世']
    return set(r)


def _pick_team(ch, gid, local, rng):
    faction, boss = ch[3], ch[4]
    allowed = _allowed_rarities(gid, local)
    min_rank = min(_rrank(r) for r in allowed)      # 白名单里最高档的序号，比它更小=跳档，禁止
    fact_all = list(BY_FACTION.get(faction, []))
    strict = [n for n in fact_all if REC[n]['稀有度'] in allowed]
    # 老兵池：本阵营中稀有度比白名单更低（_rrank >= min_rank）、但未进白名单的人
    low = [n for n in fact_all if n not in strict and _rrank(REC[n]['稀有度']) >= min_rank]
    if len(strict) < 4:
        strict = fact_all
    if len(strict) < 4:
        strict = [r['姓名'] for r in RECORDS]
    team = []
    if local == 10 and boss in REC:
        team.append(boss)
        _bump([boss])
    vet_group = VET_CYCLE[gid % 4]
    vet_done = False
    for group, need in [('TANK', 1), ('HEAL', 1), ('SUPPORT', 1), ('DAMAGE', 2)]:
        if len(team) >= 5:
            break
        have = sum(1 for n in team if GROUP.get(n) == group)
        want = need - have
        if want <= 0:
            continue
        # 老兵席：每关最多 1 席，角色按关号轮换；该角色池里还有出场不足 VET_QUOTA 次的低档将才启用
        if not vet_done and group == vet_group:
            cand_low = [n for n in low if n not in team and GROUP.get(n) == group]
            if cand_low and min(HITS.get(n, 0) for n in cand_low) < VET_QUOTA:
                team += _take(cand_low, 1, rng)
                vet_done = True
                want -= 1
        if want <= 0:
            continue
        cand = [n for n in strict if n not in team and GROUP.get(n) == group]
        team += _take(cand, want, rng)
    while len(team) < 5:
        cand = [n for n in strict if n not in team]
        if not cand:
            cand = [n for n in fact_all if n not in team]
        if not cand:
            cand = [n for n in REC if n not in team]
        if not cand:
            break
        team += _take(cand, 1, rng)
    return team[:5]


def _fixed_team(ch_idx, local, ch):
    """每章第 1/5/10 关的固定阵容：按章节确定性生成，角色配比固定。"""
    faction, boss = ch[3], ch[4]
    rng = random.Random(20261120 + ch_idx * 97 + local * 13)
    pool = list(BY_FACTION.get(faction, []))
    if local == 10:
        pool = [n for n in pool if REC[n]['稀有度'] in ('绝世', '传奇')] or pool
    elif local == 5:
        pool = [n for n in pool if REC[n]['稀有度'] in ('传奇', '精良')] or pool
    else:
        pool = [n for n in pool if REC[n]['稀有度'] in ('精良', '普通')] or pool
    team = []
    if local == 10 and boss in REC:
        team.append(boss)
        _bump([boss])
    for group, need in [('TANK', 1), ('HEAL', 1), ('SUPPORT', 1), ('DAMAGE', 2)]:
        if len(team) >= 5:
            break
        have = sum(1 for n in team if GROUP.get(n) == group)
        want = need - have
        if want <= 0:
            continue
        cand = [n for n in pool if n not in team and GROUP.get(n) == group]
        if not cand:
            cand = [n for n in BY_FACTION.get(faction, []) if n not in team and GROUP.get(n) == group]
        team += _take(cand, want, rng)
    while len(team) < 5:
        cand = [n for n in pool if n not in team] or [n for n in REC if n not in team]
        if not cand:
            break
        team += _take(cand, 1, rng)
    return team[:5]


def _config_for(gid):
    # 第 1 章前 10 关手工配置到 Lv20/突2/觉2，之后从同一档位平滑爬升
    lvl = min(100, 20 + (gid - 10) // 8)
    return {'level': lvl,
            'bt': min(5, 2 + max(0, lvl - 20) // 16),
            'aw': min(6, 2 + max(0, lvl - 20) // 13),
            'equip': 1 if gid >= 400 else 0}


LEVELS = []
for base in BASE_LEVELS:
    lv = dict(base)
    lv.update({'volume': 1, 'volume_name': VOLUMES[1], 'chapter': 1, 'chapter_name': CHAPTERS[0][2]})
    LEVELS.append(lv)

# 前 10 关是手写关卡，先把它们的敌将计入出场统计，避免同一批人被重复抽到
HITS.clear()
for base in BASE_LEVELS:
    _bump(list(base.get('enemies') or ()))

rng = random.Random(20261119)
for gid in range(11, 701):
    idx = (gid - 1) // 10
    local = (gid - 1) % 10 + 1
    ch = CHAPTERS[idx]
    cfg = _config_for(gid)
    enemies = _fixed_team(idx, local, ch) if local in (1, 5, 10) else _pick_team(ch, gid, local, rng)
    lv_desc = f'第{ch[0]}卷·{VOLUMES[ch[0]]} 第{ch[1]}章·{ch[2]}，第{local}战。'
    if local == 10:
        lv_desc += '本章决战，固定阵容。'
    elif local in (1, 5):
        lv_desc += '固定阵容。'
    LEVELS.append({
        'id': gid, 'name': ch[2], 'sub': f'第{local}战',
        'desc': lv_desc,
        'enemies': enemies, 'config': cfg,
        'volume': ch[0], 'volume_name': VOLUMES[ch[0]], 'chapter': ch[1], 'chapter_name': ch[2],
    })

for lv in LEVELS:
    lv['recommend'] = dict(lv['config'])
    lv['power'] = _power(lv['enemies'], lv['config'])
    lv['first'], lv['repeat'], lv['drops'] = _rewards(lv['id'])
    for n in lv['enemies']:
        if n not in REC:
            print('缺将：', n, 'in level', lv['id'])

LEVELS.sort(key=lambda x: x['id'])

# /api/levels 返回的关卡全量 JSON 只构建一次：700 关 + 3500 个敌将子字典，
# 每次重建约 300ms，且客户端每次进入都会请求。构建后配 ETag，浏览器命中 304。
_LV_CACHE = {}
_LV_LOCK = threading.Lock()


def levels_payload():
    with _LV_LOCK:
        if 'body' not in _LV_CACHE:
            out = []
            for lv in LEVELS:
                item = dict(lv)
                item['enemies'] = [{
                    'name': n, 'rarity': REC[n]['稀有度'], 'role': REC[n]['定位'],
                    'faction': REC[n]['阵营'], 'card': CARD_FILE[n],
                } for n in lv['enemies']]
                out.append(item)
            body = json.dumps(out, ensure_ascii=False).encode('utf-8')
            _LV_CACHE['body'] = body
            _LV_CACHE['etag'] = '"lv%d-%s"' % (
                len(body), hashlib.md5(body).hexdigest()[:16])
        return _LV_CACHE['body'], _LV_CACHE['etag']


# ---- 本机存档（单机买断制的落盘层）----
# 浏览器 localStorage 不再是唯一真相，saves/<档案>.json 才是。
# 每次写入先轮转 3 份备份再原子替换（tmp + os.replace），坏档可逐级回退。
SAVE_LOCK = threading.Lock()
SAVE_LIMIT = 900 * 1024


def save_name(raw):
    """档案名白名单：字母/数字/中文/下划线/连字符，最长 24，其余一律回落到 main。"""
    raw = (raw or 'main').strip()
    if not raw or len(raw) > 24:
        return 'main'
    if not all(ch.isalnum() or ch in '-_' for ch in raw):
        return 'main'
    return raw


def _save_file(pname):
    return os.path.join(SAVE_DIR, pname + '.json')


def save_load(pname):
    """读存档；主档坏了按 bak1→bak2→bak3 回退。"""
    fp = _save_file(pname)
    for cand in (fp, fp + '.bak1', fp + '.bak2', fp + '.bak3'):
        if not os.path.isfile(cand):
            continue
        try:
            with open(cand, 'rb') as f:
                doc = json.loads(f.read() or b'null')
        except Exception:
            continue
        if isinstance(doc, dict) and isinstance(doc.get('data'), dict):
            return doc
    return None


def save_store(pname, patch):
    """把 patch 合并进存档并落盘；值为 None 表示删除该键。返回 (revision, updated, 键数)。"""
    with SAVE_LOCK:
        doc = save_load(pname) or {}
        data = dict(doc.get('data') or {})
        for k, v in patch.items():
            if v is None:
                data.pop(k, None)
            else:
                data[k] = v
        rev = int(doc.get('revision') or 0) + 1
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        raw = json.dumps({'profile': pname, 'revision': rev, 'updated': now,
                          'data': data}, ensure_ascii=False).encode('utf-8')
        if len(raw) > SAVE_LIMIT:
            return None
        fp = _save_file(pname)
        if os.path.isfile(fp):
            # 轮转：bak2→bak3、bak1→bak2、主档→bak1（顺序不能反，否则会丢最老的一份）
            for a, b in (('.bak2', '.bak3'), ('.bak1', '.bak2'), ('', '.bak1')):
                src = fp + a
                if os.path.exists(src):
                    try:
                        os.replace(src, fp + b)
                    except OSError:
                        pass
        tmp = fp + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(raw)
        os.replace(tmp, fp)
        return rev, now, len(data)


def save_list():
    out = []
    try:
        names = sorted(os.listdir(SAVE_DIR))
    except OSError:
        return out
    for fn in names:
        if not fn.endswith('.json'):
            continue
        fp = os.path.join(SAVE_DIR, fn)
        doc = None
        try:
            with open(fp, 'rb') as f:
                doc = json.loads(f.read() or b'null')
        except Exception:
            doc = None
        doc = doc if isinstance(doc, dict) else {}
        out.append({'profile': fn[:-5], 'revision': doc.get('revision') or 0,
                    'updated': doc.get('updated') or '', 'size': os.path.getsize(fp),
                    'keys': len(doc.get('data') or {})})
    return out


TOWER_BUFFS = [
    {'id': 'atk', 'name': '破军', 'desc': '全体攻击 +10%', 'effect': {'atk': 0.10}},
    {'id': 'dr', 'name': '铁壁', 'desc': '全体减伤 +8%', 'effect': {'dr': 0.08}},
    {'id': 'crit', 'name': '锋芒', 'desc': '全体暴击率 +10%', 'effect': {'crit': 0.10}},
    {'id': 'hp', 'name': '固守', 'desc': '全体兵力 +10%', 'effect': {'hp': 0.10}},
    {'id': 'heal', 'name': '回春', 'desc': '全体治疗效果 +10%', 'effect': {'heal': 0.10}},
    {'id': 'speed', 'name': '疾行', 'desc': '全体速度 +8%', 'effect': {'speed': 0.08}},
    {'id': 'hit', 'name': '洞察', 'desc': '全体效果命中 +10%', 'effect': {'effect_hit': 0.10}},
    {'id': 'ls', 'name': '饮血', 'desc': '全体吸血 +5%', 'effect': {'lifesteal': 0.05}},
    {'id': 'atk2', 'name': '骁勇', 'desc': '全体攻击 +15%', 'effect': {'atk': 0.15}},
    {'id': 'dr2', 'name': '磐石', 'desc': '全体减伤 +12%', 'effect': {'dr': 0.12}},
]
TOWER_BOSSES = ['吕布', '关羽', '曹操', '司马懿', '周瑜', '孙策', '诸葛亮', '张飞', '赵云', '孟获']
# 每 100 层依次解锁一种新奖励，数组跑完后按更高档循环
TOWER_REWARD_TYPES = ['将魂', '魂石', '图纸', '玄铁', '神兵', '上古钥匙', '神器碎片']
TOWER_CACHE = {}


def _tower_tier(floor):
    """每 10 层升一阶。"""
    return (floor - 1) // 10 + 1


def _tower_reward(floor):
    tier = _tower_tier(floor)
    mult = 1 + 0.25 * (tier - 1)          # 每升一阶，奖励整体提升
    reward = {
        '铜钱': int((500 + 50 * floor) * mult),
        '塔币': int((5 + floor) * mult),
        '兵书': int((2 + floor // 5) * mult),
    }
    if floor % 5 == 0:
        reward['塔币'] += 10 * tier
    if floor % 10 == 0:                    # 升阶层额外奖励
        reward['塔币'] += 15 * tier
        reward['兵书'] += tier
    for k in range(1, floor // 100 + 1):   # 每 100 层开启一档新奖励
        name = TOWER_REWARD_TYPES[(k - 1) % len(TOWER_REWARD_TYPES)]
        cycle = (k - 1) // len(TOWER_REWARD_TYPES)
        reward[name] = reward.get(name, 0) + max(1, int((1 + tier / 4) * (1 + cycle)))
    return reward


def _tower_floor(floor):
    """无限层：按层数确定性生成，敌人强度随层数持续递增。"""
    ent = TOWER_CACHE.get(floor)
    if ent:
        return ent
    # 100 层内沿用原阵容曲线；更深的层在后期强阵容里按层轮换，避免循环回弱阵容
    src = LEVELS[min(699, (floor - 1) * 7)] if floor <= 100 else LEVELS[600 + ((floor * 37) % 100)]
    n = 3 if floor <= 20 else 4 if floor <= 40 else 5
    enemies = list(src['enemies'][:n])
    if floor % 5 == 0:
        boss = TOWER_BOSSES[(floor // 5 - 1) % len(TOWER_BOSSES)]
        if boss not in enemies:
            enemies = [boss] + enemies[1:]
    cfg = {'level': 1 + floor,                     # 不封顶，逐层变强
           'bt': min(5, floor // 20),
           'aw': min(6, floor // 17),
           'equip': 1 if floor >= 40 else 0}
    rng = random.Random(20261121 + floor)          # 每层固定，便于复现
    buffs = rng.sample(TOWER_BUFFS, 3)
    power = int(round(_power(enemies, cfg) * (1 + 0.03 * (cfg['level'] - 1))))
    ent = {'floor': floor, 'enemies': enemies, 'config': cfg, 'buffs': buffs,
           'reward': _tower_reward(floor), 'power': power,
           'boss': floor % 5 == 0, 'tier': _tower_tier(floor),
           'milestone': floor % 100 == 0}
    TOWER_CACHE[floor] = ent
    return ent


def tower_range(start=1, count=200):
    start = max(1, int(start))
    count = max(1, min(500, int(count)))
    return [_tower_floor(i) for i in range(start, start + count)]


# ---------- 每日 / 每周试炼 ----------
_TRIAL_CACHE = {'date': None, 'data': None}


def _trial_enemy_pool(rng):
    names = []
    for lv in LEVELS[420:]:
        for n in lv['enemies']:
            if n not in names:
                names.append(n)
    rng.shuffle(names)
    return names


def _mk_trial(tid, name, desc, size, req, level, bt, aw, equip, reward, rng):
    names = _trial_enemy_pool(rng)[:size]
    cfg = {'level': level, 'bt': bt, 'aw': aw, 'equip': equip}
    return {'id': tid, 'name': name, 'desc': desc, 'size': size, 'req': req,
            'config': cfg, 'enemies': names, 'reward': reward,
            'power': _power(names, cfg), 'level': level}


def trials_for_today():
    """按本地日期生成今日试炼与本周 BOSS，当天内固定。"""
    day = datetime.date.today()
    key = day.isoformat()
    if _TRIAL_CACHE['date'] == key:
        return _TRIAL_CACHE['data']
    rng = random.Random(day.toordinal() * 7919 + 17)
    fac = rng.choice(['魏', '蜀', '吴', '群雄'])
    troop = rng.choice(['步兵', '骑兵', '弓兵', '方士'])
    daily = [
        _mk_trial('d1', '阵列试炼', f'至少 3 名「{fac}」阵营武将', 5,
                  {'type': 'faction', 'label': f'至少 3 名{fac}阵营', 'value': fac, 'min': 3},
                  25, 1, 1, 0,
                  {'铜钱': 8000, '兵书': 20, '将魂': 5}, rng),
        _mk_trial('d2', '兵种试炼', f'至少 3 名「{troop}」兵种武将，4 人上阵', 4,
                  {'type': 'troop', 'label': f'至少 3 名{troop}', 'value': troop, 'min': 3},
                  35, 2, 2, 0,
                  {'铜钱': 12000, '塔币': 150, '魂石': 5}, rng),
        _mk_trial('d3', '精英试炼', '3 人精英队，无阵容限制', 3, None,
                  50, 3, 3, 1,
                  {'铜钱': 18000, '将魂': 12, '图纸': 3}, rng),
    ]
    week_start = day - datetime.timedelta(days=day.weekday())
    wrng = random.Random(week_start.toordinal() * 104729 + 31)
    weekly = _mk_trial('weekly', '周常·群雄围猎', '本周高难挑战：5 人主力', 5, None,
                       75, 5, 5, 1,
                       {'招贤令': 5, '金符': 3, '神兵': 5, '铜钱': 50000, '塔币': 500}, wrng)
    data = {'date': key, 'week': week_start.isoformat(), 'trials': daily, 'weekly': weekly}
    _TRIAL_CACHE.update(date=key, data=data)
    return data


# ---------- 每日世界首领 ----------
WORLD_BOSS_POOL = ['吕布', '关羽', '曹操', '诸葛亮', '司马懿', '周瑜', '孙策', '赵云', '张飞', '孟获',
                   '马超', '黄忠', '许褚', '典韦', '张辽', '陆逊', '吕蒙', '孙坚', '邓艾', '姜维']
_WORLDBOSS_CACHE = {'date': None, 'data': None}


def worldboss_today():
    day = datetime.date.today()
    key = day.isoformat()
    if _WORLDBOSS_CACHE['date'] == key:
        return _WORLDBOSS_CACHE['data']
    rng = random.Random(day.toordinal() * 3571 + 11)
    boss = rng.choice(WORLD_BOSS_POOL)
    pool = [n for n in REC if n != boss and REC[n]['阵营'] != REC[boss]['阵营']]
    rng.shuffle(pool)
    enemies = [boss] + pool[:4]
    cfg = {'level': 60, 'bt': 3, 'aw': 3, 'equip': 0}
    tiers = [
        {'pct': 10, 'reward': {'铜钱': 15000, '兵书': 50}},
        {'pct': 30, 'reward': {'将魂': 15, '塔币': 500}},
        {'pct': 60, 'reward': {'招贤令': 3, '金符': 2}},
        {'pct': 100, 'reward': {'招贤令': 5, '神兵': 2}},
    ]
    data = {'date': key, 'name': f'世界首领·{boss}', 'boss': boss,
            'enemies': enemies, 'config': cfg, 'tiers': tiers,
            'power': _power(enemies, cfg)}
    _WORLDBOSS_CACHE.update(date=key, data=data)
    return data


def find_trial(tid):
    data = trials_for_today()
    if tid == 'weekly':
        return data['weekly']
    return next((t for t in data['trials'] if t['id'] == tid), None)


# ---------- 副本 / 秘境 / 上古 ----------
DUNGEON_CATS = [
    ('兵书·初', '兵书'), ('兵书·中', '兵书'), ('兵书·高', '兵书'),
    ('魂石·魏', '魂石'), ('魂石·蜀', '魂石'), ('魂石·吴', '魂石'), ('魂石·群雄', '魂石'),
    ('图纸·武器', '图纸'), ('图纸·甲胄', '图纸'), ('图纸·坐骑', '图纸'),
    ('玄铁', '玄铁'), ('上古钥匙', '上古钥匙'),
]
DUNGEONS = []
for ci, (name, material) in enumerate(DUNGEON_CATS):
    for di in range(3):
        src = LEVELS[min(699, 30 + ci * 17 + di * 180)]
        enemies = list(src['enemies'][:5])
        cfg = {'level': 10 + di * 20, 'bt': di, 'aw': di, 'equip': 1 if di >= 2 else 0}
        reward = {'铜钱': 1000 + 500 * di, material: 5 + 5 * di}
        DUNGEONS.append({
            'id': ci * 10 + di, 'cat': name, 'material': material,
            'difficulty': ['普通', '精英', '噩梦'][di],
            'enemies': enemies, 'config': cfg, 'reward': reward,
            'stamina': 12, 'power': _power(enemies, cfg),
        })

SECRET_BLESSINGS = [
    {'name': '杀伐', 'desc': '全体攻击 +20%，全体兵力 -10%', 'effect': {'atk': 0.20}, 'curse': {'hp': -0.10}},
    {'name': '铁壁', 'desc': '全体减伤 +15%，全体攻击 -10%', 'effect': {'dr': 0.15}, 'curse': {'atk': -0.10}},
    {'name': '锋芒', 'desc': '全体暴击 +15%，治疗效果 -20%', 'effect': {'crit': 0.15}, 'curse': {'heal': -0.20}},
    {'name': '疾行', 'desc': '全体速度 +15%，全体兵力 -10%', 'effect': {'speed': 0.15}, 'curse': {'hp': -0.10}},
    {'name': '回春', 'desc': '全体治疗 +25%，全体攻击 -10%', 'effect': {'heal': 0.25}, 'curse': {'atk': -0.10}},
    {'name': '饮血', 'desc': '全体吸血 +10%，全体兵力 -10%', 'effect': {'lifesteal': 0.10}, 'curse': {'hp': -0.10}},
]
# 秘境遗物：只带特殊机制，不参战，只在本局秘境生效
SECRET_RELICS = [
    {'id': 'r_rage', 'name': '战意残卷', 'desc': '每回合开始全体获得 15 点怒气', 'effect': 'rage'},
    {'id': 'r_shield', 'name': '玄铁壁障', 'desc': '开场全体获得 12% 兵力护盾', 'effect': 'shield'},
    {'id': 'r_survive', 'name': '不屈残魂', 'desc': '每名武将首次受到致死伤害时以 20% 兵力存活', 'effect': 'survive'},
    {'id': 'r_revive', 'name': '续命符', 'desc': '友军阵亡时以 25% 兵力复活一次', 'effect': 'revive'},
    {'id': 'r_counter', 'name': '荆棘甲', 'desc': '每次受击后反击伤害逐步提高', 'effect': 'counter'},
    {'id': 'r_chase', 'name': '追风刃', 'desc': '普攻后有 30% 概率追加一次 60% 攻击', 'effect': 'chase'},
    {'id': 'r_cc', 'name': '清心铃', 'desc': '每名武将首次受到控制时免疫', 'effect': 'cc_once'},
    {'id': 'r_first', 'name': '先手令', 'desc': '第一回合全体不可被选中', 'effect': 'first_untarget'},
    {'id': 'r_crit', 'name': '摄魂幡', 'desc': '第一回合全体攻击必定暴击', 'effect': 'first_crit'},
    {'id': 'r_dr', 'name': '守御阵图', 'desc': '前 5 回合全体减伤 10%', 'effect': 'dr5'},
    {'id': 'r_lowhp', 'name': '背水令', 'desc': '兵力低于 50% 时攻击 +20%', 'effect': 'low_hp'},
    {'id': 'r_burn', 'name': '烈焰符', 'desc': '造成的持续伤害提高 8%', 'effect': 'burn'},
    {'id': 'r_wind', 'name': '疾风符', 'desc': '第一回合全体速度 +15%', 'effect': 'first_speed'},
    {'id': 'r_thunder', 'name': '震雷珠', 'desc': '普攻有 12% 概率眩晕目标 1 回合', 'effect': 'stun'},
    {'id': 'r_book', 'name': '兵书残卷', 'desc': '每回合战法伤害 +6%，最高 +30%', 'effect': 'strat_ramp'},
    {'id': 'r_oath', 'name': '同袍令牌', 'desc': '友军阵亡时，存活友军立即反击一次', 'effect': 'revenge'},
]


def _secret_event(rng):
    """生成每层的一次性事件（选择后留在本层，之后还可再战）。"""
    b = rng.choice(SECRET_BLESSINGS)
    r = rng.choice(SECRET_RELICS)
    name = rng.choice(list(REC))
    options = [
        {'label': '搜刮行囊', 'desc': '获得铜钱与兵书', 'reward': {'铜钱': 2500, '兵书': 12}},
        {'label': '触碰遗物', 'desc': '获得一件随机秘境遗物',
         'relic': dict(r)},
        {'label': '接受试炼', 'desc': f'获得祝福「{b["name"]}」，并承受其代价',
         'buffs': [{'name': b['name'], 'effect': dict(b['effect'])}],
         'curse': {'name': b['name'] + '·代价', 'effect': dict(b['curse'])}},
    ]
    rng.shuffle(options)
    title, text = rng.choice([
        ('破庙古箱', '破庙深处放着一只落满尘灰的木箱，箱角刻着残缺的符纹。'),
        ('迷雾旅人', '一名披着蓑衣的旅人拦住去路，自称知晓秘境的旧路。'),
        ('残破祭坛', '祭坛上残留着未熄的香火，石缝里透出微光。'),
        ('废弃兵营', '废弃兵营里遗落着兵器与半卷兵书，远处似乎有脚步声。'),
        ('荒村诊所', '荒村只剩一间药庐，炉火未熄，药香混着血腥味。'),
        ('古道石桥', '石桥刻满了年号与姓名，桥下的水声像远处的战鼓。'),
        ('旧营校场', '校场旗杆已断，地上还留着点将时的脚印。'),
        ('山道岔口', '两条山道通向不同方向，路边插着一支无主的令旗。'),
    ])
    if rng.random() < 0.5:
        options.append({'label': '招募残兵', 'desc': f'临时招募「{name}」随行（不占主力位）',
                        'recruit': name})
    return {'title': title, 'text': text, 'options': options[:3]}


SECRET = []
srng = random.Random(20261122)
for floor in range(1, 11):
    src = LEVELS[(floor * 37) % 700]
    n = 3 + min(2, floor // 4)
    enemies = list(src['enemies'][:n])
    cfg = {'level': 10 + floor * 3, 'bt': min(5, floor // 4),
           'aw': min(6, floor // 5), 'equip': 1 if floor >= 8 else 0}
    reward = {'秘境币': 100 + 50 * floor, '铜钱': 500 + 100 * floor}
    if floor == 10:
        reward['上古钥匙'] = 1
    elite_cfg = dict(cfg)
    elite_cfg['level'] = min(100, cfg['level'] + 6)
    elite_cfg['bt'] = min(5, cfg['bt'] + 1)
    elite_cfg['aw'] = min(6, cfg['aw'] + 1)
    elite_reward = {k: int(v * 1.5) for k, v in reward.items()}
    specials = srng.sample(['shop', 'event', 'recruit', 'relic'], 2)
    nodes = [
        {'type': 'battle', 'name': '遭遇战', 'desc': '标准守卫，稳定推进',
         'enemies': list(enemies), 'config': dict(cfg), 'reward': dict(reward)},
        {'type': 'elite', 'name': '精英战', 'desc': '等级 +6、突破/觉醒 +1，奖励 +50%',
         'enemies': list(enemies), 'config': elite_cfg, 'reward': elite_reward},
    ]
    for sp in specials:
        if sp == 'shop':
            nodes.append({'type': 'shop', 'name': '秘境商店',
                          'desc': '消耗 300 秘境币，获得一个随机祝福', 'cost': 300})
        elif sp == 'event':
            nodes.append({'type': 'event', 'name': '秘境奇遇',
                          'desc': '一次性事件：可拿资源、遗物、祝福或临时招募',
                          'event': _secret_event(srng)})
        elif sp == 'recruit':
            nodes.append({'type': 'recruit', 'name': '临时招募',
                          'desc': '从 3 名武将中选 1 名临时随行（最多 2 名，不占主力位）',
                          'recruits': srng.sample(list(REC), 3)})
        else:
            rel = srng.choice(SECRET_RELICS)
            nodes.append({'type': 'relic', 'name': '遗物祭坛',
                          'desc': '获得一件本局有效的秘境遗物',
                          'relic': dict(rel)})
    SECRET.append({'floor': floor, 'enemies': enemies, 'config': cfg, 'reward': reward,
                   'blessings': srng.sample(SECRET_BLESSINGS, 3), 'power': _power(enemies, cfg),
                   'nodes': nodes})

ANCIENT_BEASTS = [
    ('蚩尤', '神兵·蚩尤旗'), ('刑天', '神兵·刑天盾'),
    ('共工', '神兵·共工戟'), ('烛龙', '神兵·烛龙珠'),
]
ANCIENT_POOL = []
for _lv in LEVELS[400:]:
    for _n in _lv['enemies']:
        if _n not in ANCIENT_POOL:
            ANCIENT_POOL.append(_n)
ANCIENT = []
for bi, (beast, weapon) in enumerate(ANCIENT_BEASTS):
    for stage in range(1, 4):
        src = LEVELS[min(699, 560 + bi * 30 + stage * 8)]
        spare = [n for n in ANCIENT_POOL if n not in src['enemies']]
        enemies_a = list(src['enemies'][:4])
        while len(enemies_a) < 4 and spare:
            enemies_a.append(spare.pop(0))
        enemies_b = []
        for n in (list(src['enemies'][2:]) + spare):
            if n not in enemies_a and n not in enemies_b:
                enemies_b.append(n)
            if len(enemies_b) >= 4:
                break
        cfg_a = {'level': 30 + stage * 15, 'bt': min(5, stage + 1),
                 'aw': min(6, stage + 1), 'equip': 1}
        cfg_b = dict(cfg_a)
        reward = {'将魂': 10 * stage, '铜钱': 3000 * stage}
        if stage == 3:
            reward['神兵'] = 1
        ANCIENT.append({'id': bi * 10 + stage, 'beast': beast, 'weapon': weapon,
                        'stage': stage,
                        'enemies': enemies_a + enemies_b,
                        'enemies_a': enemies_a, 'enemies_b': enemies_b,
                        'config': cfg_a, 'config_a': cfg_a, 'config_b': cfg_b,
                        'reward': reward,
                        'power': _power(enemies_a + enemies_b, cfg_a),
                        'power_a': _power(enemies_a, cfg_a),
                        'power_b': _power(enemies_b, cfg_b)})


def thumb(name):
    path = os.path.join(CACHE_DIR, f'{name}.jpg')
    if os.path.exists(path):
        return path
    src = os.path.join(CARD_DIR, CARD_FILE.get(name, ''))
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert('RGB')
    im.thumbnail((200, 300))
    im.save(path, 'JPEG', quality=86)
    return path

def portrait_thumb(name):
    path = os.path.join(CACHE_DIR, f'p_{name}.jpg')
    if os.path.exists(path):
        return path
    card = CARD_FILE.get(name, '')
    if not card:
        return None
    src = os.path.join(PORTRAIT_DIR, card[:-4] + '_立绘.png')
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert('RGB')
    im.thumbnail((240, 360))
    im.save(path, 'JPEG', quality=86)
    return path


CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
CACHE_REVALIDATE = 'no-cache'
CACHE_HTML = 'no-store, no-cache, must-revalidate, max-age=0'
CACHE_IMAGE = 'public, max-age=604800'
CACHE_CARD = 'public, max-age=86400'
CACHE_API = 'no-store'


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        pass

    def _etag(self, fp):
        try:
            st = os.stat(fp)
            return f'"{int(st.st_mtime)}-{st.st_size}"'
        except OSError:
            return None

    def _send(self, data, ctype='application/json; charset=utf-8', code=200,
              cache=CACHE_API, compress=True, etag=None, vary=None):
        if isinstance(data, str):
            data = data.encode('utf-8')
        if etag and self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', cache)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        body = data
        gz = bool(compress and len(data) >= 1024
                  and 'gzip' in (self.headers.get('Accept-Encoding') or ''))
        if gz:
            body = gzip.compress(data, 5)
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        if etag:
            self.send_header('ETag', etag)
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        varys = []
        if compress:
            varys.append('Accept-Encoding')
        if vary:
            varys.extend(v for v in vary.split(',') if v.strip())
        if varys:
            self.send_header('Vary', ', '.join(dict.fromkeys(varys)))
        for k, v in getattr(self, '_extra_headers', ()):
            self.send_header(k, v)
        self.end_headers()
        if not getattr(self, '_head_only', False):
            self.wfile.write(body)

    def _serve_file(self, fp, ctype, cache=CACHE_IMAGE, compress=False, vary=None):
        etag = self._etag(fp)
        try:
            with open(fp, 'rb') as f:
                data = f.read()
        except OSError:
            return self._send('not found', 'text/plain; charset=utf-8', 404)
        return self._send(data, ctype, cache=cache, compress=compress, etag=etag, vary=vary)

    def _accepts_webp(self):
        return 'image/webp' in (self.headers.get('Accept') or '')

    def _static_cache(self, query):
        return CACHE_IMMUTABLE if urllib.parse.parse_qs(query).get('v') else CACHE_REVALIDATE

    def _client_ip(self):
        return (self.headers.get('CF-Connecting-IP')
                or (self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
                or self.client_address[0])

    def _authorize(self):
        """可选口令：设置 SG_TOKEN 环境变量后，首次带 ?token= 访问会写入 Cookie。"""
        if not ACCESS_TOKEN:
            return True
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        tok = (q.get('token') or [''])[0]
        if tok and secrets.compare_digest(tok, ACCESS_TOKEN):
            self._extra_headers = [('Set-Cookie',
                f'sg_token={ACCESS_TOKEN}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax')]
            return True
        return f'sg_token={ACCESS_TOKEN}' in (self.headers.get('Cookie') or '')

    def do_HEAD(self):
        self._head_only = True
        self.do_GET()

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(p.path)
        if os.environ.get('SG_ACCESS_LOG'):
            try:
                ua = (self.headers.get('User-Agent') or '')[:80]
                print(f'[access] {self.client_address[0]} {self.path} UA={ua!r} INM={bool(self.headers.get("If-None-Match"))}',
                      flush=True)
            except Exception:
                pass
        if path == '/api/ping':
            return self._send('ok', 'text/plain; charset=utf-8', cache='no-store')
        if not self._authorize():
            return self._send('forbidden', 'text/plain; charset=utf-8', 403)
        static_cache = self._static_cache(p.query)
        if path in ('/', '/index.html'):
            return self._serve_file(os.path.join(WEB, 'index.html'),
                                    'text/html; charset=utf-8', CACHE_HTML, compress=True)
        if path == '/app.js':
            return self._serve_file(os.path.join(WEB, 'app.js'),
                                    'application/javascript; charset=utf-8', static_cache, compress=True)
        if path in ('/hero_show.js', '/hero_show_data.js', '/meta.js', '/save.js', '/story_data.js'):
            return self._serve_file(os.path.join(WEB, os.path.basename(path)),
                                    'application/javascript; charset=utf-8', static_cache, compress=True)
        if path.startswith('/fx/') and path.endswith('.png'):
            fp = os.path.join(WEB, 'fx', os.path.basename(path))
            if not os.path.exists(fp):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/png', self._static_cache(p.query))
        if path.startswith('/story/') and path.endswith('.jpg'):
            fp = os.path.join(WEB, 'story', os.path.basename(path))
            if not os.path.exists(fp):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/jpeg', CACHE_IMAGE)
        if path == '/style.css':
            return self._serve_file(os.path.join(WEB, 'style.css'),
                                    'text/css; charset=utf-8', static_cache, compress=True)
        if path == '/api/units':
            return self._send(json.dumps(UNITS, ensure_ascii=False))
        if path == '/api/bonds':
            return self._send(json.dumps(BONDS_DEFS, ensure_ascii=False))
        if path == '/api/trials':
            return self._send(json.dumps(trials_for_today(), ensure_ascii=False))
        if path == '/api/worldboss':
            return self._send(json.dumps(worldboss_today(), ensure_ascii=False))
        if path == '/api/levels':
            body, etag = levels_payload()
            return self._send(body, code=200, compress=True,
                              cache='no-cache', etag=etag)
        if path == '/api/save':
            pname = save_name((urllib.parse.parse_qs(p.query).get('p') or ['main'])[0])
            doc = save_load(pname)
            return self._send(json.dumps({'ok': True, 'profile': pname, 'snapshot': doc},
                                         ensure_ascii=False), cache='no-store')
        if path == '/api/saves':
            return self._send(json.dumps({'ok': True, 'list': save_list()},
                                         ensure_ascii=False), cache='no-store')
        if path == '/asset/frame':
            if not os.path.exists(FRAME):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(FRAME, 'image/png', CACHE_IMAGE)
        if path.startswith('/portrait_thumb/'):
            name = path[len('/portrait_thumb/'):]
            fp = portrait_thumb(name)
            if not fp:
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/jpeg', CACHE_IMAGE)
        if path.startswith('/portrait/'):
            name = path[len('/portrait/'):]
            card = CARD_FILE.get(name, '')
            if not card:
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            base = card[:-4]
            if self._accepts_webp():
                webp = os.path.join(IMG_DIR, 'portrait', base + '_立绘.webp')
                if os.path.isfile(webp):
                    return self._serve_file(webp, 'image/webp', CACHE_CARD, vary='Accept')
            fp = os.path.join(PORTRAIT_DIR, base + '_立绘.png')
            if not os.path.isfile(fp):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/png', CACHE_CARD, vary='Accept')
        if path.startswith('/ui/'):
            rel = path[len('/ui/'):]
            ui_root = os.path.join(ROOT, '美术素材', 'UI素材')
            fp = os.path.normpath(os.path.join(ui_root, rel))
            if not fp.startswith(ui_root) or not os.path.isfile(fp):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/png', self._static_cache(p.query))
        if path == '/api/dungeons':
            return self._send(json.dumps(DUNGEONS, ensure_ascii=False))
        if path == '/api/secret':
            return self._send(json.dumps(SECRET, ensure_ascii=False))
        if path == '/api/ancient':
            return self._send(json.dumps(ANCIENT, ensure_ascii=False))
        if path == '/api/tower':
            qs = urllib.parse.parse_qs(p.query)
            try:
                start = int((qs.get('from') or qs.get('floor') or ['1'])[0])
                count = int((qs.get('count') or ['200'])[0])
            except ValueError:
                start, count = 1, 200
            return self._send(json.dumps(tower_range(start, count), ensure_ascii=False))
        if path.startswith('/card/'):
            name = path[len('/card/'):]
            card = CARD_FILE.get(name, '')
            if not card:
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            base = card[:-4]
            if self._accepts_webp():
                webp = os.path.join(IMG_DIR, 'card', base + '.webp')
                if os.path.isfile(webp):
                    return self._serve_file(webp, 'image/webp', CACHE_CARD, vary='Accept')
            fp = os.path.join(CARD_DIR, card)
            if not os.path.exists(fp):
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/png', CACHE_CARD, vary='Accept')
        if path.startswith('/thumb/'):
            name = path[len('/thumb/'):]
            fp = thumb(name)
            if not fp:
                return self._send('not found', 'text/plain; charset=utf-8', 404)
            return self._serve_file(fp, 'image/jpeg', CACHE_IMAGE)
        return self._send('not found', 'text/plain; charset=utf-8', 404)

    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        if not self._authorize():
            return self._send('forbidden', 'text/plain; charset=utf-8', 403)
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            return self._send(json.dumps({'error': '请求体过大'}, ensure_ascii=False), code=413)
        try:
            body = json.loads(self.rfile.read(n) or b'{}')
        except Exception as e:
            return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)
        if p.path == '/api/save':
            pname = save_name((urllib.parse.parse_qs(p.query).get('p') or ['main'])[0])
            data = body.get('data') if isinstance(body, dict) else None
            if not isinstance(data, dict) or not data:
                return self._send(json.dumps({'error': 'data 不能为空'}, ensure_ascii=False), code=400)
            patch = {}
            for k, v in data.items():
                if not isinstance(k, str) or not k.startswith('sg_'):
                    continue
                if v is None:
                    patch[k] = None
                elif isinstance(v, str) and len(v) <= 400 * 1024:
                    patch[k] = v
            if not patch:
                return self._send(json.dumps({'error': '没有可写的 sg_ 键'}, ensure_ascii=False), code=400)
            res = save_store(pname, patch)
            if res is None:
                return self._send(json.dumps({'error': '存档超过 900KB 上限'}, ensure_ascii=False), code=413)
            rev, updated, keys = res
            return self._send(json.dumps({'ok': True, 'profile': pname, 'revision': rev,
                                          'updated': updated, 'keys': keys},
                                         ensure_ascii=False), cache='no-store')
        if p.path == '/api/battle/start':
            if not _rate_ok(self._client_ip() + ':battle', 60):
                return self._send(json.dumps({'error': '请求过于频繁'}, ensure_ascii=False), code=429)
            try:
                a = body.get('a') or []
                b = body.get('b') or []
                if not 3 <= len(a) <= 8 or not 3 <= len(b) <= 8:
                    raise ValueError('阵容人数不合法')
                trial_id = body.get('trial_id')
                if trial_id:
                    tr = find_trial(str(trial_id))
                    if not tr:
                        raise ValueError('试炼不存在或已过期')
                    if len(a) != tr['size']:
                        raise ValueError(f"试炼需要 {tr['size']} 人上阵")
                    req = tr.get('req')
                    if req:
                        key = '阵营' if req['type'] == 'faction' else '兵种'
                        cnt = sum(1 for n in a if (REC.get(n) or {}).get(key) == req['value'])
                        if cnt < req['min']:
                            raise ValueError('不满足试炼条件：' + req['label'])
                    b = tr['enemies']
                    body['enemy_config'] = tr['config']
                support = [n for n in (body.get('support') or []) if n in REC and n not in a][:3]
                active_bonds = resolve_bonds(list(a) + support)
                combos = []
                _combo_seen = set()
                for _b in active_bonds:
                    _c = BOND_COMBOS.get(_b.get('id'))
                    if _c and _c['id'] not in _combo_seen:
                        _combo_seen.add(_c['id'])
                        combos.append(_c)
                # 秘境遗物 / 本局特殊机制：转为合成羁绊效果，由引擎统一施加
                for _i, _eff in enumerate([e for e in (body.get('player_specials') or [])
                                           if isinstance(e, str) and e in BOND_EFFECTS][:8]):
                    active_bonds.append({'id': f'spec_{_i}', 'effect': _eff,
                                         'type': 'relic', 'name': '秘境遗物',
                                         'effectName': '遗物效果', 'effectDesc': '本局秘境遗物生效'})
                bt = api.create_battle(a, b, seed=int(body.get('seed') or 1),
                                       level=int(body.get('level') or 1),
                                       bt=int(body.get('bt') or 0),
                                       aw=int(body.get('aw') or 0),
                                       equip=int(body.get('equip') or 0),
                                       config_b=body.get('enemy_config'),
                                       progress_a=body.get('player_progress'),
                                       buffs_a=body.get('player_buffs'),
                                       buffs_b=body.get('enemy_buffs'),
                                       bonds_a=active_bonds, combos_a=combos)
                sid = uuid.uuid4().hex
                with SESSION_LOCK:
                    _session_put(sid, bt)
                return self._send(json.dumps({
                    'session': sid, 'units': bt.state_units(), 'round': bt.round,
                    'done': False, 'winner': None, 'events': [], 'prompt': None,
                    'bonds': [{'name': b['name'], 'effectName': b['effectName'],
                               'effectDesc': b['effectDesc']} for b in active_bonds],
                    'combos': combos,
                }, ensure_ascii=False))
            except Exception as e:
                return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)
        if p.path == '/api/battle/combo':
            sid = body.get('session') or ''
            with SESSION_LOCK:
                bt = _session_get(sid)
            if not bt:
                return self._send(json.dumps({'error': '战斗会话不存在或已过期'}, ensure_ascii=False), code=400)
            try:
                res = bt.use_combo(0)
                if not res:
                    return self._send(json.dumps({'error': '合击不可用'}, ensure_ascii=False), code=400)
                if res.get('error'):
                    return self._send(json.dumps(res, ensure_ascii=False), code=400)
                res['session'] = sid
                if res.get('done'):
                    with SESSION_LOCK:
                        _session_drop(sid)
                return self._send(json.dumps(res, ensure_ascii=False))
            except Exception as e:
                return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)
        if p.path in ('/api/battle/step', '/api/battle/choose'):
            sid = body.get('session') or ''
            with SESSION_LOCK:
                bt = _session_get(sid)
            if not bt:
                return self._send(json.dumps({'error': '战斗会话不存在或已过期'}, ensure_ascii=False), code=400)
            try:
                if p.path == '/api/battle/choose':
                    res = bt.step(auto=False, skill_type=body.get('skill'))
                else:
                    res = bt.step(auto=bool(body.get('auto', True)))
                res['session'] = sid
                if res.get('done'):
                    with SESSION_LOCK:
                        _session_drop(sid)
                return self._send(json.dumps(res, ensure_ascii=False))
            except Exception as e:
                return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)
        if p.path == '/api/battle/auto':
            sid = body.get('session') or ''
            with SESSION_LOCK:
                bt = _session_get(sid)
            if not bt:
                return self._send(json.dumps({'error': '战斗会话不存在或已过期'}, ensure_ascii=False), code=400)
            try:
                guard = 0
                while not bt.done and guard < 5000:
                    bt.step(auto=True)
                    guard += 1
                if not bt.done:
                    bt.judge()
                with SESSION_LOCK:
                    _session_drop(sid)
                return self._send(json.dumps({
                    'session': sid, 'done': True, 'winner': bt.winner,
                    'round': bt.round, 'events': bt.events,
                    'units': bt.state_units(), 'prompt': None,
                }, ensure_ascii=False))
            except Exception as e:
                return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)
        if p.path != '/api/battle':
            return self._send('not found', 'text/plain; charset=utf-8', 404)
        try:
            a = body.get('a') or []
            b = body.get('b') or []
            if len(a) != 5 or len(b) != 5:
                raise ValueError('双方各需要 5 名武将')
            res = api.run_battle(a, b, seed=int(body.get('seed') or 1),
                                 level=int(body.get('level') or 1),
                                 bt=int(body.get('bt') or 0),
                                 aw=int(body.get('aw') or 0),
                                 equip=int(body.get('equip') or 0),
                                 config_b=body.get('enemy_config'),
                                 progress_a=body.get('player_progress'),
                                       buffs_a=body.get('player_buffs'),
                                       buffs_b=body.get('enemy_buffs'))
            return self._send(json.dumps(res, ensure_ascii=False))
        except Exception as e:
            return self._send(json.dumps({'error': str(e)}, ensure_ascii=False), code=400)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8790'))
    print(f'《三国·将星录》MOD 已启动：http://localhost:{port}')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
