// Ages of War - shared game data (used by server sim and client UI)

export const TICK_RATE = 20;          // simulation ticks per second
export const NET_RATE = 10;           // snapshots per second
export const MAP_SIZE = 96;           // tiles per side
export const MAX_PLAYERS = 8;

export const TEAM_COLORS = [
  { id: 0, name: 'Červená',   hex: '#e23b3b' },
  { id: 1, name: 'Modrá',     hex: '#2f7ee8' },
  { id: 2, name: 'Zelená',    hex: '#3fbf4a' },
  { id: 3, name: 'Žlutá',     hex: '#f0c419' },
  { id: 4, name: 'Fialová',   hex: '#9b4fe0' },
  { id: 5, name: 'Oranžová',  hex: '#f07b1e' },
  { id: 6, name: 'Tyrkysová', hex: '#27c7c1' },
  { id: 7, name: 'Bílá',      hex: '#e8e8e8' },
];

// Terrain ids
export const T = { GRASS: 0, DIRT: 1, SAND: 2, SHALLOW: 3, WATER: 4, ROCK: 5 };

const commonUnits = {
  // key: shared "role" ids across eras. Names/visuals differ per era.
  worker:   { role: 'worker',   hp: 45,  armor: 0, dmg: 4,  range: 0.7, cooldown: 1.0, speed: 2.7, sight: 6, pop: 1, size: 0.32, trainTime: 12, cost: { p: 50, s: 0 },   building: 'hall',     domain: 'land', canGather: true, canBuild: true, projectile: null },
  infantry: { role: 'infantry', hp: 120, armor: 2, dmg: 13, range: 0.8, cooldown: 1.0, speed: 2.5, sight: 7, pop: 2, size: 0.34, trainTime: 15, cost: { p: 70, s: 10 },  building: 'barracks', domain: 'land', projectile: null, bonus: { cavalry: 1.3 } },
  ranged:   { role: 'ranged',   hp: 65,  armor: 0, dmg: 11, range: 5.5, cooldown: 1.3, speed: 2.6, sight: 8, pop: 2, size: 0.32, trainTime: 16, cost: { p: 60, s: 35 },  building: 'barracks', domain: 'land', projectile: 'arrow', bonus: { infantry: 1.25 } },
  cavalry:  { role: 'cavalry',  hp: 170, armor: 3, dmg: 20, range: 0.9, cooldown: 1.1, speed: 4.3, sight: 8, pop: 3, size: 0.42, trainTime: 22, cost: { p: 120, s: 40 }, building: 'stable',   domain: 'land', projectile: null, bonus: { ranged: 1.6, siege: 1.6 } },
  siege:    { role: 'siege',    hp: 130, armor: 1, dmg: 55, range: 8,   cooldown: 3.2, speed: 1.6, sight: 9, pop: 4, size: 0.5,  trainTime: 30, cost: { p: 160, s: 130 }, building: 'siege',    domain: 'land', projectile: 'rock', splash: 1.1, minRange: 2, bonus: { building: 3.0, wall: 4.0 } },
  ship:     { role: 'ship',     hp: 320, armor: 3, dmg: 24, range: 6.5, cooldown: 1.5, speed: 3.4, sight: 9, pop: 3, size: 0.6,  trainTime: 28, cost: { p: 130, s: 160 }, building: 'dock',     domain: 'sea',  projectile: 'bolt', bonus: { building: 1.5 } },
};

