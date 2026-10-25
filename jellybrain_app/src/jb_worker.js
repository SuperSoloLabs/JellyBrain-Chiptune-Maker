/* JELLY BRAIN - the brain's worker: the whole Chip Studio engine (all six modules, the SNES chip, the instrument
   library) runs here so the screen never stutters. */
importScripts('core.js', 'blueprints.js', 'composer.js', 'm_orchestra.js', 'm_scenes.js', 'm_motion.js', 'm_bench.js', 'bench_targets.js', 'chip_common.js', 'snes_inst.js', 'snes_lib.js', 'snes_hifi.js', 'snes_drums_synth.js', 'snes_drums.js', 'snes_dsp.js', 'chip_snes.js',
  'atmos.js', 'mind.js', 'm_composer.js', 'm_emotion.js', 'm_imagination.js', 'm_chipkeeper.js', 'm_production.js', 'm_listener.js', 'engine.js',
  'jb_post.js', 'jb_scenes.js');
const engine = new LO.Engine();
let enhanced = false, history = [], cur = null;
LO.SNESI_USER = {};
const reply = (id, type, payload, transfer) => self.postMessage({ id, type, ...payload }, transfer || []);

// per SNES voice, a loudness envelope at 30 frames a second (the visualizer's 8 bars)
function voiceBars(R) {
  const step = Math.round(LO.SR / 30), n = Math.ceil(R.total / step);
  return R.raw.map(x => { const o = new Float32Array(n); for (let f = 0; f < n; f++) { let s = 0; const a = f * step, b = Math.min(R.total, a + step); for (let i = a; i < b; i += 4) s += x[i] * x[i]; o[f] = Math.sqrt(s / Math.max(1, (b - a) / 4)); } return o; });
}
function songInfo(out, ms) {
  const s = engine.song, m = s.meta, spb = 60 / m.bpm, I = (out.budget && out.budget.inst) || {};
  const bs = t => LO.beatSec ? LO.beatSec(s, t) : t * spb;   // the tempo map (a tightening chase) moves the loop points
  const loopS = m.loop ? bs(m.loopStart * 4) : null, loopE = m.loop ? bs(s.totalBeats) : null;
  return { title: s.title, seed: s.seed, bpm: m.displayBpm || m.bpm, key: m.keyName, mode: m.mode, loop: m.loop, loopS, loopE, len: out.L.length / LO.SR,
    inst: Object.fromEntries(Object.entries(I).map(([k, v]) => [k, v.name])), ram: out.budget ? out.budget.used : 0, ms,
    score: out.mind && out.mind.review ? out.mind.review.score : null, epic: m.orch ? m.orch.epic : null, form: m.form,
    sections: s.sections.map(x => ({ name: x.name, t: bs(x.start * 4), len: bs((x.start + x.bars) * 4) - bs(x.start * 4) })), sheet: m.sheetLog || null, tricks: (engine.R && engine.R.tricks) || [] };
}
// v0.7.2 SFX voice hijack, as Square's and Nintendo's drivers did it: a menu sound takes ONE real voice for its length.
// Priority: the melody and the bass are never taken; then pads, a doubled/echo voice, the arpeggio or counter, the hats,
// the drums. Among equals, the quietest. The worker sends that voice's exact dry signal; the player subtracts it while
// the sound plays and lets it back in after (the voice re-keys).
const STEAL = { bed: 1, pad: 1, double: 2, echo: 2, counter: 4, noise: 5, timp: 6, drums: 7 };
function stealStem(R, prod) {
  if (!R || !R.exact || !R.lastVols || !prod || !prod.gain) return null;
  const roles = R.voiceRoles || ['lead', 'counter', 'pad', 'pad', R.timpVoice ? 'timp' : 'pad', 'bass', 'drums', 'noise'];
  let best = -1, bp = 99, be = Infinity;
  for (let v = 0; v < 8; v++) { const p = STEAL[roles[v]]; const vo = R.lastVols[v]; if (!p || !(vo[0] || vo[1])) continue; let e = 0; for (let i = 0; i < R.total; i += 64) e += R.raw[v][i] * R.raw[v][i]; e *= (vo[0] * vo[0] + vo[1] * vo[1]); if (p < bp || (p === bp && e < be)) { bp = p; be = e; best = v; } }
  if (best < 0) return null;
  const n = R.total, x = R.raw[best], [vl, vr] = R.lastVols[best], mv = Math.max(-128, Math.min(127, Math.round(R.lastDry * 127))) / 128;
  const L = new Float32Array(n), Rr = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = Math.round(x[i] * 32768); L[i] = ((s * vl) >> 7) * mv / 32768; Rr[i] = ((s * vr) >> 7) * mv / 32768; }
  LO.SNESX.analog(L, Rr);
  const hl = new LO.Biquad('hp', 22, 0.7), hr = new LO.Biquad('hp', 22, 0.7);
  for (let i = 0; i < n; i++) { L[i] = hl.run(L[i]) * prod.gain; Rr[i] = hr.run(Rr[i]) * prod.gain; }
  return { L, R: Rr, voice: best, role: roles[best] };
}
let last = null;   // the last mix (kept here so COSMIC can be made later without making the song again)
function finish(id, type, out, extra, opt) {
  last = { L: out.L.slice(), R: out.R.slice() };
  const fl = opt.post || {}, anyFx = fl.cosmic || fl.echo || fl.reverb;
  const c = anyFx ? LO.JBPost.post(out.L, out.R, LO.SR, fl, engine.song ? engine.song.meta.bpm : 120) : null;
  const bars = opt.bars ? voiceBars(engine.R) : null;
  const st = stealStem(engine.R, engine.prod);
  const tr = [out.L.buffer, out.R.buffer].concat(c ? [c.L.buffer, c.R.buffer] : [], bars ? bars.map(b => b.buffer) : [], st ? [st.L.buffer, st.R.buffer] : []);
  reply(id, type, { L: out.L, R: out.R, cL: c ? c.L : null, cR: c ? c.R : null, sL: st ? st.L : null, sR: st ? st.R : null, steal: st ? { voice: st.voice, role: st.role } : null, bars, info: songInfo(out, extra.ms), ...extra }, tr);
}

