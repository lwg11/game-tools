/**
 * 罪恶都市 · 任务系统
 * ------------------------------------------------------------
 * 十章主线（arc）：
 *  - m1 无名小卒（reach：跑三个地点）
 *  - m2 快递包裹（delivery：限时取包送达）
 *  - m3 一网打尽（eliminate：消灭打手）
 *  - m4 码头眼线（chase：追截并摧毁目标车辆）
 *  - m5 全城通缉（escape：限时与警车保持距离）
 *  - m6 机场拦截（eliminate×6，解锁步枪）
 *  - m7 急诊包裹（delivery：小哈瓦那→海星岛 240s）
 *  - m8 警网逃生（escape：三星 120s）
 *  - m9 决战仓库（eliminate×8）
 *  - m10 胜利追击（chase：沿海公路长追击）
 *
 * 流程：giver 处接取（E / ✋ / 🚗）→ 对话 → 标记指引 → 完成发奖励/解锁武器 → 存档
 * BUSTED/WASTED 会让当前任务失败。
 */
import * as THREE from "../lib/three.module.min.js";
import { WORLD, clamp, angleDiff } from "./common.js";
import { isMobile } from "../../assets/js/device.js";
import { WEAPONS } from "./weapons.js";
import { Car } from "./vehicle.js";