// Tier 2+ units (unlocked by building upgrades)
const tierUnits = {
  spearman:  { role: 'infantry', hp: 115, armor: 3, dmg: 10, range: 0.9, cooldown: 1.0, speed: 2.4, sight: 7, pop: 2, size: 0.34, trainTime: 16, cost: { p: 65, s: 25 },  building: 'barracks', domain: 'land', projectile: null, bonus: { cavalry: 2.2 } },
  skirmisher:{ role: 'ranged',   hp: 60,  armor: 0, dmg: 9,  range: 4,   cooldown: 1.0, speed: 3.2, sight: 8, pop: 2, size: 0.32, trainTime: 15, cost: { p: 55, s: 30 },  building: 'barracks', domain: 'land', projectile: 'arrow', bonus: { ranged: 1.5 } },
  veteran:   { role: 'infantry', hp: 190, armor: 4, dmg: 19, range: 0.85, cooldown: 1.0, speed: 2.5, sight: 7, pop: 3, size: 0.36, trainTime: 22, cost: { p: 115, s: 40 }, building: 'barracks', domain: 'land', projectile: null, bonus: { cavalry: 1.3, infantry: 1.15 } },
  longbow:   { role: 'ranged',   hp: 75,  armor: 1, dmg: 15, range: 6.5, cooldown: 1.3, speed: 2.6, sight: 9, pop: 2, size: 0.32, trainTime: 20, cost: { p: 90, s: 60 },  building: 'barracks', domain: 'land', projectile: 'arrow', bonus: { infantry: 1.3 } },
  heavycav:  { role: 'cavalry',  hp: 270, armor: 6, dmg: 27, range: 0.95, cooldown: 1.1, speed: 3.8, sight: 8, pop: 4, size: 0.44, trainTime: 28, cost: { p: 185, s: 70 }, building: 'stable', domain: 'land', projectile: null, bonus: { ranged: 1.6, siege: 1.8 } },
  chariot:   { role: 'cavalry',  hp: 230, armor: 3, dmg: 22, range: 1.0, cooldown: 1.2, speed: 4.0, sight: 8, pop: 4, size: 0.5, trainTime: 30, cost: { p: 200, s: 120 }, building: 'stable', domain: 'land', projectile: null, splash: 0.9, bonus: { infantry: 1.4 } },
  ballista:  { role: 'siege',    hp: 110, armor: 1, dmg: 45, range: 9,   cooldown: 2.5, speed: 1.8, sight: 10, pop: 3, size: 0.5, trainTime: 28, cost: { p: 140, s: 110 }, building: 'siege', domain: 'land', projectile: 'bolt', minRange: 1.5, bonus: { infantry: 1.6, cavalry: 1.6, building: 1.5 } },
  heavyship: { role: 'ship',     hp: 520, armor: 5, dmg: 40, range: 7,   cooldown: 1.6, speed: 3.0, sight: 10, pop: 5, size: 0.7, trainTime: 36, cost: { p: 220, s: 260 }, building: 'dock', domain: 'sea', projectile: 'bolt', bonus: { building: 1.6, ship: 1.3 } },
  hero:      { role: 'cavalry',  hp: 620, armor: 6, dmg: 42, range: 1.0, cooldown: 1.0, speed: 3.6, sight: 10, pop: 6, size: 0.46, trainTime: 60, cost: { p: 500, s: 200 }, building: 'hall', domain: 'land', projectile: null, unique: true, aura: { range: 5, dmg: 1.2 }, bonus: {} },
  // ww2 variants
  sniper:    { role: 'ranged',   hp: 60,  armor: 0, dmg: 32, range: 8,   cooldown: 2.2, speed: 2.6, sight: 10, pop: 2, size: 0.32, trainTime: 20, cost: { p: 90, s: 40 },  building: 'barracks', domain: 'land', projectile: 'bullet', bonus: { infantry: 1.5, ranged: 1.6 } },
  flamer:    { role: 'infantry', hp: 105, armor: 1, dmg: 7,  range: 2.2, cooldown: 0.25, speed: 2.5, sight: 7, pop: 2, size: 0.34, trainTime: 18, cost: { p: 80, s: 40 },  building: 'barracks', domain: 'land', projectile: 'flame', splash: 0.8, bonus: { building: 2.2, infantry: 1.2 } },
  para:      { role: 'infantry', hp: 135, armor: 3, dmg: 12, range: 3.5, cooldown: 0.5, speed: 3.0, sight: 8, pop: 3, size: 0.34, trainTime: 22, cost: { p: 120, s: 50 }, building: 'barracks', domain: 'land', projectile: 'bullet', bonus: { ranged: 1.3 } },
  atgun:     { role: 'ranged',   hp: 90,  armor: 2, dmg: 46, range: 6,   cooldown: 2.5, speed: 2.2, sight: 8, pop: 3, size: 0.4, trainTime: 24, cost: { p: 110, s: 70 }, building: 'barracks', domain: 'land', projectile: 'shell', bonus: { cavalry: 3.0 } },
  heavytank: { role: 'cavalry',  hp: 560, armor: 10, dmg: 56, range: 5,  cooldown: 2.2, speed: 2.6, sight: 8, pop: 5, size: 0.56, trainTime: 40, cost: { p: 300, s: 180 }, building: 'stable', domain: 'land', projectile: 'shell', bonus: { infantry: 1.3, building: 1.8 } },
  tankdestroyer: { role: 'cavalry', hp: 380, armor: 8, dmg: 72, range: 6.5, cooldown: 2.5, speed: 3.0, sight: 9, pop: 4, size: 0.5, trainTime: 34, cost: { p: 280, s: 160 }, building: 'stable', domain: 'land', projectile: 'shell', bonus: { cavalry: 2.2 } },
  rocketart: { role: 'siege',    hp: 120, armor: 1, dmg: 36, range: 11,  cooldown: 4.5, speed: 2.4, sight: 10, pop: 4, size: 0.5, trainTime: 34, cost: { p: 220, s: 160 }, building: 'siege', domain: 'land', projectile: 'shell', splash: 2.0, minRange: 3, bonus: { building: 2.0, infantry: 1.5 } },
  cruiser:   { role: 'ship',     hp: 660, armor: 6, dmg: 50, range: 8.5, cooldown: 1.8, speed: 2.8, sight: 11, pop: 6, size: 0.8, trainTime: 44, cost: { p: 280, s: 320 }, building: 'dock', domain: 'sea', projectile: 'shell', bonus: { building: 1.6, ship: 1.3 } },
  hero2:     { role: 'cavalry',  hp: 520, armor: 7, dmg: 24, range: 4,   cooldown: 0.6, speed: 3.6, sight: 11, pop: 6, size: 0.5, trainTime: 60, cost: { p: 500, s: 200 }, building: 'hall', domain: 'land', projectile: 'bullet', unique: true, aura: { range: 5, dmg: 1.2 }, bonus: {} },
};

