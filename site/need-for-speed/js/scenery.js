/**
 * 赛道环境（海滨城市）：建筑、棕榈、路灯、海面、沙滩、远山。
 * 风格：与车模匹配的低多边形 + 简单材质；静态合批优先（棕榈/路灯用 InstancedMesh）。
 */
import * as THREE from "../lib/three.module.min.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";

/**
 * 赛道道具（Kenney racing kit，CC0）：看台 / 维修区 / 广告牌 / 灯塔 / 护栏。
 * 异步加载，失败时静默跳过（不阻塞游戏）。
 */
export async function buildTrackProps(track) {
  const g = new THREE.Group();
  const S = track.samples;
  const half = track.halfWidth;
  const loader = new GLTFLoader();
  const cache = {};
  const load = (f) => {
    if (!cache[f]) {
      cache[f] = new Promise((ok, err) => loader.load(`./assets/kits/racing/${f}`, (g) => ok(g.scene), undefined, err)).catch(() => null);
    }
    return cache[f];
  };
  const place = (obj, x, z, yaw, scale = 1) => {
    if (!obj) return null;
    obj.position.set(x, 0, z);
    obj.rotation.y = yaw;
    obj.scale.multiplyScalar(scale);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(obj);
    return obj;
  };
  const clone = (obj) => (obj ? obj.clone() : null);

  try {
    // 急弯采样（与胎墙同公式）
    const corners = [];
    for (let i = 0; i < S.length; i++) {
      const aPrev = S[(i - 3 + S.length) % S.length];
      const aNext = S[(i + 3) % S.length];
      const cross = aPrev.tx * aNext.tz - aPrev.tz * aNext.tx;
      if (Math.abs(cross) >= 0.16) {
        corners.push({ i, cross });
      }
    }

    // ---- 起跑区：双侧看台 + 维修间排 + 灯塔 ----
    const sm0 = S[0];
    {
      const side = 1;
      const bx = sm0.x + sm0.nx * side * (half + 9);
      const bz = sm0.z + sm0.nz * side * (half + 9);
      const yawFace = Math.atan2(-sm0.nx * side, -sm0.nz * side);
      const stand = await load("grandStand.glb");
      place(stand, bx, bz, yawFace);
      place(clone(stand), bx - sm0.tx * 8, bz - sm0.tz * 8, yawFace);
      // 维修间 3 间（看台后方）
      const garage = await load("pitsGarage.glb");
      for (let k = 0; k < 3; k++) {
        place(
          clone(garage),
          bx - sm0.tx * (14 + k * 7),
          bz - sm0.tz * (14 + k * 7),
          yawFace,
        );
      }
      // 灯塔（起点两侧）
      const towerR = await load("bannerTowerRed.glb");
      const towerG = await load("bannerTowerGreen.glb");
      const t1 = place(towerR, sm0.x + sm0.nx * (half + 3), sm0.z + sm0.nz * (half + 3), yawFace);
      place(towerG, sm0.x - sm0.nx * (half + 3), sm0.z - sm0.nz * (half + 3), yawFace);
      void t1;
    }

    // ---- 急弯外侧：广告牌 + 红色护栏 ----
    const billboard = await load("billboard.glb");
    const barrier = await load("barrierRed.glb");
    let placed = 0;
    const used = [];
    for (const c of corners) {
      if (placed >= 6) break;
      const sm = S[c.i];
      const last = used[used.length - 1];
      if (last && Math.hypot(sm.x - last.x, sm.z - last.z) < 80) continue;
      used.push(sm);
      const side = c.cross > 0 ? 1 : -1;
      const sideA = Math.atan2(-sm.nx * side, -sm.nz * side);
      place(clone(billboard), sm.x + sm.nx * side * (half + 6), sm.z + sm.nz * side * (half + 6), sideA);
      // 沿弯弧 3 段护栏
      const idx0 = ((c.i - 6) % S.length + S.length) % S.length;
      for (let k = 0; k < 3; k++) {
        const idx = (idx0 + k * 6) % S.length;
        const smk = S[idx];
        place(
          clone(barrier),
          smk.x + smk.nx * side * (half + 2),
          smk.z + smk.nz * side * (half + 2),
          Math.atan2(smk.tx, smk.tz),
        );
      }
      placed++;
    }

    // ---- 维修区旁帐篷 ×2 ----
    const tent = await load("tent.glb");
    if (tent) {
      const side = -1;
      place(clone(tent), sm0.x + sm0.nx * side * (half + 12) - sm0.tx * 6, sm0.z + sm0.nz * side * (half + 12) - sm0.tz * 6, Math.atan2(-sm0.nx * side, -sm0.nz * side));
      place(clone(tent), sm0.x + sm0.nx * side * (half + 12) + sm0.tx * 6, sm0.z + sm0.nz * side * (half + 12) + sm0.tz * 6, Math.atan2(-sm0.nx * side, -sm0.nz * side));
    }
  } catch (e) {
    // 单个素材失败不阻塞
  }

  return g;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 城市楼体立面：随机亮窗的 canvas 贴图 */
function makeFacadeTexture(rng, base, winLit, winDark) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 8, rows = 16, cw = 128 / cols, ch = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = rng() < 0.35 ? winLit : winDark;
      ctx.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
    }
  }
  // 顶部装饰线
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(0, 0, 128, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 楼体立面 UV 平铺（按真实尺寸拉伸窗户密度） */
function scaledBoxGeo(w, h, d, ru, rv) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // 六面顺序：+x,-x,+y,-y,+z,-z（每面 4 顶点）
  const face = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let fi = 0; fi < 6; fi++) {
    const [fw, fh] = face[fi];
    for (let vi = 0; vi < 4; vi++) {
      const i = fi * 4 + vi;
      uv.setXY(i, uv.getX(i) * (fw / ru), uv.getY(i) * (fh / rv));
    }
  }
  return geo;
}

