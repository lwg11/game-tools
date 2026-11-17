import { markDeviceBadge } from "./device.js";
import { initAccount } from "./account.js";
import { loadMergedProgress, GAME_IDS } from "./progress.js";
import { toast } from "./ui.js";

markDeviceBadge(document.getElementById("deviceTag"));
markDeviceBadge(document.getElementById("deviceTag2"));

const TOTAL = { "stone-wars": 14, pvz: 12, carrot: 8 };
const els = {
  "stone-wars": {
    bar: document.getElementById("swBar"),
    text: document.getElementById("swProgress"),
    sync: document.getElementById("swSync"),
    enter: document.getElementById("swEnter"),
  },
  pvz: {
    bar: document.getElementById("pvzBar"),
    text: document.getElementById("pvzProgress"),
    sync: document.getElementById("pvzSync"),
    enter: document.getElementById("pvzEnter"),
  },
  carrot: {
    bar: document.getElementById("ctBar"),
    text: document.getElementById("ctProgress"),
    sync: document.getElementById("ctSync"),
    enter: document.getElementById("ctEnter"),
  },
};

function starCount(stars) {
  return Object.values(stars || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function paint(gameId, progress, isGuest) {
  const total = TOTAL[gameId];
  const unlocked = Math.max(1, Math.min(total, Number(progress.unlocked) || 1));
  const stars = starCount(progress.stars);
  const cleared = Object.keys(progress.stars || {}).length;
  const el = els[gameId];
  if (!el) return;
  const pct = Math.round((unlocked / total) * 100);
  el.bar.style.width = pct + "%";
  let text = `已解锁 ${unlocked}/${total} · ${stars}★`;
  if (gameId === "pvz" && Number(progress.endlessBest) > 0) {
    text += ` · 无尽 ${progress.endlessBest} 波`;
  }
  if (gameId === "stone-wars" && Number(progress.endlessBest) > 0) {
    text += ` · 无限 ${progress.endlessBest} 波`;
  }
  if (gameId === "carrot" && Number(progress.endlessBest) > 0) {
    text += ` · 无尽 ${progress.endlessBest} 波`;
  }
  el.text.textContent = text;
  el.sync.textContent = isGuest ? "游客进度 · 登录可同步" : "已登录 · 云端存档";
  if (cleared >= total) {
    el.enter.textContent = gameId === "pvz" || gameId === "carrot" ? "挑战无尽" : "再战一局";
  } else if (unlocked > 1) {
    el.enter.textContent = `继续第 ${unlocked} 关`;
  } else {
    el.enter.textContent = "开始游戏";
  }
}

let refreshing = false;

/** 只读取进度并绘制卡片，不重复初始化账号组件 */
async function refreshCards() {
  if (refreshing) return;
  refreshing = true;
  try {
    const results = await Promise.all(GAME_IDS.map((id) => loadMergedProgress(id)));
    GAME_IDS.forEach((id, i) => {
      paint(id, results[i].progress, !results[i].user);
    });
  } catch (err) {
    GAME_IDS.forEach((id) => {
      const el = els[id];
      if (el) {
        el.text.textContent = "本地进度";
        el.sync.textContent = "游客进度 · 登录可同步";
      }
    });
  } finally {
    refreshing = false;
  }
}

async function boot() {
  // 账号组件只初始化一次，避免重复绑定点击事件
  try {
    await initAccount(document.querySelector("[data-account-chip]"));
  } catch (err) { /* 游客模式 */ }
  await refreshCards();
  // 登录 / 登出后刷新卡片（gt:auth-changed 只在用户状态真正变化时派发）
  window.addEventListener("gt:auth-changed", (e) => {
    refreshCards();
    if (e.detail && e.detail.user) toast(`欢迎回来，${e.detail.user.username}`, "ok", 1800);
  });
}

boot();

// 说明弹窗
const howModal = document.getElementById("howModal");
const openHow = () => howModal.classList.add("open");
const closeHow = () => howModal.classList.remove("open");
document.getElementById("howBtn").addEventListener("click", openHow);
document.getElementById("howClose").addEventListener("click", closeHow);
document.getElementById("howOk").addEventListener("click", closeHow);
howModal.addEventListener("click", (e) => {
  if (e.target === howModal) closeHow();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHow();
});

// 首页卡片轻微视差（仅桌面，避免手机无谓耗电）
const art = document.querySelector(".hero-art");
if (art && window.matchMedia("(pointer: fine)").matches) {
  const cabinet = art.querySelector(".cabinet");
  art.addEventListener("pointermove", (e) => {
    const rect = art.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    cabinet.style.transform = `rotateY(${dx * 7}deg) rotateX(${-dy * 6}deg)`;
  });
  art.addEventListener("pointerleave", () => {
    cabinet.style.transform = "";
  });
}
