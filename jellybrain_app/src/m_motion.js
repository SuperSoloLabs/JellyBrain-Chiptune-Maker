/* LowOrbit Chip Studio - v0.7.3 THE EXCITEMENT PASS (Jelly Brain scenes). Aimed at what the benchmark measured against
   real game music (a research corpus of game-music transcriptions): the accompaniment barely moved, chords changed too
   slowly, the melody's rhythm was monotonous, sections did not contrast, the bass sat still, and accompaniment notes
   rose above the tune. Energy (the song's arousal 0-10) sets how much of each.
   1 HARMONIC RHYTHM  a passing chord on beat 3 that contains the melody note sounding there (no clashes)
   2 BASS MOTION      octave eighths (driving), root-fifth-octave grooves, walking quarters, gentle half notes
   3 ARPEGGIOS        broken chords under the melody (eighths or sixteenths), from the B section on
   4 MELODY           pickups into phrases, grace notes, pushed (syncopated) notes, dotted rhythms, a trill to close
   5 CONTRAST         B changes texture and register; the last A section lifts a whole step (energetic scenes)
   6 DRUMS            a fill at every 4th bar's end, a crash on each section's downbeat, no two bars alike
   7 ON TOP           (runs last) no accompaniment note above the melody note it sounds against */
(function (G) {
  const LO = G.LO;
  const lanes = () => LO.LANES || { bass: [28, 52], pad: [48, 72], melody: [60, 91], counter: [50, 79], arp: [67, 96] };
  const fit = (m, [lo, hi]) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
  const pc = m => ((m % 12) + 12) % 12;
  const leadAt = (lead, t) => { for (let i = lead.length - 1; i >= 0; i--) { const e = lead[i]; if (e.t <= t + 1e-6) return e.t + e.d > t - 1e-6 ? e : null; } return null; };

  function apply(song, sh, R) {
    const P = song.parts, M = song.meta, L = lanes(), key = M.key, SC = LO.MODES[M.mode] || LO.MODES.minor;
    const spb = 60 / (M.bpm || 120);   // seconds per beat: subdivisions are chosen by notes per SECOND (what the corpus measures)
    const e = M.intense == null ? 5 : M.intense, careful = (sh.tools || []).includes('CAREFUL'), soft = (sh.tools || []).includes('SOFT');
    const jingle = String(M.form || '').startsWith('jingle'), log = [];
    const secs = song.sections, body = secs.filter(s => s.name !== 'intro'), inSec = (t, s) => t >= s.start * 4 && t < (s.start + s.bars) * 4;
    const secOf = t => secs.find(s => inSec(t, s));
    const scale = SC.map(x => (x + key) % 12);
    const diat = (root, step) => { const i = scale.indexOf(pc(root)); if (i < 0) return null; return scale[(i + step + 70) % 7]; };

    // ---- 1 HARMONIC RHYTHM (busier scenes): split one-bar chords with a passing chord on beat 3 that holds the melody note
    if (!jingle && e >= 2.5 && !careful) {
      const add = []; let n = 0;
      for (const c of P.chords) {
        if (c.d < 3.9 || c.sec === 'intro' || c.v7 || c.bII) continue;
        if (!R.chance(e >= 7 ? 0.9 : e >= 5 ? 0.75 : 0.55)) continue;
        const h = c.t + 2, mel = leadAt(P.lead, h + 0.01), r = c.tones[0];
        const cands = [1, -1, 3, -2, 2].map(st => { const rp = diat(r, st); if (rp == null) return null; const root = fit(rp + 48, [44, 56]), t3 = diat(rp, 2), t5 = diat(rp, 4); return [root, root + ((t3 - rp + 12) % 12), root + ((t5 - rp + 12) % 12)]; }).filter(Boolean);
        const ok = cands.filter(tn => !mel || tn.some(x => pc(x) === pc(mel.m)));
        if (!ok.length) continue;
        const common = tn => tn.filter(x => c.tones.some(y => pc(y) === pc(x))).length, tn = ok.slice().sort((a, b) => common(a) - common(b))[R.chance(0.7) ? 0 : Math.min(1, ok.length - 1)];
        c.d = 2; add.push({ ...c, t: h, d: 2, tones: tn, passing: true }); n++;
      }
      if (n) { P.chords = P.chords.concat(add).sort((a, b) => a.t - b.t); log.push(`HARMONIC RHYTHM: ${n} PASSING CHORDS ON BEAT 3 (EACH ONE HOLDS THE MELODY NOTE)`); }
    }

    // ---- 2 BASS MOTION: replace long held notes (never a pedal) with a pattern that fits the energy
    if (!careful) {
      const chordAt = t => { let c = null; for (const x of P.chords) { if (x.t <= t + 1e-6) c = x; else break; } return c; };
      const out = [], style = spb < 0.42 ? (e >= 6 ? 'octq' : 'halves') : e >= 8.5 ? 'octaves' : e >= 5.5 ? 'groove' : e >= 4.5 ? 'walk' : 'halves';
      let n = 0;
      for (const b of P.bass) {
        if (b.pedal || b.acc || b.d < 1.5 || (secOf(b.t) || {}).name === 'intro') { out.push(b); continue; }
        const c = chordAt(b.t + 0.01), r = fit(c ? c.tones[0] : b.m, [33, 47]), nx = chordAt(b.t + b.d + 0.01), rn = fit(nx ? nx.tones[0] : r, [33, 47]);
        const fifth = r + 7 > 52 ? r - 5 : r + 7, third = r + ((pc(diat(r, 2) == null ? r + 3 : diat(r, 2)) - pc(r) + 12) % 12);
        const v = b.v == null ? 0.9 : b.v, pat = [];
        if (style === 'octq') for (let t = 0; t < b.d - 0.01; t += 1) pat.push([t, 0.85, t % 2 ? r + 12 : r, t % 2 ? v * 0.85 : v]);
        else if (style === 'octaves') for (let t = 0; t < b.d - 0.01; t += 0.5) pat.push([t, 0.42, (t * 2) % 2 ? r + 12 : r, t % 1 ? v * 0.8 : v]);
        else if (style === 'groove') for (let t = 0; t < b.d - 0.01; t += 4) pat.push([t, 0.9, r, v], [t + 1, 0.45, fifth, v * 0.8], [t + 1.5, 0.45, r + 12, v * 0.85], [t + 2, 0.9, r, v * 0.95], [t + 3, 0.45, fifth, v * 0.8], [t + 3.5, 0.45, rn + (rn > r ? -1 : 1), v * 0.85]);
        else if (style === 'walk') { const w = [r, third, fifth, rn + (rn > r ? -1 : 1)]; for (let t = 0; t < b.d - 0.01; t += 1) pat.push([t, 0.9, w[Math.round(t) % 4], t % 2 ? v * 0.85 : v]); }
        else for (let t = 0; t < b.d - 0.01; t += 2) pat.push([t, 1.9, (t / 2) % 2 ? fifth : r, v]);
        for (const [dt, d, m, vv] of pat) if (dt < b.d - 0.05) out.push({ ...b, t: b.t + dt, d: Math.min(d, b.d - dt), m: fit(m, L.bass), v: vv, motion: true });
        n++;
      }
      if (n) { P.bass = out.sort((a, b) => a.t - b.t); log.push(`BASS MOTION (${style.toUpperCase()}): ${n} HELD NOTES BECAME A MOVING LINE`); }
    }

    // ---- 3 ARPEGGIOS under the melody, from the B section on (busier scenes; soft scenes get gentle eighths)
    if (!jingle && !careful && e >= (soft ? 2.5 : 4) && !(P.arp && P.arp.length)) {
      const want = e >= 7 ? 4 : e >= 5 ? 3 : e >= 3.5 ? 2 : 1.4, step = [0.25, 0.5, 1, 2].reduce((b, x) => Math.abs(1 / (x * spb) - want) < Math.abs(1 / (b * spb) - want) ? x : b, 0.5), from = (secs.find(s => s.name === 'B') || body[0] || secs[0]).start * 4, arp = [];
      const hurry = (sh.tools || []).includes('HURRY');
      for (const c of P.chords) {
        if (c.t < from) continue;
        if (hurry && P.counter.some(x => x.poly && Math.abs(x.t - c.t) < c.d)) continue;
        const ts = c.tones.slice(0, 3).map(x => fit(x + 12, [55, 79])).sort((a, b) => a - b), cyc = ts.concat([ts[0] + 12, ts[2], ts[1]]);
        for (let t = c.t, i = 0; t < c.t + c.d - 1e-6; t += step, i++) arp.push({ t, d: step * 0.85, m: fit(cyc[i % cyc.length], [52, 82]), v: i % (step < 0.5 ? 4 : 2) ? 0.5 : 0.62, arp: true });
      }
      if (arp.length) { P.arp = arp; log.push(`ARPEGGIOS: BROKEN CHORDS IN ${step < 0.5 ? 'SIXTEENTHS' : step < 1 ? 'EIGHTHS' : step < 2 ? 'QUARTERS' : 'HALF NOTES'} UNDER THE TUNE FROM ${secs.find(s => s.name === 'B') ? 'B' : 'THE TOP'} ON`); }
    }

    // ---- 3b TEMPO SANITY: any moving layer is judged in notes per SECOND. The composer's own arpeggiator and eighth-note
    // basses are thinned at fast tempos (real fast game music gets speed from tempo and accents, not from every 16th)
    { const nps = a => a.length / Math.max(1, song.totalBeats * spb);
      if (P.arp && P.arp.length && nps(P.arp) > 4.5) { const st = [0.25, 0.5, 1].find(x => 1 / (x * spb) <= 4.5) || 1, b4 = P.arp.length;
        P.arp = P.arp.filter(x => Math.abs(x.t / st - Math.round(x.t / st)) < 0.02).map(x => ({ ...x, d: Math.max(x.d, st * 0.85) })); log.push(`ARPEGGIO THINNED FOR THE TEMPO: ${b4} -> ${P.arp.length} NOTES (${(1 / (st * spb)).toFixed(1)} A SECOND)`); }
      if (spb < 0.42 && nps(P.bass) > 4) { const b4 = P.bass.length;
        P.bass = P.bass.filter(x => x.pedal || x.acc || Math.abs(x.t - Math.round(x.t)) < 0.02 || Math.abs((x.t % 4) - 3.5) < 0.02).map(x => ({ ...x, d: Math.max(x.d, Math.abs(x.t - Math.round(x.t)) < 0.02 ? 0.9 : 0.45) }));
        log.push(`BASS THINNED FOR THE TEMPO: ${b4} -> ${P.bass.length} NOTES (QUARTERS, AN EIGHTH PICKUP INTO EACH BAR)`); } }
    // ---- 4 MELODY PERSONALITY: pickups, grace notes, pushes, dotted rhythms, a closing trill
    const FL = sh.flourish == null ? 1 : sh.flourish;   // a theme wants FEW rhythms used consistently (catchy), so less ornament
    if (!careful) {
      const lead = P.lead, add = []; let pk = 0, gr = 0, pu = 0, dt = 0;
      const stepAbove = m => { for (let k = 1; k <= 2; k++) if (scale.includes(pc(m + k))) return m + k; return m + 2; };
      const stepBelow = m => { for (let k = 1; k <= 2; k++) if (scale.includes(pc(m - k))) return m - k; return m - 2; };
      for (let i = 1; i < lead.length; i++) {
        const a = lead[i - 1], b = lead[i], gap = b.t - (a.t + a.d);
        // a pickup: two eighths stepping up into a phrase that starts after a rest of a beat or more
        if (gap >= 1 && Math.abs(b.t % 4) < 1e-6 && R.chance(0.55 * FL)) { const m1 = stepBelow(stepBelow(b.m)), m2 = stepBelow(b.m); add.push({ ...b, t: b.t - 1, d: 0.45, m: m1, v: (b.v || 0.8) * 0.85, pick: true }, { ...b, t: b.t - 0.5, d: 0.45, m: m2, v: (b.v || 0.8) * 0.9, pick: true }); pk++; }
        // a grace note: a quick chirp from the step above, the 16-bit signature (busier scenes)
        else if (b.d >= 1.5 && e >= 4 && R.chance(0.1 * FL)) { add.push({ ...b, t: b.t, d: 0.12, m: stepAbove(b.m), v: (b.v || 0.8) * 0.8, grace: true }); b.t += 0.12; b.d -= 0.12; gr++; }
        // a push: a note on a downbeat arrives an eighth early (syncopation)
        else if (Math.abs(b.t % 4) < 1e-6 && i % 3 === 0 && gap <= 0 && a.d >= 1 && R.chance((e >= 5 ? 0.2 : 0.1) * FL)) { a.d -= 0.5; b.t -= 0.5; b.d += 0.5; pu++; }
      }
      // dotted rhythms: where four notes in a row share one length, make a pair long-short
      for (let i = 3; i < lead.length; i++) { const d = lead[i].d; if (d > 0.3 && [1, 2, 3].every(k => Math.abs(lead[i - k].d - d) < 0.02 && Math.abs(lead[i - k + 1].t - lead[i - k].t - d) < 0.02) && R.chance(0.5 * FL)) { const x = lead[i - 1], y = lead[i]; x.d = d * 1.5; y.t = x.t + d * 1.5; y.d = d * 0.5; dt++; i += 3; } }
      // a trill on the last long note of the song's final section (bright, energetic scenes)
      const fin = lead.filter(n => n.d >= 2).pop();
      if (fin && e >= 5 && M.bright >= 5 && R.chance(0.6)) { const up = stepAbove(fin.m), t0 = fin.t, n = Math.floor(Math.min(1.5, fin.d - 0.5) / 0.125); fin.t += n * 0.125; fin.d -= n * 0.125; for (let k = 0; k < n; k++) add.push({ ...fin, t: t0 + k * 0.125, d: 0.11, m: k % 2 ? up : fin.m, trill: true }); }
      if (add.length || pu || dt) { P.lead = lead.concat(add).sort((a, b) => a.t - b.t); log.push(`MELODY: ${pk} PICKUPS, ${gr} GRACE NOTES, ${pu} PUSHED NOTES, ${dt} DOTTED PAIRS${fin && add.some(x => x.trill) ? ', A CLOSING TRILL' : ''}`); }
    }

    // ---- 4a MELODY FILL: a tune sparser than its scene's target splits long, non-cadence notes evenly in two (a neighbor
    // tone or a repeat), so the rhythm stays consistent while the line keeps moving
    if (sh.npsMin && !careful) { const lead = P.lead, secs2 = song.totalBeats * spb, nps = () => lead.length / Math.max(1, secs2); let n = 0;
      const nb = m => { for (const k of [2, 1, -1, -2]) if (scale.includes(pc(m + k))) return m + k; return m; };
      for (let pass = 0; pass < 2 && nps() < sh.npsMin; pass++) for (let i = 0; i < lead.length && nps() < sh.npsMin; i++) { const x = lead[i]; if (x.d < 2 || ((x.t + x.d) % 16) < 0.01 || x.trill) continue; const h = x.d / 2; lead.splice(i + 1, 0, { ...x, t: x.t + h, d: h, m: R.chance(0.5) ? x.m : nb(x.m), fill: true }); x.d = h; i++; n++; }
      if (n) log.push(`MELODY FILL: ${n} LONG NOTES SPLIT (THE THEME KEEPS MOVING)`); }
    // ---- 4b MOTIF: a tune sticks when its rhythm comes back (real game melodies repeat a bar's rhythm ~65% of the time).
    // In every 4-bar phrase, bar 2 takes bar 1's rhythm (its own pitches, so the harmony still fits); bar 4 keeps its cadence
    if (!jingle && P.lead.length > 8) {
      let n = 0; const lead = P.lead;
      const barNotes = b => lead.filter(x => x.t >= b * 4 - 1e-6 && x.t < b * 4 + 4 - 1e-6 && !x.trill && !x.grace);
      // the period: in each 8 bars, bar 2 echoes bar 1 (and bar 3 sometimes); the answering phrase (bars 5-7) mirrors the
      // question's rhythms (bars 1-3); bars 4 and 8 keep their own cadences
      const pairs = []; for (const s of body) for (let b = s.start; b < s.start + s.bars; b += 8) { pairs.push([b, b + 1]); if (R.chance(0.4)) pairs.push([b, b + 2]); if (b + 7 < s.start + s.bars && R.chance(0.7)) pairs.push([b, b + 4], [b + 1, b + 5], [b + 2, b + 6]); }
      for (const [b, b2] of pairs) {
        const src = barNotes(b), dst = barNotes(b2); if (src.length < 2 || dst.length < 1 || src.length > 8) continue;
        const keep = new Set(dst);
        const fresh = src.map(x => { const rel = x.t - b * 4, near = dst.reduce((best, y) => Math.abs(y.t - b2 * 4 - rel) < Math.abs(best.t - b2 * 4 - rel) ? y : best, dst[0]); return { ...near, t: b2 * 4 + rel, d: x.d, m: near.m, motif: true }; });
        // where two echoed notes land on one pitch but the motif moved, step diatonically the way the motif went
        for (let k = 1; k < fresh.length; k++) { const dir = Math.sign(src[k].m - src[k - 1].m); if (dir && fresh[k].m === fresh[k - 1].m) { let m = fresh[k].m + dir; while (!scale.includes(pc(m))) m += dir; fresh[k].m = m; } }
        P.lead = P.lead.filter(x => !keep.has(x)).concat(fresh); n++;
      }
      if (n) { P.lead.sort((a, b) => a.t - b.t); log.push(`MOTIF: ${n} BARS TAKE UP THE RHYTHM OF THE BAR BEFORE (THE TUNE'S SIGNATURE COMES BACK)`); }
    }
    // ---- 5 CONTRAST: B moves its pads up an octave (bright) or down (dark); the last A lifts a whole step (energetic)
    if (!jingle) {
      const B = secs.find(s => s.name === 'B');
      if (B) { const up = M.bright >= 5; for (const c of P.chords) if (inSec(c.t, B)) c.tones = c.tones.map(x => x + (up ? 12 : -12)); log.push(`CONTRAST: THE B SECTION'S CHORDS MOVE ${up ? 'UP' : 'DOWN'} AN OCTAVE`); }
      const lastA = secs.filter(s => /^A/.test(s.name)).pop();
      if (lastA && lastA !== secs.find(s => s.name === 'A') && e >= 6 && !careful && R.chance(0.6)) {
        const t0 = lastA.start * 4, t1 = (lastA.start + lastA.bars) * 4;
        for (const k of ['lead', 'counter', 'bass', 'arp']) for (const x of P[k] || []) if (x.t >= t0 && x.t < t1 && x.m != null) x.m += 2;
        for (const c of P.chords) if (c.t >= t0 && c.t < t1) c.tones = c.tones.map(x => x + 2);
        M.lift = { at: lastA.name, semis: 2 }; log.push(`KEY LIFT: THE LAST ${lastA.name} RISES A WHOLE STEP`);
      }
    }

    // ---- 6 DRUMS: a fill at every 4th bar's end, a crash on section downbeats, and no two bars alike
    if (P.drums && P.drums.length && !careful) {
      let f = 0; const has = k => P.drums.some(d => d.kind === k);
      for (let b = 0; b * 4 < song.totalBeats; b++) {
        const s = secOf(b * 4); if (!s || s.name === 'intro') continue;
        if ((b - s.start) % 4 === 3) { const t0 = b * 4 + 3; P.drums = P.drums.filter(d => !(d.t >= t0 && d.t < t0 + 1 && d.kind !== 'kick')); const fk = has('tom') || e >= 5 ? 'tom' : 'snare';
          for (let k = 0; k < (e >= 6 ? 4 : 2); k++) P.drums.push({ t: t0 + k * (e >= 6 ? 0.25 : 0.5), kind: k % 2 && fk === 'tom' ? 'snare' : fk, m: 50 - k * 3, v: 0.75 + k * 0.07, fill: true }); f++; }
      }
      for (const s of body) if (!P.drums.some(d => d.kind === 'crash' && Math.abs(d.t - s.start * 4) < 0.01)) P.drums.push({ t: s.start * 4, kind: 'crash', v: 0.7 });
      // variation: every other bar, one off-beat ghost hit on the snare
      for (let b = 1; b * 4 < song.totalBeats; b += 2) if (R.chance(0.5) && secOf(b * 4) && secOf(b * 4).name !== 'intro') P.drums.push({ t: b * 4 + (R.chance(0.5) ? 1.75 : 3.75), kind: 'snare', v: 0.32, ghost2: true });
      P.drums.sort((a, b) => a.t - b.t);
      log.push(`DRUMS: ${f} FILLS, CRASHES ON EVERY SECTION, GHOST NOTES FOR VARIATION`);
    }
    M.motionLog = log;
    return log;
  }

  // ---- 7 ON TOP (runs after everything): no accompaniment note above the melody note it sounds against
  function onTop(song) {
    const P = song.parts, lead = P.lead; if (!lead || !lead.length) return 0; let n = 0;
    const fix = (x, isChord) => { const t = x.t + 0.01, l = leadAt(lead, t); if (!l) return; if (isChord) { x.tones = x.tones.map(m => { const top = (song.meta.orch ? (m < 48 ? m + 12 : m) : m + 12); if (top >= l.m - 1) { n++; return m - 12 * Math.ceil((top - l.m + 2) / 12); } return m; }); return; } if (x.m >= l.m - 1 && !x.swell && !x.rough) { let k = 0; while (x.m >= l.m - 1 && x.m - 12 >= 40 && k++ < 3) x.m -= 12; n++; } };
    for (const x of P.counter || []) fix(x, false);
    for (const x of P.arp || []) fix(x, false);
    for (const c of P.chords || []) fix(c, true);
    if (n) (song.meta.motionLog = song.meta.motionLog || []).push(`MELODY ON TOP: ${n} ACCOMPANIMENT NOTES MOVED BELOW THE TUNE`);
    return n;
  }
  LO.Motion = { apply, onTop };
})(typeof self !== 'undefined' ? self : globalThis);
