/**
 * 石器大战 · 回合制物理对战
 * ------------------------------------------------------------
 * 核心循环：
 * 玩家回合（移动/瞄准/发射） -> 弹道结算 -> 敌方 AI 回合 -> 下一回合
 * 地形为可破坏瓦片网格，爆炸会改变地形与落点。
 */
import "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { icon, toast } from "../../assets/js/ui.js";
import {
  WORLD, LEVELS, WEAPONS, WEAPON_ORDER, ENEMY_TYPES, THEMES, getLevel, getEndlessLevel,
} from "./levels.js";
import { Terrain, mulberry32 } from "./terrain.js";

const W = WORLD.w;
const H = WORLD.h;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 音效
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastHit = 0;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.26;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  tone(freq, dur, type = "sine", vol = 0.12, endFreq = null) {
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
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
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

  shoot(type) {
    if (type === "spear") {
      this.tone(820, 0.09, "sawtooth", 0.07, 300);
      this.noise(0.08, 0.05, 2400);
    } else if (type === "boulder") {
      this.noise(0.18, 0.11, 700);
      this.tone(140, 0.15, "triangle", 0.08, 80);
    } else if (type === "grenade") {
      this.tone(220, 0.14, "square", 0.05, 420);
    } else if (type === "banana") {
      this.tone(520, 0.12, "triangle", 0.07, 300);
    } else {
      this.noise(0.16, 0.07, 1600);
      this.tone(180, 0.1, "sawtooth", 0.05, 90);
    }
  }

  explode(size = 60) {
    this.noise(0.35 + size / 500, 0.28, 420);
    this.tone(72, 0.34, "sine", 0.24, 34);
    setTimeout(() => this.noise(0.25, 0.08, 260), 70);
  }

  hit() {
    const now = performance.now();
    if (now - this.lastHit < 60) return;
    this.lastHit = now;
    this.tone(190, 0.06, "square", 0.05, 120);
  }

  jump() { this.tone(300, 0.13, "sine", 0.07, 520); }
  click() { this.tone(620, 0.045, "square", 0.035); }
  turn() { this.tone(420, 0.1, "triangle", 0.05); setTimeout(() => this.tone(610, 0.11, "triangle", 0.045), 90); }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, "triangle", 0.08), i * 120));
  }
  lose() {
    [330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.08), i * 170));
  }
}

// ---------------------------------------------------------------- 单位
class Unit {
  constructor(game, team, x, y, type, hp, index, name) {
    this.game = game;
    this.team = team; // 0 = 玩家，1 = 敌方
    this.x = x;
    this.y = y;
    this.type = type;
    this.index = index;
    this.name = name;
    this.maxHp = hp;
    this.hp = hp;
    this.alive = true;
    this.onGround = true;
    this.vy = 0;
    this.facing = team === 0 ? 1 : -1;
    this.walkPhase = 0;
    this.moveSpeed = 0;
    this.flash = 0;
    this.deathT = 0;
    this.radius = 16;
    // 实时模式下的敌方 AI 计时器
    this.aiTimer = rand(0.9, 2.2);
    this.aiMoveTimer = rand(0.6, 1.8);
    this.aiMoveDir = 0;
    this.aiAim = null;
    const cfg = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
    if (team === 0) {
      this.skin = "#e2a06b";
      this.cloth = "#e8892c";
      this.band = "#ffcf7a";
      this.scale = 1;
    } else {
      this.skin = cfg.skin;
      this.cloth = cfg.cloth;
      this.band = "#2c1a17";
      this.scale = cfg.scale;
    }
    this.baseHp = hp;
  }

  update(dt) {
    if (!this.alive) {
      this.deathT += dt;
      return;
    }
    this.flash = Math.max(0, this.flash - dt);
    if (this.onGround) {
      const gy = this.game.terrain.surfaceBelow(this.x, this.y - 8);
      if (gy === null || gy > this.y + 6) this.onGround = false;
    }
    if (!this.onGround) {
      this.vy += 1500 * dt;
      const ny = this.y + this.vy * dt;
      if (this.vy > 0) {
        const gy = this.game.terrain.surfaceBelow(this.x, this.y + 1);
        if (gy !== null && ny >= gy) {
          this.y = gy;
          this.vy = 0;
          this.onGround = true;
        } else {
          this.y = ny;
        }
      } else {
        if (this.game.terrain.solidAt(this.x, ny - 52)) {
          this.vy = 0;
        } else {
          this.y = ny;
        }
      }
      if (this.y > H + 50) this.die();
    }
    this.moveSpeed *= Math.pow(0.0001, dt);
  }

  /** 行走：可自动跨上一格台阶，遇到高墙停下 */
  tryMove(dx) {
    if (!this.alive) return false;
    const nx = clamp(this.x + dx, 14, W - 14);
    if (this.game.terrain.solidAt(nx, this.y - 12) || this.game.terrain.solidAt(nx, this.y - 34)) {
      return false;
    }
    const gy = this.game.terrain.surfaceBelow(nx, this.y - 26);
    this.x = nx;
    if (gy !== null && gy <= this.y + 18) {
      this.y = gy;
      this.onGround = true;
    } else if (gy === null || gy > this.y + 24) {
      this.onGround = false;
    }
    this.walkPhase += dx * 0.16;
    return true;
  }

  jump() {
    if (!this.alive || !this.onGround) return false;
    this.vy = -470;
    this.onGround = false;
    this.game.sfx.jump();
    return true;
  }

  takeDamage(amount, sourceTeam) {
    if (!this.alive) return;
    if (this.team === 0 && this.game.cheatGod) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.22;
    this.game.addText(this.x, this.y - 72, "-" + Math.round(amount), sourceTeam === 0 ? "#ffe08a" : "#ff9f93");
    this.game.sfx.hit();
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0;
    this.onGround = false;
    this.vy = -180;
    this.game.onUnitDeath(this);
  }

