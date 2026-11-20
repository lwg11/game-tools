/**
 * 触屏驾驶控件（移动端）
 * 左侧：← / → 转向键；右侧：油门 / 刹车 / 漂移 / 氮气。
 * 仅在触摸设备上显示；与键盘输入合并。
 */
export class TouchControls {
  /**
   * @param {HTMLElement} parent 挂载容器
   */
  constructor(parent) {
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, cannon: false, rocket: false };
    this.root = document.createElement("div");
    this.root.className = "tc-layer";
    this.root.innerHTML = `
      <div class="tc-steer">
        <button class="tc-btn tc-left" type="button" aria-label="左转">←</button>
        <button class="tc-btn tc-right" type="button" aria-label="右转">→</button>
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
        <div class="tc-row">
          <button class="tc-btn tc-cannon" type="button">机炮</button>
          <button class="tc-btn tc-rocket" type="button">火箭</button>
        </div>
      </div>`;
    parent.appendChild(this.root);

    // ---------------- 转向键（方向盘只有左右 → 直接左右键，不易误操作）
    const applySteer = () => {
      this.state.steer = (this.rightEl.classList.contains("on") ? 1 : 0) - (this.leftEl.classList.contains("on") ? 1 : 0);
    };
    this.leftEl = this.root.querySelector(".tc-left");
    this.rightEl = this.root.querySelector(".tc-right");
    const bindSteer = (el, side) => {
      const active = new Set();
      el._active = active;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        active.add(e.pointerId);
        el.classList.add("on");
        applySteer();
      });
      const release = (e) => {
        if (!active.delete(e.pointerId)) return;
        el.classList.remove("on");
        applySteer();
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    };
    bindSteer(this.leftEl, "left");
    bindSteer(this.rightEl, "right");

    // ---------------- 按钮：按住生效
    const bindBtn = (cls, on) => {
      const el = this.root.querySelector(cls);
      const active = new Set();
      el._active = active;
      const set = (v) => {
        el.classList.toggle("on", v);
        this.state[on] = v;
      };
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) {} active.add(e.pointerId); set(true); });
      const release = (e) => { if (!active.delete(e.pointerId)) return; if (active.size === 0) set(false); };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    };
    bindBtn(".tc-gas", "throttle");
    bindBtn(".tc-brake", "brake");
    bindBtn(".tc-drift", "handbrake");
    bindBtn(".tc-nitro", "nitro");
    bindBtn(".tc-cannon", "cannon");
    bindBtn(".tc-rocket", "rocket");
  }

  show() { this.root.classList.add("tc-show"); }
  hide() { this.root.classList.remove("tc-show"); }

  dispose() { this.root.remove(); }
}
