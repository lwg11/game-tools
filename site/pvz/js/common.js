/**
 * 植物大战僵尸 · 加强版 · 公共常量与工具（从 game.js 原样搬移）
 */
export const W = 1280;
export const H = 720;
export const GRID = { x: 292, y: 146, cell: 84, cols: 11, rows: 6 };
export const GRID_W = GRID.cell * GRID.cols;
export const GRID_H = GRID.cell * GRID.rows;
export const CARD = { x: 160, y: 26, w: 82, h: 92, gap: 5 };
export const TOP_H = 136;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const TAU = Math.PI * 2;

export function groundY(row) {
  return GRID.y + row * GRID.cell + GRID.cell * 0.9;
}
export function colX(col) {
  return GRID.x + col * GRID.cell + GRID.cell / 2;
}

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
