/**
 * 全局游戏模式
 * ------------------------------------------------------------
 * normal：常规模式，保持原版体验，隐藏金手指入口
 * crazy ：疯狂模式，显示金手指，武器火力与特效全面失控
 * 设置保存在本地，首页切换后对所有游戏生效。
 */
const KEY = "stoneArcade.mode";

export function getMode() {
  try {
    return localStorage.getItem(KEY) === "crazy" ? "crazy" : "normal";
  } catch (err) {
    return "normal";
  }
}

export function isCrazy() {
  return getMode() === "crazy";
}

export function setMode(mode) {
  try {
    localStorage.setItem(KEY, mode === "crazy" ? "crazy" : "normal");
  } catch (err) {
    /* 隐私模式下忽略 */
  }
  applyBodyMode();
}

export function applyBodyMode() {
  if (typeof document === "undefined" || !document.body) return;
  const crazy = isCrazy();
  document.body.classList.toggle("crazy-mode", crazy);
  document.body.classList.toggle("normal-mode", !crazy);
}
