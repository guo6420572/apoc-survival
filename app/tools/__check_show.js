/* 校验：200 将档案中的所有音色层/形态是否都已在引擎中实现 */
global.window = {};
require('G:/桌面/个人文件/项目/三国将星录/正式版/web/hero_show_data.js');
const fs = require('fs');
const src = fs.readFileSync('G:/桌面/个人文件/项目/三国将星录/正式版/web/hero_show.js', 'utf8');

const layerBlock = src.slice(src.indexOf('var LAYER = {'), src.indexOf('function playProfile'));
const layerKeys = [...layerBlock.matchAll(/^\s{4}([a-z_]+):\s*function/gm)].map(m => m[1]);
const formBlock = src.slice(src.indexOf('var FORM = {'), src.indexOf('function hitBurst'));
const formKeys = [...formBlock.matchAll(/([a-z]+):\s*form[A-Z]/g)].map(m => m[1]);

const H = global.window.HERO_SHOW;
let missingLayer = [], missingForm = [], emptySkill = [];
for (const name of Object.keys(H)) {
  const p = H[name];
  (p.layers || []).forEach(l => { if (!layerKeys.includes(l)) missingLayer.push(name + ':' + l); });
  if (!formKeys.includes(p.form)) missingForm.push(name + ':' + p.form);
  if (!p.kw) emptySkill.push(name);
}
console.log('layers defined', layerKeys.length, layerKeys.join(','));
console.log('forms defined', formKeys.length, formKeys.join(','));
console.log('missing layers', missingLayer.length, missingLayer.slice(0, 6).join(' '));
console.log('missing forms', missingForm.length, missingForm.slice(0, 6).join(' '));
console.log('no-skill', emptySkill.length, emptySkill.join(','));
