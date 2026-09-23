/* toast.js — 右下角提示气泡（最多 5 条） */
(function (APOC) {
  'use strict';

  var wrap = null;
  var MAX = 5;

  function ensure() {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toasts';
      document.getElementById('main').appendChild(wrap);
    }
    return wrap;
  }

  function push(type, text, shake) {
    var box = ensure();
    while (box.children.length >= MAX) box.removeChild(box.firstChild);

    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info') + (shake ? ' shake' : '');
    el.textContent = text;
    box.appendChild(el);

    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 3000);
  }

  APOC.UI = APOC.UI || {};
  APOC.UI.toast = push;

  APOC.Bus.on('toast', function (p) { push(p.type, p.text, p.shake); });
})(window.APOC = window.APOC || {});
