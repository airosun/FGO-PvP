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
const CARD_STAT = { B: 'buster', A: 'arts', Q: 'quick' };
const cardWeightCache = new Map();
const supportBuffCache = new WeakMap();
function cardWeights(d) {
  if (d.id != null && cardWeightCache.has(d.id)) return cardWeightCache.get(d.id);
  const weights = { B: 0, A: 0, Q: 0 };
  for (const color of d.deck || '') if (weights[color] != null) weights[color]++;
  const np = { Buster: 'B', Arts: 'A', Quick: 'Q' }[d.np];
  if (np) weights[np] += 2;
  if (d.id != null) cardWeightCache.set(d.id, weights);
  return weights;
}
function supportCardBuffs(kit) {
  if (supportBuffCache.has(kit)) return supportBuffCache.get(kit);
  const buffs = { B: 0, A: 0, Q: 0 };
  const visit = effects => { for (const e of effects || []) {
    if (!e) continue;
    const color = Object.keys(CARD_STAT).find(c => CARD_STAT[c] === e.s);
    if (e.k === 'buff' && color && ['ally', 'allies', 'others'].includes(e.to)) {
      buffs[color] += Math.max(0, e.v || 0) * (e.p == null ? 1 : e.p / 100) * Math.min(e.t || 1, 3) / 3;
    }
    visit(e.e);
  } };
  for (const sk of kit.sk || []) visit(sk.e);
  supportBuffCache.set(kit, buffs);
  return buffs;
}
function cardSynergy(supportId, dpsId, R, KITS) {
  const buffs = supportCardBuffs(KITS[supportId]);
  const weights = cardWeights(R[dpsId]);
  const total = weights.B + weights.A + weights.Q || 1;
  return (buffs.B * weights.B + buffs.A * weights.A + buffs.Q * weights.Q) / total * 0.42;
}
// Picks that keep the team able to finish legally: two 5★ in the end and under the cost cap.
// (The cheapest way to fill the remaining slots is read off one cost-sorted list, so this stays fast.)
const SORTED = new WeakMap();
function byCost(pool) { let s = SORTED.get(pool); if (!s) { s = pool.slice().sort((a, b) => E.costOf(a) - E.costOf(b)); SORTED.set(pool, s); } return s; }
function fits(team, taken, d, R, pool) {
  const need = Math.max(0, E.CFG.max5 - team.filter(id => R[id].rar === 5).length - (d.rar === 5 ? 1 : 0));
  const left = E.CFG.picks - team.length - 1;
  if (need > left) return false;
  let cost = E.teamCost(team, R) + E.costOf(d), five = 0, rest = 0;
  for (const x of byCost(pool)) {
    if (five >= need && rest >= left - need) break;
    if (taken.has(x.id) || x.id === d.id) continue;
    if (x.rar === 5 && five < need) { cost += E.costOf(x); five++; } else if (x.rar !== 5 && rest < left - need) { cost += E.costOf(x); rest++; }
  }
  return five >= need && cost <= E.CFG.costCap;
}
const POOLS = new WeakMap();
const isDpsRole = r => r === 'Main DPS' || r === 'Sub DPS';
const isSupRole = r => r === 'Utility Support' || r === 'Healer';
// Weighted random choice; weights need not sum to 1.
function pickWeighted(list, w, rng) {
  const ws = list.map(w); let roll = (rng || Math.random)() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { roll -= ws[i]; if (roll <= 0) return list[i]; }
  return list[list.length - 1];
}
// Draft: mostly random, so CPU teams vary game to game, with a light plan: one main attacker, a support whose
// skills buff that attacker's main card type, a second damage dealer, and the rest from whatever is left.
// Servant strength only nudges the odds (and the weakest picks are skipped).
function draftPick(team, taken, R, KITS, rng) {
  let pool = POOLS.get(R); if (!pool) { pool = Object.values(R).filter(d => !d.hidden && KITS[d.id]); POOLS.set(R, pool); }
  let opts = pool.filter(d => !taken.has(d.id) && E.canPick(team, d.id, taken, R).ok && fits(team, taken, d, R, pool));
  if (!opts.length) opts = pool.filter(d => !taken.has(d.id) && E.canPick(team, d.id, taken, R).ok);
  if (!opts.length) return null;
  const role = id => Roles.classify(KITS[id], id);
  const power = d => (POWER[d.id] != null ? POWER[d.id] : 0);
  const good = opts.filter(d => power(d) > -0.12); if (good.length >= 8) opts = good; // skip the weakest
  const roles = team.map(role);
  const mainDps = team.filter(id => role(id) === 'Main DPS').sort((a, b) => power(R[b]) - power(R[a]))[0] ?? team.find(id => isDpsRole(role(id)));
  const nDps = roles.filter(isDpsRole).length, nSup = roles.filter(isSupRole).length, left = E.CFG.picks - team.length;
  // what this pick should be
  let want = null;
  if (mainDps == null) want = 'main';
  else if (!nSup) want = 'support';
  else if (nDps < 2) want = 'dps';
  else if (left > 1 && (rng || Math.random)() < 0.35) want = (rng || Math.random)() < 0.5 ? 'dps' : 'support';
  const nudge = d => Math.max(0.15, 1 + power(d) * 3);
  if (want === 'main') {
    const c = opts.filter(d => role(d.id) === 'Main DPS');
    if (c.length) return pickWeighted(c, nudge, rng);
  }
  if (want === 'support') {
    const c = opts.filter(d => isSupRole(role(d.id)));
    if (c.length) {
      if (mainDps != null) {
        // supports that buff the main attacker's card type, best matches most likely
        const syn = c.map(d => ({ d, s: cardSynergy(d.id, mainDps, R, KITS) })).filter(x => x.s > 0);
        if (syn.length) return pickWeighted(syn, x => Math.pow(1 + x.s, 2) * nudge(x.d), rng).d;
      }
      return pickWeighted(c, nudge, rng);
    }
  }
  if (want === 'dps') {
    const c = opts.filter(d => isDpsRole(role(d.id)));
    if (c.length) return pickWeighted(c, d => nudge(d) * (mainDps != null && cardWeights(R[mainDps]) && supportsFit(team, d.id, R, KITS) ? 1.5 : 1), rng);
  }
  return pickWeighted(opts, nudge, rng);
}
// A second attacker fits better when the team's supports already buff their card type.
function supportsFit(team, dpsId, R, KITS) { return team.some(id => isSupRole(Roles.classify(KITS[id], id)) && cardSynergy(id, dpsId, R, KITS) > 2); }
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
function enemyPriority(u) {
  return threat(u) * 0.45 + (1 - hpFrac(u)) * 0.9 + (isDps(u) ? 0.25 : 0);
}
function allySkillValue(skill, target) {
  let value = attackPower(target) * 0.002;
  walkEffects(skill.e, e => {
    if (e.to !== 'ally') return;
    if (e.k === 'buff' && CARD_STAT && Object.values(CARD_STAT).includes(e.s)) {
      const color = Object.keys(CARD_STAT).find(c => CARD_STAT[c] === e.s);
      const weights = cardWeights(target.d), total = weights.B + weights.A + weights.Q || 1;
      value += Math.max(0, e.v || 0) * weights[color] / total * 0.6;
    } else if (e.k === 'buff' && ['atk', 'npDmg', 'critDmg', 'special'].includes(e.s)) {
      value += Math.max(0, e.v || 0) * (isDps(target) ? 0.2 : 0.06);
    } else if (e.k === 'np' && !E.hasNoNP(target)) {
      value += (e.v || 0) * (target.np + (e.v || 0) >= 100 ? 0.75 : 0.16) * (isDps(target) ? 1.2 : 1);
    } else if (e.k === 'heal') {
      value += Math.min(Math.max(0, E.maxHp(target) - target.hp), e.v || 0) * 0.012;
    } else if (e.k === 'guts') value += hpFrac(target) < 0.45 ? 8 : 1;
  });
  return value;
}
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
  const focus = foes.slice().sort((a, b) => enemyPriority(b) - enemyPriority(a))[0];
  const scary = foes.slice().sort((a, b) => (threat(b) + (isDps(b) ? 0.2 : 0)) - (threat(a) + (isDps(a) ? 0.2 : 0)))[0];
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
        target = pool.slice().sort((a, b) => allySkillValue(sk, b) - allySkillValue(sk, a) || attackPower(b) - attackPower(a))[0].uid;
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
  if (P.mc === 'atlas') {
    // Dust of Osiris: shield whoever is in the most danger when an enemy NP is ready
    const foeNp = foes.some(f => f.np >= 100 && E.canAct(f));
    const fragile = mine.filter(u => !E.has(u, 'invincible')).sort((a, b) => hpFrac(a) - hpFrac(b) || attackPower(b) - attackPower(a))[0];
    if (ms(0) && fragile && (foeNp || hpFrac(fragile) < 0.3)) E.queueMaster(c, p, 0, (foeNp && carry && hpFrac(carry) < 0.6 ? carry : fragile).uid);
    // Rain of Isis: clear a servant held down by debuffs (stun, charm, seals, DoTs)
    const debuffed = mine.map(u => ({ u, n: u.buffs.filter(b => b.debuff).length + (E.canAct(u) ? 0 : 3) })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n)[0];
    if (ms(1) && debuffed) E.queueMaster(c, p, 1, debuffed.u.uid);
    // Eye of Medjed: refresh the servant with the most cooldown waiting
    const cds = mine.map(u => ({ u, w: u.cds.reduce((a, b) => a + Math.min(2, b), 0) * (isDps(u) ? 1.3 : 1) })).sort((a, b) => b.w - a.w)[0];
    if (ms(2) && cds && cds.w >= 3) E.queueMaster(c, p, 2, cds.u.uid);
  } else {
  if (ms(0) && hurt && E.maxHp(hurt) - hurt.hp > 220) E.queueMaster(c, p, 0, hurt.uid);
  const npNow = mine.filter(u => u.np >= 100 && E.canAct(u)).sort((a, b) => attackPower(b) - attackPower(a))[0];
  if (ms(1) && (npNow || c.turn >= 4)) E.queueMaster(c, p, 1, (npNow || carry).uid);
  if (ms(2)) {
    const weak = mine.filter(u => hpFrac(u) < 0.2 && !E.has(u, 'noSwap')).sort((a, b) => hpFrac(a) - hpFrac(b))[0];
    const fresh = P.reserve.map(id => c.units[id]).filter(u => !u.dead && hpFrac(u) > 0.7 && !E.has(u, 'noSwap')).sort((a, b) => attackPower(b) - attackPower(a))[0];
    if (weak && fresh) E.queueMaster(c, p, 2, weak.uid, fresh.uid);
  }
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
  // A ready NP always goes off: only chains that use every ready NP (up to 3) are considered
  const ready = E.availableNPs(g, p).filter(c => E.canAct(g.units[c.uid])).slice(0, n);
  if (ready.length) { const must = seqs.filter(s => ready.every(r => s.some(c => c.id === r.id))); if (must.length) seqs.splice(0, seqs.length, ...must); }
  // cap the work on huge hands: keep the most promising sequences by a quick heuristic
  let cands = seqs;
  if (cands.length > 160) {
    const quick = s => s.reduce((a, c, k) => a + (c.type === 'NP' ? 6 : { B: 1.5, A: 1, Q: 0.8 }[E.cardColor(g, c)] || 1) + (k && c.uid === s[0].uid ? 0.6 : 0), 0) + (new Set(s.map(c => E.cardColor(g, c))).size === 1 ? 1 : 0);
    cands = cands.sort((a, b) => quick(b) - quick(a)).slice(0, 160);
  }
  const targets = foes.map(f => f.uid);
  const targetPlans = [];
  for (const target of targets) targetPlans.push([target, target, target]);
  for (let offset = 0; offset < targets.length; offset++) {
    targetPlans.push(Array.from({ length: n }, (_, i) => targets[(offset + i) % targets.length]));
  }
  let best = null, bestScore = -Infinity;
  const seed = (g.turn * 7919 + p * 104729) >>> 0;
  for (const s of cands) for (const plan of targetPlans) {
    const c = E.cloneGame(g, seed);
    E.setCards(c, p, s.map((card, i) => ({ ...card, target: plan[i] || plan[0] })));
    E.setCards(c, 1 - p, []);
    try { E.resolveCards(c); } catch (e) { continue; }
    const sc = evaluate(g, c, p);
    if (sc > bestScore) { bestScore = sc; best = s.map((card, i) => ({ id: card.id, target: plan[i] || plan[0] })); }
  }
  return best || pool.slice(0, n).map(card => ({ id: card.id, target: targets[0] }));
}

// The CPU wears either uniform, about half the time each.
function pickMystic(rng) { return (rng || Math.random)() < 0.5 ? 'atlas' : 'chaldea'; }
const API = { pickMystic, draftPick, pickFields, lineup, planSkills, planCards, servantValue };
if (isNode) module.exports = API; else root.CPU = API;
})(typeof window !== 'undefined' ? window : globalThis);
