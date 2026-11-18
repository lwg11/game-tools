/**
 * 石器大战 · 回合制物理对战 · 公共常量与工具（从 game.js 原样搬移）
 */
import { WORLD } from "./levels.js";
export const W = WORLD.w;
export const H = WORLD.h;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const TAU = Math.PI * 2;
