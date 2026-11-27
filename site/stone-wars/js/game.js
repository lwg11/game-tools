/**
 * 石器大战 · 回合制物理对战
 * ------------------------------------------------------------
 * 核心循环：
 * 玩家回合（移动/瞄准/发射） -> 弹道结算 -> 敌方 AI 回合 -> 下一回合
 * 地形为可破坏瓦片网格，爆炸会改变地形与落点。
 */
import "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { icon, toast } from "../../assets/js/ui.js";
import { audio } from "../../assets/js/audio.js";
import { isCrazy, applyBodyMode } from "../../assets/js/mode.js";
import { ENEMY_TYPES, ERAS, ERA_WEAPONS, LEVELS, THEMES, WEAPONS, WEAPON_ORDER, STAGE_WEAPONS, CULTIVATION_STAGES, ammoFor, getEndlessLevel, getEndlessEra, getEra, getLevel, stageIndexOf, stageNameOf, weaponsForLevel } from "./levels.js";
import { H, TAU, W, clamp, rand } from "./common.js";
import { Sfx } from "./sfx.js";
import { Projectile, Unit } from "./entities.js";
import { Terrain, mulberry32 } from "./terrain.js";
import { preventBrowserGestures } from "../../assets/js/gestures.js";

preventBrowserGestures();

