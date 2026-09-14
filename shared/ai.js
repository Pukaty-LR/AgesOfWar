// Simple but complete AI opponent. Works purely through sim.command(), like a human player.
import { mulberry32 } from './mapgen.js';
import { RESEARCH } from './data.js';

export class AIPlayer {
  constructor(sim, pid, difficulty = 'normal') {
    this.sim = sim; this.pid = pid;
    this.rng = mulberry32(1234 + pid * 77 + sim.seed);
    this.diff = difficulty;
    this.wave = 0;
    this.lastAttackTick = 0;
    this.buildStep = 0;
    this.lastBuildTick = -1000;
    this.plan = ['barracks', 'tower', 'barracks', 'stable', 'tower', 'siege', 'dock', 'hall', 'tower', 'stable'];
    this.rallyPoint = null;
  }

  me() { return this.sim.players[this.pid]; }
  mine(kind) { const out = []; for (const e of this.sim.ents.values()) if (e.kind === kind && e.owner === this.pid && !e.dead) out.push(e); return out; }

  update() {
    const sim = this.sim, p = this.me();
    if (!p.alive || sim.gameOver) return;
    const tick = sim.tick;
    const units = this.mine('unit'), buildings = this.mine('building');
    const workers = units.filter(u => u.role === 'worker');
    const army = units.filter(u => u.role !== 'worker' && u.domain === 'land');
    const ships = units.filter(u => u.domain === 'sea');
    const halls = buildings.filter(b => b.type === 'hall' && b.built);
    const hall = halls[0] || buildings.find(b => b.built) || buildings[0];
    if (!hall) return;
    const impossible = this.diff === 'impossible';
    const hard = this.diff === 'hard' || impossible, easy = this.diff === 'easy';
    const targetWorkers = hard ? 18 : (easy ? 9 : 14);
    if (easy && tick % 40 !== 0) return; // easy AI thinks half as often
    if (impossible) { p.res.p += 4; p.res.s += 3; p.dirty = true; } // impossible AI gets a resource trickle

    // 1. Economy: keep workers gathering
    const mineNode = sim.nearestNode({ x: hall.x, y: hall.y, owner: this.pid }, 'mine', 16);
    const goldWorkers = workers.filter(u => u.order.type === 'gather' && u.order.kind === 'mine').length;
    for (const u of workers) {
      if (u.order.type !== 'idle') continue;
      const wantGold = mineNode && goldWorkers < workers.length * 0.55;
      if (wantGold) sim.command(this.pid, { t: 'gather', ids: [u.id], targetId: mineNode.id });
      else {
        const tree = sim.nearestNode({ x: hall.x, y: hall.y, owner: this.pid }, 'tree', 22);
        if (tree) sim.command(this.pid, { t: 'gather', ids: [u.id], targetId: tree.id });
        else if (mineNode) sim.command(this.pid, { t: 'gather', ids: [u.id], targetId: mineNode.id });
      }
    }
    // train workers
    for (const h of halls) {
      if (workers.length + h.queue.length < targetWorkers && h.queue.length < 2) sim.command(this.pid, { t: 'train', id: h.id, type: 'worker' });
    }

    // 2. Build order
    const unfinished = buildings.filter(b => !b.built && b.type !== 'wall');
    if (unfinished.length && !units.some(u => u.order.type === 'build')) {
      const w = this.pickWorker(workers);
      if (w) sim.command(this.pid, { t: 'smart', ids: [w.id], x: unfinished[0].x, y: unfinished[0].y, targetId: unfinished[0].id });
    }
    // houses when population is nearly capped (AoE style)
    if (!unfinished.length && p.pop >= p.popCap - 6 && p.popCap < 200 && tick - this.lastBuildTick > 40) {
      const def = p.tech.buildings.house;
      if (p.res.p >= def.cost.p && p.res.s >= def.cost.s) {
        const spot = this.spotNear(hall.x, hall.y, 4, 11, def); const w = this.pickWorker(workers);
        if (spot && w) { sim.command(this.pid, { t: 'build', ids: [w.id], type: 'house', tx: spot.x, ty: spot.y }); this.lastBuildTick = tick; }
      }
    }
    if (!unfinished.length && this.buildStep < this.plan.length && tick - this.lastBuildTick > 40 && workers.length >= 5) {
      const type = this.plan[this.buildStep];
      const def = p.tech.buildings[type];
      const affordable = p.res.p >= def.cost.p && p.res.s >= def.cost.s;
      if (affordable) {
        const spot = this.findSpot(type, hall);
        if (spot) {
          const w = this.pickWorker(workers);
          if (w) {
            sim.command(this.pid, { t: 'build', ids: [w.id], type, tx: spot.x, ty: spot.y });
            this.lastBuildTick = tick; this.buildStep++;
          }
        } else { this.buildStep++; }
      }
    }

    // 3. Army production (uses tier units once unlocked)
    const reserve = this.buildStep < this.plan.length ? 120 : 0;
    for (const b of buildings) {
      if (!b.built || b.queue.length >= 2) continue;
      const trains = sim.availableTrains(p, b).filter(t => t !== 'worker' && !p.tech.units[t].unique);
      if (!trains.length) { if (b.type === 'hall' && sim.availableTrains(p, b).includes('hero') && !units.some(u => u.type === 'hero') && p.res.p > 700) sim.command(this.pid, { t: 'train', id: b.id, type: 'hero' }); continue; }
      let type;
      if (b.type === 'barracks') { const melee = trains.filter(t => p.tech.units[t].role === 'infantry'), rng = trains.filter(t => p.tech.units[t].role === 'ranged'); const wantMelee = army.filter(u => u.role === 'infantry').length <= army.filter(u => u.role === 'ranged').length * 1.2; const pool = wantMelee && melee.length ? melee : (rng.length ? rng : trains); type = pool[Math.floor(this.rng() * pool.length)]; }
      else if (b.type === 'siege') { if (tick < 20 * 60 * 5 && !hard) continue; type = trains[Math.floor(this.rng() * trains.length)]; }
      else type = trains[Math.floor(this.rng() * trains.length)];
      const ud = p.tech.units[type];
      if (p.res.p - ud.cost.p >= reserve && p.res.s - ud.cost.s >= reserve * 0.5) sim.command(this.pid, { t: 'train', id: b.id, type });
    }
    // 3a. Research when rich
    if (tick % 140 === 0 && !easy) {
      for (const b of buildings) {
        if (!b.built || b.queue.length >= 2) continue;
        for (const [rid, rd] of Object.entries(RESEARCH)) { if (rd.building !== b.type) continue; const lvl = p.research[rid] || 0; if (lvl >= rd.maxLevel) continue; const cost = sim.researchCost(rid, lvl + 1); if (p.res.p >= cost.p + 250 && p.res.s >= cost.s + 150) { sim.command(this.pid, { t: 'research', id: b.id, rid }); break; } }
      }
    }
    // 3b. Upgrades: hall first, then military buildings, when resources allow
    if (tick % 100 === 0 && !easy) {
      const order = [...halls, ...buildings.filter(b => b.built && b.type !== 'hall' && b.type !== 'tower' && b.type !== 'wall' && b.type !== 'gate')];
      for (const b of order) {
        const up = sim.nextUpgrade(p, b); if (!up || b.queue.some(q => q.type === '__up')) continue;
        if (up.hall && sim.hallLevel(this.pid) < up.hall) continue;
        const minAge = b.type === 'hall' ? 20 * 60 * (hard ? 3 : 5) * (b.level || 1) : 20 * 60 * 2;
        if (tick < minAge) continue;
        if (p.res.p >= up.cost.p + 150 && p.res.s >= up.cost.s + 100) { sim.command(this.pid, { t: 'upgrade', id: b.id }); break; }
      }
    }
    // rally military buildings in front of the hall
    if (!this.rallyPoint) this.rallyPoint = this.frontOfBase(hall);
    if (tick % 200 === 0) for (const b of buildings) if (b.built && !b.rally && b.type !== 'hall' && b.type !== 'dock' && b.type !== 'tower' && b.type !== 'wall') sim.command(this.pid, { t: 'rally', ids: [b.id], x: this.rallyPoint.x, y: this.rallyPoint.y });

    // 4. Defense
    let threat = null;
    for (const e of sim.ents.values()) {
      if (e.kind !== 'unit' || e.owner === undefined || sim.players[e.owner].team === p.team || e.role === 'worker') continue;
      for (const b of buildings) if (Math.hypot(e.x - b.x, e.y - b.y) < 12) { threat = e; break; }
      if (threat) break;
    }
    if (threat && tick % 40 === 0) {
      const idle = army.filter(u => u.order.type === 'idle' || u.order.type === 'hold' || (u.order.type === 'amove' && Math.hypot(u.order.x - threat.x, u.order.y - threat.y) > 10));
      if (idle.length) sim.command(this.pid, { t: 'amove', ids: idle.map(u => u.id), x: threat.x, y: threat.y });
      const idleShips = ships.filter(u => u.order.type === 'idle'); if (idleShips.length) sim.command(this.pid, { t: 'amove', ids: idleShips.map(u => u.id), x: threat.x, y: threat.y });
    }

    // 5. Attack waves
    const threshold = (hard ? 6 : (easy ? 14 : 10)) + this.wave * 3;
    const idleArmy = army.filter(u => u.order.type === 'idle');
    const minTick = hard ? 20 * 60 * 2.5 : (easy ? 20 * 60 * 9 : 20 * 60 * 5);
    if (!threat && idleArmy.length >= threshold && tick - this.lastAttackTick > 20 * 45 && tick > minTick) {
      const target = this.pickEnemyTarget(hall);
      if (target) {
        sim.command(this.pid, { t: 'amove', ids: idleArmy.map(u => u.id), x: target.x, y: target.y });
        this.wave++; this.lastAttackTick = tick;
      }
    }
    // ships raid enemy shore buildings
    const idleShips = ships.filter(u => u.order.type === 'idle');
    if (idleShips.length >= 2 && tick % 300 === 0) {
      const t = this.pickEnemyTarget(hall, true);
      if (t) sim.command(this.pid, { t: 'amove', ids: idleShips.map(u => u.id), x: t.x, y: t.y });
    }
    // re-task army that finished an attack move far from home: continue to next target
    if (tick % 100 === 0) {
      const far = army.filter(u => u.order.type === 'idle' && Math.hypot(u.x - hall.x, u.y - hall.y) > 25);
      if (far.length >= 3) { const t = this.pickEnemyTarget(far[0]); if (t) sim.command(this.pid, { t: 'amove', ids: far.map(u => u.id), x: t.x, y: t.y }); else sim.command(this.pid, { t: 'move', ids: far.map(u => u.id), x: this.rallyPoint.x, y: this.rallyPoint.y }); }
    }
  }

