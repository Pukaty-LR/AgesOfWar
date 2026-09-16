// Low-poly mounts, siege engines, guns, ships and hover craft built from the same primitives as the humanoids and
// baked through the same rasteriser (and the pixel-art pass). Model space: y up, ground y = 0, the vehicle faces +z.
import { box, cyl, sph, cylZ, cylX, prismY, xf, mv, rotX, rotY, rotZ, swing, shade, mix, renderModel, humanoidModel, poseFor, HIP, CT, WOOD, WOOD_D, IRON, IRON_D, STEEL, LEATHER, LEATHER_D, BRONZE, BRONZE_D, GOLD, CYAN } from './model3d.js';
import { isPixel } from './style.js';

const yawOf = dir => Math.PI / 2 - dir * Math.PI / 4;
const phaseOf = o => (o.anim === 'walk' ? ((o.frame % 6) + 0.5) / 6 : 0) * Math.PI * 2;
const atkFrame = o => (o.anim === 'attack' ? o.frame % 4 : -1);
const OLIVE = [96, 104, 80], RUBBER = [40, 40, 42], HULL_GREY = [118, 126, 122], HULL_SF = [150, 158, 172];
function draw(ctx, faces, o, scale, shadowRx, shadowRy) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, shadowRx, shadowRy, 0, 0, Math.PI * 2); ctx.fill();
  renderModel(ctx, faces, yawOf(o.dir), scale, isPixel() ? { cel: 4, outline: null } : {});
}
/** a two-segment animal leg hanging from a joint: upper (L1) then lower (L2) then hoof; positive angles swing forward */
function animalLeg(x, y, z, L1, L2, r1, r2, thigh, knee, color, hoof) {
  const up = cyl(0, -L1 / 2, 0, r1, L1, color, 6, r1 * 0.8); const lo = [...cyl(0, -L2 / 2, 0, r2, L2, color, 6, r2 * 0.85), ...box(0, -L2 - 0.3, 0.15, r2 * 2.2, 0.6, r2 * 2.6, hoof)];
  const low = xf(swing(lo, -knee), p => mv(p, 0, -L1, 0));
  return xf(swing([...up, ...low], thigh), p => mv(p, x, y, z));
}

// ---------- horse (with an optional rider) ----------
export function horseModel(o, coat, ph) {
  const F = []; const dark = shade(coat, 0.75), mane = shade(coat, 0.45);
  const gallop = o.anim === 'walk' ? 1 : 0; const bob = gallop * Math.abs(Math.sin(ph)) * 0.35;
  const B = p => mv(p, 0, bob, 0);
  // body: barrel + chest + rump
  F.push(...xf([...cylZ(0, 9.6, -0.2, 2.5, 8.2, coat, 8, 2.75), ...sph(0, 9.9, 4.2, 2.7, coat, 5), ...sph(0, 9.8, -4.3, 2.55, coat, 5)], B));
  // neck + head + ears + mane
  let neck = box(0, 0, 2.6, 1.9, 2.3, 5.4, coat); neck = xf(neck, p => mv(rotX(p, -0.85), 0, 11.0, 4.6));
  let head = [...box(0, 0, 1.4, 1.6, 1.8, 3.4, coat), ...box(0, -0.3, 3.2, 1.2, 1.2, 1.0, dark), ...box(-0.55, 1.2, -0.2, 0.35, 0.9, 0.3, coat), ...box(0.55, 1.2, -0.2, 0.35, 0.9, 0.3, coat), ...box(-0.62, 0.35, 2.0, 0.2, 0.3, 0.3, [30, 20, 15]), ...box(0.62, 0.35, 2.0, 0.2, 0.3, 0.3, [30, 20, 15])];
  head = xf(head, p => mv(rotX(p, 0.25), 0, 14.6, 7.6));
  let maneF = box(0, 1.3, 2.2, 0.5, 0.8, 5.0, mane); maneF = xf(maneF, p => mv(rotX(p, -0.85), 0, 11.0, 4.6));
  F.push(...xf([...neck, ...head, ...maneF], B));
  // tail
  F.push(...xf(xf(box(0, -1.6, -0.5, 0.7, 3.6, 0.7, mane), p => mv(rotX(p, 0.6 + Math.sin(ph) * 0.15 * gallop), 0, 11.4, -5.6)), B));
  // legs: 4-beat gallop, hind legs half a cycle behind the front ones
  const legs = [[-1.25, 3.0, 0], [1.25, 3.0, 0.5], [-1.2, -3.4, Math.PI], [1.2, -3.4, Math.PI + 0.5]];
  for (const [x, z, off] of legs) { const th = gallop ? 0.55 * Math.sin(ph + off) : (z > 0 ? 0.05 : -0.05); const kn = gallop ? 0.15 + 0.6 * Math.max(0, Math.sin(ph + off - 0.6)) : 0.1; F.push(...xf(animalLeg(x, 8.2, z, 3.9, 3.6, 0.72, 0.55, th, kn, dark, [45, 35, 28]), B)); }
  // saddle cloth (team) + saddle + girth
  F.push(...xf([...box(0, 12.15, 0.2, 3.9, 0.35, 4.4, o.team), ...box(0, 12.55, 0.1, 2.4, 0.5, 2.6, LEATHER_D), ...box(0, 12.9, -1.0, 2.0, 0.4, 0.5, LEATHER_D), ...box(0, 10.0, 0.4, 5.6, 5.3, 0.35, LEATHER)], B));
  // bridle
  F.push(...xf(xf([...box(0, -0.2, 1.2, 1.75, 0.2, 0.2, LEATHER_D)], p => mv(rotX(p, 0.25), 0, 14.6, 7.6)), B));
  return { faces: F, saddleY: 12.75 + bob };
}
export function horse3D(ctx, o, coat, rider) {
  const ph = phaseOf(o); const h = horseModel(o, coat, ph); const F = h.faces;
  if (rider) { const ro = { ...o, ...rider, rider: true, anim: o.anim === 'walk' ? 'idle' : o.anim }; const P = poseFor(ro); const rf = humanoidModel(ro, P); F.push(...xf(rf, p => mv(p, 0, h.saddleY - HIP + 0.55, 0.2))); }
  draw(ctx, xf(F, p => mv(p, 0, 0, -1.8)), o, 1.8, 13, 6);
}

