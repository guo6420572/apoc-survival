# -*- coding: utf-8 -*-
"""战斗引擎对外 API：给游戏客户端/工具链调用的稳定入口。

用法：
    from engine.api import run_battle, compile_game_data
    r = run_battle(['张飞','许褚'], ['曹操','典韦'], seed=7)
    print(r['winner'], r['rounds'])

编译数据：
    python -m engine.api compile --out data/game_data.json
"""
import argparse
import functools
import json
import os

from . import core


# 数据表只读：openpyxl 解析 130KB xlsx 约 130~180ms，而战斗核心计算仅数十毫秒。
# 按 (绝对路径, mtime) 缓存，改表后 mtime 变化即自动重载。
# 安全性依据：Unit 只通过 rec.get() 读取，skills 已 dict 浅拷贝，talents 列表仅读取 name/desc。
@functools.lru_cache(maxsize=4)
def _load_data_cached(path, mtime):
    return core.load_data(path)


def load_game_data(path=None):
    p = os.path.abspath(path or core.DEFAULT_DATA)
    try:
        mtime = os.path.getmtime(p)
    except OSError:
        mtime = 0.0
    return _load_data_cached(p, mtime)


def _apply_buffs(u, buffs):
    if not buffs:
        return
    for b in buffs:
        eff = b.get('effect', b) if isinstance(b, dict) else {}
        for k, key in (('atk', 'atk'), ('dr', 'dr'), ('crit', 'crit'),
                       ('heal', 'heal'), ('speed', 'speed'),
                       ('effect_hit', 'effect_hit'), ('lifesteal', 'lifesteal'),
                       ('hp', 'hp'), ('strategy_dmg', 'strategy_dmg'),
                       ('pen', 'pen'), ('dodge', 'dodge')):
            if eff.get(k):
                u.perm[key] += float(eff[k])
    u._finalize()


ARTIFACT_EFFECTS = {
    '青龙偃月刀': {'atk': 0.10},
    '丈八蛇矛': {'crit': 0.08},
    '方天画戟': {'atk': 0.06, 'crit_dmg': 0.15},
    '八卦阵图': {'dr': 0.08},
    '孙子兵法': {'strategy_dmg': 0.12},
    '传国玉玺': {'hp': 0.15},
    '诸葛连弩': {'speed': 0.08, 'pen': 0.06},
    '青釭剑': {'crit': 0.10},
    '古锭刀': {'lifesteal': 0.08},
    '鹤氅': {'strategy_dmg': 0.10, 'dr': 0.04},
}


