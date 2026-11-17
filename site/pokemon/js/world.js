/**
 * 精灵宝可梦 · 丰缘草地
 * ------------------------------------------------------------
 * 开放世界地图、草丛遭遇、野生宝可梦游走、浆果采集、博士委托。
 * 地图为 2560×1600 的大世界，相机跟随玩家滚动查看。
 * 调研结论（Bulbapedia / 官方训练家指南 / Pokemon GO 研究任务）：
 * - 野生宝可梦栖息在草丛，玩家在草丛中行走时按步触发随机遭遇；
 * - 遭遇后可以战斗、捕捉或逃跑，HP 越低越容易捕获；
 * - 研究/委托任务通常围绕“捕捉指定属性、击败野生宝可梦、行走距离”展开，
 *   完成后领取奖励，并解锁新的委托。
 */
import { SPECIES, TYPE_NAMES } from "./data.js";

export const WORLD_W = 2560;
export const WORLD_H = 1600;

export const PROFESSOR = { x: 220, y: 360, name: "枫木博士" };

export const ZONES = [
  {
    id: "meadow", name: "101号草地", x: 520, y: 640, w: 340, h: 250,
    theme: "route", baseLevel: 3, tier: 1,
    species: ["poochyena", "zigzagoon", "wurmple", "taillow", "marill"],
  },
  {
    id: "flowerfield", name: "花田小径", x: 900, y: 250, w: 320, h: 230,
    theme: "flower", baseLevel: 5, tier: 1,
    species: ["ralts", "beautifly", "taillow", "zigzagoon", "marill"],
  },
  {
    id: "forest", name: "橙华森林", x: 1460, y: 230, w: 400, h: 320,
    theme: "forest", baseLevel: 8, tier: 2,
    species: ["treecko", "cacnea", "ralts", "beautifly", "sableye"],
  },
  {
    id: "pond", name: "池畔草丛", x: 1400, y: 1070, w: 330, h: 230,
    theme: "cave", baseLevel: 7, tier: 2,
    species: ["marill", "mudkip", "azumarill", "poochyena"],
  },
  {
    id: "wetland", name: "湖畔湿地", x: 600, y: 1170, w: 320, h: 240,
    theme: "water", baseLevel: 7, tier: 2,
    species: ["mudkip", "marill", "wurmple", "zigzagoon"],
  },
  {
    id: "rocky", name: "岩石坡", x: 2060, y: 800, w: 340, h: 300,
    theme: "gym", baseLevel: 13, tier: 3,
    species: ["geodude", "numel", "mawile", "electrike", "graveler"],
  },
  {
    id: "grove", name: "古树秘境", x: 2060, y: 180, w: 320, h: 260,
    theme: "ancient", baseLevel: 15, tier: 3,
    species: ["sableye", "mawile", "ralts", "graveler", "numel"],
  },
];

const LAB = { x: 70, y: 110, w: 300, h: 200 };
const POND = { x: 1780, y: 1390, rx: 230, ry: 105 };

// 主路与支路（静态烘焙到背景缓存）
const PATH_MAIN = [
  [290, 400], [480, 520], [720, 610], [980, 660], [1230, 590], [1440, 480],
  [1650, 520], [1880, 660], [2120, 790], [2330, 930],
];
const PATH_BRANCHES = [
  [[1440, 480], [1540, 420], [1640, 380], [1720, 360]],
  [[1650, 520], [1760, 700], [1740, 900], [1660, 1060]],
  [[980, 660], [900, 900], [800, 1120], [760, 1200]],
  [[2120, 790], [2200, 600], [2240, 430], [2220, 330]],
  [[480, 520], [380, 620], [300, 720]],
];

// ---------------------------------------------------------------- 地形数据
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrnd = mulberry32(20260317);

function inRect(x, y, r, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function nearPath(x, y, d) {
  const all = [PATH_MAIN, ...PATH_BRANCHES];
  for (const pts of all) {
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < d) return true;
    }
  }
  return false;
}

