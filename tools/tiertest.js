import { Sim } from '../shared/sim.js';
const sim = new Sim({ seed: 11, size: 96, eraId: 'antiquity', players: [ { name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'B', faction: 'gaul', team: 1, color: 1 } ] });
const me = sim.players[0]; me.res = { p: 9999, s: 9999 };
const hall = [...sim.ents.values()].find(e => e.kind === 'building' && e.owner === 0);
const run = n => { for (let i = 0; i < n; i++) { sim.step(); sim.deltaSnapshot(); } };
console.log('trains L1', sim.availableTrains(me, hall), 'hallLevel', sim.hallLevel(0));
sim.command(0, { t: 'train', id: hall.id, type: 'hero' }); console.log('hero train before L4 accepted?', hall.queue.length);
for (let i = 0; i < 3; i++) { sim.command(0, { t: 'upgrade', id: hall.id }); run(20 * 110); console.log('hall level', hall.level, 'hp', hall.maxHp, 'popCap', me.popCap, 'trains', sim.availableTrains(me, hall)); }
sim.command(0, { t: 'train', id: hall.id, type: 'hero' }); run(20 * 70); const hero = [...sim.ents.values()].find(e => e.kind === 'unit' && e.type === 'hero'); console.log('hero', !!hero, 'aura mult near', hero && sim.auraMult(hero));
sim.command(0, { t: 'train', id: hall.id, type: 'hero' }); console.log('second hero refused?', hall.queue.length === 0, sim.events.filter(e => e.t === 'msg').map(e => e.text));
// barracks upgrade needs hall level -> ok now
const s = me.spawn; let spot = null; for (let d = 4; d < 12 && !spot; d++) for (let a = 0; a < 16 && !spot; a++) { const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d); if (sim.canPlace('barracks', tx, ty, me)) spot = { tx, ty }; }
const ws = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker').map(u => u.id);
sim.command(0, { t: 'build', ids: ws, type: 'barracks', tx: spot.tx, ty: spot.ty }); run(20 * 40);
const bar = [...sim.ents.values()].find(e => e.kind === 'building' && e.type === 'barracks');
sim.command(0, { t: 'upgrade', id: bar.id }); run(20 * 50); sim.command(0, { t: 'upgrade', id: bar.id }); run(20 * 65);
console.log('barracks level', bar.level, 'trains', sim.availableTrains(me, bar));
for (const u of ['spearman', 'veteran', 'longbow', 'skirmisher']) sim.command(0, { t: 'train', id: bar.id, type: u }); run(20 * 80);
console.log('units', [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0).map(u => u.type).join(','));
// gate test: wall line with a gate; own unit passes, enemy does not
const y = s.y - 4; const x0 = s.x - 3, x1 = s.x + 3; const tiles = sim.wallPath(x0, y, x1, y);
sim.command(0, { t: 'wall', ids: ws, x0, y0: y, x1, y1: y }); run(20 * 80);
const walls = [...sim.ents.values()].filter(e => e.kind === 'building' && e.type === 'wall'); const mid = walls[Math.floor(walls.length / 2)];
sim.command(0, { t: 'gate', ids: [mid.id] }); console.log('gate', mid.type, 'passTeam0', sim.passTeam[0][mid.ty * sim.w + mid.tx], 'passTeam1', sim.passTeam[1][mid.ty * sim.w + mid.tx], 'passLand', sim.passLand[mid.ty * sim.w + mid.tx]);
