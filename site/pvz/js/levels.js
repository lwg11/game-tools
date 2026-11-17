/**
 * 《植物大战僵尸 · 加强版》配置
 * - 12 个关卡 + 无尽尸潮
 * - 12 种植物，包含加特林豌豆、樱桃炸弹、火爆辣椒等
 */

export const PLANTS = {
  sunflower: {
    id: "sunflower", name: "向日葵", cost: 50, hp: 90, recharge: 7,
    produce: 16, sunValue: 25, desc: "每 16 秒生产 25 阳光",
  },
  peashooter: {
    id: "peashooter", name: "豌豆射手", cost: 100, hp: 120, recharge: 5,
    damage: 20, fireRate: 1.4, desc: "向本行发射豌豆",
  },
  wallnut: {
    id: "wallnut", name: "坚果墙", cost: 50, hp: 850, recharge: 18,
    desc: "高血量，替其他植物挡伤害",
  },
  potatomine: {
    id: "potatomine", name: "土豆雷", cost: 25, hp: 100, recharge: 18,
    armTime: 12, damage: 1800, desc: "埋雷 12 秒后，踩中即爆",
  },
  snowpea: {
    id: "snowpea", name: "寒冰射手", cost: 175, hp: 120, recharge: 8,
    damage: 20, fireRate: 1.4, slow: 3, desc: "豌豆附带减速效果",
  },
  repeater: {
    id: "repeater", name: "双发射手", cost: 200, hp: 120, recharge: 8,
    damage: 20, fireRate: 1.4, shots: 2, desc: "一次发射两颗豌豆",
  },
  cherrybomb: {
    id: "cherrybomb", name: "樱桃炸弹", cost: 150, hp: 9999, recharge: 30,
    fuse: 0.9, damage: 1800, radius: 1.7, desc: "引爆 3×3 范围",
  },
  chomper: {
    id: "chomper", name: "大嘴花", cost: 150, hp: 150, recharge: 12,
    damage: 1800, chew: 8, desc: "吞掉近身僵尸，咀嚼 8 秒",
  },
  threepeater: {
    id: "threepeater", name: "三线射手", cost: 325, hp: 120, recharge: 12,
    damage: 20, fireRate: 1.5, lanes: 3, desc: "同时攻击上中下三行",
  },
  jalapeno: {
    id: "jalapeno", name: "火爆辣椒", cost: 125, hp: 9999, recharge: 30,
    fuse: 0.9, damage: 1800, lane: true, desc: "烧光一整行的僵尸",
  },
  squash: {
    id: "squash", name: "窝瓜", cost: 50, hp: 120, recharge: 20,
    damage: 1800, windup: 0.55, desc: "压扁靠近的僵尸",
  },
  gatling: {
    id: "gatling", name: "加特林豌豆", cost: 450, hp: 140, recharge: 35,
    damage: 20, fireRate: 1.4, shots: 4, desc: "加强版核心：一次四连发",
  },
  melon: {
    id: "melon", name: "西瓜投手", cost: 300, hp: 120, recharge: 12,
    damage: 80, splash: 45, fireRate: 2.2, desc: "投掷西瓜，落点范围伤害",
  },
  spikeweed: {
    id: "spikeweed", name: "地刺", cost: 100, hp: 320, recharge: 12,
    damage: 22, tick: 0.55, desc: "铺在地面，持续伤害走过的僵尸",
  },
  magnet: {
    id: "magnet", name: "磁力菇", cost: 100, hp: 100, recharge: 20,
    interval: 8, desc: "吸走铁桶等金属护具",
  },
  iceshroom: {
    id: "iceshroom", name: "寒冰菇", cost: 75, hp: 9999, recharge: 30,
    fuse: 0.8, freeze: 5, desc: "冻结全场僵尸 5 秒",
  },
};

export const PLANT_ORDER = [
  "sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "repeater",
  "cherrybomb", "chomper", "threepeater", "jalapeno", "squash", "gatling",
  "melon", "spikeweed", "magnet", "iceshroom",
];

export const ZOMBIES = {
  normal: { id: "normal", name: "普通僵尸", hp: 180, speed: 15, dps: 52, scale: 1 },
  cone: { id: "cone", name: "路障僵尸", hp: 360, speed: 15, dps: 52, scale: 1 },
  bucket: { id: "bucket", name: "铁桶僵尸", hp: 650, speed: 13, dps: 52, scale: 1.02 },
  flag: { id: "flag", name: "旗帜僵尸", hp: 180, speed: 21, dps: 52, scale: 1 },
  football: { id: "football", name: "橄榄球僵尸", hp: 850, speed: 31, dps: 72, scale: 1.1 },
};

