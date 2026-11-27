/**
 * 石器大战 · 修仙神通模块
 * ------------------------------------------------------------
 * 万剑归宗（金色剑雨）/ 天雷灭世（天降雷霆）/ 诛仙阵（苍穹巨剑）/ 毒雾术（浓雾中毒）
 * 以 mixin 形式挂载到 StoneWars 原型，方法内通过 this 访问游戏实例状态。
 */
import { H, TAU, W, clamp, rand } from "./common.js";
import { WEAPONS } from "./levels.js";

// 剑形绘制调色板：万剑归宗=金色，诛仙阵=粉紫，默认冰蓝
const SWORD_GOLD = { blade: "#ffe9a8", glow: "#ffcf5c", edge: "rgba(255,243,200,.95)", guard: "#d8a03a", grip: "#8a6a2a", orb: "#ffd25e" };
const SWORD_VIOLET = { blade: "#ffd8e8", glow: "#ff6a9a", edge: "rgba(255,255,255,.95)", guard: "#d86a9a", grip: "#8a4a6a", orb: "#ff8ab8" };

export function mountCultivation(StoneWars) {
  Object.assign(StoneWars.prototype, {
    /**
     * 万剑归宗（嬴政大招）：飞剑从施法者身体飞出，呈抛物线剑雨打击目标范围。
     * 每把剑独立飞行、穿透伤害，落地后插在地上过一会消失。
     */
    spawnSwordRain(x, y, team, damage, blast, weaponType) {
      const caster = team === 0 ? this._activePlayer() : this._activeEnemy();
      // 起始位置：施法者身体中心
      const srcX = caster ? caster.x : x;
      const srcY = caster ? caster.y - 30 : y - 60;
      const count = 15;
      // 重力加速度（与 _updateSwordRain 一致）
      const G = 1400;
      for (let i = 0; i < count; i++) {
        // 每把剑的落点：目标区域内随机
        const spread = 120;
        const tx = x + rand(-spread, spread);
        const ty = y + rand(-40, 60);
        // 飞行时间：1.2~2.0 秒（依次飞出，形成剑雨层次）
        const flightTime = 1.2 + (i / count) * 0.8 + rand(0, 0.2);
        // 根据抛物线公式计算初速度：
        // x(t) = srcX + vx * t  =>  vx = (tx - srcX) / flightTime
        // y(t) = srcY + vy * t + 0.5 * G * t^2  =>  vy = (ty - srcY - 0.5 * G * flightTime^2) / flightTime
        const vx = (tx - srcX) / flightTime;
        const vy = (ty - srcY - 0.5 * G * flightTime * flightTime) / flightTime;
        // 延迟：依次飞出，形成剑雨层次
        const delay = i * 0.08 + rand(0, 0.05);
        this.swordRain.push({
          x: srcX, y: srcY,
          sx: srcX, sy: srcY,
          tx, ty,
          vx, vy,
          delay,
          age: 0,
          damage,
          blast: Math.max(60, blast),
          team,
          weaponType,
          hitSet: new Set(),
          stuck: false,      // 是否已插地
          stuckT: 0,         // 插地时间
          stuckAngle: 0,     // 插地角度
        });
      }
      // 启动特效：施法者处剑光冲天
      if (caster) {
        this.rings.push({ x: caster.x, y: caster.y - 30, r: 8, max: 100, t: 0, life: 0.35, color: "rgba(255,205,92,.7)" });
        this.spawnParticles(caster.x, caster.y - 30, 24, "#ffd25e", "spark");
      }
      this.sfx.shoot("swordarray");
    },

    /** 更新剑雨中的飞剑：穿透伤害 + 落地插地 */
    _updateSwordRain(dt) {
      if (!this.swordRain.length) return;
      for (let i = this.swordRain.length - 1; i >= 0; i--) {
        const s = this.swordRain[i];
        // 已插地：计时消失
        if (s.stuck) {
          s.stuckT += dt;
          if (s.stuckT > 1.6) this.swordRain.splice(i, 1);
          continue;
        }
        if (s.delay > 0) { s.delay -= dt; continue; }
        s.age += dt;
        // 重力加速下落
        s.vy += 1400 * dt;
        // 子步进防止穿透
        const steps = clamp(Math.ceil(Math.hypot(s.vx, s.vy) * dt / 6), 1, 8);
        let stuck = false;
        for (let step = 0; step < steps && !stuck; step++) {
          const h = dt / steps;
          s.x += s.vx * h;
          s.y += s.vy * h;
          // 穿透伤害：每把剑可穿透多个敌人
          for (const u of this.units) {
            if (!u.alive || u.team === s.team || s.hitSet.has(u)) continue;
            const dx = s.x - u.x;
            const dy = s.y - (u.y - 28);
            const rr = 20 * (u.scale || 1);
            if (dx * dx + dy * dy < rr * rr) {
              s.hitSet.add(u);
              u.takeDamage(s.damage, s.team);
              // 穿透剑气粒子（金色）
              this.spawnParticles(s.x, s.y, 6, "#ffd25e", "spark");
            }
          }
          // 命中地形：插地
          if (this.terrain && this.terrain.circleHit(s.x, s.y, 4)) {
            s.stuck = true;
            s.stuckT = 0;
            s.stuckAngle = Math.atan2(s.vy, s.vx);
            // 插地冲击波（金色）
            this.rings.push({ x: s.x, y: s.y, r: 4, max: 30, t: 0, life: 0.2, color: "rgba(255,205,92,.6)" });
            this.spawnParticles(s.x, s.y, 8, "#ffd25e", "spark");
            this.terrain.carve(s.x, s.y, s.blast * 0.3, s.damage * 0.5);
            this.terrainDirty = true;
            stuck = true;
            break;
          }
        }
        if (stuck) continue;
        // 剑尾灵气粒子
        if (Math.random() < 0.7) {
          this.particles.push({
            x: s.x + rand(-2, 2), y: s.y - 8 + rand(-2, 2),
            vx: rand(-10, 10), vy: rand(-30, -5),
            life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1.5, 3),
            color: "#ffd25e", kind: "spark", gravity: -20,
          });
        }
        if (s.age > 5 || s.y > H + 60 || s.x < -100 || s.x > W + 100) {
          this.swordRain.splice(i, 1);
        }
      }
    },

    /**
     * 范围伤害与状态效果（爆炸 / 天雷 / 剑阵 / 毒雾共用）。
     * opts.slow / opts.poison 为状态配置，opts.knock 控制是否击飞。
     */
    _damageUnitsInRadius(x, y, radius, damage, team, opts = {}) {
      const diff = this._difficulty();
      for (const u of this.units) {
        if (!u.alive) continue;
        // 以单位命中胶囊上离爆点最近的位置计算距离，爆头也能打满伤害
        const s = u.scale || 1;
        const topY = u.y - (u.mount ? 76 : 63) * s;
        const cy = clamp(y, topY, u.y - 6);
        const dx = u.x - x;
        const dy = cy - y;
        const d = Math.hypot(dx, dy);
        const reach = radius + 16;
        if (d >= reach) continue;
        const f = 1 - d / reach;
        let dmg = Math.max(4, Math.round(damage * (0.35 + 0.65 * f)));
        if (team === 1 && u.team === 0) dmg = Math.round(dmg * diff.dmg);
        u.takeDamage(dmg, team);
        if (u.alive && opts.knock !== false) {
          u.vy = -Math.min(360, 70 + f * damage * 2.4);
          u.onGround = false;
          u.vx += Math.sign(dx || 1) * f * 60;
        }
        if (opts.slow && u.alive) {
          u.slowT = Math.max(u.slowT, opts.slow.dur);
          u.slowMul = opts.slow.mul;
          if (opts.slowSrc) u.slowSrc = opts.slowSrc;
          this.addText(u.x, u.y - 92, "减速", "#b48ce8");
        }
        if (opts.poison && u.alive) {
          u.poisonT = Math.max(u.poisonT, opts.poison.dur);
          u.poisonDps = opts.poison.dps;
          this.addText(u.x, u.y - 92, "中毒", "#8aff6a");
        }
      }
    },

    // ------------------------------------------------------------ 天雷灭世：天降雷霆
    /** 引雷子落点处，大范围内降下多道雷霆（不摧毁地形） */
    spawnSkyLightning(x, y, team, damage, blast) {
      if (!this.terrain) return;
      const R = Math.max(120, blast || 160);
      const hitSet = new Set();
      const cx = clamp(x, 30, W - 30);
      const groundAt = (px) => this.terrain.surfaceBelow(px, 0) ?? (H - 60);
      // 中心主雷
      this.skyBolts.push({
        tx: cx, ty: groundAt(cx), delay: 0, t: 0, dur: 0.32,
        struck: false, main: true, segs: null,
        team, damage, radius: Math.max(90, R * 0.62), hitSet,
      });
      // 周围随机落雷，形成大范围雷暴
      const count = 14;
      for (let i = 0; i < count; i++) {
        const tx = clamp(cx + rand(-R, R) * rand(0.25, 1), 20, W - 20);
        this.skyBolts.push({
          tx, ty: groundAt(tx),
          delay: 0.06 + i * 0.05 + rand(0, 0.05),
          t: 0, dur: rand(0.16, 0.24),
          struck: false, main: false, segs: null,
          team, damage, radius: Math.max(56, R * 0.34), hitSet,
        });
      }
      this.shake = Math.max(this.shake, 14);
      this.screenFlash = Math.max(this.screenFlash, 0.4);
      this.flashColor = "#fff8c8";
      this.sfx.shoot("skylightning");
    },

    /** 更新天雷：到点劈落，落点范围伤害 */
    _updateSkyBolts(dt) {
      if (!this.skyBolts.length) return;
      for (let i = this.skyBolts.length - 1; i >= 0; i--) {
        const b = this.skyBolts[i];
        b.t += dt;
        if (!b.struck && b.t >= b.delay) {
          b.struck = true;
          b.segs = this._makeBoltSegments(b.tx, b.ty, b.main ? 26 : 14);
          this.rings.push({ x: b.tx, y: b.ty, r: 6, max: b.radius * 1.6, t: 0, life: 0.22, color: "rgba(255,248,200,.8)" });
          this.spawnParticles(b.tx, b.ty - 4, b.main ? 22 : 10, "#fff8c8", "spark");
          this._damageUnitsInRadius(b.tx, b.ty, b.radius, b.damage * (b.main ? 1 : 0.42), b.team, {});
          this.shake = Math.max(this.shake, b.main ? 10 : 5);
          if (b.main) {
            this.screenFlash = Math.max(this.screenFlash, 0.36);
            this.flashColor = "#ffffff";
          }
        }
        if (b.t > b.delay + b.dur + 0.12) this.skyBolts.splice(i, 1);
      }
    },

    /** 生成一道竖直闪电的锯齿折线（顶部在画面外） */
    _makeBoltSegments(tx, ty, jitter = 14) {
      const segs = [];
      const top = -30;
      const n = Math.max(4, Math.floor((ty - top) / 46));
      for (let i = 0; i <= n; i++) {
        const yy = top + ((ty - top) * i) / n;
        const xx = i === 0 || i === n ? tx : tx + rand(-jitter, jitter);
        segs.push({ x: xx, y: yy });
      }
      return segs;
    },

    /** 绘制天雷：高亮闪电柱 + 落点辉光 */
    _drawSkyBolts(ctx) {
      if (!this.skyBolts.length) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of this.skyBolts) {
        if (!b.struck || !b.segs) continue;
        const k = clamp(1 - (b.t - b.delay) / b.dur, 0, 1);
        const layers = [
          [b.main ? 7 : 4.5, `rgba(255,240,160,${0.35 * k})`],
          [b.main ? 3 : 2, `rgba(255,255,255,${0.9 * k})`],
        ];
        for (const [lw, col] of layers) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.lineJoin = "round";
          ctx.beginPath();
          b.segs.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(b.tx, b.ty, 0, b.tx, b.ty, b.radius);
        g.addColorStop(0, `rgba(255,255,230,${0.5 * k})`);
        g.addColorStop(1, "rgba(255,248,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.tx, b.ty, b.radius, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    // ------------------------------------------------------------ 诛仙阵：苍穹剑雨
    /**
     * 阵图落点处：一柄巨剑从天而降穿透建筑直插地面并缓缓消散，
     * 周围小剑环绕落下，撞停在建筑表面（不穿透）。
     */
    spawnSwordFormation(x, y, team, damage, blast) {
      if (!this.terrain) return;
      const R = Math.max(90, (blast || 80) * 0.9);
      const cx = clamp(x, 40, W - 40);
      const groundAt = (px) => this.terrain.surfaceBelow(px, 0) ?? (H - 60);
      const hitSet = new Set();
      // 主巨剑：自苍穹最高处直插而下，穿透一切建筑直到地面
      this.swordFormation.push({
        big: true, scale: 2.8,
        tx: cx, x: cx, y: -180,
        vy: 2100, team, damage, blast,
        gy: groundAt(cx), stuck: false, stuckT: 0,
        fade: 1.8, hitSet, trail: [],
      });
      // 环绕小剑
      const count = 8;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        const tx = clamp(cx + Math.cos(a) * R * rand(0.5, 1), 24, W - 24);
        this.swordFormation.push({
          big: false, scale: rand(0.85, 1.15),
          tx, x: tx, y: -140 - rand(0, 160),
          vy: rand(1500, 1900), team, damage, blast,
          gy: groundAt(tx), stuck: false, stuckT: 0,
          fade: rand(0.9, 1.3), hitSet, trail: [],
        });
      }
      this.shake = Math.max(this.shake, 8);
      this.sfx.shoot("formation");
    },

    /** 更新诛仙剑阵：巨剑穿建筑插地，小剑停在建筑表面，落地后慢慢消散 */
    _updateSwordFormation(dt) {
      if (!this.swordFormation.length) return;
      for (let i = this.swordFormation.length - 1; i >= 0; i--) {
        const s = this.swordFormation[i];
        if (s.stuck) {
          s.stuckT += dt;
          if (s.stuckT > s.fade) this.swordFormation.splice(i, 1);
          continue;
        }
        s.y += s.vy * dt;
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 10) s.trail.shift();
        if (s.big) {
          // 巨剑：穿透建筑，贯穿伤害沿途敌人
          for (const u of this.units) {
            if (!u.alive || u.team === s.team || s.hitSet.has(u)) continue;
            const dx = s.x - u.x;
            const dy = s.y - (u.y - 30);
            if (dx * dx + dy * dy < 44 * 44) {
              s.hitSet.add(u);
              u.takeDamage(s.damage * 0.8, s.team);
              this.spawnParticles(s.x, s.y, 8, "#ff6a9a", "spark");
            }
          }
          if (s.y >= s.gy - 10) {
            s.y = s.gy - 10;
            s.stuck = true;
            s.stuckT = 0;
            this.rings.push({ x: s.x, y: s.gy, r: 10, max: s.blast * 1.8, t: 0, life: 0.4, color: "rgba(255,106,154,.75)" });
            this.spawnParticles(s.x, s.gy, 26, "#ff6a9a", "spark");
            this.spawnParticles(s.x, s.gy, 12, "#ffd8e8", "fire");
            this._damageUnitsInRadius(s.x, s.gy, s.blast, s.damage * 1.1, s.team, {});
            this.shake = Math.max(this.shake, 12);
            this.screenFlash = Math.max(this.screenFlash, 0.25);
            this.flashColor = "#ff6a9a";
          }
        } else if (this.terrain.circleHit(s.x, s.y, 5) || s.y >= s.gy - 4) {
          // 小剑：撞停在建筑/平台表面，不穿透
          s.y = Math.min(s.y, s.gy - 4);
          s.stuck = true;
          s.stuckT = 0;
          this.rings.push({ x: s.x, y: s.y, r: 4, max: s.blast * 0.8, t: 0, life: 0.25, color: "rgba(255,106,154,.6)" });
          this.spawnParticles(s.x, s.y, 8, "#ff6a9a", "spark");
          this._damageUnitsInRadius(s.x, s.y + 10, s.blast * 0.55, s.damage * 0.55, s.team, {});
        }
      }
    },

    /** 绘制诛仙剑阵：巨剑大且亮、小剑环绕，插地后淡出消散 */
    _drawSwordFormation(ctx) {
      if (!this.swordFormation.length) return;
      for (const s of this.swordFormation) {
        ctx.save();
        ctx.translate(s.x, s.y);
        let alpha = 1;
        if (s.stuck) alpha = clamp(1 - s.stuckT / s.fade, 0, 1);
        ctx.globalAlpha = alpha;
        if (s.big) {
          ctx.shadowColor = "#ff6a9a";
          ctx.shadowBlur = 26;
        }
        // 剑尖朝下
        ctx.rotate(Math.PI / 2);
        this._drawSwordShape(ctx, s.scale, SWORD_VIOLET);
        ctx.restore();
        if (!s.stuck && s.trail.length > 1) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = s.big ? "rgba(255,106,154,.5)" : "rgba(255,150,180,.35)";
          ctx.lineWidth = s.big ? 5 : 2.5;
          ctx.beginPath();
          s.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    // ------------------------------------------------------------ 毒雾术：浓雾爆发
    /** 毒雾爆发：一片浓雾，只伤害单位、不破坏建筑与地形；中毒持续一个回合 */
    poisonCloudBurst(x, y, radius, damage, team) {
      if (!this.terrain) return;
      const R = Math.max(60, radius || 80);
      // 浓雾气体（大面积半透明绿雾，缓慢扩散上升）
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU);
        const rr = rand(0, R * 0.9);
        this.particles.push({
          x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.45,
          vx: rand(-18, 18), vy: rand(-26, -6),
          life: rand(1.2, 2.4), maxLife: 2.4, size: rand(16, 34),
          color: "gas", kind: "gas", gravity: -6,
        });
      }
      // 爆发气泡
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          x: x + rand(-14, 14), y: y + rand(-14, 14),
          vx: rand(-90, 90), vy: rand(-140, -40),
          life: rand(0.4, 0.9), maxLife: 0.9, size: rand(2.5, 6),
          color: "#8aff6a", kind: "spark", gravity: -30,
        });
      }
      this.rings.push({ x, y, r: R * 0.2, max: R * 1.3, t: 0, life: 0.4, color: "rgba(138,255,106,.55)" });
      this.glows.push({ x, y, r: R * 1.1, life: 0.4, max: 0.4, color: "rgba(138,255,106,.5)" });
      // 只伤害单位，不 carve 地形
      this._damageUnitsInRadius(x, y, R, damage, team, {
        poison: { dur: 9999, dps: WEAPONS.poisonmist.poisonDps },
      });
      this.shake = Math.max(this.shake, 4);
      this.sfx.shoot("poisonmist");
    },

    /** 绘制剑雨中的飞剑：完整剑形（剑刃 + 剑格 + 剑柄） */
    _drawSwordRain(ctx) {
      if (!this.swordRain.length) return;
      for (const s of this.swordRain) {
        if (s.delay > 0) continue;
        ctx.save();
        ctx.translate(s.x, s.y);
        // 插地剑：剑尖朝下，剑柄朝上，微微颤动
        if (s.stuck) {
          const fade = s.stuckT > 1.0 ? clamp(1 - (s.stuckT - 1.0) / 0.6, 0, 1) : 1;
          ctx.globalAlpha = fade;
          // 插地角度：剑尖朝下
          ctx.rotate(Math.PI / 2 + Math.sin(s.stuckT * 3) * 0.05);
          this._drawSwordShape(ctx, 1.2, SWORD_GOLD);
        } else {
          // 飞行剑：剑身朝速度方向
          const ang = Math.atan2(s.vy, s.vx);
          ctx.rotate(ang);
          // 剑芒拖尾（金色）
          ctx.globalCompositeOperation = "lighter";
          const grad = ctx.createLinearGradient(-12, 0, -60, 0);
          grad.addColorStop(0, "rgba(255,205,92,.7)");
          grad.addColorStop(1, "rgba(255,205,92,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(-12, -3);
          ctx.lineTo(-55, 0);
          ctx.lineTo(-12, 3);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          this._drawSwordShape(ctx, 1.1, SWORD_GOLD);
        }
        ctx.restore();
      }
    },

    /** 绘制一把完整的剑（剑刃 + 剑格 + 剑柄），pal 为颜色调色板 */
    _drawSwordShape(ctx, scale = 1, pal = null) {
      const P = pal || { blade: "#f0f8ff", glow: "#a8d8ff", edge: "rgba(255,255,255,.95)", guard: "#8ab8d8", grip: "#5a7a9a", orb: "#8ab8d8" };
      ctx.scale(scale, scale);
      // 剑刃（菱形，剑尖朝右）
      ctx.fillStyle = P.blade;
      ctx.shadowColor = P.glow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(26, 0);       // 剑尖
      ctx.lineTo(6, -5);        // 刃口上
      ctx.lineTo(-12, -3);     // 剑根上
      ctx.lineTo(-12, 3);      // 剑根下
      ctx.lineTo(6, 5);        // 刃口下
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 剑脊寒芒
      ctx.strokeStyle = P.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();
      // 剑格（护手）
      ctx.strokeStyle = P.guard;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.lineTo(-12, 8);
      ctx.stroke();
      // 剑柄
      ctx.strokeStyle = P.grip;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-22, 0);
      ctx.stroke();
      // 剑柄末端圆珠
      ctx.fillStyle = P.orb;
      ctx.beginPath();
      ctx.arc(-23, 0, 2.5, 0, TAU);
      ctx.fill();
    },

  });
}