// ---------- chariot: horse pulling a two-wheeled cart with two crew ----------
export function chariot3D(ctx, o) {
  const ph = phaseOf(o); const h = horseModel({ ...o }, [120, 85, 50], ph); const F = xf(h.faces, p => mv(p, 0, 0, 7.0));
  const cart = mix([205, 170, 110], o.team, 0.3), cartD = shade(cart, 0.7); const Z0 = -7.5, Z1 = -2.8; // cart floor span (behind the horse)
  F.push(...prismY([[-2.8, Z0], [2.8, Z0], [3.0, Z1], [-3.0, Z1]], 2.6, 0.6, WOOD_D, WOOD)); // floor
  F.push(...prismY([[-2.9, Z0], [2.9, Z0], [2.9, Z0 + 0.5], [-2.9, Z0 + 0.5]], 3.2, 3.2, cartD, cart)); // back rail
  for (const sx of [-1, 1]) F.push(...prismY([[sx * 3.0, Z0], [sx * 2.5, Z0], [sx * 2.5, Z1 - 0.4], [sx * 3.0, Z1 - 0.4]], 3.2, 2.6, cart, cart)); // side panels
  F.push(...box(0, 4.6, Z1 - 0.3, 5.6, 0.4, 0.4, cartD)); // front rail
  for (const sx of [-1, 1]) { const wz = (Z0 + Z1) / 2; F.push(...cylX(sx * 3.6, 3.2, wz, 3.2, 0.7, WOOD_D, 12), ...cylX(sx * 3.7, 3.2, wz, 0.7, 0.9, LEATHER_D, 6)); for (let i = 0; i < 4; i++) F.push(...xf(box(0, 0, 0, 0.3, 5.8, 0.3, WOOD), p => mv(rotX(p, i * Math.PI / 4 + ph * 0.5), sx * 3.6, 3.2, wz))); }
  F.push(...box(0, 3.2, (Z0 + Z1) / 2, 7.8, 0.45, 0.45, WOOD_D)); // axle
  F.push(...box(0, 3.2, 2.5, 0.4, 0.4, 10.5, WOOD_D), ...box(0, 8.4, 7.4, 4.2, 0.35, 0.35, WOOD_D)); // pole + yoke
  for (const [x, opts] of [[-1.3, { helmet: 'greek', weapon: 'spear', torso: mix(o.team, [200, 180, 140], 0.3) }], [1.3, { helmet: 'cap', weapon: null, torso: mix(o.team, [180, 160, 120], 0.4) }]]) { const ro = { ...o, ...opts, anim: o.anim === 'walk' ? 'idle' : o.anim }; F.push(...xf(humanoidModel(ro, poseFor(ro)), p => mv([p[0] * 0.88, p[1] * 0.88, p[2] * 0.88], x, 3.2, (Z0 + Z1) / 2 - 0.4))); }
  draw(ctx, xf(F, p => mv(p, 0, 0, -5.0)), o, 1.85, 24, 10);
}

