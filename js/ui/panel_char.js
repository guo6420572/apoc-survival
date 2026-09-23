/* panel_char.js — 角色面板：属性总览 + 自由属性点分配 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula;
  var el = null, body = null;

  var ROWS = [
    { k: 'atk',      n: '攻击力',    int: true },
    { k: 'hp',       n: '生命上限',  int: true },
    { k: 'def',      n: '防御力',    int: true },
    { k: 'aspd',     n: '攻击速度',  fix: 2 },
    { k: 'crit',     n: '暴击率',    pct: true, fix: 1 },
    { k: 'critDmg',  n: '暴击伤害',  pct: true, fix: 0 },
    { k: 'dodge',    n: '闪避率',    pct: true, fix: 1 },
    { k: 'lifesteal',n: '吸血',      pct: true, fix: 1 },
    { k: 'pen',      n: '固定穿透',  int: true },
    { k: 'penPct',   n: '百分比穿透',pct: true, fix: 1 },
    { k: 'dmgUp',    n: '增伤',      pct: true, fix: 1 },
    { k: 'dmgReduce',n: '减伤',      pct: true, fix: 1 },
    { k: 'hpRegenPct', n: '每秒回复生命', pct: true, fix: 1 },
    { k: 'spd',      n: '移动速度',  int: true }
  ];

  function mount() {
    if (el) return;
    el = APOC.UI.makeShell('角色');
    body = el.querySelector('.panel-body');
    APOC.UI.overlay().appendChild(el);

    var html = '';
    html += '<div class="char-wrap">';
    html += '  <div>';
    html += '    <div class="char-portrait">';
    html += '      <div class="face">🧍</div>';
    html += '      <div class="meta">';
    html += '        <div class="lv" id="c-level">Lv.1</div>';
    html += '        <div class="exp" id="c-exp"></div>';
    /* 武器行可点：解锁的武器都在这儿换（科技树那边也能换，见 panel_tech.js） */
    html += '        <div class="exp c-weapon-btn" id="c-weapon" style="color:var(--accent)"></div>';
    html += '        <div class="exp" id="c-bp"></div>';
    html += '        <div class="exp c-school" id="c-school"></div>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="stat-list" id="c-stats"></div>';
    html += '  </div>';
    html += '  <div class="alloc-box">';
    html += '    <h3>自由属性点　<span id="c-points" style="color:var(--accent)">0</span></h3>';
    html += '    <div id="c-alloc"></div>';
    html += '    <button id="c-reset" style="width:100%;height:32px;margin-top:12px"></button>';
    html += '  </div>';
    html += '</div>';
    body.innerHTML = html;

    /* 属性行只建一次 */
    var sl = body.querySelector('#c-stats');
    ROWS.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'stat-row';
      d.innerHTML = '<span class="k">' + r.n + '</span><span class="v" data-k="' + r.k + '">-</span>';
      sl.appendChild(d);
    });

    /* 加点行 */
    var al = body.querySelector('#c-alloc');
    Object.keys(C.ALLOC).forEach(function (key) {
      var info = C.ALLOC[key];
      var d = document.createElement('div');
      d.className = 'alloc-row';
      d.innerHTML =
        '<span class="nm">' + info.label + '<small>' + info.desc + '</small></span>' +
        '<button data-minus="' + key + '">−</button>' +
        '<span class="cur" data-cur="' + key + '">0</span>' +
        '<button data-plus="' + key + '">+</button>';
      al.appendChild(d);
    });

    al.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.dataset.plus) addPoint(t.dataset.plus, 1);
      else if (t.dataset.minus) addPoint(t.dataset.minus, -1);
    });

    body.querySelector('#c-weapon').addEventListener('click', openWeaponPicker);

    body.querySelector('#c-reset').addEventListener('click', function () {
      var p = APOC.State.data.player;
      if (!p.freePoints && !totalAlloc()) {
        APOC.UI.toast('info', '还没有分配过属性点'); return;
      }
      if (p.gold < C.ALLOC_RESET_GOLD) {
        APOC.UI.toast('warn', '金币不足，重置需要 ' + F.fmt(C.ALLOC_RESET_GOLD));
        return;
      }
      APOC.Inventory.spendGold(C.ALLOC_RESET_GOLD);
      var sum = totalAlloc();
      p.alloc = { str: 0, vit: 0, agi: 0, per: 0 };
      p.freePoints += sum;
      APOC.Stats.markDirty();
      APOC.State.markDirty();
      APOC.Bus.emit('equip:change');
      APOC.UI.toast('success', '已重置，返还 ' + sum + ' 点');
      refresh();
    });
  }

  function totalAlloc() {
    var a = APOC.State.data.player.alloc;
    return a.str + a.vit + a.agi + a.per;
  }

  function addPoint(key, delta) {
    var p = APOC.State.data.player;
    if (delta > 0) {
      if (p.freePoints <= 0) { APOC.UI.toast('warn', '没有可用的属性点'); return; }
      p.freePoints--; p.alloc[key]++;
    } else {
      if (p.alloc[key] <= 0) return;
      p.alloc[key]--; p.freePoints++;
    }
    APOC.Stats.markDirty();
    APOC.State.markDirty();
    refresh();
  }

  function fmtVal(r, v) {
    if (r.pct) return (Math.round(v * Math.pow(10, r.fix)) / Math.pow(10, r.fix)).toFixed(r.fix) + '%';
    if (r.fix !== undefined) return v.toFixed(r.fix);
    return F.fmt(v);
  }

  function refresh() {
    if (!el || el.hidden) return;
    var D = APOC.State.data, p = D.player;
    var s = APOC.Stats.final();

    body.querySelector('#c-level').textContent = 'Lv.' + p.level;
    var need = F.expNeed(p.level);
    body.querySelector('#c-exp').textContent =
      p.level >= C.MAX_LEVEL ? '已满级' : ('经验 ' + F.fmt(p.exp) + ' / ' + F.fmt(need));
    var w = APOC.Tech.currentWeapon();
    body.querySelector('#c-weapon').innerHTML = w
      ? ('武器 ' + APOC.Sprites.iconTag('weapon', w.id, 22, w.icon) + ' ' + w.name +
         ' Lv.' + APOC.Tech.nodeLevel(w.id) + '　<span class="wp-swap">更换 ▾</span>')
      : '未装备武器';
    body.querySelector('#c-bp').textContent = '战力 ' + F.fmt(s.bp);

    /* 当前流派：加点倾向跟着当前武器走（见 stats.js autoAllocate）。
       不写这一行的话，玩家会觉得"我点的敏捷怎么自己变了"。 */
    var line = APOC.Stats.currentLine();
    var lineName = { body: '体术', gun: '枪械', psi: '异能' }[line];
    var ratio = APOC.Stats.ratioFor();
    var ratioText = Object.keys(ratio)
      .sort(function (a, b) { return ratio[b] - ratio[a]; })
      .map(function (k) { return C.ALLOC[k].label; })
      .join(' › ');
    body.querySelector('#c-school').innerHTML = lineName
      ? ('流派 ' + lineName + '　<span class="exp-dim">自动加点：' + ratioText + '</span>')
      : '';

    ROWS.forEach(function (r) {
      var node = body.querySelector('[data-k="' + r.k + '"]');
      if (node) node.textContent = fmtVal(r, s[r.k] || 0);
    });

    body.querySelector('#c-points').textContent = p.freePoints;
    Object.keys(C.ALLOC).forEach(function (key) {
      var n = body.querySelector('[data-cur="' + key + '"]');
      if (n) n.textContent = p.alloc[key];
    });

    var btn = body.querySelector('#c-reset');
    btn.textContent = '重置加点（' + F.fmt(C.ALLOC_RESET_GOLD) + ' 金币）';
    btn.disabled = !totalAlloc();
  }

  /* ---------------- 武器选择弹窗 ----------------
     ★ 为什么必须要有这个入口：武器以前是"解锁即自动装备"，而 setWeapon 在整个 UI 里
     一次都没被调用过 —— 也就是说玩家**没有任何办法手动换武器**。解锁顺序一旦不是
     从强到弱（比如先解枪械 6 层的狙击枪、再解异能 2 层的心灵震爆），那把弱武器就会
     把强的顶掉，而玩家换不回来。现在改成解锁只入库、装备由玩家选。 */
  var picker = null;

  function ensurePicker() {
    if (picker) return picker;
    picker = document.createElement('div');
    picker.className = 'modal-mask';
    picker.hidden = true;
    picker.innerHTML =
      '<div class="wp-modal">' +
      '  <h3>选择武器</h3>' +
      '  <div class="wp-hint">已解锁的武器都在这里。评分只算武器本身的输出' +
      '（攻击力 × 攻速 × 等效命中数），不含装备与被动。</div>' +
      '  <div class="wp-list"></div>' +
      '  <button class="wp-close">关闭</button>' +
      '</div>';
    document.getElementById('modal-layer').appendChild(picker);

    /* ★ 一律只用 addEventListener，不要和 onclick 混用（见 panel_bag.js 文件头的教训） */
    picker.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.closest && t.closest('.wp-close')) { picker.hidden = true; return; }
      if (t.closest && t.closest('.modal-mask') === picker && !t.closest('.wp-modal')) {
        picker.hidden = true;                 // 点遮罩关闭
        return;
      }
      var row = t.closest ? t.closest('[data-weapon]') : null;
      if (!row) return;
      APOC.Tech.setWeapon(row.dataset.weapon);   // 内部会发 equip:change，面板自己刷新
      picker.hidden = true;
      APOC.Bus.emit('toast', { type: 'success', text: '已装备「' + row.dataset.wpname + '」' });
    });
    return picker;
  }

  var LINE_NAME = { body: '体术', gun: '枪械', psi: '异能' };
  var BEHAVIOR_NAME = { single: '单体', multi: '多目标', pierce: '贯穿',
                        splash: '溅射', chain: '弹射' };

  function openWeaponPicker() {
    var list = APOC.Tech.unlockedWeapons();
    if (!list.length) { APOC.UI.toast('info', '还没有解锁任何武器'); return; }
    var cur = APOC.Tech.currentWeapon();
    var curScore = cur ? F.weaponScore(cur, APOC.Tech.nodeLevel(cur.id)) : 0;

    /* 按评分从高到低排 —— 玩家打开就想知道"哪把最强" */
    var rows = list.map(function (w) {
      var lv = APOC.Tech.nodeLevel(w.id);
      return { w: w, lv: lv, score: F.weaponScore(w, lv) };
    }).sort(function (a, b) { return b.score - a.score; });

    var m = ensurePicker();
    m.querySelector('.wp-list').innerHTML = rows.map(function (r) {
      var w = r.w;
      var on = cur && cur.id === w.id;
      var cmp = on ? '<span class="wp-tag cur">装备中</span>'
                   : (r.score >= curScore ? '<span class="wp-tag up">更强 ↑</span>'
                                          : '<span class="wp-tag down">更弱 ↓</span>');
      return '<div class="wp-row' + (on ? ' on' : '') + '" data-weapon="' + w.id + '"' +
             ' data-wpname="' + w.name + '">' +
        '<span class="wp-ico">' + APOC.Sprites.iconTag('weapon', w.id, 34, w.icon) + '</span>' +
        '<span class="wp-main">' +
          '<b>' + w.name + '</b> <span class="wp-lv">Lv.' + r.lv + '</span>' + cmp +
          '<small>' + LINE_NAME[w.line] + ' 第 ' + w.layer + ' 层 · ' +
            BEHAVIOR_NAME[w.behavior] + ' · 射程 ' + w.range + '</small>' +
        '</span>' +
        '<span class="wp-score">' + F.fmt(r.score) + '</span>' +
        '</div>';
    }).join('');
    m.hidden = false;
  }

  /* 注册成正式 UI 动作（与 makeShell / overlay / toast 同级）：
     它是"打开武器选择"这个动作本身，将来别的入口（工具栏、战斗中的提示）也能调；
     顺带让 tools/smoke_ui.js 能把弹窗的构建路径跑一遍。 */
  APOC.UI.openWeaponPicker = openWeaponPicker;

  APOC.UI.registerPanel('char', {
    get el() { return el; },
    mount: mount,
    open: refresh,
    close: null
  });

  APOC.Bus.on('equip:change', refresh);
  APOC.Bus.on('tech:change', refresh);
  APOC.Bus.on('levelup', refresh);
})(window.APOC = window.APOC || {});
