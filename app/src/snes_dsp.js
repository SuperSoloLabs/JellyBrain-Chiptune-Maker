/* LowOrbit Chip Studio - the EXACT S-DSP (v0.7.2, Jelly Brain): the console's own integer arithmetic.
   SOLID sources (community hardware documentation):
   - the 512-entry Gaussian interpolation table, regenerated with the published formula that matches the hardware table
     exactly (nesdev "Gauss Table Creation", Mednafen generator), taps table[255-x], table[511-x], table[256+x], table[x];
   - voice output = (interpolated * envelope) >> 11, the echo buffer at 15 bits, the 8-tap FIR in 1.7 fixed point with its
     16-bit wrap on the first 7 taps and a clamp on the last (SnesLab "FIR Filter");
   - envelopes: 11-bit, the period table, ADSR and GAIN steps, release -8 per sample (snes.nesdev.org "DSP envelopes");
   - Nintendo's N-SPC driver: 48 ticks per beat, the note-length (gate) table 20..100%, the velocity table 8..179 whose
     volume is then squared, the 21-step pan table, the FIR presets (wiki.superfamicom.org "Super Mario World Music
     Format", loveemu's N-SPC volume calculation).
   ESTIMATED: the analog output stage (forum reports say it barely colors the sound: a gentle roll-off is modeled). */