// ---------------------------------------------------------------- 游戏主体
class StoneWars {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.sfx = new Sfx();
    this.store = new ProgressStore("stone-wars");
    this.level = null;
    this.terrain = null;
    this.theme = THEMES.dawn;
    this.players = [];
    this.enemies = [];
    this.units = [];
    this.projectiles = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.ambient = [];
    this.timers = [];
    this.phase = "menu";
    this.paused = true;
    this.turnTeam = 0;
    this.turnNo = 1;
    this.battleTime = 0;
    this.wind = 0;
    this.windTimer = 7;
    this.moveBudget = 0;
    this.maxMove = 150;
    this.activePlayerIndex = 0;
    this.activeEnemyIndex = 0;
    this.era = ERAS.stone;
    this.crazy = isCrazy();
    applyBodyMode();
    window.addEventListener("gt:mode-changed", () => { this.crazy = isCrazy(); });
    this.fires = [];
    // 万剑归宗：剑雨中的飞剑列表
    this.swordRain = [];
    this.weaponIds = [...ERA_WEAPONS.stone];
    this.selectedWeapon = "spear";
    this.ammo = {};
    this.weaponReadyAt = {};
    this.weaponBarExpanded = false;
    this.endlessWave = 0;
    this.endlessWaveTimer = 0;
    this.endlessRefillTimer = 0;
    this.aim = {
      active: false,
      locked: false,
      angle: -0.6,
      power: 0.8,
      startWorld: null,
      currentWorld: null,
      dragLen: 0,
      maxDrag: 0,
    };
    this.enemyAim = null;
    this.aiMove = null;
    this.resolveT = null;
    this.shake = 0;
    this.time = 0;
    this.lastTs = 0;
    this.cheatGod = false;
    this.cheatInfiniteAmmo = false;
    this.cheatRealtime = false;
    this.cheatDifficulty = 0;
    this.cheatAllWeapons = false;   // 金手指：解锁全部技能与武器
    this.cheatNoCooldown = false;   // 金手指：技能武器无冷却
    this.cheatOpen = false;
    this.baseWeaponIds = [...ERA_WEAPONS.stone];
    this.muzzleFlashes = [];
    this.glows = [];
    this.fires = [];
    this.screenFlash = 0;
    this.flashColor = "#ffd08a";
    this.bg = null;
    this.terrainDirty = false;
    this.terrainDrawnFor = null;
    this.result = null;
    this.touch = { left: false, right: false };
    this.keys = {};
    this.hintTimer = null;
    this.bannerTimer = null;
    this.lastEnemyTarget = null;
    this._bindUI();
    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());
    this._hudIcons();
    requestAnimationFrame((ts) => this._loop(ts));
    this._boot();
  }

  // ------------------------------------------------------------ 启动
  async _boot() {
    document.getElementById("levelScreen").classList.add("show");
    this._renderLevelGrid();
    await this.store.init();
    this.soundOn = this.store.state.sound !== false;
    this.sfx.enabled = this.soundOn;
    audio.setEnabled(this.soundOn);
    audio.setMusic("stone");
    this._updateSoundButtons();
    this._refreshLevelSummary();
    this.store.onChange(() => this._refreshLevelSummary());
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客模式 */ }
    if (!this.store.state.tutorialSeen) {
      this._showTutorial(true);
    }
  }

  _hudIcons() {
    document.getElementById("hudHome").innerHTML = icon("home");
    document.getElementById("hudPause").innerHTML = icon("pause");
    this._updateSoundButtons();
  }

  _updateSoundButtons() {
    const on = this.soundOn !== false;
    const soundBtn = document.getElementById("hudSound");
    if (soundBtn) soundBtn.innerHTML = icon(on ? "sound" : "mute");
    const pauseBtn = document.getElementById("pauseSoundBtn");
    if (pauseBtn) pauseBtn.textContent = on ? "关闭音效" : "开启音效";
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("hudHome").addEventListener("click", () => { this.sfx.click(); this._openLevelScreen(); });
    $("hudPause").addEventListener("click", () => { this.sfx.click(); this._openPause(); });
    $("hudSound").addEventListener("click", () => this._toggleSound());
    $("hudCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });
    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") this._closeCheat();
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());
    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("tutorialBtn").addEventListener("click", () => this._showTutorial(false));
    $("tutorialStart").addEventListener("click", () => this._startFromTutorial());
    $("tutorialScreen").addEventListener("click", (e) => {
      if (e.target.id === "tutorialScreen") this._startFromTutorial();
    });
    $("continueBtn").addEventListener("click", () => {
      const id = clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
      this.startLevel(id);
    });
    $("levelGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-level]");
      if (card && !card.classList.contains("locked")) this.startLevel(Number(card.dataset.level));
    });
    $("nextBtn").addEventListener("click", () => {
      if (!this.level) return;
      if (this.level.endless) { this.startLevel(0); return; }
      const next = this.level.id + 1;
      if (next <= LEVELS.length) this.startLevel(next);
      else this.startLevel(0);
    });
    $("retryBtn").addEventListener("click", () => { if (this.level) this.startLevel(this.level.id); });
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("rotateTip").addEventListener("click", () => document.getElementById("rotateTip").classList.add("hide"));
    $("switchUnit").addEventListener("click", () => { this.sfx.ensure(); this._cyclePlayer(); });

    // 武器栏：展开/收起 + 切换武器
    $("weaponToggle").addEventListener("click", (e) => {
      e.stopPropagation();
      this.sfx.ensure();
      this.sfx.click();
      this.weaponBarExpanded = !this.weaponBarExpanded;
      this._refreshWeaponBar();
    });
    $("weaponBar").addEventListener("click", (e) => {
      const card = e.target.closest("[data-weapon]");
      if (!card) return;
      if (this.phase !== "aim" || this.paused) return;
      const id = card.dataset.weapon;
      if ((this.ammo[id] || 0) <= 0) {
        toast("该武器弹药已耗尽");
        return;
      }
      this.selectedWeapon = id;
      this.sfx.ensure();
      this.sfx.click();
      // 选中后自动收起
      this.weaponBarExpanded = false;
      this._refreshWeaponBar();
      this._refreshFireButton();
      this._updateHUD();
    });

    // 画布瞄准
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointercancel", () => {
      this.aim.active = false;
      this.aim.startWorld = null;
      this.aim.currentWorld = null;
      this.aim.dragLen = 0;
      document.getElementById("weaponBar").classList.remove("aiming");
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // 移动按钮（支持按住）
    document.querySelectorAll("[data-move]").forEach((btn) => {
      const dir = btn.dataset.move;
      const set = (on) => {
        this.touch[dir] = on;
        btn.classList.toggle("held", on);
        if (on) this.sfx.ensure();
      };
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
      btn.addEventListener("pointerup", () => set(false));
      btn.addEventListener("pointerleave", () => set(false));
      btn.addEventListener("pointercancel", () => set(false));
    });
    // 跳跃按钮：用 pointerdown 即时响应，支持按住移动键的同时斜跳
    document.querySelector("[data-jump]").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.phase !== "aim" || this.paused) return;
      const u = this._activePlayer();
      if (u) u.jump(this._moveDir());
    });

    // 键盘
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (this.aim.active || this.aim.locked) {
          e.preventDefault();
          this._cancelAim();
        } else if (this.phase === "aim") {
          this._openPause();
        }
        return;
      }
      if (this.paused || this.phase !== "aim") return;
      if (["a", "arrowleft", "d", "arrowright", "w", "arrowup", " "].includes(k)) {
        e.preventDefault();
        this.keys[k] = true;
if ((k === "w" || k === "arrowup" || k === " ") && !e.repeat) {
const u = this._activePlayer();
if (u) u.jump(this._moveDir());
}
      }
      if (/^[1-9]$/.test(k)) {
        const id = this.weaponIds[Number(k) - 1];
        if (id && (this.ammo[id] || 0) > 0) {
          this.selectedWeapon = id;
          this._refreshWeaponBar();
          this.sfx.ensure();
          this.sfx.click();
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !this.paused && this.level && this.phase !== "over") this._openPause();
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this._resizeCanvas(), 220);
    });
  }

  // ------------------------------------------------------------ 关卡选择
  _renderLevelGrid() {
    const stars = this.store.state.stars || {};
    const unlocked = clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    const endlessBest = Number(this.store.state.endlessBest) || 0;
    const grid = document.getElementById("levelGrid");
    // 关卡选择按「时代分组」排列：同一时代的关卡（含 21+ 进阶关）放在一起，
    // 同时代内仍按关卡号升序；id 与存档进度保持不变。
    const ERA_RANK = { stone: 0, iron: 1, gun: 2, mech: 3, cultivation: 4 };
    const ordered = LEVELS.slice().sort(
      (a, b) => (ERA_RANK[a.era] - ERA_RANK[b.era]) || (a.id - b.id)
    );
    const cards = ordered.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const themeClass = "theme-" + (lv.theme || "dawn");
      const era = getEra(lv.era);
      const stageLabel = stageNameOf(lv) || era.short;
      const current = !locked && lv.id === unlocked && !this.store.state.cleared[lv.id];
      return `<button class="level-card ${themeClass} era-${era.id} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? "aria-disabled=\"true\"" : ""}>
        <div class="lv-top"><span class="lv-num">${String(lv.id).padStart(2, "0")}<small>关</small></span><span class="lv-era" style="--era:${era.accent}">${stageLabel}</span>${locked ? icon("lock") : ""}</div>
        <div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</div>
        </div>
        ${locked ? '<span class="lv-lock">' + icon("lock") + "</span>" : ""}
      </button>`;
    });
    cards.push(`<button class="level-card endless-card" data-level="0">
      <div class="lv-top"><span class="lv-num">∞<small>无限</small></span></div>
      <div>
        <div class="lv-name">无限模式</div>
        <div class="lv-stars">${endlessBest > 0 ? `最高 ${endlessBest} 波` : "越战越强"}</div>
      </div>
    </button>`);
    grid.innerHTML = cards.join("");
  }

  _refreshLevelSummary() {
    const state = this.store.state;
    const stars = state.stars || {};
    const total = Object.values(stars).reduce((a, b) => a + (Number(b) || 0), 0);
    const unlocked = clamp(Number(state.unlocked) || 1, 1, LEVELS.length);
    const cleared = Object.keys(state.cleared || {}).length;
    document.getElementById("totalStars").textContent = String(total);
    document.getElementById("overallBar").style.width = Math.round((cleared / LEVELS.length) * 100) + "%";
    document.getElementById("progressText").textContent =
      `已解锁 ${unlocked} / ${LEVELS.length} 关 · 已获得 ${total} / ${LEVELS.length * 3} 星`;
    const btn = document.getElementById("continueBtn");
    if (total === 0 && cleared === 0) btn.textContent = "开始第 1 关";
    else if (cleared >= LEVELS.length) btn.textContent = `再战第 ${LEVELS.length} 关`;
    else btn.textContent = `继续第 ${unlocked} 关`;
    this._renderLevelGrid();
  }

  _showTutorial(firstTime) {
    this.firstTutorial = firstTime;
    const start = document.getElementById("tutorialStart");
    const id = clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    start.textContent = firstTime ? "开始第 1 关" : `开始第 ${id} 关`;
    document.getElementById("tutorialScreen").classList.add("show");
  }

  _startFromTutorial() {
    document.getElementById("tutorialScreen").classList.remove("show");
    if (!this.store.state.tutorialSeen) {
      this.store.update((p) => { p.tutorialSeen = true; });
    }
    const id = this.firstTutorial ? 1 : clamp(Number(this.store.state.unlocked) || 1, 1, LEVELS.length);
    this.startLevel(id);
  }

  _openLevelScreen() {
    this.paused = true;
    this.phase = "menu";
    this._hideScreens();
    document.getElementById("levelScreen").classList.add("show");
    this._refreshLevelSummary();
    this._clearTimers();
  }

  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  // ------------------------------------------------------------ 开局
  startLevel(id) {
    this._hideScreens();
    this.level = id === 0 ? getEndlessLevel() : getLevel(id);
    this.era = getEra(this.level.era || "stone");
    this.theme = THEMES[this.level.theme] || THEMES.dawn;
    this.terrain = new Terrain(this.level);
    this.terrainDirty = false;
    this.projectiles = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.timers = [];
    this.muzzleFlashes = [];
    this.glows = [];
    this.fires = [];
    this.swordRain = [];
    this.screenFlash = 0;
    this.units = [];
    this.players = [];
    this.enemies = [];
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.angle = -0.6;
    this.aim.power = 0.8;
    this.enemyAim = null;
    this.aiMove = null;
    this.resolveT = null;
    this.shake = 0;
    this.time = 0;
    this.battleTime = 0;
    this.result = null;
    this.turnNo = 1;
    this.turnTeam = 0;
    this.moveBudget = this.maxMove;
    this.activePlayerIndex = 0;
    this.activeEnemyIndex = 0;
    this.lastEnemyTarget = null;
    this.weaponReadyAt = {};
    this.windTimer = rand(6, 9);
    this.endlessWave = 0;
    this.endlessWaveTimer = this.level.endless ? 3 : 0;
    this.endlessCleared = false;
    this.endlessBest = Number(this.store.state.endlessBest) || 0;
    this.cheatOpen = false;
    document.getElementById("cheatScreen").classList.remove("show");

    // 技能/武器按阶段与境界从低到高递进解锁；金手指可强制全量解锁
    this.baseWeaponIds = weaponsForLevel(this.level);
    this.weaponIds = this.cheatAllWeapons ? [...WEAPON_ORDER] : [...this.baseWeaponIds];
    this.ammo = ammoFor(this.level, this.weaponIds);
    this.selectedWeapon = this.weaponIds.find((k) => (this.ammo[k] || 0) > 0) || this.weaponIds[0];
    // 进入新阶段/新境界的首关，提示新解锁的技能
    if (!this.level.endless && !this.cheatAllWeapons) {
      const st = stageIndexOf(this.level);
      if (st && st.index > 0 && st.realm && this.level.id === st.realm.levels[0]) {
        const prevList = st.era.id === "cultivation"
          ? CULTIVATION_STAGES[st.index - 1].weapons
          : (STAGE_WEAPONS[st.era.id] || [])[st.index - 1] || [];
        const curList = this.baseWeaponIds;
        const fresh = curList.filter((w) => !prevList.includes(w));
        if (fresh.length) {
          toast(`【${st.realm.name}】解锁 ${fresh.length} 个新技能：${fresh.map((id) => (WEAPONS[id] ? WEAPONS[id].name : id)).join("、")}`, "ok");
        }
      }
    }

    const nameSets = {
      stone: ["阿石", "阿木", "阿火"],
      iron: ["铁牙", "铁盾", "铁锤"],
      gun: ["老枪", "快枪", "炮手"],
      mech: ["零式", "壹式", "贰式"],
      cultivation: ["青云", "紫霞", "玄明"],
    };
    const names = nameSets[this.era.id] || nameSets.stone;
    const playerHp = this.era.playerHp || 100;
    (this.level.player || []).forEach((p, i) => {
      const x = clamp(p.x, 20, W - 20);
      const y = this._spawnY(x);
      const u = new Unit(this, 0, x, y, "player", p.hp || playerHp, i, names[i] || "族人" + (i + 1));
      this.players.push(u);
      this.units.push(u);
    });
    const hpMul = (this.level.endless ? 1.35 : 1.25) * this._difficulty().hp;
    (this.level.enemies || []).forEach((e, i) => {
      const cfg = ENEMY_TYPES[e.type] || ENEMY_TYPES.grunt;
      const x = clamp(e.x, 20, W - 20);
      const y = this._spawnY(x);
      const baseHp = e.hp || cfg.hp;
      const u = new Unit(this, 1, x, y, e.type || "grunt", Math.round(baseHp * hpMul), i, cfg.name + " " + (i + 1));
      u.baseHp = baseHp;
      u.aiTimer = rand(0.9, 2.2) + i * 0.18;
      u.aiMoveTimer = rand(0.8, 2.0);
      this.enemies.push(u);
      this.units.push(u);
    });

    this.turnLimit = this.level.endless ? Infinity : (Number(this.level.turnLimit) || 99);
    this.wind = this._rollWind();
    this.phase = "aim";
    this.paused = false;
    this._buildBackground();
    this._makeAmbient();
    this._refreshWeaponBar();
    this._updateHUD();
    this._showAimHint();
    this._clearTimers();
    this.sfx.ensure();
    this._beginPlayerTurn();
    if (this.cheatRealtime) this._syncRealtimeMode(true);
  }

  _spawnY(x) {
    // 从战场中段向下扫描：避开洞顶石笋与高空浮台，让单位落在可行走的地面上
    let y = this.terrain.surfaceBelow(x, 300);
    if (y === null) y = this.terrain.surfaceTop(x);
    if (y === null) y = H - 60;
    return y;
  }

  _rollWind() {
    const max = Number(this.level.windMax) || 2;
    return Math.round(rand(-max, max) * 10) / 10;
  }

  _activePlayer() {
    for (let i = 0; i < this.players.length; i++) {
      const idx = (this.activePlayerIndex + i) % this.players.length;
      if (this.players[idx].alive) {
        this.activePlayerIndex = idx;
        return this.players[idx];
      }
    }
    return null;
  }

  _activeEnemy() {
    for (let i = 0; i < this.enemies.length; i++) {
      const idx = (this.activeEnemyIndex + i) % this.enemies.length;
      if (this.enemies[idx].alive) {
        this.activeEnemyIndex = idx;
        return this.enemies[idx];
      }
    }
    return null;
  }

  // ------------------------------------------------------------ 输入
  _onPointerDown(e) {
    if (this.paused || this.phase !== "aim") return;
    const u = this._activePlayer();
    if (!u || !u.alive) return;
    e.preventDefault();
    this.sfx.ensure();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._canvasPoint(e);
    // 以按下点作为虚拟摇杆原点，拖动方向即射击方向，手指不必伸到敌人身上
    this.aim.active = true;
    this.aim.startWorld = { x: p.x, y: p.y };
    this.aim.currentWorld = { x: p.x, y: p.y };
    this.aim.dragLen = 0;
    this.aim.maxDrag = 0;
    this.aim.power = 0.1;
    // 拖动瞄准时自动收起武器栏，避免遮挡弹道与落点
    if (this.weaponBarExpanded) {
      this.weaponBarExpanded = false;
      this._refreshWeaponBar();
    }
    document.getElementById("weaponBar").classList.add("aiming");
  }

  _onPointerMove(e) {
    if (!this.aim.active || this.paused) return;
    e.preventDefault();
    this._updateAimFromEvent(e);
  }

  _onPointerUp(e) {
    if (!this.aim.active) return;
    e.preventDefault();
    const maxDrag = this.aim.maxDrag;
    const angle = this.aim.angle;
    const power = this.aim.power;
    const tap = this.aim.startWorld ? { ...this.aim.startWorld } : null;
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.maxDrag = 0;
    // 松手后恢复武器栏显示
    document.getElementById("weaponBar").classList.remove("aiming");

    // 轻点队友可以切换操控单位
    if (maxDrag < 40) {
      if (tap) {
        const other = this.players.find((p) => p.alive && p !== this._activePlayer()
          && Math.hypot(p.x - tap.x, p.y - 30 - tap.y) < 55);
        if (other) {
          this._setActivePlayer(other.index);
          return;
        }
      }
      toast("按住后朝射击方向拖远一点，松手发射");
      return;
    }

    // 松手即发射：不再因拖回原点而取消，避免误触丢回合
    this.firePlayer(angle, power);
  }

  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  _updateAimFromEvent(e) {
    const u = this._activePlayer();
    if (!u) return;
    if (!this.aim.startWorld) return;
    const p = this._canvasPoint(e);
    this.aim.currentWorld = p;
    const dx = p.x - this.aim.startWorld.x;
    const dy = p.y - this.aim.startWorld.y;
    const len = Math.hypot(dx, dy);
    this.aim.dragLen = len;
    this.aim.maxDrag = Math.max(this.aim.maxDrag || 0, len);
    // 角度死区 + 更慢的平滑：轻微手抖不会让准星乱跳
    if (len >= 32) {
      const raw = Math.atan2(dy, dx);
      let delta = raw - this.aim.angle;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      this.aim.angle += delta * 0.22;
    }
    // 世界坐标下拖动 58~528px 映射为 10%~100% 力度：
    // 拉长行程后，手指移动同样的距离，抛物线变化更细腻
    this.aim.power = clamp((len - 58) / 470, 0.1, 1);
    u.facing = Math.cos(this.aim.angle) >= 0 ? 1 : -1;
  }

  /** 刷新换人按钮与其他瞄准 UI */
  _refreshFireButton() {
    const sw = document.getElementById("switchUnit");
    if (sw) sw.style.display = this.players.filter((p) => p.alive).length > 1 ? "" : "none";
  }

  _cancelAim() {
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.maxDrag = 0;
    this._refreshFireButton();
    this._updateHUD();
  }

  _setActivePlayer(index) {
    const u = this.players[index];
    if (!u || !u.alive || index === this.activePlayerIndex) return;
    this.activePlayerIndex = index;
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.addText(u.x, u.y - 92, u.name, "#ffd27c");
    this._refreshFireButton();
    this._updateHUD();
  }

  _cyclePlayer() {
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) return;
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (this.activePlayerIndex + i) % this.players.length;
      if (this.players[idx].alive) {
        this._setActivePlayer(idx);
        return;
      }
    }
  }

  // ------------------------------------------------------------ 玩家行动
  firePlayer(angle = this.aim.angle, power = this.aim.power) {
    if (this.phase !== "aim" || this.paused || this.turnTeam !== 0) return false;
    const u = this._activePlayer();
    if (!u || !u.alive) return false;
    let id = this.selectedWeapon;
    if ((this.ammo[id] || 0) <= 0) {
      id = this._fallbackWeapon();
      this.selectedWeapon = id;
    }
    const w = WEAPONS[id];
    const crazy = this.crazy;
    const readyAt = this.weaponReadyAt[id] || 0;
    if (!this.cheatNoCooldown && this.time < readyAt) {
      toast(`${w.name}冷却中`);
      return false;
    }
    if (this.ammo[id] !== Infinity && !this.cheatInfiniteAmmo && !crazy) {
      this.ammo[id] = Math.max(0, this.ammo[id] - 1);
    }
    // 疯狂模式：射速翻倍、双发齐射、伤害与爆炸范围暴涨；金手指可无冷却
    const cdMul = crazy ? 0.42 : 1;
    this.weaponReadyAt[id] = this.time + (this.cheatNoCooldown ? 0 : (w.cooldown || 1) * cdMul);
    // buff 类技能：直接生效，不发射投射物
    if (w.kind === "buff") {
      this._applyBuff(w, u);
      this.aim.active = false;
      this.aim.locked = false;
      this.shotReadyT = 0.55;
      this.phase = "flying";
      this.turnTeam = 0;
      this.resolveT = null;
      this._addTimer(0.5, () => this._finishShot());
      return true;
    }
    const speed = w.speed * (0.5 + 0.5 * power);
    const ox = u.x;
    const oy = u.y - 44;
    const shots = crazy
      ? [{ a: angle - 0.05, mul: 1.8 }, { a: angle + 0.05, mul: 1.8 }]
      : [{ a: angle, mul: 1 }];
    for (const s of shots) {
      const p = new Projectile(
        this, id,
        ox + Math.cos(s.a) * 26, oy + Math.sin(s.a) * 26,
        Math.cos(s.a) * speed, Math.sin(s.a) * speed, 0
      );
      p.damageMul = s.mul;
      p.blastMul = crazy ? 1.4 : 1;
      this.projectiles.push(p);
    }
    u.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.aim.angle = angle;
    this.aim.power = power;
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.maxDrag = 0;
    this.shotReadyT = 0.55;
    // 枪口焰、后坐与震屏，让每种武器的“威力”看得见
    const mx = ox + Math.cos(angle) * 32;
    const my = oy + Math.sin(angle) * 32;
    this.muzzleFlashes.push({ x: mx, y: my, angle, t: 0.14, max: 0.14, color: w.color, size: 10 + w.blast * 0.12 });
    this.glows.push({ x: mx, y: my, r: 24 + w.blast * 0.4, life: 0.22, max: 0.22, color: w.color });
    this.spawnParticles(mx, my, 8 + Math.round(w.blast / 16), w.color, "spark");
    if (w.blast >= 70) {
      this.shake = Math.max(this.shake, 3 + w.blast * 0.05);
      u.recoil = 0.18;
      u.vx -= Math.cos(angle) * 115;
    } else {
      this.shake = Math.max(this.shake, 1.6);
    }
    this.sfx.shoot(id);
    if (this.cheatRealtime) {
      // 实时开火：不进入飞行结算，也不切换回合
      this.phase = "aim";
      this.turnTeam = 0;
      this.moveBudget = this.maxMove;
      this._refreshWeaponBar();
      this._refreshFireButton();
      this._updateHUD();
      this._hideAimHint();
      return true;
    }
    // 回合制：发射后进入飞行结算，弹道结束后轮到敌方
    this.phase = "flying";
    this.turnTeam = 0;
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
    this._hideAimHint();
    return true;
  }

  _fallbackWeapon() {
    return this.weaponIds.find((k) => (this.ammo[k] || 0) > 0) || this.weaponIds[0] || "spear";
  }

  /** 应用 buff 类技能效果 */
  _applyBuff(w, caster) {
    const allies = this.units.filter((u) => u.alive && u.team === caster.team);
    if (w.buffType === "shield") {
      // 护体符：为全体友军施加护盾
      for (const u of allies) {
        u.shield = Math.max(u.shield, w.buffVal);
        u.shieldT = w.buffDur;
        this.spawnParticles(u.x, u.y - 40, 12, "#ffd25e", "spark");
        this.addText(u.x, u.y - 80, "护体", "#ffd25e");
      }
      this.sfx.shoot("shieldcharm");
      this._showBanner("护体符", `全体友军获得 ${w.buffVal} 点护盾`, true);
    } else if (w.buffType === "heal") {
      // 回春术：持续回血
      for (const u of allies) {
        u.regenT = w.buffDur;
        u.regenRate = w.buffVal;
        this.spawnParticles(u.x, u.y - 40, 10, "#6affa8", "spark");
        this.addText(u.x, u.y - 80, "回春", "#6affa8");
      }
      this.sfx.shoot("heal");
      this._showBanner("回春术", `全体友军持续回血 ${w.buffDur} 秒`, true);
    } else if (w.buffType === "teleport") {
      // 瞬移：向瞄准方向瞬移一段距离
      const dir = caster.facing;
      const tx = clamp(caster.x + dir * 200, 40, W - 40);
      const gy = this.terrain.surfaceBelow(tx, 0);
      if (gy !== null) {
        this.spawnParticles(caster.x, caster.y - 30, 16, "#6fe8ff", "spark");
        caster.x = tx;
        caster.y = gy;
        caster.vy = 0;
        caster.onGround = true;
        this.spawnParticles(caster.x, caster.y - 30, 16, "#6fe8ff", "spark");
        this.addText(caster.x, caster.y - 80, "瞬移", "#6fe8ff");
      }
      this.sfx.shoot("teleport");
    } else if (w.buffType === "mend") {
      // 补天术：全体友军恢复至上回合血量，并修复被破坏的地形
      for (const u of allies) {
        if (!u.alive) continue;
        const healed = Math.max(0, u.prevHp - u.hp);
        u.hp = Math.min(u.maxHp, u.prevHp);
        this.spawnParticles(u.x, u.y - 40, 14, "#a8ffd8", "spark");
        this.addText(u.x, u.y - 80, healed > 0 ? `补天 +${Math.round(healed)}` : "补天", "#a8ffd8");
      }
      // 恢复地形到上一回合快照
      if (this.terrainSnapshot) {
        this.terrain.restore(this.terrainSnapshot);
        this.terrainDirty = true;
        // 地形恢复时的绿色光柱特效
        for (let i = 0; i < 20; i++) {
          const a = rand(0, TAU);
          const r = rand(40, 200);
          this.particles.push({
            x: caster.x + Math.cos(a) * r, y: caster.y - 40 + Math.sin(a) * r * 0.4,
            vx: Math.cos(a) * 40, vy: rand(-120, -40),
            life: rand(0.5, 1.0), maxLife: 1.0, size: rand(2, 5),
            color: "#a8ffd8", kind: "spark", gravity: -60,
          });
        }
        this.rings.push({ x: caster.x, y: caster.y - 40, r: 20, max: 260, t: 0, life: 0.6, color: "rgba(168,255,216,.6)" });
      }
      this.sfx.shoot("mend");
      this._showBanner("补天术", "全体友军恢复至上回合血量 · 地形修复", true);
    }
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
  }

  // ------------------------------------------------------------ 难度 / 实时模式
  _difficulty() {
    const list = [
      { name: "普通", acc: 0, rate: 1, dmg: 1, hp: 1 },
      { name: "困难", acc: 0.12, rate: 0.8, dmg: 1.15, hp: 1.2 },
      { name: "噩梦", acc: 0.24, rate: 0.62, dmg: 1.3, hp: 1.45 },
    ];
    return list[this.cheatDifficulty] || list[0];
  }

  _toggleDifficulty() {
    this.cheatDifficulty = (this.cheatDifficulty + 1) % 3;
    this._applyDifficulty();
    const d = this._difficulty();
    this._showBanner(`难度：${d.name}`, `敌方命中 +${Math.round(d.acc * 100)}% · 血量 ×${d.hp}`, true);
    this._refreshCheatUI();
    this._updateHUD();
  }

  _applyDifficulty() {
    if (!this.level) return;
    const mul = (this.level.endless ? 1.35 : 1.25) * this._difficulty().hp;
    for (const u of this.enemies) {
      if (!u.alive) continue;
      const ratio = u.maxHp ? u.hp / u.maxHp : 1;
      u.maxHp = Math.max(1, Math.round((u.baseHp || u.maxHp) * mul));
      u.hp = Math.max(1, Math.round(u.maxHp * ratio));
    }
  }

  _toggleRealtime() {
    this.cheatRealtime = !this.cheatRealtime;
    this._syncRealtimeMode(true);
    this._refreshCheatUI();
  }

  _syncRealtimeMode(announce) {
    if (!this.level) return;
    if (this.cheatRealtime) {
      this._clearTimers();
      this.enemyMove = null;
      this.aiMove = null;
      this.enemyAim = null;
      this.phase = "aim";
      this.turnTeam = 0;
      this.moveBudget = this.maxMove;
      for (const u of this.enemies) {
        u.aiAim = null;
        u.aiTimer = rand(0.6, 1.6);
        u.aiMoveTimer = rand(0.3, 1.2);
      }
      if (announce) this._showBanner("实时开火", "取消回合制 · 双方自由移动与射击", true);
    } else if (this.phase === "aim" || this.phase === "flying" || this.phase === "enemyWait") {
      this.enemyMove = null;
      this.aiMove = null;
      this.enemyAim = null;
      for (const u of this.enemies) u.aiAim = null;
      this._beginPlayerTurn();
      if (announce) this._showBanner("恢复回合制", "重新按回合轮流开火", true);
    }
    this._updateHUD();
  }

  // ------------------------------------------------------------ 回合推进
  _beginPlayerTurn() {
    if (this.phase === "over") return;
    if (Number.isFinite(this.turnLimit) && this.turnNo > this.turnLimit) {
      this.finish(false, "回合耗尽");
      return;
    }
  if (!this.enemies.some((u) => u.alive)) {
    if (this.level.endless) { this._updateEndless(0); return; }
    this.finish(true); return;
  }
  if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
  this.turnTeam = 0;
  this.phase = "aim";
    this.wind = this._rollWind();
    this.moveBudget = this.maxMove;
    this.resolveT = null;
    this.enemyAim = null;
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.aim.maxDrag = 0;
    // 补天术快照：记录本回合开始时的血量与地形，供补天术回溯
    for (const u of this.units) u.prevHp = u.hp;
    this.terrainSnapshot = this.terrain ? this.terrain.snapshot() : null;
    this._activePlayer();
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) this.selectedWeapon = this._fallbackWeapon();
    this._updateHUD();
    this._refreshWeaponBar();
    this._refreshFireButton();
    if (this.turnNo <= 2) this._showAimHint();
    this._showBanner("你的回合", this.level.endless
      ? `第 ${this.turnNo} 回合 · 无回合上限`
      : `第 ${this.turnNo} / ${this.turnLimit} 回合 · 注意风向`);
    this.sfx.turn();
  }

  _beginEnemyTurn() {
    if (this.phase === "over" || this.cheatRealtime) return;
    if (!this.enemies.some((u) => u.alive)) {
      if (this.level.endless) { this._updateEndless(0); return; }
      this.finish(true); return;
    }
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    this.turnTeam = 1;
    this.phase = "enemyWait";
    this.moveBudget = 0;
    this.enemyAim = null;
    this.aiMove = null;
    this.enemyMove = null;
    this._activeEnemy();
    this._updateHUD();
    this._showBanner("敌方回合", "对方正在走位并计算落点", true);
    this._hideAimHint();
    this._addTimer(0.5, () => this._enemyMove());
  }

  /** 敌方回合先走位（被挡住会起跳），再瞄准开火 */
  _enemyMove() {
    if (this.phase !== "enemyWait") return;
  const u = this._activeEnemy();
  if (!u) {
    if (this.level.endless) { this._updateEndless(0); return; }
    this.finish(true); return;
  }
  const targets = this.players.filter((p) => p.alive);
  if (!targets.length) { this.finish(false, "族人全部倒下"); return; }
  const nearest = targets.reduce((a, b) => (Math.abs(a.x - u.x) < Math.abs(b.x - u.x) ? a : b), targets[0]);
    const dist = Math.abs(nearest.x - u.x);
    let dir = 0;
    if (dist > 430) dir = Math.sign(nearest.x - u.x);
    else if (dist < 190) dir = -Math.sign(nearest.x - u.x);
    else if (Math.random() < 0.55) dir = Math.random() < 0.5 ? -1 : 1;
    if (!dir) {
      this._addTimer(0.2, () => this._enemyDecide());
      return;
    }
    this.enemyMove = { dir, t: rand(0.55, 0.95) };
    this.phase = "enemyMove";
    this._updateHUD();
  }

  _updateEnemyMovement(dt) {
    const m = this.enemyMove;
    const u = this._activeEnemy();
    if (!m || !u || !u.alive) {
      this.enemyMove = null;
      this._enemyDecide();
      return;
    }
    // 前方地面检测：避免 AI 走着走着掉下悬崖
    if (u.onGround) {
      const aheadX = u.x + m.dir * 34;
      const gy = this.terrain.surfaceBelow(aheadX, u.y - 40);
      const hasGround = gy !== null && gy <= u.y + 22;
      if (!hasGround) {
        // 前方是悬崖：尝试跳过去，跳不过就停止移动
        u.jump(m.dir);
        m.t -= dt * 2.5;
        if (Math.abs(u.vx) < 20) {
          // 跳不起来（被挡住）：停止移动，进入瞄准
          this.enemyMove = null;
          this._enemyDecide();
          return;
        }
      }
    }
    const step = m.dir * 96 * dt;
    const before = u.x;
    if (u.onGround) {
      if (u.tryMove(step)) {
        u.moveSpeed = m.dir * 96;
        u.facing = m.dir;
      } else {
        // 被地形挡住：起跳翻越并继续前进
        u.jump(m.dir);
        m.t -= dt * 1.5;
      }
    } else {
      u.tryMove(step);
    }
    if (Math.abs(u.x - before) < 0.05) m.t -= dt * 0.5;
    m.t -= dt;
    if (m.t <= 0) {
      this.enemyMove = null;
      this._enemyDecide();
    }
  }

  _enemyDecide() {
    if (this.phase !== "enemyWait" && this.phase !== "enemyMove") return;
  const u = this._activeEnemy();
  if (!u) {
    if (this.level.endless) { this._updateEndless(0); return; }
    this.finish(true); return;
  }
  const targets = this.players.filter((p) => p.alive);
  if (!targets.length) { this.finish(false, "族人全部倒下"); return; }
  const accuracy = clamp((Number(this.level.ai) || 0.4) + this._difficulty().acc, 0, 0.98);
    targets.sort((a, b) => a.hp - b.hp || Math.abs(a.x - u.x) - Math.abs(b.x - u.x));
    // 关卡越靠后，AI 越倾向于集火残血目标
    const focus = accuracy > 0.6 && Math.random() < accuracy * 0.7;
    const target = focus ? targets[0] : targets[Math.floor(Math.random() * targets.length)];
    this.lastEnemyTarget = target;
    this._enemyAim(target);
  }

  _enemyAim(target) {
    if (this.phase !== "enemyWait" && this.phase !== "enemyMove") return;
    const u = this._activeEnemy();
    if (!u) return;
    this.aiMove = null;
    const weapon = this._chooseEnemyWeapon(u, target);
    const sx = u.x;
    const sy = u.y - 44;
    const best = this._findBestShot(sx, sy, target, weapon);
    const cfg = ENEMY_TYPES[u.type] || ENEMY_TYPES.grunt;
    const accuracy = clamp((Number(this.level.ai) || 0.4) + (cfg.aiBonus || 0) + this._difficulty().acc, 0, 0.98);
    const err = (1 - accuracy) * 0.16;
    const angle = best.angle + rand(-err, err);
    const power = clamp(best.power + rand(-err * 0.6, err * 0.6), 0.2, 1);
    this.enemyAim = { angle, power, weapon };
    u.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.phase = "enemyAim";
    this._updateHUD();
    this._addTimer(0.85, () => this._enemyFire());
  }

  _enemyFire() {
    if (this.phase !== "enemyAim" || !this.enemyAim) return;
    const u = this._activeEnemy();
    if (!u) return;
    const { angle, power, weapon } = this.enemyAim;
    // buff 类技能：直接生效
    if (weapon.kind === "buff") {
      this._applyBuff(weapon, u);
      this.phase = "flying";
      this.turnTeam = 1;
      this.enemyAim = null;
      this.resolveT = null;
      this.shotReadyT = 0.55;
      this._addTimer(0.5, () => this._finishShot());
      return;
    }
    const speed = weapon.speed * (0.5 + 0.5 * power);
    const ox = u.x + Math.cos(angle) * 26;
    const oy = u.y - 44 + Math.sin(angle) * 26;
    this.projectiles.push(new Projectile(this, weapon.id, ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed, 1));
    this.muzzleFlashes.push({
      x: ox + Math.cos(angle) * 8, y: oy + Math.sin(angle) * 8,
      angle, t: 0.12, max: 0.12, color: weapon.color, size: 9 + weapon.blast * 0.1,
    });
    this.phase = "flying";
    this.turnTeam = 1;
    this.enemyAim = null;
    this.resolveT = null;
    this.shotReadyT = 0.55;
    this.sfx.shoot(weapon.id);
    this._updateHUD();
  }

  _chooseEnemyWeapon(u, target) {
    const dist = Math.abs(target.x - u.x);
    const lv = this.level.endless ? 20 : this.level.id;
    const era = this.era.id;
    const roll = Math.random();
    if (era === "cultivation") {
      // 根据境界选择技能：低境界用基础技能，高境界用神通
      const lv = this.level.id;
      if (lv >= 56) {
        // 渡劫期：天雷灭世、诛仙阵
        if (roll < 0.12) return WEAPONS.skylightning;
        if (roll < 0.24) return WEAPONS.formation;
        if (roll < 0.36) return WEAPONS.dragonpalm;
        if (roll < 0.48) return WEAPONS.swordarray;
        if (roll < 0.6) return WEAPONS.thunder;
        if (dist > 500 && roll < 0.75) return WEAPONS.fireball;
        if (roll < 0.85) return WEAPONS.sword;
        return WEAPONS.fireball;
      }
      if (lv >= 50) {
        // 化神期：呼风唤雨、回春术
        if (roll < 0.12) return WEAPONS.storm;
        if (roll < 0.22) return WEAPONS.dragonpalm;
        if (roll < 0.34) return WEAPONS.swordarray;
        if (roll < 0.46) return WEAPONS.thunder;
        if (dist > 500 && roll < 0.62) return WEAPONS.fireball;
        if (roll < 0.78) return WEAPONS.sword;
        return WEAPONS.fireball;
      }
      if (lv >= 45) {
        // 元婴期：瞬移、毒雾
        if (roll < 0.1) return WEAPONS.dragonpalm;
        if (roll < 0.2) return WEAPONS.swordarray;
        if (roll < 0.32) return WEAPONS.poisonmist;
        if (roll < 0.44) return WEAPONS.thunder;
        if (dist > 500 && roll < 0.6) return WEAPONS.fireball;
        if (dist < 260 && roll < 0.6) return WEAPONS.soulchain;
        if (roll < 0.78) return WEAPONS.sword;
        return WEAPONS.fireball;
      }
      if (lv >= 40) {
        // 金丹期：万剑归宗、降龙十八掌
        if (roll < 0.12) return WEAPONS.dragonpalm;
        if (roll < 0.26) return WEAPONS.swordarray;
        if (roll < 0.38) return WEAPONS.thunder;
        if (dist > 500 && roll < 0.55) return WEAPONS.fireball;
        if (dist < 260 && roll < 0.55) return WEAPONS.soulchain;
        if (roll < 0.75) return WEAPONS.sword;
        return WEAPONS.fireball;
      }
      if (lv >= 36) {
        // 筑基期：护体符、锁魂链
        if (roll < 0.1) return WEAPONS.thunder;
        if (roll < 0.22) return WEAPONS.soulchain;
        if (dist > 500 && roll < 0.42) return WEAPONS.fireball;
        if (roll < 0.62) return WEAPONS.sword;
        return WEAPONS.fireball;
      }
      // 炼气期：基础攻击
      if (roll < 0.15) return WEAPONS.thunder;
      if (dist > 500 && roll < 0.4) return WEAPONS.fireball;
      if (roll < 0.7) return WEAPONS.sword;
      return WEAPONS.fireball;
    }
    if (era === "mech") {
      if (roll < 0.08) return WEAPONS.meteor;
      if (roll < 0.24) return WEAPONS.railgun;
      if (roll < 0.36) return WEAPONS.drone;
      if (roll < 0.46) return WEAPONS.gravity;
      if (dist > 520 && roll < 0.6) return WEAPONS.rocket;
      if (dist < 240 && roll < 0.6) return WEAPONS.cannon;
      if (dist > 420 && roll < 0.72) return WEAPONS.mortar;
      return WEAPONS.laser;
    }
    if (era === "gun") {
      if (roll < 0.06) return WEAPONS.meteor;
      if (roll < 0.16) return WEAPONS.cluster;
      if (roll < 0.26) return WEAPONS.molotov;
      if (dist > 500) return roll < 0.55 ? WEAPONS.rocket : WEAPONS.mortar;
      if (dist < 250) return roll < 0.5 ? WEAPONS.firebomb : WEAPONS.rifle;
      if (roll < 0.4) return WEAPONS.rifle;
      if (roll < 0.58) return WEAPONS.grenade;
      return WEAPONS.mortar;
    }
    if (era === "iron") {
      if (lv >= 9 && roll < 0.06) return WEAPONS.meteor;
      if (roll < 0.14) return WEAPONS.flail;
      if (roll < 0.2) return WEAPONS.flare;
      if (dist > 480) return roll < 0.55 ? WEAPONS.cannon : WEAPONS.crossbow;
      if (dist < 250) return roll < 0.5 ? WEAPONS.firebomb : WEAPONS.crossbow;
      if (roll < 0.28) return WEAPONS.boomerang;
      return WEAPONS.crossbow;
    }
    // 石器时代
    if (lv <= 1) return Math.random() < 0.4 ? WEAPONS.boulder : WEAPONS.spear;
    if (lv >= 5 && Math.random() < 0.06) return WEAPONS.meteor;
    if (lv >= 5 && Math.random() < 0.14) return WEAPONS.boomerang;
    if (lv >= 4 && Math.random() < 0.12) return WEAPONS.watermelon;
    if (lv >= 4 && Math.random() < 0.1) return WEAPONS.durian;
    if (lv >= 5 && Math.random() < 0.08) return WEAPONS.poisonshroom;
    if (dist > 500) return Math.random() < 0.75 ? WEAPONS.boulder : WEAPONS.spear;
    if (dist < 260) return Math.random() < 0.45 ? WEAPONS.grenade : WEAPONS.spear;
    if (lv >= 4 && Math.random() < 0.14) return WEAPONS.banana;
    if (lv >= 4 && Math.random() < 0.12) return WEAPONS.spike;
    return Math.random() < 0.35 ? WEAPONS.grenade : WEAPONS.spear;
  }

  /** 用与真实弹道一致的模拟，暴力搜索最佳角度/力度 */
  _findBestShot(sx, sy, target, weapon) {
    let best = { angle: target.x >= sx ? -0.7 : Math.PI + 0.7, power: 0.85, score: Infinity };
    const dir = target.x >= sx ? 1 : -1;
    for (let deg = 12; deg <= 82; deg += 7) {
      const angle = dir === 1 ? (-deg * Math.PI) / 180 : Math.PI + (deg * Math.PI) / 180;
      for (let power = 0.45; power <= 1.001; power += 0.085) {
        const end = this._simulateShot(sx, sy, angle, power, weapon);
        const dx = end.x - target.x;
        const dy = end.y - (target.y - 26);
        let score = Math.hypot(dx, dy);
        if (end.y > H - 2) score += 80; // 掉出地图的落点降权
        if (score < best.score) best = { angle, power, score };
      }
    }
    return best;
  }

  _simulateShot(sx, sy, angle, power, weapon) {
    const speed = weapon.speed * (0.5 + 0.5 * power);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let x = sx;
    let y = sy;
    const dt = 1 / 32;
    for (let t = 0; t < 4; t += dt) {
      vx += this.wind * 27 * dt;
      vy += weapon.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < -60 || x > W + 60 || y > H + 40) break;
      if (this.terrain.circleHit(x, y, 3)) break;
    }
    return { x, y };
  }

  /** 实时模式下每个敌人独立运行：移动、瞄准、开火 */
  _updateEnemyAI(u, dt) {
    if (!u.alive) return;
    const targets = this.players.filter((p) => p.alive);
    if (!targets.length) return;

    if (u.aiAim) {
      u.aiAim.hold -= dt;
      if (u.aiAim.hold <= 0) this._enemyFireNow(u);
      return;
    }

    // 走位：远则靠近，太近则后退，中间距离左右游走
    u.aiMoveTimer -= dt;
    if (u.aiMoveTimer <= 0) {
      const nearest = targets.reduce((a, b) => (Math.abs(a.x - u.x) < Math.abs(b.x - u.x) ? a : b), targets[0]);
      const dist = Math.abs(nearest.x - u.x);
      if (dist > 440) u.aiMoveDir = Math.sign(nearest.x - u.x);
      else if (dist < 210) u.aiMoveDir = -Math.sign(nearest.x - u.x);
      else u.aiMoveDir = Math.random() < 0.5 ? -1 : 1;
      u.aiMoveTimer = rand(1.0, 2.2);
    }
    if (u.aiMoveDir) {
      const before = u.x;
      if (u.tryMove(u.aiMoveDir * 78 * dt)) {
        u.moveSpeed = u.aiMoveDir * 78;
        u.facing = u.aiMoveDir;
      }
      if (Math.abs(u.x - before) < 0.05) {
        // 被地形挡住时尝试跳过去，而不是原地罚站
        if (u.onGround) u.jump();
        u.aiMoveDir *= -1;
        u.aiMoveTimer = rand(0.8, 1.5);
      }
    }

    u.aiTimer -= dt;
    if (u.aiTimer > 0) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    let weapon = this._chooseEnemyWeapon(u, target);
    let best = this._findBestShot(u.x, u.y - 44, target, weapon);
    // 直线 / 激光武器被地形挡住时，改换抛物线武器翻过去
    if (weapon.kind === "spear" || weapon.kind === "laser") {
      const arcWeapon = this.era.id === "stone" ? WEAPONS.boulder : WEAPONS.mortar;
      const arc = this._findBestShot(u.x, u.y - 44, target, arcWeapon);
      if (arc.score + 35 < best.score) {
        weapon = arcWeapon;
        best = arc;
      }
    }
    const baseAccuracy = clamp(
      (Number(this.level.ai) || 0.4)
        + (this.level.endless ? Math.min(0.3, this.endlessWave * 0.02) : 0.08)
        + this._difficulty().acc,
      0,
      0.97
    );
    const err = (1 - baseAccuracy) * 0.16;
    u.aiAim = {
      angle: best.angle + rand(-err, err),
      power: clamp(best.power + rand(-err * 0.5, err * 0.5), 0.2, 1),
      weapon,
      hold: 0.55,
    };
    u.facing = Math.cos(u.aiAim.angle) >= 0 ? 1 : -1;
    u.aiTimer = rand(2.0, 3.4) * this._difficulty().rate;
  }

  _enemyFireNow(u) {
    if (!u.alive || !u.aiAim) return;
    const { angle, power, weapon } = u.aiAim;
    u.aiAim = null;
    // buff 类技能：直接生效
    if (weapon.kind === "buff") {
      this._applyBuff(weapon, u);
      const baseGap = rand(2.0, 3.4) * this._difficulty().rate;
      u.aiTimer = baseGap * (this.level.endless ? Math.max(0.65, 1 - this.endlessWave * 0.015) : 1);
      return;
    }
    const speed = weapon.speed * (0.5 + 0.5 * power);
    const ox = u.x + Math.cos(angle) * 26;
    const oy = u.y - 44 + Math.sin(angle) * 26;
    this.projectiles.push(new Projectile(this, weapon.id, ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed, 1));
    this.muzzleFlashes.push({
      x: ox + Math.cos(angle) * 8, y: oy + Math.sin(angle) * 8,
      angle, t: 0.12, max: 0.12, color: weapon.color, size: 9 + weapon.blast * 0.1,
    });
    this.sfx.shoot(weapon.id);
    const baseGap = rand(2.0, 3.4) * this._difficulty().rate;
    u.aiTimer = baseGap * (this.level.endless ? Math.max(0.65, 1 - this.endlessWave * 0.015) : 1);
  }

  // ------------------------------------------------------------ 弹道结算
