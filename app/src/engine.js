/* LowOrbit Chip Studio - engine: compose -> chip render -> chip mix -> atmospherics -> master */
(function (G) {
  const LO = G.LO;

  LO.Engine = class {
    constructor() { this.song = null; this.R = null; this.fx = null; this.chState = null; this.master = true; this.atmos = null; }

    generate(params, onMind) {
      const t0 = Date.now();
      if (params.mind !== false && LO.mindRun) {
        const out = LO.mindRun(this, params, onMind);
        const T = out.table;
        return { ...out.mixed, timing: { ms: Date.now() - t0 }, mind: { log: T.log, order: T.order, job: T.job, work: T.work, review: out.review, emotion: T.emotion ? { label: T.emotion.label, arc: T.emotion.arc, v: T.emotion.v, a: T.emotion.a, moments: T.emotion.moments } : null, colors: T.color ? T.color.names : [], agreements: T.agreements.length, prod: this.prod } };
      }
      const chip = LO.CHIPS[params.chip] || LO.CHIPS['LO-1'];
      this.chip = chip;
      this.song = LO.compose(params);
      this.song.meta.chip = chip.id;
      if (LO.ChipKeeper && LO.ChipKeeper.timing) LO.ChipKeeper.timing(null, this.song, chip.id, params);
      this.fx = Object.assign(chip.defaultFx(this.song), params.fx || {});
      this.chState = chip.channelsDef.map(() => ({ mute: false, solo: false, vol: 1 }));
      if (params.chState && params.chState.length === this.chState.length) this.chState = params.chState.map(c => ({ ...c }));
      if (params.master != null) this.master = params.master;
      if (params.atmos !== undefined) this.atmos = params.atmos;
      const tc = Date.now();
      this.R = chip.render(this.song, this.fx);
      const tr = Date.now();
      const mixed = this.mix();
      return { ...mixed, timing: { compose: tc - t0, render: tr - tc, mix: Date.now() - tr } };
    }

    update(fx, chState, master, atmos) {
      const chip = this.chip; let rerender = false;
      if (fx) for (const f of chip.fxSchema) if (f.level === 'render' && fx[f.id] !== undefined && fx[f.id] !== this.fx[f.id]) rerender = true;
      if (fx) Object.assign(this.fx, fx);
      if (chState) this.chState = chState.map(c => ({ ...c }));
      if (master != null) this.master = master;
      if (atmos !== undefined) this.atmos = atmos;
      const t0 = Date.now();
      if (rerender) { this.R = chip.render(this.song, this.fx); if (this.song.meta.orch && chip.id === 'SNES' && LO.Production && LO.Production.mixEngineer) LO.Production.mixEngineer(null, this.song, this.R, this.fx); }
      const out = this.mix();
      out.timing = { rerender, ms: Date.now() - t0 };
      return out;
    }

    finalMix(onlyDry) {
      const m = this.chip.mix(this.song, this.R, this.fx, this.chState);
      const active = LO.atmosActive(this.atmos);
      let dry = null;
      if (active && !onlyDry) { dry = { L: m.L.slice(), R: m.R.slice() }; (LO.Production ? LO.Production.master : LO.master)(dry.L, dry.R, this.master); }
      let L = m.L, R = m.R;
      if (active && !onlyDry) { const w = LO.applyAtmos(L, R, this.atmos, this.song.seed); L = w.L; R = w.R; }
      this.prod = (LO.Production ? LO.Production.master : LO.master)(L, R, this.master);
      // v0.7.3: a scene that should sit quieter than the rest (PEACEFUL: the quietest, SOLID Eerola 2013), after the peak match
      const q = this.song.meta.quiet; if (q && q < 1) { for (let i = 0; i < L.length; i++) { L[i] *= q; R[i] *= q; } if (this.prod && this.prod.gain) this.prod.gain *= q; }
      return { L, R, dry };
    }

    mix() {
      const f = this.finalMix();
      return { L: f.L, R: f.R, dryL: f.dry ? f.dry.L : null, dryR: f.dry ? f.dry.R : null, meters: this.meters(), budget: this.R.budget, fx: { ...this.fx } };
    }

    loopFile() {
      const f = this.finalMix(); const spb = 60 / this.song.meta.bpm;
      const s = Math.round(this.song.meta.loopStart * 4 * spb * LO.SR), e = Math.round(this.song.totalBeats * spb * LO.SR);
      return LO.loopBody(f.L, f.R, s, e);
    }

    meters() {
      return this.R.raw.map(arr => {
        const hp = new LO.OnePole('hp', 30); const tmp = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) tmp[i] = hp.run(arr[i]);
        return LO.meterFrames(tmp);
      });
    }

    stems() {
      const out = [];
      const full = this.chip.mix(this.song, this.R, this.fx, this.chState);
      let pk = 1e-9; for (let i = 0; i < full.L.length; i++) pk = Math.max(pk, Math.abs(full.L[i]), Math.abs(full.R[i]));
      const g = 0.89 / pk;
      this.chip.channelsDef.forEach((c, i) => {
        const s = this.chip.mix(this.song, this.R, this.fx, this.chState, i);
        for (let k = 0; k < s.L.length; k++) { s.L[k] *= g; s.R[k] *= g; }
        out.push({ name: c.name + (c.role && c.role !== c.name ? ' ' + c.role : ''), L: s.L, R: s.R });
      });
      return out;
    }

    songView() {
      const s = this.song;
      return {
        seed: s.seed, title: s.title, meta: s.meta, sections: s.sections, totalBeats: s.totalBeats,
        bars: s.bars.map(b => ({ sec: b.sec, idx: b.idx, chord: b.chord, tones: b.tones, surprise: b.surprise })),
        events: this.R.events.map(ev => ev.map(e => [e.s, e.e, e.m || 0])),
        total: this.R.total, chip: {
          id: this.chip.id, name: this.chip.name, full: this.chip.full, year: this.chip.year, tier: this.chip.tier,
          voices: this.chip.voices, rate: this.chip.rate, bits: this.chip.bits, blurb: this.chip.blurb,
          channels: this.chip.channelsDef, fxSchema: this.chip.fxSchema.map(f => { const o = { ...f }; delete o.fmt; return o; }),
        },
      };
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
