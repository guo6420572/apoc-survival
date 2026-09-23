/* difficulty.js — 每关难度表（100 关）。
   ★ 由 tools/fit_scale.js 生成，不要手改 —— 手改的值会在下一轮拟合时被覆盖。
     （旧口径的 tools/tune_diff.js 已废弃：它那套"怪物属性 = POW(K) 指数成长 ×
       难度表乘区"的模型被整体推翻，改成"以该关满配人物属性为基准"。）

   schema: LIST[K-1] = { hpMul, atkMul, count, interval, src }
     hpMul/atkMul  float  怪物 hp/atk 相对 monBase 基准的乘区。
                          由 fit_scale.js 按**双维度**（单只怪 DPS = 人物 DPS × X%，
                          单只怪 EHP = 人物 EHP × X%）反解得到
     count         int    本关怪物总数 = 各波之和 = 180（5+10+15+20+25+30+35+40）
     interval      float  同波补员间隔（整波一次放完时用不到，Config.WAVE_REFILL_SEC）
     src           'fit<N>' 该关取的基准档位是 N%（回溯用）
                   'unused' 割草关，不走难度表（传的是 Difficulty.IDENT）
                   'ident'  = IDENT 常量本身
   索引约定：下标 0 = K1，下标 99 = K100。外部一律走 APOC.Difficulty.forStage(K)，K 从 1 起。

   ★ 怪数唯一真源是 Difficulty.wavesOf(K)（默认 Config.WAVE_SIZES），
     countOf(K) = 各波之和、compOf(K) 的经济归一化也用它 —— 三处必须一致，
     否则掉落与经验会静默对不上账。
   ★ 运行时还会再叠一层 Config.WAVE_ADAPT 的自适应倍率（每关重置）。 */
