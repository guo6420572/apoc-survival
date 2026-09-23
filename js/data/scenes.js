/* scenes.js — 场景表。当前版本只有下水道（K1-10），加场景时在 SCENE_DEFS 里追加并把
   Config.MAX_STAGE 改大即可，其余代码不用动。 */
(function (APOC) {
  'use strict';

  /* 场景倾向（也供 protos.js 使用）：hp/def 是乘在 PROTO_BASE 上的偏向系数，
     extra 是不乘 POW 的固定加成，qualityTier 决定掉落的品质权重档位（0-4） */
  /* ★ 场景难度旋钮已移走：见 js/data/difficulty.js（按**关**而不是按场景，
     且由 tools/tune_diff.js 实测标定）。本文件只保留"场景倾向"——装备偏向
     hp/def、掉落品质档 qualityTier、金币 sceneMul，这些都不作用于怪物。 */
  var SCENE_DEFS = [
    {
      id: 'sewer', name: '下水道',
      stageFrom: 1, stageTo: 10,
      sceneMul: 1.00, qualityTier: 0,
      hp: 1.00, def: 1.00, extra: {},
      materials: ['scrap_iron', 'rotten_cloth'],
      bgTop: '#1a2420', bgBottom: '#0d1410', ground: '#2a3a30', accent: '#4a7c59',
      prop: 'pipe',
      desc: '潮湿阴暗的城市排水系统，变异鼠群的巢穴。'
    },
    {
      id: 'subway', name: '地铁隧道',
      stageFrom: 11, stageTo: 20,
      sceneMul: 1.06, qualityTier: 0,
      hp: 1.15, def: 0.85, extra: {},
      materials: ['copper_wire', 'dead_battery'],
      bgTop: '#16161c', bgBottom: '#0a0a0e', ground: '#26262e', accent: '#6b7280',
      prop: 'pillar',
      desc: '废弃的地铁隧道，回声里混着不该有的呼吸声。'
    },
    {
      id: 'street', name: '废弃街区',
      stageFrom: 21, stageTo: 30,
      sceneMul: 1.12, qualityTier: 1,
      hp: 0.85, def: 1.25, extra: {},
      materials: ['steel_beam', 'hardened_leather'],
      bgTop: '#2a2118', bgBottom: '#14100c', ground: '#3a3026', accent: '#a16207',
      prop: 'wreck',
      desc: '烧毁的商铺与翻倒的汽车，活人比死人更危险。'
    },
    {
      id: 'hospital', name: '医院',
      stageFrom: 31, stageTo: 40,
      sceneMul: 1.18, qualityTier: 1,
      hp: 1.00, def: 1.00, extra: { hpRegenPct: 0.5 },
      materials: ['medical_drug', 'gauze'],
      bgTop: '#1e2628', bgBottom: '#0f1416', ground: '#2e3a3d', accent: '#7dd3fc',
      prop: 'bed',
      desc: '停电的走廊，手术室的门从里面被反锁过。'
    },
    {
      id: 'school', name: '中学',
      stageFrom: 41, stageTo: 50,
      sceneMul: 1.24, qualityTier: 2,
      hp: 0.90, def: 0.90, extra: { aspd: 3 },
      materials: ['chemical', 'light_alloy'],
      bgTop: '#232030', bgBottom: '#121018', ground: '#332f45', accent: '#c084fc',
      prop: 'locker',
      desc: '走廊墙上还贴着月考排名，名字后面画满了叉。'
    },
    {
      id: 'mall', name: '商业中心',
      stageFrom: 51, stageTo: 60,
      sceneMul: 1.30, qualityTier: 2,
      hp: 0.85, def: 0.90, extra: { crit: 4 },
      materials: ['electronic', 'li_cell'],
      bgTop: '#2b1f2a', bgBottom: '#150f15', ground: '#3d2c3b', accent: '#f472b6',
      prop: 'signboard',
      desc: '中庭的巨幕还在循环播放促销广告。'
    },
    {
      id: 'base', name: '军事基地',
      stageFrom: 61, stageTo: 70,
      sceneMul: 1.36, qualityTier: 3,
      hp: 1.00, def: 1.30, extra: { pen: 5 },
      materials: ['gunpowder', 'titanium'],
      bgTop: '#1c2419', bgBottom: '#0e1209', ground: '#2b3626', accent: '#84cc16',
      prop: 'turret',
      desc: '戒备森严的营区，自动炮塔仍在执行早已失效的命令。'
    },
    {
      id: 'lab', name: '生化实验室',
      stageFrom: 71, stageTo: 80,
      sceneMul: 1.42, qualityTier: 3,
      hp: 0.90, def: 1.00, extra: { lifesteal: 3 },
      materials: ['mutant_cell', 'serum'],
      bgTop: '#16262b', bgBottom: '#0a1416', ground: '#22403f', accent: '#2dd4bf',
      prop: 'tube',
      desc: '培养舱大多碎了，但编号 07 的那一个还是满的。'
    },
    {
      id: 'wasteland', name: '辐射荒漠',
      stageFrom: 81, stageTo: 90,
      sceneMul: 1.48, qualityTier: 4,
      hp: 1.30, def: 0.75, extra: {},
      materials: ['uranium', 'energy_core'],
      bgTop: '#2e2416', bgBottom: '#17120a', ground: '#483a24', accent: '#fbbf24',
      prop: 'cactus',
      desc: '地平线尽头浮着一层灰绿色的雾。'
    },
    {
      id: 'pacific', name: '太平洋',
      stageFrom: 91, stageTo: 100,
      sceneMul: 1.60, qualityTier: 4,
      hp: 1.15, def: 1.15, extra: { dmgUp: 5 },
      materials: ['abyss_crystal', 'king_core'],
      bgTop: '#0f1c2e', bgBottom: '#050a12', ground: '#1a2c44', accent: '#38bdf8',
      prop: 'wave',
      desc: '海平面下浮着比岛还大的轮廓。'
    }
  ];

  var byId = {}, byStage = {};
  SCENE_DEFS.forEach(function (s) {
    byId[s.id] = s;
    for (var k = s.stageFrom; k <= s.stageTo; k++) byStage[k] = s;
  });

  APOC.Data = APOC.Data || {};
  APOC.Data.Scenes = SCENE_DEFS;
  APOC.Data.SceneById = byId;
  APOC.Data.sceneOfStage = function (K) { return byStage[K] || null; };
  /* 当前版本可用场景（受 MAX_STAGE 限制） */
  APOC.Data.playableScenes = function () {
    var max = APOC.Config.MAX_STAGE;
    return SCENE_DEFS.filter(function (s) { return s.stageFrom <= max; });
  };
})(window.APOC = window.APOC || {});
