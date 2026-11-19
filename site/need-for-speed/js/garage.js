/**
 * 车库预览：菜单内 3D 旋转展台（独立小渲染器，不干扰主场景）。
 * 用当前所选车模实际渲染 + 五维性能条（QQ飞车/NFS 手游同款车库布局）。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";
import { CAR_DEFS } from "./sim.js";

const STAT_KEYS = [
  ["速度", (d) => d.maxSpeed / 72],
  ["加速", (d) => d.accel / 32],
  ["操控", (d) => d.steerRate / 2.6],
  ["抓地", (d) => d.gripNormal / 8.6],
  ["氮气", (d) => (d.nitroAccel + d.nitroMaxAdd) / 56],
];

export class Garage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    this.camera.position.set(5.4, 2.3, 5.4);
    this.camera.lookAt(0, 0.5, 0);

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x33383f, 0.85);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 6, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.7);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);

    // 展台
    this.turntable = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 3.1, 0.16, 40),
      new THREE.MeshLambertMaterial({ color: 0x171a20 }),
    );
    disc.position.y = 0.08;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.045, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.17;
    this.turntable.add(disc, ring);
    this.scene.add(this.turntable);

    this.modelHolder = new THREE.Group();
    this.turntable.add(this.modelHolder);

    this._models = {}; // car id -> normalized model
    this._raf = 0;
    this._last = 0;
    this._active = false;
    this._loader = new GLTFLoader();
    this._resize();
  }

  _resize() {
    const w = this.canvas.clientWidth || 360;
    const h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 加载/复用某车型模型（已归一化） */
  async _getModel(carId, modelFile, len) {
    if (this._models[carId]) return this._models[carId];
    const gltf = await new Promise((ok, err) => this._loader.load(`./assets/kits/car/${modelFile}`, ok, undefined, err));
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = Math.min(len / Math.max(size.z, 0.01), 1.9 / Math.max(size.x, 0.01));
    model.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(model);
    const c = box2.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box2.min.y, -c.z);
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._models[carId] = model;
    return model;
  }

  /** 展示某车型 */
  show(carCfg) {
    this._active = true;
    this._getModel(carCfg.id, carCfg.model, carCfg.len).then((model) => {
      this.modelHolder.clear();
      this.modelHolder.add(model);
    }).catch(() => {
      // 加载失败：至少把统计条亮出来
    });
    this._renderStats(carCfg);
    window.addEventListener("resize", () => this._resize());
    if (!this._raf) {
      this._last = performance.now();
      const loop = (t) => {
        if (!this._active) { this._raf = 0; return; }
        const dt = Math.min(0.05, (t - this._last) / 1000);
        this._last = t;
        this.turntable.rotation.y += dt * 0.55;
        this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }

  _renderStats(carCfg) {
    const statsEl = document.getElementById("nfs-car-stats");
    if (!statsEl) return;
    statsEl.innerHTML = "";
    const def = CAR_DEFS[carCfg.id] || {};
    for (const [label, fn] of STAT_KEYS) {
      const v = Math.max(0.05, Math.min(1, fn(def)));
      const row = document.createElement("div");
      row.className = "nfs-stat";
      row.innerHTML = `<span class="nfs-stat-label">${label}</span><div class="nfs-stat-bar"><div class="nfs-stat-fill" style="width:${Math.round(v * 100)}%"></div></div>`;
      statsEl.appendChild(row);
    }
  }

  hide() {
    this._active = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  dispose() {
    this.hide();
    this.renderer.dispose();
  }
}
