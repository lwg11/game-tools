/**
 * 《石器大战》关卡、时代与数值配置
 * ------------------------------------------------------------
 * 游戏路线：
 *   石器时代（1-5 关）  石矛、石弹、火雷，靠蛮力和地形
 *   铁骑时代（6-10 关） 铁弩、加农炮、火油弹，重甲与骑兵登场
 *   火器时代（11-15 关）火枪、迫击炮、火箭弹，射程与爆炸范围升级
 *   机械时代（16-20 关）激光炮、电磁炮，穿透与高伤害
 *   进阶关卡（21-28 关）每个时代再加两关：玄铁岩炸不坏，难度与敌人同步提升
 * 每关目标均为「消灭全部敌人」，par 为三星回合数。
 * 21+ 关引入玄铁岩（炸不坏）与玄铁地基，防止后期战场被炸穿后失去可玩性。
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

  // ------------------------------------------------------------ 修仙时代
  sword: {
    id: "sword", name: "飞剑", short: "剑", era: "cultivation", kind: "spear",
    desc: "御剑飞行，直线穿透敌人",
    color: "#e8f4ff", speed: 1800, gravity: 0, damage: 42, blast: 24,
    cooldown: 0.45, pierce: true, icon: "sword",
  },
  fireball: {
    id: "fireball", name: "火球术", short: "火", era: "cultivation", kind: "boulder",
    desc: "抛射火球，爆炸后留下火海",
    color: "#ff6a3a", speed: 860, gravity: 900, damage: 58, blast: 92,
    cooldown: 1.6, icon: "fireball",
  },
  thunder: {
    id: "thunder", name: "雷符", short: "雷", era: "cultivation", kind: "grenade",
    desc: "落地后召唤天雷，大范围高伤害",
    color: "#ffe95c", speed: 780, gravity: 950, damage: 72, blast: 120,
    fuse: 1.8, bounce: 0.3, cooldown: 2.4, icon: "thunder",
  },
  swordarray: {
    id: "swordarray", name: "万剑归宗", short: "万", era: "cultivation", kind: "split",
    desc: "召唤 8 把飞剑，覆盖大片区域",
    color: "#a8d8ff", speed: 700, gravity: 850, damage: 28, blast: 56,
    cooldown: 3.0, icon: "swordarray",
  },
  dragonpalm: {
    id: "dragonpalm", name: "降龙十八掌", short: "龙", era: "cultivation", kind: "boulder",
    desc: "掌力化龙，命中后剧烈爆炸",
    color: "#ff8a5a", speed: 920, gravity: 880, damage: 80, blast: 130,
    cooldown: 2.8, icon: "dragonpalm",
  },
  shieldcharm: {
    id: "shieldcharm", name: "护体符", short: "护", era: "cultivation", kind: "spear",
    desc: "短距离护体金光，可弹开敌人",
    color: "#ffd25e", speed: 1200, gravity: 200, damage: 25, blast: 40,
    cooldown: 1.2, icon: "shieldcharm",
  },
  soulchain: {
    id: "soulchain", name: "锁魂链", short: "锁", era: "cultivation", kind: "spike",
    desc: "贴地锁链，碰到敌人爆炸并减速",
    color: "#b48ce8", speed: 700, gravity: 1100, damage: 45, blast: 70,
    cooldown: 2.0, icon: "soulchain",
  },
};

export const WEAPON_ORDER = [
  "spear", "boulder", "grenade", "banana", "spike", "boomerang", "meteor",
  "watermelon", "durian", "poisonshroom",
  "crossbow", "cannon", "firebomb", "flail", "flare",
  "rifle", "mortar", "rocket", "molotov", "cluster",
  "laser", "railgun", "drone", "gravity",
  "sword", "fireball", "thunder", "swordarray", "dragonpalm", "shieldcharm", "soulchain",
];

/** 每个时代的默认武器栏（最多 7 格） */
export const ERA_WEAPONS = {
  stone: ["spear", "boulder", "grenade", "watermelon", "durian", "boomerang", "meteor"],
  iron: ["crossbow", "cannon", "firebomb", "flail", "flare", "spike", "meteor"],
  gun: ["rifle", "rocket", "mortar", "molotov", "cluster", "grenade", "meteor"],
  mech: ["laser", "railgun", "drone", "gravity", "rocket", "cannon", "meteor"],
  cultivation: ["sword", "fireball", "thunder", "swordarray", "dragonpalm", "shieldcharm", "soulchain"],
};

