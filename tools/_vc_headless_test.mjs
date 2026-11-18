// 临时 headless 启动测试：城市 + 玩家 + 载具 冒烟
function def(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch { /* ignore */ }
}

def("window", globalThis);
def("self", globalThis);
def("innerWidth", 1280);
def("innerHeight", 720);
def("devicePixelRatio", 1);
def("location", { href: "http://localhost/games/vice-city/", origin: "http://localhost" });
def("navigator", { userAgent: "headless", maxTouchPoints: 0 });
def("screen", { width: 1280, height: 720, orientation: { type: "landscape" } });
def("history", { pushState() {}, replaceState() {} });
def("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
def("performance", (await import("node:perf_hooks")).performance);

const _ls = new Map();
def("localStorage", {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
  clear: () => _ls.clear(),
});

const listeners = new Map();
def("addEventListener", (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); });
def("removeEventListener", () => {});
def("dispatchEvent", () => true);
def("fetch", async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" }));

function makeEl() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, querySelector: () => makeEl(), querySelectorAll: () => [],
    textContent: "", innerHTML: "", value: "", offsetWidth: 0, offsetHeight: 0,
  };
}
def("document", {
  readyState: "loading",
  documentElement: makeEl(),
  body: makeEl(),
  head: makeEl(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  addEventListener() {}, removeEventListener() {},
});

def("AudioContext", class {});
def("webkitAudioContext", class {});
def("requestAnimationFrame", (fn) => setTimeout(() => fn(performance.now()), 16));
def("cancelAnimationFrame", (id) => clearTimeout(id));

const { bootHeadless } = await import("../site/vice-city/js/game.js");

const game = await bootHeadless();
console.log("boot ok");

const city = game.world;
const player = game.player;
const vs = game.vehicles;
if (!city || !player || !vs) throw new Error("missing modules");
console.log("city colliders:", city.colliders.length, "| cars:", vs.cars.length);
if (vs.cars.length < 10) throw new Error("too few cars: " + vs.cars.length);

// ---- 城市断言（保持 commit 2 覆盖）
if (city.colliders.length < 50) throw new Error("too few colliders");
if (city.pedPoints.length < 100) throw new Error("too few ped points");
for (const [x, z, name] of [[0, 0, "市中心"], [-700, 100, "小哈瓦那"], [1000, 300, "维基港"], [945, 1125, "海星岛"], [-920, -940, "国际机场"], [0, 860, "海滨"]]) {
  const got = city.zoneAt(x, z);
  if (got !== name) throw new Error(`zoneAt(${x},${z}) = ${got}, want ${name}`);
}

// ---- 载具断言
const car = vs.cars[0];
const startX = car.pos.x;
const startZ = car.pos.z;
// 把玩家传送到车旁
player.pos.set(car.pos.x + 2, 0, car.pos.z);
// 初次 update 会建立 prevE
game.input.keys["KeyE"] = false;
game.update(1 / 60);
game.input.keys["KeyE"] = true;
game.update(1 / 60);
game.input.keys["KeyE"] = false;
if (!player.inVehicle) throw new Error("enter vehicle failed");
console.log("entered vehicle:", car.def.name, "occupied =", car.occupiedBy);

// 向前驾驶
game.input.keys["KeyW"] = true;
for (let i = 0; i < 240; i++) game.update(1 / 60);
game.input.keys["KeyW"] = false;
const moved = Math.hypot(car.pos.x - startX, car.pos.z - startZ);
console.log("car moved:", moved.toFixed(1), "m | kmh =", car.kmh.toFixed(1), "| hp =", car.hp.toFixed(0));
if (moved < 5) throw new Error("car did not move: " + moved);
if (!Number.isFinite(car.pos.x) || !Number.isFinite(car.pos.z)) throw new Error("NaN car pos");

// 手刹漂移：加速中按空格 30 帧不爆炸
game.input.keys["KeyW"] = true;
for (let i = 0; i < 60; i++) game.update(1 / 60);
game.input.keys["Space"] = true;
for (let i = 0; i < 30; i++) game.update(1 / 60);
game.input.keys["Space"] = false;
game.input.keys["KeyW"] = false;

// 下车
game.input.keys["KeyE"] = true;
game.update(1 / 60);
game.input.keys["KeyE"] = false;
game.update(1 / 60); // 清空 prevE，edge 重新可用
if (player.inVehicle) throw new Error("exit vehicle failed");
console.log("exited vehicle, player pos:", player.pos.x.toFixed(1), player.pos.z.toFixed(1));

// 朝向建筑撞：找最近碰撞体并向它开
const b = city.colliders[0];
// 把玩家放进一辆车并对准碰撞体方向
const dx = (b.minX + b.maxX) / 2 - car.pos.x;
const dz = (b.minZ + b.maxZ) / 2 - car.pos.z;
car.pos.x += dx - Math.sign(dx) * 20;
car.pos.z += dz - Math.sign(dz) * 20;
car.angle = Math.atan2(b.minX + b.maxX - 2 * car.pos.x, b.minZ + b.maxZ - 2 * car.pos.z);
car.vx = car.vz = 0;
player.pos.set(car.pos.x + 2, 0, car.pos.z);
game.input.keys["KeyE"] = true;
game.update(1 / 60);
game.input.keys["KeyE"] = false;
game.update(1 / 60);
if (!player.inVehicle) throw new Error("re-enter failed");
game.input.keys["KeyW"] = true;
for (let i = 0; i < 180; i++) game.update(1 / 60);
game.input.keys["KeyW"] = false;
const inside = city.collideCircle(car.pos.x, car.pos.z, 0.3);
if (inside) throw new Error("car tunneled into building");
console.log("collision containment ok; hp =", car.hp.toFixed(0));

// 昼夜推进
game.worldHour = 22;
game._applyDayNight();
if (city._nightF < 0.9) throw new Error("nightFactor too low at 22h");

// ---- 行人/车流/警察
if (game.peds.peds.length < 20) throw new Error("peds too few");
let ped0 = game.peds.peds[0];
const t0 = game.traffic.cars[0];

// 通缉升星：先清零，再 +2
game.police.clearCrime();
game.police.reportCrime(2);
if (game.police.stars !== 2) throw new Error("stars != 2, got " + game.police.stars);
game.police._spawnCooldown = 0;
for (let i = 0; i < 120; i++) game.update(1 / 60);
if (game.police.cars.length < 1) throw new Error("no cops spawned, stars=" + game.police.stars);
console.log("cops spawned:", game.police.cars.length);

// 车流移动（先把测量车放到玩家 30m 内，避开 traffic 800m LOD）
{
  const d0 = Math.hypot(t0.pos.x - player.pos.x, t0.pos.z - player.pos.z);
  if (d0 > 700) {
    t0.pos.x = player.pos.x + 30;
    t0.pos.z = player.pos.z;
    t0.vx = t0.vz = 0;
    t0._target = null;
  }
}
const t0sx = t0.pos.x, t0sz = t0.pos.z;
for (let i = 0; i < 240; i++) game.update(1 / 60);
const tMoved = Math.hypot(t0.pos.x - t0sx, t0.pos.z - t0sz);
if (tMoved < 3) throw new Error("traffic car did not move: " + tMoved);
console.log("traffic moved:", tMoved.toFixed(1), "m");

// 撞人：把一辆车以高速放到行人位置
if (ped0.dead) ped0 = game.peds.peds.find((p) => !p.dead);
if (!ped0) throw new Error("no live ped to test");
t0.pos.x = ped0.x;
t0.pos.z = ped0.z;
t0.vx = 10; t0.vz = 0;
const hitPed = game.peds.checkCarHit(t0, 36);
if (!hitPed || !ped0.dead) throw new Error("ped not hit");
game.police.reportCrime(2); // 肇事逃逸
console.log("ped hit, stars =", game.police.stars);

// 被逮捕：清掉通缉先重置，再触发逮捕
game.police.clearCrime();
// 放一辆警车在玩家旁边且玩家低速
game.player.exitVehicle ? null : null;
if (player.inVehicle) player.exitVehicle();
const cop = game.police.cars[0];
if (!cop) game.police._spawnCop();
const chase = game.police.cars[0];
// 直接把警车挪到玩家 2m 处
chase.car.pos.x = player.pos.x + 2;
chase.car.pos.z = player.pos.z;
chase.car.vx = chase.car.vz = 0;
game.police.reportCrime(1);
// 冻结 cop 车速（update 里 AI 会动它）：让玩家静止，等待逮捕
const hp0 = player.hp;
let bustedOk = false;
for (let i = 0; i < 240; i++) {
  game.update(1 / 60);
  if (game._busted) { bustedOk = true; break; }
}
if (!bustedOk) throw new Error("busted not triggered; stars=" + game.police.stars + " dist=" + Math.hypot(player.pos.x - chase.car.pos.x, player.pos.z - chase.car.pos.z).toFixed(1));
if (player.pos.x !== game.police.station.x || player.pos.z !== game.police.station.z) throw new Error("not reset to station");
console.log("busted OK, money =", player.money);

// 伤残：送医院
player.damage(9999);
for (let i = 0; i < 5; i++) game.update(1 / 60);
const h = game.police.hospital;
if (player.pos.x !== h.x || player.pos.z !== h.z) throw new Error("not respawned at hospital");
if (player.hp <= 0) throw new Error("hp not restored");
console.log("wasted OK, hp =", player.hp);

// ---- 武器
const ws = game.weapons;
if (!ws) throw new Error("weapons system missing");
if (player.weapons.length !== 2 || player.weapons[0] !== "fist" || player.weapons[1] !== "pistol") {
  throw new Error("initial weapons wrong: " + player.weapons.join(","));
}

// 近战
const meleePed = game.peds.peds.find((p) => !p.dead);
ws.select(0);
player.angle = 0;
meleePed.x = player.pos.x;
meleePed.z = player.pos.z + 1.2;
ws._melee({ melee: true, range: 1.9, arc: 0.6 });
if (!meleePed.dead) throw new Error("melee did not hit");
console.log("melee OK");

// 射击：将目标放到玩家正前方，相机对齐后开火
const targetPed = game.peds.peds.find((p) => !p.dead);
targetPed.x = player.pos.x;
targetPed.z = player.pos.z + 10;
targetPed.state = "idle";
targetPed.timer = 999;
game.cameraYaw = 0;
game.cameraPitch = 0.32;
for (let i = 0; i < 3; i++) game.update(1 / 60); // 相机就位
ws.select(1); // 手枪
game.input.mouseFire = true;
for (let i = 0; i < 30; i++) game.update(1 / 60);
game.input.mouseFire = false;
if (!targetPed.dead) throw new Error("pistol shot missed ped");
if (game.police.stars < 2) throw new Error("shooting a ped did not raise heat: " + game.police.stars);
console.log("pistol OK, stars =", game.police.stars);

// ---- ADS 瞄准（右键）：FOV 收窄 / 越肩 / 据枪姿势 / 散布降低
{
  player.pos.set(0, 0, 0);
  player.angle = 0;
  game.cameraYaw = 0;
  game.cameraPitch = 0.05;
  game.input.mouseAim = true;
  for (let i = 0; i < 40; i++) game.update(1 / 60);
  if (!(game._aimK > 0.9)) throw new Error("aimK low: " + game._aimK);
  if (!player.aiming) throw new Error("player.aiming false");
  if (!(game.camera.fov < 50)) throw new Error("ads fov: " + game.camera.fov);
  if (!(game.cameraDist < 7.0)) throw new Error("ads dist: " + game.cameraDist);
  console.log("aim OK, fov =", game.camera.fov.toFixed(0), "dist =", game.cameraDist.toFixed(1));
  // 瞄准射击命中（每帧回正俯仰，模拟玩家压枪）
  const aimPed = game.peds.peds.find((p) => !p.dead);
  aimPed.x = player.pos.x;
  aimPed.z = player.pos.z + 20;
  aimPed.state = "idle";
  aimPed.timer = 999;
  ws.select(1);
  game.input.mouseFire = true;
  let killed = false;
  for (let i = 0; i < 60 && !killed; i++) {
    game.cameraPitch = 0.05;
    game.update(1 / 60);
    killed = aimPed.dead;
  }
  game.input.mouseFire = false;
  if (!killed) throw new Error("aim shot missed");
  console.log("aim shot OK");
  game.input.mouseAim = false;
  for (let i = 0; i < 40; i++) game.update(1 / 60);
  if (!(game.camera.fov > 54)) throw new Error("fov restore: " + game.camera.fov);
  if (player.aiming) throw new Error("aiming stuck");
  console.log("aim release OK");
}


// 命中扫描：直接调用打静态车
const c = game.vehicles.cars[0];
c.hp = c.maxHp;
const hpBefore = c.hp;
const end = ws._hitscan({ x: c.pos.x - 10, y: 1.45, z: c.pos.z }, { x: 1, y: 0, z: 0 }, 60, 16);
if (!(c.hp < hpBefore)) throw new Error("hitscan did not damage car");
console.log("hitscan car OK, dmg =", (hpBefore - c.hp).toFixed(0));

// 命中扫描：打建筑
const bld = city.colliders[0];
const cx = (bld.minX + bld.maxX) / 2;
const cz = (bld.minZ + bld.maxZ) / 2;
const end2 = ws._hitscan({ x: cx, y: 1.45, z: bld.minZ - 10 }, { x: 0, y: 0, z: 1 }, 60, 16);
if (!end2.hit) throw new Error("building hitscan missed");
if (Math.abs(end2.z - bld.minZ) > 2.01) throw new Error("building hit point off: " + end2.z + " vs " + bld.minZ);
console.log("hitscan building OK, z =", end2.z.toFixed(2), "vs face", bld.minZ.toFixed(2));

// ---- 爆炸特效与镜头震动（headless 安全跳过）
game.spawnExplosion(player.pos.x, player.pos.z);
game.onCarExplode(game.vehicles.cars[0]);
if (!(game._fx && game._fx.length === 0)) throw new Error("fx pool leaked in headless");
if (!(game._shakeAmp > 0)) throw new Error("camera shake not triggered");
game._updateFx(1 / 60);
game._updateCamera();
console.log("explosion fx OK (headless-safe)");

// ---- 任务系统
const M = game.missions;
if (!M) throw new Error("missions system missing");
if (M.missions[0].status !== "open") throw new Error("m1 not open: " + M.missions[0].status);
const money0 = player.money;
// m1：reach 型
M._startMission(0);
if (M.missions[0].status !== "active") throw new Error("m1 not active");
for (const wp of M.missions[0].waypoints) {
  player.pos.set(wp[0], 0, wp[1]);
  for (let k = 0; k < 3; k++) game.update(1 / 60);
}
if (M.missions[0].status !== "done") throw new Error("m1 not done, wpIdx=" + M._wpIdx);
if (!player.weapons.includes("uzi")) throw new Error("uzi not unlocked");
if (player.money !== money0 + 2000) throw new Error("m1 reward wrong: " + player.money);
if (M.missions[1].status !== "open") throw new Error("m2 not unlocked");
console.log("mission m1 OK, money =", player.money);

// m2：delivery 型（取包裹 → 送达）
M._startMission(1);
const m2 = M.missions[1];
if (m2.status !== "active") throw new Error("m2 not active");
player.pos.set(m2.pickup[0], 0, m2.pickup[1]);
for (let k = 0; k < 3; k++) game.update(1 / 60);
if (M._wpIdx !== 1) throw new Error("m2 pickup not registered, wpIdx=" + M._wpIdx);
player.pos.set(m2.dropoff[0], 0, m2.dropoff[1]);
for (let k = 0; k < 3; k++) game.update(1 / 60);
if (m2.status !== "done") throw new Error("m2 not done");
if (player.money !== money0 + 2000 + 5000) throw new Error("m2 reward wrong: " + player.money);
if (!Math.abs(player.armor - 50) < 0.001) throw new Error("m2 armor wrong: " + player.armor);
console.log("mission m2 OK, armor =", player.armor);

// m2 超时失败路径
M.missions[1].status = "open";
M._startMission(1);
M._timer = 0.01;
for (let k = 0; k < 3; k++) game.update(1 / 60);
if (M.missions[1].status !== "open") throw new Error("m2 timeout fail not reverted");
console.log("mission m2 timeout fail OK");

// m3：eliminate 型（刷 gang，杀光）
M._startMission(2);
const m3 = M.missions[2];
if (m3.status !== "active") throw new Error("m3 not active");
if (!M._gang || M._gang.length !== 5) throw new Error("gang size wrong: " + (M._gang ? M._gang.length : "null"));
for (const gp of M._gang) { gp.dead = true; gp.deadTimer = 0; }
for (let k = 0; k < 3; k++) game.update(1 / 60);
if (m3.status !== "done") throw new Error("m3 not done, alive=" + M._gang.filter((gg) => !gg.dead).length);
if (!player.weapons.includes("shotgun")) throw new Error("shotgun not unlocked");
console.log("mission m3 OK");

// 进度存档
if ((game.store.state.missionsDone || 0) < 3) throw new Error("missionsDone not saved: " + game.store.state.missionsDone);
console.log("mission store OK, missionsDone =", game.store.state.missionsDone);

// ---- 十章扩展：chase / escape / eliminate 复用
if (M.missions.length !== 10) throw new Error("missions != 10: " + M.missions.length);
const types = new Set(M.missions.map((mm) => mm.type));
for (const t of ["reach", "delivery", "eliminate", "chase", "escape"]) {
  if (!types.has(t)) throw new Error("missing mission type: " + t);
}
console.log("10 missions & types OK");

// m4 码头眼线（chase）
M._startMission(3);
if (M.missions[3].status !== "active") throw new Error("m4 not active");
if (!M._runner) throw new Error("m4 runner not spawned");
{
  const R = M._runner;
  const sx = R.car.pos.x, sz = R.car.pos.z;
  for (let i = 0; i < 90; i++) game.update(1 / 60);
  const moved = Math.hypot(R.car.pos.x - sx, R.car.pos.z - sz);
  if (moved < 3) throw new Error("runner did not drive: " + moved);
  console.log("m4 runner drove", moved.toFixed(1), "m, hp=", R.car.hp);
  // 射击摧毁：玩家车受损路径已由命中扫描覆盖；此处直接模拟撞击伤害到毁损
  R.car.damage(99999);
  for (let i = 0; i < 3; i++) game.update(1 / 60);
  if (M.missions[3].status !== "done") throw new Error("m4 not done after runner destroyed");
  if (M._runner) throw new Error("runner not cleaned up");
}
if (M.missions[4].status !== "open") throw new Error("m5 not unlocked");
console.log("m4 chase OK");

// m5 全城通缉（escape）
game.police.clearCrime();
M._startMission(4);
if (M.missions[4].status !== "active") throw new Error("m5 not active");
if (game.police.stars !== 2) throw new Error("m5 stars != 2: " + game.police.stars);
// 传送到远离警车刷新点的位置，并把计时压缩到 0.5s
player.pos.set(-1050, 0, -1050);
M._timer = 0.5;
for (let i = 0; i < 40; i++) game.update(1 / 60);
if (M.missions[4].status !== "done") throw new Error("m5 escape not done, timer=" + M._timer);
if (game.police.stars !== 0) throw new Error("m5 escape did not clear stars: " + game.police.stars);
console.log("m5 escape OK");

// m6 机场拦截（eliminate x6，解锁步枪）
M._startMission(5);
if (M.missions[5].status !== "active") throw new Error("m6 not active");
if (M._gang.length !== 6) throw new Error("m6 gang != 6: " + M._gang.length);
for (const gp of M._gang) { gp.dead = true; gp.deadTimer = 0; }
for (let i = 0; i < 3; i++) game.update(1 / 60);
if (M.missions[5].status !== "done") throw new Error("m6 not done");
if (!player.weapons.includes("rifle")) throw new Error("m6 did not unlock rifle");
console.log("m6 eliminate OK, rifle unlocked");

// ---- 出租车支线
{
  const T = game.taxi;
  if (!T) throw new Error("taxi system missing");
  const taxi = game.vehicles.cars.find((c) => c.def.taxi && !c.dead);
  if (!taxi) throw new Error("no parked taxi found");
  player.pos.set(taxi.pos.x + 2, 0, taxi.pos.z);
  player.enterVehicle(taxi);
  if (!player.inVehicle || player.vehicle !== taxi) throw new Error("did not enter taxi");
  const money0 = player.money;
  // 靠边停稳 0.6s → 自动上客（最多重试 5 次，防目的地采样过近）
  for (let tries = 0; tries < 5 && T.state !== "delivering"; tries++) {
    taxi.vx = taxi.vz = 0;
    for (let i = 0; i < 45; i++) {
      taxi.vx = taxi.vz = 0;
      game.update(1 / 60);
    }
  }
  if (T.state !== "delivering") throw new Error("taxi did not pick up, state=" + T.state);
  const fare = T.fare;
  if (!(fare > 80)) throw new Error("taxi fare too small: " + fare);
  // 直接开到目的地
  taxi.pos.x = T.dest.x;
  taxi.pos.z = T.dest.z;
  taxi.vx = taxi.vz = 0;
  player.pos.set(taxi.pos.x, 0, taxi.pos.z);
  for (let i = 0; i < 3; i++) game.update(1 / 60);
  // 注：送达后仍坐在车里且停稳会立即自动接下一单，此处只断言首次计费
  if (!(player.money >= money0 + fare)) {
    throw new Error(`taxi fare wrong: ${player.money} vs ${money0} + ${fare}`);
  }
  if ((game.store.state.taxiDone || 0) < 1) throw new Error("taxiDone not saved");
  if (player.inVehicle) player.exitVehicle();
  console.log("taxi OK, fare =", fare, "taxiDone =", game.store.state.taxiDone);
}

// ---- 车流重投：远车 N 秒后出现在玩家周边
{
  const tc = game.traffic.cars[game.traffic.cars.length - 1];
  if (player.inVehicle) player.exitVehicle();
  const fx = 1150, fz = 1150;
  player.pos.set(fx, 0, fz);
  tc.pos.x = -1150; tc.pos.z = -1150; tc.vx = tc.vz = 0; tc._target = null; tc._loafT = 0;
  for (let i = 0; i < 360; i++) { player.pos.set(fx, 0, fz); game.update(1 / 60); }
  const dd = Math.hypot(tc.pos.x - fx, tc.pos.z - fz);
  if (dd > 800) throw new Error(`traffic recycle failed: ${dd.toFixed(0)} loaf=${(tc._loafT || 0).toFixed(1)} pos=${tc.pos.x.toFixed(0)},${tc.pos.z.toFixed(0)}`);
  player.pos.set(0, 0, 0);
  console.log("traffic recycle OK, dist =", dd.toFixed(0));
}

// ---- 音效系统（headless 下安全跳过/无 ctx）
if (!game.sfx) throw new Error("sfx missing");
game.sfx.ensure();
game.sfx.playShot("pistol");
game.sfx.playShot("uzi");
game.sfx.playShot("shotgun");
game.sfx.playMelee();
game.sfx.playCrash(20);
game.sfx.playExplode();
game.sfx.playBusted();
game.sfx.playWasted();
game.sfx.engineOn(true, car);
game.sfx.update(1 / 60);
game.sfx.engineOn(false);
game.sfx.nextStation();
game.sfx.toggleMute();
game.sfx.update(1 / 60);
game.sfx.toggleMute();
console.log("sfx OK (headless-safe)");

game.dispose();
console.log("HEADLESS PEDS+POLICE+TRAFFIC TEST PASS");