function blockedForTree(x, y) {
  if (x < 34 || x > WORLD_W - 34 || y < 50 || y > WORLD_H - 28) return true;
  if (inRect(x, y, LAB, 46)) return true;
  if (zonesNear(x, y, 40)) return true;
  if (Math.hypot((x - POND.x) / (POND.rx + 55), (y - POND.y) / (POND.ry + 55)) < 1) return true;
  if (nearPath(x, y, 54)) return true;
  if (Math.hypot(x - PROFESSOR.x, y - PROFESSOR.y) < 70) return true;
  return false;
}

function zonesNear(x, y, pad) {
  return ZONES.some((z) => inRect(x, y, z, pad));
}

const TREES = [];
// 边界林带
for (let x = 46; x < WORLD_W - 30; x += 86 + wrnd() * 26) {
  TREES.push([x, 58 + wrnd() * 26]);
  TREES.push([x + 20, WORLD_H - 40 - wrnd() * 18]);
}
for (let y = 120; y < WORLD_H - 70; y += 92 + wrnd() * 24) {
  TREES.push([46 + wrnd() * 26, y]);
  TREES.push([WORLD_W - 46 - wrnd() * 26, y + 20]);
}
// 内部树丛
let guard = 0;
while (TREES.length < 170 && guard < 3000) {
  guard += 1;
  const x = 90 + wrnd() * (WORLD_W - 180);
  const y = 100 + wrnd() * (WORLD_H - 170);
  if (blockedForTree(x, y)) continue;
  if (TREES.some(([tx, ty]) => Math.hypot(x - tx, y - ty) < 80)) continue;
  TREES.push([x, y]);
  if (wrnd() < 0.4) TREES.push([x + 34 + wrnd() * 20, y + 20 + wrnd() * 18]);
}

const ROCKS = [];
for (let i = 0; i < 18; i++) {
  const x = 80 + wrnd() * (WORLD_W - 160);
  const y = 90 + wrnd() * (WORLD_H - 160);
  if (blockedForTree(x, y)) continue;
  if (Math.hypot(x - 255, y - 385) < 80) continue;
  ROCKS.push([x, y, 12 + wrnd() * 12]);
}
// 岩石坡附近的石群
[[2040, 860], [2120, 960], [2330, 850], [2350, 990], [2080, 1080]].forEach(([x, y]) => {
  ROCKS.push([x, y, 16 + wrnd() * 10]);
});

export const BERRY_SPOTS = [
  [486, 604], [610, 780], [944, 300], [1130, 430], [1500, 300], [1580, 500],
  [1440, 1120], [1660, 1240], [700, 1230], [860, 1360], [2100, 860], [2260, 990],
  [2140, 260], [2290, 380], [366, 600], [430, 990],
];

export function canWalk(x, y) {
  if (x < 30 || x > WORLD_W - 30 || y < 62 || y > WORLD_H - 26) return false;
  if (inRect(x, y, LAB, 12)) return false;
  const pdx = (x - POND.x) / (POND.rx + 6);
  const pdy = (y - POND.y) / (POND.ry + 6);
  if (pdx * pdx + pdy * pdy < 1) return false;
  for (const [tx, ty] of TREES) {
    if (Math.hypot(x - tx, y - ty) < 25) return false;
  }
  for (const [rx, ry, rr] of ROCKS) {
    if (Math.hypot(x - rx, y - ry) < rr) return false;
  }
  if (Math.hypot(x - PROFESSOR.x, y - PROFESSOR.y) < 20) return false;
  return true;
}

export function zoneAt(x, y) {
  return ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) || null;
}

export function pickWild(zone, teamLevel) {
  if (!zone) return null;
  const species = zone.species[Math.floor(Math.random() * zone.species.length)];
  const avg = Math.max(1, Number(teamLevel) || 5);
  const base = zone.baseLevel + Math.floor(avg * 0.35);
  const level = Math.max(2, Math.min(32, base + Math.floor(Math.random() * 3) - 1));
  return { species, level };
}

