/* LowOrbit Chip Studio - audio worker: keeps the UI smooth while the chips render */
importScripts('core.js', 'blueprints.js', 'composer.js','m_orchestra.js','m_scenes.js','m_motion.js','m_bench.js', 'chip_common.js', 'chip_nes.js', 'chip_amiga.js', 'snes_inst.js','snes_lib.js','snes_hifi.js','snes_drums_synth.js','snes_drums.js','chip_snes.js', 'chip_lo1.js', 'chip_fm.js', 'chip_genesis.js', 'chip_neogeo.js', 'chip_la.js', 'atmos.js', 'sfx.js', 'crunch.js',
  'mind.js', 'm_composer.js', 'm_emotion.js', 'm_imagination.js', 'm_chipkeeper.js', 'm_production.js', 'm_listener.js', 'engine.js');
const engine = new LO.Engine();

function reply(id, type, payload, transfer) { self.postMessage({ id, type, ...payload }, transfer || []); }
const bufs = (...arrs) => arrs.filter(Boolean).map(a => a.buffer);

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'generate') {
      // stream the Studio Mind's real decisions to the screen as they happen
      let buf = [], last = Date.now();
      const flush = () => { if (buf.length) { self.postMessage({ id: m.id, type: 'mindev', evs: buf }); buf = []; last = Date.now(); } };
      const out = engine.generate(m.params, e => { buf.push(e); if (buf.length >= 12 || Date.now() - last > 30) flush(); });
      flush();
      reply(m.id, 'song', { song: engine.songView(), L: out.L, R: out.R, dryL: out.dryL, dryR: out.dryR, meters: out.meters, budget: out.budget, fx: out.fx, chState: engine.chState, timing: out.timing, mind: out.mind, atmos: engine.atmos },
        [...bufs(out.L, out.R, out.dryL, out.dryR), ...out.meters.map(x => x.buffer)]);
    } else if (m.type === 'update') {
      if (m.myInst && engine.song) engine.song.params.myInst = m.myInst; // instruments saved after the song was made
      const out = engine.update(m.fx, m.chState, m.master, m.atmos);
      reply(m.id, 'mix', { L: out.L, R: out.R, dryL: out.dryL, dryR: out.dryR, meters: out.meters, budget: out.budget, fx: out.fx, timing: out.timing },
        [...bufs(out.L, out.R, out.dryL, out.dryR), ...out.meters.map(x => x.buffer)]);
    } else if (m.type === 'stems') {
      const st = engine.stems();
      reply(m.id, 'stems', { stems: st }, st.flatMap(s => [s.L.buffer, s.R.buffer]));
    } else if (m.type === 'loop') {
      const lp = engine.loopFile();
      reply(m.id, 'loop', { L: lp.L, R: lp.R }, bufs(lp.L, lp.R));
    } else if (m.type === 'sfx') {
      const out = LO.makeSfx(m.opts);
      reply(m.id, 'sfx', { L: out.L, R: out.R, ms: out.ms, place: out.place }, bufs(out.L, out.R));
    } else if (m.type === 'atmos') {
      const t0 = Date.now();
      const w = LO.applyAtmos(m.L, m.R, m.chain, m.seed || 1);
      let pk = 1e-9; for (let i = 0; i < w.L.length; i++) pk = Math.max(pk, Math.abs(w.L[i]), Math.abs(w.R[i]));
      const g = 0.95 / pk; for (let i = 0; i < w.L.length; i++) { w.L[i] *= g; w.R[i] *= g; }
      reply(m.id, 'atmos', { L: w.L, R: w.R, ms: Date.now() - t0 }, bufs(w.L, w.R));
    } else if (m.type === 'iscan') {
      // Instrument Scan: measure the samples, keep only the numbers
      const t0 = Date.now();
      const prof = LO.SNESI.measure(m.samples);
      reply(m.id, 'iscan', { profile: prof, ms: Date.now() - t0 });
    } else if (m.type === 'ibuild') {
      // rebuild from the numbers and play it through the real SNES path (BRR, Gaussian, hardware ADSR)
      const t0 = Date.now();
      const d = m.family ? LO.SNESI.family(m.family, 0) : LO.SNESI.fromProfile(m.profile, 0, m.tune);
      const pv = LO.CHIPS.SNES.previewInst(d, m.notes);
      reply(m.id, 'ibuild', { L: pv.out, info: { bytes: pv.bytes, loop: d.loop, len: pv.len, rate: d.rate, baseF: d.baseF, adsr: d.adsr, kind: d.kind, how: d.how }, ms: Date.now() - t0 }, [pv.out.buffer]);
    } else if (m.type === 'crunch') {
      const t0 = Date.now();
      const out = LO.crunch(m.L, m.R, m.profile, { fit: m.fit, chain: m.chain });
      reply(m.id, 'crunch', { L: out.L, R: out.R, info: out.info, ms: Date.now() - t0 }, bufs(out.L, out.R));
    }
  } catch (err) {
    reply(m.id, 'error', { message: String(err && err.message || err), stack: String(err && err.stack || '') });
  }
};
