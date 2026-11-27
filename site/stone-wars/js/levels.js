/**
 * 《石器大战》关卡、时代与数值配置
 * ------------------------------------------------------------
 * 游戏路线：
 *   石器时代（1-8 关）  石矛、石弹、火雷，靠蛮力和地形
 *   铁骑时代（9-16 关） 铁弩、加农炮、火油弹，重甲与骑兵登场
 *   火器时代（17-24 关）火枪、迫击炮、火箭弹，射程与爆炸范围升级
 *   机械时代（25-32 关）激光炮、电磁炮，穿透与高伤害
 *   修仙时代（33-60 关）炼气→筑基→金丹→元婴→化神→渡劫六大境界
 * 每关目标均为「消灭全部敌人」，par 为三星回合数。
 * 技能/武器按「阶段 / 境界」从低到高递进解锁：低阶段只开放基础武器，
 * 进入新阶段（境界）才解锁新的技能，详见 STAGE_WEAPONS / CULTIVATION_STAGES。
 */

export const WORLD = { w: 1280, h: 720, tile: 16, cols: 80, rows: 45 };

export const WEAPONS = {
  // ------------------------------------------------------------ 石器时代
  spear: {
    id: "spear", name: "石矛", short: "矛", era: "stone", kind: "spear",
    desc: "直线飞行，出手快，伤害稳定",
    color: "#d8c29a", speed: 1180, gravity: 320, damage: 30, blast: 34,
    cooldown: 0.55, icon: "spear",
  },
  boulder: {
    id: "boulder", name: "石弹", short: "石", era: "stone", kind: "boulder",
    desc: "重型抛射，落点范围伤害",
    color: "#b8845a", speed: 900, gravity: 980, damage: 56, blast: 82,
    cooldown: 1.8, icon: "boulder",
  },
  grenade: {
    id: "grenade", name: "火雷", short: "雷", era: "stone", kind: "grenade",
    desc: "会反弹，引信结束后爆炸",
    color: "#ff9c4a", speed: 840, gravity: 1020, damage: 52, blast: 92,
    fuse: 2.35, bounce: 0.46, cooldown: 1.6, icon: "grenade",
  },
  banana: {
    id: "banana", name: "香蕉炸弹", short: "蕉", era: "stone", kind: "banana",
    desc: "爆炸后分裂成 3 枚小香蕉",
    color: "#ffe15c", speed: 800, gravity: 960, damage: 46, blast: 76,
    cooldown: 2.4, icon: "banana",
  },
  spike: {
    id: "spike", name: "刺球", short: "刺", era: "stone", kind: "spike",
    desc: "贴地滚动，碰到敌人立即爆炸",
    color: "#9fb4c8", speed: 780, gravity: 1240, damage: 44, blast: 70,
    cooldown: 1.5, icon: "spike",
  },
  boomerang: {
    id: "boomerang", name: "回旋镖", short: "旋", era: "stone", kind: "boomerang",
    desc: "飞出后折返，可连续命中多个敌人",
    color: "#e8b96a", speed: 900, gravity: 0, damage: 32, blast: 0,
    cooldown: 1.25, icon: "boomerang",
  },
  meteor: {
    id: "meteor", name: "陨石", short: "陨", era: "stone", kind: "boulder",
    desc: "召唤陨石，超大范围高伤害",
    color: "#ff8a5a", speed: 700, gravity: 1150, damage: 88, blast: 150,
    cooldown: 4.5, icon: "meteor",
  },
  watermelon: {
    id: "watermelon", name: "西瓜", short: "瓜", era: "stone", kind: "split",
    desc: "命中后分裂成 4 瓣，每瓣小范围伤害",
    color: "#7ed957", speed: 820, gravity: 940, damage: 26, blast: 52,
    cooldown: 2.0, icon: "watermelon",
  },
  durian: {
    id: "durian", name: "榴莲", short: "榴", era: "stone", kind: "spike",
    desc: "贴地滚动，碰到敌人爆炸并弹跳一次",
    color: "#c8b45a", speed: 760, gravity: 1180, damage: 48, blast: 78,
    cooldown: 1.8, icon: "durian",
  },
  poisonshroom: {
    id: "poisonshroom", name: "毒蘑菇", short: "毒", era: "stone", kind: "grenade",
    desc: "爆炸后留下毒雾，持续掉血",
    color: "#b48ce8", speed: 800, gravity: 1000, damage: 30, blast: 66,
    fuse: 2.0, bounce: 0.4, cooldown: 2.2, icon: "poisonshroom",
  },

  // ------------------------------------------------------------ 铁骑时代
  crossbow: {
    id: "crossbow", name: "铁弩", short: "弩", era: "iron", kind: "spear",
    desc: "高速弩箭，弹道比石矛更平直",
    color: "#b9c4cf", speed: 1520, gravity: 360, damage: 38, blast: 28,
    cooldown: 0.6, icon: "crossbow",
  },
  cannon: {
    id: "cannon", name: "加农炮", short: "炮", era: "iron", kind: "boulder",
    desc: "铁球重炮，落点炸出大坑",
    color: "#8795a5", speed: 920, gravity: 1080, damage: 78, blast: 120,
    cooldown: 2.3, icon: "cannon",
  },
  firebomb: {
    id: "firebomb", name: "火油弹", short: "油", era: "iron", kind: "grenade",
    desc: "陶罐火油，反弹后爆出大片火海",
    color: "#ff8a3a", speed: 820, gravity: 1000, damage: 64, blast: 108,
    fuse: 2.1, bounce: 0.42, cooldown: 1.7, icon: "firebomb",
  },
  flail: {
    id: "flail", name: "链锤", short: "锤", era: "iron", kind: "boulder",
    desc: "命中后弹跳 2 次，专打掩体后目标",
    color: "#a8b0ba", speed: 880, gravity: 1050, damage: 62, blast: 88,
    cooldown: 2.0, icon: "flail",
  },
  flare: {
    id: "flare", name: "信号弹", short: "信", era: "iron", kind: "spear",
    desc: "标记目标，下次命中伤害翻倍",
    color: "#ffd25e", speed: 1400, gravity: 300, damage: 18, blast: 20,
    cooldown: 1.0, icon: "flare",
  },

  // ------------------------------------------------------------ 火器时代
  rifle: {
    id: "rifle", name: "火枪", short: "枪", era: "gun", kind: "spear",
    desc: "射速极快的平射火枪，压制力强",
    color: "#ffe0a0", speed: 2000, gravity: 150, damage: 32, blast: 20,
    cooldown: 0.34, icon: "rifle",
  },
  mortar: {
    id: "mortar", name: "迫击炮", short: "迫", era: "gun", kind: "boulder",
    desc: "高抛炮弹，超大范围爆炸",
    color: "#9aa6b3", speed: 760, gravity: 1200, damage: 92, blast: 150,
    cooldown: 3.0, icon: "mortar",
  },
  rocket: {
    id: "rocket", name: "火箭弹", short: "箭", era: "gun", kind: "rocket",
    desc: "带烟尾的高速火箭，命中剧烈爆炸",
    color: "#ff7a4a", speed: 1080, gravity: 260, damage: 100, blast: 138,
    cooldown: 3.0, icon: "rocket",
  },
  molotov: {
    id: "molotov", name: "燃烧瓶", short: "燃", era: "gun", kind: "grenade",
    desc: "爆炸后留下火海，持续灼烧敌人",
    color: "#ff6a3a", speed: 800, gravity: 980, damage: 40, blast: 80,
    fuse: 1.6, bounce: 0.35, cooldown: 1.8, icon: "molotov",
  },
  cluster: {
    id: "cluster", name: "集束弹", short: "集", era: "gun", kind: "split",
    desc: "空中分裂成 5 个小弹，覆盖大片区域",
    color: "#e8a0ff", speed: 780, gravity: 900, damage: 22, blast: 48,
    cooldown: 2.6, icon: "cluster",
  },

  // ------------------------------------------------------------ 机械时代
  laser: {
    id: "laser", name: "激光炮", short: "激", era: "mech", kind: "laser",
    desc: "零重力光束，指哪打哪，可快速连射",
    color: "#6fe8ff", speed: 2400, gravity: 0, damage: 70, blast: 74,
    cooldown: 0.85, icon: "laser",
  },
  railgun: {
    id: "railgun", name: "电磁炮", short: "磁", era: "mech", kind: "laser",
    desc: "超高伤害穿甲弹，可贯穿成排敌人",
    color: "#b48cff", speed: 3200, gravity: 0, damage: 150, blast: 66,
    cooldown: 3.6, pierce: true, icon: "railgun",
  },
  drone: {
    id: "drone", name: "无人机", short: "机", era: "mech", kind: "rocket",
    desc: "命中前可微调方向，自动追踪目标",
    color: "#6fe8d8", speed: 900, gravity: 200, damage: 70, blast: 90,
    cooldown: 2.4, icon: "drone",
  },
  gravity: {
    id: "gravity", name: "引力弹", short: "引", era: "mech", kind: "boulder",
    desc: "命中后把敌人拉向爆心，再爆炸",
    color: "#d88cff", speed: 700, gravity: 800, damage: 60, blast: 110,
    cooldown: 3.2, icon: "gravity",
  },

  // ------------------------------------------------------------ 修仙时代（按境界递进）
  // 炼气期：基础攻击
  sword: {
    id: "sword", name: "御剑诀", short: "剑", era: "cultivation", kind: "spear",
    desc: "御剑飞行，直线穿透敌人",
    color: "#e8f4ff", speed: 1800, gravity: 0, damage: 42, blast: 24,
    cooldown: 0.45, pierce: true, icon: "sword", realm: "炼气",
  },
  fireball: {
    id: "fireball", name: "火球术", short: "火", era: "cultivation", kind: "boulder",
    desc: "抛射火球，爆炸后留下火海",
    color: "#ff6a3a", speed: 860, gravity: 900, damage: 58, blast: 92,
    cooldown: 1.6, icon: "fireball", realm: "炼气",
  },
  // 筑基期：防御与控制
  thunder: {
    id: "thunder", name: "雷符", short: "雷", era: "cultivation", kind: "grenade",
    desc: "落地后召唤天雷，大范围高伤害",
    color: "#ffe95c", speed: 780, gravity: 950, damage: 72, blast: 120,
    fuse: 1.8, bounce: 0.3, cooldown: 2.4, icon: "thunder", realm: "筑基",
  },
  shieldcharm: {
    id: "shieldcharm", name: "护体符", short: "护", era: "cultivation", kind: "buff",
    desc: "为全体友军施加护盾，抵挡一次伤害",
    color: "#ffd25e", speed: 0, gravity: 0, damage: 0, blast: 0,
    cooldown: 8, icon: "shieldcharm", realm: "筑基", buffType: "shield", buffVal: 80, buffDur: 12,
  },
  soulchain: {
    id: "soulchain", name: "锁魂链", short: "锁", era: "cultivation", kind: "chain",
    desc: "甩出锁魂链缠住敌人，使其减速 3 秒",
    color: "#b48ce8", speed: 900, gravity: 240, damage: 25, blast: 60,
    cooldown: 2.5, icon: "soulchain", realm: "筑基", slowDur: 3, slowMul: 0.35,
    chainLen: 470,
  },
  // 金丹期：神通初成
  swordarray: {
    id: "swordarray", name: "万剑归宗", short: "万", era: "cultivation", kind: "swordrain",
    desc: "剑丸飞抵目标后，18 把飞剑从修仙者处腾空而起，呈剑雨落向目标区域，范围伤害",
    color: "#a8d8ff", speed: 760, gravity: 850, damage: 22, blast: 70,
    cooldown: 3.0, icon: "swordarray", realm: "金丹",
  },
  dragonpalm: {
    id: "dragonpalm", name: "降龙十八掌", short: "龙", era: "cultivation", kind: "boulder",
    desc: "掌力化龙，蜿蜒冲撞，命中后剧烈爆炸",
    color: "#ff8a5a", speed: 920, gravity: 880, damage: 80, blast: 130,
    cooldown: 2.8, icon: "dragonpalm", realm: "金丹",
  },
  // 元婴期：神识强大
  teleport: {
    id: "teleport", name: "瞬移", short: "瞬", era: "cultivation", kind: "buff",
    desc: "瞬间移动到指定位置，躲避攻击",
    color: "#6fe8ff", speed: 0, gravity: 0, damage: 0, blast: 0,
    cooldown: 5, icon: "teleport", realm: "元婴", buffType: "teleport",
  },
  poisonmist: {
    id: "poisonmist", name: "毒雾术", short: "毒", era: "cultivation", kind: "grenade",
    desc: "释放毒雾，使敌人中毒持续掉血",
    color: "#8aff6a", speed: 750, gravity: 900, damage: 20, blast: 80,
    fuse: 1.2, bounce: 0.3, cooldown: 3.5, icon: "poisonmist", realm: "元婴",
    poisonDur: 5, poisonDps: 8,
  },
  // 化神期：呼风唤雨
  heal: {
    id: "heal", name: "回春术", short: "春", era: "cultivation", kind: "buff",
    desc: "治疗全体友军，持续回血 5 秒",
    color: "#6affa8", speed: 0, gravity: 0, damage: 0, blast: 0,
    cooldown: 10, icon: "heal", realm: "化神", buffType: "heal", buffVal: 15, buffDur: 5,
  },
  storm: {
    id: "storm", name: "呼风唤雨", short: "风", era: "cultivation", kind: "grenade",
    desc: "召唤风暴，大范围减速并伤害敌人",
    color: "#6ac8ff", speed: 600, gravity: 800, damage: 40, blast: 150,
    fuse: 2.0, bounce: 0.2, cooldown: 4.0, icon: "storm", realm: "化神",
    slowDur: 4, slowMul: 0.3,
  },
  // 渡劫期：毁天灭地
  skylightning: {
    id: "skylightning", name: "天雷灭世", short: "灭", era: "cultivation", kind: "grenade",
    desc: "召唤九天神雷，毁灭一切",
    color: "#fff8c8", speed: 500, gravity: 700, damage: 120, blast: 180,
    fuse: 2.5, bounce: 0.2, cooldown: 5.0, icon: "skylightning", realm: "渡劫",
  },
  formation: {
    id: "formation", name: "诛仙阵", short: "诛", era: "cultivation", kind: "split",
    desc: "布下诛仙剑阵，万剑齐发，毁天灭地",
    color: "#ff6a9a", speed: 600, gravity: 800, damage: 45, blast: 80,
    cooldown: 4.5, icon: "formation", realm: "渡劫",
  },
  // 渡劫期：补天术（时空锚定：下一次敌方攻击后回溯到本回合状态）
  mend: {
    id: "mend", name: "补天术", short: "补", era: "cultivation", kind: "buff",
    desc: "锚定本回合时空；下一次敌方攻击后（无论场景毁坏或队友阵亡）回溯恢复",
    color: "#a8ffd8", speed: 0, gravity: 0, damage: 0, blast: 0,
    cooldown: 14, icon: "mend", realm: "渡劫", buffType: "mend",
  },
  // 渡劫期：搬山术（抛掷石块，落地放置金庚石平台）
  stonewall: {
    id: "stonewall", name: "搬山术", short: "山", era: "cultivation", kind: "boulder",
    desc: "抛掷巨石，落地后拔地而起形成金庚石平台，可阻挡敌人或垫脚",
    color: "#c8b8a8", speed: 780, gravity: 980, damage: 12, blast: 24,
    cooldown: 3.5, icon: "stonewall", realm: "渡劫",
  },
};

