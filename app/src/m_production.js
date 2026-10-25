/* STUDIO MIND - PRODUCTION: what working engineers say to do, and never to do.
   Arrangement: don't start everything at once, leave room for the melody, keep parts out of each other's
   register, one owner for the low end, fade instead of chop. Master: no clipping and no waveshaping
   (transparent look-ahead limiter), bass kept mono, mud (200-500 Hz) and harshness (2-5 kHz) checked and
   only gently treated, loudness measured the broadcast way (ITU-R BS.1770 K-weighting with gating) and
   matched to one target so every song sits at the same level, limiter kept to a few dB so dynamics survive.
   Sources: Sound On Sound (5 biggest mixing mistakes), Waves (EQ mistakes), LANDR (muddy mixes),
   Audiokinetic (game loudness targets, -1 dBTP peak). */
(function (G) {
  const LO = G.LO, M = 'PRODUCTION';
  const TARGET_LUFS = -16, CEIL = 0.84; // -1.5 dBFS sample peak leaves room for inter-sample peaks (target -1 dBTP)

  // RBJ biquad with all the shapes we need
  class BQ {
    constructor(type, fc, q, gainDb, sr) {
      sr = sr || LO.SR; const A = Math.pow(10, (gainDb || 0) / 40), w = 2 * Math.PI * fc / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
      let b0, b1, b2, a0, a1, a2;
      if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
      else if (type === 'hshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
      else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; this.z1 = 0; this.z2 = 0;
    }
    run(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
  }

  // ITU-R BS.1770 integrated loudness (K-weighting, 400 ms blocks, 75% overlap, -70 LUFS and -10 LU gates)
  LO.lufs = function (L, R, sr) {
    sr = sr || LO.SR;
    const n = L.length, hop = Math.round(0.1 * sr), blk = hop * 4;
    if (n < blk) return -70;
    const f = [new BQ('hshelf', 1681.97, 0.7072, 4.0, sr), new BQ('hp', 38.135, 0.5003, 0, sr), new BQ('hshelf', 1681.97, 0.7072, 4.0, sr), new BQ('hp', 38.135, 0.5003, 0, sr)];
    const hops = Math.floor(n / hop), e = new Float64Array(hops);
    for (let h = 0; h < hops; h++) {
      let s = 0;
      for (let i = h * hop; i < (h + 1) * hop; i++) { const l = f[1].run(f[0].run(L[i])), r = f[3].run(f[2].run(R[i])); s += l * l + r * r; }
      e[h] = s;
    }
    const blocks = [];
    for (let h = 0; h + 4 <= hops; h++) { const z = (e[h] + e[h + 1] + e[h + 2] + e[h + 3]) / blk; blocks.push(z); }
    const toL = z => -0.691 + 10 * Math.log10(z + 1e-12);
    let g1 = blocks.filter(z => toL(z) > -70); if (!g1.length) return -70;
    const m1 = g1.reduce((a, b) => a + b, 0) / g1.length, rel = toL(m1) - 10;
    const g2 = g1.filter(z => toL(z) > rel); const m2 = g2.reduce((a, b) => a + b, 0) / Math.max(1, g2.length);
    return toL(m2);
  };

  // octave-band energy check for mud and harshness (relative to the mids around them)
  function bandDb(L, R, fc) {
    const f = new BQ('bp', fc, 1.4), g = new BQ('bp', fc, 1.4); let s = 0; const step = 2;
    for (let i = 0; i < L.length; i += step) { const a = f.run(L[i]), b = g.run(R[i]); s += a * a + b * b; }
    return 10 * Math.log10(s / (L.length / step) + 1e-12);
  }

  LO.Production = {
    TARGET_LUFS, CEIL,
    arrange(T, song, P) {
      const parts = song.parts, NB = song.bars.length, form = song.meta.form;
      const secAt = t => song.bars[Math.min(NB - 1, Math.max(0, Math.floor(t / 4)))].sec;
      // rule: don't start everything at once
      const introBars = song.sections[0] && song.sections[0].name === 'intro' ? song.sections[0].bars : 0;
      if (introBars) {
        const has = nm => (parts[nm] || []).some(n => n.t < introBars * 4);
        const layers = ['lead', 'counter', 'arp', 'bass'].filter(has).length + (parts.drums.some(d => d.t < introBars * 4 && d.kind === 'snare') ? 1 : 0);
        if (layers >= 4) {
          const half = Math.max(1, Math.floor(introBars / 2)) * 4; const before = parts.arp.length;
          parts.arp = parts.arp.filter(n => n.t >= half); parts.counter = parts.counter.filter(n => n.t >= half || n.answer);
          T.agree(M, 'COMPOSER', 'ARRANGE', 'THE INTRO STARTS WITH EVERYTHING AT ONCE', `LET THE ARP AND COUNTER ENTER HALFWAY THROUGH THE INTRO (${before - parts.arp.length} NOTES HELD BACK)`);
        } else T.ev(M, 'work', 'ARRANGE', `INTRO STARTS WITH ${layers} LAYER${layers === 1 ? '' : 'S'}: ROOM TO GROW`, 2);
      }
      // rule: parts stay out of each other's register (masking)
      const lead = parts.lead.slice().sort((a, b) => a.t - b.t);
      const leadAt = t => { let lo = 0, hi = lead.length - 1, best = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (lead[mid].t <= t) { best = lead[mid]; lo = mid + 1; } else hi = mid - 1; } return best && t < best.t + best.d ? best : null; };
      let moved = 0, ducked = 0;
      const OR = !!song.meta.orch;
      for (const nm of ['counter', 'arp']) for (const n of parts[nm] || []) {
        if (OR && (n.mel || n.dbl)) continue;   // the tune (handed to the counter voice) and its octave double stay put
        const l = leadAt(n.t + 0.01); if (!l || (OR && l.cp)) continue;
        if (Math.abs(n.m - l.m) <= 2 && !n.answer) { n.m += (n.m - 12 >= 45 ? -12 : 12); moved++; }
        if (n.v > 0.5) { n.v *= 0.85; ducked++; }
      }
      if (moved) T.agree(M, 'COMPOSER', 'CLARITY', `${moved} HARMONY NOTES SIT ON TOP OF THE MELODY`, 'MOVE THEM AN OCTAVE AWAY SO BOTH ARE HEARD');
      T.ev(M, 'work', 'CLARITY', `LEAVING ROOM FOR THE MELODY: ${ducked} BACKING NOTES SIT A LITTLE LOWER WHILE IT PLAYS`, Math.ceil((ducked + moved) / 15) + 2);
      // rule: one owner for the low end
      let low = 0;
      for (const nm of ['counter', 'arp']) for (const n of parts[nm] || []) if (n.m < (OR ? 43 : 48)) { n.m += 12; low++; }
      T.ev(M, 'work', 'LOW END', low ? `${low} NOTES WERE IN THE BASS'S ROOM: MOVED UP, THE BASS OWNS THE LOW END` : 'THE BASS OWNS THE LOW END ALONE: GOOD', 2 + Math.ceil(low / 5));
      // rule: fade, don't chop (loops stay seamless)
      if (!song.meta.loop && !form.startsWith('jingle') && NB > 6) {
        const from = (NB - 2) * 4, to = NB * 4; let f = 0;
        for (const nm of ['lead', 'counter', 'arp', 'bass']) for (const n of parts[nm] || []) if (n.t >= from) { n.v *= LO.clamp(1 - 0.55 * (n.t - from) / (to - from), 0.3, 1); f++; }
        for (const d of parts.drums) if (d.t >= from) { d.v *= LO.clamp(1 - 0.6 * (d.t - from) / (to - from), 0.25, 1); f++; }
        T.ev(M, 'work', 'ARRANGE', `ENDING EASES OUT OVER 2 BARS (${f} NOTES)`, 2);
      } else if (song.meta.loop) T.ev(M, 'work', 'ARRANGE', 'GAME LOOP: NO FADE, THE END MEETS THE START SEAMLESSLY', 1);
    },
    chipFx(T, chipId, song, fx) {
      if (chipId !== 'LO-1') return;
      const hints = song.meta.hints || {};
      const fourFloor = ['techno', 'house', 'trance', 'synthwave'].includes(song.meta.drumStyle);
      const longBass = ['sub', 'rolling', 'reese', 'hold', 'drive'].includes(String(song.meta.vector.bassStyle));
      if (hints.pump === 0) T.ev(M, 'work', 'LOW END', 'THIS STYLE WAS MIXED WITHOUT COMPRESSORS: NO PUMP, RESPECTED', 1);
      else if (fourFloor && longBass && (fx.pump || 0) < 20) { fx.pump = 25; T.agree(M, 'CHIP KEEPER', 'LOW END', 'KICK AND BASS FIGHT FOR THE SAME SPACE', 'USE THE LO-1 PUMP BUS: THE BASS DUCKS UNDER EACH KICK (25%)'); }
    },
    // the master stage. on = full LoOrbit DSP polish, off = safety only (no clipping, fair level)
    master(L, R, on, rep) {
      const n = L.length; rep = rep || {};
      const hl = new LO.Biquad('hp', 22, 0.7), hr = new LO.Biquad('hp', 22, 0.7);
      let peak = 1e-9;
      for (let i = 0; i < n; i++) { L[i] = hl.run(L[i]); R[i] = hr.run(R[i]); const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; }
      rep.on = !!on;
      if (!on) {
        const g = 0.89 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } rep.gain = g;
        rep.lufs = LO.lufs(L, R); rep.peakDb = 20 * Math.log10(0.89); rep.limitDb = 0; return rep;
      }
      // bass stays mono below 120 Hz
      const sh = new BQ('hp', 120, 0.7);
      let sideLow = 0, sideAll = 0;
      for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5, s2 = sh.run(s); sideLow += (s - s2) * (s - s2); sideAll += s * s; L[i] = m + s2; R[i] = m - s2; }
      rep.monoLow = sideAll > 1e-9 ? Math.round(100 * sideLow / sideAll) : 0;
      // mud and harshness: compare with the neighbors, treat gently and only when needed
      const b125 = bandDb(L, R, 125), b350 = bandDb(L, R, 350), b1k = bandDb(L, R, 1000), b3k = bandDb(L, R, 3200);
      const mudX = b350 - (b125 + b1k) / 2, harshX = b3k - b1k;
      rep.mud = 0; rep.harsh = 0;
      if (mudX > 3) { rep.mud = -Math.min(2.5, (mudX - 3) * 0.6 + 1); const a = new BQ('peak', 350, 0.9, rep.mud), b = new BQ('peak', 350, 0.9, rep.mud); for (let i = 0; i < n; i++) { L[i] = a.run(L[i]); R[i] = b.run(R[i]); } }
      if (harshX > 1) { rep.harsh = -Math.min(2.5, (harshX - 1) * 0.5 + 1); const a = new BQ('peak', 3200, 1.0, rep.harsh), b = new BQ('peak', 3200, 1.0, rep.harsh); for (let i = 0; i < n; i++) { L[i] = a.run(L[i]); R[i] = b.run(R[i]); } }
      rep.mudX = +mudX.toFixed(1); rep.harshX = +harshX.toFixed(1);
      // gentle glue: slow 2:1 compressor above the average level
      let ss = 0, pk = 1e-9; for (let i = 0; i < n; i++) { ss += L[i] * L[i] + R[i] * R[i]; const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > pk) pk = a; }
      const rms = Math.sqrt(ss / (2 * n)) + 1e-9, g0 = 0.16 / rms;
      let env = 0; const att = Math.exp(-1 / (0.01 * LO.SR)), rel = Math.exp(-1 / (0.25 * LO.SR)), thr = 0.16 * 1.4;
      let maxGr = 1;
      for (let i = 0; i < n; i++) {
        const x = Math.max(Math.abs(L[i]), Math.abs(R[i])) * g0;
        env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
        const gr = env > thr ? Math.pow(thr / env, 0.5) : 1; if (gr < maxGr) maxGr = gr;
        L[i] *= g0 * gr; R[i] *= g0 * gr;
      }
      rep.glueDb = +(20 * Math.log10(maxGr)).toFixed(1);
      // loudness: measure, then match the target without crushing (limiter work capped at 3 dB)
      const before = LO.lufs(L, R);
      let p2 = 1e-9; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > p2) p2 = a; }
      let gain = Math.pow(10, (TARGET_LUFS - before) / 20);
      const maxGain = CEIL * Math.pow(10, 3 / 20) / p2;
      rep.crestLimited = gain > maxGain; if (gain > maxGain) gain = maxGain;
      for (let i = 0; i < n; i++) { L[i] *= gain; R[i] *= gain; }
      const lim = LO.limit(L, R, CEIL);
      rep.limitDb = +lim.maxGrDb.toFixed(1);
      rep.lufs = +LO.lufs(L, R).toFixed(1); rep.target = TARGET_LUFS;
      let p3 = 0; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > p3) p3 = a; }
      rep.peakDb = +(20 * Math.log10(p3 + 1e-9)).toFixed(1);
      return rep;
    },
    // ---- MIX ENGINEER (v0.6.1, SNES): measure every voice, set its level from its role (melody first, then the
    // answers, bass and drums forward, pads behind: Rimsky-Korsakov's balance as level targets), place it on the
    // stage with real S-DSP left/right volumes, and send echo only to the melody, the counter-line and the pads.
    // Then the LISTENER checks that no voice is buried and sends the mix back until every voice is heard.
    ROLE_DB: { lead: 0, counter: -3, pad: -11, timp: -4, bass: -3.5, drums: -2.5, noise: -13, double: -7, echo: -9, mod: -120, bed: -24 },
    mixEngineer(T, song, R, fx) {
      // v0.7.2: a trick voice plan (PMON modulators, a detuned double, a fake echo) brings its own roles
      const roles = R.voiceRoles ? R.voiceRoles.slice() : ['lead', 'counter', 'pad', 'pad', R.timpVoice ? 'timp' : 'pad', 'bass', 'drums', 'noise'];
      const PAN0 = { lead: 0.06, counter: -0.38, pad: 0.6, timp: 0.22, bass: 0, drums: 0, noise: 0.32, double: -0.55, echo: 0.55, mod: 0, bed: 0 };
      const PAN = R.voiceRoles ? roles.map((r, i) => r === 'pad' ? (i % 2 ? 0.6 : -0.6) : PAN0[r]) : [0.06, -0.38, -0.6, 0.6, R.timpVoice ? 0.22 : 0, 0, 0, 0.32];
      const I = (R.budget && R.budget.inst) || {}, famOf = r => I[r] && I[r].name && LO.SNESI_HIFI ? LO.SNESI_HIFI.familyOf(I[r].name) : null;
      const COLOR = { lead: { BRASS: -1, HORN: -0.5, FLUTE: 1, OBOE: 0.5, GLOCK: -2 }, counter: { GLOCK: -3, CELESTA: -1.5, VIBES: -1, HARP: 1, PIZZ: 1, BRASS: -1 }, pad: { CHOIR: -1, ORGAN: -2, PAD: -1 } };
      const orchDrums = song.meta.drumStyle === 'orch';
      const target = roles.map((r, i) => {
        let t = this.ROLE_DB[r];
        if (r === 'drums' && orchDrums) t -= 3.5;
        if (r === 'noise' && orchDrums) t += 3;
        const f = famOf(r === 'drums' || r === 'noise' ? null : r); if (f && COLOR[r] && COLOR[r][f] != null) t += COLOR[r][f];
        if (song.meta.leadFocus && r !== 'lead' && r !== 'mod') t -= song.meta.leadFocus;   // v0.7.3: the tune sits clearly on top
        return t;
      });
      // measured loudness of each voice while it plays (K-weighting style: low cut + presence lift)
      const n = R.total, step = 2, fr = Math.round(0.05 * LO.SR / step);
      const meas = R.raw.map(x => {
        const hp = new BQ('hp', 80, 0.7, 0, LO.SR / step), sh = new BQ('hshelf', 1600, 0.7, 4, LO.SR / step); const fe = []; let s = 0, c = 0;
        for (let i = 0; i < n; i += step) { const y = sh.run(hp.run(x[i])); s += y * y; if (++c === fr) { fe.push(s / fr); s = 0; c = 0; } }
        // loudness while it plays: the mean of its loudest 30% of moments (a drum hit, not the silence after it)
        const act = fe.filter(e => e > 1e-12).sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(fe.filter(e => e > 1e-12).length * 0.3)));
        return act.length && act[0] > 1e-12 ? 10 * Math.log10(act.reduce((a, b) => a + b, 0) / act.length) : -120;
      });
      const db = meas.map((m, i) => m < -110 || roles[i] === 'mod' ? -120 : target[i] - m);
      const ref = Math.max(...db.filter(v => v > -100)), gains = db.map(v => v < -100 ? 0 : Math.pow(10, (v - ref) / 20));
      // S-DSP voice volumes: signed 8-bit per side; the loudest voice gets 112 so every level keeps its resolution
      const vols = () => { const raw = gains.map((g, i) => { const p = PAN[i]; return [g * Math.cos((p + 1) * Math.PI / 4) * Math.SQRT2, g * Math.sin((p + 1) * Math.PI / 4) * Math.SQRT2]; }); const mx = Math.max(1e-9, ...raw.flat()); return raw.map(([l, r]) => [Math.round(LO.clamp(l / mx * 112, 0, 127)), Math.round(LO.clamp(r / mx * 112, 0, 127))]); };
      // the LISTENER's buried-voice check, then a remix pass for any voice it cannot hear
      const ch = LO.Listener && LO.Listener.audibility ? LO.Listener.audibility(R, roles, orchDrums ? { drums: -12, noise: -16 } : null) : null;
      const passes = [];
      if (ch) for (let pass = 0; pass < 4; pass++) {
        const au = ch.score(gains), bad = au.filter(a => a.buried);
        passes.push(au);
        if (!bad.length) break;
        for (const b of bad) { gains[b.i] *= Math.pow(10, 2.5 / 20); if (b.by != null && roles[b.by] !== 'lead') gains[b.by] *= Math.pow(10, -1 / 20); }
        if (T) T.ev('LISTENER', 'note', 'CLARITY', `BURIED: ${bad.map(b => `${b.name} (${b.snr.toFixed(0)} DB UNDER ${b.byName})`).join(', ')}: SENT BACK TO PRODUCTION`, 3, { to: M });
        if (T) T.ev(M, 'work', 'CLARITY', `REMIX PASS ${pass + 1}: ${bad.map(b => b.name + ' +2.5 DB').join(', ')}`, 3);
      }
      const mk = Math.max(...gains); if (mk > 0) for (let i = 0; i < 8; i++) gains[i] /= mk;
      fx.mixv = vols();
      fx.eonv = R.voiceRoles ? roles.map(r => ['lead', 'counter', 'pad', 'double', 'echo'].includes(r) ? 1 : 0) : [1, 1, 1, 1, R.timpVoice ? 0 : 1, 0, 0, 0];
      const rep = { roles, meas: meas.map(v => +v.toFixed(1)), target, vols: fx.mixv, passes: passes.length, audible: passes.length ? passes[passes.length - 1] : null };
      song.meta.mix = rep;
      if (T) {
        const NM = { lead: 'MELODY', counter: 'COUNTER', pad: 'PAD', timp: 'TIMPANI', bass: 'BASS', drums: 'DRUMS', noise: 'NOISE', double: 'MELODY DOUBLE', echo: 'FAKE ECHO', mod: 'MODULATOR (SILENT)', bed: 'NOISE BED' };
        const nm = R.voiceRoles ? roles.map(r => NM[r]) : ['MELODY', 'COUNTER', 'PAD 1', 'PAD 2', R.timpVoice ? 'TIMPANI' : 'PAD 3', 'BASS', 'DRUMS', 'NOISE'];
        if (R.tricks && R.tricks.length) T.ev(M, 'work', 'ARRANGE', 'HARDWARE TRICKS: ' + R.tricks.join(', '), 4);
        T.ev(M, 'work', 'CLARITY', `MIX ENGINEER: MEASURED ALL 8 VOICES, SET EACH ONE BY ITS ROLE (MELODY FIRST, PADS ${Math.abs(this.ROLE_DB.pad)} DB BEHIND)`, 8);
        T.ev(M, 'work', 'ARRANGE', `STAGE: ${nm.map((x, i) => `${x} ${PAN[i] < -0.1 ? 'LEFT' : PAN[i] > 0.1 ? 'RIGHT' : 'CENTER'}`).join(', ')}`, 4);
        T.ev(M, 'work', 'CLARITY', `ECHO ON THE MELODY, THE COUNTER-LINE AND THE PADS; BASS${R.timpVoice ? ', TIMPANI' : ''} AND DRUMS STAY DRY AND FORWARD`, 2);
        const last = rep.audible; if (last) T.ev('LISTENER', 'work', 'CLARITY', `EVERY VOICE CHECKED FOR MASKING: ${last.filter(a => !a.buried).length} OF ${last.length} CLEARLY HEARD${last.some(a => a.buried) ? ' (BEST THE 8 VOICES ALLOW)' : ''}`, 4);
      }
      return rep;
    },
    logMaster(T, rep) {
      if (!T || !rep) return;
      if (!rep.on) { T.ev(M, 'work', 'LOUDNESS', `MASTER STAGE OFF: SAFETY ONLY, PEAKS AT ${rep.peakDb.toFixed(1)} DB, NO CLIPPING`, 2); return; }
      T.ev(M, 'work', 'LOW END', `BASS KEPT MONO BELOW 120 HZ (${rep.monoLow}% OF THE SIDE SIGNAL WAS LOW END)`, 4);
      T.ev(M, 'work', 'CLARITY', rep.mud ? `LOW-MIDS RAN ${rep.mudX} DB HOT: GENTLE ${rep.mud.toFixed(1)} DB DIP AT 350 HZ` : `NO MUD: LOW-MIDS SIT ${rep.mudX} DB AGAINST THEIR NEIGHBORS`, 6);
      T.ev(M, 'work', 'CLARITY', rep.harsh ? `2-5 KHZ RAN HOT (+${rep.harshX} DB): SOFTENED ${rep.harsh.toFixed(1)} DB` : 'NO HARSHNESS IN THE 2-5 KHZ ZONE', 5);
      T.ev(M, 'work', 'LOUDNESS', `LOUDNESS ${rep.lufs} LUFS (TARGET ${rep.target})${rep.crestLimited ? ', HELD BACK TO KEEP THE DYNAMICS' : ''}, PEAK ${rep.peakDb} DB, LIMITER ${rep.limitDb} DB`, 8);
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
