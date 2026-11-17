/**
 * 宝可梦程序化 SVG 立绘
 * 按 data.js 中的 shape 字段绘制不同体型的宝可梦。
 */
import { SPECIES } from "./data.js";

let gid = 0;

const eye = (x, y, r = 5.5, color = "#232634") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x - r * 0.32}" cy="${y - r * 0.36}" r="${r * 0.34}" fill="#fff"/>`;

const mouth = (x, y, w = 10, color = "#232634") =>
  `<path d="M${x - w / 2} ${y}c${w * 0.25} ${w * 0.28} ${w * 0.5} ${w * 0.28} ${w} 0" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;

const shadow = '<ellipse cx="60" cy="108" rx="30" ry="7" fill="rgba(20,30,50,.18)"/>';

const SHAPES = {
  chick(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 3;
    const mid = sp.stage === 2;
    return `
      ${big ? `<path d="M78 68c14-4 22 4 20 14-10 0-17-5-20-14z" fill="${c2}"/>` : ""}
      <ellipse cx="60" cy="78" rx="${big ? 25 : 23}" ry="${big ? 27 : 26}" fill="url(#bodyGrad)"/>
      <ellipse cx="50" cy="88" rx="10" ry="13" fill="rgba(255,255,255,.22)"/>
      <path d="M40 102v6M80 102v6" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <path d="M34 108h10M76 108h10" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="${big ? 35 : 38}" cy="${mid ? 70 : 74}" rx="7" ry="13" fill="${c2}" opacity=".85" transform="rotate(18 38 74)"/>
      <ellipse cx="${big ? 85 : 82}" cy="${mid ? 70 : 74}" rx="7" ry="13" fill="${c2}" opacity=".85" transform="rotate(-18 82 74)"/>
      <circle cx="60" cy="${mid ? 46 : 48}" r="${big ? 22 : 21}" fill="url(#bodyGrad)"/>
      ${mid || big ? `<path d="M76 34l10-12 4 14z" fill="${c2}"/>` : ""}
      <path d="M60 26c-5-12 3-16 4-4 3-11 11-9 7 3-6 6-8 7-11 1z" fill="${c2}"/>
      <path d="M60 30c2 0 8 1 8 4s-6 4-8 4-8-1-8-4 6-4 8-4z" fill="#f7b84a"/>
      <path d="M53 36l7 4 7-4-7 7z" fill="${c2}"/>
      ${eye(52, 45, 4.6)}${eye(68, 45, 4.6)}
      ${mouth(60, 55, 9)}
      <ellipse cx="45" cy="52" rx="4" ry="2.4" fill="rgba(255,120,90,.35)"/>
      <ellipse cx="75" cy="52" rx="4" ry="2.4" fill="rgba(255,120,90,.35)"/>
      ${big ? `<path d="M36 78c-8 2-12 8-10 14 6 1 11-4 12-10z" fill="${c2}"/><path d="M84 78c8 2 12 8 10 14-6 1-11-4-12-10z" fill="${c2}"/>` : ""}
    `;
  },

  gecko(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 3;
    return `
      <path d="M86 82c16 4 20-10 14-18 8 1 12 12 6 20-6 9-17 9-23 3z" fill="${c2}"/>
      <ellipse cx="60" cy="80" rx="${big ? 23 : 21}" ry="${big ? 24 : 23}" fill="url(#bodyGrad)"/>
      <ellipse cx="54" cy="88" rx="11" ry="12" fill="rgba(255,255,255,.3)"/>
      <path d="M46 100v8M74 100v8" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <path d="M40 108h10M70 108h10" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="60" cy="48" r="${big ? 23 : 22}" fill="url(#bodyGrad)"/>
      <path d="M60 27c-10-2-13-10-6-14 2 6 6 9 12 10z" fill="${c2}"/>
      <path d="M64 27c8-4 15-2 17 4-6 3-13 3-19-1z" fill="${c}" stroke="${c2}" stroke-width="1.4"/>
      <path d="M38 70l-12 9 10 5z" fill="${c}"/>
      <path d="M82 70l12 9-10 5z" fill="${c}"/>
      ${eye(51, 45, 6)}${eye(69, 45, 6)}
      <path d="M54 57c4 2 8 2 12 0" fill="none" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="44" cy="53" rx="4" ry="2" fill="rgba(255,90,90,.25)"/>
      <ellipse cx="76" cy="53" rx="4" ry="2" fill="rgba(255,90,90,.25)"/>
    `;
  },

  mudkip(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M88 88c14-2 18 8 12 14-7 5-16 0-16-8z" fill="${c2}"/>
      <ellipse cx="60" cy="82" rx="25" ry="23" fill="url(#bodyGrad)"/>
      <ellipse cx="60" cy="88" rx="15" ry="14" fill="rgba(255,255,255,.42)"/>
      <path d="M44 102v7M76 102v7" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="60" cy="50" rx="26" ry="22" fill="url(#bodyGrad)"/>
      <path d="M38 44l-14 5 10 8z" fill="${c2}" opacity=".9"/>
      <path d="M82 44l14 5-10 8z" fill="${c2}" opacity=".9"/>
      <path d="M44 30l-6-12 12 6zM76 30l6-12-12 6z" fill="${c2}"/>
      ${eye(50, 46, 6)}${eye(70, 46, 6)}
      ${mouth(60, 58, 12)}
      <ellipse cx="42" cy="54" rx="4.5" ry="2.6" fill="rgba(255,120,90,.35)"/>
      <ellipse cx="78" cy="54" rx="4.5" ry="2.6" fill="rgba(255,120,90,.35)"/>
    `;
  },

  dog(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <path d="M84 78c13-8 18-2 16 7-10 4-17 0-20-5z" fill="${c2}"/>
      <ellipse cx="60" cy="82" rx="${big ? 26 : 22}" ry="${big ? 22 : 19}" fill="url(#bodyGrad)"/>
      <path d="M44 96v10M76 96v10" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>
      <path d="M36 44l-6-18 18 10zM84 44l6-18-18 10z" fill="${c2}"/>
      <circle cx="60" cy="50" r="${big ? 23 : 22}" fill="url(#bodyGrad)"/>
      <ellipse cx="60" cy="61" rx="13" ry="9" fill="${c2}" opacity=".45"/>
      ${eye(51, 47, 4.6, "#c8323c")}${eye(69, 47, 4.6, "#c8323c")}
      <ellipse cx="60" cy="58" rx="4.5" ry="3" fill="#232634"/>
      ${mouth(60, 66, 9)}
      <path d="M46 72c8 5 20 5 28 0" fill="none" stroke="${c2}" stroke-width="2" opacity=".6"/>
      ${big ? `<path d="M38 36l8 8 4-10zM82 36l-8 8-4-10z" fill="#f2e8d8" opacity=".5"/>` : ""}
    `;
  },

  raccoon(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M84 80c14-6 18 2 14 12-8 2-14-2-16-7z" fill="${c2}"/>
      <ellipse cx="60" cy="82" rx="24" ry="20" fill="url(#bodyGrad)"/>
      <path d="M36 72l10-8 10 8-10 8zM64 72l10-8 10 8-10 8z" fill="${c2}" opacity=".55"/>
      <path d="M42 96v10M78 96v10" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="60" cy="49" r="22" fill="url(#bodyGrad)"/>
      <path d="M40 36l-4-14 14 8zM80 36l4-14-14 8z" fill="${c2}"/>
      <path d="M40 49c6-6 14-6 20 0-6 6-14 6-20 0zM60 49c6-6 14-6 20 0-6 6-14 6-20 0z" fill="${c2}" opacity=".75"/>
      ${eye(51, 48, 4.4)}${eye(69, 48, 4.4)}
      <ellipse cx="60" cy="58" rx="4" ry="2.6" fill="#232634"/>
      ${mouth(60, 65, 9)}
      <path d="M50 30h20" stroke="#f4ead0" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    `;
  },

  worm(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <circle cx="78" cy="86" r="14" fill="${c2}"/>
      <circle cx="64" cy="82" r="15" fill="${c}"/>
      <circle cx="50" cy="76" r="15" fill="${c2}"/>
      <circle cx="58" cy="54" r="20" fill="url(#bodyGrad)"/>
      <path d="M46 38l-4-12M70 38l4-12" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="42" cy="26" r="3" fill="${c2}"/><circle cx="74" cy="26" r="3" fill="${c2}"/>
      ${eye(51, 52, 5)}${eye(65, 52, 5)}
      ${mouth(58, 62, 9)}
      <path d="M42 68c6 4 12 4 18 0" fill="none" stroke="${c2}" stroke-width="2" opacity=".55"/>
      <path d="M72 50l8 4-8 4z" fill="${c2}" opacity=".7"/>
    `;
  },

  butterfly(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M58 62C36 34 10 38 14 62c3 20 26 22 42 10z" fill="${c}" opacity=".9"/>
      <path d="M62 62c22-28 48-24 44 0-3 20-26 22-42 10z" fill="${c}" opacity=".9"/>
      <path d="M56 82C36 72 22 82 30 96c7 12 24 8 28-4z" fill="${c2}" opacity=".85"/>
      <path d="M64 82c20-10 34 0 26 14-7 12-24 8-28-4z" fill="${c2}" opacity=".85"/>
      <ellipse cx="60" cy="76" rx="7" ry="26" fill="#4a3f52"/>
      <circle cx="60" cy="46" r="12" fill="#4a3f52"/>
      <path d="M54 36l-6-10M66 36l6-10" stroke="#4a3f52" stroke-width="2.4" stroke-linecap="round"/>
      ${eye(56, 44, 3.6, "#fff")}${eye(64, 44, 3.6, "#fff")}
      <circle cx="56" cy="44" r="1.6" fill="#232634"/><circle cx="64" cy="44" r="1.6" fill="#232634"/>
      <circle cx="34" cy="54" r="6" fill="${c2}" opacity=".55"/>
      <circle cx="86" cy="54" r="6" fill="${c2}" opacity=".55"/>
      <circle cx="40" cy="88" r="4" fill="${c}" opacity=".7"/>
      <circle cx="80" cy="88" r="4" fill="${c}" opacity=".7"/>
    `;
  },

  bird(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <path d="M84 82c14 2 20 12 14 20-10 0-17-7-18-14z" fill="${c2}"/>
      <ellipse cx="60" cy="78" rx="${big ? 24 : 21}" ry="${big ? 23 : 21}" fill="url(#bodyGrad)"/>
      <ellipse cx="60" cy="86" rx="13" ry="12" fill="rgba(255,255,255,.4)"/>
      <path d="M48 100v8M72 100v8" stroke="${c2}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M38 74c-10 4-14 14-8 20 8-2 12-8 14-13z" fill="${c}"/>
      <path d="M82 74c10 4 14 14 8 20-8-2-12-8-14-13z" fill="${c}"/>
      <circle cx="60" cy="46" r="${big ? 21 : 20}" fill="url(#bodyGrad)"/>
      <path d="M54 36c-6-10-4-16 2-20 2 8 5 12 10 14z" fill="${c2}"/>
      ${eye(52, 44, 4.6)}${eye(68, 44, 4.6)}
      <path d="M56 52l4 5 4-5z" fill="#f2b23a"/>
      <path d="M60 57l-3 5h6z" fill="#d88a22"/>
      <ellipse cx="44" cy="52" rx="4" ry="2" fill="rgba(255,90,90,.3)"/>
      <ellipse cx="76" cy="52" rx="4" ry="2" fill="rgba(255,90,90,.3)"/>
      ${big ? `<path d="M40 62l8 6-9 5zM80 62l-8 6 9 5z" fill="${c2}" opacity=".8"/>` : ""}
    `;
  },

  electric(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <path d="M80 78l14-18-4 16 12-4-16 20 2-12z" fill="${c2}"/>
      <ellipse cx="58" cy="82" rx="${big ? 24 : 21}" ry="${big ? 23 : 20}" fill="url(#bodyGrad)"/>
      <ellipse cx="58" cy="88" rx="13" ry="12" fill="rgba(255,255,255,.35)"/>
      <path d="M44 98v10M72 98v10" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="58" cy="48" r="21" fill="url(#bodyGrad)"/>
      <path d="M42 36L34 14l16 10zM74 36l8-22-16 10z" fill="${c}" stroke="${c2}" stroke-width="2"/>
      <path d="M36 20l-1 8 6-4zM80 20l1 8-6-4z" fill="#232634"/>
      ${eye(50, 45, 5)}${eye(66, 45, 5)}
      <path d="M53 55c3 3 7 3 10 0" fill="none" stroke="#232634" stroke-width="2" stroke-linecap="round"/>
      <circle cx="43" cy="55" r="4.5" fill="#e85050" opacity=".6"/>
      <circle cx="73" cy="55" r="4.5" fill="#e85050" opacity=".6"/>
      <path d="M46 70l-10 6M70 70l10 6" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
    `;
  },

  rock(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <path d="M34 94l6-34 20-12 22 12 8 34-28 10z" fill="url(#bodyGrad)" stroke="${c2}" stroke-width="2"/>
      <path d="M42 72l18-8 20 8" fill="none" stroke="${c2}" stroke-width="2" opacity=".5"/>
      <path d="M30 66c-10-2-16 6-12 14 5 7 13 5 16 0zM90 66c10-2 16 6 12 14-5 7-13 5-16 0z" fill="${c}" stroke="${c2}" stroke-width="2"/>
      ${eye(50, 64, 4.8)}${eye(70, 64, 4.8)}
      <path d="M53 78c5 4 9 4 14 0" fill="none" stroke="${c2}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M60 52l-6 8h12z" fill="${c2}" opacity=".5"/>
      ${big ? `<path d="M28 92l-8 10M92 92l8 10" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>` : ""}
    `;
  },

  aqua(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <circle cx="88" cy="76" r="11" fill="${c}" stroke="${c2}" stroke-width="2"/>
      <path d="M80 76c-8-2-12 2-12 8" fill="none" stroke="${c2}" stroke-width="3"/>
      <ellipse cx="58" cy="84" rx="${big ? 25 : 23}" ry="${big ? 22 : 21}" fill="url(#bodyGrad)"/>
      <ellipse cx="58" cy="90" rx="14" ry="13" fill="${c2}" opacity=".85"/>
      <path d="M42 98v10M74 98v10" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="58" cy="50" r="23" fill="url(#bodyGrad)"/>
      <circle cx="36" cy="34" r="9" fill="${c}" stroke="${c2}" stroke-width="2"/>
      <circle cx="80" cy="34" r="9" fill="${c}" stroke="${c2}" stroke-width="2"/>
      ${eye(50, 48, 5)}${eye(66, 48, 5)}
      ${mouth(58, 58, 10)}
      <ellipse cx="42" cy="56" rx="5" ry="3" fill="rgba(255,110,110,.4)"/>
      <ellipse cx="74" cy="56" rx="5" ry="3" fill="rgba(255,110,110,.4)"/>
      <ellipse cx="46" cy="72" rx="6" ry="9" fill="${c}" opacity=".5" transform="rotate(20 46 72)"/>
      <ellipse cx="70" cy="72" rx="6" ry="9" fill="${c}" opacity=".5" transform="rotate(-20 70 72)"/>
    `;
  },

  psychic(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage > 1;
    const dress = sp.stage === 3;
    return `
      <path d="M60 62c-16 2-28 18-28 32 0 9 12 12 28 12s28-3 28-12c0-14-12-30-28-32z" fill="url(#bodyGrad)"/>
      ${dress ? `<path d="M36 74c-10 8-14 22-8 30 8-4 12-12 14-20zM84 74c10 8 14 22 8 30-8-4-12-12-14-20z" fill="${c}" opacity=".75"/>` : ""}
      <ellipse cx="60" cy="84" rx="12" ry="16" fill="rgba(255,255,255,.35)"/>
      <circle cx="60" cy="44" r="${big ? 19 : 18}" fill="url(#bodyGrad)"/>
      <path d="M60 25c-4-10 2-14 5-4 4-8 10-6 7 4-4 5-8 6-12 0z" fill="${c}"/>
      <path d="M60 26l-3-8 3-3 3 3z" fill="${c2}"/>
      <path d="M42 38c-6-2-8 4-4 8M78 38c6-2 8 4 4 8" fill="none" stroke="${c2}" stroke-width="2.4" stroke-linecap="round"/>
      ${eye(52, 44, 5)}${eye(68, 44, 5)}
      ${mouth(60, 54, 8)}
      <ellipse cx="45" cy="51" rx="4" ry="2" fill="rgba(232,80,110,.3)"/>
      <ellipse cx="75" cy="51" rx="4" ry="2" fill="rgba(232,80,110,.3)"/>
      <path d="M50 88c6 4 14 4 20 0" fill="none" stroke="${c2}" stroke-width="2" opacity=".4"/>
    `;
  },

  ghost(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M34 96c-4-30 6-58 26-58s30 28 26 58c-6-6-12-2-14 6-5-6-10-2-12 6-2-8-7-12-12-6-2-8-8-12-14-6z" fill="url(#bodyGrad)"/>
      <path d="M38 34l-8-14 14 4zM82 34l8-14-14 4z" fill="${c}"/>
      <path d="M44 50c4-6 12-6 16 0-5 4-11 4-16 0zM60 50c4-6 12-6 16 0-5 4-11 4-16 0z" fill="#231c2e" opacity=".7"/>
      ${eye(52, 52, 5.4, c2)}${eye(68, 52, 5.4, c2)}
      <path d="M48 68c8 6 16 6 24 0" fill="none" stroke="${c2}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M38 72l-6 10M82 72l6 10" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="52" cy="52" r="1.8" fill="#fff"/>
      <circle cx="68" cy="52" r="1.8" fill="#fff"/>
    `;
  },

  steel(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M82 44c14 0 24 12 20 26-3 12-14 18-24 12-6 12-20 14-28 4-10 8-24 2-24-10 0-8 6-14 14-16-2-12 8-22 20-22 4-8 16-8 22 6z" fill="${c2}"/>
      <path d="M84 50c8 2 12 12 8 20-4 7-12 8-16 2z" fill="#2c2834"/>
      <path d="M80 54l10 6-10 6z" fill="#fff" opacity=".85"/>
      <ellipse cx="58" cy="80" rx="20" ry="22" fill="url(#bodyGrad)"/>
      <circle cx="58" cy="46" r="20" fill="url(#bodyGrad)"/>
      <path d="M44 32L36 16l14 6zM72 32l8-16-14 6z" fill="${c}"/>
      <path d="M44 58c-8 2-12 8-10 12 4 2 8-1 10-6zM72 58c8 2 12 8 10 12-4 2-8-1-10-6z" fill="${c}"/>
      ${eye(50, 44, 4.8)}${eye(66, 44, 4.8)}
      <path d="M53 56c3 3 7 3 10 0" fill="none" stroke="#232634" stroke-width="2" stroke-linecap="round"/>
      <path d="M60 88c6 3 12 3 18 0" fill="none" stroke="${c2}" stroke-width="2" opacity=".5"/>
    `;
  },

  camel(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    const big = sp.stage === 2;
    return `
      <ellipse cx="56" cy="86" rx="28" ry="18" fill="url(#bodyGrad)"/>
      <path d="M44 74c0-16 14-22 22-8 8-14 20-6 18 8z" fill="${c}"/>
      ${big ? `<path d="M62 60c0-8 6-10 8-2 2-8 10-8 10 2-4 6-12 6-18 0z" fill="${c2}"/>` : `<path d="M60 62c0-6 4-8 6-2 2-6 8-6 8 2-4 4-10 4-14 0z" fill="${c2}"/>`}
      <path d="M36 100v8M76 100v8" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>
      <path d="M84 78c10-4 14-14 10-24" fill="none" stroke="url(#bodyGrad)" stroke-width="16" stroke-linecap="round"/>
      <circle cx="92" cy="50" r="16" fill="url(#bodyGrad)"/>
      <path d="M98 36l6-8M86 38l-4-9" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>
      ${eye(88, 48, 4.4)}${eye(100, 48, 4.4)}
      <ellipse cx="94" cy="58" rx="4" ry="2.4" fill="${c2}" opacity=".6"/>
      <path d="M86 93c8 3 16 2 22-4" fill="none" stroke="${c2}" stroke-width="2" opacity=".4"/>
      <circle cx="46" cy="84" r="4.5" fill="${c2}" opacity=".6"/>
    `;
  },

  cactus(sp) {
    const c = sp.color;
    const c2 = sp.color2;
    return `
      <path d="M52 104V50c0-14 20-14 20 0v54z" fill="url(#bodyGrad)"/>
      <path d="M52 74c-12 0-18-8-18-18 8 0 14 4 18 10zM72 66c10-2 14-8 14-16-8-1-12 3-14 8z" fill="${c}"/>
      <path d="M60 34c-6-8 0-16 8-14 2 8-2 12-8 14z" fill="${c2}"/>
      <circle cx="67" cy="22" r="6" fill="${c2}"/>
      ${eye(56, 54, 4.4)}${eye(68, 54, 4.4)}
      ${mouth(62, 64, 8)}
      <path d="M40 58l-4-6M32 68l-6-2M84 56l6-6M90 66l6-2M60 84l-6 4M68 92l6 4" stroke="${c2}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="46" cy="88" r="3" fill="${c2}" opacity=".35"/>
      <circle cx="76" cy="80" r="3" fill="${c2}" opacity=".35"/>
    `;
  },
};

export function monsterSVG(speciesId, opts = {}) {
  const sp = SPECIES[speciesId] || SPECIES.torchic;
  const id = "pk" + (gid++);
  const shape = SHAPES[sp.shape] || SHAPES.chick;
  const cls = ["mon-svg", opts.className || ""].filter(Boolean).join(" ");
  return `<svg class="${cls}" viewBox="0 0 120 120" role="img" aria-label="${sp.name}">
    <defs>
      <radialGradient id="${id}u" cx="36%" cy="26%" r="82%">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>
        <stop offset=".42" stop-color="${sp.color}"/>
        <stop offset="1" stop-color="${sp.color2}"/>
      </radialGradient>
    </defs>
    <g style="--unused:0">
      ${shadow}
      <g fill="url(#${id}u)">
        ${shape(sp).replaceAll("url(#bodyGrad)", `url(#${id}u)`)}
      </g>
    </g>
  </svg>`;
}

/** 队伍 / 图鉴卡片用的小尺寸立绘 */
export function monsterThumb(speciesId, className = "") {
  return monsterSVG(speciesId, { className: "thumb " + className });
}
