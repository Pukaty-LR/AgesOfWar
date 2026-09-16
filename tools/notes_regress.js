// Regression for the "nové bugs 15.9." list from MANAGER NOTES – the simulation-side items, headless.
// Run: node tools/notes_regress.js
import { Sim } from '../shared/sim.js';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };
const mk = (seed = 21) => new Sim({ seed, size: 96, eraId: 'antiquity', players: [{ name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'E', faction: 'gaul', team: 1, color: 1 }] });
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const ents = (sim, fn) => [...sim.ents.values()].filter(e => !e.dead && fn(e));
const spotFor = (sim, p, type, minD = 4, maxD = 18) => { const s = p.spawn; for (let d = minD; d < maxD; d++) for (let a = 0; a < 32; a++) { const tx = Math.round(s.x + Math.cos(a * 0.4) * d), ty = Math.round(s.y + Math.sin(a * 0.4) * d); if (sim.canPlace(type, tx, ty, p)) return { tx, ty }; } return null; };
const rich = p => { p.res = { p: 99999, s: 99999 }; };

// ---- data-level items (N12 houses, N17 wood, N19 training, N20/N23 siege, N22 endless centre)
{
  const sim = mk(); const me = sim.players[0]; const tech = me.tech;
  check(tech.buildings.house.popCap >= 10 && (tech.buildings.house.upgrades || []).length >= 1, 'N12: house gives 10 pop and is upgradable');
  check(sim.era.nodes.secondary.perTrip >= 20 && sim.era.nodes.secondary.amount >= 240, 'N17: wood per trip ' + sim.era.nodes.secondary.perTrip + ', per tree ' + sim.era.nodes.secondary.amount);
  check(tech.units.infantry.trainTime === Math.round(15 / 1.3) && tech.units.infantry._fast, 'N19: training 30 % faster (infantry ' + tech.units.infantry.trainTime.toFixed(1) + ' s from 15)');
  check(!(tech.units.siege.splash > 0) && !(tech.units.ballista.splash > 0), 'N20: siege units have no splash');
  const sb = tech.buildings.siege; const l3 = (sb.upgrades || []).find(u => u.level === 3);
  check(sb.trains.includes('ballista') && !sb.trains.includes('siege') && l3 && l3.unlocks.includes('siege'), 'N23: ballista at tier 1, heavy artillery unlocked at level 3');
  const endlessMine = ents(sim, e => e.kind === 'mine' && e.amount === Infinity), endlessTrees = ents(sim, e => e.kind === 'tree' && e.amount === Infinity);
  check(endlessMine.length === 1 && endlessTrees.length >= 4, `N22: endless centre (mine ${endlessMine.length}, trees ${endlessTrees.length})`);
  if (endlessMine.length) { const m = endlessMine[0]; check(Math.hypot(m.x - sim.w / 2, m.y - sim.h / 2) < 8, 'N22: endless mine is at the map centre'); }
}

// ---- N5: a healer seeks the wounded on its own
{
  const sim = mk(); const me = sim.players[0]; const s = me.spawn;
  const medic = sim.spawnUnit(me, 'medic', s.x + 0.5, s.y + 0.5);
  const inf = sim.spawnUnit(me, 'infantry', s.x + 9.5, s.y + 0.5); inf.hp = Math.round(inf.maxHp * 0.3);
  const hp0 = inf.hp; run(sim, 500);
  check(inf.hp > hp0 + 10 && Math.hypot(medic.x - inf.x, medic.y - inf.y) < 4, `N5: healer walked to the wounded and healed (${hp0} → ${inf.hp})`);
}

