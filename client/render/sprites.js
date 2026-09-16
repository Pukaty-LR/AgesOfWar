// Procedural isometric sprites: units, buildings, resources. Everything drawn with canvas primitives and cached.
import { TEAM_COLORS } from '../../shared/data.js';
import { humanoid3D } from './model3d.js';
import { GFX, GFX_STYLES, isPixel } from './style.js';
import { pixelize } from './pixelize.js';
/** switch the graphics style ('pixel' | 'model' | 'flat') – drops every baked sprite so it is rebuilt in the new look */
export function setGfxStyle(style) { if (!GFX_STYLES.includes(style)) style = 'pixel'; if (GFX.style === style) return; GFX.style = style; clearSpriteCache(); }
export function gfxStyle() { return GFX.style; }

export const TW = 64, TH = 32;   // tile diamond size at zoom 1
export const S = 2;              // internal render scale (supersampling)

export function iso(x, y, z = 0) { return [(x - y) * (TW / 2), (x + y) * (TH / 2) - z]; }
export function screenAngle(a) { const dx = Math.cos(a) - Math.sin(a), dy = (Math.cos(a) + Math.sin(a)) * 0.5; return Math.atan2(dy, dx); }
export function facingToDir(a) { const sa = screenAngle(a); return ((Math.round(sa / (Math.PI / 4)) % 8) + 8) % 8; }
const DIR_ANGLE = d => d * Math.PI / 4;

// ---------- color helpers ----------
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgb(c, a = 1) { return a === 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
export function shade(c, k) { return c.map(v => Math.max(0, Math.min(255, v * k))); }
export function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
export function teamRgb(idx) { return hexToRgb(TEAM_COLORS[idx % TEAM_COLORS.length].hex); }

const cache = new Map();
const CACHE_MAX = 5000;
export function clearSpriteCache() { for (const c of cache.values()) c.canvas.width = 0; cache.clear(); }
export function cached(key, w, h, ax, ay, draw) {
  let c = cache.get(key);
  if (c) return c;
  if (cache.size >= CACHE_MAX) { let n = 0; for (const [k, v] of cache) { v.canvas.width = 0; cache.delete(k); if (++n >= CACHE_MAX / 5) break; } } // drop the oldest fifth
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * S); canvas.height = Math.ceil(h * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S); ctx.translate(ax, ay);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  draw(ctx);
  if (isPixel()) pixelize(canvas, S, { colors: w * h > 12000 ? 40 : 28 });
  c = { canvas, ax, ay, w, h };
  cache.set(key, c);
  return c;
}
export function blit(ctx, spr, x, y, zoom) { if (isPixel()) { const zz = Math.max(0.5, Math.round(zoom * 2) / 2); ctx.drawImage(spr.canvas, Math.round(x - spr.ax * zz), Math.round(y - spr.ay * zz), spr.w * zz, spr.h * zz); } else ctx.drawImage(spr.canvas, x - spr.ax * zoom, y - spr.ay * zoom, spr.w * zoom, spr.h * zoom); }

// ---------- primitive helpers (all in zoom-1 pixels) ----------
function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill, stroke, lw = 1) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function line(ctx, x0, y0, x1, y1, color, lw = 1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); }
function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }

/** Extruded prism from world-space polygon (tile units relative to anchor), z0 base height, height h (px). */
export function prism(ctx, pts, z0, h, top, side, outline = 'rgba(0,0,0,0.55)', lightDir = 1) {
  const base = pts.map(p => iso(p[0], p[1], z0));
  const topP = pts.map(p => iso(p[0], p[1], z0 + h));
  const cx = base.reduce((s, p) => s + p[1], 0) / base.length;
  // side faces: draw those facing viewer (edge midpoint y > center y)
  const n = pts.length;
  const faces = [];
  for (let i = 0; i < n; i++) {
    const a = base[i], b = base[(i + 1) % n];
    const my = (a[1] + b[1]) / 2;
    if (my > cx - 0.01) {
      // light: left-facing faces brighter
      const dx = b[0] - a[0];
      const k = dx > 0 ? 0.78 : 0.6;
      faces.push({ pts: [a, b, topP[(i + 1) % n], topP[i]], k, my });
    }
  }
  faces.sort((p, q) => p.my - q.my);
  for (const f of faces) poly(ctx, f.pts, rgb(shade(side, f.k)), outline, 0.8);
  poly(ctx, topP, rgb(top), outline, 0.8);
}
function isoRect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function rot(pts, a, cx = 0, cy = 0) { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); }

// ---------- unit drawing ----------
const SKIN = [232, 190, 150], SKIN_D = [190, 140, 100], METAL = [200, 205, 215], METAL_D = [120, 125, 135], WOOD = [130, 88, 46], WOOD_D = [86, 56, 28], OUT = 'rgba(15,10,5,0.8)';

function walkPhase(anim, frame) { return anim === 'walk' ? (frame / 6) * Math.PI * 2 : 0; }

/** Small humanoid, feet at (0,0). dir: screen dir 0..7 – jointed low-poly model baked into the sprite cache (see model3d.js). */
function humanoid(ctx, o) { if (GFX.style === 'flat') humanoidFlat(ctx, o); else humanoid3D(ctx, o); }
/** previous flat paper-doll drawing, kept for reference / fallback */
function humanoidFlat(ctx, o) {
  const { dir, anim, frame, team } = o;
  const sa = DIR_ANGLE(dir);
  const fx = Math.cos(sa), fy = Math.sin(sa);       // facing vector on screen
  const front = fy > 0.1, side = Math.abs(fx) > 0.7;
  const ph = walkPhase(anim, frame);
  const bob = anim === 'walk' ? Math.abs(Math.sin(ph)) * 1.2 : (anim === 'idle' ? [0, 0.5, 0.9, 0.5][frame % 4] : 0);
  const legA = anim === 'walk' ? Math.sin(ph) * 3.5 : 0;
  const swing = anim === 'attack' ? [0, -0.9, 0.7, 0.3][frame % 4] : (anim === 'work' ? [-0.6, 0.2, 0.8, 0.1][frame % 4] : (anim === 'idle' ? [0, 0.06, 0.1, 0.06][frame % 4] : 0));
  const tc = team, tcD = shade(team, 0.6), tcL = shade(team, 1.25);
  const scale = (o.scale || 1) * 1.12;
  ctx.save(); ctx.scale(scale, scale);
  // shadow
  ellipse(ctx, 0, 0, 7, 3.5, 'rgba(0,0,0,0.35)');
  // cape (heroes / elite) drawn behind the body
  if (o.cape) { const cx = -fx * 4, cy = -10 - (anim === 'walk' ? Math.abs(Math.sin(walkPhase(anim, frame))) * 1.2 : 0); const sway = anim === 'walk' ? Math.sin(walkPhase(anim, frame)) * 2 : 0; poly(ctx, [[cx - 4, cy - 12], [cx + 4, cy - 12], [cx + 6 + sway - fx * 4, cy + 2], [cx - 6 + sway - fx * 4, cy + 3]], rgb(shade(tc, 0.85)), OUT, 0.8); poly(ctx, [[cx - 3, cy - 11], [cx + 1, cy - 11], [cx + 1 + sway - fx * 3, cy], [cx - 4 + sway - fx * 3, cy + 1]], rgb(shade(tc, 1.15), 0.7)); }
  // legs
  const legC = rgb(o.legs || [70, 55, 40]);
  const lx = -fy * 2.2, ly = fx * 1.1; // perpendicular offset for two legs
  rrect(ctx, lx - 1.6 + fx * legA * 0.3, -9 + Math.abs(legA) * 0 - 0, 3.2, 9 - bob * 0.3 + legA * 0.4, 1.2, legC, OUT, 0.6);
  rrect(ctx, -lx - 1.6 - fx * legA * 0.3, -9, 3.2, 9 - bob * 0.3 - legA * 0.4, 1.2, legC, OUT, 0.6);
  const y0 = -9 - bob;
  // back-hand item (shield) if drawn behind
  const drawShield = o.shield && !front;
  if (drawShield) shield(ctx, -fx * 5, y0 - 8 + 2, tc, o.shield, dir);
  // weapon behind body if facing away
  const weaponBehind = fy < -0.1;
  if (weaponBehind && o.weapon) weapon(ctx, o, fx, fy, y0, swing, tc);
  // torso
  const torso = o.torso || tc;
  rrect(ctx, -5, y0 - 12, 10, 13, 3, rgb(torso), OUT, 0.8);
  // torso highlight & belt
  rrect(ctx, -4, y0 - 11, 4, 10, 2, rgb(shade(torso, 1.18), 0.9));
  line(ctx, -5, y0 - 3, 5, y0 - 3, rgb(o.belt || [60, 40, 25]), 1.6);
  if (o.emblem) { ctx.fillStyle = rgb(o.emblem); ctx.fillRect(-1.5, y0 - 10, 3, 3); }
  // arms
  const armC = rgb(o.sleeves || SKIN);
  rrect(ctx, -7.5, y0 - 11, 3, 8, 1.4, armC, OUT, 0.6);
  rrect(ctx, 4.5, y0 - 11, 3, 8, 1.4, armC, OUT, 0.6);
  // head
  const hy = y0 - 16;
  ellipse(ctx, 0, hy, 4.2, 4.5, rgb(SKIN), OUT, 0.8);
  if (front) { ctx.fillStyle = '#2a1a10'; ctx.fillRect(-2 + fx * 0.8, hy - 0.5, 1.2, 1.4); ctx.fillRect(0.8 + fx * 0.8, hy - 0.5, 1.2, 1.4); }
  // helmet / hat
  helmet(ctx, o.helmet, hy, tc, fx, fy);
  // front items
  if (!weaponBehind && o.weapon) weapon(ctx, o, fx, fy, y0, swing, tc);
  if (o.shield && front) shield(ctx, -fx * 4 + fy * 3, y0 - 6, tc, o.shield, dir);
  // carried resource
  if (o.carry === 'p') { ellipse(ctx, -fx * 3, y0 - 7, 4, 3.5, '#e8c04a', OUT, 0.7); ellipse(ctx, -fx * 3 - 1, y0 - 8, 1.2, 1, '#fff2b0'); }
  else if (o.carry === 's') { ctx.save(); ctx.translate(0, y0 - 9); ctx.rotate(-0.3); rrect(ctx, -7, -2, 14, 4, 1, rgb(WOOD), OUT, 0.7); rrect(ctx, -6, -4.5, 12, 3.5, 1, rgb(shade(WOOD, 1.15)), OUT, 0.7); ctx.restore(); }
  ctx.restore();
}
function helmet(ctx, type, hy, tc, fx, fy) {
  switch (type) {
    case 'roman': ellipse(ctx, 0, hy - 1.2, 4.6, 4, rgb(METAL), OUT, 0.8); ctx.fillStyle = rgb(shade(METAL, 0.75)); ctx.fillRect(-4.6, hy - 0.5, 9.2, 1.6); // crest
      poly(ctx, [[-1, hy - 5], [1, hy - 5], [1.5, hy - 9], [-1.5, hy - 9]], rgb(tc), OUT, 0.6); ellipse(ctx, 0, hy - 8.5, 2.2, 1.6, rgb(tc), OUT, 0.5); break;
    case 'greek': ellipse(ctx, 0, hy - 1.2, 4.6, 4, rgb([210, 180, 90]), OUT, 0.8); poly(ctx, [[-1.2, hy - 5], [1.2, hy - 5], [0.8, hy - 10], [-0.8, hy - 10]], rgb(tc), OUT, 0.6); break;
    case 'cap': ellipse(ctx, 0, hy - 1.5, 4.5, 3.5, rgb(shade(tc, 0.8)), OUT, 0.8); break;
    case 'band': ctx.strokeStyle = rgb(tc); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, hy - 1, 4.4, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.arc(0, hy - 1.5, 4.2, Math.PI, Math.PI * 2); ctx.fill(); break;
    case 'hair': ctx.fillStyle = '#5a3416'; ctx.beginPath(); ctx.arc(0, hy - 1.3, 4.3, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); break;
    case 'stahlhelm': ellipse(ctx, 0, hy - 1.5, 5.2, 4, rgb([88, 96, 80]), OUT, 0.8); ellipse(ctx, 0, hy + 0.5, 5.4, 1.6, rgb([70, 76, 62]), OUT, 0.6); ctx.fillStyle = rgb(tc); ctx.fillRect(-4.5, hy - 1.5, 9, 1.4); break;
    case 'garrison': ellipse(ctx, 0, hy - 1.5, 4.6, 3.6, rgb([96, 92, 70]), OUT, 0.8); ctx.fillStyle = rgb(tc); ctx.fillRect(-4.2, hy - 1.2, 8.4, 1.3); break;
    case 'hardhat': ellipse(ctx, 0, hy - 1.5, 4.8, 3.8, rgb([220, 180, 50]), OUT, 0.8); ellipse(ctx, 0, hy + 0.3, 5.2, 1.4, rgb([190, 150, 40]), OUT, 0.6); break;
    case 'visor': ellipse(ctx, 0, hy - 0.8, 5, 4.8, rgb([200, 205, 215]), OUT, 0.8); ctx.fillStyle = 'rgba(80,220,255,0.95)'; ctx.beginPath(); ctx.ellipse(fx * 1.2, hy + 0.2, 3.6, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = rgb(tc); ctx.fillRect(-1, hy - 6, 2, 3); break;
    case 'android': ellipse(ctx, 0, hy - 0.8, 4.6, 4.6, rgb([120, 128, 140]), OUT, 0.8); ctx.fillStyle = 'rgba(255,80,80,0.95)'; ctx.fillRect(fx * 1.5 - 1.2, hy - 0.5, 2.4, 1.4); ctx.fillStyle = rgb(tc); ctx.fillRect(-2.5, hy - 5, 5, 1.5); break;
    default: break;
  }
}
function shield(ctx, x, y, tc, type, dir) {
  if (type === 'scutum') { rrect(ctx, x - 4, y - 7, 8, 14, 2.5, rgb(tc), OUT, 0.9); ellipse(ctx, x, y, 1.8, 1.8, rgb(METAL), OUT, 0.5); line(ctx, x, y - 6, x, y + 6, rgb(shade(tc, 1.4)), 0.8); }
  else if (type === 'round') { ellipse(ctx, x, y, 6, 6, rgb(tc), OUT, 0.9); ellipse(ctx, x, y, 2, 2, rgb(METAL), OUT, 0.5); ellipse(ctx, x, y, 4.5, 4.5, null, rgb(shade(tc, 1.4)), 0.8); }
  else if (type === 'oval') { ellipse(ctx, x, y, 4.5, 7, rgb(tc), OUT, 0.9); line(ctx, x, y - 6, x, y + 6, rgb(shade(tc, 1.4)), 1); }
  else if (type === 'energy') { ellipse(ctx, x, y, 5.5, 8, 'rgba(90,225,255,0.35)', 'rgba(140,240,255,0.9)', 1.2); ellipse(ctx, x, y, 3, 5, 'rgba(160,240,255,0.25)'); }
}
function weapon(ctx, o, fx, fy, y0, swing, tc) {
  const hx = fx * 6, hy = y0 - 8 + fy * 2; // hand position
  ctx.save(); ctx.translate(hx, hy);
  const ang = Math.atan2(fy, fx);
  switch (o.weapon) {
    case 'sword': ctx.rotate(ang * 0.4 + swing * 1.4 - 0.9); line(ctx, 0, 0, 0, -11, rgb(METAL), 2); line(ctx, 0, 0, 0, -11, rgb(shade(METAL, 1.3)), 0.8); line(ctx, -2.5, -1, 2.5, -1, rgb(WOOD_D), 1.6); line(ctx, 0, 0, 0, 3, rgb(WOOD), 2); break;
    case 'spear': ctx.rotate(ang * 0.5 + swing * 0.8 - 0.4); line(ctx, 0, 8, 0, -16, rgb(WOOD), 1.6); poly(ctx, [[-1.6, -16], [1.6, -16], [0, -21]], rgb(METAL), OUT, 0.5); break;
    case 'axe': ctx.rotate(swing * 1.6 - 0.6 + ang * 0.3); line(ctx, 0, 4, 0, -12, rgb(WOOD), 1.8); poly(ctx, [[0, -12], [5, -14], [5, -8], [0, -9]], rgb(METAL), OUT, 0.6); break;
    case 'pick': ctx.rotate(swing * 1.6 - 0.6 + ang * 0.3); line(ctx, 0, 4, 0, -12, rgb(WOOD), 1.8); ctx.beginPath(); ctx.moveTo(-5, -10); ctx.quadraticCurveTo(0, -15, 5, -10); ctx.strokeStyle = rgb(METAL_D); ctx.lineWidth = 2; ctx.stroke(); break;
    case 'bow': { ctx.rotate(ang); const pull = o.anim === 'attack' ? [0, 3, 1, 0][o.frame % 4] : 0; ctx.beginPath(); ctx.arc(-pull, 0, 8, -Math.PI * 0.45, Math.PI * 0.45); ctx.strokeStyle = rgb(WOOD); ctx.lineWidth = 1.6; ctx.stroke(); line(ctx, 5 - pull, -7.5, 1 - pull * 2, 0, '#ddd', 0.6); line(ctx, 5 - pull, 7.5, 1 - pull * 2, 0, '#ddd', 0.6); if (pull) line(ctx, 1 - pull * 2, 0, 9, 0, rgb(WOOD_D), 1); break; }
    case 'sling': ctx.rotate(ang + swing * 2); line(ctx, 0, 0, 0, -9, '#c9b28a', 0.9); ellipse(ctx, 0, -9, 1.6, 1.6, '#777', OUT, 0.4); break;
    case 'rifle': ctx.rotate(ang); line(ctx, -6, 0, 12, 0, rgb(WOOD_D), 2.4); line(ctx, 2, -0.3, 14, -0.3, rgb(METAL_D), 1.4); if (o.anim === 'attack' && o.frame % 4 === 1) { ellipse(ctx, 15.5, -0.3, 2.5, 1.8, 'rgba(255,220,120,0.9)'); } break;
    case 'mg': ctx.rotate(ang); line(ctx, -7, 0, 15, 0, rgb(METAL_D), 3); line(ctx, 4, 0, 16, 0, rgb([60, 60, 60]), 1.6); line(ctx, 8, 0, 6, 5, rgb(METAL_D), 1); line(ctx, 8, 0, 10, 5, rgb(METAL_D), 1); rrect(ctx, -2, -3, 5, 3, 0.5, rgb([70, 60, 40]), OUT, 0.5); if (o.anim === 'attack' && o.frame % 2 === 1) ellipse(ctx, 17, 0, 2.5, 1.8, 'rgba(255,220,120,0.9)'); break;
    case 'plasmaRifle': ctx.rotate(ang); rrect(ctx, -6, -1.5, 16, 3, 1.2, rgb([90, 96, 110]), OUT, 0.6); ctx.fillStyle = rgb(tc); ctx.fillRect(-2, -1, 5, 2); ctx.fillStyle = 'rgba(80,220,255,0.95)'; ctx.fillRect(6, -0.8, 4, 1.6); if (o.anim === 'attack' && o.frame % 4 === 1) { ellipse(ctx, 12, 0, 3.5, 2.2, 'rgba(120,230,255,0.9)'); } break;
    case 'rail': ctx.rotate(ang); line(ctx, -8, 0, 16, 0, rgb([70, 74, 86]), 2.8); line(ctx, 2, 0, 16, 0, 'rgba(120,200,255,0.9)', 1); rrect(ctx, -4, -3, 6, 4, 1, rgb([110, 116, 130]), OUT, 0.5); for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(80,220,255,0.9)'; ctx.fillRect(4 + i * 3.5, -2.2, 1.2, 4.4); } if (o.anim === 'attack' && o.frame % 4 === 1) line(ctx, 16, 0, 40, 0, 'rgba(160,240,255,0.8)', 1.6); break;
    case 'rocket': ctx.rotate(ang); rrect(ctx, -8, -3, 18, 6, 2, rgb([80, 86, 100]), OUT, 0.6); ctx.fillStyle = rgb(tc); ctx.fillRect(-4, -2, 6, 4); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(14, 0); ctx.lineTo(10, 3); ctx.fill(); break;
    case 'flamer': ctx.rotate(ang); rrect(ctx, -9, -4, 6, 9, 2, rgb([80, 80, 76]), OUT, 0.6); line(ctx, -4, 0, 10, 0, rgb(METAL_D), 2.4); if (o.anim === 'attack') { const k = o.frame % 4; ellipse(ctx, 14 + k * 3, 0, 5 + k * 2, 3 + k, `rgba(255,${150 + k * 20},40,0.85)`); ellipse(ctx, 12 + k * 2, 0, 3, 2, 'rgba(255,240,180,0.9)'); } break;
    case 'wrench': ctx.rotate(swing * 1.4 - 0.4 + ang * 0.3); line(ctx, 0, 2, 0, -9, rgb(METAL_D), 2); ellipse(ctx, 0, -9.5, 2.5, 2, rgb(METAL), OUT, 0.5); break;
    case 'shovel': ctx.rotate(swing * 1.5 - 0.5 + ang * 0.3); line(ctx, 0, 4, 0, -10, rgb(WOOD), 1.6); poly(ctx, [[-2.5, -10], [2.5, -10], [2, -15], [-2, -15]], rgb(METAL_D), OUT, 0.5); break;
  }
  ctx.restore();
}

// ---------- vehicles / mounts ----------
function horse(ctx, o, riderFn) {
  const { dir, anim, frame, team } = o;
  const sa = DIR_ANGLE(dir); const fx = Math.cos(sa), fy = Math.sin(sa);
  const ph = walkPhase(anim, frame);
  const gallop = anim === 'walk' ? Math.sin(ph) : 0;
  ellipse(ctx, 0, 0, 12, 5, 'rgba(0,0,0,0.35)');
  const body = o.horseColor || [110, 75, 45];
  // legs
  for (let i = 0; i < 4; i++) { const t = (i < 2 ? 1 : -1); const s = (i % 2 ? 1 : -1); const lx = fx * 6 * t - fy * 3 * s, lx2 = lx + (anim === 'walk' ? gallop * 3 * t * s : 0); rrect(ctx, lx2 - 1.3, -10, 2.6, 10 + (i % 2 ? 0 : 1), 1, rgb(shade(body, 0.8)), OUT, 0.5); }
  // body (ellipse along facing)
  ctx.save(); ctx.translate(0, -12 + Math.abs(gallop)); ctx.rotate(Math.atan2(fy * 0.6, fx));
  ellipse(ctx, 0, 0, 13, 6, rgb(body), OUT, 0.9);
  ellipse(ctx, -2, -2, 8, 3, rgb(shade(body, 1.15), 0.6));
  // saddle cloth
  rrect(ctx, -5, -4, 9, 8, 2, rgb(team), OUT, 0.6);
  ctx.restore();
  // neck & head
  const nx = fx * 12, ny = -14 + fy * 2;
  line(ctx, fx * 9, -13, nx, ny - 9, rgb(body), 4.5);
  ellipse(ctx, nx + fx * 3, ny - 10, 4, 2.6, rgb(shade(body, 0.95)), OUT, 0.8);
  ctx.fillStyle = rgb(shade(body, 0.6)); ctx.fillRect(nx - 1.5, ny - 13.5, 1.6, 3); ctx.fillRect(nx + 1.5, ny - 13.5, 1.6, 3);
  // tail
  line(ctx, -fx * 12, -13, -fx * 16, -6, rgb(shade(body, 0.7)), 2);
  // rider
  ctx.save(); ctx.translate(0, -14); ctx.scale(0.85, 0.85); riderFn(ctx); ctx.restore();
}

function tank(ctx, o) {
  const { dir, team, anim, frame } = o;
  const a = worldAngleForDir(dir);
  const hullC = mix([90, 96, 80], team, 0.45), hullD = shade(hullC, 0.7);
  ellipse(ctx, 0, 0, 22, 11, 'rgba(0,0,0,0.35)');
  const hull = rot(isoRect(-0.5, -0.32, 1.0, 0.64), a);
  const trackL = rot(isoRect(-0.55, -0.4, 1.1, 0.14), a), trackR = rot(isoRect(-0.55, 0.26, 1.1, 0.14), a);
  prism(ctx, trackL, 0, 5, [50, 50, 48], [35, 35, 33]); prism(ctx, trackR, 0, 5, [50, 50, 48], [35, 35, 33]);
  // track links that scroll while moving
  const phase = anim === 'walk' ? (frame % 6) / 6 : 0;
  ctx.fillStyle = 'rgba(120,120,115,0.9)';
  for (const s of [-0.33, 0.33]) for (let k = 0; k < 6; k++) { const t = -0.5 + ((k + phase) % 6) / 6 * 1.0; const [px, py] = iso(Math.cos(a) * t - Math.sin(a) * s, Math.sin(a) * t + Math.cos(a) * s, 5.5); ctx.fillRect(px - 1.2, py - 0.8, 2.4, 1.6); }
  prism(ctx, hull, 3, 9, hullC, hullD);
  // side skirts, fuel drums, commander hatch
  for (const s of [-1, 1]) { const sk = rot(isoRect(-0.45, 0.3 * s - 0.03, 0.9, 0.06), a); prism(ctx, sk, 7, 3, shade(hullC, 0.85), hullD); }
  const [dx, dy] = iso(-Math.cos(a) * 0.4, -Math.sin(a) * 0.4, 12); rrect(ctx, dx - 3, dy - 6, 6, 6, 1.5, rgb(shade(hullC, 0.75)), OUT, 0.5);
  const tur = rot(isoRect(-0.22, -0.2, 0.44, 0.4), a);
  prism(ctx, tur, 12, 7, shade(hullC, 1.1), hullD);
  const [hx, hy] = iso(-Math.cos(a) * 0.08 - Math.sin(a) * 0.08, -Math.sin(a) * 0.08 + Math.cos(a) * 0.08, 19); ellipse(ctx, hx, hy, 3, 1.6, rgb(shade(hullC, 1.25)), OUT, 0.5);
  // barrel
  const recoil = anim === 'attack' && frame % 4 === 1 ? 0.08 : 0;
  const [bx0, by0] = iso(Math.cos(a) * (0.1 - recoil), Math.sin(a) * (0.1 - recoil), 16), [bx1, by1] = iso(Math.cos(a) * (0.75 - recoil), Math.sin(a) * (0.75 - recoil), 16);
  line(ctx, bx0, by0, bx1, by1, OUT, 4); line(ctx, bx0, by0, bx1, by1, rgb([70, 74, 66]), 2.4);
  if (anim === 'attack' && frame % 4 === 1) { ellipse(ctx, bx1, by1, 6, 4, 'rgba(255,210,110,0.9)'); ellipse(ctx, bx1, by1, 3, 2, '#fff'); }
  // team stripe
  const [sx, sy] = iso(0, 0, 21); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 3, sy - 1.5, 6, 3);
}
function artillery(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ellipse(ctx, 0, 0, 16, 8, 'rgba(0,0,0,0.35)');
  const metal = mix([80, 86, 72], team, 0.3);
  // wheels
  for (const s of [-1, 1]) { const [wx, wy] = iso(-Math.sin(a) * 0.32 * s, Math.cos(a) * 0.32 * s, 0); ellipse(ctx, wx, wy - 6, 5, 5.5, rgb([60, 58, 52]), OUT, 0.8); ellipse(ctx, wx, wy - 6, 2, 2.2, rgb([120, 118, 110]), OUT, 0.5); }
  // axle & trail
  const [tx0, ty0] = iso(-Math.cos(a) * 0.1, -Math.sin(a) * 0.1, 6), [tx1, ty1] = iso(-Math.cos(a) * 0.7, -Math.sin(a) * 0.7, 2);
  line(ctx, tx0, ty0, tx1, ty1, rgb(shade(metal, 0.8)), 3);
  const [ax0, ay0] = iso(-Math.sin(a) * 0.32, Math.cos(a) * 0.32, 6), [ax1, ay1] = iso(Math.sin(a) * 0.32, -Math.cos(a) * 0.32, 6); line(ctx, ax0, ay0, ax1, ay1, rgb(shade(metal, 0.7)), 2.5);
  // shield plate
  const sh = rot(isoRect(0.02, -0.28, 0.06, 0.56), a); prism(ctx, sh, 4, 10, metal, shade(metal, 0.75));
  // barrel (elevated)
  const recoil = anim === 'attack' && frame % 4 === 1 ? 0.12 : 0;
  const [bx0, by0] = iso(-Math.cos(a) * (0.15 + recoil), -Math.sin(a) * (0.15 + recoil), 9), [bx1, by1] = iso(Math.cos(a) * (0.8 - recoil), Math.sin(a) * (0.8 - recoil), 22);
  line(ctx, bx0, by0, bx1, by1, OUT, 4.5); line(ctx, bx0, by0, bx1, by1, rgb([90, 92, 84]), 3);
  if (anim === 'attack' && frame % 4 === 1) { ellipse(ctx, bx1, by1, 7, 5, 'rgba(255,200,100,0.9)'); }
}
function catapult(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ellipse(ctx, 0, 0, 17, 8.5, 'rgba(0,0,0,0.35)');
  for (const s of [-1, 1]) for (const f of [-1, 1]) { const [wx, wy] = iso(Math.cos(a) * 0.3 * f - Math.sin(a) * 0.36 * s, Math.sin(a) * 0.3 * f + Math.cos(a) * 0.36 * s, 0); ellipse(ctx, wx, wy - 4, 4, 4.5, rgb(WOOD_D), OUT, 0.8); ellipse(ctx, wx, wy - 4, 1.5, 1.7, rgb(WOOD), OUT, 0.4); }
  const frame1 = rot(isoRect(-0.45, -0.3, 0.9, 0.08), a), frame2 = rot(isoRect(-0.45, 0.22, 0.9, 0.08), a);
  prism(ctx, frame1, 4, 6, WOOD, WOOD_D); prism(ctx, frame2, 4, 6, WOOD, WOOD_D);
  const cross = rot(isoRect(0.1, -0.34, 0.1, 0.68), a); prism(ctx, cross, 4, 14, WOOD, WOOD_D);
  // arm: rests back, swings forward on attack
  const t = anim === 'attack' ? [0.0, 1.0, 0.7, 0.2][frame % 4] : 0;
  const armAng = -0.35 + t * 1.5; // elevation angle
  const len = 0.7;
  const bx = Math.cos(a) * (0.1 - Math.cos(armAng) * len), by = Math.sin(a) * (0.1 - Math.cos(armAng) * len), bz = 10 + Math.sin(armAng) * 40 + 10;
  const [p0x, p0y] = iso(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 10), [p1x, p1y] = iso(bx, by, bz);
  line(ctx, p0x, p0y, p1x, p1y, OUT, 4); line(ctx, p0x, p0y, p1x, p1y, rgb(WOOD), 2.6);
  ellipse(ctx, p1x, p1y, 3.5, 3.5, rgb([110, 105, 95]), OUT, 0.7); // bucket / rock
  if (t < 0.5) ellipse(ctx, p1x, p1y - 1, 2.5, 2.5, rgb([130, 125, 115]), OUT, 0.5);
  const [fx, fy] = iso(0, 0, 22); ctx.fillStyle = rgb(team); ctx.fillRect(fx - 2, fy - 8, 4, 6);
}
function shipAntiquity(ctx, o) {
  const { dir, team, frame } = o; const a = worldAngleForDir(dir);
  const bobz = Math.sin(frame / 6 * Math.PI * 2) * 1.2;
  ellipse(ctx, 0, 0, 28, 13, 'rgba(0,0,0,0.25)');
  const hullPts = rot([[-0.75, -0.22], [0.5, -0.24], [0.9, 0], [0.5, 0.24], [-0.75, 0.22], [-0.95, 0]], a);
  prism(ctx, hullPts, 2 + bobz, 9, [150, 105, 60], [110, 70, 35]);
  // deck stripe & oars (they row while moving)
  const stroke = Math.sin(frame / 6 * Math.PI * 2) * 0.12;
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { const [ox, oy] = iso(Math.cos(a) * i * 0.25 - Math.sin(a) * 0.24 * s, Math.sin(a) * i * 0.25 + Math.cos(a) * 0.24 * s, 8 + bobz); const [ex, ey] = iso(Math.cos(a) * (i * 0.25 + stroke) - Math.sin(a) * 0.5 * s, Math.sin(a) * (i * 0.25 + stroke) + Math.cos(a) * 0.5 * s, 1 + bobz + Math.abs(stroke) * 20); line(ctx, ox, oy, ex, ey, rgb(WOOD), 1.4); if (Math.abs(stroke) < 0.04) ellipse(ctx, ex, ey + 1, 3, 1.2, 'rgba(255,255,255,0.35)'); }
  // mast & sail
  const [mx, my] = iso(-0.05, 0, 11 + bobz);
  line(ctx, mx, my, mx, my - 34, rgb(WOOD_D), 2.5);
  const sw = 20;
  const sailPts = [[mx - sw / 2, my - 32], [mx + sw / 2, my - 32], [mx + sw / 2 + 2, my - 12], [mx - sw / 2 - 2, my - 10]];
  poly(ctx, sailPts, '#efe4c8', OUT, 0.8);
  ctx.fillStyle = rgb(team); ctx.fillRect(mx - sw / 2 + 2, my - 24, sw - 4, 5);
  // ram
  const [rx, ry] = iso(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 4 + bobz); ellipse(ctx, rx, ry, 3, 2, rgb(METAL_D), OUT, 0.5);
}
function destroyer(ctx, o) {
  const { dir, team, frame, anim } = o; const a = worldAngleForDir(dir);
  const bobz = Math.sin(frame / 6 * Math.PI * 2) * 0.8;
  ellipse(ctx, 0, 0, 32, 14, 'rgba(0,0,0,0.25)');
  const grey = [128, 136, 142];
  const hullPts = rot([[-0.95, -0.2], [0.6, -0.2], [1.05, 0], [0.6, 0.2], [-0.95, 0.2], [-1.05, 0.08], [-1.05, -0.08]], a);
  prism(ctx, hullPts, 1 + bobz, 8, grey, shade(grey, 0.65));
  const sup = rot(isoRect(-0.35, -0.12, 0.5, 0.24), a); prism(ctx, sup, 9 + bobz, 9, shade(grey, 1.1), shade(grey, 0.7));
  const bridge = rot(isoRect(-0.1, -0.08, 0.2, 0.16), a); prism(ctx, bridge, 18 + bobz, 7, shade(grey, 1.15), shade(grey, 0.72));
  // stack
  const [sx, sy] = iso(-0.45, 0, 18 + bobz); rrect(ctx, sx - 2.5, sy - 10, 5, 10, 1, rgb([70, 72, 74]), OUT, 0.7);
  // turrets
  for (const px of [0.55, -0.7]) { const tur = rot(isoRect(px - 0.09, -0.09, 0.18, 0.18), a); prism(ctx, tur, 9 + bobz, 5, shade(grey, 1.05), shade(grey, 0.7)); const [bx0, by0] = iso(Math.cos(a) * px, Math.sin(a) * px, 13 + bobz), [bx1, by1] = iso(Math.cos(a) * (px + 0.3), Math.sin(a) * (px + 0.3), 14 + bobz); line(ctx, bx0, by0, bx1, by1, rgb([60, 62, 64]), 2); if (anim === 'attack' && frame % 4 === 1 && px > 0) ellipse(ctx, bx1, by1, 5, 3.5, 'rgba(255,210,110,0.9)'); }
  const [fx, fy] = iso(-0.2, 0, 26 + bobz); line(ctx, fx, fy, fx, fy - 10, '#333', 1); ctx.fillStyle = rgb(team); ctx.fillRect(fx, fy - 10, 7, 4);
}
// screen dir -> world angle such that facingToDir(worldAngle) == dir (approx inverse)
function worldAngleForDir(dir) { const sa = DIR_ANGLE(dir); // screen angle -> world angle: screen vec (cos sa, sin sa) = (cx - sy, (cx+sy)/2)
  const dx = Math.cos(sa), dy = Math.sin(sa) * 2; const cx = (dx + dy) / 2, sy = (dy - dx) / 2; return Math.atan2(sy, cx); }