(function (APOC) {
  'use strict';

  /* 割草关用：不走难度表（割草关的难度来自**同屏不设上限**的怪海 + 时间曲线，
     不是按关缩放）。★ 同屏 150 只的硬闸已撤，见 Config.ARENA_KILL_CAP 的说明。 */
  var IDENT = { hpMul: 1, atkMul: 1, count: 20, interval: 0.8, src: 'ident' };

  var LIST = [
    { hpMul: 0.709, atkMul: 3.049, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.754, atkMul: 2.625, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.782, atkMul: 2.247, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 1.112, atkMul: 3.118, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.823, atkMul: 3.157, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.797, atkMul: 2.271, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.758, atkMul: 2.434, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 18.731, atkMul: 90.414, count: 180, interval: 0.5, src: 'fit130' },
    { hpMul: 14.331, atkMul: 57.828, count: 180, interval: 0.5, src: 'fit100' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 1.302, atkMul: 4.582, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 19.859, atkMul: 113.725, count: 180, interval: 0.5, src: 'fit100' },
    { hpMul: 16.814, atkMul: 80.644, count: 180, interval: 0.5, src: 'fit80' },
    { hpMul: 0.887, atkMul: 5.901, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 1.167, atkMul: 4.275, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.965, atkMul: 5.519, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.759, atkMul: 4.632, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 9.709, atkMul: 43.431, count: 180, interval: 0.5, src: 'fit60' },
    { hpMul: 0.718, atkMul: 3.39, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 0.633, atkMul: 7.321, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.621, atkMul: 7.268, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.683, atkMul: 5.156, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.669, atkMul: 4.549, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 0.815, atkMul: 3.617, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 7.95, atkMul: 53.069, count: 180, interval: 0.5, src: 'fit60' },
    { hpMul: 0.6, atkMul: 3.146, count: 180, interval: 0.5, src: 'fit5' },
    { hpMul: 7.193, atkMul: 32.385, count: 180, interval: 0.5, src: 'fit45' },
    { hpMul: 5.211, atkMul: 24.773, count: 180, interval: 0.5, src: 'fit45' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 24.353, atkMul: 245.203, count: 180, interval: 0.5, src: 'fit170' },
    { hpMul: 4.072, atkMul: 43.389, count: 180, interval: 0.5, src: 'fit30' },
    { hpMul: 30.975, atkMul: 413.85, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 11.297, atkMul: 106.222, count: 180, interval: 0.5, src: 'fit100' },
    { hpMul: 2.282, atkMul: 25.083, count: 180, interval: 0.5, src: 'fit20' },
    { hpMul: 11.253, atkMul: 152.953, count: 180, interval: 0.5, src: 'fit100' },
    { hpMul: 10.626, atkMul: 116.2, count: 180, interval: 0.5, src: 'fit80' },
    { hpMul: 23.797, atkMul: 223.761, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 17.092, atkMul: 163.425, count: 180, interval: 0.5, src: 'fit170' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 102.604, atkMul: 4434.973, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 70.896, atkMul: 2364.227, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 13.016, atkMul: 552.658, count: 180, interval: 0.5, src: 'fit130' },
    { hpMul: 47.15, atkMul: 1129.335, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 4.09, atkMul: 135.276, count: 180, interval: 0.5, src: 'fit45' },
    { hpMul: 55.86, atkMul: 1383.529, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 9.182, atkMul: 221.767, count: 180, interval: 0.5, src: 'fit100' },
    { hpMul: 2.591, atkMul: 83.263, count: 180, interval: 0.5, src: 'fit30' },
    { hpMul: 2.959, atkMul: 70.093, count: 180, interval: 0.5, src: 'fit30' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 71.567, atkMul: 3421.927, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 69.63, atkMul: 2842.574, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 28.396, atkMul: 1808.161, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 28.014, atkMul: 1651.515, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 40.132, atkMul: 2730.921, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 62.433, atkMul: 2559.819, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 41.282, atkMul: 2112.985, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 28.882, atkMul: 1288.382, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 26.704, atkMul: 1132.054, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 93.07, atkMul: 5014.105, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 101.073, atkMul: 4141.166, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 97.437, atkMul: 5061.106, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 101.068, atkMul: 5195.204, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 87.72, atkMul: 6698.253, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 80.821, atkMul: 5415.451, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 139.486, atkMul: 4172.663, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 88.046, atkMul: 4932.592, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 76.121, atkMul: 3557.116, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 90.623, atkMul: 3528.951, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 73.934, atkMul: 2880.3, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 70.782, atkMul: 3325.733, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 73.28, atkMul: 2405.694, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 70.703, atkMul: 2191.357, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 93.683, atkMul: 1921.958, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 67.103, atkMul: 2492.19, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 74.223, atkMul: 2706.057, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 84.133, atkMul: 2600.301, count: 180, interval: 0.5, src: 'fit900' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 60.25, atkMul: 959.878, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 71.293, atkMul: 1392.103, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 63.32, atkMul: 2460.635, count: 180, interval: 0.5, src: 'fit600' },
    { hpMul: 56.788, atkMul: 1287.951, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 59.042, atkMul: 799.718, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 68.365, atkMul: 1215.717, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 56.626, atkMul: 808.077, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 57.962, atkMul: 610.841, count: 180, interval: 0.5, src: 'fit300' },
    { hpMul: 47.321, atkMul: 734.924, count: 180, interval: 0.5, src: 'fit300' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 48.465, atkMul: 1088.121, count: 180, interval: 0.5, src: 'fit300' },
    { hpMul: 45.055, atkMul: 887.35, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 40.818, atkMul: 579.359, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 58.7, atkMul: 1267.71, count: 180, interval: 0.5, src: 'fit400' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' },
    { hpMul: 61.182, atkMul: 1089.205, count: 180, interval: 0.5, src: 'fit300' },
    { hpMul: 36.037, atkMul: 637.554, count: 180, interval: 0.5, src: 'fit170' },
    { hpMul: 43.928, atkMul: 643.745, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 40.086, atkMul: 680.138, count: 180, interval: 0.5, src: 'fit220' },
    { hpMul: 1, atkMul: 1, count: 180, interval: 0.5, src: 'unused' }
  ];

  APOC.Difficulty = {
    LIST: LIST,
    IDENT: IDENT,

    /* ★ 越界夹紧，永不返回 null/undefined —— monBase 会直接乘它，
       一旦是 undefined 就会静默污染成 NaN，整条属性链无声烂掉 */
    forStage: function (K) {
      var i = Math.round(K) - 1;
      if (!(i >= 0)) i = 0;
      if (i > LIST.length - 1) i = LIST.length - 1;
      return LIST[i];
    },

    /* 本关的每波怪数。默认 WAVE_SIZES = [5,10,15,20]（整波一次性投放）。
       留成函数是为了让"每关怪物规则不固定"有落点 —— 将来某关要特殊的波次，
       在 LIST 里给该关加一个 waves 字段即可，不用改 buildWaves。 */
    wavesOf: function (K) {
      var w = this.forStage(K).waves;
      return (w && w.length) ? w : APOC.Config.WAVE_SIZES;
    },

    /* ★ 怪数唯一真源 = 各波之和。buildWaves 与经济归一化必须共用它，
       否则两处会算出不同的怪数，掉落与经验会静默对不上账。 */
    countOf: function (K) {
      var w = this.wavesOf(K), n = 0;
      for (var i = 0; i < w.length; i++) n += w[i];
      return n;
    },

    /* 给定怪数时的敌人编成。精英固定 1 只（精英关 2 只），与 count 无关 ——
       精英 TIER 是 hp4.0/exp6.0/gold4.0，按比例铺开会直接冲爆掉落与经验。
       wGold / wExp 是各档权重和：经济归一化靠它们把"每关产出总量"摊到每只怪身上。 */
    compAt: function (K, count) {
      var elite = APOC.Data.isEliteStage(K) ? 2 : 1;
      var normal = Math.max(0, count - elite);
      var t = APOC.Config.TIER;
      return {
        normal: normal,
        elite: elite,
        count: count,
        wGold: normal * t.normal.gold + elite * t.elite.gold,
        wExp: normal * t.normal.exp + elite * t.elite.exp
      };
    },

    /* 本关敌人编成。buildWaves 与经济归一化必须共用这一份，否则两处会算出不同的怪数。 */
    compOf: function (K) {
      return this.compAt(K, this.countOf(K));
    }
  };

  /* 目标通关耗时（秒）：K1~K70 恒定 55 秒，之后线性上浮到 72 秒。
     tune_diff.js 按它拟合 hpMul，headless_test.js 按它验收。 */
  APOC.Difficulty.targetSec = function (K) {
    return K <= 70 ? 55 : 55 + 17 * (K - 70) / 30;
  };
})(window.APOC = window.APOC || {});
