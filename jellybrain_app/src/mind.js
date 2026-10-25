/* LowOrbit Chip Studio - THE STUDIO MIND: six modules around one shared song plan.
   COMPOSER writes, EMOTION shapes the feeling, IMAGINATION adds color, CHIP KEEPER makes it real on the chip,
   PRODUCTION makes it clean, LISTENER reviews the finished render and sends notes back.
   Every event logged here is a real decision the code made; the Studio Mind screen draws this log. */
(function (G) {
  const LO = G.LO;

  LO.MIND_MODULES = [
    { id: 'COMPOSER', areas: ['MOTIF', 'HOOK', 'HARMONY', 'RHYTHM', 'GROOVE', 'ANSWERS'] },
    { id: 'EMOTION', areas: ['FEELING', 'ARC', 'DYNAMICS', 'GOOSEBUMPS'] },
    { id: 'IMAGINATION', areas: ['COLORS', 'LAYERS', 'SPACE', 'TEXTURE'] },
    { id: 'CHIP KEEPER', areas: ['VOICES', 'RANGE', 'TIMING', 'MEMORY', 'EFFECTS', 'INSTRUMENTS'] },
    { id: 'PRODUCTION', areas: ['ARRANGE', 'LOW END', 'CLARITY', 'LOUDNESS'] },
    { id: 'LISTENER', areas: ['ENERGY', 'NOVELTY', 'GROOVE', 'DROP', 'ARC MATCH'] },
  ];

  // The shared table: one song plan everybody reads and writes
  LO.MindTable = class {
    constructor(params, onEvent) {
      this.params = params; this.t0 = Date.now(); this.seq = 0; this.log = []; this.onEvent = onEvent || null;
      this.work = {}; for (const m of LO.MIND_MODULES) this.work[m.id] = 0;
      this.emotion = null; this.color = null; this.notes = []; this.agreements = []; this.order = [];
    }
    ev(mod, type, area, msg, work, extra) {
      const e = { i: this.seq++, ms: Date.now() - this.t0, mod, type, area: area || '', msg: String(msg || '').toUpperCase(), work: work || 0, ...(extra || {}) };
      if (work) this.work[mod] = (this.work[mod] || 0) + work;
      this.log.push(e); if (this.onEvent) this.onEvent(e);
      return e;
    }
    // "yes, and": one module asks, another offers a version that gives both what they care about
    agree(from, to, area, ask, offer) {
      this.ev(from, 'ask', area, ask, 1, { to });
      this.ev(to, 'offer', area, offer, 1, { to: from });
      const a = { from, to, area, ask, offer }; this.agreements.push(a);
      this.ev(from, 'agree', area, 'AGREED: ' + offer, 0, { to });
      return a;
    }
  };

  // Who leads: whoever holds the most important input for this job
  LO.mindOrder = function (params) {
    const hasColor = params.colors && params.colors.length, hasStyle = !!params.blueprint, hasFeeling = params.valence != null && params.arousal != null;
    let lead = 'COMPOSER', job = 'SONG FROM A PURPOSE';
    if (hasColor && !hasStyle) { lead = 'IMAGINATION'; job = 'SONG FROM A COLOR'; }
    else if (hasFeeling && !hasStyle) { lead = 'EMOTION'; job = 'SONG FROM A FEELING'; }
    else if (hasStyle) { lead = 'COMPOSER'; job = 'SONG FROM A STYLE'; }
    const ideas = lead === 'IMAGINATION' ? ['IMAGINATION', 'EMOTION', 'COMPOSER'] : lead === 'EMOTION' ? ['EMOTION', 'COMPOSER', 'IMAGINATION'] : ['COMPOSER', 'EMOTION', 'IMAGINATION'];
    return { job, lead, order: ideas.concat(['CHIP KEEPER', 'PRODUCTION', 'LISTENER']) };
  };

  // Gap-fill: put new notes only where a part is silent (how a real chip channel gets shared)
  LO.gapFill = function (target, notes, minGap) {
    const busy = target.map(n => [n.t, n.t + n.d]).sort((a, b) => a[0] - b[0]);
    let placed = 0, dropped = 0; const g = minGap || 0.05;
    for (const n of notes) {
      const s = n.t - g, e = n.t + n.d + g;
      let free = true;
      // binary search start
      let lo = 0, hi = busy.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (busy[mid][1] < s) lo = mid + 1; else hi = mid - 1; }
      for (let k = Math.max(0, lo - 1); k < busy.length && busy[k][0] < e; k++) if (busy[k][1] > s && busy[k][0] < e) { free = false; break; }
      if (free) { target.push(n); busy.splice(lo, 0, [n.t, n.t + n.d]); placed++; } else dropped++;
    }
    target.sort((a, b) => a.t - b.t);
    return { placed, dropped };
  };

  // The whole team, one song. Returns the engine-ready song plus the mind log and the listener's report.
  LO.mindRun = function (engine, params, onEvent) {
    const chip = LO.CHIPS[params.chip] || LO.CHIPS['LO-1'];
    const colors = LO.Imagination.parse(params.color || '');
    const p0 = { ...params, colors };
    const ord = LO.mindOrder(p0);
    const T = new LO.MindTable(p0, onEvent);
    T.order = ord.order; T.job = ord.job;
    T.ev(ord.lead, 'lead', '', `${ord.job}: ${ord.lead} LEADS`, 0, { order: ord.order });

    const takes = [];
    let fixes = null;
    for (let pass = 1; pass <= 2; pass++) {
      T.pass = pass;
      if (pass === 2) T.ev('LISTENER', 'pass', '', 'SECOND PASS: THE TEAM TAKES ANOTHER RUN AT IT', 0);
      const P = { ...p0, _fix: fixes };
      // ideas, in lead order
      for (const m of ord.order.slice(0, 3)) {
        if (m === 'EMOTION') LO.Emotion.plan(T, P);
        else if (m === 'IMAGINATION') LO.Imagination.plan(T, P);
        else LO.Composer.prepare(T, P);
      }
      LO.Emotion.applyToParams(T, P);
      LO.Imagination.applyToParams(T, P);
      P._table = T;
      const song = LO.compose(P);
      song.meta.chip = chip.id;
      LO.Composer.finish(T, song, P);
      LO.Emotion.shape(T, song, P);
      LO.Imagination.paint(T, song, P);
      LO.ChipKeeper.fit(T, song, chip.id, P);
      LO.Production.arrange(T, song, P);
      LO.ChipKeeper.timing(T, song, chip.id, P);   // feel -> real driver ticks (or milliseconds on LA and LO-1)
      // render on the chip
      let fx = chip.defaultFx(song);
      fx = LO.ChipKeeper.translateFx(T, chip.id, song, fx, T.color);
      LO.Production.chipFx(T, chip.id, song, fx);
      if (params.fx) Object.assign(fx, params.fx);
      const R = chip.render(song, fx);
      T.ev('CHIP KEEPER', 'work', 'VOICES', `RENDERED ON ${chip.full}: ${chip.voices} VOICES`, Math.round(R.total / 32000));
      if (song.meta.orch && chip.id === 'SNES' && !(params.fx && params.fx.mixv)) LO.Production.mixEngineer(T, song, R, fx);
      if (R.budget && R.budget.inst) { // v0.6: which instruments the SNES loaded, and what the 64 KB cost them
        const I = R.budget.inst, kb = b => (b / 1024).toFixed(1) + ' KB';
        for (const role of ['lead', 'counter', 'pad', 'bass', 'timp']) { const it = I[role]; if (!it) continue; T.ev('CHIP KEEPER', 'work', 'INSTRUMENTS', `${role.toUpperCase()}: ${it.name}${it.shared ? ' (SHARED SAMPLE)' : ''}, ${it.how}, ${kb(it.bytes)} OF BRR`, 3); }
        for (const a of R.budget.actions || []) T.ev('CHIP KEEPER', 'work', 'INSTRUMENTS', `64 KB: ${a}`, 2);
      }
      // mix + master
      engine.chip = chip; engine.song = song; engine.fx = fx; engine.R = R;
      engine.chState = chip.channelsDef.map(() => ({ mute: false, solo: false, vol: 1 }));
      if (params.chState && params.chState.length === engine.chState.length) engine.chState = params.chState.map(c => ({ ...c }));
      if (params.master != null) engine.master = params.master;
      if (params.atmos !== undefined) engine.atmos = params.atmos;
      if (!LO.atmosActive(engine.atmos) && T.color && T.color.atmos && params.atmosAuto !== false) {
        engine.atmos = { slots: [{ preset: T.color.atmos, amount: T.color.atmosAmount || 60, size: 1 }, { preset: 'NONE', amount: 100, size: 1 }], distance: 0 };
        T.agree('IMAGINATION', 'PRODUCTION', 'SPACE', `PUT THE WHOLE SONG IN ${T.color.atmos}`, `YES, AT ${T.color.atmosAmount || 60}% SO THE MIX STAYS CLEAR`);
      }
      const mixed = engine.mix();
      T.prod = engine.prod; LO.Production.logMaster(T, engine.prod);
      const review = LO.Listener.review(T, mixed.L, mixed.R, song, P, engine.history || [], params.history || []);
      takes.push({ pass, song, fx, R, chState: engine.chState, atmos: engine.atmos, mixed, review });
      if (pass === 1 && (review.score < (params.minScore || 72) || (review.fixes && review.fixes.reroll)) && review.fixes && Object.keys(review.fixes).length && params.secondPass !== false) { fixes = { ...review.fixes, avoidV: song.meta.variety }; continue; }
      break;
    }
    let best = takes[0];
    if (takes.length > 1) {
      best = takes[1].review.score > takes[0].review.score || (fixes && fixes.reroll && takes[1].review.score === takes[0].review.score) ? takes[1] : takes[0];
      T.ev('LISTENER', 'verdict', 'ARC MATCH', `KEEPING TAKE ${best.pass}: SCORE ${best.review.score} (OTHER ${takes[best.pass === 1 ? 1 : 0].review.score})`, 1);
    }
    T.ev('LISTENER', 'done', '', `FINAL SCORE ${best.review.score} / 100`, 0, { score: best.review.score });
    engine.song = best.song; engine.fx = best.fx; engine.R = best.R; engine.chState = best.chState; engine.atmos = best.atmos;
    engine.history = (engine.history || []).concat([best.review.fingerprint]).slice(-12);
    return { mixed: best.mixed, table: T, review: best.review };
  };
})(typeof self !== 'undefined' ? self : globalThis);
