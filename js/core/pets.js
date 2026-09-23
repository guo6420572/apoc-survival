/* pets.js — 宠物系统（吞噬装备 → 属性池 → 加成主角）
 *
 * 设计（2026-09 用户定）：
 *   五阶宠物，复用装备的品质色。阶位决定**吞噬吸收率**，五阶之间差 100 倍：
 *       阶0 0.01% / 阶1 0.05% / 阶2 0.1% / 阶3 0.5% / 阶4 1%
 *   也就是说低阶宠基本是废物，这是**故意的** —— 逼玩家去刷高阶蛋。
 *   吞噬装备 = 把装备属性的一小部分吃进"属性池"，同时涨经验。
 *   等级每级 +5%（**线性**，不是复利 —— 1.05^60 = 18 倍会直接把数值击穿）。
 *   蛋只在割草关掉；新蛋比当前宠高阶就替换，旧宠的属性按**新宠阶位**转移一部分，
 *   比当前宠低阶就折算成经验喂掉，绝不浪费。
 *
 * 宠物**不参战**，纯属性加成（用户定）—— 所以这里没有任何战斗逻辑，
 * 唯一的出口是 stats()，由 stats.js 汇总进主角总属性。
 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, R = APOC.RNG;

  /* 五阶的名称。用"幼生→王级"而不是复用装备的"破损→传说"：
     装备那套说的是"这件东西多新"，说宠物会很出戏。 */
  var TIER_NAME = ['幼生', '变异', '精英', '领主', '王级'];

  function save() { return APOC.State.data; }

  /* 当前宠物（没有就是 null）。一律从存档现读，不缓存 ——
     缓存和存档两处状态是这类系统最容易分叉的地方。 */
  function pet() {
    var d = save();
    return (d && d.pet) || null;
  }

  function has() { return !!pet(); }

  function makePet(tier) {
    return { tier: tier, level: 1, exp: 0, stats: {} };
  }

  /* 升到下一级需要几件装备。递增，让后期升级必须持续刷。 */
  function needExp(level) { return C.PET_EXP_BASE + level; }

  function checkLevel() {
    var p = pet();
    if (!p) return 0;
    var up = 0;
    while (p.level < C.PET_MAX_LEVEL && p.exp >= needExp(p.level)) {
      p.exp -= needExp(p.level);
      p.level++;
      up++;
    }
    if (p.level >= C.PET_MAX_LEVEL) p.exp = 0;
    return up;
  }

  /* 等级倍率。1 级 = ×1，之后每级 +5% 线性。
     满级 60 → 1 + 0.05×59 = 3.95 ≈ +300%，与强化上限对齐。 */
  function levelMul() {
    var p = pet();
    if (!p) return 1;
    return 1 + C.PET_PER_LV * (p.level - 1);
  }

  /* ★ 宠物对主角的实际加成。stats.js 唯一要调的就是这个。 */
  function stats() {
    var p = pet();
    if (!p) return {};
    var m = levelMul(), out = {};
    Object.keys(p.stats || {}).forEach(function (k) {
      out[k] = p.stats[k] * m;
    });
    return out;
  }

  /* 吞噬一件装备：按当前宠物的阶位吸收它的一部分属性，涨 1 点经验，并返还一半金币。
     ★ 吸收的是 effStats（含强化倍率）—— 强化过的装备喂宠物更划算，
     这是给"强化错装备"留的一条退路，不是 bug。
     ★ 吸收率叠一个**品质加成**（白 1×、橙 3×），和分解的金币公式同一套系数：
     两条路都是"好东西更值"，玩家才真的要在"换钱"和"喂宠"之间做选择。 */
  function devour(item) {
    var p = pet();
    if (!p || !item) return false;
    var st = APOC.Inventory.effStats(item);
    var rate = (C.PET_ABSORB[p.tier] || 0) *
               (1 + (item.quality || 0) * C.PET_QUALITY_BONUS);
    Object.keys(st).forEach(function (k) {
      p.stats[k] = (p.stats[k] || 0) + st[k] * rate;
    });
    p.exp += 1;
    checkLevel();

    /* ★ 返还金币（用户定：给分解的一半）。
       不给钱的话"吞噬"是纯亏（分解能拿钱+材料，吞噬只有宠物属性），
       玩家永远只会分解，一键吞噬就是个摆设。 */
    var g = Math.round(APOC.Inventory.decompValue(item).gold * C.PET_DEVOUR_GOLD);
    if (g > 0) APOC.Inventory.addGold(g);

    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('pet:change');
    return true;
  }

  /* 开一颗蛋。tier 由调用方按场景品质权重 roll（见 grantEgg）。
     三种结果：
       new     —— 之前没宠物，直接得到
       upgrade —— 比当前宠高阶：替换，旧宠属性按**新宠阶位**转移一部分
       fed     —— 不如当前宠：折算成经验喂掉（不浪费，也不给玩家"要不要吃"的选择负担） */
  function openEgg(tier) {
    var p = pet();
    tier = Math.max(0, Math.min(C.PET_ABSORB.length - 1, tier));

    if (!p) {
      save().pet = makePet(tier);
      APOC.Stats.markDirty();
      APOC.State.markDirty();
      APOC.Bus.emit('pet:change');
      return { action: 'new', tier: tier };
    }

    if (tier > p.tier) {
      var old = p;
      var np = makePet(tier);
      /* 等级是否继承可配（PET_KEEP_LEVEL）。默认继承 ——
         不继承的话"换高阶宠"可能当场变弱（等级倍率归 1，而转移的池子只有 10~50%），
         玩家会觉得自己被惩罚了。 */
      if (C.PET_KEEP_LEVEL) { np.level = old.level; np.exp = old.exp; }
      var inherit = C.PET_INHERIT[tier] || 0;
      Object.keys(old.stats || {}).forEach(function (k) {
        np.stats[k] = (np.stats[k] || 0) + old.stats[k] * inherit;
      });
      save().pet = np;
      APOC.Stats.markDirty();
      APOC.State.markDirty();
      APOC.Bus.emit('pet:change');
      return { action: 'upgrade', tier: tier, from: old.tier, inherit: inherit, keptLevel: !!C.PET_KEEP_LEVEL };
    }

    p.exp += C.PET_EGG_FEED;
    checkLevel();
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('pet:change');
    return { action: 'fed', tier: tier, exp: C.PET_EGG_FEED };
  }

  /* 割草关通关掉蛋。阶位按当前场景的品质权重 roll ——
     推进到后面的场景，蛋的质量也跟着涨，和装备是同一套梯度。 */
  function grantEgg(stageK) {
    var scene = APOC.Data.sceneOfStage(stageK);
    var w = scene ? C.QUALITY_WEIGHT[Math.min(scene.qualityTier, C.QUALITY_WEIGHT.length - 1)]
                  : C.QUALITY_WEIGHT[0];
    var r = R.next() * 100, acc = 0, tier = 0;
    for (var i = 0; i < w.length; i++) {
      acc += w[i];
      if (r < acc) { tier = i; break; }
    }
    return openEgg(tier);
  }

  /* 面板要用的展示信息。没宠物返回 null。 */
  function info() {
    var p = pet();
    if (!p) return null;
    return {
      tier: p.tier,
      tierName: TIER_NAME[p.tier] || '未知',
      level: p.level,
      maxLevel: C.PET_MAX_LEVEL,
      exp: p.exp,
      need: needExp(p.level),
      mul: levelMul(),
      absorb: (C.PET_ABSORB[p.tier] || 0) * 100,     // 显示成百分数
      inherit: (C.PET_INHERIT[p.tier] || 0) * 100,
      pool: p.stats || {}
    };
  }

  APOC.Pets = {
    TIER_NAME: TIER_NAME,
    /* 造一只新宠物。state.js 的 defaultSave / migrate 要用它来发开局宠物 ——
       那两处**不能手写字面量**，否则宠物的形状一旦变了就会两处走散。 */
    makePet: makePet,
    has: has,
    get: pet,
    stats: stats,
    levelMul: levelMul,
    needExp: needExp,
    devour: devour,
    openEgg: openEgg,
    grantEgg: grantEgg,
    info: info
  };
})(window.APOC = window.APOC || {});
