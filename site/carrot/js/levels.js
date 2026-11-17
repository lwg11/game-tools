/**
 * 保卫萝卜 · 关卡与数值
 * 敌人沿 waypoints 路径走向胡萝卜；炮塔建在路径两侧的固定位置。
 */

export const W = 1280;
export const H = 720;
export const PATH_Y_MIN = 132;
export const PATH_Y_MAX = 610;

export const TOWERS = {
  bottle: {
    id: "bottle", name: "瓶子炮", cost: 100, damage: 22, range: 132, rate: 0.8,
    color: "#75a84c", desc: "单体攻击，性价比高",
  },
  ice: {
    id: "ice", name: "冰锥塔", cost: 120, damage: 14, range: 125, rate: 0.95,
    slow: 1.8, color: "#7fd5e8", desc: "命中减速，拖住怪物",
  },
  fire: {
    id: "fire", name: "火焰瓶", cost: 150, damage: 38, range: 140, rate: 1.4,
    splash: 58, color: "#e8804a", desc: "范围爆炸，清理密集怪",
  },
  lightning: {
    id: "lightning", name: "闪电塔", cost: 180, damage: 20, range: 155, rate: 1.15,
    chain: 3, color: "#c9a7ff", desc: "连锁闪电，最多命中 3 个",
  },
  arrow: {
    id: "arrow", name: "多重箭", cost: 200, damage: 18, range: 170, rate: 0.9,
    targets: 3, color: "#d7b46a", desc: "同时攻击多个目标",
  },
};

export const TOWER_ORDER = ["bottle", "ice", "fire", "lightning", "arrow"];

export const ENEMIES = {
  slime: { id: "slime", name: "绿团子", hp: 90, speed: 52, gold: 12, r: 16, color: "#8fd05a", horn: "#5b8a2e" },
  runner: { id: "runner", name: "飞毛腿", hp: 60, speed: 88, gold: 10, r: 13, color: "#ffb45e", horn: "#c66b1e" },
  tank: { id: "tank", name: "铁皮怪", hp: 280, speed: 34, gold: 26, r: 22, color: "#a7b5c2", horn: "#5e6d7c" },
  boss: { id: "boss", name: "萝卜克星", hp: 1300, speed: 28, gold: 120, r: 32, color: "#b58cd8", horn: "#6e4a8c" },
};

const wave = (list, interval = 0.8) => ({ list, interval });

const P1 = [{ x: 1320, y: 160 }, { x: 980, y: 160 }, { x: 980, y: 360 }, { x: 340, y: 360 }, { x: 340, y: 570 }, { x: 170, y: 570 }];
const P2 = [{ x: 1320, y: 520 }, { x: 1010, y: 520 }, { x: 1010, y: 260 }, { x: 700, y: 260 }, { x: 700, y: 560 }, { x: 380, y: 560 }, { x: 380, y: 180 }, { x: 170, y: 180 }];
const P3 = [{ x: 1320, y: 160 }, { x: 1080, y: 160 }, { x: 1080, y: 340 }, { x: 820, y: 340 }, { x: 820, y: 550 }, { x: 540, y: 550 }, { x: 540, y: 260 }, { x: 280, y: 260 }, { x: 280, y: 600 }, { x: 170, y: 600 }];
const P4 = [{ x: 1320, y: 420 }, { x: 1140, y: 420 }, { x: 1140, y: 180 }, { x: 880, y: 180 }, { x: 880, y: 560 }, { x: 600, y: 560 }, { x: 600, y: 300 }, { x: 340, y: 300 }, { x: 340, y: 590 }, { x: 170, y: 590 }];
const P5 = [{ x: 1320, y: 200 }, { x: 1060, y: 200 }, { x: 1060, y: 500 }, { x: 780, y: 500 }, { x: 780, y: 180 }, { x: 520, y: 180 }, { x: 520, y: 540 }, { x: 250, y: 540 }, { x: 250, y: 320 }, { x: 170, y: 320 }];
const P6 = [{ x: 1320, y: 560 }, { x: 1100, y: 560 }, { x: 1100, y: 320 }, { x: 860, y: 320 }, { x: 860, y: 540 }, { x: 620, y: 540 }, { x: 620, y: 200 }, { x: 380, y: 200 }, { x: 380, y: 560 }, { x: 170, y: 560 }];
const P7 = [{ x: 1320, y: 140 }, { x: 1000, y: 140 }, { x: 1000, y: 300 }, { x: 1180, y: 300 }, { x: 1180, y: 520 }, { x: 800, y: 520 }, { x: 800, y: 360 }, { x: 500, y: 360 }, { x: 500, y: 580 }, { x: 170, y: 580 }];
const P8 = [{ x: 1320, y: 480 }, { x: 1120, y: 480 }, { x: 1120, y: 180 }, { x: 880, y: 180 }, { x: 880, y: 420 }, { x: 640, y: 420 }, { x: 640, y: 160 }, { x: 400, y: 160 }, { x: 400, y: 560 }, { x: 170, y: 560 }];

