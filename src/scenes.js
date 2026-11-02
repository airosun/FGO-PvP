// Battlefield scenery for the middle pane. One SVG scene per field; the UI crossfades between them.
(function (root) {
const W = 400, H = 220;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const sky = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const radial = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('')}</radialGradient>`;
function hills(y, amp, n, fill, seed, extra = '') {
  const r = rng(seed); let d = `M0 ${H} L0 ${y}`;
  const step = W / n;
  for (let i = 0; i <= n; i++) { const x = i * step, cy = y - amp * (0.4 + r() * 0.6); d += ` Q${x - step / 2} ${cy} ${x} ${y - amp * 0.2 * r()}`; }
  return `<path d="${d} L${W} ${H} Z" fill="${fill}" ${extra}/>`;
}
function pine(x, base, h, fill) {
  const w = h * 0.42; let s = '';
  for (let k = 0; k < 3; k++) { const top = base - h + k * h * 0.22, bot = base - h * 0.18 - (2 - k) * h * 0.18; const ww = w * (0.55 + k * 0.25); s += `<path d="M${x} ${top} L${x + ww / 2} ${bot + h * 0.12} L${x - ww / 2} ${bot + h * 0.12} Z" fill="${fill}"/>`; }
  return s + `<rect x="${x - h * 0.03}" y="${base - h * 0.14}" width="${h * 0.06}" height="${h * 0.16}" fill="${fill}"/>`;
}
function stars(n, seed, maxY, cls = 'twinkle') {
  const r = rng(seed); let s = '';
  for (let i = 0; i < n; i++) s += `<circle class="${cls}" style="animation-delay:${(r() * 4).toFixed(2)}s" cx="${(r() * W).toFixed(1)}" cy="${(r() * maxY).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(2)}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  return s;
}
function cloud(x, y, s, fill, op = 1, cls = '') {
  return `<g class="${cls}" opacity="${op}" fill="${fill}"><ellipse cx="${x}" cy="${y}" rx="${28 * s}" ry="${10 * s}"/><ellipse cx="${x - 14 * s}" cy="${y - 5 * s}" rx="${14 * s}" ry="${10 * s}"/><ellipse cx="${x + 9 * s}" cy="${y - 9 * s}" rx="${16 * s}" ry="${12 * s}"/></g>`;
}
function embers(n, seed, color, cls = 'ember') {
  const r = rng(seed); let s = '';
  for (let i = 0; i < n; i++) s += `<circle class="${cls}" style="animation-delay:${(-r() * 6).toFixed(2)}s;animation-duration:${(4 + r() * 4).toFixed(2)}s" cx="${(r() * W).toFixed(1)}" cy="${(H - r() * 30).toFixed(1)}" r="${(0.8 + r() * 1.6).toFixed(2)}" fill="${color}"/>`;
  return s;
}
function flames(base, h, n, seed, colors) {
  const r = rng(seed); let s = '';
  for (const [ci, c] of colors.entries()) {
    let d = `M0 ${H} L0 ${base}`; const step = W / n;
    for (let i = 0; i < n; i++) { const x = i * step; const tip = base - h * (0.5 + r() * 0.5) * (1 - ci * 0.28); d += ` Q${x + step * 0.15} ${base - (base - tip) * 0.4} ${x + step * 0.5} ${tip} Q${x + step * 0.85} ${base - (base - tip) * 0.4} ${x + step} ${base}`; }
    s += `<path class="flicker f${ci}" d="${d} L${W} ${H} Z" fill="${c}"/>`;
  }
  return s;
}
function buildings(base, seed, fill, win, minH, maxH, wFrom, wTo, lit) {
  const r = rng(seed); let s = '', x = -6;
  while (x < W) {
    const w = wFrom + r() * (wTo - wFrom), h = minH + r() * (maxH - minH);
    s += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    if (r() < 0.25) s += `<rect x="${(x + w / 2 - 1).toFixed(1)}" y="${(base - h - 10).toFixed(1)}" width="2" height="10" fill="${fill}"/>`;
    if (win) for (let wy = base - h + 6; wy < base - 6; wy += 8) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < lit) s += `<rect class="${r() < 0.08 ? 'blink' : ''}" style="animation-delay:${(r() * 5).toFixed(1)}s" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="4" fill="${win}"/>`;
    x += w + 1 + r() * 4;
  }
  return s;
}
function rays(cx, cy, n, len, color, op, cls) {
  let s = `<g class="${cls}" style="transform-origin:${cx}px ${cy}px" opacity="${op}">`;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = a + Math.PI / n * 0.5; s += `<path d="M${cx} ${cy} L${(cx + Math.cos(a) * len).toFixed(1)} ${(cy + Math.sin(a) * len).toFixed(1)} L${(cx + Math.cos(b) * len).toFixed(1)} ${(cy + Math.sin(b) * len).toFixed(1)} Z" fill="${color}"/>`; }
  return s + '</g>';
}

