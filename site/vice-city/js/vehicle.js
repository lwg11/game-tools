/**
 * 罪恶都市 · 载具系统
 * ------------------------------------------------------------
 * 6 种程序化建模车辆（出租车/跑车/警车/救护车/皮卡/轿车），街机式驾驶物理
 * （前轮转向 + 侧向抓地 + 手刹漂移）、与建筑碰撞后滑移/弹回/损伤。
 * 提供车辆生成、停车场刷新、车与车碰撞、最近可上车查询。
 */
import * as THREE from "../lib/three.module.min.js";
import { WORLD, PALETTE, clamp, lerp, angleDiff } from "./common.js";

// ---------------------------------------------------------------- 车型
export const VEHICLE_TYPES = {
  sport: {
    name: "Vice 跑车", color: 0xe04050, cabinColor: 0x141c28,
    maxSpeed: 30, accel: 13, brake: 24, reverse: 7,
    turn: 0.55, grip: 7.5, drag: 0.35, hp: 120, mass: 1100,
    len: 4.4, wid: 2.0, bodyH: 0.5, cabinH: 0.42, cabinL: 1.7, low: true,
  },
  sedan: {
    name: "轿车", color: 0x4a6a9a, cabinColor: 0x1a2430,
    maxSpeed: 24, accel: 10, brake: 22, reverse: 6,
    turn: 0.5, grip: 6.5, drag: 0.4, hp: 100, mass: 1200,
    len: 4.2, wid: 1.9, bodyH: 0.55, cabinH: 0.45, cabinL: 1.9,
  },
  taxi: {
    name: "出租车", color: 0xf5c518, cabinColor: 0x20262e,
    maxSpeed: 24, accel: 10, brake: 22, reverse: 6,
    turn: 0.5, grip: 6.5, drag: 0.4, hp: 100, mass: 1250,
    len: 4.4, wid: 1.95, bodyH: 0.55, cabinH: 0.45, cabinL: 2.0, taxi: true,
  },
  police: {
    name: "警车", color: 0xf0f0f0, cabinColor: 0x16202e,
    maxSpeed: 28, accel: 12, brake: 26, reverse: 7,
    turn: 0.52, grip: 7.5, drag: 0.38, hp: 160, mass: 1400,
    len: 4.5, wid: 2.0, bodyH: 0.55, cabinH: 0.45, cabinL: 2.0, police: true,
  },
  ambulance: {
    name: "救护车", color: 0xf8f4ee, cabinColor: 0x2a3440,
    maxSpeed: 22, accel: 9, brake: 20, reverse: 6,
    turn: 0.48, grip: 6, drag: 0.42, hp: 180, mass: 1800,
    len: 5.2, wid: 2.1, bodyH: 0.8, cabinH: 0.6, cabinL: 2.6, boxy: true,
  },
  pickup: {
    name: "皮卡", color: 0x7a5a3a, cabinColor: 0x1e262e,
    maxSpeed: 22, accel: 9, brake: 20, reverse: 6,
    turn: 0.48, grip: 6, drag: 0.42, hp: 160, mass: 1700,
    len: 4.8, wid: 2.0, bodyH: 0.6, cabinH: 0.5, cabinL: 1.5, boxy: true,
  },
};

const CAR_RADIUS = 1.6; // 近似碰撞半径

// ---------------------------------------------------------------- 涂装
export const CAR_PAINTS = [
  "#b8433a", "#3a6ea8", "#3aa87a", "#c8ccd4", "#2f3440", "#8a5aa8",
  "#d88a3a", "#e8e2d8", "#5a8a3a", "#a83a6a", "#3ab0c8", "#e8c83a",
];

/** 给载具换随机车漆（特殊车辆出租车/警车/救护车除外） */
export function paintCar(car, hex) {
  car.def = Object.assign({}, car.def, { color: hex });
  car.bodyMat.color.setHex(hex);
}

