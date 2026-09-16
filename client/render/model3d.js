// Jointed low-poly humanoid rendered by a tiny software rasteriser (flat shading + outline), baked into the sprite cache.
// Coordinates: y up, ground y = 0, the model faces +z at yaw 0; the isometric camera sits at +z above (tilt atan 0.5 like the tiles).
// Poses drive hips, knees, shoulders, elbows and wrists; weapons hang off the right hand, shields off the left forearm.

import { isPixel } from './style.js';
const SKIN = [232, 190, 150], IRON = [152, 158, 166], IRON_D = [92, 98, 108], BRONZE = [188, 142, 64], BRONZE_D = [122, 88, 36], STEEL = [222, 226, 234], WOOD = [130, 88, 46], WOOD_D = [86, 56, 28], LEATHER = [110, 74, 40], LEATHER_D = [70, 46, 24], GOLD = [232, 194, 84], HAIR = [74, 46, 24], CYAN = [90, 225, 255];
const shade = (c, k) => [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k)), ...(c.length > 3 ? [c[3]] : [])];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ---------- geometry ----------
const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
const mv = (p, x, y, z) => [p[0] + x, p[1] + y, p[2] + z];
const xf = (faces, fn) => { for (const f of faces) f.pts = f.pts.map(fn); return faces; };
/** positive = forward (+z) for a part hanging down from its joint */
const swing = (faces, a) => xf(faces, p => rotX(p, -a));
function box(cx, cy, cz, w, h, d, color) { const P = []; for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) P.push([cx + sx * w / 2, cy + sy * h / 2, cz + sz * d / 2]); return [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]].map(f => ({ pts: f.map(i => P[i]), color })); }
function cyl(cx, cy, cz, r, h, color, n = 7, rTop = r, caps = true) { const F = []; const ring = (rr, y) => { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push([cx + Math.cos(t) * rr, y, cz + Math.sin(t) * rr]); } return a; }; const B = ring(r, cy - h / 2), T = ring(rTop, cy + h / 2); for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push({ pts: [B[i], B[j], T[j], T[i]], color }); } if (caps) { F.push({ pts: T, color }); F.push({ pts: B.slice().reverse(), color }); } return F; }
function sph(cx, cy, cz, r, color, n = 5, keep = null) { const F = []; for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) { const t0 = i / n * Math.PI, t1 = (i + 1) / n * Math.PI, p0 = j / (n * 2) * Math.PI * 2, p1 = (j + 1) / (n * 2) * Math.PI * 2; const pt = (t, p) => [cx + Math.sin(t) * Math.cos(p) * r, cy + Math.cos(t) * r, cz + Math.sin(t) * Math.sin(p) * r]; const f = { pts: [pt(t0, p0), pt(t0, p1), pt(t1, p1), pt(t1, p0)], color }; if (!keep || f.pts.every(keep)) F.push(f); } return F; }
/** curved plate: part of a vertical cylinder wall of radius r around (cx,*,cz), angles a0..a1 in the xz plane */
function arcPlate(cx, cy, cz, r, h, a0, a1, thick, color, n = 6, rim = null) { const F = []; for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; const o = [Math.cos(t0) * r, Math.sin(t0) * r], p = [Math.cos(t1) * r, Math.sin(t1) * r], o2 = [Math.cos(t0) * (r + thick), Math.sin(t0) * (r + thick)], p2 = [Math.cos(t1) * (r + thick), Math.sin(t1) * (r + thick)]; const c2 = rim && (i === 0 || i === n - 1) ? rim : color; F.push({ pts: [[cx + o2[0], cy - h / 2, cz + o2[1]], [cx + p2[0], cy - h / 2, cz + p2[1]], [cx + p2[0], cy + h / 2, cz + p2[1]], [cx + o2[0], cy + h / 2, cz + o2[1]]], color: c2 }); F.push({ pts: [[cx + o[0], cy + h / 2, cz + o[1]], [cx + p[0], cy + h / 2, cz + p[1]], [cx + p[0], cy - h / 2, cz + p[1]], [cx + o[0], cy - h / 2, cz + o[1]]], color: shade(color, 0.7) }); F.push({ pts: [[cx + o[0], cy + h / 2, cz + o[1]], [cx + o2[0], cy + h / 2, cz + o2[1]], [cx + p2[0], cy + h / 2, cz + p2[1]], [cx + p[0], cy + h / 2, cz + p[1]]], color: rim || color }); F.push({ pts: [[cx + o[0], cy - h / 2, cz + o[1]], [cx + p[0], cy - h / 2, cz + p[1]], [cx + p2[0], cy - h / 2, cz + p2[1]], [cx + o2[0], cy - h / 2, cz + o2[1]]], color: rim || color }); } return F; }
/** flat disc with its axis along x (a shield face), centred at the origin */
function discX(r, thick, color, n = 10, rim = null) { const F = cyl(0, 0, 0, r, thick, color, n); for (const f of F) f.pts = f.pts.map(p => rotZ(p, Math.PI / 2)); if (rim) for (let i = 0; i < n; i++) F[i].color = rim; return F; }

