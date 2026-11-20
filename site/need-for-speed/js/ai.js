/**
 * AI 对手（M3）：沿赛道样条巡航，速度按难度 + 橡皮筋。
 * 简化物理（运动学），不做漂移；提供与玩家的轻碰撞。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";

let _models = null;
let _loading = null;
export async function loadAIModels(loaderPath = "./assets/kits/racing") {
  if (_models) return _models;
  if (!_loading) {
    _loading = (async () => {
      const loader = new GLTFLoader();
      const files = ["raceCarRed.glb", "raceCarOrange.glb", "raceCarWhite.glb", "raceCarGreen.glb"];
      const out = [];
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        const g = await new Promise((ok, err) => loader.load(`${loaderPath}/${f}`, ok, undefined, err)).catch(() => null);
        if (g) out.push(g.scene);
      }
      _models = out;
      return out;
    })();
  }
  return _loading;
}

export class AICar {
  /**
   * @param {THREE.Scene} scene
   * @param {{samples,length,halfWidth}} track
   * @param {{name,color,model,speed,lane,startS}} opts
   */
  constructor(scene, track, opts) {
    this.track = track;
    this.name = opts.name || "AI";
    this.colorHex = opts.color ?? 0xffffff;
    this.modelTemplate = opts.model || null;
    this.scene = scene;
    this.baseSpeed = opts.speed ?? 24;
    this.laneBase = opts.lane ?? 0;
    this._idx = 0;         // 浮点采样索引
    this.progress = 0;     // 已跑总距离（含圈）
    this.startS = opts.startS ?? 0;
    this.finished = false;
    this.finishTime = 0;
    this.rank = opts.rank ?? 0;
    this.isCop = !!opts.isCop;
    this.copTarget = opts.copTarget ?? null; // 警匪：追踪对象引用
    this.copOffset = opts.copOffset ?? { x: 0, z: 0 };
    this.model = null;
    this.active = true;
    this.weave = Math.random() * Math.PI * 2;
    this._tmp = new THREE.Vector3();
    // M8 碰撞/损伤
    this.hp = 100;
    this.wrecked = false;
    this.vx = 0; this.vz = 0;         // 估算速度（碰撞相对速度用）
    this.pushX = 0; this.pushZ = 0;   // 碰撞位移偏移（逐帧衰减）
    loadAIModels().then((models) => {
      if (!models.length || !this.active) return;
      const template = this.modelTemplate || models[Math.floor(Math.random() * models.length)];
      const model = template.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = Math.min(4.0 / Math.max(size.z, 0.01), 1.95 / Math.max(size.x, 0.01));
      model.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box2.min.y, -c.z);
      model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.model = model;
      this.scene.add(model);
      this._sync(0);
    });
  }

  /** 受击（机炮/火箭/撞车共用）→ 击毁停机冒烟 */
  hurt(d) {
    if (this.wrecked || !this.active) return;
    this.hp = Math.max(0, this.hp - d);
    if (this.hp <= 0) {
      this.wrecked = true;
      if (this.model) {
        this.model.rotation.z = (Math.random() - 0.5) * 0.35;
        this.model.rotation.x = -0.06;
      }
    }
  }

  /** 碰撞推挤位移（偏移随时间衰减回轨道） */
  push(nx, nz) {
    this.pushX += nx;
    this.pushZ += nz;
  }

  setGrid(startS, lane) {
    this.startS = startS;
    this.laneBase = lane;
    this.progress = 0;
    this.finished = false;
    if (this.model) this.model.visible = true;
    this._computeXZ();
    if (this.model) this._sync(0);
  }

  deactivate() {
    this.active = false;
    if (this.model) this.model.visible = false;
  }

  /** 計算赛道位置（不依赖模型；同步设置 this.x/this.z） */
  _computeXZ() {
    const T = this.track.length;
    const sPos = ((this.startS + this.progress) % T + T) % T;
    const n = this.track.samples.length;
    const idxF = (sPos / T) * n;
    const i0 = Math.floor(idxF) % n;
    const i1 = (i0 + 1) % n;
    const k = idxF - Math.floor(idxF);
    const a = this.track.samples[i0], b = this.track.samples[i1];
    this.weave = (this.weave || 0) + 0.016;
    const lane = this.laneBase + (this.eliminated ? 0 : Math.sin(this.weave) * 0.8);
    // 碰撞位移衰减
    this.pushX *= 0.9; this.pushZ *= 0.9;
    const x = a.x + (b.x - a.x) * k + (a.nx + (b.nx - a.nx) * k) * lane + this.pushX;
    const z = a.z + (b.z - a.z) * k + (a.nz + (b.nz - a.nz) * k) * lane + this.pushZ;
    this.x = x; this.z = z;
    return { x, z, a, b, k };
  }

  /** 更新模型位姿（不推進） */
  _sync(dt) {
    if (!this.model) return;
    const sPos = ((this.startS + this.progress) % (this.track.length) + this.track.length) % this.track.length;
    const n = this.track.samples.length;
    const idxF = (sPos / this.track.length) * n;
    const i0 = Math.floor(idxF) % n;
    const i1 = (i0 + 1) % n;
    const k = idxF - Math.floor(idxF);
    const a = this.track.samples[i0], b = this.track.samples[i1];
    this.model.position.set(this.x, 0, this.z);
    this.model.rotation.y = Math.atan2(a.tx + (b.tx - a.tx) * k, a.tz + (b.tz - a.tz) * k);
  }

  /**
   * @param {number} dt
   * @param {number} playerProgress 玩家累计距离（用于橡皮筋）
   * @param {number} raceLength 比赛总长度（到达即完赛）
   */
  update(dt, playerProgress, raceLength) {
    if (!this.model || this.finished || this.wrecked) return;
    // 橡皮筋：落后玩家加速 / 领先放水
    const diff = playerProgress - this.progress;
    const k = Math.max(-0.12, Math.min(0.18, diff / 90));
    const speed = this.baseSpeed * (1 + k);
    this.progress += speed * dt;
    if (raceLength && this.progress >= raceLength) {
      this.finished = true;
    }
    const xz = this._computeXZ();
    const yaw = Math.atan2(xz.a.tx + (xz.b.tx - xz.a.tx) * xz.k, xz.a.tz + (xz.b.tz - xz.a.tz) * xz.k);
    this.vx = Math.sin(yaw) * speed;
    this.vz = Math.cos(yaw) * speed;
    this._sync(dt);
  }

  /** 警匪模式：朝目标点（玩家附近）行驶，速度更快带拦截偏移 */
  updateCop(dt, targetX, targetZ, enabled) {
    if (!this.model || !enabled || this.wrecked) return;
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = this.baseSpeed;
    this.pushX *= 0.9; this.pushZ *= 0.9;
    this.model.position.x += (dx / d) * speed * dt + this.pushX;
    this.model.position.z += (dz / d) * speed * dt + this.pushZ;
    this.model.rotation.y = Math.atan2(dx, dz);
    this.vx = (dx / d) * speed + this.pushX * 4;
    this.vz = (dz / d) * speed + this.pushZ * 4;
    this.x = this.model.position.x; this.z = this.model.position.z;
  }

  dispose() {
    this.active = false;
    if (this.model) this.scene.remove(this.model);
  }
}
