/**
 * 前端冒烟测试（Node 环境模拟最小浏览器 DOM/Canvas）
 * ------------------------------------------------------------
 * 目的：验证各页面入口模块能够完整加载（import 链无缺失符号）、
 *       主类关键方法存在、并在真实游戏循环中跑若干帧不抛异常。
 *
 * 运行（在仓库根目录）：
 *     node tools/smoke.mjs
 *
 * 说明：
 * - Canvas 2D 上下文用万能 Proxy 吸收所有绘制调用；
 * - fetch 固定返回 503，使账号/进度模块走「游客 + 本地存档」分支；
 * - requestAnimationFrame 队列手动 flush，每帧推进约 16.7ms；
 * - 任何未捕获异常 / Promise 拒绝都会导致非零退出码。
 */
import { performance } from "node:perf_hooks";

const failures = [];
const errors = [];

process.on("unhandledRejection", (e) => { errors.push(e); });
process.on("uncaughtException", (e) => {
  console.error("[smoke] uncaughtException:", e && e.stack ? e.stack : e);
  errors.push(e);
});

function fail(name, e) {
  failures.push(`${name}: ${e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : e}`);
}

// ---------------------------------------------------------------- 环境准备
function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch (e) {
    console.error(`[smoke] 无法覆盖全局 ${name}:`, e.message);
    process.exit(1);
  }
}

defineGlobal("window", globalThis);
defineGlobal("self", globalThis);

defineGlobal("innerWidth", 1280);
defineGlobal("innerHeight", 720);
defineGlobal("scrollX", 0);
defineGlobal("scrollY", 0);
defineGlobal("devicePixelRatio", 1);
defineGlobal("location", { href: "http://localhost/games/", origin: "http://localhost", pathname: "/games/" });
defineGlobal("history", { pushState() {}, replaceState() {} });

defineGlobal("navigator", { userAgent: "smoke-node", maxTouchPoints: 0, language: "zh-CN" });
defineGlobal("screen", { width: 1920, height: 1080 });
defineGlobal("matchMedia", (q) => ({
  matches: false, media: q,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
}));

// localStorage
const lsMap = new Map();
defineGlobal("localStorage", {
  getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => { lsMap.set(k, String(v)); },
  removeItem: (k) => { lsMap.delete(k); },
  clear: () => { lsMap.clear(); },
  get length() { return lsMap.size; },
  key: (i) => Array.from(lsMap.keys())[i] ?? null,
});

// fetch：全部返回 503，让账号模块走游客分支
defineGlobal("fetch", async () => ({
  ok: false, status: 503, statusText: "Service Unavailable",
  json: async () => ({}), text: async () => "",
  headers: { get: () => null },
}));

// requestAnimationFrame：手动队列
let rafQueue = [];
let rafTime = performance.now();
defineGlobal("requestAnimationFrame", (cb) => { rafQueue.push(cb); return rafQueue.length; });
defineGlobal("cancelAnimationFrame", () => {});
function flushFrames(frames) {
  for (let i = 0; i < frames; i++) {
    rafTime += 1000 / 60;
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) {
      try { cb(rafTime); } catch (e) { errors.push(e); }
    }
  }
}

// setInterval 收集不执行（防止音乐循环等长期定时器拖住进程）
const intervals = [];
defineGlobal("setInterval", (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; });
defineGlobal("clearInterval", () => {});

// ---------------------------------------------------------------- 元素 / Canvas stub
function makeStyle() {
  return {
    setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; },
    item() { return ""; }, cssText: "",
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => {
      const want = on === undefined ? !set.has(c) : Boolean(on);
      if (want) set.add(c); else set.delete(c);
      return want;
    },
    contains: (c) => set.has(c),
  };
}

function makeCtx(canvas) {
  const special = {
    measureText: () => ({ width: 42, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h,
    }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
    getLineDash: () => [],
  };
  const store = {};
  const noop = () => undefined;
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "canvas") return canvas;
      if (typeof prop === "symbol") return undefined;
      if (Object.prototype.hasOwnProperty.call(special, prop)) return special[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
    has(target, prop) {
      return Object.prototype.hasOwnProperty.call(target, prop)
        || Object.prototype.hasOwnProperty.call(special, prop);
    },
  });
}

