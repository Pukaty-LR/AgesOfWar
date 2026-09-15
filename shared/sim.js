// Ages of War - authoritative simulation. Runs on the server (and can run headless for tests).
import { ERAS, T, makeTechTable, TICK_RATE, RESEARCH, HERO_XP } from './data.js';
import { generateMap, mulberry32 } from './mapgen.js';
import { astar, smoothPath, nearestTile } from './pathfinding.js';

const DT = 1 / TICK_RATE;
const PROJ_SPEED = { arrow: 14, bolt: 16, bullet: 30, rock: 8, shell: 11, flame: 9, plasma: 16, rail: 45, plasmaShell: 10 };
const PROJ_ARC = { arrow: 0.35, bolt: 0.2, bullet: 0, rock: 0.9, shell: 0.7, flame: 0.05, plasma: 0, rail: 0, plasmaShell: 0.6 };
const MAX_TEAMS = 8;

export class Sim {
  constructor({ seed = 1, size = 96, eraId = 'antiquity', players = [], mapStyle = 'continent', startRes = 'normal' }) {
    this.seed = seed; this.mapStyle = mapStyle;
    const START = { low: { p: 200, s: 100 }, normal: { p: 450, s: 250 }, high: { p: 1500, s: 1000 } }[startRes] || { p: 450, s: 250 };
    this.rng = mulberry32(seed ^ 0x9E3779B9);
    this.eraId = eraId;
    this.era = ERAS[eraId];
    this.tick = 0;
    this.nextId = 1;
    this.ents = new Map();
    this.events = [];
    this.removed = [];
    this.gameOver = null;
    this.map = generateMap(seed, size, Math.max(2, players.filter(p => !p.neutral).length), mapStyle);
    const { w, h } = this.map;
    this.w = w; this.h = h;
    this.blockId = new Int32Array(w * h);      // entity id occupying tile (static)
    this.passLand = new Uint8Array(w * h);
    this.passSea = new Uint8Array(w * h);
    this.buildable = new Uint8Array(w * h);
    this.passTeam = []; for (let t = 0; t < MAX_TEAMS; t++) this.passTeam.push(new Uint8Array(w * h)); // land passability incl. own-team gates
    for (let i = 0; i < w * h; i++) this.recomputeTile(i);
    this.players = players.map((p, idx) => {
      const tech = makeTechTable(eraId, p.faction);
      return {
        id: idx, name: p.name, faction: tech.faction.id, team: p.team ?? idx, color: p.color ?? idx, isAI: !!p.isAI, neutral: !!p.neutral,
        tech, res: { p: START.p, s: START.s }, pop: 0, popCap: 0, alive: true, research: Object.fromEntries(Object.keys(RESEARCH).map(k => [k, 0])),
        stats: { unitsBuilt: 0, unitsLost: 0, unitsKilled: 0, buildingsBuilt: 0, buildingsLost: 0, buildingsRazed: 0, gatheredP: 0, gatheredS: 0 },
        lastAlert: -1000, spawn: this.map.spawns[idx],
      };
    });
    this.cellSize = 2;
    this.gw = Math.ceil(w / this.cellSize); this.gh = Math.ceil(h / this.cellSize);
    this.cells = new Array(this.gw * this.gh); for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.pathBudget = 0;
    this.initWorld();
  }