// ---------- poses ----------
// arm: up = forward swing of the upper arm, fore = elbow bend (forward), out = abduction, wrist = rotation of the held item in the forearm frame
const wristFor = (A, theta) => theta - A.fore + A.up; // theta: item angle from "down" towards "forward" (π/2 = forward, π = up)
const ARM_REST = { up: -0.1, fore: 0.55, out: 0.5 };
function poseWalk(t) { const p = t * Math.PI * 2; const s = Math.sin(p), c = Math.cos(p);
  const leg = ph => { const sp = Math.sin(ph); return { thigh: 0.62 * sp, knee: 0.25 + 0.55 * Math.max(0, Math.sin(ph - 0.4)) }; };
  return { bob: -Math.abs(s) * 0.4, lean: 0.06, legL: leg(p), legR: leg(p + Math.PI), armL: { up: -0.35 * s, fore: 0.5, out: 0.15 }, armR: { up: 0.45 * s - 0.2, fore: 0.9, out: 0.45 }, cape: 0.35 + 0.25 * c, crest: 0.15 * s, headNod: 0.03 * Math.sin(2 * p) }; }
function poseIdle(t) { const b = Math.sin(t * Math.PI * 2); return { bob: b * 0.08, lean: 0, legL: { thigh: 0.05, knee: 0.08 }, legR: { thigh: -0.05, knee: 0.08 }, armL: { up: -0.05, fore: 0.5, out: 0.15 }, armR: { ...ARM_REST, up: ARM_REST.up + b * 0.03, fore: ARM_REST.fore + b * 0.05 }, cape: 0.15, crest: 0, headNod: b * 0.015 }; }
function poseThrust(t) { let w, th; if (t < 0.35) { w = ease(t / 0.35); th = 0; } else if (t < 0.55) { const k = ease((t - 0.35) / 0.2); w = 1 - k; th = k; } else { w = 0; th = 1 - ease((t - 0.55) / 0.45); }
  return { bob: -th * 0.25, lean: 0.03 + th * 0.17 - w * 0.06, legL: { thigh: 0.05 + 0.5 * th, knee: 0.1 + 0.4 * th }, legR: { thigh: -0.05 - 0.35 * th, knee: 0.12 + 0.1 * th }, armL: { up: -0.2 - th * 0.2 + w * 0.1, fore: 0.6, out: 0.15 }, armR: { up: -0.1 - 0.7 * w + 2.1 * th, fore: lerp(0.55 + 1.0 * w, 0.1, th), out: 0.5 * (1 - th) + 0.1 * th, thrust: th, windup: w }, cape: 0.2 + th * 0.25, crest: -th * 0.12 + w * 0.05, headNod: th * 0.05 }; }
function poseSwing(t) { let w, th; if (t < 0.4) { w = ease(t / 0.4); th = 0; } else if (t < 0.6) { const k = ease((t - 0.4) / 0.2); w = 1 - k; th = k; } else { w = 0; th = 1 - ease((t - 0.6) / 0.4); }
  return { bob: -th * 0.2, lean: 0.02 + th * 0.2 - w * 0.08, legL: { thigh: 0.05 + 0.3 * th, knee: 0.1 + 0.3 * th }, legR: { thigh: -0.05 - 0.2 * th, knee: 0.12 }, armL: { up: -0.15 + th * 0.4, fore: 0.6, out: 0.2 }, armR: { up: 0.2 + 2.0 * w - 0.4 * th, fore: 0.3 + 1.1 * w + 0.6 * th, out: 0.35, swing: th, windup: w }, cape: 0.2 + th * 0.2, crest: w * 0.08 - th * 0.1, headNod: th * 0.06 }; }
