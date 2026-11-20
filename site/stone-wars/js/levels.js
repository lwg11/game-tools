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
};

export const WEAPON_ORDER = [
  "spear", "boulder", "grenade", "banana", "spike", "boomerang", "meteor",
  "crossbow", "cannon", "firebomb", "rifle", "mortar", "rocket", "laser", "railgun",
];

/** 每个时代的默认武器栏（最多 7 格） */
export const ERA_WEAPONS = {
  stone: ["spear", "boulder", "grenade", "banana", "spike", "boomerang", "meteor"],
  iron: ["crossbow", "cannon", "firebomb", "grenade", "boomerang", "spike", "meteor"],
  gun: ["rifle", "rocket", "mortar", "firebomb", "grenade", "boomerang", "meteor"],
  mech: ["laser", "railgun", "rocket", "mortar", "cannon", "crossbow", "meteor"],
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
    else if (id === "rocket" || id === "mortar" || id === "cannon") ammo[id] = 2 + Math.floor(lv / 6);
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

/** 无限模式：机械时代武器全开，没有回合上限 */
export function getEndlessLevel() {
  return {
    id: 0,
    era: "mech",
    name: "无限模式",
    goal: "无回合上限，消灭全部敌人",
    theme: "night",
    style: "hills",
    seed: 777,
    player: [{ x: 140 }, { x: 220 }, { x: 300 }],
    enemies: [
      { x: 860, type: "warlord" },
      { x: 945, type: "mech" },
      { x: 1025, type: "gunner" },
      { x: 1105, type: "mech" },
      { x: 1180, type: "warlord" },
    ],
    weapons: ERA_WEAPONS.mech,
    ammo: {
      laser: Infinity, railgun: 5, rocket: 6, mortar: 6,
      cannon: 6, crossbow: 6, meteor: 4,
    },
    windMax: 6,
    ai: 0.72,
    endless: true,
  };
}