const commonBuildings = {
  hall:     { hp: 1600, armor: 5, w: 3, h: 3, cost: { p: 350, s: 250 }, buildTime: 70, trains: ['worker'], dropoff: true, popCap: 40, hotkey: 'H',
              upgrades: [ { level: 2, cost: { p: 300, s: 200 }, time: 60, unlocks: [], popCap: 10, hp: 1.2 }, { level: 3, cost: { p: 500, s: 350 }, time: 80, unlocks: [], popCap: 10, hp: 1.2 }, { level: 4, cost: { p: 800, s: 500 }, time: 100, unlocks: ['hero'], popCap: 20, hp: 1.25 } ] },
  house:    { hp: 420,  armor: 3, w: 2, h: 2, cost: { p: 40, s: 50 },   buildTime: 18, trains: [], popCap: 8, hotkey: 'E' },
  barracks: { hp: 950,  armor: 4, w: 3, h: 3, cost: { p: 130, s: 90 },  buildTime: 32, trains: ['infantry', 'ranged'], hotkey: 'B',
              upgrades: [ { level: 2, cost: { p: 200, s: 150 }, time: 45, unlocks: ['spearman', 'skirmisher'], hall: 2 }, { level: 3, cost: { p: 350, s: 250 }, time: 60, unlocks: ['veteran', 'longbow'], hall: 3 } ] },
  stable:   { hp: 950,  armor: 4, w: 3, h: 3, cost: { p: 160, s: 110 }, buildTime: 36, trains: ['cavalry'], hotkey: 'S',
              upgrades: [ { level: 2, cost: { p: 220, s: 160 }, time: 45, unlocks: ['heavycav'], hall: 2 }, { level: 3, cost: { p: 380, s: 260 }, time: 60, unlocks: ['chariot'], hall: 3 } ] },
  siege:    { hp: 850,  armor: 4, w: 3, h: 3, cost: { p: 170, s: 140 }, buildTime: 38, trains: ['siege'], hotkey: 'W',
              upgrades: [ { level: 2, cost: { p: 240, s: 200 }, time: 50, unlocks: ['ballista'], hall: 2 } ] },
  dock:     { hp: 850,  armor: 4, w: 3, h: 3, cost: { p: 110, s: 140 }, buildTime: 32, trains: ['ship'], shore: true, hotkey: 'D',
              upgrades: [ { level: 2, cost: { p: 220, s: 240 }, time: 50, unlocks: ['heavyship'], hall: 2 } ] },
  tower:    { hp: 550,  armor: 6, w: 1, h: 1, cost: { p: 70,  s: 90 },  buildTime: 26, trains: [], attack: { dmg: 15, range: 6.5, cooldown: 1.0, projectile: 'arrow' }, hotkey: 'T',
              upgrades: [ { level: 2, cost: { p: 90, s: 110 }, time: 30, unlocks: [], hp: 1.3, dmgMul: 1.4, rangeAdd: 0.5, armorAdd: 2, desc: 'Zesílená věž: +40 % útok, +0,5 dosah, +2 pancíř.' }, { level: 3, cost: { p: 160, s: 180 }, time: 40, unlocks: [], hp: 1.3, dmgMul: 1.5, rangeAdd: 0.5, armorAdd: 2, hall: 2, desc: 'Pevnost: dvojitá střelba (+50 % útok), +0,5 dosah, +2 pancíř.' } ] },
  wall:     { hp: 320,  armor: 12, w: 1, h: 1, cost: { p: 0,   s: 8 },   buildTime: 4,  trains: [], isWall: true, hotkey: 'L' },
  gate:     { hp: 420,  armor: 9,  w: 1, h: 1, cost: { p: 0,   s: 25 },  buildTime: 6,  trains: [], isWall: true, isGate: true, hotkey: 'G', noBuildMenu: true },
};

function era(base) { return base; }