function poseAim(t, kick) { const k = kick ? Math.max(0, 1 - Math.abs(t - 0.3) / 0.2) : 0;
  return { bob: 0, lean: 0.08 - k * 0.05, legL: { thigh: 0.25, knee: 0.15 }, legR: { thigh: -0.2, knee: 0.1 }, armL: { up: 1.35, fore: 0.55, out: -0.15 }, armR: { up: 1.25 - k * 0.15, fore: 0.35, out: 0.05, kick: k }, cape: 0.15, crest: 0, headNod: 0.02 }; }
function poseBow(t) { const draw = t < 0.5 ? ease(t / 0.5) : Math.max(0, 1 - ease((t - 0.5) / 0.2)); return { bob: 0, lean: 0.04, legL: { thigh: 0.2, knee: 0.15 }, legR: { thigh: -0.2, knee: 0.1 }, armL: { up: 1.45, fore: 0.1, out: 0.05 }, armR: { up: 1.3 - draw * 0.5, fore: 0.4 + draw * 1.3, out: 0.35, draw }, cape: 0.15, crest: 0, headNod: 0 }; }
function poseRider(P) { return { ...P, legL: { thigh: 1.15, knee: 1.35 }, legR: { thigh: 1.15, knee: 1.35 }, bob: 0, lean: 0.02 }; }
const GUNS = new Set(['rifle', 'mg', 'plasmaRifle', 'rail', 'rocket', 'flamer']);
const SWINGERS = new Set(['axe', 'pick', 'wrench', 'shovel', 'sling']);
function poseFor(o) { const { anim, frame } = o; const n = { idle: 4, walk: 6, attack: 4, work: 4 }[anim] || 4; const t = ((frame % n) + 0.5) / n; const wp = o.weapon;
  let P;
  if (anim === 'walk') P = poseWalk(t);
  else if (anim === 'attack') { if (GUNS.has(wp)) P = poseAim(t, true); else if (wp === 'bow') P = poseBow(t); else if (wp === 'spear' || wp === 'sword') P = poseThrust(t); else P = poseSwing(t); }
  else if (anim === 'work') P = poseSwing(t);
  else { P = GUNS.has(wp) ? poseAim(0.9, false) : poseIdle(t); }
  return o.rider ? poseRider(P) : P; }

