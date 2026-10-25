/* LowOrbit Chip Studio - VDOT renderer: dot-matrix lettering, dotted VDOT boxes, LEDs */
(function () {
  const F = {
    'A': '.###.#...##...#######...##...##...#', 'B': '####.#...##...#####.#...##...#####.', 'C': '.###.#...##....#....#....#...#.###.',
    'D': '###..#..#.#...##...##...##..#.###..', 'E': '######....#....####.#....#....#####', 'F': '######....#....####.#....#....#....',
    'G': '.###.#...##....#.####...##...#.####', 'H': '#...##...##...#######...##...##...#', 'I': '.###...#....#....#....#....#...###.',
    'J': '..###...#....#....#....#.#..#..##..', 'K': '#...##..#.#.#..##...#.#..#..#.#...#', 'L': '#....#....#....#....#....#....#####',
    'M': '#...###.###.#.##.#.##...##...##...#', 'N': '#...##...###..##.#.##..###...##...#', 'O': '.###.#...##...##...##...##...#.###.',
    'P': '####.#...##...#####.#....#....#....', 'Q': '.###.#...##...##...##.#.##..#..##.#', 'R': '####.#...##...#####.#.#..#..#.#...#',
    'S': '.#####....#.....###.....#....#####.', 'T': '#####..#....#....#....#....#....#..', 'U': '#...##...##...##...##...##...#.###.',
    'V': '#...##...##...##...##...#.#.#...#..', 'W': '#...##...##...##.#.##.#.##.#.#.#.#.', 'X': '#...##...#.#.#...#...#.#.#...##...#',
    'Y': '#...##...#.#.#...#....#....#....#..', 'Z': '#####....#...#...#...#...#....#####',
    '0': '.###.#...##..###.#.###..##...#.###.', '1': '..#...##....#....#....#....#...###.', '2': '.###.#...#....#...#...#...#...#####',
    '3': '#####...#...#.....#.....##...#.###.', '4': '...#...##..#.#.#..#.#####...#....#.', '5': '######....####.....#....##...#.###.',
    '6': '..##..#...#....####.#...##...#.###.', '7': '#####....#...#...#...#....#....#...', '8': '.###.#...##...#.###.#...##...#.###.',
    '9': '.###.#...##...#.####....#...#..##..',
    ' ': '...................................', '.': '..............................##...', ',': '.....................##....#...#...',
    ':': '......##...##.........##...##......', '-': '...............#####...............', '+': '.......#....#..#####..#....#.......',
    '/': '.........#...#...#...#...#.........', '%': '##...##..#...#...#...#...#..##...##', '#': '.#.#..#.#.#####.#.#.#####.#.#..#.#.',
    '(': '...#...#...#....#....#.....#.....#.', ')': '.#.....#.....#....#....#...#...#...', '!': '..#....#....#....#....#.........#..',
    '?': '.###.#...#....#...#...#.........#..', "'": '..#....#...#........................', '"': '.#.#..#.#..........................',
    '<': '...#...#...#...#.....#.....#.....#.', '>': '.#.....#.....#.....#...#...#...#...', '=': '..........#####.....#####..........',
    '_': '..............................#####', '*': '.......#..#.#.#.###.#.#.#..#.......', '&': '.##..#..#.#.#...#...#.#.##..#..##.#',
    '[': '.###..#....#....#....#....#....###.', ']': '.###....#....#....#....#....#..###.', '|': '..#....#....#....#....#....#....#..',
    '@': '.###.#...##.####.#.##.####.....###.', '$': '..#...#####.#...###...#.#####...#..',
    '\x01': '#....##...###..####.###..##...#....', '\x02': '.....####.####.####.####...........',
    '^': '..#...###.#.#.#..#....#....#....#..', '\x05': '..#....#....#....#..#.#.#.###...#..',
  };
  const GLYPH = {};
  for (const k in F) { const s = F[k]; const rows = []; for (let r = 0; r < 7; r++) rows.push(s.slice(r * 5, r * 5 + 5)); GLYPH[k] = rows; }

  const V = window.VDOT = {
    C: { bg: '#000000', on: '#ffb648', mid: '#c98a33', dim: '#5c4119', off: '#1c1408', hot: '#fff1d2', warn: '#ff7a3a', panel: '#050302' },
    cache: new Map(),
    dpr: 1,
  };

  function cacheKey(parts) { return parts.join('|'); }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * V.dpr)); c.height = Math.max(1, Math.ceil(h * V.dpr)); return c; }

  // dot-matrix text, cached; pitch = distance between dot centers (CSS px)
  V.textWidth = (str, pitch) => String(str).length * 6 * pitch - pitch;
  V.textImage = function (str, pitch, color, glow) {
    str = String(str).toUpperCase();
    const key = cacheKey(['t', str, pitch, color, glow ? 1 : 0, V.dpr]);
    let img = V.cache.get(key); if (img) return img;
    const pad = glow ? 4 : 1;
    const w = V.textWidth(str, pitch) + pad * 2, h = 7 * pitch + pad * 2;
    const c = makeCanvas(w, h), g = c.getContext('2d'); g.scale(V.dpr, V.dpr);
    g.fillStyle = color;
    if (glow) { g.shadowColor = color; g.shadowBlur = pitch * 2.2; }
    const ds = Math.max(1, pitch * 0.78);
    let x = pad;
    for (const ch of str) {
      const gl = GLYPH[ch] || GLYPH['?'];
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (gl[r][q] === '#') g.fillRect(x + q * pitch, pad + r * pitch, ds, ds);
      x += 6 * pitch;
    }
    img = { c, w, h, pad };
    if (V.cache.size > 3000) V.cache.clear();
    V.cache.set(key, img);
    return img;
  };
  V.text = function (g, str, x, y, pitch, color, opts = {}) {
    const img = V.textImage(str, pitch, color || V.C.on, opts.glow !== false);
    let dx = x - img.pad;
    if (opts.align === 'center') dx = x - img.w / 2;
    else if (opts.align === 'right') dx = x - img.w + img.pad;
    g.drawImage(img.c, dx, y - img.pad, img.w, img.h);
    return img.w - img.pad * 2;
  };
  V.fitPitch = (str, maxW, pref) => { let p = pref; while (p > 1.2 && V.textWidth(str, p) > maxW) p -= 0.2; return p; };

  // dotted rectangle outline (the VDOT box)
  V.dotBox = function (g, x, y, w, h, color, step = 3, size = 1.4) {
    const key = cacheKey(['b', Math.round(w), Math.round(h), color, step, size, V.dpr]);
    let img = V.cache.get(key);
    if (!img) {
      const c = makeCanvas(w + 4, h + 4), cg = c.getContext('2d'); cg.scale(V.dpr, V.dpr); cg.fillStyle = color;
      const nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step));
      for (let i = 0; i <= nx; i++) { const px = 2 + i * w / nx - size / 2; cg.fillRect(px, 2 - size / 2, size, size); cg.fillRect(px, 2 + h - size / 2, size, size); }
      for (let j = 1; j < ny; j++) { const py = 2 + j * h / ny - size / 2; cg.fillRect(2 - size / 2, py, size, size); cg.fillRect(2 + w - size / 2, py, size, size); }
      img = { c }; V.cache.set(key, img);
    }
    g.drawImage(img.c, x - 2, y - 2, w + 4, h + 4);
  };
  V.led = function (g, x, y, r, on, color) {
    g.save();
    if (on) { g.shadowColor = color || V.C.on; g.shadowBlur = r * 4; g.fillStyle = color || V.C.on; }
    else g.fillStyle = V.C.dim;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
  };
  // horizontal dotted line
  V.dotLine = function (g, x0, x1, y, color, step = 4, size = 1.2) {
    g.fillStyle = color; for (let x = x0; x <= x1; x += step) g.fillRect(x - size / 2, y - size / 2, size, size);
  };
  V.dotVLine = function (g, x, y0, y1, color, step = 4, size = 1.2) {
    g.fillStyle = color; for (let y = y0; y <= y1; y += step) g.fillRect(x - size / 2, y - size / 2, size, size);
  };
})();
