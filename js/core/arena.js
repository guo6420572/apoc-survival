/* arena.js — 割草关（每场景第 10 关 + K95）：俯视竞技场 + 三选一 Roguelike 强化 */
(function (APOC) {
  'use strict';

  var C = APOC.Config, F = APOC.Formula, R = APOC.RNG, B = C.ARENA_BOUND;

  var a = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  /* 与 combat 一致：走廊地面是梯形，单位不能站在墙上 */
  function _floorHalf(y) {
    var t = (y - C.FAR_Y) / (C.NEAR_Y - C.FAR_Y);
    t = Math.max(0, Math.min(1.25, t));
    return C.FLOOR_HALF_FAR + (C.FLOOR_HALF_NEAR - C.FLOOR_HALF_FAR) * t;
  }
  function clampToFloor(o) {
    var hw = _floorHalf(o.y), lo = C.LANE_X - hw, hi = C.LANE_X + hw;
    if (o.x < lo) o.x = lo; else if (o.x > hi) o.x = hi;
  }
  function dist(p, q) {
    var dx = p.x - q.x, dy = (p.y || 0) - (q.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ---------------- 进入 ---------------- */
  function enter(K) {
    var st = APOC.Combat.blankState(K, []);
    st.mode = 'arena';
    /* ★ 出生点必须在**场地中央偏下**，不能是角上。
       原来写的是 (640, 400)，而场地范围是 x:60~660, y:240~1180 ——
       那正好是**右上角**：主角一进割草关就缩在角落里，蠢得要死。
       而且玩家只会朝最近的怪走，附近没怪时就一直待在原地，
       所以出生点在哪，开局就待在哪。 */
    st.player.x = (C.ARENA_BOUND.x0 + C.ARENA_BOUND.x1) / 2;
    st.player.y = C.ARENA_BOUND.y1 - 120;

    st.phase = 'survive';
    st.remain = (K === 100) ? C.ARENA_DURATION_FINAL : C.ARENA_DURATION;
    st.perkTimer = C.ARENA_PERK_INTERVAL;
    st.perkCount = 0;
    st.stacks = {};
    st.growingAcc = 0;
    st.spawnInterval = C.ARENA_SPAWN_START;
    st.spawnTimer = 0.5;
    st.rampTimer = 0;
    st.bossSpawned = false;
    st.pendingPerk = null;
    st.immortalUsed = false;
    st.killCount = 0;

    a = st;
    APOC.Combat.adopt(st);
    APOC.State.data.progress.stage = K;
    APOC.Bus.emit('arena:enter', { stage: K, duration: st.remain });
    return st;
  }

  function exit() {
    if (a) a.active = false;
    a = null;
    APOC.Combat.release();
  }

  /* ---------------- 词条 ---------------- */
  function collectPerkStats() {
    if (!a || !a.stacks) return [];
    var out = [];
    Object.keys(a.stacks).forEach(function (id) {
      var n = a.stacks[id];
      var p = APOC.Data.PerkById[id];
      if (!p || !n) return;
      if (p.stat === 'growing' || p.stat === 'immortal') return;
      if (p.stat === 'trueDamage') { out.push({ stat: 'trueDamage', value: 1 }); return; }
      if (p.stat === 'dmgMul') { out.push({ stat: 'dmgMul', value: Math.pow(p.value, n) }); return; }
      out.push({ stat: p.stat, value: p.value * n });
      if (p.extra) {
        Object.keys(p.extra).forEach(function (k) { out.push({ stat: k, value: p.extra[k] * n }); });
      }
    });
    /* 成长：每次击杀永久累加 */
    if (a.growingAcc) out.push({ stat: 'atkPct', value: a.growingAcc });
    return out;
  }

  function rollPerkChoices() {
    a.pendingPerk = {
      options: APOC.Data.rollPerks(C.ARENA_PERK_CHOICES),
      remain: C.ARENA_PERK_TIMEOUT,
      autoDelay: C.ARENA_PERK_AUTO_DELAY
    };
    APOC.Bus.emit('arena:perk', {
      options: a.pendingPerk.options,
      seconds: C.ARENA_PERK_TIMEOUT
    });
  }

  function choosePerk(perkId) {
    if (!a || !a.pendingPerk) return false;
    var opt = null;
    for (var i = 0; i < a.pendingPerk.options.length; i++) {
      if (a.pendingPerk.options[i].id === perkId) { opt = a.pendingPerk.options[i]; break; }
    }
    if (!opt) return false;
    a.stacks[perkId] = (a.stacks[perkId] || 0) + 1;
    a.pendingPerk = null;
    a.perkCount++;
    APOC.Stats.markDirty();
    APOC.Bus.emit('arena:perkChosen', { perk: opt });
    APOC.Bus.emit('toast', { type: 'success', text: '获得强化：' + opt.name });
    return true;
  }

  function onKill(e) {
    if (!a) return;
    a.killCount++;
    if (a.stacks.growing) a.growingAcc += 0.3 * a.stacks.growing;
    if (a.phase === 'boss' && a.boss && e === a.boss) {
      onVictory();
    }
  }

  /* ---------------- 刷怪 ---------------- */
  function spawnOne() {
    var scene = APOC.Data.sceneOfStage(a.stage);
    var normals = APOC.Data.normalsOfScene(scene.id);
    var elite = APOC.Data.eliteOfScene(scene.id);

    /* 进度超过 60% 后开始混入精英 */
    var elapsedRatio = 1 - a.remain / ((a.stage === 100) ? C.ARENA_DURATION_FINAL : C.ARENA_DURATION);
    var m = (elite && elapsedRatio > 0.6 && R.chance(0.12)) ? elite : R.pick(normals);

    var e = APOC.CombatUtil.makeEnemy(m.id, a.stage);
    e.stun = 0; e.stunCd = 0;
    e.hp = e.maxHp = Math.max(1, Math.round(e.hp * C.ARENA_MON_HP_MUL));
    e.atk *= C.ARENA_MON_ATK_MUL;
    e.spawnFade = 1;      // 割草关从边缘进场，不淡入
    var edge = R.int(0, 3);
    clampToFloor(e);
    if (edge === 0)      { e.x = R.range(B.x0, B.x1); e.y = B.y0 - 40; }
    else if (edge === 1) { e.x = R.range(B.x0, B.x1); e.y = B.y1 + 40; }
    else if (edge === 2) { e.x = B.x0 - 40; e.y = R.range(B.y0, B.y1); }
    else                 { e.x = B.x1 + 40; e.y = R.range(B.y0, B.y1); }
    a.enemies.push(e);
  }

  function spawnBoss() {
    var boss = APOC.Data.bossOfStage(a.stage);
    if (!boss) return;
    var base = F.monBase(a.stage, boss, APOC.Difficulty.IDENT);   // 割草关不走按关难度表
    var e = {
      eid: -1, mid: boss.id, name: boss.name, tier: 'boss',
      x: 640, y: B.y0 - 60,
      hp: Math.round(base.hp * C.ARENA_BOSS_HP_MUL),
      maxHp: Math.round(base.hp * C.ARENA_BOSS_HP_MUL),
      atk: base.atk * C.ARENA_MON_ATK_MUL, def: base.def,
      exp: base.exp * 5, gold: base.gold,
      spd: boss.spd, range: boss.range, atkInterval: boss.atkInterval,
      size: boss.size, color: boss.color, emoji: boss.emoji,
      behavior: 'boss', isRanged: boss.range > 150,
      atkCd: 2, hitFlash: 0, anim: 0, lunge: 0, walk: 0, dying: false, deathT: 0, spawnFade: 1,
      burn: null, bleed: null, freeze: 0,
      phaseSkill: boss.phaseSkill, phaseText: boss.phaseText, phaseTriggered: false,
      knock: 0, skillCd: 10
    };
    a.enemies.length = 0;          // Boss 登场清空小怪
    a.enemies.push(e);
    a.boss = e;
    a.phase = 'boss';
    APOC.UIEffects.shake(10, 0.4);
    APOC.Audio.play('boss_appear', { gap: 0 });
    APOC.Bus.emit('arena:boss', { monsterId: boss.id, name: boss.name });
    APOC.Bus.emit('toast', { type: 'danger', text: boss.name + ' 出现了！' });
  }

  /* ---------------- 每 tick ----------------
     注意：onVictory/onDefeat 只把 active 置 false，不立刻释放 a。
     因为结算发生在「击杀 → attack() → updatePlayer() → tick()」的调用链深处，
     立即置空会让同帧后续代码访问 null。真正的释放在下一次 tick 开头做。 */
  function tick(dt) {
    if (!a) return;
    if (!a.active) { a = null; APOC.Combat.release(); return; }

    var s = APOC.Stats.final();
    var p = a.player;

    /* 三选一弹窗期间：只走倒计时，战斗冻结 */
    if (a.pendingPerk) {
      var pk = a.pendingPerk;
      pk.remain -= dt;
      if (APOC.State.data.settings.autoArenaPick) {
        pk.autoDelay -= dt;
        if (pk.autoDelay <= 0) choosePerk(bestPerk(pk.options).id);
      } else if (pk.remain <= 0) {
        /* 超时也按品质兜底，不再无脑吃第一个 */
        choosePerk(bestPerk(pk.options).id);
      }
      APOC.CombatUtil.decayVisuals(dt);
      return;
    }

    a.elapsed += dt;
    APOC.CombatUtil.tickPlayerEffects(dt, s);

    /* 回复 */
    if (s.hpRegenPct > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * s.hpRegenPct / 100 * dt);
    }

    if (a.phase === 'survive') {
      /* 倒计时 */
      a.remain -= dt;
      /* 刷怪密度随时间提升 */
      a.rampTimer += dt;
      if (a.rampTimer >= 30) {
        a.rampTimer -= 30;
        a.spawnInterval = Math.max(C.ARENA_SPAWN_MIN, a.spawnInterval * (1 - C.ARENA_SPAWN_RAMP));
      }
      a.spawnTimer -= dt;
      /* ★ 同屏**不设上限**（用户定：割草关以人物死亡或任务结束为终止）。
         原来是 `a.enemies.length < C.ARENA_MAX_ENEMIES`（150）的硬闸，已撤。
         ⚠️ 那 150 道闸**顺带**在压产出，所以撤闸必须同时开 combat.js 的
         ARENA_KILL_CAP 产出封顶 —— 两件事要一起改，只改一边经济会被打穿。
         ⚠️ 屏幕上的怪现在只受击杀速度限制。渲染层有性能闸（docs/01：
         敌人 > 60 时只画精英和 Boss 的血条），但实机卡不卡要自己试。 */
      if (a.spawnTimer <= 0) {
        /* 成批刷：后期一次来一小群，才有"被围住然后清屏"的割草感 */
        var total0 = (a.stage === 100) ? C.ARENA_DURATION_FINAL : C.ARENA_DURATION;
        var ratio0 = 1 - a.remain / total0;
        var pick = 1 + Math.floor(ratio0 * (C.ARENA_SPAWN_BURST - 1));
        for (var bi = 0; bi < pick; bi++) spawnOne();
        a.spawnTimer = a.spawnInterval;
      }
      /* 强化三选一 */
      a.perkTimer -= dt;
      if (a.perkTimer <= 0) {
        a.perkTimer = C.ARENA_PERK_INTERVAL;
        rollPerkChoices();
        return;
      }
      /* 时间到 → Boss 登场 */
      if (a.remain <= 0) {
        a.remain = 0;
        spawnBoss();
      }
    }

    /* 玩家行动 */
    updatePlayer(dt, s);

    /* 敌人行动 */
    for (var i = 0; i < a.enemies.length; i++) updateEnemy(a.enemies[i], dt, s);

    /* DoT */
    for (i = 0; i < a.enemies.length; i++) {
      var e = a.enemies[i];
      if (e.hp <= 0) continue;
      if (e.burn) {
        e.hp -= e.burn.dps * dt; e.burn.t -= dt;
        if (e.burn.t <= 0) e.burn = null;
      }
      if (e.bleed) {
        e.hp -= e.bleed.dps * dt; e.bleed.t -= dt;
        if (e.bleed.t <= 0) e.bleed = null;
      }
      if (e.hp <= 0) APOC.CombatUtil.killEnemy(e, a.stage);
    }

    /* 死亡动画 → 清理（同 combat，别当场 splice） */
    for (i = a.enemies.length - 1; i >= 0; i--) {
      var dy = a.enemies[i];
      if (dy.hp > 0) continue;
      if (!dy.dying) {
        dy.dying = true; dy.deathT = 0.38;
        APOC.UIEffects.burst(dy.x, dy.y, dy.color, 7);
      }
      dy.deathT -= dt;
      if (dy.deathT <= 0) a.enemies.splice(i, 1);
    }

    APOC.CombatUtil.decayVisuals(dt);

    if (p.hp <= 0) onDefeat();
  }

  function updatePlayer(dt, s) {
    var p = a.player;
    var w = APOC.Tech.currentWeapon();
    var range = w ? F.weaponRange(w) * (1 + (s.rangePct || 0) / 100) : 100;

    /* 最近目标 */
    var near = null, nd = Infinity;
    for (var i = 0; i < a.enemies.length; i++) {
      var e = a.enemies[i];
      if (e.hp <= 0) continue;
      var d = dist(e, p);
      if (d < nd) { nd = d; near = e; }
    }

    /* 200px 内敌人的质心 → 退避 */
    var cx = 0, cy = 0, n = 0;
    for (i = 0; i < a.enemies.length; i++) {
      var en = a.enemies[i];
      if (en.hp <= 0) continue;
      if (dist(en, p) < 200) { cx += en.x; cy += en.y; n++; }
    }

    var vx = 0, vy = 0;
    if (n > 0) {
      cx /= n; cy /= n;
      if (dist({ x: cx, y: cy }, p) < 180) { vx = p.x - cx; vy = p.y - cy; }
    }
    if (vx === 0 && vy === 0 && near && nd > range * 0.85) {
      vx = near.x - p.x; vy = near.y - p.y;
    }
    var len = Math.sqrt(vx * vx + vy * vy);
    if (len > 1) {
      p.x += vx / len * s.spd * dt;
      p.y += vy / len * s.spd * dt;
    }
    p.x = clamp(p.x, B.x0, B.x1);
    p.y = clamp(p.y, B.y0, B.y1);

    /* 动画计时（割草关仍允许自由走位，所以步态跟着实际移动走） */
    p.anim += dt;
    if (p.lunge > 0) p.lunge = Math.max(0, p.lunge - dt * 5);
    if (p.walk) p.bobPhase = (p.bobPhase || 0) + s.spd * dt * 0.055;
    p.bobAmp = (p.bobAmp || 0) + ((p.walk ? 1 : 0) - (p.bobAmp || 0)) * Math.min(1, dt * 7);

    /* 攻击 */
    p.atkCd -= dt;
    if (p.atkCd <= 0 && near && nd <= range) {
      var reps = 1;
      if (s.special.doubleShot && R.chance(s.special.doubleShot / 100)) reps++;
      if (s.special.barrage && R.chance(s.special.barrage / 100)) reps++;
      for (var r = 0; r < reps; r++) APOC.CombatUtil.attack('player');
      p.lunge = 1;
      if (s.special.shockwave) {
        p.timers.swCount = (p.timers.swCount || 0) + 1;
        if (p.timers.swCount >= 5) {
          p.timers.swCount = 0;
          APOC.CombatUtil.splashAt(p.x, p.y, s.atk * s.special.shockwave / 100, 160, null);
          APOC.UIEffects.vfx('ult_shockwave', p.x, p.y, {
            size: C.FX_SIZE.ult_shockwave, ttl: 0.50,
            s0: 0.45, s1: 1.25, a0: 0.9, a1: 0
          });
        }
      }
      p.atkCd = 1 / s.aspd;
    }
  }

  function updateEnemy(e, dt, s) {
    var p = a.player;
    if (e.hp <= 0) return;
    e.anim += dt;
    if (e.stun > 0) { e.stun -= dt; return; }
    if (e.stunCd > 0) e.stunCd -= dt;
    if (e.lunge > 0) e.lunge = Math.max(0, e.lunge - dt * 5);
    if (e.walk && e.freeze <= 0) e.bobPhase = (e.bobPhase || 0) + e.spd * dt * 0.085;
    e.bobAmp = (e.bobAmp || 0) + ((e.walk && e.freeze <= 0 ? 1 : 0) - (e.bobAmp || 0)) * Math.min(1, dt * 7);
    if (e.freeze > 0) { e.freeze -= dt; return; }

    var dx = p.x - e.x, dy = p.y - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var stopAt = e.isRanged ? e.range * 0.8 : e.range * 0.85;

    if (d > stopAt && d > 0.001) {
      e.x += dx / d * e.spd * dt;
      e.y += dy / d * e.spd * dt;
      e.walk = 1;
      clampToFloor(e);
    } else { e.walk = 0; }

    /* Boss 阶段技能 */
    if (e.tier === 'boss') {
      e.skillCd -= dt;
      if (!e.phaseTriggered && e.hp < e.maxHp * 0.5) {
        e.phaseTriggered = true;
        bossPhase(e);
      }
      if (e.phaseSkill === 'regen' && e.phaseTriggered) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
      }
      if ((e.phaseSkill === 'army') && e.phaseTriggered && e.skillCd <= 0) {
        e.skillCd = 15;
        var scene = APOC.Data.sceneOfStage(a.stage);
        var normals = APOC.Data.normalsOfScene(scene.id);
        for (var k = 0; k < 4; k++) {
          var ne = APOC.CombatUtil.makeEnemy(R.pick(normals).id, a.stage);
          ne.x = e.x + R.range(-160, 160);
          ne.y = e.y + R.range(-80, 80);
          a.enemies.push(ne);
        }
      }
    }

    e.atkCd -= dt;
    if (e.atkCd <= 0 && d <= e.range) {
      e.atkCd = e.atkInterval * (e.tier === 'boss' && e.phaseTriggered ? 0.8 : 1);
      e.lunge = 1;
      var res = F.hit(
        { atk: e.atk, coef: 1, crit: 5, critDmg: 150, dmgUp: 0,
          pen: 0, penPct: 0, level: a.stage, dmgMul: 1 },
        { def: s.def, dmgReduce: s.dmgReduce, dodge: s.dodge, isPlayer: true }
      );
      if (res.dodged) return;
      var dmg = res.value;
      if (p.shield > 0) {
        var ab = Math.min(p.shield, dmg);
        p.shield -= ab; dmg -= ab;
      }
      p.hp -= dmg;
      p.hitFlash = 0.15;
      a.floats.push({ x: p.x, y: p.y - 46, text: '-' + Math.round(dmg),
                      color: '#ef4444', size: 15, t: 0.8, ttl: 0.8 });
    }
  }

  function bossPhase(e) {
    APOC.UIEffects.shake(8, 0.3);
    /* 进二阶段的演出：Boss 脚下炸开一圈冲击波，把"它变强了"这件事画出来 */
    APOC.UIEffects.vfx('ult_shockwave', e.x, e.y, {
      size: C.FX_SIZE.ult_shockwave * 1.1, ttl: 0.6,
      s0: 0.4, s1: 1.3, a0: 1, a1: 0
    });
    APOC.UIEffects.vfx('hit_crit_ring', e.x, e.y - e.size, {
      size: C.FX_SIZE.hit_crit_ring * 2, ttl: 0.45, s0: 0.5, s1: 1.3, a0: 1, a1: 0
    });
    APOC.Bus.emit('toast', { type: 'danger', text: e.name + ' 进入狂暴：' + (e.phaseText || '') });
    if (e.phaseSkill === 'enrage') e.spd *= 1.6;
    if (e.phaseSkill === 'summon' || e.phaseSkill === 'army') {
      var scene = APOC.Data.sceneOfStage(a.stage);
      var normals = APOC.Data.normalsOfScene(scene.id);
      var n = e.phaseSkill === 'army' ? 8 : 4;
      for (var k = 0; k < n; k++) {
        var ne = APOC.CombatUtil.makeEnemy(R.pick(normals).id, a.stage);
        ne.x = e.x + R.range(-180, 180);
        ne.y = e.y + R.range(-90, 90);
        a.enemies.push(ne);
      }
    }
  }

  /* ---------------- 结算 ---------------- */
  function onVictory() {
    var D = APOC.State.data, K = a.stage;
    var scene = APOC.Data.sceneOfStage(K);

    /* Boss 材料保底 */
    scene.materials.forEach(function (mid, idx) {
      var qty = Math.round(F.matQty(K) * (idx === 0 ? 8 : 5));
      APOC.Inventory.addMaterial(mid, qty);
    });
    /* 装备保底：至少 1 件紫色 */
    for (var i = 0; i < C.ITEM_BOSS; i++) {
      var it = APOC.Inventory.rollDrop(K, i === 0);
      if (it) APOC.Inventory.addItem(it);
    }

    /* ★ 宠物蛋：割草关是唯一的来源（用户定）。
       阶位按当前场景的品质权重 roll —— 推到后面的场景，蛋也跟着变好，
       和装备的品质梯度保持同一套节奏。 */
    if (APOC.Pets && R.chance(C.PET_EGG_CHANCE)) {
      var egg = APOC.Pets.grantEgg(K);
      var tname = APOC.Pets.TIER_NAME[egg.tier] || '未知';
      if (egg.action === 'upgrade') {
        APOC.Bus.emit('toast', { type: 'success', shake: true,
          text: '🥚 孵化出「' + tname + '」宠物！旧宠属性继承 ' +
                Math.round(egg.inherit * 100) + '%' });
        APOC.Audio.play('drop_epic', { gap: 0.3 });
      } else if (egg.action === 'new') {
        APOC.Bus.emit('toast', { type: 'success', shake: true,
          text: '🥚 孵化出第一只宠物：「' + tname + '」！' });
        APOC.Audio.play('drop_epic', { gap: 0.3 });
      } else {
        APOC.Bus.emit('toast', { type: 'info',
          text: '🥚 孵出「' + tname + '」，不如当前宠物，折算成 ' + egg.exp + ' 点经验喂掉了' });
      }
    }

    if (!D.progress.cleared[K]) D.progress.cleared[K] = 0;
    D.progress.arenaClears[K] = (D.progress.arenaClears[K] || 0) + 1;
    if (K + 1 <= C.MAX_STAGE && D.progress.maxStage < K + 1) D.progress.maxStage = K + 1;

    a.phase = 'done';
    a.active = false;
    APOC.Bus.emit('arena:clear', { stage: K, kills: a.killCount });
    APOC.Bus.emit('stage:clear', { stage: K, arena: true });
    APOC.State.markDirty();

    if (D.settings.autoNextStage && K < C.MAX_STAGE) {
      setTimeout(function () { APOC.enterStage(K + 1); }, 2000);
    }
  }

  function onDefeat() {
    /* 「不灭」词条：免死一次 */
    if (a.stacks.immortal && !a.immortalUsed) {
      a.immortalUsed = true;
      a.player.hp = a.player.maxHp;
      APOC.Bus.emit('toast', { type: 'success', text: '「不灭」触发！你活了下来' });
      APOC.UIEffects.shake(8, 0.3);
      return;
    }
    APOC.State.data.stats.totalDeaths++;
    a.phase = 'failed';
    a.active = false;
    var K = a.stage;
    APOC.Bus.emit('arena:fail', { stage: K, kills: a.killCount });
    APOC.Bus.emit('toast', { type: 'danger', text: '挑战失败，可随时重来（无惩罚）' });
    APOC.State.markDirty();
  }

  /* ---------------- 对外 ---------------- */
  /* ---------------- 自动挑强化 ----------------
     ★ 原来无论自动还是超时，都是无脑吃 `options[0]` —— 三张卡里明明有一张传说，
     照样被丢掉。改成按品质挑。
     ★ 同级**保持原顺序**（用稳定排序，不引入任何随机）：调参器和测试都依赖
     `APOC_SEED` 的可复现性，这里一旦用了随机排序，历史种子全部失效。 */
  var RARITY_RANK = { common: 0, rare: 1, legendary: 2 };

  function bestPerk(options) {
    if (!options || !options.length) return null;
    var best = options[0], bestRank = RARITY_RANK[options[0].rarity] || 0;
    for (var i = 1; i < options.length; i++) {
      var r = RARITY_RANK[options[i].rarity] || 0;
      if (r > bestRank) { best = options[i]; bestRank = r; }   // 严格大于 → 同级保留先来的
    }
    return best;
  }

  APOC.Arena = {
    get state() { return a; },
    isActive: function () { return !!(a && a.active); },
    /* Stats.final() 会调这个 */
    collectPerkStats: collectPerkStats,
    onKill: onKill,
    enter: enter,
    exit: exit,
    choosePerk: choosePerk,
    bestPerk: bestPerk,
    tick: function (dt) { tick(dt); }
  };
})(window.APOC = window.APOC || {});