export const WEAPON_ORDER = [
  "spear", "boulder", "grenade", "banana", "spike", "boomerang", "meteor",
  "watermelon", "durian", "poisonshroom",
  "crossbow", "cannon", "firebomb", "flail", "flare",
  "rifle", "mortar", "rocket", "molotov", "cluster",
  "laser", "railgun", "drone", "gravity",
  "sword", "fireball", "thunder", "shieldcharm", "soulchain",
  "swordarray", "dragonpalm", "teleport", "poisonmist",
  "heal", "storm", "skylightning", "formation", "mend", "stonewall",
];

/**
 * 每个时代的阶段递进武器栏（从低到高解锁，最多 9 格）。
 * 第 1 阶段只给基础武器，第 2 阶段解锁该时代剩余武器。
 */
export const STAGE_WEAPONS = {
  stone: [
    ["spear", "boulder"],
    ["spear", "boulder", "grenade", "watermelon", "durian", "boomerang", "meteor"],
  ],
  iron: [
    ["crossbow", "cannon"],
    ["crossbow", "cannon", "firebomb", "flail", "flare", "spike", "meteor"],
  ],
  gun: [
    ["rifle", "mortar"],
    ["rifle", "rocket", "mortar", "molotov", "cluster", "grenade", "meteor"],
  ],
  mech: [
    ["laser", "drone"],
    ["laser", "railgun", "drone", "gravity", "rocket", "cannon", "meteor"],
  ],
};

