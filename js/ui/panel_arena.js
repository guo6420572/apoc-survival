/* panel_arena.js — 弹窗层：割草三选一 + 离线收益 */
(function (APOC) {
  'use strict';

  var F = APOC.Formula;
  var perkMask = null, perkTimer = null, perkRemain = 0;
  var offlineMask = null;

  /* ---------------- 三选一 ---------------- */
  function ensurePerkMask() {
    if (perkMask) return perkMask;
    perkMask = document.createElement('div');
    perkMask.className = 'modal-mask';
    perkMask.hidden = true;
    perkMask.innerHTML =
      '<div class="perk-modal">' +
      '  <h3>选择强化 <span class="timer">10</span></h3>' +
      '  <div class="perk-list"></div>' +
      '</div>';
    document.getElementById('modal-layer').appendChild(perkMask);

    perkMask.addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('[data-perk]') : null;
      if (!card) return;
      pick(card.dataset.perk);
    });
    return perkMask;
  }

  function pick(id) {
    if (perkMask.hidden) return;
    APOC.Arena.choosePerk(id);
    hidePerk();
  }

  function showPerk(payload) {
    var m = ensurePerkMask();
    var list = m.querySelector('.perk-list');
    list.innerHTML = payload.options.map(function (p, i) {
      return '<button class="perk-card ' + p.rarity + '" data-perk="' + p.id + '">' +
        '<span class="perk-icon">' + APOC.Sprites.iconTag('perk', p.id, 64, p.icon) + '</span>' +
        '<span class="perk-name">' + p.name + '</span>' +
        '<span class="perk-desc">' + p.desc + '</span>' +
        '<span class="key">按 ' + (i + 1) + ' 选择</span>' +
        '</button>';
    }).join('');
    m.hidden = false;
    perkRemain = payload.seconds;

    var t = m.querySelector('.timer');
    t.textContent = Math.ceil(perkRemain);
    t.classList.remove('urgent');

    if (perkTimer) clearInterval(perkTimer);
    perkTimer = setInterval(function () {
      perkRemain -= 1;
      if (perkRemain < 0) perkRemain = 0;
      t.textContent = Math.ceil(perkRemain);
      t.classList.toggle('urgent', perkRemain <= 3);
      if (perkRemain <= 0) hidePerk();
    }, 1000);
  }

  function hidePerk() {
    if (perkMask) perkMask.hidden = true;
    if (perkTimer) { clearInterval(perkTimer); perkTimer = null; }
  }

  document.addEventListener('keydown', function (ev) {
    if (!perkMask || perkMask.hidden) return;
    var i = ['1', '2', '3'].indexOf(ev.key);
    if (i < 0) return;
    var cards = perkMask.querySelectorAll('[data-perk]');
    if (cards[i]) pick(cards[i].dataset.perk);
  });

  APOC.Bus.on('arena:perk', showPerk);
  APOC.Bus.on('arena:perkChosen', hidePerk);
  APOC.Bus.on('arena:clear', hidePerk);
  APOC.Bus.on('arena:fail', hidePerk);

  /* ---------------- 离线收益 ---------------- */
  function showOffline(p) {
    if (!offlineMask) {
      offlineMask = document.createElement('div');
      offlineMask.className = 'modal-mask';
      document.getElementById('modal-layer').appendChild(offlineMask);
    }
    var mins = Math.floor(p.awaySec / 60);
    var hrs = Math.floor(mins / 60);
    var durTxt = hrs > 0 ? (hrs + ' 小时 ' + (mins % 60) + ' 分钟') : (mins + ' 分钟');

    var lines = '';
    lines += line('💰 金币', '+' + F.fmt(p.gold));
    lines += line('✨ 经验', '+' + F.fmt(p.exp));
    Object.keys(p.mats).forEach(function (mid) {
      var m = APOC.Data.Materials[mid];
      if (m && p.mats[mid]) {
        lines += line(APOC.Sprites.iconTag('mat', mid, 20, m.icon) + ' ' + m.name, '+' + F.fmt(p.mats[mid]));
      }
    });
    if (p.itemN > 0) lines += line('🎒 装备', '+' + p.itemN + ' 件');

    offlineMask.innerHTML =
      '<div class="offline-modal">' +
      '  <h3>欢迎回来</h3>' +
      '  <div class="sub">你离开了 ' + durTxt +
      (p.capped ? '，按 8 小时上限结算' : '') + '</div>' +
      lines +
      '  <button>领 取</button>' +
      '</div>';
    offlineMask.querySelector('button').addEventListener('click', function () {
      APOC.Offline.claim();
      offlineMask.hidden = true;
      APOC.UI.toast('success', '离线收益已到账');
    });
    offlineMask.hidden = false;
  }

  function line(k, v) {
    return '<div class="line"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  APOC.UI.showOffline = showOffline;
})(window.APOC = window.APOC || {});
