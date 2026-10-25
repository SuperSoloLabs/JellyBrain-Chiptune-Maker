/* LowOrbit Chip Studio - LO-1, our own chip ("shipped in 1991")
   OFFICIAL SPEC (the walls of the garden):
   - 12 voices, 32 kHz output, 8 to 12-bit output crush (default 10-bit)
   - per-voice oscillators: PWM pulse, dual saw, 2-op FM, triangle, noise, 8-bit drum samples
   - per-voice resonant state-variable filter with envelope (SID-style)
   - global ping-pong echo with darkening feedback, LO-1 hall reverb, sidechain pump bus
   - drum samples may use the SP-1200 path: 12-bit / 26 kHz "sped-up record" crunch
   Reference sound: the LO-1 machine gun (see sfx.js). */
(function (G) {
  const LO = G.LO;
  const SR = LO.SR;

  function sp1200(x) {
    const speed = 1.333, step = speed * SR / 26040, n = Math.floor(x.length / step), y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = Math.round(LO.clamp(x[Math.min(x.length - 1, Math.floor(i * step))], -1, 1) * 2047) / 2047;
    const out = new Float32Array(x.length), f = new LO.Biquad('lp', 11000, 0.7);
    for (let i = 0; i < x.length; i++) out[i] = f.run(y[Math.min(n - 1, Math.floor(i * 26040 / speed / SR))]);
    return out;
  }

  // ADSR in seconds
  function env(t, gate, a, d, s, r) {
    let v;
    if (t < a) v = t / a; else v = s + (1 - s) * Math.exp(-(t - a) / Math.max(1e-4, d));
    if (t >= gate) v *= Math.max(0, 1 - (t - gate) / r);
    return v;
  }

  const TIMBRES = {
    pulse:   { a: .003, d: .08, s: .65, r: .04, cut: 6000, fenv: 0, res: .1 },
    arp:     { a: .001, d: .05, s: .5, r: .02, cut: 6000, fenv: 0, res: .05 },
    saw:     { a: .004, d: .12, s: .8, r: .05, cut: 1800, fenv: 5200, fdec: .15, res: .25 },
    sax:     { a: .05, d: .1, s: .85, r: .08, cut: 2600, fenv: 600, fdec: .3, res: .1 },
    bell:    { a: .003, d: .6, s: .0, r: .25, cut: 8000, fenv: 0, res: 0 },
    brass:   { a: .04, d: .15, s: .8, r: .12, cut: 1400, fenv: 3000, fdec: .09, res: .15 },
    padsaw:  { a: .4, d: .3, s: .8, r: .5, cut: 2300, fenv: 0, res: .1 },
    strings: { a: .3, d: .2, s: .85, r: .4, cut: 2600, fenv: 0, res: .05 },
    rhodes:  { a: .003, d: .9, s: .15, r: .15, cut: 9000, fenv: 0, res: 0 },
    fmbass:  { a: .003, d: .1, s: .7, r: .03, cut: 2500, fenv: 0, res: .1 },
    orchbass:{ a: .08, d: .2, s: .85, r: .25, cut: 900, fenv: 0, res: .05 },
    upright: { a: .003, d: .35, s: .25, r: .08, cut: 1500, fenv: 400, fdec: .1, res: .1 },
    acid:    { a: .002, d: .12, s: .55, r: .03, cut: 420, fenv: 3400, fdec: .11, res: .82 },
    reese:   { a: .02, d: .3, s: .85, r: .1, cut: 650, fenv: 300, fdec: .3, res: .2 },
    sub:     { a: .01, d: .2, s: .9, r: .12, cut: 7000, fenv: 0, res: 0 },
  };

  function synthLine(events, total, timbreName, R, opts) {
    const tb = TIMBRES[timbreName]; const out = new Float32Array(total);
    const svf = new LO.SVF(); let ph = 0, ph2 = 0, ph3 = 0, prevF = null;
    const detune = opts.detune || (timbreName === 'reese' ? 0.012 : 0.006);
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const gate = (ev.e - ev.s) / SR;
      const end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(tb.r * SR) + 10);
      const f = LO.m2f(ev.m);
      for (let i = ev.s; i < end; i++) {
        const t = (i - ev.s) / SR;
        let fc = f;
        if (ev.slide && prevF) fc = f * Math.pow(prevF / f, Math.exp(-t / 0.05));
        if (ev.arp) fc = LO.m2f(ev.m + ev.arp[Math.floor(t * 50) % ev.arp.length]);
        if (opts.vib && t > 0.18) fc *= 1 + opts.vib * Math.sin(2 * Math.PI * 5.6 * t) * Math.min(1, (t - 0.18) / 0.25);
        ph += fc / SR; ph2 += fc * (1 + detune) / SR; ph3 += fc * (1 - detune) / SR;
        ph -= Math.floor(ph); ph2 -= Math.floor(ph2); ph3 -= Math.floor(ph3);
        let w;
        switch (timbreName) {
          case 'pulse': { const duty = 0.25 + 0.13 * Math.sin(2 * Math.PI * 0.7 * (i / SR)); w = ph < duty ? 0.6 : -0.6; break; }
          case 'arp': w = ph < 0.125 ? 0.6 : -0.6; break;
          case 'saw': case 'padsaw': w = (1 - 2 * ph) * 0.45 + (1 - 2 * ph2) * 0.45 + (timbreName === 'padsaw' ? (1 - 2 * ph3) * 0.4 : 0); break;
          case 'strings': w = ((1 - 2 * ph) + (1 - 2 * ph2) + (1 - 2 * ph3)) * 0.3 * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)); break;
          case 'sax': w = (ph < 0.42 ? 0.55 : -0.55) + 0.45 * (2 * Math.abs(1 - 2 * ph) - 1); break;
          case 'bell': w = Math.sin(2 * Math.PI * ph + 2.2 * Math.exp(-t / 0.4) * Math.sin(2 * Math.PI * ph * 3.5)) * Math.exp(-t * 1.0); break;
          case 'brass': { const br = Math.min(1, t / 0.09); w = 0; for (let k = 1; k <= 10; k++) w += Math.sin(2 * Math.PI * k * ph) / k * Math.exp(-(k - 1) * (1.15 - br * 0.75) * 0.9); w *= 0.55; break; }
          case 'rhodes': w = Math.sin(2 * Math.PI * ph + 1.6 * (ev.v || 1) * Math.exp(-t / 0.35) * Math.sin(2 * Math.PI * ph)) + 0.1 * Math.sin(2 * Math.PI * ph * 14) * Math.exp(-t * 40); break;
          case 'fmbass': { const idx = 2.6 * Math.exp(-t / 0.06) + 0.6; w = Math.sin(2 * Math.PI * ph + idx * Math.sin(2 * Math.PI * ph)) + 0.5 * Math.sin(2 * Math.PI * ph); break; }
          case 'orchbass': w = ((1 - 2 * ph) + (1 - 2 * ph2)) * 0.5; break;
          case 'upright': w = Math.sin(2 * Math.PI * ph) + 0.4 * (2 * Math.abs(1 - 2 * ph) - 1); break;
          case 'acid': w = (1 - 2 * ph) * 0.9; break;
          case 'reese': w = ((1 - 2 * ph2) + (1 - 2 * ph3)) * 0.5; break;
          case 'sub': w = Math.sin(2 * Math.PI * ph) + 0.12 * (2 * Math.abs(1 - 2 * ph) - 1); break;
          default: w = Math.sin(2 * Math.PI * ph);
        }
        const fe = tb.fenv ? tb.fenv * (timbreName === 'acid' ? 0.45 + 0.55 * (ev.v || 1) : 1) * Math.exp(-t / (tb.fdec || 0.1)) : 0;
        const cm = (opts.cutMul ? opts.cutMul[i] : 1) * (opts.bright || 1);
        if (tb.cut < 8000) w = svf.run(w, Math.min(14000, tb.cut * cm + fe), tb.res, 'lp');
        out[i] += w * env(t, gate, tb.a, tb.d, tb.s, tb.r) * (ev.v || 1) * 0.5;
      }
      prevF = f;
    }
    return out;
  }

  function drumLine(hits, total, bank) {
    const out = new Float32Array(total);
    for (const h of hits) {
      const smp = h.kind === 'tom' || h.kind === 'timp' ? bank.pitched(h.kind, h.m) : bank[h.kind];
      if (!smp) continue;
      const end = Math.min(total, h.s + smp.length);
      for (let i = h.s; i < end; i++) out[i] += smp[i - h.s] * (h.v || 1);
    }
    return out;
  }

  const ROLE_NAMES = ['LEAD', 'COUNTER', 'PAD 1', 'PAD 2', 'PAD 3', 'ARP', 'BASS', 'KICK', 'SNARE', 'HATS', 'PERC', 'CYMBAL'];
  const PANS = [0.12, -0.3, -0.55, 0.0, 0.55, 0.5, 0, 0, 0.05, 0.3, -0.35, 0.25];
  const SENDS = [0.32, 0.3, 0.25, 0.25, 0.25, 0.22, 0, 0, 0.1, 0, 0.15, 0.1];
  const LEVELS = [0.36, 0.22, 0.11, 0.11, 0.11, 0.12, 0.42, 0.95, 0.6, 0.16, 0.45, 0.4];
  const PUMPED = [false, false, true, true, true, true, true, false, false, false, false, false];

  const chip = {
    id: 'LO-1', name: 'LO-1', full: 'LOWORBIT LO-1', year: 1991, tier: 'LO-1', voices: 12, rate: '32 KHZ', bits: '8-12 BIT',
    blurb: ['OUR OWN CHIP: 12 VOICES', 'RESONANT FILTERS, FM, PWM, SAMPLES', 'ECHO, HALL, PUMP BUS, SP-1200 DRUMS'],
    channelsDef: ROLE_NAMES.map(n => ({ name: n, role: n, vol: true })),
    fxSchema: [
      { id: 'bits', label: 'CRUSH', type: 'slider', min: 8, max: 12, step: 1, fmt: v => v + '-BIT', level: 'mix' },
      { id: 'echoTime', label: 'ECHO TIME', type: 'select', options: ['1/8', '3/16', '1/4', '3/8'], level: 'mix' },
      { id: 'echoFb', label: 'ECHO REPEATS', type: 'slider', min: 0, max: 85, step: 5, fmt: v => v + '%', level: 'mix' },
      { id: 'echoMix', label: 'ECHO LEVEL', type: 'slider', min: 0, max: 100, step: 5, fmt: v => v + '%', level: 'mix' },
      { id: 'hall', label: 'HALL REVERB', type: 'slider', min: 0, max: 100, step: 5, fmt: v => v + '%', level: 'mix' },
      { id: 'pump', label: 'PUMP', type: 'slider', min: 0, max: 100, step: 5, fmt: v => v + '%', level: 'mix', note: 'SIDECHAIN DUCK ON THE KICK' },
      { id: 'sp1200', label: 'SP-1200 DRUMS', type: 'toggle', level: 'render', note: '12-BIT 26 KHZ CRUNCH' },
    ],
    defaultFx(song) {
      const g = song.meta.genre, h = song.meta.hints;
      const fx = {
        bits: 10, echoTime: '3/16', echoFb: 42, echoMix: 70,
        hall: ['ORCHESTRAL', 'DUNGEON', 'TECHNO'].includes(g) ? 35 : 15,
        pump: ['SYNTHWAVE', 'CYBERPUNK', 'TECHNO'].includes(g) ? 45 : 15,
        sp1200: ['LO-FI', 'DOWNTEMPO'].includes(g),
      };
      if (h) {
        if (h.pump != null) fx.pump = h.pump; if (h.sp1200 != null) fx.sp1200 = !!h.sp1200; if (h.hall != null) fx.hall = h.hall;
        if (h.echo) { fx.echoTime = h.echo.time; fx.echoFb = h.echo.fb; fx.echoMix = h.echo.mix; }
      }
      return fx;
    },
    render(song, fx) {
      const T = LO.timing(song); const total = T.total; const P = song.parts; const M = song.meta;
      const R = LO.rng(song.seed ^ 0x1991);
      const leadT = { pulse: 'pulse', saw: 'saw', sax: 'sax', bell: 'bell', brass: 'brass' }[M.leadTimbre] || 'pulse';
      const counterT = leadT === 'brass' ? 'sax' : leadT === 'bell' ? 'pulse' : 'pulse';
      const padT = { saw: 'padsaw', strings: 'strings', rhodes: 'rhodes', none: 'padsaw' }[M.padTimbre];
      const bs = M.vector && M.vector.bassStyle, hb = M.hints && M.hints.bass;
      const bassT = (hb || bs) === 'acid' ? 'acid' : (hb || bs) === 'reese' ? 'reese' : (hb || bs) === 'sub' ? 'sub'
        : M.drumStyle === 'orch' || M.genre === 'DUNGEON' ? 'orchbass' : (M.genre === 'LO-FI' || hb === 'walk') ? 'upright' : 'fmbass';
      const lead = LO.toMono(P.lead, T), counter = LO.toMono(P.counter, T), bass = LO.toMono(P.bass, T);
      const padV = [[], [], []], arp = [];
      for (const c of P.chords) {
        const skipPad = M.padTimbre === 'none' && c.sec !== 'break';
        if (!skipPad) {
          if (M.padTimbre === 'rhodes' && M.meter !== '3/4' && ['A', 'B', 'A2'].includes(c.sec)) {
            for (const [o, d, v] of [[0, .75, 1], [1.5, .45, .7], [2.75, .5, .85], [3.5, .4, .6]])
              for (let j = 0; j < 3; j++) padV[j].push({ t: c.t + o + (M.swing && (o % 0.5) ? M.swing : 0), d, m: c.tones[j] + 12, v });
          } else for (let j = 0; j < 3; j++) padV[j].push({ t: c.t, d: c.d, m: c.tones[j] + 12, v: 1 });
        }
        if (!(P.arp && P.arp.length) && M.arp && c.sec !== 'outro') {
          const up = c.tones.slice(0, 3).map(x => x + 24).concat([c.tones[0] + 36]);
          const seq = up.concat(up.slice(1, 3).reverse()); const div = M.bpm > 110 ? 4 : 8;
          for (let k = 0; k < 4 * div; k++) arp.push({ t: c.t + k / div, d: 0.9 / div, m: seq[k % seq.length], v: c.sec === 'intro' ? 0.6 : 0.85 });
        }
      }
      if (P.arp && P.arp.length) for (const n of P.arp) arp.push(n);
      // filter-sweep automation curves (beats -> per-sample multipliers)
      const curves = {};
      for (const sw of (M.sweeps || [])) {
        const pts = sw.points.map(([b, v]) => [T.s(b), v]); const arr = new Float32Array(total);
        let k = 0;
        for (let i = 0; i < total; i++) {
          while (k < pts.length - 2 && i > pts[k + 1][0]) k++;
          const [x0, y0] = pts[k], [x1, y1] = pts[Math.min(pts.length - 1, k + 1)];
          arr[i] = x1 > x0 ? y0 + (y1 - y0) * LO.clamp((i - x0) / (x1 - x0), 0, 1) : y1;
        }
        for (const tg of sw.targets) curves[tg] = arr;
      }
      const bright = M.brightness || 1;
      const drumRate = SR;
      const raw0 = k => LO.drumSource(k, drumRate, R);
      const crunch = x => (fx.sp1200 ? sp1200(x) : x);
      const bank = { kick: crunch(raw0('kick')), snare: crunch(raw0('snare')), clap: crunch(raw0('clap')), hat: crunch(raw0('hat')), ohat: crunch(raw0('ohat')), crash: raw0('crash'), rim: crunch(raw0('rim')) };
      { // riser: 8 beats of noise sweeping up into the drop
        const n = Math.round(8 * T.spb * SR), x = new Float32Array(n), f = new LO.Biquad('lp', 300, 0.9);
        for (let i = 0; i < n; i++) { const u = i / n; if (i % 128 === 0) { const z1 = f.z1, z2 = f.z2; f.set('lp', 300 + 9000 * u * u, 0.9); f.z1 = z1; f.z2 = z2; } x[i] = f.run(R.random() * 2 - 1) * u * u * 0.6; }
        bank.riser = x;
      }
      const cache = {};
      bank.pitched = (k, m) => (cache[k + m] = cache[k + m] || crunch(LO.drumSource(k, drumRate, R, m)));
      const hits = P.drums.map(d => ({ ...d, s: T.s(d.t) }));
      const sel = ks => hits.filter(h => ks.includes(h.kind));
      const raw = [
        synthLine(lead, total, leadT, R, { vib: 0.009 }),
        synthLine(counter, total, counterT, R, { vib: 0.006 }),
        synthLine(LO.toMono(padV[0], T), total, padT, R, { cutMul: curves.pad, bright }),
        synthLine(LO.toMono(padV[1], T), total, padT, R, { cutMul: curves.pad, bright }),
        synthLine(LO.toMono(padV[2], T), total, padT, R, { cutMul: curves.pad, bright }),
        synthLine(LO.toMono(arp, T), total, 'arp', R, { cutMul: curves.arp, bright }),
        synthLine(bass, total, bassT, R, { cutMul: curves.bass, bright }),
        drumLine(sel(['kick']), total, bank),
        drumLine(sel(['snare', 'clap']), total, bank),
        drumLine(sel(['hat', 'ohat']), total, bank),
        drumLine(sel(['rim', 'tom', 'timp']), total, bank),
        drumLine(sel(['crash', 'riser']), total, bank),
      ];
      const kickTimes = sel(['kick', 'timp']).map(h => h.s);
      const events = [lead, counter, LO.toMono(padV[0], T), LO.toMono(padV[1], T), LO.toMono(padV[2], T), LO.toMono(arp, T), bass,
        sel(['kick']).map(h => ({ s: h.s, e: h.s + 3000, m: 0 })), sel(['snare', 'clap']).map(h => ({ s: h.s, e: h.s + 3000, m: 0 })),
        sel(['hat', 'ohat']).map(h => ({ s: h.s, e: h.s + 1500, m: 0 })), sel(['rim', 'tom', 'timp']).map(h => ({ s: h.s, e: h.s + 3000, m: 0 })),
        sel(['crash', 'riser']).map(h => ({ s: h.s, e: h.s + 9000, m: 0 }))];
      return { raw, events, total, kickTimes, budget: null };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total; const L = new Float32Array(n), Rr = new Float32Array(n);
      const sL = new Float32Array(n), sR = new Float32Array(n);
      const q = Math.pow(2, (fx.bits || 10) - 1);
      // PRODUCTION RULE: gain staging. A voice that runs hotter than full scale is turned down before the
      // output DAC, so it can never hard-clip there.
      if (!R.vstage) R.vstage = R.raw.map(arr => { let pk = 1e-9; for (let i = 0; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > pk) pk = a; } return pk > 0.92 ? 0.92 / pk : 1; });
      // pump envelope
      const duck = new Float32Array(n).fill(1);
      const depth = (fx.pump || 0) / 100 * 0.65, dn = Math.round(0.2 * SR);
      if (depth > 0) for (const s of R.kickTimes) for (let k = 0; k < dn && s + k < n; k++) duck[s + k] = Math.min(duck[s + k], 1 - depth * Math.exp(-k / (0.06 * SR)));
      for (let v = 0; v < 12; v++) {
        const on = onlyChannel != null ? v === onlyChannel : LO.audible(chState, v);
        if (!on) continue;
        const g = LEVELS[v] * (chState[v].vol == null ? 1 : chState[v].vol);
        const pan = PANS[v], gl = Math.cos((pan + 1) * Math.PI / 4) * g, gr = Math.sin((pan + 1) * Math.PI / 4) * g;
        const src = R.raw[v], snd = SENDS[v], pumped = PUMPED[v]; const vs = R.vstage[v];
        for (let i = 0; i < n; i++) {
          let x = src[i]; if (!x) continue;
          x = Math.round(LO.clamp(x * vs, -1, 1) * q) / q;
          if (pumped) x *= duck[i];
          L[i] += x * gl; Rr[i] += x * gr;
          if (snd) { sL[i] += x * gl * snd; sR[i] += x * gr * snd; }
        }
      }
      const spb = 60 / song.meta.bpm;
      const beats = { '1/8': 0.5, '3/16': 0.75, '1/4': 1, '3/8': 1.5 }[fx.echoTime] || 0.75;
      if (fx.echoMix > 0) {
        const [eL, eR] = LO.pingPong(sL, sR, Math.round(beats * spb * SR), (fx.echoFb || 0) / 100, 3500);
        const m = fx.echoMix / 100;
        for (let i = 0; i < n; i++) { L[i] += eL[i] * m; Rr[i] += eR[i] * m; }
      }
      if (fx.hall > 0) {
        const [hL, hR] = LO.reverb(sL, sR, 0.8, 0.35);
        const m = fx.hall / 100 * 2.2;
        for (let i = 0; i < n; i++) { L[i] += hL[i] * m; Rr[i] += hR[i] * m; }
      }
      return { L, R: Rr };
    },
  };
  LO.CHIPS['LO-1'] = chip;
  LO.sp1200 = sp1200;
})(typeof self !== 'undefined' ? self : globalThis);