// ---------------------------------------------------------------- 委托
const TYPE_POOL = ["grass", "bug", "flying", "water", "dark", "rock", "electric", "fire", "psychic"];

function uid() {
  return "q_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
}

function rewardFor(done, goal, kind) {
  const money = kind === "walk"
    ? 320 + Math.min(1200, goal) * 2
    : 320 + Math.min(12, goal) * 70 + done * 30;
  const items = {};
  if (kind === "catchAny" || kind === "catchType" || kind === "catchSpecies") items.pokeBall = 1 + Math.floor(goal / 2);
  if (kind === "win") items.potion = 1 + Math.floor(goal / 3);
  if (kind === "walk") items.pokeBall = 2;
  if (kind === "dex") items.greatBall = 1;
  if (kind === "level") items.superPotion = 1;
  return { money, items };
}

function quest(kind, target, goal, title, desc, done) {
  return { id: uid(), kind, target, goal, progress: 0, title, desc, reward: rewardFor(done, goal, kind) };
}

export function initialQuests() {
  return [
    quest("catchAny", null, 1, "初次捕捉", "在草丛里捕捉 1 只野生宝可梦", 0),
    quest("walk", null, 300, "草丛调查", "在草丛中行走 300 步", 0),
    quest("win", null, 2, "初试身手", "击败 2 只野生宝可梦", 0),
  ];
}

export function createQuest(active, done) {
  const used = new Set((active || []).map((q) => `${q.kind}:${q.target || ""}`));
  const pool = [];
  if (!used.has("catchAny:")) pool.push(() => {
    const goal = Math.min(4, 1 + Math.floor(done / 3));
    return quest("catchAny", null, goal, "捕捉训练", `捕捉 ${goal} 只野生宝可梦`, done);
  });
  if (!used.has("win:")) pool.push(() => {
    const goal = Math.min(6, 2 + Math.floor(done / 3));
    return quest("win", null, goal, "击退野性", `击败 ${goal} 只野生宝可梦`, done);
  });
  if (!used.has("walk:")) pool.push(() => {
    const goal = Math.min(1500, 300 + done * 80);
    return quest("walk", null, goal, "草地巡礼", `在草丛中行走 ${goal} 步`, done);
  });
  if (!used.has("level:")) pool.push(() => {
    const goal = Math.min(30, 8 + Math.floor(done / 3) * 2);
    return quest("level", null, goal, "成长之路", `把任意宝可梦升到 Lv.${goal}`, done);
  });
  if (!used.has("dex:")) pool.push(() => {
    const goal = Math.min(12, 3 + Math.floor(done / 2));
    return quest("dex", null, goal, "图鉴研究", `登记 ${goal} 种不同的宝可梦`, done);
  });
  for (const type of TYPE_POOL) {
    if (used.has(`catchType:${type}`)) continue;
    pool.push(() => {
      const goal = done >= 4 ? 2 : 1;
      return quest("catchType", type, goal, `属性调查 · ${TYPE_NAMES[type]}`,
        `捕捉 ${goal} 只${TYPE_NAMES[type]}属性宝可梦`, done);
    });
  }
  for (const zone of ZONES) {
    for (const id of zone.species) {
      if (used.has(`catchSpecies:${id}`)) continue;
      pool.push(() => quest("catchSpecies", id, 1, `目标：${SPECIES[id].name}`,
        `捕捉 1 只${SPECIES[id].name}`, done));
    }
  }
  if (!pool.length) return quest("catchAny", null, 1, "继续捕捉", "捕捉 1 只野生宝可梦", done);
  return pool[Math.floor(Math.random() * pool.length)]();
}

