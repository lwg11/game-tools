/**
 * 保卫萝卜 · 塔防
 * ------------------------------------------------------------
 * 怪物沿路径走向胡萝卜，玩家在路径两侧建造炮塔。
 * 5 种炮塔：瓶子炮 / 冰锥塔 / 火焰瓶 / 闪电塔 / 多重箭。
 */
import "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { toast, icon } from "../../assets/js/ui.js";
import {
  W, H, TOWERS, TOWER_ORDER, ENEMIES, LEVELS, TOTAL_LEVELS, getLevel,
} from "./levels.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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

const THEMES = {
  day: { sky: ["#78c9ff", "#c7ecff", "#f4f7d8"], grass: ["#7fd05a", "#3f8d36"], path: "#d9b47c", edge: "#8a5a2a", hill: "#6fbf52", tree: "#4c7a35", accent: "#fff3a8", night: false },
  sunset: { sky: ["#4b2a55", "#c85e49", "#ffc07a"], grass: ["#8ab85a", "#5e8d3a"], path: "#d3a46a", edge: "#7c4a24", hill: "#5e7a3c", tree: "#3f5a2c", accent: "#ffe0a0", night: false },
  night: { sky: ["#0c1224", "#1b2a48", "#35506a"], grass: ["#3f6b4a", "#25452f"], path: "#8b7a5a", edge: "#4f412c", hill: "#274432", tree: "#182b1d", accent: "#dce9ff", night: true },
  snow: { sky: ["#bfe6ff", "#e6f7ff", "#ffffff"], grass: ["#d8eef7", "#a9d4e5"], path: "#b9c9d9", edge: "#7e93a8", hill: "#c4e4ef", tree: "#8fbfa0", accent: "#ffffff", night: false },
  autumn: { sky: ["#ffd08a", "#ffb35e", "#f6e0b0"], grass: ["#c6a94e", "#8f7a2e"], path: "#b98e58", edge: "#6f4a24", hill: "#a88a3e", tree: "#7c5a2a", accent: "#ffe6a0", night: false },
};

// ---------------------------------------------------------------- 路径
function buildPath(points) {
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

function pathPos(path, t) {
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

function pointToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

function distToPath(path, x, y) {
  let best = Infinity;
  for (const s of path.segs) best = Math.min(best, pointToSegment(x, y, s.a, s.b));
  return best;
}

function makeSpots(path) {
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

// ---------------------------------------------------------------- 音效
class Sfx {
  constructor() { this.ctx = null; this.master = null; this.enabled = true; }
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur, type = "sine", vol = 0.1, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, cutoff = 900) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }
  shoot() { this.tone(760, 0.05, "square", 0.03, 520); }
  hit() { this.tone(220, 0.04, "square", 0.025, 150); }
  boom() { this.noise(0.3, 0.22, 500); this.tone(80, 0.3, "sine", 0.18, 40); }
  coin() { this.tone(900, 0.08, "sine", 0.07); setTimeout(() => this.tone(1200, 0.09, "sine", 0.05), 60); }
  build() { this.tone(320, 0.12, "sine", 0.09, 520); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.07), i * 150)); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, "triangle", 0.07), i * 110)); }
  wave() { this.tone(220, 0.15, "triangle", 0.06); setTimeout(() => this.tone(170, 0.22, "triangle", 0.07), 120); }
}

// ---------------------------------------------------------------- 敌人
class Enemy {
  constructor(game, type, hpMul = 1, wave = 1) {
    const cfg = ENEMIES[type] || ENEMIES.slime;
    this.game = game;
    this.type = type;
    this.cfg = cfg;
    this.maxHp = Math.round(cfg.hp * hpMul * (1 + Math.max(0, wave - 1) * 0.035));
    this.hp = this.maxHp;
    this.speed = cfg.speed;
    this.gold = cfg.gold;
    this.r = cfg.r;
    this.t = 0;
    this.x = game.path.points[0].x;
    this.y = game.path.points[0].y;
    this.alive = true;
    this.slowT = 0;
    this.bob = rand(0, TAU);
    this.angle = 0;
    this.flash = 0;
    this.deathT = 0;
  }