export const LEVELS = [
  {
    id: 1, name: "初入萝卜田", sub: "认识炮塔，守住第一根萝卜",
    theme: "day", path: P1, startGold: 260, carrotHp: 10, hpMul: 1,
    waves: [
      wave([{ type: "slime", count: 3 }]),
      wave([{ type: "slime", count: 4 }, { type: "runner", count: 2 }]),
      wave([{ type: "runner", count: 5 }]),
      wave([{ type: "slime", count: 6 }, { type: "tank", count: 1 }]),
      wave([{ type: "slime", count: 5 }, { type: "tank", count: 2 }], 0.6),
    ],
  },
  {
    id: 2, name: "弯弯小道", sub: "弯道两侧都能建塔，别浪费位置",
    theme: "day", path: P2, startGold: 280, carrotHp: 10, hpMul: 1.05,
    waves: [
      wave([{ type: "slime", count: 4 }]),
      wave([{ type: "runner", count: 5 }]),
      wave([{ type: "slime", count: 6 }, { type: "tank", count: 1 }]),
      wave([{ type: "runner", count: 6 }, { type: "tank", count: 2 }]),
      wave([{ type: "slime", count: 8 }, { type: "tank", count: 2 }], 0.55),
    ],
  },
  {
    id: 3, name: "交叉路口", sub: "长路线适合冰锥减速",
    theme: "sunset", path: P3, startGold: 300, carrotHp: 10, hpMul: 1.1,
    waves: [
      wave([{ type: "slime", count: 5 }]),
      wave([{ type: "runner", count: 6 }]),
      wave([{ type: "tank", count: 2 }, { type: "slime", count: 6 }]),
      wave([{ type: "runner", count: 8 }, { type: "tank", count: 2 }]),
      wave([{ type: "slime", count: 8 }, { type: "tank", count: 3 }, { type: "boss", count: 1 }], 0.5),
    ],
  },
  {
    id: 4, name: "夜色农场", sub: "怪物变硬了，升级炮塔",
    theme: "night", path: P4, startGold: 320, carrotHp: 10, hpMul: 1.18,
    waves: [
      wave([{ type: "slime", count: 6 }]),
      wave([{ type: "tank", count: 2 }]),
      wave([{ type: "runner", count: 9 }]),
      wave([{ type: "tank", count: 3 }, { type: "slime", count: 8 }]),
      wave([{ type: "tank", count: 4 }, { type: "runner", count: 8 }, { type: "boss", count: 1 }], 0.5),
    ],
  },
  {
    id: 5, name: "雪地足迹", sub: "雪地没有减速，靠炮塔自己拖住",
    theme: "snow", path: P5, startGold: 340, carrotHp: 10, hpMul: 1.25,
    waves: [
      wave([{ type: "runner", count: 8 }]),
      wave([{ type: "slime", count: 8 }, { type: "tank", count: 2 }]),
      wave([{ type: "runner", count: 10 }, { type: "tank", count: 2 }]),
      wave([{ type: "tank", count: 4 }, { type: "slime", count: 10 }]),
      wave([{ type: "tank", count: 5 }, { type: "runner", count: 10 }, { type: "boss", count: 1 }], 0.45),
    ],
  },
  {
    id: 6, name: "秋风农场", sub: "路线很长，多重箭覆盖更多目标",
    theme: "autumn", path: P6, startGold: 360, carrotHp: 10, hpMul: 1.32,
    waves: [
      wave([{ type: "slime", count: 8 }]),
      wave([{ type: "runner", count: 10 }]),
      wave([{ type: "tank", count: 3 }, { type: "slime", count: 10 }]),
      wave([{ type: "runner", count: 12 }, { type: "tank", count: 3 }]),
      wave([{ type: "tank", count: 5 }, { type: "slime", count: 10 }]),
      wave([{ type: "tank", count: 5 }, { type: "runner", count: 12 }, { type: "boss", count: 2 }], 0.45),
    ],
  },
  {
    id: 7, name: "迷雾山谷", sub: "怪物会从远处绕过来",
    theme: "night", path: P7, startGold: 380, carrotHp: 10, hpMul: 1.4,
    waves: [
      wave([{ type: "runner", count: 10 }]),
      wave([{ type: "slime", count: 10 }, { type: "tank", count: 3 }]),
      wave([{ type: "tank", count: 4 }, { type: "runner", count: 10 }]),
      wave([{ type: "slime", count: 12 }, { type: "tank", count: 4 }]),
      wave([{ type: "runner", count: 14 }, { type: "tank", count: 4 }]),
      wave([{ type: "tank", count: 6 }, { type: "slime", count: 12 }]),
      wave([{ type: "tank", count: 6 }, { type: "runner", count: 14 }, { type: "boss", count: 2 }], 0.4),
    ],
  },
  {
    id: 8, name: "最终保卫战", sub: "所有炮塔解禁，守住最后的萝卜",
    theme: "sunset", path: P8, startGold: 420, carrotHp: 10, hpMul: 1.5,
    waves: [
      wave([{ type: "slime", count: 10 }]),
      wave([{ type: "runner", count: 12 }]),
      wave([{ type: "tank", count: 4 }, { type: "slime", count: 10 }]),
      wave([{ type: "tank", count: 5 }, { type: "runner", count: 12 }]),
      wave([{ type: "tank", count: 6 }, { type: "slime", count: 12 }]),
      wave([{ type: "tank", count: 6 }, { type: "runner", count: 14 }]),
      wave([{ type: "tank", count: 8 }, { type: "slime", count: 14 }]),
      wave([{ type: "tank", count: 8 }, { type: "runner", count: 16 }, { type: "boss", count: 3 }], 0.35),
    ],
  },
];

export function getLevel(id) {
  if (id === 0) {
    return {
      id: 0, name: "无尽模式", sub: "怪物一波比一波强",
      theme: "night", path: P3, startGold: 380, carrotHp: 10, hpMul: 1,
      endless: true, waves: [],
    };
  }
  return LEVELS.find((lv) => lv.id === id) || LEVELS[0];
}

export const TOTAL_LEVELS = LEVELS.length;
