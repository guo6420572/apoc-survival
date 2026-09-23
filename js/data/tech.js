/* tech.js — 科技树节点表：3 线 × 7 层 × (1 主 + 2 被动) = 63 节点
   主节点 node.weapon = 武器 id；被动节点 node.effects = [{stat, per, text}]
   数值为「每级」增量，Lv5 时是 per × 5 */
(function (APOC) {
  'use strict';

  var nodes = [];

  function main(line, layer, weaponId, name, icon) {
    nodes.push({
      id: line + '_' + layer, line: line, layer: layer, type: 'main',
      name: name, icon: icon, weapon: weaponId,
      req: layer === 1 ? null : line + '_' + (layer - 1)
    });
  }
  function passive(line, layer, suffix, name, icon, effects, desc) {
    nodes.push({
      id: line + '_' + layer + suffix, line: line, layer: layer, type: 'passive',
      name: name, icon: icon, effects: effects, desc: desc,
      req: line + '_' + layer
    });
  }

  /* ================= 体术 body ================= */
  main('body', 1, 'body_1', '战斗拳套', '🥊');
  passive('body', 1, 'a', '铁骨', '🦴', [{ stat:'defPct', per:6, text:'防御力' }]);
  passive('body', 1, 'b', '蛮力', '💪', [{ stat:'atkPct', per:4, text:'攻击力' }]);

  main('body', 2, 'body_2', '军用匕首', '🗡️');
  passive('body', 2, 'a', '疾步', '👟', [{ stat:'aspdPct', per:4, text:'攻击速度' }]);
  passive('body', 2, 'b', '皮糙肉厚', '🛡️', [{ stat:'hpPct', per:8, text:'最大生命' }]);

  main('body', 3, 'body_3', '加固铁管', '🏏');
  passive('body', 3, 'a', '硬化皮肤', '🪨', [{ stat:'dmgReduce', per:2, text:'减伤' }]);
  passive('body', 3, 'b', '血怒', '😡', [{ stat:'bloodRage', per:2, text:'每损失10%生命攻击力' }],
          '每损失 10% 生命，攻击力提升，最多 +18%');

  main('body', 4, 'body_4', '消防斧', '🪓');
  passive('body', 4, 'a', '反击', '↩️', [{ stat:'thorns', per:20, text:'受击反弹防御力' }],
          '受击时反弹等量伤害');
  passive('body', 4, 'b', '撕裂', '🩸', [{ stat:'bleed', per:6, text:'流血触发率' }],
          '攻击时概率造成 3 秒流血');

  main('body', 5, 'body_5', '链锯剑', '🪚');
  passive('body', 5, 'a', '嗜血', '🧛', [{ stat:'lifesteal', per:1.2, text:'吸血' }]);
  passive('body', 5, 'b', '霸体', '🗿', [{ stat:'dmgReduce', per:2, text:'减伤' }], '免疫击退');

  main('body', 6, 'body_6', '动力拳套', '🤜');
  passive('body', 6, 'a', '不动如山', '⛰️', [{ stat:'defPct', per:10, text:'防御力' }],
          '单次受伤超过最大生命 20% 时，该次伤害减半');
  passive('body', 6, 'b', '毁灭之力', '💥', [{ stat:'shockwave', per:60, text:'震荡波伤害' }],
          '每 5 次攻击触发范围震荡波');

  main('body', 7, 'body_7', '等离子巨锤', '🔨');
  passive('body', 7, 'a', '不屈', '♾️', [{ stat:'undying', per:15, text:'冷却缩减' }],
          '致死伤害免疫一次，冷却 120 秒');
  passive('body', 7, 'b', '泰坦之躯', '🗼', [
    { stat:'hpPct', per:12, text:'最大生命' },
    { stat:'dmgReduce', per:1.5, text:'减伤' }
  ]);

  /* ================= 枪械 gun ================= */
  main('gun', 1, 'gun_1', '生锈手枪', '🔫');
  passive('gun', 1, 'a', '枪械精通', '🎯', [{ stat:'atkPct', per:4, text:'攻击力' }]);
  passive('gun', 1, 'b', '快速换弹', '🔄', [{ stat:'aspdPct', per:3.5, text:'攻击速度' }]);

  main('gun', 2, 'gun_2', '双持手枪', '🔫');
  passive('gun', 2, 'a', '精准射击', '➕', [{ stat:'crit', per:1.6, text:'暴击率' }]);
  passive('gun', 2, 'b', '致命打击', '💢', [{ stat:'critDmg', per:10, text:'暴击伤害' }]);

  main('gun', 3, 'gun_3', '冲锋枪', '🔫');
  passive('gun', 3, 'a', '穿甲弹', '🔩', [{ stat:'penPct', per:4, text:'百分比穿透' }]);
  passive('gun', 3, 'b', '弹匣扩容', '📦', [
    { stat:'aspdPct', per:3, text:'攻击速度' },
    { stat:'pen', per:4, text:'固定穿透' }
  ]);

  main('gun', 4, 'gun_4', '霰弹枪', '💥');
  passive('gun', 4, 'a', '双重射击', '✌️', [{ stat:'doubleShot', per:6, text:'额外攻击触发率' }],
          '概率触发额外一轮攻击');
  passive('gun', 4, 'b', '稳定枪身', '⚖️', [
    { stat:'crit', per:1.4, text:'暴击率' },
    { stat:'critDmg', per:8, text:'暴击伤害' }
  ]);

  main('gun', 5, 'gun_5', '突击步枪', '🔫');
  passive('gun', 5, 'a', '弱点洞察', '👁️', [{ stat:'eliteDmg', per:7, text:'对精英/Boss伤害' }]);
  passive('gun', 5, 'b', '弹药强化', '🧨', [{ stat:'atkPct', per:5, text:'攻击力' }]);

  main('gun', 6, 'gun_6', '狙击枪', '🎯');
  passive('gun', 6, 'a', '弹幕风暴', '🌪️', [{ stat:'barrage', per:7, text:'双倍攻击触发率' }],
          '概率使本次攻击次数翻倍');
  passive('gun', 6, 'b', '致死射击', '☠️', [{ stat:'critDmg', per:14, text:'暴击伤害' }]);

  main('gun', 7, 'gun_7', '电磁轨道炮', '⚡');
  passive('gun', 7, 'a', '弹道大师', '📐', [
    { stat:'rangePct', per:12, text:'攻击射程' },
    { stat:'penPct', per:3, text:'百分比穿透' }
  ]);
  passive('gun', 7, 'b', '战争机器', '⚙️', [
    { stat:'atkPct', per:8, text:'攻击力' },
    { stat:'aspdPct', per:3, text:'攻击速度' }
  ]);

  /* ================= 异能 psi ================= */
  main('psi', 1, 'psi_1', '念力弹', '🔮');
  passive('psi', 1, 'a', '精神共鸣', '🧠', [{ stat:'atkPct', per:4, text:'攻击力' }]);
  passive('psi', 1, 'b', '能量池', '🌀', [{ stat:'aspdPct', per:3.5, text:'攻击速度' }]);

  main('psi', 2, 'psi_2', '心灵震爆', '💫');
  passive('psi', 2, 'a', '灼烧', '🔥', [{ stat:'burn', per:12, text:'燃烧伤害' }],
          '攻击附加 3 秒燃烧');
  passive('psi', 2, 'b', '心灵增幅', '📡', [{ stat:'dmgUp', per:3, text:'增伤' }]);

  main('psi', 3, 'psi_3', '燃烧之手', '🔥');
  passive('psi', 3, 'a', '连锁', '🔗', [{ stat:'chain', per:1, text:'弹射目标' }]);
  passive('psi', 3, 'b', '冰封', '🧊', [{ stat:'freeze', per:4, text:'冻结触发率' }]);

  main('psi', 4, 'psi_4', '连锁闪电', '⚡');
  passive('psi', 4, 'a', '精神护盾', '🔵', [{ stat:'shield', per:5, text:'最大生命护盾' }],
          '获得护盾，12 秒重生');
  passive('psi', 4, 'b', '元素亲和', '🌈', [{ stat:'dmgUp', per:3, text:'增伤' }]);

  main('psi', 5, 'psi_5', '冰霜新星', '❄️');
  passive('psi', 5, 'a', '灼热之触', '♨️', [{ stat:'dotUp', per:12, text:'持续伤害' }]);
  passive('psi', 5, 'b', '心灵腐蚀', '🕳️', [{ stat:'penPct', per:3, text:'百分比穿透' }]);

  main('psi', 6, 'psi_6', '湮灭射线', '☄️');
  passive('psi', 6, 'a', '湮灭', '🌌', [{ stat:'annihilate', per:80, text:'射线伤害' }],
          '每 8 秒发射贯穿全屏的射线');
  passive('psi', 6, 'b', '领域', '⭕', [{ stat:'domain', per:25, text:'领域每秒伤害' }],
          '周围 200px 内敌人持续受伤');

  main('psi', 7, 'psi_7', '奇点坍缩', '🌀');
  passive('psi', 7, 'a', '奇点', '⚫', [{ stat:'singularity', per:100, text:'奇点伤害' }],
          '每 20 秒吸引并重创周围敌人');
  passive('psi', 7, 'b', '虚空之力', '🌑', [
    { stat:'atkPct', per:8, text:'攻击力' },
    { stat:'dmgUp', per:4, text:'增伤' }
  ]);

  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });

  APOC.Data.Tech = nodes;
  APOC.Data.TechById = byId;
  APOC.Data.LINES = [
    { id: 'body', name: '体术', icon: '🥊' },
    { id: 'gun',  name: '枪械', icon: '🔫' },
    { id: 'psi',  name: '异能', icon: '🔮' }
  ];
})(window.APOC = window.APOC || {});