/**
 * @returns {THREE.Group}
 */
export function buildScenery(track, opts = {}) {
  const g = new THREE.Group();
  const rng = makeRng(opts.seed || 7);
  const half = track.halfWidth;
  const S = track.samples;
  const winMats = [];   // 立面材质（供昼夜调整自发光）
  const startLights = []; // 起跑信号灯
  const buildings = [];   // 已放置楼（供屋顶道具/霓虹）

  // 点到赛道的最小距离（每 4 采样扫描）
  function distToTrack(x, z) {
    let best = Infinity;
    for (let i = 0; i < S.length; i += 4) {
      const dx = S[i].x - x, dz = S[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ---------------- 远山（海岛剪影，海雾中若隐若现）
  {
    const mat = new THREE.MeshLambertMaterial({ color: 0x6d84a0 });
    const ring = 17;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rng() * 0.2;
      const r = 760 + rng() * 380;
      const h = 180 + rng() * 260;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(160 + rng() * 200, h, 5), mat);
      cone.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
      cone.rotation.y = rng() * Math.PI;
      cone.matrixAutoUpdate = false;
      cone.updateMatrix();
      g.add(cone);
    }
  }

  // ---------------- 低多边形云（Sprite）
  {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(64, 36, 4, 64, 40, 44);
    grad.addColorStop(0, "rgba(255,255,255,.95)");
    grad.addColorStop(0.6, "rgba(255,255,255,.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      const a = rng() * Math.PI * 2;
      const r = 200 + rng() * 700;
      sp.position.set(Math.cos(a) * r, 55 + rng() * 55, Math.sin(a) * r);
      const s = 40 + rng() * 55;
      sp.scale.set(s, s * 0.45, 1);
      g.add(sp);
    }
  }

  // ---------------- 海面 + 沙滩（赛道西侧，接地坪之外）
  {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshLambertMaterial({ color: 0x1c5f8a }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.12, 0);
    sea.matrixAutoUpdate = false;
    sea.updateMatrix();
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 2600),
      new THREE.MeshLambertMaterial({ color: 0xc9b060 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-620 - 24, -0.05, 120);
    sand.matrixAutoUpdate = false;
    sand.updateMatrix();
    g.add(sea, sand);
  }

  // ---------------- 城市建筑（避开赛道走廊）
  {
    const palettes = [
      { base: "#7f8ea3", lit: "#ffe9a3", dark: "#1d2733" },
      { base: "#b08a72", lit: "#fff2c0", dark: "#2a2028" },
      { base: "#9aa7a8", lit: "#e8f6ff", dark: "#232a30" },
    ];
    const textures = palettes.map((p) => makeFacadeTexture(rng, p.base, p.lit, p.dark));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    let placed = 0, guard = 0;
    while (placed < 56 && guard++ < 900) {
      const x = -520 + rng() * 1080;
      const z = -220 + rng() * 860;
      const w = 10 + rng() * 18;
      const d = 10 + rng() * 18;
      const clearance = half + 12 + Math.max(w, d) / 2;
      if (distToTrack(x, z) < clearance) continue;
      const h = 14 + rng() * rng() * 72; // 少数高塔
      const variant = Math.floor(rng() * textures.length);
      const faceMat = new THREE.MeshLambertMaterial({ map: textures[variant] });
      faceMat.userData.isWindow = true;
      winMats.push(faceMat);
      const geo = scaledBoxGeo(w, h, d, 2.4, 2.4);
      const mesh = new THREE.Mesh(geo, [faceMat, faceMat, roofMat, roofMat, faceMat, faceMat]);
      if (rng() < 0.5) mesh.rotation.y = Math.PI / 2;
      mesh.position.set(x, h / 2 - 0.05, z);
      mesh.castShadow = h > 40;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      g.add(mesh);
      buildings.push({ x, z, w, d, h, top: h - 0.05 });
      placed++;
    }

    // ---- 屋顶道具：空调箱/水箱（InstancedMesh）
    if (buildings.length) {
      const acGeo = new THREE.BoxGeometry(1.4, 0.9, 1.4);
      const acMat = new THREE.MeshLambertMaterial({ color: 0x8b9299 });
      const tankGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 8);
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
      const acCount = Math.min(28, buildings.length);
      const tankCount = Math.min(14, buildings.length);
      const acs = new THREE.InstancedMesh(acGeo, acMat, acCount);
      const tanks = new THREE.InstancedMesh(tankGeo, tankMat, tankCount);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < acCount; i++) {
        const b = buildings[Math.floor(rng() * buildings.length)];
        m.compose(v.set(b.x + (rng() - 0.5) * b.w * 0.5, b.top + 0.45, b.z + (rng() - 0.5) * b.d * 0.5), q, sc);
        acs.setMatrixAt(i, m);
      }
      for (let i = 0; i < tankCount; i++) {
        const b = buildings[Math.floor(rng() * buildings.length)];
        m.compose(v.set(b.x + (rng() - 0.5) * b.w * 0.4, b.top + 0.9, b.z + (rng() - 0.5) * b.d * 0.4), q, sc);
        tanks.setMatrixAt(i, m);
      }
      acs.instanceMatrix.needsUpdate = true;
      tanks.instanceMatrix.needsUpdate = true;
      g.add(acs, tanks);
    }

    // ---- 沿街霓虹灯牌（InstancedMesh 亮色 Basic）
    {
      const signMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const signGeo = new THREE.BoxGeometry(0.35, 2.6, 0.12);
      const nNear = buildings.filter((b) => b.top > 20).slice(0, 22);
      const signs = new THREE.InstancedMesh(signGeo, signMat, nNear.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3(1, 1, 1);
      const col = new THREE.Color();
      const palette = [0xff2d95, 0x23d5e8, 0xff9f43, 0x7a6fd0, 0x2bffa8];
      for (let i = 0; i < nNear.length; i++) {
        const b = nNear[i];
        const yaw = rng() * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(0, yaw, 0));
        m.compose(
          v.set(
            b.x + Math.sin(yaw) * (Math.max(b.w, b.d) / 2 + 0.3),
            b.top - 1.2,
            b.z + Math.cos(yaw) * (Math.max(b.w, b.d) / 2 + 0.3),
          ),
          q, sc,
        );
        signs.setMatrixAt(i, m);
        col.setHex(palette[Math.floor(rng() * palette.length)]);
        signs.setColorAt(i, col);
      }
      signs.instanceMatrix.needsUpdate = true;
      if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
      g.add(signs);
    }
  }

  // ---------------- 棕榈树（赛道两侧交替）
  {
    const positions = [];
    for (let i = 0; i < S.length; i += 8) {
      const sm = S[i];
      const side = (i / 8) % 2 === 0 ? 1 : -1;
      const off = half + 2.6 + rng() * 1.4;
      positions.push([
        sm.x + sm.nx * off * side + rng() * 2 - 1,
        sm.z + sm.nz * off * side + rng() * 2 - 1,
      ]);
    }
    const n = positions.length;
    const trunkH = 5 + rng() * 2;
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    const frondGeo = new THREE.ConeGeometry(0.14, 2.6, 5);
    frondGeo.translate(0, 1.3, 0);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a });
    const frondsPerPalm = 6;
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, n * frondsPerPalm);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, z] = positions[i];
      const h = trunkH * (0.85 + rng() * 0.4);
      eu.set(0, rng() * Math.PI, 0);
      q.setFromEuler(eu);
      m.compose(v.set(x, 0, z), q, sc.set(1, h, 1));
      trunks.setMatrixAt(i, m);
      // 叶子：从树顶向外倾
      for (let k = 0; k < frondsPerPalm; k++) {
        const a = (k / frondsPerPalm) * Math.PI * 2 + rng() * 0.3;
        const tilt = 0.9 + rng() * 0.25;
        eu.set(Math.cos(a) * tilt, rng() * Math.PI, Math.sin(a) * tilt, "YXZ");
        q.setFromEuler(eu);
        const fl = 0.8 + rng() * 0.5;
        m.compose(v.set(x, h * 0.98, z), q, sc.set(1, fl, 1));
        const fi = i * frondsPerPalm + k;
        fronds.setMatrixAt(fi, m);
        col.setHSL(0.33 + rng() * 0.04, 0.55, 0.38 + rng() * 0.12);
        fronds.setColorAt(fi, col);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
    g.add(trunks, fronds);
  }

  // ---------------- 路灯（赛道两侧，灯头朝路）
  {
    const lamps = [];
    for (let i = 0; i < S.length; i += 10) {
      const sm = S[i];
      const side = (i / 10) % 2 === 0 ? 1 : -1;
      const off = half + 1.8;
      lamps.push({ x: sm.x + sm.nx * off * side, z: sm.z + sm.nz * off * side, ang: Math.atan2(sm.tx, sm.tz), side });
    }
    const n = lamps.length;
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.6, 6);
    poleGeo.translate(0, 2.8, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.4);
    armGeo.translate(0, 5.5, 0.7); // 灯臂向 +Z 伸出
    const arms = new THREE.InstancedMesh(armGeo, poleMat, n);
    const headGeo = new THREE.BoxGeometry(0.5, 0.14, 0.24);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const L = lamps[i];
      const sm = S[i * 10];
      // 朝向：灯臂 +Z 指向赛道中心
      q.setFromEuler(new THREE.Euler(0, Math.atan2(-sm.nx * L.side, -sm.nz * L.side), 0));
      m.compose(v.set(L.x, 0, L.z), q, sc);
      poles.setMatrixAt(i, m);
      arms.setMatrixAt(i, m);
      heads.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 5.4, 1.35)));
    }
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    g.add(poles, arms, heads);
  }

  // ---------------- 弯道胎墙（急弯外侧，缓冲视觉+参照物）
  {
    const stacks = [];
    for (let i = 0; i < S.length; i++) {
      const aPrev = S[(i - 3 + S.length) % S.length];
      const aNext = S[(i + 3) % S.length];
      const cross = aPrev.tx * aNext.tz - aPrev.tz * aNext.tx;
      if (Math.abs(cross) < 0.16) continue;
      const sm = S[i];
      const side = cross > 0 ? 1 : -1; // 弯外侧：左转→右侧，右转→左侧
      stacks.push({ x: sm.x + sm.nx * side * (half + 1.6), z: sm.z + sm.nz * side * (half + 1.6), cross });
    }
    // 去重（相邻弯只留一段）
    const picked = [];
    for (const st of stacks) {
      const last = picked[picked.length - 1];
      if (!last || Math.hypot(st.x - last.x, st.z - last.z) > 24) picked.push(st);
    }
    const n = Math.min(picked.length, 24);
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.24, 10);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
    const tires = new THREE.InstancedMesh(tireGeo, tireMat, n * 3);
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1, 1, 1);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const st = picked[i];
      const jitter = ((i * 37) % 10) / 10;
      const yaw = jitter * Math.PI;
      for (let k = 0; k < 3; k++) {
        q.setFromEuler(new THREE.Euler(0, yaw + k * 0.2, 0));
        const rr = k * 0.04;
        m.compose(v.set(st.x + rr * Math.sin(yaw), 0.12 + k * 0.24, st.z + rr * Math.cos(yaw)), q, sc);
        tires.setMatrixAt(idx++, m);
      }
    }
    tires.count = idx;
    tires.instanceMatrix.needsUpdate = true;
    g.add(tires);
  }

  // ---------------- 起跑信号灯（起跑门横幅上，红色→起跑变绿）
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const sm = S[0];
    for (let k = -1; k <= 1; k++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
      bulb.position.set(
        sm.x + sm.tx * k * 3,
        5.9,
        sm.z + sm.tz * k * 3,
      );
      g.add(bulb);
      startLights.push(bulb);
    }
  }

  g.userData.winMats = winMats;
  g.userData.startLights = startLights;

  return g;
}