// ---------------------------------------------------------------- 单车
export class Car {
  constructor(type, x, z, angle, dead = false) {
    this.type = type;
    this.def = VEHICLE_TYPES[type];
    this.pos = { x, z };
    this.angle = angle;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;       // 前轮转角（视觉 + 物理）
    this.throttle = 0;    // 供 HUD/AI 读取
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.radius = CAR_RADIUS;
    this.dead = dead;
    this.deadTimer = 0;
    this.respawnTimer = 0;
    this.occupiedBy = null; // 'player' | police AI | null
    this.lastHitTime = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.set(x, 0, z);
    this.group.rotation.y = angle;
  }

  _buildMesh() {
    const def = this.def;
    const L = def.len;
    const W = def.wid;

    const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, def.bodyH, L), bodyMat);
    body.position.y = def.bodyH / 2 + 0.25;
    body.castShadow = true;
    this.bodyMat = bodyMat;

    const cabinColor = def.cabinColor || 0x18202c;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.85, def.cabinH, def.cabinL),
      new THREE.MeshLambertMaterial({ color: cabinColor }),
    );
    cabin.position.set(0, def.bodyH + 0.25 + def.cabinH / 2, -L * 0.05);
    cabin.castShadow = true;

    this.group.add(body, cabin);

    // 车轮（前轮可转向）
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    const wx = W / 2;
    const wz = L / 2 - 0.75;
    this.wheels = [];
    for (const [px, pz, front] of [[-wx, -wz, true], [wx, -wz, true], [-wx, wz, false], [wx, wz, false]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(px, 0.34, pz);
      const wrap = new THREE.Group();
      wrap.add(wheel);
      wrap.position.set(px, 0, pz);
      wheel.position.set(0, 0.34, 0);
      this.group.add(wrap);
      if (front) this.wheels.push(wrap);
    }

    // 车灯
    const headGeo = new THREE.BoxGeometry(0.32, 0.16, 0.08);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(headGeo, headMat);
      hl.position.set(sx * (W / 2 - 0.25), 0.55, -L / 2);
      this.group.add(hl);
      const tl = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xc02020 }));
      tl.position.set(sx * (W / 2 - 0.25), 0.55, L / 2);
      this.group.add(tl);
    }

    // 车型装饰
    if (def.taxi) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xffe066 }),
      );
      sign.position.set(0, def.bodyH + 0.25 + def.cabinH + 0.12, -L * 0.05);
      this.group.add(sign);
    }
    if (def.police) {
      this.lightbarRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      );
      this.lightbarRed.position.set(-0.3, def.bodyH + 0.25 + def.cabinH + 0.1, -L * 0.05);
      this.lightbarBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x2060ff }),
      );
      this.lightbarBlue.position.set(0.3, def.bodyH + 0.25 + def.cabinH + 0.1, -L * 0.05);
      this.group.add(this.lightbarRed, this.lightbarBlue);
      // 黑色侧门
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(W + 0.02, 0.22, L * 0.7),
        new THREE.MeshLambertMaterial({ color: 0x1c222c }),
      );
      stripe.position.y = 0.62;
      this.group.add(stripe);
    }
    if (def.ambulance) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(W + 0.02, 0.18, L * 0.9),
        new THREE.MeshLambertMaterial({ color: 0xd04040 }),
      );
      stripe.position.y = 0.55;
      this.group.add(stripe);
    }

    if (this.dead) this._setDeadVisual();
  }

  _setDeadVisual() {
    this.bodyMat.color.setHex(0x2a2a2a);
    this.group.visible = !this.dead;
  }

  // ------------------------------------------------------------ 物理
  /**
   * 驾驶一帧
   * @param throttle -1..1（油门/倒车）
   * @param steerInput -1..1（左负右正）
   * @param handbrake bool
   * @param dt 秒
   * @param world 城市（碰撞用）
   */
  drive(throttle, steerInput, handbrake, dt, world) {
    const def = this.def;
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);

    // 前向 / 侧向速度分解
    let vF = this.vx * fx + this.vz * fz;       // 前向分量
    let vLx = this.vx - fx * vF;                // 侧向分量
    let vLz = this.vz - fz * vF;

    // 引擎 / 刹车 / 倒车
    if (throttle > 0) {
      vF += throttle * def.accel * dt;
    } else if (throttle < 0) {
      if (vF > 0.5) vF += throttle * def.brake * dt;      // 刹车
      else vF += throttle * def.accel * 0.55 * dt;       // 倒车
      vF = Math.max(vF, -def.reverse);
    }
    // 手刹：强力减速前向滑动、允许大侧滑
    if (handbrake) {
      vF *= Math.exp(-3.2 * dt);
    }

    // 阻力
    vF -= vF * def.drag * dt + Math.sign(vF) * 0.25 * dt;
    const maxF = def.maxSpeed;
    vF = clamp(vF, -def.reverse, maxF);

    // 转向：速度敏感 + 抓地
    const steerTarget = steerInput * def.turn;
    this.steer = lerp(this.steer, steerTarget, clamp(10 * dt, 0, 1));
    if (Math.abs(vF) > 0.1) {
      const dir = vF >= 0 ? 1 : -1;
      this.angle += dir * (vF / 2.6) * Math.tan(this.steer) * dt;
    }

    // 抓地：侧向速度衰减（手刹时减弱 → 漂移）
    const grip = handbrake ? def.grip * 0.18 : def.grip;
    const latDamp = Math.exp(-grip * dt);
    vLx *= latDamp;
    vLz *= latDamp;

    // 重组速度
    const fx2 = Math.sin(this.angle);
    const fz2 = Math.cos(this.angle);
    this.vx = fx2 * vF + vLx;
    this.vz = fz2 * vF + vLz;

    // 位置积分
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    // 碰撞：建筑/边界（先与 collideCircle 推出，再把撞向墙的法向速度衰减）
    const hit = world ? world.collideCircle(this.pos.x, this.pos.z, this.radius) : null;
    if (hit) {
      this.pos.x += (hit.dx / hit.d) * (this.radius - hit.d);
      this.pos.z += (hit.dz / hit.d) * (this.radius - hit.d);
      // 法向（从障碍指向车）
      const nx = hit.dx / hit.d;
      const nz = hit.dz / hit.d;
      const vDotN = this.vx * nx + this.vz * nz;
      if (vDotN < 0) {
        // 反弹少量 + 损伤
        const impact = -vDotN;
        this.vx -= nx * vDotN * 1.25;
        this.vz -= nz * vDotN * 1.25;
        if (impact > 3) {
          this.damage(impact * 0.9);
          if (this.onCrash) this.onCrash(impact);
        }
      }
    }

    // 世界边界
    const lim = WORLD.half - 6;
    if (this.pos.x < -lim || this.pos.x > lim) {
      this.pos.x = clamp(this.pos.x, -lim, lim);
      this.vx *= -0.3;
    }
    if (this.pos.z < -lim || this.pos.z > lim) {
      this.pos.z = clamp(this.pos.z, -lim, lim);
      this.vz *= -0.3;
    }

    this.throttle = throttle;
    this._syncVisual(dt);
  }

  damage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadTimer = 0;
      this.respawnTimer = 20;
      this._setDeadVisual();
      this.group.visible = false;
      if (this.onExplode) this.onExplode();
    } else {
      // 受损变暗
      const f = 0.55 + 0.45 * (this.hp / this.maxHp);
      this.bodyMat.color.setHex(this.def.color);
      this.bodyMat.color.multiplyScalar(f);
    }
  }

  _syncVisual(dt) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.angle;
    // 前轮转向
    for (const w of this.wheels) {
      w.rotation.y = this.steer * 0.9;
    }
  }

  /** 速度 km/h */
  get kmh() {
    return Math.hypot(this.vx, this.vz) * 3.6;
  }

  addToSccene(scene) {
    scene.add(this.group);
  }
}