export const ERAS = {
  antiquity: era({
    id: 'antiquity',
    name: 'Starověk',
    tagline: 'Legie, hoplíti a triéry. Zlato z dolů, dřevo z lesů.',
    available: true,
    year: '~50 př. n. l.',
    resources: {
      p: { id: 'gold', name: 'Zlato', acc: 'zlato', short: 'Zl', color: '#f2c94c' },
      s: { id: 'wood', name: 'Dřevo', acc: 'dřevo', short: 'Dř', color: '#b7863f' },
    },
    nodes: { mine: { name: 'Zlatý důl', amount: 12000, perTrip: 10, tripTicks: 22 }, secondary: { name: 'Les', kind: 'trees', amount: 150, perTrip: 10, chopTicks: 8, chopHits: 5 } },
    palette: { grass: [92, 140, 58], grass2: [78, 122, 50], dirt: [150, 120, 78], sand: [214, 196, 140], water: [36, 96, 150], deep: [22, 62, 112], rock: [120, 118, 110] },
    music: { scale: [0, 2, 3, 5, 7, 8, 10], root: 220, tempo: 70, style: 'lyre' },
    factions: [
      { id: 'rome',     name: 'Řím',      desc: 'Disciplína: pěchota +15 % HP, věže +10 % dmg.',        mods: { infantry: { hp: 1.15 }, tower: { dmg: 1.1 } },
        unitNames: { worker: 'Otrok', infantry: 'Legionář', ranged: 'Lučištník', cavalry: 'Equites', siege: 'Onager', ship: 'Triéra' } },
      { id: 'gaul',     name: 'Galové',   desc: 'Divokost: pěchota +10 % dmg, jezdectvo +10 % rychlost.', mods: { infantry: { dmg: 1.1 }, cavalry: { speed: 1.1 } },
        unitNames: { worker: 'Sedlák', infantry: 'Válečník', ranged: 'Prakovník', cavalry: 'Jezdec', siege: 'Beranidlo', ship: 'Dlouhá loď' } },
      { id: 'greece',   name: 'Řecko',    desc: 'Falanga: střelci +15 % dmg, lodě +10 % HP.',            mods: { ranged: { dmg: 1.15 }, ship: { hp: 1.1 } },
        unitNames: { worker: 'Dělník', infantry: 'Hoplít', ranged: 'Toxotés', cavalry: 'Hippeus', siege: 'Balista', ship: 'Pentéra' } },
      { id: 'carthage', name: 'Kartágo',  desc: 'Obchod: doly +15 % výnos, lodě -15 % cena.',           mods: { economy: { mine: 1.15 }, ship: { cost: 0.85 } },
        unitNames: { worker: 'Dělník', infantry: 'Posvátná četa', ranged: 'Baleárský prakovník', cavalry: 'Numidský jezdec', siege: 'Katapult', ship: 'Kvinkveréma' } },
    ],
    units: {
      worker:   { ...commonUnits.worker,   name: 'Dělník',      sprite: 'ant_worker' },
      infantry: { ...commonUnits.infantry, name: 'Pěšák',       sprite: 'ant_infantry' },
      ranged:   { ...commonUnits.ranged,   name: 'Lučištník',   sprite: 'ant_ranged' },
      cavalry:  { ...commonUnits.cavalry,  name: 'Jezdec',      sprite: 'ant_cavalry' },
      siege:    { ...commonUnits.siege,    name: 'Katapult',    sprite: 'ant_siege' },
      ship:     { ...commonUnits.ship,     name: 'Válečná loď', sprite: 'ant_ship' },
      spearman: { ...tierUnits.spearman,   name: 'Kopiník',     sprite: 'ant_spearman', desc: 'Protijezdecká pěchota.' },
      skirmisher: { ...tierUnits.skirmisher, name: 'Harcovník', sprite: 'ant_skirmisher', desc: 'Rychlý vrhač oštěpů, dobrý proti střelcům.' },
      veteran:  { ...tierUnits.veteran,    name: 'Veterán',     sprite: 'ant_veteran', desc: 'Těžká elitní pěchota.' },
      longbow:  { ...tierUnits.longbow,    name: 'Elitní lučištník', sprite: 'ant_longbow', desc: 'Střelec s velkým dosahem.' },
      heavycav: { ...tierUnits.heavycav,   name: 'Katafrakt',   sprite: 'ant_heavycav', desc: 'Obrněné těžké jezdectvo.' },
      chariot:  { ...tierUnits.chariot,    name: 'Válečný vůz', sprite: 'ant_chariot', desc: 'Kosy na kolech zasahují více nepřátel najednou.' },
      ballista: { ...tierUnits.ballista,   name: 'Balista',     sprite: 'ant_ballista', desc: 'Přesná dalekonosná zbraň proti jednotkám.' },
      heavyship: { ...tierUnits.heavyship, name: 'Těžká loď',   sprite: 'ant_heavyship', desc: 'Velká válečná loď.' },
      hero:     { ...tierUnits.hero,       name: 'Vojevůdce',   sprite: 'ant_hero', desc: 'Jediný hrdina. Spojenci v okolí +20 % útok.' },
    },
    buildings: {
      hall:     { ...commonBuildings.hall,     name: 'Radnice',         sprite: 'ant_hall',     desc: 'Hlavní budova. Cvičí dělníky, sklad surovin, +40 populace.' },
      house:    { ...commonBuildings.house,    name: 'Dům',             sprite: 'ant_house',    desc: 'Ubytování: +8 populace.' },
      barracks: { ...commonBuildings.barracks, name: 'Kasárna',         sprite: 'ant_barracks', desc: 'Cvičí pěchotu a lučištníky.' },
      stable:   { ...commonBuildings.stable,   name: 'Stáje',           sprite: 'ant_stable',   desc: 'Cvičí jezdectvo.' },
      siege:    { ...commonBuildings.siege,    name: 'Obléhací dílna',  sprite: 'ant_siege',    desc: 'Staví katapulty.' },
      dock:     { ...commonBuildings.dock,     name: 'Přístav',         sprite: 'ant_dock',     desc: 'Staví válečné lodě. Musí stát u vody.' },
      tower:    { ...commonBuildings.tower,    name: 'Strážní věž',     sprite: 'ant_tower',    desc: 'Automaticky střílí na nepřátele.' },
      wall:     { ...commonBuildings.wall,     name: 'Kamenná hradba',  sprite: 'ant_wall',     desc: 'Klikni na začátek a konec – hradba obejde překážky.' },
      gate:     { ...commonBuildings.gate,     name: 'Brána',           sprite: 'ant_gate',     desc: 'Průchozí jen pro tvůj tým. Vznikne z hradby.' },
    },
    hallNames: ['Radnice', 'Město', 'Metropole', 'Císařské město'],
  }),

  ww2: era({
    id: 'ww2',
    name: 'Druhá světová',
    tagline: 'Tanky, houfnice a torpédoborce. Ropa z vrtů, dřevo z lesů.',
    available: true,
    year: '1939–1945',
    resources: {
      p: { id: 'oil', name: 'Ropa', acc: 'ropu', short: 'Ro', color: '#3a3a3a' },
      s: { id: 'wood', name: 'Dřevo', acc: 'dřevo', short: 'Dř', color: '#b7863f' },
    },
    nodes: { mine: { name: 'Ropné pole', amount: 12000, perTrip: 10, tripTicks: 22 }, secondary: { name: 'Les', kind: 'trees', amount: 150, perTrip: 10, chopTicks: 8, chopHits: 5 } },
    palette: { grass: [96, 118, 64], grass2: [82, 102, 56], dirt: [122, 104, 80], sand: [186, 176, 140], water: [42, 84, 118], deep: [26, 54, 84], rock: [104, 104, 100] },
    music: { scale: [0, 2, 4, 5, 7, 9, 11], root: 196, tempo: 92, style: 'march' },
    factions: [
      { id: 'germany', name: 'Německo', desc: 'Blitzkrieg: tanky +15 % pancíř, +5 % rychlost.',    mods: { cavalry: { armor: 1.15, speed: 1.05 } },
        unitNames: { worker: 'Ženista', infantry: 'Grenadier', ranged: 'MG-34 střelec', cavalry: 'Panzer IV', siege: 'Houfnice sFH 18', ship: 'Torpédoborec Z' } },
      { id: 'poland',  name: 'Polsko',  desc: 'Odhodlání: pěchota -20 % doba výcviku, +10 % HP.',  mods: { infantry: { trainTime: 0.8, hp: 1.1 } },
        unitNames: { worker: 'Saper', infantry: 'Pěšák', ranged: 'Kulometčík', cavalry: '7TP', siege: 'Houfnice wz. 14', ship: 'ORP Torpédoborec' } },
      { id: 'ussr',    name: 'SSSR',    desc: 'Masa: pěchota -20 % cena, ropa +10 % výnos.',      mods: { infantry: { cost: 0.8 }, economy: { mine: 1.1 } },
        unitNames: { worker: 'Dělník', infantry: 'Střelec', ranged: 'DP-27 kulometčík', cavalry: 'T-34', siege: 'Kaťuša', ship: 'Torpédoborec Gněvnyj' } },
      { id: 'usa',     name: 'USA',     desc: 'Průmysl: dělostřelectvo +1 dosah, budovy -15 % cena.', mods: { siege: { range: 1.12 }, buildings: { cost: 0.85 } },
        unitNames: { worker: 'Ženista', infantry: 'GI', ranged: 'BAR střelec', cavalry: 'M4 Sherman', siege: 'Houfnice M101', ship: 'Torpédoborec Fletcher' } },
      { id: 'uk',      name: 'Británie', desc: 'Námořnictvo: lodě +20 % HP, bunkry +1 dosah.',    mods: { ship: { hp: 1.2 }, tower: { range: 1.15 } },
        unitNames: { worker: 'Sapér', infantry: 'Tommy', ranged: 'Bren střelec', cavalry: 'Cromwell', siege: 'Houfnice 25pdr', ship: 'HMS Torpédoborec' } },
    ],
    units: {
      worker:   { ...commonUnits.worker,   name: 'Ženista',      sprite: 'ww2_worker' },
      infantry: { ...commonUnits.infantry, name: 'Pěšák',        sprite: 'ww2_infantry', range: 3.5, projectile: 'bullet', dmg: 9, cooldown: 0.7, hp: 100 },
      ranged:   { ...commonUnits.ranged,   name: 'Kulometčík',   sprite: 'ww2_ranged', range: 6, projectile: 'bullet', dmg: 7, cooldown: 0.35, hp: 70 },
      cavalry:  { ...commonUnits.cavalry,  name: 'Tank',         sprite: 'ww2_tank', hp: 340, armor: 7, dmg: 38, range: 4.5, cooldown: 1.8, speed: 3.3, size: 0.5, cost: { p: 190, s: 110 }, projectile: 'shell', bonus: { infantry: 1.2, building: 1.5 } },
      siege:    { ...commonUnits.siege,    name: 'Dělostřelectvo', sprite: 'ww2_artillery', range: 10, projectile: 'shell', splash: 1.4, dmg: 60, minRange: 3 },
      ship:     { ...commonUnits.ship,     name: 'Torpédoborec', sprite: 'ww2_destroyer', hp: 380, range: 7.5, projectile: 'shell', dmg: 30 },
      spearman: { ...tierUnits.flamer,     name: 'Plamenometčík', sprite: 'ww2_flamer', desc: 'Krátký dosah, zapaluje budovy i pěchotu.' },
      skirmisher: { ...tierUnits.sniper,   name: 'Odstřelovač', sprite: 'ww2_sniper', desc: 'Velký dosah, smrtící proti pěchotě.' },
      veteran:  { ...tierUnits.para,       name: 'Výsadkář',    sprite: 'ww2_para', desc: 'Rychlá elitní pěchota se samopalem.' },
      longbow:  { ...tierUnits.atgun,      name: 'Protitankové dělo', sprite: 'ww2_atgun', desc: 'Ničí tanky.' },
      heavycav: { ...tierUnits.heavytank,  name: 'Těžký tank',  sprite: 'ww2_heavytank', desc: 'Pomalý, silně pancéřovaný.' },
      chariot:  { ...tierUnits.tankdestroyer, name: 'Stíhač tanků', sprite: 'ww2_td', desc: 'Dlouhé dělo, výborný proti tankům.' },
      ballista: { ...tierUnits.rocketart,  name: 'Raketomet',   sprite: 'ww2_rockets', desc: 'Salva raket s velkým rozptylem.' },
      heavyship: { ...tierUnits.cruiser,   name: 'Křižník',     sprite: 'ww2_cruiser', desc: 'Těžká válečná loď.' },
      hero:     { ...tierUnits.hero2,      name: 'Polní maršál', sprite: 'ww2_hero', desc: 'Jediný hrdina. Spojenci v okolí +20 % útok.' },
    },
    buildings: {
      hall:     { ...commonBuildings.hall,     name: 'Velitelství',     sprite: 'ww2_hall',     desc: 'Hlavní budova. Cvičí ženisty, sklad surovin, +40 populace.' },
      house:    { ...commonBuildings.house,    name: 'Ubytovna',        sprite: 'ww2_house',    desc: 'Ubytování: +8 populace.' },
      barracks: { ...commonBuildings.barracks, name: 'Kasárna',         sprite: 'ww2_barracks', desc: 'Cvičí pěchotu a kulometčíky.' },
      stable:   { ...commonBuildings.stable,   name: 'Tanková továrna', sprite: 'ww2_factory',  desc: 'Vyrábí tanky.' },
      siege:    { ...commonBuildings.siege,    name: 'Dělostřelecký park', sprite: 'ww2_artpark', desc: 'Vyrábí houfnice.' },
      dock:     { ...commonBuildings.dock,     name: 'Loděnice',        sprite: 'ww2_shipyard', desc: 'Staví torpédoborce. Musí stát u vody.' },
      tower:    { ...commonBuildings.tower,    name: 'Bunkr',           sprite: 'ww2_bunker',   desc: 'Kulometné hnízdo, střílí automaticky.', attack: { dmg: 6, range: 6.5, cooldown: 0.3, projectile: 'bullet' } },
      wall:     { ...commonBuildings.wall,     name: 'Betonová zeď',    sprite: 'ww2_wall',     desc: 'Klikni na začátek a konec – zeď obejde překážky.' },
      gate:     { ...commonBuildings.gate,     name: 'Závora',          sprite: 'ww2_gate',     desc: 'Průchozí jen pro tvůj tým. Vznikne ze zdi.' },
    },
    hallNames: ['Velitelství', 'Štáb', 'Generální štáb', 'Hlavní stan'],
  }),

  scifi: era({
    id: 'scifi',
    name: 'Sci-fi',
    tagline: 'Mimozemské houby, plazmové věže, hover flotily. Plazma z krystalů, houba z hájů.',
    available: true,
    year: '2340',
    resources: {
      p: { id: 'plasma', name: 'Plazma', acc: 'plazmu', short: 'Pl', color: '#6ae0ff' },
      s: { id: 'spore', name: 'Houba', acc: 'houbu', short: 'Ho', color: '#c56aff' },
    },
    nodes: { mine: { name: 'Plazmový krystal', amount: 12000, perTrip: 10, tripTicks: 20 }, secondary: { name: 'Houbový háj', kind: 'fungus', amount: 150, perTrip: 10, chopTicks: 7, chopHits: 5 } },
    palette: { grass: [70, 116, 104], grass2: [58, 98, 90], dirt: [112, 96, 124], sand: [178, 164, 196], water: [34, 118, 160], deep: [14, 58, 118], rock: [92, 86, 112] },
    music: { scale: [0, 2, 3, 7, 8, 10], root: 110, tempo: 80, style: 'synth' },
    factions: [
      { id: 'terra', name: 'Terranská federace', desc: 'Disciplína: pěchota +15 % HP, věže +10 % dmg.', mods: { infantry: { hp: 1.15 }, tower: { dmg: 1.1 } },
        unitNames: { worker: 'Servisní dron', infantry: 'Mariňák', ranged: 'Railgunner', cavalry: 'Hover tank Kestrel', siege: 'Mortarový walker', ship: 'Hover člun' } },
      { id: 'mars', name: 'Marťanská republika', desc: 'Průmysl: vozidla +10 % pancíř, +5 % rychlost.', mods: { cavalry: { armor: 1.1, speed: 1.05 } },
        unitNames: { worker: 'Dron', infantry: 'Rudý gardista', ranged: 'Ostřelovač Dusk', cavalry: 'Hover tank Ares', siege: 'Mortarový walker', ship: 'Hover člun Phobos' } },
      { id: 'synth', name: 'Syntetici', desc: 'Efektivita: jednotky -10 % cena, krystaly +10 % výnos.', mods: { infantry: { cost: 0.9 }, ranged: { cost: 0.9 }, economy: { mine: 1.1 } },
        unitNames: { worker: 'Konstrukční jednotka', infantry: 'Bojový android', ranged: 'Přesný android', cavalry: 'Autonomní tank', siege: 'Artilerijní jednotka', ship: 'Hover platforma' } },
      { id: 'void', name: 'Nomádi Prázdnoty', desc: 'Lovci: střelci +15 % dmg, lodě +10 % HP.', mods: { ranged: { dmg: 1.15 }, ship: { hp: 1.1 } },
        unitNames: { worker: 'Sběrač', infantry: 'Nájezdník', ranged: 'Lovec', cavalry: 'Hover jezdec', siege: 'Vrhač', ship: 'Hover korzár' } },
    ],
    units: {
      worker:   { ...commonUnits.worker,   name: 'Dron',            sprite: 'sf_worker', speed: 3.0 },
      infantry: { ...commonUnits.infantry, name: 'Mariňák',         sprite: 'sf_infantry', range: 3.2, projectile: 'plasma', dmg: 10, cooldown: 0.8, hp: 110 },
      ranged:   { ...commonUnits.ranged,   name: 'Railgunner',      sprite: 'sf_ranged', range: 7, projectile: 'rail', dmg: 16, cooldown: 1.6, hp: 65 },
      cavalry:  { ...commonUnits.cavalry,  name: 'Hover tank',      sprite: 'sf_tank', hp: 320, armor: 6, dmg: 34, range: 4.5, cooldown: 1.6, speed: 3.8, size: 0.5, cost: { p: 190, s: 110 }, projectile: 'plasma', bonus: { infantry: 1.2, building: 1.4 } },
      siege:    { ...commonUnits.siege,    name: 'Mortarový walker', sprite: 'sf_walker', range: 9.5, projectile: 'plasmaShell', splash: 1.5, dmg: 58, minRange: 3, speed: 1.9 },
      ship:     { ...commonUnits.ship,     name: 'Hover člun',      sprite: 'sf_boat', hp: 360, range: 7, projectile: 'plasma', dmg: 28, speed: 3.8 },
      spearman: { ...tierUnits.spearman,   name: 'Štítonoš',        sprite: 'sf_shield', desc: 'Energetický štít, ničí vozidla raketami.', range: 3, projectile: 'plasma', armor: 4 },
      skirmisher: { ...tierUnits.skirmisher, name: 'Jetpack voják', sprite: 'sf_jet', desc: 'Velmi rychlý, obtěžuje střelce.', range: 3, projectile: 'plasma', speed: 3.8 },
      veteran:  { ...tierUnits.veteran,    name: 'Těžký exoskelet', sprite: 'sf_exo', desc: 'Pancéřovaná elitní pěchota.', range: 3.2, projectile: 'plasma', armor: 5 },
      longbow:  { ...tierUnits.longbow,    name: 'Odstřelovací dron', sprite: 'sf_snipedrone', desc: 'Létající střelec s velkým dosahem.', range: 8, projectile: 'rail' },
      heavycav: { ...tierUnits.heavycav,   name: 'Těžký hover tank', sprite: 'sf_heavytank', desc: 'Silně pancéřovaný, dvojité dělo.', range: 5, projectile: 'plasma' },
      chariot:  { ...tierUnits.chariot,    name: 'Bojový mech',     sprite: 'sf_mech', desc: 'Kráčející mech s plazmovými kanóny.', range: 3.5, projectile: 'plasma', splash: 0.9, speed: 3.2 },
      ballista: { ...tierUnits.ballista,   name: 'Laserová platforma', sprite: 'sf_laser', desc: 'Přesný dalekonosný laser.', range: 10, projectile: 'rail' },
      heavyship: { ...tierUnits.heavyship, name: 'Hover křižník',   sprite: 'sf_cruiser', desc: 'Těžká hover válečná loď.', range: 8, projectile: 'plasmaShell', splash: 1.0 },
      hero:     { ...tierUnits.hero2,      name: 'Velitel v mechu', sprite: 'sf_hero', desc: 'Jediný hrdina. Spojenci v okolí +20 % útok.', range: 4, projectile: 'plasma', hp: 700, dmg: 34 },
    },
    buildings: {
      hall:     { ...commonBuildings.hall,     name: 'Nexus',              sprite: 'sf_hall',     desc: 'Hlavní budova. Vyrábí drony, sklad surovin, +40 populace.' },
      house:    { ...commonBuildings.house,    name: 'Obytný modul',       sprite: 'sf_house',    desc: 'Ubytování: +8 populace.' },
      barracks: { ...commonBuildings.barracks, name: 'Výcviková kapsle',   sprite: 'sf_barracks', desc: 'Cvičí mariňáky a railgunnery.' },
      stable:   { ...commonBuildings.stable,   name: 'Továrna na vozidla', sprite: 'sf_factory',  desc: 'Vyrábí hover tanky.' },
      siege:    { ...commonBuildings.siege,    name: 'Zbrojní laboratoř',  sprite: 'sf_lab',      desc: 'Staví mortarové walkery.' },
      dock:     { ...commonBuildings.dock,     name: 'Hover přístav',      sprite: 'sf_dock',     desc: 'Staví hover čluny. Musí stát u vody.' },
      tower:    { ...commonBuildings.tower,    name: 'Plazmová věž',       sprite: 'sf_tower',    desc: 'Automatická plazmová obrana.', attack: { dmg: 16, range: 7, cooldown: 0.9, projectile: 'plasma' } },
      wall:     { ...commonBuildings.wall,     name: 'Energetická bariéra', sprite: 'sf_wall',    desc: 'Klikni na začátek a konec – bariéra obejde překážky.' },
      gate:     { ...commonBuildings.gate,     name: 'Průchod bariérou',   sprite: 'sf_gate',     desc: 'Průchozí jen pro tvůj tým. Vznikne z bariéry.' },
    },
    hallNames: ['Nexus', 'Kolonie', 'Metropole', 'Orbitální centrum'],
  }),
};