// ---------- siege engines ----------
function wheelsX(xs, y, zs, r, w, color, spokes = 0, spin = 0) { const F = []; for (const x of xs) for (const z of zs) { F.push(...cylX(x, y, z, r, w, color, 10), ...cylX(x, y, z, r * 0.3, w * 1.3, LEATHER_D, 6)); for (let i = 0; i < spokes; i++) F.push(...xf(box(0, 0, 0, w * 0.5, r * 1.9, 0.22, WOOD), p => mv(rotX(p, i * Math.PI / spokes + spin), x, y, z))); } return F; }
export function catapult3D(ctx, o) {
  const F = []; const k = atkFrame(o); const spin = phaseOf(o) * 0.4;
  F.push(...box(0, 2.2, 0, 5.2, 0.9, 7.6, WOOD), ...box(-1.9, 2.2, 0, 0.9, 1.4, 7.6, WOOD_D), ...box(1.9, 2.2, 0, 0.9, 1.4, 7.6, WOOD_D)); // frame
  F.push(...wheelsX([-3.0, 3.0], 1.7, [-2.9, 2.9], 1.7, 0.6, WOOD_D, 4, spin));
  F.push(...box(-1.7, 5.0, 1.6, 0.6, 4.6, 0.6, WOOD), ...box(1.7, 5.0, 1.6, 0.6, 4.6, 0.6, WOOD), ...box(0, 7.1, 1.6, 4.4, 0.6, 0.7, WOOD_D), ...box(0, 7.4, 1.6, 4.0, 0.3, 0.3, LEATHER)); // uprights + padded crossbar
  F.push(...box(0, 3.4, -1.6, 4.0, 0.8, 0.8, WOOD_D), ...cylX(0, 3.4, -1.6, 0.45, 5.0, IRON_D, 6)); // torsion bundle + axle
  const arm = k < 0 ? -1.25 : [-1.25, 0.45, 0.6, -0.5][k]; // cocked back → released
  let A = [...box(0, 3.6, 0, 0.75, 7.6, 0.75, WOOD), ...box(0, 7.4, 0, 1.6, 0.6, 1.6, LEATHER_D), ...sph(0, 7.9, 0, 0.75, [110, 105, 95], 4)]; if (k === 1 || k === 2) A = A.slice(0, 6 + 6); // rock flies away after the release
  F.push(...xf(A, p => mv(rotX(p, -arm), 0, 3.4, -1.6)));
  F.push(...box(0, 1.2, -4.2, 3.0, 0.5, 0.6, WOOD_D), ...box(0, 2.6, -3.9, 0.3, 2.4, 0.3, IRON_D)); // rear beam + winch
  F.push(...box(0, 5.4, -3.2, 0.2, 2.0, 0.2, WOOD_D), ...box(0, 6.6, -3.2, 1.2, 0.8, 0.1, o.team)); // pennant
  draw(ctx, F, o, 3.0, 17, 8);
}
export function ballista3D(ctx, o) {
  const F = []; const k = atkFrame(o); const spin = phaseOf(o) * 0.4;
  F.push(...box(0, 1.9, 0, 3.6, 0.8, 6.8, WOOD), ...wheelsX([-2.3, 2.3], 1.5, [-2.2, 2.2], 1.5, 0.55, WOOD_D, 4, spin));
  F.push(...box(0, 3.4, -0.4, 1.4, 0.7, 7.4, WOOD_D), ...box(0, 4.0, -0.2, 0.7, 0.5, 7.0, WOOD)); // slider + stock
  F.push(...box(0, 3.0, 3.0, 4.8, 1.6, 0.9, WOOD), ...cylX(-1.6, 3.6, 3.0, 0.55, 1.3, LEATHER, 6), ...cylX(1.6, 3.6, 3.0, 0.55, 1.3, LEATHER, 6)); // front frame with torsion skeins
  const bend = k === 0 ? 0.9 : (k === 1 ? 0.35 : 0.6);
  for (const sx of [-1, 1]) F.push(...xf([...box(sx * 1.9, 0, -0.1, 3.8, 0.55, 0.5, WOOD), ...box(sx * 3.7, 0, -0.1, 0.5, 0.7, 0.6, IRON_D)], p => mv(rotY(mv(p, -sx * 1.9, 0, 0), -sx * bend), sx * 1.9 + sx * 0.3, 4.1, 3.4)));
  const pull = k === 0 ? -2.6 : (k === 1 ? 2.8 : 0.2);
  F.push(...box(0, 4.1, 3.4 + pull * 0.5, 7.0 - Math.abs(bend) * 2, 0.25, 0.25, [235, 225, 200])); // string
  if (k !== 1 && k !== 2) F.push(...box(0, 4.35, 1.2, 0.3, 0.3, 5.0, WOOD_D), ...box(0, 4.35, 3.9, 0.35, 0.35, 0.9, IRON)); // bolt
  F.push(...box(0, 2.9, -3.7, 0.4, 1.8, 0.4, WOOD_D), ...box(0, 3.9, -3.7, 1.6, 0.3, 0.3, IRON_D)); // rear post + windlass
  draw(ctx, F, o, 3.0, 16, 7);
}