// a SoundFont instrument as a SNES sample: its loop stretched onto whole 16-sample blocks, its tuning from the generators
function sfInstruments(ab, file) {
  const dv = new DataView(ab), u8 = new Uint8Array(ab);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = u8[o + i]; if (!c) break; s += String.fromCharCode(c); } return s; };
  if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'sfbk') throw new Error('NOT A SOUNDFONT');
  const ch = {}; const walk = (o, end) => { while (o + 8 <= end) { const id = str(o, 4), sz = dv.getUint32(o + 4, true); if (id === 'LIST') walk(o + 12, Math.min(end, o + 8 + sz)); else ch[id] = { o: o + 8, sz }; o += 8 + sz + (sz & 1); } }; walk(12, ab.byteLength);
  const recs = (c, size, f) => { const out = []; if (!ch[c]) return out; for (let o = ch[c].o; o + size <= ch[c].o + ch[c].sz; o += size) out.push(f(o)); return out; };
  const inst = recs('inst', 22, o => ({ name: str(o, 20), bag: dv.getUint16(o + 20, true) })), ibag = recs('ibag', 4, o => dv.getUint16(o, true));
  const igen = recs('igen', 4, o => [dv.getUint16(o, true), dv.getInt16(o + 2, true)]);
  const shdr = recs('shdr', 46, o => ({ name: str(o, 20), start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), ls: dv.getUint32(o + 28, true), le: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), pitch: u8[o + 40], corr: dv.getInt8(o + 41) }));
  const out = [];
  for (let i = 0; i < inst.length - 1 && out.length < 64; i++) {
    const zs = []; for (let z = inst[i].bag; z < inst[i + 1].bag; z++) { const g = {}; for (let k = ibag[z]; k < ibag[z + 1]; k++) g[igen[k][0]] = igen[k][1]; zs.push(g); }
    const glob = zs.length && zs[0][53] === undefined ? zs.shift() : {};
    const zones = zs.map(z => ({ ...glob, ...z })).filter(z => z[53] !== undefined && shdr[z[53]] && shdr[z[53]].end - shdr[z[53]].start > 64);
    if (!zones.length) continue;
    const root = z => z[58] != null && z[58] >= 0 ? z[58] : (shdr[z[53]].pitch > 127 ? 60 : shdr[z[53]].pitch);
    zones.sort((a, b) => Math.abs(root(a) - 60) - Math.abs(root(b) - 60));
    const z = zones[0], h = shdr[z[53]], n = Math.min(h.end - h.start, h.rate * 3);
    let x = new Float32Array(n); for (let k = 0; k < n; k++) x[k] = dv.getInt16(ch.smpl.o + (h.start + k) * 2, true) / 32768;
    const tune = ((z[51] || 0) * 100 + (z[52] || 0) + h.corr);
    let f0 = 440 * Math.pow(2, (root(z) - tune / 100 - 69) / 12), rate = h.rate, loop = null;
    const mode = (z[54] || 0) & 3;
    if ((mode === 1 || mode === 3) && h.le > h.ls + 16 && h.le - h.start <= n) {
      const ls = h.ls - h.start, le = h.le - h.start, L = le - ls, Ln = Math.max(16, Math.round(L / 16) * 16), r = Ln / L, m = Math.round(le * r), o = new Float32Array(m);
      for (let k = 0; k < m; k++) { const p = k / r, a = Math.floor(p), f = p - a; o[k] = (x[a] || 0) * (1 - f) + (x[Math.min(a + 1, le - 1)] || 0) * f; }
      const st = m - Ln, pad = (16 - st % 16) % 16, o2 = new Float32Array(pad + m); o2.set(o, pad); x = o2; loop = st + pad; rate *= r;
    } else { const m = Math.ceil(x.length / 16) * 16, o2 = new Float32Array(m); o2.set(x); x = o2; }
    const nm = inst[i].name.toUpperCase().trim(); if (!nm || nm === 'EOI') continue;
    // v0.7.2 translooping: cross-fade the loop's end into what comes before its start, so the wrap is seamless
    if (loop != null) { const Ln = x.length - loop, X = Math.min(256, Ln >> 1, loop); for (let k = 0; k < X; k++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * (k + 0.5) / X), j = x.length - X + k; x[j] = x[j] * (1 - w) + x[loop - X + k] * w; } }
    // v0.7.2 true pitch: root keys are often an octave or two off the sound. YIN on the steady part (tuned sounds only)
    if (!/GLOCK|BELL|TIMPANI|CELESTA|DRUM|PERC|KIT|CYMBAL|SNARE|KICK|TOM|HAT|FX|NOISE/.test(nm) && LO.SNESI_HIFI && LO.SNESI_HIFI.yin) {
      const st = loop != null ? loop : Math.floor(x.length * 0.3), L = 8192, seg = new Float32Array(L);
      for (let k = 0; k < L; k++) { let q = st + k; if (q >= x.length) { if (loop == null) break; q = loop + (q - loop) % (x.length - loop); } seg[k] = x[q]; }
      const [fy, ap] = LO.SNESI_HIFI.yin(seg, rate);
      if (fy > 20 && ap < 0.06) { const c = 1200 * Math.log2(fy / f0), oc = Math.round(c / 1200), res = c - oc * 1200; if (oc) f0 *= Math.pow(2, oc); if (Math.abs(res) > 10 && Math.abs(res) < 80) f0 *= Math.pow(2, res / 1200); }
    }
    const words = { HARP: 'HARP', PIANO: 'PIANO', GUITAR: 'GUITAR', BASS: 'BASS', STRING: 'STRINGS', VIOLIN: 'STRINGS', CELLO: 'STRINGS', CHOIR: 'CHOIR', VOICE: 'CHOIR', AAH: 'CHOIR', ORGAN: 'ORGAN', FLUTE: 'FLUTE', PICCOLO: 'FLUTE', OBOE: 'OBOE', CLARINET: 'OBOE', HORN: 'HORN', TRUMPET: 'BRASS', BRASS: 'BRASS', TROMBONE: 'BRASS', TUBA: 'BRASS', SAX: 'SAX', MARIMBA: 'MARIMBA', XYLO: 'MARIMBA', VIBE: 'VIBES', GLOCK: 'GLOCK', BELL: 'GLOCK', CELESTA: 'CELESTA', TIMPANI: 'TIMPANI', PIZZ: 'PIZZ', PAD: 'PAD', SYNTH: 'PAD' };
    const fam = Object.entries(words).find(([w]) => nm.includes(w));
    const pluck = /HARP|PIANO|GUITAR|BASS|PIZZ|MARIMBA|XYLO|VIBE|GLOCK|BELL|CELESTA|TIMPANI|HARPSI|KOTO/.test(nm);
    const id = 'SF: ' + nm.slice(0, 14);
    out.push({ id, inst: { data: x, loop, baseF: f0, rate, adsr: pluck ? [15, 7, 7, LO.SNESI.srFor(1.2)] : [15, 0, 7, 0], vib: !pluck, kind: pluck ? 'PLUCK' : 'SUSTAIN', src: file, tags: { family: fam ? fam[1] : 'PAD', sound: pluck ? 'plucked' : 'held', moods: [], genres: [] } } });
  }
  return out;
}

