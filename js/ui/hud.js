/* hud.js — 顶部状态条 / 底部按钮条 / 面板管理器 */
(function (APOC) {
  'use strict';

  var F = APOC.Formula;
  var el = {};
  var cache = {};
  var overlay = null;

  function $(id) { return document.getElementById(id); }

  function setText(node, key, val) {
    if (cache[key] === val) return;
    cache[key] = val;
    node.textContent = val;
  }
  function setHTML(node, key, val) {
    if (cache[key] === val) return;
    cache[key] = val;
    node.innerHTML = val;
  }
  function setWidth(node, key, pct) {
    pct = Math.max(0, Math.min(100, pct));
    var s = pct.toFixed(1) + '%';
    if (cache[key] === s) return;
    cache[key] = s;
    node.style.width = s;
  }

  /* ---------------- 面板管理 ---------------- */
  var panels = {};
  var current = null;

  function registerPanel(name, api) {
    panels[name] = api;
  }
  function openPanel(name) {
    if (current === name) { closePanel(); return; }
    closePanel();
    var p = panels[name];
    if (!p) return;
    p.mount();
    p.el.hidden = false;
    p.open && p.open();
    current = name;
    document.body.classList.add('panel-open');
    Array.prototype.forEach.call(document.querySelectorAll('#rail button'), function (b) {
      b.classList.toggle('active', b.dataset.panel === name);
    });
  }
  function closePanel() {
    if (!current) return;
    var p = panels[current];
    if (p) { p.close && p.close(); p.el.hidden = true; }
    current = null;
    document.body.classList.remove('panel-open');
    Array.prototype.forEach.call(document.querySelectorAll('#rail button'), function (b) {
      b.classList.remove('active');
    });
  }

  /* 通用面板外壳 */
  function makeShell(title) {
    var d = document.createElement('div');
    d.className = 'panel';
    d.hidden = true;
    d.innerHTML =
      '<div class="panel-head"><h2>' + title + '</h2>' +
      '<button class="panel-close">✕</button></div>' +
      '<div class="panel-body"></div>';
    d.querySelector('.panel-close').addEventListener('click', closePanel);
    return d;
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    overlay = document.getElementById('overlay');

    el.stage = $('tb-stage');
    el.power = $('tb-power');
    el.hpFill = $('tb-hp-fill');
    el.hpText = $('tb-hp-text');
    el.hpBar = el.hpFill.parentNode;
    el.expFill = $('tb-exp-fill');
    el.expText = $('tb-exp-text');
    el.gold = $('tb-gold');
    el.matA = $('tb-mat-a');
    el.matB = $('tb-mat-b');
    el.badge = $('badge-bag');
    el.stamp = $('build-stamp');
    var mv = document.querySelector('meta[name="app-version"]');
    cache.ver = mv ? mv.getAttribute('content') : '?';
    /* 帧率（每 0.5 秒算一次，避免数字乱跳） */
    cache.fps = 0; cache._f = 0; cache._t = 0;
    setInterval(function () {
      var now = Date.now();
      if (!cache._t) { cache._t = now; cache._f = 0; return; }
      var dt = (now - cache._t) / 1000;
      if (dt >= 0.5) {
        cache.fps = Math.round(cache._f / dt);
        cache._f = 0; cache._t = now;
      }
    }, 100);

    Array.prototype.forEach.call(document.querySelectorAll('#rail button'), function (b) {
      b.addEventListener('click', function () { openPanel(b.dataset.panel); });
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closePanel(); APOC.UIEffects.hideTip(); }
    });
  }

  /* ---------------- 每帧刷新（带变更检测） ---------------- */
  function update() {
    var D = APOC.State.data;
    if (!D || !el.stage) return;
    cache._f = (cache._f || 0) + 1;
    var s = APOC.Stats.final();

    /* 关卡 */
    var scene = APOC.Data.sceneOfStage(D.progress.stage);
    var inScene = scene ? (D.progress.stage - scene.stageFrom + 1) : D.progress.stage;
    var stageTxt = (scene ? scene.name : '未知') + ' ' + inScene + '-' + D.progress.stage;
    if (APOC.Arena.isActive()) stageTxt += ' · 割草';
    /* 非普通难度必须一直挂在关卡名上 —— 切档会归零进度，
       玩家忘了自己在噩梦档、只看到"怪怎么突然这么硬"，是最容易劝退的一种体验。 */
    if (APOC.World && !APOC.World.isNormal()) stageTxt += ' · ' + APOC.World.name();
    setText(el.stage, 'stage', stageTxt);

    setText(el.power, 'power', F.fmt(s.bp));

    /* 血条 */
    var st = APOC.Combat.state;
    var hp = st && st.player ? st.player.hp : s.hp;
    var maxHp = st && st.player ? st.player.maxHp : s.hp;
    setWidth(el.hpFill, 'hpFill', hp / maxHp * 100);
    setText(el.hpText, 'hpText', F.fmt(Math.max(0, hp)) + ' / ' + F.fmt(maxHp));
    var low = hp / maxHp < 0.3;
    if (cache.low !== low) { cache.low = low; el.hpBar.classList.toggle('low', low); }

    /* 经验 */
    var p = D.player;
    var need = F.expNeed(p.level);
    setWidth(el.expFill, 'expFill', p.level >= APOC.Config.MAX_LEVEL ? 100 : (p.exp / need * 100));
    setText(el.expText, 'expText', 'Lv.' + p.level +
      (D.player.freePoints > 0 ? '（+' + D.player.freePoints + '）' : ''));

    /* 资源 */
    setText(el.gold, 'gold', F.fmt(p.gold));
    if (scene) {
      var mats = APOC.Data.materialsOfScene(scene.id);
      var m0 = mats[0], m1 = mats[1];
      if (m0) setHTML(el.matA, 'matA',
        APOC.Sprites.iconTag('mat', m0.id, 20, m0.icon) + ' ' + F.fmt(APOC.Inventory.countMaterial(m0.id)));
      if (m1) setHTML(el.matB, 'matB',
        APOC.Sprites.iconTag('mat', m1.id, 20, m1.icon) + ' ' + F.fmt(APOC.Inventory.countMaterial(m1.id)));
    }

    /* 构建水印：把诊断信息直接摆在屏幕上。
       我这边看不到玩家的画面，这行字就是我的眼睛 ——
       「图0/82」= 贴图没加载，「敌0」= 没刷怪，「v5」= 浏览器还在跑旧代码。 */
    if (el.stamp) {
      var st2 = APOC.Combat.state;
      var ne = (st2 && st2.enemies) ? st2.enemies.length : 0;
      var sp = APOC.Sprites.progressInfo();
      var fps = cache.fps || 0;
      var txt = 'v' + (cache.ver || '?') + ' · 图' + sp.loaded + '/' + sp.total +
                (sp.failed ? '(失败' + sp.failed + ')' : '') +
                ' · 敌' + ne + ' · ' + fps + 'fps';
      setText(el.stamp, 'stamp', txt);
    }

    /* 背包红点 */
    var newCount = 0;
    for (var i = 0; i < D.bag.length; i++) {
      if (D.bag[i].quality >= 2 && !APOC.Inventory.isEquipped(D.bag[i])) newCount++;
    }
    if (cache.badge !== newCount) {
      cache.badge = newCount;
      el.badge.hidden = newCount === 0;
      el.badge.textContent = newCount;
    }
  }

  APOC.HUD = { init: init, update: update };
  APOC.UI = APOC.UI || {};
  APOC.UI.registerPanel = registerPanel;
  APOC.UI.openPanel = openPanel;
  APOC.UI.closePanel = closePanel;
  APOC.UI.makeShell = makeShell;
  APOC.UI.overlay = function () { return overlay; };
  APOC.UI.currentPanel = function () { return current; };
})(window.APOC = window.APOC || {});
