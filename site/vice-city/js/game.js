/**
 * 罪恶都市 · 主类
 * ------------------------------------------------------------
 * 职责：Three.js 场景/相机/光照/昼夜、输入管理、主循环、HUD 绑定、游戏流程。
 * 玩法模块（城市/载具/行人/警察/任务）通过 this.* 挂载并在 this.update 中驱动。
 *
 * headless 模式（冒烟测试用）：new ViceCityGame({ headless: true })
 * 仅创建场景图与游戏逻辑，不创建 WebGLRenderer、不绑定 DOM。
 */
import * as THREE from "../lib/three.module.min.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { toast, icon } from "../../assets/js/ui.js";
import { audio } from "../../assets/js/audio.js";
import { isCrazy, applyBodyMode } from "../../assets/js/mode.js";
import { isMobile } from "../../assets/js/device.js";
import {
  WORLD, DAY_LENGTH, TIME, PALETTE, clamp, lerp, angleLerp, rgbaOf,
} from "./common.js";
import { buildWorld } from "./city.js";
import { Player } from "./player.js";
import { VehicleSystem } from "./vehicle.js";
import { PedestrianSystem } from "./ped.js";
import { PoliceSystem } from "./police.js";
import { TrafficSystem } from "./traffic.js";
import { SfxSystem } from "./sfx.js";
import { MissionSystem } from "./missions.js";
import { WeaponSystem, WEAPONS, PLAYER_WEAPON_ORDER, UNLOCKED_AT_START } from "./weapons.js";

// 固定步长
const STEP = 1 / 60;
const MAX_DT = 0.1;

// ---------------------------------------------------------------- 输入
class InputManager {
  constructor(game) {
    this.game = game;
    this.keys = Object.create(null);
    this.mouseFire = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.touchMove = { x: 0, y: 0 };   // 移动端左摇杆（-1..1）
    this.touchLookX = 0;               // 移动端右摇杆（转向/视角）
    this.touchLookY = 0;
    this.touchFire = false;            // 移动端射击
    this.touchButtons = Object.create(null); // A/B/上车/手刹
    this.pointerLocked = false;

    if (!game.headless) {
      window.addEventListener("keydown", (e) => {
        if (e.code === "Tab") e.preventDefault();
        // 对话推进键阻止默认（空格翻页/回车按钮重触发）
        if (game._dialogOpen && (e.code === "Space" || e.code === "Enter" || e.code === "KeyE")) {
          e.preventDefault();
        }
        this.keys[e.code] = true;
        game.onKey(e.code, true);
      });
      window.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
        game.onKey(e.code, false);
      });
      const canvas = game.canvas;
      if (canvas) {
        canvas.addEventListener("mousedown", (e) => {
          if (e.button === 0) this.mouseFire = true;
          canvas.requestPointerLock && canvas.requestPointerLock();
          if (this.game.sfx && this.game.sfx.unlock) this.game.sfx.unlock();
        });
        window.addEventListener("mouseup", (e) => {
          if (e.button === 0) this.mouseFire = false;
        });
        window.addEventListener("mousemove", (e) => {
          if (this.pointerLocked || e.buttons === 1) {
            this.lookDX += e.movementX || 0;
            this.lookDY += e.movementY || 0;
          }
        });
        document.addEventListener("pointerlockchange", () => {
          this.pointerLocked = document.pointerLockElement === canvas;
        });
      }
      this._initTouch();
    }
  }

  // ------------------------------------------------------------ 移动端触屏控件
  _initTouch() {
    // 左摇杆：移动/驾驶油门与转向；右摇杆：横移/转向 + 纵推视角
    const bindStick = (id, onMove) => {
      const el = document.getElementById(id);
      if (!el) return;
      const knob = el.querySelector(".vc-stick-knob");
      const R = 52;
      let pid = null;
      let cx = 0;
      let cy = 0;
      const apply = (nx, ny) => {
        onMove(nx, ny);
        if (knob) {
          knob.style.transform = nx || ny
            ? `translate(${nx * R * 0.6}px, ${ny * R * 0.6}px)`
            : "";
        }
      };
      el.addEventListener("pointerdown", (e) => {
        pid = e.pointerId;
        if (el.setPointerCapture) el.setPointerCapture(pid);
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const len = Math.hypot(dx, dy);
        const s = len > R ? R / len : 1;
        apply((dx * s) / R, (dy * s) / R);
        e.preventDefault();
      });
      el.addEventListener("pointermove", (e) => {
        if (pid === null || e.pointerId !== pid) return;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const len = Math.hypot(dx, dy);
        const s = len > R ? R / len : 1;
        apply((dx * s) / R, (dy * s) / R);
        e.preventDefault();
      });
      const end = (e) => {
        if (pid === null || e.pointerId !== pid) return;
        pid = null;
        apply(0, 0);
        e.preventDefault();
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    };
    bindStick("vc-stick-left", (x, y) => {
      this.touchMove.x = x;
      this.touchMove.y = y;
    });
    bindStick("vc-stick-right", (x, y) => {
      this.touchLookX = x;
      this.touchLookY = y;
      if (y) this.lookDY -= y * 3.2; // 纵推调俯仰
    });
    // 动作键：A=开火 B=上/下车 🚗=上/下车 🛑=手刹
    const bindBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("pointerdown", (e) => { onDown(); e.preventDefault(); });
      el.addEventListener("pointerup", () => onUp && onUp());
      el.addEventListener("pointercancel", () => onUp && onUp());
    };
    bindBtn("vc-tb-a", () => { this.touchFire = true; }, () => { this.touchFire = false; });
    bindBtn("vc-tb-b", () => { this.touchButtons["use"] = true; }, () => { this.touchButtons["use"] = false; });
    bindBtn("vc-tb-car", () => { this.touchButtons["car"] = true; }, () => { this.touchButtons["car"] = false; });
    bindBtn("vc-tb-brake", () => { this.touchButtons["brake"] = true; }, () => { this.touchButtons["brake"] = false; });
  }

  isDown(code) {
    return !!this.keys[code];
  }

  /** 组合移动输入（WASD + 摇杆），输出 -1..1 */
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) y -= 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) y += 1;
    x += this.touchMove.x;
    y += this.touchMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  firing() {
    return this.mouseFire || this.touchFire || (this.isDown("Space") && !this.game.inVehicle);
  }

  consumeLook() {
    const d = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return d;
  }
}

