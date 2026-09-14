// Seeded map generation: terrain, spawns, forests, mines.
import { T } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise with smooth interpolation.
export function makeNoise(rng) {
  const P = new Uint8Array(512);
  const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rng();
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = grad[P[X + P[Y]]], b = grad[P[X + 1 + P[Y]]], c = grad[P[X + P[Y + 1]]], d = grad[P[X + 1 + P[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  return function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += n2(x * f, y * f) * amp; norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  };
}

export function generateMap(seed, size, numPlayers) {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const noise2 = makeNoise(rng);
  const w = size, h = size;
  const height = new Float32Array(w * h);
  const tiles = new Uint8Array(w * h);
  const moisture = new Float32Array(w * h);

  // Spawn positions on an ellipse.
  const spawns = [];
  const cx = w / 2, cy = h / 2;
  const rx = w / 2 - 13, ry = h / 2 - 13;
  const a0 = Math.PI / 4 + (numPlayers === 2 ? 0 : rng() * Math.PI * 2);
  for (let i = 0; i < numPlayers; i++) {
    const a = a0 + (i / numPlayers) * Math.PI * 2;
    spawns.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
  }

  // Sea: a sinuous band through the center, plus noise lakes.
  const bandAngle = rng() * Math.PI;
  const bandW = 5 + rng() * 4;
  const dx = Math.cos(bandAngle), dy = Math.sin(bandAngle);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = noise(x / 22, y / 22, 5);              // 0..1
    v = (v - 0.5) * 1.6 + 0.55;
    // distance to band line through center, perturbed
    const px = x - cx, py = y - cy;
    const d = Math.abs(px * -dy + py * dx) + (noise2(x / 15, y / 15, 3) - 0.5) * 10;
    const along = px * dx + py * dy;
    const band = Math.max(0, 1 - d / bandW);
    v -= band * 0.5;
    // map edge falloff slightly upward (land at edges)
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
    const e = Math.min(ex, ey);
    if (e < 3) v += (3 - e) * 0.08;
    // fords: land crossings along the band at intervals
    const fordPhase = ((along + 1000) % 26);
    if (fordPhase < 5 && Math.abs(along) > 6) v += band * 0.55;
    height[i] = v;
    moisture[i] = noise2(x / 9 + 50, y / 9 + 50, 3);
  }
  // Base plateaus: guarantee land around spawns.
  for (const s of spawns) {
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      const tx = s.x + x, ty = s.y + y;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const dd = Math.sqrt(x * x + y * y);
      const k = Math.max(0, 1 - Math.max(0, dd - 7) / 4);
      const i = ty * w + tx;
      height[i] = height[i] * (1 - k) + Math.max(height[i], 0.55) * k;
    }
  }
  // Classify tiles.
  for (let i = 0; i < w * h; i++) {
    const v = height[i];
    let t;
    if (v < 0.30) t = T.WATER;
    else if (v < 0.36) t = T.SHALLOW;
    else if (v < 0.40) t = T.SAND;
    else if (v > 0.86) t = T.ROCK;
    else t = moisture[i] < 0.36 ? T.DIRT : T.GRASS;
    tiles[i] = t;
  }
  // Remove rock near spawns
  for (const s of spawns) for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
    const tx = s.x + x, ty = s.y + y; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    if (tiles[ty * w + tx] === T.ROCK) tiles[ty * w + tx] = T.GRASS;
  }
  const isLand = t => t !== T.WATER && t !== T.SHALLOW && t !== T.ROCK;

  // Connectivity: make sure every spawn reaches spawn 0 by land; carve if not.
  function reachable(a, b) {
    const seen = new Uint8Array(w * h);
    const q = [a.y * w + a.x]; seen[q[0]] = 1;
    const target = b.y * w + b.x;
    while (q.length) {
      const i = q.pop();
      if (i === target) return true;
      const x = i % w, y = (i / w) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [ox, oy] of nb) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || !isLand(tiles[j])) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return false;
  }
  function carve(a, b) {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(a.x + (b.x - a.x) * s / steps), y = Math.round(a.y + (b.y - a.y) * s / steps);
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const i = ty * w + tx;
        if (!isLand(tiles[i])) { tiles[i] = (Math.abs(ox) === 2 || Math.abs(oy) === 2) ? T.SAND : T.DIRT; height[i] = 0.42; }
      }
    }
  }
  for (let i = 1; i < spawns.length; i++) if (!reachable(spawns[0], spawns[i])) carve(spawns[0], spawns[i]);

  // Shore sand: land tiles adjacent to water become sand
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!isLand(tiles[i]) || tiles[i] === T.ROCK) continue;
    let nearWater = false;
    for (let oy = -1; oy <= 1 && !nearWater; oy++) for (let ox = -1; ox <= 1; ox++) { const t = tiles[(y + oy) * w + x + ox]; if (t === T.WATER || t === T.SHALLOW) { nearWater = true; break; } }
    if (nearWater) tiles[i] = T.SAND;
  }

  // Resource placement
  const occupied = new Uint8Array(w * h);
  const mines = [];
  const trees = [];
  function free(tx, ty, ww, hh) {
    for (let y = ty; y < ty + hh; y++) for (let x = tx; x < tx + ww; x++) {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
      const i = y * w + x; if (!isLand(tiles[i]) || occupied[i]) return false;
    }
    return true;
  }
  function occupy(tx, ty, ww, hh) { for (let y = ty; y < ty + hh; y++) for (let x = tx; x < tx + ww; x++) occupied[y * w + x] = 1; }
  // Reserve base area for hall (3x3 at spawn)
  for (const s of spawns) occupy(s.x - 2, s.y - 2, 5, 5);

  function placeMine(nearX, nearY, minD, maxD, amount) {
    for (let tries = 0; tries < 200; tries++) {
      const a = rng() * Math.PI * 2, d = minD + rng() * (maxD - minD);
      const tx = Math.round(nearX + Math.cos(a) * d), ty = Math.round(nearY + Math.sin(a) * d);
      if (free(tx - 1, ty - 1, 4, 4)) { occupy(tx - 1, ty - 1, 4, 4); mines.push({ tx, ty, amount }); return true; }
    }
    return false;
  }
  function placeForest(nearX, nearY, minD, maxD, count) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, d = minD + rng() * (maxD - minD);
      const fx = nearX + Math.cos(a) * d, fy = nearY + Math.sin(a) * d;
      if (fx < 3 || fy < 3 || fx >= w - 3 || fy >= h - 3) continue;
      if (!isLand(tiles[Math.round(fy) * w + Math.round(fx)])) continue;
      let placed = 0;
      for (let k = 0; k < count * 3 && placed < count; k++) {
        const r = Math.sqrt(rng()) * (2.5 + count * 0.12);
        const b = rng() * Math.PI * 2;
        const tx = Math.round(fx + Math.cos(b) * r * 1.3), ty = Math.round(fy + Math.sin(b) * r);
        if (!free(tx, ty, 1, 1)) continue;
        // keep a little distance from spawn center
        let tooClose = false;
        for (const s of spawns) if (Math.hypot(s.x - tx, s.y - ty) < 5) tooClose = true;
        if (tooClose) continue;
        occupy(tx, ty, 1, 1); trees.push({ tx, ty, v: Math.floor(rng() * 4) }); placed++;
      }
      if (placed > count * 0.5) return true;
    }
    return false;
  }
  for (const s of spawns) {
    placeMine(s.x, s.y, 6, 8, 14000);
    placeForest(s.x, s.y, 7, 10, 28);
    placeForest(s.x, s.y, 8, 12, 22);
  }
  // Neutral mines & forests
  const neutralMines = Math.max(2, numPlayers);
  for (let i = 0; i < neutralMines; i++) {
    for (let tries = 0; tries < 100; tries++) {
      const tx = 6 + Math.floor(rng() * (w - 12)), ty = 6 + Math.floor(rng() * (h - 12));
      let ok = true; for (const s of spawns) if (Math.hypot(s.x - tx, s.y - ty) < 18) ok = false;
      for (const m of mines) if (Math.hypot(m.tx - tx, m.ty - ty) < 14) ok = false;
      if (!ok) continue;
      if (free(tx - 1, ty - 1, 4, 4)) { occupy(tx - 1, ty - 1, 4, 4); mines.push({ tx, ty, amount: 9000 }); break; }
    }
  }
  const nForests = 6 + numPlayers * 2;
  for (let i = 0; i < nForests; i++) {
    const tx = 4 + rng() * (w - 8), ty = 4 + rng() * (h - 8);
    let ok = true; for (const s of spawns) if (Math.hypot(s.x - tx, s.y - ty) < 13) ok = false;
    if (ok) placeForest(tx, ty, 0, 2, 14 + Math.floor(rng() * 20));
  }
  // Scattered single trees for flavor
  for (let i = 0; i < w * h * 0.004; i++) {
    const tx = Math.floor(rng() * w), ty = Math.floor(rng() * h);
    if (tiles[ty * w + tx] !== T.GRASS || !free(tx, ty, 1, 1)) continue;
    let ok = true; for (const s of spawns) if (Math.hypot(s.x - tx, s.y - ty) < 9) ok = false;
    if (ok) { occupy(tx, ty, 1, 1); trees.push({ tx, ty, v: Math.floor(rng() * 4) }); }
  }
  // Decoration: rocks/bushes (non-blocking) for the client
  const deco = [];
  for (let i = 0; i < w * h * 0.012; i++) {
    const tx = Math.floor(rng() * w), ty = Math.floor(rng() * h);
    const t = tiles[ty * w + tx];
    if (occupied[ty * w + tx]) continue;
    if (t === T.GRASS || t === T.DIRT) deco.push({ x: tx + rng(), y: ty + rng(), k: rng() < 0.6 ? 0 : 1, v: rng() });
    else if (t === T.SAND) deco.push({ x: tx + rng(), y: ty + rng(), k: 2, v: rng() });
  }

  return { w, h, tiles, height, spawns, mines, trees, deco, seed };
}
