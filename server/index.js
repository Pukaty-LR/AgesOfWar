// Ages of War - game server: static files + WebSocket lobbies + authoritative game rooms.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Sim } from '../shared/sim.js';
import { AIPlayer } from '../shared/ai.js';
import { ERAS, TICK_RATE, NET_RATE, MAX_PLAYERS, TEAM_COLORS, MAP_SIZE } from '../shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = +(process.env.PORT || 8080);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/client/index.html';
  if (!url.startsWith('/client/') && !url.startsWith('/shared/')) url = '/client' + url;
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

let nextClientId = 1, nextLobbyId = 1;
const clients = new Map();   // id -> client
const lobbies = new Map();   // id -> lobby

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function lobbySummary(l) {
  return { id: l.id, name: l.name, host: l.slots.find(s => s.id === l.hostId)?.name || '?', era: l.era, players: l.slots.length, max: l.max, state: l.state, tick: l.game ? l.game.sim.tick : 0 };
}
function broadcastLobbyList() {
  const list = [...lobbies.values()].map(lobbySummary);
  for (const c of clients.values()) if (!c.lobby) send(c.ws, { t: 'lobbies', list });
}
function lobbyState(l) {
  return { id: l.id, name: l.name, hostId: l.hostId, era: l.era, max: l.max, state: l.state, slots: l.slots.map(s => ({ id: s.id, name: s.name, faction: s.faction, team: s.team, color: s.color, ready: s.ready, isAI: s.isAI, diff: s.diff, connected: s.isAI || (clients.get(s.id)?.ws.readyState === 1) })) };
}
function broadcastLobby(l) { const st = { t: 'lobby', lobby: lobbyState(l) }; for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c) send(c.ws, st); } }
function freeColor(l) { const used = new Set(l.slots.map(s => s.color)); for (let i = 0; i < TEAM_COLORS.length; i++) if (!used.has(i)) return i; return 0; }
function freeTeam(l) { const used = new Set(l.slots.map(s => s.team)); for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i; return 0; }
function defaultFaction(era) { return ERAS[era].factions[0].id; }

function leaveLobby(c, silent = false) {
  const l = c.lobby; if (!l) return;
  c.lobby = null;
  const idx = l.slots.findIndex(s => s.id === c.id);
  if (l.state === 'lobby') {
    if (idx >= 0) l.slots.splice(idx, 1);
    const humans = l.slots.filter(s => !s.isAI);
    if (!humans.length) { lobbies.delete(l.id); }
    else { if (l.hostId === c.id) l.hostId = humans[0].id; broadcastLobby(l); }
  } else if (l.game) {
    // in game: keep slot, mark disconnected
    if (idx >= 0) { l.slots[idx].connected = false; }
    l.game.chat(`${c.name} opustil hru.`);
    const humans = l.slots.filter(s => !s.isAI && clients.get(s.id)?.lobby === l);
    if (!humans.length) { stopGame(l); lobbies.delete(l.id); }
  }
  if (!silent) send(c.ws, { t: 'lobbyLeft' });
  broadcastLobbyList();
}