// ---------- unit sprite registry ----------
const UNIT_DRAW = {
  ant_worker: (ctx, o) => humanoid(ctx, { ...o, torso: mix([200, 180, 140], o.team, 0.5), helmet: 'band', weapon: o.anim === 'work' || o.anim === 'attack' ? (o.workKind === 'mine' ? 'pick' : 'axe') : 'axe', legs: [90, 70, 50] }),
  ant_infantry: (ctx, o) => humanoid(ctx, { ...o, armor: o.faction === 'rome' ? 'segmentata' : 'tunic', helmet: o.faction === 'greece' ? 'greek' : (o.faction === 'gaul' ? 'hair' : 'roman'), weapon: o.faction === 'greece' || o.faction === 'gaul' ? 'spear' : 'sword', shield: o.faction === 'rome' ? 'scutum' : (o.faction === 'greece' ? 'round' : 'oval'), sleeves: SKIN, belt: [140, 110, 60] }),
  ant_ranged: (ctx, o) => humanoid(ctx, { ...o, helmet: 'cap', weapon: o.faction === 'gaul' || o.faction === 'carthage' ? 'sling' : 'bow', torso: mix(o.team, [120, 110, 90], 0.25), legs: [80, 60, 40] }),
  ant_cavalry: (ctx, o) => horse(ctx, o, c => humanoid(c, { ...o, rider: true, helmet: o.faction === 'greece' ? 'greek' : 'roman', weapon: 'spear', shield: 'round', anim: o.anim === 'walk' ? 'idle' : o.anim })),
  ant_siege: (ctx, o) => catapult(ctx, o),
  ant_ship: (ctx, o) => shipAntiquity(ctx, o),
  ww2_worker: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', torso: mix([110, 110, 100], o.team, 0.45), helmet: 'hardhat', weapon: o.workKind === 'mine' ? 'wrench' : 'shovel', legs: [70, 70, 65], sleeves: mix([110, 110, 100], o.team, 0.3) }),
  ww2_infantry: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', torso: mix([96, 100, 80], o.team, 0.5), helmet: o.faction === 'germany' ? 'stahlhelm' : 'garrison', weapon: 'rifle', legs: [75, 78, 62], sleeves: mix([96, 100, 80], o.team, 0.4), belt: [50, 40, 30], emblem: o.team }),
  ww2_ranged: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', torso: mix([90, 94, 76], o.team, 0.5), helmet: o.faction === 'germany' ? 'stahlhelm' : 'garrison', weapon: 'mg', legs: [70, 72, 58], sleeves: mix([90, 94, 76], o.team, 0.4) }),
  ww2_tank: (ctx, o) => tank(ctx, o),
  ww2_artillery: (ctx, o) => artillery(ctx, o),
  ww2_destroyer: (ctx, o) => destroyer(ctx, o),
  // ---- tier 2/3 antiquity ----
  ant_spearman: (ctx, o) => humanoid(ctx, { ...o, helmet: 'cap', weapon: 'spear', shield: 'oval', torso: mix(o.team, [150, 140, 120], 0.3), sleeves: SKIN, belt: [90, 70, 40] }),
  ant_skirmisher: (ctx, o) => humanoid(ctx, { ...o, helmet: 'band', weapon: 'spear', shield: null, torso: mix(o.team, [200, 190, 160], 0.35), legs: [90, 70, 50] }),
  ant_veteran: (ctx, o) => humanoid(ctx, { ...o, scale: 1.14, armor: 'plate', helmet: o.faction === 'greece' ? 'greek' : 'roman', weapon: 'sword', shield: 'scutum', torso: mix(o.team, METAL, 0.35), sleeves: mix(SKIN, METAL, 0.4), belt: [140, 110, 60], emblem: [240, 220, 120] }),
  ant_longbow: (ctx, o) => humanoid(ctx, { ...o, helmet: 'cap', weapon: 'bow', torso: mix(o.team, [60, 70, 50], 0.4), legs: [50, 45, 35], emblem: [240, 220, 120] }),
  ant_heavycav: (ctx, o) => horse(ctx, { ...o, horseColor: [70, 60, 55] }, c => humanoid(c, { ...o, rider: true, armor: 'plate', helmet: 'roman', weapon: 'spear', shield: 'round', torso: mix(o.team, METAL, 0.45), sleeves: METAL_D, anim: o.anim === 'walk' ? 'idle' : o.anim })),
  ant_chariot: (ctx, o) => chariot(ctx, o),
  ant_ballista: (ctx, o) => ballista(ctx, o),
  ant_heavyship: (ctx, o) => { ctx.save(); ctx.scale(1.25, 1.25); shipAntiquity(ctx, o); ctx.restore(); },
  ant_hero: (ctx, o) => horse(ctx, { ...o, horseColor: [245, 240, 230] }, c => { humanoid(c, { ...o, rider: true, armor: 'plate', cape: true, helmet: 'roman', weapon: 'sword', shield: 'round', torso: mix(o.team, [240, 200, 80], 0.4), sleeves: METAL, belt: [200, 170, 60], emblem: [255, 240, 160], anim: o.anim === 'walk' ? 'idle' : o.anim }); }),
  // ---- tier 2/3 ww2 ----
  ww2_flamer: (ctx, o) => { humanoid(ctx, { ...o, armor: 'uniform', torso: mix([96, 100, 80], o.team, 0.5), helmet: 'stahlhelm', weapon: 'flamer', legs: [75, 78, 62], sleeves: mix([96, 100, 80], o.team, 0.4) }); },
  ww2_sniper: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', torso: mix([70, 80, 55], o.team, 0.35), helmet: 'cap', weapon: 'rifle', legs: [60, 62, 50], sleeves: mix([70, 80, 55], o.team, 0.3) }),
  ww2_para: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', torso: mix([80, 92, 70], o.team, 0.5), helmet: 'garrison', weapon: 'mg', legs: [70, 72, 58], sleeves: mix([80, 92, 70], o.team, 0.4), emblem: o.team }),
  ww2_atgun: (ctx, o) => { ctx.save(); ctx.scale(0.8, 0.8); artillery(ctx, o); ctx.restore(); },
  ww2_heavytank: (ctx, o) => { ctx.save(); ctx.scale(1.25, 1.25); tank(ctx, o); ctx.restore(); },
  ww2_td: (ctx, o) => tankDestroyer(ctx, o),
  ww2_rockets: (ctx, o) => rocketTruck(ctx, o),
  ww2_cruiser: (ctx, o) => { ctx.save(); ctx.scale(1.3, 1.3); destroyer(ctx, o); ctx.restore(); },
  ww2_hero: (ctx, o) => commandCar(ctx, o),
  // ---- transports ----
  ant_transport: (ctx, o) => { const { dir, team, frame } = o; const a = worldAngleForDir(dir); const bobz = Math.sin(frame / 6 * Math.PI * 2) * 1.2;
    ellipse(ctx, 0, 0, 30, 14, 'rgba(0,0,0,0.25)');
    prism(ctx, rot([[-0.9, -0.3], [0.7, -0.3], [1.0, 0], [0.7, 0.3], [-0.9, 0.3], [-1.05, 0]], a), 2 + bobz, 8, [150, 105, 60], [110, 70, 35]);
    prism(ctx, rot(isoRect(-0.6, -0.22, 1.0, 0.44), a), 10 + bobz, 3, [170, 130, 80], [120, 90, 55]); // open cargo deck
    for (let i = 0; i < Math.min(4, o.cargo || 0); i++) { const [cx, cy] = iso(Math.cos(a) * (-0.4 + i * 0.25), Math.sin(a) * (-0.4 + i * 0.25), 13 + bobz); rrect(ctx, cx - 3, cy - 6, 6, 6, 1, rgb([120, 85, 45]), OUT, 0.5); }
    const [mx, my] = iso(-0.3, 0, 11 + bobz); line(ctx, mx, my, mx, my - 26, rgb(WOOD_D), 2.2); poly(ctx, [[mx - 8, my - 24], [mx + 8, my - 24], [mx + 9, my - 12], [mx - 9, my - 11]], '#efe4c8', OUT, 0.7); ctx.fillStyle = rgb(team); ctx.fillRect(mx - 6, my - 19, 12, 4); },
  ww2_landing: (ctx, o) => { const { dir, team, frame } = o; const a = worldAngleForDir(dir); const bobz = Math.sin(frame / 6 * Math.PI * 2) * 0.8; const grey = [110, 118, 110];
    ellipse(ctx, 0, 0, 30, 13, 'rgba(0,0,0,0.25)');
    prism(ctx, rot([[-0.95, -0.28], [0.8, -0.28], [0.95, -0.18], [0.95, 0.18], [0.8, 0.28], [-0.95, 0.28]], a), 1 + bobz, 7, grey, shade(grey, 0.65)); // flat-bottomed hull
    prism(ctx, rot(isoRect(0.72, -0.26, 0.2, 0.52), a), 8 + bobz, 8, shade(grey, 1.1), shade(grey, 0.7)); // bow ramp
    prism(ctx, rot(isoRect(-0.95, -0.14, 0.25, 0.28), a), 8 + bobz, 6, shade(grey, 1.05), shade(grey, 0.7)); // coxswain box
    for (let i = 0; i < Math.min(4, o.cargo || 0); i++) { const [cx, cy] = iso(Math.cos(a) * (-0.5 + i * 0.25) - Math.sin(a) * ((i % 2) - 0.5) * 0.2, Math.sin(a) * (-0.5 + i * 0.25) + Math.cos(a) * ((i % 2) - 0.5) * 0.2, 9 + bobz); ellipse(ctx, cx, cy - 3, 3, 3.2, rgb([88, 96, 80]), OUT, 0.5); }
    const [fx, fy] = iso(-0.7, 0, 14 + bobz); line(ctx, fx, fy, fx, fy - 9, '#333', 1); ctx.fillStyle = rgb(team); ctx.fillRect(fx, fy - 9, 6, 3.5); },
  sf_transport: (ctx, o) => { const { dir, team, frame } = o; const a = worldAngleForDir(dir); const hover = 5 + Math.sin(frame * 1.05) * 1.2;
    ellipse(ctx, 0, 0, 30, 14, 'rgba(0,0,0,0.25)'); hoverGlow(ctx, 30, 14, 1);
    const hullC = mix([170, 178, 192], team, 0.3), hullD = shade(hullC, 0.62);
    prism(ctx, rot([[-0.9, -0.3], [0.6, -0.3], [0.95, 0], [0.6, 0.3], [-0.9, 0.3], [-1.0, 0]], a), hover, 8, hullC, hullD);
    const [cx, cy] = iso(-0.1, 0, hover + 8); for (let i = 5; i >= 0; i--) { const k = i / 6; ellipse(ctx, cx, cy - (1 - k) * 10, 20 * k + 3, 9 * k + 1.5, `rgba(120,200,255,${0.15 + (1 - k) * 0.12})`, i === 5 ? 'rgba(160,220,255,0.6)' : null, 0.7); } // glass pod
    for (let i = 0; i < Math.min(4, o.cargo || 0); i++) { const [px, py] = iso(-0.45 + i * 0.25, 0, hover + 9); ellipse(ctx, px, py - 2, 2.5, 2.8, rgb([90, 96, 110]), OUT, 0.4); }
    const [fx, fy] = iso(-0.7, 0, hover + 12); ctx.fillStyle = rgb(team); ctx.fillRect(fx - 3, fy - 2, 6, 3); },
  // ---- healers ----
  ant_medic: (ctx, o) => humanoid(ctx, { ...o, torso: [235, 230, 215], helmet: 'band', weapon: o.anim === 'work' ? 'wrench' : null, legs: [200, 195, 180], belt: [180, 150, 80], emblem: o.team }),
  ww2_medic: (ctx, o) => { humanoid(ctx, { ...o, armor: 'uniform', torso: mix([96, 100, 80], o.team, 0.35), helmet: 'garrison', weapon: null, legs: [75, 78, 62], sleeves: [220, 220, 220] }); ctx.fillStyle = '#fff'; ctx.fillRect(-6.5, -21, 5, 5); ctx.fillStyle = '#d33'; ctx.fillRect(-4.6, -20.5, 1.2, 4); ctx.fillRect(-6, -19.1, 4, 1.2); },
  sf_medic: (ctx, o) => { drone(ctx, o, 'worker'); ctx.fillStyle = 'rgba(120,255,160,0.95)'; ctx.fillRect(-1, -14, 2, 6); ctx.fillRect(-3, -12, 6, 2); },
  // ---- neutral creeps ----
  ant_creep: (ctx, o) => humanoid(ctx, { ...o, team: [120, 90, 60], torso: [110, 80, 50], helmet: 'hair', weapon: 'axe', shield: 'round', legs: [70, 55, 40], belt: [60, 40, 25] }),
  ww2_creep: (ctx, o) => humanoid(ctx, { ...o, armor: 'uniform', team: [90, 80, 60], torso: [80, 70, 50], helmet: 'cap', weapon: 'rifle', legs: [60, 55, 45], sleeves: [90, 80, 60] }),
  sf_creep: (ctx, o) => { const { dir, anim, frame } = o; const sa = DIR_ANGLE(dir); const fx = Math.cos(sa), fy = Math.sin(sa); const ph = anim === 'walk' ? (frame / 6) * Math.PI * 2 : 0; const bob = Math.abs(Math.sin(ph)) * 2;
    ellipse(ctx, 0, 0, 12, 6, 'rgba(0,0,0,0.35)');
    for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1, f = (i / 6 - 0.5) * 1.6; const lift = anim === 'walk' ? Math.max(0, Math.sin(ph + i)) * 4 : 0; line(ctx, fx * f * 6 - fy * 4 * s, -6 - bob, fx * f * 10 - fy * 10 * s, -lift, rgb([70, 40, 90]), 2.2); }
    ctx.save(); ctx.translate(0, -8 - bob); ctx.rotate(Math.atan2(fy * 0.6, fx)); ellipse(ctx, 0, 0, 12, 6, rgb([110, 60, 140]), OUT, 0.9); ellipse(ctx, -2, -2, 7, 3, rgb([150, 90, 190], 0.8)); for (let i = -1; i <= 1; i++) ellipse(ctx, i * 5, -4, 1.8, 1.8, 'rgba(197,106,255,0.9)'); ctx.restore();
    const hx = fx * 12, hy = -9 - bob + fy * 3; ellipse(ctx, hx, hy, 5, 4, rgb([120, 70, 150]), OUT, 0.8); ctx.fillStyle = 'rgba(255,240,120,0.95)'; ctx.fillRect(hx - 3 + fx, hy - 1.5, 2, 2); ctx.fillRect(hx + 1 + fx, hy - 1.5, 2, 2);
    if (anim === 'attack' && frame % 4 === 1) { line(ctx, hx, hy, hx + fx * 8, hy + fy * 4, 'rgba(255,255,255,0.8)', 2); } },
  // ---- sci-fi ----
  sf_worker: (ctx, o) => drone(ctx, o, 'worker'),
  sf_infantry: (ctx, o) => humanoid(ctx, { ...o, armor: 'suit', torso: mix([120, 128, 140], o.team, 0.5), helmet: o.faction === 'synth' ? 'android' : 'visor', weapon: 'plasmaRifle', legs: [70, 74, 86], sleeves: mix([120, 128, 140], o.team, 0.35), belt: [50, 60, 80], emblem: [80, 220, 255] }),
  sf_ranged: (ctx, o) => humanoid(ctx, { ...o, armor: 'suit', torso: mix([90, 96, 110], o.team, 0.45), helmet: o.faction === 'synth' ? 'android' : 'visor', weapon: 'rail', legs: [60, 64, 76], sleeves: mix([90, 96, 110], o.team, 0.3), emblem: [80, 220, 255] }),
  sf_tank: (ctx, o) => hoverTank(ctx, o, 1),
  sf_walker: (ctx, o) => walker(ctx, o),
  sf_boat: (ctx, o) => hoverBoat(ctx, o, 1),
  sf_shield: (ctx, o) => humanoid(ctx, { ...o, armor: 'suit', torso: mix([120, 128, 140], o.team, 0.5), helmet: 'visor', weapon: 'rocket', shield: 'energy', legs: [70, 74, 86], sleeves: mix([120, 128, 140], o.team, 0.35), emblem: [80, 220, 255] }),
  sf_jet: (ctx, o) => { const bob = -4 - Math.abs(Math.sin(o.frame * 1.1)) * 3; ctx.save(); ctx.translate(0, bob); humanoid(ctx, { ...o, armor: 'suit', torso: mix([120, 128, 140], o.team, 0.5), helmet: 'visor', weapon: 'plasmaRifle', legs: [70, 74, 86], sleeves: mix([120, 128, 140], o.team, 0.35), anim: o.anim === 'walk' ? 'idle' : o.anim }); ctx.restore(); ellipse(ctx, -3, -6 + bob, 2, 4, 'rgba(120,220,255,0.7)'); ellipse(ctx, 3, -6 + bob, 2, 4, 'rgba(120,220,255,0.7)'); },
  sf_exo: (ctx, o) => humanoid(ctx, { ...o, armor: 'suit', scale: 1.18, torso: mix([150, 156, 170], o.team, 0.45), helmet: 'visor', weapon: 'plasmaRifle', legs: [90, 96, 110], sleeves: [140, 146, 160], belt: [50, 60, 80], emblem: [80, 220, 255] }),
  sf_snipedrone: (ctx, o) => drone(ctx, o, 'sniper'),
  sf_heavytank: (ctx, o) => hoverTank(ctx, o, 1.28),
  sf_mech: (ctx, o) => mech(ctx, o, 1),
  sf_laser: (ctx, o) => laserPlatform(ctx, o),
  sf_cruiser: (ctx, o) => hoverBoat(ctx, o, 1.35),
  sf_hero: (ctx, o) => mech(ctx, o, 1.3, true),
};
const UNIT_BOX = { default: [32, 52, 16, 46], ant_cavalry: [44, 56, 22, 50], ant_siege: [72, 82, 36, 72], ant_ship: [80, 80, 40, 70], ww2_tank: [64, 56, 32, 48], ww2_artillery: [72, 62, 36, 52], ww2_destroyer: [90, 80, 45, 70],
  ant_veteran: [30, 52, 15, 46], ant_heavycav: [44, 56, 22, 50], ant_chariot: [84, 74, 42, 64], ant_ballista: [70, 70, 35, 60], ant_heavyship: [100, 100, 50, 88], ant_hero: [46, 58, 23, 52],
  ww2_atgun: [48, 44, 24, 38], ww2_heavytank: [94, 80, 47, 68], ww2_td: [64, 56, 32, 48], ww2_rockets: [66, 66, 33, 56], ww2_cruiser: [118, 104, 59, 90], ww2_hero: [56, 50, 28, 42],
  ant_transport: [90, 80, 45, 68], ww2_landing: [90, 70, 45, 58], sf_transport: [90, 76, 45, 64], sf_creep: [48, 44, 24, 36], sf_worker: [30, 40, 15, 34], sf_snipedrone: [70, 44, 35, 36], sf_tank: [64, 62, 32, 54], sf_heavytank: [94, 88, 47, 76], sf_walker: [72, 80, 36, 70], sf_boat: [80, 70, 40, 60], sf_cruiser: [108, 92, 54, 80], sf_mech: [44, 66, 22, 60], sf_hero: [58, 90, 29, 82], sf_laser: [60, 60, 30, 52], sf_exo: [30, 54, 15, 48], sf_jet: [28, 56, 14, 50] };

