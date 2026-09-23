/* main.js — 启动引导 */
(function (APOC) {
  'use strict';

  var C = APOC.Config;

  /* 切换到指定关卡（普通关 / 割草关自动分流） */
  APOC.enterStage = function (K) {
    var D = APOC.State.data;
    K = Math.max(1, Math.min(C.MAX_STAGE, K | 0));
    if (K > D.progress.maxStage) {
      APOC.UI.toast('warn', '第 ' + K + ' 关还没解锁');
      return false;
    }

    /* 先彻底清理两种模式的残留状态 */
    APOC.Arena.exit();
    APOC.Combat.exit();

    D.progress.stage = K;
    if (APOC.Data.isArenaStage(K)) {
      APOC.Arena.enter(K);
      APOC.UI.toast('info', '割草关：坚持到时间结束，然后干掉 Boss');
    } else {
      APOC.Combat.enter(K);
    }
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    return true;
  };

  function wireEvents() {
    APOC.Bus.on('stage:clear', function (p) {
      APOC.Audio.play(p.arena ? 'arena_clear' : 'stage_clear', { gap: 0.5 });
      if (p.arena) {
        APOC.UI.toast('success', '割草关通过！区域已肃清');
      } else {
        APOC.UI.toast('success', '第 ' + p.stage + ' 关完成');
      }
      /* 解锁新场景时提示 */
      var scene = APOC.Data.sceneOfStage(p.stage + 1);
      if (scene && scene.stageFrom === p.stage + 1) {
        APOC.UI.toast('info', '进入新区域：' + scene.name);
      }
    });

    APOC.Bus.on('levelup', function () { APOC.Audio.play('levelup', { gap: 0.3 }); });

    /* UI 点击音：委托到 document，一处覆盖所有面板按钮 */
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest('button')) APOC.Audio.play('click', { gap: 0.03 });
    }, true);

    APOC.Bus.on('levelup', function (p) {
      if (APOC.State.data.settings.autoAlloc) {
        APOC.Stats.autoAllocate();
        APOC.UI.toast('success', '升到 ' + p.level + ' 级（属性点已自动分配）');
      } else {
        APOC.UI.toast('success', '升到 ' + p.level + ' 级，获得 3 点属性点');
      }
      APOC.UIEffects.shake(3, 0.15);
    });

    APOC.Bus.on('arena:boss', function () {
      APOC.UIEffects.shake(12, 0.5);
    });

    APOC.Bus.on('drop', function (p) {
      if (p.type !== 'item') return;
      var q = p.item.quality;
      if (q >= 3) {
        var name = APOC.Inventory.itemName(p.item);
        APOC.UI.toast(q === 4 ? 'warn' : 'success',
          '★ 掉落 ' + C.QUALITY_NAME[q] + '「' + name + '」', true);
      }
    });
  }

  /* 启动任何一步出错，都在屏幕上显示出来。
     静默失败最要命 —— 之前 Sprites 回调签名不匹配把整个 boot 打断，
     玩家只看到「怪物不见了」，控制台里的报错没人会去看。 */
  function fatal(e) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;' +
      'background:#7f1d1d;color:#fff;padding:14px 18px;font:13px/1.7 monospace;' +
      'white-space:pre-wrap;max-height:60%;overflow:auto';
    d.textContent = '游戏启动失败：' + (e && e.message ? e.message : e) +
      '\n\n' + (e && e.stack ? e.stack : '') +
      '\n\n把这段截图发我。按 Ctrl+F5 强制刷新有时也能解决。';
    document.body.appendChild(d);
  }

  function stamp() {
    var el = document.getElementById('build-stamp');
    var m = document.querySelector('meta[name="app-version"]');
    var v = m ? m.getAttribute('content') : '?';
    if (el) el.textContent = 'v' + v;
  }

  function boot() {
    try { bootInner(); } catch (e) { fatal(e); throw e; }
  }

  function bootInner() {
    stamp();
    APOC.State.init();
    APOC.HUD.init();
    APOC.Render.init(document.getElementById('game'));
    /* 贴图异步加载，加载到哪张用哪张；没加载出来的自动退回程序化绘制 */
    APOC.Sprites.init(function (p) {
      var info = p || APOC.Sprites.progressInfo();
      console.log('[Sprites] ' + info.loaded + '/' + info.total + ' 张素材已加载' +
                  (info.failed ? '（' + info.failed + ' 张失败）' : ''));
    });

    /* 音频文件层：按 assets/audio/manifest.js 建元素池。
       ★ 必须在 setVolume 之前建 —— setVolume 会遍历元素池同步音量，
       池子还没建的话那一次同步就是空转，BGM 会先按默认音量响一声。 */
    if (APOC.AudioAssets) APOC.AudioAssets.build();

    /* 恢复音量设置 */
    APOC.Audio.setVolume(APOC.State.data.settings.volume);
    APOC.Audio.setMuted(APOC.State.data.settings.muted);

    /* 浏览器要求音频必须由用户手势开启。第一次点击/按键时解锁，
       并把解锁前积压的提示音补播出来。 */
    var unlock = function () {
      APOC.Audio.unlock();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);

    /* 手机上：禁止画布区域的滚动与双指缩放手势（游戏不需要，误触会打乱布局） */
    var cv = document.getElementById('game');
    if (cv && cv.addEventListener) {
      cv.addEventListener('touchmove', function (e) {
        if (e.touches.length > 1) e.preventDefault();     // 双指缩放
      }, { passive: false });
      cv.addEventListener('gesturestart', function (e) { e.preventDefault(); });
      cv.addEventListener('dblclick', function (e) { e.preventDefault(); });
    }
    /* 双指缩放整页也禁掉（viewport 已声明，这里兜底旧浏览器） */
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    var pending = APOC.Offline.settle();
    wireEvents();

    APOC.enterStage(APOC.State.data.progress.stage || 1);
    APOC.Loop.start();

    /* 每 10 秒补一次落盘（双保险，正常由 markDirty 节流触发） */
    setInterval(function () { APOC.State.save(true); }, 10000);

    if (pending) {
      /* 稍等一下再弹，避免刚进页面就盖住一切 */
      setTimeout(function () { APOC.UI.showOffline(pending); }, 400);
    }

    if (!APOC.State.isStorageOK()) {
      setTimeout(function () {
        APOC.UI.toast('danger', '当前环境无法保存进度，请用本地服务器打开（见 README）', true);
      }, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.APOC = window.APOC || {});
