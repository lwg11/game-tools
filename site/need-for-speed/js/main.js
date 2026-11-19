/**
 * 极品飞车 · M1 灰色原型主循环
 * 物理固定步长 1/60；渲染每帧；赛道投影约束 + 检查点/圈速。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";
import { CarSim, makeTrack, projectToTrack, clamp, wrapAngle } from "./sim.js";
import { buildTrackMeshes } from "./track.js";
import { Input } from "./input.js";
import { TouchControls } from "./touch.js";
import { isTouch } from "../../assets/js/device.js";

const FIXED_DT = 1 / 60;

// ---------------------------------------------------------------- 世界尺寸
const TRACK_POINTS = [
  [0, 0], [300, -10], [450, 90], [430, 300], [260, 420], [20, 400],
  [-190, 430], [-380, 330], [-430, 120], [-280, -40], [-120, -40],
];

class Game {
  constructor() {
    this.running = false;
    this.headless = false;
    this.track = makeTrack(TRACK_POINTS, { sampleStep: 4, halfWidth: 11 });
    this.car = new CarSim("street");
    this.touch = isTouch ? new TouchControls(document.body) : null;
    this.input = new Input(this.touch);

    // 出生点：起跑线后 3 个采样
    const s0 = this.track.samples[2];
    this.car.x = s0.x; this.car.z = s0.z;
    this.car.angle = Math.atan2(s0.tx, s0.tz);

    this.hint = 0;
    this.lap = 0;
    this.lapStart = 0;
    this.time = 0;
    this.bestLap = null;
    this.lapTimes = [];
    this.driftScore = 0;
    this._driftChain = 0;
    this._accum = 0;
    this._last = performance.now();
    this._shake = 0;
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById("app").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d9); // 原型: 白天
    this.scene.fog = new THREE.Fog(0x87b5d9, 220, 900);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4030, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(120, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 900;
    this.sun = sun;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.5);
    fill.position.set(-90, 130, -110);
    this.scene.add(fill);

    this.scene.add(buildTrackMeshes(this.track));
    this._buildCarMesh();
    this._loadCarModel();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 3000);
    this.camera.position.set(this.car.x - 8, 3.5, this.car.z - 8);
    this.camera.lookAt(this.car.x, 1, this.car.z);
    this._camPos = this.camera.position.clone();

    this.input.attach();
    this._bindHud();
    if (this.touch) {
      document.getElementById("nfs-keys-pc").style.display = "none";
      document.getElementById("nfs-keys-touch").style.display = "block";
    }
    document.addEventListener("touchmove", (e) => { if (this.running) e.preventDefault(); }, { passive: false });
    window.addEventListener("resize", () => this._resize());

    document.getElementById("nfs-btn-start").addEventListener("click", () => this.start());
    requestAnimationFrame((t) => this._frame(t));
  }

  _buildCarMesh() {
    const g = new THREE.Group();
    const grey = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2e3237 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1b2735 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.5, 4.1), grey);
    body.position.y = 0.55;
    body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.48, 2.0), glass);
    cabin.position.set(0, 0.99, -0.1);
    cabin.castShadow = true;
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), dark);
    spoiler.position.set(0, 0.95, -2.0);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.4), dark);
    bumper.position.set(0, 0.4, 2.05);
    g.add(body, cabin, spoiler, bumper);

    // 车轮
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    const offs = [
      [-0.82, 0.36, 1.32, true], [0.82, 0.36, 1.32, true],
      [-0.82, 0.36, -1.32, false], [0.82, 0.36, -1.32, false],
    ];
    for (const [x, y, z, front] of offs) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      pivot.userData.front = front;
      g.add(pivot);
      this.wheels.push(pivot);
    }
    // 与 glb 车模共享位姿的独立容器（隐藏程序化车壳时不能隐藏 carGroup 本身）
    this.carGroup = new THREE.Group();
    this.carGroup.add(g);
    this._proceduralCar = g;
    this.scene.add(this.carGroup);
  }

  /** 真实 glTF 车模（ferrari.glb，three.js 示例模型，MIT），失败则保留程序化回退 */
  _loadCarModel() {
    const loader = new GLTFLoader(); // 无压缩 glb：无需 Draco/worker，兼容严格 CSP
    loader.load(
      "./assets/models/ferrari.glb",
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const s = 4.3 / Math.max(size.z, 0.001);
        model.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(model);
        const c = box2.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box2.min.y, -c.z);
        model.rotation.y = Math.PI; // 车模原生朝 -Z，转到 +Z
        model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.carGroup.add(model);
        if (this._proceduralCar) this._proceduralCar.visible = false;
        this._modelYaw = Math.PI;
        this._glbWheels = [];
        this._wheelSpin = 0;
        for (const name of ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]) {
          const pivot = model.getObjectByName(name);
          if (!pivot) continue;
          pivot.rotation.order = "YXZ";
          this._glbWheels.push({ pivot, front: /_(fl|fr)$/.test(name) });
        }
      },
      undefined,
      () => { /* 加载失败：保持程序化回退 */ }
    );
  }

  _bindHud() {
    this.hud = {
      speed: document.getElementById("nfs-speed"),
      nitroFill: document.getElementById("nfs-nitro-fill"),
      lap: document.getElementById("nfs-lap"),
      time: document.getElementById("nfs-time"),
      best: document.getElementById("nfs-best"),
      drift: document.getElementById("nfs-drift"),
      msg: document.getElementById("nfs-msg"),
    };
  }

  start() {
    document.getElementById("nfs-menu").classList.add("hidden");
    document.getElementById("nfs-hud").classList.remove("hidden");
    if (this.touch) this.touch.show();
    this.running = true;
    this._last = performance.now();
    if (this.hud.msg) this.hud.msg.textContent = "WASD 驾驶 / Space 漂移 / Shift 氮气";
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ------------------------------------------------ 物理推进
  update(dt) {
    this.time += dt;
    const input = this.input.sample();
    this.car.update(dt, input, { nitroAvailable: true });

    // 赛道约束：投影 → 路肩推回 + 出界拖慢
    const p = projectToTrack(this.track, this.car.x, this.car.z, this.hint);
    this.hint = p.i;
    this._lastProj = { lat: p.lateral, s: p.s, i: p.i };
    const half = this.track.halfWidth;
    const lat = p.lateral;
        const afx = this.track.samples[p.i].nx, afz = this.track.samples[p.i].nz;
    if (Math.abs(lat) > half - 0.9) {
      const over = Math.abs(lat) - (half - 0.9);
      const sign = Math.sign(lat);
      // 推回
      this.car.x -= afx * sign * over;
      this.car.z -= afz * sign * over;
      // 法向速度：贴墙滑行（只消除向外墙分量并轻微反弹，保留切向速度）
      const vn = this.car.vx * afx * sign + this.car.vz * afz * sign;
      if (vn > 0) {
        this.car.vx -= afx * sign * vn * 1.05;
        this.car.vz -= afz * sign * vn * 1.05;
        if (vn > 7) {
          this.car.hp = Math.max(0, this.car.hp - vn * 0.5);
          this._shake = Math.min(0.6, vn * 0.025);
        }
      }
      // 贴墙时车头向赛道切线自动回正（街机墙滑体验）
      const sm = this.track.samples[p.i];
      const tangentAng = Math.atan2(sm.tx, sm.tz);
      let diff = tangentAng - this.car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.car.angle = wrapAngle(this.car.angle + diff * clamp(3.0 * dt, 0, 1));
    } else if (Math.abs(lat) > half + 2) {
      // 草地/缓冲区：轻度拖慢（原型），并自动把车头往赛道方向带（防卡死）
      this.car.vx *= Math.exp(-0.55 * dt);
      this.car.vz *= Math.exp(-0.55 * dt);
      const smG = this.track.samples[p.i];
      const tangentG = Math.atan2(smG.tx, smG.tz);
      const diffG = wrapAngle(tangentG - this.car.angle);
      this.car.angle = wrapAngle(this.car.angle + diffG * clamp(1.5 * dt, 0, 1));
    }

    // 圈速：跟踪 s 序列单调，累计前进距离超过一圈长度 = 过线
    this._sPrev = this._sPrev ?? p.s;
    let ds = p.s - this._sPrev;
    if (ds < -this.track.length / 2) ds += this.track.length; // 正向回绕
    if (ds > this.track.length / 2) ds -= this.track.length;
    this._sProgress = (this._sProgress ?? 0) + ds;
    this._sPrev = p.s;
    const lapDist = this.track.length;
    if (this._sProgress >= lapDist) {
      this._sProgress -= lapDist;
      this.lap += 1;
      const t = this.time - this.lapStart;
      this.lapStart = this.time;
      this.lapTimes.push(t);
      if (!this.bestLap || t < this.bestLap) this.bestLap = t;
      this._flash(`第 ${this.lap + 1} 圈 · 上圈 ${t.toFixed(2)}s`);
    }

    // 漂移分
    if (Math.abs(this.car.slip) > 0.14 && Math.abs(this.car.speed) > 8) {
      this._driftChain += Math.abs(this.car.slip) * Math.abs(this.car.speed) * dt * 12;
    } else if (this._driftChain > 0) {
      this.driftScore += Math.round(this._driftChain);
      if (this._driftChain > 40) this._flash(`漂移 +${Math.round(this._driftChain)}`);
      this._driftChain = 0;
    }

    // 视觉同步
    this.carGroup.position.set(this.car.x, 0, this.car.z);
    this.carGroup.rotation.y = this.car.angle + (this._modelYaw || 0);
    const spin = (this.car.speed / 0.36) * dt;
    if (this._glbWheels && this._glbWheels.length) {
      this._wheelSpin = (this._wheelSpin ?? 0) + spin;
      for (const w of this._glbWheels) {
        w.pivot.rotation.y = w.front ? this.car.steerVis : 0;
        w.pivot.rotation.x = this._wheelSpin;
      }
    } else {
      for (const w of this.wheels) {
        w.children[0].rotation.x += spin;
        if (w.userData.front) w.rotation.y = this.car.steerVis;
      }
    }

    // 相机
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const c = this.car;
    const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
    const rx = fz, rz = -fx; // 右侧方向
    const back = 6.6 + c.kmh * 0.03;
    const up = 2.0 + c.kmh * 0.008;
    const side = 1.35;
    const tx = c.x - fx * back + rx * side;
    const tz = c.z - fz * back + rz * side;
    const k = clamp(6 * dt, 0, 1);
    this._camPos.x += (tx - this._camPos.x) * k;
    this._camPos.y += (up - this._camPos.y) * k;
    this._camPos.z += (tz - this._camPos.z) * k;
    let sx = 0, sz = 0;
    if (this._shake > 0.001) {
      sx = (Math.random() - 0.5) * this._shake;
      sz = (Math.random() - 0.5) * this._shake;
      this._shake *= Math.exp(-6 * dt);
    }
    this.camera.position.set(this._camPos.x + sx, this._camPos.y, this._camPos.z + sz);
    this.camera.lookAt(c.x + fx * 3.5, 1.0, c.z + fz * 3.5);
    // FOV 随速度
    const targetFov = 60 + clamp(c.kmh / 220, 0, 1) * 22;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * clamp(3 * dt, 0, 1);
      this.camera.updateProjectionMatrix();
    }
  }

  _flash(text) {
    if (!this.hud.msg) return;
    this.hud.msg.textContent = text;
    this.hud.msg.dataset.until = String(this.time + 2.2);
  }

  // ------------------------------------------------ 主循环
  _frame(t) {
    const dt = Math.min(0.1, (t - this._last) / 1000);
    this._last = t;
    if (this.running) {
      this._accum += dt;
      let steps = 0;
      while (this._accum >= FIXED_DT && steps < 4) {
        this.update(FIXED_DT);
        this._accum -= FIXED_DT;
        steps++;
      }
      this._updateHud();
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((tt) => this._frame(tt));
  }

  _updateHud() {
    const h = this.hud;
    if (!h.speed) return;
    h.speed.textContent = String(Math.round(this.car.kmh));
    if (h.nitroFill) h.nitroFill.style.width = `${Math.round(this.car.nitro * 100)}%`;
    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = (s % 60).toFixed(2).padStart(5, "0");
      return `${m}:${sec}`;
    };
    if (h.lap) h.lap.textContent = `圈 ${this.lap + 1}`;
    if (h.time) h.time.textContent = fmt(this.time - this.lapStart);
    if (h.best) h.best.textContent = this.bestLap ? `最佳 ${fmt(this.bestLap)}` : "最佳 --";
    if (h.drift) h.drift.textContent = `漂移 ${this.driftScore + Math.round(this._driftChain)}`;
    if (h.msg && this.time > +(this.hud.msg.dataset.until || 0)) h.msg.textContent = "WASD 驾驶 / Space 漂移 / Shift 氮气";
  }

  dispose() {
    this.renderer.dispose();
  }
}

// ------------------------------------------------ 启动
const game = new Game();
game.init();
window.__nfs = game; // 调试句柄