def apply_stratagem(u, strat, tier):
    """三十六计战法书：按计策给单位附加特殊机制，强度随阶提升。"""
    t = max(1, min(6, int(tier or 1)))
    if strat == '瞒天过海':
        u.first_round_untargetable = True; u.self_dr += 0.03 * t
    elif strat == '围魏救赵':
        u.ignore_row_first = True; u.backline_bonus += 0.03 * t
    elif strat == '借刀杀人':
        u.kill_permanent = (int(2 * t), 99)
    elif strat == '以逸待劳':
        u.self_regen += 0.02 * t; u.self_dr += 0.02 * t
    elif strat == '趁火打劫':
        u.dmg_vs_low = (50, 0.04 * t)
    elif strat == '声东击西':
        u.first_attack_crit = True
    elif strat == '无中生有':
        u.start_summon = (1, '伏兵', 0.30 + 0.05 * t, 3)
    elif strat == '暗度陈仓':
        u.first_round_untargetable = True; u.first_attack_pen += 0.05 * t
    elif strat == '隔岸观火':
        u.team_burn_bonus += 0.05 * t
    elif strat == '笑里藏刀':
        u.perm['lifesteal'] += 0.02 * t
    elif strat == '李代桃僵':
        u.survive_lethal = max(u.survive_lethal, 0.01)
    elif strat == '顺手牵羊':
        u.kill_heal = (8 + 2 * t, 1)
    elif strat == '打草惊蛇':
        u.basic_stun = (0.08 + 0.03 * t, 1)
    elif strat == '借尸还魂':
        u.death_summon = (1, '残兵', 0.30 + 0.05 * t)
    elif strat == '调虎离山':
        u.team_control_bonus += 0.04 * t
    elif strat == '欲擒故纵':
        u.dmg_vs_full = 0.04 * t
    elif strat == '抛砖引玉':
        u.first_round_bonus += 0.05 * t
    elif strat == '擒贼擒王':
        u.perm['crit'] += 0.02 * t; u.single_pen += 0.01 * t
    elif strat == '釜底抽薪':
        u.dmg_vs_role = ('医者', 0.05 * t)
    elif strat == '混水摸鱼':
        u.perm['dodge'] += 0.02 * t
    elif strat == '金蝉脱壳':
        u.survive_lethal = max(u.survive_lethal, 0.01); u.low_hp = (30, '闪避', 5 * t)
    elif strat == '关门捉贼':
        u.dmg_vs_low = (40, 0.05 * t)
    elif strat == '远交近攻':
        u.perm['atk'] += 0.02 * t
    elif strat == '假道伐虢':
        u.perm['pen'] += 0.03 * t
    elif strat == '偷梁换柱':
        u.immune_control_once = True
    elif strat == '指桑骂槐':
        u.perm['effect_hit'] += 0.03 * t
    elif strat == '假痴不癫':
        u.self_dr += 0.04 * t; u.immune_control_once = True
    elif strat == '上屋抽梯':
        u.kill_advance += 0.10 * t
    elif strat == '树上开花':
        u.round_start_shield = 0.3 + 0.1 * t
    elif strat == '反客为主':
        u.counter_ramp = (0.01 * t, 0.06 * t)
    elif strat == '美人计':
        u.control_dur_plus += 1; u.perm['effect_hit'] += 0.02 * t
    elif strat == '空城计':
        u.low_hp = (50, '闪避', 5 * t)
    elif strat == '反间计':
        u.start_confuse = (1, 0.05 * t)
    elif strat == '苦肉计':
        u.self_damage_bonus += 0.05 * t; u.low_hp = (50, '攻击', 3 * t)
    elif strat == '连环计':
        u.transfer_no_decay = True; u.dot_spread += 0.05 * t
    elif strat == '走为上':
        u.perm['speed'] += 0.02 * t; u.first_round_untargetable = True


PERM_KEYS = ('atk', 'dr', 'crit', 'crit_dmg', 'hp', 'strategy_dmg',
             'heal', 'speed', 'effect_hit', 'lifesteal', 'dodge', 'pen')
# 套装：2 件属性 / 4 件特殊机制（机制走 apply_bond 的效果 id）
# 觉醒分支（觉醒满 6 星后转职，二选一）
BRANCHES = {
    'wushen': {'perm': {'atk': 0.10, 'crit': 0.08}, 'special': 'kill_action'},
    'junshen': {'perm': {'dr': 0.08, 'hp': 0.10}, 'special': 'survive'},
    'mousheng': {'perm': {'strategy_dmg': 0.12}, 'special': 'cc_once', 'rage': 10},
    'renxin': {'perm': {'heal': 0.15}, 'special': 'regen'},
    'jiying': {'perm': {'speed': 0.08, 'pen': 0.08}, 'special': 'chase'},
    'panshi': {'perm': {'hp': 0.12, 'dr': 0.06}, 'special': 'counter'},
    'guimou': {'perm': {'effect_hit': 0.10, 'strategy_dmg': 0.08}, 'special': 'stun'},
    'yisheng': {'perm': {'heal': 0.12, 'hp': 0.08}, 'special': 'revive'},
}
EQUIP_SETS = {
    '破军': {'two': {'atk': 0.08}, 'four': 'kill_action'},
    '玄甲': {'two': {'dr': 0.08}, 'four': 'survive'},
    '疾风': {'two': {'speed': 0.08}, 'four': 'first_untarget'},
    '回春': {'two': {'heal': 0.10}, 'four': 'regen'},
    '奇谋': {'two': {'strategy_dmg': 0.10}, 'four': 'strat_ramp'},
    '破甲': {'two': {'pen': 0.08}, 'four': 'chase'},
    '磐石': {'two': {'hp': 0.10}, 'four': 'shield'},
    '虎贲': {'two': {'atk': 0.06, 'crit': 0.05}, 'four': 'counter'},
    '青囊': {'two': {'heal': 0.10, 'hp': 0.06}, 'four': 'revive'},
    '军阵': {'two': {'dr': 0.10}, 'four': 'dr5'},
}