(function (G) {
  const LO = G.LO;
  // ---- the Gaussian table (512 entries, 0 .. 1305)
  const GT = (() => {
    const N = 1024, c = new Float64Array(N), fs = 0.16 / 256, a = 0.50, b = 0.08;
    for (let i = 0; i < 512; i++) {
      const k = 0.5 + i, ck = Math.sin(2 * Math.PI * k * fs) / k, wk = (1 - (a + b)) + a * Math.cos(2 * Math.PI * k / 1023) + b * Math.cos(4 * Math.PI * k / 1023);
      c[512 + i] = c[511 - i] = ck * wk;
    }
    let s = 0; for (const v of c) s += v; const g = 2048 * 256 / s;
    const t = new Int32Array(512); for (let i = 0; i < 512; i++) t[i] = Math.floor(0.5 + c[512 + i] * g);
    return t.reverse();   // ascending 0 .. peak, as the hardware table runs
  })();
  const RATE = [0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];
  const c16 = x => x > 32767 ? 32767 : x < -32768 ? -32768 : x;
  const w16 = x => ((x + 32768) & 0xFFFF) - 32768;
  // ---- N-SPC driver tables
  const VEL = [8, 18, 27, 36, 44, 53, 62, 71, 81, 90, 98, 107, 125, 143, 161, 179];
  const PAN = [0, 1, 3, 7, 13, 21, 30, 41, 52, 66, 81, 94, 103, 110, 115, 119, 122, 124, 125, 126, 127];
  const GATE = [0.20, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
  // a note's velocity (0..1) to the driver's 0..15 index, and the register volume it gives (squared, as N-SPC does)
  const velIdx = v => Math.max(0, Math.min(15, Math.round(15 + ((v == null ? 1 : v) - 1) * 12)));
  const velReg = idx => { let f = Math.floor(255 * VEL[idx] / 256); f = Math.floor(f * 255 / 256); f = Math.floor(f * 230 / 256); return Math.floor(f * f / 256); };
  const VREG = VEL.map((_, i) => velReg(i)), VTOP = VREG[15];
  // pan -1 (left) .. +1 (right) to the driver's 0..20 index (20 = full left) and its two volume rates
  const panRates = p => { const i = Math.max(0, Math.min(20, Math.round(10 - p * 10))); return [PAN[i], PAN[20 - i]]; };

  // ---- one voice, sample by sample, in the chip's integer arithmetic. Returns the voice output (16-bit integers as numbers).
  // opt: { pmod: the previous voice's output (pitch modulation), noise: true for the noise voice, vibrato depth, gate }
  function renderVoice(events, total, bank, role, opt) {
    opt = opt || {};
    const out = new Float32Array(total), isNoise = !!opt.noise, pm = opt.pmod || null;
    const ADSR = opt.adsrTable;
    let noise = 0x4000;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const end = Math.min(total, e + 1 < events.length ? events[e + 1].s : ev.e + 2400);
      const kind = role === 'drum' ? ev.kind : role;
      const inst = isNoise ? null : ev.inst && bank.inst[ev.inst] ? bank.inst[ev.inst] : bank.inst[role === 'drum' ? (bank.inst[ev.kind] ? ev.kind : 'snare') : role];
      if (!isNoise && !inst) continue;
      let [AR, DR, SL, SR] = ev.adsr || (isNoise ? ADSR[ev.kind === 'ohat' ? 'ohat' : 'hat'] : role === 'drum' ? (inst.adsr || ADSR.drum) : (inst.adsr || ADSR[role]));
      if (opt.ar != null && !ev.adsr) AR = Math.min(AR, opt.ar);   // a softer attack for this voice (the sheet's SOFT toolkit)
      const vq = VREG[velIdx(ev.v)];                          // the driver's per-note volume (0 .. ~98)
      let gainMode = ev.gain || null;                         // GAIN: { mode: 'bent'|'lin'|'linDown'|'exp'|'direct', rate, value }
      const gseq = ev.gseq || null; let gi = 0;               // software GAIN writes over the note: [{ t, mode, rate, value }]
      const nrate = ev.nrate || 31;                           // noise clock (FLG low 5 bits)
      let env = gainMode && gainMode.mode !== 'linDown' && gainMode.mode !== 'exp' ? 0 : 0, phase = 'a', cnt = 0, idx = 0, pos = 0, ncnt = 0;
      if (gainMode && (gainMode.mode === 'linDown' || gainMode.mode === 'exp')) env = 0x7FF;
      if (gainMode && gainMode.mode === 'direct') env = gainMode.value & 0x7FF;
      const h = [0, 0, 0, 0];
      const vibD = opt.vib && inst && inst.vib !== false ? opt.vib : 0;
      const vibStart = Math.min(Math.round(LO.SR * 0.25), Math.round((ev.e - ev.s) / 3));
      let gEnd = ev.e;
      const amp = opt.amp != null ? opt.amp : vq / VTOP;
      for (let i = ev.s; i < end; i++) {
        const t = i - ev.s, k = Math.floor(t / (LO.SR / 60));
        if (gseq && gi < gseq.length && t >= gseq[gi].t) { gainMode = gseq[gi]; if (gainMode.mode === 'direct') env = gainMode.value & 0x7FF; gi++; }
        let pitch = 0;
        if (!isNoise) {
          let ratio;
          if (inst.baseF) {
            let m = ev.m;
            if (ev.arp) m += ev.arp[k % ev.arp.length];
            if (ev.det) m += ev.det;                                                           // a detuned double (a few cents)
            if (ev.slide && ev.prevM != null && k < 6) m = ev.prevM + (ev.m - ev.prevM) * (k / 6);
            if (ev.scoop && t < 1600) m += ev.scoop * (1 - t / 1600);                         // N-SPC pitch envelope: a little scoop into the note
            if (vibD && t > vibStart) m += vibD * Math.min(1, (t - vibStart) / 4000) * Math.sin(2 * Math.PI * (t - vibStart) / 5333);   // delayed vibrato, ~6 Hz
            ratio = (LO.m2f(m) / inst.baseF) * (inst.rate / 32000);
          } else ratio = (inst.rate / 32000) * ((kind === 'tom' || kind === 'timp') ? Math.pow(2, ((ev.m || 47) - 47) / 12) : kind === 'impact' ? Math.pow(2, -15 / 12) : 1);
          pitch = Math.min(0x3FFF, Math.max(1, Math.round(ratio * 0x1000)));
          if (pm) pitch = Math.max(0, Math.min(0x3FFF, pitch + (((pm[i] >> 5) * pitch) >> 10)));   // pitch modulation from the voice below
        }
        // envelope: ADSR or GAIN, with the hardware period table; key-off releases by 8 every sample
        if (i >= gEnd) { env -= 8; if (env < 0) env = 0; }
        else if (gainMode) {
          const per = RATE[gainMode.rate || 20];
          if (gainMode.mode !== 'direct' && per && ++cnt >= per) { cnt = 0;
            if (gainMode.mode === 'lin') env += 32; else if (gainMode.mode === 'bent') env += env < 0x600 ? 32 : 8;
            else if (gainMode.mode === 'linDown') env -= 32; else env -= ((env - 1) >> 8) + 1;
            env = env < 0 ? 0 : env > 0x7FF ? 0x7FF : env; }
        } else {
          const ri = phase === 'a' ? AR * 2 + 1 : phase === 'd' ? DR * 2 + 16 : SR, per = RATE[ri];
          if (per && ++cnt >= per) {
            cnt = 0;
            if (phase === 'a') { env += AR === 15 ? 1024 : 32; if (env >= 0x7FF) { env = 0x7FF; phase = 'd'; } }
            else if (phase === 'd') { env -= ((env - 1) >> 8) + 1; if (env <= (SL + 1) * 0x100) phase = 's'; }
            else { env -= ((env - 1) >> 8) + 1; if (env < 0) env = 0; }
          }
        }
        let s;
        if (isNoise) {
          const per = RATE[nrate]; if (per && ++ncnt >= per) { ncnt = 0; const fb = ((noise << 13) ^ (noise << 14)) & 0x4000; noise = (noise >> 1) | fb; }
          s = ((noise << 17) >> 16) & ~1;
        } else {
          pos += pitch;
          while (pos >= 0x1000) {
            pos -= 0x1000; idx++;
            if (idx >= inst.pcm.length) { if (inst.loop != null) idx = inst.loop; else { idx = -1; break; } }
            h[0] = h[1]; h[1] = h[2]; h[2] = h[3]; h[3] = inst.pcm[idx];
          }
          if (idx < 0) { out[i] = 0; continue; }
          // the hardware Gaussian: four taps from the 512-entry table, integer, with the 16-bit wrap and the final clamp
          const x = (pos >> 4) & 0xFF;
          let o = ((GT[255 - x] * h[0]) >> 11) + ((GT[511 - x] * h[1]) >> 11) + ((GT[256 + x] * h[2]) >> 11);
          o = w16(o); o += (GT[x] * h[3]) >> 11; s = c16(o) & ~1;
        }
        // voice output: times the envelope (11 bits), then the driver's note volume (as its VOL register would)
        let o2 = ((s * env) >> 11) & ~1;
        out[i] = o2 * amp;
      }
    }
    return out;
  }

  // ---- the mixer and the echo unit, in the chip's integer arithmetic. vols: 8 x [L, R] signed 8-bit; eon: 8 booleans
  function mix(raw, total, vols, eon, ech) {
    const L = new Float32Array(total), R = new Float32Array(total);
    const dl = Math.max(1, ech.edl * 512), bufL = new Int16Array(dl), bufR = new Int16Array(dl);
    const fir = ech.fir, hL = new Int32Array(8), hR = new Int32Array(8);
    const efb = Math.max(-128, Math.min(127, Math.round(ech.efb * 127)));
    // MVOL and EVOL are signed 8-bit per side: a negative side inverts the phase (wide echo, surround tricks)
    const sv = v => Math.max(-128, Math.min(127, Math.round(v * 127)));
    const dry = ech.dry == null ? 1 : ech.dry, mvL = sv(ech.mvol ? ech.mvol[0] * dry : dry), mvR = sv(ech.mvol ? ech.mvol[1] * dry : dry);
    const evL = sv(ech.evolLR ? ech.evolLR[0] : ech.evol), evR = sv(ech.evolLR ? ech.evolLR[1] : ech.evol);
    const write = !ech.noWrite;                             // FLG bit 5: echo writes off (the buffer becomes a looping wavetable)
    if (ech.seed) { bufL.set(ech.seed[0].subarray(0, dl)); bufR.set((ech.seed[1] || ech.seed[0]).subarray(0, dl)); }
    let p = 0;
    for (let i = 0; i < total; i++) {
      let ml = 0, mr = 0, el = 0, er = 0;
      for (let v = 0; v < raw.length; v++) {
        const s = raw[v][i] | 0; if (!s) continue;
        const a = (s * vols[v][0]) >> 7, b = (s * vols[v][1]) >> 7;
        ml = c16(ml + a); mr = c16(mr + b); if (eon[v]) { el = c16(el + a); er = c16(er + b); }
      }
      // echo: read the buffer (15 bits), the FIR (first 7 taps wrap at 16 bits, the newest is clamped), feedback, write back
      for (let k = 0; k < 7; k++) { hL[k] = hL[k + 1]; hR[k] = hR[k + 1]; }
      hL[7] = bufL[p] >> 1; hR[7] = bufR[p] >> 1;
      let fl = 0, fr = 0; for (let k = 0; k < 7; k++) { fl += (fir[k] * hL[k]) >> 6; fr += (fir[k] * hR[k]) >> 6; }
      fl = w16(fl); fr = w16(fr); fl = c16(fl + ((fir[7] * hL[7]) >> 6)) & ~1; fr = c16(fr + ((fir[7] * hR[7]) >> 6)) & ~1;
      if (write) { bufL[p] = c16(el + ((fl * efb) >> 7)) & ~1; bufR[p] = c16(er + ((fr * efb) >> 7)) & ~1; }
      if (++p >= dl) p = 0;
      L[i] = c16(((ml * mvL) >> 7) + ((fl * evL) >> 7)) / 32768;
      R[i] = c16(((mr * mvR) >> 7) + ((fr * evR) >> 7)) / 32768;
    }
    return { L, R };
  }
  // ---- the analog side (ESTIMATED: board revisions differ): the DAC, then a 2-pole active low-pass around 13 kHz on the
  // early boards (Sallen-Key), then the output coupling (DC block). The Gaussian has already darkened the top before this.
  function analog(L, R) {
    const hp = Math.exp(-2 * Math.PI * 8 / LO.SR);
    for (const x of [L, R]) { const lp = new LO.Biquad('lp', 13000, 0.7071, LO.SR); let d = 0, xp = 0; for (let i = 0; i < x.length; i++) { const y = lp.run(x[i]); const z = hp * (d + y - xp); xp = y; d = z; x[i] = z; } }
  }
  // build check: an FIR whose |taps| sum past 128 can overflow the 16-bit accumulator (intended only for overdrive rooms)
  // the FIR's peak gain over frequency (1.0 = unity): a steady tone never overflows when it is <= 1. The plain |taps| sum is
  // the worst case for an adversarial signal; Nintendo's own LPF preset sums to 172 and ships, so that is only a warning
  const firPeak = fir => { let mx = 0; for (let k = 0; k <= 256; k++) { const w = Math.PI * k / 256; let re = 0, im = 0; for (let j = 0; j < 8; j++) { re += fir[j] * Math.cos(w * j); im -= fir[j] * Math.sin(w * j); } mx = Math.max(mx, Math.hypot(re, im) / 128); } return mx; };
  const firSafe = fir => firPeak(fir) <= 1.0001;
  LO.SNESX = { firSafe, firPeak, RATE, VEL, VREG, PAN, GATE, velIdx, panRates, renderVoice, mix, analog };
})(typeof self !== 'undefined' ? self : globalThis);
