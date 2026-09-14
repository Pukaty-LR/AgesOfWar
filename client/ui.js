// In-game HUD: resources, minimap, selection panel, command card, alerts, chat, end screen.
import { TEAM_COLORS, T, ERAS, RESEARCH } from '../shared/data.js';
import { unitPortrait, buildingPortrait, actionIcon, TW, TH } from './render/sprites.js';

const $ = id => document.getElementById(id);
const svgUri = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const RES_SVG = {
  gold: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><radialGradient id="g" cx="35%" cy="35%"><stop offset="0" stop-color="#fff3b8"/><stop offset=".5" stop-color="#e8b93a"/><stop offset="1" stop-color="#8a5f0e"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#g)" stroke="#3a2708" stroke-width="1.2"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#7a5410" stroke-width="1"/><path d="M12 8v8M9.5 10.5c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.6-2.5 1.6 1 1.6 2.5 1.6 2.5-.6 2.5-1.6" fill="none" stroke="#5a3d0a" stroke-width="1.3" stroke-linecap="round"/></svg>',
  wood: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 8h13a3 3 0 0 1 0 6H4z" fill="#a7743a" stroke="#3a2408" stroke-width="1.2"/><ellipse cx="4" cy="11" rx="2.2" ry="3" fill="#e0b67a" stroke="#3a2408" stroke-width="1.2"/><ellipse cx="4" cy="11" rx="1" ry="1.4" fill="none" stroke="#7a4e1c" stroke-width=".8"/><path d="M7 16h12a3 3 0 0 1 0 6H7z" fill="#8f5f2b" stroke="#3a2408" stroke-width="1.2"/><ellipse cx="7" cy="19" rx="2.2" ry="3" fill="#e0b67a" stroke="#3a2408" stroke-width="1.2"/><path d="M8 9.5h8M11 17.5h7" stroke="#6a4218" stroke-width=".8"/></svg>',
  oil: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><radialGradient id="o" cx="35%" cy="30%"><stop offset="0" stop-color="#8a8ea8"/><stop offset=".6" stop-color="#2a2a34"/><stop offset="1" stop-color="#0c0c12"/></radialGradient></defs><path d="M12 2c3 5 7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 4-8 7-13z" fill="url(#o)" stroke="#000" stroke-width="1.2"/><path d="M8.5 14.5a3.5 4 0 0 0 2.5 4" fill="none" stroke="#b0b4c8" stroke-width="1.2" stroke-linecap="round"/></svg>',
  plasma: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6fbff"/><stop offset=".5" stop-color="#5ad8ff"/><stop offset="1" stop-color="#1c6f96"/></linearGradient></defs><path d="M12 2l5 7-2 12h-6L7 9z" fill="url(#p)" stroke="#0b3040" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 2l-1.5 7 1.5 12" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/></svg>',
  spore: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 21v-8h4v8z" fill="#e6dcef" stroke="#3a2450" stroke-width="1.2"/><path d="M3 12c0-5 4-8 9-8s9 3 9 8z" fill="#c56aff" stroke="#3a2450" stroke-width="1.2"/><circle cx="8" cy="9" r="1.4" fill="#f4d9ff"/><circle cx="14" cy="7.5" r="1.2" fill="#f4d9ff"/><circle cx="17" cy="10" r="1" fill="#f4d9ff"/></svg>',
  pop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="9" cy="7" r="3.5" fill="#f0c8a0" stroke="#3a2408" stroke-width="1.2"/><path d="M3 21v-3.5a6 6 0 0 1 12 0V21z" fill="#c9a227" stroke="#3a2408" stroke-width="1.2"/><circle cx="17" cy="8" r="2.8" fill="#f0c8a0" stroke="#3a2408" stroke-width="1"/><path d="M14.5 21v-3a4.5 4.5 0 0 1 8 0v3z" fill="#a17a1a" stroke="#3a2408" stroke-width="1"/></svg>',
};
const resIcon = id => svgUri(RES_SVG[id] || RES_SVG.gold);
const STAT_SVG = {
  attack: '<svg viewBox="0 0 24 24"><path d="M4 20l11-11M14 6l4 4M5 15l4 4"/></svg>',
  armor: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  range: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M3 12h10M3 7h14M3 17h7M15 4l6 8-6 8"/></svg>',
  pop: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>',
  build: '<svg viewBox="0 0 24 24"><path d="M4 20V10l8-6 8 6v10M10 20v-6h4v6"/></svg>',
  carry: '<svg viewBox="0 0 24 24"><path d="M5 9h14l-1.5 11h-11z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 8l7-5 7 5M7 14l5 7 5-7"/></svg>',
};

