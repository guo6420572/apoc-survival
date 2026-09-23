/* combat.js — 普通关自动战斗（3 波，怪数随关卡从 20 涨到 70，见 difficulty.js） */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula, R = APOC.RNG;

  /* 竖版战场：怪物从远端（上方）压向近端（下方）的玩家 */

  var st = null;
  var nextEid = 1;

  /* 地面半宽：随纵深线性变化，出怪和走位都要夹在这个范围里 */
  function floorHalf(y) {
    var t = (y - C.FAR_Y) / (C.NEAR_Y - C.FAR_Y);
    t = Math.max(0, Math.min(1.25, t));
    return C.FLOOR_HALF_FAR + (C.FLOOR_HALF_NEAR - C.FLOOR_HALF_FAR) * t;
  }
  function clampToFloor(o) {
    var hw = floorHalf(o.y);
    var lo = C.LANE_X - hw, hi = C.LANE_X + hw;
    if (o.x < lo) o.x = lo; else if (o.x > hi) o.x = hi;
  }
  var DEATH_TIME = 0.38;      // 死亡动画时长（秒）

  /* ---------------- 关卡编成 ----------------
     ★ 每关分波出兵，波大小 = Config.WAVE_SIZES = [5, 10, 15, 20]，**整波一次性投放**。
     怪数唯一真源是 Difficulty.wavesOf(K)（默认就是 WAVE_SIZES，某关要特殊波次
     在数据表里给该关加 waves 字段即可）—— countOf 也是各波之和，两处不会脱节。

     为什么必须整波投放：出怪线到玩家 789px，怪走完要 4.5~9.2 秒，而玩家只集火队首。
     「一批 B 只同时出发」能到达的条件是 B × 单只击杀耗时 > 走完时间。以前 10 只一批，
     末波 20 也要分两批，实测怪全部死在半路（能打到玩家的帧数 0/2400）。
     整波投放后末波 20 只同时出发，杀完要 12 秒 > 4.5 秒 → 必然有十几只压到脸上。

     ★ 波次是**严格串行**的（清完才进下一波），所以每一波是一场独立战斗，
     压力靠波大小递进。

     ★★ 改波数会打断 startWave 里的两处硬编码（idx===1 放宝箱怪、idx===2 放游荡 Boss），
     这两个稀有事件会**静默消失且没有测试能抓到** —— 4 波时它们分别挂在第 2 波和第 3 波
     （见 WAVE_WITH_MIMIC / WAVE_WITH_WANDER），改波数请同步这两个常量并补断言。 */
  var WAVE_WITH_MIMIC = 1;      // 下标：第 2 波
  var WAVE_WITH_WANDER = 2;     // 下标：第 3 波

  function buildWaves(K) {
    var scene = APOC.Data.sceneOfStage(K);
    var normals = APOC.Data.normalsOfScene(scene.id).map(function (m) { return m.id; });
    var elite = APOC.Data.eliteOfScene(scene.id);
    var comp = APOC.Difficulty.compOf(K);
    var per = APOC.Difficulty.wavesOf(K);      // 每波怪数，唯一真源

    var waves = [];
    for (var i = 0; i < per.length; i++) {
      var isLast = (i === per.length - 1);
      /* 精英只出现在末波，数量固定（精英关 2 只），与 count 无关 ——
         精英 TIER 是 hp4.0 / exp6.0 / gold4.0，按比例铺开会冲爆掉落与经验 */
      var nElite = (isLast && elite) ? comp.elite : 0;
      var nNormal = Math.max(0, per[i] - nElite);

      var list = [];
      /* 小怪按场景怪种**循环铺满**（不是以前那种"3 种各 2 只"）。
         70 只的规模下只放 3 种怪，观感会非常单调 */
      if (normals.length) {
        for (var j = 0; j < nNormal; j++) list.push(normals[j % normals.length]);
      }
      shuffle(list);                          // ★ 保留 RNG 消耗位置，别挪走（见下）
      for (var e = 0; e < nElite; e++) list.push(elite.id);

      waves.push({
        list: shuffle(list),
        /* ★ 整波一次性投放：批大小 = 本波怪数，一波的怪同时入场。
           同屏放不下时（room < 本波怪数）才按 WAVE_REFILL_SEC 分批补。 */
        group: per[i],
        /* ★ 按波次的强度曲线：第一波 0.35、末波 1.45（见 Config.WAVE_POWER）。
           保证"刚通过上一个 BOSS 关的玩家"打新关第一波是热身而不是拦路虎。 */
        power: C.WAVE_POWER[i] || 1,
        interval: C.WAVE_REFILL_SEC,
        /* 末波本来就是 20 只 = MAX_ALIVE，两个上限现在同值；分开写是为了
           将来调末波压力时只动一处。 */
        maxAlive: isLast ? C.MAX_ALIVE_ELITE : C.MAX_ALIVE
      });
    }
    return waves;
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = R.int(0, i);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------------- 实体构造 ---------------- */
  function makePlayer() {
    var s = APOC.Stats.final();
    return {
      x: C.PLAYER_X0, y: C.NEAR_Y,
      hp: s.hp, maxHp: s.hp,
      atkCd: 0, hitFlash: 0, atkFx: 0,
      anim: 0, bobPhase: 0, bobAmp: 0, lunge: 0, walk: 0,   // 动画用
      shield: 0, shieldCd: 0,
      regenAcc: 0,
      timers: {}            // 湮灭/领域/奇点等独立计时器
    };
  }

  function makeEnemy(monsterId, K) {
    var m = APOC.Data.Monsters[monsterId];
    /* 割草关的难度来自同屏 150 只 + 时间曲线，不走按关的难度表 */
    var mod = (st && st.mode === 'arena') ? APOC.Difficulty.IDENT : null;
    var base = F.monBase(K, m, mod);
    return {
      eid: nextEid++,
      mid: m.id,
      name: m.name,
      tier: m.tier,
      /* 出怪点必须落在地面梯形的远端窄口里，横向散开靠 xOffset 在逼近过程中展开 */
      x: C.LANE_X + R.range(-1, 1) * C.FLOOR_HALF_FAR * 0.85,
      y: C.FAR_Y - R.range(10, 60),
      /* 偏右：主角在左侧占了小半个屏幕，怪若往左偏会被她整个挡住 */
      xOffset: R.range(-0.15, 0.95),   // 相对地面半宽的比例，越近展开越宽
      hp: base.hp, maxHp: base.hp,
      atk: base.atk, def: base.def, exp: base.exp, gold: base.gold,
      spd: m.spd * C.MON_SPD_MUL, range: m.range, atkInterval: m.atkInterval,
      size: m.size, color: m.color, emoji: m.emoji,
      behavior: m.behavior, isRanged: m.isRanged,
      atkCd: R.range(0, m.atkInterval),
      hitFlash: 0,
      anim: R.range(0, 6.28), bobPhase: R.range(0, 6.28), bobAmp: 0, lunge: 0, walk: 0,
      dying: false, deathT: 0, stun: 0, stunCd: 0,
      spawnFade: 0,        // 出生淡入，避免在远处凭空冒出来
      burn: null, bleed: null, freeze: 0, freezeCd: 0,
      phaseSkill: m.phaseSkill, phaseText: m.phaseText, phaseTriggered: false,
      knock: 0
    };
  }

  /* ---------------- 目标选择 ---------------- */
  function dist(a, b) {
    var dx = a.x - b.x, dy = (a.y || 0) - (b.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ★ 溅射半径口径的**唯一真源**：武器自带 与 词条「爆裂」取最大值（不叠加）。
     resolveTargets 用它算打中谁，attack 用它给渲染层画那圈地面冲击波 ——
     两处共用才不会有"打到的范围和画出来的范围对不上"。 */
  function splashRadiusOf(w, s) {
    var r = (w.behavior === 'splash') ? (w.splashR || 0) : 0;
    /* 词条半径取「割草关基础半径」与「90」的较大值 */
    if (s.special.splash) r = Math.max(r, C.ARENA_SPLASH_R || 90);
    return r;
  }

  function resolveTargets(cands, w, s) {
    var out = [];
    /* 1) 武器自己的命中数 */
    var mainCount;
    if (w.behavior === 'multi')       mainCount = (w.targets || 1);
    else if (w.behavior === 'pierce') mainCount = w.pierceN || 1;
    else if (w.behavior === 'chain')  mainCount = 1 + (w.chainN || 0);
    else                              mainCount = 1;

    /* 2) ★ 词条/被动给的「额外命中目标」对**所有**武器生效。
       原来只在 multi 分支里加 multiTarget，于是手枪（behavior=single）拿
       「多重射击」词条毫无效果 —— 玩家点了一堆科技/词条却发现还是单体，就是这个原因。
       chain 同理：它应该给任何武器加弹射目标，而不是只对 chain 类武器有用。 */
    mainCount += (s.special.multiTarget || 0);
    mainCount += (s.special.chain || 0);

    var i;
    for (i = 0; i < Math.min(mainCount, cands.length); i++) {
      var mul = 1;
      if (w.behavior === 'pierce' && i > 0 && w.decay) mul = Math.pow(1 - w.decay, i);
      if (w.behavior === 'chain'  && i > 0)            mul = Math.pow(w.chainDecay || 0.75, i);
      out.push({ e: cands[i], mul: mul });
    }

    /* 溅射：武器自带 与 词条「爆裂」取最大值，不叠加 */
    var splashR = splashRadiusOf(w, s);
    var splashMul = (w.behavior === 'splash') ? (w.splashMul || 0) : 0;
    if (s.special.splash) {
      splashMul = Math.max(splashMul, s.special.splash);
    }
    if (splashR > 0 && cands.length > 1) {
      var center = cands[0];
      for (i = 1; i < cands.length; i++) {
        var c = cands[i];
        var already = false;
        for (var j = 0; j < out.length; j++) if (out[j].e === c) { already = true; break; }
        if (already) continue;
        if (dist(c, center) <= splashR) out.push({ e: c, mul: splashMul });
      }
    }
    return out;
  }

  /* ---------------- 攻击 ----------------
     actor 用于决定伤害来源（玩家 / Arena 词条），复用同一套结算 */
  function attack(actor) {
    var s = actor === 'player' ? APOC.Stats.damageStats(st.player.hp / st.player.maxHp) : actor.stats;
    var w = actor === 'player' ? APOC.Tech.currentWeapon() : actor.weapon;
    if (!w) return;
    var range = F.weaponRange(w) * (1 + (s.rangePct || 0) / 100);

    var cands = [];
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.hp <= 0) continue;
      if (dist(e, st.player) <= range) cands.push(e);
    }
    if (!cands.length) return;
    /* 用 2D 距离排序：普通关所有单位 y 相同，等价于 x 距离；割草关才有区别 */
    cands.sort(function (a, b) { return dist(a, st.player) - dist(b, st.player); });

    var targets = resolveTargets(cands, w, s);
    if (!targets.length) return;

    var A = {
      atk: s.atk, crit: s.crit, critDmg: s.critDmg, dmgUp: s.dmgUp,
      pen: s.pen, penPct: s.penPct, level: s.level,
      dmgMul: s.special.dmgMul, trueDamage: s.special.trueDamage
    };

    /* 攻击视觉：弹道。
       ★ 带上 line 与 behavior，渲染层才能画出三条线的区别 ——
       以前这里只有一个裸对象，render.js 里 behavior 零命中，
       于是 60px 的拳套和 700px 的电磁轨道炮画出来是同一条橙色直线，
       贯穿/弹射/溅射在画面上完全看不出来。
       同时把**全部命中目标**带过去：chain 要画折线、multi 要画多条。 */
    st.tracers.push({
      x1: (st.player.__muzzleX !== undefined ? st.player.__muzzleX : st.player.x),
      y1: (st.player.__muzzleY !== undefined ? st.player.__muzzleY : st.player.y - 52),
      x2: targets[0].e.x, y2: targets[0].e.y - targets[0].e.size * 1.4,
      line: w.line, behavior: w.behavior,
      /* ★ 武器 id：渲染层靠它取这把武器自己的弹道 / 弧光贴图（Config.FX_WEAPON） */
      wid: w.id,
      /* ★ 溅射半径：渲染层靠它在命中点铺一圈地面冲击波，
         口径与 resolveTargets 共用 splashRadiusOf，不会和实际打中的范围对不上 */
      splashR: splashRadiusOf(w, s),
      pts: targets.map(function (t) {
        return { x: t.e.x, y: t.e.y - t.e.size * 1.4 };
      }),
      t: 0.09, ttl: 0.09
    });
    st.player.atkFx = 0.12;
    /* 每种武器一个音色（枪械按口径分七档，近战是风声/闷响，异能是电子音）。
       有同名音频文件（sfx/<音效id>.wav）时播文件，没有就用合成音。 */
    APOC.Audio.play(APOC.Audio.weaponSfx(w.id));
    /* 主角攻击语音。节流在 audio.js 里统一做（AUDIO_VOICE_GAP）——
       攻速上限 5 次/秒，不节流的话一条 3 秒的语音会被打断重头播，糊成一片。 */
    APOC.Audio.playVoice('voice_attack');

    var totalDmg = 0, anyCrit = false, anyHit = false;
    for (var k = 0; k < targets.length; k++) {
      var t = targets[k];
      A.coef = w.coef * t.mul * (t.e.tier !== 'normal' ? (1 + (s.eliteDmg || 0) / 100) : 1);
      var res = F.hit(A, {
        /* ★ 这里原来把 dodge 写死成 0，导致怪物数据里的闪避属性从来没生效过。
           宝箱怪就是靠这一条实现"难打中"的。 */
        def: t.e.def, dmgReduce: 0, dodge: t.e.dodge || 0, isPlayer: false
      });
      if (res.value <= 0) continue;
      t.e.hp -= res.value;
      /* ★ 记"这只怪挨了玩家几下"——自适应难度判"被秒杀"用。
         ★ 只在这里记，不记溅射/持续伤害（燃烧/领域/奇点）那几条路：
           "一枪打死"说的是玩家一次攻击就带走，被烧死的怪不算一枪。 */
      t.e.hitsTaken = (t.e.hitsTaken || 0) + 1;
      t.e.hitFlash = 0.22;
      /* ★ 打击感：僵直 + 击退 + 受击白闪。
         但**绝不允许连续刷新** —— 玩家持续开火时，每发都重置僵直/击退的话，
         怪会被永久钉在原地、既走不动也打不了，看起来就是"卡死"。
         所以加「霸体窗口」：一次僵直结束后有一段时间免疫新的僵直/击退。 */
      if (!(t.e.stunCd > 0)) {
        t.e.stun = res.crit ? 0.22 : 0.12;
        t.e.stunCd = res.crit ? 0.9 : 1.4;  // 霸体窗口：这段时间内不再吃僵直
        t.e.knock = res.crit ? 0.16 : 0.09;
      }
      totalDmg += res.value;
      anyHit = true;
      if (res.crit) anyCrit = true;
      floatText(t.e.x, t.e.y - t.e.size * 2, res.value, res.crit);

      /* 命中反馈：火花必出，暴击再加冲击环和震屏 */
      var hy = t.e.y - t.e.size * 1.2;
      /* 命中色：暴击时用亮金（全局限定，一眼看出暴击），
         平时按武器所属的线取色 —— 三条线打起来才看得出区别 */
      var lineCol = (C.LINE_COLORS && C.LINE_COLORS[w.line]) || '#ffd166';
      var hcol = res.crit ? '#fbbf24' : lineCol;
      APOC.UIEffects.spark(t.e.x, hy, hcol, res.crit ? 8 : 3, res.crit ? 1.5 : 1);
      /* ★ 命中火花贴图：按武器所属的线取图（枪=橙 / 异能=紫 / 近战=红），
         粒子负责"迸出去的火星"，贴图负责"炸开的那一下"。 */
      APOC.UIEffects.vfx(C.FX_HIT_SPARK[w.line], t.e.x, hy, {
        size: C.FX_SIZE.hit_spark * (res.crit ? 1.8 : 1),
        ttl: 0.20, s0: 0.65, s1: 1.30, a0: 1, a1: 0, rot0: R.range(0, 6.28)
      });
      /* ★ 吸血：被吸的那只怪身上泛一层红丝，玩家才知道"我在回血是因为打它" */
      if (s.lifesteal > 0) {
        APOC.UIEffects.vfx('fx_lifesteal', t.e.x, t.e.y - t.e.size * 1.4, {
          size: C.FX_SIZE.fx_lifesteal, ttl: 0.35, s0: 1.15, s1: 0.7, a0: 0.9, a1: 0
        });
      }
      if (res.crit) {
        APOC.UIEffects.ring(t.e.x, hy, hcol, 5, 38, 0.22);
        /* 暴击冲击环贴图：金色星芒环，压过程序化的那个细圈 */
        APOC.UIEffects.vfx('hit_crit_ring', t.e.x, hy, {
          size: C.FX_SIZE.hit_crit_ring, ttl: 0.30,
          s0: 0.45, s1: 1.25, a0: 1, a1: 0, rot0: R.range(0, 6.28)
        });
        APOC.UIEffects.shake(4, 0.10);
        hitStop(0.045);              // 顿帧：暴击时整个世界停 45ms
      }

      /* 灼烧 / 流血 / 冻结 */
      if (w.burn || s.special.burn) {
        var bd = (s.special.burn ? s.atk * s.special.burn / 100 : s.atk * (w.burn || 0));
        var dmgPerSec = bd * (1 + (s.special.dotUp || 0) / 100);
        t.e.burn = { dps: dmgPerSec, t: 5 };
      }
      if (w.bleed || s.special.bleed) {
        var chance = (s.special.bleed || 0) + (w.bleed ? w.bleed * 100 : 0);
        if (R.chance(chance / 100)) t.e.bleed = { dps: s.atk * 0.4, t: 3 };
      }
      /* 冻结：和上面的僵直是同一个坑 —— 每发都能刷新的话，攻速一高就是永久冻结。
         免疫窗口内不再触发，把覆盖率压到 FREEZE_SEC / FREEZE_IMMUNE_SEC 以下。 */
      if (!(t.e.freezeCd > 0) && (w.freezeChance || s.special.freeze) &&
          R.chance(((w.freezeChance ? w.freezeChance * 100 : 0) + (s.special.freeze || 0)) / 100)) {
        t.e.freeze = C.FREEZE_SEC;
        t.e.freezeCd = C.FREEZE_IMMUNE_SEC;
      }
      if (t.e.hp <= 0) killEnemy(t.e, K_OF());
    }

    /* 一次攻击只发一声命中音，多目标武器不会糊成一片 */
    if (anyHit) APOC.Audio.play(anyCrit ? 'hit_crit' : 'hit', { gap: 0.02 });
    if (totalDmg > 0 && s.lifesteal > 0) {
      healPlayer(totalDmg * s.lifesteal / 100);
    }
    if (totalDmg > 0 && s.special.thorns > 0) { /* thorns 是被动，放在受击处 */ }
  }

  function K_OF() { return st ? st.stage : 1; }

  function healPlayer(v) {
    var p = st.player;
    p.hp = Math.min(p.maxHp, p.hp + v);
  }

  function floatText(x, y, val, crit) {
    if (!APOC.State.data.settings.showDamage) return;
    st.floats.push({
      x: x + R.range(-8, 8), y: y,
      text: crit ? val + '!' : String(val),
      color: crit ? '#fbbf24' : '#ffffff',
      size: crit ? 22 : 15,
      t: 0.9, ttl: 0.9
    });
    if (st.floats.length > 60) st.floats.shift();
  }

  /* ---------------- 击杀结算 ---------------- */
  /* 击杀爆炸的大小按档位分：小怪小、精英中、Boss 大 */
  var BOOM_SCALE = { normal: 0.7, elite: 1.35, boss: 2.2 };

  function killEnemy(e, K) {
    hitStop(0.035);                  // 击杀顿帧
    /* ★ 击杀爆炸：没有它的话怪就是"淡出消失了"，一点打击感都没有 */
    var bscale = BOOM_SCALE[e.tier] || 0.7;
    APOC.UIEffects.explode(e.x, e.y - e.size * 1.2, e.color || '#fb923c', bscale);
    /* ★ 击杀爆炸贴图，按怪物档位分三张：小怪小火球 / 精英大爆炸 / Boss 最壮观的那个。
       尺寸查 FX_SIZE['explode_' + 档位]，小怪那一档在表里的键名是 explode_small，
       查不到就落到它头上 —— 加新档位时 FX_BOOM / FX_SIZE / 这里三处要一起加。 */
    APOC.UIEffects.vfx(C.FX_BOOM[e.tier] || 'explode_small',
                       e.x, e.y - e.size * 1.2, {
      size: C.FX_SIZE['explode_' + e.tier] || C.FX_SIZE.explode_small,
      ttl: e.tier === 'boss' ? 0.85 : (e.tier === 'elite' ? 0.60 : 0.45),
      s0: 0.55, s1: 1.12, a0: 1, a1: 0, rot0: R.range(0, 6.28)
    });
    if (e.tier !== 'normal') APOC.UIEffects.shake(6, 0.16);
    APOC.Audio.play('kill', { gap: 0.03 });
    /* 怪物死亡：优先这只怪自己的音（mob_<怪物id>_die → mob_<怪物id>），
       没有就按体型分两档 */
    APOC.Audio.playMonster(e.mid, 'die',
      e.tier === 'normal' ? 'mon_die_small' : 'mon_die_big', { gap: 0.04 });
    var D = APOC.State.data;
    D.stats.totalKills++;
    /* ★ 自适应难度（血量侧）：只要有一只怪**挨了第二下**才死，本波就不算被秒杀。
       挨几下记在 attack() 里（hitsTaken），只记玩家的直接攻击，
       不算溅射/燃烧/领域那些 —— "一枪打死"说的是玩家一次攻击就带走。 */
    if ((e.hitsTaken || 0) > 1) st.waveOneShot = false;
    APOC.Bus.emit('kill', { monsterId: e.mid, tier: e.tier });

    var s = APOC.Stats.final();
    var scene = APOC.Data.sceneOfStage(K);

    /* ★ 产出归一化：普通关按"每关总量 / 本关怪数"结算，怪数涨则单只产出等比降。
       割草关走原口径（killYield 内部按 isArena 分流）—— 不做这个分流，
       普通关的归一化会把割草关收益静默砍掉 3.5 倍，而且所有测试都是绿的。 */
    var isArena = !!(APOC.Arena && APOC.Arena.isActive());
    /* ★ 割草关产出封顶 —— 配合"撤掉同屏 150 只硬闸"一起上。
       撤闸之后一场的击杀数没有上界，而 killYield 对割草关传 isArena → expMul = 1
       **不打折**，再叠 growing 每杀永久复利，一场就能把等级打穿、材料爆仓。
       超出上限的击杀只记战功、不发产出（怪照出、仗照打）。
       把 Y 整体清零是最省事的闸口：经验/金币/材料/普通掉落走的是同一个 Y。 */
    var aSt = isArena ? APOC.Arena.state : null;
    var capped = !!(aSt && aSt.killCount >= C.ARENA_KILL_CAP);
    var Y = F.killYield(K, isArena);
    if (capped) {
      Y = { expMul: 0, matChance: 0, itemChance: 0, goldPerKill: function () { return 0; } };
    }

    /* 经验 */
    var expGain = Math.round(e.exp * Y.expMul * (1 + s.expPct / 100));
    gainExp(expGain);

    /* 金币 */
    var gold = Y.goldPerKill(e.tier) * (1 + s.goldPct / 100);
    APOC.Inventory.addGold(gold);

    /* 材料 */
    var drops = Y.matChance * (e.tier === 'normal' ? 1 : 3);
    /* 割草关同屏几百只，单只产出必须打折 */
    if (isArena) drops *= C.ARENA_DROP_MUL;
    var n = Math.floor(drops);
    if (R.chance(drops - n)) n++;
    var mats = scene.materials;
    for (var i = 0; i < n; i++) {
      var matId = R.pick(mats);
      var qty = F.matQty(K);
      if (e.tier !== 'normal') qty *= 3;
      if (APOC.Arena && APOC.Arena.isActive()) qty = Math.max(1, Math.round(qty * C.ARENA_DROP_MUL * 3));
      APOC.Inventory.addMaterial(matId, qty);
      var mat = APOC.Data.Materials[matId];
      st.floats.push({
        x: e.x, y: e.y - e.size * 2 - 18,
        text: mat.icon + '+' + qty, color: mat.color, size: 14, t: 1.0, ttl: 1.0
      });
    }

    /* 词条：击杀回复 / 尸爆 */
    if (APOC.Arena && APOC.Arena.isActive()) {
      if (s.special.killHeal) healPlayer(st.player.maxHp * s.special.killHeal / 100);
      if (s.special.killBomb) {
        APOC.UIEffects.explode(e.x, e.y - e.size, '#f97316', 1.5);
        splashAt(e.x, e.y, s.atk * s.special.killBomb, 90, e);
      }
      APOC.Arena.onKill(e);
    }

    /* 装备掉落：精英必掉；普通小怪有小概率掉（BOSS/精英另有保底，见下）。
       这条不吃 Y，所以封顶要单独挡一次 */
    if (!capped && e.tier !== 'normal') {
      var it = APOC.Inventory.rollDrop(K, false);
      if (it) APOC.Inventory.addItem(it);
    } else if (R.chance(Y.itemChance)) {
      var nit = APOC.Inventory.rollDrop(K, false);
      if (nit) APOC.Inventory.addItem(nit);
    }

    /* ---------- 稀有单位的额外奖励 ---------- */
    if (e.variant === 'elite' && !capped) {
      /* 变异精英：材料 ×3 + 必掉一件装备（品质随机）。同样不吃 Y，单独挡 */
      scene.materials.forEach(function (mid) { APOC.Inventory.addMaterial(mid, F.matQty(K) * 3); });
      var ei = APOC.Inventory.rollDrop(K, false);
      if (ei) APOC.Inventory.addItem(ei);
      APOC.Bus.emit('toast', { type: 'success', text: '★ 击杀变异精英，额外掉落！' });
    }
    if (e.variant === 'mimic') {
      /* 宝箱怪：一笔横财 —— 大量金币 + 材料 + 保底紫装 */
      var mg = Math.round(F.goldPerStage(K, scene.sceneMul, 3) * 6);
      APOC.Inventory.addGold(mg);
      scene.materials.forEach(function (mid) { APOC.Inventory.addMaterial(mid, F.matQty(K) * 8); });
      var mi = APOC.Inventory.rollDrop(K, false, 3);
      if (mi) APOC.Inventory.addItem(mi);
      APOC.UIEffects.ring(e.x, e.y, '#fbbf24', 10, 120, 0.5);
      APOC.Audio.play('drop_epic', { gap: 0.2 });
      APOC.Bus.emit('toast', { type: 'success',
        text: '💰 追到宝箱怪！+' + F.fmt(mg) + ' 金币 + 保底紫装', shake: true });
    }
    if (e.variant === 'wanderBoss') {
      /* 游荡 Boss：最丰厚的一档 */
      var wg = Math.round(F.goldPerStage(K, scene.sceneMul, 3) * 20);
      APOC.Inventory.addGold(wg);
      scene.materials.forEach(function (mid) { APOC.Inventory.addMaterial(mid, F.matQty(K) * 15); });
      var wi = APOC.Inventory.rollDrop(K, false, 4);
      if (wi) APOC.Inventory.addItem(wi);
      st.wanderBoss = null;
      APOC.UIEffects.shake(14, 0.6);
      APOC.Audio.play('stage_clear', { gap: 0.5 });
      APOC.Bus.emit('toast', { type: 'success',
        text: '☠ 击杀' + e.name + '！+' + F.fmt(wg) + ' 金币 + 保底橙装', shake: true });
    }

    APOC.State.markDirty();
    e.dead = true;
  }

  function splashAt(x, y, dmg, radius, exclude) {
    /* 范围伤害落点铺一圈地面冲击波：让"这一下打了一片"看得见 */
    APOC.UIEffects.vfx('hit_shockwave', x, y + 10, {
      size: radius * 1.7, ttl: 0.32, s0: 0.5, s1: 1.15, a0: 0.85, a1: 0
    });
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.hp <= 0 || e === exclude) continue;
      if (dist(e, { x: x, y: y }) <= radius) {
        var v = Math.round(dmg);
        e.hp -= v;
        e.hitFlash = 0.15;
        floatText(e.x, e.y - e.size * 2, v, false);
        if (e.hp <= 0) killEnemy(e, st.stage);
      }
    }
  }

  function gainExp(v) {
    var p = APOC.State.data.player;
    p.exp += v;
    while (p.level < C.MAX_LEVEL) {
      var need = F.expNeed(p.level);
      if (p.exp < need) break;
      p.exp -= need;
      p.level++;
      p.freePoints += C.POINTS_PER_LEVEL;
      APOC.Stats.markDirty();
      APOC.Bus.emit('levelup', { level: p.level });
    }
    if (p.level >= C.MAX_LEVEL) p.exp = 0;
  }

  /* ---------------- 每 tick ---------------- */
  function tick(dt) {
    if (!st || !st.active) return;
    var s = APOC.Stats.final();
    var p = st.player;

    /* --- 玩家计时器（科技树/词条的独立效果） --- */
    tickPlayerEffects(dt, s);

    /* --- 玩家回复 --- */
    if (s.hpRegenPct > 0) {
      p.regenAcc += p.maxHp * s.hpRegenPct / 100 * dt;
      if (p.regenAcc >= 1) { var h = Math.floor(p.regenAcc); p.regenAcc -= h; healPlayer(h); }
    }

    /* --- 生成怪（受同屏存活数闸门限制，避免整波挤上来围殴） --- */
    if (st.phase === 'spawning') {
      st.spawnTimer -= dt;
      var aliveNow = countAlive();          // 波次推进口径：不含宝箱怪
      var capNow = aliveForCap();           // 同屏上限口径：含宝箱怪
      /* ★ 一次放**整波**（spawnGroup = 本波怪数，见 buildWaves）：
         整波同时入场，末波的 20 只才会一起压上来。同屏放不下时才分批补。 */
      if (st.spawnTimer <= 0 && st.spawnQueue.length && capNow < st.maxAlive) {
        var room = st.maxAlive - capNow;
        var batch = Math.min(st.spawnGroup || 1, st.spawnQueue.length, room);
        for (var b = 0; b < batch; b++) spawnEnemy(st.spawnQueue.shift());
        st.spawnTimer = st.spawnInterval;
      }
      if (!st.spawnQueue.length && aliveNow === 0) st.phase = 'fighting';
    }

    /* --- 玩家行动 --- */
    updatePlayer(dt, s);

    /* --- 怪物行动 --- */
    for (var i = 0; i < st.enemies.length; i++) {
      updateEnemy(st.enemies[i], dt, s);
    }

    /* --- DoT --- */
    for (i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.hp <= 0) continue;
      /* ★ 状态要有可见的表现，不然玩家只看到血量自己掉、不知道发生了什么。
         火苗和血滴按概率冒，不是每帧都冒 —— 每帧都来的话 20 只怪同屏会糊成一片。 */
      if (e.burn) {
        var bv = e.burn.dps * dt;
        e.hp -= bv;
        e.burn.t -= dt;
        if (e.burn.t <= 0) e.burn = null;
        if (R.chance(dt * 9)) APOC.UIEffects.flame(e.x, e.y - e.size * 1.4, 1);
        if (e.hp <= 0) { killEnemy(e, st.stage); continue; }
      }
      if (e.bleed) {
        var lv = e.bleed.dps * dt;
        e.hp -= lv;
        e.bleed.t -= dt;
        if (e.bleed.t <= 0) e.bleed = null;
        if (R.chance(dt * 7)) APOC.UIEffects.drip(e.x, e.y - e.size * 1.2, 1);
        if (e.hp <= 0) { killEnemy(e, st.stage); continue; }
      }
    }

    /* --- 死亡动画 → 清理 ---
       hp<=0 的怪不当场 splice，先留 DEATH_TIME 秒给渲染层做缩小淡出，
       否则怪物会"啪"地凭空消失，这是僵硬感的主要来源之一。 */
    for (i = st.enemies.length - 1; i >= 0; i--) {
      var dy = st.enemies[i];
      if (dy.hp > 0) continue;
      if (!dy.dying) {
        dy.dying = true; dy.deathT = DEATH_TIME;
        APOC.UIEffects.burst(dy.x, dy.y - dy.size, dy.color, 7);
      }
      dy.deathT -= dt;
      if (dy.deathT <= 0) st.enemies.splice(i, 1);
    }

    /* --- 自适应难度（攻击侧）---
       怪够到玩家、**贴着打了 contactSec 秒还没被清掉** → 攻击翻倍。
       为什么用时长而不是"够没够到"：够到只是个布尔量，一波怪可能够到了但
       瞬间被打光——那是玩家强，不该加攻击。撑过 10 秒说明是真僵持。
       ★ 只在 fighting 阶段累加，且一断接触就归零（"持续围着打"才算）。 */
    if (st.phase === 'fighting' && st.contactedThisTick) {
      st.contactSec += dt;
      if (st.contactSec >= C.WAVE_ADAPT.contactSec) {
        st.contactSec = 0;
        var na = Math.min(C.WAVE_ADAPT.atkCap, st.waveAtkMul * C.WAVE_ADAPT.atkStep);
        if (na > st.waveAtkMul) {
          st.waveAtkMul = na;
          APOC.Bus.emit('toast', { type: 'danger',
            text: '☠ 怪打出了手感：攻击 ×' + na });
        }
      }
    } else {
      st.contactSec = 0;                 // 没在打 / 这一帧没人贴着 → 归零，只认连续接触
    }
    st.contactedThisTick = false;

    /* --- 波次推进 --- */
    updateWaveFlow(dt);

    /* --- 视觉时效 --- */
    decayVisuals(dt);

    /* --- 玩家阵亡 --- */
    if (p.hp <= 0) onPlayerDeath();
  }

  function tickPlayerEffects(dt, s) {
    var p = st.player, sp = s.special;

    /* 精神护盾（科技树 psi_4a） */
    if (sp.shield > 0) {
      var shieldMax = p.maxHp * sp.shield / 100;
      if (p.shieldCd > 0) {
        p.shieldCd -= dt;
        if (p.shieldCd <= 0) {
          p.shield = shieldMax;
          /* 盾重生要有提示，否则玩家只看到圈突然出现 */
          APOC.UIEffects.ring(p.x, p.y - 60, '#38bdf8', 10, 90, 0.45);
        }
      }
      if (p.shield > shieldMax) p.shield = shieldMax;
    }

    /* 毁灭之力：每 5 次攻击触发震荡波（在攻击里计数，这里只处理冷却） */
    /* 湮灭：每 8 秒贯穿射线 */
    if (sp.annihilate > 0) {
      p.timers.annihilate = (p.timers.annihilate || 8) - dt;
      if (p.timers.annihilate <= 0) {
        p.timers.annihilate = 8;
        var dmg = s.atk * sp.annihilate / 100;
        /* ★ 全屏贯穿要有"横扫"的画面：从走廊最深处到玩家画一条粗射线，
           每个被打中的怪身上炸一下。没有它这只是"全场怪同时掉血"。 */
        st.tracers.push({
          x1: C.LANE_X, y1: C.FAR_Y - 40,
          x2: C.LANE_X, y2: C.NEAR_Y,
          line: 'psi', behavior: 'pierce', beam: true, t: 0.35, ttl: 0.35
        });
        /* ★ 湮灭大招贴图：贯穿全屏的紫白光柱（渲染层还叠了一条 proj_annihilate_beam，
           这里这张是"整屏都在亮"的那层，尺寸铺满画面高度）。 */
        APOC.UIEffects.vfx('ult_annihilate', C.LANE_X, (C.FAR_Y + C.NEAR_Y) / 2, {
          size: C.VIEW_H * 1.15, ttl: 0.42, s0: 1, s1: 1.06, a0: 0.9, a1: 0
        });
        APOC.UIEffects.shake(9, 0.28);
        for (var i = 0; i < st.enemies.length; i++) {
          var e = st.enemies[i];
          if (e.hp <= 0) continue;
          var d = Math.round(dmg * 0.5);
          e.hp -= d; e.hitFlash = 0.15;
          APOC.UIEffects.explode(e.x, e.y - e.size, '#a855f7', 0.8);
          APOC.UIEffects.vfx('hit_spark_purple', e.x, e.y - e.size, {
            size: C.FX_SIZE.hit_spark * 1.3, ttl: 0.22, s0: 0.6, s1: 1.3, a0: 1, a1: 0
          });
          floatText(e.x, e.y - e.size * 2, d, false);
          if (e.hp <= 0) killEnemy(e, st.stage);
        }
        APOC.UIEffects.shake(4, 0.12);
      }
    }

    /* 领域：周围 200px 每秒受伤 */
    if (sp.domain > 0) {
      /* ★ 领域必须有那个"圈"。没有它玩家只看到怪自己在掉血，不知道是自己的技能。 */
      p.timers.domainFx = (p.timers.domainFx || 0) - dt;
      if (p.timers.domainFx <= 0) {
        p.timers.domainFx = 0.9;
        APOC.UIEffects.ring(p.x, p.y - 40, '#a855f7', 30, 200, 0.9);
        /* 领域法阵贴图：脚下那张带符文环的紫色圆盘，缓慢自转（描边靠它才像"场"） */
        APOC.UIEffects.vfx('ult_domain', p.x, p.y, {
          size: C.FX_SIZE.ult_domain, ttl: 0.9,
          s0: 0.92, s1: 1.04, a0: 0.8, a1: 0, rot0: 0, rot1: 0.4
        });
      }
      var dd = s.atk * sp.domain / 100 * dt;
      for (var j = 0; j < st.enemies.length; j++) {
        var en = st.enemies[j];
        if (en.hp <= 0) continue;
        if (Math.abs(en.x - p.x) <= 200 && Math.abs(en.y - p.y) <= 220) {
          en.hp -= dd;
          if (en.hp <= 0) killEnemy(en, st.stage);
        }
      }
    }

    /* 奇点：每 20 秒吸引 + 重击 */
    if (sp.singularity > 0) {
      p.timers.singularity = (p.timers.singularity || 20) - dt;
      if (p.timers.singularity <= 0) {
        p.timers.singularity = 20;
        var sd = s.atk * sp.singularity / 100;
        /* ★ 奇点要有"吸"的画面：一圈从大收缩到小的环，配合怪被拉过来 */
        APOC.UIEffects.ring(p.x, p.y - 60, '#7c3aed', 260, 10, 0.55);
        APOC.UIEffects.ring(p.x, p.y - 60, '#c4b5fd', 180, 6, 0.4);
        /* 奇点贴图：最大的那张黑洞向心旋涡，从大收到小 + 反方向旋转 = "在吸" */
        APOC.UIEffects.vfx('ult_singularity', p.x, p.y - 60, {
          size: C.FX_SIZE.ult_singularity, ttl: 0.62,
          s0: 1.15, s1: 0.50, a0: 1, a1: 0, rot0: 0, rot1: -1.2
        });
        APOC.UIEffects.shake(7, 0.3);
        for (var k = 0; k < st.enemies.length; k++) {
          var ek = st.enemies[k];
          if (ek.hp <= 0) continue;
          if (Math.abs(ek.x - p.x) <= 250) {
            ek.x += Math.sign(p.x - ek.x) * 40;
            var dv = Math.round(sd * 0.5);
            ek.hp -= dv; ek.hitFlash = 0.15;
            floatText(ek.x, ek.y - ek.size * 2, dv, false);
            if (ek.hp <= 0) killEnemy(ek, st.stage);
          }
        }
        APOC.UIEffects.shake(6, 0.15);
      }
    }
  }

  function updatePlayer(dt, s) {
    var p = st.player;
    var w = APOC.Tech.currentWeapon();
    var range = w ? F.weaponRange(w) * (1 + (s.rangePct || 0) / 100) : 100;

    /* 找最近目标 */
    var target = null, bestD = Infinity;
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.hp <= 0) continue;
      var d = Math.abs(e.x - p.x);
      if (d < bestD) { bestD = d; target = e; }
    }

    /* ★ 主角钉死在站位上，完全不横移。
       过肩视角里"人物左右滑动去对准最近的怪"看起来就是在抽搐 ——
       加了死区和限速也只是"抽搐得慢一点"，治不了根。
       改成一件事：她一直在往前走（bobPhase 匀速推进），瞄准交给走廊纵深，
       横向位移一点都不做。配合怪物不断压过来，"往前探索"的感觉才出得来。 */
    p.x = C.PLAYER_X0;
    p.y = C.NEAR_Y;
    p.bobPhase = (p.bobPhase || 0) + C.PLAYER_WALK_RATE * dt;
    p.bobAmp = 1;      // 一直在走，没有起步/停步的过渡
    p.walk = 1;

    /* 动画计时 */
    p.anim += dt;
    if (p.lunge > 0) p.lunge = Math.max(0, p.lunge - dt * 5);
    if (p.walk) p.bobPhase = (p.bobPhase || 0) + s.spd * dt * 0.055;
    p.bobAmp = (p.bobAmp || 0) + ((p.walk ? 1 : 0) - (p.bobAmp || 0)) * Math.min(1, dt * 7);

    /* 攻击 */
    p.atkCd -= dt;
    if (p.atkCd <= 0 && target && bestD <= range) {
      var interval = 1 / s.aspd;
      /* 双重射击 / 弹幕风暴：概率让本次攻击次数翻倍（不改变伤害） */
      var reps = 1;
      if (s.special.doubleShot && R.chance(s.special.doubleShot / 100)) reps++;
      if (s.special.barrage && R.chance(s.special.barrage / 100)) reps++;
      for (var r = 0; r < reps; r++) attack('player');
      p.lunge = 1;

      /* 毁灭之力：攻击计数 */
      if (s.special.shockwave) {
        p.timers.swCount = (p.timers.swCount || 0) + 1;
        if (p.timers.swCount >= 5) {
          p.timers.swCount = 0;
          splashAt(p.x, p.y, s.atk * s.special.shockwave / 100, 160, null);
          /* 毁灭之力：以玩家为圆心炸开的大冲击波（splashAt 还会在落点再铺一圈小的） */
          APOC.UIEffects.vfx('ult_shockwave', p.x, p.y, {
            size: C.FX_SIZE.ult_shockwave, ttl: 0.50,
            s0: 0.45, s1: 1.25, a0: 0.9, a1: 0
          });
          APOC.UIEffects.shake(3, 0.1);
        }
      }
      p.atkCd = interval;
    }

    /* 回血/护盾重生 */
    if (p.shield <= 0 && s.special.shield > 0 && p.shieldCd <= 0) {
      p.shield = p.maxHp * s.special.shield / 100;
      p.shieldCd = 12;
    }
  }

  function updateEnemy(e, dt, s) {
    var p = st.player;
    if (e.hp <= 0) return;
    e.anim += dt;
    /* 僵直：挨打这段时间不移动、不攻击，是"打中了"最直接的反馈 */
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.spawnFade < 1) e.spawnFade = Math.min(1, e.spawnFade + dt * 2.2);
      return;
    }
    if (e.stunCd > 0) e.stunCd -= dt;      // 霸体窗口递减
    if (e.spawnFade < 1) e.spawnFade = Math.min(1, e.spawnFade + dt * 2.2);
    if (e.lunge > 0) e.lunge = Math.max(0, e.lunge - dt * 5);
    /* 步频由「实际行走」驱动：不走路就不迈步，走得快就迈得快。
       固定频率的正弦起伏会让所有怪都在原地同频抖动，看着像僵尸。 */
    if (e.walk && e.freeze <= 0 && e.knock <= 0) e.bobPhase += e.spd * dt * 0.085;
    /* 步态幅度用插值过渡，绝不能在"走路/待机"之间硬切 —— 
       walk 会随距离抖动，硬切会让贴图每帧跳好几像素 */
    e.bobAmp = (e.bobAmp || 0) + ((e.walk && e.freeze <= 0 ? 1 : 0) - (e.bobAmp || 0)) * Math.min(1, dt * 7);
    if (e.freezeCd > 0) e.freezeCd -= dt;      // 冻结免疫窗口递减
    if (e.freeze > 0) { e.freeze -= dt; return; }

    if (e.knock > 0) {
      var kx = e.x - p.x, ky = e.y - p.y;
      var kl = Math.sqrt(kx * kx + ky * ky) || 1;
      e.x += kx / kl * 60 * dt;
      e.y += ky / kl * 60 * dt;
      e.knock -= dt;
      e.x = Math.max(30, Math.min(C.VIEW_W - 30, e.x));
      clampToFloor(e);
      return;
    }

    /* ---- 宝箱怪：不攻击，只躲 ----
       ★ 关键约束：玩家是固定站位、不会追的，所以宝箱怪不能往远处跑，
       否则超出射程就永远打不到，彩蛋变成摆设。
       解法是让它**始终停在玩家射程的 70% 处**绕圈：够得着，但一直在动。 */
    if (e.variant === 'mimic') {
      e.life -= dt;
      if (e.life <= 0) {          // 超时溜走
        e.escaped = true;
        e.hp = 0;
        st.floats.push({ x: e.x, y: e.y - 40, text: '溜走了…', color: '#9a9187', size: 16, t: 1.0, ttl: 1.0 });
        APOC.Bus.emit('mimic:escape', { stage: st.stage });
        APOC.Bus.emit('toast', { type: 'warn', text: '宝箱怪溜走了' });
        return;
      }
      var w = APOC.Tech.currentWeapon();
      var rng = w ? F.weaponRange(w) : 300;
      /* ★ 冲刺节奏：大部分时间待在射程外（打不到），每隔几秒冲进来 1.2 秒。
         这才是"追"的感觉 —— 原来一直待在射程 70% 处，等于站着挨打，
         实测 2.6 秒就被秒了，逃走机制形同虚设。 */
      if (e.dashCd === undefined) { e.dashCd = 1.2; e.dashT = 0; }
      e.dashCd -= dt;
      if (e.dashCd <= 0 && e.dashT <= 0) { e.dashT = 1.2; e.dashCd = 3.2; }
      if (e.dashT > 0) e.dashT -= dt;
      /* ★ 游走距离必须大于射程本身。
         原来取 1.06 倍，但绕圈判定有 ±15% 的带宽，实际会停在 0.90 倍射程处 ——
         也就是一直在射程内被打，冲刺机制形同虚设。现在取 1.25 倍，
         带宽下限 1.06 倍，保证"不冲刺时就是打不到"。 */
      var want = Math.max(90, rng * (e.dashT > 0 ? 0.55 : 1.25));
      var ddx = e.x - p.x, ddy = e.y - p.y;
      var dd2 = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      var vx, vy;
      if (dd2 < want * 0.85) { vx = ddx / dd2; vy = ddy / dd2; }        // 太近 → 退开
      else if (dd2 > want * 1.05) { vx = -ddx / dd2; vy = -ddy / dd2; }  // 太远 → 靠近
      else {                                                             // 距离合适 → 横向绕圈
        vx = -ddy / dd2; vy = ddx / dd2;
        if (e.orbitDir === undefined) e.orbitDir = R.chance(0.5) ? 1 : -1;
        vx *= e.orbitDir; vy *= e.orbitDir;
      }
      e.x += vx * e.spd * dt;
      e.y += vy * e.spd * dt;
      /* 夹在场地内，别跑出画面 */
      e.x = Math.max(50, Math.min(C.VIEW_W - 50, e.x));
      e.y = Math.max(C.FAR_Y - 40, Math.min(C.NEAR_Y - 60, e.y));
      e.walk = 1;
      e.bobPhase += e.spd * dt * 0.085;
      e.bobAmp = (e.bobAmp || 0) + (1 - (e.bobAmp || 0)) * Math.min(1, dt * 7);
      return;
    }

    /* ★ 怪的散开宽度必须跟着主角射程走。
       主角是固定在 PLAYER_X0 不动的，如果怪一律聚到走廊中线（离主角 200~300px），
       拿近战武器（射程 60×1.7=102）就永远够不到 —— 波次卡死，永远清不掉。
       手枪射程 544 能覆盖全场，所以这个 bug 只在体术线上暴露。
       spread 取「地面半宽」和「射程的一半」的较小值，下限 90 保证不至于全挤成一坨。 */
    var wNow = APOC.Tech.currentWeapon();
    var reach = wNow ? F.weaponRange(wNow) : 300;
    var spread = Math.min(floorHalf(p.y), Math.max(90, reach * 0.5));
    var toP = Math.sqrt((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y)); // 到「玩家」的距离
    var stopAt = e.isRanged ? e.range * 0.8 : e.range * 0.85;

    /* ★ 落点必须夹进**怪自己的攻击范围**里。
       原来落点是 `p.x + xOffset × spread`，spread 最大 300px、xOffset 最大 0.95 ——
       于是有怪的落点离玩家 285px，而它自己的攻击距离只有 42px：
       走到落点就站住，**永远够不着玩家、永远不攻击**。
       表现是"怪明明冲过来了，玩家却全程满血"（实测 K16/K32/K99 贴脸帧数为 0）。
       散开是为了别挤成一坨，但再散也不能散到自己打不到的地步。 */
    var maxOff = Math.max(10, stopAt - 8);
    var off = (e.xOffset || 0) * spread;
    if (off > maxOff) off = maxOff; else if (off < -maxOff) off = -maxOff;
    var goalX = p.x + off, goalY = p.y;
    var gdx = goalX - e.x, gdy = goalY - e.y;
    var gd = Math.sqrt(gdx * gdx + gdy * gdy);

    if (toP > stopAt && gd > 0.001) {
      e.x += gdx / gd * e.spd * dt;
      e.y += gdy / gd * e.spd * dt;
      e.walk = 1;
      clampToFloor(e);
    } else {
      e.walk = 0;
    }

    e.atkCd -= dt;
    var toPlayer = Math.sqrt((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y));
    if (e.atkCd <= 0 && toPlayer <= e.range) {
      e.atkCd = e.atkInterval;
      e.lunge = 1;
      var res = F.hit(
        { atk: e.atk, coef: 1, crit: 5, critDmg: 150, dmgUp: 0,
          pen: 0, penPct: 0, level: st.stage, dmgMul: 1 },
        { def: s.def, dmgReduce: s.dmgReduce, dodge: s.dodge, isPlayer: true }
      );
      /* ★ 远程怪要画一条**朝向玩家**的弹道。
         没有它的话，怪站在 200px 外，玩家只看到自己凭空掉血，完全不知道谁在打自己。
         近战怪不画（它就在你脸上，画线反而乱）。 */
      if (e.isRanged) {
        st.tracers.push({
          x1: e.x, y1: e.y - e.size * 1.6,
          x2: p.x, y2: p.y - 52,
          line: 'mon', behavior: 'single', hostile: true,
          t: 0.14, ttl: 0.14
        });
      }
      /* 怪物出手的音效：优先这只怪自己的（mob_<怪物id>.wav），
         没有就退回按体型的合成音（体型越大越沉） */
      APOC.Audio.playMonster(e.mid, 'attack',
        e.tier === 'normal' ? 'mon_attack_small' : 'mon_attack_big', { gap: 0.09 });
      /* ★ 自适应难度（攻击侧）的信号：这一帧怪还贴着玩家
         → 在 tick 里累加 contactSec，连续够 10 秒还没被清掉就翻攻击。见 Config.WAVE_ADAPT。
         （血量侧的信号是"有没有被一枪打死"，记在 killEnemy 里，和这里无关。） */
      st.contactedThisTick = true;
      if (res.dodged) {
        APOC.Audio.play('dodge', { gap: 0.1 });
        st.floats.push({ x: p.x, y: p.y - 70, text: '闪避', color: '#9a9187', size: 14, t: 0.8, ttl: 0.8 });
      } else {
        var dmg = res.value;
        /* 精神护盾先吃伤害 */
        if (p.shield > 0) {
          var absorbed = Math.min(p.shield, dmg);
          p.shield -= absorbed;
          dmg -= absorbed;
        }
        p.hp -= dmg;
        p.hitFlash = 0.15;
        APOC.Audio.play('hurt', { gap: 0.18 });
        st.floats.push({
          x: p.x, y: p.y - 70, text: '-' + Math.round(dmg),
          color: '#ef4444', size: 15, t: 0.8, ttl: 0.8
        });
        /* 荆棘 / 反击 */
        var reflect = (s.special.thornsPct ? s.def : 0) + (s.special.thorns ? s.def * s.special.thorns / 100 : 0);
        if (reflect > 0) {
          e.hp -= reflect;
          e.hitFlash = 0.15;
          /* ★ 反伤要让玩家看见"是怪打我，它自己也在掉血" */
          APOC.UIEffects.ring(e.x, e.y - e.size * 1.2, '#f87171', 6, 34, 0.22);
          APOC.UIEffects.spark(e.x, e.y - e.size * 1.2, '#fca5a5', 4, 1.1);
          floatText(e.x, e.y - e.size * 2, Math.round(reflect), false);
          if (e.hp <= 0) killEnemy(e, st.stage);
        }
        /* 不动如山：单次伤害超过最大生命 20% 时减半 */
        if (APOC.Tech.nodeLevel('body_6a') > 0 && dmg > p.maxHp * 0.2) {
          p.hp += dmg * 0.5;
        }
      }
    }

    /* Boss 阶段技能（普通关只有精英，Boss 在割草关） */
    if (e.tier === 'boss' && !e.phaseTriggered && e.hp < e.maxHp * 0.5) {
      e.phaseTriggered = true;
      triggerBossPhase(e, s);
    }
  }

  function triggerBossPhase(e, s) {
    if (e.phaseSkill === 'summon' || e.phaseSkill === 'army') {
      /* ★ 召唤必须受同屏上限约束。原来直接 push 4/8 只绕过闸门，
         实测同屏峰值会冲到 21 —— 「同屏上限 20」就不成立了。 */
      var n = e.phaseSkill === 'army' ? 8 : 4;
      n = Math.min(n, Math.max(0, st.maxAlive - aliveForCap()));
      var scene = APOC.Data.sceneOfStage(st.stage);
      var normals = APOC.Data.normalsOfScene(scene.id);
      for (var i = 0; i < n; i++) {
        var ne = makeEnemy(R.pick(normals).id, st.stage);
        ne.x = e.x + R.range(-160, 160);
        st.enemies.push(ne);
      }
      APOC.Bus.emit('toast', { type: 'warn', text: e.name + ' 进入了狂暴状态：' + (e.phaseText || '') });
    } else if (e.phaseSkill === 'heal' || e.phaseSkill === 'regen') {
      e.healRate = 0.08;
      APOC.Bus.emit('toast', { type: 'warn', text: e.name + ' 开始自我修复！' });
    } else {
      APOC.Bus.emit('toast', { type: 'warn', text: e.name + ' 进入了二阶段：' + (e.phaseText || '') });
    }
  }

  function updateWaveFlow(dt) {
    if (st.phase === 'spawning') return;

    var alive = 0;
    for (var i = 0; i < st.enemies.length; i++) if (st.enemies[i].hp > 0) alive++;

    if (st.phase === 'fighting') {
      if (alive === 0 && st.spawnQueue.length === 0) {
        st.phase = 'clearing';
        st.clearDelay = 1.2;
        /* ★ 自适应难度（血量侧）：**这一波被秒杀** → 下一波血量翻倍。
           "被秒杀"= 本波每一只怪都挨一枪就死（waveOneShot，见 blankState 的说明）。
           ★ 只有末波带精英（精英血厚，几乎必然挨第二下），所以精英不会污染这个判据。
           ★ 这里**只翻血、不翻攻击**：血量翻倍的目的是把怪送到玩家面前，
             攻击另有 contactSec 那条线单独管。 */
        if (st.waveOneShot && st.waveIndex < st.waves.length - 1) {
          var nx = Math.min(C.WAVE_ADAPT.hpCap, st.waveHpMul * C.WAVE_ADAPT.hpStep);
          if (nx > st.waveHpMul) {
            st.waveHpMul = nx;
            APOC.Bus.emit('toast', { type: 'warn',
              text: '☠ 怪适应了你的打法：下一波血量 ×' + nx });
          }
        }
        st.contactSec = 0;               // 换波，接触计时归零
        /* 波次间回血：否则三波下来伤害累积必死 */
        var heal = st.player.maxHp * C.WAVE_CLEAR_HEAL;
        st.player.hp = Math.min(st.player.maxHp, st.player.hp + heal);
        if (heal >= 1) {
          st.floats.push({ x: st.player.x, y: st.player.y - 80,
                           text: '+' + Math.round(heal), color: '#4ade80',
                           size: 16, t: 1.0, ttl: 1.0 });
        }
      }
      return;
    }

    if (st.phase === 'clearing') {
      st.clearDelay -= dt;
      if (st.clearDelay > 0) return;

      if (st.waveIndex < st.waves.length - 1) {
        st.waveIndex++;
        startWave(st.waveIndex);
      } else {
        onStageClear();
      }
    }
  }

  function startWave(idx) {
    var w = st.waves[idx];
    /* 第 2 波放宝箱怪（玩家已经打顺手了，来点意外）。
       ★ 用 WAVE_WITH_MIMIC 而不是写死 idx===1 —— 改波数时写死的值会让这个稀有事件
       静默消失，而且没有任何测试能抓到。 */
    if (idx === WAVE_WITH_MIMIC && st.mimicLeft > 0) {
      st.mimicLeft--;
      var mm = makeMimic();
      st.enemies.push(mm);
      APOC.Bus.emit('toast', { type: 'warn', text: '💰 宝箱怪出现了，' + C.MIMIC_LIFETIME + ' 秒内追上它！' });
      APOC.Audio.play('drop_epic', { gap: 0.3 });
    }
    /* 第 3 波放游荡 Boss（同样走常量，理由见上） */
    if (idx === WAVE_WITH_WANDER && st.wanderBossPending) {
      st.wanderBossPending = false;
      var wb = makeWanderBoss();
      if (wb) {
        st.enemies.push(wb);
        st.wanderBoss = wb;
        APOC.UIEffects.shake(12, 0.5);
        APOC.Audio.play('boss_appear', { gap: 0 });
        APOC.Bus.emit('toast', { type: 'danger', text: '☠ ' + wb.name + ' 拦住了去路！' });
      }
    }
    st.spawnQueue = w.list.slice();
    st.spawnGroup = w.group || C.SPAWN_GROUP;
    st.wavePower = (w.power === undefined) ? 1 : w.power;
    st.spawnInterval = w.interval;
    st.maxAlive = w.maxAlive || C.MAX_ALIVE;
    st.spawnTimer = 0;
    st.waveOneShot = true;             // 本波是否"被秒杀"（自适应难度·血量侧的信号）
    st.contactSec = 0;                 // 本波接触累计秒数（自适应难度·攻击侧）
    st.contactedThisTick = false;
    st.phase = 'spawning';
    APOC.Bus.emit('wave', { wave: idx + 1, total: st.waves.length });
  }

  function countAlive() {
    var n = 0;
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.hp <= 0) continue;
      /* 宝箱怪不算 —— 它是限时彩蛋，不能挡住波次推进 */
      if (e.variant === 'mimic') continue;
      n++;
    }
    return n;
  }

  /* ★ 同屏实体数（**含**宝箱怪）—— 只管"同屏上限 20"这道闸门。
     和 countAlive() 的分工：宝箱怪不参与波次推进（它限时 15 秒自己会走），
     但它确实占着屏幕，所以算上限时必须带上它。 */
  function aliveForCap() {
    var n = 0;
    for (var i = 0; i < st.enemies.length; i++) if (st.enemies[i].hp > 0) n++;
    return n;
  }

  function spawnEnemy(monsterId) {
    var e = makeEnemy(monsterId, st.stage);
    /* 变异精英：小怪出生时小概率变异。是额外惊喜，不占波次编成的精英名额。
       ★ 普通关按**本关怪数**反比掷骰（每关定额 ELITES_PER_STAGE 只），
       否则怪数从 20 涨到 70 会让每关变异精英从 1.6 只变成 5.6 只，
       而每只变异精英额外送 matQty×3 材料 + 必掉一件装备。割草关维持原概率。 */
    var eliteChance = (st.mode === 'arena')
      ? C.ELITE_CHANCE
      : C.ELITES_PER_STAGE / Math.max(1, APOC.Difficulty.countOf(st.stage));
    if (e.tier === 'normal' && R.chance(eliteChance)) applyElite(e);
    /* ★ 自适应难度倍率放在变异/精英之后 —— 它是整波的统一缩放，
       要和已经生效的变异一起乘，否则变异精英会在高倍波里反而变弱。
       ★ 血量和攻击分开乘（两根独立的棘轮，见 Config.WAVE_ADAPT）。
       ★ 只乘 hp / atk，**不乘 exp / gold**：每关产出总量由 stageYield 守恒，
         跟着翻会掀翻整条经济。 */
    var scale = (st.wavePower === undefined ? 1 : st.wavePower);
    if (st.waveHpMul !== 1 || scale !== 1) {
      e.maxHp = Math.max(1, Math.round(e.maxHp * st.waveHpMul * scale));
      e.hp = e.maxHp;
    }
    if (st.waveAtkMul !== 1 || scale !== 1) e.atk *= st.waveAtkMul * scale;
    st.enemies.push(e);
    if (e.variant === 'elite') {
      APOC.Bus.emit('toast', { type: 'warn', text: '★ ' + e.name + ' 发生了变异！' });
      APOC.Audio.play('drop_rare', { gap: 0.2 });
    }
    return e;
  }

  /* 变异精英：加血加攻加体型，奖励也翻倍 */
  function applyElite(e) {
    e.variant = 'elite';
    e.name = '变异·' + e.name;
    e.hp = e.maxHp = Math.round(e.hp * C.ELITE_HP);
    e.atk *= C.ELITE_ATK;
    e.size *= C.ELITE_SIZE;
    e.exp = Math.round(e.exp * C.ELITE_EXP);
    e.color = '#fbbf24';
    e.wander = false;
  }

  /* 宝箱怪：血少跑得快，会躲着玩家，限时逃走 —— 追到就是一笔横财 */
  function makeMimic() {
    var scene = APOC.Data.sceneOfStage(st.stage);
    var base = APOC.Data.normalsOfScene(scene.id)[0];
    var e = makeEnemy(base.id, st.stage);
    var m = APOC.Data.Monsters[base.id];
    e.variant = 'mimic';
    e.name = '宝箱怪';
    e.hp = e.maxHp = Math.max(20, Math.round(e.hp * C.MIMIC_HP_MUL));
    e.dodge = C.MIMIC_DODGE;
    e.spd = m.spd * C.MIMIC_SPEED_MUL;
    e.size = Math.max(20, m.size * 1.2);
    e.color = '#fbbf24';
    e.emoji = '💰';
    e.life = C.MIMIC_LIFETIME;
    e.x = R.range(C.LANE_X - 120, C.LANE_X + 120);
    e.y = C.FAR_Y + 40;
    e.spawnFade = 0;
    return e;
  }

  /* 游荡 Boss：把下一档的 Boss 拉过来，血量砍半，出场有演出 */
  function makeWanderBoss() {
    var K = Math.min(C.MAX_STAGE, st.stage + 10);
    var boss = APOC.Data.bossOfStage(K);
    if (!boss) return null;
    var e = makeEnemy(boss.id, st.stage);      // 用当前关卡等级算属性，不用 K
    var base = F.monBase(st.stage, boss);
    e.variant = 'wanderBoss';
    e.tier = 'boss';
    e.name = '游荡·' + boss.name;
    e.hp = e.maxHp = Math.round(base.hp * C.WANDER_BOSS_HP_MUL);
    e.atk = base.atk * C.WANDER_BOSS_ATK_MUL;
    e.def = base.def;
    e.exp = Math.round(base.exp * 8);
    e.x = C.LANE_X;
    e.y = C.FAR_Y;
    e.spawnFade = 0;
    return e;
  }

  function onStageClear() {
    var D = APOC.State.data;
    var K = st.stage;

    /* 通关记录 */
    if (!D.progress.cleared[K] || st.elapsed < D.progress.cleared[K]) {
      D.progress.cleared[K] = Math.round(st.elapsed * 1000);
    }
    if (K + 1 <= C.MAX_STAGE && D.progress.maxStage < K + 1) {
      D.progress.maxStage = K + 1;
    }

    /* 装备掉落 */
    var itemN = C.ITEM_PER_STAGE;
    var got = [];
    for (var i = 0; i < itemN; i++) {
      var it = APOC.Inventory.rollDrop(K, false);
      if (it) { got.push(it); APOC.Inventory.addItem(it); }
    }

    st.phase = 'done';
    st.active = false;
    st.result = 'clear';
    APOC.Bus.emit('stage:clear', { stage: K, timeMs: st.elapsed * 1000, items: got });
    APOC.State.markDirty();

    if (D.settings.autoNextStage && K < C.MAX_STAGE) {
      setTimeout(function () {
        if (APOC.State.data.progress.stage === K) APOC.enterStage(K + 1);
      }, 1500);
    }
  }

  function onPlayerDeath() {
    var D = APOC.State.data;
    D.stats.totalDeaths++;
    st.phase = 'dead';
    st.deathTimer = 3;
    APOC.Bus.emit('stage:fail', { stage: st.stage });
    APOC.Bus.emit('toast', { type: 'danger', text: '你倒下了，3 秒后重整旗鼓…' });
    APOC.State.markDirty();
  }

  function decayVisuals(dt) {
    var i;
    for (i = st.tracers.length - 1; i >= 0; i--) {
      st.tracers[i].t -= dt;
      if (st.tracers[i].t <= 0) st.tracers.splice(i, 1);
    }
    for (i = st.floats.length - 1; i >= 0; i--) {
      st.floats[i].t -= dt;
      st.floats[i].y -= 45 * dt;
      if (st.floats[i].t <= 0) st.floats.splice(i, 1);
    }
    if (st.player) {
      if (st.player.hitFlash > 0) st.player.hitFlash -= dt * 1.2;   // 0.15 能撑约 0.12 秒
      if (st.player.atkFx > 0) st.player.atkFx -= dt;
    }
    for (i = 0; i < st.enemies.length; i++) {
      if (st.enemies[i].hitFlash > 0) st.enemies[i].hitFlash -= dt * 1.2;
    }
  }

  /* 死亡 → 3 秒后重开本关 */
  /* 顿帧：把逻辑短暂冻结（渲染照常），是"打击感"里最便宜也最有效的一招 */
  function hitStop(sec) {
    if (!st) return;
    if (!st.hitStop || st.hitStop < sec) st.hitStop = sec;
  }

  function handleDeath(dt) {
    st.deathTimer -= dt;
    if (st.deathTimer <= 0) {
      var K = st.stage;
      APOC.Combat.enter(K);
    }
  }

  /* ---------------- 对外 ---------------- */
  function blankState(K, waves) {
    return {
      active: true, stage: K, waves: waves || [],
      waveIndex: 0, spawnQueue: [], spawnInterval: 0.8, spawnGroup: 1, spawnTimer: 0,
      enemies: [], tracers: [], floats: [],
      player: makePlayer(),
      phase: 'idle', clearDelay: 0, elapsed: 0, deathTimer: 0, result: null, hitStop: 0,
      mimicLeft: 0, wanderBossPending: false, wanderBoss: null,
      /* ★ 自适应难度（每关由 blankState 重置回 1）。
         血量和攻击是**两根独立的棘轮**：血量由"这波够不够得到人"驱动，
         攻击由"够到人之后撑了多久没被清掉"驱动。见 Config.WAVE_ADAPT。 */
      waveHpMul: 1, waveAtkMul: 1, wavePower: 1,
      /* 本波是不是"被秒杀"——判据是**每只怪都挨一枪就死**，
         不是"有没有怪够到玩家"（用户实测纠正：怪打到他了还在翻倍）。
         只要有一只怪挨了第二下，本波就不算被秒杀。 */
      waveOneShot: true,
      contactSec: 0,             // 本波怪够到玩家的累计秒数（翻攻击的信号）
      contactedThisTick: false
    };
  }

  APOC.Combat = {
    get state() { return st; },
    isActive: function () { return !!(st && st.active && st.mode !== 'arena'); },

    enter: function (stage) {
      var K = stage;
      st = blankState(K, buildWaves(K));
      st.mode = 'combat';
      APOC.State.data.progress.stage = K;
      /* 本关的稀有事件掷骰（进关就定下来，避免每波都重掷导致感觉随机） */
      st.mimicLeft = R.chance(C.MIMIC_CHANCE) ? 1 : 0;
      st.wanderBossPending = R.chance(C.WANDER_BOSS_CHANCE);
      startWave(0);
      APOC.Bus.emit('stage:enter', { stage: K });
      return st;
    },

    exit: function () {
      if (st) st.active = false;
      st = null;
    },

    /* Arena 接管战场：把它的状态对象交给同一套 helper 使用 */
    adopt: function (arenaState) { st = arenaState; },
    release: function () { st = null; },
    makePlayer: makePlayer,
    blankState: blankState,

    tick: function (dt) {
      if (!st || !st.active) return;
      /* 顿帧：逻辑冻结但视觉时长照走（飘字/粒子靠 decayVisuals 推进） */
      if (st.hitStop > 0) {
        st.hitStop -= dt;
        decayVisuals(dt);
        return;
      }
      st.elapsed += dt;
      if (st.phase === 'dead') { handleDeath(dt); return; }
      tick(dt);
    }
  };

  /* 供 Arena 复用的战斗工具（都作用于当前战场 st） */
  APOC.CombatUtil = {
    makeEnemy: makeEnemy,
    resolveTargets: resolveTargets,
    decayVisuals: decayVisuals,
    attack: function (actor) { attack(actor); },
    updateEnemy: function (e, dt, s) { updateEnemy(e, dt, s); },
    tickPlayerEffects: function (dt, s) { tickPlayerEffects(dt, s); },
    floatText: floatText,
    killEnemy: killEnemy,
    gainExp: gainExp,
    healPlayer: healPlayer,
    splashAt: splashAt,
    get state() { return st; }
  };
})(window.APOC = window.APOC || {});
