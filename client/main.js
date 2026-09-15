// App: menus, lobby, connection, and game orchestration.
import { ERAS, ERA_ORDER, TEAM_COLORS, MAX_PLAYERS, makeTechTable, RESEARCH } from '../shared/data.js';
import { unitPortrait, buildingPortrait } from './render/sprites.js';
import { generateMap, MAP_STYLES, MAP_SIZES } from '../shared/mapgen.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Renderer } from './render/renderer.js';

const $ = id => document.getElementById(id);
const screens = ['menu', 'browser', 'host', 'lobby', 'settings', 'game', 'codex', 'saves'];

class App {
  constructor() {
    this.settings = Object.assign({ name: '', music: 40, sfx: 80, scroll: 60, edge: true, hp: false }, JSON.parse(localStorage.getItem('aow-settings') || '{}'));
    this.net = new Net(); this.audio = new Audio(); this.ui = new UI(this);
    this.game = new Game($('game'), this.net, this.audio, this.ui);
    this.lobby = null; this.myId = 0; this.hostEra = 'antiquity'; this.quick = false;
    this.bindMenus(); this.bindNet(); this.startBackground();
    this.show('menu');
    this.net.connect();
    const wake = () => { this.audio.init(); this.menuMusic(); };
    document.addEventListener('pointerdown', wake, { once: false });
    document.addEventListener('keydown', wake, { once: true });
  }
  save() { localStorage.setItem('aow-settings', JSON.stringify(this.settings)); }
  menuMusic() { if (this.screen === 'game' || !this.audio.ctx) return; const era = ERAS[this.hostEra] || ERAS.antiquity; if (!this.audio.running || this.audio.style !== era.music) { this.audio.era = this.hostEra; this.audio.setIntensity(0); this.audio.startMusic(era.music); } }
  show(name) { for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name); $('bg').style.display = name === 'game' ? 'none' : 'block'; this.screen = name; if (name === 'game') this.game.renderer.resize(); }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), 3500); }
  token() { if (!this.settings.token) { this.settings.token = Math.random().toString(36).slice(2) + Date.now().toString(36); this.save(); } return this.settings.token; }
  name() { const n = $('name').value.trim(); if (!n) { $('name').focus(); this.toast('Zadej svoje jméno.'); return null; } this.settings.name = n; this.save(); this.net.send({ t: 'hello', name: n, token: this.token() }); return n; }

  // ---------- menu background ----------
  startBackground() {
    const canvas = $('bg');
    const stub = { ents: new Map(), selection: new Set(), players: [], myTeam: -1, me: -1, unitDef: () => null, buildingDef: () => null, tickNow: () => 0, tech: { buildings: {} } };
    const r = new Renderer(canvas, stub); this.bgRenderer = r;
    this.setBgEra = era => {
      const seed = (Math.random() * 1e9) | 0; const map = generateMap(seed, 64, 2, 'continent');
      stub.ents.clear(); let id = 1;
      for (const t of map.trees) stub.ents.set(id, { i: id++, k: 't', x: t.tx + 0.5, y: t.ty + 0.5, tx: t.tx, ty: t.ty, v: t.v });
      for (const m of map.mines) stub.ents.set(id, { i: id++, k: 'm', x: m.tx, y: m.ty, tx: m.tx - 1, ty: m.ty - 1 });
      r.setMap(map, era); r.explored.fill(1); r.visible.fill(1); r.updateFog = () => {}; r.fogCtx.clearRect(0, 0, r.fw, r.fh); r.clouds = null;
      document.body.className = 'era-' + era;
    };
    this.setBgEra(this.settings.era || 'antiquity');
    r.cam.zoom = 1.1; let t0 = performance.now(); let a = 0;
    const loop = t => { if (this.screen !== 'game') { const dt = Math.min(0.05, (t - t0) / 1000); a += dt * 0.05; r.cam.x = 32 + Math.cos(a) * 14; r.cam.y = 32 + Math.sin(a * 0.7) * 14; if (canvas.clientWidth !== r.W || canvas.clientHeight !== r.H) r.resize(); r.draw(dt, { mouse: { x: 0, y: 0 } }); const ctx = r.ctx; ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); ctx.fillStyle = 'rgba(8,6,4,0.35)'; ctx.fillRect(0, 0, r.W, r.H); } t0 = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- menus ----------
  bindMenus() {
    $('name').value = this.settings.name;
    this.hostEra = this.settings.era || 'antiquity';
    const pickEra = e => { this.hostEra = e; this.settings.era = e; this.save(); this.renderEraCards($('menu-eras'), e, pickEra, true); if (this.setBgEra) this.setBgEra(e); this.menuMusic(); };
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
    this.codexEra = this.settings.era || 'antiquity'; this.codexTab = 'units';
    $('btn-codex').onclick = () => { this.show('codex'); this.renderCodex(); };
    $('btn-codex-back').onclick = () => this.show('menu');
    $('btn-load').onclick = () => { if (!this.name()) return; this.show('saves'); this.net.send({ t: 'saves' }); };
    $('btn-saves-back').onclick = () => this.show('menu');
    $('btn-save').onclick = () => { const name = prompt('Název uložené hry:', `${ERAS[this.game.era].name} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`); if (name === null) return; this.net.send({ t: 'save', name }); };
    for (const b of document.querySelectorAll('.codex-tab')) b.onclick = () => { this.codexTab = b.dataset.tab; this.renderCodex(); };
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
    bindVol('vol-music', 'music', () => this.applySettings()); bindVol('vol-music2', 'music', () => this.applySettings());
    bindVol('vol-sfx', 'sfx', v => this.audio.setSfxVol(v)); bindVol('vol-sfx2', 'sfx', v => this.audio.setSfxVol(v));
    this.audio.musicVol = this.settings.music / 100; this.audio.sfxVol = this.settings.sfx / 100;
    for (const suf of ['', '2']) {
      const ss = $('scroll-speed' + suf), oe = $('opt-edge' + suf), oh = $('opt-hp' + suf);
      ss.oninput = () => { this.settings.scroll = +ss.value; this.applySettings(); this.save(); };
      oe.onchange = () => { this.settings.edge = oe.checked; this.applySettings(); this.save(); };
      oh.onchange = () => { this.settings.hp = oh.checked; this.applySettings(); this.save(); };
    }
    $('opt-mute2').onchange = () => this.setMuted($('opt-mute2').checked);
    $('game-speed').onchange = () => this.net.send({ t: 'speed', v: +$('game-speed').value });
    $('btn-mute').onclick = () => this.setMuted(!this.settings.muted);
    this.applySettings();
  }
  setMuted(m) { this.settings.muted = m; this.save(); this.applySettings(); this.audio.sfx('click'); }
  applySettings() {
    this.game.settings.scrollSpeed = this.settings.scroll; this.game.settings.edgeScroll = this.settings.edge; this.game.settings.showHp = this.settings.hp;
    for (const suf of ['', '2']) { $('scroll-speed' + suf).value = this.settings.scroll; $('opt-edge' + suf).checked = this.settings.edge; $('opt-hp' + suf).checked = this.settings.hp; }
    $('opt-mute2').checked = !!this.settings.muted; $('mute-x').classList.toggle('hidden', !this.settings.muted); $('btn-mute').classList.toggle('muted', !!this.settings.muted);
    this.audio.setMusicVol(this.settings.muted ? 0 : this.settings.music / 100);
  }
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
    n.on('status', s => { const el = $('conn-status'); if (s.state === 'open') { el.textContent = 'Připojeno k serveru ' + s.url.replace(/^ws:\/\//, ''); el.className = 'conn-status ok'; n.send({ t: 'hello', name: this.settings.name || 'Hráč', token: this.token() }); } else if (s.state === 'closed' || s.state === 'error') { el.textContent = 'Server nedostupný – zkouším znovu…'; el.className = 'conn-status err'; if (this.screen === 'lobby' || this.screen === 'browser') { this.show('menu'); this.lobby = null; } if (this.screen === 'game') this.toast('Spojení se serverem bylo přerušeno.'); } else { el.textContent = 'Připojuji se…'; el.className = 'conn-status'; } });
    n.on('welcome', m => { this.myId = m.id; });
    n.on('error', m => this.toast(m.msg));
    n.on('lobbies', m => this.renderServerList(m.list));
    n.on('lobby', m => { this.lobby = m.lobby; if (this.screen !== 'lobby' && this.screen !== 'game') { this.show('lobby'); $('lobby-chat').innerHTML = ''; } this.renderLobby(); if (this.quick && m.lobby.hostId === this.myId) { this.quick = false; if (m.lobby.slots.length < 2) n.send({ t: 'addBot', diff: this.settings.diff || 'normal' }); } });
    n.on('lobbyLeft', () => { this.lobby = null; if (this.screen === 'game') this.leaveGame(true); else this.show('menu'); });
    n.on('chat', m => { if (this.screen === 'game') this.ui.chat(m.from, m.text, m.sys, m.color); else { const c = $('lobby-chat'); const d = document.createElement('div'); if (m.sys) { d.className = 'sys'; d.textContent = m.text; } else { d.innerHTML = `<b style="color:${m.color !== undefined ? TEAM_COLORS[m.color].hex : '#f1d36a'}">${esc(m.from)}:</b> ${esc(m.text)}`; } c.appendChild(d); c.scrollTop = c.scrollHeight; } });
    n.on('start', m => { clearTimeout(this.toastT); $('toast').classList.add('hidden'); this.show('game'); $('game-speed').value = '1'; this.game.start(m); });
    n.on('speed', m => { $('game-speed').value = String(m.v); this.ui.alert(`Rychlost hry: ${m.v}×`, false); });
    n.on('full', m => this.game.onFull(m));
    n.on('snap', m => this.game.onSnap(m));
    n.on('wallPreview', m => this.game.onWallPreview(m));
    n.on('paused', m => this.ui.setPaused(!!m.v));
    n.on('saved', m => { this.ui.alert(`Hra uložena jako „${m.name}".`, false); this.audio.sfx('buildingDone', 0.6); });
    n.on('saves', m => this.renderSaves(m.list));
    n.on('countdown', m => { let n2 = m.n; const btn = $('btn-start'); const tick = () => { if (this.screen !== 'lobby') return; this.toast(`Hra začíná za ${n2}…`); this.audio.sfx('click', 0.5); if (--n2 > 0) setTimeout(tick, 1000); }; tick(); btn.disabled = true; setTimeout(() => { btn.disabled = false; }, m.n * 1000 + 500); });
    n.on('mping', m => { if (this.screen !== 'game') return; this.ui.minimapPing(m.x, m.y); this.game.renderer.addEffect({ kind: 'ring', x: m.x, y: m.y, color: 'rgba(255,230,90,0.9)' }); this.game.lastAlert = { x: m.x, y: m.y, t: performance.now() }; this.ui.alert(`${m.from} označil místo na mapě (Space = kamera)`, false); this.audio.sfx('select', 0.6); });
  }
  renderCodex() {
    const era = this.codexEra; const e = ERAS[era]; const tech = makeTechTable(era, e.factions[0].id);
    this.renderEraCards($('codex-eras'), era, id => { this.codexEra = id; this.renderCodex(); }, true);
    for (const b of document.querySelectorAll('.codex-tab')) b.classList.toggle('active', b.dataset.tab === this.codexTab);
    const body = $('codex-body'); body.innerHTML = '';
    const ROLE = { infantry: 'pěchota', ranged: 'střelci', cavalry: 'jezdectvo/vozidla', siege: 'obléhací', ship: 'lodě', building: 'budovy', wall: 'hradby', worker: 'dělníci', support: 'podpora' };
    const card = (canvas, title, sub, rows, desc) => { const d = document.createElement('div'); d.className = 'codex-card'; d.appendChild(canvas); const t = document.createElement('div'); t.className = 'codex-info'; t.innerHTML = `<div class="codex-title">${title}</div><div class="codex-sub">${sub}</div><div class="codex-rows">${rows.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</div>${desc ? `<div class="codex-desc">${desc}</div>` : ''}`; d.appendChild(t); body.appendChild(d); };
    if (this.codexTab === 'units') {
      for (const [k, u] of Object.entries(tech.units)) {
        const bon = Object.entries(u.bonus || {}).filter(([, v]) => v > 1).map(([r, v]) => `${ROLE[r] || r} ×${v}`).join(', ');
        const unlock = u.creep ? 'neutrální hlídač dolů (nelze cvičit)' : k === 'worker' || ['infantry', 'ranged', 'cavalry', 'siege', 'ship', 'transport'].includes(k) ? `${tech.buildings[u.building]?.name}` : (() => { for (const [bk, b] of Object.entries(tech.buildings)) for (const up of b.upgrades || []) if (up.unlocks.includes(k)) return `${b.name} úroveň ${up.level}`; return '?'; })();
        card(unitPortrait(u.sprite, 0, 88, { faction: e.factions[0].id }), u.name, `${ROLE[u.role]} · ${unlock}${u.unique ? ' · hrdina' : ''}`, [['HP', u.hp], ...(u.heal ? [['Léčení', u.heal.amount + ' HP/s']] : [['Útok', u.dmg]]), ['Pancíř', u.armor], ...(u.heal || u.capacity ? [] : [['Dosah', u.range >= 1 ? u.range.toFixed(1) : 'blízko']]), ...(u.capacity ? [['Kapacita', u.capacity + ' jednotek']] : []), ['Rychlost', u.speed.toFixed(1)], ['Cena', `${u.cost.p} ${e.resources.p.short} / ${u.cost.s} ${e.resources.s.short}`], ['Populace', u.pop], ['Výcvik', Math.round(u.trainTime) + ' s']], (u.desc || '') + (u.heal ? ` Léčí ${u.heal.amount} HP/s v okruhu ${u.heal.range}.` : '') + (bon ? ` Bonus proti: ${bon}.` : '') + (u.aura ? ` Aura +${Math.round((u.aura.dmg - 1) * 100)} % útok v okruhu ${u.aura.range}.` : '') + (u.ability ? ` Schopnost: ${u.ability.name} – ${u.ability.desc}` : ''));
      }
    } else if (this.codexTab === 'buildings') {
      for (const [k, b] of Object.entries(tech.buildings)) {
        if (k === 'gate') continue;
        const ups = (b.upgrades || []).map(up => `úroveň ${up.level}: ${up.cost.p}/${up.cost.s}${up.unlocks.length ? ' → ' + up.unlocks.map(u => tech.units[u]?.name).join(', ') : ''}${up.desc ? ' – ' + up.desc : ''}${up.popCap ? ` +${up.popCap} pop` : ''}`).join('; ');
        card(buildingPortrait(b.sprite, b.w, b.h, 0, 88, era), b.name, `${b.w}×${b.h}${b.trains.length ? ' · cvičí: ' + b.trains.map(u => tech.units[u]?.name).join(', ') : ''}`, [['HP', b.hp], ['Pancíř', b.armor], ['Cena', `${b.cost.p} ${e.resources.p.short} / ${b.cost.s} ${e.resources.s.short}`], ['Stavba', b.buildTime + ' s'], ...(b.attack ? [['Útok', b.attack.dmg], ['Dosah', b.attack.range]] : []), ...(b.popCap ? [['Populace', '+' + b.popCap]] : [])], (b.desc || '') + (ups ? ` Vylepšení – ${ups}.` : ''));
      }
    } else {
      for (const f of e.factions) { const d = document.createElement('div'); d.className = 'codex-card codex-faction'; d.innerHTML = `<div class="codex-info"><div class="codex-title">${f.name}</div><div class="codex-sub">Vůdce: ${f.leader || '–'}</div><div class="codex-desc">${f.desc}</div><div class="codex-desc">Jednotky: ${Object.entries(f.unitNames || {}).map(([, n]) => n).join(', ')}</div></div>`; body.appendChild(d); }
      for (const [rid, rd] of Object.entries(RESEARCH)) { const d = document.createElement('div'); d.className = 'codex-card codex-faction'; d.innerHTML = `<div class="codex-info"><div class="codex-title">${rd.names[era]}</div><div class="codex-sub">${tech.buildings[rd.building]?.name} · ${rd.maxLevel} úrovně · ${rd.cost.p}/${rd.cost.s} × úroveň · ${rd.time} s</div><div class="codex-desc">${rd.desc}</div></div>`; body.appendChild(d); }
    }
  }
  drawMapPreview(style, sizeKey, era) {
    const key = style + '|' + sizeKey + '|' + era; if (this.previewKey === key) return; this.previewKey = key;
    const c = $('map-preview'); const ctx = c.getContext('2d'); const size = (MAP_SIZES[sizeKey] || MAP_SIZES.medium).size;
    const map = generateMap(4242, size, 4, style); const pal = ERAS[era].palette;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) { const t = map.tiles[i]; let col; switch (t) { case 0: col = pal.grass; break; case 1: col = pal.dirt; break; case 2: col = pal.sand; break; case 3: col = pal.water.map((v, k) => v * 0.7 + pal.sand[k] * 0.3); break; case 4: col = pal.deep; break; default: col = pal.rock; } const k = 0.8 + (map.height[i] - 0.5) * 0.5; img.data[i * 4] = col[0] * k; img.data[i * 4 + 1] = col[1] * k; img.data[i * 4 + 2] = col[2] * k; img.data[i * 4 + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = size; tmp.height = size; tmp.getContext('2d').putImageData(img, 0, 0);
    const tc = tmp.getContext('2d'); tc.fillStyle = '#1e4d22'; for (const t of map.trees) tc.fillRect(t.tx, t.ty, 1, 1); tc.fillStyle = '#f2c94c'; for (const m of map.mines) tc.fillRect(m.tx - 1, m.ty - 1, 2, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); const s = c.width / (2 * size); ctx.setTransform(s, s, -s, s, c.width / 2, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0);
    map.spawns.forEach((sp, i) => { ctx.fillStyle = TEAM_COLORS[i].hex; ctx.fillRect(sp.x - 2, sp.y - 2, 4, 4); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  renderSaves(list) {
    const tb = $('saves-list'); tb.innerHTML = ''; $('saves-empty').classList.toggle('hidden', list.length > 0);
    for (const s of list) {
      const tr = document.createElement('tr'); const t = Math.floor((s.tick || 0) / 20); const when = new Date(s.time);
      tr.innerHTML = `<td>${s.name === 'autosave' ? '<i>Automatické uložení</i>' : esc(s.name)}</td><td>${ERAS[s.era]?.name || '?'}</td><td>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</td><td>${when.toLocaleDateString('cs-CZ')} ${when.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</td><td></td>`;
      const b = document.createElement('button'); b.textContent = 'Načíst'; b.onclick = () => this.net.send({ t: 'load', name: s.name }); tr.lastElementChild.appendChild(b);
      const d = document.createElement('button'); d.textContent = 'Smazat'; d.className = 'secondary'; d.onclick = () => { if (confirm(`Smazat uloženou hru „${s.name}“?`)) this.net.send({ t: 'deleteSave', name: s.name }); }; tr.lastElementChild.appendChild(d); tb.appendChild(tr);
    }
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
    if (this.bgEra !== l.era && this.setBgEra) { this.bgEra = l.era; this.setBgEra(l.era); }
    $('lobby-title').textContent = `${l.name} · ${era.name}`;
    this.drawMapPreview(l.mapStyle || 'continent', l.mapSize || 'medium', l.era);
    this.renderEraCards($('lobby-eras'), l.era, isHost ? e => this.net.send({ t: 'setEra', era: e }) : null, true);
    $('lobby-era-desc').textContent = `${era.tagline} Suroviny: ${era.resources.p.name} (${era.nodes.mine.name}) a ${era.resources.s.name} (${era.nodes.secondary.name}).`;
    const ms = $('map-style'), mz = $('map-size');
    if (!ms.options.length) { for (const [k, v] of Object.entries(MAP_STYLES)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; ms.appendChild(o); } for (const [k, v] of Object.entries(MAP_SIZES)) { const o = document.createElement('option'); o.value = k; o.textContent = `${v.name} (${v.size}×${v.size})`; mz.appendChild(o); } ms.onchange = () => this.net.send({ t: 'setMap', style: ms.value }); mz.onchange = () => this.net.send({ t: 'setMap', size: mz.value }); }
    ms.value = l.mapStyle || 'continent'; mz.value = l.mapSize || 'medium'; ms.disabled = !isHost; mz.disabled = !isHost;
    const mr = $('map-res'), mv = $('map-reveal');
    if (!mr.dataset.wired) { mr.dataset.wired = '1'; mr.onchange = () => this.net.send({ t: 'setMap', startRes: mr.value }); mv.onchange = () => this.net.send({ t: 'setMap', reveal: mv.checked }); }
    mr.value = l.startRes || 'normal'; mv.checked = !!l.reveal; mr.disabled = !isHost; mv.disabled = !isHost;
    const sd = $('map-seed'); if (!sd.dataset.wired) { sd.dataset.wired = '1'; sd.onchange = () => this.net.send({ t: 'setMap', seed: sd.value }); }
    if (document.activeElement !== sd) sd.value = l.seedText || ''; sd.disabled = !isHost;
    $('map-desc').textContent = (MAP_STYLES[l.mapStyle] || MAP_STYLES.continent).desc + ' Vzdálené doly hlídají neutrální jednotky.';
    const tb = $('slot-list'); tb.innerHTML = '';
    l.slots.forEach((s, idx) => {
      const tr = document.createElement('tr'); const mine = s.id === this.myId; const editable = mine || (isHost && s.isAI);
      const tdName = document.createElement('td'); tdName.innerHTML = `${esc(s.name)}${s.id === l.hostId ? '<span class="host-tag">HOST</span>' : ''}`;
      if (s.isAI) { const sd = document.createElement('select'); sd.className = 'diff-sel'; for (const [v, t] of [['easy', 'AI lehká'], ['normal', 'AI střední'], ['hard', 'AI těžká'], ['impossible', 'AI nemožná']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; if ((s.diff || 'normal') === v) o.selected = true; sd.appendChild(o); } sd.disabled = !isHost; sd.onchange = () => this.net.send({ t: 'setSlot', slot: idx, diff: sd.value }); tdName.appendChild(sd); }
      tr.appendChild(tdName);
      const tdF = document.createElement('td'); const sel = document.createElement('select'); for (const f of [...era.factions, { id: 'random', name: 'Náhodná' }]) { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; if (f.id === s.faction) o.selected = true; sel.appendChild(o); } sel.disabled = !editable; sel.onchange = () => this.net.send(mine ? { t: 'set', faction: sel.value } : { t: 'setSlot', slot: idx, faction: sel.value }); tdF.appendChild(sel); tr.appendChild(tdF);
      const tdT = document.createElement('td'); const selT = document.createElement('select'); for (let i = 0; i < MAX_PLAYERS; i++) { const o = document.createElement('option'); o.value = i; o.textContent = 'Tým ' + (i + 1); if (i === s.team) o.selected = true; selT.appendChild(o); } selT.disabled = !editable; selT.onchange = () => this.net.send(mine ? { t: 'set', team: +selT.value } : { t: 'setSlot', slot: idx, team: +selT.value }); tdT.appendChild(selT); tr.appendChild(tdT);
      const tdC = document.createElement('td'); const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.background = TEAM_COLORS[s.color].hex; dot.title = TEAM_COLORS[s.color].name + (editable ? ' – klik změní' : ''); if (editable) dot.onclick = () => { let c = (s.color + 1) % TEAM_COLORS.length; while (l.slots.some(o => o !== s && o.color === c)) c = (c + 1) % TEAM_COLORS.length; this.net.send(mine ? { t: 'set', color: c } : { t: 'setSlot', slot: idx, color: c }); }; tdC.appendChild(dot); tr.appendChild(tdC);
      const tdS = document.createElement('td'); tdS.innerHTML = s.isAI ? '<span class="ready">Bot</span>' : (s.ready || s.id === l.hostId ? '<span class="ready">Připraven</span>' : '<span class="notready">Čeká…</span>'); tr.appendChild(tdS);
      const tdK = document.createElement('td'); if (isHost && !mine) { const b = document.createElement('button'); b.textContent = '✕'; b.title = 'Vyhodit'; b.onclick = () => this.net.send({ t: 'kick', slot: idx }); tdK.appendChild(b); } tr.appendChild(tdK);
      tb.appendChild(tr);
    });
    const me = l.slots.find(s => s.id === this.myId);
    $('btn-start').classList.toggle('hidden', !isHost); $('btn-ready').classList.toggle('hidden', isHost); $('btn-ready').textContent = me && me.ready ? 'Zrušit připravenost' : 'Připraven';
    $('btn-add-bot').classList.toggle('hidden', !isHost); $('btn-add-bot-hard').classList.toggle('hidden', !isHost); $('btn-add-bot-easy').classList.toggle('hidden', !isHost); $('btn-add-bot-impossible').classList.toggle('hidden', !isHost);
    const f = me && era.factions.find(x => x.id === me.faction); $('faction-desc').textContent = f ? `${f.name}: ${f.desc}` : (me && me.faction === 'random' ? 'Náhodná frakce se vylosuje při startu hry.' : '');
  }
  leaveGame(silent = false) {
    this.game.stop(); if (!silent) this.net.send({ t: 'leave' }); this.lobby = null; $('pause-menu').classList.add('hidden'); this.show('menu'); this.net.send({ t: 'list' }); this.menuMusic();
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

window.addEventListener('error', e => { console.error(e.error || e.message); if (window.app) window.app.toast('Chyba: ' + (e.message || 'neznámá').slice(0, 120)); });
window.app = new App();
