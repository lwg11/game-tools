/**
 * 精灵宝可梦 · 丰缘草地
 * ------------------------------------------------------------
 * 开放世界地图、草丛遭遇、博士委托。
 * 调研结论（Bulbapedia / 官方训练家指南 / Pokemon GO 研究任务）：
 * - 野生宝可梦栖息在草丛，玩家在草丛中行走时按步触发随机遭遇；
 * - 遭遇后可以战斗、捕捉或逃跑，HP 越低越容易捕获；
 * - 研究/委托任务通常围绕“捕捉指定属性、击败野生宝可梦、行走距离”展开，
 *   完成后领取奖励，并解锁新的委托。
 */
import { SPECIES, TYPE_NAMES } from "./data.js";

export const WORLD_W = 1280;
export const WORLD_H = 720;

export const PROFESSOR = { x: 205, y: 330, name: "枫木博士" };

export const ZONES = [
  {
    id: "meadow", name: "101号草地", x: 390, y: 400, w: 250, h: 190,
    theme: "route", baseLevel: 3, tier: 1,
    species: ["poochyena", "zigzagoon", "wurmple", "taillow", "marill"],
  },
  {
    id: "forest", name: "橙华森林", x: 740, y: 90, w: 270, h: 190,
    theme: "forest", baseLevel: 8, tier: 2,
    species: ["treecko", "cacnea", "ralts", "beautifly", "sableye"],
  },
  {
    id: "pond", name: "池畔草丛", x: 610, y: 520, w: 190, h: 130,
    theme: "cave", baseLevel: 7, tier: 2,
    species: ["marill", "mudkip", "azumarill", "poochyena"],
  },
  {
    id: "rocky", name: "岩石坡", x: 1010, y: 400, w: 210, h: 180,
    theme: "gym", baseLevel: 13, tier: 3,
    species: ["geodude", "numel", "mawile", "electrike", "graveler"],
  },
];

const LAB = { x: 80, y: 90, w: 260, h: 180 };
const POND = { x: 900, y: 592, rx: 158, ry: 78 };

const TREES = [
  [60, 60], [150, 55], [245, 62], [345, 55], [440, 58], [540, 56], [640, 62],
  [760, 52], [865, 55], [975, 58], [1080, 52], [1180, 58], [1240, 96],
  [60, 360], [62, 455], [58, 550], [62, 645], [120, 690], [230, 696], [345, 690],
  [470, 700], [575, 694], [700, 700], [810, 694], [930, 700], [1040, 694], [1160, 700], [1242, 650],
  [1240, 300], [1242, 205], [1240, 480], [1238, 560],
  [380, 310], [670, 300], [700, 380], [860, 330], [980, 300], [980, 640], [1140, 300],
];

const ROCKS = [
  [355, 470, 18], [675, 560, 16], [980, 430, 20], [1190, 600, 24], [560, 230, 18],
  [840, 500, 16], [1240, 380, 20],
];

function inRect(x, y, r, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

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

// ---------------------------------------------------------------- 绘制
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

const BLADES = [];
for (const zone of ZONES) {
  for (let i = 0; i < 60; i++) {
    BLADES.push({
      zone: zone.id,
      x: zone.x + 8 + Math.random() * (zone.w - 16),
      y: zone.y + 10 + Math.random() * (zone.h - 18),
      h: 7 + Math.random() * 8,
      phase: Math.random() * 6,
    });
  }
}

const FLOWERS = [];
for (let i = 0; i < 46; i++) {
  let x = 40 + Math.random() * (WORLD_W - 80);
  let y = 80 + Math.random() * (WORLD_H - 120);
  if (x > LAB.x - 20 && x < LAB.x + LAB.w + 20 && y > LAB.y - 20 && y < LAB.y + LAB.h + 20) continue;
  FLOWERS.push({ x, y, c: Math.random() < 0.5 ? "#ffe27a" : "#ffb4d8", s: 2 + Math.random() * 2 });
}

export function drawWorld(ctx, game) {
  const t = game.worldTime;
  const w = game.world;

  // 草地底色
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, "#8fd8ff");
  sky.addColorStop(0.18, "#c9edff");
  sky.addColorStop(0.62, "#8ed06a");
  sky.addColorStop(1, "#5aa84c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // 远处山丘
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#5f9f74";
  ctx.beginPath();
  ctx.moveTo(0, 230);
  for (let x = 0; x <= WORLD_W; x += 80) {
    ctx.lineTo(x, 190 + Math.sin(x * 0.012) * 34 + Math.cos(x * 0.031) * 16);
  }
  ctx.lineTo(WORLD_W, 260);
  ctx.lineTo(0, 260);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 草纹
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = "#2f7c3a";
  ctx.lineWidth = 2;
  for (let y = 250; y < WORLD_H; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y + 16);
    ctx.stroke();
  }
  ctx.restore();

  drawPaths(ctx);

  // 荷叶与水面
  drawPond(ctx, t);

  // 草丛
  for (const z of ZONES) drawGrassZone(ctx, z, t, w);

  // 树木与石头
  for (const [x, y] of TREES) drawTree(ctx, x, y, t);
  for (const [x, y, r] of ROCKS) drawRock(ctx, x, y, r);

  drawFlowers(ctx, t);
  drawLab(ctx, t);
  drawSigns(ctx);
  drawProfessor(ctx, game, t);
  drawPlayer(ctx, game);
  drawAmbient(ctx, t);
}