  update(dt) {
    if (!this.alive) { this.deathT += dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    const slow = this.slowT > 0 ? 0.5 : 1;
    this.t += this.speed * slow * dt;
    this.bob += dt * 6;
    const p = pathPos(this.game.path, this.t);
    this.x = p.x;
    this.y = p.y;
    this.angle = p.angle;
    if (this.t >= this.game.path.total) {
      this.alive = false;
      this.game.onEnemyReach(this);
    }
  }

  takeDamage(n) {
    if (!this.alive) return;
    this.hp -= n;
    this.flash = 0.1;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0;
    this.game.kills += 1;
    this.game.gold += this.gold;
    this.game.addText(this.x, this.y - 34, `+${this.gold}`, "#ffe08a");
    this.game.spawnParticles(this.x, this.y - 18, 10, this.cfg.color, "spark");
    this.game.sfx.coin();
  }

  draw(ctx) {
    if (!this.alive && this.deathT > 0.7) return;
    const alpha = this.alive ? 1 : clamp(1 - this.deathT / 0.7, 0, 1);
    const bob = Math.sin(this.bob) * 2.5;
    const skin = this.slowT > 0 ? "#a9dcf5" : this.cfg.color;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y - this.r * 0.7 + bob);
    ctx.fillStyle = "rgba(20, 40, 10, .22)";
    ctx.beginPath();
    ctx.ellipse(0, this.r * 0.85 - bob, this.r, this.r * 0.3, 0, 0, TAU);
    ctx.fill();
    // 角
    ctx.fillStyle = this.cfg.horn;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.55, -this.r * 0.55);
    ctx.lineTo(-this.r * 0.9, -this.r * 1.15);
    ctx.lineTo(-this.r * 0.2, -this.r * 0.8);
    ctx.closePath();
    ctx.moveTo(this.r * 0.55, -this.r * 0.55);
    ctx.lineTo(this.r * 0.9, -this.r * 1.15);
    ctx.lineTo(this.r * 0.2, -this.r * 0.8);
    ctx.closePath();
    ctx.fill();
    // 身体
    ctx.fillStyle = skin;
    ctx.strokeStyle = this.cfg.horn;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r, this.r * 0.92, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // 眼睛
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.36, -this.r * 0.15, this.r * 0.28, this.r * 0.3, 0, 0, TAU);
    ctx.ellipse(this.r * 0.36, -this.r * 0.15, this.r * 0.28, this.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1d2418";
    ctx.beginPath();
    ctx.arc(-this.r * 0.33, -this.r * 0.13, this.r * 0.12, 0, TAU);
    ctx.arc(this.r * 0.39, -this.r * 0.13, this.r * 0.12, 0, TAU);
    ctx.fill();
    // 嘴
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, this.r * 0.18, this.r * 0.3, 0.15, Math.PI - 0.15);
    ctx.stroke();
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 3;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (this.alive && this.hp < this.maxHp) {
      const ratio = clamp(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = "rgba(20, 30, 10, .55)";
      roundRect(ctx, this.x - 22, this.y - this.r * 2.2, 44, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = ratio > 0.5 ? "#8fe05c" : ratio > 0.25 ? "#ffcf5a" : "#ff6b5a";
      roundRect(ctx, this.x - 21, this.y - this.r * 2.2 + 1, 42 * ratio, 3, 1.5);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 弹道
class Bullet {
  constructor(game, x, y, target, type, damage, opts = {}) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.target = target;
    this.type = type;
    this.damage = damage;
    this.speed = opts.speed || 520;
    this.slow = opts.slow || 0;
    this.splash = opts.splash || 0;
    this.alive = true;
    this.angle = 0;
    this.age = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    if (!this.target || !this.target.alive) {
      this.alive = false;
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.target.r * 0.7 - this.y;
    const d = Math.hypot(dx, dy);
    this.angle = Math.atan2(dy, dx);
    if (d < 14) {
      this.target.takeDamage(this.damage);
      if (this.slow) this.target.slowT = Math.max(this.target.slowT, this.slow);
      if (this.splash) this.game.splash(this.target.x, this.target.y - 20, this.splash, this.damage * 0.65, this.target);
      this.game.spawnParticles(this.x, this.y, 5, this.type === "ice" ? "#bdf3ff" : "#ffd08a", "spark");
      this.game.sfx.hit();
      this.alive = false;
      return;
    }
    const step = this.speed * dt;
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.type === "arrow") {
      ctx.rotate(this.angle);
      ctx.strokeStyle = "#d7b46a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.fillStyle = "#f4eedd";
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(15, 0);
      ctx.lineTo(8, 3);
      ctx.closePath();
      ctx.fill();
    } else {
      const color = this.type === "ice" ? "#8fe4ff" : this.type === "fire" ? "#ff8a4a" : "#9ed15b";
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(30,50,20,.55)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, this.type === "fire" ? 7 : 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (this.type === "fire") {
        ctx.fillStyle = "rgba(255,220,100,.8)";
        ctx.beginPath();
        ctx.arc(-2, -2, 2.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 炮塔
class Tower {
  constructor(game, type, spot) {
    this.game = game;
    this.type = type;
    this.def = TOWERS[type];
    this.x = spot.x;
    this.y = spot.y;
    this.level = 1;
    this.cooldown = rand(0.1, 0.5);
    this.angle = -Math.PI / 2;
    this.invested = this.def.cost;
    this.flash = 0;
  }
  stats() {
    const f = 1 + (this.level - 1) * 0.35;
    return {
      damage: Math.round(this.def.damage * f),
      range: this.def.range + (this.level - 1) * 15,
      rate: this.def.rate * (1 - (this.level - 1) * 0.08),
      slow: this.def.slow || 0,
      splash: this.def.splash || 0,
      chain: this.def.chain || 0,
      targets: this.def.targets || 1,
    };
  }
  upgradeCost() { return Math.round(this.def.cost * 0.8 * this.level); }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const st = this.stats();
    const enemies = this.game.enemies
      .filter((e) => e.alive && Math.hypot(e.x - this.x, e.y - this.y) < st.range)
      .sort((a, b) => b.t - a.t);
    if (!enemies.length) return;
    this.cooldown = st.rate;
    this.angle = Math.atan2(enemies[0].y - this.y, enemies[0].x - this.x);
    this.flash = 0.12;
    if (this.type === "lightning") {
      const hit = [enemies[0]];
      for (let i = 1; i < st.chain; i++) {
        const prev = hit[hit.length - 1];
        const next = enemies.find((e) => !hit.includes(e) && Math.hypot(e.x - prev.x, e.y - prev.y) < 125);
        if (!next) break;
        hit.push(next);
      }
      const points = [{ x: this.x, y: this.y - 14 }];
      for (const e of hit) {
        points.push({ x: e.x, y: e.y - e.r * 0.7 });
        e.takeDamage(st.damage);
      }
      this.game.beams.push({ points, life: 0.18, max: 0.18 });
      this.game.sfx.shoot();
      return;
    }
    if (this.type === "arrow") {
      for (let i = 0; i < Math.min(st.targets, enemies.length); i++) {
        this.game.bullets.push(new Bullet(this.game, this.x, this.y - 14, enemies[i], "arrow", st.damage, { speed: 620 }));
      }
      this.game.sfx.shoot();
      return;
    }
    this.game.bullets.push(new Bullet(this.game, this.x, this.y - 14, enemies[0], this.type, st.damage, {
      speed: this.type === "fire" ? 380 : 540,
      slow: st.slow,
      splash: st.splash,
    }));
    this.game.sfx.shoot();
  }
  draw(ctx) {
    const st = this.stats();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(30, 50, 20, .22)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 23, 8, 0, 0, TAU);
    ctx.fill();
    // 底座
    ctx.fillStyle = "#b9b0a0";
    ctx.strokeStyle = "#7c7468";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 24, 11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8d8578";
    ctx.beginPath();
    ctx.ellipse(0, 3, 19, 8, 0, 0, TAU);
    ctx.fill();
    if (this.type === "bottle") {
      ctx.save();
      ctx.rotate(0);
      ctx.fillStyle = "#75a84c";
      ctx.strokeStyle = "#3f6b2a";
      ctx.lineWidth = 2;
      roundRect(ctx, -10, -24, 20, 30, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9ed15b";
      ctx.beginPath();
      ctx.arc(0, -26, 7, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(0, -24);
      ctx.rotate(this.angle + Math.PI / 2);
      ctx.fillStyle = "#5f8a2e";
      roundRect(ctx, -4, 0, 8, 22, 4);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    } else if (this.type === "ice") {
      ctx.fillStyle = "#7fd5e8";
      ctx.strokeStyle = "#4a9fb8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(14, -4);
      ctx.lineTo(-14, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.arc(-4, -16, 4, 0, TAU);
      ctx.fill();
    } else if (this.type === "fire") {
      ctx.fillStyle = "#e8804a";
      ctx.strokeStyle = "#9c4a24";
      ctx.lineWidth = 2;
      roundRect(ctx, -12, -26, 24, 30, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd35e";
      ctx.beginPath();
      ctx.arc(0, -34, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff8a3a";
      ctx.beginPath();
      ctx.arc(0, -35, 5, 0, TAU);
      ctx.fill();
    } else if (this.type === "lightning") {
      ctx.strokeStyle = "#7c5a96";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(0, -28);
      ctx.stroke();
      ctx.fillStyle = "#c9a7ff";
      ctx.strokeStyle = "#7c5a96";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -34, 11, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff2a8";
      ctx.beginPath();
      ctx.arc(0, -34, 4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = "#d7b46a";
      ctx.strokeStyle = "#7c5a2a";
      ctx.lineWidth = 2;
      roundRect(ctx, -14, -22, 28, 24, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#7c5a2a";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, -36);
        ctx.lineTo(i * 6, -14);
        ctx.stroke();
        ctx.fillStyle = "#f4eedd";
        ctx.beginPath();
        ctx.moveTo(i * 6 - 3, -36);
        ctx.lineTo(i * 6, -44);
        ctx.lineTo(i * 6 + 3, -36);
        ctx.closePath();
        ctx.fill();
      }
    }
    // 等级标记
    for (let i = 0; i < this.level; i++) {
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(-8 + i * 8, 16, 2.5, 0, TAU);
      ctx.fill();
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 4;
      ctx.strokeStyle = this.def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -14, 20, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    if (this.game.selectedTower === this) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 220, 120, .75)";
      ctx.fillStyle = "rgba(255, 220, 120, .08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, st.range, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- 游戏主体
class CarrotGame {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.sfx = new Sfx();
    this.store = new ProgressStore("carrot");
    this.phase = "menu";
    this.paused = true;
    this.speed = 1;
    this.level = null;
    this.path = null;
    this.spots = [];
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.beams = [];
    this.particles = [];
    this.texts = [];
    this.gold = 0;
    this.carrotHp = 10;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 0;
    this.allWavesStarted = false;
    this.kills = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverSpot = null;
    this.bg = null;
    this.time = 0;
    this.shake = 0;
    this.lastTs = 0;
    this.soundOn = true;
    this.tipTimer = null;
    this.banner = null;
    this.endlessBest = 0;
    this.cheatOpen = false;
    this.cheatInfiniteGold = false;
    this._bindUI();
    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());
    requestAnimationFrame((ts) => this._loop(ts));
    this._boot();
  }

  async _boot() {
    document.getElementById("levelScreen").classList.add("show");
    this._renderLevelGrid();
    await this.store.init();
    this.soundOn = this.store.state.sound !== false;
    this.sfx.enabled = this.soundOn;
    this._updateSoundButtons();
    this._refreshSummary();
    this.store.onChange(() => this._refreshSummary());
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客 */ }
    if (!this.store.state.tutorialSeen) this._showTutorial(true);
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("ctSound").innerHTML = icon("sound");
    $("ctPause").innerHTML = icon("pause");
    $("ctHome").innerHTML = icon("home");
    $("ctHome").addEventListener("click", () => this._openLevelScreen());
    $("ctPause").addEventListener("click", () => this._openPause());
    $("ctSound").addEventListener("click", () => this._toggleSound());
    $("ctCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });
    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") this._closeCheat();
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });
    $("ctSpeed").addEventListener("click", () => {
      this.speed = this.speed === 1 ? 2 : 1;
      $("ctSpeed").textContent = this.speed + "×";
      this.sfx.ensure();
      this.sfx.click ? null : null;
    });
    $("tutorialBtn").addEventListener("click", () => this._showTutorial(false));
    $("tutorialStart").addEventListener("click", () => this._startFromTutorial());
    $("tutorialScreen").addEventListener("click", (e) => {
      if (e.target.id === "tutorialScreen") this._startFromTutorial();
    });
    $("continueBtn").addEventListener("click", () => {
      this.startLevel(clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS));
    });
    $("levelGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-level]");
      if (!card || card.classList.contains("locked")) return;
      this.startLevel(Number(card.dataset.level));
    });
    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());
    $("retryBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("nextBtn").addEventListener("click", () => {
      if (!this.level || this.level.endless) return;
      if (this.level.id < TOTAL_LEVELS) this.startLevel(this.level.id + 1);
      else this.startLevel(0);
    });
    $("tpClose").addEventListener("click", () => this._deselectTower());
    $("tpUpgrade").addEventListener("click", () => this._upgradeTower());
    $("tpSell").addEventListener("click", () => this._sellTower());
    $("rotateTip").addEventListener("click", () => $("rotateTip").classList.add("hide"));
    $("ctTowerBar").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tower]");
      if (!btn) return;
      if (this.phase !== "playing" || this.paused) return;
      const id = btn.dataset.tower;
      this.selectedTowerType = this.selectedTowerType === id ? null : id;
      this._deselectTower(false);
      this._refreshTowerBar();
      this._showTip(this.selectedTowerType
        ? `已选择${TOWERS[id].name}，点击草地建造位`
        : "选择炮塔，点击草地上的建造位");
    });
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerleave", () => { this.hoverSpot = null; });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key.toLowerCase() === " ") {
        if (this.phase === "playing") {
          e.preventDefault();
          if (this.paused) this._closePause();
          else this._openPause();
        }
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.phase === "playing" && !this.paused) this._openPause();
    });
  }

  // ------------------------------------------------------------ 关卡选择
  _renderLevelGrid() {
    const state = this.store.state;
    const stars = state.stars || {};
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const best = Number(state.endlessBest) || 0;
    const grid = document.getElementById("levelGrid");
    const cards = LEVELS.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const current = !locked && lv.id === unlocked && !state.cleared[lv.id];
      return `<button class="level-card theme-${lv.theme} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? 'aria-disabled="true"' : ""}>
        <div><span class="lv-num">${String(lv.id).padStart(2, "0")}<small>关</small></span></div>
        <div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-sub">${lv.sub}</div>
          <div class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</div>
        </div>
        ${locked ? '<span class="lv-lock">' + icon("lock") + "</span>" : ""}
      </button>`;
    });
    cards.push(`<button class="level-card endless" data-level="0">
      <div><span class="lv-num">∞<small>无尽</small></span></div>
      <div>
        <div class="lv-name">无尽模式</div>
        <div class="lv-sub">${best > 0 ? `最佳纪录：第 ${best} 波` : "随时挑战 · 越打越难"}</div>
        <div class="lv-stars">${best > 0 ? `最高 ${best} 波` : "守住萝卜"}</div>
      </div>
    </button>`);
    grid.innerHTML = cards.join("");
  }

  _refreshSummary() {
    const state = this.store.state;
    const total = Object.values(state.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const cleared = Object.keys(state.cleared || {}).length;
    document.getElementById("totalStars").textContent = String(total);
    document.getElementById("overallBar").style.width = Math.round((cleared / TOTAL_LEVELS) * 100) + "%";
    document.getElementById("progressText").textContent = `已解锁 ${unlocked} / ${TOTAL_LEVELS} 关 · 已获得 ${total} / ${TOTAL_LEVELS * 3} 星`;
    const btn = document.getElementById("continueBtn");
    if (total === 0 && cleared === 0) btn.textContent = "开始第 1 关";
    else if (cleared >= TOTAL_LEVELS) btn.textContent = "挑战无尽模式";
    else btn.textContent = `继续第 ${unlocked} 关`;
    this._renderLevelGrid();
  }

  _showTutorial(firstTime) {
    this.firstTutorial = firstTime;
    const id = clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS);
    document.getElementById("tutorialStart").textContent = firstTime ? "开始第 1 关" : `开始第 ${id} 关`;
    document.getElementById("tutorialScreen").classList.add("show");
  }

  _startFromTutorial() {
    document.getElementById("tutorialScreen").classList.remove("show");
    if (!this.store.state.tutorialSeen) this.store.update((p) => { p.tutorialSeen = true; });
    this.startLevel(this.firstTutorial ? 1 : clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS));
  }

  _openLevelScreen() {
    this.phase = "menu";
    this.paused = true;
    this._hideScreens();
    document.getElementById("levelScreen").classList.add("show");
    this._refreshSummary();
  }

  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  // ------------------------------------------------------------ 开局
  startLevel(id) {
    this._hideScreens();
    this.level = getLevel(id);
    this.path = buildPath(this.level.path);
    this.spots = makeSpots(this.path);
    this.bg = this._buildBackground();
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.beams = [];
    this.particles = [];
    this.texts = [];
    this.gold = this.level.startGold;
    this.carrotHp = this.level.carrotHp;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 4;
    this.allWavesStarted = false;
    this.kills = 0;
    this.time = 0;
    this.shake = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverSpot = null;
    this.banner = null;
    this.endlessBest = Number(this.store.state.endlessBest) || 0;
    this.cheatOpen = false;
    document.getElementById("cheatScreen").classList.remove("show");
    document.getElementById("ctTowerPanel").classList.remove("show");
    this.phase = "playing";
    this.paused = false;
    this.speed = 1;
    document.getElementById("ctSpeed").textContent = "1×";
    document.getElementById("resultScreen").classList.remove("show");
    document.getElementById("pauseScreen").classList.remove("show");
    document.getElementById("tutorialScreen").classList.remove("show");
    this._refreshTowerBar();
    this._updateHUD();
    this._deselectTower(false);
    this._showBanner(this.level.endless ? "无尽模式" : `第 ${this.level.id} 关`, this.level.sub, 2);
    this._showTip("选择炮塔，点击草地上的建造位");
    this.sfx.ensure();
  }

  // ------------------------------------------------------------ 背景
  _buildBackground() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const t = THEMES[this.level.theme] || THEMES.day;
    const rng = (() => { let a = (this.level.id + 3) * 7919; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; })();
    const sky = ctx.createLinearGradient(0, 0, 0, 260);
    t.sky.forEach((color, i) => sky.addColorStop(i / (t.sky.length - 1), color));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 260);
    if (t.night) {
      for (let i = 0; i < 80; i++) {
        ctx.globalAlpha = 0.3 + rng() * 0.6;
        ctx.fillStyle = "#eaf1ff";
        ctx.fillRect(rng() * W, rng() * 190, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e8f1ff";
      ctx.beginPath();
      ctx.arc(1080, 80, 30, 0, TAU);
      ctx.fill();
      ctx.fillStyle = t.sky[0];
      ctx.beginPath();
      ctx.arc(1094, 72, 27, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = t.accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(1080, 72, 34, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(1080, 72, 62, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 远山
    ctx.fillStyle = t.hill;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, 250);
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      const y = 190 + Math.sin(i * 1.7 + this.level.id) * 32 + rng() * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, 300);
    ctx.lineTo(0, 300);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 草地
    const lawn = ctx.createLinearGradient(0, 240, 0, H);
    lawn.addColorStop(0, t.grass[0]);
    lawn.addColorStop(1, t.grass[1]);
    ctx.fillStyle = lawn;
    ctx.fillRect(0, 240, W, H - 240);
    for (let i = 0; i < 8; i += 2) {
      ctx.fillStyle = "rgba(255,255,255,.04)";
      ctx.fillRect(0, 250 + i * 60, W, 60);
    }
    // 树与灌木
    for (let i = 0; i < 16; i++) {
      const x = rng() * W;
      const y = 270 + rng() * 330;
      if (distToPath(this.path, x, y) < 100) continue;
      ctx.fillStyle = t.tree;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 13 + rng() * 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(x - 3, y + 6, 6, 16);
      ctx.globalAlpha = 1;
    }
    // 小花
    for (let i = 0; i < 30; i++) {
      const x = rng() * W;
      const y = 270 + rng() * 380;
      if (distToPath(this.path, x, y) < 85) continue;
      ctx.fillStyle = ["#fff3a8", "#ffb8d0", "#ffe27a", "#c7b8ff"][Math.floor(rng() * 4)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#f2a51e";
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fill();
    }
    // 路径
    const pts = this.path.points;
    const drawLine = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    drawLine(66, t.edge);
    drawLine(56, t.path);
    ctx.strokeStyle = "rgba(255,245,220,.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 14]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 路边石头
    for (let i = 0; i < 28; i++) {
      const s = this.path.segs[Math.floor(rng() * this.path.segs.length)];
      const k = rng();
      const x = s.a.x + (s.b.x - s.a.x) * k + (rng() - 0.5) * 80;
      const y = s.a.y + (s.b.y - s.a.y) * k + (rng() - 0.5) * 80;
      ctx.fillStyle = "rgba(70,50,30,.16)";
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + rng() * 5, 2 + rng() * 3, rng() * 3, 0, TAU);
      ctx.fill();
    }
    // 胡萝卜田
    const carrot = pts[pts.length - 1];
    ctx.fillStyle = "rgba(90, 60, 30, .35)";
    ctx.beginPath();
    ctx.ellipse(carrot.x, carrot.y + 8, 58, 26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#b98e58";
    ctx.beginPath();
    ctx.ellipse(carrot.x, carrot.y + 6, 46, 20, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = "#5fbf4a";
      ctx.beginPath();
      ctx.arc(carrot.x - 36 + i * 12, carrot.y + 14, 4, 0, TAU);
      ctx.fill();
    }
    // 暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,40,10,.22)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------ 输入
  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  _onPointerDown(e) {
    if (this.phase !== "playing" || this.paused) return;
    e.preventDefault();
    this.sfx.ensure();
    const p = this._canvasPoint(e);
    const spot = this.spots.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 36);
    if (spot) {
      if (spot.tower) {
        this._selectTower(spot.tower);
      } else if (this.selectedTowerType) {
        this._buildTower(spot, this.selectedTowerType);
      } else {
        this._showTip("先在底部选择一种炮塔");
      }
      return;
    }
    this._deselectTower();
    this.hoverSpot = null;
  }

  _onPointerMove(e) {
    if (this.phase !== "playing" || this.paused) return;
    const p = this._canvasPoint(e);
    this.hoverSpot = this.spots.find((s) => !s.tower && Math.hypot(s.x - p.x, s.y - p.y) < 36) || null;
  }

  // ------------------------------------------------------------ 建塔 / 升级 / 出售
  _buildTower(spot, type) {
    const def = TOWERS[type];
    if (!def) return;
    if (this.gold < def.cost) {
      this._showTip("金币不足");
      return;
    }
    this.gold -= def.cost;
    const tower = new Tower(this, type, spot);
    spot.tower = tower;
    this.towers.push(tower);
    this.sfx.build();
    this.spawnParticles(spot.x, spot.y - 10, 12, "#ffe08a", "spark");
    this._refreshTowerBar();
    this._updateHUD();
    this._showTip(`${def.name}建造完成`);
  }

  _selectTower(tower) {
    this.selectedTower = tower;
    this.selectedTowerType = null;
    this._refreshTowerBar();
    this._refreshPanel();
    document.getElementById("ctTowerPanel").classList.add("show");
  }

  _deselectTower(hide = true) {
    this.selectedTower = null;
    if (hide) document.getElementById("ctTowerPanel").classList.remove("show");
  }

  _refreshPanel() {
    const tower = this.selectedTower;
    if (!tower) return;
    const st = tower.stats();
    document.getElementById("tpName").textContent = tower.def.name;
    document.getElementById("tpLevel").textContent = `Lv.${tower.level}`;
    document.getElementById("tpStats").innerHTML = `
      <span>伤害 <b>${st.damage}</b></span>
      <span>范围 <b>${Math.round(st.range)}</b></span>
      <span>攻速 <b>${st.rate.toFixed(2)}s</b></span>
      ${st.slow ? `<span>减速 <b>${st.slow.toFixed(1)}s</b></span>` : ""}
      ${st.splash ? `<span>溅射 <b>${st.splash}</b></span>` : ""}`;
    const up = document.getElementById("tpUpgrade");
    const sell = document.getElementById("tpSell");
    if (tower.level >= 3) {
      up.textContent = "已满级";
      up.disabled = true;
    } else {
      const cost = tower.upgradeCost();
      up.textContent = `升级 · ${cost}`;
      up.disabled = this.gold < cost;
    }
    sell.textContent = `出售 · +${Math.round(tower.invested * 0.6)}`;
    sell.disabled = false;
  }

  _upgradeTower() {
    const tower = this.selectedTower;
    if (!tower || tower.level >= 3) return;
    const cost = tower.upgradeCost();
    if (this.gold < cost) { this._showTip("金币不足"); return; }
    this.gold -= cost;
    tower.invested += cost;
    tower.level += 1;
    this.sfx.build();
    this.spawnParticles(tower.x, tower.y - 20, 12, "#ffd08a", "spark");
    this._refreshPanel();
    this._updateHUD();
    this._showTip(`${tower.def.name}升到 Lv.${tower.level}`);
  }

  _sellTower() {
    const tower = this.selectedTower;
    if (!tower) return;
    const refund = Math.round(tower.invested * 0.6);
    const spot = this.spots.find((s) => s.tower === tower);
    if (spot) spot.tower = null;
    this.towers = this.towers.filter((t) => t !== tower);
    this.gold += refund;
    this.sfx.coin();
    this._deselectTower();
    this._refreshPanel();
    this._refreshTowerBar();
    this._updateHUD();
    this._showTip(`出售成功，回收 ${refund} 金币`);
  }

  // ------------------------------------------------------------ 波次
  _startWave() {
    if (this.level.endless && this.waveIndex > 0) {
      this.endlessBest = Math.max(this.endlessBest, this.waveIndex);
      this.store.update((p) => { p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessBest); });
    }
    this.waveIndex += 1;
    let wave;
    if (this.level.endless) {
      wave = this._makeEndlessWave(this.waveIndex);
    } else {
      wave = this.level.waves[this.waveIndex - 1];
    }
    if (!wave) return;
    this.spawnQueue = [];
    for (const g of wave.list) {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push(g.type);
    }
    this.spawnTimer = 0;
    this._showBanner(`第 ${this.waveIndex} 波`, this.level.endless ? "怪物越来越强" : "怪物从右侧出现", 1.7);
    this.sfx.wave();
    this._updateHUD();
  }

  _makeEndlessWave(wave) {
    const list = [];
    const n = clamp(1 + Math.floor(wave * 0.55), 1, 8);
    for (let i = 0; i < n; i++) {
      let type = "slime";
      if (wave >= 3 && i % 3 === 0) type = "runner";
      if (wave >= 5 && i % 4 === 0) type = "tank";
      list.push({ type, count: 1 });
    }
    if (wave % 5 === 0) list.push({ type: "boss", count: 1 });
    return { list, interval: 0.55 };
  }

  _updateWaves(dt) {
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const type = this.spawnQueue.shift();
        const hpMul = this.level.hpMul * (this.level.endless ? 1 + this.waveIndex * 0.12 : 1);
        this.enemies.push(new Enemy(this, type, hpMul, this.waveIndex));
        this.spawnTimer = type === "runner" ? 0.42 : type === "boss" ? 1.2 : 0.72;
      }
      return;
    }
    if (this.enemies.some((e) => e.alive)) return;

    if (this.level.endless) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this._startWave();
        this.betweenTimer = 2.2;
      }
      return;
    }
    if (this.waveIndex >= this.level.waves.length) {
      if (!this.allWavesStarted) {
        this.allWavesStarted = true;
        this._winLevel();
      }
      return;
    }
    this.betweenTimer -= dt;
    if (this.betweenTimer <= 0) {
      this._startWave();
      this.betweenTimer = 4;
    }
  }

  // ------------------------------------------------------------ 游戏循环
  _loop(ts) {
    const dt = this.lastTs ? Math.min(0.034, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (!this.paused && this.phase === "playing") this._update(dt * this.speed);
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - 46 * dt);
    this._updateWaves(dt);
    for (const t of this.towers) t.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const b of this.bullets) b.update(dt);
    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive || e.deathT < 0.8);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    this._updateEffects(dt);
    this._updateHUD();
    if (this.cheatInfiniteGold) this.gold = Math.max(this.gold, 9999);
    if (this.carrotHp <= 0) this._loseLevel();
  }

  _updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  onEnemyReach(enemy) {
    this.carrotHp -= enemy.type === "boss" ? 3 : 1;
    this.shake = 12;
    this.sfx.boom();
    this.spawnParticles(this.path.points[this.path.points.length - 1].x,
      this.path.points[this.path.points.length - 1].y - 30, 20, "#ff8a5a", "spark");
    this.addText(this.path.points[this.path.points.length - 1].x,
      this.path.points[this.path.points.length - 1].y - 70, `-${enemy.type === "boss" ? 3 : 1}`, "#ff9c8c");
    this._updateHUD();
  }

  splash(x, y, radius, damage, exclude) {
    for (const e of this.enemies) {
      if (!e.alive || e === exclude) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) e.takeDamage(damage);
    }
    this.spawnParticles(x, y, 12, "#ff8a4a", "spark");
  }

  spawnParticles(x, y, count, color, kind = "spark") {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-150, 150), vy: rand(-220, -20),
        life: rand(0.3, 0.8), maxLife: 0.8, size: rand(2, 5),
        color, kind, gravity: 420,
      });
    }
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color, life: 0.85, maxLife: 0.85 });
  }

  _showTip(text) {
    const el = document.getElementById("ctTip");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  _showBanner(title, sub, duration = 2) {
    this.banner = { title, sub, life: duration, max: duration };
  }

  // ------------------------------------------------------------ HUD
  _refreshTowerBar() {
    const bar = document.getElementById("ctTowerBar");
    if (bar.children.length !== TOWER_ORDER.length) {
      bar.innerHTML = TOWER_ORDER.map((id) => {
        const def = TOWERS[id];
        return `<button class="ct-tower-btn" data-tower="${id}" type="button">
          ${this._towerIcon(id)}
          <span class="tb-name">${def.name}</span>
          <span class="tb-cost">${def.cost}</span>
        </button>`;
      }).join("");
    }
    for (const btn of bar.children) {
      const id = btn.dataset.tower;
      const def = TOWERS[id];
      btn.classList.toggle("selected", this.selectedTowerType === id);
      btn.classList.toggle("cant", this.gold < def.cost);
    }
  }

  _towerIcon(id) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    if (id === "bottle") return `<svg ${common}><path d="M9 3h6v3l2 3v9a2 2 0 01-2 2h-6a2 2 0 01-2-2V9l2-3z"/><path d="M9 12h6"/></svg>`;
    if (id === "ice") return `<svg ${common}><path d="M12 3l7 17H5z"/><path d="M12 9v6M9.5 12h5"/></svg>`;
    if (id === "fire") return `<svg ${common}><path d="M12 21c-4 0-7-3-7-7 0-4 3-6 4-10 2 3 2 5 4 6 1-3 2-5 2-7 2 3 4 6 4 10 0 5-3 8-7 8z"/></svg>`;
    if (id === "lightning") return `<svg ${common}><path d="M13 2L5 14h6l-1 8 9-13h-6z"/></svg>`;
    return `<svg ${common}><path d="M3 20L20 4"/><path d="M14 3h7v7"/><path d="M3 13l7 7"/></svg>`;
  }

  _updateHUD() {
    document.getElementById("ctHp").textContent = String(Math.max(0, this.carrotHp));
    document.getElementById("ctGold").textContent = String(Math.floor(this.gold));
    const total = this.level ? (this.level.endless ? "∞" : this.level.waves.length) : 0;
    document.getElementById("ctWave").textContent = `${this.waveIndex}/${total}`;
    this._refreshTowerBar();
    if (this.selectedTower) this._refreshPanel();
  }

  _updateSoundButtons() {
    const on = this.soundOn !== false;
    const btn = document.getElementById("pauseSoundBtn");
    if (btn) btn.textContent = on ? "关闭音效" : "开启音效";
    const s = document.getElementById("ctSound");
    if (s) s.innerHTML = icon(on ? "sound" : "mute");
  }

  _toggleSound() {
    this.soundOn = !(this.soundOn !== false);
    this.sfx.enabled = this.soundOn;
    this.store.update((p) => { p.sound = this.soundOn; });
    this._updateSoundButtons();
    if (this.soundOn) { this.sfx.ensure(); this.sfx.coin(); }
  }

  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.phase !== "playing" || this.cheatOpen) return;
    this.cheatOpen = true;
    this.paused = true;
    this._updateCheatText();
    document.getElementById("cheatScreen").classList.add("show");
  }

  _closeCheat() {
    document.getElementById("cheatScreen").classList.remove("show");
    if (this.cheatOpen) {
      this.cheatOpen = false;
      if (this.phase === "playing") this.paused = false;
    }
  }

  _updateCheatText() {
    const el = document.getElementById("cheatGoldText");
    if (el) el.textContent = `金币无限：${this.cheatInfiniteGold ? "开" : "关"}`;
  }

  _handleCheat(action) {
    if (action === "close") { this._closeCheat(); return; }
    if (this.phase !== "playing") return;
    if (action === "gold") {
      this.gold += 1000;
      toast("金币 +1000", "ok");
    } else if (action === "heal") {
      this.carrotHp = this.level.carrotHp;
      toast("萝卜生命已回满", "ok");
    } else if (action === "kill") {
      for (const e of this.enemies) if (e.alive) e.takeDamage(99999);
      toast("已秒杀全场怪物", "ok");
    } else if (action === "maxTower") {
      for (const t of this.towers) {
        t.level = 3;
        t.invested = Math.max(t.invested, Math.round(t.def.cost * 2.2));
      }
      if (this.selectedTower) this._refreshPanel();
      toast("所有炮塔已升到 Lv.3", "ok");
    } else if (action === "infiniteGold") {
      this.cheatInfiniteGold = !this.cheatInfiniteGold;
      if (this.cheatInfiniteGold) this.gold = Math.max(this.gold, 9999);
      toast(`金币无限：${this.cheatInfiniteGold ? "开" : "关"}`, "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = TOTAL_LEVELS; p.tutorialSeen = true; });
      this._refreshSummary();
      toast("已解锁全部关卡", "ok");
    } else if (action === "win") {
      if (this.level.endless) {
        toast("无尽模式不能直接过关");
      } else {
        this._closeCheat();
        this._winLevel();
      }
    }
    this._updateCheatText();
    this._updateHUD();
  }

  _openPause() {
    if (this.phase !== "playing" || this.paused) return;
    this.paused = true;
    document.getElementById("pauseScreen").classList.add("show");
    this._updateSoundButtons();
  }

  _closePause() {
    document.getElementById("pauseScreen").classList.remove("show");
    this.paused = false;
    this.sfx.ensure();
  }

  // ------------------------------------------------------------ 结算
  _winLevel() {
    if (this.phase !== "playing") return;
    const stars = this.carrotHp >= 9 ? 3 : this.carrotHp >= 5 ? 2 : 1;
    this.store.update((p) => {
      const next = Math.min(TOTAL_LEVELS, this.level.id + 1);
      p.unlocked = Math.max(Number(p.unlocked) || 1, next);
      p.stars[this.level.id] = Math.max(Number(p.stars[this.level.id]) || 0, stars);
      p.cleared[this.level.id] = true;
    });
    this.phase = "over";
    this.sfx.win();
    this._showResult(true, stars, false);
  }

  _loseLevel() {
    if (this.phase !== "playing") return;
    this.phase = "over";
    if (this.level.endless) {
      const best = Math.max(this.endlessBest, this.waveIndex);
      this.endlessBest = best;
      this.store.update((p) => { p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.waveIndex); });
    }
    this.sfx.lose();
    this._showResult(false, 0, Boolean(this.level.endless));
  }

  _showResult(win, stars, isEndless) {
    const $ = (id) => document.getElementById(id);
    $("resultStars").style.display = isEndless ? "none" : "flex";
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = `${i * 0.12}s`;
    });
    $("resultTitle").textContent = isEndless ? "无尽模式结束" : win ? "萝卜安全了！" : "萝卜被吃掉了";
    $("resultTitle").style.color = win || isEndless ? "#3d5a1d" : "#a33a2c";
    $("resultSub").textContent = isEndless ? `坚持到第 ${this.waveIndex} 波` : `第 ${this.level.id} 关 · ${this.level.name}`;
    $("statHp").textContent = String(Math.max(0, this.carrotHp));
    $("statKills").textContent = String(this.kills);
    $("statWave").textContent = isEndless ? `第 ${this.waveIndex} 波` : `${this.waveIndex}/${this.level.waves.length}`;
    const note = isEndless
      ? `本局坚持到第 ${this.waveIndex} 波 · 历史最佳 ${this.endlessBest} 波`
      : win
        ? stars === 3 ? "三星达成：萝卜几乎毫发无伤" : "关卡进度已保存"
        : "再调整一下炮塔位置和升级顺序";
    $("resultNote").textContent = note;
    const next = $("nextBtn");
    if (win && !isEndless) {
      next.style.display = "";
      next.textContent = this.level.id < TOTAL_LEVELS ? "下一关" : "无尽模式";
    } else {
      next.style.display = "none";
    }
    $("resultScreen").classList.add("show");
  }

  // ------------------------------------------------------------ 渲染
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.level) {
      ctx.fillStyle = "#74c04b";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    if (this.shake > 0.5) ctx.translate(rand(-this.shake, this.shake) * 0.4, rand(-this.shake, this.shake) * 0.4);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawSpots(ctx);
    this._drawCarrot(ctx);
    for (const t of this.towers) t.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this._drawBeams(ctx);
    this._drawParticles(ctx);
    this._drawTexts(ctx);
    this._drawBanner(ctx);
    ctx.restore();
  }

  _drawSpots(ctx) {
    for (const s of this.spots) {
      if (s.tower) continue;
      const hover = this.hoverSpot === s;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = hover ? "rgba(255, 230, 150, .35)" : "rgba(255, 255, 255, .16)";
      ctx.strokeStyle = hover ? "rgba(255, 220, 130, .9)" : "rgba(255, 255, 255, .45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 12, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hover ? "#fff3c8" : "rgba(255,255,255,.75)";
      ctx.font = "900 17px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", 0, -1);
      ctx.restore();
    }
    if (this.hoverSpot && this.selectedTowerType) {
      const def = TOWERS[this.selectedTowerType];
      ctx.save();
      ctx.strokeStyle = "rgba(255, 220, 120, .55)";
      ctx.fillStyle = "rgba(255, 220, 120, .08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.hoverSpot.x, this.hoverSpot.y, def.range, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawCarrot(ctx) {
    const p = this.path.points[this.path.points.length - 1];
    const bob = Math.sin(this.time * 3) * 2;
    ctx.save();
    ctx.translate(p.x, p.y - 20 + bob);
    ctx.fillStyle = "rgba(30, 20, 10, .22)";
    ctx.beginPath();
    ctx.ellipse(0, 26, 28, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff9a3d";
    ctx.strokeStyle = "#a94a12";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 30, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb35e";
    ctx.beginPath();
    ctx.ellipse(-8, -8, 8, 12, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#4f9a3a";
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(-0.5 + i * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, -38, 6, 17, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#2a1608";
    ctx.beginPath();
    ctx.arc(-8, -3, 2.6, 0, TAU);
    ctx.arc(8, -3, 2.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#2a1608";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 6, 7, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "#ffe08a";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`♥ ${Math.max(0, this.carrotHp)}`, 0, -58);
    ctx.restore();
  }

  _drawBeams(ctx) {
    for (const beam of this.beams) {
      ctx.save();
      ctx.globalAlpha = clamp(beam.life / beam.max, 0, 1);
      ctx.strokeStyle = "#d9c2ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#b58cff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < beam.points.length; i++) {
        const p = beam.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          const prev = beam.points[i - 1];
          ctx.lineTo((prev.x + p.x) / 2 + rand(-8, 8), (prev.y + p.y) / 2 + rand(-8, 8));
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "900 16px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.strokeStyle = "rgba(30,40,15,.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  _drawBanner(ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = 1 - clamp(b.life / b.max, 0, 1);
    const alpha = b.life < 0.3 ? clamp(b.life / 0.3, 0, 1) : Math.min(1, k * 5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 220);
    ctx.fillStyle = "rgba(24, 40, 16, .82)";
    ctx.strokeStyle = "rgba(255, 220, 130, .55)";
    ctx.lineWidth = 2;
    roundRect(ctx, -210, -44, 420, 82, 16);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe6a8";
    ctx.font = "900 30px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText(b.title, 0, -2);
    ctx.fillStyle = "rgba(245,238,215,.75)";
    ctx.font = "600 12px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText(b.sub || "", 0, 24);
    ctx.restore();
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.__carrot = new CarrotGame();
