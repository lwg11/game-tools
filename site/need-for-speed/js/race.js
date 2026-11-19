/**
 * 比赛管理（M3）：竞速 / 漂移积分 / 淘汰圈 / 警匪追逐。
 * 状态机：countdown → running → finished（结果通过 onFinish 回调交给 UI）。
 */
import { AICar } from "./ai.js";

export const RACE_MODES = [
  { id: "race", name: "海滨环线", desc: "3 圈 · 4 车竞速" },
  { id: "drift", name: "漂移积分", desc: "60s · 分数制" },
  { id: "elim", name: "淘汰圈", desc: "每 20s 末位淘汰" },
  { id: "cop", name: "警匪追逐", desc: "2 圈 · 警车拦截" },
];
export const DIFFS = [
  { id: 0, name: "业余" },
  { id: 1, name: "职业" },
  { id: 2, name: "车神" },
];

export class RaceManager {
  constructor() {
    this.state = "idle";
    this.mode = null;
    this.diff = 0;
    this.cars = [];
    this.cops = [];
    this.results = null;
    this.coinsEarned = 0;
    this.onFinish = null;
  }

  get raceLength() {
    return this._raceLength || 0;
  }

  /** 开始比赛 */
  start(modeId, diffId, { track, scene, car, onFinish }) {
    this.stop();
    this.mode = modeId;
    this.diff = diffId;
    this.scene = scene;
    this.track = track;
    this.state = "countdown";
    this.countdown = 3.2;
    this.time = 0;
    this.timeLeft = modeId === "drift" ? 60 : 0;
    this.elimEvery = 20;
    this.elimTimer = 20;
    this.eliminated = 0;
    this.laps = modeId === "cop" ? 2 : 3;
    this._raceLength = this.laps * track.length;
    this.onFinish = onFinish || null;
    this.results = null;

    const T = track.length;
    const aiSpeeds = [30, 35, 40][diffId] || 34;

    if (modeId === "cop") {
      for (let i = 0; i < 2; i++) {
        const cop = new AICar(scene, track, {
          name: "警车",
          isCop: true,
          speed: aiSpeeds + 1 + i * 1.5,
          lane: 0,
          copOffset: { x: i ? 3 : -3, z: 5 },
        });
        cop.setGrid(-5 - i * 3, i ? 3 : -3);
        this.cops.push(cop);
      }
    } else {
      const names = ["阿凯", "Luna", "Viper"];
      const colors = [0xde0000, 0x00b4d8, 0xffb703];
      for (let i = 0; i < 3; i++) {
        const ai = new AICar(scene, track, {
          name: names[i],
          color: colors[i],
          speed: aiSpeeds + i * 0.8,
          lane: (i - 1) * 2.4,
          startS: -7 - i * 7,
        });
        ai.setGrid(-7 - i * 7, (i - 1) * 2.4);
        this.cars.push(ai);
      }
    }
  }