export class UI {
  constructor(app) {
    this.app = app; this.dirty = true; this.selectionChanged = true; this.buildMenu = false; this.lastSig = '';
    this.mini = $('minimap'); this.miniCtx = this.mini.getContext('2d'); this.miniTerrain = null; this.pings = [];
    this.tooltip = $('tooltip'); this.lastUiAt = 0; this.portraitCache = new Map();
    this.cmdButtons = [];
    this.bindMinimap();
    $('btn-idle-worker').onclick = () => this.game && this.game.selectIdleWorker();
    $('btn-army').onclick = () => this.game && this.game.selectArmy();
    $('btn-menu-ingame').onclick = () => this.togglePause();
    $('btn-resume').onclick = () => this.togglePause(false);
    $('btn-surrender').onclick = () => this.app.leaveGame();
    $('btn-end-menu').onclick = () => this.app.leaveGame();
    $('btn-end-spectate').onclick = () => { $('endscreen').classList.add('hidden'); this.alert('Sleduješ hru dál. Menu (Esc) → Vzdát se a odejít.', false); };
    $('btn-help').onclick = () => { $('help-overlay').classList.remove('hidden'); };
    $('btn-help-close').onclick = () => { $('help-overlay').classList.add('hidden'); };
    const chat = $('chat-input');
    chat.addEventListener('keydown', e => { if (e.key === 'Enter') { const t = chat.value.trim(); if (t) this.app.net.send({ t: 'chat', text: t }); this.closeChat(); } else if (e.key === 'Escape') this.closeChat(); e.stopPropagation(); });
  }
  onGameStart(game) {
    this.game = game; this.buildMenu = false; this.lastSig = ''; this.dirty = true; this.selectionChanged = true; this.pings = [];
    $('endscreen').classList.add('hidden'); $('pause-menu').classList.add('hidden'); $('help-overlay').classList.add('hidden'); $('pause-banner').classList.add('hidden'); $('alerts').innerHTML = ''; $('chatlog').innerHTML = '';
    this.buildMiniTerrain(game);
    const era = game.eraDef; const p = game.players[game.me];
    $('game-info').textContent = `${era.name} · ${game.tech.faction.name} · ${p.name}`;
    document.body.className = 'era-' + game.era;
    $('res-p').title = era.resources.p.name; $('res-s').title = era.resources.s.name;
    $('res-p').querySelector('.ico').style.backgroundImage = resIcon(era.resources.p.id); $('res-p').querySelector('.lbl').textContent = era.resources.p.name;
    $('res-s').querySelector('.ico').style.backgroundImage = resIcon(era.resources.s.id); $('res-s').querySelector('.lbl').textContent = era.resources.s.name;
    $('res-pop').querySelector('.ico').style.backgroundImage = resIcon('pop');
    this.placementHint(null);
    setTimeout(() => { if (this.game === game && game.running) { this.alert('Cíl: znič všechny nepřátelské budovy. Pošli dělníky těžit (G / F) a stav domy pro populaci (B → E).', false); } }, 1500);
    setTimeout(() => { if (this.game === game && game.running) this.alert('Esc = menu a nápověda k ovládání · Tab = podskupina · Alt+klik = označit místo', false); }, 7000);
  }
  onPlayers(game) { this.dirty = true; }
  togglePause(force) { const el = $('pause-menu'); const show = force === undefined ? el.classList.contains('hidden') : force; el.classList.toggle('hidden', !show); if (show) { $('vol-music2').value = this.app.settings.music; $('vol-sfx2').value = this.app.settings.sfx; } if (this.game && this.game.running) this.app.net.send({ t: 'pause', v: show }); }
  setPaused(v) { $('pause-banner').classList.toggle('hidden', !v); if (this.game) this.game.paused = v; }
  openChat() { this.game.chatOpen = true; const c = $('chat-input'); c.classList.remove('hidden'); c.value = ''; c.focus(); }
  closeChat() { this.game.chatOpen = false; const c = $('chat-input'); c.classList.add('hidden'); c.blur(); }
  chat(from, text, sys = false, color) {
    const log = $('chatlog'); const d = document.createElement('div'); if (sys) { d.className = 'sys'; d.textContent = text; } else { const b = document.createElement('b'); b.textContent = from + ': '; if (color !== undefined) b.style.color = TEAM_COLORS[color].hex; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
    log.appendChild(d); while (log.children.length > 8) log.removeChild(log.firstChild);
  }
  alert(text, warn) { const a = $('alerts'); const d = document.createElement('div'); d.textContent = text; if (warn) d.className = 'warn'; a.appendChild(d); while (a.children.length > 4) a.removeChild(a.firstChild); setTimeout(() => d.remove(), 4100); }
  placementHint(text) { const h = $('placement-hint'); if (!text) h.classList.add('hidden'); else { h.textContent = text; h.classList.remove('hidden'); } }
  minimapPing(x, y) { this.pings.push({ x, y, t: performance.now() }); }
  hoverChanged(game, e) { if (!e) { this.hideTooltip(); return; } if (game.state.placing) return; const name = game.entName(e); let html = `<b>${name}</b>`; if (e.o !== undefined) html += `<div>${game.players[e.o].name}</div>`; if (e.k === 't' || e.k === 'm') html += `<div class="desc">Zbývá: ${e.a}</div>`; if (e.hp !== undefined && e.m) html += `<div class="desc">${e.hp} / ${e.m} HP</div>`; this.showTooltip(html, game.state.mouse.x + 16, game.state.mouse.y + 16); }
  showTooltip(html, x, y) { const t = this.tooltip; t.innerHTML = html; t.classList.remove('hidden'); const W = window.innerWidth, H = window.innerHeight; t.style.left = Math.min(x, W - 300) + 'px'; t.style.top = Math.min(y, H - 120) + 'px'; }
  hideTooltip() { this.tooltip.classList.add('hidden'); }

  // ---------- per-frame ----------
  frame(game, dt) {
    this.drawMinimap(game);
    const now = performance.now();
    if (this.dirty || now - this.lastUiAt > 200) { this.lastUiAt = now; this.dirty = false; this.updateTop(game); this.updateSelection(game); }
    if (game.hover && !game.state.placing && !game.state.drag) { const t = this.tooltip; if (!t.classList.contains('hidden')) { t.style.left = Math.min(game.state.mouse.x + 16, window.innerWidth - 300) + 'px'; t.style.top = Math.min(game.state.mouse.y + 16, window.innerHeight - 120) + 'px'; } }
  }
  updateTop(game) {
    const p = game.players[game.me]; if (!p) return;
    let idle = 0; for (const e of game.ents.values()) if (e.k === 'u' && e.o === game.me && e.o2 === 'idle' && game.unitDef(e).role === 'worker') idle++;
    const badge = $('idle-count'); badge.textContent = idle; badge.classList.toggle('hidden', idle === 0); $('btn-idle-worker').classList.toggle('pulse', idle > 0);
    $('res-p').querySelector('.val').textContent = p.res.p; $('res-s').querySelector('.val').textContent = p.res.s;
    let gp = 0, gs = 0; for (const e of game.ents.values()) if (e.k === 'u' && e.o === game.me && e.o2 === 'gather') { const t = game.ents.get(e.tg); if (t && t.k === 'm') gp++; else if (e.c === 'p') gp++; else gs++; }
    $('res-p').title = `${game.eraDef.resources.p.name} · těží ${gp} dělníků`; $('res-s').title = `${game.eraDef.resources.s.name} · těží ${gs} dělníků`;
    const pop = $('res-pop'); pop.querySelector('.val').textContent = `${p.pop}/${p.popCap}`; pop.classList.toggle('low', p.pop >= p.popCap);
    const s = Math.floor(game.gameTime()); $('game-clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------- minimap ----------
  buildMiniTerrain(game) {
    const m = game.map; const c = document.createElement('canvas'); c.width = m.w; c.height = m.h; const ctx = c.getContext('2d'); const img = ctx.createImageData(m.w, m.h); const pal = game.eraDef.palette;
    for (let i = 0; i < m.w * m.h; i++) { const t = m.tiles[i]; let col; switch (t) { case T.GRASS: col = pal.grass; break; case T.DIRT: col = pal.dirt; break; case T.SAND: col = pal.sand; break; case T.SHALLOW: col = pal.water.map((v, k) => v * 0.7 + pal.sand[k] * 0.3); break; case T.WATER: col = pal.deep; break; default: col = pal.rock; } const k = 0.8 + (m.height[i] - 0.5) * 0.5; img.data[i * 4] = col[0] * k; img.data[i * 4 + 1] = col[1] * k; img.data[i * 4 + 2] = col[2] * k; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); this.miniTerrain = c;
  }
  miniTransform(ctx, game) { const W = this.mini.width; const s = W / (2 * game.map.w); ctx.setTransform(s, s, -s, s, W / 2, 0); return s; }
  miniToWorld(mx, my, game) { const W = this.mini.width; const s = W / (2 * game.map.w); const ix = (mx - W / 2) / s, iy = my / s; return [(ix + iy) / 2, (iy - ix) / 2]; }
  drawMinimap(game) {
    const ctx = this.miniCtx, W = this.mini.width; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, W, W);
    if (!this.miniTerrain) return;
    const s = this.miniTransform(ctx, game); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.miniTerrain, 0, 0);
    // entities
    const R = game.renderer;
    for (const e of game.ents.values()) {
      if (e.k === 't') { if (!R.explored[(e.ty) * game.map.w + e.tx]) continue; ctx.fillStyle = '#1e4d22'; ctx.fillRect(e.tx, e.ty, 1, 1); }
      else if (e.k === 'm') { if (!R.explored[e.ty * game.map.w + e.tx]) continue; ctx.fillStyle = game.era === 'ww2' ? '#222' : '#f2c94c'; ctx.fillRect(e.tx, e.ty, 2, 2); }
    }
    for (const e of game.ents.values()) {
      if (e.k === 'b') { if (!R.isExploredTile(e.x, e.y)) continue; ctx.fillStyle = TEAM_COLORS[game.players[e.o].color].hex; ctx.fillRect(e.tx, e.ty, e.w, e.h); }
      else if (e.k === 'u') { if (e.hd) continue; const own = game.players[e.o].team === game.myTeam; if (!own && !R.isVisibleTile(e.x, e.y)) continue; ctx.fillStyle = own ? (e.o === game.me ? '#ffffff' : '#ffe680') : TEAM_COLORS[game.players[e.o].color].hex; ctx.fillRect(e.x - 0.6, e.y - 0.6, 1.2, 1.2); }
    }
    // selected units highlight
    for (const id of game.selection) { const e = game.ents.get(id); if (e && e.k === 'u') { ctx.fillStyle = '#5eff7a'; ctx.fillRect(e.x - 0.7, e.y - 0.7, 1.4, 1.4); } }
    // fog
    ctx.imageSmoothingEnabled = true; ctx.drawImage(R.fogCanvas, 0, 0, R.fw, R.fh, 0, 0, game.map.w, game.map.h);
    // pings
    const now = performance.now();
    this.pings = this.pings.filter(p => now - p.t < 4000);
    for (const p of this.pings) { const k = ((now - p.t) % 800) / 800; ctx.strokeStyle = `rgba(255,60,60,${1 - k})`; ctx.lineWidth = 1 / s; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + k * 6, 0, 7); ctx.stroke(); }
    // camera rect
    const corners = [[0, 0], [R.W, 0], [R.W, R.H], [0, R.H]].map(([x, y]) => R.screenToWorld(x, y));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2 / s; ctx.beginPath(); corners.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  bindMinimap() {
    const m = this.mini; let down = false;
    const pos = e => { const r = m.getBoundingClientRect(); return [(e.clientX - r.left) * m.width / r.width, (e.clientY - r.top) * m.height / r.height]; };
    m.addEventListener('contextmenu', e => e.preventDefault());
    m.addEventListener('mousedown', e => { if (!this.game) return; const [mx, my] = pos(e); const [wx, wy] = this.miniToWorld(mx, my, this.game); if (e.button === 0 && e.altKey) { this.game.pingMap(wx, wy); return; } if (e.button === 0) { down = true; this.game.centerOn(wx, wy); } else if (e.button === 2) { if (this.game.state.mode === 'amove') { this.game.orderAttackMove(wx, wy, null); this.game.state.mode = null; } else this.game.smartCommand(wx, wy, null); } });
    window.addEventListener('mousemove', e => { if (!down || !this.game) return; const [mx, my] = pos(e); const [wx, wy] = this.miniToWorld(mx, my, this.game); this.game.centerOn(wx, wy); });
    window.addEventListener('mouseup', () => { down = false; });
  }

  // ---------- selection panel & command card ----------
  portrait(game, e) {
    const key = e.k + '|' + e.t + '|' + game.players[e.o].color + '|' + (e.lv || 1);
    let c = this.portraitCache.get(key);
    if (!c) { c = e.k === 'u' ? unitPortrait(game.unitDef(e).sprite, game.players[e.o].color, 96, { faction: game.players[e.o].faction }) : buildingPortrait(game.buildingDef(e).sprite, e.w, e.h, game.players[e.o].color, 96, game.era, e.lv || 1); this.portraitCache.set(key, c); }
    return c;
  }
  updateSelection(game) {
    const sel = [...game.selection].map(id => game.ents.get(id)).filter(Boolean);
    const sig = sel.map(e => e.i).join(',') + '|' + this.buildMenu + '|' + game.state.mode;
    const single = $('sel-single'), multi = $('sel-multi'), empty = $('sel-empty');
    if (!sel.length) { empty.classList.remove('hidden'); single.classList.add('hidden'); multi.classList.add('hidden'); if (sig !== this.lastSig) { this.lastSig = sig; this.buildCommandCard(game, []); } return; }
    empty.classList.add('hidden');
    if (sel.length === 1) {
      const e = sel[0]; single.classList.remove('hidden'); multi.classList.add('hidden');
      const pc = $('portrait').getContext('2d'); pc.clearRect(0, 0, 96, 96);
      if (e.k === 'u' || e.k === 'b') pc.drawImage(this.portrait(game, e), 0, 0, 96, 96);
      else { pc.fillStyle = e.k === 'm' ? '#f2c94c' : '#3a7a3a'; pc.font = '48px serif'; pc.textAlign = 'center'; pc.fillText(e.k === 'm' ? '⛏' : (game.era === 'ww2' ? '⚙' : '🌲'), 48, 64); }
      $('sel-name').textContent = game.entName(e);
      const owner = $('sel-owner'); if (e.o !== undefined) { owner.textContent = game.players[e.o].name + (e.o === game.me ? ' (ty)' : ''); owner.style.color = TEAM_COLORS[game.players[e.o].color].hex; } else { owner.textContent = ''; }
      const hpEl = $('sel-hp'), hpT = $('sel-hp-text'); const hpWrap = hpEl.parentElement;
      if (e.k === 'u' || e.k === 'b') { hpWrap.style.display = ''; const f = e.hp / e.m; hpEl.style.width = (f * 100) + '%'; hpEl.style.background = f > 0.6 ? 'linear-gradient(#7fe07a,#2f9c2c)' : f > 0.3 ? 'linear-gradient(#f0d060,#c09a20)' : 'linear-gradient(#f07060,#b03020)'; hpT.textContent = `${e.hp} / ${e.m}`; }
      else { hpWrap.style.display = 'none'; }
      const st = $('sel-stats'); st.innerHTML = '';
      const stat = (icon, l, v) => { const s = document.createElement('span'); s.title = l; s.innerHTML = `${STAT_SVG[icon] || ''}${l} <b>${v}</b>`; st.appendChild(s); };
      if (e.k === 'u') { const d = game.unitDef(e); stat('attack', 'Útok', d.dmg); stat('armor', 'Pancíř', d.armor); stat('range', 'Dosah', d.range >= 1 ? d.range.toFixed(1) : 'blízko'); stat('speed', 'Rychlost', d.speed.toFixed(1)); if (e.c) stat('carry', 'Nese', e.c === 'p' ? game.eraDef.resources.p.name : game.eraDef.resources.s.name); }
      else if (e.k === 'b') { const d = game.buildingDef(e); stat('armor', 'Pancíř', d.armor); if (d.attack) { stat('attack', 'Útok', d.attack.dmg); stat('range', 'Dosah', d.attack.range); } if (d.popCap) stat('pop', 'Populace', '+' + d.popCap); if (!e.bl) stat('build', 'Stavba', Math.round(e.pr * 100) + ' %'); }
      else if (e.k === 't' || e.k === 'm') stat('left', 'Zbývá', e.a);
      const q = $('sel-queue'); q.innerHTML = '';
      if (e.k === 'b' && e.o === game.me && e.q && e.q.length) {
        e.q.forEach((qi, idx) => { const d = document.createElement('div'); d.className = 'qi'; const isUp = qi.t === '__up', isRes = qi.t === '__res'; d.title = `${isUp ? 'Vylepšení budovy' : (isRes ? 'Výzkum: ' + (RESEARCH[qi.rid]?.names[game.era] || '') : game.tech.units[qi.t].name)} – klik zruší`; const c = isUp ? buildingPortrait(game.buildingDef(e).sprite, e.w, e.h, game.players[game.me].color, 44, game.era) : (isRes ? actionIcon(RESEARCH[qi.rid] && (RESEARCH[qi.rid].dmgAdd || RESEARCH[qi.rid].dmgMul) ? 'research_atk' : 'research_arm', 44) : unitPortrait(game.tech.units[qi.t].sprite, game.players[game.me].color, 44, { faction: game.players[game.me].faction })); d.appendChild(c); const pr = document.createElement('div'); pr.className = 'prog'; pr.style.width = (idx === 0 ? qi.p * 100 : 0) + '%'; d.appendChild(pr); d.onclick = () => game.cancelTrain(e.i, idx); q.appendChild(d); });
      }
    } else {
      single.classList.add('hidden'); multi.classList.remove('hidden');
      if (sig !== this.lastSig || multi.children.length !== sel.length + 1) {
        multi.innerHTML = '';
        const head = document.createElement('div'); head.className = 'multi-head'; head.textContent = `${sel.length} ${sel.length < 5 ? 'jednotky' : 'jednotek'} vybráno`; multi.appendChild(head);
        for (const e of sel) { const d = document.createElement('div'); d.className = 'mi' + (e.k === 'u' && e.t === game.subgroup && game.subgroupTypes().length > 1 ? ' sub' : ''); d.title = game.entName(e) + (game.subgroupTypes().length > 1 ? ' (Tab přepíná podskupinu)' : ''); const c = this.portrait(game, e); const cc = document.createElement('canvas'); cc.width = 44; cc.height = 44; cc.getContext('2d').drawImage(c, 0, 0, 44, 44); d.appendChild(cc); const hp = document.createElement('div'); hp.className = 'hp'; hp.style.width = (e.hp / e.m * 100) + '%'; d.appendChild(hp); d.onclick = ev => { if (ev.shiftKey) { game.selection.delete(e.i); game.ui.dirty = true; game.ui.selectionChanged = true; } else game.select([e]); }; multi.appendChild(d); }
      } else { let i = 1; for (const e of sel) { const hp = multi.children[i++]?.querySelector('.hp'); if (hp) hp.style.width = (e.hp / e.m * 100) + '%'; } }
    }
    if (sig !== this.lastSig) { this.lastSig = sig; this.buildCommandCard(game, sel); }
    else this.refreshCommandCardState(game);
  }
  buildCommandCard(game, sel) {
    const card = $('cmdcard'); card.innerHTML = ''; this.cmdButtons = [];
    const own = sel.filter(e => e.o === game.me);
    if (!own.length) return;
    const allUnits = own.filter(e => e.k === 'u'), blds = own.filter(e => e.k === 'b');
    const p = game.players[game.me];
    const slots = new Array(12).fill(null);
    const btn = (slot, def) => { slots[slot] = def; };
    // subgroup (Tab): the card follows one unit type at a time, like Warcraft 3
    const types = game.subgroupTypes(); if (!types.includes(game.subgroup)) game.subgroup = types[0];
    const units = allUnits.filter(e => e.t === game.subgroup);
    if (units.length) {
      const hasWorker = units.some(e => game.unitDef(e).role === 'worker');
      const hasMil = units.some(e => game.unitDef(e).role !== 'worker');
      if (hasMil) btn(8, { label: 'Hlídkovat', key: 'P', icon: () => actionIcon('patrol'), desc: 'Jednotky hlídkují mezi současnou pozicí a cílem a útočí na vše, co potkají.', act: () => { game.state.mode = 'patrol'; }, active: () => game.state.mode === 'patrol' });
      if (this.buildMenu && hasWorker) {
        const order = ['hall', 'house', 'barracks', 'stable', 'siege', 'dock', 'tower', 'wall'];
        order.forEach((k, i) => { const b = game.tech.buildings[k]; btn(i, { label: b.name, key: b.hotkey, icon: () => buildingPortrait(b.sprite, b.w, b.h, p.color, 64, game.era), cost: b.cost, desc: b.desc, act: () => game.startPlacing(k), canAfford: () => p.res.p >= b.cost.p && p.res.s >= b.cost.s }); });
        btn(11, { label: 'Zpět', key: 'Esc', icon: () => actionIcon('back'), act: () => { this.buildMenu = false; this.selectionChanged = true; this.dirty = true; this.lastSig = ''; } });
      } else {
        btn(0, { label: 'Přesun', key: 'M', icon: () => actionIcon('move'), desc: 'Přesunout na místo (nebo pravé tlačítko).', act: () => { game.state.mode = 'move'; } });
        btn(1, { label: 'Stop', key: 'S', icon: () => actionIcon('stop'), desc: 'Zastavit současný rozkaz.', act: () => game.orderStop() });
        btn(2, { label: 'Držet', key: 'H', icon: () => actionIcon('hold'), desc: 'Držet pozici, nepronásledovat.', act: () => game.orderHold() });
        if (hasMil || hasWorker) btn(3, { label: 'Útok', key: 'A', icon: () => actionIcon('amove'), desc: 'Útočný pochod: útočí na vše cestou. Klik na nepřítele = útok na cíl.', act: () => { game.state.mode = 'amove'; }, active: () => game.state.mode === 'amove' });
        if (hasWorker) {
          const rp = game.eraDef.resources.p, rs = game.eraDef.resources.s;
          btn(4, { label: 'Těžit ' + (rp.acc || rp.name.toLowerCase()), key: 'G', icon: () => actionIcon('gather', 64, rp.color), desc: `Vybraní dělníci jdou těžit ${rp.acc || rp.name.toLowerCase()} z nejbližšího naleziště (${game.eraDef.nodes.mine.name.toLowerCase()}).`, act: () => game.gatherKind('mine') });
          btn(5, { label: 'Těžit ' + (rs.acc || rs.name.toLowerCase()), key: 'F', icon: () => actionIcon('gather', 64, rs.color), desc: `Vybraní dělníci jdou těžit ${rs.acc || rs.name.toLowerCase()} z nejbližšího lesa.`, act: () => game.gatherKind('tree') });
          btn(6, { label: 'Stavět', key: 'B', icon: () => actionIcon('build'), desc: 'Otevře nabídku staveb.', act: () => { this.buildMenu = true; this.selectionChanged = true; this.dirty = true; this.lastSig = ''; } });
          btn(7, { label: 'Opravit', key: 'R', icon: () => actionIcon('repair'), desc: 'Klikni na poškozenou vlastní budovu (nebo rovnou pravým tlačítkem).', act: () => { game.state.mode = 'repair'; }, active: () => game.state.mode === 'repair' });
        }
      }
    } else if (blds.length) {
      const b = blds[0]; const def = game.tech.buildings[b.t];
      if (!b.bl) { btn(11, { label: 'Zrušit stavbu', key: 'X', icon: () => actionIcon('cancel'), cls: 'cancel', desc: 'Zruší stavbu, vrátí 75 % surovin.', act: () => game.cancelBuild(b.i) }); }
      else {
        const keys = ['Q', 'W', 'E', 'R', 'T', 'Z'];
        const trains = game.availableTrains(b);
        const ROLE = { infantry: 'pěchota', ranged: 'střelci', cavalry: 'jezdectvo/vozidla', siege: 'obléhací', ship: 'lodě', building: 'budovy', wall: 'hradby', worker: 'dělníci' };
        trains.forEach((u, i) => { const ud = game.tech.units[u]; const bon = Object.entries(ud.bonus || {}).filter(([, v]) => v > 1).map(([k, v]) => `${ROLE[k] || k} ×${v}`).join(', '); btn(i, { label: ud.name, key: keys[i], icon: () => unitPortrait(ud.sprite, p.color, 64, { faction: p.faction }), cost: ud.cost, desc: `${ud.desc ? ud.desc + ' ' : ''}Útok ${ud.dmg}, pancíř ${ud.armor}, HP ${ud.hp}, dosah ${ud.range >= 1 ? ud.range.toFixed(1) : 'na blízko'}, rychlost ${ud.speed.toFixed(1)}.${bon ? ' Bonus proti: ' + bon + '.' : ''} Populace ${ud.pop}. Výcvik ${Math.round(ud.trainTime)} s.${ud.unique ? ' Jen jeden.' : ''}`, act: () => game.train(u), canAfford: () => p.res.p >= ud.cost.p && p.res.s >= ud.cost.s }); });
        const up = game.nextUpgrade(b);
        if (up) { const need = up.hall && game.hallLevel() < up.hall; const unlockNames = up.unlocks.map(u => game.tech.units[u]?.name).filter(Boolean); btn(8, { label: `Vylepšit (${up.level})`, key: 'U', icon: () => actionIcon('upgrade'), cost: up.cost, desc: `Vylepší budovu na úroveň ${up.level} (${Math.round(up.time)} s).${up.desc ? ' ' + up.desc : ''}${unlockNames.length ? ' Odemkne: ' + unlockNames.join(', ') + '.' : ''}${up.popCap ? ` +${up.popCap} populace.` : ''}${need ? ` Vyžaduje radnici úrovně ${up.hall}.` : ''}`, act: () => game.upgrade(b.i), canAfford: () => !need && p.res.p >= up.cost.p && p.res.s >= up.cost.s && !(b.q || []).some(q => q.t === '__up') }); }
        if (def.isWall) btn(9, { label: b.t === 'gate' ? 'Zazdít' : 'Udělat bránu', key: 'G', icon: () => actionIcon('gate'), cost: b.t === 'gate' ? null : game.tech.buildings.gate.cost, desc: b.t === 'gate' ? 'Změní bránu zpět na hradbu.' : 'Změní segment na bránu, kterou projdou jen tvoje jednotky a spojenci.', act: () => game.toggleGate() });
        if (trains.length) btn(6, { label: 'Shromaždiště', key: 'Y', icon: () => actionIcon('rally'), desc: 'Klikni na místo (nebo pravým tlačítkem). Na důl/les = dělníci jdou rovnou těžit.', act: () => { game.state.mode = 'rally'; }, active: () => game.state.mode === 'rally' });
        // research (AoE blacksmith style)
        const resList = Object.entries(RESEARCH).filter(([, rd]) => rd.building === b.t); const resSlots = [7, 9];
        resList.forEach(([rid, rd], i) => { const lvl = (p.research && p.research[rid]) || 0; if (lvl >= rd.maxLevel) return; const cost = { p: rd.cost.p * (lvl + 1), s: rd.cost.s * (lvl + 1) }; const busy = (b.q || []).some(q => q.t === '__res' && q.rid === rid); btn(resSlots[i], { label: `${rd.names[game.era]} ${['I', 'II', 'III'][lvl]}`, key: rd.hotkey, icon: () => actionIcon(rd.dmgAdd || rd.dmgMul ? 'research_atk' : 'research_arm'), cost, desc: `${rd.desc} (${Math.round(rd.time)} s). Úroveň ${lvl}/${rd.maxLevel}.`, act: () => game.research(b.i, rid), canAfford: () => !busy && p.res.p >= cost.p && p.res.s >= cost.s }); });
        if (b.q && b.q.length) btn(10, { label: 'Zrušit', key: 'X', icon: () => actionIcon('cancel'), cls: 'cancel', desc: 'Zruší poslední položku ve frontě.', act: () => game.cancelTrain(b.i, b.q.length - 1) });
        btn(11, { label: 'Zbourat', key: 'Delete', icon: () => actionIcon('demolish'), cls: 'cancel', desc: 'Zbourá vybrané budovy (vrátí 25 % surovin).', act: () => game.demolish() });
      }
    }
    slots.forEach((d, i) => {
      const el = document.createElement('div'); el.className = 'cmd' + (d && d.cls ? ' ' + d.cls : '');
      if (!d) { el.style.visibility = 'hidden'; card.appendChild(el); return; }
      const ic = d.icon(); ic.style.opacity = '0.9'; el.appendChild(ic);
      const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = d.label; el.appendChild(lbl);
      const key = document.createElement('div'); key.className = 'key'; key.textContent = d.key; el.appendChild(key);
      el.onmousedown = e => e.stopPropagation();
      el.onclick = () => { if (d.canAfford && !d.canAfford()) { game.audio.sfx('error'); this.alert('Nedostatek surovin.', true); return; } d.act(); this.refreshCommandCardState(game); };
      el.onmouseenter = () => { let html = `<b>${d.label}</b>${d.key ? ` <span style="color:#f1d36a">[${d.key}]</span>` : ''}`; if (d.cost) html += `<div class="cost"><i style="color:${game.eraDef.resources.p.color}">${d.cost.p}</i> ${game.eraDef.resources.p.name} · <i style="color:${game.eraDef.resources.s.color}">${d.cost.s}</i> ${game.eraDef.resources.s.name}</div>`; if (d.desc) html += `<div class="desc">${d.desc}</div>`; const r = el.getBoundingClientRect(); this.showTooltip(html, r.left - 40, r.top - 110); };
      el.onmouseleave = () => this.hideTooltip();
      card.appendChild(el); this.cmdButtons.push({ el, d });
    });
    this.refreshCommandCardState(game);
  }
  refreshCommandCardState(game) { for (const { el, d } of this.cmdButtons) { el.classList.toggle('disabled', !!(d.canAfford && !d.canAfford())); el.classList.toggle('active', !!(d.active && d.active())); } }
  handleHotkey(game, k) {
    const K = k.toUpperCase();
    for (const { d } of this.cmdButtons) if (d.key && d.key.toUpperCase() === K) { if (d.canAfford && !d.canAfford()) { game.audio.sfx('error'); this.alert('Nedostatek surovin.', true); return true; } d.act(); this.refreshCommandCardState(game); return true; }
    if (k === 'm' && game.myUnitsSelected().length) { game.state.mode = 'move'; return true; }
    return false;
  }

  // ---------- end screen ----------
  showEnd(game, win, eliminatedOnly = false) {
    $('end-title').textContent = win ? 'VÍTĚZSTVÍ' : 'PORÁŽKA'; $('end-title').classList.toggle('defeat', !win);
    const t = Math.floor(game.gameTime()); $('end-sub').textContent = `${win ? 'Nepřítel byl rozdrcen.' : (eliminatedOnly ? 'Byli jsme vyřazeni, ostatní bojují dál.' : 'Naše říše padla.')} Délka hry ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · ${game.eraDef.name}`;
    const winner = game.gameOver ? game.gameOver.winnerTeam : -2;
    $('btn-end-spectate').classList.toggle('hidden', !eliminatedOnly);
    const tbl = $('end-stats'); tbl.innerHTML = '<tr><th>Hráč</th><th>Frakce</th><th>Tým</th><th>Jednotky</th><th>Ztráty</th><th>Zabito</th><th>Budovy</th><th>Zničeno</th><th>Suroviny</th></tr>';
    for (const p of game.players) { const tr = document.createElement('tr'); const s = p.stats; const fname = ERAS[game.era].factions.find(f => f.id === p.faction)?.name || p.faction; tr.innerHTML = `<td style="color:${TEAM_COLORS[p.color].hex}">${p.name}${p.isAI ? ' (AI)' : ''}${p.team === winner ? '<span class="winner">VÍTĚZ</span>' : ''}</td><td>${fname}</td><td>${p.team + 1}</td><td>${s.unitsBuilt}</td><td>${s.unitsLost}</td><td>${s.unitsKilled}</td><td>${s.buildingsBuilt}</td><td>${s.buildingsRazed}</td><td>${s.gatheredP + s.gatheredS}</td>`; tbl.appendChild(tr); }
    $('endscreen').classList.remove('hidden');
  }
}
