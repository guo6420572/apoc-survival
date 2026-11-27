/* 剧情 / 任务 / 奇遇 / 新手引导（依赖 app.js 的全局 S、$、esc、flash 等，运行时调用） */

const VOL_STORY = {
  1: { title: '黄巾之乱', text: '光和七年，疫起冀州。太平道以符水聚众，八州同反，黄巾一夜之间铺满中原。官军与义军往复拉锯，郡县空了，田也空了。你从一座小城起兵，收拢流民与残卒——先要活下来的，不是天下，是手里这些人。' },
  2: { title: '群雄讨董', text: '董卓挟天子入洛阳，废立由己，焚城迁都。十八路诸侯筑坛会盟，各怀心思。汜水关的血未干，虎牢关的戟又起。乱世真正开始的标志，不是董卓进京，是盟军散伙。' },
  3: { title: '官渡之前', text: '河北四世三公，中原挟天子以令诸侯。白马、延津、乌巢，三步棋决定北方归属。官渡之前，胜负其实已定，只是没人肯认。' },
  4: { title: '赤壁', text: '曹操南下，刘琮束手，江东路绝。长江之上，风与火决定三国的雏形，也决定谁还能回到故乡。' },
  5: { title: '汉中与合肥', text: '赤壁之后，三分之势渐成。汉中的山道、合肥的坚城、逍遥津的八百骑，每一处都在改疆界；每一处也都有人不肯退。' },
  6: { title: '夷陵与南中', text: '关羽败走，刘备东征，陆逊一把火烧尽七百里连营。南中群山之间，七擒七纵与藤甲毒瘴一同流传。蜀汉的元气，从这一卷开始见底。' },
  7: { title: '五丈原', text: '诸葛亮六出祁山，司马懿坚守不出。五丈原的秋风吹落将星，姜维接过旗，才发现蜀汉的国力早已走到尽头。汉四百年，在这里收尾。' },
};
const BOSS_LINE = {
  张角: '苍天已死，黄天当立！', 董卓: '顺我者昌，逆我者亡。', 吕布: '天下英雄，谁堪我一击？',
  曹操: '宁我负人，毋人负我。', 周瑜: '东风已起，曹军可破。', 关羽: '关某在此，谁敢一战？',
  司马懿: '忍一时，得天下。', 张辽: '八百骑，足破十万。', 陆逊: '火烧连营，就在今夜。',
  黄忠: '老将出马，一刀定汉中。', 邓艾: '阴平小道，可通成都。',
};
const STORY_REWARD = { '铜钱': 1200, '招贤令': 1 };
const TUTORIAL_STEPS = [
  { title: '主城', text: '这里是你的主城。上方是资源与体力，下方是征战、招募、商城等入口。先点「征战」开始主线。' },
  { title: '征战', text: '选择关卡后进入编队。每章第 1/5/10 关为固定阵容，第 10 关必有 BOSS；通关解锁下一关。' },
  { title: '编队', text: '常规上阵 5 人，上古副本 8 人。前排先承伤，后排输出；点击武将可查看六维、技能与传记。' },
  { title: '战斗', text: '战斗自动进行，可切手动、暂停、加速或跳过。中间是日志，两侧是双方每名武将的输出/承伤/治疗。' },
  { title: '养成与装备', text: '突破 5 段解锁技能栏，觉醒 6 星解锁战法栏；技能书来自战斗，战法书来自分解武将，神器用碎片合成。' },
  { title: '任务与奇遇', text: '「任务」领主线/日常奖励；「游历」消耗体力触发奇遇；「剧情」可回看已解锁章节的故事。' },
  { title: '羁绊与助阵', text: '编队页会显示当前已触发的羁绊；主力满员后，点左侧武将会进入「助阵」。助阵不参战，但计入羁绊。悬停/点击羁绊可看条件与效果。' },
  { title: '试炼与世界首领', text: '主城「试炼」每日/每周轮换，按条件组队；「世界首领」每日按伤害领档位奖励，战败也计入伤害。' },
  { title: '内政与好感', text: '「内政」派出武将执行数小时任务，离线也计时；武将详情可查看好感、赠礼并开启个人传。' },
  { title: '赛季与功勋', text: '「功勋」里有成就/收集/塔里程碑/称号；「赛季」每周目标与积分奖励可持续领取。' },
  { title: '秘境与无尽', text: '「秘境」是十层分支地图，事件/招募/遗物可选；「无尽」每波三选一强化，挑战历史最高波次。' },
];
const MAIN_QUESTS = [
  { id: 'm1', title: '初出茅庐', desc: '通关第 1 章', reward: { '铜钱': 5000, '招贤令': 2 }, done: () => (S.progress.unlocked || 1) > 10 },
  { id: 'm2', title: '桃园结义', desc: '拥有 10 名武将', reward: { '招贤令': 5 }, done: () => S.owned.length >= 10 },
  { id: 'm3', title: '初露锋芒', desc: '通关第一卷（100 关）', reward: { '招贤令': 5, '金符': 2 }, done: () => (S.progress.unlocked || 1) > 100 },
  { id: 'm4', title: '兵强马壮', desc: '拥有 30 名武将', reward: { '招贤令': 8 }, done: () => S.owned.length >= 30 },
  { id: 'm5', title: '百炼成钢', desc: '任意武将突破 3 段', reward: { '魂石': 200 }, done: () => maxUnitField('bt') >= 3 },
  { id: 'm6', title: '觉醒之力', desc: '任意武将觉醒 3 星', reward: { '将魂': 300 }, done: () => maxUnitField('aw') >= 3 },
  { id: 'm7', title: '登塔十层', desc: '将星塔达到第 10 层', reward: { '塔币': 800, '招贤令': 2 }, done: () => (S.tower.best || 1) >= 10 },
  { id: 'm8', title: '秘宝初现', desc: '获得 1 件神器', reward: { '神器碎片': 5 }, done: () => countPrefix(ARTIFACTS) > 0 },
  { id: 'm9', title: '书中自有', desc: '获得 1 本技能书', reward: { '兵书': 100 }, done: () => countPrefix({ '技能书·': 1 }) > 0 },
  { id: 'm10', title: '三十六计', desc: '获得 1 本战法书', reward: { '将魂': 100 }, done: () => countPrefix({ '战法书·': 1 }) > 0 },
  { id: 'm11', title: '群雄逐鹿', desc: '通关第三卷（300 关）', reward: { '招贤令': 10, '金符': 3 }, done: () => (S.progress.unlocked || 1) > 300 },
  { id: 'm12', title: '赤壁东风', desc: '通关第四卷（400 关）', reward: { '招贤令': 10, '金符': 3 }, done: () => (S.progress.unlocked || 1) > 400 },
  { id: 'm13', title: '汉中王', desc: '通关第五卷（500 关）', reward: { '招贤令': 12, '金符': 4 }, done: () => (S.progress.unlocked || 1) > 500 },
  { id: 'm14', title: '夷陵业火', desc: '通关第六卷（600 关）', reward: { '招贤令': 12, '金符': 4 }, done: () => (S.progress.unlocked || 1) > 600 },
  { id: 'm15', title: '星落五丈原', desc: '通关第七卷（700 关）', reward: { '招贤令': 20, '金符': 8 }, done: () => !!((S.progress.stars || {})[700]) },
  { id: 'm16', title: '百将归心', desc: '拥有 100 名武将', reward: { '招贤令': 20 }, done: () => S.owned.length >= 100 },
  { id: 'm17', title: '登峰造极', desc: '将星塔达到第 50 层', reward: { '塔币': 3000, '招贤令': 5 }, done: () => (S.tower.best || 1) >= 50 },
];
const DAILY_TASKS = [
  { id: 'd_battle', title: '沙场点兵', desc: '完成 3 场战斗', key: 'battle', need: 3, reward: { '铜钱': 8000 } },
  { id: 'd_win', title: '连战连捷', desc: '取得 3 场胜利', key: 'win', need: 3, reward: { '招贤令': 2 } },
  { id: 'd_recruit', title: '招贤纳士', desc: '招募 3 次', key: 'recruit', need: 3, reward: { '兵书': 60 } },
  { id: 'd_upgrade', title: '精益求精', desc: '强化 3 次', key: 'upgrade', need: 3, reward: { '将魂': 60 } },
  { id: 'd_tower', title: '登塔试炼', desc: '挑战将星塔 1 次', key: 'tower', need: 1, reward: { '塔币': 300 } },
  { id: 'd_encounter', title: '江湖奇遇', desc: '触发 1 次奇遇', key: 'encounter', need: 1, reward: { '神器碎片': 5 } },
];
const ENCOUNTERS = [
  { title: '山中隐士', text: '山道尽头，一位白发老者正在煮茶。他抬眼看你，说你的军阵杀气太重。', choices: [
    { label: '请教兵法', text: '老者以竹枝在地上画阵，你受益匪浅。', effect: { '兵书': 20, '铜钱': 3000 } },
    { label: '奉上酒食', text: '老者大笑，赠你一包旧物。', effect: { '神器碎片': 2 } } ] },
  { title: '破庙古箱', text: '荒庙角落有一只落满灰尘的木箱，锁早已朽坏。', choices: [
    { label: '撬开', text: '箱中竟有前朝军资。', effect: { '铜钱': 8000 }, risk: { chance: 0.4, text: '箱底机关弹出，你损失了一些铜钱。', effect: { '铜钱': -3000 } } },
    { label: '离开', text: '你没有动它，继续赶路。', effect: {} } ] },
  { title: '流民求援', text: '一队流民拦住去路，老人和孩子都已饿得走不动。', choices: [
    { label: '开仓赈济', text: '流民叩谢，其中有几名壮士愿意从军。', effect: { '将魂': 40, '铜钱': -5000 } },
    { label: '驱散', text: '你硬起心肠离开。', effect: {} } ] },
  { title: '迷路商队', text: '一支商队在岔路口争执不休，货物散了一地。', choices: [
    { label: '护送一程', text: '商队首领千恩万谢。', effect: { '铜钱': 6000, '招贤令': 1 } },
    { label: '索要酬劳', text: '你收下厚礼，商队敢怒不敢言。', effect: { '铜钱': 10000 } } ] },
  { title: '河边钓叟', text: '河边有位老翁垂钓，鱼篓里却空空如也。', choices: [
    { label: '陪他坐一会', text: '老翁从怀里摸出几块碎片。', effect: { '神器碎片': 3 } },
    { label: '请教武艺', text: '老翁随手一竿，点破你的招式。', effect: { 'randomSkillBook': 1 } } ] },
  { title: '古碑残卷', text: '荒野中立着一块残碑，碑文被青苔遮去大半。', choices: [
    { label: '拓印碑文', text: '你抄下几段古人用兵之法。', effect: { 'randomSkillBook': 1 } },
    { label: '刮取金粉', text: '碑上金粉已朽，只换得些铜钱。', effect: { '铜钱': 5000 } } ] },
  { title: '黑市商人', text: '一名蒙面商人掀开斗篷，露出一卷古旧的兵书。', choices: [
    { label: '买下兵书（10000 铜钱）', text: '商人留下兵书，消失在人群中。', effect: { '铜钱': -10000, 'randomTactic': 1 } },
    { label: '离开', text: '你摇了摇头。', effect: {} } ] },
  { title: '旧战场', text: '枯草间散落着残破的甲片，远处还有未熄的余烟。', choices: [
    { label: '拾取残骸', text: '你找到几块奇异的金属碎片。', effect: { '神器碎片': 4 } },
    { label: '祭拜亡者', text: '你默立片刻，心中反而安定。', effect: { '兵书': 30, '将魂': 20 } } ] },
  { title: '醉酒武将', text: '一名虬髯武将抱着酒坛，非要与你比个高低。', choices: [
    { label: '与他比试', text: '你们打到酒醒，他大笑着认输。', effect: { '铜钱': 9000, '招贤令': 1 }, risk: { chance: 0.4, text: '你被他灌醉，醒来时钱袋轻了不少。', effect: { '铜钱': -2000 } } },
    { label: '请他喝酒', text: '他向你说起许多旧事。', effect: { '兵书': 20 } } ] },
  { title: '山贼拦路', text: '山道两侧忽然跳出数十名山贼，为首者横刀立马。', choices: [
    { label: '迎战', text: '你杀散山贼，缴获了他们的存粮。', effect: { '铜钱': 7000 }, risk: { chance: 0.4, text: '山贼人多势众，你突围时损失了一些军资。', effect: { '铜钱': -3000 } } },
    { label: '买路', text: '你丢下买路钱，山贼让开道路。', effect: { '铜钱': -3000 } },
    { label: '绕路', text: '你绕行半日，人马疲惫。', effect: { 'stamina': -10 } } ] },
];
/* ===== 章节秘宝 / 将星印记 / 章节悬赏 ===== */
const STAT_LABEL = {
  atk: '攻击', dr: '减伤', crit: '暴击率', crit_dmg: '暴击伤害', hp: '兵力',
  strategy_dmg: '策略伤害', heal: '治疗效果', speed: '速度', effect_hit: '效果命中',
  lifesteal: '吸血', dodge: '闪避', pen: '穿透',
};
const SIGIL_TYPES = [
  { key: 'atk', name: '战意' }, { key: 'dr', name: '铁壁' },
  { key: 'crit', name: '杀伐' }, { key: 'crit_dmg', name: '裂阵' },
  { key: 'hp', name: '虎威' }, { key: 'strategy_dmg', name: '将略' },
  { key: 'heal', name: '回春' }, { key: 'speed', name: '疾风' },
];
const SIGIL_SPECIALS = [
  { id: 'rage', name: '怒涛', desc: '每回合开始全军怒气 +20' },
  { id: 'shield', name: '金城', desc: '每回合开始全军获得护盾（威仪×15%）' },
  { id: 'regen', name: '生生', desc: '每回合回复 4% 兵力' },
  { id: 'opening', name: '先声', desc: '首回合伤害 +15%' },
  { id: 'survive', name: '不屈', desc: '每场战斗免死一次（保留 20% 兵力）' },
  { id: 'dodge', name: '如风', desc: '闪避 +8%' },
  { id: 'pen', name: '破甲', desc: '无视防御 +10%' },
  { id: 'crit', name: '见血', desc: '暴击率 +6%' },
  { id: 'burn', name: '燎原', desc: '全军灼烧伤害 +8%' },
  { id: 'drain', name: '饮血', desc: '吸血 +5%' },
];
const RELIC_THEMES = {
  1: [
    { name: '黄天符箓', desc: '符纸上的“黄天”二字仍未褪色。', stats: { strategy_dmg: 0.06 }, special: 'regen' },
    { name: '太平残卷', desc: '半卷太平要术，字迹被血浸透。', stats: { heal: 0.06, strategy_dmg: 0.03 }, special: 'regen' },
    { name: '符水葫芦', desc: '军中巫祝以符水治伤，颇为灵验。', stats: { hp: 0.10 }, special: 'shield' },
    { name: '黄巾力士甲', desc: '粗铁打造的护心甲，沉重却可靠。', stats: { dr: 0.06, hp: 0.04 }, special: 'survive' },
  ],
  2: [
    { name: '七星宝刀', desc: '刀身七星连珠，一出鞘便见寒光。', stats: { atk: 0.07 }, special: 'opening' },
    { name: '赤兔鞍鞯', desc: '名驹留下的旧鞍，仍带着风雷气。', stats: { speed: 0.06 }, special: 'dodge' },
    { name: '西凉铁骑令', desc: '董卓西凉军的调兵铁令。', stats: { hp: 0.08, dr: 0.03 }, special: 'shield' },
    { name: '貂蝉香囊', desc: '一囊幽香，能乱人心神。', stats: { effect_hit: 0.06 }, special: 'pen' },
  ],
  3: [
    { name: '乌巢火油', desc: '淳于琼屯粮处搜出的火油。', stats: { strategy_dmg: 0.08 }, special: 'burn' },
    { name: '白马银枪', desc: '白马义从的制式长枪。', stats: { atk: 0.06, crit: 0.04 }, special: 'crit' },
    { name: '河北强弩', desc: '袁绍军中的强弩，射程惊人。', stats: { crit: 0.06 }, special: 'pen' },
    { name: '袁氏印绶', desc: '四世三公的印绶，如今已无人认领。', stats: { hp: 0.07, heal: 0.04 }, special: 'regen' },
  ],
  4: [
    { name: '东风羽扇', desc: '扇骨上刻着祭风的符咒。', stats: { strategy_dmg: 0.10 }, special: 'rage' },
    { name: '连环铁索', desc: '曹操锁船的旧链，锈迹斑斑。', stats: { dr: 0.05, hp: 0.05 }, special: 'survive' },
    { name: '火船引信', desc: '浸过鱼油的引信，一点就着。', stats: { crit_dmg: 0.12 }, special: 'burn' },
    { name: '江东风帆', desc: '东吴快船的帆布，轻而韧。', stats: { speed: 0.06, hp: 0.04 }, special: 'dodge' },
  ],
  5: [
    { name: '定军山弓', desc: '黄忠阵前用过的硬弓。', stats: { crit: 0.07 }, special: 'pen' },
    { name: '逍遥津铁甲', desc: '张辽八百骑所着的重甲。', stats: { dr: 0.07 }, special: 'shield' },
    { name: '汉水令旗', desc: '赵云以空营退敌时竖起的旗。', stats: { hp: 0.10 }, special: 'regen' },
    { name: '木牛流马', desc: '蜀中巧匠所制的运粮机关。', stats: { speed: 0.05, hp: 0.05 }, special: 'rage' },
  ],
  6: [
    { name: '连营火把', desc: '夷陵七百里连营的余烬。', stats: { strategy_dmg: 0.08 }, special: 'burn' },
    { name: '藤甲', desc: '南中藤甲，刀箭难入，唯惧火。', stats: { dr: 0.09 }, special: 'survive' },
    { name: '毒瘴囊', desc: '南中瘴气凝成的毒囊。', stats: { strategy_dmg: 0.06, crit: 0.04 }, special: 'pen' },
    { name: '八阵图残卷', desc: '诸葛亮八阵图的残页。', stats: { dr: 0.05, heal: 0.05 }, special: 'shield' },
  ],
  7: [
    { name: '诸葛巾', desc: '丞相常戴的纶巾，纤尘不染。', stats: { strategy_dmg: 0.10, heal: 0.04 }, special: 'rage' },
    { name: '木牛', desc: '祁山道上运粮的木牛。', stats: { hp: 0.10, dr: 0.04 }, special: 'regen' },
    { name: '七星灯', desc: '五丈原续命的七星灯。', stats: { heal: 0.08 }, special: 'survive' },
    { name: '祁山连弩', desc: '蜀军连弩，一弩十矢。', stats: { atk: 0.08, crit: 0.05 }, special: 'pen' },
  ],
};

