/**
 * 植物大战僵尸 · 加强版
 * ------------------------------------------------------------
 * 5 行 × 9 列草坪，12 种植物 + 12 个关卡 + 无尽尸潮。
 * 全部画面由 Canvas 程序化绘制，无外部素材依赖。
 */
import { isMobile } from "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { toast, icon } from "../../assets/js/ui.js";
import { audio } from "../../assets/js/audio.js";
import {
  PLANTS, PLANT_ORDER, ZOMBIES, LEVELS, TOTAL_LEVELS, getLevel,
} from "./levels.js";

const W = 1280;
const H = 720;
const GRID = { x: 292, y: 146, cell: 104, cols: 9, rows: 5 };
const GRID_W = GRID.cell * GRID.cols;
const GRID_H = GRID.cell * GRID.rows;
const CARD = { x: 160, y: 26, w: 82, h: 92, gap: 5 };
const TOP_H = 136;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function groundY(row) {
  return GRID.y + row * GRID.cell + GRID.cell * 0.9;
}
function colX(col) {
  return GRID.x + col * GRID.cell + GRID.cell / 2;
}

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

// ---------------------------------------------------------------- 音效
class PvzSfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
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
  click() { this.tone(640, 0.04, "square", 0.035); }
  plant() { this.tone(320, 0.12, "sine", 0.1, 480); this.noise(0.08, 0.05, 800); }
  shoot() { this.tone(760, 0.05, "square", 0.035, 520); }
  sun() { this.tone(880, 0.09, "sine", 0.08); setTimeout(() => this.tone(1180, 0.12, "sine", 0.06), 70); }
  boom() { this.noise(0.4, 0.26, 500); this.tone(80, 0.35, "sine", 0.22, 40); }
  mower() { this.noise(0.5, 0.12, 1200); this.tone(120, 0.5, "sawtooth", 0.06, 90); }
  groan() { this.tone(110, 0.3, "sawtooth", 0.045, 80); }
  wave() { this.tone(220, 0.15, "triangle", 0.07); setTimeout(() => this.tone(165, 0.28, "triangle", 0.08), 130); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, "triangle", 0.08), i * 120)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.08), i * 160)); }
}

// ---------------------------------------------------------------- 植物
class Plant {
  constructor(game, id, row, col) {
    this.game = game;
    this.id = id;
    this.def = PLANTS[id];
    this.row = row;
    this.col = col;
    this.x = colX(col);
    this.y = groundY(row);
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.alive = true;
    this.age = rand(0, 2);
    this.timer = this.def.produce ? 6
      : this.def.fireRate ? 0.7
        : this.def.tick ? 0.5
          : this.def.interval ? 5 : 0;
    this.arm = 0;
    this.fuse = this.def.fuse || 0;
    this.chew = 0;
    this.windup = 0;
    this.target = null;
    this.state = "idle";
    this.stateT = 0;
    this.shootPulse = 0;
    this.flash = 0;
  }

  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    this.shootPulse = Math.max(0, this.shootPulse - dt);
    this.flash = Math.max(0, this.flash - dt);
    const def = this.def;