  pickWorker(workers) {
    return workers.find(u => u.order.type === 'idle') || workers.find(u => u.order.type === 'gather' && u.order.kind === 'tree' && !u.carry) || workers.find(u => u.order.type === 'gather' && !u.hidden) || null;
  }

  frontOfBase(hall) {
    const sim = this.sim;
    const c = { x: sim.w / 2, y: sim.h / 2 };
    const dx = c.x - hall.x, dy = c.y - hall.y, d = Math.hypot(dx, dy) || 1;
    return { x: hall.x + dx / d * 7, y: hall.y + dy / d * 7 };
  }

  pickEnemyTarget(from, shoreOnly = false) {
    const sim = this.sim; let best = null, bd = Infinity;
    for (const e of sim.ents.values()) {
      if (e.kind !== 'building' || e.dead || e.owner === undefined || sim.players[e.owner].team === this.me().team || e.type === 'wall') continue;
      if (shoreOnly && !sim.touchesWater(e.tx - 3, e.ty - 3, e.w + 6, e.h + 6)) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y) + (e.type === 'tower' ? 0 : 3);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  findSpot(type, hall) {
    const sim = this.sim, p = this.me();
    const def = p.tech.buildings[type];
    if (type === 'hall') {
      // expansion near a free mine
      for (const e of sim.ents.values()) {
        if (e.kind !== 'mine' || e.amount <= 0) continue;
        let taken = false; for (const b of sim.ents.values()) if (b.kind === 'building' && b.type === 'hall' && Math.hypot(b.x - e.x, b.y - e.y) < 10) taken = true;
        if (taken) continue;
        const s = this.spotNear(e.x, e.y, 4, 7, def); if (s) return s;
      }
      return null;
    }
    if (type === 'dock') {
      // find shore tile near base
      for (let tries = 0; tries < 300; tries++) {
        const a = this.rng() * Math.PI * 2, d = 4 + this.rng() * 14;
        const tx = Math.round(hall.x + Math.cos(a) * d), ty = Math.round(hall.y + Math.sin(a) * d);
        if (sim.canPlace('dock', tx, ty, p) && this.marginFree(tx, ty, def)) return { x: tx, y: ty };
      }
      return null;
    }
    if (type === 'tower') {
      const f = this.frontOfBase(hall);
      return this.spotNear(f.x + (this.rng() - 0.5) * 6, f.y + (this.rng() - 0.5) * 6, 0, 4, def);
    }
    return this.spotNear(hall.x, hall.y, 4.5, 10, def);
  }
  marginFree(tx, ty, def) {
    const sim = this.sim;
    for (let y = ty - 1; y <= ty + def.h; y++) for (let x = tx - 1; x <= tx + def.w; x++) {
      if (!sim.inBounds(x, y)) return false;
      const i = y * sim.w + x;
      if (sim.blockId[i] && !(x >= tx && x < tx + def.w && y >= ty && y < ty + def.h)) { const e = sim.ents.get(sim.blockId[i]); if (e && e.kind === 'building') return false; }
    }
    return true;
  }
  spotNear(cx, cy, minD, maxD, def) {
    const sim = this.sim, p = this.me();
    for (let tries = 0; tries < 200; tries++) {
      const a = this.rng() * Math.PI * 2, d = minD + this.rng() * (maxD - minD);
      const tx = Math.round(cx + Math.cos(a) * d - def.w / 2), ty = Math.round(cy + Math.sin(a) * d - def.h / 2);
      if (sim.canPlace(def.id, tx, ty, p) && this.marginFree(tx, ty, def)) {
        // keep mine approach clear: avoid tiles between hall and nearest mine
        return { x: tx, y: ty };
      }
    }
    return null;
  }
}
