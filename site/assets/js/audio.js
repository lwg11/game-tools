/**
 * 游戏厅公共音频引擎
 * - 首次触摸 / 按键后解锁 AudioContext
 * - 提供四款游戏各自的循环背景音乐（旋律 + 贝斯 + 琶音 + 踩镲）
 * - 统一处理声音开关、页面隐藏时暂停
 * - 音量经过压缩器，手机外放也能清楚听到
 */
const TRACKS = {
  stone: {
    bpm: 100, root: 45, wave: "triangle", hat: true,
    scale: [0, 3, 5, 7, 10],
    melody: [0, 2, 4, 3, 2, 0, -1, 2, 4, 5, 4, 2, 0, -1, 3, 2,
      4, 5, 7, 5, 4, 2, 0, 2, 4, 3, 2, 0, -1, 2, 0, -1],
    bass: [0, 0, 3, 3, 4, 4, 2, 2, 0, 0, 3, 3, 2, 2, 4, 4],
  },
  pvz: {
    bpm: 116, root: 48, wave: "square", hat: false,
    scale: [0, 2, 4, 7, 9],
    melody: [0, 2, 4, 5, 4, 2, 0, -1, 2, 4, 5, 7, 5, 4, 2, 0,
      4, 5, 7, 9, 7, 5, 4, 2, 0, 2, 4, 2, 0, -1, 2, 0],
    bass: [0, 0, 3, 3, 4, 4, 2, 2, 0, 0, 3, 3, 2, 2, 4, 4],
  },
  carrot: {
    bpm: 126, root: 50, wave: "triangle", hat: true,
    scale: [0, 2, 4, 7, 9],
    melody: [4, 5, 7, 5, 4, 2, 0, 2, 4, 7, 9, 7, 5, 4, 2, 0,
      2, 4, 5, 7, 5, 4, 2, 4, 7, 9, 7, 5, 4, 2, 0, -1],
    bass: [0, 0, 2, 2, 3, 3, 1, 1, 0, 0, 2, 2, 1, 1, 3, 3],
  },
  pokemon: {
    bpm: 132, root: 48, wave: "square", hat: true,
    scale: [0, 2, 4, 7, 9],
    melody: [0, 4, 7, 9, 7, 4, 2, 4, 5, 7, 9, 7, 9, 7, 5, 4,
      7, 9, 7, 9, 7, 5, 4, 2, 4, 5, 7, 5, 4, 2, 0, -1],
    bass: [0, 0, 3, 3, 4, 4, 2, 2, 0, 0, 3, 3, 2, 2, 4, 4],
  },
};

const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

class AudioEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.trackId = null;
    this.track = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this._bindUnlock();
  }

  _bindUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      this.ensure();
      if (this.enabled && this.trackId) this._startMusic();
    };
    ["pointerdown", "keydown", "touchstart"].forEach((evt) => {
      window.addEventListener(evt, unlock, { once: true, passive: true });
    });
    // 某些浏览器首次手势后仍保持 suspended，再补一次恢复
    window.addEventListener("pointerdown", () => {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().then(() => this._startMusic()).catch(() => {});
      }
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this._stopMusic();
        this.ctx.suspend().catch(() => {});
      } else if (this.enabled) {
        this.ctx.resume().then(() => this._startMusic()).catch(() => {});
      }
    });
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().then(() => this._startMusic()).catch(() => {});
      }
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.95 : 0;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    this.ctx.addEventListener("statechange", () => {
      if (this.ctx.state === "running" && this.enabled && this.trackId) this._startMusic();
    });
    return this.ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.95 : 0, this.ctx.currentTime, 0.02);
      if (this.enabled) {
        this.ctx.resume().then(() => this._startMusic()).catch(() => {});
      } else {
        this._stopMusic();
      }
    } else if (this.enabled) {
      this.ensure();
      this._startMusic();
    }
  }

  setMusic(id) {
    const changed = this.trackId !== id;
    this.trackId = id;
    this.track = TRACKS[id] || null;
    if (!this.track) {
      this._stopMusic();
      return;
    }
    if (!this.enabled) return;
    if (!this.ctx) this.ensure();
    if (changed) this._stopMusic();
    this._startMusic();
  }

  _startMusic() {
    if (!this.enabled || !this.ctx || !this.track || this.timer) return;
    if (this.ctx.state !== "running") {
      this.ctx.resume().catch(() => {});
      return;
    }
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 90);
    this._schedule();
  }

  _stopMusic() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _schedule() {
    if (!this.ctx || !this.track || !this.enabled) return;
    if (this.ctx.state !== "running") return;
    const stepDur = 60 / this.track.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.38) {
      this._playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % this.track.melody.length;
      this.nextTime += stepDur;
    }
  }

  _playStep(index, when, stepDur) {
    const t = this.track;
    const degree = t.melody[index % t.melody.length];
    if (degree >= 0) {
      const midi = t.root + 12 + t.scale[degree % t.scale.length] + Math.floor(degree / t.scale.length) * 12;
      this._osc(mtof(midi), when, stepDur * 0.86, t.wave, 0.15, this.musicGain);
      // 低八度垫音，让旋律更饱满
      this._osc(mtof(midi - 12), when, stepDur * 0.7, "sine", 0.05, this.musicGain);
    }
    if (index % 2 === 0) {
      const bassDegree = t.bass[Math.floor(index / 2) % t.bass.length];
      const midi = t.root - 12 + t.scale[bassDegree % t.scale.length];
      this._osc(mtof(midi), when, stepDur * 1.8, "sine", 0.18, this.musicGain);
    }
    // 琶音：每两拍补一个高音，提升辨识度
    if (index % 4 === 2) {
      const p = t.scale[(index + 2) % t.scale.length];
      this._osc(mtof(t.root + 24 + p), when, stepDur * 0.5, "triangle", 0.06, this.musicGain);
    }
    if (t.hat && index % 2 === 1) {
      this._noise(when, stepDur * 0.32, 0.035, 5200, this.musicGain);
    }
  }

  _osc(freq, when, dur, type, vol, dest) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(dest || this.master);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  _noise(when, dur, vol, cutoff, dest) {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest || this.master);
    src.start(when);
  }
}

export const audio = new AudioEngine();
if (typeof window !== "undefined") window.__gameAudio = audio;
