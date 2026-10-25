/* LowOrbit Chip Studio - ROLAND LA profile (MT-32 class, 1987)
   Linear Arithmetic synthesis: short sampled attacks joined to synthesized sustains (SOLID), up to 32 partials,
   8 melodic parts plus a rhythm part (SOLID), 32 kHz output (SOLID), built-in digital reverb (SOLID that it exists;
   our room / hall / plate / tap delay voicings are ESTIMATED), first-generation units lose one DAC bit (15-bit, SOLID).
   Every attack "sample" here is generated from math at note-on (breath, bow, hammer, brass blat, pluck, mallet). */
(function (G) {
  const LO = G.LO, SR = LO.SR;
  const P_ = (o) => o;
  LO.LA_PATCHES = {
    'LA STRINGS':  P_({ wave: 'saw', detune: 7, cutoff: 2200, res: 0.15, kf: 0.5, fenv: [0.3, 0.6, 0.7, 0.5], aenv: [0.25, 0.3, 0.9, 0.45], pcm: 'bow', pcmL: 0.3, vib: 0.004, role: ['pad', 'counter'] }),
    'LA BRASS':    P_({ wave: 'saw', detune: 4, cutoff: 900, res: 0.25, kf: 0.6, fenv: [0.08, 0.25, 0.55, 2.2], aenv: [0.03, 0.2, 0.85, 0.2], pcm: 'blat', pcmL: 0.5, vib: 0.005, role: ['lead', 'counter', 'pad'] }),
    'LA PIANO':    P_({ wave: 'square', pw: 0.35, cutoff: 2600, res: 0.05, kf: 0.8, fenv: [0, 1.2, 0.15, 1.0], aenv: [0, 2.5, 0, 0.3], pcm: 'hammer', pcmL: 0.7, role: ['pad', 'counter', 'arp'] }),
    'LA CHOIR':    P_({ wave: 'square', pw: 0.5, detune: 9, cutoff: 1400, res: 0.3, kf: 0.4, fenv: [0.3, 0.5, 0.8, 0.3], aenv: [0.35, 0.4, 0.9, 0.6], pcm: 'breath', pcmL: 0.3, vib: 0.006, role: ['pad'] }),
    'LA FLUTE':    P_({ wave: 'square', pw: 0.5, cutoff: 1800, res: 0.1, kf: 0.7, fenv: [0.05, 0.3, 0.8, 0.4], aenv: [0.06, 0.2, 0.85, 0.2], pcm: 'breath', pcmL: 0.45, vib: 0.007, role: ['lead', 'counter'] }),
    'FANTASY PAD': P_({ wave: 'saw', detune: 6, cutoff: 1600, res: 0.2, kf: 0.5, fenv: [0.6, 1.0, 0.7, 0.4], aenv: [0.5, 0.6, 0.85, 0.8], pcm: 'mallet', pcmL: 0.6, role: ['pad'] }),
    'LA BASS':     P_({ wave: 'saw', cutoff: 600, res: 0.35, kf: 0.3, fenv: [0, 0.25, 0.2, 2.0], aenv: [0, 0.6, 0.6, 0.12], pcm: 'pluck', pcmL: 0.6, role: ['bass'] }),
    'SLAP BASS':   P_({ wave: 'square', pw: 0.3, cutoff: 900, res: 0.3, kf: 0.4, fenv: [0, 0.15, 0.25, 2.5], aenv: [0, 0.5, 0.45, 0.1], pcm: 'pluck', pcmL: 0.85, role: ['bass'] }),
    'SYNTH LEAD':  P_({ wave: 'saw', detune: 5, cutoff: 2600, res: 0.45, kf: 0.6, fenv: [0.01, 0.4, 0.6, 0.8], aenv: [0.01, 0.3, 0.9, 0.2], pcm: null, vib: 0.006, role: ['lead', 'counter'] }),
    'LA BELLS':    P_({ wave: 'square', pw: 0.5, cutoff: 4000, res: 0.05, kf: 0.9, fenv: [0, 1.5, 0.2, 0.5], aenv: [0, 1.5, 0, 0.4], pcm: 'mallet', pcmL: 0.9, role: ['arp', 'counter'] }),
    'MARIMBA':     P_({ wave: 'square', pw: 0.5, cutoff: 900, res: 0.05, kf: 0.9, fenv: [0, 0.3, 0, 0.3], aenv: [0, 0.4, 0, 0.12], pcm: 'mallet', pcmL: 1.0, role: ['arp', 'counter'] }),
  };
  const roleList = r => Object.keys(LO.LA_PATCHES).filter(k => LO.LA_PATCHES[k].role.includes(r));

  // the PCM attack partials, generated from math for the note being played
  function pcmAttack(kind, m, R) {
    const f = LO.m2f(m), n = Math.round(SR * ({ breath: 0.09, bow: 0.12, hammer: 0.08, blat: 0.09, pluck: 0.06, mallet: 0.25 }[kind] || 0.08)), x = new Float32Array(n);
    if (kind === 'breath' || kind === 'bow') {
      const bp = new LO.Biquad('bp', Math.min(8000, f * (kind === 'bow' ? 3 : 5)), 1.2);
      for (let i = 0; i < n; i++) { const t = i / n; x[i] = bp.run(R.random() * 2 - 1) * Math.sin(Math.PI * t) * 2.2; }
    } else if (kind === 'hammer') {
      for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.01 * t) + 0.3 * Math.sin(2 * Math.PI * f * 3.98 * t)) * Math.exp(-t * 40) + (R.random() * 2 - 1) * Math.exp(-t * 400) * 0.5; }
    } else if (kind === 'blat') {
      let ph = 0; const lp = new LO.Biquad('lp', 400, 1.2);
      for (let i = 0; i < n; i++) { const t = i / n; ph += f / SR; if (i % 32 === 0) { const z1 = lp.z1, z2 = lp.z2; lp.set('lp', 400 + 3600 * t, 1.2); lp.z1 = z1; lp.z2 = z2; } x[i] = lp.run(2 * (ph % 1) - 1) * Math.sin(Math.PI * t); }
    } else if (kind === 'pluck') { // a few cycles of a Karplus-Strong string
      const p = Math.max(2, Math.round(SR / f)), buf = new Float32Array(p); for (let i = 0; i < p; i++) buf[i] = R.random() * 2 - 1;
      for (let i = 0; i < n; i++) { const j = i % p, y = 0.5 * (buf[j] + buf[(j + 1) % p]) * 0.994; buf[j] = y; x[i] = y * (1 - i / n); }
    } else if (kind === 'mallet') {
      for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) + 0.45 * Math.sin(2 * Math.PI * f * 3.93 * t) * Math.exp(-t * 22) + 0.2 * Math.sin(2 * Math.PI * f * 9.6 * t) * Math.exp(-t * 45)); }
    }
    return x;
  }
  const env = (t, a, d, s, rel, tOff) => { // ADSR in seconds; tOff = time of note-off
    let v = t < a ? (a > 0 ? t / a : 1) : s + (1 - s) * Math.exp(-(t - a) / Math.max(0.01, d / 3));
    if (t > tOff) { const v0 = tOff < a ? (a > 0 ? tOff / a : 1) : s + (1 - s) * Math.exp(-(tOff - a) / Math.max(0.01, d / 3)); v = v0 * Math.exp(-(t - tOff) / Math.max(0.01, rel / 3)); }
    return v;
  };
  // one LA part (monophonic line): synth partial(s) through a resonant filter + the PCM attack
  function laVoice(events, total, pt, R) {
    const out = new Float32Array(total);
    let ph1 = 0, ph2 = 0, lo = 0, bd = 0;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e], end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(SR * (pt.aenv[3] + 0.05) * 1.6));
      const f = LO.m2f(ev.m), dt = Math.pow(2, (pt.detune || 0) / 1200), v = ev.v == null ? 1 : ev.v;
      const tOff = (ev.e - ev.s) / SR, base = pt.cutoff * Math.pow(f / 261.6, pt.kf);
      const att = pt.pcm ? pcmAttack(pt.pcm, ev.m, R) : null;
      for (let i = ev.s; i < end; i++) {
        const t = (i - ev.s) / SR;
        const vib = pt.vib && t > 0.3 ? 1 + pt.vib * Math.sin(2 * Math.PI * 5.5 * t) : 1;
        ph1 += f * vib / SR; ph2 += f * dt * vib / SR;
        let o = pt.wave === 'saw' ? (2 * (ph1 % 1) - 1) : ((ph1 % 1) < (pt.pw || 0.5) ? 1 : -1);
        if (pt.detune) o = 0.6 * o + 0.6 * (pt.wave === 'saw' ? (2 * (ph2 % 1) - 1) : ((ph2 % 1) < (pt.pw || 0.5) ? 1 : -1));
        const fe = env(t, pt.fenv[0], pt.fenv[1], pt.fenv[2], pt.aenv[3], tOff);
        const fc = LO.clamp(base * (1 + pt.fenv[3] * fe), 60, 6500), g = 2 * Math.sin(Math.PI * fc / SR), q = 1 - pt.res * 0.9;
        const hp = o - lo - q * bd; bd += g * hp; lo += g * bd;
        let y = lo * env(t, pt.aenv[0], pt.aenv[1], pt.aenv[2], pt.aenv[3], tOff) * 0.55;
        if (att && i - ev.s < att.length) y += att[i - ev.s] * pt.pcmL * 0.5;
        out[i] = y * v;
      }
    }
    return out;
  }
  function picks(song) {
    const R = LO.rng((song.seed >>> 0) ^ 0x3232), M = song.meta, bs = String(M.vector && M.vector.bassStyle);
    const pref = { pulse: ['SYNTH LEAD', 'LA FLUTE'], saw: ['SYNTH LEAD', 'LA BRASS'], sax: ['LA BRASS', 'LA FLUTE'], bell: ['LA FLUTE', 'SYNTH LEAD'], brass: ['LA BRASS'] }[M.leadTimbre] || ['SYNTH LEAD'];
    const padPref = { strings: ['LA STRINGS', 'LA CHOIR'], rhodes: ['LA PIANO', 'FANTASY PAD'], saw: ['FANTASY PAD', 'LA STRINGS', 'LA CHOIR'], none: ['LA STRINGS'] }[M.padTimbre] || ['LA STRINGS'];
    const pick = (role, p) => { const l = roleList(role), pp = p.filter(x => l.includes(x)); return pp.length && R.chance(0.75) ? R.pick(pp) : R.pick(l); };
    return { lead: pick('lead', pref), counter: pick('counter', ['LA BELLS', 'LA STRINGS', 'LA FLUTE']), pad: pick('pad', padPref), arp: pick('arp', ['LA BELLS', 'MARIMBA', 'LA PIANO']), bass: ['funk', 'walk', 'electro'].includes(bs) ? 'SLAP BASS' : pick('bass', ['LA BASS']) };
  }

  const chip = {
    id: 'ROLAND LA', name: 'ROLAND LA', full: 'ROLAND LA SYNTH (MT-32 CLASS)', year: 1987, tier: '16-BIT', voices: 32, rate: '32 KHZ', bits: '15-BIT DAC',
    blurb: ['SAMPLED ATTACKS + SYNTH SUSTAINS', '8 PARTS + RHYTHM, 32 PARTIALS', 'BUILT-IN DIGITAL REVERB'],
    channelsDef: [
      { name: 'PART 1', role: 'LEAD', vol: true }, { name: 'PART 2', role: 'COUNTER', vol: true }, { name: 'PART 3', role: 'PAD (3 NOTES)', vol: true },
      { name: 'PART 4', role: 'ARP', vol: true }, { name: 'PART 5', role: 'BASS', vol: true }, { name: 'RHYTHM', role: 'DRUMS', vol: true },
    ],
    fxSchema: [
      { id: 'reverb', label: 'REVERB', type: 'select', options: ['ROOM', 'HALL', 'PLATE', 'TAP DELAY'], level: 'mix' },
      { id: 'revLevel', label: 'REVERB LEVEL', type: 'slider', min: 0, max: 100, step: 5, level: 'mix' },
      { id: 'leadPatch', label: 'LEAD', type: 'select', options: roleList('lead'), level: 'render' },
      { id: 'padPatch', label: 'PAD', type: 'select', options: roleList('pad'), level: 'render' },
      { id: 'gen1', label: 'GEN 1 DAC', type: 'toggle', level: 'mix', note: 'FIRST UNITS: 15-BIT, A LITTLE GRAIN' },
    ],
    defaultFx(song) {
      const p = picks(song), M = song.meta, slow = M.bpm < 105;
      return { reverb: slow ? 'HALL' : M.bpm > 135 ? 'ROOM' : 'PLATE', revLevel: slow ? 40 : 28, leadPatch: p.lead, padPatch: p.pad, gen1: true };
    },
    render(song, fx) {
      const T = LO.timing(song), total = T.total, P = song.parts, M = song.meta, pk = picks(song);
      const R = LO.rng((song.seed >>> 0) ^ 0x1987);
      const pt = n => LO.LA_PATCHES[n] || LO.LA_PATCHES['SYNTH LEAD'];
      const lead = LO.toMono(P.lead, T), counter = LO.toMono(P.counter, T), bass = LO.toMono(P.bass, T);
      let arpSrc = (P.arp || []).slice();
      if (!arpSrc.length && M.arp) for (const c of P.chords) { if (c.sec === 'outro') continue; const up = c.tones.slice(0, 3).map(x => x + 24); for (let k = 0; k < 8; k++) arpSrc.push({ t: c.t + k / 2, d: 0.45, m: up[k % 3] + (k % 6 >= 3 ? 12 : 0), v: 0.75 }); }
      const arp = LO.toMono(arpSrc, T);
      const padV = [[], [], []];
      for (const c of P.chords) { if (M.padTimbre === 'none' && c.sec !== 'break') continue; for (let j = 0; j < 3; j++) padV[j].push({ t: c.t, d: c.d - 0.05, m: c.tones[j] + 12, v: 0.8 }); }
      const padP = pt(fx.padPatch || pk.pad);
      const padLines = padV.map(v => laVoice(LO.toMono(v, T), total, padP, R));
      const pad = new Float32Array(total); for (const l of padLines) for (let i = 0; i < total; i++) pad[i] += l[i] * 0.6;
      // rhythm part: sampled drums at 32 kHz, polyphonic (hits overlap like the real rhythm part)
      const bank = {}, rhy = new Float32Array(total);
      for (const d of P.drums) {
        const key = d.kind + (d.m || ''); if (!bank[key]) bank[key] = d.kind === 'riser' ? null : LO.drumSource(d.kind, SR, R, d.m);
        const s = bank[key]; if (!s) continue; const st = T.s(d.t), g = (d.v == null ? 1 : d.v) * 0.8;
        for (let k = 0; k < s.length && st + k < total; k++) rhy[st + k] += s[k] * g;
      }
      const raw = [laVoice(lead, total, pt(fx.leadPatch || pk.lead), R), laVoice(counter, total, pt(pk.counter), R), pad, laVoice(arp, total, pt(pk.arp), R), laVoice(bass, total, pt(pk.bass), R), rhy];
      const dh = P.drums.map(d => ({ s: T.s(d.t), e: T.s(d.t) + 2500, m: 0 })).sort((a, b) => a.s - b.s);
      return { raw, events: [lead, counter, LO.toMono(padV[0], T), arp, bass, dh], total, budget: null };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total, L = new Float32Array(n), Rr = new Float32Array(n), sL = new Float32Array(n), sR = new Float32Array(n);
      const LEV = [0.55, 0.38, 0.42, 0.32, 0.62, 0.6], PAN = [0.05, -0.45, 0, 0.45, 0, 0], SEND = [0.35, 0.4, 0.55, 0.4, 0.05, 0.25];
      for (let c = 0; c < R.raw.length; c++) {
        const on = onlyChannel != null ? c === onlyChannel : LO.audible(chState, c); if (!on) continue;
        const g = LEV[c] * (chState[c].vol == null ? 1 : chState[c].vol), gl = g * Math.cos((PAN[c] + 1) * Math.PI / 4) * 1.41, gr = g * Math.sin((PAN[c] + 1) * Math.PI / 4) * 1.41, src = R.raw[c], se = SEND[c];
        for (let i = 0; i < n; i++) { const x = src[i]; if (!x) continue; L[i] += x * gl; Rr[i] += x * gr; sL[i] += x * gl * se; sR[i] += x * gr * se; }
      }
      const lvl = (fx.revLevel == null ? 30 : fx.revLevel) / 100;
      if (lvl > 0) {
        let wL, wR;
        if (fx.reverb === 'TAP DELAY') [wL, wR] = LO.pingPong(sL, sR, Math.round(0.75 * 60 / song.meta.bpm * SR), 0.45, 4000);
        else { const sz = { ROOM: [0.3, 0.5], HALL: [0.78, 0.35], PLATE: [0.55, 0.15] }[fx.reverb] || [0.55, 0.3]; [wL, wR] = LO.reverb(sL, sR, sz[0], sz[1]); }
        for (let i = 0; i < n; i++) { L[i] += wL[i] * lvl * 1.4; Rr[i] += wR[i] * lvl * 1.4; }
      }
      const bits = fx.gen1 ? 15 : 16, q = Math.pow(2, bits - 1), R2 = LO.rng(7);
      for (let i = 0; i < n; i++) { const d = fx.gen1 ? (R2.random() - 0.5) / q : 0; L[i] = Math.round((L[i] * 0.5 + d) * q) / q * 2; Rr[i] = Math.round((Rr[i] * 0.5 + d) * q) / q * 2; }
      return { L, R: Rr };
    },
  };
  LO.CHIPS['ROLAND LA'] = chip;
})(typeof self !== 'undefined' ? self : globalThis);
