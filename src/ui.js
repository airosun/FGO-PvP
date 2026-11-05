// UI for the FGO PvP battler: hot-seat on one device, or online rooms when served with socket.io (see the Online section).
(function () {
'use strict';
const E = window.Engine;
const R = {}; for (const d of window.ROSTER) R[d.id] = d;
// Draftable servants (alternate forms like Hyde are reachable only through their skills).
const POOL = window.ROSTER.filter(d => !d.hidden);
// Draft roles (Main DPS / Sub DPS / Healer / Utility Support) read from each kit; Meta Supports are a hand-picked overlay.
const ROLE = {}; for (const d of window.ROSTER) if (window.KITS[d.id]) ROLE[d.id] = Roles.classify(window.KITS[d.id], d.id);
const ROLE_CLS = { 'Main DPS': 'r-main', 'Sub DPS': 'r-sub', Healer: 'r-heal', 'Utility Support': 'r-util' };
const isMeta = id => E.META.includes(+id);
const roleTags = d => `<span class="roletag ${ROLE_CLS[ROLE[d.id]] || ''}">${esc(ROLE[d.id] || '–')}</span>${isMeta(d.id) ? '<span class="roletag meta" data-tip="Meta Support: a team can draft only one.">Meta Support</span>' : ''}`;
const KITS = window.KITS;
// Draft filter shows only classes that someone in the roster belongs to.
const CLASSES = ['All', ...E.CLASS_LIST.filter(c => POOL.some(d => d.cls === c))];
const I = window.Icons;
const CI = c => I.classIcon(c);
const NOARROW = new Set(['trigger', 'reflect', 'deathImmune', 'bind', 'petrify', 'sleep', 'quickHitDebuff', 'ocUp', 'npOnBurnHit', 'taunt', 'evade', 'invincible', 'sureHit', 'ignoreDef', 'ignoreInv', 'allBuster', 'npToArts', 'debuffImmune', 'trait', 'buffBlock', 'ctrlImmune', 'guts', 'delayed', 'stun', 'charm', 'terror', 'skillSeal', 'npSeal', 'curse', 'burn', 'poison', 'curseOnAttack', 'busterAtkNp']);
function buffBadge(b) {
  const dir = NOARROW.has(b.s) || typeof b.v !== 'number' ? null : (b.v >= 0 ? 'up' : 'down');
  const tip = `${E.describeBuff(b)}${b.from ? ' · from ' + b.from : ''}`;
  if (b.icon) return I.badge(b.icon, { tip: esc(tip) }); // e.g. Alice's Robin substitute
  if (I.statusKey(b)) return I.badge(I.statusKey(b), { neg: !!b.debuff, tip: esc(tip) }); // e.g. Blessing of Kur, Living Flame
  return I.badge(b.s, { neg: !!b.debuff, dir: b.s.endsWith('Res') && b.debuff ? 'down' : dir, tip: esc(tip) });
}
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PN = p => (app.net && app.net.match ? app.net.match.names[p] : `Player ${p + 1}`);
// Online helpers: NET() is the running online match (null in hot-seat), SEAT() this browser's side (null = spectator).
const NET = () => (app.net && app.net.match) || null;
const SEAT = () => (NET() ? app.net.seat : null);
const isSpec = () => !!NET() && app.net.seat == null;
const leftSide = () => (NET() && app.net.seat === 1 ? 1 : 0); // your own team always sits on the left

const ONLINE = typeof window.io === 'function';
const app = {
  screen: ONLINE ? 'landing' : 'setup', net: null,
  draft: null, lineup: null, g: null, opts: { seals: true },
  ui: { stage: null, cover: null, targeting: null, target: [null, null], sel: [], focus: null, logFrom: 0, revealFrom: 0 },
  lastTeams: null,
};
window.__app = app; // handy for debugging in the console
window.__render = () => render();
window.__test = { get startBattle() { return startBattle; }, get lockCards() { return lockCards; }, get randomChoice() { return randomChoice; }, get POOL() { return POOL; }, get R() { return R; } };

// ---------------------------------------------------------------- Setup
function startDraft(first0) {
  const first = first0 != null ? first0 : Math.random() < 0.5 ? 0 : 1;
  app.browse = null;
  app.draft = { first, order: E.snakeOrder(first), i: 0, teams: [[], []], taken: new Set(), filter: 'All', rar: 'All', role: 'All', focus: null, search: '', mode: 'servant', modeMenu: false };
  app.screen = 'draft';
  render();
}
// Random picks always leave a team able to finish with two 5★ servants: picks that would make that impossible
// are skipped, and once the slots left equal the 5★s still needed, only 5★s are offered.
function randomChoice(team, taken) {
  const opts = POOL.filter(d => E.canPick(team, d.id, taken, R).ok);
  if (!opts.length) return null;
  const want = E.CFG.max5;
  const need = Math.max(0, want - team.filter(id => R[id].rar === 5).length);
  const left = E.CFG.picks - team.length;
  const cost = E.teamCost(team, R);
  const fits = d => {
    const need2 = Math.max(0, need - (d.rar === 5 ? 1 : 0)), left2 = left - 1;
    if (need2 > left2) return false;
    const free = POOL.filter(x => !taken.has(x.id) && x.id !== d.id);
    const fives = free.filter(x => x.rar === 5).map(E.costOf).sort((a, b) => a - b).slice(0, need2);
    const rest = free.filter(x => x.rar !== 5).map(E.costOf).sort((a, b) => a - b).slice(0, left2 - need2);
    if (fives.length < need2) return false;
    return cost + E.costOf(d) + [...fives, ...rest].reduce((a, b) => a + b, 0) <= E.CFG.costCap;
  };
  let pool = need >= left ? opts.filter(d => d.rar === 5) : opts.filter(fits);
  if (!pool.length) pool = opts; // can't be guaranteed (e.g. earlier hand picks used the budget): best effort
  // The first picks cover each role once (Main DPS, Sub DPS, Healer, Utility Support); the last two slots are free.
  const missing = Roles.ROLES.filter(r => !team.some(id => ROLE[id] === r));
  if (missing.length) {
    const fill = pool.filter(d => missing.includes(ROLE[d.id]));
    if (fill.length) pool = fill;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function quickStart() {
  app.fields = randomFields();
  const taken = new Set(), teams = [[], []];
  for (const p of E.snakeOrder(0)) {
    const pick = randomChoice(teams[p], taken);
    teams[p].push(pick.id); taken.add(pick.id);
  }
  startBattle(teams);
}

// ---------------------------------------------------------------- Draft
function draftPick(id) {
  const D = app.draft; const p = D.order[D.i];
  if (!E.canPick(D.teams[p], id, D.taken, R).ok) return;
  if (NET()) { if (SEAT() !== p) return; D.focus = null; netSend('act', { t: 'pick', id }); return render(); }
  applyPick(p, id);
}
function applyPick(p, id, instant) {
  const D = app.draft;
  D.teams[p].push(id); D.taken.add(id); D.i += 1; if (D.focus === id) D.focus = null;
  if (D.i >= D.order.length) return startFieldPick(D.teams, instant);
  if (!instant) { render(); autoPickSoon(); }
}
function randomPick() {
  const D = app.draft; const p = D.order[D.i];
  if (NET() && SEAT() !== p) return;
  const pick = randomChoice(D.teams[p], D.taken);
  if (pick) draftPick(pick.id);
}
// Online "randomize the rest" fills only your own remaining picks, one at a time as your turns come up.
function autoPickSoon() {
  const D = app.draft; if (!NET() || !D || !D.auto || D.i >= D.order.length || D.order[D.i] !== SEAT()) return;
  setTimeout(() => { if (app.draft === D && D.order[D.i] === SEAT()) randomPick(); }, 450);
}
function randomizeRest() {
  const D = app.draft;
  if (NET()) { D.auto = true; render(); return autoPickSoon(); }
  while (D.i < D.order.length) {
    const p = D.order[D.i];
    const pick = randomChoice(D.teams[p], D.taken);
    if (!pick) break;
    const id = pick.id;
    D.teams[p].push(id); D.taken.add(id); D.i += 1;
  }
  D.focus = null;
  startFieldPick(D.teams);
}
function renderDraft() {
  const D = app.draft; const p = D.order[D.i];
  const ribbon = D.order.map((x, i) => `<span class="rib p${x}${i === D.i ? ' now' : ''}${i < D.i ? ' done' : ''}" title="Pick ${i + 1}: ${PN(x)}">${x + 1}</span>`).join('');
  const team = q => {
    const ids = D.teams[q]; const cost = E.teamCost(ids, R); const fives = ids.filter(id => R[id].rar === 5).length;
    return `<section class="teambox p${q}${q === p ? ' active' : ''}"><header><h3>${esc(PN(q))}${NET() && SEAT() === q ? ' <small class="you">You</small>' : ''}</h3><span class="meta">5★ ${fives}/${E.CFG.max5}</span></header>
      <div class="costbar" title="Team cost ${cost} of ${E.CFG.costCap}"><span style="width:${Math.min(100, cost / E.CFG.costCap * 100)}%"></span><b>${cost}<small>/${E.CFG.costCap}</small></b></div>
      <ol class="picks">${ids.map((id, k) => `<li class="r${R[id].rar}" data-act="focus" data-id="${id}"><span class="pk">${k + 1}</span>${CI(R[id].cls)}<span class="pn">${esc(R[id].name)}<small><span class="rdot ${ROLE_CLS[ROLE[id]] || ''}"></span>${esc(ROLE[id] || '')}</small></span><span class="r"><span class="pstars">${'★'.repeat(R[id].rar)}</span>${E.costOf(R[id])}</span></li>`).join('')}
      ${Array.from({ length: 6 - ids.length }, (_, k) => `<li class="empty"><span class="pk">${ids.length + k + 1}</span>Open slot</li>`).join('')}</ol></section>`;
  };
  const f = D.focus ? R[D.focus] : null;
  const chk = f ? E.canPick(D.teams[p], f.id, D.taken, R) : null;
  return `<div class="draft">
    <div class="draft-head"><div><p class="eyebrow">Snake draft · pick ${D.i + 1} of 12</p><h2>${NET() && SEAT() === p ? 'Your pick' : `${esc(PN(p))} is picking`}</h2></div><div class="draft-actions"><div class="ribbon">${ribbon}</div><div class="row"><button class="chartbtn" data-act="aff-chart">Class chart</button>${!NET() ? `<button data-act="random-pick">Random pick for ${esc(PN(p))}</button><button data-act="random-rest">Randomize the rest</button>` : SEAT() == null ? '' : `${SEAT() === p ? '<button data-act="random-pick">Random pick</button>' : ''}<button data-act="random-rest" ${D.auto ? 'disabled' : ''}>${D.auto ? 'Auto-picking your remaining slots' : 'Randomize my remaining picks'}</button>`}</div></div></div>
    <div class="draft-grid">
      <div class="teams">${team(leftSide())}${team(1 - leftSide())}</div>
      ${renderPool(D, D.teams[p])}
      </div>
    </div>${f ? modal(servantDetail(f), `<button data-act="close-detail">Back</button>${NET() && SEAT() !== p ? '' : `<button class="primary" data-act="pick" data-id="${f.id}" ${chk.ok ? '' : 'disabled'}>${chk.ok ? `Pick ${esc(f.name)}${NET() ? '' : ` for ${esc(PN(p))}`}` : esc(chk.why)}</button>`}`, 'close-detail', f.name) : ''}${app.affChart ? affChart() : ''}</div>`;
}
// Servant list with search and filters: the draft pool, and the lobby's "Browse servants" view (team = null).
function renderPool(S, team) {
  const mode = S.mode || 'servant';
  const roleOk = d => !S.role || S.role === 'All' || (S.role === 'Meta Support' ? isMeta(d.id) : ROLE[d.id] === S.role);
  const list = POOL.filter(d => (S.filter === 'All' || d.cls === S.filter) && (S.rar === 'All' || d.rar === +S.rar) && roleOk(d) && searchMatch(d, S.search, mode));
  const tiles = list.map(d => {
    const taken = S.taken.has(d.id);
    const chk = team ? E.canPick(team, d.id, S.taken, R) : { ok: true };
    return `<button class="tile r${d.rar} c-${clsKey(d.cls)}${isMeta(d.id) ? ' meta' : ''}${taken ? ' taken' : ''}${!taken && !chk.ok ? ' blocked' : ''}${S.focus === d.id ? ' focus' : ''}" data-act="focus" data-id="${d.id}" ${taken ? 'disabled' : ''}>
      <span class="ttop">${CI(d.cls)}<span class="tstars">${d.rar ? '★'.repeat(d.rar) : '0★'}</span><span class="cost" title="Cost">${E.costOf(d)}</span></span>
      <span class="tname">${esc(d.name)}</span>
      <span class="tdeck">${deckChips(d.deck)}<span class="npc ${d.np[0]}" title="NP card">${d.np[0]}</span></span><span class="trole"><span class="rdot ${ROLE_CLS[ROLE[d.id]] || ''}"></span>${esc(ROLE[d.id] || '')}${isMeta(d.id) ? '<span class="mtag">Meta</span>' : ''}</span>${S.search && mode !== 'servant' ? `<span class="tmatch">${esc((searchHits(d, S.search, mode) || []).slice(0, 3).join(' · '))}</span>` : ''}</button>`;
  }).join('');
  return `<div class="pool">
        <div class="dsearch"><div class="dmode"><button class="dmodebtn" data-act="search-mode-menu" aria-haspopup="true" aria-expanded="${!!S.modeMenu}">${esc(SEARCH_MODES.find(m => m.k === mode).label)} <span aria-hidden="true">▾</span></button>${S.modeMenu ? `<div class="dmenu" role="menu">${SEARCH_MODES.map(m => `<button role="menuitemradio" aria-checked="${m.k === mode}" class="${m.k === mode ? 'on' : ''}" data-act="search-mode" data-m="${m.k}">${esc(m.label)}</button>`).join('')}</div>` : ''}</div><input type="search" id="draftSearch" placeholder="${esc(SEARCH_MODES.find(m => m.k === mode).ph)}" value="${esc(S.search)}" aria-label="Search ${esc(SEARCH_MODES.find(m => m.k === mode).label)}" autocomplete="off">${S.search ? '<button class="dclear" data-act="search-clear" aria-label="Clear search">✕</button>' : ''}<span class="dcount">${list.length} shown</span></div>
        <div class="filters">${CLASSES.map(c => `<button class="chip${S.filter === c ? ' on' : ''}" data-act="filter" data-c="${c}">${c === 'All' ? 'All classes' : CI(c) + c}</button>`).join('')}</div>
        <div class="filters">${['All', 5, 4, 3, 2, 1, 0].filter(r => r === 'All' || POOL.some(d => d.rar === r)).map(r => `<button class="chip${String(S.rar) === String(r) ? ' on' : ''}" data-act="rar" data-r="${r}">${r === 'All' ? 'All rarities' : r === 0 ? '0★' : '★'.repeat(r)}</button>`).join('')}</div>
        <div class="filters">${['All', ...Roles.ROLES, 'Meta Support'].map(r => `<button class="chip${r === 'Meta Support' ? ' metachip' : ''}${(S.role || 'All') === r ? ' on' : ''}" data-act="role" data-r="${esc(r)}">${r === 'All' ? 'All roles' : esc(r)}${r === 'Meta Support' ? ' (max 1)' : ''}</button>`).join('')}</div>
        <div class="tiles">${tiles || `<p class="hint">No servants match${S.search ? ` “${esc(S.search)}”` : ''} with these filters.</p>`}</div>
      </div>`;
}
const clsKey = c => String(c).toLowerCase().replace(/[^a-z]/g, '');
// The servant list being filtered right now: the lobby browser when it's open, otherwise the draft.
const PS = () => (app.browse && app.screen !== 'draft' ? app.browse : app.draft);
// ---- Draft search: names first, then NP/skill names and traits. Ignores case and accents ("anra" finds Aŋra).
const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ŋ/g, 'n').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
const SEARCH_MODES = [
  { k: 'servant', label: 'Servants', ph: 'Search servant names' },
  { k: 'np', label: 'NPs', ph: 'Search NP names and effects (e.g. "stun", "excalibur")' },
  { k: 'skill', label: 'Skills', ph: 'Search skill names and effects (e.g. "taunt", "charisma")' },
  { k: 'trait', label: 'Traits', ph: 'Search traits (e.g. "dragon", "king", "female")' },
];
const SEARCH_IX = {};
function searchIndex(d) {
  if (!SEARCH_IX[d.id]) {
    const k = KITS[d.id] || { sk: [] };
    const traits = [...new Set([...(d.traits || []), d.gender, d.attr, ...(d.align || '').split(' ')].filter(Boolean))];
    SEARCH_IX[d.id] = {
      servant: [{ label: d.name, txt: fold(d.name) }],
      np: k.np && !k.np.noNP ? [{ label: k.np.n, txt: fold(k.np.n + ' ' + d.np + ' ' + Describe.npText(k, d)) }] : [],
      skill: k.sk.map((sk, i) => ({ label: sk.n, txt: fold(Describe.skillText(k, i)) })),
      trait: traits.map(t => ({ label: t, txt: fold(t) })),
    };
  }
  return SEARCH_IX[d.id];
}
// In a mode, every word typed has to start a word in the same entry (one NP, one skill, one trait; traits may be split
// across several). Returns the labels that matched, or null.
function searchHits(d, q, mode) {
  const words = fold(q).split(' ').filter(Boolean); if (!words.length) return [];
  const has = (txt, w) => (' ' + txt).includes(' ' + w);
  const entries = searchIndex(d)[mode] || [];
  const whole = entries.filter(e => words.every(w => has(e.txt, w)));
  if (whole.length) return whole.map(e => e.label);
  if (mode === 'trait') { const per = words.map(w => entries.filter(e => has(e.txt, w))); if (per.every(x => x.length)) return [...new Set(per.flat().map(e => e.label))]; }
  return null;
}
function searchMatch(d, q, mode = 'servant') { return !fold(q) || searchHits(d, q, mode) !== null; }
function hitChips(d) {
  const h = d.hits || {}; const npCol = { Buster: 'B', Arts: 'A', Quick: 'Q' }[d.np] || '';
  const chip = (cls, label, n, tip) => `<span class="hitchip ${cls}" title="${esc(tip)}"><b>${label}</b>${n}</span>`;
  return chip('Q', 'Q', h.Q ?? '–', `Quick: ${h.Q} hits`) + chip('A', 'A', h.A ?? '–', `Arts: ${h.A} hits`) + chip('B', 'B', h.B ?? '–', `Buster: ${h.B} hits`)
    + chip('EX', 'EX', h.EX ?? '–', `Extra Attack: ${h.EX} hits`) + chip('NP ' + npCol, 'NP', h.NP ? h.NP : '–', h.NP ? `Noble Phantasm: ${h.NP} hits` : 'This NP deals no damage');
}
function deckChips(deck) { return deck.split('').map(c => `<i class="dk ${c}">${c}</i>`).join(''); }
// Kit descriptions come from describe.js: plain language, the numbers used in this game.
function kitLines(ls) {
  return `<ul class="klines">${ls.map(l => { const [main, ...meta] = l.text.split(' · ');
    return `<li><span class="kw">${esc(main)}</span>${meta.length ? `<span class="km">${meta.map(esc).join(' · ')}</span>` : ''}${l.sub ? kitLines(l.sub) : ''}</li>`; }).join('')}</ul>`;
}
function kitHtml(d) {
  const kit = KITS[d.id]; const K = Describe.describeKit(kit, d);
  const n = K.np;
  const npCol = { Buster: 'B', Arts: 'A', Quick: 'Q' }[d.np] || '';
  const npHtml = n.none ? `<div class="kcard np"><div class="khead"><b>${esc(n.name)}</b></div>${kitLines(n.lines)}</div>`
    : `<div class="kcard np ${npCol}"><div class="khead"><b>${esc(n.name)}</b><span class="kpill ${npCol}">${esc(d.np)}</span><span class="kpill">${esc(n.target)}</span><span class="kpill">NP${E.npLevel({ d })}</span></div>
      ${kitLines(n.lines)}${n.oc.length ? `<p class="koc">Overcharge${n.ocNote ? ' <small>(grows with overcharge level)</small>' : ''}</p>${kitLines(n.oc)}` : ''}</div>`;
  const skills = K.skills.map(sk => `<div class="kcard"><div class="khead">${I.skillIcon(kit.sk[K.skills.indexOf(sk)])}<b>${esc(sk.name)}</b><span class="kpill">CD ${sk.cd}</span></div>${kitLines(sk.lines)}${sk.ranks.map((r, k) => `<p class="koc">Rank Up ${k + 1}</p>${kitLines(r)}`).join('')}</div>`).join('');
  return `<h4>Noble Phantasm</h4>${npHtml}<h4>Skills</h4><div class="kskills">${skills}</div><h4>Passives</h4>${K.passives.length ? `<div class="kcard pas">${kitLines(K.passives)}</div>` : '<p class="hint">None.</p>'}`;
}
// Centered pop-up used for servant info (draft and battle). Clicking the backdrop or the X closes it.
// Class affinity chart in battle: the same chart as on the setup screen, in a modal.
function affChart() { return modal(`<h3>Class affinity</h3>${affinityChart()}`, '', 'close-aff-chart', 'Class affinity chart'); }
function modal(body, foot, closeAct, label) {
  return `<div class="modal-back" data-act="${closeAct}"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}" data-act="noop">
    <button class="modal-x" data-act="${closeAct}" aria-label="Close">✕</button><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
}
function skillTip(x, i) { return Describe.skillText(x.kit, i); }
function servantDetail(d) {
  return `<div class="sdetail"><p class="eyebrow">${d.cls} · ${'★'.repeat(d.rar)} · cost ${E.costOf(d)}</p><h3>${esc(d.name)}${d.traits.includes('Super Giant') ? ' <span class="sgtag" data-tip="Super Giant: some effects check for this (Kingprotea, Habetrot, Barghest and others).">Super Giant</span>' : ''}</h3>
    <dl class="stats"><div><dt>ATK</dt><dd>${d.atk}</dd></div><div><dt>HP</dt><dd>${d.hp}</dd></div><div><dt>Deck</dt><dd>${deckChips(d.deck)}</dd></div><div><dt>NP gain</dt><dd>${d.na}%/hit</dd></div><div><dt>Star gen</dt><dd>${d.sr ?? '–'}%</dd></div></dl>
    <div class="hitrow"><span class="hitlbl">Hits per card</span>${hitChips(d)}</div>
    <p class="roles">${roleTags(d)}</p>
    <p class="traits">${esc(d.gender)} · ${esc(d.attr)} · ${esc(d.align)}<br>${d.traits.map(esc).join(', ')}</p>
    ${kitHtml(d)}</div>`;
}

// ---------------------------------------------------------------- Lineup
function renderLineup() {
  const L = app.lineup;
  if (NET() && (isSpec() || !L || L.sent)) return waitScreen('Lineup', isSpec() ? 'The players are setting their lineups' : 'Lineup locked in', isSpec() ? 'Each player picks 3 starters and the order their reserves come in.' : `Your order: ${L.orders[L.p].map((id, k) => `${k < 3 ? 'Start' : 'Reserve'} ${k < 3 ? k + 1 : k - 2}: ${R[id].name}`).join(' · ')}`, 'lineup');
  const p = L.p; const ord = L.orders[p];
  const team = L.teams[p];
  return `<div class="lineup"><p class="eyebrow">Lineup</p><h2>${PN(p)}: set your order</h2>
    <p class="hint">Tap servants in the order you want them. The first three start on the field; the rest come in, in order, when someone falls.</p>
    <div class="lineup-grid">${team.map(id => { const k = ord.indexOf(id); return `<button class="lslot${k >= 0 ? ' set' : ''}" data-act="order" data-id="${id}"><span class="lnum">${k >= 0 ? (k < 3 ? 'Start ' + (k + 1) : 'Reserve ' + (k - 2)) : '–'}</span><span class="tname">${esc(R[id].name)}</span><span class="tmeta">${CI(R[id].cls)}${'★'.repeat(R[id].rar)}</span></button>`; }).join('')}</div>
    ${mcPicker(L, p)}
    <div class="row"><button data-act="order-reset">Reset</button><button data-act="order-random">Random order</button><button class="primary" data-act="order-done" ${ord.length === 6 ? '' : 'disabled'}>${NET() ? 'Lock in lineup' : p === 0 ? 'Done, Player 2 next' : 'Start the battle'}</button></div></div>`;
}

// ---------------------------------------------------------------- Battle
// ---------------------------------------------------------------- Battlefields
const FIELD_ICON = { Sunlight: 'sun', Shore: 'wave', Forest: 'tree', Burning: 'flame', City: 'city', 'Imaginary Space': 'sparkle', Air: 'wind', Darkness: 'moon', Heaven: 'wings', Hell: 'skull', Halloween: 'pumpkin', 'Millennium Castle': 'castle' };
const FIELD_TEXT = { Sunlight: 'Open sky under the sun.', Shore: 'By the sea, lakes or rivers.', Forest: 'Woods and wilds.', Burning: 'A field on fire.', City: 'Streets and buildings.',
  'Imaginary Space': 'The Imaginary Number Space.', Air: 'High in the sky.', Darkness: 'Lightless places.', Heaven: 'A heavenly realm.', Hell: 'The underworld.' };
function fieldChip(f, cls = '') { return `<span class="fieldchip ${cls}">${I.svg(FIELD_ICON[f] || 'sparkle')}<span>${esc(E.fieldName(f))}</span></span>`; }
function randomFields() { const F = E.FIELDS; const a = F[Math.floor(Math.random() * F.length)], b = F[Math.floor(Math.random() * F.length)]; return [a, b]; }
// Servants in this game whose kits care about the battlefield, so players can pick fields with purpose.
function fieldUsers(teams) {
  const out = [];
  for (const id of teams.flat()) {
    const k = KITS[id]; const f = new Set();
    JSON.stringify(k, (key, v) => { if (key === 'field' && Array.isArray(v)) v.forEach(x => f.add(x)); return v; });
    if (f.size) out.push({ id, fields: [...f] });
  }
  return out;
}
function startFieldPick(teams, instant) {
  app.fieldPick = { p: NET() ? (SEAT() ?? 0) : 0, picks: [[], []], teams, result: null, sent: false };
  app.screen = 'fields'; if (!instant) render();
}
function renderFields() {
  const F = app.fieldPick; const p = F.p;
  if (NET() && !F.result && (isSpec() || F.sent)) return waitScreen('Battlefields', isSpec() ? 'The players are choosing battlefields' : 'Battlefields locked in', `Each player picks 3 battlefields in secret. One of each player's picks is drawn and they alternate every 2 turns.`, 'fields');
  if (F.result) {
    return `<div class="lineup fieldpick"><p class="eyebrow">Battlefields</p><h2>The battlefield for this game</h2>
      <div class="fieldresult">${F.result.map((f, i) => `<div class="fieldcard big">${window.Scenes ? `<span class="fthumb" aria-hidden="true">${Scenes.sceneSVG(f)}</span>` : ''}<span class="fico">${I.svg(FIELD_ICON[f] || 'sparkle')}</span><b>${esc(E.fieldName(f))}</b><small>Drawn from ${PN(F.owner[i])}'s picks · turns ${i === 0 ? '1–2, 5–6, 9–10…' : '3–4, 7–8, 11–12…'}</small></div>`).join('')}</div>
      <p class="hint">The battlefield switches every 2 turns, unless a skill changes it for a while.</p>
      <div class="row">${isSpec() ? '<p class="hint">The players are setting their lineups next.</p>' : '<button class="primary" data-act="fields-done">Set lineups</button>'}</div></div>`;
  }
  const users = fieldUsers(F.teams);
  const mine = F.picks[p];
  return `<div class="lineup fieldpick"><p class="eyebrow">Battlefields · ${PN(p)}</p><h2>${PN(p)}: pick 3 battlefields</h2>
    <p class="hint">${NET() ? 'Your picks stay hidden from your opponent.' : p === 0 ? 'Player 2, look away.' : 'Player 1, look away.'} One of your 3 is drawn at random and alternates with one of your opponent's every 2 turns.</p>
    ${users.length ? `<p class="hint">Field-boosted servants in this game: ${users.map(x => `<b>${esc(R[x.id].name)}</b> (${x.fields.map(E.fieldName).join(', ')})`).join('; ')}.</p>` : '<p class="hint">No drafted servant has a field-boosted effect, so the field is flavour this game.</p>'}
    <div class="fieldgrid">${E.FIELDS.map(f => { const k = mine.indexOf(f); return `<button class="fieldcard${k >= 0 ? ' set' : ''}" data-act="field" data-f="${esc(f)}" aria-pressed="${k >= 0}">${window.Scenes ? `<span class="fthumb" aria-hidden="true">${Scenes.sceneSVG(f)}</span>` : ''}<span class="fico">${I.svg(FIELD_ICON[f] || 'sparkle')}</span><b>${esc(E.fieldName(f))}</b><small>${esc(FIELD_TEXT[f] || '')}</small>${k >= 0 ? `<span class="fnum">${k + 1}</span>` : ''}</button>`; }).join('')}</div>
    <div class="row"><button data-act="field-random">Random 3</button><button class="primary" data-act="field-done" ${mine.length === 3 ? '' : 'disabled'}>${NET() ? 'Lock in battlefields' : p === 0 ? 'Done, Player 2 next' : 'Draw the battlefields'}</button></div></div>`;
}
function finishFields() {
  const F = app.fieldPick;
  const a = F.picks[0][Math.floor(Math.random() * 3)], b = F.picks[1][Math.floor(Math.random() * 3)];
  const first = Math.random() < 0.5 ? 0 : 1;
  F.result = first === 0 ? [a, b] : [b, a]; F.owner = first === 0 ? [0, 1] : [1, 0];
  app.fields = F.result;
  render();
}
function startBattle(teams, o = {}) {
  app.lastTeams = teams.map(t => t.slice()); app.lastMcs = o.mcs || app.lastMcs || ['chaldea', 'chaldea'];
  if (!app.fields) app.fields = randomFields();
  const N = NET();
  app.g = E.newBattle(R, KITS, teams, N ? { seed: N.seed, initiative: o.initiative, seals: N.seals, fields: app.fields, mcs: o.mcs } : { initiative: Math.random() < 0.5 ? 0 : 1, seals: app.opts.seals, fields: app.fields, mcs: app.lastMcs });
  app.screen = 'battle'; app.statsOpen = false;
  app.ui = { stage: 'skills', actor: N ? SEAT() : 0, cover: null, targeting: null, target: [null, null], sel: [], focus: null, revealFrom: 0 };
  if (o.instant) return;
  return startTurnUI();
}
// Each turn opens with the tie-breaker announcement, then hands the device to Player 1.
async function startTurnUI() {
  const u = app.ui; const tok = { skip: false };
  u.stage = 'turn-start'; u.cover = null; u.targeting = null; u.sel = []; app.play = null; render();
  app.turnIntro = tok;
  await announceTiebreak(app.g.initiative, 'turn', tok);
  if (app.turnIntro === tok) { app.turnIntro = null; beginStage('skills', NET() ? SEAT() : 0); }
}
function beginStage(stage, actor) {
  const u = app.ui; u.stage = stage; u.actor = actor; u.targeting = null; u.sel = []; u.pendingSlot = null;
  if (NET()) u.cover = null;
  else if (stage === 'skills' || stage === 'cards') {
    u.cover = { title: `${PN(actor)}: ${stage === 'skills' ? 'choose skills' : 'choose cards'}`, text: `${PN(1 - actor)}, look away. Your choices stay hidden until both players lock in.`, btn: `Show ${PN(actor)}'s ${stage === 'skills' ? 'skills' : 'hand'}` };
  } else u.cover = null;
  render();
}
function lockSkills() {
  const u = app.ui;
  if (NET()) {
    const P = app.g.players[SEAT()];
    netSend('act', { t: 'skills', skillQueue: P.skillQueue, masterQueue: P.masterQueue, sealQueue: P.sealQueue });
    u.stage = 'wait'; u.waitFor = 'skills'; u.targeting = null; return render();
  }
  if (u.actor === 0) return beginStage('skills', 1);
  u.revealFrom = app.g.log.length;
  const pre = E.snap(app.g); app.g.fx = [];
  E.resolveSkills(app.g);
  const evs = app.g.fx; app.g.fx = null;
  u.stage = 'skills-reveal'; u.cover = null; play(evs, pre);
}
function selectOrderChange(out, incoming) {
  const u = app.ui, g = app.g;
  u.targeting = null;
  if (NET()) {
    u.stage = 'wait-swap'; render();
    netSend('act', { t: 'orderChange', out, in: incoming }).then(r => {
      if (r.error && app.ui.stage === 'wait-swap') { app.ui.stage = 'skills'; render(); }
    });
    return;
  }
  const pre = app.view || E.snap(g); g.fx = [];
  const result = E.activateOrderChange(g, u.actor, out, incoming);
  g.fx = null;
  if (result.ok) {
    app.view = pre; render();
    banner(`Order Change incoming: ${g.units[out].name} out, ${g.units[incoming].name} in`, u.actor);
  } else render();
}
function lockCards() {
  const u = app.ui; const g = app.g;
  if (NET()) {
    netSend('act', { t: 'cards', sel: u.sel.map(s => ({ id: s.card.id, target: s.target })) });
    u.stage = 'wait'; u.waitFor = 'cards'; u.pendingSlot = null; return render();
  }
  E.setCards(g, u.actor, u.sel.map(s => ({ ...s.card, target: s.target })));
  if (u.actor === 0) return beginStage('cards', 1);
  u.revealFrom = g.log.length;
  const pre = E.snap(g); g.fx = [];
  E.resolveCards(g);
  const evs = g.fx; g.fx = null;
  u.stage = g.over ? 'over' : 'cards-reveal'; u.cover = null; play(evs, pre);
}

// Active effects on a field servant: the same effect stacked from several sources shows once with a count, buffs
// come first and debuffs after a divider, and each shows the turns it has left. The tooltip lists every source.
function statusGroups(u) {
  const groups = new Map();
  for (const b of u.buffs) {
    if (b.passive || b.s === 'ctrlImmune') continue;
    const dir = NOARROW.has(b.s) || typeof b.v !== 'number' ? null : (b.s.endsWith('Res') && b.debuff ? 'down' : b.v >= 0 ? 'up' : 'down');
    const key = b.icon || I.statusKey(b) || b.s;
    const id = `${key}|${b.debuff ? 1 : 0}|${dir}`;
    if (!groups.has(id)) groups.set(id, { key, dir, neg: !!b.debuff, list: [], plain: !!(b.icon || I.statusKey(b)) });
    groups.get(id).list.push(b);
  }
  return [...groups.values()];
}
function groupBadge(gp) {
  const left = Math.min(...gp.list.map(b => b.t));
  const times = gp.list.reduce((a, b) => a + (b.n || 0), 0);
  const tip = gp.list.map(b => `${E.describeBuff(b)}${b.from ? ' · from ' + b.from : ''}`).join('\n');
  const badge = gp.plain ? I.badge(gp.key, { neg: gp.neg, tip: esc(tip) }) : I.badge(gp.key, { neg: gp.neg, dir: gp.dir, tip: esc(tip) });
  return `<span class="sb${gp.neg ? ' bad' : ''}">${badge}${gp.list.length > 1 ? `<i class="sbn">${gp.list.length}</i>` : ''}${Number.isFinite(left) ? `<i class="sbt">${left}</i>` : times ? `<i class="sbt">${times}×</i>` : ''}</span>`;
}
function statusChips(u, max = 14) {
  const gs = statusGroups(u); if (!gs.length) return '';
  const good = gs.filter(g => !g.neg), bad = gs.filter(g => g.neg);
  const shown = [...good, ...bad].slice(0, max); const extra = gs.length - shown.length;
  const g2 = shown.filter(g => !g.neg), b2 = shown.filter(g => g.neg);
  return g2.map(groupBadge).join('') + (g2.length && b2.length ? '<span class="sbsep" aria-hidden="true"></span>' : '') + b2.map(groupBadge).join('')
    + (extra > 0 ? `<button class="sbmore" data-act="unit" data-uid="${u.uid}" data-tip="${extra} more effect${extra > 1 ? 's' : ''}: open the servant to see everything">+${extra}</button>` : '');
}
function unitTile(u, opts) {
  const g = app.g;
  const mhp = E.maxHp(u);
  const hpPct = Math.max(0, Math.min(100, u.hp / mhp * 100));
  const chips = statusChips(u);
  const used = (u.usedSkills || []).map(i => `<span class="usedsk" data-tip="${esc(skillTip(u, i))}" tabindex="0">${I.skillIcon(u.kit.sk[i])}</span>`).join('');
  const tgt = (opts.targetable ? ' targetable' : '') + (opts.aff ? ` aff-${opts.aff.k}` : '');
  const sel = opts.selected ? ' selected' : '';
  return `<div class="unit p${u.side}${u.dead ? ' dead' : ''}${tgt}${sel}" data-act="unit" data-uid="${u.uid}" role="button" tabindex="0">
    <span class="uhead">${CI(E.effCls(u))}<span class="uname">${esc(u.name)}</span>${u.full != null ? `<span class="fulll" tabindex="0" data-tip="${esc(`Fullness ${u.full}/${E.fullCap(u)}. Kurakura's Meals feed every ally that isn't full (+2 each; the rare Legendary Rice Ball +12). Each attack (not the Extra Attack) digests 1. Beni-Enma's Sparrow's Tub Bath empties theirs by 2, and their NP raises everyone's cap by 4 for 5 turns.`)}">🍙 ${u.full}/${E.fullCap(u)}</span>` : ''}${u.aff != null ? `<span class="affl" tabindex="0" data-tip="${esc(`Affection Lv ${E.affLevel(u)} (${E.AFF_NAME(E.affLevel(u))}), ${u.aff} points. Every 10 points is a level. Gains: +3 per card of theirs chosen, +6 Brave Chain, +3 per skill they use (+2 more if it's your first skill that turn), +5/+10/+15 for NP overcharge 200/300/400%+, +10 when the field becomes Waterside, +5 Master skill, +10 Command Seal. Her NP gets +10% damage per level above 1; Lv 4+: Death success up; Lv 7+: Ignore DEF and Ignore Invincible; Lv 10: 50 stars and crit chance up.`)}">♥ Lv ${E.affLevel(u)}</span>` : ''}${opts.aff ? `<span class="afftag ${opts.aff.k}">${opts.aff.k === 'up' ? 'Weak' : opts.aff.k === 'down' ? 'Resists' : 'Neutral'} ×${+opts.aff.m.toFixed(2)}</span>` : opts.marks && opts.marks.length ? `<span class="tgtmark">Slot ${opts.marks.join(', ')}</span>` : ''}</span>
    <span class="bars"><span class="bar hp${hpPct <= 30 ? ' low' : hpPct <= 60 ? ' mid' : ''}"><span style="width:${hpPct}%"></span></span>${E.hasNoNP(u) ? '' : `<span class="bar np${u.np >= 100 ? ' full' : ''}" title="NP gauge cap ${E.npCap(u)}% (NP${E.npLevel(u)})">${[0, 1, 2].filter(k => k * 100 < E.npCap(u)).map(k => { const w = Math.max(0, Math.min(100, u.np - k * 100)); return w > 0 ? `<span class="np${k + 1}${w >= 100 ? ' done' : ''}" style="width:${w}%"></span>` : ''; }).join('')}</span>`}</span>
    <span class="nums"><span>HP ${Math.max(0, Math.round(u.hp))}/${Math.round(mhp)}</span>${E.hasNoNP(u) ? '<span class="npnum none" title="This form has no Noble Phantasm">No NP</span>' : `<span class="npnum${u.np >= 100 ? ' full' : ''}${u.np >= 300 ? ' l3' : u.np >= 200 ? ' l2' : ''}">NP ${Math.floor(u.np)}%</span>`}</span>
    ${chips || used ? `<span class="chips">${chips}${used ? `<span class="usedrow" title="Skills used this turn"><span class="usedlbl">Used</span>${used}</span>` : ''}</span>` : ''}</div>`;
}
// During playback the field shows a snapshot (app.view) instead of the live state.
function viewUnit(x) { const s = app.view && app.view.units[x.uid]; return s ? Object.assign(Object.create(x), s) : x; }
function sideMeta(p) {
  const g = app.g; const v = app.view;
  const reserve = v ? v.reserves[p] : g.players[p].reserve;
  const res = reserve.filter(id => !(v ? v.units[id].dead : g.units[id].dead)).length;
  return `${res} in reserve · ${Math.floor(v ? v.stars[p] : g.players[p].stars)}★ banked`;
}
function fieldNow() {
  const g = app.g; const f = app.view && app.view.field !== undefined ? app.view.field : E.currentField(g);
  if (!f) return '';
  const left = E.fieldTurnsLeft(g); const skill = g.fieldOverride && g.turn <= g.fieldOverride.until;
  const neg = app.view && app.view.fieldNegated !== undefined ? app.view.fieldNegated : !E.fieldActive(g, f);
  return `<span class="fieldnow${neg ? ' negated' : ''}" tabindex="0" data-tip="${esc(`Battlefield: ${E.fieldName(f)}${skill ? ' (set by a skill)' : ''}.${neg ? ' Negated this turn: effects that need this field don\'t work.' : ''} ${left} turn${left > 1 ? 's' : ''} left including this one. Fields this game: ${g.fields.map(E.fieldName).join(' and ')}, switching every 2 turns.`)}">${fieldChip(f)}<small>${left}T</small></span>`;
}
function renderField() {
  const g = app.g; const u = app.ui;
  const row = p => {
    const P = g.players[p];
    const frontIds = app.view ? app.view.fronts[p] : P.front;
    const viewerEnemy = (u.stage === 'cards' || u.stage === 'skills') && !u.cover && p !== u.actor;
    const tiles = frontIds.map(id => {
      const x = viewUnit(g.units[id]);
      let targetable = false;
      if (!u.cover && u.targeting && u.targeting.seal) targetable = x.side === u.actor && !x.dead && E.sealTargetOk(g, u.actor, u.targeting.kind, x.uid);
      else if (!u.cover && u.targeting && u.targeting.kind !== 'swapIn') targetable = u.targeting.kind === 'ally' ? (x.side === u.actor && !x.dead && E.allyTargetOk(g, u.targeting, x.uid)) : u.targeting.kind === 'swapOut' ? (x.side === u.actor && !x.dead && !E.has(x, 'noSwap')) : (x.side !== u.actor && !x.dead);
      let aff = null;
      if (!u.cover && u.stage === 'cards' && viewerEnemy && !x.dead && u.pendingSlot != null) {
        targetable = true;
        const atk = u.sel[u.pendingSlot] && g.units[u.sel[u.pendingSlot].card.uid];
        if (atk) { const m = E.classMult(atk, g.units[id]); aff = { m, k: m > 1.001 ? 'up' : m < 0.999 ? 'down' : 'even' }; }
      }
      const marks = viewerEnemy && u.stage === 'cards' ? u.sel.map((s, i) => s.target === id ? i + 1 : 0).filter(Boolean) : [];
      return unitTile(x, { targetable, selected: marks.length > 0, marks, aff });
    }).join('');
    const ini = app.view ? app.view.initiative : g.initiative;
    const sealUsed = app.view && app.view.sealUsed ? app.view.sealUsed[p] : P.sealUsed;
    const token = ini === p ? `<span class="token" tabindex="0" data-tip="Tie-breaker token: when both players' cards in a slot have the same priority, ${PN(p)}'s card resolves first this turn. It also decides who activates the first skill each turn. The token passes to the other player after all attacks resolve.">${I.svg('star')}<span>Tie-breaker</span></span>` : '';
    return `<div class="siderow p${p}"><div class="sidelabel"><b>${esc(PN(p))}${mcBadge(g.players[p].mc)}${NET() && SEAT() === p ? ' <small class="you">You</small>' : ''}</b>${token}${g.seals ? `<span class="sealmark${sealUsed ? ' used' : ''}" tabindex="0" data-tip="${sealUsed ? `${PN(p)} has used their Command Seal.` : `${PN(p)}'s Command Seal is ready: once per game, fully heal a servant or give one +100% NP.`}">${I.svg('seal')}<span>${sealUsed ? 'Seal used' : 'Seal'}</span></span>` : ''}<span class="sidemeta">${sideMeta(p)}</span></div><div class="units">${tiles}</div>${reserveStrip(p)}</div>`;
  };
  return { left: row(0), right: row(1), mid: `<div class="midline"><span>Turn ${g.turn}/${E.CFG.turnLimit}</span><button class="chartbtn" data-act="aff-chart">Class chart</button><button class="chartbtn" data-act="open-stats" ${app.play ? 'disabled' : ''}>Stats</button>${fieldNow()}</div>` };
}
// Reserves: your own (and everyone's, for spectators) are listed under the team; an opponent's stay hidden.
function canSeeReserves(p) { return NET() ? (SEAT() == null || SEAT() === p) : false; }
function reserveStrip(p) {
  if (!NET()) return '';
  const g = app.g; const v = app.view; const ids = v ? v.reserves[p] : g.players[p].reserve;
  if (!ids.length) return '';
  if (!canSeeReserves(p)) return `<div class="rstrip"><span class="rlbl">Reserves</span><span class="rhidden">${ids.length} hidden until they enter</span></div>`;
  return `<div class="rstrip"><span class="rlbl">Reserves</span>${ids.map(id => { const x = viewUnit(g.units[id]); return `<button class="rchip p${p}${x.dead ? ' dead' : ''}" data-act="runit" data-uid="${id}">${CI(x.cls)}<span class="rname">${esc(x.name)}</span><small>${x.dead ? 'Defeated' : `${Math.max(0, Math.round(x.hp))} HP${E.hasNoNP(x) ? '' : ` · NP ${Math.floor(x.np)}%`}`}</small></button>`; }).join('')}</div>`;
}
function renderDock() {
  const g = app.g; const u = app.ui;
  if (u.stage === 'skills' && !u.cover) return skillDock();
  if (u.stage === 'cards' && !u.cover) return cardDock();
  return '';
}
function turnBar() {
  const g = app.g; const u = app.ui;
  if (NET() && !app.play) { const t = netTurnBar(); if (t != null) return t; }
  if (u.stage === 'turn-start') return `<div class="turnbar playing"><p><b>Turn ${g.turn} begins</b></p><button class="primary" data-act="intro-skip">Continue</button></div>`;
  if (app.play) return `<div class="turnbar playing"><p><b>${u.stage === 'skills-reveal' ? 'Skills resolving…' : 'Attacks resolving…'}</b></p><div class="row"><button data-act="fx-speed" aria-pressed="${app.fast ? 'true' : 'false'}">${app.fast ? 'Normal speed' : 'Speed up'}</button><button class="primary" data-act="fx-skip">Skip</button></div></div>`;
  if (u.stage === 'skills-reveal') return `<div class="turnbar"><p><b>Skills resolved</b> one at a time in the order picked, alternating players, tie-breaker holder first.</p><button class="primary" data-act="to-cards">Choose cards</button></div>`;
  if (u.stage === 'cards-reveal') return `<div class="turnbar"><p><b>Turn resolved.</b> Each slot went Quick, Arts, then Buster; NPs move at their card type's speed.</p><button class="primary" data-act="next-turn">Start turn ${g.turn}</button></div>`;
  if (u.stage === 'over') {
    const w = g.winner;
    return `<div class="turnbar over"><p><b>${w === 'draw' ? 'Draw' : `${PN(w)} wins`}</b> on turn ${g.turn}. Servants left: P1 ${E.aliveCount(g, 0)}, P2 ${E.aliveCount(g, 1)}.${g.limitBy === 'hp' ? ` Average HP left: P1 ${Math.round(E.hpPct(g, 0) * 100)}%, P2 ${Math.round(E.hpPct(g, 1) * 100)}%.` : ''}</p><div class="row"><button class="primary" data-act="rematch">Rematch, same teams</button><button data-act="new-draft">New draft</button><button data-act="open-stats">Battle stats</button></div></div>`;
  }
  if (u.stage === 'skills' || u.stage === 'cards') return `<div class="turnbar"><p>${PN(u.actor)} is choosing ${u.stage === 'skills' ? 'skills' : 'cards'}. Their panel is under their team.</p></div>`;
  return '';
}
// One card face used for both the skill-phase preview and the card-phase hand, so the hand looks the same in both.
function cardInner(g, c) {
  const x = g.units[c.uid]; const col = E.cardColor(g, c); const acts = E.canAct(x) && !E.cardSealed(g, c);
  const label = c.type === 'NP' ? `NP · ${E.npColor(x)}` : E.COLOR[col];
  const chg = c.type !== 'NP' && E.cardWillChange(g, c) ? `<span class="cchg" title="This card changes type when ${esc(x.name)}'s NP transforms them">${I.svg('cycle')}</span>` : '';
  return { col, acts, html: `${chg}<span class="ctype">${label}</span>${c.type === 'NP' ? `<span class="npname">${esc(x.kit.np.n)}</span>` : ''}<span class="cname" data-full="${esc(whoIs(x))}">${esc(x.name)}</span>${c.stars ? `<span class="cstars">${c.stars}★ · ${Math.min(100, c.stars * 10)}% crit</span>` : ''}${!acts ? '<span class="xmark" aria-hidden="true"></span><span class="cstars">Won\'t activate</span>' : ''}` };
}
function handRows(nps, hand, face) {
  return `${nps.length ? `<div class="nprow" style="--n:${nps.length}">${nps.map(face).join('')}</div>` : ''}<div class="hand cards">${hand.map(face).join('')}</div>`;
}
function handPreview(p, label = 'Your hand this turn') {
  const g = app.g; const P = g.players[p];
  const nps = E.availableNPs(g, p);
  const face = c => { const k = cardInner(g, c); return `<div class="ccard preview ${c.type === 'NP' ? 'npcard ' : ''}${k.col}${k.acts ? '' : ' inactive'}">${k.html}</div>`; };
  return `<div class="handprev"><p class="eyebrow" data-tip="Stars are dealt onto these cards after skills resolve.">${esc(label)}</p>${handRows(nps, P.hand, face)}</div>`;
}
// Queue chips in the order they were picked, numbered, since that is the order they activate.
function inPickOrder(html) {
  const items = html.split(/(?=<li class="qchip)/).filter(Boolean);
  items.sort((a, b) => +(a.match(/data-seq="(\d+)"/) || [0, 0])[1] - +(b.match(/data-seq="(\d+)"/) || [0, 0])[1]);
  return items.map((h, k) => h.replace('<span>', `<span class="qnum">${k + 1}</span><span>`)).join('');
}
function skillDock() {
  const g = app.g; const u = app.ui; const p = u.actor;
  const q = g.players[p].skillQueue;
  const rows = E.front(g, p).map(x => `<div class="skrow"><span class="skname">${esc(x.name)}</span><div class="skbtns">${x.kit.sk.map((s, i) => {
    const ok = E.skillUsable(g, x, i);
    const tk = E.skillTargetKind(x, i);
    return `<button class="skill${u.targeting && u.targeting.uid === x.uid && u.targeting.i === i ? ' arming' : ''}" data-act="skill" data-uid="${x.uid}" data-i="${i}" ${ok.ok ? '' : 'disabled'} data-tip="${esc(skillTip(x, i))}">${I.skillIcon(s)}<span class="sktxt"><b>${esc(s.n)}</b><small>${ok.ok ? `CD ${s.cd}${tk ? ` · ${tk}` : ''}` : esc(ok.why)}</small></span></button>`;
  }).join('')}</div></div>`).join('');
  const queued = q.map((x, k) => { const su = g.units[x.uid]; const t = x.target ? g.units[x.target] : null; return `<li class="qchip" data-seq="${x.seq}" data-tip="${esc(su.name + ': ' + su.kit.sk[x.i].n + (t ? ' → ' + t.name : '') + (x.opt != null ? ' (' + optLabel(su, x) + ')' : ''))}">${I.skillIcon(su.kit.sk[x.i], 'sm')}<span>${esc(su.kit.sk[x.i].n)}${t ? ` → ${esc(t.name.split(' ')[0])}` : ''}${x.opt != null ? ` · ${esc(optLabel(su, x))}` : ''}</span><button class="x" data-act="unqueue" data-k="${k}" aria-label="Remove">✕</button></li>`; }).join('');
  const P = g.players[p]; const T = u.targeting;
  const mIcon = M => I.badge(M.icon, { plain: true, dir: M.icon === 'atk' ? 'up' : null });
  const master = `<div class="skrow master"><span class="skname">Master</span><div class="skbtns">${E.masterSkills(g, p).map((M, i) => { const ok = E.masterUsable(g, p, i);
    return `<button class="skill${T && T.master && T.i === i ? ' arming' : ''}" data-act="mskill" data-i="${i}" ${ok.ok ? '' : 'disabled'} data-tip="${esc(M.n + ' (CD ' + M.cd + '): ' + M.text)}">${mIcon(M)}<span class="sktxt"><b>${esc(M.n)}</b><small>${ok.ok ? `CD ${M.cd} · ${M.kind === 'swap' ? 'swap' : 'ally'}` : esc(ok.why)}</small></span></button>`; }).join('')}</div></div>`;
  const reservePick = T && T.kind === 'swapIn' ? `<div class="reserves"><span class="hint">Bring in for ${esc(g.units[T.out].name)}:</span>${P.reserve.filter(id => !g.units[id].dead && !E.has(g.units[id], 'noSwap')).map(id => { const r = g.units[id]; return `<button class="resbtn" data-act="swap-in" data-uid="${id}">${CI(r.cls)}<span>${esc(r.name)}</span><small>HP ${Math.round(r.hp)}${E.hasNoNP(r) ? " · No NP" : ` · NP ${Math.floor(r.np)}%`}</small></button>`; }).join('')}</div>` : '';
  const mq = P.masterQueue.map((m, k) => { const M = E.masterSkills(g, p)[m.i]; const txt = M.kind === 'swap' ? `${g.units[m.out].name} ⇄ ${g.units[m.in].name}` : g.units[m.target].name; return `<li class="qchip master" data-seq="${m.seq}" data-tip="${esc('Master: ' + M.n + ' → ' + txt)}">${mIcon(M)}<span>${esc(M.n)} → ${esc(txt)}${m.applied ? ' · activated' : ''}</span>${m.applied ? '' : `<button class="x" data-act="unmaster" data-k="${k}" aria-label="Remove ${esc(M.n)}">✕</button>`}</li>`; }).join('');
  const sealOk = E.sealUsable(g, p);
  const sealRow = g.seals ? `<span class="sealbtns"><span class="seallbl">${I.svg('seal')}Seal</span>${[['heal', 'Full heal', 'heal'], ['np', 'NP +100%', 'np']].map(([k, label, ic]) => `<button class="sealbtn${T && T.seal && T.kind === k ? ' arming' : ''}" data-act="seal" data-k="${k}" ${sealOk.ok ? '' : 'disabled'} data-tip="${esc((k === 'heal' ? 'Command Seal: fully heal one injured servant, on the field or in reserve.' : 'Command Seal: charge one servant\'s NP gauge by 100%, on the field or in reserve.') + (sealOk.ok ? ' Once per game.' : ' (' + sealOk.why + ')'))}">${I.badge(ic, { plain: true, size: 'sm' })}${label}</button>`).join('')}</span>` : '';
  const sealPick = T && T.seal ? `<div class="reserves"><span class="hint">${T.kind === 'heal' ? 'Fully heal' : 'NP +100% for'}:</span>${P.order.filter(id => !g.units[id].dead).map(id => { const r = g.units[id]; const ok = E.sealTargetOk(g, p, T.kind, id); return `<button class="resbtn" data-act="seal-pick" data-uid="${id}" ${ok ? '' : 'disabled'}>${CI(r.cls)}<span>${esc(r.name)}${P.front.includes(id) ? '' : ' (reserve)'}</span><small>HP ${Math.round(r.hp)}/${Math.round(E.maxHp(r))}${E.hasNoNP(r) ? " · No NP" : ` · NP ${Math.floor(r.np)}%`}</small></button>`; }).join('')}</div>` : '';
  const sq = P.sealQueue ? `<li class="qchip master seal" data-seq="${P.sealQueue.seq}" data-tip="${esc('Command Seal: ' + (P.sealQueue.kind === 'heal' ? 'full heal' : 'NP +100%') + ' → ' + g.units[P.sealQueue.uid].name)}">${I.badge('seal', { plain: true })}<span>Seal: ${P.sealQueue.kind === 'heal' ? 'Full heal' : 'NP +100%'} → ${esc(g.units[P.sealQueue.uid].name)}</span><button class="x" data-act="unseal" aria-label="Remove Command Seal">✕</button></li>` : '';
  const optPick = T && T.kind === 'opt' ? (T.opt.kind === 'npType'
    ? `<div class="reserves optpick"><span class="hint">${esc(g.units[T.uid].kit.sk[T.i].n)}: choose the NP card type</span>${T.opt.options.map(o => `<button class="resbtn opt ${o[0]}" data-act="skill-opt" data-v="${o}"><span class="npc ${o[0]}">${o[0]}</span><span>${o}${o === T.opt.def ? ' (default)' : ''}</span></button>`).join('')}</div>`
    : `<div class="reserves optpick"><span class="hint">${esc(g.units[T.uid].kit.sk[T.i].n)}: choose one</span>${T.opt.options.map(o => { const short = o.stars && P.stars < o.stars; return `<button class="resbtn opt" data-act="skill-opt" data-v="${o.v}" ${short ? 'disabled' : ''}><span>${esc(o.label)}</span>${o.stars ? `<small>${short ? `Needs ${o.stars} stars (you have ${Math.floor(P.stars)})` : `Uses ${o.stars} of your ${Math.floor(P.stars)} stars`}</small>` : ''}</button>`; }).join('')}</div>`) : '';
  const armMsg = !T ? '' : T.kind === 'opt' ? (T.opt.kind === 'npType' ? 'Pick the NP type' : 'Pick an option') : T.seal ? 'Command Seal: pick a servant' : T.kind === 'swapOut' ? 'Order Change: pick the servant on the field to swap out' : T.kind === 'swapIn' ? 'Order Change: pick who comes in' : `Pick ${T.kind === 'ally' ? 'an ally' : 'an enemy'} on the field`;
  return `<div class="dock"><div class="dock-head"><h3>${NET() ? 'Your skills' : `${esc(PN(p))}: skills`}</h3>${sealRow}${T ? `<span class="arm">${armMsg} <button data-act="cancel-target">Cancel</button></span>` : ''}</div>
    ${handPreview(p)}${rows}${master}${reservePick}${sealPick}${optPick}
    <div class="dockfoot"><ol class="queue">${inPickOrder(sq + mq + queued) || '<li class="hint">No skills queued. They activate in the order you pick them.</li>'}</ol><button class="primary" data-act="lock-skills">Lock in skills</button></div></div>`;
}
function cardDock() {
  const g = app.g; const u = app.ui; const p = u.actor; const P = g.players[p];
  const nps = E.availableNPs(g, p);
  const used = new Set(u.sel.map(s => s.card.id));
  const cardBtn = c => {
    const x = g.units[c.uid]; const k = cardInner(g, c);
    const dis = used.has(c.id) || u.sel.length >= 3 || u.pendingSlot != null;
    return `<button class="ccard ${c.type === 'NP' ? 'npcard ' : ''}${k.col}${k.acts ? '' : ' inactive'}" data-act="card" data-id="${c.id}" ${dis ? 'disabled' : ''}${k.acts ? '' : ` title="${esc(E.actBlocker(x) ? x.name + ' has ' + E.actBlocker(x) : x.name + '\'s ' + E.COLOR[k.col] + ' cards are sealed')}: this card won't activate and won't count toward chains"`}>${k.html}</button>`;
  };
  const slots = [0, 1, 2].map(i => { const s = u.sel[i]; if (!s) return `<div class="slot empty">Slot ${i + 1}</div>`; const x = g.units[s.card.uid]; const col = E.cardColor(g, s.card); const off = !E.canAct(x) || E.cardSealed(g, s.card); return `<div class="slot ${col}${off ? ' inactive' : ''}${u.pendingSlot === i ? ' arming' : ''}">${off ? '<span class="xmark" aria-hidden="true"></span>' : ''}<button class="unslot" data-act="unslot" data-k="${i}" aria-label="Remove ${esc(x.name)} from slot ${i + 1}">✕</button>${s.card.type !== 'NP' && E.cardWillChange(g, s.card) ? `<span class="cchg" title="This card changes type when ${esc(x.name)}'s NP transforms them">${I.svg('cycle')}</span>` : ''}<span class="ctype">${i + 1} · ${s.card.type === 'NP' ? 'NP' : E.COLOR[col]}</span>${s.card.type === 'NP' ? `<span class="npname">${esc(x.kit.np.n)}</span>` : ''}<span class="cname" data-full="${esc(whoIs(x))}">${esc(x.name)}</span>${s.target == null ? `<span class="cto pending">${u.pendingSlot === i ? 'Tap an enemy ▸' : 'No target'}</span>` : needsTarget(s.card) ? `<button class="cto retarget" data-act="retarget" data-k="${i}" aria-label="Change target for slot ${i + 1}">→ ${esc(g.units[s.target].name)} <span aria-hidden="true">✎</span></button>` : `<span class="cto">→ ${esc(g.units[s.target].name)}${g.units[s.card.uid].kit.np.tgt === 'all' ? ' + all enemies' : ''}</span>`}</div>`; }).join('');
  const preview = chainPreview();
  return `<div class="dock"><div class="dock-head"><h3>${NET() ? 'Your cards' : `${esc(PN(p))}: cards`}</h3><span class="arm">${u.pendingSlot != null ? `Slot ${u.pendingSlot + 1}: tap an enemy to target <button data-act="cancel-card">Cancel</button>` : 'Pick a card, then tap the enemy it should hit'}</span></div>
    ${handRows(nps, P.hand, cardBtn)}
    <div class="slots">${slots}</div>
    <div class="dockfoot"><p class="chain">${preview}</p><button data-act="clear-cards">Clear</button><button class="primary" data-act="lock-cards" ${u.sel.length === Math.min(3, P.hand.length + nps.length) && u.sel.every(s => s.target != null) ? '' : 'disabled'}>Lock in cards</button></div></div>`;
}
// Cards that hit a single chosen enemy need a target; AoE and no-damage NPs don't.
function optLabel(su, x) { const sk = su.kit.sk[x.i]; return sk.opts ? (sk.opts[+x.opt] || {}).label || '' : 'NP: ' + x.opt; }
function needsTarget(c) { if (c.type !== 'NP') return true; const x = app.g.units[c.uid]; const np = x.kit.np; return np.tgt === 'one' || !!np.single || x.buffs.some(b => b.s === 'npSingle'); }
function nextPending() { const i = app.ui.sel.findIndex(s => s.target == null); return i < 0 ? null : i; }
function chainPreview() {
  const g = app.g; const u = app.ui;
  if (!u.sel.length) return 'Pick up to 3 cards. The order you pick is the slot order. Tap ✕ on a slot to take a card back.';
  const cols = u.sel.map(s => E.cardColor(g, s.card));
  const on = u.sel.map(s => E.canAct(g.units[s.card.uid]));
  const full = u.sel.length === 3 && on.every(Boolean);
  const bits = [];
  const mighty = full && new Set(cols).size === 3;
  if (mighty) bits.push('Mighty Chain: every card gets the Buster, Arts and Quick first-card bonuses and +20% crit chance on these 3 cards');
  else if (on[0]) bits.push({ B: 'Buster first: +0.5 card value on every card', A: 'Arts first: +1 NP value on every card', Q: 'Quick first: +20% stars on every card' }[cols[0]]);
  if (full && cols.every(c => c === cols[0])) bits.push({ B: 'Buster Chain: +20% of ATK per Buster card', A: 'Arts Chain: +20% NP to each attacker right away (before any card resolves)', Q: 'Quick Chain: +20% crit chance on these 3 cards and +20 stars next turn' }[cols[0]]);
  if (full && u.sel.every(s => s.card.uid === u.sel[0].card.uid)) bits.push('Brave Chain: Extra Attack in slot 4');
  const npsIn = u.sel.filter((s, i) => s.card.type === 'NP' && on[i]).length;
  if (npsIn > 1) bits.push(`NP chain: each later NP gets +100% overcharge`);
  if (on.some(v => !v)) bits.push(`${on.filter(v => !v).length} card${on.filter(v => !v).length > 1 ? 's' : ''} won't activate, so no chain bonus`);
  return bits.join(' · ') || 'No bonus yet.';
}
function renderLog() {
  const g = app.g; const end = app.view ? app.view.log : g.log.length; const from = Math.max(0, end - 160);
  const rows = g.log.slice(from, end).map((l, i) => {
    const ic = l.master != null ? (() => { const M = E.masterSkills(g, l.p || 0)[l.master]; return `<span class="logic" data-tip="${esc(M.text)}" tabindex="0">${I.badge(M.icon, { plain: true, size: 'sm' })}</span>`; })() : l.skill ? (() => { const su = g.units[l.skill.uid]; return `<span class="logic" data-tip="${esc(skillTip(su, l.skill.i))}" tabindex="0">${I.skillIcon(su.kit.sk[l.skill.i], 'sm')}</span>`; })() : '';
    const cause = l.cause ? `<span class="cause">${esc(l.cause.from)}${l.cause.by && !l.cause.from.startsWith('Control') ? ` <i>(${esc(l.cause.by)})</i>` : ''} ›</span> ` : '';
    const msg = NET() ? l.msg.replace(/\bP([12])\b/g, (_, d) => PN(+d - 1)) : l.msg; // online: player names instead of P1/P2
    return `<li class="${l.cls || ''}${l.cause ? ' caused' : ''}${from + i >= app.ui.revealFrom ? ' fresh' : ''}">${ic}${cause}${l.dmgNum != null ? esc(msg).replace(`for ${l.dmgNum}`, `for <b class="dnum ${l.aff}" title="${{ up: 'Class advantage', down: 'Class disadvantage', even: 'Neutral class matchup' }[l.aff]}">${l.dmgNum}</b>`) : esc(msg)}</li>`;
  }).join('');
  return `<section class="log"><h3>Battle log</h3><ol id="logList">${rows}</ol></section>`;
}
function renderFocus() {
  const g = app.g; const f = app.ui.focus && g.units[app.ui.focus];
  if (!f) return '';
  const all = f.buffs.filter(b => !(b.passive && (b.hidden || b.s === 'trigger' && !b.label))).map(b => `<li class="${b.debuff ? 'neg' : ''}">${buffBadge(b)}<span>${esc(E.describeBuff(b))}${b.from ? ` <small>· ${esc(b.from)}</small>` : ''}</span></li>`).join('');
  const x = viewUnit(f);
  const cds = f.kit.sk.map((sk, i) => `<li>${I.skillIcon(sk)}<span class="cdname">${esc(sk.n)}</span><b>${f.cds[i] ? `${f.cds[i]} turn${f.cds[i] > 1 ? 's' : ''}` : 'Ready'}</b></li>`).join('');
  const status = `<div class="fstatus"><p class="eyebrow">${PN(f.side)} · ${f.dead ? 'Defeated' : g.players[f.side].front.includes(f.uid) ? 'On the field' : 'In reserve'}</p>
    <div class="fbars"><span>HP <b>${Math.max(0, Math.round(x.hp))}/${Math.round(E.maxHp(x))}</b></span>${E.hasNoNP(x) ? '' : `<span>NP <b>${Math.floor(x.np)}%</b></span>`}</div>
    <h4>Active effects</h4><ul class="effects">${all || '<li>None</li>'}</ul><h4>Skill cooldowns</h4><ul class="cdlist">${cds}</ul></div>`;
  return modal(status + servantDetail(f.d), '', 'close-focus', f.name);
}
function renderBattle() {
  const u = app.ui;
  const cover = u.cover ? `<div class="cover"><div class="cover-card"><p class="eyebrow">Pass the device</p><h2>${esc(u.cover.title)}</h2><p>${esc(u.cover.text)}</p><button class="primary" data-act="uncover">${esc(u.cover.btn)}</button></div></div>` : '';
  const f = renderField();
  const g = app.g;
  const focusSide = u.focus ? g.units[u.focus].side : null;
  const live = u.stage === 'skills' || u.stage === 'cards' || u.stage === 'wait';
  const spyHand = p => isSpec() && live && !app.play ? handPreview(p, `${PN(p)}'s hand`) : '';
  const side = p => `${p === 0 ? f.left : f.right}${!u.cover && u.actor === p && (u.stage === 'skills' || u.stage === 'cards') && (!NET() || SEAT() === p) ? renderDock() : ''}${spyHand(p)}`;
  const L = leftSide();
  return `${netBar()}<div class="battle"><div class="col left">${side(L)}</div><div class="col center">${f.mid}<div class="stage" id="stage" aria-hidden="true"></div>${turnBar()}${renderLog()}</div><div class="col right">${side(1 - L)}</div></div>${u.focus && !u.cover ? renderFocus() : ''}${app.affChart ? affChart() : ''}${app.statsOpen ? statsModal() : ''}${u.stage === 'over' && !app.play && !u.victoryClosed && !app.statsOpen ? victoryOverlay() : ''}${cover}`;
}

// ---------------------------------------------------------------- Playback
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = { skill: 520, eff: 560, act: 420, hit: 900, ko: 800, guts: 800, enter: 700, banner: 1000 };
function wait(ms, tok) { return new Promise(r => setTimeout(r, app.fast ? ms * 0.4 : ms)); }
const tileEl = uid => document.querySelector(`.unit[data-uid="${uid}"]`);
const tokenEl = uid => document.querySelector(`#arena .fighter[data-uid="${uid}"]`);
const fxEl = uid => tokenEl(uid) || tileEl(uid);
const dur = ms => REDUCED ? 1 : (app.fast ? ms * 0.4 : ms);
function patchView(snap) {
  app.view = snap;
  syncScene();
  const fnEl = document.querySelector('.midline .fieldnow'); if (fnEl) { const t = document.createElement('span'); t.innerHTML = fieldNow(); if (t.firstElementChild && t.firstElementChild.outerHTML !== fnEl.outerHTML) fnEl.replaceWith(t.firstElementChild); }
  const g = app.g;
  document.querySelectorAll('.unit[data-uid]').forEach(el => {
    const x = viewUnit(g.units[+el.dataset.uid]);
    const tmp = document.createElement('div'); tmp.innerHTML = unitTile(x, {}).trim(); const n = tmp.firstElementChild;
    const hpOld = el.querySelector('.bar.hp > span'), hpNew = n.querySelector('.bar.hp > span');
    if (hpOld && hpNew) hpOld.style.width = hpNew.style.width;
    const npOld = el.querySelector('.bar.np'), npNew = n.querySelector('.bar.np'); if (npOld && npNew) { npOld.className = npNew.className; npOld.innerHTML = npNew.innerHTML; }
    const numsOld = el.querySelector('.nums'), numsNew = n.querySelector('.nums'); if (numsOld && numsNew) numsOld.innerHTML = numsNew.innerHTML;
    const chOld = el.querySelector('.chips'), chNew = n.querySelector('.chips');
    if (chOld && chNew) chOld.replaceWith(chNew); else if (chOld) chOld.remove(); else if (chNew) el.appendChild(chNew);
    el.classList.toggle('dead', x.dead);
  });
  document.querySelectorAll('#arena .fighter').forEach(f => { const x = viewUnit(g.units[+f.dataset.uid]); const pct = Math.max(0, Math.min(100, x.hp / E.maxHp(x) * 100)); const bar = f.querySelector('.fbar > span'); if (bar) bar.style.width = pct + '%'; const hp = f.querySelector('.fhp'); if (hp) hp.textContent = `HP ${Math.max(0, Math.round(x.hp))}/${Math.round(E.maxHp(x))}`; });
  document.querySelectorAll('.unit[data-uid]').forEach(el => { if (tokenEl(+el.dataset.uid)) el.classList.add('away'); });
  document.querySelectorAll('.siderow').forEach(r => { const p = r.classList.contains('p0') ? 0 : 1; const m = r.querySelector('.sidemeta'); if (m) m.textContent = sideMeta(p); });
  const log = document.querySelector('.log'); if (log) { const t = document.createElement('div'); t.innerHTML = renderLog(); log.replaceWith(t.firstElementChild); const ll = document.getElementById('logList'); if (ll) ll.scrollTop = ll.scrollHeight; }
}
function floater(uid, html, cls) {
  const el = fxEl(uid); if (!el) return;
  const f = document.createElement('div'); f.className = 'floater ' + (cls || ''); f.innerHTML = html;
  const n = el.querySelectorAll(".floater").length % 3; f.style.setProperty("--stack", n);
  el.appendChild(f); setTimeout(() => f.remove(), app.fast ? 700 : 1500);
}
function flash(uid, cls, ms) { const el = fxEl(uid); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
function banner(label, side) {
  const st = document.getElementById('stage'); if (!st) return;
  const b = document.createElement('div'); b.className = `banner p${side}`; b.textContent = `${PN(side)}: ${label}`;
  st.appendChild(b); setTimeout(() => b.remove(), app.fast ? 800 : 1800);
}
async function step(ev, tok) {
  const g = app.g;
  if (ev.t === 'swapNotice') {
    const out = g.units[ev.out], incoming = g.units[ev.in];
    banner(`Order Change incoming: ${out.name} out, ${incoming.name} in`, ev.p);
    await wait(450, tok);
  } else if (ev.t === 'skill') {
    const x = g.units[ev.uid]; const sk = x.kit.sk[ev.i];
    flash(ev.uid, 'casting', 700);
    floater(ev.uid, `${I.skillIcon(sk, 'sm')}<span>${esc(sk.n)}</span>`, 'skillname');
    patchView(ev.snap); await wait(T.skill, tok);
  } else if (ev.t === 'tiebreak' || ev.t === 'tiebreak-pass') {
    if (ev.t === 'tiebreak-pass') { app.view = ev.snap; render(); }
    await announceTiebreak(ev.p, ev.t === 'tiebreak-pass' ? 'pass' : ev.stage, tok);
  } else if (ev.t === 'master') {
    const M = E.masterSkills(g, ev.p)[ev.i];
    flash(ev.uid, 'casting', 700);
    floater(ev.uid, `${I.badge(M.icon, { plain: true })}<span>Master · ${esc(M.n)}</span>`, 'skillname');
    patchView(ev.snap); await wait(T.skill, tok);
  } else if (ev.t === 'seal') {
    const x = g.units[ev.uid]; const label = ev.kind === 'heal' ? 'Command Seal · Full heal' : 'Command Seal · NP +100%';
    banner(`${label} → ${x.name}`, ev.p);
    if (ev.onField) { flash(ev.uid, 'casting', 900); floater(ev.uid, `${I.badge('seal', { plain: true })}<span>${label}</span>`, 'skillname'); }
    patchView(ev.snap); await wait(T.banner + 200, tok);
  } else if (ev.t === 'swap') {
    const o = tileEl(ev.out); if (o) { o.classList.add('ko-fade'); await wait(450, tok); if (tok.skip) return; }
    app.view = ev.snap; render();
    const el = tileEl(ev.in); if (el) el.classList.add('appear');
    floater(ev.in, `${I.badge('swap', { plain: true })}<span>Order Change</span>`, 'pos');
    await wait(T.enter + 200, tok);
  } else if (ev.t === 'eff') {
    const icon = ev.buff ? buffBadge(ev.buff) : I.badge(ev.key, { neg: !!ev.neg, plain: true });
    floater(ev.uid, `${icon}<span>${esc(ev.label)}</span>`, ev.miss ? 'miss' : (ev.neg || (ev.buff && ev.buff.debuff)) ? 'neg' : 'pos');
    await wait(140, tok); if (tok.skip) return; patchView(ev.snap); await wait(T.eff - 140, tok);
  } else if (ev.t === 'act') {
    flash(ev.uid, 'acting', 600);
    floater(ev.uid, `<span class="cardtag ${ev.color}">${esc(ev.np ? 'NP' : ev.label)}</span>${ev.np ? `<span>${esc(ev.label)}${ev.oc > 1 ? ` · OC ${ev.oc * 100}%` : ''}</span>` : ''}`, 'act');
    await wait(ev.np ? T.act + 300 : T.act, tok);
  } else if (ev.t === 'hit') {
    flash(ev.uid, REDUCED ? 'hitflash' : 'shake', 450);
    floater(ev.uid, `<b class="dnum ${ev.aff}">${ev.dmg}</b>${ev.crit ? '<span class="crit">Critical</span>' : ''}${ev.dot ? `<span>${esc(ev.dot)}</span>` : ''}`, 'dmgpop');
    await wait(200, tok); if (tok.skip) return; patchView(ev.snap); await wait(T.hit - 200, tok);
  } else if (ev.t === 'ko') {
    const el = tileEl(ev.uid); if (el) el.classList.add('ko-fade');
    const tk = tokenEl(ev.uid); if (tk) tk.classList.add('ko-fade');
    await wait(T.ko, tok); if (tok.skip) return; patchView(ev.snap);
  } else if (ev.t === 'guts') {
    floater(ev.uid, `${I.badge('guts', { plain: true })}<span>${esc(ev.label)}</span>`, 'pos');
    const el = tileEl(ev.uid); if (el) el.classList.remove('ko-fade');
    const tk = tokenEl(ev.uid); if (tk) tk.classList.remove('ko-fade');
    patchView(ev.snap); await wait(T.guts, tok);
  } else if (ev.t === 'enter') {
    app.view = ev.snap; render();
    const el = tileEl(ev.uid); if (el) el.classList.add('appear');
    await wait(T.enter, tok);
  } else if (ev.t === 'banner') {
    if (ev.field) patchView(ev.snap);   // battlefield change: crossfade the scene now
    banner(ev.label, ev.side); await wait(ev.field ? 1400 : T.banner, tok);
  }
}
// ---- Arena: attacker and targets step into the middle pane, the attacker strikes, then everyone returns.
function arenaLayer() { let l = document.getElementById('arena'); if (!l) { l = document.createElement('div'); l.id = 'arena'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); } return l; }
function clearArena() { const l = document.getElementById('arena'); if (l) l.innerHTML = ''; document.querySelectorAll('.unit.away').forEach(t => t.classList.remove('away')); }
function pageRect(el) { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; }
function spawnFighter(uid, cx, cy, w) {
  const g = app.g; const x = viewUnit(g.units[uid]);
  const pct = Math.max(0, Math.min(100, x.hp / E.maxHp(x) * 100));
  const f = document.createElement('div');
  f.className = `fighter p${x.side}${x.dead ? ' dead' : ''}`; f.dataset.uid = uid; f.style.width = w + 'px';
  f.innerHTML = `<div class="fhead">${CI(x.cls)}<span class="fname">${esc(x.name)}</span></div><div class="fbar"><span style="width:${pct}%"></span></div><div class="fhp">HP ${Math.max(0, Math.round(x.hp))}/${Math.round(E.maxHp(x))}</div>`;
  arenaLayer().appendChild(f);
  const H = f.offsetHeight;
  f.style.left = (cx - w / 2) + 'px'; f.style.top = (cy - H / 2) + 'px';
  f._home = { cx, cy };
  const tile = tileEl(uid);
  if (tile) {
    const r = pageRect(tile);
    f.animate([{ transform: `translate(${r.x + r.w / 2 - cx}px, ${r.y + r.h / 2 - cy}px) scale(.85)`, opacity: .25 }, { transform: 'none', opacity: 1 }], { duration: dur(420), easing: 'cubic-bezier(.2,.8,.3,1)' });
    tile.classList.add('away');
  }
  return f;
}
function sendHome(f) {
  const tile = tileEl(+f.dataset.uid);
  if (!tile) { f.remove(); return; }
  const r = pageRect(tile);
  const a = f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${r.x + r.w / 2 - f._home.cx}px, ${r.y + r.h / 2 - f._home.cy}px) scale(.85)`, opacity: 0 }], { duration: dur(380), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
  a.onfinish = () => { f.remove(); const t = tileEl(+f.dataset.uid); if (t) t.classList.remove('away'); };
}
// Big tie-breaker announcement in the middle pane; the token then flies to (or lands on) the holder's side.
async function announceTiebreak(p, stage, tok) {
  const st = document.getElementById('stage'); if (!st) return;
  const el = document.createElement('div'); el.className = `tbannounce p${p}`;
  const title = `Turn ${app.g.turn}: ${PN(p)} has the tie-breaker`;
  const sub = `Their first skill activates first, and their card goes first when a slot ties. Battlefield: ${E.fieldName(E.currentField(app.g))}.`;
  el.innerHTML = `<span class="tbcoin">${I.svg('star')}</span><b>${esc(title)}</b><small>${esc(sub)}</small>`;
  st.appendChild(el);
  await wait(1500, tok); if (tok.skip) { el.remove(); return; }
  const target = document.querySelector(`.siderow.p${p} .token`);
  const coin = el.querySelector('.tbcoin');
  if (target && coin && !REDUCED) {
    const a = coin.getBoundingClientRect(), b = target.getBoundingClientRect();
    coin.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.35)`, opacity: .2 }], { duration: dur(520), easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  }
  el.classList.add('out');
  await wait(520, tok);
  el.remove();
  if (target) { target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); }
}
// ---- Multi-hit strikes: each hit lands separately, showing its share of the damage (FGO's per-hit split).
function splitDamage(total, dist) {
  const sum = dist.reduce((a, b) => a + b, 0) || 1; let acc = 0;
  return dist.map((p, i) => { if (i === dist.length - 1) return total - acc; const v = Math.round(total * p / sum); acc += v; return v; });
}
function setTokenHp(tk, uid, hp) {
  const x = viewUnit(app.g.units[uid]); const mx = E.maxHp(x);
  const bar = tk.querySelector('.fbar > span'); if (bar) bar.style.width = Math.max(0, Math.min(100, hp / mx * 100)) + '%';
  const t = tk.querySelector('.fhp'); if (t) t.textContent = `HP ${Math.max(0, Math.round(hp))}/${Math.round(mx)}`;
}
function hitPop(tk, html, k, big, total, side) {
  const f = document.createElement('div'); f.className = 'floater dmgpop hitpop' + (big ? ' big' : '') + (total ? ' total' : '') + (side ? ' side ' + side : ''); f.innerHTML = html;
  f.style.setProperty('--dx', (((k * 37) % 5) - 2) * 16 + 'px'); f.style.setProperty('--dy', -((k * 23) % 4) * 11 + 'px');
  tk.appendChild(f); setTimeout(() => f.remove(), app.fast ? 650 : 1150);
}
function slash(tk, big, k) {
  const el = document.createElement('div'); el.className = 'slash' + (big ? ' big' : '');
  el.style.setProperty('--rot', (((k * 53) % 70) - 35) + 'deg'); tk.appendChild(el); setTimeout(() => el.remove(), 420);
}
function shake(tk, big) { tk.classList.remove('struck', 'struckbig'); void tk.offsetWidth; tk.classList.add(REDUCED ? 'hitflash' : big ? 'struckbig' : 'struck'); }
const moveTo = (el, from, to, ms) => el.animate([{ transform: from }, { transform: to }], { duration: dur(ms), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished.catch(() => {});
// One attacker hitting one target with every hit of the card (or single-target NP).
async function strikeOne(atk, tk, ev, tok, big) {
  const parts = splitDamage(ev.dmg, ev.dist || [100]); const n = parts.length;
  const dx = tk._home.cx - atk._home.cx, dy = tk._home.cy - atk._home.cy;
  const reach = 1 - (parseFloat(atk.style.width) + 18) / Math.max(parseFloat(atk.style.width) + 19, Math.hypot(dx, dy));
  const inPos = `translate(${dx * reach}px, ${dy * reach}px)${big ? ' scale(1.12)' : ''}`;
  const sgn = Math.sign(dx) || 1;
  await moveTo(atk, 'none', inPos, big ? 300 : 230); if (tok.skip) return;
  let hp = ev.snap && ev.snap.units[ev.uid] ? ev.snap.units[ev.uid].hp + ev.dmg : null;
  const gap = Math.max(big ? 140 : 80, Math.min(big ? 300 : 220, (big ? 1100 : 760) / n));
  for (let k = 0; k < n; k++) {
    if (tok.skip) return;
    atk.animate([{ transform: inPos }, { transform: `${inPos} translate(${sgn * (big ? 16 : 10)}px, 0) rotate(${sgn * (big ? 7 : 5)}deg)` }, { transform: inPos }], { duration: dur(gap * 0.85), easing: 'ease-out' });
    shake(tk, big); slash(tk, big, k);
    if (hp != null) { hp -= parts[k]; setTokenHp(tk, ev.uid, hp); }
    hitPop(tk, `<b class="dnum ${ev.aff}">${parts[k]}</b>${k === 0 && ev.crit ? '<span class="crit">Critical</span>' : ''}`, k, big);
    await wait(gap, tok);
  }
  if (n > 1) hitPop(tk, `<span class="hittotal">${n} hits · <b class="dnum ${ev.aff}">${ev.dmg}</b></span>`, n, false, true);
  patchView(ev.snap);
  await moveTo(atk, inPos, 'none', 260);
}
// AoE NP: the attacker strikes every target at once on each hit.
async function strikeAll(atk, tks, evs, tok, big = true) { // big: NP; otherwise an AoE card attack (smaller, no glow)
  const n = Math.max(...evs.map(e => (e.dist || [100]).length));
  const parts = evs.map(e => splitDamage(e.dmg, (e.dist || [100])));
  const hp = evs.map(e => e.snap && e.snap.units[e.uid] ? e.snap.units[e.uid].hp + e.dmg : null);
  const avgY = evs.reduce((a, e) => a + tks[e.uid]._home.cy, 0) / evs.length;
  const fx0 = tks[evs[0].uid]._home.cx;
  const dx = (fx0 - atk._home.cx) * 0.42, dy = avgY - atk._home.cy;
  const inPos = `translate(${dx}px, ${dy}px) scale(${big ? 1.18 : 1.06})`;
  if (big) atk.classList.add('npglow');
  await moveTo(atk, 'none', inPos, big ? 340 : 260); if (tok.skip) return;
  const st = document.getElementById('stage');
  const gap = big ? Math.max(160, Math.min(320, 1300 / n)) : Math.max(120, Math.min(240, 800 / n));
  for (let k = 0; k < n; k++) {
    if (tok.skip) return;
    atk.animate([{ transform: inPos }, { transform: `${inPos} translate(${Math.sign(dx) * (big ? 18 : 10)}px, 0) scale(${big ? 1.06 : 1.03})` }, { transform: inPos }], { duration: dur(gap * 0.85), easing: 'ease-out' });
    if (st && big) { const w = document.createElement('div'); w.className = 'npwave' + (Math.sign(dx) < 0 ? ' rev' : ''); st.appendChild(w); setTimeout(() => w.remove(), 500); }
    evs.forEach((e, i) => {
      const tk = tks[e.uid]; if (!tk || k >= parts[i].length) return;
      shake(tk, big); slash(tk, big, k + i);
      if (hp[i] != null) { hp[i] -= parts[i][k]; setTokenHp(tk, e.uid, hp[i]); }
      hitPop(tk, `<b class="dnum ${e.aff}">${parts[i][k]}</b>`, k, big, false, tk._home.cx > atk._home.cx ? 'sL' : 'sR');
    });
    await wait(gap, tok);
  }
  evs.forEach(e => { if ((e.dist || []).length > 1) hitPop(tks[e.uid], `<span class="hittotal">${e.dist.length} hits · <b class="dnum ${e.aff}">${e.dmg}</b></span>`, n, false, true); });
  patchView(evs[evs.length - 1].snap);
  await moveTo(atk, inPos, 'none', big ? 300 : 240);
  atk.classList.remove('npglow');
}
// An NP that deals no damage still takes the stage: the user steps out with the allies it helps behind them and/or
// the enemies it hinders opposite. Allies shake and swell (buffed), enemies shake and shrink (debuffed).
async function supportNP(act, seq, tok) {
  const g = app.g; const me = g.units[act.uid]; const st = document.getElementById('stage');
  const allies = [], enemies = [];
  for (const ev of seq) {
    if (ev.uid == null || !g.units[ev.uid] || ev.uid === me.uid) continue;
    if (!['eff', 'hit', 'guts'].includes(ev.t) || (ev.t === 'hit' && !ev.dot && !ev.self)) continue;
    const list = g.units[ev.uid].side === me.side ? allies : enemies;
    if (!list.includes(ev.uid)) list.push(ev.uid);
  }
  const selfHit = seq.some(e => e.uid === me.uid && e.t === 'eff' && !e.miss);
  if (!allies.length && !enemies.length && !selfHit) return false;
  const s = pageRect(st);
  const w = Math.max(96, Math.min(140, s.w * 0.32));
  const dir = me.side === leftSide() ? 1 : -1;
  const myX = s.x + s.w * (dir > 0 ? 0.3 : 0.7), backX = myX - dir * w * 0.62, foeX = s.x + s.w * (dir > 0 ? 0.78 : 0.22);
  const team = [me.uid, ...allies];
  const figs = {};
  figs[me.uid] = spawnFighter(me.uid, enemies.length ? myX : s.x + s.w / 2 + (allies.length ? dir * w * 0.3 : 0), s.y + s.h / 2, w);
  allies.forEach((uid, k) => { figs[uid] = spawnFighter(uid, enemies.length ? backX : s.x + s.w / 2 - dir * w * 0.6, s.y + s.h * (k + 1) / (allies.length + 1), w * 0.9); figs[uid].style.zIndex = 1; });
  figs[me.uid].style.zIndex = 2;
  enemies.forEach((uid, k) => { figs[uid] = spawnFighter(uid, foeX, s.y + s.h * (k + 1) / (enemies.length + 1), w); });
  await wait(460, tok); if (tok.skip) return true;
  figs[me.uid].classList.add('npglow');
  await step(act, tok); if (tok.skip) return true;
  const pulse = (ids, cls) => ids.forEach(uid => { const f = figs[uid]; if (!f) return; f.classList.remove(cls); void f.offsetWidth; f.classList.add(cls); });
  const buffs = seq.some(e => e.t === 'eff' && !e.miss && g.units[e.uid] && g.units[e.uid].side === me.side);
  if (buffs) { pulse(team, 'buffed'); await wait(780, tok); if (tok.skip) return true; }
  if (enemies.length) {
    figs[me.uid].animate([{ transform: 'none' }, { transform: `translateX(${dir * 26}px) scale(1.05)`, offset: .4 }, { transform: 'none' }], { duration: dur(520), easing: 'ease-in-out' });
    await wait(200, tok); if (tok.skip) return true;
    pulse(enemies, 'debuffed'); await wait(780, tok); if (tok.skip) return true;
  }
  for (const ev of seq) { if (tok.skip) return true; await step(ev, tok); }
  figs[me.uid].classList.remove('npglow');
  await wait(200, tok); if (tok.skip) return true;
  arenaLayer().querySelectorAll('.fighter').forEach(sendHome);
  await wait(420, tok);
  return true;
}
async function arena(act, seq, tok) {
  const g = app.g; const me = g.units[act.uid];
  const foes = [];
  for (const ev of seq) {
    const isHit = ev.t === 'hit' && !ev.dot && !ev.self;
    const isBlock = ev.t === 'eff' && ev.miss && (ev.key === 'evade' || ev.key === 'invincible');
    if ((isHit || isBlock) && g.units[ev.uid].side !== me.side && !foes.includes(ev.uid)) foes.push(ev.uid);
  }
  const st = document.getElementById('stage');
  if (!foes.length && act.np && st && !seq.some(e => e.t === 'banner' && e.field)) { if (await supportNP(act, seq, tok)) return; }
  if (!foes.length || !st) { await step(act, tok); for (const ev of seq) { if (tok.skip) return; await step(ev, tok); } return; }
  // An NP that changes the battlefield (Archetype: Earth): announce it and crossfade to the new field first,
  // then bring the fighters out for the attack.
  let actDone = false;
  const fi = seq.findIndex(e => e.t === 'banner' && e.field);
  if (fi >= 0) {
    await step(act, tok); actDone = true; if (tok.skip) return;
    for (const ev of seq.slice(0, fi + 1)) { await step(ev, tok); if (tok.skip) return; }
    await wait(700, tok); if (tok.skip) return;   // let the new scene settle in
    seq = seq.slice(fi + 1);
  }
  const s = pageRect(st);
  const w = Math.max(104, Math.min(150, s.w * 0.36));
  const L = s.x + s.w * 0.22, Rx = s.x + s.w * 0.78;
  const myX = me.side === leftSide() ? L : Rx, foeX = me.side === leftSide() ? Rx : L;
  const atk = spawnFighter(me.uid, myX, s.y + s.h / 2, w);
  const tks = {};
  foes.forEach((uid, k) => { tks[uid] = spawnFighter(uid, foeX, s.y + s.h * (k + 1) / (foes.length + 1), w); });
  await wait(460, tok); if (tok.skip) return;
  if (!actDone) { await step(act, tok); if (tok.skip) return; }
  const done = new Set();
  for (const ev of seq) {
    if (tok.skip) return;
    const tk = tks[ev.uid];
    if (done.has(ev)) continue;
    if (ev.t === 'hit' && tk && ev.np && ev.aoe) {
      // gather this NP's hits on every target and land them together
      const group = seq.filter(e => e.t === 'hit' && e.np && e.src === ev.src && tks[e.uid] && !done.has(e));
      group.forEach(e => done.add(e));
      await strikeAll(atk, tks, group, tok); if (tok.skip) return;
    } else if (ev.t === 'hit' && tk && ev.aoe && !ev.np) {
      // an AoE card (or AoE Extra Attack): every enemy is hit together, on a regular-attack scale
      const group = seq.filter(e => e.t === 'hit' && e.aoe && !e.np && e.src === ev.src && tks[e.uid] && !done.has(e));
      group.forEach(e => done.add(e));
      if (group.length > 1) await strikeAll(atk, tks, group, tok, false); else await strikeOne(atk, tk, ev, tok, false);
      if (tok.skip) return;
    } else if (ev.t === 'hit' && tk) {
      await strikeOne(atk, tk, ev, tok, !!ev.np); if (tok.skip) return;
    } else if (ev.t === 'eff' && ev.miss && tk && (ev.key === 'evade' || ev.key === 'invincible')) {
      const dx = tk._home.cx - atk._home.cx;
      atk.animate([{ transform: 'none' }, { transform: `translateX(${dx * 0.45}px)`, offset: 0.5 }, { transform: 'none' }], { duration: dur(480), easing: 'ease-in-out' });
      await wait(220, tok); if (tok.skip) return;
      if (ev.key === 'evade') tk.animate([{ transform: 'none' }, { transform: `translateY(-18px)`, offset: 0.4 }, { transform: 'none' }], { duration: dur(420) });
      await step(ev, tok);
    } else await step(ev, tok);
  }
  if (tok.skip) return;
  await wait(200, tok);
  arenaLayer().querySelectorAll('.fighter').forEach(sendHome);
  await wait(420, tok);
}
async function play(evs, pre) {
  const tok = { skip: false };
  app.play = tok; app.view = pre; render();
  await wait(250, tok);
  const STOP = new Set(['tiebreak', 'tiebreak-pass', 'act', 'skill', 'master', 'seal', 'swap', 'banner', 'enter', 'phase']);
  for (let i = 0; i < evs.length; i++) {
    if (tok.skip || app.play !== tok) return;
    const ev = evs[i];
    if (ev.t === 'act') {
      let j = i + 1; while (j < evs.length && !(STOP.has(evs[j].t) && !(evs[j].t === 'banner' && evs[j].field))) j++;
      await arena(ev, evs.slice(i + 1, j), tok);
      i = j - 1; continue;
    }
    await step(ev, tok);
  }
  clearArena();
  if (app.play === tok) { app.play = null; app.view = null; render(); }
}
function skipPlay() { if (app.play) app.play.skip = true; app.play = null; app.view = null; clearArena(); document.querySelectorAll('.tbannounce').forEach(e => e.remove()); render(); }

// ---------------------------------------------------------------- Shell
// Full name (and where the servant stands) on hover, only when the name is cut off.
function whoIs(x) { const g = app.g; const P = g.players[x.side]; const k = P.front.indexOf(x.uid); return `${x.name} · ${PN(x.side)}, ${k >= 0 ? `field position ${k + 1}` : 'reserve'}`; }
function markTruncated(root) {
  root.querySelectorAll('.cname, .uname, .npname, .tname').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) el.setAttribute('data-tip', el.dataset.full || el.textContent);
    else el.removeAttribute('data-tip');
  });
}