  /** 每帧调用；ctx: {playerProg, playerLap, playerX, playerZ, playerHp, driftScore, onCopHit, dt} */
  update(dt, ctx) {
    if (this.state === "countdown") {
      this.countdown -= dt;
      if (this.countdown > 0) return;
      this.state = "running";
    }
    if (this.state !== "running") return;
    this.time += dt;

    if (this.mode === "cop") {
      for (const cop of this.cops) {
        const vx = ctx.playerVx || 0, vz = ctx.playerVz || 0;
        const sp = Math.hypot(vx, vz) || 1;
        const lead = Math.min(4, sp * 0.28 + 1.2);
        cop.updateCop(dt, ctx.playerX + (vx / sp) * lead, ctx.playerZ + (vz / sp) * lead, true);
        const d = Math.hypot(ctx.playerX - cop.x, ctx.playerZ - cop.z);
        if (d < 2.7 && ctx.playerHp > 0) {
          ctx.onCopHit && ctx.onCopHit(cop, d);
        }
      }
      if (ctx.playerHp <= 0) {
        this._finish({ win: false, eliminated: false });
        return;
      }
      if (ctx.playerLap >= this.laps) this._finish({ win: true, eliminated: false });
      return;
    }

    for (const ai of this.cars) {
      if (ai.eliminated) continue;
      ai.update(dt, ctx.playerProg, this._raceLength);
    }

    if (this.mode === "drift") {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this._finish({ win: ctx.driftScore > 0, eliminated: false });
      return;
    }

    if (this.mode === "elim") {
      this.elimTimer -= dt;
      if (this.elimTimer <= 0) {
        this.elimTimer = this.elimEvery;
        this.eliminated += 1;
        const ranking = this._rankingEntries(ctx.playerProg);
        const alive = ranking.filter((r) => r.alive && !r.isPlayer);
        const playerLast = ranking.length > 1 && ranking[ranking.length - 1].isPlayer;
        if (playerLast) {
          this._finish({ win: false, eliminated: true });
          return;
        }
        if (alive.length) {
          const last = alive[alive.length - 1];
          last.ref.eliminated = true;
          if (last.ref.model) last.ref.model.visible = false;
        }
      }
      if (ctx.playerLap >= this.laps) this._finish({ win: true, eliminated: false });
      return;
    }

    if (ctx.playerLap >= this.laps) this._finish({ win: true, eliminated: false });
  }

  _rankingEntries(playerProg) {
    const entries = [{ name: "你", isPlayer: true, progress: playerProg, alive: this.state === "running" }];
    for (const ai of this.cars) {
      if (ai.eliminated) continue;
      entries.push({ name: ai.name, progress: ai.startS + ai.progress, alive: true, ref: ai });
    }
    entries.sort((a, b) => b.progress - a.progress);
    return entries;
  }

  /** 玩家名次（1 起） */
  playerRank(playerProg) {
    let rank = 1;
    for (const ai of this.cars) {
      if (ai.eliminated) continue;
      if (ai.startS + ai.progress > playerProg) rank++;
    }
    return rank;
  }

  _finish({ win, eliminated }) {
    if (this.state !== "running") return;
    let coins = 0;
    const lines = [];
    let title = "比赛结束";

    if (this.mode === "race") {
      const rank = this.playerRank(this._lastPlayerProg || 0);
      coins = [150, 100, 60, 30][rank - 1] ?? 20;
      title = rank === 1 ? "🏆 冠军！" : `第 ${rank} 名`;
      lines.push(`名次：P${rank} / 4`);
      lines.push(`用时：${this.time.toFixed(1)}s`);
    } else if (this.mode === "drift") {
      coins = Math.max(20, Math.round((this._lastDrift || 0) / 10));
      title = win ? "🏁 时间到" : "🏁 时间到";
      lines.push(`漂移分：${Math.round(this._lastDrift || 0)}`);
      lines.push(`奖励：${coins} 金币`);
    } else if (this.mode === "elim") {
      const rank = this.playerRank(this._lastPlayerProg || 0);
      coins = win ? 120 : 20;
      title = win ? "🏆 最后的幸存者" : "💥 被淘汰";
      lines.push(`名次：P${rank}`);
      lines.push(`淘汰数：${this.eliminated}`);
    } else if (this.mode === "cop") {
      coins = win ? 200 : 40;
      title = win ? "🏆 逃脱成功" : "🚔 被截停";
      lines.push(`剩余耐久：${Math.max(0, Math.round(this._lastHp || 0))}`);
      lines.push(`奖励：${coins} 金币`);
    }
    this.results = { mode: this.mode, win, eliminated, title, lines, coins };
    this.state = "finished";
    this.onFinish && this.onFinish(this.results);
  }

  setCtxInfo({ playerProg, driftScore, hp }) {
    this._lastPlayerProg = playerProg;
    this._lastDrift = driftScore;
    if (hp !== undefined) this._lastHp = hp;
  }

  stop() {
    for (const ai of this.cars) ai.dispose();
    for (const cop of this.cops) cop.dispose();
    this.cars = [];
    this.cops = [];
    this.state = "idle";
    this.results = null;
    this.coinsEarned = 0;
  }
}
