/**
 * 游戏厅公共音频引擎
 * - 首次触摸 / 按键后解锁 AudioContext
 * - 提供四款游戏各自的循环背景音乐
 * - 统一处理声音开关、页面隐藏时暂停
 */
const TRACKS = {
  stone: {
    bpm: 96, root: 45, wave: "triangle", hat: true,
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
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this._stopMusic();
        this.ctx.suspend().catch(() => {});
      } else if (this.enabled) {
        this.ctx.resume().catch(() => {});
        this._startMusic();
      }
    });
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, this.ctx.currentTime, 0.02);
      if (this.enabled) {
        this.ctx.resume().catch(() => {});
        this._startMusic();
      } else {
        this._stopMusic();
      }
    } else if (this.enabled) {
      this.ensure();
      this._startMusic();
    }
  }

  setMusic(id) {
    if (this.trackId === id && this.timer) return;
    this.trackId = id;
    this.track = TRACKS[id] || null;
    if (!this.track) {
      this._stopMusic();
      return;
    }
    if (this.enabled && this.ctx) this._startMusic();
  }

  _startMusic() {
    if (!this.enabled || !this.ctx || !this.track) return;
    this._stopMusic();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.12;
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
      this._osc(mtof(midi), when, stepDur * 0.82, t.wave, 0.06, this.musicGain);
    }
    if (index % 2 === 0) {
      const bassDegree = t.bass[Math.floor(index / 2) % t.bass.length];
      const midi = t.root - 12 + t.scale[bassDegree % t.scale.length];
      this._osc(mtof(midi), when, stepDur * 1.7, "sine", 0.09, this.musicGain);
    }
    if (t.hat && index % 2 === 1) {
      this._noise(when, stepDur * 0.32, 0.018, 5200, this.musicGain);
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
