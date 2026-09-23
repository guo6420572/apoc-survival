/* render.js — Canvas 场景渲染（只读战斗状态，不写） */
(function (APOC) {
  'use strict';

  var C = APOC.Config;
  var canvas, ctx, W = C.VIEW_W, H = C.VIEW_H, GROUND = C.GROUND_Y;
  /* 画布在屏幕上的实际缩放比。手机上面画布被缩到 0.4~0.55，
     画布里 14px 的字实际只有 6~8px，根本看不清 —— 所以画布内文字要按它反向放大。
     桌面端缩放约 0.7~1.0，系数接近 1，不受影响。 */
  var uiScale = 1;

  /* ---------------- 初始化 / 尺寸 ---------------- */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', fit);
    /* 手机转屏：iOS 上 orientationchange 触发时视口尺寸还没更新，
       必须延后一拍再量，否则画布会按旧尺寸缩放 */
    window.addEventListener('orientationchange', function () {
      fit();
      setTimeout(fit, 120);
      setTimeout(fit, 400);
    });
    fit();
  }

  function fit() {
    var wrap = document.getElementById('stage-wrap');
    if (!wrap || !canvas) return;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    /* ★ 铺满策略（竖版游戏在竖版手机上必须铺满，否则上下留黑边很难看）：

       容器比 9:16 更**瘦高**（现代手机，20:9 那种）→ 按高缩放铺满（cover），
         代价是横向各裁掉一点。裁掉的是走廊地面的最外侧窄边：
         高瘦屏最多裁到「可见 x 范围 86~634」，而地面是 60~660 ——
         出怪点在中线 ±39、玩家在 x=165、怪的走位落点最远到 x≈465，
         玩法区域一点没碰着，裁掉的纯粹是地板边缘。

       容器比 9:16 更**矮胖**（桌面、平板横屏）→ 必须按宽缩放（contain），
         绝不能 cover：那会纵向裁，上面裁掉出怪线、下面裁掉主角，
         等于把玩法裁没了。

       两种情况下都**不会纵向裁剪** —— 这是这条规则的安全底线。 */
    var sw = w / W, sh = h / H;
    var s = (w / h <= W / H) ? Math.max(sw, sh) : Math.min(sw, sh);
    /* ★ 容器尺寸拿不到时（隐藏、还没布局完、或测试环境）会算出 NaN，
       进而让 uiScale 和字号一起变 NaN，画布内文字会用到上一次的残留字号 ——
       表现就是顶部几行字叠在一起。这里兜底成 1。 */
    if (!isFinite(s) || s <= 0) s = 1;
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';

    uiScale = Math.max(1, Math.min(2.4, 0.78 / s));
    if (!isFinite(uiScale)) uiScale = 1;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* 画布内文字统一用这个换算字号 */
  function fsz(px) { return Math.round(px * uiScale); }

  /* ---------------- 背景 ---------------- */
  function sceneColors(stage) {
    var scene = APOC.Data.sceneOfStage(stage);
    return scene || {
      bgTop: '#1a2420', bgBottom: '#0d1410', ground: '#2a3a30',
      accent: '#4a7c59', prop: 'pipe', name: '未知区域'
    };
  }

  function drawSideBackground(sc) {
    var bg = APOC.Sprites && APOC.Sprites.bg(sc.id);

    /* 底色（贴图缺失或没铺满时兜底） */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sc.bgTop);
    g.addColorStop(1, sc.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (bg) {
      /* 背景图 16:9，直接铺满 */
      ctx.drawImage(bg, 0, 0, W, H);
      /* 压暗：让角色和怪物从背景里跳出来 */
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.fillRect(0, 0, W, H);
      /* 顶部压暗：让从纵深处压下来的怪物更容易被看见 */
      var topfade = ctx.createLinearGradient(0, 0, 0, C.HORIZON_Y + 120);
      topfade.addColorStop(0, 'rgba(0,0,0,.62)');
      topfade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topfade;
      ctx.fillRect(0, 0, W, C.HORIZON_Y + 120);
      drawFloorOverlay(sc);
    } else {
      /* 没有背景图 → 程序化远景剪影 + 装饰 */
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = sc.bgBottom;
      for (var i = 0; i < 9; i++) {
        var x = i * 160 - 40;
        var hgt = 120 + ((i * 37) % 130);
        ctx.fillRect(x, GROUND - 180 - hgt, 110, hgt + 180);
      }
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = sc.accent;
      drawProps(sc.prop);
      ctx.globalAlpha = 1;
    }

    /* 地面：有背景图时背景自带地板，只压暗；没有才画程序化地面带 */
    if (bg) {
      /* 背景自带地板，这里不用再画 —— 底部压暗已经在上面那条渐隐里做过了 */
    } else {
      var g2 = ctx.createLinearGradient(0, GROUND, 0, H);
      g2.addColorStop(0, sc.ground);
      g2.addColorStop(1, sc.bgBottom);
      ctx.fillStyle = g2;
      ctx.fillRect(0, GROUND, W, H - GROUND);

      ctx.strokeStyle = sc.accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND);
      ctx.lineTo(W, GROUND);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* 透视地板：只做很轻的压暗，不画网格线。
     画了网格会变成一个"笼子"，而且地平线处会出现一条硬边；
     纵深缩放 + 雾 + 落地阴影已经足够把地面读出来了。 */
  function drawFloorOverlay(sc) {
    var HZ = C.HORIZON_Y;
    var g = ctx.createLinearGradient(0, HZ - 90, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');          // 起点全透明 → 不会出现硬边
    g.addColorStop(0.30, 'rgba(0,0,0,.08)');
    g.addColorStop(0.70, 'rgba(0,0,0,.20)');
    g.addColorStop(1, 'rgba(0,0,0,.44)');
    ctx.fillStyle = g;
    ctx.fillRect(0, HZ - 90, W, H - HZ + 90);
  }

  function drawProps(kind) {
    var i, x;
    if (kind === 'pipe') {
      for (i = 0; i < 8; i++) {
        x = 80 + i * 165;
        ctx.fillRect(x, GROUND - 200, 26, 200);
        ctx.fillRect(x - 12, GROUND - 160, 50, 14);
      }
    } else {
      for (i = 0; i < 10; i++) {
        x = 50 + i * 130;
        ctx.fillRect(x, GROUND - 150, 34, 150);
      }
    }
  }

  function drawArenaBackground(sc) {
    ctx.fillStyle = '#0b0d0c';
    ctx.fillRect(0, 0, W, H);

    var B = C.ARENA_BOUND;
    var bg = APOC.Sprites && APOC.Sprites.bg(sc.id);

    if (bg) {
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.55)';       // 压暗，突出场上单位
      ctx.fillRect(0, 0, W, H);
    }

    var g = ctx.createRadialGradient(640, 400, 80, 640, 400, 620);
    g.addColorStop(0, bg ? 'rgba(0,0,0,0)' : sc.ground);
    g.addColorStop(1, bg ? 'rgba(0,0,0,.75)' : sc.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);

    /* 网格 */
    ctx.strokeStyle = sc.accent;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 1;
    for (var x = B.x0; x <= B.x1; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, B.y0); ctx.lineTo(x, B.y1); ctx.stroke();
    }
    for (var y = B.y0; y <= B.y1; y += 80) {
      ctx.beginPath(); ctx.moveTo(B.x0, y); ctx.lineTo(B.x1, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = sc.accent;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 4;
    ctx.strokeRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    ctx.globalAlpha = 1;
  }

  /* ---------------- 单位 ---------------- */

  function drawPlayer(p, arena) {
    /* 主角素材是整套 8 帧行走循环（设计稿按数据表命名，ID 一一对应） */
    var idleSpr = APOC.Sprites && APOC.Sprites.player(1);
    var ph = (arena ? C.PLAYER_H_ARENA : C.PLAYER_H) * depthScale(p.y);
    /* ★ 绘制框固定用「静止帧」的宽高比。
       行走帧各张宽度差很多（150~293），如果每帧各按各的比例算，
       人物会横向忽胖忽瘦、脚的位置也会来回跳 —— 又是一次"抖动"。 */
    var pw = idleSpr ? ph * (idleSpr.width / idleSpr.height) : ph * 0.4;

    /* ★ 8 帧行走循环：按步态相位取帧。
       素材是一整套同机位设计的行走帧，所以切换起来是"迈步"而不是"转身"。 */
    var pspr = idleSpr;
    if (idleSpr && !p.dying) {
      var N = APOC.Sprites.frameCount();
      var f = 1 + (Math.floor((p.bobPhase || 0) / (Math.PI * 2 / N)) % N);
      pspr = APOC.Sprites.player(f) || idleSpr;
    }

    /* 落地阴影 */
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, pw * 0.48, pw * 0.13, 0, 0, 6.29);
    ctx.fill();

    if (!pspr) {
      /* 没贴图时的兜底：一个明显的人形色块，尺寸同样按 ph 走 */
      ctx.save();
      ctx.fillStyle = '#d97706';
      ctx.fillRect(p.x - pw * 0.3, p.y - ph, pw * 0.6, ph);
      ctx.restore();
      return;
    }

    var anim = p.anim || 0;
    var pamp = (p.bobAmp === undefined) ? 0 : p.bobAmp;
    var pph = (p.bobPhase === undefined) ? anim : p.bobPhase;
    /* ★ 幅度按贴图高度取比例 —— 贴图从 190px 变成 600px 后，
       原来写死的 1.6px 起伏等于没有，写死像素的做法必须改掉 */
    var bob = Math.sin(pph) * ph * 0.010 * pamp
            + Math.sin(anim * 1.5) * ph * 0.004 * (1 - pamp * 0.6);
    var sway = Math.sin(pph * 0.5) * ph * 0.008 * pamp;
    /* 开火时整体往回（下）顿一下，模拟后坐 */
    var recoil = (p.lunge || 0) * ph * 0.016;

    var pdx = p.x + sway;
    var pbottom = p.y + ph * 0.02 + bob + recoil;
    var ptop = pbottom - ph;
    /* ★ 枪口锚点必须在使用之前取。
       原来写在函数末尾，而枪口闪光那段在中间就用了 mz ——
       var 只提升声明不提升赋值，所以 mz 是 undefined，
       一开火就抛异常 → rAF 循环死掉 → 整个游戏永久卡死。
       只在开火时触发，所以平时测不出来。 */
    var mz = C.MUZZLE || [0.63, 0.26];

    ctx.save();
    if (p.hitFlash > 0) pdx -= ph * 0.006;

    /* 轮廓光：画一张放大的白剪影垫在身后（原来是 8 方向滤镜描边，每帧 8 次滤镜，太慢） */
    var wvP = variant(pspr, 'white');
    if (wvP) {
      ctx.globalAlpha = 0.34;
      var gw = pw * 1.045, gh = ph * 1.02;
      ctx.drawImage(wvP, pdx - gw / 2, ptop - (gh - ph) / 2, gw, gh);
      ctx.globalAlpha = 1;
    }

    /* 脚下的暖色背光，把主角从地面提起来 */
    var gy = pbottom - ph * 0.12;
    var pg = ctx.createRadialGradient(pdx, gy, ph * 0.02, pdx, gy, pw * 1.1);
    pg.addColorStop(0, 'rgba(251,191,36,.18)');
    pg.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(pdx, gy, pw * 1.1, 0, 6.29); ctx.fill();

    /* 关键帧不同宽度：按固定框等比缩放并底部对齐，脚才不会跳 */
    drawPlayerFrame(pspr, pdx, ptop, pw, ph);

    if (p.hitFlash > 0 && wvP) {
      ctx.globalAlpha = Math.min(0.8, p.hitFlash * 6);
      drawPlayerFrame(wvP, pdx, ptop, pw, ph);
      ctx.globalAlpha = 1;
    }

    /* 枪口闪光：过肩视角里枪在胸前举起，闪光点在贴图上半部偏左。
       ★ 星形爆闪现在用 fx_muzzle 贴图；贴图缺失（或关了特效）时回退到原来
       那套「光晕 + 四向尖刺」的程序化画法，所以任何情况下都不会没有枪口反馈。 */
    if (p.atkFx > 0) {
      var fa = Math.min(1, p.atkFx * 8);
      var mx = (pdx - pw / 2) + pw * mz[0], my = ptop + ph * mz[1];
      var mr = Math.max(14, ph * 0.05);
      /* 底下的光晕保留：贴图是叠加发光，底下垫一层暖光才"烧"得起来 */
      ctx.globalAlpha = fa * 0.55;
      var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 1.8);
      mg.addColorStop(0, 'rgba(254,243,199,.95)');
      mg.addColorStop(0.45, 'rgba(251,191,36,.5)');
      mg.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, mr * 1.8, 0, 6.29); ctx.fill();
      /* 幅度用开火余量 fa 驱动：闪光会随攻击前摇一起收，不会"啪"地消失 */
      var drew = drawFxAt('fx_muzzle', mx, my, Math.max(38, ph * 0.20),
                          fa * 0.95, Math.sin(p.anim * 37) * 0.22);
      if (!drew) {
        ctx.globalAlpha = fa;
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = Math.max(2, mr * 0.16);
        for (var q = 0; q < 4; q++) {
          var ang = q * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx + Math.cos(ang) * mr, my + Math.sin(ang) * mr);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ★ 护盾：fx_shield 贴图（半球能量力场罩），呼吸脉冲靠透明度做。
       贴图缺失时回退到原来的六边形能量盾（那是上一版为了让护盾"不像被画了个圈"
       而做的，形状信息一样要保住）。 */
    if (p.shield > 0) {
      var scx = pdx, scy = pbottom - ph * 0.46;
      var pulse = 1 + Math.sin(p.anim * 3.2) * 0.035;      // 呼吸
      var drewShield = drawFxAt('fx_shield', scx, scy, ph * 0.95,
                                0.42 + Math.sin(p.anim * 3.2) * 0.12);
      if (!drewShield) {
        var srx = pw * 0.62, sry = ph * 0.44;
        var rot = p.anim * 0.35;                            // 缓慢旋转
        ctx.save();
        ctx.translate(scx, scy);
        ctx.scale(srx * pulse, sry * pulse);
        ctx.rotate(rot);
        ctx.beginPath();
        for (var hi = 0; hi < 6; hi++) {
          var ha = hi * Math.PI / 3;
          var hx = Math.cos(ha), hy = Math.sin(ha);
          if (hi === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 0.035;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    /* 弹道起点：从枪口出发 */
    p.__muzzleX = (pdx - pw / 2) + pw * mz[0];
    p.__muzzleY = ptop + ph * mz[1];
    /* 回读实际绘制尺寸，供 tools/render_test.js 断言 */
    p.__ph = ph; p.__pw = pw; p.__ptop = ptop;
  }

  /* 同屏敌人计数：>60 时跳过 emoji 与部分血条绘制。声明必须在用它的函数之前 */
  var drawnCount = 0;

  /* ---------------- 贴图变体缓存 ----------------
     ★ 这里替掉了原来的 ctx.filter 用法。
     Canvas 2D 的 filter 每一次都要重做一遍滤镜合成，大贴图上极慢。
     原来主角轮廓光每帧 8 次滤镜、每个怪 1 次雾效、被击中的怪再来 1 次白闪，
     一旦开打就是几十次滤镜 —— 玩家反馈"击中怪物就卡住"就是这么来的。
     改成：加载后把需要的变体（白剪影 / 雾化）各生成一次，之后全是普通 drawImage。 */
  var variantCache = {};
  var vidSeq = 0;

  function variant(spr, kind) {
    if (!spr || !spr.width || !spr.height) return null;
    if (!spr.__vid) spr.__vid = ++vidSeq;
    var k = spr.__vid + ':' + kind;
    if (variantCache[k]) return variantCache[k];
    var cv, c;
    try {
      cv = document.createElement('canvas');
      cv.width = spr.width; cv.height = spr.height;
      c = cv.getContext('2d');
      if (!c) return null;
      c.drawImage(spr, 0, 0);
      if (kind === 'white') {
        /* 白剪影：留着形状，颜色全刷白 —— 用来做受击闪光 */
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, spr.width, spr.height);
      } else {
        /* 雾化：按形状叠一层灰，压对比度 —— 用来做远处的大气透视 */
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = 'rgba(96,110,120,0.92)';
        c.fillRect(0, 0, spr.width, spr.height);
      }
    } catch (e) { return null; }
    variantCache[k] = cv;
    return cv;
  }

  /* ---------------- 战斗特效贴图 ----------------
     39 张 VFX 贴图（assets/fx/，清单见 Config.FX_IDS）在这里落地。三种画法：
       drawFxAt    —— 定点定尺寸画一张（命中火花 / 爆炸 / 状态 / 护盾 / 枪口）
       drawFxLine  —— 沿一条线段拉伸画一张（湮灭光柱 / 弹射电弧）
       drawVfxLayer—— 把实例层里那些带生命周期的画出来（见 effects.js 的 vfx）
     ★ 全部走叠加发光（lighter）：素材本身就是「黑底发光」抠出来的透明图，
     按普通 alpha 叠上去会发灰，只有相加才是"光"。
     ★ 素材缺失（加载失败 / 关了特效）时全部返回 false，由调用方回退到原来的
     程序化画法 —— 绝不留下"什么都没画"的空窗。 */

  function fxOn() {
    return !(APOC.State && APOC.State.data &&
             APOC.State.data.settings && APOC.State.data.settings.showFx === false);
  }

  function fxSpr(id) {
    if (!id || !fxOn()) return null;
    return (APOC.Sprites && APOC.Sprites.fx && APOC.Sprites.fx(id)) || null;
  }

  /* 定点画一张。h = 目标高度（宽按贴图比例自动算），rot 顺时针弧度 */
  function drawFxAt(id, x, y, h, alpha, rot, flip) {
    var spr = fxSpr(id);
    if (!spr || h <= 0 || alpha <= 0) return false;
    var w = h * (spr.width / spr.height);
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  /* 沿线段拉伸画一张：贴图被硬拉到 (线段长 × width)，贴在线上。
     湮灭光柱（原图是一根竖光柱）和弹射电弧（原图是一条横向锯齿闪电）都用它 ——
     这两张的原图长宽比本来就差着数量级，只有硬拉才能既铺满整条线又不留硬边。 */
  function drawFxLine(id, x1, y1, x2, y2, width, alpha, grow) {
    var spr = fxSpr(id);
    if (!spr || width <= 0 || alpha <= 0) return false;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return false;
    var g = grow || 0;                      // 两端的延伸量，免得露出硬边
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.drawImage(spr, -(len + g * 2) / 2, -width / 2, len + g * 2, width);
    ctx.restore();
    return true;
  }

  /* 实例层：每帧按 t/ttl 对尺寸、旋转、透明度做线性插值后画出来 */
  function drawVfxLayer() {
    var list = APOC.UIEffects.getVfx();
    if (!list.length || !fxOn()) return;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var k = 1 - Math.max(0, v.t) / v.ttl;          // 0 = 刚生成，1 = 结束
      var a = (v.a0 + (v.a1 - v.a0) * k) * v.alpha;
      if (a <= 0.004) continue;
      var h = v.size * (v.s0 + (v.s1 - v.s0) * k);
      if (h <= 0.5) continue;
      var w = h * (v.spr.width / v.spr.height);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a);
      if (v.add) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(v.x, v.y);
      var rot = v.rot0 + (v.rot1 - v.rot0) * k;
      if (rot) ctx.rotate(rot);
      if (v.flip) ctx.scale(-1, 1);
      ctx.drawImage(v.spr, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  /* ★ 纵深缩放：越靠近画面下方（离镜头越近）画得越大 */
  function depthScale(y) {
    var t = (y - C.FAR_Y) / (C.NEAR_Y - C.FAR_Y);
    t = Math.max(0, Math.min(1.25, t));
    return C.DEPTH_SCALE_FAR + (C.DEPTH_SCALE_NEAR - C.DEPTH_SCALE_FAR) * t;
  }

  /* 大气透视：越远越暗越灰 */
  function fogAmount(y) {
    var t = (y - C.FAR_Y) / (C.NEAR_Y - C.FAR_Y);
    t = Math.max(0, Math.min(1, t));
    return (1 - t) * C.FOG_MAX;
  }

  var MIN_MON_H = 30;      // 兜底：任何怪都不能画得比这个还小，否则等于隐形
  function monHeight(e) {
    var mul = e.tier === 'boss' ? C.MON_H_MUL_BOSS
            : e.tier === 'elite' ? C.MON_H_MUL_ELITE
            : C.MON_H_MUL;
    return Math.max(MIN_MON_H, e.size * mul * depthScale(e.y));
  }

  /* ---------------- 动画 ----------------
     没有这些偏移时，单位就是一张贴纸在原地平移，观感很"僵硬"。
     加了以后：走路有起伏、站着有呼吸、攻击会前冲、死亡会缩小淡出。 */
  var DEATH_TIME = 0.38;

  function animOffsets(e, dsc) {
    var k = e.dying ? Math.max(0, e.deathT / DEATH_TIME) : 1;   // 1=活 0=消散完
    var walk = e.walk && !e.dying && !e.freeze;
    /* bobPhase 由位移驱动（见 combat.js），所以走得快就迈得快、站着就不迈步。
       幅度取 size 的 4.5%：太大就是"抖"，太小看不出来。 */
    var ph = (e.bobPhase === undefined) ? e.anim : e.bobPhase;
    /* 幅度用 bobAmp 平滑过渡（0→1），而不是 walk 的硬 0/1。
       ★ 两条正弦之间硬切 = 每帧跳好几像素 = 看着像抽搐。 */
    var amp = (e.bobAmp === undefined) ? (walk ? 1 : 0) : e.bobAmp;
    var bob = Math.sin(ph) * e.size * 0.045 * dsc * amp;
    /* 横向重心偏移用半频，读起来才像"迈步"而不是"上下弹" */
    var sway = Math.sin(ph * 0.5) * e.size * 0.028 * dsc * amp;
    /* 呼吸始终存在（幅度很小），和走路起伏相加，不做二选一 */
    var breathe = e.dying ? 0 : Math.sin(e.anim * 1.6) * e.size * 0.016 * dsc * (1 - amp * 0.6);
    var sink = e.dying ? (1 - k) * e.size * 0.7 : 0;

    /* 攻击前冲：朝目标方向顶一下再弹回来 */
    var lx = 0, ly = 0;
    if (e.lunge > 0 && !e.dying) {
      var p = APOC.Combat.state && APOC.Combat.state.player;
      if (p) {
        var ddx = p.x - e.x, ddy = p.y - e.y;
        var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        var amt = e.lunge * e.size * 0.45 * dsc;
        lx = ddx / dl * amt; ly = ddy / dl * amt;
      }
    }
    var fade = (e.spawnFade === undefined) ? 1 : e.spawnFade;
    /* 迈步时的轻微挤压 */
    var squash = 1 + Math.sin(ph) * 0.028 * amp;
    /* ★ 走路时左右摇摆：静态贴图只做上下平移的话，看起来就是"滑行"。
       加一点绕脚底的旋转，读起来才像一步一挪。 */
    var rot = Math.sin(ph) * 0.075 * amp;
    return { k: k, alpha: (e.dying ? k : 1) * fade,
             pop: (e.dying ? 0.55 + 0.45 * k : 1) * squash,
             rot: rot,
             x: e.x + lx + sway, y: e.y + ly + bob + breathe + sink };
  }

  function drawEnemy(e, big) {
    var spr = APOC.Sprites && APOC.Sprites.mon(e.mid);
    var dsc = depthScale(e.y);
    var an = animOffsets(e, dsc);

    /* 落地阴影 */
    ctx.fillStyle = 'rgba(0,0,0,' + (0.35 * an.alpha).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 3, e.size * 1.1 * dsc * an.pop, e.size * 0.35 * dsc * an.pop, 0, 0, 6.29);
    ctx.fill();

    var px = APOC.Combat.state && APOC.Combat.state.player
      ? APOC.Combat.state.player.x : -Infinity;

    if (spr) {
      var h = monHeight(e) * an.pop;
      var w = h * (spr.width / spr.height);
      var bottom = an.y + (big ? e.size * 0.4 : 4);
      ctx.save();
      ctx.globalAlpha = an.alpha;
      /* 走路摇摆：绕脚底旋转，不要绕中心，否则会像不倒翁 */
      ctx.translate(an.x, an.y);
      if (an.rot) ctx.rotate(an.rot);
      ctx.translate(-an.x, -an.y);
      /* 怪物一律面向玩家：贴图原图朝右，玩家在左边就镜像 */
      if (e.x >= px) {
        ctx.translate(an.x, 0); ctx.scale(-1, 1); ctx.translate(-an.x, 0);
      }
      ctx.drawImage(spr, an.x - w / 2, bottom - h, w, h);
      /* 雾：远处叠一层雾化变体，越远越浓 */
      var fog = fogAmount(e.y);
      if (fog > 0.04) {
        var fv2 = variant(spr, 'fog');
        if (fv2) {
          ctx.globalAlpha = Math.min(0.85, fog) * an.alpha;
          ctx.drawImage(fv2, an.x - w / 2, bottom - h, w, h);
          ctx.globalAlpha = an.alpha;
        }
      }
      /* 受击白闪：叠白剪影 */
      if (e.hitFlash > 0) {
        var wv = variant(spr, 'white');
        if (wv) {
          ctx.globalAlpha = Math.min(0.85, e.hitFlash * 4) * an.alpha;
          ctx.drawImage(wv, an.x - w / 2, bottom - h, w, h);
          ctx.globalAlpha = an.alpha;
        }
      }
      /* 冻结：叠白剪影 + 蓝色描边（原来用 filter 的色相旋转，太慢） */
      if (e.freeze > 0) {
        var wv2 = variant(spr, 'white');
        if (wv2) {
          ctx.globalAlpha = 0.42 * an.alpha;
          ctx.drawImage(wv2, an.x - w / 2, bottom - h, w, h);
          ctx.globalAlpha = an.alpha;
        }
      }
      ctx.restore();
    } else {
      /* 没有贴图 → 退回程序化绘制。
         ★ 尺寸必须走 monHeight（和贴图同一套），
         曾经用 e.size*dsc 当半径，老鼠只有 6px，等于隐形，
         玩家反馈"怪物不见了"，排查了很久。 */
      var fh = monHeight(e) * an.pop;
      var cy = an.y - fh / 2;
      ctx.save();
      ctx.globalAlpha = an.alpha;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(an.x, cy, fh / 2, 0, 6.29);
      ctx.fill();

      if (drawnCount < 60) {
        ctx.font = Math.floor(fh * 0.9) + 'px "Segoe UI Emoji","Apple Color Emoji",serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.emoji, an.x, cy);
      }
      if (e.hitFlash > 0) {
        ctx.globalAlpha = Math.min(0.85, e.hitFlash * 4) * an.alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(an.x, cy, fh / 2, 0, 6.29); ctx.fill();
      }
      ctx.restore();
    }

    /* ---- 状态特效（燃烧 / 流血 / 冻结）----
       挂在怪身上跟着一起动，玩家才知道"它身上有东西在烧 / 在滴血 / 被冻住了"。

       ★ 一只怪最多只叠一张状态贴图（按「硬控 > 持续伤害」取最要紧的那个）。
       两个理由：① 燃烧+流血+冰冻同时挂上去，三张叠加发光的大图叠在一起就是一团白，
       什么状态都看不出来；② 每只怪的绘制次数因此被钉死在 4 次以内
       （本体 + 雾化 + 受击白闪 + 状态），这是 docs/01「渲染性能红线」里的硬约束。

       ★ 超过 FX_STATE_MAX_DRAWN 只怪（割草关后期同屏几百只）就不画贴图了，
       退回原来那个橙色火球（一次 fill 圆弧，不占 drawImage 预算）。 */
    if (!e.dying) {
      var sth = monHeight(e) * an.pop;
      var stDrew = false;
      if (drawnCount <= C.FX_STATE_MAX_DRAWN) {
        if (e.freeze > 0) {
          stDrew = drawFxAt('fx_freeze', an.x, an.y - sth * 0.5, sth * 1.15, 0.8);
        } else if (e.burn) {
          stDrew = drawFxAt('fx_burn', an.x, an.y - sth * 0.5, sth * 1.2,
                            0.5 + Math.sin(e.anim * 9) * 0.2);
        } else if (e.bleed) {
          stDrew = drawFxAt('fx_bleed', an.x, an.y - sth * 0.45, sth * 0.9, 0.62);
        }
      }
      /* ★ 火焰是"这只怪身上有东西在烧"最直接的信号，贴图缺失（或关了特效）时
         必须还有东西可看 —— 退回上一版那个橙色火球。 */
      if (e.burn && !stDrew) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(an.x, an.y - e.size * 1.6 * dsc, e.size * 0.6 * dsc, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawHpBar(e, big) {
    if (e.dying || e.hp <= 0) return;
    if (drawnCount > 60 && e.tier === 'normal') return;
    var spr = APOC.Sprites && APOC.Sprites.mon(e.mid);
    var mh = monHeight(e);
    var w = spr ? Math.max(30, mh * (spr.width / spr.height) * 0.95)
                : Math.max(30, e.size * 2.4);
    var h = e.tier === 'boss' ? 7 : 4;
    var x = e.x - w / 2;
    var y = e.y - mh - 16;

    ctx.globalAlpha = 1 - fogAmount(e.y) * 0.6;
    ctx.fillStyle = '#3f3a34';
    ctx.fillRect(x, y, w, h);
    var ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = e.tier === 'boss' ? '#f97316' : '#b91c1c';
    ctx.fillRect(x, y, w * ratio, h);
    ctx.globalAlpha = 1;
    if (e.tier === 'boss') {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }

  /* ---------------- 主绘制 ---------------- */
  function draw(dt) {
    if (!ctx) return;
    var st = APOC.Combat.state;
    var isArena = !!(st && st.mode === 'arena');

    APOC.UIEffects.tick(dt || 0.016);

    ctx.save();
    ctx.setTransform(
      Math.min(window.devicePixelRatio || 1, 2), 0, 0,
      Math.min(window.devicePixelRatio || 1, 2), 0, 0);

    var shake = APOC.UIEffects.getShake();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    var stage = st ? st.stage : (APOC.State.data ? APOC.State.data.progress.stage : 1);
    var sc = sceneColors(stage);

    if (!st) {
      drawSideBackground(sc);
      ctx.restore();
      return;
    }

    if (isArena) drawArenaBackground(sc);
    else drawSideBackground(sc);

    /* ---- 怪物先画（远），主角后画（镜头就在主角身后一米，她必须盖住怪物）---- */
    drawnCount = st.enemies.length;
    if (isArena) {
      st.enemies.slice().sort(function (e1, e2) { return e1.y - e2.y; })
        .forEach(function (e) { drawEnemy(e, true); });
    } else {
      st.enemies.forEach(function (e) { drawEnemy(e, false); });
    }
    if (st.player) drawPlayer(st.player, isArena);

    /* ---- 弹道 ----
       两条线叠加（粗的外发光 + 细的亮芯）比单线更像"射击"。
       ★ 按武器所属的线取色、按 behavior 换画法 —— 以前这里是写死的橙色直线，
       60px 的拳套和 700px 的电磁轨道炮画出来一模一样，
       贯穿/弹射/溅射在画面上完全看不出来。 */
    ctx.lineCap = 'round';
    for (var ti = 0; ti < st.tracers.length; ti++) {
      var tk = st.tracers[ti];
      var ta = Math.max(0, tk.t / tk.ttl);
      var tcol = (APOC.Config.LINE_COLORS && APOC.Config.LINE_COLORS[tk.line]) || '#f59e0b';
      var beh = tk.behavior || 'single';
      /* 这次攻击用的是哪把武器 → 取它那条弹道 / 弧光贴图（见 Config.FX_WEAPON） */
      var wfx = (C.FX_WEAPON && C.FX_WEAPON[tk.wid]) || null;

      /* ★ 湮灭射线（全屏贯穿）：又粗又亮的一道竖直光柱，压过其它所有弹道。
         贴图那层用 proj_annihilate_beam 沿射线拉满（原图 215×1024 的竖光柱），
         下面三段线退化成"光柱的白热芯"，让边缘不至于糊。 */
      if (tk.beam) {
        drawFxLine('proj_annihilate_beam', tk.x1, tk.y1, tk.x2, tk.y2,
                   150 * ta, ta * 0.85, 60);
        ctx.globalAlpha = ta * 0.55;
        ctx.strokeStyle = tcol;
        ctx.lineWidth = 34;
        ctx.beginPath(); ctx.moveTo(tk.x1, tk.y1); ctx.lineTo(tk.x2, tk.y2); ctx.stroke();
        ctx.globalAlpha = ta * 0.9;
        ctx.strokeStyle = '#e9d5ff';
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(tk.x1, tk.y1); ctx.lineTo(tk.x2, tk.y2); ctx.stroke();
        ctx.globalAlpha = ta;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tk.x1, tk.y1); ctx.lineTo(tk.x2, tk.y2); ctx.stroke();
        continue;
      }

      /* 怪物的远程攻击：细、暗、带一点衰减，和玩家那条粗实线明确区分 */
      if (tk.hostile) {
        ctx.globalAlpha = ta * 0.8;
        ctx.strokeStyle = tcol;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tk.x1, tk.y1); ctx.lineTo(tk.x2, tk.y2); ctx.stroke();
        ctx.globalAlpha = ta;
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tk.x1, tk.y1); ctx.lineTo(tk.x2, tk.y2); ctx.stroke();
        continue;
      }

      if (tk.line === 'body') {
        /* 近战：不画长直线，画一道短弧斩击（从枪口扫向目标）。
           ★ 弧光换成该武器自己的 slash_* 贴图（拳套 / 匕首 / 铁管 / 斧 / 链锯 /
           动力拳套 / 等离子巨锤 各一张），贴图缺失时回退到原来那道双色圆弧。 */
        var mx = tk.x1, my = tk.y1;
        var ang = Math.atan2(tk.y2 - my, tk.x2 - mx);
        var rad = Math.min(150, Math.hypot(tk.x2 - mx, tk.y2 - my) * 0.55);
        /* 弧心 = 枪口沿挥砍方向推出一个半径；贴图原图是"朝右挥出"，转到 ang 即可 */
        var cxA = mx + Math.cos(ang) * rad, cyA = my + Math.sin(ang) * rad;
        if (!(wfx && drawFxAt(wfx, cxA, cyA,
                              Math.max(70, rad * C.FX_SIZE.slash * 1.7), ta * 0.95, ang))) {
          ctx.globalAlpha = ta * 0.5;
          ctx.strokeStyle = tcol;
          ctx.lineWidth = 9;
          ctx.beginPath(); ctx.arc(mx, my, rad, ang - 0.7, ang + 0.7); ctx.stroke();
          ctx.globalAlpha = ta;
          ctx.strokeStyle = '#fff7ed';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(mx, my, rad, ang - 0.7, ang + 0.7); ctx.stroke();
        }
        continue;
      }

      /* 路径点：chain 依次连到每个目标（折线），其余画到首目标 */
      var pts = [ { x: tk.x1, y: tk.y1 } ];
      if (beh === 'chain' && tk.pts && tk.pts.length) {
        for (var pk = 0; pk < tk.pts.length; pk++) pts.push(tk.pts[pk]);
      } else {
        pts.push({ x: tk.x2, y: tk.y2 });
      }

      /* ★ 溅射范围：在命中点铺一圈地面冲击波。
         之前"溅射"在画面上完全看不出来（只看到一只怪死了、旁边的也在掉血），
         这一圈就是给玩家看"这一下打到了多大一片"。 */
      if (tk.splashR) {
        var impP = pts[pts.length - 1];
        drawFxAt('hit_shockwave', impP.x, impP.y + 14, tk.splashR * 1.7, ta * 0.5);
      }
      /* ★ 弹射：每两跳之间拉一道电弧（fx_chain_link 原图就是一条横向锯齿闪电） */
      if (beh === 'chain' && pts.length > 1) {
        for (var ci = 1; ci < pts.length; ci++) {
          drawFxLine('fx_chain_link', pts[ci - 1].x, pts[ci - 1].y,
                     pts[ci].x, pts[ci].y, 20, ta * 0.9, 12);
        }
      }

      var pass, width;
      for (pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass === 0 ? ta * 0.35 : ta;
        ctx.strokeStyle = pass === 0 ? tcol : '#fff7ed';
        width = pass === 0 ? (beh === 'pierce' ? 9 : 7) : (beh === 'pierce' ? 2.5 : 2);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var qi = 1; qi < pts.length; qi++) ctx.lineTo(pts[qi].x, pts[qi].y);
        ctx.stroke();
      }

      /* ★ 弹道头部一个亮点：让"子弹在飞"这件事看得出来。
         没有它的话弹道就是一根静止的线，看不出方向。
         ★ 现在这个亮点换成该武器自己的弹道贴图（手枪弹 / 冲锋枪 / 霰弹 / 穿甲弹 /
         狙击弹 / 轨道炮 / 念力球 / 火球 / 冰晶 …）—— 弹道线退成它的拖尾。 */
      var hp2 = 1 - ta;                       // 0=刚出膛 1=到达
      var lastP = pts[pts.length - 1];
      var headX = tk.x1 + (lastP.x - tk.x1) * hp2;
      var headY = tk.y1 + (lastP.y - tk.y1) * hp2;
      var hAng = Math.atan2(lastP.y - tk.y1, lastP.x - tk.x1);
      /* 贴图原图朝右上（-45°），补上基准角差才能对准飞行方向 */
      var drewHead = wfx && drawFxAt(wfx, headX, headY,
                                     C.FX_SIZE.proj * depthScale(headY) * (beh === 'pierce' ? 1.35 : 1),
                                     ta, hAng - C.FX_PROJ_BASE_ANGLE);
      if (!drewHead) {
        ctx.globalAlpha = ta;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(headX, headY, beh === 'pierce' ? 4.5 : 3.2, 0, 6.29);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* ---- 贴图特效（爆炸 / 命中火花 / 暴击环 / 大招…）----
       画在弹道之上、冲击环之下：爆炸要盖住尸体和弹道，但底下的环形波仍是"地面上的"。 */
    drawVfxLayer();

    /* ---- 命中冲击环 ---- */
    var rings = APOC.UIEffects.getRings();
    for (var ri = 0; ri < rings.length; ri++) {
      var rg = rings[ri];
      var rt = 1 - Math.max(0, rg.t / rg.ttl);
      ctx.globalAlpha = (1 - rt) * 0.9;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 3 * (1 - rt) + 1;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * rt, 0, 6.29); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* ---- 粒子 ---- */
    var ps = APOC.UIEffects.getParticles();
    for (var pi = 0; pi < ps.length; pi++) {
      ctx.globalAlpha = Math.max(0, ps[pi].t / ps[pi].ttl);
      ctx.fillStyle = ps[pi].color;
      ctx.beginPath(); ctx.arc(ps[pi].x, ps[pi].y, ps[pi].r, 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---- 怪物血条 ---- */
    st.enemies.forEach(function (e) { drawHpBar(e, isArena); });

    /* ---- 玩家血条（普通关） ---- */
    if (!isArena && st.player) {
      var pl = st.player;
      var bw = 130, bh = 7;
      var bx = pl.x - bw / 2;
      var by = pl.y - (arenaPlayerH(pl)) * 1.02 - 18;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#3f3a34';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(bx, by, bw * Math.max(0, pl.hp / pl.maxHp), bh);
    }

    /* ---- 飘字 ---- */
    if (APOC.State.data.settings.showDamage) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var fi = 0; fi < st.floats.length; fi++) {
        var fl = st.floats[fi];
        ctx.globalAlpha = Math.max(0, fl.t / fl.ttl);
        ctx.font = 'bold ' + Math.round(fl.size * uiScale) + 'px "Microsoft YaHei",sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(fl.text, fl.x, fl.y);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;
    }

    /* ---- 顶部提示（割草进度条 / 普通关波次） ---- */
    drawOverlayHints(st, isArena, sc);

    ctx.restore();
  }

  /* 把任意一帧画进固定的底部对齐框里（宽度按该帧自己的比例，底部居中） */
  function drawPlayerFrame(spr, cx, top, boxW, boxH) {
    var w = boxH * (spr.width / spr.height);
    ctx.drawImage(spr, cx - w / 2, top + boxH - boxH, w, boxH);
  }

  function arenaPlayerH(p) {
    return (p && p.__arena ? C.PLAYER_H_ARENA : C.PLAYER_H) * depthScale(p ? p.y : C.NEAR_Y);
  }

  /* ---------------- 顶部提示 ----------------
     ★ 这个函数曾经被一次错误的批量替换"吞掉"：
     替换的锚点写成了 if (isArena) {，匹配到了 draw() 里的同名判断，
     结果从"画怪物"到"画飘字"的整块渲染代码被换成了下面这段 HUD，
     怪物全部不显示，而三个测试全绿（假 canvas 里 draw 是空操作）。
     改动 render.js 后务必跑 tools/render_test.js —— 它用真实 canvas 出图。 */
  function drawOverlayHints(st, isArena, sc) {
    var F = APOC.Formula;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    if (isArena) {
      var isBoss = st.phase === 'boss';
      var total = (st.stage === 100) ? C.ARENA_DURATION_FINAL : C.ARENA_DURATION;
      var done = Math.max(0, total - Math.max(0, st.remain));
      var barW = 460, barX = (W - barW) / 2, barY = 30, barH = 14;

      if (isBoss && st.boss) {
        /* Boss 阶段：把 Boss 血条顶到最显眼的位置，玩家一眼知道"快打完了" */
        ctx.font = 'bold ' + fsz(20) + 'px "Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 4;
        var bn = st.boss.name || 'BOSS';
        ctx.strokeText(bn, W / 2, barY - 24);
        ctx.fillText(bn, W / 2, barY - 24);

        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.fillRect(barX, barY, barW, barH + 4);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(barX + 2, barY + 2, (barW - 4) * Math.max(0, st.boss.hp / st.boss.maxHp), barH);
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
        ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 6);

        ctx.font = fsz(13) + 'px "Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#9a9187';
        ctx.fillText('击杀 ' + st.killCount + '　强化 ' + st.perkCount + ' 层', W / 2, barY + barH + 14);
        return;
      }

      /* 生存阶段：明确的进度条 + "撑到时间结束"的目标说明 */
      var pct = Math.max(0, Math.min(1, done / total));
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(barX, barY, barW, barH);
      var g2 = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      g2.addColorStop(0, '#0ea5e9');
      g2.addColorStop(1, '#22d3ee');
      ctx.fillStyle = g2;
      ctx.fillRect(barX + 2, barY + 2, (barW - 4) * pct, barH - 4);
      ctx.strokeStyle = '#3f3a34'; ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      var left = Math.ceil(Math.max(0, st.remain));
      var mm = Math.floor(left / 60), ss = left % 60;
      ctx.font = 'bold ' + fsz(15) + 'px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#e7e2d8';
      ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 4;
      var t1 = '撑到时间结束，Boss 就会出现　' + mm + ':' + (ss < 10 ? '0' : '') + ss;
      ctx.strokeText(t1, W / 2, barY + barH + 8);
      ctx.fillText(t1, W / 2, barY + barH + 8);

      /* 下一次强化的倒计时 —— 给个短周期目标，免得"一直在杀"没有盼头 */
      var nextPerk = Math.max(0, Math.ceil(st.perkTimer || 0));
      ctx.font = fsz(13) + 'px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#9a9187';
      ctx.fillText('击杀 ' + F.fmt(st.killCount) + '　已强化 ' + st.perkCount +
                   ' 层　下次强化 ' + nextPerk + 's', W / 2, barY + barH + 36);

      /* ★ 把叠起来的词条摊开显示。
         玩家反馈"三选一提升不明显" —— 光给一个层数看不出来，
         得让他看到自己身上已经堆了什么、堆了几层，成长才"看得见"。 */
      if (st.stacks) {
        var owned = [];
        Object.keys(st.stacks).forEach(function (id) {
          var pk = APOC.Data.PerkById[id];
          if (pk && st.stacks[id] > 0) owned.push({ p: pk, n: st.stacks[id] });
        });
        if (owned.length) {
          /* 按层数从多到少，最多显示 8 条 */
          owned.sort(function (a, b) { return b.n - a.n; });
          owned = owned.slice(0, 8);
          var colW = 118, rows = 2, perRow = Math.ceil(owned.length / rows);
          var startX = W / 2 - (perRow * colW) / 2 + colW / 2;
          ctx.font = fsz(12) + 'px "Microsoft YaHei",sans-serif';
          owned.forEach(function (o, i) {
            var cx2 = startX + (i % perRow) * colW;
            var cy2 = barY + barH + 62 + Math.floor(i / perRow) * 22;
            var isLegend = o.p.rarity === 'legendary';
            var isRare = o.p.rarity === 'rare';
            ctx.fillStyle = isLegend ? '#fb923c' : (isRare ? '#38bdf8' : '#9a9187');
            ctx.fillText(o.p.name + ' ×' + o.n, cx2, cy2);
          });
        }
      }
      return;
    }

    /* 普通关：波次进度 */
    var waveTxt = '第 ' + (st.waveIndex + 1) + ' / ' + st.waves.length + ' 波';
    ctx.font = fsz(14) + 'px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9a9187';
    ctx.fillText(waveTxt, W / 2, 22);

    if (st.phase === 'clearing') {
      ctx.font = 'bold ' + fsz(30) + 'px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(217,119,6,.9)';
      ctx.fillText(st.waveIndex === st.waves.length - 1 ? '关卡完成' : '下一波…', W / 2, H / 2 - 20);
    }
    if (st.phase === 'dead') {
      ctx.font = 'bold ' + fsz(34) + 'px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#dc2626';
      ctx.fillText('阵亡　' + Math.ceil(st.deathTimer) + 's 后重来', W / 2, H / 2 - 20);
    }
  }

  APOC.Render = {
    init: init,
    fit: fit,
    draw: draw,
    get canvas() { return canvas; }
  };
})(window.APOC = window.APOC || {});
