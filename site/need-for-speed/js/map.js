/**
 * 赛道小地图（M5）：静态底图（赛道+起跑线）离屏绘制一次，
 * 每帧叠加 玩家/AI/车流/警车 位置点。
 */
export class TrackMap {
  constructor(canvas, track) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.track = track;
    this.pad = 10;
    this._buildStatic();
  }

  _bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.track.samples) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
  }

  _buildStatic() {
    const cv = this.cv;
    const w = cv.width, h = cv.height;
    const b = this._bounds();
    const bw = b.maxX - b.minX || 1;
    const bh = b.maxZ - b.minZ || 1;
    const scale = Math.min((w - this.pad * 2) / bw, (h - this.pad * 2) / bh);
    const ox = (w - bw * scale) / 2 - b.minX * scale;
    const oz = (h - bh * scale) / 2 - b.minZ * scale;
    this._scale = scale; this._ox = ox; this._oz = oz;

    const s = document.createElement("canvas");
    s.width = w; s.height = h;
    const c = s.getContext("2d");
    c.fillStyle = "rgba(8,10,18,0.72)";
    c.fillRect(0, 0, w, h);
    const px = (x) => x * scale + ox;
    const pz = (z) => z * scale + oz;
    // 赛道：外描边 + 路面
    c.lineJoin = c.lineCap = "round";
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = this.track.halfWidth * 2 * scale + 2;
    c.beginPath();
    this.track.samples.forEach((p, i) => { i === 0 ? c.moveTo(px(p.x), pz(p.z)) : c.lineTo(px(p.x), pz(p.z)); });
    c.closePath();
    c.stroke();
    c.strokeStyle = "#3c4150";
    c.lineWidth = this.track.halfWidth * 2 * scale;
    c.stroke();
    // 起跑线
    const s0 = this.track.samples[2];
    c.strokeStyle = "#ffd166";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(px(s0.x + s0.nx * this.track.halfWidth), pz(s0.z + s0.nz * this.track.halfWidth));
    c.lineTo(px(s0.x - s0.nx * this.track.halfWidth), pz(s0.z - s0.nz * this.track.halfWidth));
    c.stroke();
    this._static = s;
  }

  /**
   * @param {{x,z}} player
   * @param {Array} cars AI 赛车 [{x,z}]
   * @param {Array} others 其他点（车流/警车）[{x,z,color}]
   */
  draw(player, cars = [], others = []) {
    const c = this.ctx;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    if (this._static) c.drawImage(this._static, 0, 0);
    const px = (x) => x * this._scale + this._ox;
    const pz = (z) => z * this._scale + this._oz;
    // 车流/特殊点
    for (const o of others) {
      c.fillStyle = o.color || "#cfd6e4";
      c.beginPath();
      c.arc(px(o.x), pz(o.z), o.r || 2.5, 0, Math.PI * 2);
      c.fill();
    }
    // AI
    c.fillStyle = "#ff5a5a";
    for (const a of cars) {
      c.beginPath();
      c.arc(px(a.x), pz(a.z), 3.2, 0, Math.PI * 2);
      c.fill();
    }
    // 玩家（金点 + 白圈）
    if (player) {
      c.fillStyle = "#ffd166";
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(px(player.x), pz(player.z), 4.2, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
}
