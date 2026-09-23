/* loop.js — 主循环：逻辑每帧跑（dt 上限 50ms），渲染每帧一次
   说明：文档里写的是固定 100ms 逻辑步长，实测那样会让怪物移动有 6px 级别的
   台阶感。这里改用变步长（clamp 到 50ms），手感明显更好，CPU 开销可忽略。 */
(function (APOC) {
  'use strict';

  var running = false;
  var last = 0;
  var C = APOC.Config ? APOC.Config : {};

  /* 同一处错误只在控制台报一次，避免每帧刷屏 */
  var reported = {};
  function reportOnce(where, e) {
    if (reported[where]) return;
    reported[where] = true;
    console.error('[' + where + '] 出错（只报一次）：', e);
  }

  function stepLogic(dt) {
    var D = APOC.State.data;
    if (!D) return;
    D.playTimeMs += dt * 1000;

    /* 用 state 是否存在来判断，而不是 isActive()：Arena 结束后要先让它的
       tick 跑一次做清理（释放借用的战场状态），isActive() 那时已经是 false 了 */
    if (APOC.Arena.state) APOC.Arena.tick(dt);
    else APOC.Combat.tick(dt);

    APOC.Audio && APOC.Audio.tick && APOC.Audio.tick(dt);
  }

  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;          // 卡顿保护
    if (dt < 0) dt = 0;

    if (!document.hidden) {
      /* ★ 每一步单独 try —— 任何一处抛异常都不能让 rAF 链条断掉。
         曾经 render 里一个 undefined 就让整个游戏永久冻结，
         而玩家看到的只是"卡住了"，根本不知道发生了什么。 */
      try { stepLogic(dt); } catch (e) { reportOnce('logic', e); }
      try { APOC.Render.draw(dt); } catch (e) { reportOnce('render', e); }
      try { APOC.HUD.update(); } catch (e) { reportOnce('hud', e); }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- 离开页面 → 回来补帧 ----------------
     ★ 不能靠 setInterval 兜底：浏览器会把后台标签页的定时器降频到
     1 次/分钟甚至冻结，真机上等于没挂机（切出去一小时回来，游戏还在原地）。
     所以改成记时间戳，回来时把离开的这段**补跑**一遍。
     补跑是同步循环，用固定真实时间预算兜住，超了就补到哪算哪，不卡界面。 */
  var hiddenAt = 0;
  var bgTimer = null;
  var bgAdvanced = 0;      // 后台定时器已经推进过的游戏秒数（避免和补帧重复计时）

  /* 后台心跳：浏览器会把这个定时器降频（1 次/秒甚至 1 次/分钟），
     所以它**不是主力**，只当兜底 —— 真正把进度追回来的是回来时的 catchUp。
     记录 bgAdvanced 是为了补帧时扣掉这部分，不然会算两遍。 */
  function startBg() {
    if (bgTimer) return;
    bgAdvanced = 0;
    var lastT = Date.now();
    bgTimer = setInterval(function () {
      var now = Date.now();
      var dt = Math.min(1, (now - lastT) / 1000);      // 单次最多补 1 秒
      lastT = now;
      if (dt <= 0) return;
      try { stepLogic(dt); } catch (e) { reportOnce('bg', e); }
      bgAdvanced += dt;
    }, 250);
  }
  function stopBg() {
    if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  }

  function catchUp(seconds) {
    var cap = C.AWAY_CAP_SEC;
    var remain = Math.min(seconds, cap);
    var total = remain;
    var nowFn = (typeof performance !== 'undefined' && performance.now)
      ? function () { return performance.now(); } : function () { return Date.now(); };
    var t0 = nowFn(), DT = 0.1;
    while (remain > 1e-6) {
      var step = Math.min(DT, remain);
      try { stepLogic(step); } catch (e) { reportOnce('catchup', e); }
      remain -= step;
      if (nowFn() - t0 > C.AWAY_BUDGET_MS) break;      // 预算用完，补到哪算哪
    }
    return total - remain;                              // 实际补上的游戏秒数
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenAt = Date.now();
      startBg();
      APOC.State.save(true);
      return;
    }
    stopBg();
    last = 0;                                  // 让 rAF 重新计时，别把离开的时间算成一帧
    if (!hiddenAt) return;
    var away = (Date.now() - hiddenAt) / 1000;
    var rest = away - bgAdvanced;              // 后台心跳已经推进过的不再补
    hiddenAt = 0;
    bgAdvanced = 0;
    if (away < C.AWAY_MIN_SEC || rest <= 0) return;
    var done = catchUp(rest);
    APOC.Bus.emit('away:catchup', { away: away, done: done + (away - rest) });
    var line = '离开 ' + Math.round(away / 60) + ' 分钟，进度已补上';
    if (done + 1 < rest) line += '（剩余 ' + Math.round((rest - done) / 60) + ' 分钟未补完）';
    APOC.Bus.emit('toast', { type: 'info', text: line });
  });

  APOC.Loop = {
    start: function () {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    },
    stop: function () { running = false; stopBg(); },
    catchUp: function (sec) { return catchUp(sec); },
    /* 测试用：把"离开时刻"往前拨，好在不真等 5 分钟的情况下验证补帧 */
    __setHiddenAt: function (t) { hiddenAt = t; },
    isRunning: function () { return running; }
  };
})(window.APOC = window.APOC || {});
