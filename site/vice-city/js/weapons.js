/**
 * 罪恶都市 · 武器射击
 * ------------------------------------------------------------
 * 5 种武器（拳头/手枪/Uzi/霰弹/步枪）：半自动/全自动、弹丸散布、
 * 曳光池、枪口闪光、命中判定（ pedestrians / 车辆 / 建筑 raymarch ），
 * 射击后坐上跳、通缉联动（枪声/伤人升星）。
 */
import * as THREE from "../lib/three.module.min.js";
import { clamp } from "./common.js";

export const WEAPONS = {
  fist: { name: "拳头", icon: "👊", melee: true, rate: 0.45, damage: 12, range: 1.9, arc: 0.6 },
  pistol: { name: "马格南手枪", icon: "🔫", rate: 0.38, damage: 16, range: 60, auto: false, spread: 0.008, pellets: 1, kick: 0.008 },
  uzi: { name: "乌兹冲锋枪", icon: "🔫", rate: 0.085, damage: 8, range: 46, auto: true, spread: 0.035, pellets: 1, kick: 0.004 },
  shotgun: { name: "霰弹枪", icon: "💥", rate: 0.9, damage: 9, range: 24, auto: false, spread: 0.1, pellets: 6, kick: 0.02 },
  rifle: { name: "突击步枪", icon: "🎯", rate: 0.11, damage: 18, range: 90, auto: true, spread: 0.02, pellets: 1, kick: 0.005 },
};

