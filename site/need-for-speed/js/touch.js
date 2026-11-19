/**
 * 触屏驾驶控件（移动端优先）
 * 左：横向滑动转向（模拟量）；右：油门/刹车/漂移/氮气按钮。
 * 仅在触摸设备上显示；与键盘输入合并。
 */
export class TouchControls {
  /**
   * @param {HTMLElement} parent 挂载容器
   */
  constructor(parent) {
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.root = document.createElement("div");
    this.root.className = "tc-layer";
    this.root.innerHTML = `
      <div class="tc-steer" aria-label="转向">
        <div class="tc-steer-base"><div class="tc-knob"></div></div>
        <span class="tc-cap">转向</span>
      </div>
      <div class="tc-cluster">
        <div class="tc-row">
          <button class="tc-btn tc-drift" type="button">漂移</button>
          <button class="tc-btn tc-nitro" type="button">氮气</button>
        </div>
        <div class="tc-row">
          <button class="tc-btn tc-brake" type="button">刹车</button>
          <button class="tc-btn tc-gas" type="button">油门</button>
        </div>
      </div>`;
    parent.appendChild(this.root);

    // ---------------- 转向区：按下后横向滑动 = 模拟量
    const steer = this.root.querySelector(".tc-steer");
    const knob = this.root.querySelector(".tc-knob");
    this._steerId = null;
    this._steerX0 = 0;

    steer.addEventListener("pointerdown", (e) => {
      this._steerId = e.pointerId;
      this._steerX0 = e.clientX - this.state.steer * 55;
      try { steer.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件或旧浏览器 */ }
      e.preventDefault();
    });
    steer.addEventListener("pointermove", (e) => {
      if (this._steerId !== e.pointerId) return;
      const raw = (e.clientX - this._steerX0) / 55;
      const dead = Math.abs(raw) < 0.12 ? 0 : raw;
      this.state.steer = Math.max(-1, Math.min(1, dead));
      knob.style.transform = `translateX(${this.state.steer * 42}px)`;
    });
    const endSteer = (e) => {
      if (this._steerId !== e.pointerId) return;
      this._steerId = null;
      this.state.steer = 0;
      knob.style.transform = "translateX(0)";
    };
    steer.addEventListener("pointerup", endSteer);
    steer.addEventListener("pointercancel", endSteer);

    // ---------------- 按钮：按住生效
    const bindBtn = (cls, on, off) => {
      const el = this.root.querySelector(cls);
      const set = (v) => {
        if (v === off()) return;
        el.classList.toggle("on", v);
        this.state[on] = v;
      };
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) {} set(true); });
      const release = (e) => { if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) set(false); };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el._set = set;
    };
    bindBtn(".tc-gas", "throttle", () => this.state.throttle);
    bindBtn(".tc-brake", "brake", () => this.state.brake);
    bindBtn(".tc-drift", "handbrake", () => this.state.handbrake);
    bindBtn(".tc-nitro", "nitro", () => this.state.nitro);
  }

  show() { this.root.classList.add("tc-show"); }
  hide() { this.root.classList.remove("tc-show"); }

  dispose() { this.root.remove(); }
}
