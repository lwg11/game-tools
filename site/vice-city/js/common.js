/**
 * 罪恶都市 · 公共常量与工具
 * ------------------------------------------------------------
 * 世界参数 / 数学工具 / 随机数 / 调色板 / 对象池 / 通用绘制辅助。
 * 所有游戏模块共享本文件，禁止在本文件内引入 Three.js（保持纯净可测）。
 */

// ---------------------------------------------------------------- 世界常量
export const WORLD = {
  size: 2400,            // 城市边长（米），以原点为中心
  half: 1200,
  block: 100,            // 街区块边长
  roadW: 16,             // 道路宽度
  sidewalkW: 5,          // 人行道宽度
  gridN: 13,             // 道路网格数量（奇数，中心一条主路）
};

/** 昼夜：一天时长（秒）与关键时间点 */
export const DAY_LENGTH = 240; // 240 秒 = 24 小时
export const TIME = { dawn: 5.5, day: 8, dusk: 18.5, night: 20 };

// ---------------------------------------------------------------- 调色板（霓虹 80s）
export const PALETTE = {
  neonPink: "#ff4fa3",
  neonCyan: "#23d5e8",
  neonYellow: "#ffe066",
  neonPurple: "#9b5de5",
  neonOrange: "#ff8c42",
  neonMint: "#3fe0b0",
  road: "#2b2f36",
  roadLine: "#f2d16b",
  sidewalk: "#8a8f98",
  grass: "#3e7d44",
  sand: "#e8d8a8",
  water: "#1f6fa8",
  building: ["#f2b5d4", "#f6d8a8", "#a8d8f0", "#c8b6e2", "#f0a8a0", "#a8e0c8", "#d8d0c0", "#9fb8d8"],
  downtown: ["#b8c4d0", "#98a8bc", "#c0ccd8", "#8898a8"],
  window: "#1c2a3a",
  taxi: "#f5c518",
  police: "#f0f0f0",
  player: "#2fa3e8",
};

// ---------------------------------------------------------------- 数学工具
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const deg2rad = (d) => (d * Math.PI) / 180;

/** 2D（XZ 平面）距离 */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 角度插值（处理 -PI/PI 环绕） */
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** 角度差（带环绕） */
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * 确定性随机数（mulberry32），用于城市生成的可复现布局
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 用确定性随机器做区间随机 */
export function srand(rnd, a, b) {
  return a + rnd() * (b - a);
}

// ---------------------------------------------------------------- AABB（XZ 平面）
/**
 * AABB: { minX, minZ, maxX, maxZ }
 * 用于车辆 vs 建筑的碰撞与快速剔除。
 */
export function aabbCenter(cx, cz, w, d) {
  return { minX: cx - w / 2, minZ: cz - d / 2, maxX: cx + w / 2, maxZ: cz + d / 2 };
}

export function aabbIntersects(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** 圆（cx,cz,r）与 AABB 的最近点推出向量；返回 null 表示无碰撞 */
export function circleAABB(cx, cz, r, box) {
  const nx = clamp(cx, box.minX, box.maxX);
  const nz = clamp(cz, box.minZ, box.maxZ);
  const dx = cx - nx;
  const dz = cz - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const push = r - d;
  return { x: (dx / d) * push, z: (dz / d) * push, depth: push };
}

// ---------------------------------------------------------------- 对象池
/**
 * 简易对象池：复用对象，避免热循环 GC。
 * @param createFn 创建对象
 * @param resetFn  回收时重置（可选）
 */
export class Pool {
  constructor(createFn, resetFn = null) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.free = [];
  }
  acquire() {
    const obj = this.free.pop() || this.createFn();
    return obj;
  }
  release(obj) {
    if (this.resetFn) this.resetFn(obj);
    this.free.push(obj);
  }
}

// ---------------------------------------------------------------- Canvas 贴图辅助
/**
 * 生成 CanvasTexture（供 Three.js 使用；headless 环境下不可用会抛错，调用方需保证环境）。
 * @param width 宽度
 * @param height 高度
 * @param drawFn (ctx, w, h) => void 绘制内容
 */
export function makeCanvasTexture(THREE, width, height, drawFn) {
  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext("2d");
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------- 颜色工具
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function multiplyColor(hex, mul) {
  const { r, g, b } = hexToRgb(hex);
  const m = (v) => clamp(Math.round(v * mul), 0, 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function rgbaOf(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------- 帧率工具
export class FrameStats {
  constructor() {
    this.frames = 0;
    this.last = 0;
    this.fps = 0;
    // 移动平均耗时（ms），用于 HUD 调试显示
    this.startTime = 0;
    this.avgMs = 0;
  }
  tick(now) {
    this.frames++;
    if (now - this.last >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.last = now;
    }
  }
  begin() {
    this.startTime = performance.now();
  }
  end() {
    const ms = performance.now() - this.startTime;
    this.avgMs = this.avgMs * 0.9 + ms * 0.1;
  }
}
