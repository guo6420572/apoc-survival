/* offline.js — 离线收益：按当前关卡挂机收益 × 时长 × 效率，封顶 8 小时 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula;

  /* 启动时调用：算出待领取收益，挂到 flags.offlinePending */
  function settle() {
    var D = APOC.State.data;
    var now = Date.now();
    var last = D.lastSaveTime || now;
    /* 时间倒流（改系统时间）→ 不结算，直接重置时间戳 */
    if (last > now) { D.lastSaveTime = now; return null; }
    if (!D.settings.offlineReward) { D.lastSaveTime = now; return null; }

    var awaySec = (now - last) / 1000;
    if (awaySec < C.OFFLINE_MIN_SEC) { D.lastSaveTime = now; return null; }

    var eff = Math.min(awaySec, C.OFFLINE_CAP_SEC);
    var K = D.progress.stage || 1;
    var rates = F.offlineRates(K);
    var scene = APOC.Data.sceneOfStage(K);
    var effMul = C.OFFLINE_EFF;

    var gold = Math.floor(rates.goldPerSec * eff * effMul);
    var exp = Math.floor(rates.expPerSec * eff * effMul);

    /* 材料按该场景两种材料均分 */
    var matTotal = Math.floor(rates.matPerSec * eff * effMul);
    var mats = {};
    if (scene && scene.materials.length) {
      var per = Math.floor(matTotal / 2);
      mats[scene.materials[0]] = per;
      if (scene.materials[1]) mats[scene.materials[1]] = matTotal - per;
    }

    var itemN = Math.min(C.OFFLINE_ITEM_CAP,
      Math.floor(C.OFFLINE_ITEM_PER_MIN * (eff / 60) * effMul));

    var pending = {
      awaySec: awaySec,
      effSec: eff,
      capped: awaySec > C.OFFLINE_CAP_SEC,
      gold: gold, exp: exp, mats: mats, itemN: itemN, stage: K
    };
    D.flags.offlinePending = pending;
    D.lastSaveTime = now;
    return pending;
  }

  /* 玩家点「领取」时调用 */
  function claim() {
    var D = APOC.State.data;
    var p = D.flags.offlinePending;
    if (!p) return false;

    APOC.Inventory.addGold(p.gold);
    Object.keys(p.mats).forEach(function (mid) { APOC.Inventory.addMaterial(mid, p.mats[mid]); });

    /* 经验 */
    var player = D.player;
    player.exp += p.exp;
    while (player.level < C.MAX_LEVEL) {
      var need = F.expNeed(player.level);
      if (player.exp < need) break;
      player.exp -= need;
      player.level++;
      player.freePoints += C.POINTS_PER_LEVEL;
    }
    if (player.level >= C.MAX_LEVEL) player.exp = 0;

    /* 装备 */
    for (var i = 0; i < p.itemN; i++) {
      var it = APOC.Inventory.rollDrop(p.stage, false);
      if (it) APOC.Inventory.addItem(it);
    }

    D.flags.offlinePending = null;
    APOC.Stats.markDirty();
    APOC.State.save(true);
    APOC.Bus.emit('offline:claimed', p);
    return p;
  }

  APOC.Offline = { settle: settle, claim: claim };
})(window.APOC = window.APOC || {});
