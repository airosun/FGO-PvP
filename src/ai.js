// CPU opponent: drafts, picks battlefields and a lineup, then plays each turn.
// Skills follow simple rules (buff the attacker, charge whoever is closest to their NP, save defensive skills for danger).
// Cards are chosen by look-ahead: every hand of 3 (and every focus target) is played out on a private copy of the
// battle, and the CPU keeps the one that does the most damage, takes the most kills and builds the most NP.
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const E = isNode ? require('./engine.js') : root.Engine;
const Roles = isNode ? require('./roles.js') : root.Roles;
// Each servant's strength, estimated from thousands of bot games (tools/power.js); 0 is average.
let POWER = {}; try { POWER = isNode ? require('./cpu_power.json') : (root.CPU_POWER || {}); } catch (e) { POWER = {}; }

const rnd = (rng, n) => Math.floor((rng || Math.random)() * n);
const RAR_BASE = { 5: 14, 4: 10, 3: 7, 2: 5, 1: 4, 0: 3 };

// ---------------------------------------------------------------- Draft
const valueCache = new Map();
function servantValue(d, KITS) {
  if (valueCache.has(d.id)) return valueCache.get(d.id);
  const k = KITS[d.id]; if (!k) return 0;
  let v;
  if (POWER[d.id] != null) v = POWER[d.id] * 100;
  else { const s = Roles.score(k); v = RAR_BASE[d.rar] + s.self * 0.06 + s.team * 0.07 + s.guard * 0.12 + s.debuff * 0.04 + (s.aoe ? 2 : 0) - 25; }
  if (E.META.includes(d.id)) v += 4;
  valueCache.set(d.id, v); return v;
}
// Picks that keep the team able to finish legally: two 5★ in the end and under the cost cap.
function fits(team, taken, d, R, pool) {
  const need = Math.max(0, E.CFG.max5 - team.filter(id => R[id].rar === 5).length - (d.rar === 5 ? 1 : 0));
  const left = E.CFG.picks - team.length - 1;
  if (need > left) return false;
  const free = pool.filter(x => !taken.has(x.id) && x.id !== d.id);
  const fives = free.filter(x => x.rar === 5).map(E.costOf).sort((a, b) => a - b).slice(0, need);
  if (fives.length < need) return false;
  const rest = free.filter(x => x.rar !== 5).map(E.costOf).sort((a, b) => a - b).slice(0, left - need);
  return E.teamCost(team, R) + E.costOf(d) + [...fives, ...rest].reduce((a, b) => a + b, 0) <= E.CFG.costCap;
}
function draftPick(team, taken, R, KITS, rng) {
  const pool = Object.values(R).filter(d => !d.hidden && KITS[d.id]);
  let opts = pool.filter(d => E.canPick(team, d.id, taken, R).ok && fits(team, taken, d, R, pool));
  if (!opts.length) opts = pool.filter(d => E.canPick(team, d.id, taken, R).ok);
  if (!opts.length) return null;
  const roles = team.map(id => Roles.classify(KITS[id], id));
  const has = r => roles.filter(x => x === r).length;
  const left = E.CFG.picks - team.length;
  const budget = E.CFG.costCap - E.teamCost(team, R);
  const scored = opts.map(d => {
    const role = Roles.classify(KITS[d.id], d.id);
    let v = servantValue(d, KITS);
    if (role === 'Main DPS' && has('Main DPS') < 2) v += 3;
    if ((role === 'Utility Support' || role === 'Healer') && has('Utility Support') + has('Healer') < 1) v += 3;
    return { d, v: v + ((rng || Math.random)() * 4) };
  }).sort((a, b) => b.v - a.v);
  return scored[0].d;
}
// Battlefields: the ones this team's kits care about, then random.
function pickFields(team, KITS, rng) {
  const want = new Map();
  for (const id of team) JSON.stringify(KITS[id], (key, v) => { if (key === 'field' && Array.isArray(v)) v.forEach(f => want.set(f, (want.get(f) || 0) + 1)); return v; });
  const out = [...want.entries()].filter(([f]) => E.FIELDS.includes(f)).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3);
  const rest = E.FIELDS.filter(f => !out.includes(f));
  while (out.length < 3) out.push(rest.splice(rnd(rng, rest.length), 1)[0]);
  return out;
}
// Lineup: best two damage dealers and the best support start; the strongest of the rest come in first.
function lineup(team, R, KITS) {
  const info = team.map(id => ({ id, role: Roles.classify(KITS[id], id), v: servantValue(R[id], KITS) }));
  const dps = info.filter(x => x.role === 'Main DPS' || x.role === 'Sub DPS').sort((a, b) => b.v - a.v);
  const sup = info.filter(x => x.role === 'Utility Support' || x.role === 'Healer').sort((a, b) => (E.META.includes(b.id) - E.META.includes(a.id)) || b.v - a.v);
  const start = [];
  if (sup[0]) start.push(sup[0]);
  for (const x of dps) if (start.length < 3) start.push(x);
  for (const x of info.sort((a, b) => b.v - a.v)) if (start.length < 3 && !start.includes(x)) start.push(x);
  const rest = info.filter(x => !start.includes(x)).sort((a, b) => b.v - a.v);
  // put the support in the middle of the starters, attackers on the outside
  return [...start, ...rest].map(x => x.id);
}

