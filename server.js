// Grand Order PvP — online server.
// Rooms of up to 6 people. Everyone in the battle queue waits their turn; the top two fight while the rest spectate.
// The server runs the same battle engine as the browser: it checks every pick and order, keeps hidden choices
// (battlefields, lineups, skills, cards) private until both players have locked in, then broadcasts them so
// every browser replays the identical turn.
'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const E = require('./src/engine.js');
const { KITS } = require('./src/kits.js');
const ROSTER = require('./src/roster.json');
const R = {}; for (const d of ROSTER) R[d.id] = d;

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const ROOM_IDLE_MS = 30 * 60 * 1000;   // empty rooms are removed after 30 minutes

const app = express();
app.get('/healthz', (_, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/r/:code', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const server = http.createServer(app);
const io = new Server(server, { perMessageDeflate: { threshold: 1024 }, pingTimeout: 30000 });

// ---------------------------------------------------------------- People and rooms
const people = new Map();   // token -> { id, token, name, code, sid, online }
const rooms = new Map();    // code  -> room
const rid = n => crypto.randomBytes(n).toString('hex');
const clean = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
function personById(room, id) { for (const t of room.members) { const p = people.get(t); if (p && p.id === id) return p; } return null; }
function roomView(room) {
  return {
    code: room.code, host: room.host, opts: room.opts, queue: room.queue.slice(),
    status: room.match ? (room.match.phase === 'over' ? 'over' : 'match') : 'lobby',
    notice: room.notice || '',
    players: room.members.map(t => people.get(t)).filter(Boolean).map(p => ({ id: p.id, name: p.name, online: p.online, role: room.queue.includes(p.id) ? 'queue' : 'spectate' })),
    seats: room.match ? room.match.seats.slice() : null,
  };
}
function sendRoom(room) { io.to(room.code).emit('room', roomView(room)); }
function touch(room) { room.last = Date.now(); }

function joinRoom(person, room, sock) {
  if (!room.members.includes(person.token)) {
    room.members.push(person.token);
    room.queue.push(person.id); // newcomers start in the battle queue; they can move to the stands
  }
  person.code = room.code;
  sock.join(room.code);
  touch(room);
  sendRoom(room);
  if (room.match) sock.emit('match', matchView(room.match));
}
function leaveRoom(person) {
  const room = rooms.get(person.code); if (!room) { person.code = null; return; }
  room.members = room.members.filter(t => t !== person.token);
  room.queue = room.queue.filter(id => id !== person.id);
  if (person.sid) { const s = io.sockets.sockets.get(person.sid); if (s) s.leave(room.code); }
  person.code = null;
  if (room.match && room.match.seats.includes(person.id) && room.match.phase !== 'over') {
    room.notice = `${person.name} left during the battle, so it ended.`;
    room.match = null; io.to(room.code).emit('match', null);
  }
  if (!room.members.length) { rooms.delete(room.code); return; }
  if (room.host === person.id) room.host = people.get(room.members[0]).id;
  sendRoom(room);
}

// ---------------------------------------------------------------- Matches
// Public action log: every browser replays it to rebuild the game, so a refresh or a late spectator catches up.
function newMatch(room, a, b) {
  const seats = Math.random() < 0.5 ? [a, b] : [b, a];
  const m = {
    id: rid(6), seats, names: seats.map(id => (personById(room, id) || { name: '?' }).name),
    seed: Math.floor(Math.random() * 2 ** 31), first: Math.random() < 0.5 ? 0 : 1, seals: room.opts.seals,
    phase: 'draft', actions: [], pending: [null, null], stage: null,
    draft: { teams: [[], []], taken: new Set(), i: 0 }, g: null, winner: null,
  };
  m.draft.order = E.snakeOrder(m.first);
  room.match = m; room.notice = '';
  io.to(room.code).emit('match', matchView(m));
  sendRoom(room);
}
function matchView(m) {
  if (!m) return null;
  return { id: m.id, seats: m.seats, names: m.names, seed: m.seed, first: m.first, seals: m.seals, actions: m.actions,
    phase: m.phase, stage: m.stage, locked: m.pending.map(Boolean), winner: m.winner, next: m.next || null };
}
function push(room, a) {
  const m = room.match; m.actions.push(a);
  io.to(room.code).emit('action', { id: m.id, n: m.actions.length - 1, a });
}
function locked(room, kind, p) { io.to(room.code).emit('locked', { id: room.match.id, kind, p }); }
const hash = g => { let h = 0; const s = Object.values(g.units).map(u => `${u.uid}:${Math.round(u.hp)}:${Math.floor(u.np)}:${u.dead ? 1 : 0}`).join('|') + `#${g.turn}`; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

function act(room, person, a, reply) {
  const m = room.match; if (!m || !a) return reply('No battle is running.');
  const p = m.seats.indexOf(person.id); if (p < 0) return reply('Only the two players can do that.');
  touch(room);
  if (m.phase === 'draft' && a.t === 'pick') {
    const D = m.draft; if (D.order[D.i] !== p) return reply('Not your pick.');
    const id = +a.id; if (!R[id] || R[id].hidden) return reply('Unknown servant.');
    const ok = E.canPick(D.teams[p], id, D.taken, R); if (!ok.ok) return reply(ok.why);
    D.teams[p].push(id); D.taken.add(id); D.i += 1;
    push(room, { t: 'pick', p, id });
    if (D.i >= D.order.length) { m.phase = 'fields'; m.pending = [null, null]; }
    return reply(null);
  }
  if (m.phase === 'fields' && a.t === 'fields') {
    const picks = Array.isArray(a.picks) ? [...new Set(a.picks.map(String))] : [];
    if (picks.length !== 3 || !picks.every(f => E.FIELDS.includes(f))) return reply('Pick 3 battlefields.');
    if (m.pending[p]) return reply('Already locked in.');
    m.pending[p] = picks; locked(room, 'fields', p);
    if (m.pending[0] && m.pending[1]) {
      const x = m.pending[0][Math.floor(Math.random() * 3)], y = m.pending[1][Math.floor(Math.random() * 3)];
      const first = Math.random() < 0.5 ? 0 : 1;
      m.fields = first === 0 ? [x, y] : [y, x];
      push(room, { t: 'fields', result: m.fields, owner: first === 0 ? [0, 1] : [1, 0] });
      m.phase = 'lineup'; m.pending = [null, null];
    }
    return reply(null);
  }
  if (m.phase === 'lineup' && a.t === 'lineup') {
    const team = m.draft.teams[p]; const order = Array.isArray(a.order) ? a.order.map(Number) : [];
    if (order.length !== team.length || [...order].sort().join() !== [...team].sort().join()) return reply('Order all six servants.');
    if (m.pending[p]) return reply('Already locked in.');
    m.pending[p] = order; locked(room, 'lineup', p);
    if (m.pending[0] && m.pending[1]) {
      const orders = m.pending.slice(); const initiative = Math.random() < 0.5 ? 0 : 1;
      m.g = E.newBattle(R, KITS, orders, { seed: m.seed, initiative, seals: m.seals, fields: m.fields });
      push(room, { t: 'lineup', orders, initiative });
      m.phase = 'battle'; m.stage = 'skills'; m.pending = [null, null];
    }
    return reply(null);
  }
  if (m.phase === 'battle' && a.t === 'skills' && m.stage === 'skills') {
    if (m.pending[p]) return reply('Already locked in.');
    m.pending[p] = { skillQueue: arr(a.skillQueue), masterQueue: arr(a.masterQueue), sealQueue: a.sealQueue && typeof a.sealQueue === 'object' ? a.sealQueue : null };
    locked(room, 'skills', p);
    if (m.pending[0] && m.pending[1]) {
      const g = m.g;
      for (let q = 0; q < 2; q++) applySkillPicks(g, q, m.pending[q]);
      const out = JSON.parse(JSON.stringify([0, 1].map(q => { const P = g.players[q]; return { skillQueue: P.skillQueue, masterQueue: P.masterQueue, sealQueue: P.sealQueue }; })));
      const qseq = g.qseq || 0;
      E.resolveSkills(g);
      push(room, { t: 'skills', q: out, qseq, h: hash(g) });
      m.stage = 'cards'; m.pending = [null, null];
      if (g.over) finish(room);
    }
    return reply(null);
  }
  if (m.phase === 'battle' && a.t === 'cards' && m.stage === 'cards') {
    if (m.pending[p]) return reply('Already locked in.');
    const sel = cardPicks(m.g, p, a.sel); if (!sel) return reply('Those cards are not in your hand.');
    m.pending[p] = sel; locked(room, 'cards', p);
    if (m.pending[0] && m.pending[1]) {
      const g = m.g; const sels = m.pending.slice();
      for (let q = 0; q < 2; q++) E.setCards(g, q, sels[q].map(s => ({ ...findCard(g, q, s.id), target: s.target })));
      E.resolveCards(g);
      push(room, { t: 'cards', sel: sels, h: hash(g) });
      m.stage = 'skills'; m.pending = [null, null];
      if (g.over) finish(room);
    }
    return reply(null);
  }
  return reply('That move does not fit this part of the game.');
}
const arr = x => Array.isArray(x) ? x.slice(0, 40) : [];
// Re-queue a player's picks through the engine so only legal skills go through, in the order they were picked.
function applySkillPicks(g, p, s) {
  const P = g.players[p]; P.skillQueue = []; P.masterQueue = []; P.sealQueue = null;
  const items = [...s.skillQueue.map(x => ({ k: 'skill', x })), ...s.masterQueue.map(x => ({ k: 'master', x })), ...(s.sealQueue ? [{ k: 'seal', x: s.sealQueue }] : [])]
    .filter(o => o.x && typeof o.x === 'object').sort((a, b) => (+a.x.seq || 0) - (+b.x.seq || 0));
  for (const { k, x } of items) {
    try {
      if (k === 'skill' && g.units[x.uid] && g.units[x.uid].side === p) E.queueSkill(g, p, +x.uid, +x.i, x.target == null ? null : +x.target, x.opt == null ? undefined : x.opt);
      else if (k === 'master') { if (+x.i === 2) E.queueMaster(g, p, 2, +x.out, +x.in); else E.queueMaster(g, p, +x.i, +x.target); }
      else if (k === 'seal') E.queueSeal(g, p, x.kind, +x.uid);
    } catch (e) { /* an illegal pick is simply dropped */ }
  }
}
function findCard(g, p, id) { return E.availableNPs(g, p).concat(g.players[p].hand).find(c => c.id === id); }
function cardPicks(g, p, sel) {
  if (!Array.isArray(sel)) return null;
  const pool = E.availableNPs(g, p).concat(g.players[p].hand);
  const need = Math.min(3, pool.length);
  const seen = new Set(); const foes = E.front(g, 1 - p).filter(u => !u.dead).map(u => u.uid);
  const out = [];
  for (const s of sel.slice(0, 3)) {
    if (!s || seen.has(s.id) || !pool.some(c => c.id === s.id)) return null;
    seen.add(s.id);
    out.push({ id: s.id, target: foes.includes(+s.target) ? +s.target : foes[0] });
  }
  return out.length === need ? out : null;
}
function finish(room) {
  const m = room.match; m.phase = 'over'; m.winner = m.g.winner;
  const left = room.queue.filter(id => !m.seats.includes(id));
  m.next = left.length ? 'next' : 'again';
  io.to(room.code).emit('over', { id: m.id, winner: m.winner, next: m.next });
  sendRoom(room);
}
// After a battle: the loser goes to the back of the queue, the winner stays on top.
function rotateQueue(room) {
  const m = room.match; if (!m || m.winner == null) return;
  const w = m.winner === 'draw' ? m.seats[0] : m.seats[m.winner];
  const l = m.seats.find(id => id !== w);
  const rest = room.queue.filter(id => id !== w && id !== l);
  room.queue = [...(room.queue.includes(w) ? [w] : []), ...rest, ...(room.queue.includes(l) ? [l] : [])];
}
function post(room, person, choice, reply) {
  const m = room.match; if (!m || m.phase !== 'over') return reply('The battle is not over.');
  const p = m.seats.indexOf(person.id);
  const isWinner = m.winner === 'draw' ? p >= 0 : p === m.winner;
  if (choice === 'lobby') {
    if (!isWinner && person.id !== room.host) return reply('Only the winner or the host can do that.');
    rotateQueue(room); room.match = null; room.notice = '';
    io.to(room.code).emit('match', null); sendRoom(room); return reply(null);
  }
  if (!isWinner) return reply('Only the winner can start the next battle.');
  rotateQueue(room);
  if (room.queue.length < 2) { room.match = null; io.to(room.code).emit('match', null); sendRoom(room); return reply('Not enough people in the battle queue.'); }
  newMatch(room, room.queue[0], room.queue[1]);
  return reply(null);
}

// ---------------------------------------------------------------- Sockets
io.on('connection', sock => {
  let me = null;
  const ok = (cb, err, extra) => { if (typeof cb === 'function') cb(err ? { error: err } : { ok: true, ...(extra || {}) }); };
  sock.on('hello', (d, cb) => {
    d = d || {};
    me = d.token && people.get(d.token);
    if (!me) { const token = rid(16); me = { id: rid(5), token, name: clean(d.name) || 'Master', code: null, sid: null, online: true }; people.set(token, me); }
    if (d.name) me.name = clean(d.name) || me.name;
    me.sid = sock.id; me.online = true;
    ok(cb, null, { token: me.token, id: me.id, name: me.name, code: me.code });
    const room = me.code && rooms.get(me.code);
    if (room) { sock.join(room.code); sendRoom(room); if (room.match) sock.emit('match', matchView(room.match)); }
  });
  sock.on('name', (d, cb) => { if (!me) return ok(cb, 'Not connected.'); me.name = clean(d && d.name) || me.name; const room = rooms.get(me.code); if (room) sendRoom(room); ok(cb); });
  sock.on('create', (d, cb) => {
    if (!me) return ok(cb, 'Not connected.');
    if (d && d.name) me.name = clean(d.name) || me.name;
    if (me.code) leaveRoom(me);
    const room = { code: newCode(), host: me.id, members: [], queue: [], opts: { seals: true }, match: null, last: Date.now() };
    rooms.set(room.code, room);
    joinRoom(me, room, sock);
    ok(cb, null, { code: room.code });
  });
  sock.on('join', (d, cb) => {
    if (!me) return ok(cb, 'Not connected.');
    if (d && d.name) me.name = clean(d.name) || me.name;
    const code = String((d && d.code) || '').toUpperCase().trim();
    const room = rooms.get(code); if (!room) return ok(cb, `No room with code ${code || '?'}.`);
    if (!room.members.includes(me.token) && room.members.length >= MAX_PLAYERS) return ok(cb, 'That room is full (6 people).');
    if (me.code && me.code !== code) leaveRoom(me);
    joinRoom(me, room, sock);
    ok(cb, null, { code });
  });
  sock.on('leave', (_, cb) => { if (me) leaveRoom(me); ok(cb); });
  sock.on('role', (d, cb) => {
    const room = me && rooms.get(me.code); if (!room) return ok(cb, 'Not in a room.');
    const want = d && d.role;
    if (room.match && room.match.phase !== 'over' && room.match.seats.includes(me.id)) return ok(cb, 'You are in the current battle.');
    if (want === 'queue' && !room.queue.includes(me.id)) room.queue.push(me.id);
    if (want === 'spectate') room.queue = room.queue.filter(id => id !== me.id);
    sendRoom(room); ok(cb);
  });
  sock.on('opts', (d, cb) => {
    const room = me && rooms.get(me.code); if (!room) return ok(cb, 'Not in a room.');
    if (room.host !== me.id) return ok(cb, 'Only the host can change settings.');
    if (d && typeof d.seals === 'boolean') room.opts.seals = d.seals;
    sendRoom(room); ok(cb);
  });
  sock.on('start', (_, cb) => {
    const room = me && rooms.get(me.code); if (!room) return ok(cb, 'Not in a room.');
    if (room.host !== me.id) return ok(cb, 'Only the host can start a battle.');
    if (room.match && room.match.phase !== 'over') return ok(cb, 'A battle is already running.');
    const ready = room.queue.filter(id => { const p = personById(room, id); return p && p.online; });
    if (ready.length < 2) return ok(cb, 'Two people need to be in the battle queue.');
    room.queue = [...ready.slice(0, 2), ...room.queue.filter(id => !ready.slice(0, 2).includes(id))];
    newMatch(room, room.queue[0], room.queue[1]); ok(cb);
  });
  sock.on('end', (_, cb) => { // host ends a running battle and brings everyone back to the lobby
    const room = me && rooms.get(me.code); if (!room || !room.match) return ok(cb, 'No battle.');
    if (room.host !== me.id) return ok(cb, 'Only the host can end the battle.');
    room.match = null; room.notice = `${me.name} ended the battle.`;
    io.to(room.code).emit('match', null); sendRoom(room); ok(cb);
  });
  sock.on('act', (a, cb) => { const room = me && rooms.get(me.code); if (!room) return ok(cb, 'Not in a room.'); act(room, me, a, err => ok(cb, err)); });
  sock.on('post', (d, cb) => { const room = me && rooms.get(me.code); if (!room) return ok(cb, 'Not in a room.'); post(room, me, d && d.choice, err => ok(cb, err)); });
  sock.on('disconnect', () => {
    if (!me || me.sid !== sock.id) return;
    me.online = false; const room = rooms.get(me.code); if (room) { touch(room); sendRoom(room); }
  });
});

// Tidy up rooms nobody has touched in a while.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.members.some(t => (people.get(t) || {}).online);
    if (!anyone && now - room.last > ROOM_IDLE_MS) { for (const t of room.members) { const p = people.get(t); if (p) p.code = null; } rooms.delete(code); }
  }
  for (const [t, p] of people) if (!p.online && !p.code) people.delete(t);
}, 60 * 1000).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Grand Order PvP online on :${PORT}`));
module.exports = { server, io, rooms };
