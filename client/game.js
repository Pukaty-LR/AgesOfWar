// Client game state + input handling.
import { ERAS, T, makeTechTable, TEAM_COLORS, TICK_RATE, RESEARCH } from '../shared/data.js';
import { Renderer } from './render/renderer.js';
import { TW, TH } from './render/sprites.js';

const SNAP_MS = 100;
const cur = (svg, hx, hy, fb) => `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + svg + '</svg>')}") ${hx} ${hy}, ${fb}`;
const CURSORS = {
  attack: cur('<circle cx="16" cy="16" r="9" fill="none" stroke="#000" stroke-width="4"/><circle cx="16" cy="16" r="9" fill="none" stroke="#ff4a4a" stroke-width="2"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke="#000" stroke-width="4"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke="#ff4a4a" stroke-width="2"/>', 16, 16, 'crosshair'),
  build: cur('<path d="M6 26l10-10" stroke="#000" stroke-width="6" stroke-linecap="round"/><path d="M6 26l10-10" stroke="#e0b070" stroke-width="3" stroke-linecap="round"/><rect x="15" y="5" width="12" height="8" rx="2" fill="#bbb" stroke="#000" stroke-width="2" transform="rotate(45 21 9)"/>', 6, 26, 'crosshair'),
  gather: cur('<path d="M6 26l11-11" stroke="#000" stroke-width="6" stroke-linecap="round"/><path d="M6 26l11-11" stroke="#b7863f" stroke-width="3" stroke-linecap="round"/><path d="M12 8c5-4 12-3 15 3" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/><path d="M12 8c5-4 12-3 15 3" fill="none" stroke="#ddd" stroke-width="3" stroke-linecap="round"/>', 6, 26, 'crosshair'),
  patrol: cur('<path d="M5 20h16M27 12H11" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M5 20h16M27 12H11" stroke="#8fd0ff" stroke-width="2.5" stroke-linecap="round"/><path d="M21 20l-4-4M21 20l-4 4M11 12l4-4M11 12l4 4" stroke="#8fd0ff" stroke-width="2.5" stroke-linecap="round"/>', 16, 16, 'crosshair'),
};

export class Game {
  constructor(canvas, net, audio, ui) {
    this.canvas = canvas; this.net = net; this.audio = audio; this.ui = ui;
    this.renderer = new Renderer(canvas, this);
    this.ents = new Map(); this.players = []; this.me = 0; this.myTeam = 0;
    this.selection = new Set(); this.groups = {};
    this.state = { mode: null, placing: null, drag: null, dragMoved: false, mouse: { x: -1, y: -1 }, altHeld: false, shift: false, ctrl: false, midDrag: null };
    this.keys = {}; this.running = false; this.lastFrame = 0; this.lastTick = 0; this.lastSnapAt = 0;
    this.lastAlert = null; this.lastFogAt = 0; this.combatHeat = 0; this.chatOpen = false;
    this.settings = { scrollSpeed: 60, edgeScroll: true, showHp: true };
    this.wallReqId = 0; this.lastWallReq = 0; this.hover = null; this.lastClick = { t: 0, id: 0 };
    this.stats = { cmds: 0 };
    this.blocked = null; this.wallGrid = new Map();
    this.bindInput();
  }

  // ---------- lifecycle ----------
  start(msg) {
    const g = msg.game;
    document.getElementById('loading').classList.remove('hidden');
    this.era = g.era; this.eraDef = ERAS[g.era]; this.map = g.map; this.map.tiles = Uint8Array.from(g.map.tiles); this.map.height = Float32Array.from(g.map.height);
    this.players = g.players; this.me = g.me; this.myTeam = this.players[this.me].team;
    this.tech = makeTechTable(this.era, this.players[this.me].faction);
    this.techs = this.players.map(p => makeTechTable(this.era, p.faction));
    this.ents.clear(); this.selection.clear(); this.groups = {};
    this.blocked = new Uint8Array(this.map.w * this.map.h); this.wallGrid.clear();
    delete this.renderer.updateFog; // undo the end-of-game map reveal from a previous match
    this.renderer.setMap(this.map, this.era); this.renderer.prebuild();
    if (g.reveal) this.renderer.updateFog = function () { this.expF.fill(1); this.visF.fill(1); this.explored.fill(1); this.visible.fill(1); this.fogCtx.clearRect(0, 0, this.fw, this.fh); };
    const s = this.map.spawns[this.me]; this.renderer.cam.x = s.x; this.renderer.cam.y = s.y; this.renderer.cam.zoom = 1;
    this.gameOver = null; this.paused = false; this.eliminated = false; this.running = true; this.startedAt = performance.now(); this.tick = 0; this.lastSnapAt = performance.now();
    this.state.mode = null; this.state.placing = null; this.state.drag = null; this.state.mouse = { x: -1, y: -1 }; this.keys = {};
    this.ui.onGameStart(this);
    this.audio.era = this.era; this.audio.startMusic(this.eraDef.music);
    this.renderer.resize();
    this.lastFrame = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }
  stop() { this.running = false; this.audio.stopMusic(); }
  tickNow() { return this.paused ? this.tick : this.tick + Math.min(20, (performance.now() - this.lastSnapAt) / (1000 / TICK_RATE)); }
  gameTime() { return this.tick / TICK_RATE; }
  unitDef(e) { return this.techs[e.o]?.units[e.t] || this.eraDef.units[e.t]; }
  buildingDef(e) { return this.techs[e.o]?.buildings[e.t] || this.eraDef.buildings[e.t]; }
  entName(e) { if (e.k === 'u') return this.unitDef(e)?.name; if (e.k === 'b') return this.buildingName(e); if (e.k === 't') return this.eraDef.nodes.secondary.name; if (e.k === 'm') return this.eraDef.nodes.mine.name; return '?'; }