const P = PLANTS;
const Z = (type, count) => ({ type, count });

export const LEVELS = [
  {
    id: 1, name: "前院初战", sub: "收集阳光，种下第一排豌豆",
    startSun: 150, plants: ["sunflower", "peashooter"],
    waves: [
      { t: 8, list: [Z("normal", 1)] },
      { t: 24, list: [Z("normal", 2)] },
      { t: 42, list: [Z("normal", 2), Z("cone", 1)], huge: true },
    ],
    duration: 66,
  },
  {
    id: 2, name: "坚果防线", sub: "用坚果墙拖住僵尸的脚步",
    startSun: 150, plants: ["sunflower", "peashooter", "wallnut"],
    waves: [
      { t: 7, list: [Z("normal", 1)] },
      { t: 20, list: [Z("normal", 2)] },
      { t: 34, list: [Z("normal", 2), Z("cone", 1)] },
      { t: 50, list: [Z("normal", 3), Z("cone", 2)], huge: true },
    ],
    duration: 76,
  },
  {
    id: 3, name: "土豆雷区", sub: "提前埋雷，炸掉第一波硬骨头",
    startSun: 175, plants: ["sunflower", "peashooter", "wallnut", "potatomine"],
    waves: [
      { t: 7, list: [Z("normal", 1)] },
      { t: 19, list: [Z("normal", 2)] },
      { t: 31, list: [Z("normal", 1), Z("cone", 2)] },
      { t: 45, list: [Z("normal", 3), Z("cone", 2)] },
      { t: 60, list: [Z("normal", 3), Z("cone", 2), Z("bucket", 1)], huge: true },
    ],
    duration: 86,
  },
  {
    id: 4, name: "寒冰来袭", sub: "减速豌豆能救下整条防线",
    startSun: 175, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea"],
    waves: [
      { t: 7, list: [Z("normal", 2)] },
      { t: 20, list: [Z("cone", 2)] },
      { t: 34, list: [Z("normal", 2), Z("cone", 2)] },
      { t: 48, list: [Z("bucket", 1), Z("cone", 2)] },
      { t: 64, list: [Z("normal", 3), Z("cone", 2), Z("bucket", 1)], huge: true },
    ],
    duration: 90,
  },
  {
    id: 5, name: "爆炸艺术", sub: "樱桃炸弹清场，别舍不得",
    startSun: 200, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb"],
    waves: [
      { t: 7, list: [Z("normal", 2)] },
      { t: 20, list: [Z("cone", 2), Z("normal", 1)] },
      { t: 33, list: [Z("bucket", 1), Z("cone", 2)] },
      { t: 47, list: [Z("normal", 3), Z("cone", 2)] },
      { t: 62, list: [Z("bucket", 2), Z("cone", 2), Z("normal", 2)], huge: true },
    ],
    duration: 90,
  },
  {
    id: 6, name: "双重火力", sub: "双发射手，让火力翻倍",
    startSun: 200, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "spikeweed"],
    waves: [
      { t: 7, list: [Z("normal", 2)] },
      { t: 19, list: [Z("cone", 2)] },
      { t: 31, list: [Z("bucket", 1), Z("normal", 2)] },
      { t: 44, list: [Z("cone", 3), Z("bucket", 1)] },
      { t: 58, list: [Z("normal", 3), Z("cone", 2), Z("bucket", 2)] },
      { t: 74, list: [Z("bucket", 2), Z("cone", 3), Z("normal", 2)], huge: true },
    ],
    duration: 100,
  },
  {
    id: 7, name: "烈焰走廊", sub: "一整行僵尸，交给火爆辣椒",
    startSun: 225, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno"],
    waves: [
      { t: 7, list: [Z("normal", 2)] },
      { t: 19, list: [Z("cone", 2), Z("normal", 1)] },
      { t: 32, list: [Z("bucket", 2)] },
      { t: 45, list: [Z("cone", 3), Z("bucket", 1)] },
      { t: 58, list: [Z("normal", 4), Z("cone", 2)] },
      { t: 74, list: [Z("bucket", 2), Z("cone", 3), Z("normal", 3)], huge: true },
    ],
    duration: 102,
  },
  {
    id: 8, name: "三线压制", sub: "三线射手覆盖三条战线",
    startSun: 250, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno", "threepeater", "melon"],
    waves: [
      { t: 7, list: [Z("normal", 3)] },
      { t: 20, list: [Z("cone", 3)] },
      { t: 33, list: [Z("bucket", 2), Z("normal", 2)] },
      { t: 47, list: [Z("cone", 4), Z("bucket", 1)] },
      { t: 61, list: [Z("bucket", 3), Z("normal", 3)] },
      { t: 77, list: [Z("bucket", 3), Z("cone", 3), Z("normal", 3)], huge: true },
    ],
    duration: 106,
  },
  {
    id: 9, name: "血盆大口", sub: "大嘴花一口一个，但要小心咀嚼时间",
    startSun: 250, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno", "threepeater", "chomper"],
    waves: [
      { t: 7, list: [Z("normal", 3)] },
      { t: 19, list: [Z("cone", 2), Z("bucket", 1)] },
      { t: 32, list: [Z("bucket", 2), Z("normal", 2)] },
      { t: 46, list: [Z("cone", 4), Z("bucket", 2)] },
      { t: 60, list: [Z("bucket", 3), Z("cone", 3)] },
      { t: 76, list: [Z("football", 1), Z("bucket", 2), Z("cone", 3)], huge: true },
    ],
    duration: 106,
  },
  {
    id: 10, name: "窝瓜突袭", sub: "窝瓜专治各种铁桶",
    startSun: 275, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno", "threepeater", "chomper", "squash", "magnet"],
    waves: [
      { t: 7, list: [Z("normal", 3)] },
      { t: 19, list: [Z("cone", 3), Z("bucket", 1)] },
      { t: 32, list: [Z("bucket", 3)] },
      { t: 45, list: [Z("football", 1), Z("cone", 3)] },
      { t: 59, list: [Z("bucket", 3), Z("normal", 3)] },
      { t: 75, list: [Z("football", 2), Z("bucket", 3), Z("cone", 2)], huge: true },
    ],
    duration: 108,
  },
  {
    id: 11, name: "加特林登场", sub: "加强版核心植物：四连发加特林",
    startSun: 300, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno", "threepeater", "chomper", "squash", "gatling", "melon", "spikeweed", "magnet", "iceshroom"],
    waves: [
      { t: 7, list: [Z("normal", 3)] },
      { t: 19, list: [Z("cone", 3), Z("bucket", 1)] },
      { t: 31, list: [Z("bucket", 3), Z("football", 1)] },
      { t: 44, list: [Z("cone", 4), Z("bucket", 2)] },
      { t: 58, list: [Z("football", 2), Z("bucket", 3)] },
      { t: 74, list: [Z("bucket", 4), Z("cone", 3), Z("normal", 3)] },
      { t: 92, list: [Z("football", 3), Z("bucket", 4), Z("cone", 3)], huge: true },
    ],
    duration: 124,
  },
  {
    id: 12, name: "加强版终局", sub: "五波尸潮 + 橄榄球队，守住最后草坪",
    startSun: 325, plants: ["sunflower", "peashooter", "wallnut", "potatomine", "snowpea", "cherrybomb", "repeater", "jalapeno", "threepeater", "chomper", "squash", "gatling", "melon", "spikeweed", "magnet", "iceshroom"],
    waves: [
      { t: 6, list: [Z("normal", 3)] },
      { t: 18, list: [Z("cone", 3), Z("bucket", 1)] },
      { t: 30, list: [Z("bucket", 3), Z("football", 1)] },
      { t: 43, list: [Z("cone", 4), Z("football", 2)] },
      { t: 56, list: [Z("bucket", 4), Z("football", 2)] },
      { t: 70, list: [Z("football", 3), Z("bucket", 3), Z("cone", 3)] },
      { t: 86, list: [Z("football", 4), Z("bucket", 4), Z("cone", 4)] },
      { t: 104, list: [Z("football", 5), Z("bucket", 5), Z("cone", 4), Z("normal", 3)], huge: true },
    ],
    duration: 138,
  },
];

export function getLevel(id) {
  if (id === 0) {
    return {
      id: 0, name: "无尽尸潮", sub: "看看你能守住多少波", endless: true,
      startSun: 300, plants: PLANT_ORDER.slice(),
    };
  }
  return LEVELS.find((lv) => lv.id === id) || LEVELS[0];
}

export const TOTAL_LEVELS = LEVELS.length;