    if (def.produce) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = def.produce;
        this.game.spawnPlantSun(this);
      }
    }
    if (def.fireRate) {
      this.timer -= dt;
      if (this.timer <= 0 && this._hasTarget()) {
        this.timer = def.fireRate;
        this._fire();
      }
    }
    if (this.id === "spikeweed") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = def.tick;
        for (const z of this.game.zombies) {
          if (z.alive && z.row === this.row && Math.abs(z.x - this.x) < 54) z.takeDamage(def.damage);
        }
      }
    } else if (this.id === "magnet") {
      this.timer -= dt;
      if (this.timer <= 0) {
        const target = this.game.zombies.find((z) => z.alive
          && Math.abs(z.row - this.row) <= 1
          && z.x - this.x < 240
          && z.x > this.x - 40
          && (z.type === "cone" || z.type === "bucket" || z.type === "football"));
        if (target) {
          target.type = "normal";
          target.cfg = ZOMBIES.normal;
          target.maxHp = ZOMBIES.normal.hp;
          target.hp = Math.min(target.hp, target.maxHp);
          this.game.spawnParticles(target.x, target.y - 90, 10, "#c7d3ff", "spark");
          this.game.addText(target.x, target.y - 100, "护具被吸走", "#c7d3ff");
          this.timer = def.interval;
        } else {
          this.timer = 2;
        }
      }
    } else if (this.id === "iceshroom") {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        for (const z of this.game.zombies) {
          if (z.alive) z.freezeT = Math.max(z.freezeT || 0, def.freeze);
        }
        this.game.spawnParticles(this.x, this.y - 40, 24, "#bdf3ff", "spark");
        this.game.sfx.boom();
        this.game.removePlant(this);
      }
    }
    if (this.id === "potatomine") {
      this.arm += dt;
      if (this.arm >= def.armTime) {
        const target = this.game.zombies.find((z) => z.alive && z.row === this.row && Math.abs(z.x - this.x) < 58);
        if (target) {
          this.game.explodeAt(this.x, this.y - 16, 96, def.damage, "#c98a4a");
          this.game.removePlant(this);
        }
      }
    } else if (this.id === "cherrybomb" || this.id === "jalapeno") {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        if (this.id === "cherrybomb") {
          this.game.explodeAt(this.x, this.y - 36, def.radius * GRID.cell, def.damage, "#ff7a4a");
        } else {
          this.game.burnLane(this.row, def.damage);
        }
        this.game.removePlant(this);
      }
    } else if (this.id === "chomper") {
      if (this.chew > 0) {
        this.chew -= dt;
      } else if (this.windup > 0) {
        this.windup -= dt;
        if (this.windup <= 0) {
          if (this.target && this.target.alive) {
            this.target.takeDamage(1800);
            this.chew = def.chew;
            this.game.sfx.noise(0.12, 0.08, 500);
          }
          this.target = null;
        }
      } else {
        const target = this.game.zombies.find((z) => z.alive && z.row === this.row && z.x - this.x < 100 && z.x > this.x - 20);
        if (target) {
          this.target = target;
          this.windup = 0.45;
        }
      }
    } else if (this.id === "squash") {
      if (this.state === "idle") {
        const target = this.game.zombies.find((z) => z.alive && z.row === this.row && Math.abs(z.x - this.x) < 120);
        if (target) {
          this.state = "windup";
          this.stateT = def.windup;
          this.target = target;
        }
      } else if (this.state === "windup") {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.state = "smash";
          this.stateT = 0.22;
          this.game.explodeAt(this.x, this.y - 24, 130, def.damage, "#9ed15b");
          this.game.sfx.boom();
        }
      } else if (this.state === "smash") {
        this.stateT -= dt;
        if (this.stateT <= 0) this.game.removePlant(this);
      }
    }
  }

  _hasTarget() {
    return this.game.zombies.some((z) => z.alive && z.row === this.row && z.x > this.x - 10 && z.x < W + 100);
  }

  _fire() {
    const def = this.def;
    const rows = def.lanes === 3 ? [this.row - 1, this.row, this.row + 1] : [this.row];
    const shots = def.shots || 1;
    for (const row of rows) {
      if (row < 0 || row >= GRID.rows) continue;
      for (let i = 0; i < shots; i++) {
        this.game.peas.push(new Pea(
          this.game,
          this.x + 34 + i * 7,
          groundY(row) - 56 + (i % 2) * 2,
          row,
          def.damage,
          Boolean(def.slow),
          Boolean(def.splash),
          def.splash || 0,
          this.id === "melon" ? "melon" : "pea"
        ));
      }
    }
    this.shootPulse = 0.16;
    this.game.sfx.shoot();
    this.game.spawnParticles(this.x + 38, this.y - 52, 4, "#bfe87a", "spark");
  }

  takeDamage(amount) {
    if (!this.alive) return;
    if (this.game.cheatInvincible) return;
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.game.removePlant(this, true);
    }
  }

  draw(ctx, game) {
    if (!this.alive) return;
    const sway = Math.sin(this.age * 1.6 + this.col * 0.8) * 0.03;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.flash > 0) ctx.globalAlpha = 0.7 + Math.sin(this.flash * 80) * 0.3;
    ctx.rotate(sway);
    game.drawPlantGraphic(ctx, this.id, 1, this);
    ctx.restore();
    if (this.hp < this.maxHp) {
      const ratio = clamp(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = "rgba(20,30,10,.55)";
      roundRect(ctx, this.x - 24, this.y - 88, 48, 6, 3);
      ctx.fill();
      ctx.fillStyle = ratio > 0.5 ? "#8fe05c" : ratio > 0.25 ? "#ffcf5a" : "#ff6b5a";
      roundRect(ctx, this.x - 23, this.y - 87, 46 * ratio, 4, 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 僵尸
class Zombie {
  constructor(game, type, row) {
    const cfg = ZOMBIES[type] || ZOMBIES.normal;
    this.game = game;
    this.type = type;
    this.cfg = cfg;
    this.row = row;
    this.x = W + 36;
    this.y = groundY(row);
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.alive = true;
    this.deathT = 0;
    this.age = rand(0, 4);
    this.slowT = 0;
    this.freezeT = 0;
    this.eating = false;
    this.flash = 0;
    this.phase = rand(0, TAU);
    this.groanT = rand(2, 7);
  }

  update(dt) {
    if (!this.alive) {
      this.deathT += dt;
      return;
    }
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.freezeT = Math.max(0, this.freezeT - dt);
    if (this.freezeT > 0) {
      this.eating = false;
      return;
    }
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = rand(5, 10);
      if (Math.random() < 0.25) this.game.sfx.groan();
    }
    const target = this.game.eatTargetFor(this);
    if (target) {
      this.eating = true;
      target.takeDamage(this.cfg.dps * dt);
    } else {
      this.eating = false;
      const slow = this.slowT > 0 ? 0.45 : 1;
      this.x -= this.cfg.speed * slow * dt;
    }
    if (this.x < GRID.x - 20) this.game.zombieAtHouse(this);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 0.1;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0;
    this.game.kills += 1;
    this.game.spawnParticles(this.x, this.y - 46, 10, "#8fae72", "zombie");
    this.game.sfx.noise(0.12, 0.05, 400);
  }

  draw(ctx, game) {
    if (!this.alive && this.deathT > 1.3) return;
    const cfg = this.cfg;
    const t = this.age;
    const walk = this.eating ? Math.sin(t * 12) * 3 : Math.sin(t * 4 + this.phase) * 7;
    const bob = Math.abs(Math.sin(t * 4 + this.phase)) * 2;
    const fade = this.alive ? 1 : clamp(1 - this.deathT / 1.3, 0, 1);
    const skin = this.freezeT > 0 ? "#b9e8ff" : this.slowT > 0 ? "#8fb9a4" : "#a8bf87";
    const skinDark = this.freezeT > 0 ? "#7bb8d6" : this.slowT > 0 ? "#6b8e7f" : "#7c9661";

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(this.x, this.y);
    if (!this.alive) {
      ctx.translate(0, 4);
      ctx.rotate(-1.15);
    }
    // 影子
    ctx.fillStyle = "rgba(20,30,10,.22)";
    ctx.beginPath();
    ctx.ellipse(0, 1, 19, 5, 0, 0, TAU);
    ctx.fill();

    // 腿
    ctx.strokeStyle = "#3f4a3a";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-7, -30);
    ctx.lineTo(-9 + walk, -2);
    ctx.moveTo(7, -30);
    ctx.lineTo(9 - walk, -2);
    ctx.stroke();
    ctx.fillStyle = "#2c332a";
    ctx.beginPath();
    ctx.ellipse(-10 + walk, -1, 7, 3.5, 0, 0, TAU);
    ctx.ellipse(10 - walk, -1, 7, 3.5, 0, 0, TAU);
    ctx.fill();

    // 身体（破西装）
    ctx.fillStyle = "#4d5663";
    ctx.strokeStyle = "#2d3440";
    ctx.lineWidth = 2;
    roundRect(ctx, -15, -78, 30, 52, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8e4d8";
    ctx.beginPath();
    ctx.moveTo(-6, -76);
    ctx.lineTo(0, -62);
    ctx.lineTo(6, -76);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a83b39";
    ctx.beginPath();
    ctx.moveTo(-2, -70);
    ctx.lineTo(2, -70);
    ctx.lineTo(3, -50);
    ctx.lineTo(0, -46);
    ctx.lineTo(-3, -50);
    ctx.closePath();
    ctx.fill();
    // 破洞
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(9, -44, 4, 3, 0.4, 0, TAU);
    ctx.fill();

    // 手臂（前伸）
    ctx.strokeStyle = skin;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-10, -68);
    ctx.lineTo(-30, -62 + walk * 0.3);
    ctx.moveTo(10, -68);
    ctx.lineTo(-6, -58 - walk * 0.3);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(-32, -61 + walk * 0.3, 5, 0, TAU);
    ctx.arc(-8, -57 - walk * 0.3, 5, 0, TAU);
    ctx.fill();

    // 头
    ctx.save();
    ctx.translate(0, -86 - bob);
    if (this.eating) ctx.rotate(Math.sin(t * 14) * 0.08);
    ctx.fillStyle = skin;
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 18, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // 头发
    ctx.fillStyle = "#3a4035";
    ctx.beginPath();
    ctx.arc(0, -3, 16, Math.PI * 1.06, Math.PI * 1.94);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = "#f4f2e4";
    ctx.beginPath();
    ctx.ellipse(-6, -4, 4.5, 4, 0, 0, TAU);
    ctx.ellipse(6, -4, 4.5, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1d211a";
    ctx.beginPath();
    ctx.arc(-6, -3, 2, 0, TAU);
    ctx.arc(6, -3, 2, 0, TAU);
    ctx.fill();
    // 嘴
    ctx.fillStyle = "#2a1d1d";
    ctx.beginPath();
    ctx.ellipse(0, 9, 8, this.eating ? 6 : 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#e8e4d8";
    ctx.fillRect(-5, 5, 3, 4);
    ctx.fillRect(2, 5, 3, 4);

    // 配饰
    if (this.type === "cone") {
      ctx.fillStyle = "#e58a2b";
      ctx.strokeStyle = "#9c4f12";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-15, -12);
      ctx.lineTo(0, -52);
      ctx.lineTo(15, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.moveTo(-8, -20);
      ctx.lineTo(8, -20);
      ctx.stroke();
    } else if (this.type === "bucket") {
      ctx.fillStyle = "#9aa6ad";
      ctx.strokeStyle = "#5f6b72";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-17, -10);
      ctx.lineTo(-14, -38);
      ctx.lineTo(14, -38);
      ctx.lineTo(17, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.moveTo(-15, -26);
      ctx.lineTo(15, -26);
      ctx.stroke();
    } else if (this.type === "football") {
      ctx.fillStyle = "#b83b2f";
      ctx.strokeStyle = "#70211a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -8, 19, Math.PI, TAU);
      ctx.lineTo(19, 0);
      ctx.lineTo(-19, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#f2e8c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, -4);
      ctx.lineTo(18, -4);
      ctx.stroke();
    } else if (this.type === "flag") {
      ctx.strokeStyle = "#6b4a2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(20, -62);
      ctx.stroke();
      ctx.fillStyle = "#c83a35";
      ctx.beginPath();
      ctx.moveTo(20, -62);
      ctx.lineTo(54, -52);
      ctx.lineTo(20, -40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 血条
    if (this.alive && this.hp < this.maxHp) {
      const ratio = clamp(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = "rgba(20,25,15,.5)";
      roundRect(ctx, -24, -118, 48, 6, 3);
      ctx.fill();
      ctx.fillStyle = "#ff7a5e";
      roundRect(ctx, -23, -117, 46 * ratio, 4, 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 豌豆
class Pea {
  constructor(game, x, y, row, damage, snow, splash = false, splashDamage = 0, kind = "pea") {
    this.game = game;
    this.x = x;
    this.y = y;
    this.row = row;
    this.damage = damage;
    this.snow = snow;
    this.splash = splash;
    this.splashDamage = splashDamage;
    this.kind = kind;
    this.alive = true;
    this.age = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    this.x += (this.kind === "melon" ? 360 : 450) * dt;
    if (this.x > W + 30) {
      this.alive = false;
      return;
    }
    const target = this.game.zombies.find((z) => z.alive && z.row === this.row && z.x - this.x < 26 && z.x - this.x > -20);
    if (target) {
      target.takeDamage(this.damage);
      if (this.snow) target.slowT = 3;
      if (this.splash) this.game.splashDamage(target.x, target.y - 46, 120, this.splashDamage, target);
      this.game.spawnParticles(this.x, this.y, this.kind === "melon" ? 10 : 5, this.snow ? "#bdf3ff" : "#a9e36a", "spark");
      this.alive = false;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.kind === "melon") {
      ctx.rotate(this.age * 8);
      ctx.fillStyle = "#4f9a3a";
      ctx.strokeStyle = "#2f6b23";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 8, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#2f6b23";
      ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, -7);
        ctx.lineTo(i * 4, 7);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const r = this.snow ? 7 : 6.5;
    ctx.fillStyle = this.snow ? "#a9e7ff" : "#7ed957";
    ctx.strokeStyle = this.snow ? "#5aa9c7" : "#4b9a34";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.beginPath();
    ctx.arc(-2, -2, 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 阳光
class Sun {
  constructor(game, x, y, targetY, value, fromPlant) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.targetY = targetY;
    this.value = value;
    this.fromPlant = fromPlant;
    this.life = 10;
    this.alive = true;
    this.age = 0;
    this.landed = false;
  }
  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    if (!this.landed) {
      this.y += 100 * dt;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.landed = true;
      }
    } else {
      this.life -= dt;
      if (this.life <= 0) this.alive = false;
    }
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(this.age * 5) * 0.06;
    const alpha = this.landed && this.life < 2 ? clamp(this.life / 2, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    const sizeScale = this.game.isMobile ? 1.7 : 1;
    ctx.scale(pulse * sizeScale, pulse * sizeScale);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
    glow.addColorStop(0, "rgba(255,245,170,.95)");
    glow.addColorStop(0.5, "rgba(255,220,90,.4)");
    glow.addColorStop(1, "rgba(255,210,80,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,224,90,.9)";
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + this.age * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
      ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe45c";
    ctx.strokeStyle = "#f3a92b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.beginPath();
    ctx.arc(-4, -5, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 割草机
class Mower {
  constructor(game, row) {
    this.game = game;
    this.row = row;
    this.x = 264;
    this.y = groundY(row);
    this.state = "idle";
    this.age = 0;
  }
  trigger() {
    if (this.state !== "idle") return;
    this.state = "running";
    this.game.mowersUsed += 1;
    this.game.sfx.mower();
  }
  update(dt) {
    if (this.state !== "running") return;
    this.age += dt;
    this.x += 880 * dt;
    for (const z of this.game.zombies) {
      // 割草机向右推进时会清理整行（包括已经越过割草机的僵尸）
      if (z.alive && z.row === this.row && z.x <= this.x + 90) z.takeDamage(9999);
    }
    if (this.x > W + 80) this.state = "gone";
  }
  draw(ctx) {
    if (this.state === "gone") return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(20,30,10,.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#c84434";
    ctx.strokeStyle = "#7c231b";
    ctx.lineWidth = 2;
    roundRect(ctx, -18, -24, 36, 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8d99a2";
    roundRect(ctx, 6, -30, 16, 10, 3);
    ctx.fill();
    ctx.fillStyle = "#4c565e";
    ctx.beginPath();
    ctx.arc(-11, 0, 6, 0, TAU);
    ctx.arc(11, 0, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#c3ccd3";
    ctx.beginPath();
    ctx.arc(-11, 0, 2.5, 0, TAU);
    ctx.arc(11, 0, 2.5, 0, TAU);
    ctx.fill();
    if (this.state === "running") {
      ctx.strokeStyle = "rgba(220,235,240,.7)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-22 - i * 7, -16 + i * 4);
        ctx.lineTo(-34 - i * 8, -16 + i * 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 游戏主体
class PvZGame {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.isMobile = isMobile;
    this.sfx = new PvzSfx();
    this.store = new ProgressStore("pvz");
    this.level = null;
    this.phase = "menu";
    this.paused = true;
    this.time = 0;
    this.elapsed = 0;
    this.sun = 150;
    this.plants = [];
    this.zombies = [];
    this.peas = [];
    this.suns = [];
    this.particles = [];
    this.texts = [];
    this.mowers = [];
    this.grid = [];
    this.cardRects = [];
    this.cardReadyAt = {};
    this.cardScroll = 0;
    this.cardMaxScroll = 0;
    this.cardDrag = null;
    this.plantIds = [];
    this.selected = null;
    this.shovel = false;
    this.hoverCell = null;
    this.cheatInvincible = false;
    this.cheatInfiniteSun = false;
    this.cheatNoCooldown = false;
    this.cheatUnlockPlants = false;
    this.cheatOpen = false;
    this.longPressTimer = null;
    this.infoTimer = null;
    this.kills = 0;
    this.mowersUsed = 0;
    this.wavesSpawned = 0;
    this.nextWave = 0;
    this.winPending = 0;
    this.endlessWave = 0;
    this.nextWaveAt = 0;
    this.banner = null;
    this.bg = null;
    this.ambient = [];
    this.sunTimer = 7;
    this.shake = 0;
    this.lastRow = -1;
    this.sameRowCount = 0;
    this.menuRects = {};
    this.shovelRect = { x: 1204, y: 26, w: 76, h: 92 };
    this.soundOn = true;
    this.lastTs = 0;
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
    audio.setEnabled(this.soundOn);
    audio.setMusic("pvz");
    this._updateSoundButtons();
    this._refreshSummary();
    this.store.onChange(() => this._refreshSummary());
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客 */ }
    if (!this.store.state.tutorialSeen) this._showTutorial(true);
  }

  _updateSoundButtons() {
    const on = this.soundOn !== false;
    const btn = document.getElementById("pauseSoundBtn");
    if (btn) btn.textContent = on ? "关闭音效" : "开启音效";
    const gm = document.getElementById("gmSound");
    if (gm) gm.innerHTML = icon(on ? "sound" : "mute");
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("gmHome").innerHTML = icon("home");
    $("gmPause").innerHTML = icon("pause");
    $("gmHome").addEventListener("click", () => this._openLevelScreen());
    $("gmSound").addEventListener("click", () => this._toggleSound());
    $("gmPause").addEventListener("click", () => this._openPause());
    $("gmCheat").addEventListener("click", () => this._openCheat());
    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") this._closeCheat();
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });
    this._updateSoundButtons();
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
      const id = Number(card.dataset.level);
      this.startLevel(id);
    });
    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());
    $("retryBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("nextBtn").addEventListener("click", () => {
      if (this.nextAction) this.nextAction();
    });
    $("rotateTip").addEventListener("click", () => $("rotateTip").classList.add("hide"));

    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointercancel", () => { this.cardDrag = null; this._clearLongPress(); });
    this.canvas.addEventListener("pointerleave", () => { this.hoverCell = null; });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("wheel", (e) => {
      if (!this.level || this.phase !== "playing" || this.paused) return;
      const p = this._canvasPoint(e);
      if (p.y >= 20 && p.y <= 122 && p.x >= CARD.x && p.x <= 1200 && this.cardMaxScroll > 0) {
        e.preventDefault();
        this.cardScroll = clamp(this.cardScroll + (e.deltaY > 0 ? 87 : -87), 0, this.cardMaxScroll);
        this._layoutCards();
      }
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "escape" || k === " ") {
        if (this.phase === "playing" || this.paused) {
          e.preventDefault();
          if (this.paused) this._closePause();
          else this._openPause();
        }
        return;
      }
      if (this.phase !== "playing" || this.paused) return;
      if (/^[1-9]$/.test(k)) {
        const idx = Number(k) - 1;
        const visible = this.cardRects.filter((c) => c.x + c.w > CARD.x && c.x < 1200);
        const card = visible[idx];
        if (card) this._selectCard(card.id);
      }
      if (k === "0" || k === "s") {
        this.shovel = !this.shovel;
        if (this.shovel) this.selected = null;
        this.sfx.ensure();
        this.sfx.click();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.phase === "playing" && !this.paused) this._openPause();
    });
    window.addEventListener("orientationchange", () => setTimeout(() => this._resizeCanvas(), 220));
  }

  // ------------------------------------------------------------ 关卡选择
  _renderLevelGrid() {
    const state = this.store.state;
    const stars = state.stars || {};
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const endlessUnlocked = true;
    const grid = document.getElementById("levelGrid");
    const cards = LEVELS.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const current = !locked && lv.id === unlocked && !state.cleared[lv.id];
      return `<button class="level-card theme-${((lv.id - 1) % 12) + 1} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? 'aria-disabled="true"' : ""}>
        <div class="lv-top"><span class="lv-num">${String(lv.id).padStart(2, "0")}<small>关</small></span></div>
        <div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-sub">${lv.sub}</div>
          <div class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</div>
        </div>
        ${locked ? '<span class="lv-lock">' + this._lockSvg() + "</span>" : ""}
      </button>`;
    });
    const best = Number(state.endlessBest) || 0;
    cards.push(`<button class="level-card endless ${endlessUnlocked ? "" : "locked"}" data-level="0" ${endlessUnlocked ? "" : 'aria-disabled="true"'}>
      <div class="lv-top"><span class="lv-num">∞<small>无尽</small></span></div>
      <div>
        <div class="lv-name">无尽尸潮</div>
        <div class="lv-sub">${best > 0 ? `最佳纪录：第 ${best} 波` : "随时挑战 · 难度递增"}</div>
        <div class="lv-stars">${best > 0 ? `<span class="on">★</span> 最高 ${best} 波` : "越守越难"}</div>
      </div>
      ${endlessUnlocked ? "" : '<span class="lv-lock">' + this._lockSvg() + "</span>"}
    </button>`);
    grid.innerHTML = cards.join("");
  }

  _lockSvg() {
    return '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>';
  }

  _refreshSummary() {
    const state = this.store.state;
    const total = Object.values(state.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const cleared = Object.keys(state.cleared || {}).length;
    document.getElementById("totalStars").textContent = String(total);
    document.getElementById("overallBar").style.width = Math.round((cleared / TOTAL_LEVELS) * 100) + "%";
    document.getElementById("progressText").textContent =
      `已解锁 ${unlocked} / ${TOTAL_LEVELS} 关 · 已获得 ${total} / ${TOTAL_LEVELS * 3} 星`;
    const btn = document.getElementById("continueBtn");
    if (total === 0 && cleared === 0) btn.textContent = "开始第 1 关";
    else if (cleared >= TOTAL_LEVELS) btn.textContent = "挑战无尽尸潮";
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
    if (!this.store.state.tutorialSeen) {
      this.store.update((p) => { p.tutorialSeen = true; });
    }
    this.startLevel(this.firstTutorial ? 1 : clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS));
  }

  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  _openLevelScreen() {
    this.phase = "menu";
    this.paused = true;
    this._hideScreens();
    document.getElementById("levelScreen").classList.add("show");
    this._refreshSummary();
  }

  // ------------------------------------------------------------ 开局
  startLevel(id) {
    this._hideScreens();
    document.getElementById("plantInfo").classList.remove("show");
    this.level = getLevel(id);
    this.phase = "playing";
    this.paused = false;
    this.time = 0;
    this.elapsed = 0;
    this.sun = this.level.startSun || 150;
    this.plants = [];
    this.zombies = [];
    this.peas = [];
    this.suns = [];
    this.particles = [];
    this.texts = [];
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    this.mowers = [];
    for (let r = 0; r < GRID.rows; r++) this.mowers.push(new Mower(this, r));
    this.selected = null;
    this.shovel = false;
    this.hoverCell = null;
    this.kills = 0;
    this.mowersUsed = 0;
    this.wavesSpawned = 0;
    this.nextWave = 0;
    this.winPending = 0;
    this.endlessWave = 0;
    this.nextWaveAt = this.level.endless ? 8 : 0;
    this.banner = null;
    this.sunTimer = 7;
    this.shake = 0;
    this.lastRow = -1;
    this.sameRowCount = 0;
    this.nextAction = null;
    this.cardReadyAt = {};
    this.plantIds = this.cheatUnlockPlants
      ? PLANT_ORDER.slice()
      : PLANT_ORDER.filter((pid) => (this.level.plants || []).includes(pid));
    this.cardScroll = 0;
    this._layoutCards();
    this._buildBackground();
    this._makeAmbient();
    this._showBanner(this.level.endless ? "无尽尸潮" : `第 ${this.level.id} 关`, this.level.endless ? "守住每一波，看看极限在哪" : this.level.sub, 2.2);
    this.sfx.ensure();
    this.sfx.click();
    this._updateSoundButtons();
  }

  // ------------------------------------------------------------ 输入
  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  _pointIn(r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** 根据滚动位置排列种子卡，植物超过一屏时可以左右滑动 */
  _layoutCards() {
    const total = this.plantIds.length * (CARD.w + CARD.gap) - CARD.gap;
    const viewW = 1200 - CARD.x;
    this.cardMaxScroll = Math.max(0, total - viewW);
    this.cardScroll = clamp(this.cardScroll, 0, this.cardMaxScroll);
    this.cardRects = this.plantIds.map((pid, i) => ({
      id: pid,
      x: CARD.x + i * (CARD.w + CARD.gap) - this.cardScroll,
      y: CARD.y,
      w: CARD.w,
      h: CARD.h,
    }));
  }

  _refreshPlantBar() {
    this.plantIds = this.cheatUnlockPlants
      ? PLANT_ORDER.slice()
      : PLANT_ORDER.filter((pid) => (this.level.plants || []).includes(pid));
    if (this.selected && !this.plantIds.includes(this.selected)) this.selected = null;
    this.cardScroll = 0;
    this._layoutCards();
  }

  _onPointerDown(e) {
    if (this.phase !== "playing" || this.paused) return;
    e.preventDefault();
    this.sfx.ensure();
    const p = this._canvasPoint(e);

    // 先收集阳光（后生成的优先）
    for (let i = this.suns.length - 1; i >= 0; i--) {
      const s = this.suns[i];
      if (s.alive && Math.hypot(p.x - s.x, p.y - s.y) < (this.isMobile ? 48 : 32)) {
        this._collectSun(s);
        return;
      }
    }

    if (this._pointIn(this.shovelRect, p.x, p.y)) {
      this.shovel = !this.shovel;
      if (this.shovel) this.selected = null;
      this.sfx.click();
      return;
    }

    // 顶部种子卡区域：拖动横向滚动，轻点选择植物，长按查看说明
    if (p.y >= 20 && p.y <= 120 && p.x >= CARD.x && p.x <= 1200) {
      const card = this._cardAt(p.x, p.y);
      this.cardDrag = {
        startX: p.x, startY: p.y, startScroll: this.cardScroll,
        moved: false, longPressed: false, planting: false,
        cardId: card ? card.id : null,
      };
      this.canvas.setPointerCapture?.(e.pointerId);
      this._clearLongPress();
      this.longPressTimer = setTimeout(() => {
        if (!this.cardDrag || this.cardDrag.moved || this.cardDrag.planting || this.paused) return;
        if (card) {
          this.cardDrag.longPressed = true;
          this._showPlantInfo(card.id);
        }
      }, 480);
      return;
    }

    const cell = this._cellAt(p.x, p.y);
    if (!cell) return;
    if (this.shovel) {
      const plant = this.grid[cell.row][cell.col];
      if (plant) {
        this.removePlant(plant, true);
        this.shovel = false;
      }
      return;
    }
    if (!this.selected) {
      if (this.grid[cell.row][cell.col]) this._showToastSafe("这里已经有一株植物了");
      else this._showToastSafe("先点一张植物卡，再点草坪");
      return;
    }
    this._tryPlant(cell.row, cell.col);
  }

  _onPointerMove(e) {
    if (this.phase !== "playing" || this.paused) return;
    const p = this._canvasPoint(e);
    if (this.cardDrag) {
      const dx = p.x - this.cardDrag.startX;
      const dy = p.y - this.cardDrag.startY;
      // 从种子卡向下拖：进入“拖着植物走”的种植模式
      if (!this.cardDrag.planting && this.cardDrag.cardId
        && dy > 16 && dy > Math.abs(dx) * 0.8) {
        this.cardDrag.planting = true;
        this.cardDrag.moved = true;
        this._clearLongPress();
        this.shovel = false;
        this.selected = this.cardDrag.cardId;
      }
      if (this.cardDrag.planting) {
        this.hoverCell = this._cellAt(p.x, p.y);
        return;
      }
      if (Math.abs(dx) > 6) {
        this.cardDrag.moved = true;
        this._clearLongPress();
      }
      if (this.cardDrag.moved) {
        this.cardScroll = clamp(this.cardDrag.startScroll - dx, 0, this.cardMaxScroll);
        this._layoutCards();
      }
      return;
    }
    this.hoverCell = this._cellAt(p.x, p.y);
  }

  _onPointerUp(e) {
    if (!this.cardDrag) return;
    e.preventDefault();
    this._clearLongPress();
    const p = this._canvasPoint(e);
    const drag = this.cardDrag;
    this.cardDrag = null;

    if (drag.planting) {
      const cell = this._cellAt(p.x, p.y);
      if (cell) this._tryPlant(cell.row, cell.col);
      else this._showToastSafe("把植物拖到草坪格子里才能种植");
      return;
    }
    if (drag.moved || drag.longPressed) return;
    const card = this._cardAt(p.x, p.y);
    if (card) this._selectCard(card.id);
  }

  _cardAt(x, y) {
    return this.cardRects.find((c) => c.x + c.w > CARD.x && c.x < 1200 && this._pointIn(c, x, y)) || null;
  }

  _clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /** 长按植物卡显示属性与用法 */
  _showPlantInfo(id) {
    const def = PLANTS[id];
    if (!def) return;
    const info = document.getElementById("plantInfo");
    if (!info) return;
    const stats = [
      `阳光 <b>${def.cost}</b>`,
      `冷却 <b>${def.recharge}s</b>`,
      `生命 <b>${def.hp}</b>`,
    ];
    if (def.damage) stats.push(`伤害 <b>${def.damage}</b>`);
    if (def.fireRate) stats.push(`攻击间隔 <b>${def.fireRate}s</b>`);
    if (def.produce) stats.push(`产出 <b>${def.sunValue} 阳光 / ${def.produce}s</b>`);
    if (def.slow) stats.push(`减速 <b>${def.slow}s</b>`);
    if (def.splash) stats.push(`溅射伤害 <b>${def.splash}</b>`);
    if (def.armTime) stats.push(`布防 <b>${def.armTime}s</b>`);
    if (def.tick) stats.push(`持续伤害 <b>${def.damage} / ${def.tick}s</b>`);
    info.innerHTML = `
      <div class="pi-head"><b>${def.name}</b><span>${def.cost} 阳光</span></div>
      <p class="pi-desc">${def.desc}</p>
      <div class="pi-stats">${stats.map((s) => `<span>${s}</span>`).join("")}</div>`;
    info.classList.add("show");
    clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => info.classList.remove("show"), 2800);
  }

  _cellAt(x, y) {
    if (x < GRID.x || x >= GRID.x + GRID_W || y < GRID.y || y >= GRID.y + GRID_H) return null;
    return {
      col: Math.floor((x - GRID.x) / GRID.cell),
      row: Math.floor((y - GRID.y) / GRID.cell),
    };
  }

  _showToastSafe(msg) {
    toast(msg, "", 1600);
  }

  // ------------------------------------------------------------ 种植
  _selectCard(id) {
    const def = PLANTS[id];
    if (!def) return;
    this.sfx.click();
    if (this.shovel) this.shovel = false;
    if (this.selected === id) {
      this.selected = null;
      return;
    }
    const readyAt = this.cardReadyAt[id] || 0;
    if (this.elapsed < readyAt) {
      this._showToastSafe(`${def.name} 冷却中`);
      return;
    }
    if (this.sun < def.cost) {
      this._showToastSafe("阳光不足");
      return;
    }
    this.selected = id;
  }

  _tryPlant(row, col) {
    const id = this.selected;
    const def = PLANTS[id];
    if (!def) return;
    if (this.grid[row][col]) {
      this._showToastSafe("这个格子已经有植物了");
      return;
    }
    const readyAt = this.cardReadyAt[id] || 0;
    if (this.elapsed < readyAt) {
      this._showToastSafe(`${def.name} 冷却中`);
      return;
    }
    if (this.sun < def.cost) {
      this._showToastSafe("阳光不足");
      return;
    }
    this.sun -= def.cost;
    this.cardReadyAt[id] = this.elapsed + def.recharge;
    const plant = new Plant(this, id, row, col);
    this.grid[row][col] = plant;
    this.plants.push(plant);
    // 保持当前植物卡选中，方便连续点下一个格子继续种
    this.selected = id;
    this.sfx.plant();
    this.spawnParticles(plant.x, plant.y - 20, 10, "#c9e88a", "leaf");
    this.addText(plant.x, plant.y - 70, `-${def.cost}`, "#ffe08a");
  }

  removePlant(plant, byPlayer) {
    if (!plant.alive) return;
    plant.alive = false;
    if (this.grid[plant.row] && this.grid[plant.row][plant.col] === plant) this.grid[plant.row][plant.col] = null;
    this.plants = this.plants.filter((p) => p !== plant);
    this.spawnParticles(plant.x, plant.y - 26, 10, "#8fb45a", "leaf");
  }

  _collectSun(sun) {
    sun.alive = false;
    this.sun += sun.value;
    this.sfx.sun();
    this.addText(sun.x, sun.y - 10, `+${sun.value}`, "#ffe45c");
    this.spawnParticles(sun.x, sun.y, 8, "#ffe45c", "spark");
  }

  // ------------------------------------------------------------ 波次
  _spawnWave(wave) {
    if (wave.huge) {
      this._showBanner("一大波僵尸正在接近！", "最后一波", 2.2);
      this.sfx.wave();
      const flag = new Zombie(this, "flag", this._pickRow());
      flag.x = W + 20;
      this.zombies.push(flag);
    }
    let idx = 0;
    for (const group of wave.list || []) {
      for (let i = 0; i < group.count; i++) {
        const row = this._pickRow();
        const z = new Zombie(this, group.type, row);
        z.x = W + 60 + idx * 56;
        this.zombies.push(z);
        idx += 1;
      }
    }
    this.wavesSpawned += 1;
  }

  _pickRow() {
    const counts = new Array(GRID.rows).fill(0);
    for (const z of this.zombies) {
      if (z.alive) counts[z.row] += 1;
    }
    const min = Math.min(...counts);
    const candidates = [];
    for (let r = 0; r < GRID.rows; r++) if (counts[r] === min) candidates.push(r);
    let row = candidates[Math.floor(Math.random() * candidates.length)];
    if (row === this.lastRow) {
      this.sameRowCount += 1;
      if (this.sameRowCount > 1) {
        row = (row + 1 + Math.floor(Math.random() * (GRID.rows - 1))) % GRID.rows;
        this.sameRowCount = 0;
      }
    } else {
      this.sameRowCount = 0;
    }
    this.lastRow = row;
    return row;
  }

  _spawnEndlessWave() {
    this.endlessWave += 1;
    const n = this.endlessWave;
    const list = [];
    const count = Math.min(18, 2 + Math.floor(n * 0.55));
    for (let i = 0; i < count; i++) {
      let type = "normal";
      const r = Math.random();
      if (n >= 4 && r < 0.22) type = "bucket";
      else if (n >= 2 && r < 0.5) type = "cone";
      if (n >= 7 && r > 0.86) type = "football";
      list.push({ type, count: 1 });
    }
    const huge = n % 5 === 0;
    if (huge) list.push({ type: "football", count: 1 + Math.floor(n / 6) });
    this._spawnWave({ list, huge });
    this._showBanner(`第 ${n} 波`, huge ? "一大波僵尸正在接近" : "守住草坪", 1.8);
    this.sfx.wave();
    this.nextWaveAt = this.elapsed + Math.max(10, 24 - n * 0.35);
  }

  _updateWaves(dt) {
    if (this.level.endless) {
      if (this.elapsed >= this.nextWaveAt) this._spawnEndlessWave();
      return;
    }
    while (this.nextWave < this.level.waves.length && this.elapsed >= this.level.waves[this.nextWave].t) {
      this._spawnWave(this.level.waves[this.nextWave]);
      this.nextWave += 1;
    }
    if (this.nextWave >= this.level.waves.length && !this.zombies.some((z) => z.alive)) {
      if (!this.winPending) this.winPending = 1.4;
    }
    if (this.winPending > 0) {
      this.winPending -= dt;
      if (this.winPending <= 0) this.finish(true);
    }
  }

  // ------------------------------------------------------------ 僵尸与植物交互
  eatTargetFor(zombie) {
    let best = null;
    for (const p of this.plants) {
      if (!p.alive || p.row !== zombie.row || p.id === "potatomine" || p.id === "spikeweed") continue;
      if (zombie.x - 20 <= p.x + 28 && zombie.x - 20 >= p.x - 34) {
        if (!best || p.x > best.x) best = p;
      }
    }
    return best;
  }

  zombieAtHouse(zombie) {
    const mower = this.mowers[zombie.row];
    if (mower.state === "idle") {
      mower.trigger();
      this._showBanner("割草机启动！", "只此一次，下不为例", 1.6);
      return;
    }
    if (mower.state === "gone") {
      this.finish(false);
    }
  }

  // ------------------------------------------------------------ 爆炸 / 阳光
  explodeAt(x, y, radius, damage, color) {
    this.shake = Math.max(this.shake, 8);
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - x, z.y - 46 - y);
      if (d < radius) z.takeDamage(damage);
    }
    for (let i = 0; i < 26; i++) {
      this.particles.push({
        x: x + rand(-12, 12), y: y + rand(-12, 12),
        vx: rand(-220, 220), vy: rand(-300, -20),
        life: rand(0.3, 0.9), maxLife: 0.9, size: rand(2, 7),
        color: Math.random() < 0.5 ? color : "#ffd35e",
        kind: Math.random() < 0.3 ? "smoke" : "spark", gravity: 500,
      });
    }
    this.sfx.boom();
  }

  /** 西瓜等抛射物的范围伤害（不重复伤害直接命中的目标） */
  splashDamage(x, y, radius, damage, exclude) {
    for (const z of this.zombies) {
      if (!z.alive || z === exclude) continue;
      if (Math.hypot(z.x - x, z.y - 46 - y) < radius) z.takeDamage(damage);
    }
    this.spawnParticles(x, y, 8, "#a9e36a", "spark");
  }

  burnLane(row, damage) {
    this.shake = Math.max(this.shake, 6);
    for (const z of this.zombies) {
      if (z.alive && z.row === row) z.takeDamage(damage);
    }
    for (let i = 0; i < 42; i++) {
      this.particles.push({
        x: GRID.x + rand(0, GRID_W),
        y: groundY(row) - rand(10, 90),
        vx: rand(-40, 40), vy: rand(-160, -20),
        life: rand(0.3, 0.9), maxLife: 0.9, size: rand(3, 9),
        color: Math.random() < 0.6 ? "#ff8a3a" : "#ffd35e",
        kind: "spark", gravity: -40,
      });
    }
    this.sfx.boom();
  }

  spawnPlantSun(plant) {
    this.suns.push(new Sun(this, plant.x + rand(-8, 8), plant.y - 70, plant.y - 24, PLANTS[plant.id].sunValue || 25, true));
  }

  spawnSkySun() {
    const x = rand(GRID.x + 60, GRID.x + GRID_W - 60);
    this.suns.push(new Sun(this, x, -30, rand(220, 610), 25, false));
  }

  spawnParticles(x, y, count, color, kind = "spark") {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-5, 5), y: y + rand(-5, 5),
        vx: rand(-110, 110), vy: rand(-170, -20),
        life: rand(0.25, 0.7), maxLife: 0.7, size: rand(1.5, 4.5),
        color, kind, gravity: kind === "leaf" ? 90 : 300,
      });
    }
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  }

  // ------------------------------------------------------------ 更新
  _loop(ts) {
    const dt = this.lastTs ? Math.min(0.034, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (!this.paused) this._update(dt);
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - 40 * dt);
    this._updateEffects(dt);
    if (this.phase !== "playing") return;
    this.elapsed += dt;

    this._updateWaves(dt);
    if (this.phase !== "playing") return;

    this.sunTimer -= dt;
    if (this.sunTimer <= 0) {
      this.sunTimer = rand(8.5, 11);
      this.spawnSkySun();
    }
    if (this.cheatInfiniteSun) this.sun = Math.max(this.sun, 9999);
    if (this.cheatNoCooldown) this.cardReadyAt = {};

    for (const p of this.plants) p.update(dt);
    for (const z of this.zombies) z.update(dt);
    for (const m of this.mowers) m.update(dt);
    for (const s of this.suns) s.update(dt);
    for (const p of this.peas) p.update(dt);

    this.peas = this.peas.filter((p) => p.alive);
    this.suns = this.suns.filter((s) => s.alive);
    this.zombies = this.zombies.filter((z) => z.alive || z.deathT < 1.4);
    this.plants = this.plants.filter((p) => p.alive);
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
      t.y -= 24 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (const p of this.ambient) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < 140) p.y = 690;
      if (p.y > 700) p.y = 150;
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  _showBanner(title, sub, duration = 2) {
    this.banner = { title, sub, life: duration, max: duration };
  }

  // ------------------------------------------------------------ 结算
  finish(win) {
    if (this.phase !== "playing") return;
    this.phase = "over";
    this.selected = null;
    this.shovel = false;
    const isEndless = Boolean(this.level.endless);
    let stars = 0;
    if (win) {
      if (this.mowersUsed === 0) stars = 3;
      else if (this.mowersUsed <= 2) stars = 2;
      else stars = 1;
    }
    if (isEndless) {
      const best = Math.max(Number(this.store.state.endlessBest) || 0, this.endlessWave);
      this.store.update((p) => { p.endlessBest = best; });
      this.endlessBest = best;
    } else if (win) {
      this.store.update((p) => {
        p.unlocked = Math.max(Number(p.unlocked) || 1, Math.min(TOTAL_LEVELS, this.level.id + 1));
        p.stars[this.level.id] = Math.max(Number(p.stars[this.level.id]) || 0, stars);
        p.cleared[this.level.id] = true;
      });
    }
    if (win) {
      this.sfx.win();
      this._spawnConfetti();
    } else {
      this.sfx.lose();
    }
    this._showResult(win, stars, isEndless);
  }

  _showResult(win, stars, isEndless) {
    const $ = (id) => document.getElementById(id);
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = `${i * 0.12}s`;
    });
    const title = $("resultTitle");
    if (isEndless) {
      title.textContent = "尸潮结束";
      title.style.color = "#4b7a22";
    } else {
      title.textContent = win ? "草坪守住了！" : "僵尸进屋了";
      title.style.color = win ? "#3d5a1d" : "#a33a2c";
    }
    const sub = isEndless ? "无尽尸潮" : `第 ${this.level.id} 关 · ${this.level.name}`;
    $("resultSub").textContent = sub;
    $("statKills").textContent = String(this.kills);
    $("statMowers").textContent = String(this.mowersUsed);
    $("statTime").textContent = isEndless ? `第 ${this.endlessWave} 波` : `${Math.round(this.elapsed)}s`;
    let note = "";
    if (isEndless) {
      note = `本次坚持到第 ${this.endlessWave} 波 · 最佳纪录 ${this.endlessBest} 波`;
    } else if (win) {
      note = stars === 3 ? "三星达成：没有使用割草机" : "关卡进度已保存";
      if (this.level.id === TOTAL_LEVELS) note += " · 无尽尸潮已解锁";
    } else {
      note = "再调整一下植物搭配，试一次";
    }
    $("resultNote").textContent = note;
    const next = $("nextBtn");
    if (isEndless || (!win && !isEndless)) {
      next.style.display = "none";
    } else if (this.level.id < TOTAL_LEVELS) {
      next.style.display = "";
      next.textContent = "下一关";
      this.nextAction = () => this.startLevel(this.level.id + 1);
    } else {
      next.style.display = "";
      next.textContent = "挑战无尽";
      this.nextAction = () => this.startLevel(0);
    }
    document.getElementById("resultScreen").classList.add("show");
  }

  _spawnConfetti() {
    const colors = ["#ffd35e", "#8fe05c", "#ff8a5a", "#7fd2ff", "#f4e8c8"];
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: rand(0, W), y: rand(-60, -10),
        vx: rand(-70, 70), vy: rand(80, 220),
        life: rand(1.4, 2.6), maxLife: 2.6, size: rand(3, 7),
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "confetti", gravity: 100,
      });
    }
  }

  // ------------------------------------------------------------ 暂停 / 音效
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
    this.sfx.click();
  }

  _toggleSound() {
    this.soundOn = !(this.soundOn !== false);
    this.sfx.enabled = this.soundOn;
    audio.setEnabled(this.soundOn);
    this.store.update((p) => { p.sound = this.soundOn; });
    this._updateSoundButtons();
    if (this.soundOn) {
      this.sfx.ensure();
      this.sfx.click();
    }
  }

  // ------------------------------------------------------------ 背景
  _buildBackground() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    // 顶部木质种子银行
    const wood = g.createLinearGradient(0, 0, 0, TOP_H);
    wood.addColorStop(0, "#7d522c");
    wood.addColorStop(0.55, "#5c3a1c");
    wood.addColorStop(1, "#452a13");
    g.fillStyle = wood;
    g.fillRect(0, 0, W, TOP_H);
    g.strokeStyle = "rgba(255, 220, 160, .18)";
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(0, 10 + i * 15);
      g.bezierCurveTo(W * 0.3, 6 + i * 15, W * 0.7, 16 + i * 15, W, 9 + i * 15);
      g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.lineWidth = 4;
    g.strokeRect(2, 2, W - 4, TOP_H - 8);
    for (const [bx, by] of [[14, 14], [W - 14, 14], [14, TOP_H - 18], [W - 14, TOP_H - 18]]) {
      g.fillStyle = "#c9a05b";
      g.beginPath();
      g.arc(bx, by, 4, 0, TAU);
      g.fill();
    }

    // 天空缝隙 / 远处树篱
    const sky = g.createLinearGradient(0, TOP_H, 0, GRID.y);
    sky.addColorStop(0, "#a8dcff");
    sky.addColorStop(1, "#d6f0c0");
    g.fillStyle = sky;
    g.fillRect(0, TOP_H, W, GRID.y - TOP_H + 8);
    g.fillStyle = "#5a9c45";
    for (let i = 0; i < 42; i++) {
      g.beginPath();
      g.arc(292 + i * 23, GRID.y - 2, 16, Math.PI, TAU);
      g.fill();
    }
    // 栅栏
    g.fillStyle = "#efe2c2";
    for (let x = 292; x < 1230; x += 34) {
      g.fillRect(x, GRID.y - 18, 8, 26);
      g.beginPath();
      g.moveTo(x, GRID.y - 18);
      g.lineTo(x + 4, GRID.y - 27);
      g.lineTo(x + 8, GRID.y - 18);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#d9c8a2";
    g.fillRect(292, GRID.y - 12, 938, 5);

    // 草坪
    const lawn = g.createLinearGradient(0, GRID.y, 0, GRID.y + GRID_H);
    lawn.addColorStop(0, "#8fd45f");
    lawn.addColorStop(0.55, "#74c04b");
    lawn.addColorStop(1, "#5aa93c");
    g.fillStyle = lawn;
    g.fillRect(GRID.x, GRID.y, GRID_W, GRID_H);
    for (let r = 0; r < GRID.rows; r++) {
      for (let col = 0; col < GRID.cols; col++) {
        const x = GRID.x + col * GRID.cell;
        const y = GRID.y + r * GRID.cell;
        if ((r + col) % 2 === 0) {
          g.fillStyle = "rgba(255,255,255,.045)";
          g.fillRect(x, y, GRID.cell, GRID.cell);
        }
        g.strokeStyle = "rgba(30,80,20,.09)";
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, GRID.cell - 1, GRID.cell - 1);
      }
    }
    // 草坪边缘
    g.fillStyle = "rgba(30,70,20,.18)";
    g.fillRect(GRID.x, GRID.y, GRID_W, 3);
    g.fillRect(GRID.x, GRID.y + GRID_H - 3, GRID_W, 3);

    // 左侧房屋
    const wall = g.createLinearGradient(0, TOP_H, 220, 0);
    wall.addColorStop(0, "#f3e6c8");
    wall.addColorStop(1, "#dcc9a2");
    g.fillStyle = wall;
    g.fillRect(0, TOP_H, 250, H - TOP_H);
    g.strokeStyle = "rgba(150,120,75,.25)";
    g.lineWidth = 1.5;
    for (let y = TOP_H + 22; y < H; y += 24) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(250, y);
      g.stroke();
    }
    // 屋顶檐口
    g.fillStyle = "#9c4b3a";
    g.fillRect(0, TOP_H, 250, 46);
    g.fillStyle = "#b85c47";
    for (let x = 0; x < 250; x += 28) {
      g.beginPath();
      g.arc(x + 14, TOP_H + 46, 15, Math.PI, TAU);
      g.fill();
    }
    // 窗户
    g.fillStyle = "#7fb8d8";
    g.strokeStyle = "#fff6df";
    g.lineWidth = 7;
    roundRect(g, 62, 250, 124, 96, 8);
    g.fill();
    g.stroke();
    g.strokeStyle = "#fff6df";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(124, 250);
    g.lineTo(124, 346);
    g.moveTo(62, 298);
    g.lineTo(186, 298);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,.28)";
    g.beginPath();
    g.moveTo(70, 342);
    g.lineTo(170, 256);
    g.lineTo(182, 256);
    g.lineTo(82, 342);
    g.closePath();
    g.fill();
    // 门
    g.fillStyle = "#8a5a35";
    roundRect(g, 72, 520, 110, 200, 6);
    g.fill();
    g.fillStyle = "#6f4526";
    roundRect(g, 86, 538, 82, 168, 4);
    g.fill();
    g.fillStyle = "#e5c67a";
    g.beginPath();
    g.arc(154, 622, 5, 0, TAU);
    g.fill();
    // 墙面阴影
    const wallShadow = g.createLinearGradient(200, 0, 260, 0);
    wallShadow.addColorStop(0, "rgba(60,40,20,0)");
    wallShadow.addColorStop(1, "rgba(60,40,20,.18)");
    g.fillStyle = wallShadow;
    g.fillRect(200, TOP_H, 50, H - TOP_H);

    // 石板路
    g.fillStyle = "#cdbd99";
    g.fillRect(250, TOP_H, 42, H - TOP_H);
    g.strokeStyle = "rgba(90,70,40,.18)";
    g.lineWidth = 1;
    for (let y = TOP_H; y < H; y += 26) {
      g.beginPath();
      g.moveTo(250, y);
      g.lineTo(292, y);
      g.stroke();
    }
    g.fillStyle = "rgba(60,40,15,.12)";
    g.fillRect(250, TOP_H, 4, H - TOP_H);

    // 右侧小路
    g.fillStyle = "#c9b98f";
    g.fillRect(1230, TOP_H, 50, H - TOP_H);
    g.fillStyle = "rgba(90,70,40,.16)";
    for (let y = TOP_H + 30; y < H; y += 52) {
      g.beginPath();
      g.arc(1256, y, 3, 0, TAU);
      g.fill();
    }

    // 底部 HUD 条
    const bottom = g.createLinearGradient(0, 666, 0, H);
    bottom.addColorStop(0, "rgba(32, 48, 20, .92)");
    bottom.addColorStop(1, "rgba(20, 30, 12, .97)");
    g.fillStyle = bottom;
    g.fillRect(0, 666, W, H - 666);
    g.strokeStyle = "rgba(255,255,255,.09)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 666.5);
    g.lineTo(W, 666.5);
    g.stroke();

    // 草坪装饰
    const rng = (s) => {
      let a = s;
      return () => {
        a = (a * 1664525 + 1013904223) % 4294967296;
        return a / 4294967296;
      };
    };
    const r = rng(97);
    for (let i = 0; i < 20; i++) {
      const x = GRID.x + r() * GRID_W;
      const y = GRID.y + r() * GRID_H;
      g.fillStyle = "rgba(60,110,35,.5)";
      g.beginPath();
      g.arc(x, y, 1.5 + r() * 2, 0, TAU);
      g.fill();
    }
    // 小花
    for (let i = 0; i < 12; i++) {
      const x = GRID.x + 30 + r() * (GRID_W - 60);
      const y = GRID.y + 20 + r() * (GRID_H - 40);
      const color = ["#fff3a8", "#ffb8d0", "#ffe27a"][Math.floor(r() * 3)];
      g.fillStyle = color;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 2.4, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#f2a51e";
      g.beginPath();
      g.arc(x, y, 2, 0, TAU);
      g.fill();
    }

    // 暗角
    const vg = g.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,40,10,.2)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    this.bg = c;
  }

  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.phase !== "playing") return;
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
    const inv = document.getElementById("cheatInvincibleText");
    if (inv) inv.textContent = `植物无敌：${this.cheatInvincible ? "开" : "关"}`;
    const inf = document.getElementById("cheatInfiniteText");
    if (inf) inf.textContent = `无限阳光：${this.cheatInfiniteSun ? "开" : "关"}`;
    const cd = document.getElementById("cheatNoCdText");
    if (cd) cd.textContent = `植物无冷却：${this.cheatNoCooldown ? "开" : "关"}`;
    const plants = document.getElementById("cheatPlantsText");
    if (plants) plants.textContent = `解锁全部植物：${this.cheatUnlockPlants ? "开" : "关"}`;
  }

  _spawnCheatZombie(type, count) {
    if (this.phase !== "playing") return;
    for (let i = 0; i < count; i++) {
      const row = this._pickRow();
      const z = new Zombie(this, type, row);
      z.x = W + 50 + i * 52;
      this.zombies.push(z);
    }
    toast(`已增加 ${count} 只${ZOMBIES[type].name}`, "ok");
  }

  _handleCheat(action) {
    if (action === "close") {
      this._closeCheat();
      return;
    }
    if (this.phase !== "playing") return;
    if (action === "sun") {
      this.sun += 1000;
      toast("阳光 +1000", "ok");
    } else if (action === "kill") {
      for (const z of this.zombies) if (z.alive) z.takeDamage(99999);
      toast("已清空全场僵尸", "ok");
    } else if (action === "cooldown") {
      this.cardReadyAt = {};
      toast("植物冷却已清空", "ok");
    } else if (action === "noCooldown") {
      this.cheatNoCooldown = !this.cheatNoCooldown;
      if (this.cheatNoCooldown) this.cardReadyAt = {};
      toast(`植物无冷却：${this.cheatNoCooldown ? "开" : "关"}`, "ok");
    } else if (action === "unlockPlants") {
      this.cheatUnlockPlants = !this.cheatUnlockPlants;
      this._refreshPlantBar();
      toast(`解锁全部植物：${this.cheatUnlockPlants ? "开" : "关"}`, "ok");
    } else if (action === "spawnNormal") {
      this._spawnCheatZombie("normal", 5);
    } else if (action === "spawnBucket") {
      this._spawnCheatZombie("bucket", 1);
    } else if (action === "spawnFootball") {
      this._spawnCheatZombie("football", 1);
    } else if (action === "invincible") {
      this.cheatInvincible = !this.cheatInvincible;
      toast(`植物无敌：${this.cheatInvincible ? "开" : "关"}`, "ok");
    } else if (action === "infinite") {
      this.cheatInfiniteSun = !this.cheatInfiniteSun;
      if (this.cheatInfiniteSun) this.sun = Math.max(this.sun, 9999);
      toast(`无限阳光：${this.cheatInfiniteSun ? "开" : "关"}`, "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = TOTAL_LEVELS; p.tutorialSeen = true; });
      this._refreshSummary();
      toast("已解锁全部关卡", "ok");
    } else if (action === "win") {
      if (this.level.endless) {
        toast("无限模式不能直接过关");
      } else {
        this._closeCheat();
        this.finish(true);
      }
    }
    this._updateCheatText();
  }

  _makeAmbient() {
    this.ambient = [];
    for (let i = 0; i < 30; i++) {
      this.ambient.push({
        x: rand(0, W), y: rand(150, 690),
        vx: rand(-12, 12), vy: rand(-6, 6),
        s: rand(1, 2.4), a: rand(0.15, 0.5), phase: rand(0, 6),
      });
    }
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
    this._drawAmbient(ctx);
    this._drawCloudShadows(ctx);

    for (const m of this.mowers) m.draw(ctx);

    const plants = this.plants.slice().sort((a, b) => a.row - b.row || a.col - b.col);
    for (const p of plants) p.draw(ctx, this);

    // 选中植物的格子高亮 / 幽灵预览
    if (this.selected) {
      if (this.hoverCell) {
        const { row, col } = this.hoverCell;
        ctx.strokeStyle = this.grid[row][col] ? "rgba(255,90,70,.85)" : "rgba(255,255,255,.8)";
        ctx.lineWidth = 3;
        roundRect(ctx, GRID.x + col * GRID.cell + 4, GRID.y + row * GRID.cell + 4, GRID.cell - 8, GRID.cell - 8, 8);
        ctx.stroke();
        if (!this.grid[row][col]) {
          ctx.save();
          ctx.globalAlpha = 0.42;
          ctx.translate(colX(col), groundY(row));
          this.drawPlantGraphic(ctx, this.selected, 1, null);
          ctx.restore();
        }
      }
    }
    if (this.shovel && this.hoverCell) {
      const { row, col } = this.hoverCell;
      if (this.grid[row][col]) {
        ctx.strokeStyle = "rgba(255,210,80,.9)";
        ctx.lineWidth = 3;
        roundRect(ctx, GRID.x + col * GRID.cell + 4, GRID.y + row * GRID.cell + 4, GRID.cell - 8, GRID.cell - 8, 8);
        ctx.stroke();
      }
    }

    const zombies = this.zombies.slice().sort((a, b) => a.row - b.row || a.x - b.x);
    for (const z of zombies) z.draw(ctx, this);
    for (const p of this.peas) p.draw(ctx);
    for (const s of this.suns) s.draw(ctx);

    this._drawParticles(ctx);
    this._drawTexts(ctx);
    this._drawTopBar(ctx);
    this._drawBottomBar(ctx);
    this._drawBanner(ctx);
    ctx.restore();
  }

  _drawAmbient(ctx) {
    ctx.save();
    for (const p of this.ambient) {
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(this.time * 1.4 + p.phase));
      ctx.fillStyle = "#fff7c8";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCloudShadows(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(30, 70, 20, .05)";
    for (let i = 0; i < 3; i++) {
      const x = ((this.time * (12 + i * 5) + i * 430) % (W + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(x, 240 + i * 165, 150, 46, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawTopBar(ctx) {
    // 阳光计数器
    const s = { x: 12, y: 26, w: 138, h: 92 };
    ctx.fillStyle = "rgba(255, 244, 206, .93)";
    ctx.strokeStyle = "#b89a62";
    ctx.lineWidth = 2.5;
    roundRect(ctx, s.x, s.y, s.w, s.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(s.x + 32, s.y + 38);
    ctx.fillStyle = "#ffe45c";
    ctx.strokeStyle = "#e7a51e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#4a3215";
    ctx.font = `900 ${this.isMobile ? 36 : 28}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(String(this.sun), s.x + 56, s.y + 58);
    ctx.font = '700 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "#8a754c";
    ctx.fillText("阳光", s.x + 58, s.y + 76);

    // 植物卡（超出屏幕时横向滚动）
    ctx.save();
    ctx.beginPath();
    ctx.rect(CARD.x, CARD.y - 4, 1200 - CARD.x, CARD.h + 8);
    ctx.clip();
    for (let i = 0; i < this.cardRects.length; i++) {
      const card = this.cardRects[i];
      if (card.x + card.w < CARD.x || card.x > 1200) continue;
      const def = PLANTS[card.id];
      const affordable = this.sun >= def.cost;
      const readyAt = this.cardReadyAt[card.id] || 0;
      const cooling = this.elapsed < readyAt;
      const selected = this.selected === card.id;
      ctx.fillStyle = selected ? "#fff8da" : "rgba(248, 237, 205, .93)";
      ctx.strokeStyle = selected ? "#f2a71b" : "#b89a62";
      ctx.lineWidth = selected ? 3 : 2;
      roundRect(ctx, card.x, card.y, card.w, card.h, 9);
      ctx.fill();
      ctx.stroke();
      if (!affordable || cooling) {
        ctx.fillStyle = "rgba(60, 60, 40, .28)";
        roundRect(ctx, card.x, card.y, card.w, card.h, 9);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(card.x + card.w / 2, card.y + 72);
      this.drawPlantGraphic(ctx, card.id, 0.52, null);
      ctx.restore();
      ctx.fillStyle = "#5a4526";
      ctx.font = `800 ${this.isMobile ? 15 : 10.5}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(def.name, card.x + card.w / 2, card.y + 16);
      // 阳光花费
      ctx.fillStyle = affordable ? "#4a3215" : "#a33a2c";
      ctx.font = `900 ${this.isMobile ? 19 : 15}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(def.cost), card.x + card.w / 2, card.y + card.h - 6);
      // 冷却遮罩
      if (cooling) {
        const def2 = PLANTS[card.id];
        const remain = readyAt - this.elapsed;
        const ratio = clamp(remain / def2.recharge, 0, 1);
        ctx.fillStyle = "rgba(30, 34, 20, .55)";
        roundRect(ctx, card.x + 2, card.y + 2, card.w - 4, (card.h - 4) * ratio, 7);
        ctx.fill();
      }
      // 快捷键角标
      if (i < 9) {
        ctx.fillStyle = "rgba(80, 60, 30, .45)";
        ctx.font = '700 9px "PingFang SC", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(String(i + 1), card.x + 5, card.y + 12);
      }
    }
    ctx.restore();

    // 卡片滚动条
    if (this.cardMaxScroll > 0) {
      const trackX = CARD.x;
      const trackW = 1200 - CARD.x;
      const trackY = CARD.y + CARD.h + 2;
      ctx.fillStyle = "rgba(30, 22, 12, .5)";
      roundRect(ctx, trackX, trackY, trackW, 4, 2);
      ctx.fill();
      const viewW = trackW;
      const totalW = viewW + this.cardMaxScroll;
      const thumbW = Math.max(46, trackW * viewW / totalW);
      const thumbX = trackX + (this.cardScroll / this.cardMaxScroll) * (trackW - thumbW);
      ctx.fillStyle = "rgba(255, 230, 170, .95)";
      roundRect(ctx, thumbX, trackY, thumbW, 4, 2);
      ctx.fill();
      // 左下角提示：卡片可以横向滑动
      ctx.fillStyle = "#73603e";
      ctx.font = `800 ${this.isMobile ? 11 : 9.5}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("◀ 滑动选卡 ▶", 80, 132);
    }

    // 铲子
    const sh = this.shovelRect;
    ctx.fillStyle = this.shovel ? "#fff3c8" : "rgba(248, 237, 205, .93)";
    ctx.strokeStyle = this.shovel ? "#f2a71b" : "#b89a62";
    ctx.lineWidth = this.shovel ? 3 : 2;
    roundRect(ctx, sh.x, sh.y, sh.w, sh.h, 9);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(sh.x + sh.w / 2, sh.y + 40);
    ctx.rotate(-0.35);
    ctx.strokeStyle = "#8a5a2e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.fillStyle = "#b9c3ca";
    ctx.strokeStyle = "#6f7a82";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.lineTo(9, 10);
    ctx.lineTo(6, 24);
    ctx.lineTo(-6, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#6b5a3a";
    ctx.font = '800 10px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("铲子", sh.x + sh.w / 2, sh.y + 82);

    // 关卡进度
    this._drawProgress(ctx);
  }

  _drawProgress(ctx) {
    const x = 160;
    const y = 124;
    const w = 1039;
    const h = 7;
    ctx.fillStyle = "rgba(30, 22, 12, .6)";
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    let progress = 0;
    if (this.level.endless) {
      progress = Math.min(1, (this.endlessWave % 5) / 5);
    } else {
      progress = clamp(this.elapsed / this.level.duration, 0, 1);
    }
    ctx.fillStyle = "#8fdd58";
    roundRect(ctx, x, y, w * progress, h, 4);
    ctx.fill();
    // 旗帜
    if (!this.level.endless) {
      for (const wave of this.level.waves) {
        const fx = x + clamp(wave.t / this.level.duration, 0, 1) * w;
        ctx.fillStyle = wave.huge ? "#e8483c" : "#f3e6c2";
        ctx.beginPath();
        ctx.moveTo(fx, y - 8);
        ctx.lineTo(fx + 7, y - 3);
        ctx.lineTo(fx, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(60,40,15,.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, y - 9);
        ctx.lineTo(fx, y + 5);
        ctx.stroke();
      }
    }
    // 僵尸头标记
    const mx = x + w * progress;
    ctx.fillStyle = "#e8e4d8";
    ctx.beginPath();
    ctx.arc(mx, y + 3.5, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#8fae72";
    ctx.beginPath();
    ctx.arc(mx, y + 3.5, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2a2a20";
    ctx.beginPath();
    ctx.arc(mx - 3, y + 2, 2, 0, TAU);
    ctx.arc(mx + 3, y + 2, 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#3a2a22";
    ctx.beginPath();
    ctx.arc(mx, y + 7, 3, 0, Math.PI);
    ctx.fill();
  }

  _drawBottomBar(ctx) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = `900 ${this.isMobile ? 22 : 18}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#f4eeda";
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 4;
    const title = this.level.endless ? `无尽尸潮 · 第 ${this.endlessWave} 波` : `第 ${this.level.id} 关 · ${this.level.name}`;
    ctx.fillText(title, 300, 703);
    ctx.shadowBlur = 0;
    if (!this.isMobile) {
      ctx.font = '600 11.5px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = "rgba(240, 238, 220, .55)";
      ctx.textAlign = "center";
      ctx.fillText("点击阳光 → 选择植物卡 → 点击草坪种植", 780, 702);
    }
    ctx.restore();
  }

  _drawBanner(ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = 1 - clamp(b.life / b.max, 0, 1);
    const alpha = b.life < 0.35 ? clamp(b.life / 0.35, 0, 1) : Math.min(1, k * 5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 250);
    ctx.fillStyle = "rgba(28, 40, 18, .82)";
    ctx.strokeStyle = "rgba(255, 220, 130, .55)";
    ctx.lineWidth = 2;
    const w = 440;
    roundRect(ctx, -w / 2, -46, w, 84, 16);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe6a8";
    ctx.font = '900 30px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(b.title, 0, -4);
    ctx.fillStyle = "rgba(245, 238, 215, .75)";
    ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(b.sub || "", 0, 24);
    ctx.restore();
  }

  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = '900 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.strokeStyle = "rgba(30,40,15,.65)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === "smoke") {
        ctx.fillStyle = "rgba(90, 80, 60, .5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU);
        ctx.fill();
      } else if (p.kind === "spark" || p.kind === "confetti") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.7);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 植物绘制
  drawPlantGraphic(ctx, id, scale, plant) {
    ctx.save();
    ctx.scale(scale, scale);
    const t = this.time;
    const hpRatio = plant ? clamp(plant.hp / plant.maxHp, 0, 1) : 1;
    // 影子
    ctx.fillStyle = "rgba(20,40,10,.18)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 6, 0, 0, TAU);
    ctx.fill();

    const stem = (x1, y1, x2, y2, w = 5, color = "#3f8f34") => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const leaf = (x, y, angle, color = "#4aa63d") => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 6, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(30,80,25,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.restore();
    };
    const eyes = (x, y, r = 2.2, color = "#243018") => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x - 5, y, r, 0, TAU);
      ctx.arc(x + 5, y, r, 0, TAU);
      ctx.fill();
    };

    if (id === "sunflower") {
      stem(0, 0, 0, -34);
      leaf(-9, -14, -0.5);
      leaf(9, -20, 0.45);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.fillStyle = i % 2 ? "#ffd23f" : "#ffc21f";
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 19, -52 + Math.sin(a) * 19, 10, 6, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#9c6426";
      ctx.beginPath();
      ctx.arc(0, -52, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#243018";
      ctx.beginPath();
      ctx.arc(-5, -54, 2.2, 0, TAU);
      ctx.arc(5, -54, 2.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -48, 6, 0, Math.PI);
      ctx.stroke();
    } else if (id === "peashooter" || id === "snowpea") {
      const snow = id === "snowpea";
      const green = snow ? "#7fd5e8" : "#5fbf4a";
      const dark = snow ? "#4a9fb8" : "#3d8f32";
      stem(0, 0, 0, -30, 6, dark);
      leaf(-10, -14, -0.5, dark);
      leaf(10, -22, 0.45, dark);
      ctx.fillStyle = green;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -48, 19, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 炮口
      ctx.fillStyle = green;
      ctx.strokeStyle = dark;
      roundRect(ctx, 12, -58, 26, 20, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(37, -48, 4, 6, 0, 0, TAU);
      ctx.fill();
      eyes(-2, -52, 2.4);
      if (snow) {
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath();
        ctx.arc(-9, -61, 2, 0, TAU);
        ctx.arc(6, -64, 1.5, 0, TAU);
        ctx.fill();
      }
    } else if (id === "repeater") {
      stem(0, 0, 0, -30, 6, "#3d8f32");
      leaf(-10, -14, -0.5);
      leaf(10, -22, 0.45);
      ctx.fillStyle = "#5fbf4a";
      ctx.strokeStyle = "#3d8f32";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -48, 19, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (const [ox, oy] of [[14, -56], [16, -42]]) {
        ctx.fillStyle = "#5fbf4a";
        roundRect(ctx, ox, oy, 24, 15, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2f7026";
        ctx.beginPath();
        ctx.ellipse(ox + 23, oy + 7, 3, 5, 0, 0, TAU);
        ctx.fill();
      }
      eyes(-2, -52, 2.4);
    } else if (id === "gatling") {
      stem(0, 0, 0, -30, 6, "#3d8f32");
      leaf(-10, -14, -0.5);
      leaf(10, -22, 0.45);
      ctx.fillStyle = "#63c44c";
      ctx.strokeStyle = "#357a2b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -48, 20, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#8b98a2";
      roundRect(ctx, 10, -60, 9, 26, 4);
      ctx.fill();
      ctx.fillStyle = "#5f6c76";
      for (let i = 0; i < 4; i++) {
        roundRect(ctx, 19, -61 + i * 7, 22, 5, 2.5);
        ctx.fill();
      }
      eyes(-3, -52, 2.2);
      ctx.fillStyle = "#ffd35e";
      ctx.beginPath();
      ctx.arc(6, -64, 2, 0, TAU);
      ctx.fill();
    } else if (id === "wallnut") {
      ctx.fillStyle = "#c08a4e";
      ctx.strokeStyle = "#8a5a2e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -38, 27, 36, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d9a665";
      ctx.beginPath();
      ctx.ellipse(-7, -48, 8, 12, -0.3, 0, TAU);
      ctx.fill();
      eyes(0, -42, 2.6);
      ctx.strokeStyle = "#6b4220";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -32, 7, 0.2, Math.PI - 0.2);
      ctx.stroke();
      if (hpRatio < 0.66) {
        ctx.strokeStyle = "rgba(80,45,20,.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-14, -56);
        ctx.lineTo(-7, -46);
        ctx.lineTo(-12, -36);
        ctx.stroke();
      }
      if (hpRatio < 0.33) {
        ctx.beginPath();
        ctx.moveTo(16, -48);
        ctx.lineTo(9, -38);
        ctx.lineTo(17, -28);
        ctx.stroke();
      }
    } else if (id === "potatomine") {
      ctx.fillStyle = "#8a5a30";
      ctx.beginPath();
      ctx.ellipse(0, -4, 24, 9, 0, 0, TAU);
      ctx.fill();
      const armed = plant ? plant.arm >= (plant.def.armTime || 99) : true;
      if (!armed) {
        ctx.fillStyle = "#9c6a38";
        ctx.beginPath();
        ctx.ellipse(0, -8, 16, 8, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#6b4522";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -24);
        ctx.stroke();
        ctx.fillStyle = "#7c9a4a";
        ctx.beginPath();
        ctx.ellipse(4, -25, 6, 3, -0.4, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = "#b37a42";
        ctx.strokeStyle = "#7c4c22";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -15, 18, 13, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        eyes(0, -17, 2);
        ctx.fillStyle = "#ff4a3a";
        ctx.beginPath();
        ctx.arc(0, -29, 3.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,80,60,.35)";
        ctx.beginPath();
        ctx.arc(0, -29, 7, 0, TAU);
        ctx.fill();
      }
    } else if (id === "cherrybomb") {
      stem(-10, -8, -16, -34, 3, "#4a8f35");
      stem(10, -8, 14, -32, 3, "#4a8f35");
      for (const [x, y] of [[-14, -34], [15, -38]]) {
        ctx.fillStyle = "#e8483c";
        ctx.strokeStyle = "#a32a22";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ff8a7a";
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 3, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = "#8a5a2e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, -48);
      ctx.quadraticCurveTo(2, -58, 8, -56);
      ctx.stroke();
      ctx.fillStyle = "#ffd35e";
      ctx.beginPath();
      ctx.arc(8, -56, 3 + Math.sin(t * 10) * 1, 0, TAU);
      ctx.fill();
    } else if (id === "chomper") {
      stem(0, 0, 0, -26, 6, "#3f8f34");
      leaf(-10, -12, -0.5);
      leaf(10, -18, 0.45);
      ctx.fillStyle = "#8b5fb0";
      ctx.strokeStyle = "#5e3b7c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -48, 22, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 嘴
      const open = plant && plant.windup > 0 ? 1 : 0.55;
      ctx.fillStyle = "#3a1f45";
      ctx.beginPath();
      ctx.moveTo(-18, -46);
      ctx.quadraticCurveTo(0, -46 - open * 18, 18, -46);
      ctx.quadraticCurveTo(0, -46 + open * 16, -18, -46);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f4eedd";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8 - 2, -52);
        ctx.lineTo(i * 8 + 2, -52);
        ctx.lineTo(i * 8, -45);
        ctx.closePath();
        ctx.fill();
      }
      eyes(-8, -60, 2);
      eyes(8, -60, 2);
    } else if (id === "threepeater") {
      for (const [x, y, s] of [[-15, -30, 0.8], [0, -44, 1], [15, -30, 0.8]]) {
        stem(x, 0, x, y - 12, 5, "#3d8f32");
        ctx.fillStyle = "#5fbf4a";
        ctx.strokeStyle = "#3d8f32";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, y, 15 * s, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#5fbf4a";
        roundRect(ctx, x + 9 * s, y - 8 * s, 18 * s, 13 * s, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2f7026";
        ctx.beginPath();
        ctx.ellipse(x + 26 * s, y - 1 * s, 2.5, 4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#243018";
        ctx.beginPath();
        ctx.arc(x - 2, y - 4, 1.8, 0, TAU);
        ctx.fill();
      }
    } else if (id === "jalapeno") {
      ctx.fillStyle = "#e8483c";
      ctx.strokeStyle = "#a32a22";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.quadraticCurveTo(24, -54, 20, -24);
      ctx.quadraticCurveTo(14, -4, 0, -6);
      ctx.quadraticCurveTo(-14, -4, -20, -24);
      ctx.quadraticCurveTo(-24, -54, 0, -60);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#4a8f35";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.quadraticCurveTo(2, -72, 12, -70);
      ctx.stroke();
      eyes(0, -40, 2.4);
      ctx.strokeStyle = "#5a1a14";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -50);
      ctx.lineTo(-3, -47);
      ctx.moveTo(8, -50);
      ctx.lineTo(3, -47);
      ctx.moveTo(-6, -28);
      ctx.lineTo(6, -28);
      ctx.stroke();
      // 引信火光
      if (plant && plant.fuse < 0.6) {
        ctx.fillStyle = "#ffd35e";
        ctx.beginPath();
        ctx.arc(12, -70, 4 + Math.sin(t * 18) * 1.5, 0, TAU);
        ctx.fill();
      }
    } else if (id === "squash") {
      ctx.fillStyle = "#8fc44a";
      ctx.strokeStyle = "#5f8f2e";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -30, 24, 30, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#a9d666";
      ctx.beginPath();
      ctx.ellipse(-7, -40, 8, 10, -0.3, 0, TAU);
      ctx.fill();
      stem(0, -58, 0, -68, 4, "#4a8f35");
      eyes(0, -34, 2.6);
      ctx.strokeStyle = "#3d5a1d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -44);
      ctx.lineTo(-3, -41);
      ctx.moveTo(9, -44);
      ctx.lineTo(3, -41);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -24, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (id === "melon") {
      stem(0, 0, 0, -22, 5, "#3d8f32");
      leaf(-10, -12, -0.5);
      leaf(10, -16, 0.45);
      ctx.fillStyle = "#4f9a3a";
      ctx.strokeStyle = "#2f6b23";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, -40, 26, 22, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#2f6b23";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, -60);
        ctx.quadraticCurveTo(i * 11, -40, i * 8, -20);
        ctx.stroke();
      }
      eyes(0, -42, 2.4);
      ctx.strokeStyle = "#2f6b23";
      ctx.beginPath();
      ctx.arc(0, -34, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (id === "spikeweed") {
      ctx.fillStyle = "#4f9a3a";
      ctx.strokeStyle = "#2f6b23";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, -5, 28, 9, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#7ed957";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 10 - 4, -8);
        ctx.lineTo(i * 10, -28);
        ctx.lineTo(i * 10 + 4, -8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#2f6b23";
      ctx.beginPath();
      ctx.arc(-7, -10, 1.8, 0, TAU);
      ctx.arc(7, -10, 1.8, 0, TAU);
      ctx.fill();
    } else if (id === "magnet") {
      stem(0, 0, 0, -24, 7, "#d9d2c2");
      ctx.fillStyle = "#8b5fb0";
      ctx.strokeStyle = "#5e3b7c";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, -46, 24, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4eedd";
      ctx.beginPath();
      ctx.arc(0, -40, 5, 0, TAU);
      ctx.fill();
      const magnet = (x, y, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(x, y, 6, Math.PI, TAU);
        ctx.stroke();
        ctx.strokeStyle = "#d9d2c2";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x - 6, y + 5);
        ctx.moveTo(x + 6, y);
        ctx.lineTo(x + 6, y + 5);
        ctx.stroke();
      };
      magnet(-13, -52, "#e8483c");
      magnet(13, -52, "#5b8fd6");
    } else if (id === "iceshroom") {
      stem(0, 0, 0, -26, 7, "#dcecf7");
      ctx.fillStyle = "#8fd7f0";
      ctx.strokeStyle = "#4a9fb8";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, -44, 26, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.arc(-10, -50, 4, 0, TAU);
      ctx.arc(6, -55, 3, 0, TAU);
      ctx.arc(14, -46, 3, 0, TAU);
      ctx.fill();
      eyes(0, -34, 2.2);
    }
    ctx.restore();
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.__pvz = new PvZGame();
