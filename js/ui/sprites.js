/* sprites.js — 贴图加载
 *
 * 两类素材，用法不同：
 *   Canvas 用（主角行走帧 / 怪物 / 背景）→ 加载成 Image 对象，渲染时 drawImage
 *   DOM 用（材料 / 装备 / 武器 / 科技 / 词条图标）→ 直接用 <img src>，不需要预加载
 *
 * 素材 ID 与数据表一一对应（设计者按数据表命名），所以清单直接从数据表推导，不需要 manifest。
 * 文件不存在时：Canvas 侧标记为「无」退回程序化绘制，DOM 侧显示 emoji 兜底，都不会开天窗。
 */
(function (APOC) {
  'use strict';

  var img = {};        // key -> Image | null（只有 Canvas 用的那些需要预加载）
  var done = 0, total = 0, failed = 0, finished = false;

  var PLAYER_FRAMES = 8;   // 主角行走循环帧数

  function key(kind, id) { return kind + ':' + id; }

  /* 图标类素材的路径规则（ID 与数据表一致） */
  function pathFor(kind, id) {
    switch (kind) {
      case 'weapon': return 'assets/weapon/' + id + '.png';
      case 'mat':    return 'assets/mat/' + id + '.png';
      case 'equip':  return 'assets/equip/' + id + '.png';
      case 'tech':   return 'assets/tech/' + id + '.png';
      case 'perk':   return 'assets/perk/' + id + '.png';
      case 'mon':    return 'assets/mon/' + id + '.png';
      case 'bg':     return 'assets/bg/' + id + '.jpg';
      case 'player': return 'assets/player/walk_' + id + '.png';
      /* 战斗特效（素材库_写实风/09_特效/，39 张）。id 就是文件名去掉 .png，
         例如 fx.get('fx', 'explode_elite') → assets/fx/explode_elite.png */
      case 'fx':     return 'assets/fx/' + id + '.png';
      default:       return null;
    }
  }

  /* ★ 特效贴图降采样。
     源图是 800~2048px 的厚涂图，39 张按原尺寸解码要占 132MB 显存/内存 ——
     而全项目的怪物素材（71 张 256×256）加起来才 15MB，特效一家就顶掉全部家当，
     手机上会直接 OOM。画面上特效最大也就画到 400px，原尺寸纯属浪费。
     加载完立刻缩到离屏 canvas 并**释放原 Image**，所以峰值内存只有单张原图那么大。 */
  function downscaleFx(im, id) {
    var C = APOC.Config;
    var cap = (C.FX_LONG_IDS.indexOf(id) >= 0) ? C.FX_LONG_MAX_PX : C.FX_MAX_PX;
    var w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
    if (!w || !h) return im;
    var s = Math.min(1, cap / Math.max(w, h));
    if (s >= 1) return im;
    var cv, c;
    try {
      cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      c = cv.getContext('2d');
      if (!c) return im;
      c.imageSmoothingEnabled = true;
      c.drawImage(im, 0, 0, cv.width, cv.height);
    } catch (e) { return im; }
    return cv;
  }

  /* ★ 带版本号加载失败时，去掉 ?v= 再试一次。
     file:// 下部分浏览器把 "x.png?v=5" 当成真实文件名去找 → 404 → 全部贴图挂掉。 */
  function load(kind, id, cb) {
    var k = key(kind, id);
    if (img[k] !== undefined) return;
    img[k] = null;
    total++;
    var base = pathFor(kind, id);
    if (!base) { done++; checkDone(); return; }
    var triedPlain = false;
    var im = new Image();
    im.onload = function () {
      /* 特效贴图走降采样（见上）；其余素材原样用 */
      var o = (kind === 'fx') ? downscaleFx(im, id) : im;
      img[k] = o; done++;
      /* ★ 缩完立刻断开回调并清空 src，放掉原图的解码内存。
         顺序不能反：src 置空会让部分浏览器把图片置成 broken 并**触发 onerror**，
         而 onerror 里还有一次「去掉 ?v= 重试」的分支 —— 那会再重新加载一遍、
         done 加两次，贴图计数直接错乱（加载完成事件可能永远不发，游戏卡在载入页）。 */
      if (o !== im) {
        im.onload = null; im.onerror = null;
        try { im.src = ''; } catch (e) { /* 少数实现不给置空，忽略即可 ——
                                            丢掉引用后 GC 一样会回收解码数据 */ }
      }
      if (typeof cb === 'function') cb(k, o);
      checkDone();
    };
    im.onerror = function () {
      if (!triedPlain) { triedPlain = true; im.src = base; return; }
      failed++;
      done++;
      checkDone();
    };
    im.src = base + '?v=' + APOC.Config.ASSET_VER;
  }

  function checkDone() {
    if (done >= total && !finished) {
      finished = true;
      var info = { loaded: countLoaded(), total: total, failed: failed };
      APOC.Bus.emit('sprites:ready', info);
      if (failed > 0) console.warn('[Sprites] ' + failed + '/' + total + ' 张素材加载失败');
    }
  }

  function countLoaded() {
    var n = 0;
    for (var k in img) if (img[k]) n++;
    return n;
  }

  APOC.Sprites = {
    init: function (onReady) {
      for (var f = 1; f <= PLAYER_FRAMES; f++) load('player', f);
      APOC.Data.Scenes.forEach(function (s) { load('bg', s.id); });
      Object.keys(APOC.Data.Monsters).forEach(function (m) { load('mon', m); });
      /* 战斗特效贴图（39 张）。清单在 Config.FX_IDS —— 数量少、每张都要用，
         所以和怪物一样全量预加载，不用懒加载那套。 */
      APOC.Config.FX_IDS.forEach(function (id) { load('fx', id); });

      if (typeof onReady === 'function') {
        /* ★ 已经加载完时必须主动回调，且**必须带同样的 payload**。
           曾经这里写成 onReady() 不带参数，main.js 里 p.loaded 直接抛异常，
           整个 boot() 中断、主循环没启动，玩家看到的是"怪物全都不见了"。 */
        if (finished) onReady({ loaded: countLoaded(), total: total, failed: failed });
        else APOC.Bus.on('sprites:ready', onReady);
      }
    },

    /* ---------- Canvas 用 ---------- */
    mon: function (id) { return img[key('mon', id)] || null; },
    bg:  function (id) { return img[key('bg', id)] || null; },
    player: function (frame) {
      var f = Math.max(1, Math.min(PLAYER_FRAMES, frame || 1));
      return img[key('player', f)] || img[key('player', 1)] || null;
    },
    frameCount: function () { return PLAYER_FRAMES; },
    /* 战斗特效贴图。id 见 Config.FX_IDS；没加载出来（或文件缺失）返回 null，
       调用方一律按"这一张不画"处理，绝不能让特效缺图把渲染循环打断。 */
    fx: function (id) { return (id && img[key('fx', id)]) || null; },

    /* ---------- DOM 用 ---------- */
    path: pathFor,
    /* 生成一个图标 <img>。素材缺失时 onerror 把 alt（emoji）插回来，不会留白。 */
    iconTag: function (kind, id, size, emoji, style) {
      var p = pathFor(kind, id);
      var s = size || 32;
      var fb = emoji || '❓';
      if (!p) return '<span style="font-size:' + Math.round(s * 0.8) + 'px">' + fb + '</span>';
      return '<img src="' + p + '?v=' + APOC.Config.ASSET_VER + '" alt="' + fb + '" class="ico-img"' +
             ' style="width:' + s + 'px;height:' + s + 'px;' + (style || '') + '"' +
             ' onerror="this.outerHTML=\'<span style=&quot;font-size:' + Math.round(s * 0.8) +
             'px&quot;>' + fb + '</span>\'">';
    },

    isReady: function () { return finished; },
    failedCount: function () { return failed; },
    progress: function () { return total ? done / total : 1; },
    loadedCount: countLoaded,
    progressInfo: function () { return { loaded: countLoaded(), total: total, failed: failed }; }
  };
})(window.APOC = window.APOC || {});
