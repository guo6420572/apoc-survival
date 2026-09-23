/* world.js — 世界难度（普通 / 困难 / 噩梦 / 地狱）
 *
 * 设计（2026-09-23 用户定）：
 *   普通 = 原来的难度；困难 / 噩梦 / 地狱 **逐级 ×10**（10 / 100 / 1000）。
 *   乘区落在 Formula.monBase 的 hp/atk 上 —— 那是**全部**怪物属性的唯一出口
 *   （普通怪 / 精英 / 游荡 Boss / 割草关），一处生效即处处生效。
 *   ★ 只放大强度，exp / gold / def 与掉落**不动**。
 *
 *   切档要付代价，**每次切换都结算一次**（含切回低难度）：
 *       等级归零   level → 1，exp → 0，freePoints → 0
 *       加点保留   alloc 各项 ×0.25（向下取整，不给玩家白送点数）
 *       科技归零   tech 全清，武器退回初始那把（同 Tech.reset 的退路）
 *       宠物保留   属性池 ×0.5（等级不动 —— 用户只说了"属性"）
 *   金币 / 材料 / 装备 / 背包 / 关卡进度**都不动**。
 */
(function (APOC) {
  'use strict';

  var C = APOC.Config;

  function tiers() { return C.WORLD_TIERS; }

  /* ★ 夹紧，永不返回 undefined —— 老存档没有 world 字段、或者被人改坏时，
     都要退回"普通"。mul 一旦是 NaN，整条怪物属性链会无声烂掉。 */
  function index() {
    var d = APOC.State.data;
    var t = d && d.world ? d.world.tier : 0;
    t = Math.round(t);
    if (!(t >= 0)) t = 0;
    if (t > tiers().length - 1) t = tiers().length - 1;
    return t;
  }

  function cur() { return tiers()[index()]; }

  /* 怪物强度乘区。formulas.monBase 唯一要调的就是这个。 */
  function monMul() { return cur().mul; }

  function name() { return cur().name; }

  function isNormal() { return index() === 0; }

  /* 切换难度。返回值：
       { ok:false, reason:'same' }  切的是当前难度，什么都没发生
       { ok:true, from, to, tier }  已结算并生效 */
  function switchTo(t) {
    t = Math.round(t);
    if (!(t >= 0 && t < tiers().length)) return { ok: false, reason: 'range' };
    if (t === index()) return { ok: false, reason: 'same' };

    var from = index();
    APOC.State.data.world.tier = t;
    applyPenalty();

    APOC.Stats.markDirty();
    APOC.State.markDirty();
    APOC.Bus.emit('world:change', { from: from, to: t, tier: tiers()[t] });
    APOC.Bus.emit('tech:change');
    APOC.Bus.emit('equip:change');
    APOC.Bus.emit('pet:change');
    return { ok: true, from: from, to: t, tier: tiers()[t] };
  }

  /* 切换难度的代价。★ 全程只改存档，副作用集中在这里，
     外面（面板/测试）不用重复实现一遍"归零规则"。 */
  function applyPenalty() {
    var D = APOC.State.data, p = D.player;

    /* 1. 等级归零 */
    p.level = 1;
    p.exp = 0;
    p.freePoints = 0;

    /* 2. 加点池保留 25%（向下取整：向上取整等于每切一次白送一堆点数） */
    Object.keys(p.alloc || {}).forEach(function (k) {
      p.alloc[k] = Math.floor((p.alloc[k] || 0) * C.WORLD_KEEP_ALLOC);
    });

    /* 3. 科技树全清。★ 不给 Tech.reset() 的返还 —— 那是"换流派"的退路，
       切换难度是**代价**，退款会让它变成免费洗点。
       武器必须一起退回初始那把：不清的话会拿着一把"已未解锁"的武器。
       保留 gun_1 = 1（和 state.js 开局一致），否则开局无武器可用。 */
    var tech = {};
    tech[C.START_WEAPON] = 1;
    D.tech = tech;
    D.equipped.weapon = C.START_WEAPON;

    /* 4. 宠物属性池保留 50%（等级/经验不动）。保留 4 位小数，
       免得浮点尾巴一路传到面板上显示成 12.000000000000002。 */
    if (D.pet && D.pet.stats) {
      Object.keys(D.pet.stats).forEach(function (k) {
        D.pet.stats[k] = Math.round((D.pet.stats[k] || 0) * C.WORLD_KEEP_PET * 10000) / 10000;
      });
    }

    /* 5. 血条按新上限回满。不重置的话，玩家会顶着一个**超过新上限**的旧血量
       （血条比例 >100%，HUD 会画到框外面）。 */
    APOC.Stats.markDirty();
    p.hp = APOC.Stats.final().hp;
  }

  /* 面板要用的展示信息 */
  function info() {
    var i = index(), t = tiers()[i], out = [];
    for (var k = 0; k < tiers().length; k++) {
      out.push({ index: k, id: tiers()[k].id, name: tiers()[k].name,
                 mul: tiers()[k].mul, on: k === i });
    }
    return { index: i, id: t.id, name: t.name, mul: t.mul, list: out };
  }

  APOC.World = {
    tiers: tiers,
    index: index,
    cur: cur,
    name: name,
    mul: monMul,
    monMul: monMul,
    isNormal: isNormal,
    switchTo: switchTo,
    applyPenalty: applyPenalty,
    info: info
  };
})(window.APOC = window.APOC || {});
