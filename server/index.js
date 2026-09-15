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
import { MAP_STYLES, MAP_SIZES } from '../shared/mapgen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SAVES = path.join(ROOT, 'saves');
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
  return { id: l.id, name: l.name, hostId: l.hostId, era: l.era, max: l.max, state: l.state, mapStyle: l.mapStyle, mapSize: l.mapSize, startRes: l.startRes, reveal: !!l.reveal, seedText: l.seedText || '', slots: l.slots.map(s => ({ id: s.id, name: s.name, faction: s.faction, team: s.team, color: s.color, ready: s.ready, isAI: s.isAI, diff: s.diff, connected: s.isAI || (clients.get(s.id)?.ws.readyState === 1) })) };
}
function broadcastLobby(l) { const st = { t: 'lobby', lobby: lobbyState(l) }; for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c) send(c.ws, st); } }
function freeColor(l) { const used = new Set(l.slots.map(s => s.color)); for (let i = 0; i < TEAM_COLORS.length; i++) if (!used.has(i)) return i; return 0; }
function freeTeam(l) { const used = new Set(l.slots.map(s => s.team)); for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i; return 0; }
function defaultFaction(era) { return ERAS[era].factions[0].id; }
function validDiff(d) { return ['easy', 'normal', 'hard', 'impossible'].includes(d) ? d : 'normal'; }
function lobbyChat(l, text) { for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c && c.lobby === l) send(c.ws, { t: 'chat', from: '', text, sys: true }); } }
function botName(l, fac) { const base = fac.leader || fac.name; let name = base, k = 2; while (l.slots.some(s => s.name === name)) name = `${base} ${k++}`; return name; }

function abandonRooms(c) { if (!c.token) return; for (const lb of lobbies.values()) if (lb.game && lb !== c.lobby) for (const s of lb.slots) if (s.token === c.token && clients.get(s.id) !== c) s.token = null; }
function connectedHumans(l) { return l.slots.filter(s => !s.isAI && clients.get(s.id)?.lobby === l && clients.get(s.id)?.ws.readyState === 1); }
function leaveLobby(c, silent = false, explicit = false) {
  const l = c.lobby; if (!l) return;
  c.lobby = null;
  const idx = l.slots.findIndex(s => s.id === c.id);
  if (l.state === 'lobby') {
    if (idx >= 0) l.slots.splice(idx, 1);
    const humans = l.slots.filter(s => !s.isAI);
    if (!humans.length) { lobbies.delete(l.id); }
    else { if (l.hostId === c.id) l.hostId = humans[0].id; broadcastLobby(l); lobbyChat(l, `${c.name} odešel.`); }
  } else if (l.game) {
    // in game: keep the slot so the player can rejoin (unless they left on purpose)
    if (idx >= 0) { l.slots[idx].connected = false; if (explicit) l.slots[idx].token = null; }
    l.game.chat(explicit ? `${c.name} opustil hru.` : `${c.name} ztratil spojení.`);
    if (!connectedHumans(l).length) {
      if (explicit || l.slots.every(s => s.isAI || !s.token)) { stopGame(l); lobbies.delete(l.id); }
      else l.emptySince = Date.now(); // keep the room for a while for reconnects
    }
  }
  if (!silent) send(c.ws, { t: 'lobbyLeft' });
  broadcastLobbyList();
}