function makeCanvas() {
  const canvas = {
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    style: makeStyle(), dataset: {},
    classList: makeClassList(),
    getContext: () => makeCtx(canvas),
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
    setAttribute() {}, getAttribute: () => null,
    appendChild() {}, remove() {},
  };
  return canvas;
}

function makeEl(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    style: makeStyle(), dataset: {}, children: [],
    classList: makeClassList(),
    attributes: {},
    addEventListener() {}, removeEventListener() {},
    appendChild(child) { return child; }, removeChild() {}, remove() {},
    insertAdjacentHTML() {}, insertBefore() {},
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k) { return k in el.attributes ? el.attributes[k] : null; },
    removeAttribute(k) { delete el.attributes[k]; },
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    getElementById: () => makeEl(),
    closest: () => null,
    contains: () => false,
    focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }),
    offsetWidth: 100, offsetHeight: 40, clientWidth: 100, clientHeight: 40,
    scrollTop: 0, scrollLeft: 0, scrollHeight: 100, scrollWidth: 100,
    firstChild: null, lastChild: null, parentNode: null, parentElement: null,
    innerHTML: "", textContent: "", value: "",
    disabled: false, checked: false, title: "",
  };
  return el;
}

const elCache = new Map();
function getElById(id) {
  if (!elCache.has(id)) {
    elCache.set(id, String(id).toLowerCase().includes("canvas") ? makeCanvas() : makeEl());
  }
  return elCache.get(id);
}

const docListeners = new Map();
defineGlobal("document", {
  readyState: "complete",
  hidden: false,
  visibilityState: "visible",
  documentElement: makeEl("html"),
  body: makeEl("body"),
  head: makeEl("head"),
  createElement: (tag) => (tag === "canvas" ? makeCanvas() : makeEl(tag)),
  createTextNode: (t) => ({ textContent: t }),
  createDocumentFragment: () => makeEl("fragment"),
  getElementById: (id) => getElById(id),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener(type, fn) {
    if (!docListeners.has(type)) docListeners.set(type, new Set());
    docListeners.get(type).add(fn);
  },
  removeEventListener(type, fn) { docListeners.get(type)?.delete(fn); },
  dispatchEvent(ev) { return true; },
});

globalThis.document.documentElement.dataset.device = "desktop";

// window 级事件总线（与 globalThis 共用）
const winListeners = new Map();
defineGlobal("addEventListener", (type, fn) => {
  if (!winListeners.has(type)) winListeners.set(type, new Set());
  winListeners.get(type).add(fn);
});
defineGlobal("removeEventListener", (type, fn) => { winListeners.get(type)?.delete(fn); });
defineGlobal("dispatchEvent", (ev) => {
  const set = winListeners.get(ev?.type);
  if (set) {
    for (const fn of set) {
      try { fn(ev); } catch (e) { errors.push(e); }
    }
  }
  return true;
});

// Image stub：设置 src 后异步触发 onload
defineGlobal("Image", class {
  constructor(w, h) { this.width = w; this.height = h; }
  set src(v) {
    this._src = v;
    queueMicrotask(() => { try { this.onload && this.onload(); } catch (e) { errors.push(e); } });
  }
  get src() { return this._src; }
});

defineGlobal("getComputedStyle", () => Object.assign(makeStyle(), {
  fontFamily: "\"PingFang SC\", \"Microsoft YaHei\", sans-serif",
  fontSize: "16px",
  fontWeight: "400",
  lineHeight: "1.5",
  color: "#333",
}));

