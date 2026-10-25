/* JELLY BRAIN - v0.7.3 the studio layer (OFF by default; AUTHENTIC stays the console's own sound). Baked into saves and
   MP3s when on. Order: ECHO -> REVERB -> COSMIC (LowOrbit LIFT-OFF).
   ECHO: a tempo-synced ping-pong delay (a dotted eighth), darkened a little on every repeat, like tape.
   REVERB: a hall built on the classic Schroeder-Moorer / Freeverb design (public domain): 8 damped comb filters and
   4 all-pass filters per side, the right side's delays offset for width. Our own code, no library. */
(function (G) {
  const LO = G.LO;
  // ---------------------------------------------------------------- ECHO
  function echo(L, R, sr, bpm) {
    const beat = 60 / (bpm || 120), d = Math.max(1, Math.round(sr * beat * 0.75)), n = L.length;
    const fb = 0.38, wet = 0.28, damp = Math.exp(-2 * Math.PI * 4200 / sr);
    const bl = new Float32Array(d), br = new Float32Array(d); let p = 0, lpL = 0, lpR = 0;
    const oL = new Float32Array(n), oR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dl = bl[p], dr = br[p];
      lpL = dl + damp * (lpL - dl); lpR = dr + damp * (lpR - dr);        // each repeat a little darker
      // ping-pong: the left input feeds the right line and back, so repeats walk across the stereo field
      bl[p] = R[i] * 0.5 + lpR * fb; br[p] = L[i] * 0.5 + lpL * fb;
      if (++p >= d) p = 0;
      oL[i] = L[i] + dl * wet; oR[i] = R[i] + dr * wet;
    }
    return { L: oL, R: oR };
  }
  // ---------------------------------------------------------------- REVERB (Freeverb-style hall)
  const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441, 341, 225], SPREAD = 23;
  function reverb(L, R, sr) {
    const k = sr / 44100, n = L.length, room = 0.84, damp = 0.32, wet = 0.24, dry = 1;
    const side = off => ({
      c: COMB.map(x => ({ b: new Float32Array(Math.max(1, Math.round((x + off) * k))), p: 0, f: 0 })),
      a: AP.map(x => ({ b: new Float32Array(Math.max(1, Math.round((x + off) * k))), p: 0 })),
    });
    const sl = side(0), sr2 = side(SPREAD), oL = new Float32Array(n), oR = new Float32Array(n);
    const run = (S, x) => {
      let out = 0;
      for (const c of S.c) { const y = c.b[c.p]; c.f = y * (1 - damp) + c.f * damp; c.b[c.p] = x + c.f * room; if (++c.p >= c.b.length) c.p = 0; out += y; }
      for (const a of S.a) { const y = a.b[a.p]; const v = -out + y; a.b[a.p] = out + y * 0.5; if (++a.p >= a.b.length) a.p = 0; out = v; }
      return out;
    };
    for (let i = 0; i < n; i++) {
      const x = (L[i] + R[i]) * 0.015;                 // Freeverb's fixed input gain
      oL[i] = L[i] * dry + run(sl, x) * wet; oR[i] = R[i] * dry + run(sr2, x) * wet;
    }
    return { L: oL, R: oR };
  }
  // ---------------------------------------------------------------- the chain
  // f: { echo, reverb, cosmic }. Returns a new buffer pair; the input is never touched.
  function post(L, R, sr, f, bpm) {
    let o = { L: L.slice(), R: R.slice() };
    if (f.echo) o = echo(o.L, o.R, sr, bpm);
    if (f.reverb) o = reverb(o.L, o.R, sr);
    if (f.cosmic && LO.LowOrbit)   // COSMIC needs the LowOrbit LIFT-OFF library (not included in the shared source; the button does nothing without it)
      o = LO.LowOrbit.cosmic(o.L, o.R, sr);
    // the tails add level: bring the peak back to the console mix's own peak, never louder than it was
    let pk0 = 1e-9, pk = 1e-9; for (let i = 0; i < L.length; i++) { pk0 = Math.max(pk0, Math.abs(L[i]), Math.abs(R[i])); pk = Math.max(pk, Math.abs(o.L[i]), Math.abs(o.R[i])); }
    if (pk > pk0) { const g = pk0 / pk; for (let i = 0; i < o.L.length; i++) { o.L[i] *= g; o.R[i] *= g; } }
    return o;
  }
  LO.JBPost = { echo, reverb, post };
})(typeof self !== 'undefined' ? self : globalThis);
