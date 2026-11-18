/**
 * 罪恶都市 · 行人系统
 * ------------------------------------------------------------
 * 池化行人在人行道闲逛；听到枪声/爆炸会奔逃；被高速车辆撞倒。
 * 渲染：6 个 InstancedMesh（身体/头/左右腿/左右臂）按实例矩阵同步，
 * 行级别体色差异用 instanceColor。
 */
import * as THREE from "../lib/three.module.min.js";
import { WORLD, clamp, lerp } from "./common.js";

const MAX_PEDS = 48;
const WALK_SPEED = 1.35;
const RUN_SPEED = 4.6;

const SHIRT_COLORS = [0xd9534f, 0x5cb85c, 0x5bc0de, 0xf0ad4e, 0x9b5de5, 0xf78c6b, 0x4a6a9a, 0xeeeeee];
const PANTS_COLORS = [0x2a3a55, 0x3a3a3a, 0x6a5a4a, 0x505a6a];
const SKIN_COLORS = [0xe8b890, 0xc8956c, 0x8a5a3a, 0xf0c8a0];

export class PedestrianSystem {
  constructor(game, count = 36) {
    this.game = game;
    this.count = Math.min(count, MAX_PEDS);
    this.peds = [];
    this._buildMeshes();
    this._spawnAll();
  }

