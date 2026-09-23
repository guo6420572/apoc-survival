/* perks.js — 割草关三选一词条池（32 条）
   stat 语义同 affixes.js；dmgMul 是独立乘区（见 03 第三节白名单） */
(function (APOC) {
  'use strict';

  APOC.Data.Perks = [
    /* ---------------- 普通 common ---------------- */
    { id:'atk_up',     name:'力量涌动', icon:'⚔️', rarity:'common', stat:'atkPct',   value:22, desc:'攻击力 +22%' },
    { id:'aspd_up',    name:'迅捷步伐', icon:'💨', rarity:'common', stat:'aspdPct',  value:18, desc:'攻击速度 +18%' },
    { id:'crit_up',    name:'致命精准', icon:'🎯', rarity:'common', stat:'crit',     value:12, desc:'暴击率 +12%' },
    { id:'critdmg_up', name:'重击',     icon:'💥', rarity:'common', stat:'critDmg',  value:45, desc:'暴击伤害 +45%' },
    { id:'pen_up',     name:'破甲弹',   icon:'🔨', rarity:'common', stat:'penPct',   value:28, desc:'百分比穿透 +28%' },
    { id:'dmgup_up',   name:'战斗狂热', icon:'🔥', rarity:'common', stat:'dmgUp',    value:18, desc:'增伤 +18%' },
    { id:'hp_up',      name:'血肉强化', icon:'❤️', rarity:'common', stat:'hpPct',    value:28, desc:'最大生命 +28%' },
    { id:'def_up',     name:'铁壁',     icon:'🛡️', rarity:'common', stat:'defPct',   value:35, desc:'防御力 +35%' },
    { id:'dodge_up',   name:'幻影步',   icon:'👻', rarity:'common', stat:'dodge',    value:9,  desc:'闪避率 +9%' },
    { id:'reduce_up',  name:'坚韧',     icon:'🪨', rarity:'common', stat:'dmgReduce',value:12, desc:'减伤 +12%' },
    { id:'regen_up',   name:'再生',     icon:'🌿', rarity:'common', stat:'hpRegenPct',value:1, desc:'每秒回复 1% 最大生命' },

    /* ---------------- 稀有 rare ---------------- */
    { id:'lifesteal',  name:'吸血鬼',   icon:'🩸', rarity:'rare', stat:'lifesteal', value:6,  desc:'吸血 +6%' },
    { id:'multi_shot', name:'多重射击', icon:'🔱', rarity:'rare', stat:'multiTarget',value:1, desc:'每次攻击额外命中 1 个目标' },
    { id:'chain',      name:'连锁',     icon:'⚡', rarity:'rare', stat:'chain',     value:1,  desc:'攻击弹射 +1 个目标' },
    { id:'splash',     name:'爆裂',     icon:'💫', rarity:'rare', stat:'splash',    value:0.6,desc:'攻击产生溅射（半径 90px，60% 伤害）' },
    { id:'kill_heal',  name:'屠戮回复', icon:'💚', rarity:'rare', stat:'killHeal',  value:2,  desc:'每次击杀回复 2% 最大生命' },
    { id:'kill_bomb',  name:'尸爆',     icon:'☠️', rarity:'rare', stat:'killBomb',  value:1.5,desc:'击杀时爆炸，造成 150% 攻击力伤害' },
    { id:'thorns',     name:'荆棘',     icon:'🌵', rarity:'rare', stat:'thornsPct', value:1,  desc:'受击反弹等于 100% 防御力的伤害' },
    { id:'freeze',     name:'冰霜',     icon:'❄️', rarity:'rare', stat:'freeze',    value:12, desc:'攻击有 12% 概率冻结敌人 1.5 秒' },
    { id:'burn',       name:'灼烧',     icon:'🔥', rarity:'rare', stat:'burn',      value:30, desc:'攻击附加 5 秒燃烧，每秒 30% 攻击力' },
    { id:'shield',     name:'能量护盾', icon:'🔵', rarity:'rare', stat:'shield',    value:25, desc:'获得 25% 最大生命护盾，12 秒重生' },
    { id:'critdmg_big',name:'处决',     icon:'🗡️', rarity:'rare', stat:'critDmg',   value:60, desc:'暴击伤害 +60%' },
    { id:'elite_slayer',name:'猎杀者',  icon:'📌', rarity:'rare', stat:'eliteDmg',  value:45, desc:'对精英与 Boss 伤害 +45%' },
    { id:'gold_rush',  name:'贪婪',     icon:'💰', rarity:'rare', stat:'goldPct',   value:100,desc:'金币获取 +100%' },
    { id:'range_up',   name:'鹰眼',     icon:'🔭', rarity:'rare', stat:'rangePct',  value:30, desc:'攻击射程 +30%' },

    /* ---------------- 传说 legendary ---------------- */
    { id:'all_in',       name:'背水一战', icon:'🎲', rarity:'legendary', stat:'dmgMul',   value:2.0,
      desc:'伤害翻倍，最大生命 -50%', extra:{ hpPct:-50 }, exclude:'glass_cannon' },
    { id:'glass_cannon', name:'玻璃大炮', icon:'🥂', rarity:'legendary', stat:'dmgMul',   value:0.7,
      desc:'攻击速度 +100%，伤害 -30%', extra:{ aspdPct:100 }, exclude:'all_in' },
    { id:'growing',      name:'成长',     icon:'📈', rarity:'legendary', stat:'growing',  value:0.3,
      desc:'每次击杀永久 +0.3% 攻击力（本场累计）' },
    { id:'true_damage',  name:'真实伤害', icon:'🗡️', rarity:'legendary', stat:'trueDamage',value:1,
      desc:'所有伤害无视防御' },
    { id:'time_dilation',name:'时间加速', icon:'⏱️', rarity:'legendary', stat:'aspdPct',  value:50,
      desc:'攻击速度 +50%，移动速度 +50%', extra:{ spdPct:50 } },
    { id:'immortal',     name:'不灭',     icon:'✨', rarity:'legendary', stat:'immortal', value:1,
      desc:'血量归零时免疫死亡 1 次并回满生命（每场仅 1 次）' },
    { id:'overkill',     name:'溢伤',     icon:'☄️', rarity:'legendary', stat:'overkill', value:0.3,
      desc:'暴击伤害的 30% 转化为对周围 120px 敌人的伤害' },
    { id:'singularity',  name:'奇点',     icon:'🌀', rarity:'legendary', stat:'singularity', value:400,
      desc:'每 15 秒吸引 250px 内敌人并造成 400% 攻击力伤害' }
  ];

  var byId = {};
  APOC.Data.Perks.forEach(function (p) { byId[p.id] = p; });
  APOC.Data.PerkById = byId;

  /* 按稀有度权重抽 N 个不重复词条 */
  APOC.Data.rollPerks = function (n) {
    var R = APOC.RNG, C = APOC.Config;
    var pools = { common: [], rare: [], legendary: [] };
    APOC.Data.Perks.forEach(function (p) { pools[p.rarity].push(p); });

    var picked = [], pickedIds = {}, guard = 0;
    while (picked.length < n && guard++ < 200) {
      var roll = R.next() * 100, rarity;
      if (roll < C.ARENA_PERK_WEIGHT.common) rarity = 'common';
      else if (roll < C.ARENA_PERK_WEIGHT.common + C.ARENA_PERK_WEIGHT.rare) rarity = 'rare';
      else rarity = 'legendary';

      var pool = pools[rarity].filter(function (p) {
        if (pickedIds[p.id]) return false;
        // 互斥检查
        for (var i = 0; i < picked.length; i++) {
          if (picked[i].exclude === p.id || p.exclude === picked[i].id) return false;
        }
        return true;
      });
      if (!pool.length) continue;
      var p = R.pick(pool);
      picked.push(p);
      pickedIds[p.id] = true;
    }
    return picked;
  };
})(window.APOC = window.APOC || {});