function weighted(pairs) {
  let r = Math.random(), acc = 0;
  for (const [k, w] of pairs) { acc += w; if (r < acc) return k; }
  return pairs[pairs.length - 1][0];
}
function rollSigilRarity(ch) {
  const t = ch >= 61 ? [['精良', 0.40], ['传奇', 0.42], ['绝世', 0.18]]
    : ch >= 41 ? [['精良', 0.45], ['传奇', 0.40], ['绝世', 0.15]]
      : [['精良', 0.55], ['传奇', 0.35], ['绝世', 0.10]];
  return weighted(t);
}
function rollRelicRarity(ch) {
  const t = ch >= 61 ? [['精良', 0.45], ['传奇', 0.40], ['绝世', 0.15]]
    : ch >= 41 ? [['精良', 0.52], ['传奇', 0.36], ['绝世', 0.12]]
      : [['精良', 0.60], ['传奇', 0.32], ['绝世', 0.08]];
  return weighted(t);
}
function chapterOfLevel(id) { return Math.ceil(id / 10); }
function chapterMeta(ch) {
  const lv = (S.levels || []).find(l => l.id === ch * 10) || {};
  const first = (lv.enemies && lv.enemies[0]) || {};
  return {
    ch, level: ch * 10,
    name: lv.chapter_name || lv.name || `第${ch}章`,
    boss: first.name || '敌军主将',
    faction: first.faction || '群雄',
    volume: lv.volume || Math.ceil(ch / 10),
  };
}
function specialById(id) { return SIGIL_SPECIALS.find(s => s.id === id) || null; }
function specialName(special) {
  if (!special) return '';
  const s = typeof special === 'string' ? specialById(special) : specialById(special.id);
  return s ? `${s.name}（${s.desc}）` : '';
}
function sigilsOf(name) {
  const p = (S.unitProgress || {})[name];
  return (p && p.sigils) || [];
}
function sigilCount() {
  return (S.owned || []).reduce((n, name) => n + sigilsOf(name).length, 0);
}
function makeSigil(ch, unitName) {
  const meta = chapterMeta(ch);
  const u = S.by[unitName] || {};
  const match = (u.faction || '') === meta.faction;
  const rarity = rollSigilRarity(ch);
  const cfg = { 精良: { n: 1, base: 0.05 }, 传奇: { n: 2, base: 0.06 }, 绝世: { n: 2, base: 0.08 } }[rarity];
  const n = rarity === '绝世' && Math.random() < 0.5 ? 3 : cfg.n;
  const types = [...SIGIL_TYPES].sort(() => Math.random() - 0.5).slice(0, n);
  const scale = (1 + (ch - 1) * 0.006) * (match ? 1.4 : 1);
  const stats = {};
  types.forEach(t => {
    stats[t.key] = Math.round(cfg.base * (0.85 + Math.random() * 0.3) * scale * 1000) / 1000;
  });
  const special = rarity === '绝世' ? SIGIL_SPECIALS[Math.floor(Math.random() * SIGIL_SPECIALS.length)]
    : (rarity === '传奇' && Math.random() < 0.15 ? SIGIL_SPECIALS[Math.floor(Math.random() * SIGIL_SPECIALS.length)] : null);
  return {
    name: `${meta.name}·${types[0] ? types[0].name : '将星'}印`,
    ch, rarity, stats, special, match, unit: unitName, at: Date.now(),
  };
}
function makeSigilOffers(ch) {
  const meta = chapterMeta(ch);
  const eligible = (S.owned || []).filter(n => sigilsOf(n).length < 5);
  const fit = eligible.filter(n => (S.by[n] || {}).faction === meta.faction).sort(() => Math.random() - 0.5);
  const rest = eligible.filter(n => (S.by[n] || {}).faction !== meta.faction).sort(() => Math.random() - 0.5);
  const picks = [];
  if (fit.length) picks.push(fit[0]);
  const team = (S.a || []).filter(n => eligible.includes(n) && !picks.includes(n));
  if (team.length && Math.random() < 0.5) picks.push(team[Math.floor(Math.random() * team.length)]);
  for (const n of [...fit, ...rest]) {
    if (picks.length >= 3) break;
    if (!picks.includes(n)) picks.push(n);
  }
  return picks.sort(() => Math.random() - 0.5).map(unit => ({ unit, sigil: makeSigil(ch, unit) }));
}
function makeRelicDrop(ch) {
  const meta = chapterMeta(ch);
  const pool = RELIC_THEMES[Math.ceil(ch / 10)] || RELIC_THEMES[1];
  const base = pool[Math.floor(Math.random() * pool.length)];
  const rarity = rollRelicRarity(ch);
  const mult = { 精良: 1, 传奇: 1.4, 绝世: 1.85 }[rarity] || 1;
  const stats = {};
  for (const [k, v] of Object.entries(base.stats)) stats[k] = Math.round(v * mult * 1000) / 1000;
  const special = rarity === '精良' ? null : base.special;
  const key = `秘宝·${meta.name}·${base.name}·${rarity}`;
  S.relics = S.relics || {};
  if (!S.relics[key]) {
    S.relics[key] = {
      key, name: `${meta.name}·${base.name}`, ch, chapter: meta.name, rarity, stats,
      special, desc: base.desc || '', at: Date.now(),
    };
  }
  return key;
}
function randomSkillName() {
  const names = typeof SKILL_DESC !== 'undefined' ? Object.keys(SKILL_DESC) : [];
  return names.length ? names[Math.floor(Math.random() * names.length)] : '';
}
function randomTacticName() {
  const names = typeof STRATAGEMS !== 'undefined' ? Object.keys(STRATAGEMS) : [];
  return names.length ? names[Math.floor(Math.random() * names.length)] : '';
}
function chapterBundle(ch) {
  const r = { 铜钱: 3000 + ch * 180, 兵书: 30 + ch * 3, 魂石: 15 + ch * 2 };
  if (Math.random() < 0.35) r.神器碎片 = 2 + Math.floor(Math.random() * 4);
  if (ch % 10 === 0) { r.玄铁 = 40 + ch; r.图纸 = 15 + Math.floor(ch / 4); }
  if (Math.random() < 0.20) {
    const sk = randomSkillName();
    if (sk) r[`技能书·${Math.min(5, 1 + Math.floor(ch / 15))}阶·${sk}`] = 1;
  }
  if (Math.random() < 0.15) {
    const st = randomTacticName();
    if (st) r[`战法书·${Math.min(6, 1 + Math.floor(ch / 10))}阶·${st}`] = 1;
  }
  return r;
}
function makeChapterQuest(ch) {
  const meta = chapterMeta(ch);
  const reqs = [
    { k: 'battles', label: '再战本章', need: 2 + Math.floor(Math.random() * 3) },
    { k: 'factionWins', label: `以${meta.faction}武将（≥3人）获胜`, need: 1 + Math.floor(Math.random() * 2) },
    { k: 'sigilWins', label: '携将星印记武将获胜', need: 1 + Math.floor(Math.random() * 2) },
  ].sort(() => Math.random() - 0.5).slice(0, 2);
  const reward = { 铜钱: 2500 + ch * 160, 兵书: 20 + ch * 3 };
  if (ch % 5 === 0) {
    const st = randomTacticName();
    if (st) reward[`战法书·${Math.min(6, 1 + Math.floor(ch / 12))}阶·${st}`] = 1;
  }
  reward.招贤令 = 1 + Math.floor(ch / 20);
  return { id: `chq_${ch}`, ch, reqs, reward, claimed: false, created: Date.now() };
}
function triggerChapterClear(ch) {
  if (!S.chapters || S.chapters.cleared[ch]) return null;
  S.chapters.cleared[ch] = true;
  const relicKey = makeRelicDrop(ch);
  const bundle = chapterBundle(ch);
  grantItems(bundle);
  S.inventory[relicKey] = (S.inventory[relicKey] || 0) + 1;
  S.chapters.quests[ch] = makeChapterQuest(ch);
  const offers = makeSigilOffers(ch);
  if (!offers.length) S.inventory['神器碎片'] = (S.inventory['神器碎片'] || 0) + 10;
  S.chapters.pending[ch] = { ch, offers, relicKey, bundle, at: Date.now() };
  saveInventory(); saveUnitProgress(); saveMeta();
  openChapterRelic(ch);
  return S.chapters.pending[ch];
}
function chapterBattleResult(lv, team) {
  if (!lv || !S.chapters) return;
  const ch = chapterOfLevel(lv.id);
  if (!ch) return;
  const meta = chapterMeta(ch);
  const st = S.chapters.stats[ch] || {};
  st.battles = (st.battles || 0) + 1;
  const t = team || S.a || [];
  if (t.filter(n => (S.by[n] || {}).faction === meta.faction).length >= 3) st.factionWins = (st.factionWins || 0) + 1;
  if (t.some(n => sigilsOf(n).length)) st.sigilWins = (st.sigilWins || 0) + 1;
  S.chapters.stats[ch] = st;
  const first = lv.id % 10 === 0 && !S.chapters.cleared[ch];
  if (first) triggerChapterClear(ch);
  else { saveMeta(); if (S.screen === 'quest') renderQuestScreen(); }
}
function sigilOfferCard(o, i) {
  const u = S.by[o.unit] || {};
  const s = o.sigil;
  const st = Object.entries(s.stats).map(([k, v]) => `${STAT_LABEL[k] || k} +${(v * 100).toFixed(1)}%`).join(' · ');
  return `<button class="sigil-card ${s.rarity}" data-sig="${i}">
    <span class="sg-ph" style="background-image:url('${pthumb(o.unit)}')"></span>
    <span class="sg-body"><b>${esc(o.unit)}</b><em>${esc(u.faction || '')} · ${esc(u.rarity || '')}</em>
      <span class="sg-name">${esc(s.name)} <i class="rar ${s.rarity}">${s.rarity}</i></span>
      <span class="sg-stat">${esc(st)}</span>
      ${s.special ? `<span class="sg-sp">${esc(s.special.name)}：${esc(s.special.desc)}</span>` : ''}
      ${s.match ? '<span class="sg-fit">契合 · 本章阵营加成 ×1.4</span>' : ''}
    </span></button>`;
}
function openChapterRelic(ch) {
  const p = S.chapters.pending && S.chapters.pending[ch];
  if (!p) return;
  const meta = chapterMeta(ch);
  $('#chapterTitle').textContent = `章节秘宝 · 第 ${ch} 章「${meta.name}」`;
  $('#chapterBody').innerHTML = `<p>首次踏平${esc(meta.name)}，敌军辎重尽入我手。${meta.boss ? `${esc(meta.boss)}的旧物与将星余烬散落阵前。` : ''}</p>
    <p class="chapter-gain">章节战利：${esc(fmtRewards(p.bundle || {}))}</p>`;
  const relic = S.relics[p.relicKey];
  $('#chapterRelicLine').innerHTML = relic ? `<div class="relic-card ${relic.rarity}">
    <div class="rc-head"><b>${esc(relic.name)}</b><em class="rar ${relic.rarity}">${relic.rarity}</em></div>
    <span>${esc(effLabel(relic.stats))}${relic.special ? ' · ' + esc(specialName(relic.special)) : ''}</span>
    <small>${esc(relic.desc)} · 已收入背包，可在武将详情「秘宝栏」装备</small></div>` : '';
  if (p.offers && p.offers.length) {
    $('#chapterSigils').innerHTML = '<div class="sigil-hint">将星余烬凝成三枚印记，择一赐予麾下武将（同一武将最多 5 枚）：</div>' +
      p.offers.map(sigilOfferCard).join('');
    $('#chapterSigils').querySelectorAll('[data-sig]').forEach(b => b.onclick = () => chooseSigil(ch, Number(b.dataset.sig)));
  } else {
    $('#chapterSigils').innerHTML = '<div class="sigil-hint">全军印记已满，余烬化作神器碎片 ×10 收入囊中。</div>';
  }
  $('#chapterRelic').hidden = false;
}
function chooseSigil(ch, idx) {
  const p = S.chapters.pending && S.chapters.pending[ch];
  if (!p || !p.offers || !p.offers[idx]) return;
  const o = p.offers[idx];
  const prog = unitProg(o.unit);
  prog.sigils = prog.sigils || [];
  prog.sigils.push(o.sigil);
  saveUnitProgress();
  delete S.chapters.pending[ch];
  saveMeta();
  $('#chapterRelic').hidden = true;
  renderWallet();
  flash(`${o.unit} 获得将星印记「${o.sigil.name}」`);
  if (S.screen === 'quest') renderQuestScreen('chapter');
}
function claimChapterQuest(ch) {
  const q = S.chapters.quests[ch];
  if (!q || q.claimed) return;
  const st = S.chapters.stats[ch] || {};
  if (!q.reqs.every(r => (st[r.k] || 0) >= r.need)) return;
  q.claimed = true;
  saveMeta();
  grantItems(q.reward);
  flash(`领取第 ${ch} 章余韵奖励`);
  renderQuestScreen('chapter');
}
function chapterRewardList(p) {
  return Object.entries(p.bundle || {}).map(([k, v]) => `${k} +${v}`).join('　');
}
function renderChapterTab(list) {
  const cleared = Object.keys(S.chapters.cleared || {}).map(Number).sort((a, b) => b - a);
  const pending = Object.keys(S.chapters.pending || {}).map(Number).sort((a, b) => a - b);
  const rows = [];
  rows.push(`<div class="chapter-sum">章节秘宝已开启 <b>${cleared.length}</b> / 70 · 每章第 10 关首通可得章节秘宝、将星印记与专属悬赏</div>`);
  pending.forEach(ch => {
    const meta = chapterMeta(ch);
    const p = S.chapters.pending[ch];
    rows.push(`<div class="quest-item pend">
      <div class="qi-main"><b>第 ${ch} 章 · ${esc(meta.name)}</b><span>${p.offers && p.offers.length ? '将星印记三选一待定' : '余烬已化作神器碎片 ×10'}</span></div>
      <div class="qi-reward">${esc(chapterRewardList(p))}</div>
      <button class="mini" data-pend="${ch}">${p.offers && p.offers.length ? '择印' : '查看'}</button></div>`);
  });
  cleared.forEach(ch => {
    const q = S.chapters.quests[ch];
    if (!q) return;
    const meta = chapterMeta(ch);
    const st = S.chapters.stats[ch] || {};
    const ok = q.reqs.every(r => (st[r.k] || 0) >= r.need);
    rows.push(`<div class="quest-item${ok ? ' done' : ''}">
      <div class="qi-main"><b>第 ${ch} 章 · ${esc(meta.name)}余韵</b><span>${q.reqs.map(r => `${esc(r.label)} ${Math.min(r.need, st[r.k] || 0)}/${r.need}`).join(' · ')}</span></div>
      <div class="qi-reward">${esc(fmtRewards(q.reward || {}))}</div>
      <button class="mini${q.claimed ? ' ghost' : ''}" data-chq="${ch}" ${ok && !q.claimed ? '' : 'disabled'}>${q.claimed ? '已领取' : ok ? '领取' : '未完成'}</button></div>`);
  });
  if (!cleared.length) rows.push('<div class="bag-empty">通关每章第 10 关后，可获得章节秘宝、将星印记与专属悬赏。</div>');
  const ledger = (S.owned || []).map(n => ({ n, s: sigilsOf(n) })).filter(x => x.s.length)
    .sort((a, b) => b.s.length - a.s.length);
  if (ledger.length) {
    rows.push(`<div class="sigil-ledger"><div class="dl">将星印记簿 · 共 ${sigilCount()} 枚</div>${ledger.map(x =>
      `<div class="sl-row" data-unit="${esc(x.n)}"><b>${esc(x.n)}</b><span>${x.s.length} 枚${x.s.length >= 3 ? ' · 共鸣中' : ''}</span>
        <em>${x.s.slice(0, 3).map(s => esc(String(s.name).replace(/^.*·/, ''))).join('、')}${x.s.length > 3 ? '…' : ''}</em></div>`).join('')}</div>`);
  }
  list.innerHTML = rows.join('');
  list.querySelectorAll('[data-pend]').forEach(b => b.onclick = () => openChapterRelic(Number(b.dataset.pend)));
  list.querySelectorAll('[data-chq]').forEach(b => b.onclick = () => claimChapterQuest(Number(b.dataset.chq)));
  list.querySelectorAll('.sl-row').forEach(b => b.onclick = () => openDetail(b.dataset.unit));
}

