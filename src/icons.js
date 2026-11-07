// Original inline-SVG icon set: class icons and effect icons. Drawn for this prototype, not taken from the game.
(function (root) {
'use strict';
const P = {
  // ---- classes
  sword: '<path d="M20.5 3.5l-1.1 4.4-9.6 9.6-3.3-3.3 9.6-9.6z" fill="currentColor"/><path d="M5 13.2l5.8 5.8"/><path d="M7.6 16.4 4 20"/>',
  bow: '<path d="M6.5 3.5c8 3 8 14 0 17"/><path d="M6.5 3.5v17"/><path d="M3.5 12h15"/><path d="M15.5 9l3 3-3 3"/>',
  spear: '<path d="M4 20 16.5 7.5"/><path d="M15 5l5-1.5L18.5 8.5z" fill="currentColor"/><path d="M12.5 8.5l3 3"/>',
  horse: '<path d="M8 20.5l1.2-6.3c-2.4-1.3-3-4.6-1-7.2L10.5 3.5l1.2 2.6c3.7.2 6.7 3 7.3 6.8l-2.4.9-1.9-2-1.6 1.9.9 6.8z" fill="currentColor" stroke="none"/><circle cx="13.2" cy="8" r=".9" fill="var(--icon-bg)" stroke="none"/>',
  wand: '<path d="M4.5 19.5 14 10"/><path d="M17 3.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor"/>',
  mask: '<path fill-rule="evenodd" fill="currentColor" stroke="none" d="M2.5 9c0-2.6 3.6-2.6 7-1.2 1.6.6 3.4.6 5 0 3.4-1.4 7-1.4 7 1.2 0 3.9-3.3 6.2-6.3 5-1.6-.6-2.8-.6-4.4 0-3 1.2-6.3-1.1-6.3-5zM6 10.3c0 1 1 1.6 2.2 1.6s2-.7 2-1.4c0-.8-1.2-1.3-2.2-1.3S6 9.5 6 10.3zm7.8-.1c0 .7.8 1.4 2 1.4s2.2-.6 2.2-1.6c0-.8-1-1.1-2-1.1s-2.2.5-2.2 1.3z"/>',
  bull: '<path d="M3.5 5.5c.5 3.5 3 4.6 5.6 3.6M20.5 5.5c-.5 3.5-3 4.6-5.6 3.6"/><path d="M9 9h6v6.5a3 3 0 0 1-6 0z" fill="currentColor"/><circle cx="10.6" cy="11.5" r=".8" fill="var(--icon-bg)" stroke="none"/><circle cx="13.4" cy="11.5" r=".8" fill="var(--icon-bg)" stroke="none"/>',
  shield: '<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z"/>',
  // ---- effects
  shieldFill: '<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z" fill="currentColor"/>',
  shieldCheck: '<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z"/><path d="m8.7 12 2.3 2.3 4.4-4.6"/>',
  shieldMinus: '<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z"/><path d="M8.8 12h6.4"/>',
  shieldBroken: '<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z"/><path d="m12.8 5.5-2.4 4.6 3.2 1.8-2.4 5.2"/>',
  card: '<rect x="6.5" y="3.5" width="11" height="17" rx="2" fill="currentColor"/>',
  burst: '<path d="M12 2.8l2.1 5.2 5.5-.8-3.4 4.4 3.4 4.4-5.5-.8L12 20.4l-2.1-5.2-5.5.8 3.4-4.4L4.4 7.2l5.5.8z" fill="currentColor"/>',
  bolt: '<path d="M13.5 2.5 5.5 13.5h5.2l-1.2 8 8-11h-5.2z" fill="currentColor"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" fill="currentColor"/>',
  gauge: '<rect x="3.5" y="7" width="15.5" height="10" rx="2"/><path d="M20.5 10.5v3"/><rect x="5.8" y="9.3" width="7" height="5.4" fill="currentColor" stroke="none"/>',
  gaugeDown: '<rect x="3.5" y="7" width="15.5" height="10" rx="2"/><path d="M20.5 10.5v3"/><path d="M8 12h7"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>',
  heartPlus: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M12 10.3v5M9.5 12.8h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dash: '<path d="M4 8h10M7 12h13M4 16h9"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  crosshair: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
  flames: '<path d="M12 21.5c-3.6 0-6-2.3-6-5.4 0-3.3 2.6-4.9 3.3-8.6 1.9 1.3 2.7 3 2.7 4.6.9-.9 1.3-2.2 1.2-3.6 2.8 1.9 4.8 4.5 4.8 7.6 0 3.1-2.4 5.4-6 5.4z" fill="currentColor"/><path d="M6.2 17.8c-2-.8-3.2-2.4-3.2-4.4 0-2 1.3-3.2 1.8-5.4 1.2.9 1.6 2.1 1.5 3.3" fill="currentColor" stroke="none" opacity=".75"/><path d="M17.8 17.8c2-.8 3.2-2.4 3.2-4.4 0-2-1.3-3.2-1.8-5.4-1.2.9-1.6 2.1-1.5 3.3" fill="currentColor" stroke="none" opacity=".75"/><path d="M12 20.2c-1.5 0-2.5-1-2.5-2.3 0-1.4 1.1-2 1.4-3.6.8.5 1.1 1.3 1.1 2 .4-.3.6-.8.6-1.4 1.1.8 1.9 1.8 1.9 3 0 1.3-1 2.3-2.5 2.3z" fill="var(--icon-bg)" stroke="none"/>',
  flame: '<path d="M12 21c-3.8 0-6-2.5-6-5.6 0-3.8 3.3-5.4 3.7-9.9 2.6 1.6 3.4 3.8 3.3 5.6 1-.7 1.6-1.9 1.7-3.1 2.4 2 3.3 4.4 3.3 7.4 0 3.1-2.2 5.6-6 5.6z" fill="currentColor"/>',
  pig: '<path d="M6.6 8.4 5 4.6l4 1.9M17.4 8.4 19 4.6l-4 1.9"/><path d="M12 6.2c-4.3 0-7.4 2.9-7.4 6.6s3.1 6.6 7.4 6.6 7.4-2.9 7.4-6.6-3.1-6.6-7.4-6.6z"/><ellipse cx="12" cy="14.6" rx="3" ry="2.1"/><circle cx="10.9" cy="14.6" r=".55" fill="currentColor" stroke="none"/><circle cx="13.1" cy="14.6" r=".55" fill="currentColor" stroke="none"/><circle cx="9" cy="10.9" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10.9" r=".9" fill="currentColor" stroke="none"/>',
  skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 3.9 2.5 4.8V19h10v-3.7c1.4-.9 2.5-2.4 2.5-4.8 0-4-3.1-7-7.5-7z" fill="currentColor"/><circle cx="9.3" cy="11" r="1.6" fill="var(--icon-bg)"/><circle cx="14.7" cy="11" r="1.6" fill="var(--icon-bg)"/>',
  drop: '<path d="M12 3.5s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" fill="currentColor"/>',
  spiral: '<path d="M12 12c0-1 .9-1.6 1.7-1.4 1.6.4 2 2.5.8 3.7-1.8 1.8-4.8 1.1-5.6-1.3-1-3 1.6-6 4.8-5.6 4 .5 6 4.8 4.2 8.3"/>',
  eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  noEntry: '<circle cx="12" cy="12" r="8"/><path d="m6.4 17.6 11.2-11.2"/>',
  tag: '<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z"/><circle cx="8" cy="8.5" r="1.3" fill="currentColor"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  fist: '<path d="M7 11.5V8.2a1.6 1.6 0 0 1 3.2 0v-.7a1.6 1.6 0 0 1 3.2 0v.5a1.6 1.6 0 0 1 3.2 0v1a1.6 1.6 0 0 1 3.2 0v4.6c0 3.8-2.7 6.4-6.4 6.4h-1c-3.2 0-5.4-2-5.4-5.2z" fill="currentColor"/>',
  wings: '<path d="M12 18c-2-5-6-7-9-7 1.5 3 4.6 6.5 9 7zm0 0c2-5 6-7 9-7-1.5 3-4.6 6.5-9 7z" fill="currentColor"/><path d="M12 18V8"/>',
  swap: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  seal: '<path d="M12 3.5c3 2.2 3.4 5.6 1.2 8.2M12 3.5C9 5.7 8.6 9.1 10.8 11.7M4.6 16.4c.4-3.7 3.2-5.7 6.6-5.2M19.4 16.4c-.4-3.7-3.2-5.7-6.6-5.2M6.6 18.6c3.4 1.6 7.4 1.6 10.8 0"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  flag: '<path d="M6 21V3.5"/><path d="M6 4.5h11.5l-2.8 4 2.8 4H6z" fill="currentColor"/>',
  avenge: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-2.4 1.2-4 2.4-5.4L6.5 4.5l4 2.6L12 3l1.5 4.1 4-2.6-1.4 5.1c1.2 1.4 2.4 3 2.4 5.4 0 3.4-2.5 6-6.5 6z" fill="currentColor"/><circle cx="9.8" cy="14.5" r="1.1" fill="var(--icon-bg)" stroke="none"/><circle cx="14.2" cy="14.5" r="1.1" fill="var(--icon-bg)" stroke="none"/>',
  moon: '<path d="M15 3.5a8.5 8.5 0 1 0 5.6 13.9A7 7 0 0 1 15 3.5z" fill="currentColor"/>',
  halves: '<circle cx="12" cy="12" r="8.3"/><path d="M12 3.7a8.3 8.3 0 0 1 0 16.6z" fill="currentColor"/>',
  outer: '<path d="M2.8 12S6.2 6.5 12 6.5 21.2 12 21.2 12 17.8 17.5 12 17.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M8 18.5c-.6 1.3-.4 2.3.4 3M16 18.5c.6 1.3.4 2.3-.4 3M12 18v3.5"/>',
  crown: '<path d="M4 18.5h16M4.5 16 3.5 7l5 4 3.5-6 3.5 6 5-4-1 9z" fill="currentColor"/>',
  claws: '<path d="M6 4.5c1.5 5 1.4 10-1.5 15M11.5 3.5c1.6 6 1.4 11.5-1.3 17M17 4.5c1.6 5 1.4 10-1.5 15" stroke-width="2.4"/>',
  planet: '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-20 12 12)"/>',
  cycle: '<path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3"/><path d="M17.6 3.4v3.5h-3.5"/><path d="M6.4 20.6v-3.5h3.5"/>',
  robin: '<path d="M5.4 12.2 2.2 9.6l.9 4.6 2.6.3" fill="currentColor" fill-opacity=".35"/><ellipse cx="11.4" cy="13.6" rx="6.4" ry="4.4" fill="currentColor" fill-opacity=".3"/><circle cx="16.4" cy="8.4" r="3" fill="currentColor" fill-opacity=".3"/><path d="M19.2 7.6l2.6.7-2.5 1"/><path d="M8.2 12.4c1.4 2.2 4 2.8 6.4 1.6"/><path d="M10.2 18v2.4M12.8 18v2.4"/><circle cx="17.2" cy="7.8" r=".75" fill="currentColor" stroke="none"/>',
  horns: '<path d="M4 4c.3 5 2.6 8 6 9M20 4c-.3 5-2.6 8-6 9"/><path d="M12 9.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="currentColor"/>',
  castle: '<path d="M4 21V10l2-3 2 3v3h2V8l2-4 2 4v5h2v-3l2-3 2 3v11z" fill="currentColor"/><path d="M10.5 21v-3a1.5 1.5 0 0 1 3 0v3" stroke="var(--icon-bg, #000)"/>',
  pumpkin: '<path d="M12 7c-4.5 0-8 2.9-8 6.6S7.5 20 12 20s8-2.7 8-6.4S16.5 7 12 7z" fill="currentColor"/><path d="M12 7c.2-1.8 1-3 2.4-3.6" /><path d="M8.6 12.2l1.4 1.2M15.4 12.2 14 13.4M9 16.2c1 .8 2 1 3 1s2-.2 3-1" stroke="var(--icon-bg, #000)"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  wave: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  tree: '<path d="M12 3 6 11h3l-4 6h14l-4-6h3z" fill="currentColor"/><path d="M12 17v4"/>',
  city: '<path d="M3.5 20.5h17M5 20.5V10h5v10.5M10 20.5V5h6v15.5M16 20.5v-8h3.5v8" /><path d="M12 8h2M12 11h2M12 14h2M7 13h1M7 16h1"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
  sparkle: '<path d="M12 3.5l1.8 5.6 5.7 1.9-5.7 1.9L12 18.5l-1.8-5.6-5.7-1.9 5.7-1.9z" fill="currentColor"/>',
};

// Six-sided star (two overlapping triangles) as one outline.
function HEX(cx, cy, R) { const r = R / Math.sqrt(3), pts = [];
  for (let i = 0; i < 12; i++) { const a = (-90 + i * 30) * Math.PI / 180, rr = i % 2 ? r : R; pts.push((cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2)); }
  return 'M' + pts.join('L') + 'z'; }
// Another glyph shrunk into the middle.
function IN(g, k, style = '') { return `<g transform="translate(12 12) scale(${k}) translate(-12 -12)"${style ? ` style="${style}"` : ''} stroke-width="${(1.8 / k).toFixed(2)}">${P[g]}</g>`; }
// Clockwise arrow ring (gap at the upper left, head pointing clockwise).
const CW = '<path d="M12 3.4a8.6 8.6 0 1 1-7.45 4.3"/><path d="M5.4 11 4.85 7.2 1.3 8.6"/>';
// Small plus in the bottom-right corner.
const CP = '<path d="M19.4 15.6v6.4M16.2 18.8h6.4" stroke-width="2.1"/>';
const SWORD = '<path d="M20.5 3.5l-1.1 4.4-9.6 9.6-3.3-3.3 9.6-9.6z" fill="currentColor"/><path d="M5 13.2l5.8 5.8"/><path d="M7.6 16.4 4 20"/>';
const CC = { B: 'var(--buster)', A: 'var(--arts)', Q: 'var(--quick)' };
// Several card stars in one icon, each outlined so overlaps stay readable.
function CARDS(list) { const pos = list.length === 3 ? [[12, 7, 6.4], [6.6, 16.3, 6.4], [17.4, 16.3, 6.4]] : [[8.3, 8.4, 7.2], [15.7, 15.6, 7.2]];
  return list.map((c, i) => `<path d="${HEX(...pos[i])}" fill="${CC[c]}" stroke="var(--icon-bg)" stroke-width="1.3"/>`).join(''); }
const PETALS = [0, 72, 144, 216, 288].map(a => { const r = a * Math.PI / 180; return `<circle cx="${(12 + 5 * Math.sin(r)).toFixed(2)}" cy="${(12 - 5 * Math.cos(r)).toFixed(2)}" r="4" fill="currentColor" stroke="none"/>`; }).join('');
Object.assign(P, {
  flower: `${PETALS}<circle cx="12" cy="12" r="2.7" fill="var(--t-yellow)" stroke="var(--icon-bg)" stroke-width="1.2"/>`,
  ringFlame: `<circle cx="12" cy="12" r="9.2"/>${IN('flame', .62)}`,
  scutum: '<rect x="5.6" y="2.6" width="12.8" height="18.8" rx="2.6" fill="currentColor"/><path d="M12 4.6v5.2M12 14.2v5.2M7.6 12h2.4M14 12h2.4" stroke="var(--icon-bg)" stroke-width="1.4"/><circle cx="12" cy="12" r="2.3" fill="var(--t-gold)" stroke="var(--icon-bg)" stroke-width="1.2"/>',
  moonFull: '<circle cx="12" cy="12" r="9" fill="#000" stroke="var(--t-purple)" stroke-width="2"/><circle cx="9.2" cy="9.6" r="1.5" fill="#1c1c1f" stroke="none"/><circle cx="14.6" cy="14.2" r="2.1" fill="#1c1c1f" stroke="none"/><circle cx="14.4" cy="8.4" r=".9" fill="#1c1c1f" stroke="none"/>',
  thumbUp: '<path d="M3.2 10.2h3.6v10.6H3.2z" fill="currentColor"/><path d="M8.6 20.8h8.3c1 0 1.9-.7 2.1-1.7l1.5-6.6c.3-1.2-.7-2.4-1.9-2.4h-4.5l.8-3.6c.2-1-.3-2-1.2-2.4l-.8-.4-4.3 5.6z" fill="currentColor"/>',
  kanjiEn: '<path d="M10.08 13.35 9.92 13.49C10.96 14.34 12.09 15.8 12.46 17.12C14.73 18.46 16.21 13.92 10.08 13.35ZM7.65 14.67V19.41C7.65 20.97 8.12 21.36 10.33 21.36H12.8C16.57 21.36 17.49 20.95 17.49 19.96C17.49 19.51 17.32 19.25 16.65 19.01L16.61 16.69H16.37C15.98 17.81 15.68 18.62 15.44 18.95C15.32 19.13 15.19 19.19 14.87 19.21C14.57 19.23 13.84 19.23 13.02 19.23H10.77C10.04 19.23 9.94 19.15 9.94 18.88V15.42C10.35 15.36 10.55 15.17 10.59 14.91ZM5.76 14.89C5.72 16.35 4.65 17.49 3.7 17.91C3.03 18.19 2.56 18.78 2.78 19.53C3.05 20.34 4.02 20.55 4.83 20.12C6.01 19.53 7.02 17.67 6.03 14.89ZM16.37 14.63 16.19 14.77C17.57 16.07 18.88 18.13 19.19 19.96C21.74 21.84 23.69 16.41 16.37 14.63ZM9.88 5.72C9.62 6.96 9.23 8.12 8.7 9.19C8.68 8.48 7.97 7.65 5.99 7.51C6.51 6.96 7.02 6.35 7.45 5.72ZM6.27 2.64C5.7 5.26 4.26 8.16 2.5 9.8L2.68 9.98C3.72 9.46 4.67 8.77 5.52 7.97C6.09 8.52 6.64 9.33 6.86 10.06C7.37 10.35 7.85 10.33 8.18 10.12C6.98 12.07 5.16 13.65 2.56 14.73L2.7 14.99C8.5 13.57 11.08 10.37 12.29 6.09C12.76 6.05 12.96 5.97 13.08 5.76L11 3.92L9.76 5.16H7.83C8.18 4.61 8.48 4.06 8.75 3.49C9.29 3.49 9.43 3.37 9.5 3.15ZM13.15 4.35V11.99C13.15 13.51 13.57 13.92 15.54 13.92H17.46C20.63 13.92 21.5 13.51 21.5 12.6C21.5 12.19 21.34 11.95 20.71 11.71L20.63 9.78H20.41C20.12 10.65 19.84 11.42 19.63 11.67C19.51 11.81 19.35 11.85 19.11 11.87C18.86 11.87 18.32 11.89 17.69 11.89H16.05C15.46 11.89 15.36 11.79 15.36 11.46V4.93H17.91V7.95C17.91 8.18 17.85 8.3 17.57 8.3C17.22 8.3 16.03 8.22 16.03 8.22V8.5C16.71 8.6 17.04 8.85 17.22 9.11C17.42 9.41 17.49 9.88 17.51 10.49C19.74 10.31 20.02 9.54 20.02 8.16V5.3C20.45 5.22 20.73 5.03 20.85 4.87L18.66 3.25L17.71 4.35H15.62L13.15 3.41Z" fill="var(--t-red)" stroke="#000" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round"/>',
  stopwatch: '<circle cx="12" cy="13.6" r="7.6" fill="currentColor"/><path d="M10 2.6h4" stroke-width="2.2"/><path d="M12 3v2.4"/><path d="m18.2 6.6 1.4-1.4"/><path d="M12 13.6V9.2M12 13.6l2.8 1.8" stroke="var(--icon-bg)" stroke-width="2"/>',
  hourglassDark: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5h8c0-5-8-5-8-8.5s8-3.5 8-8.5z" fill="#000" stroke="#ecd897" stroke-width="1.6"/>',
  bullet: '<path d="M3.2 8.6h9.6c3.6 0 6.8 1.5 8 3.4-1.2 1.9-4.4 3.4-8 3.4H3.2z" fill="currentColor"/><path d="M5.8 8.6v6.8M8.2 8.6v6.8" stroke="var(--icon-bg)" stroke-width="1.2"/>',
  crossSwords: `${SWORD}<g transform="matrix(-1 0 0 1 24 0)">${SWORD}</g>`,
  wheel: `<circle cx="12" cy="12" r="8.8" fill="#fff" stroke="#000" stroke-width="2.2"/><path d="${[0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180, c = Math.cos(r), n = Math.sin(r); return `M${(12 + 2.4 * c).toFixed(2)} ${(12 + 2.4 * n).toFixed(2)}L${(12 + 7.2 * c).toFixed(2)} ${(12 + 7.2 * n).toFixed(2)}`; }).join('')}" stroke="#000" stroke-width="1.05"/><circle cx="12" cy="12" r="1.6" fill="#000" stroke="none"/>`,
  skullDark: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 3.9 2.5 4.8V19h10v-3.7c1.4-.9 2.5-2.4 2.5-4.8 0-4-3.1-7-7.5-7z" fill="#000" stroke="var(--t-blue)" stroke-width="1.1"/><circle cx="9.3" cy="11" r="1.6" fill="var(--icon-bg)" stroke="var(--t-blue)" stroke-width=".8"/><circle cx="14.7" cy="11" r="1.6" fill="var(--icon-bg)" stroke="var(--t-blue)" stroke-width=".8"/><path d="M10.2 19v-2.2M13.8 19v-2.2" stroke="var(--t-blue)" stroke-width=".8"/>',
  pBrand: '<path fill-rule="evenodd" d="M6.6 2.8h6.6c3.5 0 6 2.2 6 5.1s-2.5 5.1-6 5.1h-2.4v3.2L8.7 21.4 6.6 16.2zM10.8 6.1v3.8h2.2c1.4 0 2.3-.8 2.3-1.9s-.9-1.9-2.3-1.9z" fill="currentColor" stroke="none"/>',
  cwDrop: `${CW}${IN('drop', .5, 'color:var(--t-dpurple)')}`,
  ringDots: [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180; return `<circle cx="${(12 + 7.2 * Math.cos(r)).toFixed(2)}" cy="${(12 + 7.2 * Math.sin(r)).toFixed(2)}" r="2" fill="currentColor" stroke="none"/>`; }).join(''),
  swordPlus: `${SWORD}${CP}`,
  shirt: '<path d="M8.6 3.4 3.2 6.2l1.9 4.4 2.3-1v10.8h9.2V9.6l2.3 1 1.9-4.4-5.4-2.8c-.5 1.5-1.9 2.5-3.4 2.5s-2.9-1-3.4-2.5z" fill="currentColor" stroke="#000" stroke-width=".9" stroke-linejoin="round"/>',
  chalice: '<path d="M5.8 3.6h12.4v3.8c0 3.8-2.8 6.6-6.2 6.6s-6.2-2.8-6.2-6.6z" fill="currentColor"/><path d="M10.9 13.6h2.2v3.8h-2.2z" fill="currentColor" stroke="none"/><path d="M7.4 20.4c0-1.8 2-2.9 4.6-2.9s4.6 1.1 4.6 2.9z" fill="currentColor"/><path d="M8.4 6.6h7.2" stroke="var(--icon-bg)" stroke-width="1.3"/>',
  cardsBAQ: CARDS(['B', 'A', 'Q']), cardsBA: CARDS(['B', 'A']), cardsBQ: CARDS(['B', 'Q']), cardsAQ: CARDS(['A', 'Q']),
  atkDef: `<path d="M12 2.6 19.8 5.7v5.8c0 5.1-3.6 8.9-7.8 10.7-4.2-1.8-7.8-5.6-7.8-10.7V5.7z" fill="color-mix(in srgb, var(--t-orange) 25%, transparent)" stroke="var(--t-orange)" stroke-width="2"/><g transform="translate(12 12) scale(.8) translate(-12 -12)"><g stroke="var(--icon-bg)" stroke-width="4.4" fill="var(--icon-bg)">${SWORD}</g><g style="color:var(--t-atk)" stroke-width="2.2">${SWORD}</g></g>`,
  hexStar: `<path d="${HEX(12,12,9.2)}" fill="currentColor"/>`,
  resB: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/><path d="${HEX(12,12,6.6)}" fill="var(--buster)" stroke="var(--icon-bg)" stroke-width="1"/>`,
  resA: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/><path d="${HEX(12,12,6.6)}" fill="var(--arts)" stroke="var(--icon-bg)" stroke-width="1"/>`,
  resQ: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/><path d="${HEX(12,12,6.6)}" fill="var(--quick)" stroke="var(--icon-bg)" stroke-width="1"/>`,
  resNp: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/><path d="${HEX(12,12,6.6)}" fill="var(--t-yellow)" stroke="var(--icon-bg)" stroke-width="1"/>`,
  resCrit: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/>${IN('bolt', .62, 'fill:var(--t-crit);color:var(--t-crit)')}`,
  critTaken: `<circle cx="12" cy="12" r="9.3" fill="currentColor"/>${IN('bolt', .62, 'color:var(--t-crit)')}`,
  ringStar: `<circle cx="12" cy="12" r="9"/>${IN('star', .58)}`,
  ringGauge: `<circle cx="12" cy="12" r="9"/>${IN('gauge', .56)}`,
  cwStar: `${CW}${IN('star', .52)}`,
  cwGauge: `${CW}${IN('gauge', .5)}`,
  cwHeart: `${CW}${IN('heartPlus', .55)}`,
  shieldCheckFill: `<path d="M12 3.2 19 6v5.2c0 4.6-3.2 8-7 9.6-3.8-1.6-7-5-7-9.6V6z" fill="currentColor"/><path d="m8.5 12 2.5 2.5 4.6-4.8" stroke="var(--icon-bg)" stroke-width="2.2"/>`,
  bubbles: `<circle cx="9" cy="14.5" r="5"/><circle cx="16.6" cy="8" r="3.4"/><circle cx="17.3" cy="17.4" r="2"/><circle cx="7.8" cy="5.6" r="1.5"/><path d="M6.6 13.2a2.6 2.6 0 0 1 2-2" stroke-width="1.4"/>`,
  kneel: `<circle cx="13.4" cy="4.4" r="2.4" fill="currentColor" stroke="none"/><path d="M13 8.4 12.2 14M12.2 14l2 5.8h4.6M12.2 14H7.6v6M12.8 9.8l-4.4 3" stroke-width="2.8"/>`,
  flamePlus: `<path d="M12 21c-3.8 0-6-2.5-6-5.6 0-3.8 3.3-5.4 3.7-9.9 2.6 1.6 3.4 3.8 3.3 5.6 1-.7 1.6-1.9 1.7-3.1 2.4 2 3.3 4.4 3.3 7.4 0 3.1-2.2 5.6-6 5.6z" fill="currentColor"/><path d="M12 13.2v5.2M9.4 15.8h5.2" stroke="var(--icon-bg)" stroke-width="2"/>`,
  swordMinus: `<path d="M20.5 3.5l-1.1 4.4-9.6 9.6-3.3-3.3 9.6-9.6z" fill="currentColor"/><path d="M5 13.2l5.8 5.8"/><path d="M7.6 16.4 4 20"/><path d="M15.2 19.6h6" stroke-width="2.4"/>`,
  cloudZ: `<path d="M7 18.5a4 4 0 0 1-.6-8 5.4 5.4 0 0 1 10.4-1.4 4.7 4.7 0 0 1 .5 9.4z" fill="currentColor"/><path d="M7.4 11.6h4.4l-4.4 4.6h4.4M13.6 9h3.2l-3.2 3.3h3.2" stroke="var(--icon-bg)" stroke-width="1.7"/>`,
  heartPlusC: `<g transform="translate(-1.2 -1.2)"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M12 10.3v5M9.5 12.8h5"/></g>${CP}`,
  gaugePlusC: `<g transform="translate(0 -2.6)"><rect x="3.5" y="7" width="15.5" height="10" rx="2"/><path d="M20.5 10.5v3"/><rect x="5.8" y="9.3" width="7" height="5.4" fill="currentColor" stroke="none"/></g>${CP}`,
  burstPlusC: `<g transform="translate(12 12) scale(.86) translate(-13.4 -13.4)"><path d="M12 2.8l2.1 5.2 5.5-.8-3.4 4.4 3.4 4.4-5.5-.8L12 20.4l-2.1-5.2-5.5.8 3.4-4.4L4.4 7.2l5.5.8z" fill="currentColor"/></g>${CP}`,
  gun: `<path d="M2.8 7.2h16.4l1.2 1.2v2.9h-9.6l-.9 1.3.5 1.1-1.6 6.3H4.6l2.1-7.6-3.9-.1z" fill="currentColor"/><path d="M10.9 11.3l-.4 2.8h-2" stroke-width="1.5"/>`,
  magicBullet: '<path d="M8 20V10c0-2.7 1.8-5.3 4-7 2.2 1.7 4 4.3 4 7v10z" fill="#d9e0e9" stroke="#8cf2ff" stroke-width="2.2" style="filter:drop-shadow(0 0 2px #65eaff)"/><path d="M9.3 11v7.7h2.1V8.3c-.9.7-1.6 1.6-2.1 2.7z" fill="#fff" stroke="none"/><path d="M13.2 8.3V20h1.7V10c0-.6-.1-1.2-.3-1.8z" fill="#8795a7" stroke="none"/><path d="M8 17.6h8M8 19.3h8" stroke="#f7fbff" stroke-width="1.1"/>',
});

// effect key -> [glyph, tone]
const EFFECT = {
  robin: ['robin', 'robin'], magicBullet: ['magicBullet', 'silver'],
  atk: ['sword', 'atk'], def: ['shield', 'orange'], buster: ['hexStar', 'B'], arts: ['hexStar', 'A'], quick: ['hexStar', 'Q'], extra: ['hexStar', 'EX'],
  busterRes: ['resB', 'orange'], artsRes: ['resA', 'orange'], quickRes: ['resQ', 'orange'], allBuster: ['card', 'B'], npToArts: ['card', 'A'],
  npDmg: ['burst', 'np'], critDmg: ['bolt', 'crit'], critRate: ['bolt', 'crit'], starDrop: ['ringStar', 'star'], starGather: ['star', 'star'], starRegen: ['cwStar', 'star'], stars: ['star', 'star'],
  npGain: ['ringGauge', 'np'], npRegen: ['cwGauge', 'np'], np: ['gauge', 'np'], busterAtkNp: ['gauge', 'np'], drain: ['gaugeDown', 'bad'],
  debuffRes: ['shieldCheck', 'res'], mentalRes: ['shieldCheck', 'res'], atkDebuffRes: ['shieldCheck', 'res'], debuffImmune: ['shieldCheckFill', 'res'], ctrlImmune: ['shieldCheck', 'res'], cleanse: ['bubbles', 'res'],
  buffSuccess: ['dice', 'orange'], debuffSuccess: ['dice', 'orange'], mentalSuccess: ['dice', 'orange'],
  heal: ['heartPlus', 'heal'], healRecv: ['heartPlus', 'heal'], hpRegen: ['cwHeart', 'heal'], maxHp: ['heart', 'orange'],
  dmgPlus: ['plus', 'atk'], dmgCut: ['shieldMinus', 'orange'], evade: ['dash', 'dpurple'], invincible: ['shieldFill', 'gold'], taunt: ['crosshair', 'white'],
  sureHit: ['target', 'red'], ignoreDef: ['shieldBroken', 'atk'], ignoreInv: ['shieldBroken', 'gold'], strip: ['shieldBroken', 'blue'],
  special: ['plus', 'atk'], specialDef: ['shieldCheck', 'orange'], guts: ['kneel', 'orange'], death: ['skull', 'bad'],
  curse: ['skull', 'purple'], burn: ['flame', 'bad'], burnDmg: ['flamePlus', 'bad'], poison: ['drop', 'dpurple'], curseOnAttack: ['swordMinus', 'atk'],
  pigify: ['pig', 'bad'], bind: ['lock', 'yellow'], petrify: ['lock', 'yellow'], sleep: ['cloudZ', 'pink'], stripRes: ['dice', 'orange'], deathRes: ['shieldCheck', 'orange'], deathImmune: ['shieldCheckFill', 'res'], deathSuccess: ['skull', 'atk'],
  immuneTo: ['shieldCheckFill', 'res'], trueInvincible: ['shieldFill', 'silver'], npType: ['swap', 'np'], curseNoDeath: ['shieldCheck', 'res'],
  noHeal: ['heart', 'bad'], npDmgRes: ['resNp', 'orange'], lockHand: ['lock', 'white'],
  critRes: ['resCrit', 'orange'], classRel: ['swap', 'util'],
  healGiven: ['heartPlusC', 'heal'], dmgTakenPlus: ['plus', 'blue'], multiHit: ['crossSwords', 'atk'], noCards: ['lock', 'white'], buffRecv: ['shieldCheck', 'orange'],
  ndGain: ['gaugePlusC', 'np'], critDmgTaken: ['critTaken', 'blue'], trigger: ['sparkle', 'util'], reflect: ['bullet', 'blue'], territory: ['shieldFill', 'silver'], formRevert: ['sword', 'gold'], counter: ['bullet', 'blue'], counterDmg: ['bullet', 'blue'],
  stun: ['lock', 'yellow'], charm: ['heart', 'charm'], terror: ['stopwatch', 'blue'], skillSeal: ['lock', 'red'], npSeal: ['lock', 'orange'],
  swap: ['swap', 'util'], seal: ['seal', 'charm'], ocUp: ['burstPlusC', 'np'], quickHitDebuff: ['card', 'Q'], npOnBurnHit: ['gauge', 'np'],
  cardsBAQ: ['cardsBAQ', 'EX'], cardsBA: ['cardsBA', 'EX'], cardsBQ: ['cardsBQ', 'EX'], cardsAQ: ['cardsAQ', 'EX'], atkDef: ['atkDef', 'atk'],
  kurFlower: ['flower', 'red'], livingFlame: ['ringFlame', 'blue'], holyGrail: ['chalice', 'gold'], romanShield: ['scutum', 'red'], facelessMoon: ['moonFull', 'purple'], like: ['thumbUp', 'heal'], grudge: ['kanjiEn', 'red'], pastAlt: ['wheel', 'white'], timedBad: ['stopwatch', 'blue'], eternalSleep: ['cloudZ', 'peri'], sinBrand: ['pBrand', 'red'], poisonHeal: ['cwDrop', 'heal'], rankUp: ['ringDots', 'yellow'], atkPlus: ['swordPlus', 'atk'], mcChaldea: ['shirt', 'white'], mcAtlas: ['shirt', 'purple'], doom: ['skullDark', 'blue'],
  buffBlock: ['noEntry', 'blue'], trait: ['tag', 'util'], delayed: ['stopwatch', 'orange'], cdReduce: ['hourglassDark', 'gold'],
};
const CLASS = { Saber: 'sword', Archer: 'bow', Lancer: 'spear', Rider: 'horse', Caster: 'wand', Assassin: 'mask', Berserker: 'bull', Shielder: 'shieldFill', Ruler: 'flag', Avenger: 'flames', 'Moon Cancer': 'moon', 'Alter Ego': 'halves', Foreigner: 'outer', Pretender: 'crown', 'Beast I': 'claws', 'Beast II': 'horns', Unbeast: 'planet' };

function svg(glyph, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[glyph] || P.sparkle}</svg>`;
}
function classIcon(cls) { return `<span class="clsico" title="${cls}" aria-label="${cls}">${svg(CLASS[cls] || 'sparkle')}</span>`; }
// Named statuses with their own icon (matched on the effect's label), for the skill and for the status badge.
const STATUS_ICON = { 'Blessing of Kur': 'kurFlower', 'Living Flame': 'livingFlame', 'Holy Grail Possession': 'holyGrail', 'Magic Bullet': 'magicBullet', Roman: 'romanShield', 'Like!': 'like', Like: 'like', 'Grudge of Vengeance': 'grudge', Vengeance: 'grudge', 'Past Alteration': 'pastAlt', Confusion: 'timedBad' };
// Skills whose icon is picked by name, and buffs from those skills that share it (BB (Summer)'s card lock).
const SKILL_ICON = { 'Faceless Moon EX': 'facelessMoon', 'Load Magic Bullet B': 'magicBullet' };
const FROM_ICON = { 'Faceless Moon EX|lockHand': 'facelessMoon' };
// A delayed effect that will hurt its holder or their team (a self-stun, a self-KO, sealed cards...) reads as a debuff.
const BAD_TO = new Set([undefined, 'self', 'others', 'allies', 'ally']);
function badDelayed(b) {
  return (b.eff || []).some(x => x && BAD_TO.has(x.to) && (['control', 'koSelf', 'selfDmg', 'dot', 'hpLoss'].includes(x.k) || (x.k === 'buff' && ((typeof x.v === 'number' && x.v < 0) || ['noCards', 'buffBlock', 'noHeal', 'dmgTakenPlus', 'doom'].includes(x.s)))));
}
function statusKey(b) {
  if (!b) return null;
  if ((b.s === 'delayed' || b.k === 'delayed') && badDelayed(b)) return 'timedBad';
  if (b.tags && b.tags.includes('Mark Of Sin')) return 'sinBrand';      // Brand of Sin stacks
  if (b.s === 'dotHeal' && b.kind === 'poison') return 'poisonHeal'; // Poison Recovery
  return STATUS_ICON[b.label] || STATUS_ICON[b.trait] || FROM_ICON[b.from + '|' + b.s] || atkTrigger(b) || null;
}
// On-attack effects: a sword with a minus when the hit lands something bad on the enemy (a debuff, burn, buff removal…),
// a sword with a plus when it gives the attacker (or their team) something good.
const ATTACK_ON = new Set(['attack', 'cardBefore', 'cardAfter', 'npBefore', 'npAfter']);
function atkTrigger(b) {
  if (b.s !== 'trigger' || !ATTACK_ON.has(b.on)) return null;
  const bad = (b.eff || []).some(x => x && (x.to === 'enemy' || x.to === 'enemies')); // anything landed on the enemy counts as a debuff
  return bad ? 'curseOnAttack' : 'atkPlus';
}
function effectKey(e) {
  if (!e) return 'sparkle';
  if (statusKey(e)) return statusKey(e);
  if (e.k === 'buff') return e.s;
  if (e.k === 'control') return e.kind;
  if (e.k === 'dot') return e.kind;
  return { np: 'np', heal: 'heal', stars: 'stars', cleanse: 'cleanse', strip: 'strip', drain: 'drain', death: 'death', guts: 'guts', delayed: 'delayed', koSelf: 'death', selfDmg: 'death', cdReduce: 'cdReduce', transform: 'trait', npPerTrait: 'np', field: 'sparkle' }[e.k] || 'sparkle';
}
const DOWN_BLUE = new Set(['atk', 'def', 'busterRes', 'artsRes', 'quickRes', 'critRes']);
// Badge for an effect key. neg = harmful to the holder. dir = 'up' | 'down' | null.
function badge(key, { neg = false, dir = null, tip = '', size = '', plain = false } = {}) {
  let [glyph, tone] = EFFECT[key] || ['sparkle', 'util'];
  if (dir === 'down' && DOWN_BLUE.has(key)) tone = 'blue'; // lowered ATK/DEF and lowered card or crit resistance read blue
  const arrow = dir ? `<span class="arr ${dir}">${dir === 'up' ? '▲' : '▼'}</span>` : '';
  const attrs = plain ? 'aria-hidden="true"' : `tabindex="0" role="img" data-tip="${tip}" aria-label="${tip}"`;
  return `<span class="badge t-${tone}${neg ? ' neg' : ''} ${size}" ${attrs}>${svg(glyph)}${arrow}</span>`;
}
// Icon for a skill: its first effect.
// Which icon a skill shows: a hand-picked one, the Heal icon for Imperial Privilege, a joint icon when the
// leading effect is one of several card buffs or of an ATK + DEF pair, otherwise its first effect's icon.
function skillKey(skill) {
  if (skill.icon) return skill.icon;
  if (SKILL_ICON[skill.n]) return SKILL_ICON[skill.n];
  if (/Imperial Privilege/i.test(skill.n || '')) return 'heal';
  const e = skill.e[0], key = effectKey(e);
  const buffs = skill.e.filter(x => x && x.k === 'buff');
  if (['buster', 'arts', 'quick'].includes(key)) {
    const has = c => buffs.some(x => x.s === c);
    const id = (has('buster') ? 'B' : '') + (has('arts') ? 'A' : '') + (has('quick') ? 'Q' : '');
    if (id.length > 1) return 'cards' + id;
  }
  if ((key === 'atk' || key === 'def') && buffs.some(x => x.s === 'atk') && buffs.some(x => x.s === 'def')) return 'atkDef';
  return key;
}
function skillIcon(skill, size = '', plain = true) {
  if (skill.icon || SKILL_ICON[skill.n]) return badge(skill.icon || SKILL_ICON[skill.n], { tip: skill.n, size, plain }); // a hand-picked icon (Alice's robin, BB's Faceless Moon)
  const e = skill.e[0];
  const key = skillKey(skill);
  if (key === 'heal' && !(e && e.k === 'heal')) return badge(key, { tip: skill.n, size, plain });
  const dir = e && e.k === 'buff' && typeof e.v === 'number' && !['taunt', 'evade', 'invincible', 'sureHit', 'ignoreDef', 'ignoreInv', 'allBuster', 'npToArts', 'debuffImmune', 'trait', 'buffBlock', 'trigger'].includes(e.s) ? (e.v >= 0 ? 'up' : 'down') : null;
  const neg = e && (e.to === 'enemy' || e.to === 'enemies');
  return badge(key, { neg, dir, tip: skill.n, size, plain });
}
const API = { SKILL_ICON, svg, classIcon, badge, skillIcon, skillKey, effectKey, statusKey, EFFECT, STATUS_ICON, CLASS, glyphs: Object.keys(P) };
root.Icons = API;
})(typeof window !== 'undefined' ? window : globalThis);
