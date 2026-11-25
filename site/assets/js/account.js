/**
 * 账号组件
 * - 顶部胶囊按钮（游客 / 已登录）
 * - 登录 / 注册弹窗
 * - 登录成功后派发 gt:auth-changed 事件，进度模块会自动同步
 */
import { api } from "./api.js";
import { icon, toast, escapeHtml } from "./ui.js";

let currentUser = null;
let onUserChange = null;
let modalEl = null;
let bodyEl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal-mask";
  modalEl.id = "gt-auth-modal";
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="账号">
      <div class="modal-head">
        <div>
          <div class="modal-title">账号与进度</div>
          <div class="modal-sub">手机号登录，关卡进度自动保存到云端</div>
        </div>
        <button class="modal-close" id="gt-auth-close" aria-label="关闭">${icon("close")}</button>
      </div>
      <div id="gt-auth-body"></div>
    </div>`;
  document.body.appendChild(modalEl);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeAuth();
  });
  modalEl.querySelector("#gt-auth-close").addEventListener("click", closeAuth);
  bodyEl = modalEl.querySelector("#gt-auth-body");
}

function openAuth(defaultTab = "login") {
  ensureModal();
  renderBody(defaultTab);
  requestAnimationFrame(() => modalEl.classList.add("open"));
}

function closeAuth() {
  if (modalEl) modalEl.classList.remove("open");
}

function maskPhone(phone) {
  if (!phone) return "";
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function renderBody(tab = "login") {
  if (!bodyEl) return;
  if (currentUser) {
    const initial = escapeHtml((currentUser.username || "玩")[0].toUpperCase());
    const phoneText = currentUser.phone
      ? `手机号 ${maskPhone(currentUser.phone)} · 进度云端存档`
      : "未绑定手机号 · 进度云端存档";
    bodyEl.innerHTML = `
      <div class="account-panel">
        <div class="avatar">${initial}</div>
        <div class="meta">
          <strong>${escapeHtml(currentUser.username)}</strong>
          <span>${phoneText}</span>
        </div>
      </div>
      ${currentUser.phone ? `
        <div class="field">
          <div class="form-tip">手机号已绑定，可直接用手机号登录。手机号只能绑定一个账号；如需更换请联系管理员。</div>
        </div>` : `
        <form id="gt-bind-form">
          <div class="field">
            <label for="gt-bind-phone">绑定手机号</label>
            <div class="input-row">
              <input class="input" id="gt-bind-phone" inputmode="numeric" maxlength="11"
                autocomplete="tel" placeholder="输入 11 位手机号">
              <button class="btn primary" type="submit" id="gt-bind-submit">绑定</button>
            </div>
          </div>
          <div class="form-error" id="gt-bind-error"></div>
        </form>
        <div class="form-tip">输入手机号即可绑定，不需要验证码。绑定后可用手机号登录，手机号全局唯一。</div>`}
      <div class="field" style="margin-top:14px">
        <div class="form-tip">游戏进度会自动同步。退出登录后仍可继续以游客身份游玩，进度保留在本机。</div>
      </div>
      <div class="account-edit">
        <button class="btn ghost block" id="gt-edit-username" type="button">修改用户名</button>
        <button class="btn ghost block" id="gt-edit-password" type="button">修改密码</button>
        <button class="btn ghost block" id="gt-forgot-password" type="button">忘记密码？</button>
      </div>
      <button class="btn block danger" id="gt-logout">退出登录</button>`;

    const bindForm = bodyEl.querySelector("#gt-bind-form");
    if (bindForm) {
      const bindErr = bodyEl.querySelector("#gt-bind-error");
      const bindBtn = bodyEl.querySelector("#gt-bind-submit");
      bindForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const phone = bodyEl.querySelector("#gt-bind-phone").value.trim();
        bindErr.textContent = "";
        if (!/^1[3-9]\d{9}$/.test(phone)) {
          bindErr.textContent = "请输入正确的 11 位手机号";
          return;
        }
        bindBtn.disabled = true;
        bindBtn.textContent = "绑定中…";
        try {
          const res = await api.bindPhone(phone);
          setUser(res.user);
          toast("手机号绑定成功，可直接用手机号登录", "ok");
          renderBody();
        } catch (err) {
          bindErr.textContent = err.message || "绑定失败";
          bindBtn.disabled = false;
          bindBtn.textContent = "绑定";
        }
      });
    }

    bodyEl.querySelector("#gt-logout").addEventListener("click", async () => {
      try {
        await api.logout();
      } catch (err) { /* 即使网络失败也清除本地登录态 */ }
      setUser(null);
      toast("已退出登录");
      closeAuth();
    });

    // 修改用户名
    bodyEl.querySelector("#gt-edit-username").addEventListener("click", () => {
      renderEditUsername();
    });
    // 修改密码
    bodyEl.querySelector("#gt-edit-password").addEventListener("click", () => {
      renderEditPassword();
    });
    // 忘记密码
    bodyEl.querySelector("#gt-forgot-password").addEventListener("click", () => {
      renderForgotPassword();
    });
    return;
  }

  const isLogin = tab === "login";
  bodyEl.innerHTML = `
    <div class="tabs">
      <button class="tab ${isLogin ? "active" : ""}" data-tab="login">登录</button>
      <button class="tab ${tab === "register" ? "active" : ""}" data-tab="register">注册</button>
    </div>
    <form id="gt-auth-form" autocomplete="on">
      ${isLogin ? `
        <div class="field">
          <label for="gt-phone">手机号</label>
          <input class="input" id="gt-phone" name="phone" inputmode="numeric" maxlength="11" autocomplete="tel"
            placeholder="输入 11 位手机号" required>
        </div>` : `
        <div class="field">
          <label for="gt-username">用户名</label>
          <input class="input" id="gt-username" name="username" maxlength="20" autocomplete="username"
            placeholder="2-20 位中文 / 字母 / 数字" required>
        </div>
        <div class="field">
          <label for="gt-phone">手机号</label>
          <input class="input" id="gt-phone" name="phone" inputmode="numeric" maxlength="11" autocomplete="tel"
            placeholder="输入 11 位手机号" required>
        </div>`}
      <div class="field">
        <label for="gt-password">密码</label>
        <input class="input" id="gt-password" name="password" type="password" maxlength="72"
          autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="至少 6 位" required>
      </div>
      ${isLogin ? "" : `
        <div class="field">
          <label for="gt-password2">确认密码</label>
          <input class="input" id="gt-password2" type="password" maxlength="72" autocomplete="new-password" placeholder="再输入一次">
        </div>`}
      <div class="form-error" id="gt-auth-error"></div>
      <button class="btn primary block" type="submit" id="gt-auth-submit">${isLogin ? "登录" : "创建账号"}</button>
    </form>
    <div class="form-tip">${isLogin
      ? "请使用注册时绑定的手机号登录。"
      : "手机号必填，注册后可用手机号直接登录；手机号只能绑定一个账号。"}</div>`;

  bodyEl.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => renderBody(btn.dataset.tab));
  });
  const form = bodyEl.querySelector("#gt-auth-form");
  const errEl = bodyEl.querySelector("#gt-auth-error");
  const submit = bodyEl.querySelector("#gt-auth-submit");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const activeTab = bodyEl.querySelector(".tab.active").dataset.tab;
    const phoneEl = bodyEl.querySelector("#gt-phone");
    const usernameEl = bodyEl.querySelector("#gt-username");
    const phone = phoneEl ? phoneEl.value.trim() : "";
    const username = usernameEl ? usernameEl.value.trim() : "";
    const password = bodyEl.querySelector("#gt-password").value;
    const password2El = bodyEl.querySelector("#gt-password2");
    errEl.textContent = "";
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      errEl.textContent = "请输入正确的 11 位手机号";
      return;
    }
    if (activeTab === "register") {
      if (password2El.value !== password) {
        errEl.textContent = "两次输入的密码不一致";
        return;
      }
      if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(username)) {
        errEl.textContent = "用户名需为 2-20 位中文、字母、数字、下划线或短横线";
        return;
      }
    }
    submit.disabled = true;
    submit.textContent = activeTab === "login" ? "登录中…" : "创建中…";
    try {
      const res = activeTab === "login"
        ? await api.login(phone, password)
        : await api.register(username, password, phone);
      setUser(res.user);
      toast(activeTab === "login" ? "登录成功，正在同步进度" : "账号创建成功，正在同步进度", "ok");
      closeAuth();
    } catch (err) {
      errEl.textContent = err.message || "操作失败";
      submit.disabled = false;
      submit.textContent = activeTab === "login" ? "登录" : "创建账号";
    }
  });
}

function setUser(user) {
  currentUser = user;
  if (onUserChange) onUserChange(user);
  renderChip();
  window.dispatchEvent(new CustomEvent("gt:auth-changed", { detail: { user } }));
}

function renderChip() {
  const host = document.querySelector("[data-account-chip]");
  if (!host) return;
  if (currentUser) {
    host.innerHTML = `
      <span class="avatar">${escapeHtml((currentUser.username || "玩")[0].toUpperCase())}</span>
      <span class="name">${escapeHtml(currentUser.username)}</span>`;
    host.classList.remove("guest");
    host.title = "账号与进度";
  } else {
    host.innerHTML = `<span class="avatar guest">${icon("user")}</span><span class="name">登录 / 注册</span>`;
    host.classList.add("guest");
    host.title = "登录后云端保存进度";
  }
}

/**
 * 初始化顶部账号按钮
 * @param {HTMLElement} host 用于渲染胶囊按钮的元素
 * @param {(user:object|null)=>void} userChange 用户变化回调
 */
export async function initAccount(host, userChange) {
  onUserChange = userChange || null;
  if (host) {
    host.dataset.accountChip = "1";
    host.className = "account-chip";
    host.setAttribute("role", "button");
    host.setAttribute("tabindex", "0");
    host.addEventListener("click", () => openAuth());
    host.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openAuth();
    });
  }
  try {
    const me = await api.me();
    currentUser = me.user;
  } catch (err) {
    currentUser = null;
  }
  renderChip();
  if (onUserChange) onUserChange(currentUser);
  return currentUser;
}

function renderEditUsername() {
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    <div class="modal-sub" style="margin-bottom:14px">修改用户名</div>
    <form id="gt-username-form">
      <div class="field">
        <label for="gt-new-username">新用户名</label>
        <input class="input" id="gt-new-username" maxlength="20" autocomplete="username"
          placeholder="2-20 位中文 / 字母 / 数字" required>
      </div>
      <div class="form-error" id="gt-username-error"></div>
      <button class="btn primary block" type="submit" id="gt-username-submit">确认修改</button>
    </form>
    <button class="btn ghost block" id="gt-back" style="margin-top:10px">返回</button>`;
  bodyEl.querySelector("#gt-back").addEventListener("click", () => renderBody());
  bodyEl.querySelector("#gt-username-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = bodyEl.querySelector("#gt-username-error");
    const submit = bodyEl.querySelector("#gt-username-submit");
    const username = bodyEl.querySelector("#gt-new-username").value.trim();
    errEl.textContent = "";
    if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(username)) {
      errEl.textContent = "用户名需为 2-20 位中文、字母、数字、下划线或短横线";
      return;
    }
    if (/^1[3-9]\d{9}$/.test(username)) {
      errEl.textContent = "用户名不能是手机号格式";
      return;
    }
    submit.disabled = true;
    submit.textContent = "提交中…";
    try {
      const res = await api.changeUsername(username);
      if (res.user) {
        currentUser = { ...currentUser, username: res.user.username };
        setUser(currentUser);
      }
      toast("用户名修改成功", "ok");
      renderBody();
    } catch (err) {
      errEl.textContent = err.message || "修改失败";
      submit.disabled = false;
      submit.textContent = "确认修改";
    }
  });
}

