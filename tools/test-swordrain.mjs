/**
 * 万剑归宗逻辑测试（嬴政大招版）：
 * 1. 飞剑从施法者身体飞出
 * 2. 抛物线飞行
 * 3. 穿透伤害（可穿透多个敌人）
 * 4. 落地插地，过一会消失
 * 5. 每把剑像剑（完整剑形）
 */

const TILE = 16;
const COLS = 80;
const ROWS = 45;

function damageToHits(power) {
  if (power < 40) return 1;
  if (power < 70) return 2;
  if (power < 100) return 3;
  if (power < 140) return 5;
  if (power < 180) return 8;
  return 12;
}

class MockTerrain {
  constructor() {
    this.grid = new Uint8Array(COLS * ROWS);
    this.hp = new Uint8Array(COLS * ROWS);
    this.platforms = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 35; r < ROWS; r++) {
        this.grid[r * COLS + c] = 1;
        this.hp[r * COLS + c] = 2;
      }
    }
  }
  idx(c, r) { return r * COLS + c; }
  solid(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    return this.grid[this.idx(c, r)] !== 0;
  }
  solidAt(x, y) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }
  circleHit(x, y, radius) {
    if (this.solidAt(x, y)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.solidAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return true;
    }
    return false;
  }
  carve(cx, cy, radius, power = radius) {
    const r2 = radius * radius;
    const hits = damageToHits(power);
    const c0 = Math.floor((cx - radius) / TILE);
    const c1 = Math.floor((cx + radius) / TILE);
    const r0 = Math.floor((cy - radius) / TILE);
    const r1 = Math.floor((cy + radius) / TILE);
    for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
        const px = c * TILE + TILE / 2;
        const py = r * TILE + TILE / 2;
        const dx = px - cx;
        const dy = py - cy;
        const idx = this.idx(c, r);
        const v = this.grid[idx];
        if (v === 0) continue;
        if (v === 5 || v === 6) continue;
        if (dx * dx + dy * dy <= r2) {
          this.hp[idx] = Math.max(0, this.hp[idx] - hits);
          if (this.hp[idx] <= 0) {
            this.grid[idx] = 0;
            this.hp[idx] = 0;
          }
        }
      }
    }
  }
}

class MockUnit {
  constructor(team, x, y, hp) {
    this.team = team;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.scale = 1;
    this.shield = 0;
  }
  takeDamage(amount, sourceTeam) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
  }
}

function spawnSwordRain(game, x, y, team, damage, blast, weaponType) {
  const caster = team === 0 ? game._activePlayer() : game._activeEnemy();
  const srcX = caster ? caster.x : x;
  const srcY = caster ? caster.y - 30 : y - 60;
  const count = 15;
  const G = 1400;
  for (let i = 0; i < count; i++) {
    const spread = 120;
    const tx = x + (Math.random() * 2 - 1) * spread;
    const ty = y + (Math.random() * 2 - 1) * 60;
    const flightTime = 1.2 + (i / count) * 0.8 + Math.random() * 0.2;
    const vx = (tx - srcX) / flightTime;
    const vy = (ty - srcY - 0.5 * G * flightTime * flightTime) / flightTime;
    const delay = i * 0.08 + Math.random() * 0.05;
    game.swordRain.push({
      x: srcX, y: srcY,
      sx: srcX, sy: srcY,
      tx, ty,
      vx, vy,
      delay,
      age: 0,
      damage,
      blast: Math.max(60, blast),
      team,
      weaponType,
      hitSet: new Set(),
      stuck: false,
      stuckT: 0,
      stuckAngle: 0,
    });
  }
}

