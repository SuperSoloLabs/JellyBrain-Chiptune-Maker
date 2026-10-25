/* STUDIO MIND - IMAGINATION: color words turned into sound.
   Every color is a recipe: a feeling nudge for EMOTION, mode hints for the COMPOSER, extra layers of notes,
   effect wishes and a place to put the song. The CHIP KEEPER then translates all of it into what the chosen
   chip can really do. Shimmer = octave-up voices into a long tail (the classic shimmer recipe). */
(function (G) {
  const LO = G.LO, M = 'IMAGINATION';

  const C = (name, words, desc, o) => ({ name, words, desc, nudge: o.nudge || { v: 0, a: 0 }, layers: o.layers || [], fx: o.fx || {}, atmos: o.atmos || null, atmosAmount: o.amt || 55, modes: o.modes || null, bright: o.bright || 0 });
  LO.COLORS = [
    C('FAIRY DUST', ['fairy dust', 'fairy', 'magic', 'magical', 'sparkle', 'sparkly', 'pixie', 'enchanted', 'wonder'], 'HIGH TWINKLES, A LYDIAN LIFT, SHIMMERING ECHOES', { nudge: { v: 2, a: 0.5 }, layers: ['sparkle'], fx: { hall: 15, echo: 1 }, modes: ['lydian', 'major'], bright: 0.1 }),
    C('SHIMMER', ['shimmer', 'glow', 'glowing', 'heavenly', 'angelic', 'radiant'], 'A SOFT OCTAVE-UP HALO OVER THE CHORDS', { nudge: { v: 1, a: -0.5 }, layers: ['halo'], fx: { hall: 25 }, bright: 0.08 }),
    C('DEEP SPACE', ['deep space', 'space', 'cosmic', 'galaxy', 'stars', 'starlight', 'nebula', 'orbit', 'astronaut'], 'A LOW DRONE, DISTANT BELLS, ENDLESS ECHO', { nudge: { v: 0, a: -1.5 }, layers: ['drone', 'bells'], fx: { hall: 30, echo: 1 } }),
    C('UNDERWATER', ['underwater', 'ocean', 'deep sea', 'sea', 'aquatic', 'sunken', 'submarine'], 'RISING BUBBLES AND A MUFFLED WORLD', { nudge: { v: 0, a: -1 }, layers: ['bubbles'], atmos: 'UNDERWATER', amt: 45, bright: -0.12 }),
    C('GHOST', ['ghost', 'ghostly', 'haunted', 'spooky', 'phantom', 'eerie', 'creepy'], 'FAR-AWAY ECHOES OF THE MELODY IN A STONE ROOM', { nudge: { v: -2.5, a: -0.5 }, layers: ['echoes'], fx: { echo: 1 }, atmos: 'CATHEDRAL', amt: 35, modes: ['phrygian', 'minor'] }),
    C('NEON', ['neon', 'city lights', 'night city', 'cyber', 'cyberpunk', 'arcade'], 'A PULSING MACHINE SEQUENCE AND A PUMPING MIX', { nudge: { v: 0, a: 1.5 }, layers: ['machine'], fx: { pump: 15 }, bright: 0.08 }),
    C('ICE', ['ice', 'icy', 'frozen', 'winter', 'snow', 'crystal', 'crystalline', 'glass'], 'CRYSTAL BELLS, COLD AND CLEAR', { nudge: { v: 0.5, a: -0.5 }, layers: ['bells'], fx: { hall: 15 }, modes: ['lydian', 'dorian'], bright: 0.12 }),
    C('FIRE', ['fire', 'burning', 'lava', 'inferno', 'flames', 'blaze'], 'HOT, DRIVING, A LITTLE BURNT AROUND THE EDGES', { nudge: { v: -0.5, a: 2.5 }, layers: ['machine'], fx: { bits: -1 }, modes: ['phrygian', 'minor'] }),
    C('RUST', ['rust', 'rusty', 'industrial', 'factory', 'iron', 'metal', 'steel'], 'GRINDING MACHINES AND CRUNCHIER BITS', { nudge: { v: -1, a: 1 }, layers: ['machine'], fx: { bits: -2 }, bright: -0.05 }),
    C('RAIN', ['rain', 'rainy', 'drizzle', 'raindrops'], 'SOFT RAIN TICKING ON EVERYTHING', { nudge: { v: -1, a: -0.5 }, layers: ['rain'] }),
    C('STORM', ['storm', 'thunder', 'tempest', 'lightning'], 'HEAVY RAIN, GUSTS AND TENSION', { nudge: { v: -1.5, a: 2 }, layers: ['rain', 'wind'] }),
    C('DREAM', ['dream', 'dreamy', 'dreaming', 'floating', 'cloud', 'clouds', 'sleepy', 'lullaby'], 'A WARM HALO, SLOW AND FLOATING', { nudge: { v: 1, a: -2 }, layers: ['halo'], fx: { hall: 25, echo: 1 }, modes: ['lydian', 'major'] }),
    C('CATHEDRAL', ['cathedral', 'church', 'sacred', 'holy', 'choir', 'hymn'], 'A HOLY DRONE INSIDE A HUGE STONE NAVE', { nudge: { v: 0.5, a: -1 }, layers: ['drone'], atmos: 'CATHEDRAL', amt: 55 }),
    C('VAPOR', ['vapor', 'vaporwave', 'vhs', 'nostalgia', 'nostalgic', 'memory', 'memories', 'retro tape'], 'A WORN VIDEOTAPE MEMORY', { nudge: { v: -0.5, a: -1 }, atmos: 'VHS', amt: 60 }),
    C('VINYL', ['vinyl', 'record', 'dusty', 'crackle', 'old record'], 'DUST AND CRACKLE ON AN OLD RECORD', { atmos: 'VINYL', amt: 70 }),
    C('CASSETTE', ['cassette', 'tape', 'mixtape', 'walkman'], 'TAPE WOBBLE AND HISS', { atmos: 'CASSETTE', amt: 60 }),
    C('RADIO', ['radio', 'broadcast', 'transmission', 'signal'], 'A DISTANT AM BROADCAST', { atmos: 'AM RADIO', amt: 50 }),
    C('MACHINE', ['robot', 'machine', 'android', 'computer', 'circuit', 'digital', 'cyborg'], 'A MACHINE PULSE WITH DIGITAL STUTTERS', { nudge: { v: -0.5, a: 1 }, layers: ['machine', 'glitch'] }),
    C('GLITCH', ['glitch', 'glitchy', 'broken', 'corrupt', 'corrupted', 'error'], 'STUTTERS AND BROKEN REPEATS IN THE MELODY', { layers: ['glitch'] }),
    C('HEARTBEAT', ['heartbeat', 'heart', 'pulse', 'alive', 'breathing'], 'A LOW LUB-DUB UNDER THE QUIET PARTS', { layers: ['heartbeat'] }),
    C('SUNRISE', ['sunrise', 'dawn', 'morning', 'hope', 'hopeful', 'new day', 'sunshine'], 'HOPEFUL BELLS AND A BRIGHTER KEY', { nudge: { v: 2.5, a: 0.5 }, layers: ['bells'], modes: ['major', 'lydian'], bright: 0.08 }),
    C('MIDNIGHT', ['midnight', 'night', 'noir', 'shadow', 'shadows', 'dark'], 'DARKER CHORDS AND A LOWER, SMOKIER MOOD', { nudge: { v: -2, a: -0.5 }, modes: ['minor', 'dorian'], bright: -0.08 }),
    C('ANCIENT', ['ancient', 'temple', 'ruins', 'mystic', 'mystical', 'pharaoh', 'old world'], 'AN OLD-WORLD DRONE AND EXOTIC SCALES IN A CAVE', { nudge: { v: -0.5, a: -0.5 }, layers: ['drone'], atmos: 'CAVE', amt: 35, modes: ['phrygian'] }),
    C('WIND', ['wind', 'windy', 'breeze', 'air', 'gust'], 'GUSTS OF AIR MOVING THROUGH THE QUIET PARTS', { layers: ['wind'] }),
    C('HEROIC', ['heroic', 'hero', 'epic', 'triumph', 'triumphant', 'glory', 'legend'], 'BIG, PROUD BELLS AND MORE ENERGY', { nudge: { v: 1.5, a: 2 }, layers: ['bells'], modes: ['lydian', 'major', 'mixolydian'] }),
  ];
  const WORDS = [];
  for (const c of LO.COLORS) for (const w of c.words) WORDS.push([w, c.name]);
  WORDS.sort((a, b) => b[0].length - a[0].length);

  LO.Imagination = {
    parse(text) {
      let s = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
      const out = [];
      for (const [w, name] of WORDS) { const needle = ' ' + w + ' '; if (s.includes(needle)) { if (!out.includes(name)) out.push(name); s = s.split(needle).join(' '); } }
      return out.slice(0, 3);
    },
    byName: n => LO.COLORS.find(c => c.name === n),
    plan(T, P) {
      const names = P.colors || [];
      if (!names.length) { T.color = null; T.ev(M, 'work', 'COLORS', 'NO COLOR WORDS: KEEPING THE SOUND PURE', 1); return; }
      const col = { names, nudge: { v: 0, a: 0 }, layers: [], fx: {}, atmos: null, atmosAmount: 55, modes: null, bright: 0 };
      for (const n of names) {
        const c = this.byName(n);
        T.ev(M, 'work', 'COLORS', `${n}: ${c.desc}`, 6);
        col.nudge.v += c.nudge.v / names.length * (names.length > 1 ? 1.3 : 1); col.nudge.a += c.nudge.a / names.length * (names.length > 1 ? 1.3 : 1);
        for (const l of c.layers) if (!col.layers.includes(l)) col.layers.push(l);
        for (const k in c.fx) col.fx[k] = (col.fx[k] || 0) + c.fx[k];
        if (c.atmos && !col.atmos) { col.atmos = c.atmos; col.atmosAmount = c.atmosAmount; }
        if (c.modes && !col.modes) col.modes = c.modes;
        col.bright += c.bright;
      }
      T.color = col;
      if (T.emotion) {
        LO.Emotion.retarget(T);
        T.ev(M, 'talk', 'COLORS', `NUDGING THE FEELING TOWARD ${T.emotion.label}`, 2, { to: 'EMOTION' });
      }
      if (col.modes) T.ev(M, 'talk', 'COLORS', `ASKING THE COMPOSER FOR ${col.modes.join(' OR ').toUpperCase()} COLORING`, 1, { to: 'COMPOSER' });
      if (col.layers.length) T.ev(M, 'work', 'LAYERS', `PLANNING LAYERS: ${col.layers.join(', ').toUpperCase()}`, col.layers.length * 2);
      if (col.atmos) T.ev(M, 'work', 'SPACE', `IMAGINING THE PLACE: ${col.atmos}`, 2);
    },
    applyToParams(T, P) {
      const col = T.color; if (!col) return;
      if (col.modes) P.modePref = col.modes;
    },
    // write the actual layer notes from the finished harmony
    paint(T, song, P) {
      const col = T.color; if (!col || !col.layers.length) { if (col) col.tonal = []; return; }
      const R = LO.rng((song.seed >>> 0) ^ 0x1A61);
      const bars = song.bars, NB = bars.length, key = song.meta.key, A = (T.emotion && T.emotion.a) || 5;
      const live = s => !['outro'].includes(s);
      const pc = m => ((m - key) % 12 + 12) % 12;
      const tonal = [], drums = []; const counts = {};
      const add = (layer, n) => { n.layer = layer; tonal.push(n); counts[layer] = (counts[layer] || 0) + 1; };
      const addD = (layer, d) => { d.layer = layer; drums.push(d); counts[layer] = (counts[layer] || 0) + 1; };
      for (const layer of col.layers) {
        if (layer === 'sparkle') {
          bars.forEach((b, i) => {
            if (!live(b.sec) && b.idx > 1) return;
            const k = LO.clamp(Math.round(2 + A / 3 + R.range(-1, 1)), 1, 6);
            const steps = new Set(); while (steps.size < k) steps.add(R.int(0, 15));
            for (const st of [...steps].sort((x, y) => x - y)) add('sparkle', { t: i * 4 + st / 4, d: 0.22, m: R.pick(b.tones.slice(0, 3)) + 36 + (R.chance(0.3) ? 12 : 0), v: 0.42 + R.range(0, 0.15) });
          });
        } else if (layer === 'bells') {
          bars.forEach((b, i) => { if (b.sec === 'intro' && b.idx < 2) return; for (const p of [0, 2]) add('bells', { t: i * 4 + p + 0.5, d: 1.2, m: b.tones[(i + p / 2) % 3] + 24, v: 0.5 }); });
        } else if (layer === 'halo') {
          bars.forEach((b, i) => add('halo', { t: i * 4, d: 3.8, m: b.tones[2] + 24, v: 0.32 }));
        } else if (layer === 'drone') {
          for (let i = 0; i < NB; i += 2) add('drone', { t: i * 4, d: Math.min(8, (NB - i) * 4) - 0.1, m: 48 + key - (key > 6 ? 12 : 0) + 12 * (bars[i].root % 12 === key % 12 ? 0 : 0), v: 0.45 });
        } else if (layer === 'bubbles') {
          bars.forEach((b, i) => {
            if (!R.chance(0.6)) return;
            const st = R.int(0, 12), base = b.tones[0] + 24, run = [0, 4, 7, 12, 16].slice(0, R.int(3, 5));
            run.forEach((iv, j) => add('bubbles', { t: i * 4 + (st + j) / 4, d: 0.2, m: base + iv, v: 0.35 + j * 0.06 }));
          });
        } else if (layer === 'echoes') {
          for (const n of song.parts.lead) if (n.d >= 0.5) add('echoes', { t: n.t + 1.5, d: Math.min(n.d, 1), m: n.m + 12, v: (n.v || 1) * 0.38 });
        } else if (layer === 'machine') {
          bars.forEach((b, i) => { if (!['A', 'B', 'A2', 'build'].includes(b.sec)) return; for (let k = 0; k < 16; k++) add('machine', { t: i * 4 + k / 4, d: 0.18, m: b.root + 24 + (k % 4 === 2 ? 12 : 0), v: k % 4 === 0 ? 0.42 : 0.3 }); });
        } else if (layer === 'glitch') {
          let g = 0; const keep = [];
          for (const n of song.parts.lead) {
            if (n.d >= 0.5 && R.chance(0.12)) { for (let k = 0; k < 3; k++) keep.push({ ...n, t: n.t + k * 0.125, d: 0.11, v: (n.v || 1) * (1 - k * 0.15) }); keep.push({ ...n, t: n.t + 0.375, d: n.d - 0.375 }); g++; }
            else keep.push(n);
          }
          song.parts.lead = keep; counts.glitch = g;
        } else if (layer === 'heartbeat') {
          bars.forEach((b, i) => { if (!['intro', 'break', 'outro'].includes(b.sec)) return; addD('heartbeat', { t: i * 4, kind: 'kick', v: 0.5 }); addD('heartbeat', { t: i * 4 + 0.375, kind: 'kick', v: 0.32 }); addD('heartbeat', { t: i * 4 + 2, kind: 'kick', v: 0.5 }); addD('heartbeat', { t: i * 4 + 2.375, kind: 'kick', v: 0.32 }); });
        } else if (layer === 'rain') {
          bars.forEach((b, i) => { const k = R.int(5, 10); for (let j = 0; j < k; j++) addD('rain', { t: i * 4 + R.int(0, 15) / 4 + R.range(0, 0.05), kind: 'hat', v: R.range(0.08, 0.22) }); });
        } else if (layer === 'wind') {
          bars.forEach((b, i) => { if (['intro', 'break', 'outro'].includes(b.sec) && b.idx % 4 === 0) addD('wind', { t: i * 4, kind: 'crash', v: 0.22 }); });
        }
      }
      col.tonal = tonal; col.drums = drums;
      for (const [k, n] of Object.entries(counts)) T.ev(M, 'work', k === 'rain' || k === 'wind' || k === 'heartbeat' ? 'TEXTURE' : 'LAYERS', `${k.toUpperCase()}: ${n} ${k === 'glitch' ? 'MELODY NOTES STUTTERED' : 'NOTES PAINTED'}`, Math.ceil(n / 10));
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
