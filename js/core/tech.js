/* tech.js — 科技树解锁 / 升级 / 武器切换 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula;

  function nodeLevel(nodeId) {
    return APOC.State.data.tech[nodeId] || 0;
  }

  function isUnlocked(nodeId) {
    return nodeLevel(nodeId) > 0;
  }

  /* 前置是否已满足（同线上一层的武器节点） */
  function reqOK(node) {
    if (!node.req) return true;
    return nodeLevel(node.req) > 0;
  }

  function costOf(node) {
    return F.techCost(node, nodeLevel(node.id));
  }
  function materialOf(node) {
    return F.techMaterial(node);
  }

  function canAfford(node) {
    var cost = costOf(node);
    var mat = materialOf(node);
    var p = APOC.State.data.player;
    if (p.gold < cost.gold) return false;
    if (mat && APOC.Inventory.countMaterial(mat.id) < cost.mat) return false;
    return true;
  }

  function canUnlock(node) {
    if (!node || isUnlocked(node.id)) return false;
    return reqOK(node) && canAfford(node);
  }

  function unlock(node) {
    if (!canUnlock(node)) return false;
    var cost = costOf(node), mat = materialOf(node);
    APOC.Inventory.spendGold(cost.gold);
    if (mat) APOC.Inventory.spendMaterial(mat.id, cost.mat);
    APOC.State.data.tech[node.id] = 1;

    /* ★ 解锁武器节点**不再自动装备**。
       原来是：任何一条线的主节点一解锁就无条件抢走武器 —— 不比较强弱、不看是不是
       同一条线。实测下来：先解枪械 6 层的「狙击枪」，再解异能 2 层的「心灵震爆」，
       那把 2 层的会把 6 层的顶掉；而且当时 UI 里**根本没有换回来的入口**
       （setWeapon 在 UI 里零调用），玩家就此被钉死在一把弱武器上。
       现在改成"解锁只入库，装备由玩家自己选"：
       入口在角色面板的武器行（panel_char.js）和科技树的武器节点详情（panel_tech.js）。
       默认武器是 gun_1（生锈手枪，见 state.js），所以永远有武器在手。 */
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('tech:change');
    APOC.Bus.emit('toast', { type: 'success', text: '解锁「' + node.name + '」' });
    return true;
  }

  function canUpgrade(node) {
    if (!node) return false;
    var lv = nodeLevel(node.id);
    if (lv <= 0 || lv >= C.TECH_MAX_LV) return false;
    return canAfford(node);
  }

  function upgrade(node) {
    if (!canUpgrade(node)) return false;
    var cost = costOf(node), mat = materialOf(node);
    APOC.Inventory.spendGold(cost.gold);
    if (mat) APOC.Inventory.spendMaterial(mat.id, cost.mat);
    APOC.State.data.tech[node.id] = nodeLevel(node.id) + 1;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('tech:change');
    return true;
  }

  /* ---------- 科技重置 ----------
     ★ 为什么必须有：被动改成"只有当前武器那条线生效"之后，玩家点在另外两条线上的
     材料会**暂时用不上**。没有重置的话这些投入就是死钱，换流派等于被罚一次。
     规则：100% 返还已消耗的材料与金币（不折价），只收一笔固定的金币手续费。
     手续费按科技总投入的比例收，避免"点满再重置"变成免费洗点。 */
  function resetCost() {
    var total = 0;
    Object.keys(APOC.State.data.tech).forEach(function (id) {
      var lv = APOC.State.data.tech[id];
      if (!lv) return;
      var node = APOC.Data.TechById[id];
      if (!node) return;
      /* 已投入 = 解锁那一次 + 之后每次升级，逐级把花费加回去 */
      for (var k = 0; k < lv; k++) total += F.techCost(node, k).gold;
    });
    return Math.round(C.TECH_RESET_GOLD + total * C.TECH_RESET_FEE);
  }

  /* 返还清单：材料按节点逐级累计，金币按上面算出的总额（扣掉手续费） */
  function refundList() {
    var mats = {}, gold = 0;
    Object.keys(APOC.State.data.tech).forEach(function (id) {
      var lv = APOC.State.data.tech[id];
      if (!lv) return;
      var node = APOC.Data.TechById[id];
      if (!node) return;
      var mat = materialOf(node);
      for (var k = 0; k < lv; k++) {
        var c = F.techCost(node, k);
        gold += c.gold;
        if (mat) mats[mat.id] = (mats[mat.id] || 0) + c.mat;
      }
    });
    return { gold: gold, mats: mats };
  }

  function canReset() {
    return Object.keys(APOC.State.data.tech).some(function (id) {
      return APOC.State.data.tech[id] > 0;
    });
  }

  function reset() {
    if (!canReset()) return false;
    var fee = resetCost();
    var p = APOC.State.data.player;
    if (p.gold < fee) return false;
    var r = refundList();
    APOC.Inventory.spendGold(fee);
    Object.keys(r.mats).forEach(function (mid) {
      APOC.Inventory.addMaterial(mid, r.mats[mid]);
    });
    APOC.Inventory.addGold(r.gold);
    /* 全部清零；武器退回初始那把（否则会拿着一把已"未解锁"的武器） */
    APOC.State.data.tech = {};
    APOC.State.data.equipped.weapon = C.START_WEAPON;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('tech:change');
    APOC.Bus.emit('equip:change');
    APOC.Bus.emit('toast', { type: 'success',
      text: '科技已重置，返还 ' + F.fmt(r.gold) + ' 金币与全部材料（手续费 ' + F.fmt(fee) + '）' });
    return true;
  }

  /* ---------- 武器 ---------- */
  function equippedWeaponId() {
    return APOC.State.data.equipped.weapon;
  }
  function currentWeapon() {
    var id = equippedWeaponId();
    return id ? APOC.Data.Weapons[id] : null;
  }
  function setWeapon(weaponId) {
    if (!isUnlocked(weaponId)) return false;
    APOC.State.data.equipped.weapon = weaponId;
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('equip:change');
    APOC.Bus.emit('tech:change');
    return true;
  }

  /* 已解锁的武器列表 */
  function unlockedWeapons() {
    return Object.keys(APOC.Data.Weapons)
      .filter(function (id) { return isUnlocked(id); })
      .map(function (id) { return APOC.Data.Weapons[id]; });
  }

  /* 该线当前可用的最强武器（自动推荐用） */
  function bestWeaponOfLine(line) {
    var list = unlockedWeapons().filter(function (w) { return w.line === line; });
    if (!list.length) return null;
    list.sort(function (a, b) { return b.layer - a.layer; });
    return list[0];
  }

  APOC.Tech = {
    nodeLevel: nodeLevel,
    isUnlocked: isUnlocked,
    reqOK: reqOK,
    costOf: costOf,
    materialOf: materialOf,
    canAfford: canAfford,
    canUnlock: canUnlock,
    unlock: unlock,
    canUpgrade: canUpgrade,
    upgrade: upgrade,
    currentWeapon: currentWeapon,
    reset: reset,
    resetCost: resetCost,
    canReset: canReset,
    refundList: refundList,
    equippedWeaponId: equippedWeaponId,
    setWeapon: setWeapon,
    unlockedWeapons: unlockedWeapons,
    bestWeaponOfLine: bestWeaponOfLine
  };
})(window.APOC = window.APOC || {});
