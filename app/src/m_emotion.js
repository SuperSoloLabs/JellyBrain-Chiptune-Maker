/* STUDIO MIND - EMOTION: what the music feels like, and the journey it takes.
   Cue rules: Eerola, Friberg & Bresin 2013 (mode and tempo carry the most; register, dynamics, articulation
   and timbre add on top). Goosebump moments: Sloboda 1991 (new or unprepared harmony, texture change),
   Panksepp 1995 / Grewe 2007 (crescendos, new voices entering), Guhn 2007 (range expanding). */
(function (G) {
  const LO = G.LO, M = 'EMOTION';

  // section energy shapes for each arc (0..1), Emotion's plan for how the song should feel over time
  const ARCS = {
    'BUILD AND RELEASE': { intro: 0.35, build: 0.6, A: 0.75, B: 0.7, break: 0.4, A2: 1.0, outro: 0.45 },
    'RISE': { intro: 0.3, build: 0.45, A: 0.55, B: 0.65, break: 0.5, A2: 0.95, outro: 0.6 },
    'FLOAT': { intro: 0.4, build: 0.5, A: 0.6, B: 0.62, break: 0.5, A2: 0.7, outro: 0.4 },
    'DESCENT': { intro: 0.55, build: 0.6, A: 0.8, B: 0.7, break: 0.45, A2: 0.85, outro: 0.3 },
  };

  function baseFeeling(P) {
    if (P.valence != null && P.arousal != null) return { v: +P.valence, a: +P.arousal, src: 'YOUR EMOTION PAD' };
    const pur = LO.PURPOSES[P.purpose] || null;
    const m = (k, d) => LO.clamp((P[k] == null ? 5 : P[k]) + (pur && pur[k] ? pur[k] : 0) * (P[k] == null || P[k] === 5 ? 1 : 0.5), 0, 10);
    if (P.blueprint && !pur) {
      const bp = P.blueprint, dark = (bp.modes || []).every(x => ['minor', 'phrygian', 'dorian'].includes(x));
      const tempo = (bp.bpm[0] + bp.bpm[1]) / 2;
      return { v: dark ? 3.8 : 6, a: LO.clamp((tempo - 60) / 11, 1, 9.5), src: 'THE STYLE ITSELF' };
    }
    return { v: m('bright'), a: m('intense'), src: pur ? P.purpose + ' MUSIC' : 'THE MOOD SLIDERS' };
  }

  LO.Emotion = {
    ARCS,
    plan(T, P) {
      const f = baseFeeling(P);
      let v = f.v, a = f.a, nudged = false;
      if (T.color && T.color.nudge && (T.color.nudge.v || T.color.nudge.a)) { v += T.color.nudge.v; a += T.color.nudge.a; nudged = true; }
      v = LO.clamp(v, 0, 10); a = LO.clamp(a, 0, 10);
      T.ev(M, 'work', 'FEELING', `READING THE FEELING FROM ${f.src}`, 4);
      const E = this.targets(v, a);
      E.src = f.src; E.nudged = nudged; E.userFeeling = P.valence != null && P.arousal != null;
      // the journey
      let arc = 'BUILD AND RELEASE';
      if (a <= 3.5) arc = 'FLOAT'; else if (v <= 2.5) arc = 'DESCENT'; else if (v >= 3 && v <= 6.5 && a < 6.5) arc = 'RISE';
      E.arc = arc; E.energy = { ...ARCS[arc] };
      const boost = P._fix && P._fix.emotionBoost;
      if (boost) for (const k in E.energy) E.energy[k] = LO.clamp(0.55 + (E.energy[k] - 0.55) * 1.35, 0.15, 1);
      T.ev(M, 'work', 'ARC', `THE JOURNEY: ${arc}${boost ? ' (MORE CONTRAST THIS TIME)' : ''}`, 7);
      // goosebump moments, chosen from what research says causes chills
      const R = LO.rng((P.seed >>> 0) ^ 0xE40710);
      const pool = [
        ['NEW VOICE', 'A SECOND VOICE JOINS WHEN THE MAIN THEME RETURNS'],
        ['SILENCE', 'ONE BEAT OF SILENCE RIGHT BEFORE THE DROP'],
        ['CRESCENDO', 'A SWELL INTO THE RETURN OF THE THEME'],
        ['UNPREPARED HARMONY', 'A CHORD NOBODY SEES COMING IN THE MIDDLE'],
        ['KEY LIFT', 'THE WHOLE SONG STEPS UP A KEY FOR THE FINALE'],
        ['RANGE EXPANDS', 'THE MELODY JUMPS AN OCTAVE AT THE CLIMAX'],
      ];
      const weights = [1.2, a >= 5 ? 1.4 : 0.5, 1.2, 0.6 + (P.surprise == null ? 0.5 : P.surprise / 10), arc === 'RISE' || v >= 6 ? 1.3 : 0.4, a >= 5 ? 1.1 : 0.4];
      let n = LO.clamp(2 + Math.round(a / 4), 2, 4); if (boost) n = 4;
      const moments = []; const avail = pool.map((p, i) => i);
      for (let k = 0; k < n && avail.length; k++) {
        const w = avail.map(i => weights[i]); const pick = R.pick(avail, w); avail.splice(avail.indexOf(pick), 1); moments.push(pool[pick][0]);
        T.ev(M, 'work', 'GOOSEBUMPS', 'GOOSEBUMP MOMENT: ' + pool[pick][1], 3);
      }
      if (boost) for (const must of ['SILENCE', 'CRESCENDO']) if (!moments.includes(must)) moments.push(must);
      E.moments = moments;
      T.emotion = E;
      return E;
    },
    targets(v, a) {
      // cue targets: register up with brightness, dynamics and density up with energy, legato when calm
      return {
        v, a, label: LO.emotionLabel(v, a),
        register: Math.round((v - 5) * 0.8 + (a - 5) * 0.3),
        legato: LO.clamp(1 - a / 11 + (v < 4 ? 0.1 : 0), 0.2, 1),
        dynamics: LO.clamp(0.72 + a * 0.028, 0.72, 1),
        brightness: LO.clamp(0.72 + v * 0.03 + a * 0.025, 0.7, 1.3),
        tempo: 1 + (a - 5) * 0.012,
      };
    },
    retarget(T) {
      const E = T.emotion; if (!E || !T.color || !T.color.nudge) return;
      const v = LO.clamp(E.v + T.color.nudge.v, 0, 10), a = LO.clamp(E.a + T.color.nudge.a, 0, 10);
      const keep = { arc: E.arc, energy: E.energy, moments: E.moments, src: E.src, userFeeling: E.userFeeling };
      T.emotion = { ...this.targets(v, a), ...keep, nudged: true };
    },
    applyToParams(T, P) {
      const E = T.emotion; if (!E) return;
      if (E.userFeeling || E.nudged) { P.valence = E.v; P.arousal = E.a; }
      if (E.moments.includes('KEY LIFT') && P.lift == null) P.lift = true;
      if (E.moments.includes('UNPREPARED HARMONY')) P.surprise = Math.max(P.surprise == null ? 5 : P.surprise, 7);
      if (E.moments.includes('NEW VOICE')) P.complex = Math.max(P.complex == null ? 5 : P.complex, 5);
      T.ev(M, 'talk', 'FEELING', `TELLING THE COMPOSER: ${E.label}, REGISTER ${E.register >= 0 ? '+' : ''}${E.register}, ${E.legato > 0.7 ? 'SMOOTH AND CONNECTED' : E.legato < 0.45 ? 'SHORT AND PUNCHY' : 'BALANCED'} PHRASING`, 2, { to: 'COMPOSER' });
    },
    // after the notes exist: dynamics, phrasing and the goosebump moments, done for real on the note data
    shape(T, song, P) {
      const E = T.emotion; if (!E) return;
      const parts = song.parts, NB = song.bars.length;
      const secAt = t => song.bars[Math.min(NB - 1, Math.max(0, Math.floor(t / 4)))].sec;
      let touched = 0;
      for (const nm of ['lead', 'counter', 'arp', 'bass']) for (const n of parts[nm] || []) {
        const e = E.energy[secAt(n.t)] == null ? 0.7 : E.energy[secAt(n.t)];
        n.v = LO.clamp((n.v == null ? 1 : n.v) * (0.62 + 0.42 * e) * E.dynamics / 0.86, 0.15, 1); touched++;
      }
      for (const d of parts.drums) { const e = E.energy[secAt(d.t)] == null ? 0.7 : E.energy[secAt(d.t)]; d.v = LO.clamp(d.v * (0.8 + 0.25 * e), 0.1, 1); touched++; }
      let art = 0;
      for (const n of parts.lead) if (!n.slide && n.d <= 1.5) { n.d *= 0.7 + 0.32 * E.legato; art++; }
      T.ev(M, 'work', 'DYNAMICS', `SHAPED ${touched} NOTES TO THE ARC, PHRASED ${art} MELODY NOTES`, Math.round(touched / 20));
      const sec2 = song.sections.find(s => s.name === 'A2');
      if (!sec2 || song.meta.form.startsWith('jingle')) { T.ev(M, 'work', 'GOOSEBUMPS', 'SHORT PIECE: NO ROOM FOR A BIG MOMENT, KEEPING IT TIGHT', 1); E.placed = []; return; }
      const drop = sec2.start * 4; E.placed = [];
      for (const m of E.moments) {
        if (m === 'SILENCE') {
          let cut = 0;
          for (const nm of ['lead', 'counter', 'arp', 'bass']) {
            parts[nm] = (parts[nm] || []).filter(n => { if (n.t >= drop - 1 && n.t < drop) { cut++; return false; } return true; });
            for (const n of parts[nm]) if (n.t < drop - 1 && n.t + n.d > drop - 1) n.d = drop - 1 - n.t;
          }
          parts.drums = parts.drums.filter(d => { if (d.t >= drop - 1 && d.t < drop && d.kind !== 'riser') { cut++; return false; } return true; });
          E.placed.push({ kind: m, bar: sec2.start }); T.ev(M, 'work', 'GOOSEBUMPS', `CLEARED THE BEAT BEFORE BAR ${sec2.start + 1}: ${cut} NOTES HOLD THEIR BREATH`, 4);
        } else if (m === 'CRESCENDO') {
          const from = drop - 8; let c = 0;
          for (const nm of ['lead', 'counter', 'arp', 'bass']) for (const n of parts[nm] || []) if (n.t >= from && n.t < drop) { n.v = LO.clamp(n.v * (0.6 + 0.45 * (n.t - from) / 8), 0.1, 1); c++; }
          for (const d of parts.drums) if (d.t >= from && d.t < drop) { d.v = LO.clamp(d.v * (0.55 + 0.5 * (d.t - from) / 8), 0.1, 1); c++; }
          E.placed.push({ kind: m, bar: sec2.start }); T.ev(M, 'work', 'GOOSEBUMPS', `SWELL: ${c} NOTES RISE OVER TWO BARS INTO THE RETURN`, 3);
        } else if (m === 'RANGE EXPANDS') {
          const ML = song.meta.orch && LO.melodyLine ? LO.melodyLine(parts) : parts.lead;   // the tune, wherever the orchestra put it
          const inA2 = ML.filter(n => n.t >= drop + sec2.bars * 2 && n.t < drop + sec2.bars * 4);
          const maxA = Math.max(0, ...ML.filter(n => n.t < drop).map(n => n.m));
          const maxA2 = Math.max(0, ...inA2.map(n => n.m));
          if (inA2.length && maxA2 <= maxA && maxA2 + 12 <= 96) { for (const n of inA2) n.m += 12; if (song.meta.orch) for (const n of parts.counter) if (n.dbl && n.t >= drop + sec2.bars * 2 && n.t < drop + sec2.bars * 4) n.m += 12; E.placed.push({ kind: m, bar: sec2.start + Math.floor(sec2.bars / 2) }); T.ev(M, 'work', 'GOOSEBUMPS', `MELODY LEAPS AN OCTAVE AT BAR ${sec2.start + Math.floor(sec2.bars / 2) + 1}`, 3); }
          else T.ev(M, 'work', 'GOOSEBUMPS', 'MELODY IS ALREADY HIGH AT THE CLIMAX: NO EXTRA LEAP NEEDED', 1);
        } else if (m === 'NEW VOICE') {
          const has = (parts.counter || []).some(n => n.t >= drop && n.t < drop + 16);
          if (!has) {
            let added = 0;
            for (const n of parts.lead.filter(x => x.t >= drop && x.t < drop + sec2.bars * 4)) {
              const b = song.bars[Math.min(NB - 1, Math.floor(n.t / 4))]; const pcs = b.chord.map(x => ((x % 12) + 12) % 12), key = song.meta.key;
              let h = n.m - 3; for (let c = n.m - 3; c >= n.m - 8; c--) if (pcs.includes(((c - key) % 12 + 12) % 12)) { h = c; break; }
              parts.counter.push({ t: n.t, d: n.d, m: h, v: 0.6 * n.v, slide: n.slide }); added++;
            }
            parts.counter.sort((x, y) => x.t - y.t);
            T.ev(M, 'work', 'GOOSEBUMPS', `A HARMONY VOICE ENTERS AT BAR ${sec2.start + 1} (${added} NOTES)`, 3);
          } else T.ev(M, 'work', 'GOOSEBUMPS', `THE COMPOSER ALREADY BRINGS A SECOND VOICE IN AT BAR ${sec2.start + 1}`, 1);
          E.placed.push({ kind: m, bar: sec2.start });
        } else if (m === 'KEY LIFT') {
          if (song.meta.lift) { E.placed.push({ kind: m, bar: sec2.start }); T.ev(M, 'work', 'GOOSEBUMPS', `KEY LIFT CONFIRMED AT BAR ${sec2.start + 1}`, 1); }
          else T.ev(M, 'work', 'GOOSEBUMPS', 'THIS FORM HAS NO ROOM FOR A KEY LIFT: SKIPPED', 1);
        } else if (m === 'UNPREPARED HARMONY') {
          const sb = song.bars.findIndex(b => b.surprise);
          if (sb >= 0) { E.placed.push({ kind: m, bar: sb }); T.ev(M, 'work', 'GOOSEBUMPS', `SURPRISE CHORD LANDS AT BAR ${sb + 1}: ${song.meta.surpriseName}`, 1); }
          else T.ev(M, 'work', 'GOOSEBUMPS', 'NO SPOT FOR A SURPRISE CHORD IN THIS FORM', 1);
        }
      }
      // the producer's trick for a drop that has to land: strip the two bars before it so the return hits harder
      if (P._fix && P._fix.emotionBoost && sec2.start >= 3) {
        const from = drop - 8; let cut = 0;
        for (const nm of ['arp', 'counter']) parts[nm] = (parts[nm] || []).filter(n => { if (n.t >= from && n.t < drop) { cut++; return false; } return true; });
        parts.drums = parts.drums.filter(d => { if (d.t >= from && d.t < drop && ['hat', 'ohat', 'rim', 'kick'].includes(d.kind) && !d.layer) { cut++; return false; } return true; });
        for (const n of parts.bass) if (n.t >= from && n.t < drop) n.v *= 0.55;
        T.ev(M, 'work', 'GOOSEBUMPS', `LISTENER'S NOTE TAKEN: STRIPPED THE 2 BARS BEFORE BAR ${sec2.start + 1} (${cut} NOTES) SO THE RETURN HITS HARDER`, 6);
      }
      for (const nm of ['lead', 'counter', 'arp', 'bass']) parts[nm] = (parts[nm] || []).filter(n => n.d > 0.02);
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
