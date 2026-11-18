/** 页面入口（外置脚本：响应式 CSP script-src 'self'，不允许内联脚本） */
import { boot } from "./game.js";

const game = await boot();
// 调试句柄（控制台/自动化测试用）
window.__vc = game;
