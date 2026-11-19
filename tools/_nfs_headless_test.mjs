// 极品飞车 M1 原型 headless 自测（纯逻辑层，无 DOM）
import { CarSim, makeTrack, projectToTrack, buildCheckpoints, CAR_DEFS } from "../site/need-for-speed/js/sim.js";

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "OK  " : "FAIL") + " " + msg); if (!cond) fail++; };
const DT = 1 / 60;

// 1) 赛道生成
const points = [[0, 0], [300, -10], [450, 90], [430, 300], [260, 420], [20, 400], [-190, 430], [-380, 330], [-430, 120], [-280, -40], [-120, -40]];
const track = makeTrack(points, { sampleStep: 4, halfWidth: 11 });
ok(track.samples.length > 400, `track samples = ${track.samples.length}`);
ok(track.length > 2000 && track.length < 5000, `track length = ${track.length.toFixed(0)}m`);
ok(track.samples.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.s)), "samples finite");
// 采样均匀：相邻间距接近
const d01 = Math.hypot(track.samples[1].x - track.samples[0].x, track.samples[1].z - track.samples[0].z);
ok(d01 > 3 && d01 < 5.5, `sample spacing = ${d01.toFixed(2)}m`);

// 2) 投影
const s50 = track.samples[Math.floor(track.samples.length / 2)];
const p = projectToTrack(track, s50.x + 2, s50.z - 1);
ok(Math.abs(p.s - s50.s) < 6, `project s within 6m (got ${(p.s - s50.s).toFixed(2)})`);
ok(Math.abs(p.lateral) > 0.5, `lateral detected = ${p.lateral.toFixed(2)}`);
ok(p.i > 0 && p.i < track.samples.length, `index in range`);

// 3) 加速 / 极速 / 刹车
{
  const car = new CarSim("street");
  for (let i = 0; i < 60 * 4; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  ok(car.kmh > 120, `4s 0-100+ km/h = ${car.kmh.toFixed(0)}`);
  const v4 = car.speed;
  for (let i = 0; i < 60 * 8; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  ok(car.speed <= CAR_DEFS.street.maxSpeed + 1.5, `top speed capped = ${car.kmh.toFixed(0)} km/h`);
  for (let i = 0; i < 60 * 3; i++) car.update(DT, { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false });
  ok(car.speed < 4, `brake to near stop = ${car.speed.toFixed(1)} m/s`);
}

// 4) 转向稳定性 + 不翻车（有限角度）
{
  const car = new CarSim("street");
  for (let i = 0; i < 90; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  for (let i = 0; i < 90; i++) car.update(DT, { throttle: 1, brake: 0, steer: 1, handbrake: false, nitro: false });
  ok(Number.isFinite(car.angle) && Math.abs(car.angle) < 8, `turn keeps sane angle = ${car.angle.toFixed(2)} rad`);
  ok(car.kmh > 60, `still fast while turning = ${car.kmh.toFixed(0)} km/h`);
}

// 5) 漂移：滑移角 + 集气
{
  const car = new CarSim("street");
  for (let i = 0; i < 120; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  car.nitro = 0;
  for (let i = 0; i < 45; i++) car.update(DT, { throttle: 1, brake: 0, steer: 1, handbrake: true, nitro: false });
  ok(car.drifting && Math.abs(car.slip) > 0.14, `drift slip = ${car.slip.toFixed(2)} rad`);
  ok(car.nitro > 0.04, `drift charges nitro = ${car.nitro.toFixed(2)}`);
}

// 6) 氮气：更快 + 消耗
{
  const car = new CarSim("street");
  for (let i = 0; i < 90; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  const before = car.kmh;
  for (let i = 0; i < 90; i++) car.update(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: true });
  ok(car.kmh > before + 8, `nitro adds speed (+${(car.kmh - before).toFixed(0)} km/h)`);
  ok(car.nitro < 0.99, `nitro drains = ${car.nitro.toFixed(2)}`);
}

// 7) 倒开限速
{
  const car = new CarSim("street");
  for (let i = 0; i < 60 * 4; i++) car.update(DT, { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false });
  ok(car.speed >= -10.5, `reverse capped = ${car.speed.toFixed(1)} m/s`);
}

// 8) 检查点工具
{
  const cps = buildCheckpoints(track, 12);
  ok(cps.length === 12 && cps[0].s === 0, "checkpoints built");
  let mono = true;
  for (let i = 1; i < cps.length; i++) if (cps[i].s <= cps[i - 1].s) mono = false;
  ok(mono, "checkpoint s monotonic");
}

// 9) 巡线闭环（AI 雏形：沿采样 lookahead 打方向 → 累计前进一整圈）
{
  const car = new CarSim("street");
  const start = track.samples[0];
  car.x = start.x; car.z = start.z;
  car.angle = Math.atan2(start.tx, start.tz);
  let hint = 0;
  let progress = 0, prevS = null, laps = 0;
  const idx = (i) => ((i % track.samples.length) + track.samples.length) % track.samples.length;
  for (let t = 0; t < 240; t += DT) {
    const pr = projectToTrack(track, car.x, car.z, hint);
    hint = pr.i;
    // 前瞻采样
    const look = track.samples[idx(hint + 40)];
    const desired = Math.atan2(look.x - car.x, look.z - car.z);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const slow = Math.abs(diff) < 0.35;
    car.update(DT, { throttle: slow ? 1 : 0.45, brake: 0, steer, handbrake: false, nitro: false });
    if (prevS !== null) {
      let ds = pr.s - prevS;
      if (ds < -track.length / 2) ds += track.length;
      if (ds > track.length / 2) ds -= track.length;
      progress += ds;
    }
    prevS = pr.s;
    if (progress >= track.length) { laps++; progress -= track.length; break; }
  }
  ok(laps >= 1, `AI completed a full lap in ${(240).toFixed(0)}s budget (progress ${progress.toFixed(0)}m)`);
}

console.log(fail === 0 ? "\nNFS M1 HEADLESS TEST PASS" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
