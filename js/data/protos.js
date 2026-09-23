/* protos.js — 装备原型表（10 场景 × 5 槽位 = 50 个，按场景表自动生成） */
(function (APOC) {
  'use strict';

  var PROTO_NAMES = {
    sewer:     { helmet: '破布头巾',   armor: '防污布衣',     legs: '破布裤',     boots: '胶靴',       accessory: '鼠牙护符' },
    subway:    { helmet: '工装安全帽', armor: '反光工装',     legs: '耐磨工裤',   boots: '防滑劳保鞋', accessory: '铜线手环' },
    street:    { helmet: '摩托车头盔', armor: '铆钉皮夹克',   legs: '皮革护腿',   boots: '钢头皮靴',   accessory: '拾荒者徽章' },
    hospital:  { helmet: '手术帽',     armor: '隔离衣',       legs: '医用长裤',   boots: '无菌鞋套',   accessory: '听诊器' },
    school:    { helmet: '运动护头',   armor: '校队夹克',     legs: '田径短裤',   boots: '跑鞋',       accessory: '校徽项链' },
    mall:      { helmet: '防暴头盔',   armor: '防刺背心',     legs: '战术长裤',   boots: '战术靴',     accessory: '折扣金卡' },
    base:      { helmet: '战术头盔',   armor: '战术背心',     legs: '战术护腿',   boots: '作战靴',     accessory: '军牌' },
    lab:       { helmet: '防毒面罩',   armor: '生化防护服',   legs: '防护裤',     boots: '密封胶靴',   accessory: '样本容器' },
    wasteland: { helmet: '铅衬头盔',   armor: '辐射屏蔽服',   legs: '加固护腿',   boots: '防尘高帮靴', accessory: '盖革计数器' },
    pacific:   { helmet: '深渊兜帽',   armor: '深海鳞甲',     legs: '鳞片护腿',   boots: '潮汐战靴',   accessory: '王级核心护符' }
  };

  var SLOTS = ['helmet', 'armor', 'legs', 'boots', 'accessory'];
  var ICONS = { helmet: '⛑️', armor: '🦺', legs: '👖', boots: '🥾', accessory: '📿' };

  var protos = {};
  APOC.Data.Scenes.forEach(function (scene) {
    var names = PROTO_NAMES[scene.id] || {};
    SLOTS.forEach(function (slot) {
      var id = slot + '_' + scene.id;
      protos[id] = {
        id: id,
        name: names[slot] || (scene.name + APOC.Config.SLOT_NAMES[slot]),
        slot: slot,
        scene: scene.id,
        icon: ICONS[slot],
        unlockStage: scene.stageFrom
      };
    });
  });

  APOC.Data.Protos = protos;
  APOC.Data.SLOTS = SLOTS;
  APOC.Data.protoId = function (slot, sceneId) { return slot + '_' + sceneId; };
})(window.APOC = window.APOC || {});