function startGame(l) {
  const seed = (Math.random() * 0x7fffffff) | 0;
  const players = l.slots.map(s => ({ name: s.name, faction: s.faction, team: s.team, color: s.color, isAI: s.isAI }));
  const sim = new Sim({ seed, size: MAP_SIZE, eraId: l.era, players });
  const ais = l.slots.map((s, i) => s.isAI ? new AIPlayer(sim, i, s.diff || 'normal') : null).filter(Boolean);
  const game = { sim, ais, seed, interval: null, acc: 0, last: Date.now(), chat(text) { for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c) send(c.ws, { t: 'chat', from: '', text, sys: true }); } } };
  l.game = game; l.state = 'game';
  const map = sim.mapData();
  l.slots.forEach((s, i) => {
    if (s.isAI) return;
    const c = clients.get(s.id); if (!c) return;
    send(c.ws, { t: 'start', game: { era: l.era, seed, map, me: i, players: sim.players.map(p => sim.serializePlayer(p)), lobbyName: l.name } });
    send(c.ws, sim.fullSnapshot());
  });
  const tickMs = 1000 / TICK_RATE;
  const netEvery = Math.round(TICK_RATE / NET_RATE);
  game.last = Date.now();
  game.interval = setInterval(() => {
    const now = Date.now();
    game.acc += now - game.last; game.last = now;
    let steps = 0;
    while (game.acc >= tickMs && steps < 5) {
      game.acc -= tickMs; steps++;
      try {
        if (sim.tick % 20 === 0) for (const a of ais) a.update();
        sim.step();
      } catch (err) { console.error('sim error', err); }
      if (sim.tick % netEvery === 0) {
        const snap = sim.deltaSnapshot();
        const str = JSON.stringify(snap);
        for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c && c.lobby === l && c.ws.readyState === 1) c.ws.send(str); }
      }
      if (sim.gameOver && !game.overAt) { game.overAt = Date.now(); l.state = 'over'; broadcastLobbyList(); }
    }
    if (game.acc > tickMs * 10) game.acc = 0; // avoid spiral of death
    if (game.overAt && Date.now() - game.overAt > 5 * 60 * 1000) { stopGame(l); lobbies.delete(l.id); broadcastLobbyList(); }
  }, tickMs / 2);
  broadcastLobbyList();
  console.log(`[game] "${l.name}" started: era=${l.era} seed=${seed} players=${players.map(p => p.name + (p.isAI ? '(AI)' : '')).join(', ')}`);
}
function stopGame(l) {
  if (l.game && l.game.interval) clearInterval(l.game.interval);
  l.game = null; l.state = 'lobby';
  for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c && c.lobby === l) { c.lobby = null; send(c.ws, { t: 'lobbyLeft' }); } }
}

