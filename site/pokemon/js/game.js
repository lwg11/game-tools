/**
 * 精灵宝可梦 · 丰缘冒险
 * ------------------------------------------------------------
 * 回合制战斗 + 属性克制 + 捕获 + 升级进化 + 队伍养成。
 * 数值公式见 data.js（参考第三世代）。
 */
import "../../assets/js/device.js";
import { ProgressStore } from "../../assets/js/progress.js";
import { initAccount } from "../../assets/js/account.js";
import { toast, icon } from "../../assets/js/ui.js";
import {
  SPECIES, SPECIES_ORDER, SPECIES_COUNT, STARTERS, MOVES, TYPE_NAMES, TYPE_COLORS,
  ITEMS, ITEM_IDS, BALLS, BALL_IDS, LEVELS, TOTAL_LEVELS, getLevel, getLevelEnemies,
  createMon, calcStats, expForLevel, levelProgress, grantExp, catchChance,
  effectiveness, STAT_NAMES, NATURES,
} from "./data.js";
import { monsterSVG } from "./sprites.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STATUS_NAMES = { psn: "中毒", brn: "灼伤", par: "麻痹", slp: "睡眠", frz: "冰冻" };
const STAGE_MULT = [2 / 8, 2 / 7, 2 / 6, 2 / 5, 2 / 4, 2 / 3, 1, 3 / 2, 4 / 2, 5 / 2, 6 / 2, 7 / 2, 8 / 2];
const stageMult = (stage) => STAGE_MULT[clamp(Number(stage) || 0, -6, 6) + 6];

function typeBadges(types) {
  return (types || []).map((t) =>
    `<span class="type-badge" style="background:${TYPE_COLORS[t] || "#888"}">${TYPE_NAMES[t] || t}</span>`
  ).join("");
}

// ---------------------------------------------------------------- 音效
class Sfx {
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
      this.master.gain.value = 0.2;
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

// ---------------------------------------------------------------- 游戏主体
class PokemonGame {
  constructor() {
    this.store = new ProgressStore("pokemon");
    this.sfx = new Sfx();
    this.phase = "menu"; // menu | busy | choose | switch | pause | cheat | over
    this.battle = null;
    this.busy = false;
    this.cheatOpen = false;
    this.pauseOpen = false;
    this.cheats = { oneHit: false, catch: false, infinite: false };
    this.pendingSwitch = null;
    this.teamTab = "team";
    this.selectedStarter = null;
    this.soundOn = true;
    this.lastLevelId = 1;
    this.resultNextId = 1;
    this._rotateTimer = null;
    this._bindUI();
    this._boot();
  }

  get p() {
    return this.store.state;
  }

  // ------------------------------------------------------------ 初始化
  async _boot() {
    this._renderStarterGrid();
    await this.store.init();
    this.soundOn = this.p.sound !== false;
    this.sfx.enabled = this.soundOn;
    this._refreshLevelScreen();
    this.store.onChange(() => {
      this._refreshLevelScreen();
      if (document.getElementById("teamScreen").classList.contains("show")) this._renderTeamScreen();
    });
    try {
      await initAccount(document.querySelector("[data-account-chip]"));
    } catch (err) { /* 游客模式 */ }

    if (!this.p.starter) {
      document.getElementById("levelScreen").classList.add("show");
      document.getElementById("starterScreen").classList.add("show");
    } else {
      document.getElementById("levelScreen").classList.add("show");
      if (!this.p.tutorialSeen) this._showTutorial(true);
    }
    document.getElementById("rotateTip").classList.add("hide");
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);

    $("pkContinue").addEventListener("click", () => this.startBattle(this._continueLevelId()));
    $("pkTeamBtn").addEventListener("click", () => this._openTeam("team"));
    $("pkShopBtn").addEventListener("click", () => this._openTeam("shop"));
    $("pkTutorialBtn").addEventListener("click", () => this._showTutorial(false));
    $("pkCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });

    $("levelGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-level]");
      if (!card || card.classList.contains("locked")) return;
      this.sfx.ensure();
      this.sfx.click();
      this.startBattle(Number(card.dataset.level));
    });

