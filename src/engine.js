// FGO PvP battle engine. Pure logic, no DOM. Works in the browser and in Node.
(function (root) {
'use strict';

const CFG = {
  costCap: 65, max5: 2, picks: 6, turnLimit: 20, np5MaxRarity: 3,
  cost: { 5: 16, 4: 12, 3: 7, 2: 4, 1: 3, 0: 4 },
  // Class affinity uses FGO's chart, pulled halfway to neutral for PvP: 2x -> 1.5x, 1.5x -> 1.25x, 0.5x -> 0.75x.
  affScale: 0.5, attrAdv: 1.1, attrDis: 0.9,
  deathMult: 0.1, aoeTargets: 3,
  cardVal: { B: [1.5, 1.8, 2.1], A: [1, 1.2, 1.4], Q: [0.8, 0.96, 1.12] },
  npBase: { Buster: 1.5, Arts: 1, Quick: 0.8 },
  busterFirst: 0.5, busterChainAtk: 0.2, extraVal: 2, extraBrave: 3.5,
  npVal: { A: 3, Q: 1, B: 0, EX: 1, Arts: 3, Quick: 1, Buster: 0 },
  slotMult: [1, 1.5, 2], artsFirst: 1, artsChainNp: 20, quickChainStars: 20, quickChainCrit: 20,
  // Stars per enemy hit by card type (NPs too: an AoE NP hitting 3 enemies makes 3×). Star Drop buffs scale these.
  // Star generation per hit (rates in %): p = (servant star rate + card rate × (1 + card buff/100) + Quick-first bonus + crit bonus + star gen buffs) / 100,
  // capped at 3 stars per hit; the fraction is the chance of one more star. NPs use the 1st-position card rate.
  // NP gain per hit = floor(floor(NP rate × (first-card bonus + card value × max(1 + card mod, 0)) × enemy mod × (1 + NP gain mod) × crit)),
  // in hundredths of a percent. The first-card bonus is 1 when the chain opens with an Arts face card (an NP first gives 0).
  npCardVal: { A: [3, 4.5, 6], Q: [1, 1.5, 2], B: [0, 0, 0], EX: [1, 1, 1] },
  enemyNpMod: { Caster: 1.2, 'Moon Cancer': 1.2, Rider: 1.1, Assassin: 0.9, Berserker: 0.8 },
  cardStarRate: { Q: [80, 130, 180], B: [10, 15, 20], A: [0, 0, 0], EX: [100, 100, 100] }, critStarBonus: 20, starHitCap: 300,
  // Card buffs also lift a secondary stat at this fraction of their value: Arts and Extra -> NP gain, Quick and Extra -> stars.
  cardBuffSecondary: 0.5,
  quickFirstStar: 20, starCap: 50, starBankCap: 99, // starCap: most stars a hand can use (10 per card = 100% crit); starBankCap: most a team can bank
  classSR: { Shielder: 10, Saber: 10, Archer: 8, Lancer: 12, Rider: 20, Caster: 11, Assassin: 25, Berserker: 5 },
  classSA: { Shielder: 100, Saber: 100, Archer: 150, Lancer: 90, Rider: 200, Caster: 50, Assassin: 98, Berserker: 10, Ruler: 100, Avenger: 30, 'Moon Cancer': 50, 'Alter Ego': 100, Foreigner: 150, Pretender: 50, 'Beast I': 100, 'Beast II': 100 },
  priority: { Q: 0, A: 1, B: 2, EX: 2, NP: 3 },
  dmgRandom: [0.9, 1.1],
};

const COLOR = { Q: 'Quick', A: 'Arts', B: 'Buster', EX: 'Extra' };
const LETTER = { Quick: 'Q', Arts: 'A', Buster: 'B' };
const CLASS_LIST = ['Shielder', 'Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker', 'Ruler', 'Avenger', 'Moon Cancer', 'Alter Ego', 'Foreigner', 'Pretender', 'Beast I', 'Beast II', 'Unbeast'];
// FGO class chart, attacker -> defender, before PvP scaling. Anything not listed is 1x.
const RAW_AFF = (() => {
  const T = {}; const set = (a, d, m) => { (T[a] = T[a] || {})[d] = m; };
  const KNIGHT = ['Saber', 'Archer', 'Lancer'], CAV = ['Rider', 'Caster', 'Assassin'], BASE = [...KNIGHT, ...CAV];
  // Knight and Cavalry triangles
  [['Saber', 'Lancer'], ['Lancer', 'Archer'], ['Archer', 'Saber'], ['Rider', 'Caster'], ['Caster', 'Assassin'], ['Assassin', 'Rider']].forEach(([a, d]) => { set(a, d, 2); set(d, a, 0.5); });
  // Berserker: deals and takes double from everyone; Shielder is neutral to it on defense, Foreigners resist it
  for (const c of CLASS_LIST) { if (c !== 'Berserker') set(c, 'Berserker', 2); if (c !== 'Shielder' && c !== 'Foreigner') set('Berserker', c, 2); }
  set('Berserker', 'Foreigner', 0.5);
  // Ruler / Avenger / Moon Cancer triangle; Rulers resist the six base classes
  [['Ruler', 'Moon Cancer'], ['Moon Cancer', 'Avenger'], ['Avenger', 'Ruler']].forEach(([a, d]) => { set(a, d, 2); set(d, a, 0.5); });
  for (const c of BASE) set(c, 'Ruler', 0.5);
  // Alter Ego / Foreigner / Pretender triangle
  [['Alter Ego', 'Foreigner'], ['Foreigner', 'Pretender'], ['Pretender', 'Alter Ego']].forEach(([a, d]) => { set(a, d, 2); set(d, a, 0.5); });
  set('Foreigner', 'Foreigner', 2);
  // Alter Ego half-beats Cavalry and is weak into Knights; Pretender is the mirror image
  for (const c of CAV) set('Alter Ego', c, 1.5); for (const c of KNIGHT) set('Alter Ego', c, 0.5);
  for (const c of KNIGHT) set('Pretender', c, 1.5); for (const c of CAV) set('Pretender', c, 0.5);
  // Beast I (Sodom's Beast / Draco): half-beats the seven standard classes and resists them; weak to every Extra class.
  const STD = [...BASE, 'Berserker'], EXTRA = ['Ruler', 'Avenger', 'Moon Cancer', 'Alter Ego', 'Foreigner', 'Pretender'];
  for (const c of STD) { set('Beast I', c, c === 'Berserker' ? 2 : 1.5); set(c, 'Beast I', 0.5); }
  for (const c of EXTRA) { set('Beast I', c, 0.5); set(c, 'Beast I', 2); }
  // Beast II (Space Ereshkigal): half-beats and resists the Extra classes except Avenger, which beats them; neutral to everything else, Berserker included.
  for (const c of ['Ruler', 'Moon Cancer', 'Alter Ego', 'Foreigner', 'Pretender']) { set('Beast II', c, 1.5); set(c, 'Beast II', 0.5); }
  set('Avenger', 'Beast II', 2); set('Beast II', 'Avenger', 0.5);
  set('Beast II', 'Berserker', 1); set('Berserker', 'Beast II', 1);
  // Unbeast (U-Olga Marie): beats Berserker, Moon Cancer and Foreigner; weak into Avenger and Beast I.
  // Resists the six base classes and Moon Cancer; takes more from Avenger, Foreigner, Berserker and Beast I.
  for (const c of CLASS_LIST) { if (c !== 'Unbeast') { set('Unbeast', c, 1); set(c, 'Unbeast', 1); } }
  for (const c of ['Berserker', 'Moon Cancer', 'Foreigner']) set('Unbeast', c, 2);
  for (const c of ['Avenger', 'Beast I']) set('Unbeast', c, 0.5);
  for (const c of [...BASE, 'Moon Cancer']) set(c, 'Unbeast', 0.5);
  for (const c of ['Avenger', 'Foreigner']) set(c, 'Unbeast', 2);
  for (const c of ['Berserker', 'Beast I']) set(c, 'Unbeast', 1.5);
  return T;
})();
function rawAffinity(a, d) { return (RAW_AFF[a] && RAW_AFF[a][d]) || 1; }
const ATTR_BEATS = { Man: 'Sky', Sky: 'Earth', Earth: 'Man' };
const CONTROL = new Set(['stun', 'charm', 'bind', 'petrify', 'sleep', 'pigify', 'terror', 'skillSeal', 'npSeal']);
const MENTAL = new Set(['charm', 'terror', 'sleep']);
// Statuses that stop a servant from attacking or using its NP this turn.
const NO_ACT = ['stun', 'charm', 'bind', 'petrify', 'sleep', 'pigify', 'eternalSleep']; // Pigify plays like a stun, but is its own status (some servants are immune to it)
// FGO battlefields. Picked by the players before the battle; some skills only work on certain fields.
const FIELDS = ['Sunlight', 'Shore', 'Forest', 'Burning', 'City', 'Imaginary Space', 'Air', 'Darkness', 'Heaven', 'Hell'];
const FIELD_LABEL = { Shore: 'Waterside' };
const DOTS = new Set(['curse', 'burn', 'poison']);
const HARMFUL_POSITIVE = new Set(['burnDmg', 'buffBlock', 'trait', 'dmgTakenPlus', 'noCards', 'noHeal', 'doom']);
const STAT_LABEL = {
  bind: 'Bind', petrify: 'Petrify', sleep: 'Sleep', stripRes: 'Buff-removal res', deathRes: 'Death res', deathImmune: 'Death immune', deathSuccess: 'Death success',
  ndGain: 'NP gain when hit', critDmgTaken: 'Crit dmg taken', trigger: 'Triggered effect', reflect: 'Reflect damage', counterDmg: 'Counter',
  ocUp: 'Overcharge up', quickHitDebuff: 'Quick hits: debuff', npOnBurnHit: 'NP on hitting Burned',
  atk: 'ATK', def: 'DEF', buster: 'Buster', arts: 'Arts', quick: 'Quick', npDmg: 'NP dmg', critDmg: 'Crit dmg',
  starDrop: 'Star drop', starGather: 'Star gather', npGain: 'NP gain', debuffRes: 'Debuff res', mentalRes: 'Mental res',
  atkDebuffRes: 'ATK-down res', buffSuccess: 'Buff success', debuffSuccess: 'Debuff success', mentalSuccess: 'Mental success',
  healRecv: 'Heal recv', eternalSleep: 'Eternal Slumber', noSwap: 'Can\'t be swapped', npDmgBoost: 'NP dmg boost', counter: 'Counter', rankUp: 'Skill Rank Up', immuneTo: 'Immune', trueInvincible: 'Anti-Enforcement DEF', npType: 'NP type', curseNoDeath: 'Curse can\'t defeat', noHeal: 'Recovery disabled', npDmgRes: 'NP damage resist', lockHand: 'Hand locked', critRes: 'Crit resist', classRel: 'Class affinity', healGiven: 'Healing given', dmgTakenPlus: 'Dmg taken +', multiHit: 'Hit count ×', noCards: 'Cards locked', buffRecv: 'Buff recv rate', marks: 'Marked', critRate: 'Crit rate', dmgPlus: 'Dmg +', dmgCut: 'Dmg cut', maxHp: 'Max HP', ignoreDef: 'Ignore DEF',
  ignoreInv: 'Ignore Invinc.', sureHit: 'Sure Hit', evade: 'Evade', invincible: 'Invincible', taunt: 'Taunt',
  special: 'Special ATK', specialDef: 'Special DEF', npRegen: 'NP regen', starRegen: 'Star regen', hpRegen: 'HP regen',
  burnDmg: 'Burn dmg up', busterRes: 'Buster res', artsRes: 'Arts res', quickRes: 'Quick res', debuffImmune: 'Debuff immune',
  buffBlock: 'Buff Block', trait: 'Trait', allBuster: 'All Buster', npToArts: 'NP → Arts', busterAtkNp: 'Buster NP+',
  curseOnAttack: 'Curse on hit', extra: 'Extra card', stun: 'Stun', pigify: 'Pigify', charm: 'Charm', terror: 'Terror', skillSeal: 'Skill Seal', npSeal: 'NP Seal',
  curse: 'Curse', burn: 'Burn', poison: 'Poison', guts: 'Guts', delayed: 'Delayed', ctrlImmune: 'Control immune',
};

function mkRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A private copy of a battle for "what if" look-ahead (the CPU uses it). Servant data and kits are shared, everything
// that changes during play is copied, and the copy gets its own random numbers so it can't peek at real rolls.
function cloneGame(g, seed) {
  const cp = v => Array.isArray(v) ? v.map(x => (x && typeof x === 'object' && !Array.isArray(x) && !x.uid ? { ...x } : Array.isArray(x) ? x.slice() : x)) : v && typeof v === 'object' ? { ...v } : v;
  const c = { ...g, rng: mkRng(seed == null ? Math.floor(Math.random() * 2 ** 31) : seed), fx: null, log: g.log.slice(-20), units: {}, players: [] };
  for (const [uid, u] of Object.entries(g.units)) {
    const x = { ...u, g: c };
    for (const k of Object.keys(u)) if (k !== 'g' && k !== 'd' && k !== 'kit' && u[k] && typeof u[k] === 'object') x[k] = cp(u[k]);
    x.buffs = u.buffs.map(b => ({ ...b }));
    c.units[uid] = x;
  }
  c.players = g.players.map(P => { const Q = {}; for (const k of Object.keys(P)) Q[k] = cp(P[k]); return Q; });
  for (const k of ['fields', '_meal', '_plans']) if (Array.isArray(g[k])) c[k] = g[k].slice();
  if (g.fieldOverride) c.fieldOverride = { ...g.fieldOverride };
  return c;
}

// ---------------------------------------------------------------- Draft
function costOf(d) { return CFG.cost[d.rar]; }
function teamCost(ids, R) { return ids.reduce((a, id) => a + costOf(R[id]), 0); }
function snakeOrder(first) {
  const o = [];
  const pattern = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
  for (const x of pattern) o.push(first === 0 ? x : 1 - x);
  return o;
}
// Can player still complete a legal 6-team after picking `id`?
// Servants that share a draft slot: once one of a group is picked by either player, the others are off the board.
// Meta Supports: a team may draft at most one. Artoria Caster, Koyanskaya of Light, Merlin, Lady Avalon, Tamamo-no-Mae,
// Lord El-Melloi II, Skadi (Caster), Skadi (Ruler), Larva/Tiamat (Archer).
const META = [284, 314, 150, 353, 62, 37, 215, 357, 450];
const EXCLUSIVE = [[190, 191], [424, 425], [472, 473]]; // Mecha Eli-chan / Mk.II; Kishinami Hakuno (Male/Female); Gray Lily (Saber/Lancer)
const BYCOST = new WeakMap(); // every servant sorted by cost, cached per roster
function byCost(R) { let s = BYCOST.get(R); if (!s) { s = Object.values(R).sort((a, b) => costOf(a) - costOf(b)); BYCOST.set(R, s); } return s; }
function canPick(team, id, taken, R) {
  if (taken.has(id)) return { ok: false, why: 'Already picked' };
  const grp = EXCLUSIVE.find(gp => gp.includes(id));
  const other = grp && grp.find(x => x !== id && taken.has(x));
  if (other) return { ok: false, why: `Only one of ${grp.map(x => R[x].name).join(' / ')} per game (${R[other].name} was picked)` };
  if (META.includes(id)) { const m = team.find(x => META.includes(x)); if (m != null) return { ok: false, why: `Only one Meta Support per team (${R[m].name} is already on it)` }; }
  const d = R[id];
  const next = team.concat([id]);
  if (next.length > CFG.picks) return { ok: false, why: 'Team is full' };
  if (next.filter(x => R[x].rar === 5).length > CFG.max5) return { ok: false, why: 'Max two 5★' };
  const cost = teamCost(next, R);
  if (cost > CFG.costCap) return { ok: false, why: `Over the ${CFG.costCap} cost cap` };
  const left = CFG.picks - next.length;
  let cheapest = 0, got = 0;
  for (const x of byCost(R)) { if (got >= left) break; if (taken.has(x.id) || x.id === id) continue; cheapest += costOf(x); got++; }
  if (cost + cheapest > CFG.costCap) return { ok: false, why: 'Leaves no room for the remaining picks' };
  return { ok: true };
}

// ---------------------------------------------------------------- Battle setup
function makeUnit(R, KITS, sid, side, uidSeq) {
  const d = R[sid];
  // Class, attribute and alignment words count as traits too, so skill conditions like 'Lawful' or 'Saber' work.
  const traits = new Set(d.traits.concat(d.tags || [], [d.gender, d.cls, `${d.attr} Attribute`], (d.align || '').split(' ')));
  const u = { g: null, uid: uidSeq, sid, side, d, kit: KITS[sid], name: d.name, cls: d.cls, traits, hpBase: d.hp, hp: d.hp, np: 0, cds: [0, 0, 0], buffs: [], dead: false };
  for (const p of u.kit.pas) u.buffs.push(Array.isArray(p) ? { s: p[0], v: p[1], t: Infinity, passive: true, from: 'Passive' } : { ...p, t: Infinity, passive: true, from: p.from || 'Passive' });
  u.kit.sk.forEach((sk, i) => { if (sk.cd0) u.cds[i] = sk.cd0; }); // e.g. Aesc's Last Resort needs charging at the start
  return u;
}

function newBattle(R, KITS, teams, opts = {}) {
  const rng = mkRng(opts.seed);
  const g = { R, KITS, rng, seals: opts.seals !== false, turn: 0, phase: 'skills', initiative: opts.initiative ?? 0, log: [], units: {}, players: [], winner: null, over: false };
  let seq = 1;
  for (let p = 0; p < 2; p++) {
    const order = teams[p].map(sid => { const u = makeUnit(R, KITS, sid, p, seq++); u.g = g; g.units[u.uid] = u; return u.uid; });
    g.players.push({ order, front: order.slice(0, 3), reserve: order.slice(3), bag: [], hand: [], stars: 0, skillQueue: [], masterQueue: [], mcds: [0, 0, 0], sealUsed: false, sealQueue: null, cardSel: [] });
  }
  // Battlefield: one field from each player's picks, alternating every 2 turns.
  g.fields = (opts.fields && opts.fields.length) ? opts.fields.slice() : [FIELDS[Math.floor(rng() * FIELDS.length)], FIELDS[Math.floor(rng() * FIELDS.length)]];
  g.fieldOverride = null;
  // Space Ereshkigal's Affection gauge: +5 for bond, +5 if she starts on the field
  for (let p = 0; p < 2; p++) if (g.players[p].order.some(id => U(g, id).kit.fullness)) for (const id of g.players[p].order) U(g, id).full = 0;
  for (const u of Object.values(g.units)) if (u.kit.affection) { u.aff = 0; addAffection(g, u, 5, 'bond'); if (g.players[u.side].front.includes(u.uid)) addAffection(g, u, 5, 'starting member'); }
  startTurn(g);
  return g;
}

// Beni-Enma (Berserker): Fullness gauge (0 to 4, Super Giants 8; her NP raises the cap by 4 for 5 turns).
// Each Kurakura's Meals use serves the next of six dishes (5% chance of the legendary rice ball: all six) to every
// ally that isn't full, and fills them +2 (+12 for the rice ball). Each attack (not the Extra Attack) digests 1.
const MEALS = [
  { n: 'Yakisoba', e: [{ k: 'buff', to: 'self', s: 'atk', v: 20, t: 3 }] },
  { n: 'Curry', e: [{ k: 'buff', to: 'self', s: 'maxHp', v: 200, t: 3 }] },
  { n: 'Ramen', e: [{ k: 'np', to: 'self', v: 20 }] },
  { n: 'Frankfurter', e: [{ k: 'buff', to: 'self', s: 'npDmg', v: 20, t: 3 }] },
  { n: 'Skewers', e: [{ k: 'buff', to: 'self', s: 'critDmg', v: 50, t: 3 }] },
  { n: 'Parfait', e: [{ k: 'heal', to: 'self', v: 1000 }] },
];
function fullCap(u) { return (hasTrait(u, 'Super Giant') ? 8 : 4) + sumStat(u, 'fullCap'); }
function serveMeal(g, src) {
  g._meal = g._meal || [0, 0];
  const legend = g.rng() < 0.05;
  const m = MEALS[g._meal[src.side] % 6]; g._meal[src.side] += 1;
  const dish = legend ? { n: 'the Legendary Rice Ball', e: MEALS.flatMap(x => x.e) } : m;
  log(g, `${src.name} serves ${dish.n}!`, 'act'); fx(g, { t: 'eff', uid: src.uid, key: 'heal', label: dish.n });
  for (const a of front(g, src.side)) {
    if (a.full == null) a.full = 0;
    if (a.full >= fullCap(a)) { log(g, `${a.name} is too full to eat.`, 'miss'); continue; }
    applyEffects(g, dish.e, a, a.uid, { from: `Kurakura's Meals (${dish.n})` });
    a.full = Math.min(fullCap(a), a.full + (legend ? 12 : 2));
  }
}
// Affection (Space Ereshkigal): every 10 points is a level, 1 to 10. Some NP effects need a level.
const AFF_NAME = l => l >= 10 ? 'Destiny' : l >= 7 ? 'Darling' : l >= 4 ? 'Buddy' : 'Mate';
function affLevel(u) { return u.aff == null ? 0 : Math.min(10, 1 + Math.floor(u.aff / 10)); }
function addAffection(g, u, n, why) {
  if (!u || u.aff == null || u.dead) return;
  const before = affLevel(u); u.aff += n; const after = affLevel(u);
  if (after > before) { log(g, `${u.name}'s Affection rises to Lv ${after} (${AFF_NAME(after)})${why ? ` — ${why}` : ''}.`, 'buff'); if (g.fx) fx(g, { t: 'eff', uid: u.uid, key: 'np', label: `Affection Lv ${after}` }); }
}
// ---------------------------------------------------------------- Helpers
const U = (g, uid) => g.units[uid];
function front(g, p) { return g.players[p].front.map(id => U(g, id)).filter(u => u && !u.dead); }
function enemyOf(p) { return 1 - p; }
function npLevel(u) { return u.d.npl || (u.d.rar <= CFG.np5MaxRarity ? 5 : 1); }
function fieldName(f) { return FIELD_LABEL[f] || f || 'None'; }
function currentField(g) {
  if (g.fieldOverride && g.turn <= g.fieldOverride.until) return g.fieldOverride.name;
  if (!g.fields || !g.fields.length) return null;
  return g.fields[Math.floor((Math.max(1, g.turn) - 1) / 2) % g.fields.length];
}
function fieldTurnsLeft(g) {
  if (g.fieldOverride && g.turn <= g.fieldOverride.until) return g.fieldOverride.until - g.turn + 1;
  return 2 - ((Math.max(1, g.turn) - 1) % 2);
}
function hasNoNP(u) { return !!(u.kit && u.kit.np && u.kit.np.noNP); }
const NP_GAUGE_BUFFS = new Set(['npRegen', 'npGain', 'ndGain', 'busterAtkNp', 'npOnBurnHit', 'ocUp']);
function npCap(u) { if (hasNoNP(u)) return 0; const l = npLevel(u); return l >= 5 ? 300 : l >= 2 ? 200 : 100; }
function lerpOC(list, oc) {
  if (!list) return list;
  const f = (oc - 1) / 4;
  return list.map(e => {
    if (e.v5 == null && e.p5 == null) return e;
    const x = { ...e };
    if (e.v5 != null) x.v = Math.round((e.v + (e.v5 - e.v) * f) * 100) / 100;
    if (e.p5 != null) x.p = Math.round((e.p + (e.p5 - e.p) * f) * 100) / 100;
    return x;
  });
}
function maxHp(u) { return u.hpBase + sumStat(u, 'maxHp'); }
// Field-bound buffs (e.g. Archetype: Earth's passive on Millennium Castle) only work while that field is active.
// A field can be "negated" (Tezcatlipoca vs Sunlight): it still shows, but nothing that needs it works.
function fieldActive(g, name) {
  if (!g || currentField(g) !== name) return false;
  return !Object.values(g.units || {}).some(x => !x.dead && g.players[x.side].front.includes(x.uid) && x.buffs.some(b => b.s === 'negateField' && b.fields && b.fields.includes(name)));
}
function offField(u, b) { return !!(b.onField && !b.onField.some(f => fieldActive(u.g, f))); }
function has(u, s) { return u.buffs.some(b => b.s === s && (b.n == null || b.n > 0) && !offField(u, b)); }
// Some buffs only work at low HP, or grow as HP drops (hpBelow: % HP where it starts; vLow: value at 0 HP).
function buffValue(u, b, tgt) {
  if (offField(u, b)) return 0;
  if (b.whileMark != null && !hasMark(u, b.whileMark)) return 0;
  if (b.hpAbove != null && u.hp / maxHp(u) * 100 < b.hpAbove - 1e-9) return 0;
  if (b.whileHas && !has(u, b.whileHas)) return 0;
  if (b.perMarkOp) return tgt ? b.v + b.perMarkOp.add * Math.min(b.perMarkOp.max || 99, markCount(tgt, b.perMarkOp.mark)) : b.v;           // e.g. DEF up only while Invincible
  if (b.perField && u.g && u.g.players) { // e.g. +10% NP damage for each King on the field (John Lackland)
    const sides = b.perField.who === 'enemies' ? [enemyOf(u.side)] : [0, 1];
    const n = sides.reduce((a, p) => a + front(u.g, p).filter(x => !x.dead && (b.perField.trait === 'Servant' || hasTrait(x, b.perField.trait))).length, 0);
    return b.v + b.perField.add * n;
  }
  if (b.perMark) return b.v + b.perMark.add * Math.min(b.perMark.max || 99, markCount(u, b.perMark.mark)); // e.g. +10% per Growth stack
  if (b.hpBelow == null) return b.v;
  const pct = u.hp / maxHp(u) * 100;
  if (pct > b.hpBelow) return 0;
  if (b.vLow == null) return b.v;
  return b.v + (b.vLow - b.v) * (1 - Math.max(0, pct) / b.hpBelow);
}
// whileMark can name a status category: 3005 = any debuff, 3004 = any (non-passive) buff
function hasMark(u, id) {
  if (id === 2999) { const g = u.g; return !!(g && g.players && [0, 1].some(p => front(g, p).some(x => !x.dead && hasTrait(x, 'Illya')))); } // Miyu: an Illya is on the field
  if (id === 3005) return u.buffs.some(b => b.debuff); if (id === 3004) return u.buffs.some(b => !b.debuff && !b.passive); return markCount(u, id) > 0; }
function markCount(u, id) { return u.buffs.filter(b => b.marks && b.marks.includes(id)).length; }
// Field auras (Oberon): a passive on a servant that's alive on the field, applying to every ally that meets its condition.
function auraStat(u, s, tgt) {
  const g = u.g; if (!g || !g.players) return 0;
  let v = 0;
  for (const src of front(g, u.side)) {
    if (src.dead) continue;
    for (const b of src.buffs) {
      if (b.s !== 'aura' || !b.aura || b.aura.s !== s) continue;
      const a = b.aura;
      if (a.cond && !hasTrait(u, a.cond)) continue;
      if (a.notVsClass) { if (!tgt || a.notVsClass.includes(tgt.cls)) continue; }
      v += a.v;
    }
  }
  return v;
}
function sumStat(u, s, tgt) {
  let v = auraStat(u, s, tgt);
  const boost = s === 'npDmg' ? Math.max(0, ...u.buffs.filter(b => b.s === 'npDmgBoost').map(b => b.v)) / 100 : 0;
  for (const b of u.buffs) {
    if (b.s !== s) continue;
    if (b.n != null && b.n <= 0) continue;
    if (tgt && !matchesSpecial(b, tgt)) continue;
    if (b.notVsClass && (!tgt || b.notVsClass.includes(tgt.cls))) continue;
    let bv = buffValue(u, b, tgt);
    if (boost && bv > 0) bv *= 1 + boost;
    v += bv;
  }
  return v;
}
function matchesSpecial(b, tgt) {
  if (b.vs && !hasTrait(tgt, b.vs)) return false;
  if (b.vsList && !b.vsList.some(v => hasTrait(tgt, v))) return false;
  if (b.status && !tgt.buffs.some(x => x.s === b.status)) return false;
  if (b.statusAny && !b.statusAny.some(st => has(tgt, st))) return false;
  if (b.alignVs && !tgt.d.align.includes(b.alignVs)) return false;
  return true;
}
function hasTrait(u, t) {
  if (u.traits.has(t)) return true;
  return u.buffs.some(b => (b.s === 'trait' && b.trait === t) || (b.tags && b.tags.includes(t)));
}
function consume(u, s) {
  const b = u.buffs.find(x => x.s === s && x.n != null && x.n > 0);
  if (b) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); }
}
function consumeAllUses(u, s) {
  for (const b of u.buffs.slice()) if (b.s === s && b.n != null && !offField(u, b)) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); }
}
function snap(g) {
  const units = {};
  for (const u of Object.values(g.units)) units[u.uid] = { aff: u.aff, full: u.full, hp: u.hp, np: u.np, dead: u.dead, name: u.name, kit: u.kit, d: u.d, cls: u.cls, hpBase: u.hpBase, traits: u.traits, buffs: u.buffs.map(b => ({ ...b })), usedSkills: (u.usedSkills || []).slice() };
  return { units, field: currentField(g), fieldNegated: !!currentField(g) && !fieldActive(g, currentField(g)), initiative: g.initiative, sealUsed: g.players.map(P => P.sealUsed), fronts: g.players.map(P => P.front.slice()), reserves: g.players.map(P => P.reserve.slice()), stars: g.players.map(P => P.stars), log: g.log.length };
}
// Animation events: only recorded when the UI turns them on (g.fx = []).
function fx(g, ev) {
  if (!g.fx) return;
  ev.snap = snap(g);
  for (let p = 0; p < 2; p++) {
    const pending = g.players[p].masterQueue.find(m => m.applied && !m.revealed && m.visualBefore);
    if (pending) {
      ev.snap.fronts[p] = pending.visualBefore.front.slice();
      ev.snap.reserves[p] = pending.visualBefore.reserve.slice();
    }
  }
  g.fx.push(ev);
}
function log(g, msg, cls, extra) {
  const e = { turn: g.turn, msg, cls, ...(extra || {}) };
  // Negative effects carry the skill or NP that caused them, so the log can show them together.
  if (g._ctx && g._ctx.from && (cls === 'debuff' || cls === 'demerit' || cls === 'miss' || cls === 'dmg') && !e.dmgNum) e.cause = g._ctx;
  g.log.push(e);
}
function pct(x) { return Math.round(x * 10) / 10; }

