/* LowOrbit Chip Studio - shared Yamaha OPN-family FM core (YM2612 / YM2610), plus the PSG/SSG square chips
   and the Yamaha ADPCM codecs. Built from the documented behavior:
   - 4 operators per channel, 8 algorithms, feedback on operator 1 (SOLID)
   - envelope: attack, first decay, sustain level, second decay, release; total level in 0.75 dB steps (SOLID)
   - operator multipliers 0.5, 1..15 plus small detune (SOLID); no velocity on the chip, drivers lower the carrier level (SOLID)
   - envelope rate-to-time curve (ESTIMATED: each +2 of rate roughly halves the time)
   - SN76489: 3 squares + noise, 4-bit attenuation in 2 dB steps (SOLID)
   - AY/YM SSG: 3 squares, shared noise, 16-step log volume (SOLID)
   - ADPCM-A: 4-bit OKI-style codec at a fixed 18.5 kHz; ADPCM-B: Yamaha delta-T codec, variable rate (SOLID) */
(function (G) {
  const LO = G.LO, SR = LO.SR;
  const TBL = 4096, MASK = TBL - 1, SIN = new Float32Array(TBL);
  for (let i = 0; i < TBL; i++) SIN[i] = Math.sin(2 * Math.PI * i / TBL);
  const FB = [0, Math.PI / 16, Math.PI / 8, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI].map(r => r * TBL / (2 * Math.PI));
  const MODK = TBL * 0.62;
  const decayT = r => (r <= 0 ? Infinity : 120 * Math.pow(2, -(2 * r - 4) / 4));
  const DB2A = new Float32Array(1024); for (let i = 0; i < 1024; i++) DB2A[i] = Math.pow(10, -(i / 8) / 20); // 1/8 dB resolution, 0..128 dB
  const amp = db => (db >= 127.9 ? 0 : DB2A[(db * 8) | 0]);
  const CARRIERS = [[3], [3], [3], [3], [1, 3], [1, 2, 3], [1, 2, 3], [0, 1, 2, 3]];

  // render one monophonic FM channel; events: [{s, e, m, v, slide}] in samples
  LO.fmVoice = function (events, total, patch, opt) {
    opt = opt || {};
    const out = new Float32Array(total);
    const ops = patch.ops, alg = patch.alg, fb = FB[patch.fb || 0], car = CARRIERS[alg];
    const st = ops.map(o => ({ ph: 0, att: 128, stage: 4, y: 0 }));
    const rates = ops.map(o => ({
      a: o.ar >= 31 ? 1e9 : 128 / Math.max(1, decayT(o.ar) * 0.22 * SR),
      d1: 96 / Math.max(1, decayT(o.d1r) * SR), d2: 96 / Math.max(1, decayT(o.d2r) * SR),
      r: 96 / Math.max(1, decayT(o.rr * 2 + 1) * SR), sl: o.sl >= 15 ? 93 : o.sl * 3,
    }));
    let f1a = 0, f1b = 0, ei = -1, inc = [0, 0, 0, 0], tgtInc = null, vtl = [0, 0, 0, 0], cur = null, onS = 0;
    const lfoInc = 5.6 / SR, vib = opt.vib || 0, vibDelay = Math.round((opt.vibDelay || 0.25) * SR);
    let lfo = 0;
    const setPitch = (m, glide) => {
      const f = LO.m2f(m);
      const n = ops.map(o => f * (o.mul === 0 ? 0.5 : o.mul) * (1 + (o.dt || 0) * 0.0009) * TBL / SR);
      if (glide) tgtInc = n; else { inc = n; tgtInc = null; }
    };
    const keyOn = ev => {
      const legato = ev.slide && cur && st[3].stage < 3 && cur.e >= ev.s - 1;
      if (!legato) for (let k = 0; k < 4; k++) { st[k].stage = 0; st[k].ph = 0; }
      for (const k of car) vtl[k] = (1 - LO.clamp(ev.v == null ? 1 : ev.v, 0, 1)) * 20;
      setPitch(ev.m, ev.slide && cur); cur = ev; onS = ev.s;
    };
    const keyOff = () => { for (let k = 0; k < 4; k++) if (st[k].stage < 3) st[k].stage = 3; };
    let next = events.length ? events[0].s : Infinity, nextOff = Infinity;
    for (let i = 0; i < total; i++) {
      if (i === nextOff) { keyOff(); nextOff = Infinity; }
      if (i >= next) { ei++; const ev = events[ei]; keyOn(ev); nextOff = ev.e; next = ei + 1 < events.length ? events[ei + 1].s : Infinity; if (nextOff === next) nextOff = Infinity; }
      if (tgtInc) { for (let k = 0; k < 4; k++) inc[k] += (tgtInc[k] - inc[k]) * 0.0016; }
      let vm = 1;
      if (vib && i - onS > vibDelay) { lfo += lfoInc; vm = 1 + vib * Math.sin(2 * Math.PI * lfo); }
      // envelopes
      for (let k = 0; k < 4; k++) {
        const s = st[k], r = rates[k];
        if (s.stage === 0) { s.att -= r.a; if (s.att <= 0) { s.att = 0; s.stage = 1; } }
        else if (s.stage === 1) { s.att += r.d1; if (s.att >= r.sl) { s.att = r.sl; s.stage = 2; } }
        else if (s.stage === 2) { s.att += r.d2; if (s.att > 128) s.att = 128; }
        else if (s.stage === 3) { s.att += r.r; if (s.att >= 128) { s.att = 128; s.stage = 4; } }
      }
      if (st[0].stage === 4 && st[1].stage === 4 && st[2].stage === 4 && st[3].stage === 4) continue;
      const a0 = amp(st[0].att + ops[0].tl * 0.75 + vtl[0]), a1 = amp(st[1].att + ops[1].tl * 0.75 + vtl[1]);
      const a2 = amp(st[2].att + ops[2].tl * 0.75 + vtl[2]), a3 = amp(st[3].att + ops[3].tl * 0.75 + vtl[3]);
      const p0 = (st[0].ph += inc[0] * vm), p1 = (st[1].ph += inc[1] * vm), p2 = (st[2].ph += inc[2] * vm), p3 = (st[3].ph += inc[3] * vm);
      const o0 = SIN[((p0 + (f1a + f1b) * 0.5 * fb) | 0) & MASK] * a0; f1b = f1a; f1a = o0;
      let o1, o2, o3, y;
      switch (alg) {
        case 0: o1 = SIN[((p1 + o0 * MODK) | 0) & MASK] * a1; o2 = SIN[((p2 + o1 * MODK) | 0) & MASK] * a2; o3 = SIN[((p3 + o2 * MODK) | 0) & MASK] * a3; y = o3; break;
        case 1: o1 = SIN[(p1 | 0) & MASK] * a1; o2 = SIN[((p2 + (o0 + o1) * MODK) | 0) & MASK] * a2; o3 = SIN[((p3 + o2 * MODK) | 0) & MASK] * a3; y = o3; break;
        case 2: o1 = SIN[(p1 | 0) & MASK] * a1; o2 = SIN[((p2 + o1 * MODK) | 0) & MASK] * a2; o3 = SIN[((p3 + (o0 + o2) * MODK) | 0) & MASK] * a3; y = o3; break;
        case 3: o1 = SIN[((p1 + o0 * MODK) | 0) & MASK] * a1; o2 = SIN[(p2 | 0) & MASK] * a2; o3 = SIN[((p3 + (o1 + o2) * MODK) | 0) & MASK] * a3; y = o3; break;
        case 4: o1 = SIN[((p1 + o0 * MODK) | 0) & MASK] * a1; o2 = SIN[(p2 | 0) & MASK] * a2; o3 = SIN[((p3 + o2 * MODK) | 0) & MASK] * a3; y = (o1 + o3) * 0.6; break;
        case 5: { const mo = o0 * MODK; o1 = SIN[((p1 + mo) | 0) & MASK] * a1; o2 = SIN[((p2 + mo) | 0) & MASK] * a2; o3 = SIN[((p3 + mo) | 0) & MASK] * a3; y = (o1 + o2 + o3) * 0.42; break; }
        case 6: o1 = SIN[((p1 + o0 * MODK) | 0) & MASK] * a1; o2 = SIN[(p2 | 0) & MASK] * a2; o3 = SIN[(p3 | 0) & MASK] * a3; y = (o1 + o2 + o3) * 0.42; break;
        default: o1 = SIN[(p1 | 0) & MASK] * a1; o2 = SIN[(p2 | 0) & MASK] * a2; o3 = SIN[(p3 | 0) & MASK] * a3; y = (o0 + o1 + o2 + o3) * 0.32; break;
      }
      out[i] = y;
      if (p0 > 1e9) { for (let k = 0; k < 4; k++) st[k].ph %= TBL; }
    }
    return out;
  };

  const O = (mul, tl, ar, d1r, d2r, rr, sl, dt) => ({ mul, tl, ar, d1r, d2r, rr, sl, dt: dt || 0 });
  // An original FM instrument library (our own patches, written from FM theory, not copied from any game)
  LO.FM_PATCHES = {
    'FM BRASS':   { alg: 4, fb: 5, ops: [O(1, 30, 16, 5, 1, 7, 3), O(1, 2, 18, 4, 2, 8, 2), O(1, 32, 15, 6, 1, 7, 3, 2), O(1, 6, 18, 4, 2, 8, 2, -2)], role: ['lead', 'counter', 'pad'] },
    'SYNTH LEAD': { alg: 4, fb: 6, ops: [O(1, 24, 31, 3, 0, 8, 2), O(1, 2, 31, 2, 1, 9, 1), O(2, 34, 31, 5, 0, 8, 3, 3), O(1, 8, 31, 2, 1, 9, 1, -3)], role: ['lead', 'counter'] },
    'HOLLOW LEAD':{ alg: 4, fb: 3, ops: [O(2, 30, 31, 4, 0, 8, 2), O(1, 3, 28, 3, 1, 8, 1), O(3, 42, 31, 6, 0, 8, 4), O(1, 10, 28, 3, 1, 8, 2)], role: ['lead', 'counter', 'arp'] },
    'E.PIANO':    { alg: 4, fb: 0, ops: [O(14, 46, 31, 14, 6, 8, 10), O(1, 4, 31, 6, 3, 7, 4), O(1, 36, 31, 8, 3, 7, 6), O(1, 8, 31, 5, 2, 7, 4, 2)], role: ['pad', 'counter', 'arp'] },
    'BELL':       { alg: 4, fb: 2, ops: [O(7, 34, 31, 8, 4, 6, 8, 3), O(2, 6, 31, 5, 2, 5, 6), O(5, 40, 31, 9, 4, 6, 9), O(1, 10, 31, 6, 3, 5, 6)], role: ['arp', 'counter', 'lead'] },
    'ORGAN':      { alg: 7, fb: 4, ops: [O(1, 6, 31, 0, 0, 10, 0), O(2, 12, 31, 0, 0, 10, 0), O(4, 22, 31, 0, 0, 10, 0), O(8, 32, 31, 0, 0, 10, 0)], role: ['pad', 'lead'] },
    'STRINGS':    { alg: 4, fb: 3, ops: [O(1, 40, 13, 2, 0, 6, 2, 2), O(1, 10, 12, 2, 1, 6, 2), O(2, 46, 13, 2, 0, 6, 3, -2), O(1, 12, 12, 2, 1, 6, 2, 3)], role: ['pad', 'counter'] },
    'SOFT PAD':   { alg: 5, fb: 2, ops: [O(1, 44, 12, 2, 0, 6, 3), O(1, 14, 11, 2, 1, 6, 2), O(2, 22, 11, 2, 1, 6, 3, 3), O(1, 16, 11, 2, 1, 6, 2, -3)], role: ['pad'] },
    'PLUCK':      { alg: 4, fb: 4, ops: [O(1, 26, 31, 16, 8, 9, 10), O(1, 4, 31, 9, 6, 9, 8), O(3, 38, 31, 18, 8, 9, 12), O(1, 10, 31, 9, 6, 9, 8)], role: ['arp', 'counter', 'lead'] },
    'SLAP BASS':  { alg: 0, fb: 6, ops: [O(1, 30, 31, 14, 6, 10, 6), O(3, 40, 31, 18, 8, 10, 9), O(1, 24, 31, 10, 4, 10, 4), O(1, 0, 31, 6, 3, 9, 2)], role: ['bass'] },
    'FM BASS':    { alg: 4, fb: 5, ops: [O(0, 22, 31, 10, 3, 9, 4), O(1, 0, 31, 5, 2, 9, 2), O(1, 34, 31, 12, 4, 9, 6), O(0, 6, 31, 5, 2, 9, 2)], role: ['bass'] },
    'GROWL BASS': { alg: 1, fb: 7, ops: [O(1, 28, 31, 6, 1, 9, 3), O(2, 36, 31, 8, 2, 9, 4), O(1, 22, 31, 4, 1, 9, 2), O(1, 0, 31, 3, 1, 9, 1)], role: ['bass'] },
    'SUB BASS':   { alg: 4, fb: 1, ops: [O(1, 46, 31, 6, 2, 9, 4), O(1, 0, 31, 3, 1, 9, 1), O(2, 60, 31, 8, 2, 9, 6), O(1, 6, 31, 3, 1, 9, 1)], role: ['bass'] },
    'MARIMBA':    { alg: 4, fb: 0, ops: [O(4, 34, 31, 18, 10, 9, 14), O(1, 4, 31, 10, 7, 8, 10), O(10, 48, 31, 20, 12, 9, 15), O(1, 12, 31, 11, 7, 8, 10)], role: ['arp', 'counter'] },
    'ORCH HIT':   { alg: 5, fb: 6, ops: [O(1, 18, 31, 12, 6, 7, 6), O(1, 4, 31, 8, 4, 8, 5), O(2, 8, 31, 9, 5, 8, 6, 3), O(3, 10, 31, 10, 6, 8, 6, -3)], role: ['counter'] },
  };

  // SN76489 / AY-style square channel with a 60 Hz driver volume envelope (attenuation steps)
  LO.psgVoice = function (events, total, opt) {
    const out = new Float32Array(total), clock = opt.clock || 3579545, div = opt.div || 32, steps = opt.dbStep || 2;
    const FR = SR / 60; let ph = 0;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e], end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + Math.round(FR * (opt.rel || 3)));
      const gateK = Math.floor((ev.e - ev.s) / FR);
      const N = Math.max(1, Math.min(opt.maxN || 1023, Math.round(clock / (div * LO.m2f(ev.m)))));
      const f = clock / (div * N), incr = f / SR;
      for (let i = ev.s; i < end; i++) {
        const k = Math.floor((i - ev.s) / FR);
        let lvl = (ev.v == null ? 1 : ev.v) * (opt.sus + (1 - opt.sus) * Math.exp(-k / (opt.decay || 8)));
        if (k >= gateK) lvl *= Math.max(0, 1 - (k - gateK) / (opt.rel || 3));
        const att = Math.round(LO.clamp(-20 * Math.log10(Math.max(1e-4, lvl)) / steps, 0, 15));
        if (att >= 15) { out[i] = 0; continue; }
        ph += ev.arp ? incr * Math.pow(2, ev.arp[k % ev.arp.length] / 12) : incr;
        out[i] = ((ph % 1) < 0.5 ? 1 : -1) * Math.pow(10, -att * steps / 20);
      }
    }
    return out;
  };
  // noise channel: 'hat' short white, 'ohat' long white, 'snare', 'metal' = periodic
  LO.psgNoise = function (hits, total, opt) {
    const out = new Float32Array(total); const FR = SR / 60; let lfsr = 0x4000;
    const INS = { hat: { f: 3, rate: 0.5 }, ohat: { f: 12, rate: 0.5 }, snare: { f: 9, rate: 0.25 }, clap: { f: 8, rate: 0.25 }, rim: { f: 3, rate: 0.12, metal: true }, crash: { f: 40, rate: 0.5 }, kick: { f: 4, rate: 0.06 }, tom: { f: 6, rate: 0.1 }, timp: { f: 10, rate: 0.06 } };
    let acc = 0;
    for (let h = 0; h < hits.length; h++) {
      const ht = hits[h], ins = INS[ht.kind] || INS.snare, end = Math.min(total, h + 1 < hits.length ? hits[h + 1].s : ht.s + Math.round(FR * (ins.f + 2)));
      for (let i = ht.s; i < end; i++) {
        const k = Math.floor((i - ht.s) / FR), lvl = (ht.v || 1) * Math.max(0, 1 - k / ins.f);
        const att = Math.round(LO.clamp(-20 * Math.log10(Math.max(1e-4, lvl)) / 2, 0, 15)); if (att >= 15) { out[i] = 0; continue; }
        acc += ins.rate; while (acc >= 1) { acc -= 1; const bit = ins.metal ? (lfsr & 1) : ((lfsr ^ (lfsr >> 3)) & 1); lfsr = (lfsr >> 1) | (bit << 14); }
        out[i] = ((lfsr & 1) ? 1 : -1) * Math.pow(10, -att * 2 / 20);
      }
    }
    return out;
  };

  // ---- Yamaha ADPCM codecs (real round trip: the sound you hear went through 4 bits per sample)
  const OKI_STEP = [16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552];
  const OKI_ADJ = [-1, -1, -1, -1, 2, 4, 6, 8];
  LO.adpcmA = function (src) { // 12-bit ADPCM-A round trip
    const out = new Float32Array(src.length); let pred = 0, idx = 0;
    for (let i = 0; i < src.length; i++) {
      const target = LO.clamp(Math.round(src[i] * 2047), -2048, 2047), step = OKI_STEP[idx];
      let diff = target - pred, code = 0; if (diff < 0) { code = 8; diff = -diff; }
      let q = 0; if (diff >= step) { q |= 4; diff -= step; } if (diff >= step >> 1) { q |= 2; diff -= step >> 1; } if (diff >= step >> 2) q |= 1;
      code |= q;
      let d = step >> 3; if (q & 4) d += step; if (q & 2) d += step >> 1; if (q & 1) d += step >> 2;
      pred = LO.clamp(pred + (code & 8 ? -d : d), -2048, 2047); idx = LO.clamp(idx + OKI_ADJ[q], 0, 48);
      out[i] = pred / 2048;
    }
    return out;
  };
  const DT_MUL = [57, 57, 57, 57, 77, 102, 128, 153];
  LO.adpcmB = function (src) { // 16-bit delta-T round trip
    const out = new Float32Array(src.length); let x = 0, step = 127;
    for (let i = 0; i < src.length; i++) {
      const target = LO.clamp(Math.round(src[i] * 32767), -32768, 32767);
      let diff = target - x, sign = 0; if (diff < 0) { sign = 8; diff = -diff; }
      const mag = LO.clamp(Math.floor(diff * 4 / step), 0, 7);
      const d = ((2 * mag + 1) * step) >> 3;
      x = LO.clamp(x + (sign ? -d : d), -32768, 32767); step = LO.clamp((step * DT_MUL[mag]) >> 6, 127, 24576);
      out[i] = x / 32768;
    }
    return out;
  };
  // resample a mono sample at a new rate (linear, like a cheap DAC path)
  LO.resample = function (src, fromRate, toRate) {
    const n = Math.floor(src.length * toRate / fromRate), out = new Float32Array(n), r = fromRate / toRate;
    for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; out[i] = src[k] * (1 - f) + (src[Math.min(src.length - 1, k + 1)] || 0) * f; }
    return out;
  };
  // play one-shot samples on a channel (each new hit cuts the last, like a single DAC/ADPCM channel)
  LO.sampleHits = function (hits, total, bank, gain) {
    const out = new Float32Array(total);
    for (let h = 0; h < hits.length; h++) {
      const ht = hits[h], s = bank[ht.kind]; if (!s) continue;
      const end = Math.min(total, h + 1 < hits.length ? hits[h + 1].s : total, ht.s + s.length), g = (ht.v == null ? 1 : ht.v) * (gain || 1);
      for (let i = ht.s; i < end; i++) out[i] = s[i - ht.s] * g;
    }
    return out;
  };
  // the patch picker: different songs get different instruments, the same song always gets the same ones
  LO.pickPatch = function (R, role, prefer) {
    const list = Object.keys(LO.FM_PATCHES).filter(k => LO.FM_PATCHES[k].role.includes(role));
    const pref = (prefer || []).filter(k => list.includes(k));
    return pref.length && R.chance(0.7) ? R.pick(pref) : R.pick(list);
  };
})(typeof self !== 'undefined' ? self : globalThis);
