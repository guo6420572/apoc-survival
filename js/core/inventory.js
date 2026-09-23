/* inventory.js — 背包 / 装备 / 掉落生成 / 分解 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula, R = APOC.RNG;
  var uidSeq = 0;
  /* 装备槽位（不含武器，武器走科技树）。多处用到，定义在文件顶部避免先用后定义 */
  var SLOT_LIST = ['helmet', 'armor', 'legs', 'boots', 'accessory'];

  function nextUid() {
    uidSeq++;
    return 'it_' + Date.now().toString(36) + '_' + uidSeq;
  }

  /* 按场景档位 roll 品质 */
  function rollQuality(scene) {
    var w = C.QUALITY_WEIGHT[Math.min(scene.qualityTier, C.QUALITY_WEIGHT.length - 1)];
    var r = R.next() * 100, acc = 0;
    for (var i = 0; i < w.length; i++) {
      acc += w[i];
      if (r < acc) return i;
    }
    return 0;
  }

  /* 生成一件装备实例：属性在掉落时算好并存储 */
  function makeItem(protoId, level, quality) {
    var proto = APOC.Data.Protos[protoId];
    if (!proto) return null;
    var scene = APOC.Data.SceneById[proto.scene];
    var stats = {};

    /* ★ 每件装备 roll 一个统一倍率，作用于它的全部基础属性。
       这是"刷装备有意义"的根本 —— 在这之前，同一 protoId+等级+品质的装备
       属性完全一样，刷一百件和刷一件没有区别。
       倍率**烘焙进 stats**（而不是存起来每次现算）：这样下游的属性汇总、
       评分、tooltip 全都不用改，而且老存档里的装备天然是"roll=1"的旧值。 */
    var roll = C.ITEM_ROLL_MIN + R.next() * (C.ITEM_ROLL_MAX - C.ITEM_ROLL_MIN);
    roll = Math.round(roll * 1000) / 1000;
    Object.keys(C.PROTO_BASE[proto.slot]).forEach(function (attr) {
      var v = F.itemStat(proto.slot, attr, level, quality, scene) * roll;
      if (v) stats[attr] = Math.round(v * 10) / 10;
    });
    /* 场景附加属性（固定值，不乘 POW） */
    if (scene && scene.extra) {
      Object.keys(scene.extra).forEach(function (k) { stats[k] = (stats[k] || 0) + scene.extra[k]; });
    }

    /* 词条数量由品质决定 */
    var nAffix = [0, 1, 2, 3, 4][quality] || 0;
    var affixes = [];
    if (nAffix > 0) {
      /* ★ 池子按品质过滤：词条带 minQuality 的只有蓝装以上才滚得出来。
         这是"品质"除了"数字大一点"之外的第二层意义 ——
         紫装不只属性高，还能带机制（反伤/连发/燃烧/冻结…）。
         白装（quality 0）词条数为 0，压根走不到这里。 */
      var pool = APOC.Data.Affixes.filter(function (a) {
        return (a.minQuality || 0) <= quality;
      });
      var used = {};
      for (var i = 0; i < nAffix && pool.length; i++) {
        var pick = R.weighted(pool, 'weight');
        if (used[pick.id]) { i--; pool.splice(pool.indexOf(pick), 1); continue; }
        used[pick.id] = true;
        var val = R.int(pick.min, pick.max);
        if (pick.max <= 2) val = Math.round((pick.min + R.next() * (pick.max - pick.min)) * 10) / 10;
        affixes.push({ id: pick.id, value: val });
        pool.splice(pool.indexOf(pick), 1);
      }
    }

    return {
      uid: nextUid(),
      protoId: protoId,
      level: level,
      quality: quality,
      /* roll 只用于显示（"品质 118%"）。属性值已经乘进去了，不用再乘一次 */
      roll: roll,
      enh: 0,               // 强化等级。老存档没这个字段 → (item.enh || 0) 兜底成 0
      stats: stats,
      affixes: affixes
    };
  }

  /* ---------------- 强化 ----------------
     属性 ×(1 + 0.15 × 等级)。★ 强化倍率**不能烘焙进 stats** ——
     它会被玩家随时改变，烘焙进去就要在每次强化时重算并改写所有属性，
     一旦算错（比如连点两次）就永久跑偏。改成读的时候现乘，只有一个出口。 */
  function enhLevel(item) { return (item && item.enh) || 0; }
  function enhMul(item) { return 1 + C.ENH_PER_LV * enhLevel(item); }

  /* ★ 装备的**实际生效属性**。所有要"用"这件装备属性的地方都必须走这里：
     属性汇总（stats.js）、评分（scoreItem）、tooltip、宠物吞噬。
     漏掉任何一处都会出问题 —— 最典型的是评分没乘，于是"一键换装"
     会把刚强化到 +150% 的装备换成一件没强化的，玩家直接骂街。 */
  function effStats(item) {
    if (!item) return {};
    var m = enhMul(item);
    if (m === 1) return item.stats || {};
    var out = {};
    Object.keys(item.stats || {}).forEach(function (k) {
      out[k] = item.stats[k] * m;
    });
    return out;
  }

  /* 升到下一级要花多少。第 1 级 = 基础值，之后每级 ×ENH_COST_STEP。
     消耗「该装备来源场景的材料」—— 和分解同一种，玩家不用记两套资源。 */
  function enhanceCost(item) {
    var lv = enhLevel(item);
    if (lv >= C.ENH_MAX) return null;
    var step = Math.pow(C.ENH_COST_STEP, lv);
    var qMul = 1 + (item.quality || 0) * 0.5;
    var proto = APOC.Data.Protos[item.protoId];
    var scene = proto ? APOC.Data.SceneById[proto.scene] : null;
    return {
      next: lv + 1,
      gold: Math.round(C.ENH_GOLD_BASE * item.level * qMul * step),
      mat: Math.max(1, Math.round(C.ENH_MAT_BASE * qMul * step)),
      matId: scene && scene.materials ? scene.materials[0] : null
    };
  }

  /* 这次强化的成功率：100% → 90% → 80% … 线性递减，到 ENH_RATE_MIN 就不再降。
     ★ 原来是"每级减半"（100/50/25/12.5…），到第 6 级只剩 3% ——
     实测连点十几次都不成功，玩家的第一反应是"按钮坏了"，而不是"我运气差"。 */
  function enhanceRate(item) {
    var lv = enhLevel(item);
    if (lv >= C.ENH_MAX) return 0;
    return Math.max(C.ENH_RATE_MIN, 1 - C.ENH_RATE_STEP * lv);
  }

  /* 强化一次。返回 { ok, level, consumed } —— 失败**只扣材料，等级不掉**。
     不返回布尔值是因为 UI 要区分"材料不够"和"强化失败"两种失败，
     它们给玩家的提示完全不一样。 */
  function enhance(item) {
    var cost = enhanceCost(item);
    if (!cost) return { ok: false, reason: 'max' };
    if (APOC.State.data.player.gold < cost.gold) return { ok: false, reason: 'gold', cost: cost };
    if (cost.matId && countMaterial(cost.matId) < cost.mat) {
      return { ok: false, reason: 'mat', cost: cost };
    }
    /* ★ 先扣钱再判定成败：失败也是要花钱的，否则"几率减半"形同虚设
       （玩家可以无限点，总有一次成功而成本不变）。 */
    spendGold(cost.gold);
    if (cost.matId) spendMaterial(cost.matId, cost.mat);
    /* ★ 记账：把实际花掉的金币和材料挂在装备上，分解时**无损退还**（见 sell）。
       记的是"实际花掉的"而不是"当前等级倒推出来的"—— 失败的那些次同样扣了钱，
       按等级倒推会把它们吞掉，玩家会觉得被坑。老存档没有这两个字段，
       下面 sell 里按 0 处理，等价于"当年没强化过"，不会算错。 */
    item.enhGold = (item.enhGold || 0) + cost.gold;
    item.enhMat = (item.enhMat || 0) + cost.mat;

    var success = R.next() < enhanceRate(item);
    if (success) item.enh = enhLevel(item) + 1;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    return {
      ok: success, reason: success ? 'ok' : 'fail',
      level: enhLevel(item), cost: cost
    };
  }

  /* 连点 N 次强化，返回汇总（成功几次、花了多少、为什么停）。
     ★ 逐次调用 enhance()，**不要**按期望值批量算 ——
     每级的成本和成功率都在变（×1.5 / 减半），批量算一套很容易和单次口径漂移，
     玩家会发现"单点和连点结果对不上"。这里只做循环 + 记账。
     停止条件（按优先级）：满级 / 金币不够 / 材料不够。 */
  function enhanceBatch(item, n) {
    var out = { tries: 0, ups: 0, gold: 0, mat: 0, matId: null, reason: 'ok',
                level: enhLevel(item) };
    for (var i = 0; i < n; i++) {
      if (enhLevel(item) >= C.ENH_MAX) { out.reason = 'max'; break; }
      var r = enhance(item);
      if (r.reason === 'gold' || r.reason === 'mat') { out.reason = r.reason; break; }
      out.tries++;
      out.gold += r.cost.gold;
      out.mat += r.cost.mat;
      out.matId = r.cost.matId;
      if (r.ok) out.ups++;
    }
    out.level = enhLevel(item);
    return out;
  }

  /* 按关卡掉落一件 */
  function rollDrop(stageK, isBossDrop, minQuality) {
    var scene = APOC.Data.sceneOfStage(stageK);
    if (!scene) return null;
    var quality = rollQuality(scene);
    if (isBossDrop) quality = Math.max(quality, 3);
    /* 保底品质：宝箱怪保底紫、游荡 Boss 保底橙 */
    if (minQuality !== undefined && minQuality !== null) quality = Math.max(quality, minQuality);
    var slot = R.pick(APOC.Data.SLOTS);
    var protoId = APOC.Data.protoId(slot, scene.id);
    var spread = C.ITEM_LV_SPREAD;
    var level = Math.max(1, Math.min(C.MAX_LEVEL, R.int(stageK - spread, stageK + spread)));
    return makeItem(protoId, level, quality);
  }

  function itemName(item) {
    var proto = APOC.Data.Protos[item.protoId];
    return proto ? proto.name : '未知装备';
  }
  function itemIcon(item) {
    var proto = APOC.Data.Protos[item.protoId];
    return proto ? proto.icon : '❓';
  }
  function itemSlot(item) {
    var proto = APOC.Data.Protos[item.protoId];
    return proto ? proto.slot : null;
  }

  function countMaterial(id) {
    return APOC.State.data.player.materials[id] || 0;
  }
  function addMaterial(id, n) {
    var mats = APOC.State.data.player.materials;
    mats[id] = (mats[id] || 0) + n;
    APOC.State.markDirty();
    APOC.Bus.emit('drop', { type: 'material', id: id, count: n });
  }
  function spendMaterial(id, n) {
    if (countMaterial(id) < n) return false;
    APOC.State.data.player.materials[id] -= n;
    APOC.State.markDirty();
    return true;
  }

  function addGold(n) {
    var p = APOC.State.data.player;
    p.gold += n;
    APOC.State.data.stats.totalGoldEarned += n;
    APOC.State.markDirty();
  }
  function spendGold(n) {
    var p = APOC.State.data.player;
    if (p.gold < n) return false;
    p.gold -= n;
    APOC.State.markDirty();
    return true;
  }

  /* 加装备进背包，按规则处理满仓与自动分解 */
  function addItem(item) {
    if (!item) return 'none';
    var D = APOC.State.data;
    /* ★ 白装自动分解也要给套装件让路：
       凑套装看的是"槽位对不对"，白装也可能是缺的最后一件。
       只保护**当前场景**的套装件（玩家正在推进的那一套），
       否则十个场景的白套件会把 80 格的背包塞满。 */
    var isCurSet = false;
    var set = APOC.Data.setOfItem(item);
    if (set) {
      var curScene = APOC.Data.sceneOfStage(D.progress.maxStage);
      isCurSet = !!(curScene && curScene.id === set.scene);
    }
    if (item.quality === 0 && D.settings.autoSellWhite && !isCurSet) {
      sell(item, true);
      return 'sold';
    }
    if (D.bag.length >= D.bagSize) {
      var idx = lowestIndex();
      if (idx >= 0) {
        var worst = D.bag[idx];
        if (item.quality > worst.quality || (item.quality === worst.quality && item.level > worst.level)) {
          sell(worst, true);
          D.bag.splice(idx, 1);
          D.bag.push(item);
          APOC.Bus.emit('toast', { type: 'warn', text: '背包已满，自动分解了「' + itemName(worst) + '」' });
        } else {
          sell(item, true);
          return 'sold';
        }
      }
    } else {
      D.bag.push(item);
    }
    APOC.State.markDirty();
    /* 掉到好东西才有音效，白绿装不响（否则一直叮叮当当） */
    if (item.quality >= 3) {
      APOC.Audio.play(item.quality >= 4 ? 'drop_epic' : 'drop_rare', { gap: 0.2 });
    }
    APOC.Bus.emit('drop', { type: 'item', item: item });
    APOC.Bus.emit('bag:change');
    return 'added';
  }

  /* 已装备的装备也在背包数组里，任何「自动分解/批量分解」都必须跳过它们 */
  function isEquipped(item) {
    var eq = APOC.State.data.equipped;
    for (var slot in eq) {
      if (slot !== 'weapon' && eq[slot] === item.uid) return true;
    }
    return false;
  }

  function lowestIndex() {
    var bag = APOC.State.data.bag, best = -1, score = Infinity;
    for (var i = 0; i < bag.length; i++) {
      if (isEquipped(bag[i])) continue;
      var s = bag[i].quality * 1000 + bag[i].level;
      if (s < score) { score = s; best = i; }
    }
    return best;
  }

  /* 这件装备的来源场景材料（分解产出 / 强化消耗都用它，玩家不用记两套资源） */
  function matIdOf(item) {
    var proto = item && APOC.Data.Protos[item.protoId];
    var scene = proto ? APOC.Data.SceneById[proto.scene] : null;
    return (scene && scene.materials) ? scene.materials[0] : null;
  }

  /* ★ 分解收益的**唯一算法**。抽出来是因为吞噬要按它算"返还一半金币"——
     两处各写一遍公式的话，改一个忘一个，玩家会发现"吞噬返还的钱和分解对不上"。 */
  function decompValue(item) {
    if (!item) return { gold: 0, matId: null, matN: 0, refund: 0 };
    var base = Math.floor(C.DECOMP_GOLD_BASE * Math.pow(item.level, 1.3) *
                         (1 + item.quality * 0.5));
    /* ★ 强化投入**无损退还**（用户定）：当初花在它身上的金币原样退回。
       不退的话玩家不敢强化 —— 强化本来就有失败率，强错一件就全亏，
       那最理性的玩法就是永远不强化，这个系统等于白做。 */
    var refund = item.enhGold || 0;
    return {
      gold: base + refund,
      base: base,
      refund: refund,
      matId: matIdOf(item),
      matN: (1 + item.quality) + (item.enhMat || 0)
    };
  }

  /* 分解一件装备，返回收益 */
  function sell(item, silent) {
    if (!item) return null;
    var v = decompValue(item);
    addGold(v.gold);
    if (v.matId) addMaterial(v.matId, v.matN);
    if (!silent) {
      APOC.Bus.emit('toast', {
        type: 'info',
        text: '分解「' + itemName(item) + '」+ ' + F.fmt(v.gold) + ' 金币' +
              (v.refund ? '（含强化退还 ' + F.fmt(v.refund) + '）' : '')
      });
    }
    APOC.State.markDirty();
    return { gold: v.gold, matId: v.matId, matN: v.matN };
  }

  function equippedItem(slot) {
    if (slot === 'weapon') return null;
    var uid = APOC.State.data.equipped[slot];
    if (!uid) return null;
    var bag = APOC.State.data.bag;
    for (var i = 0; i < bag.length; i++) if (bag[i].uid === uid) return bag[i];
    return null;
  }

  function equip(item) {
    var slot = itemSlot(item);
    if (!slot) return false;
    var D = APOC.State.data;
    D.equipped[slot] = item.uid;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('equip:change');
    APOC.Bus.emit('bag:change');
    APOC.Bus.emit('toast', { type: 'success', text: '装备了「' + itemName(item) + '」' });
    return true;
  }

  function unequip(slot) {
    if (slot === 'weapon') return false;
    APOC.State.data.equipped[slot] = null;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('equip:change');
    APOC.Bus.emit('bag:change');
    return true;
  }

  function removeFromBag(uid) {
    var bag = APOC.State.data.bag;
    for (var i = 0; i < bag.length; i++) {
      if (bag[i].uid === uid) { bag.splice(i, 1); return true; }
    }
    return false;
  }

  /* 一键分解：按品质勾选 */
  function sellByQuality(qualities) {
    var D = APOC.State.data;
    var kept = [], gold = 0, cnt = 0, skipped = 0;
    D.bag.forEach(function (it) {
      if (qualities.indexOf(it.quality) < 0 || isEquipped(it)) { kept.push(it); return; }
      /* 强化过的跳过并计数。这里是玩家显式点的，所以不硬拦，
         但要**明确告诉他有几件被跳过** —— 静默跳过会让玩家以为"分解没生效"。 */
      if (enhLevel(it) > 0) { kept.push(it); skipped++; return; }
      var r = sell(it, true);
      gold += r.gold; cnt++;
    });
    D.bag = kept;
    APOC.State.markDirty();
    APOC.Bus.emit('bag:change');
    var tail = skipped ? '（跳过 ' + skipped + ' 件已强化）' : '';
    if (cnt) {
      APOC.Bus.emit('toast', { type: 'success',
        text: '分解 ' + cnt + ' 件装备，获得 ' + F.fmt(gold) + ' 金币' + tail });
    } else {
      APOC.Bus.emit('toast', {
        type: 'warn',
        text: skipped ? ('没有可分解的装备' + tail) : '没有可分解的装备'
      });
    }
  }

  /* ---------------- 装备评分 ----------------
     用途：一键换装（挑分高的穿）、一键分解（卖掉比身上差的）。
     权重是"每 1 点属性值多少分"，按各属性对战斗的实际影响粗略定。 */
  var STAT_W = {
    atk: 3.0, hp: 0.35, def: 5.0, crit: 22, aspd: 26, dodge: 20,
    lifesteal: 30, pen: 6, penPct: 12, dmgUp: 12, dmgReduce: 14,
    hpRegenPct: 40, goldPct: 0.25, expPct: 0.25, eliteDmg: 4,
    atkPct: 12, hpPct: 4, defPct: 4, aspdPct: 20, spdPct: 2, allPct: 22
  };

  /* ★★ 套装件保护 —— 这是套装系统最容易埋雷的地方。
     一键换装只看单件评分，会把"为了凑套装而穿的弱件"换成更强的散件，
     套装当场散架；一键分解更狠，会把凑不齐的套装件直接卖掉。
     玩家辛苦攒的套装就这么无声无息地没了，而且**不会有任何提示**。

     处理分两层：
       ① 评分加权 —— 套装件按"它现在能参与凑到第几档"加成计分，
          让一键换装不会为了几十点单件评分拆散套装；
       ② 硬保护 —— 只要这件装备属于某个套装、且玩家身上已经有同套的件，
          就永不自动分解（留一件也一样，因为那可能是玩家在攒的）。 */
  /* 这件装备是不是"该被保护、不能自动分解"的套装件。

     ★ 判据是"换上去到底有没有用"，不是"是不是套装"。
       一开始写的是"身上有同套件就不许卖"，结果一件**明显更差的白装套件**
       也会被永久保护，背包很快被垃圾塞满（冒烟测试当场就抓到了这条）。
       现在改成精确判据：把这件换进它自己的槽位，整套评分会不会变高 ——
       会变高说明它是在攒的下一件，留着；不会变高说明它连凑数都凑不上，照常分解。 */
  function isProtectedSetPiece(item) {
    var set = APOC.Data.setOfItem(item);
    if (!set) return false;
    var slot = itemSlot(item);
    if (!slot) return false;
    var pick = {};
    var any = false;
    SLOT_LIST.forEach(function (sl) {
      pick[sl] = equippedItem(sl);
      if (pick[sl]) any = true;
    });
    if (!any) return true;             // 一件都没穿：任何套件都值得留
    var cur = loadoutScore(pick);
    pick[slot] = item;
    return loadoutScore(pick) > cur + 1e-6;
  }

  function scoreItem(item) {
    if (!item) return 0;
    var v = 0;
    /* ★ 走 effStats 而不是 item.stats —— 必须把强化倍率算进去。
       漏了这一步的后果很具体：一键换装会把玩家刚强化到 +150% 的装备，
       换成一件属性数字更大但没强化的垃圾，而且玩家完全看不出为什么。 */
    var st = effStats(item);
    Object.keys(st).forEach(function (k) {
      v += (st[k] || 0) * (STAT_W[k] || 1);
    });
    (item.affixes || []).forEach(function (af) {
      var d = APOC.Data.AffixById[af.id];
      if (d) v += (af.value || 0) * (STAT_W[d.stat] || 1);
    });
    return Math.round(v * 100) / 100;
  }

  /* 一整套的总评分：单件评分之和 + 已激活的套装加成折算分。
     ★ 一键换装**不能逐件贪心** —— 那样它只看得到单件强弱，
     会毫不犹豫地把"为了凑套装而穿的弱件"换成更强的散件，套装当场散架。
     必须按整套择优，才看得见"再穿一件就凑齐 3 件套"这种收益。 */

  function loadoutScore(pick) {
    var v = 0, cnt = {};
    SLOT_LIST.forEach(function (slot) {
      var it = pick[slot];
      if (!it) return;
      v += scoreItem(it);
      var set = APOC.Data.setOfItem(it);
      if (set) cnt[set.id] = (cnt[set.id] || 0) + 1;
    });
    Object.keys(cnt).forEach(function (sid) {
      APOC.Data.setEffectsAt(APOC.Data.Sets[sid], cnt[sid]).forEach(function (e) {
        v += (e.val || 0) * (STAT_W[e.stat] || 10);
      });
    });
    return v;
  }

  /* 一键换装：按**整套总评分**择优。
     5 个槽位 × 背包规模，用"逐槽位反复试换到不动"的爬山法，几轮就收敛。 */
  function autoEquipBest() {
    var D = APOC.State.data;
    var pick = {};
    SLOT_LIST.forEach(function (slot) { pick[slot] = equippedItem(slot); });

    /* 每个槽位的候选：身上的那件 + 背包里同槽位的全部 */
    var cands = {};
    SLOT_LIST.forEach(function (slot) {
      var list = [];
      if (pick[slot]) list.push(pick[slot]);
      D.bag.forEach(function (it) {
        if (itemSlot(it) === slot) list.push(it);
      });
      cands[slot] = list;
    });

    /* 用显式 for 循环而不是 forEach —— 循环体内声明函数会被 ESLint 的
       no-loop-func 抓到（闭包捕获循环变量是这类代码最经典的坑）。 */
    var n = 0;
    for (var pass = 0; pass < 6; pass++) {
      var improved = false;
      for (var si = 0; si < SLOT_LIST.length; si++) {
        var slot = SLOT_LIST[si];
        var list = cands[slot];
        /* ★ 每个候选都要在**同一个基准**下评估：循环里改完 pick[slot] 必须复位，
           否则代价函数的基准会随候选顺序漂移，结果依赖背包顺序（也就是 RNG），
           同一个存档多跑几次能穿出不同结果。 */
        var base = pick[slot];
        var bestIt = base, bestV = loadoutScore(pick);
        for (var ci = 0; ci < list.length; ci++) {
          pick[slot] = list[ci];
          var v = loadoutScore(pick);
          if (v > bestV + 1e-6) { bestV = v; bestIt = list[ci]; }
        }
        pick[slot] = bestIt;
        if (bestIt !== base) improved = true;
      }
      if (!improved) break;
    }
    SLOT_LIST.forEach(function (slot) {
      var want = pick[slot] ? pick[slot].uid : null;
      if (D.equipped[slot] !== want) { D.equipped[slot] = want; n++; }
    });
    if (n) {
      APOC.Stats.markDirty();
      APOC.State.markDirty();
      APOC.Bus.emit('equip:change');
      APOC.Bus.emit('bag:change');
      APOC.Bus.emit('toast', { type: 'success', text: '一键换装：更新了 ' + n + ' 件' });
    } else {
      APOC.Bus.emit('toast', { type: 'info', text: '身上的装备已经是最优的了' });
    }
    return n;
  }

  /* 一键分解次级：卖掉所有「比同槽位已装备的那件还差」的装备。
     规则保证永远不会把升级件卖掉 —— 只在有对照物时才卖。 */
  function autoSellWorse() {
    var D = APOC.State.data;
    var kept = [], gold = 0, cnt = 0;
    D.bag.forEach(function (it) {
      if (isEquipped(it)) { kept.push(it); return; }
      /* ★ 在攒的套装件永不自动分解 */
      if (isProtectedSetPiece(it)) { kept.push(it); return; }
      /* ★ 强化过的装备永不自动分解。强化投入的材料和金币很可能远超这件装备本身，
         自动卖掉等于把玩家的投入直接扔了，而且**不会弹任何确认**。
         要卖可以手动点「分解」，那时玩家是知情的。 */
      if (enhLevel(it) > 0) { kept.push(it); return; }
      var slot = itemSlot(it);
      var cur = slot ? equippedItem(slot) : null;
      if (cur && scoreItem(it) < scoreItem(cur)) {
        var r = sell(it, true);
        gold += r.gold; cnt++;
      } else kept.push(it);
    });
    D.bag = kept;
    APOC.State.markDirty();
    APOC.Bus.emit('bag:change');
    if (cnt) {
      APOC.Bus.emit('toast', { type: 'success',
        text: '分解次级装备 ' + cnt + ' 件，获得 ' + F.fmt(gold) + ' 金币' });
    } else {
      APOC.Bus.emit('toast', { type: 'info', text: '没有比身上更差的装备可分解' });
    }
    return cnt;
  }

  function bagFull() {
    var D = APOC.State.data;
    return D.bag.length >= D.bagSize;
  }

  APOC.Inventory = {
    makeItem: makeItem,
    rollDrop: rollDrop,
    rollQuality: rollQuality,
    addItem: addItem,
    sell: sell,
    sellByQuality: sellByQuality,
    equip: equip,
    unequip: unequip,
    equippedItem: equippedItem,
    removeFromBag: removeFromBag,
    itemName: itemName,
    itemIcon: itemIcon,
    itemSlot: itemSlot,
    isEquipped: isEquipped,
    scoreItem: scoreItem,
    autoEquipBest: autoEquipBest,
    autoSellWorse: autoSellWorse,

    /* 强化 */
    effStats: effStats,
    enhLevel: enhLevel,
    enhMul: enhMul,
    enhanceCost: enhanceCost,
    enhanceRate: enhanceRate,
    enhance: enhance,
    enhanceBatch: enhanceBatch,
    decompValue: decompValue,
    matIdOf: matIdOf,

    /* 一键吞噬：把"比身上差的"装备喂给宠物。
       判据与 autoSellWorse **完全一致**（同一套保护规则），
       区别只是终点是宠物而不是金币 —— 玩家在两者之间选一个出口。
       ★ 没有宠物时返回 {ok:false}，绝不静默吃掉装备。 */
    autoDevour: function () {
      var P = APOC.Pets;
      if (!P || !P.has()) return { ok: false, reason: 'nopet', count: 0, gold: 0 };
      var D = APOC.State.data;
      var g0 = D.player.gold;
      var kept = [], n = 0;
      D.bag.forEach(function (it) {
        if (isEquipped(it)) { kept.push(it); return; }
        if (isProtectedSetPiece(it)) { kept.push(it); return; }
        if (enhLevel(it) > 0) { kept.push(it); return; }   // 强化过的永不自动吞
        var slot = itemSlot(it);
        var cur = slot ? equippedItem(slot) : null;
        if (cur && scoreItem(it) < scoreItem(cur)) { P.devour(it); n++; }
        else kept.push(it);
      });
      D.bag = kept;
      APOC.State.markDirty();
      APOC.Bus.emit('bag:change');
      return { ok: true, count: n, gold: D.player.gold - g0 };
    },
    countMaterial: countMaterial,
    addMaterial: addMaterial,
    spendMaterial: spendMaterial,
    addGold: addGold,
    spendGold: spendGold,
    bagFull: bagFull
  };
})(window.APOC = window.APOC || {});