  draw(ctx, game) {
    if (!this.alive && this.deathT > 1.6) return;
    const active = game.isActiveUnit(this);
    const t = game.time;
    const fade = this.alive ? 1 : clamp(1 - this.deathT / 1.6, 0, 1);
    const face = this.facing;
    const enemyAiming = this.team === 1 && this.aiAim;
    const aiming = enemyAiming || (active && (game.aim.active || game.aim.locked));
    const aimAngle = aiming
      ? (this.team === 0 ? game.aim.angle : this.aiAim.angle)
      : null;

    ctx.save();
    ctx.globalAlpha = fade;
    // 脚下阴影
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, 17 * this.scale, 5, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    if (!this.alive) {
      ctx.translate(0, 6);
      ctx.rotate(face * 1.25);
    }
    ctx.scale(face * this.scale, this.scale);

    const moving = this.onGround && Math.abs(this.moveSpeed) > 3;
    const swing = moving ? Math.sin(this.walkPhase) * 7 : 0;
    const skin = this.skin;
    const cloth = this.cloth;
    const outline = "#2a1a12";

    // 腿
    this._limb(ctx, -5, -18, -7 - swing, -1, 7, skin);
    this._limb(ctx, 5, -18, 7 + swing, -1, 7, skin);
    ctx.fillStyle = "#5b3a24";
    ctx.beginPath();
    ctx.ellipse(-8 - swing, -1, 6, 3, 0, 0, TAU);
    ctx.ellipse(8 + swing, -1, 6, 3, 0, 0, TAU);
    ctx.fill();

    // 躯干
    ctx.fillStyle = skin;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -30, 11.5, 16, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // 胸毛
    ctx.strokeStyle = "rgba(70,40,22,.45)";
    ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4, -38);
      ctx.lineTo(i * 3 + 2, -30);
      ctx.stroke();
    }

    // 兽皮短裤
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-13, -22);
    ctx.lineTo(13, -22);
    ctx.lineTo(12, -12);
    ctx.lineTo(6, -15);
    ctx.lineTo(3, -10);
    ctx.lineTo(-2, -15);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-12, -13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 腰带
    ctx.strokeStyle = "#7a4a22";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-13, -22);
    ctx.lineTo(13, -22);
    ctx.stroke();

    // 后手臂
    this._limb(ctx, -9, -37, -14, -25, 6, skin);

    // 前手臂（瞄准时指向目标）
    let armAngle = -0.55;
    if (aiming && aimAngle !== null) {
      armAngle = face === 1 ? aimAngle : Math.PI - aimAngle;
    } else if (active) {
      armAngle = -0.4;
    }
    const sx = 3;
    const sy = -35;
    const hx = sx + Math.cos(armAngle) * 24;
    const hy = sy + Math.sin(armAngle) * 24;
    this._limb(ctx, sx, sy, hx, hy, 6.5, skin);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, TAU);
    ctx.fill();

    // 武器
    let weaponType = "club";
    if (this.team === 0 && active) {
      weaponType = game.selectedWeapon;
    } else if (this.team === 1 && this.aiAim) {
      weaponType = this.aiAim.weapon.id;
    }
    game.drawHeldWeapon(ctx, weaponType, hx, hy, armAngle, this.scale);

    // 头
    ctx.fillStyle = skin;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -49, 11.5, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // 头发
    ctx.fillStyle = this.team === 0 ? "#3a2417" : "#241512";
    ctx.beginPath();
    ctx.arc(0, -50, 11.8, Math.PI * 1.02, Math.PI * 2.02);
    ctx.lineTo(9, -54);
    ctx.lineTo(5, -57);
    ctx.lineTo(1, -54);
    ctx.lineTo(-3, -58);
    ctx.lineTo(-7, -54);
    ctx.lineTo(-11, -56);
    ctx.closePath();
    ctx.fill();

    // 头带
    ctx.strokeStyle = this.team === 0 ? "#d97722" : "#6b2e24";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -50, 11.6, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    // 眼睛 / 眉毛 / 鼻子 / 胡子
    ctx.fillStyle = "#1a100c";
    ctx.beginPath();
    ctx.arc(4.6, -50, 1.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#2a170f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1.4, -54.5);
    ctx.lineTo(7.6, -53.8);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(8, -48);
    ctx.quadraticCurveTo(12.5, -46.5, 8.5, -44.5);
    ctx.fill();
    ctx.fillStyle = "#3a2417";
    ctx.beginPath();
    ctx.moveTo(2, -44);
    ctx.quadraticCurveTo(7, -40, 10, -45);
    ctx.quadraticCurveTo(6, -43, 2, -44);
    ctx.fill();

    // 酋长骨冠
    if (this.type === "chief") {
      ctx.strokeStyle = "#e8dfc6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, -58);
      ctx.quadraticCurveTo(0, -72, 8, -58);
      ctx.stroke();
      ctx.fillStyle = "#e8dfc6";
      ctx.beginPath();
      ctx.arc(-8, -58, 3, 0, TAU);
      ctx.arc(8, -58, 3, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // 血条（不随角色翻转）
    if (this.alive) {
      const bw = 46;
      const bx = this.x - bw / 2;
      const by = this.y - (this.type === "chief" ? 96 : 86);
      ctx.fillStyle = "rgba(8,8,10,.62)";
      this._roundRect(ctx, bx - 1, by - 1, bw + 2, 7, 3);
      ctx.fill();
      const ratio = this.hp / this.maxHp;
      ctx.fillStyle = this.team === 0
        ? (ratio > 0.5 ? "#7ddc91" : ratio > 0.25 ? "#ffcf6b" : "#ff7b6b")
        : "#ff8a7a";
      this._roundRect(ctx, bx, by, Math.max(0, bw * ratio), 5, 2.5);
      ctx.fill();
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 2;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(this.x, this.y - 42, 24, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 当前行动单位标记
    if (active && this.alive) {
      const bob = Math.sin(t * 6) * 3;
      ctx.fillStyle = this.team === 0 ? "#ffd27c" : "#ff9a8c";
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 100 + bob);
      ctx.lineTo(this.x - 7, this.y - 110 + bob);
      ctx.lineTo(this.x + 7, this.y - 110 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = this.team === 0 ? "rgba(255,210,120,.5)" : "rgba(255,140,120,.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 1, 24, 8, 0, 0, TAU);
      ctx.stroke();
    }
  }

  _limb(ctx, x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// ---------------------------------------------------------------- 投射物
class Projectile {
  constructor(game, type, x, y, vx, vy, team) {
    this.game = game;
    this.type = type;
    this.team = team;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.weapon = type === "bananaSmall"
      ? { ...WEAPONS.banana, damage: 24, blast: 48, speed: 600, gravity: 960 }
      : WEAPONS[type];
    this.dead = false;
    this.age = 0;
    this.rotation = Math.atan2(vy, vx);
    this.trail = [];
    this.lastBounce = 0;
    this.hitSet = new Set();
    this.returned = false;
    this.fuse = type === "grenade" ? WEAPONS.grenade.fuse : type === "bananaSmall" ? 0.9 : null;
    this.r = type === "boulder" ? 8 : type === "spike" ? 9 : type === "spear" ? 4 : 6;
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.type === "spike") {
      this.updateSpike(dt);
      return;
    }
    if (this.type === "boomerang") {
      this.updateBoomerang(dt);
      return;
    }
    const w = this.weapon;
    if (this.fuse !== null) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    }
    const speed = Math.hypot(this.vx, this.vy);
    const steps = clamp(Math.ceil((speed * dt) / 6), 1, 10);
    const h = dt / steps;
    for (let i = 0; i < steps && !this.dead; i++) {
      this.vx += this.game.wind * 27 * h;
      this.vy += w.gravity * h;
      const nx = this.x + this.vx * h;
      const ny = this.y + this.vy * h;
      if (nx < -100 || nx > W + 100 || ny > H + 100) {
        this.dead = true;
        return;
      }
      // 命中敌对单位
      for (const u of this.game.units) {
        if (!u.alive || u.team === this.team) continue;
        const dx = nx - u.x;
        const dy = ny - (u.y - 28);
        if (dx * dx + dy * dy < 20 * 20) {
          this.x = nx;
          this.y = ny;
          this.explode();
          return;
        }
      }
      if (this.game.terrain.circleHit(nx, ny, 3)) {
        if (this.type === "grenade") {
          // 反弹：按命中轴分别处理
          const hitX = this.game.terrain.circleHit(nx, this.y, 3);
          const hitY = this.game.terrain.circleHit(this.x, ny, 3);
          if (hitY) {
            this.vy = -Math.abs(this.vy) * w.bounce;
            this.y -= 3;
          }
          if (hitX) {
            this.vx = -this.vx * w.bounce;
          }
          if (!hitX && !hitY) {
            this.vx *= -0.45;
            this.vy = -Math.abs(this.vy) * 0.4;
            this.y -= 4;
          }
          if (Math.abs(this.vy) < 55) this.vy = 0;
          if (Math.abs(this.vx) < 28) this.vx = 0;
          if (this.age - this.lastBounce > 0.12) {
            this.lastBounce = this.age;
            this.game.sfx.tone(180, 0.05, "triangle", 0.03);
          }
          this.x = clamp(nx, 0, W);
          continue;
        }
        this.x = nx;
        this.y = ny;
        this.explode();
        return;
      }
      this.x = nx;
      this.y = ny;
      this.rotation = Math.atan2(this.vy, this.vx);
      this.trail.push({ x: nx, y: ny });
      if (this.trail.length > 14) this.trail.shift();
    }
  }

  /** 刺球：贴地滚动，撞墙反弹，碰敌即爆 */
  updateSpike(dt) {
    const g = this.game;
    for (const u of g.units) {
      if (!u.alive || u.team === this.team) continue;
      const dx = this.x - u.x;
      const dy = this.y - (u.y - 24);
      if (dx * dx + dy * dy < 24 * 24) {
        this.explode();
        return;
      }
    }
    let nx = this.x + this.vx * dt;
    const dir = Math.sign(this.vx) || 1;
    if (g.terrain.solidAt(nx + dir * 8, this.y - 6)) {
      this.vx *= -0.45;
      nx = this.x;
    }
    const surf = g.terrain.surfaceBelow(nx, this.y - 10);
    if (surf !== null && surf <= this.y + 14) {
      this.y = surf;
      this.vy = 0;
    } else {
      this.vy += 900 * dt;
      this.y += this.vy * dt;
    }
    this.x = clamp(nx, -20, W + 20);
    const ahead = g.terrain.surfaceBelow(this.x + dir * 10, this.y - 12);
    if (ahead !== null && ahead > this.y + 2) this.vx += dir * 70 * dt;
    this.vx *= 1 - 0.15 * dt;
    this.rotation += (this.vx * dt) / 12;
    this.trail.push({ x: this.x, y: this.y - 6 });
    if (this.trail.length > 14) this.trail.shift();
    if (this.age > 5.5 || Math.abs(this.vx) < 9 || this.x <= -18 || this.x >= W + 18 || this.y > H + 50) {
      if (this.y > H + 40) this.dead = true;
      else this.explode();
    }
  }

  /** 回旋镖：飞出后折返，可对同一目标只造成一次伤害 */
  updateBoomerang(dt) {
    const g = this.game;
    if (!this.returned && this.age > 0.85) {
      this.returned = true;
      this.vx *= -0.92;
      this.vy *= -0.35;
    }
    this.vx += g.wind * 10 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += dt * 20;
    if (this.x < -80 || this.x > W + 80 || this.y < -80 || this.y > H + 80) {
      this.dead = true;
      return;
    }
    if (g.terrain.circleHit(this.x, this.y, 5)) {
      this.vx *= -0.8;
      this.vy = Math.abs(this.vy) * 0.4;
      this.x += this.vx * dt * 2;
    }
    for (const u of g.units) {
      if (!u.alive || u.team === this.team || this.hitSet.has(u)) continue;
      const dx = this.x - u.x;
      const dy = this.y - (u.y - 28);
      if (dx * dx + dy * dy < 24 * 24) {
        this.hitSet.add(u);
        u.takeDamage(this.weapon.damage, this.team);
        g.spawnParticles(this.x, this.y, 6, this.weapon.color, "spark");
      }
    }
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 16) this.trail.shift();
    if (this.age > 2.6) this.dead = true;
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    if (this.type === "banana") {
      g.explode(this.x, this.y, this.weapon.blast, this.weapon.damage, this.team);
      for (let i = 0; i < 3; i++) {
        const p = new Projectile(g, "bananaSmall", this.x + rand(-6, 6), this.y - 4, rand(-230, 230), rand(-390, -160), this.team);
        g.projectiles.push(p);
      }
    } else if (this.type === "spear") {
      g.explode(this.x, this.y, 22, this.weapon.damage, this.team, "spear");
    } else {
      g.explode(this.x, this.y, this.weapon.blast, this.weapon.damage, this.team);
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const type = this.type;
    const w = this.weapon;
    // 拖尾
    if (this.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = type === "spear" ? 2 : 3;
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    if (type === "spear") {
      ctx.rotate(this.rotation);
      ctx.strokeStyle = "#c7a979";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.fillStyle = "#e8dcc3";
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(20, 0);
      ctx.lineTo(8, 4);
      ctx.closePath();
      ctx.fill();
    } else if (type === "boulder") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#9a714e";
      ctx.strokeStyle = "#3a2417";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(40,24,14,.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 5);
      ctx.stroke();
    } else if (type === "grenade") {
      const pulse = this.fuse !== null && this.fuse < 0.7 ? 1 + Math.sin(this.age * 40) * 0.15 : 1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#5f6b53";
      ctx.strokeStyle = "#242b20";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#b88752";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(3, -6);
      ctx.quadraticCurveTo(8, -12, 4, -15);
      ctx.stroke();
      if (this.fuse !== null && this.fuse < 0.7) {
        ctx.fillStyle = "#ffd35e";
        ctx.beginPath();
        ctx.arc(4, -15, 2.5 + Math.random() * 2, 0, TAU);
        ctx.fill();
      }
    } else if (type === "boomerang") {
      ctx.rotate(this.rotation);
      ctx.strokeStyle = "#e8b96a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-10, -7);
      ctx.lineTo(0, 0);
      ctx.lineTo(-10, 7);
      ctx.stroke();
      ctx.strokeStyle = "#b7823f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-8, 5);
      ctx.stroke();
    } else if (type === "banana" || type === "bananaSmall") {
      ctx.rotate(this.rotation);
      const s = type === "bananaSmall" ? 0.7 : 1;
      ctx.scale(s, s);
      ctx.strokeStyle = "#ffe15c";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 9, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
      ctx.strokeStyle = "#b58e1f";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, Math.PI * 0.2, Math.PI * 0.9);
      ctx.stroke();
    } else if (type === "spike") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#8799a9";
      ctx.strokeStyle = "#2c3540";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c7d3dd";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 游戏主体
class StoneWars {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.sfx = new Sfx();
    this.store = new ProgressStore("stone-wars");
    this.level = null;
    this.terrain = null;
    this.theme = THEMES.dawn;
    this.players = [];
    this.enemies = [];
    this.units = [];
    this.projectiles = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.ambient = [];
    this.timers = [];
    this.phase = "menu";
    this.paused = true;
    this.turnTeam = 0;
    this.turnNo = 1;
    this.battleTime = 0;
    this.wind = 0;
    this.windTimer = 7;
    this.moveBudget = 0;
    this.maxMove = 150;
    this.activePlayerIndex = 0;
    this.activeEnemyIndex = 0;
    this.selectedWeapon = "spear";
    this.ammo = { ...WEAPONS };
    this.weaponReadyAt = {};
    this.endlessWave = 0;
    this.endlessWaveTimer = 0;
    this.endlessRefillTimer = 0;
    this.aim = {
      active: false,
      locked: false,
      angle: -0.6,
      power: 0.8,
      startWorld: null,
      currentWorld: null,
      dragLen: 0,
    };
    this.enemyAim = null;
    this.aiMove = null;
    this.resolveT = null;
    this.shake = 0;
    this.time = 0;
    this.lastTs = 0;
    this.cheatGod = false;
    this.cheatInfiniteAmmo = false;
    this.cheatOpen = false;
    this.bg = null;
    this.terrainDirty = false;
    this.terrainDrawnFor = null;
    this.result = null;
    this.touch = { left: false, right: false };
    this.keys = {};
    this.hintTimer = null;
    this.bannerTimer = null;
    this.lastEnemyTarget = null;
    this._bindUI();
    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());
    this._hudIcons();
    requestAnimationFrame((ts) => this._loop(ts));
    this._boot();
  }

  // ------------------------------------------------------------ 启动
  async _boot() {
    document.getElementById("levelScreen").classList.add("show");
    this._renderLevelGrid();
    await this.store.init();
    this.soundOn = this.store.state.sound !== false;
    this.sfx.enabled = this.soundOn;
    this._updateSoundButtons();
    this._refreshLevelSummary();
    this.store.onChange(() => this._refreshLevelSummary());
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客模式 */ }
    if (!this.store.state.tutorialSeen) {
      this._showTutorial(true);
    }
  }

  _hudIcons() {
    document.getElementById("hudHome").innerHTML = icon("home");
    document.getElementById("hudPause").innerHTML = icon("pause");
    this._updateSoundButtons();
  }

  _updateSoundButtons() {
    const on = this.soundOn !== false;
    const soundBtn = document.getElementById("hudSound");
    if (soundBtn) soundBtn.innerHTML = icon(on ? "sound" : "mute");
    const pauseBtn = document.getElementById("pauseSoundBtn");
    if (pauseBtn) pauseBtn.textContent = on ? "关闭音效" : "开启音效";
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("hudHome").addEventListener("click", () => { this.sfx.click(); this._openLevelScreen(); });
    $("hudPause").addEventListener("click", () => { this.sfx.click(); this._openPause(); });
    $("hudSound").addEventListener("click", () => this._toggleSound());
    $("hudCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });
    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") this._closeCheat();
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());
    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("tutorialBtn").addEventListener("click", () => this._showTutorial(false));
    $("tutorialStart").addEventListener("click", () => this._startFromTutorial());
    $("tutorialScreen").addEventListener("click", (e) => {
      if (e.target.id === "tutorialScreen") this._startFromTutorial();
    });
    $("continueBtn").addEventListener("click", () => {
      const id = clamp(Number(this.store.state.unlocked) || 1, 1, 14);
      this.startLevel(id);
    });
    $("levelGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-level]");
      if (card && !card.classList.contains("locked")) this.startLevel(Number(card.dataset.level));
    });
    $("nextBtn").addEventListener("click", () => {
      if (!this.level || this.level.endless) return;
      const next = this.level.id + 1;
      if (next <= LEVELS.length) this.startLevel(next);
      else this.startLevel(0);
    });
    $("retryBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("rotateTip").addEventListener("click", () => document.getElementById("rotateTip").classList.add("hide"));
    $("fireBtn").addEventListener("click", () => { this.sfx.ensure(); this._fireFromButton(); });
    $("cancelAimBtn").addEventListener("click", () => { this.sfx.ensure(); this._cancelAim(); });
    $("switchUnit").addEventListener("click", () => { this.sfx.ensure(); this._cyclePlayer(); });

    // 武器栏
    $("weaponBar").addEventListener("click", (e) => {
      const card = e.target.closest("[data-weapon]");
      if (!card) return;
      if (this.phase !== "aim" || this.paused) return;
      const id = card.dataset.weapon;
      if ((this.ammo[id] || 0) <= 0) {
        toast("该武器弹药已耗尽");
        return;
      }
      this.selectedWeapon = id;
      this.sfx.ensure();
      this.sfx.click();
      this._refreshWeaponBar();
      this._refreshFireButton();
      this._updateHUD();
    });

    // 画布瞄准
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointercancel", () => {
      this.aim.active = false;
      this.aim.startWorld = null;
      this.aim.currentWorld = null;
      this.aim.dragLen = 0;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // 移动按钮（支持按住）
    document.querySelectorAll("[data-move]").forEach((btn) => {
      const dir = btn.dataset.move;
      const set = (on) => {
        this.touch[dir] = on;
        btn.classList.toggle("held", on);
        if (on) this.sfx.ensure();
      };
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
      btn.addEventListener("pointerup", () => set(false));
      btn.addEventListener("pointerleave", () => set(false));
      btn.addEventListener("pointercancel", () => set(false));
    });
    document.querySelector("[data-jump]").addEventListener("click", () => {
      if (this.phase !== "aim" || this.paused) return;
      const u = this._activePlayer();
      if (u) u.jump();
    });

    // 键盘
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (this.aim.active || this.aim.locked) {
          e.preventDefault();
          this._cancelAim();
        } else if (this.phase === "aim") {
          this._openPause();
        }
        return;
      }
      if (k === "enter" || k === "f") {
        if (this.phase === "aim" && !this.paused) {
          e.preventDefault();
          this._fireFromButton();
        }
        return;
      }
      if (this.paused || this.phase !== "aim") return;
      if (["a", "arrowleft", "d", "arrowright", "w", "arrowup", " "].includes(k)) {
        e.preventDefault();
        this.keys[k] = true;
        if ((k === "w" || k === "arrowup" || k === " ") && !e.repeat) {
          const u = this._activePlayer();
          if (u) u.jump();
        }
      }
      if (/^[1-7]$/.test(k)) {
        const id = WEAPON_ORDER[Number(k) - 1];
        if (id && (this.ammo[id] || 0) > 0) {
          this.selectedWeapon = id;
          this._refreshWeaponBar();
          this.sfx.ensure();
          this.sfx.click();
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !this.paused && this.level && this.phase !== "over") this._openPause();
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this._resizeCanvas(), 220);
    });
  }

  // ------------------------------------------------------------ 关卡选择
  _renderLevelGrid() {
    const stars = this.store.state.stars || {};
    const unlocked = clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    const endlessBest = Number(this.store.state.endlessBest) || 0;
    const grid = document.getElementById("levelGrid");
    const cards = LEVELS.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const themeClass = "theme-" + (lv.theme || "dawn");
      const current = !locked && lv.id === unlocked && !this.store.state.cleared[lv.id];
      return `<button class="level-card ${themeClass} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? "aria-disabled=\"true\"" : ""}>
        <div class="lv-top"><span class="lv-num">${String(lv.id).padStart(2, "0")}<small>关</small></span>${locked ? icon("lock") : ""}</div>
        <div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</div>
        </div>
        ${locked ? '<span class="lv-lock">' + icon("lock") + "</span>" : ""}
      </button>`;
    });
    cards.push(`<button class="level-card endless-card" data-level="0">
      <div class="lv-top"><span class="lv-num">∞<small>无限</small></span></div>
      <div>
        <div class="lv-name">无限模式</div>
        <div class="lv-stars">${endlessBest > 0 ? `最高 ${endlessBest} 波` : "越战越强"}</div>
      </div>
    </button>`);
    grid.innerHTML = cards.join("");
  }

  _refreshLevelSummary() {
    const state = this.store.state;
    const stars = state.stars || {};
    const total = Object.values(stars).reduce((a, b) => a + (Number(b) || 0), 0);
    const unlocked = clamp(Number(state.unlocked) || 1, 1, LEVELS.length);
    const cleared = Object.keys(state.cleared || {}).length;
    document.getElementById("totalStars").textContent = String(total);
    document.getElementById("overallBar").style.width = Math.round((cleared / LEVELS.length) * 100) + "%";
    document.getElementById("progressText").textContent =
      `已解锁 ${unlocked} / ${LEVELS.length} 关 · 已获得 ${total} / ${LEVELS.length * 3} 星`;
    const btn = document.getElementById("continueBtn");
    if (total === 0 && cleared === 0) btn.textContent = "开始第 1 关";
    else if (cleared >= LEVELS.length) btn.textContent = "再战第 14 关";
    else btn.textContent = `继续第 ${unlocked} 关`;
    this._renderLevelGrid();
  }

  _showTutorial(firstTime) {
    this.firstTutorial = firstTime;
    const start = document.getElementById("tutorialStart");
    const id = clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    start.textContent = firstTime ? "开始第 1 关" : `开始第 ${id} 关`;
    document.getElementById("tutorialScreen").classList.add("show");
  }

  _startFromTutorial() {
    document.getElementById("tutorialScreen").classList.remove("show");
    if (!this.store.state.tutorialSeen) {
      this.store.update((p) => { p.tutorialSeen = true; });
    }
    const id = this.firstTutorial ? 1 : clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    this.startLevel(id);
  }

  _openLevelScreen() {
    this.paused = true;
    this.phase = "menu";
    this._hideScreens();
    document.getElementById("levelScreen").classList.add("show");
    this._refreshLevelSummary();
    this._clearTimers();
  }

  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  // ------------------------------------------------------------ 开局
  startLevel(id) {
    this._hideScreens();
    this.level = id === 0 ? getEndlessLevel() : getLevel(id);
    this.theme = THEMES[this.level.theme] || THEMES.dawn;
    this.terrain = new Terrain(this.level);
    this.terrainDirty = false;
    this.projectiles = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.timers = [];
    this.units = [];
    this.players = [];
    this.enemies = [];
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.angle = -0.6;
    this.aim.power = 0.8;
    this.enemyAim = null;
    this.aiMove = null;
    this.resolveT = null;
    this.shake = 0;
    this.time = 0;
    this.battleTime = 0;
    this.result = null;
    this.turnNo = 1;
    this.turnTeam = 0;
    this.moveBudget = this.maxMove;
    this.activePlayerIndex = 0;
    this.activeEnemyIndex = 0;
    this.lastEnemyTarget = null;
    this.weaponReadyAt = {};
    this.windTimer = rand(6, 9);
    this.endlessWave = 0;
    this.endlessWaveTimer = this.level.endless ? 3 : 0;
    this.endlessCleared = false;
    this.endlessBest = Number(this.store.state.endlessBest) || 0;
    this.cheatOpen = false;
    document.getElementById("cheatScreen").classList.remove("show");

    const ammo = {
      spear: Infinity, boulder: 0, grenade: 0, banana: 0, spike: 0,
      boomerang: 0, meteor: 0,
    };
    Object.keys(this.level.ammo || {}).forEach((k) => { ammo[k] = this.level.ammo[k]; });
    // 新武器从第一关就提供少量弹药，让玩家能直接体验
    if (!this.level.endless) {
      ammo.boomerang = Math.max(Number(ammo.boomerang) || 0, 3);
      ammo.meteor = Math.max(Number(ammo.meteor) || 0, 1);
    }
    // 中后期逐步增加新武器弹药
    if (this.level.id >= 4) ammo.boomerang = Math.max(Number(ammo.boomerang) || 0, 4);
    if (this.level.id >= 8) ammo.meteor = Math.max(Number(ammo.meteor) || 0, 2);
    this.ammo = ammo;
    this.selectedWeapon = WEAPON_ORDER.find((k) => (ammo[k] || 0) > 0) || "spear";

    const names = ["阿石", "阿木", "阿火"];
    (this.level.player || []).forEach((p, i) => {
      const x = clamp(p.x, 20, W - 20);
      const y = this._spawnY(x);
      const u = new Unit(this, 0, x, y, "player", p.hp || 100, i, names[i] || "族人" + (i + 1));
      this.players.push(u);
      this.units.push(u);
    });
    const hpMul = this.level.endless ? 1 : 1.25;
    (this.level.enemies || []).forEach((e, i) => {
      const cfg = ENEMY_TYPES[e.type] || ENEMY_TYPES.grunt;
      const x = clamp(e.x, 20, W - 20);
      const y = this._spawnY(x);
      const hp = Math.round((e.hp || cfg.hp) * hpMul);
      const u = new Unit(this, 1, x, y, e.type || "grunt", hp, i, cfg.name + " " + (i + 1));
      u.aiTimer = rand(0.9, 2.2) + i * 0.18;
      u.aiMoveTimer = rand(0.8, 2.0);
      this.enemies.push(u);
      this.units.push(u);
    });

    this.wind = this._rollWind();
    this.phase = "aim";
    this.paused = false;
    this._buildBackground();
    this._makeAmbient();
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
    this._showBanner(
      this.level.endless ? "无限模式" : "战斗开始",
      this.level.endless ? "消灭不断来袭的敌人，看看能撑到第几波" : "消灭所有敌人，对面全灭即胜利"
    );
    this._showAimHint();
    this._clearTimers();
    this.sfx.ensure();
    this.sfx.turn();
  }

  _spawnY(x) {
    // 从战场中段向下扫描：避开洞顶石笋与高空浮台，让单位落在可行走的地面上
    let y = this.terrain.surfaceBelow(x, 300);
    if (y === null) y = this.terrain.surfaceTop(x);
    if (y === null) y = H - 60;
    return y;
  }

  _rollWind() {
    const max = Number(this.level.windMax) || 2;
    return Math.round(rand(-max, max) * 10) / 10;
  }

  _activePlayer() {
    for (let i = 0; i < this.players.length; i++) {
      const idx = (this.activePlayerIndex + i) % this.players.length;
      if (this.players[idx].alive) {
        this.activePlayerIndex = idx;
        return this.players[idx];
      }
    }
    return null;
  }

  _activeEnemy() {
    for (let i = 0; i < this.enemies.length; i++) {
      const idx = (this.activeEnemyIndex + i) % this.enemies.length;
      if (this.enemies[idx].alive) {
        this.activeEnemyIndex = idx;
        return this.enemies[idx];
      }
    }
    return null;
  }

  // ------------------------------------------------------------ 输入
  _onPointerDown(e) {
    if (this.paused || this.phase !== "aim") return;
    const u = this._activePlayer();
    if (!u || !u.alive) return;
    e.preventDefault();
    this.sfx.ensure();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._canvasPoint(e);
    // 以按下点作为虚拟摇杆原点，拖动方向即射击方向，手指不必伸到敌人身上
    this.aim.active = true;
    this.aim.startWorld = { x: p.x, y: p.y };
    this.aim.currentWorld = { x: p.x, y: p.y };
    this.aim.dragLen = 0;
    this.aim.power = 0.12;
    this._refreshFireButton();
  }

  _onPointerMove(e) {
    if (!this.aim.active || this.paused) return;
    e.preventDefault();
    this._updateAimFromEvent(e);
  }

  _onPointerUp(e) {
    if (!this.aim.active) return;
    e.preventDefault();
    this._updateAimFromEvent(e);
    const dragLen = this.aim.dragLen;
    const tap = this.aim.startWorld ? { ...this.aim.startWorld } : null;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    if (dragLen < 40) {
      // 轻点队友可以切换操控单位
      if (tap) {
        const other = this.players.find((p) => p.alive && p !== this._activePlayer()
          && Math.hypot(p.x - tap.x, p.y - 30 - tap.y) < 55);
        if (other) {
          this._setActivePlayer(other.index);
          return;
        }
      }
      toast("按住后朝射击方向拖远一点，松手锁定弹道");
      this._refreshFireButton();
      return;
    }
    // 松手只锁定弹道，不会发射；点右下角“发射”才开火
    this.aim.locked = true;
    this._refreshFireButton();
    this._updateHUD();
  }

  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  _updateAimFromEvent(e) {
    const u = this._activePlayer();
    if (!u) return;
    if (!this.aim.startWorld) return;
    const p = this._canvasPoint(e);
    this.aim.currentWorld = p;
    const dx = p.x - this.aim.startWorld.x;
    const dy = p.y - this.aim.startWorld.y;
    const len = Math.hypot(dx, dy);
    this.aim.dragLen = len;
    if (len >= 5) this.aim.angle = Math.atan2(dy, dx);
    // 世界坐标下拖动 18~300px 映射为 12%~100% 力度，拖得更长便于精细控制
    this.aim.power = clamp((len - 18) / 282, 0.12, 1);
    u.facing = Math.cos(this.aim.angle) >= 0 ? 1 : -1;
  }

  /** 根据锁定状态、冷却、弹药刷新发射/取消按钮 */
  _refreshFireButton() {
    const btn = document.getElementById("fireBtn");
    if (!btn) return;
    const u = this._activePlayer();
    const id = this.selectedWeapon;
    const ready = this.time >= (this.weaponReadyAt[id] || 0);
    const hasAmmo = (this.ammo[id] || 0) > 0;
    const enabled = Boolean(this.level && this.phase === "aim" && !this.paused
      && u && u.alive && this.aim.locked && ready && hasAmmo);
    btn.classList.toggle("disabled", !enabled);
    btn.title = !this.aim.locked ? "先拖动瞄准" : !ready ? "武器冷却中" : !hasAmmo ? "弹药耗尽" : "发射";
    const cancel = document.getElementById("cancelAimBtn");
    if (cancel) cancel.classList.toggle("show", this.aim.active || this.aim.locked);
    const sw = document.getElementById("switchUnit");
    if (sw) sw.style.display = this.players.filter((p) => p.alive).length > 1 ? "" : "none";
  }

  _fireFromButton() {
    if (this.phase !== "aim" || this.paused) return;
    if (!this.aim.locked) {
      toast("先拖动瞄准，再点发射");
      return;
    }
    this.firePlayer(this.aim.angle, this.aim.power);
  }

  _cancelAim() {
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this._refreshFireButton();
    this._updateHUD();
  }

  _setActivePlayer(index) {
    const u = this.players[index];
    if (!u || !u.alive || index === this.activePlayerIndex) return;
    this.activePlayerIndex = index;
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.addText(u.x, u.y - 92, u.name, "#ffd27c");
    this._refreshFireButton();
    this._updateHUD();
  }

  _cyclePlayer() {
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) return;
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (this.activePlayerIndex + i) % this.players.length;
      if (this.players[idx].alive) {
        this._setActivePlayer(idx);
        return;
      }
    }
  }

  // ------------------------------------------------------------ 玩家行动
  firePlayer(angle = this.aim.angle, power = this.aim.power) {
    if (this.phase !== "aim" || this.paused) return false;
    const u = this._activePlayer();
    if (!u || !u.alive) return false;
    let id = this.selectedWeapon;
    if ((this.ammo[id] || 0) <= 0) {
      id = "spear";
      this.selectedWeapon = id;
    }
    const w = WEAPONS[id];
    const readyAt = this.weaponReadyAt[id] || 0;
    if (this.time < readyAt) {
      toast(`${w.name}冷却中`);
      return false;
    }
    if (this.ammo[id] !== Infinity && !this.cheatInfiniteAmmo) {
      this.ammo[id] = Math.max(0, this.ammo[id] - 1);
    }
    this.weaponReadyAt[id] = this.time + (w.cooldown || 1);
    const speed = w.speed * (0.5 + 0.5 * power);
    const ox = u.x;
    const oy = u.y - 44;
    this.projectiles.push(new Projectile(
      this, id, ox + Math.cos(angle) * 26, oy + Math.sin(angle) * 26,
      Math.cos(angle) * speed, Math.sin(angle) * speed, 0
    ));
    u.facing = Math.cos(angle) >= 0 ? 1 : -1;
    // 实时模式：不切换回合，也不进入飞行等待；冷却结束后可继续射击
    this.aim.angle = angle;
    this.aim.power = power;
    this.aim.locked = true;
    this.sfx.shoot(id);
    this.spawnParticles(ox + Math.cos(angle) * 30, oy + Math.sin(angle) * 30, 6, w.color, "spark");
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
    this._hideAimHint();
    return true;
  }

  // ------------------------------------------------------------ 回合推进
  _beginPlayerTurn() {
    if (this.phase === "over") return;
    if (this.turnNo > this.level.turnLimit) {
      this.finish(false, "回合耗尽");
      return;
    }
    if (!this.enemies.some((u) => u.alive)) { this.finish(true); return; }
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    this.turnTeam = 0;
    this.phase = "aim";
    this.wind = this._rollWind();
    this.moveBudget = this.maxMove;
    this.resolveT = null;
    this.enemyAim = null;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this._activePlayer();
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) this.selectedWeapon = "spear";
    this._updateHUD();
    this._refreshWeaponBar();
    this._showBanner("你的回合", `第 ${this.turnNo} 回合 · 注意风向`);
    this._updateHUD();
    this.sfx.turn();
  }

  _beginEnemyTurn() {
    if (this.phase === "over") return;
    if (!this.enemies.some((u) => u.alive)) { this.finish(true); return; }
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    this.turnTeam = 1;
    this.phase = "enemyWait";
    this.wind = this._rollWind();
    this.moveBudget = 0;
    this.enemyAim = null;
    this.aiMove = null;
    this._activeEnemy();
    this._updateHUD();
    this._showBanner("敌方回合", "对方正在计算落点", true);
    this._hideAimHint();
    this._addTimer(0.65, () => this._enemyDecide());
  }

  _enemyDecide() {
    if (this.phase !== "enemyWait") return;
    const u = this._activeEnemy();
    if (!u) { this.finish(true); return; }
    const targets = this.players.filter((p) => p.alive);
    if (!targets.length) { this.finish(false, "族人全部倒下"); return; }
    targets.sort((a, b) => a.hp - b.hp || Math.abs(a.x - u.x) - Math.abs(b.x - u.x));
    const target = Math.random() < 0.25 ? targets[Math.floor(Math.random() * targets.length)] : targets[0];
    this.lastEnemyTarget = target;
    const dist = Math.abs(target.x - u.x);
    // 偶尔挪动位置，避免站桩对轰
    if (dist > 340 && Math.random() < 0.55) {
      const dir = Math.sign(target.x - u.x) * (Math.random() < 0.5 ? 1 : -1);
      this.aiMove = { dir, time: 0.62 };
      this.phase = "enemyMove";
      this._addTimer(0.66, () => this._enemyAim(target));
      return;
    }
    this._enemyAim(target);
  }

  _enemyAim(target) {
    if (this.phase !== "enemyMove" && this.phase !== "enemyWait") return;
    const u = this._activeEnemy();
    if (!u) return;
    this.aiMove = null;
    const weapon = this._chooseEnemyWeapon(u, target);
    const sx = u.x;
    const sy = u.y - 44;
    const best = this._findBestShot(sx, sy, target, weapon);
    const err = (1 - (Number(this.level.ai) || 0.4)) * 0.16;
    const angle = best.angle + rand(-err, err);
    const power = clamp(best.power + rand(-err * 0.6, err * 0.6), 0.2, 1);
    this.enemyAim = { angle, power, weapon };
    u.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.phase = "enemyAim";
    this._updateHUD();
    this._addTimer(0.85, () => this._enemyFire());
  }

  _enemyFire() {
    if (this.phase !== "enemyAim" || !this.enemyAim) return;
    const u = this._activeEnemy();
    if (!u) return;
    const { angle, power, weapon } = this.enemyAim;
    const speed = weapon.speed * (0.5 + 0.5 * power);
    const ox = u.x + Math.cos(angle) * 26;
    const oy = u.y - 44 + Math.sin(angle) * 26;
    this.projectiles.push(new Projectile(this, weapon.id, ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed, 1));
    this.phase = "flying";
    this.turnTeam = 1;
    this.enemyAim = null;
    this.resolveT = null;
    this.sfx.shoot(weapon.id);
    this._updateHUD();
  }

  _chooseEnemyWeapon(u, target) {
    const dist = Math.abs(target.x - u.x);
    const lv = this.level.endless ? 14 : this.level.id;
    if (lv <= 1) return Math.random() < 0.4 ? WEAPONS.boulder : WEAPONS.spear;
    if (lv >= 11 && Math.random() < 0.09) return WEAPONS.meteor;
    if (lv >= 5 && Math.random() < 0.16) return WEAPONS.boomerang;
    if (dist > 500) return Math.random() < 0.75 ? WEAPONS.boulder : WEAPONS.spear;
    if (dist < 260) return Math.random() < 0.45 ? WEAPONS.grenade : WEAPONS.spear;
    if (lv >= 7 && Math.random() < 0.16) return WEAPONS.banana;
    if (lv >= 9 && Math.random() < 0.14) return WEAPONS.spike;
    return Math.random() < 0.35 ? WEAPONS.grenade : WEAPONS.spear;
  }

  /** 用与真实弹道一致的模拟，暴力搜索最佳角度/力度 */
  _findBestShot(sx, sy, target, weapon) {
    let best = { angle: target.x >= sx ? -0.7 : Math.PI + 0.7, power: 0.85, score: Infinity };
    const dir = target.x >= sx ? 1 : -1;
    for (let deg = 12; deg <= 82; deg += 7) {
      const angle = dir === 1 ? (-deg * Math.PI) / 180 : Math.PI + (deg * Math.PI) / 180;
      for (let power = 0.45; power <= 1.001; power += 0.085) {
        const end = this._simulateShot(sx, sy, angle, power, weapon);
        const dx = end.x - target.x;
        const dy = end.y - (target.y - 26);
        let score = Math.hypot(dx, dy);
        if (end.y > H - 2) score += 80; // 掉出地图的落点降权
        if (score < best.score) best = { angle, power, score };
      }
    }
    return best;
  }

  _simulateShot(sx, sy, angle, power, weapon) {
    const speed = weapon.speed * (0.5 + 0.5 * power);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let x = sx;
    let y = sy;
    const dt = 1 / 32;
    for (let t = 0; t < 4; t += dt) {
      vx += this.wind * 27 * dt;
      vy += weapon.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < -60 || x > W + 60 || y > H + 40) break;
      if (this.terrain.circleHit(x, y, 3)) break;
    }
    return { x, y };
  }

  /** 实时模式下每个敌人独立运行：移动、瞄准、开火 */
  _updateEnemyAI(u, dt) {
    if (!u.alive) return;
    const targets = this.players.filter((p) => p.alive);
    if (!targets.length) return;

    if (u.aiAim) {
      u.aiAim.hold -= dt;
      if (u.aiAim.hold <= 0) this._enemyFireNow(u);
      return;
    }

    // 走位：远则靠近，太近则后退，中间距离左右游走
    u.aiMoveTimer -= dt;
    if (u.aiMoveTimer <= 0) {
      const nearest = targets.reduce((a, b) => (Math.abs(a.x - u.x) < Math.abs(b.x - u.x) ? a : b), targets[0]);
      const dist = Math.abs(nearest.x - u.x);
      if (dist > 440) u.aiMoveDir = Math.sign(nearest.x - u.x);
      else if (dist < 210) u.aiMoveDir = -Math.sign(nearest.x - u.x);
      else u.aiMoveDir = Math.random() < 0.5 ? -1 : 1;
      u.aiMoveTimer = rand(1.0, 2.2);
    }
    if (u.aiMoveDir) {
      const before = u.x;
      if (u.tryMove(u.aiMoveDir * 78 * dt)) {
        u.moveSpeed = u.aiMoveDir * 78;
        u.facing = u.aiMoveDir;
      }
      if (Math.abs(u.x - before) < 0.05) {
        // 被地形挡住时尝试跳过去，而不是原地罚站
        if (u.onGround) u.jump();
        u.aiMoveDir *= -1;
        u.aiMoveTimer = rand(0.8, 1.5);
      }
    }

    u.aiTimer -= dt;
    if (u.aiTimer > 0) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    let weapon = this._chooseEnemyWeapon(u, target);
    let best = this._findBestShot(u.x, u.y - 44, target, weapon);
    // 直线武器被地形挡住时，改换抛物线武器翻过去
    if (weapon.id === "spear") {
      const arc = this._findBestShot(u.x, u.y - 44, target, WEAPONS.boulder);
      if (arc.score + 35 < best.score) {
        weapon = WEAPONS.boulder;
        best = arc;
      }
    }
    const baseAccuracy = clamp(
      (Number(this.level.ai) || 0.4) + (this.level.endless ? Math.min(0.3, this.endlessWave * 0.02) : 0.08),
      0,
      0.94
    );
    const err = (1 - baseAccuracy) * 0.16;
    u.aiAim = {
      angle: best.angle + rand(-err, err),
      power: clamp(best.power + rand(-err * 0.5, err * 0.5), 0.2, 1),
      weapon,
      hold: 0.55,
    };
    u.facing = Math.cos(u.aiAim.angle) >= 0 ? 1 : -1;
    u.aiTimer = rand(2.0, 3.4);
  }

  _enemyFireNow(u) {
    if (!u.alive || !u.aiAim) return;
    const { angle, power, weapon } = u.aiAim;
    u.aiAim = null;
    const speed = weapon.speed * (0.5 + 0.5 * power);
    const ox = u.x + Math.cos(angle) * 26;
    const oy = u.y - 44 + Math.sin(angle) * 26;
    this.projectiles.push(new Projectile(this, weapon.id, ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed, 1));
    this.sfx.shoot(weapon.id);
    u.aiTimer = rand(2.0, 3.4) * (this.level.endless ? Math.max(0.65, 1 - this.endlessWave * 0.015) : 1);
  }

  // ------------------------------------------------------------ 弹道结算
  _finishShot() {
    if (this.phase !== "flying") return;
    if (!this.enemies.some((u) => u.alive)) { this.finish(true); return; }
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    if (this.turnTeam === 0) {
      this._beginEnemyTurn();
    } else {
      this.turnNo += 1;
      this._beginPlayerTurn();
    }
  }

  _addTimer(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }

  _clearTimers() {
    this.timers = [];
  }

  _updateTimers(dt) {
    const due = [];
    this.timers = this.timers.filter((timer) => {
      timer.t -= dt;
      if (timer.t <= 0) {
        due.push(timer.fn);
        return false;
      }
      return true;
    });
    due.forEach((fn) => fn());
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
    this._updateTimers(dt);
    if (this.phase === "over" || this.phase === "menu") {
      this._updateEffects(dt);
      return;
    }
    if (this.phase === "aim") {
      this.battleTime += dt;
      this.windTimer -= dt;
      if (this.windTimer <= 0) {
        this.wind = this._rollWind();
        this.windTimer = rand(6, 9);
      }
      const u = this._activePlayer();
      if (u) this._updatePlayingMovement(u, dt);
      for (const e of this.enemies) {
        if (e.alive) this._updateEnemyAI(e, dt);
      }
    }
    for (const u of this.units) u.update(dt);
    this.units = this.units.filter((u) => u.alive || u.team === 0 || u.deathT < 1.6);
    this.enemies = this.enemies.filter((u) => u.alive || u.deathT < 1.6);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }
    this._updateEffects(dt);
    this._updateEndless(dt);
    if (!this.players.some((p) => p.alive)) {
      this.finish(false, "族人全部倒下");
      return;
    }
    if (!this.level.endless && !this.enemies.some((e) => e.alive)) {
      this.finish(true);
      return;
    }
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) this.selectedWeapon = "spear";
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
  }

  _updatePlayingMovement(u, dt) {
    const left = this.keys["a"] || this.keys["arrowleft"] || this.touch.left;
    const right = this.keys["d"] || this.keys["arrowright"] || this.touch.right;
    if (left === right) {
      u.moveSpeed *= 0.8;
      return;
    }
    const dir = left ? -1 : 1;
    if (u.onGround) {
      if (u.tryMove(dir * 112 * dt)) {
        u.moveSpeed = dir * 112;
        if (!this.aim.active && !this.aim.locked) u.facing = dir;
      }
    } else {
      u.tryMove(dir * 70 * dt);
    }
  }

  _updateEndless(dt) {
    if (!this.level.endless || this.phase !== "aim") return;
    if (this.enemies.some((e) => e.alive)) return;
    if (this.endlessWave > 0 && !this.endlessCleared) {
      this.endlessCleared = true;
      this._onEndlessWaveClear();
    }
    this.endlessWaveTimer -= dt;
    if (this.endlessWaveTimer <= 0) {
      this._spawnEndlessWave();
      this.endlessWaveTimer = 3.0;
      this.endlessCleared = false;
    }
  }

  _spawnEndlessWave() {
    this.endlessWave += 1;
    const wave = this.endlessWave;
    const count = Math.min(6, 1 + Math.floor(wave * 0.6));
    const types = ["grunt", "grunt", "thrower", "brute", "chief"];
    for (let i = 0; i < count; i++) {
      const type = types[Math.min(types.length - 1, Math.floor((wave + i) / 3))];
      const cfg = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
      const x = clamp(880 + (i % 4) * 78 + rand(-20, 20), 840, W - 40);
      const y = this._spawnY(x);
      const hp = Math.round(cfg.hp * (1 + wave * 0.18));
      const index = this.enemies.length;
      const u = new Unit(this, 1, x, y, type, hp, index, `${cfg.name} ${wave}-${i + 1}`);
      u.aiTimer = rand(1.0, 2.4) + i * 0.2;
      u.aiMoveTimer = rand(0.8, 2.0);
      this.enemies.push(u);
      this.units.push(u);
    }
    this._showBanner(`第 ${wave} 波`, "敌人从右侧来袭", 1.8);
    this.sfx.wave ? this.sfx.wave() : this.sfx.turn();
  }

  _onEndlessWaveClear() {
    for (const p of this.players) {
      if (p.alive) p.hp = Math.min(p.maxHp, p.hp + 12);
    }
    for (const id of Object.keys(this.ammo)) {
      if (this.ammo[id] === Infinity) continue;
      if (id === "meteor" && this.endlessWave % 2 !== 0) continue;
      this.ammo[id] = Math.min(9, (Number(this.ammo[id]) || 0) + 1);
    }
    this.endlessBest = Math.max(this.endlessBest, this.endlessWave);
    this.store.update((p) => {
      p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessWave);
    });
    this._showBanner(`第 ${this.endlessWave} 波清除`, "全员恢复 12 点生命 · 补充弹药", 2.0);
    this.spawnParticles(640, 300, 30, "#ffe08a", "spark");
  }

  _updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "dirt" && p.gravity > 0) {
        const gy = this.terrain ? this.terrain.surfaceBelow(p.x, p.y - 4) : null;
        if (gy !== null && p.y > gy) {
          p.y = gy;
          p.vy *= -0.25;
          p.vx *= 0.6;
          if (Math.abs(p.vy) < 10) p.vy = 0;
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - 58 * dt);
    if (this.ambient.length) {
      const isFire = this.theme.id === "volcano";
      for (const p of this.ambient) {
        p.x += (p.vx + (isFire ? 0 : this.wind * 5)) * dt;
        p.y += p.vy * dt;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) {
          p.y = H + 10;
          p.x = rand(0, W);
        }
        if (p.y > H + 20) {
          p.y = -10;
          p.x = rand(0, W);
        }
      }
    }
  }

  // ------------------------------------------------------------ 爆炸 / 伤害
  explode(x, y, radius, damage, team, kind = "blast") {
    if (!this.terrain) return;
    this.terrain.carve(x, y, radius * 0.8);
    this.terrainDirty = true;
    this.shake = Math.max(this.shake, Math.min(20, radius * 0.16));
    this.rings.push({ x, y, r: radius * 0.3, max: radius * 1.8, t: 0, life: 0.48 });
    const dirtCount = kind === "spear" ? 8 : Math.min(30, 10 + Math.floor(radius * 0.22));
    for (let i = 0; i < dirtCount; i++) {
      this.particles.push({
        x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: rand(-220, 220), vy: rand(-300, -40),
        life: rand(0.5, 1.2), maxLife: 1.2, size: rand(2, 6),
        color: this.theme.dirt[1], kind: "dirt", gravity: 900,
      });
    }
    const fireCount = kind === "spear" ? 4 : Math.min(24, 8 + Math.floor(radius * 0.18));
    for (let i = 0; i < fireCount; i++) {
      this.particles.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-170, 170), vy: rand(-240, 20),
        life: rand(0.2, 0.55), maxLife: 0.55, size: rand(3, 9),
        color: Math.random() < 0.5 ? "#ffb14a" : "#ff6a2a", kind: "fire", gravity: -60,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x + rand(-14, 14), y: y + rand(-14, 14),
        vx: rand(-60, 60), vy: rand(-90, -10),
        life: rand(0.5, 1), maxLife: 1, size: rand(8, 18),
        color: "rgba(60,55,50,.5)", kind: "smoke", gravity: -30,
      });
    }
    // 伤害与击退（含友军误伤）
    for (const u of this.units) {
      if (!u.alive) continue;
      const dx = u.x - x;
      const dy = u.y - 26 - y;
      const d = Math.hypot(dx, dy);
      const reach = radius + 16;
      if (d < reach) {
        const f = 1 - d / reach;
        const dmg = Math.max(4, Math.round(damage * (0.35 + 0.65 * f)));
        u.takeDamage(dmg, team);
        if (u.alive) {
          u.vy = -Math.min(330, 70 + f * damage * 2.2);
          u.onGround = false;
        }
      }
    }
    this.sfx.explode(radius);
    // 爆炸把附近单位推下平台后，检查是否还有活人
    this._addTimer(0.9, () => this._checkEndState());
  }

  onUnitDeath(unit) {
    if (unit.team === 0 && this.players[this.activePlayerIndex] === unit) {
      this.aim.locked = false;
      this.aim.active = false;
      this.aim.startWorld = null;
      this.aim.currentWorld = null;
      this.aim.dragLen = 0;
      this._activePlayer();
    }
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: unit.x + rand(-10, 10), y: unit.y - 30 + rand(-14, 14),
        vx: rand(-120, 120), vy: rand(-200, -30),
        life: rand(0.4, 0.9), maxLife: 0.9, size: rand(2, 5),
        color: unit.team === 0 ? "#f0a35e" : "#c06a5e", kind: "dirt", gravity: 700,
      });
    }
    this.addText(unit.x, unit.y - 80, "倒下", unit.team === 0 ? "#ff9f93" : "#ffd27c");
    this._addTimer(0.8, () => this._checkEndState());
  }

  _checkEndState() {
    if (this.phase === "over" || this.phase === "menu") return;
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    if (!this.level.endless && !this.enemies.some((u) => u.alive)) { this.finish(true); return; }
    this._refreshFireButton();
    this._updateHUD();
  }

  finish(win, reason = "") {
    if (this.phase === "over") return;
    this.phase = "over";
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.enemyAim = null;
    this.aiMove = null;
    this._clearTimers();
    const isEndless = Boolean(this.level.endless);
    const totalPlayers = this.players.length;
    const alive = this.players.filter((u) => u.alive).length;
    const parTime = this.level.parTime || (this.level.par || 4) * 12;
    let stars = 0;
    let newRecord = false;
    if (!isEndless && win) {
      if (alive === totalPlayers && this.battleTime <= parTime) stars = 3;
      else if (alive === totalPlayers || this.battleTime <= parTime) stars = 2;
      else stars = 1;
      const prevStars = Number(this.store.state.stars[this.level.id]) || 0;
      const prevBest = Number(this.store.state.bestTurns[this.level.id]) || 9999;
      newRecord = stars > prevStars || this.battleTime < prevBest;
      this.store.update((p) => {
        const next = Math.min(LEVELS.length, this.level.id + 1);
        p.unlocked = Math.max(Number(p.unlocked) || 1, next);
        p.stars[this.level.id] = Math.max(Number(p.stars[this.level.id]) || 0, stars);
        p.cleared[this.level.id] = true;
        const best = Number(p.bestTurns[this.level.id]) || 9999;
        p.bestTurns[this.level.id] = Math.min(best, Number(this.battleTime.toFixed(1)));
      });
      this.sfx.win();
      this._spawnConfetti();
    } else if (isEndless) {
      const prevBest = this.endlessBest;
      this.endlessBest = Math.max(this.endlessBest, this.endlessWave);
      this.store.update((p) => {
        p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessWave);
      });
      newRecord = this.endlessWave > prevBest;
      this.sfx.lose();
    } else {
      this.sfx.lose();
    }
    this.result = { win: !isEndless && win, stars, alive, reason, isEndless };
    this._showResult(!isEndless && win, stars, alive, reason, newRecord, isEndless);
    this._refreshFireButton();
    this._updateHUD();
  }

  // ------------------------------------------------------------ 结算界面
  _showResult(win, stars, alive, reason, newRecord, isEndless = false) {
    const $ = (id) => document.getElementById(id);
    $("resultStars").style.display = isEndless ? "none" : "flex";
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = (i * 0.12) + "s";
    });
    $("resultTitle").textContent = isEndless ? "无限模式结束" : win ? "胜利！" : "战败";
    $("resultTitle").style.color = isEndless || win ? "#ffe0ad" : "#ff9c8f";
    $("resultSub").textContent = isEndless
      ? `坚持到第 ${this.endlessWave} 波`
      : `第 ${this.level.id} 关 · ${this.level.name}`;
    $("statTurns").textContent = `${this.battleTime.toFixed(1)}s`;
    $("statAlive").textContent = `${alive}/${this.players.length}`;
    $("statStars").textContent = isEndless ? `${this.endlessBest}波` : win ? `${stars}★` : "0★";
    const starLabel = $("statStars").parentElement.querySelector("span");
    if (starLabel) starLabel.textContent = isEndless ? "最高波次" : "获得星星";
    let note = "";
    if (isEndless) {
      note = `本局坚持到第 ${this.endlessWave} 波 · 历史最佳 ${this.endlessBest} 波`;
      if (newRecord) note += " · 新纪录";
    } else if (win) {
      if (stars === 3) note = "三星达成：全员存活，并在目标时间内结束战斗";
      else if (newRecord) note = "新纪录已保存";
      else note = "进度已保存";
      if (this.level.id === LEVELS.length) note += " · 全部关卡通关";
    } else {
      note = reason || "再试一次，换个角度";
    }
    $("resultNote").textContent = note;
    const next = $("nextBtn");
    if (win && !isEndless) {
      next.style.display = "";
      next.textContent = this.level.id < LEVELS.length ? "下一关" : "无限模式";
    } else {
      next.style.display = "none";
    }
    document.getElementById("resultScreen").classList.add("show");
  }

  // ------------------------------------------------------------ 暂停 / 音效
  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.phase !== "aim" || this.cheatOpen) return;
    this.cheatOpen = true;
    this.paused = true;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this._updateCheatText();
    document.getElementById("cheatScreen").classList.add("show");
    this._refreshFireButton();
  }

  _closeCheat() {
    document.getElementById("cheatScreen").classList.remove("show");
    if (this.cheatOpen) {
      this.cheatOpen = false;
      if (this.phase === "aim") this.paused = false;
    }
  }

  _updateCheatText() {
    const god = document.getElementById("cheatGodText");
    if (god) god.textContent = `无敌模式：${this.cheatGod ? "开" : "关"}`;
    const ammo = document.getElementById("cheatAmmoText");
    if (ammo) ammo.textContent = `无限弹药：${this.cheatInfiniteAmmo ? "开" : "关"}`;
  }

  _handleCheat(action) {
    if (action === "close") { this._closeCheat(); return; }
    if (this.phase !== "aim") return;
    if (action === "heal") {
      for (const p of this.players) if (p.alive) p.hp = p.maxHp;
      toast("全族生命已回满", "ok");
    } else if (action === "ammo") {
      for (const id of Object.keys(this.ammo)) {
        if (this.ammo[id] === Infinity) continue;
        this.ammo[id] = Math.max(9, (Number(this.ammo[id]) || 0) + 9);
      }
      this._refreshWeaponBar();
      toast("所有武器弹药已补充", "ok");
    } else if (action === "god") {
      this.cheatGod = !this.cheatGod;
      toast(`无敌模式：${this.cheatGod ? "开" : "关"}`, "ok");
    } else if (action === "infinite") {
      this.cheatInfiniteAmmo = !this.cheatInfiniteAmmo;
      toast(`无限弹药：${this.cheatInfiniteAmmo ? "开" : "关"}`, "ok");
    } else if (action === "kill") {
      for (const e of this.enemies) if (e.alive) e.takeDamage(99999, 0);
      toast("已秒杀当前敌人", "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = LEVELS.length; p.tutorialSeen = true; });
      this._refreshLevelSummary();
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
    this._updateHUD();
  }

  _openPause() {
    if (this.phase === "menu" || this.phase === "over" || this.paused) return;
    this.paused = true;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    document.getElementById("pauseScreen").classList.add("show");
    this._updateSoundButtons();
    this._refreshFireButton();
  }

  _closePause() {
    document.getElementById("pauseScreen").classList.remove("show");
    this.paused = false;
    this.sfx.ensure();
    this.sfx.click();
    this._refreshFireButton();
  }

  _toggleSound() {
    this.soundOn = !(this.soundOn !== false);
    this.sfx.enabled = this.soundOn;
    this.store.update((p) => { p.sound = this.soundOn; });
    this._updateSoundButtons();
    if (this.soundOn) {
      this.sfx.ensure();
      this.sfx.click();
    }
  }

  // ------------------------------------------------------------ 提示 UI
  _showBanner(title, sub, enemy = false) {
    const el = document.getElementById("turnBanner");
    el.querySelector("strong").textContent = title;
    el.querySelector("span").textContent = sub || "";
    el.classList.toggle("enemy", enemy);
    el.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove("show"), 1500);
  }

  _showAimHint() {
    const el = document.getElementById("aimHint");
    el.classList.remove("hide");
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.add("hide"), 7000);
  }

  _hideAimHint() {
    clearTimeout(this.hintTimer);
    document.getElementById("aimHint").classList.add("hide");
  }

  _refreshWeaponBar() {
    if (!this.level) return;
    const bar = document.getElementById("weaponBar");
    if (bar.children.length !== WEAPON_ORDER.length) {
      bar.innerHTML = WEAPON_ORDER.map((id, i) => {
        const w = WEAPONS[id];
        return `<button class="weapon-card" data-weapon="${id}" type="button">
          <span class="w-key">${i + 1}</span>
          <span class="w-ammo" data-ammo="${id}"></span>
          <span class="w-cool"></span>
          ${this._weaponIcon(id)}
          <span class="w-name">${w.name}</span>
        </button>`;
      }).join("");
    }
    for (const card of bar.children) {
      const id = card.dataset.weapon;
      const ammo = this.ammo[id] ?? 0;
      const ammoEl = card.querySelector(".w-ammo");
      ammoEl.textContent = ammo === Infinity ? "∞" : String(ammo);
      card.classList.toggle("selected", id === this.selectedWeapon);
      card.classList.toggle("empty", ammo <= 0);
      const w = WEAPONS[id];
      const cd = w.cooldown || 1;
      const remain = Math.max(0, (this.weaponReadyAt[id] || 0) - this.time);
      const ratio = clamp(remain / cd, 0, 1);
      const cool = card.querySelector(".w-cool");
      if (cool) {
        cool.style.display = ratio > 0.01 ? "block" : "none";
        cool.style.transform = `scaleY(${ratio})`;
      }
    }
  }

  _weaponIcon(id) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
    if (id === "spear") return `<svg ${common}><path d="M4 20L18 6"/><path d="M15 4l5 1-1 5z"/></svg>`;
    if (id === "boulder") return `<svg ${common}><path d="M12 3l7 4 2 8-6 6-8-2-3-7z"/><path d="M9 9l3 3-1 4"/></svg>`;
    if (id === "grenade") return `<svg ${common}><circle cx="10" cy="14" r="6"/><path d="M14 9l2-3M16 5c2 0 3 1 3 3"/></svg>`;
    if (id === "banana") return `<svg ${common}><path d="M5 6c1 8 6 12 14 11-3 3-9 4-13 1S3 9 5 6z"/></svg>`;
    if (id === "boomerang") return `<svg ${common}><path d="M5 8l6 5-6 5"/><path d="M5 8l10 4-10 5" opacity=".55"/></svg>`;
    if (id === "meteor") return `<svg ${common}><circle cx="15" cy="9" r="5"/><path d="M9 15l-5 5M11 17l-3 3M7 11l-3 3"/></svg>`;
    return `<svg ${common}><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3"/></svg>`;
  }

  _updateHUD() {
    if (!this.level) return;
    document.getElementById("hudLevel").textContent = this.level.endless
      ? `无限模式${this.endlessWave > 0 ? " · 第 " + this.endlessWave + " 波" : ""}`
      : `第 ${this.level.id} 关 · ${this.level.name}`;
    document.getElementById("hudTime").textContent = this.battleTime.toFixed(1);
    document.getElementById("windVal").textContent = Math.abs(this.wind).toFixed(1);
    const arrow = document.getElementById("windArrow");
    arrow.style.transform = `rotate(${this.wind >= 0 ? 90 : -90}deg)`;
    arrow.classList.toggle("calm", Math.abs(this.wind) < 0.5);
    const active = this._activePlayer();
    document.getElementById("teamLabel").textContent = this.phase === "over"
      ? "战斗结束"
      : active
        ? `${active.name} · HP ${Math.ceil(active.hp)}`
        : "战斗中";
    const w = WEAPONS[this.selectedWeapon];
    const cd = w.cooldown || 1;
    const remain = Math.max(0, (this.weaponReadyAt[this.selectedWeapon] || 0) - this.time);
    document.getElementById("moveBar").style.width = Math.round(clamp(1 - remain / cd, 0, 1) * 100) + "%";
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color: color || "#fff", life: 0.95, maxLife: 0.95 });
  }

  spawnParticles(x, y, count, color, kind = "spark") {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: rand(-150, 150),
        vy: rand(-220, -20),
        life: rand(0.25, 0.7),
        maxLife: 0.7,
        size: rand(2, 4.5),
        color,
        kind,
        gravity: kind === "fire" ? -40 : 420,
      });
    }
  }

  // ------------------------------------------------------------ 渲染
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.level) {
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    if (this.shake > 0.5) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    if (this.terrainDirty) {
      this.terrain.redraw(this.theme);
      this.terrainDirty = false;
    }
    if (this.terrain) ctx.drawImage(this.terrain.canvas, 0, 0);
    this._drawAmbient(ctx);
    this._drawWindStreaks(ctx);

    const sorted = this.units.slice().sort((a, b) => Number(a.alive) - Number(b.alive));
    for (const u of sorted) u.draw(ctx, this);
    for (const p of this.projectiles) p.draw(ctx);

    if (this.phase === "aim" && (this.aim.active || this.aim.locked)) this._drawPlayerAim(ctx);
    if (this.phase === "aim") this._drawEnemyAims(ctx);

    this._drawParticles(ctx);
    this._drawRings(ctx);
    this._drawTexts(ctx);
    ctx.restore();
  }

  _drawAmbient(ctx) {
    if (!this.ambient.length) return;
    const t = this.theme;
    ctx.save();
    for (const p of this.ambient) {
      const twinkle = 0.65 + 0.35 * Math.sin(this.time * 1.6 + p.phase);
      ctx.globalAlpha = p.a * twinkle;
      ctx.fillStyle = p.color || t.mote;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWindStreaks(ctx) {
    if (Math.abs(this.wind) < 3.2) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1.4;
    const dir = Math.sign(this.wind);
    for (let i = 0; i < 12; i++) {
      const y = 70 + ((i * 97 + this.time * 85) % (H - 180));
      const x = ((this.time * 260 * dir + i * 173) % (W + 260) + W + 260) % (W + 260) - 130;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * (26 + (i % 4) * 14), y + 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlayerAim(ctx) {
    const u = this._activePlayer();
    if (!u) return;
    const w = WEAPONS[this.selectedWeapon];
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) return;
    const ox = u.x;
    const oy = u.y - 44;
    const pts = this._previewPath(ox, oy, this.aim.angle, this.aim.power, w, 0);
    ctx.save();
    // 先画一条很淡的引导线，再叠加强调点，手机上也能看清落点
    ctx.strokeStyle = w.color;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.fillStyle = w.color;
    for (let i = 3; i < pts.length; i += 4) {
      const f = i / pts.length;
      ctx.globalAlpha = 0.45 + 0.5 * (1 - f);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, i === 3 ? 4.5 : 3.4, 0, TAU);
      ctx.fill();
    }
    const end = pts[pts.length - 1];
    if (end) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 10, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end.x - 14, end.y);
      ctx.lineTo(end.x - 6, end.y);
      ctx.moveTo(end.x + 6, end.y);
      ctx.lineTo(end.x + 14, end.y);
      ctx.moveTo(end.x, end.y - 14);
      ctx.lineTo(end.x, end.y - 6);
      ctx.moveTo(end.x, end.y + 6);
      ctx.lineTo(end.x, end.y + 14);
      ctx.stroke();
    }
    // 力度条
    const bw = 54;
    const bx = u.x - bw / 2;
    const by = u.y - 116;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(8,10,14,.65)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = this.aim.power > 0.82 ? "#ff8a5a" : "#ffd27c";
    ctx.fillRect(bx, by, bw * this.aim.power, 5);
    if (this.aim.locked && !this.aim.active) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffe0ad";
      ctx.font = '800 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("已锁定 · 点右下角发射", u.x, u.y - 126);
    }

    // 虚拟摇杆：显示在按下点，拖动方向就是射击方向
    const j = this.aim.startWorld;
    const c = this.aim.currentWorld;
    if (j && c) {
      const dx = c.x - j.x;
      const dy = c.y - j.y;
      const len = Math.hypot(dx, dy);
      const visualMax = 62;
      const kx = j.x + (len > 0 ? (dx / len) * Math.min(len, visualMax) : 0);
      const ky = j.y + (len > 0 ? (dy / len) * Math.min(len, visualMax) : 0);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(8, 10, 14, 0.5)";
      ctx.beginPath();
      ctx.arc(j.x, j.y, 52, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = "rgba(255, 215, 140, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 52, 0, TAU);
      ctx.stroke();
      // 八个方向的刻度，帮助判断角度
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(j.x + Math.cos(a) * 40, j.y + Math.sin(a) * 40);
        ctx.lineTo(j.x + Math.cos(a) * 47, j.y + Math.sin(a) * 47);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.62;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = "#ffd27c";
      ctx.beginPath();
      ctx.arc(kx, ky, 18, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(80, 50, 20, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#ffe0ad";
      ctx.font = '700 12px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`力度 ${Math.round(this.aim.power * 100)}%`, j.x, Math.min(j.y + 74, H - 12));
      ctx.restore();
    }
    ctx.restore();
  }

  _drawEnemyAims(ctx) {
    for (const u of this.enemies) {
      if (!u.alive || !u.aiAim) continue;
      const w = u.aiAim.weapon;
      const pts = this._previewPath(u.x, u.y - 44, u.aiAim.angle, u.aiAim.power, w, 1);
      ctx.save();
      ctx.fillStyle = "#ff9c8c";
      for (let i = 3; i < pts.length; i += 5) {
        ctx.globalAlpha = 0.2 + 0.4 * (1 - i / pts.length);
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.4, 0, TAU);
        ctx.fill();
      }
      const end = pts[pts.length - 1];
      if (end) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#ff8f80";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 12, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _previewPath(sx, sy, angle, power, weapon, team) {
    const speed = weapon.speed * (0.5 + 0.5 * power);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let x = sx;
    let y = sy;
    const pts = [];
    const dt = 1 / 45;
    const maxT = weapon.id === "spike" ? 1.3 : 3;
    for (let t = 0; t < maxT; t += dt) {
      vx += this.wind * 27 * dt;
      vy += weapon.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      pts.push({ x, y });
      if (x < -40 || x > W + 40 || y > H + 40) break;
      if (this.terrain.circleHit(x, y, 3)) break;
      const hit = this.units.some((u) => {
        if (!u.alive || u.team === team) return false;
        const dx = x - u.x;
        const dy = y - (u.y - 28);
        return dx * dx + dy * dy < 22 * 22;
      });
      if (hit) break;
    }
    return pts;
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === "smoke") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU);
        ctx.fill();
      } else if (p.kind === "fire") {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawRings(ctx) {
    for (const r of this.rings) {
      const k = r.t / r.life;
      const radius = r.r + (r.max - r.r) * k;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = "#ffd9a0";
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 18px " + getComputedStyle(document.body).fontFamily;
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.fillStyle = t.color;
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawHeldWeapon(ctx, type, x, y, angle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = scale || 1;
    ctx.lineCap = "round";
    if (type === "spear") {
      ctx.strokeStyle = "#b99767";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(38, 0);
      ctx.stroke();
      ctx.fillStyle = "#e5d9c0";
      ctx.beginPath();
      ctx.moveTo(38, -3.5);
      ctx.lineTo(52, 0);
      ctx.lineTo(38, 3.5);
      ctx.closePath();
      ctx.fill();
    } else if (type === "boulder") {
      ctx.fillStyle = "#8f6a49";
      ctx.strokeStyle = "#3a2417";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(16, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (type === "grenade") {
      ctx.fillStyle = "#5f6b53";
      ctx.strokeStyle = "#242b20";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(16, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c9a36a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(19, -6);
      ctx.quadraticCurveTo(24, -11, 20, -14);
      ctx.stroke();
    } else if (type === "banana") {
      ctx.strokeStyle = "#ffe15c";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(18, 0, 8 * s, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
    } else if (type === "spike") {
      ctx.fillStyle = "#8799a9";
      ctx.strokeStyle = "#2c3540";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(17, 0, 6.5 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c7d3dd";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(17 + Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(17 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (type === "boomerang") {
      ctx.strokeStyle = "#e8b96a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(8, -7);
      ctx.lineTo(18, 0);
      ctx.lineTo(8, 7);
      ctx.stroke();
    } else if (type === "meteor") {
      ctx.fillStyle = "#7d4a3a";
      ctx.strokeStyle = "#3a1e17";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,140,60,.7)";
      ctx.beginPath();
      ctx.arc(18, 0, 3 * s, 0, TAU);
      ctx.fill();
    } else {
      // 默认木棒
      ctx.strokeStyle = "#7c5330";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.fillStyle = "#6b4225";
      ctx.beginPath();
      ctx.arc(25, 0, 5.5 * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  getUnitAimAngle(unit) {
    if (unit.team === 0 && (this.aim.active || this.aim.locked)) return this.aim.angle;
    if (unit.team === 1 && unit.aiAim) return unit.aiAim.angle;
    return unit.facing === 1 ? -0.5 : Math.PI + 0.5;
  }

  isActiveUnit(unit) {
    if (!unit.alive || unit.team !== 0) return false;
    return this.players[this.activePlayerIndex] === unit;
  }

  // ------------------------------------------------------------ 背景
  _buildBackground() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const t = this.theme;
    const rng = mulberry32((this.level.seed || 1) * 97 + 13);
    const sky = g.createLinearGradient(0, 0, 0, H);
    t.sky.forEach((color, i) => sky.addColorStop(i / (t.sky.length - 1), color));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    if (t.night) {
      for (let i = 0; i < 110; i++) {
        const x = rng() * W;
        const y = rng() * H * 0.62;
        g.globalAlpha = 0.25 + rng() * 0.65;
        g.fillStyle = "#e8f1ff";
        g.fillRect(x, y, rng() > 0.8 ? 2 : 1, rng() > 0.8 ? 2 : 1);
      }
      g.globalAlpha = 1;
    }

    // 日/月
    const cx = 1010 - (this.level.seed % 6) * 28;
    const cy = 118;
    const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 220);
    glow.addColorStop(0, t.sunGlow);
    glow.addColorStop(0.45, t.sunGlow.replace(/[\d.]+\)$/, "0.12)"));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(cx - 230, cy - 230, 460, 460);
    g.fillStyle = t.sun;
    g.beginPath();
    if (t.id === "night") {
      g.arc(cx, cy, 38, 0, TAU);
      g.fill();
      g.fillStyle = t.sky[0];
      g.beginPath();
      g.arc(cx + 16, cy - 8, 34, 0, TAU);
      g.fill();
    } else {
      g.arc(cx, cy, t.id === "volcano" ? 30 : 42, 0, TAU);
      g.fill();
    }

    // 云
    if (!t.night || t.id === "volcano") {
      g.fillStyle = "rgba(255,255,255,.14)";
      for (let i = 0; i < 7; i++) {
        const x = rng() * W;
        const y = 60 + rng() * 220;
        const s = 0.6 + rng() * 1.1;
        g.beginPath();
        g.ellipse(x, y, 54 * s, 13 * s, 0, 0, TAU);
        g.ellipse(x + 42 * s, y - 5 * s, 34 * s, 10 * s, 0, 0, TAU);
        g.ellipse(x - 38 * s, y + 3 * s, 28 * s, 9 * s, 0, 0, TAU);
        g.fill();
      }
    }

    if (t.id === "volcano") {
      // 火山烟柱
      g.fillStyle = "rgba(40,20,20,.55)";
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(660 + rng() * 120, 210 - i * 20 + rng() * 14, 24 + i * 7, 0, TAU);
        g.fill();
      }
    }

    // 远/中/近三层山脊
    this._ridge(g, rng, 330, 70, t.far, 7);
    this._ridge(g, rng, 410, 54, t.mid, 9);
    this._ridge(g, rng, 470, 36, t.near, 11);

    // 地平线植被
    for (let i = 0; i < 16; i++) {
      const x = rng() * W;
      const y = 410 + rng() * 70;
      const s = 0.6 + rng() * 0.8;
      this._tree(g, x, y, s, t.near, t.id);
    }

    // 太阳附近飞鸟
    if (!t.night) {
      g.strokeStyle = "rgba(30,20,20,.5)";
      g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const x = 700 + rng() * 300;
        const y = 130 + rng() * 80;
        g.beginPath();
        g.arc(x - 4, y, 5, Math.PI * 1.1, Math.PI * 1.8);
        g.arc(x + 6, y, 5, Math.PI * 1.2, Math.PI * 1.9);
        g.stroke();
      }
    }

    // 暗角
    const vg = g.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 780);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    this.bg = c;
  }

  _ridge(g, rng, baseY, amp, color, steps) {
    g.beginPath();
    g.moveTo(0, H);
    let y = baseY + (rng() - 0.5) * amp;
    g.lineTo(0, y);
    for (let i = 1; i <= steps; i++) {
      y = baseY + (rng() - 0.5) * amp * 1.5;
      g.lineTo((i / steps) * W, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  _tree(g, x, y, s, color, themeId) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = color;
    g.strokeStyle = color;
    if (themeId === "dunes") {
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -34);
      g.moveTo(0, -18);
      g.lineTo(-8, -26);
      g.moveTo(0, -24);
      g.lineTo(8, -32);
      g.stroke();
    } else if (themeId === "volcano") {
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -30);
      g.moveTo(0, -14);
      g.lineTo(-12, -24);
      g.moveTo(0, -20);
      g.lineTo(11, -30);
      g.stroke();
    } else if (themeId === "night" || themeId === "forest" || themeId === "bridge") {
      g.fillRect(-3, -20, 6, 20);
      g.beginPath();
      g.moveTo(0, -54);
      g.lineTo(-18, -20);
      g.lineTo(18, -20);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(0, -38);
      g.lineTo(-22, -4);
      g.lineTo(22, -4);
      g.closePath();
      g.fill();
    } else {
      g.fillRect(-2.5, -20, 5, 20);
      g.beginPath();
      g.arc(0, -26, 14, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(-10, -22, 9, 0, TAU);
      g.arc(10, -22, 9, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  _makeAmbient() {
    this.ambient = [];
    const volcanic = this.theme.id === "volcano";
    const night = this.theme.id === "night";
    const count = night ? 34 : volcanic ? 46 : 30;
    for (let i = 0; i < count; i++) {
      this.ambient.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: volcanic ? rand(-6, 6) : rand(-10, 10),
        vy: volcanic ? rand(-34, -12) : night ? rand(-4, 4) : rand(-5, 5),
        s: volcanic ? rand(1, 2.2) : night ? rand(1, 2.6) : rand(0.8, 2),
        a: volcanic ? rand(0.35, 0.8) : rand(0.15, 0.5),
        phase: rand(0, 6),
        color: volcanic ? (Math.random() < 0.5 ? "#ff9a4a" : "#ffd07a") : night ? "#ffe9a3" : null,
      });
    }
  }

  _spawnConfetti() {
    const colors = ["#ffd27c", "#ff8a5a", "#7ddc91", "#7fd2ff", "#ffe9a3"];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: rand(0, W), y: rand(-80, -10),
        vx: rand(-80, 80), vy: rand(80, 260),
        life: rand(1.5, 3), maxLife: 3, size: rand(3, 7),
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "fire", gravity: 120,
      });
    }
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.__stoneWars = new StoneWars();
