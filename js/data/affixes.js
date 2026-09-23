/* affixes.js — 装备词条池。全部为百分比或百分点，不随 POW 缩放 */
(function (APOC) {
  'use strict';

  /* stat 语义：
     - atkPct / hpPct / defPct / aspdPct → 进加法百分比池
     - 其余 → 直接加到对应属性的面板值上
     - allPct 是特殊词条，同时加到 atkPct/hpPct/defPct
     - special.* 系列走 special 池（战斗逻辑已实现，见 combat.js）

     ★ minQuality：词条的最低品质门槛（0白 1绿 2蓝 3紫 4橙）。
       不写就是 0，白装也能滚出来。
       这一列的意义是让"品质"不再只是"数字大一点" —— 蓝装以上才能滚出
       带机制的特殊词条（反伤/护盾/连发/燃烧/冻结/弹射…）。
       抽词条时按品质过滤池子，见 inventory.js 的 makeItem。

     ★ 特殊词条的 stat 全部是 SPECIAL_KEYS 里**已有战斗实现**的，
       不新增任何战斗代码（实现位置见 combat.js 的 tickPlayerEffects / onKill / attack）。 */
  APOC.Data.Affixes = [
    { id: 'sharp',       name: '锋锐',   stat: 'atkPct',     min: 6,   max: 12,  weight: 100, text: '攻击力' },
    { id: 'sturdy',      name: '坚韧',   stat: 'hpPct',      min: 8,   max: 16,  weight: 100, text: '最大生命' },
    { id: 'heavy',       name: '厚重',   stat: 'defPct',     min: 10,  max: 20,  weight: 100, text: '防御力' },
    { id: 'swift',       name: '迅捷',   stat: 'aspdPct',    min: 4,   max: 9,   weight: 80,  text: '攻击速度' },
    { id: 'deadly',      name: '致命',   stat: 'crit',       min: 3,   max: 7,   weight: 70,  text: '暴击率' },
    { id: 'fury',        name: '狂怒',   stat: 'critDmg',    min: 15,  max: 35,  weight: 70,  text: '暴击伤害' },
    { id: 'nimble',      name: '灵巧',   stat: 'dodge',      min: 3,   max: 6,   weight: 60,  text: '闪避率' },
    { id: 'bloodthirst', name: '嗜血',   stat: 'lifesteal',  min: 2,   max: 5,   weight: 50,  text: '吸血' },
    { id: 'armorbreak',  name: '破甲',   stat: 'penPct',     min: 8,   max: 18,  weight: 60,  text: '百分比穿透' },
    { id: 'ferocious',   name: '凶暴',   stat: 'dmgUp',      min: 6,   max: 14,  weight: 55,  text: '增伤' },
    { id: 'bulwark',     name: '壁垒',   stat: 'dmgReduce',  min: 4,   max: 9,   weight: 55,  text: '减伤' },
    { id: 'hunter',      name: '猎杀',   stat: 'eliteDmg',   min: 8,   max: 18,  weight: 40,  text: '对精英/Boss伤害' },
    { id: 'regen',       name: '复苏',   stat: 'hpRegenPct', min: 0.5, max: 1.5, weight: 40,  text: '每秒回复生命' },
    { id: 'greed',       name: '贪婪',   stat: 'goldPct',    min: 10,  max: 25,  weight: 35,  text: '金币获取' },
    { id: 'insight',     name: '洞察',   stat: 'expPct',     min: 8,   max: 20,  weight: 35,  text: '经验获取' },
    { id: 'overload',    name: '超载',   stat: 'allPct',     min: 3,   max: 6,   weight: 15,  text: '攻击/生命/防御' },

    /* ---------- 进阶词条（品质门槛） ---------- */
    { id: 'vampire',     name: '吸血鬼', stat: 'lifesteal',  min: 4,   max: 9,   weight: 30,  minQuality: 2, text: '吸血' },
    { id: 'piercer',     name: '贯穿',   stat: 'penPct',     min: 12,  max: 26,  weight: 30,  minQuality: 2, text: '百分比穿透' },
    { id: 'savage',      name: '残暴',   stat: 'critDmg',    min: 30,  max: 60,  weight: 30,  minQuality: 2, text: '暴击伤害' },
    { id: 'titan',       name: '泰坦',   stat: 'hpPct',      min: 18,  max: 32,  weight: 28,  minQuality: 2, text: '最大生命' },
    { id: 'precision',   name: '精准',   stat: 'crit',       min: 8,   max: 15,  weight: 28,  minQuality: 2, text: '暴击率' },
    { id: 'guardian',    name: '守护',   stat: 'dmgReduce',  min: 8,   max: 15,  weight: 26,  minQuality: 3, text: '减伤' },

    /* ---------- 特殊词条：带机制，只有蓝装以上能滚出来 ---------- */
    { id: 'sp_thorns',   name: '荆棘',   stat: 'thorns',       min: 15,  max: 35,  weight: 22,  minQuality: 2, text: '受击反弹伤害' },
    { id: 'sp_shield',   name: '力场',   stat: 'shield',       min: 4,   max: 10,  weight: 20,  minQuality: 2, text: '周期性护盾' },
    { id: 'sp_burn',     name: '烈焰',   stat: 'burn',         min: 10,  max: 25,  weight: 20,  minQuality: 2, text: '攻击附带燃烧' },
    { id: 'sp_freeze',   name: '冰河',   stat: 'freeze',       min: 3,   max: 8,   weight: 18,  minQuality: 2, text: '冻结触发率' },
    { id: 'sp_chain',    name: '电弧',   stat: 'chain',        min: 1,   max: 2,   weight: 18,  minQuality: 3, text: '弹射目标数' },
    { id: 'sp_bleed',    name: '放血',   stat: 'bleed',        min: 6,   max: 14,  weight: 18,  minQuality: 2, text: '攻击附带流血' },
    { id: 'sp_multi',    name: '分裂',   stat: 'multiTarget',  min: 1,   max: 2,   weight: 16,  minQuality: 3, text: '额外命中目标' },
    { id: 'sp_splash',   name: '爆裂',   stat: 'splash',       min: 20,  max: 45,  weight: 16,  minQuality: 3, text: '溅射伤害' },
    { id: 'sp_barrage',  name: '连发',   stat: 'barrage',      min: 6,   max: 14,  weight: 14,  minQuality: 3, text: '概率攻击次数翻倍' },
    { id: 'sp_double',   name: '双响',   stat: 'doubleShot',   min: 5,   max: 12,  weight: 14,  minQuality: 3, text: '概率额外一轮攻击' },
    { id: 'sp_true',     name: '破魔',   stat: 'trueDamage',   min: 1,   max: 1,   weight: 10,  minQuality: 4, text: '无视防御' },
    { id: 'sp_domain',   name: '领域',   stat: 'domain',       min: 15,  max: 40,  weight: 10,  minQuality: 4, text: '周围持续伤害' },
    { id: 'sp_annihilate', name: '湮灭', stat: 'annihilate',   min: 60,  max: 140, weight: 8,   minQuality: 4, text: '周期全屏射线' }
  ];

  var byId = {};
  APOC.Data.Affixes.forEach(function (a) { byId[a.id] = a; });
  APOC.Data.AffixById = byId;
})(window.APOC = window.APOC || {});