// Class affinity overrides: atk = {attackerClass: {defenderClass: [rate, mode]}} on the attacker, def = the same on the defender.
// mode 'force' sets the raw multiplier; 'cap' only lowers it (FGO's overwriteMoreThanTarget).
function relOverride(raw, rel, ac, dc) {
  const r = rel && rel[ac] && (rel[ac][dc] || rel[ac]['*']); if (!r) return raw;
  return r[1] === 'cap' ? Math.min(raw, r[0]) : r[0];
}
function effCls(u) { const b = u.buffs && u.buffs.find(x => x.s === 'clsOverride'); return b ? b.cls : u.cls; }
function rawWithOverrides(a, d) {
  let raw = rawAffinity(effCls(a), effCls(d));
  for (const b of (a.buffs || [])) if (b.s === 'classRel' && b.atk) raw = relOverride(raw, b.atk, a.cls, d.cls);
  for (const b of (d.buffs || [])) if (b.s === 'classRel' && b.def) raw = relOverride(raw, b.def, a.cls, d.cls);
  return raw;
}
function classMult(a, d) { return Math.round((1 + (rawWithOverrides(a, d) - 1) * CFG.affScale) * 1000) / 1000; }
function affOf(a, d) { const m = classMult(a, d); return m > 1.001 ? 'up' : m < 0.999 ? 'down' : 'even'; }
function attrMult(a, d) {
  const x = a.d.attr, y = d.d.attr;
  if (ATTR_BEATS[x] === y) return CFG.attrAdv;
  if (ATTR_BEATS[y] === x) return CFG.attrDis;
  if ((x === 'Star' && y === 'Beast') || (x === 'Beast' && y === 'Star')) return CFG.attrAdv;
  return 1;
}

