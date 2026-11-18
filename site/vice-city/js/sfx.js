/**
 * 罪恶都市 · 程序化音效（WebAudio 合成，零外部音频资源）
 * ------------------------------------------------------------
 * - 引擎：锯齿波+方波经低通滤波，随速度/转速变调（仅在驾车时）
 * - 电台：3 个 80 年代合成器风格 16 步进音序器（贝斯/琶音/底鼓/镲）
 * - 警笛：双音交替三角波，音量随最近警车距离与通缉等级
 * - 单次音效：枪声×4、近战、撞击、爆炸、拾取、UI、BUSTED/WASTED 短句
 *
 * 浏览器自动播放策略：首次用户交互（点击开始/画布）时 ensure()。
 * headless 调试下全部调用安全跳过。
 */
export class SfxSystem {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.station = 0;
    this._engine = null;
    this._siren = null;
    this._radioOn = false;
    this._radioTimer = null;
    this._step = 0;
    this._nextNoteT = 0;
    this._noiseBuf = null;
  }

  // ================================================================ 初始化
  ensure() {
    if (this.game.headless) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    // 预生成 1 秒白噪声
    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._startRadio();
    const st = document.querySelector("#vc-mute");
    if (st) {
      st.onclick = () => this.toggleMute();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    const st = document.querySelector("#vc-mute");
    if (st) st.textContent = this.muted ? "🔇" : "🔊";
  }

  // ================================================================ 引擎
  engineOn(on, car) {
    if (!this.ctx) return;
    if (on) {
      if (this._engine || !car) return;
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      lp.Q.value = 1.8;
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = 58;
      const o2 = ctx.createOscillator();
      o2.type = "square";
      o2.frequency.value = 29;
      const g2 = ctx.createGain();
      g2.gain.value = 0.45;
      o1.connect(lp);
      o2.connect(g2);
      g2.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      o1.start();
      o2.start();
      g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.35);
      this._engine = { o1, o2, g, lp };
    } else {
      const e = this._engine;
      if (!e) return;
      this._engine = null;
      e.g.gain.cancelScheduledValues(this.ctx.currentTime);
      e.g.gain.setValueAtTime(Math.max(0.0001, e.g.gain.value), this.ctx.currentTime);
      e.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);
      setTimeout(() => {
        try { e.o1.stop(); e.o2.stop(); } catch { /* 已停止 */ }
      }, 400);
    }
  }

  _updateEngine() {
    const g = this.game;
    if (!this._engine) return;
    const car = g.player && g.player.vehicle;
    if (!car || car.dead) {
      this.engineOn(false);
      return;
    }
    // 转速：速度占比 + 油门加力
    const ratio = Math.min(1, Math.abs(car.kmh) / Math.max(1, car.def.topSpeedKmh || 240));
    const throttle = Math.abs(car.throttle || 0);
    const load = 0.35 + ratio * 0.65 + throttle * 0.15;
    const rpm = 50 + load * load * 300;
    this._engine.o1.frequency.value = rpm;
    this._engine.o2.frequency.value = rpm / 2;
    this._engine.lp.frequency.value = 400 + load * 1600;
    this._engine.g.gain.value = 0.09 + load * 0.05;
  }

  // ================================================================ 警笛
  _ensureSiren() {
    if (this._siren || !this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 800;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 1.6;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 160;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    o.connect(g);
    g.connect(this.master);
    o.start();
    lfo.start();
    this._siren = { o, g, lfo };
  }

  _updateSiren(dt) {
    const g = this.game;
    if (!g.police) return;
    const stars = g.police.stars;
    if (stars > 0 && this.ctx) this._ensureSiren();
    if (!this._siren) return;
    if (stars <= 0) {
      this._siren.g.gain.value = 0;
      return;
    }
    // 最近警车距离 → 音量
    let nearest = 200;
    for (const c of g.police.cars) {
      const car = c.car;
      if (car.dead) continue;
      const d = Math.hypot(car.pos.x - g.player.pos.x, car.pos.z - g.player.pos.z);
      if (d < nearest) nearest = d;
    }
    const byDist = Math.max(0, 1 - nearest / 90);
    const byStars = 0.3 + stars * 0.14;
    this._siren.g.gain.value = Math.min(0.2, byDist * byStars);
    void dt;
  }

  // ================================================================ 电台
  static STATIONS() {
    return [
      {
        name: "海浪合成器",
        bpm: 104,
        bars: [0, -4, 3, -2], // A minor: Am F C G
        root: 110, // A2
        bassPat: [0, null, 0, null, 7, null, 0, null, 0, null, 0, null, 7, null, 0, null],
        leadPat: [12, null, 15, 19, null, 15, null, 12, 10, null, 14, 17, null, 14, 10, null],
      },
      {
        name: "迈阿密之夜",
        bpm: 122,
        bars: [0, 3, -2, -4],
        root: 98, // G2
        bassPat: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, null, 0, null],
        leadPat: [null, 12, null, 15, null, 19, null, 15, null, 14, null, 12, null, 7, null, 10],
      },
      {
        name: "日出大道",
        bpm: 96,
        bars: [0, -2, -4, 3],
        root: 123.47, // B2
        bassPat: [0, 0, null, 0, null, 0, 7, null, 0, 0, null, 0, 7, null, 10, null],
        leadPat: [19, null, null, 15, null, null, 12, null, 14, null, null, 12, null, null, 7, null],
      },
    ];
  }

  _startRadio() {
    if (this._radioOn || !this.ctx) return;
    this._radioOn = true;
    this._step = 0;
    this._nextNoteT = this.ctx.currentTime + 0.1;
    this._radioTimer = setInterval(() => this._schedule(), 30);
    this.game.setRadio(this._stationName());
  }

  _stationName() {
    return SfxSystem.STATIONS()[this.station].name;
  }

  nextStation() {
    this.station = (this.station + 1) % SfxSystem.STATIONS().length;
    // 重置相位，避免切换爆音
    this._step = 0;
    if (this.ctx) this._nextNoteT = this.ctx.currentTime + 0.1;
    this.game.setRadio(this._stationName());
  }

  _schedule() {
    if (!this.ctx || this.muted) return;
    const st = SfxSystem.STATIONS()[this.station];
    const ct = this.ctx.currentTime;
    while (this._nextNoteT < ct + 0.16) {
      const bar = Math.floor(this._step / 16) % 4;
      const chordRoot = st.root * Math.pow(2, st.bars[bar] / 12);
      const stepInBar = this._step % 16;
      const t = this._nextNoteT;
      // 贝斯
      if (st.bassPat[stepInBar] !== null) {
        this._pluck(chordRoot * Math.pow(2, st.bassPat[stepInBar] / 12), t, 0.22, "sawtooth", 0.14);
      }
      // 琶音
      if (st.leadPat[stepInBar] !== null) {
        this._pluck(chordRoot * 2 * Math.pow(2, st.leadPat[stepInBar] / 12), t, 0.16, "square", 0.05);
      }
      this._step = (this._step + 1) % 64;
      this._nextNoteT += 60 / st.bpm / 4;
    }
  }

  _pluck(freq, t, dur, type, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ================================================================ 单次音效
  _noise(dur, vol, type = "lowpass", freq = 1200, q = 1, at = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone(freqFrom, freqTo, dur, type, vol, at = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqFrom, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  playShot(id) {
    if (!this.ctx) return;
    switch (id) {
      case "pistol":
        this._noise(0.12, 0.5, "lowpass", 1800, 0.8);
        this._tone(220, 60, 0.1, "square", 0.3);
        break;
      case "uzi":
        this._noise(0.07, 0.3, "lowpass", 2200, 0.8);
        this._tone(260, 90, 0.05, "square", 0.2);
        break;
      case "shotgun":
        this._noise(0.28, 0.7, "lowpass", 900, 0.6);
        this._tone(140, 40, 0.24, "sawtooth", 0.35);
        break;
      case "rifle":
        this._noise(0.14, 0.4, "lowpass", 1500, 0.8);
        this._tone(200, 70, 0.09, "square", 0.28);
        break;
      default:
        break;
    }
  }

  playMelee() {
    if (!this.ctx) return;
    this._noise(0.09, 0.25, "bandpass", 1600, 2);
  }

  playCrash(impact) {
    if (!this.ctx) return;
    const k = Math.min(1, impact / 24);
    this._noise(0.12 + k * 0.25, 0.4 + k * 0.3, "lowpass", 500 + k * 900, 0.8);
    this._tone(180 + k * 80, 45, 0.15, "sawtooth", 0.25);
    this._noise(0.05, 0.15 * k, "highpass", 3000, 0.6);
  }

  playExplode() {
    if (!this.ctx) return;
    this._noise(0.8, 0.9, "lowpass", 400, 0.5);
    this._tone(120, 28, 0.7, "sawtooth", 0.5);
    this._noise(1.2, 0.2, "lowpass", 200, 0.4, 0.15);
  }

  playPickup() {
    if (!this.ctx) return;
    this._tone(520, 660, 0.08, "square", 0.2);
    this._tone(660, 880, 0.1, "square", 0.2, 0.08);
  }

  playUi() {
    if (!this.ctx) return;
    this._tone(700, 900, 0.05, "square", 0.12);
  }

  playBusted() {
    if (!this.ctx) return;
    this._tone(440, 330, 0.35, "triangle", 0.3);
    this._tone(330, 220, 0.5, "triangle", 0.3, 0.35);
  }

  playWasted() {
    if (!this.ctx) return;
    this._tone(200, 60, 0.9, "sawtooth", 0.28);
    this._noise(0.5, 0.08, "lowpass", 500, 0.8);
  }

  playSirenBlip() {
    if (!this.ctx) return;
    this._tone(880, 990, 0.12, "square", 0.08);
  }

  // ================================================================ 帧更新
  update(dt) {
    if (!this.ctx) return;
    this._updateEngine();
    this._updateSiren(dt);
  }

  /** 音频解锁（菜单点击/画布点击时调用） */
  unlock() {
    this.ensure();
  }
}
