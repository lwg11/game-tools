/**
 * 在线时长心跳上报
 * - 登录用户每 60 秒上报一次，服务端累计在线时长
 * - 页面隐藏时暂停，恢复时立即上报一次
 * - 游客模式不上报
 */
import { api } from "./api.js";
import { account } from "./account.js";

const INTERVAL = 60 * 1000; // 60 秒
let timer = null;
let running = false;

async function ping() {
  const user = account.getUser();
  if (!user) {
    stop();
    return;
  }
  try {
    await api.heartbeat();
  } catch (err) {
    // 网络失败静默，下次重试
  }
}

export function startHeartbeat() {
  if (running) return;
  if (!account.getUser()) return;
  running = true;
  // 立即上报一次
  ping();
  timer = setInterval(() => {
    if (document.hidden) return; // 页面隐藏时跳过
    ping();
  }, INTERVAL);
  // 页面从隐藏恢复时立即上报
  document.addEventListener("visibilitychange", onVisible);
}

export function stop() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.removeEventListener("visibilitychange", onVisible);
}

function onVisible() {
  if (!document.hidden && running) {
    ping();
  }
}
