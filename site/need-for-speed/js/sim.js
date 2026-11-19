/**
 * 极品飞车 · 纯逻辑模拟层（不依赖 three / DOM，headless 可测）
 * 包含：街机车辆物理（加速/刹车/转向/漂移/氮气）、赛道样条采样、投影与检查点。
 */

// ---------------------------------------------------------------- 车辆定义
export const CAR_DEFS = {
  street: { name: "Street", accel: 20, maxSpeed: 55, brake: 34, dragK: 0.35, steerRate: 2.1, gripNormal: 7.5, gripDrift: 1.9, nitroAccel: 26, nitroMaxAdd: 18, mass: 1.0 },
  muscle: { name: "Muscle", accel: 26, maxSpeed: 60, brake: 30, dragK: 0.42, steerRate: 1.7, gripNormal: 6.2, gripDrift: 1.7, nitroAccel: 32, nitroMaxAdd: 20, mass: 1.2 },
  exotic: { name: "Exotic", accel: 32, maxSpeed: 72, brake: 40, dragK: 0.30, steerRate: 2.5, gripNormal: 8.6, gripDrift: 2.2, nitroAccel: 34, nitroMaxAdd: 22, mass: 0.9 },
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/**
 * 街机车辆模型：
 * - 速度向量分解为 前向/侧向；侧向按抓地力指数衰减（漂移时抓地骤降）
 * - 转向速率随速度收窄（原地几乎不能打方向，高速不能乱打）
 * - 氮气：提升加速度与极速上限
 */
export class CarSim {
  constructor(defId = "street") {
    this.def = CAR_DEFS[defId];
    this.x = 0; this.z = 0; this.y = 0;
    this.angle = 0;          // 朝向（0 = +Z）
    this.vx = 0; this.vz = 0;
    this.speed = 0;          // 有符号前向速度（kmh 由 m/s 换算）
    this.steerVis = 0;       // 前轮视觉转角
    this.slip = 0;           // 滑移角（rad，漂移量）
    this.drifting = false;
    this.nitro = 1;          // 0..1 氮气余量
    this.nitroActive = false;
    this.hp = 100;
    this._airT = 0;
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }

  update(dt, input, env = {}) {
    const d = this.def;
    const nitroAvail = env.nitroAvailable === false ? false : true;
    this.nitroActive = !!input.nitro && this.nitro > 0.02 && this.speed > 4 && nitroAvail;
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - dt * 0.35);

    // 视角：先分解旧朝向
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    // 当前速度向量 → 前向/侧向分量
    let vf = this.vx * fx + this.vz * fz;          // 前向
    let vl = this.vx * fz - this.vz * fx;          // 侧向（右为正）
    this.speed = vf;

    // 漂移判定：手刹 + 有速度
    this.drifting = !!input.handbrake && Math.abs(vf) > 6 && Math.abs(input.steer) > 0.05;

    // 抓地力：漂移时骤减 → 侧向衰减变慢 → 车尾甩出
    const grip = this.drifting ? d.gripDrift : d.gripNormal;
    vl *= Math.exp(-grip * dt);

    // 纵向：油门/刹车/阻力
    const drag = d.dragK * vf * Math.abs(vf) * 0.02 + 0.6 * Math.sign(vf);
    let acc = 0;
    const maxSpd = d.maxSpeed + (this.nitroActive ? d.nitroMaxAdd : 0);
    if (input.throttle > 0 && vf < maxSpd) {
      acc += input.throttle * d.accel * (this.nitroActive ? 1 : 0.82);
    }
    if (this.nitroActive) acc += d.nitroAccel * 0.6;
    if (input.brake > 0) {
      acc -= input.brake * (vf > 1 ? d.brake : d.accel * 0.4); // 倒车限速由 dragK 控制
    }
    acc -= drag;
    vf += acc * dt;
    if (vf < -10) vf = -10; // 倒车上限

    // 关键：速度按【旧朝向】重组（不随新朝向瞬转），
    // 侧向衰减让速度方向追赶车头的速度 → 漂移时有滑移角
    this.vx = fx * vf + fz * vl;
    this.vz = fz * vf - fx * vl;

    // 转向：速度越快转角越小；漂移时传动比放大（但随滑移角自适应收敛，防止打转）
    // 注意符号：车头前向 (sin a, cos a)，向右转（steer=+1）需让 a 减小
    const spdK = clamp(Math.abs(vf) / 8, 0, 1) * (1 - clamp(Math.abs(vf) / (maxSpd * 1.6), 0, 0.62));
    const steerIn = clamp(input.steer, -1, 1);
    this.steerVis = lerp(this.steerVis, -steerIn * 0.42, clamp(8 * dt, 0, 1));
    const driftSteerK = this.drifting ? 1.3 / (1 + Math.abs(this.slip) * 2.0) : 1;
    this.angle = wrapAngle(this.angle - steerIn * d.steerRate * spdK * driftSteerK * dt * (vf >= 0 ? 1 : -1));

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 滑移角
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.5) {
      const velAngle = Math.atan2(this.vx, this.vz);
      this.slip = wrapAngle(velAngle - this.angle);
      // 防甩尾稳定：滑移角过大时车头被"拉回"速度方向，避免无操作 spin（街机手感）
      const over = Math.abs(this.slip) - 0.55;
      if (over > 0) {
        const k = clamp(over * 2.2, 0, 0.8) * clamp(6 * dt, 0, 1);
        this.angle = wrapAngle(this.angle + (velAngle - this.angle) * k);
      }
    } else {
      this.slip = 0;
    }
    // 漂移集气（QQ 手感：漂移越快回气越多）
    if (this.drifting && Math.abs(this.slip) > 0.12) {
      this.nitro = Math.min(1, this.nitro + dt * 0.16);
    }
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------- 赛道
/**
 * 由控制点生成闭环样条采样。
 * @returns {{ samples: Array<{x,z,tx,tz,nx,nz,s}>, length: number, halfWidth: number }}
 *  samples[i]：{ x,z 中心点, tx,tz 切线, nx,nz 右法线, s 弧长 }
 */
export function makeTrack(points, { sampleStep = 4, halfWidth = 9, samplesPerMeter = 0.5 } = {}) {
  const n = points.length;
  // Catmull-Rom 闭环采样
  const raw = [];
  const segs = n; // 每对相邻控制点一段
  const per = Math.max(8, Math.round(60 / segs));
  const P = (i) => points[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      raw.push([x, z]);
    }
  }
  // 弧长重采样（保持均匀）
  const lengths = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1];
  const N = Math.max(64, Math.round(total / (sampleStep || 4)));
  const samples = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / N) * total;
    while (k < lengths.length - 2 && lengths[k + 1] < target) k++;
    const a = raw[k % raw.length], b = raw[(k + 1) % raw.length];
    const span = lengths[k + 1] - lengths[k] || 1;
    const t = (target - lengths[k]) / span;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // 右法线（XZ 平面，指向行进方向右侧）
    const nx = tz, nz = -tx;
    samples.push({ x, z, tx, tz, nx, nz, s: target });
  }
  return { samples, length: total, halfWidth };
}