/**
 * 修仙六大境界的递进技能表：从低到高逐境界解锁新神通。
 * 每境界武器栏保留核心旧技能 + 新增本境界技能（最多 9 格）。
 */
export const CULTIVATION_STAGES = [
  { name: "炼气", lv: 33, weapons: ["sword", "fireball"] },
  { name: "筑基", lv: 36, weapons: ["sword", "fireball", "thunder", "shieldcharm", "soulchain"] },
  { name: "金丹", lv: 40, weapons: ["sword", "fireball", "thunder", "shieldcharm", "soulchain", "swordarray", "dragonpalm"] },
  { name: "元婴", lv: 45, weapons: ["sword", "fireball", "thunder", "shieldcharm", "soulchain", "swordarray", "dragonpalm", "teleport", "poisonmist"] },
  { name: "化神", lv: 50, weapons: ["sword", "fireball", "thunder", "swordarray", "dragonpalm", "teleport", "poisonmist", "heal", "storm"] },
  { name: "渡劫", lv: 56, weapons: ["sword", "fireball", "dragonpalm", "teleport", "heal", "skylightning", "formation", "mend", "stonewall"] },
];
// 无限模式进入修仙时代时直接解锁到最高境界的技能池
STAGE_WEAPONS.cultivation = [CULTIVATION_STAGES[0].weapons, CULTIVATION_STAGES[CULTIVATION_STAGES.length - 1].weapons];

/** 每个时代的全部武器（兼容/全解锁作弊用；正常流程请按阶段解锁） */
export const ERA_WEAPONS = {
  stone: STAGE_WEAPONS.stone[1],
  iron: STAGE_WEAPONS.iron[1],
  gun: STAGE_WEAPONS.gun[1],
  mech: STAGE_WEAPONS.mech[1],
  cultivation: CULTIVATION_STAGES[CULTIVATION_STAGES.length - 1].weapons,
};

/** 关卡所处的阶段（时代 + 阶段索引 + 阶段名） */
export function stageIndexOf(level) {
  if (!level || level.endless) return null;
  const era = ERAS[level.era] || ERAS.stone;
  let idx = 0;
  (era.realms || []).forEach((r, i) => {
    const first = r.levels && r.levels.length ? r.levels[0] : Infinity;
    if (level.id >= first) idx = i;
  });
  return { era, index: idx, realm: era.realms ? era.realms[idx] : null };
}

/** 关卡的阶段名（如「部落期」「元婴期」），用于 UI 展示 */
export function stageNameOf(level) {
  const st = stageIndexOf(level);
  if (!st || !st.realm) return "";
  return st.realm.name;
}

/**
 * 根据关卡计算本局可用的递进武器栏：
 *   - 关卡自带 weapons（无限模式）优先；
 *   - 修仙时代按境界从低到高解锁；
 *   - 其他时代按阶段（原始期/部落期…）递进。
 */
export function weaponsForLevel(level) {
  if (!level) return [...ERA_WEAPONS.stone];
  if (level.weapons) return [...level.weapons];
  const st = stageIndexOf(level);
  const eraId = st ? st.era.id : "stone";
  if (eraId === "cultivation") {
    let cur = CULTIVATION_STAGES[0];
    for (const s of CULTIVATION_STAGES) if (level.id >= s.lv) cur = s;
    return [...cur.weapons];
  }
  const stages = STAGE_WEAPONS[eraId] || STAGE_WEAPONS.stone;
  return [...(stages[st.index] || stages[0])];
}

