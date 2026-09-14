// App: menus, lobby, connection, and game orchestration.
import { ERAS, ERA_ORDER, TEAM_COLORS, MAX_PLAYERS } from '../shared/data.js';
import { generateMap } from '../shared/mapgen.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Renderer } from './render/renderer.js';

const $ = id => document.getElementById(id);
const screens = ['menu', 'browser', 'host', 'lobby', 'settings', 'game'];

class App {
  constructor() {
    this.settings = Object.assign({ name: '', music: 40, sfx: 80, scroll: 60, edge: true, hp: false }, JSON.parse(localStorage.getItem('aow-settings') || '{}'));
    this.net = new Net(); this.audio = new Audio(); this.ui = new UI(this);
    this.game = new Game($('game'), this.net, this.audio, this.ui);
    this.lobby = null; this.myId = 0; this.hostEra = 'antiquity'; this.quick = false;
    this.bindMenus(); this.bindNet(); this.startBackground();
    this.show('menu');
    this.net.connect();
    document.addEventListener('pointerdown', () => this.audio.init(), { once: false });
    document.addEventListener('keydown', () => this.audio.init(), { once: true });
  }
  save() { localStorage.setItem('aow-settings', JSON.stringify(this.settings)); }
  show(name) { for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name); $('bg').style.display = name === 'game' ? 'none' : 'block'; this.screen = name; if (name === 'game') this.game.renderer.resize(); }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), 3500); }
  name() { const n = $('name').value.trim(); if (!n) { $('name').focus(); this.toast('Zadej svoje jméno.'); return null; } this.settings.name = n; this.save(); this.net.send({ t: 'hello', name: n }); return n; }

  // ---------- menu background ----------
  startBackground() {
    const canvas = $('bg'); const seed = (Math.random() * 1e9) | 0;
    const map = generateMap(seed, 64, 2);
    const stub = { ents: new Map(), selection: new Set(), players: [], myTeam: -1, me: -1, unitDef: () => null, buildingDef: () => null, tickNow: () => 0, tech: { buildings: {} } };
    let id = 1;
    for (const t of map.trees) stub.ents.set(id, { i: id++, k: 't', x: t.tx + 0.5, y: t.ty + 0.5, tx: t.tx, ty: t.ty, v: t.v });
    for (const m of map.mines) stub.ents.set(id, { i: id++, k: 'm', x: m.tx, y: m.ty, tx: m.tx - 1, ty: m.ty - 1 });
    const r = new Renderer(canvas, stub); r.setMap(map, 'antiquity'); r.explored.fill(1); r.visible.fill(1); r.updateFog = () => {}; r.fogCtx.clearRect(0, 0, r.fw, r.fh);
    r.cam.zoom = 1.1; let t0 = performance.now(); let a = 0;
    const loop = t => { if (this.screen !== 'game') { const dt = Math.min(0.05, (t - t0) / 1000); a += dt * 0.05; r.cam.x = 32 + Math.cos(a) * 14; r.cam.y = 32 + Math.sin(a * 0.7) * 14; if (canvas.clientWidth !== r.W || canvas.clientHeight !== r.H) r.resize(); r.draw(dt, { mouse: { x: 0, y: 0 } }); const ctx = r.ctx; ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); ctx.fillStyle = 'rgba(8,6,4,0.35)'; ctx.fillRect(0, 0, r.W, r.H); } t0 = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- menus ----------
  bindMenus() {
    $('name').value = this.settings.name;
    this.hostEra = this.settings.era || 'antiquity';
    const pickEra = e => { this.hostEra = e; this.settings.era = e; this.save(); this.renderEraCards($('menu-eras'), e, pickEra, true); };
    this.renderEraCards($('menu-eras'), this.hostEra, pickEra, true);
    $('name').addEventListener('change', () => { this.settings.name = $('name').value.trim(); this.save(); });
    $('btn-quick').onclick = () => { if (!this.name()) return; this.quick = true; this.net.send({ t: 'host', name: `${this.settings.name} vs AI`, era: this.hostEra, max: 2 }); };
    $('btn-host').onclick = () => { if (!this.name()) return; $('host-name').value = `${this.settings.name}ova hra`; this.renderEraCards($('host-eras'), this.hostEra, e => { this.hostEra = e; this.renderEraCards($('host-eras'), e, null, true); }); this.show('host'); };
    $('btn-host-back').onclick = () => this.show('menu');
    $('btn-host-create').onclick = () => { this.quick = false; this.net.send({ t: 'host', name: $('host-name').value.trim() || 'Nová hra', era: this.hostEra, max: +$('host-max').value }); };
    $('btn-join').onclick = () => { if (!this.name()) return; this.show('browser'); this.net.send({ t: 'list' }); };
    $('btn-browser-back').onclick = () => this.show('menu');
    $('btn-refresh').onclick = () => this.net.send({ t: 'list' });
    $('btn-direct').onclick = () => { const a = $('direct-addr').value.trim(); if (!a) return; this.net.connect((a.startsWith('ws') ? a : 'ws://' + a)); };
    $('btn-settings').onclick = () => this.show('settings');
    $('btn-settings-back').onclick = () => this.show('menu');
    $('btn-lobby-leave').onclick = () => { this.net.send({ t: 'leave' }); this.lobby = null; this.show('menu'); };
    $('btn-add-bot').onclick = () => this.net.send({ t: 'addBot', diff: 'normal' });
    $('btn-add-bot-easy').onclick = () => this.net.send({ t: 'addBot', diff: 'easy' });
    $('btn-add-bot-impossible').onclick = () => this.net.send({ t: 'addBot', diff: 'impossible' });
    $('menu-diff').value = this.settings.diff || 'normal'; $('menu-diff').onchange = () => { this.settings.diff = $('menu-diff').value; this.save(); };
    $('btn-add-bot-hard').onclick = () => this.net.send({ t: 'addBot', diff: 'hard' });
    $('btn-ready').onclick = () => { const me = this.lobby && this.lobby.slots.find(s => s.id === this.myId); if (me) this.net.send({ t: 'set', ready: !me.ready }); };
    $('btn-start').onclick = () => this.net.send({ t: 'start' });
    const chat = $('lobby-chat-input'); chat.addEventListener('keydown', e => { if (e.key === 'Enter' && chat.value.trim()) { this.net.send({ t: 'chat', text: chat.value.trim() }); chat.value = ''; } });
    // settings
    const bindVol = (id, key, fn) => { const el = $(id); el.value = this.settings[key]; el.oninput = () => { this.settings[key] = +el.value; fn(+el.value / 100); this.save(); const other = $(id.endsWith('2') ? id.slice(0, -1) : id + '2'); if (other) other.value = el.value; }; };
    bindVol('vol-music', 'music', v => this.audio.setMusicVol(v)); bindVol('vol-music2', 'music', v => this.audio.setMusicVol(v));
    bindVol('vol-sfx', 'sfx', v => this.audio.setSfxVol(v)); bindVol('vol-sfx2', 'sfx', v => this.audio.setSfxVol(v));
    this.audio.musicVol = this.settings.music / 100; this.audio.sfxVol = this.settings.sfx / 100;
    $('scroll-speed').value = this.settings.scroll; $('scroll-speed').oninput = () => { this.settings.scroll = +$('scroll-speed').value; this.applySettings(); this.save(); };
    $('opt-edge').checked = this.settings.edge; $('opt-edge').onchange = () => { this.settings.edge = $('opt-edge').checked; this.applySettings(); this.save(); };
    $('opt-hp').checked = this.settings.hp; $('opt-hp').onchange = () => { this.settings.hp = $('opt-hp').checked; this.applySettings(); this.save(); };
    this.applySettings();
  }
  applySettings() { this.game.settings.scrollSpeed = this.settings.scroll; this.game.settings.edgeScroll = this.settings.edge; this.game.settings.showHp = this.settings.hp; }
  renderEraCards(container, selected, onPick, small = false) {
    container.innerHTML = '';
    for (const id of ERA_ORDER) {
      const e = ERAS[id]; const d = document.createElement('div'); d.className = 'era-card' + (id === selected ? ' selected' : '') + (e.available ? '' : ' locked');
      d.innerHTML = `<div class="era-name">${e.name}</div><div class="era-year">${e.year}</div><div class="era-tag">${e.tagline}</div>${e.available ? '' : '<div class="lock">ROADMAP</div>'}`;
      if (e.available && onPick) d.onclick = () => onPick(id);
      container.appendChild(d);
    }
  }

  // ---------- net ----------
  bindNet() {
    const n = this.net;
    n.on('status', s => { const el = $('conn-status'); if (s.state === 'open') { el.textContent = 'Připojeno k serveru ' + s.url.replace(/^ws:\/\//, ''); el.className = 'conn-status ok'; if (this.settings.name) n.send({ t: 'hello', name: this.settings.name }); } else if (s.state === 'closed' || s.state === 'error') { el.textContent = 'Server nedostupný – zkouším znovu…'; el.className = 'conn-status err'; if (this.screen === 'lobby' || this.screen === 'browser') { this.show('menu'); this.lobby = null; } if (this.screen === 'game') this.toast('Spojení se serverem bylo přerušeno.'); } else { el.textContent = 'Připojuji se…'; el.className = 'conn-status'; } });
    n.on('welcome', m => { this.myId = m.id; });
    n.on('error', m => this.toast(m.msg));
    n.on('lobbies', m => this.renderServerList(m.list));
    n.on('lobby', m => { this.lobby = m.lobby; if (this.screen !== 'lobby' && this.screen !== 'game') { this.show('lobby'); $('lobby-chat').innerHTML = ''; } this.renderLobby(); if (this.quick && m.lobby.hostId === this.myId) { this.quick = false; if (m.lobby.slots.length < 2) n.send({ t: 'addBot', diff: this.settings.diff || 'normal' }); } });
    n.on('lobbyLeft', () => { this.lobby = null; if (this.screen === 'game') this.leaveGame(true); else this.show('menu'); });
    n.on('chat', m => { if (this.screen === 'game') this.ui.chat(m.from, m.text, m.sys, m.color); else { const c = $('lobby-chat'); const d = document.createElement('div'); if (m.sys) { d.className = 'sys'; d.textContent = m.text; } else { d.innerHTML = `<b style="color:${m.color !== undefined ? TEAM_COLORS[m.color].hex : '#f1d36a'}">${esc(m.from)}:</b> ${esc(m.text)}`; } c.appendChild(d); c.scrollTop = c.scrollHeight; } });
    n.on('start', m => { this.show('game'); this.game.start(m); });
    n.on('full', m => this.game.onFull(m));
    n.on('snap', m => this.game.onSnap(m));
    n.on('wallPreview', m => this.game.onWallPreview(m));
  }
  renderServerList(list) {
    const tb = $('server-list'); tb.innerHTML = ''; $('server-empty').classList.toggle('hidden', list.length > 0);
    for (const l of list) {
      const tr = document.createElement('tr');
      const state = l.state === 'lobby' ? 'Čeká na hráče' : (l.state === 'game' ? `Probíhá (${Math.floor(l.tick / 20 / 60)} min)` : 'Dohráno');
      tr.innerHTML = `<td>${esc(l.name)}</td><td>${esc(l.host)}</td><td>${ERAS[l.era].name}</td><td>${l.players}/${l.max}</td><td>${state}</td><td></td>`;
      const b = document.createElement('button'); b.textContent = 'Připojit'; b.disabled = l.state !== 'lobby' || l.players >= l.max; b.onclick = () => this.net.send({ t: 'join', id: l.id }); tr.lastElementChild.appendChild(b); tb.appendChild(tr);
    }
  }
  renderLobby() {
    const l = this.lobby; if (!l) return;
    const isHost = l.hostId === this.myId; const era = ERAS[l.era];
    $('lobby-title').textContent = `${l.name} · ${era.name}`;
    this.renderEraCards($('lobby-eras'), l.era, isHost ? e => this.net.send({ t: 'setEra', era: e }) : null, true);
    $('lobby-era-desc').textContent = `${era.tagline} Suroviny: ${era.resources.p.name} (${era.nodes.mine.name}) a ${era.resources.s.name} (${era.nodes.secondary.name}).`;
    const tb = $('slot-list'); tb.innerHTML = '';
    l.slots.forEach((s, idx) => {
      const tr = document.createElement('tr'); const mine = s.id === this.myId; const editable = mine || (isHost && s.isAI);
      const tdName = document.createElement('td'); tdName.innerHTML = `${esc(s.name)}${s.id === l.hostId ? '<span class="host-tag">HOST</span>' : ''}${s.isAI ? ` <span class="host-tag" style="color:#9b8a6a">AI ${{ easy: 'lehká', hard: 'těžká', impossible: 'nemožná' }[s.diff] || 'střední'}</span>` : ''}`; tr.appendChild(tdName);
      const tdF = document.createElement('td'); const sel = document.createElement('select'); for (const f of era.factions) { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; if (f.id === s.faction) o.selected = true; sel.appendChild(o); } sel.disabled = !editable; sel.onchange = () => this.net.send(mine ? { t: 'set', faction: sel.value } : { t: 'setSlot', slot: idx, faction: sel.value }); tdF.appendChild(sel); tr.appendChild(tdF);
      const tdT = document.createElement('td'); const selT = document.createElement('select'); for (let i = 0; i < MAX_PLAYERS; i++) { const o = document.createElement('option'); o.value = i; o.textContent = 'Tým ' + (i + 1); if (i === s.team) o.selected = true; selT.appendChild(o); } selT.disabled = !editable; selT.onchange = () => this.net.send(mine ? { t: 'set', team: +selT.value } : { t: 'setSlot', slot: idx, team: +selT.value }); tdT.appendChild(selT); tr.appendChild(tdT);
      const tdC = document.createElement('td'); const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.background = TEAM_COLORS[s.color].hex; dot.title = TEAM_COLORS[s.color].name + (editable ? ' – klik změní' : ''); if (editable) dot.onclick = () => { let c = (s.color + 1) % TEAM_COLORS.length; while (l.slots.some(o => o !== s && o.color === c)) c = (c + 1) % TEAM_COLORS.length; this.net.send(mine ? { t: 'set', color: c } : { t: 'setSlot', slot: idx, color: c }); }; tdC.appendChild(dot); tr.appendChild(tdC);
      const tdS = document.createElement('td'); tdS.innerHTML = s.isAI ? '<span class="ready">Bot</span>' : (s.ready || s.id === l.hostId ? '<span class="ready">Připraven</span>' : '<span class="notready">Čeká…</span>'); tr.appendChild(tdS);
      const tdK = document.createElement('td'); if (isHost && !mine) { const b = document.createElement('button'); b.textContent = '✕'; b.title = 'Vyhodit'; b.onclick = () => this.net.send({ t: 'kick', slot: idx }); tdK.appendChild(b); } tr.appendChild(tdK);
      tb.appendChild(tr);
    });
    const me = l.slots.find(s => s.id === this.myId);
    $('btn-start').classList.toggle('hidden', !isHost); $('btn-ready').classList.toggle('hidden', isHost); $('btn-ready').textContent = me && me.ready ? 'Zrušit připravenost' : 'Připraven';
    $('btn-add-bot').classList.toggle('hidden', !isHost); $('btn-add-bot-hard').classList.toggle('hidden', !isHost); $('btn-add-bot-easy').classList.toggle('hidden', !isHost); $('btn-add-bot-impossible').classList.toggle('hidden', !isHost);
    const f = me && era.factions.find(x => x.id === me.faction); $('faction-desc').textContent = f ? `${f.name}: ${f.desc}` : '';
  }
  leaveGame(silent = false) {
    this.game.stop(); if (!silent) this.net.send({ t: 'leave' }); this.lobby = null; this.ui.togglePause(false); this.show('menu'); this.net.send({ t: 'list' });
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

window.app = new App();