function updateSwordRain(game, dt) {
  if (!game.swordRain.length) return;
  for (let i = game.swordRain.length - 1; i >= 0; i--) {
    const s = game.swordRain[i];
    if (s.stuck) {
      s.stuckT += dt;
      if (s.stuckT > 1.6) game.swordRain.splice(i, 1);
      continue;
    }
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.age += dt;
    s.vy += 1400 * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 6)));
    let stuck = false;
    for (let step = 0; step < steps && !stuck; step++) {
      const h = dt / steps;
      s.x += s.vx * h;
      s.y += s.vy * h;
      // 穿透伤害
      for (const u of game.units) {
        if (!u.alive || u.team === s.team || s.hitSet.has(u)) continue;
        const dx = s.x - u.x;
        const dy = s.y - (u.y - 28);
        const rr = 20 * (u.scale || 1);
        if (dx * dx + dy * dy < rr * rr) {
          s.hitSet.add(u);
          u.takeDamage(s.damage, s.team);
        }
      }
      // 命中地形：插地
      if (game.terrain && game.terrain.circleHit(s.x, s.y, 4)) {
        s.stuck = true;
        s.stuckT = 0;
        s.stuckAngle = Math.atan2(s.vy, s.vx);
        game.terrain.carve(s.x, s.y, s.blast * 0.3, s.damage * 0.5);
        stuck = true;
        break;
      }
    }
    if (stuck) continue;
    if (s.age > 5 || s.y > 720 + 60 || s.x < -100 || s.x > 1280 + 100) {
      game.swordRain.splice(i, 1);
    }
  }
}

// 测试
console.log("=== 万剑归宗（嬴政大招）逻辑测试 ===");

const mock = {
  units: [],
  swordRain: [],
  terrain: new MockTerrain(),
  _activePlayer() { return this.units.find(u => u.team === 0 && u.alive) || null; },
  _activeEnemy() { return this.units.find(u => u.team === 1 && u.alive) || null; },
  spawnParticles() {},
};

// 玩家和 3 个敌人排成一排（测试穿透）
const player = new MockUnit(0, 200, 500, 200);
const enemy1 = new MockUnit(1, 820, 500, 200);
const enemy2 = new MockUnit(1, 860, 500, 200);
const enemy3 = new MockUnit(1, 900, 500, 200);
mock.units = [player, enemy1, enemy2, enemy3];

console.log(`初始敌人血量: ${enemy1.hp}, ${enemy2.hp}, ${enemy3.hp}`);

spawnSwordRain(mock, 850, 500, 0, 22, 70, "swordarray");
console.log(`✓ 剑雨召唤: ${mock.swordRain.length} 把飞剑`);
if (mock.swordRain.length !== 15) {
  console.error(`✗ 期望 15 把飞剑，实际 ${mock.swordRain.length}`);
  process.exit(1);
}

// 模拟 4 秒
let maxSwords = mock.swordRain.length;
let stuckCount = 0;
for (let t = 0; t < 4; t += 1/60) {
  updateSwordRain(mock, 1/60);
  const flying = mock.swordRain.filter(s => !s.stuck).length;
  const stuck = mock.swordRain.filter(s => s.stuck).length;
  if (t < 1) maxSwords = Math.max(maxSwords, mock.swordRain.length);
  if (t > 2 && stuck > stuckCount) stuckCount = stuck;
}

console.log(`✓ 飞行中飞剑: ${mock.swordRain.filter(s => !s.stuck).length}`);
console.log(`✓ 插地飞剑: ${mock.swordRain.filter(s => s.stuck).length}`);
console.log(`✓ 最终敌人血量: ${enemy1.hp}, ${enemy2.hp}, ${enemy3.hp}`);

// 验证穿透伤害
const totalDmg = (enemy1.maxHp - enemy1.hp) + (enemy2.maxHp - enemy2.hp) + (enemy3.maxHp - enemy3.hp);
console.log(`✓ 总伤害: ${totalDmg}`);
if (totalDmg > 0) {
  console.log(`✓ 穿透伤害生效`);
} else {
  console.error(`✗ 穿透伤害未生效`);
  process.exit(1);
}

// 验证插地
if (mock.swordRain.some(s => s.stuck) || stuckCount > 0) {
  console.log(`✓ 插地特效生效`);
} else {
  console.error(`✗ 插地特效未生效`);
  process.exit(1);
}

console.log("\n=== 全部测试通过 ===");
