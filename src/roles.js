// Draft roles: one main role per servant, read from its kit (Meta Supports are listed in engine.js).
(function (root) {
'use strict';
const ROLES = ['Main DPS', 'Sub DPS', 'Healer', 'Utility Support'];
const OVERRIDE = {"25":"Sub DPS","81":"Sub DPS","88":"Main DPS","134":"Sub DPS","141":"Healer","183":"Healer","195":"Main DPS","227":"Sub DPS","228":"Sub DPS","269":"Sub DPS","272":"Main DPS","339":"Main DPS","382":"Sub DPS","405":"Main DPS","417":"Main DPS","421":"Main DPS"}; // hand corrections
const ALLY = new Set(['allies', 'ally', 'others', 'alliesBut', 'firstOther', 'lowestHpAlly', 'lastOther', 'randomAlly']);
const FOE = new Set(['enemies', 'enemy']);
const OFF = { atk: 1, buster: 1, arts: 1, quick: 1, npDmg: 1, critDmg: .5, special: .6, ignoreDef: .3, dmgPlus: .05, sureHit: 0, starGather: .1, critRate: .1 };
const DEF = { invincible: 18, evade: 15, taunt: 15, def: .8, dmgCut: .05, guts: 12, debuffImmune: 6, maxHp: .02, trueInvincible: 18, specialDef: .4 };
function score(kit) {
  const s = { self: 0, team: 0, heal: 0, debuff: 0, guard: 0 };
  const walk = (es, w0 = 1) => { for (const e of es || []) { if (!e) continue; let w;
    const to = e.to || 'self', v = typeof e.v === 'number' ? e.v : 0;
    w = w0 * (e.cond || e.condAny || e.ifTrait ? .4 : 1) * (e.p ? e.p / 100 : 1);
    const mult = (e.t ? Math.min(e.t, 3) / 3 : 1) * w * (e.n ? Math.min(e.n, 3) / 3 + .3 : 1);
    if (e.k === 'buff' && OFF[e.s] != null && v > 0) { const x = v * OFF[e.s] * mult; if (to === 'self') s.self += x; else if (ALLY.has(to)) { s.team += x * (to === 'allies' || to === 'others' ? 1 : .8); } }
    else if (e.k === 'buff' && DEF[e.s] != null && v > 0) { const x = (DEF[e.s] < 1 ? v * DEF[e.s] : DEF[e.s]) * mult; if (to === 'self') s.self += x * .15; else if (ALLY.has(to)) s.guard += x; }
    else if (e.k === 'np') { if (to === 'self') s.self += v * .7 * w; else if (ALLY.has(to)) s.team += v * (to === 'allies' ? 1.1 : .9) * w; }
    else if (e.k === 'buff' && e.s === 'npRegen' && v > 0) { const x = v * Math.min(e.t || 3, 5) * w; if (to === 'self') s.self += x * .5; else if (ALLY.has(to)) s.team += x; }
    else if (e.k === 'heal' && ALLY.has(to)) s.heal += v * w * (to === 'allies' ? 1.3 : to === 'ally' ? .6 : .8);
    else if (e.k === 'buff' && (e.s === 'hpRegen') && ALLY.has(to)) s.heal += v * Math.min(e.t || 3, 5) * w * (to === 'ally' ? .6 : 1);
    else if (e.k === 'cleanse' && ALLY.has(to)) s.heal += 60 * w;
    else if (e.k === 'buff' && (e.s === 'healRecv' || e.s === 'healGiven') && ALLY.has(to)) s.heal += 20 * w;
    else if (e.k === 'buff' && FOE.has(to) && v < 0) s.debuff += Math.min(Math.abs(v), 50) * mult;
    else if (['control', 'strip', 'drain', 'death'].includes(e.k) && FOE.has(to)) s.debuff += 25 * w;
    else if (e.k === 'stars') s.team += Math.min(v, 30) * .3 * w;
    if (e.opts) for (const o of e.opts) walk(o.e || o, w0 / e.opts.length);
    if (e.e) walk(e.e, w0 * .7);
  } };
  for (const sk of kit.sk) walk(sk.e);
  const np = kit.np || {};
  const dmg = np.tgt && np.tgt !== 'none';
  walk(np.pre, .6); walk(np.ocPre, .6); walk(np.post, .6); walk(np.oc, .4);
  return { ...s, dmg, aoe: np.tgt === 'all' };
}
function classify(kit, id) {
  if (OVERRIDE[id]) return OVERRIDE[id];
  const s = score(kit); const support = s.team + s.guard * 1.2 + s.debuff * .6;
  if (!s.dmg) return s.heal >= 280 && s.heal >= s.team * 1.5 ? 'Healer' : 'Utility Support';
  if (s.heal >= 350 && s.self < 60 && s.heal >= support * 1.5) return 'Healer';
  if (s.self >= 60 && s.self >= support * .8) return 'Main DPS';
  if (support >= Math.max(80, s.self * 1.5)) return 'Utility Support';
  return 'Sub DPS';
}
const API = { ROLES, OVERRIDE, score, classify };
if (typeof module !== 'undefined') module.exports = API; root.Roles = API;
})(typeof window !== 'undefined' ? window : globalThis);
