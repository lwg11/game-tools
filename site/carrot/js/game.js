/**
 * 保卫萝卜 · 塔防
 * ------------------------------------------------------------
 * 怪物沿路径走向胡萝卜，玩家在路径两侧建造炮塔。
 * 5 种炮塔：瓶子炮 / 冰锥塔 / 火焰瓶 / 闪电塔 / 多重箭。
 */
import "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { toast, icon } from "../../assets/js/ui.js";
import { audio } from "../../assets/js/audio.js";
import { isCrazy, applyBodyMode } from "../../assets/js/mode.js";
import { H, LEVELS, TOTAL_LEVELS, TOWERS, TOWER_ORDER, W, getLevel } from "./levels.js";
import { TAU, THEMES, buildPath, clamp, distToPath, makeSpots, rand, roundRect } from "./common.js";
import { Sfx } from "./sfx.js";
import { Enemy, Tower } from "./entities.js";

// ---------------------------------------------------------------- 游戏主体
class CarrotGame {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.crazy = isCrazy();
    applyBodyMode();
    window.addEventListener("gt:mode-changed", () => { this.crazy = isCrazy(); });
    this.sfx = new Sfx();
    this.store = new ProgressStore("carrot");
    this.phase = "menu";
    this.paused = true;
    this.speed = 1;
    this.level = null;
    this.path = null;
    this.spots = [];
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.beams = [];
    this.particles = [];
    this.texts = [];
    this.gold = 0;
    this.carrotHp = 10;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 0;
    this.allWavesStarted = false;
    this.kills = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverSpot = null;
    this.bg = null;
    this.time = 0;
    this.shake = 0;
    this.lastTs = 0;
    this.soundOn = true;
    this.tipTimer = null;
    this.banner = null;
    this.endlessBest = 0;
    this.cheatOpen = false;
    this.cheatInfiniteGold = false;
    this._bindUI();
    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());
    requestAnimationFrame((ts) => this._loop(ts));
    this._boot();
  }

  async _boot() {
    document.getElementById("levelScreen").classList.add("show");
    this._renderLevelGrid();
    await this.store.init();
    this.soundOn = this.store.state.sound !== false;
    this.sfx.enabled = this.soundOn;
    audio.setEnabled(this.soundOn);
    audio.setMusic("carrot");
    this._updateSoundButtons();
    this._refreshSummary();
    this.store.onChange(() => this._refreshSummary());
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客 */ }
    if (!this.store.state.tutorialSeen) this._showTutorial(true);
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("ctSound").innerHTML = icon("sound");
    $("ctPause").innerHTML = icon("pause");
    $("ctHome").innerHTML = icon("home");
    $("ctHome").addEventListener("click", () => this._openLevelScreen());
    $("ctPause").addEventListener("click", () => this._openPause());
    $("ctSound").addEventListener("click", () => this._toggleSound());
    $("ctCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });
    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") this._closeCheat();
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });
    $("ctSpeed").addEventListener("click", () => {
      this.speed = this.speed === 1 ? 2 : 1;
      $("ctSpeed").textContent = this.speed + "×";
      this.sfx.ensure();
      this.sfx.click ? null : null;
    });
    $("tutorialBtn").addEventListener("click", () => this._showTutorial(false));
    $("tutorialStart").addEventListener("click", () => this._startFromTutorial());
    $("tutorialScreen").addEventListener("click", (e) => {
      if (e.target.id === "tutorialScreen") this._startFromTutorial();
    });
    $("continueBtn").addEventListener("click", () => {
      this.startLevel(clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS));
    });
    $("levelGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-level]");
      if (!card || card.classList.contains("locked")) return;
      this.startLevel(Number(card.dataset.level));
    });
    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());
    $("retryBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("nextBtn").addEventListener("click", () => {
      if (!this.level || this.level.endless) return;
      if (this.level.id < TOTAL_LEVELS) this.startLevel(this.level.id + 1);
      else this.startLevel(0);
    });
    $("tpClose").addEventListener("click", () => this._deselectTower());
    $("tpUpgrade").addEventListener("click", () => this._upgradeTower());
    $("tpSell").addEventListener("click", () => this._sellTower());
    $("rotateTip").addEventListener("click", () => $("rotateTip").classList.add("hide"));
    $("ctTowerBar").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tower]");
      if (!btn) return;
      if (this.phase !== "playing" || this.paused) return;
      const id = btn.dataset.tower;
      this.selectedTowerType = this.selectedTowerType === id ? null : id;
      this._deselectTower(false);
      this._refreshTowerBar();
      this._showTip(this.selectedTowerType
        ? `已选择${TOWERS[id].name}，点击草地建造位`
        : "选择炮塔，点击草地上的建造位");
    });
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerleave", () => { this.hoverSpot = null; });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key.toLowerCase() === " ") {
        if (this.phase === "playing") {
          e.preventDefault();
          if (this.paused) this._closePause();
          else this._openPause();
        }
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.phase === "playing" && !this.paused) this._openPause();
    });
  }

  // ------------------------------------------------------------ 关卡选择
  _renderLevelGrid() {
    const state = this.store.state;
    const stars = state.stars || {};
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const best = Number(state.endlessBest) || 0;
    const grid = document.getElementById("levelGrid");
    const cards = LEVELS.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const current = !locked && lv.id === unlocked && !state.cleared[lv.id];
      return `<button class="level-card theme-${lv.theme} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? 'aria-disabled="true"' : ""}>
        <div><span class="lv-num">${String(lv.id).padStart(2, "0")}<small>关</small></span></div>
        <div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-sub">${lv.sub}</div>
          <div class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</div>
        </div>
        ${locked ? '<span class="lv-lock">' + icon("lock") + "</span>" : ""}
      </button>`;
    });
    cards.push(`<button class="level-card endless" data-level="0">
      <div><span class="lv-num">∞<small>无尽</small></span></div>
      <div>
        <div class="lv-name">无尽模式</div>
        <div class="lv-sub">${best > 0 ? `最佳纪录：第 ${best} 波` : "随时挑战 · 越打越难"}</div>
        <div class="lv-stars">${best > 0 ? `最高 ${best} 波` : "守住萝卜"}</div>
      </div>
    </button>`);
    grid.innerHTML = cards.join("");
  }

  _refreshSummary() {
    const state = this.store.state;
    const total = Object.values(state.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const cleared = Object.keys(state.cleared || {}).length;
    document.getElementById("totalStars").textContent = String(total);
    document.getElementById("overallBar").style.width = Math.round((cleared / TOTAL_LEVELS) * 100) + "%";
    document.getElementById("progressText").textContent = `已解锁 ${unlocked} / ${TOTAL_LEVELS} 关 · 已获得 ${total} / ${TOTAL_LEVELS * 3} 星`;
    const btn = document.getElementById("continueBtn");
    if (total === 0 && cleared === 0) btn.textContent = "开始第 1 关";
    else if (cleared >= TOTAL_LEVELS) btn.textContent = "挑战无尽模式";
    else btn.textContent = `继续第 ${unlocked} 关`;
    this._renderLevelGrid();
  }

  _showTutorial(firstTime) {
    this.firstTutorial = firstTime;
    const id = clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS);
    document.getElementById("tutorialStart").textContent = firstTime ? "开始第 1 关" : `开始第 ${id} 关`;
    document.getElementById("tutorialScreen").classList.add("show");
  }

  _startFromTutorial() {
    document.getElementById("tutorialScreen").classList.remove("show");
    if (!this.store.state.tutorialSeen) this.store.update((p) => { p.tutorialSeen = true; });
    this.startLevel(this.firstTutorial ? 1 : clamp(Number(this.store.state.unlocked) || 1, 1, TOTAL_LEVELS));
  }

  _openLevelScreen() {
    this.phase = "menu";
    this.paused = true;
    this._hideScreens();
    document.getElementById("levelScreen").classList.add("show");
    this._refreshSummary();
  }

  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  // ------------------------------------------------------------ 开局
  startLevel(id) {
    this._hideScreens();
    this.level = getLevel(id);
    this.path = buildPath(this.level.path);
    this.spots = makeSpots(this.path);
    this.bg = this._buildBackground();
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.beams = [];
    this.particles = [];
    this.texts = [];
    this.gold = this.level.startGold;
    this.carrotHp = this.level.carrotHp;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 4;
    this.allWavesStarted = false;
    this.kills = 0;
    this.time = 0;
    this.shake = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverSpot = null;
    this.banner = null;
    this.endlessBest = Number(this.store.state.endlessBest) || 0;
    this.cheatOpen = false;
    document.getElementById("cheatScreen").classList.remove("show");
    document.getElementById("ctTowerPanel").classList.remove("show");
    this.phase = "playing";
    this.paused = false;
    this.speed = 1;
    document.getElementById("ctSpeed").textContent = "1×";
    document.getElementById("resultScreen").classList.remove("show");
    document.getElementById("pauseScreen").classList.remove("show");
    document.getElementById("tutorialScreen").classList.remove("show");
    this._refreshTowerBar();
    this._updateHUD();
    this._deselectTower(false);
    this._showBanner(this.level.endless ? "无尽模式" : `第 ${this.level.id} 关`, this.level.sub, 2);
    this._showTip("选择炮塔，点击草地上的建造位");
    this.sfx.ensure();
  }

  // ------------------------------------------------------------ 背景
  _buildBackground() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const t = THEMES[this.level.theme] || THEMES.day;
    const rng = (() => { let a = (this.level.id + 3) * 7919; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; })();
    const sky = ctx.createLinearGradient(0, 0, 0, 260);
    t.sky.forEach((color, i) => sky.addColorStop(i / (t.sky.length - 1), color));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 260);
    if (t.night) {
      for (let i = 0; i < 80; i++) {
        ctx.globalAlpha = 0.3 + rng() * 0.6;
        ctx.fillStyle = "#eaf1ff";
        ctx.fillRect(rng() * W, rng() * 190, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e8f1ff";
      ctx.beginPath();
      ctx.arc(1080, 80, 30, 0, TAU);
      ctx.fill();
      ctx.fillStyle = t.sky[0];
      ctx.beginPath();
      ctx.arc(1094, 72, 27, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = t.accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(1080, 72, 34, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(1080, 72, 62, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 远山
    ctx.fillStyle = t.hill;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, 250);
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      const y = 190 + Math.sin(i * 1.7 + this.level.id) * 32 + rng() * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, 300);
    ctx.lineTo(0, 300);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 草地
    const lawn = ctx.createLinearGradient(0, 240, 0, H);
    lawn.addColorStop(0, t.grass[0]);
    lawn.addColorStop(1, t.grass[1]);
    ctx.fillStyle = lawn;
    ctx.fillRect(0, 240, W, H - 240);
    for (let i = 0; i < 8; i += 2) {
      ctx.fillStyle = "rgba(255,255,255,.04)";
      ctx.fillRect(0, 250 + i * 60, W, 60);
    }
    // 树与灌木
    for (let i = 0; i < 16; i++) {
      const x = rng() * W;
      const y = 270 + rng() * 330;
      if (distToPath(this.path, x, y) < 100) continue;
      ctx.fillStyle = t.tree;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 13 + rng() * 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(x - 3, y + 6, 6, 16);
      ctx.globalAlpha = 1;
    }
    // 小花
    for (let i = 0; i < 30; i++) {
      const x = rng() * W;
      const y = 270 + rng() * 380;
      if (distToPath(this.path, x, y) < 85) continue;
      ctx.fillStyle = ["#fff3a8", "#ffb8d0", "#ffe27a", "#c7b8ff"][Math.floor(rng() * 4)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#f2a51e";
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fill();
    }
    // 路径
    const pts = this.path.points;
    const drawLine = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    drawLine(66, t.edge);
    drawLine(56, t.path);
    ctx.strokeStyle = "rgba(255,245,220,.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 14]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 路边石头
    for (let i = 0; i < 28; i++) {
      const s = this.path.segs[Math.floor(rng() * this.path.segs.length)];
      const k = rng();
      const x = s.a.x + (s.b.x - s.a.x) * k + (rng() - 0.5) * 80;
      const y = s.a.y + (s.b.y - s.a.y) * k + (rng() - 0.5) * 80;
      ctx.fillStyle = "rgba(70,50,30,.16)";
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + rng() * 5, 2 + rng() * 3, rng() * 3, 0, TAU);
      ctx.fill();
    }
    // 胡萝卜田
    const carrot = pts[pts.length - 1];
    ctx.fillStyle = "rgba(90, 60, 30, .35)";
    ctx.beginPath();
    ctx.ellipse(carrot.x, carrot.y + 8, 58, 26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#b98e58";
    ctx.beginPath();
    ctx.ellipse(carrot.x, carrot.y + 6, 46, 20, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = "#5fbf4a";
      ctx.beginPath();
      ctx.arc(carrot.x - 36 + i * 12, carrot.y + 14, 4, 0, TAU);
      ctx.fill();
    }
    // 暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,40,10,.22)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------ 输入
  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  _onPointerDown(e) {
    if (this.phase !== "playing" || this.paused) return;
    e.preventDefault();
    this.sfx.ensure();
    const p = this._canvasPoint(e);
    const spot = this.spots.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 36);
    if (spot) {
      if (spot.tower) {
        this._selectTower(spot.tower);
      } else if (this.selectedTowerType) {
        this._buildTower(spot, this.selectedTowerType);
      } else {
        this._showTip("先在底部选择一种炮塔");
      }
      return;
    }
    this._deselectTower();
    this.hoverSpot = null;
  }

  _onPointerMove(e) {
    if (this.phase !== "playing" || this.paused) return;
    const p = this._canvasPoint(e);
    this.hoverSpot = this.spots.find((s) => !s.tower && Math.hypot(s.x - p.x, s.y - p.y) < 36) || null;
  }

  // ------------------------------------------------------------ 建塔 / 升级 / 出售
  _buildTower(spot, type) {
    const def = TOWERS[type];
    if (!def) return;
    if (this.gold < def.cost) {
      this._showTip("金币不足");
      return;
    }
    this.gold -= def.cost;
    const tower = new Tower(this, type, spot);
    spot.tower = tower;
    this.towers.push(tower);
    this.sfx.build();
    this.spawnParticles(spot.x, spot.y - 10, 12, "#ffe08a", "spark");
    this._refreshTowerBar();
    this._updateHUD();
    this._showTip(`${def.name}建造完成`);
  }

  _selectTower(tower) {
    this.selectedTower = tower;
    this.selectedTowerType = null;
    this._refreshTowerBar();
    this._refreshPanel();
    document.getElementById("ctTowerPanel").classList.add("show");
  }

  _deselectTower(hide = true) {
    this.selectedTower = null;
    if (hide) document.getElementById("ctTowerPanel").classList.remove("show");
  }

  _refreshPanel() {
    const tower = this.selectedTower;
    if (!tower) return;
    const st = tower.stats();
    document.getElementById("tpName").textContent = tower.def.name;
    document.getElementById("tpLevel").textContent = `Lv.${tower.level}`;
    document.getElementById("tpStats").innerHTML = `
      <span>伤害 <b>${st.damage}</b></span>
      <span>范围 <b>${Math.round(st.range)}</b></span>
      <span>攻速 <b>${st.rate.toFixed(2)}s</b></span>
      ${st.slow ? `<span>减速 <b>${st.slow.toFixed(1)}s</b></span>` : ""}
      ${st.splash ? `<span>溅射 <b>${st.splash}</b></span>` : ""}`;
    const up = document.getElementById("tpUpgrade");
    const sell = document.getElementById("tpSell");
    if (tower.level >= 3) {
      up.textContent = "已满级";
      up.disabled = true;
    } else {
      const cost = tower.upgradeCost();
      up.textContent = `升级 · ${cost}`;
      up.disabled = this.gold < cost;
    }
    sell.textContent = `出售 · +${Math.round(tower.invested * 0.6)}`;
    sell.disabled = false;
  }

  _upgradeTower() {
    const tower = this.selectedTower;
    if (!tower || tower.level >= 3) return;
    const cost = tower.upgradeCost();
    if (this.gold < cost) { this._showTip("金币不足"); return; }
    this.gold -= cost;
    tower.invested += cost;
    tower.level += 1;
    this.sfx.build();
    this.spawnParticles(tower.x, tower.y - 20, 12, "#ffd08a", "spark");
    this._refreshPanel();
    this._updateHUD();
    this._showTip(`${tower.def.name}升到 Lv.${tower.level}`);
  }

  _sellTower() {
    const tower = this.selectedTower;
    if (!tower) return;
    const refund = Math.round(tower.invested * 0.6);
    const spot = this.spots.find((s) => s.tower === tower);
    if (spot) spot.tower = null;
    this.towers = this.towers.filter((t) => t !== tower);
    this.gold += refund;
    this.sfx.coin();
    this._deselectTower();
    this._refreshPanel();
    this._refreshTowerBar();
    this._updateHUD();
    this._showTip(`出售成功，回收 ${refund} 金币`);
  }

  // ------------------------------------------------------------ 波次
  _startWave() {
    if (this.level.endless && this.waveIndex > 0) {
      this.endlessBest = Math.max(this.endlessBest, this.waveIndex);
      this.store.update((p) => { p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessBest); });
    }
    this.waveIndex += 1;
    let wave;
    if (this.level.endless) {
      wave = this._makeEndlessWave(this.waveIndex);
    } else {
      wave = this.level.waves[this.waveIndex - 1];
    }
    if (!wave) return;
    this.spawnQueue = [];
    for (const g of wave.list) {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push(g.type);
    }
    this.spawnTimer = 0;
    this._showBanner(`第 ${this.waveIndex} 波`, this.level.endless ? "怪物越来越强" : "怪物从右侧出现", 1.7);
    this.sfx.wave();
    this._updateHUD();
  }

  _makeEndlessWave(wave) {
    const list = [];
    const n = clamp(1 + Math.floor(wave * 0.55), 1, 8);
    for (let i = 0; i < n; i++) {
      let type = "slime";
      if (wave >= 3 && i % 3 === 0) type = "runner";
      if (wave >= 5 && i % 4 === 0) type = "tank";
      list.push({ type, count: 1 });
    }
    if (wave % 5 === 0) list.push({ type: "boss", count: 1 });
    return { list, interval: 0.55 };
  }

  _updateWaves(dt) {
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const type = this.spawnQueue.shift();
        const hpMul = this.level.hpMul * (this.level.endless ? 1 + this.waveIndex * 0.12 : 1);
        this.enemies.push(new Enemy(this, type, hpMul, this.waveIndex));
        this.spawnTimer = type === "runner" ? 0.42 : type === "boss" ? 1.2 : 0.72;
      }
      return;
    }
    if (this.enemies.some((e) => e.alive)) return;

    if (this.level.endless) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this._startWave();
        this.betweenTimer = 2.2;
      }
      return;
    }
    if (this.waveIndex >= this.level.waves.length) {
      if (!this.allWavesStarted) {
        this.allWavesStarted = true;
        this._winLevel();
      }
      return;
    }
    this.betweenTimer -= dt;
    if (this.betweenTimer <= 0) {
      this._startWave();
      this.betweenTimer = 4;
    }
  }

  // ------------------------------------------------------------ 游戏循环
  _loop(ts) {
    const dt = this.lastTs ? Math.min(0.034, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (!this.paused && this.phase === "playing") this._update(dt * this.speed);
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - 46 * dt);
    this._updateWaves(dt);
    for (const t of this.towers) t.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const b of this.bullets) b.update(dt);
    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive || e.deathT < 0.8);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    this._updateEffects(dt);
    this._updateHUD();
    if (this.cheatInfiniteGold) this.gold = Math.max(this.gold, 9999);
    if (this.carrotHp <= 0) this._loseLevel();
  }

  _updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  onEnemyReach(enemy) {
    this.carrotHp -= enemy.type === "boss" ? 3 : 1;
    this.shake = 12;
    this.sfx.boom();
    this.spawnParticles(this.path.points[this.path.points.length - 1].x,
      this.path.points[this.path.points.length - 1].y - 30, 20, "#ff8a5a", "spark");
    this.addText(this.path.points[this.path.points.length - 1].x,
      this.path.points[this.path.points.length - 1].y - 70, `-${enemy.type === "boss" ? 3 : 1}`, "#ff9c8c");
    this._updateHUD();
  }

  splash(x, y, radius, damage, exclude) {
    for (const e of this.enemies) {
      if (!e.alive || e === exclude) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) e.takeDamage(damage);
    }
    this.spawnParticles(x, y, 12, "#ff8a4a", "spark");
  }

  spawnParticles(x, y, count, color, kind = "spark") {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-150, 150), vy: rand(-220, -20),
        life: rand(0.3, 0.8), maxLife: 0.8, size: rand(2, 5),
        color, kind, gravity: 420,
      });
    }
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color, life: 0.85, maxLife: 0.85 });
  }

  _showTip(text) {
    const el = document.getElementById("ctTip");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  _showBanner(title, sub, duration = 2) {
    this.banner = { title, sub, life: duration, max: duration };
  }

  // ------------------------------------------------------------ HUD
  _refreshTowerBar() {
    const bar = document.getElementById("ctTowerBar");
    if (bar.children.length !== TOWER_ORDER.length) {
      bar.innerHTML = TOWER_ORDER.map((id) => {
        const def = TOWERS[id];
        return `<button class="ct-tower-btn" data-tower="${id}" type="button">
          ${this._towerIcon(id)}
          <span class="tb-name">${def.name}</span>
          <span class="tb-cost">${def.cost}</span>
        </button>`;
      }).join("");
    }
    for (const btn of bar.children) {
      const id = btn.dataset.tower;
      const def = TOWERS[id];
      btn.classList.toggle("selected", this.selectedTowerType === id);
      btn.classList.toggle("cant", this.gold < def.cost);
    }
  }

  _towerIcon(id) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    if (id === "bottle") return `<svg ${common}><path d="M9 3h6v3l2 3v9a2 2 0 01-2 2h-6a2 2 0 01-2-2V9l2-3z"/><path d="M9 12h6"/></svg>`;
    if (id === "ice") return `<svg ${common}><path d="M12 3l7 17H5z"/><path d="M12 9v6M9.5 12h5"/></svg>`;
    if (id === "fire") return `<svg ${common}><path d="M12 21c-4 0-7-3-7-7 0-4 3-6 4-10 2 3 2 5 4 6 1-3 2-5 2-7 2 3 4 6 4 10 0 5-3 8-7 8z"/></svg>`;
    if (id === "lightning") return `<svg ${common}><path d="M13 2L5 14h6l-1 8 9-13h-6z"/></svg>`;
    return `<svg ${common}><path d="M3 20L20 4"/><path d="M14 3h7v7"/><path d="M3 13l7 7"/></svg>`;
  }

  _updateHUD() {
    document.getElementById("ctHp").textContent = String(Math.max(0, this.carrotHp));
    document.getElementById("ctGold").textContent = String(Math.floor(this.gold));
    const total = this.level ? (this.level.endless ? "∞" : this.level.waves.length) : 0;
    document.getElementById("ctWave").textContent = `${this.waveIndex}/${total}`;
    this._refreshTowerBar();
    if (this.selectedTower) this._refreshPanel();
  }

  _updateSoundButtons() {
    const on = this.soundOn !== false;
    const btn = document.getElementById("pauseSoundBtn");
    if (btn) btn.textContent = on ? "关闭音效" : "开启音效";
    const s = document.getElementById("ctSound");
    if (s) s.innerHTML = icon(on ? "sound" : "mute");
  }

  _toggleSound() {
    this.soundOn = !(this.soundOn !== false);
    this.sfx.enabled = this.soundOn;
    audio.setEnabled(this.soundOn);
    this.store.update((p) => { p.sound = this.soundOn; });
    this._updateSoundButtons();
    if (this.soundOn) { this.sfx.ensure(); this.sfx.coin(); }
  }

  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.phase !== "playing" || this.cheatOpen) return;
    this.cheatOpen = true;
    this.paused = true;
    this._updateCheatText();
    document.getElementById("cheatScreen").classList.add("show");
  }

  _closeCheat() {
    document.getElementById("cheatScreen").classList.remove("show");
    if (this.cheatOpen) {
      this.cheatOpen = false;
      if (this.phase === "playing") this.paused = false;
    }
  }

  _updateCheatText() {
    const el = document.getElementById("cheatGoldText");
    if (el) el.textContent = `金币无限：${this.cheatInfiniteGold ? "开" : "关"}`;
  }

  _handleCheat(action) {
    if (action === "close") { this._closeCheat(); return; }
    if (this.phase !== "playing") return;
    if (action === "gold") {
      this.gold += 1000;
      toast("金币 +1000", "ok");
    } else if (action === "heal") {
      this.carrotHp = this.level.carrotHp;
      toast("萝卜生命已回满", "ok");
    } else if (action === "kill") {
      for (const e of this.enemies) if (e.alive) e.takeDamage(99999);
      toast("已秒杀全场怪物", "ok");
    } else if (action === "maxTower") {
      for (const t of this.towers) {
        t.level = 3;
        t.invested = Math.max(t.invested, Math.round(t.def.cost * 2.2));
      }
      if (this.selectedTower) this._refreshPanel();
      toast("所有炮塔已升到 Lv.3", "ok");
    } else if (action === "infiniteGold") {
      this.cheatInfiniteGold = !this.cheatInfiniteGold;
      if (this.cheatInfiniteGold) this.gold = Math.max(this.gold, 9999);
      toast(`金币无限：${this.cheatInfiniteGold ? "开" : "关"}`, "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = TOTAL_LEVELS; p.tutorialSeen = true; });
      this._refreshSummary();
      toast("已解锁全部关卡", "ok");
    } else if (action === "win") {
      if (this.level.endless) {
        toast("无尽模式不能直接过关");
      } else {
        this._closeCheat();
        this._winLevel();
      }
    }
    this._updateCheatText();
    this._updateHUD();
  }

  _openPause() {
    if (this.phase !== "playing" || this.paused) return;
    this.paused = true;
    document.getElementById("pauseScreen").classList.add("show");
    this._updateSoundButtons();
  }

  _closePause() {
    document.getElementById("pauseScreen").classList.remove("show");
    this.paused = false;
    this.sfx.ensure();
  }

  // ------------------------------------------------------------ 结算
  _winLevel() {
    if (this.phase !== "playing") return;
    const stars = this.carrotHp >= 9 ? 3 : this.carrotHp >= 5 ? 2 : 1;
    this.store.update((p) => {
      const next = Math.min(TOTAL_LEVELS, this.level.id + 1);
      p.unlocked = Math.max(Number(p.unlocked) || 1, next);
      p.stars[this.level.id] = Math.max(Number(p.stars[this.level.id]) || 0, stars);
      p.cleared[this.level.id] = true;
    });
    this.phase = "over";
    this.sfx.win();
    this._showResult(true, stars, false);
  }

  _loseLevel() {
    if (this.phase !== "playing") return;
    this.phase = "over";
    if (this.level.endless) {
      const best = Math.max(this.endlessBest, this.waveIndex);
      this.endlessBest = best;
      this.store.update((p) => { p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.waveIndex); });
    }
    this.sfx.lose();
    this._showResult(false, 0, Boolean(this.level.endless));
  }

  _showResult(win, stars, isEndless) {
    const $ = (id) => document.getElementById(id);
    $("resultStars").style.display = isEndless ? "none" : "flex";
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = `${i * 0.12}s`;
    });
    $("resultTitle").textContent = isEndless ? "无尽模式结束" : win ? "萝卜安全了！" : "萝卜被吃掉了";
    $("resultTitle").style.color = win || isEndless ? "#3d5a1d" : "#a33a2c";
    $("resultSub").textContent = isEndless ? `坚持到第 ${this.waveIndex} 波` : `第 ${this.level.id} 关 · ${this.level.name}`;
    $("statHp").textContent = String(Math.max(0, this.carrotHp));
    $("statKills").textContent = String(this.kills);
    $("statWave").textContent = isEndless ? `第 ${this.waveIndex} 波` : `${this.waveIndex}/${this.level.waves.length}`;
    const note = isEndless
      ? `本局坚持到第 ${this.waveIndex} 波 · 历史最佳 ${this.endlessBest} 波`
      : win
        ? stars === 3 ? "三星达成：萝卜几乎毫发无伤" : "关卡进度已保存"
        : "再调整一下炮塔位置和升级顺序";
    $("resultNote").textContent = note;
    const next = $("nextBtn");
    if (win && !isEndless) {
      next.style.display = "";
      next.textContent = this.level.id < TOTAL_LEVELS ? "下一关" : "无尽模式";
    } else {
      next.style.display = "none";
    }
    $("resultScreen").classList.add("show");
  }

  // ------------------------------------------------------------ 渲染
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.level) {
      ctx.fillStyle = "#74c04b";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    if (this.shake > 0.5) ctx.translate(rand(-this.shake, this.shake) * 0.4, rand(-this.shake, this.shake) * 0.4);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawSpots(ctx);
    this._drawCarrot(ctx);
    for (const t of this.towers) t.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this._drawBeams(ctx);
    this._drawParticles(ctx);
    this._drawTexts(ctx);
    this._drawBanner(ctx);
    ctx.restore();
  }

  _drawSpots(ctx) {
    for (const s of this.spots) {
      if (s.tower) continue;
      const hover = this.hoverSpot === s;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = hover ? "rgba(255, 230, 150, .35)" : "rgba(255, 255, 255, .16)";
      ctx.strokeStyle = hover ? "rgba(255, 220, 130, .9)" : "rgba(255, 255, 255, .45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 12, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hover ? "#fff3c8" : "rgba(255,255,255,.75)";
      ctx.font = "900 17px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", 0, -1);
      ctx.restore();
    }
    if (this.hoverSpot && this.selectedTowerType) {
      const def = TOWERS[this.selectedTowerType];
      ctx.save();
      ctx.strokeStyle = "rgba(255, 220, 120, .55)";
      ctx.fillStyle = "rgba(255, 220, 120, .08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.hoverSpot.x, this.hoverSpot.y, def.range, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawCarrot(ctx) {
    const p = this.path.points[this.path.points.length - 1];
    const bob = Math.sin(this.time * 3) * 2;
    ctx.save();
    ctx.translate(p.x, p.y - 20 + bob);
    ctx.fillStyle = "rgba(30, 20, 10, .22)";
    ctx.beginPath();
    ctx.ellipse(0, 26, 28, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff9a3d";
    ctx.strokeStyle = "#a94a12";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 30, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb35e";
    ctx.beginPath();
    ctx.ellipse(-8, -8, 8, 12, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#4f9a3a";
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(-0.5 + i * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, -38, 6, 17, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#2a1608";
    ctx.beginPath();
    ctx.arc(-8, -3, 2.6, 0, TAU);
    ctx.arc(8, -3, 2.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#2a1608";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 6, 7, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "#ffe08a";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`♥ ${Math.max(0, this.carrotHp)}`, 0, -58);
    ctx.restore();
  }

  _drawBeams(ctx) {
    for (const beam of this.beams) {
      ctx.save();
      ctx.globalAlpha = clamp(beam.life / beam.max, 0, 1);
      ctx.strokeStyle = "#d9c2ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#b58cff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < beam.points.length; i++) {
        const p = beam.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          const prev = beam.points[i - 1];
          ctx.lineTo((prev.x + p.x) / 2 + rand(-8, 8), (prev.y + p.y) / 2 + rand(-8, 8));
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "900 16px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.strokeStyle = "rgba(30,40,15,.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  _drawBanner(ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = 1 - clamp(b.life / b.max, 0, 1);
    const alpha = b.life < 0.3 ? clamp(b.life / 0.3, 0, 1) : Math.min(1, k * 5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 220);
    ctx.fillStyle = "rgba(24, 40, 16, .82)";
    ctx.strokeStyle = "rgba(255, 220, 130, .55)";
    ctx.lineWidth = 2;
    roundRect(ctx, -210, -44, 420, 82, 16);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe6a8";
    ctx.font = "900 30px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText(b.title, 0, -2);
    ctx.fillStyle = "rgba(245,238,215,.75)";
    ctx.font = "600 12px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText(b.sub || "", 0, 24);
    ctx.restore();
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.__carrot = new CarrotGame();
