/* 静态版资源路径映射：把服务端路由换成 assets/ 下的静态文件 */
(function () {
  function enc(n) { return encodeURIComponent(n); }
  window.SG_IMG = {
    card: function (n) { return 'assets/card/' + enc(n) + '.webp'; },
    portrait: function (n) { return 'assets/portrait/' + enc(n) + '.webp'; },
    thumb: function (n) { return 'assets/thumb/' + enc(n) + '.jpg'; },
    pthumb: function (n) { return 'assets/pthumb/' + enc(n) + '.jpg'; }
  };
})();
