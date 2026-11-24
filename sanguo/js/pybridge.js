/* 静态版请求桥：确定性内容走静态 JSON，战斗与每日内容走浏览器内 Python */
(function () {
  var STATIC = {
    '/api/units': 'data/units.json',
    '/api/levels': 'data/levels.json',
    '/api/bonds': 'data/bonds.json',
    '/api/dungeons': 'data/dungeons.json',
    '/api/secret': 'data/secret.json',
    '/api/ancient': 'data/ancient.json'
  };
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  var cache = {};

  function abs(p) { return new URL(p, document.baseURI).href; }
  function loadJson(p) {
    if (!cache[p]) cache[p] = origFetch(abs(p)).then(function (r) { return r.json(); });
    return cache[p];
  }
  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  function localDate() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* ---------- Python worker ---------- */
  var worker = null, seq = 0, pending = {}, bootError = null;
  function startWorker() {
    if (worker) return worker;
    worker = new Worker('js/pyworker.js');
    worker.onmessage = function (e) {
      var d = e.data;
      if (d.type === 'progress') { showLoad(d.text); return; }
      var p = pending[d.id];
      if (!p) return;
      delete pending[d.id];
      if (d.error) p.reject(new Error(d.error));
      else p.resolve(d);
    };
    worker.onerror = function (e) {
      bootError = (e && e.message) || '引擎加载失败';
      Object.keys(pending).forEach(function (k) {
        pending[k].reject(new Error(bootError));
        delete pending[k];
      });
    };
    return worker;
  }
  function callPy(path, query, body) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      startWorker().postMessage({ id: id, path: path, query: query, body: body });
    }).then(function (d) { return jsonResponse(d.json, d.status); });
  }
  function warmup() { try { startWorker(); } catch (e) { /* ignore */ } }

  /* ---------- 加载提示 ---------- */
  var loadEl = null;
  function showLoad(text) {
    if (!text) { if (loadEl) loadEl.hidden = true; return; }
    if (!loadEl) {
      loadEl = document.createElement('div');
      loadEl.id = 'pyLoad';
      loadEl.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);' +
        'background:rgba(22,17,10,.94);color:#e9d9ae;border:1px solid rgba(200,170,90,.55);' +
        'border-radius:10px;padding:10px 18px;z-index:400;font:13px/1.5 system-ui,sans-serif;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:86vw;text-align:center';
      document.body.appendChild(loadEl);
    }
    loadEl.textContent = text;
    loadEl.hidden = false;
  }
  window.SG_PY_PROGRESS = showLoad;

  /* ---------- fetch 拦截 ---------- */
  window.fetch = function (input, init) {
    try {
      var raw = (typeof input === 'string') ? input : (input && input.url);
      if (!raw) return origFetch(input, init);
      var u = new URL(raw, location.href);
      var idx = u.pathname.indexOf('/api/');
      if (idx < 0) return origFetch(input, init);
      var key = u.pathname.slice(idx);
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var body = null;
      if (init && init.body) { try { body = JSON.parse(init.body); } catch (e) { body = null; } }

      if (key === '/api/ping') return Promise.resolve(new Response('ok'));

      if (method === 'GET' && STATIC[key]) return loadJson(STATIC[key]).then(jsonResponse);

      if (method === 'GET' && key === '/api/trials') {
        return loadJson('data/calendar.json').then(function (cal) {
          var d = cal.trials[localDate()];
          if (d) return jsonResponse(d);
          return callPy('/api/trials', {}, null);
        });
      }
      if (method === 'GET' && key === '/api/worldboss') {
        return loadJson('data/calendar.json').then(function (cal) {
          var d = cal.worldboss[localDate()];
          if (d) return jsonResponse(d);
          return callPy('/api/worldboss', {}, null);
        });
      }
      if (method === 'GET' && key === '/api/tower') {
        var qs = u.searchParams;
        var from = parseInt(qs.get('from') || qs.get('floor') || '1', 10) || 1;
        var count = parseInt(qs.get('count') || '200', 10) || 200;
        return loadJson('data/tower.json').then(function (floors) {
          var out = floors.slice(from - 1, from - 1 + count);
          if (out.length > 0) return jsonResponse(out);
          return callPy('/api/tower', { from: [String(from)], count: [String(count)] }, null);
        });
      }

      /* 其余（战斗相关）交给浏览器内 Python */
      showLoad('首次开战需要加载战斗引擎…');
      var q = {};
      u.searchParams.forEach(function (v, k) { q[k] = [v]; });
      return callPy(key, q, body).then(function (r) { showLoad(''); return r; },
        function (err) { showLoad(''); throw err; });
    } catch (e) {
      return origFetch(input, init);
    }
  };

  /* 用户第一次交互后预热引擎，等真正开战时基本已就绪 */
  var warmed = false;
  function warmOnce() {
    if (warmed) return;
    warmed = true;
    setTimeout(warmup, 800);
  }
  window.addEventListener('pointerdown', warmOnce, { once: true });
  window.addEventListener('keydown', warmOnce, { once: true });
})();
