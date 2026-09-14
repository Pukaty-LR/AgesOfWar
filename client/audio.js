// Procedural audio: generative music per era + synthesized SFX (no external files).
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.sfxGain = null; this.musicGain = null; this.noise = null;
    this.musicVol = 0.55; this.sfxVol = 0.8; this.style = null; this.intensity = 0; this.running = false;
    this.lastSfx = {};
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol; this.musicGain.connect(this.master);
    // reverb-ish: simple feedback delay for music
    this.delay = this.ctx.createDelay(1); this.delay.delayTime.value = 0.31;
    const fb = this.ctx.createGain(); fb.gain.value = 0.28; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay); this.delay.connect(this.musicGain);
    const len = this.ctx.sampleRate * 2; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  setMusicVol(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setSfxVol(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  // ---------- helpers ----------
  env(g, t, a, d, s, r, peak = 1, sus = 0.6) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(peak * sus, t + a + d);
    g.gain.setValueAtTime(peak * sus, t + a + d + s); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + s + r);
  }
  osc(type, f, t, dur, gainVal, dest, opts = {}) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const g = c.createGain(); o.connect(g);
    let node = g;
    if (opts.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opts.lp; lp.Q.value = opts.q || 0.7; g.connect(lp); node = lp; }
    node.connect(dest || this.sfxGain);
    this.env(g, t, opts.a ?? 0.005, opts.d ?? dur * 0.3, opts.s ?? 0, opts.r ?? dur * 0.7, gainVal, opts.sus ?? 0.5);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noiseBurst(t, dur, gainVal, dest, opts = {}) {
    const c = this.ctx; const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = opts.rate || 1;
    const f = c.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.frequency.setValueAtTime(opts.f || 1000, t); if (opts.fEnd) f.frequency.exponentialRampToValueAtTime(opts.fEnd, t + dur); f.Q.value = opts.q || 0.8;
    const g = c.createGain(); src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    this.env(g, t, opts.a ?? 0.003, opts.d ?? dur * 0.3, opts.s ?? 0, opts.r ?? dur * 0.7, gainVal, opts.sus ?? 0.4);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- SFX ----------
  /** name: sfx id; vol: 0..1 distance attenuation; pan: -1..1 */
  sfx(name, vol = 1, pan = 0) {
    if (!this.ctx) return;
    const now = performance.now();
    const limit = { bulletShot: 45, arrowShot: 60, swordHit: 70, hit: 70, chop: 120, hammer: 150, explosion: 80, shellShot: 80 }[name] || 30;
    if (this.lastSfx[name] && now - this.lastSfx[name] < limit) return;
    this.lastSfx[name] = now;
    const c = this.ctx, t = c.currentTime;
    let dest = this.sfxGain;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.sfxGain); dest = p; }
    if (vol < 1) { const g = c.createGain(); g.gain.value = vol; g.connect(dest); dest = g; }
    const v = 1;
    switch (name) {
      case 'click': this.osc('square', 1800, t, 0.03, 0.08 * v, dest, { lp: 3000 }); break;
      case 'select':
        if (this.era === 'scifi') { this.osc('sine', 1400, t, 0.05, 0.12 * v, dest, { slide: 2200 }); this.osc('square', 2600, t + 0.05, 0.04, 0.05 * v, dest, { lp: 5000 }); }
        else if (this.era === 'ww2') { this.noiseBurst(t, 0.03, 0.12 * v, dest, { f: 3000, q: 2 }); this.osc('square', 1100, t + 0.03, 0.05, 0.07 * v, dest, { lp: 2500 }); }
        else { this.osc('triangle', 880, t, 0.08, 0.15 * v, dest); this.osc('triangle', 1320, t + 0.05, 0.08, 0.12 * v, dest); }
        break;
      case 'ack':
        if (this.era === 'scifi') { this.osc('sine', 900, t, 0.06, 0.12 * v, dest, { slide: 1500 }); this.osc('sine', 1800, t + 0.06, 0.07, 0.08 * v, dest); }
        else if (this.era === 'ww2') { this.noiseBurst(t, 0.03, 0.1 * v, dest, { f: 3000, q: 2 }); this.osc('square', 740, t + 0.03, 0.06, 0.07 * v, dest, { lp: 2200 }); this.osc('square', 990, t + 0.1, 0.05, 0.05 * v, dest, { lp: 2200 }); }
        else { this.osc('triangle', 660, t, 0.07, 0.14 * v, dest); this.osc('triangle', 990, t + 0.06, 0.09, 0.12 * v, dest); }
        break;
      case 'attackOrder': this.osc('sawtooth', 330, t, 0.12, 0.12 * v, dest, { lp: 1500, slide: 220 }); this.noiseBurst(t, 0.1, 0.08 * v, dest, { f: 2500 }); break;
      case 'error': this.osc('square', 220, t, 0.12, 0.12 * v, dest, { lp: 900 }); this.osc('square', 180, t + 0.12, 0.16, 0.12 * v, dest, { lp: 900 }); break;
      case 'swordHit': this.noiseBurst(t, 0.12, 0.35 * v, dest, { f: 3200 + Math.random() * 1500, q: 6, type: 'bandpass' }); this.osc('triangle', 1900 + Math.random() * 600, t, 0.08, 0.12 * v, dest, { slide: 900 }); break;
      case 'hit': this.noiseBurst(t, 0.09, 0.25 * v, dest, { f: 700, q: 1.5, type: 'lowpass' }); break;
      case 'arrowShot': this.noiseBurst(t, 0.18, 0.22 * v, dest, { f: 900, fEnd: 3500, q: 2 }); break;
      case 'arrowHit': this.noiseBurst(t, 0.06, 0.25 * v, dest, { f: 2000, q: 3 }); this.osc('triangle', 300, t, 0.05, 0.1 * v, dest, { slide: 120 }); break;
      case 'bulletShot': this.noiseBurst(t, 0.07, 0.35 * v, dest, { f: 1800, fEnd: 500, q: 0.7, type: 'lowpass' }); this.osc('square', 180, t, 0.04, 0.15 * v, dest, { slide: 60 }); break;
      case 'shellShot': this.noiseBurst(t, 0.35, 0.5 * v, dest, { f: 400, fEnd: 90, q: 0.5, type: 'lowpass' }); this.osc('sine', 120, t, 0.25, 0.4 * v, dest, { slide: 40 }); break;
      case 'rockShot': this.noiseBurst(t, 0.3, 0.3 * v, dest, { f: 300, fEnd: 1200, q: 1, type: 'bandpass' }); this.osc('triangle', 90, t, 0.2, 0.2 * v, dest, { slide: 60 }); break;
      case 'explosion': this.noiseBurst(t, 0.9, 0.7 * v, dest, { f: 900, fEnd: 60, q: 0.3, type: 'lowpass', r: 0.7 }); this.osc('sine', 70, t, 0.5, 0.5 * v, dest, { slide: 30 }); break;
      case 'chop': this.noiseBurst(t, 0.07, 0.3 * v, dest, { f: 1200, q: 2 }); this.osc('triangle', 240, t, 0.06, 0.18 * v, dest, { slide: 120, lp: 800 }); break;
      case 'hammer': this.osc('triangle', 1400 + Math.random() * 400, t, 0.07, 0.12 * v, dest, { slide: 700 }); this.noiseBurst(t, 0.05, 0.12 * v, dest, { f: 3000, q: 4 }); break;
      case 'deposit': this.osc('sine', 1568, t, 0.12, 0.12 * v, dest); this.osc('sine', 2093, t + 0.06, 0.16, 0.1 * v, dest); break;
      case 'unitReady': this.osc('triangle', 784, t, 0.12, 0.14 * v, dest); this.osc('triangle', 1046, t + 0.1, 0.18, 0.12 * v, dest); break;
      case 'buildingDone': this.osc('triangle', 523, t, 0.15, 0.15 * v, dest); this.osc('triangle', 659, t + 0.12, 0.15, 0.14 * v, dest); this.osc('triangle', 784, t + 0.24, 0.3, 0.14 * v, dest); break;
      case 'placed': this.noiseBurst(t, 0.15, 0.25 * v, dest, { f: 300, q: 1, type: 'lowpass' }); this.osc('sine', 110, t, 0.15, 0.25 * v, dest, { slide: 50 }); break;
      case 'collapse': this.noiseBurst(t, 1.1, 0.6 * v, dest, { f: 500, fEnd: 80, q: 0.5, type: 'lowpass', r: 0.9 }); this.noiseBurst(t + 0.2, 0.5, 0.3 * v, dest, { f: 2000, fEnd: 300, q: 1 }); break;
      case 'death': this.noiseBurst(t, 0.2, 0.2 * v, dest, { f: 600, fEnd: 200, q: 1, type: 'lowpass' }); this.osc('sawtooth', 260, t, 0.25, 0.08 * v, dest, { slide: 90, lp: 700 }); break;
      case 'alarm': for (let i = 0; i < 3; i++) { this.osc('sawtooth', 440, t + i * 0.18, 0.15, 0.16 * v, dest, { lp: 1800 }); this.osc('sawtooth', 554, t + i * 0.18, 0.15, 0.12 * v, dest, { lp: 1800 }); } break;
      case 'horn': this.osc('sawtooth', 220, t, 0.9, 0.2 * v, dest, { lp: 1200, a: 0.05, d: 0.2, s: 0.4, r: 0.3 }); this.osc('sawtooth', 330, t + 0.3, 0.7, 0.16 * v, dest, { lp: 1200, a: 0.05, d: 0.2, s: 0.3, r: 0.3 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.osc('triangle', f, t + i * 0.16, 0.5, 0.18 * v, dest, { a: 0.01, d: 0.1, s: 0.15, r: 0.3 })); break;
      case 'defeat': [392, 370, 349, 330, 262].forEach((f, i) => this.osc('sawtooth', f, t + i * 0.32, 0.7, 0.14 * v, dest, { lp: 900, a: 0.02, d: 0.2, s: 0.2, r: 0.4 })); break;
      case 'splash': this.noiseBurst(t, 0.3, 0.2 * v, dest, { f: 1500, fEnd: 400, q: 1 }); break;
      case 'plasmaShot': this.osc('sine', 900, t, 0.12, 0.16 * v, dest, { slide: 300 }); this.osc('square', 1800, t, 0.06, 0.05 * v, dest, { slide: 600, lp: 3000 }); break;
      case 'railShot': this.noiseBurst(t, 0.08, 0.25 * v, dest, { f: 6000, fEnd: 1500, q: 1.5 }); this.osc('sawtooth', 2400, t, 0.18, 0.1 * v, dest, { slide: 200, lp: 4000 }); break;
      case 'plasmaShellShot': this.osc('sine', 300, t, 0.3, 0.3 * v, dest, { slide: 80 }); this.noiseBurst(t, 0.25, 0.2 * v, dest, { f: 1200, fEnd: 200, q: 0.8, type: 'lowpass' }); break;
      case 'flameShot': this.noiseBurst(t, 0.25, 0.22 * v, dest, { f: 700, fEnd: 400, q: 0.6, type: 'lowpass', a: 0.02 }); break;
    }
  }

  // ---------- music ----------
  startMusic(styleDef) {
    if (!this.ctx) return;
    this.style = styleDef; this.running = true; this.bar = 0; this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.melodyIdx = 0; this.phraseSeed = Math.random();
    clearInterval(this.musicTimer);
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }
  stopMusic() { this.running = false; clearInterval(this.musicTimer); }
  schedule() {
    if (!this.running || !this.ctx) return;
    const c = this.ctx;
    while (this.nextTime < c.currentTime + 0.35) {
      this.playBeat(this.nextTime);
      const tempo = this.style.tempo * (1 + this.intensity * 0.12);
      this.nextTime += 60 / tempo / 2; // eighth notes
      this.beat++;
      if (this.beat % 8 === 0) this.bar++;
    }
  }
  scaleFreq(deg, octave = 0) {
    const s = this.style.scale; const n = s.length;
    const o = Math.floor(deg / n) + octave; const st = s[((deg % n) + n) % n];
    return this.style.root * Math.pow(2, o + st / 12);
  }
  playBeat(t) {
    const st = this.style; const e = this.beat % 8; const bar = this.bar; const I = this.intensity;
    const g = this.musicGain;
    const beatLen = 60 / st.tempo;
    if (st.style === 'lyre') {
      // ambient pad: slow sine chord, changes every 2 bars
      if (e === 0 && bar % 2 === 0) {
        const root = [0, 5, 3, 4][Math.floor(bar / 2) % 4];
        for (const d of [0, 2, 4]) { const f = this.scaleFreq(root + d, 0); this.osc('sine', f, t, beatLen * 8.5, 0.05, this.delay, { a: 1.2, d: 0.5, s: beatLen * 5.5, r: 1.8, sus: 0.9 }); this.osc('triangle', f / 2, t, beatLen * 8.5, 0.03, g, { a: 1.5, d: 0.5, s: beatLen * 5.5, r: 1.8, sus: 0.9, lp: 400 }); }
      }
      // soft frame drum, only on 1 (and 3 when battle)
      if (e === 0 || (I > 0.35 && e === 4)) { this.osc('sine', 100, t, 0.3, 0.12 + I * 0.12, g, { slide: 45, a: 0.004, d: 0.1, r: 0.2 }); }
      // sparse plucked melody
      const r = this.rand(bar * 8 + e);
      const density = 0.22 + I * 0.2;
      if (r < density && (e % 2 === 0 || I > 0.5)) {
        const step = [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(this.rand(bar * 8 + e + 100) * 8)];
        this.melodyIdx = Math.max(-3, Math.min(9, this.melodyIdx + step));
        if (e === 0 && bar % 4 === 0) this.melodyIdx = 0;
        const f = this.scaleFreq(this.melodyIdx, 1);
        this.osc('triangle', f, t, 0.9, 0.07, this.delay, { a: 0.006, d: 0.25, s: 0.1, r: 0.6, sus: 0.3, lp: 1500 });
      }
      // distant flute every 4 bars
      if (bar % 4 === 2 && (e === 0 || e === 4)) { const f = this.scaleFreq([0, 2, 4, 5, 7][Math.floor(this.rand(bar * 3 + e) * 5)], 2); this.osc('sine', f, t, beatLen * 2.2, 0.035, this.delay, { a: 0.3, d: 0.3, s: 0.6, r: 0.8, sus: 0.7 }); }
    } else if (st.style === 'synth') { // ambient electronic: pads, soft kick, arpeggio
      if (e === 0 && bar % 2 === 0) {
        const root = [0, 3, 5, 4][Math.floor(bar / 2) % 4];
        for (const d of [0, 2, 4]) { const f = this.scaleFreq(root + d, 0); this.osc('sawtooth', f, t, beatLen * 8.5, 0.028, this.delay, { a: 1.6, d: 0.5, s: beatLen * 5.5, r: 2.0, sus: 0.9, lp: 700 + I * 500 }); this.osc('sawtooth', f * 1.005, t, beatLen * 8.5, 0.022, g, { a: 1.6, d: 0.5, s: beatLen * 5.5, r: 2.0, sus: 0.9, lp: 600 }); }
        this.osc('sine', this.scaleFreq(root, -2), t, beatLen * 8.5, 0.07, g, { a: 0.8, d: 0.5, s: beatLen * 6, r: 1.5, sus: 0.9 });
      }
      if (e === 0 || (I > 0.3 && e === 4)) this.osc('sine', 60, t, 0.35, 0.16 + I * 0.15, g, { slide: 30, a: 0.003, d: 0.12, r: 0.25 });
      if (I > 0.45 && e % 2 === 1) this.noiseBurst(t, 0.04, 0.05 + I * 0.05, g, { f: 8000, q: 2 });
      // arpeggio
      const density = 0.35 + I * 0.4; const r = this.rand(bar * 8 + e);
      if (r < density) { const deg = [0, 2, 4, 7, 4, 2][e % 6]; const f = this.scaleFreq(deg + (bar % 4 === 3 ? 2 : 0), 1); this.osc('square', f, t, 0.3, 0.035, this.delay, { a: 0.005, d: 0.1, s: 0.05, r: 0.2, sus: 0.4, lp: 1800 }); this.osc('sine', f * 2, t, 0.2, 0.025, this.delay, { a: 0.005, d: 0.08, r: 0.12 }); }
      if (bar % 4 === 2 && e === 0) { const f = this.scaleFreq([0, 4, 7][Math.floor(this.rand(bar) * 3)], 2); this.osc('triangle', f, t, beatLen * 3, 0.045, this.delay, { a: 0.5, d: 0.5, s: 0.8, r: 1.0, sus: 0.7, lp: 2200 }); }
    } else { // march, softened: brushed snare, warm low strings, muted horn
      const bd = e === 0 || (I > 0.4 && e === 4); const sn = e === 4 || (I > 0.5 && e === 6);
      if (bd) this.osc('sine', 80, t, 0.3, 0.18 + I * 0.12, g, { slide: 35, a: 0.003, d: 0.1, r: 0.2 });
      if (sn) this.noiseBurst(t, 0.12, 0.06 + I * 0.08, g, { f: 1800, q: 0.8, type: 'bandpass', r: 0.1 });
      if (e === 0) {
        const chordRoot = [0, 3, 4, 0][bar % 4];
        for (const d of [0, 2, 4]) { const f = this.scaleFreq(chordRoot + d, -1); this.osc('sawtooth', f, t, beatLen * 4.2, 0.022, g, { a: 0.5, d: 0.3, s: beatLen * 2.5, r: 0.8, sus: 0.8, lp: 420 }); this.osc('sine', f * 2, t, beatLen * 4.2, 0.03, this.delay, { a: 0.8, d: 0.3, s: beatLen * 2.5, r: 0.8, sus: 0.8 }); }
      }
      const r = this.rand(bar * 8 + e);
      const density = 0.2 + I * 0.25;
      if (r < density && e % 2 === 0) {
        const step = [-2, -1, 0, 1, 1, 2, 2, 4][Math.floor(this.rand(bar * 8 + e + 300) * 8)];
        this.melodyIdx = Math.max(-2, Math.min(8, this.melodyIdx + step));
        if (e === 0 && bar % 4 === 0) this.melodyIdx = [0, 4, 2, 4][Math.floor(bar / 4) % 4];
        const f = this.scaleFreq(this.melodyIdx, 1);
        this.osc('sawtooth', f, t, 0.7, 0.045, this.delay, { a: 0.08, d: 0.2, s: 0.2, r: 0.3, sus: 0.6, lp: 900 + I * 600 });
      }
      if (I > 0.7 && bar % 4 === 3 && e >= 4 && e % 2 === 0) { const f = this.scaleFreq([4, 7, 9, 11][e - 4], 1); this.osc('sawtooth', f, t, 0.4, 0.05, this.delay, { a: 0.03, d: 0.1, s: 0.15, r: 0.2, lp: 1400 }); }
    }
  }
  rand(n) { const x = Math.sin(n * 12.9898 + this.phraseSeed * 78.233) * 43758.5453; return x - Math.floor(x); }
}
