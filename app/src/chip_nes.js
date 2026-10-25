/* LowOrbit Chip Studio - NES Ricoh 2A03 profile (hardware-true limits)
   2 pulse (4 duty settings, 4-bit volume), triangle (no volume control), noise (LFSR), DPCM (1-bit delta).
   Timers, the 60 Hz driver frame rate and the nonlinear output mixer follow the documented hardware. */
(function (G) {
  const LO = G.LO;
  const CPU = 1789773;
  const DUTY = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
  const TRI = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
  const DMC_RATE = 33143.9;
  const FRAME = LO.SR / 60;
  const DUTY_NAMES = ['12.5%', '25%', '50%', '75%'];

  function framesEnv(k, kGate, peak, sus, decayF, relF, att, trem) {
    let v = peak * (sus + (1 - sus) * Math.exp(-k / decayF));
    if (att && k < att) v *= (k + 1) / (att + 1);                       // swell: the driver raises the volume frame by frame
    if (trem && k > 8) v *= 1 - trem * (0.5 + 0.5 * Math.sin(2 * Math.PI * k / 7.5)); // tremolo in volume steps
    if (kGate != null && k >= kGate) v *= Math.max(0, 1 - (k - kGate) / relF);
    return Math.round(LO.clamp(v, 0, 15));
  }

  function renderPulse(events, total, duty, inst) {
    const out = new Float32Array(total);
    const cyc = CPU / LO.SR / 8;
    let phase = 0, prevM = null;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e]; const end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(FRAME * inst.rel));
      const gateK = Math.floor((ev.e - ev.s) / FRAME);
      const seq = DUTY[ev.duty != null ? ev.duty : duty];
      for (let i = ev.s; i < end; i++) {
        const k = Math.floor((i - ev.s) / FRAME);
        const vol = framesEnv(k, gateK, 15 * (ev.v || 1) * inst.level, inst.sus, inst.decay, inst.rel, inst.att, inst.trem);
        let m = ev.m;
        if (ev.arp) m += ev.arp[Math.floor(k / (inst.arpRate || 1)) % ev.arp.length];
        if (ev.slide && prevM != null && k < 6) m = prevM + (ev.m - prevM) * (k / 6);
        if (k > (inst.vibDelay || 14) && inst.vib) m += inst.vib * Math.sin(2 * Math.PI * k / 10);
        const f = LO.m2f(m); const t = Math.round(CPU / (16 * f) - 1);
        if (t < 8 || t > 2047 || vol === 0) { out[i] = 0; continue; }
        const stepLen = 2 * (t + 1); let acc = 0;
        for (let s = 0; s < 8; s++) { phase += cyc; acc += seq[Math.floor(phase / stepLen) & 7]; }
        if (phase > stepLen * 8 * 1e6) phase %= stepLen * 8;
        out[i] = acc / 8 * vol;
      }
      prevM = ev.m;
    }
    return out;
  }

  function renderTriangle(events, total) {
    const out = new Float32Array(total);
    const cyc = CPU / LO.SR / 8; let phase = 0, last = 0, prevM = null;
    let ei = 0;
    for (let i = 0; i < total; i++) {
      while (ei < events.length && events[ei].e <= i) { prevM = events[ei].m; ei++; }
      const ev = events[ei];
      if (ev && i >= ev.s && i < ev.e) {
        const k = Math.floor((i - ev.s) / FRAME);
        let m = ev.m; if (ev.drop) m = ev.m + 26 * Math.max(0, 1 - k / 3); else if (ev.slide && prevM != null && k < 4) m = prevM + (ev.m - prevM) * (k / 4);
        const t = Math.round(CPU / (32 * LO.m2f(m)) - 1);
        if (t >= 2) {
          const stepLen = t + 1; let acc = 0;
          for (let s = 0; s < 8; s++) { phase += cyc; acc += TRI[Math.floor(phase / stepLen) & 31]; }
          if (phase > stepLen * 32 * 1e6) phase %= stepLen * 32;
          last = acc / 8;
        }
      }
      out[i] = last;  // the real triangle holds its level when stopped
    }
    return out;
  }

  const NOISE_METAL = { hat: { p: 1, f: 3, mode: 1 }, ohat: { p: 2, f: 10, mode: 1 } };
  const NOISE_INST = {
    hat: { p: 1, f: 3, mode: 0 }, ohat: { p: 2, f: 10, mode: 0 }, snare: { p: 6, f: 9, mode: 0 },
    clap: { p: 5, f: 8, mode: 0 }, rim: { p: 3, f: 3, mode: 1 }, crash: { p: 3, f: 40, mode: 0 },
  };
  function renderNoise(hits, total, metal) {
    const out = new Float32Array(total);
    let lfsr = 1, acc = 0, hi = 0;
    for (let h = 0; h < hits.length; h++) {
      const ht = hits[h]; const ins = (metal && NOISE_METAL[ht.kind]) || NOISE_INST[ht.kind] || NOISE_INST.snare;
      const end = Math.min(total, h + 1 < hits.length ? hits[h + 1].s : ht.s + Math.round(FRAME * (ins.f + 2)));
      const period = NOISE_PERIOD[ins.p]; const cyc = CPU / LO.SR;
      for (let i = ht.s; i < end; i++) {
        const k = Math.floor((i - ht.s) / FRAME);
        const vol = Math.round(LO.clamp(15 * (ht.v || 1) * Math.max(0, 1 - k / ins.f), 0, 15));
        acc += cyc;
        while (acc >= period) {
          acc -= period;
          const fb = (lfsr & 1) ^ ((lfsr >> (ins.mode ? 6 : 1)) & 1);
          lfsr = (lfsr >> 1) | (fb << 14);
        }
        out[i] = (lfsr & 1) ? 0 : vol;
      }
      hi = end;
    }
    return out;
  }

  // 1-bit delta encoder: how real NES games squeezed drum samples into ROM
  function dpcmEncode(src, srcRate) {
    const n = Math.floor(src.length * DMC_RATE / srcRate); const bits = new Uint8Array(n);
    let c = 64;
    for (let i = 0; i < n; i++) {
      const target = 64 + src[Math.min(src.length - 1, Math.floor(i * srcRate / DMC_RATE))] * 52;
      if (target > c) { bits[i] = 1; if (c <= 125) c += 2; } else { bits[i] = 0; if (c >= 2) c -= 2; }
    }
    return bits;
  }
  function renderDMC(hits, total, bank) {
    const out = new Float32Array(total); let c = 64; let hi = 0;
    for (let i = 0; i < total; i++) out[i] = 64;
    for (let h = 0; h < hits.length; h++) {
      const ht = hits[h]; const bits = bank[ht.kind] || bank.kick;
      const end = Math.min(total, h + 1 < hits.length ? hits[h + 1].s : total);
      let pos = 0; const step = DMC_RATE / LO.SR;
      for (let i = ht.s; i < end; i++) {
        const b0 = Math.floor(pos), b1 = Math.floor(pos + step);
        for (let b = b0; b < b1 && b < bits.length; b++) {
          if (bits[b]) { if (c <= 125) c += 2; } else { if (c >= 2) c -= 2; }
        }
        pos += step; out[i] = c;
      }
      hi = end;
    }
    return out;
  }

  const chip = {
    id: 'NES', name: 'NES', full: 'RICOH 2A03', year: 1983, tier: '8-BIT', voices: 5, rate: 'APU 1.79 MHZ', bits: '4-BIT VOL',
    blurb: ['2 PULSE / TRIANGLE / NOISE / DPCM', 'MONO OUTPUT, NONLINEAR MIXER', 'NO ECHO: USE THE ECHO-CHANNEL TRICK'],
    channelsDef: [
      { name: 'PULSE 1', role: 'LEAD', vol: true }, { name: 'PULSE 2', role: 'HARMONY', vol: true },
      { name: 'TRIANGLE', role: 'BASS', vol: false, note: 'NO VOLUME ON REAL HW' },
      { name: 'NOISE', role: 'DRUMS', vol: true }, { name: 'DPCM', role: 'KICK', vol: false, note: 'NO VOLUME ON REAL HW' },
    ],
    fxSchema: [
      { id: 'console', label: 'CONSOLE', type: 'select', options: ['NES', 'FAMICOM'], level: 'mix' },
      { id: 'duty1', label: 'P1 DUTY', type: 'select', options: DUTY_NAMES, level: 'render' },
      { id: 'duty2', label: 'P2 DUTY', type: 'select', options: DUTY_NAMES, level: 'render' },
      { id: 'echoTrick', label: 'ECHO TRICK', type: 'toggle', level: 'render', note: 'PULSE 2 ECHOES THE LEAD' },
      { id: 'leadEnv', label: 'LEAD SHAPE', type: 'select', options: ['PLUCK', 'SUSTAIN', 'SWELL', 'TREMOLO'], level: 'render' },
      { id: 'dutySwitch', label: 'DUTY SWITCH', type: 'toggle', level: 'render', note: 'NEW PULSE WIDTH IN PART B' },
      { id: 'triKick', label: 'TRIANGLE KICK', type: 'toggle', level: 'render', note: 'KICK FROM A TRIANGLE PITCH DROP' },
      { id: 'metal', label: 'METAL HATS', type: 'toggle', level: 'render', note: 'PERIODIC NOISE MODE' },
    ],
    defaultFx(song) {
      // every song gets its own NES instrument set; the same song always gets the same one
      const R = LO.rng((song.seed >>> 0) ^ 0x4E35), lt = song.meta.leadTimbre, slow = song.meta.bpm < 105;
      const d1 = lt === 'saw' || lt === 'brass' ? R.pick(['25%', '25%', '12.5%']) : lt === 'sax' || lt === 'bell' ? R.pick(['50%', '50%', '25%']) : R.pick(['25%', '12.5%', '50%']);
      const sparse = song.parts.counter.length < song.bars.length;
      return { console: 'NES', duty1: d1, duty2: R.pick(['12.5%', '12.5%', '25%', '50%']), echoTrick: sparse && R.chance(slow ? 0.45 : 0.25),
        leadEnv: lt === 'bell' ? 'PLUCK' : slow ? R.pick(['SUSTAIN', 'SWELL', 'TREMOLO', 'PLUCK']) : R.pick(['SUSTAIN', 'PLUCK', 'SUSTAIN', 'TREMOLO']),
        dutySwitch: R.chance(0.5), triKick: R.chance(0.35), metal: R.chance(0.3) };
    },
    render(song, fx) {
      const T = LO.timing(song); const total = T.total; const P = song.parts;
      const R = LO.rng(song.seed ^ 0x2A03);
      const ENV = { PLUCK: { sus: 0.25, decay: 5, rel: 2 }, SUSTAIN: { sus: 0.7, decay: 14, rel: 4 }, SWELL: { sus: 0.85, decay: 30, rel: 6, att: 6 }, TREMOLO: { sus: 0.65, decay: 12, rel: 4, trem: 0.35 } }[fx.leadEnv || 'SUSTAIN'];
      const inst1 = { level: 0.85, vib: R.pick([0.12, 0.18, 0.25]), vibDelay: R.pick([8, 14, 20]), ...ENV };
      const inst2 = { level: 0.6, sus: 0.45, decay: 6, rel: 3, vib: 0.1, arpRate: R.pick([1, 1, 2]) };
      const di = n => DUTY_NAMES.indexOf(n) < 0 ? 1 : DUTY_NAMES.indexOf(n);
      const altDuty = [1, 2, 0, 1][di(fx.duty1)];
      const lead = LO.toMono(P.lead.map(n => fx.dutySwitch && n.sec === 'B' ? { ...n, duty: altDuty } : n), T);
      // pulse 2: echo trick, counter-melody, or fast chord arpeggio (the classic NES chord trick)
      let p2src;
      if (fx.echoTrick) p2src = P.lead.map(n => ({ ...n, t: n.t + 0.75, v: (n.v || 1) * 0.55 }));
      else {
        p2src = P.counter.slice();
        if (song.meta.arp || !P.counter.length) {
          for (const c of P.chords) {
            if (c.sec === 'intro' && !song.meta.arp) continue;
            const busy = P.counter.some(n => n.t < c.t + c.d && n.t + n.d > c.t);
            if (busy) continue;
            const root = c.tones[0] + 12; const offs = c.tones.slice(0, 3).map(x => x - c.tones[0]);
            p2src.push({ t: c.t, d: c.d, m: root, v: 0.7, arp: offs });
          }
        }
      }
      const p2 = LO.toMono(p2src, T);
      let bassSrc = P.bass.map(n => ({ ...n, m: n.m + (n.m < 40 ? 12 : 0) }));
      if (fx.triKick) { // the triangle doubles as the kick: a quick pitch drop, then the bass line carries on
        const kicks = P.drums.filter(d => d.kind === 'kick').map(d => d.t), cut = [];
        for (const n of bassSrc) {
          let segs = [[n.t, n.t + n.d]];
          for (const kt of kicks) segs = segs.flatMap(([a, b]) => kt >= b || kt + 0.14 <= a ? [[a, b]] : [[a, kt], [kt + 0.14, b]].filter(([x, y]) => y - x > 0.05));
          for (const [a, b] of segs) cut.push({ ...n, t: a, d: b - a, slide: a === n.t ? n.slide : false });
        }
        bassSrc = cut.concat(kicks.map(kt => ({ t: kt, d: 0.12, m: 36, v: 1, drop: true })));
      }
      const bass = LO.toMono(bassSrc, T);
      const dmcKinds = fx.triKick ? ['timp', 'tom'] : ['kick', 'timp', 'tom'];
      const noiseHits = P.drums.filter(d => !['kick', 'timp', 'tom'].includes(d.kind)).map(d => ({ ...d, s: T.s(d.t) })).sort((a, b) => a.s - b.s);
      const dmcHits = P.drums.filter(d => dmcKinds.includes(d.kind)).map(d => ({ ...d, s: T.s(d.t) })).sort((a, b) => a.s - b.s);
      const bank = {
        kick: dpcmEncode(LO.drumSource('kick', 16000, R), 16000),
        timp: dpcmEncode(LO.drumSource('timp', 16000, R, 40), 16000),
        tom: dpcmEncode(LO.drumSource('tom', 16000, R, 45), 16000),
      };
      const raw = [
        renderPulse(lead, total, di(fx.duty1), inst1),
        renderPulse(p2, total, di(fx.duty2), inst2),
        renderTriangle(bass, total),
        renderNoise(noiseHits, total, fx.metal),
        renderDMC(dmcHits, total, bank),
      ];
      const events = [lead, p2, bass, noiseHits.map(h => ({ s: h.s, e: h.s + 2000, m: 0 })), dmcHits.map(h => ({ s: h.s, e: h.s + 3000, m: 0 }))];
      return { raw, events, total, budget: null };
    },
    mix(song, R, fx, chState, onlyChannel) {
      const n = R.total; const L = new Float32Array(n);
      const g = chState.map((c, i) => (onlyChannel != null ? (i === onlyChannel ? 1 : 0) : (LO.audible(chState, i) ? 1 : 0)));
      const vol = chState.map(c => c.vol == null ? 1 : c.vol);
      const [p1, p2, tr, no, dm] = R.raw;
      const fam = fx.console === 'FAMICOM';
      const f1 = new LO.OnePole('hp', fam ? 37 : 90), f2 = new LO.OnePole('hp', fam ? 37 : 440), f3 = new LO.OnePole('lp', 14000);
      const q = (x, k) => Math.round(x * vol[k]);
      for (let i = 0; i < n; i++) {
        const a = g[0] ? q(p1[i], 0) : 0, b = g[1] ? q(p2[i], 1) : 0;
        const t = g[2] ? tr[i] : 0, no4 = g[3] ? q(no[i], 3) : 0, d = g[4] ? dm[i] : 0;
        const ps = a + b; const pulse = ps > 0 ? 95.88 / (8128 / ps + 100) : 0;
        const tn = t / 8227 + no4 / 12241 + d / 22638; const tnd = tn > 0 ? 159.79 / (1 / tn + 100) : 0;
        let y = f1.run(pulse + tnd); y = f2.run(y); y = f3.run(y);
        L[i] = y * 1.6;
      }
      return { L, R: L.slice() };
    },
  };
  LO.CHIPS.NES = chip;
})(typeof self !== 'undefined' ? self : globalThis);
