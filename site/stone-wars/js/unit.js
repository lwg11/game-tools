/** 石器大战 · 单位实体（玩家 / 敌人） */
import { ENEMY_TYPES } from "./levels.js";
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
    // 状态效果：护盾（抵挡伤害）、减速（移动变慢）、定身（无法移动）
    this.shield = 0;       // 护盾值，抵挡等量伤害
    this.shieldT = 0;      // 护盾持续时间
    this.slowT = 0;        // 减速剩余时间
    this.slowMul = 0.5;    // 减速系数
    this.stunT = 0;        // 定身剩余时间
    this.slowSrc = null;   // 减速来源（soulchain=锁魂链缠绕）
    this.poisonT = 0;      // 中毒剩余时间
    this.poisonDps = 0;    // 中毒每秒伤害
    this.regenT = 0;       // 回血剩余时间
    this.regenRate = 0;    // 回血速率
    this.flyT = 0;         // 飞行剩余时间（修仙模式）
    this.hoverH = 0;       // 悬浮高度（修仙模式）
    this.prevHp = hp;      // 上一回合血量（补天术用）
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
    // 状态效果计时
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowSrc = null;
    }
    if (this.stunT > 0) this.stunT -= dt;
    if (this.poisonT > 0) {
      this.poisonT -= dt;
      this.poisonTick = (this.poisonTick || 0) - dt;
      if (this.poisonTick <= 0) {
        this.poisonTick = 0.5;
        this.hp = Math.max(0, this.hp - this.poisonDps * 0.5);
        if (this.hp <= 0) { this.die(); return; }
      }
    }
    if (this.regenT > 0) {
      this.regenT -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);
    }
    // 定身时无法移动
    if (this.stunT > 0) {
      this.vx = 0;
      if (!this.onGround) this.vy += 1500 * dt;
      else this.vy = 0;
      return;
    }
    // 修仙模式：悬浮飞行（hoverH 表示悬浮高度）
    if (this.era === "cultivation" && this.game.era && this.game.era.id === "cultivation") {
      this.hoverH = 8 + Math.sin(this.game.time * 2 + this.index) * 3;
    } else {
      this.hoverH = 0;
    }
    const slow = this.slowT > 0 ? this.slowMul : 1;
    if (this.onGround) {
      // 动态平台承载：单位站在浮空岛/云朵上时，随平台一起移动
      const plat = this.game.terrain.platformUnder(this.x, this.y);
      if (plat) {
        const rect = this.game.terrain._platformRect(plat);
        // 平台表面跟随（上下悬浮）
        this.y = rect.y;
        // 平台水平漂移带动单位
        if (plat._lastRect) this.x += rect.x - plat._lastRect.x;
        this.vy = 0;
        this.groundPlatform = plat;
      } else {
        // 离开平台（平台移走了或单位走下平台）
        if (this.groundPlatform) {
          this.groundPlatform = null;
          this.onGround = false;
        }
        const gy = this.game.terrain.surfaceBelow(this.x, this.y - 8);
        if (gy === null || gy > this.y + 6) this.onGround = false;
      }
    }
    if (!this.onGround) {
      // 修仙模式：御剑飞行，重力减小，空中可自由移动
      const isCult = this.era === "cultivation";
      this.vy += (isCult ? 600 : 1500) * dt;
      const ny = this.y + this.vy * dt;
      // 空中水平移动（斜跳）：直接修改 x，不触发落地逻辑
      if (this.vx !== 0) {
        const dx = this.vx * dt;
        const nx = clamp(this.x + dx, 14, W - 14);
        // 检查是否被墙挡住：挡住时只阻止位移，不立即清零 vx，让斜跳惯性保留
        if (!this.game.terrain.solidAt(nx, this.y - 12) && !this.game.terrain.solidAt(nx, this.y - 34)) {
          this.x = nx;
        }
        // 衰减：空中水平速度缓慢衰减，保证斜跳连贯（修仙模式衰减更慢）
        this.vx *= Math.pow(isCult ? 0.85 : 0.55, dt);
        if (Math.abs(this.vx) < 8) this.vx = 0;
      }
      // 修仙模式：飞行时不会坠落太快，可以悬浮
      if (isCult && this.vy > 200) this.vy = 200;
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
    const slow = this.slowT > 0 ? this.slowMul : 1;
    dx *= slow;
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
    // 定身状态无法跳跃
    if (this.stunT > 0) return false;
    // 回合制：移动预算耗尽后不能跳跃（防止「不能移动却跳到对面」的 bug）
    if (!this.game.cheatRealtime && this.game.turnTeam === 0 && this.team === 0 && this.game.moveBudget <= 0) {
      return false;
    }
    // 修仙模式：跳跃更高（御剑飞行）
    const isCult = this.era === "cultivation";
    this.vy = isCult ? -620 : -470;
    this.onGround = false;
    // 斜跳：给一个水平初速度
    if (dir !== 0) {
      this.vx = dir * (isCult ? 320 : 220);
      this.facing = dir;
    }
    this.game.sfx.jump();
    return true;
  }

  takeDamage(amount, sourceTeam) {
    if (!this.alive) return;
    if (this.team === 0 && this.game.cheatGod) return;
    // 护盾抵挡：优先消耗护盾值
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (this.shield <= 0) this.shieldT = 0;
      if (amount <= 0) {
        this.game.addText(this.x, this.y - 72, "格挡", "#ffd25e");
        this.game.sfx.hit();
        return;
      }
    }
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
    // 脚下阴影（飞行时阴影留在地面）
    const mounted = this.mount && this.alive;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, (mounted ? 25 : 17) * this.scale, 5, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y - this.hoverH);
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

    // 锁魂链缠绕：被锁魂链命中减速时，紫色锁链捆住躯干
    if (this.alive && this.slowT > 0 && this.slowSrc === "soulchain") {
      const pulse = 0.7 + Math.sin(t * 8) * 0.25;
      ctx.save();
      ctx.globalAlpha = fade * pulse;
      for (let r = 0; r < 3; r++) {
        const yy = -44 + r * 12;
        const wob = Math.sin(t * 5 + r * 1.7) * 1.6;
        // 缠绕的一圈锁链
        ctx.strokeStyle = r % 2 ? "#d8b8ff" : "#8a5ab8";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.ellipse(wob * 0.4, yy, 15 - r * 1.5, 5.5, 0, 0.12, Math.PI - 0.12);
        ctx.stroke();
        // 链环节点
        ctx.fillStyle = r % 2 ? "#b48ce8" : "#d8b8ff";
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.arc(wob * 0.4 + k * 5.2, yy + (Math.abs(k) % 2 ? 2.2 : -2.2), 1.5, 0, TAU);
          ctx.fill();
        }
      }
      // 末端魂火
      ctx.globalCompositeOperation = "lighter";
      const cg = ctx.createRadialGradient(0, -40, 0, 0, -40, 16);
      cg.addColorStop(0, "rgba(180,140,232,.5)");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, -40, 16, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // 血条（不随角色翻转）
    if (this.alive) {
      const bw = 46;
      const bx = this.x - bw / 2;
      const by = this.y - (this.mount ? 106 : this.type === "chief" ? 96 : 86);
      // 半透明底 + 细亮边，不遮挡画面
      ctx.fillStyle = "rgba(16,18,24,.42)";
      this._roundRect(ctx, bx - 1, by - 1, bw + 2, 7, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 1;
      this._roundRect(ctx, bx - 1, by - 1, bw + 2, 7, 3);
      ctx.stroke();
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
