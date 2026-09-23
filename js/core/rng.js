/* rng.js — 可播种随机数（mulberry32），保证离线结算可复现 */
(function (APOC) {
  'use strict';

  var s = 0;

  function seed(v) { s = (v >>> 0) || 1; }

  function next() {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  APOC.RNG = {
    seed: seed,
    next: next,
    /* [a, b) 浮点 */
    range: function (a, b) { return a + next() * (b - a); },
    /* [a, b] 整数 */
    int: function (a, b) { return Math.floor(a + next() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
    chance: function (p) { return next() < p; },
    /* items 为对象数组，按 wkey 权重抽一个 */
    weighted: function (items, wkey) {
      var total = 0, i;
      for (i = 0; i < items.length; i++) total += items[i][wkey || 'weight'];
      var r = next() * total;
      for (i = 0; i < items.length; i++) {
        r -= items[i][wkey || 'weight'];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    /* 从 arr 里不重复抽 n 个 */
    sample: function (arr, n) {
      var copy = arr.slice(), out = [];
      n = Math.min(n, copy.length);
      for (var i = 0; i < n; i++) {
        out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      }
      return out;
    }
  };

  seed(Date.now() & 0x7fffffff);
})(window.APOC = window.APOC || {});
