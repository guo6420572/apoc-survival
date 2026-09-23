/* eventbus.js — 极简事件总线，用于 core → ui 解耦 */
(function (APOC) {
  'use strict';

  /* ★ 可选子系统的空实现兜底。
     这类问题已经咬过四次（sprites 回调签名、audio 未加载、UIEffects 缺方法…），
     共同点都是"某个模块没到位 → 抛异常 → 整条调用链断掉 → 玩家看到的是白屏/卡死"。
     统一在这里给空实现：模块缺失只会"没声音/没特效"，不会崩。 */
  function noop() {}
  APOC.Audio = APOC.Audio || {
    play: noop, unlock: noop, setVolume: noop, setMuted: noop,
    /* ★ 这里必须**覆盖全部会从 core 调过来的方法**。
       漏一个的后果不是"没声音"，而是 core 里那句调用直接抛
       `xxx is not a function` —— 因为它已经存在，harness 的万能 Proxy 也不会补位。
       实测：playVoice / playMonster 是 2026-09 加音频文件层时补的，
       当时没有这两个，而 audio.js 又漏在 index.html 外，
       于是游戏一进战斗就开始抛异常。 */
    playVoice: noop, playMonster: noop,
    getVolume: function () { return 0; }, isMuted: function () { return true; },
    weaponSfx: function () { return 'shot_pistol'; }, ids: function () { return []; },
    isReady: function () { return false; }, progressInfo: function () { return { loaded: 0, total: 0, failed: 0 }; }
  };
  /* ★ 这套兜底是给"跑核心逻辑但没加载 UI"的场景用的（模拟器、调参器）。
     它必须**覆盖全部会从 core 调过来的方法** —— 漏一个，core 里那句调用就会抛
     `xxx is not a function`，而因为 APOC.UIEffects 已经存在，harness 的万能 Proxy
     也不会补位，整个模拟直接崩。加特效方法时记得同步这里。 */
  APOC.UIEffects = APOC.UIEffects || {
    shake: noop, burst: noop, spark: noop, ring: noop, tick: noop,
    explode: noop, flame: noop, drip: noop,
    getParticles: function () { return []; }, getRings: function () { return []; },
    /* 贴图特效实例层（effects.js 的 vfx）。render.js 每帧无条件调 getVfx()，
       少这一个就是 `getVfx is not a function` → 渲染循环整个断掉。 */
    vfx: noop, getVfx: function () { return []; },
    getShake: function () { return 0; }, showTip: noop, hideTip: noop,
    itemTipHTML: function () { return ''; }
  };

  var map = {};

  APOC.Bus = {
    on: function (evt, fn) {
      (map[evt] = map[evt] || []).push(fn);
      return function () { APOC.Bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      var a = map[evt];
      if (!a) return;
      var i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit: function (evt, payload) {
      var a = map[evt];
      if (!a || !a.length) return;
      for (var i = 0; i < a.length; i++) {
        try { a[i](payload); }
        catch (e) { console.error('[Bus] ' + evt, e); }
      }
    },
    clear: function () { map = {}; }
  };
})(window.APOC = window.APOC || {});