export const ERAS = {
  stone: {
    id: "stone", name: "石器时代", short: "石器", range: "1-8 关",
    accent: "#d8b06a", playerHp: 110,
    desc: "石矛与石弹，靠地形和蛮力取胜",
    realms: [
      { name: "原始期", levels: [1, 2, 3], weapon: "spear" },
      { name: "部落期", levels: [4, 5, 6, 7, 8], weapon: "boulder" },
    ],
  },
  iron: {
    id: "iron", name: "铁骑时代", short: "铁骑", range: "9-16 关",
    accent: "#9fb0c2", playerHp: 140,
    desc: "铁甲、弩炮与骑兵，爆炸范围更大",
    realms: [
      { name: "铁器初现", levels: [9, 10, 11], weapon: "crossbow" },
      { name: "重甲洪流", levels: [12, 13, 14, 15, 16], weapon: "cannon" },
    ],
  },
  gun: {
    id: "gun", name: "火器时代", short: "火器", range: "17-24 关",
    accent: "#ffa15c", playerHp: 180,
    desc: "火枪齐射、迫击炮覆盖与火箭轰炸",
    realms: [
      { name: "火药初鸣", levels: [17, 18, 19], weapon: "rifle" },
      { name: "炮火覆盖", levels: [20, 21, 22, 23, 24], weapon: "mortar" },
    ],
  },
  mech: {
    id: "mech", name: "机械时代", short: "机械", range: "25-32 关",
    accent: "#6fe8ff", playerHp: 220,
    desc: "激光与电磁炮，能贯穿整条战线",
    realms: [
      { name: "钢铁黎明", levels: [25, 26, 27], weapon: "laser" },
      { name: "电磁风暴", levels: [28, 29, 30, 31, 32], weapon: "railgun" },
    ],
  },
  cultivation: {
    id: "cultivation", name: "修仙时代", short: "修仙", range: "33-60 关",
    accent: "#c8a8ff", playerHp: 260,
    desc: "御剑飞行、雷法火术，神通广大",
    realms: [
      { name: "炼气期", levels: [33, 34, 35], weapon: "sword" },
      { name: "筑基期", levels: [36, 37, 38, 39], weapon: "fireball" },
      { name: "金丹期", levels: [40, 41, 42, 43, 44], weapon: "swordarray" },
      { name: "元婴期", levels: [45, 46, 47, 48, 49], weapon: "dragonpalm" },
      { name: "化神期", levels: [50, 51, 52, 53, 54, 55], weapon: "storm" },
      { name: "渡劫期", levels: [56, 57, 58, 59, 60], weapon: "skylightning" },
    ],
  },
};

export const ENEMY_TYPES = {
  // 石器
  grunt: { name: "野人", hp: 80, scale: 1, skin: "#c98a5a", cloth: "#8f3d33", aiBonus: 0 },
  thrower: { name: "投手", hp: 95, scale: 1.03, skin: "#bd7c50", cloth: "#6c3f7a", aiBonus: 0.08 },
  brute: { name: "蛮汉", hp: 125, scale: 1.12, skin: "#b8764a", cloth: "#7c2f2f", aiBonus: 0.02 },
  chief: { name: "酋长", hp: 165, scale: 1.2, skin: "#ce8f5f", cloth: "#a34c22", aiBonus: 0.12 },
  // 铁骑
  raider: { name: "铁骑", hp: 150, scale: 1.04, skin: "#cf9a6a", cloth: "#6f7b86", aiBonus: 0.1, mount: true },
  shield: { name: "重甲兵", hp: 195, scale: 1.12, skin: "#c08a5e", cloth: "#4c5866", aiBonus: 0.06 },
  // 火器
  gunner: { name: "火枪手", hp: 150, scale: 1.02, skin: "#d19b6c", cloth: "#7a2f2f", aiBonus: 0.14 },
  grenadier: { name: "掷弹兵", hp: 180, scale: 1.08, skin: "#c98d62", cloth: "#3f4d7a", aiBonus: 0.12 },
  // 机械
  mech: { name: "机甲兵", hp: 250, scale: 1.2, skin: "#8fb8c4", cloth: "#2e6f78", aiBonus: 0.16, visor: true },
  warlord: { name: "战争领主", hp: 340, scale: 1.3, skin: "#a6c6d6", cloth: "#7a2540", aiBonus: 0.2, visor: true },
  // 修仙
  cultivator: { name: "散修", hp: 200, scale: 1.05, skin: "#e8d8c8", cloth: "#5a4a8a", aiBonus: 0.18 },
  swordmaster: { name: "剑修", hp: 240, scale: 1.1, skin: "#d8c8b8", cloth: "#3a6a8a", aiBonus: 0.22 },
  taoist: { name: "符师", hp: 180, scale: 1.0, skin: "#e0d0c0", cloth: "#8a3a5a", aiBonus: 0.2 },
  immortal: { name: "仙人", hp: 380, scale: 1.25, skin: "#f0e8d8", cloth: "#c8a8ff", aiBonus: 0.26 },
};

