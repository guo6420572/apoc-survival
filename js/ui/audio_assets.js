/* audio_assets.js — 音频文件层（BGM / 按 id 的音效覆盖 / 主角语音）
 *
 * 这一层的定位：**给合成音效打补丁，而不是取代它**。
 *   · 有同名文件 → 播文件（音质好、是设计者要的声音）
 *   · 没有文件   → 回落到 audio.js 的合成音（零素材也能出声）
 * 所以素材可以一个一个补，补到哪算哪。清单由 tools/sync_audio.py 生成
 * （assets/audio/manifest.js，用 <script> 加载 —— 不能用 fetch，见那个脚本的注释）。
 *
 * ★ 为什么用 <audio> 元素而不是 Web Audio 的 decodeAudioData：
 *   decodeAudioData 要先 fetch 到 ArrayBuffer，而 **file:// 下双击打开时
 *   fetch 本地文件会被 CORS 挡死**。本作从设计上就是"双击 index.html 就能玩"，
 *   不能为了音频破掉这条。<audio src> 不受这个限制。
 *   代价是不能用 Web Audio 的节点图混音 —— 所以音量/静音是自己遍历元素设的。
 *
 * ★ 为什么每个音效要有"元素池"：
 *   <audio> 元素不能和自己重叠播放，第二次 play() 会把上一声掐断。
 *   攻速上限 5 次/秒，单元素连发听起来就是卡带。池子里几个元素轮流上。
 */
