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

  /**
   * 射击音效数据表：每种武器对应一组音频事件
   * tone: [freq, dur, type, vol, endFreq]
   * noise: [dur, vol, cutoff]
   */
  static SHOOT_SFX = {
    spear:        { tone: [820, 0.09, "sawtooth", 0.07, 300], noise: [0.08, 0.05, 2400] },
    boulder:      { noise: [0.18, 0.11, 700], tone: [140, 0.15, "triangle", 0.08, 80] },
    grenade:      { tone: [220, 0.14, "square", 0.05, 420] },
    banana:       { tone: [520, 0.12, "triangle", 0.07, 300] },
    watermelon:   { tone: [380, 0.1, "triangle", 0.07, 200], noise: [0.08, 0.04, 1200] },
    durian:       { noise: [0.12, 0.08, 800], tone: [160, 0.12, "triangle", 0.06, 90] },
    poisonshroom: { tone: [280, 0.16, "sine", 0.06, 140] },
    flail:        { noise: [0.1, 0.06, 2000], tone: [240, 0.1, "triangle", 0.05, 120] },
    flare:        { tone: [900, 0.08, "sine", 0.05, 1400] },
    molotov:      { noise: [0.14, 0.09, 1000], tone: [200, 0.12, "sawtooth", 0.05, 80] },
    cluster:      { tone: [440, 0.1, "triangle", 0.06, 220] },
    drone:        { tone: [680, 0.12, "sine", 0.05, 900], noise: [0.08, 0.03, 3000] },
    gravity:      { tone: [120, 0.2, "sine", 0.08, 60] },
    sword:        { tone: [1200, 0.08, "sine", 0.06, 2400], noise: [0.06, 0.03, 4000] },
    fireball:     { noise: [0.14, 0.08, 900], tone: [300, 0.12, "sawtooth", 0.05, 150] },
    thunder:      { noise: [0.2, 0.12, 3000], tone: [180, 0.18, "square", 0.06, 60] },
    swordarray:   { tone: [800, 0.12, "sine", 0.06, 1600], tone2: [1000, 0.1, "sine", 0.04, 2000] },
    dragonpalm:   { noise: [0.16, 0.1, 700], tone: [140, 0.16, "triangle", 0.08, 70] },
    shieldcharm:  { tone: [700, 0.1, "sine", 0.05, 1000] },
    // 锁魂链：金属甩链声 + 下坠低音
    soulchain:    { noise: [0.16, 0.07, 2800], tone: [720, 0.13, "square", 0.045, 200], tone2: [1080, 0.08, "triangle", 0.035, 320] },
    teleport:     { tone: [900, 0.08, "sine", 0.05, 1800], noise: [0.06, 0.03, 5000] },
    poisonmist:   { noise: [0.16, 0.07, 600], tone: [160, 0.14, "sine", 0.05, 80] },
    heal:         { tone: [520, 0.12, "sine", 0.05, 780], tone2: [660, 0.1, "sine", 0.04, 990] },
    storm:        { noise: [0.22, 0.1, 1200], tone: [200, 0.18, "triangle", 0.06, 100] },
    skylightning: { noise: [0.28, 0.14, 4000], tone: [120, 0.24, "square", 0.08, 40] },
    formation:    { tone: [600, 0.14, "sine", 0.06, 1200], tone2: [800, 0.12, "sine", 0.05, 1600], noise: [0.1, 0.04, 3000] },
    // 新增：补天术 / 场景恢复
    mend:         { tone: [440, 0.14, "sine", 0.06, 880], tone2: [550, 0.12, "sine", 0.05, 1100], noise: [0.12, 0.04, 2000] },
    // 新增：搬山术 / 放置石块
    stonewall:    { noise: [0.2, 0.12, 500], tone: [110, 0.18, "triangle", 0.09, 55] },
  };

  /** 默认音效（未匹配到的武器类型） */
  static DEFAULT_SHOOT_SFX = { noise: [0.16, 0.07, 1600], tone: [180, 0.1, "sawtooth", 0.05, 90] };

  /**
   * 射击音效：数据驱动，查表播放
   * @param {string} type 武器 ID
   */
  shoot(type) {
    const cfg = Sfx.SHOOT_SFX[type] || Sfx.DEFAULT_SHOOT_SFX;
    if (cfg.noise) this.noise(...cfg.noise);
    if (cfg.tone) this.tone(...cfg.tone);
    if (cfg.tone2) this.tone(...cfg.tone2);
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

