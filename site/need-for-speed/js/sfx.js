/**
 * WebAudio 合成音效（M5）：引擎/漂移/氮气/碰撞/倒计时/胜负。
 * 无外部音频资源；首次用户手势后 resume。
 */
import { clamp } from "./sim.js";

export class Sfx {
  constructor(muted = false) {
    this.ctx = null;
    this.master = null;
    this.muted = muted;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.driftGain = null;
    this.nitroGain = null;
    this.started = false;
    this._engineSpeed = 0;
    this._throttle = 0;
  }

  /** 需在用户手势后调用 */
  resume() {
    if (this.started) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);

      // 引擎：双锯齿波 + 低通
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 2;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 70;
      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = "square";
      this.engineOsc2.frequency.value = 35;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      this.engineOsc.connect(lp);
      this.engineOsc2.connect(g2);
      g2.connect(lp);
      lp.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();

      // 噪声源（漂移 & 氮气共用 buffer）
      const noiseLen = ctx.sampleRate * 1.2;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;

      const mkNoise = (type, freq, q, gainVal) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gainVal;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
        return g;
      };
      this.driftGain = mkNoise("bandpass", 900, 1.2, 0);
      this.nitroGain = mkNoise("highpass", 2600, 0.8, 0);
      this.started = true;
    } catch (e) {
      this.started = false;
    }
  }

  /** 每帧更新引擎/漂移/氮气 */
  update(speed, throttle, driftAmt, nitroOn) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const rpm = 60 + Math.abs(speed) * 4.6 + (throttle > 0 ? 26 : 0) + (nitroOn ? 18 : 0);
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.045 + (throttle > 0 ? 0.05 : 0.015) + Math.abs(speed) * 0.0006, t, 0.1);
    this.driftGain.gain.setTargetAtTime(clamp(driftAmt, 0, 1) * 0.16, t, 0.05);
    this.nitroGain.gain.setTargetAtTime(nitroOn ? 0.12 : 0, t, 0.08);
  }

  /** 静音切换 */
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _blip(freq, dur = 0.12, type = "square", gain = 0.2, when = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 倒计时哔（countdown = 剩余秒；每秒最后 0.2 秒触发更合适，这里外部控制） */
  beepCountdown(final = false) {
    this._blip(final ? 880 : 440, final ? 0.35 : 0.15, "square", 0.22);
  }

  /** 碰撞 */
  hit(strength = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = clamp(strength, 0.2, 1) * 0.5;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    this._blip(90, 0.18, "sine", 0.4);
  }

  /** 结算音 */
  stinger(win) {
    if (win) {
      this._blip(523, 0.14, "triangle", 0.25, 0);
      this._blip(659, 0.14, "triangle", 0.25, 0.13);
      this._blip(784, 0.3, "triangle", 0.28, 0.26);
    } else {
      this._blip(392, 0.2, "sawtooth", 0.18, 0);
      this._blip(311, 0.34, "sawtooth", 0.18, 0.18);
    }
  }
}