const TODO = null;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function maxUnitField(k) {
  let m = 0;
  for (const p of Object.values(S.unitProgress || {})) m = Math.max(m, p[k] || 0);
  return m;
}
function countPrefix(obj) {
  const prefixes = Object.keys(obj);
  let n = Object.keys(S.inventory).filter(k => prefixes.some(p => k.startsWith(p)) && (S.inventory[k] || 0) > 0).length;
  for (const p of Object.values(S.unitProgress || {})) {
    for (const k of ['skillBook', 'tacticBook', 'artifact']) {
      if (p[k] && prefixes.some(pre => String(p[k]).startsWith(pre))) n++;
    }
  }
  return n;
}
function loadMeta() {
  let st = {}, tk = {};
  try { st = JSON.parse(localStorage.getItem('sg_story') || '{}'); } catch (e) { /* ignore */ }
  try { tk = JSON.parse(localStorage.getItem('sg_tasks') || '{}'); } catch (e) { /* ignore */ }
  let ch = {};
  try { ch = JSON.parse(localStorage.getItem('sg_chapters') || '{}'); } catch (e) { /* ignore */ }
  let rel = {};
  try { rel = JSON.parse(localStorage.getItem('sg_relics') || '{}'); } catch (e) { /* ignore */ }
  S.story = Object.assign({ seen: [], tutorialDone: false }, st);
  S.tasks = Object.assign({ date: '', counters: {}, dailyClaimed: [], mainClaimed: [] }, tk);
  S.chapters = Object.assign({ cleared: {}, stats: {}, quests: {}, pending: {} }, ch);
  S.chapters.cleared = S.chapters.cleared || {};
  S.chapters.stats = S.chapters.stats || {};
  S.chapters.quests = S.chapters.quests || {};
  S.chapters.pending = S.chapters.pending || {};
  S.relics = Object.assign({}, rel || {});
  S.tasks.counters = S.tasks.counters || {};
  S.taskTab = S.taskTab || 'main';
  if (S.tasks.date !== todayStr()) {
    S.tasks.date = todayStr(); S.tasks.counters = {}; S.tasks.dailyClaimed = [];
    saveMeta();
  }
}
function saveMeta() {
  localStorage.setItem('sg_story', JSON.stringify(S.story || {}));
  localStorage.setItem('sg_tasks', JSON.stringify(S.tasks || {}));
  localStorage.setItem('sg_chapters', JSON.stringify(S.chapters || {}));
  localStorage.setItem('sg_relics', JSON.stringify(S.relics || {}));
}
function resetMeta() {
  S.story = { seen: [], tutorialDone: false };
  S.tasks = { date: todayStr(), counters: {}, dailyClaimed: [], mainClaimed: [] };
  S.chapters = { cleared: {}, stats: {}, quests: {}, pending: {} };
  S.relics = {};
  saveMeta();
}
function taskBump(key, n = 1) {
  if (!S.tasks) return;
  if (S.tasks.date !== todayStr()) {
    S.tasks.date = todayStr(); S.tasks.counters = {}; S.tasks.dailyClaimed = [];
  }
  S.tasks.counters[key] = (S.tasks.counters[key] || 0) + n;
  saveMeta();
  if (S.screen === 'quest') renderQuestScreen();
}
function grantItems(obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'randomSkillBook' || k === 'randomTactic') continue;
    if (k === 'stamina') { S.stamina.value = Math.min(STAMINA_MAX, Math.max(0, (S.stamina.value || 0) + v)); saveStamina(); renderStamina(); continue; }
    S.inventory[k] = Math.max(0, (S.inventory[k] || 0) + v);
  }
  if (obj && obj.randomSkillBook) {
    const names = Object.keys(SKILL_DESC);
    if (names.length) {
      const skill = names[Math.floor(Math.random() * names.length)];
      const key = `技能书·1阶·${skill}`;
      S.inventory[key] = (S.inventory[key] || 0) + 1;
    }
  }
  if (obj && obj.randomTactic) {
    const names = Object.keys(STRATAGEMS);
    const strat = names[Math.floor(Math.random() * names.length)];
    const key = `战法书·1阶·${strat}`;
    S.inventory[key] = (S.inventory[key] || 0) + 1;
  }
  saveInventory(); renderWallet();
}
function chapterStory(lv) {
  const v = VOL_STORY[lv.volume] || { title: lv.volume_name || '汉末', text: '汉末风云未定，四方兵戈不息。' };
  const key = (lv.volume || 1) * 100 + (lv.chapter || 1);
  const cs = (typeof CHAP_STORY !== 'undefined' && CHAP_STORY) ? CHAP_STORY[key] : null;
  if (cs && cs.paras && cs.paras.length) {
    return {
      title: `${v.title} · ${lv.chapter_name}`,
      text: cs.paras.join('\n'),
      lines: cs.lines || [],
      brief: cs.brief || '',
      act: cs.act || '',
    };
  }
  const boss = lv.boss || (lv.enemies && lv.enemies[0] && lv.enemies[0].name) || '敌军主将';
  const bossLine = BOSS_LINE[boss] || `${boss}：此战，不退。`;
  return {
    title: `${v.title} · ${lv.chapter_name}`,
    text: `${v.text}\n\n如今兵锋指向${lv.chapter_name}。${boss}的旗帜已在城外竖起，斥候回报，敌军已列阵等候。`,
    lines: [[boss, bossLine], ['主公', '传令下去，整军备战。']],
    brief: '',
    act: '',
  };
}
function chapterLevels() {
  return (S.levels || []).filter(l => ((l.id - 1) % 10 === 0)).sort((a, b) => a.id - b.id);
}
function renderStoryScreen() {
  const box = $('#storyList');
  if (!box) return;
  const chapters = chapterLevels();
  const seen = new Set(S.story.seen || []);
  $('#storyProgress').textContent = `已阅 ${seen.size} / ${chapters.length}`;
  box.innerHTML = chapters.map(lv => {
    const locked = lv.id > (S.progress.unlocked || 1);
    const cs = (typeof CHAP_STORY !== 'undefined' && CHAP_STORY) ? CHAP_STORY[(lv.volume || 1) * 100 + (lv.chapter || 1)] : null;
    const act = cs && cs.act ? `${esc(cs.act)} · ` : '';
    const key = (lv.volume || 1) * 100 + (lv.chapter || 1);
    return `<button class="story-item${locked ? ' locked' : ''}${seen.has(lv.id) ? ' seen' : ''}" data-id="${lv.id}">
      <img class="si-thumb" src="assets/story/t${key}.jpg" alt="" loading="lazy" decoding="async">
      <div class="si-txt"><b>${esc(lv.volume_name)} · ${esc(lv.chapter_name)}</b>
      <span>${locked ? '尚未解锁' : act + (seen.has(lv.id) ? '已阅读 · 点击重看' : '点击阅读')}</span></div></button>`;
  }).join('');
  box.querySelectorAll('.story-item').forEach(b => b.onclick = () => openStoryCinema(Number(b.dataset.id)));
}
function openStory(id) {
  const lv = (S.levels || []).find(l => l.id === id);
  if (!lv || id > (S.progress.unlocked || 1)) { flash('尚未解锁该章节'); return; }
  const st = chapterStory(lv);
  const first = !(S.story.seen || []).includes(id);
  if (first) {
    S.story.seen.push(id); saveMeta(); grantItems(STORY_REWARD);
    renderStoryScreen();
  }
  $('#storyTitle').textContent = st.title;
  $('#storyBody').innerHTML = st.text.split('\n').map(p => p ? `<p>${esc(p)}</p>` : '').join('') +
    st.lines.map(([who, line]) => `<div class="story-line"><b>${esc(who)}</b><span>「${esc(line)}」</span></div>`).join('') +
    (first ? `<div class="story-gain">首次阅读奖励：${esc(fmtRewards(STORY_REWARD))}</div>` : '');
  $('#storyModal').hidden = false;
}
/* ---------------- 剧情演出 ---------------- */
function buildStoryCinema(lv) {
  const st = chapterStory(lv);
  const lead = (st.lines && st.lines[0] && st.lines[0][0]) || '';
  const boss = (lead && lead !== '主公') ? lead
    : ((lv.enemies && lv.enemies[0] && lv.enemies[0].name) || '敌军主将');
  const paras = st.text.split('\n').map(x => x.trim()).filter(Boolean);
  const roster = (S.owned || []).map(n => S.by[n]).filter(Boolean);
  const strategist = roster.find(u => /军师|谋主/.test(u.role || ''))
    || roster.find(u => /术士/.test(u.role || ''));
  const lines = [];
  paras.forEach(p => lines.push({ who: '旁白', text: p, narration: true }));
  if (st.brief) lines.push({ who: strategist ? strategist.name : '军师', text: st.brief });
  (st.lines || []).forEach(pair => {
    if (pair && pair[0] && pair[1]) lines.push({ who: pair[0], text: pair[1] });
  });
  const hasLord = (st.lines || []).some(pair => pair && pair[0] === '主公');
  if (!hasLord) lines.push({ who: '主公', text: '传令三军，随我出征。' });
  lines.push({
    who: '旁白',
    text: `【${lv.volume_name} · ${lv.chapter_name}】${st.act ? st.act + '——' : ''}${lv.desc || '两军对垒，战鼓将起。'} 通关本章第 10 关可开启章节秘宝。`,
    narration: true, final: true
  });
  return { title: `${lv.volume_name} · ${lv.chapter_name}`, boss, lines, act: st.act || '',
           art: (lv.volume || 1) * 100 + (lv.chapter || 1) };
}
/* ---- 章末关首通：自动播本章剧情，看完赐宿将印（永久增幅） ---- */
function storyChartOf(lv) {
  if (typeof CHAP_STORY === 'undefined' || !CHAP_STORY) return null;
  return CHAP_STORY[(lv.volume || 1) * 100 + (lv.chapter || 1)] || null;
}
function storyBlessStats(cs, ch) {
  const base = 0.06 + ch * 0.0004;
  const stats = {};
  if (cs.bless[0]) stats[cs.bless[0]] = Math.round(base * 1000) / 1000;
  if (cs.bless[1]) stats[cs.bless[1]] = Math.round(base * 0.6 * 1000) / 1000;
  return stats;
}
function grantStoryBless(lv) {
  const cs = storyChartOf(lv);
  if (!cs || !cs.hero || !cs.bless) return;
  const ch = Math.ceil(lv.id / 10);
  const hero = cs.hero;
  S.unitProgress = S.unitProgress || {};
  const p = S.unitProgress[hero] = S.unitProgress[hero] || {};
  p.sigils = p.sigils || [];
  if (p.sigils.length >= 5) {
    S.inventory['神器碎片'] = (S.inventory['神器碎片'] || 0) + 8;
    saveInventory(); renderWallet();
    flash(`「${hero}」已满五枚印记，宿将印化作神器碎片 ×8`);
    return;
  }
  const stats = storyBlessStats(cs, ch);
  p.sigils.push({
    name: `${lv.chapter_name}·${hero}印`, ch, rarity: '传奇', stats,
    special: null, match: true, unit: hero, story: true,
    desc: cs.bless[2] || '', at: Date.now(),
  });
  saveUnitProgress();
  showSigilStamp(hero, lv.chapter_name);
  const owned = (S.owned || []).indexOf(hero) >= 0;
  flash(owned
    ? `宿将「${hero}」获永久增幅：${effLabel(stats)}（${cs.bless[2]}）`
    : `宿将「${hero}」印记已封存，待其归附时生效`);
}
function playChapterCinema(id) {
  const lv = (S.levels || []).find(l => l.id === id);
  if (!lv) return;
  const ch = Math.ceil(id / 10);
  S.story = S.story || {};
  S.story.cinema = S.story.cinema || [];
  if (S.story.cinema.indexOf(ch) >= 0) return;
  openStoryCinema(id, function () {
    S.story.cinema.push(ch);
    saveMeta();
    grantStoryBless(lv);
    renderStoryScreen();
  });
}
function showSigilStamp(hero, chapterName) {
  const el = document.createElement('div');
  el.className = 'sigil-stamp';
  el.innerHTML = `<div class="ss-box"><b>${esc(chapterName || '')}</b><i>${esc(hero || '')}印</i></div>`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
}
const LORD_FACES = ['汉室宗亲', '江东少主', '西凉雄主', '寒门游侠'];
function lordArtIndex() {
  let n = 1;
  try { n = parseInt(localStorage.getItem('sg_lord_face') || '1', 10); } catch (e) { n = 1; }
  return (n >= 1 && n <= LORD_FACES.length) ? n : 1;
}
function lordArtUrl(thumb) { return `assets/story/lord${thumb ? '_thumb' : ''}${lordArtIndex()}.jpg`; }
function cinemaPortraitHtml(who) {
  if (who === '主公') {
    const i = lordArtIndex();
    return `<div class="cinema-face lord" style="background-image:url('assets/story/lord${i}.jpg');background-position:center 16%"></div>
      <div class="cinema-who">主公 · ${LORD_FACES[i - 1]}</div>`;
  }
  if (S.by[who]) {
    return `<div class="cinema-face" style="background-image:url('${pthumb(who)}')"></div>
      <div class="cinema-who">${esc(who)}</div>`;
  }
  return `<div class="cinema-crest">${esc(String(who || '军').slice(0, 1))}</div><div class="cinema-who">${esc(who)}</div>`;
}
function openStoryCinema(id, onFinish) {
  const lv = (S.levels || []).find(l => l.id === id);
  if (!lv || id > (S.progress.unlocked || 1)) { flash('尚未解锁该章节'); return; }
  const first = !(S.story.seen || []).includes(id);
  if (first) {
    S.story.seen.push(id);
    saveMeta();
    grantItems(STORY_REWARD);
    renderStoryScreen();
  }
  const c = buildStoryCinema(lv);
  S.cinema = Object.assign({ id, first, index: 0, typing: false, timer: null, auto: false, autoTimer: null, onFinish: onFinish || null }, c);
  $('#cinemaTitle').textContent = c.title;
  const cbg = $('#cinemaBg');
  cbg.style.backgroundImage = `url('${pthumb(c.boss)}')`;
  cbg.classList.remove('art');
  if (c.art) {
    const artUrl = `assets/story/${c.art}.jpg`;
    const probe = new Image();
    probe.onload = () => {
      if (!S.cinema || S.cinema.id !== id) return;
      cbg.style.backgroundImage = `url('${artUrl}')`;
      void cbg.offsetWidth;
      cbg.classList.add('art');
    };
    probe.src = artUrl;
  }
  (new Image()).src = lordArtUrl();
  $('#cinemaAuto').classList.remove('active');
  $('#cinemaAuto').textContent = '自动';
  $('#storyCinema').hidden = false;
  cinemaShow(0);
}
function cinemaShow(i) {
  const c = S.cinema;
  if (!c) return;
  clearTimeout(c.autoTimer);
  if (i >= c.lines.length) { cinemaFinish(); return; }
  c.index = i;
  const cbg = $('#cinemaBg');
  if (cbg && cbg.classList.contains('art')) {
    const shift = [50, 47, 53][i % 3];
    cbg.style.backgroundPosition = `${shift}% center`;
  }
  const line = c.lines[i];
  $('#cinemaName').textContent = line.who;
  $('#cinemaStep').textContent = `${i + 1} / ${c.lines.length}`;
  $('#cinemaDialogue').classList.toggle('narration', !!line.narration);
  const port = $('#cinemaPortrait');
  if (line.narration) {
    port.classList.remove('hide');
    port.innerHTML = `<div class="cinema-narr"><div class="cn-orn">◆</div>
      <div class="cn-title">${esc(c.title)}</div><div class="cn-sub">${esc(c.act || '章节演出')}</div></div>`;
  } else {
    port.classList.remove('hide');
    port.innerHTML = cinemaPortraitHtml(line.who);
  }
  const full = line.text || '';
  const txt = $('#cinemaText');
  txt.textContent = '';
  c.typing = true;
  let n = 0;
  clearInterval(c.timer);
  c.timer = setInterval(() => {
    n += 1;
    txt.textContent = full.slice(0, n);
    if (n >= full.length) {
      clearInterval(c.timer);
      c.timer = null;
      c.typing = false;
      if (c.auto) {
        c.autoTimer = setTimeout(() => cinemaAdvance(), Math.max(1000, Math.min(2600, full.length * 36)));
      }
    }
  }, 22);
  try { AudioSys.play('click'); } catch (e) { /* ignore */ }
}
function cinemaAdvance() {
  const c = S.cinema;
  if (!c) return;
  if (c.typing) {
    clearInterval(c.timer);
    c.timer = null;
    c.typing = false;
    const line = c.lines[c.index];
    $('#cinemaText').textContent = line ? line.text : '';
    if (c.auto) {
      const len = line ? (line.text || '').length : 0;
      c.autoTimer = setTimeout(() => cinemaAdvance(), Math.max(1000, Math.min(2600, len * 36)));
    }
    return;
  }
  clearTimeout(c.autoTimer);
  cinemaShow(c.index + 1);
}
function cinemaToggleAuto() {
  const c = S.cinema;
  if (!c) return;
  c.auto = !c.auto;
  const b = $('#cinemaAuto');
  if (b) { b.classList.toggle('active', c.auto); b.textContent = c.auto ? '自动中' : '自动'; }
  if (c.auto && !c.typing) {
    const line = c.lines[c.index];
    const len = line ? (line.text || '').length : 0;
    c.autoTimer = setTimeout(() => cinemaAdvance(), Math.max(1000, Math.min(2600, len * 36)));
  } else {
    clearTimeout(c.autoTimer);
  }
}
function cinemaFinish(skipped) {
  const c = S.cinema;
  if (!c) return;
  clearInterval(c.timer);
  clearTimeout(c.autoTimer);
  S.cinema = null;
  $('#storyCinema').hidden = true;
  if (c.first) flash(`首次阅读奖励：${fmtRewards(STORY_REWARD)}`);
  renderStoryScreen();
  if (typeof c.onFinish === 'function') {
    try { c.onFinish(); } catch (e) { /* ignore */ }
  }
}
function bindCinema() {
  const n = $('#cinemaNext');
  if (n) n.onclick = () => cinemaAdvance();
  const sk = $('#cinemaSkip');
  if (sk) sk.onclick = () => cinemaFinish(true);
  const au = $('#cinemaAuto');
  if (au) au.onclick = () => cinemaToggleAuto();
  const dlg = $('#cinemaDialogue');
  if (dlg) dlg.onclick = (e) => { if (e.target.closest('button')) return; cinemaAdvance(); };
  document.addEventListener('keydown', (e) => {
    const el = $('#storyCinema');
    if (!el || el.hidden) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); cinemaAdvance(); }
    else if (e.key === 'Escape') { cinemaFinish(true); }
  });
}

