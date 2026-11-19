/**
 * 极品飞车 · M1 灰色原型主循环
 * 物理固定步长 1/60；渲染每帧；赛道投影约束 + 检查点/圈速。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";
import { CarSim, makeTrack, projectToTrack, clamp, wrapAngle, buildDef } from "./sim.js";
import { buildTrackMeshes } from "./track.js";
import { buildScenery, buildTrackProps } from "./scenery.js";
import { SkidMarks } from "./skidmarks.js";
import { Input } from "./input.js";
import { TouchControls } from "./touch.js";
import { Garage, tintModel } from "./garage.js";
import { Traffic } from "./traffic.js";
import { RaceManager, RACE_MODES, DIFFS } from "./race.js";
import { Sfx } from "./sfx.js";
import { TrackMap } from "./map.js";
import { isTouch } from "../../assets/js/device.js";

const FIXED_DT = 1 / 60;

// ---------------------------------------------------------------- 菜单配置
const CARS = [
  { id: "mini", name: "Mini 精灵", desc: "灵巧轻量", model: "hatchback-sports.glb", len: 3.5, paint: 0xffd23e, accent: 0x1a1a1a, wheel: 0.86, wing: 0 },
  { id: "street", name: "Street 街头者", desc: "均衡好开", model: "sedan-sports.glb", len: 3.6, paint: 0xde0000, accent: 0x7a0000, wheel: 1.0, wing: 0 },
  { id: "muscle", name: "Muscle 烈马", desc: "大马力后驱", model: "suv.glb", len: 3.9, paint: 0x2050d0, accent: 0x102a6b, wheel: 0.95, wing: 1 },
  { id: "exotic", name: "Exotic 幽灵", desc: "超跑极速", model: "race-future.glb", len: 4.1, paint: 0x7a2bd0, accent: 0x0098d8, wheel: 1.05, wing: 2 },
];

const TODS = [
  { id: "day", name: "白天", sky: 0x87b5d9, fog: [260, 1300], hemiSky: 0xcfe8ff, hemiGnd: 0x3a4030, hemiInt: 0.9, sunCol: 0xfff2dd, sunInt: 1.6, sunPos: [120, 200, 80], fillCol: 0xbfd8ff, fillInt: 0.5, winGlow: 0.0 },
  { id: "dusk", name: "黄昏", sky: 0xeb8c5a, fog: [200, 1000], hemiSky: 0xffc490, hemiGnd: 0x4a3040, hemiInt: 0.6, sunCol: 0xff8a3d, sunInt: 1.2, sunPos: [-170, 70, -40], fillCol: 0x8a6fb0, fillInt: 0.35, winGlow: 0.35 },
];

// ---------------------------------------------------------------- M4 成长：部件/解锁/涂装
const PARTS = [
  { id: "engine", name: "引擎", desc: "极速 +4%/级" },
  { id: "turbo", name: "涡轮", desc: "氮气推力 +6%/级" },
  { id: "tires", name: "轮胎", desc: "抓地 +3%/级" },
  { id: "armor", name: "装甲", desc: "耐久上限 +20/级" },
  { id: "nitro", name: "氮气罐", desc: "氮气容量 +15%/级" },
];
const PART_COST = [100, 180, 300, 450, 650]; // 各级价格
const CAR_PRICE = { mini: 0, street: 0, muscle: 500, exotic: 1200 };
const PAINTS = [
  { id: "stock", name: "原厂", hex: null, special: null },
  { id: "crimson", name: "赤红", hex: 0xd62828 },
  { id: "azure", name: "碧空", hex: 0x2a9df4 },
  { id: "lime", name: "青柠", hex: 0x80b918 },
  { id: "violet", name: "紫电", hex: 0x7b2cbf },
  { id: "gold", name: "鎏金", hex: 0xf1a208 },
  { id: "drift", name: "漂移者", hex: 0xff4fa3, special: "drift" },
  { id: "police", name: "执法者", hex: 0x2545ff, special: "cop" },
];

// M7 疯狂模式：金手指项
const CHEATS = [
  { id: "nitro", name: "无限氮气", desc: "氮气永不消耗" },
  { id: "god", name: "无敌耐久", desc: "HP 锁定满值" },
  { id: "speed", name: "超级速度", desc: "极速与氮气上限 +60%" },
  { id: "rich", name: "无限金币", desc: "金币 ∞，购买免费" },
  { id: "allcars", name: "全车全涂装", desc: "直接解锁全部内容" },
];

const JSON_STORE = {
  get(k, fallback) {
    try {
      const v = store.get(k, null);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(k, v) { store.set(k, JSON.stringify(v)); },
};

const store = {
  get(k, d) { try { return localStorage.getItem("nfs_" + k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("nfs_" + k, v); } catch (e) {} },
};

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
    this.carId = store.get("car", "street");
    if (!CARS.some((c) => c.id === this.carId)) this.carId = "street";
    this.todId = store.get("tod", "day");
    if (!TODS.some((t) => t.id === this.todId)) this.todId = "day";
    this.car = new CarSim(this.carId);
    this._carCfg = CARS.find((c) => c.id === this.carId);
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

    // 比赛管理（M3）
    this.race = new RaceManager(); this.modeId = store.get("mode", "race"); this.diffId = parseInt(store.get("diff", "1"), 10); if (![0, 1, 2].includes(this.diffId)) this.diffId = 1; this.coins = parseInt(store.get("coins", "0"), 10) || 0;
    this.sfx = new Sfx(store.get("mute", "0") === "1");
    this._cdLast = -1;
    this._mapTick = 0;

    // M4 成长：解锁/部件/涂装
    this.owned = JSON_STORE.get("owned_cars", ["mini", "street"]);
    this.modsMap = JSON_STORE.get("mods", {});
    this.paintsUnlocked = JSON_STORE.get("unlocked_paints", ["stock", "crimson", "azure", "lime", "violet", "gold"]);
    this.paintSel = JSON_STORE.get("paint_sel", {});
    this.cheats = Object.assign({}, JSON_STORE.get("cheats", {}));
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
    this.scene.fog = new THREE.Fog(0x87b5d9, 260, 1300);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4030, 0.9);
    this.hemi = hemi;
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
    this.fill = fill;
    this.scene.add(fill);

    this.scene.add(buildTrackMeshes(this.track));
    this.scenery = buildScenery(this.track);
    this.scene.add(this.scenery);
    this.applyTimeOfDay(this.todId);
    this.skid = new SkidMarks(this.scene);
    this.traffic = new Traffic(this.scene, this.track, 8);
    this._buildCarMesh();
    this.garage = new Garage(document.getElementById("nfs-car-preview"));
    this.garage._paintFor = (carId) => {
      const p = PAINTS.find((x) => x.id === (this.paintSel[carId] || "stock"));
      return p ? p.hex : null;
    };
    this.setCar(this.carId);
    this._buildNitroFlames();
    this._buildSmoke();
    this._buildNitroSparks();
    this._bindMenu();
    buildTrackProps(this.track).then((props) => { this.props = props; if (props) this.scene.add(props); }).catch(() => {});
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 3000);
    this.camera.position.set(this.car.x - 8, 3.5, this.car.z - 8);
    this.camera.lookAt(this.car.x, 1, this.car.z);
    this._camPos = this.camera.position.clone();

    this.input.attach();
    this._bindHud();
    // M5：小地图 + 后视镜 + 静音键
    this.map = new TrackMap(document.getElementById("nfs-map"), this.track);
    const rt = new THREE.WebGLRenderTarget(512, 180);
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.repeat.x = -1; // 镜面左右翻转
    this._mirrorRT = rt;
    this._rearCam = new THREE.PerspectiveCamera(72, 512 / 180, 0.1, 600);
    this._overlayScene = new THREE.Scene();
    this._overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture }));
    mq.position.z = 1;
    this._overlayScene.add(mq);
    this._mirrorQuad = mq;
    this._layoutMirror();
    window.addEventListener("keydown", (e) => {
      if ((e.key === "m" || e.key === "M") && !e.repeat) this._toggleMute();
    });
    const muteBtn = document.getElementById("nfs-mute");
    if (muteBtn) {
      muteBtn.addEventListener("click", () => this._toggleMute());
      this._updateMuteBtn(muteBtn);
    }
    const cheatFab = document.getElementById("nfs-cheat-fab");
    const cheatPanel = document.getElementById("nfs-cheat-panel");
    if (cheatFab && cheatPanel) {
      cheatFab.addEventListener("click", () => cheatPanel.classList.toggle("hidden"));
      this._renderCheats();
      // 面板内点击不影响其他
      cheatPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
    }
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

  /** 真实车模；按车型加载 Kenney 低模车（glTF，CC0），失败回退 ferrari 车模。 */
  setCar(id) {
    const cfg = CARS.find((c) => c.id === id);
    if (!cfg) return;
    this.carId = id;
    this._carCfg = cfg;
    this._carLen = cfg.len;
    store.set("car", id);
    const mods = this.modsMap[id] || {};
    this.car = new CarSim(id, mods);
    this._applyCheatSpeed();
    this.updateHudCarLabel();
    // 重置到起跑点
    const s0 = this.track.samples[2];
    this.car.x = s0.x; this.car.z = s0.z;
    this.car.angle = Math.atan2(s0.tx, s0.tz);
    if (this._glbModel) {
      this.carGroup.remove(this._glbModel);
      this._glbModel = null;
    }
    this._proceduralCar.visible = true;
    if (this._glbWheels) this._glbWheels.length = 0;
    this._positionNitroFx();
    const loader = new GLTFLoader();
    loader.load(
      `./assets/kits/car/${cfg.model}`,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const s = Math.min(cfg.len / Math.max(size.z, 0.001), 1.9 / Math.max(size.x, 0.001));
        model.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(model);
        const c = box2.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box2.min.y, -c.z);
        // Kenney 车模原生朝 +Z，无需转 yaw
        tintModel(model, this.garage._paintFor(id));
        model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        // 尾翼（Muscle 大号 / Exotic 高扰流）
        if (cfg.wing) {
          const wing = new THREE.Group();
          const matW = new THREE.MeshLambertMaterial({ color: 0x15161a });
          const span = cfg.wing === 2 ? 2.1 : 1.9;
          const plate = new THREE.Mesh(new THREE.BoxGeometry(span, 0.07, 0.5), matW);
          plate.position.y = cfg.wing === 2 ? 1.06 : 0.92;
          const legs = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.3), matW);
          legs.position.set(-span / 2 + 0.2, 0.78, 0);
          const legs2 = legs.clone(); legs2.position.x = span / 2 - 0.2;
          wing.add(plate, legs, legs2);
          wing.position.set(0, 0, -cfg.len / 2 - 0.02);
          model.add(wing);
        }
        this.carGroup.add(model);
        this._glbModel = model;
        this._proceduralCar.visible = false;
        this._modelYaw = 0;
        this._glbWheels = [];
        this._wheelSpin = 0;
        model.traverse((o) => {
          if (!/wheel-(front|back)-(left|right)/.test(o.name || "")) return;
          o.rotation.order = "YXZ";
          o.rotation.set(0, 0, 0);
          this._glbWheels.push({ pivot: o, front: /wheel-front/.test(o.name) });
        });
        this._positionNitroFx();
        if (this.garage) this.garage.show(cfg, this.modsMap[id] || {});
      },
      undefined,
      () => {
        // 回退：ferrari 车模 + 涂装
        this._loadFerrariFallback(cfg);
      },
    );
  }

  /** 加载失败回退：ferrari.glb 换色（three.js 官方示例，MIT） */
  _loadFerrariFallback(cfg) {
    const loader = new GLTFLoader();
    loader.load(
      "./assets/models/ferrari.glb",
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const s = cfg.len / Math.max(size.z, 0.001);
        model.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(model);
        const c = box2.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box2.min.y, -c.z);
        model.rotation.y = Math.PI;
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mt of mats) {
            if (!mt || !mt.color) continue;
            const nm = mt.name || "";
            if (nm === "Body_Color" || nm === "Leather_red" || /DodgerBlue|Ferrari_Yellow/.test(nm)) {
              mt.color.setHex(nm === "Body_Color" ? cfg.paint : cfg.accent);
            }
          }
        });
        this.carGroup.add(model);
        this._glbModel = model;
        this._proceduralCar.visible = false;
        this._modelYaw = Math.PI;
        this._glbWheels = [];
        this._wheelSpin = 0;
        for (const name of ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]) {
          const pivot = model.getObjectByName(name);
          if (!pivot) continue;
          pivot.rotation.order = "YXZ";
          this._glbWheels.push({ pivot, front: /_(fl|fr)$/.test(name) });
        }
        this._positionNitroFx();
        if (this.garage) this.garage.show(cfg, this.modsMap[this.carId] || {});
      },
      undefined,
      () => {},
    );
  }

  updateHudCarLabel() {
    const el = document.getElementById("nfs-car-label");
    if (el && this._carCfg) el.textContent = `${this._carCfg.name} · ${this._carCfg.desc}`;
  }

  // ------------------------------------------------ M4 购买
  _buyCar(id) {
    const price = this.cheats.rich ? 0 : CAR_PRICE[id] || 0;
    if (this.owned.includes(id)) return;
    if (this.coins < price) {
      this._flashInMenu(`金币不足：${price} 币（当前 ${this.coins}）`);
      return;
    }
    this.coins -= price;
    this.owned.push(id);
    JSON_STORE.set("owned_cars", this.owned);
    store.set("coins", String(this.coins));
    if (this._updateCoins) this._updateCoins();
    if (this._rebuildCarPills) this._rebuildCarPills();
    this.setCar(id);
    if (this._renderM4) this._renderM4();
    this._flashInMenu(`解锁 ${(this._carCfg || {}).name || id}！`);
  }

  _buyPart(partId, cost) {
    if (this.cheats.rich) cost = 0;
    if (this.coins < cost) {
      this._flashInMenu(`金币不足：${cost} 币（当前 ${this.coins}）`);
      return;
    }
    const mods = this.modsMap[this.carId] || {};
    const lvl = mods[partId] || 0;
    if (lvl >= 5) return;
    this.coins -= cost;
    mods[partId] = lvl + 1;
    this.modsMap[this.carId] = mods;
    JSON_STORE.set("mods", this.modsMap);
    store.set("coins", String(this.coins));
    if (this._updateCoins) this._updateCoins();
    this.setCar(this.carId);
    if (this._renderM4) this._renderM4();
    this._flashInMenu("升级完成");
  }

  /** 菜单内 toast（HUD msg 在菜单里不可见） */
  _flashInMenu(text) {
    const menu = document.getElementById("nfs-menu");
    if (!menu) return;
    let el = document.getElementById("nfs-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "nfs-toast";
      menu.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 1600);
  }

  _positionNitroFx() {
    if (!this._nitroFlames) return;
    const z = -(this._carLen || 4) / 2 - 0.12;
    for (const f of this._nitroFlames) f.position.set(f.userData.x, 0.26, z);
  }

  applyTimeOfDay(id) {
    const t = TODS.find((x) => x.id === id) || TODS[0];
    this.todId = t.id;
    store.set("tod", t.id);
    this.scene.background.setHex(t.sky);
    this.scene.fog.color.setHex(t.sky);
    this.scene.fog.near = t.fog[0];
    this.scene.fog.far = t.fog[1];
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGnd);
    this.hemi.intensity = t.hemiInt;
    this.sun.color.setHex(t.sunCol);
    this.sun.intensity = t.sunInt;
    this.sun.position.set(t.sunPos[0], t.sunPos[1], t.sunPos[2]);
    this.fill.color.setHex(t.fillCol);
    this.fill.intensity = t.fillInt;
    const glow = t.winGlow;
    if (this.scenery) {
      for (const mt of this.scenery.userData.winMats || []) {
        mt.emissive && mt.emissive.setRGB(glow, glow * 0.92, glow * 0.78);
        if (glow > 0) { mt.emissiveMap = mt.map; } else if (mt.emissiveMap) { mt.emissiveMap = null; }
        mt.needsUpdate = true;
      }
    }
  }

  /** 氮气尾焰（Sprite，无依赖，程序化车与 glb 车通用） */
  _buildNitroFlames() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(160,240,255,.85)");
    grad.addColorStop(1, "rgba(80,160,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this._nitroFlames = [];
    for (const x of [-0.32, 0.32]) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xbfefff, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.userData.x = x;
      sp.position.set(x, 0.36, -2.35);
      sp.scale.set(0.9, 0.9, 1);
      sp.visible = false;
      this.carGroup.add(sp);
      this._nitroFlames.push(sp);
    }
  }

  /** 氮气喷流粒子：向车尾后方喷出的蓝色火花（明确喷射方向） */
  _buildNitroSparks() {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(140,220,255,.9)");
    grad.addColorStop(1, "rgba(60,120,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    this._sparks = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xcfefff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.scene.add(s);
      this._sparks.push({ s, life: 0, max: 0.32, vx: 0, vy: 0, vz: 0 });
    }
    this._sparkIdx = 0;
    this._sparkTimer = 0;
  }

  _spawnSpark() {
    const c = this.car;
    const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
    const rx = -fz, rz = fx;
    const len = this._carLen || 4;
    const p = this._sparks[this._sparkIdx++ % this._sparks.length];
    const lx = (Math.random() - 0.5) * 0.6;
    const bx = c.x - fx * (len / 2) + rx * lx;
    const bz = c.z - fz * (len / 2) + rz * lx;
    p.s.position.set(bx, 0.3, bz);
    const spd = 9 + Math.random() * 4;
    p.vx = c.vx * 0.35 - fx * spd + (Math.random() - 0.5) * 2;
    p.vz = c.vz * 0.35 - fz * spd + (Math.random() - 0.5) * 2;
    p.vy = 0.5 + Math.random() * 0.8;
    p.life = p.max;
    p.s.visible = true;
    p.s.scale.set(0.3, 0.3, 1);
  }

  _updateSparks(dt) {
    if (this.car.nitroActive) {
      this._sparkTimer -= dt;
      if (this._sparkTimer <= 0) {
        this._sparkTimer = 0.025;
        this._spawnSpark();
        this._spawnSpark();
      }
    }
    for (const p of this._sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.material.opacity = 0.9 * (1 - k);
      const sc = 0.3 + k * 0.25;
      p.s.scale.set(sc, sc, 1);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  /** 漂移烟雾粒子池 （Sprite × 36） */
  _buildSmoke() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, "rgba(225,225,232,.55)");
    grad.addColorStop(0.6, "rgba(205,205,215,.25)");
    grad.addColorStop(1, "rgba(205,205,215,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this._smokes = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.position.set(0, -10, 0);
      this.scene.add(s);
      this._smokes.push({ s, life: 0, max: 0.7 });
    }
    this._smokeIdx = 0;
    this._smokeTimer = 0;
  }

  _spawnSmoke(x, z) {
    const p = this._smokes[this._smokeIdx++ % this._smokes.length];
    p.s.visible = true;
    p.life = p.max;
    p.s.position.set(x + (Math.random() - 0.5) * 0.6, 0.5, z + (Math.random() - 0.5) * 0.6);
    p.s.material.opacity = 0.5;
    p.s.scale.set(0.8, 0.8, 1);
  }

  _updateSmoke(dt) {
    for (const p of this._smokes) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.s.position.y += dt * 1.3;
      p.s.material.opacity = 0.5 * (1 - k);
      const sc = 0.8 + k * 1.8;
      p.s.scale.set(sc, sc, 1);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  _bindHud() {
    this.hud = {
      speed: document.getElementById("nfs-speed"),
      nitroFill: document.getElementById("nfs-nitro-fill"),
      nitroPct: document.getElementById("nfs-nitro-pct"),
      nitroWrap: document.querySelector(".nfs-nitro"),
      lap: document.getElementById("nfs-lap"),
      time: document.getElementById("nfs-time"),
      best: document.getElementById("nfs-best"),
      drift: document.getElementById("nfs-drift"),
      msg: document.getElementById("nfs-msg"),
      racehud: document.getElementById("nfs-racehud"),
      racePos: document.getElementById("nfs-race-pos"),
      raceLap: document.getElementById("nfs-race-lap"),
      raceTime: document.getElementById("nfs-race-time"),
      raceExtra: document.getElementById("nfs-race-extra"),
    };
  }

  start() {
    document.getElementById("nfs-menu").classList.add("hidden");
    document.getElementById("nfs-hud").classList.remove("hidden");
    document.getElementById("nfs-results").classList.add("hidden");
    if (this.touch) this.touch.show();
    // 起跑信号灯变绿
    const lights = this.scenery ? this.scenery.userData.startLights : null;
    if (lights && lights.length) {
      const m = lights[0].material;
      if (m && m.color) m.color.setHex(0x2bff5a);
    }
    if (this.garage) this.garage.hide();
    // 整局重置
    this.lap = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = null;
    this.driftScore = 0;
    this._driftChain = 0;
    this._sProgress = 0;
    this._sPrev = this.track.samples[2].s;
    // 车归位起跑线 + 状态重置
    const s0 = this.track.samples[2];
    this.car.x = s0.x; this.car.z = s0.z;
    this.car.angle = Math.atan2(s0.tx, s0.tz);
    this.car.vx = 0; this.car.vz = 0; this.car.speed = 0;
    this.car.hp = this.car.hpMax || 100; this.car.nitro = 1; this.car.slip = 0;
    this._nitroPrev = false; this._nitroMin = 0;

    if (this.modeId !== "free" && RACE_MODES.some((m) => m.id === this.modeId)) {
      this.race.start(this.modeId, this.diffId, {
        track: this.track,
        scene: this.scene,
        onFinish: (res) => this._onRaceFinish(res),
      });
      document.getElementById("nfs-racehud").classList.remove("hidden");
      this._flash(`${(RACE_MODES.find((m) => m.id === this.modeId) || {}).name || "比赛"} · 准备`);
    } else {
      this.race.stop();
      document.getElementById("nfs-racehud").classList.add("hidden");
      this._flash("自由漫游 · 随心开");
    }

    this.running = true;
    this._last = performance.now();
    this.sfx.resume();
    this._cdLast = -1;
    // M7 疯狂模式：显示金手指入口
    const isCrazy = this.modeId === "crazy";
    document.getElementById("nfs-cheat-fab").classList.toggle("hidden", !isCrazy);
    document.getElementById("nfs-cheat-panel").classList.add("hidden");
    if (isCrazy) this._flash("疯狂模式 · 点右侧「金」开启金手指");
    if (this.hud.msg) this.hud.msg.textContent = "WASD 驾驶 / Space 漂移 / Shift 氮气";
  }

  /** 比赛结束回调（M3 + M4：涂装解锁） */
  _onRaceFinish(res) {
    this.coins += res.coins;
    store.set("coins", String(this.coins));
    if (this._updateCoins) this._updateCoins();
    // 特殊涂装：首次获胜解锁
    if (res.win && res.mode === "drift" && !this.paintsUnlocked.includes("drift")) {
      this.paintsUnlocked.push("drift");
      JSON_STORE.set("unlocked_paints", this.paintsUnlocked);
      res.lines = (res.lines || []).concat(["🎨 解锁涂装「漂移者」"]);
    }
    if (res.win && res.mode === "cop" && !this.paintsUnlocked.includes("police")) {
      this.paintsUnlocked.push("police");
      JSON_STORE.set("unlocked_paints", this.paintsUnlocked);
      res.lines = (res.lines || []).concat(["🎨 解锁涂装「执法者」"]);
    }
    document.getElementById("nfs-res-title").textContent = res.title;
    const lines = (res.lines || []).concat([`获得金币 +${res.coins}`]);
    document.getElementById("nfs-res-lines").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    document.getElementById("nfs-results").classList.remove("hidden");
    this.sfx.stinger(res.win);
  }

  /** 警匪：警车碰撞 */
  _onCopHit(cop, d) {
    // 推开（每帧）
    const nx = (this.car.x - cop.x) / (d || 1);
    const nz = (this.car.z - cop.z) / (d || 1);
    this.car.x += nx * 0.35;
    this.car.z += nz * 0.35;
    const vn = this.car.vx * nx + this.car.vz * nz;
    if (vn < 0) {
      this.car.vx -= nx * vn * 1.3;
      this.car.vz -= nz * vn * 1.3;
    }
    // 伤害冷却 0.4s
    if (this._copHitCd && this._copHitCd > this.time) return;
    this._copHitCd = this.time + 0.4;
    this.car.hp = Math.max(0, this.car.hp - 14);
    this.sfx.hit(0.9);
    this._shake = Math.max(this._shake, 0.09);
    this._flash("🚔 警车撞击！");
  }

  /** 返回主菜单 */
  backToMenu() {
    this.race.stop();
    this.running = false;
    document.getElementById("nfs-hud").classList.add("hidden");
    document.getElementById("nfs-racehud").classList.add("hidden");
    document.getElementById("nfs-results").classList.add("hidden");
    document.getElementById("nfs-cheat-fab").classList.add("hidden");
    document.getElementById("nfs-cheat-panel").classList.add("hidden");
    document.getElementById("nfs-menu").classList.remove("hidden");
    if (this.touch) this.touch.hide();
    if (this.garage && this._carCfg) this.garage.show(this._carCfg, this.modsMap[this._carCfg.id] || {});
  }

  _bindMenu() {
    const carList = document.getElementById("nfs-car-list");
    const todList = document.getElementById("nfs-tod-list");
    const modeList = document.getElementById("nfs-mode-list");
    const diffList = document.getElementById("nfs-diff-list");
    const coinsEl = document.getElementById("nfs-coins");
    const updateCoins = () => {
      if (coinsEl) coinsEl.textContent = this.cheats.rich ? "∞" : String(this.coins);
    };
    this._updateCoins = updateCoins;
    updateCoins();
    const resAgain = document.getElementById("nfs-res-again");
    const resRoam = document.getElementById("nfs-res-roam");
    const resMenu = document.getElementById("nfs-res-menu");
    if (resAgain) resAgain.addEventListener("click", () => {
      document.getElementById("nfs-results").classList.add("hidden");
      this.start();
    });
    if (resRoam) resRoam.addEventListener("click", () => {
      document.getElementById("nfs-results").classList.add("hidden");
      this.race.stop();
      this.running = true;
      this._last = performance.now();
    });
    if (resMenu) resMenu.addEventListener("click", () => this.backToMenu());
    if (modeList) {
      [{ id: "free", name: "自由漫游", desc: "无目标·全城开" }, ...RACE_MODES, { id: "crazy", name: "疯狂模式", desc: "金手指·无限氮气/无敌/极速/无限币" }].forEach((m) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nfs-pill" + (m.id === this.modeId ? " on" : "");
        btn.textContent = m.name;
        btn.title = m.desc;
          btn.addEventListener("click", () => {
            modeList.querySelectorAll(".nfs-pill").forEach((b) => b.classList.remove("on"));
            btn.classList.add("on");
            this.modeId = m.id;
            store.set("mode", m.id);
            if (this._renderCheats) this._renderCheats();
          });
          modeList.appendChild(btn);
        });
      }
    if (diffList) {
      DIFFS.forEach((d) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nfs-pill" + (d.id === this.diffId ? " on" : "");
        btn.textContent = d.name;
        btn.addEventListener("click", () => {
          diffList.querySelectorAll(".nfs-pill").forEach((b) => b.classList.remove("on"));
          btn.classList.add("on");
          this.diffId = d.id;
          store.set("diff", String(d.id));
        });
        diffList.appendChild(btn);
      });
    }
    if (carList) {
      const rebuild = () => {
        carList.innerHTML = "";
        CARS.forEach((c) => {
          const owned = this.owned.includes(c.id);
          const price = CAR_PRICE[c.id] || 0;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "nfs-pill" + (c.id === this.carId ? " on" : "") + (owned ? "" : " locked");
          btn.textContent = owned ? c.name : `🔒 ${c.name} · ${price}币`;
          btn.title = c.desc;
          btn.addEventListener("click", () => {
            if (!this.owned.includes(c.id)) {
              this._buyCar(c.id);
              return;
            }
            carList.querySelectorAll(".nfs-pill").forEach((b) => b.classList.remove("on"));
            btn.classList.add("on");
            this.setCar(c.id);
            if (this._renderM4) this._renderM4();
          });
          carList.appendChild(btn);
        });
      };
      rebuild();
      this._rebuildCarPills = rebuild;
    }
    const paintList = document.getElementById("nfs-paint-list");
    const upgradesEl = document.getElementById("nfs-upgrades");
    const renderM4 = () => {
      // 涂装
      if (paintList) {
        paintList.innerHTML = "";
        PAINTS.forEach((p) => {
          const unlocked = !p.special || this.paintsUnlocked.includes(p.id);
          const cur = (this.paintSel[this.carId] || "stock") === p.id;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "nfs-pill nfs-swatch" + (cur ? " on" : "") + (unlocked ? "" : " locked");
          const hexCss = p.hex ? `#${p.hex.toString(16).padStart(6, "0")}` : "#666";
          btn.innerHTML = `<span class="nfs-swatch-dot" style="background:${hexCss}"></span>${unlocked ? p.name : `🔒 ${p.name}`}`;
          btn.title = p.special ? "特殊比赛解锁" : (p.hex ? "" : "原厂漆");
          btn.addEventListener("click", () => {
            if (unlocked) {
              this.paintSel[this.carId] = p.id;
              JSON_STORE.set("paint_sel", this.paintSel);
              this.setCar(this.carId);
              renderM4();
            } else {
              this._flashInMenu("涂装未解锁：赢得对应比赛");
            }
          });
          paintList.appendChild(btn);
        });
      }
      // 升级
      if (upgradesEl) {
        upgradesEl.innerHTML = "";
        const mods = this.modsMap[this.carId] || {};
        PARTS.forEach((part) => {
          const lvl = mods[part.id] || 0;
          const cost = lvl < 5 ? PART_COST[lvl] : null;
          const row = document.createElement("div");
          row.className = "nfs-up-row";
          const pips = Array.from({ length: 5 }, (_, i) => `<span class="nfs-up-pip ${i < lvl ? "on" : ""}"></span>`).join("");
          row.innerHTML = `
            <span class="nfs-up-name">${part.name}<i>${part.desc}</i></span>
            <span class="nfs-up-pips">${pips}</span>
            <button type="button" class="nfs-up-btn" ${cost === null ? "disabled" : ""}>${cost === null ? "MAX" : `+ ${cost}币`}</button>`;
          const btn = row.querySelector(".nfs-up-btn");
          if (cost !== null) {
            btn.addEventListener("click", () => this._buyPart(part.id, cost));
          }
          upgradesEl.appendChild(row);
        });
      }
      if (this._updateCoins) this._updateCoins();
    };
    this._renderM4 = renderM4;
    renderM4();
    this._renderCheats();
    if (todList) {
      TODS.forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nfs-pill" + (t.id === this.todId ? " on" : "");
        btn.textContent = t.name;
        btn.addEventListener("click", () => {
          todList.querySelectorAll(".nfs-pill").forEach((b) => b.classList.remove("on"));
          btn.classList.add("on");
          this.applyTimeOfDay(t.id);
        });
        todList.appendChild(btn);
      });
    }
  }

  _resize() {
    const portrait = window.innerHeight > window.innerWidth;
    this.camera.fov = portrait ? 74 : 62;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._layoutMirror();
    if (this.garage) this.garage._resize();
  }

  // ------------------------------------------------ 物理推进
  update(dt) {
    this.time += dt;
    const rawInput = this.input.sample();
    this._frameThrottle = rawInput.throttle;
    // 氮气：点按也至少持续 0.55s（QQ 手感，按下即爆发）
    const nitroDown = !!rawInput.nitro;
    if (nitroDown && !this._nitroPrev) this._nitroMin = 0.55;
    this._nitroPrev = nitroDown;
    this._nitroMin = Math.max(0, (this._nitroMin || 0) - dt);
    const input = Object.assign({}, rawInput, { nitro: nitroDown || this._nitroMin > 0 });
    this.car.update(dt, input, { nitroAvailable: true });

    // M7 金手指即时生效
    if (this.cheats.nitro) this.car.nitro = 1;
    if (this.cheats.god) this.car.hp = this.car.hpMax || 100;

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

    const raceActive = this.race.state === "countdown" || this.race.state === "running";
    // 环境车流 + 与车流轻碰撞（比赛中暂停车流）
    if (this.traffic && !raceActive) {
      this._trafficHits = this._trafficHits || [];
      this._trafficHits.length = 0;
      this.traffic.update(dt, this.car.x, this.car.z, this._trafficHits);
      for (const h of this._trafficHits) {
        this.sfx.hit(0.5);
        const d = h.d || 1;
        const nx = h.dx / d, nz = h.dz / d;
        const push = 2.3 - d;
        this.car.x += nx * push * 0.55;
        this.car.z += nz * push * 0.55;
        const vn = this.car.vx * nx + this.car.vz * nz;
        if (vn < 0) {
          this.car.vx -= nx * vn * 1.35;
          this.car.vz -= nz * vn * 1.35;
          if (-vn > 5) {
            this._shake = Math.max(this._shake, 0.06);
            this.cameraShakeStart = this.time;
          }
        }
      }
    }

    // 比赛推进（M3）
    if (raceActive) {
      this.race.setCtxInfo({ playerProg: this._sProgress, driftScore: this.driftScore + this._driftChain, hp: this.car.hp });
      this.race.update(dt, {
        playerProg: this._sProgress,
        playerLap: this.lap,
        playerX: this.car.x,
        playerZ: this.car.z,
        playerVx: this.car.vx,
        playerVz: this.car.vz,
        playerHp: this.car.hp,
        driftScore: this.driftScore + this._driftChain,
        onCopHit: (cop, d) => this._onCopHit(cop, d),
      });
      if (this.race.state === "countdown" && this.hud.msg) {
        this.hud.msg.textContent = `准备 ${Math.ceil(this.race.countdown)}…`;
      }
      // M5 倒计时哔
      const rc = Math.ceil(this.race.countdown);
      if (this.race.state === "countdown" && rc !== this._cdLast && rc > 0) {
        this._cdLast = rc;
        this.sfx.beepCountdown(false);
      } else if (this.race.state === "running" && this._cdLast !== 0) {
        this._cdLast = 0;
        this.sfx.beepCountdown(true);
      }
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

    // 漂移轮胎痕（后轮两道）
    const fxx = Math.sin(this.car.angle), fzz = Math.cos(this.car.angle);
    // 右向 = (-fz, 0, fx)
    const rxx = -fzz, rzz = fxx;
    const len = this._carLen || 4;
    const rearLz = -(len * 0.32);
    const rearLx = len * 0.22;
    const driftingNow = this.car.drifting && Math.abs(this.car.slip) > 0.1 && Math.abs(this.car.speed) > 6;
    if (driftingNow) {
      if (!this._lastRear) this._lastRear = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
      let ax = 0, az = 0;
      for (let k = 0; k < 2; k++) {
        const lx = k === 0 ? -rearLx : rearLx;
        const wx = this.car.x + rxx * lx + fxx * rearLz;
        const wz = this.car.z + rzz * lx + fzz * rearLz;
        const last = this._lastRear[k];
        this.skid.add(last.x, last.z, wx, wz);
        last.x = wx; last.z = wz;
        ax += wx; az += wz;
      }
      ax /= 2; az /= 2;
      this._smokeTimer -= dt;
      if (this._smokeTimer <= 0) {
        this._smokeTimer = 0.05;
        this._spawnSmoke(ax, az);
      }
      // 漂移镜头反馈：起漂冲击 + 持续轻微震动（不再狂抖）
      if (!this._wasDrifting) this._shake = Math.max(this._shake, 0.12);
      else if (Math.abs(this.car.slip) > 0.22) this._shake = Math.max(this._shake, 0.022);
      this._wasDrifting = true;
    } else {
      this._lastRear = null;
      this._wasDrifting = false;
    }
    this._updateSmoke(dt);
    this._updateSparks(dt);

    // 氮气尾焰：激活时显示并闪炼
    for (let i = 0; i < this._nitroFlames.length; i++) {
      const f = this._nitroFlames[i];
      const on = this.car.nitroActive;
      f.visible = on;
      if (on) {
        const s = 0.75 + Math.random() * 0.4;
        f.scale.set(s, s, 1);
      }
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
    const rx = -fz, rz = fx; // 右侧方向（facing (sin,cos) 时右 = (-fz, 0, fx)）
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
    // FOV 随速度；氮气时额外拉广
    const targetFov = 60 + clamp(c.kmh / 220, 0, 1) * 22 + (c.nitroActive ? 7 : 0);
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
      // M5 音效：引擎/漂移/氮气
      this.sfx.update(this.car.speed, this._frameThrottle || 0, Math.abs(this.car.slip), this.car.nitroActive);
      // M5 小地图（降额到 ~20Hz）
      if (++this._mapTick >= 3) {
        this._mapTick = 0;
        const others = [];
        if (this.race.cops) for (const c of this.race.cops) if (c.model) others.push({ x: c.x, z: c.z, color: "#4f7bff", r: 3 });
        if (this.race.cars) for (const a of this.race.cars) if (a.model) others.push({ x: a.x, z: a.z, color: "#ff5a5a", r: 3 });
        if (this.traffic && this.traffic.cars) for (const v of this.traffic.cars) if (v.x !== undefined) others.push({ x: v.x, z: v.z, color: "#cfd6e4", r: 2 });
        this.map.draw(this.running ? this.car : null, others.filter((o) => o.color === "#ff5a5a"), others.filter((o) => o.color !== "#ff5a5a"));
      }
    }
    this.renderer.render(this.scene, this.camera);
    // M5 后视镜：车尾视角渲到 RT 再叠加到顶部（隔帧刷新，省一个 pass）
    if (this.running && this._mirrorRT && (this._frameCount = (this._frameCount || 0) + 1) >= 2) {
      this._frameCount = 0;
      this._layoutMirror();
      const fx = Math.sin(this.car.angle), fz = Math.cos(this.car.angle);
      this._rearCam.position.set(this.car.x, 1.45, this.car.z);
      this._rearCam.lookAt(this.car.x - fx * 24, 1.1, this.car.z - fz * 24);
      this.renderer.setRenderTarget(this._mirrorRT);
      this.renderer.render(this.scene, this._rearCam);
      this.renderer.setRenderTarget(null);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this._overlayScene, this._overlayCam);
      this.renderer.autoClear = true;
    }
    requestAnimationFrame((tt) => this._frame(tt));
  }

  _layoutMirror() {
    if (!this._mirrorQuad) return;
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h > w;
    const mw = portrait ? Math.min(w * 0.46, 230) : Math.min(w * 0.32, 440);
    const mh = mw * (180 / 512);
    this._mirrorQuad.scale.set((mw / w) * 2, (mh / h) * 2, 1);
    // 竖屏：顶部居中（P 名次下方）；横屏：底部居中（避开顶部 HUD）
    const raceHud = !document.getElementById("nfs-racehud").classList.contains("hidden");
    const margin = portrait ? (raceHud ? 66 : 38) : 14;
    const y = portrait ? 1 - (margin + mh) / h : -1 + (margin + mh) / h;
    this._mirrorQuad.position.set(0, y, 1);
  }

  _toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    store.set("mute", this.sfx.muted ? "1" : "0");
    const btn = document.getElementById("nfs-mute");
    if (btn) this._updateMuteBtn(btn);
  }

  _updateMuteBtn(btn) {
    btn.textContent = this.sfx.muted ? "🔇" : "🔊";
    btn.title = this.sfx.muted ? "已静音（M）" : "声音开（M）";
  }

  // ------------------------------------------------ M7 疯狂模式
  _applyCheatSpeed() {
    if (!this.car) return;
    const base = buildDef(this.carId, this.modsMap[this.carId] || {});
    const k = this.cheats.speed ? 1.6 : 1;
    this.car.def.maxSpeed = base.maxSpeed * k;
    this.car.def.nitroMaxAdd = base.nitroMaxAdd * k;
  }

  _renderCheats() {
    const isCrazy = this.modeId === "crazy";
    const menuEl = document.getElementById("nfs-cheats");
    if (menuEl) {
      menuEl.innerHTML = "";
      if (!isCrazy) {
        menuEl.innerHTML = '<div class="nfs-cheat-hint">切换到「疯狂模式」后开启金手指</div>';
      } else {
        CHEATS.forEach((c) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "nfs-pill" + (this.cheats[c.id] ? " on" : "");
          btn.textContent = `${c.name} ${this.cheats[c.id] ? "·开" : "·关"}`;
          btn.title = c.desc;
          btn.addEventListener("click", () => this._toggleCheat(c.id));
          menuEl.appendChild(btn);
        });
      }
    }
    const panelEl = document.getElementById("nfs-cheat-panel");
    if (panelEl) {
      panelEl.innerHTML = "<h3>金手指 · 疯狂模式</h3>";
      if (!isCrazy) {
        panelEl.innerHTML += '<div class="nfs-cheat-hint">请先在菜单选择「疯狂模式」</div>';
      } else {
        CHEATS.forEach((c) => {
          const row = document.createElement("div");
          row.className = "nfs-cheat-row";
          row.innerHTML = `<span>${c.name}<i style="display:block;font-style:normal;font-size:9px;opacity:.6">${c.desc}</i></span>`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = this.cheats[c.id] ? "on" : "";
          btn.textContent = this.cheats[c.id] ? "开" : "关";
          btn.addEventListener("click", () => this._toggleCheat(c.id));
          row.appendChild(btn);
          panelEl.appendChild(row);
        });
      }
    }
  }

  _toggleCheat(id) {
    this.cheats[id] = !this.cheats[id];
    JSON_STORE.set("cheats", this.cheats);
    const c = CHEATS.find((x) => x.id === id) || { name: id };
    if (id === "rich") {
      if (this.cheats.rich) { this._coinsBeforeRich = this.coins; this.coins = 99999; }
      else { this.coins = this._coinsBeforeRich || 0; }
      store.set("coins", String(this.coins));
      if (this._updateCoins) this._updateCoins();
    }
    if (id === "allcars" && this.cheats.allcars) {
      this.owned = CARS.map((x) => x.id);
      this.paintsUnlocked = PAINTS.map((x) => x.id);
      JSON_STORE.set("owned_cars", this.owned);
      JSON_STORE.set("unlocked_paints", this.paintsUnlocked);
      if (this._rebuildCarPills) this._rebuildCarPills();
      if (this._renderM4) this._renderM4();
    }
    if (id === "speed") this._applyCheatSpeed();
    this._renderCheats();
    const msg = `${c.name}：${this.cheats[id] ? "开" : "关"}`;
    if (this.running) this._flash(msg);
    else this._flashInMenu(msg);
  }

  _updateHud() {
    const h = this.hud;
    if (!h.speed) return;
    h.speed.textContent = String(Math.round(this.car.kmh));
    if (h.nitroFill) h.nitroFill.style.width = `${Math.round(this.car.nitro * 100)}%`;
    if (h.nitroPct) h.nitroPct.textContent = `${Math.round(this.car.nitro * 100)}%`;
    if (h.nitroWrap) h.nitroWrap.classList.toggle("full", this.car.nitro > 0.985);
    // 触屏氮气按钮：环形进度（剩余量）
    const nb = document.querySelector(".tc-nitro");
    if (nb) {
      const pct = this.car.nitro * 100;
      nb.style.background = `conic-gradient(rgba(255,209,102,.85) ${pct * 3.6}deg, rgba(255,255,255,.12) 0deg)`;
    }
    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = (s % 60).toFixed(2).padStart(5, "0");
      return `${m}:${sec}`;
    };
    if (h.lap) h.lap.textContent = `圈 ${this.lap + 1}`;
    if (h.time) h.time.textContent = fmt(this.time - this.lapStart);
    if (h.best) h.best.textContent = this.bestLap ? `最佳 ${fmt(this.bestLap)}` : "最佳 --";
    if (h.drift) h.drift.textContent = `漂移 ${this.driftScore + Math.round(this._driftChain)}`;
    // 比赛 HUD（M3）
    if (this.hud.racePos && (this.race.state === "countdown" || this.race.state === "running")) {
      this.hud.racePos.textContent = this.race.state === "countdown" ? "预备" : `P${this.race.playerRank(this._sProgress)}`;
      if (this.race.mode === "drift") {
        this.hud.raceLap.textContent = `漂移 ${Math.round(this.driftScore + this._driftChain)}`;
      } else {
        this.hud.raceLap.textContent = `圈 ${Math.min(this.lap + 1, this.race.laps)}/${this.race.laps}`;
      }
      this.hud.raceTime.textContent = this.race.state === "countdown" ? "准备中" : fmt(this.race.time);
      let extra = "";
      if (this.race.mode === "drift") extra = `剩余 ${Math.ceil(this.race.timeLeft)}s`;
      else if (this.race.mode === "elim") extra = `淘汰倒数 ${Math.ceil(this.race.elimTimer)}s`;
      else if (this.race.mode === "cop") extra = `耐久 ${Math.max(0, Math.round(this.car.hp))}`;
      this.hud.raceExtra.textContent = extra;
    }
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