// ---------- model ----------
const HIP = 6.7, SHOULDER = 10.4, SHX = 1.75;
function weaponFaces(kind, A, team, o) { // built in the hand frame: hand at origin, forearm continues towards -y
  const F = []; const th = A.thrust || 0, sw = A.swing || 0;
  const vertical = Math.PI + 0.3, forward = Math.PI / 2;
  const holdAngle = (idleTheta) => { if (A.thrust !== undefined) return lerp(idleTheta, 0.05, th) + 0 * A.windup; if (A.swing !== undefined) return lerp(idleTheta, Math.PI / 2 - 0.3, sw) + (A.windup || 0) * 0.6; return idleTheta; };
  let theta = vertical;
  switch (kind) {
    case 'sword': theta = holdAngle(vertical); F.push(...box(0, -0.45, 0, 0.3, 0.9, 0.3, LEATHER_D), ...box(0, -0.95, 0, 1.0, 0.16, 0.36, BRONZE_D), ...box(0, -3.75, 0, 0.3, 5.5, 0.08, STEEL), ...box(0, -6.65, 0, 0.16, 0.3, 0.08, STEEL), ...sph(0, 0.1, 0, 0.2, BRONZE, 3)); break;
    case 'spear': theta = holdAngle(vertical - 0.15); F.push(...box(0, -3.5, 0, 0.22, 11, 0.22, WOOD), ...box(0, -9.4, 0, 0.42, 1.4, 0.1, STEEL), ...box(0, 1.6, 0, 0.3, 0.5, 0.3, BRONZE_D)); break;
    case 'axe': theta = holdAngle(Math.PI + 0.5); F.push(...box(0, -2.4, 0, 0.26, 5.2, 0.26, WOOD), ...box(0.55, -4.6, 0, 1.1, 1.3, 0.16, IRON)); break;
    case 'pick': theta = holdAngle(Math.PI + 0.5); F.push(...box(0, -2.4, 0, 0.26, 5.2, 0.26, WOOD), ...box(0, -4.9, 0, 2.2, 0.32, 0.22, IRON_D), ...box(-1.0, -4.4, 0, 0.3, 0.9, 0.2, IRON_D), ...box(1.0, -4.4, 0, 0.3, 0.9, 0.2, IRON_D)); break;
    case 'wrench': theta = holdAngle(Math.PI + 0.5); F.push(...box(0, -2, 0, 0.3, 4, 0.3, IRON_D), ...box(0, -4.2, 0, 1.1, 0.8, 0.3, IRON)); break;
    case 'shovel': theta = holdAngle(Math.PI + 0.5); F.push(...box(0, -2.4, 0, 0.26, 5, 0.26, WOOD), ...box(0, -5.3, 0, 1.2, 1.4, 0.12, IRON_D)); break;
    case 'sling': theta = holdAngle(Math.PI + 0.4); F.push(...box(0, -1.6, 0, 0.08, 3.2, 0.08, [200, 180, 140]), ...sph(0, -3.3, 0, 0.32, [120, 120, 120], 3)); break;
    case 'bow': { theta = Math.PI; F.push(...box(0, 0, 0, 0.26, 7.5, 0.3, WOOD), ...box(0, 3.4, -0.5, 0.2, 0.9, 1.1, WOOD), ...box(0, -3.4, -0.5, 0.2, 0.9, 1.1, WOOD), ...box(0, 0, -1.05, 0.05, 7.2, 0.05, [230, 230, 230])); break; }
    case 'rifle': theta = forward; F.push(...box(0, -3.2, 0, 0.3, 6.2, 0.36, WOOD_D), ...box(0, -6.4, 0.05, 0.22, 2.8, 0.22, IRON_D), ...box(0, 0.9, 0.3, 0.32, 1.8, 0.7, WOOD_D), ...box(0, -2.4, -0.4, 0.2, 0.6, 0.5, IRON_D)); break;
    case 'mg': theta = forward; F.push(...box(0, -3.2, 0, 0.42, 6.6, 0.5, IRON_D), ...box(0, -6.8, 0, 0.26, 2.4, 0.26, [60, 60, 60]), ...box(0, 1.0, 0.3, 0.36, 1.8, 0.7, WOOD_D), ...box(0, -1.4, -0.7, 0.5, 1.2, 0.8, [70, 60, 40]), ...box(-0.5, -4.8, 0.9, 0.12, 0.1, 1.8, IRON_D), ...box(0.5, -4.8, 0.9, 0.12, 0.1, 1.8, IRON_D)); break;
    case 'plasmaRifle': theta = forward; F.push(...box(0, -3, 0, 0.5, 6.2, 0.6, [90, 96, 110]), ...box(0, -1.2, 0, 0.56, 1.4, 0.7, team), ...box(0, -5.2, 0, 0.3, 1.6, 0.3, CYAN), ...box(0, 0.9, 0.3, 0.4, 1.6, 0.7, [70, 74, 86])); break;
    case 'rail': theta = forward; F.push(...box(0, -3.6, 0, 0.5, 7.6, 0.5, [70, 74, 86]), ...box(0, -3, 0, 0.62, 0.3, 0.62, CYAN), ...box(0, -4.5, 0, 0.62, 0.3, 0.62, CYAN), ...box(0, -6, 0, 0.62, 0.3, 0.62, CYAN), ...box(0, 0.6, 0.3, 0.5, 1.6, 0.8, [110, 116, 130])); break;
    case 'rocket': theta = forward; F.push(...box(0, -2.5, 0, 1.0, 7, 1.0, [80, 86, 100]), ...box(0, -0.5, 0, 1.1, 1.2, 1.1, team), ...box(0, -6.4, 0, 0.8, 1.0, 0.8, [190, 57, 43])); break;
    case 'flamer': theta = forward; F.push(...box(0, -2.4, 0, 0.36, 5.2, 0.36, IRON_D), ...box(0, 0.6, 0.6, 1.0, 1.8, 1.0, [80, 80, 76]), ...box(0, -5.2, 0, 0.6, 0.8, 0.6, [60, 60, 60])); break;
    default: return { faces: F, wrist: 0 };
  }
  if (A.kick) xf(F, p => mv(p, 0, A.kick * 0.5, 0));
  return { faces: F, wrist: wristFor(A, theta) };
}
function shieldFaces(kind, team) { // in the forearm frame: forearm along -y from the elbow, shield on the outer (+x) side
  const rim = mix(team, GOLD, 0.5);
  if (kind === 'scutum') { const R = 3.2; return [...arcPlate(-R + 0.55, -1.5, 0.2, R, 4.8, -0.52, 0.52, 0.16, team, 6, rim), ...sph(0.72, -1.5, 0.2, 0.34, BRONZE, 3)]; }
  if (kind === 'round') return xf([...discX(2.3, 0.2, team, 10, rim), ...sph(0.3, 0, 0, 0.45, IRON, 3)], p => mv(p, 0.6, -1.5, 0.3));
  if (kind === 'oval') return xf([...discX(2.0, 0.2, team, 10, rim)], p => mv([p[0], p[1] * 1.45, p[2]], 0.6, -1.5, 0.3));
  if (kind === 'energy') return xf([...discX(2.6, 0.08, [120, 230, 255, 0.35], 12, [160, 240, 255, 0.8])], p => mv(p, 0.9, -1.5, 0.4));
  return [];
}
function helmetFaces(kind, team, HY, crestSway) {
  const F = []; const n = 5;
  const dome = (color, r = 1.15, dy = 0.12) => sph(0, HY + dy, 0, r, color, n, p => p[1] >= HY + dy - 0.1);
  switch (kind) {
    case 'roman': F.push(...dome(BRONZE), ...cyl(0, HY + 0.05, 0, 1.2, 0.26, BRONZE_D, 8, 1.2, false), ...box(-0.95, HY - 0.55, 0.55, 0.28, 0.95, 0.75, BRONZE), ...box(0.95, HY - 0.55, 0.55, 0.28, 0.95, 0.75, BRONZE), ...box(0, HY - 0.35, -1.05, 1.9, 0.22, 0.7, shade(BRONZE, 0.85)), ...box(0, HY + 1.55, 0.1 + crestSway, 0.32, 0.85, 2.1, team), ...box(0, HY + 2.1, 0.2 + crestSway * 1.6, 0.24, 0.4, 1.4, shade(team, 0.7)), ...box(0, HY + 1.15, 0, 0.38, 0.2, 1.4, BRONZE_D)); break;
    case 'greek': F.push(...dome(BRONZE, 1.18), ...cyl(0, HY - 0.3, 0, 1.15, 0.9, BRONZE, 8, 1.2, false).filter(f => f.pts.every(p => p[2] > -0.9)), ...box(0, HY - 0.2, 1.1, 0.35, 1.1, 0.25, BRONZE), ...box(0, HY + 1.7, 0.1 + crestSway, 0.28, 1.2, 2.6, team)); break;
    case 'cap': F.push(...dome(shade(team, 0.85), 1.12), ...cyl(0, HY + 0.05, 0, 1.16, 0.2, shade(team, 0.6), 8, 1.16, false)); break;
    case 'band': F.push(...dome(HAIR, 1.08, 0.05), ...cyl(0, HY + 0.25, 0, 1.12, 0.3, team, 8, 1.12, false)); break;
    case 'hair': F.push(...dome(HAIR, 1.1, 0.05), ...box(0, HY - 0.5, -0.9, 1.6, 1.2, 0.5, HAIR)); break;
    case 'stahlhelm': F.push(...dome([88, 96, 80], 1.22, 0.15), ...cyl(0, HY - 0.05, 0, 1.4, 0.22, [70, 76, 62], 8, 1.25, false), ...box(0, HY + 0.05, 1.05, 1.4, 0.26, 0.2, team)); break;
    case 'garrison': F.push(...dome([96, 92, 70], 1.18, 0.12), ...cyl(0, HY - 0.05, 0, 1.28, 0.2, [80, 76, 58], 8, 1.2, false), ...box(0, HY + 0.05, 1.05, 1.2, 0.24, 0.2, team)); break;
    case 'hardhat': F.push(...dome([220, 180, 50], 1.12, 0.12), ...cyl(0, HY - 0.02, 0, 1.32, 0.16, [190, 150, 40], 9, 1.18, false)); break;
    case 'visor': F.push(...sph(0, HY + 0.05, 0, 1.2, [200, 205, 215], n, p => p[2] < 0.75 || p[1] > HY + 0.5), ...box(0, HY + 0.05, 0.85, 1.7, 0.7, 0.4, CYAN), ...box(0, HY + 1.3, 0, 0.3, 0.5, 0.6, team)); break;
    case 'android': F.push(...sph(0, HY + 0.05, 0, 1.15, [120, 128, 140], n), ...box(0, HY + 0.1, 1.0, 1.3, 0.35, 0.3, [255, 80, 80]), ...box(0, HY + 1.1, 0, 1.2, 0.3, 0.6, team)); break;
    default: break;
  }
  return F;
}
export function humanoidModel(o, P) {
  const team = o.team, torsoC = o.torso || team, legsC = o.legs, sleevesC = o.sleeves, beltC = o.belt || [60, 40, 25], armor = o.armor || 'tunic';
  const n = 7; const F = []; const bob = P.bob;
  // ---- legs (skin or trousers) with sandals/boots
  const legM = (x, L, br) => { const c = shade(legsC || SKIN, br); const boot = legsC ? shade(legsC, 0.6) : LEATHER_D; const up = cyl(0, -1.65, 0, 0.62, 3.3, c, n, 0.55); const knee = sph(0, -3.3, 0, 0.5, c, 3); let lo = [...cyl(0, -1.5, 0, 0.5, 3.0, c, n, 0.42), ...box(0, -3.15, 0.3, 0.9, 0.45, 1.7, boot)]; if (!legsC) lo.push(...box(0, -2.55, 0.1, 0.95, 0.12, 0.9, LEATHER)); lo = xf(swing(lo, -L.knee), p => mv(p, 0, -3.3, 0)); return xf(swing([...up, ...knee, ...lo], L.thigh), p => mv(p, x, HIP + bob, 0)); };
  if (!o.rider) F.push(...legM(-0.75, P.legR, 0.92), ...legM(0.75, P.legL, 1)); else F.push(...legM(-0.95, P.legR, 0.92), ...legM(0.95, P.legL, 1));
  // ---- body (hips, tunic, torso, shoulders) leaning with the pose
  const lean = P.lean; const T = p => { const q = rotX([p[0], p[1] - HIP - bob, p[2]], lean); return [q[0], q[1] + HIP + bob, q[2]]; };
  const body = [];
  if (armor === 'segmentata' || armor === 'tunic' || armor === 'plate') { body.push(...cyl(0, HIP - 0.9, 0, 1.75, 1.9, torsoC, n + 2, 1.45)); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; body.push(...xf(box(0, HIP - 2.35, 1.72, 0.55, 1.5, 0.16, shade(LEATHER, (i % 2) ? 0.85 : 1.1)), p => rotY(p, a))); } }
  else body.push(...cyl(0, HIP - 0.9, 0, 1.55, 1.9, legsC || torsoC, n + 2, 1.45)); // trousers continue under a uniform
  body.push(...cyl(0, HIP + 0.15, 0, 1.5, 0.4, beltC, n + 2)); for (let i = -1; i <= 1; i++) body.push(...xf(box(0, HIP + 0.15, 1.52, 0.35, 0.3, 0.1, BRONZE), p => rotY(p, i * 0.4)));
  if (armor === 'segmentata') { body.push(...cyl(0, HIP + 2.1, 0, 1.38, 3.5, IRON, n + 2, 1.58)); for (let i = 0; i < 5; i++) body.push(...cyl(0, HIP + 0.75 + i * 0.65, 0, 1.42 + i * 0.045, 0.16, IRON_D, n + 2, 1.42 + i * 0.045, false)); body.push(...cyl(0, HIP + 3.85, 0, 1.6, 0.45, IRON, n + 2, 1.45)); }
  else if (armor === 'plate') { body.push(...cyl(0, HIP + 2.1, 0, 1.4, 3.5, IRON, n + 2, 1.6), ...box(0, HIP + 2.3, 1.45, 1.2, 1.4, 0.2, team), ...cyl(0, HIP + 3.85, 0, 1.62, 0.45, IRON_D, n + 2, 1.45)); }
  else if (armor === 'suit') { body.push(...cyl(0, HIP + 2.1, 0, 1.4, 3.5, torsoC, n + 2, 1.62), ...box(0, HIP + 2.6, 1.5, 1.6, 1.2, 0.25, shade(torsoC, 1.25)), ...box(0, HIP + 2.6, 1.68, 0.5, 0.4, 0.1, o.emblem || CYAN), ...cyl(0, HIP + 3.85, 0, 1.65, 0.45, shade(torsoC, 0.8), n + 2, 1.5)); }
  else if (armor === 'uniform') { body.push(...cyl(0, HIP + 2.1, 0, 1.38, 3.5, torsoC, n + 2, 1.55), ...box(-0.7, HIP + 1.9, 1.45, 0.7, 0.7, 0.15, shade(torsoC, 0.85)), ...box(0.7, HIP + 1.9, 1.45, 0.7, 0.7, 0.15, shade(torsoC, 0.85)), ...box(0, HIP + 3.4, 1.5, 0.9, 0.35, 0.12, shade(torsoC, 1.2))); if (o.emblem) body.push(...box(0.9, HIP + 3.1, 1.5, 0.4, 0.4, 0.12, o.emblem)); }
  else { body.push(...cyl(0, HIP + 2.1, 0, 1.36, 3.5, torsoC, n + 2, 1.52)); if (o.emblem) body.push(...box(0, HIP + 2.8, 1.45, 0.6, 0.6, 0.12, o.emblem)); }
  const shoulderC = armor === 'segmentata' || armor === 'plate' ? IRON : (sleevesC || torsoC);
  for (const sx of [-1, 1]) body.push(...sph(sx * SHX, SHOULDER, 0, 0.72, shoulderC, 4, p => p[1] >= SHOULDER - 0.15));
  F.push(...xf(body, T));
  // ---- arms: right hand carries the weapon (or the resource), left forearm the shield / bow
  const armC = sleevesC || SKIN;
  const armM = (x, A, side, holds) => { const up = cyl(0, -1.45, 0, 0.54, 2.9, armC, n, 0.48); const elbow = sph(0, -2.9, 0, 0.46, armC, 3); let fa = [...cyl(0, -1.35, 0, 0.46, 2.7, armC, n, 0.4), ...sph(0, -2.75, 0, 0.44, SKIN, 3)]; let extra = [];
    if (holds && holds.faces) extra = xf(xf(holds.faces, p => rotX(p, -holds.wrist)), p => mv(p, 0, -2.75, 0));
    if (holds && holds.shield) extra = holds.shield;
    fa = xf(swing([...fa, ...extra], A.fore), p => mv(p, 0, -2.9, 0));
    return xf(swing([...up, ...elbow, ...fa], A.up), p => T(mv(rotZ(p, -side * (A.out || 0)), x, SHOULDER - 0.1, 0))); };
  let right = null, left = null;
  if (o.carry === 'p') right = { faces: [...sph(0, -0.2, 0.4, 0.75, GOLD, 4), ...box(0, 0.55, 0.4, 0.5, 0.35, 0.5, [200, 170, 90])], wrist: 0 };
  else if (o.carry === 's') right = { faces: [...box(0, -0.4, 0, 0.7, 0.7, 4.6, WOOD), ...box(0, -0.4, 0, 0.5, 0.5, 4.8, shade(WOOD, 1.15))], wrist: wristFor(P.armR, Math.PI / 2) };
  else if (o.weapon && o.weapon !== 'bow') right = weaponFaces(o.weapon, P.armR, team, o);
  if (o.weapon === 'bow') left = weaponFaces('bow', P.armL, team, o);
  else if (o.shield) left = { shield: shieldFaces(o.shield, team) };
  if (!o.shield && GUNS.has(o.weapon)) left = null; // second hand just supports the gun
  F.push(...armM(-SHX - 0.35, P.armR, -1, right), ...armM(SHX + 0.35, P.armL, 1, left));
  // ---- head + helmet
  const HY = SHOULDER + 1.9; let head = [...cyl(0, SHOULDER + 0.55, 0, 0.42, 0.9, SKIN, 6), ...sph(0, HY, 0, 1.0, SKIN, 5), ...box(-0.35, HY + 0.05, 0.96, 0.22, 0.14, 0.1, [40, 30, 25]), ...box(0.35, HY + 0.05, 0.96, 0.22, 0.14, 0.1, [40, 30, 25]), ...box(0, HY - 0.2, 1.0, 0.2, 0.35, 0.16, shade(SKIN, 0.8))];
  head.push(...helmetFaces(o.helmet, team, HY, P.crest * 0.8));
  head = xf(head, p => { const k = 1.14, base = SHOULDER + 0.4; const q = rotX([p[0] * k, (p[1] - base) * k + base - SHOULDER, p[2] * k], -P.headNod * 2); return [q[0], q[1] + SHOULDER, q[2]]; }); // slightly oversized head reads better at sprite size
  F.push(...xf(head, T));
  // ---- cape (heroes / elites)
  if (o.cape) { const cape = []; const cp = P.cape; const cc = shade(team, 0.8); for (let i = 0; i < 5; i++) { const y0 = SHOULDER - 0.2 - i * 1.25, y1 = y0 - 1.25; const z0 = -1.45 - i * i * cp * 0.16, z1 = -1.45 - (i + 1) * (i + 1) * cp * 0.16; const w0 = 1.45 + i * 0.16, w1 = 1.45 + (i + 1) * 0.16; cape.push({ pts: [[-w0, y0, z0], [w0, y0, z0], [w1, y1, z1], [-w1, y1, z1]], color: cc }); } F.push(...xf(cape, T)); }
  return F;
}

