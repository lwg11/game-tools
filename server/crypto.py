# -*- coding: utf-8 -*-
import hashlib
import os
import secrets
import threading


def _is_probable_prime(n, k=40):
    if n < 2:
        return False
    if n in (2, 3):
        return True
    if n % 2 == 0:
        return False
    r, d = 0, n - 1
    while d % 2 == 0:
        r += 1
        d //= 2
    for _ in range(k):
        a = secrets.randbelow(n - 3) + 2
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _gen_prime(bits):
    while True:
        n = secrets.randbits(bits) | (1 << (bits - 1)) | 1
        if _is_probable_prime(n):
            return n


def _egcd(a, b):
    if a == 0:
        return b, 0, 1
    g, x, y = _egcd(b % a, a)
    return g, y - (b // a) * x, x


def _modinv(a, m):
    g, x, _ = _egcd(a % m, m)
    if g != 1:
        raise ValueError("no inverse")
    return x % m


def _sha256(data):
    return hashlib.sha256(data).digest()


def _oaep_encode(message, seed, label=b""):
    k = 256
    h_len = 32
    max_msg = k - 2 * h_len - 2
    if len(message) > max_msg:
        raise ValueError("too long")
    l_hash = _sha256(label)
    ps = b"\x00" * (max_msg - len(message))
    db = l_hash + ps + b"\x01" + message
    db_mask = _mgf1(seed, k - h_len - 1)
    masked_db = bytes(a ^ b for a, b in zip(db, db_mask))
    seed_mask = _mgf1(masked_db, h_len)
    masked_seed = bytes(a ^ b for a, b in zip(seed, seed_mask))
    return b"\x00" + masked_seed + masked_db


def _oaep_decode(em, label=b""):
    k = 256
    h_len = 32
    if len(em) != k or em[0] != 0:
        raise ValueError("decode failed")
    masked_seed = em[1:1 + h_len]
    masked_db = em[1 + h_len:]
    seed_mask = _mgf1(masked_db, h_len)
    seed = bytes(a ^ b for a, b in zip(masked_seed, seed_mask))
    db_mask = _mgf1(seed, k - h_len - 1)
    db = bytes(a ^ b for a, b in zip(masked_db, db_mask))
    l_hash = _sha256(label)
    if db[:h_len] != l_hash:
        raise ValueError("label mismatch")
    idx = db.find(b"\x01", h_len)
    if idx < 0:
        raise ValueError("separator not found")
    return db[idx + 1:]


def _mgf1(seed, length):
    out = b""
    counter = 0
    while len(out) < length:
        out += _sha256(seed + counter.to_bytes(4, "big"))
        counter += 1
    return out[:length]


class RSAKey:
    def __init__(self, n, e, d, p=None, q=None):
        self.n = n
        self.e = e
        self.d = d
        self.p = p
        self.q = q

    @classmethod
    def generate(cls, bits=2048):
        half = bits // 2
        while True:
            p = _gen_prime(half)
            q = _gen_prime(half)
            if p == q:
                continue
            n = p * q
            if n.bit_length() != bits:
                continue
            phi = (p - 1) * (q - 1)
            e = 65537
            if _egcd(e, phi)[0] != 1:
                continue
            d = _modinv(e, phi)
            return cls(n, e, d, p, q)

    def public_jwk(self):
        def b64u(num):
            b = num.to_bytes((num.bit_length() + 7) // 8, "big")
            import base64
            return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")
        return {
            "kty": "RSA",
            "n": b64u(self.n),
            "e": b64u(self.e),
            "alg": "RSA-OAEP-256",
            "ext": True,
        }

    def decrypt(self, ciphertext_bytes):
        c = int.from_bytes(ciphertext_bytes, "big")
        if c >= self.n:
            raise ValueError("out of range")
        m = pow(c, self.d, self.n)
        k = (self.n.bit_length() + 7) // 8
        em = m.to_bytes(k, "big")
        return _oaep_decode(em)


_key = None
_key_lock = threading.Lock()


def get_key():
    global _key
    if _key is None:
        with _key_lock:
            if _key is None:
                _key = RSAKey.generate(2048)
    return _key


def reset_key():
    global _key
    with _key_lock:
        _key = None
