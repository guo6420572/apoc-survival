/* panel_tech.js — 科技树：3 条线 × 7 层，每层 1 主节点 + 2 被动 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula;
  var el = null, body = null, detail = null;
  var curLine = 'gun';
  var selectedId = null;

  function nodeState(node) {
    var lv = APOC.Tech.nodeLevel(node.id);
    if (lv > 0) return 'owned';
    if (!APOC.Tech.reqOK(node)) return 'locked';
    if (APOC.Tech.canAfford(node)) return 'can';
    return 'locked';
  }

  function mount() {
    if (el) return;
    el = APOC.UI.makeShell('科技树');
    body = el.querySelector('.panel-body');
    body.innerHTML =
      '<div class="tech-layout">' +
      '  <div class="tech-main" id="tech-main"></div>' +
      '  <div class="tech-detail" id="tech-detail"></div>' +
      '</div>';
    detail = body.querySelector('#tech-detail');
    APOC.UI.overlay().appendChild(el);

    body.addEventListener('click', function (ev) {
      var rb = ev.target.closest ? ev.target.closest('[data-act="tech-reset"]') : null;
      if (rb) {
        if (APOC.Tech.reset()) { selectedId = null; render(); }
        else APOC.Bus.emit('toast', { type: 'warn', text: '金币不足，重置需要 ' +
          APOC.Formula.fmt(APOC.Tech.resetCost()) });
        return;
      }
      var tab = ev.target.closest ? ev.target.closest('[data-line]') : null;
      if (tab) {
        curLine = tab.dataset.line;
        selectedId = null;
        render();
        return;
      }
      var nd = ev.target.closest ? ev.target.closest('[data-node]') : null;
      if (nd) {
        selectedId = nd.dataset.node;
        renderTree();
        renderDetail();
      }
    });

    detail.addEventListener('click', function (ev) {
      var act = ev.target.dataset ? ev.target.dataset.act : null;
      if (!act) return;
      var node = APOC.Data.TechById[selectedId];
      if (!node) return;
      if (act === 'equip') {
        APOC.Tech.setWeapon(node.weapon);
        APOC.Bus.emit('toast', { type: 'success',
          text: '已装备「' + APOC.Data.Weapons[node.weapon].name + '」' });
        return;                       // setWeapon 会发 equip:change / tech:change，面板自己会重画
      }
      if (APOC.Tech.nodeLevel(node.id) > 0) APOC.Tech.upgrade(node);
      else APOC.Tech.unlock(node);
      render();
    });
  }

  function render() {
    renderTabs();
    renderTree();
    renderDetail();
  }

  function renderTabs() {
    var main = body.querySelector('#tech-main');
    var active = APOC.Stats.currentLine();
    var tabs = '<div class="tech-tabs">' + APOC.Data.LINES.map(function (l) {
      var cls = (l.id === curLine ? ' active' : '') + (l.id === active ? ' live' : '');
      var mark = (l.id === active) ? '<i class="tab-live">生效</i>' : '<i class="tab-idle">挂起</i>';
      return '<button data-line="' + l.id + '"' + (cls ? ' class="' + cls.trim() + '"' : '') + '>' +
        l.icon + ' ' + l.name + mark + '</button>';
    }).join('') + '</div>';
    main.innerHTML = tabs + resetBarHTML() + '<div id="tech-layers"></div>';
  }

  /* 科技重置入口。★ 被动改成"只有当前武器那条线生效"之后这个必须显眼：
     不然玩家点在别的线上的材料就是死钱，换流派等于被罚一次。 */
  function resetBarHTML() {
    var can = APOC.Tech.canReset();
    var fee = can ? APOC.Tech.resetCost() : 0;
    if (!can) return '';
    return '<div class="tech-reset">' +
      '<button data-act="tech-reset">重置科技（返还全部材料，手续费 ' + F.fmt(fee) + ' 金币）</button>' +
      '</div>';
  }

  /* 按层取节点。抽成函数而不是在循环里写闭包 —— 闭包捕获循环变量容易埋雷 */
  function pick(nodes, layer, cond) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.layer === layer && cond(n)) return n;
    }
    return null;
  }

  function renderTree() {
    var host = body.querySelector('#tech-layers');
    if (!host) return;
    var nodes = APOC.Data.Tech.filter(function (n) { return n.line === curLine; });
    var html = '';

    for (var layer = 7; layer >= 1; layer--) {
      var a = pick(nodes, layer, function (n) { return n.id.slice(-1) === 'a'; });
      var b = pick(nodes, layer, function (n) { return n.id.slice(-1) === 'b'; });
      var main = pick(nodes, layer, function (n) { return n.type === 'main'; });

      html += '<div class="tech-layer">';
      html += '<span class="pos">L' + layer + '</span>';
      html += nodeHTML(a);
      html += nodeHTML(main);
      html += nodeHTML(b);
      html += '</div>';
      if (layer > 1) {
        var on = main && APOC.Tech.nodeLevel(main.id) > 0 ? ' on' : '';
        html += '<div class="tech-link' + on + '"><i></i></div>';
      }
    }
    host.innerHTML = html;
  }

  function nodeHTML(node) {
    if (!node) return '<div class="node locked" style="visibility:hidden"></div>';
    var st = nodeState(node);
    var lv = APOC.Tech.nodeLevel(node.id);
    /* 正在装备的那把武器打个标 —— 不然玩家换了武器之后，得逐个点进详情才知道在用哪把 */
    var isEq = node.type === 'main' && node.weapon &&
               APOC.Tech.equippedWeaponId() === node.weapon;
    var active = APOC.Stats.currentLine();
    var idle = active && node.line !== active;      // 异线：点了也不生效
    var cls = 'node' + (node.type === 'main' ? ' main' : '') +
      (st === 'owned' ? ' owned' : st === 'can' ? ' can' : ' locked') +
      (isEq ? ' eq' : '') +
      (idle ? ' idle' : '') +
      (selectedId === node.id ? ' sel' : '');
    return '<div class="' + cls + '" data-node="' + node.id + '">' +
      '<span class="ico">' +
        APOC.Sprites.iconTag(node.type === 'main' ? 'weapon' : 'tech', node.id, 34, node.icon) + '</span>' +
      '<span class="nm">' + node.name + '</span>' +
      (lv > 0 ? '<span class="lv">Lv.' + lv + '</span>' : '') +
      (isEq ? '<span class="eq">装</span>' : '') +
      '</div>';
  }

  function effectLines(node, lv) {
    var out = [];
    if (node.type === 'main') {
      var w = APOC.Data.Weapons[node.weapon];
      var nl = lv || 1;
      out.push('武器攻击力 ' + F.fmt(F.weaponAtk(w, nl)));
      out.push('射程 ' + w.range + '　攻速 ' + w.aspd + '/s　系数 ' + w.coef);
      var bn = { single: '单体', multi: '多目标', pierce: '贯穿', splash: '溅射', chain: '弹射' };
      out.push('攻击方式：' + (bn[w.behavior] || w.behavior));
    } else if (node.effects) {
      node.effects.forEach(function (e) {
        var v = e.per * (lv || 0);
        out.push(e.text + ' +' + (Math.round(v * 10) / 10) + '%');
      });
      if (node.desc) out.push('※ ' + node.desc);
    }
    return out;
  }

  function renderDetail() {
    var node = selectedId ? APOC.Data.TechById[selectedId] : null;
    if (!node) {
      detail.innerHTML = '<div class="sub">点击左侧节点查看详情</div>' +
        '<div class="sub" style="margin-top:10px">共 ' + APOC.Data.Tech.length +
        ' 个节点，三条线可同时点，被动全部生效。</div>';
      return;
    }
    var lv = APOC.Tech.nodeLevel(node.id);
    var maxed = lv >= C.TECH_MAX_LV;
    var cost = APOC.Tech.costOf(node);
    var mat = APOC.Tech.materialOf(node);
    var haveMat = mat ? APOC.Inventory.countMaterial(mat.id) : 0;
    var haveGold = APOC.State.data.player.gold;
    var line = APOC.Data.LINES.filter(function (l) { return l.id === node.line; })[0];

    var html = '';
    html += '<h3 style="color:' + (node.type === 'main' ? 'var(--accent)' : 'var(--text-main)') + '">' +
            APOC.Sprites.iconTag(node.type === 'main' ? 'weapon' : 'tech', node.id, 30, node.icon,
                                 'display:inline-block;margin-right:6px') +
            ' ' + node.name + '</h3>';
    html += '<div class="sub">' + line.name + ' · 第 ' + node.layer + ' 层 · ' +
            (node.type === 'main' ? '武器' : '被动') +
            (lv > 0 ? ' · Lv.' + lv + ' / ' + C.TECH_MAX_LV : '') + '</div>';

    /* 异线节点：已经点过但当前不生效，必须说清楚，否则玩家以为点坏了 */
    var actNow = APOC.Stats.currentLine();
    if (lv > 0 && actNow && node.line !== actNow) {
      var actLine = APOC.Data.LINES.filter(function (l) { return l.id === actNow; })[0];
      html += '<div class="cost" style="color:var(--danger)">⚠ 已挂起：当前武器属于「' +
              (actLine ? actLine.name : actNow) + '」线，这条线的被动不生效。<br>' +
              '换成' + line.name + '武器即可启用，或用上面的「重置科技」全额退回。</div>';
    }

    html += '<div class="eff">';
    if (lv > 0) {
      html += '<div><b>当前</b></div>';
      effectLines(node, lv).forEach(function (t) { html += '<div>' + t + '</div>'; });
      if (!maxed) {
        html += '<div class="next" style="margin-top:6px"><b>下一级</b></div>';
        effectLines(node, lv + 1).forEach(function (t) { html += '<div class="next">' + t + '</div>'; });
      }
    } else {
      html += '<div>解锁后效果：</div>';
      effectLines(node, 1).forEach(function (t) { html += '<div>' + t + '</div>'; });
    }
    html += '</div>';

    /* 武器节点：装备按钮。
       ★ 放在 reqOK / maxed 这两个提前 return 之前，否则满级的武器节点会看不到按钮 ——
       而"想把武器换回满级的那把"恰恰是最常见的用法。 */
    if (node.type === 'main' && lv > 0) {
      var w = APOC.Data.Weapons[node.weapon];
      if (APOC.Tech.equippedWeaponId() === node.weapon) {
        html += '<div class="cost" style="color:var(--q1)">✓ 当前装备</div>';
      } else {
        var cur = APOC.Tech.currentWeapon();
        var mine = F.weaponScore(w, lv);
        var theirs = cur ? F.weaponScore(cur, APOC.Tech.nodeLevel(cur.id)) : 0;
        var cmp = theirs > 0
          ? '<span style="color:var(--text-dim)">评分 ' + F.fmt(mine) + ' vs 当前 ' + F.fmt(theirs) +
            '（' + (mine >= theirs ? '更强 ↑' : '更弱 ↓') + '）</span>'
          : '';
        if (cmp) html += '<div class="cost">' + cmp + '</div>';
        html += '<button data-act="equip">装备这把</button>';
      }
    }

    if (!APOC.Tech.reqOK(node)) {
      var reqName = APOC.Data.TechById[node.req] ? APOC.Data.TechById[node.req].name : node.req;
      html += '<div class="cost"><span class="lack">需要先解锁「' + reqName + '」</span></div>';
      detail.innerHTML = html;
      return;
    }

    if (maxed) {
      html += '<div class="cost" style="color:var(--q1)">已满级</div>';
      detail.innerHTML = html;
      return;
    }

    html += '<div class="cost">';
    html += '<div>金币：<span class="' + (haveGold < cost.gold ? 'lack' : '') + '">' +
            F.fmt(haveGold) + ' / ' + F.fmt(cost.gold) + '</span></div>';
    if (mat) {
      html += '<div>材料：<span class="' + (haveMat < cost.mat ? 'lack' : '') + '">' +
              APOC.Sprites.iconTag('mat', mat.id, 18, mat.icon) + ' ' +
              F.fmt(haveMat) + ' / ' + F.fmt(cost.mat) + '</span></div>';
    }
    html += '</div>';

    var can = lv > 0 ? APOC.Tech.canUpgrade(node) : APOC.Tech.canUnlock(node);
    html += '<button data-act="1"' + (can ? '' : ' disabled') + '>' +
            (lv > 0 ? '升级到 Lv.' + (lv + 1) : '解锁') + '</button>';

    detail.innerHTML = html;
  }

  APOC.UI.registerPanel('tech', {
    get el() { return el; },
    mount: mount,
    open: render,
    close: null
  });

  APOC.Bus.on('tech:change', function () { if (el && !el.hidden) render(); });
  APOC.Bus.on('drop', function () { if (el && !el.hidden) renderDetail(); });
})(window.APOC = window.APOC || {});