const COLORS = {
  giver: 0x6fd3ff,   // 可接取：青蓝
  target: 0xffc94d,  // 任务目标：金
  warn: 0xff5f7a,    // 警告/失败：红
};

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.step = WORLD.size / WORLD.gridN;
    this.road = (i) => -WORLD.half + i * this.step;
    this.giverPos = { x: 0, z: 0 };

    this.missions = [
      {
        id: "m1",
        status: "open",
        title: "无名小卒",
        giver: "肯·罗森伯格",
        desc: "去见律师肯，然后跑三处约定地点。",
        dialog: [
          ["肯", "汤米·维尔切迪，传奇人物。1986 年的事之后，你终于回来了。"],
          ["你", "肯，我什么都想不起来了。城里的人都在找我？"],
          ["肯", "银行在找、条子在找、迪亚兹也在找。先去三个地方露个面，我安排人会保证你的安全。"],
        ],
        type: "reach",
        waypoints: [
          [this.road(4), this.road(2)],
          [this.road(4), this.road(9)],
          [this.road(8), this.road(6)],
        ],
        rewardMoney: 2000,
        unlockWeapon: "uzi",
      },
      {
        id: "m2",
        status: "locked",
        title: "快递包裹",
        giver: "保罗",
        desc: "去维基港取包裹，并在 3 分钟内送到海星岛码头。",
        dialog: [
          ["保罗", "肯让我转告你：有个包裹落在维基港的仓库，迪亚兹的人也在找它。"],
          ["你", "所以我是快递？"],
          ["保罗", "三分钟内送到海星岛码头，别弄丢，别超时。"],
        ],
        type: "delivery",
        pickup: [this.road(11), this.road(6)],
        dropoff: [this.road(9), this.road(11)],
        time: 180,
        rewardMoney: 5000,
        rewardArmor: 50,
      },
      {
        id: "m3",
        status: "locked",
        title: "一网打尽",
        giver: "迪亚兹",
        desc: "消灭在小哈瓦那停车场集合的 5 名打手。",
        dialog: [
          ["迪亚兹", "汤米·维尔切迪。我知道你回来了——还偷了我的货。"],
          ["你", "看来我们要好好谈谈。"],
          ["迪亚兹", "我的人已在小哈瓦那的停车场集合。干掉他们，我们再谈生意。"],
        ],
        type: "eliminate",
        arena: [this.road(4), this.road(4)],
        count: 5,
        rewardMoney: 8000,
        unlockWeapon: "shotgun",
      },
      {
        id: "m4",
        status: "locked",
        title: "码头眼线",
        giver: "保罗",
        desc: "截停迪亚兹的运货跑车，别让它开到码头。",
        dialog: [
          ["保罗", "迪亚兹的运货跑车正沿主路往南码头跑，车上有他的账本。"],
          ["你", "所以把这辆车拦下来。"],
          ["保罗", "别让它到码头。开什么都行——撞烂它！"],
        ],
        type: "chase",
        path: [[7, 9], [7, 12], [10, 12], [10, 13]],
        time: 240,
        runnerSpeed: 1.0,
        rewardMoney: 12000,
      },
      {
        id: "m5",
        status: "locked",
        title: "全城通缉",
        giver: "肯",
        desc: "被警方通缉：90 秒内别让任何警车贴近 25 米。",
        dialog: [
          ["肯", "你被条子盯上了。消失 90 秒——别让任何警车贴到你 25 米内。"],
          ["你", "25 米？你当我是舒马赫？"],
          ["肯", "就当是为了我这张老脸。"],
        ],
        type: "escape",
        stars: 2,
        time: 90,
        radius: 25,
        rewardMoney: 15000,
      },
      {
        id: "m6",
        status: "locked",
        title: "机场拦截",
        giver: "艾尔",
        desc: "消灭把守机场仓库的 6 名武装分子。",
        dialog: [
          ["艾尔", "机场跑道的仓库里有一批货，迪亚兹的六个手下守着。"],
          ["你", "又是我干活。"],
          ["艾尔", "这批货值钱。干了这票，够你换一把好枪。"],
        ],
        type: "eliminate",
        arena: [this.road(2), this.road(2)],
        count: 6,
        rewardMoney: 12000,
        unlockWeapon: "rifle",
      },
      {
        id: "m7",
        status: "locked",
        title: "急诊包裹",
        giver: "保罗",
        desc: "4 分钟内把血浆从小哈瓦那送到海星岛诊所。",
        dialog: [
          ["保罗", "小哈瓦那有人等着这批血浆，4 分钟内送到海星岛诊所。"],
          ["你", "四分钟？"],
          ["保罗", "所以别撞车。"],
        ],
        type: "delivery",
        pickup: [this.road(3), this.road(3)],
        dropoff: [this.road(12), this.road(10)],
        time: 240,
        rewardMoney: 20000,
        rewardArmor: 50,
      },
      {
        id: "m8",
        status: "locked",
        title: "警网逃生",
        giver: "肯",
        desc: "三星通缉：坚持 120 秒，别被警车贴到 30 米内。",
        dialog: [
          ["肯", "警局局长亲自批了通缉令——三星。撑住 120 秒，别被咬住。"],
          ["你", "这次我可真要谢谢你了。"],
        ],
        type: "escape",
        stars: 3,
        time: 120,
        radius: 30,
        rewardMoney: 18000,
      },
      {
        id: "m9",
        status: "locked",
        title: "决战仓库",
        giver: "里科",
        desc: "消灭迪亚兹最后的 8 人武装小队。",
        dialog: [
          ["里科", "迪亚兹把最后的武装小队藏在港口仓库——八个人，最好的装备。"],
          ["你", "八个人。行吧。"],
          ["里科", "干掉他们，这座城市就是你的。"],
        ],
        type: "eliminate",
        arena: [this.road(10), this.road(10)],
        count: 8,
        rewardMoney: 25000,
      },
      {
        id: "m10",
        status: "locked",
        title: "胜利追击",
        giver: "肯",
        desc: "迪亚兹沿东部沿海公路逃車——追上他的车，结束这一切。",
        dialog: [
          ["肯", "迪亚兹跑了，沿海公路往东。追上他的车，结束这一切。"],
          ["你", "等我回来喝酒。"],
          ["肯", "一定。"],
        ],
        type: "chase",
        path: [[2, 6], [2, 2], [5, 2], [5, 8], [8, 8], [8, 12], [12, 12]],
        time: 300,
        runnerSpeed: 1.15,
        rewardMoney: 40000,
      },
    ];

    this.activeIdx = -1;
    this._wpIdx = 0;
    this._timer = 0;
    this._prevE = false;
    this._gang = [];
    this._dialogRunning = false;
    this._runner = null;
    this._escapeR = 0;
    this._escapeNearest = Infinity;
    this._escapeSafe = false;
    this._buildMarker();
    this._buildGiverMesh();
    this._refreshMarker();
  }

  // ------------------------------------------------------------ 场景构建
  _buildMarker() {
    if (this.game.headless) return;
    const g = new THREE.Group();
    const oct = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: COLORS.giver, transparent: true, opacity: 0.95 }),
    );
    oct.position.y = 5;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.giver, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(oct);
    g.add(ring);
    this._marker = { group: g, oct, ring };
    this.game.scene.add(g);
  }

  _buildGiverMesh() {
    if (this.game.headless) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.9, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x2a6a4a }),
    );
    body.position.y = 0.95;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xe8b890 }),
    );
    head.position.y = 1.6;
    g.add(body);
    g.add(head);
    g.position.set(this.giverPos.x + 2, 0, this.giverPos.z + 2);
    this._giverMesh = g;
    this.game.scene.add(g);
  }

  // ------------------------------------------------------------ 标记
  _refreshMarker() {
    if (this.game.headless || !this._marker) return;
    let pos = null;
    let color = COLORS.giver;
    if (this.activeIdx >= 0) {
      const m = this.missions[this.activeIdx];
      const target = this._currentTarget(m);
      if (target) {
        pos = target;
        color = COLORS.target;
      }
    } else {
      const next = this.missions.find((mm) => mm.status === "open");
      if (next) pos = [this.giverPos.x, this.giverPos.z];
    }
    if (!pos) {
      this._marker.group.visible = false;
      return;
    }
    this._marker.group.visible = true;
    this._marker.group.position.set(pos[0], 0, pos[1]);
    this._marker.oct.material.color.setHex(color);
    this._marker.ring.material.color.setHex(color);
  }

  _currentTarget(m) {
    if (m.type === "reach") {
      return m.waypoints[Math.min(this._wpIdx, m.waypoints.length - 1)];
    }
    if (m.type === "delivery") {
      return this._wpIdx === 0 ? m.pickup : m.dropoff;
    }
    if (m.type === "eliminate") {
      return m.arena;
    }
    if (m.type === "chase" && this._runner && !this._runner.car.dead) {
      return [this._runner.car.pos.x, this._runner.car.pos.z];
    }
    return null;
  }

  // ------------------------------------------------------------ 外部接口
  /** 任务发放人跟前且有可接任务时，E/触屏接取由任务系统独占（玩家不再同帧上车） */
  get offerInteract() {
    if (this.activeIdx >= 0 || this._dialogRunning) return false;
    const p = this.game.player;
    if (!p || !this.missions.some((m) => m.status === "open")) return false;
    return Math.hypot(p.pos.x - this.giverPos.x, p.pos.z - this.giverPos.z) < 5;
  }

  /** 供 HUD 读取 */
  get missionTip() {
    if (this.activeIdx >= 0) {
      const m = this.missions[this.activeIdx];
      return m.title;
    }
    const next = this.missions.find((mm) => mm.status === "open");
    if (!next) return null;
    const p = this.game.player.pos;
    const d = Math.hypot(p.x - this.giverPos.x, p.z - this.giverPos.z);
    if (d < 5) {
      return isMobile
        ? `点 ✋ 或 🚗 开始任务：${next.title}`
        : `按 E 开始任务：${next.title}`;
    }
    return null;
  }

  /** 当前任务进度文本（用于 HUD 任务栏） */
  get missionHudText() {
    if (this.activeIdx < 0) return "";
    const m = this.missions[this.activeIdx];
    if (m.type === "reach") {
      return `${m.desc}（${Math.min(this._wpIdx + 1, m.waypoints.length)}/${m.waypoints.length}）`;
    }
    if (m.type === "delivery") {
      const stage = this._wpIdx === 0 ? "取包裹" : "送达中";
      return `${stage} · 剩余 ${Math.max(0, Math.ceil(this._timer))}s`;
    }
    if (m.type === "eliminate") {
      const alive = this._gang.filter((g) => !g.dead).length;
      return `${m.desc}（剩余 ${alive}）`;
    }
    if (m.type === "chase") {
      const car = this._runner ? this._runner.car : null;
      const hpTxt = car ? Math.max(0, Math.round((car.hp / car.maxHp) * 100)) : 0;
      return `追截目标 · 剩余 ${Math.max(0, Math.ceil(this._timer))}s · 车况 ${hpTxt}%`;
    }
    if (m.type === "escape") {
      const near = Math.round(this._escapeNearest);
      const txt = this._escapeSafe ? `甩开警察（最近 ${near}m）` : "被贴住了！拉开距离！";
      return `${txt} · 还需 ${Math.max(0, Math.ceil(this._timer))}s`;
    }
    return m.desc;
  }

  /** 小地图标记位置（无活动任务但有可接时返回 giver） */
  get markerPos() {
    if (this.activeIdx >= 0) return this._currentTarget(this.missions[this.activeIdx]);
    const next = this.missions.find((mm) => mm.status === "open");
    return next ? [this.giverPos.x, this.giverPos.z] : null;
  }

  // ------------------------------------------------------------ 流程
  _startMission(i) {
    const m = this.missions[i];
    if (m.status !== "open") return;
    m.status = "active";
    this.activeIdx = i;
    this._wpIdx = 0;
    this._timer = m.time || 0;
    if (m.type === "eliminate") this._spawnGang(m);
    if (m.type === "chase") this._spawnRunner(m);
    if (m.type === "escape") {
      this._escapeR = m.radius || 25;
      if (this.game.police) this.game.police.reportCrime(m.stars || 2);
    }
    this._refreshMarker();
    this._setMissionHud(m);
    const begin = () => {
      this._dialogRunning = false;
      this._refreshMarker();
      this._setMissionHud(m);
    };
    this._dialogRunning = true;
    this.game.startDialog(m.giver, m.dialog, begin);
  }

  _completeMission() {
    const i = this.activeIdx;
    if (i < 0) return;
    const m = this.missions[i];
    m.status = "done";
    this.activeIdx = -1;
    this._wpIdx = 0;
    const g = this.game;
    const p = g.player;
    // 奖励
    if (m.rewardMoney) {
      p.money += m.rewardMoney;
      if (!g.headless) g.floater(`+$${m.rewardMoney.toLocaleString()}`, "good");
    }
    if (m.rewardArmor) p.armor = clamp((p.armor || 0) + m.rewardArmor, 0, 100);
    if (m.unlockWeapon && g.weapons && g.weapons.unlock(m.unlockWeapon)) {
      this._toast(`获得武器：${WEAPONS[m.unlockWeapon].name}`);
    }
    if (!g.headless) g.showToast(`任务完成：${m.title}`);
    if (g.sfx && g.sfx.playPickup) g.sfx.playPickup();
    // 存档
    const store = g.store;
    if (store) {
      store.update((s) => {
        s.missionsDone = (s.missionsDone || 0) + 1;
        s.money = Math.max(s.money || 0, p.money);
        if (m.unlockWeapon && !s.weapons.includes(m.unlockWeapon)) s.weapons.push(m.unlockWeapon);
      });
    }
    // 解锁下一个
    const nextIdx = this.missions.findIndex((mm) => mm.status === "locked");
    if (nextIdx >= 0) this.missions[nextIdx].status = "open";
    if (m.type === "escape") this.game.police && this.game.police.clearCrime();
    if (m.type === "chase") this._destroyRunner();
    this._setMissionHud(null);
    this._refreshMarker();
  }

  _failMission(reason) {
    const m = this.missions[this.activeIdx];
    if (!m) { this.activeIdx = -1; return; }
    m.status = "open";
    this.activeIdx = -1;
    this._wpIdx = 0;
    if (m.type === "eliminate") this._clearGang();
    if (m.type === "chase") this._destroyRunner();
    if (!this.game.headless) this.game.showToast(`任务失败：${reason}`);
    if (this.game.sfx && this.game.sfx.playBusted) this.game.sfx.playBusted();
    this._setMissionHud(null);
    this._refreshMarker();
  }

  _toast(msg) {
    if (!this.game.headless) this.game.showToast(msg);
  }

  _setMissionHud(m) {
    if (this.game.headless) return;
    if (!m) {
      this.game.setMission("任务", "前往青色标记处与中间人会面 · 或自由探索");
      return;
    }
    this.game.setMission(m.title, this.missionHudText);
  }

  // ------------------------------------------------------------ 战斗辅助
  _spawnGang(m) {
    this._clearGang();
    const peds = this.game.peds;
    const n = Math.max(m.count, 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = m.arena[0] + Math.cos(a) * 24;
      const z = m.arena[1] + Math.sin(a) * 24;
      const ped = {
        x, z,
        angle: a,
        speed: 0,
        phase: Math.random() * 6,
        state: "idle",
        timer: 0.5 + Math.random() * 2,
        tx: x, tz: z,
        colorIdx: 1, pantsIdx: 1, skinIdx: 2,
        dead: false, deadTimer: 0, fallAngle: 0,
        gang: true,
      };
      peds.peds.push(ped);
      this._gang.push(ped);
      peds.panicAt(x, z, 20);
    }
    if (peds._applyColors && !this.game.headless) peds._applyColors();
  }

  _clearGang() {
    if (this.game.peds) {
      const gangSet = new Set(this._gang);
      this.game.peds.peds = this.game.peds.peds.filter((pp) => !gangSet.has(pp));
    }
    this._gang = [];
  }

  // ------------------------------------------------------------ 追击者（chase 型）
  _spawnRunner(m) {
    const g = this.game;
    this._destroyRunner();
    const first = m.path[0];
    const car = new Car("sport", this.road(first[0]), this.road(first[1]), 0);
    car.maxSpeedScale = m.runnerSpeed || 1.0;
    car.onExplode = () => {
      if (g.headless) return;
      g.spawnExplosion(car.pos.x, car.pos.z);
      if (g.sfx && g.sfx.playExplode) g.sfx.playExplode();
    };
    g.scene.add(car.group);
    this._runner = {
      car,
      path: m.path.map(([i, k]) => [
        clamp(this.road(i), -1180, 1180),
        clamp(this.road(k), -1180, 1180),
      ]),
      idx: 0,
      hitCd: 0,
    };
  }

  _destroyRunner() {
    if (!this._runner) return;
    this.game.scene.remove(this._runner.car.group);
    this._runner = null;
  }

  _updateRunner(dt) {
    const g = this.game;
    const R = this._runner;
    const car = R.car;

    this._timer -= dt;
    if (this._timer <= 0) {
      this._failMission("目标逃走了");
      return;
    }

    // 目标沿路点行驶，带前方障碍切线绕行
    const next = R.path[R.idx + 1];
    if (next) {
      const desired = Math.atan2(next[0] - car.pos.x, next[1] - car.pos.z);
      let steer = clamp(angleDiff(desired, car.angle) * 1.6, -1, 1);
      const aheadX = car.pos.x + Math.sin(car.angle) * 9;
      const aheadZ = car.pos.z + Math.cos(car.angle) * 9;
      const hitAhead = g.world && g.world.collideCircle(aheadX, aheadZ, car.radius);
      if (hitAhead) {
        const t1x = -hitAhead.nz;
        const t1z = hitAhead.nx;
        const s1 = Math.abs(angleDiff(Math.atan2(t1x, t1z), desired));
        const tx = s1 < Math.PI / 2 ? t1x : -t1x;
        const tz = s1 < Math.PI / 2 ? t1z : -t1z;
        steer = clamp(angleDiff(Math.atan2(tx, tz), car.angle) * 2.2, -1, 1);
      }
      car.drive(Math.abs(steer) > 0.9 ? 0.55 : 1, steer, false, dt, g.world);
      if (Math.hypot(next[0] - car.pos.x, next[1] - car.pos.z) < 14) R.idx++;
    }
    if (R.idx >= R.path.length - 1) {
      this._failMission("目标逃脱了");
      return;
    }

    if (car.dead) {
      this._completeMission();
      return;
    }

    // 与玩家车碰撞：互相损伤 + 推离 + 火花
    const pv = this.game.player.vehicle;
    if (pv && !pv.dead) {
      const dx = car.pos.x - pv.pos.x;
      const dz = car.pos.z - pv.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = pv.radius + car.radius;
      R.hitCd = Math.max(0, R.hitCd - dt);
      if (d < minD && R.hitCd <= 0) {
        R.hitCd = 0.5;
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const rel = Math.hypot(pv.vx - car.vx, pv.vz - car.vz);
        car.damage(Math.max(6, rel * 0.8));
        pv.damage(Math.max(3, rel * 0.4));
        car.pos.x = pv.pos.x + nx * minD;
        car.pos.z = pv.pos.z + nz * minD;
        if (g.spawnSparks) g.spawnSparks(car.pos.x, 0.7, car.pos.z, 8, 0xffc266, 5);
        if (g.sfx && g.sfx.playCrash) g.sfx.playCrash(rel);
        if (car.dead) { this._completeMission(); return; }
      }
    }

    this._refreshMarker();
    if (!g.headless) this._setMissionHud(this.missions[this.activeIdx]);
  }

  // ------------------------------------------------------------ 帧更新
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;

    // 标记动画
    if (!this.game.headless && this._marker && this._marker.group.visible) {
      const t = performance.now() * 0.002;
      this._marker.oct.position.y = 5 + Math.sin(t * 2) * 0.5;
      this._marker.oct.rotation.y = t * 1.2;
      const pulse = 1 + Math.sin(t * 3) * 0.08;
      this._marker.ring.scale.setScalar(pulse);
    }
    if (this._dialogRunning) return;

    const nearGiver = Math.hypot(p.pos.x - this.giverPos.x, p.pos.z - this.giverPos.z) < 5;
    // 接任务判定（在 giver 面前任务优先于上车，避免与上下车按键冲突）
    if (!this._dialogRunning && !this.game.paused && nearGiver) {
      const k = g.input;
      const eDown = k.isDown("KeyE") || !!k.touchButtons["car"] || !!k.touchButtons["use"];
      if (eDown && !this._prevE) {
        const idx = this.missions.findIndex((mm) => mm.status === "open");
        if (idx >= 0) {
          this._startMission(idx);
          if (g.sfx && g.sfx.playUi) g.sfx.playUi();
        }
      }
      this._prevE = eDown;
    } else {
      this._prevE = g.input.isDown("KeyE");
    }

    // 活动任务逻辑
    if (this.activeIdx < 0) return;
    const m = this.missions[this.activeIdx];
    if (m.type === "reach") {
      const wp = m.waypoints[this._wpIdx];
      if (Math.hypot(p.pos.x - wp[0], p.pos.z - wp[1]) < 7) {
        this._wpIdx++;
        if (this._wpIdx >= m.waypoints.length) {
          this._completeMission();
        } else {
          this._refreshMarker();
          this._setMissionHud(m);
        }
      }
    } else if (m.type === "delivery") {
      this._timer -= dt;
      if (this._timer <= 0) {
        this._failMission("包裹延误了");
        return;
      }
      const target = this._currentTarget(m);
      if (Math.hypot(p.pos.x - target[0], p.pos.z - target[1]) < 8) {
        this._wpIdx++;
        if (this._wpIdx > 1) {
          this._completeMission();
        } else {
          this._refreshMarker();
          this._setMissionHud(m);
          this._toast("包裹已上车 · 送往海星岛码头");
        }
      }
      if (!this.game.headless) {
        // 每帧刷新 HUD 倒计时
        this._setMissionHud(m);
      }
    } else if (m.type === "eliminate") {
      const alive = this._gang.filter((gg) => !gg.dead).length;
      if (alive === 0) {
        this._completeMission();
      }
    } else if (m.type === "chase") {
      if (this._runner) this._updateRunner(dt);
    } else if (m.type === "escape") {
      // 与最近警车保持 _escapeR 米以上才计时；被贴住则暂停计时
      let nearest = Infinity;
      if (g.police) {
        for (const c of g.police.cars) {
          if (c.car.dead) continue;
          const d = Math.hypot(c.car.pos.x - p.pos.x, c.car.pos.z - p.pos.z);
          if (d < nearest) nearest = d;
        }
      }
      this._escapeNearest = nearest;
      this._escapeSafe = nearest > this._escapeR;
      if (this._escapeSafe) {
        this._timer -= dt;
        if (this._timer <= 0) {
          this._completeMission();
          return;
        }
      }
      if (!this.game.headless) this._setMissionHud(m);
    }
  }
}
