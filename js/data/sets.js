/* sets.js — 套装表。**每个场景一套，每套 5 件**（头/甲/腿/靴/饰）。
   schema: SETS[sceneId] = {
     id, name, scene, tier, icon, desc,
     b2: [效果], b3: [效果], b5: [效果]      // 件数阈值 2 / 3 / 5
   }
   效果 = { stat, val } —— stat 走 Stats 的同一个 add() 管线（加法池 / 百分比池 / special 池）。

   ★ 不往物品实例上加字段：套装归属由 protoId 反推
     （protos.js 里 protoId = `槽位_场景id`，所以 `armor_sewer` 天然属于下水道套）。
     老存档里的装备没有 setId，反推一样能得到 —— 不需要存档迁移。

   ★ 强度随 tier 递增（后期套装更强），满套（5 件）给**专属机制**。
     机制全部复用已有 special（combat.js 里都实现好了），不新增战斗代码。
     ⚠ killHeal / killBomb 只在割草关生效（combat.js 里被 Arena.isActive() 圈着），
       所以**不能**拿来当套装机制 —— 普通关会毫无效果。
   ★ 5 件套的量级：约等于同关数一件橙装的 2~3 倍，是这套系统的长线追求。 */
(function (APOC) {
  'use strict';

  /* 加成随 tier 放大的系数：tier 0 → 1.0，tier 4 → 1.6。
     不这么放的话，后期的套装会因为"词条/装备本体随 POW 指数增长"而被稀释成鸡肋。 */
  var TIER_MUL = [1.0, 1.15, 1.3, 1.45, 1.6];

  function scale(base, tier) {
    return Math.round(base * (TIER_MUL[tier] || 1) * 10) / 10;
  }

  var DEFS = [
    { id: 'sewer', scene: 'sewer', name: '鼠鼠之心', icon: '🐭', tier: 0,
      sig: { stat: 'shield', base: 6, text: '周期性护盾' } },

    { id: 'subway', scene: 'subway', name: '隧道游魂', icon: '👻', tier: 0,
      sig: { stat: 'thorns', base: 22, text: '受击反弹伤害' } },

    { id: 'street', scene: 'street', name: '街头法则', icon: '🗡️', tier: 1,
      sig: { stat: 'bleed', base: 12, text: '攻击附带流血' } },

    { id: 'hospital', scene: 'hospital', name: '白色瘟疫', icon: '☣️', tier: 1,
      sig: { stat: 'burn', base: 22, text: '攻击附带燃烧' } },

    { id: 'school', scene: 'school', name: '课间操', icon: '📏', tier: 2,
      sig: { stat: 'barrage', base: 13, text: '概率攻击次数翻倍' } },

    { id: 'mall', scene: 'mall', name: '橱窗猎手', icon: '🛍️', tier: 2,
      sig: { stat: 'doubleShot', base: 11, text: '概率额外一轮攻击' } },

    { id: 'base', scene: 'base', name: '军械库', icon: '🎖️', tier: 3,
      sig: { stat: 'shockwave', base: 70, text: '周期范围震荡波' } },

    { id: 'lab', scene: 'lab', name: '培养皿', icon: '🧫', tier: 3,
      sig: { stat: 'domain', base: 32, text: '周围持续伤害领域' } },

    { id: 'wasteland', scene: 'wasteland', name: '废土领主', icon: '☢️', tier: 4,
      sig: { stat: 'singularity', base: 120, text: '周期奇点吸引重创' } },

    { id: 'pacific', scene: 'pacific', name: '深海回声', icon: '🌊', tier: 4,
      sig: { stat: 'annihilate', base: 130, text: '周期全屏贯穿射线' } }
  ];

  var SETS = {}, BY_SCENE = {};
  DEFS.forEach(function (d) {
    var t = d.tier;
    var set = {
      id: d.id, scene: d.scene, name: d.name, icon: d.icon, tier: t,
      desc: d.sig.text,
      /* 2 件：生存 */
      b2: [ { stat: 'hpPct', val: scale(18, t) },
            { stat: 'defPct', val: scale(12, t) } ],
      /* 3 件：输出 */
      b3: [ { stat: 'atkPct', val: scale(15, t) },
            { stat: 'aspdPct', val: scale(12, t) } ],
      /* 5 件：全属性 + 专属机制 */
      b5: [ { stat: 'allPct', val: scale(10, t) },
            { stat: d.sig.stat, val: scale(d.sig.base, t) } ]
    };
    SETS[d.id] = set;
    BY_SCENE[d.scene] = set;
  });

  APOC.Data.Sets = SETS;
  APOC.Data.SetByScene = BY_SCENE;

  /* 套装总件数（阈值 2/3/5 的分母） */
  APOC.Data.SET_PIECES = 5;

  /* 从装备实例反查它属于哪一套。设计上**不看物品字段**，只认 protoId 里的场景 ——
     这样老存档的装备不用迁移也能算进套装。 */
  APOC.Data.setOfItem = function (item) {
    if (!item || !item.protoId) return null;
    var proto = APOC.Data.Protos[item.protoId];
    if (!proto || !proto.scene) return null;
    return BY_SCENE[proto.scene] || null;
  };

  /* 按件数取应当生效的效果列表（2 件时只有 b2，3 件时 b2+b3，5 件时全给） */
  APOC.Data.setEffectsAt = function (set, n) {
    if (!set) return [];
    var out = [];
    if (n >= 2) out = out.concat(set.b2);
    if (n >= 3) out = out.concat(set.b3);
    if (n >= 5) out = out.concat(set.b5);
    return out;
  };
})(window.APOC = window.APOC || {});
