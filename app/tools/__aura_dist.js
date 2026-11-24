global.window = {};
require('../web/hero_show_data.js');
var D = global.window.HERO_SHOW;
var cnt = {}, sample = {};
Object.keys(D).forEach(function (n) {
  var d = D[n];
  if (d.form !== 'aura') return;
  cnt[d.var] = (cnt[d.var] || 0) + 1;
  if (!sample[d.var]) sample[d.var] = [];
  if (sample[d.var].length < 6) sample[d.var].push(n + '(' + d.f + '/' + d.r + ')');
});
console.log('aura total=' + Object.keys(D).filter(function (n) { return D[n].form === 'aura'; }).length);
Object.keys(cnt).sort().forEach(function (v) {
  console.log('var' + v + ' n=' + cnt[v] + ' : ' + sample[v].join(' '));
});
