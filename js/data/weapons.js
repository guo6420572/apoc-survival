/* weapons.js — 武器表（3 线 × 7 把 = 21 把）
   武器 ATK = wBase × POW(K_ref) × (1 + 0.35 × (lv - 1))
   behavior: single | multi | pierce | splash | chain  */
(function (APOC) {
  'use strict';

  /* decay：多目标衰减；pierceN/chainN/targets：命中数；splashR/splashMul：溅射 */
  var W = {
    /* ---------------- 枪械 gun ---------------- */
    gun_1: { id:'gun_1', pose:'pistol', line:'gun', layer:1, name:'生锈手枪', icon:'🔫', wBase:8.0,
             range:320, aspd:1.2, coef:1.00, behavior:'single' },
    gun_2: { id:'gun_2', pose:'pistol', line:'gun', layer:2, name:'双持手枪', icon:'🔫', wBase:6.0,
             range:300, aspd:2.0, coef:0.70, behavior:'multi', targets:2 },
    gun_3: { id:'gun_3', pose:'pistol', line:'gun', layer:3, name:'冲锋枪', icon:'🔫', wBase:4.0,
             range:260, aspd:4.0, coef:0.45, behavior:'single' },
    gun_4: { id:'gun_4', pose:'rifle', line:'gun', layer:4, name:'霰弹枪', icon:'💥', wBase:3.0,
             range:180, aspd:1.0, coef:1.60, behavior:'multi', targets:3 },
    gun_5: { id:'gun_5', pose:'rifle', line:'gun', layer:5, name:'突击步枪', icon:'🔫', wBase:2.5,
             range:340, aspd:3.0, coef:0.80, behavior:'pierce', pierceN:2, decay:0.20 },
    gun_6: { id:'gun_6', pose:'rifle', line:'gun', layer:6, name:'狙击枪', icon:'🎯', wBase:2.0,
             range:600, aspd:0.7, coef:3.50, behavior:'pierce', pierceN:3, decay:0.20,
             bonus:{ crit:15 } },
    gun_7: { id:'gun_7', pose:'rifle', line:'gun', layer:7, name:'电磁轨道炮', icon:'⚡', wBase:1.6,
             range:700, aspd:0.5, coef:6.00, behavior:'pierce', pierceN:99, decay:0.15 },

    /* ---------------- 体术 body ---------------- */
    body_1: { id:'body_1', pose:'melee', line:'body', layer:1, name:'战斗拳套', icon:'🥊', wBase:9.0,
              range:60, aspd:1.5, coef:1.00, behavior:'single' },
    body_2: { id:'body_2', pose:'melee', line:'body', layer:2, name:'军用匕首', icon:'🗡️', wBase:6.5,
              range:65, aspd:2.2, coef:0.80, behavior:'single', bonus:{ crit:10 } },
    body_3: { id:'body_3', pose:'melee', line:'body', layer:3, name:'加固铁管', icon:'🏏', wBase:4.5,
              range:80, aspd:1.3, coef:1.40, behavior:'splash', splashR:70, splashMul:0.60 },
    body_4: { id:'body_4', pose:'melee', line:'body', layer:4, name:'消防斧', icon:'🪓', wBase:3.4,
              range:85, aspd:1.0, coef:1.90, behavior:'splash', splashR:90, splashMul:0.60,
              rend:0.20 },
    body_5: { id:'body_5', pose:'melee', line:'body', layer:5, name:'链锯剑', icon:'🪚', wBase:2.8,
              range:90, aspd:2.5, coef:0.90, behavior:'single', bleed:0.40 },
    body_6: { id:'body_6', pose:'melee', line:'body', layer:6, name:'动力拳套', icon:'🤜', wBase:2.3,
              range:75, aspd:1.8, coef:1.60, behavior:'multi', targets:2, knockback:60 },
    body_7: { id:'body_7', pose:'melee', line:'body', layer:7, name:'等离子巨锤', icon:'🔨', wBase:1.8,
              range:110, aspd:0.8, coef:4.00, behavior:'splash', splashR:150, splashMul:0.80,
              knockback:100 },

    /* ---------------- 异能 psi ---------------- */
    psi_1: { id:'psi_1', pose:'psi', line:'psi', layer:1, name:'念力弹', icon:'🔮', wBase:7.5,
             range:300, aspd:1.0, coef:1.20, behavior:'single' },
    psi_2: { id:'psi_2', pose:'psi', line:'psi', layer:2, name:'心灵震爆', icon:'🧠', wBase:5.5,
             range:240, aspd:0.9, coef:1.50, behavior:'splash', splashR:100, splashMul:0.70 },
    psi_3: { id:'psi_3', pose:'psi', line:'psi', layer:3, name:'燃烧之手', icon:'🔥', wBase:3.8,
             range:200, aspd:1.1, coef:1.10, behavior:'splash', splashR:80, splashMul:0.70,
             burn:0.25 },
    psi_4: { id:'psi_4', pose:'psi', line:'psi', layer:4, name:'连锁闪电', icon:'⚡', wBase:2.8,
             range:280, aspd:1.3, coef:1.00, behavior:'chain', chainN:3, chainDecay:0.75 },
    psi_5: { id:'psi_5', pose:'psi', line:'psi', layer:5, name:'冰霜新星', icon:'❄️', wBase:2.3,
             range:180, aspd:0.8, coef:1.80, behavior:'splash', splashR:130, splashMul:0.70,
             freezeChance:0.25 },
    psi_6: { id:'psi_6', pose:'psi', line:'psi', layer:6, name:'湮灭射线', icon:'☄️', wBase:1.9,
             range:400, aspd:0.9, coef:2.60, behavior:'pierce', pierceN:99, decay:0 },
    psi_7: { id:'psi_7', pose:'psi', line:'psi', layer:7, name:'奇点坍缩', icon:'🌀', wBase:1.5,
             range:260, aspd:0.6, coef:5.00, behavior:'splash', splashR:180, splashMul:1.00,
             pull:200 }
  };

  /* 各层对应的 K_ref（用于武器强度与科技树消耗的缩放锚点） */
  var K_REF = { 1: 1, 2: 15, 3: 30, 4: 45, 5: 60, 6: 78, 7: 95 };

  APOC.Data.Weapons = W;
  APOC.Data.WeaponKRef = K_REF;
  APOC.Data.weaponsOfLine = function (line) {
    return Object.keys(W).filter(function (k) { return W[k].line === line; })
      .map(function (k) { return W[k]; })
      .sort(function (a, b) { return a.layer - b.layer; });
  };
})(window.APOC = window.APOC || {});
