/**
 * 进度存储
 * 策略：
 * - 始终先写 localStorage（游客也能玩）
 * - 已登录时从服务端拉取，与服务端进度做「取最优」合并后再回传
 * - 游戏中的每次进度变化：本地立即写，云端 600ms 防抖写入
 */
import { api } from "./api.js";

const KEY_PREFIX = "gt.progress.v1.";

export const GAME_IDS = ["stone-wars", "pvz", "carrot"];

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
};

export const GAME_NAMES = {
  "stone-wars": "石器大战",
  pvz: "植物大战僵尸加强版",
  carrot: "保卫萝卜",
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
