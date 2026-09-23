/* effects.js — 屏幕震动 / 粒子 / Tooltip */
(function (APOC) {
  'use strict';

  var shakeAmt = 0, shakeTime = 0;
  var particles = [];
  var rings = [];
  var MAX_P = 260;

  /* ---------------- 贴图特效实例层 ----------------
     39 张 VFX 贴图（assets/fx/）跑在这上面。一条实例 = 一张贴图 + 一段生命周期，
     期间对「尺寸 / 旋转 / 透明度」做插值 —— 起点终点全是显式给的，
     所以同一个 id 既能画成"炸开并放大淡出"的爆炸，也能画成"收缩并旋转"的奇点。
     ★ 和粒子层分工：贴图负责"这一下长什么样"，粒子负责"炸开的东西在飞"。 */
  var vfx = [];

  /* o: { size, ttl, s0,s1 缩放起止, a0,a1 透明起止, rot0,rot1 旋转起止(弧度),
          add 是否叠加发光（默认 true）, flip 水平翻转, alpha 整体透明度 } */
  function spawnVfx(id, x, y, o) {
    o = o || {};
    var spr = APOC.Sprites && APOC.Sprites.fx && APOC.Sprites.fx(id);
    if (!spr) return null;                 // 没加载出来 / 文件缺失 → 这一发不画，不报错
    /* 割草关后期同屏几百只，每次击杀都甩一张爆炸 —— 不封顶的话数组会无界增长 */
    if (vfx.length >= APOC.Config.FX_MAX_INSTANCES) vfx.shift();
    var ttl = o.ttl || 0.3;
    var v = {
      spr: spr, id: id, x: x, y: y,
      size: o.size || 80,
      s0: (o.s0 === undefined) ? 1 : o.s0,
      s1: (o.s1 === undefined) ? 1 : o.s1,
      a0: (o.a0 === undefined) ? 1 : o.a0,
      a1: (o.a1 === undefined) ? 0 : o.a1,
      rot0: o.rot0 || 0,
      rot1: (o.rot1 === undefined) ? (o.rot0 || 0) : o.rot1,
      add: o.add !== false,
      flip: !!o.flip,
      alpha: (o.alpha === undefined) ? 1 : o.alpha,
      t: ttl, ttl: ttl
    };
    vfx.push(v);
    return v;
  }

  APOC.UIEffects = {
    shake: function (amount, time) {
      shakeAmt = Math.max(shakeAmt, amount);
      shakeTime = Math.max(shakeTime, time);
    },
    getShake: function () {
      if (shakeTime <= 0) return 0;
      return shakeAmt * (shakeTime > 0 ? 1 : 0);
    },
    tick: function (dt) {
      if (shakeTime > 0) {
        shakeTime -= dt;
        if (shakeTime <= 0) { shakeTime = 0; shakeAmt = 0; }
      }
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += (p.grav || 380) * dt;
        p.t -= dt;
        if (p.t <= 0) particles.splice(i, 1);
      }
      for (var j = rings.length - 1; j >= 0; j--) {
        rings[j].t -= dt;
        if (rings[j].t <= 0) rings.splice(j, 1);
      }
      for (var k = vfx.length - 1; k >= 0; k--) {
        vfx[k].t -= dt;
        if (vfx[k].t <= 0) vfx.splice(k, 1);
      }
    },
    burst: function (x, y, color, n) {
      n = n || 6;
      for (var i = 0; i < n; i++) {
        if (particles.length >= MAX_P) particles.shift();
        particles.push({
          x: x, y: y,
          vx: (Math.random() - 0.5) * 260,
          vy: -Math.random() * 220 - 40,
          t: 0.4 + Math.random() * 0.3, ttl: 0.7,
          color: color, r: 2 + Math.random() * 2
        });
      }
    },
    getParticles: function () { return particles; },
    getVfx: function () { return vfx; },
    vfx: spawnVfx,

    /* 命中火花：比 burst 更小更快更亮，用来做"打中了"的即时反馈 */
    spark: function (x, y, color, n, power) {
      n = n || 4;
      power = power || 1;
      for (var i = 0; i < n; i++) {
        if (particles.length >= MAX_P) particles.shift();
        var a = Math.random() * 6.28;
        var v = (90 + Math.random() * 220) * power;
        particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
          t: 0.18 + Math.random() * 0.18, ttl: 0.36,
          color: color, r: 1.4 + Math.random() * 1.8, grav: 260
        });
      }
    },

    /* 命中冲击环：快速扩散并淡出的一圈 */
    ring: function (x, y, color, r0, r1, life) {
      rings.push({ x: x, y: y, color: color, r0: r0 || 4, r1: r1 || 34,
                   t: life || 0.22, ttl: life || 0.22 });
      if (rings.length > 40) rings.shift();
    },
    getRings: function () { return rings; },

    /* ★ 爆炸：击杀 / 范围技能 / Boss 死亡都用它。
       一个"爆炸"要三样东西叠在一起才像：
         ① 两道扩散速度不同的环（快的当冲击波，慢的当余波）
         ② 向四周炸开的粒子（带重力，会往下掉）
         ③ 中心的白色闪光（一帧就够，少了它像"扩散"不像"炸"）
       scale 控制大小：小怪 0.7，精英 1.3，Boss 2.2。 */
    explode: function (x, y, color, scale) {
      scale = scale || 1;
      color = color || '#fb923c';
      this.ring(x, y, color, 3 * scale, 52 * scale, 0.3);
      this.ring(x, y, '#fff7ed', 2 * scale, 26 * scale, 0.16);
      var n = Math.round(8 * scale);
      for (var i = 0; i < n; i++) {
        if (particles.length >= MAX_P) particles.shift();
        var a = Math.random() * 6.28;
        var v = (120 + Math.random() * 260) * scale;
        particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          t: 0.3 + Math.random() * 0.3, ttl: 0.6,
          color: color, r: (1.8 + Math.random() * 2.4) * scale, grav: 420
        });
      }
      /* 中心闪光：飘字系统顺带画一个白点，用一条极短命的粒子代替 */
      particles.push({ x: x, y: y, vx: 0, vy: 0, t: 0.09, ttl: 0.09,
                       color: '#ffffff', r: 9 * scale, grav: 0 });
    },

    /* ★ 火苗：燃烧状态挂在怪身上，每帧按概率冒一小簇 */
    flame: function (x, y, scale) {
      if (particles.length >= MAX_P) particles.shift();
      particles.push({
        x: x + (Math.random() - 0.5) * 14 * scale,
        y: y - Math.random() * 8 * scale,
        vx: (Math.random() - 0.5) * 30,
        vy: -40 - Math.random() * 60,
        t: 0.22 + Math.random() * 0.2, ttl: 0.42,
        color: Math.random() < 0.5 ? '#fb923c' : '#fbbf24',
        r: (1.6 + Math.random() * 1.8) * scale, grav: -120
      });
    },

    /* ★ 血滴：流血状态，往下滴 */
    drip: function (x, y, scale) {
      if (particles.length >= MAX_P) particles.shift();
      particles.push({
        x: x + (Math.random() - 0.5) * 16 * scale, y: y,
        vx: 0, vy: 30 + Math.random() * 40,
        t: 0.3, ttl: 0.5, color: '#dc2626',
        r: (1.4 + Math.random() * 1.6) * scale, grav: 520
      });
    }
  };

  /* ---------- Tooltip ---------- */
  var tipEl = null;

  /* ★ tooltip 必须挂在**最外层**（modal-layer），不能用 #stage-wrap 当容器：
     那个容器有 overflow:hidden（会被裁掉），层级又比右侧面板低（会被面板盖住）——
     表现就是"鼠标移到装备上什么也看不到"。
     同时改成 position:fixed 用视口坐标，并在**装备上方**显示（上方放不下才翻到下方）。 */
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'tooltip';
      tipEl.hidden = true;
      (document.getElementById('modal-layer') || document.body).appendChild(tipEl);
    }
    return tipEl;
  }

  /* anchor：优先传**被悬停的那个元素**（tooltip 贴着它显示）；
     传事件对象也能用（退回鼠标位置） */
  APOC.UIEffects.showTip = function (html, anchor) {
    var t = tip();
    t.innerHTML = html;
    t.hidden = false;

    var cx, cy;
    if (anchor && anchor.getBoundingClientRect) {
      var b = anchor.getBoundingClientRect();
      cx = b.left + b.width / 2;
      cy = b.top;
    } else if (anchor && anchor.clientX !== undefined) {
      cx = anchor.clientX; cy = anchor.clientY;
    } else {
      cx = 0; cy = 0;
    }

    t.style.left = '0px'; t.style.top = '0px';
    var w = t.offsetWidth, h = t.offsetHeight;
    var vw = window.innerWidth || 720, vh = window.innerHeight || 1280;
    var x = Math.max(6, Math.min(cx - w / 2, vw - w - 6));
    var y = cy - h - 10;                    // 默认显示在装备**上方**
    if (y < 6) y = cy + 24;                 // 上方不够就翻到下方
    if (y + h > vh - 6) y = Math.max(6, vh - h - 6);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  };
  APOC.UIEffects.hideTip = function () { if (tipEl) tipEl.hidden = true; };

  /* 装备 Tooltip 内容生成 */
  APOC.UIEffects.itemTipHTML = function (item, ctx) {
    var C = APOC.Config, D = APOC.Data;
    var inv = APOC.Inventory;
    var qc = ['var(--q0)', 'var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)'][item.quality];
    var proto = D.Protos[item.protoId];
    var html = '';
    html += '<div class="tt-name" style="color:' + qc + '">' +
            APOC.Sprites.iconTag('equip', item.protoId, 26, inv.itemIcon(item), 'margin-right:5px') +
            inv.itemName(item) + '</div>';
    var enh = inv.enhLevel ? inv.enhLevel(item) : 0;
    html += '<div class="tt-sub">' + C.QUALITY_NAME[item.quality] + ' · ' +
            C.SLOT_NAMES[proto.slot] + ' · Lv.' + item.level +
            /* 属性 roll：同一件装备现在能刷出不同的数值，不显示的话
               玩家没法判断"这件是不是好的" */
            (item.roll ? ' · <span style="color:' +
                (item.roll >= 1.2 ? 'var(--q4)' : item.roll >= 1.0 ? 'var(--text-sub)' : 'var(--text-dim)') +
                '">属性 ' + Math.round(item.roll * 100) + '%</span>' : '') +
            '</div>';
    if (enh > 0) {
      html += '<div class="tt-enh">强化 +' + enh +
              ' <span style="color:var(--accent)">（属性 ×' + inv.enhMul(item).toFixed(2) + '）</span></div>';
      /* 明确告诉玩家"分解能拿回强化的钱" ——
         不说的话没人敢强化，这个系统就白做了 */
      if (item.enhGold) {
        html += '<div class="tt-sub" style="margin:0 0 4px">分解可无损退还 ' +
                APOC.Formula.fmt(item.enhGold) + ' 金币与强化材料</div>';
      }
    }
    html += '<hr>';

    /* 标签与单位全部来自 Config（唯一真源）——
       以前这里只映射了 11 个属性，其余直接漏出 `hpPct` / `thorns` 这种英文键名。 */
    var ATTR_LABEL = C.STAT_LABEL, UNIT = C.STAT_UNIT;
    function statName(k) { return ATTR_LABEL[k] || k; }
    function statVal(k, v) {
      var u = (UNIT[k] !== undefined) ? UNIT[k] : '%';
      var n = (u === '' || k === 'aspd') ? (k === 'aspd' ? Math.round(v * 100) / 100 : Math.round(v))
                                         : (Math.round(v * 10) / 10);
      return '+' + n + u;
    }
    /* 对比差值的配色：涨绿 / 跌红 / 基本持平灰。
       阈值 0.05 是为了滤掉浮点噪声，免得明明没变也显示 +0.0 */
    function dcls(d) { return d > 0.05 ? 'up' : (d < -0.05 ? 'down' : 'same'); }

    /* ★ 悬浮对比（用户要求）：把"这件换上会变成什么"直接算出来。
       背包里几十件装备，光看绝对数值玩家判断不了哪件更好 ——
       属性随机上线之后，同品质之间的数值能差一倍，这个问题更尖锐了。
       对照物是**同槽位已装备的那件**；悬停的如果就是身上那件，就不比。 */
    var cur = null;
    if (inv.itemSlot) {
      var eq = inv.equippedItem(proto.slot);
      if (eq && eq.uid !== item.uid) cur = eq;
    }
    var mine = inv.effStats(item);
    var theirs = cur ? inv.effStats(cur) : null;

    if (cur) {
      /* ★ 必须取整再显示。scoreItem 返回的是 Math.round(v*100)/100，
         两件相减会留下浮点尾巴 —— 实测印出过 "-62.179999999999999"，
         玩家一眼就看出这是个没收拾干净的界面。 */
      var ds = Math.round(inv.scoreItem(item) - inv.scoreItem(cur));
      html += '<div class="tt-cmp-head">对比身上：' + inv.itemName(cur) +
              (inv.enhLevel(cur) ? ' +' + inv.enhLevel(cur) : '') + '</div>';
      html += '<div class="tt-cmp-score">评分 ' + Math.round(inv.scoreItem(item)) +
              ' <em class="tt-delta ' + dcls(ds) + '">' + (ds > 0 ? '+' : '') + ds + '</em></div>';
      html += '<hr>';
    }

    /* 属性行：有对照物时每行带一个差值 */
    var keys = {};
    Object.keys(mine).forEach(function (k) { keys[k] = 1; });
    if (theirs) Object.keys(theirs).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var v = mine[k] || 0;
      var line = '<div class="tt-attr"><span class="k">' + statName(k) + '</span><span>' +
                 statVal(k, v);
      if (theirs) {
        var d = v - (theirs[k] || 0);
        line += ' <em class="tt-delta ' + dcls(d) + '">' +
                (d > 0 ? '+' : '') + (Math.round(d * 10) / 10) + '</em>';
      }
      html += line + '</span></div>';
    });

    /* 强化预览：把下一级的代价和成功率摆出来再让玩家点。
       ★ 成功率必须显示 —— 「几率减半」意味着第 6 级只有 3%，
       不写出来的话玩家会以为按钮坏了（连点十次都不成功）。 */
    if (inv.enhanceCost) {
      var cost = inv.enhanceCost(item);
      if (cost) {
        var rate = inv.enhanceRate(item) * 100;
        var matName = cost.matId && D.Materials[cost.matId] ? D.Materials[cost.matId].name : '材料';
        html += '<hr><div class="tt-cmp-head">强化到 +' + cost.next + '</div>';
        html += '<div class="tt-attr"><span class="k">消耗</span><span>' +
                APOC.Formula.fmt(cost.gold) + ' 金币 · ' + cost.mat + ' ' + matName + '</span></div>';
        html += '<div class="tt-attr"><span class="k">成功率</span><span style="color:' +
                (rate >= 50 ? 'var(--q1)' : rate >= 10 ? 'var(--gold)' : 'var(--danger)') + '">' +
                (rate >= 1 ? rate.toFixed(rate >= 10 ? 0 : 1) : rate.toFixed(2)) + '%</span></div>';
        html += '<div class="tt-attr"><span class="k" style="font-size:10px;color:var(--text-dim)">' +
                '失败只消耗材料，等级不掉</span><span></span></div>';
      } else {
        html += '<hr><div class="tt-cmp-head">已强化到满级 +' + C.ENH_MAX + '</div>';
      }
    }

    if (item.affixes && item.affixes.length) {
      html += '<hr>';
      item.affixes.forEach(function (af) {
        var def = D.AffixById[af.id];
        if (!def) return;
        html += '<div class="tt-affix">◆ ' + def.name + '：' + def.text + ' +' + af.value + '%</div>';
      });
    }

    /* 套装：2/3/5 三档全列出，已达成的标亮、没达成的压暗 ——
       玩家要能一眼看出"还差几件、下一档给什么" */
    var set = APOC.Data.setOfItem(item);
    if (set) {
      var body = APOC.State.data;
      var have = 0;
      Object.keys(body.equipped).forEach(function (sl) {
        if (sl === 'weapon') return;
        var it = APOC.Inventory.equippedItem(sl);
        if (it && APOC.Data.setOfItem(it) === set) have++;
      });
      html += '<hr>';
      html += '<div class="tt-set-name">' + set.icon + ' ' + set.name +
              ' <span class="' + (have ? 'on' : '') + '">(' + have + '/' + D.SET_PIECES + ')</span></div>';
      [[2, set.b2], [3, set.b3], [5, set.b5]].forEach(function (pair) {
        var on = have >= pair[0];
        var txt = pair[1].map(function (e) {
          return statName(e.stat) + ' ' + statVal(e.stat, e.val);
        }).join('　');
        html += '<div class="tt-set-row' + (on ? ' on' : '') + '">' +
                (on ? '● ' : '○ ') + pair[0] + ' 件：' + txt + '</div>';
      });
    }
    return html;
  };
})(window.APOC = window.APOC || {});
