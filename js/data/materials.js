/* materials.js — 材料表。tier = 所属场景编号 */
(function (APOC) {
  'use strict';

  var list = [
    { id: 'scrap_iron',      name: '生锈废铁',  scene: 'sewer',     icon: '🔩', color: '#78716c', tier: 1 },
    { id: 'rotten_cloth',    name: '腐烂布料',  scene: 'sewer',     icon: '🧵', color: '#57534e', tier: 1 },
    { id: 'copper_wire',     name: '铜线圈',    scene: 'subway',    icon: '🪙', color: '#b45309', tier: 2 },
    { id: 'dead_battery',    name: '废旧电池',  scene: 'subway',    icon: '🔋', color: '#65a30d', tier: 2 },
    { id: 'steel_beam',      name: '建筑钢材',  scene: 'street',    icon: '🏗️', color: '#94a3b8', tier: 3 },
    { id: 'hardened_leather',name: '硬化皮革',  scene: 'street',    icon: '🟫', color: '#92400e', tier: 3 },
    { id: 'medical_drug',    name: '医疗药剂',  scene: 'hospital',  icon: '💊', color: '#f87171', tier: 4 },
    { id: 'gauze',           name: '无菌纱布',  scene: 'hospital',  icon: '🩹', color: '#f1f5f9', tier: 4 },
    { id: 'chemical',        name: '化学试剂',  scene: 'school',    icon: '⚗️', color: '#c084fc', tier: 5 },
    { id: 'light_alloy',     name: '轻质合金',  scene: 'school',    icon: '🔗', color: '#a5b4fc', tier: 5 },
    { id: 'electronic',      name: '电子元件',  scene: 'mall',      icon: '🔌', color: '#38bdf8', tier: 6 },
    { id: 'li_cell',         name: '锂电芯',    scene: 'mall',      icon: '🔋', color: '#f472b6', tier: 6 },
    { id: 'gunpowder',       name: '军用火药',  scene: 'base',      icon: '💥', color: '#84cc16', tier: 7 },
    { id: 'titanium',        name: '钛合金板',  scene: 'base',      icon: '🛡️', color: '#64748b', tier: 7 },
    { id: 'mutant_cell',     name: '变异细胞',  scene: 'lab',       icon: '🧬', color: '#2dd4bf', tier: 8 },
    { id: 'serum',           name: '培养血清',  scene: 'lab',       icon: '🧪', color: '#5eead4', tier: 8 },
    { id: 'uranium',         name: '铀矿碎块',  scene: 'wasteland', icon: '☢️', color: '#a3e635', tier: 9 },
    { id: 'energy_core',     name: '能量核心',  scene: 'wasteland', icon: '⚡', color: '#fbbf24', tier: 9 },
    { id: 'abyss_crystal',   name: '深渊结晶',  scene: 'pacific',   icon: '💎', color: '#22d3ee', tier: 10 },
    { id: 'king_core',       name: '王级核心',  scene: 'pacific',   icon: '🔱', color: '#06b6d4', tier: 10 }
  ];

  var byId = {};
  var byScene = {};
  list.forEach(function (m) {
    byId[m.id] = m;
    (byScene[m.scene] = byScene[m.scene] || []).push(m);
  });

  APOC.Data = APOC.Data || {};
  APOC.Data.Materials = byId;
  APOC.Data.MaterialList = list;
  APOC.Data.materialsOfScene = function (sceneId) { return byScene[sceneId] || []; };
})(window.APOC = window.APOC || {});
