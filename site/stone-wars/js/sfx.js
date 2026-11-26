/**
 * 石器大战 · 回合制物理对战 · 音效引擎（从 game.js 原样搬移）
 */
// ---------------------------------------------------------------- 音效
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastHit = 0;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  tone(freq, dur, type = "sine", vol = 0.12, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, cutoff = 900) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shoot(type) {
    if (type === "spear") {
      this.tone(820, 0.09, "sawtooth", 0.07, 300);
      this.noise(0.08, 0.05, 2400);
    } else if (type === "boulder") {
      this.noise(0.18, 0.11, 700);
      this.tone(140, 0.15, "triangle", 0.08, 80);
    } else if (type === "grenade") {
      this.tone(220, 0.14, "square", 0.05, 420);
    } else if (type === "banana") {
      this.tone(520, 0.12, "triangle", 0.07, 300);
    } else if (type === "watermelon") {
      this.tone(380, 0.1, "triangle", 0.07, 200);
      this.noise(0.08, 0.04, 1200);
    } else if (type === "durian") {
      this.noise(0.12, 0.08, 800);
      this.tone(160, 0.12, "triangle", 0.06, 90);
    } else if (type === "poisonshroom") {
      this.tone(280, 0.16, "sine", 0.06, 140);
    } else if (type === "flail") {
      this.noise(0.1, 0.06, 2000);
      this.tone(240, 0.1, "triangle", 0.05, 120);
    } else if (type === "flare") {
      this.tone(900, 0.08, "sine", 0.05, 1400);
    } else if (type === "molotov") {
      this.noise(0.14, 0.09, 1000);
      this.tone(200, 0.12, "sawtooth", 0.05, 80);
    } else if (type === "cluster") {
      this.tone(440, 0.1, "triangle", 0.06, 220);
    } else if (type === "drone") {
      this.tone(680, 0.12, "sine", 0.05, 900);
      this.noise(0.08, 0.03, 3000);
    } else if (type === "gravity") {
      this.tone(120, 0.2, "sine", 0.08, 60);
    } else if (type === "sword") {
      this.tone(1200, 0.08, "sine", 0.06, 2400);
      this.noise(0.06, 0.03, 4000);
    } else if (type === "fireball") {
      this.noise(0.14, 0.08, 900);
      this.tone(300, 0.12, "sawtooth", 0.05, 150);
    } else if (type === "thunder") {
      this.noise(0.2, 0.12, 3000);
      this.tone(180, 0.18, "square", 0.06, 60);
    } else if (type === "swordarray") {
      this.tone(800, 0.12, "sine", 0.06, 1600);
      this.tone(1000, 0.1, "sine", 0.04, 2000);
    } else if (type === "dragonpalm") {
      this.noise(0.16, 0.1, 700);
      this.tone(140, 0.16, "triangle", 0.08, 70);
    } else if (type === "shieldcharm") {
      this.tone(700, 0.1, "sine", 0.05, 1000);
    } else if (type === "soulchain") {
      this.noise(0.1, 0.06, 1500);
      this.tone(220, 0.12, "triangle", 0.05, 110);
    } else if (type === "teleport") {
      this.tone(900, 0.08, "sine", 0.05, 1800);
      this.noise(0.06, 0.03, 5000);
    } else if (type === "poisonmist") {
      this.noise(0.16, 0.07, 600);
      this.tone(160, 0.14, "sine", 0.05, 80);
    } else if (type === "heal") {
      this.tone(520, 0.12, "sine", 0.05, 780);
      this.tone(660, 0.1, "sine", 0.04, 990);
    } else if (type === "storm") {
      this.noise(0.22, 0.1, 1200);
      this.tone(200, 0.18, "triangle", 0.06, 100);
    } else if (type === "skylightning") {
      this.noise(0.28, 0.14, 4000);
      this.tone(120, 0.24, "square", 0.08, 40);
    } else if (type === "formation") {
      this.tone(600, 0.14, "sine", 0.06, 1200);
      this.tone(800, 0.12, "sine", 0.05, 1600);
      this.noise(0.1, 0.04, 3000);
    } else {
      this.noise(0.16, 0.07, 1600);
      this.tone(180, 0.1, "sawtooth", 0.05, 90);
    }
  }

  explode(size = 60) {
    this.noise(0.35 + size / 500, 0.28, 420);
    this.tone(72, 0.34, "sine", 0.24, 34);
    setTimeout(() => this.noise(0.25, 0.08, 260), 70);
  }

  hit() {
    const now = performance.now();
    if (now - this.lastHit < 60) return;
    this.lastHit = now;
    this.tone(190, 0.06, "square", 0.05, 120);
  }

  jump() { this.tone(300, 0.13, "sine", 0.07, 520); }
  click() { this.tone(620, 0.045, "square", 0.035); }
  turn() { this.tone(420, 0.1, "triangle", 0.05); setTimeout(() => this.tone(610, 0.11, "triangle", 0.045), 90); }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, "triangle", 0.08), i * 120));
  }
  lose() {
    [330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.08), i * 170));
  }
}

