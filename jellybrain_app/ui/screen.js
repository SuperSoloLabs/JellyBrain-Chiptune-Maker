/* JELLY BRAIN - the SNES screen: a true 256 x 239 picture (the console's own overscan mode, v0.7.3) in 15-bit color (32 levels per channel), on an 8 x 8 tile
   grid with banded gradient windows. The grid from the UX pass: 6 px screen margins, 4 px between boxes, 6 px padding
   inside boxes, contents centered, >= 2 px clearance, box titles on the same line. */
(function (G) {
  const W = 256, H = 239, { txt, width } = G.JBFont;
  const q = v => Math.round(Math.round(Math.max(0, Math.min(255, v)) / 255 * 31) * 255 / 31);
  const rgb = (r, g, b) => `rgb(${q(r)},${q(g)},${q(b)})`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const C = { MINT: rgb(110, 255, 190), PINK: rgb(255, 110, 210), CYAN: rgb(110, 220, 255), VIO: rgb(185, 140, 255), WHITE: rgb(235, 235, 255), DIM: rgb(120, 120, 170),
    DARK: rgb(16, 12, 40), RULE: rgb(60, 70, 140), GOLD: rgb(255, 210, 90), SEL: rgb(70, 200, 160), OFF: rgb(60, 50, 100), PINKHI: rgb(255, 190, 235) };
  let g = null, hits = [];
  const hit = (x, y, w, h, act, arg) => hits.push({ x, y, w, h, act, arg });
  function grad(x, y, w, h, top, bot) { for (let i = 0; i < h; i++) { const t = h > 1 ? i / (h - 1) : 0; g.fillStyle = rgb(lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t)); g.fillRect(x, y + i, w, 1); } }
  function win(x, y, w, h, hl) {
    g.fillStyle = C.DARK; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = hl ? C.PINK : C.MINT; g.fillRect(x, y, w, h);
    g.fillStyle = hl ? rgb(140, 50, 110) : rgb(40, 120, 110); g.fillRect(x + 1, y + 1, w - 2, h - 2); grad(x + 2, y + 2, w - 4, h - 4, [34, 40, 110], [22, 16, 62]);
    g.fillStyle = C.DARK; [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]].forEach(([a, b]) => g.fillRect(a, b, 1, 1));
  }
  const center = (s, cx, y, col, opt) => txt(g, s, cx - Math.floor(width(s, opt) / 2), y, col, opt);
  function sky(t) {
    grad(0, 0, W, H, [10, 10, 38], [34, 14, 58]);
    const st = [[60, 2], [140, 3], [120, 1], [30, 218], [250, 219], [200, 12], [8, 120], [248, 90]];
    st.forEach(([x, y], i) => { const a = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1); g.fillStyle = a > 0.35 ? C.WHITE : C.DIM; g.fillRect(x, y, 1, 1); });
  }
  // the jelly-blob cursor: a little pink blob that wobbles
  function blob(x, y, t) { const w = Math.round(Math.sin(t * 6) * 0.6); g.fillStyle = C.PINK; g.fillRect(x, y + 1, 5 + w, 5 - w); g.fillRect(x + 1, y, 3, 1); g.fillRect(x + 1, y + 6 - w, 3, 1); g.fillStyle = C.WHITE; g.fillRect(x + 1, y + 2, 1, 1); }
  function arrowsUD(x, yUp, yDn, upOn, dnOn) {
    g.fillStyle = upOn ? C.CYAN : C.OFF; [[0, 5], [1, 3], [2, 1]].forEach(([d, w]) => g.fillRect(x + d, yUp - d, w, 1));
    g.fillStyle = dnOn ? C.CYAN : C.OFF; [[0, 5], [1, 3], [2, 1]].forEach(([d, w]) => g.fillRect(x + d, yDn + d, w, 1));
  }
  function pill(x, y, w, h, col, pressed) { y += pressed ? 1 : 0; g.fillStyle = C.DARK; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x, y, w, h); g.fillStyle = C.DARK; g.fillRect(x + 1, y + 1, w - 2, h - 2); [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]].forEach(([a, b]) => g.fillRect(a, b, 1, 1)); return y; }
  const mmss = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ================================================================ MAIN (v0.7.3 layout, Tom's: no header, taller boxes,
  // the studio row under the buttons). Grid: boxes 6-150, now playing 154-173, buttons 177-195, studio row 208-224.
  const BY = 6, BH = 144;
  function main(S, t) {
    sky(t);
    // ---- left box: the scenes
    const focusList = S.focus === 'list';
    win(6, BY, 92, BH, false);
    center('SCENES', 52, BY + 6, C.CYAN, { sp: 1 });
    g.fillStyle = C.RULE; g.fillRect(12, BY + 16, 80, 1);
    const N = 11, list = S.scenes, top = S.listTop;
    for (let i = 0; i < N && top + i < list.length; i++) {
      const k = top + i, y = BY + 23 + i * 10.5 | 0, n = list[k].name;
      hit(10, y - 2, 84, 10, 'scene', k);
      if (k === S.scene) { g.fillStyle = focusList ? C.SEL : rgb(50, 120, 110); g.fillRect(11, y - 2, 82, 11); g.fillStyle = focusList ? C.MINT : C.SEL; g.fillRect(11, y - 2, 82, 1); txt(g, n, 22, y, C.DARK); if (focusList) blob(13, y, t); }
      else txt(g, n, 22, y, C.WHITE);
    }
    arrowsUD(88, BY + 10, BY + BH - 9, top > 0, top + N < list.length); hit(84, BY + 4, 12, 10, 'scrollUp'); hit(84, BY + BH - 13, 12, 10, 'scrollDn');
    // ---- right box: the scene, its line, the dials, the room, the visualizer
    win(104, BY, 146, BH, false);
    const sc = list[S.scene], CX = 177;
    center(sc.name, CX, BY + 7, C.PINK, { bold: true, sp: 1, shadow: C.DARK });
    center(sc.desc, CX, BY + 20, C.WHITE);
    g.fillStyle = C.RULE; g.fillRect(112, BY + 31, 130, 1);
    const rows = ['MOOD', 'ENERGY', 'EPIC', 'LENGTH'], dialsF = S.focus === 'dials';
    rows.forEach((label, r) => {
      const y = BY + 38 + r * 16, f = dialsF && S.row === r;
      txt(g, label, 112, y, f ? C.WHITE : C.CYAN, { sp: 1 });
      if (f) { g.fillStyle = C.PINK; g.fillRect(108, y + 1, 2, 5); }
      for (let i = 0; i < 6; i++) { const lit = i < S.dials[r]; g.fillStyle = lit ? C.PINK : C.OFF; g.fillRect(171 + i * 12, y, 10, 7); if (lit) { g.fillStyle = C.PINKHI; g.fillRect(171 + i * 12, y, 10, 1); } hit(170 + i * 12, y - 2, 12, 11, 'dial', [r, i + 1]); }
      hit(110, y - 2, 58, 11, 'row', r);
    });
    const rf = dialsF && S.row === 4, ry = BY + 102;
    txt(g, 'ROOM', 112, ry, rf ? C.WHITE : C.CYAN, { sp: 1 }); if (rf) { g.fillStyle = C.PINK; g.fillRect(108, ry + 1, 2, 5); }
    const rn = S.room, rw = width(rn), rx = 201 - Math.floor(rw / 2);
    txt(g, '<', 159, ry, S.roomFlash < 0 ? C.WHITE : C.MINT); txt(g, rn, rx, ry, C.WHITE); txt(g, '>', 237, ry, S.roomFlash > 0 ? C.WHITE : C.MINT);
    hit(155, ry - 3, 14, 13, 'room', -1); hit(233, ry - 3, 14, 13, 'room', 1); hit(110, ry - 3, 44, 13, 'row', 4);
    g.fillStyle = C.RULE; g.fillRect(112, BY + 115, 130, 1);
    // the visualizer: one bar per SNES voice
    const v = S.viz;
    for (let i = 0; i < 8; i++) { const x = CX - 35 + i * 9, h = Math.round(Math.min(1, v[i]) * 18); for (let yy = 0; yy < Math.max(3, h); yy += 3) { const tt = yy / 18; g.fillStyle = h < 3 ? C.OFF : tt < 0.5 ? C.MINT : tt < 0.8 ? C.CYAN : C.PINK; g.fillRect(x, BY + 139 - yy, 7, 2); } }
    nowPlaying(S, t);
    buttons(S, t);
    studio(S, t);
  }
  function nowPlaying(S, t) {
    const Y = 154;
    win(6, Y, 244, 19, false);
    g.fillStyle = C.MINT; g.fillRect(14, Y + 6, 2, 6); g.fillRect(16, Y + 4, 4, 2); g.fillRect(18, Y + 6, 2, 3); g.fillRect(12, Y + 11, 4, 3);
    if (S.markOn) { g.fillStyle = Math.floor(t * 3) % 2 ? rgb(255, 60, 80) : rgb(150, 30, 50); g.fillRect(238, Y + 7, 5, 5); }
    if (S.busy) { const d = '...'.slice(0, 1 + Math.floor(t * 3) % 3); txt(g, 'THE BRAIN IS THINKING' + d, 26, Y + 6, C.PINK); return; }
    if (S.toast && S.toast.until > t) { txt(g, S.toast.msg, 26, Y + 6, S.toast.col || C.MINT); return; }
    if (!S.song) { txt(g, 'PRESS START TO MAKE A SONG', 26, Y + 6, C.DIM); return; }
    const name = S.song.title.length > 15 ? S.song.title.slice(0, 15) : S.song.title;
    txt(g, name, 26, Y + 6, C.WHITE);
    const bx = Math.max(90, 26 + width(name) + 8), bw = 184 - bx;
    const len = S.song.len, pos = Math.min(len, S.pos), frac = len ? pos / len : 0;
    g.fillStyle = rgb(50, 45, 95); g.fillRect(bx, Y + 8, bw, 4); g.fillStyle = C.CYAN; g.fillRect(bx, Y + 8, Math.round(bw * frac), 4); g.fillStyle = C.WHITE; g.fillRect(bx + Math.round(bw * frac), Y + 7, 2, 6);
    hit(bx - 2, Y + 3, bw + 4, 12, 'seek', [bx, bw]);
    const tm = mmss(pos) + '/' + mmss(len); txt(g, tm, (S.markOn ? 234 : 243) - width(tm), Y + 6, C.WHITE);
  }
  function buttons(S, t) {
    const P = S.pressed || {}, pr = k => P[k] && t - P[k] < 0.12, Y = 177;
    const hint = (s, cx) => center(s, cx, Y + 20, C.DIM);
    const labelled = (x, w, col, label, icon, key) => { const y = pill(x, Y, w, 18, col, pr(key)); const lw = width(label, { bold: true }), gw = 6 + 5 + lw, sx = x + Math.floor((w - gw) / 2); icon(sx, y); txt(g, label, sx + 11, y + 6, col, { bold: true, shadow: C.DARK }); hit(x, Y, w, 18, key); };
    labelled(6, 64, C.MINT, 'MAKE', (sx, y) => { g.fillStyle = C.MINT; g.fillRect(sx + 2, y + 5, 1, 7); g.fillRect(sx - 1, y + 8, 7, 1); g.fillRect(sx + 1, y + 7, 3, 3); g.fillStyle = C.WHITE; g.fillRect(sx + 2, y + 8, 1, 1); }, 'make'); hint('START', 38);
    { const y = pill(76, Y, 42, 18, C.GOLD, pr('chest')), cx = 88, cy = y + 3, bob = Math.round(Math.sin(t * 3) * 0.6);
      g.fillStyle = rgb(150, 80, 40); g.fillRect(cx, cy + 3, 18, 9); g.fillStyle = rgb(200, 120, 60); g.fillRect(cx, cy + 1 + bob, 18, 3); g.fillRect(cx + 1, cy + bob, 16, 1);
      g.fillStyle = C.GOLD; g.fillRect(cx, cy + 3, 18, 1); g.fillRect(cx, cy + 11, 18, 1); g.fillRect(cx, cy + 1, 1, 11); g.fillRect(cx + 17, cy + 1, 1, 11);
      txt(g, '?', cx + 7, cy + 4, C.WHITE, { shadow: C.DARK }); hit(76, Y, 42, 18, 'chest'); }
    hint('Y', 97);
    const playing = S.playing;
    labelled(124, 60, C.CYAN, playing ? 'STOP' : 'PLAY', (sx, y) => { g.fillStyle = C.CYAN; if (playing) g.fillRect(sx, y + 5, 6, 7); else for (let i = 0; i < 5; i++) g.fillRect(sx + i, y + 4 + i, 1, 10 - 2 * i); }, 'play'); hint('X', 154);
    labelled(190, 60, C.VIO, 'SAVE', (sx, y) => { g.fillStyle = C.VIO; g.fillRect(sx, y + 5, 7, 8); g.fillStyle = C.DARK; g.fillRect(sx + 2, y + 5, 3, 3); }, 'save'); hint('A', 220);
  }
  // ---- the studio row (v0.7.3): COSMIC, ECHO, REVERB light up when on; MARK is green, red while it records a stretch
  const STUDIO = [['cosmic', 'COSMIC', 'TAB'], ['echo', 'ECHO', 'Z'], ['reverb', 'REVERB', 'V'], ['mark', 'MARK', 'K']];
  function studio(S, t) {
    const Y = 208, w = 56;
    STUDIO.forEach(([k, label, key], i) => {
      const x = 6 + i * 62, on = k === 'mark' ? !!S.markOn : !!S[k], foc = S.focus === 'fx' && S.fxSel === i;
      const base = k === 'mark' ? (on ? rgb(255, 70, 90) : C.MINT) : k === 'cosmic' ? C.PINK : k === 'echo' ? C.CYAN : C.VIO;
      const pulse = on ? 0.5 + 0.5 * Math.sin(t * (k === 'mark' ? 6 : 3)) : 0;
      g.fillStyle = C.DARK; g.fillRect(x - 1, Y - 1, w + 2, 18);
      g.fillStyle = base; g.fillRect(x, Y, w, 16);
      if (!on) { g.fillStyle = C.DARK; g.fillRect(x + 1, Y + 1, w - 2, 14); }
      else { g.fillStyle = rgb(255, 255, 255); g.globalAlpha = 0.18 * pulse; g.fillRect(x + 1, Y + 1, w - 2, 14); g.globalAlpha = 1; }
      g.fillStyle = C.DARK; [[x, Y], [x + w - 1, Y], [x, Y + 15], [x + w - 1, Y + 15]].forEach(([a, b]) => g.fillRect(a, b, 1, 1));
      if (foc) { g.fillStyle = C.WHITE; g.fillRect(x - 1, Y + 17, w + 2, 1); g.fillRect(x - 1, Y - 2, w + 2, 1); }
      const lw = width(label, { bold: true }); txt(g, label, x + Math.floor((w - lw) / 2), Y + 5, on ? C.DARK : base, { bold: true });
      center(key, x + w / 2, Y + 19, C.DIM);
      hit(x, Y, w, 16, 'fx', k);
    });
  }

  // ================================================================ TITLE: wobbly letters, a rotating Mode-7 floor
  let m7 = null, tex = null;
  function makeTex() {
    tex = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const tile = ((x >> 4) + (y >> 4)) & 1, gx = x & 15, gy = y & 15, dot = (gx - 7.5) ** 2 + (gy - 7.5) ** 2 < 9;
      let c = tile ? [70, 40, 140] : [30, 20, 80]; if (dot) c = tile ? [110, 255, 190] : [255, 110, 210]; if (gx === 0 || gy === 0) c = [20, 12, 50];
      const o = (y * 64 + x) * 4; tex[o] = q(c[0]); tex[o + 1] = q(c[1]); tex[o + 2] = q(c[2]); tex[o + 3] = 255;
    }
  }
  function mode7(t) {
    if (!tex) makeTex();
    const y0 = 128, h = H - y0; if (!m7) m7 = g.createImageData(W, h);
    const d = m7.data, ang = t * 0.25, ca = Math.cos(ang), sa = Math.sin(ang), camX = t * 18, camY = t * 9;
    for (let y = 0; y < h; y++) {
      const z = 2400 / (y + 8), fade = Math.min(1, (y + 4) / 40);
      for (let x = 0; x < W; x++) {
        const sx = (x - 128) * z / 128, u = Math.floor(camX + sx * ca - z * sa) & 63, v = Math.floor(camY + sx * sa + z * ca) & 63;
        const s = (v * 64 + u) * 4, o = (y * W + x) * 4;
        d[o] = q(tex[s] * fade + 12 * (1 - fade)); d[o + 1] = q(tex[s + 1] * fade + 8 * (1 - fade)); d[o + 2] = q(tex[s + 2] * fade + 40 * (1 - fade)); d[o + 3] = 255;
      }
    }
    g.putImageData(m7, 0, y0);
  }
  function title(S, t) {
    sky(t); mode7(t);
    g.fillStyle = rgb(110, 255, 190); g.fillRect(0, 127, W, 1);
    // JELLY BRAIN: each letter wobbles like jelly, then settles
    const age = t - S.titleT0, settle = Math.exp(-age / 1.2);
    const word = (w, y, col) => {
      const sc = 3, adv = 7 * sc + 3, x0 = 128 - Math.floor((w.length * adv - 3) / 2);
      [...w].forEach((ch, i) => {
        const ph = age * 9 - i * 0.7, dy = Math.round(Math.sin(ph) * 7 * settle + Math.sin(t * 2 + i) * 0.6), dx = Math.round(Math.cos(ph * 0.8) * 2 * settle);
        txt(g, ch, x0 + i * adv + dx, y + dy, col, { bold: true, scale: sc, shadow: C.DARK });
      });
    };
    word('JELLY', 22, C.MINT); word('BRAIN', 52, C.PINK);
    if (S.attract) {
      // the demo: a song plays itself, the visualizer dances
      win(46, 86, 164, 34, false); center('DEMO', 128, 92, C.GOLD, { bold: true });
      center(S.song ? S.song.title : '...', 128, 104, C.WHITE);
      for (let i = 0; i < 8; i++) { const x = 92 + i * 9, h = Math.round(Math.min(1, S.viz[i]) * 12); g.fillStyle = C.MINT; for (let yy = 0; yy < Math.max(2, h); yy += 3) g.fillRect(x, 140 - yy, 7, 2); }
      if (Math.floor(t * 2) % 2 === 0) center('PRESS START', 128, 150, C.WHITE, { shadow: C.DARK });
      return;
    }
    // the menu
    const items = ['1 PLAYER', 'OPTIONS'];
    win(76, 86, 104, 34, false);
    items.forEach((s, i) => { const y = 92 + i * 12, sel = S.titleSel === i; if (sel) txt(g, '>', 88, y, C.PINK); txt(g, s, 98, y, sel ? C.WHITE : C.DIM, { bold: sel }); hit(80, y - 2, 96, 11, 'titleItem', i); });
    if (Math.floor((t - S.titleT0) * 1.6) % 2 === 0) center('PRESS START', 128, 136, C.WHITE, { bold: true, shadow: C.DARK });
    center('SUPERSOLOLABS', 128, 228, C.DIM, { shadow: C.DARK });
  }

  // ================================================================ OPTIONS
  function options(S, t) {
    sky(t);
    txt(g, 'OPTIONS', 6, 7, C.WHITE, { bold: true, shadow: C.DARK });
    win(6, 20, 244, 180, false);
    const O = S.options, rows = O.rows;
    rows.forEach((r, i) => {
      const y = 30 + i * 18, sel = O.sel === i;
      if (sel) { g.fillStyle = C.SEL; g.fillRect(11, y - 3, 234, 13); }
      txt(g, r.label, 18, y, sel ? C.DARK : C.CYAN, { sp: 1 });
      const v = r.value ? r.value() : '';
      if (v) txt(g, v, 243 - width(v), y, sel ? C.DARK : C.WHITE);
      if (sel) blob(12, y, t);
      hit(10, y - 3, 236, 13, 'option', i);
    });
    const info = O.info || '';
    if (info) center(info.slice(0, 40), 128, 166, C.PINK);
    if (O.remap) { win(28, 70, 200, 50, true); center('PRESS THE BUTTON FOR', 128, 82, C.WHITE); center(O.remap.label, 128, 96, C.GOLD, { bold: true }); center('(ESC TO STOP)', 128, 108, C.DIM); }
    center('A: CHOOSE   B: BACK', 128, 210, C.DIM);
    center('JELLY BRAIN V' + S.version, 128, 224, C.DIM);
  }

  G.JBScreen = {
    W, H, C, rgb,
    draw(ctx, S, t) { g = ctx; hits = []; g.imageSmoothingEnabled = false; if (S.mode === 'title') title(S, t); else if (S.mode === 'options') options(S, t); else main(S, t); return hits; },
  };
})(window);
