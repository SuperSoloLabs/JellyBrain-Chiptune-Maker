/* LowOrbit Chip Studio - STYLE BLUEPRINTS: music styles turned into numbers.
   Genre layers carry the well-documented conventions of each style. Artist layers sit on top and are
   built only from documented facts (interviews, gear lists, measured tempos), each marked SOLID or
   ESTIMATED. Artist names are search words only: blueprints and songs carry style names. */
(function (G) {
  const LO = G.LO;
  const S = 'SOLID', E = 'ESTIMATED';

  const B = [
    { id: 'downtempo', name: 'DOWNTEMPO', layer: 'GENRE', aliases: ['chill', 'chillout lounge', 'lounge', 'groove salad', 'cinematic downtempo'],
      desc: 'SLOW, WARM AND JAZZY. LUSH 9TH CHORDS, RHODES, SWUNG DRUMS, DUSTY TEXTURE.',
      bpm: [84, 100], modes: ['dorian', 'minor', 'mixolydian'], leads: ['mode', 'pentatonic'], jazzy: 0.9, chordRate: 1,
      drums: 'downtempo', bass: 'funk', lead: 'sax', pad: 'rhodes', arp: null, swing: 0.05, leadDensity: 0.7, form: 'song',
      pump: 10, sweep: false, sp1200: true, banks: ['emotional', 'calm'], tricks: ['VINYL', 'TAPE STOP'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: E } },
    { id: 'triphop', name: 'TRIP-HOP', layer: 'GENRE', aliases: ['trip hop', 'bristol', 'bristol sound'],
      desc: 'DARK, HEAVY AND CINEMATIC. SLOW BREAKBEATS, DEEP SUB BASS, STRINGS, DUST.',
      bpm: [78, 96], modes: ['minor', 'dorian', 'phrygian'], leads: ['mode', 'harmonic'], jazzy: 0.5, chordRate: 2,
      drums: 'triphop', bass: 'sub', lead: 'bell', pad: 'strings', arp: null, swing: 0.04, leadDensity: 0.4, form: 'song',
      pump: 0, sweep: false, sp1200: true, banks: ['dark', 'emotional'], tricks: ['VINYL'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: E } },
    { id: 'ambient', name: 'CHILL-OUT / AMBIENT', layer: 'GENRE', aliases: ['ambient', 'chill out', 'chillout', 'space music'],
      desc: 'FLOATING AND SPACIOUS. LONG PADS, SLOW ARPEGGIOS, FEW OR NO DRUMS, BIG REVERB.',
      bpm: [70, 95], modes: ['lydian', 'major', 'dorian'], leads: ['pentatonic', 'mode'], jazzy: 0.7, chordRate: 4,
      drums: 'ambient', bass: 'sub', lead: 'bell', pad: 'saw', arp: { pattern: 'updown', rate: 2, oct: 2 }, swing: 0, leadDensity: 0.3, form: 'evolve',
      pump: 0, sweep: true, hall: 55, banks: ['calm', 'emotional'], tricks: [],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'drone', name: 'DRONE / DEEP SPACE', layer: 'GENRE', aliases: ['drone', 'drone zone', 'deep space', 'dark ambient', 'space ambient', 'meditation'],
      desc: 'ONE HUGE SUSTAINED WORLD. VERY SLOW CHANGES, LONG PADS THAT SWELL AND FADE, ALMOST NO RHYTHM.',
      bpm: [60, 72], modes: ['lydian', 'dorian', 'minor'], leads: ['pentatonic'], jazzy: 0.5, chordRate: 4,
      drums: 'ambient', bass: 'sub', lead: 'bell', pad: 'saw', arp: { pattern: 'updown', rate: 1, oct: 2 }, swing: 0, leadDensity: 0.12, form: 'evolve', length: 1.4,
      pump: 0, sweep: true, hall: 75, banks: ['calm', 'dark'], tricks: [],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'lofi', name: 'LO-FI BEATS', layer: 'GENRE', aliases: ['lofi', 'lo-fi', 'chillhop', 'study beats', 'jazzhop'],
      desc: 'DUSTY JAZZ CHORDS OVER LAZY SWUNG BEATS. SAMPLER CRUNCH AND CRACKLE.',
      bpm: [72, 88], modes: ['dorian', 'major', 'minor'], leads: ['pentatonic', 'mode'], jazzy: 1.0, chordRate: 1,
      drums: 'lofi', bass: 'walk', lead: 'bell', pad: 'rhodes', arp: null, swing: 0.065, leadDensity: 0.5, form: 'loop',
      pump: 15, sweep: false, sp1200: true, banks: ['calm', 'emotional'], tricks: ['VINYL'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'deephouse', name: 'DEEP HOUSE', layer: 'GENRE', aliases: ['deep', 'chill house', 'funky house'],
      desc: 'WARM FOUR-ON-THE-FLOOR WITH JAZZY MINOR CHORD STABS AND A ROLLING BASS.',
      bpm: [118, 124], modes: ['dorian', 'minor'], leads: ['pentatonic', 'mode'], jazzy: 0.9, chordRate: 2,
      drums: 'house', bass: 'deephouse', lead: 'bell', pad: 'rhodes', arp: null, swing: 0.03, leadDensity: 0.3, form: 'evolve',
      pump: 25, sweep: true, banks: ['calm', 'emotional'], tricks: [],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'techno', name: 'TECHNO', layer: 'GENRE', aliases: ['detroit techno', 'berlin techno', 'minimal techno', 'warehouse'],
      desc: 'HYPNOTIC AND MACHINE-LIKE. ONE CHORD FOR A LONG TIME, DRIVING KICKS, EVOLVING SOUNDS.',
      bpm: [124, 134], modes: ['minor', 'phrygian'], leads: ['mode', 'pentatonic'], jazzy: 0.2, chordRate: 4,
      drums: 'techno', bass: 'rolling', lead: 'pulse', pad: 'saw', arp: { pattern: 'random', rate: 4, oct: 1 }, swing: 0.01, leadDensity: 0.2, form: 'evolve',
      pump: 35, sweep: true, banks: ['dark', 'action'], tricks: [],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'trance', name: 'PROGRESSIVE / TRANCE', layer: 'GENRE', aliases: ['trance', 'progressive', 'progressive trance', 'uplifting trance', 'euphoric'],
      desc: 'EUPHORIC BUILDS AND DROPS. ROLLING BASS, OCTAVE ARPEGGIOS, BIG SAW ANTHEM LEADS.',
      bpm: [128, 140], modes: ['minor', 'dorian'], leads: ['mode', 'harmonic'], jazzy: 0.2, chordRate: 2,
      drums: 'trance', bass: 'rolling', lead: 'saw', pad: 'saw', arp: { pattern: 'updown', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.8, form: 'evolve',
      pump: 45, sweep: true, banks: ['emotional'], tricks: ['RISER', 'DROP'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'synthwave', name: 'SYNTHWAVE', layer: 'GENRE', aliases: ['retrowave', 'outrun', 'darksynth', 'night drive'],
      desc: '80S NIGHT DRIVE. GATED SNARES, PULSING EIGHTH BASS, BIG SAW LEADS AND ARPEGGIOS.',
      bpm: [84, 110], modes: ['minor', 'dorian'], leads: ['mode', 'pentatonic'], jazzy: 0.2, chordRate: 1,
      drums: 'synthwave', bass: 'eighths', lead: 'saw', pad: 'saw', arp: { pattern: 'up', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.8, form: 'song',
      pump: 30, sweep: false, banks: ['emotional', 'dark'], tricks: ['GATED SNARE'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'synthpop80', name: '80S SYNTH-POP', layer: 'GENRE', aliases: ['synth pop', 'synthpop', 'synth-pop', 'new wave', '80s', 'eighties', 'human league', 'depeche mode', 'omd', 'yazoo', 'soft cell'],
      desc: 'BUILT ON A DRUM MACHINE, A REPEATING SEQUENCER RIFF AND A SIMPLE MELODY YOU CAN SING. COLD, BRIGHT AND CATCHY.',
      bpm: [112, 130], modes: ['minor', 'major', 'mixolydian', 'dorian'], leads: ['mode', 'pentatonic'], jazzy: 0.15, chordRate: 1,
      drums: 'synthwave', bass: 'eighths', lead: 'pulse', pad: 'saw', arp: { pattern: 'octave', rate: 4, oct: 1 }, swing: 0, leadDensity: 0.85, form: 'song',
      pump: 10, sweep: false, riff: true, banks: ['emotional', 'bright'], tricks: ['GATED SNARE', 'SEQUENCER RIFF'],
      conf: { bpm: E, harmony: S, groove: S, sound: S, form: S },
      notes: [
        'SONGS WERE BUILT UP FROM A SIMPLE DRUM MACHINE PATTERN FIRST (SOLID, EARLY-80S PRODUCTION ACCOUNTS)',
        'GEAR: LINN LM-1 DRUMS, ROLAND AND KORG SYNTHS, A HARDWARE SEQUENCER (SOLID)',
        'ARRANGEMENTS WRITTEN NOTE BY NOTE, EACH NOTE CHOSEN FOR ITS EMOTIONAL EFFECT (SOLID)',
        'TEMPOS AROUND 110 TO 130 BPM (ESTIMATED FROM THE STYLE)',
      ] },
    { id: 'acid', name: 'ACID HOUSE', layer: 'GENRE', aliases: ['acid', 'acid techno', '303', 'tb-303'],
      desc: 'A SQUELCHING RESONANT BASSLINE THAT NEVER STOPS MOVING, OVER A HOUSE BEAT.',
      bpm: [120, 128], modes: ['minor', 'phrygian', 'dorian'], leads: ['mode'], jazzy: 0.1, chordRate: 4,
      drums: 'house', bass: 'acid', lead: 'pulse', pad: 'saw', arp: null, swing: 0.02, leadDensity: 0.1, form: 'evolve',
      pump: 20, sweep: true, banks: ['dark'], tricks: ['ACID SQUELCH'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'electro', name: 'ELECTRO', layer: 'GENRE', aliases: ['electro funk', 'robot funk', 'miami bass'],
      desc: 'ROBOTIC FUNK. SYNCOPATED DRUM MACHINE, BOUNCING SYNTH BASS, COLD MELODIES.',
      bpm: [110, 130], modes: ['minor', 'phrygian'], leads: ['mode', 'pentatonic'], jazzy: 0.2, chordRate: 2,
      drums: 'electro', bass: 'electro', lead: 'pulse', pad: 'saw', arp: { pattern: 'octave', rate: 4, oct: 1 }, swing: 0.02, leadDensity: 0.6, form: 'loop',
      pump: 15, sweep: false, banks: ['dark', 'action'], tricks: [],
      conf: { bpm: S, harmony: E, groove: S, sound: S, form: E } },
    { id: 'breakbeat', name: 'BREAKBEAT / BIG BEAT', layer: 'GENRE', aliases: ['big beat', 'breaks', 'breakbeat'],
      desc: 'CHOPPED FUNK BREAKS, CHUNKY SAMPLER CRUNCH, BRASH SYNTH RIFFS.',
      bpm: [120, 136], modes: ['mixolydian', 'minor', 'dorian'], leads: ['pentatonic', 'mode'], jazzy: 0.2, chordRate: 2,
      drums: 'breakbeat', bass: 'funk', lead: 'saw', pad: 'saw', arp: null, swing: 0.03, leadDensity: 0.6, form: 'song',
      pump: 20, sweep: true, sp1200: true, banks: ['action', 'bright'], tricks: ['RISER'],
      conf: { bpm: S, harmony: E, groove: S, sound: S, form: E } },
    { id: 'dnb', name: 'DRUM & BASS', layer: 'GENRE', aliases: ['drum and bass', 'dnb', 'jungle', 'liquid', 'liquid funk'],
      desc: 'FAST TWO-STEP BREAKS AROUND 170, DEEP ROLLING BASS, LUSH LIQUID CHORDS.',
      bpm: [168, 176], modes: ['minor', 'dorian'], leads: ['mode', 'pentatonic'], jazzy: 0.6, chordRate: 2,
      drums: 'dnb', bass: 'reese', lead: 'bell', pad: 'strings', arp: null, swing: 0, leadDensity: 0.4, form: 'evolve',
      pump: 10, sweep: true, banks: ['emotional', 'dark'], tricks: ['RISER', 'DROP'],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'idm', name: 'IDM', layer: 'GENRE', aliases: ['braindance', 'intelligent dance music', 'glitch'],
      desc: 'PLAYFUL AND CEREBRAL. SHIFTING ODD RHYTHMS, MUSIC-BOX MELODIES, STRANGE CHORDS.',
      bpm: [90, 140], modes: ['lydian', 'dorian', 'phrygian', 'minor'], leads: ['mode'], jazzy: 0.6, chordRate: 2,
      drums: 'idm', bass: 'euclid', lead: 'bell', pad: 'saw', arp: { pattern: 'random', rate: 8, oct: 2 }, swing: 0, leadDensity: 0.5, form: 'song',
      pump: 0, sweep: true, banks: ['emotional', 'dark'], tricks: [],
      conf: { bpm: E, harmony: E, groove: E, sound: S, form: E } },
    { id: 'nudisco', name: 'NU-DISCO', layer: 'GENRE', aliases: ['disco', 'cosmic disco', 'french house', 'filter house'],
      desc: 'SHINY AND FUNKY. OCTAVE BASS, OPEN HATS, WARM CHORDS, A LITTLE COSMIC SPARKLE.',
      bpm: [112, 122], modes: ['mixolydian', 'dorian', 'major'], leads: ['pentatonic', 'mode'], jazzy: 0.7, chordRate: 1,
      drums: 'house', bass: 'drive', lead: 'pulse', pad: 'rhodes', arp: null, swing: 0.02, leadDensity: 0.6, form: 'loop',
      pump: 30, sweep: true, banks: ['bright', 'calm'], tricks: [],
      conf: { bpm: S, harmony: S, groove: S, sound: S, form: E } },

    // ---- 8-bit era game styles (our own names; built from documented NES composer techniques, no melodies copied)
    { id: 'heroOverworld', name: "HERO'S OVERWORLD", layer: 'GENRE', era: 'NES', aliases: ['overworld', 'adventure', 'hero', 'quest', 'field', 'nes adventure'],
      desc: 'A BRAVE MARCHING ADVENTURE THEME. BRIGHT MAJOR KEYS, A BOUNCING BASS AND A MELODY YOU HUM ALL DAY.',
      bpm: [128, 150], modes: ['major', 'mixolydian'], leads: ['mode', 'pentatonic'], jazzy: 0.1, chordRate: 1,
      drums: 'march', bass: 'drive', lead: 'pulse', pad: 'none', arp: null, swing: 0, leadDensity: 0.9, form: 'loop', pump: 0, sweep: false,
      banks: ['bright', 'action'], tricks: ['DUTY SWITCH', 'TRIANGLE BASS'], conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'gothicCastle', name: 'GOTHIC CASTLE', layer: 'GENRE', era: 'NES', aliases: ['castle', 'gothic', 'vampire', 'dracula', 'horror castle'],
      desc: 'DRIVING AND DRAMATIC. HARMONIC MINOR RUNS, A RELENTLESS OCTAVE BASS, FAST HATS AND FIERCE PULSE LEADS.',
      bpm: [146, 172], modes: ['minor', 'phrygian'], leads: ['harmonic', 'mode'], jazzy: 0.1, chordRate: 1,
      drums: 'rock', bass: 'octave', lead: 'saw', pad: 'none', arp: { pattern: 'up', rate: 8, oct: 1 }, swing: 0, leadDensity: 0.95, form: 'loop', pump: 0, sweep: false,
      banks: ['dark', 'action'], tricks: ['ECHO TRICK', 'FAST ARPEGGIO'], conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'robotRock', name: 'ROBOT ROCK', layer: 'GENRE', era: 'NES', aliases: ['robot', 'mega', 'action rock', 'run and gun', 'stage'],
      desc: 'FAST, PUNCHY ROCK FROM A TINY CHIP. POWER-CHORD ARPEGGIOS, A DRIVING BASS AND A HEROIC PULSE LEAD.',
      bpm: [150, 176], modes: ['minor', 'mixolydian', 'dorian'], leads: ['pentatonic', 'mode'], jazzy: 0.05, chordRate: 1,
      drums: 'rock', bass: 'eighths', lead: 'saw', pad: 'none', arp: { pattern: 'octave', rate: 8, oct: 1 }, swing: 0, leadDensity: 0.95, form: 'loop', pump: 0, sweep: false,
      banks: ['action'], tricks: ['TRIANGLE KICK'], conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'skyKingdom', name: 'SKY KINGDOM', layer: 'GENRE', era: 'NES', aliases: ['sky', 'clouds', 'flying', 'floating castle', 'heaven'],
      desc: 'FLOATING ABOVE THE CLOUDS. LYDIAN BRIGHTNESS, SPARKLING ARPEGGIOS AND A LAZY SKIPPING GROOVE.',
      bpm: [96, 118], modes: ['lydian', 'major'], leads: ['mode'], jazzy: 0.35, chordRate: 1,
      drums: 'chip', bass: 'walk', lead: 'bell', pad: 'none', arp: { pattern: 'updown', rate: 8, oct: 2 }, swing: 0.05, leadDensity: 0.75, form: 'loop', pump: 0, sweep: false,
      banks: ['bright', 'calm'], tricks: ['ECHO TRICK'], conf: { bpm: S, harmony: S, groove: E, sound: S, form: S } },
    { id: 'puzzleBounce', name: 'PUZZLE BOUNCE', layer: 'GENRE', era: 'NES', aliases: ['puzzle', 'blocks', 'bouncy', 'cute', 'quirky'],
      desc: 'PLAYFUL AND BOUNCY. A SKIPPING SHUFFLE, STACCATO NOTES AND A FUNNY LITTLE BASS LINE.',
      bpm: [124, 146], modes: ['major', 'mixolydian'], leads: ['pentatonic', 'mode'], jazzy: 0.3, chordRate: 1, meter: 'shuffle',
      drums: 'chip', bass: 'funk', lead: 'pulse', pad: 'none', arp: null, swing: 0, leadDensity: 0.85, form: 'loop', pump: 0, sweep: false,
      banks: ['bright'], tricks: ['STACCATO'], conf: { bpm: E, harmony: S, groove: S, sound: S, form: S } },
    { id: 'townWaltz', name: 'TOWN WALTZ', layer: 'GENRE', era: 'NES', aliases: ['waltz', 'town', 'village', 'inn', 'peaceful town', '3/4'],
      desc: 'A GENTLE WALTZ FOR A SAFE PLACE. OOM-PAH-PAH BASS IN 3/4, WARM CHORDS AND A SINGING MELODY.',
      bpm: [96, 132], modes: ['major', 'dorian', 'mixolydian'], leads: ['mode'], jazzy: 0.35, chordRate: 1, meter: '3/4',
      drums: 'chip', bass: 'walk', lead: 'bell', pad: 'none', arp: null, swing: 0, leadDensity: 0.8, form: 'loop', pump: 0, sweep: false,
      banks: ['calm', 'emotional'], tricks: ['3/4 TIME'], conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'spaceShooter', name: 'SPACE SHOOTER', layer: 'GENRE', era: 'NES', aliases: ['shmup', 'shooter', 'space battle', 'starfighter', 'galaxy'],
      desc: 'FULL THROTTLE THROUGH AN ASTEROID FIELD. FAST BROKEN BEATS, MACHINE BASS AND DIZZY ARPEGGIOS.',
      bpm: [150, 178], modes: ['minor', 'dorian', 'phrygian'], leads: ['mode', 'harmonic'], jazzy: 0.1, chordRate: 2,
      drums: 'cyber', bass: 'euclid', lead: 'saw', pad: 'none', arp: { pattern: 'random', rate: 8, oct: 2 }, swing: 0, leadDensity: 0.85, form: 'loop', pump: 0, sweep: false,
      banks: ['action', 'dark'], tricks: ['FAST ARPEGGIO'], conf: { bpm: S, harmony: E, groove: S, sound: S, form: S } },
    { id: 'enchantedSpring', name: 'ENCHANTED SPRING', layer: 'GENRE', era: 'NES', aliases: ['fairy', 'spring', 'fountain', 'magic', 'enchanted', 'healing'],
      desc: 'A MAGICAL HEALING PLACE. HIGH THIN ARPEGGIOS WITH THE ECHO TRICK, LYDIAN SHIMMER, NO DRUMS NEEDED.',
      bpm: [72, 92], modes: ['lydian', 'major'], leads: ['mode', 'pentatonic'], jazzy: 0.55, chordRate: 2,
      drums: 'ambient', bass: 'hold', lead: 'bell', pad: 'none', arp: { pattern: 'updown', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.4, form: 'loop', pump: 0, sweep: false,
      banks: ['calm', 'emotional'], tricks: ['ECHO TRICK', 'HIGH ARPEGGIO'], conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },

    // ---- 16-bit era RPG styles (v0.6; our own names, built from documented SNES-era techniques, no melodies copied).
    // snes: the instruments the SNES chip loads for lead, counter and pad (other chips use lead/pad as usual)
    { id: 'overworldJourney', epic: 6, name: 'OVERWORLD JOURNEY', layer: 'GENRE', era: 'SNES', aliases: ['rpg overworld', 'world map', 'journey', 'jrpg', 'snes rpg', 'epic adventure', '16-bit adventure'],
      desc: 'THE WIDE WORLD MAP. A PROUD BRASS MELODY, HARP RUNS UNDERNEATH AND A WARM STRING SECTION.',
      bpm: [100, 124], modes: ['major', 'mixolydian', 'lydian'], leads: ['mode', 'pentatonic'], jazzy: 0.25, chordRate: 1,
      drums: 'orch', bass: 'drive', lead: 'brass', pad: 'strings', arp: null, swing: 0, leadDensity: 0.85, form: 'loop', pump: 0, sweep: false,
      banks: ['bright', 'emotional'], tricks: ['REAL ECHO', 'HARP COUNTER'], snes: { lead: 'BRASS', counter: 'HARP', pad: 'STRINGS' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'townMorning', epic: 3, name: 'TOWN MORNING', layer: 'GENRE', era: 'SNES', aliases: ['rpg town', 'village morning', 'market', 'peaceful village', 'home town'],
      desc: 'A SUNNY VILLAGE WAKING UP. A SKIPPING FLUTE, A PLUCKED GUITAR AND A LAZY WALKING BASS.',
      bpm: [92, 116], modes: ['major', 'mixolydian'], leads: ['pentatonic', 'mode'], jazzy: 0.35, chordRate: 1,
      drums: 'chip', bass: 'walk', lead: 'sax', pad: 'strings', arp: null, swing: 0.04, leadDensity: 0.75, form: 'loop', pump: 0, sweep: false,
      banks: ['calm', 'bright'], tricks: ['GUITAR COUNTER'], snes: { lead: 'FLUTE', counter: 'GUITAR', pad: 'STRINGS' }, conf: { bpm: S, harmony: S, groove: E, sound: S, form: S } },
    { id: 'sorrowfulTheme', epic: 3, name: 'SORROWFUL THEME', layer: 'GENRE', era: 'SNES', aliases: ['sad', 'sorrow', 'tragic', 'farewell', 'requiem', 'emotional rpg', 'tears'],
      desc: 'A FAREWELL SCENE. A SLOW SINGING STRING LINE OVER HARP ARPEGGIOS AND A SOFT CHOIR.',
      bpm: [64, 80], modes: ['minor', 'dorian'], leads: ['mode', 'harmonic'], jazzy: 0.3, chordRate: 1,
      drums: 'ambient', bass: 'hold', lead: 'sax', pad: 'strings', arp: { pattern: 'up', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.6, form: 'song', pump: 0, sweep: false,
      banks: ['emotional', 'calm'], tricks: ['HARP ARPEGGIO', 'CHOIR PAD'], snes: { lead: 'STRINGS', counter: 'HARP', pad: 'CHOIR' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: E } },
    { id: 'finalBattle', epic: 8, name: 'FINAL BATTLE', layer: 'GENRE', era: 'SNES', aliases: ['final boss', 'last battle', 'epic boss', 'showdown', 'rpg boss'],
      desc: 'THE LAST FIGHT. HARMONIC MINOR BRASS, DRIVING OCTAVE BASS, STRING RUNS AND A HUGE CHOIR.',
      bpm: [150, 176], modes: ['minor', 'phrygian'], leads: ['harmonic', 'mode'], jazzy: 0.1, chordRate: 1,
      drums: 'rock', bass: 'octave', lead: 'brass', pad: 'saw', arp: { pattern: 'octave', rate: 8, oct: 1 }, swing: 0, leadDensity: 0.95, form: 'loop', pump: 0, sweep: false,
      banks: ['action', 'dark'], tricks: ['CHOIR PAD', 'STRING RUNS'], snes: { lead: 'BRASS', counter: 'STRINGS', pad: 'CHOIR' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'ancientCastle', epic: 6, name: 'ANCIENT CASTLE', layer: 'GENRE', era: 'SNES', aliases: ['castle', 'throne room', 'ruins', 'cathedral', 'ancient', 'temple'],
      desc: 'COLD STONE HALLS. A CHURCH ORGAN MELODY, A DISTANT CHOIR AND SLOW HEAVY STEPS.',
      bpm: [84, 104], modes: ['minor', 'phrygian'], leads: ['harmonic', 'mode'], jazzy: 0.15, chordRate: 1,
      drums: 'dungeon', bass: 'orch', lead: 'saw', pad: 'strings', arp: null, swing: 0, leadDensity: 0.7, form: 'loop', pump: 0, sweep: false,
      banks: ['dark', 'emotional'], tricks: ['ORGAN LEAD', 'CHOIR PAD'], snes: { lead: 'ORGAN', counter: 'HARP', pad: 'CHOIR' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'nightField', epic: 2, name: 'NIGHT FIELD', layer: 'GENRE', era: 'SNES', aliases: ['night', 'starry night', 'campfire', 'moonlight', 'quiet field'],
      desc: 'STARS OVER AN EMPTY FIELD. A LONELY FLUTE, BELL ARPEGGIOS WITH ECHO AND HUSHED STRINGS.',
      bpm: [76, 96], modes: ['dorian', 'minor', 'lydian'], leads: ['mode', 'pentatonic'], jazzy: 0.45, chordRate: 2,
      drums: 'ambient', bass: 'hold', lead: 'bell', pad: 'strings', arp: { pattern: 'updown', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.55, form: 'loop', pump: 0, sweep: false,
      banks: ['calm', 'emotional'], tricks: ['BELL ARPEGGIO', 'REAL ECHO'], snes: { lead: 'FLUTE', counter: 'BELLS', pad: 'STRINGS' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },
    { id: 'airship', epic: 6, name: 'AIRSHIP', layer: 'GENRE', era: 'SNES', aliases: ['airship', 'flying ship', 'sky ship', 'steampunk', 'voyage', 'sailing'],
      desc: 'ALL HANDS ON DECK. A JAUNTY SHUFFLE, BOLD BRASS, A MARIMBA COUNTER AND A STEAM ORGAN.',
      bpm: [118, 140], modes: ['major', 'mixolydian', 'dorian'], leads: ['mode', 'pentatonic'], jazzy: 0.3, chordRate: 1, meter: 'shuffle',
      drums: 'march', bass: 'drive', lead: 'brass', pad: 'saw', arp: null, swing: 0, leadDensity: 0.85, form: 'loop', pump: 0, sweep: false,
      banks: ['bright', 'action'], tricks: ['ORGAN PAD', 'MARIMBA COUNTER'], snes: { lead: 'BRASS', counter: 'MARIMBA', pad: 'ORGAN' }, conf: { bpm: S, harmony: S, groove: E, sound: S, form: S } },
    { id: 'mode7Racer', epic: 6, name: 'MODE-7 RACER', layer: 'GENRE', era: 'SNES', aliases: ['racing', 'racer', 'kart', 'race', 'grand prix', 'speed'],
      desc: 'FLAT OUT ON A SPINNING TRACK. A SLAPPY GUITAR LEAD, BRASS HITS AND A RUNNING BASS.',
      bpm: [140, 164], modes: ['major', 'mixolydian', 'dorian'], leads: ['pentatonic', 'mode'], jazzy: 0.25, chordRate: 1,
      drums: 'rock', bass: 'eighths', lead: 'saw', pad: 'saw', arp: { pattern: 'up', rate: 8, oct: 1 }, swing: 0, leadDensity: 0.9, form: 'loop', pump: 0, sweep: false,
      banks: ['action', 'bright'], tricks: ['GUITAR LEAD', 'BRASS COUNTER'], snes: { lead: 'GUITAR', counter: 'BRASS', pad: 'STRINGS' }, conf: { bpm: S, harmony: S, groove: S, sound: S, form: S } },

    // ---- artist layers (documented facts only; names below are search words, never output)
    { id: 'hypnoprog96', name: "HYPNOTIC PROGRESSIVE '96", layer: 'ARTIST', parent: 'trance',
      aliases: ['underworld', 'born slippy', 'rez', 'cowgirl', 'karl hyde', 'rick smith', 'dubnobasswithmyheadman', 'second toughest in the infants'],
      desc: 'LONG HYPNOTIC BUILDS, 909 FOUR-ON-THE-FLOOR, SQUELCHING 303 LINES, DUB DELAYS, MIXED LIVE.',
      bpm: [128, 140], modes: ['minor'], leads: ['mode', 'pentatonic'], jazzy: 0.15, chordRate: 4,
      drums: 'trance', bass: 'acid', lead: 'saw', pad: 'saw', arp: { pattern: 'octave', rate: 4, oct: 2 }, swing: 0, leadDensity: 0.35, form: 'evolve', length: 1.25,
      pump: 0, sweep: true, echo: { time: '3/16', fb: 60, mix: 85 }, banks: ['dark', 'emotional'], tricks: ['DUB DELAY', 'LONG BUILD'],
      conf: { bpm: S, harmony: E, groove: S, sound: S, form: S },
      notes: [
        'TEMPO: A SIGNATURE 1996 TRACK MEASURES ABOUT 140 BPM IN A MINOR KEY (SOLID, ONE DATA POINT)',
        'KICK: FOUR-TO-THE-FLOOR IS DESCRIBED AS TYPICAL OF THEIR WORK (SOLID)',
        'GEAR: TB-303S, TR-909S, ARP 2600, OSCAR, DX7, MT-32 AND AN SD-3000 DUB DELAY (SOLID)',
        'MIX: PERFORMED LIVE THROUGH THE DESK, NO COMPRESSORS OR GATES, SO NO PUMP (SOLID)',
        'FORM: BEATS REPEATED FOR LONG STRETCHES, IDEAS REVISITED AND LAYERED (SOLID)',
        'HARMONY: VERY FEW CHORD CHANGES (ESTIMATED FROM THE STYLE)',
      ] },
  ];
  LO.BLUEPRINTS = B;
  LO.blueprintById = id => B.find(b => b.id === id) || null;

  LO.searchBlueprints = function (q, list) {
    list = list || B; q = String(q || '').toLowerCase().trim();
    if (!q) return list.slice();
    const score = b => {
      const hay = [b.name.toLowerCase(), b.id, ...(b.aliases || [])];
      let s = 0;
      for (const h of hay) { if (h === q) s = Math.max(s, 3); else if (h.startsWith(q)) s = Math.max(s, 2); else if (h.includes(q)) s = Math.max(s, 1); }
      return s;
    };
    return list.map(b => [b, score(b)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  };

  // blend two blueprints: numbers slide, choices switch at the halfway point
  LO.blendBlueprints = function (a, b, t) {
    if (!b || t <= 0) return a; if (t >= 1) return b;
    const lerp = (x, y) => x + (y - x) * t, pick = (x, y) => (t < 0.5 ? x : y);
    return {
      id: `blend-${a.id}-${b.id}-${Math.round(t * 100)}`, name: `${a.name} x ${b.name}`, layer: 'BLEND', aliases: [],
      desc: `${Math.round((1 - t) * 100)}% ${a.name} / ${Math.round(t * 100)}% ${b.name}`,
      bpm: [Math.round(lerp(a.bpm[0], b.bpm[0])), Math.round(lerp(a.bpm[1], b.bpm[1]))],
      modes: t < 0.35 ? a.modes : t > 0.65 ? b.modes : [...new Set(a.modes.concat(b.modes))],
      leads: pick(a.leads, b.leads), jazzy: lerp(a.jazzy, b.jazzy), chordRate: [1, 2, 4].reduce((best, v) => Math.abs(v - lerp(a.chordRate, b.chordRate)) < Math.abs(best - lerp(a.chordRate, b.chordRate)) ? v : best, 1),
      drums: pick(a.drums, b.drums), bass: pick(a.bass, b.bass), lead: pick(a.lead, b.lead), pad: t < 0.5 ? a.pad : b.pad,
      arp: (a.arp || b.arp) ? (t < 0.5 ? (a.arp || b.arp) : (b.arp || a.arp)) : null,
      swing: lerp(a.swing, b.swing), leadDensity: lerp(a.leadDensity, b.leadDensity), form: pick(a.form, b.form),
      length: lerp(a.length || 1, b.length || 1), pump: Math.round(lerp(a.pump || 0, b.pump || 0)), sweep: !!(a.sweep || b.sweep),
      sp1200: pick(!!a.sp1200, !!b.sp1200), hall: Math.round(lerp(a.hall || 15, b.hall || 15)), echo: pick(a.echo, b.echo),
      snes: pick(a.snes, b.snes) || a.snes || b.snes || null, banks: [...new Set((a.banks || []).concat(b.banks || []))], tricks: [...new Set((a.tricks || []).concat(b.tricks || []))], conf: {},
    };
  };

  // emotion: the two-axis model from music psychology (mood dark-bright, energy calm-intense)
  LO.emotionLabel = function (v, a) {
    const hi = x => x >= 6.5, lo = x => x <= 3.5;
    if (hi(v) && hi(a)) return 'EUPHORIC';
    if (hi(v) && lo(a)) return 'DREAMY';
    if (lo(v) && hi(a)) return 'TENSE';
    if (lo(v) && lo(a)) return 'MELANCHOLY';
    if (hi(v)) return 'HOPEFUL';
    if (lo(v)) return 'MOODY';
    if (hi(a)) return 'DRIVING';
    if (lo(a)) return 'CALM';
    return 'BALANCED';
  };
})(typeof self !== 'undefined' ? self : globalThis);