self.onmessage = e => {
  const m = e.data; const t0 = Date.now();
  try {
    if (m.type === 'make') {
      // v0.7.3: draft 16 songs, keep the order of the benchmark's ranking (the best take is made first)
      const rank = LO.benchRank ? LO.benchRank(m.scene, m.dials, m.room, m.seed, 16) : [];
      const seeds = rank.length ? rank.map(r => r.seed) : [m.seed];
      const p = LO.jbParams(m.scene, m.dials, m.room, seeds[0]);
      p.history = history.slice(-50); p.loved = []; if (enhanced) p.fx.enhanced = true;
      // v0.7.2: the scene check, with retakes: up to 3 takes, the best one kept (fewest misses, then the Listener's score)
      let out = engine.generate(p), chk = LO.sceneCheck(engine.song, engine.R, out, LO.JB_SCENES[m.scene].name), takes = 1, best = { out, chk, seed: p.seed, song: engine.song, R: engine.R, fx: engine.fx, prod: engine.prod };
      const notes = [];
      while (!best.chk.ok && takes < 3) {
        notes.push(`TAKE ${takes}: ${best.chk.fails.join(', ')}`);
        const p2 = LO.jbParams(m.scene, m.dials, m.room, seeds[takes] != null ? seeds[takes] : (m.seed + 1009 * takes) >>> 0); p2.history = p.history; p2.loved = []; if (enhanced) p2.fx.enhanced = true;
        const o2 = engine.generate(p2), c2 = LO.sceneCheck(engine.song, engine.R, o2, LO.JB_SCENES[m.scene].name); takes++;
        if (c2.fails.length < best.chk.fails.length || (c2.fails.length === best.chk.fails.length && (c2.score || 0) > (best.chk.score || 0))) best = { out: o2, chk: c2, seed: p2.seed, song: engine.song, R: engine.R, fx: engine.fx, prod: engine.prod };
      }
      if (engine.song !== best.song) { engine.song = best.song; engine.R = best.R; engine.fx = best.fx; engine.prod = best.prod; }
      out = best.out;
      const sk = engine.song.meta.skeleton; if (sk) history.push({ ...sk, title: engine.song.title, seed: engine.song.seed });
      cur = { scene: m.scene, dials: m.dials, room: m.room, seed: best.seed };
      finish(m.id, 'song', out, { ms: Date.now() - t0, check: { takes, ok: best.chk.ok, fails: best.chk.fails, notes }, bench: rank.length ? { best: rank[0], drafts: rank.length, worst: rank[rank.length - 1].score } : null, mind: out.mind ? { score: out.mind.review.score, notes: out.mind.review.notes, events: out.mind.log.length, colors: out.mind.colors } : null }, { post: m.post || { cosmic: !!m.cosmic }, bars: true });
    } else if (m.type === 'room') {
      if (!engine.song) return reply(m.id, 'none', {});
      const room = LO.JB_ROOMS.find(r => r.name === m.room) || LO.JB_ROOMS[0];
      const out = engine.update({ edlPlay: room.edl, efb: room.efb, evol: room.evol, fir: room.fir, dry: room.dry == null ? 1 : room.dry, eonDrums: room.dry != null });
      if (cur) cur.room = m.room;
      finish(m.id, 'song', { ...out, mind: null }, { ms: Date.now() - t0, room: m.room }, { post: m.post || { cosmic: !!m.cosmic }, bars: false });
    } else if (m.type === 'cosmic') {
      if (!last) return reply(m.id, 'none', {});
      // v0.7.3: the studio layer (COSMIC / ECHO / REVERB in any combination) from the last console mix
      const fl = m.post || { cosmic: true }; if (!(fl.cosmic || fl.echo || fl.reverb)) return reply(m.id, 'none', {});
      const c = LO.JBPost.post(last.L, last.R, LO.SR, fl, engine.song ? engine.song.meta.bpm : 120);
      reply(m.id, 'cosmic', { cL: c.L, cR: c.R, ms: Date.now() - t0 }, [c.L.buffer, c.R.buffer]);
    } else if (m.type === 'mp3') {
      // v0.7.3 MP3 export: 192 kbps at the console's own 32 kHz, in the worker so the screen never stutters.
      // Encoder: LAME (lamejs, LGPL, used unmodified as its own file: lame.min.js; https://lame.sourceforge.io)
      if (!self.lamejs) importScripts('lame.min.js');
      const n = m.L.length, toI = x => { const o = new Int16Array(x.length); for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])); o[i] = v < 0 ? v * 32768 : v * 32767; } return o; };
      const L = toI(m.L), R = toI(m.R), enc = new lamejs.Mp3Encoder(2, 32000, 192), parts = []; let tot = 0;
      for (let i = 0; i < n; i += 1152) { const b = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)); if (b.length) { parts.push(b); tot += b.length; } }
      const f = enc.flush(); if (f.length) { parts.push(f); tot += f.length; }
      const out = new Uint8Array(tot); let o = 0; for (const b of parts) { out.set(new Uint8Array(b.buffer, b.byteOffset, b.length), o); o += b.length; }
      reply(m.id, 'mp3', { mp3: out, ms: Date.now() - t0 }, [out.buffer]);
    } else if (m.type === 'enhanced') { enhanced = !!m.on; reply(m.id, 'ok', {}); }
    else if (m.type === 'sf-add') {
      const list = sfInstruments(m.buf, m.file);
      for (const it of list) LO.SNESI_USER[it.id] = it.inst;
      reply(m.id, 'sf', { names: list.map(x => x.id), file: m.file });
    } else if (m.type === 'sf-clear') { LO.SNESI_USER = {}; reply(m.id, 'ok', {}); }
    else if (m.type === 'menusfx') {
      // the menu sounds, made by our own SNES chip: a mallet blip, a two-note chime, a soft drop, the chest's sparkle
      const V2 = { v2: true }, inst = LO.SNESI.family('GLOCK', 0, V2) || LO.SNESI.family('BELLS', 0), soft = LO.SNESI.family('HARP 2', 0, V2) || LO.SNESI.family('HARP', 0);
      const S = LO.CHIPS.SNES, n = (ms) => Math.round(ms * 32);
      const mk = (d, notes) => { const r = S.previewInst({ ...d, adsr: [15, 7, 7, 20] }, notes); return r.out.slice(0, Math.max(...notes.map(x => x.e)) + n(160)); };
      const sfx = {
        move: mk(inst, [{ s: 0, e: n(40), m: 84 }]),
        select: mk(inst, [{ s: 0, e: n(60), m: 84 }, { s: n(70), e: n(160), m: 91 }]),
        back: mk(soft, [{ s: 0, e: n(60), m: 72 }, { s: n(60), e: n(140), m: 67 }]),
        chest: mk(inst, [{ s: 0, e: n(50), m: 79 }, { s: n(55), e: n(105), m: 83 }, { s: n(110), e: n(160), m: 86 }, { s: n(165), e: n(320), m: 91 }]),
        make: mk(inst, [{ s: 0, e: n(70), m: 72 }, { s: n(80), e: n(150), m: 79 }, { s: n(160), e: n(300), m: 84 }]),
        dial: mk(soft, [{ s: 0, e: n(40), m: 79 }]),
      };
      reply(m.id, 'sfx', { sfx });
    }
  } catch (err) { reply(m.id, 'error', { msg: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 1200) }); }
};