export const THEMES = {
  dawn: {
    id: "dawn",
    sky: ["#282244", "#6e4156", "#d9784e", "#f5b76a"],
    sun: "#ffe3a6", sunGlow: "rgba(255,197,110,.45)",
    far: "#3b2b46", mid: "#2b2034", near: "#1c1624",
    dirt: ["#6a4730", "#4b3122", "#2e1e16"],
    grass: "#8a6738", grassLight: "#b08a4e",
    dirtLine: "rgba(255,220,170,.08)", mote: "rgba(255,220,160,.35)", night: false,
  },
  day: {
    id: "day",
    sky: ["#3d8fc4", "#7fc4dd", "#cfe6cf", "#f2e6b8"],
    sun: "#fff3b0", sunGlow: "rgba(255,246,190,.5)",
    far: "#5b7c74", mid: "#3f6457", near: "#27473d",
    dirt: ["#7a5434", "#583a25", "#35231a"],
    grass: "#6f9b49", grassLight: "#a3c66a",
    dirtLine: "rgba(255,240,200,.08)", mote: "rgba(255,255,220,.4)", night: false,
  },
  dusk: {
    id: "dusk",
    sky: ["#241f3f", "#5b3355", "#b0504a", "#e89a58"],
    sun: "#ffd0a0", sunGlow: "rgba(255,160,90,.4)",
    far: "#3b2940", mid: "#2a1e30", near: "#1a1320",
    dirt: ["#69422d", "#4a2d22", "#2a1a15"],
    grass: "#7c5f36", grassLight: "#a98148",
    dirtLine: "rgba(255,210,160,.08)", mote: "rgba(255,190,130,.35)", night: false,
  },
  night: {
    id: "night",
    sky: ["#070b18", "#111a33", "#1d2a46", "#31405b"],
    sun: "#dfe9ff", sunGlow: "rgba(190,215,255,.28)",
    far: "#1a2436", mid: "#131c2b", near: "#0c121c",
    dirt: ["#3f3a3e", "#2b272c", "#1a171c"],
    grass: "#4b5a56", grassLight: "#6d8079",
    dirtLine: "rgba(190,220,255,.07)", mote: "rgba(160,210,255,.45)", night: true,
  },
  volcano: {
    id: "volcano",
    sky: ["#1b0e14", "#43141c", "#7d251d", "#c24f27"],
    sun: "#ffb36b", sunGlow: "rgba(255,110,40,.4)",
    far: "#38151c", mid: "#251016", near: "#160a0f",
    dirt: ["#52302a", "#38201d", "#211310"],
    grass: "#6b3f2c", grassLight: "#8f5838",
    dirtLine: "rgba(255,150,80,.1)", mote: "rgba(255,140,60,.5)", night: true,
  },
  iron: {
    id: "iron",
    sky: ["#2b3038", "#4f5a64", "#8b8d84", "#c4b48e"],
    sun: "#f4e2b4", sunGlow: "rgba(240,220,170,.32)",
    far: "#3a4148", mid: "#2c3339", near: "#1d2227",
    dirt: ["#5d5044", "#443a31", "#2b241e"],
    grass: "#6d7350", grassLight: "#96975f",
    dirtLine: "rgba(230,235,220,.08)", mote: "rgba(230,230,220,.32)", night: false,
  },
  gun: {
    id: "gun",
    sky: ["#2a2024", "#5c3b33", "#9c6242", "#d39a5e"],
    sun: "#ffd28a", sunGlow: "rgba(255,180,90,.35)",
    far: "#45322e", mid: "#332524", near: "#221818",
    dirt: ["#62503f", "#49382b", "#2f231c"],
    grass: "#75704a", grassLight: "#9c8d58",
    dirtLine: "rgba(255,225,180,.08)", mote: "rgba(255,200,140,.38)", night: false,
  },
  mech: {
    id: "mech",
    sky: ["#050a14", "#0c1a2c", "#123346", "#1f5b68"],
    sun: "#9ff4ff", sunGlow: "rgba(90,220,255,.3)",
    far: "#122433", mid: "#0d1a26", near: "#08111a",
    dirt: ["#33424c", "#24313a", "#141d24"],
    grass: "#3d6266", grassLight: "#5e9297",
    dirtLine: "rgba(140,240,255,.1)", mote: "rgba(120,230,255,.5)", night: true,
  },
  cultivation: {
    id: "cultivation",
    sky: ["#0a0618", "#1c1038", "#3a1c5c", "#6a3a8a"],
    sun: "#e8d8ff", sunGlow: "rgba(200,160,255,.35)",
    far: "#2a1c40", mid: "#1c1230", near: "#100a1c",
    dirt: ["#4a3a5c", "#352845", "#1e1528"],
    grass: "#5a4a7a", grassLight: "#8a6aaa",
    dirtLine: "rgba(220,190,255,.1)", mote: "rgba(200,170,255,.5)", night: true,
  },
  // 修仙专属主题
  immortal: {
    id: "immortal",
    sky: ["#0c1a2e", "#1a3a5c", "#2a6a8a", "#4a9ab8"],
    sun: "#d8f4ff", sunGlow: "rgba(120,220,255,.4)",
    far: "#1a3048", mid: "#122438", near: "#0a1624",
    dirt: ["#3a5a6c", "#2a4454", "#1a2e3a"],
    grass: "#4a8a9a", grassLight: "#6ab8c8",
    dirtLine: "rgba(160,230,255,.12)", mote: "rgba(140,220,255,.55)", night: true,
  },
  swordgrave: {
    id: "swordgrave",
    sky: ["#140e1e", "#2a1a3a", "#4a2a5c", "#6a3a7a"],
    sun: "#e8c8ff", sunGlow: "rgba(200,140,255,.35)",
    far: "#2a1c38", mid: "#1e1428", near: "#120c1a",
    dirt: ["#4a3a52", "#362a40", "#201828"],
    grass: "#6a5a7a", grassLight: "#9a7aaa",
    dirtLine: "rgba(220,180,255,.1)", mote: "rgba(200,160,255,.5)", night: true,
  },
  spirit: {
    id: "spirit",
    sky: ["#0a1a14", "#143a2a", "#1e5c3a", "#2a8a4a"],
    sun: "#d8ffd8", sunGlow: "rgba(100,255,150,.35)",
    far: "#1a3828", mid: "#122a1e", near: "#0a1a12",
    dirt: ["#3a5a42", "#2a4432", "#1a2e22"],
    grass: "#4a9a5a", grassLight: "#6ac87a",
    dirtLine: "rgba(160,255,180,.1)", mote: "rgba(140,255,170,.5)", night: true,
  },
  penglai: {
    id: "penglai",
    sky: ["#0a1a2e", "#1a3a5c", "#2a5a8a", "#4a8ab8"],
    sun: "#fff4d8", sunGlow: "rgba(255,220,150,.4)",
    far: "#1a3048", mid: "#122438", near: "#0a1624",
    dirt: ["#4a6a7c", "#3a5464", "#2a3e4a"],
    grass: "#5a9a8a", grassLight: "#7ac8b8",
    dirtLine: "rgba(200,240,255,.12)", mote: "rgba(180,230,255,.55)", night: false,
  },
  palace: {
    id: "palace",
    sky: ["#1a0e2e", "#3a1a5c", "#5a2a8a", "#8a4ab8"],
    sun: "#ffe8d8", sunGlow: "rgba(255,200,150,.4)",
    far: "#2a1c40", mid: "#1e1430", near: "#120c1c",
    dirt: ["#5a4a6c", "#443854", "#2e2438"],
    grass: "#8a6a9a", grassLight: "#b88aca",
    dirtLine: "rgba(255,220,200,.1)", mote: "rgba(255,200,180,.5)", night: true,
  },
};

function makeLevel(id, era, name, goal, theme, style, seed, players, enemies, ai, par, turnLimit, windMax, hard) {
  return {
    id, era, name, goal, theme, style, seed,
    player: players.map((x) => ({ x })),
    enemies, ai, par, turnLimit, windMax,
    hard: !!hard,
  };
}

