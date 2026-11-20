#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
石器游戏厅 - 后端服务
=================================
仅依赖 Python 3.6+ 标准库，负责：
1. 静态站点托管（/games/ 前缀）
2. 账号注册 / 登录 / 登出（PBKDF2 密码哈希 + 服务端会话）
3. 每个账号、每款游戏的关卡进度云端存档
4. 游玩场次/活跃追踪 + 后台管理（固定管理员 15755782911）

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
import urllib.request

APP_NAME = "石器游戏厅"
PREFIX = "/games"
GAME_IDS = {"stone-wars", "pvz", "carrot", "pokemon", "vice-city", "need-for-speed"}
SESSION_COOKIE = "gt_session"
SESSION_TTL = 30 * 24 * 3600          # 30 天
PBKDF2_ROUNDS = 150000
MAX_BODY = 128 * 1024                 # 请求体上限 128KB（进度数据足够）
USERNAME_RE = re.compile(r"^[\w\u4e00-\u9fa5-]{2,20}$", re.UNICODE)
PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

# 固定管理员：此手机号绑定的账号永远拥有管理权限，且不可被解除
FIXED_ADMIN_PHONE = "15755782911"

# 首页可配置展示的游戏（顺序即默认顺序）
HOME_GAMES = [
    {"id": "stone-wars", "title": "石器大战"},
    {"id": "pvz", "title": "植物大战僵尸加强版"},
    {"id": "carrot", "title": "保卫萝卜"},
    {"id": "pokemon", "title": "精灵宝可梦"},
    {"id": "vice-city", "title": "罪恶都市"},
    {"id": "need-for-speed", "title": "霓虹海岸竞速"},
]

# IP 归属地缓存（免费接口，超时/失败一律「未知」，不影响主流程）
_ip_region_cache = {}
_ip_region_lock = threading.Lock()


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
            CREATE TABLE IF NOT EXISTS prefs (
                user_id INTEGER PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            """
        )
        # 兼容旧数据库：逐步补齐新字段/新表（脚本可重复执行）
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "phone" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        if "is_admin" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        if "register_ip" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN register_ip TEXT")
        if "last_login_ip" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN last_login_ip TEXT")
        if "last_active_at" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL"
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_plays (
                user_id INTEGER NOT NULL,
                game_id TEXT NOT NULL,
                plays INTEGER NOT NULL DEFAULT 0,
                last_play INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, game_id)
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT 0
            )"""
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


def ip_region(ip):
    """根据 IP 显示归属地：局域网直接标注，公网走免费接口（带缓存，失败返回「未知」）。"""
    if not ip:
        return "未知"
    ip = ip.strip()
    if ip in ("127.0.0.1", "::1", "::", "0.0.0.0") or ip.startswith("127."):
        return "本地网络"
    if ":" in ip:
        return "未知（IPv6）"
    parts = ip.split(".")
    if len(parts) != 4:
        return "未知"
    try:
        nums = tuple(int(p) for p in parts)
    except ValueError:
        return "未知"
    if not all(0 <= n <= 255 for n in nums):
        return "未知"
    if nums[0] == 10 or (nums[0] == 172 and 16 <= nums[1] <= 31) or (nums[0] == 192 and nums[1] == 168) or (nums[0] == 169 and nums[1] == 254):
        return "本地网络"
    with _ip_region_lock:
        hit = _ip_region_cache.get(ip)
    if hit is not None:
        return hit
    region = "未知"
    try:
        from urllib.parse import quote
        url = "http://whois.pconline.com.cn/ipJson.jsp?ip=%s&json=true" % quote(ip)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0)"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            text = resp.read().decode("gbk", "ignore")
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(text[start:end + 1])
            region = str(data.get("region") or data.get("regiondesc") or "未知").strip() or "未知"
    except Exception:
        region = "未知"
    with _ip_region_lock:
        if len(_ip_region_cache) >= 2048:
            _ip_region_cache.clear()
        _ip_region_cache[ip] = region
    return region


