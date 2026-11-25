let _publicKey = null;
let _keyPromise = null;

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function sha256(message) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  const len = message.length;
  const bitLen = len * 8;
  const paddedLen = (((len + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(paddedLen);
  buf.set(message);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
  return out;
}

function mgf1(seed, length) {
  const out = new Uint8Array(length);
  let counter = 0;
  let offset = 0;
  while (offset < length) {
    const c = new Uint8Array(4);
    new DataView(c.buffer).setUint32(0, counter, false);
    const input = new Uint8Array(seed.length + 4);
    input.set(seed, 0);
    input.set(c, seed.length);
    const hash = sha256(input);
    const copy = Math.min(hash.length, length - offset);
    out.set(hash.subarray(0, copy), offset);
    offset += copy;
    counter++;
  }
  return out;
}

function oaepEncode(message) {
  const k = 256;
  const hLen = 32;
  const maxMsg = k - 2 * hLen - 2;
  if (message.length > maxMsg) throw new Error("payload too long");
  const lHash = sha256(new Uint8Array(0));
  const ps = new Uint8Array(maxMsg - message.length);
  const db = new Uint8Array(hLen + ps.length + 1 + message.length);
  db.set(lHash, 0);
  db.set(ps, hLen);
  db[hLen + ps.length] = 0x01;
  db.set(message, hLen + ps.length + 1);
  const seed = new Uint8Array(hLen);
  for (let i = 0; i < hLen; i++) seed[i] = Math.floor(Math.random() * 256);
  const dbMask = mgf1(seed, k - hLen - 1);
  const maskedDb = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) maskedDb[i] = db[i] ^ dbMask[i];
  const seedMask = mgf1(maskedDb, hLen);
  const maskedSeed = new Uint8Array(hLen);
  for (let i = 0; i < hLen; i++) maskedSeed[i] = seed[i] ^ seedMask[i];
  const em = new Uint8Array(k);
  em[0] = 0x00;
  em.set(maskedSeed, 1);
  em.set(maskedDb, 1 + hLen);
  return em;
}

function rsaEncrypt(em, n, e) {
  let m = BigInt("0x" + Array.from(em).map(b => b.toString(16).padStart(2, "0")).join(""));
  const c = modPow(m, e, n);
  let hex = c.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(256);
  const fullHex = hex.padStart(512, "0");
  for (let i = 0; i < 256; i++) {
    bytes[i] = parseInt(fullHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

async function fetchPublicKey() {
  const resp = await fetch("/games/api/crypto-key", { credentials: "same-origin" });
  if (!resp.ok) throw new Error("key fetch failed");
  const jwk = await resp.json();
  const nBytes = base64UrlToBytes(jwk.n);
  const eBytes = base64UrlToBytes(jwk.e);
  let nHex = "0x";
  for (const b of nBytes) nHex += b.toString(16).padStart(2, "0");
  let eHex = "0x";
  for (const b of eBytes) eHex += b.toString(16).padStart(2, "0");
  _publicKey = { n: BigInt(nHex), e: BigInt(eHex) };
  return _publicKey;
}

export async function getPublicKey() {
  if (_publicKey) return _publicKey;
  if (!_keyPromise) {
    _keyPromise = fetchPublicKey().catch((err) => {
      _keyPromise = null;
      throw err;
    });
  }
  return _keyPromise;
}

export async function encryptPassword(password) {
  const key = await getPublicKey();
  const encoded = new TextEncoder().encode(password);
  const em = oaepEncode(encoded);
  const cipherBytes = rsaEncrypt(em, key.n, key.e);
  return bytesToBase64(cipherBytes);
}
