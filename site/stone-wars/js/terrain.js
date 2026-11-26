/**
 * 可破坏地形
 * 采用 80×45 的瓦片网格（每格 16px）：
 * - 支持坑洞、悬崖、桥、洞顶等结构
 * - 爆炸会真实挖掉瓦片，地表也会随之塌陷
 * - 材质等级系统（瓦片值）：
 *     1 = 泥土（1 次打击摧毁）——石器时代
 *     2 = 石头（2 次打击）——铁骑/火器时代
 *     3 = 混凝土（3 次打击）——机械时代
 *     4 = 金庚石（4 次打击）——修仙时代
 *     5 = 玄铁岩（不可破坏）——高难关卡
 *     6 = 无尽模式基岩（不可破坏）
 * - 瓦片值 3 同时兼作「关卡障碍石」（旧逻辑兼容）
 * - 材质 hp 网格记录每次打击后的剩余耐久
 * - 动态浮空岛 / 云朵平台 / 移动岛屿（随时间摆动，可承载单位）
 * - 地形离屏缓存，只有爆炸或平台移动时才重绘
 */
import { WORLD, THEMES } from "./levels.js";
import { clamp, TAU } from "./common.js";

/** 材质等级对应的初始耐久次数 */
const MAT_HP = { 1: 2, 2: 4, 3: 6, 4: 10, 5: Infinity, 6: Infinity };
/**
 * 根据爆炸威力计算对瓦片的摧毁次数。
 * power = 爆炸半径（像素），伤害越高、范围越大，摧毁次数越多。
 * 低威力技能只能蹭掉少量耐久，高威力技能可一次摧毁高等级石块。
 */