// ---------------------------------------------------------------- Effect application
function isHarmful(e, srcSide, tgt) {
  if (e.k === 'control' || e.k === 'dot' || e.k === 'drain' || e.k === 'death' || e.k === 'strip') return tgt.side !== srcSide || e.selfInflicted;
  if (e.k === 'buff') {
    if (e.s === 'trait') return tgt.side !== srcSide; // a status/trait on your own side (Magic Bullets, stacks) isn't a debuff
    if (HARMFUL_POSITIVE.has(e.s)) return true;
    return e.v < 0;
  }
  return false;
}
function resolveTargets(g, e, src, choice) {
  const p = src.side, q = enemyOf(p);
  switch (e.to) {
    case 'self': return [src];
    case 'ally': { const t = choice && U(g, choice); return [t && !t.dead && t.side === p ? t : src]; }
    case 'allies': return front(g, p);
    case 'others': return front(g, p).filter(u => u !== src);
    case 'firstOther': { const t = front(g, p).find(u => u !== src); return t ? [t] : []; }
    case 'lastOther': { const t = front(g, p).filter(u => u !== src && !u.dead).pop(); return t ? [t] : []; }
    case 'randomAlly': { // one random ally, the same one for every effect of this skill use
      const al = front(g, p).filter(u => !u.dead); if (!al.length) return [];
      if (!g._rand || g._rand.src !== src.uid || g._rand.seq !== g._skillSeq) g._rand = { src: src.uid, seq: g._skillSeq, uid: al[Math.floor(g.rng() * al.length)].uid };
      return [U(g, g._rand.uid)];
    }
    case 'lowestHpAlly': { const al = front(g, p).filter(u => !u.dead); al.sort((a, b) => a.hp / maxHp(a) - b.hp / maxHp(b)); return al.length ? [al[0]] : []; }
    case 'enemy': { const t = choice && U(g, choice); return t && !t.dead && t.side === q && g.players[q].front.includes(t.uid) ? [t] : (front(g, q)[0] ? [front(g, q)[0]] : []); }
    case 'enemies': return front(g, q);
    default: return [src];
  }
}
function targetPassesCond(e, t) {
  if (e.field && !e.field.some(f => fieldActive(t.g, f))) return false;
  if (e.exceptIds && e.exceptIds.includes(t.sid)) return false;
  if (e.cond && / On Field$/.test(e.cond)) { // e.g. 'Shuten On Field': an ally with that trait is on the field
    const want = e.cond.replace(/ On Field$/, '');
    if (!t.g || !front(t.g, t.side).some(u => !u.dead && hasTrait(u, want))) return false;
  } else if (e.cond && !hasTrait(t, e.cond)) return false;
  if (e.condAny && !e.condAny.some(c => hasTrait(t, c))) return false;
  if (e.condNot && e.condNot.some(c => hasTrait(t, c))) return false;
  if (e.condStatus && !e.condStatus.some(st => has(t, st))) return false;
  if (e.align && !t.d.align.includes(e.align)) return false;
  if (e.attr && t.d.attr !== e.attr) return false;
  if (e.alignNone && e.alignNone.some(a => t.d.align.includes(a))) return false;
  return true;
}
// Debuff roll from src onto t. Returns true if it lands.
function debuffLands(g, src, t, e) {
  if (t.side === src.side) return true; // demerits always land
  // Immunity to particular debuffs (e.g. Burn, Charm, mental debuffs)
  const imm = t.buffs.find(b => b.s === 'immuneTo' && (b.n == null || b.n > 0) && b.cats.some(c => buffCats({ s: e.kind || e.s, debuff: true, tags: e.tags }).has(c)));
  if (imm) {
    if (imm.n != null) { imm.n -= 1; if (imm.n <= 0) t.buffs.splice(t.buffs.indexOf(imm), 1); }
    log(g, `${t.name} is immune to ${STAT_LABEL[e.kind || e.s] || e.kind || e.s}.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'debuffImmune', label: 'Immune', miss: true }); return false;
  }
  const kind = e.kind || e.s;
  const mental = MENTAL.has(kind);
  let p = (e.p ?? 100) / 100 + sumStat(src, 'debuffSuccess', t) / 100 + (mental ? sumStat(src, 'mentalSuccess') / 100 : 0);
  p -= sumStat(t, 'debuffRes') / 100;
  if (mental) p -= sumStat(t, 'mentalRes') / 100;
  if (e.k === 'buff' && e.s === 'atk') p -= sumStat(t, 'atkDebuffRes') / 100;
  if (has(t, 'debuffImmune')) { consume(t, 'debuffImmune'); log(g, `${t.name} is immune to the debuff.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'debuffImmune', label: 'Immune', miss: true }); return false; }
  if (g.rng() < Math.max(0, Math.min(1, p))) return true;
  log(g, `${t.name} resisted.`, 'miss');
  fx(g, { t: 'eff', uid: t.uid, key: 'debuffRes', label: 'Resisted', miss: true });
  return false;
}
function buffLands(g, src, t, e) {
  if (has(t, 'buffBlock')) { consume(t, 'buffBlock'); log(g, `${t.name}'s Buff Block stopped a buff.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'buffBlock', label: 'Blocked', miss: true }); return false; }
  const succ = sumStat(src, 'buffSuccess');
  if (e.p == null && succ >= 0) return true;
  const p = (e.p ?? 100) / 100 + succ / 100 + sumStat(t, 'buffRecv') / 100;
  if (g.rng() < Math.max(0, Math.min(1, p))) return true;
  log(g, `${STAT_LABEL[e.s] || e.s} failed to activate on ${t.name}.`, 'miss');
  fx(g, { t: 'eff', uid: t.uid, key: e.s, label: 'Failed', miss: true });
  return false;
}

function applyEffects(g, list, src, choice, ctx = {}) {
  for (const e of list || []) applyEffect(g, e, src, choice, ctx);
}
function applyEffect(g, e, src, choice, ctx) {
  if (e.ifRemoved && !g._lastRemoved) return;
  if (e.minStars && g.players[src.side].stars < e.minStars) return;
  if (e.ifAllyTrait && !front(g, src.side).some(x => x !== src && !x.dead && hasTrait(x, e.ifAllyTrait))) { log(g, `${src.name}: no other ${e.ifAllyTrait} ally on the field, no bonus.`, 'miss'); return; }
  if (e.k === 'masterSteal') { // Kingprotea Alter: her Master's ready skills go on cooldown; NP damage up for each one taken
    const P = g.players[src.side]; let n = 0;
    for (let i = 0; i < P.mcds.length && n < e.max; i++) if (!P.mcds[i]) { P.mcds[i] = e.cd; n++; }
    log(g, n ? `${src.name} steals ${n} Master skill${n > 1 ? 's' : ''} (on cooldown for ${e.cd} turns): NP damage +${n * e.per}%.` : `${src.name}: no Master skills ready to steal.`, n ? 'act' : 'miss');
    if (n) { src.buffs.push({ s: 'npDmg', v: n * e.per, t: 1, from: 'Master skills stolen' }); fx(g, { t: 'eff', uid: src.uid, key: 'npDmg', label: `Steals ${n} Master skill${n > 1 ? 's' : ''}` }); }
    return;
  } // Habetrot: only with this many stars banked
  if (e.ifHungry && !(src.full != null && src.full < fullCap(src) / 2)) return; // Beni-Enma: only while less than half full // e.g. a Magic Bullet's ATK up only if a bullet was spent
  const prev = g._ctx; g._ctx = { from: ctx && ctx.from, by: src && src.name };
  try { applyEffectInner(g, e, src, choice, ctx); } finally { g._ctx = prev; }
}
function applyEffectInner(g, e, src, choice, ctx) {
  if (e.k === 'stars' && e.ifAllyAttr && !front(g, src.side).some(u => u.d.attr === e.ifAllyAttr)) { log(g, `${src.name}: no ${e.ifAllyAttr}-attribute ally on the field, no stars.`, 'miss'); return; }
  if (e.k === 'stars' && e.ifAlliesFullHp && !front(g, src.side).every(u => u.hp >= maxHp(u))) { log(g, `${src.name}: not every ally is at full HP, no stars.`, 'miss'); return; }
  if (e.ifAllyRarityMax != null && !front(g, src.side).some(u => u !== src && u.d.rar <= e.ifAllyRarityMax)) {
    if (g._rarLog !== g._skillSeq) { g._rarLog = g._skillSeq; log(g, `${src.name}: no ${e.ifAllyRarityMax}★-or-lower ally on the field, so the extra effects don't apply.`, 'miss'); }
    return;
  }
  if (e.k === 'stars' && e.v < 0) { g.players[src.side].stars = Math.max(0, g.players[src.side].stars + e.v); log(g, `${src.name}: ${e.v} stars.`, 'demerit'); fx(g, { t: 'eff', uid: src.uid, key: 'stars', neg: true, label: `${e.v} stars` }); return; }
  if (e.k === 'stars') { g.players[src.side].stars = Math.min(CFG.starBankCap, g.players[src.side].stars + e.v); log(g, `${src.name}: +${e.v} stars.`); fx(g, { t: 'eff', uid: src.uid, key: 'stars', label: `+${e.v} stars` }); return; }
  if (e.k === 'meal') { serveMeal(g, src); return; }
  if (e.k === 'redeal') { deal(g, src.side, true); log(g, `P${src.side + 1}'s Command Cards are reshuffled.`, 'buff'); fx(g, { t: 'eff', uid: src.uid, key: 'swap', label: 'New hand' }); return; }
  if (e.k === 'npTypeChoice' || e.k === 'npTypeRandom') { // Space Ishtar: the player picks the NP card type (Arts by default)
    const color = ['Arts', 'Buster', 'Quick'].includes(ctx.opt) ? ctx.opt : 'Arts';
    src.buffs = src.buffs.filter(b => b.s !== 'npType');
    src.buffs.push({ s: 'npType', v: 1, color, t: e.t, from: ctx.from });
    log(g, `${src.name}'s NP becomes ${color} (${e.t}T).`, 'buff'); fx(g, { t: 'eff', uid: src.uid, key: 'npToArts', label: `NP: ${color}` }); return;
  }
  if (e.k === 'eternalSleep') { // Oberon's Ending of Dreams: buffs end and the servant sleeps for good
    src.buffs = src.buffs.filter(b => b.passive || b.debuff || !removable(b));
    src.buffs.push({ s: 'eternalSleep', v: 1, t: Infinity, debuff: true, from: ctx.from }, { s: 'noSwap', v: 1, t: Infinity, debuff: true, from: ctx.from });
    log(g, `${src.name} falls into Eternal Slumber.`, 'debuff'); fx(g, { t: 'eff', uid: src.uid, key: 'sleep', neg: true, label: 'Eternal Slumber' }); return;
  }
  if (e.k === 'gatherMarks') { // pull hidden markers from every other servant onto this one (Lady Avalon)
    let n = 0;
    for (const x of Object.values(g.units)) {
      if (x === src || x.dead || !g.players[x.side].front.includes(x.uid)) continue;
      const ms = x.buffs.filter(b => b.marks && b.marks.some(m => e.marks.includes(m)));
      if (ms.length) { x.buffs = x.buffs.filter(b => !ms.includes(b)); src.buffs.push(...ms); n += ms.length; }
    }
    return;
  }
  if (e.k === 'gatherCurse') { // Van Gogh: every Curse on the field moves onto her
    let n = 0;
    for (const x of Object.values(g.units)) {
      if (x === src || x.dead || !g.players[x.side].front.includes(x.uid)) continue;
      const cs = x.buffs.filter(b => b.s === 'curse'); if (!cs.length) continue;
      x.buffs = x.buffs.filter(b => b.s !== 'curse'); src.buffs.push(...cs); n += cs.length;
    }
    log(g, n ? `${src.name} draws ${n} Curse${n > 1 ? 's' : ''} onto themselves.` : `${src.name}: no Curses to draw in.`, 'act'); return;
  }
  if (e.k === 'retreat') { // Miss Crane: she leaves for the back of the reserves and the next reserve steps in
    const P = g.players[src.side]; const next = P.reserve.find(id => !U(g, id).dead);
    if (e.notAlone && front(g, src.side).length <= 1) { log(g, `${src.name} is the only one on the field and can't withdraw.`, 'miss'); return; }
    if (!next || !P.front.includes(src.uid)) { log(g, `${src.name} has no one to swap with and stays.`, 'miss'); return; }
    doOrderChange(g, src.side, src.uid, next);
    P.reserve = P.reserve.filter(id => id !== src.uid).concat([src.uid]);
    log(g, `${src.name} withdraws to the back of the reserves.`, 'act'); return;
  }
  if (e.k === 'lockHand') { // BB: keep this turn's hand for the next turns
    const P = g.players[src.side];
    P.lockedHand = P.hand.map(c => ({ uid: c.uid, type: c.type })); P.lockedFront = front(g, src.side).map(u => u.uid).sort().join();
    log(g, `P${src.side + 1}'s Command Cards are locked: the same hand comes back next turn.`, 'buff'); return;
  }
  if (e.k === 'sacrifice') {
    const v = sacrificeOf(g, src);
    if (!v) { log(g, `${src.name}: no ally can be sacrificed.`, 'miss'); return; }
    log(g, `${src.name} sacrifices ${v.name}!`, 'dmg'); fx(g, { t: 'eff', uid: v.uid, key: 'death', neg: true, label: 'Sacrificed' });
    v.hp = 0; killOrGuts(g, v, src); return; // Guts can still save the sacrificed ally
  }
  if (e.k === 'koSelf') { log(g, `${src.name} is knocked out by their own effect.`, 'dmg'); killOrGuts(g, src, src); return; }
  if (e.k === 'selfDmg' && has(src, 'plotArmor')) { log(g, `${src.name}'s Plot Armor cancels the drawback.`, 'buff'); return; }
  if (e.k === 'selfDmg') { const v = e.nonlethal ? Math.min(e.v, src.hp - 1) : e.v; src.hp -= Math.max(0, v); log(g, `${src.name} takes ${e.v} self-damage.`, 'dmg'); fx(g, { t: 'hit', uid: src.uid, dmg: Math.max(0, v), aff: 'even', self: true }); if (src.hp <= 0) killOrGuts(g, src, src); return; }
  if (e.k === 'field') { g.fieldOverride = { name: e.name, until: g.turn + e.t - 1, owner: e.endsOnDeath ? src.uid : null }; log(g, `The battlefield becomes ${fieldName(e.name)} for ${e.t} turn${e.t > 1 ? 's' : ''}.`, 'act'); fx(g, { t: 'banner', field: true, side: src.side, label: `Battlefield: ${fieldName(e.name)}` }); return; }
  if (e.k === 'delayed') { src.buffs.push({ s: 'delayed', after: e.after, eff: e.eff, t: e.after + 1, from: ctx.from }); log(g, `${src.name}: delayed effect set.`); fx(g, { t: 'eff', uid: src.uid, key: 'delayed', label: 'Delayed effect' }); return; }
  if (e.k === 'absorbHp' || e.k === 'absorbNp') {
    const sub = { ...ctx }; applyEffectTargets(g, e, src, choice, sub);
    if (e.k === 'absorbHp' && sub._absorbed) { if (has(src, 'noHeal')) log(g, `${src.name} can't recover HP.`, 'miss'); else { src.hp = Math.min(maxHp(src), src.hp + sub._absorbed); log(g, `${src.name} absorbs ${sub._absorbed} HP.`, 'buff'); fx(g, { t: 'eff', uid: src.uid, key: 'heal', label: `+${sub._absorbed} HP` }); } }
    if (e.k === 'absorbNp' && sub._absorbedNp) { const v = Math.round(sub._absorbedNp); if (!hasNoNP(src)) { src.np = Math.min(npCap(src), src.np + v); log(g, `${src.name} absorbs ${v}% NP (now ${Math.floor(src.np)}%).`, 'buff'); fx(g, { t: 'eff', uid: src.uid, key: 'np', label: `NP +${v}%` }); } }
    return;
  }
  return applyEffectTargets(g, e, src, choice, ctx);
}
function applyEffectTargets(g, e, src, choice, ctx) {
  const targets = (ctx.forceTargets && (e.to === 'enemy' || e.to === 'enemies')) ? (e.to === 'enemy' ? ctx.forceTargets.slice(0, 1) : ctx.forceTargets) : resolveTargets(g, e, src, choice);
  for (const t of targets) {
    if (!t || t.dead) continue;
    if (!targetPassesCond(e, t)) continue;
    const harmful = isHarmful(e, src.side, t);
    if (t === src && has(src, 'plotArmor') && (e.k === 'selfDmg' || (e.k === 'control' && e.selfInflicted) || (e.k === 'dot' && t.side === src.side) || (e.k === 'buff' && e.v < 0 && !harmful && !['trigger', 'trait'].includes(e.s)) || (e.k === 'drain'))) {
      log(g, `${t.name}'s Plot Armor cancels the drawback.`, 'buff'); continue; // Aoko: demerits of its own skills and NP are nullified
    }
    switch (e.k) {
      case 'buff': {
        if (!harmful && hasNoNP(t) && NP_GAUGE_BUFFS.has(e.s)) break;
        if (e.stackLimit && markCount(t, e.stackLimit.mark) >= e.stackLimit.n) break; // e.g. Growth caps at 10 stacks
        if (harmful ? !debuffLands(g, src, t, e) : !buffLands(g, src, t, e)) break;
        let v = e.v;
        if (e.missingHpBonus) v += e.missingHpBonus * (1 - t.hp / maxHp(t));
        // carry: gained mid-turn, it still lasts through the next turn (outside end-of-turn, which already starts counting next turn)
        const b = { s: e.s, v: Math.round(v * 100) / 100, t: e.carry && !g.inEndTurn ? e.t + 1 : e.t, n: e.n, debuff: harmful, vs: e.vs, vsList: e.vsList, status: e.status, statusAny: e.statusAny, alignVs: e.alignVs, trait: e.trait, tags: e.tags, eff: e.eff, on: e.on, cards: e.cards, crit: e.crit, vsAny: e.vsAny, label: e.label, chance: e.chance, marks: e.marks, hpBelow: e.hpBelow, vLow: e.vLow, atk: e.atk, def: e.def, whileHas: e.whileHas, whileMark: e.whileMark, hpAbove: e.hpAbove, perMark: e.perMark, perField: e.perField, perMarkOp: e.perMarkOp, cats: e.cats, mainOnly: e.mainOnly, np: e.np, color: e.color, icon: e.icon, cls: e.cls, srcUid: src.uid, dmg: e.dmg, fields: e.fields, kind: e.kind, from: ctx.from };
        t.buffs.push(b);
        if (e.s === 'taunt') { g.lastTaunt = g.lastTaunt || [null, null]; g.lastTaunt[t.side] = t.uid; }
        if (e.s === 'maxHp') t.hp = Math.max(1, Math.min(maxHp(t), t.hp + v));
        const demerit = !harmful && t.side !== src.side; // e.g. a skill that buffs the enemy as a drawback
        log(g, `${t.name}: ${describeBuff(b)}.`, harmful ? 'debuff' : demerit ? 'demerit' : 'buff');
        fx(g, { t: 'eff', uid: t.uid, buff: { ...b }, label: describeBuff(b) });
        break;
      }
      case 'np': { if (hasNoNP(t)) break; t.np = Math.min(npCap(t), t.np + e.v); log(g, `${t.name}: NP +${e.v}% (now ${Math.floor(t.np)}%).`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'np', label: `NP +${e.v}%` }); break; }
      case 'heal': {
        const base = e.pct ? maxHp(t) * e.pct / 100 : e.v;
        if (has(t, 'noHeal')) { log(g, `${t.name} can't recover HP (Recovery Disabled).`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'noHeal', label: 'No recovery', miss: true }); break; }
        const amt = Math.round(base * (1 + sumStat(t, 'healRecv') / 100 + (src ? sumStat(src, 'healGiven') : 0) / 100));
        t.hp = Math.min(maxHp(t), t.hp + amt); log(g, `${t.name} heals ${amt}.`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'heal', label: `+${amt} HP` });
        if (!g.inEndTurn) fireTriggers(g, t, 'healed', {});
        break;
      }
      case 'cdReduce': { t.cds = t.cds.map(c => Math.max(0, c - e.v)); log(g, `${t.name}: skill cooldowns −${e.v}.`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'cdReduce', label: `Cooldowns −${e.v}` }); break; }
      case 'cleanse': {
        if (e.marks) { // removes one particular effect by name, buff or debuff (count: only that many stacks, oldest first)
          let gone = t.buffs.filter(b => b.marks && b.marks.some(m => e.marks.includes(m)));
          if (e.count) gone = gone.slice(0, e.count);
          g._lastRemoved = gone.length;
          t.buffs = t.buffs.filter(b => !gone.includes(b));
          if (gone.length) log(g, `${t.name}: ${[...new Set(gone.map(b => b.label || b.from))].join(', ')} ends.`, 'act');
          break;
        }
        const cats = e.cats || ['debuff'];
        let gone = t.buffs.filter(b => (b.debuff || !['buff', 'debuff'].some(x => cats.includes(x))) && removable(b) && cats.some(c => buffCats(b).has(c)));
        if (e.count) gone = gone.slice(-e.count);
        g._lastRemoved = gone.length;
        t.buffs = t.buffs.filter(b => !gone.includes(b));
        if (gone.length) log(g, `${t.name}: ${gone.length} debuff${gone.length > 1 ? 's' : ''} removed.`, 'buff');
        fx(g, { t: 'eff', uid: t.uid, key: 'cleanse', label: gone.length ? 'Debuffs removed' : 'Nothing to remove' });
        break;
      }
      case 'strip': {
        const cats = e.cats || (e.which === 'def' ? ['defUp'] : ['buff']);
        let gone = t.buffs.filter(b => (!b.debuff || !['buff', 'debuff'].some(x => cats.includes(x))) && removable(b) && cats.some(c => buffCats(b).has(c)));
        if (e.which === 'one') gone = gone.slice(-1);
        if (e.count) gone = gone.slice(-e.count);
        const resist = sumStat(t, 'stripRes');
        g._lastRemoved = gone.length;
        if (gone.length && resist > 0 && g.rng() < Math.min(1, resist / 100)) { g._lastRemoved = 0;
          log(g, `${t.name} resists the buff removal.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'stripRes', label: 'Removal resisted', miss: true }); break;
        }
        t.buffs = t.buffs.filter(b => !gone.includes(b));
        if (gone.length) log(g, `${t.name} loses ${gone.length} buff${gone.length > 1 ? 's' : ''}.`, 'debuff');
        fx(g, { t: 'eff', uid: t.uid, key: 'strip', neg: true, label: gone.length ? `${gone.length} buff${gone.length > 1 ? 's' : ''} removed` : 'No buffs to remove' });
        break;
      }
      case 'hpLoss': { // lose HP (not damage: no defense, can't be cut); 'nonlethal' leaves at least 1
        if (t === src && has(src, 'plotArmor')) break;
        const v = e.nonlethal ? Math.min(e.v, Math.max(0, t.hp - 1)) : e.v;
        t.hp -= v; log(g, `${t.name} loses ${v} HP.`, 'demerit'); fx(g, { t: 'hit', uid: t.uid, dmg: v, aff: 'even', self: true });
        if (t.hp <= 0) killOrGuts(g, t, src); break;
      }
      case 'fullness': { if (t.full == null) break; t.full = Math.max(0, Math.min(fullCap(t), t.full + e.v)); log(g, `${t.name}: Fullness ${e.v > 0 ? '+' : ''}${e.v} (now ${t.full}/${fullCap(t)}).`, 'buff'); break; }
      case 'npMult': { if (hasNoNP(t)) break; const before = t.np; t.np = Math.min(npCap(t), t.np * e.v); log(g, `${t.name}: NP ×${e.v} (${Math.floor(before)}% → ${Math.floor(t.np)}%).`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'np', label: `NP ×${e.v}` }); break; }
      case 'copyClass': { // Kazuradrop: becomes the target's class for a while
        if (t.side === src.side) break;
        src.buffs = src.buffs.filter(b => b.s !== 'clsOverride');
        src.buffs.push({ s: 'clsOverride', v: 1, cls: effCls(t), t: e.t, from: ctx.from });
        log(g, `${src.name} takes on ${t.name}'s class (${effCls(t)}) for ${e.t} turns.`, 'buff'); fx(g, { t: 'eff', uid: src.uid, key: 'trait', label: `Class: ${effCls(t)}` }); break;
      }
      case 'npPerFoeStatus': { // Kashin Koji: NP per enemy on the field with a status
        const n = front(g, enemyOf(t.side)).filter(x => has(x, e.status)).length; const v = e.v * n;
        if (v) t.np = Math.min(npCap(t), t.np + v);
        log(g, `${t.name}: NP +${v}% (${n} ${({ bind: 'Bound' })[e.status] || STAT_LABEL[e.status] || e.status} enem${n === 1 ? 'y' : 'ies'}).`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'np', label: `NP +${v}%` }); break;
      }
      case 'extend': { // Cait Cú: lengthen regen buffs / damage-over-time already on the target
        let n = 0;
        for (const b of t.buffs) if (e.stats.includes(b.s) && removable(b) && b.t !== Infinity) { b.t += e.v; n++; }
        if (n) { log(g, `${t.name}: ${n} effect${n > 1 ? 's' : ''} extended by ${e.v} turns.`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'delayed', neg: t.side !== src.side, label: `+${e.v} turns` }); }
        break;
      }
      case 'transform': {
        const nd = g.R[e.into]; const nk = g.KITS[e.into];
        if (!nd || !nk) break;
        const ratio = t.hp / maxHp(t), old = t.name;
        t.d = nd; t.kit = nk; t.name = nd.name; t.cls = nd.cls; t.hpBase = nd.hp;
        t.traits = new Set(nd.traits.concat(nd.tags || [], [nd.gender, nd.cls, `${nd.attr} Attribute`], (nd.align || '').split(' ')));
        t.buffs = t.buffs.filter(b => !b.passive);
        for (const p of nk.pas) t.buffs.push(Array.isArray(p) ? { s: p[0], v: p[1], t: Infinity, passive: true, from: 'Passive' } : { ...p, t: Infinity, passive: true, from: p.from || 'Passive' });
        t.hp = Math.max(1, Math.round(maxHp(t) * ratio));
        if (hasNoNP(t)) t.np = 0;
        remapDeck(g, t, nd.deck);
        log(g, `${old} transforms into ${nd.name}!`, 'activate');
        fx(g, { t: 'eff', uid: t.uid, key: 'trait', label: `Transforms: ${nd.name}` });
        break;
      }
      case 'npPerTrait': {
        let n = 0;
        if (e.mark != null) { n = markCount(t, e.mark); const v = e.v * n; t.np = Math.min(npCap(t), t.np + v); log(g, `${t.name}: NP +${v}% (${n} × ${e.trait}).`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'np', label: `NP +${v}%` }); break; }
        for (const x of Object.values(g.units)) if (!x.dead && g.players[x.side].front.includes(x.uid) && hasTrait(x, e.trait)) n++;
        n = Math.min(n, e.max || n);
        const v = e.v * n;
        t.np = Math.min(npCap(t), t.np + v);
        log(g, `${t.name}: NP +${v}% (${n} × ${e.trait}).`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'np', label: `NP +${v}%` });
        break;
      }
      case 'control': {
        if (e.selfInflicted) { t.buffs.push({ s: e.kind, v: 1, t: e.t, debuff: true, selfInflicted: true, from: ctx.from }); log(g, `${t.name} inflicts ${STAT_LABEL[e.kind]} on themselves (${e.t}T).`, 'debuff'); fx(g, { t: 'eff', uid: t.uid, key: e.kind, neg: true, label: `${STAT_LABEL[e.kind]} ${e.t}T` }); break; }
        if (!debuffLands(g, src, t, e)) break;
        if (e.kind === 'terror') { t.buffs.push({ s: 'terror', v: e.stunChance ?? 40, t: e.t, debuff: true, used: false, from: ctx.from }); log(g, `${t.name} is inflicted with Terror (${e.t}T).`, 'debuff'); fx(g, { t: 'eff', uid: t.uid, key: 'terror', neg: true, label: `Terror ${e.t}T` }); break; }
        const turns = Math.min(e.t, 1);
        // Skill Seal landing after the skill phase (from an attack or NP) would expire before it could block anything,
        // so it lasts through the next turn's skill phase. Stuns and other control still end with the turn.
        const carry = e.kind === 'skillSeal' && g.phase === 'cards' && !g.inEndTurn;
        t.buffs.push({ s: e.kind, v: 1, t: turns + (carry ? 1 : 0), debuff: true, from: ctx.from });
        log(g, `${t.name} is inflicted with ${STAT_LABEL[e.kind]} (${turns}T${carry ? ', lasts through next turn\'s skills' : ''}).`, 'debuff');
        fx(g, { t: 'eff', uid: t.uid, key: e.kind, neg: true, label: `${STAT_LABEL[e.kind]} ${turns}T` });
        break;
      }
      case 'dot': {
        if (!debuffLands(g, src, t, e)) break;
        t.buffs.push({ s: e.kind, v: e.v, t: e.t, debuff: true, from: ctx.from });
        log(g, `${t.name}: ${STAT_LABEL[e.kind]} ${e.v}/turn (${e.t}T).`, 'debuff');
        fx(g, { t: 'eff', uid: t.uid, key: e.kind, neg: true, label: `${STAT_LABEL[e.kind]} ${e.v}/turn` });
        break;
      }
      case 'absorbHp': { // Carmilla: the target loses HP (never below 1) and the user heals what was taken
        const took = Math.min(e.v, Math.max(0, t.hp - 1)); t.hp -= took;
        log(g, `${t.name} loses ${took} HP.`, 'debuff'); fx(g, { t: 'hit', uid: t.uid, dmg: took, aff: 'even' });
        ctx._absorbed = (ctx._absorbed || 0) + took; break;
      }
      case 'absorbNp': { // Melt Λ, Yang Guifei, Amor: take NP from the targets and gain it
        const took = Math.min(e.v, t.np); t.np -= took;
        log(g, `${t.name} loses ${Math.round(took)}% NP.`, t.side === src.side ? 'demerit' : 'debuff'); fx(g, { t: 'eff', uid: t.uid, key: 'drain', neg: true, label: `NP −${Math.round(took)}%` });
        ctx._absorbedNp = (ctx._absorbedNp || 0) + took; break;
      }
      case 'drain': {
        // NP drain isn't a debuff: Debuff Immunity and debuff resistance don't stop it, only its own success chance.
        if (e.p != null && e.p < 100 && g.rng() >= e.p / 100) { log(g, `${t.name}'s NP drain failed.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'drain', label: 'Failed', miss: true }); break; }
        const before = t.np; t.np = Math.max(0, t.np - e.v);
        log(g, Math.round(before - t.np) > 0 ? `${t.name} loses ${Math.round(before - t.np)}% NP.` : `${t.name} has no NP to lose.`, 'debuff');
        fx(g, { t: 'eff', uid: t.uid, key: 'drain', neg: true, label: `NP −${Math.round(before - t.np)}%` });
        break;
      }
      case 'death': {
        if (has(t, 'deathImmune')) { log(g, `${t.name} is immune to Death.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'deathImmune', label: 'Death immune', miss: true }); break; }
        if (has(t, 'debuffImmune')) { consume(t, 'debuffImmune'); break; }
        const chance = (e.p / 100) * CFG.deathMult * Math.max(0, 1 + (sumStat(src, 'deathSuccess') - sumStat(t, 'deathRes')) / 100);
        if (g.rng() < Math.max(0, chance)) {
          log(g, `Instant death lands on ${t.name}!`, 'dmg');
          fx(g, { t: 'eff', uid: t.uid, key: 'death', neg: true, label: 'Instant death!' });
          killOrGuts(g, t, src);
          if (e.onKill) applyEffects(g, e.onKill, src, null, { from: ctx.from });
        } else { log(g, `Instant death on ${t.name} misses (${pct(chance * 100)}% chance).`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: 'death', label: 'Death missed', miss: true }); }
        break;
      }
      case 'guts': {
        if (!buffLands(g, src, t, e)) break;
        t.buffs.push({ s: 'guts', v: e.hp, hp: e.hp, t: e.t, n: e.n ?? 1, onGuts: e.onGuts, from: ctx.from });
        log(g, `${t.name}: Guts (revive at ${e.hp} HP, ${e.n ?? 1}×, ${e.t}T).`, 'buff');
        fx(g, { t: 'eff', uid: t.uid, key: 'guts', label: `Guts ${e.hp} HP` });
        break;
      }
    }
  }
}
function describeBuff(b) {
  const L = STAT_LABEL[b.s] || b.s;
  const turns = b.t === Infinity || b.t >= 90 ? '' : ` ${b.t}T`;
  const uses = b.n != null ? ` ${b.n}×` : '';
  if (['evade', 'invincible', 'taunt', 'sureHit', 'ignoreDef', 'ignoreInv', 'allBuster', 'npToArts', 'debuffImmune', 'buffBlock', 'ctrlImmune'].includes(b.s)) return `${L}${uses}${turns}`;
  if (b.s === 'trait' && b.marks && b.marks.includes(2885)) return 'Magic Bullet';
  if (b.s === 'trait' && b.label && !/^Apply Trait|特性/.test(b.label)) return `${b.label}${turns}`;
  if (b.s === 'trait') return `gains ${b.trait} trait${turns}`;
  if (b.s === 'trueInvincible' && b.label) return `${b.label}: blocks the next hit completely, even through Ignore Invincible${uses}${turns}`;
  if (b.perField) return `${L} +${b.perField.add}% per ${b.perField.trait === 'Servant' ? 'enemy' : b.perField.trait} on the field${turns}`;
  if (b.s === 'knighthood') return `Knighthood Conferment: other allies' Guts revive with +${b.gutsHp} HP and grant ATK +${b.atkUp}% (3T)`;
  if (b.s === 'guardianParry') return `Giant's Protection: blocks a hit on any ally on their field${uses}${turns}`;
  if (b.s === 'doom') return `Thirst of Death: when it runs out, a death roll (DEF −50% for 1 turn if it fails)${turns}`;
  if (b.s === 'npEcho') return `NP +${b.v}% of what ${b.cls && b.cls.length ? b.cls.join('/') + ' ' : ''}allies spend on their NP${turns}`;
  if (b.s === 'fullCap') return `Fullness cap +${b.v}${turns}`;
  if (b.s === 'ignoreDmgCut') return `Ignores Damage Cut${turns}`;
  if (b.s === 'evadeLethal') return `Evades lethal hits${uses}${turns}`;
  if (b.s === 'pierceTrueInv') return `Pierces Anti-Enforcement DEF${turns}`;
  if (b.s === 'absorbDmg') return `Absorbs damage as HP${turns}`;
  if (b.s === 'exAoe') return `Extra Attack hits all enemies${turns}`;
  if (b.s === 'dotCut') return `Poison/Curse/Burn damage −${b.v}`;
  if (b.s === 'plotArmor') return `Plot Armor (own drawbacks nullified)${turns}`;
  if (b.s === 'clsOverride') return `Class: ${b.cls}${turns}`;
  if (b.s === 'negateField') return `${(b.fields || []).map(fieldName).join('/')} field negated (eclipse)${turns}`;
  if (b.s === 'cardType') return `All cards are ${COLOR[b.color]}${turns}`;
  if (b.s === 'cardSeal') return `${(b.cards || []).map(c => COLOR[c]).join('/')} Seal${turns}`;
  if (b.s === 'npSingle') return `NP hits one enemy${b.dmg ? ` (${b.dmg}%)` : ''}${turns}`;
  if (b.s === 'dotHeal') return `${STAT_LABEL[b.kind] || b.kind} heals instead${turns}`;
  if (b.s === 'convertInv') return 'Invincible becomes Anti-Enforcement DEF';
  if (b.s === 'aura' && b.aura && b.aura.s === 'trigger') return `${b.label || 'Aura'}: allies gain ${b.aura.label || 'an effect'} when damaged, while on the field`;
  if (b.s === 'trigger') return `${b.label || 'Triggered effect'}${uses}${turns}`;
  if (b.s === 'classRel') return `${b.label || 'Class affinity changed'}${turns}`;
  if (b.hpBelow != null && b.vLow != null) return `${L} +${b.v}% to +${b.vLow}% as HP falls below ${b.hpBelow}%${turns}`;
  if (b.hpBelow != null) return `${L} +${b.v}% while HP is ${b.hpBelow}% or less${turns}`;
  if (b.s === 'lockHand') return `Hand locked (same cards each turn)${turns}`;
  if (b.s === 'immuneTo') return `Immune to ${b.cats.map(c => STAT_LABEL[c] || c).join(' and ')}${uses}${turns}`;
  if (b.s === 'aura') return `${b.label || 'Aura'}: allies' ${STAT_LABEL[b.aura.s] || b.aura.s} ${b.aura.v > 0 ? '+' : ''}${b.aura.v}%${b.aura.cond ? ` (${b.aura.cond} only)` : ''}${b.aura.notVsClass ? ` (not vs ${b.aura.notVsClass.join(', ')})` : ''} while on the field`;
  if (b.s === 'counter') return `Counters each enemy card attack with ${b.np ? b.np.n : 'an NP'}${turns}`;
  if (b.s === 'eternalSleep') return 'Eternal Slumber (can\'t act, permanent)';
  if (b.s === 'rankUp') return `Skill Rank Up${turns}`;
  if (b.s === 'npType') return `NP is ${b.color}${turns}`;
  if (b.s === 'noCards') return `Can't be dealt cards${turns}`;
  if (b.s === 'multiHit') return `Normal attack hits ×${b.v} (same total damage)${turns}`;
  if (b.s === 'reflect') return `Reflect ${b.v}× damage taken to all enemies${turns}`;
  if (b.s === 'quickHitDebuff') return `Quick hits inflict ${STAT_LABEL[b.eff.s] || b.eff.s} ${b.eff.v}% (${b.eff.t}T)${uses}${turns}`;
  if (b.s === 'ocUp') return `Overcharge +${b.v * 100}% on next NP${uses}${turns}`;
  if (b.s === 'npOnBurnHit') return `NP +${b.v}% per hit on a Burned enemy${uses}${turns}`;
  if (DOTS.has(b.s)) return `${L} ${b.v}/turn${turns}`;
  if (b.s === 'guts') return `Guts ${b.hp} HP${uses}${turns}`;
  if (b.s === 'terror') return `Terror${turns}`;
  if (CONTROL.has(b.s)) return `${L}${turns}`;
  if (b.s === 'delayed') return `Delayed effect`;
  const flat = ['dmgPlus', 'dmgTakenPlus', 'dmgCut', 'maxHp', 'hpRegen', 'starRegen', 'busterAtkNp', 'curseOnAttack'].includes(b.s);
  const vs = b.vs ? ` vs ${b.vs}` : b.status ? ` vs ${{ curse: 'Cursed', burn: 'Burned', poison: 'Poisoned' }[b.status] || b.status}` : b.alignVs ? ` vs ${b.alignVs}` : '';
  const sign = b.v > 0 ? '+' : '';
  return `${L}${vs} ${sign}${b.v}${flat ? '' : '%'}${uses}${turns}`;
}

