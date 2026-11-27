/** 石器大战 · 武器栏 SVG 图标表 */
/** 由 game.js 抽出：纯展示函数，无状态依赖 */

export function weaponIcon(id) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  if (id === "spear") return `<svg ${common}><path d="M4 20L18 6"/><path d="M15 4l5 1-1 5z"/></svg>`;
  if (id === "boulder") return `<svg ${common}><path d="M12 3l7 4 2 8-6 6-8-2-3-7z"/><path d="M9 9l3 3-1 4"/></svg>`;
  if (id === "grenade") return `<svg ${common}><circle cx="10" cy="14" r="6"/><path d="M14 9l2-3M16 5c2 0 3 1 3 3"/></svg>`;
  if (id === "banana") return `<svg ${common}><path d="M5 6c1 8 6 12 14 11-3 3-9 4-13 1S3 9 5 6z"/></svg>`;
  if (id === "boomerang") return `<svg ${common}><path d="M5 8l6 5-6 5"/><path d="M5 8l10 4-10 5" opacity=".55"/></svg>`;
  if (id === "meteor") return `<svg ${common}><circle cx="15" cy="9" r="5"/><path d="M9 15l-5 5M11 17l-3 3M7 11l-3 3"/></svg>`;
  if (id === "crossbow") return `<svg ${common}><path d="M3 12h18"/><path d="M8 6l4 6-4 6"/><path d="M17 9l3 3-3 3"/></svg>`;
  if (id === "cannon") return `<svg ${common}><path d="M3 15l13-5 5 3-3 5-15 2z"/><circle cx="9" cy="18" r="2.6"/><circle cx="16" cy="17" r="2.6"/><path d="M16 10l4-3"/></svg>`;
  if (id === "firebomb") return `<svg ${common}><circle cx="11" cy="15" r="6"/><path d="M11 3c3 3 2 5 0 6-2-1-2-3 0-6z"/></svg>`;
  if (id === "rifle") return `<svg ${common}><path d="M2 14l16-4 3 2-1 3-17 3z"/><path d="M8 15v4"/><path d="M14 12l2 4"/></svg>`;
  if (id === "mortar") return `<svg ${common}><path d="M7 17L15 4l5 3-8 13z"/><path d="M3 20l6-3"/><path d="M9 19l3 2"/></svg>`;
  if (id === "rocket") return `<svg ${common}><path d="M14 4l6 8-6 8-3-4h-5V8h5z"/><path d="M9 12H3"/><path d="M8 8L4 5M8 16l-4 3"/></svg>`;
  if (id === "laser") return `<svg ${common}><path d="M3 12h10"/><path d="M13 9l7 3-7 3z"/><path d="M5 8v8M9 9v6"/></svg>`;
if (id === "railgun") return `<svg ${common}><path d="M2 12h20"/><path d="M4 8v8M9 9v6M14 8v8M19 9v6"/></svg>`;
if (id === "watermelon") return `<svg ${common}><circle cx="12" cy="13" r="8"/><path d="M8 10c2 1 6 1 8 0M8 14c2 1 6 1 8 0"/></svg>`;
if (id === "durian") return `<svg ${common}><path d="M12 3l2 3 3-1 1 3 3 1-1 3 2 2-3 1 1 3-3-1-1 3-2-2-3 1-1-3-3-1 2-2-1-3 3 1z"/></svg>`;
if (id === "poisonshroom") return `<svg ${common}><path d="M4 12a8 6 0 0116 0z"/><path d="M9 12v5a3 3 0 006 0v-5"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="8" r="1.2"/></svg>`;
if (id === "flail") return `<svg ${common}><circle cx="7" cy="7" r="3"/><path d="M9 9l6 6"/><circle cx="17" cy="17" r="4"/><path d="M17 13v-2M13 17h-2"/></svg>`;
if (id === "flare") return `<svg ${common}><path d="M12 3v8"/><path d="M8 8l4 4 4-4"/><path d="M5 17l7-4 7 4"/><path d="M8 21h8"/></svg>`;
if (id === "molotov") return `<svg ${common}><path d="M9 3h6v4l2 3v9a2 2 0 01-2 2h-6a2 2 0 01-2-2v-9l2-3z"/><path d="M12 3c2 2 1 3 0 4-1-1-1-2 0-4z"/></svg>`;
if (id === "cluster") return `<svg ${common}><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></svg>`;
if (id === "drone") return `<svg ${common}><circle cx="12" cy="12" r="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="19" r="1.5"/></svg>`;
if (id === "gravity") return `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 019 9M12 21a9 9 0 01-9-9"/><path d="M12 7v10M7 12h10"/></svg>`;
if (id === "sword") return `<svg ${common}><path d="M12 2l2 6-2 12-2-12z"/><path d="M7 14h10"/><circle cx="12" cy="17" r="1.5"/></svg>`;
if (id === "fireball") return `<svg ${common}><circle cx="12" cy="13" r="6"/><path d="M12 3c2 2 3 4 3 6M9 4c1 1 2 2 2 3"/></svg>`;
if (id === "thunder") return `<svg ${common}><path d="M13 2L5 14h6l-2 8 8-12h-6z"/></svg>`;
if (id === "swordarray") return `<svg ${common}><path d="M12 2v8M12 14v8M2 12h8M14 12h8M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/></svg>`;
if (id === "dragonpalm") return `<svg ${common}><path d="M4 12c3-4 6-6 8-6s5 2 8 6c-3 4-6 6-8 6s-5-2-8-6z"/><circle cx="12" cy="12" r="2"/></svg>`;
if (id === "shieldcharm") return `<svg ${common}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
if (id === "soulchain") return `<svg ${common}><path d="M4 20l5-6 5-2 5-6"/><circle cx="5" cy="19" r="2"/><circle cx="10" cy="13" r="2"/><circle cx="15" cy="11" r="2"/><circle cx="19" cy="6" r="2"/></svg>`;
if (id === "mend") return `<svg ${common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M12 15v6M9 18h6"/></svg>`;
if (id === "stonewall") return `<svg ${common}><path d="M4 18h16"/><path d="M6 18v-6h5v6"/><path d="M13 18v-9h5v9"/><path d="M8 12h1M15 9h1"/></svg>`;
return `<svg ${common}><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3"/></svg>`;
}
