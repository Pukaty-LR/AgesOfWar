import { Sim } from '../shared/sim.js';
import { AIPlayer } from '../shared/ai.js';
const era = process.argv[2] || 'antiquity';
const ticks = +(process.argv[3] || 20 * 60 * 6);
const sim = new Sim({ seed: 42, size: 96, eraId: era, players: [
  { name: 'A', faction: era === 'ww2' ? 'germany' : 'rome', team: 0, color: 0, isAI: true },
  { name: 'B', faction: era === 'ww2' ? 'ussr' : 'gaul', team: 1, color: 1, isAI: true },
]});
const ais = sim.players.map(p => new AIPlayer(sim, p.id, p.id === 1 ? 'hard' : 'normal'));
const t0 = Date.now();
let bytes = 0;
for (let i = 0; i < ticks; i++) {
  if (i % 20 === 0) for (const a of ais) a.update();
  sim.step();
  if (i % 2 === 0) bytes += JSON.stringify(sim.deltaSnapshot()).length;
  if (sim.gameOver) { console.log('GAME OVER at tick', sim.tick, sim.gameOver); break; }
}
const ms = Date.now() - t0;
console.log(`era=${era} ticks=${sim.tick} time=${ms}ms (${(ms / sim.tick).toFixed(2)} ms/tick) avg snapshot=${(bytes / (sim.tick / 2) / 1024).toFixed(1)} KB`);
for (const p of sim.players) {
  const units = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === p.id);
  const bl = [...sim.ents.values()].filter(e => e.kind === 'building' && e.owner === p.id);
  console.log(p.name, p.faction, 'alive', p.alive, 'res', p.res, 'pop', p.pop + '/' + p.popCap, 'units', units.length, 'buildings', bl.map(b => b.type + (b.built ? '' : '*')).join(','), 'stats', JSON.stringify(p.stats));
  const byOrder = {}; for (const u of units) byOrder[u.order.type + (u.order.phase ? ':' + u.order.phase : '')] = (byOrder[u.order.type + (u.order.phase ? ':' + u.order.phase : '')] || 0) + 1;
  console.log('  orders', JSON.stringify(byOrder));
}