function renderEditPassword() {
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    <div class="modal-sub" style="margin-bottom:14px">修改密码</div>
    <form id="gt-password-form">
      <div class="field">
        <label for="gt-old-password">原密码</label>
        <input class="input" id="gt-old-password" type="password" maxlength="72"
          autocomplete="current-password" placeholder="输入当前密码" required>
      </div>
      <div class="field">
        <label for="gt-new-password">新密码</label>
        <input class="input" id="gt-new-password" type="password" maxlength="72"
          autocomplete="new-password" placeholder="至少 6 位" required>
      </div>
      <div class="field">
        <label for="gt-new-password2">确认新密码</label>
        <input class="input" id="gt-new-password2" type="password" maxlength="72"
          autocomplete="new-password" placeholder="再输入一次" required>
      </div>
      <div class="form-error" id="gt-password-error"></div>
      <button class="btn primary block" type="submit" id="gt-password-submit">确认修改</button>
    </form>
    <button class="btn ghost block" id="gt-back" style="margin-top:10px">返回</button>`;
  bodyEl.querySelector("#gt-back").addEventListener("click", () => renderBody());
  bodyEl.querySelector("#gt-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = bodyEl.querySelector("#gt-password-error");
    const submit = bodyEl.querySelector("#gt-password-submit");
    const oldPassword = bodyEl.querySelector("#gt-old-password").value;
    const newPassword = bodyEl.querySelector("#gt-new-password").value;
    const newPassword2 = bodyEl.querySelector("#gt-new-password2").value;
    errEl.textContent = "";
    if (newPassword.length < 6) {
      errEl.textContent = "新密码至少 6 位";
      return;
    }
    if (newPassword !== newPassword2) {
      errEl.textContent = "两次输入的新密码不一致";
      return;
    }
    submit.disabled = true;
    submit.textContent = "提交中…";
    try {
      await api.changePassword(oldPassword, newPassword);
      toast("密码修改成功", "ok");
      renderBody();
    } catch (err) {
      errEl.textContent = err.message || "修改失败";
      submit.disabled = false;
      submit.textContent = "确认修改";
    }
  });
}

function renderForgotPassword() {
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    <div class="modal-sub" style="margin-bottom:14px">忘记密码</div>
    <div class="forgot-box">
      <p>忘记密码无法自助找回，请联系管理员重置。</p>
      <p class="forgot-tip">提供你的用户名或绑定手机号，管理员会帮你重置为新密码。</p>
    </div>
    <button class="btn ghost block" id="gt-back">返回</button>`;
  bodyEl.querySelector("#gt-back").addEventListener("click", () => renderBody());
}

export const account = {
  open: openAuth,
  close: closeAuth,
  getUser: () => currentUser,
};
