/**
 * 进度存储
 * 策略：
 * - 始终先写 localStorage（游客也能玩）
 * - 已登录时从服务端拉取，与服务端进度做「取最优」合并后再回传
 * - 游戏中的每次进度变化：本地立即写，云端 600ms 防抖写入
 */
import { api } from "./api.js";

const KEY_PREFIX = "gt.progress.v1.";

export const GAME_IDS = ["stone-wars", "pvz", "carrot", "pokemon", "vice-city", "need-for-speed"];

export const DEFAULT_PROGRESS = {
  "stone-wars": {
    unlocked: 1,
    stars: {},
    bestTurns: {},
    cleared: {},
    endlessBest: 0,
    tutorialSeen: false,
    sound: true,
  },
  pvz: {
    unlocked: 1,
    stars: {},
    cleared: {},
    endlessBest: 0,
    tutorialSeen: false,
    sound: true,
  },
  carrot: {
    unlocked: 1,
    stars: {},
    cleared: {},
    endlessBest: 0,
    tutorialSeen: false,
    sound: true,
  },
  pokemon: {
    unlocked: 1,
    stars: {},
    cleared: {},
    endlessBest: 0,
    tutorialSeen: false,
    sound: true,
    money: 1200,
    items: {
      potion: 3,
      superPotion: 1,
      hyperPotion: 0,
      pokeBall: 5,
      greatBall: 1,
      ultraBall: 0,
      masterBall: 0,
    },
    team: [],
    box: [],
    caught: {},
    starter: null,
    quests: [],
    questsDone: 0,
    steps: 0,
    wins: 0,
    catches: 0,
    pos: { x: 255, y: 385 },
  },
  "vice-city": {
    money: 500,
    weapons: ["fist"],
    ammo: {},
    weaponIndex: 0,
    armor: 0,
    missionsDone: 0,
    taxiDone: 0,
    tutorialSeen: false,
    sound: true,
  },
  "need-for-speed": {
    unlocked: 1,
    wins: 0,
    racesDone: 0,
    bestLap: 0,
    credits: 0,
    sound: true,
  },
};

export const GAME_NAMES = {
  "stone-wars": "石器大战",
  pvz: "植物大战僵尸加强版",
  carrot: "保卫萝卜",
  pokemon: "精灵宝可梦",
  "vice-city": "罪恶都市",
  "need-for-speed": "霓虹海岸竞速",
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readLocal(gameId) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + gameId);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch (err) {
    return null;
  }
}

function writeLocal(gameId, data) {
  try {
    localStorage.setItem(KEY_PREFIX + gameId, JSON.stringify(data));
  } catch (err) {
    /* 存储空间不足时静默失败，不影响游戏 */
  }
}

/** 数值取大、布尔取或，适用于关卡解锁与星级 */
function mergeMaps(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => {
    const av = Number(out[k]) || 0;
    const bv = Number(b[k]) || 0;
    out[k] = Math.max(av, bv);
  });
  return out;
}