// ---------------------------------------------------------------- Death and Guts
// Categories a buff belongs to, used by partial buff/debuff removal.
function buffCats(b) {
  const c = new Set([b.debuff ? 'debuff' : 'buff', b.s, ...(b.tags || [])]);
  if (b.s === 'trait' && b.trait) c.add(b.trait);
  if (MENTAL.has(b.s)) c.add('mental');
  if (NO_ACT.includes(b.s)) c.add('immobilize');
  if (!b.debuff && ['def', 'evade', 'invincible', 'dmgCut', 'specialDef'].includes(b.s)) c.add('defUp');
  if (!b.debuff && b.s === 'atk') c.add('atkUp');
  if (b.debuff && b.s === 'atk') c.add('atkDown');
  if (b.debuff && b.s === 'def') c.add('defDown');
  if (!b.debuff && ['buster', 'arts', 'quick', 'extra'].includes(b.s)) c.add('cardUp');
  if (!b.debuff && ['critDmg', 'critRate'].includes(b.s)) c.add('critUp');
  if (!b.debuff && ['atk', 'buster', 'arts', 'quick', 'extra', 'npDmg', 'critDmg', 'special', 'dmgPlus'].includes(b.s)) c.add('dmgUp');
  return c;
}
function removable(b) { return !b.passive && !['delayed', 'trigger', 'eternalSleep', 'noSwap'].includes(b.s) && b.from !== 'Control rule'; }
// Effects that fire when the holder attacks, lands a crit, triggers Guts, etc.
function fireTriggers(g, u, on, ctx = {}) {
  if (!u || u.dead && on !== 'death') return;
  if (on === 'attack' && u.full > 0 && ctx.color !== 'EX') u.full -= 1; // Fullness digests with each attack
  if (g.players) for (const src of front(g, u.side)) for (const b of src.buffs) {
    const a = b.s === 'aura' && b.aura;
    if (!a || a.s !== 'trigger' || a.on !== on || u.dead) continue;
    if (a.cond && !hasTrait(u, a.cond)) continue;
    log(g, `${u.name}: ${a.label || 'triggered effect'} (${src.name}'s ${b.label || 'passive'}).`, 'act');
    applyEffects(g, a.eff, u, ctx.target ? ctx.target.uid : null, { from: b.label || 'Passive' });
  }
  for (const b of u.buffs.filter(x => x.s === 'trigger' && x.on === on && (x.n == null || x.n > 0))) {
    if (b.cards && !['damaged', 'death'].includes(b.on) && ((ctx.isNP && b.on !== 'npBefore') || !b.cards.includes(ctx.color))) continue;
    if (b.crit && !ctx.crit) continue;
    if (b.chance != null && g.rng() * 100 >= b.chance) continue;
    if (b.whileHas && !has(u, b.whileHas)) continue;
    if (b.whileMark != null && !hasMark(u, b.whileMark)) continue;
    if (b.mainOnly && ctx.color === 'EX') continue;
    const t = ctx.target;
    if (b.vsAny && !(t && b.vsAny.some(v => hasTrait(t, v) || t.buffs.some(x => x.s === v)))) continue;
    log(g, `${u.name}: ${b.label || 'triggered effect'} activates.`, 'act');
    applyEffects(g, b.eff, u, t ? t.uid : null, { from: b.from });
    if (b.n != null) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); }
  }
}
// Reflected damage (Aŋra Mainiiu's NP): after all attacks resolve, each attacker takes back what they dealt, as true damage.
// Reflected damage (Aŋra Mainiiu's NP): after all attacks resolve, everything they took while the reflect was up comes back
// multiplied, to every enemy on the field, as true damage (no defense, buffs, cuts or class/attribute multipliers apply).
function resolveReflections(g) {
  for (const t of Object.values(g.units)) {
    const b = t.buffs.find(x => x.s === 'reflect');
    if (b && t.dead) {
      // He has to survive the turn (Guts counts as surviving) for the reflect to happen.
      t.buffs.splice(t.buffs.indexOf(b), 1); t._reflect = null;
      log(g, `${t.name} fell before the reflect could trigger. No damage is reflected.`, 'miss');
      continue;
    }
    if (!b || !t._reflect) { t._reflect = null; continue; }
    const taken = Object.values(t._reflect).reduce((a, x) => a + x, 0);
    t._reflect = null;
    if (!taken) continue;
    t.buffs.splice(t.buffs.indexOf(b), 1);
    const back = Math.round(taken * b.v);
    log(g, `${t.name} reflects ${b.v === 1 ? `the ${taken} damage taken` : `${taken} damage taken ×${b.v}`} back as ${back} true damage to every enemy.`, 'activate');
    for (const a of front(g, enemyOf(t.side))) {
      a.hp -= back;
      log(g, `${a.name} takes ${back} true damage.`, 'dmg', { cause: { from: b.from, by: t.name } });
      fx(g, { t: 'hit', uid: a.uid, src: t.uid, dmg: back, aff: 'even' });
      if (a.hp <= 0) killOrGuts(g, a, t);
    }
  }
}
function killOrGuts(g, t, by) {
  const guts = t.buffs.filter(b => b.s === 'guts' && b.n > 0).sort((a, b) => a.t - b.t)[0];
  if (guts) {
    // Lord Logres's Knighthood Conferment: another ally's Guts revives with more HP, and that ally gains ATK
    const knight = front(g, t.side).find(x => x !== t && !x.dead && x.buffs.some(b => b.s === 'knighthood'));
    const kb = knight && knight.buffs.find(b => b.s === 'knighthood');
    guts.n -= 1;
    if (guts.n <= 0) t.buffs.splice(t.buffs.indexOf(guts), 1);
    t.hp = guts.hp + (kb ? kb.gutsHp : 0);
    log(g, `${t.name}'s Guts activates! Back at ${t.hp} HP.`, 'buff');
    if (kb) { t.buffs.push({ s: 'atk', v: kb.atkUp, t: 3, from: 'Knighthood Conferment' }); log(g, `${knight.name}'s Knighthood Conferment: ${t.name} +${kb.gutsHp} HP on revival, ATK +${kb.atkUp}% 3T.`, 'buff'); }
    fx(g, { t: 'guts', uid: t.uid, label: `Guts! ${guts.hp} HP` });
    if (guts.onGuts) applyEffects(g, guts.onGuts, t, null, { from: guts.from });
    fireTriggers(g, t, 'guts', {});
    return false;
  }
  t.hp = 0; t.dead = true; t.np = 0;
  fireTriggers(g, t, 'death', { target: by && by !== t && !by.dead ? by : null });
  log(g, `${t.name} is defeated.`, 'ko');
  fx(g, { t: 'ko', uid: t.uid });
  // A field that only lasts while its creator lives (Millennium Castle) collapses when they fall.
  if (g.fieldOverride && g.fieldOverride.owner === t.uid && g.turn <= g.fieldOverride.until) {
    const gone = g.fieldOverride.name; g.fieldOverride = null;
    log(g, `${t.name} has fallen, so ${fieldName(gone)} fades. The battlefield returns to ${fieldName(currentField(g))}.`, 'act');
    fx(g, { t: 'banner', side: t.side, label: `Battlefield: ${fieldName(currentField(g))}` });
  }
  return true;
}

