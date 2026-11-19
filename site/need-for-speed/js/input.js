/**
 * 键鼠输入（原型期）。返回归一化驾驶输入；后续扩展触屏。
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this._prev = new Set();
  }

  attach(target = window) {
    this._on = (e, down) => {
      const k = e.code;
      const used = [
        "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Space", "ShiftLeft", "ShiftRight", "KeyN", "Escape",
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
    const throttle = (k.has("KeyW") || k.has("ArrowUp")) ? 1 : 0;
    const brake = (k.has("KeyS") || k.has("ArrowDown")) ? 1 : 0;
    const left = (k.has("KeyA") || k.has("ArrowLeft")) ? 1 : 0;
    const right = (k.has("KeyD") || k.has("ArrowRight")) ? 1 : 0;
    return {
      throttle,
      brake,
      steer: right - left, // 右为正 = 车头向 +X 偏（与 sim.angle 增加方向一致）
      handbrake: k.has("Space"),
      nitro: k.has("ShiftLeft") || k.has("ShiftRight") || k.has("KeyN"),
    };
  }

  isDown(code) { return this.keys.has(code); }
}
