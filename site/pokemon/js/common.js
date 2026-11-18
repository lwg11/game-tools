/**
 * 精灵宝可梦 · 公共工具与常量（从 game.js 原样搬移）
 */
import { TYPE_COLORS, TYPE_NAMES } from "./data.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const STATUS_NAMES = { psn: "中毒", brn: "灼伤", par: "麻痹", slp: "睡眠", frz: "冰冻" };
export const STAGE_MULT = [2 / 8, 2 / 7, 2 / 6, 2 / 5, 2 / 4, 2 / 3, 1, 3 / 2, 4 / 2, 5 / 2, 6 / 2, 7 / 2, 8 / 2];
export const stageMult = (stage) => STAGE_MULT[clamp(Number(stage) || 0, -6, 6) + 6];

export function typeBadges(types) {
  return (types || []).map((t) =>
    `<span class="type-badge" style="background:${TYPE_COLORS[t] || "#888"}">${TYPE_NAMES[t] || t}</span>`
  ).join("");
}
