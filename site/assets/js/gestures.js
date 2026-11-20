/**
 * 统一禁用浏览器默认手势事件
 * - 双击缩放 / 长按弹出菜单 / 右键菜单 / 文本选中 / 图片拖拽 / Safari 捏合手势
 * - 配合各页面 meta viewport 的 user-scalable=no 与 CSS touch-action
 * 在页面入口模块调用一次 preventBrowserGestures() 即可。
 */
export function preventBrowserGestures() {
  const isEditable = (el) => {
    if (!el || !el.closest) return false;
    return !!el.closest("input, textarea, select, [contenteditable='true'], [data-allow-select]");
  };

  // 右键菜单：游戏画面与 UI 不弹浏览器菜单
  document.addEventListener("contextmenu", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });

  // 双击选中 / 双击缩放
  document.addEventListener("dblclick", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  }, false);

  // 长按选中（iOS/Android 文本选择手柄）
  document.addEventListener("selectstart", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });

  // iOS Safari 捏合与双击手势
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), false);
  });

  // 图片/画布被长按拖走
  document.addEventListener("dragstart", (e) => {
    if (e.target && (e.target.tagName === "IMG" || e.target.tagName === "CANVAS")) e.preventDefault();
  });
}
