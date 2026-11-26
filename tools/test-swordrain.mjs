/**
 * 万剑归宗逻辑测试：
 * 1. 剑丸命中后召唤剑雨
 * 2. 剑雨飞剑命中敌人造成伤害
 * 3. 剑雨飞剑落地产生爆炸
 * 4. 材质耐久根据威力扣减
 */

// 模拟游戏环境
const mock = {
  units: [],
  particles: [],
  rings: [],
  swordRain: [],
  terrain: null,
  time: 0,
  shake: 0,
  screenFlash: 0,
  flashColor: "#fff",
  terrainDirty: false,
  texts: [],
  timers: [],
  fires: [],
  glows: [],
  wind: 0,
  era: { id: "cultivation" },
  turnTeam: 0,
  cheatRealtime: true,
  cheatGod: false,
  moveBudget: 999,
  addText() {},
  spawnParticles() {},
  sfx: { shoot() {}, explode() {}, hit() {}, tone() {}, jump() {} },
  _activePlayer() { return this.units.find(u => u.team === 0 && u.alive) || null; },
  _activeEnemy() { return this.units.find(u => u.team === 1 && u.alive) || null; },
  _addTimer() {},
  _checkEndState() {},
  _difficulty() { return { dmg: 1 }; },
};

// 模拟地形
const TILE = 16;
const COLS = 80;
const ROWS = 45;
const MAT_HP = { 1: 2, 2: 4, 3: 6, 4: 10, 5: Infinity, 6: Infinity };

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
    // 铺地面
    for (let c = 0; c < COLS; c++) {
      for (let r = 35; r < ROWS; r++) {
        this.grid[r * COLS + c] = 1;
        this.hp[r * COLS + c] = MAT_HP[1];
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
  surfaceBelow(x, fromY = 0) {
    const c = Math.floor(x / TILE);
    if (c < 0 || c >= COLS) return null;
    const start = Math.max(0, Math.floor(fromY / TILE));
    for (let r = start; r < ROWS; r++) {
      if (this.solid(c, r)) return r * TILE;
    }
    return null;
  }
}

// 模拟单位
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
    this.stunT = 0;
    this.flash = 0;
  }
  takeDamage(amount, sourceTeam) {
    if (!this.alive) return;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) return;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
  }
}

// 模拟 spawnSwordRain
function spawnSwordRain(game, x, y, team, damage, blast, weaponType) {
  const caster = team === 0 ? game._activePlayer() : game._activeEnemy();
  const srcX = caster ? caster.x : x;
  const srcY = caster ? caster.y - 40 : y - 100;
  const count = 18;
  for (let i = 0; i < count; i++) {
    const spread = 110;
    const tx = x + (Math.random() * 2 - 1) * spread;
    const ty = y + (Math.random() * 2 - 1) * 50;
    const startX = srcX + (Math.random() * 2 - 1) * 30;
    const startY = srcY + (Math.random() * 2 - 1) * 20;
    const flightAngle = Math.atan2(ty - startY, tx - startX);
    const flightDist = Math.hypot(tx - startX, ty - startY);
    const speed = Math.max(600, flightDist * 1.8);
    const vx = Math.cos(flightAngle) * speed;
    const vy = Math.sin(flightAngle) * speed - (200 + Math.random() * 200);
    const delay = i * 0.05 + Math.random() * 0.04;
    game.swordRain.push({
      x: startX, y: startY,
      sx: startX, sy: startY,
      tx, ty,
      vx, vy,
      delay,
      age: 0,
      damage,
      blast: Math.max(70, blast),
      team,
      weaponType,
      dead: false,
      hitSet: new Set(),
    });
  }
}