  // ---------- snapshots ----------
  applyEntity(d, full) {
    const now = performance.now();
    let e = this.ents.get(d.i);
    if (!e) {
      e = { ...d, rx: d.x, ry: d.y, px: d.x, py: d.y, rf: d.f || 0, snapT: now, moving: false };
      this.ents.set(d.i, e);
      if (d.k === 'u') e.sight = this.unitDef(e)?.sight || 7;
      if (d.k === 'b' || d.k === 't' || d.k === 'm') this.setBlocked(e, true);
      return e;
    }
    if (d.k === 'u' || d.k === 'p') { e.px = e.rx; e.py = e.ry; e.snapT = now; if (d.hp < e.hp) e.hitAt = this.renderer.time; }
    if (d.k === 'b' && d.hp < e.hp && d.bl) e.hitAt = this.renderer.time;
    Object.assign(e, d);
    if (d.k === 'u' && e.hd) { e.px = e.x; e.py = e.y; e.rx = e.x; e.ry = e.y; }
    return e;
  }
  removeEntity(id) {
    const e = this.ents.get(id); if (!e) return;
    if (e.k === 'b' || e.k === 't' || e.k === 'm') this.setBlocked(e, false);
    this.ents.delete(id); this.selection.delete(id);
  }
  setBlocked(e, on) {
    const w = this.map.w; const ew = e.w || (e.k === 'm' ? 2 : 1), eh = e.h || (e.k === 'm' ? 2 : 1);
    for (let y = e.ty; y < e.ty + eh; y++) for (let x = e.tx; x < e.tx + ew; x++) { if (x < 0 || y < 0 || x >= w || y >= this.map.h) continue; this.blocked[y * w + x] = on ? 1 : 0; }
    if (e.k === 'b' && (e.t === 'wall' || e.t === 'gate')) { const key = e.tx + ',' + e.ty; if (on) this.wallGrid.set(key, e.o); else this.wallGrid.delete(key); }
  }
  availableTrains(b) { const def = this.tech.buildings[b.t]; const out = [...(def.trains || [])]; for (const up of def.upgrades || []) if (up.level <= (b.lv || 1)) out.push(...up.unlocks); return out; }
  nextUpgrade(b) { const def = this.tech.buildings[b.t]; return (def.upgrades || []).find(u => u.level === (b.lv || 1) + 1) || null; }
  hallLevel() { let lv = 0; for (const e of this.ents.values()) if (e.k === 'b' && e.o === this.me && e.t === 'hall' && e.bl) lv = Math.max(lv, e.lv || 1); return lv; }
  upgrade(bid) { const b = this.ents.get(bid); if (!b) return; const up = this.nextUpgrade(b); if (!up) return; const p = this.players[this.me]; if (up.hall && this.hallLevel() < up.hall) { this.ui.alert(`Vyžaduje ${this.eraDef.hallNames[up.hall - 1]} (radnice úrovně ${up.hall}).`, true); this.audio.sfx('error'); return; } if (p.res.p < up.cost.p || p.res.s < up.cost.s) { this.ui.alert('Nedostatek surovin.', true); this.audio.sfx('error'); return; } this.send({ t: 'upgrade', id: bid }); this.audio.sfx('click'); }
  useAbility() { const ids = this.selectedIds(e => e.k === 'u' && e.o === this.me && this.unitDef(e).ability); if (!ids.length) return; this.send({ t: 'ability', ids }); }
  research(bid, rid) { this.send({ t: 'research', id: bid, rid }); this.audio.sfx('click'); }
  pingMap(wx, wy) { this.net.send({ t: 'mping', x: wx, y: wy }); }
  toggleGate() { const ids = this.selectedIds(e => e.k === 'b' && e.o === this.me && (e.t === 'wall' || e.t === 'gate')); if (!ids.length) return; this.send({ t: 'gate', ids }); this.audio.sfx('placed', 0.5); }
  buildingName(e) { const def = this.buildingDef(e); if (!def) return '?'; if (e.t === 'hall' && this.eraDef.hallNames) return this.eraDef.hallNames[Math.min(this.eraDef.hallNames.length, e.lv || 1) - 1]; return def.name + ((e.lv || 1) > 1 ? ` (úroveň ${e.lv})` : ''); }
  wallAt(tx, ty, owner) { const o = this.wallGrid.get(tx + ',' + ty); return o !== undefined && this.players[o].team === this.players[owner].team; }
  tileBuildable(tx, ty) { const w = this.map.w; if (tx < 0 || ty < 0 || tx >= w || ty >= this.map.h) return false; const t = this.map.tiles[ty * w + tx]; return (t === T.GRASS || t === T.DIRT || t === T.SAND) && !this.blocked[ty * w + tx]; }
  canPlace(type, tx, ty) {
    const def = this.tech.buildings[type]; if (!def) return false;
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) if (!this.tileBuildable(x, y)) return false;
    if (def.shore) { let ok = false; const w = this.map.w; for (let y = ty - 1; y <= ty + def.h && !ok; y++) for (let x = tx - 1; x <= tx + def.w; x++) { if (x < 0 || y < 0 || x >= w || y >= this.map.h) continue; if (x >= tx && x < tx + def.w && y >= ty && y < ty + def.h) continue; const t = this.map.tiles[y * w + x]; if (t === T.WATER || t === T.SHALLOW) { ok = true; break; } } if (!ok) return false; }
    return true;
  }
  onFull(snap) {
    this.tick = snap.tick; this.lastSnapAt = performance.now();
    for (const d of snap.ents) this.applyEntity(d, true);
    this.players = snap.players; this.ui.onPlayers(this);
    this.renderer.updateFog(this.ents, this.myTeam, this.players);
    setTimeout(() => document.getElementById('loading').classList.add('hidden'), 250);
  }
  onSnap(snap) {
    if (!this.running) return;
    this.tick = snap.tick; this.lastSnapAt = performance.now();
    this.players = snap.players;
    for (const d of snap.ents) this.applyEntity(d);
    for (const id of snap.rem) this.removeEntity(id);
    for (const ev of snap.ev) this.onEvent(ev);
    if (snap.gameOver && !this.gameOver) { this.gameOver = snap.gameOver; this.onGameOver(); }
    this.ui.dirty = true;
  }
  soundAt(name, x, y, base = 1) {
    const cam = this.renderer.cam; const d = Math.hypot(x - cam.x, y - cam.y) / (cam.zoom < 1 ? 1.4 : 1);
    if (d > 34) return;
    const vol = base * Math.max(0.08, 1 - d / 34); const [sx] = this.renderer.worldToScreen(x, y);
    const pan = Math.max(-1, Math.min(1, (sx - this.renderer.W / 2) / this.renderer.W * 1.6));
    this.audio.sfx(name, vol, pan);
  }
  onEvent(ev) {
    const R = this.renderer; const near = (x, y) => Math.hypot(x - R.cam.x, y - R.cam.y) < 30;
    const mine = ev.o === this.me || ev.owner === this.me;
    switch (ev.t) {
      case 'shot': this.soundAt({ arrow: 'arrowShot', bolt: 'arrowShot', bullet: 'bulletShot', shell: 'shellShot', rock: 'rockShot', flame: 'flameShot', plasma: 'plasmaShot', rail: 'railShot', plasmaShell: 'plasmaShellShot' }[ev.k] || 'arrowShot', ev.x, ev.y, 0.7); if (ev.k === 'bullet' || ev.k === 'shell') R.addEffect({ kind: 'flash', x: ev.x, y: ev.y, color: 'rgba(255,220,140,0.8)' }); if (ev.k === 'plasma' || ev.k === 'rail' || ev.k === 'plasmaShell') R.addEffect({ kind: 'flash', x: ev.x, y: ev.y, color: 'rgba(120,230,255,0.7)' }); this.heat(ev.x, ev.y); break;
      case 'hit': {
        this.soundAt(ev.k === 'melee' ? 'swordHit' : (ev.k === 'bullet' ? 'hit' : 'arrowHit'), ev.x, ev.y, 0.8);
        if (R.isVisibleTile(ev.x, ev.y)) R.spawnParticles(ev.k === 'melee' ? 5 : 4, ev.x, ev.y, 10, { colors: ev.k === 'melee' ? [[255, 240, 200], [255, 200, 80]] : [[140, 30, 30], [180, 40, 40]], speed: 1.5, vz: 30, life: 0.4, size: 1.6, gravity: 120 });
        this.heat(ev.x, ev.y); break;
      }
      case 'explode': this.soundAt('explosion', ev.x, ev.y, 1); R.addEffect({ kind: 'explosion', x: ev.x, y: ev.y, r: ev.r }); R.spawnParticles(18, ev.x, ev.y, 4, { colors: [[80, 70, 60], [120, 110, 90], [60, 50, 40]], speed: 3, vz: 60, life: 1.1, size: 3, gravity: 60, grow: 3, drag: 0.93 }); R.spawnParticles(10, ev.x, ev.y, 4, { colors: [[255, 200, 80], [255, 120, 30]], speed: 3, vz: 70, life: 0.5, size: 2.5, gravity: 100 }); this.heat(ev.x, ev.y); break;
      case 'miss': if (ev.k === 'bullet') break; this.soundAt('hit', ev.x, ev.y, 0.3); if (R.isVisibleTile(ev.x, ev.y)) R.spawnParticles(3, ev.x, ev.y, 2, { colors: [[120, 100, 70]], speed: 1, vz: 20, life: 0.4, size: 1.5 }); break;
      case 'death': {
        if (ev.k === 'unit') {
          const def = this.techs[ev.o]?.units[ev.ty]; const big = ['cavalry', 'siege', 'ship'].includes(def?.role);
          if (R.isVisibleTile(ev.x, ev.y)) { R.addEffect({ kind: 'corpse', x: ev.x, y: ev.y, sprite: def?.sprite, color: this.players[ev.o].color, f: ev.f, faction: this.players[ev.o].faction, blood: this.era === 'antiquity' || !big, big }); this.soundAt(big ? 'collapse' : 'death', ev.x, ev.y, 0.7); if (big) R.spawnParticles(14, ev.x, ev.y, 6, { colors: [[80, 70, 60], [255, 160, 60]], speed: 2.5, vz: 50, life: 0.8, size: 3, grow: 2 }); }
          if (ev.o === this.me) this.ui.alert(`Ztratili jsme jednotku: ${def?.name}`, false);
        } else if (ev.k === 'building') {
          R.addEffect({ kind: 'rubble', x: ev.x, y: ev.y, w: ev.w, h: ev.h }); this.soundAt('collapse', ev.x, ev.y, 1);
          R.spawnParticles(40, ev.x, ev.y, 10, { colors: [[110, 100, 85], [80, 72, 60], [150, 140, 120]], speed: 3, vz: 50, life: 1.6, size: 4, grow: 4, gravity: 40, drag: 0.94, z: 30 });
          R.addEffect({ kind: 'explosion', x: ev.x, y: ev.y, r: Math.max(1, ev.w * 0.6) });
          if (ev.o === this.me) this.ui.alert(`Přišli jsme o budovu: ${this.techs[ev.o].buildings[ev.ty]?.name}`, true);
        } else if (ev.k === 'tree') { R.addEffect({ kind: 'stump', x: ev.x, y: ev.y }); R.spawnParticles(8, ev.x, ev.y, 20, { colors: [[70, 130, 50], [110, 75, 40]], speed: 1.5, vz: 10, life: 0.9, size: 2.5, gravity: 60 }); }
        break;
      }
      case 'chop': this.soundAt('chop', ev.x, ev.y, 0.6); if (R.isVisibleTile(ev.x, ev.y)) R.spawnParticles(3, ev.x, ev.y, 12, { colors: [[200, 160, 100], [150, 110, 60]], speed: 1.2, vz: 25, life: 0.5, size: 1.4 }); break;
      case 'hammer': this.soundAt('hammer', ev.x, ev.y, 0.5); if (R.isVisibleTile(ev.x, ev.y)) R.spawnParticles(2, ev.x + (Math.random() - 0.5), ev.y + (Math.random() - 0.5), 14, { colors: [[255, 230, 150]], speed: 0.8, vz: 25, life: 0.3, size: 1.2 }); break;
      case 'built': if (mine && ev.ty !== 'wall') { this.audio.sfx('buildingDone', 0.8); this.ui.alert(`${this.tech.buildings[ev.ty]?.name}: stavba dokončena`, false); } break;
      case 'spawn': if (mine) this.audio.sfx('unitReady', 0.5); break;
      case 'ability': { R.addEffect({ kind: 'ring', x: ev.x, y: ev.y, color: 'rgba(255,220,90,0.95)' }); R.spawnParticles(24, ev.x, ev.y, 8, { colors: [[255, 230, 120], [255, 180, 60]], speed: ev.r * 1.2, vz: 10, life: 0.7, size: 2, gravity: 0, drag: 0.96 }); this.soundAt('horn', ev.x, ev.y, 1); if (mine) this.ui.alert(`${ev.name}!`, false); this.heat(ev.x, ev.y); break; }
      case 'researched': if (mine) { this.audio.sfx('buildingDone', 0.8); const rd = RESEARCH[ev.rid]; this.ui.alert(`Výzkum dokončen: ${rd ? rd.names[this.era] : ev.rid} ${['I', 'II', 'III'][ev.level - 1] || ev.level}`, false); this.ui.lastSig = ''; this.ui.dirty = true; } break;
      case 'upgraded': if (mine) { this.audio.sfx('buildingDone', 0.8); const b = this.ents.get(ev.id); if (b) b.lv = ev.level; this.ui.alert(`${this.tech.buildings[ev.ty]?.name}: vylepšeno na úroveň ${ev.level}`, false); this.ui.lastSig = ''; this.ui.dirty = true; } break;
      case 'place': if (mine) this.audio.sfx('placed', 0.6); break;
      case 'msg': if (ev.owner === this.me || ev.owner === -1) { this.ui.alert(ev.text, ev.owner === this.me); if (ev.owner === this.me) this.audio.sfx('error', 0.6); } break;
      case 'alert': if (ev.owner === this.me) { this.lastAlert = { x: ev.x, y: ev.y, t: performance.now() }; this.ui.alert(ev.k === 'building' ? 'Naše budova je pod útokem!' : 'Naše jednotky jsou pod útokem!', true); this.audio.sfx('alarm', 0.6); this.ui.minimapPing(ev.x, ev.y); } break;
      case 'eliminated': { const p = this.players[ev.owner]; this.ui.chat('', `${p?.name} byl vyřazen ze hry.`, true); if (ev.owner !== this.me) this.audio.sfx('horn', 0.6); else if (!this.gameOver) { this.audio.sfx('defeat', 1); this.eliminated = true; setTimeout(() => { if (!this.gameOver) this.ui.showEnd(this, false, true); }, 1200); } break; }
      case 'gameover': break;
    }
  }
  heat(x, y) { const R = this.renderer; if (Math.hypot(x - R.cam.x, y - R.cam.y) < 40) this.combatHeat = Math.min(1, this.combatHeat + 0.12); }
  onGameOver() {
    const win = this.gameOver.winnerTeam === this.myTeam;
    // reveal the whole map like Warcraft 3 does after the game ends
    this.renderer.updateFog = function () { this.expF.fill(1); this.visF.fill(1); this.explored.fill(1); this.visible.fill(1); this.fogCtx.clearRect(0, 0, this.fw, this.fh); };
    this.lastFogAt = 0;
    this.audio.sfx(win ? 'victory' : 'defeat', 1);
    this.audio.setIntensity(0);
    setTimeout(() => this.ui.showEnd(this, win), 1200);
  }

  // ---------- commands ----------
  send(c) { this.net.send({ t: 'cmd', c }); this.stats.cmds++; }
  selectedIds(filter) { const out = []; for (const id of this.selection) { const e = this.ents.get(id); if (e && (!filter || filter(e))) out.push(id); } return out; }
  myUnitsSelected() { return this.selectedIds(e => e.k === 'u' && e.o === this.me); }
  myBuildingsSelected() { return this.selectedIds(e => e.k === 'b' && e.o === this.me); }
  smartCommand(wx, wy, target) {
    const units = this.myUnitsSelected(); const blds = this.myBuildingsSelected();
    const queue = this.state.shift;
    if (units.length) {
      this.send({ t: 'smart', ids: units, x: wx, y: wy, targetId: target ? target.i : 0, queue });
      const enemy = target && target.o !== undefined && this.players[target.o].team !== this.myTeam;
      this.audio.sfx(enemy ? 'attackOrder' : 'ack', 0.7);
      this.renderer.addEffect({ kind: 'marker', x: target ? target.x : wx, y: target ? target.y : wy, color: enemy ? 'rgba(255,80,80,0.9)' : (target && (target.k === 't' || target.k === 'm') ? 'rgba(255,220,90,0.9)' : 'rgba(120,255,140,0.9)') });
    } else if (blds.length) {
      this.send({ t: 'rally', ids: blds, x: wx, y: wy, targetId: target ? target.i : 0 }); this.audio.sfx('click');
    }
  }
  orderMove(wx, wy) { const ids = this.myUnitsSelected(); if (!ids.length) return; this.send({ t: 'move', ids, x: wx, y: wy, queue: this.state.shift }); this.audio.sfx('ack', 0.7); this.renderer.addEffect({ kind: 'marker', x: wx, y: wy, color: 'rgba(120,255,140,0.9)' }); }
  orderAttackMove(wx, wy, target) {
    const ids = this.myUnitsSelected(); if (!ids.length) return;
    if (target && target.o !== undefined && this.players[target.o].team !== this.myTeam) this.send({ t: 'attack', ids, targetId: target.i, queue: this.state.shift });
    else this.send({ t: 'amove', ids, x: wx, y: wy, queue: this.state.shift });
    this.audio.sfx('attackOrder', 0.7); this.renderer.addEffect({ kind: 'marker', x: wx, y: wy, color: 'rgba(255,80,80,0.9)' });
  }
  gatherKind(kind) { const ids = this.selectedIds(e => e.k === 'u' && e.o === this.me && this.unitDef(e).role === 'worker'); if (!ids.length) return; this.send({ t: 'gatherKind', ids, kind, queue: this.state.shift }); this.audio.sfx('ack', 0.7); }
  demolish() {
    const ids = this.myBuildingsSelected(); if (!ids.length) return;
    const important = ids.some(id => { const e = this.ents.get(id); return e && e.t !== 'wall' && e.t !== 'gate' && e.bl; });
    if (important && !(this.demolishArm && performance.now() - this.demolishArm < 2500)) { this.demolishArm = performance.now(); this.ui.alert('Opravdu zbourat? Stiskni Delete znovu do 2 s.', true); this.audio.sfx('error', 0.5); return; }
    this.demolishArm = 0; this.send({ t: 'demolish', ids }); this.audio.sfx('click'); this.select([]);
  }
  orderPatrol(wx, wy) { const ids = this.selectedIds(e => e.k === 'u' && e.o === this.me && this.unitDef(e).role !== 'worker'); if (!ids.length) return; this.send({ t: 'patrol', ids, x: wx, y: wy, queue: this.state.shift }); this.audio.sfx('ack', 0.7); this.renderer.addEffect({ kind: 'marker', x: wx, y: wy, color: 'rgba(120,200,255,0.9)' }); }
  /** WC3-style subgroups: the command card follows one unit type at a time; Tab cycles. */
  subgroupTypes() { const types = []; for (const id of this.selection) { const e = this.ents.get(id); if (e && e.k === 'u' && e.o === this.me && !types.includes(e.t)) types.push(e.t); } return types; }
  cycleSubgroup() { const types = this.subgroupTypes(); if (types.length < 2) return; const i = types.indexOf(this.subgroup); this.subgroup = types[(i + 1) % types.length]; this.ui.lastSig = ''; this.ui.dirty = true; this.audio.sfx('click'); }
  orderStop() { const ids = this.myUnitsSelected(); if (ids.length) { this.send({ t: 'stop', ids }); this.audio.sfx('click'); } }
  orderHold() { const ids = this.myUnitsSelected(); if (ids.length) { this.send({ t: 'hold', ids }); this.audio.sfx('click'); } }
  train(type) { const blds = this.myBuildingsSelected(); if (!blds.length) return; const def = this.tech.units[type]; const p = this.players[this.me]; if (p.res.p < def.cost.p || p.res.s < def.cost.s) { this.ui.alert('Nedostatek surovin.', true); this.audio.sfx('error'); return; } // pick building with shortest queue
    let best = null; for (const id of blds) { const b = this.ents.get(id); if (!b.bl || !this.tech.buildings[b.t].trains.includes(type)) continue; if (!best || b.q.length < best.q.length) best = b; } if (!best) return; this.send({ t: 'train', id: best.i, type }); this.audio.sfx('click'); }
  cancelTrain(bid, index) { this.send({ t: 'cancelTrain', id: bid, index }); this.audio.sfx('click'); }
  cancelBuild(bid) { this.send({ t: 'cancelBuild', id: bid }); this.audio.sfx('click'); }
  startPlacing(type) {
    const def = this.tech.buildings[type]; const p = this.players[this.me];
    if (type !== 'wall' && (p.res.p < def.cost.p || p.res.s < def.cost.s)) { this.ui.alert('Nedostatek surovin.', true); this.audio.sfx('error'); return; }
    this.state.placing = { type, hover: null, start: null, preview: [] }; this.state.mode = null; this.audio.sfx('click');
    this.ui.placementHint(type === 'wall' ? 'Hradba: klikni na začátek, pak na konec. Shift = pokračovat. Pravé tlačítko / Esc = zrušit.' : `${def.name}: levé tlačítko postaví, Shift = více staveb, pravé / Esc = zrušit.`);
  }
  cancelPlacing() { this.state.placing = null; this.state.mode = null; this.ui.placementHint(null); this.ui.dirty = true; }
  confirmPlacement() {
    const p = this.state.placing; if (!p || !p.hover) return;
    const ids = this.selectedIds(e => e.k === 'u' && e.o === this.me && this.unitDef(e).role === 'worker'); if (!ids.length) { this.cancelPlacing(); return; }
    if (p.type === 'wall') {
      if (!p.start) { if (!this.tileBuildable(p.hover.x, p.hover.y)) { this.audio.sfx('error'); return; } p.start = { ...p.hover }; p.preview = []; this.audio.sfx('click'); return; }
      if (!p.preview || !p.preview.length) { if (p.preview === null) { this.audio.sfx('error'); this.ui.alert('Hradbu tudy nelze postavit.', true); } return; }
      this.send({ t: 'wall', ids, x0: p.start.x, y0: p.start.y, x1: p.hover.x, y1: p.hover.y });
      this.audio.sfx('placed', 0.6);
      if (this.state.shift) { p.start = { ...p.hover }; p.preview = []; } else this.cancelPlacing();
      return;
    }
    if (!this.canPlace(p.type, p.hover.x, p.hover.y)) { this.audio.sfx('error'); this.ui.alert('Tady stavět nelze.', true); return; }
    this.send({ t: 'build', ids, type: p.type, tx: p.hover.x, ty: p.hover.y, queue: this.state.shift });
    const def = this.tech.buildings[p.type];
    // optimistic block to avoid double placement at the same spot
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) this.blocked[(p.hover.y + y) * this.map.w + p.hover.x + x] = 1;
    if (!this.state.shift) this.cancelPlacing();
  }
  requestWallPreview() {
    const p = this.state.placing; if (!p || p.type !== 'wall' || !p.start || !p.hover) return;
    const now = performance.now(); if (now - this.lastWallReq < 70) return; this.lastWallReq = now;
    if (p.lastReqKey === p.hover.x + ',' + p.hover.y) return; p.lastReqKey = p.hover.x + ',' + p.hover.y;
    const id = ++this.wallReqId; this.net.send({ t: 'wallPreview', id, x0: p.start.x, y0: p.start.y, x1: p.hover.x, y1: p.hover.y });
  }
  onWallPreview(m) { const p = this.state.placing; if (!p || p.type !== 'wall' || m.id !== this.wallReqId) return; p.preview = m.tiles; }

  // ---------- selection ----------
  select(ents, add = false) {
    if (!add) this.selection.clear();
    for (const e of ents) if (add && this.selection.has(e.i) && ents.length === 1) this.selection.delete(e.i); else this.selection.add(e.i);
    // if selection has own units, drop buildings & foreign
    const own = [...this.selection].some(id => { const e = this.ents.get(id); return e && e.k === 'u' && e.o === this.me; });
    if (own) for (const id of [...this.selection]) { const e = this.ents.get(id); if (!e || e.k !== 'u' || e.o !== this.me) this.selection.delete(id); }
    if (this.selection.size > 60) { const arr = [...this.selection].slice(0, 60); this.selection = new Set(arr); }
    this.ui.dirty = true; this.ui.selectionChanged = true;
    if (ents.length) this.audio.sfx('select', 0.5);
  }
  selectAllOfType(e) { const out = []; for (const o of this.ents.values()) if (o.k === 'u' && o.o === this.me && o.t === e.t && o.sx !== undefined && o.sx > -50 && o.sx < this.renderer.W + 50 && o.sy > -50 && o.sy < this.renderer.H + 50) out.push(o); this.select(out, this.state.shift); }
  selectArmy() { const out = []; for (const o of this.ents.values()) if (o.k === 'u' && o.o === this.me && this.unitDef(o).role !== 'worker') out.push(o); this.select(out); }
  selectIdleWorker() { const idle = []; for (const o of this.ents.values()) if (o.k === 'u' && o.o === this.me && this.unitDef(o).role === 'worker' && o.o2 === 'idle') idle.push(o); if (!idle.length) { this.ui.alert('Žádný nečinný dělník.', false); return; } this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length; const e = idle[this.idleIdx]; this.select([e]); this.centerOn(e.x, e.y); }
  centerOn(x, y) { this.renderer.cam.x = x; this.renderer.cam.y = y; this.renderer.clampCamera(); }

  // ---------- input ----------
  bindInput() {
    const c = this.canvas; const st = this.state;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      if (!this.running) return; this.audio.init();
      const sx = e.offsetX, sy = e.offsetY; st.mouse = { x: sx, y: sy };
      if (e.button === 1) { st.midDrag = { x: sx, y: sy }; e.preventDefault(); return; }
      if (e.button === 0) {
        if (e.altKey && !st.placing && !st.mode) { const [wx, wy] = this.renderer.screenToWorld(sx, sy); this.pingMap(wx, wy); return; }
        if (st.placing) { this.confirmPlacement(); return; }
        if (st.mode === 'move') { const [wx, wy] = this.renderer.screenToWorld(sx, sy); this.orderMove(wx, wy); if (!st.shift) st.mode = null; return; }
        if (st.mode === 'patrol') { const [wx, wy] = this.renderer.screenToWorld(sx, sy); this.orderPatrol(wx, wy); if (!st.shift) st.mode = null; return; }
        if (st.mode === 'gather' || st.mode === 'repair') { const [wx, wy] = this.renderer.screenToWorld(sx, sy); const t = this.renderer.pick(sx, sy); if (t) this.smartCommand(wx, wy, t); else this.audio.sfx('error'); st.mode = null; return; }
        if (st.mode === 'amove' || st.mode === 'attack') { const [wx, wy] = this.renderer.screenToWorld(sx, sy); this.orderAttackMove(wx, wy, this.renderer.pick(sx, sy)); if (!st.shift) st.mode = null; return; }
        if (st.mode === 'rally') { const [wx, wy] = this.renderer.screenToWorld(sx, sy); const t = this.renderer.pick(sx, sy); this.send({ t: 'rally', ids: this.myBuildingsSelected(), x: wx, y: wy, targetId: t ? t.i : 0 }); st.mode = null; this.audio.sfx('click'); return; }
        st.drag = { x0: sx, y0: sy, x1: sx, y1: sy }; st.dragMoved = false;
      } else if (e.button === 2) {
        if (st.placing) { this.cancelPlacing(); return; }
        if (st.mode) { st.mode = null; return; }
        const [wx, wy] = this.renderer.screenToWorld(sx, sy); const t = this.renderer.pick(sx, sy);
        this.smartCommand(wx, wy, t);
      }
    });
    window.addEventListener('mousemove', e => {
      if (!this.running) return;
      const r = c.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; st.mouse = { x: sx, y: sy };
      st.shift = e.shiftKey; st.ctrl = e.ctrlKey; st.altHeld = e.altKey;
      if (st.midDrag) { this.panPixels(st.midDrag.x - sx, st.midDrag.y - sy); st.midDrag = { x: sx, y: sy }; return; }
      if (st.drag) { st.drag.x1 = sx; st.drag.y1 = sy; if (Math.abs(sx - st.drag.x0) + Math.abs(sy - st.drag.y0) > 6) st.dragMoved = true; }
      if (st.placing) { const [wx, wy] = this.renderer.screenToWorld(sx, sy); const def = this.tech.buildings[st.placing.type]; st.placing.hover = { x: Math.floor(wx - (def.w - 1) / 2), y: Math.floor(wy - (def.h - 1) / 2) }; this.requestWallPreview(); }
      // hover entity
      const h = (sx >= 0 && sy >= 0 && sx < this.renderer.W && sy < this.renderer.H) ? this.renderer.pick(sx, sy) : null;
      if (h !== this.hover) { if (this.hover) this.hover.hover = false; this.hover = h; if (h) h.hover = true; this.ui.hoverChanged(this, h); }
      this.updateCursor();
    });
    window.addEventListener('mouseup', e => {
      if (!this.running) return;
      if (e.button === 1) { st.midDrag = null; return; }
      if (e.button !== 0 || !st.drag) return;
      const d = st.drag; st.drag = null;
      if (st.dragMoved) { const units = this.renderer.unitsInRect(d.x0, d.y0, d.x1, d.y1); if (units.length || !st.shift) this.select(units, st.shift); }
      else {
        const t = this.renderer.pick(d.x0, d.y0);
        const now = performance.now();
        if (t && t.k === 'u' && t.o === this.me && (e.ctrlKey || (this.lastClick.id === t.i && now - this.lastClick.t < 350))) { this.selectAllOfType(t); this.lastClick = { t: 0, id: 0 }; }
        else { this.lastClick = { t: now, id: t ? t.i : 0 }; if (t) this.select([t], st.shift); else if (!st.shift) this.select([]); }
      }
    });
    c.addEventListener('wheel', e => {
      if (!this.running) return; e.preventDefault();
      const R = this.renderer; const [wx, wy] = R.screenToWorld(e.offsetX, e.offsetY);
      R.cam.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12; R.clampCamera();
      const [wx2, wy2] = R.screenToWorld(e.offsetX, e.offsetY); R.cam.x += wx - wx2; R.cam.y += wy - wy2; R.clampCamera();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.running) return;
      if (this.chatOpen) { if (e.key === 'Escape') this.ui.closeChat(); return; }
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys[k] = true; st.shift = e.shiftKey; st.ctrl = e.ctrlKey; st.altHeld = e.altKey;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.key === 'Enter') { this.ui.openChat(); return; }
      if (e.key === 'Escape') { if (st.placing) this.cancelPlacing(); else if (st.mode) st.mode = null; else if (this.ui.buildMenu) { this.ui.buildMenu = false; this.ui.selectionChanged = true; } else if (this.selection.size) this.select([]); else this.ui.togglePause(); return; }
      if (e.key === ' ') { if (this.lastAlert) this.centerOn(this.lastAlert.x, this.lastAlert.y); return; }
      if (e.key === 'F1') { e.preventDefault(); this.selectArmy(); return; }
      if (e.key === 'Tab') { e.preventDefault(); this.cycleSubgroup(); return; }
      if (/^F[5-8]$/.test(e.key)) { e.preventDefault(); const k = e.key; this.bookmarks = this.bookmarks || {}; if (e.ctrlKey) { this.bookmarks[k] = { x: this.renderer.cam.x, y: this.renderer.cam.y, z: this.renderer.cam.zoom }; this.ui.alert(`Pozice kamery uložena (${k})`, false); } else if (this.bookmarks[k]) { const b = this.bookmarks[k]; this.renderer.cam.zoom = b.z; this.centerOn(b.x, b.y); } return; }
      if (e.key === 'Backspace') { e.preventDefault(); const halls = [...this.ents.values()].filter(o => o.k === 'b' && o.o === this.me && o.t === 'hall'); if (halls.length) { this.hallIdx = ((this.hallIdx || 0) + 1) % halls.length; const h = halls[this.hallIdx]; this.centerOn(h.x, h.y); this.select([h]); } return; }
      if (k === '.') { this.selectIdleWorker(); return; }
      if (/^[0-9]$/.test(k)) {
        if (e.ctrlKey || e.shiftKey) { this.groups[k] = [...this.selection]; this.ui.alert(`Skupina ${k} uložena`, false); }
        else { const ids = (this.groups[k] || []).map(id => this.ents.get(id)).filter(Boolean); if (ids.length) { const now = performance.now(); if (this.lastGroupKey === k && now - this.lastGroupAt < 350) { this.centerOn(ids[0].x, ids[0].y); } this.lastGroupKey = k; this.lastGroupAt = now; this.select(ids); } }
        return;
      }
      if (e.ctrlKey && k === 'a') { e.preventDefault(); this.selectArmy(); return; }
      // command card hotkeys
      if (this.ui.handleHotkey(this, k)) { e.preventDefault(); return; }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; st.shift = e.shiftKey; st.ctrl = e.ctrlKey; st.altHeld = e.altKey; });
    window.addEventListener('blur', () => { this.keys = {}; });
    window.addEventListener('resize', () => this.renderer.resize());
  }
  updateCursor() {
    const st = this.state;
    let cur = 'default';
    if (st.placing) cur = CURSORS.build;
    else if (st.mode === 'amove' || st.mode === 'attack') cur = CURSORS.attack;
    else if (st.mode === 'patrol') cur = CURSORS.patrol;
    else if (st.mode === 'gather') cur = CURSORS.gather;
    else if (st.mode === 'repair') cur = CURSORS.build;
    else if (st.mode) cur = 'crosshair';
    else if (this.hover && this.hover.o !== undefined && this.players[this.hover.o].team !== this.myTeam && this.myUnitsSelected().length) cur = CURSORS.attack;
    else if (this.hover && (this.hover.k === 't' || this.hover.k === 'm') && this.selectedIds(e => e.k === 'u' && e.o === this.me && this.unitDef(e).role === 'worker').length) cur = CURSORS.gather;
    else if (this.hover) cur = 'pointer';
    if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
  }
  panPixels(dx, dy) {
    const R = this.renderer; const z = R.cam.zoom;
    const wx = (dx / (TW / 2) + dy / (TH / 2)) / 2 / z, wy = (dy / (TH / 2) - dx / (TW / 2)) / 2 / z;
    R.cam.x += wx; R.cam.y += wy; R.clampCamera();
  }

  // ---------- loop ----------
  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000); this.lastFrame = t;
    // camera
    const sp = this.settings.scrollSpeed * 12 * dt; let dx = 0, dy = 0;
    if (this.keys['arrowleft']) dx -= sp; if (this.keys['arrowright']) dx += sp; if (this.keys['arrowup']) dy -= sp; if (this.keys['arrowdown']) dy += sp;
    if (this.settings.edgeScroll && !this.state.midDrag && document.hasFocus()) { const m = this.state.mouse, E = 14; const W = this.renderer.W, H = this.renderer.H; if (m.x >= 0 && m.y >= 0 && m.x < W && m.y < H) { if (m.x < E) dx -= sp; if (m.x > W - E) dx += sp; if (m.y < E) dy -= sp; if (m.y > H - E) dy += sp; } }
    if (dx || dy) this.panPixels(dx, dy);
    // interpolation
    const now = performance.now();
    for (const e of this.ents.values()) {
      if (e.k !== 'u' && e.k !== 'p') continue;
      const k = Math.min(1, (now - e.snapT) / SNAP_MS);
      const nx = e.px + (e.x - e.px) * k, ny = e.py + (e.y - e.py) * k;
      e.moving = Math.hypot(e.x - e.px, e.y - e.py) > 0.02;
      e.rx = nx; e.ry = ny;
      if (e.k === 'u') { let df = (e.f - e.rf); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; e.rf += df * Math.min(1, dt * 14); }
    }
    if (now - this.lastFogAt > 150) { this.lastFogAt = now; this.renderer.updateFog(this.ents, this.myTeam, this.players); }
    this.combatHeat = Math.max(0, this.combatHeat - dt * 0.08); this.audio.setIntensity(this.combatHeat);
    this.renderer.showHp = this.settings.showHp;
    this.renderer.draw(dt, this.state);
    this.ui.frame(this, dt);
    requestAnimationFrame(tt => this.loop(tt));
  }
}