// ---------------------------------------------------------------- 静态绘制
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 草丛内的草叶（动态摆动）
const BLADES = [];
const FG_BLADES = [];
for (const zone of ZONES) {
  for (let i = 0; i < 34; i++) {
    BLADES.push({
      zone: zone.id,
      x: zone.x + 10 + Math.random() * (zone.w - 20),
      y: zone.y + 12 + Math.random() * (zone.h - 20),
      h: 9 + Math.random() * 10,
      phase: Math.random() * 6,
    });
  }
  for (let i = 0; i < 22; i++) {
    FG_BLADES.push({
      zone: zone.id,
      x: zone.x + 10 + Math.random() * (zone.w - 20),
      y: zone.y + 14 + Math.random() * (zone.h - 22),
      h: 12 + Math.random() * 12,
      phase: Math.random() * 6,
    });
  }
}

const FLOWERS = [];
for (let i = 0; i < 130; i++) {
  const x = 40 + wrnd() * (WORLD_W - 80);
  const y = 80 + wrnd() * (WORLD_H - 120);
  if (inRect(x, y, LAB, 30)) continue;
  if (Math.hypot((x - POND.x) / POND.rx, (y - POND.y) / POND.ry) < 1.15) continue;
  FLOWERS.push({ x, y, c: ["#ffe27a", "#ffb4d8", "#fff3c8", "#c9b8ff"][Math.floor(wrnd() * 4)], s: 2 + wrnd() * 2 });
}

const TUFTS = [];
for (let i = 0; i < 220; i++) {
  const x = 40 + wrnd() * (WORLD_W - 80);
  const y = 80 + wrnd() * (WORLD_H - 120);
  if (inRect(x, y, LAB, 24)) continue;
  if (Math.hypot((x - POND.x) / POND.rx, (y - POND.y) / POND.ry) < 1.1) continue;
  TUFTS.push({ x, y, s: 4 + wrnd() * 6 });
}

const MUSHROOMS = [];
for (let i = 0; i < 26; i++) {
  const z = ZONES[Math.floor(wrnd() * ZONES.length)];
  MUSHROOMS.push({
    x: z.x + 20 + wrnd() * (z.w - 40),
    y: z.y + 20 + wrnd() * (z.h - 40),
    s: 2 + wrnd() * 2,
  });
}

function drawPaths(ctx) {
  const strokePath = (pts, width) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.lineWidth = width;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const all = [PATH_MAIN, ...PATH_BRANCHES];
  for (const pts of all) {
    ctx.strokeStyle = "#a87a45";
    strokePath(pts, 62);
  }
  for (const pts of all) {
    ctx.strokeStyle = "#d9b47c";
    strokePath(pts, 50);
  }
  ctx.strokeStyle = "rgba(255,245,210,.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 16]);
  for (const pts of all) strokePath(pts, 2);
  ctx.restore();
}

