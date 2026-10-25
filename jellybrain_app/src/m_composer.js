/* STUDIO MIND - COMPOSER: the songwriter.
   Motif development (one small idea grown into a whole melody: sequence, inversion, fragmentation,
   augmentation), hook judging from earworm research (Jakubowski et al. 2016: a common rise-then-fall
   contour plus an unusual interval: a leap or extra repeated notes), call-and-response answers, and the
   80s sequencer riff. The core note writing lives in composer.js; this module chooses and develops. */
(function (G) {
  const LO = G.LO, M = 'COMPOSER';

  LO.Composer = {
    // how catchy is this phrase? 0..1 with the reasons
    hookScore(mel, lastPcs, key) {
      const ms = mel.map(n => n.m), n = ms.length; if (n < 3) return { score: 0.3, why: 'TOO SHORT' };
      const iv = []; for (let i = 1; i < n; i++) iv.push(ms[i] - ms[i - 1]);
      const range = Math.max(...ms) - Math.min(...ms);
      const steps = iv.filter(x => Math.abs(x) >= 1 && Math.abs(x) <= 2).length / iv.length;
      const reps = iv.filter(x => x === 0).length / iv.length;
      const leaps = iv.filter(x => Math.abs(x) >= 5 && Math.abs(x) <= 12).length, huge = iv.filter(x => Math.abs(x) > 12).length;
      const peak = ms.indexOf(Math.max(...ms)) / (n - 1);
      let s = 0; const why = [];
      if (range >= 5 && range <= 15) { s += 0.18; } else s -= 0.1;
      if (steps >= 0.45) { s += 0.18; why.push(`${Math.round(steps * 100)}% STEPWISE`); }
      if (leaps >= 1 && leaps <= 2) { s += 0.2; why.push(leaps === 1 ? 'ONE LEAP' : 'TWO LEAPS'); } else if (leaps > 3) s -= 0.1;
      if (huge) s -= 0.2 * huge;
      if (reps >= 0.08 && reps <= 0.35) { s += 0.12; why.push(`${Math.round(reps * 100)}% REPEATED NOTES`); }
      // the contour archetype the theme asked for (v0.5.1); a plain phrase still loves the rise-then-fall arch
      const arch = mel.arch || 'arch', lo = ms.indexOf(Math.min(...ms)) / (n - 1);
      if ((arch === 'arch' || arch === 'wave' || arch === 'plateau') && peak >= 0.2 && peak <= 0.75) { s += 0.18; why.push(arch === 'arch' ? 'RISE-THEN-FALL ARCH' : arch === 'wave' ? 'WAVE CONTOUR' : 'PLATEAU, THEN PEAK'); }
      else if (arch === 'rising' && peak >= 0.6) { s += 0.18; why.push('RISING LINE'); }
      else if (arch === 'falling' && peak <= 0.4 && lo >= 0.5) { s += 0.18; why.push('FALLING LINE'); }
      // GROOVE: a phrase that breathes or pushes is more human (rests and syncopations, in moderation)
      if (mel.some(x => x.push)) { s += 0.04; why.push('PUSHES'); }
      const endPc = ((ms[n - 1] - key) % 12 + 12) % 12;
      if (lastPcs && lastPcs.includes(endPc)) { s += 0.1; why.push('LANDS HOME'); }
      // rhythm memory: bar 1 and bar 2 share their rhythm
      const r = b => mel.filter(x => x.bar === b).map(x => x.d).join(',');
      if (r(0) && r(0) === r(1)) { s += 0.06; why.push('REPEATED RHYTHM'); }
      return { score: LO.clamp(s, 0, 1), why: why.join(', ') };
    },
    // does it fit the feeling? register and busyness against EMOTION's targets
    emotionFit(mel, center, E) {
      if (!E) return 0.5;
      const mean = mel.reduce((a, x) => a + x.m, 0) / mel.length;
      const want = center + E.register;
      const reg = 1 - LO.clamp(Math.abs(mean - want) / 10, 0, 1);
      const dens = mel.length / 4, wantD = 2 + E.a * 0.4;
      const den = 1 - LO.clamp(Math.abs(dens - wantD) / 4, 0, 1);
      return reg * 0.6 + den * 0.4;
    },
    choose(T, cands, label, fix) {
      cands.sort((a, b) => b.total - a.total);
      const pick = fix && fix.reseedMelody && cands.length > 1 ? cands[1] : cands[0];
      const KN = { classic: 'STRAIGHT PHRASE', sequence: 'MOTIF IN SEQUENCE', inversion: 'MOTIF TURNED UPSIDE DOWN', fragment: 'BROKEN-UP MOTIF', augment: 'STRETCHED-OUT MOTIF' };
      const fr = pick.fresh != null ? `, FRESH ${Math.round(pick.fresh * 100)}%` : '';
      const ln = pick.mel.nB && pick.mel.nB !== 4 ? ` ${pick.mel.nB}-BAR` : '';
      if (T) T.ev(M, 'work', 'HOOK', `${label}: TRIED ${cands.length} MELODIES, KEPT THE${ln} ${KN[pick.kind] || pick.kind.toUpperCase()} (HOOK ${Math.round(pick.hook.score * 100)}${fr}): ${pick.hook.why || 'BALANCED'}`, cands.length * 3);
      return pick;
    },
    prepare(T, P) {
      const bp = P.blueprint;
      T.ev(M, 'work', 'HARMONY', bp ? `WRITING IN THE ${bp.name} BLUEPRINT` : `WRITING ${P.purpose && P.purpose !== 'AUTO' ? P.purpose : 'GAME'} MUSIC`, 5);
      if (P._fix && P._fix.reroll) T.ev(M, 'work', 'RHYTHM', 'LISTENER HEARD A REPEAT: ROLLING A NEW SKELETON (GROOVE, SHAPE, SOUNDS)', 4);
      if (P._fix && P._fix.variety) { P.complex = Math.min(10, (P.complex == null ? 5 : P.complex) + 2); T.ev(M, 'work', 'ANSWERS', 'LISTENER SAID IT DRAGGED: ADDING MORE MOVEMENT AND ANSWERS', 3); }
      if (bp && bp.riff) T.ev(M, 'work', 'RHYTHM', 'THIS STYLE LIVES ON A REPEATING SYNTH RIFF: WRITING ONE', 2);
      const fx = P._fix || {};
      if (fx.pushes) T.ev(M, 'work', 'GROOVE', 'LISTENER SAID TOO SQUARE: ADDING PUSHES AND OFF-BEAT STARTS', 3);
      if (fx.steady) T.ev(M, 'work', 'GROOVE', 'LISTENER SAID TOO JUMPY: STEADYING THE RHYTHM', 3);
      if (fx.breath) T.ev(M, 'work', 'GROOVE', 'LISTENER SAID NO BREATH: LETTING THE MELODY REST', 3);
      if (fx.fill) T.ev(M, 'work', 'GROOVE', 'LISTENER SAID TOO MANY HOLES: FILLING THE LINE', 3);
      const loved = (P.loved || (P.history || []).filter(h => h && h.love)).filter(h => h && h.g);
      if (loved.length && P.groove !== 0) T.ev(M, 'work', 'GROOVE', `${loved.length} SONG${loved.length === 1 ? '' : 'S'} YOU LOVED: PULLING THE GROOVE HALFWAY TOWARD YOUR TASTE`, 3);
    },
    finish(T, song, P) {
      const parts = song.parts, bars = song.bars, NB = bars.length, key = song.meta.key, R = LO.rng((song.seed >>> 0) ^ 0xC0DE);
      const bp = P.blueprint;
      T.ev(M, 'work', 'HARMONY', `${bars.length} BARS IN ${song.meta.keyName} ${song.meta.mode.toUpperCase()} AT ${song.meta.displayBpm || song.meta.bpm} BPM${song.meta.meter === '3/4' ? ' IN 3/4 WALTZ TIME' : song.meta.meter === 'shuffle' ? ' WITH A SHUFFLE FEEL' : ''}, ${song.meta.form.toUpperCase()} FORM`, 6);
      const vv = song.meta.variety || {}; T.ev(M, 'work', 'RHYTHM', `SKELETON: GROOVE ${vv.drum}, SHAPE ${vv.form}, ${String(vv.voicing || '').toUpperCase()} VOICING, ${String(vv.lead || '').toUpperCase()} LEAD, ${String(vv.bass || '').toUpperCase()} BASS`, 4);
      if (song.meta.surpriseName) T.ev(M, 'work', 'HARMONY', `SURPRISE CHORD READY: ${song.meta.surpriseName}`, 2);
      // the 80s sequencer riff
      if (bp && bp.riff && !song.meta.form.startsWith('jingle') && song.meta.meter !== '3/4') {
        const T8 = [[0, 12, 0, 12, 7, 12, 0, 10], [0, 0, 12, 0, 10, 0, 7, 5], [0, 7, 12, 7, 0, 7, 12, 15], [0, 12, 10, 12, 7, 12, 5, 7], [0, 3, 7, 12, 7, 3, 0, -2]];
        const pat = R.pick(T8); const riff = [];
        bars.forEach((b, i) => { if (b.sec === 'outro' || (b.sec === 'intro' && b.idx < Math.floor(song.sections[0].bars / 2))) return; pat.forEach((iv, k) => riff.push({ t: i * 4 + k * 0.5, d: 0.42, m: b.root + 24 + iv, v: k === 0 ? 0.9 : 0.72, sec: b.sec })); });
        parts.arp = riff; song.meta.riff = true;
        T.ev(M, 'work', 'RHYTHM', `WROTE A ONE-BAR RIFF (${pat.map(x => (x >= 0 ? '+' : '') + x).join(' ')}), PLAYED ${riff.length} TIMES THROUGH THE SONG`, 8);
      }
      // call and response: short answers in the gaps of the melody
      const cx = P.complex == null ? 5 : P.complex;
      if (cx >= 4 && !song.meta.form.startsWith('jingle')) {
        const lead = parts.lead.slice().sort((a, b) => a.t - b.t), ans = [];
        const OR = song.meta.orch, roles = OR ? OR.roles : null;
        const okSec = s => roles ? (!!roles[s] && !roles[s].cp && !roles[s].double && !roles[s].hand && (s === 'A' || s === 'A2' || (cx >= 7 && s === 'B'))) : (s === 'A' || s === 'A2' || (cx >= 7 && s === 'B'));
        const enter = roles && roles.A && roles.A.enterCounter != null ? roles.A.enterCounter * 4 : -1;
        for (let i = 0; i < lead.length - 1; i++) {
          const end = lead[i].t + lead[i].d, gap = lead[i + 1].t - end;
          const b = bars[Math.min(NB - 1, Math.floor(end / 4))];
          if (gap < 1.5 || !okSec(b.sec) || !R.chance(0.55) || (roles && b.sec === 'A' && end < enter)) continue;
          const pcs = b.chord.map(x => ((x % 12) + 12) % 12), from = lead[i].m;
          const tones = []; for (let c = from - 3; c >= from - 12 && tones.length < 3; c--) if (pcs.includes(((c - key) % 12 + 12) % 12) && (!roles || c >= LO.LANES.counter[0])) tones.push(c);
          if (tones.length < 2) continue;
          const rh = gap >= 2.5 ? [0.5, 0.5, 1] : [0.5, 0.75];
          let t = end + 0.25; rh.forEach((d, k) => { if (t + d <= lead[i + 1].t - 0.1 && tones[k] != null) ans.push({ t, d: d * 0.9, m: tones[k], v: 0.62, answer: true }); t += d; });
        }
        const r = LO.gapFill(parts.counter, ans, 0.02);
        T.ev(M, 'work', 'ANSWERS', r.placed ? `CALL AND RESPONSE: ${r.placed} ANSWER NOTES IN THE MELODY'S GAPS` : 'THE MELODY LEAVES NO BIG GAPS: NO ANSWERS NEEDED', Math.ceil(r.placed / 4) + 2);
      }
      T.ev(M, 'work', 'RHYTHM', `GROOVE: ${parts.drums.length} DRUM HITS, BASS STYLE ${String(song.meta.vector.bassStyle).toUpperCase()}`, 4);
      const O = song.meta.orch;
      if (O) {
        const RN = { melody: 'MELODY', answer: 'ANSWERS', hold: 'HOLDS', drive: 'DRIVES' };
        const sheet = song.sections.map(s => { const r = O.roles[s.name]; if (!r) return null; return `${s.name.toUpperCase()}: ${r.melody ? (r.hand ? 'COUNTER VOICE TAKES THE TUNE' : r.double ? 'TUTTI, TUNE IN OCTAVES' : 'LEAD HAS THE TUNE') : 'NO TUNE'}${r.cp ? ', COUNTER-MELODY' : r.answer ? ', ANSWERS' : ''}, ${r.perc} PERCUSSION`; }).filter(Boolean);
        T.ev(M, 'work', 'ANSWERS', `ROLE SHEET (EPIC ${O.epic}): ${sheet.join('; ')}`, 6 + sheet.length);
        if (O.cp) T.ev(M, 'work', 'ANSWERS', `REAL COUNTERPOINT: ${O.cp} NOTES WRITTEN AGAINST THE TUNE (CONTRARY MOTION FIRST, NO PARALLEL 5THS OR OCTAVES)`, 4 + Math.ceil(O.cp / 8));
        if (O.handed) T.ev(M, 'work', 'ANSWERS', `MELODY HAND-OFF: ${O.handed} NOTES OF THE TUNE MOVE TO THE SECOND INSTRUMENT ON THE REPEAT`, 3);
        if (O.doubled) T.ev(M, 'work', 'ANSWERS', `CLIMAX: THE TUNE DOUBLED AN OCTAVE BELOW (${O.doubled} NOTES)`, 3);
        T.ev(M, 'work', 'MOTIF', `REGISTER LANES: ${O.lanes} NOTES FOLDED INTO THEIR ROLE'S RANGE, ${O.masked} MOVED OFF THE TUNE`, 3);
        if (O.entrances.length) T.ev(M, 'work', 'ANSWERS', `STAGGERED ENTRANCES: ${O.entrances.join(', ')}`, 2);
        if (O.perc.timp) T.ev(M, 'work', 'RHYTHM', `ORCHESTRAL PERCUSSION: ${O.perc.timp} TIMPANI STROKES, ${O.perc.rolls} ROLLS INTO CADENCES, ${O.perc.swells} CYMBAL SWELL${O.perc.swells === 1 ? '' : 'S'}, ${O.perc.snare} SNARE HITS ONLY WHERE IT DRIVES`, 5);
      }
      const GQ = song.meta.groove;
      if (GQ && GQ.themeForm) T.ev(M, 'work', 'MOTIF', GQ.themeForm === 'period' ? 'THEME A IS A PERIOD: THE FIRST PHRASE ENDS OPEN, THE ANSWER STARTS THE SAME WAY AND CLOSES ON HOME' : 'THEME A IS A SENTENCE: AN IDEA, ITS REPEAT, THEN IT BREAKS UP INTO THE CADENCE', 4);
      if (GQ && GQ.expect && GQ.expect.length) T.ev(M, 'work', 'HOOK', `EXPECTATION: ${GQ.expect.map(e => `${e.label} ${e.mean} BITS, ${e.peaks} SURPRISE${e.peaks === 1 ? '' : 'S'}`).join('; ')}`, 3 + GQ.expect.length);
      const G = song.meta.groove;
      if (G) {
        T.ev(M, 'work', 'GROOVE', `FEEL TARGETS: SYNCOPATION ${Math.round(G.sync * 100)}%, BREATH ${Math.round(G.breath * 100)}%, ${G.laidBack ? 'LAID BACK' : 'ON TOP OF THE BEAT'}`, 3);
        if (G.phrases) T.ev(M, 'work', 'GROOVE', `PHRASES ${G.phrases.A} BARS (THEME A), ${G.phrases.B} (THEME B), CONTOURS ${String(G.arcs.A).toUpperCase()} AND ${String(G.arcs.B).toUpperCase()}`, 4);
        T.ev(M, 'work', 'GROOVE', `${G.pushes} PUSHES ACROSS THE BEAT, ${G.pickups} PICKUP${G.pickups === 1 ? '' : 'S'} INTO PHRASES`, 2 + G.pushes);
        if (G.vars.length) T.ev(M, 'work', 'GROOVE', `NO EXACT REPEATS: ${G.vars.slice(0, 4).join(', ').toUpperCase()}${G.vars.length > 4 ? ` (+${G.vars.length - 4} MORE)` : ''}`, 2 + G.vars.length);
        if (G.ghosts || G.bassGhosts || G.rolls) T.ev(M, 'work', 'GROOVE', `${G.ghosts} GHOST SNARES, ${G.bassGhosts} BASS GHOST NOTES, ${G.rolls} HAT ROLL${G.rolls === 1 ? '' : 'S'}`, 2 + Math.ceil((G.ghosts + G.bassGhosts) / 6));
      }
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
