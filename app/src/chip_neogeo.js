/* LowOrbit Chip Studio - NEO GEO profile: YAMAHA YM2610 (OPNB) + YM3016 DAC. Our "Apex" 16-bit chip.
   4 FM channels (4 operators), 3 SSG squares, 6 ADPCM-A drum channels (fixed 18.5 kHz, 4-bit data -> 12-bit),
   1 ADPCM-B channel (variable pitch, 4-bit data -> 16-bit), stereo panning per channel. (SOLID)
   Every drum and the sampled pad really go through the 4-bit ADPCM codecs. The ADPCM-B instrument is our own
   math-built string ensemble, looped like a real sample. YM3016 floating-point DAC precision is ESTIMATED. */
(function (G) {
  const LO = G.LO, SR = LO.SR, A_RATE = 18518;
  const roleList = r => Object.keys(LO.FM_PATCHES).filter(k => LO.FM_PATCHES[k].role.includes(r));
  const LEAD_PREF = { pulse: ['SYNTH LEAD', 'HOLLOW LEAD'], saw: ['SYNTH LEAD', 'FM BRASS'], sax: ['FM BRASS'], bell: ['BELL', 'E.PIANO'], brass: ['FM BRASS'] };

  // the ADPCM-B sample: a looping math-made string ensemble (84-sample period at 22050 Hz = 262.5 Hz base)
  let ENSEMBLE = null;
  function ensemble() {
    if (ENSEMBLE) return ENSEMBLE;
    const fs = 22050, per = 84, cyc = 64, n = per * cyc, x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = (i % per) / per, lfo = i / n;
      let s = 0;
      for (let h = 1; h <= 18; h++) {
        const shimmer = 0.75 + 0.25 * Math.sin(2 * Math.PI * (lfo * (h % 3 + 1)) + h);
        s += Math.sin(2 * Math.PI * h * ph + h * 0.7 * Math.sin(2 * Math.PI * lfo)) / Math.pow(h, 1.15) * shimmer;
      }
      x[i] = s * 0.42;
    }
    ENSEMBLE = { data: LO.adpcmB(x), fs, base: fs / per };
    return ENSEMBLE;
  }
  function adpcmBVoice(events, total) {
    const S = ensemble(), out = new Float32Array(total), d = S.data, len = d.length, FR = SR / 60;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e], end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(SR * 0.35));
      const step = LO.m2f(ev.m) / S.base * S.fs / SR; let pos = 0;
      for (let i = ev.s; i < end; i++) {
        const k = (i - ev.s) / FR, kOff = (ev.e - ev.s) / FR;
        let vol = Math.min(1, k / 9) * (ev.v == null ? 1 : ev.v);              // 8-bit volume register ramped by the driver at 60 Hz
        if (k > kOff) vol *= Math.max(0, 1 - (k - kOff) / 20);
        vol = Math.round(vol * 255) / 255;
        const p = Math.floor(pos) % len; out[i] = d[p] * vol; pos += step;
      }
    }
    return out;
  }
  const floatDac = x => { const a = Math.abs(x); if (a < 1e-6) return 0; const step = Math.pow(2, Math.ceil(Math.log2(a))) / 1024; return Math.round(x / step) * step; };

  function picks(song) {
    const R = LO.rng((song.seed >>> 0) ^ 0x2610), M = song.meta, bs = String(M.vector && M.vector.bassStyle);
    return {
      lead: LO.pickPatch(R, 'lead', LEAD_PREF[M.leadTimbre]), counter: LO.pickPatch(R, 'counter', ['FM BRASS', 'E.PIANO', 'ORCH HIT']),
      arp: LO.pickPatch(R, 'arp', ['BELL', 'MARIMBA', 'PLUCK']),
      bass: ['acid', 'reese', 'sub', 'rolling'].includes(bs) ? R.pick(['GROWL BASS', 'SUB BASS']) : ['funk', 'walk'].includes(bs) ? 'SLAP BASS' : R.pick(['FM BASS', 'SLAP BASS', 'GROWL BASS']),
    };
  }
  const A_CH = [['kick'], ['snare', 'clap'], ['hat'], ['ohat', 'crash'], ['rim', 'tom', 'timp'], ['riser']];

  const chip = {
    id: 'NEO GEO', name: 'NEO GEO', full: 'YAMAHA YM2610 + YM3016', year: 1990, tier: 'APEX', voices: 14, rate: 'ADPCM 18.5 KHZ', bits: '16-BIT DAC',
    blurb: ['4 FM VOICES + 3 SSG SQUARES', '6 ADPCM DRUM CHANNELS, REAL 4-BIT CODEC', 'ADPCM-B: A LOOPED SAMPLED STRING PAD'],
    channelsDef: [
      { name: 'FM 1', role: 'LEAD', vol: true }, { name: 'FM 2', role: 'COUNTER', vol: true }, { name: 'FM 3', role: 'BASS', vol: true }, { name: 'FM 4', role: 'ARP', vol: true },
      { name: 'SSG A', role: 'CHORD', vol: true }, { name: 'SSG B', role: 'CHORD', vol: true }, { name: 'SSG C', role: 'ECHO', vol: true },
      { name: 'ADPCM-A 1', role: 'KICK', vol: true }, { name: 'ADPCM-A 2', role: 'SNARE', vol: true }, { name: 'ADPCM-A 3', role: 'HATS', vol: true },
      { name: 'ADPCM-A 4', role: 'CYMBAL', vol: true }, { name: 'ADPCM-A 5', role: 'PERC', vol: true }, { name: 'ADPCM-A 6', role: 'FX', vol: true },
      { name: 'ADPCM-B', role: 'STRING PAD', vol: true },
    ],
    fxSchema: [
      { id: 'leadPatch', label: 'LEAD', type: 'select', options: roleList('lead'), level: 'render' },
      { id: 'bassPatch', label: 'BASS', type: 'select', options: roleList('bass'), level: 'render' },
      { id: 'ssgEcho', label: 'SSG ECHO', type: 'toggle', level: 'render', note: 'SSG C ECHOES THE LEAD' },
      { id: 'width', label: 'STEREO WIDTH', type: 'slider', min: 0, max: 100, step: 10, level: 'mix' },
    ],
    defaultFx(song) { const p = picks(song); return { leadPatch: p.lead, bassPatch: p.bass, ssgEcho: song.meta.bpm < 130, width: 70 }; },
    render(song, fx) {
      const T = LO.timing(song), total = T.total, P = song.parts, M = song.meta, pk = picks(song);
      const R = LO.rng((song.seed >>> 0) ^ 0x1990);
      const patch = n => LO.FM_PATCHES[n] || LO.FM_PATCHES['SYNTH LEAD'];
      const lead = LO.toMono(P.lead, T), counter = LO.toMono(P.counter, T), bass = LO.toMono(P.bass, T);
      let arpSrc = (P.arp || []).slice();
      if (!arpSrc.length && M.arp) for (const c of P.chords) { if (c.sec === 'outro') continue; const up = c.tones.slice(0, 3).map(x => x + 24); for (let k = 0; k < 16; k++) arpSrc.push({ t: c.t + k / 4, d: 0.22, m: up[k % 3] + (k % 6 >= 3 ? 12 : 0), v: 0.8 }); }
      const arp = LO.toMono(arpSrc, T);
      const padV = [[], [], []];
      for (const c of P.chords) { if (M.padTimbre === 'none' && c.sec !== 'break') continue; for (let j = 0; j < 3; j++) padV[j].push({ t: c.t, d: c.d - 0.05, m: c.tones[j] + 12, v: 0.85 }); }
      const strings = LO.toMono(padV[0], T), ssA = LO.toMono(padV[1], T), ssB = LO.toMono(padV[2], T);
      const echo = fx.ssgEcho ? LO.toMono(P.lead.map(n => ({ ...n, t: n.t + 0.75, v: (n.v || 1) * 0.45, slide: false })), T) : [];
      // ADPCM-A: every drum is encoded to 4 bits per sample at 18.5 kHz and decoded again
      const bank = {};
      for (const k of ['kick', 'snare', 'clap', 'hat', 'ohat', 'crash', 'rim', 'tom', 'timp']) bank[k] = LO.resample(LO.adpcmA(LO.drumSource(k, A_RATE, R, k === 'tom' ? 47 : k === 'timp' ? 40 : undefined)), A_RATE, SR);
      { const n = Math.round(8 * T.spb * A_RATE), x = new Float32Array(n); const f = new LO.Biquad('lp', 300, 0.9, A_RATE); for (let i = 0; i < n; i++) { const u = i / n; if (i % 64 === 0) { const z1 = f.z1, z2 = f.z2; f.set('lp', 300 + 7000 * u * u, 0.9, A_RATE); f.z1 = z1; f.z2 = z2; } x[i] = f.run(R.random() * 2 - 1) * u * u * 0.6; } bank.riser = LO.resample(LO.adpcmA(x), A_RATE, SR); }
      const hitsOf = kinds => P.drums.filter(d => kinds.includes(d.kind)).map(d => ({ ...d, s: T.s(d.t) })).sort((a, b) => a.s - b.s);
      const aHits = A_CH.map(hitsOf);
      const raw = [
        LO.fmVoice(lead, total, patch(fx.leadPatch || pk.lead), { vib: 0.006, vibDelay: 0.3 }),
        LO.fmVoice(counter, total, patch(pk.counter), { vib: 0.004 }),
        LO.fmVoice(bass, total, patch(fx.bassPatch || pk.bass)),
        LO.fmVoice(arp, total, patch(pk.arp)),
        LO.psgVoice(ssA, total, { clock: 4000000, div: 16, maxN: 4095, dbStep: 3, sus: 0.7, decay: 20, rel: 4 }),
        LO.psgVoice(ssB, total, { clock: 4000000, div: 16, maxN: 4095, dbStep: 3, sus: 0.7, decay: 20, rel: 4 }),
        LO.psgVoice(echo, total, { clock: 4000000, div: 16, maxN: 4095, dbStep: 3, sus: 0.5, decay: 10, rel: 3 }),
        ...aHits.map(h => LO.sampleHits(h, total, bank, 1)),
        adpcmBVoice(strings, total),
      ];
      const ev = h => h.map(x => ({ s: x.s, e: x.s + 2500, m: 0 }));
      return { raw, events: [lead, counter, bass, arp, ssA, ssB, echo, ...aHits.map(ev), strings], total, budget: null };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total, L = new Float32Array(n), Rr = new Float32Array(n), w = (fx.width == null ? 70 : fx.width) / 100;
      const LEV = [0.48, 0.3, 0.6, 0.24, 0.06, 0.06, 0.06, 0.95, 0.65, 0.2, 0.32, 0.45, 0.35, 0.3];
      const PAN = [0, -0.8, 0, 0.8, -0.3, 0.3, 0, 0, 0, 0.6, -0.4, -0.5, 0.3, 0];
      for (let c = 0; c < R.raw.length; c++) {
        const on = onlyChannel != null ? c === onlyChannel : LO.audible(chState, c); if (!on) continue;
        const g = LEV[c] * (chState[c].vol == null ? 1 : chState[c].vol), p = PAN[c] * w, gl = g * Math.min(1, 1 - p), gr = g * Math.min(1, 1 + p), src = R.raw[c];
        for (let i = 0; i < n; i++) { const x = src[i]; if (!x) continue; L[i] += x * gl; Rr[i] += x * gr; }
      }
      for (let i = 0; i < n; i++) { L[i] = floatDac(L[i] * 0.5) * 2; Rr[i] = floatDac(Rr[i] * 0.5) * 2; }
      return { L, R: Rr };
    },
  };
  LO.CHIPS['NEO GEO'] = chip;
})(typeof self !== 'undefined' ? self : globalThis);
