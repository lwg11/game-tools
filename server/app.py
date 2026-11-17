#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
石器游戏厅 - 后端服务
=================================
仅依赖 Python 3.6+ 标准库，负责：
1. 静态站点托管（/games/ 前缀）
2. 账号注册 / 登录 / 登出（PBKDF2 密码哈希 + 服务端会话）
3. 每个账号、每款游戏的关卡进度云端存档

运行：
    python3 app.py
环境变量：
    GT_HOST  监听地址，默认 127.0.0.1（由 nginx 反向代理）
    GT_PORT  监听端口，默认 8930
    GT_ROOT  静态站点目录，默认 ../site
    GT_DB    SQLite 数据文件，默认 ./data/game-tools.db
"""

import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import socketserver
import sqlite3
import sys
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, unquote

APP_NAME = "石器游戏厅"
PREFIX = "/games"
GAME_IDS = {"stone-wars", "pvz", "carrot", "pokemon"}
SESSION_COOKIE = "gt_session"
SESSION_TTL = 30 * 24 * 3600          # 30 天
PBKDF2_ROUNDS = 150000
MAX_BODY = 128 * 1024                 # 请求体上限 128KB（进度数据足够）
USERNAME_RE = re.compile(r"^[\w\u4e00-\u9fa5-]{2,20}$", re.UNICODE)
PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.environ.get("GT_ROOT") or os.path.abspath(os.path.join(BASE_DIR, "..", "site"))
DB_PATH = os.environ.get("GT_DB") or os.path.join(BASE_DIR, "data", "game-tools.db")
HOST = os.environ.get("GT_HOST", "127.0.0.1")
PORT = int(os.environ.get("GT_PORT", "8930"))

# 登录失败限流：ip -> [时间戳]
_login_hits = {}
_login_lock = threading.Lock()


# ---------------------------------------------------------------- 数据库
def db_connect():
    """每个请求创建独立连接，避免多线程共享 sqlite 连接的问题。"""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = db_connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                phone TEXT,
                pass_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress (
                user_id INTEGER NOT NULL,
                game_id TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, game_id)
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            """
        )
        # 兼容旧数据库：补充 phone 字段并建立唯一索引（手机号可为空，但非空时必须唯一）
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "phone" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL"
        )
        conn.commit()
    finally:
        conn.close()


