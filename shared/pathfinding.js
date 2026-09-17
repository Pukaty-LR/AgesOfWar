// Grid A* with binary heap, goal predicate, octile heuristic and string-pulling smoothing.

class Heap { // min-heap of (index, key) pairs on typed arrays – no per-node objects, no GC pressure
  constructor(cap = 4096) { this.idx = new Int32Array(cap); this.key = new Float64Array(cap); this.n = 0; }
  get size() { return this.n; }
  push(i, f) {
    if (this.n === this.idx.length) { const ni = new Int32Array(this.n * 2), nk = new Float64Array(this.n * 2); ni.set(this.idx); nk.set(this.key); this.idx = ni; this.key = nk; }
    const idx = this.idx, key = this.key; let c = this.n++;
    while (c > 0) { const par = (c - 1) >> 1; if (key[par] <= f) break; idx[c] = idx[par]; key[c] = key[par]; c = par; }
    idx[c] = i; key[c] = f;
  }
  pop() {
    const idx = this.idx, key = this.key; const top = idx[0]; const n = --this.n; if (n === 0) return top;
    const li = idx[n], lk = key[n]; let c = 0;
    for (;;) { let m = 2 * c + 1; if (m >= n) break; if (m + 1 < n && key[m + 1] < key[m]) m++; if (key[m] >= lk) break; idx[c] = idx[m]; key[c] = key[m]; c = m; }
    idx[c] = li; key[c] = lk; return top;
  }
}

const SQRT2 = Math.SQRT2;

/**
 * @param pass Uint8Array w*h, 1 = passable
 * @param sx,sy start tile
 * @param goalTest (tx,ty)=>bool
 * @param hx,hy heuristic target (tile)
 * @returns array of tile coords [{x,y}] excluding start, or null. If goal unreachable returns path to closest tile.
 */
const SCR = {}; // reusable A* scratch buffers
export function astar(pass, w, h, sx, sy, goalTest, hx, hy, maxNodes = 12000) {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const startI = sy * w + sx;
  if (goalTest(sx, sy)) return [];
  // scratch arrays are reused between calls; a generation stamp replaces per-call fills
  if (!SCR.g || SCR.g.length < w * h) { SCR.g = new Float32Array(w * h); SCR.parent = new Int32Array(w * h); SCR.closed = new Uint8Array(w * h); SCR.stamp = new Uint32Array(w * h); SCR.gen = 0; }
  const gen = ++SCR.gen; if (gen === 0xffffffff) { SCR.stamp.fill(0); SCR.gen = 1; }
  const g = SCR.g, parent = SCR.parent, closed = SCR.closed, stamp = SCR.stamp;
  const touch = i => { if (stamp[i] !== gen) { stamp[i] = gen; g[i] = Infinity; parent[i] = -1; closed[i] = 0; } };
  const heap = SCR.heap || (SCR.heap = new Heap(8192)); heap.n = 0;
  const heur = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy); };
  touch(startI); g[startI] = 0;
  heap.push(startI, heur(sx, sy));
  let best = startI, bestH = heur(sx, sy);
  let expanded = 0;
  let found = -1;
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (goalTest(x, y)) { found = i; break; }
    const hh = heur(x, y);
    if (hh < bestH) { bestH = hh; best = i; }
    if (++expanded > maxNodes) break;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!pass[j]) continue; touch(j); if (closed[j]) continue;
      if (ox && oy) { if (!pass[y * w + nx] || !pass[ny * w + x]) continue; }
      const ng = g[i] + (ox && oy ? SQRT2 : 1);
      if (ng < g[j]) { g[j] = ng; parent[j] = i; heap.push(j, ng + heur(nx, ny)); }
    }
  }
  const end = found >= 0 ? found : best;
  if (end === startI) return found >= 0 ? [] : null;
  const path = [];
  for (let i = end; i !== startI && i >= 0; i = parent[i]) path.push({ x: i % w, y: (i / w) | 0 });
  path.reverse();
  return path;
}

// Line of sight over passable grid (supercover-ish Bresenham).
export function losClear(pass, w, h, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  for (;;) {
    if (x < 0 || y < 0 || x >= w || y >= h || !pass[y * w + x]) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    const stepX = e2 > -dy, stepY = e2 < dx;
    if (stepX && stepY) { if (!pass[y * w + x + sx] || !pass[(y + sy) * w + x]) return false; } // diagonal step: both orthogonal cells must be free (same rule as A*)
    if (stepX) { err -= dy; x += sx; if (!pass[y * w + x]) return false; }
    if (stepY) { err += dx; y += sy; if (!pass[y * w + x]) return false; }
  }
}

export function smoothPath(pass, w, h, sx, sy, path) {
  if (!path || path.length < 2) return path;
  const out = [];
  let cx = sx, cy = sy, i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !losClear(pass, w, h, cx, cy, path[j].x, path[j].y)) j--;
    out.push(path[j]); cx = path[j].x; cy = path[j].y; i = j + 1;
  }
  return out;
}

// Breadth-first search for nearest tile satisfying pred from (sx,sy).
export function nearestTile(w, h, sx, sy, pred, maxR = 20) {
  for (let r = 0; r <= maxR; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = sx + ox, y = sy + oy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (pred(x, y)) return { x, y };
    }
  }
  return null;
}