// ---------------------------------------------------------------- 昼夜
function skyColorFor(hour) {
  // 关键帧: [hour, skyColor, fogColor, sunColor, sunIntensity, hemiIntensity, ambient]
  const keys = [
    [0.0, "#0a1030", "#0a1030", "#9fb8ff", 0.10, 0.30],
    [4.5, "#0e1a3a", "#101a34", "#8fa8e8", 0.12, 0.32],
    [5.5, "#3a2a5a", "#4a3560", "#ffb37a", 0.35, 0.45],
    [7.0, "#7a6abf", "#9a8ab8", "#ffd0a0", 0.75, 0.65],
    [9.0, "#4f9fe8", "#8fc4e8", "#fff2d8", 1.10, 0.85],
    [16.0, "#4a90d8", "#8fb8d8", "#ffedc0", 1.05, 0.80],
    [18.5, "#b85a8a", "#d88a6a", "#ff9a5a", 0.55, 0.55],
    [20.0, "#2a1a4a", "#33204a", "#b89ad8", 0.22, 0.40],
    [22.0, "#0a1030", "#0a1030", "#9fb8ff", 0.10, 0.30],
    [24.0, "#0a1030", "#0a1030", "#9fb8ff", 0.10, 0.30],
  ];
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (hour >= keys[i][0] && hour <= keys[i + 1][0]) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const t = clamp((hour - a[0]) / Math.max(0.0001, b[0] - a[0]), 0, 1);
  const mix = (c1, c2) => {
    const p1 = parseInt(c1.slice(1), 16);
    const p2 = parseInt(c2.slice(1), 16);
    const r = Math.round(lerp((p1 >> 16) & 255, (p2 >> 16) & 255, t));
    const g = Math.round(lerp((p1 >> 8) & 255, (p2 >> 8) & 255, t));
    const bl = Math.round(lerp(p1 & 255, p2 & 255, t));
    return (r << 16) | (g << 8) | bl;
  };
  return {
    sky: mix(a[1], b[1]),
    fog: mix(a[2], b[2]),
    sun: mix(a[3], b[3]),
    sunI: lerp(a[4], b[4], t),
    hemiI: lerp(a[5], b[5], t),
  };
}

function isNight(hour) {
  return hour >= TIME.night || hour < TIME.dawn;
}

// ---------------------------------------------------------------- 主类
export class ViceCityGame {
  constructor(opts = {}) {
    this.headless = !!opts.headless;
    this.canvas = this.headless ? null : document.getElementById("game-canvas");
    this.crazy = isCrazy();
    if (!this.headless) applyBodyMode();

    // 进度与账号
    this.store = new ProgressStore("vice-city");

    // 渲染器
    if (!this.headless) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    // 场景与雾
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x4f9fe8);
    this.scene.fog = new THREE.Fog(0x8fc4e8, 120, 900);

    // 相机
    this.camera = new THREE.PerspectiveCamera(70, this.headless ? 16 / 9 : window.innerWidth / window.innerHeight, 0.5, 2000);
    this.camera.position.set(0, 30, 60);
    this.cameraYaw = 0;
    this.cameraPitch = 0.32;
    this.cameraDist = 9;