const PLAYER_WEAPON_ORDER = ["fist", "pistol", "uzi", "shotgun", "rifle"];
const UNLOCKED_AT_START = 1; // 初始只有拳头+手枪

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
    this._prevFire = false;
    this._prevDigits = [false, false, false, false, false];
    this._buildFx();
  }

  // ------------------------------------------------------------ 选择
  get weapons() {
    return this.game.player.weapons;
  }

  get current() {
    return WEAPONS[this.weapons[this.game.player.weaponIndex]];
  }

  select(idOrIndex) {
    const p = this.game.player;
    let idx;
    if (typeof idOrIndex === "number") {
      idx = clamp(idOrIndex, 0, p.weapons.length - 1);
    } else {
      idx = p.weapons.indexOf(idOrIndex);
      if (idx < 0) return false;
    }
    p.weaponIndex = idx;
    this.game.setWeapon(this.current.icon, this.current.name, "");
    if (!this.game.headless) this.game.showToast(`切换到 ${this.current.name}`);
    return true;
  }

  cycle(dir = 1) {
    const p = this.game.player;
    const n = p.weapons.length;
    const idx = (p.weaponIndex + dir + n) % n;
    return this.select(idx);
  }

  unlock(idOrIndex) {
    const p = this.game.player;
    const idx = typeof idOrIndex === "number" ? idOrIndex : PLAYER_WEAPON_ORDER.indexOf(idOrIndex);
    if (idx < 0 || idx >= PLAYER_WEAPON_ORDER.length) return false;
    const id = PLAYER_WEAPON_ORDER[idx];
    if (!p.weapons.includes(id)) {
      p.weapons.push(id);
      if (!this.game.headless) this.game.showToast(`获得武器：${WEAPONS[id].name}`);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 帧更新
  update(dt) {
    this.cooldown -= dt;
    const g = this.game;
    const p = g.player;
    if (!p) return;

    // 换武器（数字键 + Q 键），均为 edge 触发
    for (let i = 0; i < 5; i++) {
      const down = g.input.isDown("Digit" + (i + 1));
      if (down && !this._prevDigits[i]) this.select(i);
      this._prevDigits[i] = down;
    }
    if (g.input.isDown("KeyQ") && !this._prevQ) this.cycle(1);
    this._prevQ = g.input.isDown("KeyQ");

    // 仅在地上时可用武器
    if (p.inVehicle) return;

    const w = this.current;
    const firing = g.input.firing() && !g.paused;
    // 半自动需要松开扳机；自动武器按住即可（rate 限制射速）
    if (firing && this.cooldown <= 0 && (w.auto || !this._prevFire)) {
      if (w.melee) this._melee(w);
      else this._shoot(w);
      this.cooldown = w.rate;
    }
    this._prevFire = firing;

    // 曳光衰减
    this._updateFx(dt);
  }

  // ------------------------------------------------------------ 近战
  _melee(w) {
    const g = this.game;
    const p = g.player;
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    let hitPed = null;
    for (const ped of g.peds.peds) {
      if (ped.dead) continue;
      const dx = ped.x - p.pos.x;
      const dz = ped.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range) continue;
      const dot = (dx / (d || 1)) * fx + (dz / (d || 1)) * fz;
      if (dot > 1 - w.arc) { hitPed = ped; break; }
    }
    if (hitPed) {
      hitPed.dead = true;
      hitPed.fallAngle = p.angle;
      hitPed.deadTimer = 8;
      g.onPedHit && g.onPedHit(null, hitPed);
      if (g.police) g.police.reportCrime(1);
    }
    if (g.sfx && g.sfx.playMelee) g.sfx.playMelee();
    p._punchT = 0.12; // 挥拳动画（后续 player 渲染使用）
  }

  // ------------------------------------------------------------ 射击
  _shoot(w) {
    const g = this.game;
    const p = g.player;
    const cam = g.camera;
    // 命中扫描从相机（准星）出发，保证“指哪打哪”；曳光与枪口焰从玩家枪口出发
    const origin = new THREE.Vector3(cam.position.x, cam.position.y - 0.12, cam.position.z);

    // 基向量（相机朝向）
    const baseDir = new THREE.Vector3();
    cam.getWorldDirection(baseDir);

    // ADS 时散布降低 55%
    const spread = w.spread * (1 - 0.55 * (g._aimK || 0));
    // 枪口世界位置（右手前伸）
    const mx = p.pos.x + Math.sin(p.angle) * 0.5 + Math.cos(p.angle) * 0.3;
    const mz = p.pos.z + Math.cos(p.angle) * 0.5 - Math.sin(p.angle) * 0.3;

    let anyHit = false;
    for (let i = 0; i < w.pellets; i++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      if (dir.y > 0.2) dir.y = 0.2; // 禁止对天开枪
      dir.normalize();
      const end = this._hitscan(origin, dir, w.range, w.damage);
      this._spawnTracer(mx, 1.32, mz, end.x, end.y, end.z);
      this._muzzleFlash(mx, 1.32, mz);
      if (end.hit) anyHit = true;
    }

    // 后坐力：镜头上跳 + 喇叭音量
    g.cameraPitch = clamp(g.cameraPitch + w.kick * 0.5, -0.05, 1.15);
    g.onFire && g.onFire(w);
    if (g.sfx && g.sfx.playShot) g.sfx.playShot(this.weapons[p.weaponIndex]);
    if (anyHit && g.police) g.police.reportCrime(1); // 枪声引起注意
    g.peds.panicAt(p.pos.x, p.pos.z, 30);
  }

  /**
   * 命中扫描：先查行人，再查车辆，最后沿射线步进找建筑
   * @returns {{x,y,z,hit}} 命中点
   */
  _hitscan(origin, dir, range, damage) {
    const g = this.game;
    let bestT = range;
    let hit = false;

    // 行人
    for (const ped of g.peds.peds) {
      if (ped.dead) continue;
      const t = this._rayCircle(origin, dir, ped.x, ped.z, 0.45);
      if (t !== null && t < bestT) {
        bestT = t;
        hit = true;
        ped.dead = true;
        ped.fallAngle = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 0.5;
        ped.deadTimer = 8;
        if (g.police) g.police.reportCrime(2);
        g.onPedHit && g.onPedHit(null, ped);
      }
    }

    // 车辆（所有系统 + 任务追击者）
    const carGroups = [g.vehicles.cars, g.traffic ? g.traffic.cars : [], g.police ? g.police.cars.map((c) => c.car) : []];
    if (g.missions && g.missions._runner && !g.missions._runner.car.dead) {
      carGroups.push([g.missions._runner.car]);
    }
    for (const list of carGroups) {
      for (const car of list) {
        if (car.dead) continue;
        const t = this._rayCircle(origin, dir, car.pos.x, car.pos.z, car.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          hit = true;
          car.damage(damage);
        }
      }
    }

    // 建筑：raymarch 碰撞
    if (!hit) {
      const step = 2.0;
      for (let t = 2; t < bestT; t += step) {
        const x = origin.x + dir.x * t;
        const z = origin.z + dir.z * t;
        const probe = g.world.collideCircle(x, z, 0.45);
        if (probe) {
          bestT = t;
          hit = true;
          break;
        }
      }
    }

    return {
      x: origin.x + dir.x * bestT,
      y: Math.max(0.05, origin.y + dir.y * bestT),
      z: origin.z + dir.z * bestT,
      hit,
    };
  }

  /** 射线与 XZ 圆的最近交点 t（3D 距离），未命中返回 null */
  _rayCircle(origin, dir, cx, cz, r) {
    // XZ 方向归一化（dir 为 3D 单位向量，XZ 分量可能 <1）
    const dx = dir.x;
    const dz = dir.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    const ux = dx / len;
    const uz = dz / len;
    const ox = origin.x - cx;
    const oz = origin.z - cz;
    const b = ox * ux + oz * uz;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t / len : null;
  }

  // ------------------------------------------------------------ 特效池
  _buildFx() {
    if (this.game.headless) return;
    this.tracers = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo.clone(), mat);
      line.frustumCulled = false;
      this.game.scene.add(line);
      this.tracers.push({ line, t: 0 });
    }
    // 枪口闪光：小方块
    this.muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0 }),
    );
    this.muzzle.frustumCulled = false;
    this.game.scene.add(this.muzzle);
    this._muzzleT = 0;
  }

  _spawnTracer(x1, y1, z1, x2, y2, z2) {
    if (this.game.headless || !this.tracers) return;
    let best = this.tracers[0];
    for (const t of this.tracers) {
      if (t.t <= 0) { best = t; break; }
      if (t.t < best.t) best = t;
    }
    // 从枪口（而不是相机原点）到命中点
    const pos = best.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1);
    pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    best.t = 0.07;
    best.line.material.opacity = 0.9;
  }

  _muzzleFlash(x, y, z) {
    if (this.game.headless || !this.muzzle) return;
    this.muzzle.position.set(x, y, z);
    this._muzzleT = 0.05;
    this.muzzle.material.opacity = 0.95;
  }

  /** 供警察 AI 生成弹道 */
  fireTracer(x1, y1, z1, x2, y2, z2, color = 0xffe08a) {
    if (this.game.headless || !this.tracers) return;
    this._spawnTracer(x1, y1, z1, x2, y2, z2);
  }

  _updateFx(dt) {
    if (this.game.headless || !this.tracers) return;
    for (const t of this.tracers) {
      if (t.t > 0) {
        t.t -= dt;
        t.line.material.opacity = Math.max(0, t.t / 0.07) * 0.9;
      }
    }
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      this.muzzle.material.opacity = Math.max(0, this._muzzleT / 0.05) * 0.95;
    }
  }
}

export { PLAYER_WEAPON_ORDER, UNLOCKED_AT_START };
