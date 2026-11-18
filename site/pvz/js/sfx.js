/**
 * 植物大战僵尸 · 加强版 · 音效引擎（从 game.js 原样搬移）
 */
// ---------------------------------------------------------------- 音效
export class PvzSfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
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
  tone(freq, dur, type = "sine", vol = 0.1, endFreq = null) {
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
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
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
  click() { this.tone(640, 0.04, "square", 0.035); }
  plant() { this.tone(320, 0.12, "sine", 0.1, 480); this.noise(0.08, 0.05, 800); }
  shoot(kind = "pea") {
    if (kind === "fire") {
      this.tone(520, 0.06, "sawtooth", 0.045, 260);
      this.noise(0.07, 0.05, 1600);
    } else if (kind === "ice") {
      this.tone(980, 0.07, "sine", 0.035, 620);
    } else {
      this.tone(760, 0.05, "square", 0.035, 520);
    }
  }
  shootHeavy() {
    this.noise(0.1, 0.1, 1400);
    this.tone(180, 0.09, "sawtooth", 0.06, 70);
    this.tone(1100, 0.04, "square", 0.03, 500);
  }
  laser() {
    this.tone(1600, 0.18, "sawtooth", 0.05, 220);
    this.tone(720, 0.14, "square", 0.035, 1600);
  }
  sun() { this.tone(880, 0.09, "sine", 0.08); setTimeout(() => this.tone(1180, 0.12, "sine", 0.06), 70); }
  boom() { this.noise(0.4, 0.26, 500); this.tone(80, 0.35, "sine", 0.22, 40); }
  mower() { this.noise(0.5, 0.12, 1200); this.tone(120, 0.5, "sawtooth", 0.06, 90); }
  groan() { this.tone(110, 0.3, "sawtooth", 0.045, 80); }
  wave() { this.tone(220, 0.15, "triangle", 0.07); setTimeout(() => this.tone(165, 0.28, "triangle", 0.08), 130); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, "triangle", 0.08), i * 120)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.08), i * 160)); }
}
