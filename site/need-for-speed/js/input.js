/**
 * 键鼠 + 触屏输入。返回归一化驾驶输入。
 * 触摸控件（TouchControls）可选注入，与键盘事件合并。
 */
export class Input {
  constructor(touch = null) {
    this.keys = new Set();
    this.touch = touch;
  }

  attach(target = window) {
    this._on = (e, down) => {
      const k = e.code;
      const used = [
        "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Space", "ShiftLeft", "ShiftRight", "KeyN", "KeyF", "KeyR", "KeyJ", "Escape",
      ];
      if (used.includes(k)) {
        if (down) this.keys.add(k); else this.keys.delete(k);
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
      }
    };
    target.addEventListener("keydown", (e) => this._on(e, true));
    target.addEventListener("keyup", (e) => this._on(e, false));
  }

  sample() {
    const k = this.keys;
    const t = this.touch ? this.touch.state : null;
    const throttle = ((k.has("KeyW") || k.has("ArrowUp")) ? 1 : 0) || (t && t.throttle ? 1 : 0);
    const brake = ((k.has("KeyS") || k.has("ArrowDown")) ? 1 : 0) || (t && t.brake ? 1 : 0);
    let steer = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    if (t && Math.abs(t.steer) > 0.001) {
      steer = Math.abs(steer) >= 1 ? steer + t.steer * 0.5 : t.steer;
    }
    steer = Math.max(-1, Math.min(1, steer));
    const handbrake = k.has("Space") || (t ? t.handbrake : false);
    const nitro = k.has("ShiftLeft") || k.has("ShiftRight") || k.has("KeyN") || (t ? t.nitro : false);
    const cannon = k.has("KeyF") || k.has("KeyJ") || (t ? t.cannon : false);
    const rocket = k.has("KeyR") || (t ? t.rocket : false);
    return { throttle, brake, steer, handbrake, nitro, cannon, rocket };
  }

  isDown(code) { return this.keys.has(code); }
}
