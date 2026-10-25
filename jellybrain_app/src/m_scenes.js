/* LowOrbit Chip Studio - v0.7.2 SCENE DEVICES: a scene's character sheet turned into music, after the composer writes.
   Four emotion toolkits, each the way 16-bit composers built it with 8 voices and 64 KB:
   PAUSE   the harmonic cliff (iv - V7, then a rest exactly where the tonic is due), a top-down voice dissolve over a few
           ticks, the echo left ringing (key-off only), one quiet out-of-key ghost note, then the tonic a bar late
   SOFT    slow attacks, open voicing (fifth low, tenth and ninth high, the middle left empty), micro-drift (bass +1 tick,
           pads +3 ticks), a detuned double
   HURRY   off-beat accents (the "and" of 2, the tick before 4), a 3-against-4 ostinato, needle staccato, chromatic runs
           landing on a tritone, a tempo that tightens bar by bar (N-SPC tempo steps)
   CAREFUL pedal point under sus chords (no thirds), a 5-step ostinato against the 4/4 bar, a phrase stretched to 5 bars,
           breathing pad swells, a 2-3 voice budget, low noise-clock rumble instead of hats
   Harmony devices: pedal, sus, bII (Neapolitan/Phrygian cadence), tritone, chromatic, picardy. */
(function (G) {
  const LO = G.LO;
  const TICK = 1 / 48;   // N-SPC: 48 ticks per beat
  const lanes = () => LO.LANES || { bass: [28, 52], pad: [48, 72], melody: [60, 91], counter: [50, 79] };
  const fit = (m, [lo, hi]) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
  const PARTS = ['lead', 'counter', 'bass', 'drums', 'chords', 'arp', 'fx'];

  function chordAt(song, t) { const C = song.parts.chords; for (let i = C.length - 1; i >= 0; i--) if (C[i].t <= t + 1e-6) return C[i]; return C[0]; }
  function secAt(song, bar) { return song.sections.find(s => bar >= s.start && bar < s.start + s.bars) || song.sections[song.sections.length - 1]; }

  // a bar inserted at a beat: 'hold' sustains what is sounding (a stretched phrase), 'rest' is a bar of silence
  function insertBar(song, at, mode) {
    const P = song.parts;
    for (const k of PARTS) { const a = P[k]; if (!a || !a.length) continue;
      for (const e of a) {
        if (e.t >= at - 1e-6) e.t += 4;
        else if (e.d != null && e.t + e.d > at + 1e-6) { if (mode === 'hold' && k !== 'drums') e.d += 4; else e.d = at - e.t; }
      } }
    const bar = Math.round(at / 4), secs = song.sections.slice().sort((a, b) => a.start - b.start);
    // the new bar joins the section it lands in, or the one that ends right there; starts are re-packed back to back
    const host = secs.find(x => bar > x.start && bar <= x.start + x.bars) || secs[0];
    host.bars += 1; for (let i = 1; i < secs.length; i++) secs[i].start = secs[i - 1].start + secs[i - 1].bars;
    song.totalBeats += 4; if (song.meta.loopStart != null && song.meta.loopStart * 4 >= at - 1e-6) song.meta.loopStart += 1;
    if (Array.isArray(song.bars)) song.bars.splice(bar, 0, { ...(song.bars[Math.max(0, bar - 1)] || {}) }); else if (typeof song.bars === 'number') song.bars += 1;
  }

  function apply(song, sh, R) {
    const P = song.parts, M = song.meta, L = lanes(), key = M.key, SC = LO.MODES[M.mode] || [0, 2, 3, 5, 7, 8, 10];
    const tools = new Set(sh.tools || []), dev = new Set(sh.dev || []), log = [];
    const minor = SC[2] === 3;
    M.sheet = { scene: sh.scene, tools: [...tools], dev: [...dev] };
    M.kit = sh.kit || M.kit; M.tricks = { ...(M.tricks || {}), ...(sh.tricks || {}) };
    if (sh.voices) M.voiceBudget = sh.voices;
    const last = song.sections[song.sections.length - 1];
    const bodySecs = song.sections.filter(s => s.name !== 'intro');

    // ---------------- harmony devices
    const susOf = (c, p) => { const r = c.tones[0]; for (let i = 1; i < c.tones.length; i++) { const iv = ((c.tones[i] - r) % 12 + 12) % 12; if (iv === 3 || iv === 4) { c.tones[i] = r + (R.chance(p) ? 5 : 2) + 12 * Math.floor((c.tones[i] - r) / 12); c.sus = true; } } };
    if (dev.has('sus') || tools.has('CAREFUL')) { const p = tools.has('CAREFUL') ? 0.7 : 0.3; let n = 0; for (const c of P.chords) if (c !== P.chords[P.chords.length - 1] && R.chance(p)) { susOf(c, 0.5); n++; } log.push(`SUS CHORDS: ${n} OF ${P.chords.length} (NO THIRD: SAFE OR HOSTILE, NOBODY KNOWS)`); }
    const tonicBass = fit(36 + key, L.bass);
    if (dev.has('pedal') || tools.has('CAREFUL')) {
      const secs = tools.has('CAREFUL') ? song.sections : song.sections.filter(s => s.name === 'intro' || s.name === 'B');
      const inSec = t => secs.some(s => t >= s.start * 4 && t < (s.start + s.bars) * 4);
      P.bass = P.bass.filter(e => !inSec(e.t));
      for (const c of P.chords) if (inSec(c.t)) P.bass.push({ t: c.t, d: c.d * 0.96, m: tonicBass, v: 0.85, pedal: true });
      P.bass.sort((a, b) => a.t - b.t); log.push(`PEDAL POINT ON ${LO.NOTE_NAMES[key]} IN ${secs.map(s => s.name).join(', ')}`);
    }
    if (dev.has('bII')) {   // the Neapolitan / Phrygian cadence: the chord before each section's last chord becomes bII major
      let n = 0;
      for (const s of bodySecs) { const end = (s.start + s.bars) * 4; const cs = P.chords.filter(c => c.t >= s.start * 4 && c.t < end); if (cs.length < 3) continue;
        const c = cs[cs.length - 2], r = fit(key + 1 + 48, [48, 59]); c.tones = [r, r + 4, r + 7]; c.bII = true; n++;
        for (const b of P.bass) if (b.t >= c.t && b.t < c.t + c.d) b.m = fit(key + 1, L.bass); }
      if (n) log.push(`bII CADENCE x${n} (THE DARK HALF-STEP ABOVE HOME)`);
    }
    if (dev.has('picardy') && minor) { const c = P.chords[P.chords.length - 1]; const r = c.tones[0]; for (let i = 1; i < c.tones.length; i++) if (((c.tones[i] - r) % 12 + 12) % 12 === 3) c.tones[i] += 1; log.push('PICARDY THIRD: THE LAST CHORD TURNS MAJOR'); }
    if (dev.has('tritone')) {   // each section's last bass note drops a tritone: no home key under it
      let n = 0; for (const s of bodySecs) { const end = (s.start + s.bars) * 4; const b = P.bass.filter(e => e.t >= end - 4 && e.t < end).pop(); if (b && !b.pedal) { b.m = fit(key + 6, L.bass); n++; } }
      if (n) log.push(`TRITONE DROPS x${n}`);
    }

    if (dev.has('impact')) {   // one sample, two jobs: the snare pitched down 15 semitones is the boom at each section's start
      for (const x of bodySecs) P.drums.push({ t: x.start * 4, kind: 'impact', v: 1 }); P.drums.sort((a, b) => a.t - b.t); log.push(`IMPACTS x${bodySecs.length} (THE SNARE, 15 SEMITONES DOWN)`);
    }
    if (dev.has('drift') && !tools.has('SOFT')) {   // human strumming: the chords a few ticks behind the bass's downbeat
      for (const c of P.chords) c.t += 2 * TICK; for (const b of P.bass) b.t += 0; log.push('MICRO-DRIFT: CHORDS +2 TICKS BEHIND THE BASS');
    }
    // ================= v0.7.3: the research rules (Eerola 2013, Huron 2014, Sloboda, Temperley & Tan, Jakubowski)
    const lead = P.lead, med = a => { const s2 = a.map(n => n.m).sort((x, y) => x - y); return s2.length ? s2[s2.length >> 1] : 72; };
    // register: a high melody reads happier and more peaceful, a low one scarier and sadder (SOLID, Eerola 2013)
    if (sh.register && lead.length) { const m0 = med(lead), sh12 = sh.register === 'high' && m0 < 74 ? 12 : sh.register === 'low' && m0 > 69 ? -12 : 0;
      if (sh12 && lead.every(n => n.m + sh12 >= 55 && n.m + sh12 <= 93)) { for (const n of lead) n.m += sh12; log.push(`MELODY REGISTER ${sh.register.toUpperCase()} (${sh12 > 0 ? '+' : ''}${sh12})`); } }
    // a sad melody moves in small steps inside about an octave: small intervals were the strongest sadness cue (SOLID, Huron 2014)
    if (dev.has('stepwise') && lead.length > 2) { let moved = 0; for (let i = 1; i < lead.length; i++) { while (lead[i].m - lead[i - 1].m > 7 && lead[i].m - 12 >= 52) { lead[i].m -= 12; moved++; } while (lead[i - 1].m - lead[i].m > 7 && lead[i].m + 12 <= 91) { lead[i].m += 12; moved++; } }
      const c0 = med(lead); for (const n of lead) { while (n.m > c0 + 7) n.m -= 12; while (n.m < c0 - 7) n.m += 12; } log.push(`STEPWISE MELODY: ${moved} LEAPS FOLDED, RANGE KEPT NEAR AN OCTAVE`); }
    // the melody's notes per second, capped for the slow, tender and careful scenes (SOLID direction, Eerola 2013 / YM2413-MDB)
    if (sh.npsMax && lead.length > 4) { const spb = 60 / M.bpm, nps = () => lead.length / Math.max(1, (lead[lead.length - 1].t - lead[0].t) * spb);
      let cut = 0; while (nps() > sh.npsMax && cut < lead.length / 2) { let bi = -1, bd = 9; for (let i = 1; i < lead.length; i++) if (lead[i].d < bd && !lead[i].run) { bd = lead[i].d; bi = i; } if (bi < 1) break; lead[bi - 1].d = lead[bi].t + lead[bi].d - lead[bi - 1].t; lead.splice(bi, 1); cut++; }
      if (cut) log.push(`MELODY THINNED TO ${sh.npsMax} NOTES A SECOND (${cut} SHORT NOTES MERGED)`); }
    // tears: appoggiaturas, a leaning note on the strong beat falling into the chord tone (18 of 20 tear passages, Sloboda)
    if (dev.has('appog')) { let n = 0;
      for (let i = 0; i < lead.length; i++) { const e = lead[i]; if (e.d < 1.5 || Math.abs(e.t % 4) > 1e-6 || !R.chance(0.45)) continue;
        const up = SC.map(x => key + x).flatMap(x => [x - 12, x, x + 12, x + 24, x + 36, x + 48, x + 60]).filter(x => x > e.m && x <= e.m + 2).sort((a, b) => a - b)[0];
        if (up == null) continue; const h = Math.min(1, e.d / 2); lead.splice(i, 1, { ...e, d: h, m: up, v: Math.min(1, (e.v || 0.8) * 1.08), appog: true }, { ...e, t: e.t + h, d: e.d - h }); i++; n++; }
      if (n) log.push(`APPOGGIATURAS x${n} (THE NOTE THAT LEANS, THEN GIVES WAY)`); }
    // falling line into the end (GAME OVER): the last notes only go down
    if (dev.has('falling') && lead.length > 3) { for (let i = Math.max(1, lead.length - 6); i < lead.length; i++) while (lead[i].m > lead[i - 1].m && lead[i].m - 12 >= 48) lead[i].m -= 12; log.push('FALLING LINE INTO THE END'); }
    // bright percussion is out for sad and tender scenes (snare, tambourine, cymbal rated least sad, Huron 2014)
    if (sh.noBright) { const b4 = P.drums.length; P.drums = P.drums.filter(d => !['crash', 'clap', 'rim', 'ohat'].includes(d.kind)); for (const d of P.drums) if (d.kind === 'snare') d.v = (d.v || 1) * 0.6; if (b4 !== P.drums.length) log.push('NO BRIGHT PERCUSSION (CYMBALS, CLAPS, RIMS OUT; SNARE SOFT)'); }
    // the two kinds of fear: TERROR is loud, dense and rough; ANXIETY is soft, sparse and unpredictable (Trevor 2023)
    if (sh.fear === 'anxiety') { let drop = 0; P.counter = P.counter.filter(e => { if (!e.ghost && R.chance(0.12)) { drop++; return false; } return true; }); for (const k of ['lead', 'counter', 'bass']) for (const e of P[k]) e.v = (e.v == null ? 1 : e.v) * 0.82; log.push(`ANXIETY: SOFTER, ${drop} NOTES DROPPED AT RANDOM (THE PULSE YOU CANNOT TRUST)`); }
    if (sh.fear === 'terror') { for (const k of ['lead', 'bass', 'drums']) for (const e of P[k]) e.v = Math.min(1, (e.v == null ? 1 : e.v) * 1.1); log.push('TERROR: LOUD, DENSE, ROUGH'); }
    // the rough stinger: a minor-2nd cluster on each section's first beat, beating like a scream (Arnal 2015, Trevor 2020)
    if (dev.has('rough')) { let n = 0; for (const x of bodySecs) { const t0 = x.start * 4, l = lead.find(e => e.t >= t0 && e.t < t0 + 1); if (!l) continue; P.counter = P.counter.filter(e => !(e.t >= t0 && e.t < t0 + 1)); P.counter.push({ t: t0, d: 0.9, m: fit(l.m + 1, L.counter), v: 1, rough: true, sec: x.name }); n++; }
      P.counter.sort((a, b) => a.t - b.t); if (n) log.push(`ROUGH STINGERS x${n} (MINOR-2ND CLUSTERS)`); }
    // half time for a slow boss: the snare only on beat 3, heavy
    if (dev.has('halftime') && M.bpm < 150) { P.drums = P.drums.filter(d => !(d.kind === 'snare' && !d.acc && [1, 3].includes(Math.round((d.t % 4) * 4) / 4))); for (let b = 0; b * 4 < song.totalBeats; b++) if (b >= (song.sections[0].name === 'intro' ? song.sections[0].bars : 0)) P.drums.push({ t: b * 4 + 2, kind: 'snare', v: 1 }); P.drums.sort((a, b) => a.t - b.t); log.push('HALF-TIME: THE SNARE LANDS HEAVY ON 3'); }
    // the fanfare cadence: bVI - bVII - I on the last three chords, the melody home on the tonic
    if (dev.has('fanfare') && P.chords.length >= 3) { const C = P.chords, n = C.length; [[8, 4], [10, 4], [0, 4]].forEach(([iv, th], k) => { const c = C[n - 3 + k], r = fit(key + iv + 48, [48, 59]); c.tones = [r, r + th, r + 7]; });
      const lst = lead[lead.length - 1]; if (lst) lst.m = fit(key + 60, [lst.m - 6, lst.m + 6]); log.push('FANFARE CADENCE bVI - bVII - I'); }
    // instruments layer in, one every two bars (each entry is a small lift; Grewe 2007)
    if (dev.has('layerin')) { const order = [['chords', 0], ['bass', 2], ['counter', 4], ['drums', 6]]; for (const [k, b] of order) if (P[k]) P[k] = P[k].filter(e => e.t >= b * 4 - 1e-6 || e.t >= 8 * 4); log.push('LAYER-IN: PADS, THEN BASS, COUNTER, DRUMS, TWO BARS APART'); }
    // the chills swell, once: a crescendo into the last section, a new voice doubling the tune an octave up, the range opening
    if (dev.has('swell') && song.sections.length >= 3) { const x = last, t0 = x.start * 4, t1 = t0 + Math.min(16, x.bars * 4);
      for (const e of lead) if (e.t >= t0 - 8 && e.t < t0) e.v = Math.min(1, (e.v || 0.8) * (0.85 + 0.25 * (e.t - (t0 - 8)) / 8));
      P.counter = P.counter.filter(e => !(e.t >= t0 && e.t < t1)); for (const e of lead) if (e.t >= t0 && e.t < t1) P.counter.push({ ...e, m: e.m + 12 <= 84 ? e.m + 12 : e.m, v: 0.7, swell: true });
      P.counter.sort((a, b) => a.t - b.t); log.push('CHILLS SWELL: CRESCENDO, A NEW VOICE ENTERS AN OCTAVE UP, THE RANGE OPENS'); }
    // the melody on top: other voices step back a little (melody prominence predicted recognition, Van Balen 2015)
    if (sh.leadFocus) M.leadFocus = sh.leadFocus;
    if (sh.quiet) { M.quiet = sh.quiet; log.push(`QUIETEST SCENE: ${Math.round(20 * Math.log10(sh.quiet))} DB UNDER THE REST`); }
    // ---------------- SOFT
    if (tools.has('SOFT')) {
      M.soft = { padAR: 3, leadAR: sh.leadAR != null ? sh.leadAR : null };
      for (const c of P.chords) { const r = c.tones[0], third = c.tones.length > 1 ? ((c.tones[1] - r) % 12 + 12) % 12 : 4, maj = third === 4;
        c.tones = [r + 7, r + 12 + (third === 3 || third === 4 ? third : 4), r + (maj && R.chance(0.5) ? 11 : 14)]; c.open = true; }
      for (const c of P.chords) c.t += 3 * TICK;
      for (const b of P.bass) b.t += TICK;
      M.tricks.detune = M.tricks.detune || (sh.detune === false ? 0 : 3);
      log.push('SOFT: SLOW ATTACKS, OPEN VOICING (FIFTH LOW, TENTH + NINTH HIGH), BASS +1 TICK, PADS +3 TICKS, A DETUNED DOUBLE');
    }

    // ---------------- CAREFUL
    if (tools.has('CAREFUL')) {
      // a 5-step ostinato on eighths against the 4-beat bar: it lines up again only every 5 bars
      const steps = [0, 4, 2, 5, 1].map(d => fit(key + SC[d % 7] + 60, L.counter));
      const cs = song.sections.filter(s => s.name !== 'intro'); P.counter = [];
      for (const s of cs) for (let t = s.start * 4, i = 0; t < (s.start + s.bars) * 4; t += 0.5, i++) if (R.chance(0.82)) P.counter.push({ t, d: 0.42, m: steps[i % 5], v: 0.5, sec: s.name, ost: 5 });
      P.drums = P.drums.filter(d => d.kind !== 'hat' && d.kind !== 'ohat' && d.kind !== 'crash');
      M.tricks.noiseBed = M.tricks.noiseBed || { clock: sh.rumble || 5, period: 7, rise: 12, fall: 11 };
      M.padSwell = true;
      const A = song.sections.find(s => s.name === 'A');
      if (A && A.bars >= 8 && !sh.noStretch) { insertBar(song, (A.start + 4) * 4, 'hold'); log.push('PHRASE STRETCHED: 4 BARS BECOME 5 (THE LINE KEEPS FLOATING)'); }
      log.push('CAREFUL: 5-STEP OSTINATO OVER 4/4, NO HATS (LOW NOISE-CLOCK RUMBLE), PAD SWELLS LIKE BREATHING');
    }

    // ---------------- HURRY
    if (tools.has('HURRY')) {
      const end = song.totalBeats; let acc = 0;
      for (const s of bodySecs) for (let b = s.start; b < s.start + s.bars; b++) {
        const t0 = b * 4; if (t0 >= end) continue;
        if (b % 2 === 1) { P.drums.push({ t: t0 + 1.5, kind: 'snare', v: 1, acc: true }); P.drums.push({ t: t0 + 2.75, kind: 'kick', v: 1, acc: true }); acc += 2;
          const bn = P.bass.find(e => e.t <= t0 + 1.5 && e.t + e.d > t0 + 1.5); if (bn) P.bass.push({ ...bn, t: t0 + 1.5, d: Math.min(0.5, bn.t + bn.d - t0 - 1.5), v: 1, acc: true }); }
      }
      P.drums.sort((a, b) => a.t - b.t); P.bass.sort((a, b) => a.t - b.t);
      for (const e of P.lead) if (e.d <= 0.5) { e.d *= 0.6; e.adsr = [15, 7, 0, 26]; }
      // 3 against 4: sixteenths cycling three chord tones in the B section (the accent lands every 3/4 of a beat)
      const B = song.sections.find(s => s.name === 'B') || bodySecs[0];
      if (B) { P.counter = P.counter.filter(e => e.t < B.start * 4 || e.t >= (B.start + B.bars) * 4);
        const st = M.bpm >= 132 ? 0.5 : 0.25;   // three against four in eighths at fast tempos (16ths would blur)
        for (let t = B.start * 4, i = 0; t < (B.start + B.bars) * 4; t += st, i++) { const c = chordAt(song, t); const r = c.tones[0]; const cell = [r, r + (c.tones[2] - r), r + 12]; P.counter.push({ t, d: st * 0.8, m: fit(cell[i % 3], L.counter), v: i % 3 === 0 ? 0.68 : 0.5, sec: B.name, poly: 3 }); }
        P.counter.sort((a, b) => a.t - b.t); }
      // chromatic runs: the last beat of each section, four sixteenths falling by half-steps
      let runs = 0;
      for (const s of bodySecs) { const t1 = (s.start + s.bars) * 4 - 1; const prev = P.lead.filter(e => e.t < t1).pop(); if (!prev) continue;
        P.lead = P.lead.filter(e => e.t < t1 || e.t >= t1 + 1); for (let k = 0; k < 4; k++) P.lead.push({ t: t1 + k * 0.25, d: 0.22, m: fit(prev.m - 1 - k, L.melody), v: 0.85 + k * 0.04, sec: s.name, run: true, adsr: [15, 7, 0, 26] });
        const b = P.bass.filter(e => e.t < t1 + 1 && e.t + (e.d || 0) > t1).pop(); if (b) { b.d = Math.max(0.25, t1 - b.t); P.bass.push({ t: t1, d: 0.95, m: fit(key + 6, L.bass), v: 1 }); }
        runs++; }
      P.lead.sort((a, b) => a.t - b.t); P.bass.sort((a, b) => a.t - b.t);
      // the tempo tightens through the last section: +2% a bar, at most +8% (the driver's tempo command, bar by bar)
      if (!sh.steadyTempo && last.bars >= 4) { M.tempoMap = []; for (let i = 1; i <= 4; i++) M.tempoMap.push({ t: (last.start + last.bars - 5 + i) * 4, f: 1 + 0.02 * i }); }
      log.push(`HURRY: ${acc} OFF-BEAT ACCENTS, 3-AGAINST-4 IN ${B ? B.name : '-'}, STACCATO NEEDLES, ${runs} CHROMATIC RUNS ONTO TRITONES${M.tempoMap ? ', TEMPO TIGHTENS +8%' : ''}`);
    }

    // ---------------- PAUSE (last: it moves time)
    if (tools.has('PAUSE') && song.sections.length >= 3) {
      const S = last.name === 'outro' && song.sections.length > 3 ? song.sections[song.sections.length - 2] : last;
      const at = S.start * 4, W0 = at - 1;
      // the cliff: iv then V7 in the bar before, the melody snapped to the chord where it lingers
      const prevC = P.chords.filter(c => c.t < at).slice(-2);
      const V = fit(key + 7 + 48, [48, 59]), iv = fit(key + SC[3] + 48, [48, 59]);
      if (prevC.length === 2) { prevC[0].tones = [iv, iv + (minor ? 3 : 4), iv + 7]; prevC[1].tones = [V, V + 4, V + 10]; prevC[1].v7 = true;
        const pcs = [V, V + 4, V + 7, V + 10].map(x => x % 12);
        for (const e of P.lead) if (e.t >= prevC[1].t && e.t < at && e.d >= 0.5) { let best = e.m, bd = 99; for (let d = -2; d <= 2; d++) if (pcs.includes(((e.m + d) % 12 + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); best = e.m + d; } e.m = best; }
        for (const b of P.bass) if (b.t >= prevC[1].t && b.t < at) b.m = fit(key + 7, L.bass); }
      // the dissolve, top-down across 8 ticks (hats, drums, bass, pads, counter, melody last), at beat 4 where the tonic is due
      const cut = { drums: 0, bass: 2, chords: 4, arp: 4, counter: 6, lead: 8 };
      for (const [k, tk] of Object.entries(cut)) { const a = P[k]; if (!a) continue; const W = W0 + tk * TICK;
        P[k] = a.filter(e => !(e.t >= W0 - 1e-6 && e.t < at)); for (const e of P[k]) if (e.d != null && e.t < W && e.t + e.d > W) e.d = W - e.t; }
      const nb = Math.max(1, Math.min(4, sh.pauseBars || 1)); for (let k = 0; k < nb; k++) insertBar(song, at, 'rest');
      // the ghost: one lone out-of-key note, very quiet, in the silent bar
      P.counter.push({ t: at + 1.5, d: 1.2, m: fit(key + 6 + 60, L.counter), v: 0.15, ghost: true, sec: S.name }); P.counter.sort((a, b) => a.t - b.t);
      M.pauses = [{ beat: W0, bars: nb }];
      log.push(`PAUSE: iv - V7, THEN SILENCE WHERE THE TONIC SHOULD LAND (BAR ${Math.round(at / 4) + 1}, ${nb} BAR${nb > 1 ? 'S' : ''}), VOICES DISSOLVE TOP-DOWN OVER 8 TICKS, ECHO LEFT RINGING, ONE GHOST NOTE`);
    }
    // the final slow-down on sad and tender endings (SOLID, Bresin & Friberg 2000): the last two bars, -5% to -20%
    if (dev.has('ritard') && !M.loop) { const e = song.totalBeats; M.tempoMap = (M.tempoMap || []).filter(m => m.t < e - 8).concat([{ t: e - 8, f: 0.95 }, { t: e - 6, f: 0.9 }, { t: e - 4, f: 0.85 }, { t: e - 2, f: 0.8 }]).sort((a, b) => a.t - b.t); log.push('FINAL RITARDANDO (THE LAST TWO BARS SLOW DOWN)'); }
    M.sheetLog = log;
    return log;
  }
  LO.SceneDevices = { apply, insertBar };
})(typeof self !== 'undefined' ? self : globalThis);