const SCENES = {
  Sunlight: () => `<defs>${sky('sk', [[0, '#3f8fd8'], [0.6, '#9fd0f0'], [1, '#f6e3a8']])}${radial('sun', [[0, '#fffbe6'], [0.35, '#ffe48a'], [1, '#ffd34d', 0]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${rays(318, 52, 14, 260, '#fff6c8', 0.18, 'spin')}<circle cx="318" cy="52" r="70" fill="url(#sun)"/><circle cx="318" cy="52" r="20" fill="#fff8d6"/>
    ${cloud(80, 50, 1, '#fff', 0.85, 'drift')}${cloud(200, 34, 0.7, '#fff', 0.7, 'drift slow')}
    ${hills(160, 30, 4, '#8cc06a', 3)}${hills(182, 22, 5, '#6aa84f', 8)}${hills(204, 14, 6, '#4f8f3a', 12)}`,
  // Sunlight while Tezcatlipoca negates it: the same meadow under a total eclipse.
  'Sunlight Eclipse': () => `<defs>${sky('sk', [[0, '#0b1230'], [0.45, '#27315c'], [0.8, '#6b5a72'], [1, '#c98d5a']])}${radial('corona', [[0, '#ffffff'], [0.3, '#fff4cf', 0.95], [0.42, '#ffe7a3', 0.55], [0.7, '#f3c56b', 0.18], [1, '#f3c56b', 0]])}${radial('dim', [[0, '#000', 0], [1, '#000', 0.35]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(26, 41, 110)}
    ${rays(318, 52, 20, 92, '#fff3cf', 0.07, 'spin slow')}<circle class="corona" cx="318" cy="52" r="58" fill="url(#corona)"/>
    <circle cx="318" cy="52" r="21" fill="#fffbe9" opacity=".95"/><circle cx="317" cy="52" r="20" fill="#05070f"/>
    <circle class="bead" cx="301" cy="45" r="2.4" fill="#fffef5"/>
    ${cloud(80, 50, 1, '#3a4266', 0.75, 'drift')}${cloud(200, 34, 0.7, '#3a4266', 0.6, 'drift slow')}
    ${hills(160, 30, 4, '#3d5a3a', 3)}${hills(182, 22, 5, '#2f4a2c', 8)}${hills(204, 14, 6, '#223a20', 12)}
    <rect width="${W}" height="${H}" fill="url(#dim)"/>`,
  Shore: () => `<defs>${sky('sk', [[0, '#5aa7e0'], [0.55, '#bfe3f5'], [0.56, '#3d8fc2'], [1, '#1d5f8f']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/><circle cx="70" cy="44" r="18" fill="#fff3c4" opacity=".9"/>
    ${cloud(260, 40, 0.9, '#fff', 0.8, 'drift')}
    ${[0, 1, 2, 3].map(i => `<path class="wave w${i}" d="M-40 ${132 + i * 16} ${Array.from({ length: 12 }, (_, k) => `q 10 -6 20 0 t 20 0`).join(' ')}" stroke="#e8f6ff" stroke-opacity="${0.55 - i * 0.1}" stroke-width="1.6" fill="none"/>`).join('')}
    <path d="M0 196 Q 120 180 240 192 T 400 186 L400 220 L0 220 Z" fill="#e9d29a"/><path class="foam" d="M0 196 Q 120 180 240 192 T 400 186" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
    <path d="M0 206 Q 160 198 400 208 L400 220 L0 220 Z" fill="#d8bd7f"/>`,
  Forest: () => { const r = rng(21); let back = '', mid = '', front = '';
    for (let x = -10; x < W + 10; x += 16) back += pine(x + r() * 8, 150 + r() * 8, 60 + r() * 30, '#2f5a43');
    for (let x = -10; x < W + 10; x += 24) mid += pine(x + r() * 12, 182 + r() * 6, 80 + r() * 36, '#1f4430');
    for (let x = -20; x < W + 20; x += 46) front += pine(x + r() * 20, 226, 110 + r() * 40, '#11291c');
    return `<defs>${sky('sk', [[0, '#a9d3b0'], [0.5, '#6fa585'], [1, '#2a5240']])}${sky('beam', [[0, '#fff8d0'], [1, '#fff8d0']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${back}<g class="beams" opacity=".14"><path d="M120 0 L160 0 L250 220 L180 220 Z" fill="#fffbe0"/><path d="M230 0 L250 0 L330 220 L290 220 Z" fill="#fffbe0"/></g>${mid}
    <rect y="196" width="${W}" height="24" fill="#183b29"/>${front}${embers(14, 5, '#e6ffb0', 'firefly')}`; },
  Burning: () => `<defs>${sky('sk', [[0, '#2a0b07'], [0.55, '#7a1f0c'], [1, '#e2561a']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${buildings(196, 9, '#1c0907', null, 30, 90, 18, 40, 0)}
    <g class="smoke">${cloud(90, 60, 1.6, '#2b1410', 0.55)}${cloud(260, 46, 1.9, '#2b1410', 0.5)}</g>
    ${flames(214, 70, 9, 4, ['#b8270c', '#f0631c', '#ffb43a'])}${embers(28, 11, '#ffcf6b')}`,
  City: () => `<defs>${sky('sk', [[0, '#1b2b55'], [0.55, '#7a5a9a'], [1, '#f2a46e']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(26, 4, 70)}<circle cx="330" cy="40" r="12" fill="#fff1d6" opacity=".85"/>
    ${buildings(200, 31, '#3a3560', '#ffe7a3', 40, 110, 20, 38, 0.18)}${buildings(214, 77, '#1d1a36', '#ffd98a', 30, 80, 26, 50, 0.32)}
    <rect y="212" width="${W}" height="8" fill="#110f22"/>`,
  'Imaginary Space': () => { const r = rng(55); let shapes = '';
    for (let i = 0; i < 9; i++) { const x = r() * W, y = 30 + r() * 140, s = 8 + r() * 18; shapes += `<g class="floaty" style="animation-delay:${(-r() * 6).toFixed(2)}s;transform-origin:${x.toFixed(0)}px ${y.toFixed(0)}px"><path d="M${x} ${y - s} L${x + s * 0.8} ${y} L${x} ${y + s} L${x - s * 0.8} ${y} Z" fill="none" stroke="${r() < 0.5 ? '#8ff0ff' : '#e0a8ff'}" stroke-width="1.2" opacity=".75"/></g>`; }
    let grid = ''; for (let i = -10; i <= 10; i++) grid += `<line x1="${200 + i * 14}" y1="140" x2="${200 + i * 60}" y2="220" stroke="#8ff0ff" stroke-opacity=".28"/>`;
    for (let k = 0; k < 6; k++) { const y = 140 + Math.pow(k / 5, 1.8) * 80; grid += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="#8ff0ff" stroke-opacity=".22"/>`; }
    return `<defs>${sky('sk', [[0, '#090322'], [0.5, '#2b0d58'], [1, '#0f2f5a']])}${radial('rift', [[0, '#f4d6ff', 0.9], [0.4, '#a46cff', 0.45], [1, '#2b0d58', 0]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(60, 8, 150)}<ellipse class="pulse" cx="200" cy="86" rx="120" ry="60" fill="url(#rift)"/>${grid}${shapes}`; },
  Air: () => `<defs>${sky('sk', [[0, '#2f7fd0'], [0.6, '#8cc6f0'], [1, '#e4f3fd']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>
    ${cloud(60, 60, 1.3, '#fff', 0.9, 'drift')}${cloud(240, 40, 1.0, '#fff', 0.8, 'drift slow')}${cloud(340, 96, 1.5, '#fff', 0.85, 'drift')}${cloud(140, 120, 1.2, '#f4faff', 0.8, 'drift slow')}
    <g class="wind" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" fill="none"><path d="M20 90 q 40 -10 80 0 t 60 -6"/><path d="M180 150 q 50 -12 100 0 t 70 -4"/><path d="M60 180 q 40 -8 90 0"/></g>
    <g class="birds" fill="none" stroke="#2a3d55" stroke-width="1.3"><path d="M120 70 q 5 -5 10 0 q 5 -5 10 0"/><path d="M150 60 q 4 -4 8 0 q 4 -4 8 0"/><path d="M136 84 q 4 -4 8 0 q 4 -4 8 0"/></g>
    ${cloud(80, 214, 3, '#fff', 0.95)}${cloud(260, 220, 3.4, '#fff', 0.95)}${cloud(400, 210, 2.6, '#fff', 0.95)}`,
  Darkness: () => `<defs>${sky('sk', [[0, '#04050c'], [0.7, '#141a30'], [1, '#232a40']])}${radial('moon', [[0, '#e6ecff', 0.55], [1, '#e6ecff', 0]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(70, 12, 160)}<circle cx="300" cy="56" r="46" fill="url(#moon)"/><circle cx="300" cy="56" r="16" fill="#e8eeff"/><circle cx="307" cy="51" r="14" fill="#0b0e1c"/>
    ${hills(178, 26, 4, '#0b0d18', 6)}<g class="mist">${cloud(90, 196, 2.6, '#6c7aa8', 0.22)}${cloud(300, 200, 2.8, '#6c7aa8', 0.2)}</g>${hills(206, 12, 6, '#06070f', 15)}`,
  Heaven: () => `<defs>${sky('sk', [[0, '#fff6dc'], [0.5, '#fde9b6'], [1, '#f6f2ff']])}${radial('halo', [[0, '#fffef4'], [0.5, '#fff3c0', 0.6], [1, '#fff3c0', 0]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${rays(200, -20, 18, 300, '#fff', 0.35, 'spin slow')}<circle cx="200" cy="-10" r="110" fill="url(#halo)"/>
    <g fill="none" stroke="#e7c76a" stroke-width="1.5" opacity=".7"><path d="M150 120 L150 190 M174 120 L174 190 M226 120 L226 190 M250 120 L250 190"/><path d="M140 118 L260 118" stroke-width="3"/></g>
    ${cloud(40, 190, 2.4, '#fff', 1, 'drift slow')}${cloud(200, 206, 3.2, '#fff', 1)}${cloud(370, 192, 2.4, '#fff', 1, 'drift slow')}${embers(16, 3, '#fff7c8', 'mote')}`,
  Hell: () => { const r = rng(66); let spikes = '';
    // jagged rock crags: a wide base with several broken peaks, rim-lit by the lava
    for (let x = -20; x < W; x += 50 + r() * 40) {
      const w = 60 + r() * 50, h = 50 + r() * 70; let d = `M${x} 202`; const n = 4 + Math.floor(r() * 3);
      for (let i = 1; i < n; i++) { const px = x + (w * i) / n + (r() - 0.5) * 8; const peak = i === Math.ceil(n / 2) ? h : h * (0.35 + r() * 0.5); d += ` L${(px - w / n * 0.3).toFixed(1)} ${(202 - peak * 0.75).toFixed(1)} L${px.toFixed(1)} ${(202 - peak).toFixed(1)}`; }
      d += ` L${x + w} 202 Z`;
      spikes += `<path d="${d}" fill="#170406" stroke="#ff5a2a" stroke-opacity=".35" stroke-width="1"/>`;
    }
    return `<defs>${sky('sk', [[0, '#050002'], [0.6, '#3a0410'], [1, '#8a0e14']])}${sky('lava', [[0, '#ffb13b'], [1, '#d6270f']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/><g class="pulse"><ellipse cx="200" cy="200" rx="260" ry="50" fill="#ff3b1f" opacity=".25"/></g>${spikes}
    <path d="M0 200 Q 100 192 200 202 T 400 198 L400 220 L0 220 Z" fill="url(#lava)" class="flicker f0"/><path d="M0 210 Q 120 204 260 212 T 400 210 L400 220 L0 220 Z" fill="#2a0508"/>${embers(30, 19, '#ff7a3b')}`; },

  // Skill/NP-created fields
  Halloween: () => { const r = rng(1031);
    const lantern = (x, y, sc) => `<g transform="translate(${x} ${y}) scale(${sc})"><ellipse cx="0" cy="0" rx="16" ry="12" fill="#e8741c"/><ellipse cx="-7" cy="0" rx="6" ry="11.5" fill="#d2610f" opacity=".7"/><ellipse cx="7" cy="0" rx="6" ry="11.5" fill="#d2610f" opacity=".7"/><path d="M-1 -12 q 1 -6 5 -7" stroke="#3d5a1e" stroke-width="2.4" fill="none"/>
      <g class="glow" fill="#ffe27a"><path d="M-9 -4 l4 -4 l3 5 Z"/><path d="M9 -4 l-4 -4 l-3 5 Z"/><path d="M-9 4 q 9 7 18 0 l-3 -1 l-2 3 l-2 -3 l-2 3 l-2 -3 l-2 3 l-2 -3 Z"/></g></g>`;
    const bat = (x, y, s, d) => `<g class="bat" style="animation-delay:${d}s;transform-origin:${x}px ${y}px"><path d="M${x} ${y} q ${-4 * s} ${-5 * s} ${-10 * s} ${-3 * s} q ${3 * s} ${2 * s} ${2 * s} ${5 * s} q ${4 * s} ${-2 * s} ${8 * s} ${-2 * s} q ${4 * s} 0 ${8 * s} ${2 * s} q ${-1 * s} ${-3 * s} ${2 * s} ${-5 * s} q ${-6 * s} ${-2 * s} ${-10 * s} ${3 * s} Z" fill="#1a0b26"/></g>`;
    let candy = ''; for (let i = 0; i < 10; i++) { const x = r() * W, y = 30 + r() * 120; candy += `<g class="mote" style="animation-delay:${(-r() * 8).toFixed(2)}s"><circle cx="${x.toFixed(0)}" cy="${(y + 90).toFixed(0)}" r="2.2" fill="${['#ff9de2', '#9df7ff', '#fff59d', '#c4ff9d'][i % 4]}"/></g>`; }
    return `<defs>${sky('sk', [[0, '#1b0730'], [0.55, '#4a1460'], [1, '#c2541c']])}${radial('moon', [[0, '#fff1c2'], [0.6, '#ffbe5c'], [0.75, '#ff9a3c', 0.5], [1, '#ff9a3c', 0]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(30, 77, 100)}
    <circle class="pulse" cx="268" cy="62" r="58" fill="url(#moon)"/><circle cx="268" cy="62" r="34" fill="#ffd27a"/><circle cx="258" cy="54" r="5" fill="#f2b552" opacity=".7"/><circle cx="278" cy="72" r="7" fill="#f2b552" opacity=".6"/>
    <g transform="translate(64 0)"><path d="M30 170 L30 112 L22 112 L36 84 L50 112 L42 112 L42 126 L70 126 L70 98 L62 98 L78 64 L94 98 L86 98 L86 126 L112 126 L112 108 L104 108 L118 86 L132 108 L124 108 L124 170 Z" fill="#14061f"/>
    <rect x="74" y="104" width="6" height="9" fill="#ffcf5a" class="blink"/><rect x="40" y="132" width="5" height="8" fill="#ffcf5a"/><rect x="108" y="136" width="5" height="8" fill="#ffcf5a" class="blink" style="animation-delay:1.3s"/></g>
    ${bat(220, 46, 1.4, 0)}${bat(250, 72, 1, -1.5)}${bat(176, 88, 1.2, -3)}${bat(310, 120, 0.9, -2.2)}
    ${hills(178, 16, 4, '#1d0a28', 41)}<path d="M0 220 L0 192 Q 100 182 200 194 T 400 188 L400 220 Z" fill="#12061a"/>
    ${lantern(112, 196, 1.1)}${lantern(176, 204, 0.8)}${lantern(236, 196, 1.25)}${lantern(300, 204, 0.9)}${candy}`; },

  // Archetype: Earth's Marble Phantasm: the Millennium Castle under a giant full moon
  'Millennium Castle': () => { const r = rng(2829);
    const spire = (x, base, w, h, fill) => `<rect x="${x - w / 2}" y="${base - h}" width="${w}" height="${h}" fill="${fill}"/><path d="M${x - w / 2 - 2} ${base - h} L${x} ${base - h - w * 2.4} L${x + w / 2 + 2} ${base - h} Z" fill="${fill}"/>`;
    let back = '', front = '', wins = '';
    for (let i = 0; i < 9; i++) { const x = 70 + i * 32 + (r() - .5) * 10, h = 40 + r() * 50; back += spire(x, 170, 10 + r() * 8, h, '#4b5578'); }
    const towers = [[200, 22, 112], [158, 16, 82], [242, 16, 82], [126, 12, 60], [274, 12, 60], [104, 10, 44], [296, 10, 44]];
    for (const [x, w, h] of towers) { front += spire(x, 178, w, h, '#d9dcef'); front += `<rect x="${x - w / 2}" y="${178 - h}" width="${w * 0.28}" height="${h}" fill="#aeb4d6"/>`;
      for (let y = 178 - h + 10; y < 170; y += 14) if (r() < .7) wins += `<rect class="${r() < .3 ? 'blink' : ''}" style="animation-delay:${(r() * 4).toFixed(1)}s" x="${x - 1.6}" y="${y}" width="3.2" height="6" rx="1.6" fill="#ffd36e"/>`; }
    front += `<path d="M90 178 L310 178 L310 150 ${Array.from({ length: 22 }, (_, k) => `L${310 - k * 10} ${k % 2 ? 150 : 145} L${300 - k * 10} ${k % 2 ? 145 : 150}`).join(' ')} L90 150 Z" fill="#c7cbe4"/>`;
    front += `<path d="M186 178 L186 162 Q200 148 214 162 L214 178 Z" fill="#2a2246"/>`;
    let petals = ''; for (let i = 0; i < 14; i++) petals += `<ellipse class="mote" style="animation-delay:${(-r() * 9).toFixed(2)}s" cx="${(r() * W).toFixed(0)}" cy="${(150 + r() * 70).toFixed(0)}" rx="2.4" ry="1.2" fill="${r() < .5 ? '#ffe7f0' : '#fff6d4'}" opacity=".85"/>`;
    return `<defs>${sky('sk', [[0, '#05051a'], [0.5, '#1d1846'], [1, '#4a2f5e']])}${radial('mc', [[0, '#fffdf2'], [0.62, '#fff2cc'], [0.7, '#f7d9a8', 0.55], [1, '#e7a7c4', 0]])}${sky('lake', [[0, '#2a2552'], [1, '#0d0b22']])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(70, 351, 120)}
    <circle class="pulse" cx="200" cy="82" r="118" fill="url(#mc)"/><circle cx="200" cy="82" r="72" fill="#fff8e6"/>
    <circle cx="176" cy="66" r="10" fill="#f1e6c8" opacity=".6"/><circle cx="222" cy="98" r="14" fill="#f1e6c8" opacity=".5"/><circle cx="214" cy="58" r="6" fill="#f1e6c8" opacity=".5"/>
    ${back}${front}${wins}
    <rect y="178" width="${W}" height="42" fill="url(#lake)"/>
    <g opacity=".18" transform="translate(0 356) scale(1 -1)">${front}</g><ellipse cx="200" cy="196" rx="60" ry="5" fill="#fff8e6" opacity=".35"/>
    <path d="M0 214 Q 120 206 200 212 T 400 210 L400 220 L0 220 Z" fill="#0a0818"/>${petals}`; },
};

// Any field without a hand-made scene (a new one added by a future servant) still gets its own look:
// a palette and landscape seeded from the field's name.
function fallbackScene(name) {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = rng(h), hue = Math.floor(r() * 360), hsl = (dh, s, l) => `hsl(${(hue + dh) % 360} ${s}% ${l}%)`;
  return `<defs>${sky('sk', [[0, hsl(0, 45, 14)], [0.6, hsl(20, 50, 32)], [1, hsl(40, 60, 55)]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>${stars(30, h, 110)}<circle class="pulse" cx="${80 + r() * 240}" cy="${40 + r() * 30}" r="${18 + r() * 14}" fill="${hsl(40, 80, 80)}" opacity=".75"/>
    ${hills(160, 30, 4, hsl(200, 30, 26), h + 1)}${hills(188, 20, 5, hsl(210, 32, 17), h + 2)}${hills(210, 10, 6, hsl(220, 36, 10), h + 3)}${embers(16, h + 4, hsl(40, 90, 75), 'mote')}`;
}
let uid = 0;
function sceneSVG(field) {
  const f = SCENES[field] || (field ? () => fallbackScene(field) : null); if (!f) return '';
  // Two scenes are on screen during a crossfade, so gradient ids get a unique prefix.
  const k = 'sc' + (++uid) + '-';
  const body = f().replace(/id="([\w-]+)"/g, (_, n) => `id="${k}${n}"`).replace(/url\(#([\w-]+)\)/g, (_, n) => `url(#${k}${n})`);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
root.Scenes = { sceneSVG, FIELDS: Object.keys(SCENES), has: f => !!SCENES[f] };
if (typeof module !== 'undefined') module.exports = root.Scenes;
})(typeof window !== 'undefined' ? window : globalThis);