def hash_password(password, salt_hex):
    """PBKDF2-HMAC-SHA256，返回十六进制摘要。"""
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ROUNDS)
    return dk.hex()


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- HTTP 帮助
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = "StoneArcade/1.0"
    protocol_version = "HTTP/1.1"

    # ---------------- 基础响应
    def _send(self, status, body, content_type="application/json; charset=utf-8", headers=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status, obj, headers=None):
        self._send(status, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8", headers)

    # ---------------- 请求分发
    def do_GET(self):
        self._route("GET")

    def do_HEAD(self):
        self._route("HEAD")

    def do_POST(self):
        self._route("POST")

    def do_PUT(self):
        self._route("PUT")

    def _route(self, method):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        try:
            if path == PREFIX:
                self.send_response(301)
                self.send_header("Location", PREFIX + "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path.startswith(PREFIX + "/api/"):
                self._handle_api(method, path[len(PREFIX + "/api"):])
                return
            if path == PREFIX + "/healthz":
                self._json(200, {"ok": True, "time": int(time.time())})
                return
            if method in ("GET", "HEAD") and (path == PREFIX + "/" or path.startswith(PREFIX + "/")):
                self._serve_static(path, head=(method == "HEAD"))
                return
            self._json(404, {"error": "未找到该路径"})
        except ApiError as exc:
            self._json(exc.status, {"error": exc.message})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # 兜底，避免线程异常导致连接悬挂
            sys.stderr.write("unhandled error: %r\n" % (exc,))
            try:
                self._json(500, {"error": "服务器内部错误"})
            except Exception:
                pass

    # ---------------- 静态文件
    def _serve_static(self, path, head=False):
        rel = path[len(PREFIX) + 1:]
        if not rel or rel.endswith("/"):
            rel += "index.html"
        # 防目录穿越
        target = os.path.abspath(os.path.join(ROOT_DIR, rel))
        if not target.startswith(os.path.abspath(ROOT_DIR) + os.sep) and target != os.path.abspath(ROOT_DIR):
            raise ApiError(403, "禁止访问")
        if os.path.isdir(target):
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            # 单页应用回退：无扩展名的路径返回首页
            if "." not in os.path.basename(target):
                target = os.path.join(ROOT_DIR, "index.html")
            if not os.path.isfile(target):
                raise ApiError(404, "文件不存在")
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(target, "rb") as fh:
            data = fh.read()
        cache = "no-cache" if target.endswith(".html") else "public, max-age=300"
        headers = {"Cache-Control": cache}
        if target.endswith(".html"):
            headers["Content-Security-Policy"] = (
                "default-src 'self'; img-src 'self' data:; "
                "style-src 'self' 'unsafe-inline'; script-src 'self'; "
                "connect-src 'self'; font-src 'self'; media-src 'self' blob:"
            )
        self._send(200, b"" if head else data, ctype, headers)

    # ---------------- API
    def _handle_api(self, method, sub):
        if sub == "/register" and method == "POST":
            return self._api_register()
        if sub == "/login" and method == "POST":
            return self._api_login()
        if sub == "/logout" and method == "POST":
            return self._api_logout()
        if sub == "/bind-phone" and method == "POST":
            return self._api_bind_phone()
        if sub == "/me" and method == "GET":
            return self._api_me()
        if sub == "/progress" and method == "PUT":
            return self._api_save_progress()
        raise ApiError(404, "接口不存在")

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            raise ApiError(400, "请求长度无效")
        if length <= 0:
            raise ApiError(400, "请求体为空")
        if length > MAX_BODY:
            raise ApiError(413, "请求体过大")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "JSON 格式错误")
        if not isinstance(data, dict):
            raise ApiError(400, "请求格式错误")
        return data

    def _check_origin(self):
        """同源校验：只比较主机名，兼容反向代理时 Host 带/不带端口的情况。"""
        origin = self.headers.get("Origin")
        if not origin:
            return
        host = self.headers.get("Host", "")
        parsed = urlparse(origin)
        host_name = host.split(":")[0].strip().lower()
        if parsed.hostname and parsed.hostname.strip().lower() != host_name:
            raise ApiError(403, "来源不被允许")

    def _client_ip(self):
        """nginx 反向代理后 client_address 永远是 127.0.0.1，登录限流需读取真实 IP。"""
        real = self.headers.get("X-Real-IP")
        if real:
            return real.strip()[:64]
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
        return self.client_address[0]

    def _current_user(self):
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        try:
            cookie = SimpleCookie()
            cookie.load(cookie_header)
            morsel = cookie.get(SESSION_COOKIE)
        except Exception:
            return None
        if not morsel:
            return None
        conn = db_connect()
        try:
            row = conn.execute(
                "SELECT u.id, u.username, u.phone, s.expires_at FROM sessions s "
                "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
                (token_hash(morsel.value),),
            ).fetchone()
            if not row or row["expires_at"] < int(time.time()):
                return None
            return {"id": row["id"], "username": row["username"], "phone": row["phone"]}
        finally:
            conn.close()

    def _create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        conn = db_connect()
        try:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)",
                (token_hash(token), user_id, now + SESSION_TTL, now),
            )
            conn.commit()
        finally:
            conn.close()
        return token

    def _session_cookie(self, token):
        return "%s=%s; Path=%s; HttpOnly; SameSite=Lax; Max-Age=%d" % (
            SESSION_COOKIE, token, PREFIX, SESSION_TTL
        )

    # ---- 注册
    def _api_register(self):
        self._check_origin()
        data = self._read_json()
        username = str(data.get("username", "")).strip()
        phone = str(data.get("phone", "")).strip()
        password = str(data.get("password", ""))
        if not USERNAME_RE.match(username):
            raise ApiError(400, "用户名需为 2-20 位中文、字母、数字、下划线或短横线")
        if PHONE_RE.match(username):
            raise ApiError(400, "用户名不能是手机号格式")
        if phone and not PHONE_RE.match(phone):
            raise ApiError(400, "请输入正确的 11 位手机号")
        if len(password) < 6 or len(password) > 72:
            raise ApiError(400, "密码长度需为 6-72 位")
        salt = secrets.token_hex(16)
        pass_hash = hash_password(password, salt)
        conn = db_connect()
        try:
            try:
                cur = conn.execute(
                    "INSERT INTO users(username, phone, pass_hash, salt, created_at) VALUES (?,?,?,?,?)",
                    (username, phone or None, pass_hash, salt, int(time.time())),
                )
            except sqlite3.IntegrityError:
                conn.rollback()
                if phone and conn.execute("SELECT 1 FROM users WHERE phone = ?", (phone,)).fetchone():
                    raise ApiError(409, "该手机号已被绑定")
                raise ApiError(409, "该用户名已被注册")
            conn.commit()
            user_id = cur.lastrowid
        finally:
            conn.close()
        token = self._create_session(user_id)
        self._json(200, {"user": {"id": user_id, "username": username, "phone": phone or None}},
                   {"Set-Cookie": self._session_cookie(token)})

    # ---- 登录：支持用户名或手机号
    def _api_login(self):
        self._check_origin()
        data = self._read_json()
        identifier = str(data.get("identifier") or data.get("username") or "").strip()
        password = str(data.get("password", ""))
        if not identifier:
            raise ApiError(400, "请输入用户名或手机号")
        ip = self._client_ip()
        now = time.time()
        with _login_lock:
            hits = [t for t in _login_hits.get(ip, []) if now - t < 300]
            if len(hits) >= 12:
                raise ApiError(429, "尝试次数过多，请 5 分钟后再试")
            _login_hits[ip] = hits
        conn = db_connect()
        try:
            row = conn.execute(
                "SELECT id, username, phone, pass_hash, salt FROM users "
                "WHERE username = ? COLLATE NOCASE OR phone = ?",
                (identifier, identifier),
            ).fetchone()
        finally:
            conn.close()
        ok = False
        if row:
            calc = hash_password(password, row["salt"])
            ok = hmac.compare_digest(calc, row["pass_hash"])
        if not ok:
            with _login_lock:
                _login_hits.setdefault(ip, []).append(now)
            raise ApiError(401, "用户名 / 手机号或密码不正确")
        with _login_lock:
            _login_hits.pop(ip, None)
        token = self._create_session(row["id"])
        self._json(200, {"user": {"id": row["id"], "username": row["username"], "phone": row["phone"]}},
                   {"Set-Cookie": self._session_cookie(token)})

    # ---- 绑定手机号（不做验证码，手机号全局唯一）
    def _api_bind_phone(self):
        self._check_origin()
        user = self._current_user()
        if not user:
            raise ApiError(401, "请先登录")
        data = self._read_json()
        phone = str(data.get("phone", "")).strip()
        if not PHONE_RE.match(phone):
            raise ApiError(400, "请输入正确的 11 位手机号")
        conn = db_connect()
        try:
            row = conn.execute("SELECT phone FROM users WHERE id = ?", (user["id"],)).fetchone()
            if not row:
                raise ApiError(401, "账号不存在")
            if row["phone"]:
                if row["phone"] == phone:
                    return self._json(200, {"user": user, "phone": phone})
                raise ApiError(409, "当前账号已绑定其他手机号")
            try:
                conn.execute("UPDATE users SET phone = ? WHERE id = ?", (phone, user["id"]))
            except sqlite3.IntegrityError:
                conn.rollback()
                raise ApiError(409, "该手机号已被绑定")
            conn.commit()
            updated = {"id": user["id"], "username": user["username"], "phone": phone}
            self._json(200, {"user": updated})
        finally:
            conn.close()

    # ---- 登出
    def _api_logout(self):
        self._check_origin()
        cookie_header = self.headers.get("Cookie")
        if cookie_header:
            try:
                cookie = SimpleCookie()
                cookie.load(cookie_header)
                morsel = cookie.get(SESSION_COOKIE)
                if morsel:
                    conn = db_connect()
                    try:
                        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(morsel.value),))
                        conn.commit()
                    finally:
                        conn.close()
            except Exception:
                pass
        self._json(200, {"ok": True},
                   {"Set-Cookie": "%s=; Path=%s; HttpOnly; SameSite=Lax; Max-Age=0" % (SESSION_COOKIE, PREFIX)})

    # ---- 当前用户 + 全部进度
    def _api_me(self):
        user = self._current_user()
        if not user:
            self._json(200, {"user": None, "progress": {}})
            return
        conn = db_connect()
        try:
            rows = conn.execute("SELECT game_id, data, updated_at FROM progress WHERE user_id = ?", (user["id"],)).fetchall()
        finally:
            conn.close()
        progress = {}
        for row in rows:
            try:
                progress[row["game_id"]] = json.loads(row["data"])
            except ValueError:
                continue
        self._json(200, {"user": user, "progress": progress})

    # ---- 保存进度（整份覆盖）
    def _api_save_progress(self):
        self._check_origin()
        user = self._current_user()
        if not user:
            raise ApiError(401, "请先登录")
        data = self._read_json()
        game_id = str(data.get("gameId", ""))
        progress = data.get("data")
        if game_id not in GAME_IDS:
            raise ApiError(400, "未知游戏")
        if not isinstance(progress, dict):
            raise ApiError(400, "进度格式错误")
        encoded = json.dumps(progress, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 96 * 1024:
            raise ApiError(413, "进度数据过大")
        now = int(time.time())
        conn = db_connect()
        try:
            conn.execute(
                "INSERT INTO progress(user_id, game_id, data, updated_at) VALUES (?,?,?,?) "
                "ON CONFLICT(user_id, game_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (user["id"], game_id, encoded, now),
            )
            conn.commit()
        finally:
            conn.close()
        self._json(200, {"ok": True, "updatedAt": now})

    def log_message(self, fmt, *args):
        # 只记录错误与 API 写操作，避免静态日志刷屏
        if args and str(args[0]).startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class ThreadingServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    init_db()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    httpd = ThreadingServer((HOST, PORT), Handler)
    sys.stderr.write("%s 已启动: http://%s:%d%s/  静态目录=%s\n" % (APP_NAME, HOST, PORT, PREFIX, ROOT_DIR))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
