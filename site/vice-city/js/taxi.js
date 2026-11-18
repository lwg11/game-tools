/**
 * 罪恶都市 · 出租车支线
 * ------------------------------------------------------------
 * 进入出租车靠边停稳 0.6s → 自动上客 → 限时送达随机目的地 → 计程车费。
 * 车费 80 + 距离×1.1（$/10 取整）；送达次数写入 store.taxiDone。
 * headless：不创建 DOM，逻辑照跑（fled 到 floater/toast 均带 headless 守卫）。
 */
export class TaxiSystem {
  constructor(game) {
    this.game = game;
    this.state = "idle"; // idle | delivering
    this.dest = null;    // {x, z}
    this.timer = 0;
    this.fare = 0;
    this._pickupT = 0;
    this.el = null;
    this._buildHud();
  }

  _buildHud() {
    if (this.game.headless) return;
    const host = document.getElementById("vc-hud");
    if (!host) return;
    const el = document.createElement("div");
    el.id = "vc-taxi-line";
    el.style.cssText = [
      "position:absolute;left:50%;top:24%;transform:translateX(-50%);z-index:30",
      "padding:6px 14px;border-radius:10px;background:rgba(0,0,0,.55)",
      "border:1px solid var(--neon-yellow);color:#ffe27a",
      "font:700 15px/1.4 sans-serif;white-space:nowrap;display:none",
      "pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.8)",
    ].join(";");
    host.appendChild(el);
    this.el = el;
  }

  _setHud(text) {
    if (!this.el) return;
    if (!text) {
      this.el.style.display = "none";
      return;
    }
    this.el.style.display = "block";
    this.el.textContent = text;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const v = p.inVehicle ? p.vehicle : null;
    const isTaxi = !!(v && v.def && v.def.taxi);

    if (this.state === "idle") {
      if (!isTaxi) {
        this._pickupT = 0;
        this._setHud(null);
        return;
      }
      if (Math.abs(v.kmh) < 3) {
        this._pickupT += dt;
        if (this._pickupT >= 0.6) {
          this._startFare();
        } else {
          this._setHud("🚕 靠边停稳即可接客…");
        }
        return;
      }
      this._pickupT = 0;
      this._setHud(null);
      return;
    }

    // delivering
    if (!isTaxi) {
      this._cancel("乘客离开了");
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this._cancel("乘客等得不耐烦了");
      return;
    }
    const d = Math.hypot(p.pos.x - this.dest.x, p.pos.z - this.dest.z);
    if (d < 10) {
      this._complete();
      return;
    }
    const zone = g.world.zoneAt(this.dest.x, this.dest.z);
    this._setHud(`🚕 ${zone} · 剩余 ${Math.ceil(this.timer)}s · 车费 $${this.fare}`);
  }

  _startFare() {
    const g = this.game;
    const p = g.player;
    const pts = g.world.pedPoints || [];
    let best = null;
    let bestD = 0;
    for (let i = 0; i < 12; i++) {
      const idx = Math.floor(Math.random() * pts.length);
      const pt = pts[idx];
      if (!pt) break;
      const d = Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z);
      if (d > bestD) {
        bestD = d;
        best = pt;
      }
    }
    // 12 次采样没找到足够远的点：留给下次靠边
    if (!best || bestD < 150) {
      this._pickupT = 0;
      this._setHud(null);
      return;
    }
    this.dest = best;
    this.fare = Math.round((80 + bestD * 1.1) / 10) * 10;
    this.timer = 90 + bestD * 0.25;
    this.state = "delivering";
    if (!g.headless) {
      g.showToast(`乘客上车：去 ${g.world.zoneAt(best.x, best.z)}（约 ${Math.round(bestD)}m）`);
      if (g.sfx && g.sfx.playUi) g.sfx.playUi();
    }
    this._setHud("");
  }

  _complete() {
    const g = this.game;
    const p = g.player;
    p.money += this.fare;
    if (!g.headless) {
      g.floater(`+$${this.fare}`, "good");
      g.showToast(`送达！车费 $${this.fare}`);
    }
    if (g.sfx && g.sfx.playPickup) g.sfx.playPickup();
    if (g.store) {
      g.store.update((s) => {
        s.taxiDone = (s.taxiDone || 0) + 1;
        s.money = Math.max(s.money || 0, p.money);
      });
    }
    this.state = "idle";
    this.dest = null;
    this._pickupT = 0;
    this._setHud(null);
  }

  _cancel(reason) {
    const g = this.game;
    this.state = "idle";
    this.dest = null;
    this._pickupT = 0;
    this._setHud(null);
    if (!g.headless) g.showToast(`出租任务取消：${reason}`);
  }

  dispose() {
    this._setHud(null);
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
  }
}
