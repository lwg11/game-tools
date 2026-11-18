/**
 * 保卫萝卜 · 公共常量与工具（从 game.js 原样搬移）
 */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const THEMES = {
  day: { sky: ["#78c9ff", "#c7ecff", "#f4f7d8"], grass: ["#7fd05a", "#3f8d36"], path: "#d9b47c", edge: "#8a5a2a", hill: "#6fbf52", tree: "#4c7a35", accent: "#fff3a8", night: false },
  sunset: { sky: ["#4b2a55", "#c85e49", "#ffc07a"], grass: ["#8ab85a", "#5e8d3a"], path: "#d3a46a", edge: "#7c4a24", hill: "#5e7a3c", tree: "#3f5a2c", accent: "#ffe0a0", night: false },
  night: { sky: ["#0c1224", "#1b2a48", "#35506a"], grass: ["#3f6b4a", "#25452f"], path: "#8b7a5a", edge: "#4f412c", hill: "#274432", tree: "#182b1d", accent: "#dce9ff", night: true },
  snow: { sky: ["#bfe6ff", "#e6f7ff", "#ffffff"], grass: ["#d8eef7", "#a9d4e5"], path: "#b9c9d9", edge: "#7e93a8", hill: "#c4e4ef", tree: "#8fbfa0", accent: "#ffffff", night: false },
  autumn: { sky: ["#ffd08a", "#ffb35e", "#f6e0b0"], grass: ["#c6a94e", "#8f7a2e"], path: "#b98e58", edge: "#6f4a24", hill: "#a88a3e", tree: "#7c5a2a", accent: "#ffe6a0", night: false },
};

// ---------------------------------------------------------------- 路径
export function buildPath(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { points, segs, total };
}

export function pathPos(path, t) {
  const tt = clamp(t, 0, path.total);
  for (const s of path.segs) {
    if (tt <= s.start + s.len) {
      const k = (tt - s.start) / s.len;
      return {
        x: s.a.x + (s.b.x - s.a.x) * k,
        y: s.a.y + (s.b.y - s.a.y) * k,
        angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x),
      };
    }
  }
  const last = path.points[path.points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

export function pointToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

export function distToPath(path, x, y) {
  let best = Infinity;
  for (const s of path.segs) best = Math.min(best, pointToSegment(x, y, s.a, s.b));
  return best;
}

export function makeSpots(path) {
  const shots = [];
  for (const s of path.segs) {
    const len = s.len;
    if (len < 90) continue;
    const nx = -(s.b.y - s.a.y) / len;
    const ny = (s.b.x - s.a.x) / len;
    for (const k of [0.33, 0.68]) {
      for (const side of [-1, 1]) {
        const x = s.a.x + (s.b.x - s.a.x) * k + nx * 92 * side;
        const y = s.a.y + (s.b.y - s.a.y) * k + ny * 92 * side;
        if (x < 120 || x > 1160 || y < 140 || y > 605) continue;
        if (distToPath(path, x, y) < 76) continue;
        if (shots.some((p) => Math.hypot(p.x - x, p.y - y) < 62)) continue;
        shots.push({ x, y, tower: null });
      }
    }
  }
  if (shots.length < 8) {
    for (const s of path.segs) {
      const len = s.len;
      if (len < 80) continue;
      const nx = -(s.b.y - s.a.y) / len;
      const ny = (s.b.x - s.a.x) / len;
      for (const k of [0.5]) {
        for (const side of [-1, 1]) {
          const x = s.a.x + (s.b.x - s.a.x) * k + nx * 74 * side;
          const y = s.a.y + (s.b.y - s.a.y) * k + ny * 74 * side;
          if (x < 110 || x > 1165 || y < 135 || y > 610) continue;
          if (distToPath(path, x, y) < 62) continue;
          if (shots.some((p) => Math.hypot(p.x - x, p.y - y) < 58)) continue;
          shots.push({ x, y, tower: null });
        }
      }
    }
  }
  return shots.slice(0, 14);
}
