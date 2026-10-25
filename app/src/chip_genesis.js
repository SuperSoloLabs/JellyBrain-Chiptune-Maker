/* LowOrbit Chip Studio - SEGA GENESIS / MEGA DRIVE profile: YM2612 (OPN2) + SN76489 PSG
   6 FM channels (4 operators each, 8 algorithms); channel 6 can be switched to an 8-bit DAC for drum samples;
   PSG adds 3 squares and a noise channel; FM channels pan hard left / right / center. (SOLID)
   The built-in 9-bit DAC distorts quiet signals: the "ladder effect" (SOLID that it exists, ESTIMATED size).
   Output filtering differs by console model (ESTIMATED corner frequencies). */
(function (G) {
  const LO = G.LO, SR = LO.SR;
  const LEAD_PREF = { pulse: ['HOLLOW LEAD', 'SYNTH LEAD'], saw: ['SYNTH LEAD', 'FM BRASS'], sax: ['FM BRASS', 'HOLLOW LEAD'], bell: ['BELL', 'E.PIANO'], brass: ['FM BRASS'] };
  const PAD_PREF = { strings: ['STRINGS', 'SOFT PAD'], rhodes: ['E.PIANO'], saw: ['SOFT PAD', 'STRINGS', 'ORGAN'], none: ['SOFT PAD'] };
  const roleList = r => Object.keys(LO.FM_PATCHES).filter(k => LO.FM_PATCHES[k].role.includes(r));
  const ladder = (y, on) => { if (!on || Math.abs(y) < 1e-4) return Math.round(y * 255) / 255; const q = Math.round(y * 255); return (q + (y >= 0 ? 0.55 : -0.55)) / 255; };

  function picks(song) {
    const R = LO.rng((song.seed >>> 0) ^ 0x2612), M = song.meta, bs = String(M.vector && M.vector.bassStyle);
    return {
      lead: LO.pickPatch(R, 'lead', LEAD_PREF[M.leadTimbre]),
      counter: LO.pickPatch(R, 'counter', ['E.PIANO', 'BELL', 'FM BRASS']),
      arp: LO.pickPatch(R, 'arp', ['BELL', 'PLUCK', 'MARIMBA']),
      pad: LO.pickPatch(R, 'pad', PAD_PREF[M.padTimbre] || ['SOFT PAD']),
      bass: ['acid', 'reese', 'sub', 'rolling'].includes(bs) ? R.pick(['GROWL BASS', 'SUB BASS']) : ['funk', 'walk', 'deephouse', 'electro'].includes(bs) ? 'SLAP BASS' : R.pick(['FM BASS', 'SLAP BASS', 'GROWL BASS']),
    };
  }

  const chip = {
    id: 'GENESIS', name: 'GENESIS', full: 'YAMAHA YM2612 + SN76489', year: 1988, tier: '16-BIT', voices: 10, rate: 'FM 53 KHZ', bits: '9-BIT DAC',
    blurb: ['6 FM VOICES, 4 OPERATORS EACH', 'CH 6 BECOMES AN 8-BIT DRUM DAC', 'PSG: 3 SQUARES + NOISE'],
    channelsDef: [
      { name: 'FM 1', role: 'LEAD', vol: true }, { name: 'FM 2', role: 'COUNTER', vol: true }, { name: 'FM 3', role: 'ARP', vol: true },
      { name: 'FM 4', role: 'PAD', vol: true }, { name: 'FM 5', role: 'BASS', vol: true }, { name: 'DAC', role: 'DRUMS', vol: true },
      { name: 'PSG 1', role: 'CHORD', vol: true }, { name: 'PSG 2', role: 'CHORD', vol: true }, { name: 'PSG 3', role: 'ECHO', vol: true }, { name: 'NOISE', role: 'HATS', vol: true },
    ],
    fxSchema: [
      { id: 'model', label: 'MODEL', type: 'select', options: ['MODEL 1', 'MODEL 2'], level: 'mix', note: 'MODEL 1 IS WARMER' },
      { id: 'ladder', label: 'LADDER EFFECT', type: 'toggle', level: 'mix', note: 'THE REAL 9-BIT DAC GRIT' },
      { id: 'leadPatch', label: 'LEAD', type: 'select', options: roleList('lead'), level: 'render' },
      { id: 'bassPatch', label: 'BASS', type: 'select', options: roleList('bass'), level: 'render' },
      { id: 'psgEcho', label: 'PSG ECHO', type: 'toggle', level: 'render', note: 'PSG 3 ECHOES THE LEAD' },
    ],
    defaultFx(song) { const p = picks(song); return { model: 'MODEL 1', ladder: true, leadPatch: p.lead, bassPatch: p.bass, psgEcho: song.meta.bpm < 125 }; },
    render(song, fx) {
      const T = LO.timing(song), total = T.total, P = song.parts, M = song.meta, pk = picks(song);
      const R = LO.rng((song.seed >>> 0) ^ 0x1988);
      const patch = n => LO.FM_PATCHES[n] || LO.FM_PATCHES['SYNTH LEAD'];
      const lead = LO.toMono(P.lead, T), counter = LO.toMono(P.counter, T), bass = LO.toMono(P.bass, T);
      // FM 3: the arp part, or the classic fast chord arpeggio
      let arpSrc = (P.arp || []).slice();
      if (!arpSrc.length && M.arp) for (const c of P.chords) { if (c.sec === 'outro') continue; const up = c.tones.slice(0, 3).map(x => x + 24); for (let k = 0; k < 16; k++) arpSrc.push({ t: c.t + k / 4, d: 0.22, m: up[k % 3] + (k % 6 >= 3 ? 12 : 0), v: 0.8 }); }
      const arp = LO.toMono(arpSrc, T);
      const padV = [[], [], []];
      for (const c of P.chords) { if (M.padTimbre === 'none' && c.sec !== 'break') continue; for (let j = 0; j < 3; j++) padV[j].push({ t: c.t, d: c.d - 0.05, m: c.tones[j] + 12, v: 0.85 }); }
      const pad = LO.toMono(padV[0], T), ps1 = LO.toMono(padV[1], T), ps2 = LO.toMono(padV[2], T);
      const echo = fx.psgEcho ? LO.toMono(P.lead.map(n => ({ ...n, t: n.t + 0.75, v: (n.v || 1) * 0.5, slide: false })), T) : [];
      const dacKinds = ['kick', 'snare', 'clap', 'tom', 'timp'];
      const dacHits = P.drums.filter(d => dacKinds.includes(d.kind)).map(d => ({ ...d, s: T.s(d.t) })).sort((a, b) => a.s - b.s);
      const noiseHits = P.drums.filter(d => !dacKinds.includes(d.kind)).map(d => ({ ...d, s: T.s(d.t) })).sort((a, b) => a.s - b.s);
      // 8-bit DAC drum samples at 13 kHz, played back with zero-order hold (the gritty Genesis drum sound)
      const DR = 13000, bank = {};
      for (const k of dacKinds) {
        const src = LO.drumSource(k, DR, R, k === 'tom' ? 47 : k === 'timp' ? 40 : undefined);
        const q = new Float32Array(Math.floor(src.length * SR / DR));
        for (let i = 0; i < q.length; i++) q[i] = Math.round(LO.clamp(src[Math.floor(i * DR / SR)], -1, 1) * 127) / 127;
        bank[k] = q;
      }
      const isSlow = M.bpm < 110;
      const raw = [
        LO.fmVoice(lead, total, patch(fx.leadPatch || pk.lead), { vib: 0.006, vibDelay: 0.3 }),
        LO.fmVoice(counter, total, patch(pk.counter), { vib: 0.004 }),
        LO.fmVoice(arp, total, patch(pk.arp)),
        LO.fmVoice(pad, total, patch(pk.pad), { vib: isSlow ? 0.003 : 0 }),
        LO.fmVoice(bass, total, patch(fx.bassPatch || pk.bass)),
        LO.sampleHits(dacHits, total, bank, 0.9),
        LO.psgVoice(ps1, total, { sus: 0.7, decay: 20, rel: 4 }),
        LO.psgVoice(ps2, total, { sus: 0.7, decay: 20, rel: 4 }),
        LO.psgVoice(echo, total, { sus: 0.5, decay: 10, rel: 3 }),
        LO.psgNoise(noiseHits, total, {}),
      ];
      const ev = h => h.map(x => ({ s: x.s, e: x.s + 2500, m: 0 }));
      return { raw, events: [lead, counter, arp, pad, bass, ev(dacHits), ps1, ps2, echo, ev(noiseHits)], total, budget: null, patches: { lead: fx.leadPatch || pk.lead, counter: pk.counter, arp: pk.arp, pad: pk.pad, bass: fx.bassPatch || pk.bass } };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total, L = new Float32Array(n), Rr = new Float32Array(n);
      const LEV = [0.5, 0.32, 0.26, 0.24, 0.6, 0.55, 0.07, 0.07, 0.07, 0.11];
      const PAN = [0, -1, 1, 0, 0, 0, 0, 0, 0, 0]; // FM channels are hard left / right / both on the real chip
      const fm = [0, 1, 2, 3, 4];
      for (let c = 0; c < R.raw.length; c++) {
        const on = onlyChannel != null ? c === onlyChannel : LO.audible(chState, c); if (!on) continue;
        const g = LEV[c] * (chState[c].vol == null ? 1 : chState[c].vol), src = R.raw[c], gl = PAN[c] <= 0 ? g : 0, gr = PAN[c] >= 0 ? g : 0, isFm = fm.includes(c) || c === 5;
        for (let i = 0; i < n; i++) { let x = src[i]; if (!x) continue; if (isFm) x = ladder(x, fx.ladder); L[i] += x * gl; Rr[i] += x * gr; }
      }
      const fc = fx.model === 'MODEL 2' ? 8000 : 3400;
      const fl = new LO.OnePole('lp', fc), fr = new LO.OnePole('lp', fc), hl = new LO.OnePole('hp', 20), hr = new LO.OnePole('hp', 20);
      for (let i = 0; i < n; i++) { L[i] = hl.run(fl.run(L[i])); Rr[i] = hr.run(fr.run(Rr[i])); }
      return { L, R: Rr };
    },
  };
  LO.CHIPS.GENESIS = chip;
})(typeof self !== 'undefined' ? self : globalThis);
