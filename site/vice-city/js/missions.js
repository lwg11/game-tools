/**
 * 罪恶都市 · 任务系统
 * ------------------------------------------------------------
 * 三个主线任务：
 *  - m1 无名小卒：与律师会面，跑三个地点（reach 型）
 *  - m2 快递包裹：限时取包送达（delivery 型）
 *  - m3 一网打尽：消灭迪亚兹部署的 5 名打手（eliminate 型，生成 gang 行人）
 *
 * 流程：giver 处按 E 接取 → 对话 → 标记指引 → 完成发奖励/解锁武器 → 存档
 * 任务难度/内容与 1986 年罪恶城氛围对齐（黄色 M / 粉色电话亭风格）。
 */
import * as THREE from "../lib/three.module.min.js";
import { WORLD, clamp } from "./common.js";
import { WEAPONS } from "./weapons.js";

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
    ];

    this.activeIdx = -1;
    this._wpIdx = 0;
    this._timer = 0;
    this._prevE = false;
    this._gang = [];
    this._dialogRunning = false;
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
    return null;
  }

  // ------------------------------------------------------------ 外部接口
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
    if (d < 5) return `按 E 开始任务：${next.title}`;
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
      const eDown = g.input.isDown("KeyE");
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
    }
  }
}