export const ERA_ORDER = ['antiquity', 'ww2', 'scifi'];

// Research (AoE blacksmith style). Cost scales with level. Names differ per era.
export const RESEARCH = {
  atk_inf:   { building: 'barracks', maxLevel: 3, cost: { p: 100, s: 60 }, time: 35, roles: ['infantry', 'ranged'], dmgAdd: 2, hotkey: 'I',
               names: { antiquity: 'Ostřejší čepele', ww2: 'Lepší munice', scifi: 'Plazmové články' }, desc: 'Pěchota a střelci +2 útok za úroveň.' },
  arm_inf:   { building: 'barracks', maxLevel: 3, cost: { p: 80, s: 90 }, time: 35, roles: ['infantry', 'ranged', 'worker'], armorAdd: 1, hotkey: 'O',
               names: { antiquity: 'Lepší zbroj', ww2: 'Neprůstřelné vesty', scifi: 'Energetické štíty' }, desc: 'Pěchota, střelci a dělníci +1 pancíř za úroveň.' },
  atk_veh:   { building: 'stable', maxLevel: 3, cost: { p: 140, s: 80 }, time: 40, roles: ['cavalry'], dmgAdd: 3, hotkey: 'I',
               names: { antiquity: 'Chov válečných koní', ww2: 'Průbojné granáty', scifi: 'Zesílené kanóny' }, desc: 'Jezdectvo / vozidla +3 útok za úroveň.' },
  arm_veh:   { building: 'stable', maxLevel: 3, cost: { p: 120, s: 110 }, time: 40, roles: ['cavalry'], armorAdd: 1, hotkey: 'O',
               names: { antiquity: 'Koňská zbroj', ww2: 'Přídavné pancéřování', scifi: 'Nanopancíř' }, desc: 'Jezdectvo / vozidla +1 pancíř za úroveň.' },
  atk_siege: { building: 'siege', maxLevel: 2, cost: { p: 160, s: 140 }, time: 45, roles: ['siege', 'ship'], dmgMul: 1.15, hotkey: 'I',
               names: { antiquity: 'Obléhací inženýrství', ww2: 'Balistika', scifi: 'Přesné zaměřovače' }, desc: 'Obléhací stroje a lodě +15 % útok za úroveň.' },
};

