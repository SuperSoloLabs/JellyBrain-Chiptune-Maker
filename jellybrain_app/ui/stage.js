/* JELLY BRAIN - the window around the screen: Tom's art as the frame, with life in it. The glass dome is static art;
   the brain and tentacles stay exactly as Tom painted them; only his eyes and mouth move (blink, squeeze, smile). Stars and little moons twinkle and drift a few pixels, each on its own rhythm.
   The controller is our own jelly design (mint / pink / cyan / violet buttons, gummy shapes, our own labels). All
   motion is soft and slow. Everything here is drawn in the art's own pixels (1792 x 2400) and scaled to the window. */
(function (G) {
  const AW = 1792, AH = 2400;
  const MINT = [110, 255, 190], PINK = [255, 110, 210], CYAN = [110, 220, 255], VIO = [185, 140, 255];
  const col = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : a})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let L = null, base = null, starsImg = null, baseCache = null, cacheW = 0;

  async function load() {
    L = JSON.parse(JSON.stringify(window.JB_LAYERS));
    const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    base = await img('art/base.jpg'); starsImg = await img('art/stars.png');
    // each star gets its own slow drift and twinkle
    L.stars.forEach((s, i) => { s.ph = i * 2.399; s.sp = 0.25 + (i * 0.137 % 0.35); s.tw = 0.6 + (i * 0.291 % 0.9); });
    return L;
  }
  // the art, resampled once to the window's real pixels (halving steps keep it sharp)
  function baseAt(w, h) {
    if (baseCache && cacheW === w) return baseCache;
    let src = base, sw = AW, sh = AH;
    while (sw / 2 > w * 1.01) { const c = document.createElement('canvas'); c.width = Math.round(sw / 2); c.height = Math.round(sh / 2); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); src = c; sw = c.width; sh = c.height; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    baseCache = c; cacheW = w; return c;
  }

  // ---------------------------------------------------------------- v0.7.3 the PIXEL FACE (Tom: replace the eyes and mouth with
  // pixels so he can smile, frown, sleep, be sad, talk...). Chunky pixel sprites in the face's own mint and pink, glowing
  // softly on the jelly. Expressions: idle (blinks, a wink now and then), happy, grin, talk (with the music), think,
  // surprise, sad, frown, sleepy, sleep (with z's). The painted brain itself is untouched.
  const brain = { blinkAt: 2.5, winkAt: 12, ev: null, evUntil: 0, smileT: -9, glow: 0, jig: 0, lastBeat: 0 };
  const PX = 13, EYE_L = [1142, 336], EYE_R = [1300, 348], MOUTH = [1222, 410];
  const SPR = {
    open: ['.###.', '#####', '#W###', '#####', '#####', '.###.'],
    look: ['.#W#.', '#####', '#####', '#####', '#####', '.###.'],
    big: ['.####.', '######', '#WW###', '#W####', '######', '######', '.####.'],
    shut: ['.....', '.....', '.....', '#####', '.###.', '.....'],
    happy: ['.....', '.....', '.###.', '#...#', '#...#', '.....'],
    sleepy: ['.....', '.....', '.....', '#####', '#####', '.###.'],
    sad: ['.....', '.###.', '#####', '#W###', '#####', '.###.'],
    m_idle: ['#.........#', '.#.......#.', '..#######..'],
    m_happy: ['#...........#', '.#.........#.', '..#WWWWWWW#..', '...#######...'],
    m_grin: ['.###########.', '#WWWWWWWWWWW#', '#WWWWWWWWWWW#', '.#PPPPPPPPP#.', '..#########..'],
    m_sad: ['...#######...', '..#.......#..', '.#.........#.', '#...........#'],
    m_frown: ['.#########.', '#.........#'],
    m_o: ['.###.', '#PPP#', '#PPP#', '.###.'],
    m_O: ['.####.', '#PPPP#', '#PPPP#', '#PPPP#', '.####.'],
    m_think: ['.....####', '.####....'],
    m_sleep: ['.##.', '#PP#', '.##.'],
  };
  const BROW = { sad: [[-2, -2], [-1, -2], [0, -3], [1, -3]], frown: [[-1, -3], [0, -3], [1, -2], [2, -2]] };
  function blocks(g, rows, cx, cy, sc, col, a) {
    const h = rows.length, w = rows[0].length, x0 = cx - w * PX / 2, y0 = cy - h * PX / 2;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const ch = rows[r][c]; if (ch === '.') continue;
      g.fillStyle = ch === 'W' ? `rgba(255,255,255,${a})` : ch === 'P' ? `rgba(255,170,225,${a})` : col(a); g.fillRect(Math.round((x0 + c * PX) * sc), Math.round((y0 + r * PX) * sc), Math.ceil(PX * sc), Math.ceil(PX * sc)); }
  }
  function face(t, S) {
    if (brain.ev && t > brain.evUntil) brain.ev = null;
    if (brain.ev) return brain.ev;
    if (S.busy) return 'think';
    const idleFor = S.idleFor || 0;
    if (!S.playing && idleFor > 45) return 'sleep';
    if (!S.playing && idleFor > 30) return 'sleepy';
    const sc = S.scenes && S.scenes[S.scene], sadScene = sc && /SAD|GAME OVER/.test(sc.name);
    if (S.playing) return sadScene ? 'sadtalk' : 'talk';
    return sadScene ? 'sad' : 'idle';
  }
  function drawFace(g, t, S, sc) {
    const D = L.dome;
    brain.glow += (((S.cosmic || S.echo || S.reverb) ? 1 : 0) - brain.glow) * 0.05;
    const pulse = brain.glow * (0.5 + 0.5 * Math.sin(t * 3));
    if (brain.glow > 0.01) { const rg = g.createRadialGradient(D.cx * sc, D.cy * sc, 120 * sc, D.cx * sc, D.cy * sc, 400 * sc); rg.addColorStop(0, col(PINK, 0.0)); rg.addColorStop(0.55, col(PINK, 0.10 * brain.glow + 0.10 * pulse)); rg.addColorStop(1, col(VIO, 0)); g.fillStyle = rg; g.fillRect((D.cx - 420) * sc, (D.cy - 420) * sc, 840 * sc, 840 * sc); }
    const f = face(t, S);
    if (t > brain.blinkAt + 0.16) brain.blinkAt = t + 2.6 + ((t * 7.13) % 3.4);
    if (t > brain.winkAt + 0.5) brain.winkAt = t + 14 + ((t * 3.7) % 10);
    const blink = t > brain.blinkAt && t < brain.blinkAt + 0.16, wink = f === 'idle' && t > brain.winkAt && t < brain.winkAt + 0.5;
    const bob = Math.sin(t * 1.6) * 2 + brain.jig * Math.sin(t * 30) * 3; brain.jig *= 0.92;
    const mint = a => col(MINT, a), pink = a => col(PINK, a), A = Math.min(1, 0.92 + 0.08 * pulse);
    g.save(); g.shadowColor = col(MINT, 0.8); g.shadowBlur = 14 * sc * 3;
    // eyes
    let eL = 'open', eR = 'open', dy = 0;
    if (f === 'think') { eL = eR = 'look'; dy = -6; } else if (f === 'surprise') { eL = eR = 'big'; } else if (f === 'happy' || f === 'grin') { eL = eR = 'happy'; }
    else if (f === 'sleepy') { eL = eR = 'sleepy'; } else if (f === 'sleep') { eL = eR = 'shut'; } else if (f === 'sad' || f === 'sadtalk') { eL = eR = 'sad'; }
    if (blink && !['sleep', 'happy', 'grin'].includes(f)) eL = eR = 'shut'; if (wink) eR = 'happy';
    blocks(g, SPR[eL], EYE_L[0], EYE_L[1] + bob + dy, sc, mint, A); blocks(g, SPR[eR], EYE_R[0], EYE_R[1] + bob + dy, sc, mint, A);
    // brows for sad and frown (pixel strokes above the eyes, mirrored)
    const br = f === 'sad' || f === 'sadtalk' ? BROW.sad : f === 'frown' ? BROW.frown : null;
    if (br) for (const [ex, sgn] of [[EYE_L[0], 1], [EYE_R[0], -1]]) for (const [bx, by] of br) { g.fillStyle = mint(A); g.fillRect(Math.round((ex + sgn * bx * PX - PX / 2) * sc), Math.round((EYE_L[1] + bob + by * PX - 26) * sc), Math.ceil(PX * sc), Math.ceil(PX * sc)); }
    // mouth
    g.shadowColor = col(PINK, 0.8);
    let m = 'm_idle';
    if (f === 'happy') m = 'm_happy'; else if (f === 'grin') m = 'm_grin'; else if (f === 'sad' || f === 'sadtalk') m = 'm_sad'; else if (f === 'frown') m = 'm_frown';
    else if (f === 'surprise') m = 'm_O'; else if (f === 'think') m = 'm_think'; else if (f === 'sleep' || f === 'sleepy') m = 'm_sleep';
    if (f === 'talk' || f === 'sadtalk') { const v = S.viz ? (S.viz[0] + S.viz[1] + S.viz[5]) / 3 : 0; m = v > 0.55 ? 'm_O' : v > 0.22 ? 'm_o' : f === 'sadtalk' ? 'm_sad' : 'm_idle'; }
    blocks(g, SPR[m], MOUTH[0], MOUTH[1] + bob, sc, pink, A);
    g.restore();
    // z's when asleep: little pixel Z's float up and fade
    if (f === 'sleep') for (let k = 0; k < 3; k++) { const ph = ((t * 0.35 + k / 3) % 1), x = 1360 + ph * 60 + k * 10, y = 300 - ph * 160, a = Math.sin(Math.PI * ph) * 0.9, s2 = 1 + k * 0.4;
      blocks(g, ['###', '..#', '.#.', '#..', '###'], x, y, sc * s2 * 0.7, a2 => col(CYAN, a2), a); }
  }
  // ---------------------------------------------------------------- v0.7.3 the gooey shine (subtle: if you notice it first, it is too much)
  const GLARE = [[1110, 128, 1], [1050, 166, 0.8], [1196, 98, 0.7], [1430, 150, 0.6], [1500, 230, 0.5]];
  const sparks = GLARE.map((p, i) => ({ p, ph: i * 1.7, per: 3.5 + i * 0.9 }));
  function star4(g, x, y, r, a, sc) { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.moveTo(x * sc, (y - r) * sc); g.quadraticCurveTo(x * sc, y * sc, (x + r) * sc, y * sc); g.quadraticCurveTo(x * sc, y * sc, x * sc, (y + r) * sc); g.quadraticCurveTo(x * sc, y * sc, (x - r) * sc, y * sc); g.quadraticCurveTo(x * sc, y * sc, x * sc, (y - r) * sc); g.fill(); }
  function drawShine(g, t, sc) {
    const D = L.dome;
    g.save(); g.beginPath(); g.ellipse(D.cx * sc, (D.cy - 10) * sc, (D.ax - 6) * sc, (D.top - 4) * sc, 0, Math.PI, 0); g.lineTo((D.cx + D.ax - 6) * sc, (D.cy + D.bot * 0.8) * sc); g.lineTo((D.cx - D.ax + 6) * sc, (D.cy + D.bot * 0.8) * sc); g.closePath(); g.clip();
    g.globalCompositeOperation = 'lighter';
    // a wet highlight drifting slowly across the dome, like light moving over jelly
    const hx = D.cx + Math.sin(t * 0.13) * 170, hy = D.cy - 130 + Math.cos(t * 0.17) * 40, j = 1 + brain.jig * 0.15;
    const rg = g.createRadialGradient(hx * sc, hy * sc, 0, hx * sc, hy * sc, 120 * j * sc); rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect((hx - 130) * sc, (hy - 130) * sc, 260 * sc, 260 * sc);
    // a rare glint sweeping across the glass (every ~16 s, 1.4 s long)
    const gp = (t % 16) / 1.4; if (gp < 1) { const x = D.cx - D.ax + gp * D.ax * 2.2; const lg = g.createLinearGradient((x - 60) * sc, 0, (x + 60) * sc, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${0.10 * Math.sin(Math.PI * gp)})`); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.save(); g.translate(x * sc, D.cy * sc); g.rotate(0.35); g.fillRect(-60 * sc, -320 * sc, 120 * sc, 640 * sc); g.restore(); }
    g.restore();
    // the rim breathes faintly (thick, translucent jelly)
    g.save(); g.strokeStyle = col(MINT, 0.05 + 0.04 * Math.sin(t * 0.9)); g.lineWidth = 10 * sc; g.beginPath(); g.ellipse(D.cx * sc, (D.cy - 10) * sc, (D.ax - 4) * sc, (D.top - 2) * sc, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.restore();
    // sparkles on the glare spots: a soft four-point twinkle, each on its own slow rhythm
    for (const s of sparks) { const ph = ((t + s.ph) % s.per) / s.per; if (ph > 0.18) continue; const a = Math.sin(Math.PI * ph / 0.18) * 0.75 * s.p[2]; star4(g, s.p[0], s.p[1], 16 + 10 * Math.sin(Math.PI * ph / 0.18), a, sc); }
  }
  // ---------------------------------------------------------------- v0.7.3 the night sky: many twinkling stars, a shooting star now and then
  let field = null; const shoot = { at: 6, x: 0, y: 0, a: 0 };
  function drawSky(g, t, sc) {
    if (!field) { field = []; let s0 = 99; const R = () => { s0 = (s0 * 1103515245 + 12345) >>> 0; return (s0 >>> 8) / 16777216; };
      while (field.length < 170) { const x = R() * AW, y = R() * AH; const inScreen = x > 150 && x < 1640 && y > 620 && y < 1830, inBrain = x > 940 && x < 1600 && y < 560, inPad = x > 330 && x < 1480 && y > 1830, inLogo = x < 920 && y < 440; if (inScreen || inBrain || inPad || inLogo) continue; field.push({ x, y, r: R() < 0.12 ? 2 : 1, ph: R() * 7, sp: 0.6 + R() * 1.6 }); } }
    for (const f of field) { const a = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(t * f.sp + f.ph)) ** 3; g.fillStyle = `rgba(235,235,255,${a})`; const z = Math.max(1, Math.round(f.r * 3 * sc)); g.fillRect(Math.round(f.x * sc), Math.round(f.y * sc), z, z); }
    if (t > shoot.at) { if (!shoot.on) { shoot.on = true; shoot.t0 = t; shoot.x = 200 + ((t * 977) % 1300); shoot.y = 40 + ((t * 331) % 380); } const p = (t - shoot.t0) / 0.9;
      if (p >= 1) { shoot.on = false; shoot.at = t + 9 + ((t * 13.7) % 14); }
      else { const x = shoot.x + p * 520, y = shoot.y + p * 230, a = Math.sin(Math.PI * p) * 0.8; const lg = g.createLinearGradient((x - 180) * sc, (y - 80) * sc, x * sc, y * sc); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${a})`); g.strokeStyle = lg; g.lineWidth = Math.max(1, 4 * sc); g.beginPath(); g.moveTo((x - 180) * sc, (y - 80) * sc); g.lineTo(x * sc, y * sc); g.stroke(); } }
  }
  // ---------------------------------------------------------------- v0.7.3 the goo drop under the B: forms, lets go, slides down the window
  const DRIP = [452, 578];
  function drawDrip(g, t, sc, behind) {
    const per = 26, p = (t % per) / per, grow = Math.min(1, p / 0.18);
    let y = DRIP[1], r = 6 + 10 * grow, st = 1;
    if (p > 0.18) { const q = (p - 0.18) / 0.82; y = DRIP[1] + 20 + q * (2380 - DRIP[1]); st = 1.6 + 0.4 * Math.sin(t * 2); r = 15; }
    const overScreen = y > 648 && y < 1800;
    if (behind !== overScreen && p > 0.18) return;   // in front where it is on the frame, behind the glass where it crosses the screen
    if (behind && p <= 0.18) return;
    const a = overScreen ? 0.22 : 0.85;
    g.save(); g.globalAlpha = a; g.translate(DRIP[0] * sc, y * sc); g.scale(1, st);
    const rg = g.createRadialGradient(-r * 0.35 * sc, -r * 0.4 * sc, 1, 0, 0, r * sc); rg.addColorStop(0, 'rgba(255,220,245,1)'); rg.addColorStop(0.4, col(PINK, 0.95)); rg.addColorStop(1, col(VIO, 0.9));
    g.fillStyle = rg; g.beginPath(); g.moveTo(0, -r * 1.6 * sc); g.quadraticCurveTo(r * sc, -r * 0.3 * sc, r * sc, 0); g.arc(0, 0, r * sc, 0, Math.PI); g.quadraticCurveTo(-r * sc, -r * 0.3 * sc, 0, -r * 1.6 * sc); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-r * 0.35 * sc, -r * 0.2 * sc, r * 0.22 * sc, 0, 7); g.fill(); g.restore();
  }
  function drawStars(g, t, sc) {
    // the pixel stars around the border: twinkle, drift a little, and now spin slowly (each its own way)
    for (const s of L.stars) {
      const dx = 3.5 * Math.sin(t * s.sp + s.ph), dy = 3 * Math.cos(t * s.sp * 0.8 + s.ph * 1.3), a = 0.55 + 0.45 * Math.sin(t * s.tw + s.ph * 2);
      const ang = (s.ph % 2 < 1 ? 1 : -1) * t * (0.25 + (s.ph % 0.3)), cx = (s.x + s.w / 2 + dx) * sc, cy = (s.y + s.h / 2 + dy) * sc;
      g.save(); g.globalAlpha = Math.max(0.15, a); g.translate(cx, cy); g.rotate(ang); g.drawImage(starsImg, s.ax, s.ay, s.w, s.h, -s.w / 2 * sc, -s.h / 2 * sc, s.w * sc, s.h * sc); g.restore();
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the jelly controller (our own design)
  const PAD = { cx: 905, cy: 2050 };
  const BTN = { X: [1205, 1960, MINT], Y: [1115, 2048, PINK], A: [1295, 2048, CYAN], B: [1205, 2136, VIO] };
  const press = {};
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function squish(k, t) { const p = press[k]; if (p == null) return 0; const a = t - p; return a < 0 ? 0 : a < 0.08 ? a / 0.08 : a < 0.3 ? 1 - (a - 0.08) / 0.22 : 0; }
  const PAD_DY = 80;   // v0.7.3: the screen grew to 239 lines, the controller moved down to make room
  function drawController(g, t, sc, held) {
    g.save(); g.scale(sc, sc); g.translate(0, PAD_DY);
    // the backdrop hides the old pad completely (with a soft edge into the sky)
    g.shadowColor = 'rgba(8,6,26,1)'; g.shadowBlur = 60; g.fillStyle = 'rgba(9,7,28,0.97)'; rrect(g, 352, 1728, 1106, 612, 200); g.fill(); g.shadowBlur = 0;
    const bob = Math.sin(t * 1.1) * 3;
    g.translate(0, bob);
    // shoulder buttons, gummy tabs
    for (const [k, x] of [['L', 560], ['R', 1250]]) { const s = squish(k, t) || (held[k] ? 0.6 : 0); g.fillStyle = col(k === 'L' ? PINK : CYAN, 0.55 + 0.3 * s); rrect(g, x - 120, 1800 + 8 * s, 240, 70, 34); g.fill(); g.fillStyle = col([255, 255, 255], 0.5); g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.fillText(k, x, 1848 + 8 * s); }
    // the body: two round lobes joined by a soft bridge, jelly-glossy
    const body = new Path2D(); body.arc(640, 2050, 225, Math.PI * 0.5, Math.PI * 1.5); body.lineTo(1170, 1825); body.arc(1170, 2050, 225, -Math.PI * 0.5, Math.PI * 0.5); body.closePath();
    const gr = g.createLinearGradient(0, 1820, 0, 2280); gr.addColorStop(0, 'rgba(206,190,255,0.96)'); gr.addColorStop(0.5, 'rgba(160,140,235,0.95)'); gr.addColorStop(1, 'rgba(120,96,210,0.97)');
    g.shadowColor = col(MINT, 0.9); g.shadowBlur = 40; g.fillStyle = gr; g.fill(body); g.shadowBlur = 0;
    g.lineWidth = 12; g.strokeStyle = col(MINT, 0.95); g.stroke(body); g.lineWidth = 5; g.strokeStyle = col(PINK, 0.9); g.save(); g.translate(0, 9); g.stroke(body); g.restore();
    // a wet highlight
    g.fillStyle = 'rgba(255,255,255,0.28)'; rrect(g, 560, 1850, 690, 38, 19); g.fill();
    // jelly bubbles inside the body
    for (const [x, y, r] of [[760, 2180, 9], [1050, 2200, 7], [905, 1930, 6], [700, 1905, 5]]) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x, y + Math.sin(t + x) * 4, r, 0, 7); g.fill(); }
    // D-pad: a soft gummy plus
    const dp = [640, 2050], arm = 60, len = 105;
    g.fillStyle = 'rgba(70,50,140,0.9)'; g.beginPath(); g.arc(dp[0], dp[1], 150, 0, 7); g.fill();
    for (const [k, dx, dy] of [['UP', 0, -1], ['DOWN', 0, 1], ['LEFT', -1, 0], ['RIGHT', 1, 0]]) {
      const s = Math.max(squish(k, t), held[k] ? 1 : 0), sh = 10 * s;
      g.fillStyle = s ? col(MINT, 0.95) : 'rgba(110,90,200,1)';
      if (dx) rrect(g, dx > 0 ? dp[0] + sh : dp[0] - len - sh, dp[1] - arm / 2, len, arm, 26); else rrect(g, dp[0] - arm / 2, dy > 0 ? dp[1] + sh : dp[1] - len - sh, arm, len, 26);
      g.fill();
    }
    g.fillStyle = 'rgba(140,120,230,1)'; g.beginPath(); g.arc(dp[0], dp[1], 30, 0, 7); g.fill();
    // SELECT and START: little gummy pills with our labels
    for (const [k, x, label] of [['SELECT', 835, 'SELECT'], ['START', 975, 'START']]) {
      const s = Math.max(squish(k, t), held[k] ? 1 : 0);
      g.save(); g.translate(x, 2120); g.rotate(-0.45); g.scale(1 + 0.12 * s, 1 - 0.25 * s); g.fillStyle = s ? col(PINK, 1) : 'rgba(90,70,170,1)'; rrect(g, -45, -16, 90, 32, 16); g.fill(); g.restore();
      g.fillStyle = 'rgba(40,24,90,0.9)'; g.font = 'bold 24px monospace'; g.textAlign = 'center'; g.fillText(label, x, 2190);
    }
    g.fillStyle = 'rgba(40,24,90,0.85)'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.fillText('JELLY PAD', 905, 1990);
    // the four face buttons: round gummies that squish when pressed
    g.fillStyle = 'rgba(70,50,140,0.85)'; g.beginPath(); g.arc(1205, 2048, 170, 0, 7); g.fill();
    for (const [k, [x, y, c]] of Object.entries(BTN)) {
      const s = Math.max(squish(k, t), held[k] ? 1 : 0);
      g.save(); g.translate(x, y + 6 * s); g.scale(1 + 0.16 * s, 1 - 0.2 * s);
      g.shadowColor = col(c, 0.9); g.shadowBlur = 18 + 30 * s; g.fillStyle = col(c, 1); g.beginPath(); g.arc(0, 0, 50, 0, 7); g.fill(); g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-14, -18, 18, 10, -0.5, 0, 7); g.fill();
      g.fillStyle = 'rgba(30,16,70,0.85)'; g.font = 'bold 44px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, 0, 4); g.textBaseline = 'alphabetic';
      g.restore();
    }
    g.restore();
  }
  // where things are, for the mouse (art pixels)
  const HIT = {
    screen: [176, 648, 1616, 1800], brain: [960, 60, 1580, 520], logo: [80, 40, 900, 420],
    min: [1650, 18, 1710, 72], close: [1722, 18, 1782, 72],
    pad: { UP: [600, 1925, 680, 2010], DOWN: [600, 2090, 680, 2175], LEFT: [515, 2010, 600, 2090], RIGHT: [680, 2010, 765, 2090], SELECT: [785, 2085, 885, 2160], START: [925, 2085, 1025, 2160],
      X: [1150, 1905, 1260, 2015], Y: [1060, 1993, 1170, 2103], A: [1240, 1993, 1350, 2103], B: [1150, 2081, 1260, 2191], L: [440, 1790, 680, 1880], R: [1130, 1790, 1370, 1880] },
    controller: [352, 1808, 1458, 2400],
  };
  for (const r of Object.values(HIT.pad)) { r[1] += PAD_DY; r[3] += PAD_DY; }
  function drawWindowButtons(g, sc, hover) {
    for (const [k, [x0, y0, x1, y1]] of [['min', HIT.min], ['close', HIT.close]]) {
      const h = hover === k; g.fillStyle = h ? (k === 'close' ? 'rgba(255,110,210,0.95)' : 'rgba(110,255,190,0.95)') : 'rgba(20,14,50,0.75)';
      g.fillRect(x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc);
      g.strokeStyle = 'rgba(110,255,190,0.9)'; g.lineWidth = Math.max(1, 3 * sc); g.strokeRect(x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc);
      g.fillStyle = h ? 'rgba(16,12,40,1)' : 'rgba(235,235,255,0.95)'; const p = Math.max(1, Math.round(5 * sc)), cx = (x0 + x1) / 2 * sc, cy = (y0 + y1) / 2 * sc;
      if (k === 'min') g.fillRect(cx - 3 * p, cy + p, 6 * p, p);
      else for (let i = -2; i <= 2; i++) { g.fillRect(cx + i * p - p / 2, cy + i * p - p / 2, p, p); g.fillRect(cx - i * p - p / 2, cy + i * p - p / 2, p, p); }
    }
  }

  G.JBStage = {
    AW, AH, HIT, load, press, brain,
    draw(g, w, h, t, S, screenCanvas, held, hover) {
      const sc = w / AW;
      g.drawImage(baseAt(w, h), 0, 0);
      drawSky(g, t, sc);
      drawStars(g, t, sc);
      drawDrip(g, t, sc, false);
      drawFace(g, t, S, sc);
      drawShine(g, t, sc);
      // the SNES screen, shown at TV aspect inside the frame, pixels kept sharp
      const [x0, y0, x1, y1] = HIT.screen; g.imageSmoothingEnabled = false;
      g.drawImage(screenCanvas, Math.round(x0 * sc), Math.round(y0 * sc), Math.round((x1 - x0) * sc), Math.round((y1 - y0) * sc)); g.imageSmoothingEnabled = true;
      drawDrip(g, t, sc, true);
      drawController(g, t, sc, held);
      drawWindowButtons(g, sc, hover);
    },
    smile(t) { brain.ev = 'happy'; brain.evUntil = t + 2.5; brain.jig = 1; },
    face(name, t, dur) { brain.ev = name; brain.evUntil = t + (dur || 2); if (name === 'happy' || name === 'surprise') brain.jig = 1; },
    jiggle() { brain.jig = 1; },
  };
})(window);
