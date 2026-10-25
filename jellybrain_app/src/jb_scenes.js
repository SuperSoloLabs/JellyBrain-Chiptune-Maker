/* JELLY BRAIN - the 32 scenes. Each one quietly sets the style, tempo, instruments and form; the dials
   (MOOD, ENERGY, EPIC, LENGTH: 1-6 boxes) start where the scene sounds best, and the brain varies everything
   on every MAKE. Rooms are real SNES echo (hardware-true: at most 240 ms, halls are long feedback trails). */
(function (G) {
  const LO = G.LO = G.LO || {};
  // id, name, one line (21 characters max), blueprint, tempo, instruments {lead, counter, pad}, dials [mood, energy, epic, length], room, extra
  const S = (name, desc, bp, tempo, inst, dials, room, x) => ({ name, desc, bp, tempo, inst, dials, room, ...(x || {}) });
  LO.JB_SCENES = [
    S('THEME', 'YOUR GAME IN ONE TUNE.', 'overworldJourney', 1.0, { lead: 'HORN', counter: 'HARP', pad: 'STRINGS' }, [4, 4, 5, 4], 'THRONE HALL', { catchy: true }),
    S('TITLE', 'PRESS START TO BEGIN.', 'overworldJourney', 1.0, { lead: 'BRASS', counter: 'HARP', pad: 'STRINGS' }, [4, 4, 6, 3], 'THRONE HALL'),
    S('INTRO', 'A STORY IS STARTING.', 'nightField', 0.95, { lead: 'FLUTE', counter: 'HARP', pad: 'STRINGS' }, [3, 2, 3, 3], 'CATHEDRAL'),
    S('MENU', 'PICK YOUR STUFF.', 'townMorning', 0.9, { lead: 'VIBES', counter: 'HARP', pad: 'STRINGS' }, [4, 2, 1, 2], 'SMALL CHAMBER'),
    S('WORLD MAP', 'THE WHOLE WIDE WORLD.', 'overworldJourney', 1.0, { lead: 'HORN', counter: 'HARP', pad: 'STRINGS' }, [5, 4, 4, 4], 'THRONE HALL'),
    S('FOREST', 'TALL TREES, SOFT LIGHT.', 'nightField', 1.05, { lead: 'FLUTE', counter: 'HARP', pad: 'STRINGS' }, [4, 3, 2, 4], 'FOREST'),
    S('CAVE', 'DRIP. DRIP. ECHO.', 'ancientCastle', 0.9, { lead: 'FLUTE', counter: 'MARIMBA', pad: 'CHOIR' }, [2, 2, 2, 4], 'STONE CAVE'),
    S('DUNGEON', 'DARK HALLS. KEEP GOING.', 'ancientCastle', 1.0, { lead: 'ORGAN', counter: 'HARP', pad: 'CHOIR' }, [1, 3, 3, 4], 'STONE CAVE'),
    S('SNOW', 'COLD AIR, WARM HEART.', 'nightField', 0.95, { lead: 'BELLS', counter: 'HARP', pad: 'STRINGS' }, [4, 2, 2, 4], 'CATHEDRAL'),
    S('DESERT', 'HOT SAND, FAR AWAY.', 'ancientCastle', 1.05, { lead: 'OBOE', counter: 'MARIMBA', pad: 'STRINGS' }, [3, 3, 3, 4], 'SMALL CHAMBER'),
    S('UNDERWATER', 'BUBBLES AND BLUE.', 'nightField', 0.9, { lead: 'VIBES', counter: 'HARP', pad: 'PAD' }, [4, 2, 2, 4], 'UNDERWATER'),
    S('SPACE', 'STARS ALL AROUND.', 'nightField', 1.0, { lead: 'BELLS', counter: 'HARP', pad: 'PAD' }, [3, 3, 3, 4], 'SPACE STATION'),
    S('TOWN', 'HELLO, NEIGHBOR!', 'townMorning', 1.0, { lead: 'FLUTE', counter: 'GUITAR', pad: 'STRINGS' }, [5, 3, 2, 4], 'SMALL CHAMBER'),
    S('SHOP', 'WHAT ARE YOU BUYING?', 'townMorning', 1.08, { lead: 'MARIMBA', counter: 'GUITAR', pad: 'STRINGS' }, [5, 3, 1, 3], 'SMALL CHAMBER'),
    S('CASTLE', 'BANNERS AND KINGS.', 'ancientCastle', 1.0, { lead: 'HORN', counter: 'HARP', pad: 'STRINGS' }, [3, 3, 5, 4], 'THRONE HALL'),
    S('TAVERN', 'MUGS UP! TELL A TALE.', 'airship', 0.9, { lead: 'SAX', counter: 'GUITAR', pad: 'ORGAN' }, [5, 4, 2, 4], 'SMALL CHAMBER'),
    S('TEMPLE', 'OLD STONES, OLD MAGIC.', 'ancientCastle', 0.9, { lead: 'ORGAN', counter: 'HARP', pad: 'CHOIR' }, [3, 2, 4, 4], 'CATHEDRAL'),
    S('BATTLE', 'FIGHT! FIGHT! FIGHT!', 'finalBattle', 0.92, { lead: 'BRASS', counter: 'STRINGS', pad: 'STRINGS' }, [2, 5, 4, 3], 'SMALL CHAMBER'),
    S('BOSS FIGHT', 'BIG. FAST. DANGEROUS.', 'finalBattle', 0.97, { lead: 'BRASS', counter: 'STRINGS', pad: 'CHOIR' }, [2, 5, 5, 3], 'THRONE HALL'),
    S('FINAL BOSS', 'THIS IS THE END.', 'finalBattle', 1.0, { lead: 'BRASS', counter: 'STRINGS', pad: 'CHOIR' }, [1, 6, 6, 4], 'CATHEDRAL'),
    S('CHASE', 'RUN! DON\'T LOOK BACK!', 'mode7Racer', 1.0, { lead: 'BRASS', counter: 'STRINGS', pad: 'STRINGS' }, [2, 6, 3, 3], 'SMALL CHAMBER'),
    S('STEALTH', 'SHH. TIPTOE.', 'ancientCastle', 0.85, { lead: 'OBOE', counter: 'PIZZ', pad: 'STRINGS' }, [2, 2, 1, 3], 'SMALL CHAMBER'),
    S('RACING', 'FULL SPEED AHEAD!', 'mode7Racer', 1.05, { lead: 'GUITAR', counter: 'BRASS', pad: 'STRINGS' }, [5, 6, 3, 3], 'SMALL CHAMBER'),
    S('SPOOKY', 'SOMETHING IS THERE...', 'ancientCastle', 0.85, { lead: 'ORGAN', counter: 'BELLS', pad: 'CHOIR' }, [1, 2, 3, 4], 'CATHEDRAL'),
    S('SAD', 'IT IS OKAY TO CRY.', 'sorrowfulTheme', 1.0, { lead: 'STRINGS', counter: 'HARP', pad: 'CHOIR' }, [1, 1, 3, 4], 'CATHEDRAL'),
    S('PEACEFUL', 'REST HERE A WHILE.', 'nightField', 0.92, { lead: 'FLUTE', counter: 'HARP', pad: 'STRINGS' }, [5, 1, 2, 4], 'FOREST'),
    S('MYSTERY', 'WHAT IS BEHIND IT?', 'nightField', 0.95, { lead: 'VIBES', counter: 'HARP', pad: 'PAD' }, [2, 2, 2, 4], 'STONE CAVE'),
    S('ROMANCE', 'TWO HEARTS, ONE SONG.', 'sorrowfulTheme', 1.05, { lead: 'SAX', counter: 'HARP', pad: 'STRINGS' }, [5, 2, 3, 4], 'CATHEDRAL'),
    S('VICTORY', 'YOU DID IT!', 'overworldJourney', 1.1, { lead: 'BRASS', counter: 'HARP', pad: 'STRINGS' }, [6, 5, 5, 1], 'THRONE HALL', { jingle: 'jingle-win' }),
    S('GAME OVER', 'TRY AGAIN?', 'sorrowfulTheme', 0.9, { lead: 'STRINGS', counter: 'HARP', pad: 'CHOIR' }, [1, 1, 2, 1], 'CATHEDRAL', { jingle: 'jingle-lose' }),
    S('CREDITS', 'THANKS FOR PLAYING!', 'overworldJourney', 0.95, { lead: 'HORN', counter: 'HARP', pad: 'STRINGS' }, [5, 3, 5, 6], 'THRONE HALL'),
    S('EPILOGUE', 'AND THEN, ONE DAY...', 'sorrowfulTheme', 1.0, { lead: 'STRINGS', counter: 'HARP', pad: 'STRINGS' }, [4, 2, 3, 5], 'CATHEDRAL'),
  ];

  // v0.7.2 THE CHARACTER SHEETS: what each scene MEANS, as numbers the composer must stay inside. The dials move the song
  // only within these windows (a dungeon stays slow and dark at any setting). bpm: tempo window (ENERGY moves it);
  // V: valence window (MOOD); A: arousal window (ENERGY); E: epic window (EPIC); modes: darkest to brightest (MOOD picks);
  // tools: the emotion toolkits (PAUSE, SOFT, HURRY, CAREFUL); dev: harmony devices; voices: the voice budget;
  // kit: the sampled drum kit; tricks: hardware tricks; rumble: the noise clock for CAREFUL's low bed.
  const H = (bpm, V, A, E, modes, x) => ({ bpm, V, A, E, modes, ...(x || {}) });
  LO.JB_SHEETS = {
    // v0.7.3: research pass. Modes run dark to bright on the MEASURED ladder (Temperley & Tan 2012): phrygian < minor <
    // dorian < lydian ~ mixolydian < major (lydian is wonder, not joy). register: melody high/low (Eerola 2013);
    // npsMax: melody notes per second cap; fear: terror (loud, dense, rough) or anxiety (soft, sparse, unpredictable);
    // meter: '3/4' | 'shuffle' or { '3/4': chance }; noBright: no cymbals/claps (sad, tender); leadFocus: dB the rest steps back
    'THEME':      H([104, 140], [6, 9], [5, 7], [6, 10], ['dorian', 'mixolydian', 'major'], { kit: 'STUDIO KIT', leadFocus: 1.5, nakedMin: 62, npsMin: 2.9, flourish: 0.35, tricks: { swapB: true } }),
    'TITLE':      H([ 96, 128], [6, 9], [5, 7], [7, 10], ['lydian', 'mixolydian', 'major'], { kit: 'STUDIO KIT', register: 'high', leadFocus: 1.5, npsMin: 2.8, flourish: 0.5, tricks: { pmLead: 'vib', cents: 18 } }),
    'INTRO':      H([ 70,  92], [4, 7], [2, 4], [3, 6], ['dorian', 'lydian', 'mixolydian', 'major'], { tools: ['SOFT'], dev: ['pedal', 'layerin'], kit: 'STUDIO KIT' }),
    'MENU':       H([ 84, 104], [6, 8], [2, 4], [0, 2], ['lydian', 'mixolydian', 'major'], { tools: ['SOFT'], kit: 'BRIGHT KIT', detune: false }),
    'WORLD MAP':  H([108, 136], [6, 9], [5, 7], [5, 9], ['lydian', 'mixolydian', 'major'], { kit: 'STUDIO KIT', meter: { shuffle: 0.3 }, npsMin: 2.8, flourish: 0.6, tricks: { waveSwitch: true } }),
    'FOREST':     H([ 84, 108], [5, 8], [3, 5], [2, 5], ['dorian', 'lydian', 'mixolydian', 'major'], { tools: ['SOFT'], kit: 'STUDIO KIT' }),
    'CAVE':       H([ 60,  80], [2, 4], [1, 3], [2, 4], ['phrygian', 'minor', 'dorian', 'lydian'], { tools: ['CAREFUL', 'PAUSE'], dev: ['pedal', 'sus'], voices: 5, kit: 'DEEP KIT', rumble: 6, fear: 'anxiety', npsMax: 2.4 }),
    'DUNGEON':    H([ 62,  84], [0.5, 3], [2, 4.5], [2, 5], ['phrygian', 'minor'], { tools: ['CAREFUL', 'PAUSE'], dev: ['bII', 'tritone', 'pedal'], voices: 6, kit: 'DEEP KIT', rumble: 4, register: 'low', fear: 'anxiety' }),
    'SNOW':       H([ 72,  96], [4, 7], [2, 4], [2, 5], ['dorian', 'lydian', 'major'], { tools: ['SOFT'], dev: ['sus', 'pedal'], voices: 5, kit: 'STUDIO KIT', register: 'high', tricks: { wide: true } }),
    'DESERT':     H([ 88, 112], [3, 6], [3, 6], [3, 6], ['phrygian', 'phrygian dominant', 'phrygian dominant', 'dorian'], { dev: ['bII', 'pedal'], kit: 'DEEP KIT' }),
    'UNDERWATER': H([ 60,  84], [4, 7], [1, 3], [1, 4], ['dorian', 'lydian', 'mixolydian'], { tools: ['SOFT'], dev: ['sus', 'pedal'], kit: 'STUDIO KIT', npsMax: 3, tricks: { pmLead: 'vib', cents: 30, lfoHz: 4.2 } }),
    'SPACE':      H([ 70,  96], [3, 6], [1, 4], [3, 7], ['minor', 'dorian', 'lydian'], { tools: ['SOFT'], dev: ['sus', 'pedal'], kit: 'STUDIO KIT', npsMax: 3, tricks: { pmLead: 'fm', ratio: 1.41, depth: 0.7, wide: true } }),
    'TOWN':       H([100, 124], [6, 9], [2, 5], [1, 4], ['lydian', 'mixolydian', 'major'], { dev: ['drift'], kit: 'BRIGHT KIT', register: 'high', meter: { '3/4': 0.35 } }),
    'SHOP':       H([104, 128], [6, 9], [3, 6], [0, 3], ['mixolydian', 'major'], { dev: ['drift'], kit: 'BRIGHT KIT', register: 'high' }),
    'CASTLE':     H([ 84, 112], [3, 7], [4, 6], [6, 9], ['minor', 'harmonic minor', 'dorian', 'mixolydian', 'major'], { dev: ['pedal'], kit: 'STUDIO KIT', tricks: { waveSwitch: true } }),
    'TAVERN':     H([ 96, 124], [6, 9], [5, 7], [1, 4], ['dorian', 'mixolydian', 'major'], { dev: ['drift'], kit: 'BRIGHT KIT', meter: 'shuffle' }),
    'TEMPLE':     H([ 64,  84], [3, 6], [1, 3], [4, 8], ['minor', 'dorian', 'lydian'], { tools: ['SOFT', 'CAREFUL'], dev: ['sus'], voices: 6, kit: 'DEEP KIT', rumble: 8, noStretch: true, npsMax: 2.4 }),
    'BATTLE':     H([140, 168], [2, 5], [7, 9], [5, 8], ['phrygian', 'minor', 'dorian'], { npsMax: 4.5, tools: ['HURRY'], dev: ['tritone'], kit: 'ROCK KIT', steadyTempo: true, modeBias: 'minor', tricks: { pmLead: 'fm', ratio: 1, depth: 0.8, decay: 27 } }),
    'BOSS FIGHT': H([120, 176], [1, 4], [8, 10], [7, 10], ['phrygian', 'minor'], { npsMax: 4.5, tools: ['HURRY'], dev: ['bII', 'tritone', 'impact', 'rough', 'pedal', 'halftime'], kit: 'PUNCH KIT', register: 'low', fear: 'terror', tricks: { fmBass: { ratio: 1, depth: 0.9 } } }),
    'FINAL BOSS': H([130, 170], [0.5, 3], [8, 10], [9, 10], ['phrygian', 'harmonic minor', 'minor'], { npsMax: 4.5, tools: ['HURRY', 'PAUSE'], dev: ['bII', 'tritone', 'impact', 'rough', 'pedal'], kit: 'PUNCH KIT', fear: 'terror' }),
    'CHASE':      H([150, 180], [2, 5], [8, 10], [3, 6], ['phrygian', 'minor', 'dorian'], { npsMax: 4.5, tools: ['HURRY'], dev: ['pedal'], kit: 'PUNCH KIT' }),
    'STEALTH':    H([ 76, 100], [2, 4], [2, 4], [0, 2], ['phrygian', 'minor', 'dorian'], { tools: ['CAREFUL'], dev: ['tritone'], voices: 4, kit: 'DEEP KIT', rumble: 7, fear: 'anxiety', npsMax: 2 }),
    'RACING':     H([150, 180], [6, 9], [8, 10], [3, 6], ['dorian', 'mixolydian', 'major'], { npsMax: 4.5, tools: ['HURRY'], kit: 'ROCK KIT', steadyTempo: true, tricks: { fmBass: { ratio: 1, depth: 0.8 } } }),
    'SPOOKY':     H([ 60,  90], [0.5, 2.5], [1, 4], [3, 6], ['phrygian', 'minor'], { tools: ['CAREFUL', 'PAUSE'], dev: ['rough'], voices: 5, kit: 'DEEP KIT', rumble: 3, register: 'low', fear: 'anxiety', tricks: { pmLead: 'vib', cents: 40, lfoHz: 3.1, echoDrone: true } }),
    'SAD':        H([ 56,  72], [1, 3], [0.5, 2], [2, 5], ['minor', 'minor', 'dorian'], { tools: ['SOFT', 'PAUSE'], dev: ['pedal', 'appog', 'stepwise', 'ritard'], kit: 'STUDIO KIT', pauseBars: 2, npsMax: 2.2, noBright: true }),
    'PEACEFUL':   H([ 60,  80], [6, 8.5], [0.5, 2.5], [1, 4], ['lydian', 'mixolydian', 'major'], { tools: ['SOFT'], dev: ['pedal', 'sus'], kit: 'STUDIO KIT', register: 'high', npsMax: 2.2, noBright: true, quiet: 0.7 }),
    'MYSTERY':    H([ 72,  92], [2.5, 5], [2, 4], [2, 5], ['minor', 'dorian', 'lydian'], { tools: ['CAREFUL'], dev: ['sus', 'tritone'], voices: 5, kit: 'DEEP KIT', rumble: 9, fear: 'anxiety' }),
    'ROMANCE':    H([ 60,  80], [5, 8], [1, 3], [3, 6], ['dorian', 'lydian', 'major', 'major'], { tools: ['SOFT'], dev: ['sus', 'appog', 'ritard'], kit: 'STUDIO KIT', npsMax: 2.4, noBright: true }),
    'VICTORY':    H([130, 160], [8, 10], [6, 8], [7, 10], ['mixolydian', 'major', 'major'], { kit: 'BRIGHT KIT', register: 'high', meter: 'shuffle', dev: ['fanfare'] }),
    'GAME OVER':  H([ 56,  72], [0.5, 2], [0.5, 2], [2, 4], ['phrygian', 'minor'], { tools: ['SOFT'], dev: ['pedal', 'falling', 'ritard', 'stepwise'], kit: 'STUDIO KIT', noBright: true }),
    'CREDITS':    H([ 88, 112], [6, 9], [3, 6], [5, 9], ['lydian', 'mixolydian', 'major'], { tools: ['SOFT'], dev: ['swell'], kit: 'STUDIO KIT', detune: false, tricks: { swapB: true, waveSwitch: true } }),
    'EPILOGUE':   H([ 66,  86], [5, 7.5], [1, 3], [3, 7], ['dorian', 'lydian', 'mixolydian', 'major'], { tools: ['SOFT', 'PAUSE'], dev: ['picardy', 'appog', 'swell', 'ritard'], kit: 'STUDIO KIT', noBright: true }),
  };
  // the scene check: did the song come out the way its sheet says? (the worker retakes when it did not)
  LO.sceneCheck = function (song, R, out, sceneName) {
    const SH = LO.JB_SHEETS[sceneName]; if (!SH) return { ok: true, fails: [] };
    const m = song.meta, f = [], bpm = m.displayBpm || m.bpm;
    if (bpm < SH.bpm[0] - 2 || bpm > SH.bpm[1] + 2) f.push(`TEMPO ${bpm} OUTSIDE ${SH.bpm[0]}-${SH.bpm[1]}`);
    if (!SH.modes.includes(m.mode)) f.push(`MODE ${m.mode.toUpperCase()} NOT IN THE SHEET`);
    const log = (m.sheetLog || []).join(' ');
    for (const t of SH.tools || []) if (!(t === 'PAUSE' && song.sections.length < 3) && !log.includes(t + ':')) f.push(`${t} TOOLKIT MISSING`);
    if (SH.voices && R && R.events) { const act = R.events.filter((e, i) => e.length && !(R.voiceRoles && R.voiceRoles[i] === 'mod')).length; if (act > SH.voices) f.push(`${act} VOICES (BUDGET ${SH.voices})`); }
    if (out) { let pk = 0, e = 0; for (let i = 0; i < out.L.length; i += 3) { const a = Math.abs(out.L[i]); if (a > pk) pk = a; e += out.L[i] * out.L[i]; } if (!(pk > 0.05) || !isFinite(e)) f.push('SILENT OR BROKEN OUTPUT'); }
    const sc = out && out.mind && out.mind.review ? out.mind.review.score : null; if (sc != null && sc < 80) f.push(`LISTENER SCORE ${sc}`);
    // composition first: the tune must hold up naked (a CAREFUL scene is allowed to wander more)
    const nk = LO.Listener && LO.Listener.naked && !String(m.form || '').startsWith('jingle') ? LO.Listener.naked(song) : null; /* a 10-second jingle is a fanfare, not a tune to judge naked */ const need = SH.nakedMin || ((SH.tools || []).includes('CAREFUL') ? 40 : 55);
    if (nk && nk.score < need) f.push(`NAKED MELODY ${nk.score} (${nk.why})`);
    if (nk) song.meta.naked = nk;
    return { ok: !f.length, fails: f, score: sc };
  };
  // v0.7.3 GENERATE AND SELECT: compose many drafts (no sound yet, ~45 ms each), score each against the benchmark for this
  // scene's energy x mood (real game music, listener-rated), and rank them. The worker renders the best draft first.
  LO.benchGroup = name => { const SH = LO.JB_SHEETS[name]; if (!SH) return 'ALL'; return ((SH.A[0] + SH.A[1]) / 2 >= 5 ? 'HI' : 'LO') + '_' + ((SH.V[0] + SH.V[1]) / 2 >= 5 ? 'POS' : 'NEG'); };
  LO.benchSong = (song, name) => { if (!LO.Bench || !LO.BENCH_TARGETS) return null; const sn = LO.Bench.songNotes(song), M = LO.Bench.metrics(sn.notes, sn.beats, sn.bpb, 96); if (!M) return null;
    if (String(song.meta.form || '').startsWith('jingle')) { delete M.motifRep; delete M.contrast; delete M.novelty; }   // a 10-second fanfare has no sections to contrast or motifs to bring back
    return LO.Bench.score(M, LO.BENCH_TARGETS[LO.benchGroup(name)]); };
  LO.benchRank = function (sceneIdx, dials, room, seed, n) {
    const name = LO.JB_SCENES[sceneIdx].name, out = [];
    for (let k = 0; k < (n || 16); k++) { const sd = (seed + k * 7919) >>> 0; try { const song = LO.compose(LO.jbParams(sceneIdx, dials, room, sd)); const b = LO.benchSong(song, name); const nk = LO.Listener && LO.Listener.naked && !String(song.meta.form || '').startsWith('jingle') ? LO.Listener.naked(song).score : 70;
      out.push({ seed: sd, bench: b ? b.total : 0, naked: nk, score: (b ? b.total : 0) + nk / 40 }); } catch (e) { } }
    return out.sort((a, b) => b.score - a.score);
  };
  // a dial (1-6 boxes) as a point inside a window
  const inW = (w, d) => w[0] + (w[1] - w[0]) * (d - 1) / 5;
  // rooms: S-DSP echo delay (16 ms steps, 15 = 240 ms max), feedback, echo level, FIR filter
  LO.JB_ROOMS = [
    { name: 'THRONE HALL', edl: 15, efb: 62, evol: 42, fir: 'NINTENDO LPF' },
    { name: 'CATHEDRAL', edl: 15, efb: 76, evol: 46, fir: 'SOFT' },
    { name: 'STONE CAVE', edl: 9, efb: 75, evol: 40, fir: 'CAVE LPF' },   // v0.7.2: walls swallow the highs, tails ring 3-4 s
    { name: 'SMALL CHAMBER', edl: 4, efb: 25, evol: 24, fir: 'FLAT' },
    { name: 'FOREST', edl: 7, efb: 22, evol: 24, fir: 'SOFT' },
    { name: 'UNDERWATER', edl: 3, efb: 30, evol: 70, fir: 'UNDERWATER', dry: 0.45 },   // the FIR as an EQ: the whole mix goes muffled, the classic underwater trick
    { name: 'SPACE STATION', edl: 14, efb: -55, evol: 40, fir: 'THIN' },
  ];
  // the dials (1-6 boxes) into the engine: the scene's style stays, the dials move it
  LO.jbParams = function (sceneIdx, dials, roomName, seed) {
    const sc = LO.JB_SCENES[sceneIdx], [mood, energy, epic, length] = dials;
    const base = LO.blueprintById(sc.bp);
    const bp = { ...base, id: base.id, snes: { ...base.snes, ...sc.inst }, bpm: base.bpm.map(b => Math.round(b * sc.tempo)), epic: (epic - 1) * 2 };
    let form = length <= 2 ? 'short-loop' : length <= 4 ? 'loop' : 'song';
    if (sc.jingle && length <= 2) form = sc.jingle;
    bp.form = form;
    const room = LO.JB_ROOMS.find(r => r.name === roomName) || LO.JB_ROOMS[0];
    // v0.7.2: the sheet's windows (the dials move only inside them); the old free mapping only for a scene without a sheet
    const SH = LO.JB_SHEETS[sc.name], RJ = LO.rng(((seed >>> 0) ^ 0x7A11) >>> 0);
    let valence = 0.5 + (mood - 1) * 1.8, arousal = 0.5 + (energy - 1) * 1.8, ep = (epic - 1) * 2, bpmFix = null, modePref = null, sheet = null;
    if (SH) {
      valence = inW(SH.V, mood); arousal = inW(SH.A, energy); ep = inW(SH.E, epic);
      bpmFix = Math.max(SH.bpm[0], Math.min(SH.bpm[1], Math.round(inW(SH.bpm, energy) * (1 + RJ.range(-0.03, 0.03)))));
      const n = SH.modes.length, mi = Math.max(0, Math.min(n - 1, Math.round((mood - 1) / 5 * (n - 1)) + (RJ.chance(0.25) ? RJ.pick([-1, 1]) : 0)));
      modePref = [SH.modes[mi]]; bp.modes = [...new Set(SH.modes)]; bp.epic = ep; bp.bpm = SH.bpm.slice();
      if (SH.modeBias && RJ.chance(0.5)) modePref = [SH.modeBias];
      // the meter: fixed, or a chance of one (a 3/4 town, a shuffled jig)
      if (typeof SH.meter === 'string') bp.meter = SH.meter; else if (SH.meter) { for (const [k, pr] of Object.entries(SH.meter)) if (RJ.chance(pr)) bp.meter = k; }
      sheet = { ...SH, scene: sc.name };
    }
    return {
      seed, chip: 'SNES', blueprint: bp, valence, arousal, epic: ep, bpmFix, modePref, sheet,
      complex: sc.catchy ? 7 : 5 + (energy >= 5 ? 1 : 0), surprise: sc.catchy ? 4 : 5,
      // the echo RAM is reserved for the longest room, so changing rooms while it plays never has to re-render
      fx: { edl: 15, edlPlay: room.edl, efb: room.efb, evol: room.evol, fir: room.fir, dry: room.dry == null ? 1 : room.dry, eonLead: true, eonPad: true, eonDrums: room.dry != null },
      lib: 3,   // v0.7.3: the 37-set remaster library is open to new songs
      exact: true, master: false,   // v0.7.2: the exact S-DSP and the console's own output (no modern compressor or limiter)
      loop: form === 'loop' || form === 'short-loop',
    };
  };
})(typeof self !== 'undefined' ? self : globalThis);
