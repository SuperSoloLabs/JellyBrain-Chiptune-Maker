/* LowOrbit Chip Studio - composer: music rules -> chip-independent song parts
   v0.2: Euclidean rhythms, lead scales, progression banks, a voice-leading judge, genre vectors. */
(function (G) {
  const LO = G.LO;

  LO.MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    // v0.7.3 (scene sheets only): regal gravity (raised 7th, V-i) and the desert's raised third over a Phrygian floor
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'phrygian dominant': [0, 1, 4, 5, 7, 8, 10],
  };
  const DARK_MODES = ['minor', 'dorian', 'phrygian', 'harmonic minor', 'phrygian dominant'];

  LO.GENRES = {
    'CHIPTUNE':  { bpm: [132, 160], modes: ['major', 'mixolydian', 'lydian', 'minor'], drums: 'chip', bass: 'drive', lead: 'pulse', pad: 'none', arp: true, swing: 0, jazzy: 0.1, leads: ['mode', 'pentatonic', 'harmonic'] },
    'SYNTHWAVE': { bpm: [94, 118], modes: ['minor', 'dorian', 'mixolydian'], drums: 'synthwave', bass: 'eighths', lead: 'saw', pad: 'saw', arp: true, swing: 0, jazzy: 0.2, leads: ['mode', 'pentatonic'] },
    'DOWNTEMPO': { bpm: [84, 98], modes: ['dorian', 'minor', 'mixolydian'], drums: 'downtempo', bass: 'funk', lead: 'sax', pad: 'rhodes', arp: false, swing: 0.05, jazzy: 0.9, leads: ['mode', 'pentatonic'] },
    'LO-FI':     { bpm: [74, 90], modes: ['dorian', 'major', 'minor'], drums: 'lofi', bass: 'walk', lead: 'bell', pad: 'rhodes', arp: false, swing: 0.065, jazzy: 1.0, leads: ['pentatonic', 'mode'] },
    'TECHNO':    { bpm: [118, 128], modes: ['minor', 'dorian', 'phrygian'], drums: 'techno', bass: 'offbeat', lead: 'bell', pad: 'saw', arp: true, swing: 0.02, jazzy: 0.5, leads: ['mode', 'pentatonic'] },
    'ORCHESTRAL':{ bpm: [84, 112], modes: ['major', 'minor', 'lydian'], drums: 'orch', bass: 'orch', lead: 'brass', pad: 'strings', arp: false, swing: 0, jazzy: 0.1, leads: ['mode', 'harmonic'] },
    'CYBERPUNK': { bpm: [136, 156], modes: ['minor', 'phrygian'], drums: 'cyber', bass: 'drive', lead: 'saw', pad: 'saw', arp: true, swing: 0, jazzy: 0.1, leads: ['harmonic', 'pentatonic', 'mode'] },
    'DUNGEON':   { bpm: [66, 86], modes: ['phrygian', 'minor'], drums: 'dungeon', bass: 'orch', lead: 'bell', pad: 'strings', arp: false, swing: 0, jazzy: 0.2, leads: ['harmonic', 'mode'] },
  };

  LO.PURPOSES = {
    'TITLE':     { bright: 2, intense: 1, heroic: 3, tempo: 1.0, form: 'loop', genres: ['ORCHESTRAL', 'CHIPTUNE', 'SYNTHWAVE'], bank: 'emotional' },
    'OVERWORLD': { bright: 3, intense: 1, heroic: 2, tempo: 1.0, form: 'loop', genres: ['CHIPTUNE', 'ORCHESTRAL'], bank: 'bright' },
    'TOWN':      { bright: 3, intense: -3, heroic: 0, tempo: 0.88, form: 'loop', genres: ['CHIPTUNE', 'DOWNTEMPO', 'LO-FI'], bank: 'calm' },
    'DUNGEON':   { bright: -4, intense: -1, heroic: -1, tempo: 0.9, form: 'loop', genres: ['DUNGEON', 'TECHNO'], bank: 'dark' },
    'BATTLE':    { bright: -1, intense: 4, heroic: 2, tempo: 1.08, form: 'loop', genres: ['CHIPTUNE', 'CYBERPUNK', 'ORCHESTRAL'], bank: 'action' },
    'BOSS':      { bright: -3, intense: 5, heroic: 1, tempo: 1.1, form: 'loop', genres: ['CYBERPUNK', 'ORCHESTRAL', 'DUNGEON'], bank: 'action' },
    'CHASE':     { bright: -1, intense: 5, heroic: 1, tempo: 1.1, form: 'loop', genres: ['CYBERPUNK', 'SYNTHWAVE', 'CHIPTUNE'], bank: 'action' },
    'STEALTH':   { bright: -3, intense: -1, heroic: -2, tempo: 0.95, form: 'loop', genres: ['TECHNO', 'DUNGEON', 'SYNTHWAVE'], bank: 'dark' },
    'CUTSCENE':  { bright: 0, intense: -2, heroic: 1, tempo: 0.9, form: 'song', genres: ['ORCHESTRAL', 'SYNTHWAVE', 'DOWNTEMPO'], bank: 'emotional' },
    'VICTORY':   { bright: 5, intense: 2, heroic: 5, tempo: 1.05, form: 'jingle-win', genres: ['CHIPTUNE', 'ORCHESTRAL'], bank: 'bright' },
    'GAME OVER': { bright: -5, intense: -3, heroic: -4, tempo: 0.8, form: 'jingle-lose', genres: ['CHIPTUNE', 'ORCHESTRAL'], bank: 'dark' },
    'MENU':      { bright: 1, intense: -2, heroic: 0, tempo: 0.95, form: 'short-loop', genres: ['LO-FI', 'SYNTHWAVE', 'DOWNTEMPO'], bank: 'calm' },
    'CREDITS':   { bright: 1, intense: 0, heroic: 2, tempo: 0.95, form: 'song', genres: ['ORCHESTRAL', 'SYNTHWAVE', 'DOWNTEMPO'], bank: 'emotional' },
  };

  // Named progression banks (scale degrees). Used most of the time; the Markov chain covers the rest.
  LO.BANKS = {
    action:    { dark: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 6, 5], [0, 5, 3, 4], [0, 6, 5, 6], [0, 2, 3, 4], [0, 3, 4, 0], [0, 5, 6, 0], [0, 0, 5, 6], [0, 6, 3, 4], [5, 6, 0, 0], [0, 3, 5, 6], [0, 4, 5, 3], [3, 4, 5, 6]],
                 bright: [[0, 4, 5, 3], [0, 6, 3, 4], [5, 3, 0, 4], [0, 3, 0, 4], [0, 4, 3, 4], [0, 5, 3, 4], [3, 4, 0, 0], [0, 2, 3, 4], [0, 6, 5, 4], [5, 4, 3, 4]] },
    bright:    { dark: [[0, 5, 6, 4], [0, 3, 6, 2], [0, 2, 5, 6], [0, 6, 5, 6], [0, 3, 4, 6]],
                 bright: [[0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 3, 4], [3, 4, 0, 0], [0, 1, 3, 4], [0, 3, 1, 4], [0, 2, 3, 4], [0, 4, 1, 4], [0, 5, 1, 4], [3, 4, 2, 5], [0, 6, 3, 0], [0, 3, 0, 4], [0, 4, 0, 3]] },
    calm:      { dark: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 6, 5, 6], [0, 2, 5, 6], [0, 3, 6, 2], [0, 5, 0, 5], [0, 1, 0, 1], [3, 0, 3, 0], [0, 6, 3, 0], [0, 3, 2, 5]],
                 bright: [[0, 5, 3, 4], [0, 2, 3, 4], [3, 0, 4, 5], [0, 3, 5, 4], [0, 1, 4, 0], [0, 3, 1, 4], [3, 4, 0, 5], [0, 5, 1, 4], [0, 2, 1, 4], [3, 2, 1, 0], [0, 4, 5, 4], [3, 0, 3, 4]] },
    dark:      { dark: [[0, 3, 0, 4], [0, 1, 0, 4], [0, 5, 3, 4], [0, 6, 5, 6], [0, 1, 0, 1], [0, 5, 1, 4], [0, 3, 5, 4], [0, 0, 5, 5], [0, 2, 1, 4], [0, 6, 0, 5], [0, 5, 6, 4], [3, 0, 4, 0]],
                 bright: [[0, 3, 0, 4], [0, 5, 1, 4], [0, 1, 0, 4]] },
    emotional: { dark: [[0, 5, 2, 6], [5, 3, 0, 4], [0, 3, 6, 2], [0, 5, 3, 6], [5, 6, 0, 0], [0, 6, 5, 4], [3, 6, 2, 5], [0, 4, 5, 3], [5, 6, 3, 4], [0, 2, 5, 4], [3, 4, 2, 5], [0, 5, 6, 4]],
                 bright: [[5, 3, 0, 4], [0, 4, 5, 2], [3, 4, 2, 5], [0, 4, 5, 3], [0, 2, 3, 4], [3, 4, 0, 5], [0, 5, 3, 4], [5, 4, 3, 4], [0, 3, 1, 4], [3, 2, 1, 4], [0, 4, 3, 0], [5, 3, 4, 0], [0, 6, 3, 4]] },
    // one- and two-chord vamps: how hypnotic electronic music really moves
    vamp:      { dark: [[0, 0, 6, 6], [0, 0, 5, 5], [0, 0, 3, 3], [0, 6, 0, 6], [0, 1, 0, 1], [0, 0, 0, 0], [0, 5, 0, 5], [0, 3, 0, 3], [0, 0, 4, 4]],
                 bright: [[0, 0, 3, 3], [0, 0, 4, 4], [0, 6, 0, 6], [0, 1, 0, 1], [0, 0, 0, 0], [0, 3, 0, 3], [0, 4, 0, 4]] },
  };

  // durations helpers for motif development
  LO.melodyRhythm = {
    fragment(r) { const pre = []; let s = 0; for (const d of r) { if (s + d > 2 && pre.length) break; pre.push(d); s += d; } const out = pre.concat(pre); const tot = s * 2; if (tot < 4) out.push(4 - tot); return out; },
    augment(r) { const pre = []; let s = 0; for (const d of r) { if (s + d * 2 > 4 && pre.length) break; pre.push(d * 2); s += d * 2; } if (s < 4) pre.push(4 - s); return pre; },
  };

  // Euclidean rhythm E(k, n): k hits spread as evenly as possible over n steps, rotated to land on beat 1
  LO.euclid = function (k, n, rot) {
    const p = []; for (let i = 0; i < n; i++) p.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n));
    const first = p.indexOf(1); const r = ((first + (rot || 0)) % n + n) % n;
    const out = []; for (let i = 0; i < n; i++) if (p[(i + r) % n]) out.push(i);
    return out;
  };

  // ---- MELODIC FRESHNESS MEMORY (v0.5.1): interval and rhythm n-grams of the lead, kept as numbers only.
  // A 4-interval shape (5 notes) and a 4-step rhythm (inter-onset times in 16ths) are the "words" of a melody.
  LO.melodyGrams = function (lead, cap) {
    const L = lead.map(n => ({ t: n.tg != null ? n.tg : n.t, m: n.m })).sort((a, b) => a.t - b.t);
    const iv = new Set(), rh = new Set();
    for (let i = 4; i < L.length; i++) {
      const a = [], r = [];
      for (let k = i - 3; k <= i; k++) { a.push(LO.clamp(L[k].m - L[k - 1].m, -12, 12)); r.push(LO.clamp(Math.round((L[k].t - L[k - 1].t) * 4), 0, 32)); }
      iv.add(a.join(',')); rh.add(r.join(','));
    }
    const lim = (s) => { const a = [...s]; if (!cap || a.length <= cap) return a; const out = []; for (let i = 0; i < cap; i++) out.push(a[Math.floor(i * a.length / cap)]); return out; };
    return { iv: lim(iv), rh: lim(rh) };
  };
  // how often each n-gram showed up in recent songs: a song marked TOO SIMILAR counts double, a LOVED song half
  LO.freshMemory = function (history, loved) {
    const iv = new Map(), rh = new Map(); let n = 0;
    const lovedSeeds = new Set((loved || []).map(h => h && h.seed));
    for (const h of (history || []).slice(-50)) {
      if (!h || !h.ng) continue; n++;
      const w = h.mark ? 2 : (h.love || lovedSeeds.has(h.seed)) ? 0.5 : 1;
      for (const g of h.ng.iv || []) iv.set(g, (iv.get(g) || 0) + w);
      for (const g of h.ng.rh || []) rh.set(g, (rh.get(g) || 0) + w);
    }
    return { iv, rh, n };
  };
  // 1 = every shape is new, 0 = every shape is worn out
  LO.freshness = function (grams, mem) {
    if (!mem || !mem.n || !grams) return 1;
    const lim = 3 + mem.n * 0.06;
    const pen = (list, map) => list.length ? list.reduce((a, g) => a + Math.min(1, (map.get(g) || 0) / lim), 0) / list.length : 0;
    return LO.clamp(1 - (0.6 * pen(grams.iv, mem.iv) + 0.4 * pen(grams.rh, mem.rh)), 0, 1);
  };

  // ---- EXPECTATION (v0.6.1, Pearce & Wiggins 2006; Narmour's implication-realization): how surprising each note
  // is, from a short-term model of this song's own intervals mixed with the I-R regularities (small intervals
  // expected, a big leap is expected to turn back and get smaller). A good phrase is mostly expected with one or
  // two surprising moments; the motifs repeat, so the song teaches itself to the listener.
  const irPrior = (iv, prev) => {
    const a = Math.abs(iv), pa = Math.abs(prev);
    let p = Math.exp(-a / 2.4) * (a === 0 ? 0.55 : 1);
    if (pa >= 5) { if (Math.sign(iv) !== Math.sign(prev) && iv !== 0) p *= 2.2; if (a < pa) p *= 1.5; }
    else if (pa >= 1 && pa <= 2 && Math.sign(iv) === Math.sign(prev)) p *= 1.4;
    return p;
  };
  const IR_Z = (() => { const z = {}; for (let pv = -12; pv <= 12; pv++) { let s = 0; for (let iv = -12; iv <= 12; iv++) s += irPrior(iv, pv); z[pv] = s; } return z; })();
  LO.expectIC = function (mel, mem) {
    const ms = mel.map(n => n.m), out = [];
    const local = new Map(); let ln = 0;
    for (let i = 1; i < ms.length; i++) {
      const iv = LO.clamp(ms[i] - ms[i - 1], -12, 12), pv = i > 1 ? LO.clamp(ms[i - 1] - ms[i - 2], -12, 12) : 0;
      const p0 = irPrior(iv, pv) / IR_Z[pv];
      const n = (mem ? mem.n : 0) + ln, c = (mem ? mem.iv.get(iv) || 0 : 0) + (local.get(iv) || 0);
      const ps = (c + 0.3) / (n + 0.3 * 25), w = Math.min(0.6, n / 40);
      out.push(-Math.log2((1 - w) * p0 + w * ps));
      local.set(iv, (local.get(iv) || 0) + 1); ln++;
    }
    return out;
  };
  LO.expectScore = function (mel, mem) {
    const ic = LO.expectIC(mel, mem); if (ic.length < 3) return { score: 0.5, mean: 0, peaks: 0 };
    const mean = ic.reduce((a, b) => a + b, 0) / ic.length, peaks = ic.filter(x => x > mean + 2).length;
    const band = Math.exp(-Math.pow((mean - 3.0) / 0.8, 2)), pk = peaks >= 1 && peaks <= 2 ? 1 : peaks === 3 ? 0.55 : peaks === 0 ? 0.35 : 0.2;
    return { score: band * 0.6 + pk * 0.4, mean: +mean.toFixed(2), peaks };
  };
  LO.expectLearn = function (mem, mel) { for (let i = 1; i < mel.length; i++) { const iv = LO.clamp(mel[i].m - mel[i - 1].m, -12, 12); mem.iv.set(iv, (mem.iv.get(iv) || 0) + 1); mem.n++; } };
  // the melody as the listener hears it: when the ORCHESTRA hands the tune to another voice, it travels with it
  LO.melodyLine = function (parts) { return parts.lead.filter(n => !n.cp).concat((parts.counter || []).filter(n => n.mel)).sort((a, b) => a.t - b.t); };

  const TITLE_A =['NEON', 'CRYSTAL', 'MIDNIGHT', 'IRON', 'STAR', 'EMBER', 'VELVET', 'SILENT', 'CHROME', 'AMBER', 'LUNAR', 'STORM', 'COBALT', 'GOLDEN', 'HOLLOW', 'ELECTRIC', 'PIXEL', 'SOLAR', 'DUSK', 'ARCADE'];
  const TITLE_B = ['HARBOR', 'TUNNEL', 'SKYLINE', 'CITADEL', 'DRIFT', 'RUN', 'GARDEN', 'ORBIT', 'CANYON', 'SIGNAL', 'LAGOON', 'HIGHWAY', 'CATHEDRAL', 'RIVER', 'FORTRESS', 'MIRAGE', 'NOMAD', 'FRONTIER', 'ECHO', 'VAULT'];

  LO.SURPRISES = {
    'CHROMATIC MEDIANT bVI': () => [8, 12, 15],
    'CHROMATIC MEDIANT III': () => [4, 8, 11],
    'BORROWED MINOR iv': () => [5, 8, 12],
    'LYDIAN LIFT II': () => [2, 6, 9],
    'NEAPOLITAN bII': () => [1, 5, 8],
    'VICTORY bVII': () => [10, 14, 17],
  };

  const PAD_MAP = { saw: 'saw', strings: 'strings', rhodes: 'rhodes', none: 'none' };
  function bpToGenre(bp) {
    return { bpm: bp.bpm, modes: bp.modes, drums: bp.drums, bass: bp.bass, lead: bp.lead, pad: PAD_MAP[bp.pad] || 'saw', arp: !!bp.arp,
      swing: bp.swing || 0, jazzy: bp.jazzy, leads: bp.leads || ['mode'] };
  }

  LO.compose = function (params) {
    const seed = params.seed >>> 0;
    const R = LO.rng(seed);
    const VEC = params.vector || null; // "more like this": keep the recipe, change the song
    const BP = params.blueprint || null; // a style blueprint (or a blend of two)
    let purposeName, P, genreName, GN;
    if (BP) {
      purposeName = params.purpose && params.purpose !== 'AUTO' ? params.purpose : 'STYLE';
      P = LO.PURPOSES[purposeName] ? { ...LO.PURPOSES[purposeName], form: BP.form === 'evolve' ? 'evolve' : LO.PURPOSES[purposeName].form }
        : { bright: 0, intense: 0, heroic: 0, tempo: 1, form: BP.form, genres: [], bank: (BP.banks || ['emotional'])[0] };
      genreName = BP.name; GN = bpToGenre(BP);
    } else {
      purposeName = VEC ? VEC.purpose : (params.purpose && params.purpose !== 'AUTO' ? params.purpose : R.pick(Object.keys(LO.PURPOSES)));
      P = LO.PURPOSES[purposeName];
      genreName = VEC ? VEC.genre : (params.genre && params.genre !== 'AUTO' ? params.genre : R.pick(P.genres));
      GN = LO.GENRES[genreName];
    }
    const mood = k => LO.clamp((params[k] == null ? 5 : params[k]) + (P[k] || 0) * (params[k] == null || params[k] === 5 ? 1 : 0.5), 0, 10);
    const emo = params.valence != null && params.arousal != null;
    const bright = emo ? LO.clamp(params.valence, 0, 10) : mood('bright'), intense = emo ? LO.clamp(params.arousal, 0, 10) : mood('intense'), heroic = mood('heroic');
    const complex = LO.clamp(params.complex == null ? 5 : params.complex, 0, 10);
    const surprise = LO.clamp(params.surprise == null ? 5 : params.surprise, 0, 10) / 10;

    let fam;
    if (bright >= 6.5) fam = heroic >= 7 ? ['lydian', 'major'] : ['major', 'mixolydian'];
    else if (bright >= 4) fam = ['dorian', 'mixolydian', 'minor'];
    else fam = bright < 2 ? ['phrygian', 'minor'] : ['minor', 'dorian'];
    const allowed = fam.filter(m => GN.modes.includes(m));
    // IMAGINATION's color can ask for a mode; it wins when the style allows it
    const pref = params.modePref ? params.modePref.filter(m => GN.modes.includes(m) || (!BP && fam.includes(m))) : [];
    const modeName = VEC ? VEC.mode : pref.length ? R.pick(pref) : (allowed.length ? R.pick(allowed) : R.pick(fam));
    const dark = DARK_MODES.includes(modeName);
    const SC = LO.MODES[modeName];
    const key = VEC ? VEC.key : R.int(0, 11);
    // ---- VARIETY: a separate dice for the song's skeleton (groove, shape, sounds, meter, voicing)
    const RV = LO.rng(((seed ^ 0xA11CE) ^ (params._fix && params._fix.reroll ? 0x5EED5 : 0)) >>> 0);
    const VL = params.variety || null;                       // a kept song replays its exact choices
    const hist = (params.history || []).filter(h => h && h.genre === genreName).filter((h, i, a) => h.mark || i >= a.length - 6);
    const V = {};
    const lovedV = (params.loved || (params.history || []).filter(h => h && h.love)).filter(h => h && h.genre === genreName && h.v).map(h => h.v);
    const avoid = (k, opts) => {                             // prefer a choice the last few songs of this style didn't use
      if (VL && VL[k] != null) return (V[k] = VL[k]);
      const used = hist.map(h => h.v && h.v[k]).concat(params._fix && params._fix.avoidV ? [params._fix.avoidV[k]] : []); const fresh = opts.filter(o => !used.includes(o));
      // LOVE IT (v0.5.1): a choice a loved song of this style made counts twice, unless it was just used
      if (params.groove !== 0 && lovedV.length) { const pool = fresh.length ? fresh : opts; const w = pool.concat(pool.filter(o => lovedV.some(v => v[k] === o))); return (V[k] = RV.pick(w)); }
      return (V[k] = RV.pick(fresh.length ? fresh : opts));
    };
    const form = BP ? (P.form === 'evolve' || BP.form === 'evolve' ? 'evolve' : P.form) : P.form;
    const straightOnly = ['techno', 'house', 'trance', 'dnb', 'electro', 'breakbeat', 'idm', 'cyber', 'rock', 'march'].includes(GN.drums) || form.startsWith('jingle') || form === 'evolve';
    const waltzOK = !straightOnly && (['TOWN', 'CUTSCENE', 'MENU', 'CREDITS', 'TITLE'].includes(purposeName) || ['ORCHESTRAL', 'CHIPTUNE', 'LO-FI', 'DOWNTEMPO', 'DUNGEON'].includes(genreName)) && intense < 6.5;
    let meter = '4/4';
    if (VEC && VEC.meter) meter = VEC.meter;
    else if (VL && VL.meter) meter = VL.meter;
    else if (BP && BP.meter) meter = BP.meter;
    else if (!straightOnly) { const r = RV.random(); meter = waltzOK && r < 0.14 ? '3/4' : r < 0.32 ? 'shuffle' : '4/4'; }
    V.meter = meter;
    const waltz = meter === '3/4';
    let bpmD = Math.round((GN.bpm[0] + (GN.bpm[1] - GN.bpm[0]) * (0.25 + intense / 13 + R.range(-0.1, 0.1))) * P.tempo * (1 + RV.range(-0.06, 0.06)));
    if (VEC) bpmD = VEC.bpm;
    if (params.bpmFix) bpmD = Math.round(params.bpmFix);   // v0.7.2: a scene sheet sets the tempo inside its own window
    bpmD = LO.clamp(bpmD, 60, 180);
    let bpm = waltz ? Math.round(bpmD * 4 / 3) : bpmD;   // a 3/4 bar is stored as 4 units: 3 beats of 4/3 units each
    const swing = GN.swing;
    const loop = params.loop == null ? (form === 'loop' || form === 'short-loop') : !!params.loop && form !== 'jingle-win' && form !== 'jingle-lose';

    // lead scale: the mode itself, a pentatonic, or harmonic minor for aggressive runs
    let leadScale = VEC ? VEC.leadScale : R.pick(GN.leads);
    if (leadScale === 'harmonic' && !dark) leadScale = 'mode';
    let LSC = SC;
    if (leadScale === 'pentatonic') LSC = modeName === 'phrygian dominant' ? [0, 1, 4, 7, 8] : dark ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    else if (leadScale === 'harmonic') LSC = [0, 2, 3, 5, 7, 8, 11];

    // ---- GROOVE (v0.5.1): what separates a human tracker artist from a robot: rests, pushes, pickups, feel.
    // Old keeps (made before v0.5.1) pass groove: 0 and replay exactly as they were made.
    const GV = params.groove !== 0;
    // ---- ORCHESTRA (v0.6.1): role sheets, register lanes, real counterpoint, orchestral percussion, phrase forms
    // and the expectation score. Keeps made before v0.6.1 pass orch: 0 and replay exactly as they were made.
    const OR = GV && params.orch !== 0;
    const RO = LO.rng(((seed ^ 0x0BC5A) ^ (params._fix && params._fix.reroll ? 0x99 : 0)) >>> 0);
    const RG = LO.rng(((seed ^ 0x6400E) ^ (params._fix && params._fix.reroll ? 0x77 : 0)) >>> 0);
    const FXG = params._fix || {};
    const lovedH = (params.loved || (params.history || []).filter(h => h && h.love)).filter(h => h && h.g);
    const TASTE = lovedH.length ? { n: lovedH.length, s: lovedH.reduce((a, h) => a + h.g.s, 0) / lovedH.length, b: lovedH.reduce((a, h) => a + h.g.b, 0) / lovedH.length } : null;
    const SYNC_BASE = { downtempo: .55, lofi: .55, triphop: .6, deephouse: .6, nudisco: .6, breakbeat: .6, electro: .6, dnb: .55, house: .5, synthwave: .45, chip: .5, cyber: .45, techno: .4, trance: .35, idm: .5, rock: .45, march: .25, orch: .3, dungeon: .3, ambient: .25 };
    let sLevel = (SYNC_BASE[GN.drums] != null ? SYNC_BASE[GN.drums] : .45) + RG.range(-.15, .15);
    let bLevel = .4 + (bpmD < 100 ? .12 : 0) - (intense > 7 ? .1 : 0) + RG.range(-.12, .12);
    if (TASTE) { sLevel += (TASTE.s - sLevel) * .5; bLevel += (TASTE.b - bLevel) * .5; }
    if (FXG.pushes) sLevel += .22; if (FXG.steady) sLevel -= .22; if (FXG.breath) bLevel += .25; if (FXG.fill) bLevel -= .2;
    sLevel = LO.clamp(sLevel, .1, .9); bLevel = LO.clamp(bLevel, .1, .85);
    if (GV && VL && VL.gs != null) { sLevel = VL.gs; bLevel = VL.gb; }
    if (GV) { V.gs = +sLevel.toFixed(3); V.gb = +bLevel.toFixed(3); }
    const GROOVE = GV ? { sync: +sLevel.toFixed(2), breath: +bLevel.toFixed(2), taste: TASTE ? TASTE.n : 0, pushes: 0, pickups: 0, vars: [], ghosts: 0, bassGhosts: 0, rolls: 0 } : null;

    // ---- harmony
    let jazzy = GN.jazzy * (0.4 + complex / 10);
    if (emo && bright >= 4 && bright <= 8 && intense < 5) jazzy = Math.min(1, jazzy + 0.25); // dreamy = richer chords
    const degChord = (d, seventh) => {
      const idx = [d, d + 2, d + 4].concat(seventh ? [d + 6] : []);
      return idx.map(i => SC[i % 7] + 12 * Math.floor(i / 7));
    };
    const toChord = d => {
      const c = degChord(d, R.chance(jazzy));
      if (d === 4 && dark && R.chance(0.6)) c[1] = c[0] + 4;   // harmonic-minor V pulls home
      return c;
    };
    const MOVES = { 0: [3, 4, 5, 1, 2], 1: [4, 6, 3], 2: [5, 3], 3: [4, 0, 1], 4: [0, 5], 5: [3, 1, 4], 6: [0, 5] };
    const markov = (start, end) => {
      const p = [start];
      for (let i = 0; i < 2; i++) { const o = MOVES[p[p.length - 1]]; p.push(R.pick(o, [5, 4, 3, 2, 1].slice(0, o.length))); }
      p.push(end); return p;
    };
    const bankName = VEC ? VEC.bank : BP ? ((BP.chordRate || 1) >= 4 && RV.chance(0.5) ? 'vamp' : R.pick(BP.banks && BP.banks.length ? BP.banks : ['emotional'])) : P.bank;
    const bankList = LO.BANKS[bankName][dark ? 'dark' : 'bright'];
    const fromBank = () => R.pick(bankList).slice();
    const useBank = R.chance(0.65);

    let pA, pA2, pB, pB2, surpriseName = null;
    if (form === 'jingle-win') pA = [degChord(0), degChord(3), degChord(4, true), degChord(0)];
    else if (form === 'jingle-lose') pA = [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [0, 3, 7]];
    else {
      const dA = useBank ? fromBank() : markov(0, 4);
      pA = dA.map(toChord);
      pA2 = pA.slice(0, 3).concat([toChord(R.chance(0.5) ? 0 : 4)]);
      const dB = useBank && R.chance(0.5) ? fromBank() : markov(R.pick([3, 5, 1]), 4);
      if (dB[0] === 0) dB[0] = R.pick([3, 5]);
      pB = dB.map(toChord);
      pB2 = markov(R.pick([3, 5]), 4).map(toChord);
      if (R.chance(0.25 + surprise * 0.75)) {
        const pool = Object.keys(LO.SURPRISES).filter(n => n !== 'VICTORY bVII' || !dark);
        surpriseName = R.pick(pool);
        pB2[1] = LO.SURPRISES[surpriseName]();
      }
    }
    const lift = form === 'song' && (params.lift === true || (params.lift !== false && R.chance(0.15 + surprise * 0.6)));

    let FORM;
    if (form === 'jingle-win' || form === 'jingle-lose') FORM = [['A', 4]];
    else if (form === 'short-loop') FORM = [['intro', 2], ['A', 8]];
    else if (form === 'loop') {
      const iL = bpmD < 100 ? 2 : 4;
      FORM = [[['intro', iL], ['A', 8], ['B', 8], ['A2', 8]], [['intro', iL], ['A', 8], ['B', 8], ['break', 4], ['A2', 8]], [['intro', 2], ['A', 16], ['B', 8], ['A2', 8]], [['A', 8], ['B', 8], ['A2', 8]]][avoid('form', [0, 1, 2, 3])];
    } else if (form === 'evolve') {
      const Lf = LO.clamp((BP && BP.length) || 1, 0.5, 1.5) * (bpmD < 100 ? 0.5 : 1);
      const q = n => Math.max(4, Math.round(n * Lf / 4) * 4);
      FORM = [[8, 8, 16, 8, 16, 8], [8, 16, 16, 8, 16, 8], [4, 8, 24, 8, 24, 8], [8, 8, 16, 16, 16, 8]][avoid('form', [0, 1, 2, 3])]
        .map((n, i) => [['intro', 'build', 'A', 'break', 'A2', 'outro'][i], q(n)]);
    } else {
      const iL = bpmD < 100 ? 2 : 4, bL = bpmD < 100 ? 2 : 4;
      FORM = [[['intro', iL], ['A', 8], ['B', 8], ['break', bL], ['A2', bpmD < 95 ? 4 : 8], ['outro', 2]],
        [['intro', iL], ['A', 8], ['B', 8], ['A2', 8], ['break', bL], ['outro', 4]],
        [['intro', 2], ['A', 8], ['B', 16], ['break', 2], ['A2', 8], ['outro', 2]],
        [['intro', iL], ['A', 16], ['break', bL], ['A2', 8], ['outro', 2]]][avoid('form', [0, 1, 2, 3])];
    }
    const chordRate = BP ? LO.clamp(BP.chordRate || 1, 1, 4) : 1;
    const sections = []; const bars = [];
    let barCursor = 0;
    for (const [name, n] of FORM) {
      sections.push({ name, start: barCursor, bars: n });
      const src = { intro: pA, build: pA, A: pA2 ? pA.concat(pA2) : pA, B: (pB || pA).concat(pB2 || pA), break: (pB || pA).concat(pB2 || pA), A2: pA.concat(pA2 || pA), outro: form === 'evolve' ? pA : [degChord(0, GN.jazzy > 0.5)] }[name];
      for (let i = 0; i < n; i++) {
        const k = (lift && (name === 'A2' || name === 'outro')) ? 2 : 0;
        const ci = Math.floor(i / chordRate) % src.length;
        const isSur = !!(surpriseName && ((name === 'B' && i === 5) || (form === 'evolve' && name === 'break' && i === Math.min(n - 1, chordRate * 5))));
        bars.push({ sec: name, idx: i, chord: (isSur && form === 'evolve' ? LO.SURPRISES[surpriseName]() : src[ci]).map(x => x + k), surprise: isSur });
      }
      barCursor += n;
    }
    const NB = bars.length;
    const loopStart = loop ? (sections.find(s => s.name === 'A') || sections[0]).start : 0;
    const center = 72 + key - (key > 6 ? 12 : 0) + (emo ? Math.round((bright - 5) * 0.6) : 0);
    const chordTones = ch => ch.map(c => 48 + key + c - (key > 6 ? 12 : 0));
    const rootOf = ch => 36 + key + ch[0] - (key + ch[0] > 9 ? 12 : 0);
    bars.forEach(b => { b.tones = chordTones(b.chord); b.root = rootOf(b.chord); });
    // voicing: as written, smooth (each chord moves as little as possible from the last), or open (spread wide)
    const voicing = avoid('voicing', ['root', 'smooth', 'smooth', 'open']);
    if (voicing === 'smooth') {
      let prevT = null;
      for (const b of bars) {
        if (!prevT) { prevT = b.tones; continue; }
        let best = b.tones, bd = 1e9;
        const base = b.tones.slice(0, 3);
        for (let inv = 0; inv < 3; inv++) for (const sh of [-12, 0, 12]) {
          const v = base.map((x, j) => x + (j < inv ? 12 : 0) + sh).sort((a, c) => a - c);
          if (v[0] < 45 || v[2] > 72) continue;
          const d = v.reduce((a, x, j) => a + Math.abs(x - (prevT[j] || x)), 0);
          if (d < bd) { bd = d; best = v.concat(b.tones.slice(3)); }
        }
        b.tones = best; prevT = best;
      }
    } else if (voicing === 'open') for (const b of bars) { const t = b.tones.slice(); if (t[1] - 12 >= 40) { t[1] -= 12; b.tones = t.sort((a, c) => a - c); } }

    // ---- melody: motif + sequence + one earworm leap, judged by voice-leading rules
    const pcRel = m => ((m - key) % 12 + 12) % 12;
    const SCN = []; for (let m = 36; m < 100; m++) if (LSC.includes(pcRel(m))) SCN.push(m);
    const LT = dark && leadScale !== 'harmonic' && modeName !== 'phrygian' && modeName !== 'harmonic minor' ? null : 11; // leading tone (7th) when the scale has one
    const step = (m, s) => {
      let i = 0, bd = 99; SCN.forEach((x, j) => { const d = Math.abs(x - m); if (d < bd) { bd = d; i = j; } });
      return SCN[LO.clamp(i + s, 0, SCN.length - 1)];
    };
    // the judge: pick the best candidate note instead of the first one that fits
    const judge = (target, prev, pcs, strong, bassNow, bassPrev) => {
      const cands = [];
      for (let c = target - 7; c <= target + 7; c++) {
        const pc = pcRel(c);
        if (strong ? pcs.includes(pc) : (LSC.includes(pc) || pcs.includes(pc))) cands.push(c);
      }
      if (!cands.length) return target;
      let best = target, bs = 1e9;
      const bassMove = Math.sign(bassNow - bassPrev);
      for (const c of cands) {
        let s = Math.abs(c - target) * 0.6;
        const leap = Math.abs(c - prev);
        if (leap > 12) s += 8; else if (leap > 7) s += 2;
        if (c < center - 7 || c > center + 12) s += 6;
        const mv = Math.sign(c - prev);
        if (bassMove && mv === -bassMove) s -= 1;                                     // contrary motion
        const ivNow = ((c - bassNow) % 12 + 12) % 12, ivPrev = ((prev - bassPrev) % 12 + 12) % 12;
        if (bassMove && mv === bassMove && ivNow === ivPrev && (ivNow === 0 || ivNow === 7)) s += 3; // parallel 8ves/5ths
        if (LT != null && pcRel(prev) === LT) s += (c === prev + 1 ? -2.5 : 1.5);       // leading tone resolves up
        s += R.range(0, 0.8);
        if (s < bs) { bs = s; best = c; }
      }
      return best;
    };
    const T3 = 4 / 3, E3 = 2 / 3;
    const rhyPool = waltz ? (complex < 4 ? [[T3, T3, T3], [2 * T3, T3], [T3, 2 * T3], [4]] : [[T3, T3, T3], [2 * T3, T3], [E3, E3, T3, T3], [T3, E3, E3, T3], [E3, E3, E3, E3, T3], [T3, 2 * T3], [2 * E3 + T3, E3, E3]])
      : complex < 4
      ? [[1, 1, 2], [2, 2], [1, 1, 1, 1], [1.5, .5, 2], [1, .5, .5, 2]]
      : [[1, .5, .5, 2], [.75, .25, 1, 2], [.5, .5, 1, .5, .5, 1], [1.5, .5, 2], [.5, .5, .5, .5, 2], [1, 1, .5, .5, 1], [.75, .75, .5, 2], [.5, 1, .5, 2], [.25, .25, .5, 1, 2]];
    const contour = () => {
      const c = []; for (let i = 0; i < 5; i++) c.push(R.pick([-2, -1, -1, 1, 1, 2]));
      c[R.int(1, 4)] = R.pick([3, 4, -3]);
      return c;
    };
    // GROOVE rhythm cells: a negative number is a rest. Plain cells fill the bar, rest cells breathe,
    // syncopated cells start off the beat or tie across it (aiming for medium syncopation: Witek et al. 2014).
    const POOL = waltz ? {
      plain: complex < 4 ? [[T3, T3, T3], [2 * T3, T3], [T3, 2 * T3]] : [[T3, T3, T3], [2 * T3, T3], [E3, E3, T3, T3], [T3, E3, E3, T3], [E3, E3, E3, E3, T3], [T3, 2 * T3], [2 * E3 + T3, E3, E3]],
      rest: [[T3, T3, -T3], [-T3, T3, T3], [2 * T3, -T3], [T3, -E3, E3, T3], [E3, E3, T3, -T3]],
      sync: [[E3, T3, E3 + T3], [T3, E3, T3 + E3], [-E3, E3, T3, T3]],
    } : {
      plain: complex < 4 ? [[1, 1, 2], [2, 2], [1, 1, 1, 1], [1, .5, .5, 2]] : [[1, .5, .5, 2], [.75, .25, 1, 2], [.5, .5, 1, .5, .5, 1], [.5, .5, .5, .5, 2], [1, 1, .5, .5, 1], [.25, .25, .5, 1, 2]],
      rest: complex < 4 ? [[1, 1, 1, -1], [2, 1, -1], [-1, 1, 1, 1], [1, -1, 2], [1, 1, -.5, .5, 1]]
        : [[1, .5, -.5, 2], [-.5, .5, 1, 2], [.5, -.5, .5, .5, 2], [.75, .25, -1, 2], [1.5, -.5, 1, 1], [.5, .5, 1, -1, 1], [1, .5, .5, 1, -1], [-1, .5, .5, 1, 1]],
      sync: complex < 4 ? [[1.5, .5, 2], [1.5, 1.5, 1], [.5, 1, .5, 2], [1, 1.5, 1.5]]
        : [[1.5, .5, 2], [.75, .75, .5, 2], [.5, 1, .5, 2], [.5, 1, 1, 1.5], [1.5, 1.5, 1], [1, 1.5, .5, 1], [.75, .75, .75, .75, 1], [-.5, 1, 1, 1.5], [.25, .5, .25, 1, 2]],
    };
    // the motif cell (repeated bar after bar) keeps its rests short, so the line breathes without hiccuping;
    // long rests belong at the ends of phrases (the cadence cells)
    const pickCell = motif => {
      const r = RG.random(), pr = .1 + .3 * bLevel, ps = .1 + .5 * sLevel, cat = r < pr ? 'rest' : r < pr + ps ? 'sync' : 'plain';
      let pool = POOL[cat];
      if (motif && cat === 'rest' && RG.chance(.75)) { const sh = pool.filter(c => Math.min(...c) > -1 + 1e-6 || waltz && Math.min(...c) > -T3 + 1e-6); if (sh.length) pool = sh; }
      return RG.pick(pool);
    };
    const CAD = waltz ? [[2 * T3, T3], [4]] : [[2, 2], [3, 1], [1.5, .5, 2], [4]];
    const CAD_BREATH = waltz ? [[2 * T3, -T3], [T3, T3, -T3], [T3, -T3, T3]] : [[2, 1, -1], [3, -1], [1.5, .5, 1, -1], [2, -2], [1, 1, -2], [.5, .5, 1, -2]];
    const cadenceCell = () => !GV ? R.pick(CAD) : RG.chance(.3 + .5 * bLevel) ? RG.pick(CAD_BREATH) : RG.pick(CAD);
    // contour archetypes: where the first note of each bar heads, in scale steps from the motif's first note
    const ARCH = { arch: [0, 2, 3, -1], falling: [0, -1, -2, -4], rising: [0, 1, 2, 4], wave: [0, 2, -1, 1], plateau: [0, 0, 3, 0] };
    const archAt = (name, b, nB) => { const a = ARCH[name] || ARCH.arch; const x = nB <= 1 ? 0 : b * 3 / (nB - 1); const i = Math.min(3, Math.floor(x)), f = x - i; return Math.round(a[i] + ((a[Math.min(3, i + 1)] - a[i]) * f)); };
    // motif development: one small idea grown four ways (sequence, inversion, fragment, augment), over 2 to 6 bars
    const melodyPhrase = (chords, base, kind, nB, arch) => {
      nB = nB || 4;
      const r1 = GV ? pickCell(true) : R.pick(rhyPool), r2 = GV ? pickCell(false) : R.pick(rhyPool), r3 = cadenceCell();
      const c1 = contour(), c2 = contour(), inv = c1.map(x => -x);
      const frag = r => LO.melodyRhythm.fragment(r.map(Math.abs)), aug = r => LO.melodyRhythm.augment(r.map(Math.abs));
      const plan4 = {
        sequence: [[r1, c1], [r1, c1, 2], [r1, c1, 4], [r3, inv]],
        inversion: [[r1, c1], [r1, inv], [r1, c1, 2], [r3, c2.map(x => -x)]],
        fragment: [[r1, c1], [GV ? frag(r1) : LO.melodyRhythm.fragment(r1), c1], [GV ? frag(r1) : LO.melodyRhythm.fragment(r1), c1, 3], [r3, inv]],
        augment: [[r1, c1], [r1, c1, 1], [GV ? aug(r1) : LO.melodyRhythm.augment(r1), c1], [r3, inv]],
      }[kind] || [[r1, c1], [r1, c1], [r2, c2], [r3, inv]];
      let plan = plan4;
      if (nB === 2) plan = [plan4[0], plan4[3]];
      else if (nB === 3) plan = [plan4[0], plan4[1], plan4[3]];
      else if (nB === 5) plan = [plan4[0], plan4[1], plan4[2], [r2, c2, -1], plan4[3]];
      else if (nB === 6) plan = [plan4[0], plan4[1], plan4[2], [r1, c1, 3], [r2, c2], plan4[3]];
      const out = []; let prev = base, first = null;
      plan.forEach(([rh, co, shift], b) => {
        const ch = chords[Math.min(chords.length - 1, b)];
        const pcs = ch.map(x => ((x % 12) + 12) % 12); let pos = 0, nb = 0;
        const bassNow = rootOf(ch), bassPrev = rootOf(chords[Math.max(0, Math.min(chords.length - 1, b - 1))]);
        const lastI = rh.reduce((a, d, i) => d > 0 ? i : a, -1);
        rh.forEach((d, i) => {
          if (d < 0) { pos -= d; return; }                                   // a rest: the melody breathes
          let target;
          if (!out.length) target = prev;
          else if (nb === 0 && shift != null && first != null) target = step(first, shift);
          else if (GV && arch && nb === 0 && b > 0 && first != null && RG.chance(.75)) target = step(first, archAt(arch, b, nB));
          else target = step(prev, co[i % co.length]);
          const strong = pos % 2 === 0 || d >= 1;
          let m = judge(target, prev, pcs, strong, bassNow, bassPrev);
          if (b === nB - 1 && i === lastI) m = judge(m, prev, [pcs[0], pcs[1]], true, bassNow, bassPrev);
          out.push({ bar: b, pos, d, m, slide: d >= 1.5 && R.chance(0.35), v: pos % 2 === 0 ? 1 : 0.85, pcs });
          if (first == null) first = m;
          prev = m; pos += d; nb++;
        });
      });
      out.arch = arch || null; out.nB = nB;
      return out;
    };
    // pushes: anticipate a downbeat (or beat 3) by an eighth, tied over: the note arrives early and carries the accent
    const addPushes = (mel, pP) => {
      const out = mel.map(n => ({ ...n })); const sh = waltz ? E3 : 0.5; let c = 0;
      for (let i = 1; i < out.length; i++) {
        const n = out[i], p = out[i - 1];
        if (Math.abs(p.bar * 4 + p.pos + p.d - (n.bar * 4 + n.pos)) > 1e-6 || p.d < 1) continue;
        const onDown = n.pos === 0 && n.bar > 0, onB3 = !waltz && n.pos === 2;
        if (!(onDown && RG.chance(pP)) && !(onB3 && RG.chance(pP * 0.5))) continue;
        p.d -= sh; n.d += sh; n.pos -= sh; if (n.pos < 0) { n.pos += 4; n.bar -= 1; } n.push = true; c++;
      }
      out.arch = mel.arch; out.nB = mel.nB; out.pushes = c;
      return out;
    };
    // pickups (anacrusis): one to three notes stepping into the phrase from the bar before
    const PICK = waltz ? [[[8 / 3, T3]], [[8 / 3, E3], [10 / 3, E3]]] : [[[3.5, .5]], [[3, .5], [3.5, .5]], [[2.5, .5], [3, .5], [3.5, .5]], [[3, 1]], [[3.25, .25], [3.5, .5]]];
    const addPickup = (mel, pP) => {
      if (!mel.length || !RG.chance(pP)) return mel;
      const f = mel[0]; if (f.bar !== 0 || f.pos > 0.01) return mel;
      const shp = RG.pick(PICK), dir = RG.chance(.6) ? -1 : 1, k = shp.length;
      const pk = shp.map(([pos, d], j) => ({ bar: -1, pos, d, m: step(f.m, dir * (k - j)), v: 0.78, pick: true, pcs: f.pcs }));
      const out = pk.concat(mel); out.arch = mel.arch; out.nB = mel.nB; out.pushes = mel.pushes; out.pickup = k;
      return out;
    };
    // accents + swells: downbeats lead, syncopations carry the accent, the phrase swells toward its peak
    const isBeat = p => waltz ? Math.abs(p / T3 - Math.round(p / T3)) < 1e-6 : Math.abs(p - Math.round(p)) < 1e-6;
    const accent = mel => {
      if (!mel.length) return mel;
      let pk = 0; mel.forEach((n, i) => { if (n.m > mel[pk].m) pk = i; });
      const N = mel.length;
      mel.forEach((n, i) => {
        const p = ((n.pos % 4) + 4) % 4;
        let v = p < 1e-6 ? 1 : isBeat(p) ? 0.9 : Math.abs(p * 2 - Math.round(p * 2)) < 1e-6 ? 0.8 : 0.74;
        if (n.push || (!isBeat(p) && n.d >= 1)) v = 1;
        if (n.pick) v = 0.78;
        const swl = 1 - Math.min(1, Math.abs(i - pk) / Math.max(3, N * 0.6));
        n.v = LO.clamp(v * (0.86 + 0.14 * swl), 0.4, 1);
      });
      return mel;
    };
    // varied repeats: a theme never comes back as an exact copy
    let lastVar = null;
    const vary = (mel, passN, splitAt, noOct) => {
      let out = mel.map(n => ({ ...n })); const used = [];
      const nv = passN >= 2 ? 2 : 1;
      for (let k = 0; k < nv; k++) {
        let opts = ['ornament', 'shift', 'cadence', 'octave'].filter(v => v !== lastVar && !used.includes(v));
        const top = Math.max(...out.map(n => n.m));
        if (noOct || top + 12 > center + 19) opts = opts.filter(v => v !== 'octave');
        const v = RG.pick(opts); used.push(v); lastVar = v;
        if (v === 'ornament') {
          const cand = out.map((n, i) => i).filter(i => out[i].d >= 1 && !out[i].pick && i > 0);
          const pickI = []; for (let j = 0; j < 2 && cand.length; j++) pickI.push(cand.splice(RG.int(0, cand.length - 1), 1)[0]);
          pickI.sort((a, b) => b - a);
          for (const i of pickI) { const n = out[i], up = RG.chance(.65) ? 1 : -1; out.splice(i, 1, { ...n, d: .25, m: step(n.m, up), v: n.v * .82, orn: true, slide: false }, { ...n, pos: n.pos + .25, d: n.d - .25 }); }
        } else if (v === 'shift') {
          const maxB = Math.max(...out.map(n => n.bar));
          const bars2 = []; for (let b = splitAt; b <= maxB; b++) { const ns = out.filter(n => n.bar === b && !n.pick); if (ns.length >= 2 && ns[0].pos < 0.01 && !ns.some(n => n.pos + n.d > 4 + 1e-6)) bars2.push(b); }
          if (bars2.length) {
            const b = RG.pick(bars2), sh = waltz ? E3 : .5;
            const pi = out.findIndex(n => n.bar === b) - 1; if (pi >= 0 && out[pi].bar * 4 + out[pi].pos + out[pi].d >= b * 4 - 1e-6) out[pi].d += sh;
            out = out.map(n => n.bar !== b ? n : { ...n, pos: n.pos + sh, d: Math.min(n.d, 4 - n.pos - sh) }).filter(n => n.d >= 0.24);
          }
        } else if (v === 'cadence') {
          const maxB = Math.max(...out.map(n => n.bar)), last = out.filter(n => n.bar === maxB);
          if (last.length) {
            const rh = RG.pick(CAD_BREATH.concat(CAD)), ps = last.map(n => n.m), pcs = last[last.length - 1].pcs || [];
            const nw = []; let pos = 0, j = 0;
            for (const d of rh) { if (d < 0) { pos -= d; continue; } nw.push({ ...last[Math.min(j, last.length - 1)], bar: maxB, pos, d, m: ps[j % ps.length], push: false, orn: false }); pos += d; j++; }
            const fin = nw[nw.length - 1], oldPc = pcRel(ps[ps.length - 1]);
            let best = fin.m, bd = 99; for (let c = fin.m - 5; c <= fin.m + 5; c++) { const pc = ((c % 12) + 12) % 12; if (pcs.includes(pc) && pcRel(c) !== oldPc && Math.abs(c - fin.m) < bd) { bd = Math.abs(c - fin.m); best = c; } }
            fin.m = best;
            const firstLast = out.findIndex(n => n.bar === maxB && !n.pick);
            out = out.filter(n => n.bar !== maxB || n.pick); out.splice(firstLast < 0 ? out.length : Math.min(firstLast, out.length), 0, ...nw);
            out.sort((a, b) => (a.bar * 4 + a.pos) - (b.bar * 4 + b.pos));
          }
        } else if (v === 'octave') {
          out = out.map(n => n.bar >= splitAt ? { ...n, m: n.m + 12 } : n);
        }
      }
      out.vars = used; return out;
    };

    const parts = { lead: [], counter: [], bass: [], drums: [], chords: [], fx: [] };
    const sw = pos => {
      if (meter === 'shuffle') { // 12/8 feel: every off-beat lands on the triplet
        const b = Math.floor(pos + 1e-6), f = pos - b;
        const m = Math.abs(f - 0.5) < 1e-6 ? 2 / 3 : Math.abs(f - 0.25) < 1e-6 ? 1 / 3 : Math.abs(f - 0.75) < 1e-6 ? 5 / 6 : f;
        return b + m;
      }
      const s16 = Math.round(((pos % 0.5) + 0.5) % 0.5 * 4) / 4;
      return Math.abs(s16 - 0.25) < 1e-6 ? pos + swing : pos;
    };

    if (form === 'jingle-win') {
      const tones = bars[0].tones; const top = [0, 1, 2].map(i => tones[i] + 12);
      [[0, .5], [.5, .5], [1, .5], [1.5, 2.5]].forEach(([p, d], i) => parts.lead.push({ t: p, d, m: [top[0], top[1], top[2], top[0] + 12][i], v: 1 }));
      [[4, .5], [4.5, .5], [5, 1], [6, 2]].forEach(([p, d], i) => parts.lead.push({ t: p, d, m: [top[1] + 5, top[2] + 5, top[2] + 7, top[0] + 14][i], v: 1 }));
      parts.lead.push({ t: 8, d: .5, m: top[2] + 7, v: 1 }, { t: 8.5, d: .5, m: top[0] + 14, v: 1 }, { t: 9, d: 1, m: top[1] + 14, v: 1 });
      parts.lead.push({ t: 12, d: 4, m: top[0] + 12, v: 1, slide: false });
    } else if (form === 'jingle-lose') {
      const top = bars[0].tones[2] + 12;
      [[0, 1.5, 0], [1.5, .5, -2], [2, 2, -3], [4, 1.5, -4], [5.5, .5, -5], [6, 2, -7], [8, 2, -8], [10, 2, -9], [12, 4, -12]]
        .forEach(([t, d, o]) => parts.lead.push({ t, d, m: top + o, v: 0.9, slide: d >= 2 }));
    } else {
      const secOf = nm => sections.find(x => x.name === nm);
      const chordsAt = (nm, off, n, fb) => { const sc = secOf(nm); if (!sc) return [...Array(n)].map((_, j) => fb[j % fb.length]); return [...Array(n)].map((_, j) => bars[sc.start + Math.min(sc.bars - 1, off + j)].chord); };
      // the COMPOSER module tries many melodies and keeps the best hook that fits the feeling (and, from v0.5.1,
      // the freshest one: melodic shapes used a lot in recent songs score lower)
      const TBL = params._table || null;
      const FRESH = GV && LO.freshMemory ? LO.freshMemory(params.history || [], params.loved || null) : null;
      const pPush = .12 + .5 * sLevel, pPick = .2 + .45 * sLevel;
      const picks = []; let pickN = 0; const EXPS = [];
      const groove = mel => GV ? accent(addPushes(mel, pPush)) : mel;
      // phrase form (v0.6.1): a head (the bars a consequent shares with its antecedent) and an open or closed ending
      const shape = (mel, opt, chords) => {
        if (!opt) return mel;
        let out = mel;
        if (opt.head && opt.head.length) {
          const hb = opt.headBars; const keep = mel.filter(n => n.bar >= hb);
          out = opt.head.filter(n => n.bar < hb && !n.pick).map(n => ({ ...n })).concat(keep);
          out.arch = mel.arch; out.nB = mel.nB;
        }
        if (opt.end && out.length) {
          const last = out[out.length - 1], ch = chords[Math.min(chords.length - 1, last.bar)];
          const pcs = ch.map(x => ((x % 12) + 12) % 12);
          let best = last.m, bs = 1e9;
          for (let c = last.m - 7; c <= last.m + 7; c++) {
            const pr = pcRel(c); if (!pcs.includes(pr)) continue;
            let sc = Math.abs(c - last.m);
            if (opt.end === 'closed') sc += pr === 0 ? -6 : pr === pcs[0] ? 0 : 4;
            else sc += pr === 0 ? 8 : (pr === 7 || pr === 2) ? -3 : 0;
            if (sc < bs) { bs = sc; best = c; }
          }
          last.m = best; if (last.d < 1 && opt.end === 'closed') last.d = Math.max(last.d, Math.min(2, 4 - last.pos));
        }
        out.form = opt.form || null;
        return out;
      };
      const EXPM = OR ? { n: 0, iv: new Map() } : null;   // the song's own interval memory (the short-term model)
      const bestPhrase = (chords, base, label, nB, arch, opt) => {
        nB = nB || 4;
        if (!TBL) { pickN++; const m0 = groove(shape(melodyPhrase(chords, base, opt && opt.kinds ? opt.kinds[0] : 'classic', nB, arch), opt, chords)); if (EXPM) LO.expectLearn(EXPM, m0); return m0; }
        const kinds = opt && opt.kinds ? opt.kinds : ['classic', 'sequence', 'inversion', 'fragment', 'augment'];
        const K = LO.clamp(5 + Math.round(complex * 0.9), 5, 14), cands = [];
        const lastPcs = chords[nB - 1].map(x => ((x % 12) + 12) % 12);
        for (let k = 0; k < K; k++) {
          const kind = kinds[k % kinds.length], mel = groove(shape(melodyPhrase(chords, base, kind, nB, arch), opt, chords));
          const hook = LO.Composer.hookScore(mel, lastPcs, key), fit = LO.Composer.emotionFit(mel, center, TBL.emotion);
          const fresh = FRESH ? LO.freshness(LO.melodyGrams(mel.map(n => ({ t: n.bar * 4 + n.pos, m: n.m }))), FRESH) : null;
          const ex = EXPM ? LO.expectScore(mel, EXPM) : null;
          const total = ex ? (fresh == null ? hook.score * 0.55 + fit * 0.3 + ex.score * 0.15 : hook.score * 0.42 + fit * 0.24 + fresh * 0.19 + ex.score * 0.15)
            : (fresh == null ? hook.score * 0.65 + fit * 0.35 : hook.score * 0.5 + fit * 0.28 + fresh * 0.22);
          cands.push({ k, kind, mel, hook, fresh, ex, total });
        }
        const lock = VL && VL.mp && VL.mp[pickN] != null ? cands.find(c => c.k === VL.mp[pickN]) : null;
        pickN++;
        const pick = lock ? (TBL.ev('COMPOSER', 'work', 'HOOK', `${label}: REPLAYING THE KEPT MELODY`, 2), lock) : LO.Composer.choose(TBL, cands, label, params._fix);
        picks.push(pick.k);
        if (EXPM) { LO.expectLearn(EXPM, pick.mel); if (pick.ex) EXPS.push({ label, ...pick.ex }); }
        return pick.mel;
      };
      // phrase lengths inside an 8-bar theme, and a contour archetype for each theme
      const SPL = { '4-4': [4, 4], '3-5': [3, 5], '5-3': [5, 3], '6-2': [6, 2], '2-6': [2, 6] };
      const ANS = { arch: 'falling', rising: 'falling', falling: 'arch', wave: 'falling', plateau: 'falling' };
      const ARCHS = ['arch', 'falling', 'rising', 'wave', 'plateau'];
      const splA = GV ? SPL[avoid('phr', ['4-4', '4-4', '3-5', '5-3', '6-2', '2-6'])] : [4, 4];
      const splB = GV ? SPL[RG.pick(['4-4', '4-4', '3-5', '5-3', '6-2'])] : [4, 4];
      const arcA = GV ? avoid('arc', ARCHS) : null, arcB = GV ? RG.pick(ARCHS.filter(a => a !== arcA)) : null;
      // PHRASE FORM (v0.6.1, Schoenberg): a PERIOD (antecedent ends open, the consequent starts the same way and
      // closes on home) or a SENTENCE (an idea, its varied repeat, then it breaks up into the cadence)
      const tf = OR ? (splA[0] === 4 && splA[1] === 4 ? avoid('tf', ['period', 'sentence']) : 'sentence') : null;
      const fA1 = !OR ? null : tf === 'period' ? { end: 'open', form: 'PERIOD: ANTECEDENT' } : { kinds: ['sequence', 'sequence', 'inversion'], form: 'SENTENCE: IDEA + REPEAT' };
      const melA = bestPhrase(chordsAt('A', 0, splA[0], pA), center, 'THEME A', splA[0], arcA, fA1);
      const fA2 = !OR ? null : tf === 'period' ? { head: melA, headBars: 2, end: 'closed', form: 'PERIOD: CONSEQUENT' } : { kinds: ['fragment', 'fragment', 'classic'], end: 'closed', form: 'SENTENCE: BREAK-UP + CADENCE' };
      const melA2 = bestPhrase(chordsAt('A', splA[0], splA[1], pA2), melA[melA.length - 1].m, 'THEME A ANSWER', splA[1], arcA && ANS[arcA], fA2);
      const bName = secOf('B') ? 'B' : 'break';
      const melB = bestPhrase(chordsAt(bName, 0, splB[0], pB), center + 3, 'THEME B', splB[0], arcB, OR ? { end: 'open', form: 'B: OPENS' } : null);
      const melB2 = bestPhrase(chordsAt(bName, splB[0], splB[1], pB2), melB[melB.length - 1].m, 'THEME B ANSWER', splB[1], arcB && ANS[arcB], OR ? { end: 'open', form: 'B: LEADS BACK HOME' } : null);
      const P1 = GV ? (m => addPickup(m, pPick)) : (m => m);
      const pA1 = P1(melA), pA2m = P1(melA2), pB1 = P1(melB), pB2m = P1(melB2);
      const join = (a, b, at) => a.concat(b.map(n => ({ ...n, bar: n.bar + at })));
      const secMel = { A: join(pA1, pA2m, splA[0]), B: join(pB1, pB2m, splB[0]), break: form === 'evolve' ? join(pB1, pB2m, splB[0]) : (GV ? P1(melB2) : melB2) };
      secMel.A2 = secMel.A;
      const splitOf = { A: splA[0], A2: splA[0], B: splB[0], break: form === 'evolve' ? splB[0] : 0 };
      const plays = {};
      if (GROOVE) {
        GROOVE.phrases = { A: splA.join('+'), B: splB.join('+') }; GROOVE.arcs = { A: arcA, B: arcB };
        GROOVE.pushes = [melA, melA2, melB, melB2].reduce((a, m) => a + (m.pushes || 0), 0);
        GROOVE.pickups = [pA1, pA2m, pB1, pB2m].filter(m => m.pickup).length;
        V.mp = picks.slice();
        if (OR) { GROOVE.themeForm = tf; GROOVE.expect = EXPS; }
      }
      for (const s of sections) {
        const mel0 = secMel[s.name]; if (!mel0) continue;
        const k = (lift && s.name === 'A2') ? 2 : 0;
        const oct = (s.name === 'A2' && center < 76 && intense >= 5) ? 12 : 0;
        const span = Math.max(4, mel0.reduce((a, n) => Math.max(a, n.bar + 1), 0));
        const src = s.name === 'A2' ? 'A' : s.name;
        for (let rep = 0; rep * span < s.bars; rep++) {
          const passN = plays[src] = (plays[src] == null ? 0 : plays[src] + 1);
          let mel = mel0;
          if (GV && passN > 0) { mel = vary(mel0, passN, splitOf[s.name] || 0, oct > 0); GROOVE.vars.push(`${s.name}${rep ? ' ' + (rep + 1) : ''}: ${mel.vars.join(' + ')}`); }
          for (const n of mel) {
            const bar = n.bar + rep * span; if (bar >= s.bars) continue;
            const t = (s.start + bar) * 4 + sw(n.pos); if (t < 0) continue;
            parts.lead.push({ t, d: n.d, m: n.m + k + oct, v: n.v, slide: n.slide, sec: s.name, push: n.push || undefined, pick: n.pick || undefined, orn: n.orn || undefined });
          }
        }
      }
      if (GV) { // one voice: a pickup or a push cuts the note it overlaps, never the other way round
        parts.lead.sort((a, b) => a.t - b.t);
        for (let i = 0; i < parts.lead.length - 1; i++) { const a = parts.lead[i], b = parts.lead[i + 1]; if (b.t < a.t + a.d - 1e-6) a.d = b.t - a.t; }
        parts.lead = parts.lead.filter(n => n.d >= 0.12 || (n.orn && n.d > 0.05));
      }
      if (complex >= 3) {
        for (const s of sections) {
          if (s.name === 'B' && !waltz && !(OR && complex >= 6)) {
            for (let i = 0; i < s.bars; i++) {
              const b = bars[s.start + i]; const t0 = (s.start + i) * 4;
              const tones = b.tones.slice(0, 3).map(x => x + 12);
              const fig = R.chance(0.5) ? [[2, .5], [2.5, .5], [3, 1]] : [[2, .25], [2.25, .25], [2.5, .5], [3, 1]];
              fig.forEach(([p, d], j) => parts.counter.push({ t: t0 + sw(p), d, m: tones[(j + i) % tones.length], v: 0.8 }));
            }
          } else if (s.name === 'A2' && complex >= 5 && !OR) {
            for (const n of parts.lead.filter(x => x.sec === 'A2')) {
              const b = bars[Math.min(NB - 1, Math.floor(n.t / 4))];
              const pcs = b.chord.map(x => ((x % 12) + 12) % 12);
              let h = n.m - 3; for (let c = n.m - 3; c >= n.m - 7; c--) if (pcs.includes(pcRel(c))) { h = c; break; }
              parts.counter.push({ t: n.t, d: n.d, m: h, v: 0.7, slide: n.slide });
            }
          }
        }
      }
    }

    // ---- rhythm genes (Euclidean)
    const kickK = VEC ? VEC.kickK : LO.clamp(Math.round(3 + intense * 0.3 + R.range(-0.6, 0.6)), 3, 7);
    const percK = VEC ? VEC.percK : R.pick([3, 5, 5, 7]);
    let bassStyle = VEC ? VEC.bassStyle : GN.bass;
    const ALT_BASS = { drive: ['eighths', 'euclid', 'octave'], eighths: ['drive', 'euclid', 'octave'], euclid: ['drive', 'eighths'], funk: ['walk', 'octave'], walk: ['funk'], offbeat: ['rolling', 'sub'], orch: ['hold', 'walk'], rolling: ['offbeat', 'sub'], deephouse: ['funk', 'offbeat'], sub: ['offbeat', 'hold'], electro: ['euclid', 'funk'], acid: ['acid'], reese: ['sub', 'rolling'] };
    if (!VEC) { if (VL && VL.bass) bassStyle = VL.bass; else if ((ALT_BASS[GN.bass] || []).length && RV.chance(BP ? 0.25 : 0.45)) bassStyle = RV.pick(ALT_BASS[GN.bass]); }
    if (waltz && !['hold', 'sub', 'orch'].includes(bassStyle)) bassStyle = 'waltz';
    V.bass = bassStyle;
    const bassK = LO.clamp(kickK + 2, 5, 9);

    bars.forEach((b, i) => {
      const t0 = i * 4;
      parts.chords.push({ t: t0, d: 4, tones: b.tones, sec: b.sec, surprise: b.surprise });
      if (form.startsWith('jingle')) { parts.bass.push({ t: t0, d: i === NB - 1 ? 4 : 3.9, m: b.root, v: 1 }); return; }
      if (b.sec === 'intro' && genreName !== 'TECHNO') return;
      const last = b.sec === 'outro';
      const nextRoot = i + 1 < NB ? bars[i + 1].root : b.root;
      let style = bassStyle;
      if (b.sec === 'break' || last) style = 'hold';
      if (intense < 3 && style === 'drive') style = 'eighths';
      if (waltz && style === 'hold') style = 'hold';
      const pats = {
        drive: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map((p, j) => [p, j % 2 ? 12 : 0, .45]),
        eighths: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(p => [p, 0, .45]),
        euclid: LO.euclid(bassK, 16).map((s, j) => [s / 4, j % 3 === 2 ? 12 : j % 4 === 3 ? 7 : 0, .22]),
        funk: [[0, 0, .7], [.75, 0, .2], [1.5, 12, .22], [1.75, 7, .22], [2.5, 0, .45], [3, 7, .22], [3.5, 12, .2], [3.75, 'approach', .25]],
        walk: [[0, 0, .9], [1, 'third', .9], [2, 7, .9], [3, 'approach', .9]],
        offbeat: [.5, 1.5, 2.5, 3.5].map(p => [p, 0, .4]),
        orch: [[0, 0, 1.9], [2, 7, 1.9]],
        hold: [[0, 0, last ? 4 : 3.9]],
        sub: [[0, 0, 3.9]],
        rolling: [...Array(16).keys()].filter(st => st % 4 !== 0).map(st => [st / 4, st % 4 === 2 ? 0 : (st % 8 === 3 ? 12 : 0), .2]),
        deephouse: [[.5, 0, .4], [1.25, 0, .2], [1.75, 12, .2], [2.5, 0, .4], [3.25, 7, .2], [3.75, 10, .2]],
        acid: [...Array(16).keys()].map(st => [st / 4, [0, 0, 12, 0, 3, 0, 15, 10, 0, 12, 0, 7, 0, 10, 12, 5][st], .22, st % 4 === 2 || st === 6 || st === 14]),
        electro: [[0, 0, .3], [.75, 0, .2], [1.5, 12, .2], [2, 0, .3], [2.75, 7, .2], [3.25, 0, .2], [3.5, 10, .2]],
        reese: [[0, 0, 1.4, false], [1.5, 0, 1.0, true], [2.5, 3, 0.9, true], [3.5, 0, .5, true]],
        octave: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map((p, j) => [p, [0, 12, 0, 12, 7, 12, 0, 10][j], .42]),
        waltz: [[0, 0, 1.25], [4 / 3, 7, 0.6], [8 / 3, 12, 0.6]],
      }[style] || [[0, 0, 3.9]];
      for (const [p, iv, d, acc] of pats) {
        let m;
        if (iv === 'approach') m = nextRoot - 1 > b.root - 6 ? nextRoot - 1 : nextRoot + 1;
        else if (iv === 'third') m = b.root + (((b.chord[1] - b.chord[0]) % 12 + 12) % 12);
        else m = b.root + iv;
        parts.bass.push({ t: t0 + sw(p), d, m, v: acc === true ? 1 : p === 0 ? 1 : 0.8, slide: iv === 'approach' || (style === 'acid' && acc === true) || (style === 'reese' && acc === true) });
      }
      // GROOVE: ghost notes in the bass, short and soft, only where the line is silent
      if (GV && !waltz && !last && b.sec !== 'break' && ['funk', 'walk', 'eighths', 'drive', 'octave', 'electro', 'deephouse', 'euclid', 'offbeat'].includes(style) && RG.chance(.2 + .35 * sLevel)) {
        const p = RG.pick([1.75, 3.75, 2.75, .75]), gt0 = t0 + sw(p);
        const busy = parts.bass.some(n => n.t < gt0 + .14 && n.t + n.d > gt0 - .02);
        if (!busy) { parts.bass.push({ t: gt0, d: .12, m: b.root + (RG.chance(.3) ? 12 : 0), v: .38, ghost: true }); GROOVE.bassGhosts++; }
      }
    });
    if (GV) parts.bass.sort((a, b) => a.t - b.t);

    // ---- drums: backbeat stays, kicks and percussion come from Euclidean genes
    const style = GN.drums;
    const fourFloor = ['synthwave', 'techno', 'house', 'trance'].includes(style);
    const DP = {
      chip: { s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [] },
      synthwave: { s: [4, 12], h: [2, 6, 10, 14], o: [] },
      downtempo: { s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [14], g: [9, 15], perc: true },
      lofi: { s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [], g: [15], rim: true, perc: true },
      techno: { s: [4, 12], h: [], o: [2, 6, 10, 14], clap: true, perc: true },
      cyber: { s: [4, 12], h: [...Array(16).keys()], o: [6, 14], g: [15] },
      orch: { timp: true },
      dungeon: { s: [8], h: [], o: [], perc: true },
      triphop: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [], g: [15], perc: true },
      house: { s: [4, 12], h: [], o: [2, 6, 10, 14], clap: true, perc: true, shaker: true },
      trance: { s: [4, 12], h: [...Array(16).keys()], o: [2, 6, 10, 14], clap: true },
      dnb: { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [], g: [7, 15] },
      breakbeat: { k: [0, 3, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [14], g: [7] },
      electro: { k: [0, 6, 10], s: [4, 12], h: [...Array(16).keys()], o: [], clap: true },
      idm: { s: [], h: [], o: [], idm: true },
      ambient: { s: [], h: [], o: [], ambient: true },
      rock: { k: [0, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [] },
      march: { k: [0, 8], s: [4, 12], h: [0, 4, 8, 12], o: [], g: [14, 15] },
    }[style] || { s: [4, 12], h: [0, 4, 8, 12], o: [] };
    let kicks = fourFloor ? [0, 4, 8, 12] : DP.k ? DP.k.slice() : style === 'dungeon' ? LO.euclid(2, 16, 0) : LO.euclid(kickK, 16).filter(s => !(DP.s || []).includes(s));
    if (DP.ambient) kicks = [];
    if (!kicks.includes(0)) kicks.unshift(0);
    const percSteps = DP.perc ? LO.euclid(percK, 16, 2).filter(s => s % 4 !== 0) : [];
    let hats = (DP.h || []).slice();
    if (intense >= 7 && hats.length === 8 && style !== 'lofi') hats = [...Array(16).keys()];
    if (intense < 3 && hats.length === 16) hats = hats.filter(x => x % 2 === 0);
    // groove variants: 0 as written, 1 half-time, 2 busier with ghost notes, 3 syncopated kicks, 4 open hats on the off-beats
    const variant = v => {
      const d = { s: (DP.s || []).slice(), g: (DP.g || []).slice(), o: (DP.o || []).slice(), h: hats.slice(), k: kicks.slice() };
      if (DP.timp || DP.idm || DP.ambient) return d;
      if (v === 1 && !fourFloor && d.s.length) { d.s = [8]; d.k = d.k.filter(x => x !== 8); }
      if (v === 2) { if (d.h.length === 8) d.h = [...Array(16).keys()]; d.g = d.g.concat([7, 14].filter(x => !d.s.includes(x))); }
      if (v === 3) { for (const x of fourFloor ? [10] : [6, 10]) if (!d.k.includes(x) && !d.s.includes(x)) d.k.push(x); }
      if (v === 4) { d.o = [2, 6, 10, 14]; d.h = d.h.filter(x => x % 4 !== 2); }
      return d;
    };
    const dv = avoid('drum', [0, 1, 2, 3, 4]);
    // GROOVE: a hat accent pattern for the whole song (1 e & a), and ghost snares where the style has room
    const HATP = GV ? RG.pick([[.55, .35, .9, .4], [.7, .4, .85, .5], [.9, .45, .6, .45], [.6, .3, .75, .5], [.65, .45, .95, .35]]) : null;
    const GHOSTS = GV && !fourFloor && !['orch', 'dungeon', 'ambient', 'idm', 'march'].includes(style);
    const DPA = variant(dv), DPB = variant((dv + 2) % 5);
    bars.forEach((b, i) => {
      const t0 = i * 4; const sec = b.sec;
      const full = ['A', 'B', 'A2', 'build', 'intro', 'outro'].includes(sec) && (form === 'evolve' || ['A', 'B', 'A2'].includes(sec)) || form.startsWith('jingle');
      const phraseEnd = b.idx % 4 === 3 && full && i < NB - 1;
      if (form === 'jingle-lose') { if (i === 0) parts.drums.push({ t: 0, kind: 'crash', v: .5 }); return; }
      if (DP.timp && OR) return; // v0.6.1: the ORCHESTRA writes the orchestral percussion (below)
      if (DP.timp) {
        if (full || sec === 'outro') {
          parts.drums.push({ t: t0, kind: 'timp', v: 1, m: b.root + 12 });
          if (intense >= 4) parts.drums.push({ t: t0 + 2, kind: 'timp', v: .7, m: b.root + 12 });
          if (phraseEnd) for (let k = 0; k < 8; k++) parts.drums.push({ t: t0 + 2 + k * .25, kind: 'snare', v: .25 + .6 * k / 8 });
        }
        if (b.idx === 0 && (sec === 'A' || sec === 'A2')) parts.drums.push({ t: t0, kind: 'crash', v: .7 });
        return;
      }
      if (!full) {
        if (sec === 'break' && style !== 'dungeon') parts.drums.push({ t: t0, kind: 'hat', v: .4 }, { t: t0 + 2, kind: 'hat', v: .4 });
        if (sec === 'outro' && b.idx === 0) parts.drums.push({ t: t0, kind: 'kick', v: 1 }, { t: t0, kind: 'crash', v: .8 });
        return;
      }
      if (b.idx === 0 && (sec === 'A' || sec === 'A2' || sec === 'B') && style !== 'lofi') parts.drums.push({ t: t0, kind: 'crash', v: .65 });
      if (DP.idm) { // shifting Euclidean patterns that rotate every two bars
        const rot = Math.floor(i / 2);
        for (const s2 of LO.euclid(R.pick([3, 5, 7]), 16, rot)) parts.drums.push({ t: t0 + s2 / 4, kind: 'kick', v: .9 });
        for (const s2 of LO.euclid(2, 16, rot + 4)) parts.drums.push({ t: t0 + s2 / 4, kind: 'snare', v: .8 });
        for (const s2 of LO.euclid(R.pick([9, 11, 13]), 16, rot)) parts.drums.push({ t: t0 + s2 / 4, kind: 'hat', v: .5 });
        return;
      }
      if (DP.ambient) { if (b.idx % 2 === 0) parts.drums.push({ t: t0, kind: 'rim', v: .25 }); if (b.idx % 4 === 0) parts.drums.push({ t: t0, kind: 'crash', v: .25 }); return; }
      if (waltz) { // oom-pah-pah: kick on one, light hits on two and three
        parts.drums.push({ t: t0, kind: 'kick', v: .9 });
        for (const p of [4 / 3, 8 / 3]) parts.drums.push({ t: t0 + p, kind: dv % 2 ? 'rim' : 'hat', v: .5 });
        if (dv >= 2) parts.drums.push({ t: t0 + 8 / 3, kind: 'snare', v: .35 });
        if (phraseEnd) for (let k = 0; k < 3; k++) parts.drums.push({ t: t0 + 8 / 3 + k * 4 / 9, kind: 'tom', v: .45 + .15 * k, m: 50 - k * 3 });
        return;
      }
      const D = sec === 'B' ? DPB : DPA;
      if (DP.shaker) for (let k = 0; k < 16; k++) parts.drums.push({ t: t0 + sw(k / 4), kind: 'hat', v: k % 2 ? .35 : .2 });
      for (const s of D.k) parts.drums.push({ t: t0 + sw(s / 4), kind: 'kick', v: s === 0 ? 1 : .85 });
      for (const s of D.s) parts.drums.push({ t: t0 + sw(s / 4), kind: DP.clap ? 'clap' : 'snare', v: .9 });
      for (const s of D.g) parts.drums.push({ t: t0 + sw(s / 4), kind: DP.rim ? 'rim' : 'snare', v: .25 });
      const rollBar = GV && !phraseEnd && b.idx % 4 === 1 && (D.h.length || D.o.length) && RG.chance(.12 + .25 * sLevel);
      for (const s of D.h) { if (rollBar && s >= 14) continue; parts.drums.push({ t: t0 + sw(s / 4), kind: 'hat', v: GV ? LO.clamp(HATP[s % 4] + RG.range(-.05, .05), .2, 1) : s % 4 === 2 ? .9 : .55 }); }
      for (const s of D.o) { if (rollBar && s >= 14) continue; parts.drums.push({ t: t0 + sw(s / 4), kind: 'ohat', v: .75 }); }
      if (rollBar) { for (let k = 0; k < 4; k++) parts.drums.push({ t: t0 + 3.5 + k * .125, kind: 'hat', v: .35 + .12 * k, rt: true }); GROOVE.rolls++; }
      if (sec !== 'A' || complex >= 6) for (const s of percSteps) parts.drums.push({ t: t0 + sw(s / 4), kind: 'rim', v: .3 });
      if (GV && GHOSTS && RG.chance(.2 + .45 * sLevel)) {
        for (const s of RG.pick([[7], [9], [15], [7, 15], [3, 9], [7, 10]])) if (!D.s.includes(s) && !D.k.includes(s) && !D.g.includes(s)) { parts.drums.push({ t: t0 + sw(s / 4), kind: DP.rim ? 'rim' : 'snare', v: RG.range(.14, .22), ghost: true }); GROOVE.ghosts++; }
      }
      if (phraseEnd) {
        parts.drums = parts.drums.filter(d => !(d.t >= t0 + 3 && d.kind !== 'hat'));
        const fill = [[0, 1, 2, 3].map(k => [3 + k * .25, k < 2 ? 'snare' : 'tom']), [[3, 'snare'], [3.5, 'snare'], [3.75, 'snare']], [[3, 'tom'], [3.25, 'tom'], [3.5, 'tom'], [3.75, 'snare']], [[3.5, 'snare'], [3.75, 'kick']]][(dv + b.idx) % 4];
        fill.forEach(([p, kd], k) => parts.drums.push({ t: t0 + sw(p), kind: kd, v: .45 + .15 * k, m: 50 - k * 3 }));
      }
    });

    // ---- arpeggiator part (chip-independent), shaped by the blueprint
    parts.arp = [];
    const arpDef = BP && BP.arp ? BP.arp : (GN.arp ? { pattern: 'updown', rate: bpm > 110 ? 4 : 8, oct: 2 } : null);
    if (arpDef && !form.startsWith('jingle')) {
      const rate = LO.clamp(arpDef.rate + (emo && intense >= 7 && arpDef.rate < 8 ? 4 : 0), 1, 8);
      bars.forEach((b, i) => {
        if (b.sec === 'outro' && form !== 'evolve') return;
        const base = b.tones.slice(0, 3).map(x => x + 24);
        let seq = base.concat(arpDef.oct > 1 ? base.map(x => x + 12) : [base[0] + 12]);
        if (arpDef.pattern === 'updown') seq = seq.concat(seq.slice(1, -1).reverse());
        if (arpDef.pattern === 'octave') seq = base.flatMap(x => [x, x + 12]);
        const per = waltz ? (rate >= 4 ? 12 : 6) : 4 * rate, stepT = 4 / per;
        for (let k = 0; k < per; k++) {
          const m = arpDef.pattern === 'random' ? R.pick(seq) : seq[k % seq.length];
          parts.arp.push({ t: i * 4 + sw(k * stepT), d: 0.9 * stepT, m, v: k % (per / (waltz ? 3 : 4)) === 0 ? 0.9 : 0.7, sec: b.sec });
        }
      });
    }
    // ---- evolving forms: layers come and go by section (the build, the breakdown, the drop)
    const sweeps = [];
    if (form === 'evolve') {
      const LAY = {
        intro: { kick: 1, snare: 0, hats: 0, perc: 0, bass: 0, pad: 1, arp: 1, lead: 0, counter: 0 },
        build: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, pad: 1, arp: 1, lead: 0, counter: 0 },
        A: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, pad: 1, arp: 1, lead: 1, counter: 0 },
        break: { kick: 0, snare: 0, hats: 0, perc: 0, bass: 0, pad: 1, arp: 1, lead: 1, counter: 1 },
        A2: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, pad: 1, arp: 1, lead: 1, counter: 1 },
        outro: { kick: 1, snare: 0, hats: 1, perc: 0, bass: 0, pad: 1, arp: 1, lead: 0, counter: 0 },
      };
      const secAt = t => bars[Math.min(NB - 1, Math.floor(t / 4))].sec;
      const on = (t, layer) => (LAY[secAt(t)] || LAY.A)[layer];
      const dk = k => k === 'kick' ? 'kick' : (k === 'snare' || k === 'clap') ? 'snare' : (k === 'hat' || k === 'ohat') ? 'hats' : k === 'crash' ? 'crash' : 'perc';
      parts.drums = parts.drums.filter(d => d.kind === 'crash' || on(d.t, dk(d.kind)));
      for (const nm of ['bass', 'arp', 'counter']) parts[nm] = parts[nm].filter(n => on(n.t, nm));
      const dens = BP ? BP.leadDensity : 0.6;
      parts.lead = parts.lead.filter(n => on(n.t, 'lead') && (dens >= 0.7 || (secAt(n.t) !== 'A' ? R.chance(0.35 + dens) : (Math.abs(n.t % 1) < 1e-6 && R.chance(dens + 0.2)))));
      for (const s of sections) {
        if (s.name === 'A2' || s.name === 'A') parts.drums.push({ t: s.start * 4, kind: 'crash', v: s.name === 'A2' ? 1 : .7 });
        if ((s.name === 'build' || s.name === 'break') && (params.chip === 'LO-1' || params.chip === 'NEO GEO')) parts.drums.push({ t: (s.start + s.bars) * 4 - 8, kind: 'riser', v: 1 });
      }
      // filter sweeps (LO-1's resonant filter): open through the build, dip in the breakdown, wide open at the drop
      const at = nm => sections.find(x => x.name === nm);
      const pts = [];
      const add = (b, v) => pts.push([b * 4, v]);
      add(0, 0.2); add(at('build').start, 0.5); add(at('A').start, 1.0); add(at('break').start, 0.35);
      add(at('A2').start - 1, 1.3); add(at('A2').start, 1.15); add(at('outro').start, 1.0); add(NB, 0.25);
      if (!BP || BP.sweep) sweeps.push({ targets: ['pad', 'arp'], points: pts });
      if (BP && BP.bass === 'acid') sweeps.push({ targets: ['bass'], points: pts.map(([t, v]) => [t, 0.6 + v * 0.6 + 0.25 * Math.sin(t / 7)]) });
    } else if (BP && BP.sweep) {
      sweeps.push({ targets: ['pad', 'arp'], points: [[0, 0.4], [Math.min(16, NB * 4), 1], [NB * 4, 1]] });
    }

    // ---- GROOVE: feel per role, in milliseconds. These are wishes: CHIP KEEPER turns them into what each chip
    // can really do (whole driver ticks on the classic chips; true milliseconds only on ROLAND LA and LO-1).
    let warp = null;
    if (GV) {
      const FEEL = { downtempo: 1, lofi: 1.2, triphop: 1.1, deephouse: .8, nudisco: .7, house: .5, breakbeat: .6, dnb: .5, electro: .4, synthwave: .4, chip: .35, techno: .25, trance: .2, cyber: .25, orch: .6, dungeon: .5, ambient: .8, idm: 0, rock: .5, march: .2 };
      const fA = FEEL[GN.drums] != null ? FEEL[GN.drums] : .4;
      const laid = ['downtempo', 'lofi', 'triphop', 'deephouse', 'nudisco', 'ambient'].includes(GN.drums);
      const RH = LO.rng((seed ^ 0x4B1D) >>> 0), gs = () => (RH.random() + RH.random() + RH.random() - 1.5) * 2;
      const r1 = x => Math.round(x * 10) / 10;
      for (const d of parts.drums) {
        let fe = 0;
        if (d.kind === 'hat' || d.kind === 'ohat') fe = -(3 + 5 * fA) + gs() * 2 * fA;
        else if (d.kind === 'snare' || d.kind === 'clap') fe = (laid ? 7 * fA : 1.5 * fA) + gs() * 2 * fA;
        else if (d.kind === 'kick') fe = Math.abs(d.t % 4) < 1e-6 ? 0 : gs() * fA;
        else if (d.kind === 'rim' || d.kind === 'tom') fe = gs() * 3 * fA;
        if (fe) d.fe = r1(fe);
      }
      for (const n of parts.bass) n.fe = r1((4 + 6 * fA) * (laid ? 1 : .5) + gs() * 2 * fA);
      for (const n of parts.lead) n.fe = r1(gs() * 4 * (.4 + fA) - (n.push ? 3 : 0));
      for (const nm of ['counter', 'arp']) for (const n of parts[nm]) n.fe = r1(gs() * 2.5 * fA);
      // phrase-end ease-off, only in songs that end (a loop must keep perfect time to loop)
      if (!loop && (form === 'song' || form.startsWith('jingle'))) {
        warp = [{ a: Math.max(0, NB - 2) * 4, b: NB * 4, slow: +(.1 + .08 * (1 - intense / 10)).toFixed(3) }];
        const sB = sections.find(x => x.name === 'B');
        if (form === 'song' && sB && sB.start + sB.bars < NB - 2) warp.unshift({ a: (sB.start + sB.bars - 1) * 4, b: (sB.start + sB.bars) * 4, slow: .04 });
      }
      GROOVE.feel = +fA.toFixed(2); GROOVE.laidBack = laid; GROOVE.warp = warp;
    }

    let ORCH = null;
    if (OR && form.startsWith('jingle')) ORCH = { epic: params.epic != null ? params.epic : 5, roles: {}, lanes: 0, masked: 0, cp: 0, handed: 0, doubled: 0, perc: { timp: 0, rolls: 0, swells: 0, snare: 0 }, entrances: [] };
    else if (OR && LO.Orchestra) ORCH = LO.Orchestra.apply({ parts, bars, sections, key, SC, LSC, center, bpm, bpmD, waltz, meter, complex, intense, heroic, bright, dark, form, loop, genreName, purposeName, drums: GN.drums, BP, R: RO, epic: params.epic != null ? params.epic : BP && BP.epic != null ? BP.epic : null, sw, timp: !!DP.timp });
    const title = R.pick(TITLE_A) + ' ' + R.pick(TITLE_B);
    const ALT_LEAD = { pulse: ['saw', 'bell'], saw: ['pulse', 'brass'], sax: ['bell', 'pulse'], bell: ['pulse', 'sax'], brass: ['saw', 'sax'] };
    const ALT_PAD = { saw: ['strings', 'rhodes'], strings: ['saw', 'rhodes'], rhodes: ['strings', 'saw'], none: ['none'] };
    const leadT = VL && VL.lead ? VL.lead : RV.chance(BP ? 0.25 : 0.45) ? RV.pick(ALT_LEAD[GN.lead] || [GN.lead]) : GN.lead;
    const padT = VL && VL.pad ? VL.pad : RV.chance(BP ? 0.2 : 0.4) ? RV.pick(ALT_PAD[GN.pad] || [GN.pad]) : GN.pad;
    V.lead = leadT; V.pad = padT;
    const vector = { purpose: purposeName, genre: genreName, mode: modeName, key, bpm: bpmD, meter, leadScale, kickK, percK, bassStyle, bank: bankName };
    const skeleton = { genre: genreName, chip: params.chip, v: V, prog: bars.slice(0, 8).map(b => ((b.chord[0] % 12) + 12) % 12).join(''), form: sections.map(x => x.name[0] + x.bars).join(''), bpm: bpmD, mode: modeName, drum: GN.drums };
    if (GV) { skeleton.g = { s: V.gs, b: V.gb }; skeleton.ng = LO.melodyGrams(LO.melodyLine ? LO.melodyLine(parts) : parts.lead, 60); }
    if (BP) bassStyle = BP.bass || bassStyle;
    const song = {
      seed, title, params: { ...params },
      meta: {
        purpose: purposeName, genre: genreName, key, keyName: LO.NOTE_NAMES[key], mode: modeName, bpm, displayBpm: bpmD, meter, variety: V, skeleton, swing,
        bright, intense, heroic, complex, surprise, surpriseName, lift, loop, loopStart, form,
        leadTimbre: leadT, padTimbre: padT, arp: GN.arp && complex >= 2, drumStyle: GN.drums,
        leadScale, vector, usedBank: useBank, chordRate, sweeps, groove: GROOVE, warp, orch: ORCH, exact: !!(params.exact && OR), lib: params.lib != null ? params.lib : (OR ? 2 : 0),
        blueprint: BP ? { id: BP.id, name: BP.name, layer: BP.layer } : null,
        snes: BP && BP.snes ? { ...BP.snes } : null,
        hints: BP ? { pump: BP.pump, sp1200: BP.sp1200, hall: BP.hall, echo: BP.echo, bass: BP.bass } : null,
        emotion: emo ? LO.emotionLabel ? LO.emotionLabel(bright, intense) : null : null,
        brightness: emo ? 0.6 + bright * 0.06 + intense * 0.03 : 1,
      },
      sections, bars, parts, totalBeats: NB * 4,
    };
    // v0.7.2: the scene's character sheet (Jelly Brain): the emotion toolkits and harmony devices, applied to the notes
    // v0.7.3: the excitement pass first (motion, harmonic rhythm, contrast, flourishes, fills), then the sheet's devices,
    // then the melody is put back on top of everything
    if (params.sheet && OR && LO.Motion) LO.Motion.apply(song, params.sheet, LO.rng(((seed ^ 0x3071) ^ (params._fix && params._fix.reroll ? 0x5 : 0)) >>> 0));
    if (params.sheet && OR && LO.SceneDevices) LO.SceneDevices.apply(song, params.sheet, LO.rng(((seed ^ 0x5CE7E) ^ (params._fix && params._fix.reroll ? 0x3 : 0)) >>> 0));
    if (params.sheet && OR && LO.Motion) LO.Motion.onTop(song);
    return song;
  };
})(typeof self !== 'undefined' ? self : globalThis);
