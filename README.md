# Jelly Brain v0.7.3 (source)

A kid-simple music maker that writes and plays original SNES-style game music. Every sound is math: no audio files ship with it. It runs on Windows, macOS and Linux through Electron. By SuperSoloLabs.

## Run it

```
npm install
npm start          # Jelly Brain
npm run studio     # Chip Studio, the engine's workbench (7 chips)
```

## What's inside

| Folder | What it is |
| --- | --- |
| `jellybrain_app/` | Jelly Brain: `main.js` (window, saves, black box), `ui/` (screen, face, input), `src/` (the engine, run in a worker) |
| `app/` | Chip Studio: the same engine with all seven chips and a full control panel |
| `tools/` | Dev tools: build check, scene proof run, keeps check, instrument audit, SoundFont rebuilders |
| `launcher/` | The small Windows launcher (C source + exe) |
| `COMPOSER_RULES.md` | The composing rulebook the engine follows, with sources |

The engine lives in `app/src/`. `node tools/jelly_sync.js` copies it into `jellybrain_app/src/` (never edit the copies).

## The engine in one breath

- **Exact S-DSP:** integer Gaussian interpolation from the real table, ADSR and GAIN, 15-bit LFSR noise, pitch modulation (PMON), echo with an 8-tap FIR, signed volumes, a 14-bit pitch register, a 64 KB sample RAM budget, and BRR encoding.
- **N-SPC-style driver:** 48 ticks per beat, plus gate, velocity and pan tables.
- **Composer:** 32 scenes, each with a character sheet (tempo, mood, energy and epic windows; modes; devices), and 8 modes up to harmonic minor and phrygian dominant. It adds passing chords, bass styles, arpeggios, fills, key lifts, pedal points, ritardandos and fanfares.
- **Benchmark:** 16 metrics scored against percentiles from a 244-piece game-music research corpus. Each MAKE drafts 16 songs and plays the best one first.
- **Tricks the hardware allows:** FM through PMON, a detuned double, fake echo, a noise bed, wave-switching pads, a section-B sample swap, mono-checked width, a tuned echo drone, a pitch-chained bass, and sound-effect voice stealing.
- **Studio layer:** ECHO (ping-pong) and REVERB (Freeverb-style), baked into WAV and MP3 saves.
- **Controls:** gamepad support with button remapping, rumble, keyboard and mouse.
- **Debugging:** a black-box log of everything, MARK to flag a stretch of a song, and LOVE IT / BORING ratings.

## Instruments

132 instruments and 26 drum hits are built in. They're math rebuilds: our own measurements of SNES-era SoundFont instruments (harmonic envelopes, noise bands, loop Fourier series), resynthesized by the engine and reimagined, not copies. No samples and no `.sf2` files ship. Add your own with `node tools/sflib.js <folder>` and `node tools/sfdrums.js <folder>`, or import a SoundFont from inside the app.

## Not included

- **COSMIC (the LowOrbit LIFT-OFF library):** not part of this release. The COSMIC button does nothing without it.

## License

Free for any noncommercial use under the PolyForm Noncommercial License 1.0.0 (see `LICENSE`). Selling Jelly Brain or building it into a paid product needs a commercial license from SuperSoloLabs: support@SuperSoloLabs.com.

**Your music is yours.** Songs you make with Jelly Brain can go anywhere, commercial games included, with no fee and no credit required.

`lame.min.js` is lamejs (LGPL), used unmodified as its own file.
