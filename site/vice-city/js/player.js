/**
 * 罪恶都市 · 玩家
 * ------------------------------------------------------------
 * 步行（相机相对移动/奔跑/碰撞）与驾驶（油门/刹车/倒车/转向/手刹漂移）
 * 状态机，E 键上下最近车辆；程序化小人模型（走路摆腿摆臂动画）。
 * 武器/生命值模块在后续 commit 扩展（update 预留接口）。
 */
import * as THREE from "../lib/three.module.min.js";
import { WORLD, PALETTE, clamp, lerp, angleLerp } from "./common.js";

const WALK_SPEED = 4.5;
const RUN_SPEED = 8.5;
const PLAYER_RADIUS = 0.55;

export class Player {
  constructor(game) {
    this.game = game;
    const spawn = game.world ? game.world.spawnPoint : { x: 0, z: 0 };
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.angle = 0;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.radius = PLAYER_RADIUS;
    this.hp = 100;
    this.maxHp = 100;
    this.armor = 0;
    this.money = 0;
    this.vehicle = null;
    this.prevE = false;
    this.headless = game.headless;
    this._walkPhase = 0;

    // 武器（commit 5 扩展）
    this.weapons = ["fist"];
    this.weaponIndex = 0;

    this._buildMesh();
  }

  get inVehicle() {
    return !!this.vehicle;
  }