// ---------- guns ----------
export function fieldGun3D(ctx, o, sc = 1) {
  const F = []; const k = atkFrame(o); const body = mix(OLIVE, o.team, 0.35); const spin = phaseOf(o) * 0.4;
  F.push(...cylX(0, 2.6, 0, 0.35, 7.0, IRON_D, 6));
  for (const sx of [-1, 1]) { F.push(...cylX(sx * 3.4, 2.6, 0, 2.5, 0.9, RUBBER, 12), ...cylX(sx * 3.45, 2.6, 0, 1.7, 1.0, body, 10), ...cylX(sx * 3.5, 2.6, 0, 0.5, 1.2, IRON_D, 6)); for (let i = 0; i < 4; i++) F.push(...xf(box(0, 0, 0, 0.5, 3.2, 0.3, shade(body, 0.8)), p => mv(rotX(p, i * Math.PI / 4 + spin), sx * 3.5, 2.6, 0))); }
  for (const sx of [-1, 1]) F.push(...xf(box(0, 0, -3.6, 0.6, 0.7, 7.2, body), p => mv(rotY(p, sx * 0.22), sx * 0.6, 2.1, -0.6)), ...box(sx * 2.2, 1.4, -7.2, 0.9, 0.5, 1.2, IRON_D)); // trails + spades
  F.push(...xf(box(0, 1.6, 0, 5.4, 3.2, 0.3, body), p => mv(rotX(p, -0.25), 0, 3.6, 1.2)), ...box(0, 5.3, 0.9, 1.6, 0.6, 0.3, shade(body, 0.7))); // shield with sight notch
  const recoil = k === 1 ? -1.4 : (k === 2 ? -0.6 : 0);
  let gun = [...cylZ(0, 0, 3.6 + recoil, 0.48, 9.0, IRON_D, 8, 0.4), ...cylZ(0, 0, 8.0 + recoil, 0.62, 1.2, IRON_D, 8), ...box(0, 0, -1.4 + recoil, 1.6, 1.4, 2.4, shade(body, 0.85)), ...box(0, -0.9, -1.2 + recoil, 0.9, 0.6, 1.8, IRON_D)];
  if (k === 1) gun.push(...sph(0, 0, 9.4 + recoil, 1.3, [255, 220, 120], 4), ...sph(0, 0, 10.4, 0.8, [255, 245, 200], 3));
  F.push(...xf(gun, p => mv(rotX(p, -0.18), 0, 4.2, 0.6)));
  draw(ctx, F, o, 2.2 * sc, 16 * sc, 7 * sc);
}
export function rocketTruck3D(ctx, o) {
  const F = []; const k = atkFrame(o); const body = mix(OLIVE, o.team, 0.4); const spin = phaseOf(o) * 0.4;
  F.push(...prismY([[-2.6, -7.5], [2.6, -7.5], [2.6, 7.2], [-2.6, 7.2]], 2.2, 1.0, shade(body, 0.75)));
  F.push(...box(0, 4.6, 5.0, 5.2, 3.6, 4.2, body), ...box(0, 5.4, 7.15, 4.2, 1.6, 0.2, [140, 190, 210]), ...box(-1.9, 5.2, 4.8, 0.2, 1.3, 2.6, [140, 190, 210]), ...box(1.9, 5.2, 4.8, 0.2, 1.3, 2.6, [140, 190, 210]), ...box(0, 3.2, 7.4, 4.8, 1.2, 0.5, shade(body, 0.8)), ...box(0, 3.1, 7.7, 1.2, 0.6, 0.3, [230, 220, 160])); // cab, windows, bumper, plate
  F.push(...box(0, 3.4, -1.6, 5.2, 0.5, 9.0, shade(body, 0.9)), ...box(0, 4.2, -5.9, 5.2, 1.2, 0.4, body), ...box(0, 4.0, 2.4, 5.2, 0.8, 0.4, body)); // bed
  for (const z of [-5.2, -2.2, 4.4]) for (const sx of [-1, 1]) { F.push(...cylX(sx * 2.7, 1.5, z, 1.5, 0.9, RUBBER, 10), ...cylX(sx * 2.75, 1.5, z, 0.8, 1.0, shade(body, 0.8), 6)); F.push(...xf(box(0, 0, 0, 0.3, 1.6, 0.25, IRON_D), p => mv(rotX(p, spin), sx * 2.8, 1.5, z))); }
  const rack = []; for (let i = 0; i < 8; i++) { const x = (i % 4 - 1.5) * 1.15, y = 0.6 + Math.floor(i / 4) * 1.15; rack.push(...cylZ(x, y, 0, 0.5, 8.0, IRON_D, 6), ...cylZ(x, y, 4.0, 0.35, 0.2, k === 1 && i % 2 === 0 ? [255, 210, 110] : (k === 2 && i % 2 === 1 ? [255, 210, 110] : [50, 50, 55]), 6)); }
  rack.push(...box(0, 0.0, -1.5, 5.2, 0.35, 0.8, shade(body, 0.7)), ...box(0, -0.9, -1.0, 1.4, 1.4, 1.2, shade(body, 0.7)));
  F.push(...xf(rack, p => mv(rotX(p, -0.55), 0, 5.6, -1.6)));
  if (k === 1 || k === 2) F.push(...sph(0, 8.2, 3.6, 1.6, [255, 190, 90], 3), ...sph(0, 9.0, 2.0, 1.2, [120, 110, 100, 0.6], 3));
  F.push(...box(0, 5.8, -6.1, 0.15, 2.6, 0.15, IRON_D), ...box(0.6, 6.7, -6.1, 1.2, 0.7, 0.1, o.team));
  draw(ctx, F, o, 2.0, 18, 8);
}

