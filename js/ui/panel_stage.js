/* panel_stage.js — 关卡选择（按场景分行） */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula;
  var el = null, body = null;

  function mount() {
    if (el) return;
    el = APOC.UI.makeShell('关卡选择');
    body = el.querySelector('.panel-body');
    APOC.UI.overlay().appendChild(el);

    body.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-stage]') : null;
      if (!t || t.disabled) return;
      var K = parseInt(t.dataset.stage, 10);
      APOC.UI.closePanel();
      APOC.enterStage(K);
    });
  }

  function refresh() {
    if (!el || el.hidden) return;
    var D = APOC.State.data;
    var cur = D.progress.stage;
    var max = D.progress.maxStage;

    var html = '';
    APOC.Data.playableScenes().forEach(function (scene) {
      html += '<div class="scene-block">';
      html += '<h3>' + scene.name +
        '<small>' + scene.stageFrom + ' ~ ' + scene.stageTo + ' 关 · ' + scene.desc + '</small></h3>';
      html += '<div class="stage-grid">';
      for (var K = scene.stageFrom; K <= Math.min(scene.stageTo, C.MAX_STAGE); K++) {
        var unlocked = K <= max;
        var cls = 'stage-btn';
        if (APOC.Data.isArenaStage(K)) cls += ' boss';
        if (D.progress.cleared[K]) cls += ' cleared';
        if (K === cur) cls += ' current';
        if (!unlocked) cls += ' locked';
        html += '<button class="' + cls + '" data-stage="' + K + '"' +
                (unlocked ? '' : ' disabled') + '>' + K + '</button>';
      }
      html += '</div></div>';
    });

    var sec = Math.floor(D.playTimeMs / 1000);
    html += '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);' +
            'color:var(--text-sub);font-size:12px;line-height:1.9">' +
            '总击杀：' + F.fmt(D.stats.totalKills) +
            '　阵亡：' + D.stats.totalDeaths +
            '　累计金币：' + F.fmt(D.stats.totalGoldEarned) + '<br>' +
            '游戏时长：' + Math.floor(sec / 3600) + ' 小时 ' + Math.floor(sec % 3600 / 60) + ' 分' +
            '</div>';

    body.innerHTML = html;
  }

  APOC.UI.registerPanel('stage', {
    get el() { return el; },
    mount: mount,
    open: refresh,
    close: null
  });

  APOC.Bus.on('stage:clear', function () { if (el && !el.hidden) refresh(); });
})(window.APOC = window.APOC || {});