// ---------------------------------------------------------------- 系统
export class VehicleSystem {
  /**
   * @param game
   * @param spawnCount 场景停放车辆总数
   */
  constructor(game, spawnCount = 26) {
    this.game = game;
    this.cars = [];
    this.spawnCount = spawnCount;
    this._spawnAll();
  }

  _spawnAll() {
    const city = this.game.world;
    const types = ["sedan", "sedan", "taxi", "taxi", "sport", "pickup", "ambulance", "pickup", "sedan", "taxi"];
    const spots = city.parkingSpots || [];
    // 从出生点向外的前 N 个车位
    const spawn = city.spawnPoint || { x: 0, z: 0 };
    const sorted = spots.slice().sort((a, b) => {
      const da = (a.x - spawn.x) ** 2 + (a.z - spawn.z) ** 2;
      const db = (b.x - spawn.x) ** 2 + (b.z - spawn.z) ** 2;
      return da - db;
    });
    for (let i = 0; i < Math.min(this.spawnCount, sorted.length); i++) {
      const s = sorted[i];
      const type = types[i % types.length];
      const car = new Car(type, s.x, s.z, s.angle);
      if (!["taxi", "police", "ambulance"].includes(type) && Math.random() < 0.6) {
        paintCar(car, CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)]);
      }
      this.cars.push(car);
      this.game.scene.add(car.group);
      car.onCrash = (impact) => this.game.onCarCrash && this.game.onCarCrash(car, impact);
      car.onExplode = () => {
        if (this.game.sfx && this.game.sfx.playExplode && this.game.player && this.game.player.vehicle === car) this.game.sfx.playExplode();
        this.game.onCarExplode && this.game.onCarExplode(car);
      };
    }
  }

  /** 找最近可进入的车 */
  nearestEnterable(x, z, maxDist = 3.2) {
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (const car of this.cars) {
      if (car.dead || car.occupiedBy) continue;
      const d2 = (car.pos.x - x) ** 2 + (car.pos.z - z) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = car; }
    }
    return best;
  }

  update(dt, playerPos) {
    // 车-车碰撞（圆-圆）
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead && a.respawnTimer > 0) {
        a.respawnTimer -= dt;
        if (a.respawnTimer <= 0) this._respawn(a);
        continue;
      }
      if (a.dead) continue;
      for (let k = i + 1; k < cars.length; k++) {
        const b = cars[k];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const rr = a.radius + b.radius;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          const overlap = rr - d;
          a.pos.x -= nx * overlap * 0.5;
          a.pos.z -= nz * overlap * 0.5;
          b.pos.x += nx * overlap * 0.5;
          b.pos.z += nz * overlap * 0.5;
          // 速度交换（简化：沿法向均分）
          const avn = a.vx * nx + a.vz * nz;
          const bvn = b.vx * nx + b.vz * nz;
          const diff = (bvn - avn) * 0.7;
          a.vx += nx * diff * 0.5;
          a.vz += nz * diff * 0.5;
          b.vx -= nx * diff * 0.5;
          b.vz -= nz * diff * 0.5;
          if (Math.abs(diff) > 4) {
            a.damage(Math.abs(diff) * 0.5);
            b.damage(Math.abs(diff) * 0.5);
          }
          a._syncVisual(dt);
          b._syncVisual(dt);
        }
      }
      // 远处空车不同步网格（待机）
      if (!a.occupiedBy && Math.hypot(a.pos.x - playerPos.x, a.pos.z - playerPos.z) > 2600) {
        // 超远距离的停放车只在重进范围时刷新（暂不实现，后续优化预留）
      }
    }
  }

  _respawn(car) {
    car.dead = false;
    car.hp = car.maxHp;
    car.bodyMat.color.setHex(car.def.color);
    car.vx = car.vz = 0;
    car.respawnTimer = 0;
    car.group.visible = true;
  }
}