function startGame(l, presetSim = null, aiStates = null) {
  const seed = presetSim ? presetSim.seed : (l.seed ? Math.abs(l.seed) : (Math.random() * 0x7fffffff) | 0);
  const players = l.slots.map(s => { let faction = s.faction; if (faction === 'random') { const fs = ERAS[l.era].factions; const fac = fs[Math.floor(Math.random() * fs.length)]; faction = fac.id; s.faction = faction; if (s.isAI) { s.name = ''; s.name = botName(l, fac); } } return { name: s.name, faction, team: s.team, color: s.color, isAI: s.isAI }; });
  players.push({ name: 'Divočina', faction: ERAS[l.era].factions[0].id, team: 99, color: 7, isAI: false, neutral: true }); // neutral creeps
  const sim = presetSim || new Sim({ seed, size: (MAP_SIZES[l.mapSize] || MAP_SIZES.medium).size, eraId: l.era, players, mapStyle: l.mapStyle || 'continent', startRes: l.startRes || 'normal' });
  const ais = l.slots.map((s, i) => s.isAI ? new AIPlayer(sim, i, s.diff || 'normal') : null).filter(Boolean);
  if (aiStates) for (const a of ais) { const st = aiStates.find(x => x.pid === a.pid); if (st) Object.assign(a, { wave: st.wave, buildStep: st.buildStep, lastAttackTick: st.lastAttackTick, lastBuildTick: st.lastBuildTick, wallGateAt: st.wallGateAt, rallyPoint: st.rallyPoint }); }
  const game = { sim, ais, seed, interval: null, acc: 0, last: Date.now(), chat(text) { for (const s of l.slots) if (!s.isAI) { const c = clients.get(s.id); if (c) send(c.ws, { t: 'chat', from: '', text, sys: true }); } } };
  l.game = game; l.state = 'game';
  const map = sim.mapData();
  l.slots.forEach((s, i) => {
    if (s.isAI) return;
    const c = clients.get(s.id); if (!c) return;
    send(c.ws, { t: 'start', game: { era: l.era, seed, map, me: i, players: sim.players.map(p => sim.serializePlayer(p)), lobbyName: l.name, reveal: !!l.reveal } });
    send(c.ws, sim.fullSnapshot());
  });
  game.tickMs = 1000 / TICK_RATE;
  const netEvery = Math.round(TICK_RATE / NET_RATE);
  game.last = Date.now();
  game.interval = setInterval(() => {
    const now = Date.now();
    const tickMs = game.tickMs;
    if (game.paused) { game.last = now; game.acc = 0; return; }
    game.acc += now - game.last; game.last = now;
    let steps = 0;
    while (game.acc >= tickMs && steps < 8) {
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
    if (game.overAt && Date.now() - game.overAt > 5 * 60 * 1000) { stopGame(l); lobbies.delete(l.id); broadcastLobbyList(); return; }
    if (l.emptySince && !connectedHumans(l).length && Date.now() - l.emptySince > 3 * 60 * 1000) { console.log(`[game] "${l.name}" closed: nobody reconnected`); stopGame(l); lobbies.delete(l.id); broadcastLobbyList(); }
  }, 1000 / TICK_RATE / 4);
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
    if (!m || typeof m.t !== 'string') return;
    try { handle(m); } catch (err) { console.error('message error', m.t, err); }
  });
  function handle(m) {
    const l = c.lobby;
    switch (m.t) {
      case 'hello': {
        c.name = String(m.name || 'Hráč').slice(0, 18).trim() || 'Hráč';
        c.token = typeof m.token === 'string' ? m.token.slice(0, 40) : null;
        // rejoin a running game after a page refresh / connection drop
        if (c.token && !c.lobby) {
          const candidates = [...lobbies.values()].filter(lb => lb.game && lb.slots.some(s => !s.isAI && s.token === c.token && clients.get(s.id)?.lobby !== lb)).sort((a, b) => b.id - a.id);
          for (const lobby of candidates) {
            const slot = lobby.slots.find(s => !s.isAI && s.token === c.token && clients.get(s.id)?.lobby !== lobby);
            if (!slot) continue;
            // abandon older rooms held for this token
            for (const other of candidates) if (other !== lobby) for (const s of other.slots) if (s.token === c.token) s.token = null;
            const idx = lobby.slots.indexOf(slot); slot.id = c.id; slot.name = c.name; slot.connected = true; c.lobby = lobby; lobby.emptySince = null;
            const sim = lobby.game.sim;
            send(ws, { t: 'start', game: { era: lobby.era, seed: lobby.game.seed, map: sim.mapData(), me: idx, players: sim.players.map(p => sim.serializePlayer(p)), lobbyName: lobby.name, rejoin: true, reveal: !!lobby.reveal } });
            send(ws, sim.fullSnapshot());
            lobby.game.chat(`${c.name} se znovu připojil.`);
            break;
          }
        }
        break;
      }
      case 'ping': send(ws, { t: 'pong', ts: m.ts }); break;
      case 'list': send(ws, { t: 'lobbies', list: [...lobbies.values()].map(lobbySummary) }); break;
      case 'host': {
        if (l) leaveLobby(c, true, true); abandonRooms(c);
        const era = ERAS[m.era] && ERAS[m.era].available ? m.era : 'antiquity';
        const lobby = { id: nextLobbyId++, name: String(m.name || `${c.name}ova hra`).slice(0, 28), hostId: c.id, era, max: Math.min(MAX_PLAYERS, Math.max(2, m.max | 0 || 4)), state: 'lobby', slots: [], game: null, mapStyle: 'continent', mapSize: 'medium', startRes: 'normal', reveal: false };
        lobby.slots.push({ id: c.id, name: c.name, faction: defaultFaction(era), team: 0, color: 0, ready: false, isAI: false, token: c.token });
        lobbies.set(lobby.id, lobby); c.lobby = lobby;
        broadcastLobby(lobby); broadcastLobbyList();
        break;
      }
      case 'join': {
        const lobby = lobbies.get(m.id);
        if (!lobby) return send(ws, { t: 'error', msg: 'Server už neexistuje.' });
        if (lobby.state !== 'lobby') return send(ws, { t: 'error', msg: 'Hra už probíhá.' });
        if (lobby.slots.length >= lobby.max) return send(ws, { t: 'error', msg: 'Server je plný.' });
        if (l) leaveLobby(c, true, true); abandonRooms(c);
        lobby.slots.push({ id: c.id, name: c.name, faction: defaultFaction(lobby.era), team: freeTeam(lobby), color: freeColor(lobby), ready: false, isAI: false, token: c.token });
        c.lobby = lobby; broadcastLobby(lobby); broadcastLobbyList();
        lobbyChat(lobby, `${c.name} se připojil.`);
        break;
      }
      case 'leave': leaveLobby(c, false, true); break;
      case 'set': {
        if (!l || l.state !== 'lobby') return;
        const s = l.slots.find(s => s.id === c.id); if (!s) return;
        if (m.faction && (m.faction === 'random' || ERAS[l.era].factions.some(f => f.id === m.faction))) s.faction = m.faction;
        if (m.team !== undefined) s.team = Math.max(0, Math.min(MAX_PLAYERS - 1, m.team | 0));
        if (m.color !== undefined) { const col = Math.max(0, Math.min(TEAM_COLORS.length - 1, m.color | 0)); if (!l.slots.some(o => o !== s && o.color === col)) s.color = col; }
        if (m.ready !== undefined) s.ready = !!m.ready;
        broadcastLobby(l);
        break;
      }
      case 'setSlot': { // host edits a bot slot
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        const s = l.slots[m.slot]; if (!s || !s.isAI) return;
        if (m.faction && ERAS[l.era].factions.some(f => f.id === m.faction)) { s.faction = m.faction; s.name = ''; s.name = botName(l, ERAS[l.era].factions.find(f => f.id === m.faction)); }
        else if (m.faction === 'random') { s.faction = 'random'; s.name = ''; s.name = botName(l, { leader: 'Počítač', name: 'Počítač' }); }
        if (m.team !== undefined) s.team = Math.max(0, Math.min(MAX_PLAYERS - 1, m.team | 0));
        if (m.color !== undefined) { const col = Math.max(0, Math.min(TEAM_COLORS.length - 1, m.color | 0)); if (!l.slots.some(o => o !== s && o.color === col)) s.color = col; }
        if (m.diff) s.diff = validDiff(m.diff);
        broadcastLobby(l);
        break;
      }
      case 'setEra': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        if (!ERAS[m.era] || !ERAS[m.era].available) return;
        l.era = m.era; const fs2 = ERAS[l.era].factions; let bi = 0;
        for (const s of l.slots) { if (s.isAI) { const fac = fs2[(++bi) % fs2.length]; s.faction = fac.id; s.name = ''; s.name = botName(l, fac); } else { s.faction = defaultFaction(l.era); s.ready = false; } }
        broadcastLobby(l); broadcastLobbyList();
        break;
      }
      case 'setMap': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby') return;
        if (m.style && MAP_STYLES[m.style]) l.mapStyle = m.style;
        if (m.size && MAP_SIZES[m.size]) l.mapSize = m.size;
        if (m.startRes && ['low', 'normal', 'high'].includes(m.startRes)) l.startRes = m.startRes;
        if (m.reveal !== undefined) l.reveal = !!m.reveal;
        if (m.seed !== undefined) { const sv = String(m.seed).trim(); l.seed = sv ? (/^\d+$/.test(sv) ? (+sv | 0) : [...sv].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) : null; l.seedText = sv.slice(0, 24); }
        broadcastLobby(l);
        break;
      }
      case 'addBot': {
        if (!l || l.hostId !== c.id || l.state !== 'lobby' || l.slots.length >= l.max) return;
        const n = l.slots.filter(s => s.isAI).length + 1;
        const fs = ERAS[l.era].factions;
        const fac = fs[n % fs.length];
        l.slots.push({ id: -n - Math.random(), name: botName(l, fac), faction: fac.id, team: freeTeam(l), color: freeColor(l), ready: true, isAI: true, diff: validDiff(m.diff) });
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
        if (l.starting) return;
        l.starting = true; const secs = 3;
        for (const s of l.slots) if (!s.isAI) { const o = clients.get(s.id); if (o) send(o.ws, { t: 'countdown', n: secs }); }
        setTimeout(() => { l.starting = false; if (lobbies.get(l.id) === l && l.state === 'lobby' && l.slots.length >= 2) startGame(l); }, secs * 1000);
        break;
      }
      case 'cmd': {
        if (!l || !l.game) return;
        const idx = l.slots.findIndex(s => s.id === c.id); if (idx < 0) return;
        // rate limit: at most 40 commands per second per client
        const nowMs = Date.now(); if (!c.cmdWin || nowMs - c.cmdWin > 1000) { c.cmdWin = nowMs; c.cmdCount = 0; } if (++c.cmdCount > 40) return;
        try { l.game.sim.command(idx, m.c); } catch (err) { console.error('cmd error', err, m.c); }
        break;
      }
      case 'chat': {
        let text = String(m.text || '').slice(0, 200); if (!text.trim()) return;
        if (!l) return;
        const meSlot = l.slots.find(x => x.id === c.id);
        const teamOnly = /^\/t\s+/i.test(text); if (teamOnly) text = text.replace(/^\/t\s+/i, '');
        for (const s of l.slots) if (!s.isAI && (!teamOnly || (meSlot && s.team === meSlot.team))) { const o = clients.get(s.id); if (o) send(o.ws, { t: 'chat', from: (teamOnly ? '[tým] ' : '') + c.name, text, color: meSlot?.color }); }
        break;
      }
      case 'save': { // single-player: write the whole simulation to disk
        if (!l || !l.game || !c.token) return;
        if (l.slots.filter(s => !s.isAI && s.token).length > 1) return send(ws, { t: 'error', msg: 'Ukládat lze jen hru proti AI.' });
        try {
          const sim = l.game.sim;
          const data = sim.saveState({ savedAt: Date.now(), lobbyName: l.name, era: l.era, ais: l.game.ais.map(a => ({ pid: a.pid, diff: a.diff, wave: a.wave, buildStep: a.buildStep, lastAttackTick: a.lastAttackTick, lastBuildTick: a.lastBuildTick, wallGateAt: a.wallGateAt, rallyPoint: a.rallyPoint })), humanSlot: l.slots.findIndex(s => s.id === c.id), humanName: c.name });
          fs.mkdirSync(SAVES, { recursive: true });
          const name = String(m.name || 'uloz').replace(/[^\w\-áéíóúůýčďěňřšťžÁÉÍÓÚŮÝČĎĚŇŘŠŤŽ ]/g, '').slice(0, 30) || 'uloz';
          fs.writeFileSync(path.join(SAVES, `${c.token}__${name}.json`), JSON.stringify(data));
          send(ws, { t: 'saved', name });
        } catch (err) { console.error('save failed', err); send(ws, { t: 'error', msg: 'Uložení selhalo.' }); }
        break;
      }
      case 'saves': { // list this player's saves
        if (!c.token) return send(ws, { t: 'saves', list: [] });
        let list = [];
        try { list = fs.readdirSync(SAVES).filter(f => f.startsWith(c.token + '__') && f.endsWith('.json')).map(f => { const st = fs.statSync(path.join(SAVES, f)); let meta = {}; try { const d = JSON.parse(fs.readFileSync(path.join(SAVES, f), 'utf8')); meta = { era: d.eraId, tick: d.tick, lobbyName: d.lobbyName }; } catch {} return { name: f.slice(c.token.length + 2, -5), time: st.mtimeMs, ...meta }; }).sort((a, b) => b.time - a.time); } catch {}
        send(ws, { t: 'saves', list });
        break;
      }
      case 'load': { // recreate a single-player room from a save
        if (!c.token) return;
        const file = path.join(SAVES, `${c.token}__${String(m.name).replace(/[\\/]/g, '')}.json`);
        let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return send(ws, { t: 'error', msg: 'Uloženou hru se nepodařilo načíst.' }); }
        try {
          if (l) leaveLobby(c, true, true); abandonRooms(c);
          const sim = Sim.loadState(data);
          const slots = data.players.filter(p => !p.neutral).map((p, i) => ({ id: i === data.humanSlot ? c.id : -1 - i - Math.random(), name: i === data.humanSlot ? c.name : p.name, faction: p.faction, team: p.team, color: p.color, ready: true, isAI: p.isAI, diff: (data.ais.find(a => a.pid === i) || {}).diff || 'normal', token: i === data.humanSlot ? c.token : undefined }));
          const lobby = { id: nextLobbyId++, name: data.lobbyName || 'Načtená hra', hostId: c.id, era: data.eraId, max: slots.length, state: 'lobby', slots, game: null, mapStyle: data.mapStyle, mapSize: 'medium', startRes: data.startRes, reveal: false, seed: data.seed };
          lobbies.set(lobby.id, lobby); c.lobby = lobby;
          startGame(lobby, sim, data.ais);
        } catch (err) { console.error('load failed', err); send(ws, { t: 'error', msg: 'Načtení selhalo.' }); }
        break;
      }
      case 'speed': { // single-player only: 1x / 1.5x / 2x simulation speed
        if (!l || !l.game) return;
        if (l.slots.filter(s => !s.isAI && s.token).length > 1) return;
        const sp = [1, 1.5, 2].includes(+m.v) ? +m.v : 1; l.game.speed = sp; l.game.tickMs = 1000 / TICK_RATE / sp;
        send(ws, { t: 'speed', v: sp });
        break;
      }
      case 'pause': { // single-player only (one human in the room): pause/resume the simulation
        if (!l || !l.game) return;
        if (l.slots.filter(s => !s.isAI && s.token).length > 1) return;
        l.game.paused = !!m.v; l.game.last = Date.now(); l.game.acc = 0;
        send(ws, { t: 'paused', v: l.game.paused });
        break;
      }
      case 'mping': { // map ping to teammates
        if (!l || !l.game) return;
        const me = l.slots.find(s => s.id === c.id); if (!me) return;
        const now = Date.now(); if (c.lastPing && now - c.lastPing < 1500) return; c.lastPing = now;
        for (const s of l.slots) if (!s.isAI && s.team === me.team) { const o = clients.get(s.id); if (o && o.lobby === l) send(o.ws, { t: 'mping', x: +m.x, y: +m.y, from: c.name, color: me.color }); }
        break;
      }
      case 'wallPreview': { // ask the server for a wall path preview (uses sim's buildable grid)
        if (!l || !l.game) return;
        const tiles = l.game.sim.wallPath(m.x0, m.y0, m.x1, m.y1);
        send(ws, { t: 'wallPreview', id: m.id, tiles });
        break;
      }
    }
  }
  ws.on('close', () => { leaveLobby(c, true); clients.delete(c.id); broadcastLobbyList(); });
  ws.on('error', () => {});
});

process.on('uncaughtException', err => console.error('uncaught', err));
process.on('unhandledRejection', err => console.error('unhandled', err));
server.listen(PORT, () => {
  const ips = [];
  for (const [name, ifs] of Object.entries(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log(`Ages of War server running:\n  local:   http://localhost:${PORT}\n` + ips.map(ip => `  network: http://${ip}:${PORT}`).join('\n'));
});
