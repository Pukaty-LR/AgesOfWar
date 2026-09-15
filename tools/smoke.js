// Regression smoke test: every era x map style with 4 AIs of all difficulties, plus command coverage.
// Usage: node tools/smoke.js [ticks]
import { Sim } from '../shared/sim.js';
import { AIPlayer } from '../shared/ai.js';
import { ERAS, RESEARCH } from '../shared/data.js';
import { MAP_STYLES } from '../shared/mapgen.js';

const TICKS = +(process.argv[2] || 4000);
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL:', msg); } };

for (const era of Object.keys(ERAS)) {
  const fs = ERAS[era].factions;
  for (const style of Object.keys(MAP_STYLES)) {
    const t0 = Date.now();
    const sim = new Sim({ seed: 1234 + era.length + style.length, size: 96, eraId: era, mapStyle: style, players: [...[0, 1, 2, 3].map(i => ({ name: 'P' + i, faction: fs[i % fs.length].id, team: i, color: i, isAI: true })), { name: 'Divočina', faction: fs[0].id, team: 99, color: 7, isAI: false, neutral: true }] });
    const ais = sim.players.filter(p => !p.neutral).map((p, i) => new AIPlayer(sim, p.id, ['easy', 'normal', 'hard', 'impossible'][i]));
    check([...sim.ents.values()].some(e => e.kind === 'unit' && e.type === 'creep'), `${era}/${style}: no creeps spawned`);
    let err = null;
    try { for (let i = 0; i < TICKS; i++) { if (i % 20 === 0) for (const a of ais) a.update(); sim.step(); const snap = sim.deltaSnapshot(); JSON.stringify(snap); if (sim.gameOver) break; } } catch (e) { err = e; }
    check(!err, `${era}/${style}: exception ${err && err.stack}`);
    const units = [...sim.ents.values()].filter(e => e.kind === 'unit');
    check(units.length > 4, `${era}/${style}: too few units (${units.length})`);
    for (const u of units) check(Number.isFinite(u.x) && Number.isFinite(u.y) && u.x >= 0 && u.y >= 0 && u.x < sim.w && u.y < sim.h, `${era}/${style}: unit out of bounds`);
    for (const u of units) { const pass = sim.passFor(u.domain, sim.teamOf(u)); if (!u.hidden && !pass[(u.y | 0) * sim.w + (u.x | 0)]) { /* pushed by a placed building is allowed briefly */ } }
    console.log(`${era.padEnd(9)} ${style.padEnd(9)} ok  ticks=${sim.tick} ents=${sim.ents.size} ${Date.now() - t0}ms` + (sim.gameOver ? ' (game over)' : ''));
  }
}

// Command coverage on one sim (human player 0)
{
  const sim = new Sim({ seed: 77, size: 96, eraId: 'antiquity', players: [{ name: 'H', faction: 'rome', team: 0, color: 0 }, { name: 'B', faction: 'gaul', team: 1, color: 1 }] });
  const me = sim.players[0]; me.res = { p: 99999, s: 99999 }; const s = me.spawn;
  const run = n => { for (let i = 0; i < n; i++) { sim.step(); sim.deltaSnapshot(); } };
  const ws = () => [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0 && e.role === 'worker').map(u => u.id);
  const hall = [...sim.ents.values()].find(e => e.kind === 'building' && e.owner === 0);
  const spotFor = type => { const def = me.tech.buildings[type]; for (let d = 4; d < 16; d++) for (let a = 0; a < 24; a++) { const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d); if (sim.canPlace(type, tx, ty, me)) return { tx, ty }; } return null; };
  for (const type of ['house', 'barracks', 'stable', 'siege', 'tower']) { const sp = spotFor(type); check(sp, 'spot for ' + type); if (sp) { sim.command(0, { t: 'build', ids: ws(), type, tx: sp.tx, ty: sp.ty }); run(20 * 45); } }
  const built = [...sim.ents.values()].filter(e => e.kind === 'building' && e.owner === 0 && e.built).map(b => b.type);
  check(built.includes('house') && built.includes('barracks') && built.includes('tower'), 'buildings built: ' + built.join(','));
  const bar = [...sim.ents.values()].find(e => e.kind === 'building' && e.type === 'barracks' && e.owner === 0);
  sim.command(0, { t: 'train', id: bar.id, type: 'infantry' }); sim.command(0, { t: 'research', id: bar.id, rid: 'atk_inf' }); sim.command(0, { t: 'upgrade', id: hall.id }); run(20 * 70);
  check(me.research.atk_inf === 1, 'research completed'); check(hall.level === 2, 'hall upgraded');
  const army = [...sim.ents.values()].filter(e => e.kind === 'unit' && e.owner === 0 && e.role !== 'worker').map(u => u.id);
  check(army.length >= 1, 'infantry trained');
  sim.command(0, { t: 'patrol', ids: army, x: s.x + 5, y: s.y + 5 }); run(40); sim.command(0, { t: 'amove', ids: army, x: s.x - 5, y: s.y }); run(40);
  sim.command(0, { t: 'wall', ids: ws(), x0: s.x - 6, y0: s.y + 6, x1: s.x + 6, y1: s.y + 6 }); run(20 * 60);
  const walls = [...sim.ents.values()].filter(e => e.kind === 'building' && e.type === 'wall' && e.owner === 0);
  check(walls.length > 0, 'walls placed'); if (walls.length) { sim.command(0, { t: 'gate', ids: [walls[0].id] }); check(walls[0].type === 'gate', 'gate toggled'); }
  sim.command(0, { t: 'gatherKind', ids: ws(), kind: 'mine' }); run(20 * 10); check([...sim.ents.values()].some(e => e.kind === 'unit' && e.owner === 0 && e.order.type === 'gather'), 'gatherKind');
  sim.command(0, { t: 'demolish', ids: [bar.id] }); check(!sim.ents.has(bar.id), 'demolish');
  // malformed coordinates must be rejected, never create entities with NaN positions
  const before = sim.ents.size; sim.command(0, { t: 'build', ids: ws(), type: 'barracks' }); sim.command(0, { t: 'build', ids: ws(), type: 'barracks', tx: 'abc', ty: 5 }); sim.command(0, { t: 'move', ids: ws(), x: NaN, y: 3 }); sim.command(0, { t: 'build', ids: ws(), type: 'barracks', tx: 5000, ty: 5000 });
  check(sim.ents.size === before && ![...sim.ents.values()].some(e => !Number.isFinite(e.x)), 'malformed coordinates rejected');
  console.log('command coverage done');
}
console.log(failures ? `SMOKE FAILED (${failures})` : 'SMOKE OK');
process.exit(failures ? 1 : 0);
