# -*- coding: utf-8 -*-
"""石器游戏厅服务端 API 单元测试（零第三方依赖，仅 Python 标准库）。

运行（在仓库根目录）：
    python -m unittest discover -s tests -v

说明：
- 使用临时 SQLite 文件，不会触碰 server/data/game-tools.db；
- 以随机端口启动 ThreadingServer，测试结束自动关闭；
- 覆盖：注册/登录/登出/绑定手机号、进度与偏好存取、会话失效、
  登录限流、同源校验、请求体上限、静态路由与目录穿越防护。
"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import uuid

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_TMP = tempfile.mkdtemp(prefix="gt-test-")

# 必须在 import app 之前设置：app.py 在模块级读取这些环境变量
os.environ.setdefault("GT_DB", os.path.join(_TMP, "test.db"))
os.environ.setdefault("GT_ROOT", os.path.join(_ROOT, "site"))
os.environ.setdefault("GT_HOST", "127.0.0.1")
os.environ.setdefault("GT_PORT", "1")  # 占位，测试使用随机端口
sys.path.insert(0, os.path.join(_ROOT, "server"))

import app  # noqa: E402

_SERVER = None


def _get_server():
    global _SERVER
    if _SERVER is None:
        _SERVER = app.ThreadingServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=_SERVER.serve_forever, daemon=True).start()
    return _SERVER


def tearDownModule():
    if _SERVER is not None:
        _SERVER.shutdown()
        _SERVER.server_close()
    shutil.rmtree(_TMP, ignore_errors=True)


class ServerBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.init_db()
        cls.server = _get_server()
        cls.port = cls.server.server_address[1]

    def setUp(self):
        app._login_hits.clear()
        self.cookie = None
        self.tag = uuid.uuid4().hex[:8]

    # ---------- HTTP 便捷封装（http.client 不规范化路径，可用于穿越测试）
    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        payload = None
        hdrs = {}
        if body is not None:
            payload = body if isinstance(body, (str, bytes)) else json.dumps(body)
            hdrs["Content-Type"] = "application/json"
        if self.cookie:
            hdrs["Cookie"] = self.cookie
        if headers:
            hdrs.update(headers)
        conn.request(method, path, payload, hdrs)
        resp = conn.getresponse()
        data = resp.read()
        set_cookie = resp.getheader("Set-Cookie")
        status = resp.status
        ctype = resp.getheader("Content-Type") or ""
        conn.close()
        return status, data, set_cookie, ctype

    def jrequest(self, method, path, body=None, headers=None):
        status, data, set_cookie, _ = self.request(method, path, body, headers)
        try:
            obj = json.loads(data.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            obj = None
        return status, obj, set_cookie

    def keep_cookie(self, set_cookie):
        self.cookie = set_cookie.split(";")[0]
        return self.cookie

    def register(self, username=None, password="pass123456", phone=None):
        body = {"username": username or ("玩家%s" % self.tag), "password": password}
        if phone is None:
            phone = self.phone("139")
        body["phone"] = phone
        return self.jrequest("POST", "/games/api/register", body)

    def phone(self, prefix):
        return "%s%08d" % (prefix, int(self.tag, 16) % 10 ** 8)


class PureFunctionTest(unittest.TestCase):
    """不依赖 HTTP 的纯函数测试"""

    def test_hash_password_deterministic(self):
        self.assertEqual(app.hash_password("abc123", "00ff"), app.hash_password("abc123", "00ff"))
        self.assertNotEqual(app.hash_password("abc123", "00ff"), app.hash_password("abc124", "00ff"))
        self.assertNotEqual(app.hash_password("abc123", "00ff"), app.hash_password("abc123", "0100"))

    def test_token_hash_stable(self):
        self.assertEqual(app.token_hash("x"), app.token_hash("x"))
        self.assertNotEqual(app.token_hash("x"), app.token_hash("y"))

    def test_init_db_idempotent(self):
        app.init_db()
        app.init_db()

    def test_username_and_phone_rules(self):
        self.assertTrue(app.USERNAME_RE.match("玩家一号"))
        self.assertTrue(app.USERNAME_RE.match("ab_12"))
        self.assertTrue(app.USERNAME_RE.match("user-name"))
        self.assertFalse(app.USERNAME_RE.match("a"))
        self.assertFalse(app.USERNAME_RE.match("x" * 21))
        self.assertTrue(app.PHONE_RE.match("13800138000"))
        self.assertFalse(app.PHONE_RE.match("12800138000"))
        self.assertFalse(app.PHONE_RE.match("1380013800"))

    def test_rsa_key_generation_and_decrypt(self):
        """RSA 密钥生成 + OAEP 加解密 roundtrip"""
        import crypto as gt_crypto
        key = gt_crypto.RSAKey.generate(2048)
        jwk = key.public_jwk()
        self.assertEqual(jwk["kty"], "RSA")
        self.assertEqual(jwk["alg"], "RSA-OAEP-256")
        self.assertIn("n", jwk)
        self.assertIn("e", jwk)
        # 模拟前端加密：用 OAEP 编码 + RSA 加密
        import os as _os
        message = b"my-secret-password-123"
        seed = _os.urandom(32)
        em = gt_crypto._oaep_encode(message, seed)
        c = pow(int.from_bytes(em, "big"), key.e, key.n)
        ct = c.to_bytes((key.n.bit_length() + 7) // 8, "big")
        # 后端解密
        decrypted = key.decrypt(ct)
        self.assertEqual(decrypted, message)

    def test_rsa_decrypt_rejects_tampered(self):
        """篡改密文应解密失败"""
        import crypto as gt_crypto
        key = gt_crypto.RSAKey.generate(2048)
        message = b"password-abc"
        import os as _os
        seed = _os.urandom(32)
        em = gt_crypto._oaep_encode(message, seed)
        c = pow(int.from_bytes(em, "big"), key.e, key.n)
        ct = bytearray(c.to_bytes((key.n.bit_length() + 7) // 8, "big"))
        ct[100] ^= 0xFF  # 篡改
        with self.assertRaises(ValueError):
            key.decrypt(bytes(ct))


class StaticRouteTest(ServerBase):
    def test_home_html(self):
        status, data, _, ctype = self.request("GET", "/games/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)
        self.assertIn("石器游戏厅".encode("utf-8"), data)

    def test_asset_js(self):
        status, data, _, ctype = self.request("GET", "/games/assets/js/api.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", ctype)

    def test_prefix_redirect(self):
        status, _, _, _ = self.request("GET", "/games")
        self.assertEqual(status, 301)

    def test_spa_fallback(self):
        status, data, _, ctype = self.request("GET", "/games/whatever-page")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)

    def test_dir_traversal_blocked(self):
        status, obj, _ = self.jrequest("GET", "/games/%2e%2e/%2e%2e/server/app.py")
        self.assertIn(status, (403, 404))

    def test_healthz(self):
        status, obj, _ = self.jrequest("GET", "/games/healthz")
        self.assertEqual(status, 200)
        self.assertTrue(obj["ok"])

    def test_admin_page_served(self):
        status, data, _, ctype = self.request("GET", "/games/admin/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)
        self.assertIn("后台管理".encode("utf-8"), data)
        status, data, _, ctype = self.request("GET", "/games/admin/admin.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", ctype)

    def test_cache_control(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        # API 一律 no-store
        conn.request("GET", "/games/api/config")
        r = conn.getresponse()
        r.read()
        self.assertIn("no-store", r.getheader("Cache-Control") or "")
        # 静态资源仍允许缓存
        conn.request("GET", "/games/assets/js/api.js")
        r = conn.getresponse()
        r.read()
        self.assertIn("max-age=300", r.getheader("Cache-Control") or "")
        conn.close()

    def test_unknown_api(self):
        status, obj, _ = self.jrequest("GET", "/games/api/nope")
        self.assertEqual(status, 404)


class AuthFlowTest(ServerBase):
    def test_register_login_logout_roundtrip(self):
        username = "玩家%s" % self.tag
        phone = self.phone("139")
        status, obj, set_cookie = self.register(username, phone=phone)
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["username"], username)
        # 注册返回脱敏手机号
        self.assertEqual(obj["user"]["phone"], app.mask_phone(phone))
        self.assertIn("gt_session=", set_cookie)
        self.assertIn("HttpOnly", set_cookie)

        self.keep_cookie(set_cookie)
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["username"], username)

        # 保存进度后可读取
        status, obj, _ = self.jrequest("PUT", "/games/api/progress",
                                       {"gameId": "pvz", "data": {"unlocked": 4}})
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(obj["progress"]["pvz"], {"unlocked": 4})

        # 登出
        status, obj, set_cookie = self.jrequest("POST", "/games/api/logout", {})
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", set_cookie)

        # 登出后旧会话立即失效
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(status, 200)
        self.assertIsNone(obj["user"])

    def test_login_with_phone_only(self):
        username = "用户%s" % self.tag
        phone = self.phone("139")
        status, obj, set_cookie = self.register(username, "pass123456", phone)
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["phone"], app.mask_phone(phone))

        # 手机号登录成功
        status, obj, set_cookie = self.jrequest("POST", "/games/api/login",
                                                {"phone": phone, "password": "pass123456"})
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["username"], username)
        self.assertEqual(obj["user"]["phone"], app.mask_phone(phone))

        # 用户名登录被拒绝
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": username, "password": "pass123456"})
        self.assertEqual(status, 400)

        # 密码错误
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone, "password": "wrong123"})
        self.assertEqual(status, 401)

    def test_login_with_encrypted_password(self):
        """模拟前端 RSA-OAEP 加密密码后登录"""
        import base64
        import crypto as gt_crypto
        username = "加密%s" % self.tag
        phone = self.phone("139")
        password = "enc-pass-123"
        # 注册（明文模式，兼容）
        status, obj, set_cookie = self.register(username, password, phone)
        self.assertEqual(status, 200)
        # 获取公钥
        status, jwk, _ = self.jrequest("GET", "/games/api/crypto-key")
        self.assertEqual(status, 200)
        self.assertEqual(jwk["kty"], "RSA")
        # 用公钥加密密码（模拟前端 Web Crypto）
        key = gt_crypto.get_key()
        message = password.encode("utf-8")
        import os as _os
        seed = _os.urandom(32)
        em = gt_crypto._oaep_encode(message, seed)
        c = pow(int.from_bytes(em, "big"), key.e, key.n)
        ct = c.to_bytes((key.n.bit_length() + 7) // 8, "big")
        encrypted_pw = base64.b64encode(ct).decode("ascii")
        # 加密模式登录
        status, obj, set_cookie = self.jrequest("POST", "/games/api/login",
                                                {"phone": phone, "password": encrypted_pw})
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["username"], username)
        # 加密模式注册
        phone2 = self.phone("138")
        username2 = "加密注册%s" % self.tag
        password2 = "reg-enc-456"
        em2 = gt_crypto._oaep_encode(password2.encode("utf-8"), _os.urandom(32))
        c2 = pow(int.from_bytes(em2, "big"), key.e, key.n)
        ct2 = c2.to_bytes((key.n.bit_length() + 7) // 8, "big")
        enc_pw2 = base64.b64encode(ct2).decode("ascii")
        status, obj, set_cookie = self.jrequest("POST", "/games/api/register",
                                                {"username": username2, "password": enc_pw2, "phone": phone2})
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["username"], username2)
        # 加密模式修改密码
        self.keep_cookie(set_cookie)
        new_pw = "new-enc-789"
        em_old = gt_crypto._oaep_encode(password2.encode("utf-8"), _os.urandom(32))
        c_old = pow(int.from_bytes(em_old, "big"), key.e, key.n)
        ct_old = c_old.to_bytes((key.n.bit_length() + 7) // 8, "big")
        em_new = gt_crypto._oaep_encode(new_pw.encode("utf-8"), _os.urandom(32))
        c_new = pow(int.from_bytes(em_new, "big"), key.e, key.n)
        ct_new = c_new.to_bytes((key.n.bit_length() + 7) // 8, "big")
        status, obj, _ = self.jrequest("POST", "/games/api/change-password",
                                       {"oldPassword": base64.b64encode(ct_old).decode("ascii"),
                                        "newPassword": base64.b64encode(ct_new).decode("ascii")})
        self.assertEqual(status, 200)
        # 用新密码登录
        em_login = gt_crypto._oaep_encode(new_pw.encode("utf-8"), _os.urandom(32))
        c_login = pow(int.from_bytes(em_login, "big"), key.e, key.n)
        ct_login = c_login.to_bytes((key.n.bit_length() + 7) // 8, "big")
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone2, "password": base64.b64encode(ct_login).decode("ascii")})
        self.assertEqual(status, 200)

    def test_register_validation(self):
        cases = [
            {"username": "a", "password": "pass123456", "phone": self.phone("139")},          # 用户名过短
            {"username": "x" * 21, "password": "pass123456", "phone": self.phone("139")},     # 用户名过长
            {"username": "13800138000", "password": "pass123456", "phone": self.phone("139")},# 用户名为手机号格式
            {"username": "合法名%s" % self.tag, "password": "12345", "phone": self.phone("139")},   # 密码过短
            {"username": "合法名%s" % self.tag, "password": "x" * 73, "phone": self.phone("139")},  # 密码过长
            {"username": "合法名%s" % self.tag, "password": "pass123456", "phone": "123"},     # 手机号非法
            {"username": "合法名%s" % self.tag, "password": "pass123456"},                        # 缺少手机号
        ]
        for bad in cases:
            status, obj, _ = self.jrequest("POST", "/games/api/register", bad)
            self.assertEqual(status, 400, "应拒绝注册: %r -> %r" % (bad, obj))

    def test_malformed_json_body(self):
        status, obj, _ = self.jrequest("POST", "/games/api/register", "{not-json")
        self.assertEqual(status, 400)

    def test_duplicate_username(self):
        username = "重名%s" % self.tag
        status, _, _ = self.register(username)
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("POST", "/games/api/register",
                                       {"username": username, "password": "pass123456", "phone": self.phone("138")})
        self.assertEqual(status, 409)
        self.assertIn("用户名", obj["error"])

    def test_duplicate_phone_register(self):
        phone = self.phone("138")
        status, _, _ = self.register("甲%s" % self.tag, "pass123456", phone)
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("POST", "/games/api/register",
                                       {"username": "乙%s" % self.tag, "password": "pass123456", "phone": phone})
        self.assertEqual(status, 409)
        self.assertIn("手机号", obj["error"])

    def test_register_phone_required(self):
        status, obj, _ = self.jrequest("POST", "/games/api/register",
                                       {"username": "无手机%s" % self.tag, "password": "pass123456"})
        self.assertEqual(status, 400)
        self.assertIn("手机号", obj["error"])

    def test_bind_phone_flow(self):
        username = "绑定%s" % self.tag
        phone = self.phone("137")
        other_phone = self.phone("136")
        status, obj, set_cookie = self.register(username, phone=phone)
        self.assertEqual(status, 200)

        # 未登录不能绑定
        status, obj, _ = self.jrequest("POST", "/games/api/bind-phone", {"phone": other_phone})
        self.assertEqual(status, 401)

        # 已绑定手机号时换绑被拒
        self.keep_cookie(set_cookie)
        status, obj, _ = self.jrequest("POST", "/games/api/bind-phone", {"phone": other_phone})
        self.assertEqual(status, 409)

        # 绑定非法手机号
        status, obj, _ = self.jrequest("POST", "/games/api/bind-phone", {"phone": "12345"})
        self.assertEqual(status, 400)

        # 绑定相同手机号：幂等成功
        status, obj, _ = self.jrequest("POST", "/games/api/bind-phone", {"phone": phone})
        self.assertEqual(status, 200)
        self.assertEqual(obj["user"]["phone"], app.mask_phone(phone))

        # 其他账号绑定已被占用的手机号被拒（已绑定其他手机号时不能换绑）
        status, obj, set_cookie2 = self.register("路人%s" % self.tag, phone=self.phone("135"))
        self.assertEqual(status, 200)
        self.cookie = set_cookie2.split(";")[0]
        status, obj, _ = self.jrequest("POST", "/games/api/bind-phone", {"phone": phone})
        self.assertEqual(status, 409)
        self.assertIn("已绑定", obj["error"])


class ProgressFlowTest(ServerBase):
    def _login(self):
        username = "进度%s" % self.tag
        status, obj, set_cookie = self.register(username, phone=self.phone("139"))
        self.assertEqual(status, 200)
        self.keep_cookie(set_cookie)
        return username

    def test_progress_requires_login(self):
        status, obj, _ = self.jrequest("PUT", "/games/api/progress", {"gameId": "pvz", "data": {"unlocked": 2}})
        self.assertEqual(status, 401)
        status, obj, _ = self.jrequest("PUT", "/games/api/prefs", {"data": {"mode": "crazy"}})
        self.assertEqual(status, 401)

    def test_progress_roundtrip_all_games(self):
        self._login()
        payload = {"unlocked": 3, "stars": {"1": 2, "2": 3}, "cleared": {"1": True}, "endlessBest": 12}
        for gid in ["stone-wars", "pvz", "carrot", "pokemon"]:
            status, obj, _ = self.jrequest("PUT", "/games/api/progress", {"gameId": gid, "data": payload})
            self.assertEqual(status, 200, gid)
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        for gid in ["stone-wars", "pvz", "carrot", "pokemon"]:
            self.assertEqual(obj["progress"][gid], payload, gid)

    def test_progress_rejects_unknown_game(self):
        self._login()
        status, obj, _ = self.jrequest("PUT", "/games/api/progress", {"gameId": "tetris", "data": {"x": 1}})
        self.assertEqual(status, 400)

    def test_progress_rejects_bad_shape(self):
        self._login()
        status, obj, _ = self.jrequest("PUT", "/games/api/progress", {"gameId": "pvz", "data": [1, 2]})
        self.assertEqual(status, 400)

    def test_prefs_merge(self):
        self._login()
        status, obj, _ = self.jrequest("PUT", "/games/api/prefs", {"data": {"mode": "crazy", "volume": 3}})
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("PUT", "/games/api/prefs", {"data": {"mode": "normal"}})
        self.assertEqual(status, 200)
        self.assertEqual(obj["prefs"]["mode"], "normal")   # 同 key 覆盖
        self.assertEqual(obj["prefs"]["volume"], 3)        # 不同 key 保留
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(obj["prefs"]["mode"], "normal")
        self.assertEqual(obj["prefs"]["volume"], 3)

    def test_body_too_large(self):
        self._login()
        big = {"gameId": "pvz", "data": {"blob": "x" * (130 * 1024)}}
        status, obj, _ = self.jrequest("PUT", "/games/api/progress", big)
        self.assertEqual(status, 413)

    def test_guest_me(self):
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(status, 200)
        self.assertIsNone(obj["user"])
        self.assertEqual(obj["progress"], {})
        self.assertEqual(obj["prefs"], {})


class SecurityTest(ServerBase):
    def test_cross_origin_rejected(self):
        username = "跨域%s" % self.tag
        phone = self.phone("139")
        status, obj, set_cookie = self.register(username, phone=phone)
        self.assertEqual(status, 200)
        self.keep_cookie(set_cookie)

        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone, "password": "pass123456"},
                                       headers={"Origin": "http://evil.example.com"})
        self.assertEqual(status, 403)

        # 同源 Origin 放行（主机名一致，带端口）
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone, "password": "pass123456"},
                                       headers={"Origin": "http://127.0.0.1:%d" % self.port})
        self.assertEqual(status, 200)

    def test_login_rate_limit(self):
        ip = "203.0.113.%d" % (int(self.tag, 16) % 200 + 1)
        phone = self.phone("139")
        status, _, _ = self.register("限流%s" % self.tag, phone=phone)
        self.assertEqual(status, 200)
        headers = {"X-Real-IP": ip}
        for _ in range(12):
            status, _, _ = self.jrequest("POST", "/games/api/login",
                                         {"phone": phone, "password": "bad-bad-bad"},
                                         headers=headers)
            self.assertEqual(status, 401)
        # 第 13 次即使密码正确也被限流
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone, "password": "pass123456"},
                                       headers=headers)
        self.assertEqual(status, 429)
        # 其它 IP 不受影响
        status, obj, _ = self.jrequest("POST", "/games/api/login",
                                       {"phone": phone, "password": "pass123456"})
        self.assertEqual(status, 200)


class AdminFlowTest(ServerBase):
    """后台：固定管理员手机号、账号列表、设/消管理员、首页配置、场次追踪。"""

    def _as_admin(self):
        status, obj, set_cookie = self.register("固定管理员%s" % self.tag, "pass123456", app.FIXED_ADMIN_PHONE)
        if status == 409:
            # 固定手机号已注册（同一测试库内跨用例共享）：改用手机号登录
            status, obj, set_cookie = self.jrequest("POST", "/games/api/login",
                                                    {"phone": app.FIXED_ADMIN_PHONE, "password": "pass123456"})
        self.assertEqual(status, 200)
        self.keep_cookie(set_cookie)
        return obj["user"]["username"]

    def test_fixed_phone_admin(self):
        username = self._as_admin()
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertEqual(status, 200)
        self.assertTrue(obj["user"]["is_admin"])
        # /me 接口返回脱敏手机号
        self.assertEqual(obj["user"]["phone"], app.mask_phone(app.FIXED_ADMIN_PHONE))

    def test_non_admin_forbidden(self):
        username = "普通用户%s" % self.tag
        status, obj, set_cookie = self.register(username, phone=self.phone("139"))
        self.assertEqual(status, 200)
        self.keep_cookie(set_cookie)
        status, obj, _ = self.jrequest("GET", "/games/api/me")
        self.assertFalse(obj["user"]["is_admin"])
        for path in ["/games/api/admin/users", "/games/api/admin/stats",
                     "/games/api/admin/config", "/games/api/admin/ip-region?ip=1.1.1.1"]:
            status, obj, _ = self.jrequest("GET", path)
            self.assertEqual(status, 403, path)

    def test_track_counts_plays_and_activity(self):
        self._as_admin()
        status, obj, _ = self.jrequest("POST", "/games/api/track", {"gameId": "stone-wars"})
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("POST", "/games/api/track", {"gameId": "stone-wars"})
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("GET", "/games/api/admin/users")
        self.assertEqual(status, 200)
        me = [u for u in obj["users"] if u["phone"] == app.FIXED_ADMIN_PHONE][0]
        self.assertTrue(me["lastActiveAt"] > 0)
        plays = [g for g in me["games"] if g["game"] == "stone-wars"][0]
        self.assertEqual(plays["plays"], 2)
        status, obj, _ = self.jrequest("POST", "/games/api/track", {"gameId": "xxx"})
        self.assertEqual(status, 400)
        # 未登录不计场次也不报错
        old_cookie, self.cookie = self.cookie, None
        status, obj, _ = self.jrequest("POST", "/games/api/track", {"gameId": "pvz"})
        self.assertEqual(status, 200)
        self.assertTrue(obj.get("guest"))
        self.cookie = old_cookie

    def test_toggle_admin_rules(self):
        self._as_admin()
        admin_cookie = self.cookie
        status, obj, set_cookie2 = self.register("升管%s" % self.tag, phone=self.phone("139"))
        self.assertEqual(status, 200)
        new_id = obj["user"]["id"]
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/users/admin", {"userId": new_id, "admin": True})
        self.assertEqual(status, 200)
        self.cookie = set_cookie2.split(";")[0]
        status, obj, _ = self.jrequest("GET", "/games/api/admin/stats")
        self.assertEqual(status, 200)
        # 切回固定管理员：新管理员降级
        self.cookie = admin_cookie
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/users/admin", {"userId": new_id, "admin": False})
        self.assertEqual(status, 200)
        # 固定管理员不可被取消权限，也不允许自我降级
        users = self.jrequest("GET", "/games/api/admin/users")[1]["users"]
        fixed_id = [u for u in users if u["phone"] == app.FIXED_ADMIN_PHONE][0]["id"]
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/users/admin", {"userId": fixed_id, "admin": False})
        self.assertEqual(status, 403)

    def test_home_games_config(self):
        self._as_admin()
        status, obj, _ = self.jrequest("GET", "/games/api/admin/config")
        self.assertEqual(status, 200)
        self.assertEqual(len(obj["games"]), 6)
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/config",
                                       {"games": ["stone-wars", "pvz"]})
        self.assertEqual(status, 200)
        status, obj, _ = self.jrequest("GET", "/games/api/config")
        self.assertEqual(obj["games"], ["stone-wars", "pvz"])
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/config",
                                       {"games": ["stone-wars", "pvz", "carrot"]})
        self.assertEqual(status, 200)
        # 非法值被拒绝
        status, obj, _ = self.jrequest("PUT", "/games/api/admin/config", {"games": []})
        self.assertEqual(status, 400)

    def test_admin_stats_and_ip_region(self):
        self._as_admin()
        status, obj, _ = self.jrequest("GET", "/games/api/admin/stats")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(obj["totalUsers"], 1)
        self.assertEqual(obj["fixedAdminPhone"], app.FIXED_ADMIN_PHONE)
        # 本地 IP 直接识别；非法输入返回「未知」；公网 IP 返回字符串（离线失败也是「未知」）
        self.assertEqual(app.ip_region("127.0.0.1"), "本地网络")
        self.assertEqual(app.ip_region("10.8.0.1"), "本地网络")
        self.assertEqual(app.ip_region("192.168.1.20"), "本地网络")
        self.assertEqual(app.ip_region("not-an-ip"), "未知")
        self.assertIsInstance(app.ip_region("8.8.8.8"), str)


class LeaderboardTest(ServerBase):
    """排行榜：按游戏类型核心指标排名"""

    _user_counter = 0

    def _create_user_with_progress(self, username, game_id, progress):
        LeaderboardTest._user_counter += 1
        prefix = "13%d" % (LeaderboardTest._user_counter % 10)
        phone = self.phone(prefix)
        status, obj, set_cookie = self.register(username, "pass123456", phone)
        if status != 200:
            raise AssertionError("注册失败: status=%s obj=%s phone=%s" % (status, obj, phone))
        user_id = obj["user"]["id"]
        self.keep_cookie(set_cookie)
        status, obj, _ = self.jrequest("PUT", "/games/api/progress",
                                       {"gameId": game_id, "data": progress})
        self.assertEqual(status, 200)
        return user_id

    def test_leaderboard_requires_login(self):
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=stone-wars")
        self.assertEqual(status, 401)

    def test_leaderboard_stone_wars_by_unlocked(self):
        """关卡制游戏按最高关卡排名"""
        # 用户 A：第 5 关
        self._create_user_with_progress("关卡A%s" % self.tag, "stone-wars",
                                        {"unlocked": 5, "stars": {"1": 3, "2": 3}, "cleared": {"1": True, "2": True}})
        # 用户 B：第 10 关（应排第一）
        self._create_user_with_progress("关卡B%s" % self.tag, "stone-wars",
                                        {"unlocked": 10, "stars": {"1": 1}, "cleared": {"1": True}})
        # 用户 C：第 3 关
        self._create_user_with_progress("关卡C%s" % self.tag, "stone-wars",
                                        {"unlocked": 3, "stars": {}, "cleared": {}})
        # 用最后一个用户的 cookie 查询
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=stone-wars")
        self.assertEqual(status, 200)
        entries = obj["entries"]
        self.assertEqual(len(entries), 3)
        # 第一名应是第 10 关
        self.assertIn("第 10 关", entries[0]["detail"])
        # 第二名应是第 5 关
        self.assertIn("第 5 关", entries[1]["detail"])
        # 第三名应是第 3 关
        self.assertIn("第 3 关", entries[2]["detail"])

    def test_leaderboard_pokemon_by_caught(self):
        """收集制游戏按图鉴数排名"""
        self._create_user_with_progress("图鉴A%s" % self.tag, "pokemon",
                                        {"caught": {"1": True, "2": True, "3": True}, "questsDone": 5, "wins": 2})
        self._create_user_with_progress("图鉴B%s" % self.tag, "pokemon",
                                        {"caught": {"1": True}, "questsDone": 10, "wins": 5})
        self._create_user_with_progress("图鉴C%s" % self.tag, "pokemon",
                                        {"caught": {"1": True, "2": True, "3": True, "4": True, "5": True},
                                         "questsDone": 0, "wins": 0})
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=pokemon")
        self.assertEqual(status, 200)
        entries = obj["entries"]
        # 第一名应是 5 只
        self.assertIn("图鉴 5", entries[0]["detail"])
        # 第二名应是 3 只
        self.assertIn("图鉴 3", entries[1]["detail"])
        # 第三名应是 1 只
        self.assertIn("图鉴 1", entries[2]["detail"])

    def test_leaderboard_vice_city_by_missions(self):
        """任务制游戏按主线任务数排名"""
        self._create_user_with_progress("任务A%s" % self.tag, "vice-city",
                                        {"missionsDone": 3, "taxiDone": 5, "weapons": ["fist"]})
        self._create_user_with_progress("任务B%s" % self.tag, "vice-city",
                                        {"missionsDone": 8, "taxiDone": 1, "weapons": ["fist", "uzi"]})
        self._create_user_with_progress("任务C%s" % self.tag, "vice-city",
                                        {"missionsDone": 1, "taxiDone": 10, "weapons": []})
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=vice-city")
        self.assertEqual(status, 200)
        entries = obj["entries"]
        self.assertIn("任务 8/10", entries[0]["detail"])
        self.assertIn("任务 3/10", entries[1]["detail"])
        self.assertIn("任务 1/10", entries[2]["detail"])

    def test_leaderboard_nfs_by_wins(self):
        """竞速制游戏按胜场排名"""
        self._create_user_with_progress("竞速A%s" % self.tag, "need-for-speed",
                                        {"wins": 2, "racesDone": 10, "bestLap": 60.0})
        self._create_user_with_progress("竞速B%s" % self.tag, "need-for-speed",
                                        {"wins": 5, "racesDone": 20, "bestLap": 55.0})
        self._create_user_with_progress("竞速C%s" % self.tag, "need-for-speed",
                                        {"wins": 0, "racesDone": 30, "bestLap": 50.0})
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=need-for-speed")
        self.assertEqual(status, 200)
        entries = obj["entries"]
        self.assertIn("胜场 5", entries[0]["detail"])
        self.assertIn("胜场 2", entries[1]["detail"])
        self.assertIn("胜场 0", entries[2]["detail"])

    def test_leaderboard_unknown_game(self):
        self._create_user_with_progress("未知%s" % self.tag, "stone-wars", {"unlocked": 1})
        status, obj, _ = self.jrequest("GET", "/games/api/leaderboard?game=tetris")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()