function chariot(ctx, o) {
  const { dir, team } = o; const a = worldAngleForDir(dir);
  // cart behind the horse
  const cart = rot(isoRect(-0.75, -0.25, 0.45, 0.5), a);
  for (const s of [-1, 1]) { const [wx, wy] = iso(-Math.cos(a) * 0.55 - Math.sin(a) * 0.3 * s, -Math.sin(a) * 0.55 + Math.cos(a) * 0.3 * s, 0); ellipse(ctx, wx, wy - 5, 5, 5.5, rgb(WOOD_D), OUT, 0.8); ellipse(ctx, wx, wy - 5, 1.6, 1.8, rgb(WOOD), OUT, 0.4); const [bx, by] = iso(-Math.cos(a) * 0.55 - Math.sin(a) * 0.42 * s, -Math.sin(a) * 0.55 + Math.cos(a) * 0.42 * s, 4); line(ctx, bx, by, bx + 4 * s, by + 3, rgb(METAL), 2); }
  prism(ctx, cart, 4, 8, mix(WOOD, team, 0.5), WOOD_D);
  ctx.save(); const [hx, hy] = iso(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0); ctx.translate(hx, hy);
  horse(ctx, { ...o, horseColor: [120, 85, 50] }, c => humanoid(c, { ...o, helmet: 'greek', weapon: 'spear', torso: mix(team, [200, 180, 140], 0.3), anim: o.anim === 'walk' ? 'idle' : o.anim }));
  ctx.restore();
}
function ballista(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ellipse(ctx, 0, 0, 15, 7.5, 'rgba(0,0,0,0.35)');
  for (const s of [-1, 1]) for (const f of [-1, 1]) { const [wx, wy] = iso(Math.cos(a) * 0.25 * f - Math.sin(a) * 0.3 * s, Math.sin(a) * 0.25 * f + Math.cos(a) * 0.3 * s, 0); ellipse(ctx, wx, wy - 3.5, 3.5, 4, rgb(WOOD_D), OUT, 0.7); }
  const base = rot(isoRect(-0.35, -0.12, 0.7, 0.24), a); prism(ctx, base, 3, 6, WOOD, WOOD_D);
  // bow arms perpendicular to facing
  const [c0x, c0y] = iso(Math.cos(a) * 0.15 - Math.sin(a) * 0.45, Math.sin(a) * 0.15 + Math.cos(a) * 0.45, 12), [c1x, c1y] = iso(Math.cos(a) * 0.15 + Math.sin(a) * 0.45, Math.sin(a) * 0.15 - Math.cos(a) * 0.45, 12);
  const [mx, my] = iso(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 12);
  ctx.beginPath(); ctx.moveTo(c0x, c0y); ctx.quadraticCurveTo(mx - (c0x - mx) * 0.1, my - 6, c1x, c1y); ctx.strokeStyle = rgb(WOOD); ctx.lineWidth = 2.5; ctx.stroke();
  const pull = anim === 'attack' ? [0.25, 0.05, 0.15, 0.25][frame % 4] : 0.25;
  const [sx, sy] = iso(Math.cos(a) * (0.15 - pull), Math.sin(a) * (0.15 - pull), 12); line(ctx, c0x, c0y, sx, sy, '#ddd', 0.8); line(ctx, c1x, c1y, sx, sy, '#ddd', 0.8);
  const [r0x, r0y] = iso(-Math.cos(a) * 0.3, -Math.sin(a) * 0.3, 11), [r1x, r1y] = iso(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 13); line(ctx, r0x, r0y, r1x, r1y, rgb(WOOD_D), 3);
  if (pull > 0.1) line(ctx, sx, sy, r1x, r1y, rgb(METAL), 1.6);
  const [fx, fy] = iso(-0.3, 0, 12); ctx.fillStyle = rgb(team); ctx.fillRect(fx - 2, fy - 8, 4, 5);
}
function tankDestroyer(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  const hullC = mix([96, 100, 84], team, 0.45), hullD = shade(hullC, 0.7);
  ellipse(ctx, 0, 0, 22, 11, 'rgba(0,0,0,0.35)');
  const trackL = rot(isoRect(-0.55, -0.4, 1.1, 0.14), a), trackR = rot(isoRect(-0.55, 0.26, 1.1, 0.14), a);
  prism(ctx, trackL, 0, 5, [50, 50, 48], [35, 35, 33]); prism(ctx, trackR, 0, 5, [50, 50, 48], [35, 35, 33]);
  prism(ctx, rot(isoRect(-0.5, -0.32, 1.0, 0.64), a), 3, 8, hullC, hullD);
  prism(ctx, rot([[-0.35, -0.28], [0.3, -0.22], [0.3, 0.22], [-0.35, 0.28]], a), 11, 7, shade(hullC, 1.08), hullD); // sloped casemate
  const recoil = anim === 'attack' && frame % 4 === 1 ? 0.1 : 0;
  const [bx0, by0] = iso(Math.cos(a) * (0.2 - recoil), Math.sin(a) * (0.2 - recoil), 15), [bx1, by1] = iso(Math.cos(a) * (1.0 - recoil), Math.sin(a) * (1.0 - recoil), 15);
  line(ctx, bx0, by0, bx1, by1, OUT, 4.5); line(ctx, bx0, by0, bx1, by1, rgb([70, 74, 66]), 2.8);
  if (anim === 'attack' && frame % 4 === 1) ellipse(ctx, bx1, by1, 7, 4.5, 'rgba(255,210,110,0.9)');
  const [sx, sy] = iso(0, 0, 19); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 3, sy - 1.5, 6, 3);
}
function rocketTruck(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  const body = mix([90, 96, 78], team, 0.4);
  ellipse(ctx, 0, 0, 20, 10, 'rgba(0,0,0,0.35)');
  for (const f of [-0.35, 0.4]) for (const s of [-1, 1]) { const [wx, wy] = iso(Math.cos(a) * f - Math.sin(a) * 0.3 * s, Math.sin(a) * f + Math.cos(a) * 0.3 * s, 0); ellipse(ctx, wx, wy - 4, 4, 4.5, rgb([45, 45, 42]), OUT, 0.7); }
  prism(ctx, rot(isoRect(-0.55, -0.28, 1.1, 0.56), a), 4, 7, body, shade(body, 0.7));
  prism(ctx, rot(isoRect(0.25, -0.26, 0.3, 0.52), a), 11, 9, shade(body, 1.1), shade(body, 0.7)); // cab
  // rocket rack (angled)
  const t = anim === 'attack' ? frame % 4 : -1;
  for (let i = 0; i < 4; i++) { const off = (i - 1.5) * 0.11; const [r0x, r0y] = iso(-Math.cos(a) * 0.45 - Math.sin(a) * off, -Math.sin(a) * 0.45 + Math.cos(a) * off, 12), [r1x, r1y] = iso(Math.cos(a) * 0.15 - Math.sin(a) * off, Math.sin(a) * 0.15 + Math.cos(a) * off, 30); line(ctx, r0x, r0y, r1x, r1y, rgb([60, 62, 58]), 2.6); if (t < 0 || i > t) { ctx.fillStyle = '#b04030'; ellipse(ctx, r1x, r1y, 1.8, 1.8, '#b04030'); } else ellipse(ctx, r1x, r1y, 4, 3, 'rgba(255,200,100,0.8)'); }
  const [sx, sy] = iso(0.4, 0, 21); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 3, sy - 1.5, 6, 3);
}
// ---------- sci-fi vehicles ----------
const HULL_SF = [150, 158, 172], HULL_SF_D = [88, 94, 108], GLOW = 'rgba(90,225,255,0.9)', GLOW_SOFT = 'rgba(90,225,255,0.35)';
function hoverGlow(ctx, rx, ry, k = 1) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(90,225,255,${0.45 * k})`); g.addColorStop(1, 'rgba(90,225,255,0)'); ctx.fillStyle = g; ctx.save(); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drone(ctx, o, kind) {
  const { dir, team, anim, frame } = o; const sa = DIR_ANGLE(dir); const fx = Math.cos(sa), fy = Math.sin(sa);
  const hover = -10 - Math.sin(frame * 1.05 + (anim === 'walk' ? 0 : 1)) * 1.5;
  ellipse(ctx, 0, 0, 7, 3.5, 'rgba(0,0,0,0.3)'); ctx.save(); ctx.translate(0, 0); hoverGlow(ctx, 8, 4, 0.8); ctx.restore();
  ctx.save(); ctx.translate(0, hover);
  ellipse(ctx, 0, 0, 7, 4, rgb(HULL_SF), OUT, 0.8); ellipse(ctx, 0, -2, 4.5, 3, rgb(shade(HULL_SF, 1.15)), OUT, 0.6);
  ctx.fillStyle = rgb(team); ctx.fillRect(-4, -0.5, 8, 1.6);
  ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(fx * 4, -2 + fy * 1.5, 1.4, 0, 7); ctx.fill();
  // rotors / fins
  for (const s of [-1, 1]) { line(ctx, s * 6, -1, s * 10, -3, rgb(HULL_SF_D), 1.5); ellipse(ctx, s * 10, -3.5, 3, 1, 'rgba(200,220,240,0.35)'); }
  if (kind === 'worker') { // tool arm
    const swing = anim === 'work' || anim === 'attack' ? [0, 0.4, 0.8, 0.4][frame % 4] : 0;
    line(ctx, fx * 4, 2, fx * 8, 6 + swing * 4, rgb(HULL_SF_D), 1.6); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(fx * 8, 6 + swing * 4, 1.5, 0, 7); ctx.fill();
    if (o.carry === 'p') { ellipse(ctx, -fx * 4, 4, 3.5, 3, 'rgba(120,230,255,0.9)', OUT, 0.6); } else if (o.carry === 's') { ellipse(ctx, -fx * 4, 4, 4, 3, 'rgba(197,106,255,0.9)', OUT, 0.6); }
  } else { // sniper drone: long barrel
    line(ctx, fx * 3, 0, fx * 14, fy * 3, rgb([70, 74, 86]), 2.2); line(ctx, fx * 6, 0, fx * 14, fy * 3, 'rgba(120,200,255,0.9)', 0.8);
    if (anim === 'attack' && frame % 4 === 1) line(ctx, fx * 14, fy * 3, fx * 34, fy * 8, 'rgba(160,240,255,0.8)', 1.5);
  }
  ctx.restore();
}
function hoverTank(ctx, o, sc) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ctx.save(); ctx.scale(sc, sc);
  const hullC = mix(HULL_SF, team, 0.4), hullD = shade(hullC, 0.65);
  ellipse(ctx, 0, 0, 22, 11, 'rgba(0,0,0,0.3)'); hoverGlow(ctx, 22, 11, 0.9);
  const hover = 6 + Math.sin(frame * 1.05) * 0.8;
  prism(ctx, rot([[-0.55, -0.3], [0.45, -0.3], [0.62, 0], [0.45, 0.3], [-0.55, 0.3], [-0.62, 0]], a), hover, 8, hullC, hullD);
  // glowing side rails
  for (const s of [-1, 1]) { const [x0, y0] = iso(-Math.cos(a) * 0.5 - Math.sin(a) * 0.3 * s, -Math.sin(a) * 0.5 + Math.cos(a) * 0.3 * s, hover + 1), [x1, y1] = iso(Math.cos(a) * 0.45 - Math.sin(a) * 0.3 * s, Math.sin(a) * 0.45 + Math.cos(a) * 0.3 * s, hover + 1); line(ctx, x0, y0, x1, y1, GLOW, 1.2); }
  prism(ctx, rot(isoRect(-0.2, -0.18, 0.4, 0.36), a), hover + 8, 6, shade(hullC, 1.1), hullD);
  const recoil = anim === 'attack' && frame % 4 === 1 ? 0.08 : 0;
  const barrels = sc > 1.2 ? [-0.08, 0.08] : [0];
  for (const off of barrels) { const [bx0, by0] = iso(Math.cos(a) * (0.1 - recoil) - Math.sin(a) * off, Math.sin(a) * (0.1 - recoil) + Math.cos(a) * off, hover + 11), [bx1, by1] = iso(Math.cos(a) * (0.8 - recoil) - Math.sin(a) * off, Math.sin(a) * (0.8 - recoil) + Math.cos(a) * off, hover + 11); line(ctx, bx0, by0, bx1, by1, OUT, 4); line(ctx, bx0, by0, bx1, by1, rgb([80, 86, 100]), 2.4); line(ctx, bx0, by0, bx1, by1, 'rgba(120,200,255,0.7)', 0.8); if (anim === 'attack' && frame % 4 === 1) ellipse(ctx, bx1, by1, 5, 3.5, 'rgba(120,230,255,0.9)'); }
  const [sx, sy] = iso(0, 0, hover + 16); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 3, sy - 1.5, 6, 3);
  ctx.restore();
}
function walker(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ellipse(ctx, 0, 0, 16, 8, 'rgba(0,0,0,0.32)');
  const ph = anim === 'walk' ? (frame / 6) * Math.PI * 2 : 0;
  const hullC = mix(HULL_SF, team, 0.4), hullD = shade(hullC, 0.65);
  // four legs
  for (let i = 0; i < 4; i++) { const s = i < 2 ? -1 : 1, f = i % 2 ? 1 : -1; const lift = anim === 'walk' ? Math.max(0, Math.sin(ph + i * Math.PI / 2)) * 5 : 0; const [hx, hy] = iso(Math.cos(a) * 0.2 * f - Math.sin(a) * 0.22 * s, Math.sin(a) * 0.2 * f + Math.cos(a) * 0.22 * s, 14); const [kx, ky] = iso(Math.cos(a) * 0.3 * f - Math.sin(a) * 0.45 * s, Math.sin(a) * 0.3 * f + Math.cos(a) * 0.45 * s, 18); const [fx2, fy2] = iso(Math.cos(a) * 0.32 * f - Math.sin(a) * 0.5 * s, Math.sin(a) * 0.32 * f + Math.cos(a) * 0.5 * s, lift); line(ctx, hx, hy, kx, ky, rgb(hullD), 3); line(ctx, kx, ky, fx2, fy2, rgb(hullD), 2.4); ellipse(ctx, fx2, fy2, 2, 1.2, rgb([60, 64, 76]), OUT, 0.5); }
  prism(ctx, rot([[-0.3, -0.22], [0.3, -0.22], [0.38, 0], [0.3, 0.22], [-0.3, 0.22], [-0.38, 0]], a), 12, 9, hullC, hullD);
  // mortar tube angled up
  const t = anim === 'attack' ? [0, 1, 0.6, 0.2][frame % 4] : 0;
  const [m0x, m0y] = iso(0, 0, 20), [m1x, m1y] = iso(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 38 - t * 4);
  line(ctx, m0x, m0y, m1x, m1y, OUT, 6); line(ctx, m0x, m0y, m1x, m1y, rgb([80, 86, 100]), 4.2); if (t > 0.5) ellipse(ctx, m1x, m1y, 6, 4, 'rgba(120,230,255,0.9)');
  const [sx, sy] = iso(-0.2, 0, 22); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 3, sy - 2, 6, 3); ctx.fillStyle = GLOW; ctx.fillRect(sx + 4, sy - 2, 2, 2);
}
function hoverBoat(ctx, o, sc) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ctx.save(); ctx.scale(sc, sc);
  const hullC = mix([170, 178, 192], team, 0.35), hullD = shade(hullC, 0.62);
  ellipse(ctx, 0, 0, 28, 13, 'rgba(0,0,0,0.25)'); hoverGlow(ctx, 30, 14, 1);
  const hover = 5 + Math.sin(frame * 1.05) * 1.2;
  prism(ctx, rot([[-0.85, -0.22], [0.5, -0.24], [1.0, 0], [0.5, 0.24], [-0.85, 0.22], [-0.95, 0]], a), hover, 7, hullC, hullD);
  prism(ctx, rot(isoRect(-0.4, -0.13, 0.5, 0.26), a), hover + 7, 8, shade(hullC, 1.08), hullD);
  // fins
  for (const s of [-1, 1]) prism(ctx, rot([[-0.9, 0.2 * s], [-0.5, 0.2 * s], [-0.7, 0.42 * s]], a), hover + 2, 5, shade(hullC, 0.9), hullD);
  // turret
  prism(ctx, rot(isoRect(0.2, -0.1, 0.2, 0.2), a), hover + 7, 5, shade(hullC, 1.1), hullD);
  const [bx0, by0] = iso(Math.cos(a) * 0.3, Math.sin(a) * 0.3, hover + 11), [bx1, by1] = iso(Math.cos(a) * 0.75, Math.sin(a) * 0.75, hover + 12); line(ctx, bx0, by0, bx1, by1, rgb([80, 86, 100]), 2.2); line(ctx, bx0, by0, bx1, by1, 'rgba(120,200,255,0.7)', 0.8);
  if (anim === 'attack' && frame % 4 === 1) ellipse(ctx, bx1, by1, 5, 3.5, 'rgba(120,230,255,0.9)');
  const [fx, fy] = iso(-0.3, 0, hover + 15); line(ctx, fx, fy, fx, fy - 10, '#333', 1); ctx.fillStyle = rgb(team); ctx.fillRect(fx, fy - 10, 7, 4);
  ctx.restore();
}
function mech(ctx, o, sc, hero = false) {
  const { dir, team, anim, frame } = o; const sa = DIR_ANGLE(dir); const fx = Math.cos(sa), fy = Math.sin(sa);
  ctx.save(); ctx.scale(sc, sc);
  const hullC = mix(hero ? [220, 200, 120] : HULL_SF, team, hero ? 0.35 : 0.45), hullD = shade(hullC, 0.62);
  ellipse(ctx, 0, 0, 12, 6, 'rgba(0,0,0,0.35)');
  const ph = anim === 'walk' ? (frame / 6) * Math.PI * 2 : 0; const legA = anim === 'walk' ? Math.sin(ph) * 4 : 0; const bob = anim === 'walk' ? Math.abs(Math.sin(ph)) * 1.5 : 0;
  const lx = -fy * 4.5, ly = fx * 2.2;
  // legs (thick, jointed)
  for (const s of [-1, 1]) { const kx = s * lx + fx * legA * s * 0.4, ky = s * ly - 12; line(ctx, s * lx, -20 + bob, kx, ky, rgb(hullD), 4.5); line(ctx, kx, ky, s * lx + fx * legA * s * 0.8, -2, rgb(shade(hullC, 0.9)), 4); ellipse(ctx, s * lx + fx * legA * s * 0.8, 0, 4, 2, rgb([60, 64, 76]), OUT, 0.6); }
  // torso
  const y0 = -20 - bob;
  rrect(ctx, -9, y0 - 12, 18, 14, 4, rgb(hullC), OUT, 0.9); rrect(ctx, -7, y0 - 11, 6, 8, 2, rgb(shade(hullC, 1.15), 0.9));
  ctx.fillStyle = rgb(team); ctx.fillRect(-5, y0 - 4, 10, 2.5);
  ctx.fillStyle = hero ? 'rgba(255,200,80,0.95)' : GLOW; ctx.beginPath(); ctx.arc(fx * 2, y0 - 7, 2.2, 0, 7); ctx.fill();
  // head / cockpit
  rrect(ctx, -4.5, y0 - 19, 9, 7, 3, rgb(shade(hullC, 1.05)), OUT, 0.8); ctx.fillStyle = 'rgba(80,220,255,0.95)'; ctx.fillRect(-3 + fx * 1.5, y0 - 16.5, 6, 2);
  // arm cannons
  const rec = anim === 'attack' ? [0, 3, 1, 0][frame % 4] : 0;
  for (const s of [-1, 1]) { const ax = s * lx * 2.2, ay = y0 - 8; rrect(ctx, ax - 3, ay - 3, 6, 9, 2, rgb(hullD), OUT, 0.7); const gx = ax + fx * (8 - rec), gy = ay + 2 + fy * 3; line(ctx, ax, ay + 2, gx, gy, rgb([70, 74, 86]), 3.2); line(ctx, ax, ay + 2, gx, gy, 'rgba(120,200,255,0.6)', 1); if (anim === 'attack' && frame % 4 === 1) ellipse(ctx, gx, gy, 4, 3, 'rgba(120,230,255,0.9)'); }
  if (hero) { line(ctx, 0, y0 - 19, 0, y0 - 32, '#3a2a1a', 1.2); poly(ctx, [[0, y0 - 32], [10, y0 - 29], [0, y0 - 26]], rgb(team), OUT, 0.5); }
  ctx.restore();
}
function laserPlatform(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  ellipse(ctx, 0, 0, 18, 9, 'rgba(0,0,0,0.3)'); hoverGlow(ctx, 18, 9, 0.9);
  const hover = 6 + Math.sin(frame * 1.05) * 0.8;
  const hullC = mix(HULL_SF, team, 0.35), hullD = shade(hullC, 0.65);
  const oct = []; for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; oct.push([Math.cos(t) * 0.45, Math.sin(t) * 0.45]); }
  prism(ctx, oct, hover, 6, hullC, hullD);
  prism(ctx, oct.map(p => [p[0] * 0.45, p[1] * 0.45]), hover + 6, 8, shade(hullC, 1.1), hullD);
  // emitter
  const [e0x, e0y] = iso(0, 0, hover + 16), [e1x, e1y] = iso(Math.cos(a) * 0.9, Math.sin(a) * 0.9, hover + 18);
  line(ctx, e0x, e0y, e1x, e1y, OUT, 5); line(ctx, e0x, e0y, e1x, e1y, rgb([80, 86, 100]), 3.2); line(ctx, e0x, e0y, e1x, e1y, 'rgba(120,200,255,0.8)', 1.2);
  const charge = anim === 'attack' ? [0.3, 1, 0.5, 0.2][frame % 4] : 0.25;
  ctx.fillStyle = `rgba(120,230,255,${charge})`; ctx.beginPath(); ctx.arc(e1x, e1y, 2 + charge * 3, 0, 7); ctx.fill();
  if (anim === 'attack' && frame % 4 === 1) { const [e2x, e2y] = iso(Math.cos(a) * 2.2, Math.sin(a) * 2.2, hover + 18); line(ctx, e1x, e1y, e2x, e2y, 'rgba(160,240,255,0.85)', 2); }
  const [sx, sy] = iso(0, 0, hover + 15); ctx.fillStyle = rgb(team); ctx.fillRect(sx - 2.5, sy - 1, 5, 2.5);
}
function commandCar(ctx, o) {
  const { dir, team, anim, frame } = o; const a = worldAngleForDir(dir);
  const body = mix([100, 104, 84], team, 0.45);
  ellipse(ctx, 0, 0, 17, 8.5, 'rgba(0,0,0,0.35)');
  for (const f of [-0.3, 0.3]) for (const s of [-1, 1]) { const [wx, wy] = iso(Math.cos(a) * f - Math.sin(a) * 0.26 * s, Math.sin(a) * f + Math.cos(a) * 0.26 * s, 0); ellipse(ctx, wx, wy - 3.5, 3.5, 4, rgb([45, 45, 42]), OUT, 0.7); }
  prism(ctx, rot(isoRect(-0.45, -0.24, 0.9, 0.48), a), 3, 6, body, shade(body, 0.7));
  prism(ctx, rot(isoRect(0.1, -0.22, 0.28, 0.44), a), 9, 6, shade(body, 1.1), shade(body, 0.7));
  // officer standing in the back with binoculars
  ctx.save(); const [px, py] = iso(-Math.cos(a) * 0.15, -Math.sin(a) * 0.15, 9); ctx.translate(px, py); ctx.scale(0.85, 0.85);
  humanoid(ctx, { ...o, torso: mix([70, 80, 60], team, 0.5), helmet: 'garrison', weapon: anim === 'attack' ? 'rifle' : null, sleeves: mix([70, 80, 60], team, 0.4), emblem: [240, 220, 120], anim: o.anim === 'walk' ? 'idle' : o.anim }); ctx.restore();
  // pennant
  const [fx, fy] = iso(0.3, -0.2, 15); line(ctx, fx, fy, fx, fy - 16, '#333', 1); poly(ctx, [[fx, fy - 16], [fx + 9, fy - 13], [fx, fy - 10]], rgb(team), OUT, 0.5);
}
/** gate helpers: pillars and opening follow the wall direction, including diagonal runs */
function gateDiag(M) { return !(M & 15) && (M & 240) ? ((M & (16 | 64)) ? 'ne' : 'nw') : null; }
function gatePillars(M, horiz) { const d = gateDiag(M); if (d === 'ne') return [[0.5 + 0.3, 0.5 - 0.3], [0.5 - 0.3, 0.5 + 0.3]]; if (d === 'nw') return [[0.5 - 0.3, 0.5 - 0.3], [0.5 + 0.3, 0.5 + 0.3]]; return horiz ? [[0.5 - 0.42, 0.5], [0.5 + 0.42, 0.5]] : [[0.5, 0.5 - 0.42], [0.5, 0.5 + 0.42]]; }
function gateSegMask(M, horiz) { return gateDiag(M) ? (M & 240) : (M & (horiz ? 10 : 5)); }
const ANIM_FRAMES = { idle: 4, walk: 6, attack: 4, work: 4, die: 4 };
const DIE_SPRITES = new Set(Object.entries(UNIT_DRAW).filter(([, fn]) => { const src = fn.toString(); return src.includes('humanoid(') && !src.includes('horse(') && !src.includes('chariot('); }).map(([k]) => k));
/** true when the sprite has a proper falling animation ('die', 4 frames) */
export function hasDieAnim(sprite) { return DIE_SPRITES.has(sprite); }

export function unitSprite(sprite, colorIdx, dir, anim, frame, extra = {}) {
  const frames = ANIM_FRAMES[anim] || 1; frame = frame % frames;
  // only parameters that change the drawing go into the key (workKind affects the work/attack pose, cargo tops out at 4 visible passengers)
  const workKind = anim === 'work' || anim === 'attack' ? (extra.workKind || '') : '';
  const cargo = extra.cargo ? Math.min(4, extra.cargo) : 0;
  const key = `u|${sprite}|${colorIdx}|${dir}|${anim}|${frame}|${extra.carry || ''}|${extra.faction || ''}|${workKind}|${cargo}`;
  const box = anim === 'die' ? [64, 56, 32, 46] : (UNIT_BOX[sprite] || UNIT_BOX.default); // a fallen body is wider than a standing one
  return cached(key, box[0], box[1], box[2], box[3], ctx => {
    const fn = UNIT_DRAW[sprite]; if (!fn) { ellipse(ctx, 0, -8, 8, 8, '#f0f', '#000'); return; }
    fn(ctx, { dir, anim, frame, team: teamRgb(colorIdx), carry: extra.carry, faction: extra.faction, workKind: extra.workKind, cargo: extra.cargo || 0 });
  });
}
export function animFrameCount(anim) { return ANIM_FRAMES[anim] || 1; }

// ---------- buildings ----------
const STONE = [214, 200, 170], STONE_D = [160, 146, 118], ROOF = [178, 74, 48], ROOF_D = [130, 52, 34], CONCRETE = [150, 148, 138], CONCRETE_D = [105, 103, 95], OLIVE = [96, 104, 70], OLIVE_D = [66, 72, 48], BRICK = [150, 78, 56], BRICK_D = [100, 52, 38];

function gableRoof(ctx, x, y, w, h, z, ridgeH, top, side, axis = 'x') {
  // gable along axis: ridge line through center at height z+ridgeH
  if (axis === 'x') {
    const A = iso(x, y, z), B = iso(x + w, y, z), C = iso(x + w, y + h, z), D = iso(x, y + h, z);
    const R0 = iso(x, y + h / 2, z + ridgeH), R1 = iso(x + w, y + h / 2, z + ridgeH);
    poly(ctx, [A, B, R1, R0], rgb(shade(top, 0.8)), OUT, 0.8);   // back slope
    poly(ctx, [D, C, R1, R0], rgb(top), OUT, 0.8);                // front slope
    poly(ctx, [B, C, R1], rgb(side), OUT, 0.8);                   // right gable
    // tile lines
    for (let i = 1; i < 4; i++) { const t = i / 4; const p0 = [D[0] + (R0[0] - D[0]) * t, D[1] + (R0[1] - D[1]) * t], p1 = [C[0] + (R1[0] - C[0]) * t, C[1] + (R1[1] - C[1]) * t]; line(ctx, p0[0], p0[1], p1[0], p1[1], rgb(shade(top, 0.85)), 0.7); }
  } else {
    const A = iso(x, y, z), B = iso(x + w, y, z), C = iso(x + w, y + h, z), D = iso(x, y + h, z);
    const R0 = iso(x + w / 2, y, z + ridgeH), R1 = iso(x + w / 2, y + h, z + ridgeH);
    poly(ctx, [A, D, R1, R0], rgb(shade(top, 1.05)), OUT, 0.8);
    poly(ctx, [B, C, R1, R0], rgb(shade(top, 0.8)), OUT, 0.8);
    poly(ctx, [D, C, R1], rgb(side), OUT, 0.8);
    for (let i = 1; i < 4; i++) { const t = i / 4; const p0 = [B[0] + (R0[0] - B[0]) * t, B[1] + (R0[1] - B[1]) * t], p1 = [C[0] + (R1[0] - C[0]) * t, C[1] + (R1[1] - C[1]) * t]; line(ctx, p0[0], p0[1], p1[0], p1[1], rgb(shade(top, 0.7)), 0.7); }
  }
}
function flag(ctx, x, y, z, team, h = 22) { const [px, py] = iso(x, y, z); line(ctx, px, py, px, py - h, '#3a2a1a', 1.5); poly(ctx, [[px, py - h], [px + 11, py - h + 3.5], [px, py - h + 7]], rgb(team), OUT, 0.6); }
function windows(ctx, pts, z, n, color = [60, 50, 40]) { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = pts[0][0] + (pts[1][0] - pts[0][0]) * t, y = pts[0][1] + (pts[1][1] - pts[0][1]) * t; const [sx, sy] = iso(x, y, z); rrect(ctx, sx - 1.8, sy - 4, 3.6, 5, 0.5, rgb(color), OUT, 0.5); } }
function doorAt(ctx, x, y, z, color = [50, 35, 20]) { const [sx, sy] = iso(x, y, z); rrect(ctx, sx - 3, sy - 8, 6, 8, 1, rgb(color), OUT, 0.6); }
function columns(ctx, x0, y0, x1, y1, n, z, h) { for (let i = 0; i <= n; i++) { const t = i / n; const [sx, sy] = iso(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z); line(ctx, sx, sy, sx, sy - h, rgb(STONE_D), 3.2); line(ctx, sx - 0.6, sy, sx - 0.6, sy - h, rgb(shade(STONE, 1.05)), 1.4); } }
function sandbags(ctx, pts, z) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const n = 5; for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; const [sx, sy] = iso(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z); ellipse(ctx, sx, sy - 2, 4, 2.4, rgb([170, 150, 105]), OUT, 0.5); ellipse(ctx, sx, sy - 5, 3.6, 2.2, rgb([185, 165, 118]), OUT, 0.5); } } }

function wallSegs(M, cw) {
  const c0 = 0.5 - cw / 2; const segs = []; const diag = a => rot(isoRect(0.5, 0.5 - cw / 2, 0.72, cw), a, 0.5, 0.5);
  if (M & 1) segs.push(isoRect(c0, 0, cw, 0.5));
  if (M & 8) segs.push(isoRect(0, c0, 0.5, cw));
  if (M & 128) segs.push(diag(-3 * Math.PI / 4));
  if (M & 16) segs.push(diag(-Math.PI / 4));
  if (M & 64) segs.push(diag(3 * Math.PI / 4));
  if (M & 4) segs.push(isoRect(c0, 0.5, cw, 0.5));
  if (M & 2) segs.push(isoRect(0.5, c0, 0.5, cw));
  if (M & 32) segs.push(diag(Math.PI / 4));
  return segs;
}

const BUILDING_DRAW = {
  ant_hall: (ctx, o) => {
    const team = o.team;
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 0, 6, shade(STONE, 0.9), STONE_D); // platform
    prism(ctx, isoRect(0.4, 0.4, 2.2, 2.2), 6, 30, STONE, STONE_D);
    columns(ctx, 0.35, 2.7, 2.7, 2.7, 4, 6, 30); columns(ctx, 2.7, 0.35, 2.7, 2.7, 4, 6, 30);
    gableRoof(ctx, 0.2, 0.2, 2.6, 2.6, 36, 22, ROOF, ROOF_D, 'x');
    doorAt(ctx, 1.5, 2.62, 6);
    windows(ctx, [[2.62, 0.7], [2.62, 2.3]], 24, 2);
    const lv = o.level || 1;
    if (lv >= 2) { // corner statues / braziers
      for (const p of [[0.25, 2.75], [2.75, 0.25]]) { const [sx, sy] = iso(p[0], p[1], 6); rrect(ctx, sx - 3, sy - 10, 6, 10, 1, rgb(STONE_D), OUT, 0.6); ellipse(ctx, sx, sy - 13, 3, 3, 'rgba(255,150,40,0.9)'); ellipse(ctx, sx, sy - 14, 1.6, 1.8, 'rgba(255,240,170,0.95)'); }
    }
    if (lv >= 3) { // second-floor tower with tiled roof
      prism(ctx, isoRect(0.9, 0.9, 1.2, 1.2), 58, 22, STONE, STONE_D);
      gableRoof(ctx, 0.8, 0.8, 1.4, 1.4, 80, 14, ROOF, ROOF_D, 'y');
    }
    if (lv >= 4) { // golden dome & laurels: imperial city
      const [cx, cy] = iso(1.5, 1.5, 94); for (let i = 5; i >= 0; i--) { const k = i / 5; ellipse(ctx, cx, cy - (1 - k) * 16, 22 * k + 2, 11 * k + 1, rgb(shade([230, 190, 80], 0.8 + (1 - k) * 0.4)), i === 5 ? OUT : null, 0.8); }
      ctx.strokeStyle = 'rgba(255,230,120,0.8)'; ctx.lineWidth = 2; for (const z of [6, 30]) { const pts = [[0.2, 0.2], [2.8, 0.2], [2.8, 2.8], [0.2, 2.8]].map(p => iso(p[0], p[1], z)); ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); }
    }
    flag(ctx, 1.5, 1.5, lv >= 4 ? 110 : (lv >= 3 ? 94 : 58), team, 24);
  },
  ant_barracks: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 4, shade(STONE, 0.85), STONE_D);
    prism(ctx, isoRect(0.25, 0.25, 2.5, 2.5), 4, 24, shade(STONE, 0.95), STONE_D);
    gableRoof(ctx, 0.1, 0.1, 2.8, 2.8, 28, 16, [120, 60, 40], [90, 44, 30], 'y');
    doorAt(ctx, 2.75, 1.5, 4); windows(ctx, [[0.5, 2.75], [2.5, 2.75]], 18, 3);
    // training yard posts
    for (const p of [[0.35, 0.35], [2.65, 0.35]]) { const [sx, sy] = iso(p[0], p[1], 4); line(ctx, sx, sy, sx, sy - 18, rgb(WOOD_D), 2); }
    flag(ctx, 2.7, 0.3, 4, o.team, 30);
    // crossed spears sign
    const [sx, sy] = iso(2.8, 1.5, 22); line(ctx, sx - 5, sy - 6, sx + 5, sy + 4, rgb(METAL), 1.2); line(ctx, sx + 5, sy - 6, sx - 5, sy + 4, rgb(METAL), 1.2);
  },
  ant_stable: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 2, [150, 120, 80], [110, 88, 58]);
    prism(ctx, isoRect(0.2, 0.2, 1.7, 2.6), 2, 18, [200, 170, 120], [150, 120, 80]);
    gableRoof(ctx, 0.05, 0.05, 2.0, 2.9, 20, 14, [130, 110, 70], [96, 80, 50], 'y');
    // fence paddock
    const fence = [[2.0, 0.2], [2.85, 0.2], [2.85, 2.85], [2.0, 2.85]];
    for (let i = 0; i < 3; i++) { const a = fence[i], b = fence[i + 1]; const [ax, ay] = iso(a[0], a[1], 2), [bx, by] = iso(b[0], b[1], 2); line(ctx, ax, ay - 6, bx, by - 6, rgb(WOOD), 1.4); line(ctx, ax, ay - 3, bx, by - 3, rgb(WOOD), 1.4); for (let k = 0; k <= 3; k++) { const t = k / 3; const [px, py] = iso(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 2); line(ctx, px, py, px, py - 8, rgb(WOOD_D), 1.6); } }
    // hay
    const [hx, hy] = iso(2.4, 1.2, 2); ellipse(ctx, hx, hy - 3, 7, 4.5, rgb([215, 185, 90]), OUT, 0.7);
    // horse head sign
    const [sx, sy] = iso(1.9, 1.5, 15); ellipse(ctx, sx, sy, 4, 3, rgb([110, 75, 45]), OUT, 0.6);
    flag(ctx, 0.3, 0.3, 2, o.team, 32);
    doorAt(ctx, 1.9, 2.0, 2);
  },
  ant_siege: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 3, [150, 130, 100], [110, 95, 70]);
    prism(ctx, isoRect(0.2, 0.2, 2.6, 1.4), 3, 16, [170, 130, 80], [120, 90, 55]);
    gableRoof(ctx, 0.1, 0.1, 2.8, 1.6, 19, 12, [110, 80, 50], [80, 58, 36], 'x');
    // workyard: logs and a half-built catapult frame
    for (let i = 0; i < 3; i++) { const [lx, ly] = iso(0.5 + i * 0.12, 2.3, 3 + i * 4); ctx.save(); ctx.translate(lx, ly); ctx.rotate(-0.46); rrect(ctx, -2, -14, 4, 28, 1.5, rgb(WOOD), OUT, 0.6); ctx.restore(); }
    prism(ctx, isoRect(1.6, 1.9, 1.0, 0.1), 3, 6, WOOD, WOOD_D); prism(ctx, isoRect(1.6, 2.6, 1.0, 0.1), 3, 6, WOOD, WOOD_D);
    const [ax, ay] = iso(2.1, 2.3, 9); line(ctx, ax, ay, ax - 6, ay - 22, rgb(WOOD), 2.5); ellipse(ctx, ax - 6, ay - 22, 3, 3, rgb([110, 105, 95]), OUT, 0.6);
    flag(ctx, 2.8, 0.2, 3, o.team, 30);
  },
  ant_dock: (ctx, o) => {
    // pier on posts
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const [px, py] = iso(0.15 + i * 0.9, 0.15 + j * 0.9, 0); line(ctx, px, py + 4, px, py - 6, rgb(WOOD_D), 2.2); }
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 6, 3, [170, 130, 80], [120, 90, 55]);
    for (let i = 1; i < 12; i++) { const [ax, ay] = iso(0.05 + i * 0.24, 0.05, 9), [bx, by] = iso(0.05 + i * 0.24, 2.95, 9); line(ctx, ax, ay, bx, by, rgb([140, 105, 62]), 0.7); }
    prism(ctx, isoRect(0.3, 0.3, 1.5, 1.5), 9, 16, [200, 170, 120], [150, 120, 80]);
    gableRoof(ctx, 0.2, 0.2, 1.7, 1.7, 25, 11, [130, 70, 45], [96, 50, 32], 'x');
    // crane & boat under construction
    const [cx, cy] = iso(2.3, 0.6, 9); line(ctx, cx, cy, cx, cy - 34, rgb(WOOD_D), 2.5); line(ctx, cx, cy - 34, cx + 22, cy - 22, rgb(WOOD_D), 2); line(ctx, cx + 22, cy - 22, cx + 22, cy - 6, '#ddd', 0.8);
    const hull = [[1.4, 2.1], [2.7, 2.0], [2.9, 2.4], [2.7, 2.8], [1.4, 2.8], [1.2, 2.45]]; prism(ctx, hull, 9, 6, [150, 105, 60], [110, 70, 35]);
    // barrels, rope
    for (const b of [[2.5, 1.2], [2.7, 1.45]]) { const [bx, by] = iso(b[0], b[1], 9); rrect(ctx, bx - 3, by - 8, 6, 8, 2, rgb([120, 85, 45]), OUT, 0.6); }
    flag(ctx, 0.3, 0.3, 36, o.team, 20);
  },
  ant_tower: (ctx, o) => {
    const c = [[0.5, 0.08], [0.92, 0.5], [0.5, 0.92], [0.08, 0.5]];
    prism(ctx, isoRect(0.05, 0.05, 0.9, 0.9), 0, 3, shade(STONE, 0.85), STONE_D);
    prism(ctx, [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]], 3, 44, STONE, STONE_D);
    prism(ctx, isoRect(0.05, 0.05, 0.9, 0.9), 47, 6, shade(STONE, 1.05), STONE_D);
    // crenellations
    for (const p of [[0.1, 0.1], [0.5, 0.05], [0.9, 0.1], [0.95, 0.5], [0.9, 0.9], [0.5, 0.95], [0.1, 0.9], [0.05, 0.5]]) prism(ctx, isoRect(p[0] - 0.08, p[1] - 0.08, 0.16, 0.16), 53, 6, STONE, STONE_D);
    // arrow slits
    for (const z of [18, 32]) { const [sx, sy] = iso(0.85, 0.5, z); ctx.fillStyle = '#2a1a10'; ctx.fillRect(sx - 1, sy - 6, 2, 7); const [sx2, sy2] = iso(0.5, 0.85, z); ctx.fillRect(sx2 - 1, sy2 - 6, 2, 7); }
    const lv = o.level || 1;
    if (lv >= 2) { // wooden hoarding + second tier
      prism(ctx, isoRect(0.22, 0.22, 0.56, 0.56), 59, 14, shade(STONE, 1.08), STONE_D);
      for (const p of [[0.22, 0.22], [0.78, 0.22], [0.78, 0.78], [0.22, 0.78]]) prism(ctx, isoRect(p[0] - 0.06, p[1] - 0.06, 0.12, 0.12), 73, 5, STONE, STONE_D);
      for (const z of [64]) { const [sx, sy] = iso(0.78, 0.5, z); ctx.fillStyle = '#2a1a10'; ctx.fillRect(sx - 1, sy - 5, 2, 6); const [sx2, sy2] = iso(0.5, 0.78, z); ctx.fillRect(sx2 - 1, sy2 - 5, 2, 6); }
    }
    if (lv >= 3) { // brazier fire on top and iron bands
      const [bx, by] = iso(0.5, 0.5, 78); ellipse(ctx, bx, by - 2, 4, 2, rgb([60, 55, 50]), OUT, 0.6); ellipse(ctx, bx, by - 7, 3.5, 5, 'rgba(255,140,40,0.9)'); ellipse(ctx, bx, by - 9, 2, 3, 'rgba(255,230,150,0.95)');
      ctx.strokeStyle = 'rgba(40,40,45,0.7)'; ctx.lineWidth = 1.5; for (const z of [12, 40]) { const pts = [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]].map(p => iso(p[0], p[1], z)); ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); }
    }
    flag(ctx, 0.5, 0.5, lv >= 2 ? 78 : 59, o.team, 16);
  },
  ant_wall: (ctx, o) => {
    const M = o.mask; const m = M & 15; // bit 1: N (y-1), 2: E (x+1), 4: S (y+1), 8: W (x-1); 16 NE, 32 SE, 64 SW, 128 NW
    const h = 20;
    const cw = 0.5, c0 = 0.5 - cw / 2;
    const segs = wallSegs(M, cw);
    for (const s of segs) prism(ctx, s, 0, h, STONE, STONE_D);
    const pw = m === 0 || m === 5 || m === 10 ? cw : 0.62;
    prism(ctx, isoRect(0.5 - pw / 2, 0.5 - pw / 2, pw, pw), 0, h + (m === 5 || m === 10 ? 0 : 6), shade(STONE, 1.05), STONE_D);
    if (m === 5) { for (const y of [0.15, 0.5, 0.85]) prism(ctx, isoRect(0.5 - 0.1, y - 0.08, 0.2, 0.16), h, 4, STONE, STONE_D); }
    else if (m === 10) { for (const x of [0.15, 0.5, 0.85]) prism(ctx, isoRect(x - 0.08, 0.5 - 0.1, 0.16, 0.2), h, 4, STONE, STONE_D); }
    // stone lines
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6; for (let z = 5; z < h; z += 5) { const [ax, ay] = iso(0, 1, z), [bx, by] = iso(1, 1, z); if (m & 4 || m & 8) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); } }
  },
  // ---- houses (2x2) ----
  ant_house: (ctx, o) => {
    const lv = o.level || 1; const wall = lv >= 2 ? 26 : 16; // upgraded houses grow a storey
    prism(ctx, isoRect(0.08, 0.08, 1.84, 1.84), 0, 3, shade(STONE, 0.85), STONE_D);
    if (lv >= 3) { prism(ctx, isoRect(0.05, 1.05, 0.8, 0.85), 3, 12, shade(STONE, 0.92), STONE_D); gableRoof(ctx, 0.0, 1.0, 0.9, 0.95, 15, 7, ROOF, ROOF_D, 'y'); }
    prism(ctx, isoRect(0.2, 0.2, 1.6, 1.6), 3, wall, shade(STONE, 0.97), STONE_D);
    gableRoof(ctx, 0.1, 0.1, 1.8, 1.8, wall + 3, 12, ROOF, ROOF_D, 'x');
    doorAt(ctx, 1.0, 1.82, 3); windows(ctx, [[1.82, 0.5], [1.82, 1.5]], 12, 2); if (lv >= 2) windows(ctx, [[1.82, 0.5], [1.82, 1.5]], 22, 2);
    const [px, py] = iso(0.3, 1.7, 3); ellipse(ctx, px, py - 3, 5, 3, rgb([110, 130, 60]), OUT, 0.6); // garden bush
    const [ax, ay] = iso(1.7, 0.3, 3); rrect(ctx, ax - 3, ay - 8, 6, 8, 1.5, rgb([150, 110, 60]), OUT, 0.6); // amphora
  },
  ww2_house: (ctx, o) => {
    const lv = o.level || 1;
    prism(ctx, isoRect(0.08, 0.08, 1.84, 1.84), 0, 2, [110, 100, 80], [80, 72, 58]);
    if (lv >= 3) prism(ctx, isoRect(0.15, 1.62, 1.0, 0.3), 2, 8, shade(OLIVE, 0.9), OLIVE_D);
    prism(ctx, isoRect(0.15, 0.4, 1.7, 1.2), 2, lv >= 2 ? 18 : 12, OLIVE, OLIVE_D);
    if (lv >= 2) { const [px, py] = iso(1.6, 0.4, 30); rrect(ctx, px - 2, py - 10, 4, 10, 1, rgb([70, 70, 70]), OUT, 0.6); }
    for (let i = 0; i < 5; i++) { const t0 = i / 5, t1 = (i + 1) / 5; const y0 = 0.4 + 1.2 * t0, y1 = 0.4 + 1.2 * t1; const z0 = 14 + Math.sin(t0 * Math.PI) * 8, z1 = 14 + Math.sin(t1 * Math.PI) * 8; poly(ctx, [iso(0.1, y0, z0), iso(1.9, y0, z0), iso(1.9, y1, z1), iso(0.1, y1, z1)], rgb(shade([120, 125, 110], 0.8 + 0.4 * Math.sin((t0 + t1) / 2 * Math.PI))), OUT, 0.7); }
    doorAt(ctx, 1.85, 1.0, 2, [40, 40, 40]); windows(ctx, [[0.4, 1.62], [1.6, 1.62]], 9, 3, [50, 60, 60]);
    const [cx, cy] = iso(0.4, 0.4, 24); rrect(ctx, cx - 2, cy - 10, 4, 10, 1, rgb([70, 70, 70]), OUT, 0.6); // stove pipe
    const [bx, by] = iso(1.7, 0.2, 2); for (let i = 0; i < 3; i++) rrect(ctx, bx - 6 + i * 4, by - 3 - (i % 2) * 3, 5, 3, 1, rgb([120, 100, 60]), OUT, 0.5);
  },
  sf_house: (ctx, o) => {
    const lv = o.level || 1; const body = lv >= 2 ? 22 : 14;
    prism(ctx, isoRect(0.08, 0.08, 1.84, 1.84), 0, 2, shade(HULL_SF, 0.8), HULL_SF_D);
    prism(ctx, [[0.5, 0.2], [1.5, 0.2], [1.8, 1.0], [1.5, 1.8], [0.5, 1.8], [0.2, 1.0]], 2, body, HULL_SF, HULL_SF_D);
    if (lv >= 3) { const [mx, my] = iso(0.35, 0.35, body + 2); line(ctx, mx, my, mx, my - 18, '#8fa', 1.5); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(mx, my - 19, 2.2, 0, 7); ctx.fill(); }
    const [cx, cy] = iso(1.0, 1.0, body + 2); for (let i = 5; i >= 0; i--) { const k = i / 5; ellipse(ctx, cx, cy - (1 - k) * 12, 22 * k + 2, 11 * k + 1, rgb(shade(HULL_SF, 1 + (1 - k) * 0.22)), i === 5 ? OUT : null, 0.8); }
    ctx.fillStyle = GLOW; for (const z of [6, 11]) { const [sx, sy] = iso(1.8, 1.0, z); ctx.fillRect(sx - 4, sy - 1, 8, 1.5); const [sx2, sy2] = iso(1.0, 1.8, z); ctx.fillRect(sx2 - 4, sy2 - 1, 8, 1.5); }
    ctx.fillStyle = 'rgba(197,106,255,0.9)'; ctx.beginPath(); ctx.arc(cx, cy - 13, 2, 0, 7); ctx.fill();
  },
  // ---- sci-fi buildings ----
  sf_hall: (ctx, o) => {
    const hex = [[0.5, 0.05], [1.4, 0.05], [2.95, 1.5], [2.5, 2.95], [0.5, 2.95], [0.05, 1.5]];
    prism(ctx, hex, 0, 4, shade(HULL_SF, 0.8), HULL_SF_D);
    prism(ctx, hex.map(p => [1.5 + (p[0] - 1.5) * 0.78, 1.5 + (p[1] - 1.5) * 0.78]), 4, 26, HULL_SF, HULL_SF_D);
    prism(ctx, hex.map(p => [1.5 + (p[0] - 1.5) * 0.45, 1.5 + (p[1] - 1.5) * 0.45]), 30, 16, shade(HULL_SF, 1.1), HULL_SF_D);
    // glowing ring + antenna
    const [cx, cy] = iso(1.5, 1.5, 47); ctx.strokeStyle = GLOW; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 30, 15, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = GLOW_SOFT; ctx.lineWidth = 6; ctx.stroke();
    line(ctx, cx, cy, cx, cy - 36, rgb([80, 86, 100]), 2.5); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(cx, cy - 38, 3.5, 0, 7); ctx.fill();
    for (const z of [12, 22]) { for (const p of [[2.9, 1.5], [1.5, 2.9]]) { const [sx, sy] = iso(p[0], p[1], z); ctx.fillStyle = GLOW; ctx.fillRect(sx - 6, sy - 1, 12, 2); } }
    doorAt(ctx, 1.5, 2.6, 4, [40, 44, 56]);
    const lv = o.level || 1;
    if (lv >= 2) { // orbiting sensor drones around the ring
      for (let i = 0; i < 3; i++) { const a = i * 2.1; const [dx, dy] = iso(1.5 + Math.cos(a) * 1.1, 1.5 + Math.sin(a) * 1.1, 52); ellipse(ctx, dx, dy, 3.5, 2, rgb(HULL_SF), OUT, 0.6); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(dx, dy - 1, 1.2, 0, 7); ctx.fill(); }
    }
    if (lv >= 3) { // second hex tier + energy conduits
      prism(ctx, hex.map(p => [1.5 + (p[0] - 1.5) * 0.3, 1.5 + (p[1] - 1.5) * 0.3]), 46, 18, shade(HULL_SF, 1.15), HULL_SF_D);
      ctx.strokeStyle = GLOW; ctx.lineWidth = 1.5; for (const p of [[2.9, 1.5], [1.5, 2.9], [0.1, 1.5]]) { const [x0, y0] = iso(p[0], p[1], 4), [x1, y1] = iso(1.5 + (p[0] - 1.5) * 0.3, 1.5 + (p[1] - 1.5) * 0.3, 46); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    }
    if (lv >= 4) { // orbital uplink beam
      const [cx2, cy2] = iso(1.5, 1.5, 64); const grd = ctx.createLinearGradient(cx2, cy2, cx2, cy2 - 60); grd.addColorStop(0, 'rgba(120,230,255,0.55)'); grd.addColorStop(1, 'rgba(120,230,255,0)'); ctx.fillStyle = grd; ctx.fillRect(cx2 - 5, cy2 - 60, 10, 60);
      ctx.strokeStyle = 'rgba(197,106,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx2, cy2 - 6, 26, 13, 0, 0, Math.PI * 2); ctx.stroke();
    }
    flag(ctx, 0.6, 0.6, 30, o.team, 22);
  },
  sf_barracks: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 3, shade(HULL_SF, 0.8), HULL_SF_D);
    prism(ctx, isoRect(0.3, 0.3, 2.4, 2.4), 3, 18, HULL_SF, HULL_SF_D);
    // dome
    const [cx, cy] = iso(1.5, 1.5, 21); for (let i = 6; i >= 0; i--) { const k = i / 6; ellipse(ctx, cx, cy - (1 - k) * 22, 34 * k + 2, 17 * k + 1, rgb(shade(HULL_SF, 1 + (1 - k) * 0.25)), i === 6 ? OUT : null, 0.8); }
    ctx.fillStyle = 'rgba(90,225,255,0.5)'; ctx.beginPath(); ctx.ellipse(cx, cy - 22, 5, 2.5, 0, 0, 7); ctx.fill();
    // capsule pods along the front
    for (const x of [0.6, 1.5, 2.4]) { const [px, py] = iso(x, 2.85, 3); rrect(ctx, px - 5, py - 14, 10, 14, 4, rgb(shade(HULL_SF, 1.05)), OUT, 0.7); ctx.fillStyle = GLOW; ctx.fillRect(px - 3, py - 10, 6, 5); }
    flag(ctx, 2.8, 0.2, 3, o.team, 30);
  },
  sf_factory: (ctx, o) => {
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 0, 2, shade(HULL_SF, 0.75), HULL_SF_D);
    prism(ctx, isoRect(0.2, 0.2, 2.6, 2.6), 2, 24, shade(HULL_SF, 0.95), HULL_SF_D);
    // gantry rails + open hangar door with glow
    const [dx, dy] = iso(1.5, 2.82, 2); rrect(ctx, dx - 12, dy - 18, 24, 18, 2, rgb([30, 34, 44]), OUT, 0.8); ctx.fillStyle = 'rgba(90,225,255,0.25)'; ctx.fillRect(dx - 11, dy - 17, 22, 16); for (let i = 0; i < 4; i++) { ctx.fillStyle = GLOW; ctx.fillRect(dx - 11 + i * 6, dy - 3, 4, 1.5); }
    for (const p of [[0.3, 0.3], [2.7, 0.3], [2.7, 2.7], [0.3, 2.7]]) { const [px, py] = iso(p[0], p[1], 26); line(ctx, px, py, px, py - 16, rgb([80, 86, 100]), 2.5); }
    const [g0x, g0y] = iso(0.3, 0.3, 42), [g1x, g1y] = iso(2.7, 0.3, 42), [g2x, g2y] = iso(2.7, 2.7, 42), [g3x, g3y] = iso(0.3, 2.7, 42); line(ctx, g0x, g0y, g1x, g1y, rgb([90, 96, 110]), 3); line(ctx, g3x, g3y, g2x, g2y, rgb([90, 96, 110]), 3); line(ctx, g0x, g0y, g3x, g3y, rgb([90, 96, 110]), 2); line(ctx, g1x, g1y, g2x, g2y, rgb([90, 96, 110]), 2);
    ctx.fillStyle = GLOW; for (const z of [10, 18]) { const [sx, sy] = iso(2.82, 1.0, z); ctx.fillRect(sx - 4, sy - 1, 8, 2); const [sx2, sy2] = iso(2.82, 2.0, z); ctx.fillRect(sx2 - 4, sy2 - 1, 8, 2); }
    flag(ctx, 0.4, 2.6, 26, o.team, 22);
  },
  sf_lab: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 3, shade(HULL_SF, 0.8), HULL_SF_D);
    const oct = [[0.7, 0.2], [2.3, 0.2], [2.8, 0.7], [2.8, 2.3], [2.3, 2.8], [0.7, 2.8], [0.2, 2.3], [0.2, 0.7]];
    prism(ctx, oct, 3, 14, HULL_SF, HULL_SF_D);
    // glass dome with a floating core
    const [cx, cy] = iso(1.5, 1.5, 17); for (let i = 6; i >= 0; i--) { const k = i / 6; ellipse(ctx, cx, cy - (1 - k) * 24, 30 * k + 2, 15 * k + 1, `rgba(120,200,255,${0.12 + (1 - k) * 0.1})`, i === 6 ? 'rgba(160,220,255,0.6)' : null, 0.8); }
    ctx.fillStyle = 'rgba(197,106,255,0.95)'; ctx.beginPath(); ctx.arc(cx, cy - 12, 5, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(197,106,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy - 12, 12, 5, 0.4, 0, 7); ctx.stroke();
    // test walker on a pad
    ctx.save(); const [wx, wy] = iso(2.5, 2.5, 3); ctx.translate(wx, wy); ctx.scale(0.6, 0.6); walker(ctx, { dir: 2, team: o.team, anim: 'idle', frame: 0 }); ctx.restore();
    flag(ctx, 0.3, 0.3, 17, o.team, 26);
  },
  sf_dock: (ctx, o) => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const [px, py] = iso(0.4 + i * 1.1, 0.4 + j * 1.1, 0); line(ctx, px, py + 3, px, py - 8, rgb([70, 76, 90]), 2.5); ctx.fillStyle = GLOW; ctx.fillRect(px - 1, py - 9, 2, 2); }
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 8, 3, shade(HULL_SF, 0.95), HULL_SF_D);
    ctx.strokeStyle = GLOW; ctx.lineWidth = 1.5; const [a0x, a0y] = iso(0.15, 0.15, 11.5), [a1x, a1y] = iso(2.85, 0.15, 11.5), [a2x, a2y] = iso(2.85, 2.85, 11.5), [a3x, a3y] = iso(0.15, 2.85, 11.5); ctx.beginPath(); ctx.moveTo(a0x, a0y); ctx.lineTo(a1x, a1y); ctx.lineTo(a2x, a2y); ctx.lineTo(a3x, a3y); ctx.closePath(); ctx.stroke();
    prism(ctx, isoRect(0.3, 0.3, 1.4, 1.4), 11, 16, HULL_SF, HULL_SF_D);
    const [cx, cy] = iso(1.0, 1.0, 27); ellipse(ctx, cx, cy, 18, 9, rgb(shade(HULL_SF, 1.1)), OUT, 0.8); line(ctx, cx, cy, cx, cy - 22, rgb([80, 86, 100]), 2); ctx.fillStyle = 'rgba(255,90,90,0.95)'; ctx.beginPath(); ctx.arc(cx, cy - 24, 2.5, 0, 7); ctx.fill();
    ctx.save(); const [bx, by] = iso(2.2, 2.2, 11); ctx.translate(bx, by); ctx.scale(0.7, 0.7); hoverBoat(ctx, { dir: 1, team: o.team, anim: 'idle', frame: 0 }, 1); ctx.restore();
    flag(ctx, 0.3, 0.3, 27, o.team, 18);
  },
  sf_tower: (ctx, o) => {
    const lv = o.level || 1;
    prism(ctx, isoRect(0.05, 0.05, 0.9, 0.9), 0, 3, shade(HULL_SF, 0.8), HULL_SF_D);
    prism(ctx, [[0.3, 0.15], [0.7, 0.15], [0.85, 0.5], [0.7, 0.85], [0.3, 0.85], [0.15, 0.5]], 3, 36 + (lv - 1) * 10, HULL_SF, HULL_SF_D);
    const top = 39 + (lv - 1) * 10;
    for (let z = 8; z < top - 4; z += 9) { const [sx, sy] = iso(0.85, 0.5, z); ctx.fillStyle = GLOW; ctx.fillRect(sx - 3, sy - 1, 6, 1.5); const [sx2, sy2] = iso(0.5, 0.85, z); ctx.fillRect(sx2 - 3, sy2 - 1, 6, 1.5); }
    const [cx, cy] = iso(0.5, 0.5, top); ellipse(ctx, cx, cy, 12, 6, rgb(shade(HULL_SF, 1.1)), OUT, 0.8);
    for (let i = 0; i < (lv >= 3 ? 3 : 1); i++) { const ang = i * Math.PI * 2 / 3; const ox = Math.cos(ang) * (lv >= 3 ? 7 : 0), oy = Math.sin(ang) * (lv >= 3 ? 3.5 : 0); line(ctx, cx + ox, cy + oy, cx + ox, cy + oy - 10, rgb([80, 86, 100]), 2.5); ctx.fillStyle = GLOW_SOFT; ctx.beginPath(); ctx.arc(cx + ox, cy + oy - 12, 7, 0, 7); ctx.fill(); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(cx + ox, cy + oy - 12, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + ox - 1, cy + oy - 13, 1.4, 0, 7); ctx.fill(); }
    if (lv >= 2) { ctx.strokeStyle = GLOW; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 16, 8, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = rgb(o.team); const [tx, ty] = iso(0.5, 0.5, 20); ctx.fillRect(tx - 4, ty - 2, 8, 3);
  },
  sf_wall: (ctx, o) => {
    const M = o.mask; const h = 18; const cw = 0.3;
    const segs = wallSegs(M, cw);
    // pylon base + translucent energy panels
    for (const s of segs) prism(ctx, s, 0, 3, HULL_SF, HULL_SF_D);
    for (const s of segs) { const top = s.map(p => iso(p[0], p[1], h)), bot = s.map(p => iso(p[0], p[1], 3)); ctx.fillStyle = 'rgba(90,225,255,0.28)'; ctx.beginPath(); ctx.moveTo(bot[0][0], bot[0][1]); ctx.lineTo(bot[1][0], bot[1][1]); ctx.lineTo(top[1][0], top[1][1]); ctx.lineTo(top[0][0], top[0][1]); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(bot[3][0], bot[3][1]); ctx.lineTo(bot[2][0], bot[2][1]); ctx.lineTo(top[2][0], top[2][1]); ctx.lineTo(top[3][0], top[3][1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(160,240,255,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); ctx.lineTo(top[1][0], top[1][1]); ctx.lineTo(top[2][0], top[2][1]); ctx.lineTo(top[3][0], top[3][1]); ctx.closePath(); ctx.stroke(); }
    prism(ctx, isoRect(0.5 - 0.14, 0.5 - 0.14, 0.28, 0.28), 0, h + 5, shade(HULL_SF, 1.05), HULL_SF_D);
    const [px, py] = iso(0.5, 0.5, h + 5); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(px, py - 1, 2.2, 0, 7); ctx.fill();
  },
  sf_gate: (ctx, o) => {
    const M = o.mask; const h = 18; const cw = 0.3;
    const horiz = (M & 2) || (M & 8) || !((M & 1) || (M & 4));
    const segs = wallSegs(gateSegMask(M, horiz), cw); for (const s of segs) prism(ctx, s, 0, 3, HULL_SF, HULL_SF_D);
    const p = gatePillars(M, horiz);
    for (const [px, py] of p) { prism(ctx, isoRect(px - 0.12, py - 0.12, 0.24, 0.24), 0, h + 8, shade(HULL_SF, 1.05), HULL_SF_D); const [gx, gy] = iso(px, py, h + 8); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(gx, gy - 1, 2.4, 0, 7); ctx.fill(); }
    // open passage: faint dotted field
    const [a0x, a0y] = iso(p[0][0], p[0][1], 6), [a1x, a1y] = iso(p[1][0], p[1][1], 6); ctx.setLineDash([2, 4]); line(ctx, a0x, a0y, a1x, a1y, 'rgba(120,230,255,0.6)', 1); ctx.setLineDash([]);
  },
  ant_gate: (ctx, o) => {
    const M = o.mask; const h = 20; const cw = 0.5;
    const horiz = (M & 2) || (M & 8) || !((M & 1) || (M & 4)); // opening runs along the wall direction
    const segs = wallSegs(gateSegMask(M, horiz), cw); for (const s of segs) prism(ctx, s, 0, h, STONE, STONE_D);
    // two pillars with an arch/beam over the passage
    const p = gatePillars(M, horiz); const diag = gateDiag(M);
    for (const [px, py] of p) prism(ctx, isoRect(px - 0.13, py - 0.13, 0.26, 0.26), 0, h + 10, shade(STONE, 1.05), STONE_D);
    if (diag) { const [b0x, b0y] = iso(p[0][0], p[0][1], h + 8), [b1x, b1y] = iso(p[1][0], p[1][1], h + 8); line(ctx, b0x, b0y, b1x, b1y, rgb([120, 88, 46]), 5); line(ctx, b0x, b0y, b1x, b1y, rgb(WOOD_D), 1); }
    else { const beam = horiz ? isoRect(0.08, 0.5 - 0.12, 0.84, 0.24) : isoRect(0.5 - 0.12, 0.08, 0.24, 0.84); prism(ctx, beam, h + 4, 6, [120, 88, 46], WOOD_D); }
    // open wooden doors leaning inward
    const [dx, dy] = iso(0.5, 0.5, 0); ctx.fillStyle = rgb(WOOD); ctx.fillRect(dx - 12, dy - 14, 4, 14); ctx.fillRect(dx + 8, dy - 14, 4, 14);
    const [fx, fy] = iso(0.5, 0.5, h + 10); line(ctx, fx, fy, fx, fy - 12, '#3a2a1a', 1.2); poly(ctx, [[fx, fy - 12], [fx + 8, fy - 9.5], [fx, fy - 7]], rgb(o.team), OUT, 0.5);
  },
  ww2_gate: (ctx, o) => {
    const M = o.mask; const h = 16; const cw = 0.4;
    const horiz = (M & 2) || (M & 8) || !((M & 1) || (M & 4));
    const segs = wallSegs(gateSegMask(M, horiz), cw); for (const s of segs) prism(ctx, s, 0, h, CONCRETE, CONCRETE_D);
    const p = gatePillars(M, horiz);
    for (const [px, py] of p) prism(ctx, isoRect(px - 0.12, py - 0.12, 0.24, 0.24), 0, h + 4, shade(CONCRETE, 1.05), CONCRETE_D);
    // striped barrier pole, raised
    const [a0x, a0y] = iso(p[0][0], p[0][1], h + 4), [a1x, a1y] = iso(p[1][0], p[1][1], h + 4);
    const ex = a0x + (a1x - a0x) * 0.15, ey = a0y + (a1y - a0y) * 0.15 - 22;
    line(ctx, a0x, a0y, ex, ey, '#c8c8c8', 3); ctx.setLineDash([4, 4]); line(ctx, a0x, a0y, ex, ey, '#c0392b', 3); ctx.setLineDash([]);
    sandbags(ctx, horiz ? [[0.05, 0.15], [0.95, 0.15]] : [[0.15, 0.05], [0.15, 0.95]], 0);
  },
  ww2_hall: (ctx, o) => {
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 0, 3, shade(CONCRETE, 0.85), CONCRETE_D);
    prism(ctx, isoRect(0.2, 0.2, 2.6, 2.6), 3, 26, CONCRETE, CONCRETE_D);
    prism(ctx, isoRect(0.5, 0.5, 1.6, 1.6), 29, 14, shade(CONCRETE, 1.05), CONCRETE_D);
    windows(ctx, [[2.8, 0.5], [2.8, 2.5]], 20, 4, [40, 50, 60]); windows(ctx, [[0.5, 2.8], [2.5, 2.8]], 20, 4, [40, 50, 60]);
    doorAt(ctx, 1.5, 2.82, 3, [40, 40, 40]);
    // antenna & flag
    const [ax, ay] = iso(2.1, 0.6, 43); line(ctx, ax, ay, ax, ay - 30, '#333', 1.2); line(ctx, ax - 5, ay - 20, ax + 5, ay - 20, '#333', 1); line(ctx, ax - 3, ay - 26, ax + 3, ay - 26, '#333', 1);
    sandbags(ctx, [[0.0, 0.0], [3.0, 0.0], [3.0, 3.0], [0.0, 3.0]], 0);
    const lv = o.level || 1;
    if (lv >= 2) { // radar dish + searchlight
      const [rx, ry] = iso(0.7, 2.3, 43); line(ctx, rx, ry, rx, ry - 12, '#444', 2); ellipse(ctx, rx + 4, ry - 16, 7, 4, rgb([160, 165, 170]), OUT, 0.7); line(ctx, rx + 4, ry - 16, rx + 9, ry - 20, '#444', 1);
      const [lx, ly] = iso(2.4, 2.4, 43); rrect(ctx, lx - 3, ly - 8, 6, 8, 1, rgb([80, 84, 88]), OUT, 0.6); ellipse(ctx, lx, ly - 9, 3.5, 2, 'rgba(255,240,200,0.95)');
    }
    if (lv >= 3) { // second storey bunker + AA gun
      prism(ctx, isoRect(0.6, 0.6, 1.4, 1.4), 43, 14, shade(CONCRETE, 1.02), CONCRETE_D);
      const [gx, gy] = iso(2.2, 1.3, 43); line(ctx, gx, gy, gx, gy - 8, '#333', 3); line(ctx, gx, gy - 8, gx + 10, gy - 20, '#222', 2.2); line(ctx, gx, gy - 8, gx + 12, gy - 16, '#222', 2.2);
    }
    if (lv >= 4) { // command tower with big antenna array + flags
      prism(ctx, isoRect(0.95, 0.95, 0.7, 0.7), 57, 22, shade(CONCRETE, 1.08), CONCRETE_D);
      const [tx, ty] = iso(1.3, 1.3, 79); line(ctx, tx, ty, tx, ty - 34, '#333', 1.6); for (let i = 0; i < 4; i++) line(ctx, tx - 8 + i * 2, ty - 12 - i * 6, tx + 8 - i * 2, ty - 12 - i * 6, '#333', 1);
      ctx.fillStyle = 'rgba(255,60,60,0.95)'; ctx.beginPath(); ctx.arc(tx, ty - 35, 2, 0, 7); ctx.fill();
      for (const p of [[0.3, 0.3], [2.7, 2.7]]) flag(ctx, p[0], p[1], 43, o.team, 20);
    }
    flag(ctx, 0.9, 0.9, lv >= 3 ? 57 : 43, o.team, 24);
  },
  ww2_barracks: (ctx, o) => {
    prism(ctx, isoRect(0.1, 0.1, 2.8, 2.8), 0, 2, [110, 100, 80], [80, 72, 58]);
    prism(ctx, isoRect(0.2, 0.7, 2.6, 1.6), 2, 14, OLIVE, OLIVE_D);
    // curved corrugated roof (approximate with several strips)
    for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 1) / 6; const y0 = 0.7 + 1.6 * t0, y1 = 0.7 + 1.6 * t1; const z0 = 16 + Math.sin(t0 * Math.PI) * 12, z1 = 16 + Math.sin(t1 * Math.PI) * 12; poly(ctx, [iso(0.15, y0, z0), iso(2.85, y0, z0), iso(2.85, y1, z1), iso(0.15, y1, z1)], rgb(shade([120, 125, 110], 0.8 + 0.4 * Math.sin((t0 + t1) / 2 * Math.PI))), OUT, 0.7); }
    doorAt(ctx, 2.82, 1.5, 2, [40, 40, 40]); windows(ctx, [[0.5, 2.32], [2.5, 2.32]], 12, 4, [50, 60, 60]);
    // tents
    for (const x of [0.5, 1.5, 2.5]) { poly(ctx, [iso(x - 0.3, 0.15, 2), iso(x + 0.3, 0.15, 2), iso(x, 0.3, 14)], rgb([150, 140, 105]), OUT, 0.6); poly(ctx, [iso(x - 0.3, 0.55, 2), iso(x + 0.3, 0.55, 2), iso(x, 0.3, 14)], rgb([120, 110, 80]), OUT, 0.6); }
    flag(ctx, 0.25, 0.7, 2, o.team, 30);
  },
  ww2_factory: (ctx, o) => {
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 0, 2, shade(CONCRETE, 0.8), CONCRETE_D);
    prism(ctx, isoRect(0.2, 0.2, 2.6, 2.6), 2, 22, BRICK, BRICK_D);
    // sawtooth roof
    for (let i = 0; i < 3; i++) { const x0 = 0.2 + i * 0.87, x1 = x0 + 0.87; poly(ctx, [iso(x0, 0.2, 24), iso(x0, 2.8, 24), iso(x0 + 0.3, 2.8, 34), iso(x0 + 0.3, 0.2, 34)], rgb([80, 110, 130]), OUT, 0.6); poly(ctx, [iso(x0 + 0.3, 0.2, 34), iso(x0 + 0.3, 2.8, 34), iso(x1, 2.8, 24), iso(x1, 0.2, 24)], rgb([110, 105, 95]), OUT, 0.6); poly(ctx, [iso(x0, 2.8, 24), iso(x0 + 0.3, 2.8, 34), iso(x1, 2.8, 24)], rgb(BRICK_D), OUT, 0.6); }
    // chimney
    prism(ctx, isoRect(2.4, 0.4, 0.3, 0.3), 24, 30, BRICK, BRICK_D);
    // big door and windows
    const [dx, dy] = iso(1.5, 2.82, 2); rrect(ctx, dx - 9, dy - 14, 18, 14, 1, rgb([70, 70, 70]), OUT, 0.7); for (let i = 1; i < 4; i++) line(ctx, dx - 9, dy - 14 + i * 3.5, dx + 9, dy - 14 + i * 3.5, 'rgba(0,0,0,0.3)', 0.6);
    windows(ctx, [[2.82, 0.5], [2.82, 2.5]], 16, 4, [80, 110, 130]);
    flag(ctx, 0.35, 0.35, 24, o.team, 22);
  },
  ww2_artpark: (ctx, o) => {
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 0, 1.5, [110, 100, 78], [80, 72, 58]);
    sandbags(ctx, [[0.1, 0.1], [2.9, 0.1], [2.9, 2.9], [0.1, 2.9]], 1.5);
    // camo net on poles
    for (const p of [[0.4, 0.4], [2.6, 0.4], [2.6, 2.6], [0.4, 2.6]]) { const [px, py] = iso(p[0], p[1], 1.5); line(ctx, px, py, px, py - 26, rgb(WOOD_D), 1.6); }
    poly(ctx, [iso(0.3, 0.3, 27), iso(2.7, 0.3, 27), iso(2.7, 2.7, 27), iso(0.3, 2.7, 27)], 'rgba(90,110,60,0.55)', 'rgba(50,60,30,0.8)', 0.8);
    // crates & shells
    for (const c of [[0.8, 0.9], [1.2, 0.8], [0.9, 1.4]]) prism(ctx, isoRect(c[0], c[1], 0.3, 0.3), 1.5, 8, [140, 120, 80], [100, 85, 55]);
    for (let i = 0; i < 5; i++) { const [sx, sy] = iso(2.0 + i * 0.12, 2.3, 1.5); line(ctx, sx, sy, sx, sy - 9, rgb([120, 100, 60]), 2); }
    // a gun
    ctx.save(); const [gx, gy] = iso(1.8, 1.6, 1.5); ctx.translate(gx, gy); artillery(ctx, { dir: 1, team: o.team, anim: 'idle', frame: 0 }); ctx.restore();
    flag(ctx, 0.2, 0.2, 1.5, o.team, 34);
  },
  ww2_shipyard: (ctx, o) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const [px, py] = iso(0.15 + i * 0.9, 0.15 + j * 0.9, 0); line(ctx, px, py + 4, px, py - 6, rgb([70, 70, 70]), 2.2); }
    prism(ctx, isoRect(0.05, 0.05, 2.9, 2.9), 6, 3, CONCRETE, CONCRETE_D);
    prism(ctx, isoRect(0.2, 0.2, 1.4, 1.6), 9, 18, [110, 115, 120], [70, 74, 78]);
    poly(ctx, [iso(0.15, 0.15, 27), iso(1.65, 0.15, 27), iso(1.65, 1.85, 27), iso(0.15, 1.85, 27)], rgb([80, 84, 88]), OUT, 0.7);
    // gantry crane
    const [c0x, c0y] = iso(2.2, 0.3, 9), [c1x, c1y] = iso(2.2, 2.7, 9);
    line(ctx, c0x, c0y, c0x, c0y - 44, '#555', 2.5); line(ctx, c1x, c1y, c1x, c1y - 44, '#555', 2.5); line(ctx, c0x, c0y - 44, c1x, c1y - 44, '#666', 3); line(ctx, (c0x + c1x) / 2, (c0y + c1y) / 2 - 44, (c0x + c1x) / 2, (c0y + c1y) / 2 - 20, '#999', 0.8);
    // hull under construction
    const hull = [[1.5, 2.0], [2.8, 1.9], [2.95, 2.3], [2.8, 2.7], [1.5, 2.75], [1.3, 2.35]]; prism(ctx, hull, 9, 7, [128, 136, 142], [80, 86, 92]);
    flag(ctx, 0.3, 0.3, 27, o.team, 20);
  },
  ww2_bunker: (ctx, o) => {
    prism(ctx, isoRect(0.02, 0.02, 0.96, 0.96), 0, 2, shade(CONCRETE, 0.8), CONCRETE_D);
    const oct = [[0.25, 0.05], [0.75, 0.05], [0.95, 0.25], [0.95, 0.75], [0.75, 0.95], [0.25, 0.95], [0.05, 0.75], [0.05, 0.25]];
    prism(ctx, oct, 2, 16, CONCRETE, CONCRETE_D);
    prism(ctx, oct.map(p => [0.5 + (p[0] - 0.5) * 0.8, 0.5 + (p[1] - 0.5) * 0.8]), 18, 6, shade(CONCRETE, 1.08), CONCRETE_D);
    // slits
    for (const s of [[0.93, 0.5], [0.5, 0.93]]) { const [sx, sy] = iso(s[0], s[1], 12); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx - 5, sy - 2, 10, 2.4); }
    const [mx, my] = iso(0.9, 0.6, 12); line(ctx, mx, my, mx + 7, my + 3, '#222', 2);
    sandbags(ctx, [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], 0);
    const lv = o.level || 1;
    if (lv >= 2) { // steel cupola with a second MG
      prism(ctx, [[0.35, 0.3], [0.65, 0.3], [0.7, 0.5], [0.65, 0.7], [0.35, 0.7], [0.3, 0.5]], 24, 9, [90, 96, 100], [60, 64, 68]);
      const [gx, gy] = iso(0.68, 0.55, 29); line(ctx, gx, gy, gx + 9, gy + 3, '#222', 2.2);
    }
    if (lv >= 3) { // AT gun barrel + camo net + extra sandbag ring
      const [gx, gy] = iso(0.5, 0.72, 30); line(ctx, gx, gy, gx + 4, gy + 14, OUT, 4); line(ctx, gx, gy, gx + 4, gy + 14, '#4a4e48', 2.6);
      poly(ctx, [iso(0.05, 0.05, 36), iso(0.95, 0.05, 36), iso(0.95, 0.95, 36), iso(0.05, 0.95, 36)], 'rgba(90,110,60,0.45)', 'rgba(50,60,30,0.7)', 0.8);
      sandbags(ctx, [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]], 18);
    }
    flag(ctx, 0.5, 0.5, lv >= 2 ? 33 : 24, o.team, 14);
  },
  ww2_wall: (ctx, o) => {
    const M = o.mask; const m = M & 15; const h = 16; const cw = 0.4;
    const segs = wallSegs(M, cw);
    for (const s of segs) prism(ctx, s, 0, h, CONCRETE, CONCRETE_D);
    prism(ctx, isoRect(0.5 - 0.26, 0.5 - 0.26, 0.52, 0.52), 0, h + 3, shade(CONCRETE, 1.05), CONCRETE_D);
    // barbed wire on top
    ctx.strokeStyle = '#333'; ctx.lineWidth = 0.7;
    if (m & 2 || m & 8) { const [ax, ay] = iso(0, 0.5, h + 4), [bx, by] = iso(1, 0.5, h + 4); ctx.beginPath(); for (let t = 0; t <= 1; t += 0.1) ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t - Math.abs(Math.sin(t * 20)) * 2); ctx.stroke(); }
    if (m & 1 || m & 4) { const [ax, ay] = iso(0.5, 0, h + 4), [bx, by] = iso(0.5, 1, h + 4); ctx.beginPath(); for (let t = 0; t <= 1; t += 0.1) ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t - Math.abs(Math.sin(t * 20)) * 2); ctx.stroke(); }
  },
};

function constructionSite(ctx, w, h, progress, era) {
  if (era === 'scifi') { // holographic frame that materializes
    prism(ctx, isoRect(0.05, 0.05, w - 0.1, h - 0.1), 0, 2, shade(HULL_SF, 0.8), HULL_SF_D);
    const hh = 6 + progress * 26;
    const corners = [[0.15, 0.15], [w - 0.15, 0.15], [w - 0.15, h - 0.15], [0.15, h - 0.15]];
    for (const p of corners) { const [sx, sy] = iso(p[0], p[1], 2); line(ctx, sx, sy, sx, sy - hh, GLOW, 1.5); ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(sx, sy - hh, 2, 0, 7); ctx.fill(); }
    for (let z = 8; z < hh; z += 8) { const pts = corners.map(p => iso(p[0], p[1], 2 + z)); ctx.strokeStyle = 'rgba(120,230,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.stroke(); }
    if (progress > 0.2) { const k = (progress - 0.2) / 0.8; ctx.globalAlpha = 0.25 + k * 0.5; prism(ctx, isoRect(0.3, 0.3, w - 0.6, h - 0.6), 2, k * 18, HULL_SF, HULL_SF_D); ctx.globalAlpha = 1; }
    const [mx, my] = iso(w - 0.5, h - 0.4, 2); rrect(ctx, mx - 6, my - 8, 12, 8, 2, rgb([90, 96, 110]), OUT, 0.6); ctx.fillStyle = 'rgba(197,106,255,0.9)'; ctx.fillRect(mx - 3, my - 6, 6, 2);
    return;
  }
  // foundation + scaffold that grows with progress
  prism(ctx, isoRect(0.05, 0.05, w - 0.1, h - 0.1), 0, 2, era === 'ww2' ? [120, 110, 90] : [150, 130, 100], [100, 85, 60]);
  const stage = progress;
  if (stage > 0.05) {
    const hh = 30 * Math.min(1, stage / 0.8);
    for (const p of [[0.2, 0.2], [w - 0.2, 0.2], [w - 0.2, h - 0.2], [0.2, h - 0.2]]) { const [sx, sy] = iso(p[0], p[1], 2); line(ctx, sx, sy, sx, sy - hh, rgb(WOOD_D), 2); }
    for (let z = 10; z < hh; z += 10) { const pts = [[0.2, 0.2], [w - 0.2, 0.2], [w - 0.2, h - 0.2], [0.2, h - 0.2]].map(p => iso(p[0], p[1], 2 + z)); for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; line(ctx, a[0], a[1], b[0], b[1], rgb(WOOD), 1.2); } }
    // partial walls
    const wallH = Math.max(0, (stage - 0.15) / 0.7) * 20;
    if (wallH > 0) prism(ctx, isoRect(0.3, 0.3, w - 0.6, h - 0.6), 2, wallH, era === 'ww2' ? CONCRETE : STONE, era === 'ww2' ? CONCRETE_D : STONE_D);
  }
  // material pile
  const [mx, my] = iso(w - 0.5, h - 0.4, 2); for (let i = 0; i < 3; i++) rrect(ctx, mx - 8 + i * 2, my - 3 - i * 3, 12, 3, 1, rgb(WOOD), OUT, 0.5);
}

const BUILDING_BOX = { 3: [230, 250, 115, 130], 2: [160, 180, 80, 110], 1: [96, 140, 48, 100] };
/** Returns cached building sprite. mask: wall neighbor mask. stage: 'done' | construction progress bucket */
export function buildingSprite(sprite, w, h, colorIdx, built, progress, mask = 0, era = 'antiquity', level = 1) {
  const bucket = built ? 'done' : Math.floor(progress * 10);
  const key = `b|${sprite}|${colorIdx}|${bucket}|${mask}|${level}`;
  const box = BUILDING_BOX[w] || BUILDING_BOX[3];
  return cached(key, box[0], box[1], box[2], box[3], ctx => {
    ctx.translate(0, 0);
    if (!built) constructionSite(ctx, w, h, progress, era);
    else { const fn = BUILDING_DRAW[sprite]; if (fn) fn(ctx, { team: teamRgb(colorIdx), mask, level }); else prism(ctx, isoRect(0.1, 0.1, w - 0.2, h - 0.2), 0, 30, [200, 0, 200], [100, 0, 100]); }
  });
}

// ---------- resources & decoration ----------
/** endless centre resources: the normal sprite scaled up with a golden aura */
function bigVariant(base, key, k, glowColor) {
  return cached(key, base.w * k + 20, base.h * k + 10, base.ax * k + 10, base.ay * k + 6, ctx => {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, base.w * k * 0.55); g.addColorStop(0, glowColor); g.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, base.w * k * 0.55, base.w * k * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(base.canvas, -base.ax * k, -base.ay * k, base.w * k, base.h * k);
  });
}
export function treeSprite(variant, era, sway = 0, big = false) {
  if (big) return bigVariant(treeSprite(variant, era, sway, false), `tree-big|${era}|${variant}|${sway}`, 2.2, 'rgba(255,220,120,0.55)');
  const key = `tree|${era}|${variant}|${sway}`;
  return cached(key, 56, 72, 28, 66, ctx => {
    ellipse(ctx, 0, 0, 12, 6, 'rgba(0,0,0,0.3)');
    if (era === 'scrap' && variant >= 2) { // (unused) scrap piles
      const rust = [130, 80, 50], rustD = [90, 55, 35], grey = [110, 112, 115];
      ellipse(ctx, 0, -3, 15, 8, rgb([90, 80, 70]), OUT, 0.8);
      for (let i = 0; i < 7; i++) { const a = i * 1.7 + variant, r = 4 + (i % 3) * 3; const x = Math.cos(a) * r, y = -4 + Math.sin(a) * r * 0.5 - (i % 2) * 5; ctx.save(); ctx.translate(x, y); ctx.rotate(a * 0.7); rrect(ctx, -6, -3, 12, 6, 1, rgb(i % 2 ? rust : grey), OUT, 0.6); ctx.restore(); }
      // a wheel and a barrel
      ellipse(ctx, -8, -10, 5, 5, rgb([50, 50, 50]), OUT, 0.7); ellipse(ctx, -8, -10, 2, 2, rgb(grey), OUT, 0.4);
      rrect(ctx, 5, -20, 7, 11, 2, rgb(rustD), OUT, 0.6); line(ctx, 5, -16, 12, -16, rgb(rust), 1); line(ctx, 5, -12, 12, -12, rgb(rust), 1);
      return;
    }
    const sx = Math.sin(sway) * 2;
    const trunk = [110, 75, 40];
    if (era === 'scifi') { // alien fungus: pale stalk, glowing cap
      const capC = variant % 2 ? [190, 90, 240] : [90, 200, 230], stalk = [210, 200, 220];
      const hgt = 26 + variant * 5, cw = 14 + variant * 2;
      line(ctx, 0, 0, sx, -hgt, rgb(stalk), 5); line(ctx, 0, 0, sx, -hgt, rgb(shade(stalk, 0.8)), 1.5);
      for (let i = 0; i < 3; i++) { const y = -8 - i * 6; ellipse(ctx, sx * (i / 3) + (i % 2 ? 3 : -3), y, 2.2, 1.2, rgb(shade(stalk, 0.85)), OUT, 0.4); }
      ellipse(ctx, sx, -hgt, cw, cw * 0.55, rgb(shade(capC, 0.75)), OUT, 0.9);
      ellipse(ctx, sx, -hgt - 3, cw * 0.9, cw * 0.45, rgb(capC), OUT, 0.8);
      ellipse(ctx, sx - cw * 0.3, -hgt - 5, cw * 0.35, cw * 0.15, rgb(shade(capC, 1.5), 0.7));
      ctx.fillStyle = rgb(shade(capC, 1.7), 0.9); for (let i = 0; i < 5; i++) { const a = i * 1.3 + variant; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * cw * 0.55, -hgt - 2 + Math.sin(a) * cw * 0.22, 1.3, 0, 7); ctx.fill(); }
      // small glowing sprouts
      for (const dx of [-9, 8]) { line(ctx, dx, 0, dx + 1, -7, rgb(stalk), 2); ellipse(ctx, dx + 1, -8, 3, 1.8, rgb(capC), OUT, 0.5); }
      return;
    }
    if (variant === 1 || variant === 3) { // conifer
      line(ctx, 0, 0, sx, -20, rgb(trunk), 4);
      const g = era === 'ww2' ? [46, 82, 46] : [40, 100, 50];
      for (let i = 0; i < 4; i++) { const y = -12 - i * 12, w = 20 - i * 4; poly(ctx, [[sx * (i / 3) - w, y], [sx * (i / 3) + w, y], [sx * ((i + 1) / 3), y - 18]], rgb(shade(g, 0.85 + i * 0.1)), OUT, 0.8); poly(ctx, [[sx * (i / 3) - w * 0.6, y - 2], [sx * (i / 3), y - 4], [sx * ((i + 1) / 3), y - 17]], rgb(shade(g, 1.2), 0.5)); }
    } else { // broadleaf
      line(ctx, 0, 0, sx * 0.5, -22, rgb(trunk), 5);
      line(ctx, sx * 0.3, -14, sx * 0.3 - 7, -24, rgb(trunk), 2.5); line(ctx, sx * 0.3, -16, sx * 0.3 + 8, -26, rgb(trunk), 2.5);
      const g = era === 'ww2' ? [58, 96, 44] : [66, 130, 52];
      const blobs = variant === 0 ? [[0, -38, 18], [-11, -30, 12], [11, -31, 12], [0, -46, 11], [-6, -40, 9]] : [[0, -34, 16], [-12, -28, 10], [12, -27, 11], [-4, -44, 12], [8, -40, 9]];
      for (const [bx, by, r] of blobs) ellipse(ctx, bx + sx, by, r, r * 0.85, rgb(shade(g, 0.85)), OUT, 0.9);
      for (const [bx, by, r] of blobs) ellipse(ctx, bx + sx - r * 0.25, by - r * 0.25, r * 0.6, r * 0.5, rgb(shade(g, 1.2), 0.85));
      for (const [bx, by, r] of blobs) ellipse(ctx, bx + sx - r * 0.35, by - r * 0.35, r * 0.25, r * 0.2, rgb(shade(g, 1.5), 0.5));
    }
  });
}
export function mineSprite(era, depleted = 0, big = false) {
  if (big) return bigVariant(mineSprite(era, depleted, false), `mine-big|${era}|${depleted}`, 1.35, 'rgba(255,215,90,0.6)');
  const key = `mine|${era}|${depleted}`;
  return cached(key, 160, 160, 80, 115, ctx => {
    // 2x2 footprint, anchored at center (x=1,y=1 in tile units -> iso(0,0))
    ctx.translate(...iso(-1, -1, 0).map(v => v));
    if (era === 'scifi') { // glowing plasma crystal cluster
      prism(ctx, isoRect(0.1, 0.1, 1.8, 1.8), 0, 3, [80, 74, 100], [50, 46, 66]);
      const crystals = [[1.0, 1.0, 46, 9], [0.55, 0.75, 28, 6], [1.45, 0.7, 32, 7], [0.7, 1.45, 24, 6], [1.4, 1.4, 30, 6], [1.0, 0.45, 20, 5], [0.4, 1.1, 18, 4]];
      crystals.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      for (const [cx, cy, h, w] of crystals) { const [bx, by] = iso(cx, cy, 3); const tilt = (cx - 1) * 6; poly(ctx, [[bx - w, by], [bx - w * 0.6 + tilt, by - h], [bx + w * 0.2 + tilt, by - h - w * 0.4], [bx + w, by - 2]], 'rgba(120,220,255,0.85)', 'rgba(30,90,130,0.9)', 0.8); poly(ctx, [[bx - w * 0.6 + tilt, by - h], [bx + w * 0.2 + tilt, by - h - w * 0.4], [bx + w * 0.1 + tilt, by - h * 0.55], [bx - w * 0.3 + tilt * 0.5, by - h * 0.5]], 'rgba(220,250,255,0.75)'); }
      const g = ctx.createRadialGradient(...iso(1, 1, 8), 0, ...iso(1, 1, 8), 40); g.addColorStop(0, 'rgba(90,225,255,0.35)'); g.addColorStop(1, 'rgba(90,225,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(...iso(1, 1, 8), 40, 0, 7); ctx.fill();
      const [ex, ey] = iso(1.6, 1.6, 3); rrect(ctx, ex - 6, ey - 8, 12, 8, 2, rgb([90, 96, 110]), OUT, 0.6); ctx.fillStyle = GLOW; ctx.fillRect(ex - 3, ey - 6, 6, 2);
      return;
    }
    if (era === 'ww2') {
      prism(ctx, isoRect(0.1, 0.1, 1.8, 1.8), 0, 2, [60, 55, 50], [40, 36, 32]);
      // oil pool
      ellipse(ctx, ...iso(1.35, 1.35, 2), 22, 11, 'rgba(20,18,20,0.9)'); ellipse(ctx, ...iso(1.2, 1.25, 2), 8, 3, 'rgba(90,80,110,0.5)');
      // derrick tower
      const [bx, by] = iso(0.7, 0.7, 2);
      for (const [ox, oy] of [[-10, 0], [10, 0], [0, -5], [0, 5]]) line(ctx, bx + ox, by + oy, bx, by - 58, '#4a3a2a', 2);
      for (let z = 12; z < 56; z += 12) { const k = 1 - z / 62; line(ctx, bx - 10 * k, by - z, bx + 10 * k, by - z, '#5a4a3a', 1.2); line(ctx, bx - 10 * k, by - z, bx + 10 * k, by - z - 12 * 0.9, '#5a4a3a', 0.8); }
      rrect(ctx, bx - 6, by - 62, 12, 5, 1, '#3a2a1a', OUT, 0.6);
      // pump jack
      const [px, py] = iso(1.5, 0.6, 2); line(ctx, px, py, px, py - 18, '#444', 3); line(ctx, px - 14, py - 14, px + 12, py - 22, '#666', 3); ellipse(ctx, px - 14, py - 14, 5, 4, '#555', OUT, 0.6); line(ctx, px + 12, py - 22, px + 12, py - 4, '#777', 1.5);
    } else {
      // rocky mound with entrance and gold veins
      const rockC = [128, 118, 100], rockD = [88, 80, 66];
      const mound = [[0.15, 0.3], [0.6, 0.05], [1.5, 0.05], [1.95, 0.5], [1.9, 1.5], [1.5, 1.95], [0.5, 1.9], [0.05, 1.3]];
      prism(ctx, mound, 0, 14, rockC, rockD);
      prism(ctx, [[0.5, 0.5], [1.3, 0.35], [1.7, 0.9], [1.4, 1.5], [0.6, 1.4]], 14, 14, shade(rockC, 1.05), rockD);
      prism(ctx, [[0.8, 0.7], [1.3, 0.7], [1.3, 1.1], [0.8, 1.1]], 28, 8, shade(rockC, 1.1), rockD);
      // entrance
      const [ex, ey] = iso(1.55, 1.55, 4); ctx.fillStyle = '#1a140c'; ctx.beginPath(); ctx.moveTo(ex - 9, ey + 2); ctx.lineTo(ex - 9, ey - 8); ctx.quadraticCurveTo(ex, ey - 18, ex + 9, ey - 8); ctx.lineTo(ex + 9, ey + 2); ctx.closePath(); ctx.fill();
      line(ctx, ex - 10, ey + 2, ex - 10, ey - 9, rgb(WOOD_D), 2.5); line(ctx, ex + 10, ey + 2, ex + 10, ey - 9, rgb(WOOD_D), 2.5); line(ctx, ex - 11, ey - 9, ex + 11, ey - 9, rgb(WOOD_D), 2.5);
      // gold specks
      ctx.fillStyle = '#f2c94c'; for (let i = 0; i < 14; i++) { const [gx, gy] = iso(0.3 + ((i * 7) % 13) / 10, 0.3 + ((i * 5) % 11) / 8, 10 + (i % 4) * 8); ctx.fillRect(gx, gy, 2.2, 1.6); }
      ctx.fillStyle = '#fff2b0'; for (let i = 0; i < 6; i++) { const [gx, gy] = iso(0.5 + ((i * 3) % 7) / 6, 0.4 + ((i * 5) % 9) / 8, 14 + (i % 3) * 9); ctx.fillRect(gx, gy, 1.2, 1); }
      // cart
      const [cx, cy] = iso(0.35, 1.7, 0); rrect(ctx, cx - 6, cy - 9, 12, 6, 1, rgb(WOOD), OUT, 0.6); ellipse(ctx, cx - 4, cy - 2, 2.5, 2.5, '#333', OUT, 0.5); ellipse(ctx, cx + 4, cy - 2, 2.5, 2.5, '#333', OUT, 0.5); ellipse(ctx, cx, cy - 10, 5, 2.5, '#e8c04a', OUT, 0.5);
    }
  });
}
export function decoSprite(kind, v, era) {
  const key = `deco|${era}|${kind}|${Math.floor(v * 4)}`;
  return cached(key, 30, 24, 15, 20, ctx => {
    if (era === 'scifi' && kind === 0) { // alien tendrils
      ellipse(ctx, 0, 0, 7, 3.5, 'rgba(0,0,0,0.2)'); for (let i = 0; i < 4; i++) { const a = -1.2 + i * 0.8 + v; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a) * 6, -8, Math.cos(a) * 8, -14); ctx.strokeStyle = rgb([120, 90, 170]); ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = 'rgba(197,106,255,0.9)'; ctx.beginPath(); ctx.arc(Math.cos(a) * 8, -14, 1.6, 0, 7); ctx.fill(); }
      return;
    }
    if (era === 'scifi' && kind === 1) { // glowing mineral shard
      ellipse(ctx, 0, 0, 7, 3.5, 'rgba(0,0,0,0.25)'); poly(ctx, [[-5, 0], [-2, -9], [3, -11], [6, -2], [3, 2]], rgb([100, 92, 130]), OUT, 0.8); poly(ctx, [[-2, -9], [3, -11], [2, -4]], 'rgba(120,220,255,0.7)');
      return;
    }
    if (kind === 0) { // bush
      const g = era === 'ww2' ? [70, 100, 50] : [80, 140, 60];
      ellipse(ctx, 0, 0, 8, 4, 'rgba(0,0,0,0.2)'); ellipse(ctx, -3, -4, 6, 5, rgb(shade(g, 0.9)), OUT, 0.6); ellipse(ctx, 3, -5, 6, 5, rgb(g), OUT, 0.6); ellipse(ctx, 0, -8, 5, 4, rgb(shade(g, 1.2)), OUT, 0.6);
    } else if (kind === 1) { // rock
      ellipse(ctx, 0, 0, 8, 4, 'rgba(0,0,0,0.25)'); poly(ctx, [[-7, -1], [-4, -7], [3, -9], [8, -3], [6, 1], [-4, 2]], rgb([135, 130, 120]), OUT, 0.8); poly(ctx, [[-4, -6], [2, -8], [5, -4], [-2, -3]], rgb([170, 165, 155]));
    } else { // shell / driftwood on sand
      ellipse(ctx, 0, 0, 6, 2.5, 'rgba(0,0,0,0.15)'); ctx.save(); ctx.rotate(v * 3); rrect(ctx, -7, -3, 14, 3.5, 1.5, rgb([160, 130, 90]), OUT, 0.6); ctx.restore();
    }
  });
}

// ---------- icons for command card / portraits ----------
export function iconCanvas(drawFn, size = 64) {
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2; const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawFn(ctx, size); return c;
}
export function unitPortrait(sprite, colorIdx, size, extra = {}) {
  return iconCanvas((ctx, s) => {
    const spr = unitSprite(sprite, colorIdx, 2, 'idle', 0, extra);
    const scale = Math.min((s * 0.9) / spr.w, (s * 0.9) / spr.h) * 1.15;
    ctx.translate(s / 2, s / 2 + spr.h * scale * 0.35); ctx.scale(scale, scale); ctx.drawImage(spr.canvas, -spr.ax, -spr.ay, spr.w, spr.h);
  }, size);
}
export function buildingPortrait(sprite, w, h, colorIdx, size, era, level = 1) {
  return iconCanvas((ctx, s) => {
    const spr = buildingSprite(sprite, w, h, colorIdx, true, 1, w === 1 ? 10 : 0, era, level);
    const scale = Math.min((s * 0.95) / spr.w, (s * 0.95) / spr.h);
    ctx.translate(s / 2, s / 2); ctx.scale(scale, scale); ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  }, size);
}
export function actionIcon(kind, size = 64, color = '#e8c04a') {
  return iconCanvas((ctx, s) => {
    ctx.translate(s / 2, s / 2); const r = s * 0.32;
    switch (kind) {
      case 'unload': ctx.fillStyle = '#8b6a3a'; ctx.beginPath(); ctx.moveTo(-r, -r * 0.1); ctx.lineTo(r, -r * 0.1); ctx.lineTo(r * 0.7, r * 0.6); ctx.lineTo(-r * 0.7, r * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r * 0.2); ctx.moveTo(-r * 0.4, -r * 0.3); ctx.lineTo(0, r * 0.2); ctx.lineTo(r * 0.4, -r * 0.3); ctx.stroke(); break;
      case 'warcry': ctx.strokeStyle = '#f1d36a'; ctx.lineWidth = 3; for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 1 - i * 0.22; ctx.beginPath(); ctx.arc(-r * 0.3, 0, r * 0.35 * i, -0.9, 0.9); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = '#e0c060'; ctx.beginPath(); ctx.moveTo(-r, -r * 0.5); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r, r * 0.5); ctx.closePath(); ctx.fill(); break;
      case 'research_atk': ctx.strokeStyle = '#e04040'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r, r); ctx.lineTo(r * 0.5, -r * 0.5); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6); ctx.stroke(); ctx.strokeStyle = '#f1d36a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.9, r * 0.9); ctx.lineTo(r * 0.9, r * 0.1); ctx.moveTo(r * 0.9, r * 0.1); ctx.lineTo(r * 0.5, r * 0.5); ctx.moveTo(r * 0.9, r * 0.1); ctx.lineTo(r * 1.3, r * 0.5); ctx.stroke(); break;
      case 'research_arm': ctx.fillStyle = '#7f95b3'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, -r * 0.6); ctx.lineTo(r * 0.7, r * 0.3); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, r * 0.3); ctx.lineTo(-r * 0.8, -r * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#f1d36a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, r * 0.5); ctx.lineTo(0, -r * 0.4); ctx.moveTo(0, -r * 0.4); ctx.lineTo(-r * 0.35, 0); ctx.moveTo(0, -r * 0.4); ctx.lineTo(r * 0.35, 0); ctx.stroke(); break;
      case 'patrol': ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r, r * 0.6); ctx.lineTo(r * 0.7, r * 0.6); ctx.moveTo(r, -r * 0.6); ctx.lineTo(-r * 0.7, -r * 0.6); ctx.stroke(); ctx.fillStyle = '#8fd0ff'; ctx.beginPath(); ctx.moveTo(r, r * 0.6); ctx.lineTo(r * 0.55, r * 0.2); ctx.lineTo(r * 0.55, r); ctx.fill(); ctx.beginPath(); ctx.moveTo(-r, -r * 0.6); ctx.lineTo(-r * 0.55, -r); ctx.lineTo(-r * 0.55, -r * 0.2); ctx.fill(); break;
      case 'upgrade': ctx.strokeStyle = '#f1d36a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.5); ctx.lineTo(0, -r * 0.3); ctx.lineTo(r * 0.7, r * 0.5); ctx.moveTo(-r * 0.7, r * 1.0); ctx.lineTo(0, r * 0.2); ctx.lineTo(r * 0.7, r * 1.0); ctx.stroke(); ctx.fillStyle = '#f1d36a'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.35, -r * 0.45); ctx.lineTo(-r * 0.35, -r * 0.45); ctx.fill(); break;
      case 'gate': ctx.fillStyle = '#b8a98a'; ctx.fillRect(-r, -r * 0.6, r * 0.45, r * 1.6); ctx.fillRect(r * 0.55, -r * 0.6, r * 0.45, r * 1.6); ctx.fillRect(-r, -r * 0.9, r * 2, r * 0.35); ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.moveTo(-r * 0.5, r); ctx.lineTo(-r * 0.5, -r * 0.1); ctx.quadraticCurveTo(0, -r * 0.7, r * 0.5, -r * 0.1); ctx.lineTo(r * 0.5, r); ctx.fill(); ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r); ctx.stroke(); break;
      case 'demolish': ctx.fillStyle = '#8a8078'; ctx.beginPath(); ctx.moveTo(-r, r * 0.6); ctx.lineTo(-r * 0.6, -r * 0.2); ctx.lineTo(0, r * 0.1); ctx.lineTo(r * 0.5, -r * 0.5); ctx.lineTo(r, r * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#e04040'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.9); ctx.lineTo(r * 0.2, -r * 0.1); ctx.moveTo(r * 0.2, -r * 0.9); ctx.lineTo(-r * 0.8, -r * 0.1); ctx.stroke(); break;
      case 'move': ctx.strokeStyle = '#8fdc7a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r, r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.1); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.1, -r * 0.6); ctx.stroke(); break;
      case 'stop': ctx.fillStyle = '#e06060'; ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4, 4); ctx.fill(); break;
      case 'hold': ctx.strokeStyle = '#e0c060'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#e0c060'; ctx.beginPath(); ctx.roundRect(-r * 0.15, -r * 0.5, r * 0.3, r); ctx.fill(); break;
      case 'attack': ctx.strokeStyle = '#e04040'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r, r); ctx.lineTo(r * 0.7, -r * 0.7); ctx.moveTo(-r * 0.6, r * 0.4); ctx.lineTo(-r * 0.2, r * 0.8); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.5); ctx.lineTo(r * 0.8, -r * 0.8); ctx.stroke(); break;
      case 'amove': ctx.strokeStyle = '#e07040'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r, r * 0.8); ctx.lineTo(r * 0.5, -r * 0.5); ctx.stroke(); ctx.fillStyle = '#e07040'; ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.8); ctx.lineTo(r * 0.8, -r * 0.1); ctx.lineTo(r * 0.1, -r * 0.8); ctx.fill(); break;
      case 'gather': ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.2, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.8); ctx.lineTo(r * 0.8, -r * 0.8); ctx.stroke(); break;
      case 'build': ctx.strokeStyle = '#d8b07a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.8); ctx.lineTo(r * 0.4, -r * 0.3); ctx.stroke(); ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.roundRect(r * 0.1, -r * 0.9, r * 0.8, r * 0.5, 3); ctx.fill(); break;
      case 'cancel': ctx.strokeStyle = '#e04040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.7); ctx.lineTo(r * 0.7, r * 0.7); ctx.moveTo(r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); ctx.stroke(); break;
      case 'rally': ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.5, r); ctx.lineTo(-r * 0.5, -r); ctx.stroke(); ctx.fillStyle = '#e0c060'; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r); ctx.lineTo(r * 0.8, -r * 0.6); ctx.lineTo(-r * 0.5, -r * 0.2); ctx.fill(); break;
      case 'back': ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.7); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, r * 0.7); ctx.stroke(); break;
      case 'repair': ctx.strokeStyle = '#aaa'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.7); ctx.lineTo(r * 0.3, -r * 0.3); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.5, r * 0.4, 0, Math.PI * 2); ctx.stroke(); break;
    }
  }, size);
}
