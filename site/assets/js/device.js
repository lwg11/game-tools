/**
 * 设备自动识别
 * 规则：优先 UA（手机/平板），其次触摸能力 + 屏幕短边尺寸。
 * 结果写入 <html data-device="mobile|desktop">，同时导出供游戏页使用。
 */
const ua = navigator.userAgent || "";
const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|HarmonyOS|MicroMessenger/i.test(ua);
const touch = (navigator.maxTouchPoints || 0) > 0;
const shortSide = Math.min(screen.width || 0, screen.height || 0);
const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

export const isMobile = uaMobile || (touch && coarse && shortSide <= 820);
export const isTouch = touch || coarse;
export const deviceName = isMobile ? "mobile" : "desktop";

document.documentElement.dataset.device = deviceName;
document.documentElement.classList.add(isMobile ? "is-mobile" : "is-desktop");

// 关闭长按复制/图片保存/链接菜单；输入框仍保留系统菜单
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest || !e.target.closest("input, textarea, [contenteditable='true']")) {
    e.preventDefault();
  }
}, { passive: false });

export function markDeviceBadge(el) {
  if (!el) return;
  el.innerHTML = `<span class="dot"></span>${isMobile ? "已识别为手机" : "已识别为电脑"}`;
}
