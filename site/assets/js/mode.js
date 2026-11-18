/**
 * 全局游戏模式
 * ------------------------------------------------------------
 * normal：常规模式，保持原版体验，隐藏金手指入口
 * crazy ：疯狂模式，显示金手指，武器火力与特效全面失控
 * 设置跟随账号：登录后从云端读取并保存，游客则保存在本机。
 */
import { api } from "./api.js";

const GUEST_KEY = "stoneArcade.mode";
let currentUser = null;

function userKey(user) {
  return user && user.username ? `${GUEST_KEY}::${String(user.username).toLowerCase()}` : GUEST_KEY;
}

function readMode(key) {
  try {
    return localStorage.getItem(key) === "crazy" ? "crazy" : "normal";
  } catch (err) {
    return "normal";
  }
}

function writeMode(key, mode) {
  try {
    localStorage.setItem(key, mode);
  } catch (err) {
    /* 隐私模式下忽略 */
  }
}

function dispatchModeChanged(mode) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gt:mode-changed", { detail: { mode } }));
}

/** 解析账号模式：云端优先，其次账号本地缓存，首次登录沿用游客设置 */
function resolveAccountMode(user, prefs) {
  const remote = prefs && prefs.mode;
  if (remote === "crazy" || remote === "normal") return { mode: remote, push: false };
  const key = userKey(user);
  let hasCache = false;
  try { hasCache = localStorage.getItem(key) !== null; } catch (err) { hasCache = false; }
  return { mode: readMode(hasCache ? key : GUEST_KEY), push: true };
}

async function loadAccountMode() {
  let me = null;
  try {
    me = await api.me();
  } catch (err) {
    return;
  }
  if (!me || !me.user) return;
  currentUser = me.user;
  const { mode, push } = resolveAccountMode(me.user, me.prefs);
  writeMode(userKey(me.user), mode);
  applyBodyMode();
  dispatchModeChanged(mode);
  if (push) api.savePrefs({ mode }).catch(() => {});
}

function syncAuth(user) {
  currentUser = user || null;
  if (user) {
    loadAccountMode();
  } else {
    applyBodyMode();
    dispatchModeChanged(getMode());
  }
}

export function getMode() {
  return readMode(userKey(currentUser));
}

export function isCrazy() {
  return getMode() === "crazy";
}

export function setMode(mode) {
  const next = mode === "crazy" ? "crazy" : "normal";
  writeMode(userKey(currentUser), next);
  applyBodyMode();
  dispatchModeChanged(next);
  if (currentUser) api.savePrefs({ mode: next }).catch(() => {});
}

export function applyBodyMode() {
  if (typeof document === "undefined" || !document.body) return;
  const crazy = isCrazy();
  document.body.classList.toggle("crazy-mode", crazy);
  document.body.classList.toggle("normal-mode", !crazy);
}

if (typeof window !== "undefined") {
  applyBodyMode();
  window.addEventListener("gt:auth-changed", (e) => syncAuth(e.detail && e.detail.user));
  loadAccountMode();
}
