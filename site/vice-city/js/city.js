/**
 * 罪恶都市 · 城市模块
 * ------------------------------------------------------------
 * 职责：程序化生成 2400×2400 城市：道路网/街区块/水域/机场/富人岛/港区的
 * 网格、碰撞体、行人路点、停车位、霓虹与灯光，以及小地图底图预渲染。
 *
 * 性能策略：
 * - 所有静态盒体按材质合并为少量 draw call（建筑 1 个、道路等 1 个）；
 * - 棕榈/路灯等用 InstancedMesh；
 * - 建筑使用世界坐标 UV（窗户按米平铺），白天 wall map、夜晚 emissiveMap 发光；
 * - 小地图一次性预渲染。
 */
import * as THREE from "../lib/three.module.min.js";
import {
  WORLD, PALETTE, mulberry32, clamp, hexToRgb,
} from "./common.js";

const BOX_TILE = 40; // 窗户贴图每 40 米平铺一次

// ---------------------------------------------------------------- 盒体合并器
/**
 * 收集大量轴对齐盒体，输出一个 BufferGeometry（顶点色 + 世界 UV），
 * 从而把 N 个盒子合并成 1 次 draw call。
 */
class BoxBatch {
  constructor(withUV) {
    this.withUV = !!withUV;
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.v = 0;
  }

  add(cx, cy, cz, w, h, d, ry = 0, color = "#ffffff") {
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    // 局部角点
    const corners = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    ];
    const rotate = ry !== 0;
    const cosR = rotate ? Math.cos(ry) : 1;
    const sinR = rotate ? Math.sin(ry) : 0;
    const rot = (x, z) => (rotate ? [x * cosR + z * sinR, -x * sinR + z * cosR] : [x, z]);

    // 6 个面：法线 + 角点索引
    const faces = [
      { n: [0, 1, 0], c: [3, 2, 1, 0] },   // +Y
      { n: [0, -1, 0], c: [4, 5, 6, 7] },  // -Y
      { n: [1, 0, 0], c: [0, 1, 2, 3] },   // +X  (注意朝向与 UV)
      { n: [-1, 0, 0], c: [5, 4, 7, 6] },  // -X
      { n: [0, 0, 1], c: [1, 0, 4, 5] },   // +Z
      { n: [0, 0, -1], c: [2, 3, 7, 6] },  // -Z
    ];
    const col = hexToRgb(color);

    for (const f of faces) {
      const [nx, ny, nz] = f.n;
      let outN = f.n;
      if (rotate) {
        const [rx, rz] = rot(nx, nz);
        outN = [rx, ny, rz];
      }
      const base = this.v;
      for (const ci of f.c) {
        const [lx, ly, lz] = corners[ci];
        const [rx, rz] = rot(lx, lz);
        const wx = cx + rx;
        const wy = cy + ly;
        const wz = cz + rz;
        this.pos.push(wx, wy, wz);
        this.nor.push(outN[0], outN[1], outN[2]);
        this.col.push(col.r / 255, col.g / 255, col.b / 255);
        if (this.withUV) {
          // 世界米坐标 UV，保证跨面窗户平铺连续
          let u, v;
          if (ny !== 0) { u = wx / BOX_TILE; v = wz / BOX_TILE; }
          else if (nz !== 0) { u = wx / BOX_TILE; v = wy / BOX_TILE; }
          else { u = wz / BOX_TILE; v = wy / BOX_TILE; }
          this.uv.push(u, v);
        } else {
          this.uv.push(0, 0);
        }
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.v += 4;
    }
  }

  build(material, shadow) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.setIndex(this.idx);
    const mesh = new THREE.Mesh(geo, material);
    if (shadow) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  get count() { return this.v; }
}