function drawPondBase(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx + 16, POND.ry + 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#5f9f5a";
  ctx.fill();
  const g = ctx.createLinearGradient(POND.x, POND.y - POND.ry, POND.x, POND.y + POND.ry);
  g.addColorStop(0, "#7fd8ff");
  g.addColorStop(1, "#2f8fc8");
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // 岸边浅水
  ctx.strokeStyle = "rgba(180,240,255,.5)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx - 8, POND.ry - 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 荷叶
  for (const [dx, dy, r] of [[-90, -24, 18], [50, 26, 14], [104, -32, 12], [-20, 42, 10]]) {
    ctx.fillStyle = "#4f9a3a";
    ctx.beginPath();
    ctx.ellipse(POND.x + dx, POND.y + dy, r, r * 0.65, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb4d8";
    ctx.beginPath();
    ctx.arc(POND.x + dx + 3, POND.y + dy - 3, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTree(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = "rgba(20,50,20,.18)";
  ctx.beginPath();
  ctx.ellipse(x + 6, y + 18, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f4a2a";
  ctx.fillRect(x - 5, y - 2, 10, 24);
  ctx.fillStyle = "#2f7c3a";
  ctx.beginPath();
  ctx.arc(x, y - 18, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4f9f48";
  ctx.beginPath();
  ctx.arc(x - 16, y - 8, 19, 0, Math.PI * 2);
  ctx.arc(x + 17, y - 6, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,200,.22)";
  ctx.beginPath();
  ctx.arc(x - 7, y - 24, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRock(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "rgba(20,30,40,.18)";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + r * 0.6, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9a958a";
  ctx.strokeStyle = "#6f6a60";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.5);
  ctx.lineTo(x - r * 0.7, y - r * 0.5);
  ctx.lineTo(x, y - r);
  ctx.lineTo(x + r * 0.8, y - r * 0.2);
  ctx.lineTo(x + r * 0.6, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFlowers(ctx) {
  ctx.save();
  for (const f of FLOWERS) {
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8c8";
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLab(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(20,40,30,.2)";
  roundRect(ctx, LAB.x + 8, LAB.y + LAB.h - 6, LAB.w, 26, 12);
  ctx.fill();

  ctx.fillStyle = "#f4ead2";
  ctx.strokeStyle = "#8a6a3e";
  ctx.lineWidth = 3;
  roundRect(ctx, LAB.x, LAB.y + 42, LAB.w, LAB.h - 42, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#c85a3a";
  ctx.beginPath();
  ctx.moveTo(LAB.x - 16, LAB.y + 48);
  ctx.lineTo(LAB.x + LAB.w / 2, LAB.y - 6);
  ctx.lineTo(LAB.x + LAB.w + 16, LAB.y + 48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (const wx of [LAB.x + 32, LAB.x + LAB.w - 92]) {
    ctx.fillStyle = "#8fd8ff";
    ctx.strokeStyle = "#8a6a3e";
    ctx.lineWidth = 3;
    roundRect(ctx, wx, LAB.y + 70, 60, 48, 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + 8, LAB.y + 106);
    ctx.lineTo(wx + 26, LAB.y + 82);
    ctx.stroke();
  }

  ctx.fillStyle = "#8a5a2a";
  roundRect(ctx, LAB.x + LAB.w / 2 - 26, LAB.y + 122, 52, 58, 6);
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(LAB.x + LAB.w / 2 + 12, LAB.y + 152, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff8e2";
  ctx.strokeStyle = "#8a6a3e";
  ctx.lineWidth = 2;
  roundRect(ctx, LAB.x + LAB.w / 2 - 64, LAB.y + 42, 128, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#5b4a2a";
  ctx.font = "900 15px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("枫木研究所", LAB.x + LAB.w / 2, LAB.y + 56);

  ctx.fillStyle = "#c9b184";
  roundRect(ctx, LAB.x + LAB.w / 2 - 34, LAB.y + 180, 68, 10, 4);
  ctx.fill();
  ctx.restore();
}

function drawSigns(ctx) {
  const signs = [
    [480, 612, "101号草地"],
    [884, 470, "花田小径"],
    [1408, 520, "橙华森林"],
    [1380, 1050, "池畔草丛"],
    [588, 1150, "湖畔湿地"],
    [2050, 785, "岩石坡"],
    [2048, 172, "古树秘境"],
  ];
  ctx.save();
  for (const [x, y, label] of signs) {
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(x - 3, y, 6, 26);
    ctx.fillStyle = "#c9a06a";
    ctx.strokeStyle = "#6f4a24";
    ctx.lineWidth = 2;
    roundRect(ctx, x - 44, y - 22, 88, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a3218";
    ctx.font = "900 11px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - 10);
  }
  ctx.restore();
}

/** 把静态地形烘焙到离屏画布，滚动时只做一次贴图，稳定帧率 */
let cache = null;
function buildWorldCache() {
  if (cache) return cache;
  const c = document.createElement("canvas");
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext("2d");

  const sky = g.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, "#8fd8ff");
  sky.addColorStop(0.1, "#c9edff");
  sky.addColorStop(0.34, "#9ad973");
  sky.addColorStop(1, "#5aa84c");
  g.fillStyle = sky;
  g.fillRect(0, 0, WORLD_W, WORLD_H);

  // 远处山丘
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = "#5f9f74";
  g.beginPath();
  g.moveTo(0, 330);
  for (let x = 0; x <= WORLD_W; x += 80) {
    g.lineTo(x, 290 + Math.sin(x * 0.008) * 42 + Math.cos(x * 0.021) * 18);
  }
  g.lineTo(WORLD_W, 380);
  g.lineTo(0, 380);
  g.closePath();
  g.fill();
  g.restore();

  // 草地纹理：深浅斑块
  for (let i = 0; i < 220; i++) {
    const x = wrnd() * WORLD_W;
    const y = 360 + wrnd() * (WORLD_H - 380);
    const r = 24 + wrnd() * 90;
    g.fillStyle = wrnd() < 0.5 ? "rgba(90,170,80,.16)" : "rgba(50,120,55,.12)";
    g.beginPath();
    g.ellipse(x, y, r, r * 0.45, wrnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // 草纹
  g.save();
  g.globalAlpha = 0.1;
  g.strokeStyle = "#2f7c3a";
  g.lineWidth = 2;
  for (let y = 400; y < WORLD_H; y += 48) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(WORLD_W, y + 16);
    g.stroke();
  }
  g.restore();

  drawPaths(g);
  drawPondBase(g);

  // 草丛底色
  const ZONE_TINT = {
    route: ["rgba(52,132,62,.88)", "rgba(39,110,52,.9)", "rgba(28,88,44,.92)"],
    flower: ["rgba(74,148,60,.88)", "rgba(58,126,48,.9)", "rgba(42,104,42,.92)"],
    forest: ["rgba(38,112,52,.92)", "rgba(27,90,44,.93)", "rgba(18,70,38,.94)"],
    cave: ["rgba(46,124,80,.88)", "rgba(35,102,66,.9)", "rgba(24,84,56,.92)"],
    water: ["rgba(48,128,84,.88)", "rgba(38,108,70,.9)", "rgba(28,88,60,.92)"],
    gym: ["rgba(74,132,58,.88)", "rgba(58,110,48,.9)", "rgba(44,92,40,.92)"],
    ancient: ["rgba(36,104,54,.92)", "rgba(26,84,46,.93)", "rgba(18,66,38,.94)"],
  };
  for (const z of ZONES) {
    g.save();
    roundRect(g, z.x, z.y, z.w, z.h, 26);
    const cols = ZONE_TINT[z.theme] || ZONE_TINT.route;
    const grad = g.createLinearGradient(z.x, z.y, z.x, z.y + z.h);
    grad.addColorStop(0, cols[0]);
    grad.addColorStop(0.55, cols[1]);
    grad.addColorStop(1, cols[2]);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = "rgba(30,90,40,.35)";
    g.lineWidth = 2;
    g.stroke();
    // 边缘草簇：打散矩形轮廓，让草丛和野地自然衔接
    for (let i = 0; i < 70; i++) {
      const side = Math.floor(wrnd() * 4);
      let px;
      let py;
      if (side === 0) { px = z.x + wrnd() * z.w; py = z.y + wrnd() * 16 - 8; }
      else if (side === 1) { px = z.x + wrnd() * z.w; py = z.y + z.h + wrnd() * 14 - 8; }
      else if (side === 2) { px = z.x + wrnd() * 14 - 8; py = z.y + wrnd() * z.h; }
      else { px = z.x + z.w + wrnd() * 14 - 8; py = z.y + wrnd() * z.h; }
      g.strokeStyle = wrnd() < 0.5 ? "rgba(70,150,58,.55)" : "rgba(120,190,85,.45)";
      g.lineWidth = 2;
      const bh = 6 + wrnd() * 10;
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + 2, py - bh * 0.6, px + 5, py - bh);
      g.stroke();
    }
    // 草丛内部深浅起伏
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? "rgba(20,70,30,.18)" : "rgba(150,220,120,.1)";
      const px = z.x + 18 + wrnd() * (z.w - 36);
      const py = z.y + 18 + wrnd() * (z.h - 36);
      g.beginPath();
      g.ellipse(px, py, 26 + wrnd() * 34, 10 + wrnd() * 14, wrnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // 静态底层草簇
    g.strokeStyle = "rgba(120,200,95,.55)";
    g.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const bx = z.x + 8 + wrnd() * (z.w - 16);
      const by = z.y + 10 + wrnd() * (z.h - 16);
      const bh = 7 + wrnd() * 9;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + 2, by - bh * 0.6, bx + 4, by - bh);
      g.stroke();
    }
    g.restore();
  }

  // 草簇与蘑菇
  g.save();
  g.strokeStyle = "rgba(70,150,70,.5)";
  g.lineWidth = 2;
  for (const t of TUFTS) {
    g.beginPath();
    g.moveTo(t.x, t.y);
    g.quadraticCurveTo(t.x + t.s * 0.2, t.y - t.s, t.x + t.s * 0.7, t.y - t.s * 1.4);
    g.moveTo(t.x, t.y);
    g.quadraticCurveTo(t.x - t.s * 0.3, t.y - t.s, t.x - t.s * 0.8, t.y - t.s * 1.1);
    g.stroke();
  }
  g.restore();
  for (const m of MUSHROOMS) {
    g.fillStyle = "#e8e0c8";
    g.fillRect(m.x - 1, m.y - 4, 2, 5);
    g.fillStyle = "#d8604a";
    g.beginPath();
    g.arc(m.x, m.y - 5, m.s, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff4e2";
    g.beginPath();
    g.arc(m.x - 1, m.y - 6, m.s * 0.3, 0, Math.PI * 2);
    g.fill();
  }

  // 树木 / 石头 / 花 / 研究所 / 路牌
  for (const [x, y] of TREES) drawTree(g, x, y);
  for (const [x, y, r] of ROCKS) drawRock(g, x, y, r);
  drawFlowers(g);
  drawLab(g);
  drawSigns(g);

  cache = c;
  return c;
}

// ---------------------------------------------------------------- 逐帧绘制
export function drawWorld(ctx, game) {
  const t = game.worldTime;
  const w = game.world;
  ctx.drawImage(buildWorldCache(), 0, 0);

  // 水面涟漪
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = 0.35 + i * 0.2;
    ctx.globalAlpha = 0.35 - i * 0.08;
    ctx.beginPath();
    ctx.ellipse(POND.x + Math.sin(t * 1.2 + i) * 8, POND.y + i * 20 - 18,
      POND.rx * k, POND.ry * k * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 动态草叶
  for (const b of BLADES) {
    const sway = Math.sin(t * 2.2 + b.phase) * 4;
    ctx.strokeStyle = "rgba(154,226,110,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(b.x + sway, b.y - b.h * 0.6, b.x + sway * 1.6, b.y - b.h);
    ctx.stroke();
  }

  // 玩家在草丛里时显示沙沙声波
  if (w) {
    const zone = zoneAt(w.player.x, w.player.y);
    if (zone) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,200,.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = 12 + i * 9 + Math.sin(t * 8 + i) * 3;
        ctx.globalAlpha = 0.45 - i * 0.12;
        ctx.beginPath();
        ctx.arc(w.player.x, w.player.y + 8, r, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (game.drawBerries) game.drawBerries(ctx, t);
  drawProfessor(ctx, game, t);
  if (game.drawWilds) game.drawWilds(ctx, t);
  if (w && w.dust && w.dust.length) {
    ctx.save();
    for (const d of w.dust) {
      ctx.globalAlpha = Math.max(0, d.life / d.max) * 0.4;
      ctx.fillStyle = "#d8c49a";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  drawPlayer(ctx, game);

  // 前景草叶遮住脚踝，增加层次
  for (const b of FG_BLADES) {
    const sway = Math.sin(t * 2.4 + b.phase) * 5;
    ctx.strokeStyle = "rgba(96,190,90,.8)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(b.x + sway, b.y - b.h * 0.6, b.x + sway * 1.7, b.y - b.h);
    ctx.stroke();
  }

  drawAmbient(ctx, t);
}

function drawProfessor(ctx, game, t) {
  const x = PROFESSOR.x;
  const y = PROFESSOR.y + Math.sin(t * 2) * 1.5;
  ctx.save();
  ctx.fillStyle = "rgba(20,40,30,.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4f4f0";
  ctx.strokeStyle = "#cfd4d8";
  ctx.lineWidth = 2;
  roundRect(ctx, x - 13, y - 10, 26, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e2a06b";
  ctx.beginPath();
  ctx.arc(x, y - 22, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8c8c8";
  ctx.beginPath();
  ctx.arc(x, y - 26, 12, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x - 5, y - 22, 4, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 22, 4, 0, Math.PI * 2);
  ctx.moveTo(x - 1, y - 22);
  ctx.lineTo(x + 1, y - 22);
  ctx.stroke();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(x - 5, y - 22, 1.6, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 22, 1.6, 0, Math.PI * 2);
  ctx.fill();

  const claimable = (game.p.quests || []).some((q) => q.progress >= q.goal);
  if (claimable) {
    const bob = Math.sin(t * 5) * 2;
    ctx.fillStyle = "#ffd447";
    ctx.strokeStyle = "#8a5a10";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 58 + bob, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6b3a08";
    ctx.font = "900 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y - 57 + bob);
  }

  ctx.fillStyle = "rgba(20,34,24,.55)";
  roundRect(ctx, x - 36, y + 32, 72, 18, 8);
  ctx.fill();
  ctx.fillStyle = "#fff8e2";
  ctx.font = "800 10px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(PROFESSOR.name, x, y + 41);
  ctx.restore();
}

function drawPlayer(ctx, game) {
  const w = game.world;
  const p = w.player;
  const moving = w.moving;
  const phase = p.walkPhase;
  ctx.save();
  ctx.fillStyle = "rgba(20,40,30,.22)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 20, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const swing = moving ? Math.sin(phase) * 4 : 0;
  ctx.strokeStyle = "#3f5f8f";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x - 6, p.y + 8);
  ctx.lineTo(p.x - 6 + swing, p.y + 20);
  ctx.moveTo(p.x + 6, p.y + 8);
  ctx.lineTo(p.x + 6 - swing, p.y + 20);
  ctx.stroke();

  ctx.fillStyle = "#e8b23a";
  roundRect(ctx, p.x - 14, p.y - 10, 28, 20, 7);
  ctx.fill();
  ctx.fillStyle = "#e8504a";
  roundRect(ctx, p.x - 11, p.y - 8, 22, 20, 8);
  ctx.fill();
  ctx.fillStyle = "#fff4e2";
  ctx.fillRect(p.x - 5, p.y - 6, 10, 14);
  ctx.fillStyle = "#e2a06b";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 20, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8504a";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 24, 11, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(p.x - 13, p.y - 25, 26, 4);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 24, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(p.x + (p.dir >= 0 ? 4 : -4), p.y - 19, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAmbient(ctx, t) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  for (let i = 0; i < 16; i++) {
    const x = ((t * (18 + i * 4) + i * 173) % (WORLD_W + 120)) - 60;
    const y = 160 + Math.sin(t * 1.5 + i) * 40 + i * 78;
    ctx.fillStyle = i % 3 === 0 ? "#fff6b0" : "#d8ffb0";
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