/** 合并两份进度，保证换设备登录不会丢档 */
export function mergeProgress(gameId, remote, local) {
  const base = clone(DEFAULT_PROGRESS[gameId] || {});
  const a = { ...base, ...(remote || {}) };
  const b = { ...base, ...(local || {}) };
  if (gameId === "stone-wars") {
    const bestTurns = { ...(a.bestTurns || {}) };
    Object.keys(b.bestTurns || {}).forEach((k) => {
      const av = Number(bestTurns[k]) || 0;
      const bv = Number(b.bestTurns[k]) || 0;
      bestTurns[k] = av > 0 && bv > 0 ? Math.min(av, bv) : av || bv;
    });
    return {
      ...a,
      unlocked: Math.max(Number(a.unlocked) || 1, Number(b.unlocked) || 1),
      stars: mergeMaps(a.stars, b.stars),
      cleared: { ...(a.cleared || {}), ...(b.cleared || {}) },
      bestTurns,
      endlessBest: Math.max(Number(a.endlessBest) || 0, Number(b.endlessBest) || 0),
      tutorialSeen: Boolean(a.tutorialSeen || b.tutorialSeen),
      sound: b.sound !== false,
    };
  }
  if (gameId === "pokemon") {
    // 宝可梦按 uid 合并，队伍优先使用本地，其余进入电脑
    const byUid = new Map();
    [...(b.team || []), ...(b.box || []), ...(a.team || []), ...(a.box || [])].forEach((m) => {
      if (m && m.uid) byUid.set(m.uid, m);
    });
    const preferredTeam = ((b.team || []).length ? b.team : (a.team || []))
      .map((m) => byUid.get(m.uid) || m)
      .slice(0, 3);
    const teamUids = new Set(preferredTeam.map((m) => m.uid));
    const box = [...byUid.values()].filter((m) => !teamUids.has(m.uid));
    const items = { ...(a.items || {}) };
    Object.keys(b.items || {}).forEach((k) => {
      items[k] = Math.max(Number(items[k]) || 0, Number(b.items[k]) || 0);
    });
    return {
      ...a,
      unlocked: Math.max(Number(a.unlocked) || 1, Number(b.unlocked) || 1),
      stars: mergeMaps(a.stars, b.stars),
      cleared: { ...(a.cleared || {}), ...(b.cleared || {}) },
      money: Math.max(Number(a.money) || 0, Number(b.money) || 0),
      items,
      caught: { ...(a.caught || {}), ...(b.caught || {}) },
      team: preferredTeam,
      box,
      starter: b.starter || a.starter || null,
      quests: (b.quests || []).length ? b.quests : (a.quests || []),
      questsDone: Math.max(Number(a.questsDone) || 0, Number(b.questsDone) || 0),
      steps: Math.max(Number(a.steps) || 0, Number(b.steps) || 0),
      wins: Math.max(Number(a.wins) || 0, Number(b.wins) || 0),
      catches: Math.max(Number(a.catches) || 0, Number(b.catches) || 0),
      pos: b.pos || a.pos || { x: 255, y: 385 },
      endlessBest: 0,
      tutorialSeen: Boolean(a.tutorialSeen || b.tutorialSeen),
      sound: b.sound !== false,
    };
  }
  if (gameId === "vice-city") {
    // 武器取并集，弹药/现金/任务数取最大
    const weapons = Array.from(new Set([...(a.weapons || []), ...(b.weapons || [])]));
    const ammo = { ...(a.ammo || {}) };
    Object.keys(b.ammo || {}).forEach((k) => {
      ammo[k] = Math.max(Number(ammo[k]) || 0, Number(b.ammo[k]) || 0);
    });
    const weaponIndex = Math.max(0, Math.min(
      Number(b.weaponIndex != null ? b.weaponIndex : a.weaponIndex) || 0,
      Math.max(0, weapons.length - 1),
    ));
    return {
      ...a,
      money: Math.max(Number(a.money) || 0, Number(b.money) || 0),
      weapons,
      ammo,
      weaponIndex,
      armor: Math.max(Number(a.armor) || 0, Number(b.armor) || 0),
      missionsDone: Math.max(Number(a.missionsDone) || 0, Number(b.missionsDone) || 0),
      taxiDone: Math.max(Number(a.taxiDone) || 0, Number(b.taxiDone) || 0),
      tutorialSeen: Boolean(a.tutorialSeen || b.tutorialSeen),
      sound: b.sound !== false,
    };
  }
  return {
    ...a,
    unlocked: Math.max(Number(a.unlocked) || 1, Number(b.unlocked) || 1),
    stars: mergeMaps(a.stars, b.stars),
    cleared: { ...(a.cleared || {}), ...(b.cleared || {}) },
    endlessBest: Math.max(Number(a.endlessBest) || 0, Number(b.endlessBest) || 0),
    tutorialSeen: Boolean(a.tutorialSeen || b.tutorialSeen),
    sound: b.sound !== false,
  };
}

/** 只读：主页展示用，拉取云端并与本地合并，但不写回 */
export async function loadMergedProgress(gameId) {
  const local = readLocal(gameId) || clone(DEFAULT_PROGRESS[gameId]);
  let remote = null;
  let user = null;
  try {
    const me = await api.me();
    user = me.user;
    remote = me.user ? me.progress[gameId] : null;
  } catch (err) {
    user = null;
  }
  return {
    user,
    progress: remote ? mergeProgress(gameId, remote, local) : local,
    isGuest: !user,
  };
}

export class ProgressStore {
  constructor(gameId) {
    this.gameId = gameId;
    this.state = clone(DEFAULT_PROGRESS[gameId]);
    this.user = null;
    this.syncState = "local"; // local | syncing | synced | error
    this._timer = null;
    this._listeners = new Set();
    window.addEventListener("gt:auth-changed", (e) => {
      this.user = e.detail.user;
      if (this.user) this.syncFromServer();
      else this._setSync("local");
    });
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => {
      try { fn(this.state, this.syncState, this.user); } catch (err) { /* ignore */ }
    });
  }

  _setSync(state) {
    this.syncState = state;
    this._emit();
  }

  async init() {
    const local = readLocal(this.gameId);
    this.state = local ? mergeProgress(this.gameId, null, local) : clone(DEFAULT_PROGRESS[this.gameId]);
    this._emit();
    try {
      const me = await api.me();
      this.user = me.user;
      if (me.user) {
        await this.syncFromServer(me.progress[this.gameId] || null);
      } else {
        this._setSync("local");
      }
    } catch (err) {
      this._setSync("local");
    }
    return this.state;
  }

  /** 登录后拉取云端进度并合并回传 */
  async syncFromServer(remoteOverride) {
    let remote = remoteOverride;
    if (remote === undefined) {
      try {
        const me = await api.me();
        this.user = me.user;
        remote = this.user ? me.progress[this.gameId] : null;
      } catch (err) {
        this._setSync("error");
        return;
      }
    }
    if (!this.user) {
      this._setSync("local");
      return;
    }
    this._setSync("syncing");
    const merged = mergeProgress(this.gameId, remote, this.state);
    this.state = merged;
    writeLocal(this.gameId, merged);
    this._emit();
    try {
      await api.saveProgress(this.gameId, merged);
      this._setSync("synced");
    } catch (err) {
      this._setSync("error");
    }
  }

  /** 修改进度并自动保存 */
  update(mutator) {
    mutator(this.state);
    writeLocal(this.gameId, this.state);
    this._emit();
    this._queueCloudSave();
  }

  _queueCloudSave() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 600);
  }

  async saveNow() {
    if (!this.user) return;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      await api.saveProgress(this.gameId, this.state);
      this._setSync("synced");
    } catch (err) {
      this._setSync("error");
    }
  }
}
