// Plain-language descriptions of skills, NPs and passives, built from the same kit data the engine runs.
// Every number shown is the value used in this game.
(function (root) {
const PCT = {
  atk: 'ATK', def: 'DEF', buster: 'Buster card power', arts: 'Arts card power', quick: 'Quick card power', extra: 'Extra Attack power',
  npDmg: 'NP damage', critDmg: 'Critical damage', critRate: 'Critical chance', starDrop: 'Star generation', starGather: 'Star absorption',
  npGain: 'NP gain', ndGain: 'NP gain when hit', debuffRes: 'Debuff resistance', debuffSuccess: 'Debuff success rate',
  buffSuccess: 'Buff success rate', buffRecv: 'Success rate of buffs received', healRecv: 'Healing received', healGiven: 'Healing given',
  mentalRes: 'Mental debuff resistance', mentalSuccess: 'Mental debuff success rate', atkDebuffRes: 'ATK-down resistance',
  deathRes: 'Death resistance', deathSuccess: 'Death success rate', stripRes: 'Buff-removal resistance', busterRes: 'Buster resistance',
  artsRes: 'Arts resistance', quickRes: 'Quick resistance', burnDmg: 'Burn damage', critDmgTaken: 'Critical damage taken',
  critRes: 'Chance of being critically hit',
};
const FLAG = {
  evade: 'Evade', invincible: 'Invincible', ignoreInv: 'Ignore Invincible', sureHit: 'Sure Hit', ignoreDef: 'Ignore DEF',
  taunt: 'Taunt', debuffImmune: 'Debuff immunity', buffBlock: 'Buff Block', deathImmune: 'Immune to Death',
  allBuster: 'All Command Cards become Buster', trueInvincible: 'Anti-Enforcement DEF (blocks the next hit completely, even through Ignore Invincible)', curseNoDeath: "Curse damage can't defeat it", npToArts: 'NP card becomes Arts', noCards: "Can't be dealt Command Cards",
};
const CTRL = { stun: 'Stun', charm: 'Charm', bind: 'Bind', petrify: 'Petrify', sleep: 'Sleep', pigify: 'Pigify', skillSeal: 'Skill Seal', npSeal: 'NP Seal', terror: 'Terror' };
const DOT = { burn: 'Burn', poison: 'Poison', curse: 'Curse' };
const WHO = { self: 'self', ally: 'one ally', allies: 'all allies', others: 'other allies', enemy: 'one enemy', enemies: 'all enemies', firstOther: 'the first other ally on your field', lastOther: 'the last other ally on your field', lowestHpAlly: 'the ally with the lowest HP %', randomAlly: 'one random ally' };
const CAT = { buff: 'buffs', debuff: 'debuffs', dmgUp: 'damage-boosting buffs', defUp: 'defensive buffs', atkUp: 'ATK buffs', cardUp: 'card buffs', critUp: 'critical buffs',
  sureHit: 'Sure Hit', mental: 'mental debuffs', immobilize: 'immobilizing debuffs', burn: 'Burn', poison: 'Poison', curse: 'Curse', charm: 'Charm', stun: 'Stun', evade: 'Evade', invincible: 'Invincible', taunt: 'Taunt', guts: 'Guts' };
const FIELDN = { Shore: 'Waterside' };
const STATUSW = { invincible: 'Invincible', evade: 'Evade', guts: 'Guts', burn: 'Burn', poison: 'Poison', curse: 'Curse', charm: 'Charm', stun: 'Stun', taunt: 'Taunt' };
const STATUSADJ = { evade: 'Evading', invincible: 'Invincible', burn: 'Burned', poison: 'Poisoned', curse: 'Cursed', charm: 'Charmed', stun: 'Stunned', guts: 'Guts' };
const MARKNAME = { 2386: 'all Growth stacks (and their NP resistance)', 2872: 'all Manuscript Complete stacks' };

const num = v => { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
const sign = v => (v >= 0 ? '+' : '−') + num(Math.abs(v));
const turns = t => t == null || t >= 99 || t === Infinity ? '' : `${t} turn${t === 1 ? '' : 's'}`;
const uses = n => n == null ? '' : `${n} use${n === 1 ? '' : 's'}`;

// "for 3 turns, 1 use" etc.
function span(e) {
  const bits = [];
  const tt = turns(e.t);
  if (tt) bits.push(e.carry ? `${tt}, lasts into the next turn` : tt);
  const u = uses(e.n); if (u) bits.push(u);
  return bits.join(', ');
}
// Conditions on who it works on, or when.
function conds(e) {
  const c = [];
  if (e.cond === 'Wrath Of The Enshrined Deity') c.push("only allies with Enshrined Deity's Anger");
  else if (e.cond) c.push(/ On Field$/.test(e.cond) ? `only if ${e.cond.replace(/ On Field$/, '')} is on your field` : `${e.cond} only`);
  if (e.condAny) c.push(`${e.condAny.join(' or ')} only`);
  if (e.condNot) c.push(...e.condNot.map(x => /^Immune to /i.test(x) ? `no effect on servants immune to ${x.replace(/^Immune to /i, '')}` : `no effect on ${x} servants`));
  if (e.align) c.push(`${e.align} only`);
  if (e.alignNone) c.push(`not ${e.alignNone.join(' or ')}`);
  if (e.attr) c.push(`${e.attr} attribute only`);
  if (e.field) c.push(`only on ${e.field.map(f => FIELDN[f] || f).join(' or ')}`);
  if (e.onField) c.push(`only while the field is ${e.onField.map(f => FIELDN[f] || f).join(' or ')}`);
  if (e.ifAllyAttr) c.push(`if an ally is ${e.ifAllyAttr} attribute`);
  if (e.ifAlliesFullHp) c.push('only if every ally on the field is at full HP');
  if (e.minAffection != null) c.push(`only at Affection Lv ${e.minAffection}+`);
  if (e.ifAllyTrait) c.push(`only if another ${e.ifAllyTrait} ally is on your field`);
  if (e.minStars) c.push(`only with ${e.minStars}+ stars`);
  if (e.ifHungry) c.push('only while she is less than half full');
  if (e.ifRemoved) c.push('only if the removal just before it removed something');
  if (e.whileMark === 2999) c.push('only while an Illya is on the field');
  else if (e.whileMark != null) c.push(`only while it has ${({ 2951: 'Mark of Sin', 2873: 'My Fair Soldier', 2885: 'Magic Bullets', 2887: 'no Robin counters left', 3005: 'a debuff', 3004: 'a buff', 3121: 'the Moon stance' })[e.whileMark] || 'that status'}`);
  if (e.hpAbove != null) c.push(e.hpAbove >= 100 ? 'only while at full HP' : `only while HP is ${e.hpAbove}% or more`);
  if (e.ifAllyRarityMax != null) c.push(`only if another ally on the field is ${e.ifAllyRarityMax}★ or lower`);
  if (e.exceptIds) c.push('not on Artoria Caster');
  if (e.condStatus) c.push(`only on ${e.condStatus.map(x => STATUSADJ[x] || x).join(' or ')} targets`);
  if (e.whileHas) c.push(`only while ${STATUSW[e.whileHas] || e.whileHas} is active`);
  if (e.stackLimit) c.push(`stacks up to ${e.stackLimit.n}×`);
  if (e.p != null && e.p < 100) c.push(`${num(e.p)}% chance`);
  return c;
}
// value with overcharge range, e.g. "+20% (up to +40% at max overcharge)"
function ocRange(e, v, key, fmt) { return e[key] != null && e[key] !== v ? ` (${fmt(e[key])} at 500% overcharge)` : ''; }

function buffWhat(e) {
  const s = e.s, v = e.v;
  if (PCT[s]) {
    if (e.hpBelow != null && e.vLow != null) return `${PCT[s]} ${sign(v)}% at ${e.hpBelow}% HP, rising to ${sign(e.vLow)}% as HP falls`;
    if (e.hpBelow != null) return `${PCT[s]} ${sign(v)}% while HP is ${e.hpBelow}% or lower`;
    if (e.perMark) return `${PCT[s]} +${num(e.perMark.add)}% per ${e.perMark.mark === 2386 || !e.perMark.name ? 'Growth' : String(e.perMark.name).replace(/^Buff /, '')} stack${e.perMark.max ? ` (up to ${e.perMark.max})` : ''}` + (v ? ` (plus ${sign(v)}%)` : '');
    if (e.perField) return `${PCT[s]} +${num(e.perField.add)}% for each ${e.perField.trait === 'Servant' ? 'enemy' : e.perField.trait} on the field${e.perField.who === 'enemies' ? '' : ' (both sides)'}` + (v ? ` (plus ${sign(v)}%)` : '');
    if (e.label === 'Bewitchment' || e.label === 'Electric Erosion') return `${e.label} (${PCT[s]} ${sign(v)}%)`;
    const vsTxt = e.vs ? ` against ${e.vs.replace(/^Man Attribute$/, 'Man-attribute')} enemies` : e.statusAny ? ` against ${e.statusAny.map(x => STATUSADJ[x] || x).join(' or ')} enemies` : '';
    if (e.label === "Enshrined Deity's Anger") return `Enshrined Deity's Anger (${PCT[s]} ${sign(v)}%)`;
    return `${PCT[s]} ${sign(v)}%${vsTxt}` + ocRange(e, v, 'v5', x => sign(x) + '%');
  }
  if (FLAG[s]) return FLAG[s];
  switch (s) {
    case 'dmgPlus': return `Deals ${sign(v)} damage per attack` + ocRange(e, v, 'v5', sign);
    case 'ignoreDmgCut': return 'Ignores the target\'s Damage Cut';
    case 'evadeLethal': return 'Evades a hit that would defeat it';
    case 'pierceTrueInv': return 'Pierces Anti-Enforcement DEF (not Evade)';
    case 'absorbDmg': return 'Damage taken is absorbed as HP instead';
    case 'exAoe': return 'Extra Attack hits all enemies (half damage each when there is more than one)';
    case 'dotCut': return `Poison, Curse and Burn damage −${num(v)} per turn`;
    case 'plotArmor': return 'Plot Armor: drawbacks of its own skills and NP don\'t apply';
    case 'knighthood': return `Knighthood Conferment: when another ally's Guts triggers, it revives with +${num(e.gutsHp)} HP and gains ATK +${num(e.atkUp)}% for 3 turns`;
    case 'guardianParry': return "Giant's Protection: blocks the next hit on any ally on your field (Ignore Invincible gets through)";
    case 'doom': return 'Thirst of Death: when it runs out, a death roll; if it fails, DEF −50% for 1 turn';
    case 'npEcho': return `When an ally ${e.cls && e.cls.length ? e.cls.join('/') + ' ' : ''}uses their NP, this servant gains ${num(v)}% of the NP they spent`;
    case 'fullCap': return `Fullness gauge cap +${num(v)}`;
    case 'dotHeal': return `${DOT[e.kind] || e.kind} heals instead of dealing damage`;
    case 'cardType': return `All Command Cards become ${({ A: 'Arts', B: 'Buster', Q: 'Quick' })[e.color]} (not the Extra Attack)`;
    case 'cardSeal': return `${(e.cards || []).map(c => ({ A: 'Arts', B: 'Buster', Q: 'Quick' })[c]).join('/')} Seal: those cards don't activate`;
    case 'npSingle': return `NP hits one enemy instead of all${e.dmg ? `, at ${num(e.dmg)}% damage` : ''}`;
    case 'negateField': return `The ${(e.fields || []).map(f => FIELDN[f] || f).join('/')} battlefield stops counting for everyone (effects that need it don't work)`;
    case 'convertInv': return 'Any Invincible it gets works as Anti-Enforcement DEF (Ignore Invincible can\'t get through)';
    case 'immuneTo': return `Immune to ${(e.cats || []).map(c => ({ burn: 'Burn', charm: 'Charm', mental: 'mental debuffs', poison: 'Poison', curse: 'Curse', skillSeal: 'Skill Seal', terror: 'Terror', stun: 'Stun', sleep: 'Sleep', npSeal: 'NP Seal', pigify: 'Pigify', atkDown: 'ATK down', defDown: 'DEF down' }[c] || c)).join(' and ')}`;
    case 'rankUp': return 'Gain a Skill Rank Up stack. Using skill 2 or 3 spends up to 2 stacks to rank it up by that many stages';
    case 'aura': {
      const a = e.aura || {};
      const who = a.cond === 'Trait 500800' ? 'Merlin allies' : a.cond ? `${a.cond} allies` : 'All allies';
      if (a.s === 'trigger') {
        const inner = (a.eff || []).map(x => line(x, { inTrigger: true })).filter(Boolean).map(x => x.text).join('; ');
        return `While on the field: whenever ${a.cond ? `a ${a.cond} ally` : 'an ally'} takes damage, that ally gains ${inner}`;
      }
      return `While on the field: ${who} get ${PCT[a.s] || a.s} ${sign(a.v)}%${a.notVsClass ? ` against all enemies except ${a.notVsClass.join(', ')}s` : ''}`;
    }
    case 'npDmgBoost': return 'Doubles the effect of NP damage buffs (doesn\'t stack)';
    case 'noSwap': return "Can't be swapped out by Order Change";
    case 'counter': {
      const n = e.np || {};
      return `Counters every enemy card attack aimed at it with ${n.n || 'its NP'} (${num(n.dmg || 0)}% ${n.card || ''} damage${(n.post || []).length ? ', plus its effects' : ''})`;
    }
    case 'noHeal': return 'Recovery Disabled (can\'t restore HP)';
    case 'npDmgRes': return `NP damage taken −${num(v)}%`;
    case 'lockHand': return 'Locks your current Command Cards: the same hand returns each turn (breaks if your field changes)';
    case 'dmgCut': return `Damage Cut ${num(v)} per hit` + ocRange(e, v, 'v5', num);
    case 'dmgTakenPlus': return `Takes ${sign(v)} damage from every attack` + ocRange(e, v, 'v5', sign);
    case 'maxHp': return `Max HP ${sign(v)}` + ocRange(e, v, 'v5', sign);
    case 'hpRegen': return `Restore ${num(v)} HP each turn` + ocRange(e, v, 'v5', num);
    case 'npRegen': return `NP +${num(v)}% each turn`;
    case 'starRegen': return `Gain ${num(v)} stars each turn`;
    case 'ocUp': return `Next NP overcharge +${num(v * 100)}%`;
    case 'busterAtkNp': return `NP +${num(v)}% each time this servant attacks with a Buster card`;
    case 'npOnBurnHit': return `NP +${num(v)}% per hit on a Burned enemy`;
    case 'curseOnAttack': return `Attacks inflict Curse (${num(v)} damage per turn)`;
    case 'multiHit': return `Normal attacks hit ${num(v)}× as often at reduced power per hit (more NP and stars)`;
    case 'reflect': return `After all attacks this turn, deals the damage taken back to every enemy as true damage${v !== 1 ? ` (×${num(v)})` : ''}. Only if this servant survives`;
    case 'quickHitDebuff': return `Quick hits inflict ${PCT[e.eff.s] || e.eff.s} ${sign(e.eff.v)}% (${turns(e.eff.t)})`;
    case 'special': {
      if (e.perMarkOp) return `+${num(e.perMarkOp.add)}% damage per ${({ 'Burning Love': 'Flames of Love' })[e.vs] || e.vs || 'stack'} stack on the target (up to ${e.perMarkOp.max})`;
      const vs = (e.vsList && e.vsList.join(' or ')) || e.vs || (e.status ? { burn: 'Burned', poison: 'Poisoned', curse: 'Cursed' }[e.status] : '') || e.alignVs || 'targets';
      return `${sign(v)}% damage against ${vs} enemies` + ocRange(e, v, 'v5', x => sign(x) + '%');
    }
    case 'specialDef': return `Takes −${num(v)}% damage from ${e.vs || 'some'} enemies`;
    case 'trait': if (e.marks && e.marks.includes(2885)) return 'Magic Bullet (max 20). Each Quick/Arts/Buster attack spends 1 for ATK +50% on that attack; the Extra Attack spends all of them, +50% each';
    case 'trait': return e.label && !/^Apply Trait/.test(e.label) ? `${e.label} stack` : `Gains the ${e.trait} trait`;
    case 'classRel': {
      const pvp = r => Math.round((1 + (r - 1) * 0.5) * 1000) / 1000; // the game halves FGO's class multipliers
      const parts = [];
      for (const row of Object.values(e.atk || {})) for (const [d, r] of Object.entries(row))
        parts.push(pvp(r[0]) > 1 ? `class advantage against ${d} (×${pvp(r[0])})` : pvp(r[0]) === 1 ? `neutral class matchup when attacking ${d}` : `class disadvantage against ${d} (×${pvp(r[0])})`);
      const neutral = [], capped = [];
      for (const [a, row] of Object.entries(e.def || {})) for (const r of Object.values(row)) (r[0] === 1 ? (r[1] === 'cap' ? capped : neutral) : neutral).push(a);
      const def = [...neutral, ...capped];
      if (def.length) parts.push(`${def.join(', ')} ${def.length > 1 ? 'have' : 'has'} no class advantage against it`);
      return parts.map((x, k) => k ? x : x[0].toUpperCase() + x.slice(1)).join('; ');
    }
  }
  return `${s} ${sign(v)}`;
}

// One effect -> { text, sub? } (sub = nested lines for triggered/delayed effects)
function line(e, ctx = {}) {
  if (e.hidden) return null;
  const who = WHO[e.to] || '';
  const wrap = (what, extra = [], ee = e) => {
    const meta = [];
    if (who && !((ctx.self || ctx.inTrigger) && e.to === 'self')) meta.push(who);
    const sp = span(ee); if (sp) meta.push(sp);
    meta.push(...conds(ee), ...extra);
    return { text: what + (meta.length ? ` · ${meta.join(' · ')}` : '') };
  };
  switch (e.k) {
    case 'buff': {
      if (e.s === 'trigger') {
        const on = { turnStart: 'At the start of each turn', attack: 'After each of its attacks', cardBefore: 'Before each card attack', cardAfter: 'After each card attack', guts: 'When its Guts triggers',
          damaged: 'When it takes damage', death: 'When it is defeated', entry: 'When it enters the field', npAfter: 'After its NP', healed: 'When it receives HP recovery', turnEnd: 'At the end of each turn', npBefore: 'Before its NP hits' }[e.on] || e.on;
        const once = e.on === 'turnEnd' && e.n === 1 && (e.t == null || e.t >= 99);
        let when = once ? 'At the end of this turn' : on;
        if (e.whileHas) when += ` while ${STATUSADJ[e.whileHas] || e.whileHas}`;
        if (e.whileMark === 2951) when += ' while it has Mark of Sin';
        if (e.cards) when += ` with ${e.cards.map(c => ({ Q: 'Quick', A: 'Arts', B: 'Buster', EX: 'Extra' }[c])).join('/')}${e.mainOnly ? ' (not the Extra Attack)' : ''}`;
        else if (e.mainOnly) when += ' (cards and NP, not the Extra Attack)';
        if (e.crit) when += ' (critical hits)';
        if (e.vsAny) when += ` against ${e.vsAny.join('/')} targets`;
        if (e.chance != null) when += ` (${num(e.chance)}% chance)`;
        const sp = span(e);
        const r = { text: `${when}${sp && !once ? ` (${sp})` : ''}:` };
        r.sub = (e.eff || []).map(x => line(x, { inTrigger: true, all: ctx.all })).filter(Boolean);
        return r;
      }
      return wrap(buffWhat(e));
    }
    case 'np': return wrap(`NP +${num(e.v)}%` + ocRange(e, e.v, 'v5', x => '+' + num(x) + '%'));
    case 'stars': if (e.v < 0) return { text: `Lose ${num(-e.v)} of your stars` };
      return wrap(`Gain ${num(e.v)} stars` + ocRange(e, e.v, 'v5', num));
    case 'heal': return wrap(e.pct ? `Restore ${num(e.pct)}% of max HP` : `Restore ${num(e.v)} HP` + ocRange(e, e.v, 'v5', num));
    case 'guts': return wrap(`Guts: revive with ${num(e.hp)} HP` + ocRange(e, e.hp, 'hp5', num), []);
    case 'cleanse':
      if (e.marks) {
        const tgt = (ctx.all || []).find(x => x.k === 'buff' && x.marks && x.marks.some(m => e.marks.includes(m)));
        const nm = e.marks.map(m => MARKNAME[m]).find(Boolean);
        if (tgt && tgt.hidden) return null;
        return { text: nm ? `Removes ${nm}` : tgt ? `Ends the ${buffWhat(tgt)} effect above` : 'Ends the effect above' };
      }
      return wrap(`Remove ${e.count ? `up to ${e.count} ` : ''}${(e.cats || ['debuff']).map(c => CAT[c] || c).join(', ')}`);
    case 'strip': {
      const cats = e.which === 'def' ? ['defUp'] : (e.cats || ['buff']);
      return wrap(`Remove ${e.which === 'one' ? 'one of ' : e.count ? `up to ${e.count} ` : ''}${cats.map(c => CAT[c] || c).join(', ')}`);
    }
    case 'control': {
      const nm = CTRL[e.kind] || e.kind;
      if (e.kind === 'terror') return wrap(`Terror (each turn, ${num(e.stunChance ?? 40)}% chance to be stunned)`);
      const sub = e.kind === 'skillSeal' ? " (can't use skills)" : e.kind === 'npSeal' ? " (can't use NP)" : e.kind === 'charm' ? " (can't act)" : ['stun', 'bind', 'petrify', 'sleep', 'pigify'].includes(e.kind) ? " (can't act)" : '';
      const t = e.selfInflicted ? e.t : Math.min(e.t, 1);
      const extra = e.p5 != null ? [`up to ${num(e.p5)}% at 500% overcharge`] : [];
      return wrap(`${nm}${sub}`, extra, { ...e, t });
    }
    case 'dot': return wrap(`${DOT[e.kind] || e.kind}: ${num(e.v)} damage per turn` + ocRange(e, e.v, 'v5', num));
    case 'drain': return wrap(`NP −${num(e.v)}%`);
    case 'death': {
      const p = e.p * 0.1;
      const r = wrap(`Instant death (${num(p)}% base chance${e.p5 != null ? `, up to ${num(e.p5 * 0.1)}% at 500% overcharge` : ''})`, []);
      if (e.onKill) r.sub = e.onKill.map(x => line(x, { inTrigger: true })).map(x => ({ ...x, text: 'If it lands: ' + x.text }));
      return r;
    }
    case 'delayed': { const r = { text: `After ${e.after} turn${e.after === 1 ? '' : 's'} (at the end of that turn):` }; r.sub = (e.eff || []).map(x => line(x, { inTrigger: true })).filter(Boolean); return r; }
    case 'selfDmg': return { text: `Lose ${num(e.v)} HP${e.nonlethal ? " (can't drop below 1)" : ''}` };
    case 'koSelf': return { text: 'Defeats itself (Guts can save it)' };
    case 'cdReduce': return wrap(`Skill cooldowns −${e.v}`);
    case 'field': return { text: `Battlefield becomes ${FIELDN[e.name] || e.name} for ${turns(e.t)}${e.endsOnDeath ? ' (ends if this servant is defeated)' : ''}` };
    case 'transform': return { text: e.intoName ? `Transforms into ${e.intoName}: its NP becomes ${e.intoNp}` : 'Transforms into its other form' };
    case 'absorbHp': return wrap(`Drains ${num(e.v)} HP (never below 1); this servant restores the total`);
    case 'absorbNp': return wrap(`Takes up to ${num(e.v)}% NP; this servant gains the total`);
    case 'redeal': return { text: 'Redraws your Command Cards' };
    case 'npTypeRandom': case 'npTypeChoice': return { text: `NP card becomes Arts, Buster or Quick (you choose when using the skill; Arts by default) for ${turns(e.t)}` };
    case 'gatherCurse': return { text: 'Moves every Curse on the field onto this servant' };
    case 'gatherMarks': return null; // internal bookkeeping for the NP-per-enemy effect
    case 'eternalSleep': return { text: "Removes its buffs and falls into Eternal Slumber: it can't act, be swapped out or be sacrificed, for the rest of the game" };
    case 'retreat': return { text: ctx.inTrigger ? `Withdraws to the back of your reserves; the next reserve takes its place${e.notAlone ? " (not if it's the only one on the field)" : ''}` : 'After the NP (overcharge included), withdraws to the back of your reserves; the next reserve takes its place' };
    case 'sacrifice': return { text: "Sacrifices the first other ally on your field (they're defeated unless Guts saves them). This NP can't be used if no ally can be sacrificed" };
    case 'lockHand': return null; // described by the Hand locked buff
    case 'npPerTrait': return wrap(e.mark === 2836 ? `NP +${num(e.v)}% for each enemy affected` : e.mark === 2386 ? `NP +${num(e.v)}% per Growth stack` : e.mark != null ? `NP +${num(e.v)}% per ${String(e.trait).replace(/^Buff /, '')} stack` : `NP +${num(e.v)}% for each ${e.trait}`);
    case 'hpLoss': return wrap(`Lose ${num(e.v)} HP${e.nonlethal ? " (can't drop below 1)" : ''}`);
    case 'masterSteal': return { text: `Steals up to ${e.max} of your ready Master skills (they go on a ${e.cd}-turn cooldown; ones already on cooldown are left alone): NP damage +${num(e.per)}% for each, this NP` };
    case 'meal': return { text: "Serves the next dish to every ally that isn't full (+2 Fullness each): 1 Yakisoba ATK +20%, 2 Curry Max HP +200, 3 Ramen NP +20%, 4 Frankfurter NP damage +20%, 5 Skewers crit damage +50%, 6 Parfait heal 1000, then repeat. 5% chance of the Legendary Rice Ball: all six (+12 Fullness)" };
    case 'fullness': return wrap(`Fullness ${e.v > 0 ? '+' : '−'}${num(Math.abs(e.v))}`);
    case 'npMult': return wrap(`NP ×${num(e.v)}`);
    case 'copyClass': return { text: `Becomes the target enemy's class for ${turns(e.t)}` };
    case 'npPerFoeStatus': return { text: `NP +${num(e.v)}% for each ${({ bind: 'Bound' })[e.status] || e.status} enemy on the field` };
    case 'extend': return wrap(`Extends ${e.stats.map(x => ({ hpRegen: 'HP regen', npRegen: 'NP-per-turn', starRegen: 'stars-per-turn', poison: 'Poison', burn: 'Burn', curse: 'Curse' })[x] || x).join(', ')} effects by ${e.v} turns`);
  }
  return { text: e.k };
}
function lines(list, ctx = {}) {
  // identical effects in a row are stacks (e.g. Bewitchment ×2): show them once with a count
  const out = []; const L = list || [];
  for (let i = 0; i < L.length; i++) {
    let n = 1; while (i + n < L.length && JSON.stringify(L[i + n]) === JSON.stringify(L[i])) n++;
    const l = line(L[i], { ...ctx, all: L }); if (!l) { i += n - 1; continue; }
    if (n > 1) l.text = l.text.replace(/^([^·]+)/, m => `${m.trim()} ×${n} stacks `);
    out.push(l); i += n - 1;
  }
  return out;
}

function describeKit(kit, d) {
  const out = { skills: [], np: null, passives: [] };
  for (const s of kit.sk) {
    let L;
    if (s.opts) { // a skill with a choice: shared effects, then one block per option
      L = lines(s.e.filter(e => e.opt == null));
      s.opts.forEach((o, k) => {
        const sub = lines(s.e.filter(e => e.opt === k && !e.optCost));
        L.push({ text: `Option ${k + 1} · ${o.label}${o.stars ? ` (spends ${o.stars} of your stars)` : ''}:`, sub: sub.length ? sub : [{ text: 'No extra effect' }] });
      });
      L.unshift({ text: 'When used, choose one option' });
    } else L = lines(s.e);
    if (s.e.some(e => e.branch)) {
      L = lines(s.e.filter(e => !e.branch));
      const other = lines(s.e.filter(e => e.branch === 'other')), self = lines(s.e.filter(e => e.branch === 'self'));
      L.push({ text: 'Used on another ally:', sub: other }, { text: 'Used on herself:', sub: self });
    }
    if (s.needNp) L.unshift({ text: `Only usable with at least ${s.needNp}% NP` });
    if (s.needStars) L.unshift({ text: `Only usable with at least ${s.needStars} stars` });
    if (s.cd0) L.unshift({ text: `Needs ${s.cd0} turns of charge at the start of the battle` });
    out.skills.push({ name: s.n, cd: s.cd, lines: L, ranks: (s.ranks || []).map(r => lines(r)) });
  }
  const np = kit.np;
  if (np) {
    if (np.noNP) out.np = { name: 'No Noble Phantasm', none: true, lines: [{ text: 'This form has no NP and no NP gauge.' }] };
    else {
      const card = d ? d.np : '';
      const target = np.tgt === 'all' ? 'all enemies' : np.tgt === 'one' ? 'one enemy' : 'no damage';
      const L = [];
      L.push(...lines(np.pre));
      if (np.tgt !== 'none' && np.dmg) {
        let t = `Deals ${num(np.dmg)}% damage to ${target}`;
        if (np.ocDmg) t += ` (${num(np.dmg + np.ocDmg.v)}% to ${num(np.dmg + np.ocDmg.v5)}% with overcharge)`;
        const x = [];
        if (np.special) {
          const vs = np.special.vs || ({ burn: 'Burned', poison: 'Poisoned', curse: 'Cursed' }[np.special.status]) || (np.special.anyOf && np.special.anyOf.map(x => STATUSADJ[x] || (x === 'Marking' ? 'Marked' : x)).join(' or ')) || (np.special.rarity && np.special.rarity.map(r => r + '★').join(' or ')) || '';
          x.push(`${num(np.special.v)}%${np.special.v5 ? `–${num(np.special.v5)}%` : ''} damage against ${vs} enemies`);
        }
        if (np.affectionDmg) x.push(`+${num(np.affectionDmg)}% per Affection level above 1`);
        if (np.selfStack) x.push(`+${num(np.selfStack.per)}% for each ${np.selfStack.name} stack on this servant (up to ${np.selfStack.max})`);
        if (np.lowHp) x.push(`more damage the lower this servant's HP (up to +${num(np.lowHp)}%)`);
        if (np.ignoreDef || np.ignoreDefUp) x.push("ignores the target's DEF buffs");
        L.push({ text: t + (x.length ? ` · ${x.join(' · ')}` : '') });
      }
      L.push(...lines(np.post));
      out.np = { name: np.n, card, target, level: d && d.npl, lines: L, oc: lines(np.oc), ocNote: (np.oc || []).some(e => e.v5 != null || e.hp5 != null || e.p5 != null) };
    }
  }
  if (kit.fullness) out.passives.push({ text: 'Fullness gauge for every ally on her team (0–4, Super Giants 0–8): meals fill it, each attack digests 1, full allies can\'t eat' });
  if (kit.affection) out.passives.push({ text: 'Affection gauge (Lv 1–10, every 10 points is a level; starts at 5, +5 if she starts on the field): +3 per card of hers chosen, +6 Brave Chain, +3 per skill she uses (+2 if it is your first skill that turn), +5/+10/+15 for NP overcharge 200/300/400%+, +10 when the field becomes Waterside, +5 Master skill, +10 Command Seal' });
  if (d && d.aoeCards) out.passives.push({ text: `${d.aoeCards.map(c => ({ A: 'Arts', B: 'Buster', Q: 'Quick', EX: 'Extra' })[c]).join(' and ')} attacks hit all enemies (half damage each when there is more than one)` });
  for (const p of kit.pas || []) {
    const e = Array.isArray(p) ? { k: 'buff', to: 'self', s: p[0], v: p[1] } : { k: 'buff', to: 'self', ...p };
    const l = line(e, { self: true }); if (l) out.passives.push(l); // hidden passives aren't listed
  }
  return out;
}
// Plain text for tooltips: "Name (CD 5)\n• line\n   – sub"
function flat(ls, pre = '• ') { return ls.filter(Boolean).map(l => pre + l.text + (l.sub ? '\n' + flat(l.sub, '   – ') : '')).join('\n'); }
function skillText(kit, i) { const s = describeKit(kit).skills[i]; return `${s.name} (CD ${s.cd})\n${flat(s.lines)}` + s.ranks.map((r, k) => `\nRank Up ${k + 1}:\n${flat(r)}`).join(''); }
function npText(kit, d) { const n = describeKit(kit, d).np; if (!n) return ''; return `${n.name}${n.card ? ` (${n.card}, ${n.target})` : ''}\n${flat(n.lines)}${n.oc && n.oc.length ? `\nOvercharge:\n${flat(n.oc)}` : ''}`; }
const API = { describeKit, skillText, npText, flat };
if (typeof module !== 'undefined') module.exports = API; else root.Describe = API;
})(typeof window !== 'undefined' ? window : globalThis);
