/* LowOrbit Chip Studio - ATMOSPHERICS: the world the sound plays in.
   Runs after the chip (so Hardware-True exports can skip it). Spaces, devices, media, distance.
   Two slots in series, each with AMOUNT and SIZE; one global DISTANCE. All math, no recordings. */
(function (G) {
  const LO = G.LO;
  const SR = LO.SR;

  // ---------------------------------------------------------------- FFT convolution (exact rooms)
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  LO.convolve = function (x, h) {
    let n = 1; while (n < x.length + h.length) n <<= 1;
    const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
    ar.set(x); br.set(h); fft(ar, ai, false); fft(br, bi, false);
    for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
    fft(ar, ai, true);
    const out = new Float32Array(x.length + h.length - 1);
    for (let i = 0; i < out.length; i++) out[i] = ar[i];
    return out;
  };

  // ---------------------------------------------------------------- helpers
  const lp = (x, fc, q) => LO.filterInPlace(x, 'lp', fc, q);
  const hp = (x, fc, q) => LO.filterInPlace(x, 'hp', fc, q);
  const peak = (x, fc, gain, q) => { const b = new LO.Biquad('bp', fc, q || 1.4); for (let i = 0; i < x.length; i++) x[i] += b.run(x[i]) * gain; return x; };
  const sat = (x, drive) => { const k = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k; return x; };
  const toMono = (L, R, keepSide) => { for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * (keepSide || 0); L[i] = m + s; R[i] = m - s; } };
  const taps = (L, R, list, tone) => {
    const n = L.length, oL = new Float32Array(n), oR = new Float32Array(n);
    for (const [t, g] of list) {
      const d = Math.round(t * SR); if (d >= n) continue;
      const fl = new LO.OnePole('lp', tone || 3500), fr = new LO.OnePole('lp', tone || 3500);
      for (let i = d; i < n; i++) { oL[i] += fl.run(R[i - d]) * g; oR[i] += fr.run(L[i - d]) * g; }
    }
    return [oL, oR];
  };
  const addInto = (L, R, aL, aR, g) => { for (let i = 0; i < L.length; i++) { L[i] += aL[i] * g; R[i] += aR[i] * g; } };
  const verb = (L, R, size, damp, mix, pre) => {
    let sL = L, sR = R;
    if (pre) { const d = Math.round(pre * SR); sL = new Float32Array(L.length); sR = new Float32Array(L.length); sL.set(L.subarray(0, L.length - d), d); sR.set(R.subarray(0, R.length - d), d); }
    const [a, b] = LO.reverb(sL, sR, size, damp); addInto(L, R, a, b, mix * 2.2);
  };
  function modDelay(x, baseMs, depthMs, rate, rate2, depth2Ms) {
    const n = x.length, out = new Float32Array(n), maxD = Math.ceil((baseMs + depthMs + (depth2Ms || 0)) * SR / 1000) + 4;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const d = (baseMs + depthMs * Math.sin(2 * Math.PI * rate * t) + (depth2Ms || 0) * Math.sin(2 * Math.PI * (rate2 || 0) * t)) * SR / 1000;
      const p = i - d - 2; const i0 = Math.floor(p), f = p - i0;
      out[i] = i0 < 0 ? 0 : x[i0] * (1 - f) + (i0 + 1 < n ? x[i0 + 1] : 0) * f;
      if (i < maxD) out[i] *= i / maxD;
    }
    return out;
  }
  const hiss = (n, R, level, hpf) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (R.random() * 2 - 1) * level; return hp(o, hpf || 3000); };

  // ---------------------------------------------------------------- the presets
  const P = {};
  const space = (name, tail, fn, desc) => { P[name] = { group: 'SPACES', tail, fn, desc }; };
  const device = (name, fn, desc) => { P[name] = { group: 'DEVICES', tail: 0.6, fn, desc }; };
  const media = (name, fn, desc) => { P[name] = { group: 'MEDIA', tail: 0.3, fn, desc }; };

  space('OPEN FIELD', 1.2, (L, R, s) => { const [a, b] = taps(L, R, [[0.09 * s, 0.18]]); addInto(L, R, a, b, 1); verb(L, R, 0.3, 0.45, 0.25); }, 'ONE SLAP OFF A DISTANT WALL, LOTS OF AIR');
  space('SMALL ROOM', 1.0, (L, R, s) => { const [a, b] = taps(L, R, [[0.012 * s, 0.3], [0.019 * s, 0.22], [0.027 * s, 0.15]], 5000); addInto(L, R, a, b, 1); verb(L, R, 0.25 * s, 0.5, 0.35); }, 'TIGHT WALLS, SHORT AND WOODY');
  space('HALLWAY', 1.6, (L, R, s) => { const [a, b] = taps(L, R, [[0.02 * s, 0.3], [0.035 * s, 0.24], [0.055 * s, 0.18], [0.08 * s, 0.12]], 4500); addInto(L, R, a, b, 1); verb(L, R, 0.45 * s, 0.4, 0.4); }, 'LONG CORRIDOR FLUTTER');
  space('STAIRWELL', 2.0, (L, R, s) => { const list = []; for (let k = 1; k <= 7; k++) list.push([0.045 * k * s, 0.32 * Math.pow(0.72, k)]); const [a, b] = taps(L, R, list, 6000); addInto(L, R, a, b, 1); verb(L, R, 0.6, 0.2, 0.5); }, 'HARD CONCRETE, RINGING FLUTTER ECHOES');
  space('TUNNEL', 2.4, (L, R, s) => {
    const [a, b] = taps(L, R, [[0.06 * s, 0.34], [0.12 * s, 0.24], [0.18 * s, 0.16], [0.24 * s, 0.1]], 3800); addInto(L, R, a, b, 1);
    for (const x of [L, R]) { const d = Math.round(0.009 * s * SR), buf = new Float32Array(d); let j = 0; for (let i = 0; i < x.length; i++) { const y = buf[j]; buf[j] = x[i] + y * 0.55; x[i] += y * 0.35; if (++j >= d) j = 0; } }
    verb(L, R, 0.7, 0.3, 0.6);
  }, 'METAL TUBE: FAST REPEATS AND A PIPE-LIKE RING');
  space('CAVE', 3.2, (L, R, s) => { const [a, b] = taps(L, R, [[0.14 * s, 0.26], [0.26 * s, 0.16]], 2500); addInto(L, R, a, b, 1); verb(L, R, 0.85, 0.55, 0.8); lp(L, 7000); lp(R, 7000); }, 'DEEP STONE, DARK AND DRIPPING');
  space('CATHEDRAL', 4.5, (L, R, s) => { verb(L, R, 0.96, 0.35, 0.95, 0.04 * s); }, 'HUGE STONE NAVE, LONG SHIMMERING TAIL');
  space('CANYON', 3.0, (L, R, s) => { const [a, b] = taps(L, R, [[0.32 * s, 0.22], [0.71 * s, 0.12], [1.15 * s, 0.06]], 2500); addInto(L, R, a, b, 1); verb(L, R, 0.75, 0.45, 0.55); }, 'ROCK WALLS FAR AWAY, ROLLING ECHOES');
  space('UNDERWATER', 1.5, (L, R) => {
    for (const x of [L, R]) { lp(x, 520); lp(x, 520); const m = modDelay(x, 6, 3, 0.6); x.set(m); }
    verb(L, R, 0.5, 0.85, 0.5);
  }, 'MUFFLED, WOBBLING, HEAVY');
  space('THROUGH A WALL', 1.0, (L, R) => {
    for (const x of [L, R]) { const low = new Float32Array(x); lp(low, 130); lp(x, 420); for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.6 + low[i] * 0.9; }
    verb(L, R, 0.3, 0.7, 0.25);
  }, 'THE PARTY NEXT DOOR: BASS THROUGH DRYWALL');
  space('VACUUM', 0.2, (L, R) => { lp(L, 2200); lp(R, 2200); }, 'SPACE: NO AIR, NO ECHO, JUST THE MUFFLED HULL');
  // the original machine-gun room, ported 1:1 (decaying filtered-noise impulse + a 90 ms slap)
  space('MG FIELD', 1.0, (L, R, s, ctx) => {
    const n = Math.round(0.9 * SR), Rn = LO.rng(1993 ^ 0x51AB);
    for (const x of [L, R]) {
      const ir = new Float32Array(n); for (let i = 0; i < n; i++) ir[i] = Rn.random() * 2 - 1;
      lp(ir, 3500); for (let i = 0; i < n; i++) ir[i] *= Math.exp(-i / SR / 0.18) * 0.01 * 1.7;
      ir[Math.round(0.09 * SR)] += 0.18;
      const wet = LO.convolve(x, ir); for (let i = 0; i < x.length; i++) x[i] += wet[i];
    }
  }, 'THE ORIGINAL MACHINE-GUN ROOM, EXACT');

  device('AM RADIO', (L, R, s, ctx) => {
    toMono(L, R);
    for (const x of [L, R]) { hp(x, 250); hp(x, 250); lp(x, 3500); lp(x, 3500); sat(x, 2.5); }
    const h = hiss(L.length, ctx.R, 0.012, 2000);
    for (let i = 0; i < L.length; i++) { const c = ctx.R.random() > 0.9997 ? ctx.R.range(-0.3, 0.3) : 0; L[i] += h[i] + c; R[i] += h[i] + c; }
  }, 'MONO, NARROW, WARM DISTORTION AND STATIC');
  device('POLICE RADIO', (L, R, s, ctx) => {
    toMono(L, R);
    for (const x of [L, R]) { hp(x, 500); hp(x, 500); lp(x, 2800); lp(x, 2800); for (let i = 0; i < x.length; i++) x[i] = LO.clamp(x[i] * 3.5, -0.4, 0.4); }
    const sq = Math.round(0.14 * SR); let first = 0, last = L.length - 1;
    while (first < L.length && Math.abs(L[first]) < 0.002) first++; while (last > 0 && Math.abs(L[last]) < 0.002) last--;
    for (const st of [Math.max(0, first - sq), Math.min(L.length - sq, last)]) for (let i = 0; i < sq && st + i < L.length; i++) { const v = (ctx.R.random() * 2 - 1) * 0.25 * Math.sin(Math.PI * i / sq); L[st + i] += v; R[st + i] += v; }
  }, 'WALKIE-TALKIE CLIP WITH SQUELCH BURSTS');
  device('TELEPHONE', (L, R) => {
    toMono(L, R);
    for (const x of [L, R]) {
      hp(x, 300); hp(x, 300); lp(x, 3400); lp(x, 3400);
      const step = SR / 8000; let held = 0;
      for (let i = 0; i < x.length; i++) {
        if (i % step < 1) { const v = LO.clamp(x[i] * 1.6, -1, 1); const mu = Math.sign(v) * Math.log(1 + 255 * Math.abs(v)) / Math.log(256); const q = Math.round(mu * 127) / 127; held = Math.sign(q) * (Math.pow(256, Math.abs(q)) - 1) / 255; }
        x[i] = held;
      }
      lp(x, 3400);
    }
  }, '8 KHZ MU-LAW LINE, THIN AND BOXY');
  device('TV SPEAKER', (L, R) => { toMono(L, R, 0.3); for (const x of [L, R]) { hp(x, 180); lp(x, 6000); peak(x, 1200, 0.6); } verb(L, R, 0.15, 0.6, 0.15); }, 'SMALL CRT SPEAKER IN A LIVING ROOM');
  device('ARCADE CABINET', (L, R) => { toMono(L, R); for (const x of [L, R]) { hp(x, 70); peak(x, 110, 1.2, 2); peak(x, 2000, 0.5); lp(x, 7000); sat(x, 1.4); } verb(L, R, 0.35, 0.5, 0.3); }, 'WOODEN CABINET BOOM IN A NOISY ARCADE');
  device('GAME BOY SPEAKER', (L, R) => { toMono(L, R); for (const x of [L, R]) { hp(x, 600); hp(x, 600); peak(x, 2500, 0.8); lp(x, 5500); sat(x, 1.6); } }, 'TINY HANDHELD SPEAKER, ALL MIDS');
  device('STADIUM PA', (L, R) => {
    for (const x of [L, R]) { hp(x, 200); lp(x, 6000); sat(x, 1.8); }
    const [a, b] = taps(L, R, [[0.18, 0.5], [0.36, 0.3], [0.54, 0.18]], 3000); addInto(L, R, a, b, 1); verb(L, R, 0.8, 0.45, 0.45);
  }, 'BIG HORNS, ECHOES BOUNCING OFF THE STANDS');

  media('VINYL', (L, R, s, ctx) => {
    const n = L.length; const crk = new Float32Array(n);
    for (let i = 0; i < n; i++) crk[i] = ctx.R.random() > 0.9988 ? ctx.R.range(-1, 1) : 0;
    hp(crk, 1500); const rum = hiss(n, ctx.R, 0.02, 10); lp(rum, 35); const surf = hiss(n, ctx.R, 0.004, 1500);
    for (const x of [L, R]) { const w = modDelay(x, 4, 0.35, 0.55); x.set(w); lp(x, 13000); }
    for (let i = 0; i < n; i++) { const v = crk[i] * 0.12 + rum[i] + surf[i]; L[i] += v; R[i] += v; }
  }, 'CRACKLE, SURFACE NOISE AND A GENTLE WARP');
  media('CASSETTE', (L, R, s, ctx) => {
    const h = hiss(L.length, ctx.R, 0.008, 3000);
    for (const x of [L, R]) { const w = modDelay(x, 5, 0.9, 0.7, 6, 0.08); x.set(w); hp(x, 40); lp(x, 10000); sat(x, 1.4); }
    for (let i = 0; i < L.length; i++) { L[i] += h[i]; R[i] += h[i] * 0.9; }
  }, 'TAPE WOW, FLUTTER, HISS AND SATURATION');
  media('VHS', (L, R, s, ctx) => {
    toMono(L, R, 0.5); const h = hiss(L.length, ctx.R, 0.014, 1500);
    for (const x of [L, R]) { const w = modDelay(x, 7, 1.4, 0.3); x.set(w); lp(x, 7500); }
    for (let i = 0; i < L.length; i++) { L[i] += h[i]; R[i] += h[i]; }
  }, 'WORN VIDEOTAPE: SOFT, WOBBLY, NOISY');

  LO.ATMOS = P;
  LO.ATMOS_GROUPS = ['SPACES', 'DEVICES', 'MEDIA'];
  LO.DISTANCE_LABEL = d => (d < 10 ? 'RIGHT HERE' : d < 35 ? 'ACROSS THE ROOM' : d < 60 ? 'ACROSS THE STREET' : d < 85 ? 'FAR AWAY' : 'OVER THE HILL');

  // chain = { slots: [{preset, amount, size}, {preset, amount, size}], distance }
  LO.atmosActive = chain => !!chain && ((chain.slots || []).some(s => s && s.preset && s.preset !== 'NONE' && s.amount > 0) || (chain.distance || 0) > 0);
  LO.atmosTail = chain => {
    let t = 0; for (const s of (chain.slots || [])) if (s && P[s.preset]) t = Math.max(t, P[s.preset].tail * (s.size || 1));
    return t + (chain.distance || 0) / 100 * 1.2;
  };
  LO.applyAtmos = function (L, R, chain, seed) {
    if (!LO.atmosActive(chain)) return { L, R };
    const extra = Math.round(LO.atmosTail(chain) * SR);
    let l = new Float32Array(L.length + extra), r = new Float32Array(R.length + extra);
    l.set(L); r.set(R);
    const ctx = { R: LO.rng((seed || 1) ^ 0xA7) };
    for (const s of chain.slots) {
      if (!s || !P[s.preset] || !(s.amount > 0)) continue;
      const wl = l.slice(), wr = r.slice();
      P[s.preset].fn(wl, wr, LO.clamp(s.size || 1, 0.5, 1.6), ctx);
      const a = LO.clamp(s.amount / 100, 0, 1);
      // keep loudness comparable so A/B and stacking stay fair
      let ed = 0, ew = 0; for (let i = 0; i < l.length; i += 7) { ed += l[i] * l[i] + r[i] * r[i]; ew += wl[i] * wl[i] + wr[i] * wr[i]; }
      const g = ew > 0 ? Math.min(4, Math.sqrt(ed / ew)) : 1;
      for (let i = 0; i < l.length; i++) { l[i] = l[i] * (1 - a) + wl[i] * g * a; r[i] = r[i] * (1 - a) + wr[i] * g * a; }
    }
    const d = (chain.distance || 0) / 100;
    if (d > 0) {
      const fc = Math.max(1800, 18000 * Math.exp(-d * 2.3));
      const wl = l.slice(), wr = r.slice();
      const [a, b] = LO.reverb(wl, wr, 0.55 + d * 0.3, 0.5);
      for (const x of [l, r]) { lp(x, fc); }
      const dry = 1 / (1 + d * 2.5), amb = d * 0.9;
      for (let i = 0; i < l.length; i++) { l[i] = l[i] * dry + a[i] * amb * 2.2; r[i] = r[i] * dry + b[i] * amb * 2.2; }
    }
    return { L: l, R: r };
  };

  // seamless game loop: wrap the tail after the loop end back onto the loop start
  LO.loopBody = function (L, R, startSample, endSample) {
    const len = endSample - startSample; const oL = L.slice(startSample, endSample), oR = R.slice(startSample, endSample);
    for (let i = endSample; i < L.length; i++) { const k = (i - endSample) % len; oL[k] += L[i]; oR[k] += R[i]; }
    return { L: oL, R: oR };
  };
})(typeof self !== 'undefined' ? self : globalThis);
