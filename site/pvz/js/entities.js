/**
 * 植物大战僵尸 · 加强版 · 实体类（从 game.js 原样搬移）
 */
import { PLANTS, ZOMBIES } from "./levels.js";
import { GRID, TAU, W, clamp, colX, groundY, rand, roundRect } from "./common.js";
import { isMobile } from "../../assets/js/device.js";
// ---------------------------------------------------------------- 植物
export class Plant {
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
      : this.def.fireRate ? 0.7 * (game.crazy ? 0.5 : 1)
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
    this.burstLeft = 0;
    this.burstT = 0;
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
      // 爆发射击：加特林一轮触发多次连射
      if (this.burstLeft > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstLeft -= 1;
          this.burstT = def.burstGap || 0.09;
          if (this._hasTarget()) this._fire();
        }
      }
      this.timer -= dt;
      if (this.timer <= 0 && this._hasTarget()) {
        this.timer = def.fireRate * (this.game.crazy ? 0.5 : 1);
        if (def.laser) {
          this._fireLaser();
        } else {
          this._fire();
          if (def.burst) {
            this.burstLeft = def.burst - 1;
            this.burstT = def.burstGap || 0.09;
          }
        }
      }
    }
    if (this.id === "spikeweed" || this.id === "spikerock") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = def.tick;
        for (const z of this.game.zombies) {
          if (z.alive && z.row === this.row && Math.abs(z.x - this.x) < 54) {
            z.takeDamage(def.damage * (this.game.crazy ? 2 : 1));
          }
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
    const kind = this.id === "melon" ? "melon"
      : this.id === "wintermelon" ? "ice"
        : this.id === "firepea" ? "fire" : "pea";
    for (const row of rows) {
      if (row < 0 || row >= GRID.rows) continue;
      for (let i = 0; i < shots; i++) {
        this.game.peas.push(new Pea(
          this.game,
          this.x + 34 + i * 8,
          groundY(row) - 54 + ((i % 3) - 1) * 3,
          row,
          def.damage,
          Boolean(def.slow),
          Boolean(def.splash),
          def.splash || 0,
          kind,
          Boolean(def.burn)
        ));
      }
    }
    this.shootPulse = this.id === "gatling" ? 0.24 : 0.16;
    this.game.muzzleFlash(this.x + 40, this.y - 52, kind, this.id === "gatling" ? 1.8 : 1);
    if (this.id === "gatling") {
      // 加特林：炮管余焰、弹壳、后坐力与轻微震屏
      this.game.spawnParticles(this.x + 24, this.y - 50, 4, "#ffd35e", "spark");
      this.game.spawnParticles(this.x + 16, this.y - 42, 2, "#c9a05b", "shell");
      this.game.spawnParticles(this.x + 46, this.y - 54, 2, "#d8d2c2", "smoke");
      this.game.shake = Math.max(this.game.shake, 3.2);
      this.game.sfx.shootHeavy();
    } else {
      this.game.sfx.shoot(kind);
    }
    if (kind === "fire") this.game.spawnParticles(this.x + 38, this.y - 52, 3, "#ff8a3a", "spark");
    if (kind === "ice") this.game.spawnParticles(this.x + 38, this.y - 52, 3, "#bdf3ff", "spark");
  }

  /** 激光豆：整行穿透光束 */
  _fireLaser() {
    const def = this.def;
    this.shootPulse = 0.26;
    this.game.fireLaser(this.x + 30, this.y - 54, this.row, def.damage * (this.game.crazy ? 2 : 1));
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
export class Zombie {
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
    this.burnT = 0;
    this.burnTick = 0;
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
    // 烈焰灼烧：持续掉血并冒火星
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.18;
        this.hp -= 3;
        this.game.spawnParticles(this.x + rand(-10, 10), this.y - rand(20, 70), 1, Math.random() < 0.5 ? "#ff8a3a" : "#ffd35e", "spark");
        if (this.hp <= 0) {
          this.die();
          return;
        }
      }
    }
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
export class Pea {
  constructor(game, x, y, row, damage, snow, splash = false, splashDamage = 0, kind = "pea", burn = false) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.row = row;
    this.damage = damage * (game.crazy ? 2 : 1);
    this.snow = snow;
    this.splash = splash;
    this.splashDamage = splashDamage;
    this.kind = kind;
    this.burn = burn;
    this.speed = kind === "melon" ? 360 : kind === "ice" ? 330 : 450;
    this.alive = true;
    this.age = 0;
    this.trailT = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    this.x += this.speed * dt;
    if (this.x > W + 30) {
      this.alive = false;
      return;
    }
    // 弹道拖尾
    this.trailT -= dt;
    if (this.trailT <= 0 && this.kind !== "melon" && this.kind !== "ice") {
      this.trailT = 0.045;
      const color = this.kind === "fire" ? "#ff8a3a" : this.snow ? "#bdf3ff" : "#a9e36a";
      this.game.particles.push({
        x: this.x - 8 + rand(-2, 2), y: this.y + rand(-2, 2),
        vx: rand(-20, 10), vy: rand(-16, 16),
        life: 0.18, maxLife: 0.18, size: rand(1.5, 3),
        color, kind: "spark", gravity: 0,
      });
    }
    const target = this.game.zombies.find((z) => z.alive && z.row === this.row && z.x - this.x < 26 && z.x - this.x > -20);
    if (target) {
      target.takeDamage(this.damage);
      if (this.snow) target.slowT = 4;
      if (this.burn) target.burnT = 3;
      if (this.splash) this.game.splashDamage(target.x, target.y - 46, 120, this.splashDamage, target);
      const color = this.kind === "fire" ? "#ff8a3a" : this.kind === "ice" ? "#c9f4ff" : this.snow ? "#bdf3ff" : "#a9e36a";
      this.game.spawnParticles(this.x, this.y, this.kind === "melon" || this.kind === "ice" ? 12 : 6, color, "spark");
      this.game.particles.push({
        x: this.x, y: this.y, vx: 0, vy: 0, life: 0.14, maxLife: 0.14,
        size: 9, color: "#fff6c8", kind: "flash", gravity: 0,
      });
      if (this.kind === "fire") this.game.sfx.noise(0.05, 0.03, 1800);
      this.alive = false;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.kind === "melon" || this.kind === "ice") {
      const ice = this.kind === "ice";
      ctx.rotate(this.age * 8);
      ctx.fillStyle = ice ? "#8fd7f0" : "#4f9a3a";
      ctx.strokeStyle = ice ? "#4a9fb8" : "#2f6b23";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, ice ? 13 : 11, ice ? 10 : 8, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = ice ? "#e9fbff" : "#2f6b23";
      ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, -7);
        ctx.lineTo(i * 4, 7);
        ctx.stroke();
      }
      if (ice) {
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.beginPath();
        ctx.arc(-4, -4, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const r = this.snow ? 7 : 6.5;
    if (this.kind === "fire") {
      ctx.shadowColor = "rgba(255,120,40,.9)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ff8a3a";
      ctx.strokeStyle = "#c94a1e";
    } else if (this.snow) {
      ctx.fillStyle = "#a9e7ff";
      ctx.strokeStyle = "#5aa9c7";
    } else {
      ctx.fillStyle = "#7ed957";
      ctx.strokeStyle = "#4b9a34";
    }
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.beginPath();
    ctx.arc(-2, -2, 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 阳光
export class Sun {
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
export class Mower {
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
