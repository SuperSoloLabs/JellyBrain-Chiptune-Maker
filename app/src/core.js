/* LowOrbit Chip Studio - core utilities (shared by window and worker) */
(function (G) {
  const LO = G.LO = G.LO || {};
  LO.VERSION = '0.6.1';
  LO.SR = 32000;

  // sfc32 seeded RNG: the same seed always makes the same song
  LO.rng = function (seed) {
    let a = 0x9E3779B9, b = 0x243F6A88, c = 0xB7E15162, d = seed >>> 0;
    const next = () => {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 15; i++) next();
    return {
      random: next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      range: (lo, hi) => lo + next() * (hi - lo),
      chance: p => next() < p,
      pick: (arr, w) => {
        if (!w) return arr[Math.floor(next() * arr.length)];
        let s = 0; for (const x of w) s += x;
        let u = next() * s;
        for (let i = 0; i < arr.length; i++) { u -= w[i]; if (u <= 0) return arr[i]; }
        return arr[arr.length - 1];
      },
      gauss: () => { const u = next() || 1e-9, v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
      fork: (salt) => LO.rng(((seed >>> 0) ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0),
    };
  };

  LO.m2f = m => 440 * Math.pow(2, (m - 69) / 12);
  LO.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  LO.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  LO.noteName = m => LO.NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  // Transposed direct form II biquad
  LO.Biquad = class {
    constructor(type, fc, q, sr) { this.z1 = 0; this.z2 = 0; this.set(type, fc, q, sr); }
    set(type, fc, q, sr) {
      sr = sr || LO.SR; q = q || 0.7071;
      const w = 2 * Math.PI * Math.min(Math.max(fc, 10), sr * 0.49) / sr;
      const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
      let b0, b1, b2;
      if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
      else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
      else { b0 = al; b1 = 0; b2 = -al; }
      const a0 = 1 + al;
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * cs / a0; this.a2 = (1 - al) / a0;
    }
    run(x) {
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      return y;
    }
  };
  // First-order RC-style filters (how the old hardware output stages worked)
  LO.OnePole = class {
    constructor(type, fc, sr) { this.type = type; this.y = 0; this.x1 = 0; this.a = Math.exp(-2 * Math.PI * fc / (sr || LO.SR)); }
    run(x) {
      if (this.type === 'lp') { this.y = x + this.a * (this.y - x); return this.y; }
      const y = this.a * (this.y + x - this.x1); this.x1 = x; this.y = y; return y;
    }
  };
  LO.filterInPlace = function (arr, type, fc, q, sr) {
    const f = new LO.Biquad(type, fc, q, sr);
    for (let i = 0; i < arr.length; i++) arr[i] = f.run(arr[i]);
    return arr;
  };

  // Chamberlin state-variable filter (SID-style resonant filter for LO-1)
  LO.SVF = class {
    constructor() { this.low = 0; this.band = 0; }
    run(x, fc, res, mode) {
      const f = 2 * Math.sin(Math.PI * Math.min(fc, LO.SR * 0.22) / LO.SR);
      const q = 1 - res * 0.92;
      this.low += f * this.band;
      const high = x - this.low - q * this.band;
      this.band += f * high;
      if (this.band > 4) this.band = 4; else if (this.band < -4) this.band = -4;
      return mode === 'hp' ? high : mode === 'bp' ? this.band : this.low;
    }
  };

  LO.encodeWav = function (L, R, sr) {
    const n = L.length, ch = R ? 2 : 1;
    const buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * ch * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, Math.round(LO.clamp(L[i], -1, 1) * 32767), true); o += 2;
      if (R) { v.setInt16(o, Math.round(LO.clamp(R[i], -1, 1) * 32767), true); o += 2; }
    }
    return buf;
  };

  // RMS meter frames (50 per second) for the channel LEDs
  LO.meterFrames = function (arr, sr) {
    const hop = Math.floor((sr || LO.SR) / 50), n = Math.ceil(arr.length / hop), out = new Float32Array(n);
    let peak = 1e-9;
    for (let f = 0; f < n; f++) {
      let s = 0; const a = f * hop, b = Math.min(arr.length, a + hop);
      for (let i = a; i < b; i++) s += arr[i] * arr[i];
      out[f] = Math.sqrt(s / Math.max(1, b - a)); if (out[f] > peak) peak = out[f];
    }
    for (let f = 0; f < n; f++) out[f] = Math.min(1, out[f] / peak);
    return out;
  };
})(typeof self !== 'undefined' ? self : globalThis);
