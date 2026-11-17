/**
 * 可破坏地形
 * 采用 80×45 的瓦片网格（每格 16px）：
 * - 支持坑洞、悬崖、桥、洞顶等结构
 * - 爆炸会真实挖掉瓦片，地表也会随之塌陷
 * - 地形离屏缓存，只有爆炸时才重绘
 */
import { WORLD, THEMES } from "./levels.js";

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

function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class Terrain {
  constructor(level) {
    this.level = level;
    this.cols = WORLD.cols;
    this.rows = WORLD.rows;
    this.tile = WORLD.tile;
    this.grid = new Uint8Array(this.cols * this.rows);
    this.rng = mulberry32(level.seed || 1);
    this.decor = [];
    this.canvas = document.createElement("canvas");
    this.canvas.width = WORLD.w;
    this.canvas.height = WORLD.h;
    this.ctx = this.canvas.getContext("2d");
    this._build();
    this._makeDecor();
    this.redraw(THEMES[level.theme] || THEMES.day);
  }

  // ------------------------------------------------------------ 基础操作
  idx(c, r) { return r * this.cols + c; }

  solid(c, r) {
    if (c < 0 || c >= this.cols) return true; // 左右边界视为墙
    if (r < 0) return false;
    if (r >= this.rows) return false;
    return this.grid[this.idx(c, r)] === 1;
  }

  solidAt(x, y) {
    return this.solid(Math.floor(x / this.tile), Math.floor(y / this.tile));
  }

  fillRect(c0, r0, c1, r1, value = 1) {
    const a = Math.max(0, Math.min(c0, c1));
    const b = Math.min(this.cols - 1, Math.max(c0, c1));
    const c = Math.max(0, Math.min(r0, r1));
    const d = Math.min(this.rows - 1, Math.max(r0, r1));
    for (let r = c; r <= d; r++) {
      for (let col = a; col <= b; col++) this.grid[this.idx(col, r)] = value;
    }
  }

  clearRect(c0, r0, c1, r1) {
    this.fillRect(c0, r0, c1, r1, 0);
  }

  /** 从指定像素 y 向下寻找第一个实心面，找不到返回 null */
  surfaceBelow(x, fromY = 0) {
    const c = Math.floor(x / this.tile);
    if (c < 0 || c >= this.cols) return null;
    const start = Math.max(0, Math.floor(fromY / this.tile));
    for (let r = start; r < this.rows; r++) {
      if (this.solid(c, r)) return r * this.tile;
    }
    return null;
  }

  /** 从顶部扫描，用于出生点与落点检测 */
  surfaceTop(x) {
    return this.surfaceBelow(x, 0);
  }

  /** 圆形与地形是否相交（用于弹道碰撞） */
  circleHit(x, y, radius) {
    if (x - radius < 0 || x + radius > WORLD.w || y - radius > WORLD.h) return true;
    if (this.solidAt(x, y)) return true;
    const pts = 8;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      if (this.solidAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return true;
    }
    return false;
  }

  /** 爆炸挖洞，返回实际影响的像素半径 */
  carve(cx, cy, radius) {
    const r2 = radius * radius;
    const c0 = Math.floor((cx - radius) / this.tile);
    const c1 = Math.floor((cx + radius) / this.tile);
    const r0 = Math.floor((cy - radius) / this.tile);
    const r1 = Math.floor((cy + radius) / this.tile);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        const px = c * this.tile + this.tile / 2;
        const py = r * this.tile + this.tile / 2;
        const dx = px - cx;
        const dy = py - cy;
        const edge = 0.82 + hash2(c, r, this.level.seed || 1) * 0.36;
        if (dx * dx + dy * dy <= r2 * edge) this.grid[this.idx(c, r)] = 0;
      }
    }
  }

  // ------------------------------------------------------------ 关卡地形
  _build() {
    const style = this.level.style || "hills";
    const rng = this.rng;
    if (style === "hills") this._hills(rng);
    else if (style === "canyon") this._canyon(rng);
    else if (style === "plateau") this._plateau(rng);
    else if (style === "bridge") this._bridge(rng);
    else if (style === "forest") this._forest(rng);
    else if (style === "volcano") this._volcano(rng);
    else if (style === "pyramid") this._pyramid(rng);
    else if (style === "cave") this._cave(rng);
    else if (style === "dunes") this._dunes(rng);
    else this._hills(rng);
  }

  _hills(rng) {
    const base = 33 + rng() * 2;
    for (let c = 0; c < this.cols; c++) {
      let h = base + Math.sin(c * 0.14 + this.level.seed) * 1.5 + Math.sin(c * 0.33) * 0.7;
      // 两处隆起，形成可利用的高地
      h -= Math.max(0, 5 - Math.abs(c - 24) * 0.35);
      h -= Math.max(0, 4 - Math.abs(c - 57) * 0.3);
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    this.fillRect(37, 25, 43, 26); // 悬空石台
  }

  _canyon(rng) {
    for (let c = 0; c < this.cols; c++) {
      const left = c < 27;
      const right = c > 53;
      let h;
      if (left) h = 33 - Math.max(0, 4 - Math.abs(c - 12) * 0.3);
      else if (right) h = 31 - Math.max(0, 4 - Math.abs(c - 66) * 0.3);
      else h = 42 - Math.round(Math.sin(((c - 27) / 26) * Math.PI) * 1.2);
      this.fillRect(c, h, c, this.rows - 1);
    }
    this.fillRect(33, 27, 37, 28);
    this.fillRect(45, 24, 49, 25);
  }

  _plateau(rng) {
    for (let c = 0; c < this.cols; c++) {
      let h;
      if (c < 34) h = 35 + Math.sin(c * 0.17) * 0.8;
      else if (c < 52) h = 31;
      else h = 26 + Math.sin(c * 0.2) * 0.6;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 高台前沿的断崖
    this.fillRect(51, 26, 52, this.rows - 1);
    this.fillRect(18, 25, 22, 26);
  }

  _bridge(rng) {
    for (let c = 0; c < this.cols; c++) {
      let h;
      if (c < 24) h = 32;
      else if (c > 56) h = 30;
      else h = 43;
      this.fillRect(c, h, c, this.rows - 1);
    }
    // 中间深谷
    this.clearRect(24, 20, 56, 42);
    // 石桥与桥墩
    this.fillRect(23, 36, 57, 37);
    this.fillRect(31, 38, 33, this.rows - 1);
    this.fillRect(47, 38, 49, this.rows - 1);
  }

  _forest(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 34 + Math.sin(c * 0.12 + 1.4) * 2.4 + Math.sin(c * 0.29) * 1.1;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    this.fillRect(29, 27, 33, 28);
    this.fillRect(48, 24, 51, 25);
    // 小洞穴
    this.clearRect(39, 32, 44, 36);
  }

  _volcano(rng) {
    for (let c = 0; c < this.cols; c++) {
      const dist = Math.abs(c - 44);
      const peak = Math.max(0, 15 - dist * 0.85);
      const h = 38 - peak - Math.sin(c * 0.16) * 0.6;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 火山口
    this.clearRect(41, 21, 47, 25);
    this.fillRect(42, 26, 46, 27);
    this.fillRect(35, 30, 37, 31);
  }

  _pyramid(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 37 + Math.sin(c * 0.2) * 0.5;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 阶梯金字塔（中间为塔，右侧敌人有掩体）
    this.fillRect(30, 34, 52, 40);
    this.fillRect(33, 29, 49, 33);
    this.fillRect(36, 24, 46, 28);
    this.fillRect(39, 19, 43, 23);
    // 顶部平台与侧面缺口
    this.fillRect(31, 35, 34, 39, 0);
    this.fillRect(48, 30, 51, 33, 0);
  }

  _cave(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 37 + Math.sin(c * 0.18) * 1.2;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 洞顶
    this.fillRect(0, 0, this.cols - 1, 7);
    for (let c = 4; c < this.cols; c += 9) {
      const len = 2 + Math.floor(rng() * 5);
      this.fillRect(c, 8, c, 7 + len);
    }
    // 洞内石笋
    this.fillRect(28, 33, 30, 36);
    this.fillRect(51, 34, 53, 36);
    this.fillRect(64, 29, 65, 33);
  }

  _dunes(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 35 + Math.sin(c * 0.085 + 2) * 4 + Math.sin(c * 0.21) * 1.8;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 风化岩台放在战场中央，避免出生点落在浮台上
    this.fillRect(39, 27, 44, 28);
    this.fillRect(46, 24, 49, 25);
  }

  // ------------------------------------------------------------ 装饰
  _makeDecor() {
    const rng = mulberry32((this.level.seed || 1) * 7 + 3);
    this.decor = [];
    for (let i = 0; i < 26; i++) {
      const c = Math.floor(rng() * this.cols);
      const y = this.surfaceBelow(c * this.tile + 8, 0);
      if (y == null) continue;
      const type = rng();
      this.decor.push({
        x: c * this.tile + 3 + rng() * 9,
        y,
        type: type < 0.34 ? "grass" : type < 0.58 ? "pebble" : type < 0.78 ? "bone" : "flower",
        s: 0.7 + rng() * 0.8,
        flip: rng() > 0.5,
      });
    }
  }

  // ------------------------------------------------------------ 绘制
  redraw(theme) {
    const ctx = this.ctx;
    const t = theme || THEMES.day;
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    const tile = this.tile;
    const dirt = t.dirt;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.solid(c, r)) continue;
        const x = c * tile;
        const y = r * tile;
        const n = hash2(c, r, this.level.seed || 1);
        const depth = this._depth(c, r);
        let color;
        if (depth === 0) color = t.grass;
        else if (depth < 3) color = dirt[0];
        else if (depth < 8) color = dirt[1];
        else color = dirt[2];
        // 基础色加一点噪声，避免大片死板色块
        ctx.fillStyle = color;
        ctx.fillRect(x, y, tile, tile);
        ctx.fillStyle = `rgba(0,0,0,${0.03 + n * 0.07})`;
        if (n > 0.55) ctx.fillRect(x + (n * 10) % 10, y + (n * 13) % 10, 3, 3);
        // 顶面草皮
        if (!this.solid(c, r - 1)) {
          ctx.fillStyle = t.grassLight;
          ctx.fillRect(x, y, tile, 4);
          ctx.fillStyle = t.grass;
          ctx.fillRect(x, y + 4, tile, 2);
          if (hash2(c, 7, 99) > 0.45) {
            ctx.fillStyle = t.grassLight;
            const gx = x + 2 + n * 9;
            ctx.fillRect(gx, y - 3, 1.5, 3);
            ctx.fillRect(gx + 3, y - 2, 1.5, 2);
          }
        }
        // 边缘阴影
        if (!this.solid(c - 1, r)) {
          ctx.fillStyle = "rgba(0,0,0,.18)";
          ctx.fillRect(x, y, 2, tile);
        }
        if (!this.solid(c + 1, r)) {
          ctx.fillStyle = "rgba(0,0,0,.14)";
          ctx.fillRect(x + tile - 2, y, 2, tile);
        }
        // 火山主题的岩浆裂缝
        if (t.id === "volcano" && depth > 6 && n > 0.86) {
          ctx.strokeStyle = "rgba(255,120,40,.5)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 4);
          ctx.lineTo(x + 8, y + 10);
          ctx.lineTo(x + 6, y + 15);
          ctx.stroke();
        }
      }
    }
    // 地表装饰
    for (const d of this.decor) {
      const y = this.surfaceBelow(d.x, d.y - 2);
      if (y == null || Math.abs(y - d.y) > 10) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.flip ? -1 : 1, 1);
      if (d.type === "grass") {
        ctx.strokeStyle = t.grassLight;
        ctx.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 3, 0);
          ctx.quadraticCurveTo(i * 4, -6 * d.s, i * 7, -9 * d.s);
          ctx.stroke();
        }
      } else if (d.type === "pebble") {
        ctx.fillStyle = "rgba(0,0,0,.22)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 4 * d.s, 2.4 * d.s, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === "bone") {
        ctx.strokeStyle = "rgba(238,228,200,.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-5 * d.s, 0);
        ctx.lineTo(6 * d.s, -2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-6 * d.s, -1, 1.6, 0, Math.PI * 2);
        ctx.arc(7 * d.s, -3, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(238,228,200,.65)";
        ctx.fill();
      } else {
        ctx.fillStyle = "#e8b76a";
        ctx.beginPath();
        ctx.arc(0, -4, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9d6b32";
        ctx.fillRect(-0.6, -4, 1.2, 4);
      }
      ctx.restore();
    }
  }

  _depth(c, r) {
    let d = 0;
    for (let i = r - 1; i >= 0; i--) {
      if (this.solid(c, i)) d++;
      else break;
    }
    return d;
  }
}
