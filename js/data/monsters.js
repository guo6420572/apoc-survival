/* monsters.js — 怪物表（10 场景，每场景 5 小怪 + 1 精英 + 1 Boss；太平洋多 1 个 Boss）
   系数是「相对 tier 基准」的倍率，基准值见 Config.MON_*
   behavior: melee | ranged | charger | tank                                       */
(function (APOC) {
  'use strict';

  var M = {};

  function def(id, name, scene, tier, hp, atk, def_, exp, spd, range, interval, size, color, emoji, behavior, extra) {
    M[id] = {
      id: id, name: name, scene: scene, tier: tier,
      hpMul: hp, atkMul: atk, defMul: def_, expMul: exp,
      spd: spd, range: range, atkInterval: interval, size: size,
      color: color, emoji: emoji, behavior: behavior,
      isRanged: behavior === 'ranged'
    };
    if (extra) for (var k in extra) M[id][k] = extra[k];
  }

  /* ---------------- 1 下水道 ---------------- */
  def('rat',        '变异鼠',   'sewer','normal', 1.0,1.0,1.0,1.0, 68, 42,1.1,14,'#6b7280','🐀','melee');
  def('roach',      '巨型蟑螂', 'sewer','normal', 0.7,1.1,0.7,0.9, 92, 40,0.9,12,'#78350f','🪳','charger');
  def('slime',      '污水史莱姆','sewer','normal',1.6,0.8,1.4,1.1, 42, 44,1.4,18,'#365314','🟢','tank');
  /* ★ 下水道是玩家的第一个场景，原来**一只远程怪都没有** ——
     前 10 关完全体验不到"站在远处打你"的威胁。
     把腐肉蛞蝓改成远程吐酸：蛞蝓本来就是喷酸的设定，不用新增美术。 */
  def('slug',       '腐肉蛞蝓', 'sewer','normal', 1.3,1.0,1.0,1.0, 34, 150,2.0,16,'#4d7c0f','🐛','ranged');
  def('bat',        '洞穴蝠',   'sewer','normal', 0.8,1.3,0.6,1.1,105, 38,0.8,11,'#57534e','🦇','charger');
  def('rat_alpha',  '鼠群头目', 'sewer','elite',  1.5,1.0,1.0,1.0, 55, 48,1.0,24,'#9ca3af','👹','elite');
  def('rat_king',   '鼠王',     'sewer','boss',  1.0,1.0,1.0,1.0,44,120,1.6,46,'#a3a3a3','👑','boss',
      { phaseSkill:'summon', phaseText:'召唤鼠群' });

  /* ---------------- 2 地铁隧道 ---------------- */
  def('infected',   '隧道感染者','subway','normal',1.0,1.0,1.0,1.0, 58, 44,1.2,16,'#78716c','🧟','melee');
  def('crawler',    '隧道爬行者','subway','normal',0.9,1.1,1.1,1.0, 74, 40,1.0,15,'#57534e','🕷️','melee');
  def('hound',      '地铁猎犬', 'subway','normal', 1.1,1.3,0.8,1.2, 96, 40,1.1,15,'#44403c','🐕','charger');
  def('spitter',    '吐酸者',   'subway','normal', 0.8,1.4,0.7,1.2, 46,240,1.8,16,'#65a30d','🤢','ranged');
  def('drifter',    '游荡重尸', 'subway','normal', 1.8,0.8,1.6,1.1, 34, 46,1.6,20,'#6b7280','🧟‍♂️','tank');
  def('tunnel_brute','隧道重尸','subway','elite',  1.6,1.1,1.0,1.0, 40, 52,1.4,27,'#52525b','💀','elite');
  def('tunnel_lord','隧道之主', 'subway','boss',  1.1,1.0,1.0,1.0,38, 90,1.8,48,'#3f3f46','👑','boss',
      { phaseSkill:'slam', phaseText:'范围冲击' });

  /* ---------------- 3 废弃街区 ---------------- */
  def('looter',     '拾荒暴徒', 'street','normal', 1.0,1.1,1.0,1.1, 62, 44,1.2,16,'#92400e','🔪','melee');
  def('rioter',     '暴走者',   'street','normal', 1.1,1.2,0.9,1.1, 70, 44,1.0,17,'#b45309','🪓','melee');
  def('stray_dog',  '野狗群',   'street','normal', 0.9,1.3,0.7,1.1,110, 40,0.9,14,'#78350f','🐕‍🦺','charger');
  def('roof_ghoul', '天台狙击尸','street','normal',0.7,1.7,0.6,1.3, 40,420,2.4,15,'#7c2d12','🎯','ranged');
  def('crusher',    '砸车巨汉', 'street','normal', 2.0,0.9,1.7,1.2, 36, 50,1.5,22,'#a16207','🦍','tank');
  def('gang_boss',  '帮派头目', 'street','elite',  1.4,1.2,0.9,1.0, 50, 50,1.1,26,'#d97706','💪','elite');
  def('berserker_chief','暴走者首领','street','boss',0.9,1.15,0.9,1.0,56,80,1.2,47,'#ea580c','👑','boss',
      { phaseSkill:'enrage', phaseText:'狂暴' });

  /* ---------------- 4 医院 ---------------- */
  def('nurse',      '护士感染者','hospital','normal',1.0,1.0,1.0,1.1, 60, 44,1.2,16,'#e5e7eb','👩‍⚕️','melee');
  def('patient',    '变异病人', 'hospital','normal', 1.2,0.9,1.1,1.0, 48, 44,1.4,17,'#cbd5e1','🛏️','melee');
  def('wheelchair', '轮椅冲撞者','hospital','normal',0.8,1.4,0.8,1.2,118, 42,1.2,16,'#94a3b8','♿','charger');
  def('spore',      '孢子散布者','hospital','normal',0.7,1.3,0.6,1.3, 44,220,2.0,15,'#86efac','🍄','ranged');
  def('surgeon',    '手术狂',   'hospital','normal', 1.5,1.1,1.3,1.2, 52, 46,1.2,18,'#f1f5f9','🔬','tank');
  def('head_nurse', '护士长',   'hospital','elite',  1.4,1.0,1.0,1.0, 48, 60,1.3,25,'#f8fafc','💉','elite');
  def('mad_surgeon','手术狂医生','hospital','boss', 1.0,1.0,1.0,1.0,42,160,1.5,46,'#dc2626','👑','boss',
      { phaseSkill:'heal', phaseText:'自我治疗' });

  /* ---------------- 5 中学 ---------------- */
  def('student',    '学生感染者','school','normal', 1.0,1.0,0.9,1.0, 66, 42,1.1,15,'#a5b4fc','🎒','melee');
  def('athlete',    '田径变异生','school','normal', 1.0,1.3,0.8,1.2,124, 40,0.9,16,'#818cf8','🏃','charger');
  def('chemist',    '化学课代表','school','normal', 0.8,1.5,0.7,1.3, 46,260,2.1,15,'#c084fc','⚗️','ranged');
  def('janitor',    '清洁工尸', 'school','normal',  1.7,0.9,1.5,1.1, 38, 48,1.5,19,'#64748b','🧹','tank');
  def('lab_sample', '逃逸样本', 'school','normal',  1.1,1.2,1.0,1.2, 80, 46,1.0,17,'#a78bfa','🧫','melee');
  def('bully',      '体育生暴君','school','elite',  1.5,1.1,1.0,1.0, 58, 52,1.0,27,'#6366f1','🏋️','elite');
  def('principal',  '变异校长', 'school','boss',   1.1,1.0,1.0,1.0,40,140,1.7,46,'#4338ca','👑','boss',
      { phaseSkill:'summon', phaseText:'召唤学生' });

  /* ---------------- 6 商业中心 ---------------- */
  def('guard',      '商场保安', 'mall','normal', 1.2,1.1,1.2,1.1, 56, 46,1.2,17,'#1e3a8a','🛡️','melee');
  def('shopper',    '血拼者',   'mall','normal', 0.9,1.1,0.9,1.0, 64, 44,1.1,16,'#be185d','🛍️','melee');
  def('elevator_lurker','电梯井潜伏者','mall','normal',1.0,1.5,0.8,1.3,88,44,1.3,17,'#4c1d95','🕳️','charger');
  def('mannequin',  '假人模特', 'mall','normal', 1.8,1.0,1.6,1.2, 44, 48,1.5,18,'#e7e5e4','🧍','tank');
  def('escalator_swarm','扶梯尸群','mall','normal',0.9,1.2,0.9,1.2,70,240,2.2,15,'#f472b6','🐝','ranged');
  def('security_chief','安保主管','mall','elite', 1.5,1.0,1.2,1.0, 52, 56,1.1,26,'#1e40af','🎖️','elite');
  def('billboard_beast','巨幕吞噬者','mall','boss',1.0,1.05,1.0,1.0,36,300,2.6,50,'#db2777','👑','boss',
      { phaseSkill:'beam', phaseText:'贯穿射线' });

  /* ---------------- 7 军事基地 ---------------- */
  def('soldier',    '士兵感染者','base','normal', 1.1,1.2,1.3,1.2, 58, 48,1.2,17,'#3f6212','🪖','melee');
  def('armor_dog',  '装甲犬',   'base','normal', 1.0,1.4,1.2,1.3,108, 42,0.9,15,'#525252','🐺','charger');
  def('drone',      '失控无人机','base','normal', 0.8,1.6,0.7,1.4, 92,300,1.6,14,'#0891b2','🛸','ranged');
  /* ★ spd 从 0 改成 34。原来是 0：出怪线距玩家 789px，而它的射程只有 340，
     玩家又**不会横移**（combat.js 每帧把 p.x 钉回 PLAYER_X0）—— 于是它既走不动
     也永远打不到人；而 updateWaveFlow 要求场上清空才推进下一波，
     结果是**整关永久卡死**（短射程 build 尤其严重）。
     同理见下面的 tentacle。改法：给一个慢速让它自己走进射程。
     基准表跑之前必须修，否则那些关只会返回 timeout。 */
  def('turret',     '自动炮塔', 'base','normal', 2.2,1.5,1.8,1.5, 34,340,1.2,20,'#64748b','🔫','tank');
  def('mech_grunt', '机甲步兵', 'base','normal', 1.6,1.2,1.6,1.3, 46, 50,1.4,21,'#334155','🤖','tank');
  def('captain',    '铁血上尉', 'base','elite',  1.6,1.1,1.1,1.0, 54,200,1.2,26,'#4d7c0f','🎖️','elite');
  def('iron_colonel','钢铁上校', 'base','boss',  1.1,1.0,1.1,1.0,40,320,1.4,48,'#65a30d','👑','boss',
      { phaseSkill:'barrage', phaseText:'扇形弹幕' });

  /* ---------------- 8 生化实验室 ---------------- */
  def('subject_alpha','实验体 α','lab','normal', 1.2,1.3,1.1,1.3, 66, 46,1.1,18,'#14b8a6','🧬','melee');
  def('subject_beta','实验体 β', 'lab','normal', 0.9,1.5,0.8,1.3,104, 42,0.9,16,'#0d9488','🦎','charger');
  def('researcher', '研究员',   'lab','normal', 0.8,1.6,0.7,1.4, 48,280,2.0,15,'#5eead4','🥼','ranged');
  def('symbiote',   '共生体',   'lab','normal', 2.0,1.1,1.7,1.4, 40, 52,1.5,22,'#115e59','🦠','tank');
  def('husk',       '空壳',     'lab','normal', 1.0,1.2,1.0,1.2, 62, 46,1.2,17,'#0f766e','💀','melee');
  def('subject_gamma','实验体 γ','lab','elite', 1.5,1.2,1.0,1.0, 60, 60,1.0,28,'#2dd4bf','🧪','elite');
  def('perfect_subject','完美实验体','lab','boss',1.1,1.05,1.05,1.0,52,180,1.3,49,'#06b6d4','👑','boss',
      { phaseSkill:'regen', phaseText:'高速再生' });

  /* ---------------- 9 辐射荒漠 ---------------- */
  def('ghoul',      '辐射尸',   'wasteland','normal', 1.1,1.2,1.0,1.2, 60, 46,1.2,17,'#a3e635','☢️','melee');
  def('sand_worm',  '沙虫',     'wasteland','normal', 1.8,1.4,1.3,1.5, 42, 56,1.6,24,'#ca8a04','🪱','tank');
  def('raider',     '废土暴徒', 'wasteland','normal', 1.0,1.5,0.9,1.3, 76, 44,1.0,17,'#b45309','🔫','melee');
  def('rad_hound',  '辐射犬',   'wasteland','normal', 0.9,1.6,0.8,1.4,120, 42,0.9,16,'#84cc16','🐕','charger');
  def('scorcher',   '灼烧者',   'wasteland','normal', 1.0,1.7,1.0,1.5, 54,260,2.0,18,'#f97316','🔥','ranged');
  def('warlord',    '废土军阀', 'wasteland','elite',  1.5,1.1,1.0,1.0, 52, 70,1.2,28,'#facc15','🎖️','elite');
  def('wasteland_lord','荒漠领主','wasteland','boss', 1.0,1.1,1.0,1.0,44,240,1.8,50,'#eab308','👑','boss',
      { phaseSkill:'quake', phaseText:'地震' });

  /* ---------------- 10 太平洋 ---------------- */
  def('drowned',    '深海尸',   'pacific','normal', 1.2,1.2,1.1,1.2, 56, 46,1.2,18,'#0e7490','🧟','melee');
  def('leviathan_spawn','利维坦幼体','pacific','normal',1.6,1.3,1.4,1.4,48,54,1.4,23,'#155e75','🐋','tank');
  def('abyss_crawler','深渊爬行者','pacific','normal',1.0,1.5,0.9,1.3,96,44,1.0,17,'#1e3a8a','🦑','charger');
  /* ★ 同 turret：spd 0 + 射程 200 < 789px 会让这一关永久卡死。改成 44。 */
  def('tentacle',   '触须',     'pacific','normal', 1.4,1.4,1.2,1.4, 44,200,1.6,20,'#164e63','🐙','ranged');
  def('wraith',     '深幽魂',   'pacific','normal', 0.9,1.8,0.8,1.5, 84,220,1.8,16,'#0891b2','👻','ranged');
  def('deep_priest','深渊祭司', 'pacific','elite',  1.4,1.2,1.0,1.0, 46,260,1.5,28,'#22d3ee','🎖️','elite');
  def('zombie_king','僵尸王',   'pacific','boss',  1.05,1.05,1.0,1.0,52,200,1.4,52,'#059669','👑','boss',
      { phaseSkill:'army', phaseText:'召唤尸潮' });
  def('godzilla_mutant','变异哥斯拉','pacific','boss',1.6,1.2,1.2,1.5,40,380,2.2,68,'#0f766e','🦖','boss',
      { phaseSkill:'atomic', phaseText:'原子吐息' });

  /* 场景 → 怪物索引 */
  var byScene = {}, normalsByScene = {}, eliteOfScene = {}, bossOfScene = {};
  Object.keys(M).forEach(function (id) {
    var m = M[id];
    (byScene[m.scene] = byScene[m.scene] || []).push(m);
    if (m.tier === 'normal') (normalsByScene[m.scene] = normalsByScene[m.scene] || []).push(m);
    if (m.tier === 'elite')  eliteOfScene[m.scene] = m;
    if (m.tier === 'boss')   bossOfScene[m.scene] = m;   // 同场景多 Boss 时保留最后一个
  });

  /* 太平洋有僵尸王 + 哥斯拉两个 Boss，单独指定关卡 → Boss 映射 */
  var BOSS_BY_STAGE = {
    10: 'rat_king',
    20: 'tunnel_lord', 30: 'berserker_chief', 40: 'mad_surgeon',
    50: 'principal',   60: 'billboard_beast', 70: 'iron_colonel',
    80: 'perfect_subject', 90: 'wasteland_lord',
    95: 'zombie_king', 100: 'godzilla_mutant'
  };

  APOC.Data.Monsters = M;
  APOC.Data.monstersOfScene = function (s) { return byScene[s] || []; };
  APOC.Data.normalsOfScene = function (s) { return normalsByScene[s] || []; };
  APOC.Data.eliteOfScene = function (s) { return eliteOfScene[s] || null; };
  APOC.Data.bossOfStage = function (K) {
    return BOSS_BY_STAGE[K] ? M[BOSS_BY_STAGE[K]] : null;
  };
  APOC.Data.isArenaStage = function (K) {
    return K % 10 === 0 || K === 95;
  };
  APOC.Data.isEliteStage = function (K) {
    return K % 5 === 0 && K % 10 !== 0;
  };
})(window.APOC = window.APOC || {});
