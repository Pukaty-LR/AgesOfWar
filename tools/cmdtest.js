import { Sim } from '../shared/sim.js';
import { AIPlayer } from '../shared/ai.js';
const sim = new Sim({ seed: 7, size: 96, eraId: 'antiquity', players: [
  { name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'B', faction: 'gaul', team: 1, color: 1, isAI: true } ] });
const ai = new AIPlayer(sim, 1, 'hard');
const me = sim.players[0]; const s = me.spawn;
const myUnits = () => [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0);
const workers = myUnits().map(u => u.id);
const run = n => { for (let i = 0; i < n; i++) { if (sim.tick % 20 === 0) ai.update(); sim.step(); sim.deltaSnapshot(); } };
const log = (...a) => console.log(`[t=${sim.tick}]`, ...a);
// 1. build barracks near hall
let placed = null;
for (let d = 4; d < 12 && !placed; d++) for (let a = 0; a < 16 && !placed; a++) { const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d); if (sim.canPlace('barracks', tx, ty, me)) placed = { tx, ty }; }
log('barracks spot', placed);
sim.command(0, { t: 'build', ids: workers.slice(0, 2), type: 'barracks', tx: placed.tx, ty: placed.ty });
run(20 * 40);
const bar = [...sim.ents.values()].find(e => e.kind === 'building' && e.type === 'barracks' && e.owner === 0);
log('barracks', bar && { built: bar.built, progress: bar.progress.toFixed(2), hp: bar.hp }, 'res', me.res);
// 2. gather
const mine = sim.nearestNode({ x: s.x, y: s.y }, 'mine', 20); const tree = sim.nearestNode({ x: s.x, y: s.y }, 'tree', 20);
sim.command(0, { t: 'gather', ids: workers.slice(2, 4), targetId: mine.id });
sim.command(0, { t: 'gather', ids: workers.slice(4, 5), targetId: tree.id });
run(20 * 60);
log('after gather res', me.res, 'stats', me.stats.gatheredP, me.stats.gatheredS);
// 3. train
sim.command(0, { t: 'train', id: bar.id, type: 'infantry' }); sim.command(0, { t: 'train', id: bar.id, type: 'ranged' });
sim.command(0, { t: 'rally', ids: [bar.id], x: s.x + 5, y: s.y + 5 });
run(20 * 40);
log('units', myUnits().map(u => u.type + ':' + u.order.type).join(','), 'pop', me.pop, me.popCap);
// 4. wall from a to b around the base
const a = { x: s.x - 6, y: s.y - 6 }, b = { x: s.x + 6, y: s.y - 6 };
while (!sim.buildable[a.y * sim.w + a.x]) a.x++; while (!sim.buildable[b.y * sim.w + b.x]) b.x--;
const path = sim.wallPath(a.x, a.y, b.x, b.y); log('wall path len', path && path.length, 'wood', me.res.s);
sim.command(0, { t: 'wall', ids: workers.slice(0, 2), x0: a.x, y0: a.y, x1: b.x, y1: b.y });
run(20 * 90);
const walls = [...sim.ents.values()].filter(e => e.kind === 'building' && e.type === 'wall' && e.owner === 0);
log('walls', walls.length, 'built', walls.filter(w => w.built).length, 'worker orders', myUnits().filter(u => u.role === 'worker').map(u => u.order.type + '/' + u.queue.length).join(','));
// 5. attack-move the army to enemy
const army = myUnits().filter(u => u.role !== 'worker').map(u => u.id);
const es = sim.players[1].spawn;
sim.command(0, { t: 'amove', ids: army, x: es.x, y: es.y });
run(20 * 120);
log('army after amove', myUnits().filter(u => u.role !== 'worker').map(u => `${u.type}@${u.x | 0},${u.y | 0}:${u.order.type}`).join(' '), 'kills', me.stats.unitsKilled, 'lost', me.stats.unitsLost);
// 6. cancel & smart build/repair
sim.command(0, { t: 'train', id: bar.id, type: 'infantry' }); const before = me.res.p; sim.command(0, { t: 'cancelTrain', id: bar.id, index: 0 }); log('cancel refund ok', me.res.p === before);
// 7. force game over: kill enemy buildings
for (const e of [...sim.ents.values()]) if (e.kind === 'building' && e.owner === 1) sim.dealDamage(e, 1e6, {}, 0, 0, 'siege');
run(40);
log('gameOver', sim.gameOver, 'alive', sim.players.map(p => p.alive));
