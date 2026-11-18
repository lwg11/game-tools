/**
 * 精灵宝可梦 · 音效（从 game.js 原样搬移）
 */
// ---------------------------------------------------------------- 音效
export class Sfx {
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
  tone(freq, dur, type = "sine", vol = 0.08, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.14, cutoff = 900) {
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
  click() { this.tone(620, 0.05, "square", 0.02, 480); }
  encounter() { this.tone(440, 0.1, "square", 0.04); this.tone(660, 0.12, "square", 0.04); }
  hit(mult = 1) {
    this.noise(mult > 1 ? 0.18 : 0.1, mult > 1 ? 0.18 : 0.1, mult > 1 ? 1400 : 800);
    this.tone(mult > 1 ? 160 : 220, 0.1, "square", 0.05, 90);
  }
  faint() { this.tone(300, 0.32, "sawtooth", 0.06, 70); }
  heal() { this.tone(560, 0.1, "sine", 0.05); this.tone(760, 0.14, "sine", 0.04); }
  level() { [520, 660, 780, 990].forEach((f, i) => setTimeout(() => this.tone(f, 0.10, "square", 0.04), i * 70)); }
  catch() { [660, 880, 1040, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, "sine", 0.05), i * 90)); }
  ball() { this.tone(900, 0.05, "square", 0.02, 600); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "square", 0.05), i * 120)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, "triangle", 0.05), i * 150)); }
}