export const LEVELS = [
  // ============================================================ 石器时代 1-8
  // ---- 原始期（1-3）----
  makeLevel(1, "stone", "初次狩猎", "消灭对面落单的野人", "dawn", "hills", 11,
    [170, 246], [{ x: 1030, type: "grunt", hp: 70 }], 0.3, 2, 6, 2),
  makeLevel(2, "stone", "峡谷回声", "两两对决，把他们打下山崖", "day", "canyon", 21,
    [150, 230], [{ x: 1000, type: "grunt" }, { x: 1085, type: "grunt" }], 0.38, 4, 10, 3),
  makeLevel(3, "stone", "高台哨兵", "敌人占据高地，用抛物线教他下来", "dawn", "plateau", 31,
    [160, 250], [{ x: 960, type: "thrower" }, { x: 1060, type: "grunt" }], 0.45, 4, 10, 3.5),
  // ---- 部落期（4-8）----
  makeLevel(4, "stone", "落日部落", "三打二，别浪费手里的刺球", "dusk", "hills", 41,
    [140, 215, 288], [{ x: 980, type: "thrower" }, { x: 1075, type: "grunt" }], 0.48, 4, 10, 4),
  makeLevel(5, "stone", "蘑菇林地", "以少打多，利用地形和炸弹", "day", "forest", 51,
    [165, 250], [{ x: 900, type: "grunt" }, { x: 1000, type: "grunt" }, { x: 1095, type: "thrower" }], 0.5, 5, 12, 3),
  makeLevel(6, "stone", "石林迷阵", "玄铁巨柱挡路，绕过柱子炸掉对手", "dawn", "hills", 61,
    [150, 235, 315], [{ x: 950, type: "brute" }, { x: 1035, type: "thrower" }, { x: 1120, type: "chief" }], 0.54, 5, 13, 4.5, true),
  makeLevel(7, "stone", "岩原伏击", "先清两侧投手，再轰酋长", "dusk", "canyon", 71,
    [145, 225, 310], [{ x: 940, type: "thrower" }, { x: 1030, type: "brute" }, { x: 1115, type: "chief", hp: 200 }], 0.58, 6, 13, 5, true),
  makeLevel(8, "stone", "部落酋长", "酋长身披兽皮，全力击败他", "dusk", "fortress", 81,
    [150, 240], [{ x: 980, type: "chief", hp: 240 }, { x: 1080, type: "brute" }, { x: 1150, type: "thrower" }], 0.6, 6, 14, 4),

  // ============================================================ 铁骑时代 9-16
  // ---- 铁器初现（9-11）----
  makeLevel(9, "iron", "铁蹄初鸣", "铁甲骑兵正面压上，换铁弩试试", "dusk", "hills", 91,
    [150, 235], [{ x: 1010, type: "raider" }, { x: 1100, type: "raider" }], 0.5, 4, 11, 4),
  makeLevel(10, "iron", "铁壁要塞", "重甲兵躲在城垛后，用加农炮拆墙", "day", "fortress", 101,
    [150, 235, 310], [{ x: 980, type: "shield" }, { x: 1080, type: "raider" }], 0.54, 5, 12, 3),
  makeLevel(11, "iron", "悬崖铁桥", "隔崖互轰，火油弹会反弹", "dusk", "bridge", 111,
    [150, 235], [{ x: 1000, type: "raider" }, { x: 1090, type: "shield" }], 0.56, 5, 11, 4.5),
  // ---- 重甲洪流（12-16）----
  makeLevel(12, "iron", "铁甲洪流", "三名铁甲敌人，炮弹要落在人群里", "night", "cave", 121,
    [145, 225, 305], [{ x: 940, type: "raider" }, { x: 1025, type: "shield" }, { x: 1110, type: "raider" }], 0.6, 5, 12, 5),
  makeLevel(13, "iron", "铁石要塞", "玄铁城垛炸不动，用火油弹灌进去", "day", "fortress", 131,
    [150, 235], [{ x: 975, type: "shield" }, { x: 1060, type: "raider" }, { x: 1140, type: "raider" }, { x: 1020, type: "shield", hp: 230 }], 0.62, 6, 14, 4, true),
  makeLevel(14, "iron", "断崖铁门", "玄铁桥墩炸不坏，隔崖互轰", "dusk", "bridge", 141,
    [150, 235, 310], [{ x: 995, type: "raider" }, { x: 1075, type: "shield", hp: 240 }, { x: 1150, type: "raider" }], 0.64, 6, 14, 5, true),
  makeLevel(15, "iron", "铁骑首领", "首领身披重甲，先清骑兵再集火", "dusk", "fortress", 151,
    [150, 240], [{ x: 980, type: "warlord", hp: 220 }, { x: 1080, type: "raider" }, { x: 1150, type: "shield" }], 0.66, 6, 13, 4),
  makeLevel(16, "iron", "铁壁终局", "重甲洪流最后的防线", "night", "cave", 161,
    [145, 225, 305], [{ x: 930, type: "shield", hp: 260 }, { x: 1010, type: "raider" }, { x: 1090, type: "shield", hp: 260 }, { x: 1160, type: "raider" }], 0.68, 7, 15, 5, true),

  // ============================================================ 火器时代 17-24
  // ---- 火药初鸣（17-19）----
  makeLevel(17, "gun", "火枪齐射", "火枪手射速很快，别站着不动", "day", "trench", 171,
    [150, 235], [{ x: 1000, type: "gunner" }, { x: 1090, type: "gunner" }], 0.6, 4, 11, 3),
  makeLevel(18, "gun", "硝烟战壕", "躲在战壕里，用迫击炮吊射", "dusk", "trench", 181,
    [150, 230, 310], [{ x: 950, type: "gunner" }, { x: 1030, type: "grenadier" }, { x: 1110, type: "shield" }], 0.64, 5, 12, 4),
  makeLevel(19, "gun", "炮火覆盖", "夜里先看清落点，再决定开火", "night", "hills", 191,
    [145, 225, 305], [{ x: 940, type: "gunner" }, { x: 1020, type: "gunner" }, { x: 1100, type: "grenadier" }], 0.66, 5, 12, 5),
  // ---- 炮火覆盖（20-24）----
  makeLevel(20, "gun", "空袭警报", "火箭弹飞行很快，注意躲开对方的弹道", "day", "dunes", 201,
    [150, 230], [{ x: 980, type: "grenadier" }, { x: 1060, type: "gunner" }, { x: 1140, type: "gunner" }], 0.68, 5, 12, 4),
  makeLevel(21, "gun", "火药要塞", "四方守军，把要塞连同守军一起炸开", "volcano", "fortress", 211,
    [150, 235, 310], [{ x: 930, type: "gunner" }, { x: 1000, type: "grenadier" }, { x: 1070, type: "shield", hp: 220 }, { x: 1150, type: "gunner" }], 0.7, 6, 14, 5),
  makeLevel(22, "gun", "钢柱战壕", "玄铁立柱封路，火枪齐射别的缝", "night", "trench", 221,
    [150, 235], [{ x: 960, type: "gunner" }, { x: 1040, type: "grenadier" }, { x: 1120, type: "shield", hp: 260 }, { x: 1175, type: "gunner" }], 0.72, 7, 15, 4.5, true),
  makeLevel(23, "gun", "硝石峡谷", "风大坑深，火箭弹别打偏", "dusk", "canyon", 231,
    [145, 225, 305], [{ x: 930, type: "grenadier" }, { x: 1020, type: "gunner" }, { x: 1100, type: "gunner" }, { x: 1170, type: "grenadier" }], 0.74, 7, 15, 7, true),
  makeLevel(24, "gun", "炮火终局", "火器时代最后的防线", "volcano", "pyramid", 241,
    [145, 225, 305], [{ x: 920, type: "warlord", hp: 300 }, { x: 1000, type: "grenadier" }, { x: 1080, type: "gunner" }, { x: 1160, type: "grenadier" }], 0.78, 8, 16, 6, true),

  // ============================================================ 机械时代 25-32
  // ---- 钢铁黎明（25-27）----
  makeLevel(25, "mech", "钢铁黎明", "机甲兵装甲厚重，激光炮可以连射", "night", "pyramid", 251,
    [150, 235], [{ x: 960, type: "mech", hp: 220 }, { x: 1050, type: "gunner" }, { x: 1130, type: "mech", hp: 220 }], 0.7, 6, 13, 4),
  makeLevel(26, "mech", "熔炉核心", "火山口地形狭窄，电磁炮能贯穿一排", "volcano", "volcano", 261,
    [150, 230, 310], [{ x: 930, type: "mech", hp: 230 }, { x: 1010, type: "grenadier" }, { x: 1100, type: "mech", hp: 230 }], 0.74, 6, 14, 5),
  makeLevel(27, "mech", "电磁风暴", "强风沙丘，激光不受风影响", "night", "dunes", 271,
    [150, 235, 315], [{ x: 940, type: "mech" }, { x: 1030, type: "mech" }, { x: 1120, type: "raider" }, { x: 1180, type: "gunner" }], 0.76, 7, 15, 8),
  // ---- 电磁风暴（28-32）----
  makeLevel(28, "mech", "机械军团", "四台机甲列阵，找准贯穿角度", "night", "bridge", 281,
    [150, 230, 310], [{ x: 900, type: "mech" }, { x: 980, type: "mech" }, { x: 1060, type: "grenadier" }, { x: 1140, type: "mech" }], 0.8, 7, 15, 6),
  makeLevel(29, "mech", "电磁要塞", "重装机甲守城，贯穿角度是关键", "night", "fortress", 291,
    [150, 235, 310], [{ x: 940, type: "mech", hp: 260 }, { x: 1030, type: "mech", hp: 260 }, { x: 1120, type: "warlord", hp: 320 }, { x: 990, type: "gunner" }], 0.82, 8, 16, 5, true),
  makeLevel(30, "mech", "终局裂谷", "双领主与电磁卫队，最后决战", "volcano", "volcano", 301,
    [145, 225, 305], [{ x: 900, type: "warlord", hp: 340 }, { x: 985, type: "mech", hp: 260 }, { x: 1070, type: "mech", hp: 260 }, { x: 1155, type: "grenadier" }], 0.86, 9, 18, 8, true),
  makeLevel(31, "mech", "机械终焉", "战争领主与机甲卫队，最后一战", "volcano", "pyramid", 311,
    [145, 225, 305], [
      { x: 900, type: "warlord", hp: 300 },
      { x: 980, type: "mech", hp: 240 },
      { x: 1050, type: "mech", hp: 240 },
      { x: 1120, type: "mech", hp: 240 },
      { x: 1180, type: "gunner", hp: 180 },
    ], 0.88, 9, 18, 7, true),
  makeLevel(32, "mech", "钢铁挽歌", "机械时代的终章，全力以赴", "night", "cave", 321,
    [145, 225, 305], [
      { x: 900, type: "mech", hp: 280 },
      { x: 980, type: "warlord", hp: 360 },
      { x: 1060, type: "mech", hp: 280 },
      { x: 1140, type: "grenadier" },
    ], 0.9, 9, 18, 8, true),

  // ============================================================ 修仙时代 33-60
  // ---- 炼气期（33-35）：基础攻击 ----
  makeLevel(33, "cultivation", "初入仙门", "散修拦路，御剑诀试试手", "cultivation", "floatpeak", 331,
    [150, 235], [{ x: 980, type: "cultivator" }, { x: 1070, type: "cultivator" }], 0.6, 5, 12, 4),
  makeLevel(34, "cultivation", "灵气初现", "感应天地灵气，火球术轰碎敌阵", "cultivation", "spiritvalley", 341,
    [150, 230, 310], [{ x: 950, type: "cultivator" }, { x: 1040, type: "cultivator" }, { x: 1120, type: "taoist" }], 0.64, 6, 13, 5),
  makeLevel(35, "cultivation", "御剑飞行", "剑修出剑极快，别站直线", "immortal", "swordgrave", 351,
    [150, 235], [{ x: 960, type: "cultivator" }, { x: 1050, type: "swordmaster" }, { x: 1130, type: "cultivator" }], 0.68, 6, 14, 4.5),
  // ---- 筑基期（36-39）：防御与控制 ----
  makeLevel(36, "cultivation", "护体符光", "符师拦路，用护体符挡住伤害", "swordgrave", "swordgrave", 361,
    [150, 235], [{ x: 960, type: "taoist" }, { x: 1050, type: "swordmaster" }, { x: 1130, type: "cultivator" }], 0.7, 6, 14, 4.5),
  makeLevel(37, "cultivation", "锁魂链阵", "锁魂链减速敌人，逐个击破", "spirit", "spiritvalley", 371,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.72, 7, 15, 6),
  makeLevel(38, "cultivation", "雷符天降", "符师引动天雷，小心雷符落地", "immortal", "floatpeak", 381,
    [150, 230, 310], [{ x: 930, type: "taoist" }, { x: 1010, type: "taoist" }, { x: 1090, type: "swordmaster" }, { x: 1160, type: "cultivator" }], 0.74, 7, 16, 6.5),
  makeLevel(39, "cultivation", "筑基圆满", "筑基期最后的试炼", "palace", "palace", 391,
    [145, 225, 305], [{ x: 920, type: "swordmaster" }, { x: 1000, type: "taoist" }, { x: 1080, type: "swordmaster" }, { x: 1160, type: "cultivator" }], 0.76, 8, 16, 6),
  // ---- 金丹期（40-44）：神通初成 ----
  makeLevel(40, "cultivation", "万剑归宗", "敌方剑阵密集，用万剑归宗对轰", "swordgrave", "spiritvalley", 401,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.76, 7, 15, 6),
  makeLevel(41, "cultivation", "龙吟九天", "仙人座下护法，龙形掌力惊人", "palace", "palace", 411,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 360 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "swordmaster" }], 0.8, 8, 17, 7),
  makeLevel(42, "cultivation", "金丹大道", "金丹期修士法力无边", "immortal", "floatpeak", 421,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 380 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "cultivator" }], 0.82, 8, 17, 7),
  makeLevel(43, "cultivation", "剑冢悟道", "巨剑插地，在剑冢中领悟剑意", "swordgrave", "swordgrave", 431,
    [150, 235], [{ x: 960, type: "taoist" }, { x: 1050, type: "swordmaster" }, { x: 1130, type: "cultivator" }], 0.84, 8, 16, 5),
  makeLevel(44, "cultivation", "蓬莱仙岛", "海上仙岛，灵气缭绕", "penglai", "penglai", 441,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 320 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "cultivator" }], 0.86, 8, 17, 7),
  // ---- 元婴期（45-49）：神识强大 ----
  makeLevel(45, "cultivation", "元婴出窍", "元婴期修士神识强大，瞬移躲避", "spirit", "spiritvalley", 451,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.84, 8, 16, 6),
  makeLevel(46, "cultivation", "毒雾弥漫", "毒雾术让敌人持续掉血", "immortal", "floatpeak", 461,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 400 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "cultivator" }], 0.86, 8, 17, 7),
  makeLevel(47, "cultivation", "天宫台阶", "天宫台阶，层层递进", "palace", "palace", 471,
    [150, 235], [{ x: 960, type: "cultivator" }, { x: 1040, type: "swordmaster" }, { x: 1120, type: "taoist" }], 0.88, 8, 16, 5),
  makeLevel(48, "cultivation", "元婴神通", "元婴期修士神通广大", "swordgrave", "swordgrave", 481,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 420 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "swordmaster" }], 0.88, 9, 18, 7),
  makeLevel(49, "cultivation", "元婴圆满", "元婴期最后的试炼", "penglai", "penglai", 491,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 440 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.9, 9, 18, 8),
  // ---- 化神期（50-55）：呼风唤雨 ----
  makeLevel(50, "cultivation", "呼风唤雨", "化神期修士呼风唤雨，风暴降临", "spirit", "spiritvalley", 501,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.88, 8, 16, 6),
  makeLevel(51, "cultivation", "回春之术", "回春术治疗友军，持续作战", "immortal", "floatpeak", 511,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 460 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "cultivator" }], 0.9, 9, 18, 7),
  makeLevel(52, "cultivation", "化神大道", "化神期修士法力通天", "palace", "palace", 521,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 480 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }], 0.9, 9, 18, 8),
  makeLevel(53, "cultivation", "灵脉风暴", "灵脉峡谷中风暴肆虐", "spirit", "spiritvalley", 531,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 500 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.92, 9, 18, 8),
  makeLevel(54, "cultivation", "仙岛风暴", "蓬莱仙岛风暴来袭", "penglai", "penglai", 541,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 520 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.92, 10, 20, 8),
  makeLevel(55, "cultivation", "化神圆满", "化神期最后的试炼", "swordgrave", "swordgrave", 551,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 540 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.94, 10, 20, 8),
  // ---- 渡劫期（56-60）：毁天灭地 ----
  makeLevel(56, "cultivation", "天雷灭世", "渡劫期修士引动天雷，毁灭一切", "immortal", "floatpeak", 561,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 560 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.94, 10, 20, 8),
  makeLevel(57, "cultivation", "诛仙阵起", "诛仙剑阵，万剑齐发", "swordgrave", "spiritvalley", 571,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 580 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.95, 10, 20, 8),
  makeLevel(58, "cultivation", "渡劫天威", "渡劫期修士天威难测", "palace", "palace", 581,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 600 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.96, 10, 20, 8),
  makeLevel(59, "cultivation", "飞升之路", "飞升前的最后考验", "penglai", "penglai", 591,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 620 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.97, 10, 20, 8),
  makeLevel(60, "cultivation", "仙人降临", "仙人法力无边，全力一战", "immortal", "penglai", 601,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 650 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.98, 10, 20, 8),
];