// ---------------------------------------------------------------- 窗户贴图
function makeWindowTextures(seed) {
  const size = 512;
  const cols = 5;   // 每 40m 5 列窗
  const rows = 6;
  const cellW = size / cols;
  const cellH = size / rows;
  const rnd = mulberry32(seed);

  // 墙面：浅蓝灰墙 + 深色窗 + 窗框/窗台
  const wallCv = document.createElement("canvas");
  wallCv.width = wallCv.height = size;
  const wctx = wallCv.getContext("2d");
  wctx.fillStyle = "#b9c2ce";
  wctx.fillRect(0, 0, size, size);
  // 顶部檐口线
  wctx.fillStyle = "#a3adba";
  wctx.fillRect(0, 0, size, 14);
  // 随机墙面噪点
  for (let i = 0; i < 160; i++) {
    wctx.fillStyle = `rgba(60,70,86,${0.04 + rnd() * 0.05})`;
    wctx.fillRect(rnd() * size, rnd() * size, 6 + rnd() * 12, 6 + rnd() * 12);
  }

  // 发光：黑底 + 亮窗
  const litCv = document.createElement("canvas");
  litCv.width = litCv.height = size;
  const lctx = litCv.getContext("2d");
  lctx.fillStyle = "#000000";
  lctx.fillRect(0, 0, size, size);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + cellW * 0.16;
      const wy = r * cellH + cellH * 0.2;
      const ww = cellW * 0.68;
      const wh = cellH * 0.5;
      // 墙上的窗（深色 + 玻璃高光 + 窗台）
      wctx.fillStyle = "#1c2a3a";
      wctx.fillRect(wx, wy, ww, wh);
      wctx.fillStyle = "rgba(255,255,255,0.12)";
      wctx.fillRect(wx, wy, ww, 4);
      wctx.fillStyle = "rgba(255,255,255,0.06)";
      wctx.fillRect(wx, wy + wh * 0.45, ww, wh * 0.55);
      wctx.fillStyle = "#8a94a0";
      wctx.fillRect(wx - 2, wy + wh, ww + 4, 5);
      // 夜窗：60% 亮
      if (rnd() < 0.6) {
        const warm = rnd();
        if (warm < 0.7) lctx.fillStyle = "#ffd27a";
        else if (warm < 0.85) lctx.fillStyle = "#ffe9b0";
        else lctx.fillStyle = "#9fe0ff";
        lctx.fillRect(wx, wy, ww, wh);
        // 帘子阴影
        lctx.fillStyle = "rgba(0,0,0,0.35)";
        lctx.fillRect(wx + ww * 0.3, wy, ww * 0.2, wh);
      }
    }
  }

  return { wallCv, litCv };
}

// ---------------------------------------------------------------- 城市
export class City {
  constructor() {
    this.group = new THREE.Group();
    this.colliders = [];      // { minX, minZ, maxX, maxZ }
    this.pedPoints = [];      // 行路点 {x, z}
    this.parkingSpots = [];   // 停车位 {x, z, angle}
    this.zones = [];          // { name, rect:{minX,minZ,maxX,maxZ}, color }
    this.spawnPoint = { x: 0, z: 0 };
    this.minimapCv = null;

    this._mats = {
      building: null, road: null, lampHead: null,
      neon: null, neonGlow: null,
    };
    this._nightF = 0;
  }

  // ================================================================ 生成
  build(scene, seed = 20260) {
    const rnd = mulberry32(seed);
    const s = WORLD.size;
    const half = WORLD.half;
    const roadW = WORLD.roadW;
    const sideW = WORLD.sidewalkW;
    const step = s / WORLD.gridN;

    this._buildZones();
    this._buildGround(rnd);
    this._buildRoads(rnd, step, roadW, sideW);
    this._buildBlocks(rnd, step, roadW, sideW);
    this._buildBeach(rnd, step);
    this._buildIsland(rnd);
    this._buildPalms(rnd, step);
    this._buildStreetLights(rnd, step);
    this._buildNeon(rnd, step);
    this._buildPedPoints(step, roadW, sideW);
    this._buildParking(rnd, step, roadW);
    this._buildMinimap();

    scene.add(this.group);
    return this;
  }

  _buildZones() {
    this.zones = [
      { name: "市中心", color: "#5a6f9f", rect: { minX: -400, minZ: -400, maxX: 400, maxZ: 400 } },
      { name: "海滨", color: "#3fb8c9", rect: { minX: -1200, minZ: 700, maxX: 1200, maxZ: 1010 } },
      { name: "小哈瓦那", color: "#e07a5f", rect: { minX: -1200, minZ: -400, maxX: -400, maxZ: 700 } },
      { name: "维基港", color: "#8c9e6b", rect: { minX: 820, minZ: -400, maxX: 1200, maxZ: 1010 } },
      { name: "国际机场", color: "#7787a0", rect: { minX: -1200, minZ: -1200, maxX: -640, maxZ: -640 } },
      { name: "海星岛", color: "#f2b5d4", rect: { minX: 880, minZ: 1060, maxX: 1010, maxZ: 1190 } },
    ];
  }

