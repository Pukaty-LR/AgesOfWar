// Pixel-art post-pass for baked sprites: the S× supersampled canvas is reduced to the 1 px game grid (box average),
// quantised to a small per-sprite palette (popularity, nearest colour), given a 1 px dark outline around the silhouette,
// and written back as crisp S×S blocks. Soft shadows survive as flat translucent pixels without an outline.
const OUTLINE = [28, 18, 10];
export function pixelize(canvas, S, opts = {}) {
  const { colors = 32, outline = true } = opts;
  const W = canvas.width, H = canvas.height; if (!W || !H) return;
  const lw = Math.ceil(W / S), lh = Math.ceil(H / S);
  const ctx = canvas.getContext('2d'); const src = ctx.getImageData(0, 0, W, H).data;
  const rgb = new Uint8ClampedArray(lw * lh * 3), cls = new Uint8Array(lw * lh); // 0 empty, 1 shadow, 2 solid
  const shadowA = new Uint8ClampedArray(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y * S; yy < Math.min(H, (y + 1) * S); yy++) for (let xx = x * S; xx < Math.min(W, (x + 1) * S); xx++) { const i = (yy * W + xx) * 4; const pa = src[i + 3]; r += src[i] * pa; g += src[i + 1] * pa; b += src[i + 2] * pa; a += pa; n++; }
    const j = y * lw + x; if (!n || a <= 0) continue; const am = a / n;
    if (am >= 110) { cls[j] = 2; rgb[j * 3] = r / a; rgb[j * 3 + 1] = g / a; rgb[j * 3 + 2] = b / a; }
    else if (am >= 22) { cls[j] = 1; shadowA[j] = am; rgb[j * 3] = r / a; rgb[j * 3 + 1] = g / a; rgb[j * 3 + 2] = b / a; }
  }
  // palette: most frequent 5-bit colour bins, then nearest mapping for every solid pixel
  const cnt = new Map();
  for (let j = 0; j < lw * lh; j++) if (cls[j] === 2) { const k = ((rgb[j * 3] >> 3) << 10) | ((rgb[j * 3 + 1] >> 3) << 5) | (rgb[j * 3 + 2] >> 3); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const pal = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, colors).map(([k]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
  const cache = new Map();
  const nearest = (r, g, b) => { const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2); let v = cache.get(k); if (v !== undefined) return v; let best = 0, bd = Infinity; for (let p = 0; p < pal.length; p++) { const c = pal[p]; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 * 1.4 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = p; } } cache.set(k, best); return best; };
  // quantise, then remove isolated speckles (a pixel whose colour differs from all 4 neighbours while 3 of them agree)
  const idx = new Int16Array(lw * lh).fill(-1);
  for (let j = 0; j < lw * lh; j++) if (cls[j] === 2 && pal.length) idx[j] = nearest(rgb[j * 3], rgb[j * 3 + 1], rgb[j * 3 + 2]);
  for (let y = 1; y < lh - 1; y++) for (let x = 1; x < lw - 1; x++) { const j = y * lw + x; if (idx[j] < 0) continue; const nb = [idx[j - 1], idx[j + 1], idx[j - lw], idx[j + lw]]; if (nb.includes(idx[j])) continue; const c = {}; let best = -1, bn = 0; for (const v of nb) { if (v < 0) continue; c[v] = (c[v] || 0) + 1; if (c[v] > bn) { bn = c[v]; best = v; } } if (bn >= 3) idx[j] = best; }
  const out = ctx.createImageData(W, H); const od = out.data;
  const put = (x, y, r, g, b, a) => { for (let yy = y * S; yy < Math.min(H, (y + 1) * S); yy++) for (let xx = x * S; xx < Math.min(W, (x + 1) * S); xx++) { const i = (yy * W + xx) * 4; od[i] = r; od[i + 1] = g; od[i + 2] = b; od[i + 3] = a; } };
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const j = y * lw + x;
    if (cls[j] === 2) { const c = idx[j] >= 0 ? pal[idx[j]] : [rgb[j * 3], rgb[j * 3 + 1], rgb[j * 3 + 2]]; put(x, y, c[0], c[1], c[2], 255); continue; }
    if (outline) { const solid = (x > 0 && cls[j - 1] === 2) || (x < lw - 1 && cls[j + 1] === 2) || (y > 0 && cls[j - lw] === 2) || (y < lh - 1 && cls[j + lw] === 2); if (solid) { put(x, y, OUTLINE[0], OUTLINE[1], OUTLINE[2], 255); continue; } }
    if (cls[j] === 1) put(x, y, rgb[j * 3] * 0.5 | 0, rgb[j * 3 + 1] * 0.5 | 0, rgb[j * 3 + 2] * 0.5 | 0, Math.min(120, shadowA[j] + 20));
  }
  ctx.putImageData(out, 0, 0);
}
