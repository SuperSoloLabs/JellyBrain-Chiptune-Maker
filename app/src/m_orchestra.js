/* LowOrbit Chip Studio - THE ORCHESTRA (v0.6.1): the arranger inside the Composer.
   A role sheet per section (who has the melody, who answers, who holds, who drives, which percussion),
   melody hand-offs on repeats, staggered entrances, tutti at the climax and 2-3 voices when quiet
   (Rimsky-Korsakov, Principles of Orchestration). Register lanes so no two parts mask each other, a real
   counter-melody written note by note against the tune (contrary motion first, no parallel 5ths or octaves,
   short runs of 3rds and 6ths only, it moves when the melody rests and holds when the melody is busy:
   Huron, Voice Leading), and orchestral percussion: timpani on the phrase starts, rolls into cadences,
   cymbal swells into the climax, snare only where the music drives (SNES-era arranging practice). */
(function (G) {
  const LO = G.LO;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // register lanes (MIDI notes): each role lives in its own range
  const LANE = { bass: [28, 52], pad: [48, 72], melody: [60, 91], counter: [50, 79], arp: [67, 96] };
  LO.LANES = LANE;
  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

  // the melody note sounding at time t (binary search over a sorted list)
  function at(list, t) {
    let lo = 0, hi = list.length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].t <= t + 1e-6) { best = list[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best && t < best.t + best.d - 1e-6 ? best : null;
  }
  function onsetAt(list, t) { return list.some(n => Math.abs(n.t - t) < 0.06); }

  // ---- REAL COUNTERPOINT: a second line written against the melody, one decision at a time
  function counterpoint(c, mel, sec, lane) {
    const { bars, key, SC, R } = c;
    const pcRel = m => ((m - key) % 12 + 12) % 12;
    const scale = []; for (let m = lane[0]; m <= lane[1]; m++) if (SC.includes(pcRel(m))) scale.push(m);
    // a 3/4 bar is stored as 4 units: its beats fall every 4/3 units
    const step = c.waltz ? (c.complex >= 6 ? 2 / 3 : 4 / 3) : (c.complex >= 6 ? 0.5 : 1), t0 = sec.start * 4, t1 = (sec.start + sec.bars) * 4;
    const out = []; let prev = null, prevIv = null, prevLead = null, run = 0, lastLeap = 0;
    for (let t = t0; t < t1 - 1e-6; t += step) {
      const b = bars[Math.min(bars.length - 1, Math.floor(t / 4))], pos = t - Math.floor(t / 4) * 4;
      const down = pos < 1e-6 || pos > 4 - 1e-6, strong = down || (!c.waltz && Math.abs(pos - 2) < 1e-6);
      const ln = at(mel, t), lOn = onsetAt(mel, t);
      // rhythm: move on the downbeat, in the melody's rests, and under its long notes; hold while it is busy
      const busy = ln && lOn && ln.d < 1;
      const longUnder = ln && !lOn && (t - ln.t) >= 0.99;
      const rest = !ln;
      if (!down && !(rest || longUnder || (strong && ln && ln.d >= 1.5))) continue;
      if (!down && busy) continue;
      const pcs = b.chord.map(x => ((x % 12) + 12) % 12);
      const top = ln ? Math.min(lane[1], ln.m - 3) : lane[1];
      let best = null, bs = 1e9;
      for (const m of scale) {
        if (m > top) continue;
        const pr = pcRel(m), chordTone = pcs.includes(pr);
        if (strong && !chordTone) continue;
        let s = 0;
        if (ln) {
          const iv = ((ln.m - m) % 12 + 12) % 12;
          if ([1, 2, 6, 10, 11].includes(iv)) s += strong ? 9 : 2.5;          // dissonance on a strong beat: no
          else if (iv === 0) s += 1.5; else if ([3, 4, 8, 9].includes(iv)) s -= 1;  // imperfect consonances sing best
          if (prev != null && prevLead != null) {
            const lm = Math.sign(ln.m - prevLead), cm = Math.sign(m - prev);
            if (lm && cm && lm === -cm) s -= 1.6;                              // contrary motion: most independent
            else if (!lm || !cm) s -= 0.5;                                     // oblique
            if (prevIv != null && iv === prevIv && (iv === 0 || iv === 7) && lm && lm === cm) s += 12;   // parallel 5ths / octaves
            if (prevIv != null && [3, 4, 8, 9].includes(iv) && [3, 4, 8, 9].includes(prevIv) && lm && lm === cm && run >= 2) s += 3;  // long runs of 3rds / 6ths
          }
        } else if (chordTone) s -= 0.6;
        if (prev != null) {
          const lp = Math.abs(m - prev);
          s += lp === 0 ? 1.2 : lp <= 2 ? -0.7 : lp <= 4 ? 0 : lp <= 7 ? 1.6 : 5;
          if (lastLeap >= 5 && (Math.sign(m - prev) === Math.sign(lastLeap * 1) || lp > 2)) s += 2.5;   // after a leap, step back
        }
        s += Math.abs(m - (lane[0] + lane[1]) / 2) * 0.06 + R.range(0, 0.5);
        if (s < bs) { bs = s; best = m; }
      }
      if (best == null) continue;
      if (out.length) { const o = out[out.length - 1]; o.d = Math.max(0.2, t - o.t - 0.05); }
      const iv = ln ? ((ln.m - best) % 12 + 12) % 12 : null;
      run = (iv != null && prevIv != null && [3, 4, 8, 9].includes(iv) && [3, 4, 8, 9].includes(prevIv)) ? run + 1 : 0;
      lastLeap = prev != null ? best - prev : 0;
      out.push({ t, d: step, m: best, v: strong ? 0.72 : 0.64, cp: true, sec: sec.name });
      prev = best; prevIv = iv; prevLead = ln ? ln.m : prevLead;
    }
    if (out.length) { const o = out[out.length - 1]; o.d = Math.max(0.25, t1 - o.t - 0.1); }
    return out;
  }

  LO.Orchestra = {
    apply(c) {
      const { parts, bars, sections, R } = c, NB = bars.length;
      const epic = c.epic != null ? clamp(c.epic, 0, 10) : clamp(Math.round(1.5 + c.heroic * 0.35 + c.intense * 0.4), 0, 10);
      const rep = { epic, roles: {}, lanes: 0, masked: 0, cp: 0, handed: 0, doubled: 0, perc: { timp: 0, rolls: 0, swells: 0, snare: 0 }, entrances: [] };
      // ---- the role sheet
      for (const s of sections) {
        const r = { melody: 'LEAD', answer: null, hold: 'PADS', drive: 'BASS', perc: 'BASE', cp: false, hand: false, double: false, voices: 0 };
        if (s.name === 'intro') { r.melody = null; r.perc = 'LIGHT'; }
        else if (s.name === 'A') { r.answer = 'COUNTER'; r.enterCounter = s.start + Math.min(2, s.bars - 1); }
        // a big song hands the B tune to the second instrument (the first one sings against it) and saves the
        // tutti for A2; a small song keeps the tune on the lead in B with a counter-melody, and hands off in A2
        else if (s.name === 'B') { r.perc = c.intense >= 5 || epic >= 7 ? 'DRIVE' : 'BASE'; r.cp = true; if (epic >= 6) r.hand = true; }
        else if (s.name === 'break') { r.perc = 'LIGHT'; r.drive = null; r.hold = 'PADS'; }
        else if (s.name === 'A2') { if (epic >= 6) { r.double = true; r.perc = 'FULL'; } else { r.hand = true; r.cp = true; r.perc = 'BASE'; } }
        else if (s.name === 'outro' || s.name === 'build') r.perc = 'LIGHT';
        r.voices = (r.melody ? 1 : 0) + (r.answer || r.cp || r.double ? 1 : 0) + (r.hold ? 3 : 0) + (r.drive ? 1 : 0) + (r.perc !== 'NONE' ? 1 : 0);
        rep.roles[s.name] = r;
      }
      const secAt = t => bars[Math.min(NB - 1, Math.max(0, Math.floor(t / 4)))].sec;
      const lead = parts.lead.slice().sort((a, b) => a.t - b.t);
      // ---- counterpoint, hand-offs and doubling, section by section
      for (const s of sections) {
        const r = rep.roles[s.name]; const a = s.start * 4, b = (s.start + s.bars) * 4;
        const mel = lead.filter(n => n.t >= a - 1e-6 && n.t < b - 1e-6);
        if (!mel.length) continue;
        if (r.double) {
          const mean = mel.reduce((x, n) => x + n.m, 0) / mel.length, sh = mean - 12 >= LANE.counter[0] + 4 ? -12 : 0;
          if (sh) { parts.counter = parts.counter.filter(n => n.t < a || n.t >= b); for (const n of mel) parts.counter.push({ ...n, m: n.m + sh, v: n.v * 0.8, dbl: true, mel: undefined }); rep.doubled += mel.length; }
          continue;
        }
        if (!r.cp) continue;
        const cp = counterpoint(c, mel, s, LANE.counter);
        parts.counter = parts.counter.filter(n => n.t < a || n.t >= b);
        if (r.hand) {
          // the repeat: the tune moves to the second instrument, the first one sings the new counter-line
          parts.lead = parts.lead.filter(n => n.t < a - 1e-6 || n.t >= b - 1e-6);
          for (const n of mel) parts.counter.push({ ...n, mel: true, v: Math.min(1, n.v * 1.05) });
          for (const n of cp) parts.lead.push({ ...n, v: n.v * 0.9 });
          rep.handed += mel.length;
        } else for (const n of cp) parts.counter.push(n);
        rep.cp += cp.length;
      }
      parts.lead.sort((x, y) => x.t - y.t); parts.counter.sort((x, y) => x.t - y.t);
      // ---- register lanes and masking: every part in its own range, no voice on top of the tune
      for (const n of parts.bass) { const m = fold(n.m, LANE.bass[0], LANE.bass[1]); if (m !== n.m) { n.m = m; rep.lanes++; } }
      for (const n of parts.arp || []) { const m = fold(n.m, LANE.arp[0], LANE.arp[1]); if (m !== n.m) { n.m = m; rep.lanes++; } }
      const line = LO.melodyLine(parts);
      for (const n of parts.counter) {
        if (n.mel || n.dbl) continue;
        const m = fold(n.m, LANE.counter[0], LANE.counter[1]); if (m !== n.m) { n.m = m; rep.lanes++; }
        const l = at(line, n.t + 0.01);
        if (l && (n.m >= l.m - 2)) { let k = n.m; while (k >= l.m - 2 && k - 12 >= LANE.counter[0] - 7) k -= 12; if (k !== n.m) { n.m = k; rep.masked++; } }
      }
      for (const n of parts.lead) if (n.cp) { const l = at(line, n.t + 0.01); if (l && n.m >= l.m - 2) { n.m -= 12; rep.masked++; } }
      // ---- staggered entrances: the answers come in after the tune has had two bars alone
      const rA = rep.roles.A; if (rA && rA.enterCounter != null) rep.entrances.push(`COUNTER ENTERS AT BAR ${rA.enterCounter + 1}`);
      // ---- orchestral percussion
      if (c.timp) this.percussion(c, rep);
      rep.secAt = undefined;
      return rep;
    },
    percussion(c, rep) {
      const { parts, bars, sections, sw } = c, NB = bars.length, P = rep.perc, D = parts.drums, epic = rep.epic;
      const timp = (t, m, v) => { D.push({ t, kind: 'timp', v, m }); P.timp++; };
      const tr = b => b.root + 12, fifth = b => b.root + 7;
      const rollStep = c.bpmD >= 120 ? 1 / 3 : 0.25;
      for (const s of sections) {
        const r = rep.roles[s.name], last = s.start + s.bars - 1, next = sections[sections.indexOf(s) + 1];
        for (let i = s.start; i <= last; i++) {
          const b = bars[i], t0 = i * 4, idx = i - s.start, phraseStart = idx % 4 === 0, phraseEnd = idx % 4 === 3;
          if (r.perc === 'LIGHT') { if (phraseStart) timp(t0, tr(b), 0.55); continue; }
          // timpani: the root on every phrase start, the bar's root after that when there is energy, a fifth on 3
          if (phraseStart) timp(t0, tr(b), 1);
          else if (epic >= 3 || c.intense >= 4) timp(t0, tr(b), 0.72);
          if (!c.waltz && (r.perc === 'DRIVE' || r.perc === 'FULL' || epic >= 6) && !phraseEnd) timp(t0 + sw(2), fifth(b), 0.6);
          // snare only where the music drives: a light march on 2 and 4, a ruff into the next phrase
          if ((r.perc === 'DRIVE' || r.perc === 'FULL') && !c.waltz) {
            for (const p of [1, 3]) { D.push({ t: t0 + sw(p), kind: 'snare', v: 0.34 }); P.snare++; }
            if (phraseEnd) for (let k = 0; k < 4; k++) { D.push({ t: t0 + 3 + k * 0.25, kind: 'snare', v: 0.3 + 0.12 * k }); P.snare++; }
          }
          // timpani roll into the cadence: the end of each section, and every phrase end at full strength
          const cadence = (i === last && next) || (r.perc === 'FULL' && phraseEnd && i < last);
          if (cadence && !(i === last && next && next.name === 'A2' && epic >= 5)) {
            for (let x = 2, k = 0; x < 4 - 1e-6; x += rollStep, k++) timp(t0 + x, tr(b), 0.3 + 0.6 * (x - 2) / 2);
            P.rolls++;
          }
        }
        if (s.name === 'A' || s.name === 'A2') D.push({ t: s.start * 4, kind: 'crash', v: s.name === 'A2' ? 1 : 0.7 });
        // a cymbal swell into the climax (the noise voice rising), then the crash on the downbeat
        if (next && (next.name === 'A2' || (next.name === 'B' && epic >= 7)) && s.bars >= 2) {
          const t0 = (s.start + s.bars) * 4 - 2;
          for (let k = 0; k < 16; k++) D.push({ t: t0 + k * 0.125, kind: 'ohat', v: 0.12 + 0.7 * Math.pow(k / 15, 1.6), swell: true });
          if (epic >= 5) { const b = bars[s.start + s.bars - 1]; for (let x = 2; x < 4 - 1e-6; x += rollStep) timp((s.start + s.bars - 1) * 4 + x, tr(b), 0.35 + 0.6 * (x - 2) / 2); P.rolls++; }
          P.swells++;
        }
      }
      // the end of a song that ends (not a loop): one last roll and a final stroke
      if (!c.loop && NB > 2) { const b = bars[NB - 1], t0 = (NB - 1) * 4; timp(t0, tr(b), 0.9); }
      D.sort((a, b) => a.t - b.t);
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
