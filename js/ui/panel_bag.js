/* panel_bag.js — 背包：装备槽 + 背包网格 + 一键换装 / 一键分解
   ★ 所有按钮一律只用 addEventListener。
   曾经在一个按钮上同时挂了 addEventListener 和 onclick，点一次触发两个处理器
   （点「装备」会连带触发批量分解），排查了很久。 */
(function (APOC) {
  'use strict';

  var C = APOC.Config;
  var el = null, body = null, foot = null, actions = null;
  var selected = null;
  var sellSel = { 0: true, 1: true, 2: false, 3: false, 4: false };

  var SLOT_ORDER = ['weapon', 'helmet', 'armor', 'legs', 'boots', 'accessory'];

  function mount() {
    if (el) return;
    el = APOC.UI.makeShell('背包');
    body = el.querySelector('.panel-body');

    /* 选中装备的操作条（默认隐藏） */
    actions = document.createElement('div');
    actions.className = 'panel-foot bag-actions';
    actions.hidden = true;
    actions.innerHTML =
      '<span id="bag-sel-name" style="flex:1;font-size:12px;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap"></span>' +
      '<button id="bag-equip">装备</button>' +
      '<button id="bag-enh">强化</button>' +
      '<button id="bag-enh10">强化×' + C.ENH_BATCH + '</button>' +
      '<button id="bag-sell-one">分解</button>';
    el.appendChild(actions);

    /* 底部批量操作 */
    foot = document.createElement('div');
    foot.className = 'panel-foot';
    foot.innerHTML =
      '<div style="width:100%;margin-bottom:2px">' +
      '  <span style="color:var(--text-dim);font-size:12px">按品质分解：</span>' +
      '  <span id="bag-qfilter"></span>' +
      '</div>' +
      '<button id="bag-auto-equip">一键换装</button>' +
      '<button id="bag-auto-sell">分解次级</button>' +
      /* 一键吞噬与「分解次级」判据**完全一致**，只是终点不同：
         一个变成金币、一个喂宠物。摆在一起，玩家自己选出口。 */
      '<button id="bag-auto-devour">一键吞噬</button>' +
      '<button id="bag-sell-q">按品质分解</button>';
    el.appendChild(foot);

    body.innerHTML =
      '<div class="bag-wrap">' +
      '  <div class="equip-col">' +
      '    <h3>装备槽 <small style="color:var(--text-dim)">（点一下可卸下）</small></h3>' +
      '    <div class="equip-grid" id="bag-equip"></div>' +
      '    <h3 style="margin-top:10px">宠物</h3>' +
      '    <div class="pet-box" id="bag-pet"></div>' +
      '  </div>' +
      '  <div class="bag-col">' +
      '    <h3 id="bag-count">背包</h3>' +
      '    <div class="bag-grid" id="bag-grid"></div>' +
      '  </div>' +
      '</div>';

    buildQualityFilter();
    bindEvents();
    APOC.UI.overlay().appendChild(el);
  }

  /* 造一个品质勾选按钮。
     抽成工厂函数而不是「循环里塞 IIFE + 闭包」—— 闭包捕获循环变量是经典埋雷点，
     静态检查也会一直报 no-loop-func。 */
  function makeQualityBtn(qq) {
    var b = document.createElement('button');
    b.textContent = C.QUALITY_NAME[qq];
    b.style.cssText = 'height:24px;padding:0 8px;margin-right:4px;font-size:12px';
    function paint() {
      b.style.borderColor = sellSel[qq] ? 'var(--q' + qq + ')' : '';
      b.style.color = sellSel[qq] ? 'var(--q' + qq + ')' : 'var(--text-dim)';
    }
    paint();
    b.addEventListener('click', function () {
      sellSel[qq] = !sellSel[qq];
      paint();
    });
    return b;
  }

  function buildQualityFilter() {
    var qf = foot.querySelector('#bag-qfilter');
    for (var q = 0; q < 5; q++) qf.appendChild(makeQualityBtn(q));
  }

  function bindEvents() {
    /* 点背包格 / 装备槽 → 选中（再点一次取消） */
    body.addEventListener('click', function (ev) {
      var cell = ev.target.closest ? ev.target.closest('[data-item-uid]') : null;
      if (!cell) return;
      selected = (selected === cell.dataset.itemUid) ? null : cell.dataset.itemUid;
      refresh();
    });

    /* 悬停 tooltip */
    body.addEventListener('mousemove', function (ev) {
      var cell = ev.target.closest ? ev.target.closest('[data-item-uid]') : null;
      if (!cell) { APOC.UIEffects.hideTip(); return; }
      var item = findItem(cell.dataset.itemUid);
      if (item) APOC.UIEffects.showTip(APOC.UIEffects.itemTipHTML(item), cell);
    });
    body.addEventListener('mouseleave', APOC.UIEffects.hideTip);

    /* 三个批量操作 —— 各自独立绑定，绝不共用 onclick */
    foot.querySelector('#bag-auto-equip').addEventListener('click', function () {
      APOC.Inventory.autoEquipBest();
      refresh();
    });
    foot.querySelector('#bag-auto-sell').addEventListener('click', function () {
      APOC.Inventory.autoSellWorse();
      selected = null;
      refresh();
    });
    foot.querySelector('#bag-auto-devour').addEventListener('click', function () {
      var r = APOC.Inventory.autoDevour();
      selected = null;
      refresh();
      if (!r.ok && r.reason === 'nopet') {
        APOC.UI.toast('warn', '还没有宠物 —— 宠物蛋只在割草关掉落');
      } else if (r.count) {
        APOC.UI.toast('success', '吞噬 ' + r.count + ' 件装备，宠物获得 ' + r.count +
                      ' 点经验' + (r.gold > 0 ? '，返还 ' + APOC.Formula.fmt(r.gold) + ' 金币' : ''));
      } else {
        APOC.UI.toast('info', '没有比身上更差的装备可吞噬');
      }
    });
    foot.querySelector('#bag-sell-q').addEventListener('click', function () {
      var list = Object.keys(sellSel).filter(function (k) { return sellSel[k]; }).map(Number);
      if (!list.length) { APOC.UI.toast('warn', '请先勾选要分解的品质'); return; }
      APOC.Inventory.sellByQuality(list);
      selected = null;
      refresh();
    });

    /* 选中装备的操作 */
    actions.querySelector('#bag-equip').addEventListener('click', function () {
      var item = selected ? findItem(selected) : null;
      if (!item) return;
      if (APOC.Inventory.isEquipped(item)) APOC.Inventory.unequip(APOC.Inventory.itemSlot(item));
      else APOC.Inventory.equip(item);
      selected = null;
      refresh();
    });
    actions.querySelector('#bag-enh').addEventListener('click', function () {
      var item = selected ? findItem(selected) : null;
      if (!item) return;
      var r = APOC.Inventory.enhance(item);
      if (r.reason === 'max') {
        APOC.UI.toast('info', '已经强化到满级（+' + APOC.Config.ENH_MAX + '）');
      } else if (r.reason === 'gold') {
        APOC.UI.toast('warn', '金币不够：需要 ' + APOC.Formula.fmt(r.cost.gold));
      } else if (r.reason === 'mat') {
        APOC.UI.toast('warn', '材料不够：需要 ' + r.cost.mat + ' 个');
      } else if (r.ok) {
        APOC.UI.toast('success', '强化成功 → +' + r.level +
                      '（属性 ×' + APOC.Inventory.enhMul(item).toFixed(2) + '）');
        APOC.Audio.play('drop_rare', { gap: 0.2 });
      } else {
        /* ★ 失败要把"材料和金币照扣"讲清楚，否则玩家会以为点了个寂寞 */
        APOC.UI.toast('danger', '强化失败，等级保持 +' + r.level +
                      '（材料与金币已消耗）');
      }
      APOC.Bus.emit('bag:change');
      refresh();
    });

    actions.querySelector('#bag-enh10').addEventListener('click', function () {
      var item = selected ? findItem(selected) : null;
      if (!item) return;
      var r = APOC.Inventory.enhanceBatch(item, C.ENH_BATCH);
      var matName = (r.matId && APOC.Data.Materials[r.matId])
        ? APOC.Data.Materials[r.matId].name : '材料';
      var spent = '（消耗 ' + APOC.Formula.fmt(r.gold) + ' 金币 · ' + r.mat + ' ' + matName + '）';
      if (!r.tries) {
        APOC.UI.toast('warn', r.reason === 'max' ? '已经满级了'
          : r.reason === 'gold' ? '金币不够，一次都没点成'
          : '材料不够，一次都没点成');
      } else {
        var tail = r.reason === 'max' ? '　已达上限'
          : r.reason === 'gold' ? '　金币不够，中断'
          : r.reason === 'mat' ? '　材料不够，中断' : '';
        APOC.UI.toast(r.ups ? 'success' : 'info',
          '强化 ' + r.tries + ' 次：成功 ' + r.ups + ' 次 → +' + r.level + tail + spent);
        if (r.ups) APOC.Audio.play('drop_rare', { gap: 0.2 });
      }
      APOC.Bus.emit('bag:change');
      refresh();
    });

    actions.querySelector('#bag-sell-one').addEventListener('click', function () {
      var item = selected ? findItem(selected) : null;
      if (!item) return;
      if (APOC.Inventory.isEquipped(item)) { APOC.UI.toast('warn', '先卸下才能分解'); return; }
      APOC.Inventory.sell(item);
      APOC.Inventory.removeFromBag(item.uid);
      APOC.Bus.emit('bag:change');
      selected = null;
      refresh();
    });
  }

  function findItem(uid) {
    var bag = APOC.State.data.bag;
    for (var i = 0; i < bag.length; i++) if (bag[i].uid === uid) return bag[i];
    return null;
  }

  function slotHTML(slot) {
    if (slot === 'weapon') {
      var w = APOC.Tech.currentWeapon();
      if (!w) return '<div class="slot empty"><span class="tag">武器</span><span class="nm">无</span></div>';
      return '<div class="slot" style="border-color:var(--accent)">' +
        '<span class="tag">武器</span>' +
        '<span class="ico">' + APOC.Sprites.iconTag('weapon', w.id, 44, w.icon) + '</span>' +
        '<span class="nm" style="color:var(--accent)">' + w.name + '</span>' +
        '<span class="lv">Lv.' + APOC.Tech.nodeLevel(w.id) + '</span></div>';
    }
    var item = APOC.Inventory.equippedItem(slot);
    if (!item) {
      return '<div class="slot empty"><span class="tag">' + C.SLOT_NAMES[slot] +
             '</span><span class="nm">空</span></div>';
    }
    /* 套装件打一个「套」标 —— 不标的话玩家根本看不出哪件是哪套的 */
    var set = APOC.Data.setOfItem(item);
    return '<div class="slot" data-item-uid="' + item.uid + '" style="border-color:var(--q' + item.quality + ')">' +
      '<span class="tag">' + C.SLOT_NAMES[slot] + '</span>' +
      (set ? '<span class="set-tag" title="' + set.name + '">套</span>' : '') +
      '<span class="ico">' + APOC.Sprites.iconTag('equip', item.protoId, 48, APOC.Inventory.itemIcon(item)) + '</span>' +
      '<span class="nm" style="color:var(--q' + item.quality + ')">' + APOC.Inventory.itemName(item) + '</span>' +
      '<span class="lv">Lv.' + item.level + '</span></div>';
  }

  function refresh() {
    if (!el || el.hidden) return;
    var D = APOC.State.data;
    var inv = APOC.Inventory;

    /* 装备槽 */
    body.querySelector('#bag-equip').innerHTML = SLOT_ORDER.map(slotHTML).join('');

    /* 背包网格：**不显示身上已装备的那些**（用户定）。
       装备了的在左边「装备槽」里已经有一份了，再在背包里显示一遍纯属重复 ——
       而且玩家一眼扫过去分不清"这件是包里的还是要换的"。
       计数也跟着只算包里的，否则会出现"显示 11 件、计数写 16"的对不上。
       ★ 底层数据没变：已装备的仍然存在 D.bag 里（换装/评分/自动分解全靠这个），
       这里只是**渲染时过滤**，不改任何逻辑。 */
    var shown = D.bag.filter(function (it) { return !inv.isEquipped(it); });
    body.querySelector('#bag-count').innerHTML =
      '背包 <small style="color:var(--text-sub)">' + shown.length + ' / ' + D.bagSize + '</small>';

    var bag = shown.slice().sort(function (a, b) {
      var d = inv.scoreItem(b) - inv.scoreItem(a);
      return d !== 0 ? d : (b.level - a.level);
    });
    body.querySelector('#bag-grid').innerHTML = bag.map(function (it) {
      /* 品质用边框颜色区分：原来所有格子都是同一个灰边框，白装和橙装长得一模一样 */
      var cls = 'bag-cell q' + it.quality + (selected === it.uid ? ' sel' : '');
      return '<div class="' + cls + '" data-item-uid="' + it.uid + '">' +
        APOC.Sprites.iconTag('equip', it.protoId, 44, inv.itemIcon(it)) +
        '<span class="lv" style="color:var(--q' + it.quality + ')">' + it.level + '</span>' +
        (inv.enhLevel(it) ? '<span style="position:absolute;top:0;left:3px;font-size:9px;' +
          'color:var(--gold)">+' + inv.enhLevel(it) + '</span>' : '') +
        '</div>';
    }).join('');

    /* 选中操作条 */
    var item = selected ? findItem(selected) : null;
    if (item) {
      actions.hidden = false;
      var isEq = inv.isEquipped(item);
      var enh = inv.enhLevel(item);
      actions.querySelector('#bag-sel-name').innerHTML =
        '<span style="color:var(--q' + item.quality + ')">' + inv.itemName(item) + '</span>' +
        (enh ? ' <span style="color:var(--gold)">+' + enh + '</span>' : '') +
        ' <span style="color:var(--text-dim)">评分 ' + Math.round(inv.scoreItem(item)) + '</span>';
      actions.querySelector('#bag-equip').textContent = isEq ? '卸下' : '装备';
      actions.querySelector('#bag-sell-one').disabled = isEq;
      /* 强化按钮直接显示"下一级"的级数，玩家不用点开才知道现在几级。
         成本与成功率放在 tooltip 里（见 effects.js 的 itemTipHTML）。 */
      var eb = actions.querySelector('#bag-enh');
      var cost = inv.enhanceCost(item);
      eb.textContent = cost ? ('强化 +' + cost.next) : '已满级';
      eb.disabled = !cost;
    } else {
      actions.hidden = true;
    }

    paintPet();
  }

  /* 宠物栏。没有宠物时给一句"去哪弄"，不然玩家只会看到一个空框。 */
  function paintPet() {
    var box = body.querySelector('#bag-pet');
    if (!box) return;
    var P = APOC.Pets;
    var info = P && P.info ? P.info() : null;
    if (!info) {
      box.innerHTML = '<div class="pet-empty">还没有宠物<br>' +
        '<small>宠物蛋只在割草关（每场景第 10 关）通关时掉落</small></div>';
      return;
    }
    var pct = info.maxLevel > info.level
      ? Math.min(100, info.exp / info.need * 100) : 100;
    /* 属性池摘要：只列前 4 项，按数值从大到小 —— 全列出来这一格装不下 */
    var keys = Object.keys(info.pool).filter(function (k) { return info.pool[k] > 0; });
    keys.sort(function (a, b) { return info.pool[b] - info.pool[a]; });
    var L = APOC.Config.STAT_LABEL;
    var poolTxt = keys.slice(0, 4).map(function (k) {
      /* 属性池里存的是**加成前的原始值**，显示要乘等级倍率 ——
         不乘的话玩家会看到"池子里 3 点攻击"而对不上身上的加成 */
      return (L[k] || k) + ' ' + Math.round(info.pool[k] * info.mul);
    }).join('　') || '（空，喂装备给它吃）';
    box.innerHTML =
      '<div class="pet-card q' + info.tier + '">' +
      '  <div class="pet-top">' +
      '    <b style="color:var(--q' + info.tier + ')">' + info.tierName + '</b>' +
      '    <span>Lv.' + info.level + (info.maxLevel > info.level ? ' / ' + info.maxLevel : ' 满') + '</span>' +
      '    <span style="color:var(--text-dim)">吸收 ' + info.absorb + '%</span>' +
      '  </div>' +
      '  <div class="pet-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      /* 还需的件数要 clamp 到 0：升级判定在 Pets.checkLevel 里做，
         但显示层不能假设"经验一定小于升级需求" —— 满级时会直接印出负数。 */
      '  <div class="pet-exp">经验 ' + info.exp + ' / ' + info.need +
           (info.maxLevel > info.level
             ? '（还需 ' + Math.max(0, info.need - info.exp) + ' 件装备）' : '') +
           '　加成 ×' + info.mul.toFixed(2) + '</div>' +
      '  <div class="pet-pool">' + poolTxt + '</div>' +
      '</div>';
  }

  APOC.UI.registerPanel('bag', {
    get el() { return el; },
    mount: mount,
    open: refresh,
    close: function () { APOC.UIEffects.hideTip(); selected = null; }
  });

  APOC.Bus.on('bag:change', refresh);
  APOC.Bus.on('equip:change', refresh);
  /* 宠物升级/换宠后要把宠物栏重画（经验条、吸收率都会变） */
  APOC.Bus.on('pet:change', refresh);
})(window.APOC = window.APOC || {});
