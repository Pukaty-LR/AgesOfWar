import { Sim } from '../shared/sim.js';
const sim = new Sim({ seed: 21, size: 96, eraId: 'ww2', players: [ { name: 'H', faction: 'usa', team: 0, color: 0 }, { name: 'B', faction: 'ussr', team: 1, color: 1 } ] });
const me = sim.players[0]; me.res = { p: 9999, s: 9999 }; const s = me.spawn;
const run = n => { for (let i = 0; i < n; i++) { sim.step(); sim.deltaSnapshot(); } };
let spot = null; for (let d = 4; d < 12 && !spot; d++) for (let a = 0; a < 16 && !spot; a++) { const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d); if (sim.canPlace('barracks', tx, ty, me)) spot = { tx, ty }; }
const ws = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0).map(u => u.id);
sim.command(0, { t: 'build', ids: ws, type: 'barracks', tx: spot.tx, ty: spot.ty }); run(20 * 40);
const bar = [...sim.ents.values()].find(e => e.kind === 'building' && e.type === 'barracks');
const inf = sim.spawnUnit(me, 'infantry', s.x + 3, s.y + 3); const d = me.tech.units.infantry;
console.log('base dmg/armor', sim.unitDmg(me, d), sim.unitArmor(me, d));
sim.command(0, { t: 'research', id: bar.id, rid: 'atk_inf' }); sim.command(0, { t: 'research', id: bar.id, rid: 'atk_inf' }); console.log('double queue blocked?', bar.queue.length === 1);
run(20 * 40); sim.command(0, { t: 'research', id: bar.id, rid: 'arm_inf' }); run(20 * 40);
console.log('after research', me.research, 'dmg/armor', sim.unitDmg(me, d), sim.unitArmor(me, d), 'events', sim.events.filter(e => e.t === 'researched').length);