// ---------------------------------------------------------------- Battle helpers
const alive = (g, p) => E.front(g, p).filter(u => !u.dead);
const hpFrac = u => Math.max(0, u.hp) / E.maxHp(u);
const isDps = u => { const r = Roles.classify(u.kit, u.sid); return r === 'Main DPS' || r === 'Sub DPS'; };
function attackPower(u) { return u.d.atk * (1 + E.sumStat(u, 'atk') / 100) * (isDps(u) ? 1.25 : 1) * (u.kit.np && u.kit.np.tgt && u.kit.np.tgt !== 'none' ? 1 : 0.7); }
function threat(u) { return (u.np >= 100 ? 2 : 1 + u.np / 150) * u.d.atk / 100; }
function walkEffects(list, f) { if (!Array.isArray(list)) return; for (const e of list) { if (!e) continue; f(e); if (e.eff) walkEffects(e.eff, f); } }
function skillProfile(sk) {
  const p = { off: 0, def: 0, heal: 0, charge: 0, enemy: 0, ctrl: 0, selfKo: false, selfHarm: false };
  walkEffects(sk.e, e => {
    const to = e.to || 'self'; const foe = to === 'enemy' || to === 'enemies';
    if (e.k === 'koSelf') p.selfKo = true;
    if (e.k === 'selfDmg' || e.k === 'hpLoss' || (e.k === 'control' && !foe)) p.selfHarm = true;
    if (foe) { p.enemy++; if (e.k === 'control') p.ctrl++; return; }
    if (e.k === 'np') p.charge += e.v || 0;
    else if (e.k === 'heal' || (e.k === 'buff' && e.s === 'hpRegen')) p.heal++;
    else if (e.k === 'cleanse') p.heal++;
    else if (e.k === 'buff' && ['invincible', 'evade', 'taunt', 'dmgCut', 'def', 'guts', 'specialDef', 'trueInvincible'].includes(e.s)) p.def++;
    else if (e.k === 'guts') p.def++;
    else if (e.k === 'buff') p.off++;
  });
  return p;
}