// ---- Battlefield scenery: a persistent layer pinned behind the middle pane, so its looping animations
// don't restart on every re-render. Crossfades when the field changes.
const scene = { el: null, field: null, timer: null };
function sceneLayer() {
  if (!scene.el) {
    scene.el = document.createElement('div'); scene.el.id = 'scenes'; scene.el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(scene.el, document.body.firstChild);
    window.addEventListener('resize', placeScene);
    scene.timer = setInterval(placeScene, 400);
  }
  return scene.el;
}
function placeScene() {
  const l = scene.el; if (!l) return;
  const st = document.getElementById('stage');
  if (!st || app.screen !== 'battle') { l.hidden = true; return; }
  st.classList.add('scenic');
  const r = pageRect(st);
  l.hidden = false;
  const want = `${r.x}|${r.y}|${r.w}|${r.h}`;
  if (l._at === want) return;
  l._at = want; Object.assign(l.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function syncScene() {
  const l = sceneLayer();
  if (app.screen !== 'battle' || !app.g || !window.Scenes) { l.hidden = true; scene.field = null; l.innerHTML = ''; return; }
  placeScene();
  const g = app.g; const f0 = app.view && app.view.field !== undefined ? app.view.field : E.currentField(g);
  const neg = app.view && app.view.fieldNegated !== undefined ? app.view.fieldNegated : !!f0 && !E.fieldActive(g, f0);
  const f = f0 && neg && Scenes.has(f0 + ' Eclipse') ? f0 + ' Eclipse' : f0; // Tezcatlipoca blots out the sun
  if (f === scene.field) return;
  const first = scene.field == null; scene.field = f;
  const layer = document.createElement('div'); layer.className = 'scene'; layer.dataset.field = f || '';
  layer.innerHTML = f ? Scenes.sceneSVG(f) : '';
  const prev = [...l.querySelectorAll('.scene')];
  l.appendChild(layer);
  if (first) { prev.forEach(p => p.remove()); return; }
  const d = dur(1400);
  layer.animate([{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }], { duration: d, easing: 'cubic-bezier(.3,.6,.3,1)' });
  for (const p of prev) {
    const a = p.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'scale(.97)', filter: 'blur(3px)' }], { duration: d * 0.9, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => p.remove(); setTimeout(() => p.remove(), d + 300);
  }
  l.querySelectorAll('.scenename').forEach(n => n.remove());
  if (f) {
    const n = document.createElement('div'); n.className = 'scenename'; n.textContent = f0 && f !== f0 ? `Battlefield: ${E.fieldName(f0)} (eclipsed: it no longer counts)` : `Battlefield: ${E.fieldName(f)}`; l.appendChild(n);
    const a = n.animate([{ opacity: 0, translate: '-50% 8px' }, { opacity: 1, translate: '-50% 0', offset: 0.18 }, { opacity: 1, translate: '-50% 0', offset: 0.8 }, { opacity: 0, translate: '-50% 0' }], { duration: dur(2600), easing: 'ease-out', fill: 'forwards' });
    a.onfinish = () => n.remove();
  }
}
function render() {
  const root = $('#app');
  let html = '';
  if (app.screen === 'setup') html = renderSetup();
  else if (app.screen === 'landing') html = renderLanding();
  else if (app.screen === 'lobby') html = renderLobby();
  else if (app.screen === 'draft') html = netBar() + renderDraft();
  else if (app.screen === 'lineup') html = netBar() + renderLineup();
  else if (app.screen === 'fields') html = netBar() + renderFields();
  else if (app.screen === 'battle') html = renderBattle();
  root.innerHTML = html + netToast();
  markTruncated(root);
  syncScene();
  const ll = document.getElementById('logList'); if (ll) ll.scrollTop = ll.scrollHeight;
}
function affinityChart() {
  const C = E.CLASS_LIST;
  const cell = (a, d) => { const m = E.classMult({ cls: a }, { cls: d }); const k = m > 1.001 ? 'up' : m < 0.999 ? 'down' : 'even'; return `<td class="${k}" title="${a} attacking ${d}: ${m}×">${k === 'even' ? '' : m}</td>`; };
  return `<p class="hint">Damage multiplier when the row class attacks the column class. FGO's chart pulled halfway to neutral for PvP: 2× becomes 1.5×, 1.5× becomes 1.25×, 0.5× becomes 0.75×. Blank = 1×.</p>
    <div class="affwrap"><table class="afftable"><thead><tr><th scope="col"><span class="sr">Attacker \\ defender</span></th>${C.map(c => `<th scope="col" title="${c}">${CI(c)}</th>`).join('')}</tr></thead>
    <tbody>${C.map(a => `<tr><th scope="row">${CI(a)}<span>${a}</span></th>${C.map(d => cell(a, d)).join('')}</tr>`).join('')}</tbody></table></div>
    <ul class="triangles"><li><b>Knights:</b> Saber › Lancer › Archer › Saber</li><li><b>Cavalry:</b> Rider › Caster › Assassin › Rider</li><li><b>Extra I:</b> Ruler › Moon Cancer › Avenger › Ruler; Rulers take reduced damage from the six base classes</li><li><b>Extra II:</b> Alter Ego › Foreigner › Pretender › Alter Ego; Alter Ego half-beats Cavalry and is weak into Knights, Pretender the reverse</li><li><b>Beast I</b> (Sodom's Beast): 1.25× into the seven standard classes (1.5× into Berserker) and takes 0.75× from them; deals 0.75× to and takes 1.5× from every Extra class</li><li><b>Beast II</b> (Space Ereshkigal): 1.25× into Ruler, Moon Cancer, Alter Ego, Foreigner and Pretender and takes 0.75× from them; Avengers beat them (1.5× taken, 0.75× dealt); neutral to everyone else, Berserker included</li><li><b>Berserker:</b> deals and takes extra damage against everyone, except Shielder (neutral when Berserker attacks) and Foreigner (resists Berserkers and hits them hard)</li></ul>`;
}
function renderSetup() {
  if (app.browse) return renderBrowse('Before the draft');
  return `<div class="setup"><p class="eyebrow">Playtest build · servants 001–${String(Math.max(...POOL.map(d => d.id))).padStart(3, '0')} (${POOL.length} playable)</p><h1>Grand Order<br>PvP Playtest</h1>
    <p class="lede">Two players, one device. Snake-draft six servants under a ${E.CFG.costCap} cost cap with at most two 5★, set a lineup, then fight. Each turn both players secretly pick skills, then secretly pick three cards. Cards resolve slot by slot, and within a slot Quick goes before Arts, which goes before Buster. NPs move at their card type's speed.</p>
    <div class="opt-row"><button class="toggle" data-act="toggle-seals" role="switch" aria-checked="${app.opts.seals}"><span class="knob" aria-hidden="true"></span><span><b>Command Seals</b> ${app.opts.seals ? 'on' : 'off'}</span></button><span class="hint">Once per game, each player can fully heal a servant or give one +100% NP, on the field or in reserve.</span></div>
    <div class="row"><button class="primary" data-act="start-draft">Start the draft</button><button data-act="quick">Quick start with random teams</button><button data-act="browse-open">Browse servants &amp; kits</button>${ONLINE ? '<button data-act="net-home">Back to online play</button>' : ''}</div>
    <details class="affchart"><summary>Class affinity chart</summary>${affinityChart()}</details>
    <dl class="rules"><div><dt>Damage</dt><dd>ATK × card value × class and attribute affinity × buffs. Advantage 1.5×, disadvantage 0.75×, Berserker 1.5× both ways.</dd></div>
    <div><dt>NP gauge</dt><dd>NP Charge ATK × card NP value per hit, plus NP Charge DEF per hit taken. AoE NPs earn gauge from every target.</dd></div>
    <div><dt>NP level</dt><dd>3★ and below fire at NP5, 4★ and 5★ at NP1.</dd></div>
    <div><dt>Turn limit</dt><dd>${E.CFG.turnLimit} turns, then most servants left; if tied, the higher average HP % across surviving servants.</dd></div></dl></div>`;
}

// ---------------------------------------------------------------- Online
// The server keeps each player's hidden choices (battlefields, lineup, skills, cards) private until both lock in,
// then broadcasts them. Every browser replays those moves through the same engine with the same seed, so all
// screens show the identical battle. Moves arrive in an inbox and play one at a time, after any animation.
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
function netInit() {
  const n = app.net = { sock: null, me: null, token: store.get('fgoToken'), name: store.get('fgoName') || '', code: (location.pathname.match(/^\/r\/([A-Za-z]{4})/) || [])[1] || '', room: null, match: null, seat: null, inbox: [], busy: false, locked: [false, false], toast: null, confirmEnd: false, connected: false };
  if (n.code) n.code = n.code.toUpperCase();
  const s = n.sock = window.io({ transports: ['websocket', 'polling'] });
  s.on('connect', () => {
    n.connected = true;
    s.emit('hello', { token: n.token, name: n.name }, r => {
      if (!r || r.error) return toast(r ? r.error : 'Could not connect.');
      n.token = r.token; n.me = r.id; store.set('fgoToken', r.token);
      if (!r.code && !app.localPlay) { n.room = null; n.match = null; resetBattleView(); app.screen = 'landing'; render(); }
    });
    if (app.screen === 'landing' || app.screen === 'lobby') render();
  });
  s.on('disconnect', () => { n.connected = false; toast('Connection lost. Reconnecting…', 6000); });
  s.on('room', room => {
    n.room = room;
    if (app.localPlay) return;
    if (NET()) { if (!app.play && !app.turnIntro) render(); return; }
    if (app.screen !== 'lobby') { resetBattleView(); app.screen = 'lobby'; }
    render();
  });
  s.on('match', m => {
    if (app.localPlay) return;
    if (!m) { n.match = null; n.seat = null; n.inbox = []; n.busy = false; resetBattleView(); app.screen = n.room ? 'lobby' : 'landing'; return render(); }
    if (n.match && n.match.id === m.id) { // reconnect: queue only what we missed
      for (let k = n.match.got; k < m.actions.length; k++) inbox({ kind: 'action', a: m.actions[k] });
      n.match.got = Math.max(n.match.got, m.actions.length);
      if (m.phase === 'over') inbox({ kind: 'over', winner: m.winner, next: m.next });
      return;
    }
    loadMatch(m);
  });
  s.on('action', d => { const M = n.match; if (!M || d.id !== M.id || d.n < M.got) return; M.got = d.n + 1; inbox({ kind: 'action', a: d.a }); });
  s.on('locked', d => { const M = n.match; if (!M || d.id !== M.id) return; inbox({ kind: 'locked', p: d.p, what: d.kind }); });
  s.on('over', d => { const M = n.match; if (!M || d.id !== M.id) return; inbox({ kind: 'over', winner: d.winner, next: d.next }); });
}
function netSend(ev, data) {
  const n = app.net; if (!n || !n.sock) return Promise.resolve({ error: 'Offline' });
  return new Promise(res => n.sock.emit(ev, data, r => { if (r && r.error) toast(r.error); res(r || {}); }));
}
function toast(msg, ms = 3500) { if (!app.net) return; app.net.toast = msg; clearTimeout(app.net.toastT); app.net.toastT = setTimeout(() => { app.net.toast = null; const t = document.querySelector('.nettoast'); if (t) t.remove(); }, ms); const old = document.querySelector('.nettoast'); if (old) old.remove(); $('#app').insertAdjacentHTML('beforeend', netToast()); }
function netToast() { return app.net && app.net.toast ? `<div class="nettoast" role="status">${esc(app.net.toast)}</div>` : ''; }
function resetBattleView() { app.browse = null; if (app.play) app.play.skip = true; app.play = null; app.view = null; app.turnIntro = null; clearArena(); document.querySelectorAll('.tbannounce').forEach(e => e.remove()); app.g = null; app.draft = null; app.fieldPick = null; app.lineup = null; app.fields = null; app.affChart = false; app.statsOpen = false; }
// A new match (or joining one in progress): rebuild it by replaying every public move instantly.
function loadMatch(m) {
  const n = app.net; resetBattleView();
  n.match = { id: m.id, seats: m.seats, names: m.names, seed: m.seed, first: m.first, seals: m.seals, got: m.actions.length, winner: m.winner, next: m.next, over: m.phase === 'over', cpu: m.cpu };
  n.seat = m.seats.indexOf(n.me); if (n.seat < 0) n.seat = null;
  n.inbox = []; n.busy = false; n.locked = [false, false]; n.confirmEnd = false;
  startDraft(m.first);
  for (const a of m.actions) applyAction(a, true);
  n.locked = (m.locked || [false, false]).slice();
  // pick up where this browser left off
  if (m.phase === 'fields' && app.fieldPick) app.fieldPick.sent = n.seat != null && n.locked[n.seat];
  if (m.phase === 'lineup') { const F = app.fieldPick; app.lineup = { p: n.seat ?? 0, orders: [[], []], teams: F.teams, sent: n.seat != null && n.locked[n.seat] }; app.screen = 'lineup'; }
  if (app.g) {
    const u = app.ui; u.actor = n.seat;
    if (app.g.over || m.phase === 'over') u.stage = 'over';
    else { const st = m.stage || 'skills'; u.stage = n.seat != null && n.locked[n.seat] ? 'wait' : st; u.waitFor = st; }
  }
  render();
  if (app.screen === 'draft') autoPickSoon();
}
function inbox(item) { app.net.inbox.push(item); pump(); }
async function pump() {
  const n = app.net; if (n.busy) return;
  n.busy = true;
  try {
    while (n.inbox.length) {
      const it = n.inbox.shift(); const M = n.match; if (!M) break;
      if (it.kind === 'locked') { n.locked[it.p] = true; if (!app.play && !app.turnIntro) render(); continue; }
      if (it.kind === 'over') { M.winner = it.winner; M.next = it.next; M.over = true; if (!app.play && !app.turnIntro) render(); continue; }
      await applyAction(it.a, false);
      if (n.match !== M) break;
    }
  } catch (e) { console.error(e); toast('Something went wrong showing that move. Refresh the page to catch up.', 8000); }
  n.busy = false;
}
const sleep = ms => new Promise(r => setTimeout(r, app.fast ? ms * 0.4 : ms));
const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
const stateHash = g => { let h = 0; const s = Object.values(g.units).map(u => `${u.uid}:${Math.round(u.hp)}:${Math.floor(u.np)}:${u.dead ? 1 : 0}`).join('|') + `#${g.turn}`; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
function checkSync(a) { if (a.h != null && stateHash(app.g) !== a.h) { console.warn('Out of sync with the server', a); toast('This screen fell out of sync. Refresh the page to catch up.', 10000); } }
async function applyAction(a, instant) {
  const n = app.net;
  if (a.t === 'pick') return applyPick(a.p, a.id, instant);
  if (a.t === 'fields') {
    const F = app.fieldPick; F.result = a.result; F.owner = a.owner; app.fields = a.result; n.locked = [false, false];
    if (instant) { app.lineup = { p: n.seat ?? 0, orders: [[], []], teams: F.teams, sent: false }; app.screen = 'lineup'; return; }
    return render();
  }
  if (a.t === 'lineup') {
    n.locked = [false, false];
    return startBattle(a.orders, { initiative: a.initiative, instant, mcs: a.mcs });
  }
  const g = app.g; const u = app.ui;
  if (a.t === 'orderChange') {
    const pre = app.view || E.snap(g);
    let evs = [];
    if (!instant) g.fx = [];
    const result = E.activateOrderChange(g, a.p, a.out, a.in);
    if (!instant) { evs = g.fx; g.fx = null; }
    if (!result.ok) throw new Error(result.why);
    checkSync(a);
    if (u.stage === 'wait-swap') u.stage = 'skills';
    u.targeting = null;
    if (instant) return;
    const notice = evs.find(e => e.t === 'swapNotice');
    app.view = pre; render();
    if (notice) banner(`Order Change incoming: ${g.units[notice.out].name} out, ${g.units[notice.in].name} in`, notice.p);
    return;
  }
  if (a.t === 'skills') {
    for (let q = 0; q < 2; q++) { const P = g.players[q]; P.skillQueue = clone(a.q[q].skillQueue) || []; P.masterQueue = clone(a.q[q].masterQueue) || []; P.sealQueue = clone(a.q[q].sealQueue); }
    g.qseq = a.qseq; n.locked = [false, false]; u.targeting = null; u.sel = []; u.pendingSlot = null;
    if (instant) { E.resolveSkills(g); checkSync(a); u.stage = g.over ? 'over' : 'cards'; return; }
    if (app.turnIntro) { app.turnIntro.skip = true; app.turnIntro = null; document.querySelectorAll('.tbannounce').forEach(e => e.remove()); }
    u.revealFrom = g.log.length;
    const pre = app.view || E.snap(g); g.fx = []; E.resolveSkills(g); const evs = g.fx; g.fx = null; checkSync(a);
    u.stage = 'skills-reveal'; u.cover = null;
    await play(evs, pre);
    if (g.over) { u.stage = 'over'; return render(); }
    if (isSpec()) { await sleep(900); if (NET() && app.g === g && u.stage === 'skills-reveal') beginStage('cards', null); }
    return;
  }
  if (a.t === 'cards') {
    const pick = q => a.sel[q].map(s => ({ ...E.availableNPs(g, q).concat(g.players[q].hand).find(c => c.id === s.id), target: s.target }));
    const sels = [pick(0), pick(1)];
    for (let q = 0; q < 2; q++) E.setCards(g, q, sels[q]);
    n.locked = [false, false]; u.sel = []; u.pendingSlot = null;
    if (instant) { E.resolveCards(g); checkSync(a); u.stage = g.over ? 'over' : 'skills'; return; }
    u.revealFrom = g.log.length;
    const pre = E.snap(g); g.fx = []; E.resolveCards(g); const evs = g.fx; g.fx = null; checkSync(a);
    u.stage = g.over ? 'over' : 'cards-reveal'; u.cover = null;
    await play(evs, pre);
    if (!g.over && isSpec()) { await sleep(900); if (NET() && app.g === g && u.stage === 'cards-reveal') await startTurnUI(); }
    return;
  }
}
// Shared "waiting" panel for the hidden-choice steps.
function waitScreen(eyebrow, title, text, what) {
  const M = NET(); const st = p => `<li class="${app.net.locked[p] ? 'done' : ''}"><b>${esc(PN(p))}</b><span>${app.net.locked[p] ? 'Locked in ✓' : 'Choosing…'}</span></li>`;
  return `<div class="lineup waitpanel"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p class="hint">${esc(text)}</p>${M ? `<ul class="lockstat">${st(0)}${st(1)}</ul>` : ''}</div>`;
}
function amHost() { const n = app.net; return !!(n && n.room && n.room.host === n.me); }
// Strip above every match screen: who's fighting, your role, and the host's way back to the lobby.
function netBar() {
  const M = NET(); if (!M) return '';
  const n = app.net; const you = n.seat == null ? 'Spectating' : `You are ${n.seat === 0 ? 'Player 1' : 'Player 2'}`;
  const watchers = n.room ? n.room.players.filter(p => !M.seats.includes(p.id)).length : 0;
  return `<div class="netbar"><span class="nbroom">Room <b>${esc(n.room ? n.room.code : '')}</b></span><span class="nbvs"><b class="c0">${esc(M.names[0])}</b> vs <b class="c1">${esc(M.names[1])}</b></span><span class="nbrole">${you}${watchers ? ` · ${watchers} watching` : ''}</span>${n.seat == null && n.room ? (() => { const inQ = n.room.queue.includes(n.me); const k = n.room.queue.filter(id => !M.seats.includes(id)).indexOf(n.me); return `<button class="nbq" data-act="net-role" data-r="${inQ ? 'spectate' : 'queue'}">${inQ ? `In the battle queue (#${k + 1} next) · Leave` : 'Join the battle queue'}</button>`; })() : ''}${!n.connected ? '<span class="nboff">Reconnecting…</span>' : ''}${amHost() && !M.over ? `<button class="nbend${n.confirmEnd ? ' armed' : ''}" data-act="net-end">${n.confirmEnd ? 'Tap again to end the battle' : 'End battle'}</button>` : ''}</div>`;
}
function netTurnBar() {
  const g = app.g; const u = app.ui; const n = app.net; const M = NET(); const me = n.seat;
  const status = p => `<span class="lk${n.locked[p] ? ' done' : ''}">${esc(PN(p))}: ${n.locked[p] ? 'locked in ✓' : 'choosing…'}</span>`;
  const what = u.stage === 'wait' ? (u.waitFor || 'skills') : u.stage;
  if (u.stage === 'wait-swap') return `<div class="turnbar"><p><b>Order Change is activating…</b> Waiting for the field update before choosing skills.</p></div>`;
  if (u.stage === 'over') {
    const w = g.winner; const iWon = M.cpu != null ? me != null : w === 'draw' ? me != null : me === w; // vs the CPU the human always gets the buttons
    const head = `<p><b>${w === 'draw' ? 'Draw' : `${esc(PN(w))} wins`}</b> on turn ${g.turn}. Servants left: ${esc(PN(0))} ${E.aliveCount(g, 0)}, ${esc(PN(1))} ${E.aliveCount(g, 1)}.${g.limitBy === 'hp' ? ` Average HP left: ${Math.round(E.hpPct(g, 0) * 100)}% vs ${Math.round(E.hpPct(g, 1) * 100)}%.` : ''}</p>`;
    if (!M.over) return `<div class="turnbar over">${head}<p class="hint">Wrapping up…</p></div>`;
    const btns = postGameButtons();
    const who = w === 'draw' ? 'either player' : PN(w);
    return `<div class="turnbar over">${head}<div class="row">${btns || `<p class="hint">Waiting for ${esc(who)} to start the next battle or return everyone to the lobby.</p>`}<button data-act="open-stats">Battle stats</button></div></div>`;
  }
  if (u.stage === 'skills' || u.stage === 'cards' || u.stage === 'wait') {
    if (me == null) return `<div class="turnbar"><p><b>Players are choosing ${what}.</b> ${status(0)} ${status(1)}</p></div>`;
    if (u.stage === 'wait') return `<div class="turnbar"><p><b>Locked in.</b> Waiting for ${esc(PN(1 - me))} to choose ${what}… ${status(1 - me)}</p></div>`;
    return `<div class="turnbar"><p>Choose your ${what} in the panel under your team. ${status(1 - me)}</p></div>`;
  }
  if (me == null && (u.stage === 'skills-reveal' || u.stage === 'cards-reveal')) return `<div class="turnbar"><p><b>${u.stage === 'skills-reveal' ? 'Skills resolved.' : 'Turn resolved.'}</b> Up next: ${u.stage === 'skills-reveal' ? 'cards' : `turn ${g.turn}`}.</p></div>`;
  return null;
}
function renderLanding() {
  const n = app.net;
  return `<div class="landing"><p class="eyebrow">Online rooms · up to 6 people</p><h1>Grand Order<br>PvP</h1>
    <p class="lede">Create a room and share the code. Two people fight from the battle queue while everyone else watches from the stands; the winner takes on the next challenger.</p>
    <div class="lform">
      <label class="fld"><span>Your name</span><input id="nameIn" maxlength="20" autocomplete="nickname" value="${esc(n.name)}" placeholder="Master"></label>
      <button class="primary big" data-act="net-create" ${n.connected ? '' : 'disabled'}>Create a room</button>
      <div class="or"><span>or join one</span></div>
      <div class="joinrow"><label class="fld"><span>Room code</span><input id="codeIn" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(n.code)}" placeholder="ABCD"></label><button data-act="net-join" ${n.connected ? '' : 'disabled'}>Join</button></div>
      ${n.connected ? '' : '<p class="hint">Connecting to the server…</p>'}
    </div>
    <p class="hint"><button class="linkbtn" data-act="net-local">Play on one device instead</button></p></div>`;
}
// Servant list and kits, for looking around while waiting for a battle (lobby and the one-device setup screen).
function renderBrowse(where) {
  const S = app.browse; const f = S.focus ? R[S.focus] : null;
  return `<div class="browse"><div class="bhead"><div><p class="eyebrow">${esc(where)}</p><h2>Servants &amp; kits</h2><p class="hint">Tap a servant to read their skills, NP and passives.</p></div><div class="row"><button class="chartbtn" data-act="aff-chart">Class chart</button><button class="primary" data-act="browse-close">Done</button></div></div>
    ${renderPool(S, null)}</div>${f ? modal(servantDetail(f), '<button data-act="close-detail">Back</button>', 'close-detail', f.name) : ''}${app.affChart ? affChart() : ''}`;
}
function renderLobby() {
  const n = app.net; const room = n.room; if (!room) return renderLanding();
  if (app.browse) return renderBrowse(`Room ${room.code}`);
  const host = amHost(); const me = room.players.find(p => p.id === n.me);
  const by = id => room.players.find(p => p.id === id);
  const tag = p => `${p.id === room.host ? '<span class="ptag host">Host</span>' : ''}${p.id === n.me ? '<span class="ptag you">You</span>' : ''}${p.online ? '' : '<span class="ptag off">Away</span>'}`;
  const queue = room.queue.map(by).filter(Boolean);
  const stands = room.players.filter(p => !room.queue.includes(p.id));
  const ready = queue.filter(p => p.online);
  const inQ = room.queue.includes(n.me);
  const link = `${location.origin}/r/${room.code}`;
  return `<div class="lobby"><div class="lhead"><div><p class="eyebrow">Room code</p><h1 class="roomcode">${esc(room.code)}</h1></div>
      <div class="row"><button data-act="net-copy" data-link="${esc(link)}">Copy invite link</button><button data-act="net-leave">Leave room</button></div></div>
    ${room.notice ? `<p class="notice">${esc(room.notice)}</p>` : ''}
    <div class="lgrid">
      <section class="lcol"><h3>Battle queue <small>${queue.length}</small></h3>
        <ol class="plist">${queue.map((p, k) => `<li class="${k < 2 ? 'next' : ''}"><span class="qn">${k + 1}</span><b>${esc(p.name)}</b>${tag(p)}${k < 2 ? '<span class="ptag up">Up next</span>' : ''}</li>`).join('') || '<li class="hint">Nobody is queued.</li>'}</ol></section>
      <section class="lcol"><h3>Spectator stands <small>${stands.length}</small></h3>
        <ul class="plist">${stands.map(p => `<li><b>${esc(p.name)}</b>${tag(p)}</li>`).join('') || '<li class="hint">Empty.</li>'}</ul></section>
    </div>
    <div class="lactions">
      ${me ? `<button data-act="net-role" data-r="${inQ ? 'spectate' : 'queue'}">${inQ ? 'Go to the spectator stands' : 'Join the battle queue'}</button>` : ''}
      ${host ? `<button class="toggle" data-act="net-seals" role="switch" aria-checked="${room.opts.seals}"><span class="knob" aria-hidden="true"></span><span><b>Command Seals</b> ${room.opts.seals ? 'on' : 'off'}</span></button>
        <button class="primary" data-act="net-start" ${ready.length >= 2 ? '' : 'disabled'}>${ready.length >= 2 ? `Start battle: ${esc(ready[0].name)} vs ${esc(ready[1].name)}` : 'Start battle (needs 2 in the queue)'}</button>` : `<p class="hint">${ready.length >= 2 ? `Waiting for the host to start ${esc(ready[0].name)} vs ${esc(ready[1].name)}.` : 'Waiting for two people in the battle queue.'}</p>`}
      ${host ? '<button data-act="net-cpu" title="Fight a computer opponent. Anyone else in the room watches.">Battle the CPU</button>' : ''}
      <button data-act="browse-open">Browse servants &amp; kits</button>
      <button class="chartbtn" data-act="aff-chart">Class chart</button>
    </div>
    <p class="hint">Up to 6 people per room. The top two in the queue fight; after each battle the winner stays on and the loser goes to the back of the queue.</p>
    ${app.affChart ? affChart() : ''}</div>`;
}
async function netClick(a, el) {
  const n = app.net; if (!n) return;
  const nameIn = document.getElementById('nameIn'); const codeIn = document.getElementById('codeIn');
  if (nameIn) { n.name = nameIn.value.trim(); store.set('fgoName', n.name); }
  if (codeIn) n.code = codeIn.value.trim().toUpperCase();
  switch (a) {
    case 'net-create': { const r = await netSend('create', { name: n.name }); if (r.ok) { if (!NET()) app.screen = 'lobby'; history.replaceState(null, '', `/r/${r.code}`); render(); } return; }
    case 'net-join': { if (!/^[A-Z]{4}$/.test(n.code)) return toast('Room codes are 4 letters.'); const r = await netSend('join', { code: n.code, name: n.name }); if (r.ok) { if (!NET()) app.screen = 'lobby'; history.replaceState(null, '', `/r/${n.code}`); render(); } return; }
    case 'net-leave': await netSend('leave', {}); n.room = null; n.match = null; app.screen = 'landing'; history.replaceState(null, '', '/'); return render();
    case 'net-role': return netSend('role', { role: el.dataset.r });
    case 'net-seals': return netSend('opts', { seals: !(n.room && n.room.opts.seals) });
    case 'net-start': return netSend('start', {});
    case 'net-cpu': return netSend('startCpu', {});
    case 'net-copy': { const link = el.dataset.link; try { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } catch (_) { toast(link, 8000); } return; }
    case 'net-local': app.localPlay = true; app.screen = 'setup'; return render();
    case 'net-home': app.localPlay = false; resetBattleView(); app.screen = n.room ? 'lobby' : 'landing'; return render();
    case 'net-end': if (!n.confirmEnd) { n.confirmEnd = true; render(); setTimeout(() => { if (n.confirmEnd) { n.confirmEnd = false; render(); } }, 4000); return; } n.confirmEnd = false; return netSend('end', {});
    case 'net-go': return netSend('post', { choice: 'go' });
    case 'net-lobby': return netSend('post', { choice: 'lobby' });
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && app.screen === 'landing' && e.target.id) { e.preventDefault(); netClick(e.target.id === 'codeIn' ? 'net-join' : 'net-create', e.target); } });

// ---- Mystic Codes: a shirt next to each player's name (white: Normal Chaldean Uniform, purple: Atlas Academy Uniform)
const MC_ICON = { chaldea: 'mcChaldea', atlas: 'mcAtlas' };
function mcBadge(mc, size = 'sm') {
  const M = E.MYSTIC[mc] || E.MYSTIC.chaldea;
  return `<span class="mcbadge" data-tip="${esc(`Mystic Code: ${M.n}\n${M.skills.map(s => `${s.n} (CD ${s.cd}): ${s.text}`).join('\n')}`)}" tabindex="0">${I.badge(MC_ICON[mc] || 'mcChaldea', { plain: true, size })}</span>`;
}
function mcPicker(L, p) {
  const cur = (L.mc && L.mc[p]) || 'chaldea';
  return `<div class="mcpick"><p class="eyebrow">Mystic Code</p><div class="mcopts">${Object.entries(E.MYSTIC).map(([k, M]) => `<button class="mcopt${cur === k ? ' on' : ''}" data-act="mc-pick" data-mc="${k}" aria-pressed="${cur === k}">${I.badge(MC_ICON[k], { plain: true, size: 'lg' })}<span class="mctxt"><b>${esc(M.n)}</b><small>${M.skills.map(s => `${esc(s.n)} <i>CD ${s.cd}</i>`).join(' · ')}</small></span></button>`).join('')}</div></div>`;
}
// ---- Battle stats and the victory announcement
const STAT_COLS = [
  ['dealt', 'Damage dealt', 'Dealt'], ['taken', 'Damage taken', 'Taken'], ['healed', 'HP restored to them', 'Healed'], ['healGiven', 'HP they restored to allies', 'Heal given'],
  ['npGain', 'NP gauge gained (%)', 'NP +'], ['npLost', 'NP gauge lost to enemy drain or effects (%)', 'NP −'], ['best', 'Highest damage from a single attack or NP', 'Best hit'],
  ['attacks', 'Attacks that landed (an AoE card counts once)', 'Hits'], ['nps', 'Noble Phantasms fired', 'NPs'], ['buffs', 'Buffs received', 'Buffs'], ['debuffs', 'Debuffs received', 'Debuffs'],
  ['kills', 'Enemies defeated', 'KOs'], ['evaded', 'Attacks evaded or blocked', 'Dodged'], ['turns', 'Turns spent on the field', 'Turns'],
];
const fmtStat = (k, v) => (k === 'npGain' || k === 'npLost' ? `${Math.round(v)}%` : Math.round(v).toLocaleString());
function statsTable(g, p, lead) {
  const S = g.stats || {}; const sort = app.statsSort || 'dealt';
  const star = mvp(g, p); const won = g.over && g.winner === p; const lost = g.over && g.winner !== p && g.winner !== 'draw';
  const mvpTag = `<span class="mvptag${won ? ' win' : lost ? ' lose' : ''}" data-tip="${esc(won ? 'MVP of the winning team' : lost ? 'MVP of the losing team' : 'Team MVP so far')}">MVP</span>`;
  const rows = g.players[p].order.map(id => ({ u: g.units[id], s: S[id] || {} })).sort((a, b) => (b.s[sort] || 0) - (a.s[sort] || 0));
  const tot = k => rows.reduce((a, r) => a + (r.s[k] || 0), 0);
  return `<section class="stteam p${p}"><h4>${esc(PN(p))}${mcBadge(g.players[p].mc)}${g.winner === p ? ' <span class="wtag">Winner</span>' : ''}</h4><div class="sttable"><table>
    <thead><tr><th class="sname">Servant</th>${STAT_COLS.map(([k, tip, lbl]) => `<th><button class="sth${sort === k ? ' on' : ''}" data-act="stats-sort" data-k="${k}" data-tip="${esc(tip)}">${lbl}</button></th>`).join('')}</tr></thead>
    <tbody>${rows.map(({ u, s }) => `<tr class="${u.dead ? 'ko' : ''}${star && star.uid === u.uid ? ' mvprow' : ''}"><td class="sname">${CI(u.cls)}<span>${esc(u.name)}</span>${star && star.uid === u.uid ? mvpTag : ''}${u.dead ? '<small>KO</small>' : ''}</td>${STAT_COLS.map(([k]) => `<td class="${(s[k] || 0) > 0 && lead[k] === u.uid ? 'lead' : ''}"${k === 'best' && s.bestWhat ? ` data-tip="${esc(s.bestWhat)}"` : ''}>${(s[k] || 0) ? fmtStat(k, s[k]) : '<span class="z">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td class="sname">Team</td>${STAT_COLS.map(([k]) => `<td>${k === 'best' ? fmtStat(k, Math.max(0, ...rows.map(r => r.s.best || 0))) : fmtStat(k, tot(k))}</td>`).join('')}</tr></tfoot></table></div></section>`;
}
function statsLeaders(g) { const lead = {}; for (const [k] of STAT_COLS) { let best = 0; for (const [id, s] of Object.entries(g.stats || {})) if ((s[k] || 0) > best) { best = s[k]; lead[k] = +id; } } return lead; }
// MVP score: damage (Burn/Curse/Poison included), KOs and healing given, with a little for buffs received.
function mvp(g, side) {
  if (!g.stats) return null; let best = null, sc = -1;
  for (const [id, s] of Object.entries(g.stats)) { if (side != null && g.units[id].side !== side) continue; const v = s.dealt + s.healGiven * 0.8 + s.kills * 600 + s.buffs * 10; if (v > sc) { sc = v; best = +id; } }
  return best != null ? g.units[best] : null;
}
function statsModal() {
  const g = app.g; const lead = statsLeaders(g); const L = leftSide();
  return modal(`<div class="statsbox"><p class="eyebrow">Turn ${g.turn}${g.over ? ' · final' : ' · so far'}</p><h3>Battle stats</h3><p class="hint">Gold marks the top servant in each column. Tap a column to sort; tap or hover a Best hit to see what it was.</p>${statsTable(g, L, lead)}${statsTable(g, 1 - L, lead)}</div>`, '', 'close-stats', 'Battle stats');
}
// What can be done once a battle ends: online, the winner (or the human vs the CPU) moves on and the host can
// always return everyone to the lobby; on one device, a rematch or a new draft.
function postGameButtons() {
  const g = app.g; const M = NET();
  if (!M) return '<button class="primary" data-act="rematch">Rematch, same teams</button><button data-act="new-draft">New draft</button>';
  if (!M.over) return '';
  const w = g.winner, me = SEAT(); const iWon = M.cpu != null ? me != null : w === 'draw' ? me != null : me === w;
  return (iWon ? `<button class="primary" data-act="net-go">${M.next === 'next' ? 'Play Next Matchup' : 'Play Again'}</button>` : '') + (iWon || amHost() ? '<button data-act="net-lobby">Return to Lobby</button>' : '');
}
function victoryOverlay() {
  const g = app.g; const w = g.winner; const M = NET(); const me = M ? SEAT() : null;
  const title = w === 'draw' ? 'Draw' : me != null ? (me === w ? 'Victory!' : 'Defeat') : `${PN(w)} wins!`;
  const sub = w === 'draw' ? 'Neither side could finish the other.' : me != null ? (me === w ? `You beat ${PN(1 - w)}` : `${PN(w)} wins`) : `over ${PN(1 - w)}`;
  const why = `${g.limitBy ? (g.limitBy === 'hp' ? `Turn ${E.CFG.turnLimit} reached · decided on average HP left` : `Turn ${E.CFG.turnLimit} reached · more servants standing`) : `Turn ${g.turn} · ${w === 'draw' ? '' : `${E.aliveCount(g, w)} servant${E.aliveCount(g, w) === 1 ? '' : 's'} left standing`}`}`;
  const star = mvp(g, w === 'draw' ? null : w); const s = star && g.stats[star.uid];
  const other = w === 'draw' ? null : mvp(g, 1 - w); const so = other && g.stats[other.uid];
  const side = w === 'draw' ? '' : ` p${w}`;
  return `<div class="victory${me != null && me !== w && w !== 'draw' ? ' lost' : ''}${side}" role="dialog" aria-label="${esc(title)}"><div class="vcard">
    <div class="vrays" aria-hidden="true"></div>
    <p class="eyebrow">Battle over</p><h2 class="vtitle">${esc(title)}</h2><p class="vsub">${esc(sub)}</p><p class="vwhy">${esc(why)}</p>
    ${other && so ? `<p class="vmvp2"><span class="mvptag lose">MVP</span> ${esc(PN(1 - w))}: <b>${esc(other.name)}</b> · ${so.dealt.toLocaleString()} damage · ${so.kills} KO${so.kills === 1 ? '' : 's'}</p>` : ''}
    ${star ? `<div class="vmvp"><span class="eyebrow">${w === 'draw' ? 'MVP' : `MVP · ${esc(PN(w))}`}</span><b>${CI(star.cls)}${esc(star.name)}</b><span>${s.dealt.toLocaleString()} damage · ${s.kills} KO${s.kills === 1 ? '' : 's'}${s.healGiven ? ` · ${Math.round(s.healGiven).toLocaleString()} healed` : ''}</span></div>` : ''}
    <div class="row vbtns">${postGameButtons()}</div>
    <div class="row vbtns"><button data-act="open-stats">See battle stats</button><button data-act="victory-close">Back to the field</button></div></div></div>`;
}
// ---- Tooltips: hover or focus on desktop, tap on touch screens
const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
let tipFor = null;
function showTip(el) {
  const t = el.getAttribute('data-tip'); if (!t) return;
  tipFor = el; tip.textContent = t; tip.hidden = false;
  const r = el.getBoundingClientRect(); const w = Math.min(320, window.innerWidth - 24);
  tip.style.maxWidth = w + 'px';
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2; x = Math.max(12, Math.min(window.innerWidth - tw - 12, x));
  let y = r.top - th - 8; if (y < 8) y = r.bottom + 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { tip.hidden = true; tipFor = null; }
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el && el !== tipFor) showTip(el); else if (!el && tipFor) hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
window.addEventListener('scroll', hideTip, true);
// Typing in the draft search re-renders the list and keeps the cursor in the box.
document.addEventListener('input', e => {
  if (e.target.id !== 'draftSearch' || !PS()) return;
  PS().search = e.target.value; const pos = e.target.selectionStart;
  render();
  const i = document.getElementById('draftSearch'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (_) {} }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hideTip();
    if (app.affChart) { app.affChart = false; render(); }
    else if (app.screen === 'draft' && app.draft && app.draft.focus) { app.draft.focus = null; render(); }
    else if (app.screen === 'battle' && app.ui.focus) { app.ui.focus = null; render(); }
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.unit[data-act]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('click', ev => {
  const tipEl = ev.target.closest('.badge[data-tip], .usedsk, .logic');
  if (tipEl) { ev.stopPropagation(); if (tipFor === tipEl) hideTip(); else showTip(tipEl); return; }
  hideTip();
  if (app.draft && app.draft.modeMenu && !ev.target.closest('.dmode')) { app.draft.modeMenu = false; render(); }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const g = app.g; const u = app.ui;
  switch (a) {
    case 'start-draft': return startDraft();
    case 'quick': return quickStart();
    case 'filter': PS().filter = el.dataset.c; return render();
    case 'role': PS().role = el.dataset.r; return render();
    case 'rar': PS().rar = el.dataset.r; return render();
    case 'focus': PS().focus = +el.dataset.id; return render();
    case 'close-detail': PS().focus = null; return render();
    case 'search-mode-menu': PS().modeMenu = !PS().modeMenu; return render();
    case 'search-mode': { PS().mode = el.dataset.m; PS().modeMenu = false; render(); const i = document.getElementById('draftSearch'); if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } return; }
    case 'search-clear': PS().search = ''; render(); { const i = document.getElementById('draftSearch'); if (i) i.focus(); } return;
    case 'noop': return;
    case 'pick': return draftPick(+el.dataset.id);
    case 'browse-open': app.browse = { filter: 'All', rar: 'All', role: 'All', search: '', mode: 'servant', modeMenu: false, focus: null, taken: new Set() }; return render();
    case 'browse-close': app.browse = null; return render();
    case 'runit': u.focus = +el.dataset.uid; return render();
    case 'order': { const L = app.lineup; const o = L.orders[L.p]; const id = +el.dataset.id; const k = o.indexOf(id); if (k >= 0) o.splice(k, 1); else o.push(id); return render(); }
    case 'field': { const F = app.fieldPick; const m = F.picks[F.p]; const f = el.dataset.f; const k = m.indexOf(f); if (k >= 0) m.splice(k, 1); else if (m.length < 3) m.push(f); return render(); }
    case 'field-random': { const F = app.fieldPick; F.picks[F.p] = [...E.FIELDS].sort(() => Math.random() - 0.5).slice(0, 3); return render(); }
    case 'field-done': { const F = app.fieldPick; if (F.picks[F.p].length !== 3) return; if (NET()) { netSend('act', { t: 'fields', picks: F.picks[F.p] }); F.sent = true; return render(); } if (F.p === 0) { F.p = 1; return render(); } return finishFields(); }
    case 'fields-done': { const F = app.fieldPick; app.lineup = { p: NET() ? SEAT() : 0, orders: [[], []], teams: F.teams }; app.screen = 'lineup'; return render(); }
    case 'order-reset': app.lineup.orders[app.lineup.p] = []; return render();
    case 'order-random': { const L = app.lineup; const o = L.teams[L.p].slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } L.orders[L.p] = o; return render(); }
    case 'random-pick': return randomPick();
    case 'random-rest': return randomizeRest();
    case 'order-done': { const L = app.lineup; L.mc = L.mc || ['chaldea', 'chaldea']; if (NET()) { if (L.orders[L.p].length !== 6) return; netSend('act', { t: 'lineup', order: L.orders[L.p], mc: L.mc[L.p] }); L.sent = true; return render(); } if (L.p === 0) { L.p = 1; return render(); } return startBattle(L.orders, { mcs: L.mc.slice() }); }
    case 'mc-pick': { const L = app.lineup; L.mc = L.mc || ['chaldea', 'chaldea']; L.mc[L.p] = el.dataset.mc; return render(); }
    case 'uncover': u.cover = null; return render();
    case 'skill': {
      const x = g.units[+el.dataset.uid]; const i = +el.dataset.i; const kind = E.skillTargetKind(x, i);
      const opt = E.skillOption(x, i);
      if (opt) { u.targeting = { uid: x.uid, i, kind: 'opt', opt }; return render(); }
      if (!kind) { E.queueSkill(g, u.actor, x.uid, i, null); return render(); }
      u.targeting = { uid: x.uid, i, kind }; return render();
    }
    case 'cancel-target': u.targeting = null; return render();
    case 'skill-opt': {
      const T = u.targeting; if (!T || T.kind !== 'opt') return render();
      const tk = E.skillTargetKind(g.units[T.uid], T.i);
      if (tk) { u.targeting = { uid: T.uid, i: T.i, kind: tk, chosen: el.dataset.v }; return render(); }
      E.queueSkill(g, u.actor, T.uid, T.i, null, el.dataset.v); u.targeting = null; return render();
    }
    case 'mskill': { const i = +el.dataset.i; u.targeting = { master: true, i, kind: E.isSwap(g, u.actor, i) ? 'swapOut' : 'ally' }; return render(); }
    case 'swap-in': { if (u.targeting && u.targeting.kind === 'swapIn') selectOrderChange(u.targeting.out, +el.dataset.uid); return; }
    case 'toggle-seals': app.opts.seals = !app.opts.seals; return render();
    case 'seal': u.targeting = { seal: true, kind: el.dataset.k }; return render();
    case 'seal-pick': if (u.targeting && u.targeting.seal) { E.queueSeal(g, u.actor, u.targeting.kind, +el.dataset.uid); u.targeting = null; } return render();
    case 'unseal': E.unqueueSeal(g, u.actor); return render();
    case 'unmaster': if (!g.players[u.actor].masterQueue[+el.dataset.k]?.applied) E.unqueueMaster(g, u.actor, +el.dataset.k); return render();
    case 'unqueue': E.unqueueSkill(g, u.actor, +el.dataset.k); return render();
    case 'lock-skills': return lockSkills();
    case 'to-cards': return beginStage('cards', NET() ? SEAT() : 0);
    case 'fx-skip': return skipPlay();
    case 'intro-skip': if (app.turnIntro) { app.turnIntro.skip = true; app.turnIntro = null; document.querySelectorAll('.tbannounce').forEach(e => e.remove()); beginStage('skills', NET() ? SEAT() : 0); } return;
    case 'fx-speed': app.fast = !app.fast; { const b = el; b.textContent = app.fast ? 'Normal speed' : 'Speed up'; b.setAttribute('aria-pressed', app.fast); } return;
    case 'unit': {
      const x = g.units[+el.dataset.uid];
      if (u.targeting) {
        const T = u.targeting;
        if (T.seal) { if (x.side === u.actor && !x.dead && E.sealTargetOk(g, u.actor, T.kind, x.uid)) { E.queueSeal(g, u.actor, T.kind, x.uid); u.targeting = null; } return render(); }
        if (T.kind === 'swapIn') return render();
        const ok = T.kind === 'ally' ? x.side === u.actor && E.allyTargetOk(g, T, x.uid) : T.kind === 'swapOut' ? x.side === u.actor && !E.has(x, 'noSwap') : x.side !== u.actor;
        if (ok && !x.dead) {
          if (T.master && T.kind === 'swapOut') { u.targeting = { master: true, i: 2, kind: 'swapIn', out: x.uid }; return render(); }
          if (T.master) E.queueMaster(g, u.actor, T.i, x.uid);
          else E.queueSkill(g, u.actor, T.uid, T.i, x.uid, T.chosen);
          u.targeting = null;
        }
        return render();
      }
      if (u.stage === 'cards' && !u.cover && x.side !== u.actor && !x.dead && u.pendingSlot != null) { u.sel[u.pendingSlot].target = x.uid; u.pendingSlot = nextPending(); return render(); }
      u.focus = u.focus === x.uid ? null : x.uid; return render();
    }
    case 'card': {
      const P = g.players[u.actor];
      const c = E.availableNPs(g, u.actor).concat(P.hand).find(k => k.id === el.dataset.id);
      if (!c || u.sel.length >= 3 || u.pendingSlot != null) return;
      const foes = E.front(g, 1 - u.actor);
      const auto = !needsTarget(c) || foes.length === 1;
      u.sel.push({ card: c, target: auto ? foes[0]?.uid : null });
      if (!auto) u.pendingSlot = u.sel.length - 1;
      return render();
    }
    case 'clear-cards': u.sel = []; u.pendingSlot = null; return render();
    case 'unslot': u.sel.splice(+el.dataset.k, 1); u.pendingSlot = nextPending(); return render();
    case 'cancel-card': if (u.pendingSlot != null) u.sel.splice(u.pendingSlot, 1); u.pendingSlot = nextPending(); return render();
    case 'retarget': if (u.pendingSlot == null) u.pendingSlot = +el.dataset.k; return render();
    case 'lock-cards': return lockCards();
    case 'next-turn': return startTurnUI();
    case 'close-focus': u.focus = null; return render();
    case 'aff-chart': app.affChart = true; return render();
    case 'close-aff-chart': app.affChart = false; return render();
    case 'open-stats': app.statsOpen = true; return render();
    case 'close-stats': app.statsOpen = false; if (app.ui) app.ui.victoryClosed = true; return render();
    case 'stats-sort': app.statsSort = el.dataset.k; return render();
    case 'victory-close': app.ui.victoryClosed = true; return render();
    case 'rematch': return startBattle(app.lastTeams, { mcs: app.lastMcs });
    case 'new-draft': app.fields = null; return startDraft();
    default: if (a.startsWith('net-')) return netClick(a, el);
  }
});
if (ONLINE) netInit();
render();
})();
