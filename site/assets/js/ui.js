/** 公共 UI 工具：轻提示与内联图标 */
const ICONS = {
  user: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
  star: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  sound: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 010 6"/></svg>',
  mute: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1z"/></svg>',
  trophy: '<svg class="icon" viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4v2a4 4 0 004 4M16 6h4v2a4 4 0 01-4 4M12 13v4M9 21h6M10 17h4"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 10-2.4 5.7"/><path d="M20 5v5h-5"/></svg>',
};

export function icon(name) {
  return ICONS[name] || "";
}

let wrap = null;
export function ensureToastWrap() {
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  return wrap;
}

export function toast(message, type = "", duration = 2400) {
  const host = ensureToastWrap();
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s ease, transform .25s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 280);
  }, duration);
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function formatStars(n) {
  return Number(n) || 0;
}
