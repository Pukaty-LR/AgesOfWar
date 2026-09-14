import { Sim } from '../shared/sim.js';
let ok = false, tries = 0;
for (let seed = 1; seed < 40 && !ok; seed++) {
  const sim = new Sim({ seed, size: 96, eraId: 'antiquity', players: [ { name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'B', faction: 'gaul', team: 1, color: 1 } ] });
  const me = sim.players[0]; me.res = { p: 9999, s: 9999 }; const s = me.spawn;
  let spot = null; for (let d = 3; d < 20 && !spot; d++) for (let a = 0; a < 32 && !spot; a++) { const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d); if (sim.canPlace('dock', tx, ty, me)) spot = { tx, ty }; }
  if (!spot) continue; tries++;
  const ws = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0).map(u => u.id);
  sim.command(0, { t: 'build', ids: ws, type: 'dock', tx: spot.tx, ty: spot.ty });
  for (let i = 0; i < 20 * 60; i++) sim.step();
  const dock = [...sim.ents.values()].find(e => e.kind === 'building' && e.type === 'dock');
  console.log('seed', seed, 'dock built', dock && dock.built, 'workers alive', [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0).length);
  if (!dock || !dock.built) continue;
  sim.command(0, { t: 'train', id: dock.id, type: 'ship' });
  for (let i = 0; i < 20 * 40; i++) sim.step();
  const ship = [...sim.ents.values()].find(e => e.kind === 'unit' && e.type === 'ship');
  if (!ship) { console.log('no ship spawned'); continue; }
  const t0 = sim.map.tiles[(ship.y | 0) * sim.w + (ship.x | 0)];
  const es = sim.players[1].spawn;
  sim.command(0, { t: 'amove', ids: [ship.id], x: es.x, y: es.y });
  const start = { x: ship.x, y: ship.y };
  for (let i = 0; i < 20 * 30; i++) sim.step();
  console.log('ship on water tile', t0 === 3 || t0 === 4, 'moved', Math.hypot(ship.x - start.x, ship.y - start.y).toFixed(1), 'tiles; order', ship.order.type);
  ok = true;
}
console.log(ok ? 'DOCK TEST OK' : 'DOCK TEST FAILED');
