/* STUDIO MIND - CHIP KEEPER: the guardian of the walled garden.
   Every idea from the other modules is translated into what the chosen chip can really do: its voice count,
   its note range, its volume steps, its memory and its effects. No idea gets to cheat the hardware. */
(function (G) {
  const LO = G.LO, M = 'CHIP KEEPER';

  const SPEC = {
    'NES': { voices: '5 VOICES: 2 PULSE, TRIANGLE, NOISE, DPCM', range: [33, 108], bassRange: [28, 84], arpPart: false, echoHw: false, volSteps: 16, spare: "PULSE 2" },
    'AMIGA': { voices: '4 SAMPLE CHANNELS, 8-BIT', range: [24, 93], bassRange: [24, 81], arpPart: false, echoHw: false, volSteps: 64, spare: 'CHANNEL 4' },
    'SNES': { voices: '8 BRR VOICES, 64 KB SHARED RAM', range: [24, 96], bassRange: [24, 84], arpPart: true, echoHw: true, volSteps: 128, spare: 'THE COUNTER VOICE' },
    'GENESIS': { voices: '6 FM VOICES (4 OPERATORS), 8-BIT DRUM DAC, 3 PSG SQUARES + NOISE', range: [24, 108], bassRange: [21, 84], arpPart: true, echoHw: false, volSteps: 128, spare: 'FM 2' },
    'NEO GEO': { voices: '4 FM VOICES, 3 SSG, 6 ADPCM DRUMS, 1 SAMPLED PAD', range: [21, 108], bassRange: [21, 84], arpPart: true, echoHw: false, volSteps: 128, spare: 'FM 2' },
    'ROLAND LA': { voices: '8 PARTS + RHYTHM, 32 PARTIALS, BUILT-IN REVERB', range: [21, 108], bassRange: [21, 84], arpPart: true, echoHw: true, volSteps: 128, spare: 'PART 2' },
    'LO-1': { voices: '12 VOICES WITH FILTERS', range: [21, 108], bassRange: [21, 96], arpPart: true, echoHw: true, volSteps: 4096, spare: 'THE COUNTER VOICE' },
  };
  LO.CHIP_SPEC = SPEC;

  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

  // TIMING (v0.5.1): how each chip's sound driver really keeps time.
  // hz: a fixed-rate driver (one tick per video frame); ppq: ticks tied to the tempo; ms: free timing.
  const TICK = {
    'NES': { hz: 60, name: '60 HZ DRIVER FRAMES', delay: 'Gxx NOTE DELAY', retrig: 'FRAME RETRIGGERS', tag: 'SOLID' },
    'AMIGA': { hz: 50, name: '50 HZ PAL TICKS, LIKE PROTRACKER', delay: 'EDx NOTE DELAY', retrig: 'E9x RETRIGGERS', tag: 'SOLID' },
    'GENESIS': { hz: 60, name: '60 HZ VBLANK DRIVER TICKS', delay: 'NOTE DELAY', retrig: 'TICK RETRIGGERS', tag: 'SOLID' },
    'SNES': { ppq: 48, name: '48 TICKS PER BEAT (N-SPC STYLE DRIVER)', delay: 'TICK DELAY', retrig: 'TICK RETRIGGERS', tag: 'ESTIMATED' },
    'NEO GEO': { ppq: 48, name: '48 TICKS PER BEAT (TIMER B DRIVER)', delay: 'TICK DELAY', retrig: 'TICK RETRIGGERS', tag: 'ESTIMATED' },
    'ROLAND LA': { ms: true, name: 'MIDI TIMING, 1 MS STEPS', human: true },
    'LO-1': { ms: true, name: 'SAMPLE-ACCURATE TIMING', human: true },
  };
  LO.CHIP_TICK = TICK;
  // a gentle ritardando: inside [a, b] the tempo slows linearly by up to `slow`; everything after shifts later
  LO.makeWarp = function (segs) {
    if (!segs || !segs.length) return t => t;
    const S = segs.slice().sort((x, y) => x.a - y.a);
    return t => { let o = t; for (const g of S) { if (t <= g.a) continue; const L = g.b - g.a, x = Math.min(t, g.b) - g.a; o += g.slow * x * x / (2 * L); } return o; };
  };
  LO.ChipKeeper = {
    timing(T, song, chipId, P) {
      const meta = song.meta, parts = song.parts; if (!meta.groove || meta.timed) return;
      meta.timed = true;
      const ev = (...a) => T && T.ev(M, ...a);
      const K = TICK[chipId] || TICK['LO-1'], spb = 60 / meta.bpm;
      const W = LO.makeWarp(meta.warp);
      const tickPre = K.ppq ? 1 / K.ppq : 0;               // ticks that follow the tempo: snap, then slow down
      const tickPost = K.hz ? (1 / K.hz) / spb : 0;        // fixed-rate ticks: slow down, then snap to frames
      const qPre = x => tickPre ? Math.round(x / tickPre) * tickPre : x;
      const qPost = x => tickPost ? Math.round(x / tickPost) * tickPost : x;
      const tick = tickPre || tickPost;
      let delays = 0, snapped = 0, humanized = 0, rolls = 0;
      for (const nm of ['lead', 'counter', 'arp', 'bass', 'drums', 'chords', 'fx']) for (const n of parts[nm] || []) {
        n.tg = n.t; if (n.d != null) n.dg = n.d;
        const off = (n.fe || 0) / 1000 / spb;
        if (K.human) {
          const t = W(n.t + off); if (n.d != null) n.d = Math.max(0.02, W(n.t + off + n.d) - t); n.t = Math.max(0, t);
          if (n.fe) humanized++;
          continue;
        }
        const grid = qPost(W(qPre(n.t))), t = qPost(W(qPre(n.t + off)));
        if (Math.abs(t - grid) > 1e-9) delays++; else if (n.fe) snapped++;
        if (n.rt) rolls++;
        if (n.d != null) { const e = qPost(W(qPre(n.t + n.d))); n.d = Math.max(tick, e - grid); }
        n.t = Math.max(0, t);
      }
      for (const nm of ['lead', 'counter', 'arp', 'bass']) if (parts[nm]) parts[nm].sort((a, b) => a.t - b.t);
      parts.drums.sort((a, b) => a.t - b.t);
      // the rest of the song follows the slowdown
      const tb = song.totalBeats; song.totalBeats = W(tb);
      for (const sw of meta.sweeps || []) sw.points = sw.points.map(([t, v]) => [W(t), v]);
      // log what really happened
      ev('work', 'TIMING', `${chipId} TIMING: ${K.name}${K.tag ? ` (${K.tag})` : ''}`, 2);
      if (K.hz) {
        const fr16 = spb / 4 * K.hz, sw = meta.swing || 0;
        if (meta.meter === 'shuffle') { const a = Math.round(2 / 3 * spb * K.hz), b = Math.round(spb * K.hz) - a; ev('work', 'TIMING', `SHUFFLE AS A GROOVE TABLE: 8TH ROWS OF ${a}/${b} FRAMES`, 3); }
        else if (sw > 0.001 && meta.meter !== '3/4') { const a = Math.round((0.25 + sw) * spb * K.hz), b = Math.round(spb / 2 * K.hz) - a; ev('work', 'TIMING', `SWING AS A GROOVE TABLE: 16TH ROWS OF ${a}/${b} FRAMES`, 3); }
        else if (Math.abs(fr16 - Math.round(fr16)) > 0.05) ev('work', 'TIMING', `${meta.displayBpm || meta.bpm} BPM IS ${fr16.toFixed(2)} FRAMES PER 16TH: ROWS ALTERNATE ${Math.floor(fr16)}/${Math.ceil(fr16)} TO HOLD THE TEMPO`, 3);
        else ev('work', 'TIMING', `${Math.round(fr16)} FRAMES PER 16TH NOTE`, 2);
      }
      if (K.human) ev('work', 'TIMING', `HUMAN FEEL IN REAL MILLISECONDS: HATS AHEAD, ${meta.groove.laidBack ? 'SNARE AND BASS LAID BACK' : 'BASS A HAIR BEHIND'}, ${humanized} NOTES NUDGED`, 3 + Math.ceil(humanized / 60));
      else ev('work', 'TIMING', `${delays} FEEL NUDGES BIG ENOUGH TO BECOME ${K.delay}S; ${snapped} SMALLER THAN ONE ${(tick * spb * 1000).toFixed(1)} MS TICK, SNAPPED TO THE GRID (HARDWARE-TRUE)`, 3 + Math.ceil((delays + snapped) / 80));
      if (rolls) ev('work', 'TIMING', `HAT ROLLS PLAYED AS ${K.retrig || 'RETRIGGERS'}: ${rolls} HITS`, 2);
      if (meta.warp) ev('work', 'TIMING', `EASING OFF AT THE END: ${Math.round(meta.warp[meta.warp.length - 1].slow * 100)}% SLOWER OVER THE LAST BARS${K.hz || K.ppq ? ' (TEMPO COMMANDS)' : ''}`, 2);
      // volume accents land on the chip's real volume steps
      const steps = (SPEC[chipId] || SPEC['LO-1']).volSteps;
      if (steps <= 128) {
        const lv = new Set();
        for (const nm of ['lead', 'bass', 'counter']) for (const n of parts[nm] || []) { n.v = Math.round(LO.clamp(n.v == null ? 1 : n.v, 0, 1) * (steps - 1)) / (steps - 1); if (nm === 'lead') lv.add(n.v); }
        ev('work', 'TIMING', `ACCENTS ON THE ${steps}-STEP VOLUME: THE LEAD USES ${lv.size} LEVELS`, 2);
      }
    },
    fit(T, song, chipId, P) {
      const S = SPEC[chipId] || SPEC['LO-1'], parts = song.parts, col = T.color;
      T.ev(M, 'work', 'VOICES', `${chipId}: ${S.voices}`, 3);
      // 1. imagination's layers: find them a real voice, or share one in the gaps
      if (col && col.tonal && col.tonal.length) {
        const byLayer = {};
        for (const n of col.tonal) (byLayer[n.layer] = byLayer[n.layer] || []).push(n);
        for (const [layer, notes] of Object.entries(byLayer)) {
          const clean = notes.map(n => ({ t: n.t, d: n.d, m: n.m, v: n.v, layer }));
          let r = LO.gapFill(parts.counter, clean.map(n => ({ ...n })), 0.03), where = S.spare;
          let extra = { placed: 0 };
          if (r.dropped && S.arpPart && parts.arp && parts.arp.length === 0) {
            const left = clean.filter(n => !parts.counter.some(c => c.layer === layer && c.t === n.t));
            parts.arp = []; extra = LO.gapFill(parts.arp, left, 0.03); where += ' AND THE ARP VOICE';
          }
          const placed = r.placed + extra.placed, dropped = clean.length - placed;
          if (dropped > clean.length * 0.25) T.agree('IMAGINATION', M, 'VOICES', `ADD ${layer.toUpperCase()} ON TOP OF EVERYTHING`, `NO FREE VOICE ON ${chipId}: IT PLAYS IN ${where}'S GAPS (${placed} OF ${clean.length} NOTES)`);
          else T.ev(M, 'work', 'VOICES', `${layer.toUpperCase()}: ${placed} NOTES PLACED IN ${where}`, Math.ceil(placed / 10));
        }
      }
      if (col && col.drums && col.drums.length) {
        for (const d of col.drums) parts.drums.push({ t: d.t, kind: d.kind, v: d.v });
        parts.drums.sort((a, b) => a.t - b.t);
        T.ev(M, 'work', 'VOICES', `${col.drums.length} TEXTURE HITS ON THE ${chipId === 'NES' ? 'NOISE CHANNEL' : chipId === 'AMIGA' ? 'SHARED DRUM CHANNEL' : 'DRUM VOICES'}`, Math.ceil(col.drums.length / 20));
      }
      // 2. a riff on chips with no arp voice shares the spare channel
      if (!S.arpPart && song.meta.riff && parts.arp && parts.arp.length) {
        const r = LO.gapFill(parts.counter, parts.arp.map(n => ({ ...n })), 0.02);
        T.agree('COMPOSER', M, 'VOICES', 'PLAY THE SYNTH RIFF ALL THE WAY THROUGH', `${chipId} HAS NO SPARE ARP VOICE: THE RIFF SHARES ${S.spare} (${r.placed} NOTES)`);
      }
      // 3. echo wished for on a chip without echo hardware: the classic tracker trick, written as notes
      if (col && col.fx && col.fx.echo && !S.echoHw && chipId === 'AMIGA') {
        const echoes = parts.lead.filter(n => n.d >= 0.5).map(n => ({ t: n.t + 0.75, d: Math.min(0.7, n.d), m: n.m, v: (n.v || 1) * 0.35 }));
        const r = LO.gapFill(parts.counter, echoes, 0.02);
        T.agree('IMAGINATION', M, 'EFFECTS', 'GIVE THE MELODY A SHIMMERING ECHO', `THE AMIGA HAS NO ECHO CHIP: WRITING ${r.placed} ECHO NOTES BY HAND, LIKE THE OLD TRACKERS DID`);
      }
      // 4. every note inside the chip's real range
      let folded = 0;
      for (const nm of ['lead', 'counter', 'arp']) for (const n of parts[nm] || []) { const m2 = fold(n.m, S.range[0], S.range[1]); if (m2 !== n.m) { n.m = m2; folded++; } }
      for (const n of parts.bass) { const m2 = fold(n.m, S.bassRange[0], S.bassRange[1]); if (m2 !== n.m) { n.m = m2; folded++; } }
      T.ev(M, 'work', 'RANGE', folded ? `${folded} NOTE${folded === 1 ? ' WAS' : 'S WERE'} OUTSIDE ${chipId}'S RANGE: MOVED BY OCTAVES` : `EVERY NOTE FITS ${chipId}'S RANGE`, 3 + Math.ceil(folded / 5));
      // 5. dynamics resolution
      if (S.volSteps <= 64) T.ev(M, 'work', 'MEMORY', `${chipId} VOLUME HAS ${S.volSteps} STEPS: EMOTION'S DYNAMICS ARE ROUNDED TO THEM`, 2);
      if (chipId === 'SNES') T.ev(M, 'work', 'MEMORY', 'SNES: SAMPLES AND ECHO SHARE 64 KB, THE ECHO GETS WHAT IS LEFT', 3);
    },
    translateFx(T, chipId, song, fx, col) {
      const E = T.emotion;
      if (chipId === 'LO-1' && E) song.meta.brightness = LO.clamp((song.meta.brightness || 1) * (0.85 + E.brightness * 0.15) + (col ? col.bright : 0), 0.6, 1.4);
      if (!col || !col.fx) return fx;
      const f = col.fx;
      if (chipId === 'LO-1') {
        if (f.hall) fx.hall = LO.clamp((fx.hall || 0) + f.hall, 0, 80);
        if (f.echo) { fx.echoFb = LO.clamp(Math.max(fx.echoFb || 0, 55), 0, 80); fx.echoMix = LO.clamp(Math.max(fx.echoMix || 0, 75), 0, 100); }
        if (f.bits) fx.bits = LO.clamp((fx.bits || 10) + f.bits, 8, 12);
        if (f.pump) fx.pump = LO.clamp((fx.pump || 0) + f.pump, 0, 70);
        T.ev(M, 'work', 'EFFECTS', `LO-1 EFFECTS SET: HALL ${fx.hall}%, ECHO ${fx.echoFb}%, ${fx.bits}-BIT, PUMP ${fx.pump}%`, 3);
      } else if (chipId === 'SNES') {
        if (f.hall || f.echo) {
          fx.efb = LO.clamp(fx.efb + (f.echo ? 15 : 8), 0, 70); fx.evol = LO.clamp(fx.evol + Math.round((f.hall || 10) / 2), 0, 60); fx.eonPad = true;
          T.agree('IMAGINATION', M, 'EFFECTS', 'MAKE IT HUGE AND SPACIOUS', `USING THE SNES'S REAL ECHO: FEEDBACK ${fx.efb}%, LEVEL ${fx.evol}%, INSIDE THE 64 KB`);
        }
      } else if (chipId === 'NES') {
        if (f.echo) {
          const busy = song.parts.counter.length / Math.max(1, song.bars.length);
          if (busy < 1.5) { fx.echoTrick = true; T.agree('IMAGINATION', M, 'EFFECTS', 'GIVE THE MELODY AN ECHO', 'THE NES HAS NO ECHO: PULSE 2 PLAYS THE MELODY AGAIN, SOFTER AND LATE (THE OLD TRICK)'); }
          else T.agree('IMAGINATION', M, 'EFFECTS', 'GIVE THE MELODY AN ECHO', 'PULSE 2 IS BUSY WITH THE COUNTER-MELODY: NO ECHO THIS TIME, THE COUNTER WINS');
        }
        if (f.bits) T.ev(M, 'work', 'EFFECTS', 'THE NES IS ALREADY CRUNCHY: NO EXTRA BIT CRUSH NEEDED', 1);
      } else if (chipId === 'GENESIS' || chipId === 'NEO GEO') {
        const k = chipId === 'GENESIS' ? 'psgEcho' : 'ssgEcho', sq = chipId === 'GENESIS' ? 'PSG 3' : 'SSG C';
        if (f.echo) { fx[k] = true; T.agree('IMAGINATION', M, 'EFFECTS', 'GIVE THE MELODY AN ECHO', `NO ECHO HARDWARE ON THE ${chipId}: ${sq} PLAYS THE MELODY AGAIN, SOFTER AND LATE`); }
        if (f.hall) T.ev(M, 'work', 'EFFECTS', `THE ${chipId} HAS NO REVERB: SPACE COMES FROM ATMOSPHERICS INSTEAD`, 1);
        if (f.bits) T.ev(M, 'work', 'EFFECTS', chipId === 'GENESIS' ? 'LADDER EFFECT ALREADY GIVES THE GENESIS ITS GRIT' : 'THE ADPCM CODEC ALREADY ADDS THE CRUNCH', 1);
      } else if (chipId === 'ROLAND LA') {
        if (f.hall) { fx.reverb = 'HALL'; fx.revLevel = LO.clamp((fx.revLevel || 30) + Math.round(f.hall / 2), 0, 80); }
        if (f.echo) fx.reverb = 'TAP DELAY';
        if (f.hall || f.echo) T.agree('IMAGINATION', M, 'EFFECTS', 'MAKE IT SPACIOUS', `USING THE LA SYNTH'S OWN ${fx.reverb} AT ${fx.revLevel}%`);
      } else if (chipId === 'AMIGA') {
        if (f.hall) T.ev(M, 'work', 'EFFECTS', 'NO REVERB HARDWARE ON THE AMIGA: SPACE COMES FROM ATMOSPHERICS INSTEAD', 1);
      }
      return fx;
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
