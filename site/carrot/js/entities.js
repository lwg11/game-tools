/**
 * 保卫萝卜 · 实体类：敌人 / 子弹 / 炮塔（从 game.js 原样搬移）
 */
import { ENEMIES, TOWERS } from "./levels.js";
import { TAU, clamp, pathPos, rand, roundRect } from "./common.js";
// ---------------------------------------------------------------- 敌人
export class Enemy {
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
export class Bullet {
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
export class Tower {
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
    const crazy = this.game.crazy;
    return {
      damage: Math.round(this.def.damage * f * (crazy ? 2 : 1)),
      range: this.def.range + (this.level - 1) * 15,
      rate: this.def.rate * (1 - (this.level - 1) * 0.08) * (crazy ? 0.5 : 1),
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
