/* LowOrbit Chip Studio - sound effects: recipe library + offline word matcher (LO-1 chip) */
(function (G) {
  const LO = G.LO;
  const SR = LO.SR;

  // ---------------------------------------------------------------- building blocks
  const bp = (x, lo, hi) => { const a = new LO.Biquad('hp', lo, 0.7071), b = new LO.Biquad('lp', hi, 0.7071); for (let i = 0; i < x.length; i++) x[i] = b.run(a.run(x[i])); return x; };
  const lpf = (x, fc) => LO.filterInPlace(x, 'lp', fc);
  const hpf = (x, fc) => LO.filterInPlace(x, 'hp', fc);
  const noise = (n, R) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = R.random() * 2 - 1; return o; };
  const sweepLp = (x, fcFn) => { const f = new LO.Biquad('lp', 1000, 0.7071); for (let i = 0; i < x.length; i++) { if (i % 256 === 0) { const z1 = f.z1, z2 = f.z2; f.set('lp', LO.clamp(fcFn(i / SR), 60, 15000), 0.7071); f.z1 = z1; f.z2 = z2; } x[i] = f.run(x[i]); } return x; };
  // LO-1 SFX grain: sample-and-hold at 15 kHz + 10-bit crush (the machine gun reference)
  const grain = (x, rate = 15000, bits = 10) => {
    const step = SR / rate, q = Math.pow(2, bits - 1), o = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) o[i] = Math.round(LO.clamp(x[Math.min(x.length - 1, Math.floor(Math.floor(i / step) * step))], -1, 1) * q) / q;
    return o;
  };
  const sq = p => (p - Math.floor(p) < 0.5 ? 1 : -1);
  function Mixer(seconds) {
    const n = Math.ceil(seconds * SR); const L = new Float32Array(n), R = new Float32Array(n);
    return {
      n, L, R,
      put(sig, t0, vol = 1, pan = 0) {
        const i0 = Math.round(t0 * SR); const gl = vol * (1 - pan), gr = vol * (1 + pan);
        for (let k = 0; k < sig.length && i0 + k < n; k++) { if (i0 + k < 0) continue; L[i0 + k] += sig[k] * gl; R[i0 + k] += sig[k] * gr; }
      },
      putPanned(sig, t0, vol, p0, p1) {
        const i0 = Math.round(t0 * SR);
        for (let k = 0; k < sig.length && i0 + k < n; k++) { const p = p0 + (p1 - p0) * k / sig.length; L[i0 + k] += sig[k] * vol * (1 - p); R[i0 + k] += sig[k] * vol * (1 + p); }
      },
    };
  }

  function finish(L, R) {
    const n = L.length;
    LO.filterInPlace(L, 'hp', 22); LO.filterInPlace(R, 'hp', 22);
    let pk = 1e-9; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const k = Math.tanh(1.3);
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] / pk * 1.3) / k * 0.95; R[i] = Math.tanh(R[i] / pk * 1.3) / k * 0.95; }
    let end = n; while (end > SR * 0.2 && Math.abs(L[end - 1]) < 1e-4 && Math.abs(R[end - 1]) < 1e-4) end--;
    return { L: L.slice(0, end), R: R.slice(0, end) };
  }

  // ---------------------------------------------------------------- parts
  function gunshot(R, o) {
    const n = Math.round(0.16 * SR * (o.powder ? 1.8 : 1)); const crack = noise(n, R), body = noise(n, R), th = new Float32Array(n);
    bp(crack, o.crackLo, 9000); bp(body, 250 * o.pitch, 2200 * o.pitch);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; ph += (o.thumpF + 170 * o.pitch * Math.exp(-t * 60)) / SR;
      crack[i] *= Math.exp(-t * (o.powder ? 45 : 70)) * o.crackAmt; body[i] *= Math.exp(-t * (o.powder ? 12 : 28)) * 0.8; th[i] = sq(ph) * Math.exp(-t * (o.powder ? 18 : 30)) * 0.55;
    }
    lpf(th, 1400);
    const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.tanh((crack[i] + body[i] + th[i]) * 2.2);
    return grain(x);
  }
  function clink(R) {
    const n = Math.round(0.12 * SR), x = new Float32Array(n);
    const fs = [[3150, 38], [4620, 45], [6900, 60]].map(([f, d]) => [f * R.range(0.93, 1.07), d]);
    for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (const [f, d] of fs) s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * d); x[i] = s * 0.12; }
    return grain(x, 15000, 9);
  }
  function click(R, f, amt = 0.5) {
    const n = Math.round(0.05 * SR), x = noise(n, R); bp(x, f * 0.6, f * 1.6);
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (x[i] + Math.sin(2 * Math.PI * f * t) * 0.5) * Math.exp(-t * 90) * amt; }
    return grain(x, 15000, 9);
  }
  function explosion(R, size) {
    const n = Math.round(3.6 * SR * size); const punch = new Float32Array(n), roar = noise(n, R), rum = noise(n, R), cr = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; ph += (30 + 90 * Math.exp(-t * 10)) / SR;
      punch[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 2.2 / size);
      cr[i] = R.random() > 0.992 ? R.range(-1, 1) : 0;
    }
    sweepLp(roar, t => 120 + 6000 * Math.exp(-t * 3.5 / size));
    lpf(rum, 90); const ch = new LO.OnePole('lp', 4000); const crh = new LO.Biquad('hp', 1500, 0.7);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] = Math.tanh((punch[i] * 1.5 + roar[i] * Math.exp(-t * 1.6 / size) * 1.1 + crh.run(ch.run(cr[i])) * Math.exp(-t * 1.8) * 2.5 + rum[i] * Math.exp(-t * 0.9 / size) * 3) * 2.4);
    }
    return grain(x, 16000, 10);
  }
  function debris(M, R, t0, count, spread) {
    for (let k = 0; k < count; k++) {
      const n = Math.round(0.12 * SR), d = noise(n, R); lpf(d, R.range(800, 3500));
      const metal = R.random() < 0.4, f = R.range(1800, 5000), dec = R.range(30, 70);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = d[i] * Math.exp(-t * dec) + (metal ? Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 50) * 0.4 : 0); }
      M.put(grain(d, 16000, 9), t0 + R.range(0.45, spread), R.range(0.08, 0.22), R.range(-0.8, 0.8));
    }
  }

  // ---------------------------------------------------------------- recipes
  const RECIPES = {
    'MACHINE GUN': (R, m) => {
      const rounds = m.count || 14, rate = m.era === 'WW2' ? 9.5 : m.era === '1800S' ? 6 : 11.5;
      const heavy = m.weight === 'HEAVY', light = m.weight === 'LIGHT';
      const M = Mixer(rounds / rate + 1.6);
      for (let k = 0; k < rounds; k++) {
        const s = gunshot(R, { crackLo: 1200 + R.range(-400, 400) - (heavy ? 300 : 0) + (light ? 500 : 0), crackAmt: 1, pitch: heavy ? 0.8 : light ? 1.25 : 1, thumpF: heavy ? 70 : light ? 120 : 95, powder: m.era === '1800S' });
        M.put(s, k / rate + R.range(-0.004, 0.004), R.range(0.85, 1), R.range(-0.08, 0.08));
        if (k % 2 === 0) M.put(clink(R), k / rate + R.range(0.25, 0.4), 1, R.range(0.3, 0.7) * (R.random() < 0.5 ? -1 : 1));
      }
      return M;
    },
    'REVOLVER': (R, m) => {
      const shots = Math.min(6, m.count || 1), gap = 0.85;
      const M = Mixer(shots * gap + 2.2);
      const powder = m.era !== 'MODERN' && m.era !== 'FUTURE';
      for (let k = 0; k < shots; k++) {
        const t0 = k * gap;
        M.put(click(R, 2600, 0.45), t0, 1, 0.1); M.put(click(R, 3400, 0.35), t0 + 0.07, 1, 0.1);   // hammer cock
        const s = gunshot(R, { crackLo: powder ? 700 : 1300, crackAmt: powder ? 0.65 : 1, pitch: 0.85, thumpF: powder ? 68 : 85, powder });
        M.put(s, t0 + 0.32, 1, 0);
        if (powder) { // black powder smoke hiss
          const n = Math.round(0.7 * SR), h = noise(n, R); hpf(h, 3000);
          for (let i = 0; i < n; i++) h[i] *= Math.exp(-i / SR * 5) * 0.08;
          M.put(grain(h), t0 + 0.36, 1, 0);
        }
        for (let c = 0; c < 3; c++) M.put(click(R, 4200 + c * 300, 0.18), t0 + 0.62 + c * 0.035, 1, -0.1); // cylinder ratchet
      }
      return M;
    },
    'TANK': (R, m) => {
      const M = Mixer(6.4);
      // diesel idle
      let n = Math.round(1.7 * SR), eng = new Float32Array(n), ph = 0, ph2 = 0;
      const en = noise(n, R); lpf(en, 300);
      for (let i = 0; i < n; i++) {
        const t = i / SR, f = 28 + 1.5 * Math.sin(2 * Math.PI * 0.7 * t); ph += f / SR; ph2 += f / 2 / SR;
        eng[i] = ((1 - 2 * (ph % 1)) * (1 + 0.5 * sq(ph2)) + en[i] * 0.4) * Math.min(1, t / 0.3) * Math.sqrt(LO.clamp((1.7 - t) / 0.5, 0, 1));
      }
      lpf(eng, 420); M.put(grain(eng.map(x => x * 0.5)), 0, 0.55);
      n = Math.round(0.5 * SR); const servo = new Float32Array(n); ph = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; ph += (420 + 180 * t) / SR; servo[i] = Math.sin(2 * Math.PI * ph) * Math.sin(Math.PI * t / 0.5) * 0.12; }
      M.put(grain(servo), 0.25, 1, -0.2);
      M.put(click(R, 900, 0.8), 0.95, 0.9, 0.1);
      // cannon
      n = Math.round(2.0 * SR); const boom = new Float32Array(n), blast = noise(n, R), crk = noise(n, R); ph = 0;
      sweepLp(blast, t => 180 + 9000 * Math.exp(-t * 9)); hpf(crk, 2500);
      for (let i = 0; i < n; i++) { const t = i / SR; ph += (34 + 120 * Math.exp(-t * 14)) / SR; boom[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t * 3.2) * 1.4 + blast[i] * Math.exp(-t * 4.5) + crk[i] * Math.exp(-t * 60) * 0.9) * 2.6); }
      M.put(grain(boom, 18000, 10), 1.4, 1);
      // shell flight doppler, left to right
      n = Math.round(1.0 * SR); const wh = new Float32Array(n), wn = noise(n, R); ph = 0;
      sweepLp(wn, t => (1500 * Math.exp(-t * 1.4) + 500) * 2.2);
      for (let i = 0; i < n; i++) { const t = i / SR, f = 1500 * Math.exp(-t * 1.4) + 500; ph += f / SR; wh[i] = (Math.sin(2 * Math.PI * ph) * 0.18 + wn[i] * 0.35) * Math.pow(Math.sin(Math.PI * t), 2) * Math.exp(-t * 0.6); }
      M.putPanned(grain(wh, 16000, 9), 1.62, 0.7, -0.7, 0.7);
      M.put(explosion(R, m.weight === 'HEAVY' ? 1.2 : 1), 2.55, 1, 0.25);
      debris(M, R, 2.55, 14, 2.2);
      return M;
    },
    'EXPLOSION': (R, m) => {
      const size = m.weight === 'HEAVY' ? 1.3 : m.weight === 'LIGHT' ? 0.6 : 1;
      const M = Mixer(4.8 * size); M.put(explosion(R, size), 0.02, 1); debris(M, R, 0, Math.round(12 * size), 2.0 * size);
      return M;
    },
    'LASER': (R, m) => {
      const shots = m.count || 1, M = Mixer(shots * 0.22 + 1.0);
      for (let k = 0; k < shots; k++) {
        const n = Math.round(0.28 * SR), x = new Float32Array(n); let ph = 0;
        const f0 = (m.weight === 'HEAVY' ? 900 : 1800) * R.range(0.92, 1.08);
        for (let i = 0; i < n; i++) { const t = i / SR, f = 160 + f0 * Math.exp(-t * 14); ph += f * (1 + 0.04 * Math.sin(2 * Math.PI * 38 * t)) / SR; x[i] = (sq(ph) * 0.6 + (1 - 2 * (ph % 1)) * 0.3) * Math.exp(-t * 9); }
        M.put(grain(lpf(x, 7000)), k * 0.2, 0.9, R.range(-0.2, 0.2));
      }
      return M;
    },
    // COIN, JUMP, POWER UP and HIT read m.roll when RANDOM SOUND rolls them; without a roll they sound exactly as before
    'COIN': (R, m) => {
      const ro = m.roll || null, notes = ro ? ro.coin : [83, 88], step = ro ? ro.coinStep : 0.07, duty = ro ? ro.duty : 0.5;
      const len = step * (notes.length - 1) + 0.43, M = Mixer(len + 0.2), n = Math.round(len * SR), x = new Float32Array(n); let ph = 0;
      const last = step * (notes.length - 1);
      for (let i = 0; i < n; i++) { const t = i / SR, k = Math.min(notes.length - 1, Math.floor(t / step)), f = notes.length === 2 && !ro ? (t < 0.07 ? 987.8 : 1318.5) : LO.m2f(notes[k]); ph += f / SR; x[i] = (ph % 1 < duty ? 0.5 : -0.5) * (t < last ? 1 : Math.exp(-(t - last) * 7)); }
      M.put(grain(x), 0, 1); return M;
    },
    'JUMP': (R, m) => {
      const ro = m.roll || null, L = ro ? ro.jLen : 0.22, f0 = ro ? ro.jFrom : 260, rise = ro ? ro.jRise : 600, duty = ro ? ro.duty : 0.25, vib = ro ? ro.jVib : 0;
      const M = Mixer(L + 0.3), n = Math.round(L * SR), x = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / SR, f = (f0 + rise * (t / L)) * (1 + vib * Math.sin(2 * Math.PI * 22 * t)); ph += f / SR; x[i] = (ph % 1 < duty ? 0.5 : -0.5) * (1 - t / L); }
      M.put(grain(x), 0, 1); return M;
    },
    'POWER UP': (R, m) => {
      const ro = m.roll || null, notes = ro ? ro.arp : [0, 4, 7, 12, 16, 19, 24, 28, 31, 36], base = ro ? ro.base : 60, st = ro ? ro.step : 0.06, duty = ro ? ro.duty : 0.5;
      const M = Mixer(notes.length * st + 0.4);
      notes.forEach((o, k) => {
        const n = Math.round((st + 0.01) * SR), x = new Float32Array(n), f = LO.m2f(base + o); let ph = 0;
        for (let i = 0; i < n; i++) { ph += f / SR; x[i] = (ph % 1 < duty ? 0.45 : -0.45) * (1 - i / n * 0.5); }
        M.put(grain(x), k * st, 1);
      });
      return M;
    },
    'HIT': (R, m) => {
      const ro = m.roll || null, M = Mixer(0.7), n = Math.round(0.25 * SR), x = new Float32Array(n), nz = noise(n, R);
      bp(nz, ro ? ro.hLo : 800, ro ? ro.hHi : 5000); let ph = 0;
      const f0 = (m.weight === 'HEAVY' ? 60 : m.weight === 'LIGHT' && ro ? 120 : 90) * (ro ? ro.hTune : 1), dk = ro ? ro.hDecay : 14;
      for (let i = 0; i < n; i++) { const t = i / SR; ph += (f0 + 140 * Math.exp(-t * 40)) / SR; x[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t * dk) + nz[i] * Math.exp(-t * 55) * 0.8) * 2); }
      M.put(grain(x), 0, 1); return M;
    },
  };
  LO.SFX_RECIPES = Object.keys(RECIPES);
  LO.SFX_SLOTS = {
    era: ['1800S', 'WW2', 'MODERN', 'FUTURE'],
    place: ['FIELD', 'CANYON', 'ROOM', 'TUNNEL', 'SPACE'],
    weight: ['LIGHT', 'MEDIUM', 'HEAVY'],
  };

  // ---------------------------------------------------------------- the offline word matcher
  const WORDS = {
    'machine gun': ['what', 'MACHINE GUN'], 'machinegun': ['what', 'MACHINE GUN'], 'minigun': ['what', 'MACHINE GUN'], 'smg': ['what', 'MACHINE GUN'], 'rifle': ['what', 'MACHINE GUN'], 'gatling': ['what', 'MACHINE GUN'],
    'six shooter': ['what', 'REVOLVER', 6], 'six-shooter': ['what', 'REVOLVER', 6], 'revolver': ['what', 'REVOLVER'], 'pistol': ['what', 'REVOLVER'], 'colt': ['what', 'REVOLVER'], 'gun': ['what', 'REVOLVER'],
    'gunfire': ['what', 'MACHINE GUN'], 'gunshot': ['what', 'REVOLVER'], 'explosions': ['what', 'EXPLOSION'], 'depth charge': ['what', 'EXPLOSION'], 'torpedo launch': ['what', 'TANK'], 'big impact': ['what', 'EXPLOSION'], 'spell zap': ['what', 'LASER'], 'electric arc': ['what', 'LASER'], 'coins': ['what', 'COIN'],
    'tank': ['what', 'TANK'], 'cannon': ['what', 'TANK'], 'artillery': ['what', 'TANK'],
    'explosion': ['what', 'EXPLOSION'], 'bomb': ['what', 'EXPLOSION'], 'grenade': ['what', 'EXPLOSION'], 'blast': ['what', 'EXPLOSION'], 'boom': ['what', 'EXPLOSION'],
    'laser': ['what', 'LASER'], 'blaster': ['what', 'LASER'], 'zap': ['what', 'LASER'], 'phaser': ['what', 'LASER'],
    'coin': ['what', 'COIN'], 'pickup': ['what', 'COIN'], 'jump': ['what', 'JUMP'], 'power up': ['what', 'POWER UP'], 'powerup': ['what', 'POWER UP'], 'level up': ['what', 'POWER UP'],
    'hit': ['what', 'HIT'], 'punch': ['what', 'HIT'], 'kick': ['what', 'HIT'], 'impact': ['what', 'HIT'],
    '1800s': ['era', '1800S'], 'western': ['era', '1800S'], 'wild west': ['era', '1800S'], 'cowboy': ['era', '1800S'], 'old': ['era', '1800S'], 'antique': ['era', '1800S'],
    'ww2': ['era', 'WW2'], 'wwii': ['era', 'WW2'], 'war': ['era', 'WW2'], '1940s': ['era', 'WW2'],
    'modern': ['era', 'MODERN'], 'military': ['era', 'MODERN'],
    'future': ['era', 'FUTURE'], 'sci-fi': ['era', 'FUTURE'], 'scifi': ['era', 'FUTURE'], 'cyberpunk': ['era', 'FUTURE'], 'space age': ['era', 'FUTURE'],
    'canyon': ['place', 'CANYON'], 'desert': ['place', 'CANYON'], 'mountains': ['place', 'CANYON'], 'valley': ['place', 'CANYON'],
    'field': ['place', 'FIELD'], 'outside': ['place', 'FIELD'], 'battlefield': ['place', 'FIELD'], 'street': ['place', 'FIELD'],
    'room': ['place', 'ROOM'], 'saloon': ['place', 'ROOM'], 'inside': ['place', 'ROOM'], 'indoors': ['place', 'ROOM'], 'house': ['place', 'ROOM'],
    'tunnel': ['place', 'TUNNEL'], 'cave': ['place', 'TUNNEL'], 'bunker': ['place', 'TUNNEL'], 'sewer': ['place', 'TUNNEL'],
    'space': ['place', 'SPACE'], 'vacuum': ['place', 'SPACE'],
    'heavy': ['weight', 'HEAVY'], 'big': ['weight', 'HEAVY'], 'huge': ['weight', 'HEAVY'], 'massive': ['weight', 'HEAVY'],
    'light': ['weight', 'LIGHT'], 'small': ['weight', 'LIGHT'], 'tiny': ['weight', 'LIGHT'],
    'single': ['count', 1], 'one': ['count', 1], 'two': ['count', 2], 'three': ['count', 3], 'six': ['count', 6], 'burst': ['count', 8], 'long': ['count', 24],
  };
  const FILLER = new Set(['a', 'an', 'the', 'from', 'in', 'of', 'style', 'sound', 'shot', 'shots', 'shooting', 'firing', 'with', 'and', 'give', 'me', 'make', 'some', 'like', 'for', 'my', 'game', 'please', 'type', 'kind', 'round', 'rounds', 'times']);
  LO.SFX_MAX_WORDS = 8;
  LO.parseSfx = function (text) {
    let s = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const words = s.trim().split(' ').filter(Boolean);
    const out = { what: null, era: null, place: null, weight: null, count: null, unknown: [], tooLong: words.length > LO.SFX_MAX_WORDS };
    if (out.tooLong) s = ' ' + words.slice(0, LO.SFX_MAX_WORDS).join(' ') + ' ';
    const keys = Object.keys(WORDS).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      const needle = ' ' + k + ' ';
      while (s.includes(needle)) {
        const [slot, val, cnt] = WORDS[k];
        if (slot === 'what' && !out.what) { out.what = val; if (cnt) out.count = cnt; }
        else if (slot !== 'what' && out[slot] == null) out[slot] = val;
        s = s.replace(needle, ' ');
      }
    }
    for (const w of s.trim().split(' ').filter(Boolean)) {
      if (/^\d+$/.test(w)) { out.count = Math.min(30, parseInt(w, 10)); continue; }
      if (!FILLER.has(w)) out.unknown.push(w.toUpperCase());
    }
    return out;
  };

  const DEFAULT_PLACE = { 'MACHINE GUN': 'MG FIELD', 'REVOLVER': 'CANYON', 'TANK': 'OPEN FIELD', 'EXPLOSION': 'OPEN FIELD', 'LASER': 'VACUUM', 'COIN': 'SMALL ROOM', 'JUMP': 'NONE', 'POWER UP': 'SMALL ROOM', 'HIT': 'SMALL ROOM' };
  const PLACE_MAP = { FIELD: 'OPEN FIELD', CANYON: 'CANYON', ROOM: 'SMALL ROOM', TUNNEL: 'TUNNEL', SPACE: 'VACUUM' };
  LO.sfxDefaultPlace = (what, place) => {
    if (!place) return DEFAULT_PLACE[what] || 'OPEN FIELD';
    if (place === 'FIELD' && what === 'MACHINE GUN') return 'MG FIELD';
    return PLACE_MAP[place] || place;
  };
  // RANDOM SOUND (v0.5.2): roll every knob a recipe has, from its own dice, so no two rolls sound the same
  LO.rollSfx = function (what, seed) {
    const R = LO.rng((seed ^ 0x5F0DD) >>> 0), pick = a => a[R.int(0, a.length - 1)];
    const o = { weight: pick(LO.SFX_SLOTS.weight), speed: +R.range(0.82, 1.22).toFixed(2), roll: { duty: pick([0.125, 0.25, 0.5]) } };
    const ro = o.roll;
    if (what === 'MACHINE GUN') { o.era = pick(['WW2', 'MODERN', 'FUTURE']); o.count = R.int(5, 22); o.place = pick(['FIELD', 'CANYON', 'TUNNEL', 'ROOM']); }
    else if (what === 'REVOLVER') { o.era = pick(LO.SFX_SLOTS.era); o.count = R.int(1, 6); o.place = pick(['CANYON', 'FIELD', 'ROOM']); }
    else if (what === 'TANK' || what === 'EXPLOSION') { o.place = pick(['FIELD', 'CANYON', 'TUNNEL']); }
    else if (what === 'LASER') { o.count = R.int(1, 5); o.place = pick(['SPACE', 'ROOM', 'TUNNEL']); }
    else if (what === 'COIN') { const b = R.int(76, 86), iv = pick([[0, 5], [0, 7], [0, 4], [0, 12], [0, 4, 7], [0, 7, 12], [0, 5, 9]]); ro.coin = iv.map(x => b + x); ro.coinStep = +R.range(0.05, 0.09).toFixed(3); }
    else if (what === 'JUMP') { ro.jLen = +R.range(0.14, 0.32).toFixed(3); ro.jFrom = R.int(150, 380); ro.jRise = R.int(300, 1000); ro.jVib = R.chance(0.3) ? 0.04 : 0; }
    else if (what === 'POWER UP') {
      const sc = pick([[0, 4, 7], [0, 3, 7], [0, 5, 7], [0, 4, 7, 11], [0, 2, 4, 7, 9]]), steps = R.int(6, 11), dir = pick(['up', 'up', 'updown', 'down']);
      let arp = []; for (let k = 0; k < steps; k++) arp.push(sc[k % sc.length] + 12 * Math.floor(k / sc.length));
      if (dir === 'down') arp.reverse(); else if (dir === 'updown') arp = arp.concat(arp.slice(0, -1).reverse()).slice(0, steps + 4);
      ro.arp = arp; ro.base = R.int(52, 67); ro.step = +R.range(0.045, 0.075).toFixed(3); ro.dir = dir;
    } else if (what === 'HIT') { ro.hLo = R.int(300, 1400); ro.hHi = R.int(2500, 8000); ro.hTune = +R.range(0.7, 1.4).toFixed(2); ro.hDecay = R.int(8, 22); o.place = pick(['ROOM', 'TUNNEL', 'FIELD']); }
    return o;
  };
  // tape-speed change: pitch and length move together (0.82x = slower and deeper, 1.22x = faster and higher)
  const speedUp = (x, k) => { if (Math.abs(k - 1) < 1e-3) return x; const n = Math.floor(x.length / k), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * k, j = Math.floor(p), f = p - j; o[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f; } return o; };

  LO.makeSfx = function (opts) {
    const R = LO.rng(opts.seed >>> 0);
    const fn = RECIPES[opts.what] || RECIPES['MACHINE GUN'];
    const t0 = Date.now();
    const M = fn(R, { era: opts.era, place: opts.place, weight: opts.weight, count: opts.count, roll: opts.roll || null });
    if (opts.speed && Math.abs(opts.speed - 1) > 1e-3) { M.L = speedUp(M.L, opts.speed); M.R = speedUp(M.R, opts.speed); }
    const chain = opts.chain && LO.atmosActive(opts.chain) ? opts.chain
      : { slots: [{ preset: LO.sfxDefaultPlace(opts.what, opts.place), amount: 100, size: 1 }], distance: 0 };
    const w = LO.applyAtmos(M.L, M.R, chain, opts.seed);
    const out = finish(w.L, w.R);
    return { ...out, ms: Date.now() - t0, place: chain.slots[0] && chain.slots[0].preset };
  };
})(typeof self !== 'undefined' ? self : globalThis);
