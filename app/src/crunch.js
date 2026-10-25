/* LowOrbit Chip Studio - CRUNCH: give any sound the exact sample format of a classic chip.
   Every profile is the real conversion math; FIT REAL MEMORY enforces the hardware's sample limits. */
(function (G) {
  const LO = G.LO;
  const SR = LO.SR;

  const norm = (x, to) => { let pk = 1e-9; for (const v of x) pk = Math.max(pk, Math.abs(v)); const g = (to || 0.95) / pk; for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
  // sample a 32 kHz signal at another rate after an anti-alias filter (what a real sampler's input did)
  function sampleAt(x, rate) {
    const y = Float32Array.from(x); if (rate < SR) { LO.filterInPlace(y, 'lp', rate * 0.45); LO.filterInPlace(y, 'lp', rate * 0.45); }
    const n = Math.max(1, Math.floor(x.length * rate / SR)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = i * SR / rate, i0 = Math.floor(p), f = p - i0; out[i] = y[i0] * (1 - f) + (i0 + 1 < y.length ? y[i0 + 1] : 0) * f; }
    return out;
  }
  // play back at the output rate with zero-order hold (no smoothing, like Paula / samplers)
  function holdBack(y, rate, len) { const out = new Float32Array(len); for (let i = 0; i < len; i++) out[i] = y[Math.min(y.length - 1, Math.floor(i * rate / SR))]; return out; }
  const quant = (y, bits) => { const q = Math.pow(2, bits - 1) - 1; for (let i = 0; i < y.length; i++) y[i] = Math.round(LO.clamp(y[i], -1, 1) * q) / q; return y; };

  const PROFILES = {
    'NES DPCM': {
      desc: '1-BIT DELTA AT 33 KHZ, NES DAC + OUTPUT FILTERS, MONO', limitSec: 32648 / 33143.9, mono: true,
      run(x) {
        const rate = 33143.9; const y = sampleAt(norm(Float32Array.from(x)), rate);
        let c = 64; const out = new Float32Array(y.length);
        for (let i = 0; i < y.length; i++) { const t = 64 + y[i] * 56; if (t > c) { if (c <= 125) c += 2; } else if (c >= 2) c -= 2; out[i] = c; }
        const tnd = new Float32Array(y.length);
        for (let i = 0; i < y.length; i++) { const v = out[i] / 22638; tnd[i] = v > 0 ? 159.79 / (1 / v + 100) : 0; }
        const back = new Float32Array(x.length);
        for (let i = 0; i < x.length; i++) back[i] = tnd[Math.min(tnd.length - 1, Math.floor(i * rate / SR))];
        const h = new LO.OnePole('hp', 37), l = new LO.OnePole('lp', 14000);
        for (let i = 0; i < back.length; i++) back[i] = l.run(h.run(back[i]));
        return back;
      },
    },
    'AMIGA 8-BIT': {
      desc: '8-BIT AT 16.6 KHZ (PERIOD 214), ZERO-ORDER HOLD, A500 RC FILTER', limitSec: 131070 / 16574,
      run(x) {
        const rate = 16574; const y = quant(sampleAt(norm(Float32Array.from(x)), rate), 8);
        const out = holdBack(y, rate, x.length); const f = new LO.OnePole('lp', 4900);
        for (let i = 0; i < out.length; i++) out[i] = f.run(out[i]);
        return out;
      },
    },
    'SNES BRR': {
      desc: 'REAL BRR 4-BIT ADPCM + GAUSSIAN PLAYBACK, 64 KB AUDIO RAM', limitSec: 50 * 1024 / 9 * 16 / 32000,
      run(x, fit, info) {
        let rate = 32000;
        if (fit) while (rate > 8000 && x.length * rate / SR / 16 * 9 > 50 * 1024) rate /= 2;
        info.rate = rate;
        const y = sampleAt(norm(Float32Array.from(x)), rate);
        const pcm = new Int16Array(y.length); for (let i = 0; i < y.length; i++) pcm[i] = Math.round(LO.clamp(y[i], -1, 1) * 30000);
        const dec = LO.brrRoundTrip(pcm, null).pcm;
        const pitch = Math.round(rate / 32000 * 0x1000); const out = new Float32Array(x.length); const GA = LO.SNES_GAUSS;
        let counter = 0, idx = 0; const h = [0, 0, 0, 0];
        for (let i = 0; i < out.length; i++) {
          counter += pitch;
          while (counter >= 0x1000) { counter -= 0x1000; h[0] = h[1]; h[1] = h[2]; h[2] = h[3]; h[3] = idx < dec.length ? dec[idx] : 0; idx++; }
          const fi = (counter >> 4) & 0xFF;
          out[i] = (h[0] * GA[fi * 4] + h[1] * GA[fi * 4 + 1] + h[2] * GA[fi * 4 + 2] + h[3] * GA[fi * 4 + 3]) / 32768;
        }
        return out;
      },
    },
    'SP-1200': {
      desc: '12-BIT AT 26 KHZ WITH THE SPED-UP-RECORD TRICK', limitSec: 10,
      run(x) { return LO.sp1200(norm(Float32Array.from(x))); },
    },
    'MPC60': {
      desc: '12-BIT, WARM INPUT STAGE, 40 KHZ CLASS', limitSec: 13.1,
      run(x) {
        const y = norm(Float32Array.from(x), 0.9); const k = Math.tanh(1.15);
        for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 1.15) / k;
        quant(y, 12); LO.filterInPlace(y, 'lp', 15500); return y;
      },
    },
    'LO-1 GRAIN': {
      desc: 'THE LO-1 SOUND: 15 KHZ SAMPLE GRAIN + 10-BIT CRUNCH', limitSec: null,
      run(x) {
        const y = norm(Float32Array.from(x)); const step = SR / 15000, out = new Float32Array(y.length), q = 511;
        for (let i = 0; i < y.length; i++) out[i] = Math.round(LO.clamp(y[Math.min(y.length - 1, Math.floor(Math.floor(i / step) * step))], -1, 1) * q) / q;
        return out;
      },
    },
  };
  LO.CRUNCH = PROFILES;
  LO.CRUNCH_INFO = {}; for (const k in PROFILES) LO.CRUNCH_INFO[k] = { desc: PROFILES[k].desc, limitSec: PROFILES[k].limitSec };

  LO.crunch = function (L, R, profileName, opts) {
    opts = opts || {};
    const P = PROFILES[profileName]; const info = { profile: profileName, seconds: L.length / SR };
    if (!P) throw new Error('UNKNOWN PROFILE ' + profileName);
    let l = L, r = R;
    if (P.limitSec) {
      info.limitSec = P.limitSec; info.fits = info.seconds <= P.limitSec;
      if (opts.fit && !info.fits && profileName !== 'SNES BRR') { const n = Math.floor(P.limitSec * SR); l = L.slice(0, n); r = R.slice(0, n); info.trimmed = true; }
    }
    if (P.mono) { const m = new Float32Array(l.length); for (let i = 0; i < m.length; i++) m[i] = (l[i] + r[i]) * 0.5; const o = P.run(m, opts.fit, info); l = o; r = o.slice(); }
    else { l = P.run(l, opts.fit, info); r = P.run(r, opts.fit, info); }
    if (opts.chain && LO.atmosActive(opts.chain)) { const w = LO.applyAtmos(l, r, opts.chain, 7); l = w.L; r = w.R; }
    let pk = 1e-9; for (let i = 0; i < l.length; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
    const g = 0.95 / pk; for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
    return { L: l, R: r, info };
  };
})(typeof self !== 'undefined' ? self : globalThis);
