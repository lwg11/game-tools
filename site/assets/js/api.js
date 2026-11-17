/**
 * 后端 API 封装（同源，路径固定为 /games/api）
 */
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
  register: (username, password, phone) =>
    request("/register", { method: "POST", body: { username, password, phone: phone || undefined } }),
  login: (identifier, password) =>
    request("/login", { method: "POST", body: { identifier, password } }),
  logout: () => request("/logout", { method: "POST", body: {} }),
  bindPhone: (phone) => request("/bind-phone", { method: "POST", body: { phone } }),
  saveProgress: (gameId, data) => request("/progress", { method: "PUT", body: { gameId, data } }),
};
