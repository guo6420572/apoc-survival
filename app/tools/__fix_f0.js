/* 一次性数据修补：消除 200 将基频重复，保证逐将音高唯一 */
const fs = require('fs');
const p = 'G:/桌面/个人文件/项目/三国将星录/正式版/web/hero_show_data.js';
const txt = fs.readFileSync(p, 'utf8');
const bodyText = txt.slice(txt.indexOf('{'), txt.lastIndexOf('};') + 1);
const o = JSON.parse(bodyText);
const used = new Set();
const groups = {};
for (const k of Object.keys(o)) (groups[o[k].f0] = groups[o[k].f0] || []).push(k);
for (const k of Object.keys(o)) if (groups[o[k].f0].length === 1) used.add(+(+o[k].f0).toFixed(1));
let moved = 0;
for (const f of Object.keys(groups)) {
  const ks = groups[f];
  used.add(+(+f).toFixed(1));
  ks.slice(1).forEach((k, i) => {
    let nf = +f + (i + 1) * 0.9;
    while (used.has(+nf.toFixed(1))) nf += 0.9;
    nf = +nf.toFixed(1);
    used.add(nf);
    o[k].f0 = nf;
    moved++;
  });
}
fs.writeFileSync(p.replace('hero_show_data.js', 'hero_show_data.bak.js'), txt, 'utf8');
fs.writeFileSync(p, 'window.HERO_SHOW = ' + JSON.stringify(o, null, 1) + ';\n', 'utf8');
const f0set = new Set(Object.keys(o).map(k => o[k].f0));
console.log('adjusted', moved, 'unique_f0', f0set.size, 'n', Object.keys(o).length);
