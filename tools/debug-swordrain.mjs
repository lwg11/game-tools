const TILE = 16;
const COLS = 80;
const ROWS = 45;

class MockTerrain {
  constructor() {
    this.grid = new Uint8Array(COLS * ROWS);
    this.hp = new Uint8Array(COLS * ROWS);
    for (let c = 0; c < COLS; c++) {
      for (let r = 35; r < ROWS; r++) {
        this.grid[r * COLS + c] = 1;
        this.hp[r * COLS + c] = 2;
      }
    }
  }
  solid(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    return this.grid[r * COLS + c] !== 0;
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
}

const terrain = new MockTerrain();
const srcX = 200, srcY = 470;
const tx = 850, ty = 500;
const flightAngle = Math.atan2(ty - srcY, tx - srcX);
const flightDist = Math.hypot(tx - srcX, ty - srcY);
const speed = Math.max(350, flightDist * 1.2);
const liftAngle = 0.35 + Math.random() * 0.55;
const vx = Math.cos(flightAngle) * speed * Math.cos(liftAngle);
const vy = Math.sin(flightAngle) * speed * Math.cos(liftAngle) - Math.sin(liftAngle) * speed;

console.log('flightAngle:', flightAngle.toFixed(3), 'flightDist:', flightDist.toFixed(1));
console.log('speed:', speed.toFixed(1), 'liftAngle:', liftAngle.toFixed(3));
console.log('vx:', vx.toFixed(1), 'vy:', vy.toFixed(1));

// 敌人位置
const enemies = [{x: 820, y: 500}, {x: 860, y: 500}, {x: 900, y: 500}];

let x = srcX, y = srcY, vy2 = vy;
const dt = 1/60;
let hitEnemies = new Set();
for (let t = 0; t < 3; t += dt) {
  vy2 += 1400 * dt;
  x += vx * dt;
  y += vy2 * dt;
  
  // 检查是否命中敌人
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = x - e.x;
    const dy = y - (e.y - 28);
    const rr = 20;
    if (dx * dx + dy * dy < rr * rr) {
      hitEnemies.add(i);
      console.log('HIT enemy', i, 'at t=' + t.toFixed(2), 'x=' + x.toFixed(1), 'y=' + y.toFixed(1));
    }
  }
  
  if (t < 0.5 || Math.abs(t - 1.0) < 0.02 || Math.abs(t - 1.5) < 0.02 || Math.abs(t - 2.0) < 0.02) {
    console.log('t=' + t.toFixed(2), 'x=' + x.toFixed(1), 'y=' + y.toFixed(1), 'terrain=' + terrain.circleHit(x, y, 4));
  }
  if (terrain.circleHit(x, y, 4)) { console.log('HIT terrain at t=' + t.toFixed(2), 'x=' + x.toFixed(1), 'y=' + y.toFixed(1)); break; }
  if (y > 720 + 60 || x < -100 || x > 1280 + 100) { console.log('OUT OF BOUNDS at t=' + t.toFixed(2), 'x=' + x.toFixed(1), 'y=' + y.toFixed(1)); break; }
}
console.log('Hit enemies:', [...hitEnemies]);