// Build the effective (faction-modified) unit/building stats table for a player.
export function makeTechTable(eraId, factionId) {
  const e = ERAS[eraId];
  const f = e.factions.find(x => x.id === factionId) || e.factions[0];
  const units = {};
  for (const [k, u] of Object.entries(e.units)) {
    const m = f.mods[k] || {};
    const cost = { p: Math.round(u.cost.p * (m.cost || 1)), s: Math.round(u.cost.s * (m.cost || 1)) };
    units[k] = {
      ...u, id: k, name: (f.unitNames && f.unitNames[k]) || u.name, genericName: u.name,
      hp: Math.round(u.hp * (m.hp || 1)), armor: Math.round(u.armor * (m.armor || 1)),
      dmg: Math.round(u.dmg * (m.dmg || 1)), speed: u.speed * (m.speed || 1),
      range: u.range * (m.range || 1), trainTime: u.trainTime * (m.trainTime || 1), cost,
    };
  }
  const buildings = {};
  const bmods = f.mods.buildings || {};
  for (const [k, b] of Object.entries(e.buildings)) {
    const m = f.mods[k] || {};
    const cmul = (m.cost || 1) * (bmods.cost || 1);
    const attack = b.attack ? { ...b.attack, dmg: Math.round(b.attack.dmg * (m.dmg || 1)), range: b.attack.range * (m.range || 1) } : null;
    buildings[k] = { ...b, id: k, cost: { p: Math.round(b.cost.p * cmul), s: Math.round(b.cost.s * cmul) }, attack };
  }
  const economy = f.mods.economy || {};
  return { era: e, faction: f, units, buildings, economy };
}

export const CMD = {
  MOVE: 'move', ATTACK: 'attack', ATTACK_MOVE: 'amove', STOP: 'stop', HOLD: 'hold',
  GATHER: 'gather', BUILD: 'build', TRAIN: 'train', CANCEL_TRAIN: 'cancelTrain',
  RALLY: 'rally', WALL: 'wall', CANCEL_BUILD: 'cancelBuild', REPAIR: 'repair',
};

export const HOTKEYS = {
  worker: 'Q', infantry: 'Q', ranged: 'W', cavalry: 'Q', siege: 'Q', ship: 'Q',
};
