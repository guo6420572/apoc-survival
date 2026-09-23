/* stats.js — 属性聚合。加法池 → 百分比池 → 上限夹紧（见 03 第三节） */
(function (APOC) {
  'use strict';

  var C = APOC.Config;
  var cache = null;

  var PCT_KEYS = ['atkPct', 'hpPct', 'defPct', 'aspdPct', 'spdPct'];
  var SPECIAL_KEYS = [
    'bloodRage', 'thorns', 'bleed', 'shockwave', 'undying', 'doubleShot', 'barrage',
    'chain', 'freeze', 'burn', 'shield', 'dotUp', 'annihilate', 'domain', 'singularity',
    'growing', 'trueDamage', 'immortal', 'overkill', 'multiTarget', 'splash',
    'killHeal', 'killBomb', 'thornsPct'
  ];

  function blankFlat() {
    return {
      hp: 0, atk: 0, def: 0, aspd: 0, crit: 0, critDmg: 0, dodge: 0, lifesteal: 0,
      pen: 0, penPct: 0, dmgUp: 0, dmgReduce: 0, spd: 0, eliteDmg: 0,
      hpRegenPct: 0, goldPct: 0, expPct: 0, rangePct: 0
    };
  }
  function blankPct() { return { atkPct: 0, hpPct: 0, defPct: 0, aspdPct: 0, spdPct: 0 }; }
  function blankSpecial() {
    var o = { dmgMul: 1 };
    SPECIAL_KEYS.forEach(function (k) { o[k] = 0; });
    return o;
  }

  /* 把一个 stat 值路由到正确的池子 */
  function add(flat, pct, sp, stat, val) {
    if (!val) return;
    if (stat === 'allPct') { pct.atkPct += val; pct.hpPct += val; pct.defPct += val; return; }
    if (stat === 'dmgMul') { sp.dmgMul *= val; return; }
    if (PCT_KEYS.indexOf(stat) >= 0) { pct[stat] += val; return; }
    if (SPECIAL_KEYS.indexOf(stat) >= 0) { sp[stat] += val; return; }
    if (flat[stat] !== undefined) { flat[stat] += val; }
  }

  function compute() {
    var D = APOC.State.data;
    var flat = blankFlat(), pct = blankPct(), sp = blankSpecial();
    var p = D.player;

    /* 1. 基础 + 等级成长 */
    flat.hp   += C.BASE_HP   + (p.level - 1) * C.HP_PER_LEVEL;
    flat.atk  += C.BASE_ATK  + (p.level - 1) * C.ATK_PER_LEVEL;
    flat.def  += C.BASE_DEF  + (p.level - 1) * C.DEF_PER_LEVEL;
    flat.aspd += C.BASE_ASPD;
    flat.crit += C.BASE_CRIT;
    flat.critDmg += C.BASE_CRITDMG;
    flat.spd  += C.BASE_SPD;

    /* 2. 加点 */
    Object.keys(C.ALLOC).forEach(function (k) {
      var n = p.alloc[k] || 0;
      if (!n) return;
      var eff = C.ALLOC[k];
      Object.keys(eff).forEach(function (stat) {
        if (stat === 'label' || stat === 'desc') return;
        add(flat, pct, sp, stat, eff[stat] * n);
      });
    });

    /* 3. 装备（武器单独走第 5 步） + 套装加成
       ★ 套装和词条并列，是装备层的第二个来源。件数按 setId 统计，阈值 2/3/5。
       归属由 protoId 反推（见 sets.js），物品实例上**不加字段**，老存档天然兼容。 */
    var setCount = {};
    Object.keys(D.equipped).forEach(function (slot) {
      if (slot === 'weapon') return;
      var item = APOC.Inventory.equippedItem(slot);
      if (!item) return;
      /* ★ 走 effStats（已含强化倍率），不要直接读 item.stats */
      var est = APOC.Inventory.effStats(item);
      Object.keys(est).forEach(function (stat) {
        add(flat, pct, sp, stat, est[stat]);
      });
      (item.affixes || []).forEach(function (af) {
        var def = APOC.Data.AffixById[af.id];
        if (def) add(flat, pct, sp, def.stat, af.value);
      });
      var set = APOC.Data.setOfItem(item);
      if (set) setCount[set.id] = (setCount[set.id] || 0) + 1;
    });
    Object.keys(setCount).forEach(function (sid) {
      var set = APOC.Data.Sets[sid];
      APOC.Data.setEffectsAt(set, setCount[sid]).forEach(function (e) {
        add(flat, pct, sp, e.stat, e.val);
      });
    });

    /* 4. 科技树被动（★ 只有当前武器那条线的生效）
       ★ 这里以前写的是「与装备的武器无关，全部生效」—— 结果是三条线的被动
       全部叠加，最优解永远是"体术点满拿生存 + 随便拿把枪输出"，没有取舍、
       没有 build、也没有换武器的理由。现在改成同线才生效：
       **换武器 = 换流派**。
       代价是点在别线的材料会暂时用不上，所以配套提供了 Tech.reset()（100% 返还），
       面板上也会把非当前线的节点标成「未生效」。 */
    var activeLine = currentLine();
    Object.keys(D.tech).forEach(function (nodeId) {
      var lv = D.tech[nodeId];
      if (!lv) return;
      var node = APOC.Data.TechById[nodeId];
      if (!node) return;
      if (activeLine && node.line !== activeLine) return;   // 异线被动挂起
      /* 主节点（武器）除了换武器，每级还加射程 ——
         玩家反馈"射程太近"，而射程本来就该是科技树的成长维度之一 */
      if (node.type === 'main') {
        flat.rangePct += C.TECH_RANGE_PER_LV * lv;
        return;
      }
      if (!node.effects) return;
      node.effects.forEach(function (e) { add(flat, pct, sp, e.stat, e.per * lv); });
    });

    /* 5. 武器 */
    var w = APOC.Tech.currentWeapon();
    if (w) {
      var wlv = APOC.Tech.nodeLevel(w.id) || 1;
      flat.atk += APOC.Formula.weaponAtk(w, wlv);
      if (w.bonus) Object.keys(w.bonus).forEach(function (k) { add(flat, pct, sp, k, w.bonus[k]); });
    }

    /* 5.5 宠物（纯属性加成，不参战）
       宠物是一个属性池：吞噬装备按阶位吸收一小部分，再加等级加成。
       走 APOC.Pets.stats() 而不是直接读存档 —— 阶位倍率和等级倍率都在那边算，
       这里只负责把它加进总表。没有宠物时返回空对象，零开销。 */
    if (APOC.Pets) {
      var petSt = APOC.Pets.stats();
      Object.keys(petSt).forEach(function (k) { add(flat, pct, sp, k, petSt[k]); });
    }

    /* 6. 割草关词条 + 基础溅射（仅 Arena 会话内生效） */
    if (APOC.Arena && APOC.Arena.isActive()) {
      APOC.Arena.collectPerkStats().forEach(function (e) {
        add(flat, pct, sp, e.stat, e.value);
      });
      /* 基础溅射：没有它的话单体武器在割草关只能一个个点，毫无清屏感 */
      sp.splash = Math.max(sp.splash, C.ARENA_BASE_SPLASH);
    }

    /* ---- 合并 ---- */
    var out = {
      hp:  Math.max(1, flat.hp  * (1 + pct.hpPct  / 100)),
      atk: Math.max(1, flat.atk * (1 + pct.atkPct / 100)),
      def: Math.max(0, flat.def * (1 + pct.defPct / 100)),
      aspd: flat.aspd * (1 + pct.aspdPct / 100),
      spd:  flat.spd  * (1 + pct.spdPct  / 100),
      crit: flat.crit, critDmg: flat.critDmg, dodge: flat.dodge,
      lifesteal: flat.lifesteal, pen: flat.pen, penPct: flat.penPct,
      dmgUp: flat.dmgUp, dmgReduce: flat.dmgReduce, eliteDmg: flat.eliteDmg,
      hpRegenPct: flat.hpRegenPct, goldPct: flat.goldPct, expPct: flat.expPct,
      rangePct: flat.rangePct,
      special: sp,
      level: D.player.level
    };

    /* ---- 上限夹紧 ---- */
    out.aspd      = Math.min(out.aspd, C.CAP.aspd);
    out.crit      = Math.min(out.crit, C.CAP.crit);
    out.dodge     = Math.min(out.dodge, C.CAP.dodge);
    out.lifesteal = Math.min(out.lifesteal, C.CAP.lifesteal);
    out.penPct    = Math.min(out.penPct, C.CAP.penPct);
    out.dmgUp     = Math.min(out.dmgUp, C.CAP.dmgUp);
    out.dmgReduce = Math.min(out.dmgReduce, C.CAP.dmgReduce);

    out.bp = APOC.Formula.bp(out);
    return out;
  }

  /* 当前流派 = 当前武器所属的线。没武器时退回一套通用配比。 */
  function currentLine() {
    var w = APOC.Tech.currentWeapon();
    return (w && w.line) || null;
  }

  APOC.Stats = {
    currentLine: currentLine,

    /* 该流派的自动加点配比 */
    ratioFor: function (line) {
      var t = C.ALLOC_RATIO_BY_LINE[line || currentLine()];
      return t || C.ALLOC_RATIO_DEFAULT;
    },

    markDirty: function () { cache = null; },

    final: function () {
      if (!cache) cache = compute();
      return cache;
    },

    /* 自动加点：按当前流派的配比花光剩余点数。
       挂机游戏里玩家不会一直盯着加点，不自动花等于白练，所以默认开启。

       ★ 老版本这里有两个 bug：
       ① `total` 只累加 str/vit/per 三项，**`agi` 永远不会被自动加点写入**
          （p.alloc.agi 恒为 0，敏捷只能靠玩家手动加）；
       ② 余数无脑塞给 `per`，不管比例长什么样。
       现在改成遍历配比的全部键、余数给权重最大的那一项。 */
    autoAllocate: function () {
      var p = APOC.State.data.player;
      var n = p.freePoints;
      if (!n) return 0;
      var r = APOC.Stats.ratioFor();
      var keys = Object.keys(r);
      var total = 0, i;
      for (i = 0; i < keys.length; i++) total += r[keys[i]];
      if (!(total > 0)) return 0;

      /* 先把权重最大的那个挑出来 —— 向下取整产生的余数全部给它，
         这样"主属性"永远拿得最多，不会出现余数把副属性顶上去的怪事 */
      var top = keys[0];
      for (i = 1; i < keys.length; i++) if (r[keys[i]] > r[top]) top = keys[i];

      var given = 0;
      for (i = 0; i < keys.length; i++) {
        if (keys[i] === top) continue;               // 主属性留到最后单独算
        var alloc = Math.floor(n * r[keys[i]] / total);
        p.alloc[keys[i]] += alloc;
        given += alloc;
      }
      p.alloc[top] += n - given;                     // 余数归主属性
      p.freePoints = 0;
      APOC.Stats.markDirty();
      APOC.State.markDirty();
      return n;
    },

    /* 攻击瞬间用：叠加血怒（依赖当前血量比例） */
    damageStats: function (hpRatio) {
      var s = APOC.Stats.final();
      var br = s.special.bloodRage;
      if (!br) return s;
      var layers = Math.floor((1 - hpRatio) / 0.1);
      var bonus = Math.min(layers * br, 18);
      if (bonus <= 0) return s;
      var copy = {};
      for (var k in s) copy[k] = s[k];
      copy.atk = s.atk * (1 + bonus / 100);
      copy.bp = s.bp;
      return copy;
    }
  };
})(window.APOC = window.APOC || {});
