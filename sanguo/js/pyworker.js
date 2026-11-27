/* 浏览器内 Python 引擎（Pyodide）：承载战斗结算与每日内容 */
var pyodide = null;
var ready = null;
var BASE = new URL('../', self.location.href).href;

function progress(text) {
  self.postMessage({ type: 'progress', text: text });
}

async function boot() {
  progress('正在加载 Python 引擎（首次约 10–20 秒）…');
  var CDN = [
    'https://cdn.npmmirror.com/packages/pyodide/0.28.0/files/',
    'https://unpkg.com/pyodide@0.28.0/',
    'https://cdn.jsdelivr.net/pyodide/v0.28.0/full/'
  ];
  var lastErr = null;
  for (var c = 0; c < CDN.length && !pyodide; c++) {
    try {
      importScripts(CDN[c] + 'pyodide.js');
      pyodide = await loadPyodide({ indexURL: CDN[c] });
    } catch (err) {
      lastErr = err;
      pyodide = null;
    }
  }
  if (!pyodide) throw lastErr || new Error('Python 引擎加载失败');
  progress('正在下载战斗数据…');
  var files = [
    'py/engine/__init__.py', 'py/engine/core.py', 'py/engine/api.py',
    'py/pyapi.py', 'py/data.json', 'py/bio.json'
  ];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var r = await fetch(BASE + f + '?v=20261127content6');
    if (!r.ok) throw new Error('加载失败 ' + f + ' (' + r.status + ')');
    var buf = new Uint8Array(await r.arrayBuffer());
    var dst = '/home/pyodide/' + f;
    pyodide.FS.mkdirTree(dst.slice(0, dst.lastIndexOf('/')));
    pyodide.FS.writeFile(dst, buf);
  }
  progress('正在初始化战斗引擎…');
  pyodide.runPython([
    'import sys, os, time',
    "sys.path.insert(0, '/home/pyodide/py')",
    "os.environ['TZ'] = 'CST-8'",
    'try:',
    '    time.tzset()',
    'except Exception:',
    '    pass',
    'import pyapi',
    'from pyapi import handle_json'
  ].join('\n'));
  progress('');
}

self.onmessage = async function (e) {
  var d = e.data;
  var id = d.id;
  try {
    if (!ready) ready = boot();
    await ready;
    var fn = pyodide.globals.get('handle_json');
    var out = fn(d.path, JSON.stringify(d.query || {}), JSON.stringify(d.body || {}));
    var res = JSON.parse(out);
    self.postMessage({ id: id, status: res.status, json: res.json });
  } catch (err) {
    self.postMessage({ id: id, error: String((err && err.message) || err) });
  }
};