function drawPaths(ctx) {
  const pts = [
    [270, 340], [400, 388], [520, 430], [680, 420], [820, 390],
    [950, 440], [1090, 500], [1220, 540],
  ];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#a87a45";
  ctx.lineWidth = 58;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = "#d9b47c";
  ctx.lineWidth = 46;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,245,210,.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 16]);
  ctx.stroke();
  ctx.restore();

  // 从主路到研究所
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#d9b47c";
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.moveTo(280, 345);
  ctx.quadraticCurveTo(270, 300, 250, 280);
  ctx.stroke();
  ctx.restore();
}

function drawPond(ctx, t) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx + 12, POND.ry + 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#5f9f5a";
  ctx.fill();
  const g = ctx.createLinearGradient(POND.x, POND.y - POND.ry, POND.x, POND.y + POND.ry);
  g.addColorStop(0, "#7fd8ff");
  g.addColorStop(1, "#2f8fc8");
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = 0.35 + i * 0.2;
    ctx.globalAlpha = 0.35 - i * 0.08;
    ctx.beginPath();
    ctx.ellipse(POND.x + Math.sin(t * 1.2 + i) * 8, POND.y + i * 16 - 14,
      POND.rx * k, POND.ry * k * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 荷叶
  for (const [dx, dy, r] of [[-70, -20, 16], [40, 20, 13], [82, -26, 11]]) {
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

function drawGrassZone(ctx, zone, t, w) {
  ctx.save();
  roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 24);
  const g = ctx.createLinearGradient(zone.x, zone.y, zone.x, zone.y + zone.h);
  g.addColorStop(0, "rgba(47,124,58,.82)");
  g.addColorStop(1, "rgba(31,92,44,.9)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(210,255,180,.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const b of BLADES) {
    if (b.zone !== zone.id) continue;
    const sway = Math.sin(t * 2.2 + b.phase) * 4;
    ctx.strokeStyle = "rgba(154,226,110,.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(b.x + sway, b.y - b.h * 0.6, b.x + sway * 1.6, b.y - b.h);
    ctx.stroke();
  }

  // 玩家在草丛里时显示沙沙声波
  if (w && zoneAt(w.player.x, w.player.y) === zone) {
    ctx.strokeStyle = "rgba(255,255,200,.55)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = 12 + i * 9 + Math.sin(t * 8 + i) * 3;
      ctx.globalAlpha = 0.45 - i * 0.12;
      ctx.beginPath();
      ctx.arc(w.player.x, w.player.y + 8, r, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawTree(ctx, x, y, t) {
  ctx.save();
  ctx.fillStyle = "rgba(20,50,20,.18)";
  ctx.beginPath();
  ctx.ellipse(x + 6, y + 18, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f4a2a";
  ctx.fillRect(x - 5, y - 2, 10, 24);
  const sway = Math.sin(t * 1.2 + x * 0.02) * 2;
  ctx.fillStyle = "#2f7c3a";
  ctx.beginPath();
  ctx.arc(x + sway, y - 18, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4f9f48";
  ctx.beginPath();
  ctx.arc(x - 16 + sway, y - 8, 19, 0, Math.PI * 2);
  ctx.arc(x + 17 + sway, y - 6, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,200,.22)";
  ctx.beginPath();
  ctx.arc(x - 7 + sway, y - 24, 10, 0, Math.PI * 2);
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

function drawFlowers(ctx, t) {
  ctx.save();
  for (const f of FLOWERS) {
    const sway = Math.sin(t * 2 + f.x) * 1.2;
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.arc(f.x + sway, f.y, f.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8c8";
    ctx.beginPath();
    ctx.arc(f.x + sway, f.y, f.s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLab(ctx, t) {
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

  // 窗户
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

  // 门
  ctx.fillStyle = "#8a5a2a";
  roundRect(ctx, LAB.x + LAB.w / 2 - 26, LAB.y + 122, 52, 58, 6);
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(LAB.x + LAB.w / 2 + 12, LAB.y + 152, 3, 0, Math.PI * 2);
  ctx.fill();

  // 招牌
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

  // 门前的台阶
  ctx.fillStyle = "#c9b184";
  roundRect(ctx, LAB.x + LAB.w / 2 - 34, LAB.y + 180, 68, 10, 4);
  ctx.fill();
  ctx.restore();
}

function drawSigns(ctx) {
  const signs = [
    [358, 604, "101号草地"],
    [706, 288, "橙华森林"],
    [585, 656, "池畔草丛"],
    [990, 608, "岩石坡"],
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

function drawProfessor(ctx, game, t) {
  const x = PROFESSOR.x;
  const y = PROFESSOR.y + Math.sin(t * 2) * 1.5;
  ctx.save();
  ctx.fillStyle = "rgba(20,40,30,.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 白大褂
  ctx.fillStyle = "#f4f4f0";
  ctx.strokeStyle = "#cfd4d8";
  ctx.lineWidth = 2;
  roundRect(ctx, x - 13, y - 10, 26, 32, 8);
  ctx.fill();
  ctx.stroke();
  // 头
  ctx.fillStyle = "#e2a06b";
  ctx.beginPath();
  ctx.arc(x, y - 22, 12, 0, Math.PI * 2);
  ctx.fill();
  // 灰发
  ctx.fillStyle = "#c8c8c8";
  ctx.beginPath();
  ctx.arc(x, y - 26, 12, Math.PI, Math.PI * 2);
  ctx.fill();
  // 眼镜
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x - 5, y - 22, 4, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 22, 4, 0, Math.PI * 2);
  ctx.moveTo(x - 1, y - 22);
  ctx.lineTo(x + 1, y - 22);
  ctx.stroke();
  // 眼睛
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(x - 5, y - 22, 1.6, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 22, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // 任务可领取时头顶感叹号
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

  // 名字
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
  // 腿
  ctx.strokeStyle = "#3f5f8f";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x - 6, p.y + 8);
  ctx.lineTo(p.x - 6 + swing, p.y + 20);
  ctx.moveTo(p.x + 6, p.y + 8);
  ctx.lineTo(p.x + 6 - swing, p.y + 20);
  ctx.stroke();

  // 背包
  ctx.fillStyle = "#e8b23a";
  roundRect(ctx, p.x - 14, p.y - 10, 28, 20, 7);
  ctx.fill();
  // 身体
  ctx.fillStyle = "#e8504a";
  roundRect(ctx, p.x - 11, p.y - 8, 22, 20, 8);
  ctx.fill();
  ctx.fillStyle = "#fff4e2";
  ctx.fillRect(p.x - 5, p.y - 6, 10, 14);
  // 头
  ctx.fillStyle = "#e2a06b";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 20, 11, 0, Math.PI * 2);
  ctx.fill();
  // 帽子
  ctx.fillStyle = "#e8504a";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 24, 11, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(p.x - 13, p.y - 25, 26, 4);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 24, 4, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(p.x + (p.dir >= 0 ? 4 : -4), p.y - 19, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAmbient(ctx, t) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  for (let i = 0; i < 10; i++) {
    const x = ((t * (18 + i * 4) + i * 173) % (WORLD_W + 120)) - 60;
    const y = 160 + Math.sin(t * 1.5 + i) * 40 + i * 42;
    ctx.fillStyle = i % 3 === 0 ? "#fff6b0" : "#d8ffb0";
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