// ---------- ships ----------
const bobOf = o => Math.sin(((o.frame % 6) / 6) * Math.PI * 2) * 0.3;
export function trireme3D(ctx, o, sc = 1) {
  const F = []; const bob = bobOf(o); const ph = phaseOf(o); const hull = [150, 105, 60], hullD = shade(hull, 0.72), deck = [190, 150, 95];
  const outline = [[-2.3, -9.5], [-2.7, -3.5], [-2.6, 3.5], [-1.4, 8.6], [0, 11.2], [1.4, 8.6], [2.6, 3.5], [2.7, -3.5], [2.3, -9.5]];
  F.push(...prismY(outline, 0.4, 2.6, hullD, deck), ...prismY(outline.map(p => [p[0] * 0.92, p[1] * 0.97]), 3.0, 0.9, hull, deck)); // hull + gunwale
  F.push(...box(0, 0.9, 12.0, 0.8, 0.8, 2.6, BRONZE), ...box(0, 3.6, 11.0, 0.5, 2.2, 0.5, WOOD_D)); // ram, stem post
  F.push(...xf(box(0, 1.6, 0, 0.5, 3.4, 0.5, WOOD_D), p => mv(rotX(p, 0.6), 0, 3.4, -9.6)), ...xf(box(0, 2.0, 0, 0.35, 3.0, 0.35, WOOD_D), p => mv(rotX(p, 1.0), 0, 4.2, -9.4))); // curved stern
  F.push(...box(0, 4.4, -7.2, 3.0, 1.2, 2.6, hull), ...box(0, 5.3, -7.2, 2.6, 0.6, 2.2, deck)); // stern cabin
  F.push(...cyl(0, 7.8, 0.5, 0.32, 9.0, WOOD_D, 6), ...box(0, 12.0, 0.5, 8.0, 0.3, 0.3, WOOD_D), ...box(0, 8.6, 0.3, 7.4, 6.4, 0.15, [236, 226, 200]), ...box(0, 8.6, 0.4, 7.4, 1.2, 0.05, o.team)); // mast, yard, sail with team band
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) { const z = -7 + i * 2.2; const sweep = o.anim === 'walk' ? Math.sin(ph + i * 0.4) * 0.35 : 0; const dip = o.anim === 'walk' ? Math.max(0, Math.cos(ph + i * 0.4)) * 0.25 : 0.1; F.push(...xf([...box(0, 0, 0, 5.4, 0.16, 0.2, WOOD), ...box(2.7, 0, 0, 1.2, 0.1, 0.5, WOOD_D)], p => mv(rotY(rotZ(p, -sx * (0.35 + dip)), sweep), sx * 2.3 + sx * 2.5, 2.4, z))); for (let s = 0; s < 1; s++) F.push(...box(sx * 2.85, 3.5, z, 0.2, 0.9, 1.6, o.team)); } // oars + shield row
  F.push(...box(0, 4.0, 3.5, 2.0, 0.7, 2.0, deck), ...box(0, 4.0, -2.0, 2.0, 0.7, 2.0, deck)); // hatches
  F.push(...box(0, 13.0, 0.5, 0.1, 1.6, 0.1, WOOD_D), ...box(0.6, 13.5, 0.5, 1.2, 0.7, 0.05, o.team)); // pennant
  draw(ctx, xf(F, p => mv(p, 0, bob, 0)), o, 2.9 * sc, 34 * sc, 15 * sc);
}
export function destroyer3D(ctx, o, sc = 1) {
  const F = []; const bob = bobOf(o) * 0.5; const k = atkFrame(o); const grey = mix(HULL_GREY, o.team, 0.15), greyD = shade(grey, 0.72), deck = [120, 110, 95];
  const outline = [[-2.6, -12], [-2.9, -4], [-2.7, 5], [-1.3, 10.5], [0, 13], [1.3, 10.5], [2.7, 5], [2.9, -4], [2.6, -12]];
  F.push(...prismY(outline, 0.2, 3.2, greyD, deck), ...prismY(outline, 0.2, 0.9, [110, 40, 40])); // hull with a red waterline band
  F.push(...box(0, 5.0, 1.0, 4.2, 2.6, 8.0, grey), ...box(0, 7.4, 2.5, 3.2, 2.0, 3.6, grey), ...box(0, 8.6, 2.6, 2.6, 0.5, 2.4, greyD), ...box(0, 7.9, 4.4, 2.8, 0.8, 0.1, [90, 130, 150])); // superstructure, bridge, windows
  F.push(...xf(cyl(0, 0, 0, 0.9, 3.6, greyD, 8, 0.8), p => mv(rotX(p, 0.18), 0, 8.5, -1.6)), ...box(0, 7.0, -4.0, 1.8, 1.4, 3.0, grey)); // funnel + aft house
  F.push(...cyl(0, 11.5, 2.0, 0.15, 6.0, greyD, 5), ...box(0, 13.0, 2.0, 2.2, 0.15, 0.15, greyD), ...box(0.8, 13.9, 2.0, 1.4, 0.8, 0.05, o.team)); // mast + flag
  for (const [z, fwd] of [[8.0, true], [-8.5, false]]) { const recoil = k === 1 && fwd ? -0.6 : 0; F.push(...cyl(0, 4.2, z, 1.6, 1.2, grey, 8), ...box(0, 4.9, z - 0.2, 2.6, 1.2, 2.6, grey), ...cylZ(-0.5, 5.0, z + 1.8 + recoil * (fwd ? 1 : -1), 0.22, 4.0, IRON_D, 5), ...cylZ(0.5, 5.0, z + 1.8 + recoil * (fwd ? 1 : -1), 0.22, 4.0, IRON_D, 5)); if (k === 1 && fwd) F.push(...sph(0, 5.0, z + 4.6, 1.2, [255, 220, 120], 3)); }
  F.push(...box(-2.4, 3.9, -1, 0.3, 0.9, 12, greyD), ...box(2.4, 3.9, -1, 0.3, 0.9, 12, greyD)); // railings
  draw(ctx, xf(F, p => mv(p, 0, bob, 0)), o, 3.0 * sc, 40 * sc, 16 * sc);
}
export function hoverBoat3D(ctx, o, sc = 1) {
  const F = []; const k = atkFrame(o); const hull = mix(HULL_SF, o.team, 0.3), hullD = shade(hull, 0.65); const hover = 2.4 + Math.sin(((o.frame % 6) / 6) * Math.PI * 2) * 0.35;
  const outline = [[-2.4, -9], [-3.2, -2], [-2.6, 5], [-1.0, 9.6], [0, 11.5], [1.0, 9.6], [2.6, 5], [3.2, -2], [2.4, -9]];
  F.push(...prismY(outline, hover, 2.2, hullD, hull), ...prismY(outline.map(p => [p[0] * 1.06, p[1] * 1.02]), hover + 0.8, 0.5, o.team)); // hull + team stripe
  F.push(...prismY([[-2.0, -9.4], [2.0, -9.4], [2.0, -8.0], [-2.0, -8.0]], hover + 2.2, 1.4, hullD), ...cylZ(-1.1, hover + 2.9, -9.6, 0.6, 1.4, [60, 66, 78], 8), ...cylZ(1.1, hover + 2.9, -9.6, 0.6, 1.4, [60, 66, 78], 8), ...cylZ(-1.1, hover + 2.9, -10.4, 0.45, 0.3, [120, 230, 255, 0.9], 8), ...cylZ(1.1, hover + 2.9, -10.4, 0.45, 0.3, [120, 230, 255, 0.9], 8)); // engines with glow
  F.push(...sph(0, hover + 2.2, 1.0, 2.0, [120, 200, 255, 0.45], 5, p => p[1] >= hover + 2.2), ...box(0, hover + 2.6, -3.5, 3.2, 0.8, 3.0, hull)); // canopy + aft deck
  F.push(...xf(box(0, 0, 0, 0.5, 2.6, 0.9, hullD), p => mv(rotX(p, -0.25), 0, hover + 3.6, -6.0)), ...box(0, hover + 5.0, -6.2, 0.7, 0.3, 1.6, o.team)); // fin
  F.push(...cylZ(0, hover + 2.0, 8.0, 0.35, 4.0, IRON_D, 6), ...cylZ(0, hover + 2.0, 10.2, 0.3, 0.4, k === 1 ? [255, 255, 200] : CYAN, 6)); // bow cannon
  F.push(...cyl(0, hover * 0.5, 0, 6.0, 0.2, [90, 225, 255, 0.28], 12, 5.4, true)); // hover glow
  draw(ctx, F, o, 3.0 * sc, 36 * sc, 15 * sc);
}
export function laser3D(ctx, o) {
  const F = []; const k = atkFrame(o); const body = mix(HULL_SF, o.team, 0.3); const hover = 2.2 + Math.sin(((o.frame % 6) / 6) * Math.PI * 2) * 0.3;
  F.push(...cyl(0, hover + 0.8, 0, 5.2, 1.6, shade(body, 0.8), 6, 4.8), ...cyl(0, hover + 1.9, 0, 3.4, 0.6, body, 6), ...cyl(0, hover * 0.5, 0, 6.2, 0.2, [90, 225, 255, 0.28], 12, 5.4));
  for (let i = 0; i < 6; i++) F.push(...xf(box(0, hover + 1.0, 4.6, 0.6, 0.4, 1.0, o.team), p => rotY(p, i * Math.PI / 3)));
  F.push(...cyl(0, hover + 3.0, 0, 1.4, 1.6, shade(body, 0.7), 8), ...cylZ(0, hover + 3.6, 2.6, 0.7, 5.0, IRON_D, 8, 0.6), ...cylZ(0, hover + 3.6, 5.3, 0.5, 0.6, CYAN, 8), ...box(0, hover + 4.6, 0.6, 1.2, 0.5, 2.6, o.team)); // emitter
  if (k === 1 || k === 2) F.push(...cylZ(0, hover + 3.6, 12.0, k === 1 ? 0.45 : 0.25, 13.0, [120, 235, 255, 0.85], 6));
  draw(ctx, F, o, 2.4, 22, 10);
}