_finishShot() {
if (this.phase !== "flying") return;
if (!this.enemies.some((u) => u.alive)) {
if (this.level.endless) { this._updateEndless(0); return; }
this.finish(true); return;
}
if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    if (this.turnTeam === 0) {
      this._beginEnemyTurn();
    } else {
      // 敌方多名单位轮流行动：每回合轮换下一个出手的敌人
      if (this.enemies.length) {
        this.activeEnemyIndex = (this.activeEnemyIndex + 1) % this.enemies.length;
      }
      this.turnNo += 1;
      this._beginPlayerTurn();
    }
  }

  _addTimer(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }

  _clearTimers() {
    this.timers = [];
  }

  _updateTimers(dt) {
    const due = [];
    this.timers = this.timers.filter((timer) => {
      timer.t -= dt;
      if (timer.t <= 0) {
        due.push(timer.fn);
        return false;
      }
      return true;
    });
    due.forEach((fn) => fn());
  }

  // ------------------------------------------------------------ 更新
  _loop(ts) {
    const dt = this.lastTs ? Math.min(0.034, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (!this.paused) this._update(dt);
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.time += dt;
    this._updateTimers(dt);
    if (this.phase === "over" || this.phase === "menu") {
      this._updateEffects(dt);
      return;
    }
    if (this.phase === "aim" || this.phase === "flying") this.battleTime += dt;
    if (this.cheatRealtime) {
      // 实时开火：双方同时行动，不再进入敌方回合状态机
      this.phase = "aim";
      this.turnTeam = 0;
      this.moveBudget = this.maxMove;
      const u = this._activePlayer();
      if (u) this._updatePlayingMovement(u, dt);
      for (const e of this.enemies) {
        if (e.alive) this._updateEnemyAI(e, dt);
      }
    } else if (this.phase === "aim") {
      const u = this._activePlayer();
      if (u) this._updatePlayingMovement(u, dt);
    }
    if (this.phase === "enemyMove") this._updateEnemyMovement(dt);
    for (const u of this.units) u.update(dt);
    this.units = this.units.filter((u) => u.alive || u.team === 0 || u.deathT < 1.6);
    this.enemies = this.enemies.filter((u) => u.alive || u.deathT < 1.6);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }
    this._updateEffects(dt);
    if (this.phase === "flying") {
      if (this.shotReadyT > 0) {
        this.shotReadyT -= dt;
      } else if (!this.projectiles.length) {
        this._finishShot();
        return;
      }
    }
    if (!this.players.some((p) => p.alive)) {
      this.finish(false, "族人全部倒下");
      return;
    }
    if (!this.enemies.some((e) => e.alive)) {
      if (this.level.endless) this._updateEndless(dt);
      else { this.finish(true); return; }
    } else if (this.level.endless) {
      this._updateEndless(dt);
    }
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) this.selectedWeapon = this._fallbackWeapon();
    this._refreshWeaponBar();
    this._refreshFireButton();
    this._updateHUD();
  }

  _updatePlayingMovement(u, dt) {
    const left = this.keys["a"] || this.keys["arrowleft"] || this.touch.left;
    const right = this.keys["d"] || this.keys["arrowright"] || this.touch.right;
    if (left === right || this.moveBudget <= 0) {
      u.moveSpeed *= 0.8;
      return;
    }
    const dir = left ? -1 : 1;
    const step = dir * 112 * dt;
    if (u.onGround) {
      if (u.tryMove(step)) {
        this.moveBudget = Math.max(0, this.moveBudget - Math.abs(step));
        u.moveSpeed = dir * 112;
        if (!this.aim.active && !this.aim.locked) u.facing = dir;
      }
    } else {
      // 空中移动：直接修改 x，不触发落地逻辑
      const dx = step * 0.62;
      const nx = clamp(u.x + dx, 14, W - 14);
      if (!this.terrain.solidAt(nx, u.y - 12) && !this.terrain.solidAt(nx, u.y - 34)) {
        u.x = nx;
      }
      this.moveBudget = Math.max(0, this.moveBudget - Math.abs(step) * 0.62);
    }
  }

  /** 当前移动方向：-1 左，1 右，0 无 */
  _moveDir() {
    const left = this.keys["a"] || this.keys["arrowleft"] || this.touch.left;
    const right = this.keys["d"] || this.keys["arrowright"] || this.touch.right;
    if (left && !right) return -1;
    if (right && !left) return 1;
    return 0;
  }

  _updateEndless(dt) {
    if (!this.level.endless) return;
    if (this.phase !== "aim" && this.phase !== "flying" && this.phase !== "enemyWait") return;
    if (this.enemies.some((e) => e.alive)) return;
    if (this.endlessWave > 0 && !this.endlessCleared) {
      this.endlessCleared = true;
      this._onEndlessWaveClear();
    }
    // 敌人全灭后，立即进入下一波准备
    if (this.phase !== "aim") {
      this.phase = "aim";
      this.turnTeam = 0;
      this._updateHUD();
    }
    this.endlessWaveTimer -= dt;
    if (this.endlessWaveTimer <= 0) {
      this._spawnEndlessWave();
      this.endlessWaveTimer = 3.0;
      this.endlessCleared = false;
    }
  }

  _spawnEndlessWave() {
    this.endlessWave += 1;
    const wave = this.endlessWave;
    const eraCfg = getEndlessEra(wave);
    // 时代递进时切换场景主题与武器
    const prevEra = this.era ? this.era.id : "stone";
    if (eraCfg.era !== prevEra) {
      this.era = getEra(eraCfg.era);
      this.theme = THEMES[eraCfg.theme] || THEMES.dawn;
      this.level.era = eraCfg.era;
      this.level.theme = eraCfg.theme;
      this.level.ai = eraCfg.ai;
      this.level.windMax = eraCfg.windMax;
      // 解锁新时代武器（取该时代阶段递进的高阶段；全技能作弊开启时保持全量）
      if (!this.cheatAllWeapons) {
        const stages = STAGE_WEAPONS[eraCfg.era];
        const newWeapons = (stages && stages[stages.length - 1]) || ERA_WEAPONS[eraCfg.era] || ERA_WEAPONS.stone;
        this.weaponIds = newWeapons.slice(0, 9);
        this.ammo = ammoFor(this.level, this.weaponIds);
        this.selectedWeapon = this.weaponIds.find((k) => (this.ammo[k] || 0) > 0) || this.weaponIds[0];
        this._refreshWeaponBar();
      }
      this._showBanner(
        `进入${this.era.name}`,
        `第 ${wave} 波 · 敌人更强 · 解锁新武器`,
        2.2
      );
    } else {
      this._showBanner(`第 ${wave} 波`, "敌人从右侧来袭", 1.8);
    }
    const count = Math.min(7, 1 + Math.floor(wave * 0.6));
    const pool = eraCfg.enemies;
    for (let i = 0; i < count; i++) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      const cfg = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
      const x = clamp(880 + (i % 4) * 78 + rand(-20, 20), 840, W - 40);
      const y = this._spawnY(x);
      const baseHp = cfg.hp;
      const hp = Math.round(baseHp * eraCfg.hpMul * (1 + wave * 0.08) * this._difficulty().hp);
      const index = this.enemies.length;
      const u = new Unit(this, 1, x, y, type, hp, index, `${cfg.name} ${wave}-${i + 1}`);
      u.baseHp = baseHp;
      u.aiTimer = rand(1.0, 2.4) + i * 0.2;
      u.aiMoveTimer = rand(0.8, 2.0);
      this.enemies.push(u);
      this.units.push(u);
    }
    this.sfx.wave ? this.sfx.wave() : this.sfx.turn();
  }

  _onEndlessWaveClear() {
    for (const p of this.players) {
      if (p.alive) p.hp = Math.min(p.maxHp, p.hp + 12);
    }
    for (const id of Object.keys(this.ammo)) {
      if (this.ammo[id] === Infinity) continue;
      if (id === "meteor" && this.endlessWave % 2 !== 0) continue;
      this.ammo[id] = Math.min(9, (Number(this.ammo[id]) || 0) + 1);
    }
    this.endlessBest = Math.max(this.endlessBest, this.endlessWave);
    this.store.update((p) => {
      p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessWave);
    });
    this._showBanner(`第 ${this.endlessWave} 波清除`, "全员恢复 12 点生命 · 补充弹药", 2.0);
    this.spawnParticles(640, 300, 30, "#ffe08a", "spark");
  }

  _updateEffects(dt) {
    this._updateFires(dt);
    this._updateSwordRain(dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "dirt" && p.gravity > 0) {
        const gy = this.terrain ? this.terrain.surfaceBelow(p.x, p.y - 4) : null;
        if (gy !== null && p.y > gy) {
          p.y = gy;
          p.vy *= -0.25;
          p.vx *= 0.6;
          if (Math.abs(p.vy) < 10) p.vy = 0;
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - 58 * dt);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.8);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const f = this.muzzleFlashes[i];
      f.t -= dt;
      if (f.t <= 0) this.muzzleFlashes.splice(i, 1);
    }
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.life -= dt;
      if (g.life <= 0) this.glows.splice(i, 1);
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
    if (this.ambient.length) {
      const isFire = this.theme.id === "volcano";
      for (const p of this.ambient) {
        p.x += (p.vx + (isFire ? 0 : this.wind * 5)) * dt;
        p.y += p.vy * dt;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) {
          p.y = H + 10;
          p.x = rand(0, W);
        }
        if (p.y > H + 20) {
          p.y = -10;
          p.x = rand(0, W);
        }
      }
    }
  }

  // ------------------------------------------------------------ 爆炸 / 伤害
  /**
   * 万剑归宗（嬴政大招）：飞剑从施法者身体飞出，呈抛物线剑雨打击目标范围。
   * 每把剑独立飞行、穿透伤害，落地后插在地上过一会消失。
   */
  spawnSwordRain(x, y, team, damage, blast, weaponType) {
    const caster = team === 0 ? this._activePlayer() : this._activeEnemy();
    // 起始位置：施法者身体中心
    const srcX = caster ? caster.x : x;
    const srcY = caster ? caster.y - 30 : y - 60;
    const count = 15;
    // 重力加速度（与 _updateSwordRain 一致）
    const G = 1400;
    for (let i = 0; i < count; i++) {
      // 每把剑的落点：目标区域内随机
      const spread = 120;
      const tx = x + rand(-spread, spread);
      const ty = y + rand(-40, 60);
      // 飞行时间：1.2~2.0 秒（依次飞出，形成剑雨层次）
      const flightTime = 1.2 + (i / count) * 0.8 + rand(0, 0.2);
      // 根据抛物线公式计算初速度：
      // x(t) = srcX + vx * t  =>  vx = (tx - srcX) / flightTime
      // y(t) = srcY + vy * t + 0.5 * G * t^2  =>  vy = (ty - srcY - 0.5 * G * flightTime^2) / flightTime
      const vx = (tx - srcX) / flightTime;
      const vy = (ty - srcY - 0.5 * G * flightTime * flightTime) / flightTime;
      // 延迟：依次飞出，形成剑雨层次
      const delay = i * 0.08 + rand(0, 0.05);
      this.swordRain.push({
        x: srcX, y: srcY,
        sx: srcX, sy: srcY,
        tx, ty,
        vx, vy,
        delay,
        age: 0,
        damage,
        blast: Math.max(60, blast),
        team,
        weaponType,
        hitSet: new Set(),
        stuck: false,      // 是否已插地
        stuckT: 0,         // 插地时间
        stuckAngle: 0,     // 插地角度
      });
    }
    // 启动特效：施法者处剑光冲天
    if (caster) {
      this.rings.push({ x: caster.x, y: caster.y - 30, r: 8, max: 100, t: 0, life: 0.35, color: "rgba(168,216,255,.7)" });
      this.spawnParticles(caster.x, caster.y - 30, 24, "#a8d8ff", "spark");
    }
    this.sfx.shoot("swordarray");
  }

  /** 更新剑雨中的飞剑：穿透伤害 + 落地插地 */
  _updateSwordRain(dt) {
    if (!this.swordRain.length) return;
    for (let i = this.swordRain.length - 1; i >= 0; i--) {
      const s = this.swordRain[i];
      // 已插地：计时消失
      if (s.stuck) {
        s.stuckT += dt;
        if (s.stuckT > 1.6) this.swordRain.splice(i, 1);
        continue;
      }
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.age += dt;
      // 重力加速下落
      s.vy += 1400 * dt;
      // 子步进防止穿透
      const steps = clamp(Math.ceil(Math.hypot(s.vx, s.vy) * dt / 6), 1, 8);
      let stuck = false;
      for (let step = 0; step < steps && !stuck; step++) {
        const h = dt / steps;
        s.x += s.vx * h;
        s.y += s.vy * h;
        // 穿透伤害：每把剑可穿透多个敌人
        for (const u of this.units) {
          if (!u.alive || u.team === s.team || s.hitSet.has(u)) continue;
          const dx = s.x - u.x;
          const dy = s.y - (u.y - 28);
          const rr = 20 * (u.scale || 1);
          if (dx * dx + dy * dy < rr * rr) {
            s.hitSet.add(u);
            u.takeDamage(s.damage, s.team);
            // 穿透剑气粒子
            this.spawnParticles(s.x, s.y, 6, "#a8d8ff", "spark");
          }
        }
        // 命中地形：插地
        if (this.terrain && this.terrain.circleHit(s.x, s.y, 4)) {
          s.stuck = true;
          s.stuckT = 0;
          s.stuckAngle = Math.atan2(s.vy, s.vx);
          // 插地冲击波
          this.rings.push({ x: s.x, y: s.y, r: 4, max: 30, t: 0, life: 0.2, color: "rgba(168,216,255,.6)" });
          this.spawnParticles(s.x, s.y, 8, "#a8d8ff", "spark");
          this.terrain.carve(s.x, s.y, s.blast * 0.3, s.damage * 0.5);
          this.terrainDirty = true;
          stuck = true;
          break;
        }
      }
      if (stuck) continue;
      // 剑尾灵气粒子
      if (Math.random() < 0.7) {
        this.particles.push({
          x: s.x + rand(-2, 2), y: s.y - 8 + rand(-2, 2),
          vx: rand(-10, 10), vy: rand(-30, -5),
          life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1.5, 3),
          color: "#a8d8ff", kind: "spark", gravity: -20,
        });
      }
      if (s.age > 5 || s.y > H + 60 || s.x < -100 || s.x > W + 100) {
        this.swordRain.splice(i, 1);
      }
    }
  }

  /** 绘制剑雨中的飞剑：完整剑形（剑刃 + 剑格 + 剑柄） */
  _drawSwordRain(ctx) {
    if (!this.swordRain.length) return;
    for (const s of this.swordRain) {
      if (s.delay > 0) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      // 插地剑：剑尖朝下，剑柄朝上，微微颤动
      if (s.stuck) {
        const fade = s.stuckT > 1.0 ? clamp(1 - (s.stuckT - 1.0) / 0.6, 0, 1) : 1;
        ctx.globalAlpha = fade;
        // 插地角度：剑尖朝下
        ctx.rotate(Math.PI / 2 + Math.sin(s.stuckT * 3) * 0.05);
        this._drawSwordShape(ctx, 1.2);
      } else {
        // 飞行剑：剑身朝速度方向
        const ang = Math.atan2(s.vy, s.vx);
        ctx.rotate(ang);
        // 剑芒拖尾
        ctx.globalCompositeOperation = "lighter";
        const grad = ctx.createLinearGradient(-12, 0, -60, 0);
        grad.addColorStop(0, "rgba(168,216,255,.7)");
        grad.addColorStop(1, "rgba(168,216,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-12, -3);
        ctx.lineTo(-55, 0);
        ctx.lineTo(-12, 3);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        this._drawSwordShape(ctx, 1.1);
      }
      ctx.restore();
    }
  }

  /** 绘制一把完整的剑（剑刃 + 剑格 + 剑柄） */
  _drawSwordShape(ctx, scale = 1) {
    ctx.scale(scale, scale);
    // 剑刃（菱形，剑尖朝右）
    ctx.fillStyle = "#f0f8ff";
    ctx.shadowColor = "#a8d8ff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(26, 0);       // 剑尖
    ctx.lineTo(6, -5);        // 刃口上
    ctx.lineTo(-12, -3);     // 剑根上
    ctx.lineTo(-12, 3);      // 剑根下
    ctx.lineTo(6, 5);        // 刃口下
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // 剑脊寒芒
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(-10, 0);
    ctx.stroke();
    // 剑格（护手）
    ctx.strokeStyle = "#8ab8d8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-12, 8);
    ctx.stroke();
    // 剑柄
    ctx.strokeStyle = "#5a7a9a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-22, 0);
    ctx.stroke();
    // 剑柄末端圆珠
    ctx.fillStyle = "#8ab8d8";
    ctx.beginPath();
    ctx.arc(-23, 0, 2.5, 0, TAU);
    ctx.fill();
  }

  explode(x, y, radius, damage, team, kind = "blast", weaponType = null) {
    if (!this.terrain) return;
    const beam = kind === "laser";
    // 修仙武器爆炸特效配置
    const cultFx = {
      sword:      { ring: "#a8d8ff", glow: "rgba(168,216,255,.75)", flash: "#a8d8ff", spark: "#d8ecff" },
      fireball:   { ring: "#ff8a4a", glow: "rgba(255,138,74,.75)",  flash: "#ff8a4a", spark: "#ffd15c" },
      thunder:    { ring: "#ffe95c", glow: "rgba(255,233,92,.8)",   flash: "#ffe95c", spark: "#fff8c8" },
      swordarray: { ring: "#a8d8ff", glow: "rgba(168,216,255,.7)",  flash: "#a8d8ff", spark: "#d8ecff" },
      dragonpalm: { ring: "#ff8a5a", glow: "rgba(255,138,90,.8)",   flash: "#ff8a5a", spark: "#ffd25e" },
      shieldcharm:{ ring: "#ffd25e", glow: "rgba(255,210,94,.75)",  flash: "#ffd25e", spark: "#fff8c8" },
      soulchain:  { ring: "#b48ce8", glow: "rgba(180,140,232,.75)", flash: "#b48ce8", spark: "#d8b8ff" },
      teleport:   { ring: "#6fe8ff", glow: "rgba(111,232,255,.75)", flash: "#6fe8ff", spark: "#d8f4ff" },
      poisonmist: { ring: "#8aff6a", glow: "rgba(138,255,106,.7)",  flash: "#8aff6a", spark: "#d8ffc8" },
      heal:       { ring: "#6affa8", glow: "rgba(106,255,168,.7)",  flash: "#6affa8", spark: "#d8ffe8" },
      storm:      { ring: "#6ac8ff", glow: "rgba(106,200,255,.75)", flash: "#6ac8ff", spark: "#d8ecff" },
      skylightning:{ ring: "#fff8c8", glow: "rgba(255,248,200,.8)", flash: "#fff8c8", spark: "#ffffff" },
      formation:  { ring: "#ff6a9a", glow: "rgba(255,106,154,.75)", flash: "#ff6a9a", spark: "#ffd8e8" },
      mend:       { ring: "#a8ffd8", glow: "rgba(168,255,216,.75)", flash: "#a8ffd8", spark: "#d8ffe8" },
    }[weaponType];
    // 减速/中毒效果配置
    const weaponSlow = weaponType === "soulchain" ? { dur: 3, mul: 0.35 }
      : weaponType === "storm" ? { dur: 4, mul: 0.3 } : null;
    const weaponPoison = weaponType === "poisonmist" ? { dur: 5, dps: 8 } : null;
    // 爆炸威力决定摧毁次数：伤害越高，对高等级石块的摧毁越快
    const power = Math.max(radius * 0.8, damage * 0.8);
    this.terrain.carve(x, y, radius * 0.8, power);
    this.terrainDirty = true;
    this.shake = Math.max(this.shake, Math.min(26, radius * 0.19));
    // 双层冲击波 + 中心辉光，强武器一眼能看出威力
    const ringColor = cultFx ? cultFx.ring : beam ? "#9ff4ff" : "#ffe0a0";
    const ringColor2 = cultFx ? cultFx.glow : beam ? "rgba(110,230,255,.7)" : "rgba(255,170,90,.7)";
    this.rings.push({ x, y, r: radius * 0.25, max: radius * 1.55, t: 0, life: 0.34, color: ringColor });
    this.rings.push({ x, y, r: radius * 0.1, max: radius * 2.1, t: 0, life: 0.55, color: ringColor2 });
    this.glows.push({
      x, y, r: radius * 1.15, life: 0.34, max: 0.34,
      color: cultFx ? cultFx.glow : beam ? "rgba(120,240,255,.75)" : "rgba(255,190,110,.75)",
    });
    if (radius >= 80) {
      this.screenFlash = Math.max(this.screenFlash, Math.min(0.42, radius / 420));
      this.flashColor = cultFx ? cultFx.flash : beam ? "#9ff4ff" : "#ffd08a";
    }
    // ---- 修仙武器特殊爆炸特效 ----
    if (cultFx) {
      // 雷符：天降雷柱
      if (weaponType === "thunder") {
        this.rings.push({ x, y: y - 200, r: 4, max: radius * 1.8, t: 0, life: 0.28, color: "#fff8c8" });
        for (let i = 0; i < 16; i++) {
          const a = rand(0, TAU);
          const sp = rand(200, 600);
          this.particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100,
            life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.5, 3),
            color: "#fff8c8", kind: "spark", gravity: 200,
          });
        }
        // 垂直闪电束
        this.particles.push({
          x, y: y - 100, vx: 0, vy: 800,
          life: 0.15, maxLife: 0.15, size: radius * 0.8,
          color: "rgba(255,248,200,.6)", kind: "fire", gravity: 0,
        });
      }
      // 降龙十八掌：龙形冲击波（多层扩散环 + 龙形粒子波浪）
      if (weaponType === "dragonpalm") {
        for (let i = 0; i < 4; i++) {
          this.rings.push({ x, y, r: radius * (0.15 + i * 0.12), max: radius * (1.0 + i * 0.45), t: 0, life: 0.38 + i * 0.1, color: `rgba(255,${160 + i * 25},${70 + i * 20},${0.65 - i * 0.12})` });
        }
        // 龙形粒子（沿波浪线排列，模拟龙身冲撞）
        for (let i = 0; i < 24; i++) {
          const t = i / 24;
          const a = t * TAU * 2.5;
          const r = radius * (0.2 + t * 0.8);
          this.particles.push({
            x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5,
            vx: Math.cos(a) * 200, vy: Math.sin(a) * 140 - 50,
            life: rand(0.3, 0.8), maxLife: 0.8, size: rand(2, 6),
            color: Math.random() < 0.4 ? "#ffd25e" : "#ff8a5a", kind: "fire", gravity: -50,
          });
        }
        // 龙首冲击粒子（前方高速）
        for (let i = 0; i < 8; i++) {
          const a = rand(-0.5, 0.5);
          const sp = rand(300, 600);
          this.particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: rand(0.15, 0.35), maxLife: 0.35, size: rand(2, 4),
            color: "#ffd25e", kind: "spark", gravity: 100,
          });
        }
      }
      // 万剑归宗：多把飞剑从空中俯冲插地（剑形粒子 + 剑气环）
      if (weaponType === "swordarray") {
        // 剑气旋涡环
        this.rings.push({ x, y, r: radius * 0.3, max: radius * 1.8, t: 0, life: 0.3, color: "rgba(168,216,255,.6)" });
        this.rings.push({ x, y, r: radius * 0.15, max: radius * 1.3, t: 0, life: 0.45, color: "rgba(200,230,255,.5)" });
        // 12 把飞剑（剑形粒子，朝下插入地面）
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + rand(-0.15, 0.15);
          const sp = rand(250, 550);
          this.particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
            life: rand(0.25, 0.5), maxLife: 0.5, size: rand(2, 4),
            color: Math.random() < 0.5 ? "#a8d8ff" : "#d8ecff", kind: "spark", gravity: 300,
          });
        }
        // 中心剑光柱
        this.particles.push({
          x, y: y - 60, vx: 0, vy: 600,
          life: 0.2, maxLife: 0.2, size: radius * 0.6,
          color: "rgba(168,216,255,.5)", kind: "fire", gravity: 0,
        });
      }
      // 护体符：金色符文扩散
      if (weaponType === "shieldcharm") {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          this.particles.push({
            x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10,
            vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60,
            life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4),
            color: "#ffd25e", kind: "spark", gravity: -20,
          });
        }
      }
      // 锁魂链：紫色魂火爆裂
      if (weaponType === "soulchain") {
        for (let i = 0; i < 14; i++) {
          const a = rand(0, TAU);
          const sp = rand(100, 350);
          this.particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
            life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4),
            color: Math.random() < 0.5 ? "#b48ce8" : "#d8b8ff", kind: "spark", gravity: -30,
          });
        }
      }
      // 飞剑：剑光穿刺
      if (weaponType === "sword") {
        for (let i = 0; i < 8; i++) {
          const a = rand(0, TAU);
          const sp = rand(150, 400);
          this.particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1, 2.5),
            color: "#d8ecff", kind: "spark", gravity: 200,
          });
        }
      }
    }
    const dirtCount = kind === "spear" ? 10 : Math.min(44, 12 + Math.floor(radius * 0.32));
    for (let i = 0; i < dirtCount; i++) {
      this.particles.push({
        x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: rand(-280, 280), vy: rand(-360, -40),
        life: rand(0.5, 1.3), maxLife: 1.3, size: rand(2, 7),
        color: this.theme.dirt[1], kind: "dirt", gravity: 900,
      });
    }
    const fireCount = kind === "spear" ? 6 : Math.min(44, 12 + Math.floor(radius * 0.3));
    for (let i = 0; i < fireCount; i++) {
      this.particles.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-230, 230), vy: rand(-300, 20),
        life: rand(0.26, 0.78), maxLife: 0.78, size: rand(4, 13),
        color: beam
          ? (Math.random() < 0.5 ? "#9ff4ff" : "#5fd4ff")
          : (Math.random() < 0.5 ? "#ffd15c" : "#ff6a2a"),
        kind: "fire", gravity: -60,
      });
    }
    // 高速火星：加色混合，让爆炸更“炸”
    const sparkCount = Math.min(30, 6 + Math.floor(radius * 0.2));
    for (let i = 0; i < sparkCount; i++) {
      const a = rand(0, TAU);
      const sp = rand(160, 520);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.18, 0.42), maxLife: 0.42, size: rand(1.2, 2.6),
        color: beam ? "#d8fbff" : "#ffe8a8", kind: "spark", gravity: 260,
      });
    }
    for (let i = 0; i < (kind === "spear" ? 3 : 12); i++) {
      this.particles.push({
        x: x + rand(-18, 18), y: y + rand(-18, 18),
        vx: rand(-80, 80), vy: rand(-120, -10),
        life: rand(0.6, 1.2), maxLife: 1.2, size: rand(10, 24),
        color: "rgba(60,55,50,.45)", kind: "smoke", gravity: -30,
      });
    }
    // 火焰残留：爆炸后地面继续燃烧，火舌、余烬与灼烧伤害
    if (kind !== "spear" && kind !== "laser") {
      const groundY = this.terrain.surfaceBelow(x, Math.min(H - 16, y + radius * 0.9));
      if (groundY !== null) {
        const life = 1.0 + Math.min(1.0, radius / 240);
        this.fires.push({
          x, y: groundY, r: Math.max(24, radius * 0.5),
          life, max: life, acc: 0, dot: 0, team,
          damage: Math.max(1, Math.round(damage * 0.05)),
          seed: Math.random() * 10,
        });
      }
    }
    // 伤害与击退（含友军误伤）
    const diff = this._difficulty();
    for (const u of this.units) {
      if (!u.alive) continue;
      // 以单位命中胶囊上离爆点最近的位置计算距离，爆头也能打满伤害
      const s = u.scale || 1;
      const topY = u.y - (u.mount ? 76 : 63) * s;
      const cy = clamp(y, topY, u.y - 6);
      const dx = u.x - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy);
      const reach = radius + 16;
      if (d < reach) {
        const f = 1 - d / reach;
        let dmg = Math.max(4, Math.round(damage * (0.35 + 0.65 * f)));
        if (team === 1 && u.team === 0) dmg = Math.round(dmg * diff.dmg);
        u.takeDamage(dmg, team);
        if (u.alive) {
          u.vy = -Math.min(360, 70 + f * damage * 2.4);
          u.onGround = false;
          u.vx += Math.sign(dx || 1) * f * 60;
        }
        // 减速效果（锁魂链、呼风唤雨）
        if (weaponSlow && u.alive) {
          u.slowT = Math.max(u.slowT, weaponSlow.dur);
          u.slowMul = weaponSlow.mul;
          this.addText(u.x, u.y - 92, "减速", "#b48ce8");
        }
        // 中毒效果（毒雾术）
        if (weaponPoison && u.alive) {
          u.poisonT = Math.max(u.poisonT, weaponPoison.dur);
          u.poisonDps = weaponPoison.dps;
          this.addText(u.x, u.y - 92, "中毒", "#8aff6a");
        }
      }
    }
    this.sfx.explode(radius);
    // 爆炸把附近单位推下平台后，检查是否还有活人
    this._addTimer(0.9, () => this._checkEndState());
  }

  onUnitDeath(unit) {
    if (unit.team === 0 && this.players[this.activePlayerIndex] === unit) {
      this.aim.locked = false;
      this.aim.active = false;
      this.aim.startWorld = null;
      this.aim.currentWorld = null;
      this.aim.dragLen = 0;
      this._activePlayer();
    }
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: unit.x + rand(-10, 10), y: unit.y - 30 + rand(-14, 14),
        vx: rand(-120, 120), vy: rand(-200, -30),
        life: rand(0.4, 0.9), maxLife: 0.9, size: rand(2, 5),
        color: unit.team === 0 ? "#f0a35e" : "#c06a5e", kind: "dirt", gravity: 700,
      });
    }
    this.addText(unit.x, unit.y - 80, "倒下", unit.team === 0 ? "#ff9f93" : "#ffd27c");
    this._addTimer(0.8, () => this._checkEndState());
  }

  _checkEndState() {
    if (this.phase === "over" || this.phase === "menu") return;
    if (!this.players.some((u) => u.alive)) { this.finish(false, "族人全部倒下"); return; }
    if (!this.enemies.some((u) => u.alive)) {
      if (this.level.endless) { this._updateEndless(0); return; }
      this.finish(true);
      return;
    }
    this._refreshFireButton();
    this._updateHUD();
  }

  finish(win, reason = "") {
    if (this.phase === "over") return;
    this.phase = "over";
    this.aim.active = false;
    this.aim.locked = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this.enemyAim = null;
    this.aiMove = null;
    this._clearTimers();
    const isEndless = Boolean(this.level.endless);
    const totalPlayers = this.players.length;
    const alive = this.players.filter((u) => u.alive).length;
    const par = Number(this.level.par) || 4;
    let stars = 0;
    let newRecord = false;
    if (win) {
      if (isEndless) {
        // 无尽模式不会有「胜利」，只有玩家全灭才结束
        this.store.update((p) => {
          p.endlessBest = Math.max(Number(p.endlessBest) || 0, this.endlessWave);
        });
        this.endlessBest = Math.max(this.endlessBest, this.endlessWave);
      } else {
        if (alive === totalPlayers && this.turnNo <= par) stars = 3;
        else if (alive === totalPlayers || this.turnNo <= par) stars = 2;
        else stars = 1;
        const prevStars = Number(this.store.state.stars[this.level.id]) || 0;
        const prevBest = Number(this.store.state.bestTurns[this.level.id]) || 9999;
        newRecord = stars > prevStars || this.turnNo < prevBest;
        this.store.update((p) => {
          const next = Math.min(LEVELS.length, this.level.id + 1);
          p.unlocked = Math.max(Number(p.unlocked) || 1, next);
          p.stars[this.level.id] = Math.max(Number(p.stars[this.level.id]) || 0, stars);
          p.cleared[this.level.id] = true;
          const best = Number(p.bestTurns[this.level.id]) || 9999;
          p.bestTurns[this.level.id] = Math.min(best, this.turnNo);
        });
      }
      this.sfx.win();
      this._spawnConfetti();
    } else {
      this.sfx.lose();
    }
    this.result = { win, stars, alive, reason, isEndless };
    this._showResult(win, stars, alive, reason, newRecord, isEndless);
    this._refreshFireButton();
    this._updateHUD();
  }

  // ------------------------------------------------------------ 结算界面
  _showResult(win, stars, alive, reason, newRecord, isEndless = false) {
    const $ = (id) => document.getElementById(id);
    $("resultStars").style.display = isEndless ? "none" : "flex";
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = (i * 0.12) + "s";
    });
    $("resultTitle").textContent = isEndless
      ? "无限模式结束"
      : (win ? "胜利！" : "战败");
    $("resultTitle").style.color = win ? "#ffe0ad" : "#ff9c8f";
    $("resultSub").textContent = isEndless
      ? `坚持到第 ${this.endlessWave} 波 · 历史最佳 ${this.endlessBest} 波`
      : `第 ${this.level.id} 关 · ${this.level.name}`;
    $("statTurns").textContent = `${this.turnNo}`;
    $("statAlive").textContent = `${alive}/${this.players.length}`;
    $("statStars").textContent = isEndless ? `${this.endlessWave} 波` : win ? `${stars}★` : "0★";
    const starLabel = $("statStars").parentElement.querySelector("span");
    if (starLabel) starLabel.textContent = isEndless ? "坚持波数" : "获得星星";
    let note = "";
    if (isEndless) {
      note = `你坚持到了第 ${this.endlessWave} 波 · 历史最佳 ${this.endlessBest} 波`;
      if (newRecord) note += " · 新纪录";
    } else if (win) {
      if (stars === 3) note = "三星达成：全员存活，并在目标回合内结束战斗";
      else if (newRecord) note = "新纪录已保存";
      else note = "进度已保存";
      if (this.level.id === LEVELS.length) note += " · 全部关卡通关";
    } else {
      note = reason || "再试一次，换个角度";
    }
    $("resultNote").textContent = note;
    const next = $("nextBtn");
    if (isEndless) {
      // 无尽模式：无论胜负都显示「再来一次」
      next.style.display = "";
      next.textContent = "再来一次";
    } else if (win) {
      next.style.display = "";
      next.textContent = this.level.id < LEVELS.length ? "下一关" : "无限模式";
    } else {
      next.style.display = "none";
    }
    document.getElementById("resultScreen").classList.add("show");
  }

  // ------------------------------------------------------------ 暂停 / 音效
  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.phase !== "aim" || this.cheatOpen) return;
    this.cheatOpen = true;
    this.paused = true;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    this._updateCheatText();
    document.getElementById("cheatScreen").classList.add("show");
    this._refreshFireButton();
  }

  _closeCheat() {
    document.getElementById("cheatScreen").classList.remove("show");
    if (this.cheatOpen) {
      this.cheatOpen = false;
      if (this.phase === "aim") this.paused = false;
    }
  }

  _updateCheatText() {
    this._refreshCheatUI();
  }

  _refreshCheatUI() {
    const god = document.getElementById("cheatGodText");
    if (god) god.textContent = `无敌模式：${this.cheatGod ? "开" : "关"}`;
    const ammo = document.getElementById("cheatAmmoText");
    if (ammo) ammo.textContent = `无限弹药：${this.cheatInfiniteAmmo ? "开" : "关"}`;
    const diff = document.getElementById("cheatDiffText");
    if (diff) diff.textContent = `难度：${this._difficulty().name}`;
    const rt = document.getElementById("cheatRealtimeText");
    if (rt) rt.textContent = `实时开火：${this.cheatRealtime ? "开" : "关"}`;
    const all = document.getElementById("cheatAllText");
    if (all) all.textContent = `全技能武器：${this.cheatAllWeapons ? "开" : "关"}`;
    const cd = document.getElementById("cheatCdText");
    if (cd) cd.textContent = `无冷却：${this.cheatNoCooldown ? "开" : "关"}`;
  }

  /** 金手指：在本关递进技能池与全部技能/武器之间切换 */
  _applyAllWeapons(on) {
    if (!this.level) return;
    this.weaponIds = on
      ? [...WEAPON_ORDER]
      : [...(this.baseWeaponIds || ERA_WEAPONS[this.era.id] || ERA_WEAPONS.stone)];
    this.ammo = ammoFor(this.level, this.weaponIds);
    this.selectedWeapon = this.weaponIds.find((k) => (this.ammo[k] || 0) > 0) || this.weaponIds[0];
    this.weaponReadyAt = {};
    this._refreshWeaponBar();
    this._updateHUD();
  }

  _handleCheat(action) {
    if (action === "close") { this._closeCheat(); return; }
    if (this.phase !== "aim") return;
    if (action === "heal") {
      for (const p of this.players) if (p.alive) p.hp = p.maxHp;
      toast("全族生命已回满", "ok");
    } else if (action === "ammo") {
      for (const id of Object.keys(this.ammo)) {
        if (this.ammo[id] === Infinity) continue;
        this.ammo[id] = Math.max(9, (Number(this.ammo[id]) || 0) + 9);
      }
      this._refreshWeaponBar();
      toast("所有武器弹药已补充", "ok");
    } else if (action === "god") {
      this.cheatGod = !this.cheatGod;
      toast(`无敌模式：${this.cheatGod ? "开" : "关"}`, "ok");
    } else if (action === "infinite") {
      this.cheatInfiniteAmmo = !this.cheatInfiniteAmmo;
      toast(`无限弹药：${this.cheatInfiniteAmmo ? "开" : "关"}`, "ok");
    } else if (action === "difficulty") {
      this._toggleDifficulty();
      toast(`难度已切换为：${this._difficulty().name}`, "ok");
    } else if (action === "realtime") {
      this._toggleRealtime();
      toast(`实时开火：${this.cheatRealtime ? "开" : "关"}`, "ok");
    } else if (action === "kill") {
      for (const e of this.enemies) if (e.alive) e.takeDamage(99999, 0);
      toast("已秒杀当前敌人", "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = LEVELS.length; p.tutorialSeen = true; });
      this._refreshLevelSummary();
      toast("已解锁全部关卡", "ok");
    } else if (action === "allweapons") {
      this.cheatAllWeapons = !this.cheatAllWeapons;
      this._applyAllWeapons(this.cheatAllWeapons);
      toast(`全技能武器：${this.cheatAllWeapons ? "开" : "关"}`, "ok");
    } else if (action === "nocd") {
      this.cheatNoCooldown = !this.cheatNoCooldown;
      if (this.cheatNoCooldown) this.weaponReadyAt = {};
      toast(`无冷却：${this.cheatNoCooldown ? "开" : "关"}`, "ok");
    } else if (action === "win") {
      if (this.level.endless) {
        toast("无限模式不能直接过关");
      } else {
        this._closeCheat();
        this.finish(true);
      }
    }
    this._updateCheatText();
    this._updateHUD();
  }

  _openPause() {
    if (this.phase === "menu" || this.phase === "over" || this.paused) return;
    this.paused = true;
    this.aim.active = false;
    this.aim.startWorld = null;
    this.aim.currentWorld = null;
    this.aim.dragLen = 0;
    document.getElementById("pauseScreen").classList.add("show");
    this._updateSoundButtons();
    this._refreshFireButton();
  }

  _closePause() {
    document.getElementById("pauseScreen").classList.remove("show");
    this.paused = false;
    this.sfx.ensure();
    this.sfx.click();
    this._refreshFireButton();
  }

  _toggleSound() {
    this.soundOn = !(this.soundOn !== false);
    this.sfx.enabled = this.soundOn;
    audio.setEnabled(this.soundOn);
    this.store.update((p) => { p.sound = this.soundOn; });
    this._updateSoundButtons();
    if (this.soundOn) {
      this.sfx.ensure();
      this.sfx.click();
    }
  }

  // ------------------------------------------------------------ 提示 UI
  _showBanner(title, sub, enemy = false) {
    const el = document.getElementById("turnBanner");
    el.querySelector("strong").textContent = title;
    el.querySelector("span").textContent = sub || "";
    el.classList.toggle("enemy", enemy);
    el.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove("show"), 1500);
  }

  _showAimHint() {
    const el = document.getElementById("aimHint");
    el.classList.remove("hide");
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.add("hide"), 7000);
  }

  _hideAimHint() {
    clearTimeout(this.hintTimer);
    document.getElementById("aimHint").classList.add("hide");
  }

  _refreshWeaponBar() {
    if (!this.level) return;
    const bar = document.getElementById("weaponBar");
    const list = document.getElementById("weaponList");
    // 构建武器列表（仅在武器栏内容变化时重建 DOM）
    const fp = this.weaponIds.join(",");
    if (list.children.length !== this.weaponIds.length || bar.dataset.fp !== fp) {
      bar.dataset.fp = fp;
      list.innerHTML = this.weaponIds.map((id, i) => {
        const w = WEAPONS[id];
        return `<button class="weapon-card" data-weapon="${id}" type="button"
          title="${w.name} · 伤害 ${w.damage}${w.blast ? ` · 爆炸范围 ${w.blast}` : ""}\n${w.desc}">
          <span class="w-key">${i + 1}</span>
          <span class="w-ammo" data-ammo="${id}"></span>
          <span class="w-cool"></span>
          ${this._weaponIcon(id)}
          <span class="w-name">${w.name}</span>
          <span class="w-power">${w.damage}</span>
        </button>`;
      }).join("");
    }
    // 更新收起按钮（当前武器图标 + 弹药）
    const curW = WEAPONS[this.selectedWeapon];
    const curAmmo = this.ammo[this.selectedWeapon] ?? 0;
    document.getElementById("wtIcon").innerHTML = this._weaponIcon(this.selectedWeapon);
    document.getElementById("wtAmmo").textContent = curAmmo === Infinity ? "∞" : String(curAmmo);
    // 展开/收起状态
    bar.classList.toggle("collapsed", !this.weaponBarExpanded);
    bar.classList.toggle("expanded", this.weaponBarExpanded);
    // 更新列表中每张卡片
    for (const card of list.children) {
      const id = card.dataset.weapon;
      const ammo = this.ammo[id] ?? 0;
      const ammoEl = card.querySelector(".w-ammo");
      ammoEl.textContent = ammo === Infinity ? "∞" : String(ammo);
      card.classList.toggle("selected", id === this.selectedWeapon);
      card.classList.toggle("empty", ammo <= 0);
      const w = WEAPONS[id];
      const cd = w.cooldown || 1;
      const remain = this.cheatNoCooldown ? 0 : Math.max(0, (this.weaponReadyAt[id] || 0) - this.time);
      const ratio = clamp(remain / cd, 0, 1);
      const cool = card.querySelector(".w-cool");
      if (cool) {
        cool.style.display = ratio > 0.01 ? "block" : "none";
        cool.style.transform = `scaleY(${ratio})`;
      }
    }
  }

  _weaponIcon(id) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
    if (id === "spear") return `<svg ${common}><path d="M4 20L18 6"/><path d="M15 4l5 1-1 5z"/></svg>`;
    if (id === "boulder") return `<svg ${common}><path d="M12 3l7 4 2 8-6 6-8-2-3-7z"/><path d="M9 9l3 3-1 4"/></svg>`;
    if (id === "grenade") return `<svg ${common}><circle cx="10" cy="14" r="6"/><path d="M14 9l2-3M16 5c2 0 3 1 3 3"/></svg>`;
    if (id === "banana") return `<svg ${common}><path d="M5 6c1 8 6 12 14 11-3 3-9 4-13 1S3 9 5 6z"/></svg>`;
    if (id === "boomerang") return `<svg ${common}><path d="M5 8l6 5-6 5"/><path d="M5 8l10 4-10 5" opacity=".55"/></svg>`;
    if (id === "meteor") return `<svg ${common}><circle cx="15" cy="9" r="5"/><path d="M9 15l-5 5M11 17l-3 3M7 11l-3 3"/></svg>`;
    if (id === "crossbow") return `<svg ${common}><path d="M3 12h18"/><path d="M8 6l4 6-4 6"/><path d="M17 9l3 3-3 3"/></svg>`;
    if (id === "cannon") return `<svg ${common}><path d="M3 15l13-5 5 3-3 5-15 2z"/><circle cx="9" cy="18" r="2.6"/><circle cx="16" cy="17" r="2.6"/><path d="M16 10l4-3"/></svg>`;
    if (id === "firebomb") return `<svg ${common}><circle cx="11" cy="15" r="6"/><path d="M11 3c3 3 2 5 0 6-2-1-2-3 0-6z"/></svg>`;
    if (id === "rifle") return `<svg ${common}><path d="M2 14l16-4 3 2-1 3-17 3z"/><path d="M8 15v4"/><path d="M14 12l2 4"/></svg>`;
    if (id === "mortar") return `<svg ${common}><path d="M7 17L15 4l5 3-8 13z"/><path d="M3 20l6-3"/><path d="M9 19l3 2"/></svg>`;
    if (id === "rocket") return `<svg ${common}><path d="M14 4l6 8-6 8-3-4h-5V8h5z"/><path d="M9 12H3"/><path d="M8 8L4 5M8 16l-4 3"/></svg>`;
    if (id === "laser") return `<svg ${common}><path d="M3 12h10"/><path d="M13 9l7 3-7 3z"/><path d="M5 8v8M9 9v6"/></svg>`;