  _buildMeshes() {
    if (this.game.headless) return;
    const mk = (w, h, d) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      return new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_PEDS);
    };
    this.bodyInst = mk(0.5, 0.62, 0.3);
    this.headInst = mk(0.3, 0.3, 0.3);
    this.legLInst = mk(0.18, 0.6, 0.2);
    this.legRInst = mk(0.18, 0.6, 0.2);
    this.armLInst = mk(0.13, 0.5, 0.16);
    this.armRInst = mk(0.13, 0.5, 0.16);

    for (const inst of [this.bodyInst, this.headInst, this.legLInst, this.legRInst, this.armLInst, this.armRInst]) {
      inst.castShadow = true;
      this.game.scene.add(inst);
    }
    this._m4 = new THREE.Matrix4();
    this._m4b = new THREE.Matrix4();
    this._fallM4 = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
  }

  _spawnAll() {
    const pts = this.game.world.pedPoints;
    const rnd = Math.random;
    for (let i = 0; i < this.count; i++) {
      const p = pts[Math.floor(rnd() * pts.length)];
      if (!p) continue;
      this.peds.push({
        x: p.x + (rnd() - 0.5) * 3,
        z: p.z + (rnd() - 0.5) * 3,
        angle: rnd() * Math.PI * 2,
        speed: 0,
        phase: rnd() * 10,
        state: "idle",
        timer: 1 + rnd() * 6,
        tx: p.x,
        tz: p.z,
        colorIdx: Math.floor(rnd() * SHIRT_COLORS.length),
        pantsIdx: Math.floor(rnd() * PANTS_COLORS.length),
        skinIdx: Math.floor(rnd() * SKIN_COLORS.length),
        dead: false,
        deadTimer: 0,
        fallAngle: 0,
      });
    }
    if (!this.game.headless) this._applyColors();
  }

  _applyColors() {
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      this.bodyInst.setColorAt(i, new THREE.Color(SHIRT_COLORS[p.colorIdx]));
      this.legLInst.setColorAt(i, new THREE.Color(PANTS_COLORS[p.pantsIdx]));
      this.legRInst.setColorAt(i, new THREE.Color(PANTS_COLORS[p.pantsIdx]));
      this.armLInst.setColorAt(i, new THREE.Color(SHIRT_COLORS[p.colorIdx]));
      this.armRInst.setColorAt(i, new THREE.Color(SHIRT_COLORS[p.colorIdx]));
      this.headInst.setColorAt(i, new THREE.Color(SKIN_COLORS[p.skinIdx]));
      m4.makeScale(0, 0, 0); // 初始隐藏，update 时写入
      this.bodyInst.setMatrixAt(i, m4);
    }
    // 其余实例隐藏
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = this.peds.length; i < MAX_PEDS; i++) {
      this.bodyInst.setMatrixAt(i, hide);
      this.headInst.setMatrixAt(i, hide);
      this.legLInst.setMatrixAt(i, hide);
      this.legRInst.setMatrixAt(i, hide);
      this.armLInst.setMatrixAt(i, hide);
      this.armRInst.setMatrixAt(i, hide);
    }
    this.bodyInst.instanceMatrix.needsUpdate = true;
    this.bodyInst.instanceColor.needsUpdate = true;
    this.headInst.instanceColor.needsUpdate = true;
    this.legLInst.instanceColor.needsUpdate = true;
    this.legRInst.instanceColor.needsUpdate = true;
    this.armLInst.instanceColor.needsUpdate = true;
    this.armRInst.instanceColor.needsUpdate = true;
  }

  /** 触发恐慌：某点附近行人四散 */
  panicAt(x, z, radius = 26) {
    for (const p of this.peds) {
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < radius * radius && !p.dead) {
        p.state = "flee";
        p.timer = 4 + Math.random() * 3;
        // 背向来源
        p.tx = p.x + (p.x - x) * 2 + (Math.random() - 0.5) * 10;
        p.tz = p.z + (p.z - z) * 2 + (Math.random() - 0.5) * 10;
      }
    }
  }

  /**
   * 被车辆撞击
   * @returns true 表示撞到人
   */
  checkCarHit(car, kmh) {
    if (kmh < 9) return false;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d2 = (p.x - car.pos.x) ** 2 + (p.z - car.pos.z) ** 2;
      if (d2 < 2.2 * 2.2) {
        p.dead = true;
        p.fallAngle = car.angle + (Math.random() - 0.5);
        p.deadTimer = 8;
        return true;
      }
    }
    return false;
  }

  update(dt, playerX, playerZ) {
    // 玩家被车撞检测（行人视角：车撞人 → 通缉）
    const vs = this.game.vehicles;
    if (vs && this.game.player) {
      const prow = this.game.player;
      if (prow.inVehicle && prow.vehicle) {
        const car = prow.vehicle;
        if (car.kmh > 10 && this.checkCarHit(car, car.kmh)) {
          if (this.game.police) this.game.police.reportCrime(2);
          if (this.game.onPedHit) this.game.onPedHit(car, this.peds.find((p) => p.dead && p.deadTimer > 7));
          if (this.game.sfx && this.game.sfx.playCrash) this.game.sfx.playCrash(10);
          this.panicAt(car.pos.x, car.pos.z, 30);
        }
      }
    }

    if (this.game.headless) {
      this._updateLogic(dt, playerX, playerZ);
      return;
    }
    this._updateLogic(dt, playerX, playerZ);
    this._syncMeshes(dt);
  }

  _updateLogic(dt, playerX, playerZ) {
    const pts = this.game.world.pedPoints;
    for (const p of this.peds) {
      if (p.dead) {
        p.deadTimer -= dt;
        p.fallAngle = lerp(p.fallAngle, Math.PI / 2, clamp(6 * dt, 0, 1));
        continue;
      }
      // 远离玩家则重置到玩家附近
      const pd2 = (p.x - playerX) ** 2 + (p.z - playerZ) ** 2;
      if (pd2 > 150 * 150) {
        const pt = pts[Math.floor(Math.random() * pts.length)];
        p.x = playerX + (Math.random() - 0.5) * 90;
        p.z = playerZ + (Math.random() - 0.5) * 90;
        p.tx = p.x;
        p.tz = p.z;
        p.state = "idle";
        p.timer = 1;
        continue;
      }

      p.timer -= dt;
      if (p.state === "idle" && p.timer <= 0) {
        // 走向附近的新路点
        let best = null;
        let bestD = Infinity;
        for (let k = 0; k < 12; k++) {
          const pt = pts[Math.floor(Math.random() * pts.length)];
          const d2 = (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2;
          if (d2 < bestD && d2 > 20) { bestD = d2; best = pt; }
        }
        if (best) {
          p.tx = best.x + (Math.random() - 0.5) * 4;
          p.tz = best.z + (Math.random() - 0.5) * 4;
          p.state = "walk";
        } else {
          p.timer = 2;
        }
      } else if (p.state === "flee" && p.timer <= 0) {
        p.state = "idle";
        p.timer = 2 + Math.random() * 4;
      }

      if (p.state === "idle") {
        p.speed = lerp(p.speed, 0, clamp(8 * dt, 0, 1));
      } else {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        const targetSpeed = p.state === "flee" ? RUN_SPEED : WALK_SPEED;
        p.speed = lerp(p.speed, targetSpeed, clamp(5 * dt, 0, 1));
        if (d > 1.2) {
          const nx = dx / d;
          const nz = dz / d;
          p.angle = Math.atan2(nx, nz);
          p.x += nx * p.speed * dt;
          p.z += nz * p.speed * dt;
        } else if (p.state === "walk") {
          p.state = "idle";
          p.timer = 2 + Math.random() * 6;
        }
        // 撞建筑则换目标
        const world = this.game.world;
        if (world) {
          const hit = world.collideCircle(p.x, p.z, 0.35);
          if (hit) {
            p.x += (hit.dx / hit.d) * 0.4;
            p.z += (hit.dz / hit.d) * 0.4;
            p.state = "idle";
            p.timer = 1;
          }
        }
      }
      p.phase += p.speed * dt * 2.2;
    }
  }

  _syncMeshes(dt) {
    const m4 = this._m4;   // base
    const m4b = this._m4b; // part
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (p.dead && p.deadTimer <= 0) {
        this.bodyInst.setMatrixAt(i, hidden);
        this.headInst.setMatrixAt(i, hidden);
        this.legLInst.setMatrixAt(i, hidden);
        this.legRInst.setMatrixAt(i, hidden);
        this.armLInst.setMatrixAt(i, hidden);
        this.armRInst.setMatrixAt(i, hidden);
        continue;
      }
      // base：位置 + 朝向；死亡时向侧面放倒
      m4.makeRotationY(p.angle);
      if (p.dead) m4.multiply(this._fallM4.makeRotationX(p.fallAngle));
      m4.setPosition(p.x, p.dead ? 0.25 : 0, p.z);

      const swing = p.dead ? 0 : Math.sin(p.phase * 3) * clamp(p.speed / WALK_SPEED, 0, 1.2) * 0.6;
      this._setPart(this.bodyInst, i, m4, 0, 0.98, 0, 0);
      this._setPart(this.headInst, i, m4, 0, 1.45, 0, 0);
      this._setPart(this.legLInst, i, m4, -0.13, 0.32, 0, swing);
      this._setPart(this.legRInst, i, m4, 0.13, 0.32, 0, -swing);
      this._setPart(this.armLInst, i, m4, -0.33, 0.98, 0, -swing * 0.9);
      this._setPart(this.armRInst, i, m4, 0.33, 0.98, 0, swing * 0.9);
    }
    this.bodyInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;
    this.legLInst.instanceMatrix.needsUpdate = true;
    this.legRInst.instanceMatrix.needsUpdate = true;
    this.armLInst.instanceMatrix.needsUpdate = true;
    this.armRInst.instanceMatrix.needsUpdate = true;
  }

  _setPart(inst, idx, baseM4, ox, oy, oz, swing) {
    const m4b = this._m4b;
    m4b.makeRotationX(swing);
    m4b.setPosition(ox, oy, oz);
    m4b.premultiply(baseM4);
    inst.setMatrixAt(idx, m4b);
  }
}
