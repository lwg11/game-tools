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
    }
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
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
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

    // 移动端标记
    if (!this.headless) {
      const touch = document.getElementById("vc-touch");
      if (touch && isMobile()) touch.classList.remove("hidden");
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
      const _w0 = WEAPONS[this.player.weapons[0]];
      this.setWeapon(_w0.icon, _w0.name, "");
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
      this.running = true;
    }
    await this.store.init();
    // 进度同步（commit 8 进一步同步任务/武器）
    if (this.player) {
      this.player.money = Number(this.store.state.money) || 0;
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
    // 交互提示
    if (p.inVehicle) {
      this.setInteractTip('按 <b>E</b> 下车');
    } else if (this.vehicles && this.vehicles.nearestEnterable(p.pos.x, p.pos.z, 3.4)) {
      this.setInteractTip('按 <b>E</b> 上车');
    } else {
      this.setInteractTip(null);
    }
  }

  // ------------------------------------------------------------ 通缉与事件
  policeBuzz(stars) {
    if (!this.headless) this.showToast(`⚠ 通缉等级 ${'★'.repeat(stars)}`);
  }

  onCopCrash(impact) {
    if (!this.headless && impact > 12) this.showToast("警车被撞得失去了控制！");
  }

  onPedHit(car, ped) {
    if (!this.headless) this.floater("肇事逃逸", "bad");
  }

  /** 被逮捕：传送回警局，扣除现金 15% */
  busted() {
    if (this._busted) return;
    this._busted = true;
    const p = this.player;
    if (p.inVehicle) p.exitVehicle();
    this.police.clearCrime();
    p.pos.set(this.police.station.x, 0, this.police.station.z);
    p.hp = p.maxHp;
    p.money = Math.floor(p.money * 0.85);
    if (this.traffic) this.traffic.cars.forEach((c) => { c.pos.x += 40; c.vx = c.vz = 0; });
    this.showOverlay("被捕", "你被警方带走了。保释金已从现金中扣除。", "#4a6a9a");
    setTimeout(() => { this._busted = false; }, 5000);
  }

  /** 伤残：送往医院，扣除现金 15% */
  wasted() {
    if (this._wasted) return;
    this._wasted = true;
    const p = this.player;
    if (p.inVehicle) p.exitVehicle();
    if (this.police) this.police.clearCrime();
    const h = this.police ? this.police.hospital : { x: 320, z: 380 };
    p.pos.set(h.x, 0, h.z);
    p.hp = p.maxHp;
    p.armor = 0;
    p.money = Math.floor(p.money * 0.85);
    this.showOverlay("你倒下了", "被紧急送往医院，医疗费从现金中扣除。", "#8a2020");
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
    // 死亡（非驾驶时）→ WASTED
    if (this.player.hp <= 0) this.wasted();
    if (this.world && this.world.update) this.world.update(dt);
    if (this.sfx && this.sfx.update) this.sfx.update(dt);

    this._updateCamera();
    this._syncHud();
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
