/**
 * 赛道网格生成（Three.js）：路面 ribbon、路肩块、起跑门、地面。
 * 灰色原型配色（后续换 PBR 资产）。
 */
import * as THREE from "../lib/three.module.min.js";

/** 简易盒体合并器（灰模原型用） */
export class BoxBatch {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.idx = []; this.v = 0;
  }
  addRot(cx, cy, cz, w, h, d, ry, color) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const cosR = Math.cos(ry), sinR = Math.sin(ry);
    const rot = (x, z) => [x * cosR + z * sinR, -x * sinR + z * cosR];
    const corners = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    ];
    const faces = [
      { n: [0, 1, 0], c: [3, 2, 1, 0] },
      { n: [0, -1, 0], c: [4, 5, 6, 7] },
      { n: [1, 0, 0], c: [0, 1, 2, 3] },
      { n: [-1, 0, 0], c: [5, 4, 7, 6] },
      { n: [0, 0, 1], c: [1, 0, 4, 5] },
      { n: [0, 0, -1], c: [2, 3, 7, 6] },
    ];
    const col = new THREE.Color(color);
    for (const f of faces) {
      const base = this.v;
      for (const ci of f.c) {
        const [lx, ly, lz] = corners[ci];
        const [rx, rz] = rot(lx, lz);
        this.pos.push(cx + rx, cy + ly, cz + rz);
        const [onx, onz] = rot(f.n[0], f.n[2]);
        this.nor.push(onx, f.n[1], onz);
        this.col.push(col.r, col.g, col.b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.v += 4;
    }
  }

  add(cx, cy, cz, w, h, d, color) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const corners = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    ];
    const faces = [
      { n: [0, 1, 0], c: [3, 2, 1, 0] },
      { n: [0, -1, 0], c: [4, 5, 6, 7] },
      { n: [1, 0, 0], c: [0, 1, 2, 3] },
      { n: [-1, 0, 0], c: [5, 4, 7, 6] },
      { n: [0, 0, 1], c: [1, 0, 4, 5] },
      { n: [0, 0, -1], c: [2, 3, 7, 6] },
    ];
    const col = new THREE.Color(color);
    for (const f of faces) {
      const base = this.v;
      for (const ci of f.c) {
        const [lx, ly, lz] = corners[ci];
        this.pos.push(cx + lx, cy + ly, cz + lz);
        this.nor.push(f.n[0], f.n[1], f.n[2]);
        this.col.push(col.r, col.g, col.b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.v += 4;
    }
  }
  build(material, shadow = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.setIndex(this.idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/** 由采样点生成整条赛道网格 */
export function buildTrackMeshes(track, opts = {}) {
  const group = new THREE.Group();
  const half = track.halfWidth;
  const S = track.samples;
  const N = S.length;
  const roadW = half * 2;

  // ---- 路面 ribbon
  {
    const pos = [], nor = [], idx = [];
    const uv = [];
    for (let i = 0; i <= N; i++) {
      const sm = S[i % N];
      const lx = sm.x - sm.nx * half, lz = sm.z - sm.nz * half;   // 左缘
      const rx = sm.x + sm.nx * half, rz = sm.z + sm.nz * half;   // 右缘
      pos.push(lx, 0.02, lz, rx, 0.02, rz);
      nor.push(0, 1, 0, 0, 1, 0);
      uv.push(0, sm.s / 12, 1, sm.s / 12);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ color: 0x32373d });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // ---- 中线虚线
  {
    const batch = new BoxBatch();
    const lineColor = 0xe8e8e8;
    const step = 3; // 每 3 个采样一段
    for (let i = 0; i < N; i += step * 2) {
      const a = S[i % N];
      const b = S[(i + step) % N];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      // 用有向旋转的薄片
      batch.addRot(mx, 0.045, mz, 0.35, 0.015, len, ang, lineColor);
    }
    const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // ---- 路缘红白块 + 外侧地面
  {
    const batch = new BoxBatch();
    const red = 0xc0392b, white = 0xecf0f1;
    for (let i = 0; i < N; i += 4) {
      const sm = S[i];
      const c = Math.floor(i / 8) % 2 === 0 ? red : white;
      batch.addRot(sm.x - sm.nx * (half + 0.35), 0.12, sm.z - sm.nz * (half + 0.35), 0.7, 0.24, 3.0, Math.atan2(sm.tx, sm.tz), c);
      batch.addRot(sm.x + sm.nx * (half + 0.35), 0.12, sm.z + sm.nz * (half + 0.35), 0.7, 0.24, 3.0, Math.atan2(sm.tx, sm.tz), c);
    }
    const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // ---- 起跑门（两根立柱 + 横幅）
  {
    const batch = new BoxBatch();
    const sm = S[0];
    const lx = sm.x - sm.nx * (half + 1.2), lz = sm.z - sm.nz * (half + 1.2);
    const rx = sm.x + sm.nx * (half + 1.2), rz = sm.z + sm.nz * (half + 1.2);
    const ang = Math.atan2(sm.tx, sm.tz);
    batch.add(lx, 2.5, lz, 0.6, 5, 0.6, 0xeeeeee);
    batch.add(rx, 2.5, rz, 0.6, 5, 0.6, 0xeeeeee);
    const cx = (lx + rx) / 2, cz = (lz + rz) / 2;
    batch.addRot(cx, 5.0, cz, roadW + 3.4, 1.2, 0.5, ang, 0xffd166);
    const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // ---- 地面
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(1000, track.length * 1.5, 26), 48),
    new THREE.MeshLambertMaterial({ color: 0x2c2f26 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();
  group.add(ground);

  return group;
}
