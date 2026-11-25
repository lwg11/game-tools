import { encryptPassword } from "./crypto.js";

const BASE = "/games/api";

async function request(path, options = {}) {
  const opt = {
    credentials: "same-origin",
    headers: {},
    ...options,
  };
  if (opt.body && typeof opt.body !== "string") {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(opt.body);
  }
  let resp;
  try {
    resp = await fetch(BASE + path, opt);
  } catch (err) {
    const e = new Error("网络连接失败，请稍后重试");
    e.status = 0;
    throw e;
  }
  let data = null;
  try {
    data = await resp.json();
  } catch (err) {
    data = null;
  }
  if (!resp.ok) {
    const e = new Error((data && data.error) || `请求失败（${resp.status}）`);
    e.status = resp.status;
    throw e;
  }
  return data;
}

export const api = {
  me: () => request("/me"),
  register: async (username, password, phone) =>
    request("/register", { method: "POST", body: { username, password: await encryptPassword(password), phone } }),
  login: async (phone, password) =>
    request("/login", { method: "POST", body: { phone, password: await encryptPassword(password) } }),
  logout: () => request("/logout", { method: "POST", body: {} }),
  bindPhone: (phone) => request("/bind-phone", { method: "POST", body: { phone } }),
  changePassword: async (oldPassword, newPassword) =>
    request("/change-password", {
      method: "POST",
      body: {
        oldPassword: await encryptPassword(oldPassword),
        newPassword: await encryptPassword(newPassword),
      },
    }),
  changeUsername: (username) =>
    request("/change-username", { method: "POST", body: { username } }),
  saveProgress: (gameId, data) => request("/progress", { method: "PUT", body: { gameId, data } }),
  savePrefs: (data) => request("/prefs", { method: "PUT", body: { data } }),
  track: (gameId) => request("/track", { method: "POST", body: { gameId } }),
  heartbeat: () => request("/heartbeat", { method: "POST", body: {} }),
  leaderboard: (gameId) => request("/leaderboard?game=" + encodeURIComponent(gameId)),
  config: () => request("/config"),
  adminStats: () => request("/admin/stats"),
  adminUsers: () => request("/admin/users"),
  adminSetAdmin: (userId, admin) =>
    request("/admin/users/admin", { method: "PUT", body: { userId, admin } }),
  adminResetPassword: async (userId, password) =>
    request("/admin/users/password", { method: "PUT", body: { userId, password: await encryptPassword(password) } }),
  adminIpRegion: (ip) => request("/admin/ip-region?ip=" + encodeURIComponent(ip)),
  adminConfig: () => request("/admin/config"),
  adminSaveConfig: (games) => request("/admin/config", { method: "PUT", body: { games } }),
};
