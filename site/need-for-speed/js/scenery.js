/**
 * 赛道环境（海滨城市）：建筑、棕榈、路灯、海面、沙滩、远山。
 * 风格：与车模匹配的低多边形 + 简单材质；静态合批优先（棕榈/路灯用 InstancedMesh）。
 */
import * as THREE from "../lib/three.module.min.js";

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
      const geo = scaledBoxGeo(w, h, d, 2.4, 2.4);
      const mesh = new THREE.Mesh(geo, [faceMat, faceMat, roofMat, roofMat, faceMat, faceMat]);
      if (rng() < 0.5) mesh.rotation.y = Math.PI / 2;
      mesh.position.set(x, h / 2 - 0.05, z);
      mesh.castShadow = h > 40;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      g.add(mesh);
      placed++;
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

  return g;
}