  zoneAt(x, z) {
    for (const zn of this.zones) {
      const r = zn.rect;
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return zn.name;
    }
    return "绿地海岸";
  }

  _buildGround(rnd) {
    const half = WORLD.half;
    // 草地
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size),
      new THREE.MeshLambertMaterial({ color: 0x3e7d44 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = this._shadowOn;
    this.group.add(grass);

    // 沙滩（南侧条带）
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, 50),
      new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.06, 1035);
    sand.receiveShadow = this._shadowOn;
    this.group.add(sand);

    // 海
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size + 800, 500),
      new THREE.MeshLambertMaterial({ color: 0x1f6fa8, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.10, 1330);
    this.group.add(water);

    // 海星岛地面
    const island = new THREE.Mesh(
      new THREE.PlaneGeometry(170, 170),
      new THREE.MeshLambertMaterial({ color: 0x4a8d52 }),
    );
    island.rotation.x = -Math.PI / 2;
    island.position.set(945, 0.12, 1125);
    island.receiveShadow = this._shadowOn;
    this.group.add(island);

    this._water = water;
  }

  _buildRoads(rnd, step, roadW, sideW) {
    const s = WORLD.size;
    const half = WORLD.half;
    const batch = new BoxBatch(false);
    const roadC = "#2b2f36";
    const sideC = "#8a8f98";
    const lineC = "#f2d16b";

    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // 人行道基座（整幅浅灰，压地块下）
    // 车行道（横/纵）
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = -half + i * step;
      batch.add(p, 0.03, 0, roadW, 0.02, s, 0, roadC);       // 纵向
      batch.add(0, 0.03, p, s, 0.02, roadW, 0, roadC);       // 横向
    }
    // 车道虚线
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = -half + i * step;
      for (let z = -half + 10; z < half - 10; z += 16) {
        batch.add(p, 0.05, z, 0.35, 0.01, 6, 0, lineC);
      }
      for (let x = -half + 10; x < half - 10; x += 16) {
        batch.add(x, 0.05, p, 6, 0.01, 0.35, 0, lineC);
      }
    }
    // 交叉口斑马线（四个街臂，条纹顺行人过街方向）
    const zebra = "#dfe3e8";
    const zOff = roadW / 2 + 1.2;
    for (let i = 1; i < WORLD.gridN; i++) {
      for (let k = 1; k < WORLD.gridN; k++) {
        const px = -half + i * step;
        const pz = -half + k * step;
        for (const sgn of [-1, 1]) {
          for (let s = 0; s < 6; s++) {
            const a = -7.2 + s * 2.9;
            batch.add(px + sgn * zOff, 0.06, pz + a, 2.4, 0.02, 0.8, 0, zebra);
            batch.add(px + a, 0.06, pz + sgn * zOff, 0.8, 0.02, 2.4, 0, zebra);
          }
        }
      }
    }
    // 人行道边条（沿道路两侧）
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = -half + i * step;
      batch.add(p + roadW / 2 + sideW / 2, 0.02, 0, sideW, 0.04, s, 0, sideC);
      batch.add(p - roadW / 2 - sideW / 2, 0.02, 0, sideW, 0.04, s, 0, sideC);
      batch.add(0, 0.02, p + roadW / 2 + sideW / 2, s, 0.04, sideW, 0, sideC);
      batch.add(0, 0.02, p - roadW / 2 - sideW / 2, s, 0.04, sideW, 0, sideC);
    }
    // 桥（海星岛）
    batch.add(900, 0.14, 1030, 12, 0.28, 60, 0, "#6a4a3a");

    const mesh = batch.build(roadMat, false);
    this.group.add(mesh);
    this._mats.road = roadMat;
  }

  _buildBlocks(rnd, step, roadW, sideW) {
    const half = WORLD.half;
    const s = WORLD.size;
    const buildingBatch = new BoxBatch(true);
    this._roofBatch = new BoxBatch(false);   // 屋顶檐口/设备（无窗UV，纯材质）
    this._bldNeon = new BoxBatch(false);    // 楼体霓虹条
    const palette = PALETTE.building;
    const downtownPalette = PALETTE.downtown;

    for (let bx = 0; bx < WORLD.gridN; bx++) {
      for (let bz = 0; bz < WORLD.gridN; bz++) {
        const cx = -half + (bx + 0.5) * step;
        const cz = -half + (bz + 0.5) * step;
        // 中心出生广场留空
        if (Math.abs(cx) < step * 0.6 && Math.abs(cz) < step * 0.6) continue;
        // 南排沙滩低层
        if (cz > 700) { this._beachBlock(buildingBatch, rnd, cx, cz, step, roadW); continue; }
        // 西区小哈瓦那
        if (cx < -400 && cx > -950) { this._havanaBlock(buildingBatch, rnd, cx, cz, step, roadW); continue; }
        // 东区港口
        if (cx > 800) { this._portBlock(buildingBatch, rnd, cx, cz, step, roadW); continue; }
        // 机场区域
        if (cx < -640 && cz < -640) { this._airportBlock(buildingBatch, rnd, cx, cz, step, roadW); continue; }
        // 市中心高楼
        if (Math.abs(cx) < 400 && Math.abs(cz) < 400) { this._downtownBlock(buildingBatch, rnd, cx, cz, step, roadW, downtownPalette); continue; }
        // 普通住宅区
        this._residentialBlock(buildingBatch, rnd, cx, cz, step, roadW, palette);
      }
    }

    // 建筑材质：map 墙面 + emissiveMap 夜窗
    let mapTex = null;
    let litTex = null;
    if (!this.headless) {
      const { wallCv, litCv } = makeWindowTextures(20260);
      mapTex = new THREE.CanvasTexture(wallCv);
      mapTex.colorSpace = THREE.SRGBColorSpace;
      mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
      mapTex.anisotropy = 2;
      litTex = new THREE.CanvasTexture(litCv);
      litTex.colorSpace = THREE.SRGBColorSpace;
      litTex.wrapS = litTex.wrapT = THREE.RepeatWrapping;
    }

    const mat = new THREE.MeshLambertMaterial({
      map: mapTex,
      emissiveMap: litTex,
      emissive: new THREE.Color(0xffc86e),
      emissiveIntensity: 0,
      vertexColors: true,
    });
    const mesh = buildingBatch.build(mat, true);
    this.group.add(mesh);
    this._mats.building = mat;

    // 屋顶细节（深色檐口 + 设备箱/水塔）
    const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.group.add(this._roofBatch.build(roofMat, true));
    // 楼体霓虹（基础色材质，晚上不参与 emissiveMap）
    const bldNeonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.group.add(this._bldNeon.build(bldNeonMat, false));
  }

  _blockInner(cx, cz, step, roadW) {
    const inner = step - roadW - 6;
    return {
      x0: cx - inner / 2,
      z0: cz - inner / 2,
      x1: cx + inner / 2,
      z1: cz + inner / 2,
      w: inner,
      d: inner,
    };
  }

  _addBuilding(batch, rnd, block, opt) {
    const w = opt.w;
    const d = opt.d;
    const h = opt.h;
    const x = clamp(opt.x, block.x0 + w / 2, block.x1 - w / 2);
    const z = clamp(opt.z, block.z0 + d / 2, block.z1 - d / 2);
    const color = opt.color || "#c8ccd4";
    batch.add(x, h / 2, z, w, h, d, 0, color);
    this.colliders.push({ minX: x - w / 2, minZ: z - d / 2, maxX: x + w / 2, maxZ: z + d / 2 });

    // 屋顶檐口（盖住带窗 UV 的顶面，视觉上更利落）
    const roof = this._roofBatch;
    roof.add(x, h + 0.12, z, w * 1.02, 0.24, d * 1.02, 0, "#3f444c");
    if (rnd() < 0.7) {
      roof.add(x + (rnd() - 0.5) * w * 0.45, h + 0.85, z + (rnd() - 0.5) * d * 0.45, 2.4, 1.4, 2.4, 0, "#50555e");
    }
    if (rnd() < 0.3) {
      roof.add(x + (rnd() - 0.5) * w * 0.4, h + 1.7, z + (rnd() - 0.5) * d * 0.4, 2.2, 2.2, 2.2, 0, "#6a7076");
    }
    // 一层遮阳棚（临街面）
    if (rnd() < 0.45) {
      const awn = ["#e0635a", "#3fa7a0", "#e8b34a", "#7a6fd0"][Math.floor(rnd() * 4)];
      batch.add(x, 2.5, z + d / 2 + 0.7, w * 0.72, 0.16, 1.4, 0, awn);
    }
    // 楼体霓虹竖牌
    if (rnd() < 0.3 && this._bldNeon) {
      const signColors = ["#ff4fa3", "#23d5e8", "#ffe066", "#9b5de5", "#3fe0b0"];
      const sc = signColors[Math.floor(rnd() * signColors.length)];
      const sw = Math.min(w * 0.75, 8);
      const dir = rnd() < 0.5 ? 1 : -1;
      this._bldNeon.add(x, 4.2, z + dir * (d / 2 + 0.3), sw, 1.4, 0.5, 0, sc);
    }
  }

  _downtownBlock(batch, rnd, cx, cz, step, roadW, palette) {
    const block = this._blockInner(cx, cz, step, roadW);
    // 1-2 栋高楼
    const n = rnd() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const w = (0.36 + rnd() * 0.22) * block.w;
      const d = (0.36 + rnd() * 0.22) * block.d;
      const h = 30 + rnd() * 60;
      const x = cx + (i === 0 ? -1 : 1) * (block.w / 5) + (rnd() - 0.5) * 8;
      const z = cz + (rnd() - 0.5) * (block.d / 3);
      const color = palette[Math.floor(rnd() * palette.length)];
      this._addBuilding(batch, rnd, block, { w, d, h, x, z, color });
    }
  }

  _residentialBlock(batch, rnd, cx, cz, step, roadW, palette) {
    const block = this._blockInner(cx, cz, step, roadW);
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const w = (0.25 + rnd() * 0.2) * block.w;
      const d = (0.25 + rnd() * 0.2) * block.d;
      const h = 8 + rnd() * 18;
      const x = block.x0 + w / 2 + rnd() * (block.w - w);
      const z = block.z0 + d / 2 + rnd() * (block.d - d);
      const color = palette[Math.floor(rnd() * palette.length)];
      this._addBuilding(batch, rnd, block, { w, d, h, x, z, color });
    }
  }

  _beachBlock(batch, rnd, cx, cz, step, roadW) {
    const block = this._blockInner(cx, cz, step, roadW);
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const w = (0.3 + rnd() * 0.25) * block.w;
      const d = (0.3 + rnd() * 0.25) * block.d;
      const h = 4 + rnd() * 8;
      const x = block.x0 + w / 2 + rnd() * (block.w - w);
      const z = block.z0 + d / 2 + rnd() * (block.d - d);
      const beach = ["#f2b5d4", "#f6d8a8", "#a8d8f0", "#ffb3b3", "#ffe0b0"];
      const color = beach[Math.floor(rnd() * beach.length)];
      this._addBuilding(batch, rnd, block, { w, d, h, x, z, color });
    }
  }

  _havanaBlock(batch, rnd, cx, cz, step, roadW) {
    const block = this._blockInner(cx, cz, step, roadW);
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const w = (0.3 + rnd() * 0.2) * block.w;
      const d = (0.3 + rnd() * 0.2) * block.d;
      const h = 5 + rnd() * 7;
      const x = block.x0 + w / 2 + rnd() * (block.w - w);
      const z = block.z0 + d / 2 + rnd() * (block.d - d);
      const hv = ["#f08080", "#ffd166", "#06d6a0", "#118ab2", "#ef476f", "#f78c6b"];
      const color = hv[Math.floor(rnd() * hv.length)];
      this._addBuilding(batch, rnd, block, { w, d, h, x, z, color });
    }
  }

  _portBlock(batch, rnd, cx, cz, step, roadW) {
    const block = this._blockInner(cx, cz, step, roadW);
    // 集装箱堆
    const containerColors = ["#e05545", "#3a86c8", "#4caf6d", "#e0a030", "#8a6bd8"];
    const rows = 2 + Math.floor(rnd() * 2);
    for (let rx = 0; rx < rows; rx++) {
      const cz2 = block.z0 + block.d * (0.25 + 0.25 * rx);
      const nC = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < nC; i++) {
        const w = 6;
        const d = 2.4;
        const x = block.x0 + 6 + i * 8 + rnd() * 2;
        if (x + w / 2 > block.x1) break;
        const stack = rnd() < 0.25 ? 2 : 1;
        for (let st = 0; st < stack; st++) {
          const color = containerColors[Math.floor(rnd() * containerColors.length)];
          batch.add(x, 1.3 + st * 2.6, cz2, w, 2.6, d, 0, color);
        }
        this.colliders.push({ minX: x - w / 2, minZ: cz2 - d / 2, maxX: x + w / 2, maxZ: cz2 + d / 2 });
      }
    }
    // 仓库一大一小
    this._addBuilding(batch, rnd, block, { w: block.w * 0.5, d: block.d * 0.4, h: 10, x: block.x1 - block.w * 0.3, z: block.z1 - block.d * 0.25, color: "#98a0a8" });
  }

  _airportBlock(batch, rnd, cx, cz, step, roadW) {
    // 机库与塔台
    if (Math.abs(cz + 960) < 60) {
      // 跑道在本批统一处理，这里放建筑
    }
    const block = this._blockInner(cx, cz, step, roadW);
    if (cz < -900 && cx < -950) {
      // 塔台
      batch.add(cx, 20, cz, 8, 40, 8, 0, "#8a94a6");
      batch.add(cx, 41, cz, 12, 3, 12, 0, "#3a4456");
      this.colliders.push({ minX: cx - 6, minZ: cz - 6, maxX: cx + 6, maxZ: cz + 6 });
    }
  }

  _buildBeach(rnd, step) {
    // 跑道（深色长条 + 白线）
    const batch = new BoxBatch(false);
    batch.add(-940, 0.08, -980, 480, 0.04, 46, 0, "#23262c");
    for (let x = -1160; x < -720; x += 24) {
      batch.add(x, 0.10, -980, 12, 0.02, 0.6, 0, "#e8e8e8");
    }
    // 机场机库
    batch.add(-780, 5, -870, 40, 10, 24, 0, "#7a8494");
    batch.add(-700, 4, -880, 30, 8, 18, 0, "#8a94a4");
    const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true);
    this.group.add(mesh);
    this.colliders.push(
      { minX: -985, minZ: -885, maxX: -755, maxZ: -855 },
      { minX: -720, minZ: -895, maxX: -680, maxZ: -870 },
    );
  }

  _buildIsland(rnd) {
    const batch = new BoxBatch(false);
    const palette = ["#fdf2f8", "#fbe4ef", "#f8d0e0", "#fff3e0", "#f0e8f8"];
    // 白色围墙
    const half = 70;
    const cx = 945;
    const cz = 1125;
    batch.add(cx, 1.1, cz - half, half * 2 + 4, 2.2, 2, 0, "#e8e0d8");
    batch.add(cx, 1.1, cz + half, half * 2 + 4, 2.2, 2, 0, "#e8e0d8");
    batch.add(cx - half, 1.1, cz, 2, 2.2, half * 2 + 4, 0, "#e8e0d8");
    batch.add(cx + half, 1.1, cz, 2, 2.2, half * 2 + 4, 0, "#e8e0d8");
    // 别墅
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(ang) * (half * 0.45);
      const z = cz + Math.sin(ang) * (half * 0.45);
      const color = palette[i % palette.length];
      batch.add(x, 4, z, 16, 8, 14, ang, color);
      batch.add(x, 9, z, 10, 2, 9, ang, "#d8c8d8");
      this.colliders.push({ minX: x - 8, minZ: z - 7, maxX: x + 8, maxZ: z + 7 });
    }
    // 泳池
    batch.add(cx, 0.08, cz, 18, 0.06, 10, 0, "#3fd0e0");
    const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true);
    this.group.add(mesh);
  }

  _buildPalms(rnd, step) {
    const half = WORLD.half;
    const positions = [];
    // 海滩带 + 随机街区
    for (let i = 0; i < 90; i++) {
      const x = -half + 40 + rnd() * (WORLD.size - 80);
      const z = 930 + rnd() * 60;
      positions.push([x, z]);
    }
    for (let i = 0; i < 60; i++) {
      const x = -half + 40 + rnd() * (WORLD.size - 80);
      const z = -half + 40 + rnd() * (WORLD.size - 80);
      positions.push([x, z]);
    }
    // 海星岛
    for (let i = 0; i < 8; i++) {
      const ang = rnd() * Math.PI * 2;
      positions.push([945 + Math.cos(ang) * 40, 1125 + Math.sin(ang) * 40]);
    }

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    const leafGeo = new THREE.ConeGeometry(3.2, 2.8, 7);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
    const m4 = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m4.makeTranslation(x, 4.5, z);
      trunkInst.setMatrixAt(i, m4);
      const s = 0.8 + rnd() * 0.5;
      m4.makeScale(s, s, s).setPosition(x, 9.8 * s, z);
      leafInst.setMatrixAt(i, m4);
    });
    trunkInst.castShadow = leafInst.castShadow = this._shadowOn;
    this.group.add(trunkInst, leafInst);
    this._palmTrunk = trunkInst;
  }

  _buildStreetLights(rnd, step) {
    const half = WORLD.half;
    const positions = [];
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = -half + i * step;
      for (let k = -half + 60; k < half - 40; k += 90) {
        positions.push([p + WORLD.roadW / 2 + 1.5, k]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe09a, emissiveIntensity: 0 });
    const headInst = new THREE.InstancedMesh(headGeo, headMat, positions.length);
    const m4 = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m4.makeTranslation(x, 3.5, z);
      poleInst.setMatrixAt(i, m4);
      m4.makeTranslation(x, 7.0, z);
      headInst.setMatrixAt(i, m4);
    });
    this.group.add(poleInst, headInst);
    this._mats.lampHead = headMat;
  }

  _buildNeon(rnd, step) {
    const half = WORLD.half;
    const signs = [
      { x: -120, z: 60, w: 22, h: 6, color: "#ff4fa3" },
      { x: 220, z: -180, w: 18, h: 8, color: "#23d5e8" },
      { x: 340, z: 260, w: 26, h: 5, color: "#ffe066" },
      { x: -520, z: -240, w: 20, h: 6, color: "#9b5de5" },
      { x: -460, z: 300, w: 16, h: 5, color: "#3fe0b0" },
      { x: 620, z: -380, w: 24, h: 7, color: "#ff8c42" },
      { x: -90, z: -460, w: 20, h: 6, color: "#ff4fa3" },
      { x: 420, z: 480, w: 18, h: 5, color: "#23d5e8" },
      { x: -760, z: 560, w: 22, h: 6, color: "#ffe066" },
      { x: 120, z: 820, w: 24, h: 6, color: "#ff4fa3" },
      { x: 945, z: 1125, w: 16, h: 5, color: "#ffe066" },
    ];
    const batch = new BoxBatch(false);
    const glowBatch = new BoxBatch(false);
    for (const s of signs) {
      batch.add(s.x, 4, s.z, s.w, s.h, 0.6, 0, s.color);
      glowBatch.add(s.x, 4, s.z, s.w * 1.25, s.h * 1.5, 0.2, 0, s.color);
      this.colliders.push({ minX: s.x - s.w / 2, minZ: s.z - 0.4, maxX: s.x + s.w / 2, maxZ: s.z + 0.4 });
    }
    this._mats.neon = new THREE.MeshBasicMaterial({ vertexColors: true });
    this._mats.neonGlow = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.group.add(batch.build(this._mats.neon, false));
    this.group.add(glowBatch.build(this._mats.neonGlow, false));
  }

  // 行人路点：沿人行道（道路外侧）采样
  _buildPedPoints(step, roadW, sideW) {
    const half = WORLD.half;
    const off = roadW / 2 + sideW + 1.2;
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = -half + i * step;
      for (let k = -half + 30; k < half - 30; k += 55) {
        if (k > 900) continue; // 海滩带不去
        this.pedPoints.push({ x: p + off, z: k });
        this.pedPoints.push({ x: p - off, z: k });
        this.pedPoints.push({ x: k, z: p + off });
        this.pedPoints.push({ x: k, z: p - off });
      }
    }
    // 海星岛内部点
    this.pedPoints.push(
      { x: 930, z: 1110 }, { x: 960, z: 1140 }, { x: 945, z: 1125 },
    );
  }

  _buildParking(rnd, step, roadW) {
    const half = WORLD.half;
    let count = 0;
    for (let i = 0; i <= WORLD.gridN && count < 70; i++) {
      const p = -half + i * step;
      for (let k = -half + 50; k < half - 60 && count < 70; k += 70) {
        if (rnd() < 0.55) continue;
        const side = rnd() < 0.5 ? 1 : -1;
        // 沿道路停放（右侧通行）：东侧朝 +Z(0)，西侧朝 -Z(π)
        this.parkingSpots.push({
          x: p + side * (roadW / 2 + 2.2),
          z: k + (rnd() - 0.5) * 30,
          angle: side > 0 ? 0 : Math.PI,
        });
        count++;
      }
    }
  }

  // ================================================================ 小地图
  _buildMinimap() {
    if (this.headless) { this.minimapCv = null; return; } // Node 自测环境无 canvas API
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const ctx = cv.getContext("2d");
    const half = WORLD.half;
    const toPx = (wx, wz) => [(wx + half) / WORLD.size * 512, (wz + half) / WORLD.size * 512];

    // 海
    ctx.fillStyle = "#16406b";
    ctx.fillRect(0, 0, 512, 512);
    // 陆地
    ctx.fillStyle = "#2f5f38";
    ctx.fillRect(0, 0, 512, toPx(0, 1010)[1]);
    // 沙滩
    ctx.fillStyle = "#cdbb8d";
    const sandY = toPx(0, 1010)[1];
    const sandH = toPx(0, 1060)[1] - sandY;
    ctx.fillRect(0, sandY, 512, sandH);
    // 海星岛
    const [ix, iy] = toPx(945, 1125);
    ctx.fillStyle = "#3e7d44";
    ctx.fillRect(ix - 19, iy - 19, 38, 38);
    // 道路
    ctx.strokeStyle = "#4a4f58";
    ctx.lineWidth = Math.max(2, WORLD.roadW / WORLD.size * 512);
    for (let i = 0; i <= WORLD.gridN; i++) {
      const p = (-half + i * (WORLD.size / WORLD.gridN) + half) / WORLD.size * 512;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, toPx(0, 1010)[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
    // 桥
    ctx.strokeStyle = "#6a5a48";
    ctx.lineWidth = 3;
    const [bx, by1] = toPx(900, 1010);
    const [, by2] = toPx(900, 1100);
    ctx.beginPath();
    ctx.moveTo(bx, by1);
    ctx.lineTo(bx, by2);
    ctx.stroke();
    // 区域标签
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    const label = (name, x, z, color) => {
      const [px, py] = toPx(x, z);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(name, px + 1, py + 1);
      ctx.fillStyle = color;
      ctx.fillText(name, px, py);
    };
    label("市中心", 0, 0, "#cfe0ff");
    label("小哈瓦那", -700, 100, "#ffd0c0");
    label("维基港", 1000, 300, "#d0e8b0");
    label("机场", -920, -940, "#d0d8e8");
    label("海星岛", 945, 1125, "#ffd8ec");
    label("海滨", 0, 860, "#a8e8f0");

    this.minimapCv = cv;
  }

  // ================================================================ 昼夜联动
  applyNight(f) {
    this._nightF = f;
    if (this._mats.building) this._mats.building.emissiveIntensity = 0.55 * f;
    if (this._mats.lampHead) this._mats.lampHead.emissiveIntensity = 1.5 * f;
    if (this._mats.neonGlow) this._mats.neonGlow.opacity = 0.32 * f;
  }

  update(dt, camPos) {
    // 水面轻微波光：透明度和颜色随时间摆动（极低成本）
    if (this._water && !this.headless) {
      const t = performance.now() * 0.001;
      this._water.material.opacity = 0.88 + Math.sin(t * 0.6) * 0.04;
    }
    // 霓虹微闪
    if (this._mats.neonGlow && this._nightF > 0) {
      const t = performance.now() * 0.004;
      this._mats.neonGlow.opacity = (0.26 + Math.sin(t) * 0.06) * this._nightF;
    }
  }

  // 供车辆/行人使用的碰撞辅助
  collideCircle(x, z, r) {
    let hit = null;
    for (const b of this.colliders) {
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      const nx = clamp(x, b.minX, b.maxX);
      const nz = clamp(z, b.minZ, b.maxZ);
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = { box: b, nx, nz, dx, dz, d: Math.sqrt(d2) || 0.0001 };
        break;
      }
    }
    return hit;
  }
}

// ================================================================ 工厂（供 game.js 调用）
export function buildWorld(game) {
  const city = new City();
  city.headless = game.headless;
  city._shadowOn = !game.headless;
  city.build(game.scene);
  // 主要出生点：中心广场
  city.spawnPoint = { x: 0, z: 0 };
  return city;
}