export const ERAS = {
  stone: {
    id: "stone", name: "石器时代", short: "石器", range: "1-5 关",
    accent: "#d8b06a", playerHp: 110,
    desc: "石矛与石弹，靠地形和蛮力取胜",
  },
  iron: {
    id: "iron", name: "铁骑时代", short: "铁骑", range: "6-10 关",
    accent: "#9fb0c2", playerHp: 140,
    desc: "铁甲、弩炮与骑兵，爆炸范围更大",
  },
  gun: {
    id: "gun", name: "火器时代", short: "火器", range: "11-15 关",
    accent: "#ffa15c", playerHp: 180,
    desc: "火枪齐射、迫击炮覆盖与火箭轰炸",
  },
  mech: {
    id: "mech", name: "机械时代", short: "机械", range: "16-20 关",
    accent: "#6fe8ff", playerHp: 220,
    desc: "激光与电磁炮，能贯穿整条战线",
  },
  cultivation: {
    id: "cultivation", name: "修仙时代", short: "修仙", range: "29-38 关",
    accent: "#c8a8ff", playerHp: 260,
    desc: "御剑飞行、雷法火术，神通广大",
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
  // ------------------------------------------------------------ 石器时代 1-5
  makeLevel(1, "stone", "初次狩猎", "消灭对面落单的野人", "dawn", "hills", 11,
    [170, 246], [{ x: 1030, type: "grunt", hp: 70 }], 0.3, 2, 6, 2),
  makeLevel(2, "stone", "峡谷回声", "两两对决，把他们打下山崖", "day", "canyon", 21,
    [150, 230], [{ x: 1000, type: "grunt" }, { x: 1085, type: "grunt" }], 0.38, 4, 10, 3),
  makeLevel(3, "stone", "高台哨兵", "敌人占据高地，用抛物线教他下来", "dawn", "plateau", 31,
    [160, 250], [{ x: 960, type: "thrower" }, { x: 1060, type: "grunt" }], 0.45, 4, 10, 3.5),
  makeLevel(4, "stone", "落日部落", "三打二，别浪费手里的刺球", "dusk", "hills", 41,
    [140, 215, 288], [{ x: 980, type: "thrower" }, { x: 1075, type: "grunt" }], 0.48, 4, 10, 4),
  makeLevel(5, "stone", "蘑菇林地", "以少打多，利用地形和炸弹", "day", "forest", 51,
    [165, 250], [{ x: 900, type: "grunt" }, { x: 1000, type: "grunt" }, { x: 1095, type: "thrower" }], 0.5, 5, 12, 3),

  // ------------------------------------------------------------ 铁骑时代 6-10
  makeLevel(6, "iron", "铁蹄初鸣", "铁甲骑兵正面压上，换铁弩试试", "dusk", "hills", 61,
    [150, 235], [{ x: 1010, type: "raider" }, { x: 1100, type: "raider" }], 0.5, 4, 11, 4),
  makeLevel(7, "iron", "铁壁要塞", "重甲兵躲在城垛后，用加农炮拆墙", "day", "fortress", 71,
    [150, 235, 310], [{ x: 980, type: "shield" }, { x: 1080, type: "raider" }], 0.54, 5, 12, 3),
  makeLevel(8, "iron", "悬崖铁桥", "隔崖互轰，火油弹会反弹", "dusk", "bridge", 81,
    [150, 235], [{ x: 1000, type: "raider" }, { x: 1090, type: "shield" }], 0.56, 5, 11, 4.5),
  makeLevel(9, "iron", "铁甲洪流", "三名铁甲敌人，炮弹要落在人群里", "night", "cave", 91,
    [145, 225, 305], [{ x: 940, type: "raider" }, { x: 1025, type: "shield" }, { x: 1110, type: "raider" }], 0.6, 5, 12, 5),
  makeLevel(10, "iron", "铁骑首领", "首领身披重甲，先清骑兵再集火", "dusk", "fortress", 101,
    [150, 240], [{ x: 980, type: "warlord", hp: 220 }, { x: 1080, type: "raider" }, { x: 1150, type: "shield" }], 0.62, 6, 13, 4),

  // ------------------------------------------------------------ 火器时代 11-15
  makeLevel(11, "gun", "火枪齐射", "火枪手射速很快，别站着不动", "day", "trench", 111,
    [150, 235], [{ x: 1000, type: "gunner" }, { x: 1090, type: "gunner" }], 0.6, 4, 11, 3),
  makeLevel(12, "gun", "硝烟战壕", "躲在战壕里，用迫击炮吊射", "dusk", "trench", 121,
    [150, 230, 310], [{ x: 950, type: "gunner" }, { x: 1030, type: "grenadier" }, { x: 1110, type: "shield" }], 0.64, 5, 12, 4),
  makeLevel(13, "gun", "炮火覆盖", "夜里先看清落点，再决定开火", "night", "hills", 131,
    [145, 225, 305], [{ x: 940, type: "gunner" }, { x: 1020, type: "gunner" }, { x: 1100, type: "grenadier" }], 0.66, 5, 12, 5),
  makeLevel(14, "gun", "空袭警报", "火箭弹飞行很快，注意躲开对方的弹道", "day", "dunes", 141,
    [150, 230], [{ x: 980, type: "grenadier" }, { x: 1060, type: "gunner" }, { x: 1140, type: "gunner" }], 0.68, 5, 12, 4),
  makeLevel(15, "gun", "火药要塞", "四方守军，把要塞连同守军一起炸开", "volcano", "fortress", 151,
    [150, 235, 310], [{ x: 930, type: "gunner" }, { x: 1000, type: "grenadier" }, { x: 1070, type: "shield", hp: 220 }, { x: 1150, type: "gunner" }], 0.7, 6, 14, 5),

  // ------------------------------------------------------------ 机械时代 16-20
  makeLevel(16, "mech", "钢铁黎明", "机甲兵装甲厚重，激光炮可以连射", "night", "pyramid", 161,
    [150, 235], [{ x: 960, type: "mech", hp: 220 }, { x: 1050, type: "gunner" }, { x: 1130, type: "mech", hp: 220 }], 0.7, 6, 13, 4),
  makeLevel(17, "mech", "熔炉核心", "火山口地形狭窄，电磁炮能贯穿一排", "volcano", "volcano", 171,
    [150, 230, 310], [{ x: 930, type: "mech", hp: 230 }, { x: 1010, type: "grenadier" }, { x: 1100, type: "mech", hp: 230 }], 0.74, 6, 14, 5),
  makeLevel(18, "mech", "电磁风暴", "强风沙丘，激光不受风影响", "night", "dunes", 181,
    [150, 235, 315], [{ x: 940, type: "mech" }, { x: 1030, type: "mech" }, { x: 1120, type: "raider" }, { x: 1180, type: "gunner" }], 0.76, 7, 15, 8),
  makeLevel(19, "mech", "机械军团", "四台机甲列阵，找准贯穿角度", "night", "bridge", 191,
    [150, 230, 310], [{ x: 900, type: "mech" }, { x: 980, type: "mech" }, { x: 1060, type: "grenadier" }, { x: 1140, type: "mech" }], 0.8, 7, 15, 6),
  makeLevel(20, "mech", "终焉之战", "战争领主与机甲卫队，最后一战", "volcano", "pyramid", 201,
    [145, 225, 305], [
      { x: 900, type: "warlord", hp: 300 },
      { x: 980, type: "mech", hp: 240 },
      { x: 1050, type: "mech", hp: 240 },
      { x: 1120, type: "mech", hp: 240 },
      { x: 1180, type: "gunner", hp: 180 },
    ], 0.84, 8, 18, 7),

  // ------------------------------------------------------------ 进阶关卡 21-28（玄铁岩：炸不动）
  makeLevel(21, "stone", "石林迷阵", "玄铁巨柱挡路，绕过柱子炸掉对手", "dawn", "hills", 211,
    [150, 235, 315], [{ x: 950, type: "brute" }, { x: 1035, type: "thrower" }, { x: 1120, type: "chief" }], 0.58, 5, 13, 4.5, true),
  makeLevel(22, "stone", "岩原伏击", "先清两侧投手，再轰酋长", "dusk", "canyon", 221,
    [145, 225, 310], [{ x: 940, type: "thrower" }, { x: 1030, type: "brute" }, { x: 1115, type: "chief", hp: 200 }], 0.6, 6, 13, 5, true),
  makeLevel(23, "iron", "铁石要塞", "玄铁城垛炸不动，用火油弹灌进去", "day", "fortress", 231,
    [150, 235], [{ x: 975, type: "shield" }, { x: 1060, type: "raider" }, { x: 1140, type: "raider" }, { x: 1020, type: "shield", hp: 230 }], 0.66, 6, 14, 4, true),
  makeLevel(24, "iron", "断崖铁门", "玄铁桥墩炸不坏，隔崖互轰", "dusk", "bridge", 241,
    [150, 235, 310], [{ x: 995, type: "raider" }, { x: 1075, type: "shield", hp: 240 }, { x: 1150, type: "raider" }], 0.68, 6, 14, 5, true),
  makeLevel(25, "gun", "钢柱战壕", "玄铁立柱封路，火枪齐射别的缝", "night", "trench", 251,
    [150, 235], [{ x: 960, type: "gunner" }, { x: 1040, type: "grenadier" }, { x: 1120, type: "shield", hp: 260 }, { x: 1175, type: "gunner" }], 0.72, 7, 15, 4.5, true),
  makeLevel(26, "gun", "硝石峡谷", "风大坑深，火箭弹别打偏", "dusk", "canyon", 261,
    [145, 225, 305], [{ x: 930, type: "grenadier" }, { x: 1020, type: "gunner" }, { x: 1100, type: "gunner" }, { x: 1170, type: "grenadier" }], 0.74, 7, 15, 7, true),
  makeLevel(27, "mech", "电磁要塞", "重装机甲守城，贯穿角度是关键", "night", "fortress", 271,
    [150, 235, 310], [{ x: 940, type: "mech", hp: 260 }, { x: 1030, type: "mech", hp: 260 }, { x: 1120, type: "warlord", hp: 320 }, { x: 990, type: "gunner" }], 0.82, 8, 16, 5, true),
  makeLevel(28, "mech", "终局裂谷", "双领主与电磁卫队，最后决战", "volcano", "volcano", 281,
    [145, 225, 305], [{ x: 900, type: "warlord", hp: 340 }, { x: 985, type: "mech", hp: 260 }, { x: 1070, type: "mech", hp: 260 }, { x: 1155, type: "grenadier" }], 0.88, 9, 18, 8, true),

  // ------------------------------------------------------------ 修仙时代 29-38（10 关）
  makeLevel(29, "cultivation", "初入仙门", "散修拦路，御剑诀试试手", "cultivation", "floatpeak", 291,
    [150, 235], [{ x: 980, type: "cultivator" }, { x: 1070, type: "cultivator" }], 0.6, 5, 12, 4),
  makeLevel(30, "cultivation", "剑修对决", "剑修出剑极快，别站直线", "immortal", "swordgrave", 301,
    [150, 230, 310], [{ x: 950, type: "swordmaster" }, { x: 1040, type: "cultivator" }, { x: 1120, type: "taoist" }], 0.64, 6, 13, 5),
  makeLevel(31, "cultivation", "剑冢悟道", "巨剑插地，在剑冢中领悟剑意", "swordgrave", "swordgrave", 311,
    [150, 235], [{ x: 960, type: "taoist" }, { x: 1050, type: "swordmaster" }, { x: 1130, type: "cultivator" }], 0.68, 6, 14, 4.5),
  makeLevel(32, "cultivation", "灵脉峡谷", "灵脉涌动，峡谷中灵气充沛", "spirit", "spiritvalley", 321,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.72, 7, 15, 6),
  makeLevel(33, "cultivation", "蓬莱仙岛", "海上仙岛，灵气缭绕", "penglai", "penglai", 331,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 320 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "cultivator" }], 0.78, 8, 17, 7),
  makeLevel(34, "cultivation", "天宫台阶", "天宫台阶，层层递进", "palace", "palace", 341,
    [150, 235], [{ x: 960, type: "cultivator" }, { x: 1040, type: "swordmaster" }, { x: 1120, type: "taoist" }], 0.7, 6, 14, 5),
  makeLevel(35, "cultivation", "万剑归宗", "敌方剑阵密集，用万剑归宗对轰", "swordgrave", "spiritvalley", 351,
    [145, 225, 305], [{ x: 940, type: "swordmaster" }, { x: 1020, type: "swordmaster" }, { x: 1100, type: "taoist" }, { x: 1170, type: "cultivator" }], 0.74, 7, 15, 6),
  makeLevel(36, "cultivation", "雷符天降", "符师引动天雷，小心雷符落地", "immortal", "floatpeak", 361,
    [150, 230, 310], [{ x: 930, type: "taoist" }, { x: 1010, type: "taoist" }, { x: 1090, type: "swordmaster" }, { x: 1160, type: "cultivator" }], 0.76, 7, 16, 6.5),
  makeLevel(37, "cultivation", "龙吟九天", "仙人座下护法，龙形掌力惊人", "palace", "palace", 371,
    [145, 225, 305], [{ x: 920, type: "immortal", hp: 360 }, { x: 1000, type: "swordmaster" }, { x: 1080, type: "taoist" }, { x: 1160, type: "swordmaster" }], 0.82, 8, 17, 7),
  makeLevel(38, "cultivation", "仙人降临", "仙人法力无边，全力一战", "immortal", "penglai", 381,
    [145, 225, 305], [{ x: 900, type: "immortal", hp: 400 }, { x: 980, type: "swordmaster" }, { x: 1060, type: "taoist" }, { x: 1140, type: "swordmaster" }, { x: 1190, type: "cultivator" }], 0.88, 9, 18, 8),
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
