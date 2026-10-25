/* LowOrbit Chip Studio - Commodore Amiga "Paula" profile (hardware-true limits)
   4 channels of 8-bit samples, 6-bit volume (0-64), hard-panned L R R L, period-based pitch
   (PAL clock 3546895 / period, minimum period 124), no interpolation, A500 RC filter + LED filter.
   Music is sequenced like a ProTracker MOD: 50 Hz ticks, arpeggio / vibrato / portamento commands. */
(function (G) {
  const LO = G.LO;
  const PAL = 3546895, TICK = LO.SR / 50, MINP = 124;

  function toInt8(arr) {
    let pk = 1e-9; for (const x of arr) pk = Math.max(pk, Math.abs(x));
    const o = new Int8Array(arr.length);
    for (let i = 0; i < arr.length; i++) o[i] = Math.round(arr[i] / pk * 127);
    return o;
  }
  function cycleWave(kind, len) {
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const p = i / len;
      if (kind === 'square') a[i] = p < 0.5 ? 1 : -1;
      else if (kind === 'pulse') a[i] = p < 0.25 ? 1 : -1;
      else if (kind === 'saw') a[i] = 1 - 2 * p;
      else if (kind === 'tri') a[i] = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      else if (kind === 'soft') a[i] = Math.sin(2 * Math.PI * p) * 0.8 + (p < 0.5 ? 0.25 : -0.25);
      else if (kind === 'brass') { let s = 0; for (let k = 1; k <= Math.min(12, len / 2); k++) s += Math.sin(2 * Math.PI * k * p) / k; a[i] = s; }
      else if (kind === 'strings') { let s = 0; for (let k = 1; k <= Math.min(8, len / 2); k++) s += Math.sin(2 * Math.PI * k * p) / (k * k * 0.6 + k * 0.4); a[i] = s; }
      else if (kind === 'bassw') a[i] = (1 - 2 * p) * 0.7 + (p < 0.5 ? 0.3 : -0.3);
      else a[i] = Math.sin(2 * Math.PI * p);
    }
    return toInt8(a);
  }
  const LEAD_WAVE = { pulse: 'pulse', saw: 'saw', sax: 'soft', bell: 'tri', brass: 'brass' };

  function makeBank(song) {
    const R = LO.rng(song.seed ^ 0xA500);
    const multi = (kind) => ({ 64: cycleWave(kind, 64), 32: cycleWave(kind, 32), 16: cycleWave(kind, 16) });
    const SAMPLE_RATE = 16574; // C-3 at period 214, the classic tracker sampling rate
    const drums = {};
    for (const k of ['kick', 'snare', 'clap', 'hat', 'ohat', 'crash', 'rim', 'tom', 'timp']) drums[k] = toInt8(LO.drumSource(k, SAMPLE_RATE, R, k === 'timp' ? 40 : 47));
    return {
      lead: multi(LEAD_WAVE[song.meta.leadTimbre] || 'square'),
      chord: multi(song.meta.padTimbre === 'strings' ? 'strings' : song.meta.padTimbre === 'rhodes' ? 'soft' : 'saw'),
      bass: multi('bassw'),
      drums, drumPeriod: 214,
    };
  }

  // one Paula channel: zero-order-hold sample playback with tick-rate effects
  function renderChannel(events, total, bank, kind, envDef) {
    const out = new Float32Array(total);
    let prevM = null;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(TICK * (envDef.rel || 2)));
      let smp, loop = true, period;
      if (kind === 'drum') { smp = bank.drums[ev.kind] || bank.drums.snare; loop = false; }
      let pos = 0;
      for (let i = ev.s; i < end; i++) {
        const k = Math.floor((i - ev.s) / TICK);
        if ((i - ev.s) % TICK < 1 || i === ev.s) {
          if (kind === 'drum') {
            period = (ev.kind === 'tom' || ev.kind === 'timp') ? Math.round(bank.drumPeriod * Math.pow(2, -((ev.m || 47) - 47) / 12)) : bank.drumPeriod;
          } else {
            let m = ev.m;
            if (ev.arp) m += ev.arp[k % ev.arp.length];
            if (ev.slide && prevM != null && k < 5) m = prevM + (ev.m - prevM) * (k / 5);
            if (envDef.vib && k > 12) m += envDef.vib * Math.sin(2 * Math.PI * k / 8);
            const f = LO.m2f(m);
            let len = 64; for (const L of [64, 32, 16]) { len = L; if (PAL / (f * L) >= MINP) break; }
            smp = bank[kind][len]; period = Math.max(MINP, Math.round(PAL / (f * len)));
          }
        }
        // 6-bit volume, updated per 50 Hz tick like a tracker volume column
        let v = envDef.level * (ev.v || 1) * (envDef.sus + (1 - envDef.sus) * Math.exp(-k / envDef.decay));
        const gateK = Math.floor((ev.e - ev.s) / TICK);
        if (k >= gateK) v *= Math.max(0, 1 - (k - gateK) / (envDef.rel || 2));
        const vol = Math.round(LO.clamp(v, 0, 1) * 64);
        const idx = Math.floor(pos);
        let s;
        if (loop) s = smp[idx % smp.length];
        else s = idx < smp.length ? smp[idx] : 0;
        out[i] = s * vol / 8192;
        pos += (PAL / period) / LO.SR;
      }
      prevM = ev.m;
    }
    return out;
  }

  const chip = {
    id: 'AMIGA', name: 'AMIGA', full: 'PAULA 8364', year: 1985, tier: '16-BIT', voices: 4, rate: '28.8 KHZ MAX', bits: '8-BIT',
    blurb: ['4 SAMPLE CHANNELS, 8-BIT', 'HARD STEREO: 1+4 LEFT, 2+3 RIGHT', 'CHORDS VIA TRACKER ARPEGGIO'],
    channelsDef: [
      { name: 'CH1 L', role: 'DRUMS', vol: true }, { name: 'CH2 R', role: 'BASS', vol: true },
      { name: 'CH3 R', role: 'LEAD', vol: true }, { name: 'CH4 L', role: 'CHORDS', vol: true },
    ],
    fxSchema: [
      { id: 'model', label: 'MODEL', type: 'select', options: ['A500', 'A1200'], level: 'mix' },
      { id: 'led', label: 'LED FILTER', type: 'toggle', level: 'mix', note: 'THE POWER-LIGHT FILTER' },
    ],
    defaultFx() { return { model: 'A500', led: false }; },
    render(song, fx) {
      const T = LO.timing(song); const total = T.total; const P = song.parts;
      const bank = makeBank(song);
      const drums = P.drums.map(d => ({ ...d, s: T.s(d.t), e: T.s(d.t) + 4000 })).sort((a, b) => a.s - b.s);
      for (let i = 0; i < drums.length - 1; i++) drums[i].e = Math.min(drums[i].e, drums[i + 1].s); // channel stealing
      const bass = LO.toMono(P.bass, T);
      const lead = LO.toMono(P.lead, T);
      const c4 = P.counter.slice();
      for (const c of P.chords) {
        if (c.sec === 'intro' && !song.meta.arp && song.meta.padTimbre === 'none') continue;
        if (P.counter.some(n => n.t < c.t + c.d && n.t + n.d > c.t)) continue;
        c4.push({ t: c.t, d: c.d, m: c.tones[0] + 12, v: 0.75, arp: c.tones.slice(0, 3).map(x => x - c.tones[0]) });
      }
      const chords = LO.toMono(c4, T);
      const raw = [
        renderChannel(drums, total, bank, 'drum', { level: 1, sus: 1, decay: 99, rel: 1 }),
        renderChannel(bass, total, bank, 'bass', { level: 0.95, sus: 0.75, decay: 8, rel: 2 }),
        renderChannel(lead, total, bank, 'lead', { level: 0.85, sus: 0.7, decay: 12, rel: 3, vib: 0.15 }),
        renderChannel(chords, total, bank, 'chord', { level: 0.55, sus: 0.6, decay: 14, rel: 3 }),
      ];
      const bytes = Object.values(bank.drums).reduce((a, s) => a + s.length, 0) + 3 * (64 + 32 + 16);
      return { raw, events: [drums, bass, lead, chords], total, budget: { used: bytes, limit: 512 * 1024, label: 'CHIP RAM' } };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total; const L = new Float32Array(n), Rr = new Float32Array(n);
      const g = chState.map((c, i) => (onlyChannel != null ? (i === onlyChannel ? 1 : 0) : (LO.audible(chState, i) ? 1 : 0)) * Math.round((c.vol == null ? 1 : c.vol) * 64) / 64);
      const [c1, c2, c3, c4] = R.raw;
      const a500 = fx.model !== 'A1200';
      const rcL = new LO.OnePole('lp', a500 ? 4900 : 15000), rcR = new LO.OnePole('lp', a500 ? 4900 : 15000);
      const ledL = new LO.Biquad('lp', 3275, 0.7071), ledR = new LO.Biquad('lp', 3275, 0.7071);
      for (let i = 0; i < n; i++) {
        let l = (c1[i] * g[0] + c4[i] * g[3]) * 0.5, r = (c2[i] * g[1] + c3[i] * g[2]) * 0.5;
        l = rcL.run(l); r = rcR.run(r);
        if (fx.led) { l = ledL.run(l); r = ledR.run(r); }
        L[i] = l; Rr[i] = r;
      }
      return { L, R: Rr };
    },
  };
  LO.CHIPS.AMIGA = chip;
})(typeof self !== 'undefined' ? self : globalThis);