// ---------------------------------------------------------------- Skills
function planSkills(g, p, rng) {
  const c = E.cloneGame(g, 1);
  const P = c.players[p]; const foes = alive(c, 1 - p); const mine = alive(c, p);
  if (!foes.length || !mine.length) return { skillQueue: [], masterQueue: [], sealQueue: null };
  const danger = foes.some(f => f.np >= 100) || c.turn >= 3;
  const focus = foes.slice().sort((a, b) => (hpFrac(a) - hpFrac(b)) || (b.np - a.np))[0];
  const scary = foes.slice().sort((a, b) => threat(b) - threat(a))[0];
  const carry = mine.slice().sort((a, b) => attackPower(b) - attackPower(a))[0];
  // who to charge: whoever an NP charge would push over 100, else the carry
  const chargeTarget = amt => mine.filter(u => !E.hasNoNP(u) && u.np < 100).sort((a, b) => ((b.np + amt >= 100) - (a.np + amt >= 100)) || (attackPower(b) - attackPower(a)))[0] || carry;
  const queued = [];
  for (const u of mine) {
    if (!E.canAct(u)) continue;
    u.kit.sk.forEach((sk, i) => {
      if (!E.skillUsable(c, u, i).ok) return;
      const pr = skillProfile(sk);
      if (pr.selfKo) return; // sacrifice skills are left alone
      if (pr.selfHarm && hpFrac(u) < 0.5) return;
      const onlyDef = pr.def && !pr.off && !pr.charge && !pr.enemy;
      if (onlyDef && !(danger || hpFrac(u) < 0.7) && (rng || Math.random)() < 0.6) return;
      const onlyHeal = pr.heal && !pr.off && !pr.charge && !pr.def && !pr.enemy;
      if (onlyHeal && !mine.some(a => hpFrac(a) < 0.75)) return;
      const kind = E.skillTargetKind(u, i);
      let target = null;
      if (kind === 'ally') {
        const ok = mine.filter(a => E.allyTargetOk(c, { uid: u.uid, i, kind: 'ally' }, a.uid));
        const pool = ok.length ? ok : mine;
        if (pr.heal && !pr.off) target = pool.slice().sort((a, b) => hpFrac(a) - hpFrac(b))[0].uid;
        else if (pr.charge) target = (pool.includes(chargeTarget(pr.charge)) ? chargeTarget(pr.charge) : pool[0]).uid;
        else if (pr.def && !pr.off) target = pool.slice().sort((a, b) => hpFrac(a) - hpFrac(b))[0].uid;
        else target = (pool.includes(carry) ? carry : pool.slice().sort((a, b) => attackPower(b) - attackPower(a))[0]).uid;
      } else if (kind === 'enemy') target = (pr.ctrl ? scary : focus).uid;
      const opt = E.skillOption(u, i); let ov;
      if (opt) ov = opt.kind === 'npType' ? (opt.def || opt.options[0]) : (opt.options.find(o => !o.stars || P.stars >= o.stars) || opt.options[0]).v;
      const r = E.queueSkill(c, p, u.uid, i, target, ov);
      if (r.ok) queued.push(u.uid);
    });
  }
  // Master skills
  const ms = i => E.masterUsable(c, p, i).ok;
  const hurt = mine.slice().sort((a, b) => hpFrac(a) - hpFrac(b))[0];
  if (ms(0) && hurt && E.maxHp(hurt) - hurt.hp > 220) E.queueMaster(c, p, 0, hurt.uid);
  const npNow = mine.filter(u => u.np >= 100 && E.canAct(u)).sort((a, b) => attackPower(b) - attackPower(a))[0];
  if (ms(1) && (npNow || c.turn >= 4)) E.queueMaster(c, p, 1, (npNow || carry).uid);
  if (ms(2)) {
    const weak = mine.filter(u => hpFrac(u) < 0.2 && !E.has(u, 'noSwap')).sort((a, b) => hpFrac(a) - hpFrac(b))[0];
    const fresh = P.reserve.map(id => c.units[id]).filter(u => !u.dead && hpFrac(u) > 0.7 && !E.has(u, 'noSwap')).sort((a, b) => attackPower(b) - attackPower(a))[0];
    if (weak && fresh) E.queueMaster(c, p, 2, weak.uid, fresh.uid);
  }
  // Command Seal: push the carry into an NP when it's close, or save a carry about to fall
  if (E.sealUsable(c, p).ok) {
    const almost = mine.filter(u => !E.hasNoNP(u) && u.np < 100 && u.np >= 30 && isDps(u)).sort((a, b) => attackPower(b) - attackPower(a))[0];
    if (almost && c.turn >= 3 && E.sealTargetOk(c, p, 'np', almost.uid)) E.queueSeal(c, p, 'np', almost.uid);
    else if (carry && hpFrac(carry) < 0.25 && E.sealTargetOk(c, p, 'heal', carry.uid)) E.queueSeal(c, p, 'heal', carry.uid);
  }
  return JSON.parse(JSON.stringify({ skillQueue: P.skillQueue, masterQueue: P.masterQueue, sealQueue: P.sealQueue }));
}

