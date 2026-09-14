import { Sim } from '../shared/sim.js';
const sim = new Sim({ seed: 3, size: 96, eraId: 'antiquity', players: [ { name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'B', faction: 'gaul', team: 1, color: 1 } ] });
const me = sim.players[0]; me.res = { p: 9999, s: 9999 }; const s = me.spawn;
const run = n => { for (let i = 0; i < n; i++) sim.step(); };
const ws = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0);
const f = sim.formation(ws, s.x + 8, s.y); console.log('formation targets', f.map(t => t.x.toFixed(1) + ',' + t.y.toFixed(1)).join(' '));
sim.command(0, { t: 'move', ids: ws.map(u => u.id), x: s.x + 8, y: s.y }); run(20 * 8);
console.log('spread after move', ws.map(u => `${u.x.toFixed(1)},${u.y.toFixed(1)}`).join(' '));
// patrol: spawn infantry via cheat placement
const inf = sim.spawnUnit(me, 'infantry', s.x + 2, s.y + 2); sim.recountPop(me);
sim.command(0, { t: 'patrol', ids: [inf.id], x: s.x + 6, y: s.y + 2 });
let swaps = 0, last = inf.order.x; for (let i = 0; i < 20 * 20; i++) { sim.step(); if (inf.order.type === 'patrol' && inf.order.x !== last) { swaps++; last = inf.order.x; } }
console.log('patrol order', inf.order.type, 'endpoint swaps', swaps);