// AudioContext stub
function param(v = 1) {
  return {
    value: v,
    setValueAtTime() {}, setTargetAtTime() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  };
}
function audioNode() {
  const n = { connect() { return n; }, disconnect() {} };
  return n;
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.sampleRate = 44100;
    this.destination = audioNode();
  }
  createDynamicsCompressor() {
    const n = audioNode();
    n.threshold = param(); n.knee = param(); n.ratio = param();
    n.attack = param(); n.release = param();
    return n;
  }
  createGain() { const n = audioNode(); n.gain = param(0.5); return n; }
  createOscillator() {
    const n = audioNode();
    n.frequency = param(440); n.type = "sine";
    n.start = () => {}; n.stop = () => {};
    return n;
  }
  createBuffer(ch, len, rate) {
    return { getChannelData: () => new Float32Array(len), duration: len / rate, length: len, numberOfChannels: ch };
  }
  createBufferSource() { const n = audioNode(); n.buffer = null; n.start = () => {}; n.stop = () => {}; return n; }
  createBiquadFilter() { const n = audioNode(); n.frequency = param(1000); n.type = "lowpass"; return n; }
  createAnalyser() { const n = audioNode(); n.frequencyBinCount = 32; n.getByteFrequencyData = () => {}; return n; }
  resume() { return Promise.resolve(this); }
  suspend() { return Promise.resolve(this); }
  close() { return Promise.resolve(); }
  addEventListener() {}
}
defineGlobal("AudioContext", FakeAudioContext);
defineGlobal("webkitAudioContext", FakeAudioContext);

// ---------------------------------------------------------------- 冒烟用例
const SMOKE_TASKS = [
  {
    name: "home",
    url: "../site/assets/js/home.js",
    entry: null,
    drive: () => flushFrames(5),
  },
  {
    name: "stone-wars",
    url: "../site/stone-wars/js/game.js",
    entry: "stoneWars",
    methods: ["startLevel", "_render", "_update", "firePlayer", "explode", "finish"],
    drive(g) { g.startLevel(1); flushFrames(90); },
  },
  {
    name: "pvz",
    url: "../site/pvz/js/game.js",
    entry: "pvz",
    methods: ["startLevel", "_render", "_update", "finish", "_tryPlant"],
    drive(g) { g.startLevel(1); flushFrames(90); },
  },
  {
    name: "carrot",
    url: "../site/carrot/js/game.js",
    entry: "carrot",
    methods: ["startLevel", "_render", "_update", "_winLevel", "_buildTower"],
    drive(g) { g.startLevel(1); flushFrames(90); },
  },
  {
    name: "pokemon",
    url: "../site/pokemon/js/game.js",
    entry: "pokemon",
    methods: ["startEncounter", "_renderBattle", "_turn", "_winBattle", "_renderTeamScreen"],
    drive() { flushFrames(90); },
  },
];

async function main() {
  for (const task of SMOKE_TASKS) {
    const before = errors.length;
    let ok = true;
    try {
      const mod = await import(new URL(task.url, import.meta.url).href);
      // 等待异步 boot 链（ProgressStore.init / fetch stub 均为微任务或快速 promise）
      await new Promise((r) => setTimeout(r, 60));
      if (task.entry) {
        const g = globalThis.window[`__${task.entry}`];
        if (!g) { throw new Error(`入口实例 window.__${task.entry} 不存在`); }
        for (const m of task.methods) {
          if (typeof g[m] !== "function") {
            throw new Error(`主类方法缺失: ${task.entry}.${m}`);
          }
        }
        task.drive(g);
      } else {
        task.drive();
      }
      flushFrames(5);
    } catch (e) {
      ok = false;
      fail(task.name, e);
    }
    const newErrors = errors.slice(before);
    if (newErrors.length) {
      ok = false;
      newErrors.forEach((e) => fail(task.name, e));
    }
    console.log(`${ok ? "PASS" : "FAIL"}  ${task.name}${task.entry ? ` (window.__${task.entry})` : ""}`);
  }

  if (failures.length) {
    console.error("\n冒烟测试失败，共 %d 处：", failures.length);
    failures.forEach((f) => console.error("----\n" + f));
    process.exit(1);
  }
  console.log("\n全部冒烟测试通过");
  process.exit(0);
}

main().catch((e) => {
  console.error("[smoke] 主流程异常:", e && e.stack ? e.stack : e);
  process.exit(1);
});