def apply_special(u, special):
    """章节秘宝 / 将星印记的附加机制。special 可为 {'id': ...} 或字符串 id。"""
    sid = special.get('id') if isinstance(special, dict) else special
    if not sid:
        return
    if sid == 'regen':
        u.self_regen += 0.04
    elif sid == 'shield':
        u.round_start_shield = max(u.round_start_shield or 0, 0.15)
    elif sid == 'rage':
        u.round_start_rage = max(u.round_start_rage or 0, 20)
    elif sid == 'opening':
        u.first_round_bonus += 0.15
    elif sid == 'dodge':
        u.perm['dodge'] += 0.08
    elif sid == 'survive':
        u.survive_lethal = max(u.survive_lethal, 0.20)
    elif sid == 'pen':
        u.perm['pen'] += 0.10
    elif sid == 'crit':
        u.perm['crit'] += 0.06
    elif sid == 'burn':
        u.team_burn_bonus += 0.08
    elif sid == 'drain':
        u.perm['lifesteal'] += 0.05


def apply_bond(u, bond):
    """羁绊效果：只给特殊机制，不做单纯加属性。bonds 由服务端计算后传入。"""
    eff = bond.get('effect') if isinstance(bond, dict) else bond
    if not eff:
        return
    if eff == 'shield':
        u.round_start_shield = max(u.round_start_shield or 0, 0.12)
    elif eff == 'rage':
        u.round_start_rage = max(u.round_start_rage or 0, 15)
    elif eff == 'regen':
        u.self_regen += 0.04
    elif eff == 'dodge':
        u.perm['dodge'] += 0.08
    elif eff == 'pen':
        u.perm['pen'] += 0.10
    elif eff == 'burn':
        u.team_burn_bonus += 0.08
    elif eff == 'first_crit':
        u.team_first_attack_crit = True
    elif eff == 'dr5':
        u.team_dr_first5 = (5, 0.10)
    elif eff == 'cc_once':
        u.immune_control_once = True
    elif eff == 'chase':
        u.extra_hit = (0.30, 0.60)
    elif eff == 'stun':
        u.basic_stun = (0.12, 1)
    elif eff == 'kill_action':
        u.extra_action_on_kill = True
    elif eff == 'counter':
        u.counter_ramp = (0.10, 0.50)
    elif eff == 'revenge':
        u.ally_death_strike = max(u.ally_death_strike, 0.40)
    elif eff == 'survive':
        u.survive_lethal = max(u.survive_lethal, 0.20)
    elif eff == 'revive':
        u.team_revive = max(u.team_revive or 0, 0.25)
    elif eff == 'first_untarget':
        u.first_round_untargetable = True
    elif eff == 'round_buff':
        u.round_random_buff = [('atk', 0.08), ('effect_hit', 0.08)]
    elif eff == 'low_hp':
        u.low_hp = (50, '攻击', 20)
    elif eff == 'first_speed':
        u.first_round_speed += 0.15
    elif eff == 'strat_ramp':
        u.team_strat_ramp = (0.06, 0.30)


def _apply_bonds(u, bonds):
    for bond in bonds or []:
        apply_bond(u, bond)


