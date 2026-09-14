import { Sim } from '../shared/sim.js';
const sim = new Sim({ seed: 183395919, size: 96, eraId: 'ww2', players: [ { name: 'Tester', faction: 'germany', team: 0, color: 0 }, { name: 'B', faction: 'poland', team: 1, color: 1, isAI: true } ] });
const w = sim.w;
console.log('tile', sim.map.tiles[68*w+68], 'blockId', sim.blockId[68*w+68], 'buildable', sim.buildable[68*w+68], 'passLand', sim.passLand[68*w+68]);
console.log('same', sim.wallPath(68,68,68,68), 'adj', sim.wallPath(68,68,69,68));
console.log('spawn', sim.map.spawns);