/** 根据关卡与武器栏生成弹药：首个武器无限，其余按关卡递增 */
export function ammoFor(level, ids) {
  const ammo = {};
  const lv = level.endless ? 20 : level.id;
  ids.forEach((id, i) => {
    if (level.ammo && level.ammo[id] !== undefined) {
      ammo[id] = level.ammo[id];
      return;
    }
    if (i === 0) ammo[id] = Infinity;
    else if (id === "meteor" || id === "railgun") ammo[id] = 1 + Math.floor(lv / 7);
    else if (id === "rocket" || id === "mortar" || id === "cannon" || id === "gravity" || id === "drone") ammo[id] = 2 + Math.floor(lv / 6);
    else if (id === "cluster" || id === "molotov" || id === "watermelon") ammo[id] = 2 + Math.floor(lv / 5);
    else ammo[id] = 3 + Math.floor(lv / 4);
  });
  return ammo;
}

export function getLevel(id) {
  return LEVELS.find((lv) => lv.id === id) || LEVELS[0];
}

export function getEra(id) {
  return ERAS[id] || ERAS.stone;
}

/** 无限模式：从石器时代开始，随波次递进时代、敌人、场景与难度 */
export function getEndlessLevel() {
  return {
    id: 0,
    era: "stone",
    name: "无限模式",
    goal: "从石器时代开始，敌人随波次变强，看看你能撑到第几波",
    theme: "dawn",
    style: "hills",
    seed: 777,
    player: [{ x: 140 }, { x: 220 }, { x: 300 }],
    enemies: [
      { x: 1000, type: "grunt" },
      { x: 1100, type: "grunt" },
    ],
    weapons: ERA_WEAPONS.stone,
    ammo: {
      spear: Infinity, boulder: 3, grenade: 3, banana: 2,
      spike: 2, boomerang: 2, meteor: 1,
    },
    windMax: 3,
    ai: 0.3,
    endless: true,
  };
}

/** 无限模式时代递进表：每 2 波提升一个时代 */
export const ENDLESS_ERAS = [
  { era: "stone", theme: "dawn", ai: 0.3, windMax: 3, hpMul: 1.0, enemies: ["grunt", "thrower", "brute"] },
  { era: "iron", theme: "day", ai: 0.45, windMax: 4, hpMul: 1.2, enemies: ["raider", "shield", "brute", "chief"] },
  { era: "gun", theme: "dusk", ai: 0.58, windMax: 5, hpMul: 1.45, enemies: ["gunner", "grenadier", "shield", "chief"] },
  { era: "mech", theme: "night", ai: 0.72, windMax: 6, hpMul: 1.7, enemies: ["mech", "gunner", "grenadier", "warlord"] },
  { era: "cultivation", theme: "cultivation", ai: 0.82, windMax: 7, hpMul: 2.0, enemies: ["cultivator", "swordmaster", "taoist", "immortal"] },
];

/** 根据波次获取当前时代配置（每 2 波递进） */
export function getEndlessEra(wave) {
  const idx = Math.min(ENDLESS_ERAS.length - 1, Math.floor((wave - 1) / 2));
  return ENDLESS_ERAS[idx];
}
