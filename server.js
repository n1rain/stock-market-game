"use strict";
/* Stock Market Game — zero-dependency multiplayer server (Node 18+).
   Real-time via Server-Sent Events, actions via POST JSON. No npm install needed. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const game = require('./game.js');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rooms.json');
const PUBLIC_DIR = __dirname;

let rooms = {}; // code -> {state, hostToken, tokens:{token:{playerId}|{host:true}}, clients:Set({res,isHost})}

function rid(n) {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += c[crypto.randomInt(c.length)];
  return s;
}
function persist() {
  try {
    const slim = {};
    Object.keys(rooms).forEach(k => {
      slim[k] = { state: rooms[k].state, hostToken: rooms[k].hostToken, tokens: rooms[k].tokens };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(slim));
  } catch (e) { console.log('persist failed', e.message); }
}
function restore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const slim = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    Object.keys(slim).forEach(k => { slim[k].clients = new Set(); rooms[k] = slim[k]; });
    console.log('restored', Object.keys(rooms).length, 'room(s)');
  } catch (e) { console.log('restore failed', e.message); }
}
// hide the exact bubble threshold from non-host clients
function publicState(room, isHost) {
  if (isHost) return room.state;
  const s = Object.assign({}, room.state, { bubbleThreshold: null });
  return s;
}
function broadcast(room) {
  const payloadHost = 'data: ' + JSON.stringify({ state: publicState(room, true) }) + '\n\n';
  const payloadPlayer = 'data: ' + JSON.stringify({ state: publicState(room, false) }) + '\n\n';
  room.clients.forEach(c => {
    try { c.res.write(c.isHost ? payloadHost : payloadPlayer); } catch (e) {}
  });
}
function withState(room, fn) {
  game.setS(room.state);
  const r = fn();
  room.state = game.getS();
  return r;
}
function auth(room, token) {
  if (!room || !token) return null;
  if (token === room.hostToken) return { host: true };
  const t = room.tokens[token];
  if (t) return { playerId: t.playerId };
  return null;
}
function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } });
  });
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const HOST_ACTIONS = new Set(['lockResolve','rollD12','setRegime','confirmMoves','rollFireSale','setFireBuyer',
  'setFireBuyerQty','confirmFireSale','bubbleStep','drawBubble','endRound','genMM','setRule','setBubbleRange','setPhase','flipTrend']);

async function handleApi(req, res, url) {
  const body = await readBody(req);
  const send = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

  if (url.pathname === '/api/create' && req.method === 'POST') {
    const cfg = body.config || {};
    const names = []; // players join separately
    game.newGame({
      names: names,
      name: String(body.name || 'Stock Market Game').slice(0, 60),
      rounds: Math.max(1, Math.min(30, parseInt(cfg.rounds, 10) || 10)),
      cash: Math.max(0, parseInt(cfg.cash, 10) || 2000),
      bc: Math.max(0, parseInt(cfg.bc, 10) || 10),
      spec: Math.max(0, parseInt(cfg.spec, 10) || 0),
      strike: Math.max(1, parseInt(cfg.strike, 10) || 50),
      outstanding: cfg.outstanding || { bc: 300, spec: 300, pref: 150, bond: 150, warr: 200 },
      splitsOn: cfg.splitsOn !== false,
      rules: cfg.rules || null,
      bubbleLo: parseInt(cfg.bubbleLo, 10) || 0,
      bubbleHi: parseInt(cfg.bubbleHi, 10) || 0
    });
    const state = game.getS();
    let code = rid(4);
    while (rooms[code]) code = rid(4);
    const hostToken = rid(16);
    rooms[code] = { state: state, hostToken: hostToken, tokens: {}, clients: new Set() };
    persist();
    return send({ ok: true, code: code, hostToken: hostToken, state: publicState(rooms[code], true) });
  }

  const code = String(body.code || '').toUpperCase();
  const room = rooms[code];
  if (url.pathname === '/api/join' && req.method === 'POST') {
    if (!room) return send({ ok: false, err: 'Game not found. Check the code.' });
    if (room.state.phase === 'over') return send({ ok: false, err: 'Game is over.' });
    const name = String(body.name || '').trim().slice(0, 24);
    if (!name) return send({ ok: false, err: 'Enter your name.' });
    if (room.state.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
      return send({ ok: false, err: 'Name is taken.' });
    const p = withState(room, () => game.addPlayer(name));
    if (!p) return send({ ok: false, err: 'Game is full (12).' });
    const token = rid(16);
    room.tokens[token] = { playerId: p.id };
    persist(); broadcast(room);
    return send({ ok: true, playerId: p.id, playerToken: token, state: publicState(room, false) });
  }

  if (url.pathname === '/api/rejoin' && req.method === 'POST') {
    if (!room) return send({ ok: false, err: 'Game not found.' });
    const a = auth(room, body.token);
    if (!a) return send({ ok: false, err: 'Session expired. Rejoin with the code.' });
    return send({ ok: true, host: !!a.host, playerId: a.playerId || null, state: publicState(room, !!a.host) });
  }

  if (url.pathname === '/api/backup' && req.method === 'POST') {
    if (!room) return send({ ok: false, err: 'Game not found.' });
    const a = auth(room, body.token);
    if (!a || !a.host) return send({ ok: false, err: 'Host only.' });
    return send({ ok: true, state: room.state });
  }

  if (url.pathname === '/api/action' && req.method === 'POST') {
    if (!room) return send({ ok: false, err: 'Game not found.' });
    const a = auth(room, body.token);
    if (!a) return send({ ok: false, err: 'Session expired.' });
    const action = body.action;
    try {
      let result = { ok: true };
      if (action === 'submitTrades') {
        const pid = a.host ? (body.pid || null) : a.playerId;
        if (!pid) return send({ ok: false, err: 'Unknown player.' });
        if (room.state.phase !== 'trading') return send({ ok: false, err: 'Trading is locked.' });
        const errs = withState(room, () => game.submitTrades(pid, body.trades || {}, body.cashAct || {}));
        result.errs = errs;
      } else if (HOST_ACTIONS.has(action)) {
        if (!a.host) return send({ ok: false, err: 'Host only.' });
        withState(room, () => {
          switch (action) {
            case 'lockResolve': game.lockResolve(); break;
            case 'rollD12': game.rollD12(); break;
            case 'setRegime': game.setRegime(body.regime); break;
            case 'confirmMoves': game.confirmMoves(); break;
            case 'rollFireSale': game.rollFireSale(parseInt(body.ix, 10) || 0); break;
            case 'setFireBuyer': game.setFireBuyer(parseInt(body.ix, 10) || 0, body.buyerId || ''); break;
            case 'setFireBuyerQty': game.setFireBuyerQty(parseInt(body.ix, 10) || 0, body.qty); break;
            case 'confirmFireSale': game.confirmFireSale(); break;
            case 'bubbleStep': game.bubbleStep(); break;
            case 'drawBubble': game.drawBubble(); break;
            case 'endRound': game.endRound(); break;
            case 'genMM': game.genMM(); break;
            case 'flipTrend': game.flipTrend(); break;
            case 'setRule': game.setRule(body.k, !!body.v); break;
            case 'setBubbleRange': game.setBubbleRange(body.lo, body.hi); break;
            case 'setPhase': if (game.PHASES.indexOf(body.phase) >= 0) { game.getS().phase = body.phase; } break;
          }
        });
      } else {
        return send({ ok: false, err: 'Unknown action.' });
      }
      persist(); broadcast(room);
      result.state = publicState(room, !!a.host);
      return send(result);
    } catch (e) {
      console.log('action error', action, e.message);
      return send({ ok: false, err: 'Server error.' });
    }
  }
  return send({ ok: false, err: 'Not found.' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const fp = path.join(PUBLIC_DIR, p);
  if (!fp.startsWith(PUBLIC_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // SSE stream
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const room = rooms[code];
    const a = auth(room, url.searchParams.get('token'));
    if (!room || !a) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    const client = { res: res, isHost: !!a.host };
    room.clients.add(client);
    res.write('data: ' + JSON.stringify({ state: publicState(room, !!a.host) }) + '\n\n');
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(hb); room.clients.delete(client); });
    return;
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

restore();
server.listen(PORT, () => console.log('SMG server on :' + PORT));
