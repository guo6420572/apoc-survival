/* state.js — 存档结构 / 读写 / 迁移。存档是唯一真源 */
(function (APOC) {
  'use strict';

  var C = APOC.Config;
  var storageOK = true;

  function defaultSave() {
    return {
      version: C.SAVE_VERSION,
      createdAt: Date.now(),
      lastSaveTime: Date.now(),
      playTimeMs: 0,

      player: {
        level: 1,
        exp: 0,
        freePoints: 0,
        alloc: { str: 0, vit: 0, agi: 0, per: 0 },
        hp: C.BASE_HP,
        gold: 0,
        materials: {},
        consumables: {}
      },

      progress: {
        maxStage: 1,
        stage: 1,
        cleared: {},
        arenaClears: {}
      },

      /* 初始赠送手枪（否则开局无武器） */
      tech: { gun_1: 1 },
      equipped: {
        weapon: APOC.Config.START_WEAPON,
        helmet: null, armor: null, legs: null, boots: null, accessory: null
      },
      bag: [],
      bagSize: C.BAG_SIZE,
      /* 宠物。见 pets.js —— 形态是 { tier 阶位0~4, level, exp, stats:属性池 }
         开局白送最低阶的一只（PET_STARTER_TIER），让玩家一进游戏就知道有宠物。
         走 Pets.makePet 而不是在这里手写字面量，免得两处形状走散；
         同时留了兜底，万一 Pets 还没加载也不至于把存档造坏。 */
      pet: (APOC.Pets && APOC.Pets.makePet)
        ? APOC.Pets.makePet(C.PET_STARTER_TIER) : null,

      /* 世界难度（普通/困难/噩梦/地狱）。tier 是 Config.WORLD_TIERS 的下标。
         放在顶层而不是 settings 里：它是进度，不是"显示选项"。 */
      world: { tier: 0 },

      stats: { totalKills: 0, totalDeaths: 0, totalGoldEarned: 0 },

      settings: {
        autoNextStage: true,
        autoSellWhite: true,
        autoArenaPick: false,
        autoAlloc: true,        // 自动花掉自由属性点（关掉的话点数会一直攒着）
        showDamage: true,
        showFx: true,           // 战斗贴图特效（39 张 VFX）。割草关后期卡就关掉
        volume: 0.7,
        muted: false,
        offlineReward: true
      },

      flags: { offlinePending: null }
    };
  }

  /* ---------------- 多存档（小号） ----------------
     每个小号一个 localStorage key：SAVE_KEY + '_s1' / '_s2' / …，
     另有一个 '_cur' 记当前在用哪个槽。
     ★ 老存档兼容：老版本只有一个 SAVE_KEY。第一次跑新代码时如果 1 号槽是空的，
       就把老 key 搬进 1 号槽 —— 不搬的话老玩家的进度会"凭空消失"（读到空的新 key
       直接开新档），而且没有任何报错。搬家只做一次，不删老 key（留作后路）。 */
  var SLOT_MAX = 6;
  function slotKey(id) { return C.SAVE_KEY + '_s' + id; }
  function ptrKey() { return C.SAVE_KEY + '_cur'; }

  function rawGet(key) {
    if (!storageOK) return null;
    try { return localStorage.getItem(key); }
    catch (e) { storageOK = false; return null; }
  }
  function rawSet(key, str) {
    if (!storageOK) return;
    try { localStorage.setItem(key, str); }
    catch (e) { storageOK = false; }
  }
  function rawDel(key) {
    if (!storageOK) return;
    try { localStorage.removeItem(key); }
    catch (e) { storageOK = false; }
  }

  var curSlot = 1;
  function readSlotPtr() {
    var v = parseInt(rawGet(ptrKey()), 10);
    return (v >= 1 && v <= SLOT_MAX) ? v : 1;
  }
  /* 首次运行：把老存档搬进 1 号槽 */
  function migrateLegacySlot() {
    if (rawGet(slotKey(1)) !== null) return;
    var legacy = rawGet(C.SAVE_KEY);
    if (legacy) rawSet(slotKey(1), legacy);
  }

  function readRaw() { return rawGet(slotKey(curSlot)); }
  function writeRaw(str) { rawSet(slotKey(curSlot), str); }

  function migrate(obj) {
    /* 未来版本升级在这里按 version 逐级迁移 */
    if (!obj || typeof obj !== 'object') return null;
    if (obj.version !== C.SAVE_VERSION && !obj.version) return null;
    var def = defaultSave();
    /* 补齐新增字段，避免老存档缺 key 崩掉 */
    Object.keys(def).forEach(function (k) {
      if (obj[k] === undefined) obj[k] = def[k];
    });
    Object.keys(def.player).forEach(function (k) {
      if (obj.player[k] === undefined) obj.player[k] = def.player[k];
    });
    Object.keys(def.settings).forEach(function (k) {
      if (obj.settings[k] === undefined) obj.settings[k] = def.settings[k];
    });
    /* ★ 背包扩容：老存档里存着的还是旧的 80。
       只往上调，**绝不往下调** —— 调小会让背包里超出的装备直接消失
       （bag 数组还在，但 UI 按 bagSize 渲染，多出来的部分玩家再也点不到）。 */
    if (!(obj.bagSize >= C.BAG_SIZE)) obj.bagSize = C.BAG_SIZE;
    /* 宠物系统上线前的老存档没有 pet 字段 —— 上面那个"补齐缺失字段"的循环
       会把它填成默认值（= 开局的低级宠）。这是**故意的**：
       给没有宠物的玩家补一只，总比让他对着空宠物栏不知道去哪弄强。
       注意这里只补"没有"，绝不动已经有宠物（哪怕是 null 以外的任何形态）的存档。 */
    if (!obj.pet && APOC.Pets && APOC.Pets.makePet) {
      obj.pet = APOC.Pets.makePet(C.PET_STARTER_TIER);
    }
    return obj;
  }

  var dirty = false, lastWrite = 0, writeTimer = null;

  APOC.State = {
    data: null,
    isStorageOK: function () { return storageOK; },

    defaultSave: defaultSave,

    init: function () {
      migrateLegacySlot();          // 老存档搬家（只做一次）
      curSlot = readSlotPtr();
      var raw = readRaw(), obj = null;
      if (raw) {
        try { obj = JSON.parse(raw); } catch (e) { obj = null; }
      }
      obj = migrate(obj);
      if (!obj) {
        if (raw) {
          /* 存档损坏 → 备份后重建，不崩溃 */
          writeRaw(JSON.stringify({ broken: raw }).slice(0, 200000));
          try { localStorage.setItem(C.SAVE_KEY + '_backup', raw); } catch (e) {}
        }
        obj = defaultSave();
      }
      APOC.State.data = obj;
      APOC.Stats.markDirty();
      return obj;
    },

    /* 节流写盘：5 秒一次 */
    markDirty: function () {
      dirty = true;
      if (writeTimer) return;
      var self = this;
      writeTimer = setTimeout(function () {
        writeTimer = null;
        if (dirty) self.save();
      }, C.SAVE_THROTTLE_MS);
    },

    save: function (force) {
      if (!APOC.State.data) return;
      var now = Date.now();
      if (!force && now - lastWrite < C.SAVE_THROTTLE_MS) { dirty = true; return; }
      lastWrite = now;
      dirty = false;
      APOC.State.data.lastSaveTime = now;
      try { writeRaw(JSON.stringify(APOC.State.data)); }
      catch (e) { console.error('[State] 存档写入失败', e); }
    },

    /* ---------------- 小号（多存档） ----------------
       slots() 返回每个槽的摘要，给设置面板画列表用。
       ★ 槽位摘要必须**直接读 localStorage**，不能用内存里的 State.data —— 非当前槽
         的数据根本不在内存里。 */
    SLOT_MAX: SLOT_MAX,
    currentSlot: function () { return curSlot; },

    slots: function () {
      var out = [];
      for (var id = 1; id <= SLOT_MAX; id++) {
        var raw = rawGet(slotKey(id));
        var info = { id: id, used: false, cur: (id === curSlot),
                     level: 0, maxStage: 1, playTimeMs: 0, lastSaveTime: 0, broken: false };
        if (raw) {
          info.used = true;
          try {
            var o = JSON.parse(raw);
            info.level = (o.player && o.player.level) || 1;
            info.maxStage = (o.progress && o.progress.maxStage) || 1;
            info.playTimeMs = o.playTimeMs || 0;
            info.lastSaveTime = o.lastSaveTime || 0;
          } catch (e) { info.broken = true; }
        }
        out.push(info);
      }
      return out;
    },

    /* 新开小号：找编号最小的空槽，切过去并开新档 */
    newSlot: function () {
      var list = APOC.State.slots();
      for (var i = 0; i < list.length; i++) {
        if (!list[i].used) {
          APOC.State.switchSlot(list[i].id, true);
          return list[i].id;
        }
      }
      return 0;                     // 槽满了
    },

    /* 切换小号。empty=true 表示切过去之后要开新档（newSlot 用） */
    switchSlot: function (id, empty) {
      id = Math.round(id);
      if (!(id >= 1 && id <= SLOT_MAX)) return false;
      if (id === curSlot && !empty) return true;
      APOC.State.save(true);        // ★ 先把当前槽强制落盘，再换指针
      curSlot = id;
      rawSet(ptrKey(), String(id));
      if (empty) {
        APOC.State.data = defaultSave();
        APOC.State.save(true);
      } else {
        APOC.State.init();          // 从新槽重新读档
      }
      APOC.Stats.markDirty();
      /* 换档等于换了一整套装备/科技/进度，这三个事件必须都发，
         否则面板会拿着旧档的数据画 */
      APOC.Bus.emit('equip:change');
      APOC.Bus.emit('tech:change');
      APOC.Bus.emit('bag:change');
      APOC.Bus.emit('stage:change');
      return true;
    },

    deleteSlot: function (id) {
      id = Math.round(id);
      if (!(id >= 1 && id <= SLOT_MAX)) return false;
      rawDel(slotKey(id));
      if (id === curSlot) {         // 删的是当前槽 → 切回 1 号槽（空的就当新档）
        curSlot = 1;
        rawSet(ptrKey(), '1');
        APOC.State.init();
        APOC.Stats.markDirty();
        APOC.Bus.emit('equip:change');
        APOC.Bus.emit('tech:change');
      }
      return true;
    },

    reset: function () {
      APOC.State.data = defaultSave();
      APOC.Stats.markDirty();
      APOC.State.save(true);
      APOC.Bus.emit('equip:change');
      APOC.Bus.emit('tech:change');
    },

    /* 导出/导入：Base64 */
    exportText: function () {
      var json = JSON.stringify(APOC.State.data);
      return btoa(unescape(encodeURIComponent(json)));
    },
    importText: function (txt) {
      try {
        var json = decodeURIComponent(escape(atob(txt.trim())));
        var obj = migrate(JSON.parse(json));
        if (!obj) return false;
        APOC.State.data = obj;
        APOC.Stats.markDirty();
        APOC.State.save(true);
        return true;
      } catch (e) { return false; }
    }
  };

  /* 切后台 / 关页面时强制落盘 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) APOC.State.save(true);
  });
  window.addEventListener('beforeunload', function () { APOC.State.save(true); });
})(window.APOC = window.APOC || {});
