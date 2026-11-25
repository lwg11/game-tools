/**
 * 排行榜弹窗
 * - 登录用户可查看，游客提示登录
 * - 按游戏维度展示所有用户的排名
 */
import { api } from "./api.js";
import { account } from "./account.js";
import { icon, escapeHtml } from "./ui.js";

const GAME_NAMES = {
  "stone-wars": "石器大战",
  pvz: "植物大战僵尸加强版",
  carrot: "保卫萝卜",
  pokemon: "精灵宝可梦",
  "vice-city": "罪恶都市",
  "need-for-speed": "霓虹海岸竞速",
};

let modalEl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal-mask";
  modalEl.id = "gt-leaderboard-modal";
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="排行榜">
      <div class="modal-head">
        <div>
          <div class="modal-title">排行榜</div>
          <div class="modal-sub" id="lbSub"></div>
        </div>
        <button class="modal-close" id="lbClose" aria-label="关闭">${icon("close")}</button>
      </div>
      <div id="lbBody"></div>
    </div>`;
  document.body.appendChild(modalEl);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) close();
  });
  modalEl.querySelector("#lbClose").addEventListener("click", close);
}

function close() {
  if (modalEl) modalEl.classList.remove("open");
}

function renderList(entries, selfId) {
  const body = modalEl.querySelector("#lbBody");
  if (!entries.length) {
    body.innerHTML = '<p class="tip">还没有人上榜，快来当第一名！</p>';
    return;
  }
  const rows = entries.map((e) => {
    const isSelf = e.userId === selfId;
    const rankCls = e.rank <= 3 ? `rank-${e.rank}` : "";
    const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `<span class="rank-num">${e.rank}</span>`;
    return `
      <div class="lb-row${isSelf ? " self" : ""}">
        <span class="lb-rank ${rankCls}">${medal}</span>
        <span class="lb-name">${escapeHtml(e.username)}${isSelf ? ' <span class="lb-self">我</span>' : ""}</span>
        <span class="lb-detail">${escapeHtml(e.detail)}</span>
      </div>`;
  }).join("");
  body.innerHTML = `<div class="lb-list">${rows}</div>`;
}

async function open(gameId) {
  ensureModal();
  const user = account.getUser();
  modalEl.querySelector("#lbSub").textContent = GAME_NAMES[gameId] || gameId;
  const body = modalEl.querySelector("#lbBody");
  if (!user) {
    body.innerHTML = `
      <div class="lb-guest">
        <p>登录后即可查看排行榜</p>
        <button class="btn primary block" id="lbLogin">登录 / 注册</button>
      </div>`;
    modalEl.classList.add("open");
    body.querySelector("#lbLogin").addEventListener("click", () => {
      close();
      account.open("login");
    });
    return;
  }
  body.innerHTML = '<p class="tip">加载中…</p>';
  modalEl.classList.add("open");
  try {
    const data = await api.leaderboard(gameId);
    renderList(data.entries || [], user.id);
  } catch (err) {
    body.innerHTML = `<p class="tip">加载失败：${escapeHtml(err.message || "请稍后重试")}</p>`;
  }
}

export const leaderboard = { open };
