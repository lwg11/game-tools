/**
 * 罪恶都市 · 警察与通缉系统
 * ------------------------------------------------------------
 * 通缉星 1-5：犯罪（撞人/开枪/抢车/超速在警车附近）升星，
 * 远离警察后逐星衰减。星数决定追捕警车数量与攻击性；
 * 徒步低速被贴近会被捕（BUSTED）；驾车被持续贴近会掉血/车损。
 */
import * as THREE from "../lib/three.module.min.js";
import { Car } from "./vehicle.js";
import { WORLD, clamp, lerp, angleDiff } from "./common.js";

const BUSTED_DIST = 3.4;
const BUSTED_SPEED_MAX = 2.5;
const MEMORY_TIME = 12; // 无警察可见后保留通缉的秒数
const DECAY_STEPS = 4;  // 每衰减一星所需时间

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.cars = [];          // { car, alive }
    this.memory = 0;         // 追击记忆计时
    this.decay = 0;
    this._spawnCooldown = 0;
    // 特殊地点（与医院/据点共用）
    this.station = { x: -180, z: -140 };
    this.hospital = { x: 320, z: 380 };
  }

  /** 报告犯罪：升 star（1-5），amount 为增量（可为 0 仅刷新记忆） */
  reportCrime(amount = 1) {
    this.memory = MEMORY_TIME + 6;
    if (amount <= 0) return;
    const next = clamp(this.stars + amount, 0, 5);
    if (next > this.stars) {
      this.stars = next;
    }
    // 立即允许补充
    if (this._spawnCooldown > 1.5) this._spawnCooldown = 1.5;
  }

  clearCrime() {
    this.stars = 0;
    this.memory = 0;
    this._despawnAll();
    this.showStations = false;
  }

  // N5：G/菜单按钮开关检查站（最多 2 个，与追逐单位互不影响）
  toggleStations() {
    this.showStations = !this.showStations;
    if (this.showStations) {
      this._spawnCooldown = 0;
      this.spawnUpTo(2);
      if (!this.game.headless) {
        this.game.showToast(`🚧 已设置 ${this.cars.length} 处警方检查站 · 再按 G 撤销`);
      }
    } else {
      this._despawnAll();
      this._spawnCooldown = 2;
      if (!this.game.headless) this.game.showToast("🚧 检查站已撤销");
    }
  }

  // N6：手动呼叫增援（不升星，最多补足到 2 辆）
  callReinforcements() {
    if (this.stars === 0) this.stars = 1;
    this.memory = Math.max(this.memory, 60);
    this.spawnUpTo(2);
    if (!this.game.headless) {
      this.game.showToast(this.cars.length
        ? `🚔 增援已出动（${this.cars.length} 辆）`
        : "🚔 附近没有可用的巡逻车");
    }
  }

  // 至少生成 n 辆（调用方负责冷却/提示）
  spawnUpTo(n) {
    for (let i = 0; i < n; i++) {
      if (this.cars.length >= n) break;
      this._spawnCop();
      if (this.cars.length === 0) break; // 生成失败兜底
    }
  }

  _desiredCount() {
    return Math.min(3, Math.floor(this.stars));
  }

  _spawnCop() {
    const game = this.game;
    const p = game.player.pos;
    const step = WORLD.size / WORLD.gridN;
    // 在玩家周边街区的道路交点上选生成点（约 70~420m），避免凭空出现在玩家脸上
    const gx = Math.round(p.x / step);
    const gz = Math.round(p.z / step);
    const nodes = [];
    for (let a = -3; a <= 3; a++) {
      for (let b = -3; b <= 3; b++) {
        if (a === 0 && b === 0) continue;
        const d = Math.hypot(a, b) * step;
        if (d < 70 || d > 420) continue;
        nodes.push([gx + a, gz + b]);
      }
    }
    const list = nodes.length ? nodes : [[gx + 1, gz], [gx - 1, gz]];
    const [nx, nz] = list[Math.floor(Math.random() * list.length)];
    const x = clamp(nx * step, -WORLD.half + 10, WORLD.half - 10);
    const z = clamp(nz * step, -WORLD.half + 10, WORLD.half - 10);
    const car = new Car("police", x, z, Math.atan2(p.x - x, p.z - z));
    car.occupiedBy = "police";
    car.maxSpeedScale = 1.05 + 0.08 * this.stars; // 橡皮筋加速
    car.onCrash = (impact) => {
      if (game.onCopCrash) game.onCopCrash(impact);
    };
    game.scene.add(car.group);
    this.cars.push({ car, alive: true });
  }

  _removeCop(entry) {
    entry.alive = false;
    this.game.scene.remove(entry.car.group);
  }

  _despawnAll() {
    for (const c of this.cars) {
      if (!c.alive) continue;
      this.game.scene.remove(c.car.group);
      c.alive = false;
    }
    this.cars = [];
  }

  update(dt, playerOnFoot, playerSpeed) {
    const game = this.game;
    const ppos = game.player.pos;
    const inCar = game.player.inVehicle;
    const target = inCar ? game.player.vehicle.pos : ppos;

    // ---------- 生成/退役 ----------
    this._spawnCooldown -= dt;
    const aliveCount = this.cars.filter((c) => c.alive && !c.car.dead).length;
    if (this.stars > 0 && aliveCount < this._desiredCount() && this._spawnCooldown <= 0) {
      this._spawnCop();
      this._spawnCooldown = 2.5;
    }
    // 清理死车
    for (const c of this.cars) {
      if (c.alive && c.car.dead) {
        c.alive = false;
        game.scene.remove(c.car.group);
      }
    }
    this.cars = this.cars.filter((c) => c.alive);

    // ---------- 记忆与衰减 ----------
    const officerVisible = this.cars.some((c) => {
      const car = c.car;
      return !car.dead && this._dist(car.pos, target) < 70;
    });
    if (officerVisible) {
      this.memory = MEMORY_TIME;
      this.decay = 0;
    } else {
      this.memory -= dt;
      if (this.memory <= 0 && this.stars > 0) {
        this.decay += dt;
        if (this.decay >= DECAY_STEPS) {
          this.decay = 0;
          this.stars = Math.max(0, this.stars - 1);
          if (this.stars === 0) this._despawnAll();
        }
      }
    }

    // ---------- AI 追击 ----------
    for (const c of this.cars) {
      const car = c.car;
      if (car.dead) continue;
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 800) continue; // 距离 LOD：远处不跑 AI
      const desired = Math.atan2(dx, dz);
      const diff = angleDiff(desired, car.angle);
      let throttle = 0;
      if (dist > 7) throttle = Math.abs(diff) < 1.1 ? 1 : 0.35;
      else throttle = -0.4; // 贴近后缓行压制

      // 避障：探测车头前方，若被建筑挡住则沿墙切线绕行
      let steer = clamp(diff * 1.6, -1, 1);
      if (game.world && dist > 4) {
        const px = car.pos.x + Math.sin(car.angle) * 9;
        const pz = car.pos.z + Math.cos(car.angle) * 9;
        const ahead = game.world.collideCircle(px, pz, car.radius);
        if (ahead) {
          // 两个切线方向中选更靠近目标的一侧
          const t1x = -ahead.nz;
          const t1z = ahead.nx;
          const s1 = Math.abs(angleDiff(Math.atan2(t1x, t1z), desired));
          const s2 = Math.abs(angleDiff(Math.atan2(-t1x, -t1z), desired));
          const txv = s1 < s2 ? t1x : -t1x;
          const tzv = s1 < s2 ? t1z : -t1z;
          const avoid = clamp(angleDiff(Math.atan2(txv, tzv), car.angle) * 2.4, -1, 1);
          steer = clamp(avoid + diff * 0.4, -1, 1);
          if (Math.abs(diff) < 0.9) throttle = 1;
        }
      }

      // 橡皮筋极速
      if (car._baseMaxSpeed == null) car._baseMaxSpeed = car.def.maxSpeed;
      car.def.maxSpeed = car._baseMaxSpeed * (car.maxSpeedScale || 1);
      car.drive(throttle, steer, false, dt, game.world);
      car.def.maxSpeed = car._baseMaxSpeed;

      // 卡住自检：想追却原地打转 → 撤下并立即补一辆（避免"找不到人"）
      if (Math.abs(throttle) > 0.1 && car.kmh < 2 && dist > 8) {
        car._stuckT = (car._stuckT || 0) + dt;
      } else {
        car._stuckT = 0;
      }
      if (car._stuckT > 2.2) {
        this._removeCop(c);
        this._spawnCooldown = Math.min(this._spawnCooldown, 0.4);
        continue;
      }

      // 警灯交替
      const blink = Math.sin(performance.now() * 0.012) > 0;
      car.lightbarRed.material.color.setHex(blink ? 0xff2020 : 0x550000);
      car.lightbarBlue.material.color.setHex(blink ? 0x550000 : 0x2060ff);

      // 与玩家车辆碰撞（推开 + 双向车损）
      if (inCar) {
        const pv = game.player.vehicle;
        const pdx = pv.pos.x - car.pos.x;
        const pdz = pv.pos.z - car.pos.z;
        const pd = Math.hypot(pdx, pdz);
        const rr = car.radius + pv.radius;
        if (pd < rr && pd > 0.01) {
          const nx = pdx / pd;
          const nz = pdz / pd;
          pv.pos.x += nx * (rr - pd) * 0.5;
          pv.pos.z += nz * (rr - pd) * 0.5;
          car.pos.x -= nx * (rr - pd) * 0.5;
          car.pos.z -= nz * (rr - pd) * 0.5;
          const relSpeed = Math.hypot(pv.vx - car.vx, pv.vz - car.vz);
          if (relSpeed > 4) {
            pv.damage(relSpeed * 0.6);
            car.damage(relSpeed * 0.4);
          }
        }
        // 持续贴近：警察开枪（玩家掉血 + 曳光）
        if (dist < 7 && car.kmh < 15) {
          game.player.damage(0.6);
          car._shootT = (car._shootT || 0) - dt;
          if (car._shootT <= 0 && game.weapons) {
            car._shootT = 0.3;
            game.weapons.fireTracer(car.pos.x, 1.2, car.pos.z, ppos.x, 1.2, ppos.z);
            if (game.sfx && game.sfx.playShot) game.sfx.playShot("pistol");
          }
        }
      } else if (playerOnFoot) {
        // 徒步：高速撞倒玩家
        const d = this._dist(car.pos, ppos);
        const rr = car.radius + 0.6;
        if (d < rr && d > 0.01) {
          if (car.kmh > 12) {
            game.player.damage(30);
          } else {
            const nx = (ppos.x - car.pos.x) / d;
            const nz = (ppos.z - car.pos.z) / d;
            ppos.x += nx * (rr - d);
            ppos.z += nz * (rr - d);
          }
        }
        // 逮捕判定
        if (
          this._dist(car.pos, ppos) < BUSTED_DIST
          && playerSpeed < BUSTED_SPEED_MAX
          && !game.player.inVehicle
          && game.player.hp > 0
        ) {
          if (game.busted) game.busted();
        }
      }
    }
  }

  _dist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
