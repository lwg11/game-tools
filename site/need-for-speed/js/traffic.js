/**
 * 环境车流（M2）：沿赛道右车道巡航的市民车辆（Kenney car kit）。
 * 纯运动学（不参与物理），与玩家发生轻碰撞（推挤 + 火花由调用方处理）。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";

const DEFAULT_MODELS = ["taxi.glb", "sedan-sports.glb", "van.glb", "truck.glb", "delivery.glb"];
const TINTS = [0xffffff, 0xffd166, 0xff4fa3, 0x4fc3ff, 0x8aff6a, 0xff6a5a, 0xd7a4ff, 0xfff2cc];

export class Traffic {
  /**
   * @param {THREE.Scene} scene
   * @param {{samples:Array, halfWidth:number}} track
   * @param {number} count
   */
  constructor(scene, track, count = 8) {
    this.scene = scene;
    this.track = track;
    this.group = new THREE.Group();
    this.models = [];   // 已加载模型模板
    this.cars = [];
    this._loader = new GLTFLoader();
    this._loaded = false;
    this._readyPromise = null;

    const spacing = 4; // 采样步长（与 makeTrack sampleStep 对齐）
    this._spacing = spacing;
    const S = track.samples;
    const N = count;
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(((i + 1) / (N + 1)) * S.length);
      const lane = ((i % 2) - 0.5) * 5.2; // 右车道内侧两条
      this.cars.push({
        idx,
        lane,
        speed: 8 + Math.random() * 5,
        model: null,
        tint: TINTS[i % TINTS.length],
        tintApplied: false,
      });
    }
    scene.add(this.group);

    this._readyPromise = this._load();
  }

  async _load() {
    const files = DEFAULT_MODELS;
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      const gltf = await new Promise((ok, err) => this._loader.load(`./assets/kits/car/${f}`, ok, undefined, err)).catch(() => null);
      if (gltf) this.models.push(gltf.scene);
    }
    if (!this.models.length) return;
    for (const c of this.cars) {
      const template = this.models[Math.floor(Math.random() * this.models.length)];
      const model = template.clone(true);
      // 归一化到与玩家车相近的长度（Kenney 原始尺寸偏小）
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = Math.min(3.9 / Math.max(size.z, 0.01), 1.9 / Math.max(size.x, 0.01));
      model.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(model);
      const ctr = box2.getCenter(new THREE.Vector3());
      model.position.set(-ctr.x, -box2.min.y, -ctr.z);
      // 每车独立材质 tint
      model.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.color) m.color.lerp(new THREE.Color(c.tint), 0.35);
        }
        o.castShadow = true;
      });
      c.model = model;
      this.group.add(model);
    }
    this._loaded = true;
  }

  /** 每帧驱动；与玩家碰撞把结果写入 hits（push 由 main 处理） */
  update(dt, playerX, playerZ, hits) {
    if (!this._loaded) return;
    const S = this.track.samples;
    const n = S.length;
    for (const c of this.cars) {
      c.idx = (c.idx + (c.speed * dt) / this._spacing) % n;
      const i0 = Math.floor(c.idx) % n;
      const i1 = (i0 + 1) % n;
      const k = c.idx - Math.floor(c.idx);
      const a = S[i0], b = S[i1];
      const x = a.x + (b.x - a.x) * k + (a.nx + (b.nx - a.nx) * k) * c.lane;
      const z = a.z + (b.z - a.z) * k + (a.nz + (b.nz - a.nz) * k) * c.lane;
      const yaw = Math.atan2(a.tx + (b.tx - a.tx) * k, a.tz + (b.tz - a.tz) * k);
      c.model.position.set(x, 0, z);
      c.model.rotation.y = yaw;
      c.x = x; c.z = z;
      const dx = playerX - x, dz = playerZ - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.4 * 2.4) hits.push({ x, z, dx, dz, d: Math.sqrt(d2) });
    }
  }

  get ready() { return this._readyPromise; }
}
