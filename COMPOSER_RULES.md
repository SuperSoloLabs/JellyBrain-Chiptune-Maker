# Composer rulebook (research notes for v0.6.1, 2026-10-24)

Internal build notes. SOLID = from a source read this session; ESTIMATED = standard theory / my synthesis.

## What the Composer does today (gaps found in composer.js)
- Counter-melody is either a chord-tone figure in the break, or the lead copied ~a 3rd-6th below in A2: mostly PARALLEL motion, so no independence.
- One fixed layer table (intro/build/A/break/A2/outro) for every genre: no orchestration, no melody hand-off, no instrument entrances.
- No register lanes per role; no masking check between voices.
- Drums are kit patterns + fills; no orchestral percussion writing (timpani rolls into cadences, cymbal swells, snare on drive sections).

## 1. Orchestration (Rimsky-Korsakov, Principles of Orchestration) SOLID
- Melody stands out by: top position, timbre contrast against the accompaniment, doubling (unison/octave), or crossing above the accompaniment; dynamic accent when timbre can't separate it.
- Balance (forte): 1 trumpet = 1 trombone = 2 horns; 1 horn = 2 flutes/oboes/clarinets. Piano: winds roughly equal; a whole string section ~ 1 wind (piano), ~2 winds (forte). -> per-instrument loudness weights.
- Strings + brass side by side blend poorly; winds soften brass and thicken strings; plucked strings + percussion blend well.
- Avoid constant compound timbres: they flatten color. Simple combos, change color often.
- Harp: arpeggiated chords, max 4 notes per hand, best in the middle octaves. Bells/glock dominate any mix: use sparingly. Percussion "at reasonable intervals".
- Strings are the expressive core and can be heard longest; woodwind and percussion tire the ear sooner -> give pads/strings the long stretches, rotate winds and percussion.

## 2. Voice leading (harmony.org.uk; Huron, Voice Leading) SOLID
- No parallel 5ths/8ves/unisons between independent lines (doubling a melody in octaves is fine: that's one line, not counterpoint).
- Parallel 3rds/6ths fine, but not long runs of them.
- Hidden 5ths/8ves: avoid between melody and bass.
- Contrary motion = most independence, use as often as possible; parallel = least.
- Toneness: keep each voice in its own range. Minimum masking: upper voices within an octave of each other; low voices spaced wide (wide intervals low, close high).
- Pitch proximity: avoid crossing/overlap, especially when both voices leap.

## 3. Melodic expectation (Pearce & Wiggins 2006; Narmour I-R) SOLID
- Listener expectation is learned statistics (n-grams over pitch, interval, contour, scale degree, rhythm) plus a short-term model of the piece itself. The statistical model beat the rule model (R² .83 vs .75).
- I-R regularities: small intervals continue in the same direction; large leaps reverse; after a big leap the next interval is smaller; after a reversal the line returns near its start; smaller intervals are more expected.
- Use: score candidate phrases for surprise (information content). Aim for a target band: mostly expected, one or two surprising moments per phrase, motifs repeat so the piece teaches itself. (We already have n-gram freshness across songs; add WITHIN-song expectation scoring.)

## 4. Catchiness (Jakubowski et al., earworm study, APA 2016) SOLID
- Earworms: faster than average; common global contour (first phrase rises, second falls); plus something unusual in the intervals (an unexpected leap, or more repeated notes than usual).

## 5. Phrase form (Schoenberg sentence / period) SOLID
- Sentence: basic idea, repeated (often on the dominant), then fragmentation/condensation into a cadence (2+2+4).
- Period: 4-bar antecedent ends on a half cadence, 4-bar consequent ends on a full cadence.
- Use both; pick per theme (we already do 3+5, 5+3 splits: add real sentence/period logic tied to cadence type).

## 6. SNES-era arranging (Chrono Trigger analysis, lauraintravia.com) SOLID
- Ostinato (harp) keeps quiet sections moving without competing; it carries momentum when drums and bass drop out.
- Quiet sections: melody/harmony/bass go long and sustained.
- Openings: forceful drums and percussive harmony for energy; timpani in the bass for power.
- Pedal points + minimal motion = tension/dread (dungeons, castles).

## 7. Game music craft (Berklee) SOLID
- Seamless loops; vertical layering (add/remove layers over the same music) for intensity; stingers in key.
- Theme carried across contexts by swapping the lead instrument while melody/harmony stay.
- Build variability into the composition itself (shuffled phrase order, varied starts).

## Build plan (Composer + Production + Listener) ESTIMATED
1. ORCHESTRATOR (inside Composer): a per-section role sheet: who has melody, who answers, who holds, who drives, which percussion. Different sheets per purpose/genre; melody hand-offs between instruments on repeats (A: horn, A2: strings + horn octave doubling); entrances staggered; climax = tutti, quiet = 2-3 voices.
2. REGISTER LANES: bass (E1-E3), pad/strings low-mid, melody mid/high, ostinato/harp high or interleaved; no voice in another's lane on the same beat (minimum masking).
3. REAL COUNTERPOINT: counter-melody generated note-by-note against the lead with a cost: contrary motion bonus, no parallel 5/8, limited parallel 3/6 runs, fills when the lead rests (call-and-response), rests when the lead is busy.
4. ORCHESTRAL PERCUSSION: timpani on roots at phrase starts, rolls into cadences and section changes, cymbal swells into climaxes, snare only in drive sections, percussion thinned in quiet sections.
5. EXPECTATION SCORE: within-song n-gram surprise per phrase, target band; earworm shape bonus (rise then fall, one unusual interval).
6. PRODUCTION MIX ENGINEER: per-instrument loudness weights (measured + Rimsky ratios), per-voice SNES L/R volumes by stage position, echo only on melody/pads, drums/bass dry and forward.
7. LISTENER MASKING CHECK: per-voice audibility (how much of each voice's band energy survives the others); a buried voice -> remix pass.
All new behavior behind a version flag so old keeps replay exactly.
