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

