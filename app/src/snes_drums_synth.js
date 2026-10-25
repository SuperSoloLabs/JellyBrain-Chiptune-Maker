/* LowOrbit Chip Studio - v0.7.2 drum rebuilds: every sampled-kit hit is made from numbers alone (snes_drums.js):
   up to 8 sinusoidal tracks (a kick's falling pitch, a snare's body, a cowbell's two tones) plus a noise spectrum over
   time in log-spaced bands. Then the 64 KB rules apply as for any sample (rate, BRR). */
(function (G) {
  const LO = G.LO, TAU = Math.PI * 2;
  const rng = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // 24 log-spaced noise bands from 40 Hz to the top
  const BANDS = sr => { const lo = 40, hi = Math.min(sr * 0.48, 15000), n = 24, b = []; for (let i = 0; i <= n; i++) b.push(+(lo * Math.pow(hi / lo, i / n)).toFixed(1)); return b; };
  function sines(p, sr) {
    const y = new Float32Array(p.n), R = rng(p.n * 31 + p.tracks.length);
    for (const tr of p.tracks) {
      let ph = R() * TAU; const n = tr.f.length;
      const c0 = Math.max(0, (tr.t0 - 1) * p.H), c1 = Math.min(p.n, (tr.t0 + n) * p.H);
      for (let i = c0; i < c1; i++) {
        const u = i / p.H - tr.t0; let a, f;
        if (u < 0) { a = tr.a[0] * (1 + u); f = tr.f[0]; } else if (u >= n - 1) { const v = u - (n - 1); a = tr.a[n - 1] * Math.max(0, 1 - v); f = tr.f[n - 1]; }
        else { const k = Math.floor(u), w = u - k; a = tr.a[k] * (1 - w) + tr.a[k + 1] * w; f = tr.f[k] * (1 - w) + tr.f[k + 1] * w; }
        if (f >= sr * 0.47) continue;
        ph += TAU * f / sr; y[i] += a * Math.sin(ph);
      }
    }
    return y;
  }
  // the noise: band rms magnitudes per 256-point frame (hop NH), stored in half-dB steps
  // the noise: band rms magnitudes per 256-point frame (hop NH), half-dB steps. The tone's power is subtracted per band
  // (phase-blind), so the noise layer holds only what the sinusoidal tracks do not
  function noiseEnv(x, sn, sr, NH, NB, stft) {
    const N = 256, F = stft(x, N, NH), S = stft(sn, N, NH), out = [];
    const bin = f => Math.max(1, Math.min(N / 2, Math.round(f * N / sr)));
    for (let t = 0; t < F.length; t++) { const m = F[t], q = S[t];
      for (let b = 0; b + 1 < NB.length; b++) { const a = bin(NB[b]), z = Math.max(a + 1, bin(NB[b + 1])); let s = 0, c = 0; for (let k = a; k < z; k++) { s += m[k] * m[k]; c += q[k] * q[k]; }
        const e = Math.max(s * 0.03, s - c), r = Math.sqrt(e / (z - a)); out.push(Math.max(-240, Math.min(200, Math.round(2 * 20 * Math.log10(r + 1e-9))))); } }
    return out;
  }
  function ifft(re, im) { for (let i = 0; i < im.length; i++) im[i] = -im[i]; fftc(re, im); const n = re.length; for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; } }
  function fftc(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } } for (let len = 2; len <= n; len <<= 1) { const a = -TAU / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
  function noise(p, sr) {
    const N = 256, H = p.NH, nb = p.NB.length - 1, y = new Float32Array(p.n), R = rng(p.n * 7 + 3), w = new Float64Array(N);
    for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / N);
    const frames = p.nz.length / nb, bandOf = new Int16Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) { const f = k * sr / N; let b = 0; while (b < nb - 1 && f >= p.NB[b + 1]) b++; bandOf[k] = f < p.NB[0] ? -1 : b; }
    const G = 4 / 3;   // white noise through Hann analysis -> random-phase resynthesis -> Hann OLA at hop N/4: variance 9/16
    // an attack is a click, and a click is phase-coherent: frames where the noise jumps by 9 dB or more get impulse phase
    // (all bins aligned at the frame center) instead of random phase
    const fe = []; for (let t = 0; t < frames; t++) { let e = 0; for (let b = 0; b < nb; b++) e += Math.pow(10, p.nz[t * nb + b] / 20); fe.push(10 * Math.log10(e + 1e-12)); }
    for (let t = 0; t < frames; t++) {
      const re = new Float64Array(N), im = new Float64Array(N), onset = t === 0 ? fe[0] > -60 : fe[t] - fe[t - 1] >= 9;
      for (let k = 1; k < N / 2; k++) { const b = bandOf[k]; if (b < 0) continue; const m = Math.pow(10, p.nz[t * nb + b] / 40), ph = onset ? Math.PI * k : R() * TAU; re[k] = m * Math.cos(ph); im[k] = m * Math.sin(ph); re[N - k] = re[k]; im[N - k] = -im[k]; }
      ifft(re, im);
      const s0 = -N / 2 + t * H;
      for (let i = 0; i < N; i++) { const j = s0 + i; if (j >= 0 && j < p.n) y[j] += re[i] * w[i] * G * (4 * H / N); }
    }
    return y;
  }
  function resample(x, from, to) {
    if (to >= from) return x; const r = to / from, n = Math.floor(x.length * r), y = new Float32Array(n), H = 12, fc = Math.min(1, r) * 0.95;
    for (let i = 0; i < n; i++) { const c = i / r, a0 = Math.floor(c); let s = 0, ws = 0; for (let j = a0 - H; j <= a0 + H; j++) { if (j < 0 || j >= x.length) continue; const d = j - c, v = d === 0 ? fc : Math.sin(Math.PI * fc * d) / (Math.PI * d), w = 0.5 + 0.5 * Math.cos(Math.PI * d / (H + 1)); s += x[j] * v * w; ws += v * w; } y[i] = ws ? s / ws * fc / fc : 0; }
    return y;
  }
  function synth(p, rate) {
    const a = sines(p, p.sr), b = noise(p, p.sr), y = new Float32Array(p.n);
    for (let i = 0; i < p.n; i++) y[i] = a[i] + b[i];
    return rate && rate < p.sr ? resample(y, p.sr, rate) : y;
  }
  // ---- the kits: generic names, each piece a rebuilt hit (kind -> library hit)
  const KITS = {
    'STUDIO KIT': { kick: 'KICK 1', snare: 'SNARE 1', clap: 'SNARE 2', tom: 'TOM 1', crash: 'CRASH 1', rim: 'SNARE 3', hat: 'HAT 1', ohat: 'OPEN HAT 1' },
    'BRIGHT KIT': { kick: 'KICK 2', snare: 'SNARE 4', clap: 'SNARE 4', tom: 'TOM 1', crash: 'CRASH 3', rim: 'COWBELL', hat: 'HAT 2', ohat: 'OPEN HAT 1' },
    'ROCK KIT': { kick: 'KICK 3', snare: 'SNARE 5', clap: 'SNARE 5', tom: 'TOM 2', crash: 'CRASH 2', rim: 'TOM 3' },
    'PUNCH KIT': { kick: 'KICK 4', snare: 'SNARE 6', clap: 'ORCH HIT', tom: 'TOM 4', crash: 'CRASH 2', rim: 'BONGO', ohat: 'OPEN HAT 2' },
    'DEEP KIT': { kick: 'KICK 5', snare: 'SNARE 3', clap: 'SNARE 3', tom: 'TOM 3', crash: 'RIDE', rim: 'BONGO' },
  };
  const cache = new Map();
  // one hit at a playback rate, normalized; a hit's natural pitch is kept (the driver pitches toms by note)
  function hit(name, rate) {
    const key = name + '|' + rate; if (cache.has(key)) return cache.get(key);
    const p = (LO.SNESD_DATA || []).find(d => d.id === name); if (!p) return null;
    const y = synth(p, rate); let pk = 1e-9; for (const v of y) pk = Math.max(pk, Math.abs(v));
    const r = { data: y.map(v => v / pk), rate: Math.min(rate, p.sr), fid: p.fid, kind: p.kind };
    cache.set(key, r); return r;
  }
  // a kit for a song when its sheet does not name one: by what the song is for
  function autoKit(song) {
    const m = song.meta, P = m.purpose || '';
    if (/BOSS|BATTLE|CHASE|RACING/.test(P) || m.intense >= 7) return m.intense >= 8 ? 'PUNCH KIT' : 'ROCK KIT';
    if (/TOWN|SHOP|TAVERN|MENU|VICTORY/.test(P)) return 'BRIGHT KIT';
    if (/DUNGEON|CAVE|SPOOKY|MYSTERY|GAME OVER/.test(P)) return 'DEEP KIT';
    return 'STUDIO KIT';
  }
  LO.SNESD = { KITS, hit, autoKit, NAMES: () => (LO.SNESD_DATA || []).map(d => d.id) };
  LO.SNESD_SYNTH = { BANDS, sines, noiseEnv, noise, synth, resample };
})(typeof self !== 'undefined' ? self : globalThis);