// ---------- rasteriser ----------
const TILT = Math.atan(0.5), CT = Math.cos(TILT), ST = Math.sin(TILT);
const LIGHT = (() => { const v = [-0.55, 0.9, 0.75]; const l = Math.hypot(...v); return v.map(x => x / l); })();
const CAM = [0, ST, CT];
const rgba = (c, k) => c.length > 3 ? `rgba(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0},${c[3]})` : `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
/** draw faces with the feet at (0,0) of ctx; yaw rotates the model; scale = px per model unit */
export function renderModel(ctx, faces, yaw, scale, opts = {}) {
  const { ambient = 0.52, outline = 'rgba(20,14,8,0.45)', lineWidth = 0.35, cel = 0 } = opts;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const out = new Array(faces.length); let m = 0;
  for (const f of faces) {
    const pts = f.pts; const P = new Array(pts.length); let d = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; const x = p[0] * cy + p[2] * sy, y = p[1], z = -p[0] * sy + p[2] * cy; P[i] = [x * scale, (-y * CT + z * ST) * scale, x, y, z]; d += z * CT + y * ST; }
    const ax = P[1][2] - P[0][2], ay = P[1][3] - P[0][3], az = P[1][4] - P[0][4], bx = P[2][2] - P[0][2], by = P[2][3] - P[0][3], bz = P[2][4] - P[0][4];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    if (nx * CAM[0] + ny * CAM[1] + nz * CAM[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    let k = ambient + diff * 0.72; if (cel) k = 0.58 + Math.round((Math.min(1.25, Math.max(0.58, k)) - 0.58) / 0.67 * (cel - 1)) / (cel - 1) * 0.67;
    out[m++] = { P, d: d / pts.length, k, color: f.color };
  }
  out.length = m; out.sort((a, b) => a.d - b.d);
  ctx.lineWidth = lineWidth; ctx.lineJoin = 'round';
  for (const f of out) { ctx.beginPath(); const P = f.P; ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); ctx.fillStyle = rgba(f.color, f.k); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.stroke(); } }
}

/** drop-in replacement for the flat humanoid(): feet at (0,0), o.dir = screen direction 0..7 */
export function humanoid3D(ctx, o) {
  const sa = o.dir * Math.PI / 4; const yaw = Math.PI / 2 - sa; // the model faces +z at yaw 0, i.e. down the screen
  const P = poseFor(o); const faces = humanoidModel(o, P);
  const scale = 2.8 * (o.scale || 1);
  if (!o.rider) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 7 * (o.scale || 1), 3.5 * (o.scale || 1), 0, 0, Math.PI * 2); ctx.fill(); }
  const opts = isPixel() ? { cel: 4, outline: null } : {};
  if (o.rider) { ctx.save(); ctx.translate(0, (HIP - 0.6) * CT * scale); renderModel(ctx, faces, yaw, scale, opts); ctx.restore(); } // hips sit on the saddle
  else renderModel(ctx, faces, yaw, scale, opts);
}
