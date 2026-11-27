/** 石器大战 · 投射物实体（弹道 / 命中 / 爆炸与特效绘制） */
import { WEAPONS } from "./levels.js";
import { H, TAU, W, clamp, rand } from "./common.js";
export class Projectile {
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
    this.kind = this.weapon.kind || type;
    this.dead = false;
    this.age = 0;
    this.rotation = Math.atan2(vy, vx);
    this.trail = [];
    this.lastBounce = 0;
    this.hitSet = new Set();
    this.returned = false;
    this.smokeT = 0;
    this.fuse = this.kind === "grenade" || this.kind === "skybolt" || this.kind === "zhuxian"
      ? this.weapon.fuse
      : type === "bananaSmall" ? 0.9 : null;
    this.r = this.kind === "boulder" ? 8 : this.kind === "spike" ? 9 : this.kind === "spear" ? 4 : 6;
    // 锁魂链：链条一端锚定在施法者手上，钩爪飞出
    this.owner = null;
    if (this.kind === "chain") {
      this.maxLen = this.weapon.chainLen || 460;
      this.ox = x;
      this.oy = y;
    }
    // 修仙武器：飞行时散发灵气粒子
    this.auraT = 0;
    this.auraColor = {
      sword: "#a8d8ff", fireball: "#ff8a4a", thunder: "#ffe95c",
      swordarray: "#a8d8ff", dragonpalm: "#ff8a5a", shieldcharm: "#ffd25e",
      soulchain: "#b48ce8", teleport: "#6fe8ff", poisonmist: "#8aff6a",
      heal: "#6affa8", storm: "#6ac8ff", skylightning: "#fff8c8",
      formation: "#ff6a9a", mend: "#a8ffd8", stonewall: "#c8b8a8",
    }[type] || null;
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.kind === "spike") {
      this.updateSpike(dt);
      return;
    }
    if (this.kind === "boomerang") {
      this.updateBoomerang(dt);
      return;
    }
    if (this.kind === "chain") {
      this.updateChain(dt);
      return;
    }
    if (this.kind === "dragon") {
      this.updateDragon(dt);
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
      let pierced = false;
      for (const u of this.game.units) {
        if (!u.alive || u.team === this.team) continue;
        if (this.hitsUnit(u, nx, ny)) {
          if (w.pierce) {
            // 电磁炮：贯穿沿途敌人，每个目标只结算一次
            if (!this.hitSet.has(u)) {
              this.hitSet.add(u);
              u.takeDamage(w.damage * 0.85 * (this.damageMul || 1), this.team);
              this.game.spawnParticles(u.x, u.y - 30, 8, w.color, "spark");
            }
            pierced = true;
            continue;
          }
          this.x = nx;
          this.y = ny;
          this.explode();
          return;
        }
      }
      if (!pierced && this.game.terrain.circleHit(nx, ny, 3)) {
        if (this.kind === "grenade") {
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
      if (this.trail.length > (this.kind === "laser" ? 8 : 14)) this.trail.shift();
      // 修仙武器：飞行灵气粒子
      if (this.auraColor) {
        this.auraT -= h;
        if (this.auraT <= 0) {
          this.auraT = 0.025;
          const a = rand(0, TAU);
          const sp = rand(20, 80);
          this.game.particles.push({
            x: nx + rand(-4, 4), y: ny + rand(-4, 4),
            vx: Math.cos(a) * sp - this.vx * 0.08,
            vy: Math.sin(a) * sp - this.vy * 0.08,
            life: rand(0.3, 0.7), maxLife: 0.7, size: rand(1.5, 3.5),
            color: this.auraColor, kind: "spark", gravity: -20,
          });
        }
      }
      // 火箭 / 陨石留下烟尾，强化"重火力"观感
      if (this.kind === "rocket" || this.type === "meteor" || this.weapon.id === "cannon") {
        this.smokeT -= h;
        if (this.smokeT <= 0) {
          this.smokeT = 0.03;
          this.game.particles.push({
            x: nx + rand(-3, 3), y: ny + rand(-3, 3),
            vx: rand(-26, 26), vy: rand(-30, 10),
            life: rand(0.25, 0.55), maxLife: 0.55, size: rand(3, 6),
            color: this.kind === "rocket" ? "rgba(255,150,90,.55)" : "rgba(190,180,170,.45)",
            kind: "smoke", gravity: -30,
          });
        }
      }
    }
  }

  /** 刺球：贴地滚动，撞墙反弹，碰敌即爆 */
  updateSpike(dt) {
    const g = this.game;
    for (const u of g.units) {
      if (!u.alive || u.team === this.team) continue;
      if (this.hitsUnit(u, this.x, this.y, 4)) {
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
      if (this.hitsUnit(u, this.x, this.y, 4)) {
        this.hitSet.add(u);
        u.takeDamage(this.weapon.damage * (this.damageMul || 1), this.team);
        g.spawnParticles(this.x, this.y, 6, this.weapon.color, "spark");
      }
    }
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 16) this.trail.shift();
    if (this.age > 2.6) this.dead = true;
  }

  /**
   * 锁魂链：钩爪沿弹道飞出，链条实时从施法者手上延伸出去；
   * 命中敌人、撞墙/落地或链条被拉到最大长度时，在钩爪末端爆开魂火。
   */
  updateChain(dt) {
    const g = this.game;
    const w = this.weapon;
    // 钩爪命中判定（比球状武器判定略大，方便缠住目标）
    for (const u of g.units) {
      if (!u.alive || u.team === this.team) continue;
      if (this.hitsUnit(u, this.x, this.y, 7)) {
        this.explode();
        return;
      }
    }
    const speed = Math.hypot(this.vx, this.vy);
    const steps = clamp(Math.ceil((speed * dt) / 6), 1, 8);
    const h = dt / steps;
    for (let i = 0; i < steps && !this.dead; i++) {
      this.vy += w.gravity * h;
      this.vx += g.wind * 12 * h;
      const nx = this.x + this.vx * h;
      const ny = this.y + this.vy * h;
      if (nx < -80 || nx > W + 80 || ny > H + 80) {
        this.explode();
        return;
      }
      if (g.terrain.circleHit(nx, ny, 4)) {
        this.x = nx;
        this.y = ny;
        this.explode();
        return;
      }
      this.x = nx;
      this.y = ny;
    }
    // 链条长度从施法者手上算起，被拉直后在末端爆开
    let ox = this.ox;
    let oy = this.oy;
    if (this.owner && this.owner.alive) {
      ox = this.owner.x;
      oy = this.owner.y - 44;
    }
    if (Math.hypot(this.x - ox, this.y - oy) >= this.maxLen || this.age > 3.2) {
      this.explode();
      return;
    }
    this.rotation = Math.atan2(this.vy, this.vx);
    // 钩爪魂火粒子
    if (this.auraColor) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.03;
        const a = rand(0, TAU);
        const sp = rand(30, 110);
        g.particles.push({
          x: this.x + rand(-4, 4), y: this.y + rand(-4, 4),
          vx: Math.cos(a) * sp - this.vx * 0.1,
          vy: Math.sin(a) * sp - this.vy * 0.1,
          life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.5, 3),
          color: this.auraColor, kind: "spark", gravity: -20,
        });
      }
    }
  }

  /**
   * 降龙十八掌：金龙在空中蜿蜒游动（蛇形摆动 + 重力下坠），
   * 命中敌人或撞地后爆开。
   */
  updateDragon(dt) {
    const g = this.game;
    const w = this.weapon;
    for (const u of g.units) {
      if (!u.alive || u.team === this.team) continue;
      if (this.hitsUnit(u, this.x, this.y, 6)) {
        this.explode();
        return;
      }
    }
    const speed = Math.hypot(this.vx, this.vy) || 1;
    // 垂直于飞行方向的单位向量：游动摆动的施加方向
    const px = -this.vy / speed;
    const py = this.vx / speed;
    const steps = clamp(Math.ceil(speed * dt / 6), 1, 8);
    const h = dt / steps;
    for (let i = 0; i < steps && !this.dead; i++) {
      // 蛇形游动：横向正弦力，随时间推进形成“游动”波浪
      const sway = Math.sin(this.age * 9) * 300;
      this.vx += px * sway * h;
      this.vy += py * sway * h * 0.6;
      this.vy += w.gravity * h;
      this.vx += g.wind * 12 * h;
      const nx = this.x + this.vx * h;
      const ny = this.y + this.vy * h;
      if (nx < -80 || nx > W + 80 || ny > H + 80) {
        this.explode();
        return;
      }
      if (g.terrain.circleHit(nx, ny, 5)) {
        this.x = nx;
        this.y = ny;
        this.explode();
        return;
      }
      this.x = nx;
      this.y = ny;
    }
    // 记录轨迹供龙身游动渲染
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 26) this.trail.shift();
    this.rotation = Math.atan2(this.vy, this.vx);
    if (this.auraColor) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.03;
        g.particles.push({
          x: this.x + rand(-4, 4), y: this.y + rand(-4, 4),
          vx: rand(-40, 40), vy: rand(-60, 0),
          life: rand(0.2, 0.5), maxLife: 0.5, size: rand(2, 4),
          color: this.auraColor, kind: "spark", gravity: -20,
        });
      }
    }
    if (this.age > 3.6) this.explode();
  }

  /** 命中判定：头、躯干、坐骑分开算，避免打头时从身体上方穿过去 */
  hitsUnit(u, px, py, pad = 0) {
    const s = u.scale || 1;
    const lift = u.mount ? 26 * s : 0;
    const circles = [
      [u.x, u.y - lift - 49 * s, 14 * s + pad], // 头部
      [u.x, u.y - lift - 28 * s, 19 * s + pad], // 躯干与腿
    ];
    if (u.mount) circles.push([u.x, u.y - 24 * s, 20 * s + pad]); // 战马
    for (const [cx, cy, r] of circles) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    const dmg = this.weapon.damage * (this.damageMul || 1);
    const blast = this.weapon.blast * (this.blastMul || 1);
    // 万剑归宗：剑丸命中后召唤剑雨，飞剑从施法者身体飞出，穿透伤害 + 落地插地
    if (this.kind === "swordrain") {
      g.spawnSwordRain(this.x, this.y, this.team, dmg, blast, this.type);
      return;
    }
    // 搬山术：落地放置金庚石平台，不爆炸
    if (this.type === "stonewall") {
      const placed = g.terrain.placeBlocks(this.x, this.y, 4);
      // 放置石块的土石特效
      g.spawnParticles(this.x, this.y, 18, "#c8b8a8", "dirt");
      g.rings.push({ x: this.x, y: this.y, r: 8, max: 60, t: 0, life: 0.4, color: "rgba(200,184,168,.7)" });
      g.addText(this.x, this.y - 30, placed ? "搬山" : "落石", "#c8b8a8");
      g.shake = Math.max(g.shake, 4);
      g.terrainDirty = true;
      g.sfx.tone(140, 0.18, "triangle", 0.12);
      return;
    }
    if (this.type === "banana") {
      g.explode(this.x, this.y, blast, dmg, this.team, "blast");
      for (let i = 0; i < 3; i++) {
        const p = new Projectile(g, "bananaSmall", this.x + rand(-6, 6), this.y - 4, rand(-230, 230), rand(-390, -160), this.team);
        p.damageMul = this.damageMul;
        g.projectiles.push(p);
      }
    } else if (this.kind === "split") {
      // 西瓜 / 集束弹：分裂成多个小弹
      const count = this.type === "cluster" ? 5 : 4;
      g.explode(this.x, this.y, blast * 0.4, dmg * 0.3, this.team, "blast");
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + rand(-0.3, 0.3);
        const spd = rand(180, 320);
        const p = new Projectile(g, "bananaSmall", this.x, this.y, Math.cos(angle) * spd, Math.sin(angle) * spd - 120, this.team);
        p.weapon = { ...this.weapon, damage: dmg * 0.7, blast: blast * 0.5, gravity: 900 };
        p.damageMul = this.damageMul;
        g.projectiles.push(p);
      }
    } else if (this.kind === "spear") {
      g.explode(this.x, this.y, 22 * (this.blastMul || 1), dmg, this.team, "spear", this.type);
    } else if (this.kind === "chain") {
      // 锁魂链：不留火焰残留，只爆紫色魂火
      g.explode(this.x, this.y, blast, dmg, this.team, "chain", this.type);
    } else if (this.kind === "skybolt") {
      // 天雷灭世：引雷子落点处天降大范围雷霆（不炸地形）
      g.spawnSkyLightning(this.x, this.y, this.team, dmg, blast);
    } else if (this.kind === "zhuxian") {
      // 诛仙阵：阵图落点处苍穹降下巨剑与万剑
      g.spawnSwordFormation(this.x, this.y, this.team, dmg, blast);
    } else if (this.kind === "poisoncloud") {
      // 毒雾术：浓雾爆发，只伤单位不毁建筑，中毒持续一个回合
      g.poisonCloudBurst(this.x, this.y, blast, dmg, this.team);
      return;
    } else {
      g.explode(this.x, this.y, blast, dmg, this.team, this.kind, this.type);
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const type = this.type;
    const w = this.weapon;
    // 拖尾
    if (this.trail.length > 1) {
      const beam = this.kind === "laser";
      ctx.save();
      if (beam) ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = beam ? 0.8 : 0.3;
      ctx.lineWidth = beam ? 3 : this.kind === "spear" ? 2 : 3;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = beam ? 14 : 0;
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
    } else if (type === "stonewall") {
      // 搬山术：不规则巨石 + 土石裂纹 + 灵光
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#8a7a6c";
      ctx.strokeStyle = "#3a322c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rr = 9;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const rad = rr * (0.82 + ((i * 37) % 10) / 30);
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 土石裂纹
      ctx.strokeStyle = "rgba(40,32,26,.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 6);
      ctx.moveTo(3, -3);
      ctx.lineTo(5, 2);
      ctx.stroke();
      // 灵光晕
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(200,184,168,.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
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
    } else if (type === "crossbow") {
      ctx.rotate(this.rotation);
      ctx.strokeStyle = "#c7d3dd";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.fillStyle = "#eef3f7";
      ctx.beginPath();
      ctx.moveTo(10, -3);
      ctx.lineTo(20, 0);
      ctx.lineTo(10, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#7d8a96";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-21, -5);
      ctx.moveTo(-16, 0);
      ctx.lineTo(-21, 5);
      ctx.stroke();
    } else if (type === "cannon") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#3d4550";
      ctx.strokeStyle = "#161b21";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(220,235,255,.35)";
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, TAU);
      ctx.fill();
    } else if (type === "firebomb") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#b5542f";
      ctx.strokeStyle = "#3a1c12";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb04a";
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.arc(0, -11, 4 + Math.random() * 2.5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "rifle") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#ffe6a8";
      ctx.shadowColor = "#ffd27c";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (type === "mortar") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#6d7a86";
      ctx.strokeStyle = "#232a31";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -4);
      ctx.lineTo(6, -4);
      ctx.lineTo(12, 0);
      ctx.lineTo(6, 4);
      ctx.lineTo(-11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#aab6c2";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8, 4);
      ctx.stroke();
    } else if (type === "rocket") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#e8ecf2";
      ctx.strokeStyle = "#4c5661";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(6, -4);
      ctx.lineTo(14, 0);
      ctx.lineTo(6, 4);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8503a";
      ctx.beginPath();
      ctx.moveTo(6, -4);
      ctx.lineTo(14, 0);
      ctx.lineTo(6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#ffb04a";
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.lineTo(-24 - Math.random() * 8, 0);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "laser" || type === "railgun") {
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, type === "railgun" ? 20 : 13, type === "railgun" ? 3.4 : 4.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(0, 0, type === "railgun" ? 10 : 6, 1.7, 0, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "watermelon") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#4a8c3f";
      ctx.strokeStyle = "#2c5c26";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#7ed957";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-5, -6);
      ctx.quadraticCurveTo(0, -2, 5, -6);
      ctx.moveTo(-6, 0);
      ctx.quadraticCurveTo(0, 4, 6, 0);
      ctx.moveTo(-5, 6);
      ctx.quadraticCurveTo(0, 10, 5, 6);
      ctx.stroke();
    } else if (type === "durian") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#c8b45a";
      ctx.strokeStyle = "#6a5a2a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#8a7a3a";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
    } else if (type === "poisonshroom") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#b48ce8";
      ctx.strokeStyle = "#5c3a8a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 8, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8dff0";
      ctx.fillRect(-3, -2, 6, 8);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-3, -5, 1.5, 0, TAU);
      ctx.arc(3, -6, 1.5, 0, TAU);
      ctx.fill();
    } else if (type === "flail") {
      ctx.rotate(this.rotation);
      ctx.strokeStyle = "#a8b0ba";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = "#7d8a96";
      ctx.strokeStyle = "#3d4550";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(10, 0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c7d3dd";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(10 + Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(10 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (type === "flare") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (type === "molotov") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#ff6a3a";
      ctx.strokeStyle = "#8a2a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb04a";
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.arc(0, -10, 4 + Math.random() * 2, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "cluster") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#e8a0ff";
      ctx.strokeStyle = "#8a4a9a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c87add";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 2.5, 0, TAU);
        ctx.fill();
      }
    } else if (type === "drone") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#6fe8d8";
      ctx.strokeStyle = "#2a8a7a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#2a8a7a";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.78;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
    } else if (type === "gravity") {
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#d88cff";
      ctx.strokeStyle = "#6a3a9a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#b46add";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (type === "sword") {
      // 飞剑：剑光拖尾 + 寒芒剑刃 + 灵气光晕
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 外层光晕
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      glow.addColorStop(0, "rgba(168,216,255,.55)");
      glow.addColorStop(0.5, "rgba(120,180,255,.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      // 剑光拖尾（三层渐变）
      for (let i = 0; i < 3; i++) {
        const alpha = 0.28 - i * 0.08;
        const w = 4 - i * 1.2;
        ctx.strokeStyle = `rgba(168,216,255,${alpha})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(-14 - i * 6, 0);
        ctx.quadraticCurveTo(-28 - i * 8, rand(-2, 2), -42 - i * 10, rand(-3, 3));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      // 剑刃
      ctx.fillStyle = "#e8f4ff";
      ctx.shadowColor = "#a8d8ff";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(3.5, 8);
      ctx.lineTo(0, 14);
      ctx.lineTo(-3.5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 剑脊寒芒
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 10);
      ctx.stroke();
      // 剑格
      ctx.strokeStyle = "#8ab8d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, 8);
      ctx.lineTo(7, 8);
      ctx.stroke();
      // 剑柄
      ctx.strokeStyle = "#5a7a9a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, 14);
      ctx.stroke();
    } else if (type === "fireball") {
      // 火球术：多层火焰 + 火舌拖尾 + 核心白炽
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 外层光晕
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
      fg.addColorStop(0, "rgba(255,106,58,.5)");
      fg.addColorStop(0.5, "rgba(255,80,30,.15)");
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();
      // 火舌拖尾
      for (let i = 0; i < 4; i++) {
        const a = 0.22 - i * 0.05;
        ctx.strokeStyle = `rgba(255,${120 + i * 30},40,${a})`;
        ctx.lineWidth = 5 - i;
        ctx.beginPath();
        ctx.moveTo(-8 - i * 4, 0);
        ctx.quadraticCurveTo(-20 - i * 6, rand(-6, 6), -34 - i * 8, rand(-8, 8));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      // 外焰
      ctx.fillStyle = "#ff6a3a";
      ctx.shadowColor = "#ff6a3a";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 内焰
      ctx.fillStyle = "#ffb04a";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      // 白炽核心
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, TAU);
      ctx.fill();
    } else if (type === "thunder") {
      // 雷符：电弧缠绕 + 雷光闪烁 + 符纸
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 雷光光晕
      const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
      tg.addColorStop(0, "rgba(255,233,92,.6)");
      tg.addColorStop(0.5, "rgba(255,220,60,.2)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      // 电弧（随机分叉闪电）
      ctx.strokeStyle = "rgba(255,248,200,.8)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        const mid = rand(8, 14);
        ctx.lineTo(Math.cos(a) * mid + rand(-4, 4), Math.sin(a) * mid + rand(-4, 4));
        ctx.lineTo(Math.cos(a) * (mid + 6) + rand(-6, 6), Math.sin(a) * (mid + 6) + rand(-6, 6));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      // 符纸
      ctx.fillStyle = "#ffe95c";
      ctx.strokeStyle = "#b8a020";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 雷纹
      ctx.fillStyle = "#fff8c8";
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(-3, 1);
      ctx.lineTo(1, 1);
      ctx.lineTo(-2, 10);
      ctx.lineTo(4, -2);
      ctx.lineTo(0, -2);
      ctx.closePath();
      ctx.fill();
    } else if (type === "swordarray") {
      // 万剑归宗：多把飞剑从空中俯冲，剑尖朝前，剑尾拖曳剑芒
      // 主体是一把领头剑，周围环绕 6 把跟随剑，整体朝飞行方向俯冲
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 中心剑阵光晕（金色）
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      sg.addColorStop(0, "rgba(255,205,92,.45)");
      sg.addColorStop(0.5, "rgba(255,170,60,.15)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      // 6 把环绕飞剑（剑尖朝前，尾部拖曳剑芒）
      const spin = this.age * 4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + spin;
        const r = 14;
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r * 0.6;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation + Math.sin(this.age * 3 + i) * 0.15);
        // 剑芒拖尾（金色）
        ctx.strokeStyle = "rgba(255,205,92,.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-24 - rand(0, 6), rand(-2, 2));
        ctx.stroke();
        // 剑身（剑尖朝前，金色）
        ctx.fillStyle = "#ffd25e";
        ctx.shadowColor = "#ffd25e";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-2, -2.5);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-2, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // 剑格（金色护手）
        ctx.strokeStyle = "#d8a03a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-2, -3.5);
        ctx.lineTo(-2, 3.5);
        ctx.stroke();
        ctx.restore();
      }
      // 领头主剑（更大更亮，金色）
      ctx.fillStyle = "#fff3c8";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 主剑剑脊
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();
      // 主剑剑格（金色护手）
      ctx.strokeStyle = "#d8a03a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.stroke();
      // 主剑剑柄（金色缠绳）
      ctx.strokeStyle = "#8a6a2a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-20, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "dragonpalm") {
      // 降龙十八掌：金龙沿飞行轨迹蜿蜒游动（动态龙身 + 背鳍 + 摆须龙首）
      const t = this.age;
      const tr = this.trail;
      // 节点：龙头 + 历史轨迹（越靠后越旧），换算到本地坐标
      const pts = [{ x: 0, y: 0 }];
      for (let i = tr.length - 1; i >= 0; i -= 2) pts.push({ x: tr[i].x - this.x, y: tr[i].y - this.y });
      const n = Math.max(2, pts.length);
      const headA = this.rotation;
      const px = Math.cos(headA + Math.PI / 2);
      const py = Math.sin(headA + Math.PI / 2);
      // 游动偏移：越靠近尾部摆动越大，形成“游动”波浪
      const pos = pts.map((p, i) => {
        const k = i / (n - 1);
        const sway = Math.sin(t * 11 - i * 0.8) * 10 * k;
        return { x: p.x + px * sway, y: p.y + py * sway, k };
      });
      ctx.globalCompositeOperation = "lighter";
      // 龙身周围的金色光晕
      const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, 48);
      dg.addColorStop(0, "rgba(255,190,90,.42)");
      dg.addColorStop(0.5, "rgba(255,120,50,.14)");
      dg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, TAU);
      ctx.fill();
      // 龙身：从尾到头逐段加粗，金色渐变 + 红色背鳍
      ctx.lineCap = "round";
      for (let i = n - 1; i >= 1; i--) {
        const a = pos[i];
        const b = pos[i - 1];
        ctx.strokeStyle = `rgba(255,${150 + Math.floor((1 - a.k) * 70)},${70 + Math.floor((1 - a.k) * 40)},${0.3 + (1 - a.k) * 0.45})`;
        ctx.lineWidth = 2.5 + (1 - a.k) * 6.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (i % 2 === 0 && i > 1) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dl = Math.hypot(dx, dy) || 1;
          const fx = -dy / dl;
          const fy = dx / dl;
          ctx.fillStyle = "rgba(255,90,50,.55)";
          ctx.beginPath();
          ctx.moveTo(mx + fx * 2, my + fy * 2);
          ctx.lineTo(mx - (dx / dl) * 4 + fx * 9, my - (dy / dl) * 4 + fy * 9);
          ctx.lineTo(mx - (dx / dl) * 8 + fx * 2, my - (dy / dl) * 8 + fy * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
      // 龙头（朝飞行方向）
      ctx.rotate(headA);
      const hornSway = Math.sin(t * 13) * 1.5;
      ctx.strokeStyle = "#ffd25e";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.quadraticCurveTo(-10, -9, -14, -12 + hornSway);
      ctx.moveTo(-3, 4);
      ctx.quadraticCurveTo(-10, 9, -14, 12 - hornSway);
      ctx.stroke();
      // 头颅 + 长吻
      ctx.fillStyle = "#ff8a5a";
      ctx.shadowColor = "#ff8a5a";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(2, 0, 9, 6.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, -4.5);
      ctx.lineTo(16, -2);
      ctx.lineTo(16, 2);
      ctx.lineTo(6, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 下颚
      ctx.strokeStyle = "#d85a30";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 4);
      ctx.quadraticCurveTo(12, 6.5 + Math.sin(t * 12) * 1.2, 16, 2);
      ctx.stroke();
      // 龙眼
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(4, -2.6, 1.8, 0, TAU);
      ctx.arc(4, 2.6, 1.8, 0, TAU);
      ctx.fill();
      // 龙须（随游动摆动）
      ctx.strokeStyle = "rgba(255,210,94,.7)";
      ctx.lineWidth = 1.2;
      const ws = Math.sin(t * 15) * 3;
      ctx.beginPath();
      ctx.moveTo(14, -1);
      ctx.quadraticCurveTo(22, -5 + ws, 27, -8 + ws);
      ctx.moveTo(14, 1);
      ctx.quadraticCurveTo(22, 5 - ws, 27, 8 - ws);
      ctx.stroke();
      // 龙吻前的能量珠
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(19, 0, 3.5 + Math.sin(t * 10) * 0.8, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "shieldcharm") {
      // 护体符：金光护盾 + 旋转符文 + 六边形光阵
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 金光光晕
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
      hg.addColorStop(0, "rgba(255,210,94,.5)");
      hg.addColorStop(0.5, "rgba(255,200,80,.18)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      // 六边形光阵
      ctx.strokeStyle = "rgba(255,230,150,.5)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + this.age * 2;
        const px = Math.cos(a) * 14;
        const py = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      // 旋转符文点
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - this.age * 3;
        ctx.fillStyle = "rgba(255,240,180,.7)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 18, Math.sin(a) * 18, 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // 符纸本体
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, -4);
      ctx.lineTo(8, 4);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-8, -4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff8c8";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
    } else if (type === "soulchain") {
      // 锁魂链：从施法者手上甩出的一节节链环，末端是鬼火钩爪
      let ox = this.ox;
      let oy = this.oy;
      if (this.owner && this.owner.alive) {
        ox = this.owner.x;
        oy = this.owner.y - 44;
      }
      const ex = this.x;
      const ey = this.y;
      const dist = Math.hypot(ex - ox, ey - oy);
      if (dist > 6) {
        const sag = Math.min(14, dist * 0.07);
        const cx = (ox + ex) / 2;
        const cy = (oy + ey) / 2 + sag;
        const qp = (t) => {
          const u = 1 - t;
          return {
            x: u * u * ox + 2 * u * t * cx + t * t * ex,
            y: u * u * oy + 2 * u * t * cy + t * t * ey,
          };
        };
        const segs = Math.max(3, Math.min(20, Math.round(dist / 13)));
        ctx.save();
        ctx.lineCap = "round";
        // 链节之间的连接段
        for (let i = 0; i < segs; i++) {
          const p0 = qp(i / segs);
          const p1 = qp((i + 1) / segs);
          ctx.strokeStyle = "rgba(140,100,200,.45)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        // 交替方向的椭圆链环（一环扣一环）
        for (let i = 0; i <= segs; i++) {
          const p = qp(i / segs);
          const pn = qp(Math.min(1, (i + 0.5) / segs));
          const ang = Math.atan2(pn.y - p.y, pn.x - p.x);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0));
          ctx.strokeStyle = i % 2 ? "#b48ce8" : "#d8b8ff";
          ctx.lineWidth = 2.1;
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.6, 3.2, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
      // 手端固定环（链条从施法者手上长出）
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = "#8a5ab8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
      // 末端鬼火钩爪
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(this.rotation + Math.sin(this.age * 9) * 0.25);
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
      hg.addColorStop(0, "rgba(180,140,232,.55)");
      hg.addColorStop(0.5, "rgba(140,100,200,.18)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // 锚形双钩
      ctx.strokeStyle = "#e0ccff";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, -4.5, 4.5, Math.PI * 0.15, Math.PI * 1.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, 4.5, 4.5, -Math.PI * 1.05, -Math.PI * 0.15);
      ctx.stroke();
      // 魂火核心
      ctx.fillStyle = "#b48ce8";
      ctx.shadowColor = "#b48ce8";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#f0e0ff";
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (type === "teleport") {
      // 瞬移：蓝色空间裂缝 + 粒子流
      ctx.globalCompositeOperation = "lighter";
      const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
      tg.addColorStop(0, "rgba(111,232,255,.6)");
      tg.addColorStop(0.5, "rgba(80,180,255,.2)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();
      // 空间裂缝（菱形）
      ctx.strokeStyle = "rgba(200,240,255,.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.stroke();
      // 粒子流
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU);
        ctx.fillStyle = "rgba(180,240,255,.5)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rand(8, 16), Math.sin(a) * rand(8, 16), 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "poisonmist") {
      // 毒雾术：绿色毒雾球 + 气泡
      ctx.globalCompositeOperation = "lighter";
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
      pg.addColorStop(0, "rgba(138,255,106,.5)");
      pg.addColorStop(0.5, "rgba(100,200,80,.2)");
      pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      // 毒雾核心
      ctx.fillStyle = "#8aff6a";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      // 气泡
      for (let i = 0; i < 5; i++) {
        const a = rand(0, TAU);
        const r = rand(4, 12);
        ctx.fillStyle = "rgba(180,255,150,.4)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "heal") {
      // 回春术：绿色生命之光 + 叶子
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      hg.addColorStop(0, "rgba(106,255,168,.55)");
      hg.addColorStop(0.5, "rgba(80,220,130,.2)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      // 生命十字
      ctx.fillStyle = "#6affa8";
      ctx.fillRect(-2, -8, 4, 16);
      ctx.fillRect(-8, -2, 16, 4);
      // 环绕叶子
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + this.age * 2;
        ctx.fillStyle = "rgba(150,255,190,.6)";
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 12, Math.sin(a) * 12, 3, 1.5, a, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "storm") {
      // 呼风唤雨：蓝色风暴漩涡
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
      sg.addColorStop(0, "rgba(106,200,255,.5)");
      sg.addColorStop(0.5, "rgba(80,150,220,.2)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();
      // 风暴漩涡（螺旋线）
      ctx.strokeStyle = "rgba(180,230,255,.6)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.1) {
          const a = t * TAU * 2 + this.age * 5 + i * 2;
          const r = 4 + t * 12;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "skylightning") {
      // 天雷灭世：白色雷球 + 闪电
      ctx.globalCompositeOperation = "lighter";
      const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      lg.addColorStop(0, "rgba(255,255,255,.7)");
      lg.addColorStop(0.4, "rgba(255,248,200,.3)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      // 核心
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      // 闪电分叉
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rand(10, 20), Math.sin(a) * rand(10, 20));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "formation") {
      // 诛仙阵：红色剑阵 + 符文
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
      fg.addColorStop(0, "rgba(255,106,154,.5)");
      fg.addColorStop(0.5, "rgba(200,60,100,.2)");
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, TAU);
      ctx.fill();
      // 四把红色巨剑（十字排列）
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + this.age * 3;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = "#ff6a9a";
        ctx.shadowColor = "#ff6a9a";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(3, 8);
        ctx.lineTo(0, 12);
        ctx.lineTo(-3, 8);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      // 中心符文
      ctx.strokeStyle = "rgba(255,200,220,.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 6 + Math.sin(this.age * 6) * 2, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }
}