  // ---------- grid helpers ----------
  tileAt(x, y) { const tx = x | 0, ty = y | 0; if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1; return this.map.tiles[ty * this.w + tx]; }
  isLandTerrain(t) { return t === T.GRASS || t === T.DIRT || t === T.SAND; }
  isWaterTerrain(t) { return t === T.WATER || t === T.SHALLOW; }
  recomputeTile(i) {
    const t = this.map.tiles[i];
    const b = this.blockId[i] !== 0;
    const land = this.isLandTerrain(t);
    this.passLand[i] = (land && !b) ? 1 : 0;
    this.passSea[i] = (this.isWaterTerrain(t) && !b) ? 1 : 0;
    this.buildable[i] = (land && !b) ? 1 : 0;
    // gates: passable for the owner's team only
    let gateTeam = -1;
    if (b) { const e = this.ents.get(this.blockId[i]); if (e && e.kind === 'building' && e.type === 'gate' && e.built) gateTeam = this.players[e.owner].team; }
    for (let tm = 0; tm < MAX_TEAMS; tm++) this.passTeam[tm][i] = (land && (!b || gateTeam === tm)) ? 1 : 0;
  }
  passFor(domain, team = -1) { if (domain === 'sea') return this.passSea; return team >= 0 && team < MAX_TEAMS ? this.passTeam[team] : this.passLand; }
  teamOf(e) { return e && e.owner !== undefined ? this.players[e.owner].team : -1; }
  block(tx, ty, w, h, id) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x; this.blockId[i] = id; this.recomputeTile(i);
    }
  }
  unblock(tx, ty, w, h, id) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x; if (this.blockId[i] === id) { this.blockId[i] = 0; this.recomputeTile(i); }
    }
  }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  footprintFree(tx, ty, w, h, requireLand = true) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (!this.inBounds(x, y)) return false;
      const i = y * this.w + x;
      if (this.blockId[i]) return false;
      if (requireLand && !this.isLandTerrain(this.map.tiles[i])) return false;
    }
    return true;
  }
  touchesWater(tx, ty, w, h) {
    for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
      if (!this.inBounds(x, y)) continue;
      if ((x < tx || x >= tx + w || y < ty || y >= ty + h) && this.isWaterTerrain(this.map.tiles[y * this.w + x])) return true;
    }
    return false;
  }
  canPlace(type, tx, ty, player) {
    const def = player.tech.buildings[type];
    if (!def) return false;
    if (!this.footprintFree(tx, ty, def.w, def.h)) return false;
    if (def.shore && !this.touchesWater(tx, ty, def.w, def.h)) return false;
    // no unit standing inside (except we allow: units get pushed out) -> allow
    return true;
  }

  // ---------- entities ----------
  add(e) { e.id = this.nextId++; e.dirty = true; this.ents.set(e.id, e); return e; }
  remove(e) {
    if (!this.ents.has(e.id)) return;
    this.ents.delete(e.id);
    this.removed.push(e.id);
    if (e.kind === 'building' || e.kind === 'tree' || e.kind === 'mine') this.unblock(e.tx, e.ty, e.w, e.h, e.id);
  }
  player(id) { return this.players[id]; }
  isEnemy(a, b) { return a.owner !== undefined && b.owner !== undefined && a.owner !== b.owner && this.players[a.owner].team !== this.players[b.owner].team; }

  initWorld() {
    const m = this.map;
    for (const t of m.trees) {
      const e = this.add({ kind: 'tree', tx: t.tx, ty: t.ty, w: 1, h: 1, x: t.tx + 0.5, y: t.ty + 0.5, amount: this.era.nodes.secondary.amount, v: t.v, hp: 1, maxHp: 1 });
      this.block(t.tx, t.ty, 1, 1, e.id);
    }
    for (const mn of m.mines) {
      const e = this.add({ kind: 'mine', tx: mn.tx - 1, ty: mn.ty - 1, w: 2, h: 2, x: mn.tx, y: mn.ty, amount: mn.amount, hp: 1, maxHp: 1 });
      this.block(e.tx, e.ty, 2, 2, e.id);
    }
    for (const p of this.players) {
      if (p.neutral) continue;
      const s = p.spawn;
      const hall = this.placeBuilding(p, 'hall', s.x - 1, s.y - 1, true);
      hall.built = true; hall.progress = 1; hall.hp = hall.maxHp;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        this.spawnUnit(p, 'worker', s.x + 0.5 + Math.cos(a) * 2.6, s.y + 0.5 + Math.sin(a) * 2.6);
      }
      this.recountPop(p);
    }
    // neutral creeps guard the mines far from every base (WC3 style)
    const neutral = this.players.find(p => p.neutral);
    if (neutral && this.era.units.creep) {
      for (const mn of m.mines) {
        const far = m.spawns.every(s => Math.hypot(s.x - mn.tx, s.y - mn.ty) > 14);
        if (!far) continue;
        const n = 3 + Math.floor(this.rng() * 2);
        for (let i = 0; i < n; i++) {
          const a = this.rng() * Math.PI * 2, d = 2.6 + this.rng() * 1.2;
          const x = mn.tx + Math.cos(a) * d, y = mn.ty + Math.sin(a) * d;
          if (!this.inBounds(x | 0, y | 0) || !this.passLand[(y | 0) * this.w + (x | 0)]) continue;
          const u = this.spawnUnit(neutral, 'creep', x, y); u.order = { type: 'idle' }; u.home = { x: u.x, y: u.y };
        }
      }
      neutral.stats.unitsBuilt = 0;
    }
  }

  placeBuilding(p, type, tx, ty, instant = false) {
    const def = p.tech.buildings[type];
    const e = this.add({
      kind: 'building', type, owner: p.id, tx, ty, w: def.w, h: def.h, x: tx + def.w / 2, y: ty + def.h / 2,
      hp: instant ? def.hp : Math.max(1, def.hp * 0.1), maxHp: def.hp, built: instant, progress: instant ? 1 : 0,
      queue: [], rally: null, cooldown: 0, builders: 0, lastAttackTick: -100, dead: false, level: 1,
    });
    this.block(tx, ty, def.w, def.h, e.id);
    // Push out units standing inside
    for (const u of this.ents.values()) {
      if (u.kind !== 'unit') continue;
      if (u.x >= tx && u.x < tx + def.w && u.y >= ty && u.y < ty + def.h) {
        const t = this.findSpawnTile(e, u.domain);
        if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; u.dirty = true; }
      }
    }
    return e;
  }

  spawnUnit(p, type, x, y) {
    const def = p.tech.units[type];
    const e = this.add({
      kind: 'unit', type, role: def.role, owner: p.id, x, y, hp: def.hp, maxHp: def.hp, facing: this.rng() * Math.PI * 2,
      domain: def.domain, size: def.size, speed: def.speed, order: { type: 'idle' }, queue: [], path: null,
      cooldown: 0, engage: 0, lastAttackTick: -100, anim: 'idle', hidden: false, carry: null, stuck: 0, lastX: x, lastY: y, repathAt: 0, dead: false, home: null,
    });
    p.stats.unitsBuilt++;
    return e;
  }

  findSpawnTile(b, domain) {
    const pass = this.passFor(domain, this.teamOf(b));
    for (let r = 1; r < 8; r++) {
      const cands = [];
      for (let y = b.ty - r; y <= b.ty + b.h - 1 + r; y++) for (let x = b.tx - r; x <= b.tx + b.w - 1 + r; x++) {
        if (x !== b.tx - r && x !== b.tx + b.w - 1 + r && y !== b.ty - r && y !== b.ty + b.h - 1 + r) continue;
        if (!this.inBounds(x, y)) continue;
        if (pass[y * this.w + x]) cands.push({ x, y });
      }
      if (cands.length) {
        // prefer tiles toward rally point
        if (b.rally) cands.sort((a, c) => Math.hypot(a.x + 0.5 - b.rally.x, a.y + 0.5 - b.rally.y) - Math.hypot(c.x + 0.5 - b.rally.x, c.y + 0.5 - b.rally.y));
        else cands.sort((a, c) => (a.y - c.y) || (a.x - c.x)); // deterministic-ish: bottom first
        return cands[b.rally ? 0 : cands.length - 1];
      }
    }
    return null;
  }

  recountPop(p) {
    let pop = 0, cap = 0;
    for (const e of this.ents.values()) {
      if (e.owner !== p.id) continue;
      if (e.kind === 'unit') { if (!p.tech.units[e.type].creep) pop += p.tech.units[e.type].pop; }
      else if (e.kind === 'building' && e.built && p.tech.buildings[e.type].popCap) { cap += p.tech.buildings[e.type].popCap; for (const up of p.tech.buildings[e.type].upgrades || []) if (up.level <= (e.level || 1) && up.popCap) cap += up.popCap; }
    }
    p.pop = pop; p.popCap = Math.min(200, cap); p.dirty = true;
  }

  // ---------- spatial ----------
  rebuildCells() {
    for (const c of this.cells) c.length = 0;
    const cs = this.cellSize;
    for (const e of this.ents.values()) {
      if (e.kind !== 'unit' || e.hidden) continue;
      const cx = Math.min(this.gw - 1, Math.max(0, (e.x / cs) | 0)), cy = Math.min(this.gh - 1, Math.max(0, (e.y / cs) | 0));
      this.cells[cy * this.gw + cx].push(e);
    }
  }
  unitsNear(x, y, r, fn) {
    const cs = this.cellSize;
    const x0 = Math.max(0, ((x - r) / cs) | 0), x1 = Math.min(this.gw - 1, ((x + r) / cs) | 0);
    const y0 = Math.max(0, ((y - r) / cs) | 0), y1 = Math.min(this.gh - 1, ((y + r) / cs) | 0);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const cell = this.cells[cy * this.gw + cx];
      for (let i = 0; i < cell.length; i++) { const e = cell[i]; const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) fn(e); }
    }
  }
  distToEntity(x, y, e) {
    if (e.kind === 'unit') return Math.max(0, Math.hypot(e.x - x, e.y - y) - e.size);
    // rectangle footprint
    const dx = Math.max(e.tx - x, 0, x - (e.tx + e.w)), dy = Math.max(e.ty - y, 0, y - (e.ty + e.h));
    return Math.hypot(dx, dy);
  }
  nearestEnemy(u, range, includeBuildings = true, preferUnits = true) {
    let best = null, bestD = Infinity;
    const p = this.players[u.owner];
    this.unitsNear(u.x, u.y, range + 1, e => {
      if (e.owner === undefined || e.dead || e.hp <= 0) return;
      if (this.players[e.owner].team === p.team) return;
      const d = this.distToEntity(u.x, u.y, e);
      if (d <= range && d < bestD) { best = e; bestD = d; }
    });
    if (includeBuildings) {
      for (const e of this.ents.values()) {
        if (e.kind !== 'building' || e.dead || this.players[e.owner].team === p.team) continue;
        const d = this.distToEntity(u.x, u.y, e) + (preferUnits ? 2.5 : 0) + (e.type === 'wall' ? 4 : 0);
        if (d <= range && d < bestD) { best = e; bestD = d; }
      }
    }
    return best;
  }

  // ---------- commands ----------
  command(pid, c) {
    const p = this.players[pid];
    if (!p || !p.alive || this.gameOver) return;
    const units = (c.ids || []).map(id => this.ents.get(id)).filter(e => e && e.owner === pid && !e.dead);
    const myUnits = units.filter(e => e.kind === 'unit');
    switch (c.t) {
      case 'smart': {
        const target = c.targetId ? this.ents.get(c.targetId) : null;
        for (const u of myUnits) {
          if (target && !target.dead) {
            if ((target.kind === 'tree' || target.kind === 'mine') && u.role === 'worker') { this.setOrder(u, { type: 'gather', targetId: target.id, phase: 'go' }, c.queue); continue; }
            if (target.owner !== undefined && this.isEnemy(u, target)) { this.setOrder(u, { type: 'attack', targetId: target.id }, c.queue); continue; }
            if (target.kind === 'building' && target.owner === pid && u.role === 'worker' && (!target.built || target.hp < target.maxHp)) { this.setOrder(u, { type: 'build', targetId: target.id }, c.queue); continue; }
          }
          if (u.hidden) continue;
          if (!c._f) c._f = this.formation(myUnits, c.x, c.y);
          const fi = myUnits.indexOf(u);
          this.setOrder(u, { type: 'move', x: c._f[fi].x, y: c._f[fi].y }, c.queue);
        }
        // Buildings: smart = rally
        for (const b of units.filter(e => e.kind === 'building')) this.setRally(b, c.x, c.y, target ? target.id : 0);
        break;
      }
      case 'move': { const f = this.formation(myUnits, c.x, c.y); myUnits.forEach((u, i) => this.setOrder(u, { type: 'move', x: f[i].x, y: f[i].y }, c.queue)); break; }
      case 'amove': { const f = this.formation(myUnits, c.x, c.y); myUnits.forEach((u, i) => this.setOrder(u, { type: 'amove', x: f[i].x, y: f[i].y }, c.queue)); break; }
      case 'patrol': { const f = this.formation(myUnits, c.x, c.y); myUnits.forEach((u, i) => { if (u.role === 'worker' || u.hidden) return; this.setOrder(u, { type: 'patrol', x: f[i].x, y: f[i].y, x0: u.x, y0: u.y }, c.queue); }); break; }
      case 'attack': { const t = this.ents.get(c.targetId); if (!t || t.dead) break; for (const u of myUnits) this.setOrder(u, { type: 'attack', targetId: t.id }, c.queue); break; }
      case 'stop': for (const u of myUnits) { u.queue = []; this.setOrder(u, { type: 'idle' }); } break;
      case 'hold': for (const u of myUnits) { u.queue = []; this.setOrder(u, { type: 'hold' }); } break;
      case 'gather': { const t = this.ents.get(c.targetId); if (!t || (t.kind !== 'tree' && t.kind !== 'mine')) break; for (const u of myUnits) if (u.role === 'worker') this.setOrder(u, { type: 'gather', targetId: t.id, phase: 'go' }, c.queue); break; }
      case 'build': {
        const workers = myUnits.filter(u => u.role === 'worker');
        if (!workers.length) break;
        const def = p.tech.buildings[c.type]; if (!def || def.isWall) break;
        if (!this.canPlace(c.type, c.tx, c.ty, p)) { this.events.push({ t: 'msg', owner: pid, text: 'Tady stavět nelze.' }); break; }
        if (p.res.p < def.cost.p || p.res.s < def.cost.s) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek surovin.' }); break; }
        p.res.p -= def.cost.p; p.res.s -= def.cost.s; p.dirty = true;
        const b = this.placeBuilding(p, c.type, c.tx, c.ty, false);
        for (const u of workers) this.setOrder(u, { type: 'build', targetId: b.id }, c.queue);
        this.events.push({ t: 'place', x: b.x, y: b.y, owner: pid });
        break;
      }
      case 'wall': {
        const workers = myUnits.filter(u => u.role === 'worker');
        if (!workers.length) break;
        const tiles = this.wallPath(c.x0, c.y0, c.x1, c.y1);
        if (!tiles || !tiles.length) { this.events.push({ t: 'msg', owner: pid, text: 'Hradbu tudy nelze postavit.' }); break; }
        const def = p.tech.buildings.wall;
        let placed = 0;
        const segs = [];
        for (const tl of tiles) {
          if (p.res.p < def.cost.p || p.res.s < def.cost.s) break;
          if (!this.footprintFree(tl.x, tl.y, 1, 1)) continue;
          p.res.p -= def.cost.p; p.res.s -= def.cost.s;
          segs.push(this.placeBuilding(p, 'wall', tl.x, tl.y, false)); placed++;
        }
        p.dirty = true;
        if (placed < tiles.length) this.events.push({ t: 'msg', owner: pid, text: placed ? 'Suroviny stačily jen na část hradby.' : 'Nedostatek surovin.' });
        // distribute segments: each worker gets segments starting from its nearest end
        workers.forEach((u, wi) => {
          const mine = segs.filter((s, si) => si % workers.length === wi);
          if (!mine.length) return;
          mine.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
          // walk along chain order rather than pure distance: sort by index in segs after choosing nearest end
          const first = segs.indexOf(mine[0]);
          const ordered = segs.indexOf(mine[mine.length - 1]) < first ? mine.slice().reverse() : mine;
          ordered.forEach((s, k) => this.setOrder(u, { type: 'build', targetId: s.id }, k > 0 || c.queue));
        });
        break;
      }
      case 'train': {
        const b = this.ents.get(c.id); if (!b || b.kind !== 'building' || b.owner !== pid || !b.built) break;
        if (!this.availableTrains(p, b).includes(c.type)) break;
        const udef = p.tech.units[c.type];
        if (b.queue.length >= 7) break;
        if (udef.unique) { let exists = false; for (const e of this.ents.values()) { if (e.owner === pid && ((e.kind === 'unit' && e.type === c.type) || (e.kind === 'building' && e.queue && e.queue.some(q => q.type === c.type)))) { exists = true; break; } } if (exists) { this.events.push({ t: 'msg', owner: pid, text: `${udef.name} může být jen jeden.` }); break; } }
        if (p.res.p < udef.cost.p || p.res.s < udef.cost.s) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek surovin.' }); break; }
        if (p.pop + udef.pop > p.popCap) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek populace – postav další radnici.' }); break; }
        p.res.p -= udef.cost.p; p.res.s -= udef.cost.s; p.dirty = true;
        b.queue.push({ type: c.type, progress: 0 }); b.dirty = true;
        break;
      }
      case 'cancelTrain': {
        const b = this.ents.get(c.id); if (!b || b.kind !== 'building' || b.owner !== pid) break;
        const idx = c.index ?? b.queue.length - 1;
        if (idx < 0 || idx >= b.queue.length) break;
        const q = b.queue.splice(idx, 1)[0]; const cost = this.queueCost(p, b, q);
        p.res.p += cost.p; p.res.s += cost.s; p.dirty = true; b.dirty = true;
        break;
      }
      case 'upgrade': {
        const b = this.ents.get(c.id); if (!b || b.kind !== 'building' || b.owner !== pid || !b.built) break;
        const up = this.nextUpgrade(p, b); if (!up) break;
        if (b.queue.some(q => q.type === '__up')) break;
        if (up.hall && this.hallLevel(pid) < up.hall) { this.events.push({ t: 'msg', owner: pid, text: `Vyžaduje radnici úrovně ${up.hall}.` }); break; }
        if (p.res.p < up.cost.p || p.res.s < up.cost.s) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek surovin.' }); break; }
        p.res.p -= up.cost.p; p.res.s -= up.cost.s; p.dirty = true;
        b.queue.push({ type: '__up', progress: 0 }); b.dirty = true;
        break;
      }
      case 'ability': { // hero active ability (war cry): timed buff for allies around the hero
        for (const u of myUnits) {
          const def = p.tech.units[u.type]; const ab = def.ability; if (!ab) continue;
          if (u.abilityReady && this.tick < u.abilityReady) { this.events.push({ t: 'msg', owner: pid, text: `${ab.name}: ještě ${Math.ceil((u.abilityReady - this.tick) / 20)} s.` }); continue; }
          u.abilityReady = this.tick + ab.cooldown * 20; u.buffUntil = this.tick + ab.duration * 20; u.dirty = true;
          this.events.push({ t: 'ability', x: u.x, y: u.y, r: ab.range, o: pid, name: ab.name });
        }
        break;
      }
      case 'research': {
        const b = this.ents.get(c.id); if (!b || b.kind !== 'building' || b.owner !== pid || !b.built) break;
        const rd = RESEARCH[c.rid]; if (!rd || rd.building !== b.type) break;
        const lvl = p.research[c.rid] || 0; if (lvl >= rd.maxLevel) break;
        // one research of this kind at a time across all buildings
        let busy = false; for (const e of this.ents.values()) if (e.kind === 'building' && e.owner === pid && e.queue && e.queue.some(q => q.type === '__res' && q.rid === c.rid)) busy = true;
        if (busy) { this.events.push({ t: 'msg', owner: pid, text: 'Tento výzkum už probíhá.' }); break; }
        const cost = this.researchCost(c.rid, lvl + 1);
        if (p.res.p < cost.p || p.res.s < cost.s) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek surovin.' }); break; }
        p.res.p -= cost.p; p.res.s -= cost.s; p.dirty = true;
        b.queue.push({ type: '__res', rid: c.rid, progress: 0 }); b.dirty = true;
        break;
      }
      case 'gate': { // toggle wall <-> gate for selected wall segments
        for (const b of units.filter(e => e.kind === 'building' && e.built && (e.type === 'wall' || e.type === 'gate'))) {
          const to = b.type === 'wall' ? 'gate' : 'wall';
          const def = p.tech.buildings[to];
          if (to === 'gate') { if (p.res.s < def.cost.s) { this.events.push({ t: 'msg', owner: pid, text: 'Nedostatek surovin.' }); break; } p.res.s -= def.cost.s; }
          b.type = to; b.maxHp = def.hp; b.hp = Math.min(b.hp, b.maxHp); b.dirty = true;
          this.block(b.tx, b.ty, 1, 1, b.id); // recompute team passability
        }
        p.dirty = true;
        break;
      }
      case 'rally': for (const b of units.filter(e => e.kind === 'building')) this.setRally(b, c.x, c.y, c.targetId || 0); break;
      case 'cancelBuild': {
        const b = this.ents.get(c.id); if (!b || b.kind !== 'building' || b.owner !== pid) break;
        const def = p.tech.buildings[b.type];
        if (!b.built) { p.res.p += Math.round(def.cost.p * 0.75); p.res.s += Math.round(def.cost.s * 0.75); }
        this.killBuilding(b, null, true);
        p.dirty = true;
        break;
      }
      case 'demolish': { // tear down own finished buildings (walls included); small refund
        for (const b of units.filter(e => e.kind === 'building')) {
          const def = p.tech.buildings[b.type];
          if (b.built) { p.res.p += Math.round(def.cost.p * 0.25); p.res.s += Math.round(def.cost.s * 0.25); }
          this.events.push({ t: 'death', x: b.x, y: b.y, o: b.owner, k: 'building', ty: b.type, w: b.w, h: b.h, demolished: true });
          this.killBuilding(b, null, true);
        }
        p.dirty = true;
        break;
      }
      case 'gatherKind': { // find nearest resource of a kind for each worker
        const kind = c.kind === 'mine' ? 'mine' : 'tree';
        for (const u of myUnits) {
          if (u.role !== 'worker') continue;
          const node = this.nearestNode(u, kind, 60);
          if (node) this.setOrder(u, { type: 'gather', targetId: node.id, phase: 'go' }, c.queue);
        }
        break;
      }
      case 'chat': break;
    }
  }

  setRally(b, x, y, targetId) { b.rally = { x, y, targetId }; b.dirty = true; }

  /** WC3-style formation: spread a group into a block facing the direction of travel; falls back to the point for unreachable cells. */
  formation(units, x, y) {
    const n = units.length; if (n <= 1) return units.map(() => ({ x, y }));
    const cx = units.reduce((s, u) => s + u.x, 0) / n, cy = units.reduce((s, u) => s + u.y, 0) / n;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; const fx = dx / d, fy = dy / d; // forward
    const rx = -fy, ry = fx; // right
    const cols = Math.min(8, Math.ceil(Math.sqrt(n * 1.6))); const rows = Math.ceil(n / cols);
    const sp = 0.85 + Math.max(...units.map(u => u.size)) * 0.6;
    // sort: melee/high-hp first rows, ranged/siege behind, keep relative left-right order
    const order = units.map((u, i) => ({ u, i, rank: u.role === 'siege' ? 3 : (u.role === 'ranged' ? 2 : (u.role === 'worker' ? 1 : 0)), side: (u.x - cx) * rx + (u.y - cy) * ry })).sort((a, b) => a.rank - b.rank || a.side - b.side);
    const out = new Array(n);
    order.forEach((o, k) => {
      const r = Math.floor(k / cols), c = k % cols; const rowCount = Math.min(cols, n - r * cols);
      const off = (c - (rowCount - 1) / 2) * sp, back = -r * sp;
      let tx = x + rx * off + fx * back, ty = y + ry * off + fy * back;
      const pass = this.passFor(o.u.domain, this.teamOf(o.u));
      if (!this.inBounds(tx | 0, ty | 0) || !pass[(ty | 0) * this.w + (tx | 0)]) {
        const nt = nearestTile(this.w, this.h, tx | 0, ty | 0, (px, py) => pass[py * this.w + px] === 1, 3);
        if (nt) { tx = nt.x + 0.5; ty = nt.y + 0.5; } else { tx = x; ty = y; }
      }
      out[o.i] = { x: tx, y: ty };
    });
    return out;
  }

  // ---------- tiers / upgrades ----------
  availableTrains(p, b) {
    const def = p.tech.buildings[b.type]; const out = [...(def.trains || [])];
    for (const up of def.upgrades || []) if (up.level <= (b.level || 1)) out.push(...up.unlocks);
    return out;
  }
  buildingAttack(p, b) {
    const def = p.tech.buildings[b.type]; let dmg = def.attack.dmg, range = def.attack.range, armor = def.armor;
    for (const up of def.upgrades || []) if (up.level <= (b.level || 1)) { if (up.dmgMul) dmg *= up.dmgMul; if (up.rangeAdd) range += up.rangeAdd; if (up.armorAdd) armor += up.armorAdd; }
    return { dmg, range, armor };
  }
  buildingArmor(p, b) { const def = p.tech.buildings[b.type]; let armor = def.armor; for (const up of def.upgrades || []) if (up.level <= (b.level || 1) && up.armorAdd) armor += up.armorAdd; return armor; }
  nextUpgrade(p, b) { const def = p.tech.buildings[b.type]; return (def.upgrades || []).find(u => u.level === (b.level || 1) + 1) || null; }
  hallLevel(pid) { let lv = 0; for (const e of this.ents.values()) if (e.kind === 'building' && e.owner === pid && e.type === 'hall' && e.built && !e.dead) lv = Math.max(lv, e.level || 1); return lv; }
  queueCost(p, b, q) { if (q.type === '__up') { const up = this.nextUpgrade(p, b); return up ? up.cost : { p: 0, s: 0 }; } if (q.type === '__res') return this.researchCost(q.rid, (p.research[q.rid] || 0) + 1); const ud = p.tech.units[q.type]; return ud ? ud.cost : { p: 0, s: 0 }; }
  researchCost(rid, level) { const rd = RESEARCH[rid]; return { p: rd.cost.p * level, s: rd.cost.s * level }; }
  /** effective unit damage / armor incl. research */
  unitDmg(p, def) { let d = def.dmg; for (const [rid, rd] of Object.entries(RESEARCH)) { const l = p.research[rid] || 0; if (!l || !rd.roles.includes(def.role)) continue; if (rd.dmgAdd) d += rd.dmgAdd * l; if (rd.dmgMul) d *= Math.pow(rd.dmgMul, l); } return d; }
  unitArmor(p, def) { let a = def.armor; for (const [rid, rd] of Object.entries(RESEARCH)) { const l = p.research[rid] || 0; if (!l || !rd.roles.includes(def.role)) continue; if (rd.armorAdd) a += rd.armorAdd * l; } return a; }
  auraMult(u) {
    let m = 1; const p = this.players[u.owner];
    for (const e of this.ents.values()) {
      if (e.kind !== 'unit' || e.dead || e.owner === undefined || this.players[e.owner].team !== p.team) continue;
      const d = this.players[e.owner].tech.units[e.type]; if (!d.aura) continue;
      const dist = Math.hypot(e.x - u.x, e.y - u.y);
      if (dist <= d.aura.range + ((e.level || 1) - 1) * 0.5) m = Math.max(m, d.aura.dmg + ((e.level || 1) - 1) * 0.03);
      if (d.ability && e.buffUntil > this.tick && dist <= d.ability.range) m = Math.max(m, d.ability.dmg);
    }
    return m;
  }
  buffArmor(u) {
    const p = this.players[u.owner]; let a = 0;
    for (const e of this.ents.values()) {
      if (e.kind !== 'unit' || e.dead || e.owner === undefined || this.players[e.owner].team !== p.team) continue;
      const d = this.players[e.owner].tech.units[e.type]; if (!d.ability || !(e.buffUntil > this.tick)) continue;
      if (Math.hypot(e.x - u.x, e.y - u.y) <= d.ability.range) a = Math.max(a, d.ability.armor || 0);
    }
    return a;
  }

  setOrder(u, order, queue = false) {
    if (queue && u.order.type !== 'idle') { u.queue.push(order); return; }
    // AoE-style: a worker pulled from gathering to build returns to the same resource afterwards
    if (order.type === 'build' && u.order.type === 'gather') u.resume = { type: 'gather', targetId: u.order.targetId, kind: u.order.kind, phase: 'go' };
    else if (order.type !== 'build') u.resume = null;
    u.queue = queue ? u.queue : [];
    u.order = order; u.path = null; u.engage = 0; u.stuck = 0; u.dirty = true;
    if (order.type === 'idle' || order.type === 'hold') u.anim = 'idle';
    if (order.type === 'move' || order.type === 'amove') u.home = null;
  }
  nextOrder(u) {
    if (u.queue.length) { const o = u.queue.shift(); u.order = o; u.path = null; u.engage = 0; u.stuck = 0; u.dirty = true; }
    else if (u.resume && u.order.type === 'build') { const r = u.resume; u.resume = null; const node = this.ents.get(r.targetId); u.order = node && !node.dead ? { ...r } : { type: 'idle' }; if (u.order.type === 'gather') { u.order.kind = node.kind; } u.path = null; u.dirty = true; }
    else { u.order = { type: 'idle' }; u.path = null; u.anim = 'idle'; u.dirty = true; }
  }

  wallPath(x0, y0, x1, y1) {
    if (!this.inBounds(x0, y0) || !this.inBounds(x1, y1)) return null;
    const g = this.buildable;
    if (!g[y0 * this.w + x0] || !g[y1 * this.w + x1]) return null;
    if (x0 === x1 && y0 === y1) return [{ x: x0, y: y0 }];
    const p = astar(g, this.w, this.h, x0, y0, (x, y) => x === x1 && y === y1, x1, y1, 20000);
    if (!p) return null;
    const last = p[p.length - 1];
    if (!last || last.x !== x1 || last.y !== y1) return null;
    return [{ x: x0, y: y0 }, ...p];
  }

  // ---------- main step ----------
  step() {
    this.tick++;
    this.pathBudget = 60;
    this.rebuildCells();
    for (const e of Array.from(this.ents.values())) {
      if (e.dead) continue;
      if (e.kind === 'unit') this.stepUnit(e);
      else if (e.kind === 'building') this.stepBuilding(e);
      else if (e.kind === 'proj') this.stepProj(e);
    }
    if (this.tick % 20 === 0) this.checkVictory();
  }

  // ---------- units ----------
  stepUnit(u) {
    const p = this.players[u.owner];
    const def = p.tech.units[u.type];
    if (u.cooldown > 0) u.cooldown -= DT;
    const o = u.order;
    let moved = false;
    switch (o.type) {
      case 'idle':
      case 'hold': {
        if (def.dmg > 0 && u.role !== 'worker') {
          if (u.engage) {
            const t = this.ents.get(u.engage);
            if (!t || t.dead || (o.type === 'idle' && u.home && Math.hypot(u.x - u.home.x, u.y - u.home.y) > 9)) { u.engage = 0; u.path = null; if (u.home && o.type === 'idle') { u.order = { type: 'move', x: u.home.x, y: u.home.y, thenIdle: true }; u.home = null; } }
            else moved = this.attackTarget(u, def, t, o.type === 'idle');
          }
          if (!u.engage && (this.tick + u.id) % 6 === 0) {
            const t = this.nearestEnemy(u, o.type === 'hold' ? def.range + u.size + 0.2 : Math.max(def.sight, def.range + 1), true);
            if (t) { u.engage = t.id; u.path = null; if (o.type === 'idle' && !u.home) u.home = { x: u.x, y: u.y }; }
          }
        }
        if (!u.engage) u.anim = 'idle';
        break;
      }
      case 'move': {
        moved = this.moveTo(u, def, o.x, o.y, 0.35);
        if (!moved) { if (o.thenIdle) { u.order = { type: 'idle' }; u.dirty = true; } else this.nextOrder(u); }
        break;
      }
      case 'amove': {
        if (def.dmg > 0 && u.role !== 'worker') {
          if (u.engage) {
            const t = this.ents.get(u.engage);
            if (!t || t.dead) { u.engage = 0; u.path = null; }
            else { moved = this.attackTarget(u, def, t, true); break; }
          }
          if ((this.tick + u.id) % 5 === 0) {
            const t = this.nearestEnemy(u, Math.max(def.sight, def.range + 1), true);
            if (t) { u.engage = t.id; u.path = null; break; }
          }
        }
        moved = this.moveTo(u, def, o.x, o.y, 0.35);
        if (!moved) this.nextOrder(u);
        break;
      }
      case 'attack': {
        const t = this.ents.get(o.targetId);
        if (!t || t.dead || t.hp <= 0) { this.nextOrder(u); break; }
        moved = this.attackTarget(u, def, t, true);
        break;
      }
      case 'patrol': {
        if (def.dmg > 0) {
          if (u.engage) { const t = this.ents.get(u.engage); if (!t || t.dead) { u.engage = 0; u.path = null; } else { moved = this.attackTarget(u, def, t, true); break; } }
          if ((this.tick + u.id) % 5 === 0) { const t = this.nearestEnemy(u, Math.max(def.sight, def.range + 1), true); if (t) { u.engage = t.id; u.path = null; break; } }
        }
        moved = this.moveTo(u, def, o.x, o.y, 0.4);
        if (!moved) { const nx = o.x0, ny = o.y0; o.x0 = o.x; o.y0 = o.y; o.x = nx; o.y = ny; u.path = null; u.dirty = true; moved = true; }
        break;
      }
      case 'gather': moved = this.stepGather(u, def, o); break;
      case 'build': moved = this.stepBuild(u, def, o); break;
    }
    if (moved) u.anim = 'walk';
    // separation
    if (!u.hidden && (moved || (this.tick + u.id) % 2 === 0)) this.separate(u);
    if (u.x !== u.lastX || u.y !== u.lastY) { u.dirty = true; u.lastX = u.x; u.lastY = u.y; }
  }

  separate(u) {
    let px = 0, py = 0, n = 0;
    const self = u;
    this.unitsNear(u.x, u.y, 1.2, e => {
      if (e === self || e.domain !== self.domain) return;
      const dx = self.x - e.x, dy = self.y - e.y;
      const d = Math.hypot(dx, dy); const min = self.size + e.size;
      if (d < min && d > 1e-4) { const f = (min - d) / min; px += dx / d * f; py += dy / d * f; n++; }
      else if (d <= 1e-4) { px += (this.rng() - 0.5); py += (this.rng() - 0.5); n++; }
    });
    if (!n) return;
    const holdF = u.order.type === 'hold' ? 0 : (u.order.type === 'idle' && !u.engage ? 0.9 : 0.5);
    const k = 0.08 * holdF;
    if (!k) return;
    this.tryMove(u, u.x + px * k, u.y + py * k);
  }

  tryMove(u, nx, ny) {
    const pass = this.passFor(u.domain, this.teamOf(u));
    const tx0 = u.x | 0, ty0 = u.y | 0;
    const clampX = Math.min(this.w - 0.05, Math.max(0.05, nx)), clampY = Math.min(this.h - 0.05, Math.max(0.05, ny));
    const tx1 = clampX | 0, ty1 = clampY | 0;
    const ok = (tx, ty) => this.inBounds(tx, ty) && pass[ty * this.w + tx];
    if (ok(tx1, ty1) && (tx1 === tx0 || ty1 === ty0 || (ok(tx1, ty0) && ok(tx0, ty1)))) { u.x = clampX; u.y = clampY; return true; }
    // slide
    if (ok(tx1, ty0)) { u.x = clampX; return true; }
    if (ok(tx0, ty1)) { u.y = clampY; return true; }
    // standing on a blocked tile (e.g. building placed on us): allow any move that lands on passable
    if (!ok(tx0, ty0) && ok(tx1, ty1)) { u.x = clampX; u.y = clampY; return true; }
    return false;
  }

  /** Move toward (x,y). Returns true if still moving; false when arrived or cannot path. */
  moveTo(u, def, x, y, arriveDist, goalTest = null, hx = x, hy = y) {
    const d = Math.hypot(x - u.x, y - u.y);
    if (!goalTest && d <= arriveDist) return false;
    if (goalTest && goalTest(u.x | 0, u.y | 0) && d <= arriveDist) return false;
    if (!u.path || (u.path.length === 0)) {
      if (u.path && u.path.length === 0) { return false; }
      if (this.pathBudget <= 0) { return true; } // wait for next tick
      this.pathBudget--;
      const pass = this.passFor(u.domain, this.teamOf(u));
      const gt = goalTest || ((tx, ty) => tx === (x | 0) && ty === (y | 0));
      let raw = astar(pass, this.w, this.h, u.x | 0, u.y | 0, gt, hx | 0, hy | 0, 9000);
      if (raw === null) { u.path = []; return false; }
      raw = smoothPath(pass, this.w, this.h, u.x | 0, u.y | 0, raw);
      u.path = raw.map(t => ({ x: t.x + 0.5, y: t.y + 0.5 }));
      if (!goalTest) u.path.push({ x, y });
      else if (u.path.length === 0) { u.path = [{ x: u.x, y: u.y }]; }
      u.repathAt = this.tick;
      if (u.path.length === 0) return false;
    }
    const wp = u.path[0];
    const dx = wp.x - u.x, dy = wp.y - u.y, dist = Math.hypot(dx, dy);
    const stepLen = u.speed * DT;
    if (dist <= stepLen + 0.02) {
      u.x = wp.x; u.y = wp.y; u.path.shift();
      if (!u.path.length) return false;
      return true;
    }
    u.facing = Math.atan2(dy, dx);
    const ox = u.x, oy = u.y;
    if (!this.tryMove(u, u.x + dx / dist * stepLen, u.y + dy / dist * stepLen)) { u.stuck += 3; }
    if (Math.hypot(u.x - ox, u.y - oy) < stepLen * 0.3) u.stuck++; else u.stuck = Math.max(0, u.stuck - 1);
    if (u.stuck > 24) { u.path = null; u.stuck = 0; }
    return true;
  }

  attackTarget(u, def, t, chase) {
    const range = def.range + u.size;
    const d = this.distToEntity(u.x, u.y, t);
    const tooClose = def.minRange && d < def.minRange;
    if (d <= range && !tooClose) {
      u.path = null;
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cooldown <= 0) {
        u.cooldown = def.cooldown; u.lastAttackTick = this.tick; u.anim = 'attack'; u.dirty = true;
        this.fire(u, def, t);
      }
      return false;
    }
    if (!chase) return false;
    if (tooClose) { // back off
      const ax = u.x - (t.x - u.x), ay = u.y - (t.y - u.y);
      return this.moveTo(u, def, ax, ay, 0.3);
    }
    // path to within range of target (goal test by distance)
    if (t.kind === 'unit' && u.path && u.path.length && (this.tick - u.repathAt) > 12 && Math.hypot(t.x - u.path[u.path.length - 1].x, t.y - u.path[u.path.length - 1].y) > 1.2) u.path = null;
    const gt = (tx, ty) => this.distToEntity(tx + 0.5, ty + 0.5, t) <= Math.max(0.7, range - 0.3);
    const still = this.moveTo(u, def, t.x, t.y, range, gt, t.x, t.y);
    if (!still && this.distToEntity(u.x, u.y, t) > range + 0.3) { // unreachable: retry later
      if (u.path && u.path.length === 0) { if ((this.tick + u.id) % 40 === 0) u.path = null; }
    }
    return still;
  }

  fire(u, def, t) {
    const dmg = this.unitDmg(this.players[u.owner], def) * this.auraMult(u) * (def.aura ? this.heroMult(u) : 1);
    if (def.projectile) {
      const speed = PROJ_SPEED[def.projectile] || 12;
      this.add({ kind: 'proj', type: def.projectile, x: u.x, y: u.y, sx: u.x, sy: u.y, tx: t.x, ty: t.y, targetId: t.id, speed, dmg, owner: u.owner, attackerId: u.id, attackerType: u.type, attackerRole: u.role, bonus: def.bonus || {}, splash: def.splash || 0, arc: PROJ_ARC[def.projectile] || 0, total: Math.hypot(t.x - u.x, t.y - u.y), travelled: 0 });
      this.events.push({ t: 'shot', k: def.projectile, x: u.x, y: u.y, o: u.owner });
    } else {
      this.dealDamage(t, dmg, def.bonus || {}, u.owner, u.id, u.role);
      this.events.push({ t: 'hit', k: 'melee', x: t.x, y: t.y, o: u.owner });
      if (def.splash) { // sweeping melee (chariot): hit other enemies near the target
        const team = this.players[u.owner].team; const near = [];
        this.unitsNear(t.x, t.y, def.splash, e => { if (e !== t && e.owner !== undefined && this.players[e.owner].team !== team) near.push(e); });
        for (const e of near) this.dealDamage(e, dmg * 0.6, def.bonus || {}, u.owner, u.id, u.role);
      }
    }
  }

  stepProj(pr) {
    const t = this.ents.get(pr.targetId);
    if (t && !t.dead) { pr.tx = t.x; pr.ty = t.y; }
    const dx = pr.tx - pr.x, dy = pr.ty - pr.y, d = Math.hypot(dx, dy);
    const stepLen = pr.speed * DT;
    pr.dirty = true;
    if (d <= stepLen) {
      pr.x = pr.tx; pr.y = pr.ty;
      this.impact(pr, t);
      this.remove(pr);
      return;
    }
    pr.x += dx / d * stepLen; pr.y += dy / d * stepLen; pr.travelled += stepLen;
  }

  impact(pr, t) {
    if (pr.splash) {
      const hit = new Set();
      this.unitsNear(pr.x, pr.y, pr.splash, e => { if (e.owner !== undefined && this.players[e.owner].team !== this.players[pr.owner].team) hit.add(e); });
      for (const e of this.ents.values()) if (e.kind === 'building' && !e.dead && this.players[e.owner].team !== this.players[pr.owner].team && this.distToEntity(pr.x, pr.y, e) <= pr.splash) hit.add(e);
      for (const e of hit) {
        const dd = this.distToEntity(pr.x, pr.y, e);
        const f = e.id === pr.targetId ? 1 : Math.max(0.35, 1 - dd / pr.splash);
        this.dealDamage(e, pr.dmg * f, pr.bonus, pr.owner, pr.attackerId || 0, pr.attackerRole);
      }
      this.events.push({ t: 'explode', x: pr.x, y: pr.y, r: pr.splash, k: pr.type });
    } else if (t && !t.dead) {
      this.dealDamage(t, pr.dmg, pr.bonus, pr.owner, pr.attackerId || 0, pr.attackerRole);
      this.events.push({ t: 'hit', k: pr.type, x: pr.x, y: pr.y, o: pr.owner });
    } else {
      this.events.push({ t: 'miss', k: pr.type, x: pr.x, y: pr.y });
    }
  }

  dealDamage(t, dmg, bonus, attackerOwner, attackerId, attackerRole) {
    if (t.dead || t.hp <= 0) return;
    const p = this.players[t.owner];
    let armor = 0, mult = 1;
    if (t.kind === 'unit') { const d = p.tech.units[t.type]; armor = this.unitArmor(p, d) + this.buffArmor(t); mult = bonus[t.role] || 1; }
    else if (t.kind === 'building') { armor = t.built ? this.buildingArmor(p, t) : 0; mult = (t.type === 'wall' || t.type === 'gate') ? (bonus.wall || bonus.building || 0.5) : (bonus.building || 1); }
    const final = Math.max(1, dmg * mult - armor);
    t.hp -= final; t.dirty = true; t.lastDamageTick = this.tick; if (attackerId) t.lastAttackerId = attackerId;
    // retaliation / alerts
    if (t.kind === 'unit' && attackerId && t.role !== 'worker' && (t.order.type === 'idle' || t.order.type === 'hold') && !t.engage) { t.engage = attackerId; if (!t.home) t.home = { x: t.x, y: t.y }; }
    if (t.kind === 'unit' && t.role === 'worker' && t.order.type === 'idle' && attackerId) {
      // flee toward nearest own hall
      const hall = this.nearestDropoff(t); if (hall) t.order = { type: 'move', x: hall.x, y: hall.y + 2.5, thenIdle: true };
    }
    if (this.tick - p.lastAlert > 200) { p.lastAlert = this.tick; this.events.push({ t: 'alert', owner: t.owner, x: t.x, y: t.y, k: t.kind === 'building' ? 'building' : 'unit' }); }
    if (t.hp <= 0) {
      if (t.kind === 'unit') this.killUnit(t, attackerOwner);
      else this.killBuilding(t, attackerOwner, false);
    }
  }

  /** Hero experience (WC3 style): kills grant XP, levels raise HP and damage and widen the aura. */
  grantXp(attackerId, amount) {
    const h = attackerId ? this.ents.get(attackerId) : null; if (!h || h.kind !== 'unit' || h.dead) return;
    const def = this.players[h.owner].tech.units[h.type]; if (!def.aura) return;
    h.xp = (h.xp || 0) + amount; h.level = h.level || 1; h.dirty = true;
    const need = HERO_XP[h.level - 1];
    if (need !== undefined && h.xp >= need && h.level < HERO_XP.length + 1) {
      h.level++; const grow = 1.15; h.maxHp = Math.round(h.maxHp * grow); h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
      this.events.push({ t: 'levelup', x: h.x, y: h.y, o: h.owner, level: h.level, name: def.name });
    }
  }
  heroMult(u) { return 1 + 0.1 * ((u.level || 1) - 1); }
  killUnit(u, killerOwner) {
    u.dead = true;
    const p = this.players[u.owner];
    p.stats.unitsLost++;
    if (killerOwner !== null && killerOwner !== undefined && this.players[killerOwner]) this.players[killerOwner].stats.unitsKilled++;
    if (u.lastAttackerId) this.grantXp(u.lastAttackerId, 20 + Math.round(u.maxHp / 10));
    this.events.push({ t: 'death', x: u.x, y: u.y, o: u.owner, k: 'unit', ty: u.type, f: u.facing });
    // release building it was constructing
    this.remove(u);
    this.recountPop(p);
  }

  killBuilding(b, killerOwner, cancelled) {
    b.dead = true;
    const p = this.players[b.owner];
    if (!cancelled) {
      p.stats.buildingsLost++;
      if (killerOwner !== null && killerOwner !== undefined && this.players[killerOwner]) this.players[killerOwner].stats.buildingsRazed++;
      if (b.lastAttackerId) this.grantXp(b.lastAttackerId, 60 + Math.round(b.maxHp / 20));
      this.events.push({ t: 'death', x: b.x, y: b.y, o: b.owner, k: 'building', ty: b.type, w: b.w, h: b.h });
    }
    // refund queued units / upgrades
    for (const q of b.queue) { const cost = this.queueCost(p, b, q); p.res.p += cost.p; p.res.s += cost.s; }
    b.queue = [];
    this.remove(b);
    for (const u of this.ents.values()) if (u.kind === 'unit' && u.order.type === 'build' && u.order.targetId === b.id) this.nextOrder(u);
    this.recountPop(p);
  }

  // ---------- gathering ----------
  nearestDropoff(u) {
    let best = null, bd = Infinity;
    for (const e of this.ents.values()) {
      if (e.kind !== 'building' || e.owner !== u.owner || !e.built || e.dead) continue;
      if (!this.players[u.owner].tech.buildings[e.type].dropoff) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestNode(u, kind, maxD = 14) {
    let best = null, bd = Infinity;
    for (const e of this.ents.values()) {
      if (e.kind !== kind || e.dead || e.amount <= 0) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd && d <= maxD) { bd = d; best = e; }
    }
    return best;
  }
  stepGather(u, def, o) {
    const p = this.players[u.owner];
    const nodes = this.era.nodes;
    let node = this.ents.get(o.targetId);
    if (o.phase !== 'return' && (!node || node.dead || node.amount <= 0)) {
      const alt = this.nearestNode(u, o.kind || (node ? node.kind : 'tree'), 12);
      if (!alt) { if (u.carry) { o.phase = 'return'; } else { this.nextOrder(u); return false; } }
      else { o.targetId = alt.id; node = alt; u.path = null; }
    }
    if (node) o.kind = node.kind;
    const resKey = o.kind === 'mine' ? 'p' : 's';
    switch (o.phase) {
      case 'go': {
        if (u.carry && u.carry.res !== resKey) { o.phase = 'return'; return false; }
        const gt = (tx, ty) => this.distToEntity(tx + 0.5, ty + 0.5, node) <= 0.75;
        const still = this.moveTo(u, def, node.x, node.y, 0.9, gt, node.x, node.y);
        if (!still) {
          if (this.distToEntity(u.x, u.y, node) > 1.1) { if ((this.tick + u.id) % 30 === 0) u.path = null; return false; }
          u.facing = Math.atan2(node.y - u.y, node.x - u.x);
          if (node.kind === 'mine') { o.phase = 'inside'; o.timer = nodes.mine.tripTicks; u.hidden = true; u.dirty = true; }
          else { o.phase = 'chop'; o.timer = nodes.secondary.chopTicks; o.hits = 0; }
        }
        return still;
      }
      case 'inside': {
        o.timer--;
        if (o.timer <= 0) {
          u.hidden = false; u.dirty = true;
          const amt = Math.min(node.amount, nodes.mine.perTrip);
          node.amount -= amt; node.dirty = true;
          u.carry = { res: 'p', amt: Math.round(amt * (p.tech.economy.mine || 1)) };
          const spot = this.findSpawnTile(node, 'land');
          if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; }
          if (node.amount <= 0) { this.events.push({ t: 'msg', owner: -1, text: `${nodes.mine.name} byl vytěžen.` }); this.remove(node); }
          o.phase = 'return'; u.path = null;
        }
        return false;
      }
      case 'chop': {
        u.anim = 'work';
        o.timer--;
        if (o.timer <= 0) {
          o.timer = nodes.secondary.chopTicks; o.hits++;
          this.events.push({ t: 'chop', x: node.x, y: node.y, k: nodes.secondary.kind });
          u.lastAttackTick = this.tick; u.dirty = true;
          if (o.hits >= nodes.secondary.chopHits) {
            const amt = Math.min(node.amount, nodes.secondary.perTrip);
            node.amount -= amt; node.dirty = true;
            u.carry = { res: 's', amt }; o.phase = 'return'; u.path = null;
            if (node.amount <= 0) { this.events.push({ t: 'death', x: node.x, y: node.y, k: 'tree', v: node.v }); this.remove(node); }
          }
        }
        return false;
      }
      case 'return': {
        if (!u.carry) { o.phase = 'go'; return false; }
        const drop = this.nearestDropoff(u);
        if (!drop) { u.anim = 'idle'; return false; }
        const gt = (tx, ty) => this.distToEntity(tx + 0.5, ty + 0.5, drop) <= 0.75;
        const still = this.moveTo(u, def, drop.x, drop.y, 1.0, gt, drop.x, drop.y);
        if (!still) {
          if (this.distToEntity(u.x, u.y, drop) > 1.2) { if ((this.tick + u.id) % 30 === 0) u.path = null; return false; }
          p.res[u.carry.res] += u.carry.amt; p.dirty = true;
          if (u.carry.res === 'p') p.stats.gatheredP += u.carry.amt; else p.stats.gatheredS += u.carry.amt;
          u.carry = null; u.dirty = true; o.phase = 'go'; u.path = null;
          if (!node || node.dead || node.amount <= 0) { const alt = this.nearestNode(u, o.kind, 16); if (alt) o.targetId = alt.id; else this.nextOrder(u); }
        }
        return still;
      }
    }
    return false;
  }

  // ---------- construction ----------
  stepBuild(u, def, o) {
    const b = this.ents.get(o.targetId);
    if (!b || b.dead || b.kind !== 'building' || (b.built && b.hp >= b.maxHp)) { this.nextOrder(u); return false; }
    const gt = (tx, ty) => this.distToEntity(tx + 0.5, ty + 0.5, b) <= 0.8;
    const still = this.moveTo(u, def, b.x, b.y, 1.0, gt, b.x, b.y);
    if (still) return true;
    if (this.distToEntity(u.x, u.y, b) > 1.3) { if ((this.tick + u.id) % 30 === 0) u.path = null; return false; }
    u.facing = Math.atan2(b.y - u.y, b.x - u.x);
    u.anim = 'work';
    const p = this.players[u.owner];
    const bdef = p.tech.buildings[b.type];
    b.builders++;
    if (!b.built) {
      const rate = DT / bdef.buildTime;
      b.progress = Math.min(1, b.progress + rate / Math.sqrt(Math.max(1, b.builders)));
      b.hp = Math.max(b.hp, Math.max(1, Math.round(b.maxHp * (0.1 + 0.9 * b.progress))));
      b.dirty = true;
      if ((this.tick + u.id) % 10 === 0) { u.lastAttackTick = this.tick; u.dirty = true; this.events.push({ t: 'hammer', x: b.x, y: b.y }); }
      if (b.progress >= 1) {
        b.built = true; b.hp = b.maxHp; b.builders = 0;
        p.stats.buildingsBuilt++;
        this.events.push({ t: 'built', x: b.x, y: b.y, o: b.owner, ty: b.type, id: b.id });
        this.recountPop(p);
        this.nextOrder(u);
        // auto-continue: if worker's next queued order is not build and it was gathering before? keep idle
      }
    } else {
      // repair: costs nothing in demo, slower
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * DT / (bdef.buildTime * 2)); b.dirty = true;
      if ((this.tick + u.id) % 10 === 0) { u.lastAttackTick = this.tick; u.dirty = true; }
      if (b.hp >= b.maxHp) this.nextOrder(u);
    }
    return false;
  }

  // ---------- buildings ----------
  stepBuilding(b) {
    const p = this.players[b.owner];
    const def = p.tech.buildings[b.type];
    b.builders = 0; // recounted by builders each tick (before they act next tick) - use decay
    if (!b.built) return;
    // training / upgrading / research
    if (b.queue.length && b.queue[0].type === '__res') {
      const q = b.queue[0]; const rd = RESEARCH[q.rid];
      q.progress += DT / rd.time; b.dirty = true;
      if (q.progress >= 1) { b.queue.shift(); p.research[q.rid] = (p.research[q.rid] || 0) + 1; p.dirty = true; this.events.push({ t: 'researched', o: b.owner, rid: q.rid, level: p.research[q.rid], x: b.x, y: b.y }); }
    } else if (b.queue.length && b.queue[0].type === '__up') {
      const q = b.queue[0]; const up = this.nextUpgrade(p, b);
      if (!up) { b.queue.shift(); }
      else {
        q.progress += DT / up.time; b.dirty = true;
        if (q.progress >= 1) {
          b.queue.shift(); b.level = up.level;
          if (up.hp) { b.maxHp = Math.round(b.maxHp * up.hp); b.hp = Math.min(b.maxHp, b.hp + Math.round(b.maxHp * (1 - 1 / up.hp))); }
          this.events.push({ t: 'upgraded', x: b.x, y: b.y, o: b.owner, ty: b.type, level: b.level, id: b.id });
          this.recountPop(p);
        }
      }
    } else if (b.queue.length) {
      const q = b.queue[0];
      const udef = p.tech.units[q.type];
      q.progress += DT / udef.trainTime;
      b.dirty = true;
      if (q.progress >= 1) {
        if (p.pop + udef.pop <= p.popCap) {
          const spot = this.findSpawnTile(b, udef.domain);
          if (spot) {
            b.queue.shift();
            const u = this.spawnUnit(p, q.type, spot.x + 0.5, spot.y + 0.5);
            this.recountPop(p);
            this.events.push({ t: 'spawn', x: u.x, y: u.y, o: b.owner, ty: q.type });
            if (b.rally) {
              const rt = b.rally.targetId ? this.ents.get(b.rally.targetId) : null;
              if (rt && (rt.kind === 'tree' || rt.kind === 'mine') && u.role === 'worker') u.order = { type: 'gather', targetId: rt.id, phase: 'go' };
              else if (rt && rt.owner === b.owner && rt.kind === 'building' && !rt.built && u.role === 'worker') u.order = { type: 'build', targetId: rt.id };
              else u.order = { type: 'move', x: b.rally.x, y: b.rally.y, thenIdle: true };
            }
          } else q.progress = 1;
        } else { q.progress = 1; }
      }
    }
    // tower attack (scaled by upgrade level)
    if (def.attack) {
      if (b.cooldown > 0) b.cooldown -= DT;
      const st = this.buildingAttack(p, b);
      if ((this.tick + b.id) % 4 === 0 || b.target) {
        let t = b.target ? this.ents.get(b.target) : null;
        if (!t || t.dead || this.distToEntity(b.x, b.y, t) > st.range + 0.5) { t = null; b.target = 0; }
        if (!t && (this.tick + b.id) % 4 === 0) {
          const fake = { x: b.x, y: b.y, owner: b.owner };
          t = this.nearestEnemy(fake, st.range, false);
          if (t) b.target = t.id;
        }
        if (t && b.cooldown <= 0) {
          b.cooldown = def.attack.cooldown; b.lastAttackTick = this.tick; b.dirty = true;
          const speed = PROJ_SPEED[def.attack.projectile] || 12;
          this.add({ kind: 'proj', type: def.attack.projectile, x: b.x, y: b.y - 0.6, sx: b.x, sy: b.y - 0.6, tx: t.x, ty: t.y, targetId: t.id, speed, dmg: st.dmg, owner: b.owner, attackerType: b.type, attackerRole: 'tower', bonus: {}, splash: 0, arc: PROJ_ARC[def.attack.projectile] || 0, total: Math.hypot(t.x - b.x, t.y - b.y), travelled: 0 });
          this.events.push({ t: 'shot', k: def.attack.projectile, x: b.x, y: b.y, o: b.owner });
        }
      }
    }
  }

  // ---------- victory ----------
  checkVictory() {
    if (this.gameOver) return;
    for (const p of this.players) {
      if (!p.alive || p.neutral) continue;
      let hasBuilding = false;
      for (const e of this.ents.values()) if (e.kind === 'building' && e.owner === p.id && e.type !== 'wall' && !e.dead) { hasBuilding = true; break; }
      if (!hasBuilding) {
        p.alive = false; p.dirty = true;
        this.events.push({ t: 'eliminated', owner: p.id });
        for (const e of Array.from(this.ents.values())) if (e.owner === p.id && !e.dead) { e.dead = true; this.remove(e); }
      }
    }
    const teams = new Set(this.players.filter(p => p.alive && !p.neutral).map(p => p.team));
    if (teams.size <= 1) {
      const winner = teams.size === 1 ? [...teams][0] : -1;
      this.gameOver = { winnerTeam: winner, tick: this.tick };
      this.events.push({ t: 'gameover', winnerTeam: winner });
    }
  }

  // ---------- serialization ----------
  serializeEntity(e) {
    switch (e.kind) {
      case 'unit': return { i: e.id, k: 'u', t: e.type, o: e.owner, x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: Math.ceil(e.hp), m: e.maxHp, f: +e.facing.toFixed(2), a: e.anim, at: e.lastAttackTick, hd: e.hidden ? 1 : 0, c: e.carry ? e.carry.res : '', o2: e.order.type, tg: e.order.targetId || e.engage || 0, dx: e.order.x, dy: e.order.y, ab: e.abilityReady || 0, bf: e.buffUntil || 0, lv: e.level || 1, xp: e.xp || 0 };
      case 'building': return { i: e.id, k: 'b', t: e.type, o: e.owner, x: e.x, y: e.y, tx: e.tx, ty: e.ty, w: e.w, h: e.h, hp: Math.ceil(e.hp), m: e.maxHp, bl: e.built ? 1 : 0, pr: +e.progress.toFixed(3), q: e.queue.map(q => ({ t: q.type, p: +q.progress.toFixed(3), rid: q.rid })), r: e.rally, at: e.lastAttackTick, lv: e.level || 1 };
      case 'tree': return { i: e.id, k: 't', x: e.x, y: e.y, tx: e.tx, ty: e.ty, a: e.amount, v: e.v };
      case 'mine': return { i: e.id, k: 'm', x: e.x, y: e.y, tx: e.tx, ty: e.ty, w: 2, h: 2, a: e.amount };
      case 'proj': return { i: e.id, k: 'p', t: e.type, x: +e.x.toFixed(2), y: +e.y.toFixed(2), sx: e.sx, sy: e.sy, tx: +e.tx.toFixed(2), ty: +e.ty.toFixed(2), arc: e.arc, o: e.owner };
    }
    return null;
  }
  serializePlayer(p) {
    return { id: p.id, name: p.name, faction: p.faction, team: p.team, color: p.color, isAI: p.isAI, res: { p: Math.floor(p.res.p), s: Math.floor(p.res.s) }, pop: p.pop, popCap: p.popCap, alive: p.alive, stats: p.stats, research: p.research, neutral: !!p.neutral };
  }
  fullSnapshot() {
    return { t: 'full', tick: this.tick, players: this.players.map(p => this.serializePlayer(p)), ents: Array.from(this.ents.values()).map(e => this.serializeEntity(e)), gameOver: this.gameOver };
  }
  deltaSnapshot() {
    const ents = [];
    for (const e of this.ents.values()) if (e.dirty) { ents.push(this.serializeEntity(e)); e.dirty = false; }
    const snap = { t: 'snap', tick: this.tick, ents, rem: this.removed, ev: this.events, players: this.players.map(p => this.serializePlayer(p)), gameOver: this.gameOver };
    this.removed = []; this.events = [];
    return snap;
  }
  mapData() {
    const m = this.map;
    return { w: m.w, h: m.h, tiles: Array.from(m.tiles), height: Array.from(m.height, v => +v.toFixed(3)), spawns: m.spawns, deco: m.deco, seed: m.seed };
  }
}