def _apply_progress(u, prog):
    """把玩家的技能等级、装备等级与技能书/战法书/神器/秘宝/印记应用到单位。"""
    if not prog:
        return
    for typ, lv in (prog.get('skills') or {}).items():
        if typ not in u.skills or typ in ('特色', '被动'):
            continue
        try:
            lv = max(1, min(11, int(lv)))
        except Exception:
            continue
        sk = dict(u.skills[typ])
        mult = sk.get('mult')
        if mult not in (None, '—') and lv > 1:
            try:
                base = float(str(mult).replace('%', ''))
                sk['mult'] = f"{base * (1 + 0.06 * (lv - 1)):.0f}%"
            except Exception:
                pass
        if sk.get('cd') not in (None, '—', 0, '0') and lv > 1:
            try:
                sk['cd'] = max(1, round(float(sk['cd']) - 0.1 * ((lv - 1) // 3)))
            except Exception:
                pass
        u.skills[typ] = sk
    eq = prog.get('equip') or {}
    slots = ['武器', '甲胄', '坐骑', '兵符']
    levels = []
    for slot in slots:
        try:
            levels.append(max(0, min(5, int(eq.get(slot, 0)))))
        except Exception:
            levels.append(0)
    total = sum(levels)
    try:
        bt = max(0, min(5, int(prog.get('bt', 0) or 0)))
        aw = max(0, min(6, int(prog.get('aw', 0) or 0)))
    except Exception:
        bt = aw = 0
    mult = (1 + 0.02 * total + (0.15 if all(x > 0 for x in levels) else 0)) * (1 + 0.08 * bt) * (1 + 0.05 * aw)
    if mult != 1:
        for k in core.SIX:
            u.stats[k] *= mult
    # 装备词条：随机词条直接叠加到 perm
    affixes = prog.get('affixes') or {}
    if isinstance(affixes, dict):
        for arr in affixes.values():
            for a in (arr or []):
                if not isinstance(a, dict):
                    continue
                k = a.get('k')
                if k in PERM_KEYS:
                    try:
                        u.perm[k] += float(a.get('value') or 0)
                    except (TypeError, ValueError):
                        pass
    # 套装：2 件属性、4 件特殊机制
    eset = EQUIP_SETS.get(prog.get('equipSet'))
    pieces = sum(1 for x in levels if x > 0)
    if eset:
        if pieces >= 2:
            for k, v in eset['two'].items():
                if k in PERM_KEYS:
                    u.perm[k] += v
        if pieces >= 4:
            apply_bond(u, {'effect': eset['four']})
    # 觉醒分支
    br = BRANCHES.get(prog.get('branch'))
    if br:
        for k, v in br.get('perm', {}).items():
            if k in PERM_KEYS:
                u.perm[k] += v
        apply_bond(u, {'effect': br.get('special')})
        if br.get('rage'):
            u.round_start_rage = max(u.round_start_rage or 0, br['rage'])
    sb = prog.get('skillBook')
    if isinstance(sb, dict) and sb.get('desc'):
        u.apply_extra_skill(sb['desc'])
    tb = prog.get('tacticBook')
    if isinstance(tb, dict) and tb.get('strat'):
        apply_stratagem(u, tb['strat'], tb.get('tier', 1))
    eff = ARTIFACT_EFFECTS.get(prog.get('artifact'))
    if eff:
        for k, val in eff.items():
            u.perm[k] += val
    # 章节秘宝（装备位）：固定属性 + 附加机制
    rel = prog.get('relic')
    if isinstance(rel, dict):
        for k, val in (rel.get('stats') or {}).items():
            if k in PERM_KEYS:
                u.perm[k] += float(val)
        apply_special(u, rel.get('special'))
    # 将星印记：可叠加的永久增幅；3 枚共鸣 +5%，5 枚再 +4%
    sigs = [s for s in (prog.get('sigils') or []) if isinstance(s, dict)]
    for sg in sigs:
        for k, val in (sg.get('stats') or {}).items():
            if k in PERM_KEYS:
                u.perm[k] += float(val)
        apply_special(u, sg.get('special'))
    if len(sigs) >= 3:
        for k in ('atk', 'dr', 'hp'):
            u.perm[k] += 0.05
    if len(sigs) >= 5:
        for k in ('atk', 'dr', 'hp'):
            u.perm[k] += 0.04
    u._finalize()


def create_battle(team_a, team_b, seed=1, level=1, bt=0, aw=0, equip=0,
                  config_a=None, config_b=None, progress_a=None, progress_b=None,
                  buffs_a=None, buffs_b=None, bonds_a=None, bonds_b=None,
                  combos_a=None, data_path=None):
    """创建一场未结算的战斗，供手动/单步会话使用。"""
    ca = {'level': level, 'bt': bt, 'aw': aw, 'equip': equip}
    if config_a:
        ca.update(config_a)
    cb = dict(ca)
    if config_b:
        cb.update(config_b)
    records, skills, talents, _ = load_game_data(data_path)
    rec = {r['姓名']: r for r in records}
    units = []
    for names, side, cfg in ((team_a, 0, ca), (team_b, 1, cb)):
        core.LEVEL, core.BT, core.AW, core.EQUIP = cfg['level'], cfg['bt'], cfg['aw'], cfg['equip']
        for n in names:
            u = core.Unit(rec[n], skills[n], talents[n])
            u.side = side
            units.append(u)
        core.assign_rows([u for u in units if u.side == side])
    if progress_a:
        for u in units:
            if u.side == 0 and u.name in progress_a:
                _apply_progress(u, progress_a[u.name])
    if progress_b:
        for u in units:
            if u.side == 1 and u.name in progress_b:
                _apply_progress(u, progress_b[u.name])
    if buffs_a:
        for u in units:
            if u.side == 0:
                _apply_buffs(u, buffs_a)
    if buffs_b:
        for u in units:
            if u.side == 1:
                _apply_buffs(u, buffs_b)
    if bonds_a:
        for u in units:
            if u.side == 0:
                _apply_bonds(u, bonds_a)
                u._finalize()
    if bonds_b:
        for u in units:
            if u.side == 1:
                _apply_bonds(u, bonds_b)
                u._finalize()
    bt = core.Battle(units, seed=seed)
    bt.combos_a = list(combos_a or [])
    return bt


def run_battle(team_a, team_b, seed=1, level=1, bt=0, aw=0, equip=0,
               config_a=None, config_b=None, progress_a=None, progress_b=None,
               buffs_a=None, buffs_b=None, bonds_a=None, bonds_b=None,
               combos_a=None, data_path=None):
    """跑完一场战斗，返回胜方/回合/事件流。双方可分别配置等级/突破/觉醒/装备。"""
    bt_obj = create_battle(team_a, team_b, seed=seed, level=level, bt=bt, aw=aw,
                           equip=equip, config_a=config_a, config_b=config_b,
                           progress_a=progress_a, progress_b=progress_b,
                           buffs_a=buffs_a, buffs_b=buffs_b,
                           bonds_a=bonds_a, bonds_b=bonds_b,
                           combos_a=combos_a, data_path=data_path)
    state = bt_obj.state_units()
    winner = bt_obj.run()
    return {
        'winner': winner,
        'rounds': bt_obj.round,
        'timeout': bt_obj.timeout,
        'units': state,
        'events': bt_obj.events,
    }


def compile_game_data(out_path, data_path=None):
    """把 xlsx 编译成游戏客户端可直接读的 JSON（单位/技能/天赋/羁绊）。"""
    records, skills, talents, bonds = load_game_data(data_path)
    units = {}
    for r in records:
        n = r['姓名']
        units[n] = {
            'name': n, 'faction': r['阵营'], 'rarity': r['稀有度'],
            'role': r['定位'], 'troop': r['兵种'], 'design': r['设计层级'],
            'unlock': r.get('解锁路径', ''),
            'stats': {k: r[k] for k in core.SIX},
            'growth': {k: r[k + '成长'] for k in core.SIX},
            'skills': {t: dict(sk, effect=core.parse_effect(sk)) for t, sk in skills[n].items()},
            'talents': talents[n],
        }
    bond_rows = []
    wb = core.openpyxl.load_workbook(data_path or core.DEFAULT_DATA, read_only=True)
    for row in list(wb['羁绊'].iter_rows(values_only=True))[1:]:
        seq, a, b, name, eff, note = row
        bond_rows.append({'a': a, 'b': b, 'name': name, 'effect': eff, 'note': note})
    data = {
        'version': 1,
        'config': {
            'max_rounds': core.MAX_ROUNDS,
            'hp_formula': '(统御*15+900)×(1+0.007×(等级-1))',
            'level': core.LEVEL, 'bt': core.BT, 'aw': core.AW, 'equip': core.EQUIP,
            'damage': '攻击×基础倍率×(1+一级主属性×0.0065+一级副属性×0.0026)×增伤×(1-减伤)×暴击',
            'rage': '初始20，普攻命中+40，受击+20，满100释放战法',
            'speed': '100+机变×0.8',
        },
        'units': units,
        'bonds': bond_rows,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('compile')
    c.add_argument('--out', required=True)
    c.add_argument('--data', default=None)
    b = sub.add_parser('battle')
    b.add_argument('a')
    b.add_argument('b')
    b.add_argument('--seed', type=int, default=1)
    args = ap.parse_args()
    if args.cmd == 'compile':
        compile_game_data(args.out, args.data)
        print('written', args.out)
    elif args.cmd == 'battle':
        r = run_battle(args.a.split(','), args.b.split(','), seed=args.seed)
        print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
