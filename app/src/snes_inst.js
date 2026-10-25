/* LowOrbit Chip Studio - SNES instrument library (v0.6)
   Every instrument is built from math: Karplus-Strong strings, modal bars, formant choirs, additive strings,
   flutes and brass. Each one becomes an attack + loop sample the way real SNES composers built them:
   the loop sits on a 16-sample BRR block boundary and holds whole periods, so it plays forever with no click,
   and each instrument brings its own hardware ADSR (AR, DR, SL, SR). The chip then squeezes it through real BRR.

   Instrument Scan lives here too: it measures about 50 numbers from a WAV or a SoundFont sample, smooths them
   into a family, then rebuilds the instrument from those numbers alone. The audio itself is never kept. */
(function (G) {
  const LO = G.LO;
  const TAU = Math.PI * 2;
  const RATE = [0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];
  const roundTo = (n, m) => n <= 0 ? 0 : Math.max(m, Math.round(n / m) * m);

  // quality q (0 best): the 64 KB budget can push an instrument down, like a composer trimming samples
  function geom(q) {
    const rate = q >= 2 ? 16000 : 32000, P = q >= 2 ? 32 : 64;
    return { q, rate, P, base: rate / P, atk: (q === 1 || q === 3) ? 0.55 : 1, Lp: q >= 2 ? 4096 : 8192 };
  }

  // the hardware ADSR maths, so measured times become real register values
  const arFor = sec => { let best = 15, err = 1e9; for (let a = 0; a < 16; a++) { const t = a === 15 ? 0.002 : RATE[a * 2 + 1] / 500; const e = Math.abs(Math.log((t + 0.002) / (sec + 0.002))); if (e < err) { err = e; best = a; } } return best; };
  const srFor = tau => { if (!(tau > 0) || tau > 40) return 0; let best = 0, err = 1e9; for (let s = 1; s < 32; s++) { const t = RATE[s] * 256 / 32000; const e = Math.abs(Math.log(t / tau)); if (e < err) { err = e; best = s; } } return best; };
  const drFor = tau => { let best = 0, err = 1e9; for (let d = 0; d < 8; d++) { const t = RATE[d * 2 + 16] * 256 / 32000; const e = Math.abs(Math.log(t / Math.max(0.005, tau))); if (e < err) { err = e; best = d; } } return best; };
  const srSeconds = s => s ? RATE[s] * 256 / 32000 : Infinity;

  // a small deterministic noise source (instruments must come out identical every time)
  function noiser(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; }; }

  // ---------------------------------------------------------------- builders
  // Karplus-Strong with an exact period: P-1 delay + averaging filter (0.5) + allpass (0.5) = P samples
  function pluck(g, o) {
    const P = g.P, N = roundTo(o.atkSec * g.rate * g.atk, P), n = noiser(o.seed);
    const d = new Float32Array(P - 1);
    let lp = 0; for (let i = 0; i < P - 1; i++) { lp += (n() - lp) * o.bright; d[i] = lp; }
    if (o.pick) { const k = Math.max(1, Math.round(o.pick * P)); const c = d.slice(); for (let i = 0; i < P - 1; i++) d[i] = c[i] - 0.9 * c[(i - k + P - 1) % (P - 1)]; }
    let m = 0; for (const x of d) m += x / (P - 1); for (let i = 0; i < P - 1; i++) d[i] -= m;
    const tot = N + 4 * P, out = new Float32Array(tot), c = 1 / 3;
    let idx = 0, prev = 0, apX = 0, apY = 0;
    for (let i = 0; i < tot; i++) {
      const v = d[idx]; out[i] = v;
      const avg = 0.5 * (v + prev); prev = v;
      const ap = c * avg + apX - c * apY; apX = avg; apY = ap;
      d[idx] = ap * o.loss; idx = (idx + 1) % (P - 1);
    }
    // the loop: the averaged last cycles, matched in level, with the final attack period faded into it
    const cyc = new Float32Array(P);
    for (let j = 0; j < P; j++) { let s = 0; for (let r = 0; r < 4; r++) s += out[N + r * P + j]; cyc[j] = s / 4; }
    let cm = 0; for (const x of cyc) cm += x / P; for (let j = 0; j < P; j++) cyc[j] -= cm;
    const data = new Float32Array(N + P);
    data.set(out.subarray(0, N));
    for (let j = 0; j < P; j++) { const w = j / P; data[N - P + j] = data[N - P + j] * (1 - w) + cyc[j] * w; }
    data.set(cyc, N);
    return { data, loop: N, baseF: g.base, rate: g.rate };
  }
  // struck bars and bells: inharmonic modes that die away, leaving the fundamental to loop
  function modal(g, o) {
    const P = g.P, N = roundTo(o.atkSec * g.rate * g.atk, P), f0 = g.base, n = noiser(o.seed), ny = g.rate * 0.45;
    const data = new Float32Array(N + P), T = N / g.rate;
    for (let i = 0; i < N; i++) {
      const t = i / g.rate, u = i / N, fade = u < 0.65 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.65) / 0.35);
      let s = o.amps[0] * Math.exp(-t / o.taus[0]) * Math.sin(TAU * f0 * t);
      for (let k = 1; k < o.ratios.length; k++) { if (f0 * o.ratios[k] > ny) continue; s += o.amps[k] * Math.exp(-t / o.taus[k]) * Math.sin(TAU * f0 * o.ratios[k] * t) * fade; }
      s += (o.click || 0) * n() * Math.exp(-t / 0.0025);
      data[i] = s;
    }
    const a0 = o.amps[0] * Math.exp(-T / o.taus[0]);
    for (let j = 0; j < P; j++) data[N + j] = a0 * Math.sin(TAU * j / P);
    return { data, loop: N, baseF: f0, rate: g.rate };
  }
  // an ensemble loop: several voices with n-1, n and n+1 cycles in one loop, so they beat like a real section
  function ensemble(g, o) {
    const Lp = g.Lp, n = 64, rate = g.rate, f0 = rate * n / Lp, nz = noiser(o.seed);
    const voices = o.voices || [n - 1, n, n + 1];
    const A = roundTo((o.atkSec || 0) * rate * g.atk, 16);
    const len = A + Lp, data = new Float32Array(len);
    for (let vi = 0; vi < voices.length; vi++) {
      const cyc = voices[vi], kmax = Math.min(o.kmax || 40, Math.floor((Lp / 2 - 1) / cyc));
      for (let k = 1; k <= kmax; k++) {
        const a = o.amp(k, k * f0) * (1 + 0.12 * nz()); if (a < 1e-4) continue;
        const ph = nz() * Math.PI, w = TAU * k * cyc / Lp;
        for (let i = 0; i < len; i++) data[i] += a * Math.sin(w * i + ph);
      }
    }
    if (A && o.noise) { const bp = new LO.Biquad('bp', o.noiseF || 3000, 1.2, rate); for (let i = 0; i < A; i++) { const u = i / A; data[i] += o.noise * bp.run(nz()) * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u); } }
    return { data, loop: A, baseF: f0, rate };
  }
  // a single-cycle loop with a shaped attack in front (flute breath, brass brightening)
  function cycleInst(g, o) {
    const P = g.P, A = roundTo((o.atkSec || 0) * g.rate * g.atk, P), kmax = P / 2 - 1, nz = noiser(o.seed);
    const data = new Float32Array(A + P);
    const bp = o.breath ? new LO.Biquad('bp', o.breathF || 2600, 1.4, g.rate) : null;
    for (let i = 0; i < A + P; i++) {
      const u = i < A ? i / A : 1, ph = i / P;
      let s = 0; for (let k = 1; k <= kmax; k++) { const a = o.amp(k, u); if (a > 1e-5) s += a * Math.sin(TAU * k * ph); }
      if (i < A) { s *= o.ramp ? o.ramp(u) : 1; if (bp) s += o.breath * bp.run(nz()) * (1 - u) * (1 - u); }
      data[i] = s;
    }
    return { data, loop: A, baseF: g.base, rate: g.rate };
  }

  // ---------------------------------------------------------------- the library
  const SOLID = 'SOLID', EST = 'ESTIMATED';
  const FAM = {
    HARP: { how: 'KARPLUS-STRONG STRING', adsr: [15, 7, 7, 13], vib: false, kind: 'PLUCK',
      build: q => pluck(geom(q), { seed: 11, bright: 0.42, loss: 0.9985, atkSec: 0.32 }) },
    GUITAR: { how: 'KARPLUS-STRONG, PICKED NEAR THE BRIDGE', adsr: [15, 7, 7, 14], vib: false, kind: 'PLUCK',
      build: q => pluck(geom(q), { seed: 23, bright: 0.85, pick: 0.13, loss: 0.996, atkSec: 0.26 }) },
    MARIMBA: { how: 'MODAL BAR, MODES 1 : 4 : 9.2', adsr: [15, 7, 7, 18], vib: false, kind: 'STRUCK',
      build: q => modal(geom(q), { seed: 5, ratios: [1, 4.0, 9.2], amps: [1, 0.35, 0.12], taus: [0.55, 0.11, 0.045], click: 0.25, atkSec: 0.16 }) },
    BELLS: { how: 'FREE BAR, MODES 1 : 2.76 : 5.40 : 8.93', adsr: [15, 7, 7, 11], vib: false, kind: 'STRUCK',
      build: q => modal(geom(q), { seed: 7, ratios: [1, 2.76, 5.40, 8.93], amps: [1, 0.55, 0.32, 0.2], taus: [1.6, 0.5, 0.24, 0.12], click: 0.12, atkSec: 0.22 }) },
    CHOIR: { how: 'AAH FORMANTS 700 / 1220 / 2600 HZ, 3 VOICES', adsr: [8, 3, 6, 0], vib: false, kind: 'SUSTAIN',
      build: q => ensemble(geom(q), { seed: 31, kmax: 30, amp: (k, f) => { const F = [[700, 130, 1], [1220, 150, 0.5], [2600, 220, 0.28]]; let a = 0.03; for (const [c, bw, gn] of F) a += gn / (1 + ((f - c) / bw) ** 2); return a / Math.pow(k, 0.6); } }) },
    STRINGS: { how: 'DETUNED ADDITIVE SECTION, BOW NOISE', adsr: [9, 2, 6, 0], vib: true, kind: 'SUSTAIN',
      build: q => ensemble(geom(q), { seed: 41, kmax: 36, atkSec: 0.05, noise: 0.25, noiseF: 3200, amp: (k, f) => (1 / Math.pow(k, 1.05)) * (1 + 0.5 / (1 + ((f - 450) / 150) ** 2) + 0.35 / (1 + ((f - 2800) / 600) ** 2)) * (f > 6000 ? 0.4 : 1) }) },
    FLUTE: { how: 'STRONG FUNDAMENTAL, BREATH IN THE ATTACK', adsr: [12, 4, 6, 0], vib: true, kind: 'SUSTAIN',
      build: q => cycleInst(geom(q), { seed: 53, atkSec: 0.09, breath: 0.5, breathF: 2600, ramp: u => Math.min(1, u * 1.6) * (1 + 0.15 * Math.sin(Math.PI * u)), amp: k => [0, 1, 0.22, 0.09, 0.04, 0.02, 0.01][k] || 0 }) },
    BRASS: { how: 'ADDITIVE, BRIGHTENS AS THE NOTE OPENS', adsr: [11, 4, 5, 0], vib: true, kind: 'SUSTAIN',
      build: q => cycleInst(geom(q), { seed: 61, atkSec: 0.07, ramp: u => Math.min(1, u * 1.3), amp: (k, u) => Math.pow(k, -(2.6 - 1.45 * u)) * (k > 24 ? 0.5 : 1) }) },
    ORGAN: { how: 'DRAWBARS 16 8 5 4 2 2/3 2', adsr: [15, 0, 7, 0], vib: false, kind: 'SUSTAIN',
      build: q => cycleInst(geom(q), { seed: 67, amp: k => ({ 1: 1, 2: 0.8, 3: 0.6, 4: 0.5, 6: 0.3, 8: 0.25 })[k] || 0 }) },
  };
  const NAMES = Object.keys(FAM);
  const cache = new Map();
  function family(name, q) {
    const f = FAM[name]; if (!f) return null;
    const key = name + '|' + q;
    if (!cache.has(key)) cache.set(key, f.build(q));
    const s = cache.get(key);
    return { ...s, adsr: f.adsr.slice(), vib: f.vib, how: f.how, kind: f.kind, name };
  }

  // the default picks for a song: the blueprint's choice, or a match for the composer's lead and pad sounds
  function autoPick(song) {
    const bp = song.meta.snes;
    const R = LO.rng((song.seed ^ 0x1A57) >>> 0);
    const lt = song.meta.leadTimbre, pt = song.meta.padTimbre;
    const lead = (bp && bp.lead) || ({ pulse: R.pick(['FLUTE', 'HARP']), saw: R.pick(['BRASS', 'STRINGS']), sax: 'FLUTE', bell: R.pick(['BELLS', 'MARIMBA']), brass: 'BRASS' }[lt] || 'FLUTE');
    const counter = (bp && bp.counter) || ({ FLUTE: 'HARP', HARP: 'FLUTE', BRASS: 'STRINGS', STRINGS: 'HARP', BELLS: 'MARIMBA', MARIMBA: 'FLUTE', GUITAR: 'FLUTE', CHOIR: 'HARP', ORGAN: 'GUITAR' }[lead] || 'HARP');
    const pad = (bp && bp.pad) || ({ strings: 'STRINGS', saw: R.pick(['STRINGS', 'CHOIR']), rhodes: 'CLASSIC', none: 'STRINGS' }[pt] || 'STRINGS');
    return { lead, counter, pad };
  }

  // ---------------------------------------------------------------- Instrument Scan: measure
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -TAU / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  // amplitude of one frequency in a Hann-windowed frame
  function amp(x, s0, N, f, sr) {
    let re = 0, im = 0; const w = TAU * f / sr;
    for (let i = 0; i < N; i++) { const h = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1)), v = (x[s0 + i] || 0) * h; re += v * Math.cos(w * i); im -= v * Math.sin(w * i); }
    return 2 * Math.sqrt(re * re + im * im) / (N * 0.5);
  }
  function pitch(x, s0, N, sr, lo, hi, hint) {
    const minL = Math.floor(sr / hi), maxL = Math.min(Math.floor(sr / lo), Math.floor(N / 2));
    let e0 = 0; for (let i = 0; i < N - maxL; i++) e0 += x[s0 + i] * x[s0 + i];
    if (e0 < 1e-9) return 0;
    const d = new Float32Array(maxL + 2); let run = 0; d[0] = 1;
    for (let L = 1; L <= maxL + 1; L++) { let s = 0; for (let i = 0; i < N - maxL; i++) { const v = x[s0 + i] - x[s0 + i + L]; s += v * v; } run += s; d[L] = s * L / (run || 1); }
    let best = -1;
    for (let L = minL; L <= maxL; L++) if (d[L] < 0.15 && d[L] <= d[L - 1] && d[L] <= d[L + 1]) { best = L; break; }
    if (best < 0) { let mv = 1e9; for (let L = minL; L <= maxL; L++) if (d[L] < mv) { mv = d[L]; best = L; } }
    const a = d[best - 1], b = d[best], c = d[best + 1], den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;
    let f = sr / (best + LO.clamp(off, -0.5, 0.5));
    if (!isFinite(f) || f <= 0) return 0;
    if (hint) { // a SoundFont tells us the note: snap octave errors toward it
      while (f > hint * 1.5) f /= 2; while (f < hint / 1.5) f *= 2;
    }
    return f;
  }
  const db = a => 20 * Math.log10(Math.max(1e-6, a));
  const median = arr => { const s = arr.filter(Number.isFinite).slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function measureOne(x, sr, hintHz) {
    const n = x.length;
    // envelope in 5 ms frames
    const fr = Math.max(16, Math.round(sr * 0.005)), nf = Math.floor(n / fr), env = new Float32Array(nf);
    for (let f = 0; f < nf; f++) { let s = 0; for (let i = 0; i < fr; i++) { const v = x[f * fr + i]; s += v * v; } env[f] = Math.sqrt(s / fr); }
    let pk = 0, pkI = 0; for (let f = 0; f < nf; f++) if (env[f] > pk) { pk = env[f]; pkI = f; }
    if (pk < 1e-5) return null;
    let onI = 0; while (onI < pkI && env[onI] < pk * 0.02) onI++;
    let a10 = onI, a90 = onI; while (a10 < pkI && env[a10] < pk * 0.1) a10++; a90 = a10; while (a90 < pkI && env[a90] < pk * 0.9) a90++;
    const attackMs = Math.max(1, (a90 - a10) * fr / sr * 1000);
    let endI = nf - 1; while (endI > pkI && env[endI] < pk * 0.01) endI--;
    const dur = (endI - onI) * fr / sr;
    const s0f = pkI + Math.floor((endI - pkI) * 0.35), s1f = pkI + Math.floor((endI - pkI) * 0.7);
    const sustainLvl = LO.clamp(median(Array.from(env.subarray(s0f, Math.max(s0f + 1, s1f)))) / pk, 0, 1);
    // decay: an exponential fit after the peak (log level against time)
    let rI0 = endI; { const sl0 = median(Array.from(env.subarray(s0f, Math.max(s0f + 1, s1f)))); while (rI0 > pkI && env[rI0] < sl0 * 0.7) rI0--; }
    let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
    for (let f = pkI; f <= Math.max(pkI + 4, rI0); f++) { if (env[f] < pk * 0.005) break; const t = (f - pkI) * fr / sr, y = Math.log(env[f] / pk); sx += t; sy += y; sxx += t * t; sxy += t * y; cnt++; }
    const slope = cnt > 3 ? (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx) : 0;
    const decayTau = slope < -0.05 ? -1 / slope : 30;
    let dI = pkI; const tgt = sustainLvl + (1 - sustainLvl) * 0.1; while (dI < endI && env[dI] / pk > tgt) dI++;
    const decayMs = (dI - pkI) * fr / sr * 1000;
    let rI = endI; while (rI > pkI && env[rI] < pk * sustainLvl * 0.5) rI--;
    const releaseMs = Math.max(5, (endI - rI) * fr / sr * 1000);
    const kind = sustainLvl > 0.45 || (sustainLvl > 0.25 && decayTau > 1.5) ? 0 : decayTau < 0.18 ? 2 : 1;
    // pitch, in a steady window after the attack
    const st = Math.max(0, Math.min(n - 4096, pkI * fr + Math.round(sr * 0.04))), N = Math.min(4096, n - st);
    if (N < 512) return null;
    const f0 = pitch(x, st, N, sr, 30, 2200, hintHz) || hintHz || 440;
    const per = sr / f0, NW = Math.min(N, Math.max(256, Math.round(per * 12)));
    const harm = (s, w) => { const h = []; for (let k = 1; k <= 16; k++) h.push(k * f0 < sr * 0.48 ? amp(x, s, w, k * f0, sr) : 0); return h; };
    const hS = harm(st, NW);
    const atS = Math.max(0, onI * fr), hA = harm(atS, Math.min(NW, Math.max(128, Math.round(per * 6))));
    const relS = Math.max(0, Math.min(n - NW, Math.round((rI + (endI - rI) * 0.3) * fr))), hR = harm(relS, NW);
    const hmax = Math.max(1e-9, ...hS);
    const cen = h => { let a = 0, b = 0; h.forEach((v, i) => { a += v * (i + 1); b += v; }); return b ? a / b : 1; };
    // inharmonicity: where do the upper partials really sit?
    const Bs = [], aW = Math.min(n - atS, Math.max(NW, Math.round(per * 24)));
    const peakNear = (fc, lo, hi) => { let bf = fc, ba = 0; for (let c = lo; c <= hi; c += 3) { const f = fc * Math.pow(2, c / 1200), a = amp(x, atS, aW, f, sr); if (a > ba) { ba = a; bf = f; } } const b0 = bf; for (let c = -3; c <= 3; c += 0.5) { const f = b0 * Math.pow(2, c / 1200), a = amp(x, atS, aW, f, sr); if (a > ba) { ba = a; bf = f; } } return [bf, ba]; };
    const [f1, a1] = peakNear(f0, -40, 40);
    for (let k = 3; k <= 9; k++) {
      if (k * f1 > sr * 0.42) continue;
      const [fk, ak] = peakNear(k * f1, -15, 90);
      if (ak < a1 * 0.01) continue;
      const r = fk / (k * f1); Bs.push((r * r - 1) / (k * k - 1));
    }
    const B = LO.clamp(median(Bs), 0, 0.01);
    // noise: what the harmonics do not explain
    const frameE = (s, w) => { let e = 0; for (let i = 0; i < w; i++) { const v = x[s + i] || 0; e += v * v; } return e / w; };
    const noiseOf = (s, w, h) => { const e = frameE(s, w); let hp = 0; for (const a of h) hp += a * a / 2; return LO.clamp(1 - hp / Math.max(1e-12, e), 0, 1); };
    const noiseAttack = noiseOf(atS, Math.min(NW, Math.max(128, Math.round(per * 6))), hA), noiseSteady = noiseOf(st, NW, hS);
    // vibrato and tremolo: the pitch and level wobble over the steady part
    const hop = Math.round(sr * 0.02), win = Math.min(2048, Math.max(256, Math.round(per * 4))), pts = [], lv = [];
    for (let s = st; s + win * 2 < Math.min(n, (s1f + 2) * fr) && pts.length < 200; s += hop) { const f = pitch(x, s, win * 2, sr, f0 / 1.3, f0 * 1.3); pts.push(f ? 1200 * Math.log2(f / f0) : 0); lv.push(frameE(s, win)); }
    const wobble = arr => {
      if (arr.length < 12) return { rate: 0, depth: 0 };
      // remove the slow trend first (a note that simply fades is not a tremolo)
      const nA = arr.length, mx = (nA - 1) / 2, m = arr.reduce((a, b) => a + b, 0) / nA;
      let sxy2 = 0, sxx2 = 0; arr.forEach((a, i) => { sxy2 += (i - mx) * (a - m); sxx2 += (i - mx) * (i - mx); });
      const sl2 = sxx2 ? sxy2 / sxx2 : 0, v = arr.map((a, i) => a - m - sl2 * (i - mx));
      let best = 0, bestR = 0;
      for (let r = 3; r <= 9; r += 0.25) { let re = 0, im = 0; v.forEach((a, i) => { const t = i * hop / sr; re += a * Math.cos(TAU * r * t); im += a * Math.sin(TAU * r * t); }); const mg = Math.sqrt(re * re + im * im) * 2 / v.length; if (mg > best) { best = mg; bestR = r; } }
      return { rate: bestR, depth: best, mean: m };
    };
    const vib = wobble(pts), trm = wobble(lv);
    const tremDepth = kind === 0 && trm.mean ? LO.clamp(trm.depth / trm.mean, 0, 1) : 0; // only a held note can have a tremolo
    // spectral envelope: formant peaks from the harmonic amplitudes
    const envAt = hz => { const k = hz / f0; if (k < 1) return hS[0]; if (k >= 16) return hS[15]; const i = Math.floor(k) - 1, fr2 = k - Math.floor(k); return hS[i] * (1 - fr2) + hS[Math.min(15, i + 1)] * fr2; };
    const peaks = [];
    for (let hz = Math.max(250, Math.round(f0 * 1.5 / 25) * 25); hz <= Math.min(4200, f0 * 15); hz += 25) { const a = envAt(hz); let top = true; for (let d = 25; d <= 200; d += 25) if (envAt(hz - d) > a || envAt(hz + d) > a) top = false; if (top && a > hmax * 0.05) peaks.push([hz, a]); }
    peaks.sort((a, b) => b[1] - a[1]); const fm = [];
    for (const pk2 of peaks) { if (fm.length < 3 && fm.every(q => Math.abs(q[0] - pk2[0]) >= 300)) fm.push(pk2); }
    fm.sort((a, b) => a[0] - b[0]);
    // tilt (dB per octave) and odd/even balance
    let tx = 0, ty = 0, txx = 0, txy = 0, tc = 0;
    hS.forEach((a, i) => { if (a > hmax * 1e-3) { const xx = Math.log2(i + 1), yy = db(a / hmax); tx += xx; ty += yy; txx += xx * xx; txy += xx * yy; tc++; } });
    const tilt = tc > 2 ? (tc * txy - tx * ty) / (tc * txx - tx * tx) : -6;
    let od = 0, ev = 0; hS.forEach((a, i) => { if (i % 2 === 0) od += a; else ev += a; });
    // flatness and spread from one FFT frame
    const NF = 1024, re = new Float64Array(NF), im = new Float64Array(NF);
    for (let i = 0; i < NF; i++) re[i] = (x[st + i] || 0) * (0.5 - 0.5 * Math.cos(TAU * i / (NF - 1)));
    fft(re, im); let lg = 0, ar = 0, cs = 0, cw = 0, c2 = 0; const mags = [];
    for (let i = 1; i < NF / 2; i++) { const m = Math.sqrt(re[i] * re[i] + im[i] * im[i]) + 1e-12; mags.push(m); lg += Math.log(m); ar += m; cs += m * i; }
    const cent = cs / ar; for (let i = 1; i < NF / 2; i++) c2 += mags[i - 1] * (i - cent) ** 2;
    const flatness = Math.exp(lg / mags.length) / (ar / mags.length), spread = Math.sqrt(c2 / ar) * sr / NF;
    const fA = pitch(x, atS, Math.min(n - atS, Math.max(256, Math.round(per * 4))), sr, f0 / 1.5, f0 * 1.5);
    const drift = fA ? 1200 * Math.log2(fA / f0) : 0;
    // how much faster the upper harmonics die than the fundamental
    const up = (h, lo2, hi2) => h.slice(lo2, hi2).reduce((a, b) => a + b, 0) / Math.max(1e-9, h[0]);
    const hfDecay = LO.clamp(up(hA, 3, 8) / Math.max(1e-6, up(hS, 3, 8)), 0.2, 20);
    let tr = onI; while (tr < pkI + 40 && tr < nf && noiseAttack > 0.2 && env[tr] > pk * 0.3) tr++;
    const fTrue = B > 0 && a1 > hmax * 0.05 ? f1 / Math.sqrt(1 + B) : f0; // a stiff string pulls the pitch tracker sharp
    return {
      f0: fTrue, h: hS.map(a => +db(a / hmax).toFixed(1)), hA: hA.map(a => +db(a / Math.max(1e-9, ...hA)).toFixed(1)),
      B, cenA: cen(hA), cenS: cen(hS), cenR: cen(hR), attackMs, decayMs, sustainLvl, releaseMs, decayTau,
      noiseAttack, noiseSteady, vibRate: vib.rate, vibDepth: vib.depth, tremRate: trm.rate, tremDepth,
      F: fm.map(p => p[0]), FL: fm.map(p => +db(p[1] / hmax).toFixed(1)), tilt, oddEven: LO.clamp(ev ? od / ev : 20, 0, 20),
      flatness, spread, drift, hfDecay, transientMs: (tr - onI) * fr / sr * 1000, dur, kind, peakDb: db(pk),
    };
  }

  // a family: many samples measured, numbers averaged and smoothed, so it is never one recording's fingerprint
  const NUMBER_KEYS = ['f0', 'B', 'cenA', 'cenS', 'cenR', 'attackMs', 'decayMs', 'sustainLvl', 'releaseMs', 'decayTau', 'noiseAttack', 'noiseSteady', 'vibRate', 'vibDepth', 'tremRate', 'tremDepth', 'tilt', 'oddEven', 'flatness', 'spread', 'drift', 'hfDecay', 'transientMs', 'dur', 'peakDb'];
  function measure(samples) {
    const ms = samples.map(s => { try { return measureOne(s.data, s.sr, s.hint); } catch (e) { return null; } }).filter(Boolean);
    if (!ms.length) return null;
    const p = { n: ms.length };
    for (const k of NUMBER_KEYS) p[k] = median(ms.map(m => m[k]));
    p.f0 = Math.exp(ms.reduce((a, m) => a + Math.log(m.f0), 0) / ms.length);
    p.kind = Math.round(median(ms.map(m => m.kind)));
    const lin = v => Math.pow(10, v / 20);
    const avgH = key => { const h = []; for (let k = 0; k < 16; k++) h.push(ms.reduce((a, m) => a + lin(m[key][k]), 0) / ms.length); return h; };
    // smoothing: each harmonic leans 15% toward its same-parity neighbors, so no single recording's quirks survive
    const smooth = h => h.map((v, i) => { const a = h[i - 2], b = h[i + 2]; if (a == null && b == null) return v; const nb = a != null && b != null ? (a + b) / 2 : (a != null ? a : b); return 0.85 * v + 0.15 * nb; });
    const toDb = h => { const mx = Math.max(1e-9, ...h); return h.map(v => +Math.max(-80, 20 * Math.log10(Math.max(1e-6, v / mx))).toFixed(1)); };
    p.h = toDb(smooth(avgH('h')));
    p.hA = toDb(smooth(avgH('hA')));
    const Fs = [0, 1, 2].map(i => median(ms.map(m => m.F[i]).filter(Boolean)));
    p.F = Fs.map(v => Math.round(v || 0)); p.FL = [0, 1, 2].map(i => +median(ms.map(m => m.FL[i]).filter(v => v != null)).toFixed(1));
    p.count = 16 + 16 + NUMBER_KEYS.length + 6 + 1; // the numbers we keep
    return p;
  }

  // ---------------------------------------------------------------- Instrument Scan: rebuild from the numbers alone
  function fromProfile(p, q, tune) {
    tune = tune || {};
    const g = geom(q), P = g.P, kmax = P / 2 - 1;
    const bright = (tune.bright || 0) * 0.18, atkF = Math.pow(2, (tune.attack || 0) / 2), decF = Math.pow(2, (tune.decay || 0) / 2), noiseF = tune.noise == null ? 1 : tune.noise / 5;
    const H = []; for (let k = 1; k <= kmax; k++) {
      const dbv = k <= 16 ? p.h[k - 1] : p.h[15] + p.tilt * Math.log2(k / 16);
      H.push(Math.pow(10, Math.max(-80, dbv) / 20) * Math.pow(k, bright));
    }
    const HA = []; for (let k = 1; k <= kmax; k++) {
      const dbv = k <= 16 ? (p.hA || p.h)[k - 1] : (p.hA || p.h)[15] + p.tilt * Math.log2(k / 16);
      HA.push(Math.pow(10, Math.max(-80, dbv) / 20) * Math.pow(k, bright));
    }
    const nz = noiser(Math.round(p.f0 * 100) ^ 0x51);
    const nb = new LO.Biquad('bp', LO.clamp(g.base * Math.max(2, p.cenA || 4), 400, g.rate * 0.4), 0.9, g.rate);
    let out, adsr, vib = p.vibDepth > 8;
    if (p.kind === 0) {
      // sustained: the attack morphs from the attack spectrum to the steady one, then one period loops
      const atkSec = LO.clamp(p.attackMs / 1000 * atkF, 0.004, 0.4);
      const inSample = atkSec <= 0.12;
      const A = inSample ? roundTo(Math.max(atkSec, 0.03) * g.rate * g.atk, P) : roundTo(0.03 * g.rate, P);
      const data = new Float32Array(A + P);
      for (let i = 0; i < A + P; i++) {
        const u = i < A ? i / A : 1, ph = i / P;
        let s = 0; for (let k = 1; k <= kmax; k++) { const a = HA[k - 1] * (1 - u) + H[k - 1] * u; if (a > 1e-5) s += a * Math.sin(TAU * k * ph); }
        if (i < A) { if (inSample) s *= Math.min(1, u * 1.25); s += noiseF * p.noiseAttack * 0.8 * nb.run(nz()) * (1 - u); }
        data[i] = s;
      }
      out = { data, loop: A, baseF: g.base, rate: g.rate };
      const sl = LO.clamp(Math.round(p.sustainLvl * 8) - 1, 0, 7);
      adsr = [inSample ? 15 : arFor(atkSec), drFor(p.decayMs / 1000 * decF / 3), sl, p.decayTau < 8 ? srFor(p.decayTau * decF) : 0];
    } else {
      // plucked or struck: stretched partials ring and fade, the harmonic ones carry on into the loop
      const tau0 = LO.clamp(p.decayTau * decF, 0.03, 8);
      const atkSec = LO.clamp(tau0 * 0.5, 0.06, 0.45), N = roundTo(atkSec * g.rate * g.atk, P), T = N / g.rate;
      const data = new Float32Array(N + P), hf = LO.clamp(p.hfDecay || 1, 1, 12);
      // the hardware ADSR does the overall fade, so the sample only carries what is left over:
      // each partial decays by the difference between its own ring time and the envelope's
      const srReg = srFor(tau0), tHw = srSeconds(srReg);
      const taus = H.map((_, i) => { const tk = tau0 / (1 + (hf - 1) * Math.min(1, i / 6)); return tk < tHw * 0.999 ? 1 / (1 / tk - 1 / tHw) : 1e9; });
      const stretched = H.map((_, i) => { const k = i + 1; return p.B * k * k > 0.0004; });
      const ny = g.rate * 0.45;
      for (let i = 0; i < N; i++) {
        const t = i / g.rate, u = i / N, fade = u < 0.65 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.65) / 0.35);
        let s = 0;
        for (let k = 1; k <= kmax; k++) {
          const a = HA[k - 1] * Math.exp(-t / taus[k - 1]); if (a < 1e-5) continue;
          if (stretched[k - 1]) { const f = k * g.base * Math.sqrt(1 + p.B * k * k); if (f < ny) s += a * Math.sin(TAU * f * t) * fade; }
          else s += a * Math.sin(TAU * k * i / P);
        }
        s += noiseF * p.noiseAttack * nb.run(nz()) * Math.exp(-t / Math.max(0.002, (p.transientMs || 5) / 1000));
        data[i] = s;
      }
      for (let j = 0; j < P; j++) { let s = 0; for (let k = 1; k <= kmax; k++) if (!stretched[k - 1]) s += HA[k - 1] * Math.exp(-T / taus[k - 1]) * Math.sin(TAU * k * j / P); data[N + j] = s; }
      out = { data, loop: N, baseF: g.base, rate: g.rate };
      adsr = [15, 7, 7, srReg];
      vib = false;
    }
    return { ...out, adsr, vib, how: 'REBUILT FROM ' + (p.count || 50) + ' MEASURED NUMBERS', kind: ['SUSTAIN', 'PLUCK', 'STRUCK'][p.kind] || 'SUSTAIN', name: 'MY: ' + (p.name || 'INSTRUMENT') };
  }

  // ---------------------------------------------------------------- SoundFont reader (only headers + 16-bit PCM)
  function parseSF2(ab) {
    const dv = new DataView(ab), u8 = new Uint8Array(ab);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = u8[o + i]; if (!c) break; s += String.fromCharCode(c); } return s; };
    if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'sfbk') throw new Error('NOT A SOUNDFONT (.SF2) FILE');
    const chunks = {};
    const walk = (o, end) => {
      while (o + 8 <= end) {
        const id = str(o, 4), sz = dv.getUint32(o + 4, true);
        if (id === 'LIST') walk(o + 12, Math.min(end, o + 8 + sz)); else chunks[id] = { o: o + 8, sz };
        o += 8 + sz + (sz & 1);
      }
    };
    walk(12, ab.byteLength);
    if (!chunks.smpl || !chunks.shdr) throw new Error('SOUNDFONT HAS NO SAMPLES');
    const smpl = chunks.smpl, samples = [];
    for (let o = chunks.shdr.o; o + 46 <= chunks.shdr.o + chunks.shdr.sz; o += 46) {
      const name = str(o, 20); if (name === 'EOS') break;
      samples.push({ name, start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), loopStart: dv.getUint32(o + 28, true), loopEnd: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), pitch: u8[o + 40], corr: dv.getInt8(o + 41), type: dv.getUint16(o + 44, true) });
    }
    const insts = [];
    if (chunks.inst && chunks.ibag && chunks.igen) {
      const inst = [], ibag = [], igen = [];
      for (let o = chunks.inst.o; o + 22 <= chunks.inst.o + chunks.inst.sz; o += 22) inst.push({ name: str(o, 20), bag: dv.getUint16(o + 20, true) });
      for (let o = chunks.ibag.o; o + 4 <= chunks.ibag.o + chunks.ibag.sz; o += 4) ibag.push(dv.getUint16(o, true));
      for (let o = chunks.igen.o; o + 4 <= chunks.igen.o + chunks.igen.sz; o += 4) igen.push([dv.getUint16(o, true), dv.getUint16(o + 2, true)]);
      for (let i = 0; i < inst.length - 1; i++) {
        const ids = new Set();
        for (let b = inst[i].bag; b < inst[i + 1].bag && b < ibag.length - 1; b++) for (let gI = ibag[b]; gI < ibag[b + 1] && gI < igen.length; gI++) if (igen[gI][0] === 53) ids.add(igen[gI][1]);
        const list = [...ids].filter(id => samples[id] && samples[id].end > samples[id].start + 64);
        if (list.length) insts.push({ name: inst[i].name.toUpperCase().trim() || 'INSTRUMENT ' + i, samples: list });
      }
    }
    if (!insts.length) samples.forEach((s, i) => insts.push({ name: s.name.toUpperCase(), samples: [i] }));
    const read = id => {
      const s = samples[id], n = Math.min(s.end - s.start, s.rate * 6), d = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = dv.getInt16(smpl.o + (s.start + i) * 2, true) / 32768;
      const hint = 440 * Math.pow(2, ((s.pitch > 127 ? 60 : s.pitch) - 69) / 12) * Math.pow(2, -s.corr / 1200);
      return { data: d, sr: s.rate, hint, name: s.name, loop: s.loopEnd > s.loopStart + 16 ? [s.loopStart - s.start, s.loopEnd - s.start] : null };
    };
    return { samples, insts, read };
  }

  LO.SNESI = { FAM, NAMES, OPTIONS: ['CLASSIC'].concat(NAMES), family, autoPick, measure, measureOne, fromProfile, parseSF2, geom, srSeconds, arFor, srFor };
})(typeof self !== 'undefined' ? self : globalThis);