    // 光照
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    this.sun.position.set(80, 160, 60);
    this.sun.castShadow = this.headless ? false : true;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80;
      sc.near = 10; sc.far = 400;
    }
    this.hemi = new THREE.HemisphereLight(0xb8d8f0, 0x44503a, 0.85);
    this.scene.add(this.sun, this.hemi);

    // 一次性特效池（爆炸）与镜头震动
    this._fx = [];
    this._shakeAmp = 0;
    // 火花/烟雾粒子池（碰撞/受损可视化）
    this._puffs = [];
    this._smokeT = 0;
    this._initParticles();

    // 输入
    this.input = new InputManager(this);
    this.inVehicle = false;

    // 世界时钟：白天从 9 点开始
    this.worldHour = 9;
    this.speedMultiplier = 1; // 调试/金手指用

    // 模块容器（后续 commit 挂载）
    this.world = null;      // city.js
    this.player = null;      // player.js
    this.vehicles = [];      // spawn 出的可交互车辆
    this.peds = [];
    this.police = null;
    this.missions = null;
    this.sfx = null;

    // 流程控制
    this.running = false;
    this.paused = false;
    this._acc = 0;
    this._lastTs = 0;
    this._raf = 0;

    // HUD 缓存
    this._hud = {};
    this._floaters = null;
    this._mmTick = 0;

      // 移动端标记
    if (!this.headless) {
      this.isTouch = !!isMobile;
      const touch = document.getElementById("vc-touch");
      if (touch && isMobile) touch.classList.remove("hidden");
      this._bindMenus();
      window.addEventListener("resize", () => this._resize());
    }
  }

  // ------------------------------------------------------------ 启动流程
  async boot() {
    if (!this.headless) this._setLoadText("正在铺设道路…");
    // 世界生成（city.js）
    this.world = buildWorld(this);
    this.world.applyNight(this.nightFactor());
    if (!this.headless) {
      this._setLoadText("正在生成车辆与行人…");
      this._setLoadFill(70);
      this.player = new Player(this);
      this.player.weapons = PLAYER_WEAPON_ORDER.slice(0, 1 + UNLOCKED_AT_START);
      this.vehicles = new VehicleSystem(this, 26);
      this.traffic = new TrafficSystem(this, 8);
      this.police = new PoliceSystem(this);
      this.peds = new PedestrianSystem(this, 36);
      this.weapons = new WeaponSystem(this);
      this.sfx = new SfxSystem(this);
      this.missions = new MissionSystem(this);
      const _w0 = WEAPONS[this.player.weapons[0]];
      this.setWeapon(_w0.icon, _w0.name, "");
      this.setMission("任务", "前往青色标记处与中间人会面 · 或自由探索");
      this._setLoadFill(100);
      this._showMenu();
      this._raf = requestAnimationFrame((ts) => this._loop(ts));
    } else {
      this.player = new Player(this);
      this.player.weapons = PLAYER_WEAPON_ORDER.slice(0, 1 + UNLOCKED_AT_START);
      this.vehicles = new VehicleSystem(this, 26);
      this.traffic = new TrafficSystem(this, 8);
      this.police = new PoliceSystem(this);
      this.peds = new PedestrianSystem(this, 36);
      this.weapons = new WeaponSystem(this);
      this.sfx = new SfxSystem(this);
      this.missions = new MissionSystem(this);
      this.running = true;
    }
    await this.store.init();
    // 进度同步：金钱与武器（后续 commit 增加任务进度/护甲）
    if (this.player) {
      this.player.money = Number(this.store.state.money) || 0;
      // 与存档武器取并集（保留初始拳头+手枪，并恢复已解锁武器）
      if (Array.isArray(this.store.state.weapons) && this.store.state.weapons.length) {
        this.player.weapons = Array.from(new Set([...this.player.weapons, ...this.store.state.weapons]));
        this.player.weaponIndex = clamp(this.store.state.weaponIndex || 0, 0, this.player.weapons.length - 1);
      }
      this.player.armor = Math.max(0, Number(this.store.state.armor) || 0);
    }
    return this;
  }

  /** 上车/下车 hook（sfx 接入后续 commit） */
  onEnterVehicle(car) {
    this.inVehicle = true;
    if (this.sfx && this.sfx.engineOn) this.sfx.engineOn(true, car);
    if (!this.headless) this.showToast(`已进入 ${car.def.name} · 空格手刹 / E 下车`);
  }

  onExitVehicle(car) {
    this.inVehicle = false;
    if (this.sfx && this.sfx.engineOff) this.sfx.engineOff();
  }

  // ------------------------------------------------------------ HUD 同步
  _syncHud() {
    if (this.headless || !this.player) return;
    const p = this.player;
    this.setMoney(p.money);
    this.setBars(p.hp, p.maxHp, p.armor);
    this.setClock(this.worldHour);
    this.setWanted(this.police ? this.police.stars : 0);
    this.setVehiclePanel(p.inVehicle, p.vehicle ? p.vehicle.kmh : 0, p.vehicle ? p.vehicle.hp / p.vehicle.maxHp : 1);
    this.setCrosshair(!p.inVehicle);
    // 交互提示（任务提示优先于上下车）
    const mTip = this.missions ? this.missions.missionTip : null;
    if (mTip) {
      this.setInteractTip(mTip);
    } else if (p.inVehicle) {
      this.setInteractTip(this.isTouch ? "点 <b>🚗</b> 下车" : '按 <b>E</b> 下车');
    } else if (this.vehicles && this.vehicles.nearestEnterable(p.pos.x, p.pos.z, 3.4)) {
      this.setInteractTip(this.isTouch ? "点 <b>🚗</b> 上车" : '按 <b>E</b> 上车');
    } else {
      this.setInteractTip(null);
    }
  }

  // ------------------------------------------------------------ 通缉与事件
  policeBuzz(stars) {
    if (!this.headless) this.showToast(`⚠ 通缉等级 ${'★'.repeat(stars)}`);
  }

  /** 火花池（加色混合 Points，环形缓冲） */
  _initParticles() {
    if (this.headless) return;
    const MAX = this._sparkMax = 240;
    this._sparkPos = new Float32Array(MAX * 3);
    this._sparkCol = new Float32Array(MAX * 3);
    this._sparkVel = new Float32Array(MAX * 3);
    this._sparkLife = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) this._sparkPos[i * 3 + 1] = -1000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this._sparkPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this._sparkCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.3, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._sparkPts = new THREE.Points(geo, mat);
    this._sparkPts.frustumCulled = false;
    this.scene.add(this._sparkPts);
    this._sparkCursor = 0;
  }

  /** 生成一簇火花（碰撞/中弹/爆炸） */
  spawnSparks(x, y, z, n = 8, colorHex = 0xffc266, speed = 5) {
    if (this.headless || !this._sparkPts) return;
    const c = new THREE.Color(colorHex);
    for (let k = 0; k < n; k++) {
      const i = this._sparkCursor;
      this._sparkCursor = (i + 1) % this._sparkMax;
      const i3 = i * 3;
      this._sparkPos[i3] = x;
      this._sparkPos[i3 + 1] = y;
      this._sparkPos[i3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this._sparkVel[i3] = Math.cos(a) * s * 0.7;
      this._sparkVel[i3 + 1] = (0.5 + Math.random()) * s;
      this._sparkVel[i3 + 2] = Math.sin(a) * s * 0.7;
      this._sparkCol[i3] = Math.min(1, c.r + 0.45);
      this._sparkCol[i3 + 1] = Math.min(1, c.g + 0.3);
      this._sparkCol[i3 + 2] = c.b;
      this._sparkLife[i] = 0.35 + Math.random() * 0.35;
    }
    this._sparkPts.geometry.attributes.position.needsUpdate = true;
    this._sparkPts.geometry.attributes.color.needsUpdate = true;
  }

  _updateSparks(dt) {
    if (this.headless || !this._sparkPts) return;
    let live = false;
    for (let i = 0; i < this._sparkMax; i++) {
      if (this._sparkLife[i] <= 0) continue;
      live = true;
      const i3 = i * 3;
      this._sparkLife[i] -= dt;
      this._sparkVel[i3 + 1] -= 12 * dt;
      this._sparkPos[i3] += this._sparkVel[i3] * dt;
      this._sparkPos[i3 + 1] += this._sparkVel[i3 + 1] * dt;
      this._sparkPos[i3 + 2] += this._sparkVel[i3 + 2] * dt;
      if (this._sparkPos[i3 + 1] < 0.03) {
        this._sparkPos[i3 + 1] = 0.03;
        this._sparkVel[i3 + 1] *= -0.4;
        this._sparkVel[i3] *= 0.6;
        this._sparkVel[i3 + 2] *= 0.6;
      }
      if (this._sparkLife[i] <= 0) this._sparkPos[i3 + 1] = -1000;
    }
    if (live) this._sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  /** 烟雾：广告牌式渐扩灰团（受损车辆/爆炸） */
  _smokeTexture() {
    if (this._smokeTex) return this._smokeTex;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, "rgba(70,70,76,0.5)");
    g.addColorStop(0.6, "rgba(70,70,76,0.22)");
    g.addColorStop(1, "rgba(70,70,76,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this._smokeTex = new THREE.CanvasTexture(cv);
    return this._smokeTex;
  }

  spawnSmoke(x, y, z) {
    if (this.headless) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this._smokeTexture(), transparent: true, depthWrite: false, opacity: 0.42,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this._puffs.push({ mesh, t: 0, dur: 1.2 + Math.random() * 0.5 });
  }

  _updatePuffs(dt) {
    if (this.headless) return;
    for (let i = this._puffs.length - 1; i >= 0; i--) {
      const p = this._puffs[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        p.mesh.geometry.dispose();
        this._puffs.splice(i, 1);
        continue;
      }
      p.mesh.quaternion.copy(this.camera.quaternion);
      p.mesh.scale.setScalar(1 + k * 2.8);
      p.mesh.position.y += dt * 1.5;
      p.mesh.material.opacity = 0.42 * (1 - k);
    }
  }

  /** 车辆撞击声与提示（停放车/玩家车） */
  onCarCrash(car, impact, nx, nz) {
    if (this.sfx && this.sfx.playCrash) this.sfx.playCrash(impact);
    if (impact > 6 && nx !== undefined) {
      this.spawnSparks(
        car.pos.x + nx * car.radius, 0.7, car.pos.z + nz * car.radius,
        Math.min(14, Math.floor(impact)), 0xffc266, 6,
      );
    }
    if (!this.headless && this.player && this.player.vehicle === car && impact > 12) {
      this.showToast("车辆受损严重！注意车况");
      this._shakeAmp = Math.max(this._shakeAmp, Math.min(0.5, impact * 0.02));
    }
  }

  /** 车辆爆炸（玩家当前车）：火球 + 镜头震动 */
  onCarExplode(car) {
    const x = car.pos.x;
    const z = car.pos.z;
    if (!this.headless) this.spawnExplosion(x, z);
    if (this.player) {
      const d = Math.hypot(this.player.pos.x - x, this.player.pos.z - z);
      this._shakeAmp = Math.max(this._shakeAmp, Math.min(0.8, 6 / Math.max(6, d)));
    }
    if (!this.headless && this.player && this.player.vehicle === car) {
      this.showToast("车辆报废！快逃离现场");
    }
  }

  /** 爆炸火球特效（程序化） */
  spawnExplosion(x, z) {
    if (this.headless) return;
    this.spawnSparks(x, 1.2, z, 26, 0xffd27a, 9);
    this.spawnSparks(x, 1.0, z, 12, 0xff6a20, 6);
    this.spawnSmoke(x, 1.4, z);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.95 }),
    );
    core.position.set(x, 1.2, z);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    halo.position.set(x, 1.2, z);
    this.scene.add(core, halo);
    this._fx.push({ g: core, g2: halo, t: 0, dur: 0.65 });
  }

  /** 特效推进（仅渲染进程） */
  _updateFx(dt) {
    if (this.headless || !this._fx) return;
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const f = this._fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.scene.remove(f.g, f.g2);
        f.g.geometry.dispose();
        f.g.material.dispose();
        f.g2.geometry.dispose();
        f.g2.material.dispose();
        this._fx.splice(i, 1);
        continue;
      }
      const s = 1 + k * 9;
      f.g.scale.setScalar(s);
      f.g2.scale.setScalar(s * 1.15);
      f.g.material.opacity = 0.95 * (1 - k);
      f.g2.material.opacity = 0.55 * (1 - k);
    }
  }

  onCopCrash(impact) {
    if (this.sfx && this.sfx.playCrash) this.sfx.playCrash(impact * 0.7);
    if (!this.headless && impact > 12) this.showToast("警车被撞得失去了控制！");
  }

  onPedHit(car, ped) {
    if (!this.headless) {
      if (car && car.pos) this.spawnSparks(car.pos.x, 0.8, car.pos.z, 10, 0xd02030, 4);
      this.floater("肇事逃逸", "bad");
    }
  }

  /** 被逮捕：传送回警局，扣除现金 15% */
