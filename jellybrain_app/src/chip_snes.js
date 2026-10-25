/* LowOrbit Chip Studio - Super Nintendo S-SMP / S-DSP profile (hardware-true limits)
   8 voices, real BRR compression (4-bit ADPCM, 4 prediction filters) encoded and decoded here,
   14-bit pitch registers, 4-tap Gaussian interpolation (shape modeled), hardware ADSR rate table,
   one shared noise generator, echo with 8-tap FIR, and the 64 KB audio RAM budget that the
   samples, the music data AND the echo buffer must all share. */
(function (G) {
  const LO = G.LO;
  const RATE = [0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];
  const FIR = {
    'NINTENDO LPF': [12, 33, 43, 43, 19, -2, -13, -7],
    'FLAT': [127, 0, 0, 0, 0, 0, 0, 0],
    'THIN': [52, 51, 0, -39, -27, 1, -4, -21],
    'SOFT': [64, 32, 16, 8, 4, 2, 1, 1],
    'NINTENDO SMW': [-1, 8, 23, 36, 36, 23, 8, -1],      // Super Mario World's echo filter (N-SPC preset 0)
    'UNDERWATER': [0, 0, 8, 24, 40, 40, 16, 0],          // v0.7.2: the FIR as an EQ (a heavy low-pass on the echo bus)
    'TELEPHONE': [0, -24, 0, 64, 0, -24, 0, 0],
    'CAVE LPF': [32, 32, 24, 16, 8, 4, 2, 0],            // v0.7.2: cave walls swallow the highs (sum 118: a touch under unity)
    'SOFT HALL': [64, 32, 16, 8, 4, 2, 1, 0],            // v0.7.2: a smooth exponential darkening (sum 127)
  };
  const RAM = 65536, RAM0 = RAM, DRIVER = 7 * 1024;
  const OPTS = LO.SNESI ? LO.SNESI.OPTIONS : ['CLASSIC'];

  // ---------------------------------------------------------------- BRR codec
  const clamp16 = x => (x > 32767 ? 32767 : x < -32768 ? -32768 : x);
  function brrPredict(f, p1, p2) {
    if (f === 0) return 0;
    if (f === 1) return p1 + ((-p1) >> 4);
    if (f === 2) return 2 * p1 + ((-3 * p1) >> 5) - p2 + (p2 >> 4);
    return 2 * p1 + ((-13 * p1) >> 6) - p2 + ((3 * p2) >> 4);
  }
  // v0.7.2: the look-ahead encoder. A greedy encoder picks each block's best filter alone; a bad history then costs the
  // next block. This one keeps the 4 best candidates per block and scores each with the best result of the block after.
  function brrBlock(pcm, b, f, sh, p1, p2) {
    let q1 = p1, q2 = p2, err = 0; const dec = new Int16Array(16);
    for (let i = 0; i < 16; i++) {
      const x = pcm[b * 16 + i], pred = brrPredict(f, q1, q2);
      let nib = Math.round(((x - pred) * 2) / (1 << sh)); nib = nib > 7 ? 7 : nib < -8 ? -8 : nib;
      const v = clamp16(((nib << sh) >> 1) + pred); dec[i] = v; err += (v - x) * (v - x); q2 = q1; q1 = v;
    }
    return { err, dec, q1, q2 };
  }
  function brrBest(pcm, b, filters, p1, p2, keep) {
    const c = []; for (const f of filters) for (let sh = 0; sh <= 12; sh++) c.push(brrBlock(pcm, b, f, sh, p1, p2));
    c.sort((x, y) => x.err - y.err); return c.slice(0, keep);
  }
  function brrRoundTrip2(src, loopStart) {
    const nb = Math.ceil(src.length / 16), pcm = new Int16Array(nb * 16);
    pcm.set(src.subarray ? src.subarray(0, Math.min(src.length, pcm.length)) : src);
    const out = new Int16Array(nb * 16), loopBlock = loopStart == null ? -1 : Math.floor(loopStart / 16);
    const F = b => (b === 0 || b === loopBlock) ? [0] : [0, 1, 2, 3];
    let p1 = 0, p2 = 0;
    for (let b = 0; b < nb; b++) {
      const cand = brrBest(pcm, b, F(b), p1, p2, 4); let best = cand[0], bs = Infinity;
      if (b + 1 < nb && cand.length > 1) for (const c of cand) { const nx = brrBest(pcm, b + 1, F(b + 1), c.q1, c.q2, 1)[0]; const t = c.err + nx.err; if (t < bs) { bs = t; best = c; } }
      out.set(best.dec, b * 16); p1 = best.q1; p2 = best.q2;
    }
    return { pcm: out, bytes: nb * 9 };
  }
  function brrRoundTrip(src, loopStart) {
    // pad to whole 16-sample blocks
    const nb = Math.ceil(src.length / 16), pcm = new Int16Array(nb * 16);
    pcm.set(src.subarray ? src.subarray(0, Math.min(src.length, pcm.length)) : src);
    const out = new Int16Array(nb * 16);
    let p1 = 0, p2 = 0;
    const loopBlock = loopStart == null ? -1 : Math.floor(loopStart / 16);
    for (let b = 0; b < nb; b++) {
      let best = null;
      const filters = (b === 0 || b === loopBlock) ? [0] : [0, 1, 2, 3];
      for (const f of filters) {
        for (let sh = 0; sh <= 12; sh++) {
          let q1 = p1, q2 = p2, err = 0; const dec = new Int16Array(16);
          for (let i = 0; i < 16; i++) {
            const x = pcm[b * 16 + i];
            const pred = brrPredict(f, q1, q2);
            let nib = Math.round(((x - pred) * 2) / (1 << sh));
            nib = nib > 7 ? 7 : nib < -8 ? -8 : nib;
            let s = sh <= 12 ? ((nib << sh) >> 1) : 0;
            s = clamp16(s + pred);
            dec[i] = s; err += (s - x) * (s - x);
            q2 = q1; q1 = s;
            if (best && err >= best.err) break;
          }
          if (!best || err < best.err) best = { err, dec, q1, q2 };
        }
      }
      out.set(best.dec, b * 16); p1 = best.q1; p2 = best.q2;
    }
    return { pcm: out, bytes: nb * 9 };
  }

  // ---------------------------------------------------------------- instrument sources
  function toI16(arr, peak) {
    let pk = 1e-9; for (const x of arr) pk = Math.max(pk, Math.abs(x));
    const o = new Int16Array(arr.length), P = peak || 30000;
    for (let i = 0; i < arr.length; i++) o[i] = Math.round(arr[i] / pk * P);
    return o;
  }
  // v0.6 library samples are encoded the way a careful BRR encoder does: inside the range a filter-0 block can
  // really hold (shift 12 tops out near 14,300), so the loop block never clips. The driver volume makes up the level.
  const LIB_PEAK = 14000, LIB_GAIN = 30000 / LIB_PEAK;
  function cycle(kind, len, cyclesA, cyclesB) {
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const pa = (i * cyclesA / len) % 1, pb = cyclesB ? (i * cyclesB / len) % 1 : null;
      const w = p => {
        if (kind === 'pulse') return p < 0.25 ? 1 : -1;
        if (kind === 'square') return p < 0.5 ? 1 : -1;
        if (kind === 'saw') { let s = 0; for (let k = 1; k <= 14; k++) s += Math.sin(2 * Math.PI * k * p) / k; return s; }
        if (kind === 'soft') return Math.sin(2 * Math.PI * p) + 0.2 * Math.sin(6 * Math.PI * p);
        if (kind === 'brass') { let s = 0; for (let k = 1; k <= 12; k++) s += Math.sin(2 * Math.PI * k * p) / Math.pow(k, 0.9); return s; }
        if (kind === 'strings') { let s = 0; for (let k = 1; k <= 10; k++) s += Math.sin(2 * Math.PI * k * p) / (k * 1.2); return s; }
        if (kind === 'bass') return Math.sin(2 * Math.PI * p) + 0.5 * Math.sin(4 * Math.PI * p) + 0.25 * Math.sin(6 * Math.PI * p);
        return Math.sin(2 * Math.PI * p);
      };
      a[i] = w(pa) + (pb != null ? w(pb) : 0);
    }
    return toI16(a);
  }
  function oneShot(kind, sr, dur) {
    const n = Math.floor(sr * dur), a = new Float32Array(n), f = 523.25;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (kind === 'rhodes') a[i] = Math.sin(2 * Math.PI * f * t + 1.6 * Math.exp(-t / 0.35) * Math.sin(2 * Math.PI * f * t)) * Math.exp(-t * 1.4) + 0.08 * Math.sin(2 * Math.PI * f * 7 * t) * Math.exp(-t * 30);
      else a[i] = Math.sin(2 * Math.PI * f * t + 2.2 * Math.exp(-t / 0.4) * Math.sin(2 * Math.PI * f * 3.5 * t)) * Math.exp(-t * 2.2);
    }
    return toI16(a);
  }

  // Build the sample bank and fit everything into 64 KB, the way real composers had to
  function buildBankClassic(song, fx, eventsCount) {
    const R = LO.rng(song.seed ^ 0x5DE);
    const leadKind = { pulse: 'pulse', saw: 'saw', sax: 'soft', bell: 'bell', brass: 'brass' }[song.meta.leadTimbre] || 'square';
    const padKind = song.meta.padTimbre === 'rhodes' ? 'rhodes' : song.meta.padTimbre === 'strings' ? 'strings' : 'saw';
    const actions = [];
    let drumRate = 16000, padLoop = 2048, oneShotRate = 16000;
    const seqBytes = eventsCount * 3;
    let edl = fx.edl;
    for (let attempt = 0; attempt < 8; attempt++) {
      const inst = {};
      const add = (name, pcm, loopStart, baseF, rate) => {
        const rt = brrRoundTrip(pcm, loopStart);
        inst[name] = { pcm: rt.pcm, loop: loopStart, bytes: rt.bytes, baseF, rate };
      };
      if (leadKind === 'bell') add('lead', oneShot('bell', oneShotRate, 0.8), null, 523.25, oneShotRate);
      else add('lead', cycle(leadKind, 64, 1), 0, 500, 32000);
      add('counter', cycle(leadKind === 'bell' ? 'soft' : (leadKind === 'pulse' ? 'square' : 'soft'), 64, 1), 0, 500, 32000);
      if (padKind === 'rhodes') add('pad', oneShot('rhodes', oneShotRate, 1.0), null, 523.25, oneShotRate);
      else add('pad', cycle(padKind, padLoop, padLoop / 64, padLoop / 64 + 1), 0, 32000 * (padLoop / 64) / padLoop, 32000);
      add('bass', cycle('bass', 64, 1), 0, 500, 32000);
      for (const k of ['kick', 'snare', 'clap', 'crash', 'rim', 'tom', 'timp']) {
        const src = LO.drumSource(k, drumRate, R, k === 'timp' ? 40 : 47);
        add(k, toI16(src), null, null, drumRate);
      }
      const sampleBytes = Object.values(inst).reduce((a, s) => a + s.bytes, 0);
      const fixed = DRIVER + seqBytes + sampleBytes;
      const maxEdl = Math.max(0, Math.min(15, Math.floor((RAM - fixed) / 2048)));
      if (edl > maxEdl) { if (attempt === 0) actions.push('ECHO SHORTENED TO FIT 64 KB'); edl = maxEdl; }
      const used = fixed + edl * 2048;
      if (used <= RAM && (maxEdl >= 3 || attempt >= 4)) {
        return { inst, used, edl, maxEdl, actions, sampleBytes, seqBytes };
      }
      // over budget: degrade like a real composer would
      if (drumRate > 8000) { drumRate = Math.round(drumRate / 2); actions.push('DRUMS RESAMPLED TO ' + Math.round(drumRate / 1000) + ' KHZ'); }
      else if (padLoop > 512) { padLoop /= 2; actions.push('PAD LOOP SHORTENED'); }
      else if (oneShotRate > 8000) { oneShotRate /= 2; actions.push('ONE-SHOTS RESAMPLED'); }
    }
    return null;
  }

  // v0.6: the instrument library. A slot left on CLASSIC builds exactly what the classic bank built.
  // Two slots with the same instrument share one sample, like on the real console.
  function buildBank(song, fx, eventsCount) {
    const sel = { lead: fx.ilead || 'CLASSIC', counter: fx.icounter || 'CLASSIC', pad: fx.ipad || 'CLASSIC', bass: fx.ibass || 'CLASSIC', timp: fx.itimp || 'CLASSIC' };
    if (!LO.SNESI || (sel.lead === 'CLASSIC' && sel.counter === 'CLASSIC' && sel.pad === 'CLASSIC' && sel.bass === 'CLASSIC' && sel.timp === 'CLASSIC')) return buildBankClassic(song, fx, eventsCount);
    const R = LO.rng(song.seed ^ 0x5DE);
    const leadKind = { pulse: 'pulse', saw: 'saw', sax: 'soft', bell: 'bell', brass: 'brass' }[song.meta.leadTimbre] || 'square';
    const padKind = song.meta.padTimbre === 'rhodes' ? 'rhodes' : song.meta.padTimbre === 'strings' ? 'strings' : 'saw';
    const my = (song.params && song.params.myInst) || [];
    const actions = [];
    let drumRate = 16000, padLoop = 2048, oneShotRate = 16000, q = 0;
    const seqBytes = eventsCount * 3;
    let edl = fx.edl;
    const want = Math.min(fx.edl, 5); // keep at least 80 MS of real echo when the song asked for it
    const RAM = fx.enhanced ? 1 << 22 : RAM0;   // v0.7 ENHANCED: no 64 KB limit (AUTHENTIC, the default, is the real console)
    const steps = ['q1', 'drums', 'q2', 'q3', 'pad', 'oneshot'];
    const missing = new Set();
    // v0.7.2 (lib 2): true pitch, pre-emphasis, and an octave-shifted rebuild whenever a part's top note would hit the
    // 14-bit pitch ceiling (4x): the sample is rebuilt at half (or a quarter) the rate, as real composers resampled
    const V2 = (song.meta.lib || 0) >= 2;
    const topOf = role => { const P = song.parts; let t = -1;
      if (role === 'pad') { for (const c of P.chords || []) for (const x of c.tones) t = Math.max(t, x + 12); }
      else if (role === 'timp') { for (const d of P.drums || []) if (d.kind === 'timp' && d.m != null) t = Math.max(t, d.m); }
      else for (const n of P[role] || []) t = Math.max(t, n.m + (n.arp ? Math.max(0, ...n.arp) : 0));
      if (role === 'counter' && P.arp) for (const n of P.arp) t = Math.max(t, n.m);
      return t < 0 ? null : t + 1; };   // +1: vibrato and scoops
    const fam2 = (name, q, roles) => {
      if (!V2) return LO.SNESI.family(name, q);
      const d0 = LO.SNESI.family(name, q, { v2: true }); if (!d0 || !d0.baseF) return d0;
      let top = -1; for (const r of roles) { const t = topOf(r); if (t != null) top = Math.max(top, t); }
      if (top < 0) return d0;
      const ratio = (LO.m2f(top) / d0.baseF) * (d0.rate / 32000); let div = 1; while (ratio / div > 3.99 && div < 8) div *= 2;
      // pitch-chained bass: the bass sample is made an octave up and played down (half the RAM, the Gaussian smooths the lows)
      if (roles.includes('bass') && roles.length === 1 && div === 1 && LO.SNESI_HIFI && LO.SNESI_HIFI.LIB[name] && !(song.meta.tricks || {}).noChain) { div = 2; if (!actions.includes('BASS PITCH-CHAINED: SAMPLED AN OCTAVE UP, PLAYED DOWN')) actions.push('BASS PITCH-CHAINED: SAMPLED AN OCTAVE UP, PLAYED DOWN'); }
      return div > 1 ? LO.SNESI.family(name, q, { v2: true, div }) || d0 : d0; };
    const rolesOf = name => ['lead', 'counter', 'pad', 'bass', 'timp'].filter(r => sel[r] === name);
    for (let attempt = 0; attempt < 12; attempt++) {
      const inst = {}, made = {};
      const brr = (pcm, loopStart, baseF, rate, extra) => { const rt = (V2 ? brrRoundTrip2 : brrRoundTrip)(pcm, loopStart); return { pcm: rt.pcm, loop: loopStart, bytes: rt.bytes, baseF, rate, ...(extra || {}) }; };
      const classic = role => {
        if (role === 'lead') return leadKind === 'bell' ? brr(oneShot('bell', oneShotRate, 0.8), null, 523.25, oneShotRate) : brr(cycle(leadKind, 64, 1), 0, 500, 32000);
        if (role === 'counter') return brr(cycle(leadKind === 'bell' ? 'soft' : (leadKind === 'pulse' ? 'square' : 'soft'), 64, 1), 0, 500, 32000);
        return padKind === 'rhodes' ? brr(oneShot('rhodes', oneShotRate, 1.0), null, 523.25, oneShotRate) : brr(cycle(padKind, padLoop, padLoop / 64, padLoop / 64 + 1), 0, 32000 * (padLoop / 64) / padLoop, 32000);
      };
      const lib = role => {
        const name = sel[role]; if (name === 'CLASSIC') return null;
        if (made[name]) return made[name];
        let d = null;
        if (name.startsWith('MY: ')) { const p = my.find(m => 'MY: ' + m.name === name); if (p) d = LO.SNESI.fromProfile(p, q, p.tune); }
        else d = fam2(name, q, rolesOf(name));
        if (!d) { missing.add(name); return null; }
        return (made[name] = brr(toI16(d.data, LIB_PEAK), d.loop, d.baseF, d.rate, { adsr: d.adsr, vib: d.vib, lib: name, how: d.how, kind: d.kind, gain: LIB_GAIN }));
      };
      for (const role of ['lead', 'counter', 'pad']) {
        const name = sel[role];
        if (name === 'CLASSIC') { inst[role] = classic(role); continue; }
        if (made[name]) { inst[role] = made[name]; continue; }
        let d = null;
        if (name.startsWith('MY: ')) { const p = my.find(m => 'MY: ' + m.name === name); if (p) d = LO.SNESI.fromProfile(p, q, p.tune); }
        else d = fam2(name, q, rolesOf(name));
        if (!d) { missing.add(name); inst[role] = classic(role); continue; }
        made[name] = inst[role] = brr(toI16(d.data, LIB_PEAK), d.loop, d.baseF, d.rate, { adsr: d.adsr, vib: d.vib, lib: name, how: d.how, kind: d.kind, gain: LIB_GAIN });
      }
      inst.bass = lib('bass') || brr(cycle('bass', 64, 1), 0, 500, 32000);
      // v0.7.2 tricks that need a second sample: wave-switching pads (chords alternate two pad sounds) and the per-section
      // sample swap (section B reloads the melody's sample into the same RAM, as Secret-of-Mana-era drivers did)
      const TRB = { ...(song.meta.tricks || {}), ...(fx.tricks || {}) }, fam = n => LO.SNESI_HIFI ? LO.SNESI_HIFI.familyOf(n) : n;
      const byName = (nm, roles) => { if (!nm || !LO.SNESI.family(nm, q)) return null; if (made[nm]) return made[nm]; const d = fam2(nm, q, roles); return d ? (made[nm] = brr(toI16(d.data, LIB_PEAK), d.loop, d.baseF, d.rate, { adsr: d.adsr, vib: d.vib, lib: nm, how: d.how, kind: d.kind, gain: LIB_GAIN })) : null; };
      if (V2 && TRB.waveSwitch && sel.pad !== 'CLASSIC') { const P2 = { STRINGS: 'CHOIR 2', CHOIR: 'STRINGS 2', PAD: 'STRINGS 3', ORGAN: 'CHOIR 2', EPIANO: 'VIBES' }[fam(sel.pad)] || 'STRINGS 2'; const x = P2 !== sel.pad ? byName(P2, ['pad']) : null; if (x) inst.pad2 = x; }
      if (V2 && TRB.swapB && sel.lead !== 'CLASSIC') { const L2 = { HORN: 'BRASS 2', BRASS: 'HORN', TROMBONE: 'HORN', FLUTE: 'OBOE', OBOE: 'FLUTE 2', STRINGS: 'HORN', GUITAR: 'E.GUITAR 2', SAX: 'FLUTE 2', ORGAN: 'CHOIR 2', VIBES: 'MARIMBA 2', MARIMBA: 'VIBES', GLOCK: 'CELESTA', CELESTA: 'VIBES', HARP: 'FLUTE 2', PIANO: 'E.PIANO', EPIANO: 'VIBES' }[fam(sel.lead)] || 'HORN'; const x = L2 !== sel.lead ? byName(L2, ['lead']) : null; if (x && x !== inst.lead) inst.lead2 = x; }
      const tl = lib('timp');
      // v0.6.1: only the drums the song really plays go into the 64 KB (the snare stays: it stands in for any other hit)
      const usedK = song.meta.orch ? new Set(song.parts.drums.map(d => d.kind).concat(['snare'])) : null;
      // v0.7.2 (lib 2): a sampled kit rebuilt from measured hits; orchestral percussion keeps its own math drums
      const KIT = V2 && LO.SNESD && song.meta.drumStyle !== 'orch' ? (fx.kit || song.meta.kit || LO.SNESD.autoKit(song)) : null, kit = KIT ? LO.SNESD.KITS[KIT] : null, kmade = {};
      const kitHit = k => { const nm = kit && kit[k]; if (!nm) return null; if (kmade[nm]) return kmade[nm]; const h = LO.SNESD.hit(nm, drumRate); return h ? (kmade[nm] = brr(toI16(h.data), null, null, h.rate, { lib: nm })) : null; };
      for (const k of ['kick', 'snare', 'clap', 'crash', 'rim', 'tom', 'timp']) { if (k === 'timp' && tl) { inst.timp = tl; continue; } if (usedK && !usedK.has(k)) continue; inst[k] = (k !== 'timp' && kitHit(k)) || brr(toI16(LO.drumSource(k, drumRate, R, k === 'timp' ? 40 : 47)), null, null, drumRate); }
      if (kit && (fx.tricks || song.meta.tricks || {}).sampledHats) for (const k of ['hat', 'ohat']) { const h = kitHit(k); if (h) inst[k] = h; }
      let sampleBytes = [...new Set(Object.values(inst))].reduce((a, s) => a + s.bytes, 0);
      if (inst.lead2 && inst.lead2 !== inst.lead && ![inst.counter, inst.pad, inst.pad2, inst.bass].includes(inst.lead2)) sampleBytes -= Math.min(inst.lead.bytes, inst.lead2.bytes);   // one RAM region, two samples in turn
      const fixed = DRIVER + seqBytes + sampleBytes;
      const maxEdl = Math.max(0, Math.min(15, Math.floor((RAM - fixed) / 2048)));
      edl = Math.min(fx.edl, maxEdl);
      const used = fixed + edl * 2048;
      if (used <= RAM && (maxEdl >= want || !steps.length)) {
        if (edl < fx.edl) actions.unshift('ECHO SHORTENED TO FIT 64 KB');
        for (const m of missing) actions.push(m + ' IS GONE: CLASSIC SOUND USED');
        const info = {};
        for (const role of ['lead', 'counter', 'pad', 'bass', 'timp']) { const s = inst[role]; if (!s || ((role === 'bass' || role === 'timp') && !s.lib)) continue; info[role] = { name: s.lib || 'CLASSIC', how: s.how || 'CLASSIC CHIP WAVE', bytes: s.bytes, shared: role !== 'lead' && s.lib && Object.keys(info).some(r => info[r].name === s.lib), loop: s.loop, rate: s.rate, adsr: s.adsr || ADSR[role] || ADSR.drum }; }
        return { inst, used, edl, maxEdl, actions, sampleBytes, seqBytes, info, q, kit: KIT };
      }
      // over budget: trim like a real composer would, one step at a time
      const st = steps.shift();
      if (st === 'q1') { q = 1; actions.push('INSTRUMENT ATTACKS SHORTENED'); }
      else if (st === 'drums') { drumRate = 8000; actions.push('DRUMS RESAMPLED TO 8 KHZ'); }
      else if (st === 'q2') { q = 2; actions.push('INSTRUMENTS RESAMPLED TO 16 KHZ'); }
      else if (st === 'q3') { q = 3; actions.push('INSTRUMENTS TRIMMED TO THE BONE'); }
      else if (st === 'pad') { padLoop = 512; actions.push('PAD LOOP SHORTENED'); }
      else if (st === 'oneshot') { oneShotRate = 8000; actions.push('ONE-SHOTS RESAMPLED'); }
    }
    return buildBankClassic(song, fx, eventsCount);
  }

  // Gaussian interpolation kernel (shape fitted to the hardware table's center/neighbor ratio)
  const GAUSS = new Float32Array(256 * 4);
  for (let fi = 0; fi < 256; fi++) {
    const f = fi / 256, d = [1 + f, f, 1 - f, 2 - f];
    const w = d.map(x => Math.exp(-(x / 0.89) * (x / 0.89))); const s = w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 4; k++) GAUSS[fi * 4 + k] = w[k] / s;
  }

  const ADSR = {
    lead: [15, 5, 6, 0], counter: [14, 5, 5, 0], pad: [8, 3, 6, 0], bass: [15, 6, 5, 9],
    drum: [15, 7, 7, 0], hat: [15, 7, 0, 28], ohat: [15, 7, 1, 21],
  };

  function renderVoice(events, total, bank, role, useNoise) {
    const out = new Float32Array(total);
    const VEL = !!bank.vel; // v0.6.1: the driver sets each note's volume from its velocity (older songs: full volume)
    let noise = 0x4000;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + 1200);
      let inst, pitch;
      const kind = role === 'drum' ? ev.kind : role;
      inst = useNoise ? null : (bank.inst[role === 'drum' ? (bank.inst[ev.kind] ? ev.kind : 'snare') : role]);
      const [AR, DR, SL, SR] = useNoise ? ADSR[ev.kind === 'ohat' ? 'ohat' : 'hat'] : role === 'drum' ? ((VEL && inst.adsr) || ADSR.drum) : (inst.adsr || ADSR[role]);
      const vg = VEL ? Math.pow(LO.clamp(ev.v == null ? 1 : ev.v, 0, 1), 1.4) : 1;
      let env = 0, phase = 'a', cnt = 0, idx = 0, counter = 0;
      const hist = [0, 0, 0, 0];
      for (let i = ev.s; i < end; i++) {
        // pitch register (14-bit), with slides / vibrato / arpeggio done by the driver per 1/60 s
        const k = Math.floor((i - ev.s) / (LO.SR / 60));
        if (!useNoise) {
          let ratio;
          if (inst.baseF) {
            let m = ev.m;
            if (ev.arp) m += ev.arp[k % ev.arp.length];
            if (ev.slide && ev.prevM != null && k < 6) m = ev.prevM + (ev.m - ev.prevM) * (k / 6);
            if ((role === 'lead' || role === 'counter') && k > 15 && inst.vib !== false) m += 0.15 * Math.sin(2 * Math.PI * k / 10);
            ratio = (LO.m2f(m) / inst.baseF) * (inst.rate / 32000);
          } else {
            ratio = (inst.rate / 32000) * ((kind === 'tom' || kind === 'timp') ? Math.pow(2, ((ev.m || 47) - 47) / 12) : 1);
          }
          pitch = Math.min(0x3FFF, Math.max(1, Math.round(ratio * 0x1000)));
        }
        // envelope (11-bit) with the hardware rate table
        const gateOff = i >= ev.e;
        if (gateOff) { env -= 8; if (env < 0) env = 0; }
        else {
          const ri = phase === 'a' ? AR * 2 + 1 : phase === 'd' ? DR * 2 + 16 : SR;
          const per = RATE[ri];
          if (per && ++cnt >= per) {
            cnt = 0;
            if (phase === 'a') { env += AR === 15 ? 1024 : 32; if (env >= 0x7FF) { env = 0x7FF; phase = 'd'; } }
            else if (phase === 'd') { env -= ((env - 1) >> 8) + 1; if (env <= (SL + 1) * 0x100) phase = 's'; }
            else { env -= ((env - 1) >> 8) + 1; if (env < 0) env = 0; }
          }
        }
        let s;
        if (useNoise) {
          const fb = ((noise << 13) ^ (noise << 14)) & 0x4000; noise = (noise >> 1) | fb;
          s = ((noise << 17) >> 16);
        } else {
          counter += pitch;
          while (counter >= 0x1000) {
            counter -= 0x1000; idx++;
            if (idx >= inst.pcm.length) { if (inst.loop != null) idx = inst.loop; else { idx = -1; break; } }
            hist[0] = hist[1]; hist[1] = hist[2]; hist[2] = hist[3]; hist[3] = inst.pcm[idx];
          }
          if (idx < 0) { out[i] = 0; continue; }
          const fi = (counter >> 4) & 0xFF;
          s = hist[0] * GAUSS[fi * 4] + hist[1] * GAUSS[fi * 4 + 1] + hist[2] * GAUSS[fi * 4 + 2] + hist[3] * GAUSS[fi * 4 + 3];
        }
        out[i] = (inst && inst.gain ? (s * env / 2048) / 32768 * inst.gain : (s * env / 2048) / 32768) * vg;
      }
    }
    return out;
  }

  // ================================================================ v0.7.2 EXACT (Jelly Brain): the console's integer DSP
  // and Nintendo's N-SPC driver behavior: gated note lengths, squared velocity, delayed vibrato, pitch scoops.
  const famOfInst = s => s && s.lib && LO.SNESI_HIFI ? LO.SNESI_HIFI.familyOf(s.lib) : (s && s.lib) || null;
  const VIB = { STRINGS: 0.22, FLUTE: 0.18, OBOE: 0.2, HORN: 0.14, BRASS: 0.12, SAX: 0.22, CHOIR: 0.1, PAD: 0.08 };
  const SCOOP = new Set(['BRASS', 'HORN', 'SAX', 'GUITAR']);
  function gate(evs, role, inst, spb) {
    const SR = LO.SR, held = inst && inst.kind === 'SUSTAIN', fam = famOfInst(inst);
    for (const ev of evs) {
      const beats = (ev.e - ev.s) / (spb * SR);
      let g = 1;
      if (role === 'pad') g = 1;
      else if (role === 'bass') g = beats <= 0.55 ? 0.7 : 0.9;
      else if (held && !ev.slide) g = beats < 0.6 ? 0.8 : 0.9;      // the N-SPC gate table: 80% / 90% (ties and slides stay 100%)
      ev.e = ev.s + Math.max(160, Math.round((ev.e - ev.s) * g));
      if ((role === 'lead' || role === 'counter') && SCOOP.has(fam) && beats >= 1 && !ev.slide) ev.scoop = -1;
    }
    return evs;
  }
  function renderExact(song, fx, T, total, bank, E) {
    const X = LO.SNESX, spb = 60 / song.meta.bpm, I = bank.inst;
    const vibOf = s => { const f = famOfInst(s); return s && s.kind === 'SUSTAIN' ? (VIB[f] != null ? VIB[f] : 0.12) : 0; };
    gate(E.lead, 'lead', I.lead, spb); gate(E.counter, 'counter', I.counter, spb); gate(E.bass, 'bass', I.bass, spb);
    for (const p of E.pads) gate(p, 'pad', I.pad, spb);
    for (const h of E.hats) { h.nrate = h.kind === 'ohat' ? (h.swell ? 27 : 29) : 31; if (h.swell) { h.gain = { mode: 'bent', rate: 26 }; } }
    const o = { adsrTable: ADSR };
    // v0.7.2 hardware tricks: the scene's sheet may rearrange the 8 voices (each trick costs a voice, as on the console)
    const TR = { ...(song.meta.tricks || {}), ...(fx.tricks || {}) };
    if (!I.sine) { const rt = brrRoundTrip(toI16(cycle('sine', 64, 1), LIB_PEAK), 0); I.sine = { pcm: rt.pcm, loop: 0, bytes: rt.bytes, baseF: 500, rate: 32000, adsr: [15, 0, 7, 0], vib: false }; }
    const semis = r => 12 * Math.log2(r);
    // a muted modulator voice for PMON: follows the carrier's notes at a frequency ratio, its loudness is the FM depth
    const modOf = (ev, ratio, gain, fixedHz) => ev.map(e => ({ s: e.s, e: e.e, m: fixedHz ? 69 + semis(fixedHz / 440) : e.m + semis(ratio), v: 1, gain }));
    const plan = [
      { ev: E.lead, role: 'lead', mix: 'lead', opt: { vib: vibOf(I.lead) } },
      { ev: E.counter, role: 'counter', mix: 'counter', opt: { vib: vibOf(I.counter) } },
      { ev: E.pads[0], role: 'pad', mix: 'pad', opt: { vib: 0 } }, { ev: E.pads[1], role: 'pad', mix: 'pad', opt: { vib: 0 } },
      E.TV ? { ev: E.timpEv, role: 'drum', mix: 'timp' } : { ev: E.pads[2], role: E.ARPS ? 'counter' : 'pad', mix: 'pad' },
      { ev: E.bass, role: 'bass', mix: 'bass' }, { ev: E.drums, role: 'drum', mix: 'drums' }, { ev: E.hats, role: 'drum', mix: 'noise', opt: { noise: true } },
    ];
    const used = [];
    // PMON lead: V0 becomes a muted modulator, the melody moves to V1 and the counter takes V2 (one pad fewer).
    // 'vib' = a slow sine LFO whose GAIN rises linearly (hardware delayed vibrato); 'fm' = a fast ratio modulator (bells, clangs, leads)
    if (TR.pmLead && !E.TV) {
      const fm = TR.pmLead === 'fm', mod = fm ? modOf(E.lead, TR.ratio || 1.41, { mode: 'exp', rate: TR.decay || 22 }) : modOf(E.lead, 0, { mode: 'lin', rate: 9 }, TR.lfoHz || 5.6);
      plan.splice(0, 3, { ev: mod, role: 'sine', mix: 'mod', opt: { amp: fm ? (TR.depth || 0.9) : (Math.pow(2, (TR.cents || 22) / 1200) - 1) * 32768 / LIB_PEAK } }, { ...plan[0], pm: 0, opt: { vib: 0 } }, plan[1]);
      used.push('PMON ' + (fm ? 'FM LEAD' : 'HARDWARE VIBRATO'));
    }
    // FM bass (the Koshiro recipe): V4 becomes the bass's muted sine modulator at 2:1, decaying fast: a bright slap into a warm sustain
    if (TR.fmBass && !E.TV) {
      plan[4] = { ev: modOf(E.bass, TR.fmBass.ratio || 1, { mode: 'exp', rate: TR.fmBass.decay || 24 }), role: 'sine', mix: 'mod', opt: { amp: TR.fmBass.depth || 0.9 } };
      plan[5] = { ...plan[5], pm: 4 }; used.push('PMON FM BASS');
    }
    // the free voice (V3, the second pad) can carry ONE of: a detuned double of the melody (softness), or a fake echo
    // (the same line a few ticks later and quieter: delay without spending a byte of echo RAM)
    const li = plan.findIndex(v => v.mix === 'lead');
    if (TR.detune && plan[3].mix === 'pad') { plan[3] = { ev: plan[li].ev.map(e => ({ ...e, det: (TR.detune || 4) / 100 })), role: 'lead', mix: 'double', opt: { vib: vibOf(I.lead) * 0.8 } }; used.push('DETUNED DOUBLE +' + (TR.detune || 4) + ' CENTS'); }
    // the fake echo also steps in by itself when the 64 KB forced a shorter echo than the room asked for
    const shortEcho = !TR.noAutoEcho && (fx.edlPlay != null ? fx.edlPlay : fx.edl) > bank.edl && bank.edl < 4;
    if (shortEcho && !TR.fakeEcho && !TR.detune) TR.fakeEcho = { ticks: 24, auto: true };
    if (TR.detune && plan[3].mix === 'pad') { /* handled above */ }
    else if (TR.fakeEcho && plan[3].mix === 'pad') { const d = Math.round((TR.fakeEcho.ticks || 24) / 48 * spb * LO.SR); plan[3] = { ev: plan[li].ev.map(e => ({ ...e, s: e.s + d, e: e.e + d, v: (e.v == null ? 1 : e.v) * 0.55 })).filter(e => e.s < total), role: 'lead', mix: 'echo', opt: { vib: 0 } }; used.push('FAKE ECHO ' + (TR.fakeEcho.ticks || 24) + ' TICKS' + (TR.fakeEcho.auto ? ' (ECHO RAM WAS SHORT)' : '')); }
    // a noise bed on V7 when the song has no hi-hats: wind, waves or low rumble, swept by software GAIN writes
    if (TR.noiseBed && !E.hats.length) {
      const nb = TR.noiseBed, seg = Math.round((nb.period || 4) * LO.SR), ev = [];
      for (let t0 = 0; t0 < total; t0 += seg) { const gseq = [{ t: 0, mode: 'lin', rate: nb.rise || 14 }, { t: seg >> 1, mode: 'exp', rate: nb.fall || 12 }]; ev.push({ s: t0, e: Math.min(total, t0 + seg), kind: 'hat', nrate: nb.clock || 18, gain: gseq[0], gseq }); }
      plan[7] = { ev, role: 'drum', mix: 'bed', opt: { noise: true } }; used.push('NOISE BED (CLOCK ' + (nb.clock || 18) + ')');
    }
    // SOFT: slow attacks (AR 1-4 on the pads, the sheet's choice on the melody); CAREFUL: pads swell and fade like breathing
    const SOFT = song.meta.soft; if (SOFT) for (const P of plan) { if (P.mix === 'pad') P.opt = { ...(P.opt || {}), ar: SOFT.padAR }; if ((P.mix === 'lead' || P.mix === 'double') && SOFT.leadAR != null) P.opt = { ...(P.opt || {}), ar: SOFT.leadAR }; }
    if (song.meta.padSwell) for (const P of plan) if (P.mix === 'pad') P.ev = P.ev.map(e => { const h = Math.max(1, (e.e - e.s) >> 1); return { ...e, gain: { mode: 'lin', rate: 12 }, gseq: [{ t: 0, mode: 'lin', rate: 12 }, { t: h, mode: 'exp', rate: 10 }] }; });
    // the voice budget: a sparse scene keeps only its most important voices (melody, bass, one pad, then the rest)
    if (song.meta.voiceBudget) { const pri = ['lead', 'bass', 'pad', 'counter', 'drums', 'bed', 'noise', 'double', 'echo', 'timp', 'pad', 'pad']; const keep = new Set(); const taken = new Set();
      for (const r of pri) { if (keep.size >= song.meta.voiceBudget) break; const i = plan.findIndex((p, k) => p.mix === r && !taken.has(k) && (p.ev || []).length); if (i >= 0) { keep.add(i); taken.add(i); } }
      plan.forEach((p, i) => { if (p.mix === 'mod') { const c = plan.findIndex(q => q.pm === i); if (c >= 0 && keep.has(c)) return; } if (!keep.has(i) && p.mix !== 'mod') p.ev = []; });
      used.push('VOICE BUDGET ' + song.meta.voiceBudget); }
    if (I.pad2) { for (const P of plan) if (P.mix === 'pad') P.ev = P.ev.map((e, k) => k % 2 ? { ...e, inst: 'pad2' } : e); used.push('WAVE-SWITCHING PADS (' + I.pad.lib + ' / ' + I.pad2.lib + ')'); }
    if (I.lead2) { const B = song.sections.filter(x => x.name === 'B'); const inB = s0 => B.some(x => s0 >= T.s(x.start * 4) && s0 < T.s((x.start + x.bars) * 4));
      for (const P of plan) if (P.mix === 'lead' || P.mix === 'double' || P.mix === 'echo') P.ev = P.ev.map(e => inB(e.s) ? { ...e, inst: 'lead2' } : e); used.push('SECTION B SAMPLE SWAP: ' + I.lead2.lib); }
    if (TR.sampledHats && I.hat && plan[7].opt && plan[7].opt.noise) { plan[7] = { ev: E.hats, role: 'drum', mix: 'noise' }; used.push('SAMPLED HATS'); }
    if (bank.kit) used.push(bank.kit);
    const raw = []; const ints = [];
    for (let v = 0; v < 8; v++) {
      const P = plan[v]; const op = { ...o, ...(P.opt || {}) }; if (P.pm != null) op.pmod = ints[P.pm];
      const a = X.renderVoice(P.ev || [], total, bank, P.role, op); ints.push(a);
    }
    for (const a of ints) { const f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] / 32768; raw.push(f); }
    return {
      raw, exact: true, events: plan.map(p => p.ev || []), voiceRoles: plan.map(p => p.mix), tricks: used, total, timpVoice: E.TV,
      budget: { used: bank.used, limit: fx.enhanced ? bank.used : RAM, label: 'AUDIO RAM', echo: bank.edl * 2048, samples: bank.sampleBytes, seq: bank.seqBytes, maxEdl: bank.maxEdl, actions: bank.actions, inst: bank.info || null },
    };
  }
  function mixExact(song, R, fx, chState, onlyChannel) {
    const n = R.total, MV = fx.mixv && fx.mixv.length === 8 ? fx.mixv : null;
    const PAN0 = [[100, 118], [118, 92], [118, 70], [96, 96], [70, 118], [110, 110], [110, 110], [82, 120]];
    let EON = [fx.eonLead, fx.eonLead, fx.eonPad, fx.eonPad, MV && fx.eonv && fx.eonv[4] === 0 ? fx.eonDrums : fx.eonPad, false, fx.eonDrums, fx.eonDrums];
    // v0.7.2: a voice plan with tricks: echo by each voice's real job (the mix engineer's choice), modulators always silent
    const VR = R.voiceRoles; if (VR && MV && fx.eonv && fx.eonv.length === 8) EON = fx.eonv.map(Boolean);
    let vols = chState.map((c, i) => { const on = onlyChannel != null ? i === onlyChannel : LO.audible(chState, i), v = on ? (c.vol == null ? 1 : c.vol) : 0; if (VR && VR[i] === 'mod') return [0, 0]; return MV ? [Math.round(MV[i][0] * v), Math.round(MV[i][1] * v)] : [Math.round(PAN0[i][0] * v * 0.5), Math.round(PAN0[i][1] * v * 0.5)]; });
    // a real composer sets the voice volumes so 8 voices plus the echo never hit the 16-bit ceiling
    let pk = 1e-9; for (let i = 0; i < n; i += 2) { let l = 0, r = 0; for (let v = 0; v < 8; v++) { const x = R.raw[v][i]; l += x * vols[v][0] / 128; r += x * vols[v][1] / 128; } pk = Math.max(pk, Math.abs(l), Math.abs(r)); }
    if (pk > 0.62) { const k = 0.62 / pk; vols = vols.map(([a, b]) => [Math.round(a * k), Math.round(b * k)]); }
    const raw = R.raw.map(a => { const o = new Int16Array(n); for (let i = 0; i < n; i++) o[i] = Math.round(a[i] * 32768); return o; });
    const edl = Math.min(R.budget.echo / 2048, fx.edlPlay != null ? fx.edlPlay : 99);
    const TR = { ...(song.meta.tricks || {}), ...(fx.tricks || {}) };
    const ech = { edl, fir: FIR[fx.fir] || FIR['NINTENDO LPF'], efb: fx.efb / 100, evol: fx.evol / 100, dry: fx.dry, mvol: fx.mvolLR, evolLR: fx.evolLR, noWrite: fx.echoNoWrite };
    // wide ambience: the echo inverted on the right (and the noise bed's right volume), never the music itself
    if (TR.wide && !ech.evolLR) { ech.evolLR = [fx.evol / 100, -fx.evol / 100]; if (VR) VR.forEach((r, i) => { if (r === 'bed') vols[i] = [vols[i][0], -vols[i][1]]; }); }
    // the echo-RAM drone: the buffer pre-seeded with one tuned wave and writes switched off (FLG bit 5): the echo unit
    // becomes a ninth oscillator. Its pitch is the loop length, so EDL and the harmonic are chosen to land on the tonic
    if (TR.echoDrone && !R.droneSeed) {
      const tonic = song.meta.key, want = f => Math.min(...[0, 7].map(iv => { const c = 1200 * Math.log2(f / (440 * Math.pow(2, (tonic + iv - 9) / 12))); return Math.abs(c - 1200 * Math.round(c / 1200)); }));   // the tonic or its fifth
      let best = null; for (let e = 1; e <= Math.min(15, R.budget.echo / 2048); e++) for (let k = 1; k <= 96; k++) { const f = k * 32000 / (e * 512); if (f < 50 || f > 330) continue; const err = want(f); if (!best || err < best.err) best = { e, k, err, f }; }
      if (best && best.err < 12) { const dl = best.e * 512, w = new Int16Array(dl); for (let i = 0; i < dl; i++) { const ph = 2 * Math.PI * best.k * i / dl; w[i] = Math.round(5200 * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph))) & ~1; }
        R.droneSeed = { seed: [w, w], edl: best.e, info: `ECHO DRONE ${best.f.toFixed(1)} HZ (EDL ${best.e}, HARMONIC ${best.k}, ${best.err.toFixed(0)} CENTS)` }; }
    }
    if (TR.echoDrone && R.droneSeed) { ech.edl = R.droneSeed.edl; ech.seed = R.droneSeed.seed; ech.noWrite = true; ech.efb = 0; ech.evol = (TR.droneLevel || 0.22); ech.evolLR = null; }
    let out = LO.SNESX.mix(raw, n, vols, EON, ech);
    // the mono check: one-speaker TVs sum left and right. If the trick costs the mono mix more than 3 dB, it is undone
    if (TR.wide) { let st = 0, mo = 0; for (let i = 0; i < n; i += 4) { st += out.L[i] * out.L[i] + out.R[i] * out.R[i]; const m = (out.L[i] + out.R[i]) * 0.5; mo += 2 * m * m; }
      const loss = 10 * Math.log10(st / Math.max(1e-12, mo)); R.monoLoss = +loss.toFixed(1);
      if (loss > 3) { ech.evolLR = null; vols = vols.map(([a, b]) => [a, Math.abs(b)]); out = LO.SNESX.mix(raw, n, vols, EON, ech); R.monoBlocked = true; } }
    R.lastVols = vols; R.lastDry = fx.dry == null ? 1 : fx.dry;   // kept for the SFX voice hijack (Jelly Brain)
    LO.SNESX.analog(out.L, out.R);
    return { L: out.L, R: out.R };
  }

  const chip = {
    id: 'SNES', name: 'SNES', full: 'S-SMP + S-DSP', year: 1990, tier: '16-BIT', voices: 8, rate: '32 KHZ', bits: 'BRR 4-BIT ADPCM',
    blurb: ['8 BRR VOICES, GAUSSIAN SMOOTHING', 'ECHO + 8-TAP FIR, ONE NOISE GEN', '64 KB SHARED BY SAMPLES + ECHO'],
    channelsDef: [
      { name: 'V0', role: 'LEAD', vol: true }, { name: 'V1', role: 'COUNTER', vol: true },
      { name: 'V2', role: 'PAD', vol: true }, { name: 'V3', role: 'PAD', vol: true }, { name: 'V4', role: 'PAD', vol: true },
      { name: 'V5', role: 'BASS', vol: true }, { name: 'V6', role: 'DRUMS', vol: true }, { name: 'V7', role: 'NOISE', vol: true },
    ],
    fxSchema: [
      { id: 'edl', label: 'ECHO DELAY', type: 'slider', min: 0, max: 15, step: 1, fmt: v => (v * 16) + ' MS', level: 'render', note: 'EACH STEP COSTS 2 KB OF RAM' },
      { id: 'efb', label: 'FEEDBACK', type: 'slider', min: -100, max: 100, step: 5, fmt: v => v + '%', level: 'mix' },
      { id: 'evol', label: 'ECHO LEVEL', type: 'slider', min: 0, max: 100, step: 5, fmt: v => v + '%', level: 'mix' },
      { id: 'fir', label: 'FIR FILTER', type: 'select', options: Object.keys(FIR), level: 'mix' },
      { id: 'eonLead', label: 'ECHO: MELODY', type: 'toggle', level: 'mix' },
      { id: 'eonPad', label: 'ECHO: PADS', type: 'toggle', level: 'mix' },
      { id: 'eonDrums', label: 'ECHO: DRUMS', type: 'toggle', level: 'mix' },
      { id: 'ilead', label: 'LEAD', type: 'select', cycle: true, inst: true, options: OPTS, level: 'render' },
      { id: 'icounter', label: 'COUNTER', type: 'select', cycle: true, inst: true, options: OPTS, level: 'render' },
      { id: 'ipad', label: 'PAD', type: 'select', cycle: true, inst: true, options: OPTS, level: 'render' },
      { id: 'ibass', label: 'BASS', type: 'select', cycle: true, inst: true, options: OPTS, level: 'render' },
      { id: 'itimp', label: 'TIMPANI', type: 'select', cycle: true, inst: true, options: OPTS, level: 'render' },
    ],
    defaultFx(song) {
      const spb = 60 / song.meta.bpm;
      const fx = { edl: Math.min(15, Math.round(spb * 0.5 / 0.016)), efb: 45, evol: 35, fir: 'NINTENDO LPF', eonLead: true, eonPad: true, eonDrums: false };
      if (LO.SNESI && song.meta.orch && LO.SNESI_HIFI) { const p = LO.SNESI_HIFI.autoPick(song); fx.ilead = p.lead; fx.icounter = p.counter; fx.ipad = p.pad; fx.ibass = p.bass; fx.itimp = p.timp; }
      else if (LO.SNESI) { const p = LO.SNESI.autoPick(song); fx.ilead = p.lead; fx.icounter = p.counter; fx.ipad = p.pad; }
      return fx;
    },
    render(song, fx) {
      const T = LO.timing(song); const total = T.total; const P = song.parts;
      const lead = LO.toMono(P.lead, T), counter = LO.toMono(P.counter, T), bass = LO.toMono(P.bass, T);
      const link = ev => { for (let i = 1; i < ev.length; i++) ev[i].prevM = ev[i - 1].m; return ev; };
      link(lead); link(counter); link(bass);
      // pads: three voices, or two pads + an arpeggio voice
      const padV = [[], [], []];
      // v0.6.1: an orchestral song gives the timpani its own voice (V4) instead of a third pad, so the
      // snare never cuts a ringing drum: the kind of trade a real SNES arranger made with 8 voices
      const ARPS = !!(song.meta.arp || (P.arp && P.arp.length));
      const TV = !!(song.meta.orch && song.meta.orch.perc && song.meta.orch.perc.timp > 0 && !ARPS);
      for (const c of P.chords) {
        if (c.sec === 'intro' && song.meta.padTimbre === 'none' && !song.meta.arp) continue;
        if (song.meta.padTimbre !== 'none' || c.sec !== 'intro') {
          for (let j = 0; j < (song.meta.arp || (P.arp && P.arp.length) || TV ? 2 : 3); j++) padV[j].push({ t: c.t, d: c.d, m: song.meta.orch ? (c.tones[j] < 48 ? c.tones[j] + 12 : c.tones[j]) : c.tones[j] + 12, v: song.meta.orch ? 0.7 : 0.8 });
        }
        if (song.meta.arp && !(P.arp && P.arp.length)) {
          const up = c.tones.slice(0, 3).map(x => x + 24).concat([c.tones[0] + 36]);
          const seq = up.concat(up.slice(1, 3).reverse());
          for (let k = 0; k < 16; k++) padV[2].push({ t: c.t + k * 0.25, d: 0.22, m: seq[k % seq.length], v: 0.6 });
        }
      }
      if (P.arp && P.arp.length) { padV[2] = P.arp.map(n => ({ ...n, v: n.v * 0.75 })); }
      const pads = padV.map(p => LO.toMono(p, T));
      const timpEv = TV ? P.drums.filter(d => d.kind === 'timp').map(d => ({ ...d, s: T.s(d.t), e: T.s(d.t) + 26000 })).sort((a, b) => a.s - b.s) : null;
      if (timpEv) for (let i = 0; i < timpEv.length - 1; i++) timpEv[i].e = Math.min(timpEv[i].e, timpEv[i + 1].s);
      const drums = P.drums.filter(d => d.kind !== 'hat' && d.kind !== 'ohat' && !(TV && d.kind === 'timp')).map(d => ({ ...d, s: T.s(d.t), e: T.s(d.t) + (song.meta.orch && d.kind === 'timp' ? 26000 : 6000) })).sort((a, b) => a.s - b.s);
      for (let i = 0; i < drums.length - 1; i++) drums[i].e = Math.min(drums[i].e, drums[i + 1].s);
      const hats = P.drums.filter(d => d.kind === 'hat' || d.kind === 'ohat').map(d => ({ ...d, s: T.s(d.t), e: T.s(d.t) + (d.kind === 'ohat' ? 3000 : 700) })).sort((a, b) => a.s - b.s);
      for (let i = 0; i < hats.length - 1; i++) hats[i].e = Math.min(hats[i].e, hats[i + 1].s);
      const evCount = lead.length + counter.length + bass.length + drums.length + hats.length + pads.reduce((a, p) => a + p.length, 0) + (timpEv ? timpEv.length : 0);
      const bank = buildBank(song, fx, evCount);
      bank.vel = !!song.meta.orch;
      fx.edl = bank.edl; // the RAM budget wins
      if (song.meta.exact && LO.SNESX) return renderExact(song, fx, T, total, bank, { lead, counter, pads, bass, drums, hats, timpEv, TV, ARPS });
      const raw = [
        renderVoice(lead, total, bank, 'lead'), renderVoice(counter, total, bank, 'counter'),
        renderVoice(pads[0], total, bank, 'pad'), renderVoice(pads[1], total, bank, 'pad'),
        TV ? renderVoice(timpEv, total, bank, 'drum') : renderVoice(pads[2], total, bank, song.meta.arp || (P.arp && P.arp.length) ? 'counter' : 'pad'),
        renderVoice(bass, total, bank, 'bass'), renderVoice(drums, total, bank, 'drum'), renderVoice(hats, total, bank, 'drum', true),
      ];
      return {
        raw, events: [lead, counter, pads[0], pads[1], TV ? timpEv : pads[2], bass, drums, hats], total, timpVoice: TV,
        budget: { used: bank.used, limit: fx.enhanced ? bank.used : RAM, label: 'AUDIO RAM', echo: bank.edl * 2048, samples: bank.sampleBytes, seq: bank.seqBytes, maxEdl: bank.maxEdl, actions: bank.actions, inst: bank.info || null },
      };
    },
    mix(song, R, fx, chState, onlyChannel) {
      if (R.exact) return mixExact(song, R, fx, chState, onlyChannel);
      const n = R.total; const L = new Float32Array(n), Rr = new Float32Array(n);
      const PAN = [[100, 118], [118, 92], [118, 70], [96, 96], [70, 118], [110, 110], [110, 110], [82, 120]];
      // v0.6.1: the PRODUCTION mix engineer's voice volumes (signed 8-bit L/R, as the S-DSP has) and echo switches
      const MV = fx.mixv && fx.mixv.length === 8 ? fx.mixv : null;
      // the ECHO toggles stay yours; with the timpani on V4, V4 follows the DRUMS switch (dry unless you ask)
      const EON = [fx.eonLead, fx.eonLead, fx.eonPad, fx.eonPad, MV && fx.eonv && fx.eonv[4] === 0 ? fx.eonDrums : fx.eonPad, false, fx.eonDrums, fx.eonDrums];
      const vols = chState.map((c, i) => {
        const on = onlyChannel != null ? i === onlyChannel : LO.audible(chState, i);
        const v = on ? (c.vol == null ? 1 : c.vol) : 0;
        if (MV) return [Math.round(MV[i][0] * v) / 128, Math.round(MV[i][1] * v) / 128];
        return [Math.round(PAN[i][0] * v * 0.5) / 128, Math.round(PAN[i][1] * v * 0.5) / 128]; // driver-style voice volumes keep the 16-bit mix from clipping
      });
      // like a real composer, set the voice volumes so the 16-bit mix leaves headroom for the echo
      let pk = 1e-9;
      for (let i = 0; i < n; i += 2) { let l = 0, r = 0; for (let v = 0; v < 8; v++) { const x = R.raw[v][i]; l += x * vols[v][0]; r += x * vols[v][1]; } pk = Math.max(pk, Math.abs(l), Math.abs(r)); }
      if (pk > 0.7) { const k = 0.7 / pk; for (const vv of vols) { vv[0] = Math.round(vv[0] * k * 128) / 128; vv[1] = Math.round(vv[1] * k * 128) / 128; } }
      // v0.7: a room can shorten the echo live (the RAM stays reserved for the longest room), no re-render needed
      const edl = Math.min(R.budget.echo / 2048, fx.edlPlay != null ? fx.edlPlay : 99);
      const dl = Math.max(4, edl * 512);
      const bufL = new Float32Array(dl), bufR = new Float32Array(dl);
      const fir = FIR[fx.fir] || FIR['NINTENDO LPF'];
      const hL = new Float32Array(8), hR = new Float32Array(8);
      const efb = fx.efb / 100 * 127 / 128, evol = fx.evol / 100 * 127 / 128;
      let p = 0;
      for (let i = 0; i < n; i++) {
        let l = 0, r = 0, el = 0, er = 0;
        for (let v = 0; v < 8; v++) {
          const s = R.raw[v][i]; if (!s) continue;
          const a = s * vols[v][0], b = s * vols[v][1];
          l += a; r += b; if (EON[v]) { el += a; er += b; }
        }
        // echo: read, FIR, mix, write back with feedback
        for (let k = 7; k > 0; k--) { hL[k] = hL[k - 1]; hR[k] = hR[k - 1]; }
        hL[0] = bufL[p]; hR[0] = bufR[p];
        let fl = 0, fr = 0; for (let k = 0; k < 8; k++) { fl += hL[7 - k] * fir[k]; fr += hR[7 - k] * fir[k]; }
        fl /= 128; fr /= 128;
        bufL[p] = LO.clamp(el + fl * efb, -1, 1); bufR[p] = LO.clamp(er + fr * efb, -1, 1);
        if (++p >= dl) p = 0;
        L[i] = LO.clamp((l + fl * evol) * 0.992, -1, 1); Rr[i] = LO.clamp((r + fr * evol) * 0.992, -1, 1);
      }
      return { L, R: Rr };
    },
  };
  chip.FIR = FIR;
  LO.CHIPS.SNES = chip;
  // Instrument Scan's B side: one instrument, through real BRR, Gaussian smoothing and its own ADSR
  chip.previewInst = function (d, notes) {
    const rt = brrRoundTrip(toI16(d.data, LIB_PEAK), d.loop);
    const inst = { pcm: rt.pcm, loop: d.loop, bytes: rt.bytes, baseF: d.baseF, rate: d.rate, adsr: d.adsr, vib: d.vib, gain: LIB_GAIN };
    const total = Math.max(...notes.map(n => n.e)) + LO.SR;
    const ev = notes.map((n, i) => ({ ...n, prevM: i ? notes[i - 1].m : null }));
    const out = renderVoice(ev, total, { inst: { lead: inst } }, 'lead');
    let pk = 1e-9; for (const x of out) pk = Math.max(pk, Math.abs(x));
    const g = 0.8 / pk; for (let i = 0; i < out.length; i++) out[i] *= g;
    return { out, bytes: rt.bytes, loop: d.loop, len: rt.pcm.length };
  };
  LO.brrRoundTrip = brrRoundTrip; LO.SNES_GAUSS = GAUSS;
})(typeof self !== 'undefined' ? self : globalThis);