// ---------------------------------------------------------------- Turn flow
function rebuildBag(g, p) {
  const P = g.players[p];
  const cards = [];
  for (const u of front(g, p)) [...u.d.deck].forEach((c, di) => cards.push({ uid: u.uid, type: c, di }));
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  P.bag = cards;
}
// A servant whose card set changes (Aoko -> Super Aoko): each of its cards keeps its deck position (di) and takes
// the new deck's card type at that position, in the draw pile, the hand, the locked hand and any attacks still to come.
function remapDeck(g, u, deck) {
  const P = g.players[u.side]; const D = [...deck];
  const fix = c => { if (c && c.uid === u.uid && c.type !== 'NP' && c.type !== 'EX' && c.di != null && D[c.di] && c.type !== D[c.di]) { c.type = D[c.di]; c.changed = true; } };
  for (const c of P.bag) fix(c); for (const c of P.hand) fix(c); for (const c of P.lockedHand || []) fix(c);
  for (const a of g._pending || []) if (a.p === u.side) fix(a.card);
  for (const pl of g._plans || []) if (pl.p === u.side) for (const c of pl.cards) fix(c);
}
// Cards that will change type when this servant's NP transforms it (shown with a ↻ before the NP).
function cardWillChange(g, c) {
  const u = U(g, c.uid); if (!u || c.type === 'NP' || c.di == null) return false;
  const np = u.kit.np; const tr = np && [...(np.pre || []), ...(np.post || [])].find(e => e.k === 'transform');
  const nd = tr && g.R[tr.into]; if (!nd) return false;
  return [...nd.deck][c.di] !== c.type;
}
function deal(g, p, fresh) {
  const P = g.players[p];
  const lockers = front(g, p).filter(u => has(u, 'lockHand'));
  if (!fresh && lockers.length && P.lockedHand) {
    if (front(g, p).map(u => u.uid).sort().join() === P.lockedFront) {
      P.hand = P.lockedHand.map((c, i) => ({ ...c, id: `c${g.turn}-${p}-${i}`, stars: 0 }));
      log(g, `P${p + 1}: the locked hand returns.`, 'phase'); return;
    }
    for (const u of lockers) u.buffs = u.buffs.filter(b => b.s !== 'lockHand'); // the team changed: the lock breaks
    log(g, `P${p + 1}: the team changed, so the hand lock breaks.`, 'phase');
  }
  if (!lockers.length) P.lockedHand = null;
  const alive = new Set(front(g, p).map(u => u.uid));
  P.bag = P.bag.filter(c => alive.has(c.uid));
  const locked = front(g, p).filter(u => has(u, 'noCards'));
  const free = front(g, p).filter(u => !has(u, 'noCards'));
  if (locked.length && free.length) {
    // Card lock: only the unlocked servants' cards are dealt this turn. The draw pile is left as it was.
    const pool = [];
    for (const u of free) [...u.d.deck].forEach((c, di) => pool.push({ uid: u.uid, type: c, di }));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    P.hand = pool.slice(0, 5).map((c, i) => ({ ...c, id: `c${g.turn}-${p}-${i}`, stars: 0 }));
    log(g, `P${p + 1}: ${locked.map(u => u.name).join(' and ')} can't be dealt cards this turn.`, 'phase');
    return;
  }
  if (P.bag.length < 5) rebuildBag(g, p);
  P.hand = P.bag.splice(0, 5).map((c, i) => ({ ...c, id: `c${g.turn}-${p}-${i}`, stars: 0 }));
}
function startTurn(g) {
  g.turn += 1;
  g.phase = 'skills';
  log(g, `Turn ${g.turn}`, 'turn');
  for (let q = 0; q < 2; q++) for (const u of front(g, q)) fireTriggers(g, u, 'turnStart', {});
  if (g.fields) log(g, `Battlefield: ${fieldName(currentField(g))}${g.fieldOverride && g.turn <= g.fieldOverride.until ? ' (changed by a skill)' : ''}.`, 'phase');
  const shore = fieldActive(g, 'Shore');
  if (shore && !g._wasShore) for (const u of Object.values(g.units)) if (u.aff != null && g.players[u.side].front.includes(u.uid)) addAffection(g, u, 10, 'Waterside field');
  g._wasShore = shore;
  for (let p = 0; p < 2; p++) { deal(g, p); g.players[p].skillQueue = []; g.players[p].masterQueue = []; g.players[p].sealQueue = null; g.players[p].cardSel = []; }
  // Terror: chance to stun once
  for (const u of Object.values(g.units)) {
    if (u.dead) continue;
    const t = u.buffs.find(b => b.s === 'terror' && !b.used);
    if (t && g.rng() < t.v / 100) { t.used = true; u.buffs.push({ s: 'stun', v: 1, t: 1, debuff: true }); log(g, `${u.name} freezes in Terror (Stun 1T).`, 'debuff'); }
  }
}

