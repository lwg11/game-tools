/**
 * 漂移轮胎痕：环形缓冲动态贴带（一次 draw call）。
 * 后轮位置超过阈值时记录线段，侧向偏移两级（可见的"拖痕"）。
 */
import * as THREE from "../lib/three.module.min.js";

export class SkidMarks {
  constructor(scene, maxSegments = 800) {
    this.max = maxSegments;
    this.count = 0; // 已写入段数（环形）
    const verts = new Float32Array(maxSegments * 4 * 3);
    // 平移到地面下，避免初始全黑
    for (let i = 0; i < verts.length; i += 3) verts[i + 1] = -50;
    const idx = new Uint32Array(maxSegments * 6);
    for (let i = 0; i < maxSegments; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(verts, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({ color: 0x0d0d0d, transparent: true, opacity: 0.55, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /**
   * 追加一段（一根轮迹）
   */
  add(x0, z0, x1, z1, half = 0.16, y = 0.035) {
    // 起点/终点沿行进方向法线各展半个轮宽
    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return;
    dx /= len; dz /= len;
    const nx = dz, nz = -dx; // 线段法线
    const s = this.count % this.max;
    const o = s * 12;
    const arr = this.posAttr.array;
    arr[o] = x0 - nx * half; arr[o + 1] = y; arr[o + 2] = z0 - nz * half;
    arr[o + 3] = x0 + nx * half; arr[o + 4] = y; arr[o + 5] = z0 + nz * half;
    arr[o + 6] = x1 - nx * half; arr[o + 7] = y; arr[o + 8] = z1 - nz * half;
    arr[o + 9] = x1 + nx * half; arr[o + 10] = y; arr[o + 11] = z1 + nz * half;
    this.count++;
    this.posAttr.needsUpdate = true;
  }

  reset() {
    for (let i = 1; i < this.posAttr.array.length; i += 3) this.posAttr.array[i] = -50;
    this.posAttr.needsUpdate = true;
    this.count = 0;
  }
}