// ---------------------------------------------------------------- Cards (look-ahead)
function evaluate(before, after, p) {
  let s = 0;
  for (const id of before.players[1 - p].order) {
    const a = before.units[id], b = after.units[id]; if (a.dead) continue;
    const mh = E.maxHp(a);
    const dealt = Math.max(0, a.hp - Math.max(0, b.hp)) / mh;
    s += Math.min(1, dealt) * (1 + threat(a) * 0.3);
    if (b.dead) s += 1.4 + threat(a) * 0.4;
    s += (a.np - b.np) / 300; // drained enemy gauge
  }
  for (const id of before.players[p].order) {
    const a = before.units[id], b = after.units[id]; if (a.dead) continue;
    if (b.dead) s -= 1.5;
    s += (Math.min(E.npCap(b), b.np) - a.np) / 260;      // NP built (firing an NP spends it; the damage has to pay for it)
    s -= Math.max(0, a.hp - b.hp) / E.maxHp(a) * 0.6;
  }
  s += (after.players[p].stars - before.players[p].stars) / 120;
  return s;
}
function planCards(g, p) {
  const P = g.players[p];
  const pool = E.availableNPs(g, p).concat(P.hand);
  const foes = alive(g, 1 - p);
  if (!pool.length || !foes.length) return [];
  const n = Math.min(3, pool.length);
  const seqs = [];
  const rec = (pick, used) => { if (pick.length === n) { seqs.push(pick.slice()); return; } for (let i = 0; i < pool.length; i++) if (!used.has(i)) { used.add(i); pick.push(pool[i]); rec(pick, used); pick.pop(); used.delete(i); } };
  rec([], new Set());
  // cap the work on huge hands: keep the most promising sequences by a quick heuristic
  let cands = seqs;
  if (cands.length > 240) {
    const quick = s => s.reduce((a, c, k) => a + (c.type === 'NP' ? 6 : { B: 1.5, A: 1, Q: 0.8 }[E.cardColor(g, c)] || 1) + (k && c.uid === s[0].uid ? 0.6 : 0), 0) + (new Set(s.map(c => E.cardColor(g, c))).size === 1 ? 1 : 0);
    cands = cands.sort((a, b) => quick(b) - quick(a)).slice(0, 240);
  }
  const targets = foes.map(f => f.uid);
  let best = null, bestScore = -Infinity;
  const seed = (g.turn * 7919 + p * 104729) >>> 0;
  for (const s of cands) for (const t of targets) {
    const c = E.cloneGame(g, seed);
    E.setCards(c, p, s.map(card => ({ ...card, target: t })));
    E.setCards(c, 1 - p, []);
    try { E.resolveCards(c); } catch (e) { continue; }
    const sc = evaluate(g, c, p);
    if (sc > bestScore) { bestScore = sc; best = s.map(card => ({ id: card.id, target: t })); }
  }
  return best || pool.slice(0, n).map(card => ({ id: card.id, target: targets[0] }));
}

const API = { draftPick, pickFields, lineup, planSkills, planCards, servantValue };
if (isNode) module.exports = API; else root.CPU = API;
})(typeof window !== 'undefined' ? window : globalThis);