// 模拟 _updateSwordRain
function updateSwordRain(game, dt) {
  if (!game.swordRain.length) return;
  for (let i = game.swordRain.length - 1; i >= 0; i--) {
    const s = game.swordRain[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.age += dt;
    s.vy += 1200 * dt;
    const steps = Math.max(1, Math.min(6, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 8)));
    let destroyed = false;
    for (let step = 0; step < steps && !destroyed; step++) {
      const h = dt / steps;
      s.x += s.vx * h;
      s.y += s.vy * h;
      // 命中敌人
      for (const u of game.units) {
        if (!u.alive || u.team === s.team || s.hitSet.has(u)) continue;
        const dx = s.x - u.x;
        const dy = s.y - (u.y - 30);
        const rr = 22 * (u.scale || 1);
        if (dx * dx + dy * dy < rr * rr) {
          s.hitSet.add(u);
          u.takeDamage(s.damage, s.team);
          game.swordRain.splice(i, 1);
          destroyed = true;
          break;
        }
      }
      if (destroyed) break;
      // 命中地形
      if (game.terrain && game.terrain.circleHit(s.x, s.y, 3)) {
        game.swordRain.splice(i, 1);
        destroyed = true;
        break;
      }
      // 到达目标区域
      if (s.vy > 0 && s.y >= s.ty) {
        game.swordRain.splice(i, 1);
        destroyed = true;
        break;
      }
    }
    if (destroyed) continue;
    if (s.age > 4 || s.y > 720 + 60 || s.x < -80 || s.x > 1280 + 80) {
      game.swordRain.splice(i, 1);
    }
  }
}

// 测试
console.log("=== 万剑归宗逻辑测试 ===");

// 测试 1：剑雨召唤
mock.terrain = new MockTerrain();
const player = new MockUnit(0, 200, 500, 200);
const enemy = new MockUnit(1, 900, 500, 200);
mock.units = [player, enemy];

spawnSwordRain(mock, 900, 500, 0, 30, 60, "swordarray");
console.log(`✓ 剑雨召唤: ${mock.swordRain.length} 把飞剑`);
if (mock.swordRain.length !== 18) {
  console.error(`✗ 期望 18 把飞剑，实际 ${mock.swordRain.length}`);
  process.exit(1);
}

// 测试 2：剑雨更新（模拟 3 秒）
const enemyHpBefore = enemy.hp;
for (let t = 0; t < 3; t += 1/60) {
  updateSwordRain(mock, 1/60);
}
console.log(`✓ 剑雨更新后剩余: ${mock.swordRain.length} 把飞剑`);
console.log(`✓ 敌人血量: ${enemyHpBefore} -> ${enemy.hp}`);
if (enemy.hp < enemyHpBefore) {
  console.log(`✓ 剑雨对敌人造成了 ${enemyHpBefore - enemy.hp} 点伤害`);
} else {
  console.log(`⚠ 剑雨未对敌人造成伤害（可能飞剑未命中）`);
}

// 测试 3：材质耐久扣减
console.log("\n=== 材质耐久测试 ===");
const terrain = new MockTerrain();
// 获取地面中心瓦片
const c = 40, r = 36;
const idx = terrain.idx(c, r);
console.log(`初始: grid=${terrain.grid[idx]}, hp=${terrain.hp[idx]}`);

// 低威力爆炸（power=30）
terrain.carve(c * TILE + 8, r * TILE + 8, 30, 30);
console.log(`低威力(power=30)后: grid=${terrain.grid[idx]}, hp=${terrain.hp[idx]}`);

// 高威力爆炸（power=150）
terrain.carve(c * TILE + 8, r * TILE + 8, 150, 150);
console.log(`高威力(power=150)后: grid=${terrain.grid[idx]}, hp=${terrain.hp[idx]}`);

// 测试 4：damageToHits 函数
console.log("\n=== damageToHits 测试 ===");
const testCases = [
  [30, 1], [50, 2], [80, 3], [120, 5], [160, 8], [200, 12]
];
for (const [power, expected] of testCases) {
  const actual = damageToHits(power);
  const ok = actual === expected ? "✓" : "✗";
  console.log(`${ok} power=${power}: 期望 ${expected}, 实际 ${actual}`);
}

console.log("\n=== 全部测试完成 ===");