wss.on('connection', (ws, req) => {
  const c = { id: nextClientId++, ws, name: 'Hráč', lobby: null, addr: req.socket.remoteAddress };
  clients.set(c.id, c);
  send(ws, { t: 'welcome', id: c.id, eras: Object.fromEntries(Object.entries(ERAS).map(([k, e]) => [k, { id: e.id, name: e.name, available: e.available }])) });
  send(ws, { t: 'lobbies', list: [...lobbies.values()].map(lobbySummary) });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const l = c.lobby;
    switch (m.t) {
      case 'hello': c.name = String(m.name || 'Hráč').slice(0, 18).trim() || 'Hráč'; break;
      case 'ping': send(ws, { t: 'pong', ts: m.ts }); break;
      case 'list': send(ws, { t: 'lobbies', list: [...lobbies.values()].map(lobbySummary) }); break;
      case 'host': {
        if (l) leaveLobby(c, true);
        const era = ERAS[m.era] && ERAS[m.era].available ? m.era : 'antiquity';
        const lobby = { id: nextLobbyId++, name: String(m.name || `${c.name}ova hra`).slice(0, 28), hostId: c.id, era, max: Math.min(MAX_PLAYERS, Math.max(2, m.max | 0 || 4)), state: 'lobby', slots: [], game: null };
        lobby.slots.push({ id: c.id, name: c.name, faction: defaultFaction(era), team: 0, color: 0, ready: false, isAI: false });
        lobbies.set(lobby.id, lobby); c.lobby = lobby;
        broadcastLobby(lobby); broadcastLobbyList();
        break;
      }
      case 'join': {
        const lobby = lobbies.get(m.id);
        if (!lobby) return send(ws, { t: 'error', msg: 'Server už neexistuje.' });
        if (lobby.state !== 'lobby') return send(ws, { t: 'error', msg: 'Hra už probíhá.' });
        if (lobby.slots.length >= lobby.max) return send(ws, { t: 'error', msg: 'Server je plný.' });
        if (l) leaveLobby(c, true);
        lobby.slots.push({ id: c.id, name: c.name, faction: defaultFaction(lobby.era), team: freeTeam(lobby), color: freeColor(lobby), ready: false, isAI: false });
        c.lobby = lobby; broadcastLobby(lobby); broadcastLobbyList();
        break;
      }
      case 'leave': leaveLobby(c); break;
      case 'set': {
        if (!l || l.state !== 'lobby') return;
        const s = l.slots.find(s => s.id === c.id); if (!s) return;
        if (m.faction && ERAS[l.era].factions.some(f => f.id === m.faction)) s.faction = m.faction;
        if (m.team !== undefined) s.team = Math.max(0, Math.min(MAX_PLAYERS - 1, m.team | 0));
        if (m.color !== undefined) { const col = Math.max(0, Math.min(TEAM_COLORS.length - 1, m.color | 0)); if (!l.slots.some(o => o !== s && o.color === col)) s.color = col; }
        if (m.ready !== undefined) s.ready = !!m.ready;
        broadcastLobby(l);
        break;
      }
      case 'setSlot': { // host edits a bot slot
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        const s = l.slots[m.slot]; if (!s || !s.isAI) return;
        if (m.faction && ERAS[l.era].factions.some(f => f.id === m.faction)) s.faction = m.faction;
        if (m.team !== undefined) s.team = Math.max(0, Math.min(MAX_PLAYERS - 1, m.team | 0));
        if (m.color !== undefined) { const col = Math.max(0, Math.min(TEAM_COLORS.length - 1, m.color | 0)); if (!l.slots.some(o => o !== s && o.color === col)) s.color = col; }
        if (m.diff) s.diff = m.diff === 'hard' ? 'hard' : 'normal';
        broadcastLobby(l);
        break;
      }
      case 'setEra': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        if (!ERAS[m.era] || !ERAS[m.era].available) return;
        l.era = m.era; for (const s of l.slots) { s.faction = defaultFaction(l.era); s.ready = false; }
        broadcastLobby(l); broadcastLobbyList();
        break;
      }
      case 'addBot': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby' || l.slots.length >= l.max) return;
        const n = l.slots.filter(s => s.isAI).length + 1;
        const fs = ERAS[l.era].factions;
        l.slots.push({ id: -n - Math.random(), name: `Počítač ${n}`, faction: fs[n % fs.length].id, team: freeTeam(l), color: freeColor(l), ready: true, isAI: true, diff: m.diff === 'hard' ? 'hard' : 'normal' });
        broadcastLobby(l); broadcastLobbyList();
        break;
      }
      case 'kick': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        const s = l.slots[m.slot]; if (!s || s.id === c.id) return;
        if (s.isAI) l.slots.splice(m.slot, 1);
        else { const other = clients.get(s.id); if (other) { leaveLobby(other); send(other.ws, { t: 'error', msg: 'Hostitel tě vyhodil.' }); } }
        broadcastLobby(l); broadcastLobbyList();
        break;
      }
      case 'start': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        if (l.slots.length < 2) return send(ws, { t: 'error', msg: 'Potřebuješ aspoň 2 hráče (přidej bota).' });
        if (l.slots.some(s => !s.isAI && s.id !== c.id && !s.ready)) return send(ws, { t: 'error', msg: 'Ne všichni hráči jsou připraveni.' });
        const teams = new Set(l.slots.map(s => s.team));
        if (teams.size < 2) return send(ws, { t: 'error', msg: 'Všichni jsou ve stejném týmu.' });
        startGame(l);
        break;
      }
      case 'cmd': {
        if (!l || !l.game) return;
        const idx = l.slots.findIndex(s => s.id === c.id); if (idx < 0) return;
        try { l.game.sim.command(idx, m.c); } catch (err) { console.error('cmd error', err, m.c); }
        break;
      }
      case 'chat': {
        const text = String(m.text || '').slice(0, 200); if (!text.trim()) return;
        if (!l) return;
        for (const s of l.slots) if (!s.isAI) { const o = clients.get(s.id); if (o) send(o.ws, { t: 'chat', from: c.name, text, color: l.slots.find(x => x.id === c.id)?.color }); }
        break;
      }
      case 'wallPreview': { // ask the server for a wall path preview (uses sim's buildable grid)
        if (!l || !l.game) return;
        const tiles = l.game.sim.wallPath(m.x0, m.y0, m.x1, m.y1);
        send(ws, { t: 'wallPreview', id: m.id, tiles });
        break;
      }
    }
  });
  ws.on('close', () => { leaveLobby(c, true); clients.delete(c.id); broadcastLobbyList(); });
  ws.on('error', () => {});
});

server.listen(PORT, () => {
  const ips = [];
  for (const [name, ifs] of Object.entries(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log(`Ages of War server running:\n  local:   http://localhost:${PORT}\n` + ips.map(ip => `  network: http://${ip}:${PORT}`).join('\n'));
});
