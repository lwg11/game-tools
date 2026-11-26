/**
 * 石器大战 · 回合制物理对战 · 实体类（从 game.js 原样搬移）
 */
import { ENEMY_TYPES, WEAPONS } from "./levels.js";
import { H, TAU, W, clamp, rand } from "./common.js";
export class Unit {
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
    this.vx = 0;
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
    this.era = game.era ? game.era.id : "stone";
    this.mount = team === 1 && Boolean(cfg.mount);
    this.visor = Boolean(cfg.visor);
    if (team === 0) {
      this.skin = "#e2a06b";
      this.cloth = { stone: "#e8892c", iron: "#8c99a6", gun: "#b5533a", mech: "#2f7f8c", cultivation: "#7a5ac8" }[this.era] || "#e8892c";
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
      // 空中水平移动（斜跳）：直接修改 x，不触发落地逻辑
      if (this.vx !== 0) {
        const dx = this.vx * dt;
        const nx = clamp(this.x + dx, 14, W - 14);
        // 检查是否被墙挡住：挡住时只阻止位移，不立即清零 vx，让斜跳惯性保留
        if (!this.game.terrain.solidAt(nx, this.y - 12) && !this.game.terrain.solidAt(nx, this.y - 34)) {
          this.x = nx;
        }
        // 衰减：空中水平速度缓慢衰减，保证斜跳连贯
        this.vx *= Math.pow(0.55, dt);
        if (Math.abs(this.vx) < 8) this.vx = 0;
      }
      if (this.vy > 0) {
        const gy = this.game.terrain.surfaceBelow(this.x, this.y + 1);
        if (gy !== null && ny >= gy) {
          this.y = gy;
          this.vy = 0;
          this.vx = 0;
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

  /**
   * 跳跃：如果正在移动（键盘或触摸），则向斜上方跳跃
   * @param {number} [dir=0] 水平方向：-1 左，1 右，0 垂直
   */
  jump(dir = 0) {
    if (!this.alive || !this.onGround) return false;
    this.vy = -470;
    this.onGround = false;
    // 斜跳：给一个水平初速度
    if (dir !== 0) {
      this.vx = dir * 220;
      this.facing = dir;
    }
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
    const mounted = this.mount && this.alive;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, (mounted ? 25 : 17) * this.scale, 5, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    if (!this.alive) {
      ctx.translate(0, 6);
      ctx.rotate(face * 1.25);
    }
    ctx.scale(face * this.scale, this.scale);

    const moving = this.onGround && Math.abs(this.moveSpeed) > 3;
    if (mounted) {
      this._drawMount(ctx, moving, t);
      ctx.translate(0, -26);
    }
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

    // 时代装束：铁甲肩甲 / 火器军装 / 机械外骨骼
    if (this.era === "iron" || this.era === "gun" || this.era === "mech") {
      ctx.fillStyle = this.era === "mech" ? "#3d6d78" : this.era === "iron" ? "#7d8894" : "#8f4335";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-11, -36, 6.5, 4.5, -0.3, 0, TAU);
      ctx.ellipse(11, -36, 6.5, 4.5, 0.3, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (this.era === "gun") {
        // 军装排扣
        ctx.fillStyle = "#ffcf7a";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, -34 + i * 6, 1.4, 0, TAU);
          ctx.fill();
        }
      } else if (this.era === "mech") {
        // 胸口能量核心
        ctx.fillStyle = "#7ff0ff";
        ctx.globalAlpha = fade * (0.65 + Math.sin(t * 5) * 0.2);
        ctx.beginPath();
        ctx.arc(0, -31, 3.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = fade;
      }
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

    if (this.era === "iron") {
      // 铁盔 + 护鼻
      ctx.fillStyle = this.team === 0 ? "#a9b6c3" : "#67737f";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -52, 12, Math.PI * 1.03, Math.PI * 1.97);
      ctx.lineTo(-11, -45);
      ctx.lineTo(11, -45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#4d5964";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -59);
      ctx.lineTo(0, -50);
      ctx.lineTo(4, -47);
      ctx.stroke();
      ctx.fillStyle = this.team === 0 ? "#ffcf7a" : "#c96a5a";
      ctx.beginPath();
      ctx.moveTo(-11, -50);
      ctx.lineTo(-18, -56);
      ctx.lineTo(-13, -57);
      ctx.closePath();
      ctx.fill();
    } else if (this.era === "gun") {
      // 军帽 + 帽檐
      ctx.fillStyle = this.team === 0 ? "#7c3b2c" : "#3f3f46";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -54);
      ctx.quadraticCurveTo(0, -66, 12, -54);
      ctx.lineTo(13, -49);
      ctx.lineTo(-13, -49);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.team === 0 ? "#5f2a1e" : "#2b2b30";
      ctx.beginPath();
      ctx.ellipse(3, -49, 15, 3.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffd58a";
      ctx.beginPath();
      ctx.arc(0, -56, 2, 0, TAU);
      ctx.fill();
    } else if (this.era === "mech") {
      // 全封闭头盔与发光面罩
      ctx.fillStyle = this.team === 0 ? "#3f8794" : "#4d5b6b";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -50, 12.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.visor ? "#ff6f8a" : "#7ff0ff";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-8, -53, 16, 5, 2.5) : ctx.rect(-8, -53, 16, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // 石器时代：野人头发与头带
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

      ctx.strokeStyle = this.team === 0 ? "#d97722" : "#6b2e24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -50, 11.6, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    // 眼睛 / 眉毛 / 鼻子 / 胡子（机械头盔用面罩替代五官）
    if (this.era !== "mech") {
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
    }

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
      const by = this.y - (this.mount ? 106 : this.type === "chief" ? 96 : 86);
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

  /** 铁骑时代的战马：四腿交替、鬃毛与鞍具 */
  _drawMount(ctx, moving, t) {
    const gait = moving ? Math.sin(this.walkPhase * 1.35) : Math.sin(t * 2) * 0.25;
    ctx.strokeStyle = "#4a3426";
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const lx = -14 + i * 9;
      const swing = (i % 2 === 0 ? gait : -gait) * 7;
      ctx.lineWidth = i < 2 ? 4.4 : 3.8;
      ctx.beginPath();
      ctx.moveTo(lx, -20);
      ctx.lineTo(lx + swing, -3);
      ctx.stroke();
    }
    ctx.fillStyle = "#6b4a33";
    ctx.strokeStyle = "#2f2018";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -24, 21, 11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // 颈与头
    ctx.beginPath();
    ctx.moveTo(13, -30);
    ctx.quadraticCurveTo(24, -40, 23, -48);
    ctx.lineTo(30, -47);
    ctx.quadraticCurveTo(31, -38, 22, -27);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a281c";
    ctx.beginPath();
    ctx.moveTo(23, -48);
    ctx.lineTo(30, -47);
    ctx.lineTo(31, -43);
    ctx.lineTo(24, -43);
    ctx.closePath();
    ctx.fill();
    // 鬃毛
    ctx.strokeStyle = "#2b1c14";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, -32);
    ctx.quadraticCurveTo(18, -42, 23, -46);
    ctx.stroke();
    // 尾巴
    ctx.beginPath();
    ctx.moveTo(-20, -27);
    ctx.quadraticCurveTo(-30, -24, -28, -14);
    ctx.stroke();
    // 鞍毯与铁甲
    ctx.fillStyle = "#a3442e";
    ctx.beginPath();
    ctx.ellipse(0, -32, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#7d8894";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -30, 9, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
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
    this.fuse = this.kind === "grenade" ? this.weapon.fuse
      : type === "bananaSmall" ? 0.9 : null;
    this.r = this.kind === "boulder" ? 8 : this.kind === "spike" ? 9 : this.kind === "spear" ? 4 : 6;
    // 修仙武器：飞行时散发灵气粒子
    this.auraT = 0;
    this.auraColor = {
      sword: "#a8d8ff", fireball: "#ff8a4a", thunder: "#ffe95c",
      swordarray: "#a8d8ff", dragonpalm: "#ff8a5a", shieldcharm: "#ffd25e",
      soulchain: "#b48ce8",
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
      // 中心剑阵光晕
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      sg.addColorStop(0, "rgba(168,216,255,.45)");
      sg.addColorStop(0.5, "rgba(120,180,255,.15)");
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
        // 剑芒拖尾
        ctx.strokeStyle = "rgba(168,216,255,.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-24 - rand(0, 6), rand(-2, 2));
        ctx.stroke();
        // 剑身（剑尖朝前）
        ctx.fillStyle = "#a8d8ff";
        ctx.shadowColor = "#a8d8ff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-2, -2.5);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-2, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // 剑格
        ctx.strokeStyle = "#8ab8d8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-2, -3.5);
        ctx.lineTo(-2, 3.5);
        ctx.stroke();
        ctx.restore();
      }
      // 领头主剑（更大更亮）
      ctx.fillStyle = "#e8f4ff";
      ctx.shadowColor = "#a8d8ff";
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
      // 主剑剑格
      ctx.strokeStyle = "#8ab8d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.stroke();
      // 主剑剑柄
      ctx.strokeStyle = "#5a7a9a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-20, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (type === "dragonpalm") {
      // 降龙十八掌：金色巨龙蜿蜒前行，龙首冲撞，龙身九曲，龙尾拖曳
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 龙身光晕
      const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
      dg.addColorStop(0, "rgba(255,180,80,.4)");
      dg.addColorStop(0.5, "rgba(255,120,50,.15)");
      dg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.fill();
      // 龙身（波浪形，从龙尾到龙首逐渐变粗）
      const segs = 24;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const px = -50 + t * 60;
        const py = Math.sin(t * 10 + this.age * 12) * 7 * (1 - t * 0.5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      // 龙身渐变描边（粗→细）
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const x0 = -50 + t0 * 60;
        const y0 = Math.sin(t0 * 10 + this.age * 12) * 7 * (1 - t0 * 0.5);
        const x1 = -50 + t1 * 60;
        const y1 = Math.sin(t1 * 10 + this.age * 12) * 7 * (1 - t1 * 0.5);
        const w = 2 + t0 * 5;
        ctx.strokeStyle = `rgba(255,${160 + Math.floor(t0 * 60)},${60 + Math.floor(t0 * 40)},${0.3 + t0 * 0.4})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      // 龙首（三角形，朝前）
      const headX = 12;
      const headY = Math.sin(this.age * 12) * 2;
      ctx.fillStyle = "#ff8a5a";
      ctx.shadowColor = "#ff8a5a";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(headX + 10, headY);
      ctx.lineTo(headX - 4, headY - 8);
      ctx.lineTo(headX - 8, headY);
      ctx.lineTo(headX - 4, headY + 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 龙角
      ctx.strokeStyle = "#ffd25e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX - 2, headY - 6);
      ctx.lineTo(headX - 6, headY - 12);
      ctx.moveTo(headX - 2, headY + 6);
      ctx.lineTo(headX - 6, headY + 12);
      ctx.stroke();
      // 龙眼
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(headX + 2, headY - 2, 1.8, 0, TAU);
      ctx.arc(headX + 2, headY + 2, 1.8, 0, TAU);
      ctx.fill();
      // 龙须
      ctx.strokeStyle = "rgba(255,210,94,.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(headX + 8, headY);
      ctx.quadraticCurveTo(headX + 16, headY - 4 + Math.sin(this.age * 15) * 3, headX + 22, headY - 6);
      ctx.moveTo(headX + 8, headY);
      ctx.quadraticCurveTo(headX + 16, headY + 4 - Math.sin(this.age * 15) * 3, headX + 22, headY + 6);
      ctx.stroke();
      // 龙珠（龙首前方的能量球）
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(headX + 14, headY, 5, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(headX + 14, headY, 2.5, 0, TAU);
      ctx.fill();
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
      // 锁魂链：锁链节段 + 紫色魂火 + 链节拖尾
      ctx.rotate(this.rotation);
      ctx.globalCompositeOperation = "lighter";
      // 魂火光晕
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      cg.addColorStop(0, "rgba(180,140,232,.5)");
      cg.addColorStop(0.5, "rgba(140,100,200,.18)");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      // 锁链拖尾（节段状）
      for (let i = 0; i < 5; i++) {
        const a = 0.3 - i * 0.06;
        ctx.strokeStyle = `rgba(180,140,232,${a})`;
        ctx.lineWidth = 3 - i * 0.4;
        ctx.beginPath();
        ctx.moveTo(-6 - i * 5, 0);
        ctx.quadraticCurveTo(-14 - i * 6, rand(-4, 4), -22 - i * 7, rand(-5, 5));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      // 链环本体
      ctx.strokeStyle = "#b48ce8";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.stroke();
      // 链刺
      ctx.strokeStyle = "#8a5ab8";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + this.age * 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
      // 魂火核心
      ctx.fillStyle = "#d8b8ff";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