if (id === "railgun") return `<svg ${common}><path d="M2 12h20"/><path d="M4 8v8M9 9v6M14 8v8M19 9v6"/></svg>`;
if (id === "watermelon") return `<svg ${common}><circle cx="12" cy="13" r="8"/><path d="M8 10c2 1 6 1 8 0M8 14c2 1 6 1 8 0"/></svg>`;
if (id === "durian") return `<svg ${common}><path d="M12 3l2 3 3-1 1 3 3 1-1 3 2 2-3 1 1 3-3-1-1 3-2-2-3 1-1-3-3-1 2-2-1-3 3 1z"/></svg>`;
if (id === "poisonshroom") return `<svg ${common}><path d="M4 12a8 6 0 0116 0z"/><path d="M9 12v5a3 3 0 006 0v-5"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="8" r="1.2"/></svg>`;
if (id === "flail") return `<svg ${common}><circle cx="7" cy="7" r="3"/><path d="M9 9l6 6"/><circle cx="17" cy="17" r="4"/><path d="M17 13v-2M13 17h-2"/></svg>`;
if (id === "flare") return `<svg ${common}><path d="M12 3v8"/><path d="M8 8l4 4 4-4"/><path d="M5 17l7-4 7 4"/><path d="M8 21h8"/></svg>`;
if (id === "molotov") return `<svg ${common}><path d="M9 3h6v4l2 3v9a2 2 0 01-2 2h-6a2 2 0 01-2-2v-9l2-3z"/><path d="M12 3c2 2 1 3 0 4-1-1-1-2 0-4z"/></svg>`;
if (id === "cluster") return `<svg ${common}><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></svg>`;
if (id === "drone") return `<svg ${common}><circle cx="12" cy="12" r="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="19" r="1.5"/></svg>`;
if (id === "gravity") return `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 019 9M12 21a9 9 0 01-9-9"/><path d="M12 7v10M7 12h10"/></svg>`;
if (id === "sword") return `<svg ${common}><path d="M12 2l2 6-2 12-2-12z"/><path d="M7 14h10"/><circle cx="12" cy="17" r="1.5"/></svg>`;
if (id === "fireball") return `<svg ${common}><circle cx="12" cy="13" r="6"/><path d="M12 3c2 2 3 4 3 6M9 4c1 1 2 2 2 3"/></svg>`;
if (id === "thunder") return `<svg ${common}><path d="M13 2L5 14h6l-2 8 8-12h-6z"/></svg>`;
if (id === "swordarray") return `<svg ${common}><path d="M12 2v8M12 14v8M2 12h8M14 12h8M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/></svg>`;
if (id === "dragonpalm") return `<svg ${common}><path d="M4 12c3-4 6-6 8-6s5 2 8 6c-3 4-6 6-8 6s-5-2-8-6z"/><circle cx="12" cy="12" r="2"/></svg>`;
if (id === "shieldcharm") return `<svg ${common}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
if (id === "soulchain") return `<svg ${common}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 6l12 12M18 6L6 18"/></svg>`;
if (id === "mend") return `<svg ${common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M12 15v6M9 18h6"/></svg>`;
if (id === "stonewall") return `<svg ${common}><path d="M4 18h16"/><path d="M6 18v-6h5v6"/><path d="M13 18v-9h5v9"/><path d="M8 12h1M15 9h1"/></svg>`;
return `<svg ${common}><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3"/></svg>`;
  }

  _updateHUD() {
    if (!this.level) return;
document.getElementById("hudLevel").textContent = this.level.endless
? `无限模式 · ${this.era.name}`
: `${this.era.name} · 第 ${this.level.id} 关 · ${this.level.name}`;
    document.getElementById("hudTime").textContent = this.cheatRealtime ? "实时" : this.level.endless ? "∞" : String(this.turnNo);
    document.getElementById("windVal").textContent = Math.abs(this.wind).toFixed(1);
    const arrow = document.getElementById("windArrow");
    arrow.style.transform = `rotate(${this.wind >= 0 ? 90 : -90}deg)`;
    arrow.classList.toggle("calm", Math.abs(this.wind) < 0.5);
    const active = this._activePlayer();
    document.getElementById("teamLabel").textContent = this.phase === "over"
      ? "战斗结束"
      : active
        ? `${active.name} · HP ${Math.ceil(active.hp)}`
        : "战斗中";
    const w = WEAPONS[this.selectedWeapon];
    const cd = w.cooldown || 1;
    const remain = this.cheatNoCooldown ? 0 : Math.max(0, (this.weaponReadyAt[this.selectedWeapon] || 0) - this.time);
    document.getElementById("moveBar").style.width = Math.round(clamp(1 - remain / cd, 0, 1) * 100) + "%";
    const info = document.getElementById("weaponInfo");
    if (info && w) {
      info.textContent = `${w.name} · 伤害 ${w.damage}${w.blast ? ` · 范围 ${w.blast}` : ""}`;
      info.style.setProperty("--w-color", w.color);
      info.classList.toggle("realtime", this.cheatRealtime);
    }
    const badge = document.getElementById("realtimeBadge");
    if (badge) badge.classList.toggle("show", this.cheatRealtime);
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color: color || "#fff", life: 0.95, maxLife: 0.95 });
  }

  spawnParticles(x, y, count, color, kind = "spark") {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: rand(-150, 150),
        vy: rand(-220, -20),
        life: rand(0.25, 0.7),
        maxLife: 0.7,
        size: rand(2, 4.5),
        color,
        kind,
        gravity: kind === "fire" ? -40 : 420,
      });
    }
  }

  // ------------------------------------------------------------ 渲染
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.level) {
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    if (this.shake > 0.5) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    if (this.terrainDirty) {
      this.terrain.redraw(this.theme);
      this.terrainDirty = false;
    }
    if (this.terrain) ctx.drawImage(this.terrain.canvas, 0, 0);
    // 动态浮空岛 / 云朵平台：每帧绘制（不进入离屏缓存）
    if (this.terrain) this.terrain.drawPlatforms(ctx, this.theme);
    this._drawAmbient(ctx);
    this._drawWindStreaks(ctx);

    const sorted = this.units.slice().sort((a, b) => Number(a.alive) - Number(b.alive));
    for (const u of sorted) u.draw(ctx, this);
    this._drawFires(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    this._drawSwordRain(ctx);

    if (this.phase === "aim" && (this.aim.active || this.aim.locked)) this._drawPlayerAim(ctx);
    if (this.phase === "aim") this._drawEnemyAims(ctx);

    this._drawGlows(ctx);
    this._drawParticles(ctx);
    this._drawRings(ctx);
    this._drawMuzzleFlashes(ctx);
    this._drawTexts(ctx);
    ctx.restore();
    if (this.screenFlash > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.screenFlash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  _updateFires(dt) {
    if (!this.fires.length) return;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      f.acc += dt;
      if (f.acc >= 0.055) {
        f.acc = 0;
        const a = rand(0, TAU);
        const rr = rand(0, f.r * 0.85);
        this.particles.push({
          x: f.x + Math.cos(a) * rr,
          y: f.y + Math.sin(a) * rr * 0.22 - 2,
          vx: rand(-20, 20), vy: rand(-105, -35),
          life: rand(0.32, 0.78), maxLife: 0.78, size: rand(4, 10),
          color: Math.random() < 0.5 ? "#ffb347" : "#ff6a2a",
          kind: "fire", gravity: -90,
        });
        if (Math.random() < 0.28) {
          this.particles.push({
            x: f.x + rand(-f.r * 0.6, f.r * 0.6), y: f.y - rand(2, 18),
            vx: rand(-18, 18), vy: rand(-90, -28),
            life: rand(0.5, 1.1), maxLife: 1.1, size: rand(8, 16),
            color: "rgba(70,62,55,.38)", kind: "smoke", gravity: -20,
          });
        }
      }
      // 站在火里的敌人会持续被灼烧
      f.dot += dt;
      if (f.dot >= 0.45) {
        f.dot = 0;
        for (const u of this.units) {
          if (!u.alive || u.team === f.team) continue;
          if (Math.abs(u.x - f.x) < f.r && Math.abs(u.y - f.y) < 46) {
            u.takeDamage(f.damage, f.team);
          }
        }
      }
    }
  }

  _drawFires(ctx) {
    if (!this.fires.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fires) {
      const k = clamp(f.life / f.max, 0, 1);
      const pulse = 0.75 + Math.sin(this.time * 15 + f.seed) * 0.25;
      const grad = ctx.createRadialGradient(f.x, f.y - 8, 0, f.x, f.y - 8, f.r * 1.2);
      grad.addColorStop(0, `rgba(255,180,80,${0.34 * k * pulse})`);
      grad.addColorStop(0.55, `rgba(255,110,40,${0.16 * k})`);
      grad.addColorStop(1, "rgba(255,80,20,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 8, f.r * 1.2, 0, TAU);
      ctx.fill();
      const flames = 7;
      for (let i = 0; i < flames; i++) {
        const ox = Math.sin(f.seed * 3 + i * 1.7) * f.r * 0.72;
        const h = (11 + Math.sin(this.time * 9 + i * 2.1 + f.seed) * 5 + (i % 3) * 5) * (0.6 + k * 0.7);
        const sway = Math.sin(this.time * 7 + i * 1.3 + f.seed) * 5;
        ctx.fillStyle = i % 2 ? "rgba(255,150,60,.5)" : "rgba(255,88,28,.46)";
        ctx.beginPath();
        ctx.moveTo(f.x + ox - 5, f.y + 2);
        ctx.quadraticCurveTo(f.x + ox + sway, f.y + 2 - h * 0.55, f.x + ox + sway * 0.4, f.y + 2 - h);
        ctx.quadraticCurveTo(f.x + ox + 5, f.y + 2 - h * 0.5, f.x + ox + 5, f.y + 2);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawGlows(ctx) {
    if (!this.glows.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of this.glows) {
      const k = g.life / g.max;
      const r = g.r * (1.5 - k * 0.5);
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = k * 0.85;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawMuzzleFlashes(ctx) {
    if (!this.muzzleFlashes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.muzzleFlashes) {
      const k = f.t / f.max;
      const len = f.size * (1.6 + (1 - k) * 1.2);
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 1.8);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, f.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = k;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 1.8, 0, TAU);
      ctx.fill();
      // 向枪口方向喷出的锥形火焰
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(0, -f.size * 0.55);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, f.size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawAmbient(ctx) {
    if (!this.ambient.length) return;
    const t = this.theme;
    ctx.save();
    for (const p of this.ambient) {
      const twinkle = 0.65 + 0.35 * Math.sin(this.time * 1.6 + p.phase);
      ctx.globalAlpha = p.a * twinkle;
      ctx.fillStyle = p.color || t.mote;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWindStreaks(ctx) {
    if (Math.abs(this.wind) < 3.2) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1.4;
    const dir = Math.sign(this.wind);
    for (let i = 0; i < 12; i++) {
      const y = 70 + ((i * 97 + this.time * 85) % (H - 180));
      const x = ((this.time * 260 * dir + i * 173) % (W + 260) + W + 260) % (W + 260) - 130;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * (26 + (i % 4) * 14), y + 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlayerAim(ctx) {
    const u = this._activePlayer();
    if (!u) return;
    const w = WEAPONS[this.selectedWeapon];
    if ((this.ammo[this.selectedWeapon] || 0) <= 0) return;
    const ox = u.x;
    const oy = u.y - 44;
    const pts = this._previewPath(ox, oy, this.aim.angle, this.aim.power, w, 0);
    ctx.save();
    // 先画一条很淡的引导线，再叠加强调点，手机上也能看清落点
    ctx.strokeStyle = w.color;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.fillStyle = w.color;
    for (let i = 3; i < pts.length; i += 4) {
      const f = i / pts.length;
      ctx.globalAlpha = 0.45 + 0.5 * (1 - f);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, i === 3 ? 4.5 : 3.4, 0, TAU);
      ctx.fill();
    }
    const end = pts[pts.length - 1];
    if (end) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 10, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end.x - 14, end.y);
      ctx.lineTo(end.x - 6, end.y);
      ctx.moveTo(end.x + 6, end.y);
      ctx.lineTo(end.x + 14, end.y);
      ctx.moveTo(end.x, end.y - 14);
      ctx.lineTo(end.x, end.y - 6);
      ctx.moveTo(end.x, end.y + 6);
      ctx.lineTo(end.x, end.y + 14);
      ctx.stroke();
    }
    // 力度条
    const bw = 54;
    const bx = u.x - bw / 2;
    const by = u.y - 116;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(8,10,14,.65)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = this.aim.power > 0.82 ? "#ff8a5a" : "#ffd27c";
    ctx.fillRect(bx, by, bw * this.aim.power, 5);
    if (this.aim.locked && !this.aim.active) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffe0ad";
      ctx.font = '800 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("已锁定 · 点右下角发射", u.x, u.y - 126);
    }

    // 虚拟摇杆：显示在按下点，拖动方向就是射击方向
    const j = this.aim.startWorld;
    const c = this.aim.currentWorld;
    if (j && c) {
      const dx = c.x - j.x;
      const dy = c.y - j.y;
      const len = Math.hypot(dx, dy);
      // 大操作圈 + 长行程：圈只负责方向与力度刻度，真实拖动 58~528px 才满力
      const ring = 160;
      const dirX = len > 0.001 ? dx / len : 1;
      const dirY = len > 0.001 ? dy / len : 0;
      const knobR = Math.max(30, ring * this.aim.power);
      const kx = j.x + dirX * knobR;
      const ky = j.y + dirY * knobR;
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "rgba(8, 10, 14, 0.55)";
      ctx.beginPath();
      ctx.arc(j.x, j.y, ring + 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "rgba(255, 215, 140, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(j.x, j.y, ring, 0, TAU);
      ctx.stroke();
      // 力度弧：沿外圈填充，直观看到当前力度
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = this.aim.power > 0.82 ? "#ff8a5a" : "#ffd27c";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(j.x, j.y, ring, -Math.PI / 2, -Math.PI / 2 + TAU * this.aim.power);
      ctx.stroke();
      // 十二方向刻度
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = "#ffe0ad";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const inner = i % 3 === 0 ? ring - 10 : ring - 6;
        ctx.beginPath();
        ctx.moveTo(j.x + Math.cos(a) * inner, j.y + Math.sin(a) * inner);
        ctx.lineTo(j.x + Math.cos(a) * ring, j.y + Math.sin(a) * ring);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      // 手指实际的位置：超出力度圈时用一个小点提示，避免误以为没响应
      if (len > ring) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = "#ffe0ad";
        ctx.beginPath();
        ctx.arc(c.x, c.y, 5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.96;
      const knob = ctx.createRadialGradient(kx - 5, ky - 5, 2, kx, ky, 23);
      knob.addColorStop(0, "#fff3cf");
      knob.addColorStop(1, "#e9a53c");
      ctx.fillStyle = knob;
      ctx.beginPath();
      ctx.arc(kx, ky, 23, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(80, 50, 20, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = "#ffe0ad";
      ctx.font = '700 12px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      const deg = ((this.aim.angle * 180) / Math.PI).toFixed(0);
      ctx.fillText(`${deg}° · 力度 ${Math.round(this.aim.power * 100)}%`, j.x, Math.min(j.y + ring + 20, H - 12));
      ctx.restore();
    }
    ctx.restore();
  }

  _drawEnemyAims(ctx) {
    for (const u of this.enemies) {
      if (!u.alive || !u.aiAim) continue;
      const w = u.aiAim.weapon;
      const pts = this._previewPath(u.x, u.y - 44, u.aiAim.angle, u.aiAim.power, w, 1);
      ctx.save();
      ctx.fillStyle = "#ff9c8c";
      for (let i = 3; i < pts.length; i += 5) {
        ctx.globalAlpha = 0.2 + 0.4 * (1 - i / pts.length);
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.4, 0, TAU);
        ctx.fill();
      }
      const end = pts[pts.length - 1];
      if (end) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#ff8f80";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 12, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _previewPath(sx, sy, angle, power, weapon, team) {
    const speed = weapon.speed * (0.5 + 0.5 * power);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let x = sx;
    let y = sy;
    const pts = [];
    const dt = 1 / 45;
    const maxT = weapon.id === "spike" ? 1.3 : 3;
    for (let t = 0; t < maxT; t += dt) {
      vx += this.wind * 27 * dt;
      vy += weapon.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      pts.push({ x, y });
      if (x < -40 || x > W + 40 || y > H + 40) break;
      if (this.terrain.circleHit(x, y, 3)) break;
      const hit = this.units.some((u) => {
        if (!u.alive || u.team === team) return false;
        const dx = x - u.x;
        const dy = y - (u.y - 28);
        return dx * dx + dy * dy < 22 * 22;
      });
      if (hit) break;
    }
    return pts;
  }

  _drawParticles(ctx) {
    // 烟雾先画，火光后画，避免黑烟把火焰盖住
    const ordered = this.particles.slice().sort((a, b) => (a.kind === "smoke" ? 0 : 1) - (b.kind === "smoke" ? 0 : 1));
    for (const p of ordered) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === "smoke") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU);
        ctx.fill();
      } else if (p.kind === "fire") {
        ctx.globalCompositeOperation = "lighter";
        const r = p.size * (0.45 + a * 0.85);
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = "#ff7a2a";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.7, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = "#fff4c8";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.42, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, p.size * a), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawRings(ctx) {
    for (const r of this.rings) {
      const k = r.t / r.life;
      const radius = r.r + (r.max - r.r) * k;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = r.color || "#ffd9a0";
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 18px " + getComputedStyle(document.body).fontFamily;
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.fillStyle = t.color;
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawHeldWeapon(ctx, type, x, y, angle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = scale || 1;
    ctx.lineCap = "round";
    if (type === "spear") {
      ctx.strokeStyle = "#b99767";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(38, 0);
      ctx.stroke();
      ctx.fillStyle = "#e5d9c0";
      ctx.beginPath();
      ctx.moveTo(38, -3.5);
      ctx.lineTo(52, 0);
      ctx.lineTo(38, 3.5);
      ctx.closePath();
      ctx.fill();
    } else if (type === "boulder") {
      ctx.fillStyle = "#8f6a49";
      ctx.strokeStyle = "#3a2417";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(16, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (type === "grenade") {
      ctx.fillStyle = "#5f6b53";
      ctx.strokeStyle = "#242b20";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(16, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c9a36a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(19, -6);
      ctx.quadraticCurveTo(24, -11, 20, -14);
      ctx.stroke();
    } else if (type === "banana") {
      ctx.strokeStyle = "#ffe15c";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(18, 0, 8 * s, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
    } else if (type === "spike") {
      ctx.fillStyle = "#8799a9";
      ctx.strokeStyle = "#2c3540";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(17, 0, 6.5 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#c7d3dd";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(17 + Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(17 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (type === "boomerang") {
      ctx.strokeStyle = "#e8b96a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(8, -7);
      ctx.lineTo(18, 0);
      ctx.lineTo(8, 7);
      ctx.stroke();
    } else if (type === "meteor") {
      ctx.fillStyle = "#7d4a3a";
      ctx.strokeStyle = "#3a1e17";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,140,60,.7)";
      ctx.beginPath();
      ctx.arc(18, 0, 3 * s, 0, TAU);
      ctx.fill();
    } else if (type === "crossbow") {
      ctx.strokeStyle = "#8a6a45";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(34, 0);
      ctx.stroke();
      ctx.strokeStyle = "#c7d3dd";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(24, 0, 12, -Math.PI * 0.62, Math.PI * 0.62);
      ctx.stroke();
      ctx.strokeStyle = "#e8eef4";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(31, -10);
      ctx.lineTo(20, 0);
      ctx.lineTo(31, 10);
      ctx.stroke();
    } else if (type === "cannon") {
      ctx.fillStyle = "#3e4650";
      ctx.strokeStyle = "#151a20";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-4, -7 * s, 38, 14 * s, 4) : ctx.rect(-4, -7 * s, 38, 14 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6d7883";
      ctx.beginPath();
      ctx.arc(34, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (type === "firebomb") {
      ctx.fillStyle = "#a8502c";
      ctx.strokeStyle = "#3a1c12";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(20, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb04a";
      ctx.globalAlpha = 0.8 + Math.sin(performance.now() / 120) * 0.2;
      ctx.beginPath();
      ctx.arc(20, -10, 3 * s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (type === "rifle") {
      ctx.strokeStyle = "#6f4a2c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-8, 2);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.strokeStyle = "#2e3338";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(46, 0);
      ctx.stroke();
      ctx.strokeStyle = "#b9c4cf";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(42, 0);
      ctx.lineTo(50, 0);
      ctx.stroke();
    } else if (type === "mortar") {
      ctx.strokeStyle = "#4d5761";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(2, 8);
      ctx.lineTo(26, -10);
      ctx.stroke();
      ctx.strokeStyle = "#8d99a5";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, 7);
      ctx.lineTo(24, -8);
      ctx.stroke();
      ctx.fillStyle = "#353c44";
      ctx.beginPath();
      ctx.ellipse(4, 9, 5, 3, 0, 0, TAU);
      ctx.fill();
    } else if (type === "rocket") {
      ctx.fillStyle = "#4f5a65";
      ctx.strokeStyle = "#1d2329";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-4, -5, 34, 10, 3) : ctx.rect(-4, -5, 34, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8503a";
      ctx.beginPath();
      ctx.moveTo(30, -5);
      ctx.lineTo(40, 0);
      ctx.lineTo(30, 5);
      ctx.closePath();
      ctx.fill();
    } else if (type === "laser" || type === "railgun") {
      const col = type === "laser" ? "#6fe8ff" : "#b48cff";
      ctx.fillStyle = "#2c3a44";
      ctx.strokeStyle = "#11181e";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-6, -6, 38, 12, 3) : ctx.rect(-6, -6, 38, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      if (type === "laser") {
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(16, -3, 18, 6, 3) : ctx.rect(16, -3, 18, 6);
        ctx.fill();
      } else {
        ctx.fillRect(18, -4.5, 20, 2.4);
        ctx.fillRect(18, 2.1, 20, 2.4);
      }
      ctx.shadowBlur = 0;
    } else if (type === "watermelon") {
      ctx.fillStyle = "#4a8c3f";
      ctx.strokeStyle = "#2c5c26";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#7ed957";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.quadraticCurveTo(18, 0, 24, -4);
      ctx.moveTo(11, 2);
      ctx.quadraticCurveTo(18, 6, 25, 2);
      ctx.stroke();
    } else if (type === "durian") {
      ctx.fillStyle = "#c8b45a";
      ctx.strokeStyle = "#6a5a2a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#8a7a3a";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(18 + Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(18 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (type === "poisonshroom") {
      ctx.fillStyle = "#b48ce8";
      ctx.strokeStyle = "#5c3a8a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, -2, 7 * s, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8dff0";
      ctx.fillRect(15, -2, 6, 8);
    } else if (type === "flail") {
      ctx.strokeStyle = "#a8b0ba";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
      ctx.fillStyle = "#7d8a96";
      ctx.strokeStyle = "#3d4550";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(28, 0, 6 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (type === "flare") {
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(18, -8);
      ctx.lineTo(22, 0);
      ctx.lineTo(18, 8);
      ctx.lineTo(14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (type === "molotov") {
      ctx.fillStyle = "#ff6a3a";
      ctx.strokeStyle = "#8a2a1a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(20, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb04a";
      ctx.beginPath();
      ctx.arc(20, -9, 3 * s, 0, TAU);
      ctx.fill();
    } else if (type === "cluster") {
      ctx.fillStyle = "#e8a0ff";
      ctx.strokeStyle = "#8a4a9a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 6 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c87add";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        ctx.beginPath();
        ctx.arc(18 + Math.cos(a) * 9, Math.sin(a) * 9, 2.5, 0, TAU);
        ctx.fill();
      }
    } else if (type === "drone") {
      ctx.fillStyle = "#6fe8d8";
      ctx.strokeStyle = "#2a8a7a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(20, 0, 5 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#2a8a7a";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.78;
        ctx.beginPath();
        ctx.moveTo(20 + Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(20 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (type === "gravity") {
      ctx.fillStyle = "#d88cff";
      ctx.strokeStyle = "#6a3a9a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#b46add";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(18, 0, 11, 0, TAU);
      ctx.stroke();
    } else if (type === "sword") {
      // 飞剑：手持时剑光微闪
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createRadialGradient(18, 0, 0, 18, 0, 18);
      sg.addColorStop(0, "rgba(168,216,255,.3)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(18, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#e8f4ff";
      ctx.shadowColor = "#a8d8ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(18, -14);
      ctx.lineTo(21, 8);
      ctx.lineTo(18, 12);
      ctx.lineTo(15, 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, -12);
      ctx.lineTo(18, 10);
      ctx.stroke();
      ctx.strokeStyle = "#8ab8d8";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(12, 8);
      ctx.lineTo(24, 8);
      ctx.stroke();
    } else if (type === "fireball") {
      // 火球术：手持时火焰跳动
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(20, 0, 0, 20, 0, 20);
      fg.addColorStop(0, "rgba(255,106,58,.35)");
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(20, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ff6a3a";
      ctx.shadowColor = "#ff6a3a";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(20, 0, 8 * s, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffb04a";
      ctx.beginPath();
      ctx.arc(20, 0, 4 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(20, 0, 2 * s, 0, TAU);
      ctx.fill();
    } else if (type === "thunder") {
      // 雷符：手持时电弧微闪
      ctx.globalCompositeOperation = "lighter";
      const tg = ctx.createRadialGradient(18, 0, 0, 18, 0, 18);
      tg.addColorStop(0, "rgba(255,233,92,.35)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(18, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffe95c";
      ctx.strokeStyle = "#b8a020";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff8c8";
      ctx.beginPath();
      ctx.moveTo(20, -9);
      ctx.lineTo(15, 1);
      ctx.lineTo(19, 1);
      ctx.lineTo(16, 9);
      ctx.lineTo(22, -1);
      ctx.lineTo(18, -1);
      ctx.closePath();
      ctx.fill();
    } else if (type === "swordarray") {
      // 万剑归宗：手持时多把飞剑环绕，剑尖朝前
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createRadialGradient(18, 0, 0, 18, 0, 26);
      sg.addColorStop(0, "rgba(168,216,255,.3)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(18, 0, 26, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const spin = performance.now() / 250;
      // 4 把环绕小剑（剑尖朝前）
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + spin;
        ctx.save();
        ctx.translate(18 + Math.cos(a) * 12, Math.sin(a) * 8);
        ctx.rotate(Math.sin(performance.now() / 400 + i) * 0.2);
        ctx.fillStyle = "#a8d8ff";
        ctx.shadowColor = "#a8d8ff";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-2, -2);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-2, 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      // 中心主剑
      ctx.fillStyle = "#e8f4ff";
      ctx.shadowColor = "#a8d8ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(14, -3.5);
      ctx.lineTo(8, 0);
      ctx.lineTo(14, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#8ab8d8";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14, -4.5);
      ctx.lineTo(14, 4.5);
      ctx.stroke();
    } else if (type === "dragonpalm") {
      // 降龙十八掌：手持时龙形虚影缠绕
      ctx.globalCompositeOperation = "lighter";
      const dg = ctx.createRadialGradient(20, 0, 0, 20, 0, 28);
      dg.addColorStop(0, "rgba(255,160,80,.35)");
      dg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(20, 0, 28, 0, TAU);
      ctx.fill();
      // 龙形虚影（小波浪）
      ctx.strokeStyle = "rgba(255,160,80,.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const px = 2 + t * 30;
        const py = Math.sin(t * 8 + performance.now() / 300) * 5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      // 龙首能量球
      ctx.fillStyle = "#ff8a5a";
      ctx.shadowColor = "#ff8a5a";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(20, 0, 10 * s, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffd25e";
      ctx.beginPath();
      ctx.arc(20, 0, 5 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff4c8";
      ctx.beginPath();
      ctx.arc(20, 0, 2 * s, 0, TAU);
      ctx.fill();
    } else if (type === "shieldcharm") {
      // 护体符：手持时金光环绕
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(18, 0, 0, 18, 0, 20);
      hg.addColorStop(0, "rgba(255,210,94,.3)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(18, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffd25e";
      ctx.shadowColor = "#ffd25e";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(18, -9);
      ctx.lineTo(26, -3);
      ctx.lineTo(26, 3);
      ctx.lineTo(18, 9);
      ctx.lineTo(10, 3);
      ctx.lineTo(10, -3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff8c8";
      ctx.beginPath();
      ctx.arc(18, 0, 3, 0, TAU);
      ctx.fill();
    } else if (type === "soulchain") {
      // 锁魂链：手持时魂火微闪
      ctx.globalCompositeOperation = "lighter";
      const cg = ctx.createRadialGradient(18, 0, 0, 18, 0, 18);
      cg.addColorStop(0, "rgba(180,140,232,.3)");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(18, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#b48ce8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 0, 7 * s, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "#8a5ab8";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + performance.now() / 500;
        ctx.beginPath();
        ctx.moveTo(18 + Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(18 + Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
      ctx.fillStyle = "#d8b8ff";
      ctx.beginPath();
      ctx.arc(18, 0, 2.5, 0, TAU);
      ctx.fill();
    } else if (type === "teleport") {
      // 瞬移：手持时空间裂缝微光
      ctx.globalCompositeOperation = "lighter";
      const tg = ctx.createRadialGradient(18, 0, 0, 18, 0, 16);
      tg.addColorStop(0, "rgba(111,232,255,.35)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(18, 0, 16, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(200,240,255,.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(18, -8);
      ctx.lineTo(24, 0);
      ctx.lineTo(18, 8);
      ctx.lineTo(12, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (type === "poisonmist") {
      // 毒雾术：手持时毒雾缭绕
      ctx.globalCompositeOperation = "lighter";
      const pg = ctx.createRadialGradient(18, 0, 0, 18, 0, 18);
      pg.addColorStop(0, "rgba(138,255,106,.3)");
      pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(18, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#8aff6a";
      ctx.beginPath();
      ctx.arc(18, 0, 6, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + performance.now() / 600;
        ctx.fillStyle = "rgba(180,255,150,.5)";
        ctx.beginPath();
        ctx.arc(18 + Math.cos(a) * 10, Math.sin(a) * 10, 1.5, 0, TAU);
        ctx.fill();
      }
    } else if (type === "heal") {
      // 回春术：手持时生命之光
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(18, 0, 0, 18, 0, 18);
      hg.addColorStop(0, "rgba(106,255,168,.35)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(18, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#6affa8";
      ctx.fillRect(16, -6, 4, 12);
      ctx.fillRect(12, -2, 12, 4);
    } else if (type === "storm") {
      // 呼风唤雨：手持时风暴漩涡
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createRadialGradient(18, 0, 0, 18, 0, 20);
      sg.addColorStop(0, "rgba(106,200,255,.3)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(18, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(180,230,255,.7)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.15) {
          const a = t * TAU + performance.now() / 400 + i * 1.5;
          const r = 3 + t * 9;
          const px = 18 + Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (type === "skylightning") {
      // 天雷灭世：手持时雷光闪烁
      ctx.globalCompositeOperation = "lighter";
      const lg = ctx.createRadialGradient(18, 0, 0, 18, 0, 22);
      lg.addColorStop(0, "rgba(255,255,255,.4)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(18, 0, 22, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(18, 0, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(18 + Math.cos(a) * rand(8, 14), Math.sin(a) * rand(8, 14));
        ctx.stroke();
      }
    } else if (type === "formation") {
      // 诛仙阵：手持时剑阵旋转
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(18, 0, 0, 18, 0, 20);
      fg.addColorStop(0, "rgba(255,106,154,.3)");
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(18, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + performance.now() / 500;
        ctx.save();
        ctx.translate(18, 0);
        ctx.rotate(a);
        ctx.fillStyle = "#ff6a9a";
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(2.5, 6);
        ctx.lineTo(0, 9);
        ctx.lineTo(-2.5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (type === "mend") {
      // 补天术：手持时青绿生命之光 + 星辰环绕
      ctx.globalCompositeOperation = "lighter";
      const mg = ctx.createRadialGradient(18, 0, 0, 18, 0, 22);
      mg.addColorStop(0, "rgba(168,255,216,.4)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(18, 0, 22, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // 星形核心
      ctx.fillStyle = "#a8ffd8";
      ctx.shadowColor = "#a8ffd8";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        const a2 = ((i + 0.5) / 5) * TAU - Math.PI / 2;
        const r1 = 9, r2 = 4;
        if (i === 0) ctx.moveTo(18 + Math.cos(a) * r1, Math.sin(a) * r1);
        else ctx.lineTo(18 + Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(18 + Math.cos(a2) * r2, Math.sin(a2) * r2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 环绕光点
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + performance.now() / 400;
        ctx.fillStyle = "rgba(200,255,230,.6)";
        ctx.beginPath();
        ctx.arc(18 + Math.cos(a) * 14, Math.sin(a) * 14, 1.5, 0, TAU);
        ctx.fill();
      }
    } else if (type === "stonewall") {
      // 搬山术：手持时巨石虚影 + 土石碎光
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createRadialGradient(18, 0, 0, 18, 0, 20);
      sg.addColorStop(0, "rgba(200,184,168,.45)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(18, 0, 20, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // 不规则石块核心
      ctx.fillStyle = "#8a7a6c";
      ctx.strokeStyle = "#3a322c";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const rockR = 8;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const rr = rockR * (0.8 + ((i * 37) % 10) / 28);
        const px = 18 + Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 土石碎光
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + performance.now() / 500;
        ctx.fillStyle = "rgba(220,200,180,.5)";
        ctx.beginPath();
        ctx.arc(18 + Math.cos(a) * 13, Math.sin(a) * 13, 1.4, 0, TAU);
        ctx.fill();
      }
    } else {
      // 默认木棒
      ctx.strokeStyle = "#7c5330";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.fillStyle = "#6b4225";
      ctx.beginPath();
      ctx.arc(25, 0, 5.5 * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  getUnitAimAngle(unit) {
    if (unit.team === 0 && (this.aim.active || this.aim.locked)) return this.aim.angle;
    if (unit.team === 1 && unit.aiAim) return unit.aiAim.angle;
    return unit.facing === 1 ? -0.5 : Math.PI + 0.5;
  }

  isActiveUnit(unit) {
    if (!unit.alive || unit.team !== 0) return false;
    return this.players[this.activePlayerIndex] === unit;
  }

  // ------------------------------------------------------------ 背景
  _buildBackground() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const t = this.theme;
    const rng = mulberry32((this.level.seed || 1) * 97 + 13);
    const sky = g.createLinearGradient(0, 0, 0, H);
    t.sky.forEach((color, i) => sky.addColorStop(i / (t.sky.length - 1), color));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    if (t.night) {
      for (let i = 0; i < 110; i++) {
        const x = rng() * W;
        const y = rng() * H * 0.62;
        g.globalAlpha = 0.25 + rng() * 0.65;
        g.fillStyle = "#e8f1ff";
        g.fillRect(x, y, rng() > 0.8 ? 2 : 1, rng() > 0.8 ? 2 : 1);
      }
      g.globalAlpha = 1;
    }

    // 日/月
    const cx = 1010 - (this.level.seed % 6) * 28;
    const cy = 118;
    const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 220);
    glow.addColorStop(0, t.sunGlow);
    glow.addColorStop(0.45, t.sunGlow.replace(/[\d.]+\)$/, "0.12)"));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(cx - 230, cy - 230, 460, 460);
    g.fillStyle = t.sun;
    g.beginPath();
    if (t.id === "night") {
      g.arc(cx, cy, 38, 0, TAU);
      g.fill();
      g.fillStyle = t.sky[0];
      g.beginPath();
      g.arc(cx + 16, cy - 8, 34, 0, TAU);
      g.fill();
    } else {
      g.arc(cx, cy, t.id === "volcano" ? 30 : 42, 0, TAU);
      g.fill();
    }

    // 云
    if (!t.night || t.id === "volcano") {
      g.fillStyle = "rgba(255,255,255,.14)";
      for (let i = 0; i < 7; i++) {
        const x = rng() * W;
        const y = 60 + rng() * 220;
        const s = 0.6 + rng() * 1.1;
        g.beginPath();
        g.ellipse(x, y, 54 * s, 13 * s, 0, 0, TAU);
        g.ellipse(x + 42 * s, y - 5 * s, 34 * s, 10 * s, 0, 0, TAU);
        g.ellipse(x - 38 * s, y + 3 * s, 28 * s, 9 * s, 0, 0, TAU);
        g.fill();
      }
    }

    if (t.id === "volcano") {
      // 火山烟柱
      g.fillStyle = "rgba(40,20,20,.55)";
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(660 + rng() * 120, 210 - i * 20 + rng() * 14, 24 + i * 7, 0, TAU);
        g.fill();
      }
    }

    // 远/中/近三层山脊
    this._ridge(g, rng, 330, 70, t.far, 7);
    this._ridge(g, rng, 410, 54, t.mid, 9);
    this._ridge(g, rng, 470, 36, t.near, 11);

    // 地平线植被
    for (let i = 0; i < 16; i++) {
      const x = rng() * W;
      const y = 410 + rng() * 70;
      const s = 0.6 + rng() * 0.8;
      this._tree(g, x, y, s, t.near, t.id);
    }

    // 太阳附近飞鸟
    if (!t.night) {
      g.strokeStyle = "rgba(30,20,20,.5)";
      g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const x = 700 + rng() * 300;
        const y = 130 + rng() * 80;
        g.beginPath();
        g.arc(x - 4, y, 5, Math.PI * 1.1, Math.PI * 1.8);
        g.arc(x + 6, y, 5, Math.PI * 1.2, Math.PI * 1.9);
        g.stroke();
      }
    }

    // 暗角
    const vg = g.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 780);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    this.bg = c;
  }

  _ridge(g, rng, baseY, amp, color, steps) {
    g.beginPath();
    g.moveTo(0, H);
    let y = baseY + (rng() - 0.5) * amp;
    g.lineTo(0, y);
    for (let i = 1; i <= steps; i++) {
      y = baseY + (rng() - 0.5) * amp * 1.5;
      g.lineTo((i / steps) * W, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  _tree(g, x, y, s, color, themeId) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = color;
    g.strokeStyle = color;
    if (themeId === "dunes") {
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -34);
      g.moveTo(0, -18);
      g.lineTo(-8, -26);
      g.moveTo(0, -24);
      g.lineTo(8, -32);
      g.stroke();
    } else if (themeId === "volcano") {
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -30);
      g.moveTo(0, -14);
      g.lineTo(-12, -24);
      g.moveTo(0, -20);
      g.lineTo(11, -30);
      g.stroke();
    } else if (themeId === "night" || themeId === "forest" || themeId === "bridge") {
      g.fillRect(-3, -20, 6, 20);
      g.beginPath();
      g.moveTo(0, -54);
      g.lineTo(-18, -20);
      g.lineTo(18, -20);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(0, -38);
      g.lineTo(-22, -4);
      g.lineTo(22, -4);
      g.closePath();
      g.fill();
    } else {
      g.fillRect(-2.5, -20, 5, 20);
      g.beginPath();
      g.arc(0, -26, 14, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(-10, -22, 9, 0, TAU);
      g.arc(10, -22, 9, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  _makeAmbient() {
    this.ambient = [];
    const volcanic = this.theme.id === "volcano";
    const night = this.theme.id === "night";
    const count = night ? 34 : volcanic ? 46 : 30;
    for (let i = 0; i < count; i++) {
      this.ambient.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: volcanic ? rand(-6, 6) : rand(-10, 10),
        vy: volcanic ? rand(-34, -12) : night ? rand(-4, 4) : rand(-5, 5),
        s: volcanic ? rand(1, 2.2) : night ? rand(1, 2.6) : rand(0.8, 2),
        a: volcanic ? rand(0.35, 0.8) : rand(0.15, 0.5),
        phase: rand(0, 6),
        color: volcanic ? (Math.random() < 0.5 ? "#ff9a4a" : "#ffd07a") : night ? "#ffe9a3" : null,
      });
    }
  }

  _spawnConfetti() {
    const colors = ["#ffd27c", "#ff8a5a", "#7ddc91", "#7fd2ff", "#ffe9a3"];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: rand(0, W), y: rand(-80, -10),
        vx: rand(-80, 80), vy: rand(80, 260),
        life: rand(1.5, 3), maxLife: 3, size: rand(3, 7),
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "fire", gravity: 120,
      });
    }
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.__stoneWars = new StoneWars();
