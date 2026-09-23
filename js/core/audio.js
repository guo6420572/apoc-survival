/* audio.js — 全程序化音效（Web Audio 实时合成，零音频文件）
 *
 * 为什么不用音频文件：
 *   1. 零素材，file:// 双击就能跑，不用处理加载失败
 *   2. 没有版权问题
 *   3. 每种武器/怪物可以用参数生成不同音色，不用准备 21 套开枪音
 *
 * 浏览器策略：AudioContext 必须由用户手势创建/恢复，所以第一次点击/按键时才建。
 * 在那之前所有 play() 都是空操作。
 */
(function (APOC) {
  'use strict';

  var ctx = null, master = null, ready = false;
  var noiseBuf = null;
  var volume = 0.7, muted = false;
  var recent = {};          // 同名音效的最小间隔，防止连续开火糊成一片
  var queued = [];          // 未解锁前积压的音效（声明必须在使用它的 init() 之前）
  var MAX_VOICES = 14;      // 同屏同时发声上限
  var voices = 0;

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // 不支持就静默降级
    try { ctx = new AC(); } catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    /* 预生成 1 秒白噪声，所有噪声类音效复用同一段 buffer */
    var len = Math.floor(ctx.sampleRate);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ready = true;

    /* 有货在手就把积压的播了 */
    if (queued.length) {
      var q = queued.slice();
      queued.length = 0;
      q.forEach(function (a) { play(a[0], a[1]); });
    }
    /* 文件层的音量跟着走，并补播"手势之前就被请求过的 BGM"——
       BGM 是场景切换时发起的，那一刻通常还没有用户手势，不补播就整局没音乐 */
    syncAssetsVolume();
    if (APOC.AudioAssets && APOC.AudioAssets.resumePending) APOC.AudioAssets.resumePending();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* ★ 音量/静音要手动同步给文件层。
     音频文件走的是 <audio> 元素，**不在 Web Audio 的节点图里** ——
     设 master.gain 对它一点用都没有。少这一步的话，玩家把音量拖到 0、
     甚至点了静音，BGM 和文件音效照样在响。 */
  function syncAssetsVolume() {
    if (!APOC.AudioAssets) return;
    if (APOC.AudioAssets.setVolume) APOC.AudioAssets.setVolume(volume);
    if (APOC.AudioAssets.setMuted) APOC.AudioAssets.setMuted(muted);
  }

  /* ---------------- 合成基元 ---------------- */
  function envGen(attack, decay, peak, t0) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  /* 带通/低通扫频的噪声，枪声和挥击的骨架 */
  function noiseHit(o) {
    var t0 = now();
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.Q.value = o.q === undefined ? 1.1 : o.q;
    f.frequency.setValueAtTime(o.f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + o.dur);
    var g = envGen(0.001, o.dur, o.gain, t0);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
    return o.dur;
  }

  /* 扫频振荡器，做低频冲击和电子音 */
  function toneHit(o) {
    var t0 = now() + (o.delay || 0);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    var g = envGen(o.attack === undefined ? 0.002 : o.attack, o.dur, o.gain, t0);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + (o.attack || 0.002) + o.dur + 0.05);
    return (o.delay || 0) + o.dur;
  }

  /* 一段旋律（升级、通关） */
  function arp(notes, gap, o) {
    notes.forEach(function (f, i) {
      toneHit({ type: o.type || 'triangle', f0: f, f1: f, dur: o.dur || 0.16,
                gain: o.gain || 0.18, delay: i * gap });
    });
    return notes.length * gap;
  }

  /* ---------------- 音效表 ----------------
     每个条目返回大致时长（秒），用于节流判断。 */
  var SFX = {
    /* === 枪械：按武器分层，口径越大越沉 === */
    shot_pistol:  function () { noiseHit({ dur: 0.09, f0: 2200, f1: 380, q: 1.4, gain: 0.34 });
                                toneHit({ f0: 150, f1: 55, dur: 0.08, gain: 0.22 }); return 0.14; },
    shot_dual:    function () { noiseHit({ dur: 0.07, f0: 2400, f1: 500, q: 1.5, gain: 0.26 });
                                toneHit({ f0: 170, f1: 60, dur: 0.06, gain: 0.16 }); return 0.10; },
    shot_smg:     function () { noiseHit({ dur: 0.05, f0: 3000, f1: 900, q: 1.8, gain: 0.20 }); return 0.06; },
    shot_shotgun: function () { noiseHit({ dur: 0.26, f0: 900,  f1: 140, q: 0.7, gain: 0.42 });
                                toneHit({ f0: 90, f1: 38, dur: 0.22, gain: 0.30 }); return 0.30; },
    shot_rifle:   function () { noiseHit({ dur: 0.09, f0: 2000, f1: 420, q: 1.2, gain: 0.30 });
                                toneHit({ f0: 130, f1: 50, dur: 0.09, gain: 0.20 }); return 0.14; },
    shot_sniper:  function () { noiseHit({ dur: 0.42, f0: 3200, f1: 180, q: 0.9, gain: 0.45 });
                                toneHit({ f0: 110, f1: 34, dur: 0.38, gain: 0.34 }); return 0.48; },
    shot_rail:    function () { toneHit({ type: 'sawtooth', f0: 220, f1: 2400, dur: 0.16, gain: 0.16, attack: 0.08 });
                                noiseHit({ dur: 0.30, f0: 5200, f1: 600, q: 2.4, gain: 0.34 });
                                toneHit({ f0: 70, f1: 30, dur: 0.32, gain: 0.28, delay: 0.14 }); return 0.50; },

    /* === 近战：挥击是风声，命中是闷响 === */
    swing:        function () { noiseHit({ dur: 0.13, f0: 420, f1: 2100, q: 2.6, gain: 0.16 }); return 0.14; },
    melee_hit:    function () { noiseHit({ dur: 0.07, f0: 700, f1: 180, q: 0.8, gain: 0.30 });
                                toneHit({ f0: 120, f1: 46, dur: 0.09, gain: 0.26 }); return 0.12; },
    chainsaw:     function () { toneHit({ type: 'square', f0: 88, f1: 96, dur: 0.16, gain: 0.10 });
                                noiseHit({ dur: 0.15, f0: 1600, f1: 1300, q: 3.5, gain: 0.13 }); return 0.17; },
    smash:        function () { noiseHit({ dur: 0.20, f0: 500, f1: 90, q: 0.6, gain: 0.40 });
                                toneHit({ f0: 70, f1: 28, dur: 0.24, gain: 0.34 }); return 0.26; },

    /* === 异能：正弦/FM 的电子音 === */
    psi_cast:     function () { toneHit({ type: 'sine', f0: 520, f1: 1250, dur: 0.18, gain: 0.20 }); return 0.20; },
    psi_bolt:     function () { toneHit({ type: 'triangle', f0: 900, f1: 300, dur: 0.14, gain: 0.20 }); return 0.15; },
    psi_fire:     function () { noiseHit({ dur: 0.34, f0: 1400, f1: 260, q: 0.7, gain: 0.22 }); return 0.36; },
    psi_light:    function () { noiseHit({ dur: 0.20, f0: 6000, f1: 2200, q: 3.0, gain: 0.24 });
                                toneHit({ type: 'square', f0: 1800, f1: 420, dur: 0.14, gain: 0.10 }); return 0.24; },
    psi_frost:    function () { toneHit({ type: 'sine', f0: 2400, f1: 900, dur: 0.26, gain: 0.16 });
                                noiseHit({ dur: 0.22, f0: 5000, f1: 2600, q: 4.0, gain: 0.14 }); return 0.28; },
    psi_beam:     function () { toneHit({ type: 'sawtooth', f0: 640, f1: 640, dur: 0.26, gain: 0.14 });
                                toneHit({ type: 'sine', f0: 1280, f1: 1280, dur: 0.24, gain: 0.10 }); return 0.28; },
    psi_sing:     function () { toneHit({ type: 'sine', f0: 120, f1: 1800, dur: 0.30, gain: 0.20, attack: 0.22 });
                                noiseHit({ dur: 0.34, f0: 300, f1: 4200, q: 2.0, gain: 0.16 }); return 0.38; },

    /* === 命中反馈 === */
    hit:          function () { noiseHit({ dur: 0.05, f0: 1600, f1: 500, q: 0.9, gain: 0.20 }); return 0.06; },
    hit_crit:     function () { noiseHit({ dur: 0.09, f0: 3400, f1: 700, q: 1.6, gain: 0.30 });
                                toneHit({ type: 'square', f0: 1500, f1: 700, dur: 0.08, gain: 0.12 }); return 0.11; },
    kill:         function () { toneHit({ type: 'sawtooth', f0: 320, f1: 70, dur: 0.26, gain: 0.20 });
                                noiseHit({ dur: 0.20, f0: 1200, f1: 200, q: 0.8, gain: 0.22 }); return 0.28; },

    /* === 怪物：按体型分三档，越大越沉 === */
    mon_attack_small: function () { toneHit({ type: 'square', f0: 620, f1: 380, dur: 0.07, gain: 0.09 }); return 0.08; },
    mon_attack_big:   function () { toneHit({ type: 'sawtooth', f0: 220, f1: 120, dur: 0.16, gain: 0.16 });
                                    noiseHit({ dur: 0.14, f0: 800, f1: 220, q: 0.9, gain: 0.14 }); return 0.18; },
    mon_die_small:    function () { toneHit({ type: 'square', f0: 700, f1: 260, dur: 0.10, gain: 0.10 }); return 0.11; },
    mon_die_big:      function () { toneHit({ type: 'sawtooth', f0: 260, f1: 60, dur: 0.34, gain: 0.22 });
                                    noiseHit({ dur: 0.28, f0: 900, f1: 150, q: 0.8, gain: 0.20 }); return 0.36; },

    /* === 玩家 === */
    hurt:         function () { toneHit({ type: 'sawtooth', f0: 420, f1: 150, dur: 0.16, gain: 0.20 });
                                noiseHit({ dur: 0.12, f0: 900, f1: 250, q: 0.8, gain: 0.16 }); return 0.18; },
    levelup:      function () { return arp([523, 659, 784, 1047], 0.075, { dur: 0.20, gain: 0.16 }); },
    dodge:        function () { noiseHit({ dur: 0.09, f0: 2600, f1: 5200, q: 3.0, gain: 0.10 }); return 0.10; },

    /* === 流程 / UI === */
    stage_clear:  function () { return arp([523, 659, 784, 1047, 1319], 0.085, { dur: 0.24, gain: 0.17 }); },
    arena_clear:  function () { return arp([392, 523, 659, 784, 988, 1319], 0.10, { dur: 0.30, gain: 0.18 }); },
    boss_appear:  function () { toneHit({ type: 'sine', f0: 90, f1: 42, dur: 0.85, gain: 0.34, attack: 0.15 });
                                noiseHit({ dur: 0.80, f0: 300, f1: 90, q: 0.5, gain: 0.24 }); return 0.90; },
    death:        function () { toneHit({ type: 'sawtooth', f0: 300, f1: 45, dur: 0.70, gain: 0.26 }); return 0.72; },
    click:        function () { toneHit({ type: 'square', f0: 900, f1: 700, dur: 0.035, gain: 0.10 }); return 0.04; },
    panel:        function () { toneHit({ type: 'sine', f0: 600, f1: 900, dur: 0.06, gain: 0.09 }); return 0.07; },
    drop_rare:    function () { return arp([784, 1175], 0.09, { type: 'triangle', dur: 0.28, gain: 0.18 }); },
    drop_epic:    function () { return arp([659, 988, 1319], 0.10, { type: 'triangle', dur: 0.34, gain: 0.20 }); },
    coin:         function () { toneHit({ type: 'triangle', f0: 1400, f1: 2100, dur: 0.06, gain: 0.07 }); return 0.07; },
    error:        function () { toneHit({ type: 'square', f0: 300, f1: 180, dur: 0.12, gain: 0.12 }); return 0.13; }
  };

  /* ---------------- 播放 ---------------- */
  function play(id, opts) {
    opts = opts || {};
    if (muted) return;
    if (!ready) {
      /* 还没拿到用户手势：最多排队 12 条，多了丢最旧的 */
      if (queued.length < 12) queued.push([id, opts]);
      return;
    }
    /* 节流：同一音效最小间隔（连续开火时不会糊成一片白噪声）
       ★ 不能写成 recent[id] && ... —— currentTime 在页面刚打开时是 0，
       0 是假值，判断会失效，开火音效在第一秒内完全不节流。
       ★ 节流必须做在"选文件还是选合成"**之前**：两条路都要吃同一个节流，
         否则文件音效会绕过它，连发时同时起好几个 <audio>，比合成音还糊。 */
    var gap = opts.gap === undefined ? 0.035 : opts.gap;
    var t = now();
    if (recent[id] !== undefined && t - recent[id] < gap) return;
    recent[id] = t;
    if (voices >= MAX_VOICES) return;

    /* ★ 先看有没有对应的音频文件（见 ui/audio_assets.js）。
       有就播文件、**合成音不再响** —— 两层同时出声是"重音"，听起来像回声。 */
    if (APOC.AudioAssets && APOC.AudioAssets.playClip(id, opts)) {
      voices++;
      setTimeout(function () { voices--; }, 160);
      return;
    }

    var fn = SFX[id];
    if (!fn) return;
    voices++;
    var dur = 0;
    try { dur = fn() || 0.1; } catch (e) { voices--; return; }
    setTimeout(function () { voices--; }, Math.max(40, dur * 1000));
  }

  /* 怪物音效。★ 必须走这个入口，不要直接 play('mob_xxx')：
     SFX 表里没有 'mob_xxx' 这个 key，直接 play 会被 `if (!fn) return` 静默吞掉，
     结果是"补了怪物音反而变哑巴"。
     匹配顺序：mob_<id>_attack / mob_<id>_die → mob_<id> → 按体型的合成音。
     也就是同一只怪可以只给一条通用音，也可以拆成攻击/死亡两条。 */
  function monsterClip(mid, kind) {
    if (!APOC.AudioAssets || !APOC.AudioAssets.has) return null;
    var specific = 'mob_' + mid + '_' + kind;
    if (APOC.AudioAssets.has(specific)) return specific;
    var generic = 'mob_' + mid;
    if (APOC.AudioAssets.has(generic)) return generic;
    return null;
  }

  /* 主角语音。同样走 AudioAssets 的节流（否则攻速 5/s 会把一条语音
     反复打断重头播，等于一直在念开头两个字）。 */
  function playVoice(id) {
    if (muted || !ready) return;
    if (APOC.AudioAssets && APOC.AudioAssets.playVoice) APOC.AudioAssets.playVoice(id);
  }

  /* ---------------- 对外 ---------------- */
  APOC.Audio = {
    /* 在第一次用户手势时调用（main.js 里绑 click / keydown / touchstart） */
    unlock: function () { init(); resume(); },
    play: play,
    playVoice: playVoice,
    /* 怪物音效专用入口，理由见上面 monsterClip 的注释 */
    playMonster: function (monsterId, kind, fallbackId, opts) {
      var clip = monsterClip(monsterId, kind);
      if (clip) { play(clip, opts); return; }
      play(fallbackId, opts);
    },
    isReady: function () { return ready; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = muted ? 0 : volume;
      syncAssetsVolume();
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : volume;
      syncAssetsVolume();
    },
    isMuted: function () { return muted; },
    ids: function () { return Object.keys(SFX); }
  };

  /* 武器 id → 音效 id（表里没有的武器回退到同类默认音） */
  var WEAPON_SFX = {
    gun_1: 'shot_pistol', gun_2: 'shot_dual', gun_3: 'shot_smg', gun_4: 'shot_shotgun',
    gun_5: 'shot_rifle', gun_6: 'shot_sniper', gun_7: 'shot_rail',
    body_1: 'melee_hit', body_2: 'swing', body_3: 'smash', body_4: 'smash',
    body_5: 'chainsaw', body_6: 'melee_hit', body_7: 'smash',
    psi_1: 'psi_bolt', psi_2: 'psi_cast', psi_3: 'psi_fire', psi_4: 'psi_light',
    psi_5: 'psi_frost', psi_6: 'psi_beam', psi_7: 'psi_sing'
  };
  APOC.Audio.weaponSfx = function (weaponId) { return WEAPON_SFX[weaponId] || 'shot_pistol'; };
})(window.APOC = window.APOC || {});
