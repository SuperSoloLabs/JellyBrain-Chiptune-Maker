/* LowOrbit Chip Studio - shared chip helpers: timing, drum sources, reverb, master stage */
(function (G) {
  const LO = G.LO;
  LO.CHIPS = LO.CHIPS || {};
  LO.TAIL_SECONDS = 3.0;

  // v0.7.2: a tempo map (the N-SPC tempo command, step by step): [{ t: beat, f: tempo factor from that beat on }]
  LO.beatSec = function (song, t) {
    const spb = 60 / song.meta.bpm, TM = song.meta.tempoMap; if (!TM || !TM.length) return t * spb;
    let sec = 0, b = 0, f = 1; for (const m of TM) { if (t <= m.t) break; sec += (m.t - b) * spb / f; b = m.t; f = m.f; } return sec + (t - b) * spb / f;
  };
  LO.timing = function (song) {
    const spb = 60 / song.meta.bpm;
    if (song.meta.tempoMap && song.meta.tempoMap.length) { const total = Math.ceil((LO.beatSec(song, song.totalBeats) + LO.TAIL_SECONDS) * LO.SR); return { spb, total, s: t => Math.max(0, Math.round(LO.beatSec(song, t) * LO.SR)) }; }
    const total = Math.ceil((song.totalBeats * spb + LO.TAIL_SECONDS) * LO.SR);
    return { spb, total, s: t => Math.max(0, Math.round(t * spb * LO.SR)) };
  };

  // Mono channels: each new note cuts the previous one (real chip channels are monophonic)
  LO.toMono = function (events, T) {
    const ev = events.map(e => ({ ...e, s: T.s(e.t), e: T.s(e.t + e.d) })).sort((a, b) => a.s - b.s);
    for (let i = 0; i < ev.length - 1; i++) if (ev[i].e > ev[i + 1].s) ev[i].e = ev[i + 1].s;
    return ev.filter(e => e.e > e.s);
  };

  // Drum sources synthesized from math, at any sample rate
  LO.drumSource = function (kind, sr, R, m) {
    const N = s => Math.max(1, Math.floor(s * sr));
    const noise = () => R.random() * 2 - 1;
    let n, out;
    const hpNoise = (len, fc, decay) => {
      const o = new Float32Array(len); const f = new LO.Biquad('hp', fc, 0.7, sr);
      for (let i = 0; i < len; i++) o[i] = f.run(noise()) * Math.exp(-i / sr * decay);
      return o;
    };
    switch (kind) {
      case 'kick': {
        n = N(0.36); out = new Float32Array(n); let ph = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr; ph += 2 * Math.PI * (48 + 110 * Math.exp(-t * 28)) / sr;
          out[i] = Math.tanh((Math.sin(ph) * Math.exp(-t * 7.5) + noise() * Math.exp(-t * 160) * 0.35) * 1.7);
        }
        break;
      }
      case 'snare': case 'clap': {
        n = N(kind === 'clap' ? 0.3 : 0.24); out = new Float32Array(n);
        const hp = new LO.Biquad('hp', 900, 0.7, sr);
        for (let i = 0; i < n; i++) {
          const t = i / sr; let env;
          if (kind === 'clap') env = (t < 0.03 ? Math.exp(-((t * 1000) % 10) / 3) : 0.7 * Math.exp(-(t - 0.03) * 14));
          else env = Math.exp(-t * 16);
          const tone = kind === 'snare' ? Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t * 25) * 0.6 : 0;
          out[i] = Math.tanh(hp.run(noise()) * env + tone);
        }
        break;
      }
      case 'hat': out = hpNoise(N(0.035), 7000, 110); break;
      case 'ohat': out = hpNoise(N(0.16), 7000, 14); break;
      case 'crash': out = hpNoise(N(1.4), 4500, 2.0); for (let i = 0; i < out.length; i++) out[i] *= 0.8; break;
      case 'rim': {
        n = N(0.07); out = new Float32Array(n); const hp = new LO.Biquad('hp', 2000, 0.7, sr);
        for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(2 * Math.PI * 820 * t) * 0.6 + hp.run(noise()) * 0.5) * Math.exp(-t * 60); }
        break;
      }
      case 'tom': case 'timp': {
        const f0 = LO.m2f(m || (kind === 'tom' ? 48 : 40));
        n = N(kind === 'timp' ? 1.4 : 0.3); out = new Float32Array(n); let ph = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr; ph += 2 * Math.PI * f0 * (1 + (kind === 'timp' ? 0.08 * Math.exp(-t * 18) : 0.6 * Math.exp(-t * 25))) / sr;
          const body = kind === 'timp' ? (Math.sin(ph) + 0.4 * Math.sin(1.5 * ph)) * Math.exp(-t * 2.6) : Math.sin(ph) * Math.exp(-t * 10);
          out[i] = body * 0.8 + noise() * Math.exp(-t * (kind === 'timp' ? 30 : 60)) * 0.25;
        }
        break;
      }
      default: out = new Float32Array(1);
    }
    return out;
  };

  // Freeverb-style hall (comb + allpass network), used by LO-1 and the Apex tier later
  LO.reverb = function (inL, inR, size, damp) {
    const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(x => Math.round(x * LO.SR / 44100));
    const apT = [556, 441, 341, 225].map(x => Math.round(x * LO.SR / 44100));
    const fb = 0.7 + 0.28 * size, d = damp, d1 = 1 - damp;
    const run = (inp, spread) => {
      const n = inp.length, out = new Float32Array(n), x = new Float32Array(n);
      for (let k = 0; k < n; k++) x[k] = inp[k] * 0.015;
      // one tight loop per filter: much faster than juggling all filters per sample
      for (const t of combT) {
        const len = t + spread, buf = new Float32Array(len); let i = 0, f = 0;
        for (let k = 0; k < n; k++) {
          const y = buf[i]; f = y * d1 + f * d; buf[i] = x[k] + f * fb;
          if (++i >= len) i = 0; out[k] += y;
        }
      }
      for (const t of apT) {
        const len = t + spread, buf = new Float32Array(len); let i = 0;
        for (let k = 0; k < n; k++) {
          const bo = buf[i], a = out[k]; out[k] = bo - a; buf[i] = a + bo * 0.5;
          if (++i >= len) i = 0;
        }
      }
      return out;
    };
    return [run(inL, 0), run(inR, 23)];
  };

  // Ping-pong echo with a darkening feedback path
  LO.pingPong = function (inL, inR, delaySamples, feedback, tone) {
    const n = inL.length, d = Math.max(1, delaySamples | 0);
    const bL = new Float32Array(d), bR = new Float32Array(d);
    const oL = new Float32Array(n), oR = new Float32Array(n);
    const fl = new LO.OnePole('lp', tone, LO.SR), fr = new LO.OnePole('lp', tone, LO.SR);
    let i = 0;
    for (let k = 0; k < n; k++) {
      const yL = bL[i], yR = bR[i];
      oL[k] = yL; oR[k] = yR;
      bL[i] = inL[k] + fl.run(yR) * feedback;
      bR[i] = inR[k] + fr.run(yL) * feedback;
      if (++i >= d) i = 0;
    }
    return [oL, oR];
  };

  // Master stage (ported idea from the LowOrbit DSP chain): DC block, glue, loudness, safe limiter
  LO.master = function (L, R, on) {
    const n = L.length;
    const hl = new LO.Biquad('hp', 22, 0.7), hr = new LO.Biquad('hp', 22, 0.7);
    for (let i = 0; i < n; i++) { L[i] = hl.run(L[i]); R[i] = hr.run(R[i]); }
    let peak = 1e-9, ss = 0;
    for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; ss += L[i] * L[i] + R[i] * R[i]; }
    const rms = Math.sqrt(ss / (2 * n)) + 1e-9;
    if (!on) { const g = 0.89 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } return { peak, rms }; }
    // gentle glue: slow RMS compressor, 2:1 above the average level
    const target = 0.16;
    let g0 = Math.min(target / rms, 1.12 / peak); // never shove the mix more than ~1 dB into the limiter
    let env = 0; const att = Math.exp(-1 / (0.01 * LO.SR)), rel = Math.exp(-1 / (0.25 * LO.SR));
    const thr = rms * g0 * 1.4;
    for (let i = 0; i < n; i++) {
      const x = Math.max(Math.abs(L[i]), Math.abs(R[i])) * g0;
      env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
      const gr = env > thr ? Math.pow(thr / env, 0.5) : 1;
      L[i] *= g0 * gr; R[i] *= g0 * gr;
    }
    const lim = LO.limit(L, R, 0.89);
    return { peak, rms, limitDb: lim.maxGrDb };
  };

  // PRODUCTION RULE: never clip, never waveshape the whole mix. A transparent look-ahead peak limiter:
  // it sees each peak 1.5 ms early and turns the level down smoothly, so the waveform is never flattened.
  LO.limit = function (L, R, ceil) {
    const n = L.length, la = Math.round(0.0015 * LO.SR), relK = Math.exp(-1 / (0.08 * LO.SR));
    const req = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); req[i] = a > ceil ? ceil / a : 1; }
    // m[i] = min(req[i-la .. i]) (sliding minimum), then G = box average of m over la+1 samples
    const m = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0;
    for (let i = 0; i < n; i++) {
      while (t > h && req[dq[t - 1]] >= req[i]) t--;
      dq[t++] = i; if (dq[h] < i - la) h++;
      m[i] = req[dq[h]];
    }
    let sum = 0, gs = 1, maxGr = 1; const outL = new Float32Array(n), outR = new Float32Array(n);
    for (let i = 0; i < n + la; i++) {
      const mi = i < n ? m[i] : 1; sum += mi; if (i - la - 1 >= 0) sum -= (i - la - 1 < n ? m[i - la - 1] : 1);
      const G = sum / Math.min(i + 1, la + 1);
      gs = G < gs ? G : gs * relK + G * (1 - relK);
      const p = i - la; if (p < 0) continue;
      if (gs < maxGr) maxGr = gs;
      outL[p] = L[p] * gs; outR[p] = R[p] * gs;
    }
    for (let i = 0; i < n; i++) { L[i] = Math.max(-ceil, Math.min(ceil, outL[i])); R[i] = Math.max(-ceil, Math.min(ceil, outR[i])); }
    return { maxGrDb: 20 * Math.log10(maxGr) };
  };

  // Generic channel-state helpers
  LO.audible = function (chState, i) {
    const anySolo = chState.some(c => c.solo);
    const c = chState[i];
    return !c.mute && (!anySolo || c.solo);
  };
})(typeof self !== 'undefined' ? self : globalThis);