// ---- N6: a wall order is finished completely by the workers that started it
{
  const sim = mk(); const me = sim.players[0]; rich(me); const s = me.spawn;
  const ws = ents(sim, e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker').map(u => u.id);
  const dy = [6, 7, 5, 8, -6, -7, -5, -8].find(d => sim.wallPath(s.x - 7, s.y + d, s.x + 7, s.y + d)); sim.command(0, { t: 'wall', ids: ws.slice(0, 2), x0: s.x - 7, y0: s.y + dy, x1: s.x + 7, y1: s.y + dy });
  const placed = ents(sim, e => e.kind === 'building' && e.type === 'wall' && e.owner === 0).length;
  run(sim, 20 * 120);
  const built = ents(sim, e => e.kind === 'building' && (e.type === 'wall' || e.type === 'gate') && e.owner === 0 && e.built).length;
  check(placed >= 8 && built === placed, `N6: all ${placed} wall segments finished (${built})`);
}

// ---- N9: after finishing a building the worker continues with the next unfinished one
{
  const sim = mk(); const me = sim.players[0]; rich(me);
  const a = spotFor(sim, me, 'house'); const b1 = sim.placeBuilding(me, 'house', a.tx, a.ty); const b = spotFor(sim, me, 'house'); const b2 = sim.placeBuilding(me, 'house', b.tx, b.ty);
  const w = ents(sim, e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker')[0];
  sim.command(0, { t: 'build', ids: [w.id], type: 'house', tx: a.tx, ty: a.ty, targetId: b1.id });
  if (w.order.type !== 'build') { w.order = { type: 'build', targetId: b1.id }; w.path = null; }
  run(sim, 20 * 150);
  check(b1.built && b2.built, `N9: worker continued to the second site (${b1.built}, ${b2.built})`);
}

// ---- N11: idle workers repair damaged buildings, one worker per building
{
  const sim = mk(); const me = sim.players[0]; rich(me);
  const spots = [spotFor(sim, me, 'house', 3, 9)]; const h1 = sim.placeBuilding(me, 'house', spots[0].tx, spots[0].ty, true); spots.push(spotFor(sim, me, 'house', 3, 9)); const h2 = sim.placeBuilding(me, 'house', spots[1].tx, spots[1].ty, true);
  h1.hp = h1.maxHp * 0.4; h2.hp = h2.maxHp * 0.4;
  const ws = ents(sim, e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker'); for (const w of ws) { w.order = { type: 'idle' }; w.queue = []; }
  let maxPer = 0; for (let i = 0; i < 20 * 120; i++) { sim.step(); for (const b of [h1, h2]) { const n = ws.filter(w => w.order.type === 'build' && w.order.targetId === b.id).length; if (n > maxPer) maxPer = n; } }
  check(h1.hp >= h1.maxHp && h2.hp >= h2.maxHp, `N11: idle workers repaired both buildings (${Math.round(h1.hp)}/${h1.maxHp}, ${Math.round(h2.hp)}/${h2.maxHp})`);
  check(maxPer <= 1, `N11: at most one worker per building (max ${maxPer})`);
}

// ---- N14: when a tree is exhausted the woodcutter moves on to the next one
{
  const sim = mk(); const me = sim.players[0]; const s = me.spawn;
  const w = ents(sim, e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker')[0];
  const trees = ents(sim, e => e.kind === 'tree' && e.amount !== Infinity).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
  const first = trees[0]; first.amount = 20;
  sim.command(0, { t: 'gather', ids: [w.id], targetId: first.id });
  const s0 = me.res.s; run(sim, 20 * 90);
  check(first.dead || first.amount <= 0, 'N14: first tree exhausted'); check(w.order.type === 'gather' && w.order.targetId !== first.id, 'N14: worker switched to another tree (order ' + w.order.type + ')');
  check(me.res.s > s0 + 20, `N14: wood keeps coming (${s0} → ${me.res.s})`);
}

// ---- N15: idle units nearby join a fight instead of waiting for the enemy to reach them
{
  const sim = mk(); const me = sim.players[0], en = sim.players[1]; const s = me.spawn;
  const a = sim.spawnUnit(me, 'infantry', s.x + 0.5, s.y + 0.5); const b = sim.spawnUnit(me, 'infantry', s.x + 6.5, s.y + 0.5);
  const e = sim.spawnUnit(en, 'infantry', s.x - 1.5, s.y + 0.5); sim.command(1, { t: 'attack', ids: [e.id], targetId: a.id });
  let joined = false; for (let i = 0; i < 120 && !joined; i++) { sim.step(); if (b.order.type === 'attack' || b.engage) joined = true; }
  check(joined, 'N15: idle ally 6 tiles away joined the fight');
}

// ---- N21: a mixed group moves at the pace of its slowest unit
{
  const sim = mk(); const me = sim.players[0]; const s = me.spawn;
  const cav = sim.spawnUnit(me, 'cavalry', s.x + 0.5, s.y + 3.5); const sg = sim.spawnUnit(me, 'siege', s.x + 0.5, s.y + 4.5);
  sim.command(0, { t: 'move', ids: [cav.id, sg.id], x: s.x + 14, y: s.y + 4 }); run(sim, 50);
  const d = Math.hypot(cav.x - sg.x, cav.y - sg.y);
  check(d < 4, `N21: cavalry stays with the siege engine (distance ${d.toFixed(1)})`);
}

// ---- N24/N26: attackers continue to the next target and armed enemy units take priority over buildings
{
  const sim = mk(); const me = sim.players[0], en = sim.players[1]; const s = me.spawn; rich(en);
  const sp = spotFor(sim, me, 'house', 6, 12); const house = sim.placeBuilding(en, 'house', sp.tx, sp.ty, true); const sp2 = spotFor(sim, me, 'house', 6, 12); const house2 = sim.placeBuilding(en, 'house', sp2.tx, sp2.ty, true);
  const inf = sim.spawnUnit(me, 'infantry', s.x + 0.5, s.y + 0.5); inf.hp = 9999; inf.maxHp = 9999;
  sim.command(0, { t: 'attack', ids: [inf.id], targetId: house.id }); run(sim, 60);
  const foe = sim.spawnUnit(en, 'infantry', inf.x + 3, inf.y); sim.command(1, { t: 'attack', ids: [foe.id], targetId: inf.id });
  let switched = false; for (let i = 0; i < 60 && !switched; i++) { sim.step(); if (inf.order.type === 'attack' && inf.order.targetId === foe.id) switched = true; }
  check(switched, 'N26: armed enemy unit took priority over the building');
  foe.hp = 1; let back = false; for (let i = 0; i < 400 && !back; i++) { sim.step(); const t = sim.ents.get(inf.order.targetId); if (foe.dead && inf.order.type === 'attack' && t && t.kind === 'building') back = true; }
  check(foe.dead && back, 'N24: after the kill the unit went back to attacking buildings');
  house.hp = 1; let next = false; for (let i = 0; i < 600 && !next; i++) { sim.step(); if (house.dead && inf.order.type === 'attack' && inf.order.targetId === house2.id) next = true; }
  check(next, 'N24: after razing one building the unit continues to the next one nearby');
}

console.log(failures ? `NOTES REGRESSION: ${failures} failure(s)` : 'NOTES REGRESSION OK');
process.exit(failures ? 1 : 0);