/**
 * 将世界坐标投影到赛道：返回 { s, lateral, i, dist }
 * lateral > 0 表示在行进方向右侧
 */
export function projectToTrack(track, x, z, hintIdx = -1) {
  const S = track.samples;
  const N = S.length;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { s: 0, lateral: 0, i: 0, dist: track.length };
  let best = -1, bestD = Infinity;
  if (hintIdx >= 0) {
    // 局部窗口搜索（车不会瞬移）
    const W = 40;
    for (let k = -W; k <= W; k++) {
      const i = ((hintIdx + k) % N + N) % N;
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    // 若局部最优也很远（>6m），全局重搜（防迷路）
    if (Math.sqrt(bestD) > 6) { best = -1; bestD = Infinity; }
  }
  if (best < 0) {
    for (let i = 0; i < N; i++) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  const sm = S[best];
  const dx = x - sm.x, dz = z - sm.z;
  const lateral = dx * sm.nx + dz * sm.nz;
  return { s: sm.s, lateral, i: best, dist: Math.sqrt(bestD) };
}

/** 检查点序列：s 从 0..length 均分 */
export function buildCheckpoints(track, count = 12) {
  const cps = [];
  for (let i = 0; i < count; i++) {
    cps.push({ s: (i / count) * track.length, index: Math.floor((i / count) * track.samples.length) });
  }
  return cps;
}
