/* formulas.js — 全部数值公式（唯一真源，纯函数无副作用） */
(function (APOC) {
  'use strict';

  var C = APOC.Config;

  /* ---------- 缩放律 ---------- */
  function POW(K) { return Math.pow(C.POW_BASE, K - 1); }

  /* ---------- 经验 ---------- */
  function expNeed(level) {
    return Math.round(C.EXP_BASE * Math.pow(level, C.EXP_POW));
  }

  /* ---------- 怪物数值 ----------
     mod：难度表（js/data/difficulty.js）。**缺省走难度表**，割草关显式传 Difficulty.IDENT。
     缺省是"接入"而不是"恒等"，是刻意的：漏传只会让割草关数值离谱（测试立刻炸，响），
     不会像 monHpMul 那次一样静默无效、全绿上线。 */
  function monBase(K, m, mod) {
    var t = C.TIER[m.tier];
    var p = POW(K);
    var d = mod || APOC.Difficulty.forStage(K);
    /* ★ 世界难度乘区（普通 1 / 困难 10 / 噩梦 100 / 地狱 1000，见 core/world.js）。
       放在 mod 之外单独乘：割草关显式传的是 Difficulty.IDENT（它绕开的是**按关**难度表），
       但"世界难度"是另一根轴，割草关同样要受影响。exp/gold/def 不乘 —— 只放大强度。 */
    var w = (APOC.World && APOC.World.monMul) ? APOC.World.monMul() : 1;
    return {
      hp:  Math.round(C.MON_HP  * p * t.hp * m.hpMul * d.hpMul * w),
      atk: C.MON_ATK * p * t.atk * m.atkMul * d.atkMul * w,
      def: C.MON_DEF * Math.pow(p, C.MON_DEF_EXP) * t.def * m.defMul,
      exp: Math.round(C.MON_EXP * Math.pow(p, C.MON_EXP_EXP) * t.exp * m.expMul),
      gold: C.GOLD_BASE * Math.pow(p, C.GOLD_EXP) * t.gold
    };
  }

  /* ---------- 伤害 ----------
     A: {atk, coef, crit, critDmg, dmgUp, pen, penPct, level, dmgMul, trueDamage}
     D: {def, dmgReduce, dodge, isPlayer}                                */
  function hit(A, D) {
    var R = APOC.RNG;

    /* 1. 闪避 */
    if (D.dodge > 0 && R.chance(D.dodge / 100)) {
      return { value: 0, crit: false, dodged: true };
    }

    /* 2. 基础伤害 */
    var dmg = A.atk * A.coef;

    /* 3. 暴击（独立乘区） */
    var isCrit = R.chance(A.crit / 100);
    if (isCrit) dmg *= (A.critDmg / 100);

    /* 4. 增伤（加法池） */
    dmg *= (1 + A.dmgUp / 100);

    /* 5. 减伤（穿透先行） */
    var reduce = 0;
    if (!A.trueDamage) {
      var effDef = Math.max(0, D.def - A.pen);
      effDef *= (1 - A.penPct / 100);
      reduce = effDef / (effDef + C.DEF_K + C.DEF_LV_MUL * A.level);
      reduce = D.isPlayer
        ? Math.max(C.PLAYER_REDUCE_FLOOR, Math.min(reduce, C.MON_REDUCE_CAP))
        : Math.min(reduce, C.MON_REDUCE_CAP);
    }

    /* 6. 最终 */
    var final = dmg * (1 - reduce) * (1 - (D.dmgReduce || 0) / 100);

    /* 7. 独立乘区（白名单） */
    if (A.dmgMul && A.dmgMul !== 1) final *= A.dmgMul;

    return { value: Math.max(C.MIN_DAMAGE, Math.floor(final)), crit: isCrit, dodged: false };
  }

  /* ---------- 金币 / 材料 ---------- */
  function goldPerStage(K, sceneMul, waves) {
    return Math.round(C.GOLD_BASE * Math.pow(POW(K), C.GOLD_EXP) * (sceneMul || 1) * (waves || C.REF_WAVES));
  }
  function goldPerKill(K, sceneMul, tier) {
    var perStage = goldPerStage(K, sceneMul, C.REF_WAVES);
    return (perStage / C.REF_STAGE_KILLS) * C.TIER[tier].gold;
  }

  /* 取关卡所属场景。越界时退到第一张场景表，永不返回 null
     （sceneOfStage 只在 1..MAX_STAGE 有值） */
  function sceneOf(K) {
    return APOC.Data.sceneOfStage(K) || APOC.Data.Scenes[0];
  }

  /* ---------- 每关产出守恒（唯一真源） ----------
     怪物总数随关卡从 20 涨到 70，而金币/经验/掉落都是**按只结算**的。
     这里定义"每关应该产出多少总量"（与怪数无关），killYield 再把它摊到本关的怪身上。
     ★ 拉高怪数时，每只怪的产出会自动等比下降，每关总量不变 —— 这是在线与离线
       能对上账的唯一原因（离线走 offlineRates，也是从这里取总量）。 */
  function stageYield(K) {
    var base = monsterExpOf(K);
    return {
      gold: goldPerStage(K, sceneOf(K).sceneMul, C.REF_WAVES),
      exp:  C.REF_STAGE_KILLS * base,
      matDrops:  C.REF_STAGE_KILLS * C.DROP_PER_KILL,       // 每关材料掉落**次数**
      itemDrops: C.REF_STAGE_KILLS * C.ITEM_DROP_PER_KILL   // 每关装备掉落**次数**（不含精英必掉）
    };
  }

  /* 把每关总量摊到本关的怪身上。
     ★ isArena = true 时走"割草关原口径"，不做归一化 ——
       割草关同屏 150 只，它的经济是另一套（ARENA_DROP_MUL），
       用普通关的归一化会把割草关收益静默砍掉 3.5 倍。 */
  function killYield(K, isArena) {
    if (isArena) {
      return {
        expMul: 1,
        matChance: C.DROP_PER_KILL,
        /* ★ 装备掉率必须吃割草关折扣。
           割草关**不走归一化**（一场 1000+ 杀，它走的是另一套经济），
           所以这里的 itemChance 就是原始概率。2026-09 把 ITEM_DROP_PER_KILL
           从 0.10 提到 0.50 之后，一场直接掉 600 件，背包当场冲爆 ——
           套上和材料同一个 ARENA_DROP_MUL（0.5×0.22 = 0.11），
           一场约 130 件，与调整前的 120 件基本持平。 */
        itemChance: C.ITEM_DROP_PER_KILL * C.ARENA_DROP_MUL,
        goldPerKill: function (tier) {
          return goldPerKill(K, sceneOf(K).sceneMul, tier);
        }
      };
    }
    var c = APOC.Difficulty.compOf(K);
    var y = stageYield(K);
    var n = Math.max(1, c.count);
    return {
      /* 经验：每关总量摊到本关编成上再分到每只怪。
         权重 = normal×1 + elite×6（精英经验是 6 倍），怪数涨则权重同步涨，
         Σ(每只怪经验) 恒等于 stageYield.exp —— 与金币/掉落同一个口径。 */
      expMul: C.REF_STAGE_KILLS / Math.max(1, c.wExp),
      /* 掉落：总量 / 怪数。精英的 ×3 / 必掉作为档位奖励叠在这之上 */
      matChance: y.matDrops / n,
      itemChance: y.itemDrops / n,
      /* 金币：总量按各档金币权重分配，Σ = 每关总量 */
      goldPerKill: function (tier) {
        return y.gold * C.TIER[tier].gold / Math.max(1, c.wGold);
      }
    };
  }
  /* ★ 材料数量必须随关卡缩放，否则后期经济崩盘 */
  function matQty(K) {
    var base = APOC.RNG.int(C.MAT_DROP_BASE[0], C.MAT_DROP_BASE[1]);
    return Math.max(1, Math.round(base * Math.pow(POW(K), C.MAT_DROP_EXP)));
  }

  /* ---------- 装备 ---------- */
  function itemStat(slot, attr, K, quality, scene) {
    var base = C.PROTO_BASE[slot];
    if (base[attr] === undefined) return 0;
    var v = base[attr];
    if (C.POW_SCALED_FIELDS.indexOf(attr) >= 0) {
      var bias = (attr === 'hp') ? (scene ? scene.hp : 1)
               : (attr === 'def') ? (scene ? scene.def : 1)
               : 1;
      v = v * bias * C.QUALITY_MUL[quality] * POW(K);
    } else {
      v = v * C.QUALITY_MUL[quality];
    }
    return v;
  }

  /* ---------- 武器 ---------- */
  /* 射程乘全局倍率：镜头拉近后世界尺度变大，原始射程只够打到脸前 */
  function weaponRange(w) { return w.range * C.WEAPON_RANGE_MUL; }

  function weaponAtk(w, lv) {
    var kref = APOC.Data.WeaponKRef[w.layer] || 1;
    return w.wBase * POW(kref) * (1 + C.WEAPON_LV_MUL * (lv - 1));
  }

  /* 武器综合评分：把伤害公式里与武器有关的因子摊开成一个可比数字
       ≈ 单次伤害 × 攻速 × 等效命中数
     命中数按各自的伤害衰减算等比数列和 —— 不是简单地数"打几个"，
     因为穿透第 3 个目标只吃 0.8²、弹射第 3 跳只吃 0.75²。

     ★ 用途只有一个：给玩家排序、标注"比现在强/弱"。
     它不是真实 DPS（没算暴击、穿透、增伤、减伤，也没算射程带来的输出时间占比），
     所以**不要拿它做自动装备的依据** —— 那正是这次要修掉的东西（见 tech.js）。 */
  function weaponScore(w, lv) {
    if (!w) return 0;
    var hits = 1, n, dec;
    if (w.behavior === 'multi') {
      hits = w.targets || 1;
    } else if (w.behavior === 'pierce') {
      n = w.pierceN || 1; dec = w.decay || 0;
      hits = dec > 0 ? (1 - Math.pow(1 - dec, n)) / dec : n;
    } else if (w.behavior === 'chain') {
      n = w.chainN || 0; dec = w.chainDecay || C.CHAIN_DECAY;
      hits = dec > 0 ? (1 - Math.pow(dec, n + 1)) / (1 - dec) : (1 + n);
    } else if (w.behavior === 'splash') {
      /* 溅射实际覆盖几只取决于怪挤得多紧；按"主目标 + 2 只溅射"估，偏保守 */
      hits = 1 + C.SCORE_HIT_CAP * (w.splashMul || 0);
    }
    /* ★ 命中数必须封顶。
       电磁轨道炮和湮灭射线都写着 `pierceN: 99`（"能穿多少穿多少"），
       不封顶的话 `decay: 0` 的湮灭射线会算出"命中 99 次"，评分冲到第 2 名 ——
       而实测它连第 4 名都不到。封顶值取 5 是实测标定出来的，见 config.SCORE_HIT_CAP。 */
    hits = Math.min(hits, C.SCORE_HIT_CAP);
    return weaponAtk(w, lv) * w.coef * w.aspd * hits;
  }

  /* ---------- 科技树消耗 ---------- */
  /* 用于消耗计算的 K_ref：会被压到当前版本的 MAX_STAGE。
     只有 10 关时，按 POW(95) 定价的材料消耗是收不回来的。 */
  function costRef(layer) {
    var d = APOC.Data.WeaponKRef[layer] || 1;
    return Math.max(1, Math.min(d, C.MAX_STAGE));
  }
  function layerMul(layer) {
    var a = C.LAYER_COST_MUL;
    return a ? (a[layer - 1] || 1) : 1;
  }

  function techCost(node, currentLv) {
    var kref = costRef(node.layer);
    var lm = layerMul(node.layer);
    var matExp = Math.pow(POW(kref), C.TECH_MAT_EXP) * lm;
    if (currentLv === 0) {
      return {
        gold: Math.round(C.TECH_UNLOCK_GOLD * POW(kref) * lm),
        mat: Math.round(C.TECH_UNLOCK_MAT * matExp)
      };
    }
    return {
      gold: Math.round(C.TECH_UP_GOLD * POW(kref) * lm * (0.5 + 0.35 * currentLv)),
      mat: Math.round(C.TECH_UP_MAT * matExp * (0.5 + 0.4 * currentLv))
    };
  }
  /* 每个节点消耗哪种材料。
     ★ 必须从「当前版本**已实现**的场景」里取。
     原来直接取 Scenes[layer-1]，于是第 2~7 层要的是地铁/街区/医院…的材料，
     而这些场景当前版本根本不存在 —— 42 个节点永远显示「材料不足」，玩家以为没掉材料。
     现在按可用场景数映射，场景不够时循环复用，两种材料轮流用。
     当场景补齐到 10 个时，映射会自动铺开，不用改代码。 */
  function techMaterial(node) {
    var pool = APOC.Data.playableScenes();
    if (!pool.length) return null;
    var scene = pool[Math.min(node.layer - 1, pool.length - 1)];
    var mats = APOC.Data.materialsOfScene(scene.id);
    if (!mats.length) return null;
    return mats[(node.layer - 1) % mats.length];
  }

  /* ---------- 战力 ---------- */
  function bp(s) {
    return Math.round(
      s.hp * 0.1 +
      s.atk * 3.0 +
      s.def * 8.0 +
      Math.max(0, s.aspd - C.BASE_ASPD) * 400 +
      s.crit * 25 +
      Math.max(0, s.critDmg - C.BASE_CRITDMG) * 4 +
      s.dodge * 60 +
      s.lifesteal * 80 +
      s.pen * 10
    );
  }

  /* ---------- 离线收益 ----------
     ★ 和在线共用同一份"每关产出总量"（stageYield），只是把"按只结算"换成"按秒结算"。
     这是在线/离线能对上账的原因 —— 以前这里写死 18、在线那边也写死 18 但实际是 20 只，
     两边各自和真实值差 11%，而改怪数会立刻让二者撕裂。 */
  function offlineRates(K) {
    var y = stageYield(K);
    var sec = C.STAGE_REF_SEC;
    return {
      goldPerSec: y.gold / sec,
      expPerSec: y.exp / sec,
      matPerSec: (y.matDrops / sec) * matQty(K) * 0.5
    };
  }
  function monsterExpOf(K) {
    var scene = APOC.Data.sceneOfStage(K);
    var normals = APOC.Data.normalsOfScene(scene ? scene.id : 'sewer');
    if (!normals.length) return 0;
    return monBase(K, normals[0]).exp;
  }

  /* ---------- 数字格式化 ---------- */
  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1e8) return (n / 1e4).toFixed(n < 1e6 ? 1 : 0) + '万';
    return (n / 1e8).toFixed(2) + '亿';
  }

  APOC.Formula = {
    POW: POW,
    expNeed: expNeed,
    monBase: monBase,
    hit: hit,
    goldPerStage: goldPerStage,
    goldPerKill: goldPerKill,
    stageYield: stageYield,
    killYield: killYield,
    matQty: matQty,
    itemStat: itemStat,
    weaponAtk: weaponAtk,
    weaponRange: weaponRange,
    weaponScore: weaponScore,
    techCost: techCost,
    techMaterial: techMaterial,
    bp: bp,
    offlineRates: offlineRates,
    fmt: fmt
  };
})(window.APOC = window.APOC || {});
