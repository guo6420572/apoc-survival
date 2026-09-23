/* panel_settings.js — 设置 / 存档导入导出 */
(function (APOC) {
  'use strict';

  var el = null, body = null;

  var TOGGLES = [
    { k: 'autoNextStage', n: '自动挑战下一关', d: '通关后自动进入下一关' },
    { k: 'autoSellWhite', n: '自动分解破损装备', d: '白色品质不进背包，直接转金币与材料' },
    { k: 'autoArenaPick', n: '割草强化全自动', d: '开启后三选一不再弹窗，自动选品质最高的那个' },
    { k: 'autoAlloc',     n: '自动加点',       d: '自动把自由属性点按 力量3:体质1.5:感知1 花掉' },
    { k: 'showDamage',    n: '显示伤害数字',   d: '关闭可让画面更干净' },
    { k: 'showFx',        n: '战斗特效',       d: '弹道/命中/爆炸等贴图特效。割草关后期卡就关掉它' },
    { k: 'offlineReward', n: '离线收益',       d: '关闭后离线不再累计收益' }
  ];

  function mount() {
    if (el) return;
    el = APOC.UI.makeShell('设置');
    body = el.querySelector('.panel-body');

    var html = '';
    html += '<h3 style="font-size:12px;color:var(--text-sub);font-weight:400;margin-bottom:6px">难度</h3>';
    html += '<div class="set-row">' +
      '<div><div>世界难度：<b id="set-world-name" style="color:var(--accent)">普通</b></div>' +
      '<div class="desc">怪物生命与攻击 ×1 / ×10 / ×100 / ×1000。' +
      '<b style="color:var(--danger)">每次切换都会结算一次</b>：等级归零、科技树清空、' +
      '加点保留 25%、宠物属性保留 50%（金币 / 材料 / 装备 / 关卡进度不受影响）。</div></div>' +
      '</div>';
    html += '<div id="set-world" class="diff-row"></div>';

    html += '<h3 style="font-size:12px;color:var(--text-sub);font-weight:400;margin:18px 0 6px">挂机选项</h3>';
    TOGGLES.forEach(function (t) {
      html += '<div class="set-row">' +
        '<div><div>' + t.n + '</div><div class="desc">' + t.d + '</div></div>' +
        '<div class="switch" data-toggle="' + t.k + '"></div></div>';
    });

    html += '<h3 style="font-size:12px;color:var(--text-sub);font-weight:400;margin:18px 0 6px">音效</h3>';
    html += '<div class="set-row">' +
      '<div><div>总音量</div><div class="desc">全部音效都是实时合成的，没有音频文件</div></div>' +
      '<input id="set-vol" type="range" min="0" max="100" style="width:150px;accent-color:var(--accent)">' +
      '</div>';
    html += '<div class="set-row">' +
      '<div><div>静音</div><div class="desc">临时关掉所有声音，设置会存进存档</div></div>' +
      '<div class="switch" data-toggle="muted"></div></div>';

    html += '<h3 style="font-size:12px;color:var(--text-sub);font-weight:400;margin:18px 0 6px">存档</h3>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="set-export" style="height:32px;padding:0 16px">导出存档</button>' +
      '<button id="set-import" style="height:32px;padding:0 16px">导入存档</button>' +
      '<button id="set-reset" style="height:32px;padding:0 16px;border-color:var(--danger);color:var(--danger)">' +
      '清空重来</button></div>';
    html += '<textarea id="set-text" placeholder="导出的存档字符串会出现在这里；导入时把字符串粘进来再点「导入存档」" ' +
      'style="width:100%;height:90px;margin-top:10px;background:#0c0a09;color:var(--text-sub);' +
      'border:1px solid var(--border);border-radius:4px;padding:8px;font-size:11px;resize:vertical"></textarea>';
    html += '<h3 style="font-size:12px;color:var(--text-sub);font-weight:400;margin:18px 0 6px">小号（多存档）</h3>';
    html += '<div id="set-slots"></div>';
    html += '<button id="set-newslot" style="height:32px;padding:0 16px;margin-top:8px">＋ 新开小号</button>';
    html += '<div id="set-storage" style="margin-top:10px;font-size:12px;color:var(--text-dim)"></div>';

    body.innerHTML = html;
    APOC.UI.overlay().appendChild(el);
    renderWorld();

    body.addEventListener('input', function (ev) {
      if (ev.target.id === 'set-vol') {
        var v = parseInt(ev.target.value, 10) / 100;
        APOC.State.data.settings.volume = v;
        APOC.Audio.setVolume(v);
        if (v > 0) { APOC.State.data.settings.muted = false; APOC.Audio.setMuted(false); syncSwitches(); }
        APOC.State.markDirty();
        APOC.Audio.play('click', { gap: 0 });    // 拖动时即时试听
      }
    });

    body.addEventListener('click', function (ev) {
      /* ---- 世界难度 ---- */
      var wb = ev.target.closest ? ev.target.closest('[data-world]') : null;
      if (wb) {
        var wi = parseInt(wb.dataset.world, 10);
        var W = APOC.World;
        if (wi === W.index()) return;
        if (!confirm(switchWorldText(wi))) return;
        var r = W.switchTo(wi);
        if (!r.ok) return;
        APOC.UI.toast('warn', '已切换到「' + r.tier.name + '」，等级与科技已归零');
        APOC.enterStage(APOC.State.data.progress.stage);   // 属性全变了，重建战场
        refresh();
        return;
      }
      var sw = ev.target.closest ? ev.target.closest('[data-toggle]') : null;
      if (sw) {
        var k = sw.dataset.toggle;
        APOC.State.data.settings[k] = !APOC.State.data.settings[k];
        sw.classList.toggle('on', APOC.State.data.settings[k]);
        if (k === 'muted') APOC.Audio.setMuted(APOC.State.data.settings[k]);
        APOC.State.markDirty();
        return;
      }
      var t = ev.target;
      /* ---- 小号（多存档） ---- */
      if (t.id === 'set-newslot') {
        var n = APOC.State.newSlot();
        if (!n) { APOC.UI.toast('warn', '小号槽已满（最多 ' + APOC.State.SLOT_MAX + ' 个）'); return; }
        APOC.UI.toast('success', '已新开小号 ' + n);
        reloadPage();
        return;
      }
      if (t.dataset && t.dataset.slot) {
        var sid = parseInt(t.dataset.slot, 10);
        if (!confirm('切换到小号 ' + sid + '？当前进度会先保存。')) return;
        APOC.State.switchSlot(sid);
        reloadPage();
        return;
      }
      if (t.dataset && t.dataset.delslot) {
        var did = parseInt(t.dataset.delslot, 10);
        if (!confirm('删除小号 ' + did + ' 的存档？不可撤销。')) return;
        APOC.State.deleteSlot(did);
        APOC.UI.toast('warn', '已删除小号 ' + did);
        renderSlots();
        return;
      }

      var id = t.id;
      if (id === 'set-export') {
        body.querySelector('#set-text').value = APOC.State.exportText();
        APOC.UI.toast('success', '已导出，复制文本框内容即可备份');
      } else if (id === 'set-import') {
        var txt = body.querySelector('#set-text').value.trim();
        if (!txt) { APOC.UI.toast('warn', '请先粘贴存档字符串'); return; }
        if (APOC.State.importText(txt)) {
          APOC.UI.toast('success', '导入成功');
          APOC.Stats.markDirty();
          APOC.enterStage(APOC.State.data.progress.stage);
        } else {
          APOC.UI.toast('danger', '存档格式不正确');
        }
      } else if (id === 'set-reset') {
        if (!confirm('确定要清空全部进度重新开始吗？此操作不可撤销。')) return;
        APOC.State.reset();
        APOC.UI.toast('warn', '已重置');
        APOC.enterStage(1);
      }
    });
  }

  /* ★ 切换小号之后直接刷新整页。
     小号之间的装备/科技/进度/割草强化全都不一样，热切换要逐个通知面板 + 重建战斗状态，
     漏一个就会拿着旧档的数据画（而且不报错）。刷页最省事也最不会出错。
     测试沙箱里没有 location，所以要挡一下。 */
  function reloadPage() {
    if (typeof location !== 'undefined' && location.reload) location.reload();
  }

  function fmtPlay(ms) {
    var m = Math.floor((ms || 0) / 60000);
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderSlots() {
    var box = body.querySelector('#set-slots');
    if (!box) return;
    var html = '';
    APOC.State.slots().forEach(function (s) {
      var label = s.used
        ? ('小号 ' + s.id + '　Lv.' + s.level + '　第 ' + s.maxStage + ' 关　' + fmtPlay(s.playTimeMs))
        : ('小号 ' + s.id + '　空闲');
      html += '<div class="set-row">' +
        '<div><div>' + label +
        (s.cur ? '　<b style="color:var(--accent)">● 使用中</b>' : '') +
        (s.broken ? '　<b style="color:var(--danger)">存档损坏</b>' : '') + '</div>' +
        '<div class="desc">' + (s.used && s.lastSaveTime ? '上次保存 ' + fmtTime(s.lastSaveTime) : '还没有存档') + '</div></div>' +
        '<div style="display:flex;gap:6px">' +
        (s.cur ? '' : '<button data-slot="' + s.id + '" style="height:28px;padding:0 12px">切换</button>') +
        /* ★ 不给"删除当前小号"的入口 —— 那是把自己正在玩的档删掉。
           想清空当前档用上面的「清空重来」。 */
        (s.used && !s.cur ? '<button data-delslot="' + s.id + '" style="height:28px;padding:0 12px;' +
          'border-color:var(--danger);color:var(--danger)">删除</button>' : '') +
        '</div></div>';
    });
    box.innerHTML = html;
  }

  /* 切换难度的确认文案。★ 把"要付出什么代价"逐条摆出来 ——
     这是不可撤销的操作，只写"确定切换吗"等于把玩家坑一次。 */
  function switchWorldText(wi) {
    var W = APOC.World;
    var to = W.tiers()[wi], from = W.cur();
    var p = APOC.State.data.player;
    return '切换到「' + to.name + '」？\n\n' +
      '怪物生命与攻击：×' + from.mul + ' → ×' + to.mul + '\n\n' +
      '本次切换立刻结算：\n' +
      '· 等级归零（Lv.' + p.level + ' → Lv.1）\n' +
      '· 科技树全部清空（武器退回初始手枪）\n' +
      '· 加点保留 25%\n' +
      '· 宠物属性保留 50%\n\n' +
      '金币 / 材料 / 装备 / 关卡进度不受影响。此操作不可撤销，' +
      '且切回低难度时同样会再结算一次。';
  }

  function renderWorld() {
    var box = body.querySelector('#set-world');
    if (!box) return;
    var W = APOC.World;
    var html = '';
    W.info().list.forEach(function (t) {
      html += '<button class="diff-btn' + (t.on ? ' on' : '') + '" data-world="' + t.index + '">' +
        t.name + '<em>×' + t.mul + '</em></button>';
    });
    box.innerHTML = html;
    var nm = body.querySelector('#set-world-name');
    if (nm) nm.textContent = W.name();
  }

  function syncSwitches() {
    var s = APOC.State.data.settings;
    Array.prototype.forEach.call(body.querySelectorAll('[data-toggle]'), function (sw) {
      sw.classList.toggle('on', !!s[sw.dataset.toggle]);
    });
  }

  function refresh() {
    if (!el || el.hidden) return;
    var s = APOC.State.data.settings;
    syncSwitches();
    renderWorld();
    renderSlots();
    var vol = body.querySelector('#set-vol');
    if (vol) vol.value = Math.round((s.volume === undefined ? 0.7 : s.volume) * 100);
    body.querySelector('#set-storage').textContent = APOC.State.isStorageOK()
      ? '存档位置：浏览器 localStorage'
      : '⚠️ 当前环境无法写入 localStorage（可能是 file:// 隐私限制），进度只保存在内存中，关闭页面即丢失。';
  }

  APOC.UI.registerPanel('settings', {
    get el() { return el; },
    mount: mount,
    open: refresh,
    close: null
  });
})(window.APOC = window.APOC || {});