def summarize_progress(game_id, data):
    """把进度 JSON 压成后台展示用的小摘要。"""
    if not isinstance(data, dict):
        return {}
    if game_id in ("stone-wars", "pvz", "carrot"):
        return {
            "unlocked": data.get("unlocked", 1),
            "stars": len(data.get("stars") or {}),
            "cleared": len(data.get("cleared") or {}),
            "endlessBest": data.get("endlessBest", 0),
        }
    if game_id == "pokemon":
        return {
            "caught": len(data.get("caught") or {}),
            "questsDone": data.get("questsDone", 0),
            "money": data.get("money", 0),
        }
    if game_id == "vice-city":
        return {
            "missionsDone": data.get("missionsDone", 0),
            "money": data.get("money", 0),
            "weapons": len(data.get("weapons") or []),
        }
    if game_id == "need-for-speed":
        return {
            "racesDone": data.get("racesDone", 0),
            "wins": data.get("wins", 0),
            "bestLap": data.get("bestLap", 0),
        }
    return {}


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
        extra = dict(headers or {})
        extra.setdefault("Cache-Control", "no-store")  # API 不缓存；静态文件自带缓存策略
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except ConnectionError:
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
        except ConnectionError:
            # 客户端提前断开（含 BrokenPipe / ConnectionReset / ConnectionAborted）
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
        cache = "no-cache" if target.endswith(".html") else "public, max-age=300"
        headers = {"Cache-Control": cache}
        data = None
        # 大体积静态资源：存在同名 .gz 且客户端支持时下发 gzip
        zpath = target + ".gz"
        if "gzip" in (self.headers.get("Accept-Encoding") or "") and os.path.isfile(zpath):
            with open(zpath, "rb") as fh:
                data = fh.read()
            headers["Content-Encoding"] = "gzip"
            headers["Vary"] = "Accept-Encoding"
            headers["Cache-Control"] = "public, max-age=31536000"
        if target.endswith(".html"):
            headers["Content-Security-Policy"] = (
                "default-src 'self'; img-src 'self' data:; "
                "style-src 'self' 'unsafe-inline'; script-src 'self'; "
                "connect-src 'self'; font-src 'self'; media-src 'self' blob:"
            )
        if data is None:
            with open(target, "rb") as fh:
                data = fh.read()
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
        if sub == "/prefs" and method == "PUT":
            return self._api_save_prefs()
        if sub == "/track" and method == "POST":
            return self._api_track()
        if sub == "/config" and method == "GET":
            return self._api_config()
        if sub == "/admin/stats" and method == "GET":
            return self._api_admin_stats()
        if sub == "/admin/users" and method == "GET":
            return self._api_admin_users()
        if sub == "/admin/users/admin" and method == "PUT":
            return self._api_admin_toggle()
        if sub == "/admin/ip-region" and method == "GET":
            return self._api_admin_ip_region()
        if sub == "/admin/config" and method == "GET":
            return self._api_admin_config()
        if sub == "/admin/config" and method == "PUT":
            return self._api_admin_save_config()
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

    def _discard_body(self):
        """请求体未使用时也要读掉，避免 keep-alive 连接里残留内容污染下一个请求。"""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if 0 < length <= MAX_BODY:
            try:
                self.rfile.read(length)
            except Exception:
                pass

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
                "SELECT u.id, u.username, u.phone, u.is_admin, s.expires_at FROM sessions s "
                "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
                (token_hash(morsel.value),),
            ).fetchone()
        finally:
            conn.close()
        if not row or row["expires_at"] < int(time.time()):
            return None
        user = {
            "id": row["id"],
            "username": row["username"],
            "phone": row["phone"],
            # 固定管理员：绑定指定手机号的账号永远拥有管理权
            "is_admin": bool(row["is_admin"]) or row["phone"] == FIXED_ADMIN_PHONE,
        }
        return user

    def _require_admin(self):
        user = self._current_user()
        if not user:
            raise ApiError(401, "请先登录")
        if not user.get("is_admin"):
            raise ApiError(403, "需要管理员权限")
        return user

    def _touch_active(self, user_id):
        conn = db_connect()
        try:
            conn.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (int(time.time()), user_id))
            conn.commit()
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
        register_ip = self._client_ip()
        conn = db_connect()
        try:
            try:
                cur = conn.execute(
                    "INSERT INTO users(username, phone, pass_hash, salt, created_at, register_ip) VALUES (?,?,?,?,?,?)",
                    (username, phone or None, pass_hash, salt, int(time.time()), register_ip),
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
        conn = db_connect()
        try:
            conn.execute("UPDATE users SET last_login_ip = ?, last_active_at = ? WHERE id = ?",
                        (ip, int(time.time()), row["id"]))
            conn.commit()
        finally:
            conn.close()
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
        self._discard_body()
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

    # ---- 当前用户 + 全部进度 + 偏好设置
    def _api_me(self):
        user = self._current_user()
        if not user:
            self._json(200, {"user": None, "progress": {}, "prefs": {}})
            return
        conn = db_connect()
        try:
            rows = conn.execute("SELECT game_id, data, updated_at FROM progress WHERE user_id = ?", (user["id"],)).fetchall()
            pref_row = conn.execute("SELECT data FROM prefs WHERE user_id = ?", (user["id"],)).fetchone()
        finally:
            conn.close()
        self._touch_active(user["id"])
        progress = {}
        for row in rows:
            try:
                progress[row["game_id"]] = json.loads(row["data"])
            except ValueError:
                continue
        prefs = {}
        if pref_row:
            try:
                prefs = json.loads(pref_row["data"])
            except ValueError:
                prefs = {}
            if not isinstance(prefs, dict):
                prefs = {}
        self._json(200, {"user": user, "progress": progress, "prefs": prefs})

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

    # ---- 保存偏好设置（与已有内容合并）
    def _api_save_prefs(self):
        self._check_origin()
        user = self._current_user()
        if not user:
            raise ApiError(401, "请先登录")
        data = self._read_json()
        prefs = data.get("data")
        if not isinstance(prefs, dict):
            raise ApiError(400, "偏好设置格式错误")
        conn = db_connect()
        try:
            row = conn.execute("SELECT data FROM prefs WHERE user_id = ?", (user["id"],)).fetchone()
            merged = {}
            if row:
                try:
                    merged = json.loads(row["data"])
                except ValueError:
                    merged = {}
                if not isinstance(merged, dict):
                    merged = {}
            merged.update(prefs)
            encoded = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
            if len(encoded.encode("utf-8")) > 16 * 1024:
                raise ApiError(413, "偏好设置过大")
            now = int(time.time())
            conn.execute(
                "INSERT INTO prefs(user_id, data, updated_at) VALUES (?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (user["id"], encoded, now),
            )
            conn.commit()
        finally:
            conn.close()
        self._json(200, {"ok": True, "prefs": merged, "updatedAt": now})

    # ---- 游玩追踪：进入一次游戏记一场（未登录忽略）
    def _api_track(self):
        self._check_origin()
        user = self._current_user()
        if not user:
            return self._json(200, {"ok": True, "guest": True})
        data = self._read_json()
        game_id = str(data.get("gameId", ""))
        if game_id not in GAME_IDS:
            raise ApiError(400, "未知游戏")
        now = int(time.time())
        conn = db_connect()
        try:
            conn.execute(
                "INSERT INTO user_plays(user_id, game_id, plays, last_play) VALUES (?,?,1,?) "
                "ON CONFLICT(user_id, game_id) DO UPDATE SET plays=plays+1, last_play=excluded.last_play",
                (user["id"], game_id, now),
            )
            conn.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (now, user["id"]))
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {"ok": True})

    # ---- 首页展示配置
    def _home_games(self):
        known = [g["id"] for g in HOME_GAMES]
        conn = db_connect()
        try:
            row = conn.execute("SELECT value FROM config WHERE key = 'home_games'").fetchone()
        finally:
            conn.close()
        if row:
            try:
                ids = json.loads(row["value"])
            except ValueError:
                ids = None
            if isinstance(ids, list) and ids:
                filtered = [g for g in ids if g in known]
                if filtered:
                    return filtered
        return list(known)

    def _api_config(self):
        return self._json(200, {"games": self._home_games()})

    # ---- 后台：统计总览
    def _api_admin_stats(self):
        self._require_admin()
        conn = db_connect()
        try:
            total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            admin_count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE is_admin = 1 OR phone = ?", (FIXED_ADMIN_PHONE,)
            ).fetchone()[0]
            week = int(time.time()) - 7 * 24 * 3600
            reg_week = conn.execute("SELECT COUNT(*) FROM users WHERE created_at >= ?", (week,)).fetchone()[0]
            active_week = conn.execute("SELECT COUNT(*) FROM users WHERE last_active_at >= ?", (week,)).fetchone()[0]
            plays = conn.execute("SELECT COALESCE(SUM(plays),0) FROM user_plays").fetchone()[0]
            game_rows = conn.execute(
                "SELECT game_id, SUM(plays) FROM user_plays GROUP BY game_id ORDER BY 2 DESC"
            ).fetchall()
        finally:
            conn.close()
        return self._json(200, {
            "totalUsers": total,
            "adminCount": admin_count,
            "registrationsWeek": reg_week,
            "activeWeek": active_week,
            "totalPlays": plays,
            "gamePlays": [{"game": r[0], "plays": r[1]} for r in game_rows],
            "fixedAdminPhone": FIXED_ADMIN_PHONE,
        })

    # ---- 后台：账号列表（含 IP / 活跃 / 每款游戏场次与进度）
    def _api_admin_users(self):
        self._require_admin()
        conn = db_connect()
        try:
            rows = conn.execute(
                "SELECT id, username, phone, is_admin, created_at, register_ip, last_login_ip, last_active_at "
                "FROM users ORDER BY created_at DESC"
            ).fetchall()
            play_rows = conn.execute("SELECT user_id, game_id, plays, last_play FROM user_plays").fetchall()
            prog_rows = conn.execute("SELECT user_id, game_id, data, updated_at FROM progress").fetchall()
        finally:
            conn.close()
        plays_map = {}
        for r in play_rows:
            plays_map.setdefault(r["user_id"], {})[r["game_id"]] = {"plays": r["plays"], "lastPlay": r["last_play"]}
        prog_map = {}
        for r in prog_rows:
            try:
                data = json.loads(r["data"])
            except ValueError:
                continue
            prog_map.setdefault(r["user_id"], {})[r["game_id"]] = {
                "updatedAt": r["updated_at"], "progress": summarize_progress(r["game_id"], data)
            }
        out = []
        for u in rows:
            games = []
            gm = plays_map.get(u["id"], {})
            pm = prog_map.get(u["id"], {})
            for gid in sorted(set(gm) | set(pm)):
                entry = {"game": gid, "plays": (gm.get(gid) or {}).get("plays", 0)}
                last = (gm.get(gid) or {}).get("lastPlay", 0)
                if last:
                    entry["lastPlay"] = last
                if gid in pm:
                    entry["updatedAt"] = pm[gid]["updatedAt"]
                    entry["progress"] = pm[gid]["progress"]
                games.append(entry)
            out.append({
                "id": u["id"],
                "username": u["username"],
                "phone": u["phone"],
                "is_admin": bool(u["is_admin"]) or u["phone"] == FIXED_ADMIN_PHONE,
                "createdAt": u["created_at"],
                "registerIp": u["register_ip"] or "",
                "lastLoginIp": u["last_login_ip"] or "",
                "lastActiveAt": u["last_active_at"] or 0,
                "games": games,
            })
        return self._json(200, {"users": out})

    # ---- 后台：IP 归属地（按需查询，避免列表页被外网接口拖慢）
    def _api_admin_ip_region(self):
        self._require_admin()
        ip = ""
        for part in urlparse(self.path).query.split("&"):
            k, _, v = part.partition("=")
            if unquote(k) == "ip":
                ip = unquote(v)
                break
        ip = ip.strip()[:64]
        return self._json(200, {"ip": ip, "region": ip_region(ip)})

    # ---- 后台：设置 / 取消管理员
    def _api_admin_toggle(self):
        self._check_origin()
        admin = self._require_admin()
        data = self._read_json()
        user_id = int(data.get("userId") or 0)
        make = bool(data.get("admin"))
        conn = db_connect()
        try:
            row = conn.execute("SELECT id, username, phone FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise ApiError(404, "账号不存在")
            if not make:
                if row["phone"] == FIXED_ADMIN_PHONE:
                    raise ApiError(403, "固定管理员 %s 不能取消管理权限" % FIXED_ADMIN_PHONE)
                if row["id"] == admin["id"]:
                    raise ApiError(403, "不能取消自己的管理权限")
            conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if make else 0, user_id))
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {"ok": True, "userId": user_id, "admin": make})

    # ---- 后台：首页游戏配置
    def _api_admin_config(self):
        self._require_admin()
        visible = self._home_games()
        return self._json(200, {
            "games": [
                {"id": g["id"], "title": g["title"], "visible": g["id"] in visible}
                for g in HOME_GAMES
            ],
            "order": visible,
            "fixedAdminPhone": FIXED_ADMIN_PHONE,
        })

    def _api_admin_save_config(self):
        self._check_origin()
        self._require_admin()
        data = self._read_json()
        ids = data.get("games")
        if not isinstance(ids, list):
            raise ApiError(400, "games 必须是数组")
        known = {g["id"] for g in HOME_GAMES}
        cleaned = [g for g in ids if g in known]
        if not cleaned:
            raise ApiError(400, "至少保留一款游戏")
        now = int(time.time())
        conn = db_connect()
        try:
            conn.execute(
                "INSERT INTO config(key, value, updated_at) VALUES ('home_games',?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (json.dumps(cleaned, ensure_ascii=False), now),
            )
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {"ok": True, "games": cleaned})

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
