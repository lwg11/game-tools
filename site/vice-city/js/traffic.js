/**
 * 罪恶都市 · 环境车流
 * ------------------------------------------------------------
 * 8 辆 NPC 车沿道路网格巡航：保持右车道、路口随机转向、限速、互不穿插。
 * 与玩家车辆碰撞时推挤+双方受损。
 */
import * as THREE from "../lib/three.module.min.js";
import { Car, paintCar, CAR_PAINTS } from "./vehicle.js";
import { WORLD, clamp, angleDiff } from "./common.js";

const TRAFFIC_COUNT = 16;
const LANE_OFFSET = 3.0;
const TURN_RANDOM = 0.35;
const RELOCATE_T = 5;   // 远离玩家 N 秒后重新投放到其他路段

export class TrafficSystem {
  constructor(game, count = TRAFFIC_COUNT) {
    this.game = game;
    this.cars = [];
    this.count = count;
    this._spawnAll();
  }

  _spawnAll() {
    const half = WORLD.half;
    const step = WORLD.size / WORLD.gridN;
    const types = ["sedan", "taxi", "pickup", "sedan", "ambulance", "pickup", "sport", "sedan",
      "taxi", "sedan", "pickup", "sedan", "taxi", "pickup", "sedan", "sport"];
    // 一半车流优先投放在市中心（出生点周围），保证玩家立刻能看到路面上有车
    for (let i = 0; i < this.count; i++) {
      const nodes = this._gridNodes();
      let idx;
      if (i % 2 === 0) {
        // 中心 5×5 网格内抽节点
        for (let t = 0; t < 12; t++) {
          const cand = Math.floor(Math.random() * nodes.length);
          const [wx, wz] = nodes[cand];
          if (Math.abs(wx) < step * 2.6 && Math.abs(wz) < step * 2.6) { idx = cand; break; }
        }
        if (idx === undefined) idx = Math.floor(Math.random() * nodes.length);
      } else {
        idx = Math.floor(Math.random() * nodes.length);
      }
      const [nx, nz] = nodes[idx]; // eslint-disable-line no-unused-vars
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const dir = dirs[Math.floor(Math.random() * 4)];
      const angle = Math.atan2(dir[0], dir[1]);
      const car = new Car(types[i % types.length], nx, nz, angle);
      if (!["taxi", "police", "ambulance"].includes(types[i % types.length]) && Math.random() < 0.6) {
        paintCar(car, CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)]);
      }
      car.occupiedBy = "traffic";
      car._baseMaxSpeed = car.def.maxSpeed;
      car.def.maxSpeed = 16; // 巡航限速
      car._grid = {
        gx: Math.round((nx + half) / step),
        gz: Math.round((nz + half) / step),
        dir,
      };
      car._target = this._nextNode(car); // 出生即上路，不空等一帧
      this.game.scene.add(car.group);
      this.cars.push(car);
    }
  }

  _gridNodes() {
    const half = WORLD.half;
    const step = WORLD.size / WORLD.gridN;
    const nodes = [];
    for (let i = 0; i <= WORLD.gridN; i++) {
      for (let k = 0; k <= WORLD.gridN; k++) {
        nodes.push([-half + i * step, -half + k * step]);
      }
    }
    return nodes;
  }

  /** 将远处“看不见”的车重新投放到玩家 300~700m 的随机路段节点 */
  _relocate(car, playerPos) {
    const half = WORLD.half;
    const step = WORLD.size / WORLD.gridN;
    const pgx = Math.min(WORLD.gridN - 1, Math.max(1, Math.round((playerPos.x + half) / step)));
    const pgz = Math.min(WORLD.gridN - 1, Math.max(1, Math.round((playerPos.z + half) / step)));
    let gx = pgx;
    let gz = pgz;
    for (let t = 0; t < 8; t++) {
      const candX = Math.min(WORLD.gridN - 1, Math.max(1, pgx + Math.floor(Math.random() * 13) - 6));
      const candZ = Math.min(WORLD.gridN - 1, Math.max(1, pgz + Math.floor(Math.random() * 13) - 6));
      const wx = -half + candX * step;
      const wz = -half + candZ * step;
      const d = Math.hypot(wx - playerPos.x, wz - playerPos.z);
      if (d > 300 && d < 750) { gx = candX; gz = candZ; break; }
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dir = dirs[Math.floor(Math.random() * 4)];
    car._grid = { gx, gz, dir };
    const rightX = Math.cos(Math.atan2(dir[0], dir[1]));
    const rightZ = -Math.sin(Math.atan2(dir[0], dir[1]));
    car.pos.x = -half + gx * step + rightX * LANE_OFFSET;
    car.pos.z = -half + gz * step + rightZ * LANE_OFFSET;
    car.angle = Math.atan2(dir[0], dir[1]);
    car._target = null;
    car.vx = car.vz = 0;
    if (car.group) car.group.visible = true;
  }

  _nextNode(car) {
    const g = car._grid;
    const half = WORLD.half;
    const step = WORLD.size / WORLD.gridN;
    const nx = g.gx + g.dir[0];
    const nz = g.gz + g.dir[1];
    if (nx < 0 || nx > WORLD.gridN || nz < 0 || nz > WORLD.gridN) {
      // 掉头
      g.dir = [-g.dir[0], -g.dir[1]];
      return null;
    }
    // 随机转向（十字处）
    if (Math.random() < TURN_RANDOM) {
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter((d) => !(d[0] === -g.dir[0] && d[1] === -g.dir[1])); // 禁止掉头（尽头除外）
      g.dir = options[Math.floor(Math.random() * options.length)];
    }
    g.gx = nx;
    g.gz = nz;
    // 目标世界坐标（右车道偏移）
    const rightX = Math.cos(Math.atan2(g.dir[0], g.dir[1]));
    const rightZ = -Math.sin(Math.atan2(g.dir[0], g.dir[1]));
    return {
      x: -half + nx * step + rightX * LANE_OFFSET,
      z: -half + nz * step + rightZ * LANE_OFFSET,
    };
  }

  update(dt, playerPos, playerVehicle) {
    const game = this.game;
    for (const car of this.cars) {
      if (car.dead) {
        car.deadTimer += dt;
        if (car.deadTimer > 25) {
          car.dead = false;
          car.hp = car.maxHp;
          car.group.visible = true;
          car._resetVisual();
        }
        continue;
      }
      // 距离 LOD：800m 外不跑驾驶 AI（玩家看不见），但定期重投到玩家周边
      if (playerPos && Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) > 800) {
        car._loafT = (car._loafT || 0) + dt;
        if (car._loafT > RELOCATE_T) {
          car._loafT = 0;
          this._relocate(car, playerPos);
        }
        continue;
      }
      car._loafT = 0;
      let target = car._target;
      if (!target || Math.hypot(target.x - car.pos.x, target.z - car.pos.z) < 6) {
        target = this._nextNode(car);
        car._target = target;
        if (!target || Math.abs(car.pos.x) > WORLD.half - 20 || Math.abs(car.pos.z) > WORLD.half - 20) {
          // 出界重置到中心
          car.pos.x = 0;
          car.pos.z = 0;
          car.angle = Math.PI / 2;
          car._grid = { gx: 6, gz: 6, dir: [1, 0] };
          car._target = null;
        }
        continue;
      }
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const desired = Math.atan2(dx, dz);
      const diff = angleDiff(desired, car.angle);
      const steer = clamp(diff * 1.8, -1, 1);
      const throttle = Math.abs(diff) < 0.6 ? 0.8 : 0.3;
      car.drive(throttle, steer, false, dt, game.world);

      // 出界保护
      if (Math.abs(car.pos.x) > WORLD.half || Math.abs(car.pos.z) > WORLD.half) {
        car.pos.x = clamp(car.pos.x, -WORLD.half + 20, WORLD.half - 20);
        car.pos.z = clamp(car.pos.z, -WORLD.half + 20, WORLD.half - 20);
        car._target = null;
      }

      // 与玩家车辆碰撞
      if (playerVehicle) {
        const rr = car.radius + playerVehicle.radius;
        const pdx = playerVehicle.pos.x - car.pos.x;
        const pdz = playerVehicle.pos.z - car.pos.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < rr && pd > 0.01) {
          const nx = pdx / pd;
          const nz = pdz / pd;
          playerVehicle.pos.x += nx * (rr - pd) * 0.6;
          playerVehicle.pos.z += nz * (rr - pd) * 0.6;
          car.pos.x -= nx * (rr - pd) * 0.4;
          car.pos.z -= nz * (rr - pd) * 0.4;
          const relSpeed = Math.hypot(playerVehicle.vx - car.vx, playerVehicle.vz - car.vz);
          if (relSpeed > 4) {
            playerVehicle.damage(relSpeed * 0.5);
            car.damage(relSpeed * 0.5);
            if (game.sfx && game.sfx.playCrash) game.sfx.playCrash(relSpeed);
            if (game.spawnSparks) {
              game.spawnSparks(
                (playerVehicle.pos.x + car.pos.x) / 2, 0.7,
                (playerVehicle.pos.z + car.pos.z) / 2,
                Math.min(12, Math.floor(relSpeed)), 0xffc266, 5,
              );
            }
          }
        }
      }
    }
  }
}