(function (APOC) {
  'use strict';

  var C = APOC.Config;
  var clips = {};          // 音效 id -> [HTMLAudioElement, ...]
  var poolIdx = {};        // 音效 id -> 下一个要用池里第几个
  var bgmEl = null;        // BGM 只有一个元素（本来就该独占 + 循环）
  var curBgmId = null;     // **实际在放**哪首
  var wantBgmId = null;    // **想放**哪首（手势之前就会先记下来）
  var wantBgmFile = null;
  var voiceAt = 0;         // 上次语音的时间戳，用来节流
  var volume = 0.7, muted = false;

  /* 环境探测：假 DOM（冒烟测试）里没有 Audio 构造器，整层要能安静地什么都不做，
     绝不能抛异常把 boot 打断 —— eventbus.js 那条"模块缺失只该没声音、不该崩"的规矩。 */
  function supported() {
    return typeof window !== 'undefined' &&
           typeof window.Audio === 'function' &&
           !!APOC.AudioManifest;
  }

  function makeEl(cat, file, loop) {
    var a;
    try { a = new window.Audio(); } catch (e) { return null; }
    a.preload = 'auto';
    a.loop = !!loop;
    a.src = C.AUDIO_DIR + cat + '/' + file;
    return a;
  }

  /* 把清单里的文件建成元素池。清单里没有的分类/名字，这里就不会有元素，
     audio.js 那边自然回落到合成音。 */
  function build() {
    if (!supported()) return;
    var M = APOC.AudioManifest;
    Object.keys(M).forEach(function (cat) {
      (M[cat] || []).forEach(function (file) {
        var id = file.replace(/\.[^.]+$/, '');       // 去掉扩展名当 id
        if (cat === 'bgm') return;                   // BGM 单独处理，不进池子
        if (cat === 'voice') { clips[id] = [makeEl(cat, file, false)]; return; }
        var pool = [];
        for (var i = 0; i < C.AUDIO_POOL; i++) {
          var el = makeEl(cat, file, false);
          if (el) pool.push(el);
        }
        if (pool.length) { clips[id] = pool; poolIdx[id] = 0; }
      });
    });
    applyVolume();
  }

  function applyVolume() {
    Object.keys(clips).forEach(function (id) {
      clips[id].forEach(function (el) { el.volume = muted ? 0 : volume; });
    });
    if (bgmEl) bgmEl.volume = muted ? 0 : volume * C.AUDIO_BGM_VOL;
  }

  /* 播一个文件音效。返回 true 表示"这一声交给文件了，合成音不用再响"。 */
  function playClip(id, opts) {
    var pool = clips[id];
    if (!pool || !pool.length) return false;
    if (muted) return true;                     // 静音时也算"处理过了"
    opts = opts || {};
    var i = poolIdx[id] % pool.length;
    poolIdx[id] = (i + 1) % pool.length;
    var el = pool[i];
    try {
      el.currentTime = 0;                       // 上一声没播完就重头开始，不叠加
      el.volume = Math.min(1, volume * (opts.vol === undefined ? 1 : opts.vol));
      var p = el.play();
      /* 自动播放策略：还没拿到用户手势时 play() 会被拒绝，
         这里吞掉 rejection —— 那条 "Uncaught (in promise)" 会污染控制台，
         而且它本来就是我们预期内的（main.js 在第一次手势时才 unlock）。 */
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* 元素被回收/解码失败：静默，不打断战斗 */ }
    return true;
  }

  /* ---------------- BGM ----------------
     ★ 两个必须处理的现实：
       ① 场景切换（Bus 的 stage:enter）常常发生在**用户第一次点击之前**，
          那一刻 play() 会被自动播放策略拒绝。所以"想放哪首"要和"实际在放哪首"
          分开记，等 unlock 了再补播（见 resumePending）。
       ② 同一个场景重复调用（每次进关都会有 stage:enter）不能重头播，
          否则每关开头都要把 BGM 的前两秒听一遍。 */

  function playBgm(sceneId) {
    if (!supported() || !sceneId) return;
    var id = 'bgm_' + sceneId;
    var file = null;
    (APOC.AudioManifest.bgm || []).forEach(function (f) {
      if (f.replace(/\.[^.]+$/, '') === id) file = f;
    });
    /* 这个场景没配 BGM → 停掉上一首，保持安静（不要继续放上个场景的） */
    wantBgmFile = file;
    wantBgmId = file ? id : null;
    if (!file) { stopBgm(); return; }
    startBgm();
  }

  /* ★ `curBgmId` 只能在 play() **成功之后**才赋值。
     踩过的坑：原来是在调 play() 之前就先写上，而场景切换发生在用户第一次点击
     之前，那一刻 play() 会被自动播放策略拒绝 —— 可是 curBgmId 已经写进去了。
     等 unlock 后 resumePending() 再调进来时，`curBgmId === wantBgmId` 成立，
     直接 return，**音乐永远起不来，而且看不出任何异常**。
     所以被拒绝时必须保持 curBgmId 为 null，让后面那次重试真的能进去。 */
  function startBgm() {
    if (!wantBgmFile || curBgmId === wantBgmId) return;
    stopBgm();
    var el = makeEl('bgm', wantBgmFile, true);    // loop
    if (!el) return;
    bgmEl = el;
    applyVolume();
    var p = null;
    try { p = el.play(); } catch (e) { return; }   // 抛异常 = 没播成，curBgmId 保持 null
    if (p && p.then) {
      p.then(function () { curBgmId = wantBgmId; })
       .catch(function () { /* 被自动播放策略挡了：什么都不做，
                               等 audio.js 的 unlock 再调 resumePending */ });
    } else {
      curBgmId = wantBgmId;                        // 老浏览器没有 Promise 返回值
    }
  }

  function stopBgm() {
    if (bgmEl) {
      try { bgmEl.pause(); } catch (e) {}
      bgmEl = null;
    }
    curBgmId = null;
  }

  /* 用户手势到手（audio.js 的 unlock）后调一次：把之前被自动播放策略挡掉的
     BGM 补上。没有这一步的话，开局那关永远是静音的，切一次场景才有音乐。 */
  function resumePending() { startBgm(); }

  /* 主角语音。★ 必须节流：攻速上限 5 次/秒，不节流的话一条 3 秒的语音
     会被反复打断重头播，等于一直在念开头两个字。 */
  function playVoice(id, opts) {
    if (!supported()) return false;
    var t = Date.now() / 1000;
    if (t - voiceAt < C.AUDIO_VOICE_GAP) return true;   // 还在冷却，当作已处理
    if (!clips[id]) return false;
    voiceAt = t;
    return playClip(id, { vol: C.AUDIO_VOICE_VOL });
  }

  APOC.AudioAssets = {
    build: build,
    playClip: playClip,
    playBgm: playBgm,
    stopBgm: stopBgm,
    resumePending: resumePending,
    playVoice: playVoice,
    currentBgm: function () { return curBgmId; },
    has: function (id) { return !!clips[id]; },
    /* 音量/静音由 audio.js 统一管，这里只是跟着走 */
    setVolume: function (v) { volume = v; applyVolume(); },
    setMuted: function (m) { muted = !!m; applyVolume(); },
    isSupported: supported
  };

  /* 场景切换 → 换 BGM。
     ★ 监听事件而不是在 enterStage 里直接调：进普通关和进割草关是两条路径
     （combat.enter / arena.enter），各自 emit 不同事件；用事件才不用改两处，
     将来加第三种战场也不用再改这里。 */
  APOC.Bus.on('stage:enter', function (p) {
    var sc = APOC.Data.sceneOfStage(p && p.stage);
    if (sc) playBgm(sc.id);
  });
  APOC.Bus.on('arena:enter', function (p) {
    var sc = APOC.Data.sceneOfStage(p && p.stage);
    if (sc) playBgm(sc.id);
  });
})(window.APOC = window.APOC || {});