function renderQuestScreen(tab) {
  S.taskTab = tab || S.taskTab || 'main';
  const tabBox = $('#questTabs'), list = $('#questList');
  if (!tabBox || !list) return;
  tabBox.innerHTML = [['main', '主线'], ['daily', '日常'], ['chapter', '章节秘宝']].map(([k, t]) =>
    `<button class="${S.taskTab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('');
  tabBox.querySelectorAll('button').forEach(b => b.onclick = () => renderQuestScreen(b.dataset.tab));
  if (S.taskTab === 'main') {
    list.innerHTML = MAIN_QUESTS.map(q => {
      const done = q.done();
      const claimed = (S.tasks.mainClaimed || []).includes(q.id);
      return `<div class="quest-item${done ? ' done' : ''}">
        <div class="qi-main"><b>${esc(q.title)}</b><span>${esc(q.desc)}</span></div>
        <div class="qi-reward">${esc(fmtRewards(q.reward))}</div>
        <button class="mini${claimed ? ' ghost' : ''}" data-main="${q.id}" ${done && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : done ? '领取' : '未完成'}</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-main]').forEach(b => b.onclick = () => claimMain(b.dataset.main));
  } else if (S.taskTab === 'chapter') {
    renderChapterTab(list);
  } else {
    list.innerHTML = DAILY_TASKS.map(q => {
      const cur = Math.min(q.need, S.tasks.counters[q.key] || 0);
      const done = cur >= q.need;
      const claimed = (S.tasks.dailyClaimed || []).includes(q.id);
      return `<div class="quest-item${done ? ' done' : ''}">
        <div class="qi-main"><b>${esc(q.title)}</b><span>${esc(q.desc)} · ${cur}/${q.need}</span></div>
        <div class="qi-reward">${esc(fmtRewards(q.reward))}</div>
        <button class="mini${claimed ? ' ghost' : ''}" data-daily="${q.id}" ${done && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : done ? '领取' : '未完成'}</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-daily]').forEach(b => b.onclick = () => claimDaily(b.dataset.daily));
  }
}
function claimMain(id) {
  const q = MAIN_QUESTS.find(x => x.id === id);
  if (!q || !q.done() || (S.tasks.mainClaimed || []).includes(id)) return;
  S.tasks.mainClaimed.push(id); saveMeta(); grantItems(q.reward);
  flash(`领取 ${q.title} 奖励`); renderQuestScreen('main');
}
function claimDaily(id) {
  const q = DAILY_TASKS.find(x => x.id === id);
  if (!q || (S.tasks.counters[q.key] || 0) < q.need || (S.tasks.dailyClaimed || []).includes(id)) return;
  S.tasks.dailyClaimed.push(id); saveMeta(); grantItems(q.reward);
  flash(`领取 ${q.title} 奖励`); renderQuestScreen('daily');
}
let TUTORIAL_IDX = 0;
function showTutorial() {
  TUTORIAL_IDX = 0;
  renderTutorial();
  $('#tutorial').hidden = false;
}
function maybeTutorial() {
  if (S.story && S.story.tutorialDone) return;
  showTutorial();
}
function renderTutorial() {
  const st = TUTORIAL_STEPS[TUTORIAL_IDX];
  if (!st) return;
  $('#tutorialTitle').textContent = `新手引导 · ${st.title}`;
  $('#tutorialBody').textContent = st.text;
  $('#tutorialStep').textContent = `${TUTORIAL_IDX + 1} / ${TUTORIAL_STEPS.length}`;
  $('#tutorialNext').textContent = TUTORIAL_IDX === TUTORIAL_STEPS.length - 1 ? '开始游戏' : '下一步';
}
function tutorialNext() {
  TUTORIAL_IDX += 1;
  if (TUTORIAL_IDX >= TUTORIAL_STEPS.length) return finishTutorial();
  renderTutorial();
}
function finishTutorial() {
  S.story.tutorialDone = true; saveMeta();
  $('#tutorial').hidden = true;
}
let PENDING_ENC = false, CURRENT_ENC = null;
function maybeEncounterAfterWin() {
  if (Math.random() >= 0.15) return;
  PENDING_ENC = true;
  const b = $('#encounterBtn');
  if (b) b.hidden = false;
}
function openEncounter() {
  PENDING_ENC = false;
  const b = $('#encounterBtn'); if (b) b.hidden = true;
  CURRENT_ENC = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
  $('#encounterTitle').textContent = `奇遇 · ${CURRENT_ENC.title}`;
  $('#encounterText').textContent = CURRENT_ENC.text;
  $('#encounterChoices').innerHTML = CURRENT_ENC.choices.map((c, i) =>
    `<button class="enc-choice" data-i="${i}">${esc(c.label)}</button>`).join('');
  $('#encounterChoices').querySelectorAll('.enc-choice').forEach(b2 => b2.onclick = () => chooseEncounter(Number(b2.dataset.i)));
  $('#encounterClose').hidden = true;
  $('#encounter').hidden = false;
}
function chooseEncounter(i) {
  if (!CURRENT_ENC) return;
  const c = CURRENT_ENC.choices[i];
  if (!c) return;
  const out = c.risk && Math.random() < c.risk.chance ? c.risk : c;
  grantItems(out.effect);
  taskBump('encounter');
  $('#encounterText').textContent = out.text;
  $('#encounterChoices').innerHTML = '';
  $('#encounterClose').hidden = false;
}
/* 扫荡时自动处理奇遇：优先选无风险、期望收益最高的一项 */
function autoResolveEncounter() {
  if (Math.random() >= 0.15) return null;
  const enc = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
  const value = c => Object.entries(c.effect || {}).reduce((s, [k, v]) => {
    if (k === 'randomSkillBook' || k === 'randomTactic') return s + 1;
    if (k === 'stamina') return s + v * 20;
    return s + v;
  }, 0);
  const safe = enc.choices.filter(c => !c.risk);
  const pick = (safe.length ? safe : enc.choices).slice().sort((a, b) => value(b) - value(a))[0] || enc.choices[0];
  if (!pick) return null;
  grantItems(pick.effect);
  taskBump('encounter');
  return { title: enc.title, choice: pick.label, text: pick.text, effect: pick.effect || {} };
}

/* 扫荡计入章节悬赏：再战次数，以及当前队伍满足的阵营/印记条件 */
function chapterSweepResult(lv, times, team) {
  if (!lv || !times || !S.chapters) return;
  const ch = chapterOfLevel(lv.id);
  const meta = chapterMeta(ch);
  const st = S.chapters.stats[ch] || {};
  st.battles = (st.battles || 0) + times;
  const t = team || S.a || [];
  if (t.filter(n => (S.by[n] || {}).faction === meta.faction).length >= 3) {
    st.factionWins = (st.factionWins || 0) + times;
  }
  if (t.some(n => sigilsOf(n).length)) st.sigilWins = (st.sigilWins || 0) + times;
  S.chapters.stats[ch] = st;
  saveMeta();
}

function travel() {
  if (!S.started) return;
  if (!spendStamina(10)) return;
  openEncounter();
}
function initMetaUI() {
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  bind('questBack', () => showScreen('home'));
  bind('storyBack', () => showScreen('home'));
  bind('closeStory', () => { $('#storyModal').hidden = true; });
  bind('storyModal', () => { });
  bind('tutorialNext', tutorialNext);
  bind('tutorialSkip', finishTutorial);
  bind('encounterBtn', openEncounter);
  bind('encounterClose', () => { $('#encounter').hidden = true; });
  bind('chapterLater', () => { $('#chapterRelic').hidden = true; });
  bind('closeChapterRelic', () => { $('#chapterRelic').hidden = true; });
  const cr = $('#chapterRelic');
  if (cr) cr.onclick = (e) => { if (e.target.id === 'chapterRelic') $('#chapterRelic').hidden = true; };
  bind('questStoryBtn', () => showScreen('story'));
  bind('questGuideBtn', showTutorial);
  const sm = $('#storyModal');
  if (sm) sm.onclick = (e) => { if (e.target.id === 'storyModal') $('#storyModal').hidden = true; };
  bindCinema();
}
