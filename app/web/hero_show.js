/* 《三国·将星录》逐将特色音效 + 技能动画演出
 * 依赖：window.HERO_SHOW（200 将档案）、可选 window.AudioSys（共用 AudioContext）
 * 用法：HeroShow.cast(name, casterEl) / .hit(...) / .heal(...) / .control(...) / .death(...)
 */
(function () {
  'use strict';
  var DATA = window.HERO_SHOW || {};
  var RCOL = { '普通': '#926F43', '精良': '#D6DEE6', '传奇': '#DBB54D', '绝世': '#F0B93C' };
  var QUAL = 1;

  function prof(name) { return DATA[name] || null; }

  /* ============================ 音效合成 ============================ */
  var C = null, BUS = null, NOISE = null;
  var PEAK = 0.11;           // 单层基准音量

  function mkNoise() {
    var n = C.sampleRate * 2;
    var buf = C.createBuffer(1, n, C.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
    return buf;
  }

  function ensure() {
    if (C) return C;
    try {
      var AS = (typeof AudioSys !== 'undefined') ? AudioSys : window.AudioSys;
      if (AS && AS.unlock) AS.unlock();
      if (AS && AS.getCtx) {
        C = AS.getCtx();
        BUS = AS.getBus ? AS.getBus() : null;
      }
    } catch (e) { }
    if (!C) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      C = new AC();
      BUS = C.createGain();
      BUS.gain.value = 0.4;
      BUS.connect(C.destination);
    }
    if (!BUS) { BUS = C.createGain(); BUS.gain.value = 0.4; BUS.connect(C.destination); }
    NOISE = mkNoise();
    return C;
  }

  function osc(freq, t, dur, vol, type, glide, lp) {
    var o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur * 0.75);
    f.type = 'lowpass';
    f.frequency.value = lp || 3600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(BUS);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function nz(t, dur, vol, type, freq, q, sweep, hp) {
    if (dur <= 0.005) return;
    var s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = NOISE; s.loop = true;
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(freq || 800, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    f.Q.value = q || 1.2;
    if (hp) f.type = 'highpass';
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(BUS);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* 音色层：每个函数 (t, p, s) — p=档案, s=力度系数 */
  var LAYER = {
    /* —— 物理写实族 —— */
    impact: function (t, p, s) {          // 闷重钝击
      osc(p.f0 * 0.62, t, 0.26 * p.rate, PEAK * 1.15 * s, 'sine', p.f0 * 0.30, 900);
      nz(t, 0.11, PEAK * 0.85 * s, 'lowpass', 700, 0.8, 180);
    },
    hoof: function (t, p, s) {            // 马蹄四拍
      for (var i = 0; i < 4; i++) {
        var tt = t + i * 0.085 * p.rate;
        nz(tt, 0.055, PEAK * 0.7 * s, 'bandpass', 340 + p.f0 * 0.4, 2.2);
        osc(p.f0 * 0.55, tt, 0.07, PEAK * 0.5 * s, 'sine', p.f0 * 0.4, 500);
      }
    },
    twang: function (t, p, s) {           // 弓弦
      osc(p.f0 * 2.6, t, 0.16 * p.rate, PEAK * s, 'sawtooth', p.f0 * 1.5, 2600);
      nz(t, 0.05, PEAK * 0.6 * s, 'highpass', 2200, 0.9);
    },
    metal: function (t, p, s) {           // 刀剑金属
      var base = 1800 + (p.f0 - 150) * 2.6;
      osc(base, t, 0.30 * p.rate, PEAK * 0.72 * s, 'triangle', base * 0.96, 6000);
      osc(base * 1.52, t + 0.012, 0.24 * p.rate, PEAK * 0.5 * s, 'triangle', base * 1.4, 7000);
      nz(t, 0.09, PEAK * 0.8 * s, 'highpass', 3200, 0.7);
    },
    whoosh: function (t, p, s) {          // 气劲
      nz(t, 0.42 * p.rate, PEAK * 0.85 * s, 'bandpass', 320, 1.4, 2400);
    },
    arrow: function (t, p, s) {           // 箭矢破空
      nz(t, 0.16, PEAK * 0.75 * s, 'highpass', 2600, 0.9, 1400);
      osc(p.f0 * 3.2, t, 0.09, PEAK * 0.4 * s, 'sine', p.f0 * 2.0, 5000);
    },
    iron: function (t, p, s) {            // 铁盾闷响
      osc(p.f0 * 0.85, t, 0.34 * p.rate, PEAK * 1.0 * s, 'square', p.f0 * 0.7, 1200);
      nz(t, 0.22, PEAK * 0.7 * s, 'bandpass', 640, 1.6);
    },
    bone: function (t, p, s) {            // 骨节脆响
      for (var i = 0; i < 3; i++) {
        nz(t + i * 0.028, 0.022, PEAK * 0.9 * s, 'highpass', 3600, 1.6);
        osc(3600 + i * 400, t + i * 0.028, 0.03, PEAK * 0.4 * s, 'square', null, 8000);
      }
    },
    chain: function (t, p, s) {           // 铁链
      for (var i = 0; i < 6; i++) {
        var tt = t + i * 0.042 + Math.random() * 0.02;
        osc(2200 + Math.random() * 2400, tt, 0.06, PEAK * 0.42 * s, 'square', null, 9000);
        nz(tt, 0.03, PEAK * 0.4 * s, 'highpass', 4200, 1.2);
      }
    },
    wood: function (t, p, s) {            // 木甲/藤甲
      osc(420 + p.f0 * 0.2, t, 0.16, PEAK * 0.9 * s, 'triangle', 260, 1400);
      nz(t, 0.10, PEAK * 0.6 * s, 'bandpass', 900, 1.8);
    },
    water: function (t, p, s) {           // 水声
      nz(t, 0.55 * p.rate, PEAK * 0.7 * s, 'bandpass', 900, 1.1, 400);
      var n = 4;
      for (var i = 0; i < n; i++) {
        osc(600 + Math.random() * 900, t + 0.08 + i * 0.09, 0.09, PEAK * 0.3 * s, 'sine', 1200, 3000);
      }
    },
    wind: function (t, p, s) {            // 风声
      nz(t, 0.75 * p.rate, PEAK * 0.6 * s, 'lowpass', 1200, 0.6);
      nz(t + 0.1, 0.5 * p.rate, PEAK * 0.35 * s, 'bandpass', 500, 0.9, 1400);
    },
    flag: function (t, p, s) {            // 旗布
      nz(t, 0.30 * p.rate, PEAK * 0.65 * s, 'bandpass', 1200, 1.0, 700);
      nz(t + 0.16, 0.22, PEAK * 0.4 * s, 'bandpass', 800, 1.4);
    },
    horse: function (t, p, s) {           // 马嘶
      osc(p.f0 * 3.2, t, 0.42 * p.rate, PEAK * 0.55 * s, 'sawtooth', p.f0 * 1.4, 2400);
      nz(t + 0.02, 0.34, PEAK * 0.5 * s, 'bandpass', 1400, 1.6, 600);
    },
    /* —— 玄幻/法系 —— */
    rumble: function (t, p, s) {          // 低频吟鸣
      osc(p.f0 * 0.42, t, 1.05 * p.rate, PEAK * 1.1 * s, 'sine', p.f0 * 0.34, 700);
      nz(t, 0.75, PEAK * 0.35 * s, 'lowpass', 380, 0.6);
    },
    chime: function (t, p, s) {           // 清铃三谐
      osc(p.f0 * 1.9, t, 0.75 * p.rate, PEAK * 0.55 * s, 'sine', null, 8000);
      osc(p.f0 * 2.9, t + 0.03, 0.6 * p.rate, PEAK * 0.38 * s, 'sine', null, 9000);
      osc(p.f0 * 4.3, t + 0.06, 0.45 * p.rate, PEAK * 0.26 * s, 'sine', null, 10000);
    },
    choir: function (t, p, s) {           // 和声（三音叠）
      var f = p.f0 * 0.9;
      osc(f, t, 0.95 * p.rate, PEAK * 0.5 * s, 'sine', null, 2200);
      osc(f * 1.5, t + 0.05, 0.85 * p.rate, PEAK * 0.42 * s, 'sine', null, 2600);
      osc(f * 2.02, t + 0.1, 0.7 * p.rate, PEAK * 0.32 * s, 'sine', null, 3000);
    },
    grace: function (t, p, s) {           // 仁德颂音
      var f = p.f0 * 1.1;
      osc(f, t, 1.15 * p.rate, PEAK * 0.45 * s, 'triangle', null, 4000);
      osc(f * 1.25, t + 0.12, 0.9 * p.rate, PEAK * 0.33 * s, 'triangle', null, 4200);
      nz(t, 0.9, PEAK * 0.22 * s, 'bandpass', 2000, 0.8);
    },
    fire: function (t, p, s) {            // 火燃
      nz(t, 0.7 * p.rate, PEAK * 0.85 * s, 'lowpass', 900, 0.5);
      for (var i = 0; i < 5; i++) nz(t + i * 0.1 + Math.random() * 0.05, 0.07, PEAK * 0.4 * s, 'bandpass', 1600, 1.4);
    },
    spark: function (t, p, s) {           // 电火细爆
      for (var i = 0; i < 4; i++) {
        nz(t + i * 0.035 + Math.random() * 0.02, 0.026, PEAK * 0.9 * s, 'highpass', 3000, 1.4);
      }
      osc(p.f0 * 4.0, t, 0.12, PEAK * 0.5 * s, 'sawtooth', p.f0 * 2.2, 8000);
    },
    whisper: function (t, p, s) {         // 气声
      nz(t, 0.38 * p.rate, PEAK * 0.72 * s, 'bandpass', 1500, 7, 900);
      nz(t + 0.06, 0.3, PEAK * 0.4 * s, 'bandpass', 2200, 9, 1200);
    },
    poison: function (t, p, s) {          // 毒气
      nz(t, 0.85 * p.rate, PEAK * 0.7 * s, 'bandpass', 520, 9);
      for (var i = 0; i < 4; i++) osc(260 + Math.random() * 300, t + i * 0.14, 0.1, PEAK * 0.22 * s, 'sine', 600, 1200);
    },
    ice: function (t, p, s) {             // 冰晶
      osc(p.f0 * 3.6, t, 0.35 * p.rate, PEAK * 0.6 * s, 'sine', null, 9000);
      nz(t, 0.08, PEAK * 0.7 * s, 'highpass', 4000, 1.2);
      osc(p.f0 * 5.1, t + 0.05, 0.22, PEAK * 0.3 * s, 'sine', null, 10000);
    },
    roar: function (t, p, s) {            // 兽吼
      osc(p.f0 * 0.7, t, 0.55 * p.rate, PEAK * 0.9 * s, 'sawtooth', p.f0 * 0.45, 900);
      nz(t, 0.5, PEAK * 0.65 * s, 'bandpass', 420, 1.2, 260);
    },
    beast_roar: function (t, p, s) {      // 猛兽长啸
      osc(p.f0 * 0.9, t, 0.65 * p.rate, PEAK * 0.85 * s, 'sawtooth', p.f0 * 0.4, 1100);
      nz(t + 0.05, 0.55, PEAK * 0.6 * s, 'bandpass', 700, 1.1, 340);
      osc(p.f0 * 1.8, t + 0.1, 0.4, PEAK * 0.35 * s, 'square', p.f0 * 0.9, 1600);
    },
    zither: function (t, p, s) {          // 琴拨
      osc(p.f0 * 1.15, t, 0.55 * p.rate, PEAK * 0.55 * s, 'sawtooth', p.f0 * 1.0, 3000);
      osc(p.f0 * 2.3, t + 0.02, 0.4, PEAK * 0.3 * s, 'triangle', null, 5000);
    },
    paper: function (t, p, s) {           // 竹简纸卷
      nz(t, 0.11, PEAK * 0.7 * s, 'highpass', 2200, 0.8);
      nz(t + 0.09, 0.14, PEAK * 0.5 * s, 'highpass', 1600, 0.9, 3000);
    },
    bell: function (t, p, s) {            // 铃铛
      osc(p.f0 * 2.4, t, 0.55 * p.rate, PEAK * 0.6 * s, 'triangle', null, 7000);
      osc(p.f0 * 3.9, t + 0.04, 0.35, PEAK * 0.3 * s, 'sine', null, 8000);
    },
    gong: function (t, p, s) {            // 锣
      osc(p.f0 * 0.8, t, 1.35 * p.rate, PEAK * 0.8 * s, 'sine', p.f0 * 0.72, 1800);
      osc(p.f0 * 1.28, t + 0.02, 1.1 * p.rate, PEAK * 0.45 * s, 'triangle', null, 2200);
      nz(t, 0.14, PEAK * 0.5 * s, 'lowpass', 900, 0.7);
    }
  };

  function h32(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }

  /* 个人签名音：每位武将独有的短音标，音区/时值/音族由哈希决定 */
  function sigTone(p, t, v) {
    if (!C) return;
    var h = h32('sig' + (p.id || '') + (p.kw || ''));
    var fam = h % 6;
    var base = 300 + (h % 1100);
    var dur = 0.1 + ((h >> 8) % 7) * 0.035;
    var vv = Math.max(0.05, v * 0.38);
    try {
      if (fam === 0) { osc(base, t, dur, vv, 'sine', base * 1.7, 7000); }
      else if (fam === 1) { osc(base * 1.5, t, dur, vv, 'triangle', base * 0.7, 6000); }
      else if (fam === 2) { nz(t, dur, vv, 'bandpass', base, 3.2); }
      else if (fam === 3) {
        osc(base, t, dur * 0.5, vv, 'square', null, 5000);
        osc(base * 1.26, t + dur * 0.5, dur * 0.7, vv * 0.8, 'sine', null, 6000);
      } else if (fam === 4) {
        osc(base * 0.5, t, dur * 1.2, vv * 0.9, 'sine', base * 0.42, 1200);
      } else {
        osc(base, t, dur, vv * 0.9, 'triangle', null, 8000);
        osc(base * 1.5, t + dur * 0.9, dur * 0.6, vv * 0.6, 'sine', null, 8000);
        nz(t, 0.08, vv * 0.5, 'highpass', 2400, 0.9);
      }
    } catch (e) { }
  }

  function playProfile(p, kind, scale) {
    if (!ensure()) return;
    var t = C.currentTime + 0.01;
    var s = (scale == null ? 1 : scale) * (0.62 + 0.12 * p.pow);
    var h = h32((p.id || '') + '|' + (p.kw || ''));
    var jf = 1 + (((h % 1000) / 1000) - 0.5) * 0.14;                    // 音高个人偏置 ±7%
    var jt = 1 + (((Math.floor(h / 1000) % 1000) / 1000) - 0.5) * 0.5;   // 层间隔 0.75–1.25
    var jv = 0.9 + ((Math.floor(h / 1e6) % 997) / 997) * 0.28;           // 音量 0.90–1.18
    var order = p.layers.slice(0, 3);
    order.forEach(function (name, i) {
      var fn = LAYER[name];
      if (!fn) return;
      var q = { f0: p.f0 * jf * (1 + (i - 1) * 0.05), rate: p.rate * (0.94 + 0.12 * i), pow: p.pow };
      try { fn(t + i * 0.055 * p.rate * jt, q, s * jv); } catch (e) { }
    });
    sigTone(p, t + 0.07 * p.rate, s);
  }

  /* ============================ 粒子演出 ============================ */
  var FX = (function () {
    var cv = null, cx = null, cb = null, cbx = null, W = 0, H = 0, dpr = 1;
    var parts = [], lines = [], sprs = [], raf = 0, last = 0;
    var CAP = 520;

    function attach() {
      var b = document.getElementById('battle');
      if (!b || b.hidden) return false;
      if (!cb) {
        cb = document.createElement('canvas');
        cb.id = 'heroFxBack';
        cb.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
        b.appendChild(cb);
      }
      if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'heroFx';
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
        b.appendChild(cv);
      }
      resize();
      return true;
    }

    function sizeOne(el) {
      el.width = Math.floor(W * dpr); el.height = Math.floor(H * dpr);
      var x = el.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      return x;
    }

    function resize() {
      if (!cv) return;
      var b = document.getElementById('battle');
      W = b.clientWidth; H = b.clientHeight;
      dpr = QUAL >= 1.5 ? Math.min(2, window.devicePixelRatio || 1) : 1;
      cx = sizeOne(cv);
      if (cb) cbx = sizeOne(cb);
    }

    function rel(el) {
      if (!el || !cv) return null;
      var r = el.getBoundingClientRect(), br = cv.getBoundingClientRect();
      return { x: r.left - br.left + r.width / 2, y: r.top - br.top + r.height / 2, w: r.width, h: r.height };
    }

    function push(pt) { if (parts.length < CAP) parts.push(pt); }
    function line(o) { if (lines.length < 40) lines.push(o); }
    function pushSpr(o) { if (sprs.length < 8) sprs.push(o); }

    /* 漫符层：放射速度线 + 白闪帧——国漫冲击感来自这两样，而不是线框几何 */
    var sls = [], flash = 0;
    function burst(x, y, col, n, dur) {
      if (sls.length > 4) sls.shift();
      sls.push({ x: x, y: y, t: 0, dur: dur || 0.2, col: col || '#fff1cf', n: n || 12, seed: Math.random() * 6.283 });
    }
    function flashAt(v) { flash = Math.max(flash, v); }

    function start() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (cbx) cbx.clearRect(0, 0, W, H);
      cx.clearRect(0, 0, W, H);
      var alive = 0;
      /* 国漫特效贴图：自增益类走卡片层之后(back)，攻击类走卡片层之上 */
      for (var si = sprs.length - 1; si >= 0; si--) {
        var S = sprs[si];
        S.t += dt;
        if (S.t >= S.dur) { sprs.splice(si, 1); continue; }
        alive++;
        var sk = S.t / S.dur;
        var senv = sk < 0.16 ? sk / 0.16 : 1 - Math.pow((sk - 0.16) / 0.84, 1.3);
        var ssc = S.s0 + (S.grow - S.s0) * (1 - Math.pow(1 - sk, 2.2));
        var bw = S.base * S.sx * ssc, bh = S.base * S.sy * ssc;
        var g = (S.back && cbx) ? cbx : cx;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.max(0, Math.min(1, senv)) * S.a;
        g.save();
        var fall = S.fall ? (1 - Math.min(1, sk / 0.32)) * S.fall : 0;
        g.translate(S.x, S.y - fall + (S.dy || 0) * sk);
        g.rotate(S.rot + (S.rj || 0) * sk);
        g.scale(S.flip || 1, 1);
        if (S.img && S.img.complete && S.img.naturalWidth) {
          var al = Math.max(0, Math.min(1, senv)) * S.a;
          g.globalAlpha = al;
          g.drawImage(S.img, -bw / 2, -bh / 2, bw, bh);
          if (S.tint) {
            /* 染色层是"保留原图明暗的阵营色版本"，必须用 source-over 覆盖；
               若仍留在 lighter 里叠加，只会越叠越亮、本色换了等于没换 */
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = al * 0.92;
            g.drawImage(S.tint, -bw / 2, -bh / 2, bw, bh);
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = al;
          }
        }
        g.restore();
      }
      cx.globalCompositeOperation = 'lighter';
      /* 漫符：放射速度线（起手/命中冲击） */
      for (var qi = sls.length - 1; qi >= 0; qi--) {
        var B = sls[qi];
        B.t += dt;
        if (B.t >= B.dur) { sls.splice(qi, 1); continue; }
        alive++;
        var bk = 1 - B.t / B.dur;
        var RR = Math.min(W, H) * (0.18 + 0.18 * (1 - bk));
        cx.save();
        cx.globalAlpha = bk * 0.29;
        cx.strokeStyle = B.col;
        cx.lineWidth = 1.2;
        for (var q = 0; q < B.n; q++) {
          var an = B.seed + q / B.n * R2;
          var rd = RR * (0.36 + ((q * 53 + 7) % 70) / 100);
          cx.beginPath();
          cx.moveTo(B.x + Math.cos(an) * RR * 0.16, B.y + Math.sin(an) * RR * 0.16);
          cx.lineTo(B.x + Math.cos(an) * rd, B.y + Math.sin(an) * rd);
          cx.stroke();
        }
        cx.restore();
      }
      if (flash > 0.01) {
        alive++;
        cx.save();
        cx.globalAlpha = flash;
        cx.fillStyle = '#fff6e0';
        cx.fillRect(0, 0, W, H);
        cx.restore();
        flash -= dt * 5.2;
        if (flash < 0) flash = 0;
      }
      /* 线/环 */
      for (var i = lines.length - 1; i >= 0; i--) {
        var L = lines[i];
        L.t += dt;
        var k = L.t / L.dur;
        if (k >= 1) { lines.splice(i, 1); continue; }
        alive++;
        drawLine(L, k);
      }
      /* 粒子 */
      for (var j = parts.length - 1; j >= 0; j--) {
        var p = parts[j];
        p.t += dt;
        if (p.t >= p.dur) { parts.splice(j, 1); continue; }
        alive++;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += (p.g || 0) * dt;
        p.vx *= (p.drag == null ? 1 : p.drag);
        var f = p.t / p.dur;
        var a = (p.a || 1) * (f < 0.12 ? f / 0.12 : 1 - Math.pow((f - 0.12) / 0.88, 1.4));
        if (a <= 0.01) continue;
        drawPart(p, a, f);
      }
      cx.globalCompositeOperation = 'source-over';
      if (alive === 0) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
    }

    function drawPart(p, a, f) {
      var r = p.r * (1 - 0.35 * f) * (p.grow ? 1 + f * p.grow : 1);
      if (p.shape === 'streak') {
        cx.globalAlpha = a * 0.72;
        cx.strokeStyle = p.col;
        cx.lineWidth = Math.max(1, p.r * 0.5);
        cx.beginPath();
        cx.moveTo(p.x, p.y);
        cx.lineTo(p.x - p.vx * 0.038, p.y - p.vy * 0.038);
        cx.stroke();
      } else if (p.shape === 'square') {
        cx.globalAlpha = a * 0.8;
        cx.fillStyle = p.col;
        cx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      } else {
        cx.globalAlpha = a * 0.9;
        cx.fillStyle = p.col;
        cx.beginPath(); cx.arc(p.x, p.y, Math.max(0.6, r), 0, 6.2832); cx.fill();
        cx.globalAlpha = a * 0.35;
        cx.beginPath(); cx.arc(p.x, p.y, Math.max(1, r * 1.9), 0, 6.2832); cx.fill();
      }
    }

    function drawLine(L, k) {
      cx.globalAlpha = (L.a || 1) * (1 - k) * (L.fadeIn ? Math.min(1, k * 5) : 1);
      cx.strokeStyle = L.col;
      cx.lineWidth = (L.w || 2) * (1 - 0.4 * k);
      cx.beginPath();
      if (L.type === 'ring') {
        var rr = L.r * (0.15 + k * 1.0);
        cx.arc(L.x, L.y, rr, 0, 6.2832);
      } else if (L.type === 'arc') {
        cx.arc(L.x, L.y, L.r * (0.8 + 0.2 * k), L.a0, L.a1);
      } else if (L.type === 'poly' || L.type === 'polyshield') {
        for (var i = 0; i < L.pts.length; i++) {
          var p = L.pts[i], ang = p.a + k * (L.spin || 0);
          var x = L.x + Math.cos(ang) * p.r * (0.4 + 0.6 * k);
          var y = L.y + Math.sin(ang) * p.r * (0.4 + 0.6 * k) * (L.squash || 1);
          if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
        }
      } else { /* line / bolt */
        var pts = L.pts;
        for (var q = 0; q < pts.length; q++) {
          var px = L.x + pts[q][0] * (L.grow || 1), py = L.y + pts[q][1] * (L.grow || 1);
          if (q === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
        }
      }
      cx.stroke();
      if (L.glow) {
        cx.globalAlpha *= 0.4;
        cx.lineWidth = (L.w || 2) * 3;
        cx.stroke();
      }
    }

    return {
      attach: attach,
      resize: resize,
      start: start,
      rel: rel,
      push: push,
      line: line,
      pushSpr: pushSpr,
      burst: burst,
      flash: flashAt,
      setCap: function (c) { CAP = c; },
      clear: function () { parts.length = 0; lines.length = 0; sprs.length = 0; sls.length = 0; flash = 0; if (cx) cx.clearRect(0, 0, W, H); if (cbx) cbx.clearRect(0, 0, W, H); },
      busy: function () { return parts.length + lines.length; }
    };
  })();

  /* ============================ 国漫特效贴图 ============================ */
  /* 13 张厚涂特效素材，按形态取用；尺寸/方向/镜像/时长按武将哈希微调 */
  var SPRITES = {};
  /* 贴图 1.96MB：改按需加载，首次进武将详情/进战斗时才拉，不占首屏 */
  function loadSprites() {
    if (typeof Image === 'undefined' || loadSprites._done) return;
    loadSprites._done = true;
    var forms = ['slash', 'spear', 'axe', 'bow', 'ride', 'shield', 'heal', 'fire', 'thunder', 'poison', 'shadow', 'aura', 'beast'];
    for (var i = 0; i < forms.length; i++) {
      var im = new Image();
      im.decoding = 'async';
      im.src = '/fx/fx_' + forms[i] + '.png?v=w';
      SPRITES[forms[i]] = im;
    }
  }

  /* 阵营染色层：200 将共用 13 张形态贴图时，用阵营色给同一形态"换色光"（保留原图明暗） */
  var TINTS = {};
  function tintOf(im, form, col) {
    var key = form + '|' + col;
    if (TINTS[key]) return TINTS[key];
    if (!im || !im.complete || !im.naturalWidth || typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var x = c.getContext('2d');
    x.drawImage(im, 0, 0, 256, 256);
    x.globalCompositeOperation = 'color';
    x.fillStyle = col || '#ffffff';
    x.fillRect(0, 0, 256, 256);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(im, 0, 0, 256, 256);
    TINTS[key] = c;
    return c;
  }

  var SPR_CFG = {
    slash: { at: 'mid', rot: 'dir', sx: 1.42, sy: 0.82, dur: 0.5, grow: 1.16, dy: -10, base: 0.36, a: 0.64 },
    spear: { at: 'mid', rot: 'dir', sx: 1.38, sy: 0.66, dur: 0.44, grow: 1.1, dy: 0, base: 0.36, a: 0.64 },
    axe: { at: 'tgt', rot: 0, sx: 1.45, sy: 1.09, dur: 0.54, grow: 1.16, dy: 0, base: 0.42, a: 0.52, faceDir: true },
    bow: { at: 'mid', rot: 'dir', sx: 1.34, sy: 0.78, dur: 0.44, grow: 1.12, dy: -14, base: 0.34, a: 0.6 },
    ride: { at: 'mid', rot: 'dir', sx: 1.46, sy: 0.82, dur: 0.5, grow: 1.14, dy: 8, base: 0.36, a: 0.62 },
    shield: { at: 'o', rot: 0, sx: 0.96, sy: 1.0, dur: 0.62, grow: 1.12, dy: 6, base: 0.4, a: 0.56, back: true },
    heal: { at: 'o', rot: 0, sx: 0.8, sy: 1.34, dur: 0.7, grow: 1.14, dy: 8, base: 0.36, a: 0.6, back: true },
    fire: { at: 'tgt', rot: 0, sx: 0.72, sy: 1.45, dur: 0.58, grow: 1.18, dy: 16, base: 0.32, a: 0.64 },
    thunder: { at: 'tgt', rot: 0, sx: 0.62, sy: 1.6, dur: 0.44, grow: 1.04, dy: -30, base: 0.3, a: 0.66 },
    poison: { at: 'tgt', rot: 0, sx: 1.42, sy: 0.76, dur: 0.75, grow: 1.22, dy: 0, base: 0.42, a: 0.5 },
    shadow: { at: 'tgt', rot: 0, sx: 1.45, sy: 1.09, dur: 0.4, grow: 1.12, dy: 0, base: 0.42, a: 0.56, faceDir: true },
    aura: { at: 'ground', rot: 0, sx: 0.9, sy: 1.0, dur: 0.82, grow: 1.06, dy: -10, base: 0.8, a: 0.42, back: true },
    beast: { at: 'tgt', rot: 0, sx: 1.4, sy: 1.05, dur: 0.7, grow: 1.14, dy: -28, base: 0.5, a: 0.56, faceDir: true }
  };

  function sprOn(form) {
    var im = SPRITES[form];
    return !!(im && im.complete && im.naturalWidth);
  }

  /* aura 62 人（占 31%）最集中，一张贴图压不出差别：
     先按子型(1-5)分"聚气/领域/共鸣/扩散/光柱"，再按稀有度给尺寸档 */
  var AURA_VAR = {
    1: { sx: 0.62, sy: 1.02, baseMul: 0.90, a: 0.46, dur: 0.72, dy: -30 },  /* 聚气：窄竖上升，气旋收紧 */
    2: { sx: 1.16, sy: 0.78, baseMul: 1.06, a: 0.36, dur: 1.00, dy: -6 },   /* 领域：宽摊、慢散、压场 */
    3: { sx: 0.88, sy: 0.96, baseMul: 0.98, a: 0.42, dur: 0.92, dy: -12 },  /* 共鸣：母层 + 子层双层错开 */
    4: { sx: 1.42, sy: 0.60, baseMul: 1.05, a: 0.38, dur: 0.84, dy: 0 },    /* 扩散：横向大幅铺开 */
    5: { sx: 0.52, sy: 1.22, baseMul: 0.92, a: 0.46, dur: 0.90, dy: -18 }   /* 光柱：极窄高、纵向贯起 */
  };
  var RARE_MUL = { '普通': 0.92, '精良': 1.0, '传奇': 1.08, '绝世': 1.16 };

  function castSprite(p, o, tgt, W) {
    if (!W) { var bd0 = document.getElementById('battle'); W = bd0 ? bd0.clientWidth : 400; }
    var cfg = SPR_CFG[p.form];
    var im = SPRITES[p.form];
    if (!cfg || !im || !im.complete || !im.naturalWidth) return;
    var h = h32('spr' + (p.id || '') + (p.var || 0));
    var bd = document.getElementById('battle');
    var H = bd ? bd.clientHeight : 520;
    var ax, ay;
    if (cfg.at === 'ground') { ax = W * 0.5; ay = H * 0.7; }
    else if (cfg.at === 'o') { ax = o.x; ay = o.y; }
    else if (cfg.at === 'tgt') { ax = tgt.x; ay = tgt.y; }
    else { ax = (o.x + tgt.x) / 2; ay = (o.y + tgt.y) / 2; }
    var dir = Math.atan2(tgt.y - o.y, tgt.x - o.x);
    /* aura 走子型 + 稀有度档，其余形态保持原 cfg */
    var av = p.form === 'aura' ? (AURA_VAR[p.var] || AURA_VAR[3]) : null;
    var rm = RARE_MUL[p.r] || 1;
    var sSx = av ? av.sx : cfg.sx, sSy = av ? av.sy : cfg.sy;
    var sA = (av ? av.a : (cfg.a || 0.62)) * (av ? rm : 1);
    var sDur = av ? av.dur : cfg.dur, sDy = av ? av.dy : cfg.dy;
    var sBase = (typeof cfg.base === 'number' ? cfg.base : 0.42) * (av ? av.baseMul * rm : 1);
    /* aura 是背景层，不该被 210px 上限压成小贴纸 */
    var capb = av ? Math.min(Math.round(W * 0.86), 340) : 210;
    var tint = p.col ? tintOf(im, p.form, p.col) : null;
    FX.pushSpr({
      img: im, tint: tint, x: ax, y: ay,
      rot: cfg.rot === 'dir' ? dir + ((h % 100) / 100 - 0.5) * 0.28 : cfg.rot === 'spin' ? (h % 9) * 0.4 : ((h % 100) / 100 - 0.5) * 0.2,
      sx: sSx, sy: sSy, s0: 0.68,
      grow: cfg.grow * (0.97 + (h % 11) / 100),
      dur: sDur * (0.95 + ((h >> 4) % 11) / 100),
      t: 0, a: sA, flip: cfg.faceDir ? (tgt.x < o.x ? -1 : 1) : (h % 2 ? -1 : 1), rj: (((h >> 8) % 100) / 100 - 0.5) * 0.55,
      base: Math.min(W * sBase, capb), dy: sDy,
      fall: (cfg.at === 'tgt' || cfg.at === 'mid') ? 26 : 0, back: !!cfg.back
    });
    /* 共鸣型：再起一圈更慢更小的子环，形成"两层气浪前后错开" */
    if (av === AURA_VAR[3]) {
      FX.pushSpr({
        img: im, tint: tint, x: ax, y: ay, rot: (h % 7) * 0.5, sx: sSx * 0.78, sy: sSy * 0.78,
        s0: 0.6, grow: 1.02, dur: sDur * 1.3, t: -0.34, a: sA * 0.66, flip: 1, rj: -0.3,
        base: Math.min(W * sBase, capb) * 0.72, dy: sDy * 0.5, fall: 0, back: true
      });
    }
  }

  /* ============================ 形态绘制 ============================ */
  var R2 = Math.PI * 2;

  function formSlash(p, o, tgt, boost) {
    var n = Math.round((14 + p.pow * 5) * QUAL);
    var ang = Math.atan2(tgt.y - o.y, tgt.x - o.x);
    var len = Math.min(260, Math.hypot(tgt.x - o.x, tgt.y - o.y) * 0.62);
    var cx0 = (o.x + tgt.x) / 2 - Math.cos(ang) * 30, cy0 = (o.y + tgt.y) / 2 - Math.sin(ang) * 30;
    for (var i = 0; i < n; i++) {
      var f = i / n, a = ang - 1.1 + f * 2.2;
      FX.push({ x: cx0 + Math.cos(a) * len * 0.5, y: cy0 + Math.sin(a) * len * 0.5, vx: Math.cos(a + 0.6) * 220, vy: Math.sin(a + 0.6) * 220, g: 120, r: 2.4 + p.pow * 0.5, col: i % 3 ? p.col : boost, dur: 0.42, a: 0.9, shape: i % 2 ? 'streak' : 'dot' });
    }
    if (!sprOn('slash')) {
      for (var k = 0; k < 3; k++) {
        FX.line({ type: 'arc', x: cx0, y: cy0, r: len * 0.5, a0: ang - 1.0 + k * 0.06, a1: ang + 1.0 + k * 0.06, col: k ? p.col : '#ffffff', w: 3.2 - k * 0.7, dur: 0.36 + k * 0.05, t: 0, glow: true, fadeIn: true, a: 0.9 });
      }
    }
  }

  function formSpear(p, o, tgt, boost) {
    var n = Math.round((12 + p.pow * 5) * QUAL);
    var ang = Math.atan2(tgt.y - o.y, tgt.x - o.x);
    var dist = Math.hypot(tgt.x - o.x, tgt.y - o.y);
    for (var i = 0; i < n; i++) {
      var f = i / n;
      FX.push({ x: o.x + Math.cos(ang) * dist * f, y: o.y + Math.sin(ang) * dist * f, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, g: 0, drag: 0.98, r: 2.2 + p.pow * 0.6, col: i % 4 ? p.col : boost, dur: 0.26, a: 1, shape: 'streak' });
    }
    FX.line({ type: 'line', x: o.x + Math.cos(ang) * 6, y: o.y + Math.sin(ang) * 6, pts: [[0, 0], [Math.cos(ang) * dist, Math.sin(ang) * dist]], col: '#ffffff', w: 4.5, dur: 0.22, t: 0, glow: true, grow: 1 });
    FX.line({ type: 'ring', x: tgt.x, y: tgt.y, r: 46 + p.pow * 10, col: boost, w: 3, dur: 0.35, t: 0.1, glow: true });
  }

  function formAxe(p, o, tgt, boost) {
    var n = Math.round((16 + p.pow * 6) * QUAL);
    for (var i = 0; i < n; i++) {
      var sx = tgt.x + (Math.random() - 0.5) * 90, sy = tgt.y - 150 - Math.random() * 90;
      FX.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 90, vy: 560 + Math.random() * 240, g: 900, r: 2.6 + p.pow * 0.7, col: i % 3 ? boost : '#ffffff', dur: 0.38, a: 0.95, shape: i % 2 ? 'streak' : 'dot' });
    }
    FX.line({ type: 'ring', x: tgt.x, y: tgt.y + 8, r: 84 + p.pow * 16, col: '#ffffff', w: 4, dur: 0.42, t: 0.14, glow: true });
    for (var k = 0; k < 14 * QUAL; k++) {
      FX.push({ x: tgt.x + (Math.random() - 0.5) * 130, y: tgt.y + 18, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 120, g: 220, r: 2, col: '#b9a583', dur: 0.5, a: 0.5 });
    }
  }

  function formBow(p, o, tgt, boost) {
    var ang = Math.atan2(tgt.y - o.y, tgt.x - o.x);
    var dist = Math.hypot(tgt.x - o.x, tgt.y - o.y);
    var shots = 3;
    for (var s = 0; s < shots; s++) {
      var dy = (s - 1) * 26;
      var x1 = o.x, y1 = o.y + dy, x2 = tgt.x, y2 = tgt.y - dy * 0.4;
      FX.line({ type: 'line', x: x1, y: y1, pts: [[0, 0], [x2 - x1, (y2 - y1) - 22], [x2 - x1, y2 - y1]], col: s === 1 ? '#ffffff' : p.col, w: 2.6, dur: 0.3, t: s * 0.06, glow: true });
      for (var i = 0; i < Math.round(5 * QUAL); i++) {
        var f = Math.random();
        FX.push({ x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f - Math.sin(f * Math.PI) * 18, vx: Math.cos(ang) * 500, vy: Math.sin(ang) * 500, g: 0, r: 1.8, col: boost, dur: 0.22, a: 0.9, shape: 'streak' });
      }
    }
    FX.line({ type: 'ring', x: tgt.x, y: tgt.y, r: 30, col: boost, w: 2.4, dur: 0.3, t: 0.18 });
  }

  function formRide(p, o, tgt, boost) {
    var ang = Math.atan2(tgt.y - o.y, tgt.x - o.x);
    var dist = Math.hypot(tgt.x - o.x, tgt.y - o.y);
    var n = Math.round((18 + p.pow * 8) * QUAL);
    for (var i = 0; i < n; i++) {
      var f = Math.random();
      FX.push({ x: o.x + Math.cos(ang) * dist * f, y: o.y + Math.sin(ang) * dist * f + (Math.random() - 0.5) * 46, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620 + (Math.random() - 0.5) * 60, g: 0, drag: 0.99, r: 2 + p.pow * 0.5, col: i % 3 ? p.col : boost, dur: 0.4, a: 0.85, shape: 'streak' });
    }
    FX.line({ type: 'line', x: o.x, y: o.y + 26, pts: [[0, 0], [tgt.x - o.x, tgt.y - o.y + 26]], col: p.col, w: 3, dur: 0.35, t: 0, glow: true });
    for (var k = 0; k < 10 * QUAL; k++) {
      FX.push({ x: o.x + Math.cos(ang) * dist * Math.random(), y: Math.random() * H * 0.9 + 20, vx: (Math.random() - 0.5) * 180, vy: -20 - Math.random() * 40, g: -30, r: 1.6, col: '#c9b190', dur: 0.6, a: 0.35 });
    }
  }

  function formShield(p, o, tgt, boost) {
    var R = 96 + p.pow * 20;
    if (!sprOn('shield')) {
      for (var k = 0; k < 3; k++) {
        FX.line({ type: 'polyshield', x: o.x, y: o.y, r: R * (0.7 + k * 0.18), pts: hexPts(6 + (p.pow > 1 ? 0 : 0)), col: k === 1 ? '#ffffff' : boost, w: 2.6 - k * 0.5, dur: 0.55, t: k * 0.05, glow: true, spin: 0.6 + k * 0.3 });
      }
    }
    for (var i = 0; i < Math.round((14 + p.pow * 4) * QUAL); i++) {
      var a = Math.random() * R2;
      FX.push({ x: o.x + Math.cos(a) * R * 1.2, y: o.y + Math.sin(a) * R * 1.2, vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, g: 0, r: 2, col: p.col, dur: 0.45, a: 0.7 });
    }
  }

  function hexPts(n) { var out = []; for (var i = 0; i < n; i++) out.push({ a: i / n * R2, r: 1 }); out.push(out[0]); return out; }

  function formHeal(p, o, tgt, boost) {
    var base = tgt || o;
    var n = Math.round((18 + p.pow * 6) * QUAL);
    for (var i = 0; i < n; i++) {
      FX.push({ x: base.x + (Math.random() - 0.5) * 110, y: base.y + 60 - Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: -120 - Math.random() * 90, g: -20, r: 2.2 + Math.random() * 1.4, col: i % 4 ? '#9fe6bf' : '#ffffff', dur: 0.9, a: 0.85 });
    }
    for (var k = 0; k < 3; k++) FX.line({ type: 'ring', x: base.x, y: base.y, r: 60 + k * 16, col: '#9fe6bf', w: 2.4, dur: 0.7, t: k * 0.1, glow: true });
  }

  function formFire(p, o, tgt, boost) {
    var bx = tgt ? tgt.x : o.x, by = tgt ? tgt.y + 20 : o.y + 20;
    var n = Math.round((26 + p.pow * 10) * QUAL);
    for (var i = 0; i < n; i++) {
      FX.push({ x: bx + (Math.random() - 0.5) * 130, y: by + 40 + Math.random() * 30, vx: (Math.random() - 0.5) * 70, vy: -180 - Math.random() * 200, g: 40, r: 2.4 + Math.random() * 2.4, col: i % 5 ? (Math.random() > 0.5 ? '#ff6a3c' : '#ffb347') : '#fff0b0', dur: 0.6 + Math.random() * 0.3, a: 0.9 });
    }
    for (var k = 0; k < 4 * QUAL; k++) {
      FX.push({ x: bx + (Math.random() - 0.5) * 160, y: by, vx: (Math.random() - 0.5) * 120, vy: -320, g: 120, r: 1.6, col: '#ffe28a', dur: 0.7, a: 0.8, shape: 'streak' });
    }
    if (!sprOn('fire')) FX.line({ type: 'ring', x: bx, y: by, r: 90 + p.pow * 20, col: '#ff8a4a', w: 3, dur: 0.5, t: 0.05, glow: true });
  }

  function formThunder(p, o, tgt, boost) {
    var pts = [[0, 0]];
    var sx = o.x, sy = 0, ex = tgt ? tgt.x : o.x, ey = tgt ? tgt.y : o.y;
    var seg = 6;
    for (var i = 1; i <= seg; i++) {
      var f = i / seg;
      pts.push([sx + (ex - sx) * f + (i < seg ? (Math.random() - 0.5) * 60 : 0), ey * f]);
    }
    if (!sprOn('thunder')) {
      FX.line({ type: 'line', x: 0, y: 0, pts: pts, col: '#eaf2ff', w: 3.4, dur: 0.26, t: 0, glow: true });
      FX.line({ type: 'line', x: 0, y: 0, pts: pts.map(function (q) { return [q[0] + 8, q[1] + 3]; }), col: '#8fa8ff', w: 2, dur: 0.3, t: 0.02 });
      FX.line({ type: 'ring', x: ex, y: ey, r: 80, col: '#dfe8ff', w: 3, dur: 0.4, t: 0.12, glow: true });
    }
    for (var k = 0; k < Math.round(14 * QUAL); k++) {
      FX.push({ x: ex + (Math.random() - 0.5) * 120, y: ey, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 200, g: 240, r: 1.8, col: '#ffffff', dur: 0.45, a: 0.9, shape: 'streak' });
    }
  }

  function formPoison(p, o, tgt, boost) {
    var bx = tgt ? tgt.x : o.x, by = tgt ? tgt.y : o.y;
    var n = Math.round((16 + p.pow * 5) * QUAL);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * R2, sp = 30 + Math.random() * 40;
      FX.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, g: -8, drag: 0.995, r: 6 + Math.random() * 8, col: i % 3 ? '#7fbf6a' : '#a06ad0', dur: 1.0 + Math.random() * 0.3, a: 0.28, grow: 2.2 });
    }
    if (!sprOn('poison')) FX.line({ type: 'ring', x: bx, y: by, r: 70, col: '#8fd07a', w: 2, dur: 0.8, t: 0, a: 0.6 });
  }

  function formShadow(p, o, tgt, boost) {
    var n = Math.round((16 + p.pow * 6) * QUAL);
    var tx = tgt ? tgt.x : o.x + (o.x < 300 ? 1 : -1) * 200;
    for (var i = 0; i < n; i++) {
      FX.push({ x: tx + (Math.random() - 0.5) * 60, y: (tgt ? tgt.y : o.y) + (Math.random() - 0.5) * 90, vx: (Math.random() - 0.5) * 60 - 60, vy: -40 + Math.random() * 60, g: 0, drag: 0.99, r: 2 + Math.random() * 2, col: i % 3 ? '#6b3fa0' : '#1b1024', dur: 0.4, a: 0.75, shape: 'streak' });
    }
    FX.line({ type: 'ring', x: tx, y: tgt ? tgt.y : o.y, r: 60, col: '#9b6bff', w: 2, dur: 0.35, t: 0.1, a: 0.7 });
  }

  function formAura(p, o, tgt, boost) {
    var variant = p.var || 3;
    var RMUL = [1, 0.9, 1.0, 1.05, 0.95, 1.1];
    var R = (90 + p.pow * 18) * (RMUL[variant] || 1.0);
    var shape = variant === 1 ? hexPts(4) : variant === 2 ? hexPts(8) : variant === 3 ? hexPts(6) :
      variant === 4 ? hexPts(5) : hexPts(12);
    if (!sprOn('aura')) {
      for (var k = 0; k < 3; k++) {
        FX.line({ type: 'polyshield', x: o.x, y: o.y, r: R * (0.6 + k * 0.2), pts: shape, col: k === 1 ? '#ffffff' : boost, w: 2.4, dur: 0.7, t: k * 0.07, glow: true, spin: 0.8 * (k % 2 ? 1 : -1) });
      }
    }
    var n = Math.round((16 + p.pow * 5) * QUAL);
    for (var i = 0; i < n; i++) {
      var a = i / n * R2;
      FX.push({ x: o.x + Math.cos(a) * R * 1.1, y: o.y + Math.sin(a) * R * 1.1, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40 - 26, g: -6, r: 2.2, col: i % 4 ? p.col : '#ffffff', dur: 0.8, a: 0.8 });
    }
    FX.line({ type: 'ring', x: o.x, y: o.y, r: R * 1.4, col: p.col, w: 2, dur: 0.75, t: 0.15, glow: true });
  }

  function formBeast(p, o, tgt, boost) {
    var bx = tgt ? tgt.x : o.x, by = tgt ? tgt.y : o.y;
    var R = 88 + p.pow * 16;
    if (!sprOn('beast')) FX.line({ type: 'beast', x: bx, y: by, r: R, col: boost, w: 0, dur: 0.7, t: 0, a: 0.75 });
    for (var i = 0; i < Math.round(18 * QUAL); i++) {
      var a = Math.random() * R2;
      FX.push({ x: bx + Math.cos(a) * R * 0.5, y: by + Math.sin(a) * R * 0.5, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, g: 0, drag: 0.98, r: 2.2, col: i % 3 ? p.col : '#ffffff', dur: 0.45, a: 0.8, shape: 'streak' });
    }
    FX.line({ type: 'ring', x: bx, y: by, r: R * 1.3, col: p.col, w: 3, dur: 0.5, t: 0.15, glow: true });
  }

  var FORM = {
    slash: formSlash, spear: formSpear, axe: formAxe, bow: formBow, ride: formRide,
    shield: formShield, heal: formHeal, fire: formFire, thunder: formThunder,
    poison: formPoison, shadow: formShadow, aura: formAura, beast: formBeast
  };

  /* 命中爆点 */
  function hitBurst(el, p, crit, big) {
    var r = FX.rel(el);
    if (!r) return;
    var n = Math.round(((crit ? 22 : 10) + (big ? 6 : 0)) * QUAL);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * R2, sp = (crit ? 240 : 150) * (0.4 + Math.random());
      FX.push({
        x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, drag: 0.97,
        r: 1.8 + Math.random() * 1.8, col: i % 4 ? (crit ? '#ffe08a' : '#ffd0b0') : '#ffffff',
        dur: crit ? 0.42 : 0.3, a: 0.9, shape: i % 2 ? 'streak' : 'dot'
      });
    }
    FX.line({ type: 'ring', x: r.x, y: r.y, r: crit ? 78 : 48, col: crit ? '#ffe08a' : '#ffffff', w: crit ? 3.4 : 2.2, dur: 0.32, t: 0, glow: true });
    try { FX.burst(r.x, r.y, crit ? '#ffe08a' : '#ffd7b0', crit ? 6 : 4, 0.13); } catch (e) { }
    FX.start();
  }

  /* ============================ 对外接口 ============================ */
  var QUALITY = { smooth: 0.55, hd: 1, ultra: 1.7 };

  function setQuality(q) {
    QUAL = QUALITY[q] || 1;
    FX.setCap(q === 'smooth' ? 240 : q === 'ultra' ? 900 : 520);
    if (FX.attach()) FX.resize();
  }

  /* 个人纹样层：由 seed 决定装饰样式，让同形态武将也各有一眼可辨的起手纹 */
  function sigGlyph(p, o, tgt, boost) {
    var h = h32('fx' + (p.id || '') + (p.kw || ''));
    var gy = 1 + (h % 3);
    var R = 34 + (h % 5) * 7;
    var tau = 0.42 + ((Math.floor(h / 7) % 5)) * 0.06;
    var rot = ((h % 100) / 100) * R2;
    if (gy === 1) {
      for (var i = 0; i < 2; i++) {
        FX.line({ type: 'arc', x: o.x, y: o.y, r: R, a0: rot - 0.75 + i * 1.5, a1: rot + 0.75 + i * 1.5, col: i ? p.col : boost, w: 1.8, dur: tau, t: 0.04 + i * 0.07, glow: true, a: 0.55 });
      }
    } else if (gy === 2) {
      FX.line({ type: 'ring', x: o.x, y: o.y, r: R * 0.9, col: boost, w: 1.2, dur: tau, t: 0.05, a: 0.42 });
      for (var k = 0; k < 6; k++) {
        var a = rot + k / 6 * R2;
        FX.push({ x: o.x + Math.cos(a) * R * 0.9, y: o.y + Math.sin(a) * R * 0.9, vx: Math.cos(a) * 44, vy: Math.sin(a) * 44, g: 0, r: 1.6, col: k % 2 ? p.col : boost, dur: tau, a: 0.6 });
      }
    } else {
      FX.line({ type: 'line', x: o.x, y: o.y - 66, pts: [[0, 0], [0, 96]], col: boost, w: 1.8, dur: tau, t: 0.02, glow: true, a: 0.5 });
      for (var m = 0; m < 5; m++) {
        FX.push({ x: o.x + (m - 2) * 9, y: o.y + 22, vx: (m - 2) * 9, vy: -112, g: -10, r: 1.6, col: m % 2 ? p.col : boost, dur: tau, a: 0.6 });
      }
    }
  }

  function cast(name, casterEl) {
    var p = prof(name);
    if (!p) return;
    if (!FX.attach()) return;
    var o = FX.rel(casterEl);
    if (!o) return;
    var W = document.getElementById('battle').clientWidth;
    var leftSide = o.x < W * 0.5;
    var tgt = { x: leftSide ? W * 0.72 : W * 0.28, y: o.y };
    var boost = RCOL[p.r] || '#F0B93C';
    playProfile(p, 'cast', 1);
    try { castSprite(p, o, tgt, W); } catch (e) { }
    try { FX.burst(o.x, o.y, boost, 7, 0.18); FX.flash(0.09); } catch (e) { }
    var fn = FORM[p.form];
    if (fn) { try { fn(p, o, tgt, boost); } catch (e) { } }
    try { sigGlyph(p, o, tgt, boost); } catch (e) { }
    FX.start();
  }

  function hit(attacker, dstEl, opt) {
    opt = opt || {};
    var p = prof(attacker) || { f0: 180, rate: 1, pow: 1, layers: ['impact'], r: '普通', col: '#ccc' };
    /* 命中音：族层变体，暴击加强 */
    if (ensure()) {
      var t = C.currentTime + 0.01;
      var s = 0.9 + (opt.crit ? 0.55 : 0) + Math.min(0.5, (opt.dmg || 0) / 2000);
      var fam = p.tr === '骑兵' ? 'impact' : p.tr === '弓兵' ? 'arrow' : p.tr === '方士' ? 'spark' : 'metal';
      var q = { f0: p.f0 * (1 + (((h32((p.id || '') + 'hit') % 1000) / 1000) - 0.5) * 0.14), rate: p.rate || 1, pow: p.pow || 1 };
      try { LAYER[fam](t, q, s); } catch (e) { }
      if (opt.crit) { try { LAYER.impact(t + 0.02, q, 1.4); } catch (e) { } }
    }
    hitBurst(dstEl, p, opt.crit, (opt.dmg || 0) >= 600);
  }

  function healFx(name, dstEl) {
    var p = prof(name);
    if (!p) return;
    if (!FX.attach()) return;
    var r = FX.rel(dstEl);
    if (!r) return;
    var boost = RCOL[p.r] || '#F0B93C';
    if (ensure()) {
      var t = C.currentTime + 0.01;
      var fam = p.layers.indexOf('bell') >= 0 ? 'bell' : 'grace';
      var q = { f0: p.f0 * (1 + (((h32((p.id || '') + 'heal') % 1000) / 1000) - 0.5) * 0.12), rate: p.rate || 1, pow: p.pow || 1 };
      try { if (LAYER[fam]) LAYER[fam](t, q, 1); } catch (e) { }
    }
    formHeal(p, r, r, boost);
    try { castSprite(p, r, r, 0); } catch (e) { }
    FX.start();
  }

  function controlFx(name, dstEl) {
    var p = prof(name) || { col: '#ccc', pow: 1, f0: 220, rate: 1, layers: [] };
    var r = FX.rel(dstEl);
    if (!r) return;
    if (ensure()) {
      var t = C.currentTime + 0.01;
      var fam = p.layers.indexOf('chain') >= 0 ? 'chain' : p.layers.indexOf('whisper') >= 0 ? 'whisper' : 'ice';
      var q = { f0: p.f0, rate: p.rate || 1, pow: p.pow || 1 };
      try { if (LAYER[fam]) LAYER[fam](t, q, 0.9); } catch (e) { }
    }
    for (var i = 0; i < Math.round(12 * QUAL); i++) {
      var a = i / 12 * R2;
      FX.push({ x: r.x + Math.cos(a) * 54, y: r.y + Math.sin(a) * 54, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, g: 0, r: 2, col: i % 3 ? '#b58bff' : '#ffffff', dur: 0.5, a: 0.7 });
    }
    FX.line({ type: 'ring', x: r.x, y: r.y, r: 56, col: '#b58bff', w: 2.2, dur: 0.45, t: 0, glow: true });
    FX.start();
  }

  function deathFx(name, el) {
    var r = FX.rel(el);
    if (!r) return;
    for (var i = 0; i < Math.round(16 * QUAL); i++) {
      FX.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 180, vy: -60 - Math.random() * 140, g: 320, r: 2, col: i % 2 ? '#8a8a8a' : '#d8d0c0', dur: 0.8, a: 0.7 });
    }
    FX.line({ type: 'ring', x: r.x, y: r.y, r: 64, col: '#9a9a9a', w: 2, dur: 0.5, t: 0, a: 0.6 });
    if (ensure()) { try { LAYER.impact(C.currentTime, { f0: 130, rate: 1.2, pow: 1 }, 0.8); } catch (e) { } }
    FX.start();
  }

  /* 兽首剪影：扩展 drawLine 的类型（在 FX 内部以 poly 近似） */
  var _poly = FX.line;
  FX.line = function (L) {
    if (L.type !== 'beast') return _poly(L);
    /* 用多段折线拼出兽首轮廓 */
    var r = L.r;
    var pts = [
      [-0.55, -0.35], [-0.6, -0.8], [-0.2, -0.55], [0.0, -0.7], [0.2, -0.55], [0.6, -0.8], [0.55, -0.35],
      [0.7, -0.05], [0.55, 0.4], [0.2, 0.62], [0.0, 0.5], [-0.2, 0.62], [-0.55, 0.4], [-0.7, -0.05], [-0.55, -0.35]
    ];
    _poly({
      type: 'line', x: L.x, y: L.y, col: L.col, w: L.w || 2.2, dur: L.dur, t: L.t,
      a: L.a, glow: true, fadeIn: true,
      pts: pts.map(function (q) { return [q[0] * r * 2, q[1] * r * 2]; })
    });
    /* 双眼 */
    for (var i = 0; i < 2; i++) {
      _poly({ type: 'ring', x: L.x + (i ? 1 : -1) * r * 0.26, y: L.y - r * 0.12, r: r * 0.1, col: '#ffe08a', w: 3, dur: L.dur, t: L.t, a: 0.9, glow: true });
    }
  };

  window.HeroShow = {
    profile: prof,
    cast: cast,
    hit: hit,
    heal: healFx,
    control: controlFx,
    death: deathFx,
    setQuality: setQuality,
    warmup: loadSprites,
    clear: function () { FX.clear(); },
    debugSprite: function (form, opt) {
      opt = opt || {};
      if (!FX.attach()) return 'no-attach';
      var bd = document.getElementById('battle');
      if (!bd) return 'no-battle';
      var im = SPRITES[form];
      if (!im || !im.complete || !im.naturalWidth) return 'no-img';
      FX.pushSpr({
        img: im, tint: opt.tint ? tintOf(im, form, opt.tint) : null,
        x: bd.clientWidth * 0.5, y: bd.clientHeight * (opt.y || 0.42), rot: 0,
        sx: opt.sx || 1, sy: opt.sy || 1, s0: 1, grow: 1,
        dur: opt.dur || 3, t: 0, a: opt.a || 1, flip: 1, rj: 0,
        base: opt.size || 300, dy: 0, fall: 0, back: !!opt.back
      });
      FX.start();
      return 'ok';
    },
    debugPlay: function (name) { playProfile(prof(name) || { f0: 200, rate: 1, pow: 1, layers: ['metal'] }, 'cast', 1); }
  };
})();