  _buildMesh() {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b890 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: PALETTE.player });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x2e1d12 });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

    // 躯干 + 肩部 + 衣领 + 拉链 + 腰带
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), shirtMat);
    body.position.y = 0.98;
    body.castShadow = true;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.22), new THREE.MeshLambertMaterial({ color: 0xf0d0a8 }));
    collar.position.set(0, 1.31, 0.02);
    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.52, 0.02), darkMat);
    zipper.position.set(0, 0.98, 0.155);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.34), shirtMat);
    shoulders.position.y = 1.26;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.34), darkMat);
    belt.position.y = 0.70;

    // 颈 + 头 + 头发 + 眼睛
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), skinMat);
    neck.position.y = 1.33;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
    head.position.y = 1.47;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.34), hairMat);
    hair.position.set(0, 0.13, -0.02);
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), hairMat);
    hairBack.position.set(0, 0.02, -0.15);
    const hairSideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.26), hairMat);
    hairSideL.position.set(-0.16, 0.0, -0.02);
    const hairSideR = hairSideL.clone();
    hairSideR.position.x = 0.16;
    // 鼻
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.05), skinMat);
    nose.position.set(0, -0.02, 0.16);
    head.add(hair, hairBack, hairSideL, hairSideR, nose);
    // 眼白 + 瞳孔 + 眉
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    const browMat = new THREE.MeshLambertMaterial({ color: 0x2e1d12 });
    for (const sx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), whiteMat);
      eye.position.set(sx, 0.0, 0.155);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.03, 0.012), darkMat);
      pupil.position.set(0, 0, 0.012);
      eye.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.02), browMat);
      brow.position.set(sx, 0.085, 0.155);
      head.add(eye, brow);
    }

    // 手臂（袖 + 手）
    const mkArm = (sx) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.16), shirtMat);
      arm.position.set(0.33 * sx, 1.06, 0);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.13), skinMat);
      hand.position.set(0, -0.29, 0);
      arm.add(hand);
      return arm;
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);

    // 武器（持枪时显示，挂在右手）
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), darkMat);
    gun.position.set(0, -0.34, 0.14);
    gun.visible = false;
    armR.add(gun);

    // 腿（裤 + 鞋）
    const mkLeg = (sx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), pantsMat);
      leg.position.set(0.13 * sx, 0.32, 0);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoeMat);
      shoe.position.set(0, -0.26, 0.05);
      leg.add(shoe);
      return leg;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);

    g.add(body, collar, zipper, shoulders, belt, neck, head, armL, armR, legL, legR);
    this.legL = legL;
    this.legR = legR;
    this.armL = armL;
    this.armR = armR;
    this.body = body;
    this.gun = gun;
    this.group = g;
    this.aiming = false;
    if (!this.headless) this.game.scene.add(g);
  }

  /** 持枪状态可视化 */
  showGun(on) {
    if (this.gun) this.gun.visible = !!on;
  }

  // ------------------------------------------------------------ 上下车
  enterVehicle(car) {
    this.vehicle = car;
    car.occupiedBy = "player";
    if (this.group) this.group.visible = false;
    if (this.game.onEnterVehicle) this.game.onEnterVehicle(car);
  }

  exitVehicle() {
    const car = this.vehicle;
    if (!car) return;
    // 车右侧向量（局部 +X 旋转到世界）
    const rx = Math.cos(car.angle);
    const rz = -Math.sin(car.angle);
    let nx = car.pos.x + rx * 2.4;
    let nz = car.pos.z + rz * 2.4;
    const world = this.game.world;
    if (world) {
      if (world.collideCircle(nx, nz, this.radius)) {
        nx = car.pos.x - rx * 2.4;
        nz = car.pos.z - rz * 2.4;
        if (world.collideCircle(nx, nz, this.radius)) {
          nx = car.pos.x;
          nz = car.pos.z + 3.0;
        }
      }
    }
    this.pos.set(nx, 0, nz);
    this.vx = car.vx * 0.4;
    this.vz = car.vz * 0.4;
    this.angle = car.angle;
    car.occupiedBy = null;
    this.vehicle = null;
    if (this.group) this.group.visible = true;
    if (this.game.onExitVehicle) this.game.onExitVehicle(car);
  }

  toggleVehicle() {
    if (this.vehicle) {
      this.exitVehicle();
      return;
    }
    const vs = this.game.vehicles;
    if (!vs) return;
    const car = vs.nearestEnterable(this.pos.x, this.pos.z, 3.4);
    if (car) this.enterVehicle(car);
  }

  // ------------------------------------------------------------ 主更新
  update(dt) {
    // 对话/过场期间冻结移动输入（世界照常运转，仅交互被接管）
    if (this.game._dialogOpen) {
      this.vx = 0;
      this.vz = 0;
      this.speed = 0;
      return;
    }
    const k = this.game.input;
    // E / 触屏（✋/🚗）：edge 触发；任务发放人跟前由任务系统独占，避免同帧上车
    const m = this.game.missions;
    const e = (k.isDown("KeyE") || !!k.touchButtons["car"] || !!k.touchButtons["use"])
      && !(m && m.offerInteract);
    if (e && !this.prevE) this.toggleVehicle();
    this.prevE = e;

    if (this.vehicle) this._drive(dt);
    else this._walk(dt);

    // 生命自然缓慢恢复（疯狂模式/脱战 5 秒后 3/s）
    if (this.hp > 0 && this.hp < this.maxHp) {
      this._regenT = (this._regenT || 0) + dt;
      if (this._regenT > 5) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    } else {
      this._regenT = 0;
    }
  }

  _walk(dt) {
    const axes = this.game.input.moveAxes();
    const run = this.game.input.isDown("ShiftLeft") || this.game.input.isDown("ShiftRight");
    const speedMax = run ? RUN_SPEED : WALK_SPEED;

    const yaw = this.game.cameraYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // A/D（含右摇杆）为屏幕横向：相机系右向 = (-cos yaw, sin yaw)
    const strafe = axes.x + this.game.input.touchLookX;
    const dx = fx * -axes.y - Math.cos(yaw) * strafe;
    const dz = fz * -axes.y + Math.sin(yaw) * strafe;
    const target = Math.hypot(dx, dz);

    this.speed = lerp(this.speed, target * speedMax, clamp(10 * dt, 0, 1));
    if (target > 0.01) {
      const nx = dx / target;
      const nz = dz / target;
      this.vx = nx * this.speed;
      this.vz = nz * this.speed;
      this.angle = Math.atan2(nx, nz);
    } else {
      this.vx = 0;
      this.vz = 0;
    }

    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    // 碰撞
    const world = this.game.world;
    if (world) {
      const hit = world.collideCircle(this.pos.x, this.pos.z, this.radius);
      if (hit) {
        this.pos.x += (hit.dx / hit.d) * (this.radius - hit.d);
        this.pos.z += (hit.dz / hit.d) * (this.radius - hit.d);
      }
    }
    limPos(this.pos, WORLD.half - 4);

    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.angle;
    this._animate(dt);
  }

  _drive(dt) {
    const car = this.vehicle;
    if (!car || car.dead) {
      if (this.vehicle) this.exitVehicle();
      return;
    }
    const axes = this.game.input.moveAxes();
    // D = 右转（正舵量使车头向 +X 偏 = 屏幕左，故取负）
    const strafe = axes.x + this.game.input.touchLookX;
    let steer = -clamp(strafe, -1, 1);
    const handbrake = this.game.input.isDown("Space") || !!this.game.input.touchButtons["brake"];
    const throttle = -axes.y;

    car.drive(clamp(throttle, -1, 1), clamp(steer, -1, 1), !!handbrake, dt, this.game.world);
    this.pos.set(car.pos.x, 0, car.pos.z);
    this.vx = car.vx;
    this.vz = car.vz;
    this.angle = car.angle;

    // 警灯效果
    if (car.def.police && this.game.worldHour >= 0) {
      const t = performance.now() * 0.006;
      const on = Math.sin(t) > 0;
      if (car.lightbarRed) car.lightbarRed.visible = on;
      if (car.lightbarBlue) car.lightbarBlue.visible = !on;
    }
  }

  _animate(dt) {
    if (this.aiming) {
      // 据枪姿势：右手前伸、左手托举
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.3, clamp(10 * dt, 0, 1));
      this.armL.rotation.x = lerp(this.armL.rotation.x, -0.85, clamp(10 * dt, 0, 1));
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0, clamp(8 * dt, 0, 1));
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0, clamp(8 * dt, 0, 1));
      return;
    }
    if (this.speed > 0.3) {
      this._walkPhase += dt * (4 + this.speed * 1.2);
      const s = Math.sin(this._walkPhase);
      this.legL.rotation.x = s * 0.65;
      this.legR.rotation.x = -s * 0.65;
      this.armL.rotation.x = -s * 0.5;
      this.armR.rotation.x = s * 0.5;
    } else {
      for (const limb of [this.legL, this.legR, this.armL, this.armR]) {
        limb.rotation.x = lerp(limb.rotation.x, 0, clamp(8 * dt, 0, 1));
      }
    }
  }

  /** 相机跟随目标（供 game._updateCamera 使用） */
  getCameraTarget() {
    if (this.vehicle) {
      return { x: this.vehicle.pos.x, z: this.vehicle.pos.z, angle: this.vehicle.angle, inCar: true };
    }
    return { x: this.pos.x, z: this.pos.z, angle: this.angle, inCar: false };
  }

  /** 当前坐标 */
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // ------------------------------------------------------------ 伤害
  /** 受到伤害（警察/车辆冲撞/后续武器） */
  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** 短暂僵直（被车撞） */
  stagger() {
    this.speed = 0;
  }
}

// ------------------------------------------------------------ 工具
function limPos(p, lim) {
  p.x = clamp(p.x, -lim, lim);
  p.z = clamp(p.z, -lim, lim);
}