busted() {
if (this._busted) return;
this._busted = true;
if (this.missions && this.missions.activeIdx >= 0) {
  this.missions._failMission("你被警方逮捕了");
}
const p = this.player;
    if (p.inVehicle) p.exitVehicle();
    this.police.clearCrime();
    p.pos.set(this.police.station.x, 0, this.police.station.z);
    p.hp = p.maxHp;
    p.money = Math.floor(p.money * 0.85);
    if (this.traffic) this.traffic.cars.forEach((c) => { c.pos.x += 40; c.vx = c.vz = 0; });
    this.showOverlay("被捕", "你被警方带走了。保释金已从现金中扣除。", "#4a6a9a");
    if (this.sfx && this.sfx.playBusted) this.sfx.playBusted();
    setTimeout(() => { this._busted = false; }, 5000);
  }

  /** 伤残：送往医院，扣除现金 15% */
wasted() {
if (this._wasted) return;
this._wasted = true;
if (this.missions && this.missions.activeIdx >= 0) {
  this.missions._failMission("你倒下了");
}
const p = this.player;
    if (p.inVehicle) p.exitVehicle();
    if (this.police) this.police.clearCrime();
    const h = this.police ? this.police.hospital : { x: 320, z: 380 };
    p.pos.set(h.x, 0, h.z);
    p.hp = p.maxHp;
    p.armor = 0;
    p.money = Math.floor(p.money * 0.85);
    this.showOverlay("你倒下了", "被紧急送往医院，医疗费从现金中扣除。", "#8a2020");
    if (this.sfx && this.sfx.playWasted) this.sfx.playWasted();
    setTimeout(() => { this._wasted = false; }, 5000);
  }

  showOverlay(title, text, color) {
    if (this.headless) return;
    const el = document.getElementById("vc-overlay");
    if (!el) return;
    const t = document.getElementById("vc-overlay-title");
    const x = document.getElementById("vc-overlay-text");
    if (t) { t.textContent = title; t.style.color = color || "#ffd166"; }
    if (x) x.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(this._overlayT);
    this._overlayT = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  // ------------------------------------------------------------ 主循环
  _loop(ts) {
    if (!this._lastTs) this._lastTs = ts;
    const dt = Math.min((ts - this._lastTs) / 1000, MAX_DT);
    this._lastTs = ts;

    if (!this.paused && this.running) {
      this._acc += dt;
      let guard = 0;
      while (this._acc >= STEP && guard < 5) {
        this.update(STEP);
        this._acc -= STEP;
        guard++;
      }
    }
    this.render();
    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

    /** 每步更新（step = 固定 1/60s） */
  update(dt) {
    // 昼夜推进：1 小时 = DAY_LENGTH/24 秒
    this.worldHour = (this.worldHour + (dt * 24 / DAY_LENGTH) * this.speedMultiplier) % 24;
    this._applyDayNight();

    // 鼠标视角
    const look = this.input.consumeLook();
    this.cameraYaw -= look.dx * 0.004;
    this.cameraPitch = clamp(this.cameraPitch + look.dy * 0.003, -0.05, 1.15);

    // 玩家（步行/驾驶）与载具系统
    if (this.player && this.player.update) this.player.update(dt);
    if (this.vehicles && this.vehicles.update) {
      this.vehicles.update(dt, this.player ? this.player.pos : { x: 0, z: 0 });
    }
    if (this.traffic && this.traffic.update) {
      this.traffic.update(dt, this.player.pos, this.player.vehicle ? this.player.vehicle : null);
    }
    if (this.peds && this.peds.update) {
      this.peds.update(dt, this.player.pos.x, this.player.pos.z);
    }
    if (this.weapons && this.weapons.update) this.weapons.update(dt);
    if (this.police && this.police.update) {
      this.police.update(dt, !this.player.inVehicle, this.player.speed || (this.player.vehicle ? Math.abs(this.player.vehicle.kmh / 3.6) : 0));
    }
    if (this.missions && this.missions.update) this.missions.update(dt);
    // 死亡（非驾驶时）→ WASTED
    if (this.player.hp <= 0) this.wasted();
    if (this.world && this.world.update) this.world.update(dt);
    if (this.sfx && this.sfx.update) this.sfx.update(dt);

    // 受损车辆冒烟（玩家车必冒，视线内其他车辆低概率）
    this._smokeT -= dt;
    if (this._smokeT <= 0 && this.player) {
      this._smokeT = 0.12;
      const pv = this.player.vehicle;
      if (pv && !pv.dead && pv.hp < pv.maxHp * 0.4) {
        const fx2 = Math.sin(pv.angle);
        const fz2 = Math.cos(pv.angle);
        this.spawnSmoke(pv.pos.x + fx2 * 1.5, 1.0, pv.pos.z + fz2 * 1.5);
      } else if (this.vehicles && this.player) {
        for (const c of this.vehicles.cars) {
          if (c.dead || c.hp > c.maxHp * 0.4 || c.occupiedBy) continue;
          const d2 = (c.pos.x - this.player.pos.x) ** 2 + (c.pos.z - this.player.pos.z) ** 2;
          if (d2 > 3600) continue;
          if (Math.random() < 0.15) {
            const fx2 = Math.sin(c.angle);
            const fz2 = Math.cos(c.angle);
            this.spawnSmoke(c.pos.x + fx2 * 1.3, 1.0, c.pos.z + fz2 * 1.3);
          }
        }
      }
    }
    this._updateSparks(dt);
    this._updatePuffs(dt);

    this._updateCamera();
    this._updateFx(dt);
    this._syncHud();
    if (++this._mmTick % 10 === 0) this._syncMinimap();
  }

  /** 小地图每 10 帧重绘：城市底图 + 任务标记 + 玩家 + 警车 */
  _syncMinimap() {
    if (this.headless || !this.world || !this.world.minimapCv) return;
    const el = document.getElementById("vc-minimap");
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const half = WORLD.half;
    const toPx = (wx, wz) => [(wx + half) / WORLD.size * 180, (wz + half) / WORLD.size * 180];
    ctx.clearRect(0, 0, 180, 180);
    ctx.drawImage(this.world.minimapCv, 0, 0, 180, 180);
    const p = this.player;
    if (!p) return;
    // 任务标记
    if (this.missions) {
      const mp = this.missions.markerPos;
      if (mp) {
        const [mx, my] = toPx(mp[0], mp[1]);
        ctx.fillStyle = "#ffc94d";
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.65)";
        ctx.stroke();
      }
    }
    // 玩家箭头
    const [px2, py2] = toPx(p.pos.x, p.pos.z);
    const ang = p.inVehicle && p.vehicle ? p.vehicle.angle : p.angle;
    ctx.save();
    ctx.translate(px2, py2);
    ctx.rotate(Math.PI / 2 - ang);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.stroke();
    ctx.restore();
    // 警车
    if (this.police) {
      ctx.fillStyle = "#ff4055";
      for (const c of this.police.cars) {
        if (c.car.dead) continue;
        const [cx2, cy2] = toPx(c.car.pos.x, c.car.pos.z);
        ctx.fillRect(cx2 - 2, cy2 - 2, 4, 4);
      }
    }
  }

  // ------------------------------------------------------------ 对话
  /**
   * 任务/剧情对话面板；headless 下直接回调，便于逻辑自测。
   * @param {string} name 说话人
   * @param {string[][]} lines [ [speaker, text], ... ]
   * @param {() => void} onDone 全部说完后回调
   */
  startDialog(name, lines, onDone) {
    if (this.headless) { if (onDone) onDone(); return; }
    const dlg = document.getElementById("vc-dialog");
    const nm = document.getElementById("vc-dialog-name");
    const tx = document.getElementById("vc-dialog-text");
    const btn = document.getElementById("vc-dialog-next");
    if (!dlg || !btn) { if (onDone) onDone(); return; }
    let i = 0;
    this._dialogOpen = true;
    dlg.classList.remove("hidden");
    const showLine = () => {
      const [speaker, text] = lines[i];
      nm.textContent = speaker || name;
      tx.textContent = text;
    };
    // 键盘（Enter/Space/E）+ 鼠标/触屏点击 双通道推进
    this._advDialog = () => btn.click();
    btn.focus && btn.focus();
    const finish = () => {
      dlg.classList.add("hidden");
      this._dialogOpen = false;
      this._advDialog = null;
      if (onDone) onDone();
    };
    btn.onclick = () => {
      i++;
      if (i >= lines.length) {
        finish();
      } else {
        showLine();
      }
      if (this.sfx && this.sfx.playUi) this.sfx.playUi();
    };
    showLine();
  }

  _applyDayNight() {
    const nf = this.nightFactor();
    if (this.world) this.world.applyNight(nf);
    const c = skyColorFor(this.worldHour);
    this.scene.background.setHex(c.sky);
    this.scene.fog.color.setHex(c.fog);
    this.sun.color.setHex(c.sun);
    this.sun.intensity = c.sunI;
    this.hemi.intensity = c.hemiI;

    // 太阳绕转
    const t = (this.worldHour - 6) / 12 * Math.PI; // 6 点升起，18 点落下
    const r = 120;
    this.sun.position.set(Math.cos(t) * r, Math.max(12, Math.sin(t) * r), 60);
    // 夜晚切换到高层冷光
    if (isNight(this.worldHour)) {
      this.sun.intensity = 0.12;
      this.sun.position.set(40, 140, -80);
    }
  }

  /** 夜晚系数 0..1（傍晚 18:30 起增强，清晨 6 点前渐变） */
  nightFactor() {
    const h = this.worldHour;
    return clamp(Math.max((h - 18.5) / 2, (6 - h) / 2), 0, 1);
  }

  _updateCamera() {
    const target = this.player ? this.player.getCameraTarget() : null;
    if (!target) {
      this.camera.lookAt(0, 0, 0);
      return;
    }
    // 驾驶时摄像机向后拉到车后
    if (target.inCar) {
      this.cameraYaw = angleLerp(this.cameraYaw, target.angle, 0.06);
      this.cameraDist = lerp(this.cameraDist, 12, 0.05);
    } else {
      this.cameraDist = lerp(this.cameraDist, 7.5, 0.08);
    }
    const dist = this.cameraDist;
    const cy = Math.cos(this.cameraPitch);
    const cx = Math.sin(this.cameraYaw) * cy * dist;
    const cz = Math.cos(this.cameraYaw) * cy * dist;
    const yr = Math.sin(this.cameraPitch) * dist;
    this.camera.position.set(target.x - cx, yr + 2.2, target.z - cz);
    // 镜头震动（爆炸/撞击）
    if (this._shakeAmp > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this._shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * this._shakeAmp * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * this._shakeAmp;
      this._shakeAmp *= 0.88;
    } else {
      this._shakeAmp = 0;
    }
    this.camera.lookAt(target.x, 1.6, target.z);
  }

  render() {
    if (this.headless || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ 流程
  startGame() {
    this.running = true;
    this.paused = false;
    if (this.sfx) this.sfx.ensure();
    if (!this.headless) {
      document.getElementById("vc-menu").classList.add("hidden");
      this.showToast("欢迎来到罪恶都市 · 自由探索开始");
    }
  }

  pause() {
    if (this.headless) { this.paused = !this.paused; return; }
    if (!this.running) return;
    this.paused = true;
    document.getElementById("vc-pause").classList.remove("hidden");
  }

  resume() {
    this.paused = false;
    if (!this.headless) document.getElementById("vc-pause").classList.add("hidden");
  }

  onKey(code, down) {
    if (code === "Escape" && down && !this.headless) {
      if (this.paused) this.resume();
      else this.pause();
    }
    if (down === false) return;
    // 对话中：Enter/Space/E 推进下一句
    if (this._dialogOpen && this._advDialog
        && (code === "Enter" || code === "Space" || code === "KeyE")) {
      this._advDialog();
      return;
    }
    // 电台切换
    if (code === "KeyR" && this.sfx) this.sfx.nextStation();
  }

  _bindMenus() {
    const $ = (id) => document.getElementById(id);
    $("vc-btn-start").addEventListener("click", () => this.startGame());
    $("vc-btn-continue").addEventListener("click", () => this.startGame());
    $("vc-btn-missions").addEventListener("click", () => this.showToast("任务选择：跟随粉色 M 标记推进主线"));
    $("vc-btn-resume").addEventListener("click", () => this.resume());
    $("vc-btn-restart").addEventListener("click", () => {
      this.resume();
      document.getElementById("vc-menu").classList.remove("hidden");
      this.running = false;
    });
    $("vc-btn-menu").addEventListener("click", () => {
      this.resume();
      document.getElementById("vc-menu").classList.remove("hidden");
      this.running = false;
    });
    initAccount(document.querySelector("[data-account-chip]"));
  }

  // ------------------------------------------------------------ HUD
  _setLoadText(t) {
    if (this.headless) return;
    const el = document.getElementById("vc-load-text");
    if (el) el.textContent = t;
  }

  _setLoadFill(p) {
    if (this.headless) return;
    const el = document.getElementById("vc-load-fill");
    if (el) el.style.width = p + "%";
  }

  _showMenu() {
    if (this.headless) return;
    document.getElementById("vc-loading").classList.add("hidden");
    document.getElementById("vc-menu").classList.remove("hidden");
    const stats = document.getElementById("vc-menu-stats");
    if (stats) stats.textContent = "进度：自由漫游 · 金钱 $0";
  }

  showToast(msg, ms = 2600) {
    if (this.headless) return;
    const el = document.getElementById("vc-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), ms);
  }

  floater(text, kind = "info") {
    if (this.headless) return;
    const box = document.getElementById("vc-floaters");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "vc-floater " + kind;
    el.textContent = text;
    el.style.left = 48 + Math.random() * 6 + "%";
    el.style.top = 42 + Math.random() * 6 + "%";
    box.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  setMoney(v) {
    if (this.headless) return;
    const el = document.getElementById("vc-money");
    if (el && this._hud.money !== v) {
      this._hud.money = v;
      el.textContent = "$" + Math.round(v).toLocaleString("zh-CN");
    }
  }

  setBars(hp, maxHp, armor) {
    if (this.headless) return;
    const h = document.getElementById("vc-health");
    const a = document.getElementById("vc-armor");
    if (h) h.style.width = clamp((hp / Math.max(1, maxHp)) * 100, 0, 100) + "%";
    if (a) a.style.width = clamp(armor, 0, 100) + "%";
  }

  setWanted(stars) {
    if (this.headless) return;
    document.querySelectorAll(".vc-star").forEach((s) => {
      const n = Number(s.dataset.star);
      s.classList.toggle("lit", n <= stars && stars < 5);
      s.classList.toggle("hot", n <= stars && stars >= 5);
    });
  }

  setClock(hour) {
    if (this.headless) return;
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const el = document.getElementById("vc-clock");
    if (el) el.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  setRadio(label) {
    if (this.headless) return;
    const el = document.getElementById("vc-radio");
    if (el) el.textContent = label ? "📻 " + label : "📻";
  }

  setMission(title, text) {
    if (this.headless) return;
    const t = document.getElementById("vc-mission-title");
    const x = document.getElementById("vc-mission-text");
    if (t) t.textContent = title;
    if (x) x.textContent = text || "";
  }

  setInteractTip(text) {
    if (this.headless) return;
    const el = document.getElementById("vc-interact-tip");
    if (!el) return;
    if (!text) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = text;
  }

  setVehiclePanel(show, kmh = 0, hpFrac = 1) {
    if (this.headless) return;
    const panel = document.getElementById("vc-vehicle-panel");
    if (panel) panel.classList.toggle("hidden", !show);
    if (show) {
      const s = document.getElementById("vc-speed");
      if (s) s.textContent = Math.round(kmh);
      const hp = document.getElementById("vc-car-hp");
      if (hp) hp.style.width = clamp(hpFrac * 100, 0, 100) + "%";
    }
  }

  setWeapon(icon, name, ammoText) {
    if (this.headless) return;
    const i = document.getElementById("vc-weapon-icon");
    const n = document.getElementById("vc-weapon-name");
    const a = document.getElementById("vc-weapon-ammo");
    if (i) i.textContent = icon;
    if (n) n.textContent = name;
    if (a) a.textContent = ammoText || "";
    if (this.player && this.player.showGun) {
      this.player.showGun(name !== "拳头");
    }
  }

  setCrosshair(show) {
    if (this.headless) return;
    const el = document.getElementById("vc-crosshair");
    if (el) el.style.display = show ? "block" : "none";
  }

  // ------------------------------------------------------------ resize
  _resize() {
    if (this.headless || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** 停止循环与渲染（测试用） */
  dispose() {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._raf);
  }
}

// ---------------------------------------------------------------- 入口
export function boot() {
  const game = new ViceCityGame();
  window.__viceCity = game;
  game.boot();
  return game;
}

/** headless 启动（冒烟/自检用） */
export async function bootHeadless() {
  const game = new ViceCityGame({ headless: true });
  await game.boot();
  return game;
}
