/**
 * 后台管理页
 * - 固定管理员：手机号 15755782911（由服务端执行）
 * - 账号列表：注册时间/IP/归属地、最近登录 IP/归属地、最近活跃、每款游戏场次与进度
 * - 可设置 / 取消其他账号的管理员
 * - 可配置游戏厅首页展示的游戏
 */
import { api } from "../assets/js/api.js";

const GAME_TITLES = {
  "stone-wars": "石器大战",
  pvz: "植物大战僵尸加强版",
  carrot: "保卫萝卜",
  pokemon: "精灵宝可梦",
  "vice-city": "罪恶都市",
  "need-for-speed": "霓虹海岸竞速",
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relTime(ts) {
  if (!ts) return "从未活跃";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} 天前`;
  return fmtDate(ts);
}

function progressText(game, progress) {
  if (!progress) return "无进度";
  if (game === "stone-wars" || game === "pvz" || game === "carrot") {
    return `解锁 ${progress.unlocked || 1} · ★${progress.stars || 0} · 通关 ${progress.cleared || 0}${progress.endlessBest ? ` · 无尽 ${progress.endlessBest}` : ""}`;
  }
  if (game === "pokemon") {
    return `图鉴 ${progress.caught || 0} · 委托 ${progress.questsDone || 0} · ¥${progress.money || 0}`;
  }
  if (game === "vice-city") {
    return `任务 ${progress.missionsDone || 0} · 武器 ${progress.weapons || 0} · ¥${progress.money || 0}`;
  }
  if (game === "need-for-speed") {
    return `场次 ${progress.racesDone || 0} · 胜场 ${progress.wins || 0}${progress.bestLap ? ` · 最佳 ${progress.bestLap}s` : ""}`;
  }
  return "有进度";
}

let currentAdmin = null;

function showPanel(id) {
  ["loginPanel", "forbidden", "appPanel"].forEach((pid) => {
    $(pid).classList.toggle("hidden", pid !== id);
  });
}

async function checkAuth() {
  let me = null;
  try {
    me = await api.me();
  } catch (err) {
    me = null;
  }
  if (!me || !me.user) {
    showPanel("loginPanel");
    return false;
  }
  if (!me.user.is_admin) {
    $("adminUser").textContent = me.user.username;
    showPanel("forbidden");
    return false;
  }
  currentAdmin = me.user;
  $("adminUser").textContent = `${me.user.username}（管理员）`;
  showPanel("appPanel");
  return true;
}

async function loadAll() {
  const [stats, users, config] = await Promise.all([
    api.adminStats(),
    api.adminUsers(),
    api.adminConfig(),
  ]);
  renderStats(stats);
  renderUsers(users.users || []);
  renderConfig(config);
  renderGameStats(stats);
}

function renderStats(stats) {
  $("statTotal").textContent = stats.totalUsers;
  $("statAdmin").textContent = stats.adminCount;
  $("statWeek").textContent = stats.registrationsWeek;
  $("statActiveWeek").textContent = stats.activeWeek;
  $("statPlays").textContent = stats.totalPlays;
  renderGameStats(stats);
}

function renderGameStats(stats) {
  const box = $("gameStats");
  if (!box) return;
  const rows = stats.gamePlays || [];
  box.innerHTML = rows.length
    ? rows.map((r) => `<span class="g-chip"><b>${esc(GAME_TITLES[r.game] || r.game)}</b> · <span class="plays">${r.plays}</span> 场</span>`).join("")
    : '<span class="tip">还没有游戏场次记录</span>';
}

function renderUsers(users) {
  const box = $("userRows");
  if (!users.length) {
    box.innerHTML = '<p class="tip">暂无账号</p>';
    return;
  }
  box.innerHTML = users.map((u) => {
    const games = (u.games || []).map((g) => {
      const updated = g.updatedAt ? ` · 同步 ${relTime(g.updatedAt)}` : "";
      return `<span class="g-chip"><b>${esc(GAME_TITLES[g.game] || g.game)}</b> · <span class="plays">${g.plays}</span> 场`
        + ` <span class="prog">${esc(progressText(g.game, g.progress))}${esc(updated)}</span></span>`;
    }).join("");
    const role = u.is_admin
      ? '<span class="badge">管理员</span>'
      : '<span class="badge muted">普通账号</span>';
    const toggle = u.is_admin
      ? '<button class="btn small ghost" data-action="demote" data-id="' + u.id + '">取消管理员</button>'
      : '<button class="btn small ghost" data-action="promote" data-id="' + u.id + '">设为管理员</button>';
    const fixed = u.phone === "15755782911" ? ' <span class="badge">固定</span>' : "";
    return `
      <div class="u-row" data-user="${u.id}">
        <div class="u-name"><span class="u-avatar">${esc(String(u.username || "?").trim().charAt(0).toUpperCase())}</span><div><b>${esc(u.username)}</b><small>${u.phone ? esc(u.phone) : "未绑定手机号"}${fixed}</small></div></div>
        <div class="u-role">${role}${toggle}</div>
        <div class="u-ip">
          <div>注册 ${esc(u.registerIp || "—")} <span class="region" data-ip="${esc(u.registerIp)}">（查询中）</span> · ${esc(fmtDate(u.createdAt))}</div>
          <div>登录 ${esc(u.lastLoginIp || "—")} <span class="region" data-ip="${esc(u.lastLoginIp)}">（查询中）</span></div>
        </div>
        <div class="u-active">${esc(relTime(u.lastActiveAt))}</div>
        <div class="u-games">${games || '<span class="prog">未游玩过</span>'}</div>
      </div>`;
  }).join("");

  // 归属地异步补全（去重查询）
  const seen = new Set();
  box.querySelectorAll(".region[data-ip]").forEach((el) => {
    const ip = el.dataset.ip;
    if (!ip || seen.has(ip)) {
      el.textContent = "";
      return;
    }
    seen.add(ip);
    el.textContent = "（查询中）";
    api.adminIpRegion(ip).then((r) => {
      el.textContent = `（${r.region || "未知"}）`;
    }).catch(() => {
      el.textContent = "（未知）";
    });
  });

  box.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const make = btn.dataset.action === "promote";
      btn.disabled = true;
      try {
        await api.adminSetAdmin(id, make);
        await loadAll();
      } catch (err) {
        alert(err.message || "操作失败");
        btn.disabled = false;
      }
    });
  });
}

function renderConfig(config) {
  const box = $("gameConfigList");
  const visible = new Set(config.order || []);
  box.innerHTML = (config.games || []).map((g) => `
    <label class="check-item">
      <input type="checkbox" value="${esc(g.id)}" ${visible.has(g.id) ? "checked" : ""}>
      <span>${esc(g.title)}</span>
    </label>`).join("");
  // 只通过「保存配置」按钮提交，避免每勾选一次就触发请求
}

async function saveConfig() {
  const ids = Array.from($("gameConfigList").querySelectorAll("input:checked")).map((cb) => cb.value);
  const msg = $("configMsg");
  if (!ids.length) {
    msg.textContent = "至少保留一款游戏";
    msg.classList.add("err");
    return;
  }
  try {
    await api.adminSaveConfig(ids);
    await loadAll();
    msg.classList.remove("err");
    msg.textContent = "已保存";
  } catch (err) {
    msg.classList.add("err");
    msg.textContent = err.message || "保存失败";
  }
}

// ---------- 事件绑定 ----------
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("loginError");
  errEl.textContent = "";
  const submit = $("loginSubmit");
  submit.disabled = true;
  submit.textContent = "登录中…";
  try {
    await api.login($("loginId").value.trim(), $("loginPw").value);
    await boot();
  } catch (err) {
    errEl.textContent = err.message || "登录失败";
  } finally {
    submit.disabled = false;
    submit.textContent = "登录";
  }
});

$("saveConfig").addEventListener("click", saveConfig);

// 无权限面板：「重新登录」清会话并回到登录表单
$("forbidLogin").addEventListener("click", async () => {
  try { await api.logout(); } catch (err) { /* 忽略 */ }
  $("loginError").textContent = "";
  $("loginId").value = "";
  $("loginPw").value = "";
  showPanel("loginPanel");
});

document.querySelectorAll(".atab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".atab").forEach((t) => t.classList.toggle("active", t === tab));
    ["accounts", "config", "games"].forEach((name) => {
      $("tab" + name[0].toUpperCase() + name.slice(1)).classList.toggle("hidden", name !== tab.dataset.tab);
    });
  });
});

$("adminLogout").addEventListener("click", async () => {
  try { await api.logout(); } catch (err) { /* 忽略 */ }
  location.href = "../";
});

async function boot() {
  if (!(await checkAuth())) return;
  try {
    await loadAll();
  } catch (err) {
    alert(err.message || "数据加载失败");
  }
}

boot();