// ---- Skills
// ---- Master skills (one set per player)
const MASTER = [
  { n: 'Emergency Support', cd: 6, kind: 'ally', icon: 'heal', text: "Recover one servant's HP by 200. Gain 15 critical stars.",
    e: [{ k: 'heal', to: 'ally', v: 200 }, { k: 'stars', v: 15 }] },
  { n: 'Mana Enhancement', cd: 8, kind: 'ally', icon: 'atk', text: "500% chance to increase one servant's ATK by 40% (1T). Charge that servant's NP gauge by 10%.",
    e: [{ k: 'buff', to: 'ally', s: 'atk', v: 40, t: 1, p: 500 }, { k: 'np', to: 'ally', v: 10 }] },
  { n: 'Order Change', cd: 7, kind: 'swap', icon: 'swap', text: 'Immediately swap one servant on the field with one in reserve during skill selection. The incoming servant can use skills this phase and takes over the outgoing servant\'s Command Cards this turn.', e: [] },
];
function masterUsable(g, p, i) {
  const P = g.players[p];
  if (P.mcds[i] > 0) return { ok: false, why: `Cooldown ${P.mcds[i]}` };
  if (P.masterQueue.some(m => m.i === i)) return { ok: false, why: 'Queued' };
  if (i === 2 && !P.reserve.some(id => !U(g, id).dead)) return { ok: false, why: 'No reserves' };
  return { ok: true };
}
function nextSeq(g) { g.qseq = (g.qseq || 0) + 1; return g.qseq; }
function swappingOut(g, p) { const m = g.players[p].masterQueue.find(x => x.i === 2 && !x.applied); return m ? m.out : null; }
function queueMaster(g, p, i, target, inUid) {
  const ok = masterUsable(g, p, i); if (!ok.ok) return ok;
  const P = g.players[p];
  if (i === 2) {
    P.masterQueue.push({ i, out: target, in: inUid, seq: nextSeq(g) });
    P.skillQueue = P.skillQueue.filter(q => q.uid !== target); // the outgoing servant leaves before acting
  } else P.masterQueue.push({ i, target, seq: nextSeq(g) });
  return { ok: true };
}
function unqueueMaster(g, p, idx) { g.players[p].masterQueue.splice(idx, 1); }
// ---- Command Seal: once per game, full heal or +100% NP on any living servant (field or reserve).
function sealUsable(g, p) {
  if (!g.seals) return { ok: false, why: 'Off' };
  const P = g.players[p];
  if (P.sealUsed) return { ok: false, why: 'Used' };
  if (P.sealQueue) return { ok: false, why: 'Queued' };
  return { ok: true };
}
function sealTargetOk(g, p, kind, uid) {
  const u = U(g, uid);
  if (!u || u.dead || u.side !== p) return false;
  if (kind === 'heal') return u.hp < maxHp(u);
  return u.np < npCap(u);
}
// Skills and master skills that charge one ally's NP gauge can't target a servant without an NP (Hyde).
function chargesAllyNp(list) { return (list || []).some(e => e.k === 'np' && e.to === 'ally'); }
function allyTargetOk(g, T, uid) {
  const x = U(g, uid); if (!x || x.dead) return false;
  if (!hasNoNP(x)) return true;
  const list = T.master ? MASTER[T.i].e : U(g, T.uid).kit.sk[T.i].e;
  return !chargesAllyNp(list);
}
function queueSeal(g, p, kind, uid) {
  const ok = sealUsable(g, p); if (!ok.ok) return ok;
  if (!sealTargetOk(g, p, kind, uid)) return { ok: false, why: 'No effect' };
  g.players[p].sealQueue = { kind, uid, seq: nextSeq(g) }; return { ok: true };
}
function unqueueSeal(g, p) { g.players[p].sealQueue = null; }
function useSeal(g, p) {
  const P = g.players[p]; const q = P.sealQueue; if (!q) return;
  P.sealQueue = null; P.sealUsed = true;
  const u = U(g, q.uid);
  if (!u || u.dead) { log(g, `P${p + 1}'s Command Seal fizzles.`, 'miss'); return; }
  addAffection(g, u, 10, 'Command Seal');
  if (q.kind === 'heal') { const amt = Math.round(maxHp(u) - u.hp); u.hp = maxHp(u); log(g, `P${p + 1} Command Seal: ${u.name} is fully healed (+${amt} HP).`, 'buff'); }
  else { u.np = Math.min(npCap(u), u.np + 100); log(g, `P${p + 1} Command Seal: ${u.name}'s NP +100% (now ${Math.floor(u.np)}%).`, 'buff'); }
  fx(g, { t: 'seal', p, uid: u.uid, kind: q.kind, onField: P.front.includes(u.uid) });
}
function doOrderChange(g, p, outUid, inUid, reveal = true) {
  const P = g.players[p]; const out = U(g, outUid), inn = U(g, inUid);
  const k = P.front.indexOf(outUid), r = P.reserve.indexOf(inUid);
  if (k < 0 || r < 0 || out.dead || inn.dead || has(out, 'noSwap')) { log(g, `P${p + 1}'s Order Change fizzles${has(out, 'noSwap') ? ` (${out.name} can't be swapped out)` : ''}.`, 'miss'); return false; }
  P.front[k] = inUid; P.reserve[r] = outUid;
  for (const c of P.hand) if (c.uid === outUid) c.uid = inUid;
  rebuildBag(g, p);
  for (const q of [0, 1]) {
    for (const s of g.players[q].skillQueue) if (s.target === outUid) s.target = inUid;
    for (const m of g.players[q].masterQueue) if (m.target === outUid) m.target = inUid;
  }
  log(g, `P${p + 1} Order Change: ${inn.name} swaps in for ${out.name}.`, 'act');
  if (reveal) fx(g, { t: 'swap', p, out: outUid, in: inUid });
  return true;
}
function activateOrderChange(g, p, outUid, inUid) {
  const ready = masterUsable(g, p, 2);
  if (!ready.ok) return ready;
  const P = g.players[p], out = U(g, outUid), inn = U(g, inUid);
  if (!out || !inn || !P.front.includes(outUid) || !P.reserve.includes(inUid) || out.dead || inn.dead || has(out, 'noSwap')) {
    return { ok: false, why: 'Those servants cannot be swapped.' };
  }
  P.masterQueue.push({ i: 2, out: outUid, in: inUid, seq: nextSeq(g), applied: true,
    visualBefore: { front: P.front.slice(), reserve: P.reserve.slice() }, revealed: false,
    outSkills: P.skillQueue.filter(q => q.uid === outUid).map(q => ({ i: q.i, seq: q.seq })) });
  P.mcds[2] = MASTER[2].cd;
  log(g, `P${p + 1} Master activates ${MASTER[2].n}!`, 'activate', { master: 2 });
  fx(g, { t: 'swapNotice', p, out: outUid, in: inUid });
  doOrderChange(g, p, outUid, inUid, false);
  return { ok: true };
}
function skillUsable(g, u, i) {
  const P = g.players[u.side];
  const queuedOut = P.masterQueue.some(m => m.applied && m.out === u.uid && (m.outSkills || []).some(q => q.i === i));
  if (u.dead || (!P.front.includes(u.uid) && !queuedOut)) return { ok: false, why: 'Not on the field' };
  if (swappingOut(g, u.side) === u.uid) return { ok: false, why: 'Swapping out' };
  if (u.cds[i] > 0) return { ok: false, why: `Cooldown ${u.cds[i]}` };
  const sk_ = u.kit.sk[i];
  if (sk_ && sk_.needNp && u.np < sk_.needNp) return { ok: false, why: `Needs ${sk_.needNp}% NP` };
  if (sk_ && sk_.needStars && g.players[u.side].stars < sk_.needStars) return { ok: false, why: `Needs ${sk_.needStars} stars` };
  if (has(u, 'skillSeal')) return { ok: false, why: 'Skill Seal' };
  if (actBlocker(u)) return { ok: false, why: actBlocker(u) };
  if (g.players[u.side].skillQueue.some(q => q.uid === u.uid && q.i === i)) return { ok: false, why: 'Queued' };
  return { ok: true };
}
function skillTargetKind(u, i) {
  const e = u.kit.sk[i].e;
  if (e.some(x => x.to === 'ally')) return 'ally';
  if (e.some(x => x.to === 'enemy')) return 'enemy';
  return null;
}
function queueSkill(g, p, uid, i, target, opt) {
  const u = U(g, uid); const ok = skillUsable(g, u, i);
  if (!ok.ok) return ok;
  g.players[p].skillQueue.push({ uid, i, target, opt, seq: nextSeq(g) });
  return { ok: true };
}
function unqueueSkill(g, p, idx) { g.players[p].skillQueue.splice(idx, 1); }
// Skill resolution runs in phases across both players: taunts, stuns, buffs, debuffs, buff removal, debuff removal.
// Within a phase the tie-breaker holder goes first. Once a side has a taunter, the other side's single-target
// enemy skills are drawn to it.
const SKILL_PHASES = ['Taunt', 'Stun', 'Buffs', 'Debuffs', 'Buff removal', 'Debuff removal'];
function skillPhase(e) {
  if (e.k === 'buff' && e.s === 'taunt') return 0;
  if (e.k === 'control' && (e.kind === 'stun' || e.kind === 'charm' || e.kind === 'terror')) return 1;
  if (e.k === 'strip') return 4;
  if (e.k === 'cleanse') return 5;
  if (e.to === 'enemy' || e.to === 'enemies') return 3;
  if (e.k === 'selfDmg' || e.k === 'koSelf' || e.k === 'control' || e.k === 'dot' || e.k === 'drain' || e.k === 'death') return 3;
  if (e.k === 'buff' && (HARMFUL_POSITIVE.has(e.s) || (typeof e.v === 'number' && e.v < 0))) return 3;
  return 2;
}
function taunterOf(g, q) {
  const live = front(g, q).filter(u => has(u, 'taunt'));
  if (!live.length) return null;
  const last = g.lastTaunt && g.lastTaunt[q];
  return live.find(u => u.uid === last) || live[live.length - 1];
}
// Skills resolve one at a time in the order each player picked them, alternating between players and
// starting with the tie-breaker holder. When one player runs out, the other finishes their list.
// Every effect of a skill happens together. Master skills and the Command Seal sit in the same order.
// A servant announced by Order Change but not swapped in yet: anything aimed at them lands on the servant
// still holding that spot until the swap resolves.
function standIn(g, uid) {
  for (const P of g.players) for (const m of P.masterQueue) if (m.pendingSwap && m.in === uid) return m.out;
  return uid;
}
function resolveSkills(g) {
  log(g, 'Skills revealed', 'phase');
  for (const u of Object.values(g.units)) u.usedSkills = [];
  // An Order Change picked during selection is shown right away, but on resolution it happens at its place in
  // the queue: put the outgoing servant back for now, so skills picked before the swap land on the lineup as it
  // was (Mash's party DEF reaches her fellow starters, not the servant still waiting in reserve).
  for (let p = 0; p < 2; p++) {
    const P = g.players[p];
    for (const m of P.masterQueue.filter(x => x.i === 2 && x.applied && !x.revealed).reverse()) {
      const k = P.front.indexOf(m.in), r = P.reserve.indexOf(m.out);
      if (k < 0 || r < 0) continue;
      P.front[k] = m.out; P.reserve[r] = m.in;
      for (const c of P.hand) if (c.uid === m.in) c.uid = m.out;
      rebuildBag(g, p);
      m.pendingSwap = true;
    }
  }
  const lists = [0, 1].map(p => {
    const P = g.players[p];
    const items = [...P.skillQueue.map(q => ({ kind: 'skill', q, seq: q.seq })), ...P.masterQueue.map(m => ({ kind: 'master', m, seq: m.seq })),
      ...(P.sealQueue ? [{ kind: 'seal', seq: P.sealQueue.seq }] : [])];
    return items.sort((a, b) => a.seq - b.seq);
  });
  const at = [0, 0]; let turn = g.initiative;
  while (at[0] < lists[0].length || at[1] < lists[1].length) {
    const p = at[turn] < lists[turn].length ? turn : 1 - turn;
    resolveItem(g, p, lists[p][at[p]++]);
    turn = 1 - p;
  }
  for (let p = 0; p < 2; p++) { g.players[p].skillQueue = []; g.players[p].masterQueue = []; g.players[p].sealQueue = null; }
  distributeStars(g);
  g.phase = 'cards';
}
function resolveItem(g, p, item) {
  if (item.kind === 'seal') { useSeal(g, p); return; }
  if (item.kind === 'master') {
    const m = item.m; const M = MASTER[m.i];
    if (m.i === 2 && m.applied) {
      m.revealed = true;
      fx(g, { t: 'master', p, i: 2, uid: m.out });
      if (m.pendingSwap) { m.pendingSwap = false; doOrderChange(g, p, m.out, m.in); } // the swap itself happens now
      else fx(g, { t: 'swap', p, out: m.out, in: m.in });
      return;
    }
    g.players[p].mcds[m.i] = M.cd;
    log(g, `P${p + 1} Master activates ${M.n}!`, 'activate', { master: m.i });
    if (m.i === 2) { fx(g, { t: 'master', p, i: 2, uid: m.out }); doOrderChange(g, p, m.out, m.in); return; }
    const t = U(g, standIn(g, m.target));
    if (!t || t.dead || !g.players[p].front.includes(t.uid)) { log(g, `P${p + 1}'s ${M.n} fizzles.`, 'miss'); return; }
    fx(g, { t: 'master', p, i: m.i, uid: t.uid });
    addAffection(g, t, 5, 'Master skill');
    for (const e of M.e) applyEffect(g, e, t, t.uid, { from: M.n });
    return;
  }
  const q = item.q; const u = U(g, q.uid); const sk = u.kit.sk[q.i];
  const allowedAfterSwap = g.players[p].masterQueue.some(m => m.applied && m.out === u.uid && q.seq < m.seq && (m.outSkills || []).some(x => x.i === q.i && x.seq === q.seq));
  if (!g.players[p].front.includes(u.uid) && !allowedAfterSwap) { log(g, `${u.name}'s ${sk.n} fizzles (not on the field).`, 'miss'); return; }
  // Stunned, charmed or skill-sealed before activating: canceled, and the skill stays ready.
  const why = u.dead ? 'defeated' : actBlocker(u) || (has(u, 'skillSeal') ? 'Skill Seal' : null);
  if (why) {
    log(g, `${u.name}'s ${sk.n} is canceled (${why}). The skill stays ready.`, 'miss');
    fx(g, { t: 'eff', uid: u.uid, key: has(u, 'charm') ? 'charm' : has(u, 'pigify') ? 'pigify' : has(u, 'skillSeal') ? 'skillSeal' : 'stun', label: `${sk.n} canceled`, miss: true });
    return;
  }
  u.cds[q.i] = sk.cd;
  u.usedSkills = (u.usedSkills || []).concat([q.i]);
  log(g, `P${p + 1} ${u.name} activates ${sk.n}!`, 'activate', { skill: { uid: u.uid, i: q.i } });
  if (u.aff != null) { addAffection(g, u, 3, 'used a skill'); if (!g._firstSkill || g._firstSkill[p] !== g.turn) addAffection(g, u, 2, 'first skill this turn'); }
  g._firstSkill = g._firstSkill || [0, 0]; g._firstSkill[p] = g.turn;
  fx(g, { t: 'skill', uid: u.uid, i: q.i });
  const foe = enemyOf(u.side); let redirected = false;
  const stage = sk.ranks ? Math.min(skillRank(u), sk.ranks.length) : 0, effs = stage ? sk.ranks[stage - 1] : sk.e;
  if (stage) { // a ranked-up skill spends one Rank Up stack per stage it uses (oldest first)
    const stacks = u.buffs.filter(b => b.s === 'rankUp').sort((a, b) => a.t - b.t).slice(0, stage);
    u.buffs = u.buffs.filter(b => !stacks.includes(b));
    log(g, `${sk.n} is ranked up (stage ${stage}), using ${stage} Rank Up stack${stage > 1 ? 's' : ''}.`, 'buff');
  }
  g._skillSeq = (g._skillSeq || 0) + 1;
  let opt = q.opt;
  if (sk.opts) { // a skill with a choice: the chosen option's effects apply, plus everything shared
    opt = Number.isInteger(+opt) ? +opt : 0;
    const need = (sk.opts[opt] || {}).stars || 0;
    if (need && g.players[p].stars < need) { log(g, `Not enough stars for "${sk.opts[opt].label}" (${Math.floor(g.players[p].stars)}/${need}): using "${sk.opts[0].label}" instead.`, 'miss'); opt = 0; }
    log(g, `${sk.n}: ${sk.opts[opt].label}.`, 'act');
  }
  for (const e of effs) {
    if (sk.opts && e.opt != null && e.opt !== opt) continue;
    if (e.branch === 'self' && q.target !== u.uid) continue;   // Passionlip: one skill on herself,
    if (e.branch === 'other' && q.target === u.uid) continue;  // another on an ally
    let choice = standIn(g, q.target);
    if (e.to === 'enemy') {
      const tz = taunterOf(g, foe);
      if (tz && tz.uid !== q.target) {
        choice = tz.uid;
        if (!redirected) { redirected = true; log(g, `${sk.n} is drawn to ${tz.name}'s Taunt.`, 'act'); fx(g, { t: 'eff', uid: tz.uid, key: 'taunt', label: `Draws ${sk.n}` }); }
      }
    }
    applyEffect(g, e, u, choice, { from: sk.n, opt: q.opt });
  }
}
// Skills that ask the player for a choice when queued (Venus Driver: which NP type)
function skillOption(u, i) {
  const sk = u.kit.sk[i]; if (!sk) return null;
  if (sk.e.some(e => e.k === 'npTypeChoice')) return { kind: 'npType', options: ['Arts', 'Buster', 'Quick'], def: 'Arts' };
  if (sk.opts) return { kind: 'choice', options: sk.opts.map((o, k) => ({ v: String(k), label: o.label, stars: o.stars || 0 })), def: '0' };
  return null;
}
function skillRank(u) { return Math.min(2, u.buffs.filter(b => b.s === 'rankUp').length); }

// ---- Stars
function distributeStars(g) {
  for (let p = 0; p < 2; p++) {
    const P = g.players[p];
    let stars = Math.floor(P.stars);
    P.stars = 0;
    for (const c of P.hand) c.stars = 0;
    if (!stars) continue;
    const weights = P.hand.map(c => { const u = U(g, c.uid); return (CFG.classSA[u.cls] * (1 + sumStat(u, 'starGather') / 100)) * (0.5 + g.rng()); });
    while (stars > 0) {
      const open = P.hand.map((c, i) => c.stars < 10 ? i : -1).filter(i => i >= 0);
      if (!open.length) break;
      const tot = open.reduce((a, i) => a + weights[i], 0);
      let r = g.rng() * tot, pick = open[0];
      for (const i of open) { r -= weights[i]; if (r <= 0) { pick = i; break; } }
      P.hand[pick].stars += 1; stars -= 1;
    }
  }
}

// ---- Cards
function canAct(u) { return !u.dead && !NO_ACT.some(k => has(u, k)); }
function actBlocker(u) { const k = NO_ACT.find(x => has(u, x)); return k ? STAT_LABEL[k] : null; }
function npColor(u) {
  const ty = u.buffs.filter(b => b.s === 'npType').pop(); if (ty) return ty.color;
  if (u.sid === 11) return has(u, 'npToArts') ? 'Arts' : 'Buster';
  return u.d.np;
}
function wake(g, t) { if (!t.dead && has(t, 'sleep')) { t.buffs = t.buffs.filter(b => b.s !== 'sleep'); log(g, `${t.name} wakes up.`, 'buff'); } }
function sacrificeOf(g, u) { return front(g, u.side).find(x => x.uid !== u.uid && !x.dead && !hasTrait(x, 'Cant Be Sacrificed') && !has(x, 'eternalSleep')); }
function npNeedsSacrifice(u) { const n = u.kit.np; return !!(n && [...(n.pre || []), ...(n.post || []), ...(n.oc || [])].some(e => e.k === 'sacrifice')); }
function availableNPs(g, p) {
  return front(g, p).filter(u => !hasNoNP(u) && u.np >= 100 && canAct(u) && !has(u, 'npSeal') && (!npNeedsSacrifice(u) || sacrificeOf(g, u))).map(u => ({ uid: u.uid, type: 'NP', id: `np-${u.uid}` }));
}
function cardColor(g, c) {
  if (c.type === 'NP') return LETTER[npColor(U(g, c.uid))];
  const u = U(g, c.uid);
  if (has(u, 'allBuster')) return 'B';
  const ct = u.buffs.find(b => b.s === 'cardType'); if (ct && c.type !== 'EX') return ct.color; // Durga: every card becomes Arts
  return c.type;
}
// Card-type seals (Cnoc na Riabh's VVV: Arts Seal): that servant's cards of the sealed type don't activate.
function cardSealed(g, c) { if (c.type === 'NP') return false; const u = U(g, c.uid); return !!u && u.buffs.some(b => b.s === 'cardSeal' && b.cards && b.cards.includes(cardColor(g, c))); }
function setCards(g, p, sel) { g.players[p].cardSel = sel; }

function resolveCards(g) {
  log(g, 'Cards revealed', 'phase');
  const plans = [0, 1].map(p => planChain(g, p)); g._plans = plans;
  for (const pl of plans) for (const c of pl.cards) if (!c.inactive) addAffection(g, U(g, c.uid), 3, 'card chosen');
  for (const pl of plans) if (pl.brave) addAffection(g, U(g, pl.cards[0].uid), 6, 'Brave Chain');
  const actions = [];
  for (let slot = 0; slot < 4; slot++) {
    const here = [];
    for (let p = 0; p < 2; p++) {
      const pl = plans[p];
      if (slot < 3 && pl.cards[slot]) here.push({ p, slot, card: pl.cards[slot], plan: pl });
      if (slot === 3 && pl.brave) here.push({ p, slot, card: { uid: pl.cards[0].uid, type: 'EX', target: pl.cards[2].target }, plan: pl });
    }
    here.sort((a, b) => {
      // NPs move at their card type's speed: a Quick NP ties a Quick card, an Arts NP an Arts card, and so on.
      const prio = c => c.type === 'NP' ? CFG.priority[LETTER[npColor(U(g, c.uid))]] : CFG.priority[c.type];
      const pa = prio(a.card), pb = prio(b.card);
      if (pa !== pb) return pa - pb;
      return (a.p === g.initiative ? 0 : 1) - (b.p === g.initiative ? 0 : 1);
    });
    actions.push(...here);
  }
  for (let p = 0; p < 2; p++) {
    const pl = plans[p];
    const names = [];
    if (pl.mighty) names.push('Mighty Chain');
    if (pl.chain) names.push(`${COLOR[pl.chain]} Chain`);
    if (pl.brave) names.push('Brave Chain');
    const off = pl.cards.filter(c => c.inactive).length;
    if (names.length) { log(g, `P${p + 1}: ${names.join(' + ')}.`, 'buff'); fx(g, { t: 'banner', side: p, label: [pl.mighty && 'Mighty Chain', pl.chain && `${COLOR[pl.chain]} Chain`, pl.brave && 'Brave Chain'].filter(Boolean).join(' + ') }); }
    if (off) log(g, `P${p + 1}: ${off} card${off > 1 ? 's' : ''} won't activate (Stun, Charm or knocked out), so no chain bonus.`, 'miss');
  }
  // Arts Chain: +20% NP to each attacker as soon as the chain is revealed, before any card resolves
  for (let p = 0; p < 2; p++) {
    const pl = plans[p];
    if (pl.chain !== 'A') continue;
    log(g, `P${p + 1} Arts Chain: +${CFG.artsChainNp}% NP to each attacker.`, 'buff');
    for (const uid of new Set(pl.cards.map(c => c.uid))) {
      const u = U(g, uid); if (!u || u.dead) continue;
      u.np = Math.min(npCap(u), u.np + CFG.artsChainNp);
      fx(g, { t: 'eff', uid, key: 'np', label: `Arts Chain NP +${CFG.artsChainNp}%` });
    }
  }
  g._pending = actions;
  for (const a of actions) {
    if (g.over) break;
    if (a.slot === 3 && !a.plan.extraStarted) { a.plan.extraStarted = true; }
    execAction(g, a);
    if (checkWinner(g)) break;
  }
  if (!g.over) for (let p = 0; p < 2; p++) {
    const pl = plans[p];
    if (pl.chain === 'Q') { g.players[p].stars = Math.min(CFG.starBankCap, g.players[p].stars + CFG.quickChainStars); log(g, `P${p + 1} Quick Chain: +${CFG.quickChainStars} stars for next turn.`, 'buff'); fx(g, { t: 'banner', side: p, label: `Quick Chain: +${CFG.quickChainStars} stars` }); }
  }
  resolveReflections(g);
  endTurn(g);
}
function planChain(g, p) {
  const sel = g.players[p].cardSel.slice(0, 3).map(c => { const u = U(g, c.uid); return { ...c, inactive: !u || u.dead || !canAct(u) || cardSealed(g, c) }; });
  let npIdx = 0;
  for (const c of sel) if (c.type === 'NP' && !c.inactive) c.ocBonus = npIdx++;
  const colors = sel.map(c => cardColor(g, c));
  const allActive = sel.length === 3 && sel.every(c => !c.inactive);
  const first = sel[0] && !sel[0].inactive ? colors[0] : null;
  const chain = allActive && colors.every(c => c === colors[0]) ? colors[0] : null;
  const mighty = allActive && new Set(colors).size === 3;
  const brave = allActive && sel.every(c => c.uid === sel[0].uid);
  const bonus = { B: first === 'B' || mighty, A: first === 'A' || mighty, Q: first === 'Q' || mighty };
  const artsFirstNp = (first === 'A' && sel[0].type !== 'NP') || mighty; // an Arts NP in front gives no first-card NP bonus
  return { p, cards: sel, colors, first, chain, mighty, brave, bonus, artsFirstNp };
}
function pickTarget(g, attacker, wanted) {
  const q = enemyOf(attacker.side);
  const live = front(g, q);
  if (!live.length) return null;
  const taunters = live.filter(u => has(u, 'taunt'));
  if (taunters.length) return taunters.includes(U(g, wanted)) ? U(g, wanted) : taunterOf(g, q);
  const w = U(g, wanted);
  if (w && !w.dead && g.players[q].front.includes(w.uid)) return w;
  return live[0];
}

function execAction(g, a) {
  const u = U(g, a.card.uid);
  const tag = `P${a.p + 1} slot ${a.slot + 1}`;
  if (!u || u.dead || !g.players[u.side].front.includes(u.uid)) { log(g, `${tag}: ${u ? u.name : 'Card'} is down, card fizzles.`, 'miss'); return; }
  if (a.card.inactive && cardSealed(g, a.card) && canAct(u)) { log(g, `${tag}: ${u.name}'s ${COLOR[cardColor(g, a.card)]} card is sealed and doesn't activate.`, 'miss'); fx(g, { t: 'eff', uid: u.uid, key: 'skillSeal', label: `${COLOR[cardColor(g, a.card)]} sealed`, miss: true }); return; }
  if (a.card.inactive) { log(g, `${tag}: ${u.name}'s card doesn't activate.`, 'miss'); fx(g, { t: 'eff', uid: u.uid, key: has(u, 'charm') ? 'charm' : has(u, 'pigify') ? 'pigify' : 'stun', label: "Won't activate", miss: true }); return; }
  if (!canAct(u)) { log(g, `${tag}: ${u.name} can't act (${actBlocker(u)}).`, 'miss'); fx(g, { t: 'eff', uid: u.uid, key: NO_ACT.find(k => has(u, k)), label: "Can't act", miss: true }); return; }
  if (a.card.type === 'NP') return execNP(g, u, a, tag);
  const color = a.slot === 3 ? 'EX' : cardColor(g, a.card);
  const t = pickTarget(g, u, a.card.target);
  if (!t) return;
  fx(g, { t: 'act', uid: u.uid, color, label: COLOR[color], slot: a.slot });
  const aoe = (u.d.aoeCards || []).includes(color) || (color === 'EX' && has(u, 'exAoe'));
  const foes = aoe ? front(g, enemyOf(u.side)) : [];
  if (aoe && foes.length > 1) { // hits every enemy: the chosen one first, half damage each
    const order = [t, ...foes.filter(x => x !== t)];
    order.forEach((x, k) => { if (!x.dead && x.hp > 0) attackCard(g, u, x, color, { ...a, aoeHalf: true, aoeRest: k > 0, aoeMore: k < order.length - 1 }, tag); });
    return;
  }
  attackCard(g, u, t, color, a, tag);
}

function hitBlocked(g, u, t) {
  const pierceTI = has(u, 'pierceTrueInv'); // Hakuno / Jade Rabbit: goes through Anti-Enforcement DEF (not Evade)
  if (has(t, 'trueInvincible') && !pierceTI) { consume(t, 'trueInvincible'); return 'Anti-Enforcement DEF'; }
  if (has(t, 'invincible') && has(t, 'convertInv') && !pierceTI) { consume(t, 'invincible'); return 'Anti-Enforcement DEF'; } // Kukulcan
  if (has(t, 'invincible') && has(t, 'convertInv') && pierceTI) return null;
  if (has(t, 'invincible') && !has(u, 'ignoreInv')) { consume(t, 'invincible'); return 'Invincible'; }
  if (has(t, 'evade') && !has(u, 'sureHit') && !has(u, 'ignoreInv')) { consume(t, 'evade'); return 'Evade'; }
  if (!has(u, 'ignoreInv')) { // Kingprotea Alter's Giant's Protection guards every ally on her field
    const gp = front(g, t.side).find(x => !x.dead && has(x, 'guardianParry'));
    if (gp) { consume(gp, 'guardianParry'); return gp === t ? "Giant's Protection" : `Giant's Protection (from ${gp.name})`; }
  }
  return null;
}

function defMod(u, t, ignoreDefUp) {
  let def = 0;
  for (const b of t.buffs) if (b.s === 'def' && (b.n == null || b.n > 0)) { if (ignoreDefUp && b.v > 0) continue; def += b.v; }
  return def;
}

function attackCard(g, u, t, color, a, tag) {
  const pl = a.plan;
  const slot = Math.min(a.slot, 2);
  if (has(u, 'curseOnAttack')) {
    const b = u.buffs.find(x => x.s === 'curseOnAttack');
    t.buffs.push({ s: 'curse', v: b.v, t: 5, debuff: true, from: b.from });
  }
  const blocked = hitBlocked(g, u, t);
  if (blocked) { log(g, `${tag}: ${u.name}'s ${COLOR[color]} is blocked by ${t.name}'s ${blocked}.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: blocked === 'Evade' ? 'evade' : 'invincible', label: blocked, miss: true }); return; }
  if (!a.aoeRest) fireTriggers(g, u, 'cardBefore', { color, target: t });
  let cardVal = color === 'EX' ? (pl.chain ? CFG.extraBrave : CFG.extraVal) : CFG.cardVal[color][slot];
  if (pl.bonus.B) cardVal += CFG.busterFirst;
  const colorStat = { B: 'buster', A: 'arts', Q: 'quick', EX: 'extra' }[color];
  const resStat = { B: 'busterRes', A: 'artsRes', Q: 'quickRes', EX: null }[color];
  const cardUp = colorStat ? sumStat(u, colorStat) : 0;
  const cardRes = resStat ? sumStat(t, resStat) : 0;
  const atkUp = sumStat(u, 'atk');
  const def = defMod(u, t, has(u, 'ignoreDef'));
  const special = sumStat(u, 'special', t) - sumStat(t, 'specialDef', u);
  const stars = a.card.stars || 0;
  const chainCrit = (pl.chain === 'Q' || pl.mighty) ? CFG.quickChainCrit / 100 : 0;
  const critChance = (stars || chainCrit) ? Math.min(1, Math.max(0, stars * 0.1 + chainCrit + (stars ? sumStat(u, 'critRate', t) / 100 : 0) - sumStat(t, 'critRes') / 100)) : 0;
  const crit = color !== 'EX' && g.rng() < critChance;
  const rnd = CFG.dmgRandom[0] + g.rng() * (CFG.dmgRandom[1] - CFG.dmgRandom[0]);
  let dmg = u.d.atk * cardVal * classMult(u, t) * attrMult(u, t) * Math.max(0.1, 1 + (atkUp - def) / 100)
    * Math.max(0.1, 1 + (cardUp - cardRes) / 100) * (crit ? 2 * Math.max(0.1, 1 + (sumStat(u, 'critDmg', t) + sumStat(t, 'critDmgTaken')) / 100) : 1)
    * Math.max(0.1, 1 + special / 100) * rnd;
  dmg += sumStat(u, 'dmgPlus') + sumStat(t, 'dmgTakenPlus');
  if (pl.chain === 'B' && color === 'B') dmg += u.d.atk * CFG.busterChainAtk;
  if (a.aoeHalf) dmg *= 0.5; // a card that hits every enemy deals half to each
  const cut = has(u, 'ignoreDmgCut') ? 0 : sumStat(t, 'dmgCut');
  if (cut) { dmg -= cut; consumeAllUses(t, 'dmgCut'); }
  dmg = Math.max(0, Math.round(dmg));
  dmg = lethalGuard(g, t, dmg);
  const hits = (u.d.hits[color] || 1) * (color === 'EX' ? 1 : u.buffs.filter(b => b.s === 'multiHit').reduce((m, b) => m * b.v, 1));
  dealDamage(g, u, t, dmg, hits);
  // NP gain
  const gain = npPerHit(u, t, color, color === 'EX' ? 0 : slot, pl.artsFirstNp, crit) * hits;
  u.np = Math.min(npCap(u), u.np + gain);
  // Stars
  const made = starsFor(g, u, color, color === 'EX' ? 0 : slot, pl.bonus.Q, crit, hits);
  g.players[u.side].stars = Math.min(CFG.starBankCap, g.players[u.side].stars + made);
  if (color === 'B' && has(u, 'busterAtkNp')) { const b = u.buffs.find(x => x.s === 'busterAtkNp'); u.np = Math.min(npCap(u), u.np + b.v); consume(u, 'busterAtkNp'); }
  if (colorStat) consumeCardUses(u, colorStat);
  log(g, `${tag}: ${u.name} ${COLOR[color]}${crit ? ' CRIT' : ''} → ${t.name} for ${dmg}. NP ${Math.floor(u.np)}%, +${fmtStars(made)}★`, 'dmg', { dmgNum: dmg, aff: affOf(u, t) });
  fx(g, { t: 'hit', uid: t.uid, src: u.uid, dmg, aff: affOf(u, t), crit, color, dist: hitSplit(u, color, hits), aoe: !!a.aoeHalf });
  if (dmg > 0 && t.hp > 0) fireTriggers(g, t, 'damaged', { crit, target: u, isHit: true });
  if (dmg > 0) wake(g, t);
  if (!t.dead && t.hp > 0 && !u.dead && has(t, 'counter')) counterAttack(g, t, u);
  onHitRiders(g, u, t, color, false);
  if (!a.aoeMore) { fireTriggers(g, u, 'cardAfter', { color, crit, target: t }); fireTriggers(g, u, 'attack', { color, crit, target: t }); }
  if (t.hp <= 0) killOrGuts(g, t, u);
}
// Evade Lethal Damage (Soujuurou): a hit that would defeat it is dodged instead, using one charge.
function lethalGuard(g, t, dmg) {
  if (dmg > 0 && dmg >= t.hp && has(t, 'evadeLethal')) { consume(t, 'evadeLethal'); log(g, `${t.name} evades the lethal blow!`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'evade', label: 'Lethal hit evaded', miss: true }); return 0; }
  if (dmg > 0 && has(t, 'absorbDmg')) { // Passionlip: damage taken this turn is absorbed as healing
    if (!has(t, 'noHeal')) { t.hp = Math.min(maxHp(t), t.hp + dmg); log(g, `${t.name} absorbs the hit and heals ${dmg}.`, 'buff'); fx(g, { t: 'eff', uid: t.uid, key: 'heal', label: `Absorbs ${dmg}` }); }
    return 0;
  }
  return dmg;
}
const CARD_STAT = { B: 'buster', A: 'arts', Q: 'quick', EX: 'extra' };
// Arts and Extra buffs add a little NP gain; Quick and Extra buffs add a little star generation.
function npPerHit(u, t, color, slot, artsFirst, crit) {
  const val = CFG.npCardVal[color][Math.max(0, Math.min(2, slot || 0))];
  const cardMod = sumStat(u, CARD_STAT[color]) / 100;
  const enemy = CFG.enemyNpMod[t && t.cls] || 1;
  const raw = u.d.na * ((artsFirst ? 1 : 0) + val * Math.max(1 + cardMod, 0)) * enemy * (1 + sumStat(u, 'npGain') / 100) * (crit ? 2 : 1);
  return Math.floor(Math.floor(raw * 100)) / 100; // floors work on hundredths of a percent, as in FGO
}
function cardNpMult(u, color) { return (color === 'A' || color === 'EX') ? Math.max(0, 1 + sumStat(u, CARD_STAT[color]) * CFG.cardBuffSecondary / 100) : 1; }
function starRate(u, color, slot, quickFirst, crit) {
  const card = CFG.cardStarRate[color][Math.max(0, Math.min(2, slot || 0))];
  const pct = (u.d.sr || 0) + card * (1 + sumStat(u, CARD_STAT[color]) / 100) + (quickFirst ? CFG.quickFirstStar : 0) + (crit ? CFG.critStarBonus : 0) + sumStat(u, 'starDrop');
  return Math.max(0, Math.min(CFG.starHitCap, pct)) / 100;
}
function starsFor(g, u, color, slot, quickFirst, crit, hits) {
  const p = starRate(u, color, slot, quickFirst, crit); let n = 0;
  for (let h = 0; h < Math.max(1, hits); h++) n += Math.floor(p) + (g.rng() < p - Math.floor(p) ? 1 : 0); // e.g. 2.51: 2 stars, 51% for a 3rd
  return n;
}
function fmtStars(n) { return String(Math.round(n * 100) / 100); }
// Effects that trigger when this servant lands an attack.
function onHitRiders(g, u, t, color, isNP) {
  if (t.dead) return;
  if (color === 'Q' && !isNP) for (const b of u.buffs.filter(x => x.s === 'quickHitDebuff' && (x.n == null || x.n > 0))) {
    const e = { k: 'buff', s: b.eff.s, v: b.eff.v, t: b.eff.t };
    if (debuffLands(g, u, t, e)) {
      const d = { s: e.s, v: e.v, t: e.t, debuff: true, from: b.from };
      t.buffs.push(d); log(g, `${t.name}: ${describeBuff(d)}.`, 'debuff'); fx(g, { t: 'eff', uid: t.uid, buff: { ...d }, label: describeBuff(d) });
    }
    if (b.n != null) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); }
  }
  if (t.buffs.some(x => x.s === 'burn')) {
    const b = u.buffs.find(x => x.s === 'npOnBurnHit' && (x.n == null || x.n > 0));
    if (b) { u.np = Math.min(npCap(u), u.np + b.v); log(g, `${u.name}: NP +${b.v}% (hit a Burned enemy).`, 'buff'); fx(g, { t: 'eff', uid: u.uid, key: 'np', label: `NP +${b.v}%` }); if (b.n != null) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); } }
  }
}
function consumeCardUses(u, stat) {
  for (const b of u.buffs.slice()) if (b.s === stat && b.n != null) { b.n -= 1; if (b.n <= 0) u.buffs.splice(u.buffs.indexOf(b), 1); }
}
// How a card's damage is split across its hits (FGO's per-hit percentages), for the animation.
// Extra hits from effects like Musashi's Fifth Force split each hit evenly.
function hitSplit(u, card, hits) {
  let d = (u.d.hitDist && u.d.hitDist[card] && u.d.hitDist[card].length) ? u.d.hitDist[card].slice() : [100];
  if (hits > d.length && hits % d.length === 0) { const m = hits / d.length; d = d.flatMap(x => Array(m).fill(x / m)); }
  return d;
}
function counterAttack(g, u, t) {
  const b = u.buffs.find(x => x.s === 'counter'); const np = b && b.np; if (!np) return;
  const letter = LETTER[np.card] || 'Q';
  log(g, `${u.name} counters with ${np.n}!`, 'np'); fx(g, { t: 'act', uid: u.uid, color: letter, np: true, label: np.n });
  const def = defMod(u, t, false);
  const rnd = CFG.dmgRandom[0] + g.rng() * (CFG.dmgRandom[1] - CFG.dmgRandom[0]);
  let dmg = u.d.atk * (np.dmg / 100) * CFG.npBase[np.card] * classMult(u, t) * attrMult(u, t) * Math.max(0.1, 1 + (sumStat(u, 'atk') - def) / 100)
    * Math.max(0.1, 1 + (sumStat(u, CARD_STAT[letter]) - sumStat(t, { B: 'busterRes', A: 'artsRes', Q: 'quickRes' }[letter])) / 100)
    * Math.max(0.1, 1 + (sumStat(u, 'npDmg') + sumStat(u, 'special', t)) / 100) * Math.max(0.1, 1 - sumStat(t, 'npDmgRes') / 100) * rnd;
  dmg += sumStat(u, 'dmgPlus') + sumStat(t, 'dmgTakenPlus');
  const cut = sumStat(t, 'dmgCut'); if (cut) { dmg -= cut; consumeAllUses(t, 'dmgCut'); }
  dmg = lethalGuard(g, t, Math.max(0, Math.round(dmg)));
  const hits = np.hits || 1;
  t.hp -= dmg;
  u.np = Math.min(npCap(u), u.np + npPerHit(u, t, letter, 0, false, false) * hits);
  log(g, `${np.n} hits ${t.name} for ${dmg}.`, 'dmg', { dmgNum: dmg, aff: affOf(u, t) });
  fx(g, { t: 'hit', uid: t.uid, src: u.uid, dmg, aff: affOf(u, t), np: true, color: letter, dist: np.dist || [100] });
  applyEffects(g, np.post || [], u, t.uid, { from: np.n, forceTargets: [t] });
  if (t.hp <= 0) killOrGuts(g, t, u);
}
function dealDamage(g, u, t, dmg, hits) {
  t.hp -= dmg;
  if (dmg > 0 && has(t, 'reflect')) { t._reflect = t._reflect || {}; t._reflect[u.uid] = (t._reflect[u.uid] || 0) + dmg; }
  if (dmg > 0) {
    const gain = t.d.nd * hits * (1 + (sumStat(t, 'npGain') + sumStat(t, 'ndGain')) / 100);
    if (!t.dead) t.np = Math.min(npCap(t), t.np + gain);
  }
}

function execNP(g, u, a, tag) {
  if (u.np < 100 || has(u, 'npSeal')) { log(g, `${tag}: ${u.name}'s NP fizzles (${has(u, 'npSeal') ? 'NP Seal' : 'gauge below 100%'}).`, 'miss'); fx(g, { t: 'eff', uid: u.uid, key: 'npSeal', label: 'NP fizzles', miss: true }); return; }
  const np = u.kit.np;
  const color = npColor(u);
  const ocUp = sumStat(u, 'ocUp'); if (ocUp) consumeAllUses(u, 'ocUp');
  const oc = Math.min(5, Math.floor(u.np / 100) + (a.card.ocBonus || 0) + ocUp);
  const spent = u.np; u.np = 0;
  for (const x of front(g, u.side)) if (x !== u) for (const b of x.buffs.filter(b => b.s === 'npEcho')) { // Solomon: NP back when a Caster ally uses theirs
    if (b.cls && b.cls.length && !b.cls.includes(effCls(u))) continue;
    const gain = Math.round(spent * b.v) / 100; x.np = Math.min(npCap(x), x.np + gain); log(g, `${x.name}: NP +${gain}% (${u.name} used their NP).`, 'buff');
  }
  log(g, `${tag}: ${u.name} activates Noble Phantasm ${np.n}! (NP${npLevel(u)}, overcharge ${oc * 100}%)`, 'np');
  fx(g, { t: 'act', uid: u.uid, color: LETTER[color], np: true, label: np.n, oc });
  if (u.aff != null && oc >= 2) addAffection(g, u, oc === 2 ? 5 : oc === 3 ? 10 : 15, `${oc * 100}% overcharge`);
  const lv = affLevel(u); const gate = list => (list || []).filter(e => e.minAffection == null || lv >= e.minAffection);
  const pre = gate(lerpOC(np.pre, oc)), post = gate(lerpOC(np.post, oc)), ocl = gate(lerpOC(np.oc, oc));
  applyEffects(g, pre, u, a.card.target, { from: np.n });
  fireTriggers(g, u, 'npBefore', { isNP: true, color: LETTER[color], target: U(g, a.card.target) });
  let targets = [];
  const single = !np.single && np.tgt === 'all' ? u.buffs.find(b => b.s === 'npSingle') : null; // Barghest: NP narrowed to one enemy
  if (np.tgt === 'one' || np.single || single) { const t = pickTarget(g, u, a.card.target); if (t) targets = [t]; }
  else if (np.tgt === 'all') targets = front(g, enemyOf(u.side));
  if (np.tgt !== 'none') {
    const hits = Math.max(1, u.d.hits.NP || 1);
    const letter = LETTER[color];
    for (const t of targets) {
      const blocked = hitBlocked(g, u, t);
      if (blocked) { log(g, `${t.name} blocks the NP with ${blocked}.`, 'miss'); fx(g, { t: 'eff', uid: t.uid, key: blocked === 'Evade' ? 'evade' : 'invincible', label: blocked, miss: true }); continue; }
      const cardUp = sumStat(u, { B: 'buster', A: 'arts', Q: 'quick' }[letter]);
      const cardRes = sumStat(t, { B: 'busterRes', A: 'artsRes', Q: 'quickRes' }[letter]);
      const def = defMod(u, t, np.ignoreDefUp || np.ignoreDef || has(u, 'ignoreDef'));
      const special = sumStat(u, 'special', t) - sumStat(t, 'specialDef', u);
      let npSpecial = 1;
      if (np.special) {
        const sp = np.special;
        const ok = sp.vs ? hasTrait(t, sp.vs) : sp.status ? t.buffs.some(b => b.s === sp.status) : sp.anyOf ? sp.anyOf.some(x => has(t, x) || hasTrait(t, x)) : sp.rarity ? sp.rarity.includes(t.d.rar) : false;
        if (ok) npSpecial = (np.special.v5 != null ? np.special.v + (np.special.v5 - np.special.v) * (oc - 1) / 4 : np.special.v) / 100;
      }
      const rnd = CFG.dmgRandom[0] + g.rng() * (CFG.dmgRandom[1] - CFG.dmgRandom[0]);
 const npPct = (single && single.dmg ? single.dmg : np.dmg) + (np.affectionDmg ? np.affectionDmg * Math.max(0, affLevel(u) - 1) : 0) + (np.selfStack ? np.selfStack.per * Math.min(np.selfStack.max, markCount(u, np.selfStack.mark)) : 0) + (np.ocDmg ? np.ocDmg.v + (np.ocDmg.v5 - np.ocDmg.v) * (oc - 1) / 4 : 0) + (np.lowHp ? np.lowHp * (1 - u.hp / maxHp(u)) : 0);
      let dmg = u.d.atk * (npPct / 100) * CFG.npBase[color] * classMult(u, t) * attrMult(u, t)
        * Math.max(0.1, 1 + (sumStat(u, 'atk') - def) / 100) * Math.max(0.1, 1 + (cardUp - cardRes) / 100)
        * Math.max(0.1, 1 + (sumStat(u, 'npDmg') + special) / 100) * npSpecial * Math.max(0.1, 1 - sumStat(t, 'npDmgRes') / 100) * rnd;
      dmg += sumStat(u, 'dmgPlus') + sumStat(t, 'dmgTakenPlus');
      const cut = has(u, 'ignoreDmgCut') ? 0 : sumStat(t, 'dmgCut');
      if (cut) { dmg -= cut; consumeAllUses(t, 'dmgCut'); }
      dmg = Math.max(0, Math.round(dmg));
      dmg = lethalGuard(g, t, dmg);
      dealDamage(g, u, t, dmg, hits);
      const gain = npPerHit(u, t, letter, 0, false, false) * hits;
      u.np = Math.min(npCap(u), u.np + gain);
      const npStars = starsFor(g, u, letter, 0, a.plan && a.plan.bonus && a.plan.bonus.Q, false, hits);
      g.players[u.side].stars = Math.min(CFG.starBankCap, g.players[u.side].stars + npStars);
      log(g, `${np.n} hits ${t.name} for ${dmg}. +${fmtStars(npStars)}★`, 'dmg', { dmgNum: dmg, aff: affOf(u, t) });
      fx(g, { t: 'hit', uid: t.uid, src: u.uid, dmg, aff: affOf(u, t), np: true, aoe: np.tgt === 'all' && !single, color: letter, dist: hitSplit(u, 'NP', hits) });
      if (dmg > 0 && t.hp > 0) fireTriggers(g, t, 'damaged', { target: u, isHit: true });
      if (dmg > 0) wake(g, t);
      onHitRiders(g, u, t, letter, true);
      fireTriggers(g, u, 'attack', { color: letter, isNP: true, target: t });
    }
    consumeCardUses(u, { B: 'buster', A: 'arts', Q: 'quick' }[letter]);
    for (const t of targets) if (t.hp <= 0 && !t.dead) killOrGuts(g, t, u);
  }
  const choice = targets[0] ? targets[0].uid : a.card.target;
  const last = (post || []).filter(e => e.k === 'retreat'); // leaving the field happens after everything else
  applyEffects(g, (post || []).filter(e => e.k !== 'retreat'), u, choice, targets.length ? { forceTargets: targets, from: np.n } : { from: np.n });
  applyEffects(g, ocl, u, choice, targets.length ? { forceTargets: targets, from: np.n + ' (overcharge)' } : { from: np.n + ' (overcharge)' });
  if (last.length) applyEffects(g, last, u, choice, { from: np.n });
  fireTriggers(g, u, 'npAfter', {});
}

// ---- End of turn
function endTurn(g) {
  if (g.over) return;
  fx(g, { t: 'phase', name: 'end' });
  g.inEndTurn = true;
  // Effects that appear during end-of-turn processing (delayed effects, Guts revives from damage over
  // time) have no turn left to act in, so they start counting down from the next turn.
  const existing = new Set(); for (const u of Object.values(g.units)) for (const b of u.buffs) existing.add(b);
  // Servants waiting in reserve are frozen: their effects neither tick, trigger nor count down until they return.
  // (An effect they placed on someone still on the field carries on as normal.)
  const onField = u => g.players[u.side].front.includes(u.uid);
  for (const u of Object.values(g.units)) {
    if (u.dead || !onField(u)) continue;
    // damage over time
    for (const b of u.buffs.filter(x => DOTS.has(x.s))) {
      let v = b.v;
      if (b.s === 'burn') v = Math.round(v * (1 + sumStat(u, 'burnDmg') / 100));
      if (b.s === 'curse' && has(u, 'curseNoDeath')) v = Math.min(v, Math.max(0, u.hp - 1)); // Curse can't finish her off
      const dc = sumStat(u, 'dotCut'); if (dc) v = Math.max(0, v - dc); // Alice: less damage from Poison/Curse/Burn
      if (u.buffs.some(x => x.s === 'dotHeal' && x.kind === b.s)) { // Locusta: Poison heals her instead
        if (!has(u, 'noHeal')) { u.hp = Math.min(maxHp(u), u.hp + v); log(g, `${u.name}'s ${b.s} heals them for ${v} HP.`, 'buff'); fx(g, { t: 'eff', uid: u.uid, key: 'heal', label: `+${v} HP` }); }
        continue;
      }
      u.hp -= v; log(g, `${u.name} takes ${v} ${b.s} damage.`, 'dmg'); fx(g, { t: 'hit', uid: u.uid, dmg: v, aff: 'even', dot: b.s });
    }
    if (u.hp <= 0) killOrGuts(g, u, u);
    if (u.dead) continue;
    const hr = sumStat(u, 'hpRegen'); if (hr && !has(u, 'noHeal')) u.hp = Math.min(maxHp(u), u.hp + hr);
    const nr = sumStat(u, 'npRegen'); if (nr) u.np = Math.min(npCap(u), u.np + nr);
    const sr = sumStat(u, 'starRegen'); if (sr) g.players[u.side].stars = Math.min(CFG.starBankCap, g.players[u.side].stars + sr);
    fireTriggers(g, u, 'turnEnd', {});
    if (u.dead) continue;
    // delayed effects
    for (const b of u.buffs.filter(x => x.s === 'delayed')) {
      b.after -= 1;
      if (b.after <= 0) { u.buffs.splice(u.buffs.indexOf(b), 1); log(g, `${u.name}'s delayed effect triggers.`, 'act'); fx(g, { t: 'eff', uid: u.uid, key: 'delayed', label: 'Delayed effect' }); applyEffects(g, b.eff, u, null, { from: b.from }); }
    }
  }
  // durations and cooldowns
  for (const u of Object.values(g.units)) {
    if (!u.dead && !onField(u)) continue; // reserve: durations and skill cooldowns wait until they're back on the field
    for (const b of u.buffs) if (b.t !== Infinity && existing.has(b)) b.t -= 1;
    for (const b of u.buffs.filter(x => x.s === 'doom' && x.t <= 0)) { // Thirst of Death runs out
      if (u.dead) break;
      const src = U(g, b.srcUid) || u;
      log(g, `${u.name}'s Thirst of Death runs out!`, 'debuff');
      applyEffect(g, { k: 'death', to: 'enemy', p: b.p || 100 }, src, u.uid, { from: 'Thirst of Death', forceTargets: [u] });
      if (!u.dead && u.hp > 0) { u.buffs.push({ s: 'def', v: -50, t: 1, debuff: true, from: 'Thirst of Death' }); log(g, `${u.name}: DEF −50% 1T.`, 'debuff'); }
    }
    u.buffs = u.buffs.filter(b => b.t === Infinity || b.t > 0);
    u.cds = u.cds.map(c => Math.max(0, c - 1));
  }
  for (const P of g.players) P.mcds = P.mcds.map(c => Math.max(0, c - 1));
  for (const u of Object.values(g.units)) {
    if (u.hp > maxHp(u) && !u.dead) u.hp = maxHp(u);
  }
  // replace fallen servants
  const enters = [];
  for (let p = 0; p < 2; p++) {
    const P = g.players[p];
    let changed = false;
    P.front = P.front.map(uid => {
      if (!U(g, uid).dead) return uid;
      const next = P.reserve.find(r => !U(g, r).dead);
      if (!next) return uid;
      P.reserve = P.reserve.filter(r => r !== next);
      changed = true;
      log(g, `P${p + 1}: ${U(g, next).name} enters the field.`, 'act');
      enters.push(next);
      return next;
    });
    if (changed) rebuildBag(g, p);
  }
  for (const uid of enters) fx(g, { t: 'enter', uid });
  if (checkWinner(g)) return;
  if (g.turn >= CFG.turnLimit) { decideByLimit(g); return; }
  g.inEndTurn = false;
  g.initiative = 1 - g.initiative;
  startTurn(g);
}
function aliveCount(g, p) { return g.players[p].order.filter(id => !U(g, id).dead).length; }
// Turn-limit tiebreak: the average HP percentage of the servants still standing (each one's HP over its own max HP),
// so a single huge HP pool doesn't outweigh a team whose servants are proportionally healthier.
function hpPct(g, p) {
  const us = g.players[p].order.map(id => U(g, id)).filter(u => !u.dead);
  if (!us.length) return 0;
  return us.reduce((a, u) => a + Math.max(0, Math.min(1, u.hp / maxHp(u))), 0) / us.length;
}
function checkWinner(g) {
  const a = aliveCount(g, 0), b = aliveCount(g, 1);
  if (a && b) return false;
  g.over = true; g.phase = 'over';
  g.winner = !a && !b ? 'draw' : a ? 0 : 1;
  log(g, g.winner === 'draw' ? 'Both teams fall. Draw.' : `Player ${g.winner + 1} wins!`, 'turn');
  return true;
}
function decideByLimit(g) {
  g.over = true; g.phase = 'over';
  const a = aliveCount(g, 0), b = aliveCount(g, 1);
  if (a !== b) g.winner = a > b ? 0 : 1;
  else { const x = hpPct(g, 0), y = hpPct(g, 1); g.winner = Math.abs(x - y) < 1e-9 ? 'draw' : x > y ? 0 : 1; }
  g.limitBy = a !== b ? 'servants' : 'hp';
  const pct = q => Math.round(hpPct(g, q) * 1000) / 10;
  log(g, `Turn limit reached. ${g.winner === 'draw' ? 'Draw.' : `Player ${g.winner + 1} wins on ${a !== b ? `servants left (${a} vs ${b})` : `average HP remaining (${pct(0)}% vs ${pct(1)}%)`}.`}`, 'turn');
}

const API = {
  CFG, STAT_LABEL, cardWillChange, fullCap, cardSealed, fieldActive, effCls, affLevel, AFF_NAME, CLASS_LIST, FIELDS, fieldName, currentField, fieldTurnsLeft, actBlocker, rawAffinity, snap, sealUsable, sealTargetOk, queueSeal, unqueueSeal, MASTER, masterUsable, queueMaster, unqueueMaster, swappingOut, npCap, npLevel, hasNoNP, allyTargetOk, COLOR, costOf, teamCost, snakeOrder, canPick, EXCLUSIVE, META, starRate, npPerHit, skillRank, skillOption, newBattle, front, maxHp, has, sumStat,
  skillUsable, skillTargetKind, queueSkill, unqueueSkill, activateOrderChange, resolveSkills, availableNPs, cardColor, npColor, canAct,
  setCards, resolveCards, describeBuff, cloneGame, classMult, attrMult, aliveCount, hpPct, mkRng,
};
if (typeof module !== 'undefined') module.exports = API; else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
