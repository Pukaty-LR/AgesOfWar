// Isometric renderer: terrain chunks with elevation, water animation, entities, effects, fog of war.
import { T, ERAS, TEAM_COLORS } from '../../shared/data.js';
import { TW, TH, S, iso, facingToDir, unitSprite, buildingSprite, treeSprite, mineSprite, decoSprite, blit, rgb, shade, mix, teamRgb, animFrameCount, hexToRgb } from './sprites.js';

const CHUNK = 12;
const ELEV = 56;            // px per height unit above sea level
const SEA = 0.36;
const FR = 3;               // fog cells per tile

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.game = game;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.W = 0; this.H = 0; this.dpr = 1;
    this.chunks = new Map();
    this.particles = []; this.effects = [];
    this.time = 0;
    this.fogCanvas = null; this.fogCtx = null; this.fogImg = null; this.fogDirtyAt = 0;
    this.visible = null; this.explored = null;
    this.showHp = true;
    this.resize();
  }
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = this.canvas.clientWidth; this.H = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.W * this.dpr); this.canvas.height = Math.floor(this.H * this.dpr);
  }
  setMap(map, era) {
    this.map = map; this.era = era; this.eraDef = ERAS[era]; this.chunks.clear();
    const { w, h } = map;
    // vertex heights (w+1)*(h+1)
    this.vh = new Float32Array((w + 1) * (h + 1));
    const H = (x, y) => map.height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) this.vh[y * (w + 1) + x] = (H(x - 1, y - 1) + H(x, y - 1) + H(x - 1, y) + H(x, y)) / 4;
    this.visible = new Uint8Array(w * h); this.explored = new Uint8Array(w * h);
    this.fw = w * FR; this.fh = h * FR; this.visF = new Uint8Array(this.fw * this.fh); this.expF = new Uint8Array(this.fw * this.fh);
    this.fogRaw = document.createElement('canvas'); this.fogRaw.width = this.fw; this.fogRaw.height = this.fh; this.fogRawCtx = this.fogRaw.getContext('2d'); this.fogImg = this.fogRawCtx.createImageData(this.fw, this.fh);
    this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = this.fw; this.fogCanvas.height = this.fh; this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogCtx.fillStyle = 'rgb(6,5,8)'; this.fogCtx.fillRect(0, 0, this.fw, this.fh);
    this.particles = []; this.effects = [];
  }
  elevV(vx, vy) { const v = this.vh[vy * (this.map.w + 1) + vx]; return Math.max(0, v - SEA) * ELEV + Math.max(0, v - 0.83) * 520; }
  /** elevation (px) at world point, bilinear over vertex heights */
  elev(x, y) {
    if (!this.map) return 0;
    const w = this.map.w, h = this.map.h;
    x = Math.max(0, Math.min(w - 0.001, x)); y = Math.max(0, Math.min(h - 0.001, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const a = this.elevV(x0, y0), b = this.elevV(x0 + 1, y0), c = this.elevV(x0, y0 + 1), d = this.elevV(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  worldToScreen(x, y, z = 0) {
    const [ix, iy] = iso(x, y, z + this.elev(x, y)); const [cx, cy] = iso(this.cam.x, this.cam.y, this.elev(this.cam.x, this.cam.y));
    return [(ix - cx) * this.cam.zoom + this.W / 2, (iy - cy) * this.cam.zoom + this.H / 2];
  }
  screenToWorld(sx, sy) {
    const [cx, cy] = iso(this.cam.x, this.cam.y, this.elev(this.cam.x, this.cam.y));
    let ix = (sx - this.W / 2) / this.cam.zoom + cx, iy = (sy - this.H / 2) / this.cam.zoom + cy;
    let x = 0, y = 0;
    for (let i = 0; i < 3; i++) {
      const e = i === 0 ? 0 : this.elev(x, y);
      const iyy = iy + e;
      x = (ix / (TW / 2) + iyy / (TH / 2)) / 2; y = (iyy / (TH / 2) - ix / (TW / 2)) / 2;
    }
    return [x, y];
  }
  clampCamera() {
    if (!this.map) return;
    this.cam.x = Math.max(2, Math.min(this.map.w - 2, this.cam.x)); this.cam.y = Math.max(2, Math.min(this.map.h - 2, this.cam.y));
    this.cam.zoom = Math.max(0.45, Math.min(2.2, this.cam.zoom));
  }

  // ---------- terrain ----------
  tileColor(t, i) {
    const p = this.eraDef.palette;
    switch (t) { case T.GRASS: return p.grass; case T.DIRT: return p.dirt; case T.SAND: return p.sand; case T.SHALLOW: return mix(p.water, p.sand, 0.35); case T.WATER: return p.water; case T.ROCK: return p.rock; } return [255, 0, 255];
  }
  hash(x, y) { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; }
  tileQuad(x, y) { // 4 corners in iso px (absolute), with elevation
    const e = (vx, vy) => this.elevV(vx, vy);
    return [iso(x, y, e(x, y)), iso(x + 1, y, e(x + 1, y)), iso(x + 1, y + 1, e(x + 1, y + 1)), iso(x, y + 1, e(x, y + 1))];
  }
  buildChunk(cx, cy) {
    const map = this.map, w = map.w, h = map.h;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(w, x0 + CHUNK), y1 = Math.min(h, y0 + CHUNK);
    // bounds in iso px
    const left = iso(x0, y1)[0] - TW, right = iso(x1, y0)[0] + TW, top = iso(x0, y0)[1] - ELEV - 100 - TH, bottom = iso(x1, y1)[1] + TH;
    const cw = Math.ceil(right - left), ch = Math.ceil(bottom - top);
    const canvas = document.createElement('canvas'); canvas.width = cw * 1.5; canvas.height = ch * 1.5;
    const ctx = canvas.getContext('2d'); ctx.scale(1.5, 1.5); ctx.translate(-left, -top);
    const pal = this.eraDef.palette;
    // pass 1: base quads (with 1 tile margin so splats blend across chunks)
    const m = 1;
    const tiles = [];
    for (let y = Math.max(0, y0 - m); y < Math.min(h, y1 + m); y++) for (let x = Math.max(0, x0 - m); x < Math.min(w, x1 + m); x++) {
      const i = y * w + x; const t = map.tiles[i]; const q = this.tileQuad(x, y);
      // slope shading: light from top-left of screen => compare heights of NW corner vs SE corner
      const hNW = map.height[Math.max(0, y - 1) * w + Math.max(0, x - 1)], hSE = map.height[Math.min(h - 1, y + 1) * w + Math.min(w - 1, x + 1)];
      const isWater = t === T.WATER || t === T.SHALLOW;
      const slope = isWater ? 0 : (hNW - hSE) * 3.2;
      const hv = isWater ? 0 : (map.height[i] - 0.5) * 0.35;
      const k = Math.max(0.55, Math.min(1.4, 1 + slope + hv + (this.hash(x, y) - 0.5) * 0.08));
      let c = shade(this.tileColor(t, i), k);
      if (t === T.WATER) { const d = Math.max(0, SEA - map.height[i]); c = mix(pal.water, pal.deep, Math.min(1, d * 6)); }
      if (t === T.ROCK) c = shade(c, 0.78);
      tiles.push({ x, y, t, q, c, k });
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[3][0], q[3][1]); ctx.closePath();
      ctx.fillStyle = rgb(c); ctx.fill();
    }
    // pass 2: splat blending on land (soft transitions)
    for (const tl of tiles) {
      const cxp = (tl.q[0][0] + tl.q[2][0]) / 2, cyp = (tl.q[0][1] + tl.q[2][1]) / 2;
      const isW = tl.t === T.WATER || tl.t === T.SHALLOW;
      const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, TW * (isW ? 0.72 : 0.66));
      g.addColorStop(0, rgb(tl.c, isW ? 0.85 : 0.75)); g.addColorStop(1, rgb(tl.c, 0));
      ctx.fillStyle = g; ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(0, 0, TW * 0.66, 0, Math.PI * 2); ctx.restore(); ctx.fill();
    }
    // pass 3: details
    for (const tl of tiles) {
      if (tl.x < x0 || tl.x >= x1 || tl.y < y0 || tl.y >= y1) continue;
      const cxp = (tl.q[0][0] + tl.q[2][0]) / 2, cyp = (tl.q[0][1] + tl.q[2][1]) / 2;
      const r = this.hash(tl.x * 3, tl.y * 7);
      if (tl.t === T.GRASS) {
        const n = 3 + (r * 4) | 0; ctx.strokeStyle = rgb(shade(tl.c, 0.72)); ctx.lineWidth = 1;
        for (let k = 0; k < n; k++) { const rx = this.hash(tl.x * 11 + k, tl.y * 13), ry = this.hash(tl.x * 17, tl.y * 19 + k); const px = cxp + (rx - 0.5) * TW * 0.7, py = cyp + (ry - 0.5) * TH * 0.7; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 1.5, py - 4); ctx.moveTo(px + 2, py); ctx.lineTo(px + 3, py - 3.5); ctx.stroke(); }
        if (r > 0.86) { ctx.fillStyle = r > 0.93 ? '#e9e46a' : '#f0f0f0'; for (let k = 0; k < 3; k++) { const rx = this.hash(tl.x * 5 + k, tl.y * 3), ry = this.hash(tl.x * 9, tl.y * 7 + k); ctx.fillRect(cxp + (rx - 0.5) * TW * 0.6, cyp + (ry - 0.5) * TH * 0.6, 2, 2); } }
      } else if (tl.t === T.DIRT) {
        ctx.fillStyle = rgb(shade(tl.c, 0.75)); for (let k = 0; k < 4; k++) { const rx = this.hash(tl.x * 11 + k, tl.y * 13), ry = this.hash(tl.x * 17, tl.y * 19 + k); ctx.beginPath(); ctx.ellipse(cxp + (rx - 0.5) * TW * 0.7, cyp + (ry - 0.5) * TH * 0.7, 2, 1.2, 0, 0, 7); ctx.fill(); }
      } else if (tl.t === T.SAND) {
        ctx.fillStyle = rgb(shade(tl.c, 1.15)); for (let k = 0; k < 5; k++) { const rx = this.hash(tl.x * 11 + k, tl.y * 13), ry = this.hash(tl.x * 17, tl.y * 19 + k); ctx.fillRect(cxp + (rx - 0.5) * TW * 0.7, cyp + (ry - 0.5) * TH * 0.7, 1.5, 1); }
      } else if (tl.t === T.ROCK) {
        // boulders: a few faceted lumps per tile, snow on the highest
        const hgt = map.height[tl.y * w + tl.x]; const n = 2 + (r * 3) | 0;
        for (let k = 0; k < n; k++) {
          const rx = this.hash(tl.x * 13 + k, tl.y * 17), ry = this.hash(tl.x * 19, tl.y * 23 + k); const px = cxp + (rx - 0.5) * TW * 0.6, py = cyp + (ry - 0.5) * TH * 0.6; const s = 5 + rx * 7;
          ctx.fillStyle = rgb(shade(tl.c, 0.55)); ctx.beginPath(); ctx.moveTo(px - s, py + 1); ctx.lineTo(px - s * 0.5, py - s * 0.9); ctx.lineTo(px + s * 0.4, py - s * 1.1); ctx.lineTo(px + s, py - s * 0.2); ctx.lineTo(px + s * 0.6, py + s * 0.4); ctx.lineTo(px - s * 0.5, py + s * 0.4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(shade(tl.c, hgt > 0.93 ? 1.9 : 1.2)); ctx.beginPath(); ctx.moveTo(px - s * 0.5, py - s * 0.9); ctx.lineTo(px + s * 0.4, py - s * 1.1); ctx.lineTo(px + s * 0.2, py - s * 0.3); ctx.lineTo(px - s * 0.3, py - s * 0.2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(shade(tl.c, 0.85)); ctx.beginPath(); ctx.moveTo(px + s * 0.4, py - s * 1.1); ctx.lineTo(px + s, py - s * 0.2); ctx.lineTo(px + s * 0.6, py + s * 0.4); ctx.lineTo(px + s * 0.2, py - s * 0.3); ctx.closePath(); ctx.fill();
        }
      } else if (tl.t === T.SHALLOW) {
        // foam edge toward land neighbors
        const nb = [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]];
        for (const [ox, oy, a, b] of nb) { const nx = tl.x + ox, ny = tl.y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const nt = map.tiles[ny * w + nx]; if (nt !== T.WATER && nt !== T.SHALLOW) { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tl.q[a][0], tl.q[a][1]); ctx.lineTo(tl.q[b][0], tl.q[b][1]); ctx.stroke(); } }
      }
    }
    // grid-ish subtle edge darkening for land/water boundary
    return { canvas, left, top, cw, ch };
  }
  getChunk(cx, cy) { const k = cy * 1000 + cx; let c = this.chunks.get(k); if (!c) { c = this.buildChunk(cx, cy); this.chunks.set(k, c); } return c; }
  prebuild() { const nx = Math.ceil(this.map.w / CHUNK), ny = Math.ceil(this.map.h / CHUNK); for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) this.getChunk(cx, cy); }

  // ---------- fog ----------
  updateFog(ents, myTeam, players) {
    const w = this.map.w, h = this.map.h, fw = this.fw, fh = this.fh; const vis = this.visF; vis.fill(0);
    const mark = (x, y, r) => { const R = r * FR, R2 = R * R; const cx = x * FR, cy = y * FR; const x0 = Math.max(0, (cx - R) | 0), x1 = Math.min(fw - 1, (cx + R) | 0), y0 = Math.max(0, (cy - R) | 0), y1 = Math.min(fh - 1, (cy + R) | 0); for (let ty = y0; ty <= y1; ty++) { const dy = ty + 0.5 - cy; const row = ty * fw; for (let tx = x0; tx <= x1; tx++) { const dx = tx + 0.5 - cx; if (dx * dx + dy * dy <= R2) vis[row + tx] = 1; } } };
    for (const e of ents.values()) {
      if (e.o === undefined || players[e.o].team !== myTeam) continue;
      if (e.k === 'u') mark(e.x, e.y, e.sight || 7); else if (e.k === 'b') mark(e.x, e.y, e.t === 'tower' ? 9 : (e.w > 1 ? 8 : 5));
    }
    const d = this.fogImg.data; const exp = this.expF;
    for (let i = 0; i < fw * fh; i++) { if (vis[i]) exp[i] = 1; const a = vis[i] ? 0 : (exp[i] ? 125 : 255); d[i * 4] = 6; d[i * 4 + 1] = 5; d[i * 4 + 2] = 8; d[i * 4 + 3] = a; }
    this.fogRawCtx.putImageData(this.fogImg, 0, 0);
    const fc = this.fogCtx; fc.clearRect(0, 0, fw, fh); fc.filter = 'blur(1.2px)'; fc.drawImage(this.fogRaw, 0, 0); fc.filter = 'none';
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) { const fi = (ty * FR + 1) * fw + tx * FR + 1; const i = ty * w + tx; this.visible[i] = vis[fi]; if (vis[fi]) this.explored[i] = 1; }
  }
  isVisibleTile(x, y) { const w = this.map.w; const tx = x | 0, ty = y | 0; if (tx < 0 || ty < 0 || tx >= w || ty >= this.map.h) return false; return this.visible[ty * w + tx] === 1; }
  isExploredTile(x, y) { const w = this.map.w; const tx = x | 0, ty = y | 0; if (tx < 0 || ty < 0 || tx >= w || ty >= this.map.h) return false; return this.explored[ty * w + tx] === 1; }

  // ---------- particles / effects ----------
  spawnParticles(n, x, y, z, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 2) * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, z: z + (opts.z || 0) * Math.random(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (opts.vz || 20) * (0.3 + Math.random()), life: 0, max: (opts.life || 0.6) * (0.6 + Math.random() * 0.8), color: opts.colors[(Math.random() * opts.colors.length) | 0], size: (opts.size || 3) * (0.6 + Math.random() * 0.8), g: opts.gravity ?? 80, drag: opts.drag ?? 0.9, grow: opts.grow || 0 });
    }
  }
  addEffect(e) { e.t0 = this.time; this.effects.push(e); if (this.effects.length > 400) this.effects.shift(); }
  updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life += dt; if (p.life >= p.max) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt; p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
    }
    if (ps.length > 3000) ps.splice(0, ps.length - 3000);
  }

  // ---------- main draw ----------
  draw(dt, state) {
    this.time += dt;
    const ctx = this.ctx, g = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const z = this.cam.zoom;
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, this.W, this.H);
    if (!this.map) return;
    this.updateParticles(dt);
    const map = this.map, w = map.w, h = map.h;
    // visible world bounds (approx via screen corners)
    const corners = [this.screenToWorld(0, 0), this.screenToWorld(this.W, 0), this.screenToWorld(0, this.H), this.screenToWorld(this.W, this.H)];
    const minX = Math.floor(Math.min(...corners.map(c => c[0])) - 2), maxX = Math.ceil(Math.max(...corners.map(c => c[0])) + 2);
    const minY = Math.floor(Math.min(...corners.map(c => c[1])) - 2), maxY = Math.ceil(Math.max(...corners.map(c => c[1])) + 4);
    // camera iso origin (+ subtle shake from nearby explosions)
    this.shake = Math.max(0, (this.shake || 0) - dt * 3);
    const shx = this.shake ? (Math.random() - 0.5) * this.shake * 10 : 0, shy = this.shake ? (Math.random() - 0.5) * this.shake * 6 : 0;
    const [cix, ciy] = iso(this.cam.x, this.cam.y, this.elev(this.cam.x, this.cam.y));
    const ox = this.W / 2 - cix * z, oy = this.H / 2 - ciy * z;
    if (this.shake) ctx.translate(shx, shy);
    // terrain chunks
    const c0x = Math.max(0, Math.floor(minX / CHUNK)), c1x = Math.min(Math.ceil(w / CHUNK) - 1, Math.floor(maxX / CHUNK));
    const c0y = Math.max(0, Math.floor(minY / CHUNK)), c1y = Math.min(Math.ceil(h / CHUNK) - 1, Math.floor(maxY / CHUNK));
    ctx.imageSmoothingEnabled = true;
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const ch = this.getChunk(cx, cy);
      const sx = ox + ch.left * z, sy = oy + ch.top * z, sw = ch.cw * z, sh = ch.ch * z;
      if (sx + sw < 0 || sy + sh < 0 || sx > this.W || sy > this.H) continue;
      ctx.drawImage(ch.canvas, sx, sy, sw, sh);
    }
    // water animation
    this.drawWater(ctx, minX, maxX, minY, maxY, ox, oy, z);
    // drifting cloud shadows
    this.drawClouds(ctx, ox, oy, z);
    // ground layer: effects on ground, selection circles, rally, placement
    this.drawGround(ctx, state, ox, oy, z);
    // sortable drawables
    const list = [];
    const ents = g.ents;
    const myTeam = g.myTeam, players = g.players;
    for (const d of map.deco) { if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue; if (!this.isExploredTile(d.x, d.y)) continue; list.push({ depth: d.x + d.y, kind: 'deco', d }); }
    for (const e of ents.values()) {
      if (e.k === 'p') continue;
      const ex = e.rx ?? e.x, ey = e.ry ?? e.y;
      if (ex < minX - 2 || ex > maxX + 2 || ey < minY - 2 || ey > maxY + 2) continue;
      if (e.k === 'u') { if (e.hd) continue; if (players[e.o].team !== myTeam && !this.isVisibleTile(ex, ey)) continue; list.push({ depth: ex + ey, kind: 'u', e }); }
      else if (e.k === 'b') { if (!this.isExploredTile(e.x, e.y) && !this.isExploredTile(e.tx, e.ty)) continue; list.push({ depth: e.tx + e.w + e.ty + e.h - 1.0 - (e.w > 1 ? 0.5 : 0), kind: 'b', e }); }
      else if (e.k === 't') { if (!this.isExploredTile(e.x, e.y)) continue; list.push({ depth: e.x + e.y, kind: 't', e }); }
      else if (e.k === 'm') { if (!this.isExploredTile(e.x, e.y)) continue; list.push({ depth: e.tx + e.ty + 3, kind: 'm', e }); }
    }
    for (const ef of this.effects) if (ef.kind === 'corpse' || ef.kind === 'rubble' || ef.kind === 'stump') list.push({ depth: ef.x + ef.y - 0.01, kind: 'fx', ef });
    list.sort((a, b) => a.depth - b.depth);
    for (const it of list) {
      switch (it.kind) {
        case 'u': this.drawUnit(ctx, it.e, ox, oy, z); break;
        case 'b': this.drawBuilding(ctx, it.e, ox, oy, z); break;
        case 't': { const e = it.e; const [sx, sy] = this.worldToScreen(e.x, e.y + 0.35); const sway = Math.round(Math.sin(this.time * 1.3 + e.x * 0.7 + e.y * 0.3) * 2) / 2; blit(ctx, treeSprite(e.v, this.era, sway), sx, sy, z); break; }
        case 'm': { const e = it.e; const [sx, sy] = this.worldToScreen(e.x, e.y); blit(ctx, mineSprite(this.era), sx, sy, z); break; }
        case 'deco': { const d = it.d; const [sx, sy] = this.worldToScreen(d.x, d.y); blit(ctx, decoSprite(d.k, d.v, this.era), sx, sy, z); break; }
        case 'fx': this.drawGroundEffect(ctx, it.ef, z); break;
      }
    }
    // projectiles
    for (const e of ents.values()) if (e.k === 'p') this.drawProjectile(ctx, e, z);
    // air effects & particles
    this.drawAirEffects(ctx, z);
    this.drawParticles(ctx, z);
    // fog
    this.drawFog(ctx, ox, oy, z);
    // slow day/night tint (10-minute cycle, subtle)
    { const ph = (this.time / 600) * Math.PI * 2; const night = Math.max(0, -Math.cos(ph)); const dusk = Math.max(0, Math.sin(ph)) * Math.max(0, Math.cos(ph)) * 2;
      if (night > 0.02) { ctx.fillStyle = `rgba(20,30,70,${night * 0.22})`; ctx.fillRect(0, 0, this.W, this.H); }
      if (dusk > 0.02) { ctx.fillStyle = `rgba(255,140,60,${dusk * 0.08})`; ctx.fillRect(0, 0, this.W, this.H); } }
    // overlays: health bars, selection markers above fog
    this.drawOverlays(ctx, state, ox, oy, z, list);
  }

  drawClouds(ctx, ox, oy, z) {
    // a few large soft shadows drifting across the world (world-space, iso-projected)
    if (!this.clouds) { this.clouds = []; for (let i = 0; i < 7; i++) this.clouds.push({ x: Math.random() * this.map.w, y: Math.random() * this.map.h, r: 7 + Math.random() * 9, s: 0.25 + Math.random() * 0.3, a: 0.10 + Math.random() * 0.08 }); }
    ctx.save(); ctx.translate(ox, oy); ctx.scale(z, z);
    for (const c of this.clouds) {
      c.x += c.s * 0.016; c.y += c.s * 0.010; if (c.x > this.map.w + c.r) c.x = -c.r; if (c.y > this.map.h + c.r) c.y = -c.r;
      const [cx, cy] = iso(c.x, c.y, 0); const rx = c.r * TW / 2, ry = c.r * TH / 2;
      if (cx * z + ox < -rx * z || cx * z + ox > this.W + rx * z || cy * z + oy < -ry * z || cy * z + oy > this.H + ry * z) continue;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx); grd.addColorStop(0, `rgba(10,14,30,${c.a})`); grd.addColorStop(0.6, `rgba(10,14,30,${c.a * 0.6})`); grd.addColorStop(1, 'rgba(10,14,30,0)');
      ctx.fillStyle = grd; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy); ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  drawWater(ctx, minX, maxX, minY, maxY, ox, oy, z) {
    const map = this.map, w = map.w, h = map.h; const t = this.time;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(z, z);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const x0 = Math.max(0, minX), x1 = Math.min(w - 1, maxX), y0 = Math.max(0, minY), y1 = Math.min(h - 1, maxY);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tt = map.tiles[y * w + x]; if (tt !== T.WATER && tt !== T.SHALLOW) continue;
      if (!this.explored[y * w + x]) continue;
      const r = this.hash(x, y); const [cx, cy] = iso(x + 0.5, y + 0.5, 0);
      const ph = t * 1.4 + r * 6.28; const k = (Math.sin(ph) + 1) / 2;
      const len = 6 + k * 10; const px = cx + (r - 0.5) * 30 + Math.sin(ph * 0.5) * 4, py = cy + (this.hash(y, x) - 0.5) * 12;
      ctx.globalAlpha = 0.12 + k * 0.25; ctx.fillRect(px - len / 2, py, len, 1.4);
      if (tt === T.SHALLOW) { ctx.globalAlpha = 0.1 + (1 - k) * 0.2; ctx.fillRect(px - len / 3 + 8, py + 4, len * 0.6, 1.2); }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  drawGround(ctx, state, ox, oy, z) {
    const g = this.game;
    // selection circles
    for (const id of g.selection) {
      const e = g.ents.get(id); if (!e || e.hd) continue;
      const [sx, sy] = this.worldToScreen(e.rx ?? e.x, e.ry ?? e.y);
      const r = e.k === 'b' ? Math.max(e.w, e.h) * 0.62 : (g.unitDef(e)?.size || 0.35) * 1.9;
      ctx.strokeStyle = e.o === g.me ? 'rgba(90,255,120,0.9)' : (g.players[e.o]?.team === g.myTeam ? 'rgba(255,230,90,0.9)' : 'rgba(255,80,80,0.9)');
      ctx.lineWidth = 1.5 * z; ctx.beginPath(); ctx.ellipse(sx, sy, r * TW / 2 * z, r * TH / 2 * z, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // hero aura rings (own team only)
    for (const e of g.ents.values()) {
      if (e.k !== 'u' || e.hd || g.players[e.o].team !== g.myTeam) continue;
      const def = g.unitDef(e); if (!def || !def.aura) continue;
      const [sx, sy] = this.worldToScreen(e.rx ?? e.x, e.ry ?? e.y); const buffed = def.ability && e.bf > g.tickNow(); const r = buffed ? def.ability.range : def.aura.range; const pulse = 0.5 + Math.sin(this.time * (buffed ? 6 : 2)) * 0.15;
      ctx.strokeStyle = buffed ? `rgba(255,240,160,${pulse + 0.3})` : `rgba(255,220,120,${pulse * 0.5})`; ctx.lineWidth = (buffed ? 3 : 2) * z; ctx.setLineDash([6 * z, 6 * z]); ctx.beginPath(); ctx.ellipse(sx, sy, r * TW / 2 * z, r * TH / 2 * z, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (buffed) { const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * TW / 2 * z); grd.addColorStop(0, 'rgba(255,220,120,0.12)'); grd.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(sx, sy, r * TW / 2 * z, r * TH / 2 * z, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    // rally points of selected buildings
    for (const id of g.selection) {
      const e = g.ents.get(id); if (!e || e.k !== 'b' || !e.r || e.o !== g.me) continue;
      const [ax, ay] = this.worldToScreen(e.x, e.y), [bx, by] = this.worldToScreen(e.r.x, e.r.y);
      ctx.strokeStyle = 'rgba(255,230,90,0.6)'; ctx.setLineDash([4 * z, 4 * z]); ctx.lineWidth = 1.2 * z; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 18 * z); ctx.stroke(); ctx.fillStyle = TEAM_COLORS[g.players[e.o].color].hex; ctx.beginPath(); ctx.moveTo(bx, by - 18 * z); ctx.lineTo(bx + 10 * z, by - 14 * z); ctx.lineTo(bx, by - 10 * z); ctx.fill();
    }
    // move markers
    for (const ef of this.effects) {
      if (ef.kind !== 'marker') continue;
      const age = this.time - ef.t0; if (age > 0.8) continue;
      const [sx, sy] = this.worldToScreen(ef.x, ef.y); const k = 1 - age / 0.8;
      ctx.strokeStyle = ef.color; ctx.globalAlpha = k; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.ellipse(sx, sy, (6 + (1 - k) * 14) * z, (3 + (1 - k) * 7) * z, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // placement ghost / wall preview
    if (state.placing) this.drawPlacement(ctx, state, z);
  }
  drawPlacement(ctx, state, z) {
    const g = this.game; const p = state.placing;
    const drawTile = (tx, ty, ok, alpha = 0.45) => { const q = this.tileQuad(tx, ty); const [cix, ciy] = iso(this.cam.x, this.cam.y, this.elev(this.cam.x, this.cam.y)); const ox = this.W / 2 - cix * z, oy = this.H / 2 - ciy * z; ctx.beginPath(); for (let i = 0; i < 4; i++) { const px = ox + q[i][0] * z, py = oy + q[i][1] * z; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = ok ? `rgba(80,255,120,${alpha})` : `rgba(255,70,70,${alpha})`; ctx.fill(); ctx.strokeStyle = ok ? 'rgba(120,255,160,0.9)' : 'rgba(255,120,120,0.9)'; ctx.lineWidth = 1; ctx.stroke(); };
    if (p.type === 'wall') {
      if (p.start) { drawTile(p.start.x, p.start.y, true, 0.6); for (const t of (p.preview || [])) drawTile(t.x, t.y, g.tileBuildable(t.x, t.y), 0.4); if (p.preview === null && p.hover) drawTile(p.hover.x, p.hover.y, false); }
      else if (p.hover) drawTile(p.hover.x, p.hover.y, g.tileBuildable(p.hover.x, p.hover.y));
      return;
    }
    if (!p.hover) return;
    const def = g.tech.buildings[p.type];
    const ok = g.canPlace(p.type, p.hover.x, p.hover.y);
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) drawTile(p.hover.x + x, p.hover.y + y, ok && g.tileBuildable(p.hover.x + x, p.hover.y + y));
    const spr = buildingSprite(def.sprite, def.w, def.h, g.players[g.me].color, true, 1, 0, this.era);
    const [sx, sy] = this.worldToScreen(p.hover.x, p.hover.y);
    ctx.globalAlpha = 0.6; blit(ctx, spr, sx, sy, z); ctx.globalAlpha = 1;
  }

  drawUnit(ctx, e, ox, oy, z) {
    const g = this.game; const def = g.unitDef(e); if (!def) return;
    const x = e.rx ?? e.x, y = e.ry ?? e.y;
    const [sx, sy] = this.worldToScreen(x, y);
    const dir = facingToDir(e.rf ?? e.f);
    let anim = e.a; let frame = 0;
    const moving = e.moving;
    if (anim === 'attack' || anim === 'work') { const dtk = (g.tickNow() - e.at); const fr = animFrameCount(anim); frame = Math.min(fr - 1, Math.floor(dtk / 2)); if (dtk > fr * 2 + 4 && !moving) { anim = e.a === 'work' ? 'work' : 'idle'; frame = anim === 'work' ? Math.floor(this.time * 6) % 4 : 0; } }
    else if (moving || anim === 'walk') { anim = 'walk'; frame = Math.floor((this.time * def.speed * 2.2 + e.i * 0.7)) % 6; }
    else { anim = 'idle'; frame = Math.floor(this.time * 2.5 + e.i * 0.9) % 4; }
    if (def.role === 'ship') { anim = anim === 'attack' ? 'attack' : 'walk'; if (anim === 'walk') frame = Math.floor(this.time * 3 + e.i) % 6; }
    const extra = { carry: e.c || '', faction: g.players[e.o].faction, workKind: e.o2 === 'gather' ? (g.ents.get(e.tg)?.k === 'm' ? 'mine' : 'tree') : '' };
    const spr = unitSprite(def.sprite, g.players[e.o].color, dir, anim, frame, extra);
    // hover highlight / hit flash
    if (e.hover && !g.selection.has(e.i)) ctx.filter = 'brightness(1.25)';
    if (e.hitAt && this.time - e.hitAt < 0.12) { ctx.filter = 'brightness(1.8)'; }
    blit(ctx, spr, sx, sy, z);
    ctx.filter = 'none';
    e.sx = sx; e.sy = sy; e.sh = spr.h * z; e.sw = spr.w * z; e.say = spr.ay * z;
  }
  drawBuilding(ctx, e, ox, oy, z) {
    const g = this.game; const def = g.buildingDef(e); if (!def) return;
    const [sx, sy] = this.worldToScreen(e.tx, e.ty);
    let mask = 0;
    if (def.isWall) {
      const nb = (dx, dy) => g.wallAt(e.tx + dx, e.ty + dy, e.o) ? 1 : 0;
      const n = nb(0, -1), ea = nb(1, 0), s = nb(0, 1), w = nb(-1, 0);
      mask = n | (ea << 1) | (s << 2) | (w << 3);
      // diagonal connectors only where no orthogonal link exists between the two
      if (!n && !ea && nb(1, -1)) mask |= 16; if (!ea && !s && nb(1, 1)) mask |= 32; if (!s && !w && nb(-1, 1)) mask |= 64; if (!w && !n && nb(-1, -1)) mask |= 128;
    }
    const spr = buildingSprite(def.sprite, e.w, e.h, g.players[e.o].color, !!e.bl, e.pr, mask, this.era, e.lv || 1);
    const visible = this.isVisibleTile(e.x, e.y);
    // soft drop shadow under the footprint
    if (e.bl) { const [cx, cy] = this.worldToScreen(e.x + e.w * 0.08, e.y + e.h * 0.08); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx, cy, e.w * TW / 2 * 0.62 * z, e.h * TH / 2 * 0.62 * z, 0, 0, Math.PI * 2); ctx.fill(); }
    if (e.hover || g.selection.has(e.i)) { ctx.filter = e.hover && !g.selection.has(e.i) ? 'brightness(1.15)' : 'none'; }
    if (!visible) ctx.filter = 'brightness(0.7)';
    if (e.hitAt && this.time - e.hitAt < 0.1) ctx.filter = 'brightness(1.6)';
    blit(ctx, spr, sx, sy, z);
    ctx.filter = 'none';
    e.sx = sx; e.sy = sy; e.sh = spr.h * z; e.sw = spr.w * z; e.say = spr.ay * z; e.sax = spr.ax * z;
    // damage smoke
    if (e.bl && e.hp < e.m * 0.5 && visible && Math.random() < (0.5 - e.hp / e.m) * 0.5) {
      this.particles.push({ x: e.x + (Math.random() - 0.5) * e.w * 0.6, y: e.y + (Math.random() - 0.5) * e.h * 0.6, z: 20 + Math.random() * 20, vx: 0.2, vy: -0.2, vz: 18, life: 0, max: 2.2, color: [60, 55, 50], size: 5, g: -6, drag: 0.98, grow: 4, alpha: 0.5 });
      if (e.hp < e.m * 0.25 && Math.random() < 0.3) this.particles.push({ x: e.x + (Math.random() - 0.5) * e.w * 0.5, y: e.y + (Math.random() - 0.5) * e.h * 0.5, z: 10, vx: 0, vy: 0, vz: 25, life: 0, max: 0.5, color: [255, 150, 40], size: 4, g: 0, drag: 0.95, grow: -2 });
    }
    // ambient life: chimney smoke, forge glow, energy pulses; tower muzzle flash
    if (e.bl && visible) {
      const sp = def.sprite;
      if ((sp === 'ww2_factory' || sp === 'ww2_hall' || sp === 'ant_siege') && Math.random() < 0.35) this.particles.push({ x: e.tx + (sp === 'ww2_factory' ? 2.55 : (sp === 'ww2_hall' ? 2.1 : 0.6)), y: e.ty + (sp === 'ww2_factory' ? 0.55 : (sp === 'ww2_hall' ? 0.6 : 2.3)), z: sp === 'ww2_factory' ? 56 : (sp === 'ww2_hall' ? 46 : 22), vx: 0.15, vy: -0.15, vz: 12, life: 0, max: 2.6, color: [150, 150, 150], size: 2.5, g: -3, drag: 0.985, grow: 3, alpha: 0.35 });
      if (sp.startsWith('sf_') && Math.random() < 0.08) this.particles.push({ x: e.x + (Math.random() - 0.5) * e.w * 0.5, y: e.y + (Math.random() - 0.5) * e.h * 0.5, z: 10 + Math.random() * 20, vx: 0, vy: 0, vz: 10, life: 0, max: 1.4, color: [120, 230, 255], size: 1.6, g: 0, drag: 1, grow: -1, alpha: 0.7 });
      if (def.attack && e.at !== undefined && (g.tickNow() - e.at) < 3) { const [fx, fy] = this.worldToScreen(e.x, e.y, (e.lv || 1) >= 2 ? 70 : 56); ctx.fillStyle = this.era === 'scifi' ? 'rgba(120,230,255,0.85)' : 'rgba(255,220,140,0.85)'; ctx.beginPath(); ctx.arc(fx, fy, 5 * z, 0, 7); ctx.fill(); }
    }
    // training progress bar
    if (e.q && e.q.length && e.o === g.me) {
      const [bx, by] = this.worldToScreen(e.x, e.y); const w2 = 40 * z;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - w2 / 2, by - e.sh * 0.15, w2, 4 * z); ctx.fillStyle = '#f1d36a'; ctx.fillRect(bx - w2 / 2, by - e.sh * 0.15, w2 * e.q[0].p, 4 * z);
    }
  }
  drawProjectile(ctx, e, z) {
    const g = this.game;
    const x = e.rx ?? e.x, y = e.ry ?? e.y;
    if (!this.isVisibleTile(x, y) && g.players[e.o]?.team !== g.myTeam) return;
    const total = Math.hypot(e.tx - e.sx, e.ty - e.sy) || 1; const done = Math.hypot(x - e.sx, y - e.sy) / total; const k = Math.min(1, done);
    const arcH = e.arc * total * 22 * Math.sin(Math.PI * k);
    const [sx, sy] = this.worldToScreen(x, y, 14 + arcH);
    const dx = e.tx - e.sx, dy = e.ty - e.sy; const sa = Math.atan2((dx + dy) * 0.5, dx - dy) - (e.arc ? (k - 0.5) * 1.2 : 0);
    const [shx, shy] = this.worldToScreen(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(shx, shy, 3 * z, 1.5 * z, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(sa); ctx.scale(z, z);
    switch (e.t) {
      case 'arrow': ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2); ctx.lineTo(3, 2); ctx.fill(); ctx.fillStyle = '#c33'; ctx.fillRect(-8, -1.5, 3, 3); break;
      case 'bolt': ctx.strokeStyle = '#c9b28a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(9, 0); ctx.stroke(); ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.fill(); break;
      case 'bullet': ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(3, 0); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(1, -1, 3, 2); break;
      case 'rock': ctx.fillStyle = '#7a7268'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#a49a8e'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 2, 0, 7); ctx.fill(); if (k < 0.9) { ctx.fillStyle = 'rgba(255,200,120,0.5)'; ctx.beginPath(); ctx.arc(-6, 0, 3, 0, 7); ctx.fill(); } break;
      case 'shell': ctx.fillStyle = '#4a4a44'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,200,120,0.6)'; ctx.beginPath(); ctx.ellipse(-7, 0, 4, 2, 0, 0, 7); ctx.fill(); break;
      case 'plasma': { ctx.fillStyle = 'rgba(90,225,255,0.35)'; ctx.beginPath(); ctx.ellipse(-2, 0, 9, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(120,235,255,0.95)'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(1, 0, 2.2, 1.2, 0, 0, 7); ctx.fill(); break; }
      case 'rail': { ctx.strokeStyle = 'rgba(90,200,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(4, 0); ctx.stroke(); ctx.strokeStyle = 'rgba(220,250,255,0.95)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(4, 0); ctx.stroke(); break; }
      case 'plasmaShell': { ctx.fillStyle = 'rgba(197,106,255,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(220,150,255,0.95)'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-1, -1, 1.8, 0, 7); ctx.fill(); break; }
      case 'flame': { const k2 = Math.random(); ctx.fillStyle = `rgba(255,${120 + k2 * 100 | 0},30,0.75)`; ctx.beginPath(); ctx.ellipse(0, 0, 6 + k2 * 3, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,240,170,0.8)'; ctx.beginPath(); ctx.ellipse(-2, 0, 3, 2, 0, 0, 7); ctx.fill(); break; }
    }
    ctx.restore();
    if (e.t === 'flame' && Math.random() < 0.8) this.particles.push({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, z: 12, vx: 0, vy: 0, vz: 14, life: 0, max: 0.4, color: [255, 140 + Math.random() * 80, 40], size: 3, g: -10, drag: 0.9, grow: -3, alpha: 0.8 });
    if (e.t === 'shell' || e.t === 'rock') { if (Math.random() < 0.6) this.particles.push({ x, y, z: 14 + arcH, vx: 0, vy: 0, vz: 5, life: 0, max: 0.35, color: [120, 120, 120], size: 2.5, g: 0, drag: 0.9, grow: 3, alpha: 0.5 }); }
    if (e.t === 'plasmaShell' || e.t === 'plasma') { if (Math.random() < 0.7) this.particles.push({ x, y, z: 14 + arcH, vx: 0, vy: 0, vz: 2, life: 0, max: 0.3, color: e.t === 'plasma' ? [120, 230, 255] : [197, 106, 255], size: 2.2, g: 0, drag: 0.9, grow: -3, alpha: 0.7 }); }
  }
  drawGroundEffect(ctx, ef, z) {
    const age = this.time - ef.t0; const g = this.game;
    if (ef.kind === 'corpse') {
      if (age > 10) return;
      const [sx, sy] = this.worldToScreen(ef.x, ef.y);
      const fall = Math.min(1, age / 0.45);
      const spr = unitSprite(ef.sprite, ef.color, facingToDir(ef.f), 'idle', 0, { faction: ef.faction });
      ctx.save(); ctx.globalAlpha = age > 7 ? Math.max(0, 1 - (age - 7) / 3) : 1; ctx.translate(sx, sy);
      ctx.rotate((ef.f > Math.PI ? -1 : 1) * fall * Math.PI / 2 * (ef.big ? 0.25 : 1)); ctx.scale(1, 1 - fall * 0.4);
      ctx.filter = `brightness(${1 - fall * 0.5}) saturate(${1 - fall * 0.5})`;
      ctx.drawImage(spr.canvas, -spr.ax * z, -spr.ay * z, spr.w * z, spr.h * z); ctx.restore(); ctx.filter = 'none';
      if (age < 0.3 && ef.blood && !ef.big) { const [bx, by] = this.worldToScreen(ef.x, ef.y); ctx.fillStyle = `rgba(120,20,20,${0.5 * (age / 0.3)})`; ctx.beginPath(); ctx.ellipse(bx, by, 9 * z, 4.5 * z, 0, 0, 7); ctx.fill(); }
      else if (ef.blood && !ef.big) { const [bx, by] = this.worldToScreen(ef.x, ef.y); ctx.fillStyle = `rgba(110,18,18,${0.5 * Math.max(0, 1 - (age - 7) / 3)})`; ctx.beginPath(); ctx.ellipse(bx, by, 9 * z, 4.5 * z, 0, 0, 7); ctx.fill(); }
    } else if (ef.kind === 'rubble') {
      if (age > 60) return;
      const [sx, sy] = this.worldToScreen(ef.x, ef.y); const rw = ef.w * TW / 2 * z, rh = ef.h * TH / 2 * z;
      ctx.save(); ctx.globalAlpha = age > 45 ? Math.max(0, 1 - (age - 45) / 15) : 1; ctx.translate(sx, sy);
      const RB = { antiquity: ['#3a342c', '#6b625a', '#8a8078'], ww2: ['#2e2c28', '#5a5650', '#7a746c'], scifi: ['#262a36', '#4c5466', '#6f7a90'] }[this.era] || ['#3a342c', '#6b625a', '#8a8078'];
      ctx.fillStyle = RB[0]; ctx.beginPath(); ctx.moveTo(0, -rh); ctx.lineTo(rw, 0); ctx.lineTo(0, rh); ctx.lineTo(-rw, 0); ctx.closePath(); ctx.fill();
      const rr = this.hash(ef.x * 10, ef.y * 10);
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + rr * 6, r = (0.2 + ((i * 7) % 5) / 8); const px = Math.cos(a) * r * rw, py = Math.sin(a) * r * rh; ctx.fillStyle = i % 2 ? RB[1] : RB[2]; ctx.beginPath(); ctx.moveTo(px - 6 * z, py); ctx.lineTo(px - 2 * z, py - 7 * z); ctx.lineTo(px + 5 * z, py - 5 * z); ctx.lineTo(px + 6 * z, py + 2 * z); ctx.lineTo(px, py + 4 * z); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.stroke(); }
      ctx.restore();
    } else if (ef.kind === 'stump') {
      if (age > 120) return; const [sx, sy] = this.worldToScreen(ef.x, ef.y); ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(sx, sy - 3 * z, 5 * z, 3 * z, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.ellipse(sx, sy - 5 * z, 4 * z, 2.2 * z, 0, 0, 7); ctx.fill();
    }
  }
  drawAirEffects(ctx, z) {
    const now = this.time;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i]; const age = now - ef.t0;
      const maxAge = { explosion: 0.7, flash: 0.15, corpse: 10, rubble: 60, marker: 0.8, stump: 120, text: 1.2, ring: 1.0 }[ef.kind] || 1;
      if (age > maxAge) { this.effects.splice(i, 1); continue; }
      if (ef.kind === 'explosion') {
        const k = age / maxAge; const [sx, sy] = this.worldToScreen(ef.x, ef.y, 6);
        const r = (ef.r * TW / 2) * (0.3 + k * 0.9) * z;
        ctx.globalAlpha = 1 - k; const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); grd.addColorStop(0, 'rgba(255,240,180,0.9)'); grd.addColorStop(0.4, 'rgba(255,140,40,0.7)'); grd.addColorStop(1, 'rgba(60,30,10,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.6, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else if (ef.kind === 'flash') {
        const [sx, sy] = this.worldToScreen(ef.x, ef.y, 12); ctx.globalAlpha = 1 - age / maxAge; ctx.fillStyle = ef.color || '#fff'; ctx.beginPath(); ctx.arc(sx, sy, (4 + age * 40) * z, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else if (ef.kind === 'ring') {
        const [sx, sy] = this.worldToScreen(ef.x, ef.y); const k = age / maxAge; ctx.globalAlpha = 1 - k; ctx.strokeStyle = ef.color; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.ellipse(sx, sy, (10 + k * 40) * z, (5 + k * 20) * z, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (ef.kind === 'text') {
        const [sx, sy] = this.worldToScreen(ef.x, ef.y, 30 + age * 30); ctx.globalAlpha = 1 - age / maxAge; ctx.font = `bold ${13 * z}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = ef.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(ef.text, sx, sy); ctx.fillText(ef.text, sx, sy); ctx.globalAlpha = 1;
      }
    }
  }
  drawParticles(ctx, z) {
    for (const p of this.particles) {
      const [sx, sy] = this.worldToScreen(p.x, p.y, p.z); const k = p.life / p.max;
      const size = (p.size + p.grow * p.life) * z; if (size <= 0) continue;
      ctx.globalAlpha = (p.alpha ?? 1) * (1 - k); ctx.fillStyle = rgb(p.color); ctx.beginPath(); ctx.arc(sx, sy, size, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawFog(ctx, ox, oy, z) {
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(z, z);
    ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, 0, 0); // world tile units -> iso px
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.fogCanvas, 0, 0, this.fw, this.fh, 0, 0, this.map.w, this.map.h);
    ctx.restore();
  }
  drawOverlays(ctx, state, ox, oy, z, list) {
    const g = this.game;
    const showAll = this.showHp || state.altHeld;
    for (const it of list) {
      if (it.kind !== 'u' && it.kind !== 'b') continue;
      const e = it.e; if (e.sx === undefined) continue;
      const selected = g.selection.has(e.i);
      const damaged = e.hp < e.m;
      if (!(showAll || selected || e.hover || (damaged && it.kind === 'b' && e.o === g.me) || (damaged && selected))) continue;
      if (it.kind === 'b' && !e.bl) { // construction progress
        const w2 = Math.max(30, e.w * 16) * z; const x = e.sx - w2 / 2 + (e.w * TW / 4) * z, y = e.sy - e.say + 6 * z + (e.h * TH / 4) * z * 0;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w2, 5 * z); ctx.fillStyle = '#e0c060'; ctx.fillRect(x, y, w2 * e.pr, 5 * z);
        continue;
      }
      const w2 = (it.kind === 'b' ? Math.max(30, e.w * 16) : 22) * z;
      const x = e.sx - w2 / 2 + (it.kind === 'b' ? (e.w - e.h) * TW / 4 * z : 0), y = e.sy - (it.kind === 'b' ? e.say - 2 * z : e.say + 4 * z);
      const f = e.hp / e.m; const col = f > 0.6 ? '#3fd04a' : f > 0.3 ? '#e8c02a' : '#e04030';
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y - 1, w2 + 2, 4 * z + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w2 * f, 4 * z);
      if (it.kind === 'u' && e.c) { ctx.fillStyle = e.c === 'p' ? this.eraDef.resources.p.color : this.eraDef.resources.s.color; ctx.fillRect(x + w2 + 3 * z, y - 1, 5 * z, 5 * z); }
    }
    // selection box
    if (state.drag && state.dragMoved) {
      const d = state.drag; ctx.strokeStyle = 'rgba(120,255,140,0.9)'; ctx.fillStyle = 'rgba(120,255,140,0.12)'; ctx.lineWidth = 1;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    // attack-move cursor hint
    if (state.mode === 'amove' || state.mode === 'attack') { ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 2; const mx = state.mouse.x, my = state.mouse.y; ctx.beginPath(); ctx.arc(mx, my, 12, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx - 16, my); ctx.lineTo(mx - 6, my); ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 16, my); ctx.moveTo(mx, my - 16); ctx.lineTo(mx, my - 6); ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 16); ctx.stroke(); }
  }

  // ---------- picking ----------
  pick(sx, sy) {
    const g = this.game; let best = null, bestD = Infinity;
    // 1) units by sprite box
    for (const e of g.ents.values()) {
      if (e.k !== 'u' || e.sx === undefined || e.hd) continue;
      if (g.players[e.o].team !== g.myTeam && !this.isVisibleTile(e.x, e.y)) continue;
      const hw = e.sw * 0.4, top = e.sy - e.say * 0.85, bottom = e.sy + 4;
      if (sx >= e.sx - hw && sx <= e.sx + hw && sy >= top && sy <= bottom) { const d = Math.abs(sx - e.sx) + Math.abs(sy - (e.sy - e.say * 0.4)); if (d < bestD) { bestD = d; best = e; } }
    }
    if (best) return best;
    // 2) buildings by exact footprint (world space) - reliable when buildings are close together
    const [wx0, wy0] = this.screenToWorld(sx, sy);
    for (const e of g.ents.values()) {
      if (e.k !== 'b' || e.sx === undefined || !this.isExploredTile(e.x, e.y)) continue;
      if (wx0 >= e.tx && wx0 < e.tx + e.w && wy0 >= e.ty && wy0 < e.ty + e.h) return e;
    }
    // 3) buildings by the upper part of their sprite (walls/roofs above the footprint), nearest footprint wins
    for (const e of g.ents.values()) {
      if (e.k !== 'b' || e.sx === undefined || !this.isExploredTile(e.x, e.y)) continue;
      const z = this.cam.zoom; const cx = e.sx + (e.w - e.h) * TW / 4 * z, hw = Math.max(e.w, e.h) * TW / 2 * 0.5 * z; const top = e.sy - e.say * 0.9, bottom = e.sy + (e.w + e.h) * TH / 4 * z;
      if (sx >= cx - hw && sx <= cx + hw && sy >= top && sy <= bottom) { const d = Math.hypot(wx0 - e.x, wy0 - e.y); if (d < bestD) { bestD = d; best = e; } }
    }
    if (best) return best;
    // trees/mines by world tile
    const [wx, wy] = this.screenToWorld(sx, sy);
    for (const e of g.ents.values()) {
      if (e.k === 't') { const [tx, ty] = this.worldToScreen(e.x, e.y + 0.35); if (sx > tx - 14 * this.cam.zoom && sx < tx + 14 * this.cam.zoom && sy > ty - 60 * this.cam.zoom && sy < ty + 4) return e; }
      if (e.k === 'm') { if (wx >= e.tx - 0.3 && wx < e.tx + 2.3 && wy >= e.ty - 0.3 && wy < e.ty + 2.3) return e; const [mx, my] = this.worldToScreen(e.x, e.y); if (Math.abs(sx - mx) < 50 * this.cam.zoom && sy > my - 70 * this.cam.zoom && sy < my + 10) return e; }
    }
    return null;
  }
  unitsInRect(x0, y0, x1, y1) {
    const g = this.game; const out = [];
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (const e of g.ents.values()) if (e.k === 'u' && e.o === g.me && e.sx !== undefined && !e.hd) { const cx = e.sx, cy = e.sy - e.say * 0.4; if (cx >= xa && cx <= xb && cy >= ya && cy <= yb) out.push(e); }
    return out;
  }
}
