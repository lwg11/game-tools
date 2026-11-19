import { markDeviceBadge, isMobile } from "./device.js";
import { initAccount } from "./account.js";
import { loadMergedProgress, GAME_IDS } from "./progress.js";
import { toast } from "./ui.js";
import { getMode, setMode, applyBodyMode } from "./mode.js";

markDeviceBadge(document.getElementById("deviceTag"));
markDeviceBadge(document.getElementById("deviceTag2"));

// 常规 / 疯狂模式开关：常规隐藏金手指，疯狂解锁金手指并让火力与特效失控
applyBodyMode();
const modeBtn = document.getElementById("modeToggle");
function paintMode() {
  if (!modeBtn) return;
  const crazy = getMode() === "crazy";
  modeBtn.dataset.mode = crazy ? "crazy" : "normal";
  modeBtn.setAttribute("aria-checked", crazy ? "true" : "false");
  modeBtn.title = crazy ? "疯狂模式：显示金手指，火力与特效全开" : "常规模式：原版体验，隐藏金手指";
}
if (modeBtn) {
  paintMode();
  modeBtn.addEventListener("click", () => {
    const next = getMode() === "crazy" ? "normal" : "crazy";
    setMode(next);
    paintMode();
    toast(next === "crazy" ? "已切换到疯狂模式：金手指已解锁，火力全开" : "已切换到常规模式：金手指已隐藏", "ok", 2400);
  });
  window.addEventListener("gt:mode-changed", paintMode);
}

const TOTAL = { "stone-wars": 20, pvz: 12, carrot: 8 };
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
  pokemon: {
    bar: document.getElementById("pkBar"),
    text: document.getElementById("pkProgress"),
    sync: document.getElementById("pkSync"),
    enter: document.getElementById("pkEnter"),
  },
  "vice-city": {
    bar: document.getElementById("vcBar"),
    text: document.getElementById("vcProgress"),
    sync: document.getElementById("vcSync"),
    enter: document.getElementById("vcEnter"),
  },
  "need-for-speed": {
    bar: document.getElementById("nfsBar"),
    text: document.getElementById("nfsProgress"),
    sync: document.getElementById("nfsSync"),
    enter: document.getElementById("nfsEnter"),
  },
};

function starCount(stars) {
  return Object.values(stars || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function paint(gameId, progress, isGuest) {
  const el = els[gameId];
  if (!el) return;
  if (gameId === "vice-city") {
    const money = Number(progress.money) || 0;
    const missions = Number(progress.missionsDone) || 0;
    const weapons = Array.isArray(progress.weapons) ? progress.weapons.length : 1;
    el.bar.style.width = Math.min(100, Math.round((missions / 3) * 100)) + "%";
    el.text.textContent = `任务 ${missions}/3 · 武器 ${weapons} · $${money.toLocaleString()}`;
    el.sync.textContent = isGuest ? "游客进度 · 登录可同步" : "已登录 · 云端存档";
    el.enter.textContent = missions > 0 ? "继续任务" : "进入罪恶城";
    return;
  }
  if (gameId === "pokemon") {
    const caught = Object.keys(progress.caught || {}).length;
    const questsDone = Number(progress.questsDone) || 0;
    el.bar.style.width = Math.round((caught / 31) * 100) + "%";
    el.text.textContent = `图鉴 ${caught}/31 · 已完成委托 ${questsDone}`;
    el.sync.textContent = isGuest ? "游客进度 · 登录可同步" : "已登录 · 云端存档";
    el.enter.textContent = caught > 0 || questsDone > 0 ? "继续冒险" : "开始冒险";
    return;
  }
  if (gameId === "need-for-speed") {
    const wins = Number(progress.wins) || 0;
    const races = Number(progress.racesDone) || 0;
    const best = Number(progress.bestLap) || 0;
    el.bar.style.width = Math.min(100, races * 20) + "%";
    el.text.textContent = `原型开发中 · 场次 ${races} · 胜场 ${wins}` + (best > 0 ? ` · 最佳圈速 ${best.toFixed(1)}s` : "");
    el.sync.textContent = isGuest ? "游客进度 · 登录可同步" : "已登录 · 云端存档";
    el.enter.textContent = "进入原型";
    return;
  }
  const total = TOTAL[gameId];
  const unlocked = Math.max(1, Math.min(total, Number(progress.unlocked) || 1));
  const stars = starCount(progress.stars);
  const cleared = Object.keys(progress.stars || {}).length;
  const pct = Math.round((unlocked / total) * 100);
  el.bar.style.width = pct + "%";
  let text = `已解锁 ${unlocked}/${total} · ${stars}★`;
  if (gameId === "pvz" && Number(progress.endlessBest) > 0) {
    text += ` · 无尽 ${progress.endlessBest} 波`;
  }
  if (gameId === "stone-wars" && Number(progress.endlessBest) > 0) {
    text += " · 无限模式已通关";
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
  // 罪恶都市目前仅支持 PC：移动端隐藏入口（直接输入 URL 仍可访问）
  if (isMobile) {
    const vcCard = document.querySelector('[data-game="vice-city"]');
    if (vcCard) vcCard.remove();
    const cnt = document.getElementById("portalCount");
    if (cnt) cnt.textContent = "五款都支持手机与电脑，进度自动保存。";
    const mcnt = document.getElementById("modalCount");
    if (mcnt) mcnt.textContent = "五款游戏的操作与进度规则";
  }
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
