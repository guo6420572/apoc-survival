/* 三国·将星录 MOD 前端 */
const $ = (s) => document.querySelector(s);
const R = (v) => Math.round(Number(v) || 0);
const FACTION = { '魏': 'var(--wei)', '蜀': 'var(--shu)', '吴': 'var(--wu)', '群雄': 'var(--qun)' };
/* 新档初始资源：只够起步，主要成长靠首通与七日补给 */
const STAMINA_START = 2000;         // 开局库存体力（可高于恢复上限）
const STAMINA_BASE_CAP = 200;       // 自然恢复上限，随通关成长
const START_RES = { 铜钱: 20000, 兵书: 40, 将魂: 20, 魂石: 20, 图纸: 6, 玄铁: 6,
  上古钥匙: 0, 招贤令: 100, 金符: 0, 塔币: 0, 秘境币: 0, 神兵: 0 };
/* 七日新兵补给：逐日递增，每日一次，共 8 招贤令 / 1.5 万铜钱 / 少量养成材料 */
const NEWBIE_REWARDS = [
  { 铜钱: 2000, 兵书: 10 },
  { 铜钱: 3000, 图纸: 3 },
  { 招贤令: 2, 兵书: 12 },
  { 铜钱: 4000, 玄铁: 4 },
  { 魂石: 10, 将魂: 10 },
  { 招贤令: 2, 图纸: 4, 玄铁: 4 },
  { 招贤令: 4, 神器碎片: 5, 铜钱: 6000 },
];
/* 技能书 / 战法书 / 神器 */
const ARTIFACTS = {
  '青龙偃月刀': { rarity: '绝世', stats: { atk: 0.08 }, special: 'first_crit', desc: '武圣之刃：首击必定暴击，攻击大幅提升' },
  '丈八蛇矛': { rarity: '传奇', stats: { crit: 0.06, hp: 0.08 }, special: 'counter', desc: '燕人蛇矛：受击后反击渐强，兵力与暴击提升' },
  '方天画戟': { rarity: '绝世', stats: { atk: 0.05, crit_dmg: 0.12 }, special: 'kill_action', desc: '飞将之戟：击杀后立刻再次行动' },
  '八卦阵图': { rarity: '传奇', stats: { dr: 0.06 }, special: 'shield', desc: '八阵图：开战全军获得护盾' },
  '孙子兵法': { rarity: '绝世', stats: { strategy_dmg: 0.10 }, special: 'strat_ramp', desc: '兵家至圣：策略伤害逐回合提升' },
  '传国玉玺': { rarity: '传奇', stats: { hp: 0.12 }, special: 'rage', desc: '受命于天：每回合开始回复怒气' },
  '诸葛连弩': { rarity: '传奇', stats: { speed: 0.06, pen: 0.04 }, special: 'chase', desc: '元戎连弩：普攻有概率追加一击' },
  '青釭剑': { rarity: '传奇', stats: { crit: 0.08 }, special: 'pen', desc: '削铁如泥：攻击附带穿透' },
  '古锭刀': { rarity: '精良', stats: { lifesteal: 0.06 }, special: 'drain', desc: '古锭刀：造成伤害时吸取兵力' },
  '鹤氅': { rarity: '精良', stats: { strategy_dmg: 0.06, dr: 0.03 }, special: 'regen', desc: '仙风鹤氅：每回合回复兵力' },
};
const STAT_NAMES = { atk: '攻击', crit: '暴击率', crit_dmg: '暴伤', dr: '减伤', hp: '兵力', strategy_dmg: '策略伤害',
  heal: '治疗', speed: '速度', effect_hit: '效果命中', lifesteal: '吸血', dodge: '闪避', pen: '穿透' };
const ITEM_TITLES = { skillBook: '技能书', tacticBook: '战法书', artifact: '神器', relic: '秘宝' };
/* 技能/战法分类：按效果类型归组，用于匹配职业与推荐排序 */
const ITEM_CATS = {
  dps: { name: '输出', cls: 'dps' },
  strategy: { name: '策略', cls: 'strategy' },
  def: { name: '防御', cls: 'def' },
  heal: { name: '治疗', cls: 'heal' },
  control: { name: '控制', cls: 'control' },
  support: { name: '辅助', cls: 'support' },
  summon: { name: '召唤', cls: 'summon' },
};
const TACTIC_CATS = {
  '瞒天过海': 'def', '围魏救赵': 'dps', '借刀杀人': 'dps', '以逸待劳': 'heal',
  '趁火打劫': 'dps', '声东击西': 'dps', '无中生有': 'summon', '暗度陈仓': 'dps',
  '隔岸观火': 'strategy', '笑里藏刀': 'heal', '李代桃僵': 'def', '顺手牵羊': 'heal',
  '打草惊蛇': 'control', '借尸还魂': 'summon', '调虎离山': 'control', '欲擒故纵': 'dps',
  '抛砖引玉': 'dps', '擒贼擒王': 'dps', '釜底抽薪': 'strategy', '混水摸鱼': 'def',
  '金蝉脱壳': 'def', '关门捉贼': 'dps', '远交近攻': 'dps', '假道伐虢': 'dps',
  '偷梁换柱': 'control', '指桑骂槐': 'control', '假痴不癫': 'def', '上屋抽梯': 'dps',
  '树上开花': 'def', '反客为主': 'def', '美人计': 'control', '空城计': 'def',
  '反间计': 'control', '苦肉计': 'dps', '连环计': 'strategy', '走为上': 'support',
};
const ROLE_ARCH_RULES = [
  ['护卫', 'def'], ['续航', 'heal'], ['仁德', 'heal'], ['召唤', 'summon'],
  ['魅惑', 'control'], ['幻术', 'control'], ['控制', 'control'], ['虚弱', 'control'],
  ['号令', 'support'], ['增益', 'support'], ['辅助', 'support'],
  ['猛将', 'dps'], ['骁骑', 'dps'], ['弓手', 'dps'], ['刺客', 'dps'],
  ['虎卫', 'def'], ['医者', 'heal'], ['谋主', 'support'], ['军师', 'strategy'], ['术士', 'strategy'],
];
const FIT = {
  dps: { dps: 3, strategy: 2, control: 2, support: 1, def: 1, heal: 0, summon: 1 },
  def: { def: 3, control: 2, support: 2, heal: 1, dps: 1, strategy: 1, summon: 1 },
  heal: { heal: 3, support: 3, def: 1, control: 1, dps: 0, strategy: 1, summon: 1 },
  support: { support: 3, control: 2, heal: 2, def: 1, strategy: 1, dps: 1, summon: 1 },
  strategy: { strategy: 3, dps: 2, control: 2, support: 1, def: 1, heal: 0, summon: 1 },
  control: { control: 3, strategy: 2, support: 1, def: 1, dps: 1, heal: 1, summon: 1 },
  summon: { summon: 3, strategy: 2, support: 1, dps: 1, def: 1, heal: 1, control: 1 },
};
function roleArch(role) {
  for (const [kw, arch] of ROLE_ARCH_RULES) if ((role || '').includes(kw)) return arch;
  return 'support';
}
function skillCat(desc) {
  const d = desc || '';
  if (/召唤|分身|复活/.test(d)) return 'summon';
  if (/眩晕|沉默|混乱|魅惑|恐惧|嘲讽|控制|虚弱|叛变/.test(d)) return 'control';
  if (/回复|治疗|回血|吸血/.test(d)) return 'heal';
  if (/减伤|护盾|免死|受到的伤害|防御|闪避|韧性/.test(d)) return 'def';
  if (/策略伤害|灼烧|剧毒|雷印|毒/.test(d)) return 'strategy';
  if (/伤害|攻击|暴击|穿透|增伤|暴伤|连击|追击|斩杀/.test(d)) return 'dps';
  return 'support';
}
function itemCat(type, key) {
  if (type === 'tacticBook') return TACTIC_CATS[tacticBookInfo(key).strat] || 'support';
  if (type === 'skillBook') return skillCat(skillBookInfo(key).desc);
  return null;
}
function fitScore(u, cat) {
  if (!cat) return 2;
  const arch = roleArch(u.role || '');
  let s = (FIT[arch] || FIT.support)[cat] ?? 1;
  const wis = u.stats['智谋'] || 0, str = u.stats['武勇'] || 0;
  if (cat === 'strategy') s += wis >= str ? 1 : -1;
  else if (cat === 'dps' && arch !== 'strategy') s += str >= wis ? 1 : -1;
  return Math.max(0, Math.min(4, s));
}
function fitLabel(n) { return n >= 3 ? '推荐' : n === 2 ? '适配' : n === 1 ? '可用' : '不适配'; }
function catChip(cat) {
  const c = ITEM_CATS[cat];
  return c ? `<i class="cat cat-${c.cls}">${c.name}</i>` : '';
}
function itemShort(type, key) {
  if (type === 'skillBook') { const i = skillBookInfo(key); return { name: i.skill, tier: `${i.tier}阶`, desc: i.desc }; }
  if (type === 'tacticBook') { const i = tacticBookInfo(key); return { name: i.strat, tier: `${i.tier}阶`, desc: i.desc }; }
  if (type === 'relic') { const r = (S.relics || {})[key] || {}; return { name: r.name || key, tier: r.rarity || '秘宝', desc: itemDesc('relic', key) }; }
  return { name: key, tier: '神器', desc: itemDesc(type, key) };
}
const SKILL_DESC = new Map();
const SKILL_OWNER = new Map();
const SKILL_RARITY = new Map();
const STRATAGEMS = {
  '瞒天过海': '首回合不可被选中，减伤+3%/阶', '围魏救赵': '可无视站位打后排，后排伤害+3%/阶',
  '借刀杀人': '击杀后攻击永久+2%/阶', '以逸待劳': '每回合回复2%/阶，减伤+2%/阶',
  '趁火打劫': '对残血目标伤害+4%/阶', '声东击西': '首次攻击必定暴击',
  '无中生有': '开场召唤一名帮手（30%+5%/阶属性）', '暗度陈仓': '首回合不可被选中，首击穿透+5%/阶',
  '隔岸观火': '灼烧伤害+5%/阶', '笑里藏刀': '吸血+2%/阶',
  '李代桃僵': '每场免死一次', '顺手牵羊': '击杀回复8%+2%/阶兵力',
  '打草惊蛇': '普攻有8%+3%/阶概率眩晕1回合', '借尸还魂': '阵亡时召唤一名帮手',
  '调虎离山': '对受控目标伤害+4%/阶', '欲擒故纵': '对满血目标伤害+4%/阶',
  '抛砖引玉': '首回合伤害+5%/阶', '擒贼擒王': '暴击+2%/阶，穿透+1%/阶',
  '釜底抽薪': '对医者伤害+5%/阶', '混水摸鱼': '闪避+2%/阶',
  '金蝉脱壳': '免死一次，低血时闪避+5%/阶', '关门捉贼': '对残血目标伤害+5%/阶',
  '远交近攻': '攻击+2%/阶', '假道伐虢': '无视防御+3%/阶',
  '偷梁换柱': '免疫一次控制', '指桑骂槐': '控制命中+3%/阶',
  '假痴不癫': '减伤+4%/阶，免疫一次控制', '上屋抽梯': '击杀后行动条推进10%/阶',
  '树上开花': '每回合获得护盾（威仪×(0.3+0.1/阶)）', '反客为主': '受击反击+1%/阶，上限6%/阶',
  '美人计': '控制持续+1回合，控制命中+2%/阶', '空城计': '低血时闪避+5%/阶',
  '反间计': '开场使一名敌人混乱并易伤5%/阶', '苦肉计': '自损伤害+5%/阶，低血增伤3%/阶',
  '连环计': '伤害传递不衰减，灼烧传递+5%/阶', '走为上': '速度+2%/阶，首回合不可被选中',
};
let PICKER = null;
function effLabel(eff) {
  return Object.entries(eff || {}).map(([k, v]) => `${STAT_NAMES[k] || k}+${Math.round(v * 100)}%`).join(' · ');
}
function buildItemPools() {
  SKILL_DESC.clear(); SKILL_OWNER.clear(); SKILL_RARITY.clear();
  S.units.forEach(u => {
    if (!['传奇', '绝世'].includes(u.rarity)) return;
    for (const t of ['被动', '特色']) {
      const sk = u.skills && u.skills[t];
      if (sk && sk.desc && !SKILL_DESC.has(sk.name)) {
        SKILL_DESC.set(sk.name, sk.desc);
        SKILL_OWNER.set(sk.name, u.name);
        SKILL_RARITY.set(sk.name, u.rarity);
      }
    }
  });
}
/* 技能书是通用装备：把描述中的原武将名替换为“自身”，效果按当前装备者结算 */
function generalizeSkillDesc(skill, desc) {
  if (!desc) return '被动/特色技能';
  const owner = SKILL_OWNER.get(skill);
  return owner && desc.includes(owner) ? desc.split(owner).join('自身') : desc;
}
function skillBookInfo(key) {
  const m = /^技能书·(\d+)阶·(.+)$/.exec(key || '');
  if (!m) return { key, tier: 1, skill: key || '', desc: '' };
  const skill = m[2];
  return { key, tier: Number(m[1]), skill, desc: generalizeSkillDesc(skill, SKILL_DESC.get(skill)) };
}
function tacticBookInfo(key) {
  const m = /^战法书·(\d+)阶·(.+)$/.exec(key || '');
  if (!m) return { key, tier: 1, strat: key || '', desc: '' };
  const strat = m[2];
  return { key, tier: Number(m[1]), strat, desc: STRATAGEMS[strat] || '三十六计' };
}
const ITEM_TABLES = { artifact: ARTIFACTS };
function relicDesc(key) {
  const r = (S.relics || {})[key];
  if (!r) return '章节秘宝';
  return `${effLabel(r.stats)}${r.special ? ' · ' + specialName(r.special) : ''}`;
}
function itemDesc(type, key) {
  if (type === 'skillBook') return skillBookInfo(key).desc;
  if (type === 'tacticBook') return tacticBookInfo(key).desc;
  if (type === 'relic') return relicDesc(key);
  const a = ARTIFACTS[key] || {};
  return (effLabel(a.stats || {}) + (a.desc ? ' · ' + a.desc : '')) || '神器';
}
const S = {
  units: [], by: {}, a: [], b: [], target: 'a',
  faction: '全部', rarity: '全部', q: '',
  speed: 2, battle: null, playing: false, skip: false, cards: new Map(), battleStats: {}, battleDetail: {},
  combos: [], comboUsed: false, unitsState: [],
  config: { level: 1, bt: 0, aw: 0, equip: 0 },
  mode: 'none', levelId: null, levelData: null, levels: [], bLocked: false,
  freeConfig: null, progress: { unlocked: 1, stars: {} }, clears: {},
  session: null, manual: false, paused: false, looping: false, stepOnce: false, prompt: null, busy: false,
  volume: 1, chapter: 1, growthUnit: '吕布', unitProgress: {},
  started: false, screen: 'campaign', codexFaction: '全部', codexRarity: '全部', codexSearch: '',
  inventory: { ...START_RES },
  stamina: { value: STAMINA_START, last: Date.now(), claimDate: '', claims: [false, false] },
  newbie: null, codexGift: [], artifactLv: {},
  dungeons: [], secretFloors: [], ancient: [], secret: { active: false, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false, temp: [], relics: [], used: {}, map: null, mapPos: { layer: -1, index: -1 }, nodeLayer: 0, nodeIndex: 0, activeShop: null, pendingNode: null },
  season: { claimed: [], points: 0, tierClaimed: [], weekly: { week: '', counters: {}, claimed: [] }, titles: [], frame: false, no: 0, ancientCleared: false }, dungeonData: null, ancientData: null, secretData: null,
  ancientRun: null, ancientPhase: 1, affinity: {}, personalData: null, personalName: null, eggClicks: {},
  owned: [], gacha: { normal: { legend: 0, myth: 0, total: 0 }, limited: { legend: 0, myth: 0, total: 0 }, faction: { legend: 0, myth: 0, total: 0 }, newbie: { legend: 0, myth: 0, total: 0 }, event: { legend: 0, myth: 0, total: 0 } }, gachaFaction: '魏',
  tower: { floor: 1, best: 1 }, towerFloors: [], towerBuff: null, towerData: null, towerBuffData: null, shopStock: {},
  support: [], bondDefs: [], bondTipPin: null,
  trials: null, trialData: null, trialState: { date: '', week: '', done: {} },
  worldBossData: null, worldBoss: { date: '', best: 0, bestPct: 0, claimed: [] },
  expedition: { slots: [null, null, null] }, expDraft: null,
  survival: { active: false, wave: 1, seed: 0, upgrades: [], pending: [], best: 0, milestones: [] }, survivalData: null,
  achieve: {
    claimed: [], milestones: [], collection: [], title: '',
    stats: { battles: 0, wins: 0, trials: 0, weekly: 0, decomposes: 0, bondKinds: [], expeditions: 0 },
    records: { maxDamage: 0, fastestTower: 0 }
  },
  achTab: 'ach',
  recruitPool: 'normal', bagSearch: '',
  ending: false
};

function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('sg_config') || '{}');
    S.config = Object.assign({ level: 1, bt: 0, aw: 0, equip: 0 }, c);
  } catch (e) { /* ignore */ }
}
function saveConfig() {
  localStorage.setItem('sg_config', JSON.stringify(S.config));
}
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem('sg_progress') || '{}');
    S.progress = Object.assign({ unlocked: 1, stars: {} }, p);
  } catch (e) { /* ignore */ }
}
function saveProgress() { localStorage.setItem('sg_progress', JSON.stringify(S.progress)); }
function loadClears() {
  try { S.clears = JSON.parse(localStorage.getItem('sg_clears') || '{}') || {}; }
  catch (e) { S.clears = {}; }
}
function saveClears() { localStorage.setItem('sg_clears', JSON.stringify(S.clears || {})); }
function playerLevel() { return Math.min(100, 1 + Math.floor(((S.progress.unlocked || 1) - 1) / 7)); }
function syncPlayerLevel() { S.config.level = playerLevel(); }
function loadInventory() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_inventory') || '{}');
    S.inventory = Object.assign({ ...START_RES }, v);
  } catch (e) { /* ignore */ }
}
function saveInventory() { localStorage.setItem('sg_inventory', JSON.stringify(S.inventory)); }
function migrateEquipAffixes() {
  let changed = false;
  Object.keys(S.unitProgress || {}).forEach(name => {
    const p = S.unitProgress[name];
    if (!p) return;
    p.equip = p.equip || {};
    if (!p.affixes) { p.affixes = {}; changed = true; }
    if (!p.equipSet) { p.equipSet = '破军'; changed = true; }
    ['武器', '甲胄', '坐骑', '兵符'].forEach(slot => {
      const lv = Math.max(0, Math.min(5, p.equip[slot] || 0));
      if (lv > 0) {
        const before = JSON.stringify(p.affixes[slot] || []);
        ensureAffixes(p, slot, lv);
        if (JSON.stringify(p.affixes[slot] || []) !== before) changed = true;
      }
    });
  });
  if (changed) saveUnitProgress();
}
function loadUnitProgress() {
  try { S.unitProgress = JSON.parse(localStorage.getItem('sg_units') || '{}'); }
  catch (e) { S.unitProgress = {}; }
}
function saveUnitProgress() { localStorage.setItem('sg_units', JSON.stringify(S.unitProgress)); }
function loadFormation() {
  try {
    const f = JSON.parse(localStorage.getItem('sg_formation') || 'null');
    if (!f) return;
    const capA = f.mode === 'ancient' ? 8 : 5;
    S.a = (Array.isArray(f.a) ? f.a : []).slice(0, capA).map(n => (n && S.owned.includes(n)) ? n : null);
    while (S.a.length < capA) S.a.push(null);
    S.support = (Array.isArray(f.support) ? f.support : [])
      .filter(n => S.owned.includes(n) && !S.a.includes(n)).slice(0, 3);
    S.b = (Array.isArray(f.b) ? f.b : []).slice(0, 5);
    if (f.levelId) {
      const lv = S.levels.find(x => x.id === f.levelId);
      if (lv && f.levelId <= (S.progress.unlocked || 1)) {
        S.levelId = lv.id; S.levelData = lv; S.mode = 'level'; S.bLocked = true;
        S.volume = lv.volume; S.chapter = lv.chapter;
        if (!S.b.length) S.b = lv.enemies.map(e => e.name);
      }
    }
    if (S.mode !== 'level') { S.mode = 'none'; S.levelId = null; S.levelData = null; S.b = []; S.bLocked = false; }
  } catch (e) { /* ignore */ }
}
const STARTERS = ['张梁'];
function loadOwned() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_owned') || 'null');
    if (Array.isArray(v) && v.length) { S.owned = v; return; }
  } catch (e) { /* ignore */ }
  let extra = [];
  try { const f = JSON.parse(localStorage.getItem('sg_formation') || 'null'); if (f) extra = [...(f.a || []), ...(f.support || []), ...(f.b || [])]; }
  catch (e) { /* ignore */ }
  S.owned = [...new Set([...STARTERS, ...extra])];
}
function saveOwned() { localStorage.setItem('sg_owned', JSON.stringify(S.owned)); }
/* 图鉴收集：每解锁一名武将（首次拥有）奖励 1 金符 */
function loadCodexGift() {
  try { const v = JSON.parse(localStorage.getItem('sg_codexgift') || '[]'); S.codexGift = Array.isArray(v) ? v : []; }
  catch (e) { S.codexGift = []; }
}
function saveCodexGift() { localStorage.setItem('sg_codexgift', JSON.stringify(S.codexGift || [])); }
function loadArtifactLv() {
  try { S.artifactLv = JSON.parse(localStorage.getItem('sg_artifacts') || '{}') || {}; }
  catch (e) { S.artifactLv = {}; }
}
function saveArtifactLv() { localStorage.setItem('sg_artifacts', JSON.stringify(S.artifactLv || {})); }
function artifactLevel(name) { return Math.max(0, Math.min(5, Number((S.artifactLv || {})[name] || 0))); }
function artifactRefineCost(name) {
  const lv = artifactLevel(name);
  return { 神兵: 4 + 4 * lv, 神器碎片: 2 + 2 * lv, 铜钱: 8000 + 8000 * lv };
}
function refineArtifact(name) {
  if (!ARTIFACTS[name]) return;
  const lv = artifactLevel(name);
  if (lv >= 5) { flash('神器已满星'); return; }
  const cost = artifactRefineCost(name);
  for (const k in cost) if ((S.inventory[k] || 0) < cost[k]) { flash(`${k}不足`); return; }
  for (const k in cost) S.inventory[k] -= cost[k];
  S.artifactLv[name] = lv + 1;
  saveArtifactLv(); saveInventory(); renderWallet(); renderBag();
  flash(`${name} 精炼至 ${lv + 1} 星`);
}
function claimCodexGift(name, quiet) {
  if (!name) return false;
  if (!Array.isArray(S.codexGift)) S.codexGift = [];
  if (S.codexGift.includes(name)) return false;
  S.codexGift.push(name);
  S.inventory['金符'] = (S.inventory['金符'] || 0) + 1;
  if (!quiet) {
    saveCodexGift(); saveInventory(); renderWallet();
    flash(`图鉴解锁 · ${name} · 金符 +1`);
  }
  return true;
}
function syncCodexGifts() {
  let n = 0;
  (S.owned || []).forEach(name => { if (claimCodexGift(name, true)) n += 1; });
  if (n) { saveCodexGift(); saveInventory(); renderWallet(); flash(`图鉴解锁奖励：金符 +${n}`); }
}
function loadGacha() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_gacha') || 'null') || {};
    ['normal', 'limited', 'faction', 'newbie', 'event'].forEach(k => {
      S.gacha[k] = Object.assign({ legend: 0, myth: 0, total: 0 }, S.gacha[k] || {}, v[k] || {});
    });
  } catch (e) { /* ignore */ }
}
function saveGacha() { localStorage.setItem('sg_gacha', JSON.stringify(S.gacha)); }
function loadTower() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_tower') || 'null');
    if (v) S.tower = Object.assign({ floor: 1, best: 1 }, v);
  } catch (e) { /* ignore */ }
}
function saveTower() { localStorage.setItem('sg_tower', JSON.stringify(S.tower)); }
/* ---------------- 试炼状态 ---------------- */
function loadTrialState() {
  try {
    S.trialState = Object.assign({ date: '', week: '', done: {} },
      JSON.parse(localStorage.getItem('sg_trials') || '{}'));
  } catch (e) { S.trialState = { date: '', week: '', done: {} }; }
  S.trialState.done = S.trialState.done || {};
  syncTrialState();
}
function saveTrialState() { localStorage.setItem('sg_trials', JSON.stringify(S.trialState)); }
/* ---------------- 内政派遣 / 挂机远征 ---------------- */
const EXPEDITIONS = [
  { id: 'farm', name: '屯田', desc: '筹措军粮与兵书', stats: ['统御', '天命'], base: { 铜钱: 8000, 兵书: 30 }, icon: '田' },
  { id: 'recruit', name: '募兵', desc: '招募新兵与魂石', stats: ['武勇', '威仪'], base: { 将魂: 10, 魂石: 6 }, icon: '兵' },
  { id: 'patrol', name: '巡查', desc: '巡视领地，收缴塔币', stats: ['机变', '智谋'], base: { 塔币: 300, 铜钱: 6000 }, icon: '巡' },
  { id: 'treasure', name: '寻宝', desc: '探寻古迹与神器碎片', stats: ['天命', '机变'], base: { 招贤令: 1, 神器碎片: 2 }, icon: '宝' },
];
const EXP_EVENTS = [
  { title: '路遇商队', text: '途中遇上一支商队，换得不少铜钱。', extra: { 铜钱: 4000 } },
  { title: '发现余粮', text: '在废弃粮仓中找到一批兵书。', extra: { 兵书: 20 } },
  { title: '收编流民', text: '流民愿随军效力，带回些许将魂。', extra: { 将魂: 4 } },
  { title: '挖到古物', text: '掘出一件残缺古物，换得神器碎片。', extra: { 神器碎片: 1 } },
  { title: '风平浪静', text: '一路无事，队伍平安归来。', extra: {} },
];
function saveExpedition() { localStorage.setItem('sg_expedition', JSON.stringify(S.expedition)); }
function loadExpedition() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem('sg_expedition') || 'null'); } catch (e) { v = null; }
  const slots = (v && Array.isArray(v.slots) ? v.slots : []).slice(0, 3);
  while (slots.length < 3) slots.push(null);
  slots.forEach((sl, i) => {
    if (!sl || !EXPEDITIONS.some(m => m.id === sl.mission) || !Array.isArray(sl.team) || !sl.end) slots[i] = null;
  });
  S.expedition = { slots };
}
function expMissionById(id) { return EXPEDITIONS.find(m => m.id === id); }
function expBusyNames() {
  const names = [];
  (S.expedition.slots || []).forEach(sl => { if (sl) (sl.team || []).forEach(n => names.push(n)); });
  return names;
}
function expTeamBonus(team, mission) {
  let bonus = 0;
  (team || []).forEach(n => {
    const u = S.by[n];
    if (!u) return;
    const avg = mission.stats.reduce((a, k) => a + (u.stats[k] || 0), 0) / mission.stats.length;
    bonus += (avg / 100) * 0.10 + (affLevel(n) || 0) * 0.01;
  });
  return Math.min(0.6, bonus);
}
function expDurationMult(hours) { return hours >= 8 ? 5 : hours >= 4 ? 2.2 : 1; }
function expReward(mission, hours, team) {
  const mult = expDurationMult(hours) * (1 + expTeamBonus(team, mission));
  const out = {};
  for (const k in mission.base) out[k] = Math.max(1, Math.round(mission.base[k] * mult));
  return out;
}
function expRemain(slot) { return Math.max(0, (slot.end || 0) - Date.now()); }
function expRemainText(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function openExpeditionModal(missionId) {
  if (!(S.expedition.slots || []).includes(null)) { flash('三个派遣位均已占用'); return; }
  const mission = expMissionById(missionId);
  if (!mission) return;
  const busy = expBusyNames();
  const cands = S.units.filter(u => S.owned.includes(u.name) && !busy.includes(u.name));
  const score = u => mission.stats.reduce((a, k) => a + (u.stats[k] || 0), 0);
  const auto = cands.slice().sort((a, b) => score(b) - score(a)).slice(0, 3).map(u => u.name);
  S.expDraft = { mission: missionId, hours: 2, team: auto };
  renderExpeditionModal();
  $('#expeditionModal').hidden = false;
}
function renderExpeditionModal() {
  const dr = S.expDraft;
  if (!dr) return;
  const mission = expMissionById(dr.mission);
  if (!mission) return;
  $('#expTitle').textContent = `${mission.icon} ${mission.name}`;
  $('#expDesc').textContent = `${mission.desc} · 主属性：${mission.stats.join('、')}`;
  $('#expHours').innerHTML = [2, 4, 8].map(h =>
    `<button class="chip${dr.hours === h ? ' active' : ''}" data-exph="${h}">${h} 小时 ×${expDurationMult(h)}</button>`).join('');
  $('#expHours').querySelectorAll('[data-exph]').forEach(b => {
    b.onclick = () => { dr.hours = Number(b.dataset.exph); renderExpeditionModal(); };
  });
  const busy = expBusyNames();
  const cands = S.units.filter(u => S.owned.includes(u.name) && !busy.includes(u.name));
  const score = u => mission.stats.reduce((a, k) => a + (u.stats[k] || 0), 0);
  const top = cands.slice().sort((a, b) => score(b) - score(a)).slice(0, 16);
  dr.team.forEach(n => { const u = S.by[n]; if (u && !top.includes(u) && S.owned.includes(n)) top.push(u); });
  $('#expTeamList').innerHTML = top.map(u => {
    const on = dr.team.includes(u.name);
    return `<button class="exp-cand${on ? ' active' : ''}" data-expc="${esc(u.name)}">
      <span class="ph" style="background-image:url('${pthumb(u.name)}')"></span>
      <b>${esc(u.name)}</b><small>${esc(u.rarity || '')} · 好感 Lv${affLevel(u.name)}</small></button>`;
  }).join('');
  $('#expTeamList').querySelectorAll('[data-expc]').forEach(b => {
    b.onclick = () => {
      const n = b.dataset.expc;
      if (dr.team.includes(n)) dr.team = dr.team.filter(x => x !== n);
      else if (dr.team.length >= 3) { flash('最多派遣 3 名武将'); return; }
      else dr.team.push(n);
      renderExpeditionModal();
    };
  });
  const bonus = expTeamBonus(dr.team, mission);
  const preview = expReward(mission, dr.hours, dr.team);
  $('#expTeamHint').innerHTML = `已选 ${dr.team.length}/3 · 加成 <b>+${(bonus * 100).toFixed(1)}%</b><br>
    预计收益：${esc(fmtRewards(preview))}`;
  const b = $('#expDispatch');
  b.disabled = dr.team.length < 1;
  b.textContent = `派遣 ${dr.hours} 小时`;
}
function dispatchExpedition() {
  const dr = S.expDraft;
  if (!dr) return;
  const mission = expMissionById(dr.mission);
  const slots = S.expedition.slots;
  const idx = slots.indexOf(null);
  if (!mission || idx < 0 || !dr.team.length) return;
  const hours = dr.hours;
  const reward = expReward(mission, hours, dr.team);
  let event = null;
  if (Math.random() < 0.35) {
    event = EXP_EVENTS[Math.floor(Math.random() * EXP_EVENTS.length)];
    for (const k in (event.extra || {})) reward[k] = (reward[k] || 0) + event.extra[k];
  }
  const now = Date.now();
  slots[idx] = {
    mission: mission.id, hours, team: dr.team.slice(0, 3),
    start: now, end: now + hours * 3600 * 1000,
    reward, bonusPct: Math.round(expTeamBonus(dr.team, mission) * 1000) / 10,
    event: event ? { title: event.title, text: event.text } : null,
  };
  S.achieve.stats.expeditions = (S.achieve.stats.expeditions || 0) + 1;
  saveAchieve();
  bumpSeasonWeekly('expeditions', 1);
  saveExpedition();
  S.expDraft = null;
  $('#expeditionModal').hidden = true;
  renderExpedition();
  flash(`已派遣：${mission.name} · ${hours} 小时`);
}
function claimExpedition(i) {
  const slot = S.expedition.slots[i];
  if (!slot || expRemain(slot) > 0) return;
  addReward(slot.reward);
  addAffinityMany(slot.team || [], 2);
  const ev = slot.event ? ` · ${slot.event.title}：${slot.event.text}` : '';
  S.expedition.slots[i] = null;
  saveExpedition(); renderExpedition();
  flash(`派遣完成：${fmtRewards(slot.reward)}${ev}`);
}
function recallExpedition(i) {
  const slot = S.expedition.slots[i];
  if (!slot) return;
  if (!confirm('召回队伍将放弃本次奖励，确定？')) return;
  S.expedition.slots[i] = null;
  saveExpedition(); renderExpedition();
  flash('已召回队伍');
}
function renderExpedition() {
  const mbox = $('#expeditionMissions'), sbox = $('#expeditionSlots'), info = $('#expeditionInfo');
  if (!mbox || !sbox) return;
  if (info) info.innerHTML = `派遣武将执行内政，离线也会计时。主属性越高、好感越高，收益越好；归来时有概率触发随机事件。`;
  mbox.innerHTML = EXPEDITIONS.map(m => `<button class="exp-mission" data-expm="${m.id}">
      <span class="em-ico">${m.icon}</span>
      <b>${m.name}</b><span>${m.desc}</span>
      <em>主属性 ${m.stats.join(' / ')} · 基础 ${esc(fmtRewards(m.base))}</em>
    </button>`).join('');
  mbox.querySelectorAll('[data-expm]').forEach(b => { b.onclick = () => openExpeditionModal(b.dataset.expm); });
  sbox.innerHTML = (S.expedition.slots || [null, null, null]).map((slot, i) => {
    if (!slot) {
      return `<div class="exp-slot empty"><div class="es-head"><b>派遣位 ${i + 1}</b><span>空闲</span></div>
        <div class="es-empty">从上方选择一项内政开始派遣</div></div>`;
    }
    const m = expMissionById(slot.mission) || EXPEDITIONS[0];
    const remain = expRemain(slot);
    const ready = remain <= 0;
    const team = (slot.team || []).map(n => `<span class="exp-av" style="background-image:url('${pthumb(n)}')" title="${esc(n)}"></span>`).join('');
    return `<div class="exp-slot${ready ? ' ready' : ''}">
      <div class="es-head"><b>${m.icon} ${m.name}</b><span>${slot.hours} 小时 · 加成 +${slot.bonusPct || 0}%</span></div>
      <div class="es-team">${team}</div>
      ${ready
        ? `<div class="es-reward">${esc(fmtRewards(slot.reward))}${slot.event ? `<small>${esc(slot.event.title)}：${esc(slot.event.text)}</small>` : ''}</div>
           <button class="mini start" data-expclaim="${i}">领取</button>`
        : `<div class="es-count" data-exp-count="${i}">${expRemainText(remain)}</div>
           <button class="mini ghost" data-exprecall="${i}">召回</button>`}
    </div>`;
  }).join('');
  sbox.querySelectorAll('[data-expclaim]').forEach(b => { b.onclick = () => claimExpedition(Number(b.dataset.expclaim)); });
  sbox.querySelectorAll('[data-exprecall]').forEach(b => { b.onclick = () => recallExpedition(Number(b.dataset.exprecall)); });
}
function tickExpedition() {
  if (S.screen !== 'expedition') return;
  let needRender = false;
  (S.expedition.slots || []).forEach((slot, i) => {
    if (!slot) return;
    const el = document.querySelector(`[data-exp-count="${i}"]`);
    const remain = expRemain(slot);
    if (!el) { if (remain <= 0) needRender = true; return; }
    if (remain <= 0) needRender = true;
    else el.textContent = expRemainText(remain);
  });
  if (needRender) renderExpedition();
}

/* ---------------- 无尽生存 ---------------- */
const SURVIVAL_UPGRADES = [
  { id: 'atk', name: '锋锐', desc: '全体攻击 +10%', stat: 'atk', value: 0.10 },
  { id: 'dr', name: '铁壁', desc: '全体减伤 +8%', stat: 'dr', value: 0.08 },
  { id: 'hp', name: '增援', desc: '全体兵力 +15%', stat: 'hp', value: 0.15 },
  { id: 'crit', name: '杀意', desc: '全体暴击 +8%', stat: 'crit', value: 0.08 },
  { id: 'speed', name: '疾行', desc: '全体速度 +8%', stat: 'speed', value: 0.08 },
  { id: 'heal', name: '回春', desc: '全体治疗 +15%', stat: 'heal', value: 0.15 },
  { id: 'lifesteal', name: '饮血', desc: '全体吸血 +8%', stat: 'lifesteal', value: 0.08 },
  { id: 'strategy_dmg', name: '奇谋', desc: '全体策略伤害 +10%', stat: 'strategy_dmg', value: 0.10 },
  { id: 'effect_hit', name: '洞察', desc: '全体效果命中 +8%', stat: 'effect_hit', value: 0.08 },
  { id: 'pen', name: '破甲', desc: '全体穿透 +8%', stat: 'pen', value: 0.08 },
  { id: 'dodge', name: '灵动', desc: '全体闪避 +6%', stat: 'dodge', value: 0.06 },
  { id: 'shield', name: '壁垒', desc: '开场全体护盾 12%', effect: 'shield' },
  { id: 'rage', name: '战意', desc: '每回合开始全体回怒 15', effect: 'rage' },
  { id: 'survive', name: '不屈', desc: '首次致死以 20% 兵力存活', effect: 'survive' },
  { id: 'revive', name: '续命', desc: '友军阵亡时以 25% 兵力复活一次', effect: 'revive' },
  { id: 'chase', name: '追击', desc: '普攻后 30% 概率追加一次攻击', effect: 'chase' },
  { id: 'counter', name: '反击', desc: '受击反击伤害逐步提高', effect: 'counter' },
  { id: 'cc_once', name: '免控', desc: '每名武将首次受控免疫', effect: 'cc_once' },
  { id: 'first_untarget', name: '先手', desc: '第一回合不可被选中', effect: 'first_untarget' },
  { id: 'regen', name: '生生不息', desc: '全体每回合恢复 4% 兵力', effect: 'regen' },
  { id: 'kill_action', name: '乘胜', desc: '击杀后立即额外行动一次', effect: 'kill_action' },
  { id: 'dr5', name: '坚壁', desc: '前 5 回合全体减伤 10%', effect: 'dr5' },
  { id: 'round_buff', name: '随机应变', desc: '每回合随机获得攻击/命中增益', effect: 'round_buff' },
  { id: 'low_hp', name: '背水', desc: '兵力低于 50% 时攻击 +20%', effect: 'low_hp' },
];
const SURVIVAL_MILESTONES = [
  { wave: 5, reward: { 铜钱: 20000, 兵书: 100 } },
  { wave: 10, reward: { 招贤令: 3, 塔币: 800 } },
  { wave: 20, reward: { 招贤令: 5, 金符: 3 } },
  { wave: 30, reward: { 招贤令: 8, 神兵: 3 } },
  { wave: 50, reward: { 招贤令: 12, 神兵: 6, 金符: 6 } },
  { wave: 100, reward: { 招贤令: 20, 神兵: 12, 金符: 12 } },
];
function loadSurvival() {
  try { S.survival = Object.assign({ active: false, wave: 1, seed: 0, upgrades: [], pending: [], best: 0, milestones: [] }, JSON.parse(localStorage.getItem('sg_survival') || '{}')); }
  catch (e) { S.survival = { active: false, wave: 1, seed: 0, upgrades: [], pending: [], best: 0, milestones: [] }; }
  ['upgrades', 'pending', 'milestones'].forEach(k => { if (!Array.isArray(S.survival[k])) S.survival[k] = []; });
  if (!S.survival.seed) S.survival.seed = Math.floor(Math.random() * 1e9);
}
function saveSurvival() { localStorage.setItem('sg_survival', JSON.stringify(S.survival)); }
function survivalRand(seed) {
  let t = (seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function survivalWaveData(wave) {
  const seed = (S.survival.seed || 1) * 97 + wave * 7919;
  const pool = S.units.filter(u => !u.name.includes('·'));
  const picked = [];
  const count = Math.min(5, 3 + Math.floor((wave - 1) / 4));
  let guard = 0;
  while (picked.length < count && guard < 500) {
    const u = pool[Math.floor(survivalRand(seed + guard * 37) * pool.length)] || pool[0];
    if (u && !picked.includes(u.name)) picked.push(u.name);
    guard += 1;
  }
  if (wave % 5 === 0 && picked.length) {
    const bosses = ['吕布', '关羽', '曹操', '司马懿', '周瑜', '孙策', '诸葛亮', '张飞', '赵云', '孟获'];
    picked[0] = bosses[(Math.floor(wave / 5) - 1) % bosses.length];
  }
  const config = {
    level: Math.min(100, 30 + wave * 4),
    bt: Math.min(5, Math.floor(wave / 8)),
    aw: Math.min(6, Math.floor(wave / 10)),
    equip: wave >= 15 ? 1 : 0,
  };
  const reward = { 铜钱: 3000 + 600 * wave, 将魂: 2 + 2 * wave, 兵书: 4 + 2 * wave };
  if (wave % 5 === 0) reward['招贤令'] = 1;
  if (wave % 10 === 0) reward['金符'] = 1;
  return { wave, enemies: picked, config, reward, boss: wave % 5 === 0 };
}
function survivalRollChoices() {
  const ownedSpecial = new Set((S.survival.upgrades || []).filter(u => u.effect).map(u => u.effect));
  const pool = SURVIVAL_UPGRADES.filter(u => !u.effect || !ownedSpecial.has(u.effect));
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard < 200) {
    const u = pool[Math.floor(Math.random() * pool.length)];
    if (u && !out.some(x => x.id === u.id)) out.push(u);
    guard += 1;
  }
  return out;
}
function startSurvivalRun() {
  S.survival = {
    active: true, wave: 1, seed: Math.floor(Math.random() * 1e9),
    upgrades: [], pending: [],
    best: S.survival.best || 0, milestones: S.survival.milestones || [],
  };
  saveSurvival();
  startSurvivalWave();
}
function abandonSurvival() {
  if (!S.survival.active) return;
  if (!confirm('放弃本轮无尽生存？已获得的波次里程碑与历史最高会保留。')) return;
  S.survival.active = false;
  S.survival.pending = [];
  S.survival.upgrades = [];
  saveSurvival();
  renderSurvival();
  flash('已放弃本轮无尽生存');
}
function startSurvivalWave() {
  if (!S.survival.active) { startSurvivalRun(); return; }
  if ((S.survival.pending || []).length) { flash('请先选择本波强化'); return; }
  const wave = S.survival.wave;
  const data = survivalWaveData(wave);
  S.mode = 'survival'; S.survivalData = data;
  S.levelData = null; S.levelId = null;
  S.towerData = null; S.dungeonData = null; S.ancientData = null; S.secretData = null; S.trialData = null;
  S.ancientRun = null; S.ancientPhase = 1;
  S.b = data.enemies.slice();
  saveFormation();
  showScreen('formation');
  flash(`无尽生存 · 第 ${wave} 波`);
}
function chooseSurvivalUpgrade(id) {
  const up = (S.survival.pending || []).find(u => u.id === id);
  if (!up) return;
  S.survival.upgrades = S.survival.upgrades || [];
  S.survival.upgrades.push(up);
  S.survival.pending = [];
  S.survival.wave += 1;
  saveSurvival();
  renderSurvival();
  flash(`获得强化：${up.name}`);
}
function claimSurvivalMilestone(wave) {
  const m = SURVIVAL_MILESTONES.find(x => x.wave === wave);
  if (!m || S.survival.milestones.includes(wave)) return;
  if ((S.survival.best || 0) < wave) { flash('尚未到达该波次'); return; }
  addReward(m.reward);
  S.survival.milestones.push(wave);
  saveSurvival(); renderSurvival();
  flash(`无尽里程碑：第 ${wave} 波 · ${fmtRewards(m.reward)}`);
}
function renderSurvival() {
  const info = $('#survivalInfo'), choices = $('#survivalChoices'), ups = $('#survivalUpgrades'), ms = $('#survivalMilestones'), btn = $('#survivalStart');
  if (!info || !btn) return;
  const s = S.survival;
  const best = s.best || 0;
  info.innerHTML = `<b>无尽生存</b> · 历史最高 <b>${best}</b> 波<br>
    <span class="sn-note">每波敌军增强；胜利后三选一强化，失败即结束。每波消耗 10 体力。</span>
    ${s.active ? `<br>当前第 <b>${s.wave}</b> 波 · 已获得 ${s.upgrades.length} 项强化` : ''}`;
  if (ups) {
    ups.innerHTML = s.active && s.upgrades.length
      ? `<div class="surv-chips">${s.upgrades.map(u => `<span class="surv-chip" title="${esc(u.desc)}">${esc(u.name)}</span>`).join('')}</div>`
      : '';
  }
  if (choices) {
    choices.innerHTML = s.active && (s.pending || []).length
      ? `<div class="season-sub">选择一项强化</div><div class="surv-choices">${s.pending.map(u =>
          `<button class="surv-choice" data-survup="${esc(u.id)}"><b>${esc(u.name)}</b><span>${esc(u.desc)}</span></button>`).join('')}</div>`
      : '';
    choices.querySelectorAll('[data-survup]').forEach(b => { b.onclick = () => chooseSurvivalUpgrade(b.dataset.survup); });
  }
  if (ms) {
    ms.innerHTML = `<div class="season-sub">波次里程碑</div><div class="surv-ms">${SURVIVAL_MILESTONES.map(m => {
      const claimed = s.milestones.includes(m.wave);
      const reached = best >= m.wave;
      return `<div class="surv-ms-item${claimed ? ' done' : ''}">
        <b>第 ${m.wave} 波</b><span>${esc(fmtRewards(m.reward))}</span>
        <button class="mini${claimed ? ' ghost' : ''}" data-survms="${m.wave}" ${reached && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : reached ? '领取' : '未到达'}</button></div>`;
    }).join('')}</div>`;
    ms.querySelectorAll('[data-survms]').forEach(b => { b.onclick = () => claimSurvivalMilestone(Number(b.dataset.survms)); });
  }
  const ab = $('#survivalAbandon');
  if (ab) { ab.hidden = !s.active; ab.onclick = abandonSurvival; }
  if (s.active && (s.pending || []).length) {
    btn.disabled = true; btn.textContent = '先选择强化';
  } else if (s.active) {
    btn.disabled = false;
    btn.textContent = `编队并开始第 ${s.wave} 波`;
    btn.onclick = startSurvivalWave;
  } else {
    btn.disabled = false;
    btn.textContent = '开始无尽生存';
    btn.onclick = startSurvivalRun;
  }
}

function loadWorldBossState() {
  try { S.worldBoss = Object.assign({ date: '', best: 0, bestPct: 0, claimed: [] }, JSON.parse(localStorage.getItem('sg_worldboss') || '{}')); }
  catch (e) { S.worldBoss = { date: '', best: 0, bestPct: 0, claimed: [] }; }
  S.worldBoss.claimed = Array.isArray(S.worldBoss.claimed) ? S.worldBoss.claimed : [];
  syncWorldBoss();
}
function saveWorldBossState() { localStorage.setItem('sg_worldboss', JSON.stringify(S.worldBoss)); }
function syncWorldBoss() {
  const d = S.worldBossData;
  if (!d) return;
  if (S.worldBoss.date !== d.date) {
    S.worldBoss = { date: d.date, best: 0, bestPct: 0, claimed: [] };
    saveWorldBossState();
  }
}
function battleDamage(data) {
  let dmg = 0;
  Object.values(S.battleDetail || {}).forEach(x => {
    if (x && x.side === 0) dmg += Number(x.outTotal) || 0;
  });
  if (!dmg) {
    (data && data.events || []).forEach(e => {
      if (e.src_side === 0 && ['damage', 'true_damage', 'chain_damage', 'dot_damage'].includes(e.kind)) {
        dmg += Number(e.dmg) || 0;
      }
    });
  }
  return Math.round(dmg);
}
function claimWorldBossTier(idx) {
  syncWorldBoss();
  const d = S.worldBossData;
  const t = d && d.tiers && d.tiers[idx];
  if (!t || S.worldBoss.claimed.includes(idx)) return;
  if ((S.worldBoss.bestPct || 0) < t.pct) { flash('伤害未达到该档位'); return; }
  addReward(t.reward);
  S.worldBoss.claimed.push(idx);
  saveWorldBossState(); renderWorldBoss(); renderWallet();
  flash(`世界首领奖励领取：${fmtRewards(t.reward)}`);
}
function claimAllWorldBossTiers() {
  syncWorldBoss();
  const d = S.worldBossData;
  if (!d) return;
  let n = 0;
  (d.tiers || []).forEach((t, i) => {
    if (S.worldBoss.claimed.includes(i)) return;
    if ((S.worldBoss.bestPct || 0) < t.pct) return;
    addReward(t.reward);
    S.worldBoss.claimed.push(i);
    n += 1;
  });
  saveWorldBossState(); renderWorldBoss(); renderWallet();
  flash(n ? `一键领取完成：${n} 档世界首领奖励` : '暂无可领取档位');
}

function challengeWorldBoss() {
  const d = S.worldBossData;
  if (!d) { flash('世界首领数据载入中'); return; }
  if (teamCount() < 5) { flash('世界首领需要 5 人编队'); return; }
  S.mode = 'worldboss';
  S.levelData = null; S.levelId = null;
  S.towerData = null; S.dungeonData = null; S.ancientData = null; S.secretData = null; S.trialData = null;
  S.ancientRun = null; S.ancientPhase = 1;
  S.bLocked = true;
  S.b = d.enemies.slice();
  saveFormation();
  showScreen('formation');
  flash(`世界首领 · ${d.boss} · 记录最佳 ${S.worldBoss.best || 0}`);
}
async function refreshWorldBoss() {
  try {
    const r = await fetch('/api/worldboss', { cache: 'no-store' });
    S.worldBossData = await r.json();
    syncWorldBoss();
    renderWorldBoss();
  } catch (e) { /* ignore */ }
}
function renderWorldBoss() {
  syncWorldBoss();
  const d = S.worldBossData;
  if (d && typeof todayStr === 'function' && d.date !== todayStr()) { refreshWorldBoss(); return; }
  const info = $('#worldbossInfo'), tiers = $('#worldbossTiers'), btn = $('#worldbossChallenge');
  if (!info || !tiers || !btn) return;
  if (!d) { info.textContent = '世界首领数据载入中…'; tiers.innerHTML = ''; btn.disabled = true; return; }
  const best = S.worldBoss.best || 0;
  info.innerHTML = `<div class="wb-head">
      <div class="wb-face" style="background-image:url('${pthumb(d.boss)}')"></div>
      <div class="wb-meta"><b>${esc(d.name)}</b><span>今日 ${esc(d.date)} · 推荐战力 ${d.power}</span>
        <span>今日最佳伤害 <b>${best}</b>（${(S.worldBoss.bestPct || 0).toFixed(1)}% 首领兵力）· 每次挑战消耗 10 体力</span>
        <span class="sn-note">伤害档位每日可领取一次；即使战败，造成的伤害也会计入。</span></div>
    </div>`;
  tiers.innerHTML = `<div class="wb-tools"><button id="wbClaimAll" class="mini">一键领取可达档位</button></div>
    <div class="season-sub">伤害奖励</div><div class="wb-tiers">${(d.tiers || []).map((t, i) => {
    const claimed = S.worldBoss.claimed.includes(i);
    const reached = (S.worldBoss.bestPct || 0) >= t.pct;
    return `<div class="wb-tier${claimed ? ' done' : ''}">
      <div class="tier-need">首领兵力 ${t.pct}%</div>
      <div class="tier-rw">${esc(fmtRewards(t.reward))}</div>
      <button class="mini${claimed ? ' ghost' : ''}" data-wbtier="${i}" ${reached && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : reached ? '领取' : '未达到'}</button>
    </div>`;
  }).join('')}</div>`;
  tiers.querySelectorAll('[data-wbtier]').forEach(b => { b.onclick = () => claimWorldBossTier(Number(b.dataset.wbtier)); });
  const wbAll = $('#wbClaimAll'); if (wbAll) wbAll.onclick = claimAllWorldBossTiers;
  btn.disabled = teamCount() < 5;
  btn.textContent = teamCount() < 5 ? '需要 5 人编队' : `讨伐 ${d.boss}（体力 10）`;
  btn.onclick = challengeWorldBoss;
}

function syncTrialState() {
  const t = S.trials;
  if (!t) return;
  if (S.trialState.week !== t.week) {
    S.trialState = { date: t.date, week: t.week, done: {} };
    saveTrialState();
    return;
  }
  if (S.trialState.date !== t.date) {
    ['d1', 'd2', 'd3'].forEach(k => { delete S.trialState.done[k]; });
    S.trialState.date = t.date;
    saveTrialState();
  }
}
/* 体力恢复上限 = 200 + 主线首通数×1 + 将星塔每10层×2 + 无尽每5波×2 */
function staminaCap() {
  const cleared = typeof clearedLvCount === 'function' ? clearedLvCount() : Object.keys(S.progress.stars || {}).length;
  const tower = Math.max(0, (S.tower.floor || 1) - 1);
  const surv = Math.max(0, S.survival.best || 0);
  return STAMINA_BASE_CAP + cleared + 2 * Math.floor(tower / 10) + 2 * Math.floor(surv / 5);
}
function notifyStaminaGrowth(before) {
  const now = staminaCap();
  if (now > before) { flash(`体力上限 +${now - before}（当前 ${now}）`); renderStamina(); }
}
function loadStamina() {
  try { const v = JSON.parse(localStorage.getItem('sg_stamina') || 'null'); if (v) S.stamina = Object.assign(S.stamina, v); } catch (e) { /* ignore */ }
  // 旧测试版万体力：一次性归一到新经济（库存保留不超过开局 500）
  if (localStorage.getItem('sg_stamina_grant_10000')) {
    if (!localStorage.getItem('sg_stamina_econ2')) {
      S.stamina.value = Math.min(STAMINA_START, Number(S.stamina.value) || 0);
      localStorage.setItem('sg_stamina_econ2', '1');
      saveStamina();
    }
    localStorage.removeItem('sg_stamina_grant_10000');
  }
  localStorage.removeItem('sg_testgrant_20261120');
  S.stamina.value = Math.max(0, Number(S.stamina.value) || 0);
  if (!Array.isArray(S.stamina.claims)) S.stamina.claims = [false, false];
}
function saveStamina() { localStorage.setItem('sg_stamina', JSON.stringify(S.stamina)); }
/* 兑换码：666 可无限兑换，每次 +666 体力 */
function redeemCode() {
  const el = $('#redeemCode');
  const code = ((el && el.value) || '').trim();
  if (!code) { flash('请输入兑换码'); return; }
  if (code === '666') {
    S.stamina.value = (S.stamina.value || 0) + 666;
    saveStamina(); renderStamina();
    if (el) el.value = '';
    flash('兑换成功：体力 +666');
  } else {
    flash('兑换码无效');
  }
}
/* 七日新兵补给 */
function loadNewbie(fresh) {
  let v = null;
  try { v = JSON.parse(localStorage.getItem('sg_newbie') || 'null'); } catch (e) { v = null; }
  if (v && Array.isArray(v.claimed)) { S.newbie = Object.assign({ start: '', claimed: [], last: '' }, v); return; }
  if (!fresh) { S.newbie = null; return; }
  startNewbie();
}
function startNewbie() {
  S.newbie = { start: new Date().toISOString().slice(0, 10), claimed: [], last: '' };
  saveNewbie();
}
function saveNewbie() { if (S.newbie) localStorage.setItem('sg_newbie', JSON.stringify(S.newbie)); }
function newbieActive() { return !!(S.newbie && Array.isArray(S.newbie.claimed) && S.newbie.claimed.length < NEWBIE_REWARDS.length); }
function newbieDay() { return newbieActive() ? S.newbie.claimed.length + 1 : 0; }
function newbieCanClaim() { return newbieActive() && S.newbie.last !== new Date().toISOString().slice(0, 10); }
function claimNewbieGift() {
  if (!newbieActive()) { flash('七日补给已全部领取'); return; }
  if (!newbieCanClaim()) { flash('今日已领取，明日再来'); return; }
  const day = newbieDay();
  const rw = NEWBIE_REWARDS[day - 1];
  addReward(rw);
  S.newbie.claimed.push(day);
  S.newbie.last = new Date().toISOString().slice(0, 10);
  saveNewbie();
  renderHome();
  renderNewbieModal();
  flash(`第 ${day} 天补给：${fmtRewards(rw)}`);
}
function renderNewbieModal() {
  const box = $('#newbieList');
  if (!box) return;
  const claimed = new Set((S.newbie && S.newbie.claimed) || []);
  const day = newbieDay();
  box.innerHTML = NEWBIE_REWARDS.map((r, i) => {
    const d = i + 1, done = claimed.has(d), today = newbieActive() && d === day;
    return `<div class="newbie-day${done ? ' done' : ''}${today ? ' today' : ''}">
      <b>第 ${d} 天${done ? ' · 已领' : today ? ' · 今日' : ''}</b><span>${fmtRewards(r)}</span></div>`;
  }).join('');
  const btn = $('#newbieClaim');
  if (btn) {
    btn.textContent = !newbieActive() ? '已全部领取' : newbieCanClaim() ? `领取第 ${day} 天` : '今日已领';
    btn.disabled = !newbieCanClaim();
  }
}
function openNewbieGift() { renderNewbieModal(); $('#newbieModal').hidden = false; }
function loadSecret() {
  try { const v = JSON.parse(localStorage.getItem('sg_secret') || 'null'); if (v) S.secret = Object.assign(S.secret, v); } catch (e) { /* ignore */ }
  if (!S.secret.node) S.secret.node = null;
  S.secret.shopBought = !!S.secret.shopBought;
}
function saveSecret() { localStorage.setItem('sg_secret', JSON.stringify(S.secret)); }
function defaultSeason() {
  return { claimed: [], points: 0, tierClaimed: [],
    weekly: { week: '', counters: {}, claimed: [] },
    titles: [], frame: false, no: 0, ancientCleared: false };
}
function loadSeason() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem('sg_season') || 'null'); } catch (e) { v = null; }
  S.season = Object.assign(defaultSeason(), v || {});
  S.season.weekly = Object.assign({ week: '', counters: {}, claimed: [] }, (v && v.weekly) || {});
  ['claimed', 'tierClaimed', 'titles'].forEach(k => { if (!Array.isArray(S.season[k])) S.season[k] = []; });
  if (!Array.isArray(S.season.weekly.claimed)) S.season.weekly.claimed = [];
  S.season.weekly.counters = S.season.weekly.counters || {};
  syncSeason();
}
function saveSeason() { localStorage.setItem('sg_season', JSON.stringify(S.season)); }
function staminaNow() {
  const st = S.stamina;
  const now = Date.now();
  if (!st.last) st.last = now;
  const gain = Math.floor((now - st.last) / 360000);
  if (gain > 0) {
    const cap = staminaCap();
    if ((st.value || 0) < cap) st.value = Math.min(cap, (st.value || 0) + gain);
    st.last += gain * 360000;
    saveStamina();
  }
  return st.value || 0;
}
function spendStamina(n) {
  staminaNow();
  if ((S.stamina.value || 0) < n) { flash('体力不足，等待恢复或去商城购买'); return false; }
  S.stamina.value -= n; saveStamina(); renderStamina(); renderWallet(); return true;
}
function renderStamina() {
  const v = staminaNow();
  const cap = staminaCap();
  const el = $('#staminaLine');
  if (el) el.innerHTML = `<i class="seal" data-ch="力"></i><span class="st-label">体力</span>
    <div class="st-bar"><i style="width:${Math.min(100, v / cap * 100).toFixed(1)}%"></i></div>
    <b>${v}/${cap}</b><small>每 6 分钟 +1 · 上限随通关提升</small>`;
}
function loadShopStock() {
  try { S.shopStock = JSON.parse(localStorage.getItem('sg_shop') || '{}'); }
  catch (e) { S.shopStock = {}; }
}
function saveShopStock() { localStorage.setItem('sg_shop', JSON.stringify(S.shopStock)); }
function teamActive() { return (S.a || []).filter(Boolean); }
function teamCount() { return teamActive().length; }
function ensureTeamSlots() {
  const cap = modeTeamCap();
  if (!Array.isArray(S.a)) S.a = [];
  while (S.a.length < cap) S.a.push(null);
  if (S.a.length > cap) S.a = S.a.slice(0, cap);
}
function teamAdd(name) {
  ensureTeamSlots();
  for (let i = 0; i < S.a.length; i++) {
    if (!S.a[i]) { S.a[i] = name; return true; }
  }
  return false;
}
/* 星力：队伍总星力上限随将星塔层数提升（初始10，每10层+1，上限39） */
const STAR_BASE = 10, STAR_MAX = 39, STAR_PER_FLOOR = 10;
function starOf(name) { return Math.max(1, Math.min(8, Number((S.by[name] || {}).star) || 1)); }
function teamStar() { return teamActive().reduce((sum, n) => sum + starOf(n), 0); }
function starCap() { return Math.min(STAR_MAX, STAR_BASE + Math.floor((S.tower.best || 1) / STAR_PER_FLOOR)); }
function starRemain() { return starCap() - teamStar(); }
function saveFormation() {
  localStorage.setItem('sg_formation', JSON.stringify({
    a: S.a, b: S.b, support: S.support || [], levelId: S.levelId, mode: S.mode, config: S.config
  }));
}
/* ---------------- 羁绊 2.0：上阵 + 助阵共同判定 ---------------- */
function bondHave(def) {
  const have = new Set([...teamActive(), ...(S.support || [])]);
  return (def.members || []).filter(m => have.has(m)).length;
}
function bondIsActive(def) { return bondHave(def) >= def.need; }
function activeBondsList() { return (S.bondDefs || []).filter(bondIsActive); }
function bondsForNames(names) {
  return (S.bondDefs || []).filter(b => b.members.filter(m => names.includes(m)).length >= b.need);
}
function bondsForUnit(name) { return (S.bondDefs || []).filter(b => (b.members || []).includes(name)); }
function bondTypeLabel(t) {
  return ({ faction: '阵营', troop: '兵种', role: '定位', history: '历史' })[t] || '羁绊';
}
function bondChipHtml(b, n) {
  if (n === undefined) n = bondHave(b);
  const act = n >= b.need;
  return `<span class="bond-chip${act ? ' on' : ''}" data-bond="${esc(b.id)}">${act ? '◆' : '◇'} ${esc(b.name)}<em>${Math.min(n, b.need)}/${b.need}</em></span>`;
}
function showBondTip(el) {
  const tip = $('#bondTip');
  const b = (S.bondDefs || []).find(x => x.id === el.dataset.bond);
  if (!tip || !b) return;
  const n = bondHave(b), act = n >= b.need;
  const own = b.members.filter(m => (S.owned || []).includes(m));
  const shown = own.length ? own : b.members.slice(0, 10);
  tip.innerHTML = `<div class="bt-head"><b>${esc(b.name)}</b><span>${bondTypeLabel(b.type)}${act ? ' · 已触发' : ''}</span></div>
    <div class="bt-row"><label>条件</label><p>${esc(b.cond)}<br><em class="bt-now">当前 ${Math.min(n, b.need)}/${b.need}${act ? ' · 已生效' : ''}</em></p></div>
    <div class="bt-row"><label>效果</label><p><b>${esc(b.effectName)}</b>：${esc(b.effectDesc)}</p></div>
    <div class="bt-members">相关武将：${shown.map(esc).join('、')}${b.members.length > shown.length ? ' 等' : ''}</div>`;
  tip.hidden = false;
  const w = Math.min(340, innerWidth - 20);
  tip.style.width = w + 'px';
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + 200 > innerHeight) top = Math.max(8, r.top - 206);
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.dataset.for = b.id;
  tip.dataset.pinned = '0';
}
function hideBondTip(force) {
  const tip = $('#bondTip');
  if (!tip || tip.hidden) return;
  if (!force && tip.dataset.pinned === '1') return;
  tip.hidden = true;
}
function renderBondPanel() {
  const box = $('#bondPanel');
  if (!box) return;
  const list = (S.bondDefs || []).map(b => ({ b, n: bondHave(b) }))
    .filter(x => x.n > 0)
    .sort((x, y) => ((y.n >= y.b.need) - (x.n >= x.b.need)) ||
      (y.n / y.b.need - x.n / x.b.need));
  const act = list.filter(x => x.n >= x.b.need);
  box.innerHTML = `<div class="bond-head"><span>羁绊 <b>${act.length}</b> 条已触发 <em>（悬停或点击查看条件与效果）</em></span>
      <button id="supportAuto" class="mini ghost">一键助阵</button></div>
    <div class="bond-list">${list.length ? list.slice(0, 18).map(x => bondChipHtml(x.b, x.n)).join('') : '<span class="bond-empty">上阵或助阵武将会激活羁绊</span>'}</div>`;
  const btn = $('#supportAuto');
  if (btn) btn.onclick = autoSupport;
}
function autoSupport() {
  const cap = 3;
  const pool = S.units.filter(u => S.owned.includes(u.name) && !S.a.includes(u.name));
  const chosen = [];
  while (chosen.length < cap && pool.length) {
    let best = null, bestAct = -1, bestProg = -1;
    for (const u of pool) {
      const names = [...S.a, ...chosen, u.name];
      const act = (S.bondDefs || []).filter(b => b.members.filter(m => names.includes(m)).length >= b.need).length;
      const prog = (S.bondDefs || []).reduce((s, b) => {
        const have = b.members.filter(m => names.includes(m)).length;
        return s + (b.members.some(m => names.includes(m)) ? Math.min(1, have / b.need) : 0);
      }, 0);
      if (act > bestAct || (act === bestAct && prog > bestProg)) { best = u; bestAct = act; bestProg = prog; }
    }
    if (!best) break;
    chosen.push(best.name);
    pool.splice(pool.indexOf(best), 1);
  }
  S.support = chosen;
  saveFormation(); renderTeams(); renderPool();
  flash(chosen.length ? `助阵：${chosen.join('、')}` : '没有可助阵的武将');
}
function renderSupport() {
  const box = $('#teamSupport');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const n = S.support[i];
    const slot = document.createElement('div');
    slot.className = 'slot support-slot' + (n ? ' filled' : '');
    if (n) {
      const rar = (S.by[n] || {}).rarity || '';
      slot.innerHTML = `<div class="ph" style="background-image:url('${pthumb(n)}')"></div>
        <div class="cap">${esc(n)}</div><div class="rar-line ${rar}"></div>`;
      slot.title = '点击移出助阵';
      slot.onclick = () => { S.support.splice(i, 1); saveFormation(); renderTeams(); renderPool(); };
    } else {
      slot.innerHTML = '<span class="slot-hint">助阵</span>';
      slot.title = '主力满员后，点击左侧武将加入助阵';
    }
    box.appendChild(slot);
  }
  const sc = $('#scount');
  if (sc) sc.textContent = `${S.support.length}/3`;
}
/* ---------------- 每日 / 每周试炼 ---------------- */
function trialRuleError(team, t) {
  if (!t) return '试炼数据缺失';
  team = (team || []).filter(Boolean);
  if (team.length !== t.size) return `需要 ${t.size} 人上阵`;
  const req = t.req;
  if (req) {
    const key = req.type === 'faction' ? 'faction' : 'troop';
    const n = team.filter(x => (S.by[x] || {})[key] === req.value).length;
    if (n < req.min) return `不满足条件：${req.label}（当前 ${n}/${req.min}）`;
  }
  return '';
}
function modeTeamCap() {
  if (S.mode === 'ancient') return 8;
  if (S.mode === 'trial' && S.trialData) return S.trialData.size;
  if (S.mode === 'personal') return 3;
  return 5;
}
function modeNeedA() {
  if (S.mode === 'secret') return 3;
  if (S.mode === 'ancient') return 8;
  if (S.mode === 'trial' && S.trialData) return S.trialData.size;
  if (S.mode === 'personal') return 3;
  return 5;
}
async function refreshTrials() {
  try {
    const r = await fetch('/api/trials', { cache: 'no-store' });
    S.trials = await r.json();
    syncTrialState();
    renderTrials();
  } catch (e) { /* ignore */ }
}
function renderTrials() {
  const box = $('#trialList');
  if (!box) return;
  syncTrialState();
  const data = S.trials;
  const info = $('#trialInfo');
  if (data && typeof todayStr === 'function' && data.date !== todayStr()) {
    refreshTrials();
    return;
  }
  if (!data) {
    box.innerHTML = '';
    if (info) info.textContent = '试炼数据载入中…';
    return;
  }
  if (info) {
    info.innerHTML = `<b>今日 ${esc(data.date)}</b> · 日常每日 0 点刷新，周常每周一 0 点刷新<br>
      上阵人数与阵容条件必须满足；助阵位照常生效，奖励每天/每周只领一次。`;
  }
  const list = [...(data.trials || []), data.weekly].filter(Boolean);
  box.innerHTML = list.map(t => {
    const done = !!S.trialState.done[t.id];
    const weekly = t.id === 'weekly';
    const enemies = t.enemies.map(n => `<span class="trial-enemy">${esc(n)}</span>`).join('');
    return `<div class="trial-card${done ? ' done' : ''}${weekly ? ' weekly' : ''}">
      <div class="tc-head"><b>${esc(t.name)}</b><span class="tc-tag">${weekly ? '周常' : '日常'}</span></div>
      <div class="tc-rule">${esc(t.desc)}</div>
      <div class="tc-meta">敌人 Lv${t.level} · 推荐战力 ${t.power} · ${t.size} 人上阵</div>
      <div class="tc-reward">奖励：${esc(fmtRewards(t.reward))}</div>
      <div class="tc-enemies">${enemies}</div>
      <div class="tc-actions">
        <span class="tc-state">${done ? (weekly ? '本周已完成（可再战，无重复奖励）' : '今日已完成（可再战，无重复奖励）') : '奖励未领取'}</span>
        <button class="mini ${done ? 'ghost' : ''}" data-trial="${esc(t.id)}">${done ? '再战' : '挑战'}</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-trial]').forEach(b => {
    b.onclick = () => challengeTrial(list.find(x => x.id === b.dataset.trial));
  });
}
function challengeTrial(t) {
  if (!t) return;
  S.mode = 'trial'; S.trialData = t;
  S.levelData = null; S.levelId = null;
  S.towerData = null; S.dungeonData = null; S.ancientData = null; S.secretData = null;
  S.b = t.enemies.slice();
  S.a = S.a.slice(0, t.size);
  saveFormation();
  showScreen('formation');
  flash(`试炼：${t.name} · ${t.desc}`);
}
/* ---------------- 成就 / 图鉴收集 / 塔里程碑 / 称号 ---------------- */
const TOWER_MILESTONES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const TITLE_MS = { 100: '塔巅行者', 300: '破空者', 500: '千层之主' };

function clearedLvCount() { return Object.keys(S.progress.stars || {}).length; }
function fullStarCount() { return Object.values(S.progress.stars || {}).filter(v => v >= 3).length; }
function rarityOwned(r) { return S.owned.filter(n => (S.by[n] || {}).rarity === r).length; }
function achTarget(def) { return typeof def.target === 'function' ? def.target() : def.target; }
function achCur(def) { try { return Math.min(achTarget(def), def.cur()); } catch (e) { return 0; } }
function sigilTotal() { return typeof sigilCount === 'function' ? sigilCount() : 0; }
function relicTotal() { return Object.keys(S.relics || {}).length; }
function bondKindsTotal() { return (S.achieve.stats.bondKinds || []).length; }

const ACH_DEFS = [
  { id: 'lv10', cat: '关卡', name: '初露锋芒', desc: '通关 10 个主线关卡', target: 10,
    cur: clearedLvCount, reward: { 招贤令: 2, 铜钱: 8000 }, title: '初露锋芒' },
  { id: 'lv100', cat: '关卡', name: '百战之师', desc: '通关 100 个主线关卡', target: 100,
    cur: clearedLvCount, reward: { 招贤令: 5, 兵书: 100 } },
  { id: 'lv300', cat: '关卡', name: '席卷八方', desc: '通关 300 个主线关卡', target: 300,
    cur: clearedLvCount, reward: { 招贤令: 8, 金符: 3 }, title: '席卷八方' },
  { id: 'lv700', cat: '关卡', name: '天下归心', desc: '通关全部 700 关', target: 700,
    cur: clearedLvCount, reward: { 招贤令: 20, 金符: 10, 神兵: 10 }, title: '天下归心' },
  { id: 'star10', cat: '关卡', name: '三星初成', desc: '10 个关卡达成三星', target: 10,
    cur: fullStarCount, reward: { 塔币: 200 } },
  { id: 'star50', cat: '关卡', name: '百战百胜', desc: '50 个关卡达成三星', target: 50,
    cur: fullStarCount, reward: { 塔币: 800, 招贤令: 3 } },
  { id: 'tower10', cat: '将星塔', name: '登塔十层', desc: '将星塔到达第 10 层', target: 10,
    cur: () => S.tower.best || 1, reward: { 塔币: 100 } },
  { id: 'tower50', cat: '将星塔', name: '五十层试炼', desc: '将星塔到达第 50 层', target: 50,
    cur: () => S.tower.best || 1, reward: { 塔币: 500, 招贤令: 2 } },
  { id: 'tower100', cat: '将星塔', name: '百层行者', desc: '将星塔到达第 100 层', target: 100,
    cur: () => S.tower.best || 1, reward: { 招贤令: 5, 神兵: 3 }, title: '百层行者' },
  { id: 'tower300', cat: '将星塔', name: '三百层孤影', desc: '将星塔到达第 300 层', target: 300,
    cur: () => S.tower.best || 1, reward: { 招贤令: 10, 神兵: 8 }, title: '孤峰行者' },
  { id: 'trial1', cat: '试炼', name: '初试锋芒', desc: '通关 1 次试炼', target: 1,
    cur: () => S.achieve.stats.trials || 0, reward: { 铜钱: 5000 } },
  { id: 'trial10', cat: '试炼', name: '试炼常客', desc: '通关 10 次日常试炼', target: 10,
    cur: () => S.achieve.stats.trials || 0, reward: { 塔币: 300, 魂石: 5 } },
  { id: 'trial30', cat: '试炼', name: '试炼狂人', desc: '通关 30 次日常试炼', target: 30,
    cur: () => S.achieve.stats.trials || 0, reward: { 招贤令: 5, 金符: 2 } },
  { id: 'weekly1', cat: '试炼', name: '周常首胜', desc: '通关 1 次周常 BOSS', target: 1,
    cur: () => S.achieve.stats.weekly || 0, reward: { 招贤令: 2, 神兵: 2 } },
  { id: 'weekly4', cat: '试炼', name: '四周连捷', desc: '通关 4 次周常 BOSS', target: 4,
    cur: () => S.achieve.stats.weekly || 0, reward: { 招贤令: 6, 金符: 3 } },
  { id: 'own50', cat: '收集', name: '将星渐聚', desc: '拥有 50 名武将', target: 50,
    cur: () => S.owned.length, reward: { 招贤令: 2, 铜钱: 10000 } },
  { id: 'own100', cat: '收集', name: '百将之盟', desc: '拥有 100 名武将', target: 100,
    cur: () => S.owned.length, reward: { 招贤令: 5, 金符: 2 } },
  { id: 'own150', cat: '收集', name: '群英荟萃', desc: '拥有 150 名武将', target: 150,
    cur: () => S.owned.length, reward: { 招贤令: 8, 金符: 3 } },
  { id: 'own200', cat: '收集', name: '二百将星', desc: '集齐全部 200 名武将', target: 200,
    cur: () => S.owned.length, reward: { 招贤令: 15, 金符: 8, 神兵: 8 }, title: '万将之主' },
  { id: 'battle100', cat: '战斗', name: '百战', desc: '累计战斗 100 场', target: 100,
    cur: () => S.achieve.stats.battles || 0, reward: { 铜钱: 20000 } },
  { id: 'battle500', cat: '战斗', name: '身经百战', desc: '累计战斗 500 场', target: 500,
    cur: () => S.achieve.stats.battles || 0, reward: { 招贤令: 5, 兵书: 200 } },
  { id: 'win300', cat: '战斗', name: '常胜之师', desc: '累计胜利 300 场', target: 300,
    cur: () => S.achieve.stats.wins || 0, reward: { 塔币: 500, 招贤令: 3 } },
  { id: 'bond10', cat: '羁绊', name: '羁绊初识', desc: '在战斗中触发 10 种不同羁绊', target: 10,
    cur: bondKindsTotal, reward: { 铜钱: 8000 } },
  { id: 'bond25', cat: '羁绊', name: '万法相生', desc: '在战斗中触发 25 种不同羁绊', target: 25,
    cur: bondKindsTotal, reward: { 招贤令: 4, 魂石: 8 } },
  { id: 'relic5', cat: '秘宝', name: '秘宝收藏', desc: '获得 5 件章节秘宝', target: 5,
    cur: relicTotal, reward: { 招贤令: 2 } },
  { id: 'sigil10', cat: '秘宝', name: '印记共鸣', desc: '拥有 10 枚将星印记', target: 10,
    cur: sigilTotal, reward: { 招贤令: 3, 神兵: 2 } },
  { id: 'decompose10', cat: '养成', name: '断舍离', desc: '分解 10 名武将', target: 10,
    cur: () => S.achieve.stats.decomposes || 0, reward: { 塔币: 300 } },
  { id: 'decompose30', cat: '养成', name: '兵不厌诈', desc: '分解 30 名武将', target: 30,
    cur: () => S.achieve.stats.decomposes || 0, reward: { 招贤令: 3 } },
  { id: 'aff1', cat: '好感', name: '一知己', desc: '把 1 名武将好感培养至 100', target: 1,
    cur: affMaxCount, reward: { 招贤令: 3 } },
  { id: 'aff5', cat: '好感', name: '五湖知己', desc: '5 名武将好感达到 100', target: 5,
    cur: affMaxCount, reward: { 招贤令: 8, 神兵: 3 }, title: '四海知己' },
  { id: 'exp10', cat: '内政', name: '内政能臣', desc: '完成 10 次内政派遣', target: 10,
    cur: () => S.achieve.stats.expeditions || 0, reward: { 招贤令: 3, 铜钱: 20000 } },
  { id: 'branch10', cat: '养成', name: '百家争鸣', desc: '完成 10 名武将的觉醒转职', target: 10,
    cur: branchCount, reward: { 招贤令: 5, 神兵: 3 } },
  { id: 'surv10', cat: '无尽', name: '百战余生', desc: '无尽生存到达第 10 波', target: 10,
    cur: () => S.survival.best || 0, reward: { 招贤令: 3, 塔币: 500 } },
  { id: 'surv30', cat: '无尽', name: '无尽行者', desc: '无尽生存到达第 30 波', target: 30,
    cur: () => S.survival.best || 0, reward: { 招贤令: 8, 神兵: 3 }, title: '无尽行者' },
];

const COLLECT_DEFS = [
  { id: 'c_myth10', name: '绝世·十', desc: '收集 10 名绝世武将', target: 10, rarity: '绝世', reward: { 招贤令: 3 } },
  { id: 'c_myth20', name: '绝世·二十', desc: '收集 20 名绝世武将', target: 20, rarity: '绝世', reward: { 招贤令: 6, 神兵: 3 } },
  { id: 'c_myth_all', name: '绝世尽收', desc: '收集全部绝世武将', target: () => S.units.filter(u => u.rarity === '绝世').length,
    rarity: '绝世', reward: { 招贤令: 10, 神兵: 6 }, title: '绝世之主' },
  { id: 'c_legend40', name: '传奇·四十', desc: '收集 40 名传奇武将', target: 40, rarity: '传奇', reward: { 招贤令: 4, 兵书: 100 } },
  { id: 'c_legend80', name: '传奇·八十', desc: '收集 80 名传奇武将', target: 80, rarity: '传奇', reward: { 招贤令: 8, 金符: 3 } },
  { id: 'c_fine20', name: '精良·二十', desc: '收集 20 名精良武将', target: 20, rarity: '精良', reward: { 塔币: 300 } },
  { id: 'c_fine50', name: '精良·五十', desc: '收集 50 名精良武将', target: 50, rarity: '精良', reward: { 招贤令: 4 } },
  { id: 'c_common20', name: '普通·二十', desc: '收集 20 名普通武将', target: 20, rarity: '普通', reward: { 铜钱: 15000 } },
].map(d => ({ ...d, cur: () => rarityOwned(d.rarity) }));

function defaultAchieve() {
  return {
    claimed: [], milestones: [], collection: [], title: '',
    stats: { battles: 0, wins: 0, trials: 0, weekly: 0, decomposes: 0, bondKinds: [], expeditions: 0 },
    records: { maxDamage: 0, fastestTower: 0 }
  };
}
function loadAchieve() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_achieve') || 'null') || {};
    const d = defaultAchieve();
    S.achieve = { ...d, ...v, stats: { ...d.stats, ...(v.stats || {}) }, records: { ...d.records, ...(v.records || {}) } };
    ['claimed', 'milestones', 'collection'].forEach(k => { if (!Array.isArray(S.achieve[k])) S.achieve[k] = []; });
    if (!Array.isArray(S.achieve.stats.bondKinds)) S.achieve.stats.bondKinds = [];
  } catch (e) { S.achieve = defaultAchieve(); }
}
function saveAchieve() { localStorage.setItem('sg_achieve', JSON.stringify(S.achieve)); }

/* ---------------- 武将好感 / 个人传 ---------------- */
const AFF_THRESHOLDS = [10, 25, 45, 70, 100];
const AFF_LEVEL_NAME = ['未结', '初识', '相熟', '知己', '莫逆', '生死之交'];
const AFF_EGG_LINES = {
  曹操: '“宁我负人，毋人负我”——这话，主公听听就好。',
  刘备: '主公再点下去，备就要哭了。',
  关羽: '关某在此，主公不必多虑。',
  张飞: '再点！俺老张可要吼了！',
  吕布: '人中吕布，马中赤兔，主公点够了吗？',
  貂蝉: '别点了，再点……脸要红了。',
  诸葛亮: '主公，亮已算到你会点第七下。',
  司马懿: '忍一时，得天下；主公却忍不住。',
  华佗: '此症无药，唯有多陪将士。',
  大乔: '小乔说，主公最近很闲呢。',
};
const AFF_EGG_FALLBACK = ['第 7 下……主公的耐心不错。', '武将似乎有话想说，却又咽了回去。', '战鼓之外，也有闲话。'];
function loadAffinity() {
  try { S.affinity = JSON.parse(localStorage.getItem('sg_affinity') || '{}') || {}; }
  catch (e) { S.affinity = {}; }
}
function saveAffinity() { localStorage.setItem('sg_affinity', JSON.stringify(S.affinity || {})); }
function affOf(name) {
  if (!S.affinity[name]) S.affinity[name] = { exp: 0, giftDate: '', giftCount: 0, storyDone: false };
  const a = S.affinity[name];
  a.exp = Math.max(0, Math.min(100, Number(a.exp) || 0));
  a.giftCount = Number(a.giftCount) || 0;
  a.storyDone = !!a.storyDone;
  if (a.giftDate !== todayStr()) { a.giftDate = todayStr(); a.giftCount = 0; }
  return a;
}
function affLevel(name) {
  const a = affOf(name);
  let lv = 0;
  AFF_THRESHOLDS.forEach((t, i) => { if (a.exp >= t) lv = i + 1; });
  return lv;
}
function affLevelName(name) { return AFF_LEVEL_NAME[affLevel(name)]; }
function affNext(name) {
  const a = affOf(name);
  return AFF_THRESHOLDS.find(t => a.exp < t) || 100;
}
function addAffinity(name, n) {
  const a = affOf(name);
  const before = affLevel(name);
  a.exp = Math.min(100, a.exp + n);
  const after = affLevel(name);
  saveAffinity();
  if (after > before) {
    flash(`${name} 好感提升至 ${AFF_LEVEL_NAME[after]}${after === 5 ? ' · 解锁称号「' + name + '·生死之交」' : ''}`);
  }
}
function addAffinityMany(names, n) {
  const uniq = [...new Set((names || []).filter(Boolean))];
  const ups = [];
  uniq.forEach(name => {
    if (!S.owned.includes(name)) return;
    const a = affOf(name);
    const before = affLevel(name);
    a.exp = Math.min(100, a.exp + (n || 0));
    const after = affLevel(name);
    if (after > before) ups.push(`${name}→${AFF_LEVEL_NAME[after]}`);
  });
  if (uniq.length) saveAffinity();
  if (ups.length) flash(`好感提升：${ups.join('、')}`);
}
function giftGeneral(name) {
  const a = affOf(name);
  if (a.exp >= 100) { flash('好感已满，无需再赠礼'); return; }
  if (a.giftCount >= 5) { flash('今日赠礼次数已用完（5/5）'); return; }
  if ((S.inventory['铜钱'] || 0) < 3000) { flash('铜钱不足（赠礼需 3000）'); return; }
  S.inventory['铜钱'] -= 3000;
  a.giftCount += 1;
  addAffinity(name, 6);
  saveInventory(); saveAffinity(); renderWallet();
  renderDetailAffinity(name);
  flash(`${name} 收下了礼物（今日 ${a.giftCount}/5）`);
}
function affMaxCount() {
  return Object.keys(S.affinity || {}).filter(n => (S.affinity[n].exp || 0) >= 100).length;
}
function renderDetailAffinity(name) {
  const box = $('#detailAffinity');
  if (!box) return;
  const owned = S.owned.includes(name);
  const a = affOf(name);
  const lv = affLevel(name);
  const maxed = a.exp >= 100;
  const next = maxed ? 100 : affNext(name);
  const pct = maxed ? 100 : Math.min(100, (a.exp / next) * 100).toFixed(1);
  const egg = maxed ? (AFF_EGG_LINES[name] || '此人已与你生死相托。') : '';
  box.innerHTML = `<div class="dl">好感 <span class="aff-lv">Lv${lv} · ${AFF_LEVEL_NAME[lv]}</span></div>
    <div class="aff-bar"><i style="width:${pct}%"></i></div>
    <div class="aff-meta">${owned ? `好感 ${a.exp}/100 · ${maxed ? '已至生死之交' : '下一阶段 ' + next}` : '招募后可培养好感'}</div>
    ${egg ? `<div class="aff-egg">“${esc(egg)}”</div>` : ''}
    ${owned ? `<div class="aff-actions">
      <button class="mini" data-aff-gift="${esc(name)}" ${(a.giftCount >= 5 || maxed) ? 'disabled' : ''}>${maxed ? '好感已满' : `赠礼 3000 铜钱（${a.giftCount}/5）`}</button>
      <button class="mini ghost" data-aff-story="${esc(name)}" ${lv >= 2 ? '' : 'disabled'}>${a.storyDone ? '重看个人传' : '开启个人传'}</button>
    </div>` : ''}`;
  const g = box.querySelector('[data-aff-gift]');
  if (g) g.onclick = () => giftGeneral(name);
  const st = box.querySelector('[data-aff-story]');
  if (st) st.onclick = () => startPersonalStory(name);
}

function personalStage(name) {
  const u = S.by[name] || {};
  const lv = Math.max(1, affLevel(name));
  let seed = 0;
  for (const ch of String(name)) seed += ch.charCodeAt(0) * 37;
  const foes = S.units.filter(x => x.name !== name && x.faction !== u.faction);
  const picked = [];
  for (let i = 0; picked.length < 3 && i < 400; i++) {
    const cand = foes[(seed + i * 13) % Math.max(1, foes.length)];
    if (cand && !picked.includes(cand.name)) picked.push(cand.name);
  }
  while (picked.length < 3) picked.push(S.units[(seed + picked.length * 7) % S.units.length].name);
  const config = { level: Math.min(100, 35 + lv * 9), bt: Math.min(5, lv), aw: Math.min(6, lv), equip: lv >= 4 ? 1 : 0 };
  const reward = { 将魂: 8 + lv * 2, 铜钱: 4000 + lv * 1500 };
  if (lv >= 3) reward['招贤令'] = 1;
  if (lv >= 5) reward['神兵'] = 1;
  return { name, enemies: picked, config, reward, level: lv };
}
function openPersonalCinema(name, onDone) {
  const u = S.by[name] || {};
  const stage = personalStage(name);
  const rival = stage.enemies[0] || '敌军主将';
  const bio = (u.bio || '').split(/[。；]/)[0];
  const lines = [
    { who: '旁白', text: `${name}·个人传。${bio ? bio + '。' : ''}今日，旧事与新敌一同找上门来。`, narration: true },
    { who: name, text: AFF_EGG_LINES[name] || `${'主公'}，末将愿以此战，了却旧怨。` },
    { who: rival, text: `${name}，当年之仇，今日一并清算。` },
    { who: '主公', text: '此战，我与你同去。' },
    { who: '旁白', text: `【个人传 · ${name}】好感 Lv${stage.level} · 战斗即将开始。`, narration: true, final: true },
  ];
  S.cinema = { id: 'aff:' + name, title: `${name} · 个人传`, boss: rival, lines,
    index: 0, typing: false, timer: null, auto: false, autoTimer: null, first: false,
    onFinish: onDone };
  $('#cinemaTitle').textContent = S.cinema.title;
  $('#cinemaBg').style.backgroundImage = `url('${pthumb(rival)}')`;
  $('#cinemaAuto').classList.remove('active');
  $('#cinemaAuto').textContent = '自动';
  $('#storyCinema').hidden = false;
  cinemaShow(0);
}
function startPersonalStory(name) {
  if (!S.owned.includes(name)) { flash('尚未招募该武将'); return; }
  if (affLevel(name) < 2) { flash('好感达到相熟（25）后开启个人传'); return; }
  const stage = personalStage(name);
  openPersonalCinema(name, () => {
    $('#detail').hidden = true;
    S.mode = 'personal';
    S.personalName = name;
    S.personalData = stage;
    S.levelData = null; S.levelId = null;
    S.towerData = null; S.dungeonData = null; S.ancientData = null; S.secretData = null; S.trialData = null;
    S.ancientRun = null; S.ancientPhase = 1;
    S.bLocked = true;
    S.b = stage.enemies.slice();
    saveFormation();
    showScreen('formation');
    flash(`个人传 · ${name} · 需 ${name} 上阵（好感 Lv${stage.level}）`);
  });
}


function milestoneReward(floor) {
  const n = Math.floor(floor / 100);
  return { 塔币: 500 * n, 招贤令: n, 神兵: n, 神器碎片: n };
}
function ownedTitles() {
  const out = [];
  ACH_DEFS.forEach(a => { if (a.title && S.achieve.claimed.includes(a.id)) out.push({ id: 'ach:' + a.id, name: a.title }); });
  COLLECT_DEFS.forEach(c => { if (c.title && S.achieve.collection.includes(c.id)) out.push({ id: 'col:' + c.id, name: c.title }); });
  TOWER_MILESTONES.forEach(f => { if (TITLE_MS[f] && S.achieve.milestones.includes(f)) out.push({ id: 'ms:' + f, name: TITLE_MS[f] }); });
  Object.keys(S.affinity || {}).forEach(n => {
    if ((S.affinity[n].exp || 0) >= 100) out.push({ id: 'aff:' + n, name: `${n}·生死之交` });
  });
  (S.season.titles || []).forEach(name => out.push({ id: 'season:' + name, name }));
  return out;
}
function titleName(id) { const t = ownedTitles().find(x => x.id === id); return t ? t.name : ''; }

function claimAchievement(id) {
  const a = ACH_DEFS.find(x => x.id === id);
  if (!a || S.achieve.claimed.includes(id)) return;
  if (achCur(a) < achTarget(a)) { flash('条件尚未达成'); return; }
  addReward(a.reward);
  S.achieve.claimed.push(id);
  saveAchieve();
  flash(`成就达成：${a.name}${a.title ? ` · 解锁称号「${a.title}」` : ''}`);
  renderAchieveScreen('ach');
  renderHome();
}
function claimCollection(id) {
  const c = COLLECT_DEFS.find(x => x.id === id);
  if (!c || S.achieve.collection.includes(id)) return;
  if (achCur(c) < achTarget(c)) { flash('收集数量不足'); return; }
  addReward(c.reward);
  S.achieve.collection.push(id);
  saveAchieve();
  flash(`图鉴奖励：${c.name}${c.title ? ` · 解锁称号「${c.title}」` : ''}`);
  renderAchieveScreen('collection');
}
function claimMilestone(floor, silent) {
  if (S.achieve.milestones.includes(floor)) return;
  if ((S.tower.best || 1) < floor) return;
  const reward = milestoneReward(floor);
  addReward(reward);
  S.achieve.milestones.push(floor);
  saveAchieve();
  const t = TITLE_MS[floor];
  flash(`百层里程碑：第 ${floor} 层 · ${fmtRewards(reward)}${t ? ` · 称号「${t}」` : ''}`);
  if (!silent) renderAchieveScreen('milestone');
  renderWallet();
}
function equipTitle(id) {
  S.achieve.title = id;
  saveAchieve();
  renderAchieveScreen('title');
  renderHome();
  flash(id ? `已装备称号：${titleName(id)}` : '已卸下称号');
}
function achOnBattle(data) {
  const st = S.achieve.stats;
  st.battles = (st.battles || 0) + 1;
  if (data.winner === 0) st.wins = (st.wins || 0) + 1;
  const dmg = battleDamage(data);
  if (dmg > (S.achieve.records.maxDamage || 0)) S.achieve.records.maxDamage = Math.round(dmg);
  if (S.mode === 'tower' && data.winner === 0) {
    const r = Math.min(25, data.rounds || data.round || 0);
    if (r && (!S.achieve.records.fastestTower || r < S.achieve.records.fastestTower)) S.achieve.records.fastestTower = r;
  }
  saveAchieve();
  bumpSeasonWeekly('battles', 1);
  if (data.winner === 0) bumpSeasonWeekly('wins', 1);
  if (S.screen === 'achieve') renderAchieveScreen();
}
function claimAllAchievements() {
  let n = 0;
  ACH_DEFS.forEach(a => {
    if (S.achieve.claimed.includes(a.id)) return;
    if (achCur(a) < achTarget(a)) return;
    addReward(a.reward);
    S.achieve.claimed.push(a.id);
    n += 1;
  });
  saveAchieve(); renderWallet(); renderAchieveScreen('ach'); renderHome();
  flash(n ? `一键领取完成：${n} 项成就` : '暂无可领取成就');
}
function claimAllCollection() {
  let n = 0;
  COLLECT_DEFS.forEach(c => {
    if (S.achieve.collection.includes(c.id)) return;
    if (achCur(c) < achTarget(c)) return;
    addReward(c.reward);
    S.achieve.collection.push(c.id);
    n += 1;
  });
  saveAchieve(); renderWallet(); renderAchieveScreen('collection'); renderHome();
  flash(n ? `一键领取完成：${n} 项图鉴奖励` : '暂无可领取图鉴奖励');
}

function renderAchieveScreen(tab) {
  if (tab) S.achTab = tab;
  const tabBox = $('#achTabs'), list = $('#achList'), sum = $('#achSummary');
  if (!tabBox || !list) return;
  S.achTab = S.achTab || 'ach';
  tabBox.innerHTML = [['ach', '成就'], ['collection', '图鉴收集'], ['milestone', '塔里程碑'], ['title', '称号']]
    .map(([k, t]) => `<button class="${S.achTab === k ? 'active' : ''}" data-atab="${k}">${t}</button>`).join('');
  tabBox.querySelectorAll('[data-atab]').forEach(b => { b.onclick = () => renderAchieveScreen(b.dataset.atab); });
  if (sum) {
    sum.innerHTML = `成就 <b>${S.achieve.claimed.length}</b>/${ACH_DEFS.length} · 图鉴 <b>${S.owned.length}</b>/${S.units.length} ·
      塔最高 <b>${S.tower.best || 1}</b> 层 · 当前称号 <b>${esc(titleName(S.achieve.title) || '无')}</b>`;
  }
  if (S.achTab === 'collection') {
    list.innerHTML = `<div class="ach-tools"><button id="achClaimAllCol" class="mini">一键领取图鉴奖励</button></div>` + COLLECT_DEFS.map(c => {
      const cur = achCur(c), tgt = achTarget(c), done = cur >= tgt;
      const claimed = S.achieve.collection.includes(c.id);
      const pct = Math.min(100, cur / Math.max(1, tgt) * 100).toFixed(1);
      return `<div class="quest-item${done ? ' done' : ''}">
        <div class="qi-main"><b>${esc(c.name)}</b><span>${esc(c.desc)} · 进度 ${cur}/${tgt}</span>
          <div class="ach-bar"><i style="width:${pct}%"></i></div></div>
        <div class="qi-reward">${esc(fmtRewards(c.reward))}</div>
        <button class="mini${claimed ? ' ghost' : ''}" data-col="${esc(c.id)}" ${done && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : done ? '领取' : '未达成'}</button>
      </div>`;
    }).join('') + `<div class="ach-foot"><button class="mini" id="achOpenCodex">打开图鉴</button></div>`;
    list.querySelectorAll('[data-col]').forEach(b => { b.onclick = () => claimCollection(b.dataset.col); });
    const occ = $('#achClaimAllCol'); if (occ) occ.onclick = claimAllCollection;
    const oc = $('#achOpenCodex'); if (oc) oc.onclick = openCodex;
    return;
  }
  if (S.achTab === 'milestone') {
    const best = S.tower.best || 1;
    const maxFloor = Math.max(1000, Math.ceil((best + 1) / 100) * 100);
    let floors = [];
    for (let f = 100; f <= maxFloor; f += 100) floors.push(f);
    const rec = S.achieve.records || {};
    list.innerHTML = `<div class="quest-item"><div class="qi-main"><b>本地纪录</b>
      <span>最高 ${best} 层 · 塔最快通关 ${rec.fastestTower ? rec.fastestTower + ' 回合' : '—'} · 单场最高输出 ${rec.maxDamage || 0}</span></div></div>` +
      floors.map(f => {
        const claimed = S.achieve.milestones.includes(f);
        const reached = best >= f;
        const reward = milestoneReward(f);
        const title = TITLE_MS[f] ? ` · 称号「${TITLE_MS[f]}」` : '';
        return `<div class="quest-item${reached ? ' done' : ''}">
          <div class="qi-main"><b>第 ${f} 层</b><span>${reached ? (claimed ? '已领取' : '已达成，可领取') : '尚未到达'}${title}</span></div>
          <div class="qi-reward">${esc(fmtRewards(reward))}</div>
          <button class="mini${claimed ? ' ghost' : ''}" data-ms="${f}" ${reached && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : reached ? '领取' : '未到达'}</button>
        </div>`;
      }).join('');
    list.querySelectorAll('[data-ms]').forEach(b => { b.onclick = () => claimMilestone(Number(b.dataset.ms)); });
    return;
  }
  if (S.achTab === 'title') {
    const owned = ownedTitles();
    list.innerHTML = `<div class="ach-tools"><input id="achTitleSearch" class="ach-search" placeholder="搜索称号" value="${esc(S.titleSearch || '')}"></div>
      <div class="quest-item"><div class="qi-main"><b>当前称号</b>
        <span>${esc(titleName(S.achieve.title) || '未装备')}</span></div>
        ${S.achieve.title ? '<button class="mini ghost" id="achUnequip">卸下</button>' : ''}</div>` +
      (owned.length ? owned.map(t => `<div class="quest-item${S.achieve.title === t.id ? ' done' : ''}" data-title-name="${esc(t.name)}">
        <div class="qi-main"><b>${esc(t.name)}</b><span>${S.achieve.title === t.id ? '已装备' : '可装备'}</span></div>
        <button class="mini${S.achieve.title === t.id ? ' ghost' : ''}" data-title="${esc(t.id)}" ${S.achieve.title === t.id ? 'disabled' : ''}>${S.achieve.title === t.id ? '装备中' : '装备'}</button>
      </div>`).join('') : '<div class="quest-item"><div class="qi-main"><span>暂无称号：完成成就、收集或塔里程碑可解锁。</span></div></div>');
    const tSearch = $('#achTitleSearch');
    if (tSearch) tSearch.oninput = () => {
      S.titleSearch = tSearch.value;
      const q = S.titleSearch.trim();
      list.querySelectorAll('[data-title-name]').forEach(el => {
        el.style.display = (!q || el.dataset.titleName.includes(q)) ? '' : 'none';
      });
    };
    list.querySelectorAll('[data-title]').forEach(b => { b.onclick = () => equipTitle(b.dataset.title); });
    const un = $('#achUnequip'); if (un) un.onclick = () => equipTitle('');
    return;
  }
  list.innerHTML = `<div class="ach-tools"><button id="achClaimAll" class="mini">一键领取成就</button></div>` + ACH_DEFS.map(a => {
    const cur = achCur(a), tgt = achTarget(a), done = cur >= tgt;
    const claimed = S.achieve.claimed.includes(a.id);
    const pct = Math.min(100, cur / Math.max(1, tgt) * 100).toFixed(1);
    return `<div class="quest-item${done ? ' done' : ''}">
      <div class="qi-main"><b>${esc(a.name)}<small class="ach-cat">${esc(a.cat)}</small></b>
        <span>${esc(a.desc)} · 进度 ${cur}/${tgt}${a.title ? ' · 称号「' + esc(a.title) + '」' : ''}</span>
        <div class="ach-bar"><i style="width:${pct}%"></i></div></div>
      <div class="qi-reward">${esc(fmtRewards(a.reward))}</div>
      <button class="mini${claimed ? ' ghost' : ''}" data-ach="${esc(a.id)}" ${done && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : done ? '领取' : '未完成'}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-ach]').forEach(b => { b.onclick = () => claimAchievement(b.dataset.ach); });
  const ac = $('#achClaimAll'); if (ac) ac.onclick = claimAllAchievements;
}

/* ---------------- 装备词条与套装 ---------------- */
const EQUIP_SETS = [
  { id: '破军', name: '破军', two: { atk: 0.08 }, four: 'kill_action', fourName: '乘胜追击', fourDesc: '击杀目标后立即额外行动一次' },
  { id: '玄甲', name: '玄甲', two: { dr: 0.08 }, four: 'survive', fourName: '不屈', fourDesc: '首次受到致死伤害时以 20% 兵力存活' },
  { id: '疾风', name: '疾风', two: { speed: 0.08 }, four: 'first_untarget', fourName: '先声夺人', fourDesc: '第一回合不可被选中' },
  { id: '回春', name: '回春', two: { heal: 0.10 }, four: 'regen', fourName: '生生不息', fourDesc: '每回合恢复 4% 兵力' },
  { id: '奇谋', name: '奇谋', two: { strategy_dmg: 0.10 }, four: 'strat_ramp', fourName: '运筹帷幄', fourDesc: '每回合战法伤害 +6%，最高 +30%' },
  { id: '破甲', name: '破甲', two: { pen: 0.08 }, four: 'chase', fourName: '追击', fourDesc: '普攻后 30% 概率追加一次 60% 攻击' },
  { id: '磐石', name: '磐石', two: { hp: 0.10 }, four: 'shield', fourName: '铁壁', fourDesc: '开场获得 12% 兵力护盾' },
  { id: '虎贲', name: '虎贲', two: { atk: 0.06, crit: 0.05 }, four: 'counter', fourName: '反击', fourDesc: '每次受击后反击伤害逐步提高' },
  { id: '青囊', name: '青囊', two: { heal: 0.10, hp: 0.06 }, four: 'revive', fourName: '续命', fourDesc: '友军阵亡时以 25% 兵力复活一次' },
  { id: '军阵', name: '军阵', two: { dr: 0.10 }, four: 'dr5', fourName: '坚壁', fourDesc: '前 5 回合全体减伤 10%' },
];
const AFFIX_POOL = [
  { k: 'atk', name: '攻击', min: 0.02, max: 0.045 },
  { k: 'hp', name: '兵力', min: 0.02, max: 0.05 },
  { k: 'dr', name: '减伤', min: 0.012, max: 0.028 },
  { k: 'crit', name: '暴击', min: 0.008, max: 0.020 },
  { k: 'crit_dmg', name: '暴伤', min: 0.025, max: 0.060 },
  { k: 'speed', name: '速度', min: 0.008, max: 0.020 },
  { k: 'heal', name: '治疗', min: 0.02, max: 0.05 },
  { k: 'lifesteal', name: '吸血', min: 0.008, max: 0.018 },
  { k: 'strategy_dmg', name: '策略伤害', min: 0.02, max: 0.045 },
  { k: 'effect_hit', name: '效果命中', min: 0.012, max: 0.028 },
  { k: 'dodge', name: '闪避', min: 0.008, max: 0.018 },
  { k: 'pen', name: '穿透', min: 0.008, max: 0.018 },
];
function rollAffix(lv) {
  const def = AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)];
  const factor = 1 + 0.35 * (Math.max(1, lv) - 1);
  const lo = def.min * factor, hi = def.max * factor;
  const v = lo + Math.random() * (hi - lo);
  const ratio = (v - lo) / Math.max(1e-9, hi - lo);
  const grade = ratio >= 0.8 ? '珍品' : ratio >= 0.45 ? '上品' : '普通';
  return { k: def.k, name: def.name, value: Math.round(v * 10000) / 10000, grade };
}
function ensureAffixes(p, slot, lv) {
  p.affixes = p.affixes || {};
  const want = lv >= 3 ? 2 : (lv >= 1 ? 1 : 0);
  let arr = Array.isArray(p.affixes[slot]) ? p.affixes[slot] : [];
  arr = arr.slice(0, want);
  while (arr.length < want) arr.push(rollAffix(lv));
  p.affixes[slot] = arr;
  return arr;
}
function equipPieces(p) {
  return ['武器', '甲胄', '坐骑', '兵符'].filter(k => (p.equip[k] || 0) > 0).length;
}
function equipSetOf(p) {
  return EQUIP_SETS.find(x => x.id === (p.equipSet || '破军')) || EQUIP_SETS[0];
}
function equipSetText(set) {
  const two = Object.entries(set.two).map(([k, v]) => `${({ atk: '攻击', hp: '兵力', dr: '减伤', speed: '速度', heal: '治疗', strategy_dmg: '策略伤害', pen: '穿透', crit: '暴击', crit_dmg: '暴伤', effect_hit: '效果命中', lifesteal: '吸血', dodge: '闪避' })[k] || k} +${Math.round(v * 100)}%`).join('、');
  return `2件：${two} · 4件：${set.fourName}（${set.fourDesc}）`;
}
function rerollEquipAffixes(name, slot) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(8, p.equip[slot] || 0));
  if (!lv) { flash('先升级该装备'); return; }
  const cost = 10;
  if ((S.inventory['玄铁'] || 0) < cost) { flash('玄铁不足（洗练需 10）'); return; }
  S.inventory['玄铁'] -= cost;
  p.affixes = p.affixes || {};
  p.affixes[slot] = [];
  ensureAffixes(p, slot, lv);
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth();
  flash(`${slot} 词条已洗练`);
}
function setEquipSet(name, id) {
  const p = unitProg(name);
  p.equipSet = id;
  saveUnitProgress(); renderGrowth();
  flash(`套装切换为「${id}」`);
}
/* ---------------- 觉醒分支 / 转职 ---------------- */
const BRANCHES = {
  wushen: { name: '武神', desc: '攻击 +10%、暴击 +8%；击杀目标后立即额外行动一次' },
  junshen: { name: '军神', desc: '减伤 +8%、兵力 +10%；首次受到致死伤害时以 20% 兵力存活' },
  mousheng: { name: '谋圣', desc: '策略伤害 +12%；每回合开始回怒 10，首次受控免疫' },
  renxin: { name: '仁心', desc: '治疗效果 +15%；每回合恢复 4% 兵力' },
  jiying: { name: '疾影', desc: '速度 +8%、穿透 +8%；普攻后 30% 概率追击' },
  panshi: { name: '磐石', desc: '兵力 +12%、减伤 +6%；受击反击伤害逐步提高' },
  guimou: { name: '鬼谋', desc: '效果命中 +10%、策略伤害 +8%；普攻 12% 概率眩晕' },
  yisheng: { name: '医圣', desc: '治疗 +12%、兵力 +8%；友军阵亡时以 25% 兵力复活一次' },
};
function branchChoicesFor(name) {
  const r = ((S.by[name] || {}).role || '');
  if (/医者/.test(r)) return ['renxin', 'junshen', 'yisheng'];
  if (/谋主|军师|术士/.test(r)) return ['mousheng', 'renxin', 'guimou'];
  if (/虎卫/.test(r)) return ['wushen', 'junshen', 'panshi'];
  return ['wushen', 'junshen', 'jiying'];
}
function branchCount() {
  return Object.values(S.unitProgress || {}).filter(p => p && p.branch).length;
}
function chooseBranch(name, id) {
  const p = unitProg(name);
  if ((p.aw || 0) < 6) { flash('觉醒满 6 星后才能转职'); return; }
  if (!branchChoicesFor(name).includes(id)) { flash('该武将没有此分支'); return; }
  if (p.branch === id) return;
  if (p.branch) {
    const cost = 20000;
    if ((S.inventory['铜钱'] || 0) < cost) { flash('重选分支需要 20000 铜钱'); return; }
    S.inventory['铜钱'] -= cost;
    saveInventory(); renderWallet();
  }
  p.branch = id;
  saveUnitProgress(); renderGrowth(); renderHome();
  flash(`${name} 转职为「${BRANCHES[id].name}」`);
}

function unitProg(name) {
  if (!S.unitProgress[name]) S.unitProgress[name] = { skills: {}, equip: {} };
  const p = S.unitProgress[name];
  p.skills = p.skills || {}; p.equip = p.equip || {};
  p.affixes = p.affixes || {};
  p.equipSet = p.equipSet || '破军';
  return p;
}
function unitDupStar(name) { return Math.max(0, Math.min(10, Number((S.unitProgress[name] || {}).dupStar || 0))); }
function gainDupStar(name) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(10, p.dupStar || 0));
  if (lv >= 10) return null;
  p.dupStar = lv + 1;
  saveUnitProgress();
  return p.dupStar;
}

function renderDetailSlots(name) {
  const box = $('#detailSlots');
  if (!box) return;
  if (!S.owned.includes(name)) {
    box.innerHTML = '<div class="dl">装备栏</div><div class="row">招募后可装备技能书、战法书与神器。</div>';
    return;
  }
  const p = unitProg(name);
  const row = (label, type, unlocked, lockText) => {
    const val = p[type];
    const eff = val ? itemDesc(type, val) + (type === 'artifact' ? ` · ${artifactLevel(val)}★` : '') : '';
    return `<div class="slot-row"><b>${label}</b>
      <span>${unlocked ? (val ? `${esc(val)}${eff ? `（${eff}）` : ''}` : '未装备') : lockText}</span>
      ${unlocked ? `<button class="mini" onclick="openItemPicker('${esc(name)}','${type}')">${val ? '更换' : '装备'}</button>` : ''}
      ${unlocked && val ? `<button class="mini ghost" onclick="clearSlot('${esc(name)}','${type}')">卸下</button>` : ''}
    </div>`;
  };
  const sigs = sigilsOf(name);
  const sigilHtml = sigs.length
    ? `<div class="dl">将星印记 · ${sigs.length}/5${sigs.length >= 3 ? ' · 共鸣中（攻击/减伤/兵力 +5%）' : ''}</div>` +
      sigs.map(s => `<div class="sigil-line ${s.rarity}">
        <i class="rar ${s.rarity}">${s.story ? '宿将' : esc(s.rarity)}</i><b>${esc(s.name)}</b>
        <span>${esc(effLabel(s.stats))}${s.special ? ' · ' + esc(specialName(s.special)) : ''}${s.desc ? ' · ' + esc(s.desc) : ''}</span></div>`).join('')
    : '<div class="dl">将星印记</div><div class="row">尚无印记。通关每章第 10 关可获得永久增幅。</div>';
  box.innerHTML = `<div class="dl">装备栏</div>
    ${row('技能栏', 'skillBook', (p.bt || 0) >= 5, `突破至 5 段解锁（当前 ${p.bt || 0}/8）`)}
    ${row('战法栏', 'tacticBook', (p.aw || 0) >= 6, `觉醒至 6 星解锁（当前 ${p.aw || 0}/10）`)}
    ${row('神器栏', 'artifact', true, '')}
    ${row('秘宝栏', 'relic', true, '')}
    ${sigilHtml}`;
}

function pickerRow(x, cur) {
  const type = PICKER ? PICKER.type : 'skillBook';
  const meta = itemShort(type, x.k);
  const score = Math.min(3, x.score);
  return `<button class="picker-item fit${score}${x.k === cur ? ' equipped' : ''}" data-item="${esc(x.k)}">
    <span class="pi-head">${catChip(x.cat)}<b>${esc(meta.name)}</b><em>${esc(meta.tier)}</em>
      <span class="bc-n">×${S.inventory[x.k] || 0}</span><i class="fit">${x.k === cur ? '装备中' : fitLabel(x.score)}</i></span>
    <span class="pi-desc">${esc(meta.desc)}</span></button>`;
}

function openItemPicker(name, type) {
  const p = unitProg(name);
  if (type === 'skillBook' && (p.bt || 0) < 5) { flash('突破至 5 段解锁技能栏'); return; }
  if (type === 'tacticBook' && (p.aw || 0) < 6) { flash('觉醒至 6 星解锁战法栏'); return; }
  PICKER = { name, type };
  const u = S.by[name] || {};
  $('#itemPickerTitle').textContent = `选择${ITEM_TITLES[type]} · ${name}`;
  const prefix = type === 'skillBook' ? '技能书·' : type === 'tacticBook' ? '战法书·' : type === 'relic' ? '秘宝·' : '';
  const keys = Object.keys(S.inventory)
    .filter(k => (S.inventory[k] || 0) > 0 &&
      (type === 'artifact' ? !!ARTIFACTS[k] : type === 'relic' ? k.startsWith('秘宝·') : k.startsWith(prefix)));
  const cur = p[type];
  let html = '';
  if (cur) {
    html += `<div class="picker-cur">当前装备 <b>${esc(itemShort(type, cur).name)}</b><button class="mini ghost" data-unequip>卸下</button></div>`;
  }
  const isBook = type === 'skillBook' || type === 'tacticBook';
  if (isBook && keys.length) {
    const arch = roleArch(u.role || '');
    const archName = (ITEM_CATS[arch] || ITEM_CATS.support).name;
    html += `<div class="picker-hint">${esc(name)}为「${esc(u.role || '')}」，优先推荐${archName}类</div>`;
    if (type === 'skillBook') html += '<div class="picker-hint">技能书为通用装备：效果按当前武将结算，描述中的原武将名以「自身」显示。</div>';
    const scored = keys.map(k => {
      const cat = itemCat(type, k);
      return { k, cat, score: fitScore(u, cat) };
    }).sort((a, b) => b.score - a.score ||
      (ITEM_CATS[a.cat] || ITEM_CATS.support).name.localeCompare((ITEM_CATS[b.cat] || ITEM_CATS.support).name) ||
      a.k.localeCompare(b.k));
    [3, 2, 1, 0].forEach(band => {
      const arr = scored.filter(x => Math.min(3, x.score) === band);
      if (!arr.length) return;
      html += `<div class="picker-sec">${fitLabel(band)} · ${arr.length}</div>` + arr.map(x => pickerRow(x, cur)).join('');
    });
  } else if (keys.length) {
    html += keys.map(k => {
      const meta = itemShort(type, k);
      return `<button class="picker-item${k === cur ? ' equipped' : ''}" data-item="${esc(k)}">
        <span class="pi-head"><b>${esc(meta.name)}</b><em>${esc(meta.tier)}</em><span class="bc-n">×${S.inventory[k] || 0}</span></span>
        <span class="pi-desc">${esc(meta.desc)}</span></button>`;
    }).join('');
  } else {
    html += `<div class="bag-empty">背包中没有可用的${ITEM_TITLES[type]}</div>`;
  }
  $('#itemPickerList').innerHTML = html;
  $('#itemPickerList').querySelectorAll('[data-item]').forEach(b => { b.onclick = () => equipItem(b.dataset.item); });
  const ub = $('#itemPickerList').querySelector('[data-unequip]');
  if (ub) ub.onclick = () => { clearSlot(name, type); $('#itemPicker').hidden = true; };
  $('#itemPicker').hidden = false;
}

function equipItem(item) {
  if (!PICKER) return;
  const { name, type } = PICKER;
  if ((S.inventory[item] || 0) <= 0) { flash('数量不足'); return; }
  if (type === 'skillBook' || type === 'tacticBook') {
    const u = S.by[name] || {};
    const cat = itemCat(type, item);
    if (fitScore(u, cat) <= 0) {
      const meta = itemShort(type, item);
      if (!confirm(`「${meta.name}」是${ITEM_CATS[cat] ? ITEM_CATS[cat].name : ''}类，与${name}的定位不契合，可能降低输出。仍要装备？`)) return;
    }
  }
  const p = unitProg(name);
  if (p[type]) S.inventory[p[type]] = (S.inventory[p[type]] || 0) + 1;
  S.inventory[item] -= 1;
  p[type] = item;
  saveInventory(); saveUnitProgress();
  $('#itemPicker').hidden = true;
  renderDetailSlots(name); renderBag();
  flash(`已装备 ${item}`);
}

function clearSlot(name, type) {
  const p = unitProg(name);
  if (!p[type]) return;
  const item = p[type];
  S.inventory[item] = (S.inventory[item] || 0) + 1;
  delete p[type];
  saveInventory(); saveUnitProgress();
  renderDetailSlots(name); renderBag();
  flash(`已卸下 ${item}`);
}

function decomposeCore(name) {
  if (!S.owned.includes(name)) return null;
  if (S.owned.length <= 5) return null;
  if (sigilsOf(name).length) return null;
  if (expBusyNames().includes(name)) return null;
  const u = S.by[name] || {};
  const tier = { 普通: 1, 精良: 2, 传奇: 3, 绝世: 4 }[u.rarity] || 1;
  const stratList = Object.keys(STRATAGEMS);
  const strat = stratList[Math.floor(Math.random() * stratList.length)];
  const p = S.unitProgress[name];
  if (p) {
    for (const t of ['skillBook', 'tacticBook', 'artifact', 'relic']) {
      if (p[t]) S.inventory[p[t]] = (S.inventory[p[t]] || 0) + 1;
    }
  }
  S.owned = S.owned.filter(n => n !== name);
  S.a = (S.a || []).map(n => n === name ? null : n);
  if (S.support) S.support = S.support.filter(n => n !== name);
  delete S.unitProgress[name];
  const book = `战法书·${tier}阶·${strat}`;
  S.inventory[book] = (S.inventory[book] || 0) + 1;
  S.achieve.stats.decomposes = (S.achieve.stats.decomposes || 0) + 1;
  return book;
}
function decomposeUnit(name) {
  if (!S.owned.includes(name)) return;
  if (S.owned.length <= 5) { flash('至少保留 5 名武将'); return; }
  if (sigilsOf(name).length) { flash(`该武将身负 ${sigilsOf(name).length} 枚将星印记，不可分解`); return; }
  if (expBusyNames().includes(name)) { flash('该武将正在内政派遣中，暂不可分解'); return; }
  const u = S.by[name] || {};
  const tier = { 普通: 1, 精良: 2, 传奇: 3, 绝世: 4 }[u.rarity] || 1;
  if (!confirm(`确定分解 ${name}？\n将获得 战法书·${tier}阶，该武将永久消失。`)) return;
  const book = decomposeCore(name);
  if (!book) { flash('无法分解该武将'); return; }
  saveInventory(); saveOwned(); saveFormation(); saveUnitProgress(); saveAchieve();
  $('#detail').hidden = true;
  renderRoster(); renderPool(); renderBag();
  flash(`已分解 ${name}，获得 ${book}`);
}
function batchEligibleUnits() {
  const busy = expBusyNames();
  return S.owned.map(n => S.by[n]).filter(u => u && (u.rarity === '普通' || u.rarity === '精良') && !sigilsOf(u.name).length && !busy.includes(u.name));
}
function openBatchDecompose() {
  if (S.owned.length <= 5) { flash('至少保留 5 名武将'); return; }
  const list = batchEligibleUnits();
  if (!list.length) { flash('没有可批量分解的普通/精良武将'); return; }
  const box = $('#batchList');
  box.innerHTML = list.map(u => `<label class="batch-item">
      <input type="checkbox" data-batchname="${esc(u.name)}">
      <span class="bi-name">${esc(u.name)}</span>
      <span class="bi-meta">${esc(u.rarity)} · ${esc(u.role)}</span>
    </label>`).join('');
  box.querySelectorAll('[data-batchname]').forEach(cb => { cb.onchange = batchUpdateCount; });
  batchUpdateCount();
  $('#batchModal').hidden = false;
}
function batchUpdateCount() {
  const n = document.querySelectorAll('#batchList [data-batchname]:checked').length;
  const el = $('#batchCount'); if (el) el.textContent = `已选 ${n}`;
}
function batchSelectRarity(rarity) {
  document.querySelectorAll('#batchList [data-batchname]').forEach(cb => {
    if ((S.by[cb.dataset.batchname] || {}).rarity === rarity) cb.checked = true;
  });
  batchUpdateCount();
}
function closeBatchModal() { $('#batchModal').hidden = true; }
function confirmBatchDecompose() {
  const names = [...document.querySelectorAll('#batchList [data-batchname]:checked')].map(cb => cb.dataset.batchname);
  if (!names.length) { flash('请先勾选要分解的武将'); return; }
  if (names.length > S.owned.length - 5) { flash('至少保留 5 名武将，请减少勾选'); return; }
  if (!confirm(`确定批量分解 ${names.length} 名武将？该操作不可撤销。`)) return;
  const books = [];
  names.forEach(n => { const b = decomposeCore(n); if (b) books.push(b); });
  saveInventory(); saveOwned(); saveFormation(); saveUnitProgress(); saveAchieve();
  closeBatchModal();
  renderRoster(); renderPool(); renderBag();
  flash(`批量分解完成：${books.length} 名武将`);
}



function upgradeTacticBook(key) {
  const info = tacticBookInfo(key);
  if (info.tier >= 6) return;
  if ((S.inventory[key] || 0) < 2) { flash('需要 2 本同计同阶战法书'); return; }
  const next = `战法书·${info.tier + 1}阶·${info.strat}`;
  S.inventory[key] -= 2;
  S.inventory[next] = (S.inventory[next] || 0) + 1;
  saveInventory(); renderBag();
  flash(`合成 ${next}`);
}

function synthesizeArtifact() {
  if ((S.inventory['神器碎片'] || 0) < 20) { flash('需要 20 个神器碎片'); return; }
  const keys = Object.keys(ARTIFACTS);
  const item = keys[Math.floor(Math.random() * keys.length)];
  S.inventory['神器碎片'] -= 10;
  S.inventory[item] = (S.inventory[item] || 0) + 1;
  saveInventory(); renderBag();
  flash(`合成 ${item}`);
}
function initGrowthSelect() {
  const sel = $('#growthUnit');
  sel.innerHTML = '';
  const owned = S.units.filter(u => S.owned.includes(u.name));
  const list = owned.length ? owned : S.units;
  if (!list.some(u => u.name === S.growthUnit)) S.growthUnit = list[0] ? list[0].name : S.growthUnit;
  list.forEach(u => {
    const o = document.createElement('option');
    o.value = u.name; o.textContent = `${u.name} · ${u.rarity} · ${u.role}`;
    sel.appendChild(o);
  });
  sel.value = S.growthUnit;
}
function renderGrowth() {
  const u = S.by[S.growthUnit];
  if (!u) return;
  const p = unitProg(u.name);
  const gc = $('#growthCard');
  const full = `${SG_IMG.card(u.name)}`;
  if (gc.dataset.full !== full) {
    gc.dataset.full = full;
    gc.src = pthumb(u.name);
    const pre = new Image();
    pre.onload = () => { if (gc.dataset.full === full) gc.src = full; };
    pre.src = full;
  }
  const keys = ['武勇', '智谋', '统御', '机变', '威仪', '天命'];
  $('#growthStats').innerHTML = keys.map(k => `<div class="gs">${k}<b>${u.stats[k]}</b></div>`).join('') +
    `<div class="gs wide">${u.faction} · ${u.rarity} · ${u.role} · ${u.troop} · 战力 ${u.power || '-'}</div>`;
  const skills = ['普攻', '战法', '奇谋', '被动', '特色'];
  const skBox = $('#growthSkills');
  skBox.innerHTML = '<div class="grow-title">技能</div>';
  skills.forEach(t => {
    if (!u.skills || !u.skills[t]) return;
    const sk = u.skills[t];
    const lv = Math.max(1, Math.min(15, p.skills[t] || 1));
    const row = document.createElement('div'); row.className = 'grow-row';
    if (t === '特色' || t === '被动') {
      row.innerHTML = `<span class="gn">${esc(sk.name)}</span><span class="gl">—</span><span class="gc">${t}不可升级</span>`;
    } else {
      const cost = 10 + 5 * (lv - 1);
      const max = lv >= 15;
      let eff = sk.mult || '—';
      const base = parseFloat(String(sk.mult || '').replace('%', ''));
      if (!isNaN(base) && lv > 1) eff = `${Math.round(base * (1 + 0.06 * (lv - 1)))}%`;
      row.innerHTML = `<span class="gn">${esc(sk.name)}</span><span class="gl">Lv${lv}</span>
        <span class="gc">${esc(eff)} · ${max ? '已满' : '升级 ' + cost + ' 兵书'}</span>`;
      const b = document.createElement('button');
      b.textContent = max ? '满级' : '升级';
      b.disabled = max || (S.inventory['兵书'] || 0) < cost;
      b.onclick = () => upgradeSkill(u.name, t);
      row.appendChild(b);
    }
    skBox.appendChild(row);
  });
  const eqBox = $('#growthEquips');
  eqBox.innerHTML = '<div class="grow-title">装备</div>';
  const slots = ['武器', '甲胄', '坐骑', '兵符'];
  let total = 0, all = true;
  slots.forEach(slot => {
    const lv = Math.max(0, Math.min(8, p.equip[slot] || 0));
    total += lv; if (!lv) all = false;
    const costT = 1 + lv, costX = 1 + lv;
    const max = lv >= 8;
    const row = document.createElement('div'); row.className = 'grow-row';
    row.innerHTML = `<span class="gn">${slot}</span><span class="gl">Lv${lv}</span>
      <span class="gc">${max ? '已满' : `升级 图纸${costT} + 玄铁${costX}`}</span>`;
    const b = document.createElement('button');
    b.textContent = max ? '满级' : '升级';
    b.disabled = max || (S.inventory['图纸'] || 0) < costT || (S.inventory['玄铁'] || 0) < costX;
    b.onclick = () => upgradeEquip(u.name, slot);
    row.appendChild(b);
    eqBox.appendChild(row);
    if (lv > 0) {
      const affixes = ensureAffixes(p, slot, lv);
      const line = document.createElement('div');
      line.className = 'affix-line';
      line.innerHTML = `<span class="affix-tag">词条</span>${affixes.map(a =>
        `<span class="affix ${a.grade === '珍品' ? 'rare' : a.grade === '上品' ? 'good' : ''}">${esc(a.name)} +${(a.value * 100).toFixed(1)}%<i>${esc(a.grade)}</i></span>`).join('')}
        <button class="mini ghost" data-reroll="${slot}">洗练（玄铁10）</button>`;
      line.querySelector('[data-reroll]').onclick = () => rerollEquipAffixes(u.name, slot);
      eqBox.appendChild(line);
    }
  });
  const set = equipSetOf(p);
  const pieces = equipPieces(p);
  const setRow = document.createElement('div'); setRow.className = 'grow-row set-row';
  setRow.innerHTML = `<span class="gn">套装</span>
    <select id="growthSetSel">${EQUIP_SETS.map(x => `<option value="${esc(x.id)}"${x.id === set.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <span class="gc">${pieces} 件 · ${esc(equipSetText(set))}${pieces >= 2 ? ' · <b>2件生效</b>' : ''}${pieces >= 4 ? ' · <b>4件生效</b>' : ''}</span>`;
  eqBox.appendChild(setRow);
  const sel = setRow.querySelector('#growthSetSel');
  if (sel) sel.onchange = () => setEquipSet(u.name, sel.value);
  const adv = $('#growthAdvance');
  const bt = Math.max(0, Math.min(8, p.bt || 0));
  const aw = Math.max(0, Math.min(10, p.aw || 0));
  const star = Math.max(0, Math.min(6, p.star || 0));
  const costB = 20 + 20 * bt, costMoney = 5000 + 5000 * bt;
  const costSoul = 20 + 20 * aw;
  adv.innerHTML = '<div class="grow-title">突破 / 觉醒</div>';
  const row1 = document.createElement('div'); row1.className = 'grow-row';
  row1.innerHTML = `<span class="gn">突破</span><span class="gl">${bt}/8</span>
    <span class="gc">${bt >= 8 ? '已满 · 全属性 +48%' : `+6% · 消耗 魂石${costB} + 铜钱${costMoney}`}</span>`;
  const b1 = document.createElement('button');
  b1.textContent = bt >= 8 ? '满级' : '突破';
  b1.disabled = bt >= 8 || (S.inventory['魂石'] || 0) < costB || (S.inventory['铜钱'] || 0) < costMoney;
  b1.onclick = () => upgradeBreakthrough(u.name);
  row1.appendChild(b1); adv.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'grow-row';
  row2.innerHTML = `<span class="gn">觉醒</span><span class="gl">${aw}/10</span>
    <span class="gc">${aw >= 10 ? '已满 · 全属性 +40%' : `+4% · 消耗 将魂${costSoul}`}</span>`;
  const b2 = document.createElement('button');
  b2.textContent = aw >= 10 ? '满级' : '觉醒';
  b2.disabled = aw >= 10 || (S.inventory['将魂'] || 0) < costSoul;
  b2.onclick = () => upgradeAwaken(u.name);
  row2.appendChild(b2); adv.appendChild(row2);
  const costStarS = 4 + 4 * star, costStarF = 2 + 2 * star, costStarM = 8000 + 8000 * star;
  const row3 = document.createElement('div'); row3.className = 'grow-row';
  row3.innerHTML = `<span class="gn">将星</span><span class="gl">${star}/6</span>
    <span class="gc">${star >= 6 ? '已满 · 全属性 +18%' : `+3% · 消耗 神兵${costStarS} + 碎片${costStarF} + 铜钱${costStarM}`}</span>`;
  const b3 = document.createElement('button');
  b3.textContent = star >= 6 ? '满级' : '升阶';
  b3.disabled = star >= 6 || (S.inventory['神兵'] || 0) < costStarS || (S.inventory['神器碎片'] || 0) < costStarF || (S.inventory['铜钱'] || 0) < costStarM;
  b3.onclick = () => upgradeStar(u.name);
  row3.appendChild(b3); adv.appendChild(row3);
  const dup = unitDupStar(u.name);
  const row4 = document.createElement('div'); row4.className = 'grow-row';
  row4.innerHTML = `<span class="gn">升星</span><span class="gl">${dup}/10</span>
    <span class="gc">每星全属性 +10% · 抽到重复武将自动升星${dup >= 10 ? ' · 已满，重复转将魂' : ''}</span>`;
  adv.appendChild(row4);
  adv.insertAdjacentHTML('beforeend', '<div class="grow-title">觉醒分支</div>');
  if (aw >= 6) {
    branchChoicesFor(u.name).forEach(id => {
      const br = BRANCHES[id];
      const active = p.branch === id;
      const card = document.createElement('div');
      card.className = 'branch-card' + (active ? ' active' : '');
      card.innerHTML = `<b>${br.name}</b><span>${br.desc}</span>`;
      const bb = document.createElement('button');
      bb.className = 'mini' + (active ? ' ghost' : '');
      const switching = !!p.branch && !active;
      bb.textContent = active ? '已转职' : switching ? '重选（铜钱20000）' : '转职';
      bb.disabled = active || (switching && (S.inventory['铜钱'] || 0) < 20000);
      bb.onclick = () => chooseBranch(u.name, id);
      card.appendChild(bb);
      adv.appendChild(card);
    });
    if (!p.branch) adv.insertAdjacentHTML('beforeend', '<div class="branch-hint">转职后获得该分支的永久战斗加成，可在两分支间重选。</div>');
  } else {
    adv.insertAdjacentHTML('beforeend', '<div class="branch-hint">觉醒满 6 星后解锁觉醒分支（二选一）。</div>');
  }
  $('#growthSet').textContent = `升星+${unitDupStar(u.name) * 10}% · 装备 +${total * 2}%${all ? ' · 四件套+15%' : ''} · ${set.name}${pieces}件 · 突破+${bt * 6}% · 觉醒+${aw * 4}% · 将星+${star * 3}%`;
  $('#growthHint').textContent = '技能=兵书（15级）；装备=图纸+玄铁（8级）；洗练=玄铁10；突破=魂石+铜钱（8段）；觉醒=将魂（10星）；将星=神兵+碎片+铜钱（6阶）。技能书/战法书/神器/秘宝在「武将详情 → 装备栏」装备。';
}
function upgradeSkill(name, type) {
  const p = unitProg(name);
  const lv = Math.max(1, Math.min(11, p.skills[type] || 1));
  if (lv >= 15) return;
  const cost = 10 + 5 * (lv - 1);
  if ((S.inventory['兵书'] || 0) < cost) { flash('兵书不足'); return; }
  S.inventory['兵书'] -= cost;
  p.skills[type] = lv + 1;
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth(); taskBump('upgrade');
  flash(`${name} ${type} 升到 Lv${lv + 1}`);
}
function upgradeEquip(name, slot) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(8, p.equip[slot] || 0));
  if (lv >= 8) return;
  const ct = 1 + lv, cx = 1 + lv;
  if ((S.inventory['图纸'] || 0) < ct || (S.inventory['玄铁'] || 0) < cx) { flash('图纸或玄铁不足'); return; }
  S.inventory['图纸'] -= ct; S.inventory['玄铁'] -= cx;
  p.equip[slot] = lv + 1;
  ensureAffixes(p, slot, lv + 1);
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth(); taskBump('upgrade');
  flash(`${name} ${slot} 升到 Lv${lv + 1}`);
}
function upgradeBreakthrough(name) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(8, p.bt || 0));
  if (lv >= 8) return;
  const costB = 20 + 20 * lv, costMoney = 5000 + 5000 * lv;
  if ((S.inventory['魂石'] || 0) < costB || (S.inventory['铜钱'] || 0) < costMoney) { flash('魂石或铜钱不足'); return; }
  S.inventory['魂石'] -= costB; S.inventory['铜钱'] -= costMoney;
  p.bt = lv + 1;
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth(); taskBump('upgrade');
  flash(`${name} 突破到 ${lv + 1} 段`);
}
function upgradeAwaken(name) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(10, p.aw || 0));
  if (lv >= 10) return;
  const cost = 20 + 20 * lv;
  if ((S.inventory['将魂'] || 0) < cost) { flash('将魂不足'); return; }
  S.inventory['将魂'] -= cost;
  p.aw = lv + 1;
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth(); taskBump('upgrade');
  flash(`${name} 觉醒到 ${lv + 1} 星`);
}
function upgradeStar(name) {
  const p = unitProg(name);
  const lv = Math.max(0, Math.min(6, p.star || 0));
  if (lv >= 6) return;
  const costS = 4 + 4 * lv, costF = 2 + 2 * lv, costM = 8000 + 8000 * lv;
  if ((S.inventory['神兵'] || 0) < costS || (S.inventory['神器碎片'] || 0) < costF || (S.inventory['铜钱'] || 0) < costM) { flash('神兵、碎片或铜钱不足'); return; }
  S.inventory['神兵'] -= costS; S.inventory['神器碎片'] -= costF; S.inventory['铜钱'] -= costM;
  p.star = lv + 1;
  saveInventory(); saveUnitProgress(); renderWallet(); renderGrowth(); taskBump('upgrade');
  flash(`${name} 将星升到 ${lv + 1} 阶`);
}
const RES_ICON = {'铜钱':'钱','兵书':'书','将魂':'魂','魂石':'石','图纸':'图','玄铁':'铁','招贤令':'令','金符':'符','塔币':'塔','秘境币':'境','神兵':'兵','上古钥匙':'钥'};
function openRes(k) {
  const target = ({ '铜钱': 'shop', '兵书': 'shop', '将魂': 'shop', '魂石': 'shop', '图纸': 'shop', '玄铁': 'shop',
    '招贤令': 'recruit', '金符': 'recruit', '塔币': 'tower', '秘境币': 'secret', '神兵': 'ancient', '上古钥匙': 'ancient' })[k] || 'shop';
  showScreen(target);
}
function renderWallet() {
  const items = ['铜钱', '兵书', '将魂', '魂石', '图纸', '玄铁', '招贤令', '金符', '塔币', '秘境币', '神兵', '上古钥匙'];
  $('#wallet').innerHTML = items.map(k => `<span class="res" title="点击前往获取 ${k}" onclick="openRes('${k}')"><i class="seal" data-ch="${RES_ICON[k] || '财'}"></i><b>${S.inventory[k] || 0}</b><em>${k}</em></span>`).join('');
  renderStamina();
}
function grantRewards(lv, first) {
  const r = Object.assign({}, first ? lv.first : lv.repeat);
  (lv.drops || []).forEach(d => {
    if (Math.random() < d.chance) r[d.item] = (r[d.item] || 0) + d.amount;
  });
  for (const k in r) S.inventory[k] = (S.inventory[k] || 0) + r[k];
  saveInventory(); renderWallet();
  return r;
}
function fmtRewards(r) {
  return Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k} +${v}`).join('　');
}

function syncViewToProgress() {
  const cur = Math.min(700, Math.max(1, S.progress.unlocked || 1));
  S.volume = Math.ceil(cur / 100);
  S.chapter = Math.floor(((cur - 1) % 100) / 10) + 1;
}

function renderVolumeTabs() {
  const box = $('#volumeTabs');
  box.innerHTML = '';
  for (let v = 1; v <= 7; v++) {
    const b = document.createElement('button');
    b.textContent = `卷${v}`;
    b.title = S.levels.find(x => x.volume === v)?.volume_name || '';
    b.className = S.volume === v ? 'active' : '';
    b.onclick = () => { S.volume = v; S.chapter = 1; renderVolumeTabs(); renderChapterTabs(); renderLevels(); };
    box.appendChild(b);
  }
}

function renderChapterTabs() {
  const box = $('#chapterTabs');
  box.innerHTML = '';
  const chs = [...new Map(S.levels.filter(x => x.volume === S.volume).map(x => [x.chapter, x.chapter_name])).entries()];
  chs.forEach(([c, name]) => {
    const b = document.createElement('button');
    b.textContent = `${c}·${name}`;
    b.className = S.chapter === c ? 'active' : '';
    b.onclick = () => { S.chapter = c; renderChapterTabs(); renderLevels(); };
    box.appendChild(b);
  });
}

function renderCampaignHero() {
  const box = $('#campaignHero');
  if (!box) return;
  const vname = S.levels.find(x => x.volume === S.volume)?.volume_name || '';
  const samples = S.levels.filter(x => x.volume === S.volume && x.chapter === S.chapter).slice(0, 1)
    .flatMap(x => x.enemies.slice(0, 3).map(e => e.name));
  const art = samples.map(n => `<div class="art" style="background-image:url('${SG_IMG.pthumb(n)}')"></div>`).join('');
  const stars = Object.keys(S.progress.stars || {}).length;
  const pct = Math.min(1, (S.progress.unlocked || 1) / 700);
  box.innerHTML = `${art}<div class="veil"></div><div class="txt">
    <h3>第${S.volume}卷 · ${esc(vname)}</h3>
    <div class="sub">已通关 ${stars} 关 · 当前进度 第 ${S.progress.unlocked || 1} / 700 关</div>
    <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div></div>`;
}

function renderLevels() {
  const box = $('#levelList');
  box.innerHTML = '';
  S.levels.filter(lv => lv.volume === S.volume && lv.chapter === S.chapter).forEach(lv => {
    const locked = lv.id > S.progress.unlocked;
    const st = S.progress.stars[lv.id] || 0;
    const label = lv.id <= 10 ? lv.name : `${lv.name}·${lv.sub}`;
    const d = document.createElement('div');
    d.className = 'level-card' + (locked ? ' locked' : '') + (S.levelId === lv.id ? ' active' : '');
    const mech = chapterMech(lv);
    d.innerHTML = `<div class="no">${locked ? '未解锁' : '第 ' + lv.id + ' 关'}</div>
      <div class="name" title="${esc(label)}">${esc(label)}</div>
      <div class="stars">${st ? '★'.repeat(st) : '　'}${mech ? `<em class="lv-mech" title="${esc(mech.name + '：' + mech.desc)}">${esc(mech.name)}</em>` : ''}</div>`;
    d.onclick = () => selectLevel(lv.id);
    box.appendChild(d);
  });
  const vname = S.levels.find(x => x.volume === S.volume)?.volume_name || '';
  $('#campaignTitle').textContent = `主线 · 第${S.volume}卷 ${vname}`;
  $('#modeLabel').textContent = S.mode === 'level' && S.levelData
    ? `第${S.levelData.volume}卷·第${S.levelData.chapter}章 · 第${S.levelData.id}关`
    : '主线关卡';
  renderCampaignHero();
}

const LEVEL_MODS = [
  { id: 'fog', name: '大雾', desc: '双方效果命中 -8%', effect: { effect_hit: -0.08 } },
  { id: 'rain', name: '暴雨', desc: '双方速度 -8%', effect: { speed: -0.08 } },
  { id: 'wind', name: '疾风', desc: '双方速度 +8%', effect: { speed: 0.08 } },
  { id: 'night', name: '夜战', desc: '双方暴击 +8%', effect: { crit: 0.08 } },
  { id: 'blood', name: '血战', desc: '双方攻击 +10%，减伤 -5%', effect: { atk: 0.10, dr: -0.05 } },
  { id: 'wall', name: '坚壁', desc: '双方减伤 +8%', effect: { dr: 0.08 } },
  { id: 'grain', name: '缺粮', desc: '双方兵力 -10%', effect: { hp: -0.10 } },
  { id: 'land', name: '地利', desc: '双方兵力 +10%', effect: { hp: 0.10 } },
  { id: 'chaos', name: '混乱', desc: '双方效果命中 -10%，闪避 +5%', effect: { effect_hit: -0.10, dodge: 0.05 } },
  { id: 'blaze', name: '烈焰', desc: '双方策略伤害 +10%', effect: { strategy_dmg: 0.10 } },
];
function levelModifier(id) {
  return LEVEL_MODS[(Number(id) * 7 + 3) % LEVEL_MODS.length];
}
/* 章节章法：每卷第 3、7 关压阵，只作用于敌军，形成章节里的两个难点 */
const CHAPTER_MECHS = {
  1: { id: 'warband', name: '蚁附', desc: '敌军兵力 +20%', effect: { hp: 0.20 } },
  2: { id: 'iron', name: '铁骑', desc: '敌军速度 +15%，暴击 +8%', effect: { speed: 0.15, crit: 0.08 } },
  3: { id: 'volley', name: '连弩', desc: '敌军攻击 +15%', effect: { atk: 0.15 } },
  4: { id: 'fire', name: '火攻', desc: '敌军策略伤害 +25%', effect: { strategy_dmg: 0.25 } },
  5: { id: 'ridge', name: '山险', desc: '敌军减伤 +15%', effect: { dr: 0.15 } },
  6: { id: 'navy', name: '水寨', desc: '敌军减伤 +12%，我方速度 -8%', effect: { dr: 0.12 }, playerEffect: { speed: -0.08 } },
  7: { id: 'fort', name: '坚壁', desc: '敌军减伤 +18%，兵力 +10%', effect: { dr: 0.18, hp: 0.10 } },
};
function chapterMech(lv) {
  if (!lv) return null;
  const local = lv.id % 10 === 0 ? 10 : lv.id % 10;
  if (local !== 3 && local !== 7) return null;
  return CHAPTER_MECHS[lv.volume || 1] || null;
}

function renderLevelInfo() {
  const box = $('#levelInfo');
  const lv = S.levelData;
  if (!lv) {
    box.innerHTML = '选择关卡；敌军阵容固定，通关解锁下一关。';
    const tb = $('#toFormation'); if (tb) { tb.disabled = true; tb.textContent = '请先选择关卡'; }
    const sb = $('#sweepBtn'); if (sb) { sb.disabled = true; sb.textContent = '通关后可扫荡'; }
    return;
  }
  const tb = $('#toFormation'); if (tb) { tb.disabled = false; tb.textContent = '进入编队'; }
  const sb = $('#sweepBtn');
  if (sb) {
    const cleared = (S.progress.stars || {})[lv.id] > 0;
    sb.disabled = !cleared;
    sb.textContent = cleared ? '一键扫荡' : '通关后可扫荡';
  }
  const c = lv.config;
  const chips = lv.enemies.map(e => `<span class="enemy-chip">
      <span class="ph" style="background-image:url('${pthumb(e.name)}')"></span>
      <span><span class="en">${esc(e.name)}</span><br><span class="er">${esc(e.rarity)} · ${esc(e.role)} · ${esc((S.by[e.name] || {}).troop || e.troop || '')}</span></span>
    </span>`).join('');
  const drops = (lv.drops || []).map(d => `${d.item} ${Math.round(d.chance * 100)}%`).join('、');
  const rewardLine = lv.first
    ? `首通：${fmtRewards(lv.first)}<br>重复：${fmtRewards(lv.repeat)}${drops ? ' · 掉落：' + drops : ''}`
    : '';
  const stage = lv.id <= 10 ? `${esc(lv.name)}（${esc(lv.sub)}）` : `${esc(lv.chapter_name)}（${esc(lv.sub)}）`;
  const mod = levelModifier(lv.id);
  const mech = chapterMech(lv);
  box.innerHTML = `<b>第 ${lv.id} 关 · 第${lv.volume}卷 ${esc(lv.volume_name)} · 第${lv.chapter}章 ${stage}</b><br>${esc(lv.desc)}<br>
    敌军 Lv${c.level} · 推荐战力 ${lv.power}<br>
    <span class="level-mod">关卡词条：<b>${esc(mod.name)}</b>（${esc(mod.desc)}）</span>
    ${mech ? `<br><span class="level-mech">章法 · <b>${esc(mech.name)}</b>（${esc(mech.desc)}）</span>` : ''}
    ${rewardLine ? '<br>' + rewardLine : ''}
    <div class="enemies">${chips}</div>`;
}

function selectLevel(id) {
  const lv = S.levels.find(x => x.id === id);
  if (!lv) return;
  if (id > S.progress.unlocked) { flash('先通关上一关'); return; }
  S.mode = 'level';
  S.levelId = id;
  S.volume = lv.volume; S.chapter = lv.chapter;
  S.levelData = lv;
  S.bLocked = true;
  S.b = lv.enemies.map(e => e.name);
  syncPlayerLevel();
  saveFormation();
  renderConfig();
  renderVolumeTabs();
  renderChapterTabs();
  renderLevels();
  renderLevelInfo();
  renderTeams();
  renderPool();
  flash(`已载入第 ${id} 关：${lv.name}`);
}

/* ---------- 一键扫荡（主线 / 副本 / 将星塔 / 上古 / 秘境） ---------- */
const SWEEP_COST = 6;
function sweepTarget() {
  const sw = S.sweep || {};
  if (sw.mode === 'level') return { mode: 'level', lv: S.levelData };
  if (sw.mode === 'dungeon') return { mode: 'dungeon', d: S.dungeons.find(x => x.id === sw.id) };
  if (sw.mode === 'tower') return { mode: 'tower', floor: S.tower.floor || 1, data: S.towerFloors[(S.tower.floor || 1) - 1] };
  if (sw.mode === 'ancient') return { mode: 'ancient', d: S.ancient.find(x => x.id === sw.id) };
  if (sw.mode === 'secret') return { mode: 'secret', floor: S.secret.active ? (S.secret.floor || 1) : 1 };
  return null;
}
function sweepCap(mode) {
  return mode === 'tower' ? 10 : mode === 'ancient' ? 20 : mode === 'secret' ? 10 : 50;
}
function sweepCost(t) {
  if (!t) return 0;
  if (t.mode === 'level') return SWEEP_COST;
  if (t.mode === 'dungeon') return (t.d && t.d.stamina) || 12;
  if (t.mode === 'secret') return 10;
  return 0;
}
function sweepRemaining(t) {
  if (!t) return 0;
  if (t.mode === 'tower') return Infinity;   // 无限塔
  if (t.mode === 'secret') return 11 - (t.floor || 1);
  return 999;
}
function sweepUnit(t) { return t && (t.mode === 'tower' || t.mode === 'secret') ? '层' : '次'; }
function sweepEligible(t) {
  if (!t) return '请先选择战斗';
  if (t.mode === 'level') {
    if (!t.lv) return '请先选择关卡';
    if (!((S.progress.stars || {})[t.lv.id] > 0)) return '通关后才能扫荡';
  }
  if (t.mode === 'dungeon') {
    if (!t.d) return '副本不存在';
    if (!S.clears['dungeon:' + t.d.id]) return '首次通关后可扫荡';
    if (teamCount() < 5) return '副本需要 5 人编队';
  }
  if (t.mode === 'ancient') {
    if (!t.d) return '上古阶段不存在';
    if (!S.clears['ancient:' + t.d.id]) return '首次通关后可扫荡';
    if (teamCount() < 8) return '上古需要 8 人编队';
  }
  if (t.mode === 'tower') {
    if (!t.data) return '塔层数据载入中，请稍候再试';
    if (teamCount() < 5) return '将星塔需要 5 人编队';
  }
  if (t.mode === 'secret') {
    if (!t.floor || t.floor > 10) return '秘境已通关';
    if (teamCount() < 3) return '秘境需要至少 3 名武将';
  }
  return '';
}
function sweepTitle(t) {
  if (t.mode === 'level') return `一键扫荡 · 第 ${t.lv.id} 关 ${t.lv.name}`;
  if (t.mode === 'dungeon') return `扫荡副本 · ${t.d.cat} · ${t.d.difficulty}`;
  if (t.mode === 'tower') return `扫荡将星塔 · 第 ${t.floor} 层起`;
  if (t.mode === 'ancient') return `扫荡上古 · ${t.d.beast} 第 ${t.d.stage} 阶段`;
  if (t.mode === 'secret') return `扫荡秘境 · 第 ${t.floor} 层起`;
  return '一键扫荡';
}
function sweepInfo(t, max) {
  const cost = sweepCost(t);
  const costLine = cost ? `每次消耗 <b>${cost}</b> 体力` : '本次扫荡不消耗体力';
  const u = sweepUnit(t);
  if (t.mode === 'level') {
    const drops = (t.lv.drops || []).map(d => `${d.item} ${Math.round(d.chance * 100)}%`).join('、');
    return `已通关，扫荡不进入战斗。<br>${costLine} · 当前可扫荡 <b>${max}</b> ${u}<br>
      单次：${esc(fmtRewards(t.lv.repeat || {}))}${drops ? `<br>概率掉落：${esc(drops)}` : ''}<br>
      <span class="sweep-note">扫荡中触发奇遇会自动选择并结算。</span>`;
  }
  if (t.mode === 'dungeon') {
    return `${costLine} · 当前可扫荡 <b>${max}</b> ${u}<br>单次：${esc(fmtRewards(t.d.reward || {}))}<br>
      <span class="sweep-note">直接结算材料，不进入战斗。</span>`;
  }
  if (t.mode === 'tower') {
    return `从第 <b>${t.floor}</b> 层起自动推进，每层自动选择增益后结算。<br>
      本次可扫荡 <b>${max}</b> 层 · 当前奖励第 <b>${t.data.tier || Math.floor((t.floor - 1) / 10) + 1}</b> 阶<br>
      本层：${esc(fmtRewards(t.data.reward || {}))}<br>
      <span class="sweep-note">无体力消耗；一次最多扫 10 层。每 10 层奖励升阶，每 100 层开启新奖励。</span>`;
  }
  if (t.mode === 'ancient') {
    return `首次通关后可扫荡，直接结算奖励。<br>本次可扫荡 <b>${max}</b> ${u}<br>
      单次：${esc(fmtRewards(t.d.reward || {}))}<br><span class="sweep-note">需 8 人编队。</span>`;
  }
  if (t.mode === 'secret') {
    return `从当前路线起自动推进：每层自动选择战斗节点并自动选择祝福；事件/招募/商店/遗物节点不参与扫荡。<br>
      ${costLine} · 本次可扫荡 <b>${max}</b> 层<br>
      <span class="sweep-note">秘境币、铜钱按层结算；第 10 层后秘境结束。</span>`;
  }
  return '';
}
/* 版本诊断信标：服务端只把它记进访问日志，用于排查旧缓存页面 */
function appBuildVer() {
  const s = [...document.scripts].map(x => x.src || '').find(x => x.includes('app.js?v='));
  return s ? s.split('app.js?v=')[1].split('&')[0] : '';
}
function sweepPing(ev) {
  try { fetch('/api/ping?ev=' + ev + '&v=' + encodeURIComponent(appBuildVer()), { cache: 'no-store' }); } catch (e) { /* ignore */ }
}
window.addEventListener('error', (ev) => {
  try { sweepPing('js-error-' + encodeURIComponent(String(ev.message || 'err').slice(0, 150))); } catch (e) { /* ignore */ }
});
window.addEventListener('unhandledrejection', (ev) => {
  try {
    const r = ev.reason;
    sweepPing('js-reject-' + encodeURIComponent(String((r && (r.stack || r.message)) || r || 'rej').slice(0, 150)));
  } catch (e) { /* ignore */ }
});
function openSweepFor(mode, id) {
  S.sweep = { mode, id, count: 0 };
  const t = sweepTarget();
  const err = sweepEligible(t);
  if (err) { S.sweep = null; flash(err); return; }
  const cost = sweepCost(t);
  const max = Math.min(sweepCap(mode), sweepRemaining(t),
    cost ? Math.floor((S.stamina.value || 0) / cost) : Infinity);
  if (max < 1) { S.sweep = null; flash(cost ? '体力不足' : '当前无可扫荡次数'); return; }
  S.sweep.count = Math.min(10, max);
  $('#sweepTitle').textContent = sweepTitle(t);
  $('#sweepLog').innerHTML = '';
  $('#sweepGain').innerHTML = '';
  renderSweepModal();
  $('#sweepModal').hidden = false;
  const lb = $('#lootBanner'); if (lb) lb.hidden = true;
  sweepPing('sweep-open');
}
function openSweep() { openSweepFor('level'); }
function renderSweepModal() {
  const t = sweepTarget();
  if (!t || !S.sweep) return;
  const cost = sweepCost(t);
  const max = Math.min(sweepCap(S.sweep.mode), sweepRemaining(t),
    cost ? Math.floor((S.stamina.value || 0) / cost) : Infinity);
  if (max < 1) { $('#sweepStart').disabled = true; return; }
  if (!S.sweep.count || S.sweep.count > max) S.sweep.count = Math.min(10, max);
  $('#sweepInfo').innerHTML = sweepInfo(t, max);
  const opts = [...new Set([1, 5, 10, 20, 50, max].filter(n => n >= 1 && n <= max))].sort((a, b) => a - b);
  $('#sweepCounts').innerHTML = opts.map(n =>
    `<button class="chip${S.sweep.count === n ? ' active' : ''}" data-sweep-n="${n}">${n} ${sweepUnit(t)}</button>`).join('');
  $('#sweepCounts').querySelectorAll('[data-sweep-n]').forEach(b => {
    b.onclick = () => { S.sweep.count = Number(b.dataset.sweepN); renderSweepModal(); };
  });
  $('#sweepStart').disabled = false;
  $('#sweepStart').textContent = `扫荡 ${S.sweep.count} ${sweepUnit(t)}${cost ? `（体力 ${S.sweep.count * cost}）` : ''}`;
}
function sweepGainHtml(totals) {
  // 体力属于消耗，不算战利品；日志里仍会显示奇遇的体力增减
  const entries = Object.entries(totals).filter(([k, v]) => v && k !== 'stamina' && k !== '体力');
  if (!entries.length) return '';
  // 资源在前，特殊物品（技能书/战法书/秘宝等）在后，便于一眼看清战利品
  const rank = k => k.startsWith('技能书·') || k.startsWith('战法书·') || k.startsWith('秘宝·') ? 1 : 0;
  entries.sort((a, b) => rank(a[0]) - rank(b[0]));
  const kinds = entries.filter(([, v]) => v > 0).length;
  return `<div class="sg-title">本次战利品<span class="sg-total">共 ${kinds} 种</span></div><div class="sg-grid">${entries.map(([k, v]) => {
    let type = null;
    if (k.startsWith('技能书·')) type = 'skillBook';
    else if (k.startsWith('战法书·')) type = 'tacticBook';
    else if (k.startsWith('秘宝·')) type = 'relic';
    else if (k === '神器碎片') type = 'shard';
    else if (ARTIFACTS[k]) type = 'artifact';
    const meta = type ? itemShort(type, k) : { name: k, tier: '' };
    const icon = type === 'skillBook' ? '书' : type === 'tacticBook' ? '法'
      : type === 'relic' ? '宝' : type === 'shard' ? '碎'
        : type === 'artifact' ? '器' : (RES_ICON[k] || '物');
    const tier = (type === 'skillBook' || type === 'tacticBook') ? `<small>${esc(meta.tier)}</small>` : '';
    const label = type === 'skillBook' ? `技能书·${meta.name}`
      : type === 'tacticBook' ? `战法书·${meta.name}` : meta.name;
    return `<div class="sg-item${v < 0 ? ' neg' : ''}" title="${esc(k)}">
      <i class="seal" data-ch="${icon}"></i><b>${esc(label)}${tier}</b><em>${v > 0 ? '+' : ''}${v}</em></div>`;
  }).join('')}</div>`;
}

let lastSweepGain = null;
/* 结算战利品横幅：独立于扫荡弹窗，关闭弹窗后仍能看到本次收益 */
function showLootBanner(totals, done, unit) {
  const el = $('#lootBanner');
  if (!el) return;
  const html = sweepGainHtml(totals);
  if (!html) { el.hidden = true; return; }
  el.innerHTML = `<button class="lb-close" aria-label="关闭">×</button>${html}` +
    `<div class="lb-note">扫荡 ${done} ${unit} · 已计入资源与背包，点 × 关闭</div>`;
  el.hidden = false;
  const close = el.querySelector('.lb-close');
  if (close) close.onclick = () => { el.hidden = true; };
  clearTimeout(showLootBanner._t);
  showLootBanner._t = setTimeout(() => { el.hidden = true; }, 15000);
}
/* 关闭扫荡弹窗后，把本次战利品用横幅再展示一次 */
function showLastSweepLoot() {
  if (!lastSweepGain) return;
  const { totals, done, unit } = lastSweepGain;
  lastSweepGain = null;
  showLootBanner(totals, done, unit);
}

function doSweep() {
  sweepPing('sweep-run');
  try {
    doSweepInner();
  } catch (e) {
    const msg = String((e && (e.stack || e.message)) || e).slice(0, 180);
    sweepPing('sweep-error-' + encodeURIComponent(msg));
    throw e;
  }
}
function doSweepInner() {
  const t = sweepTarget();
  if (!t || !S.sweep) return;
  const cost = sweepCost(t);
  const unit = sweepUnit(t);
  const totals = {}, logs = [];
  let done = 0, encounters = 0;
  const want = S.sweep.count || 0;
  for (let i = 1; i <= want; i++) {
    if (cost && !spendStamina(cost)) break;
    let r = {}, line = '';
    if (t.mode === 'level') {
      r = grantRewards(t.lv, false);
      taskBump('battle'); taskBump('win');
      const enc = autoResolveEncounter();
      if (enc) {
        encounters += 1;
        for (const [k, v] of Object.entries(enc.effect || {})) totals[k] = (totals[k] || 0) + v;
        line = `${fmtRewards(r)} ｜ 奇遇「${enc.title}」→ ${enc.choice}：${fmtRewards(enc.effect)}`;
      } else line = fmtRewards(r);
    } else if (t.mode === 'dungeon') {
      r = t.d.reward || {};
      addReward(r); taskBump('battle'); taskBump('win');
      line = fmtRewards(r);
    } else if (t.mode === 'tower') {
      const floor = S.tower.floor || 1;
      const fd = S.towerFloors[floor - 1];
      if (!fd) break;
      const capBefore = staminaCap();
      r = fd.reward || {};
      addReward(r);
      const buffs = fd.buffs || [];
      const buff = buffs.length ? buffs[Math.floor(Math.random() * buffs.length)] : null;
      S.tower.best = Math.max(S.tower.best || 1, floor);
      S.tower.floor = floor + 1;
      saveTower();
      notifyStaminaGrowth(capBefore);
      taskBump('battle'); taskBump('win'); taskBump('tower');
      const mark = fd.milestone ? '（百层里程碑 · 新奖励开启）' : (floor % 10 === 0 ? '（奖励升阶）' : '');
      line = `第 ${floor} 层${buff ? `（增益：${buff.name}）` : ''}：${fmtRewards(r)}${mark}`;
    } else if (t.mode === 'ancient') {
      r = t.d.reward || {};
      addReward(r);
      S.clears['ancient:' + t.d.id] = true; saveClears();
      S.season.ancientCleared = true; saveSeason();
      taskBump('battle'); taskBump('win');
      line = `${t.d.beast} 第 ${t.d.stage} 阶段：${fmtRewards(r)}`;
    } else if (t.mode === 'secret') {
      let s = S.secret;
      if (!s || !s.active) {
        S.secret = { active: true, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false,
          temp: [], relics: [], used: {}, map: buildSecretMap(), mapPos: { layer: -1, index: -1 },
          nodeLayer: 0, nodeIndex: 0, activeShop: null, pendingNode: null };
        s = S.secret;
      }
      ensureSecretMap();
      const nextLayer = s.mapPos.layer + 1;
      if (nextLayer > 9) break;
      const layer = s.map && s.map[nextLayer];
      const idxs = secretAvailableIndexes(nextLayer);
      const node = layer && layer.nodes.find((n, i) => idxs.includes(i) && ['battle', 'elite', 'boss'].includes(n.type));
      if (!node) break;
      r = node.reward || {};
      addReward(r);
      const fd = (S.secretFloors || [])[nextLayer] || {};
      const bs = fd.blessings || [];
      const blessing = bs.length ? bs[Math.floor(Math.random() * bs.length)] : null;
      if (blessing) s.buffs.push({ effect: blessing.effect }, { effect: blessing.curse });
      s.mapPos = { layer: nextLayer, index: node.idx };
      s.floor = nextLayer + 2;
      s.used = {};
      s.node = null; s.shopBought = false;
      if (nextLayer >= 9) { s.active = false; s.floor = 11; s.buffs = []; s.temp = []; s.relics = []; }
      saveSecret();
      taskBump('battle'); taskBump('win');
      line = `第 ${nextLayer + 1} 层·${node.name || '遭遇战'}${blessing ? `（祝福：${blessing.name}）` : ''}：${fmtRewards(r)}`;
    }
    for (const k in r) totals[k] = (totals[k] || 0) + r[k];
    logs.push(`第 ${i} ${unit}：${line}`);
    done += 1;
  }
  // 先渲染战利品，任何后续刷新出错都不能影响结算展示
  const gain = $('#sweepGain');
  const gainKinds = Object.values(totals).filter(v => v > 0).length;
  try {
    gain.innerHTML = sweepGainHtml(totals);
  } catch (e) {
    gain.textContent = Object.entries(totals).filter(([, v]) => v)
      .map(([k, v]) => `${k} +${v}`).join('　');
    sweepPing('gain-error-' + encodeURIComponent(String((e && e.message) || e).slice(0, 120)));
  }
  $('#sweepLog').innerHTML = `<div class="sweep-total">扫荡 ${done} ${unit}${gainKinds ? ` · 战利品 ${gainKinds} 种` : ''}${encounters ? ` · 自动处理奇遇 ${encounters} 次` : ''}</div>` +
    logs.map(x => `<div class="sweep-line">${esc(x)}</div>`).join('');
  // 结算后弹窗必须留在屏幕上显示战利品（防御性：任何情况下不被关掉）
  $('#sweepModal').hidden = false;
  const box = document.querySelector('#sweepModal .sweep-box');
  if (box && gain) {
    const top = gain.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo(0, Math.max(0, top));
  }
  $('#sweepStart').disabled = true;
  lastSweepGain = (done && gainKinds) ? { totals, done, unit } : null;
  const snapshot = lastSweepGain;
  setTimeout(() => {
    if (snapshot && $('#sweepModal').hidden) {
      lastSweepGain = null;
      showLootBanner(snapshot.totals, snapshot.done, snapshot.unit);
    }
  }, 400);
  flash(done ? `扫荡完成：${done} ${unit} · app z53` : '体力不足，未执行扫荡');
  sweepPing('sweep-done-' + done);
  // 界面刷新放在战利品渲染之后，且单独兜底，避免某一步出错导致“看不到战利品”
  try {
    if (t.mode === 'level' && done) chapterSweepResult(t.lv, done, S.a);
    renderWallet(); renderStamina(); renderLevelInfo();
    if (t.mode === 'tower') renderTower();
    if (t.mode === 'dungeon') renderDungeons();
    if (t.mode === 'ancient') renderAncient();
    if (t.mode === 'secret') renderSecret();
    if (S.screen === 'quest') renderQuestScreen();
  } catch (e) {
    sweepPing('post-error-' + encodeURIComponent(String((e && (e.stack || e.message)) || e).slice(0, 180)));
  }
}

function exitLevel() {
  S.mode = 'none';
  S.levelId = null;
  S.levelData = null;
  S.bLocked = false;
  S.b = [];
  syncPlayerLevel();
  saveFormation();
  renderConfig();
  renderVolumeTabs();
  renderChapterTabs();
  renderLevels();
  renderLevelInfo();
  renderTeams();
  renderPool();
  flash('已退出关卡');
  showScreen('campaign');
}

function cfgMult() {
  const c = S.config;
  return (1 + 0.08 * c.bt) * (1 + 0.05 * c.aw) * (1 + 0.15 * c.equip);
}

function thumb(name) { return `${SG_IMG.thumb(name)}`; }
function pthumb(name) { return `${SG_IMG.pthumb(name)}`; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 音频：WebAudio 程序合成，无需外部素材；音量滑杆实时生效 */
const AudioSys = (() => {
  const NOTE = { D3: 146.83, F3: 174.61, G3: 196.0, A3: 220.0, D4: 293.66, F4: 349.23, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, A5: 880.0 };
  const MELODY = ['D4', 'A4', 'F4', 'G4', 'A4', null, 'F4', 'D4', 'G4', 'A4', 'C5', 'A4', 'G4', 'F4', 'D4', null];
  const BASS = ['D3', 'D3', 'F3', 'F3', 'G3', 'G3', 'A3', 'A3'];
  const STEP = 0.42;
  let ctx = null, bgmGain = null, sfxGain = null, timer = null, step = 0, nextAt = 0, started = false;
  let bgmVol = 0.6, sfxVol = 0.8;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    bgmGain = ctx.createGain(); bgmGain.gain.value = bgmVol * 0.16; bgmGain.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol * 0.5; sfxGain.connect(ctx.destination);
    return ctx;
  }
  function tone(freq, when, dur, vol, dest, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.05);
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    const ahead = ctx.currentTime + 0.2;
    while (nextAt < ahead) {
      const name = MELODY[step % MELODY.length];
      if (name) tone(NOTE[name], nextAt, 0.75, 0.5, bgmGain, 'triangle');
      if (step % 4 === 0) tone(NOTE[BASS[(step / 4 | 0) % BASS.length]], nextAt, 1.6, 0.32, bgmGain, 'sine');
      nextAt += STEP;
      step++;
    }
  }
  function unlock() {
    if (!ensure() || started) return;
    started = true;
    nextAt = ctx.currentTime + 0.15;
    step = 0;
    timer = setInterval(tick, 80);
  }
  function play(kind) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    if (kind === 'seal') tone(392.0, t, 0.16, 0.1, sfxGain, 'sine');
    else if (kind === 'chime') { tone(NOTE.A4, t, 0.3, 0.12, sfxGain, 'triangle'); tone(NOTE.E5, t + 0.07, 0.4, 0.1, sfxGain, 'triangle'); }
    else if (kind === 'win') {
      tone(NOTE.D4, t, 0.22, 0.16, sfxGain, 'triangle');
      tone(NOTE.A4, t + 0.12, 0.22, 0.16, sfxGain, 'triangle');
      tone(NOTE.D5, t + 0.24, 0.5, 0.18, sfxGain, 'triangle');
    } else if (kind === 'lose') {
      tone(NOTE.A4, t, 0.3, 0.14, sfxGain, 'sine');
      tone(NOTE.F4, t + 0.16, 0.3, 0.13, sfxGain, 'sine');
      tone(NOTE.D4, t + 0.32, 0.6, 0.15, sfxGain, 'sine');
    } else if (kind === 'pull') {
      ['D4', 'F4', 'A4', 'C5', 'D5'].forEach((k, i) => tone(NOTE[k], t + i * 0.055, 0.5, 0.12, sfxGain, 'triangle'));
    } else tone(784.0, t, 0.09, 0.09, sfxGain, 'triangle');
  }
  function setBgm(v) {
    bgmVol = Math.max(0, Math.min(100, v)) / 100;
    if (bgmGain && ctx) bgmGain.gain.setTargetAtTime(bgmVol * 0.16, ctx.currentTime, 0.05);
  }
  function setSfx(v) {
    sfxVol = Math.max(0, Math.min(100, v)) / 100;
    if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(sfxVol * 0.5, ctx.currentTime, 0.05);
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && started && ctx.state === 'suspended') ctx.resume(); }
  return { unlock, play, setBgm, setSfx, suspend, resume, getCtx: () => ctx, getBus: () => sfxGain };
})();
window.AudioSys = AudioSys;

async function init() {
  const [ru, rl, rt, rd, rs, ra, rb, rtr, rwb] = await Promise.all([fetch('/api/units'), fetch('/api/levels'),
    fetch('/api/tower'), fetch('/api/dungeons'), fetch('/api/secret'), fetch('/api/ancient'),
    fetch('/api/bonds'), fetch('/api/trials'), fetch('/api/worldboss')]);
  S.units = await ru.json();
  S.levels = await rl.json();
  S.towerFloors = await rt.json();
  S.dungeons = await rd.json();
  S.secretFloors = await rs.json();
  S.ancient = await ra.json();
  S.bondDefs = await rb.json();
  S.trials = await rtr.json();
  S.worldBossData = await rwb.json();
  S.units.forEach(u => S.by[u.name] = u);
  buildItemPools();
  loadConfig();
  loadProgress();
  loadClears();
  syncPlayerLevel();
  loadInventory();
  loadUnitProgress();
  migrateEquipAffixes();
  loadOwned();
  loadCodexGift();
  loadArtifactLv();
  syncCodexGifts();
  loadGacha();
  loadTower();
  const freshSave = !localStorage.getItem('sg_progress') && !localStorage.getItem('sg_owned');
  loadStamina();
  loadNewbie(freshSave);
  loadSecret();
  loadSeason();
  loadShopStock();
  loadTrialState();
  loadWorldBossState();
  loadExpedition();
  loadSurvival();
  loadAchieve();
  loadAffinity();
  loadMeta();
  syncViewToProgress();
  loadFormation();
  loadAncientRun();
  $('#status').textContent = '星命既定';
  renderFilters();
  renderPool();
  renderVolumeTabs();
  renderChapterTabs();
  renderLevels();
  renderLevelInfo();
  renderTeams();
  renderConfig();
  renderWallet();
  initGrowthSelect();
  renderGrowth();
  bind();
  initMetaUI();
  setupMenu();
  if (window.HeroShow) HeroShow.setQuality(localStorage.getItem('sg_quality') || 'hd');
}

function renderConfig() {
  syncPlayerLevel();
}
function hasSave() {
  return !!(localStorage.getItem('sg_progress') || localStorage.getItem('sg_owned') || localStorage.getItem('sg_units'));
}

function setupMenu() {
  const art = $('#menuArt');
  const names = ['吕布', '关羽', '诸葛亮', '曹操', '周瑜', '孙尚香'];
  art.innerHTML = names.map(n => `<div class="art" style="background-image:url('${SG_IMG.pthumb(n)}')"></div>`).join('');
  $('#continueBtn').hidden = !hasSave();
  $('#newBtn').textContent = hasSave() ? '新的征程' : '开始游戏';
  $('#newBtn').classList.toggle('menu-primary', !hasSave());
  $('#menuFoot').textContent = (hasSave() ? '检测到本地存档 · 自动保存' : '暂无存档 · 从第一卷开始');
}

function startGame(newGame) {
  if (newGame) resetGame();
  S.started = true;
  S.ended = false;
  $('#startMenu').hidden = true;
  showScreen('home');
  maybeTutorial();
}

function resetGame() {
  S.progress = { unlocked: 1, stars: {} };
  S.clears = {};
  S.inventory = { ...START_RES };
  localStorage.removeItem('sg_testgrant_20261120');
  S.stamina = { value: STAMINA_START, last: Date.now(), claimDate: '', claims: [false, false] };
  saveStamina();
  startNewbie();
  S.secret = { active: false, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false, temp: [], relics: [], used: {}, map: null, mapPos: { layer: -1, index: -1 }, nodeLayer: 0, nodeIndex: 0, activeShop: null, pendingNode: null };
  S.season = defaultSeason(); S.season.no = seasonMeta().no;
  S.owned = STARTERS.slice();
  S.codexGift = [];
  saveCodexGift();
  syncCodexGifts();
  S.gacha = { normal: { legend: 0, myth: 0, total: 0 }, limited: { legend: 0, myth: 0, total: 0 }, faction: { legend: 0, myth: 0, total: 0 }, newbie: { legend: 0, myth: 0, total: 0 }, event: { legend: 0, myth: 0, total: 0 } };
  S.tower = { floor: 1, best: 1 };
  S.towerBuff = null; S.towerData = null; S.towerBuffData = null;
  S.recruitPool = 'normal';
  S.shopStock = {};
  S.unitProgress = {};
  resetMeta();
  S.a = []; S.b = []; S.support = []; S.levelId = null; S.levelData = null;
  S.ancientRun = null; S.ancientPhase = 1; try { localStorage.removeItem('sg_ancientrun'); } catch (e) {}
  S.trialData = null; S.trialState = { date: (S.trials && S.trials.date) || '', week: (S.trials && S.trials.week) || '', done: {} };
  S.achieve = { claimed: [], milestones: [], collection: [], title: '', stats: { battles: 0, wins: 0, trials: 0, weekly: 0, decomposes: 0, bondKinds: [] }, records: { maxDamage: 0, fastestTower: 0 } }; saveAchieve();
  S.affinity = {}; S.personalData = null; S.personalName = null; saveAffinity();
  S.worldBoss = { date: (S.worldBossData && S.worldBossData.date) || '', best: 0, bestPct: 0, claimed: [] }; saveWorldBossState();
  S.expedition = { slots: [null, null, null] }; saveExpedition();
  S.survival = { active: false, wave: 1, seed: 0, upgrades: [], pending: [], best: 0, milestones: [] }; saveSurvival();
  S.mode = 'none'; S.bLocked = false; S.manual = false; S.ending = false;
  S.config = { level: 1, bt: 0, aw: 0, equip: 0 }; syncPlayerLevel();
  S.volume = 1; S.chapter = 1;
  saveProgress(); saveClears(); saveInventory(); saveUnitProgress(); saveFormation(); saveConfig(); saveOwned(); saveGacha(); saveTower(); saveStamina(); saveSecret(); saveSeason(); saveShopStock();
  renderWallet(); renderTeams(); renderPool(); renderLevels(); renderLevelInfo(); renderConfig(); renderGrowth();
  showScreen('home');
}

function addReward(reward) {
  for (const k in reward) S.inventory[k] = (S.inventory[k] || 0) + reward[k];
  saveInventory(); renderWallet();
}

function challengeDungeon(id) {
  const d = S.dungeons.find(x => x.id === id);
  if (!d) return;
  S.mode = 'dungeon'; S.dungeonData = d; S.levelData = null; S.levelId = null;
  S.bLocked = true; S.b = d.enemies.slice();
  saveFormation();
  showScreen('formation');
  flash(`副本：${d.cat}·${d.difficulty}`);
}

function renderDungeons() {
  const box = $('#dungeonGrid');
  if (!box) return;
  box.innerHTML = '';
  const cats = [...new Set(S.dungeons.map(x => x.cat))];
  cats.forEach(cat => {
    const list = S.dungeons.filter(x => x.cat === cat).sort((a, b) => a.id - b.id);
    const d = document.createElement('div'); d.className = 'dungeon-card';
    const first = list[0];
    d.innerHTML = `<div class="dc-head"><div class="dc-ico">${esc(String(cat).slice(0, 1))}</div>
        <div class="dc-name">${esc(cat)}</div></div>
      <div class="dc-sub">产出 ${esc(first.material)} · 体力 12</div><div class="dc-btns"></div>`;
    const btns = d.querySelector('.dc-btns');
    list.forEach(it => {
      const wrap = document.createElement('span'); wrap.className = 'dc-pair';
      const b = document.createElement('button');
      b.textContent = it.difficulty;
      b.title = `推荐 Lv${it.config.level} · ${it.reward[it.material]} ${it.material}`;
      b.onclick = () => challengeDungeon(it.id);
      const s = document.createElement('button');
      s.className = 'mini ghost'; s.textContent = '扫';
      const cleared = !!S.clears['dungeon:' + it.id];
      s.disabled = !cleared;
      s.title = cleared ? `扫荡副本 · ${it.difficulty}` : '首次通关后可扫荡';
      s.onclick = () => openSweepFor('dungeon', it.id);
      wrap.append(b, s); btns.appendChild(wrap);
    });
    box.appendChild(d);
  });
}

/* ---------------- 秘境强化：遗物 / 临时招募 / 事件结点 ---------------- */
function buildSecretMap() {
  const layers = [];
  for (let f = 0; f < 10; f++) {
    const fd = (S.secretFloors || [])[f] || {};
    const src = (fd.nodes || []).slice();
    const battle = src.find(n => n.type === 'battle') || { type: 'battle', name: '遭遇战', enemies: fd.enemies || [], config: fd.config || {}, reward: fd.reward || {} };
    const elite = src.find(n => n.type === 'elite') || battle;
    const specials = src.filter(n => ['shop', 'event', 'recruit', 'relic'].includes(n.type));
    let nodes;
    if (f === 9) {
      nodes = [{ ...elite, type: 'boss', name: '秘境首领', desc: '最终首领，击败即通关' }];
    } else {
      nodes = [
        { ...(specials[0] || battle) },
        { ...battle },
        { ...elite },
      ];
    }
    nodes.forEach((n, i) => { n.layer = f; n.idx = i; });
    layers.push({ floor: f + 1, nodes });
  }
  return layers;
}
function ensureSecretMap() {
  const s = S.secret;
  if (!s) return;
  if (!Array.isArray(s.map) || s.map.length !== 10) {
    s.map = buildSecretMap();
    s.mapPos = { layer: -1, index: -1 };
    if (s.active && (s.floor || 1) > 1) {
      const done = Math.min(8, (s.floor || 1) - 2);
      s.mapPos = { layer: done, index: 1 };
    }
  }
  if (!s.mapPos || typeof s.mapPos.layer !== 'number') s.mapPos = { layer: -1, index: -1 };
}
function secretNextLayer() { return (S.secret.mapPos ? S.secret.mapPos.layer : -1) + 1; }
function secretAvailableIndexes(layerIdx) {
  const s = S.secret;
  const mp = s.mapPos || { layer: -1, index: -1 };
  if (layerIdx !== mp.layer + 1) return [];
  const layer = s.map && s.map[layerIdx];
  if (!layer) return [];
  if (layer.nodes.length === 1) return [0];
  const out = [];
  layer.nodes.forEach((n, i) => {
    if (mp.layer < 0 || Math.abs(i - mp.index) <= 1) out.push(i);
  });
  return out;
}
function secretAdvanceNode(n) {
  const s = S.secret;
  if (!n) return;
  s.mapPos = { layer: n.layer, index: n.idx };
  s.floor = n.layer + 2;
  s.node = null;
  s.activeEvent = null;
  s.activeRecruit = null;
  s.activeShop = null;
  s.pendingNode = null;
  s.needBlessing = false;
  s.shopBought = false;
  if (n.layer >= 9) {
    s.active = false;
    s.floor = 11;
    s.buffs = []; s.temp = []; s.relics = [];
  }
  saveSecret();
  renderSecret();
}
function enemyChip(n) {
  const u = S.by[n];
  return `<span class="enemy-chip"><span class="ph" style="background-image:url('${pthumb(n)}')"></span>
    <span><span class="en">${esc(n)}</span><br><span class="er">${esc(u ? u.rarity + ' · ' + u.role + ' · ' + u.troop : '')}</span></span></span>`;
}
function pickSecretNode(n) {
  const s = S.secret;
  if (!n) return;
  const mp = s.mapPos || { layer: -1, index: -1 };
  if (n.layer !== mp.layer + 1) { flash('该节点不在当前路线上'); return; }
  const _lyr = s.map && s.map[n.layer];
  if (mp.layer >= 0 && !(_lyr && _lyr.nodes.length === 1) && Math.abs(n.idx - mp.index) > 1) {
    flash('该节点不在当前路线上'); return;
  }
  if (n.type === 'event') {
    s.activeEvent = n.event || null;
    s.activeRecruit = null;
    s.activeShop = null;
    s.pendingNode = n;
    saveSecret(); renderSecret();
    return;
  }
  if (n.type === 'recruit') {
    s.activeRecruit = n;
    s.activeEvent = null;
    s.activeShop = null;
    s.pendingNode = n;
    saveSecret(); renderSecret();
    return;
  }
  if (n.type === 'shop') {
    s.activeShop = n;
    s.activeEvent = null;
    s.activeRecruit = null;
    s.pendingNode = n;
    saveSecret(); renderSecret();
    return;
  }
  if (n.type === 'relic') {
    addSecretRelic(n.relic);
    secretAdvanceNode(n);
    return;
  }
  s.node = n;
  s.nodeLayer = n.layer;
  s.nodeIndex = n.idx;
  s.activeEvent = null; s.activeRecruit = null; s.activeShop = null;
  saveSecret(); renderSecret();
}

function renderSecret() {
  const s = S.secret || { active: false, floor: 1, buffs: [], needBlessing: false, temp: [], relics: [], used: {} };
  const info = $('#secretInfo'), bbox = $('#secretBlessings'), eb = $('#secretEnemies'), btn = $('#secretStart');
  if (!info) return;
  if (!s.active) {
    const fd = (S.secretFloors || [])[0];
    info.innerHTML = `<b>秘境 · 十层分支地图</b><br>
      带 3 名主力 + 最多 2 名临时招募入场；每层从可连通节点中选择一条路线：战斗、精英、事件、商店、招募、遗物，最终挑战秘境首领。<br>
      战斗后三选一祝福（附带诅咒），遗物与临时武将本局有效。<br>第 10 层通关奖励上古钥匙。`;
    bbox.innerHTML = '';
    eb.innerHTML = fd ? (fd.enemies || []).map(n => enemyChip(n)).join('') : '';
    btn.disabled = teamCount() < 3;
    btn.textContent = teamCount() < 3 ? '至少需要 3 名武将' : '开始秘境';
    btn.onclick = startSecret;
    return;
  }
  ensureSecretMap();
  const mp = s.mapPos || { layer: -1, index: -1 };
  if (mp.layer >= 9 || s.floor > 10) {
    info.innerHTML = '<b>秘境已通关</b><br>十层分支全部完成。';
    bbox.innerHTML = ''; eb.innerHTML = '';
    btn.disabled = false; btn.textContent = '重新开始';
    btn.onclick = () => { S.secret = { active: false, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false, temp: [], relics: [], used: {}, map: null, mapPos: { layer: -1, index: -1 }, nodeLayer: 0, nodeIndex: 0, activeShop: null, pendingNode: null }; saveSecret(); renderSecret(); };
    return;
  }
  const nextLayer = secretNextLayer();
  const fd = (S.secretFloors || [])[Math.min(9, nextLayer)] || {};
  const buffText = s.buffs.length
    ? s.buffs.map(b => Object.keys(b.effect).map(k => `${k}+${(b.effect[k] * 100).toFixed(0)}%`).join('/')).join('、')
    : '无';
  const relicText = (s.relics || []).length ? s.relics.map(r => r.name).join('、') : '无';
  const tempText = (s.temp || []).length ? s.temp.join('、') : '无';
  const bondText = secretActiveBonds().map(b => b.name).join('、') || '无';
  info.innerHTML = `<b>秘境 · 第 ${Math.min(10, nextLayer + 1)} 层</b> / 10 · ${s.node ? s.node.name : '选择路线'}<br>
    祝福：${buffText}<br>遗物：${relicText} · 临时招募：${tempText}<br>羁绊：${bondText}<br>
    <span class="sn-note">已通过 ${Math.max(0, mp.layer + 1)} / 10 层；连线节点为当前可选路线。</span>`;

  if (s.activeEvent) {
    const ev = s.activeEvent;
    bbox.innerHTML = `<div class="secret-sub">
      <div class="ss-title">${esc(ev.title)}</div>
      <p class="ss-text">${esc(ev.text)}</p>
      <div class="ss-opts">${ev.options.map((o, i) =>
        `<div class="buff-card node-card" data-opt="${i}"><b>${esc(o.label)}</b><span>${esc(o.desc)}</span></div>`).join('')}</div>
      <button class="mini ghost" id="secretSubBack">返回地图</button></div>`;
    bbox.querySelectorAll('[data-opt]').forEach(el => { el.onclick = () => resolveSecretEvent(Number(el.dataset.opt)); });
    const back = $('#secretSubBack'); if (back) back.onclick = closeSecretSub;
    eb.innerHTML = ''; btn.disabled = true; btn.textContent = '请选择事件选项'; btn.onclick = null;
    return;
  }
  if (s.activeRecruit) {
    const rec = s.activeRecruit;
    bbox.innerHTML = `<div class="secret-sub">
      <div class="ss-title">临时招募</div>
      <p class="ss-text">选择 1 名武将临时随行（最多 2 名，不占主力位，本局结束后离开）。</p>
      <div class="ss-recruits">${(rec.recruits || []).map(n => {
        const u = S.by[n] || {};
        return `<div class="recruit-card" data-rec="${esc(n)}">
          <div class="ph" style="background-image:url('${pthumb(n)}')"></div>
          <b>${esc(n)}</b><span>${esc((u.rarity || '') + ' · ' + (u.role || ''))}</span></div>`;
      }).join('')}</div>
      <button class="mini ghost" id="secretSubBack">返回地图</button></div>`;
    bbox.querySelectorAll('[data-rec]').forEach(el => { el.onclick = () => chooseSecretRecruit(el.dataset.rec); });
    const back = $('#secretSubBack'); if (back) back.onclick = closeSecretSub;
    eb.innerHTML = ''; btn.disabled = true; btn.textContent = '请选择招募武将'; btn.onclick = null;
    return;
  }
  if (s.activeShop) {
    const n = s.activeShop; const cost = n.cost || 300;
    bbox.innerHTML = `<div class="secret-sub">
      <div class="ss-title">秘境商店</div>
      <p class="ss-text">消耗 ${cost} 秘境币，随机获得一个祝福（附带诅咒）。购买或离开后本节点结束。</p>
      <div class="aff-actions">
        <button class="mini" id="secretShopBuy">购买祝福（${cost} 秘境币，现有 ${S.inventory['秘境币'] || 0}）</button>
        <button class="mini ghost" id="secretShopLeave">离开商店</button>
      </div></div>`;
    const buy = $('#secretShopBuy'); if (buy) buy.onclick = buySecretShop;
    const leave = $('#secretShopLeave'); if (leave) leave.onclick = leaveSecretShop;
    eb.innerHTML = ''; btn.disabled = true; btn.textContent = '商店节点'; btn.onclick = null;
    return;
  }

  if (s.needBlessing) {
    const blessFd = (S.secretFloors || [])[Math.max(0, mp.layer)] || fd;
    bbox.innerHTML = (blessFd.blessings || []).map((b, i) =>
      `<div class="buff-card" data-i="${i}"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join('');
    bbox.querySelectorAll('.buff-card').forEach(el => { el.onclick = () => chooseSecretBlessing(Number(el.dataset.i)); });
    eb.innerHTML = '';
    btn.disabled = true; btn.textContent = '先选择祝福';
    btn.onclick = null;
    return;
  }
  if (s.node) {
    bbox.innerHTML = `<div class="secret-picked"><b>${esc(s.node.name)}</b><span>${esc(s.node.desc || '')}</span>
      <button class="mini ghost" id="secretBackNodes">返回地图</button></div>`;
    const back = $('#secretBackNodes');
    if (back) back.onclick = () => { s.node = null; saveSecret(); renderSecret(); };
    eb.innerHTML = (s.node.enemies || []).map(n => enemyChip(n)).join('');
    btn.disabled = secretTeamA().length < 3;
    btn.textContent = `挑战${s.node.type === 'boss' ? '秘境首领' : s.node.name}（体力 10）`;
    btn.onclick = challengeSecret;
    return;
  }

  const layers = s.map || [];
  bbox.innerHTML = `<div class="secret-map">${layers.map((layer, li) => {
    const avail = secretAvailableIndexes(li);
    const done = li <= mp.layer;
    const current = li === nextLayer;
    return `<div class="sm-layer${current ? ' current' : ''}${done ? ' done' : ''}">
      <div class="sm-label">第 ${li + 1} 层${done ? ' · 已通过' : current ? ' · 当前' : ''}</div>
      <div class="sm-nodes">${layer.nodes.map((n, ni) => {
        const can = avail.includes(ni);
        const icon = { battle: '战', elite: '精', boss: '首', event: '遇', recruit: '招', shop: '商', relic: '遗' }[n.type] || '·';
        return `<button class="sm-node ${n.type}${can ? ' avail' : ''}${done ? ' done' : ''}" data-layer="${li}" data-idx="${ni}" ${can ? '' : 'disabled'}>
          <i>${icon}</i><b>${esc(n.name)}</b><span>${esc(n.desc || '')}</span></button>`;
      }).join('')}</div></div>`;
  }).join('')}</div>`;
  bbox.querySelectorAll('.sm-node.avail').forEach(b => {
    b.onclick = () => {
      const layer = s.map[Number(b.dataset.layer)];
      pickSecretNode(layer && layer.nodes[Number(b.dataset.idx)]);
    };
  });
  eb.innerHTML = '';
  btn.disabled = true; btn.textContent = '请选择路线'; btn.onclick = null;
}

function secretTeamA() {
  const base = (S.a || []).filter(n => S.by[n]).slice(0, 3);
  const temps = ((S.secret && S.secret.temp) || [])
    .filter(n => S.by[n] && !base.includes(n));
  return [...base, ...temps].slice(0, 5);
}
function secretTeamNames() {
  return [...(S.a || []).slice(0, 3), ...((S.secret && S.secret.temp) || []), ...(S.support || [])];
}
function secretActiveBonds() {
  const names = secretTeamNames();
  return (S.bondDefs || []).filter(b => b.members.filter(m => names.includes(m)).length >= b.need);
}
function secretUsed(type) { return !!(S.secret && S.secret.used && S.secret.used[type]); }
function secretMarkUsed(type) {
  S.secret.used = S.secret.used || {};
  S.secret.used[type] = true;
  saveSecret();
}
function addSecretRelic(r) {
  if (!r) return;
  S.secret.relics = S.secret.relics || [];
  if (S.secret.relics.some(x => x.id === r.id)) {
    S.inventory['秘境币'] = (S.inventory['秘境币'] || 0) + 100;
    saveInventory(); renderWallet(); saveSecret();
    flash(`已有遗物「${r.name}」，转化为秘境币 +100`);
    return;
  }
  S.secret.relics.push(r);
  saveSecret();
  flash(`获得秘境遗物：${r.name}`);
}
function addSecretTemp(name) {
  if (!name) return;
  S.secret.temp = S.secret.temp || [];
  if (S.secret.temp.includes(name)) { flash('该武将已在秘境队伍中'); return; }
  while (S.secret.temp.length >= 2) S.secret.temp.shift();
  S.secret.temp.push(name);
  saveSecret();
  flash(`临时招募：${name}`);
}
function resolveSecretEvent(idx) {
  const s = S.secret;
  const ev = s && s.activeEvent;
  const opt = ev && ev.options && ev.options[idx];
  const node = s && s.pendingNode;
  if (!opt) return;
  if (opt.reward) addReward(opt.reward);
  (opt.buffs || []).forEach(b => { s.buffs.push({ effect: b.effect }); });
  if (opt.curse) s.buffs.push({ effect: opt.curse.effect });
  if (opt.relic) addSecretRelic(opt.relic);
  if (opt.recruit) addSecretTemp(opt.recruit);
  flash(`秘境奇遇：${opt.label}${opt.reward ? ' · ' + fmtRewards(opt.reward) : ''}`);
  secretAdvanceNode(node);
}
function chooseSecretRecruit(name) {
  const s = S.secret;
  const node = s && s.pendingNode;
  addSecretTemp(name);
  secretAdvanceNode(node);
}
function closeSecretSub() {
  const s = S.secret;
  if (!s) return;
  s.activeEvent = null;
  s.activeRecruit = null;
  s.activeShop = null;
  s.pendingNode = null;
  saveSecret(); renderSecret();
}
function buySecretShop() {
  const s = S.secret;
  const node = s && s.activeShop;
  if (!node) return;
  const cost = node.cost || 300;
  if ((S.inventory['秘境币'] || 0) < cost) { flash('秘境币不足，可选择离开商店'); return; }
  S.inventory['秘境币'] -= cost;
  const fd = (S.secretFloors || [])[node.layer] || {};
  const b = (fd.blessings || [])[Math.floor(Math.random() * (fd.blessings || []).length)];
  if (b) s.buffs.push({ effect: b.effect }, { effect: b.curse });
  saveInventory(); saveSecret(); renderWallet();
  flash('已购买祝福');
  secretAdvanceNode(node);
}
function leaveSecretShop() {
  const node = S.secret && S.secret.activeShop;
  if (node) secretAdvanceNode(node);
}

function startSecret() {
  if (teamCount() < 3) { flash('秘境需要至少 3 名武将'); return; }
  S.secret = {
    active: true, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false,
    temp: [], relics: [], used: {},
    map: buildSecretMap(), mapPos: { layer: -1, index: -1 },
    nodeLayer: 0, nodeIndex: 0, activeShop: null, pendingNode: null,
  };
  saveSecret(); renderSecret();
}

function chooseSecretBlessing(i) {
  const ly = (S.secret.mapPos || {}).layer;
  const fd = S.secretFloors[Math.max(0, ly)] || {};
  const b = (fd.blessings || [])[i];
  if (!b) return;
  S.secret.buffs.push({ effect: b.effect }, { effect: b.curse });
  S.secret.needBlessing = false;
  S.secret.node = null;
  S.secret.shopBought = false;
  saveSecret(); renderSecret();
}

function challengeSecret() {
  const fd = S.secretFloors[S.secret.floor - 1];
  const node = S.secret.node;
  if (!fd || !node) { flash('请先选择节点'); return; }
  S.mode = 'secret'; S.secretData = node; S.bLocked = true; S.b = node.enemies.slice();
  startBattle();
}

function saveAncientRun() {
  try {
    if (!S.ancientRun || !S.ancientData) { localStorage.removeItem('sg_ancientrun'); return; }
    localStorage.setItem('sg_ancientrun', JSON.stringify({
      run: S.ancientRun, phase: S.ancientPhase, dataId: S.ancientData.id,
    }));
  } catch (e) { /* ignore */ }
}
function loadAncientRun() {
  try {
    const v = JSON.parse(localStorage.getItem('sg_ancientrun') || 'null');
    if (!v || !v.run || !v.dataId) return;
    const d = (S.ancient || []).find(x => x.id === v.dataId);
    if (!d) return;
    S.ancientRun = v.run;
    S.ancientData = d;
    if (S.ancientRun.wins && S.ancientRun.wins[0] !== null && S.ancientRun.wins[1] === null) {
      S.ancientRun.phase = 2;
    }
    S.ancientPhase = S.ancientRun.phase === 2 ? 2 : 1;
  } catch (e) { /* ignore */ }
}

function challengeAncient(id) {
  const d = S.ancient.find(x => x.id === id);
  if (!d) return;
  if (S.ancientRun && S.ancientData && S.ancientData.id === id) {
    if (S.ancientRun.wins && S.ancientRun.wins[0] !== null && S.ancientRun.wins[1] === null) {
      S.ancientRun.phase = 2;
    }
    const ph = S.ancientRun.phase === 2 ? 2 : 1;
    S.mode = 'ancient'; S.ancientData = d; S.ancientPhase = ph;
    S.levelData = null; S.levelId = null;
    S.bLocked = true;
    S.b = (S.ancientRun.enemies[ph - 1] || []).slice();
    saveFormation(); saveAncientRun();
    showScreen('formation');
    flash(`上古 · ${d.beast} 第${d.stage}阶段 · 继续${ph === 2 ? '二队' : '一队'}`);
    return;
  }
  if (S.ancientRun && S.ancientData && S.ancientData.id !== id &&
      !confirm('放弃当前未完成的上古双队进度，挑战新阶段？')) return;
  const enemies = [
    (d.enemies_a || d.enemies.slice(0, 4) || []).slice(),
    (d.enemies_b || d.enemies.slice(4, 8) || d.enemies.slice(0, 4) || []).slice(),
  ];
  S.mode = 'ancient'; S.ancientData = d; S.levelData = null; S.levelId = null;
  S.ancientRun = {
    phase: 1, wins: [null, null], enemies,
    configs: [d.config_a || d.config, d.config_b || d.config],
    reward: d.reward || {}
  };
  S.ancientPhase = 1;
  S.bLocked = true;
  S.b = enemies[0].slice();
  saveFormation();
  showScreen('formation');
  flash(`上古 · ${d.beast} 第 ${d.stage} 阶段 · 一队出战`);
}

function renderAncient() {
  const box = $('#ancientGrid');
  if (!box) return;
  box.innerHTML = '';
  const beasts = [...new Set(S.ancient.map(x => x.beast))];
  beasts.forEach(beast => {
    const list = S.ancient.filter(x => x.beast === beast).sort((a, b) => a.stage - b.stage);
    const d = document.createElement('div'); d.className = 'dungeon-card';
    d.innerHTML = `<div class="dc-name">${esc(beast)}</div>
      <div class="dc-sub">${esc(list[0].weapon)} · 双队八人 · 三阶段</div><div class="dc-btns"></div>`;
    const btns = d.querySelector('.dc-btns');
    list.forEach(it => {
      const wrap = document.createElement('span'); wrap.className = 'dc-pair';
      const b = document.createElement('button');
      const _resume = S.ancientRun && S.ancientData && S.ancientData.id === it.id;
      b.textContent = _resume ? '继续' : `阶段${it.stage}`;
      b.title = _resume ? '继续未完成的上古双队挑战'
        : `推荐 Lv${it.config.level} · 奖励 ${Object.entries(it.reward).map(([k, v]) => k + '+' + v).join('、')}`;
      b.onclick = () => challengeAncient(it.id);
      const s = document.createElement('button');
      s.className = 'mini ghost'; s.textContent = '扫';
      const cleared = !!S.clears['ancient:' + it.id];
      s.disabled = !cleared;
      s.title = cleared ? `扫荡上古 · 第 ${it.stage} 阶段` : '首次通关后可扫荡';
      s.onclick = () => openSweepFor('ancient', it.id);
      wrap.append(b, s); btns.appendChild(wrap);
    });
    box.appendChild(d);
  });
}

const SEASON_TIERS = [
  { id: 't20', need: 20, rw: { 铜钱: 20000, 招贤令: 3 } },
  { id: 't45', need: 45, rw: { 塔币: 1000, 金符: 5 }, title: '赛季·初露锋芒' },
  { id: 't75', need: 75, rw: { 神兵: 5, 神器碎片: 10 }, title: '赛季·纵横' },
  { id: 't110', need: 110, rw: { 招贤令: 10, 金符: 10, 神兵: 10 }, title: '赛季·无双', frame: true },
];
function seasonMeta() {
  const start = Date.UTC(2026, 0, 1);
  const idx = Math.floor((Date.now() - start) / (42 * 86400000));
  const end = new Date(start + (idx + 1) * 42 * 86400000);
  return { no: idx + 1, end };
}
function seasonWeekKey() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - new Date(Date.UTC(y, 0, 1))) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}
function syncSeason() {
  const meta = seasonMeta();
  const wk = seasonWeekKey();
  if (S.season.no !== meta.no) {
    const titles = [...(S.season.titles || [])];
    const frame = !!S.season.frame;
    S.season = defaultSeason();
    S.season.titles = titles; S.season.frame = frame; S.season.no = meta.no;
  }
  if (!S.season.weekly || S.season.weekly.week !== wk) {
    S.season.weekly = { week: wk, counters: {}, claimed: [] };
  }
  saveSeason();
}
function seasonTaskDefs() {
  const gachaTotal = Object.values(S.gacha || {}).reduce((a, g) => a + (g.total || 0), 0);
  return [
    { id: 's_main10', name: '主线通关 10 关', target: 10, pts: 5, rw: { 金符: 2 }, cur: () => Math.max(0, (S.progress.unlocked || 1) - 1) },
    { id: 's_main100', name: '主线通关 100 关', target: 100, pts: 10, rw: { 招贤令: 5, 塔币: 500 }, cur: () => Math.max(0, (S.progress.unlocked || 1) - 1) },
    { id: 's_gacha10', name: '累计招募 10 次', target: 10, pts: 5, rw: { 招贤令: 3 }, cur: () => gachaTotal },
    { id: 's_gacha50', name: '累计招募 50 次', target: 50, pts: 10, rw: { 招贤令: 6, 金符: 2 }, cur: () => gachaTotal },
    { id: 's_tower10', name: '将星塔到达 10 层', target: 10, pts: 5, rw: { 塔币: 200 }, cur: () => (S.tower.best || 1) },
    { id: 's_tower50', name: '将星塔到达 50 层', target: 50, pts: 10, rw: { 塔币: 800, 招贤令: 3 }, cur: () => (S.tower.best || 1) },
    { id: 's_ancient1', name: '通关任意上古阶段', target: 1, pts: 10, rw: { 将魂: 20 }, cur: () => S.season.ancientCleared ? 1 : 0 },
    { id: 's_trial10', name: '完成 10 次日常试炼', target: 10, pts: 10, rw: { 铜钱: 12000 }, cur: () => (S.achieve.stats.trials || 0) },
    { id: 's_weekly2', name: '通关 2 次周常 BOSS', target: 2, pts: 10, rw: { 招贤令: 4 }, cur: () => (S.achieve.stats.weekly || 0) },
    { id: 's_own50', name: '拥有 50 名武将', target: 50, pts: 10, rw: { 招贤令: 4 }, cur: () => S.owned.length },
    { id: 's_bond15', name: '触发 15 种羁绊', target: 15, pts: 10, rw: { 魂石: 10 }, cur: () => (S.achieve.stats.bondKinds || []).length },
    { id: 's_aff1', name: '1 名武将好感满级', target: 1, pts: 10, rw: { 招贤令: 5, 神兵: 2 }, cur: affMaxCount },
  ];
}
function seasonWeeklyDefs() {
  const c = (S.season.weekly && S.season.weekly.counters) || {};
  return [
    { id: 'w_battle20', name: '本周战斗 20 场', target: 20, pts: 5, rw: { 铜钱: 8000 }, cur: () => c.battles || 0 },
    { id: 'w_trial3', name: '本周完成 3 次日常试炼', target: 3, pts: 5, rw: { 兵书: 50 }, cur: () => c.trials || 0 },
    { id: 'w_weeklyboss1', name: '本周通关 1 次周常 BOSS', target: 1, pts: 10, rw: { 招贤令: 3 }, cur: () => c.weeklyBoss || 0 },
    { id: 'w_tower5', name: '本周推进将星塔 5 层', target: 5, pts: 5, rw: { 塔币: 300 }, cur: () => c.tower || 0 },
    { id: 'w_expedition3', name: '本周完成 3 次内政派遣', target: 3, pts: 5, rw: { 铜钱: 10000 }, cur: () => c.expeditions || 0 },
  ];
}
function bumpSeasonWeekly(key, n) {
  syncSeason();
  const w = S.season.weekly;
  w.counters[key] = (w.counters[key] || 0) + (n || 1);
  saveSeason();
}
function claimSeasonTask(id, weekly) {
  const defs = weekly ? seasonWeeklyDefs() : seasonTaskDefs();
  const t = defs.find(x => x.id === id);
  const arr = weekly ? S.season.weekly.claimed : S.season.claimed;
  if (!t || arr.includes(id)) return;
  if ((t.cur() || 0) < t.target) { flash('任务尚未完成'); return; }
  addReward(t.rw);
  arr.push(id);
  S.season.points = (S.season.points || 0) + t.pts;
  saveSeason(); renderWallet(); renderSeason();
  flash(`赛季任务完成：${t.name} · 积分 +${t.pts}`);
}
function claimSeasonTier(id) {
  const tier = SEASON_TIERS.find(x => x.id === id);
  if (!tier || S.season.tierClaimed.includes(id)) return;
  if ((S.season.points || 0) < tier.need) { flash('赛季积分不足'); return; }
  addReward(tier.rw);
  S.season.tierClaimed.push(id);
  if (tier.title && !S.season.titles.includes(tier.title)) S.season.titles.push(tier.title);
  if (tier.frame) S.season.frame = true;
  saveSeason(); renderWallet(); renderSeason(); renderHome();
  flash(`赛季奖励领取：${tier.title || '赛季宝箱'}`);
}
function claimAllSeason() {
  syncSeason();
  let n = 0, gainedPts = 0;
  seasonTaskDefs().forEach(t => {
    if (S.season.claimed.includes(t.id)) return;
    if ((t.cur() || 0) < t.target) return;
    addReward(t.rw);
    S.season.claimed.push(t.id);
    S.season.points = (S.season.points || 0) + t.pts;
    gainedPts += t.pts; n += 1;
  });
  seasonWeeklyDefs().forEach(t => {
    if (S.season.weekly.claimed.includes(t.id)) return;
    if ((t.cur() || 0) < t.target) return;
    addReward(t.rw);
    S.season.weekly.claimed.push(t.id);
    S.season.points = (S.season.points || 0) + t.pts;
    gainedPts += t.pts; n += 1;
  });
  SEASON_TIERS.forEach(tier => {
    if (S.season.tierClaimed.includes(tier.id)) return;
    if ((S.season.points || 0) < tier.need) return;
    addReward(tier.rw);
    S.season.tierClaimed.push(tier.id);
    if (tier.title && !S.season.titles.includes(tier.title)) S.season.titles.push(tier.title);
    if (tier.frame) S.season.frame = true;
    n += 1;
  });
  saveSeason(); renderWallet(); renderSeason(); renderHome();
  flash(n ? `一键领取完成：${n} 项 · 赛季积分 +${gainedPts}` : '暂无可领取奖励');
}

function renderSeason() {
  syncSeason();
  const meta = seasonMeta();
  const pts = S.season.points || 0;
  const next = SEASON_TIERS.find(t => !S.season.tierClaimed.includes(t.id));
  $('#seasonInfo').innerHTML = `<b>第 ${meta.no} 赛季</b> · 本期结束 ${meta.end.toLocaleDateString()}<br>
    赛季积分 <b>${pts}</b>${next ? ` · 下一档 ${next.need}` : ' · 全部奖励已解锁'}<br>
    已获称号：${S.season.titles.length ? S.season.titles.map(esc).join('、') : '无'}${S.season.frame ? ' · 赛季头像框已激活' : ''}<br>
    <span class="sn-note">赛季任务一次性；本周目标每周刷新，领取后计入赛季积分。</span>
    <div class="season-bar"><i style="width:${Math.min(100, pts / 110 * 100).toFixed(1)}%"></i></div>`;

  const claimAllBtn = $('#seasonClaimAll');
  if (claimAllBtn) claimAllBtn.onclick = claimAllSeason;
  const taskHtml = (t, claimed, weekly) => {
    const cur = Math.min(t.target, t.cur() || 0);
    const done = cur >= t.target;
    return `<div class="season-task${claimed ? ' done' : ''}">
      <span class="st-ico">${claimed ? '✓' : '令'}</span>
      <span class="st-name">${esc(t.name)}<small>${cur}/${t.target} · +${t.pts} 积分</small></span>
      <span class="st-rw">${esc(fmtRewards(t.rw))}</span>
      <button class="mini${claimed ? ' ghost' : ''}" data-stask="${esc(t.id)}" data-weekly="${weekly ? 1 : 0}" ${done && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : done ? '领取' : '进行中'}</button>
    </div>`;
  };
  const box = $('#seasonTasks');
  box.innerHTML = '';
  seasonTaskDefs().forEach(t => box.insertAdjacentHTML('beforeend', taskHtml(t, S.season.claimed.includes(t.id), false)));
  const wbox = $('#seasonWeekly');
  if (wbox) {
    const wk = S.season.weekly.week || '';
    wbox.innerHTML = `<div class="season-sub">本周目标 · ${esc(wk)}</div>` +
      seasonWeeklyDefs().map(t => taskHtml(t, S.season.weekly.claimed.includes(t.id), true)).join('');
  }
  const mbox = $('#seasonMilestones');
  if (mbox) {
    mbox.innerHTML = `<div class="season-sub">赛季奖励</div><div class="season-tier-grid">${SEASON_TIERS.map(t => {
      const claimed = S.season.tierClaimed.includes(t.id);
      const reached = pts >= t.need;
      return `<div class="season-tier${claimed ? ' done' : ''}">
        <div class="tier-need">${t.need} 积分</div>
        <div class="tier-rw">${esc(fmtRewards(t.rw))}</div>
        ${t.title ? `<div class="tier-title">称号「${esc(t.title)}」</div>` : ''}
        ${t.frame ? '<div class="tier-title">专属头像框</div>' : ''}
        <button class="mini${claimed ? ' ghost' : ''}" data-stier="${esc(t.id)}" ${reached && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : reached ? '领取' : '积分不足'}</button>
      </div>`;
    }).join('')}</div>`;
  }
  document.querySelectorAll('#seasonTasks [data-stask],#seasonWeekly [data-stask]').forEach(b => {
    b.onclick = () => claimSeasonTask(b.dataset.stask, b.dataset.weekly === '1');
  });
  document.querySelectorAll('#seasonMilestones [data-stier]').forEach(b => {
    b.onclick = () => claimSeasonTier(b.dataset.stier);
  });
}

function claimStamina(i) {
  const qt = $('#questTracker');
  if (qt) {
    const qs = [
      ['主线', Math.max(0, (S.progress.unlocked || 1) - 1), 700, 'campaign'],
      ['图鉴', S.owned.length, S.units.length, 'codex'],
      ['将星塔', ...towerProgress(), 'tower']
    ];
    const advisor = owned.find(u => /军师|谋主|术士/.test(u.role || '')) || owned[1] || owned[0];
    const av = advisor ? `${SG_IMG.pthumb(advisor.name)}` : '';
    qt.innerHTML = `<div class="quest-scroll">
      <div class="qs-avatar" style="background-image:url('${av}')"></div>
      <div class="qs-body">
        <div class="qs-head"><b>${advisor ? esc(advisor.name) : '军师'}</b><span>军师谏言</span></div>
        <p>主公，主线已至第 ${unlocked} 关，在册 ${S.owned.length} 将。可先出征，或往招贤馆扩充阵容。</p>
        <div class="qs-tasks">${qs.map(([name, cur, max, go]) => {
          const p = Math.min(100, cur / max * 100).toFixed(1);
          return `<span onclick="showScreen('${go}')"><em>${name}</em><i><b style="width:${p}%"></b></i><u>${cur}/${max}</u></span>`;
        }).join('')}</div>
      </div></div>`;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (S.stamina.claimDate !== today) { S.stamina.claimDate = today; S.stamina.claims = [false, false]; }
  if (S.stamina.claims[i]) { flash('今日已领取'); return; }
  if (staminaNow() >= staminaCap()) { flash('体力已满'); return; }
  S.stamina.claims[i] = true;
  S.stamina.value = Math.min(staminaCap(), (S.stamina.value || 0) + 60);
  saveStamina(); renderWallet(); renderHome();
}

function showScreen(name) {
  if (!S.started) return;
  if (name === 'codex') { openCodex(); return; }
  S.screen = name;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  document.body.classList.remove('in-battle');
  $('#codex').hidden = true;
  $('#detail').hidden = true;
  $('#homeScreen').hidden = true;
  $('#recruitScreen').hidden = true;
  $('#shopScreen').hidden = true;
  $('#towerScreen').hidden = true;
  $('#dungeonScreen').hidden = true;
  $('#secretScreen').hidden = true;
  $('#ancientScreen').hidden = true;
  $('#trialScreen').hidden = true;
  $('#achieveScreen').hidden = true;
  $('#worldbossScreen').hidden = true;
  $('#expeditionScreen').hidden = true;
  $('#survivalScreen').hidden = true;
  $('#seasonScreen').hidden = true;
  $('#questScreen').hidden = true;
  $('#storyScreen').hidden = true;
  $('#rosterScreen').hidden = true;
  $('#setup').hidden = true;
  $('#battle').hidden = true;
  if (name === 'home') {
    $('#homeScreen').hidden = false;
    renderHome();
  } else if (name === 'recruit') {
    $('#recruitScreen').hidden = false;
    renderRecruit();
  } else if (name === 'shop') {
    $('#shopScreen').hidden = false;
    renderShop();
  } else if (name === 'tower') {
    $('#towerScreen').hidden = false;
    renderTower();
  } else if (name === 'dungeon') {
    $('#dungeonScreen').hidden = false;
    renderDungeons();
  } else if (name === 'secret') {
    $('#secretScreen').hidden = false;
    renderSecret();
  } else if (name === 'ancient') {
    $('#ancientScreen').hidden = false;
    renderAncient();
  } else if (name === 'season') {
    $('#seasonScreen').hidden = false;
    renderSeason();
  } else if (name === 'trial') {
    $('#trialScreen').hidden = false;
    renderTrials();
  } else if (name === 'achieve') {
    $('#achieveScreen').hidden = false;
    renderAchieveScreen();
  } else if (name === 'worldboss') {
    $('#worldbossScreen').hidden = false;
    renderWorldBoss();
  } else if (name === 'expedition') {
    $('#expeditionScreen').hidden = false;
    renderExpedition();
  } else if (name === 'survival') {
    $('#survivalScreen').hidden = false;
    renderSurvival();
  } else if (name === 'quest') {
    $('#questScreen').hidden = false;
    renderQuestScreen();
  } else if (name === 'story') {
    $('#storyScreen').hidden = false;
    renderStoryScreen();
  } else if (name === 'roster') {
    $('#rosterScreen').hidden = false;
    renderRosterFilters();
    renderRoster();
  } else {
    $('#setup').hidden = false;
    $('#setup').dataset.screen = name;
    const show = {
      campaign: ['campaignPanel'],
      formation: ['poolPanel', 'formationPanel'],
      growth: ['growthPanel']
    }[name] || [];
    ['campaignPanel', 'poolPanel', 'growthPanel', 'formationPanel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = show.includes(id) ? '' : 'none';
    });
    if (name === 'growth') { initGrowthSelect(); renderGrowth(); }
  }
  if (name === 'formation') { renderTeams(); renderPool(); }
  window.scrollTo(0, 0);
}

const GACHA = {
  normal: { name: '招贤纳士', cost: '招贤令', rates: { 普通: 0.62, 精良: 0.30, 传奇: 0.08, 绝世: 0 } },
  limited: { name: '群英 UP', cost: '金符', rates: { 普通: 0.60, 精良: 0.295, 传奇: 0.095, 绝世: 0.01 } },
  faction: { name: '四方阵营', cost: '招贤令', rates: { 普通: 0.65, 精良: 0.28, 传奇: 0.07, 绝世: 0 }, faction: true },
  newbie: { name: '桃园结义', cost: '招贤令', rates: { 普通: 0, 精良: 0.70, 传奇: 0.30, 绝世: 0 }, max: 50 },
  event: { name: '活动纪念', cost: '金符', rates: { 普通: 0, 精良: 0.55, 传奇: 0.41, 绝世: 0.04 } }
};
const SHOP_ITEMS = [
  { id: 'ticket1', name: '招贤令', amount: 1, price: 5000, cur: '铜钱', stock: 5, desc: '常驻招贤 1 抽' },
  { id: 'ticket10', name: '招贤令', amount: 10, price: 45000, cur: '铜钱', stock: 1, desc: '常驻招贤 10 抽' },
  { id: 'gold1', name: '金符', amount: 1, price: 300, cur: '塔币', stock: 3, desc: '限定池 1 抽' },
  { id: 'book50', name: '兵书', amount: 50, price: 3000, cur: '铜钱', stock: 5, desc: '技能升级材料' },
  { id: 'paper5', name: '图纸', amount: 5, price: 5000, cur: '铜钱', stock: 3, desc: '装备升级材料' },
  { id: 'iron5', name: '玄铁', amount: 5, price: 8000, cur: '铜钱', stock: 3, desc: '装备升级材料' },
  { id: 'soul20', name: '将魂', amount: 20, price: 200, cur: '塔币', stock: 3, desc: '觉醒材料' },
  { id: 'stamina60', name: '体力', amount: 60, price: 100, cur: '塔币', stock: 5, desc: '恢复 60 体力' }
];

function towerProgress() {
  const b = Math.max(1, S.tower.best || 1);
  const base = Math.floor((b - 1) / 100) * 100;
  return [b - base, 100];
}

function renderHome() {
  const owned = S.owned.map(n => S.by[n]).filter(Boolean).sort((a, b) => (b.power || 0) - (a.power || 0));
  const picks = owned.slice(0, 3);
  const art = picks.map(u => `<div class="art" style="background-image:url('${SG_IMG.pthumb(u.name)}')"></div>`).join('');
  const unlocked = S.progress.unlocked || 1;
  const level = Math.min(100, 1 + Math.floor((unlocked - 1) / 7));
  const exp = ((unlocked - 1) % 7) / 7 * 100;
  const power = owned.slice(0, 5).reduce((a, u) => a + (u.power || 0), 0);
  const lordFace = (typeof lordArtUrl === 'function') ? lordArtUrl(true) : '';
  const avatar = lordFace || (owned[0] ? `${SG_IMG.pthumb(owned[0].name)}` : '');
  $('#homeHero').innerHTML = `${art}<div class="veil"></div>
    <div class="player-card">
      <div class="pc-avatar${S.season.frame ? ' framed' : ''}" style="background-image:url('${avatar}')${lordFace ? ';background-position:center 14%' : ''}" title="${S.season.frame ? '赛季专属头像框' : ''}"></div>
      <div class="pc-meta"><b>主公${titleName(S.achieve.title) ? `<em class="pc-title">${esc(titleName(S.achieve.title))}</em>` : ''}</b><span>Lv.${level} · 战力 ${power}</span>
        <div class="pc-exp"><i style="width:${exp.toFixed(1)}%"></i></div></div>
    </div>
    <div class="scene-title"><span>汉末群雄 · 星命共鸣</span><h2>洛阳</h2>
      <p>在册 ${S.owned.length} 将 · 主线 ${unlocked} 关 · 将星塔 ${S.tower.best || 1} 层</p></div>`;
  const qt = $('#questTracker');
  if (qt) {
    const qs = [
      ['主线', Math.max(0, (S.progress.unlocked || 1) - 1), 700, 'campaign'],
      ['图鉴', S.owned.length, S.units.length, 'codex'],
      ['将星塔', ...towerProgress(), 'tower']
    ];
    const advisor = owned.find(u => /军师|谋主|术士/.test(u.role || '')) || owned[1] || owned[0];
    const av = advisor ? `${SG_IMG.pthumb(advisor.name)}` : '';
    qt.innerHTML = `<div class="quest-scroll">
      <div class="qs-avatar" style="background-image:url('${av}')"></div>
      <div class="qs-body">
        <div class="qs-head"><b>${advisor ? esc(advisor.name) : '军师'}</b><span>军师谏言</span></div>
        <p>主公，主线已至第 ${unlocked} 关，在册 ${S.owned.length} 将。可先出征，或往招贤馆扩充阵容。</p>
        <div class="qs-tasks">${qs.map(([name, cur, max, go]) => {
          const p = Math.min(100, cur / max * 100).toFixed(1);
          return `<span onclick="showScreen('${go}')"><em>${name}</em><i><b style="width:${p}%"></b></i><u>${cur}/${max}</u></span>`;
        }).join('')}</div>
      </div></div>`;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (S.stamina.claimDate !== today) { S.stamina.claimDate = today; S.stamina.claims = [false, false]; }
  const cs = S.stamina.claims || [false, false];
  $('#homeInfo').innerHTML = `
    <div class="info-row"><i class="seal" data-ch="饷"></i><b>每日军饷</b><span class="info-label">领取体力，整军再战</span></div>
    <div class="info-actions">
      <button class="mini" ${cs[0] ? 'disabled' : ''} onclick="claimStamina(0)">${cs[0] ? '已领取' : '领取体力 60'}</button>
      <button class="mini" ${cs[1] ? 'disabled' : ''} onclick="claimStamina(1)">${cs[1] ? '已领取' : '领取体力 60'}</button>
    </div>
    ${S.newbie ? `<div class="info-row"><i class="seal" data-ch="礼"></i><b>新兵补给</b><span class="info-label">七日签到 ${S.newbie.claimed.length}/7${newbieActive() ? '' : ' · 已领完'}</span></div>
    <div class="info-actions">
      <button class="mini" ${newbieCanClaim() ? '' : 'disabled'} onclick="claimNewbieGift()">${newbieActive() ? (newbieCanClaim() ? `领取第 ${newbieDay()} 天` : '今日已领') : '已全部领取'}</button>
      <button class="mini ghost" onclick="openNewbieGift()">查看七日</button>
    </div>` : ''}
    <div class="info-row"><i class="seal" data-ch="将"></i><span class="info-label">当前阵容</span>
      <b>${teamCount() ? teamActive().join('、') : '未编队'}</b><span class="info-label">（${teamCount()}/5）</span></div>`;
  renderStamina();
}

function renderRoster() {
  const box = $('#rosterGrid');
  if (!box) return;
  const q = (S.rosterSearch || '').trim();
  let list = S.owned.map(n => S.by[n]).filter(Boolean).filter(u =>
    (S.rosterFaction === '全部' || !S.rosterFaction || u.faction === S.rosterFaction) &&
    (S.rosterRarity === '全部' || !S.rosterRarity || u.rarity === S.rosterRarity) &&
    (!S.rosterRole || S.rosterRole === '全部职业' || (u.role || '').split('·')[0] === S.rosterRole) &&
    (!q || u.name.includes(q) || u.role.includes(q))
  );
  const rarOrder = { '绝世': 0, '传奇': 1, '精良': 2, '普通': 3 };
  const sort = S.rosterSort || 'power';
  list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh')
    : sort === 'rarity' ? (rarOrder[a.rarity] - rarOrder[b.rarity]) || (b.power - a.power)
    : (b.power || 0) - (a.power || 0));
  const count = $('#rosterCount');
  if (count) count.textContent = `${list.length} / ${S.owned.length}`;
  box.innerHTML = list.map(u => {
    const lv = playerLevel();
    return `<div class="roster-card r-${u.rarity}" data-name="${esc(u.name)}">
      <div class="rc-art" style="background-image:url('${SG_IMG.pthumb(u.name)}')">
        <span class="rc-rar">${u.rarity}</span>
      </div>
      <div class="rc-meta"><b>${esc(u.name)}</b><em>${esc(u.role)}</em>
        <div class="rc-stats"><span>Lv ${lv}</span><span>战力 ${u.power || '-'}</span><span>星力 ${u.star || 1}</span></div>
      </div></div>`;
  }).join('') || '<div class="roster-empty">暂无可查看武将，先去招贤馆招募。</div>';
  box.querySelectorAll('.roster-card').forEach(el => el.onclick = () => openDetail(el.dataset.name));
}
function renderRosterFilters() {
  const box = $('#rosterFilters');
  if (!box) return;
  box.innerHTML = '';
  const add = (label, active, fn) => {
    const b = document.createElement('button'); b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label; b.onclick = fn; box.appendChild(b);
  };
  ['全部', '魏', '蜀', '吴', '群雄'].forEach(f => add(f, (S.rosterFaction || '全部') === f,
    () => { S.rosterFaction = f; renderRosterFilters(); renderRoster(); }));
  ['全部', '绝世', '传奇', '精良', '普通'].forEach(r => add(r, (S.rosterRarity || '全部') === r,
    () => { S.rosterRarity = r; renderRosterFilters(); renderRoster(); }));
  const roles = ['全部职业', ...[...new Set(S.units.map(u => (u.role || '').split('·')[0]))]];
  const sel = document.createElement('select'); sel.className = 'codex-role';
  sel.innerHTML = roles.map(r => `<option${(S.rosterRole || '全部职业') === r ? ' selected' : ''}>${esc(r)}</option>`).join('');
  sel.onchange = () => { S.rosterRole = sel.value; renderRoster(); };
  box.appendChild(sel);
  const inp = document.createElement('input'); inp.placeholder = '搜索武将'; inp.value = S.rosterSearch || '';
  inp.oninput = (e) => { S.rosterSearch = e.target.value; renderRoster(); };
  box.appendChild(inp);
}

function renderRecruit() {
  const pool = S.recruitPool || 'normal';
  if (S._lastPool !== pool) { const rb = $('#gachaResult'); if (rb) rb.innerHTML = ''; S._lastPool = pool; }
  const cfg = GACHA[pool];
  const g = S.gacha[pool];
  const STAGE = {
    normal: { title: '招贤纳士', feat: ['曹操', '刘备', '孙权'], sub: '常驻卡池 · 消耗招贤令 · 十连必出精良以上' },
    limited: { title: '群英汇聚', feat: ['吕布', '貂蝉', '孙尚香'], sub: '限定卡池 · 消耗金符 · 绝世 120 抽硬保底' },
    faction: { title: '四方阵营', feat: [], sub: '选定阵营 · 只出该阵营武将' },
    newbie: { title: '桃园结义', feat: ['刘备', '关羽', '张飞'], sub: '新手卡池 · 前 50 抽必得传奇' },
    event: { title: '活动纪念', feat: ['周瑜', '诸葛亮', '陆逊'], sub: '活动卡池 · 消耗金符 · 概率提升' }
  };
  const FACTION_FEAT = { '魏': ['曹操', '司马懿', '张辽'], '蜀': ['刘备', '关羽', '诸葛亮'], '吴': ['孙权', '周瑜', '孙策'], '群雄': ['吕布', '貂蝉', '董卓'] };
  const st = STAGE[pool] || STAGE.normal;
  const feat = (pool === 'faction' ? (FACTION_FEAT[S.gachaFaction || '魏'] || []) : st.feat).filter(n => S.by[n]).slice(0, 3);
  const stage = $('#gachaStage');
  if (stage) {
    const arts = feat.map(n => `<div class="art" style="background-image:url('${SG_IMG.pthumb(n)}')"></div>`).join('');
    stage.innerHTML = `${arts}<div class="veil"></div><div class="txt">
      <div class="g-kicker">${cfg.name}</div>
      <h3>${st.title}</h3>
      <p>${st.sub}${pool === 'faction' ? ` · 当前 <b>${S.gachaFaction}</b>` : ''}</p></div>`;
  }
  document.querySelectorAll('.pool-tabs button').forEach(b => b.classList.toggle('active', b.dataset.pool === pool));
  const cost = S.inventory[cfg.cost] || 0;
  const ft = $('#factionTabs');
  if (cfg.faction) {
    ft.hidden = false;
    ft.innerHTML = '';
    ['魏', '蜀', '吴', '群雄'].forEach(f => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.gachaFaction === f ? ' active' : '');
      b.textContent = f;
      b.onclick = () => { S.gachaFaction = f; renderRecruit(); };
      ft.appendChild(b);
    });
  } else {
    ft.hidden = true;
    ft.innerHTML = '';
  }
  const maxInfo = cfg.max ? `<br>本期剩余 ${Math.max(0, cfg.max - (g.total || 0))} / ${cfg.max} 抽（前 50 抽必得传奇）` : '';
  const mythPool = pool === 'limited' || pool === 'event';
  $('#gachaInfo').innerHTML = `<b>${cfg.name}</b> · 消耗 ${cfg.cost}（当前 ${cost}）${cfg.faction ? ` · 当前阵营 ${S.gachaFaction}` : ''}<br>
    ${maxInfo || `累计 ${g.total || 0} 抽 · 距离传奇硬保底 ${Math.max(0, 80 - (g.legend || 0))} 抽${mythPool ? ` · 距离绝世硬保底 ${Math.max(0, 120 - (g.myth || 0))} 抽` : ''}`}<br>
    ${cfg.max ? '新手池：精良/传奇，单抽 1 招贤令。' : '10 连必出精良以上；50/90 抽起软保底；重复武将自动升星（上限 10 星，每星 +10% 属性）。'}`;
  const resultBox = $('#gachaResult');
  if (resultBox && !resultBox.children.length) {
    resultBox.innerHTML = `<div class="gacha-empty">
      <div class="chest-row">
        <img src="assets/ui/稀有度宝箱/普通_木箱.png" alt=""><img src="assets/ui/稀有度宝箱/精良_银箱.png" alt="">
        <img src="assets/ui/稀有度宝箱/传奇_金箱.png" alt=""><img src="assets/ui/稀有度宝箱/绝世_赤金神箱.png" alt="">
      </div><b>召贤未启</b><span>十连必得精良以上 · 50/90 抽软保底</span></div>`;
  }
  const rates = cfg.rates;
  $('#gachaRates').textContent = `概率：${Object.entries(rates).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(' · ')}`;
  $('#pull1').disabled = cost < 1 || (cfg.max && (g.total || 0) >= cfg.max);
  $('#pull10').disabled = cost < 10 || (cfg.max && (g.total || 0) + 10 > cfg.max);
  $('#pull1').textContent = `单抽（1 ${cfg.cost}）`;
  $('#pull10').textContent = `十连（10 ${cfg.cost}）`;
}

function rollRarity(pool) {
  const cfg = GACHA[pool], g = S.gacha[pool];
  const mythPool = pool === 'limited' || pool === 'event';
  g.total = (g.total || 0) + 1;
  g.legend = (g.legend || 0) + 1;
  if (mythPool) g.myth = (g.myth || 0) + 1;
  if (cfg.max && g.total >= cfg.max) { g.legend = 0; g.myth = 0; return '传奇'; }
  if (mythPool && g.myth >= 120) { g.myth = 0; g.legend = 0; return '绝世'; }
  if (g.legend >= 80) { g.legend = 0; return '传奇'; }
  const myth = (cfg.rates.绝世 || 0) + (mythPool && g.myth >= 90 ? (g.myth - 89) * 0.01 : 0);
  const legend = cfg.rates.传奇 + (g.legend >= 50 ? (g.legend - 49) * 0.015 : 0);
  const roll = Math.random();
  if (roll < myth) { g.myth = 0; g.legend = 0; return '绝世'; }
  if (roll < myth + legend) { g.legend = 0; return '传奇'; }
  if (roll < myth + legend + cfg.rates.精良) return '精良';
  return '普通';
}

function pickUnit(rarity, pool) {
  if ((pool === 'newbie' || pool === 'event') && rarity === '普通') rarity = '精良';
  let list = S.units.filter(u => u.rarity === rarity);
  if (pool === 'faction') {
    list = list.filter(u => u.faction === S.gachaFaction);
    if (!list.length) list = S.units.filter(u => u.faction === S.gachaFaction);
  }
  if (!list.length) list = S.units;
  return list[Math.floor(Math.random() * list.length)];
}

function doGacha(count) {
  const pool = S.recruitPool || 'normal';
  const cfg = GACHA[pool];
  const g = S.gacha[pool];
  if (cfg.max && (g.total || 0) >= cfg.max) { flash('新手池已抽完'); return; }
  if (cfg.max && (g.total || 0) + count > cfg.max) { flash('新手池剩余抽数不足'); return; }
  const have = S.inventory[cfg.cost] || 0;
  if (have < count) { flash(`${cfg.cost}不足`); return; }
  S.inventory[cfg.cost] -= count;
  const fx = $('#summonFx');
  if (fx) { fx.hidden = false; fx.classList.remove('play'); void fx.offsetWidth; fx.classList.add('play'); setTimeout(() => { fx.hidden = true; fx.classList.remove('play'); }, 850); }
  const results = [];
  let best = 0;
  for (let i = 0; i < count; i++) {
    let rar = rollRarity(pool);
    const rank = { 普通: 1, 精良: 2, 传奇: 3, 绝世: 4 }[rar];
    best = Math.max(best, rank);
    const u = pickUnit(rar, pool);
    const dup = S.owned.includes(u.name);
    if (dup) {
      const ds = gainDupStar(u.name);
      if (ds) results.push({ unit: u, dup: true, starUp: true, star: ds });
      else {
        const soul = { 普通: 5, 精良: 10, 传奇: 30, 绝世: 80 }[rar];
        S.inventory['将魂'] = (S.inventory['将魂'] || 0) + soul;
        results.push({ unit: u, dup: true, soul, maxed: true });
      }
    } else {
      S.owned.push(u.name);
      claimCodexGift(u.name);
      results.push({ unit: u, dup: false });
    }
  }
  if (count === 10 && best < 2) {
    const u = pickUnit('精良', pool);
    if (!S.owned.includes(u.name)) { S.owned.push(u.name); claimCodexGift(u.name); results[9] = { unit: u, dup: false }; }
    else {
      const ds = gainDupStar(u.name);
      if (ds) results[9] = { unit: u, dup: true, starUp: true, star: ds };
      else { S.inventory['将魂'] = (S.inventory['将魂'] || 0) + 10; results[9] = { unit: u, dup: true, soul: 10, maxed: true }; }
    }
  }
  saveInventory(); saveOwned(); saveGacha(); renderWallet(); renderRecruit(); renderPool(); renderTeams();
  taskBump('recruit', count);
  AudioSys.play(best >= 3 ? 'chime' : 'pull');
  const box = $('#gachaResult');
  box.innerHTML = results.map(r => {
    const cls = r.unit.rarity === '绝世' ? ' myth' : r.unit.rarity === '传奇' ? ' legend' : '';
    return `<div class="gacha-card${cls}${r.dup ? '' : ' new'}">
      <div class="tag">${r.starUp ? '升星 ' + r.star + '★' : r.dup ? '将魂+' + r.soul : '新'}</div>
      <img src="${thumb(r.unit.name)}" alt="${esc(r.unit.name)}">
      <div class="gn">${esc(r.unit.name)}</div></div>`;
  }).join('');
}

const SHOP_SECRET_TTL = 6 * 3600 * 1000;
function shopEpoch() { return Math.floor(Date.now() / SHOP_SECRET_TTL); }
function shopRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function buildSecretShop(epoch, nonce = 0) {
  const rnd = shopRng((epoch * 7919 + nonce * 104729) >>> 0);
  const skills = [...SKILL_DESC.keys()];
  const strats = Object.keys(STRATAGEMS);
  const items = [];
  for (let i = 0; i < 3; i++) {
    const tier = 1 + Math.floor(rnd() * 5);
    const pool = skills.filter(k => (SKILL_RARITY.get(k) === (tier <= 2 ? '传奇' : '绝世')));
    const skill = (pool.length ? pool : skills)[Math.floor(rnd() * (pool.length || skills.length))] || '铁壁';
    const key = `技能书·${tier}阶·${skill}`;
    items.push({ id: `sb${i}`, type: 'skillBook', key, tier, price: 8000 + 4000 * tier, cur: '铜钱', stock: 1 });
  }
  for (let i = 0; i < 3; i++) {
    const tier = 1 + Math.floor(rnd() * 4);
    const strat = strats[Math.floor(rnd() * strats.length)] || '走为上';
    const key = `战法书·${tier}阶·${strat}`;
    items.push({ id: `tb${i}`, type: 'tacticBook', key, tier, price: 400 + 200 * tier, cur: '塔币', stock: 1 });
  }
  return { epoch, nonce, items };
}
function ensureSecretShop() {
  const e = shopEpoch();
  const cur = S.shopStock.secret;
  if (!cur || cur.epoch !== e) {
    S.shopStock.secret = buildSecretShop(e, 0);
    saveShopStock();
  }
  return S.shopStock.secret;
}
function fmtShopLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}
function renderSecretShop(grid) {
  const s = ensureSecretShop();
  const bar = document.createElement('div');
  bar.className = 'shop-refresh';
  bar.innerHTML = `<span>秘籍每 6 小时随机刷新 · 剩余 ${fmtShopLeft((s.epoch + 1) * SHOP_SECRET_TTL - Date.now())}</span>
    <button id="refreshSecret" class="mini">立即刷新（5000 铜钱）</button>`;
  grid.appendChild(bar);
  s.items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'shop-item secret-item';
    const stock = it.stock || 0;
    d.innerHTML = `<div class="si-top"><div class="si-ico">${it.type === 'skillBook' ? '书' : '法'}</div>
        <div><div class="si-name">${esc(it.key)}</div>
        <div class="si-desc">${esc(itemDesc(it.type, it.key))}</div></div></div>
      <div class="si-price"><span class="p"><i class="seal" data-ch="${RES_ICON[it.cur] || '财'}"></i>${it.price} ${it.cur} · 库存 ${stock}</span></div>`;
    const b = document.createElement('button');
    b.textContent = stock > 0 ? '购买' : '售罄';
    b.disabled = stock <= 0 || (S.inventory[it.cur] || 0) < it.price;
    b.onclick = () => {
      if (stock <= 0) return;
      if ((S.inventory[it.cur] || 0) < it.price) { flash(`${it.cur}不足`); return; }
      S.inventory[it.cur] -= it.price;
      S.inventory[it.key] = (S.inventory[it.key] || 0) + 1;
      it.stock -= 1;
      saveInventory(); saveShopStock(); renderWallet(); renderShop();
      flash(`购买 ${it.key}`);
    };
    d.querySelector('.si-price').appendChild(b);
    grid.appendChild(d);
  });
  document.getElementById('refreshSecret').onclick = () => {
    if ((S.inventory['铜钱'] || 0) < 5000) { flash('铜钱不足'); return; }
    S.inventory['铜钱'] -= 5000;
    S.shopStock.secret = buildSecretShop(s.epoch, (s.nonce || 0) + 1);
    saveInventory(); saveShopStock(); renderWallet(); renderShop();
    flash('秘籍已刷新');
  };
  saveShopStock();
}

function renderShop() {
  const grid = $('#shopGrid');
  grid.innerHTML = '';
  const ICON = {'招贤令':'令','金符':'符','兵书':'书','图纸':'图','玄铁':'铁','将魂':'魂','体力':'力'};
  const catOf = it => it.name === '体力' ? '体力' : (['招贤令', '金符'].includes(it.name) ? '招募' : '养成');
  const tabs = ['推荐', '招募', '养成', '体力', '秘籍'];
  if (!S.shopTab) S.shopTab = '推荐';
  const tabBox = $('#shopTabs');
  if (tabBox) {
    tabBox.innerHTML = tabs.map(t => `<button class="${S.shopTab === t ? 'active' : ''}" data-shoptab="${t}">${t}</button>`).join('');
    tabBox.querySelectorAll('button').forEach(b => b.onclick = () => { S.shopTab = b.dataset.shoptab; renderShop(); });
  }
  if (S.shopTab === '秘籍') { renderSecretShop(grid); return; }
  SHOP_ITEMS.filter(it => S.shopTab === '推荐' || catOf(it) === S.shopTab).forEach(it => {
    const key = it.id;
    if (S.shopStock[key] === undefined) S.shopStock[key] = it.stock;
    const stock = S.shopStock[key];
    const d = document.createElement('div'); d.className = 'shop-item';
    d.innerHTML = `<div class="si-top"><div class="si-ico">${ICON[it.name] || '物'}</div>
        <div><div class="si-name">${it.name} ×${it.amount}</div>
        <div class="si-desc">${it.desc}</div></div></div>
      <div class="si-price"><span class="p"><i class="seal" data-ch="${RES_ICON[it.cur] || '财'}"></i>${it.price} ${it.cur} · 库存 ${stock}</span></div>`;
    const b = document.createElement('button');
    b.textContent = stock > 0 ? '购买' : '售罄';
    b.disabled = stock <= 0 || (S.inventory[it.cur] || 0) < it.price;
    b.onclick = () => {
      if ((S.inventory[it.cur] || 0) < it.price) { flash(`${it.cur}不足`); return; }
      S.inventory[it.cur] -= it.price;
      if (it.name === '体力') { if (staminaNow() >= staminaCap()) { flash('体力已满'); return; } S.stamina.value = Math.min(staminaCap(), (S.stamina.value || 0) + it.amount); saveStamina(); renderStamina(); }
      else { S.inventory[it.name] = (S.inventory[it.name] || 0) + it.amount; }
      S.shopStock[key] -= 1;
      saveInventory(); saveShopStock(); renderWallet(); renderShop();
      flash(`购买 ${it.name} ×${it.amount}`);
    };
    d.querySelector('.si-price').appendChild(b);
    grid.appendChild(d);
  });
  saveShopStock();
}

/* 无限将星塔：楼层数据按 200 层一段按需拉取 */
const TOWER_BLOCK = 200;
async function ensureTowerFloors(n) {
  if (!S.towerFloors) S.towerFloors = [];
  let guard = 0;
  while (S.towerFloors.length < n && guard < 20) {
    guard += 1;
    const from = S.towerFloors.length + 1;
    try {
      const r = await fetch(`/api/tower?from=${from}&count=${TOWER_BLOCK}`, { cache: 'no-store' });
      if (!r.ok) break;
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) break;
      S.towerFloors.push(...arr);
    } catch (e) { break; }
  }
  return S.towerFloors;
}

function renderTower() {
  const floor = S.tower.floor || 1;
  const data = S.towerFloors[floor - 1];
  if (!data) {
    // 无限塔：楼层数据没加载过就先拉取，再渲染
    $('#towerInfo').innerHTML = `<b>第 ${floor} 层</b> · 载入中…`;
    $('#towerBuffs').innerHTML = '';
    $('#towerEnemies').innerHTML = '';
    $('#towerChallenge').disabled = true;
    ensureTowerFloors(floor + 12).then(() => { if ((S.tower.floor || 1) === floor) renderTower(); });
    return;
  }
  ensureTowerFloors(floor + 12);   // 提前预取，扫荡和下一层不卡
  const blockStart = Math.floor((floor - 1) / 100) * 100 + 1;
  const blockEnd = blockStart + 99;
  const pct = Math.min(100, Math.max(0, (floor - blockStart) / 100 * 100));
  $('#towerInfo').innerHTML = `<b>第 ${floor} 层</b>${data.boss ? ' · BOSS 层' : ''} · 奖励第 ${data.tier || Math.floor((floor - 1) / 10) + 1} 阶${data.milestone ? ' · <b>百层里程碑</b>' : ''}<br>
    历史最高 ${S.tower.best || 1} 层 · 下一里程碑 ${blockEnd} 层 · 推荐战力 ${data.power}<br>
    奖励：${Object.entries(data.reward).map(([k, v]) => `${k}+${v}`).join('、')}
    <div class="tower-bar"><i style="width:${pct}%"></i></div>
    <div class="tower-marks"><span>${blockStart}</span><span>${blockStart + 24}</span><span>${blockStart + 49}</span><span>${blockStart + 74}</span><span>${blockEnd}</span></div>`;
  $('#towerBuffs').innerHTML = data.buffs.map(b =>
    `<div class="buff-card${S.towerBuff === b.id ? ' active' : ''}" data-buff="${b.id}">
      <b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join('');
  document.querySelectorAll('#towerBuffs .buff-card').forEach(el => {
    el.onclick = () => { S.towerBuff = el.dataset.buff; renderTower(); };
  });
  $('#towerEnemies').innerHTML = data.enemies.map(n => {
    const u = S.by[n];
    return `<span class="enemy-chip"><span class="ph" style="background-image:url('${pthumb(n)}')"></span>
      <span><span class="en">${esc(n)}</span><br><span class="er">${esc(u ? u.rarity + ' · ' + u.role + ' · ' + u.troop : '')}</span></span></span>`;
  }).join('');
  const bt = $('#towerChallenge');
  bt.disabled = !S.towerBuff;
  bt.textContent = S.towerBuff ? `挑战第 ${floor} 层` : '先选择一个增益';
}

async function challengeTower() {
  const floor = S.tower.floor || 1;
  let data = S.towerFloors[floor - 1];
  if (!data) {
    await ensureTowerFloors(floor);
    data = S.towerFloors[floor - 1];
    if (!data) { flash('塔层数据加载失败'); return; }
    renderTower();
  }
  if (!S.towerBuff) { flash('先选择一个增益'); return; }
  const buff = data.buffs.find(b => b.id === S.towerBuff);
  if (!buff) return;
  S.mode = 'tower';
  S.towerData = data;
  S.towerBuffData = buff;
  S.levelData = null; S.levelId = null;
  S.bLocked = true;
  S.b = data.enemies.slice();
  saveFormation();
  showScreen('formation');
  flash(`将星塔第 ${floor} 层 · 增益：${buff.name}`);
}

function openCodex() {
  S.codexReturn = (S.screen === 'codex' ? 'campaign' : S.screen) || 'campaign';
  S.screen = 'codex';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'codex'));
  $('#codex').hidden = false;
  renderCodexFilters();
  renderCodex();
}

function closeCodex() {
  $('#codex').hidden = true;
  if (!S.started) { $('#startMenu').hidden = false; return; }
  showScreen(S.codexReturn || 'campaign');
}

function renderCodexFilters() {
  const box = $('#codexFilters');
  box.innerHTML = '';
  const add = (label, active, fn) => {
    const b = document.createElement('button');
    b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label; b.onclick = fn; box.appendChild(b);
  };
  ['全部', '魏', '蜀', '吴', '群雄'].forEach(f => add(f, S.codexFaction === f, () => { S.codexFaction = f; renderCodexFilters(); renderCodex(); }));
  ['全部', '绝世', '传奇', '精良', '普通'].forEach(r => add(r, S.codexRarity === r, () => { S.codexRarity = r; renderCodexFilters(); renderCodex(); }));
  add('已拥有', !!S.codexOwned, () => { S.codexOwned = !S.codexOwned; renderCodexFilters(); renderCodex(); });
  const roles = ['全部职业', ...[...new Set(S.units.map(u => (u.role || '').split('·')[0]))]];
  const sel = document.createElement('select');
  sel.className = 'codex-role';
  sel.innerHTML = roles.map(r => `<option${(S.codexRole || '全部职业') === r ? ' selected' : ''}>${esc(r)}</option>`).join('');
  sel.onchange = () => { S.codexRole = sel.value; renderCodex(); };
  box.appendChild(sel);
  const inp = document.createElement('input');
  inp.placeholder = '搜索武将';
  inp.value = S.codexSearch;
  inp.oninput = (e) => { S.codexSearch = e.target.value; renderCodex(); };
  box.appendChild(inp);
}

function renderCodex() {
  const q = S.codexSearch.trim();
  const owned = new Set(S.owned);
  const role = S.codexRole || '全部职业';
  const list = S.units.filter(u =>
    (S.codexFaction === '全部' || u.faction === S.codexFaction) &&
    (S.codexRarity === '全部' || u.rarity === S.codexRarity) &&
    (role === '全部职业' || (u.role || '').split('·')[0] === role) &&
    (!S.codexOwned || owned.has(u.name)) &&
    (!q || u.name.includes(q) || u.role.includes(q))
  ).sort((a, b) => (owned.has(b.name) ? 1 : 0) - (owned.has(a.name) ? 1 : 0));
  $('#codexCount').textContent = `拥有 ${S.owned.length} / ${S.units.length} · 显示 ${list.length}`;
  const grid = $('#codexGrid');
  grid.innerHTML = '';
  list.forEach(u => {
    const d = document.createElement('div');
    d.className = 'codex-card' + (owned.has(u.name) ? '' : ' locked');
    d.innerHTML = `<img loading="lazy" src="${SG_IMG.pthumb(u.name)}" alt="${esc(u.name)}">
      <div class="cn">${esc(u.name)}</div><div class="cr">${esc(u.rarity)} · ${esc(u.role)}</div>`;
    d.onclick = () => {
      if (!owned.has(u.name)) { flash('尚未招募，去招贤馆抽取'); return; }
      openDetail(u.name);
    };
    grid.appendChild(d);
  });
}

function growthFromDetail(name) {
  S.growthUnit = name;
  $('#detail').hidden = true;
  if ($('#codex')) $('#codex').hidden = true;
  showScreen('growth');
  renderGrowth();
}
function teamFromDetail(name) {
  if (!S.a.includes(name)) {
    ensureTeamSlots();
    if (teamStar() + starOf(name) > starCap()) { flash(`星力不足：${teamStar()}/${starCap()}，${name} 需 ${starOf(name)} 点`); return; }
    if (!teamAdd(name)) { flash('我军已满 5 人'); return; }
    saveFormation(); renderTeams();
  }
  $('#detail').hidden = true;
  if ($('#codex')) $('#codex').hidden = true;
  showScreen('formation');
}
const FAC_COLOR = { '魏': '#5b8fc9', '蜀': '#c25a4d', '吴': '#4fbf9a', '群雄': '#a77bc4' };
function radarSvg(stats, color) {
  const keys = ['武勇', '智谋', '统御', '机变', '威仪', '天命'];
  const max = Math.max(120, ...keys.map(k => stats[k] || 0));
  const cx = 120, cy = 108, R = 76;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 3;
    const v = Math.max(0.08, (stats[keys[i]] || 0) / max);
    pts.push([cx + Math.cos(ang) * R * v, cy + Math.sin(ang) * R * v]);
  }
  const rings = [0.25, 0.5, 0.75, 1].map(scale => {
    const p = [];
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 3;
      p.push(`${cx + Math.cos(ang) * R * scale},${cy + Math.sin(ang) * R * scale}`);
    }
    return `<polygon points="${p.join(' ')}" fill="none" stroke="rgba(201,167,105,.16)" stroke-width="1"/>`;
  }).join('');
  const axes = keys.map((k, i) => {
    const ang = -Math.PI / 2 + i * Math.PI / 3;
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang) * R}" y2="${cy + Math.sin(ang) * R}" stroke="rgba(201,167,105,.12)"/>`;
  }).join('');
  const labels = keys.map((k, i) => {
    const ang = -Math.PI / 2 + i * Math.PI / 3;
    return `<text x="${cx + Math.cos(ang) * (R + 20)}" y="${cy + Math.sin(ang) * (R + 20) + 4}" text-anchor="middle" fill="#9a927f" font-size="10">${k}</text>`;
  }).join('');
  return `<svg viewBox="0 0 240 216" role="img" aria-label="六维雷达图">
    ${rings}${axes}
    <polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${color}33" stroke="${color}" stroke-width="2"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${color}"/>`).join('')}
    ${labels}</svg>`;
}
function applyDetailArt() {
  const name = S.detailName;
  if (!name) return;
  const portrait = S.detailArt === 'portrait';
  const img = $('#detailCard');
  const full = portrait ? `${SG_IMG.portrait(name)}` : `${SG_IMG.card(name)}`;
  img.classList.toggle('portrait', portrait);
  if (img.dataset.full === full) return;
  img.dataset.full = full;
  img.dataset.name = name;
  img.src = pthumb(name);              // 先出缩略图，避免详情页等待大图
  const pre = new Image();
  pre.onload = () => {
    if (S.detailName === name && img.dataset.full === full) img.src = full;
  };
  pre.src = full;
}
function applyDetailTab() {
  const tab = S.detailTab || 'art';
  $('#detail').dataset.dtab = tab;
  document.querySelectorAll('#detailTabs [data-dtab]').forEach(b => b.classList.toggle('active', b.dataset.dtab === tab));
}

function openDetail(name) {
  const u = S.by[name];
  if (!u) return;
  if (window.HeroShow && HeroShow.warmup) HeroShow.warmup();
  S.detailName = name;
  $('#detailName').textContent = u.name;
  applyDetailArt();
  const fac = u.faction || '群雄';
  const color = FAC_COLOR[fac] || '#e3c27d';
  const box = document.querySelector('#detail .detail-box');
  box.className = 'detail-box fac-' + fac;
  box.style.setProperty('--fac', color);
  $('#detailName').textContent = u.name;
  $('#detailSub').textContent = `${u.faction} · ${u.rarity} · ${u.role} · ${u.troop} · 星力 ${u.star || 1} · 升星 ${unitDupStar(u.name)}★` +
    (((S.unitProgress[name] || {}).branch && BRANCHES[(S.unitProgress[name] || {}).branch])
      ? ` · ${BRANCHES[S.unitProgress[name].branch].name}` : '');
  const stats = ['武勇', '智谋', '统御', '机变', '威仪', '天命'];
  $('#detailRadar').innerHTML = radarSvg(u.stats, color);
  $('#detailStats').innerHTML = stats.map(k => `<div class="stat">${k}<b>${u.stats[k]}</b></div>`).join('');
  const ownedNow = S.owned.includes(name);
  $('#detailActions').innerHTML = `<button class="start mini" onclick="growthFromDetail('${esc(name)}')">前往养成</button>
    <button class="ghost mini" onclick="teamFromDetail('${esc(name)}')">编入我军</button>
    <button class="ghost mini" onclick="openBag()">背包</button>
    ${ownedNow ? `<button class="ghost mini" onclick="decomposeUnit('${esc(name)}')">分解</button>` : ''}`;
  renderDetailSlots(name);
  const _unitBonds = bondsForUnit(u.name);
  $('#detailBonds').innerHTML = '<div class="dl">羁绊</div>' + (_unitBonds.length
    ? `<div class="bond-chips">${_unitBonds.map(b => bondChipHtml(b, bondHave(b))).join('')}</div>
       <div class="row">上阵/助阵中同时拥有对应武将即可触发；悬停或点击查看条件与效果。</div>`
    : '<div class="row">暂无羁绊组合。</div>');
  const bioText = u.bio || '暂无传记。';
  const bioCmt = u.comment || '';
  renderDetailAffinity(name);
  $('#detailBio').innerHTML = `<div class="dl">人物传记</div>
    <div class="bio-text">${esc(bioText)}</div>
    ${bioCmt ? `<div class="bio-comment">「${esc(bioCmt)}」</div>` : ''}
    <div class="bio-line">语音 0 / 5 · 出战、突破、觉醒可解锁</div>`;
  const order = ['普攻', '战法', '奇谋', '被动', '特色'];
  $('#detailSkills').innerHTML = '<div class="dl">技能</div>' + order.filter(t => u.skills && u.skills[t]).map(t => {
    const sk = u.skills[t];
    return `<div class="row"><b>${esc(sk.name)}</b>（${t}）${esc(sk.desc || '')}</div>`;
  }).join('');
  $('#detailTalents').innerHTML = '<div class="dl">天赋</div>' + (u.talents || []).map(t =>
    `<div class="row"><b>${esc(t.name)}</b>（${esc(t.cond)}）${esc(t.desc)}</div>`).join('');
  applyDetailTab();
  $('#detail').hidden = false;
}

function renderFilters() {
  const el = $('#filters');
  el.innerHTML = '';
  ['全部', '魏', '蜀', '吴', '群雄'].forEach(f => {
    const b = document.createElement('button');
    b.className = 'chip' + (S.faction === f ? ' active' : '');
    b.textContent = f;
    b.onclick = () => { S.faction = f; renderFilters(); renderPool(); };
    el.appendChild(b);
  });
  ['全部', '绝世', '传奇', '精良', '普通'].forEach(r => {
    const b = document.createElement('button');
    b.className = 'chip' + (S.rarity === r ? ' active' : '');
    b.textContent = r;
    b.onclick = () => { S.rarity = r; renderFilters(); renderPool(); };
    el.appendChild(b);
  });
}

function filtered() {
  const q = S.q.trim();
  return S.units.filter(u => S.owned.includes(u.name)).filter(u =>
    (S.faction === '全部' || u.faction === S.faction) &&
    (S.rarity === '全部' || u.rarity === S.rarity) &&
    (!q || u.name.includes(q) || u.role.includes(q))
  );
}

function renderPool() {
  const pool = $('#pool');
  pool.innerHTML = '';
  const list = filtered();
  if (!list.length) { pool.innerHTML = '<div style="color:#9c8f7c;padding:10px">没有匹配的武将</div>'; return; }
  list.forEach(u => {
    const d = document.createElement('div');
    const inSup = (S.support || []).includes(u.name);
    const used = S.a.includes(u.name) || inSup;
    d.className = 'unit' + (used ? ' used' : '') + (inSup ? ' support' : '');
    d.innerHTML = `<div class="uph" style="background-image:url('${pthumb(u.name)}')"></div>
      <div class="umeta"><div class="n">${esc(u.name)}</div>
      <div class="r">${esc(u.role)} · ${esc(u.faction)}</div><div class="ustar">星力 ${u.star || 1} · 升星 ${unitDupStar(u.name)}★</div></div>
      <div class="rar ${u.rarity}">${u.rarity}</div>${inSup ? '<i class="sup-mark">助</i>' : ''}`;
    d.onclick = () => addUnit(u.name);
    pool.appendChild(d);
  });
}

function addUnit(name) {
  const cap = modeTeamCap();
  if (S.a.includes(name)) { flash('该武将已在我军中'); return; }
  if ((S.support || []).includes(name)) { flash('该武将在助阵位，点击助阵槽可移出'); return; }
  ensureTeamSlots();
  if (S.a.includes(null) || teamCount() < cap) {
    if (teamStar() + starOf(name) > starCap()) { flash(`星力不足：${teamStar()}/${starCap()}，${name} 需 ${starOf(name)} 点`); return; }
    if (!teamAdd(name)) { flash(`我军已满 ${cap} 人`); return; }
  } else if (S.support.length < 3) {
    S.support.push(name);
    flash(`${name} 加入助阵`);
  } else {
    flash(`我军已满 ${cap} 人，助阵也已满`);
    return;
  }
  saveFormation();
  renderTeams(); renderPool();
}

const TROOP_COUNTER = { 步兵: '骑兵', 骑兵: '弓兵', 弓兵: '方士', 方士: '步兵' };
const TROOP_CHAR = { 步兵: '步', 骑兵: '骑', 弓兵: '弓', 方士: '方' };
function troopCounts(names) {
  const out = {};
  (names || []).forEach(n => {
    const u = S.by[n];
    if (!u) return;
    out[u.troop] = (out[u.troop] || 0) + 1;
  });
  return out;
}
function troopChips(counts, cls) {
  return Object.entries(counts).map(([t, n]) =>
    `<span class="troop-chip ${cls || ''}"><i>${TROOP_CHAR[t] || '·'}</i>${esc(t)} ×${n}</span>`).join('');
}
function renderTroopPanel() {
  const box = $('#troopPanel');
  if (!box) return;
  if (S.mode === 'none') { box.innerHTML = ''; return; }
  const ours = (S.a || []).filter(n => S.by[n]).slice(0, modeTeamCap());
  const enemies = (S.b || []).filter(n => S.by[n]);
  const oc = troopCounts(ours), ec = troopCounts(enemies);
  const adv = [], dis = [];
  Object.entries(oc).forEach(([t, n]) => {
    const target = TROOP_COUNTER[t];
    if (ec[target]) adv.push(`${t} 克 ${target} ×${Math.min(n, ec[target])}`);
    const src = Object.keys(TROOP_COUNTER).find(k => TROOP_COUNTER[k] === t);
    if (src && ec[src]) dis.push(`${t} 被 ${src} 克 ×${Math.min(n, ec[src])}`);
  });
  const posText = S.mode === 'ancient' ? '1-4 一队 / 5-8 二队' : (S.mode === 'secret' || S.mode === 'personal' ? `${ours.length} 人上阵` : `前 3 后 2`);
  box.innerHTML = `<div class="troop-head"><span>兵种克制 <em>克制 +12% · 被克 -8%</em></span><b>${posText}</b></div>
    <div class="troop-cols">
      <div class="troop-col"><span class="tc-tag">我军</span>${troopChips(oc, 'ally') || '<span class="troop-empty">未编队</span>'}</div>
      <div class="troop-col"><span class="tc-tag">敌军</span>${troopChips(ec, 'enemy') || '<span class="troop-empty">—</span>'}</div>
    </div>
    <div class="troop-tips">${adv.length ? `优势：${adv.join('、')}` : ''}${adv.length && dis.length ? ' ｜ ' : ''}${dis.length ? `劣势：${dis.join('、')}` : ''}${!adv.length && !dis.length ? '暂无克制关系' : ''}</div>`;
}

function renderTeams() {
  ensureTeamSlots();
  const cap = modeTeamCap();
  // 助阵位不能与主力/敌军重复
  S.support = (S.support || []).filter(n => S.owned.includes(n) && !S.a.includes(n)).slice(0, 3);
  const box = $('#teamA');
  if (box) {
    box.classList.toggle('many', cap > 5);
    box.innerHTML = '';
    for (let i = 0; i < cap; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (S.a[i] ? ' filled' : '') + (S.a[i] ? '' : ' empty-slot');
      if (S.a[i]) {
        const _u = S.by[S.a[i]] || {};
      const rar = _u.rarity || '';
        slot.innerHTML = `<div class="ph" style="background-image:url('${pthumb(S.a[i])}')"></div>
          <div class="cap">${esc(S.a[i])}</div><div class="rar-line ${rar}"></div>
          <i class="slot-troop">${TROOP_CHAR[_u.troop] || '·'}</i><i class="slot-star">星${starOf(S.a[i])}</i>${S.mode === 'ancient' ? `<i class="team-tag">${i < 4 ? '一' : '二'}</i>` : ''}`;
        slot.title = '点击移除';
        slot.onclick = () => { S.a[i] = null; saveFormation(); renderTeams(); renderPool(); };
      } else {
        slot.textContent = '空';
      }
      box.appendChild(slot);
    }
  }
  const ac = $('#acount'); if (ac) ac.textContent = `${teamCount()}/${cap}`;
  const scEl = $('#starcount');
  if (scEl) {
    scEl.textContent = `星力 ${teamStar()}/${starCap()}`;
    scEl.classList.toggle('over', teamStar() > starCap());
    scEl.title = '将星塔每 10 层 +1，上限 39';
  }
  const needA = modeNeedA();
  const hasStage = S.mode !== 'none' && S.b.length > 0;
  const overStar = teamStar() > starCap();
  const ruleErr = overStar ? `星力超限 ${teamStar()}/${starCap()}`
    : S.mode === 'trial' ? trialRuleError(S.a, S.trialData)
    : S.mode === 'personal' && S.personalName && !teamActive().slice(0, 3).includes(S.personalName)
      ? `需要 ${S.personalName} 上阵` : '';
  const ok = hasStage && teamCount() >= needA && !ruleErr;
  const btn = $('#start');
  if (btn) {
    btn.disabled = hasStage ? !ok : false;
    const ancientPhase = S.mode === 'ancient' && S.ancientRun ? (S.ancientRun.phase === 2 ? 2 : 1) : 1;
    btn.textContent = !hasStage ? '前往征战选择关卡'
      : ok ? (S.mode === 'ancient' ? (ancientPhase === 2 ? '二队出战' : '一队出战') : '开始战斗')
      : ruleErr ? ruleErr
      : `请先编满 ${needA} 名武将`;
  }
  const fl = $('#formationLevel');
  if (fl) fl.textContent = S.mode === 'tower' && S.towerData
    ? `将星塔 · 第${S.towerData.floor}层${S.towerData.boss ? ' BOSS' : ''}`
    : S.mode === 'dungeon' && S.dungeonData
      ? `副本 · ${S.dungeonData.cat} · ${S.dungeonData.difficulty}`
      : S.mode === 'ancient' && S.ancientData
        ? `上古 · ${S.ancientData.beast} · 第${S.ancientData.stage}阶段 · ${S.ancientRun && S.ancientRun.phase === 2 ? '二队(5-8号位)出战' : '一队(1-4号位)出战'}`
        : S.mode === 'secret' && S.secretData
          ? `秘境 · 第${S.secret.floor}层`
          : S.mode === 'trial' && S.trialData
            ? `试炼 · ${S.trialData.name} · ${S.trialData.desc}`
          : S.mode === 'personal' && S.personalData
            ? `个人传 · ${S.personalName} · 需 ${S.personalName} 上阵`
          : S.mode === 'worldboss' && S.worldBossData
            ? `世界首领 · ${S.worldBossData.boss} · 今日最佳 ${S.worldBoss.best || 0}`
          : S.mode === 'survival' && S.survivalData
            ? `无尽生存 · 第 ${S.survivalData.wave} 波 · 历史最高 ${S.survival.best || 0}`
              + (S.survival.upgrades.length ? ` · 强化 ${S.survival.upgrades.length}` : '')
          : S.levelData
            ? `第${S.levelData.id}关 · ${S.levelData.name} · 词条：${levelModifier(S.levelData.id).name}`
            : '未选择关卡 · 请先前往征战';
  if (fl) {
    if (S.mode === 'ancient' && S.ancientRun && S.ancientRun.phase === 2) {
      fl.textContent += S.ancientRun.wins[0]
        ? ' · 先锋余威：攻+10%/减伤+5%/回怒'
        : ' · 背水一战：攻+15%/残血增伤';
    }
    const act = activeBondsList();
    if (act.length) fl.textContent += ` · 羁绊 ${act.length} 条`;
  }
  renderSupport();
  renderBondPanel();
  renderTroopPanel();
}

function fillTeam(n) {
  ensureTeamSlots();
  if (teamCount() >= n) return;
  const pool = S.units.filter(u => S.owned.includes(u.name) && !S.a.includes(u.name) &&
    !(S.support || []).includes(u.name)).sort((a, b) => (b.power || 0) - (a.power || 0));
  while (teamCount() < n) {
    const reserve = Math.max(0, n - teamCount() - 1);
    let idx = pool.findIndex(u => starOf(u.name) <= starRemain() - reserve);
    if (idx < 0) idx = pool.findIndex(u => starOf(u.name) <= starRemain());
    if (idx < 0) break;
    teamAdd(pool.splice(idx, 1)[0].name);
  }
  saveFormation(); renderTeams();
}

function randomFill() {
  ensureTeamSlots();
  const cap = modeTeamCap();
  const pool = S.units.filter(u => S.owned.includes(u.name) && !S.a.includes(u.name) &&
    !(S.support || []).includes(u.name));
  while (teamCount() < cap) {
    const reserve = Math.max(0, cap - teamCount() - 1);
    let fit = pool.filter(u => starOf(u.name) <= starRemain() - reserve);
    if (!fit.length) fit = pool.filter(u => starOf(u.name) <= starRemain());
    if (!fit.length) break;
    const i = Math.floor(Math.random() * fit.length);
    const name = fit[i].name;
    pool.splice(pool.indexOf(fit[i]), 1);
    teamAdd(name);
  }
  saveFormation();
  renderTeams(); renderPool();
}

function showComboBanner(text) {
  let el = $('#comboBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'comboBanner';
    el.className = 'combo-banner';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showComboBanner._t);
  showComboBanner._t = setTimeout(() => { el.hidden = true; }, 1800);
}

function smartFormation() {
  const cap = modeTeamCap();
  const enemies = S.b || [];
  const enemyTroops = [...new Set(enemies.map(n => (S.by[n] || {}).troop).filter(Boolean))];
  const pool = S.units.filter(u => S.owned.includes(u.name) && !enemies.includes(u.name));
  const picks = [];
  if (S.mode === 'personal' && S.personalName && pool.some(u => u.name === S.personalName)) {
    picks.push(S.personalName);
  }
  const score = (u) => {
    let s = u.power || 0;
    enemyTroops.forEach(t => {
      if (TROOP_COUNTER[u.troop] === t) s += 90;
      if (TROOP_COUNTER[t] === u.troop) s -= 45;
    });
    s += (affLevel(u.name) || 0) * 8;
    const names = [...picks, u.name];
    (S.bondDefs || []).forEach(b => {
      const have = b.members.filter(m => names.includes(m)).length;
      if (have >= b.need) s += 140;
      else if (have > 0) s += have * 12;
    });
    return s;
  };
  const picksStar = () => picks.reduce((sum, n) => sum + starOf(n), 0);
  while (picks.length < cap) {
    const remain = starCap() - picksStar();
    const reserve = Math.max(0, cap - picks.length - 1);
    let cands = pool.filter(u => !picks.includes(u.name) && starOf(u.name) <= remain - reserve);
    if (!cands.length) cands = pool.filter(u => !picks.includes(u.name) && starOf(u.name) <= remain);
    if (S.mode === 'trial' && S.trialData && S.trialData.req) {
      const req = S.trialData.req;
      const key = req.type === 'faction' ? 'faction' : 'troop';
      const matched = cands.filter(u => u[key] === req.value);
      const needMore = picks.filter(n => (S.by[n] || {})[key] === req.value).length < req.min;
      if (needMore && matched.length) cands = matched;
    }
    if (!cands.length) break;
    cands.sort((a, b) => score(b) - score(a));
    picks.push(cands[0].name);
  }
  S.a = picks.slice(0, cap);
  ensureTeamSlots();
  saveFormation();
  autoSupport();
  renderTeams(); renderPool();
  flash(`智能编队：${picks.join('、')} · 星力 ${picksStar()}/${starCap()}${picks.length < cap ? '（受星力上限限制）' : ''}${S.support && S.support.length ? ` · 助阵 ${S.support.join('、')}` : ''}`);
}

function flash(msg) {
  $('#status').textContent = msg;
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(flash._timer);
    flash._timer = setTimeout(() => t.classList.remove('show'), 1800);
  }
  setTimeout(() => { $('#status').textContent = '星命既定'; }, 1600);
}


function bagCard(type, k) {
  const meta = itemShort(type, k);
  const n = S.inventory[k] || 0;
  if (type === 'skillBook' || type === 'tacticBook') {
    const cat = itemCat(type, k);
    const btn = type === 'tacticBook' && tacticBookInfo(k).tier < 6
      ? `<button class="mini ghost bc-btn" onclick="upgradeTacticBook('${esc(k)}')">2本升阶</button>` : '';
    return `<div class="bag-card">
      <div class="bc-head">${catChip(cat)}<b title="${esc(meta.name)}">${esc(meta.name)}</b>
        <em>${esc(meta.tier)}</em><span class="bc-n">×${n}</span></div>
      <div class="bc-desc">${esc(meta.desc)}</div>${btn ? `<div class="bc-foot">${btn}</div>` : ''}</div>`;
  }
  if (type === 'relic') {
    const r = (S.relics || {})[k] || {};
    return `<div class="bag-card">
      <div class="bc-head"><i class="cat rar ${r.rarity || '精良'}">${r.rarity || '精良'}</i>
        <b title="${esc(meta.name)}">${esc(meta.name)}</b><span class="bc-n">×${n}</span></div>
      <div class="bc-desc">${esc(meta.desc)}</div>${r.desc ? `<div class="bc-flavor">${esc(r.desc)}</div>` : ''}</div>`;
  }
  if (type === 'shard') {
    return `<div class="bag-card">
      <div class="bc-head"><i class="cat cat-support">碎片</i><b>神器碎片</b><span class="bc-n">${n}/20</span></div>
      <div class="bc-desc">20 个合成随机神器</div>
      <div class="bc-foot"><button class="mini ghost bc-btn" onclick="synthesizeArtifact()">合成</button></div></div>`;
  }
  if (type === 'artifact') {
    const lv = artifactLevel(k);
    const a = ARTIFACTS[k] || {};
    const cost = artifactRefineCost(k);
    const costText = `神兵${cost.神兵} + 碎片${cost.神器碎片} + 铜钱${cost.铜钱}`;
    const can = lv < 5 && (S.inventory['神兵'] || 0) >= cost.神兵 && (S.inventory['神器碎片'] || 0) >= cost.神器碎片 && (S.inventory['铜钱'] || 0) >= cost.铜钱;
    return `<div class="bag-card">
      <div class="bc-head"><i class="cat rar ${a.rarity || '传奇'}">${a.rarity || '传奇'}</i><b>${esc(meta.name)}</b><span class="bc-n">${lv}★ · ×${n}</span></div>
      <div class="bc-desc">${esc(meta.desc)}</div>
      <div class="bc-foot">${lv >= 5 ? '<span class="gb-note">已满 5 星</span>' : `<button class="mini${can ? '' : ' ghost'} bc-btn" ${can ? '' : 'disabled'} onclick="refineArtifact('${esc(k)}')">精炼 ${lv + 1}★（${esc(costText)}）</button>`}</div></div>`;
  }
  return `<div class="bag-card">
    <div class="bc-head"><i class="cat cat-support">神器</i><b>${esc(meta.name)}</b><span class="bc-n">×${n}</span></div>
    <div class="bc-desc">${esc(meta.desc)}</div></div>`;
}

function renderBag(tab) {
  const box = $('#bagGrid');
  const tabs = $('#bagTabs');
  if (!box) return;
  S.bagTab = tab || S.bagTab || 'all';
  const keys = Object.keys(S.inventory).filter(k => (S.inventory[k] || 0) > 0);
  const isSkill = k => k.startsWith('技能书·');
  const isTactic = k => k.startsWith('战法书·');
  const isArtifact = k => !!ARTIFACTS[k];
  const isRelic = k => k.startsWith('秘宝·');
  const isShard = k => k === '神器碎片';
  const tierOf = k => Number((k.match(/(\d+)阶/) || [0, 99])[1]);
  const bagQ = (S.bagSearch || '').trim();
  const bagMatch = k => {
    if (!bagQ) return true;
    const type = isSkill(k) ? 'skillBook' : isTactic(k) ? 'tacticBook' : isRelic(k) ? 'relic' : isArtifact(k) ? 'artifact' : 'shard';
    const label = isSkill(k) || isTactic(k) ? itemShort(type, k).name
      : isRelic(k) ? ((S.relics || {})[k] || {}).name || k : k;
    const desc = type === 'shard' ? '神器碎片' : itemDesc(type, k);
    return k.includes(bagQ) || label.includes(bagQ) || desc.includes(bagQ);
  };
  const bagKeys = keys.filter(bagMatch);
  const groups = {
    skillBook: bagKeys.filter(isSkill),
    tacticBook: bagKeys.filter(isTactic),
    relic: bagKeys.filter(isRelic),
    artifact: bagKeys.filter(isArtifact),
    shard: bagKeys.filter(isShard),
  };
  const catOrder = Object.keys(ITEM_CATS);
  const sortBooks = (arr, type) => arr.sort((a, b) =>
    catOrder.indexOf(itemCat(type, a)) - catOrder.indexOf(itemCat(type, b)) ||
    tierOf(a) - tierOf(b) || a.localeCompare(b));
  sortBooks(groups.skillBook, 'skillBook');
  sortBooks(groups.tacticBook, 'tacticBook');
  const total = Object.values(groups).reduce((n, a) => n + a.length, 0);
  if (tabs) {
    const defs = [['all', '全部', total], ['skillBook', '技能书', groups.skillBook.length],
      ['tacticBook', '战法书', groups.tacticBook.length], ['relic', '秘宝', groups.relic.length],
      ['artifact', '神器', groups.artifact.length], ['shard', '碎片', groups.shard.length]];
    tabs.innerHTML = defs.map(([k, t, n]) =>
      `<button class="${S.bagTab === k ? 'active' : ''}" data-bagtab="${k}">${t}${n ? ` ${n}` : ''}</button>`).join('');
    tabs.querySelectorAll('[data-bagtab]').forEach(b => b.onclick = () => renderBag(b.dataset.bagtab));
  }
  const search = $('#bagSearch');
  if (search && search.value !== (S.bagSearch || '')) search.value = S.bagSearch || '';
  if (search && !search.oninput) search.oninput = (e) => { S.bagSearch = e.target.value; renderBag(); };
  if (!total) {
    box.innerHTML = `<div class="bag-empty">${bagQ ? '没有匹配的物品。' : '暂无特殊物品。<br>技能书、战法书、神器碎片与章节秘宝会在这里显示；常规资源见顶部资源栏。'}</div>`;
    return;
  }
  const titles = { skillBook: '技能书', tacticBook: '战法书', relic: '章节秘宝', artifact: '神器', shard: '神器碎片' };
  const section = (title, type, arr) => {
    if (!arr.length) return '';
    return `<div class="bag-sec">${title} · ${arr.length}</div>` + arr.map(k => bagCard(type, k)).join('');
  };
  let html = '';
  if (S.bagTab === 'all') {
    ['skillBook', 'tacticBook', 'relic', 'artifact', 'shard'].forEach(t => { html += section(titles[t], t, groups[t]); });
  } else {
    html = section(titles[S.bagTab], S.bagTab, groups[S.bagTab]);
  }
  box.innerHTML = html || '<div class="bag-empty">该分类暂无物品</div>';
}
function openBag() { renderBag(); $('#bag').hidden = false; }

/* 存档导出 / 导入：只处理游戏数据键，画质与音量等设置不随存档走 */
const SAVE_KEYS = ['sg_config', 'sg_progress', 'sg_clears', 'sg_inventory', 'sg_units', 'sg_formation', 'sg_owned', 'sg_gacha', 'sg_tower', 'sg_stamina', 'sg_secret', 'sg_season', 'sg_shop', 'sg_story', 'sg_tasks', 'sg_chapters', 'sg_relics', 'sg_trials', 'sg_achieve', 'sg_affinity', 'sg_worldboss', 'sg_expedition', 'sg_survival', 'sg_ancientrun', 'sg_newbie', 'sg_codexgift', 'sg_artifacts'];

function saveSummary() {
  let n = 0, bytes = 0;
  for (const k of SAVE_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) { n++; bytes += k.length + v.length; }
  }
  return n ? `${n} 项数据 · ${(bytes / 1024).toFixed(1)} KB` : '暂无存档';
}

function exportSave() {
  const data = {};
  for (const k of SAVE_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  if (!Object.keys(data).length) { flash('暂无可导出的存档'); return; }
  const payload = { game: '三国将星录', version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `将星录存档_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  flash('存档已导出');
}

function importSave(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const data = obj && obj.data && typeof obj.data === 'object' ? obj.data : obj;
      if (!data || typeof data !== 'object' || !data.sg_progress) throw new Error('不是有效的将星录存档');
      if (!confirm('导入存档将覆盖当前进度（画质、音量等设置不变），确定继续？')) return;
      for (const k of SAVE_KEYS) localStorage.removeItem(k);
      for (const k of SAVE_KEYS) {
        if (data[k] === undefined || data[k] === null) continue;
        localStorage.setItem(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]));
      }
      location.reload();
    } catch (e) {
      alert('导入失败：' + (e && e.message ? e.message : '文件格式错误'));
    }
  };
  reader.onerror = () => alert('读取存档文件失败');
  reader.readAsText(file, 'utf-8');
}

function setupLordPick() {
  const pick = $('#lordPick');
  if (!pick) return;
  const faces = (typeof LORD_FACES !== 'undefined') ? LORD_FACES
    : ['汉室宗亲', '江东少主', '西凉雄主', '寒门游侠'];
  const cur = (typeof lordArtIndex === 'function') ? lordArtIndex() : 1;
  if (pick.dataset.built !== '1') {
    pick.innerHTML = faces.map((n, i) =>
      `<button type="button" class="lord-opt" data-face="${i + 1}" title="${n}">` +
      `<img src="assets/story/lord_thumb${i + 1}.jpg" alt="${n}" loading="lazy" decoding="async"></button>`).join('');
    pick.dataset.built = '1';
  }
  Array.from(pick.querySelectorAll('.lord-opt')).forEach(b => {
    b.classList.toggle('active', Number(b.dataset.face) === cur);
    b.onclick = () => {
      localStorage.setItem('sg_lord_face', b.dataset.face);
      Array.from(pick.querySelectorAll('.lord-opt')).forEach(x => x.classList.toggle('active', x === b));
      flash('主公形象已更换，下次剧情演出生效');
    };
  });
}
function setupSettings() {
  const q = localStorage.getItem('sg_quality') || 'hd';
  const bgm = localStorage.getItem('sg_bgm') || '60';
  const sfx = localStorage.getItem('sg_sfx') || '80';
  document.body.dataset.quality = q;
  if ($('#setQuality')) $('#setQuality').value = q;
  if ($('#setMusic')) { $('#setMusic').value = bgm; $('#setMusicVal').textContent = bgm; }
  if ($('#setSfx')) { $('#setSfx').value = sfx; $('#setSfxVal').textContent = sfx; }
  if ($('#setSaveInfo')) $('#setSaveInfo').textContent = saveSummary();
  if (typeof setupLordPick === 'function') setupLordPick();
}
function bind() {
  AudioSys.setBgm(+(localStorage.getItem('sg_bgm') || 60));
  AudioSys.setSfx(+(localStorage.getItem('sg_sfx') || 80));
  document.addEventListener('pointerdown', (e) => {
    AudioSys.unlock();
    if (e.target.closest && e.target.closest('button')) AudioSys.play('click');
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) AudioSys.suspend(); else AudioSys.resume();
  });
  $('#openSettings').onclick = () => { setupSettings(); $('#settingsModal').hidden = false; };
  $('#closeSettings').onclick = () => { $('#settingsModal').hidden = true; };
  $('#setQuality').onchange = (e) => {
    document.body.dataset.quality = e.target.value;
    localStorage.setItem('sg_quality', e.target.value);
    if (window.HeroShow) HeroShow.setQuality(e.target.value);
  };
  $('#setMusic').oninput = (e) => { $('#setMusicVal').textContent = e.target.value; localStorage.setItem('sg_bgm', e.target.value); AudioSys.setBgm(+e.target.value); };
  $('#setSfx').oninput = (e) => { $('#setSfxVal').textContent = e.target.value; localStorage.setItem('sg_sfx', e.target.value); AudioSys.setSfx(+e.target.value); };
  if ($('#redeemBtn')) $('#redeemBtn').onclick = redeemCode;
  if ($('#redeemCode')) $('#redeemCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') redeemCode(); });
  $('#viewStats').onclick = () => { renderBattleStats(); $('#battleStats').hidden = false; };
  $('#closeBattleStats').onclick = () => { $('#battleStats').hidden = true; };
  $('#battleStats').onclick = (e) => { if (e.target.id === 'battleStats') $('#battleStats').hidden = true; };
  $('#exportSave').onclick = exportSave;
  $('#importSave').onclick = () => { const f = $('#importFile'); f.value = ''; f.click(); };
  $('#importFile').onchange = (e) => importSave(e.target.files && e.target.files[0]);
  $('#clearSave').onclick = () => {
    if (!confirm('确定清空本地存档？此操作不可恢复（已导出的存档文件不受影响）。')) return;
    for (const k of SAVE_KEYS) localStorage.removeItem(k);
    location.reload();
  };
  $('#rosterSort').onchange = (e) => { S.rosterSort = e.target.value; renderRoster(); };
  $('#rosterFormation').onclick = () => showScreen('formation');
  if ($('#rosterBag')) $('#rosterBag').onclick = openBag;
  if ($('#growthBack')) $('#growthBack').onclick = () => showScreen('roster');
  if ($('#growthDetail')) $('#growthDetail').onclick = () => { if (S.growthUnit) openDetail(S.growthUnit); };
  if ($('#growthBag')) $('#growthBag').onclick = openBag;
  $('#closeItemPicker').onclick = () => { $('#itemPicker').hidden = true; };
  $('#itemPicker').onclick = (e) => { if (e.target.id === 'itemPicker') $('#itemPicker').hidden = true; };
  document.querySelectorAll('.detail-art-tabs button').forEach(b => b.onclick = () => {
    S.detailArt = b.dataset.art;
    document.querySelectorAll('.detail-art-tabs button').forEach(x => x.classList.toggle('active', x === b));
    applyDetailArt();
  });
  $('#openBag').onclick = openBag;
  $('#closeBag').onclick = () => { $('#bag').hidden = true; };
  $('#bag').onclick = (e) => { if (e.target.id === 'bag') $('#bag').hidden = true; };
  setupSettings();
  $('#growthUnit').onchange = (e) => { S.growthUnit = e.target.value; renderGrowth(); };
  $('#search').oninput = (e) => { S.q = e.target.value; renderPool(); };
  $('#continueBtn').onclick = () => startGame(false);
  $('#newBtn').onclick = () => {
    if (hasSave() && !confirm('清空本地存档并重新开始？')) return;
    startGame(true);
  };
  $('#menuCodex').onclick = () => { openCodex(); };
  document.querySelectorAll('#nav button').forEach(b => {
    b.onclick = () => showScreen(b.dataset.nav);
  });
  document.querySelectorAll('.home-tiles button').forEach(b => {
    b.onclick = () => {
      if (b.dataset.go === 'codex') openCodex();
      else if (b.dataset.go === 'travel') travel();
      else if (b.dataset.go === 'bag') openBag();
      else showScreen(b.dataset.go);
    };
  });
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => showScreen('home'); });
  document.querySelectorAll('.pool-tabs button').forEach(b => {
    b.onclick = () => { S.recruitPool = b.dataset.pool; renderRecruit(); };
  });
  $('#pull1').onclick = () => doGacha(1);
  $('#pull10').onclick = () => doGacha(10);
  $('#towerChallenge').onclick = challengeTower;
  if ($('#towerSweep')) $('#towerSweep').onclick = async () => {
    await ensureTowerFloors((S.tower.floor || 1) + 10);
    openSweepFor('tower');
  };
  if ($('#secretSweep')) $('#secretSweep').onclick = () => openSweepFor('secret');
  $('#toFormation').onclick = () => showScreen('formation');
  if ($('#sweepBtn')) $('#sweepBtn').onclick = openSweep;
  if ($('#sweepStart')) $('#sweepStart').onclick = doSweep;
  // 扫荡弹窗只允许点右上角 × 关闭；点背景不再关闭，防止点按钮时误触把结算关掉
  if ($('#closeSweep')) $('#closeSweep').onclick = () => {
    $('#sweepModal').hidden = true;
    sweepPing('sweep-close');
    showLastSweepLoot();
  };
  $('#closeCodex').onclick = closeCodex;
  if ($('#codexRewards')) $('#codexRewards').onclick = () => {
    $('#codex').hidden = true; S.achTab = 'collection'; showScreen('achieve');
  };
  $('#closeDetail').onclick = () => { $('#detail').hidden = true; };
  document.querySelectorAll('#detailTabs [data-dtab]').forEach(b => {
    b.onclick = () => { S.detailTab = b.dataset.dtab; applyDetailTab(); };
  });
  $('#detail').onclick = (e) => { if (e.target.id === 'detail') $('#detail').hidden = true; };
  if ($('#homeHero')) $('#homeHero').onclick = (e) => {
    if (e.target.closest && e.target.closest('button')) return;
    S.heroClicks = (S.heroClicks || 0) + 1;
    if (S.heroClicks % 12 === 0) {
      const lines = ['军师：主公，主城快被您点出包浆了。', '远处传来一声猫叫，随后归于寂静。',
        '主公，今日宜出征，不宜戳城。', '守门军士：主公……您又来了。'];
      flash(lines[Math.floor(S.heroClicks / 12) % lines.length]);
      try { AudioSys.play('chime'); } catch (e2) { /* ignore */ }
    }
  };
  if ($('#detailCard')) $('#detailCard').onclick = () => {
    const nm = S.detailName;
    if (!nm) return;
    S.eggClicks = S.eggClicks || {};
    const c = (S.eggClicks[nm] || 0) + 1;
    S.eggClicks[nm] = c;
    if (c % 7 === 0) {
      const line = AFF_EGG_LINES[nm] || AFF_EGG_FALLBACK[(c / 7) % AFF_EGG_FALLBACK.length];
      flash(line);
      try { AudioSys.play('chime'); } catch (e) { /* ignore */ }
    }
  };
  $('#randomA').onclick = () => randomFill();
  if ($('#smartA')) $('#smartA').onclick = smartFormation;
  if ($('#rosterBatch')) $('#rosterBatch').onclick = openBatchDecompose;
  if ($('#closeBatch')) $('#closeBatch').onclick = closeBatchModal;
  if ($('#batchCancel')) $('#batchCancel').onclick = closeBatchModal;
  if ($('#batchCommon')) $('#batchCommon').onclick = () => batchSelectRarity('普通');
  if ($('#batchFine')) $('#batchFine').onclick = () => batchSelectRarity('精良');
  if ($('#batchConfirm')) $('#batchConfirm').onclick = confirmBatchDecompose;
  if ($('#comboBtn')) $('#comboBtn').onclick = useCombo;
  if ($('#closeExp')) $('#closeExp').onclick = () => { $('#expeditionModal').hidden = true; S.expDraft = null; };
  if ($('#expDispatch')) $('#expDispatch').onclick = dispatchExpedition;
  setInterval(tickExpedition, 1000);
  // 羁绊：悬停显示，点击固定/取消
  document.addEventListener('mouseover', (e) => {
    const c = e.target.closest && e.target.closest('.bond-chip[data-bond]');
    if (c) showBondTip(c);
  });
  document.addEventListener('mouseout', (e) => {
    const c = e.target.closest && e.target.closest('.bond-chip[data-bond]');
    if (c && !c.contains(e.relatedTarget)) hideBondTip();
  });
  document.addEventListener('click', (e) => {
    const tip = $('#bondTip');
    const c = e.target.closest && e.target.closest('.bond-chip[data-bond]');
    if (c) {
      if (tip && tip.dataset.for === c.dataset.bond && tip.dataset.pinned === '1') {
        tip.dataset.pinned = '0';
        hideBondTip(true);
      } else {
        showBondTip(c);
        if (tip) tip.dataset.pinned = '1';
      }
      e.preventDefault();
    } else if (tip && !e.target.closest('#bondTip')) {
      hideBondTip(true);
    }
  });
  $('#clearA').onclick = () => { S.a = []; saveFormation(); renderTeams(); renderPool(); };
  $('#start').onclick = startBattle;
  $('#again').onclick = () => { $('#overlay').hidden = true; startBattle(); };
  $('#next').onclick = async () => {
    if (S.mode === 'ancient' && S.ancientRun && S.ancientRun.phase === 1) {
      const run = S.ancientRun;
      run.phase = 2;
      S.ancientPhase = 2;
      S.b = (run.enemies[1] || []).slice();
      $('#overlay').hidden = true;
      saveAncientRun();
      const ok = await startBattle();
      if (!ok) { $('#overlay').hidden = false; showScreen('formation'); }
      return;
    }
    if (S.mode === 'tower') {
      const floor = S.tower.floor || 1;
      let data = S.towerFloors[floor - 1];
      if (!data) {
        await ensureTowerFloors(floor + 1);
        data = S.towerFloors[floor - 1];
        if (!data) { $('#overlay').hidden = false; showScreen('tower'); return; }
      }
      S.towerData = data;
      S.b = data.enemies.slice();
      const buff = data.buffs[Math.floor(Math.random() * data.buffs.length)] || data.buffs[0];
      S.towerBuff = buff.id;
      S.towerBuffData = buff;
      fillTeam(5);
      $('#overlay').hidden = true;
      const ok = await startBattle();
      if (!ok) { $('#overlay').hidden = false; showScreen('tower'); }
      return;
    }
    if (S.mode === 'secret') {
      const s = S.secret;
      if (!s || !s.active) return;
      ensureSecretMap();
      if (s.mapPos.layer >= 9) return;
      if (staminaNow() < 10) { flash('体力不足'); return; }
      if (s.needBlessing) {
        const fd = (S.secretFloors || [])[Math.max(0, s.mapPos.layer)] || S.secretFloors[0] || {};
        const b = (fd.blessings || [])[Math.floor(Math.random() * (fd.blessings || []).length)];
        if (b) s.buffs.push({ effect: b.effect }, { effect: b.curse });
        s.needBlessing = false;
      }
      const nextLayer = s.mapPos.layer + 1;
      const layer = s.map && s.map[nextLayer];
      const idxs = secretAvailableIndexes(nextLayer);
      const node = layer && layer.nodes.find((n, i) => idxs.includes(i) && ['battle', 'elite', 'boss'].includes(n.type));
      if (!node) { showScreen('secret'); return; }
      S.secretData = node;
      S.b = (node.enemies || []).slice();
      fillTeam(3);
      s.node = node;
      s.nodeLayer = node.layer;
      s.nodeIndex = node.idx;
      s.activeShop = null; s.activeEvent = null; s.activeRecruit = null; s.pendingNode = null;
      s.shopBought = false;
      saveSecret(); saveFormation();
      $('#overlay').hidden = true;
      const ok = await startBattle();
      if (!ok) { $('#overlay').hidden = false; showScreen('secret'); }
      return;
    }
    const prevId = S.levelId;
    const nid = (S.levelId || 0) + 1;
    if (nid > 700) return;
    if (staminaNow() < 6) { flash('体力不足'); return; }
    selectLevel(nid);
    if (S.levelId !== nid) return;
    fillTeam(5);
    $('#overlay').hidden = true;
    const ok = await startBattle();
    if (!ok) {
      if (prevId) selectLevel(prevId);
      $('#overlay').hidden = false;
    }
  };
  $('#back').onclick = () => {
    S.playing = false; S.paused = false; S.prompt = null; S.ending = true;
    $('#prompt').hidden = true; $('#overlay').hidden = true;
    const sid = S.session; S.session = null;
    if (sid) fetch('/api/battle/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sid }) }).catch(() => {});
    const back = S.mode === 'tower' ? 'tower' : S.mode === 'dungeon' ? 'dungeon'
      : S.mode === 'secret' ? 'secret' : S.mode === 'ancient' ? 'ancient'
        : S.mode === 'trial' ? 'trial' : S.mode === 'personal' ? 'roster' : S.mode === 'worldboss' ? 'worldboss' : S.mode === 'survival' ? 'survival' : 'formation';
    showScreen(back);
  };
  $('#battleSettings').onclick = () => {
    if (!S.playing) return;
    S.paused = true;
    $('#battleMenu').hidden = false;
    updateBattleButtons();
  };
  $('#battleResume').onclick = () => {
    $('#battleMenu').hidden = true;
    S.paused = false;
    updateBattleButtons();
    runLoop();
  };
  $('#battleQuit').onclick = () => { $('#battleMenu').hidden = true; $('#back').click(); };
  const bgm = localStorage.getItem('sg_bgm') || '60', sfx = localStorage.getItem('sg_sfx') || '80';
  if ($('#battleMusic')) { $('#battleMusic').value = bgm; $('#battleMusicVal').textContent = bgm; }
  if ($('#battleSfx')) { $('#battleSfx').value = sfx; $('#battleSfxVal').textContent = sfx; }
  const bindRange = (id, label, key) => {
    const el = $(id); if (!el) return;
    el.oninput = () => {
      $(label).textContent = el.value;
      localStorage.setItem(key, el.value);
      if (key === 'sg_bgm') AudioSys.setBgm(+el.value);
      if (key === 'sg_sfx') AudioSys.setSfx(+el.value);
    };
  };
  bindRange('#battleMusic', '#battleMusicVal', 'sg_bgm');
  bindRange('#battleSfx', '#battleSfxVal', 'sg_sfx');
  if ($('#battleQuality')) $('#battleQuality').onchange = (e) => {
    document.body.dataset.quality = e.target.value;
    localStorage.setItem('sg_quality', e.target.value);
    if (window.HeroShow) HeroShow.setQuality(e.target.value);
  };
  $('#manual').onclick = () => { S.manual = !S.manual; updateBattleButtons(); flash(S.manual ? '已切到手动：轮到我方时选技能' : '已切到自动'); };
  $('#pause').onclick = () => {
    if (!S.playing || S.prompt) return;
    S.paused = !S.paused;
    updateBattleButtons();
    if (!S.paused) runLoop();
  };
  document.querySelectorAll('.speed button[data-speed]').forEach(b => {
    b.onclick = () => {
      S.speed = Number(b.dataset.speed);
      document.querySelectorAll('.speed button[data-speed]').forEach(x => x.classList.toggle('active', x === b));
    };
  });
  $('#skip').onclick = () => { skipBattle(); };
}

async function startBattle() {
  if (window.HeroShow && HeroShow.warmup) HeroShow.warmup();
  const isSecret = S.mode === 'secret';
  const isTrial = S.mode === 'trial';
  const isAncient = S.mode === 'ancient';
  const isPersonal = S.mode === 'personal';
  const needA = modeNeedA();
  if (S.mode === 'none' || !S.b.length) { flash('请先在征战选择关卡'); showScreen('campaign'); return false; }
  if (teamStar() > starCap()) { flash(`星力超限：${teamStar()}/${starCap()}，请下阵高星力武将`); return false; }
  if (teamCount() < needA) { flash(isSecret ? '秘境需要至少 3 名武将' : `请先编满 ${needA} 名武将`); return false; }
  if (isTrial) {
    const err = trialRuleError(S.a, S.trialData);
    if (err) { flash(err); return false; }
  }
  if (isPersonal && (!S.personalName || !teamActive().slice(0, 3).includes(S.personalName))) {
    flash(`个人传需要 ${S.personalName || '对应武将'} 上阵`); return false;
  }
  syncPlayerLevel();
  let cost = 0;
  if (S.mode === 'level') cost = 6;
  else if (S.mode === 'dungeon') cost = 12;
  else if (S.mode === 'secret') cost = 10;
  else if (S.mode === 'worldboss') cost = 10;
  else if (S.mode === 'survival') cost = 10;
  if (cost && !spendStamina(cost)) return false;
  let teamA;
  if (isSecret) teamA = secretTeamA();
  else if (isAncient && S.ancientRun) {
    const ph = S.ancientRun.phase === 2 ? 2 : 1;
    teamA = S.a.slice(ph === 2 ? 4 : 0, ph === 2 ? 8 : 4)
      .filter(n => n && S.by[n]);
  } else if (isPersonal) teamA = S.a.slice(0, 3).filter(Boolean);
  else teamA = S.a.slice(0, needA).filter(Boolean);
  if (isAncient && teamA.length < 4) { flash('该队至少需要 4 名可出战武将'); return false; }
  const body = { a: teamA, b: S.b, seed: Math.floor(Math.random() * 1e9), level: playerLevel(), bt: 0, aw: 0, equip: 0 };
  const supA = (S.support || []).filter(n => !teamA.includes(n)).slice(0, 3);
  if (supA.length) body.support = supA;
  const _actBonds = isSecret ? secretActiveBonds()
    : isAncient ? bondsForNames([...teamA, ...supA])
      : activeBondsList();
  if (_actBonds.length) {
    body.bonds = _actBonds.map(b => b.id);
    const kinds = new Set(S.achieve.stats.bondKinds || []);
    _actBonds.forEach(b => kinds.add(b.id));
    if (kinds.size !== (S.achieve.stats.bondKinds || []).length) {
      S.achieve.stats.bondKinds = [...kinds];
      saveAchieve();
    }
  }
  if (S.mode === 'level' && S.levelData) {
    body.enemy_config = S.levelData.config;
    const mod = levelModifier(S.levelData.id);
    if (mod) {
      body.player_buffs = (body.player_buffs || []).concat([{ effect: mod.effect }]);
      body.enemy_buffs = [{ effect: mod.effect }];
    }
    const mech = chapterMech(S.levelData);
    if (mech) {
      body.enemy_buffs = (body.enemy_buffs || []).concat([{ effect: mech.effect }]);
      if (mech.playerEffect) body.player_buffs = (body.player_buffs || []).concat([{ effect: mech.playerEffect }]);
    }
  }
  if (S.mode === 'tower' && S.towerData) {
    body.enemy_config = S.towerData.config;
    if (S.towerBuffData) body.player_buffs = [S.towerBuffData];
  }
  if (S.mode === 'dungeon' && S.dungeonData) body.enemy_config = S.dungeonData.config;
  if (isAncient && S.ancientRun) {
    const ph = S.ancientRun.phase === 2 ? 2 : 1;
    body.b = (S.ancientRun.enemies[ph - 1] || []).slice();
    S.b = body.b.slice();
    body.enemy_config = S.ancientRun.configs[ph - 1] || S.ancientData.config;
    if (ph === 2) {
      const firstWon = !!(S.ancientRun.wins && S.ancientRun.wins[0]);
      body.player_buffs = [{ effect: firstWon ? { atk: 0.10, dr: 0.05 } : { atk: 0.15 } }];
      body.player_specials = [firstWon ? 'rage' : 'low_hp'];
    }
  } else if (S.mode === 'ancient' && S.ancientData) body.enemy_config = S.ancientData.config;
  if (isTrial && S.trialData) {
    body.trial_id = S.trialData.id;
    body.enemy_config = S.trialData.config;
  }
  if (isPersonal && S.personalData) {
    body.b = (S.personalData.enemies || []).slice();
    body.enemy_config = S.personalData.config;
  }
  if (S.mode === 'worldboss' && S.worldBossData) {
    body.b = (S.worldBossData.enemies || []).slice();
    S.b = body.b.slice();
    body.enemy_config = S.worldBossData.config;
  }
  if (S.mode === 'survival' && S.survivalData) {
    body.b = (S.survivalData.enemies || []).slice();
    S.b = body.b.slice();
    body.enemy_config = S.survivalData.config;
    const ups = S.survival.upgrades || [];
    const buffs = ups.filter(u => u.stat).map(u => ({ effect: { [u.stat]: u.value } }));
    if (buffs.length) body.player_buffs = buffs;
    const effs = ups.filter(u => u.effect).map(u => u.effect);
    if (effs.length) body.player_specials = effs;
  }
  if (S.mode === 'secret' && S.secretData) {
    body.enemy_config = S.secretData.config;
    body.player_buffs = S.secret.buffs || [];
    body.player_specials = (S.secret.relics || []).map(r => r.effect).filter(Boolean);
  }
  const pp = {};
  teamA.forEach(n => {
    const p = S.unitProgress[n];
    if (!p) return;
    const q = { ...p };
    if (p.skillBook) q.skillBook = skillBookInfo(p.skillBook);
    if (p.tacticBook) q.tacticBook = tacticBookInfo(p.tacticBook);
    if (p.artifact) { q.artifact = p.artifact; q.artifactLv = artifactLevel(p.artifact); }
    if (p.relic && S.relics[p.relic]) q.relic = S.relics[p.relic];
    if (p.sigils && p.sigils.length) q.sigils = p.sigils.map(s => ({ name: s.name, stats: s.stats, special: s.special || null }));
    pp[n] = q;
  });
  if (Object.keys(pp).length) body.player_progress = pp;
  $('#status').textContent = '结算中…';
  let data;
  try {
    const res = await fetch('/api/battle/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    data = await res.json();
  } catch (e) {
    flash('开局失败：' + e.message);
    return false;
  }
  if (data.error) { flash(data.error); return false; }
  S.session = data.session;
  S.battleStats = {};
  S.battleDetail = {};
  if ($('#battleStats')) $('#battleStats').hidden = true;
  S.playing = true;
  S.paused = false;
  S.looping = false;
  S.stepOnce = false;
  S.prompt = null;
  S.skip = false;
  S.ending = false;
  S.lastRound = 0;
  document.body.classList.add('in-battle');
  ['homeScreen', 'recruitScreen', 'shopScreen', 'towerScreen', 'dungeonScreen', 'secretScreen', 'ancientScreen', 'seasonScreen', 'setup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  $('#battle').hidden = false;
  $('#overlay').hidden = true;
  $('#prompt').hidden = true;
  $('#rewards').textContent = '';
  $('#log').innerHTML = '';
  (data.units || []).forEach(u => detailEntry(u.name, u.side));
  S.combos = Array.isArray(data.combos) ? data.combos : [];
  S.comboUsed = false;
  S.lastRound = 0;
  S.unitsState = (data.units || []).slice();
  renderBattleUnits(data.units);
  $('#round').textContent = '第 1 回合';
  $('#status').textContent = `战斗进行中 · ${data.units.length} 单位`;
  updateBattleButtons();
  updateComboButton();
  runLoop();
  return true;
}

function renderBattleUnits(units) {
  updateTeamHud(units);
  S.cards.clear();
  $('#enemyRow').innerHTML = '';
  $('#playerRow').innerHTML = '';
  const order = { front: 0, back: 1 };
  [1, 0].forEach(side => {
    const list = units.filter(u => u.side === side)
      .sort((x, y) => (order[x.row] ?? 9) - (order[y.row] ?? 9));
    const row = side === 1 ? $('#enemyRow') : $('#playerRow');
    row.classList.toggle('many', list.length > 5);
    list.forEach(u => row.appendChild(makeCard(u, side)));
  });
  renderTeamStats();
}

function makeCard(u, side) {
  const el = document.createElement('div');
  el.className = 'card' + ((u.name || '').includes('召唤物') ? ' minion' : '');
  el.dataset.side = side;
  el.dataset.name = u.name;
  el.dataset.max = u.max_hp || 1;
  el.innerHTML = `<div class="ph" style="background-image:url('${pthumb(u.name)}')"></div>
    <div class="nm">${esc(u.name)}</div>
    <div class="rl">${u.level && u.level > 1 ? 'Lv' + u.level + ' · ' : ''}${esc(u.role || '')}</div>
    <div class="bar"><i></i></div>
    <div class="hp"></div>`;
  setHp(el, u.hp ?? u.max_hp ?? 1);
  const key = `${side}|${u.name}`;
  if (!S.cards.has(key)) S.cards.set(key, el);
  return el;
}

function setHp(el, hp) {
  const max = Number(el.dataset.max) || 1;
  const p = Math.max(0, Math.min(1, hp / max));
  el.querySelector('.bar i').style.width = `${p * 100}%`;
  el.querySelector('.hp').textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
  if (hp <= 0) el.classList.add('dead');
}

function bumpStat(name, side, key, val) {
  if (!name || !val) return;
  const k = `${side}|${name}`;
  const st = S.battleStats[k] || (S.battleStats[k] = { out: 0, taken: 0, heal: 0 });
  st[key] += val;
  scheduleStatBars();
}

function renderBattleStats() {
  const body = $('#battleStatsBody');
  if (!body) return;
  const all = Object.values(S.battleDetail)
    .sort((a, b) => a.side - b.side || b.outTotal - a.outTotal);
  const sides = [0, 1].map(s => all.filter(e => e.side === s));
  const total = s => sides[s].reduce((t, e) => ({
    out: t.out + e.outTotal, taken: t.taken + e.takenTotal, heal: t.heal + e.healTotal,
  }), { out: 0, taken: 0, heal: 0 });
  const rows = (obj, empty, cls) => {
    const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...arr.map(x => x[1]));
    return arr.length
      ? arr.map(([k, v]) => `<div class="bs-row ${cls}" title="${esc(k)}：${Math.round(v)}">
          <i class="bs-bar" style="width:${Math.max(3, v / max * 100)}%"></i>
          <span class="bs-k">${esc(k)}</span><b>${Math.round(v)}</b></div>`).join('')
      : `<div class="bs-empty">${empty}</div>`;
  };
  const unitBox = e => `<details class="bs-unit"${e.side === 0 ? ' open' : ''}>
    <summary><b>${esc(e.name)}</b><em>
      <i class="o">输出 ${Math.round(e.outTotal)}</i>
      <i class="t">承伤 ${Math.round(e.takenTotal)}</i>
      <i class="h">治疗 ${Math.round(e.healTotal)}</i></em></summary>
    <div class="bs-cols">
      <div class="bs-block out"><h4>输出（${e.hits} 次${e.crits ? ` / 暴击 ${e.crits}` : ''}）</h4>${rows(e.out, '无', 'out')}</div>
      <div class="bs-block taken"><h4>承伤来源</h4>${rows(e.taken, '无', 'taken')}</div>
      <div class="bs-block heal"><h4>治疗</h4>${rows(e.heal, '无', 'heal')}</div>
    </div></details>`;
  const box = (s, label) => {
    const t = total(s);
    return `<div class="bs-side"><h3>${label}</h3>
      <div class="bs-total">
        <div class="o"><span>总输出</span><b>${Math.round(t.out)}</b></div>
        <div class="t"><span>总承伤</span><b>${Math.round(t.taken)}</b></div>
        <div class="h"><span>总治疗</span><b>${Math.round(t.heal)}</b></div>
      </div>
      ${sides[s].map(unitBox).join('') || '<div class="bs-empty">本场无数据</div>'}</div>`;
  };
  body.innerHTML = box(0, '我军') + box(1, '敌军');
}

function scheduleStatBars() {
  if (scheduleStatBars.q) return;
  scheduleStatBars.q = requestAnimationFrame(() => {
    scheduleStatBars.q = null;
    renderTeamStats();
  });
}

function fmtStat(v) {
  v = Math.round(v || 0);
  if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万';
  return String(v);
}

function renderTeamStats() {
  const all = Object.values(S.battleDetail);
  const mo = Math.max(1, ...all.map(e => e.outTotal));
  const mt = Math.max(1, ...all.map(e => e.takenTotal));
  const mh = Math.max(1, ...all.map(e => e.healTotal));
  const row = e => `<div class="us-row" title="${esc(e.name)}：输出 ${Math.round(e.outTotal)} / 承伤 ${Math.round(e.takenTotal)} / 治疗 ${Math.round(e.healTotal)}">
    <div class="us-head"><b>${esc(e.name)}</b></div>
    <div class="us-vals">
      <span class="o">出${fmtStat(e.outTotal)}</span>
      <span class="t">承${fmtStat(e.takenTotal)}</span>
      <span class="h">疗${fmtStat(e.healTotal)}</span></div>
    <div class="us-bars">
      <i class="o"><b style="width:${Math.min(100, e.outTotal / mo * 100)}%"></b></i>
      <i class="t"><b style="width:${Math.min(100, e.takenTotal / mt * 100)}%"></b></i>
      <i class="h"><b style="width:${Math.min(100, e.healTotal / mh * 100)}%"></b></i>
    </div></div>`;
  for (const side of [0, 1]) {
    const box = $('#' + (side === 1 ? 'tsEnemyList' : 'tsAllyList'));
    if (!box) continue;
    const list = all.filter(e => e.side === side).sort((a, b) => b.outTotal - a.outTotal);
    box.innerHTML = list.length ? list.map(row).join('') : '<div class="us-empty">暂无数据</div>';
  }
}

function detailEntry(name, side) {
  if (!name) return null;
  const k = `${side}|${name}`;
  return S.battleDetail[k] || (S.battleDetail[k] = {
    name, side, out: {}, taken: {}, heal: {},
    outTotal: 0, takenTotal: 0, healTotal: 0, hits: 0, crits: 0,
  });
}

function skillTypeLabel(owner, skill) {
  const u = S.by[owner];
  if (u && u.skills) {
    for (const t of ['普攻', '战法', '奇谋']) {
      const sk = u.skills[t];
      if (sk && sk.name === skill) return `${t}·${skill}`;
    }
  }
  return skill || '其他';
}

function recordDamage(src, srcSide, dst, dstSide, dmg, label, crit) {
  if (!dmg || dmg <= 0) return;
  const a = detailEntry(src, srcSide);
  const b = detailEntry(dst, dstSide);
  if (a) {
    a.out[label] = (a.out[label] || 0) + dmg;
    a.outTotal += dmg;
    a.hits += 1;
    if (crit) a.crits += 1;
  }
  if (b) {
    const key = `${src || '持续'}·${label}`;
    b.taken[key] = (b.taken[key] || 0) + dmg;
    b.takenTotal += dmg;
  }
}

function recordHeal(src, srcSide, amount, label) {
  if (!amount || amount <= 0) return;
  const a = detailEntry(src, srcSide);
  if (!a) return;
  a.heal[label] = (a.heal[label] || 0) + amount;
  a.healTotal += amount;
}

function findCard(ev, which) {
  const name = ev[which];
  const side = ev[which + '_side'] ?? (which === 'unit' ? ev.side : undefined);
  if (name === undefined) return null;
  if (side !== undefined) {
    const exact = S.cards.get(`${side}|${name}`);
    if (exact && !exact.classList.contains('dead')) return exact;
    if (exact) return exact;
  }
  for (const [k, el] of S.cards) {
    if (k.endsWith(`|${name}`) && !el.classList.contains('dead')) return el;
  }
  return null;
}

function log(text, cls = '') {
  const box = $('#log');
  const d = document.createElement('div');
  d.className = 'l ' + cls;
  d.textContent = text;
  box.prepend(d);
  while (box.children.length > 60) box.lastChild.remove();
}

function cardFx(el, cls, ms = 260) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el['_fx' + cls]);
  el['_fx' + cls] = setTimeout(() => el.classList.remove(cls), ms);
}

function spawnFx(el, type, ms = 460) {
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'fxlayer ' + type;
  el.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function battleShake(hard) {
  const b = $('#battle');
  if (!b) return;
  b.classList.remove('shake', 'shake-hard');
  void b.offsetWidth;
  b.classList.add(hard ? 'shake-hard' : 'shake');
  clearTimeout(battleShake.t);
  battleShake.t = setTimeout(() => b.classList.remove('shake', 'shake-hard'), 340);
}

function floatText(el, text, cls) {
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'float ' + cls;
  d.textContent = text;
  el.appendChild(d);
  setTimeout(() => d.remove(), 950);
}

function handleEvent(ev) {
  if (ev.round && ev.round !== S.lastRound) {
    S.lastRound = ev.round;
    $('#round').textContent = `第 ${ev.round} 回合`;
  }
  const src = findCard(ev, 'src') || findCard(ev, 'unit');
  const dst = findCard(ev, 'dst');
  switch (ev.kind) {
    case 'combo': {
      showComboBanner(`${ev.name}${ev.desc ? ' · ' + ev.desc : ''}`);
      log(`合击技：${ev.name}`, 's');
      try { AudioSys.play('chime'); } catch (e) { /* ignore */ }
      break;
    }
    case 'action': {
      if (src) { src.classList.add('act'); setTimeout(() => src.classList.remove('act'), 220); }
      if (window.HeroShow) {
        HeroShow.cast(ev.unit, src);
      } else {
        cardFx(src, 'fx-cast', 320);
        spawnFx(src, 'cast-ring', 380);
      }
      log(`${ev.unit} 使用 ${ev.skill}`, 's');
      break;
    }
    case 'damage': {
      if (dst) {
        setHp(dst, ev.dst_hp);
        dst.classList.add('hit'); setTimeout(() => dst.classList.remove('hit'), 160);
        cardFx(dst, 'fx-hit', 230);
        if (!window.HeroShow) spawnFx(dst, 'slash', 320);
        if (ev.crit) {
          cardFx(dst, 'fx-crit', 320);
          if (!window.HeroShow) spawnFx(dst, 'burst', 420);
          battleShake(true);
        } else if (R(ev.dmg) >= 600) battleShake(false);
        floatText(dst, `-${R(ev.dmg)}`, ev.crit ? 'crit' : 'dmg');
        if (window.HeroShow) HeroShow.hit(ev.src, dst, { crit: ev.crit, dmg: R(ev.dmg) });
      }
      const dl = skillTypeLabel(ev.src, ev.skill);
      recordDamage(ev.src, ev.src_side, ev.dst, ev.dst_side, R(ev.dmg), dl, ev.crit);
      bumpStat(ev.src, ev.src_side, 'out', R(ev.dmg));
      bumpStat(ev.dst, ev.dst_side, 'taken', R(ev.dmg));
      log(`${ev.src} → ${ev.dst} ${ev.skill} ${R(ev.dmg)}${ev.crit ? ' 暴击' : ''}`, 'd');
      break;
    }
    case 'true_damage': {
      if (dst) {
        setHp(dst, ev.dst_hp);
        cardFx(dst, 'fx-hit', 230);
        if (!window.HeroShow) spawnFx(dst, 'slash', 320);
        floatText(dst, `-${R(ev.dmg)}`, 'dmg');
        if (window.HeroShow) HeroShow.hit(ev.src, dst, { dmg: R(ev.dmg) });
      }
      recordDamage(ev.src, ev.src_side, ev.dst, ev.dst_side, R(ev.dmg), `真实伤害·${ev.skill || ''}`, false);
      bumpStat(ev.src, ev.src_side, 'out', R(ev.dmg));
      bumpStat(ev.dst, ev.dst_side, 'taken', R(ev.dmg));
      log(`${ev.src} → ${ev.dst} 真实伤害 ${R(ev.dmg)}`, 'd');
      break;
    }
    case 'dot_damage': {
      if (dst) {
        setHp(dst, ev.dst_hp);
        cardFx(dst, 'fx-hit', 200);
        spawnFx(dst, 'burn', 480);
      }
      recordDamage(ev.src, ev.src_side, ev.dst, ev.dst_side, R(ev.dmg), `持续伤害·${ev.dot || ''}`, false);
      bumpStat(ev.src, ev.src_side, 'out', R(ev.dmg));
      bumpStat(ev.dst, ev.dst_side, 'taken', R(ev.dmg));
      log(`${ev.dst} 受到${ev.dot || '持续'}伤害 ${R(ev.dmg)}`, 'd');
      break;
    }
    case 'heal': {
      if (dst) {
        setHp(dst, ev.dst_hp);
        /* 有 HeroShow 时治疗走莲华贴图，旧的 fx-heal 卡面描边 + heal-ring 光环会与贴图叠成双层，跳过 */
        if (window.HeroShow) {
          HeroShow.heal(ev.src, dst);
        } else {
          cardFx(dst, 'fx-heal', 360);
          spawnFx(dst, 'heal-ring', 480);
        }
        floatText(dst, `+${R(ev.amount)}`, 'heal');
      }
      recordHeal(ev.src, ev.src_side, R(ev.amount), ev.skill ? skillTypeLabel(ev.src, ev.skill) : '持续回复/被动');
      bumpStat(ev.src, ev.src_side, 'heal', R(ev.amount));
      log(`${ev.src} 治疗 ${ev.dst} +${R(ev.amount)}`, 'h');
      break;
    }
    case 'skip':
      if (src) floatText(src, ev.reason, 's');
      log(`${ev.unit} 跳过（${ev.reason}）`, 's');
      break;
    case 'control':
      if (dst) {
        cardFx(dst, 'fx-control', 360);
        spawnFx(dst, 'cast-ring', 420);
        if (window.HeroShow) HeroShow.control(ev.src || ev.unit, dst);
      }
      log(`${ev.src || ''} 使 ${ev.dst} 陷入${ev.status || '控制'}`, 's');
      break;
    case 'revive':
      if (dst) {
        dst.classList.remove('dead');
        cardFx(dst, 'fx-heal', 420);
        spawnFx(dst, 'heal-ring', 520);
      }
      log(`${ev.dst} 被 ${ev.src} 复活`, 'h');
      break;
    case 'bodyguard':
      if (dst) floatText(dst, '代伤', 's');
      log(`${ev.guard} 替 ${ev.dst} 承受 ${R(ev.dmg)} 伤害`, 's');
      break;
    case 'death':
      if (src) {
        src.classList.add('dead');
        cardFx(src, 'fx-death', 620);
        spawnFx(src, 'burst', 460);
        if (window.HeroShow) HeroShow.death(ev.unit, src);
      }
      log(`${ev.unit} 阵亡`, 'k');
      break;
    case 'survive':
      if (src) {
        floatText(src, '不屈', 'crit');
        cardFx(src, 'fx-heal', 360);
        spawnFx(src, 'heal-ring', 460);
      }
      log(`${ev.unit} 保命触发`, 's');
      break;
    case 'summon': {
      log(`${ev.src} 召唤 ${ev.unit}`, 's');
      break;
    }
    case 'dispel':
      log(`${ev.src} 驱散 ${ev.dst}`, 's');
      break;
    case 'dodge':
      if (dst) floatText(dst, '闪避', 's');
      log(`${ev.src} 攻击 ${ev.dst}，被闪避`, 's');
      break;
    case 'immune_control':
      if (src) floatText(src, '免疫控制', 's');
      log(`${ev.unit} 免疫控制`, 's');
      break;
    case 'transfer':
      log(`${ev.src} 将 ${ev.status} 转移给 ${ev.dst}`, 's');
      break;
    case 'chain':
      log(`${ev.src} 的连环命中 ${ev.dst}`, 's');
      break;
    case 'chain_damage': {
      if (dst) { setHp(dst, ev.dst_hp); floatText(dst, `-${R(ev.dmg)}`, 'dmg'); }
      recordDamage(ev.src, ev.src_side, ev.dst, ev.dst_side, R(ev.dmg), '连环传递', false);
      bumpStat(ev.src, ev.src_side, 'out', R(ev.dmg));
      bumpStat(ev.dst, ev.dst_side, 'taken', R(ev.dmg));
      log(`连环传递 → ${ev.dst} -${R(ev.dmg)}`, 'd');
      break;
    }
    case 'self_damage': {
      if (src) { setHp(src, R(ev.hp)); floatText(src, `-${R(ev.amount)}`, 'dmg'); }
      const selfD = detailEntry(ev.unit, ev.side);
      if (selfD && R(ev.amount) > 0) {
        selfD.taken['自损'] = (selfD.taken['自损'] || 0) + R(ev.amount);
        selfD.takenTotal += R(ev.amount);
      }
      bumpStat(ev.unit, ev.side, 'taken', R(ev.amount));
      log(`${ev.unit} 自损 ${R(ev.amount)}`, 'd');
      break;
    }
    case 'copy':
      log(`${ev.unit} 复制 ${ev.src} 的 ${ev.skill}（威力${Math.round(ev.power * 100)}%）`, 's');
      break;
    case 'copy_none':
      log(`${ev.unit} 无战法可复制`, 's');
      break;
    case 'deathmatch':
      log(`${ev.unit} 与 ${ev.foe} 死斗 ${ev.turns} 回合`, 's');
      break;
    case 'deathmatch_end':
      log(`${ev.unit} 死斗结束`, 's');
      break;
    default:
      break;
  }
}

async function postBattle(path, body) {
  const res = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function animateEvents(events) {
  for (const ev of events || []) {
    handleEvent(ev);
    if (!S.skip) {
      const base = ev.kind === 'action' ? 180 : (ev.kind === 'damage' || ev.kind === 'heal' ? 90 : 55);
      await sleep(base / S.speed);
    }
  }
}


function updateStatusRow(el, u) {
  let box = el.querySelector('.status-row');
  if (!box) { box = document.createElement('div'); box.className = 'status-row'; el.appendChild(box); }
  const st = Object.keys(u.status || {}).map(k => `<span class="st">${esc(k)}</span>`);
  const dt = Object.entries(u.dots || {}).map(([k, v]) => `<span class="st dot">${esc(k)}${v > 1 ? v : ''}</span>`);
  box.innerHTML = st.concat(dt).slice(0, 5).join('');
}
function updateTeamHud(units) {
  if (!units) return;
  [['Ally', 0], ['Enemy', 1]].forEach(([tag, side]) => {
    const team = units.filter(u => u.side === side && !u.is_summon);
    const total = team.reduce((a, u) => a + (u.max_hp || 0), 0) || 1;
    const hp = team.reduce((a, u) => a + Math.max(0, u.hp || 0), 0);
    const rage = team.length ? team.reduce((a, u) => a + (u.rage || 0), 0) / team.length : 0;
    const bar = $('#th' + tag + 'Hp'), rg = $('#th' + tag + 'Rage');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, hp / total * 100))}%`;
    if (rg) rg.textContent = `怒气 ${Math.round(rage)}`;
  });
}
function syncUnits(units) {
  if (!units) return;
  S.unitsState = units.slice();
  const seen = new Set();
  units.forEach(u => {
    const key = `${u.side}|${u.name}`;
    seen.add(key);
    let el = S.cards.get(key);
    if (!el) {
      el = makeCard(u, u.side);
      const row = u.side === 1 ? $('#enemyRow') : $('#playerRow');
      row.appendChild(el);
      S.cards.set(key, el);
    }
    el.dataset.max = u.max_hp || 1;
    setHp(el, u.hp ?? 1);
    el.classList.toggle('dead', !u.alive);
    updateStatusRow(el, u);
  });
  updateTeamHud(units);
  for (const [k, el] of Array.from(S.cards)) {
    if (!seen.has(k)) { el.remove(); S.cards.delete(k); }
  }
  renderTeamStats();
  updateComboButton();
}

async function applyStep(data) {
  if (data.round) {
    S.lastRound = data.round;
    $('#round').textContent = `第 ${data.round} 回合`;
  }
  if (data.events && data.events.length) await animateEvents(data.events);
  syncUnits(data.units);
}

async function doStep(auto) {
  if (S.busy) return null;
  S.busy = true;
  try {
    const data = await postBattle('/api/battle/step', { session: S.session, auto });
    await applyStep(data);
    if (data.done) {
      S.playing = false;
      showResult(Object.assign({ rounds: data.round }, data));
    } else if (!S.playing || S.ending) {
      // 已被跳过/返回，忽略迟到的回合
    } else if (data.prompt) {
      S.paused = true;
      showPrompt(data.prompt);
    }
    updateBattleButtons();
    return data;
  } finally {
    S.busy = false;
  }
}

async function useCombo() {
  if (!S.session || S.ending || S.comboUsed || !S.combos.length || S.prompt) return;
  const wasPaused = S.paused;
  S.paused = true;
  let guard = 0;
  while (S.busy && guard++ < 100) await sleep(30);
  try {
    const data = await postBattle('/api/battle/combo', { session: S.session });
    if (data.error) { flash(data.error); S.paused = wasPaused; if (!wasPaused) runLoop(); return; }
    S.comboUsed = true;
    await applyStep(data);
    if (data.done) { S.playing = false; showResult(Object.assign({ rounds: data.round }, data)); }
    else { S.paused = wasPaused; if (!wasPaused) runLoop(); }
  } catch (e) {
    flash('合击失败：' + e.message);
    S.paused = wasPaused;
    if (!wasPaused) runLoop();
  }
  updateBattleButtons();
  updateComboButton();
}

async function runLoop() {
  if (S.looping) return;
  S.looping = true;
  try {
    while (S.playing && !S.paused && S.session) {
      const data = await doStep(!S.manual);
      if (!data || !S.playing || data.done || data.prompt) break;
      if (S.stepOnce) { S.stepOnce = false; S.paused = true; break; }
      await sleep(110 / S.speed);
    }
  } catch (e) {
    if (!S.ending) {
      flash('战斗出错：' + e.message);
      S.playing = false;
    }
  } finally {
    S.looping = false;
    updateBattleButtons();
  }
}

function showPrompt(p) {
  if (!S.playing || S.ending) return;
  S.prompt = p;
  $('#prompt').hidden = false;
  $('#promptUnit').textContent = `轮到 ${p.unit} · HP ${p.hp}/${p.max_hp} · 怒气 ${Math.round(p.rage)}`;
  const box = $('#promptSkills');
  box.innerHTML = '';
  p.skills.forEach(s => {
    const b = document.createElement('button');
    b.textContent = `${s.name}（${s.type}）`;
    b.disabled = !s.available;
    b.title = s.reason || s.desc || '';
    b.onclick = () => chooseSkill(s.type);
    box.appendChild(b);
  });
  updateBattleButtons();
}

async function chooseSkill(type) {
  if (!S.session || S.busy) return;
  $('#prompt').hidden = true;
  S.prompt = null;
  try {
    const data = await postBattle('/api/battle/choose', { session: S.session, skill: type });
    await applyStep(data);
    if (data.done) { S.playing = false; showResult(Object.assign({ rounds: data.round }, data)); }
    else if (!S.playing || S.ending) { /* ignore */ }
    else if (data.prompt) { S.paused = true; showPrompt(data.prompt); }
    else { S.paused = false; runLoop(); }
  } catch (e) { flash('选择失败：' + e.message); }
  updateBattleButtons();
}

async function skipBattle() {
  if (!S.playing || !S.session) return;
  S.ending = true;
  try {
    const data = await postBattle('/api/battle/auto', { session: S.session });
    $('#log').innerHTML = '';
    S.skip = true;
    await applyStep(data);
    S.skip = false;
    S.playing = false;
    showResult(Object.assign({ rounds: data.round }, data));
  } catch (e) { S.ending = false; flash('跳过失败：' + e.message); }
}

function updateComboButton() {
  const btn = $('#comboBtn');
  if (!btn) return;
  if (!S.session || !S.combos || !S.combos.length || S.comboUsed || S.ending) { btn.hidden = true; return; }
  const ready = (S.lastRound || 0) >= 2 && S.playing && !S.prompt;
  btn.hidden = false;
  btn.disabled = !ready;
  btn.textContent = `合击·${S.combos[0].name}${ready ? '' : '（第2回合解锁）'}`;
}

function updateBattleButtons() {
  const playing = S.playing && !S.prompt;
  $('#manual').classList.toggle('active', S.manual);
  $('#manual').textContent = S.manual ? '手动' : '自动';
  $('#pause').textContent = S.paused ? '继续' : '暂停';
  $('#pause').classList.toggle('active', S.paused);
  $('#pause').disabled = !S.playing || !!S.prompt;
  $('#skip').disabled = !S.playing;
}

function showResult(data) {
  if ($('#comboBtn')) $('#comboBtn').hidden = true;
  taskBump('battle');
  if (data.winner === 0) taskBump('win');
  if (S.mode === 'tower') taskBump('tower');
  if (S.mode === 'dungeon') taskBump('dungeon');
  if ($('#encounterBtn')) $('#encounterBtn').hidden = true;
  S.playing = false;
  S.ending = true;
  S.prompt = null;
  $('#prompt').hidden = true;
  const win = data.winner === 0 ? '我军胜利' : data.winner === 1 ? '敌军胜利' : '平局';
  const lv = S.levelData;
  const rounds = Math.min(25, data.rounds || data.round || 0);
  achOnBattle(data);
  if (data.winner === 0) {
    const seen = [];
    (data.units || []).forEach(u => {
      if (u.side === 0 && !u.is_summon && !seen.includes(u.name) && S.owned.includes(u.name)) {
        seen.push(u.name);
      }
    });
    addAffinityMany(seen, 1);
  }
  if (rounds) $('#round').textContent = `第 ${rounds} 回合`;
  $('#rewards').textContent = '';
  if ($('#next')) $('#next').textContent = '下一关';
  if (S.mode === 'dungeon' && S.dungeonData) {
    if (data.winner === 0) {
      addReward(S.dungeonData.reward);
      S.clears['dungeon:' + S.dungeonData.id] = true; saveClears();
      $('#resultTitle').textContent = '副本通关';
      $('#resultSub').textContent = `${S.dungeonData.cat} · ${S.dungeonData.difficulty} · ${rounds} 回合`;
      $('#rewards').textContent = `副本奖励：${fmtRewards(S.dungeonData.reward)}`;
    } else {
      $('#resultTitle').textContent = '副本失败';
      $('#resultSub').textContent = `${S.dungeonData.cat} · ${S.dungeonData.difficulty} · ${rounds} 回合`;
    }
    $('#next').hidden = true;
    $('#status').textContent = `副本 · ${win}`;
  } else if (S.mode === 'trial' && S.trialData) {
    const t = S.trialData;
    if (data.winner === 0) {
      const first = !S.trialState.done[t.id];
      addReward(t.reward);
      S.trialState.done[t.id] = true;
      saveTrialState();
      S.achieve.stats.trials = (S.achieve.stats.trials || 0) + 1;
      if (t.id === 'weekly') S.achieve.stats.weekly = (S.achieve.stats.weekly || 0) + 1;
      saveAchieve();
      bumpSeasonWeekly('trials', 1);
      if (t.id === 'weekly') bumpSeasonWeekly('weeklyBoss', 1);
      $('#resultTitle').textContent = first ? '试炼通过' : '试炼再胜';
      $('#resultSub').textContent = `${t.name} · ${t.desc} · ${rounds} 回合`;
      $('#rewards').textContent = first ? `试炼奖励：${fmtRewards(t.reward)}` : '本次无重复奖励';
    } else {
      $('#resultTitle').textContent = '试炼失败';
      $('#resultSub').textContent = `${t.name} · ${t.desc} · ${rounds} 回合，调整阵容再战`;
      $('#rewards').textContent = '';
    }
    $('#next').hidden = true;
    $('#status').textContent = `试炼 · ${win}`;
  } else if (S.mode === 'survival' && S.survivalData) {
    const wave = S.survival.wave;
    if (data.winner === 0) {
      const capBefore = staminaCap();
      addReward(S.survivalData.reward || {});
      S.survival.best = Math.max(S.survival.best || 0, wave);
      S.survival.pending = survivalRollChoices();
      saveSurvival();
      notifyStaminaGrowth(capBefore);
      $('#resultTitle').textContent = `第 ${wave} 波通过`;
      $('#resultSub').textContent = `${S.survivalData.enemies.length} 名敌军 · ${rounds} 回合 · 历史最高 ${S.survival.best} 波`;
      $('#rewards').textContent = `本波奖励：${fmtRewards(S.survivalData.reward || {})}`;
      $('#next').hidden = true;
    } else {
      S.survival.active = false;
      saveSurvival();
      $('#resultTitle').textContent = '无尽生存结束';
      $('#resultSub').textContent = `止步第 ${wave} 波 · 历史最高 ${S.survival.best || 0} 波`;
      $('#rewards').textContent = '';
      $('#next').hidden = true;
    }
    $('#status').textContent = `无尽生存 · ${win}`;
  } else if (S.mode === 'worldboss' && S.worldBossData) {
    const dmg = battleDamage(data);
    const bossHp = (data.units || []).filter(u => u.side === 1 && !u.is_summon)
      .reduce((a, u) => a + (Number(u.max_hp) || 0), 0) || 1;
    const pct = Math.min(100, dmg / bossHp * 100);
    const prev = S.worldBoss.best || 0;
    if (dmg > prev) {
      S.worldBoss.best = dmg;
      S.worldBoss.bestPct = Math.max(S.worldBoss.bestPct || 0, Math.round(pct * 10) / 10);
      saveWorldBossState();
      if (prev > 0) flash(`新纪录：${dmg} 伤害（${pct.toFixed(1)}%）`);
    }
    $('#resultTitle').textContent = '世界首领 · 讨伐结束';
    $('#resultSub').textContent = `${S.worldBossData.boss} · 造成伤害 ${dmg}（${pct.toFixed(1)}%）${dmg > prev ? ' · 新纪录' : ''} · ${rounds} 回合`;
    $('#rewards').textContent = '';
    $('#next').hidden = true;
    $('#status').textContent = `世界首领 · 造成伤害 ${dmg}`;
  } else if (S.mode === 'personal' && S.personalData) {
    const nm = S.personalName;
    const stage = S.personalData;
    if (data.winner === 0) {
      const a = affOf(nm);
      const first = !a.storyDone;
      addReward(first ? stage.reward : { 铜钱: 1000 });
      a.storyDone = true;
      if (first) addAffinity(nm, 20);
      $('#resultTitle').textContent = first ? '个人传 · 完成' : '个人传 · 再战告捷';
      $('#resultSub').textContent = `${nm} · 好感 Lv${affLevel(nm)} · ${rounds} 回合`;
      $('#rewards').textContent = first
        ? `个人传奖励：${fmtRewards(stage.reward)} · 好感 +20`
        : '再战奖励：铜钱 +1000';
    } else {
      $('#resultTitle').textContent = '个人传失败';
      $('#resultSub').textContent = `${nm} · ${rounds} 回合，调整阵容再战`;
      $('#rewards').textContent = '';
    }
    $('#next').hidden = true;
    $('#status').textContent = `个人传 · ${win}`;
  } else if (S.mode === 'secret' && S.secretData) {
    const node = S.secretData;
    const layer = typeof node.layer === 'number' ? node.layer : Math.max(0, (S.secret.floor || 1) - 1);
    const idx = typeof node.idx === 'number' ? node.idx : 0;
    if (data.winner === 0) {
      addReward(node.reward || {});
      S.secret.mapPos = { layer, index: idx };
      S.secret.floor = layer + 2;
      S.secret.used = {};
      if (layer >= 9) {
        S.secret.active = false;
        S.secret.floor = 11;
        S.secret.buffs = []; S.secret.temp = []; S.secret.relics = [];
      } else {
        S.secret.needBlessing = true;
      }
      S.secret.node = null;
      S.secret.shopBought = false;
      S.secret.activeShop = null; S.secret.activeEvent = null; S.secret.activeRecruit = null; S.secret.pendingNode = null;
      saveSecret();
      $('#resultTitle').textContent = layer >= 9 ? '秘境通关' : `秘境第 ${layer + 1} 层`;
      $('#resultSub').textContent = `${rounds} 回合 · 奖励 ${fmtRewards(node.reward || {})}`;
      $('#rewards').textContent = '';
      $('#next').hidden = layer >= 9;
    } else {
      S.secret = { active: false, floor: 1, buffs: [], needBlessing: false, node: null, shopBought: false,
        temp: [], relics: [], used: {}, map: null, mapPos: { layer: -1, index: -1 }, nodeLayer: 0, nodeIndex: 0,
        activeShop: null, pendingNode: null };
      saveSecret();
      $('#resultTitle').textContent = '秘境失败';
      $('#resultSub').textContent = `${rounds} 回合，秘境进度已重置`;
      $('#next').hidden = true;
    }
    $('#status').textContent = `秘境 · ${win}`;
  } else if (S.mode === 'personal' && S.personalData) {
    const nm = S.personalName;
    const stage = S.personalData;
    if (data.winner === 0) {
      const a = affOf(nm);
      const first = !a.storyDone;
      addReward(first ? stage.reward : { 铜钱: 1000 });
      a.storyDone = true;
      if (first) addAffinity(nm, 20);
      $('#resultTitle').textContent = first ? '个人传 · 完成' : '个人传 · 再战告捷';
      $('#resultSub').textContent = `${nm} · 好感 Lv${affLevel(nm)} · ${rounds} 回合`;
      $('#rewards').textContent = first
        ? `个人传奖励：${fmtRewards(stage.reward)} · 好感 +20`
        : '再战奖励：铜钱 +1000';
    } else {
      $('#resultTitle').textContent = '个人传失败';
      $('#resultSub').textContent = `${nm} · ${rounds} 回合，调整阵容再战`;
      $('#rewards').textContent = '';
    }
    $('#next').hidden = true;
    $('#status').textContent = `个人传 · ${win}`;
  } else if (S.mode === 'secret' && S.secretData) {
    if (data.winner === 0) {
      addReward(S.secretData.reward);
      const floor = S.secret.floor;
      S.secret.floor = Math.min(11, floor + 1);
      S.secret.used = {};
      if (S.secret.floor > 10) {
        S.secret.active = false;
        S.secret.buffs = []; S.secret.temp = []; S.secret.relics = []; S.secret.used = {};
      } else S.secret.needBlessing = true;
      S.secret.node = null;
      S.secret.shopBought = false;
      saveSecret();
      $('#resultTitle').textContent = floor >= 10 ? '秘境通关' : `秘境第 ${floor} 层`;
      $('#resultSub').textContent = `${rounds} 回合 · 奖励 ${fmtRewards(S.secretData.reward)}`;
      $('#rewards').textContent = '';
      $('#next').hidden = floor >= 10;
    } else {
      S.secret.active = false; S.secret.floor = 1; S.secret.buffs = []; S.secret.needBlessing = false;
      S.secret.node = null; S.secret.shopBought = false; S.secret.temp = []; S.secret.relics = []; S.secret.used = {};
      saveSecret();
      $('#resultTitle').textContent = '秘境失败';
      $('#resultSub').textContent = `${rounds} 回合，秘境进度已重置`;
      $('#next').hidden = true;
    }
    $('#status').textContent = `秘境 · ${win}`;
  } else if (S.mode === 'ancient' && S.ancientData) {
    const d = S.ancientData;
    const run = S.ancientRun;
    if (!run) {
      if (data.winner === 0) {
        addReward(d.reward);
        S.clears['ancient:' + d.id] = true; saveClears();
        S.season.ancientCleared = true; saveSeason();
        $('#resultTitle').textContent = '上古阶段通关';
        $('#resultSub').textContent = `${d.beast} · 第${d.stage}阶段 · ${rounds} 回合`;
        $('#rewards').textContent = `上古奖励：${fmtRewards(d.reward)}`;
      } else {
        $('#resultTitle').textContent = '上古挑战失败';
        $('#resultSub').textContent = `${d.beast} · 第${d.stage}阶段 · ${rounds} 回合`;
      }
      $('#next').hidden = true;
    } else {
      const phase = run.phase === 2 ? 2 : 1;
      run.wins[phase - 1] = data.winner === 0;
      saveAncientRun();
      const reward = run.reward || d.reward || {};
      const gain = (data.winner === 0 && phase === 2 && run.wins[0]) ? reward : null;
      if (gain) addReward(gain);
      $('#rewards').textContent = gain
        ? `上古奖励：${fmtRewards(gain)}`
        : (phase === 1 && data.winner === 0 ? '一队胜利 · 奖励将在双队皆胜后结算' : '');
      if (phase === 1) {
        $('#resultTitle').textContent = data.winner === 0 ? '一队胜利' : '一队失利';
        $('#resultSub').textContent = `${d.beast} · 第${d.stage}阶段 · 一队 ${rounds} 回合 · 二队将获得${data.winner === 0 ? '先锋余威' : '背水一战'}`;
        $('#next').hidden = false;
        $('#next').textContent = '二队出战';
      } else {
        const both = !!(run.wins[0] && run.wins[1]);
        if (both) {
          S.clears['ancient:' + d.id] = true; saveClears();
          S.season.ancientCleared = true; saveSeason();
          $('#resultTitle').textContent = '上古通关';
          $('#resultSub').textContent = `${d.beast} · 第${d.stage}阶段 · 双队皆胜 · ${rounds} 回合`;
        } else {
          $('#resultTitle').textContent = '上古挑战失败';
          $('#resultSub').textContent = `${d.beast} · 第${d.stage}阶段 · 一队${run.wins[0] ? '胜' : '负'} / 二队${run.wins[1] ? '胜' : '负'} · ${rounds} 回合`;
        }
        $('#next').hidden = true;
        S.ancientRun = null; S.ancientPhase = 1;
        saveAncientRun();
      }
    }
    $('#status').textContent = `上古 · ${win}`;
  } else if (S.mode === 'tower' && S.towerData) {
    const floor = S.towerData.floor;
    if (data.winner === 0) {
      const capBefore = staminaCap();
      const reward = S.towerData.reward || {};
      for (const k in reward) S.inventory[k] = (S.inventory[k] || 0) + reward[k];
      S.tower.best = Math.max(S.tower.best || 1, floor);
      S.tower.floor = floor + 1;      // 无限塔：没有层数上限
      S.towerBuff = null;
      saveTower(); saveInventory(); renderWallet();
      notifyStaminaGrowth(capBefore);
      bumpSeasonWeekly('tower', 1);
      if (floor % 100 === 0) claimMilestone(floor, true);
      ensureTowerFloors(floor + 13);  // 预取下一层，便于直接“下一关”
      $('#resultTitle').textContent = '塔层通过';
      $('#resultSub').textContent = `第 ${floor} 层${S.towerData.boss ? ' · BOSS' : ''} · ${rounds} 回合`;
      $('#rewards').textContent = `塔层奖励：${fmtRewards(reward)}`;
      $('#next').hidden = false;
    } else {
      $('#resultTitle').textContent = '挑战失败';
      $('#resultSub').textContent = `第 ${floor} 层 · ${rounds} 回合，调整阵容或增益再战`;
      $('#next').hidden = true;
    }
    $('#status').textContent = `将星塔 · ${win}`;
  } else if (S.mode === 'level' && lv) {
    if (data.winner === 0) {
      const capBefore = staminaCap();
      const first = !Object.prototype.hasOwnProperty.call(S.progress.stars, lv.id);
      const reward = grantRewards(lv, first);
      const stars = rounds <= 10 ? 3 : rounds <= 18 ? 2 : 1;
      S.progress.stars[lv.id] = Math.max(S.progress.stars[lv.id] || 0, stars);
      S.progress.unlocked = Math.max(S.progress.unlocked, Math.min(700, lv.id + 1));
      saveProgress();
      notifyStaminaGrowth(capBefore);
      renderLevels();
      renderLevelInfo();
      $('#resultTitle').textContent = lv.id >= 700 ? '全卷通关' : '关卡通关';
      $('#resultSub').textContent = `第 ${lv.id} 关 · ${lv.name} · ${rounds} 回合 · ${'★'.repeat(stars)}`;
      $('#rewards').textContent = `${first ? '首通奖励' : '重复奖励'}：${fmtRewards(reward)}`;
      $('#next').hidden = lv.id >= 700;
      // 章末关首通：自动播放本章剧情，看完赐宿将印（永久增幅）
      if (first && lv.id % 10 === 0 && typeof playChapterCinema === 'function') {
        setTimeout(() => playChapterCinema(lv.id), 2000);
      }
    } else {
      $('#resultTitle').textContent = '战败';
      $('#resultSub').textContent = `第 ${lv.id} 关 · ${lv.name} · ${rounds} 回合，调整阵容再战`;
      $('#next').hidden = true;
    }
    $('#status').textContent = `关卡结束 · ${win}`;
  } else {
    $('#resultTitle').textContent = win;
    $('#resultSub').textContent = `第 ${rounds} 回合${data.timeout ? ' · 超时判定' : ''}`;
    $('#next').hidden = true;
    $('#status').textContent = `战斗结束 · ${win}`;
  }
  $('#resultTitle').classList.toggle('lose', data.winner === 1);
  AudioSys.play(data.winner === 0 ? 'win' : 'lose');
  $('#overlay').hidden = false;
  updateBattleButtons();
  if (data.winner === 0 && S.mode === 'level' && lv) chapterBattleResult(lv, teamActive());
  if (data.winner === 0) maybeEncounterAfterWin();
}

init().catch(e => { $('#status').textContent = '加载失败：' + e.message; });
