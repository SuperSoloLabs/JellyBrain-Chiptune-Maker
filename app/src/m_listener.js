/* STUDIO MIND - LISTENER: hears the finished render the way a person would and reviews it honestly.
   It measures the real audio bar by bar (loudness, brightness, how busy it is), finds boring stretches with a
   novelty measure (how different each 4-bar block is from the last, the idea behind Foote's novelty curve),
   checks that the drop actually lands, that the energy follows EMOTION's planned arc, that each goosebump
   moment produced a real change, and that the song isn't a near-copy of a recent one. Then it sends notes. */
(function (G) {
  const LO = G.LO, M = 'LISTENER';

  function barFeatures(L, R, song) {
    const spb = 60 / song.meta.bpm, per = Math.round(4 * spb * LO.SR), NB = song.bars.length, out = [];
    const fr = Math.round(0.01 * LO.SR);
    for (let b = 0; b < NB; b++) {
      const s = b * per, e = Math.min(L.length, s + per); if (e <= s + fr) { out.push({ db: -90, br: 0, on: 0 }); continue; }
      let ss = 0, dd = 0, prev = 0, prevF = 0, on = 0, fs = 0, fi = 0;
      for (let i = s; i < e; i++) {
        const x = (L[i] + R[i]) * 0.5; ss += x * x; const d = x - prev; dd += d * d; prev = x;
        fs += x * x; if (++fi === fr) { const f = fs / fr; if (f > prevF * 2.2 && f > 1e-5) on++; prevF = f; fs = 0; fi = 0; }
      }
      const ms = ss / (e - s);
      out.push({ db: 10 * Math.log10(ms + 1e-12), br: dd / (ss + 1e-12), on });
    }
    return out;
  }
  const corr = (a, b) => {
    const n = a.length; if (n < 3) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa > 1e-9 && sbb > 1e-9 ? sab / Math.sqrt(saa * sbb) : null;
  };

  // the target zone: medium syncopation (the top of Witek et al. 2014's inverted U) and a lead that rests 10-30% of the time
  LO.GROOVE_ZONE = { sync: [0.8, 2.6], rest: [0.1, 0.3] };

  LO.Listener = {
    review(T, L, R, song, P, history, skelHist) {
      const F = barFeatures(L, R, song), NB = F.length, form = song.meta.form, notes = [], fixes = {};
      let score = 100;
      const loud = F.map(f => f.db), maxDb = Math.max(...loud);
      T.ev(M, 'work', 'ENERGY', `LISTENED TO ${NB} BARS: LOUDNESS, BRIGHTNESS, HOW BUSY`, NB);
      const note = (bar, owner, text, pen, fix) => { notes.push({ bar, owner, text }); score -= pen; if (fix) fixes[fix] = true; T.ev(M, 'note', owner === 'PRODUCTION' ? 'ENERGY' : owner === 'COMPOSER' ? 'NOVELTY' : 'DROP', (bar != null ? `BAR ${bar + 1}: ` : '') + text, 2, { to: owner }); };
      // health from the master stage
      const pr = T.prod || null;
      if (pr && pr.peakDb > -0.9) note(null, 'PRODUCTION', `PEAKS TOO HOT (${pr.peakDb} DB)`, 10);
      if (form.startsWith('jingle')) {
        T.ev(M, 'work', 'ENERGY', 'A JINGLE: CHECKED LEVEL AND ENDING ONLY', 2);
        return { score: LO.clamp(Math.round(score), 0, 100), notes, fixes: {}, fingerprint: this.fingerprint(F, song), bars: F.map(f => +(f.db - maxDb).toFixed(1)) };
      }
      // novelty: how different is each 4-bar block from the one before?
      const blocks = []; for (let b = 0; b + 4 <= NB; b += 4) { const s = F.slice(b, b + 4); blocks.push([s.reduce((a, f) => a + f.db, 0) / 40, s.reduce((a, f) => a + f.br, 0) * 2.5, s.reduce((a, f) => a + f.on, 0) / 24]); }
      const nov = []; for (let i = 1; i < blocks.length; i++) nov.push(Math.hypot(blocks[i][0] - blocks[i - 1][0], blocks[i][1] - blocks[i - 1][1], blocks[i][2] - blocks[i - 1][2]));
      let run = 0, worst = 0, worstAt = 0;
      for (let i = 0; i < nov.length; i++) { if (nov[i] < 0.06) { run++; if (run > worst) { worst = run; worstAt = i + 1 - run; } } else run = 0; }
      const flatBars = (worst + 1) * 4;
      const allowed = (form === 'evolve' ? 24 : 16) + (P.blueprint && ['ambient', 'drone', 'techno'].includes(P.blueprint.id) ? 8 : 0);
      T.ev(M, 'work', 'NOVELTY', `NOVELTY CURVE: ${nov.length} CHANGES MEASURED, LONGEST SAMENESS ${worst ? flatBars : 4} BARS`, nov.length * 2);
      if (worst && flatBars > allowed) note(worstAt * 4, 'COMPOSER', `${flatBars} BARS WITHOUT MUCH CHANGE: IT STARTS TO DRAG`, Math.min(20, (flatBars - allowed) * 0.8), 'variety');
      // the drop: does the return of the theme really land?
      const sec2 = song.sections.find(s => s.name === 'A2');
      const Ep = T.emotion, prevSec = sec2 && sec2.start >= 1 ? song.bars[sec2.start - 1].sec : null;
      const plannedLift = Ep && prevSec && Ep.energy.A2 != null && Ep.energy[prevSec] != null ? Ep.energy.A2 - Ep.energy[prevSec] : 0.3;
      if (sec2 && sec2.start >= 2 && plannedLift < 0.15) T.ev(M, 'work', 'DROP', `THE ${Ep ? Ep.arc : ''} PLAN WANTS A GENTLE RETURN AT BAR ${sec2.start + 1}, NOT A BIG DROP: OK`, 2);
      else if (sec2 && sec2.start >= 2) {
        const pre = (F[sec2.start - 1].db + F[sec2.start - 2].db) / 2, post = (F[sec2.start].db + F[Math.min(NB - 1, sec2.start + 1)].db) / 2;
        const jump = post - pre, brJump = F[sec2.start].br - F[sec2.start - 1].br;
        T.ev(M, 'work', 'DROP', `THE RETURN AT BAR ${sec2.start + 1}: ${jump >= 0 ? '+' : ''}${jump.toFixed(1)} DB`, 4);
        if (jump < 1 && brJump < 0.02) note(sec2.start, 'EMOTION', `THE BIG RETURN DOESN'T LIFT (${jump.toFixed(1)} DB)`, jump < 0 ? 15 : 9, 'emotionBoost');
      }
      // the arc: did the energy follow EMOTION's plan?
      const E = T.emotion;
      if (E && song.sections.length >= 3) {
        const planned = [], heard = [];
        for (const s of song.sections) { if (E.energy[s.name] == null) continue; planned.push(E.energy[s.name]); const seg = F.slice(s.start, s.start + s.bars); heard.push(seg.reduce((a, f) => a + f.db, 0) / Math.max(1, seg.length)); }
        const c = corr(planned, heard);
        if (c != null) {
          T.ev(M, 'work', 'ARC MATCH', `ENERGY FOLLOWED THE PLANNED ${E.arc} ARC: MATCH ${Math.round(c * 100)}%`, 6);
          if (c < 0.3) note(null, 'EMOTION', `THE SONG'S ENERGY DOESN'T FOLLOW THE ${E.arc} PLAN`, 10, 'emotionBoost');
          else if (c < 0.6) note(null, 'EMOTION', 'THE ARC IS THERE BUT FAINT', 4, 'emotionBoost');
        }
        // goosebump moments: was there a real, measurable change?
        for (const pm of (E.placed || [])) {
          const b = pm.bar; if (b < 1 || b >= NB) continue;
          if (pm.kind === 'KEY LIFT' || pm.kind === 'UNPREPARED HARMONY') {
            const ch = song.bars[b].chord.join(',') !== song.bars[b - 1].chord.join(',');
            T.ev(M, 'work', 'DROP', `${pm.kind} AT BAR ${b + 1}: ${ch ? 'LANDED (YOU HEAR IT IN THE HARMONY, NOT THE VOLUME)' : 'CHECKED'}`, 2); continue;
          }
          if (pm.kind === 'NEW VOICE') { T.ev(M, 'work', 'DROP', `NEW VOICE AT BAR ${b + 1}: ${song.parts.counter.some(n => n.t >= b * 4 && n.t < b * 4 + 8) ? 'LANDED' : 'NOT HEARD'}`, 2); continue; }
          const d = Math.abs(F[b].db - F[b - 1].db) + Math.abs(F[b].br - F[b - 1].br) * 20 + Math.abs(F[b].on - F[b - 1].on) * 0.3;
          if (d >= 1.2) T.ev(M, 'work', 'DROP', `${pm.kind} AT BAR ${b + 1}: LANDED`, 2);
          else note(b, 'EMOTION', `${pm.kind} WAS TOO SUBTLE TO FEEL`, 4, 'emotionBoost');
        }
      }
      // the skeleton check: same groove, shape, chords, sounds and tempo as a song you already made?
      const sk = song.meta.skeleton;
      if (sk && skelHist && skelHist.length) {
        let best = 0, bestT = '';
        for (const h of skelHist.slice(-50)) {
          if (!h || h.genre !== sk.genre) continue;
          const v = h.v || {}, w = sk.v || {};
          const sim = (v.drum === w.drum ? 0.2 : 0) + (h.form === sk.form ? 0.15 : 0) + (h.prog === sk.prog ? 0.25 : 0) + (v.lead === w.lead ? 0.1 : 0) + (v.pad === w.pad ? 0.05 : 0) + (v.bass === w.bass ? 0.1 : 0) + (Math.abs((h.bpm || 0) - sk.bpm) <= 4 ? 0.1 : 0) + (h.mode === sk.mode ? 0.05 : 0) + (h.mark ? 0.1 : 0);
          if (sim > best) { best = sim; bestT = h.title || ''; }
        }
        T.ev(M, 'work', 'NOVELTY', `COMPARED THE SKELETON WITH ${Math.min(50, skelHist.length)} EARLIER SONGS: CLOSEST MATCH ${Math.round(best * 100)}%`, Math.min(50, skelHist.length));
        if (best >= 0.75) note(null, 'COMPOSER', `SAME SKELETON AS ${bestT || 'A SONG YOU MADE'}: CHANGE THE GROOVE, SHAPE OR SOUNDS`, 18, 'reroll');
      }
      // GROOVE (v0.5.1): syncopation, breath, rhythm variety, phrase lengths, melodic freshness
      const gm = song.meta.groove ? this.groove(song) : null;
      if (gm) {
        const Z = LO.GROOVE_ZONE;
        T.ev(M, 'work', 'GROOVE', `SYNCOPATION ${gm.sync == null ? 'N/A (3/4)' : gm.sync.toFixed(2)} (TARGET ${Z.sync[0]}-${Z.sync[1]}), LEAD RESTS ${Math.round(gm.rest * 100)}% (TARGET ${Z.rest[0] * 100}-${Z.rest[1] * 100}%)`, 6);
        T.ev(M, 'work', 'GROOVE', `RHYTHM ENTROPY ${gm.ent.toFixed(2)} BITS, ${gm.plen.length} BREATHS, PHRASE LENGTHS ${[...new Set(gm.plen)].sort((a, b) => a - b).join(', ') || '-'} BARS`, 4);
        if (gm.sync != null && gm.sync < Z.sync[0]) note(null, 'COMPOSER', 'TOO SQUARE: ADD PUSHES', 6, 'pushes');
        else if (gm.sync != null && gm.sync > Z.sync[1] * 1.4) note(null, 'COMPOSER', 'TOO JUMPY: STEADY THE RHYTHM', 4, 'steady');
        if (form === 'evolve') { /* evolving styles thin the lead on purpose: no breath notes */ }
        else if (gm.rest < Z.rest[0] * 0.8) note(null, 'COMPOSER', 'NO BREATH: ADD RESTS', 6, 'breath');
        else if (gm.rest > Z.rest[1] * 1.35) note(null, 'COMPOSER', 'TOO MANY HOLES: FILL THE LINE', 4, 'fill');
        if (P.groove !== 0 && (skelHist || []).length) {
          const mem = LO.freshMemory(skelHist, P.loved || null), fr = LO.freshness(LO.melodyGrams(song.meta.orch && LO.melodyLine ? LO.melodyLine(song.parts) : song.parts.lead), mem);
          gm.fresh = fr;
          T.ev(M, 'work', 'GROOVE', `MELODIC FRESHNESS ${Math.round(fr * 100)}% AGAINST THE LAST ${mem.n} SONGS' SHAPES`, Math.min(20, mem.n));
          if (fr < 0.4) note(null, 'COMPOSER', 'THE MELODY REUSES SHAPES FROM RECENT SONGS', 5, 'reseedMelody');
        }
      }
      // sameness against recent songs
      const fp = this.fingerprint(F, song);
      for (const h of (history || [])) {
        const sim = 1 - Math.min(1, Math.abs(h.db - fp.db) / 6 + Math.abs(h.br - fp.br) * 4 + Math.abs(h.on - fp.on) / 6 + (h.bpm === fp.bpm ? 0 : 0.15) + (h.mode === fp.mode ? 0 : 0.1) + (h.key === fp.key ? 0 : 0.1));
        if (sim > 0.96) { note(null, 'COMPOSER', 'THIS SOUNDS VERY CLOSE TO A SONG YOU JUST MADE', 8, 'reseedMelody'); break; }
      }
      score = LO.clamp(Math.round(score), 0, 100);
      T.ev(M, 'work', 'ENERGY', notes.length ? `REVIEW DONE: SCORE ${score}, ${notes.length} NOTE${notes.length === 1 ? '' : 'S'} FOR THE TEAM` : `REVIEW DONE: SCORE ${score}, NOTHING TO FIX`, 3, { score });
      return { score, notes, fixes, fingerprint: fp, groove: gm, bars: F.map(f => +(f.db - maxDb).toFixed(1)) };
    },
    // measures the lead on its written grid (before CHIP KEEPER's feel), so the numbers mean the same on every chip
    groove(song) {
      const m = song.meta, gt = n => n.tg != null ? n.tg : n.t, gd = n => n.dg != null ? n.dg : n.d;
      const lead = (m.orch && LO.melodyLine ? LO.melodyLine(song.parts) : song.parts.lead).map(n => ({ t: gt(n), d: gd(n), m: n.m })).sort((a, b) => a.t - b.t);
      if (lead.length < 8) return null;
      let span = 0, silent = 0;
      for (const s of song.sections) {
        const a = s.start * 4, b = (s.start + s.bars) * 4, ns = lead.filter(n => n.t >= a - 1 && n.t < b);
        if (ns.length < 3) continue;
        const s0 = Math.max(a, ns[0].t), s1 = Math.min(b, Math.max(...ns.map(n => n.t + n.d)));
        span += s1 - s0; let cov = 0, cur = s0;
        for (const n of ns) { const x0 = Math.max(cur, n.t), x1 = Math.min(s1, n.t + n.d); if (x1 > x0) { cov += x1 - x0; cur = x1; } }
        silent += Math.max(0, (s1 - s0) - cov);
      }
      // Longuet-Higgins & Lee syncopation on the 16th grid, averaged per bar that has melody
      let sync = null;
      if (m.meter !== '3/4') {
        const W = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];
        const on = new Set(lead.map(n => Math.round(n.t * 4))); let tot = 0, nb = 0;
        for (let b = 0; b < song.bars.length; b++) {
          let any = false, sb = 0;
          for (let i = 0; i < 16; i++) {
            const k = b * 16 + i; if (!on.has(k)) continue; any = true;
            let j = k + 1; while (j < k + 16 && !on.has(j)) j++;
            let best = null; for (let q = k + 1; q < j; q++) { const w = W[q % 16]; if (best == null || w > best) best = w; }
            if (best != null && best > W[i]) sb += best - W[i];
          }
          if (any) { tot += sb; nb++; }
        }
        sync = nb ? tot / nb : 0;
      }
      const H = {}; let ni = 0;
      for (let i = 1; i < lead.length; i++) { const q = Math.min(16, Math.max(1, Math.round((lead[i].t - lead[i - 1].t) * 4))); H[q] = (H[q] || 0) + 1; ni++; }
      let ent = 0; for (const k in H) { const p = H[k] / ni; ent -= p * Math.log2(p); }
      const starts = [];
      for (let i = 0; i < lead.length; i++) { const gap = i ? lead[i].t - (lead[i - 1].t + lead[i - 1].d) : 99; if (gap >= 0.75) starts.push(lead[i].t); }
      const plen = []; for (let i = 1; i < starts.length; i++) plen.push(Math.round((starts[i] - starts[i - 1]) / 4 * 2) / 2);
      return { rest: span ? silent / span : 0, sync, ent, plen };
    },
    // v0.6.1 BURIED-VOICE CHECK: can each voice be heard in its own frequency band over all the others?
    // Energies are measured once per voice, band and 46 ms frame; a level change is then just a multiply.
    audibility(R, roles, need) {
      const n = R.total, step = 2, fr = Math.round(0.046 * LO.SR / step), V = R.raw.length;
      const E = R.raw.map(x => {
        const l1 = new LO.OnePole('lp', 250, LO.SR / step), l2 = new LO.OnePole('lp', 2500, LO.SR / step);
        const out = [[], [], []]; let a = 0, b = 0, c = 0, k = 0;
        for (let i = 0; i < n; i += step) { const v = x[i], lo = l1.run(v), mid = l2.run(v) - lo, hi = v - lo - mid; a += lo * lo; b += mid * mid; c += hi * hi; if (++k === fr) { out[0].push(a); out[1].push(b); out[2].push(c); a = b = c = 0; k = 0; } }
        return out;
      });
      const F = E[0][0].length;
      const band = E.map(e => { const t = e.map(b => b.reduce((x, y) => x + y, 0)); return t.indexOf(Math.max(...t)); });
      const NEED = { lead: -1, counter: -9, pad: -16, timp: -8, bass: -6, drums: -7, noise: -14, ...(need || {}) };
      const NAME = { lead: 'THE MELODY', counter: 'THE COUNTER-LINE', pad: 'A PAD', timp: 'THE TIMPANI', bass: 'THE BASS', drums: 'THE DRUMS', noise: 'THE HATS', double: 'THE MELODY DOUBLE', echo: 'THE FAKE ECHO', bed: 'THE NOISE BED' };
      return {
        score(g) {
          const out = [];
          for (let i = 0; i < V; i++) {
            const bd = band[i], mine = E[i][bd]; const mx = Math.max(1e-15, ...mine); const snr = []; const by = new Array(V).fill(0);
            for (let f = 0; f < F; f++) {
              if (mine[f] < mx * 1e-4) continue;
              let o = 0; for (let j = 0; j < V; j++) if (j !== i) { const e = E[j][bd][f] * g[j] * g[j]; o += e; by[j] += e; }
              snr.push(10 * Math.log10((mine[f] * g[i] * g[i] + 1e-15) / (o + 1e-15)));
            }
            if (!snr.length || g[i] === 0) continue;
            // a held voice must be heard most of the time; a drum must be heard when it hits (its 80th percentile)
            snr.sort((a, b) => a - b); const perc = ['drums', 'noise', 'timp'].includes(roles[i]) ? 0.8 : 0.5, med = snr[Math.min(snr.length - 1, Math.floor(snr.length * perc))];
            const byI = by.indexOf(Math.max(...by));
            out.push({ i, name: NAME[roles[i]] || 'VOICE ' + i, role: roles[i], snr: med, need: NEED[roles[i]], buried: med < NEED[roles[i]], by: byI, byName: NAME[roles[byI]] || 'VOICE ' + byI });
          }
          return out;
        },
      };
    },
    // v0.7.2 COMPOSITION FIRST: the melody judged naked, on its notes alone (exactly what a bare square wave would
    // play: no instrument, no echo, no harmony to hide behind). The A theme's 2-bar phrases for catchiness, the
    // whole tune for surprise in the listener's sweet spot, its range, rhythm variety and whether it ever lands home.
    naked(song) {
      const mel = LO.melodyLine ? LO.melodyLine(song.parts) : song.parts.lead; if (mel.length < 8) return { score: 0, why: 'NO MELODY' };
      const key = song.meta.key, A = song.sections.find(x => x.name === 'A') || song.sections[0];
      const phr = []; for (let b = A.start; b < A.start + A.bars; b += 2) { const ph = mel.filter(n => n.t >= b * 4 && n.t < (b + 2) * 4).map(n => ({ ...n, bar: Math.floor(n.t / 4) - b })); if (ph.length >= 3) phr.push(ph); }
      const hooks = phr.map(ph => LO.Composer.hookScore(ph, [0, 4, 7].map(x => x % 12), key).score).sort((a, b) => b - a);
      const hook = hooks.length ? (hooks[0] + (hooks[1] || hooks[0])) / 2 : 0.3;
      const ex = LO.expectScore ? LO.expectScore(mel, null).score : 0.5;
      const ms = mel.map(n => n.m), range = Math.max(...ms) - Math.min(...ms);
      // v0.7.3: an octave to a tenth is the recognizable range (Van Balen 2015); wider or narrower costs a little
      const rng = range >= 10 && range <= 17 ? 1 : range >= 7 && range <= 19 ? 0.7 : range >= 5 ? 0.4 : 0.2;
      // v0.7.3: a motif that comes back: bars of the A theme whose rhythm or interval shape repeats an earlier bar
      // (repetitivity was the strongest symbolic predictor of a hook, Van Balen 2015; 3 of 8 bars = full marks)
      const barSig = b => { const ns = mel.filter(n => n.t >= b * 4 && n.t < b * 4 + 4); return ns.length < 2 ? null : { r: ns.map(n => Math.round((n.t % 4) * 4)).join(','), i: ns.slice(1).map((n, k) => n.m - ns[k].m).join(',') }; };
      const sigs = []; for (let b = A.start; b < A.start + Math.min(8, A.bars); b++) sigs.push(barSig(b));
      let reps = 0; sigs.forEach((g, k) => { if (g && sigs.slice(0, k).some(h => h && (h.r === g.r || h.i === g.i))) reps++; });
      const rep = Math.min(1, reps / 3);
      const ds = new Set(mel.map(n => Math.round(n.d * 4))).size, rhy = ds >= 3 ? 1 : ds === 2 ? 0.6 : 0.2;
      const home = mel.some(n => ((n.m - key) % 12 + 12) % 12 === 0 && n.d >= 1) ? 1 : 0.4;
      const score = Math.round(100 * (hook * 0.35 + ex * 0.2 + rng * 0.15 + rhy * 0.1 + home * 0.1 + rep * 0.1));
      return { score, rep: reps, why: `MOTIF RETURNS ${reps}x, HOOK ${Math.round(hook * 100)}, SURPRISE ${Math.round(ex * 100)}, RANGE ${range}, ${ds} NOTE LENGTHS${home < 1 ? ', NEVER LANDS HOME' : ''}` };
    },
    fingerprint(F, song) {
      const n = Math.max(1, F.length);
      return { db: F.reduce((a, f) => a + f.db, 0) / n, br: F.reduce((a, f) => a + f.br, 0) / n, on: F.reduce((a, f) => a + f.on, 0) / n, bpm: song.meta.bpm, mode: song.meta.mode, key: song.meta.key };
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