    $("starterGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-starter]");
      if (!card) return;
      this.sfx.ensure();
      this.sfx.click();
      this._selectStarter(card.dataset.starter);
    });
    $("starterConfirm").addEventListener("click", () => this._confirmStarter());

    $("tutorialStart").addEventListener("click", () => this._startFromTutorial());
    $("tutorialScreen").addEventListener("click", (e) => {
      if (e.target.id === "tutorialScreen") this._startFromTutorial();
    });

    $("teamClose").addEventListener("click", () => this._closeTeam());
    $("teamScreen").addEventListener("click", (e) => {
      if (e.target.id === "teamScreen") this._closeTeam();
    });
    $("teamTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      this.teamTab = btn.dataset.tab;
      this._renderTeamScreen();
    });
    $("teamContent").addEventListener("click", (e) => {
      const promote = e.target.closest("[data-promote]");
      if (promote) { this._promoteMon(promote.dataset.promote); return; }
      const remove = e.target.closest("[data-remove]");
      if (remove) { this._removeMon(remove.dataset.remove); return; }
      const buy = e.target.closest("[data-buy]");
      if (buy && !buy.disabled) this._buyItem(buy.dataset.buy);
    });

    $("battlePause").addEventListener("click", () => this._openPause());
    $("battleCheat").addEventListener("click", () => { this.sfx.ensure(); this._openCheat(); });

    $("actionMenu").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || this.phase !== "choose" || this.busy || this.cheatOpen || this.pauseOpen) return;
      this.sfx.click();
      const action = btn.dataset.action;
      if (action === "fight") this._showMoves();
      else if (action === "bag") this._showBag();
      else if (action === "team") this._showTeamMenu(false);
      else if (action === "run") this._turn({ type: "run" });
    });

    $("subMenu").addEventListener("click", (e) => {
      const back = e.target.closest("[data-back]");
      if (back) { this._showActions(); return; }
      const move = e.target.closest("[data-move-index]");
      if (move && !move.disabled) {
        this._turn({ type: "move", index: Number(move.dataset.moveIndex) });
        return;
      }
      const itemBtn = e.target.closest("[data-item]");
      if (itemBtn && !itemBtn.disabled) {
        this._turn({ type: "item", id: itemBtn.dataset.item });
        return;
      }
      const sw = e.target.closest("[data-switch-index]");
      if (sw && !sw.disabled) {
        const index = Number(sw.dataset.switchIndex);
        if (this.pendingSwitch) {
          const { resolve } = this.pendingSwitch;
          this.pendingSwitch = null;
          this.battle.active = index;
          document.getElementById("playerSprite").classList.remove("faint");
          this._renderBattle();
          this._clearSub();
          this.sfx.click();
          resolve();
        } else {
          this._turn({ type: "switch", index });
        }
      }
    });

    $("resumeBtn").addEventListener("click", () => this._closePause());
    $("restartBtn").addEventListener("click", () => {
      document.getElementById("pauseScreen").classList.remove("show");
      this.startBattle(this.lastLevelId);
    });
    $("pauseLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("pauseSoundBtn").addEventListener("click", () => this._toggleSound());

    $("cheatScreen").addEventListener("click", (e) => {
      if (e.target.id === "cheatScreen") { this._closeCheat(); return; }
      const btn = e.target.closest("[data-cheat]");
      if (btn) this._handleCheat(btn.dataset.cheat);
    });

    $("nextBtn").addEventListener("click", () => this.startBattle(this.resultNextId));
    $("retryBtn").addEventListener("click", () => this.startBattle(this.lastLevelId));
    $("resultLevelsBtn").addEventListener("click", () => this._openLevelScreen());
    $("rotateTip").addEventListener("click", () => $("rotateTip").classList.add("hide"));

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (this.cheatOpen) this._closeCheat();
      else if (this.pauseOpen) this._closePause();
      else if (this.battle && !this.battle.over && this.phase === "choose") this._openPause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.battle && !this.battle.over && this.phase === "choose") this._openPause();
    });
  }

  // ------------------------------------------------------------ 屏幕
  _hideScreens() {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("show"));
  }

  _openLevelScreen() {
    this.battle = null;
    this.phase = "menu";
    this.busy = false;
    this.pendingSwitch = null;
    this.cheatOpen = false;
    this.pauseOpen = false;
    this._hideScreens();
    document.getElementById("rotateTip").classList.add("hide");
    document.getElementById("levelScreen").classList.add("show");
    this._refreshLevelScreen();
  }

  _showTutorial(first) {
    this.firstTutorial = Boolean(first);
    document.getElementById("tutorialStart").textContent = first ? "开始第 1 关" : "继续冒险";
    document.getElementById("tutorialScreen").classList.add("show");
  }

  _startFromTutorial() {
    document.getElementById("tutorialScreen").classList.remove("show");
    if (!this.p.tutorialSeen) this.store.update((p) => { p.tutorialSeen = true; });
    this.startBattle(this.firstTutorial ? 1 : this._continueLevelId());
  }

  _continueLevelId() {
    const unlocked = clamp(Number(this.p.unlocked) || 1, 1, TOTAL_LEVELS);
    for (let i = 1; i <= unlocked; i++) {
      if (!(this.p.cleared || {})[i]) return i;
    }
    return unlocked;
  }

  // ------------------------------------------------------------ 初始伙伴
  _renderStarterGrid() {
    document.getElementById("starterGrid").innerHTML = STARTERS.map((id) => {
      const sp = SPECIES[id];
      return `<button class="starter-option" data-starter="${id}" type="button">
        ${monsterSVG(id)}
        <strong>${sp.name}</strong>
        <div class="starter-types">${typeBadges(sp.types)}</div>
        <p>${sp.desc}</p>
      </button>`;
    }).join("");
  }

  _selectStarter(id) {
    this.selectedStarter = id;
    document.querySelectorAll(".starter-option").forEach((el) => {
      el.classList.toggle("selected", el.dataset.starter === id);
    });
    const sp = SPECIES[id];
    document.getElementById("starterTip").textContent = `已选择 ${sp.name} · ${sp.types.map((t) => TYPE_NAMES[t]).join(" / ")}`;
    document.getElementById("starterConfirm").disabled = false;
  }

  _confirmStarter() {
    if (!this.selectedStarter) return;
    const id = this.selectedStarter;
    const mon = createMon(id, 5);
    this.store.update((p) => {
      p.team = [mon];
      p.box = p.box || [];
      p.starter = id;
      p.caught = p.caught || {};
      p.caught[id] = true;
      p.items = p.items || {};
    });
    document.getElementById("starterScreen").classList.remove("show");
    this.selectedStarter = null;
    this.sfx.ensure();
    this.sfx.level();
    toast(`${SPECIES[id].name} 加入了队伍！`, "ok");
    if (!this.p.tutorialSeen) this._showTutorial(true);
    else this._openLevelScreen();
  }

  // ------------------------------------------------------------ 关卡选择
  _refreshLevelScreen() {
    const p = this.p;
    const stars = Object.values(p.stars || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const cleared = Object.keys(p.cleared || {}).length;
    const caught = Object.keys(p.caught || {}).length;
    const unlocked = clamp(Number(p.unlocked) || 1, 1, TOTAL_LEVELS);
    document.getElementById("pkStars").textContent = String(stars);
    document.getElementById("pkBar").style.width = Math.round((cleared / TOTAL_LEVELS) * 100) + "%";
    document.getElementById("pkProgress").textContent = `已解锁 ${unlocked} / ${TOTAL_LEVELS} 关 · 图鉴 ${caught} / ${SPECIES_COUNT} 种`;
    document.getElementById("pkMoney").textContent = String(Number(p.money) || 0);
    document.getElementById("pkTeamMini").innerHTML = (p.team || []).map((mon) =>
      `<span class="mini-mon" title="${SPECIES[mon.species].name}">${monsterSVG(mon.species)}</span>`
    ).join("") || '<span class="mini-empty">?</span>';

    const btn = document.getElementById("pkContinue");
    if (!p.starter) btn.textContent = "选择初始伙伴";
    else if (cleared >= TOTAL_LEVELS) btn.textContent = "再战冠军";
    else btn.textContent = `继续第 ${this._continueLevelId()} 关`;

    this._renderLevelGrid();
  }

  _renderLevelGrid() {
    const state = this.p;
    const unlocked = clamp(Number(state.unlocked) || 1, 1, TOTAL_LEVELS);
    const stars = state.stars || {};
    const starter = state.starter;
    document.getElementById("levelGrid").innerHTML = LEVELS.map((lv) => {
      const locked = lv.id > unlocked;
      const s = Number(stars[lv.id]) || 0;
      const first = getLevelEnemies(lv, starter)[0];
      const current = !locked && lv.id === unlocked && !(state.cleared || {})[lv.id];
      return `<button class="level-card theme-${lv.theme} ${locked ? "locked" : ""} ${current ? "current" : ""}" data-level="${lv.id}" ${locked ? 'aria-disabled="true"' : ""}>
        <span class="lv-thumb">${monsterSVG(first.species)}</span>
        <span>
          <span class="lv-name">${String(lv.id).padStart(2, "0")} · ${lv.name}</span>
          <span class="lv-sub">${lv.sub}</span>
          <span class="lv-stars">${[1, 2, 3].map((i) => `<span class="${s >= i ? "on" : ""}">★</span>`).join("")}</span>
        </span>
        ${locked ? `<span class="lv-lock">${icon("lock")}</span>` : ""}
      </button>`;
    }).join("");
  }

  // ------------------------------------------------------------ 队伍 / 图鉴 / 商店
  _openTeam(tab) {
    this.teamTab = tab || "team";
    document.getElementById("teamScreen").classList.add("show");
    this._renderTeamScreen();
  }

  _closeTeam() {
    document.getElementById("teamScreen").classList.remove("show");
  }

  _renderTeamScreen() {
    const p = this.p;
    document.querySelectorAll("#teamTabs [data-tab]").forEach((el) => {
      el.classList.toggle("active", el.dataset.tab === this.teamTab);
    });
    document.getElementById("teamMoney").textContent = String(Number(p.money) || 0);
    const content = document.getElementById("teamContent");
    if (this.teamTab === "team") content.innerHTML = this._teamTabHTML();
    else if (this.teamTab === "dex") content.innerHTML = this._dexTabHTML();
    else content.innerHTML = this._shopTabHTML();
  }

  _teamTabHTML() {
    const p = this.p;
    const team = p.team || [];
    const box = p.box || [];
    const teamCards = team.map((mon) => this._monCardHTML(mon, true)).join("");
    const boxCards = box.map((mon) => {
      const sp = SPECIES[mon.species];
      return `<button class="box-mon" data-promote="${mon.uid}" type="button">
        ${monsterSVG(mon.species)}
        <b>${sp.name}</b><span>Lv.${mon.level}</span>
      </button>`;
    }).join("") || '<div class="box-empty">电脑里还没有宝可梦，去野生关卡捕捉吧。</div>';
    return `<div class="team-section-title">当前队伍 <small>${team.length} / 3 · 点击“移出”放入电脑</small></div>
      <div class="team-grid">${teamCards || '<div class="box-empty">还没有宝可梦</div>'}</div>
      <div class="team-section-title">电脑存储 <small>${box.length} 只 · 点击卡片加入队伍</small></div>
      <div class="box-grid">${boxCards}</div>`;
  }

  _monCardHTML(mon, inTeam) {
    const sp = SPECIES[mon.species];
    const stats = calcStats(mon);
    const expPct = Math.round(levelProgress(mon) * 100);
    const natureObj = NATURES.find((n) => n.id === mon.nature);
    const nature = natureObj ? natureObj.name : "—";
    return `<div class="mon-card">
      <span class="mon-pic">${monsterSVG(mon.species)}</span>
      <span class="mon-main">
        <div class="mon-name">${sp.name} <span class="mon-lv">Lv.${mon.level}</span></div>
        <div class="mon-types">${typeBadges(sp.types)}</div>
        <div class="mon-hpbar"><i style="width:${expPct}%"></i></div>
        <div class="mon-detail">
          <span>HP <b>${stats.hp}</b></span>
          <span>攻击 <b>${stats.atk}</b></span>
          <span>特攻 <b>${stats.spa}</b></span>
          <span>防御 <b>${stats.def}</b></span>
          <span>特防 <b>${stats.spd}</b></span>
          <span>速度 <b>${stats.spe}</b></span>
        </div>
        <div class="mon-moves">${mon.moves.map((id) => `<span>${MOVES[id] ? MOVES[id].name : id}</span>`).join("")}</div>
        <div class="mon-detail"><span>性格 <b>${nature}</b></span><span>经验 <b>${expPct}%</b></span></div>
      </span>
      ${inTeam ? `<span class="mon-actions"><button class="mon-mini-btn" data-remove="${mon.uid}" type="button">移出</button></span>` : ""}
    </div>`;
  }

  _dexTabHTML() {
    const caught = this.p.caught || {};
    const total = SPECIES_ORDER.filter((id) => caught[id]).length;
    const cards = SPECIES_ORDER.map((id, i) => {
      const sp = SPECIES[id];
      const owned = Boolean(caught[id]);
      return `<div class="dex-mon ${owned ? "" : "uncaught"}">
        <span class="dex-no">#${String(i + 1).padStart(3, "0")}</span>
        ${monsterSVG(id)}
        <b>${sp.name}</b>
        <div class="dex-types">${sp.types.map((t) => `<i style="background:${TYPE_COLORS[t]}"></i>`).join("")}</div>
      </div>`;
    }).join("");
    return `<div class="dex-summary">已登记 <b>${total}</b> / ${SPECIES_COUNT} 种宝可梦</div><div class="dex-grid">${cards}</div>`;
  }

  _shopTabHTML() {
    const p = this.p;
    const items = p.items || {};
    return `<div class="shop-list">${ITEM_IDS.map((id) => {
      const it = ITEMS[id];
      const owned = Number(items[id]) || 0;
      const canBuy = (Number(p.money) || 0) >= it.price;
      return `<div class="shop-row">
        <span class="shop-ico" style="background:radial-gradient(circle at 35% 30%, #fff, ${it.color})"></span>
        <div class="shop-main"><b>${it.name} <small>持有 ${owned}</small></b><span>${it.desc}</span></div>
        <span class="shop-price">${it.price} 金</span>
        <button class="shop-buy" data-buy="${id}" type="button" ${canBuy ? "" : "disabled"}>购买</button>
      </div>`;
    }).join("")}</div>`;
  }

  _promoteMon(uid) {
    const p = this.p;
    p.box = p.box || [];
    p.team = p.team || [];
    const idx = p.box.findIndex((m) => m.uid === uid);
    if (idx < 0) return;
    const mon = p.box.splice(idx, 1)[0];
    if (p.team.length < 3) {
      p.team.push(mon);
    } else {
      const out = p.team.pop();
      p.box.push(out);
      p.team.push(mon);
      toast(`${SPECIES[out.species].name} 已移入电脑`, "", 1800);
    }
    this.store.update(() => {});
    this._renderTeamScreen();
  }

  _removeMon(uid) {
    const p = this.p;
    if ((p.team || []).length <= 1) {
      toast("至少要保留一只宝可梦", "err");
      return;
    }
    const idx = p.team.findIndex((m) => m.uid === uid);
    if (idx < 0) return;
    p.box = p.box || [];
    p.box.push(p.team.splice(idx, 1)[0]);
    this.store.update(() => {});
    this._renderTeamScreen();
  }

  _buyItem(id) {
    const item = ITEMS[id];
    if (!item) return;
    if ((Number(this.p.money) || 0) < item.price) {
      toast("金币不足", "err");
      return;
    }
    this.store.update((p) => {
      p.money = (Number(p.money) || 0) - item.price;
      p.items = p.items || {};
      p.items[id] = (Number(p.items[id]) || 0) + 1;
    });
    this.sfx.heal();
    toast(`购买了 ${item.name}`, "ok");
    this._renderTeamScreen();
  }

  // ------------------------------------------------------------ 战斗初始化
  startBattle(id) {
    const level = getLevel(id);
    const team = (this.p.team || []).map((mon) => this._runtime(mon));
    if (!team.length) {
      toast("请先选择初始宝可梦", "err");
      return;
    }
    const enemies = getLevelEnemies(level, this.p.starter).map((e) => this._makeEnemy(e));
    this._hideScreens();
    this.lastLevelId = level.id;
    this.battle = {
      level,
      wild: Boolean(level.wild),
      trainer: level.trainer || null,
      enemies,
      enemyIndex: 0,
      team,
      active: 0,
      faints: 0,
      caught: null,
      over: false,
      money: 0,
      stars: 0,
    };
    this.busy = true;
    this.phase = "busy";
    this.pendingSwitch = null;
    this.cheatOpen = false;
    this.pauseOpen = false;
    this._clearSub();
    document.getElementById("battleScreen").classList.add("show");
    document.getElementById("battlePlace").textContent = `${level.name} · ${level.sub}`;
    document.getElementById("battleField").dataset.theme = level.theme;
    const rotateTip = document.getElementById("rotateTip");
    rotateTip.classList.remove("hide");
    if (this._rotateTimer) clearTimeout(this._rotateTimer);
    this._rotateTimer = setTimeout(() => rotateTip.classList.add("hide"), 5000);
    document.getElementById("battleMsg").textContent = "战斗准备中…";
    document.getElementById("playerSprite").classList.remove("faint");
    document.getElementById("enemySprite").classList.remove("faint");
    this._renderBattle();
    this._battleIntro();
  }

  async _battleIntro() {
    this.sfx.ensure();
    this.sfx.encounter();
    await sleep(260);
    const level = this.battle.level;
    if (level.intro) await this._say(level.intro, 850);
    if (this.battle.wild) {
      await this._say(`野生的 ${this._name(this._foe())} 出现了！`, 700);
    } else {
      await this._say(`${this.battle.trainer} 派出了 ${this._name(this._foe())}！`, 700);
    }
    if (!this.battle) return;
    this.busy = false;
    this.phase = "choose";
    this._showActions();
  }

  _runtime(mon) {
    const stats = calcStats(mon);
    return {
      mon,
      stats,
      maxHp: stats.hp,
      hp: stats.hp,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0 },
      status: null,
      statusTurns: 0,
      moves: mon.moves.map((id) => {
        const m = MOVES[id] || MOVES.tackle;
        return { id, pp: m.pp, maxPp: m.pp };
      }),
      catchRate: SPECIES[mon.species].catchRate,
    };
  }

  _makeEnemy(entry) {
    return this._runtime(createMon(entry.species, entry.level));
  }

  _sp(rt) { return SPECIES[rt.mon.species]; }
  _name(rt) { return this._sp(rt).name; }
  _active() { return this.battle ? this.battle.team[this.battle.active] : null; }
  _foe() { return this.battle ? this.battle.enemies[this.battle.enemyIndex] : null; }

  _refreshRuntime(rt) {
    const oldMax = rt.maxHp;
    const oldHp = rt.hp;
    rt.stats = calcStats(rt.mon);
    rt.maxHp = rt.stats.hp;
    rt.hp = Math.min(rt.maxHp, oldHp + Math.max(0, rt.maxHp - oldMax));
  }

  _syncRuntimeMoves(rt) {
    const existing = new Map(rt.moves.map((m) => [m.id, m]));
    rt.moves = rt.mon.moves.map((id) => existing.get(id) || {
      id,
      pp: (MOVES[id] || MOVES.tackle).pp,
      maxPp: (MOVES[id] || MOVES.tackle).pp,
    });
  }

  // ------------------------------------------------------------ 渲染战斗
  _renderBattle() {
    const b = this.battle;
    if (!b) return;
    const e = this._foe();
    const p = this._active();
    document.getElementById("enemySprite").innerHTML = e ? monsterSVG(e.mon.species) : "";
    document.getElementById("playerSprite").innerHTML = p ? monsterSVG(p.mon.species) : "";
    document.getElementById("enemyCard").innerHTML = e ? this._cardHTML(e, true) : "";
    document.getElementById("playerCard").innerHTML = p ? this._cardHTML(p, false) : "";
    document.getElementById("teamDots").innerHTML = b.team.map((rt, i) =>
      `<span class="dot ${rt.hp <= 0 ? "fainted" : ""} ${i === b.active ? "active" : ""}"></span>`
    ).join("");
  }

  _cardHTML(rt, isEnemy) {
    const sp = this._sp(rt);
    const pct = clamp((rt.hp / Math.max(1, rt.maxHp)) * 100, 0, 100);
    const cls = pct > 50 ? "" : pct > 20 ? "mid" : "low";
    const status = rt.status
      ? `<span class="status-badge ${rt.status}">${STATUS_NAMES[rt.status] || rt.status}</span>`
      : "";
    const exp = isEnemy ? "" : `<div class="exp-row"><span>EXP</span><div class="exp-track"><i style="width:${Math.round(levelProgress(rt.mon) * 100)}%"></i></div></div>`;
    return `<div class="hp-top"><span class="mon-name">${sp.name}</span><span class="mon-lv">Lv.${rt.mon.level}</span></div>
      <div class="type-row">${typeBadges(sp.types)}</div>
      <div class="hp-track"><i class="${cls}" style="width:${pct}%"></i></div>
      <div class="hp-bottom"><span>HP ${Math.max(0, rt.hp)} / ${rt.maxHp}</span>${status}</div>
      ${exp}`;
  }

  // ------------------------------------------------------------ 操作菜单
  _showActions() {
    const b = this.battle;
    document.getElementById("actionMenu").style.display = "";
    document.getElementById("subMenu").classList.remove("show");
    document.getElementById("subMenu").innerHTML = "";
    if (!b || b.over) return;
    const runLabel = b.wild ? "逃跑" : "认输";
    const runSub = b.wild ? "离开战斗" : "放弃本场";
    document.getElementById("actionMenu").innerHTML = `
      <button class="battle-action fight" data-action="fight" type="button">战斗<small>选择招式</small></button>
      <button class="battle-action bag" data-action="bag" type="button">背包<small>道具 / 精灵球</small></button>
      <button class="battle-action team" data-action="team" type="button">宝可梦<small>交换上场</small></button>
      <button class="battle-action run" data-action="run" type="button">${runLabel}<small>${runSub}</small></button>`;
  }

  _showSub(html) {
    document.getElementById("actionMenu").style.display = "none";
    const sub = document.getElementById("subMenu");
    sub.innerHTML = html;
    sub.classList.add("show");
  }

  _clearSub() {
    const sub = document.getElementById("subMenu");
    sub.classList.remove("show");
    sub.innerHTML = "";
  }

  _showMoves() {
    const p = this._active();
    if (!p) return;
    const allOut = p.moves.every((slot) => slot.pp <= 0);
    const buttons = p.moves.map((slot, i) => {
      const m = MOVES[slot.id] || MOVES.tackle;
      return `<button class="move-btn" style="--tc:${TYPE_COLORS[m.type]}" data-move-index="${i}" type="button" ${slot.pp <= 0 ? "disabled" : ""}>
        <strong>${m.name}</strong>
        <span class="mv-meta"><span class="mv-type">${TYPE_NAMES[m.type]}</span><span>威力 ${m.power || "—"}</span><span class="mv-pp">PP ${slot.pp}/${slot.maxPp}</span></span>
      </button>`;
    }).join("");
    const struggle = allOut
      ? `<button class="move-btn" style="--tc:#9a9a82" data-move-index="-1" type="button"><strong>挣扎</strong><span class="mv-meta"><span class="mv-type">一般</span><span>威力 50</span><span class="mv-pp">会反伤</span></span></button>`
      : "";
    this._showSub(`<div class="sub-head"><span class="sub-title">选择招式 · ${this._name(p)}</span><button class="sub-back" data-back type="button">返回</button></div><div class="move-grid">${buttons}${struggle}</div>`);
  }

  _showBag() {
    const items = this.p.items || {};
    const potions = ["potion", "superPotion", "hyperPotion"].map((id) => {
      const it = ITEMS[id];
      const count = Number(items[id]) || 0;
      return `<button class="list-row" data-item="${id}" type="button" ${count <= 0 && !this.cheats.infinite ? "disabled" : ""}>
        <span class="row-pic" style="display:grid;place-items:center;color:${it.color};font-size:20px">✚</span>
        <span class="row-main"><b>${it.name}</b><span>${it.desc}</span></span>
        <span class="row-tag">×${this.cheats.infinite ? "∞" : count}</span>
      </button>`;
    }).join("");
    const balls = BALL_IDS.map((id) => {
      const ball = BALLS[id];
      const count = Number(items[id]) || 0;
      const disabled = !this.battle.wild || (count <= 0 && !this.cheats.infinite);
      return `<button class="list-row" data-item="${id}" type="button" ${disabled ? "disabled" : ""}>
        <span class="ball-dot" style="background:linear-gradient(180deg, ${ball.color} 0 46%, #fff 46% 58%, ${ball.color} 58%)"></span>
        <span class="row-main"><b>${ball.name}</b><span>${this.battle.wild ? ball.desc : "训练家对战中无法使用"}</span></span>
        <span class="row-tag">×${this.cheats.infinite ? "∞" : count}</span>
      </button>`;
    }).join("");
    this._showSub(`<div class="sub-head"><span class="sub-title">背包</span><button class="sub-back" data-back type="button">返回</button></div><div class="list-menu">${potions}${balls}</div>`);
  }

  _showTeamMenu(forced) {
    const b = this.battle;
    if (!b) return;
    const rows = b.team.map((rt, i) => {
      const sp = this._sp(rt);
      const pct = clamp((rt.hp / Math.max(1, rt.maxHp)) * 100, 0, 100);
      const state = i === b.active ? "出战中" : rt.hp <= 0 ? "已倒下" : `HP ${rt.hp} / ${rt.maxHp}`;
      const disabled = rt.hp <= 0 || i === b.active;
      return `<button class="list-row" data-switch-index="${i}" type="button" ${disabled ? "disabled" : ""}>
        <span class="row-pic">${monsterSVG(rt.mon.species)}</span>
        <span class="row-main"><b>${sp.name} <small>Lv.${rt.mon.level}</small></b><span>${state}</span></span>
        <span class="row-hpbar"><i style="width:${pct}%;background:${pct > 50 ? "#7ddc91" : pct > 20 ? "#f2b625" : "#e8504a"}"></i></span>
      </button>`;
    }).join("");
    const head = `<div class="sub-head"><span class="sub-title">${forced ? "选择上场的宝可梦" : "更换宝可梦"}</span>${forced ? "" : '<button class="sub-back" data-back type="button">返回</button>'}</div>`;
    this._showSub(`${head}<div class="list-menu">${rows}</div>`);
  }

  // ------------------------------------------------------------ 回合流程
  async _say(text, duration = null) {
    if (!text) return;
    const el = document.getElementById("battleMsg");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    await sleep(duration == null ? Math.min(900, 360 + text.length * 16) : duration);
  }

  async _turn(action) {
    if (!this.battle || this.battle.over || this.phase !== "choose" || this.busy) return;
    this.busy = true;
    this.phase = "busy";
    this._clearSub();
    try {
      if (action.type === "move") await this._moveTurn(action.index);
      else if (action.type === "item") await this._itemTurn(action.id);
      else if (action.type === "switch") await this._switchTurn(action.index);
      else if (action.type === "run") await this._runTurn();

      if (this.battle && !this.battle.over) await this._endOfTurn();
    } finally {
      if (this.battle && !this.battle.over) {
        this.busy = false;
        this.phase = "choose";
        this._renderBattle();
        this._showActions();
      }
    }
  }

  _effSpeed(rt) {
    let spe = rt.stats.spe * stageMult(rt.stages.spe);
    if (rt.status === "par") spe *= 0.5;
    return spe;
  }

  _compareSpeed(p, e, pMove, eMove) {
    const pp = pMove.priority || 0;
    const ep = eMove.priority || 0;
    if (pp !== ep) return pp > ep;
    const ps = this._effSpeed(p);
    const es = this._effSpeed(e);
    if (ps !== es) return ps > es;
    return Math.random() < 0.5;
  }

  _pickEnemyMove(user, target) {
    const usable = [];
    user.moves.forEach((slot, i) => {
      if (slot.pp > 0 && MOVES[slot.id]) usable.push({ slot, i, move: MOVES[slot.id] });
    });
    if (!usable.length) return -1;
    let best = usable[0];
    let bestScore = -1;
    for (const opt of usable) {
      const m = opt.move;
      let score;
      if (m.cat === "status" || !m.power) {
        score = 8 + Math.random() * 10;
      } else {
        const eff = effectiveness(m.type, this._sp(target).types);
        const stab = this._sp(user).types.includes(m.type) ? 1.5 : 1;
        score = m.power * eff * stab * (m.acc / 100) + Math.random() * 14;
      }
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    if (Math.random() < 0.22) return usable[Math.floor(Math.random() * usable.length)].i;
    return best.i;
  }

  async _moveTurn(index) {
    const p = this._active();
    if (!p) return;
    let pSlot = index >= 0 ? p.moves[index] : { id: "struggle", pp: 1, maxPp: 1 };
    if (!pSlot) return;
    if (pSlot.pp <= 0 && index >= 0) pSlot = { id: "struggle", pp: 1, maxPp: 1 };
    const e = this._foe();
    if (!e || e.hp <= 0) return;
    const eIndex = this._pickEnemyMove(e, p);
    const eSlot = eIndex >= 0 ? e.moves[eIndex] : { id: "struggle", pp: 1, maxPp: 1 };
    const pMove = MOVES[pSlot.id] || MOVES.struggle;
    const eMove = MOVES[eSlot.id] || MOVES.struggle;
    const playerFirst = this._compareSpeed(p, e, pMove, eMove);
    const steps = playerFirst
      ? [{ user: p, slot: pSlot, isPlayer: true }, { user: e, slot: eSlot, isPlayer: false }]
      : [{ user: e, slot: eSlot, isPlayer: false }, { user: p, slot: pSlot, isPlayer: true }];

    for (const step of steps) {
      if (!this.battle || this.battle.over) return;
      if (step.user.hp <= 0) continue;
      if (this._foe().hp <= 0) continue;
      const target = step.isPlayer ? this._foe() : this._active();
      if (!target || target.hp <= 0) continue;

      await this._executeMove(step.user, target, step.slot, step.isPlayer);

      if (!this.battle || this.battle.over) return;
      if (this._foe().hp <= 0) {
        await this._onEnemyFaint();
        if (!this.battle || this.battle.over) return;
      }
      if (this._active().hp <= 0) {
        await this._onPlayerFaint();
        if (!this.battle || this.battle.over) return;
      }
    }
  }

  async _executeMove(user, target, slot, isPlayer) {
    if (!this.battle || this.battle.over) return;
    const move = MOVES[slot.id] || MOVES.struggle;
    const userName = this._name(user);

    // 睡眠
    if (user.status === "slp") {
      if (user.statusTurns > 0) user.statusTurns -= 1;
      if (user.statusTurns > 0) {
        await this._say(`${userName} 正在睡觉…`, 620);
        return;
      }
      user.status = null;
      this._renderBattle();
      await this._say(`${userName} 醒来了！`, 560);
      return;
    }
    // 冰冻
    if (user.status === "frz") {
      if (Math.random() < 0.2) {
        user.status = null;
        this._renderBattle();
        await this._say(`${userName} 解冻了！`, 560);
        return;
      }
      await this._say(`${userName} 被冻住了，无法行动！`, 620);
      return;
    }
    // 麻痹
    if (user.status === "par" && Math.random() < 0.25) {
      await this._say(`${userName} 因麻痹而无法行动！`, 620);
      return;
    }

    await this._say(`${userName} 使用了 ${move.name}！`, 560);
    if (!this.cheats.infinite && slot.id !== "struggle") {
      slot.pp = Math.max(0, slot.pp - 1);
    }
    this.sfx.hit(1);
    this._animateAttack(isPlayer);
    await sleep(150);

    // 命中判定
    if (!move.alwaysHit) {
      const acc = (move.acc || 100) * stageMult(user.stages.acc);
      if (Math.random() * 100 >= acc) {
        this._float(target, "MISS", isPlayer ? "enemy" : "player miss", true);
        await this._say("但是没有命中！", 600);
        return;
      }
    }

    // 变化招式
    if (move.cat === "status" || !move.power) {
      await this._applyEffects(user, target, move, isPlayer);
      return;
    }

    const targetSp = this._sp(target);
    const typeMult = effectiveness(move.type, targetSp.types);
    if (typeMult === 0) {
      await this._say(`对 ${targetSp.name} 没有效果…`, 650);
      return;
    }

    const hits = move.hits || 1;
    let total = 0;
    let crit = false;
    for (let i = 0; i < hits; i++) {
      if (!this.battle || this.battle.over || target.hp <= 0) break;
      const result = this._calcDamage(user, target, move);
      let dmg = result.damage;
      if (this.cheats.oneHit && isPlayer) dmg = Math.max(dmg, target.hp);
      target.hp = Math.max(0, target.hp - dmg);
      total += dmg;
      crit = crit || result.crit;
      this._flashSprite(!isPlayer);
      this._float(target, `-${dmg}`, isPlayer ? "enemy" : "player");
      this.sfx.hit(result.mult);
      this._renderBattle();
      await sleep(170);
    }

    if (total <= 0) return;
    let note = "";
    if (crit) note = "击中要害！";
    else if (typeMult > 1) note = "效果拔群！";
    else if (typeMult < 1) note = "效果不太好…";
    await this._say(`${note}${this._name(target)} 受到了 ${total} 点伤害！`, 640);

    // 追加效果
    if (target.hp > 0) await this._applyEffects(user, target, move, isPlayer);

    // 吸取 / 反伤
    if (move.drain && user.hp > 0) {
      const heal = Math.max(1, Math.floor(total * move.drain));
      user.hp = Math.min(user.maxHp, user.hp + heal);
      this.sfx.heal();
      this._renderBattle();
      await this._say(`${userName} 吸取了 ${heal} 点体力！`, 560);
    }
    if (move.recoil && user.hp > 0) {
      const recoil = Math.max(1, Math.floor(total * move.recoil));
      user.hp = Math.max(0, user.hp - recoil);
      this._renderBattle();
      this._float(user, `-${recoil}`, isPlayer ? "player" : "enemy");
      await this._say(`${userName} 受到了 ${recoil} 点反作用力伤害！`, 560);
    }
  }

  _animateAttack(isPlayer) {
    const el = document.getElementById(isPlayer ? "playerSprite" : "enemySprite");
    const cls = isPlayer ? "attack-player" : "attack-enemy";
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 300);
  }

  _flashSprite(isPlayer) {
    const el = document.getElementById(isPlayer ? "playerSprite" : "enemySprite");
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 340);
  }

  _float(target, text, cls, miss = false) {
    const layer = document.getElementById("damageLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "dmg-float " + cls + (miss ? " miss" : "");
    el.textContent = text;
    el.style.right = cls.startsWith("enemy") ? `${18 + Math.random() * 10}%` : "";
    el.style.left = cls.startsWith("player") ? `${16 + Math.random() * 10}%` : "";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  _calcDamage(user, target, move) {
    const physical = move.cat === "phys";
    const atkKey = physical ? "atk" : "spa";
    const defKey = physical ? "def" : "spd";
    const usp = this._sp(user);
    const tsp = this._sp(target);
    const crit = Math.random() < (move.highCrit ? 1 / 8 : 1 / 16);

    let atkStage = clamp(user.stages[atkKey], -6, 6);
    let defStage = clamp(target.stages[defKey], -6, 6);
    if (crit) {
      atkStage = Math.max(0, atkStage);
      defStage = Math.min(0, defStage);
    }
    let atk = user.stats[atkKey] * stageMult(atkStage);
    const def = target.stats[defKey] * stageMult(defStage);
    if (physical && user.status === "brn") atk *= 0.5;

    const stab = usp.types.includes(move.type) ? 1.5 : 1;
    const mult = effectiveness(move.type, tsp.types);
    const level = user.mon.level;
    let dmg = Math.floor(
      Math.floor((Math.floor((2 * level) / 5 + 2) * move.power * atk) / Math.max(1, def)) / 50
    ) + 2;
    dmg = Math.floor(dmg * stab * mult * (0.85 + Math.random() * 0.15));
    if (crit) dmg = Math.floor(dmg * 2);
    return { damage: Math.max(1, dmg), crit, mult, stab };
  }

  async _applyEffects(user, target, move, isPlayer) {
    for (const eff of move.effects || []) {
      if (!this.battle || this.battle.over) return;
      if (eff.chance != null && Math.random() * 100 >= eff.chance) continue;

      if (eff.kind === "status") {
        if (target.hp <= 0) continue;
        const ok = this._canApplyStatus(target, eff.status, move.id);
        if (!ok) {
          if (move.cat === "status") await this._say("但是失败了…", 560);
          continue;
        }
        target.status = eff.status;
        target.statusTurns = eff.status === "slp" ? 1 + Math.floor(Math.random() * 3) : 0;
        this._renderBattle();
        this.sfx.hit(1);
        await this._say(`${this._name(target)} ${this._statusText(eff.status)}！`, 620);
      } else if (eff.kind === "stat") {
        const who = eff.target === "self" ? user : target;
        if (who.hp <= 0) continue;
        const before = who.stages[eff.stat] || 0;
        const after = clamp(before + eff.stages, -6, 6);
        if (after === before) {
          await this._say(`${this._name(who)} 的${STAT_NAMES[eff.stat]}已经无法再${eff.stages > 0 ? "提升" : "下降"}了！`, 600);
          continue;
        }
        who.stages[eff.stat] = after;
        this._renderBattle();
        await this._say(`${this._name(who)} 的${STAT_NAMES[eff.stat]}${eff.stages > 0 ? "提升了" : "下降了"}！`, 580);
      } else if (eff.kind === "heal") {
        if (user.hp >= user.maxHp) {
          await this._say("HP 已经满了…", 540);
          continue;
        }
        const amount = Math.max(1, Math.floor(user.maxHp * eff.ratio));
        user.hp = Math.min(user.maxHp, user.hp + amount);
        this.sfx.heal();
        this._renderBattle();
        this._float(user, `+${amount}`, isPlayer ? "player heal" : "enemy heal");
        await this._say(`${this._name(user)} 恢复了 ${amount} 点体力！`, 580);
      }
    }
  }

  _statusText(status) {
    return { psn: "中毒了", brn: "被灼伤了", par: "麻痹了", slp: "睡着了", frz: "被冰冻了" }[status] || "陷入异常状态";
  }

  _canApplyStatus(target, status, moveId) {
    if (target.status) return false;
    const types = this._sp(target).types;
    if (status === "brn" && types.includes("fire")) return false;
    if (status === "frz" && types.includes("ice")) return false;
    if (status === "par" && types.includes("electric")) return false;
    if (status === "psn" && (types.includes("poison") || types.includes("steel"))) return false;
    if (moveId === "thunderWave" && types.includes("ground")) return false;
    return true;
  }

  async _endOfTurn() {
    if (!this.battle || this.battle.over) return;
    const list = [
      { rt: this._active(), isPlayer: true },
      { rt: this._foe(), isPlayer: false },
    ];
    for (const { rt, isPlayer } of list) {
      if (!this.battle || this.battle.over) return;
      if (!rt || rt.hp <= 0) continue;
      if (rt.status !== "psn" && rt.status !== "brn") continue;
      const dmg = Math.max(1, Math.floor(rt.maxHp / (rt.status === "psn" ? 8 : 16)));
      rt.hp = Math.max(0, rt.hp - dmg);
      this._renderBattle();
      this._float(rt, `-${dmg}`, isPlayer ? "player heal" : "enemy heal");
      await this._say(`${this._name(rt)} 受到了${rt.status === "psn" ? "毒素" : "灼伤"}伤害！`, 600);
      if (rt.hp <= 0) {
        if (isPlayer) await this._onPlayerFaint();
        else await this._onEnemyFaint();
        if (!this.battle || this.battle.over) return;
      }
    }
  }

  // ------------------------------------------------------------ 道具 / 换人 / 逃跑
  async _itemTurn(id) {
    const item = ITEMS[id];
    if (!item) return;
    const count = Number((this.p.items || {})[id]) || 0;
    if (!this.cheats.infinite && count <= 0) {
      await this._say(`没有${item.name}了…`, 600);
      return;
    }

    if (item.kind === "heal") {
      const p = this._active();
      if (!p || p.hp <= 0) return;
      if (p.hp >= p.maxHp) {
        await this._say("HP 已经满了，不需要使用伤药。", 620);
        return;
      }
      if (!this.cheats.infinite) this._consumeItem(id);
      const heal = Math.min(item.heal, p.maxHp - p.hp);
      p.hp += heal;
      this.sfx.heal();
      this._renderBattle();
      this._float(p, `+${heal}`, "player heal");
      await this._say(`使用了 ${item.name}，${this._name(p)} 恢复了 ${heal} 点 HP！`, 680);
      await this._enemyAttackTurn();
      return;
    }

    // 精灵球
    if (!this.battle.wild) {
      await this._say("训练家的宝可梦不能捕捉！", 620);
      return;
    }
    if (!this.cheats.infinite) this._consumeItem(id);
    await this._say(`扔出了 ${item.name}！`, 520);
    const target = this._foe();
    const result = catchChance(target, item.mult, this.cheats.catch);
    await this._playCatchAnim(result);
    if (result.caught) {
      await this._onCaught();
    } else {
      await this._say(`可惜！${this._name(target)} 挣脱了精灵球！`, 680);
      await this._enemyAttackTurn();
    }
  }

  _consumeItem(id) {
    const p = this.p;
    p.items = p.items || {};
    p.items[id] = Math.max(0, (Number(p.items[id]) || 0) - 1);
    this.store.update(() => {});
    this._renderBattle();
  }

  async _playCatchAnim(result) {
    const layer = document.getElementById("damageLayer");
    const ball = document.createElement("div");
    ball.className = "catch-ball";
    layer.appendChild(ball);
    this.sfx.ball();
    await sleep(820);
    const shakes = Math.min(4, result.shakes);
    for (let i = 0; i < shakes; i++) {
      ball.classList.add("shake");
      this.sfx.ball();
      await sleep(500);
      ball.classList.remove("shake");
      await sleep(120);
    }
    if (result.caught) {
      ball.classList.add("caught");
      this.sfx.catch();
      await sleep(650);
    } else {
      ball.style.opacity = "0";
      await sleep(220);
    }
    ball.remove();
  }

  async _onCaught() {
    const target = this._foe();
    if (!target) return;
    const sp = this._sp(target);
    const mon = target.mon;
    let dest = "队伍";
    this.store.update((p) => {
      p.caught = p.caught || {};
      p.caught[mon.species] = true;
      p.team = p.team || [];
      p.box = p.box || [];
      if (p.team.length < 3) {
        p.team.push(mon);
        dest = "队伍";
      } else {
        p.box.push(mon);
        dest = "电脑";
      }
    });
    this.battle.caught = { species: mon.species, dest };
    this.sfx.catch();
    await this._say(`太好了！成功捕获了 ${sp.name}！`, 800);
    await this._say(`${sp.name} 加入了${dest}。`, 650);
    await this._winBattle(true);
  }

  async _switchTurn(index) {
    const team = this.battle.team;
    const next = team[index];
    if (!next || next.hp <= 0 || index === this.battle.active) return;
    const old = this._active();
    this.sfx.click();
    this.battle.active = index;
    document.getElementById("playerSprite").classList.remove("faint");
    this._renderBattle();
    await this._say(`回来吧，${this._name(old)}！去吧，${this._name(next)}！`, 700);
    await this._enemyAttackTurn();
  }

  async _enemyAttackTurn() {
    if (!this.battle || this.battle.over) return;
    const e = this._foe();
    const p = this._active();
    if (!e || e.hp <= 0 || !p || p.hp <= 0) return;
    const idx = this._pickEnemyMove(e, p);
    const slot = idx >= 0 ? e.moves[idx] : { id: "struggle", pp: 1, maxPp: 1 };
    await this._executeMove(e, p, slot, false);
    if (!this.battle || this.battle.over) return;
    if (this._foe().hp <= 0) {
      await this._onEnemyFaint();
      if (!this.battle || this.battle.over) return;
    }
    if (this._active().hp <= 0) await this._onPlayerFaint();
  }

  async _runTurn() {
    if (!this.battle.wild) {
      await this._say("训练家对战中无法逃跑，只能认输了…", 750);
      await this._loseBattle();
      return;
    }
    const p = this._active();
    const e = this._foe();
    const chance = clamp(0.45 + (this._effSpeed(p) - this._effSpeed(e)) / 160, 0.2, 0.95);
    if (Math.random() < chance) {
      this.battle.over = true;
      this.phase = "over";
      await this._say("成功逃走了！", 600);
      this._openLevelScreen();
      toast("已离开战斗", "", 1600);
    } else {
      await this._say("没能逃走！", 600);
      await this._enemyAttackTurn();
    }
  }

  // ------------------------------------------------------------ 倒下 / 经验 / 结算
  async _onEnemyFaint() {
    const e = this._foe();
    if (!e || e.hp > 0 || !this.battle || this.battle.over) return;
    document.getElementById("enemySprite").classList.add("faint");
    this.sfx.faint();
    await this._say(`${this._name(e)} 倒下了！`, 680);
    await this._awardExp(e);
    if (!this.battle || this.battle.over) return;

    if (this.battle.enemyIndex < this.battle.enemies.length - 1) {
      this.battle.enemyIndex += 1;
      document.getElementById("enemySprite").classList.remove("faint");
      this._renderBattle();
      this.sfx.encounter();
      await this._say(`${this.battle.trainer ? `${this.battle.trainer} 派出了 ${this._name(this._foe())}` : `又出现了 ${this._name(this._foe())}`}！`, 700);
    } else {
      await this._winBattle(false);
    }
  }

  async _awardExp(fainted) {
    const active = this._active();
    if (!active || active.hp <= 0) return;
    const base = this._sp(fainted).baseExp;
    const gain = Math.max(1, Math.floor((base * fainted.mon.level) / 4) * (this.battle.wild ? 1 : 1.5));
    const beforeSpecies = active.mon.species;
    const events = grantExp(active.mon, gain);
    this._syncRuntimeMoves(active);
    this._refreshRuntime(active);
    this._renderBattle();
    await this._say(`${SPECIES[beforeSpecies].name} 获得了 ${gain} 点经验！`, 620);
    await this._announceLevelEvents(active, events);

    // 队伍其他成员获得一半经验
    const others = this.battle.team.filter((rt) => rt !== active && rt.hp > 0);
    if (!others.length) return;
    const half = Math.max(1, Math.floor(gain / 2));
    for (const rt of others) {
      const ev = grantExp(rt.mon, half);
      this._syncRuntimeMoves(rt);
      this._refreshRuntime(rt);
      if (ev.evolvedTo) {
        const oldName = SPECIES[ev.evolvedFrom].name;
        this.sfx.level();
        await this._say(`队伍中的 ${oldName} 进化成了 ${this._name(rt)}！`, 850);
      }
    }
    this._renderBattle();
  }

  async _announceLevelEvents(rt, events) {
    const oldName = events.evolvedFrom ? SPECIES[events.evolvedFrom].name : this._name(rt);
    const evoLevel = events.evolvedFrom
      ? (SPECIES[events.evolvedFrom].evolve ? SPECIES[events.evolvedFrom].evolve.level : Infinity)
      : Infinity;
    for (const lv of events.levels) {
      this._refreshRuntime(rt);
      this.sfx.level();
      await this._say(`${lv <= evoLevel ? oldName : this._name(rt)} 升到了 Lv.${lv}！`, 620);
    }
    if (events.evolvedTo) {
      this._refreshRuntime(rt);
      this._renderBattle();
      this.sfx.level();
      await this._say(`什么！${oldName} 进化成了 ${this._name(rt)}！`, 950);
    }
    for (const id of events.learned) {
      await this._say(`${this._name(rt)} 学会了 ${MOVES[id].name}！`, 620);
    }
  }

  _forceSwitch() {
    return new Promise((resolve) => {
      this.pendingSwitch = { resolve };
      this._showTeamMenu(true);
      this._say("派谁上场？", 350);
    });
  }

  async _onPlayerFaint() {
    const p = this._active();
    if (!p || p.hp > 0 || !this.battle || this.battle.over) return;
    document.getElementById("playerSprite").classList.add("faint");
    this.sfx.faint();
    await this._say(`${this._name(p)} 倒下了！`, 680);
    if (!this.battle) return;
    this.battle.faints += 1;
    if (this.battle.team.some((rt) => rt.hp > 0)) {
      await this._forceSwitch();
    } else {
      await this._loseBattle();
    }
  }

  async _winBattle(byCatch) {
    if (!this.battle || this.battle.over) return;
    const b = this.battle;
    b.over = true;
    this.busy = true;
    this.phase = "over";
    const stars = b.faints === 0 ? 3 : b.faints === 1 ? 2 : 1;
    const money = Number(b.level.reward) || 0;
    b.stars = stars;
    b.money = money;
    this.store.update((p) => {
      p.money = (Number(p.money) || 0) + money;
      p.stars = p.stars || {};
      p.stars[b.level.id] = Math.max(Number(p.stars[b.level.id]) || 0, stars);
      p.cleared = p.cleared || {};
      p.cleared[b.level.id] = true;
      p.unlocked = Math.max(Number(p.unlocked) || 1, Math.min(TOTAL_LEVELS, b.level.id + 1));
      p.items = p.items || {};
      for (const [id, n] of Object.entries(b.level.items || {})) {
        p.items[id] = (Number(p.items[id]) || 0) + n;
      }
    });
    this.sfx.win();
    await this._say(byCatch ? "捕获成功！" : "战斗胜利！", 650);
    this._showResult(true);
  }

  async _loseBattle() {
    if (!this.battle || this.battle.over) return;
    this.battle.over = true;
    this.busy = true;
    this.phase = "over";
    this.battle.stars = 0;
    this.sfx.lose();
    await this._say("眼前一黑……", 750);
    this._showResult(false);
  }

  _showResult(win) {
    const b = this.battle;
    if (!b) return;
    const level = b.level;
    const stars = b.stars || 0;
    const $ = (id) => document.getElementById(id);
    $("resultStars").style.display = "flex";
    $("resultStars").querySelectorAll(".rstar").forEach((el, i) => {
      el.classList.toggle("lit", i < stars);
      el.style.transitionDelay = `${i * 0.12}s`;
    });
    $("resultTitle").textContent = win ? (b.caught ? "捕获成功！" : "战斗胜利！") : "战斗失败…";
    $("resultTitle").style.color = win ? "#2f7a4a" : "#a33a2c";
    $("resultSub").textContent = `第 ${level.id} 关 · ${level.name}`;
    const caught = b.caught;
    $("resultCaught").innerHTML = caught
      ? `<span class="caught-mon">${monsterSVG(caught.species)}</span><span class="caught-text"><b>${SPECIES[caught.species].name} 已捕获</b><span>加入了${caught.dest} · 已登记图鉴</span></span>`
      : "";
    $("statMoney").textContent = String(win ? (b.money || 0) : 0);
    $("statFaints").textContent = String(b.faints);
    $("statCaught").textContent = String(Object.keys(this.p.caught || {}).length);
    $("resultNote").textContent = win
      ? stars === 3 ? "三星达成：全队无人倒下，完美的一战！" : "关卡进度与宝可梦成长已保存。"
      : "调整队伍与属性克制，再来挑战一次吧。";
    const next = $("nextBtn");
    if (win) {
      next.style.display = "";
      if (level.id < TOTAL_LEVELS) {
        this.resultNextId = level.id + 1;
        next.textContent = "下一关";
      } else {
        this.resultNextId = level.id;
        next.textContent = "再战冠军";
      }
    } else {
      next.style.display = "none";
    }
    $("resultScreen").classList.add("show");
  }

  // ------------------------------------------------------------ 暂停
  _openPause() {
    if (!this.battle || this.battle.over) return;
    if (this.phase !== "choose" || this.busy) {
      toast("等这一回合结束再暂停", "", 1400);
      return;
    }
    this.pauseOpen = true;
    this.phase = "pause";
    document.getElementById("pauseSoundBtn").textContent = this.soundOn ? "关闭音效" : "开启音效";
    document.getElementById("pauseScreen").classList.add("show");
  }

  _closePause() {
    document.getElementById("pauseScreen").classList.remove("show");
    if (this.pauseOpen) {
      this.pauseOpen = false;
      if (this.battle && !this.battle.over) {
        this.phase = "choose";
        this._showActions();
      }
    }
  }

  _toggleSound() {
    this.soundOn = !this.soundOn;
    this.sfx.enabled = this.soundOn;
    this.store.update((p) => { p.sound = this.soundOn; });
    document.getElementById("pauseSoundBtn").textContent = this.soundOn ? "关闭音效" : "开启音效";
    if (this.soundOn) { this.sfx.ensure(); this.sfx.click(); }
  }

  // ------------------------------------------------------------ 金手指
  _openCheat() {
    if (this.cheatOpen) return;
    if (this.battle && !this.battle.over) {
      if (this.phase !== "choose" || this.busy) {
        toast("等这一回合结束再打开金手指", "", 1400);
        return;
      }
      this.phase = "cheat";
    }
    this.cheatOpen = true;
    this._updateCheatText();
    document.getElementById("cheatScreen").classList.add("show");
  }

  _closeCheat() {
    document.getElementById("cheatScreen").classList.remove("show");
    if (!this.cheatOpen) return;
    this.cheatOpen = false;
    if (this.battle && !this.battle.over && this.phase === "cheat") {
      this.phase = "choose";
      this._showActions();
    }
  }

  _updateCheatText() {
    const one = document.getElementById("cheatOneHitText");
    const cat = document.getElementById("cheatCatchText");
    const inf = document.getElementById("cheatInfiniteText");
    if (one) one.textContent = `一击必杀：${this.cheats.oneHit ? "开" : "关"}`;
    if (cat) cat.textContent = `捕捉必中：${this.cheats.catch ? "开" : "关"}`;
    if (inf) inf.textContent = `无限 PP / 道具：${this.cheats.infinite ? "开" : "关"}`;
  }

  _levelUpMon(mon, levels) {
    for (let i = 0; i < levels; i++) {
      if (mon.level >= 100) break;
      const growth = SPECIES[mon.species].growth;
      const need = expForLevel(mon.level + 1, growth) - mon.exp;
      grantExp(mon, need + 1);
    }
  }

  _handleCheat(action) {
    if (action === "close") { this._closeCheat(); return; }
    if (action === "heal") {
      if (!this.battle || this.battle.over) {
        toast("战斗中才能恢复 HP", "", 1600);
      } else {
        for (const rt of this.battle.team) {
          rt.hp = rt.maxHp;
          rt.status = null;
          rt.statusTurns = 0;
          rt.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0 };
        }
        this._renderBattle();
        toast("全队 HP 已回满，异常状态已解除", "ok");
      }
    } else if (action === "level") {
      if (this.battle && !this.battle.over) {
        for (const rt of this.battle.team) {
          this._levelUpMon(rt.mon, 5);
          this._syncRuntimeMoves(rt);
          this._refreshRuntime(rt);
        }
        this._renderBattle();
      } else {
        for (const mon of this.p.team || []) this._levelUpMon(mon, 5);
      }
      this.store.update(() => {});
      this._refreshLevelScreen();
      this.sfx.level();
      toast("全队等级 +5", "ok");
    } else if (action === "masterball") {
      this.store.update((p) => {
        p.items = p.items || {};
        p.items.masterBall = (Number(p.items.masterBall) || 0) + 99;
      });
      toast("大师球 ×99 已放入背包", "ok");
    } else if (action === "money") {
      this.store.update((p) => { p.money = (Number(p.money) || 0) + 9999; });
      this.sfx.heal();
      toast("金币 +9999", "ok");
    } else if (action === "oneHit") {
      this.cheats.oneHit = !this.cheats.oneHit;
      toast(`一击必杀：${this.cheats.oneHit ? "开" : "关"}`, "ok");
    } else if (action === "catch") {
      this.cheats.catch = !this.cheats.catch;
      toast(`捕捉必中：${this.cheats.catch ? "开" : "关"}`, "ok");
    } else if (action === "infinite") {
      this.cheats.infinite = !this.cheats.infinite;
      toast(`无限 PP / 道具：${this.cheats.infinite ? "开" : "关"}`, "ok");
    } else if (action === "unlock") {
      this.store.update((p) => { p.unlocked = TOTAL_LEVELS; p.tutorialSeen = true; });
      this._refreshLevelScreen();
      toast("已解锁全部关卡", "ok");
    } else if (action === "dex") {
      this.store.update((p) => {
        p.caught = p.caught || {};
        SPECIES_ORDER.forEach((id) => { p.caught[id] = true; });
      });
      this._refreshLevelScreen();
      if (document.getElementById("teamScreen").classList.contains("show")) this._renderTeamScreen();
      toast(`已登记全部 ${SPECIES_COUNT} 种宝可梦`, "ok");
    } else if (action === "win") {
      if (this.battle && !this.battle.over) {
        this._closeCheat();
        for (const e of this.battle.enemies) e.hp = 0;
        this._winBattle(false);
      } else {
        toast("当前不在战斗中", "", 1600);
      }
    }
    this._updateCheatText();
  }
}

function boot() {
  window.__pokemon = new PokemonGame();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