function damageToHits(power) {
  if (power < 40) return 1;
  if (power < 70) return 2;
  if (power < 100) return 3;
  if (power < 140) return 5;
  if (power < 180) return 8;
  return 12;
}
/** 各时代对应的基底材质等级 */
const ERA_MAT = { stone: 1, iron: 2, gun: 2, mech: 3, cultivation: 4 };

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
    // 材质耐久网格：记录每个瓦片剩余可承受打击次数
    this.hp = new Uint8Array(this.cols * this.rows);
    this.rng = mulberry32(level.seed || 1);
    this.hard = !!(level.hard || level.endless);
    this.eraMat = ERA_MAT[level.era] || 1;
    this.decor = [];
    // 动态平台（浮空岛 / 云朵 / 移动岛屿），不进入静态 grid，单独绘制与碰撞
    this.platforms = [];
    this.time = 0;
    this.canvas = document.createElement("canvas");
    this.canvas.width = WORLD.w;
    this.canvas.height = WORLD.h;
    this.ctx = this.canvas.getContext("2d");
    this._build();
    // 无尽模式铺一层不可破坏的基岩，防止玩家把敌人脚下整片地面挖空后自动刷波
    if (level.endless) this.fillRect(0, this.rows - 2, this.cols - 1, this.rows - 1, 6);
    // 高难关卡（21+）铺一层玄铁地基：炸不坏，杜绝「把石头全炸完」后的无解局
    if (level.hardFloor) {
      for (let c = 0; c < this.cols; c++) this.grid[this.idx(c, this.rows - 1)] = 5;
    }
    // 初始化所有瓦片的耐久
    this._initHp();
    // 前期关卡掺入少量高等级石头（不能一击必碎）
    this._mixHardTiles(level);
    this._addObstacles(level);
    this._makePlatforms(level);
    this._makeDecor();
    this.redraw(THEMES[level.theme] || THEMES.day);
  }

  // ------------------------------------------------------------ 动态平台（浮空岛 / 云朵 / 移动岛屿）
  /**
   * 根据关卡风格生成动态平台：
   * - floatpeak / penglai / spiritvalley / palace：浮空岛上下悬浮 + 少量横向漂移
   * - 其他修仙关卡：云朵平台左右漂移 + 上下悬浮小岛
   * - 非修仙关卡：不生成（保持经典体验）
   */
  _makePlatforms(level) {
    if (level.era !== "cultivation" && level.theme !== "cultivation"
      && level.theme !== "immortal" && level.theme !== "penglai"
      && level.theme !== "palace" && level.theme !== "spirit"
      && level.theme !== "swordgrave") return;
    const rng = mulberry32((level.seed || 1) * 17 + 5);
    const style = level.style || "hills";
    // 浮空岛：上下悬浮（ampY 大，ampX 小）
    const islandCount = style === "floatpeak" || style === "penglai" ? 5 : 3;
    for (let i = 0; i < islandCount; i++) {
      const w = 5 + Math.floor(rng() * 5); // 5~9 格宽
      const c0 = 18 + Math.floor(rng() * (this.cols - 36 - w));
      const baseY = 14 + Math.floor(rng() * 14); // 14~27 行（空中）
      this.platforms.push({
        type: "island",
        c0, c1: c0 + w - 1,
        baseY, baseX: 0,
        ampY: 2 + rng() * 3.5,       // 上下悬浮幅度（格）
        ampX: rng() * 1.5,           // 横向漂移幅度（格）
        speed: 0.5 + rng() * 0.7,
        phase: rng() * TAU,
        mat: 4,                       // 金庚石
        hp: Infinity, maxHp: Infinity,
        y: baseY, x: 0,
      });
    }
    // 云朵平台：左右漂移（ampX 大，ampY 小），半透明
    const cloudCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < cloudCount; i++) {
      const w = 6 + Math.floor(rng() * 4);
      const c0 = 12 + Math.floor(rng() * (this.cols - 24 - w));
      const baseY = 20 + Math.floor(rng() * 12);
      this.platforms.push({
        type: "cloud",
        c0, c1: c0 + w - 1,
        baseY, baseX: 0,
        ampY: 1 + rng() * 1.5,
        ampX: 4 + rng() * 5,
        speed: 0.35 + rng() * 0.4,
        phase: rng() * TAU,
        mat: 0,                       // 云朵无材质（不可破坏）
        hp: Infinity, maxHp: Infinity,
        y: baseY, x: 0,
      });
    }
    // 移动岛屿：横向来回移动（ampX 大），位置较低
    if (style === "penglai" || style === "spiritvalley" || rng() > 0.5) {
      const w = 4 + Math.floor(rng() * 3);
      const c0 = 24 + Math.floor(rng() * (this.cols - 48 - w));
      const baseY = 26 + Math.floor(rng() * 8);
      this.platforms.push({
        type: "move",
        c0, c1: c0 + w - 1,
        baseY, baseX: 0,
        ampY: 0.8 + rng() * 1.2,
        ampX: 8 + rng() * 8,
        speed: 0.4 + rng() * 0.5,
        phase: rng() * TAU,
        mat: 4,
        hp: Infinity, maxHp: Infinity,
        y: baseY, x: 0,
      });
    }
    this._updatePlatforms(0);
  }

  /** 更新所有动态平台的位置（每帧调用） */
  _updatePlatforms(dt) {
    this.time += dt;
    const t = this.time;
    for (const p of this.platforms) {
      p.y = p.baseY + Math.sin(t * p.speed + p.phase) * p.ampY;
      p.x = p.baseX + Math.sin(t * p.speed * 0.7 + p.phase * 1.3) * p.ampX;
      // 记录本帧位置，供单位随平台移动计算差值
      p._lastRect = this._platformRect(p);
    }
  }

  /** 平台左上角像素坐标 */
  _platformRect(p) {
    const tile = this.tile;
    return {
      x: (p.c0 + p.x) * tile,
      y: p.y * tile,
      w: (p.c1 - p.c0 + 1) * tile,
      h: tile,
    };
  }

  /** 点 (x,y) 是否落在某个动态平台上表面（用于承载单位） */
  platformAt(x, y) {
    const tile = this.tile;
    for (const p of this.platforms) {
      const r = this._platformRect(p);
      if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 4 && y <= r.y + tile * 0.7) {
        return p;
      }
    }
    return null;
  }

  /** 单位脚下平台（更宽松的判定，用于随平台移动） */
  platformUnder(x, y) {
    const tile = this.tile;
    for (const p of this.platforms) {
      const r = this._platformRect(p);
      if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 8 && y <= r.y + tile * 1.2) {
        return p;
      }
    }
    return null;
  }

  /** 动态平台是否阻挡弹道（圆形碰撞） */
  _platformCircleHit(x, y, radius) {
    for (const p of this.platforms) {
      const r = this._platformRect(p);
      // 圆与矩形相交
      const cx = clamp(x, r.x, r.x + r.w);
      const cy = clamp(y, r.y, r.y + r.h);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 快照 / 恢复（补天术）
  /** 保存当前地形快照（网格 + 平台状态） */
  snapshot() {
    return {
      grid: this.grid.slice(),
      hp: this.hp.slice(),
      platforms: this.platforms.map((p) => ({ ...p })),
    };
  }

  /** 恢复到指定快照 */
  restore(snap) {
    if (!snap || !snap.grid || snap.grid.length !== this.grid.length) return;
    this.grid.set(snap.grid);
    if (snap.hp && snap.hp.length === this.hp.length) this.hp.set(snap.hp);
    if (snap.platforms && snap.platforms.length === this.platforms.length) {
      for (let i = 0; i < snap.platforms.length; i++) Object.assign(this.platforms[i], snap.platforms[i]);
    }
  }

  // ------------------------------------------------------------ 基础操作
  idx(c, r) { return r * this.cols + c; }

  solid(c, r) {
    if (c < 0 || c >= this.cols) return true; // 左右边界视为墙
    if (r < 0) return false;
    if (r >= this.rows) return false;
    return this.grid[this.idx(c, r)] !== 0;
  }

  solidAt(x, y) {
    if (this.solid(Math.floor(x / this.tile), Math.floor(y / this.tile))) return true;
    // 动态平台：像素级矩形碰撞（上表面 + 薄体）
    return this._platformCircleHit(x, y, 1);
  }

  fillRect(c0, r0, c1, r1, value = 1) {
    const a = Math.max(0, Math.min(c0, c1));
    const b = Math.min(this.cols - 1, Math.max(c0, c1));
    const c = Math.max(0, Math.min(r0, r1));
    const d = Math.min(this.rows - 1, Math.max(r0, r1));
    for (let r = c; r <= d; r++) {
      for (let col = a; col <= b; col++) {
        this.grid[this.idx(col, r)] = value;
        // 同步初始化耐久
        this.hp[this.idx(col, r)] = MAT_HP[value] ?? 1;
      }
    }
  }

  /** 初始化所有瓦片的耐久值 */
  _initHp() {
    for (let i = 0; i < this.grid.length; i++) {
      this.hp[i] = MAT_HP[this.grid[i]] ?? 1;
    }
  }

  /** 前期关卡掺入少量高等级石头，让其不能一击必碎 */
  _mixHardTiles(level) {
    const id = Number(level.id) || 0;
    // 石器时代（1-8）：掺入少量石头（等级2）
    // 铁骑/火器（9-24）：掺入少量混凝土（等级3）
    // 机械（25-32）：掺入少量金庚石（等级4）
    // 修仙（33+）：基底已是金庚石，掺入少量玄铁岩（等级5）
    let hardVal, count;
    if (id <= 8) { hardVal = 2; count = 12; }
    else if (id <= 24) { hardVal = 3; count = 14; }
    else if (id <= 32) { hardVal = 4; count = 16; }
    else { hardVal = 5; count = 20; }
    if (level.endless) return;
    const rng = mulberry32((level.seed || 1) * 31 + 7);
    for (let i = 0; i < count; i++) {
      // 随机选一个地表瓦片替换为高等级材质
      const c = 4 + Math.floor(rng() * (this.cols - 8));
      // 从地表往下找第一个实心瓦片
      for (let r = 0; r < this.rows; r++) {
        if (this.grid[this.idx(c, r)] !== 0) {
          // 只替换基底材质（1/2/3/4），不替换障碍石和基岩
          const v = this.grid[this.idx(c, r)];
          if (v >= 1 && v <= 4) {
            this.grid[this.idx(c, r)] = hardVal;
            this.hp[this.idx(c, r)] = MAT_HP[hardVal];
          }
          break;
        }
      }
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
    let best = null;
    for (let r = start; r < this.rows; r++) {
      if (this.solid(c, r)) { best = r * this.tile; break; }
    }
    // 动态平台：取 fromY 以下最近的平台表面
    for (const p of this.platforms) {
      const rect = this._platformRect(p);
      if (x < rect.x - 2 || x > rect.x + rect.w + 2) continue;
      if (rect.y >= fromY - 2 && (best === null || rect.y < best)) best = rect.y;
    }
    return best;
  }

  /** 从顶部扫描，用于出生点与落点检测 */
  surfaceTop(x) {
    return this.surfaceBelow(x, 0);
  }

  /** 圆形与地形是否相交（用于弹道碰撞） */
  circleHit(x, y, radius) {
    if (x - radius < 0 || x + radius > WORLD.w || y - radius > WORLD.h) return true;
    if (this.solidAt(x, y)) return true;
    if (this._platformCircleHit(x, y, radius)) return true;
    const pts = 8;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      if (this.solidAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return true;
    }
    return false;
  }

  /** 爆炸挖洞，返回实际影响的像素半径。power 决定摧毁次数（威力越大，摧毁越快） */
  carve(cx, cy, radius, power = radius) {
    const r2 = radius * radius;
    const hits = damageToHits(power);
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
        const idx = this.idx(c, r);
        const v = this.grid[idx];
        if (v === 0) continue;
        // 不可破坏材质（5=玄铁岩, 6=基岩）
        if (v === 5 || v === 6) continue;
        if (dx * dx + dy * dy <= r2 * edge) {
          // 材质耐久递减：威力越大，一次扣减越多
          this.hp[idx] = Math.max(0, this.hp[idx] - hits);
          if (this.hp[idx] <= 0) {
            this.grid[idx] = 0;
            this.hp[idx] = 0;
          }
        }
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
    else if (style === "fortress") this._fortress(rng);
    else if (style === "trench") this._trench(rng);
    else if (style === "floatpeak") this._floatpeak(rng);
    else if (style === "swordgrave") this._swordgrave(rng);
    else if (style === "spiritvalley") this._spiritvalley(rng);
    else if (style === "penglai") this._penglai(rng);
    else if (style === "palace") this._palace(rng);
    else this._hills(rng);
  }

  // ------------------------------------------------------------ 修仙时代地形
  /** 仙山浮空：多座浮空仙山平台，底部云海 */
  _floatpeak(rng) {
    // 基底地面（较低的平原）
    for (let c = 0; c < this.cols; c++) {
      const h = 38 + Math.sin(c * 0.15 + 1) * 1.2;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 浮空仙山平台（7 座，高低错落，宏大壮观）
    const peaks = [
      { x0: 14, x1: 22, y: 30 },
      { x0: 26, x1: 34, y: 24 },
      { x0: 40, x1: 50, y: 28 },
      { x0: 54, x1: 62, y: 22 },
      { x0: 66, x1: 74, y: 26 },
      { x0: 34, x1: 44, y: 16 },
      { x0: 58, x1: 68, y: 12 },
    ];
    for (const p of peaks) {
      this.fillRect(p.x0, p.y, p.x1, p.y);
      // 平台下方的石柱支撑（更粗更高）
      const legX = Math.floor((p.x0 + p.x1) / 2);
      this.fillRect(legX, p.y + 1, legX, p.y + 4);
      // 副支撑柱
      if (p.x1 - p.x0 > 6) {
        this.fillRect(p.x0 + 1, p.y + 1, p.x0 + 1, p.y + 2);
        this.fillRect(p.x1 - 1, p.y + 1, p.x1 - 1, p.y + 2);
      }
    }
    // 底部云海（装饰性低洼）
    this.clearRect(6, 36, 16, 39);
    this.clearRect(28, 37, 38, 39);
    this.clearRect(52, 36, 62, 39);
    this.clearRect(70, 37, 78, 39);
    // 浮空小岛（装饰）
    this.fillRect(20, 20, 22, 20);
    this.fillRect(62, 18, 64, 18);
  }

  /** 剑冢：无数巨剑插地的剑冢地形 */
  _swordgrave(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 36 + Math.sin(c * 0.18 + 2) * 1.5;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 巨剑插地（剑柄朝上，剑身插入地面）
    const swords = [
      { x: 24, h: 10 }, { x: 32, h: 7 }, { x: 40, h: 12 },
      { x: 48, h: 8 }, { x: 56, h: 11 }, { x: 64, h: 6 },
      { x: 36, h: 5 }, { x: 52, h: 9 },
    ];
    for (const s of swords) {
      const ground = this.surfaceTop(s.x * this.tile) ?? (this.rows - 8) * this.tile;
      const top = Math.floor(ground / this.tile) - s.h;
      // 剑身
      this.fillRect(s.x, top, s.x, Math.floor(ground / this.tile) - 1, 3);
      // 剑格（横档）
      this.fillRect(s.x - 1, top, s.x + 1, top, 3);
    }
    // 中央高台
    this.fillRect(38, 30, 44, 31);
  }

  /** 灵脉峡谷：灵脉形成的峡谷，两侧高台，中间深谷 */
  _spiritvalley(rng) {
    for (let c = 0; c < this.cols; c++) {
      let h;
      if (c < 28) h = 30 - Math.max(0, 5 - Math.abs(c - 14) * 0.3);
      else if (c > 52) h = 28 - Math.max(0, 5 - Math.abs(c - 66) * 0.3);
      else h = 42 - Math.round(Math.sin(((c - 28) / 24) * Math.PI) * 2);
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 灵脉石柱（峡谷中的灵石柱）
    this.fillRect(34, 32, 35, 38);
    this.fillRect(46, 30, 47, 36);
    // 浮空灵台
    this.fillRect(38, 24, 42, 25);
    this.fillRect(30, 20, 33, 21);
    this.fillRect(50, 18, 53, 19);
  }

  /** 蓬莱仙岛：海上仙岛，多平台，底部海水 */
  _penglai(rng) {
    // 基底海面（较低的地面）
    for (let c = 0; c < this.cols; c++) {
      const h = 40 + Math.sin(c * 0.12 + 3) * 1.0;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 仙岛平台（大小不一，错落分布）
    const islands = [
      { x0: 16, x1: 24, y: 32 },
      { x0: 30, x1: 38, y: 26 },
      { x0: 44, x1: 52, y: 30 },
      { x0: 58, x1: 66, y: 24 },
      { x0: 36, x1: 46, y: 18 },
      { x0: 52, x1: 60, y: 14 },
    ];
    for (const p of islands) {
      this.fillRect(p.x0, p.y, p.x1, p.y);
      // 岛下石柱
      const legX = Math.floor((p.x0 + p.x1) / 2);
      this.fillRect(legX, p.y + 1, legX, p.y + 2 + Math.floor(rng() * 3));
    }
    // 中央主岛（最大）
    this.fillRect(34, 34, 48, 35);
    this.fillRect(36, 32, 46, 33);
  }

  /** 天宫台阶：天宫台阶式金字塔，层层递进 */
  _palace(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 38 + Math.sin(c * 0.2) * 0.8;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 台阶式金字塔（5 层，逐层收窄）
    const layers = [
      { x0: 28, x1: 54, y: 34 },
      { x0: 31, x1: 51, y: 30 },
      { x0: 34, x1: 48, y: 26 },
      { x0: 37, x1: 45, y: 22 },
      { x0: 40, x1: 42, y: 18 },
    ];
    for (const l of layers) {
      this.fillRect(l.x0, l.y, l.x1, l.y);
    }
    // 两侧天柱
    this.fillRect(24, 26, 25, 34);
    this.fillRect(57, 26, 58, 34);
    // 天柱顶部云台
    this.fillRect(23, 25, 26, 25);
    this.fillRect(56, 25, 59, 25);
  }

  /** 铁骑 / 火器时代的城堡要塞：中央城垛、两侧塔楼 */
  _fortress(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 36 + Math.sin(c * 0.15 + this.level.seed) * 0.7;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 两侧塔楼（避开左右出生点）
    this.fillRect(27, 28, 33, 35);
    this.fillRect(49, 27, 55, 35);
    this.clearRect(29, 32, 31, 35);
    this.clearRect(51, 31, 53, 35);
    // 中央城墙与城垛
    this.fillRect(34, 33, 48, 36);
    for (let c = 34; c <= 48; c += 3) this.fillRect(c, 31, c + 1, 32);
    // 城门洞
    this.clearRect(40, 34, 42, 36);
  }

  /** 火器时代的战壕：凹槽、沙袋掩体与断续胸墙 */
  _trench(rng) {
    for (let c = 0; c < this.cols; c++) {
      const h = 34 + Math.sin(c * 0.2 + 0.6) * 0.8;
      this.fillRect(c, Math.round(h), c, this.rows - 1);
    }
    // 两道战壕，中间保留通路
    this.clearRect(22, 34, 29, 36);
    this.clearRect(40, 34, 47, 36);
    // 沙袋掩体
    this.fillRect(32, 31, 35, 33);
    this.fillRect(52, 30, 55, 32);
    // 观察哨
    this.fillRect(17, 30, 19, 32);
    this.fillRect(62, 29, 64, 31);
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

  // ------------------------------------------------------------ 额外障碍
  /** 关卡越靠后，战场上的石柱、浮台、掩体与拱门越多 */
  _addObstacles(level) {
    const id = Number(level.id) || 0;
    if (level.endless) {
      const rng = mulberry32((level.seed || 1) * 7 + 31);
      for (let i = 0; i < 4; i++) this._placeObstacle(rng, ["pillar", "platform", "bunker", "arch"][i]);
      return;
    }
    const target = Math.min(12, Math.floor(id / 2));
    if (target <= 0) return;
    const rng = mulberry32((level.seed || 1) * 13 + 77);
    const types = ["pillar", "platform", "bunker", "arch", "bunker", "pillar", "platform", "arch"];
    // 高难关卡：玄铁巨柱 + 不可破坏石柱，保证后期地形不会被一次性炸穿
    if (this.hard) types.push("monolith", "pillar", "arch", "monolith");
    for (let i = 0; i < target; i++) {
      this._placeObstacle(rng, types[Math.floor(rng() * types.length)]);
    }
  }

  _placeObstacle(rng, type) {
    const c0 = 22 + Math.floor(rng() * 28);
    const c1 = Math.min(54, c0 + 2 + Math.floor(rng() * 4));
    // 高难关卡的所有人工石构都是玄铁岩（炸不坏），只留普通地形可以挖
    const v = this.hard ? 4 : 3;
    if (type === "pillar") {
      const h = 6 + Math.floor(rng() * 7);
      const top = this.rows - 3 - h;
      this.fillRect(c0, top, c1, this.rows - 3, v);
      // 中间留一个可穿越的缺口，避免把战场完全封死
      if (rng() > 0.3) {
        const gap = top + 2 + Math.floor(rng() * Math.max(1, h - 4));
        this.clearRect(c0, gap, c1, gap + 1);
      }
    } else if (type === "monolith") {
      // 玄铁巨柱：从地底直通上层，彻底免疫爆炸
      const h = 9 + Math.floor(rng() * 8);
      const top = this.rows - 2 - h;
      this.fillRect(c0, top, c1 + 1, this.rows - 2, 4);
    } else if (type === "platform") {
      const top = this.rows - 9 - Math.floor(rng() * 7);
      this.fillRect(c0, top, c1, top, v);
      if (rng() > 0.35) {
        const leg = rng() > 0.5 ? c0 : c1;
        this.fillRect(leg, top + 1, leg, top + 2 + Math.floor(rng() * 3), v);
      }
    } else if (type === "arch") {
      const h = 5 + Math.floor(rng() * 6);
      const top = this.rows - 3 - h;
      this.fillRect(c0, top, c0 + 1, this.rows - 3, v);
      this.fillRect(c1 - 1, top, c1, this.rows - 3, v);
      this.fillRect(c0, top, c1, top + 1, v);
    } else {
      // 地面掩体：只在地表以上堆 2~4 层石头
      const ground = this.surfaceTop(c0 * this.tile + this.tile) ?? (this.rows - 6) * this.tile;
      const top = Math.max(12, Math.floor(ground / this.tile) - 4);
      this.fillRect(c0, top, c1, Math.floor(ground / this.tile) - 1, v);
    }
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
        const tileValue = this.grid[this.idx(c, r)];
        const idx = this.idx(c, r);
        let color;
        if (tileValue === 6) color = "#2b3038"; // 无尽模式基岩
        else if (tileValue === 5) color = "#3c475e"; // 玄铁岩（不可破坏）
        else if (tileValue === 4) color = "#8a7a9a"; // 金庚石（修仙）
        else if (tileValue === 3) color = "#7a7a7a"; // 混凝土（机械）
        else if (tileValue === 2) color = "#6d665c"; // 石头（铁骑/火器）
        else if (depth === 0) color = t.grass;
        else if (depth < 3) color = dirt[0];
        else if (depth < 8) color = dirt[1];
        else color = dirt[2];
        // 基础色加一点噪声，避免大片死板色块
        ctx.fillStyle = color;
        ctx.fillRect(x, y, tile, tile);
        ctx.fillStyle = `rgba(0,0,0,${0.03 + n * 0.07})`;
        if (n > 0.55) ctx.fillRect(x + (n * 10) % 10, y + (n * 13) % 10, 3, 3);
        // 顶面草皮 / 石头高光
        if (!this.solid(c, r - 1)) {
          if (tileValue === 6) {
            ctx.fillStyle = "rgba(150,210,255,.35)";
            ctx.fillRect(x, y, tile, 3);
          } else if (tileValue === 5) {
            // 玄铁岩：冷色金属高光 + 菱形结晶，猛一看就知道炸不动
            ctx.fillStyle = "rgba(140,180,235,.5)";
            ctx.fillRect(x, y, tile, 3);
            ctx.fillStyle = "rgba(8,10,16,.55)";
            ctx.fillRect(x, y + tile - 3, tile, 3);
            ctx.fillStyle = "rgba(170,210,255,.5)";
            ctx.fillRect(x + 2 + (n * 6) % 8, y + 6 + (n * 9) % 8, 3, 3);
          } else if (tileValue === 4) {
            // 金庚石：紫金光泽 + 结晶纹理
            ctx.fillStyle = "rgba(200,180,255,.5)";
            ctx.fillRect(x, y, tile, 3);
            ctx.fillStyle = "rgba(40,20,60,.5)";
            ctx.fillRect(x, y + tile - 3, tile, 3);
            ctx.fillStyle = "rgba(220,200,255,.5)";
            ctx.fillRect(x + 2 + (n * 6) % 8, y + 6 + (n * 9) % 8, 3, 3);
          } else if (tileValue === 3) {
            // 混凝土：灰色工业质感
            ctx.fillStyle = "rgba(200,200,200,.4)";
            ctx.fillRect(x, y, tile, 3);
            ctx.fillStyle = "rgba(30,30,30,.5)";
            ctx.fillRect(x, y + tile - 3, tile, 3);
            if (n > 0.6) {
              ctx.strokeStyle = "rgba(40,40,40,.4)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x + 2, y + 5);
              ctx.lineTo(x + 9 + n * 4, y + 11);
              ctx.stroke();
            }
          } else if (tileValue === 2) {
            // 石头：浅灰高光 + 石缝
            ctx.fillStyle = "rgba(232,220,200,.42)";
            ctx.fillRect(x, y, tile, 3);
            ctx.fillStyle = "rgba(38,33,27,.5)";
            ctx.fillRect(x, y + tile - 3, tile, 3);
            if (n > 0.6) {
              ctx.strokeStyle = "rgba(34,29,23,.45)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x + 2, y + 5);
              ctx.lineTo(x + 9 + n * 4, y + 11);
              ctx.stroke();
            }
          } else {
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
        // 损伤裂纹：耐久低于最大值时显示裂纹，耐久越低裂纹越密
        const maxHp = MAT_HP[tileValue] ?? 1;
        if (maxHp !== Infinity && this.hp[idx] < maxHp && this.hp[idx] > 0) {
          const dmgRatio = 1 - this.hp[idx] / maxHp;
          const cracks = Math.ceil(dmgRatio * 3);
          ctx.strokeStyle = `rgba(10,8,6,${0.3 + dmgRatio * 0.4})`;
          ctx.lineWidth = 1;
          for (let ci = 0; ci < cracks; ci++) {
            const cn = hash2(c + ci * 7, r + ci * 13, this.level.seed || 1);
            ctx.beginPath();
            ctx.moveTo(x + 2 + cn * 8, y + 2);
            ctx.lineTo(x + 5 + cn * 6, y + 7 + cn * 4);
            ctx.lineTo(x + 3 + cn * 10, y + 13);
            ctx.stroke();
          }
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

  // ------------------------------------------------------------ 动态平台绘制（每帧）
  /**
   * 在主画布上绘制动态平台（浮空岛 / 云朵 / 移动岛屿）。
   * 平台每帧移动，因此不进入离屏缓存，由 game.js 每帧调用。
   */
  drawPlatforms(ctx, theme) {
    if (!this.platforms.length) return;
    const t = theme || THEMES.day;
    const tile = this.tile;
    for (const p of this.platforms) {
      const r = this._platformRect(p);
      const n = hash2(p.c0, Math.round(p.baseY), this.level.seed || 1);
      ctx.save();
      if (p.type === "cloud") {
        // 云朵：半透明白色蓬松质感 + 底部阴影
        ctx.globalAlpha = 0.82;
        const grd = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        grd.addColorStop(0, "rgba(255,255,255,.95)");
        grd.addColorStop(1, "rgba(210,225,245,.75)");
        ctx.fillStyle = grd;
        this._roundRect(ctx, r.x, r.y, r.w, r.h + 4, 8);
        ctx.fill();
        // 云团高光
        ctx.fillStyle = "rgba(255,255,255,.9)";
        for (let i = 0; i < Math.floor(r.w / 26); i++) {
          const cx = r.x + 14 + i * 26 + n * 6;
          ctx.beginPath();
          ctx.ellipse(cx, r.y + 4, 12, 5, 0, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(160,180,210,.35)";
        ctx.fillRect(r.x + 4, r.y + r.h - 2, r.w - 8, 3);
      } else {
        // 浮空岛 / 移动岛屿：金庚石质感 + 底部岩石 + 光晕
        const isMove = p.type === "move";
        // 底部光晕（修仙飘逸感）
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 2 + p.phase) * 0.1;
        const glow = ctx.createRadialGradient(
          r.x + r.w / 2, r.y + r.h, 4,
          r.x + r.w / 2, r.y + r.h, r.w * 0.7
        );
        glow.addColorStop(0, isMove ? "rgba(168,216,255,.8)" : "rgba(200,180,255,.8)");
        glow.addColorStop(1, "rgba(200,180,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(r.x - r.w * 0.3, r.y + r.h - 6, r.w * 1.6, r.h + 18);
        ctx.globalAlpha = 1;
        // 主体岩石
        const body = ctx.createLinearGradient(0, r.y, 0, r.y + r.h + 6);
        body.addColorStop(0, "#8a7a9a");
        body.addColorStop(0.5, "#5a4a6c");
        body.addColorStop(1, "#3a2e48");
        ctx.fillStyle = body;
        this._roundRect(ctx, r.x, r.y, r.w, r.h + 5, 5);
        ctx.fill();
        // 顶部灵草皮
        ctx.fillStyle = t.grassLight;
        this._roundRect(ctx, r.x, r.y, r.w, 5, 3);
        ctx.fill();
        ctx.fillStyle = t.grass;
        ctx.fillRect(r.x + 2, r.y + 4, r.w - 4, 2);
        // 紫金结晶高光
        ctx.fillStyle = "rgba(220,200,255,.55)";
        for (let i = 0; i < Math.floor(r.w / 22); i++) {
          const cx = r.x + 8 + i * 22 + n * 5;
          ctx.fillRect(cx, r.y + 8 + n * 3, 3, 3);
        }
        // 底部尖锐岩石（浮空岛倒锥）
        if (!isMove) {
          ctx.fillStyle = "#4a3c5c";
          ctx.beginPath();
          ctx.moveTo(r.x + 3, r.y + r.h + 4);
          ctx.lineTo(r.x + r.w / 2, r.y + r.h + 12 + n * 4);
          ctx.lineTo(r.x + r.w - 3, r.y + r.h + 4);
          ctx.closePath();
          ctx.fill();
        }
        // 边缘阴影
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillRect(r.x + 2, r.y + r.h + 2, r.w - 4, 3);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ 搬山术：放置石块
  /**
   * 在指定像素位置放置一组金庚石瓦片（3×2），形成可站立/阻挡的平台。
   * 返回是否成功放置。
   */
  placeBlocks(x, y, mat = 4) {
    const tile = this.tile;
    const c = Math.floor(x / tile);
    const r = Math.floor(y / tile);
    const w = 3, h = 2;
    let placed = false;
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        const cc = c + dc - 1;
        const rr = r + dr;
        if (cc < 0 || cc >= this.cols || rr < 0 || rr >= this.rows) continue;
        const idx = this.idx(cc, rr);
        // 只填充空气，不覆盖已有地形
        if (this.grid[idx] === 0) {
          this.grid[idx] = mat;
          this.hp[idx] = MAT_HP[mat] ?? 4;
          placed = true;
        }
      }
    }
    return placed;
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
