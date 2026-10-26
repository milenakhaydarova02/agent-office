// The office building in cross-section, 256×312 logical pixels.
// Building coordinates run from y = -TOP (HUD) to 223 (street); canvases are shifted by TOP.
// Static layers (background + foreground) are pre-rendered once; drawDynamic() paints
// everything that moves: sky, screens, LEDs, clock, door, phone, car.
const W = 256;
const TOP = 88;
const H = 224 + TOP;
const FLOOR = { 0: 206, 1: 192, 2: 104, 3: 16 };
const LADDER_X = 128;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAL = {
  ink: '#140c1c', black: '#000000', white: '#f8f8f8',
  brick: '#8c2a1c', brickL: '#b04028', brickD: '#5a1810', mortar: '#3a1410',
  slab: '#5c5c6c', slabL: '#8a8a9c', slabD: '#34343e',
  wood: '#a8682c', woodL: '#c8843c', woodD: '#6a3e1a', woodDD: '#4a2a10',
  metal: '#9aa4b4', metalL: '#c8d0dc', metalD: '#5c6474', metalDD: '#3a404c',
  base: '#3a2414',
  green: '#38d870', red: '#e83838', yellow: '#f8d838', amber: '#f8a838', cyan: '#58e8e8', purple: '#9858e8', pink: '#f878b8',
};

const ROOMS = [
  { x: 6, w: 104, f: 2, wall: '#3c4c80', stripe: '#46588e', panel: '#2c3a66', name: 'claude' },
  { x: 146, w: 104, f: 2, wall: '#4c3274', stripe: '#573a82', panel: '#38245a', name: 'qwen' },
  { x: 6, w: 104, f: 1, wall: '#2e5a52', stripe: '#36665c', panel: '#22463f', name: 'lab' },
  { x: 146, w: 50, f: 1, wall: '#30364a', stripe: '#383f54', panel: '#242838', name: 'server' },
  { x: 196, w: 54, f: 1, wall: '#6a5a3a', stripe: '#766644', panel: '#4e4228', name: 'kitchen' },
  { x: 6, w: 104, f: 3, wall: '#6a3c34', stripe: '#784640', panel: '#4e2a24', name: 'rec' },
  { x: 146, w: 104, f: 3, wall: '#28485a', stripe: '#305468', panel: '#1c3442', name: 'games' },
];

const Scene = (() => {
  const bg = document.createElement('canvas');
  const fg = document.createElement('canvas');
  bg.width = fg.width = W;
  bg.height = fg.height = H;

  function painter(cv) {
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, TOP);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const P = (x, y, c) => R(x, y, 1, 1, c);
    return { g, R, P };
  }

  // ---------------------------------------------------------------- background
  function buildBackground() {
    const { g, R, P } = painter(bg);
    const rand = rng(7);

    // exterior brick shell
    R(0, -76, W, 276, PAL.mortar);
    for (let y = -76; y < 200; y += 4) {
      const off = (((y + 76) / 4) % 2) * 4;
      for (let x = -8 + off; x < W; x += 8) {
        R(x, y, 7, 3, rand() < 0.15 ? PAL.brickD : PAL.brick);
        P(x, y, PAL.brickL);
      }
    }

    // roof: parapet + water tank + antenna base
    R(0, -68, W, 4, PAL.slabD);
    R(0, -68, W, 1, PAL.slabL);
    for (let x = 4; x < W; x += 12) R(x, -67, 6, 1, PAL.slab);
    R(226, -70, 7, 2, PAL.metalD);

    for (const r of ROOMS) drawRoomShell(g, R, P, r);

    // stairwell column between the rooms (all floors)
    for (const f of [1, 2, 3]) {
      const top = FLOOR[f] - 80;
      R(110, top, 36, 80, '#2a2a36');
      for (let y = top; y < FLOOR[f]; y += 6) {
        for (let x = 114 + ((y / 6) % 2) * 5; x < 142; x += 10) R(x, y, 9, 5, '#30303e');
      }
      // door posts with a header
      R(110, top, 4, 52, PAL.woodD); R(142, top, 4, 52, PAL.woodD);
      R(110, top + 52, 4, 1, PAL.woodL); R(142, top + 52, 4, 1, PAL.woodL);
      R(110, top, 36, 3, PAL.slabD);
    }

    // floor slabs
    for (const y of [16, 104, 192]) {
      R(0, y, W, 8, PAL.slab);
      R(0, y, W, 1, PAL.slabL);
      R(0, y + 7, W, 1, PAL.slabD);
    }
    // hatches in the upper slabs
    for (const y of [16, 104]) {
      R(118, y, 20, 8, '#1c1c26');
      for (let x = 116; x < 140; x += 4) { R(x, y, 2, 1, PAL.yellow); R(x + 2, y, 2, 1, PAL.ink); }
    }

    // ladder through all floors
    for (const x of [122, 133]) { R(x, 6, 2, 186, PAL.metalD); R(x, 6, 1, 186, PAL.metal); }
    for (let y = 10; y < 192; y += 6) { R(124, y, 9, 1, PAL.metal); R(124, y + 1, 9, 1, PAL.metalDD); }

    // street
    R(0, 200, W, 6, '#8a8a94');
    for (let x = 0; x < W; x += 16) R(x, 200, 1, 6, '#6a6a74');
    R(0, 200, W, 1, '#a8a8b4');
    R(0, 206, W, 1, '#c8c8d0');
    R(0, 207, W, 17, '#2c2c34');
    for (let x = 4; x < W; x += 16) R(x, 215, 8, 1, '#c8a838');
    // hydrant + bin
    R(30, 199, 4, 6, '#c82020'); R(29, 201, 6, 1, '#e84040'); R(31, 198, 2, 1, '#e84040');
    R(218, 198, 7, 7, '#3a5a3a'); R(217, 198, 9, 1, '#5a7a5a');

    drawClaudeOffice(R, P, g);
    drawQwenOffice(R, P, g);
    drawLab(R, P, rand);
    drawServerAndKitchen(R, P);
    drawRecRoom(R, P);
    drawGamesRoom(R, P);
    drawDecor(R, P);
  }

  // Extra furniture and wall clutter, so rooms look lived in.
  function drawDecor(R, P) {
    const shelf = (x, y, w, items) => {
      R(x, y, w, 2, PAL.woodD); R(x, y, w, 1, PAL.woodL);
      let ix = x + 2;
      for (const [iw, ih, c] of items) { R(ix, y - ih, iw, ih, c); P(ix, y - ih, 'rgba(255,255,255,0.4)'); ix += iw + 1; }
    };
    const frame = (x, y, w, h, inner, c2) => {
      R(x, y, w, h, PAL.woodDD); R(x + 1, y + 1, w - 2, h - 2, inner);
      R(x + 1, y + h - 1 - Math.floor(h / 3), w - 2, Math.floor(h / 3), c2);
      R(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.3)');
    };

    // Claude's office: pictures, shelf, desk lamp, sticky notes, rug
    frame(12, 48, 14, 10, '#f8a868', '#38588a');
    frame(30, 52, 8, 9, '#e8e0c8', '#c85838');
    shelf(14, 70, 24, [[3, 6, '#c83838'], [2, 7, '#3858c8'], [3, 5, '#38a048'], [2, 8, '#d8a838'], [4, 4, '#e8e0c8']]);
    R(33, 63, 4, 3, '#b85a30'); R(34, 60, 2, 3, '#38a048');
    R(35, 81, 2, 2, '#f8e858'); R(53, 84, 2, 2, '#f878b8'); R(35, 84, 2, 2, '#58d8f8');
    R(56, 92, 5, 2, PAL.metalDD); R(58, 85, 1, 7, PAL.metalD); R(55, 83, 6, 2, '#f8d838'); R(55, 85, 6, 1, '#c8a018');
    R(24, 102, 46, 2, '#7a3a4a'); R(24, 102, 46, 1, '#a45a6a'); for (let x = 25; x < 70; x += 4) P(x, 103, '#e8c8a0');

    // Qwen's room: neon, trophy shelf, string lights, rug, cable
    R(214, 38, 30, 11, PAL.ink); R(215, 39, 28, 9, '#10081c');
    FONT.draw(bgCtx(), 'GPU', 218, 41, '#58f8d8');
    R(216, 47, 26, 1, '#f858b8');
    shelf(214, 62, 30, [[3, 6, '#f8d838'], [3, 5, '#58e8e8'], [4, 7, '#c8a0ff'], [3, 4, '#f87838'], [3, 6, '#e8e8f0']]);
    R(148, 28, 98, 1, '#241838');
    for (let x = 150; x < 246; x += 6) { R(x, 29, 2, 2, ['#f8d838', '#f858b8', '#58e8e8', '#58f878'][(x / 6) % 4 | 0]); }
    R(150, 102, 48, 2, '#4a2a7a'); R(150, 102, 48, 1, '#6a4aa0');
    R(238, 96, 1, 8, '#1c1c24'); R(236, 103, 3, 1, '#1c1c24');
    R(193, 98, 4, 3, '#58e8e8'); R(193, 98, 4, 1, '#98f8f8');

    // lab: hazard sign, pipes, floor tiles, goggles
    R(40, 114, 70, 2, PAL.metalD); R(40, 114, 70, 1, PAL.metal);
    R(38, 126, 7, 7, '#f8d838'); R(39, 127, 5, 5, PAL.ink); R(41, 128, 1, 2, '#f8d838'); P(41, 131, '#f8d838');
    for (let x = 8; x < 108; x += 8) R(x, 188, 4, 4, 'rgba(255,255,255,0.05)');
    R(104, 140, 3, 3, '#58c8e8'); R(104, 140, 3, 1, '#a8e8f8');

    // server room: hazard floor stripe, rack labels, warning light
    for (let x = 146; x < 196; x += 6) { R(x, 188, 3, 2, PAL.yellow); R(x + 3, 188, 3, 2, PAL.ink); }
    R(150, 128, 11, 3, '#c83838'); R(166, 128, 11, 3, '#38a8c8');
    R(188, 120, 4, 3, '#f83838'); R(188, 120, 4, 1, '#ffa0a0');

    // kitchen: mug shelf, fruit bowl, floor checks, wall clock
    shelf(198, 148, 18, [[2, 3, '#e8e8f0'], [2, 3, '#c83838'], [2, 4, '#58a8f8'], [2, 3, '#f8d838']]);
    R(225, 176, 7, 4, '#d8d0c0'); R(226, 174, 2, 2, '#c83838'); R(229, 175, 2, 2, '#f8a838'); R(227, 173, 1, 1, '#38a048');
    for (let x = 196; x < 234; x += 8) { R(x, 188, 4, 2, 'rgba(0,0,0,0.25)'); R(x + 4, 190, 4, 2, 'rgba(0,0,0,0.25)'); }
    R(236, 128, 9, 9, PAL.ink); R(237, 129, 7, 7, '#f8f0d8'); P(240, 130, PAL.ink); P(240, 135, PAL.ink); R(240, 131, 1, 3, PAL.ink); R(241, 133, 2, 1, '#c83838');

    // rec room: trophies, yoga mat, wall stripe
    shelf(90, -33, 16, [[3, 5, '#f8d838'], [3, 4, '#c8c8d0'], [3, 6, '#d88838']]);
    R(10, 11, 14, 5, '#8848a8'); R(10, 11, 14, 1, '#a868c8'); R(10, 15, 14, 1, '#5a2a78');
    R(8, -22, 40, 1, 'rgba(255,255,255,0.08)');

    // games room: neon strip, game shelves
    R(150, -60, 98, 1, '#38e8f8'); R(150, -59, 98, 1, 'rgba(56,232,248,0.3)');
    shelf(184, -34, 24, [[3, 5, '#e83838'], [3, 5, '#3858c8'], [3, 5, '#38a048'], [3, 5, '#f8d838'], [3, 5, '#c858f8'], [3, 5, '#f87838']]);
    shelf(184, -42, 24, [[4, 4, '#58e8e8'], [3, 5, '#f858b8'], [4, 4, '#e8e8f0']]);
  }

  // third floor, left: ping-pong, darts, window
  function drawRecRoom(R, P) {
    plaque(R, 10, -58, 'ОТДЫХ', '#f8b878', '#4a2010');
    // window
    R(55, -57, 32, 33, PAL.woodD); R(56, -56, 30, 31, PAL.wood);
    R(54, -24, 34, 3, PAL.woodL);
    // dartboard
    R(8, -42, 11, 11, PAL.ink); R(9, -41, 9, 9, '#e8e0c8'); R(10, -40, 7, 7, '#c83838');
    R(11, -39, 5, 5, '#e8e0c8'); R(12, -38, 3, 3, '#38a048'); P(13, -37, '#c83838');
    R(13, -31, 1, 3, PAL.woodD);
    // ping-pong table
    R(44, 4, 49, 2, '#2a8a4a'); R(44, 4, 49, 1, '#58c878'); R(44, 6, 49, 1, '#1a5a30');
    R(68, 0, 1, 4, '#e8e8e8'); R(67, 0, 3, 1, '#c8c8c8');
    R(47, 7, 2, 9, PAL.metalD); R(89, 7, 2, 9, PAL.metalD); R(67, 7, 2, 9, PAL.metalDD);
    // scoreboard
    R(90, -50, 16, 10, PAL.ink); R(91, -49, 14, 8, '#101820');
    // dumbbells
    R(98, 12, 9, 2, PAL.metalDD); R(98, 11, 2, 4, '#3a3a44'); R(105, 11, 2, 4, '#3a3a44');
  }

  // third floor, right: arcade, TV and sofa, guitar
  function drawGamesRoom(R, P) {
    plaque(R, 150, -58, 'ИГРЫ', '#78d8f8', '#102838');
    // arcade cabinet
    R(149, -24, 15, 40, PAL.ink); R(150, -23, 13, 38, '#4830a0'); R(150, -23, 13, 4, '#f8d838');
    R(151, -22, 11, 2, '#f87838');
    R(151, -17, 11, 10, PAL.ink);
    R(150, -6, 13, 3, '#3a2480'); R(153, -9, 1, 3, PAL.ink); R(152, -10, 3, 1, '#e83838'); P(158, -6, '#38d870'); P(160, -6, '#58a8f8');
    R(151, -2, 11, 16, '#3a2480'); R(154, 3, 5, 3, '#2a1a60');
    // guitar on the wall
    R(176, -48, 1, 14, PAL.woodDD); R(174, -36, 5, 7, '#c86428'); R(175, -35, 3, 5, '#e88a40'); P(176, -33, PAL.ink);
    // TV on the wall + console
    R(212, -46, 34, 22, PAL.ink); R(213, -45, 32, 20, '#101828');
    R(226, -24, 6, 2, PAL.metalD);
    R(234, 10, 10, 6, '#2a2a34'); R(234, 10, 10, 1, '#4a4a58'); P(242, 12, '#38d870');
    // sofa (back on the left, people face the TV)
    R(186, 0, 5, 16, '#2a6a8a'); R(186, 0, 5, 1, '#4a8aaa');
    R(186, 7, 40, 5, '#2a6a8a'); R(186, 7, 40, 1, '#4a8aaa');
    R(224, 3, 4, 9, '#2a6a8a');
    R(188, 12, 2, 4, PAL.woodDD); R(222, 12, 2, 4, PAL.woodDD);
    // rug
    R(184, 15, 46, 1, '#a84848');
  }

  function drawRoomShell(g, R, P, r) {
    const top = FLOOR[r.f] - 80;
    const fy = FLOOR[r.f];
    R(r.x, top, r.w, 80, r.wall);
    for (let x = r.x + 3; x < r.x + r.w; x += 8) R(x, top, 1, 66, r.stripe);
    R(r.x, fy - 14, r.w, 10, r.panel);
    R(r.x, fy - 15, r.w, 1, PAL.woodL);
    R(r.x, fy - 4, r.w, 4, PAL.base);
    R(r.x, fy - 4, r.w, 1, PAL.woodD);
    R(r.x, top, r.w, 2, PAL.ink);
    R(r.x, top + 2, r.w, 1, 'rgba(0,0,0,0.35)');
    // wall plaster speckle and floor planks
    const rr = rng(r.x * 7 + r.f * 31);
    for (let i = 0; i < 70; i++) P(r.x + Math.floor(rr() * r.w), top + 4 + Math.floor(rr() * 56), rr() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.05)');
    for (let x = r.x + 5; x < r.x + r.w; x += 9 + Math.floor(rr() * 5)) R(x, fy - 3, 1, 3, 'rgba(0,0,0,0.3)');
    R(r.x, fy - 2, r.w, 1, 'rgba(255,255,255,0.05)');
    // ceiling lamp
    const lx = r.x + Math.floor(r.w / 2) - 3;
    R(lx + 3, top + 2, 1, 4, PAL.metalD);
    R(lx, top + 6, 7, 3, PAL.metalD);
    R(lx + 1, top + 6, 5, 1, PAL.metal);
    R(lx + 2, top + 9, 3, 1, '#fff8c8');
  }

  function plaque(R, x, y, text, bgc, fgc) {
    const w = FONT.width(text) + 6;
    R(x, y, w, 11, PAL.ink);
    R(x + 1, y + 1, w - 2, 9, bgc);
    R(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.4)');
    FONT.draw(bgCtx(), text, x + 3, y + 2, fgc);
  }
  let _bgCtx = null;
  function bgCtx() { return _bgCtx || (_bgCtx = bg.getContext('2d')); }

  function drawClaudeOffice(R, P) {
    plaque(R, 10, 30, 'CLAUDE', '#d8a848', '#3a2410');
    // window frame (sky painted dynamically)
    R(73, 31, 34, 41, PAL.woodD); R(74, 32, 32, 39, PAL.wood);
    R(72, 71, 36, 3, PAL.woodL); R(72, 73, 36, 1, PAL.woodDD);
    // telescope on a tripod
    R(97, 88, 1, 15, PAL.metalD); R(94, 95, 1, 8, PAL.metalD); R(100, 95, 1, 8, PAL.metalD);
    R(93, 102, 9, 1, PAL.metalDD);
    for (let i = 0; i < 12; i++) R(90 + i, 87 - Math.floor(i / 2), 3, 3, i < 2 ? PAL.ink : '#c8a848');
    R(100, 80, 3, 2, '#f0d878');
    // desk
    R(18, 94, 43, 3, PAL.woodL); R(18, 96, 43, 1, PAL.woodD);
    R(20, 97, 2, 7, PAL.woodD); R(57, 97, 2, 7, PAL.woodD);
    // monitor
    R(36, 79, 17, 13, PAL.ink); R(37, 80, 15, 11, '#24243a');
    R(43, 92, 3, 2, PAL.metalD); R(40, 93, 9, 1, PAL.metalD);
    R(50, 93, 8, 1, '#c8c8d0'); R(50, 92, 8, 1, '#8a8a94');
    // phone + mug
    R(22, 91, 7, 3, '#2a2a3a'); R(23, 90, 5, 1, '#3a3a4a'); R(21, 89, 9, 1, '#2a2a3a');
    R(31, 90, 3, 4, '#f8f8f8'); R(34, 91, 1, 2, '#f8f8f8'); R(31, 90, 3, 1, '#6a3a1a');
    // chair
    R(71, 86, 3, 12, '#2a2a3a'); R(72, 87, 1, 10, '#3a3a50');
    R(62, 97, 12, 2, '#2a2a3a'); R(62, 97, 12, 1, '#44445a');
    R(66, 99, 2, 3, PAL.metalD); R(63, 102, 8, 1, PAL.metalDD); P(63, 103, PAL.ink); P(70, 103, PAL.ink);
    // plant
    R(8, 96, 8, 8, '#b85a30'); R(8, 96, 8, 1, '#d87a48'); R(9, 103, 6, 1, '#8a3a18');
    const leaf = [[11, 82], [8, 85], [14, 85], [10, 88], [13, 89], [7, 90], [15, 91], [11, 92], [9, 93], [13, 94]];
    for (const [x, y] of leaf) { R(x, y, 3, 2, '#38a048'); P(x + 1, y, '#68d070'); }
    R(11, 88, 1, 8, '#2a6a30');
  }

  function drawQwenOffice(R, P) {
    // poster with a big Q
    R(150, 30, 24, 28, PAL.ink); R(151, 31, 22, 26, '#6a40c0'); R(151, 31, 22, 1, '#9a70f0');
    FONT.draw(bgCtx(), 'Q', 157, 35, '#f8f8f8', 2);
    R(151, 53, 22, 3, '#4a2890');
    plaque(R, 150, 61, 'QWEN', '#58e8e8', '#14304a');
    // window
    R(181, 31, 30, 37, PAL.woodD); R(182, 32, 28, 35, PAL.wood);
    R(180, 67, 32, 3, PAL.woodL);
    // beanbag + pizza box
    R(176, 95, 16, 9, '#c84878'); R(178, 93, 12, 2, '#c84878'); R(178, 93, 6, 1, '#e86898'); R(176, 103, 16, 1, '#8a2850');
    R(150, 101, 14, 3, '#e8c890'); R(150, 101, 14, 1, '#f8e8b8'); R(155, 102, 4, 1, '#c84020');
    // desk with dual monitors
    R(203, 94, 38, 3, PAL.woodL); R(203, 96, 38, 1, PAL.woodD);
    R(205, 97, 2, 7, PAL.woodD); R(237, 97, 2, 7, PAL.woodD);
    R(211, 79, 14, 12, PAL.ink); R(226, 79, 14, 12, PAL.ink);
    R(217, 91, 2, 3, PAL.metalD); R(232, 91, 2, 3, PAL.metalD);
    R(213, 93, 22, 1, PAL.metalD);
    R(204, 93, 7, 1, '#c8c8d0');
    // lava lamp base (blob is dynamic)
    R(205, 84, 4, 1, PAL.metalD); R(204, 92, 6, 2, PAL.metalD);
    // chair (back is on the left: Qwen faces right)
    R(186, 86, 3, 12, '#3a2a5a'); R(187, 87, 1, 10, '#5a4a80');
    R(186, 97, 12, 2, '#3a2a5a'); R(186, 97, 12, 1, '#5a4a80');
    R(191, 99, 2, 3, PAL.metalD); R(188, 102, 8, 1, PAL.metalDD);
    // GPU tower
    R(241, 72, 9, 32, PAL.ink); R(242, 73, 7, 30, '#2a2a36');
    R(243, 76, 5, 5, '#1c1c24'); R(243, 84, 5, 5, '#1c1c24');
    R(242, 100, 7, 1, '#3a3a48');
  }

  function drawLab(R, P, rand) {
    plaque(R, 10, 118, 'ЛАБ', '#a8e8c8', '#143a2a');
    // bookshelves (archive)
    R(8, 132, 28, 60, PAL.woodDD); R(9, 133, 26, 58, PAL.woodD);
    const colors = ['#c83838', '#3858c8', '#38a048', '#d8a838', '#8848a8', '#e87830', '#38a8a8', '#e8e0c8'];
    for (let s = 0; s < 4; s++) {
      const y = 134 + s * 14;
      R(9, y + 12, 26, 2, PAL.wood);
      let x = 10;
      while (x < 33) {
        const w = 2 + Math.floor(rand() * 2);
        const h = 8 + Math.floor(rand() * 4);
        const c = colors[Math.floor(rand() * colors.length)];
        if (x + w > 34) break;
        R(x, y + 12 - h, w, h, c);
        P(x, y + 12 - h, 'rgba(255,255,255,0.35)');
        x += w + (rand() < 0.2 ? 1 : 0);
      }
    }
    // chalkboard
    R(46, 124, 58, 24, PAL.woodD); R(48, 126, 54, 20, '#24503a');
    R(48, 146, 54, 2, PAL.wood);
    FONT.draw(bgCtx(), 'AI+Q=?', 51, 129, '#e8f0e8');
    for (let i = 0; i < 26; i++) P(74 + i, 140 - Math.round(Math.sin(i / 3.2) * 3), '#f8e8a0');
    R(58, 139, 10, 1, '#c8d8c8'); R(52, 143, 18, 1, '#8aa898');
    // lab bench
    R(44, 180, 65, 3, '#d8d8e0'); R(44, 182, 65, 1, '#8a8a94');
    // microscope
    R(88, 171, 2, 9, PAL.metalD); R(86, 178, 7, 2, PAL.metalDD); R(89, 170, 4, 2, PAL.metal); R(91, 174, 3, 1, PAL.metalD);
    // burner
    R(66, 175, 3, 5, PAL.metalD); R(65, 179, 5, 1, PAL.metalDD);
    // rack of test tubes
    R(103, 177, 6, 1, PAL.woodD);
    for (let i = 0; i < 3; i++) { R(103 + i * 2, 171, 1, 6, '#c8dcf0'); R(103 + i * 2, 174, 1, 3, ['#e85858', '#58e070', '#5898e8'][i]); }
  }

  function drawServerAndKitchen(R, P) {
    plaque(R, 148, 118, 'SERVER', '#8a94a8', '#14141c');
    for (const x of [148, 164]) {
      R(x, 134, 15, 58, PAL.ink); R(x + 1, 135, 13, 56, '#1c2028');
      for (let y = 137; y < 188; y += 5) { R(x + 2, y, 11, 4, '#2c3240'); R(x + 2, y, 11, 1, '#3c4456'); }
    }
    // cable tray
    R(146, 114, 50, 2, PAL.metalD);
    for (let x = 150; x < 194; x += 6) R(x, 116, 1, 3, '#3858c8');
    // terminal stand
    R(178, 172, 4, 1, PAL.metalD); R(179, 173, 2, 19, PAL.metalD); R(176, 190, 8, 2, PAL.metalDD);
    R(176, 166, 8, 6, PAL.ink); R(177, 167, 6, 4, '#0c2a18');

    // kitchen: cabinets, window, counter, coffee machine
    R(198, 124, 18, 14, PAL.woodD); R(199, 125, 7, 12, PAL.wood); R(207, 125, 8, 12, PAL.wood);
    P(205, 131, PAL.metalL); P(208, 131, PAL.metalL);
    R(219, 124, 15, 22, PAL.woodD); R(220, 125, 13, 20, '#000');
    R(198, 180, 34, 3, '#e8e0d0'); R(198, 182, 34, 1, '#a89c88');
    R(202, 164, 11, 16, '#2a2a34'); R(203, 165, 9, 3, '#4a4a5a'); R(205, 172, 5, 4, '#1c1c24'); R(206, 176, 3, 3, '#f8f8f8');
    R(220, 174, 4, 6, '#e8f0f8'); R(221, 176, 2, 3, '#58a8e8');
    // street door
    R(234, 160, 15, 32, PAL.woodDD);
    R(233, 158, 17, 2, PAL.woodD);
    R(236, 152, 11, 5, '#18a048'); P(239, 154, '#f8f8f8'); R(240, 153, 1, 3, '#f8f8f8'); P(241, 154, '#f8f8f8'); P(243, 154, '#f8f8f8'); R(242, 153, 1, 3, '#f8f8f8');
  }

  // ---------------------------------------------------------------- foreground
  function buildForeground() {
    const { R, P } = painter(fg);
    // desk fronts and counters that hide legs
    R(18, 97, 37, 7, PAL.wood); R(18, 97, 37, 1, PAL.woodD);
    R(20, 99, 15, 4, PAL.woodL); R(37, 99, 15, 4, PAL.woodL); P(27, 100, PAL.metalD); P(44, 100, PAL.metalD);
    R(207, 97, 30, 7, PAL.wood); R(207, 97, 30, 1, PAL.woodD);
    R(209, 99, 12, 4, PAL.woodL); R(223, 99, 12, 4, PAL.woodL); P(215, 100, PAL.metalD); P(229, 100, PAL.metalD);
    // lab bench cabinets
    R(44, 183, 65, 9, '#5a6a78'); R(44, 183, 65, 1, '#3a4450');
    for (let x = 46; x < 106; x += 16) { R(x, 185, 14, 6, '#6a7c8c'); R(x + 6, 187, 2, 1, PAL.metalL); }
    // sofa front (hides the legs of people sitting on it)
    R(190, 10, 34, 3, '#235a76'); R(190, 10, 34, 1, '#3a7a9a');
    // kitchen counter
    R(198, 183, 34, 9, '#9a7a50'); R(198, 183, 34, 1, '#6a5030');
    R(200, 185, 14, 6, '#aa8a5e'); R(216, 185, 14, 6, '#aa8a5e'); P(207, 187, PAL.metalL); P(223, 187, PAL.metalL);
  }

  // ---------------------------------------------------------------- dynamic
  function skyColors(hour) {
    if (hour >= 7 && hour < 17) return { top: '#3c8ce8', bot: '#8cc8f8', night: 0 };
    if (hour >= 17 && hour < 20) return { top: '#4a3c88', bot: '#f8885a', night: 0.4 };
    if (hour >= 5 && hour < 7) return { top: '#3c4c98', bot: '#f8a878', night: 0.5 };
    return { top: '#080c24', bot: '#1c2458', night: 1 };
  }

  const skyline = (() => {
    const r = rng(42);
    const b = [];
    let x = 0;
    while (x < 80) { const w = 5 + Math.floor(r() * 7); b.push({ x, w, h: 8 + Math.floor(r() * 20), seed: Math.floor(r() * 1e6) }); x += w + 1; }
    return b;
  })();

  function drawSky(g, x, y, w, h, t, hour, par) {
    const sc = skyColors(hour);
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = mix(sc.top, sc.bot, i / (bands - 1));
      g.fillRect(x, y + Math.floor((h * i) / bands), w, Math.ceil(h / bands) + 1);
    }
    if (sc.night > 0.3) {
      const r = rng(9 + par);
      for (let i = 0; i < 10; i++) {
        const sx = x + Math.floor(r() * w), sy = y + Math.floor(r() * h * 0.5);
        if ((Math.sin(t * 2 + i * 7) + 1) / 2 > 0.3) { g.fillStyle = '#f8f8d8'; g.fillRect(sx, sy, 1, 1); }
      }
      g.fillStyle = '#f0f0d0'; g.fillRect(x + w - 9, y + 4, 4, 4); g.fillStyle = mix(sc.top, sc.bot, 0.1); g.fillRect(x + w - 8, y + 4, 2, 2);
    } else {
      g.fillStyle = '#f8f0a0'; g.fillRect(x + 4, y + 4, 5, 5);
      const cx = x + ((t * 2 + par * 13) % (w + 20)) - 10;
      g.fillStyle = '#f8f8f8'; g.fillRect(Math.floor(cx), y + 9, 9, 2); g.fillRect(Math.floor(cx) + 2, y + 8, 5, 1);
    }
    // skyline
    for (const b of skyline) {
      const bx = x + b.x - par * 9;
      const by = y + h - b.h;
      g.fillStyle = sc.night ? '#10142c' : '#5a6c8c';
      g.fillRect(bx, by, b.w, b.h);
      if (sc.night > 0.3) {
        const r = rng(b.seed);
        for (let wy = by + 2; wy < y + h - 1; wy += 3) {
          for (let wx = bx + 1; wx < bx + b.w - 1; wx += 2) {
            const on = r() < 0.35 !== (Math.sin(t * 0.3 + wx * 3.1 + wy) > 0.97);
            if (on) { g.fillStyle = '#f8d878'; g.fillRect(wx, wy, 1, 1); }
          }
        }
      }
    }
    g.restore();
  }

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // st: { t, claudeScreen, qwenStatus, serverBusy, doorOpen, phoneRing, coffeeOn, carX, carColor, hour }
  function drawDynamic(g, st) {
    const { t } = st;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const night = skyColors(st.hour).night;

    // roof sky strip + sign
    drawSky(g, 0, -76, W, 8, t, st.hour, 3);
    const flick = Math.sin(t * 13) > -0.95;
    FONT.draw(g, 'AGENT OFFICE', 92, -76, flick ? '#f878b8' : '#7a3858');
    R(14, -76, 18, 8, '#6a4a30'); R(14, -76, 18, 1, '#8a6a48'); R(16, -74, 14, 1, '#4a3020'); R(16, -71, 14, 1, '#4a3020');
    R(229, -76, 1, 8, PAL.metal);
    R(228, -77, 3, 2, Math.floor(t * 1.5) % 2 ? '#ff3030' : '#601010');

    // third floor: window, TV, arcade, scoreboard
    drawSky(g, 57, -55, 28, 29, t, st.hour, 4);
    R(70, -55, 2, 29, PAL.wood); R(57, -41, 28, 2, PAL.wood);
    drawTv(g, 213, -45, 32, 20, t, st.tvOn);
    drawArcade(g, 152, -16, 9, 8, t, st.arcadeOn);
    R(91, -49, 14, 8, '#101820');
    const sc = st.score || [0, 0];
    FONT.draw(g, `${sc[0] % 10}`, 92, -49, '#f8a838');
    R(97, -47, 2, 1, '#f8a838');
    FONT.draw(g, `${sc[1] % 10}`, 100, -49, '#f8a838');

    // windows
    drawSky(g, 75, 33, 30, 37, t, st.hour, 0);
    R(89, 33, 2, 37, PAL.wood); R(75, 50, 30, 2, PAL.wood);
    drawSky(g, 183, 33, 26, 33, t, st.hour, 1);
    R(195, 33, 2, 33, PAL.wood); R(183, 48, 26, 2, PAL.wood);
    drawSky(g, 221, 126, 11, 18, t, st.hour, 2);
    R(226, 126, 1, 18, PAL.wood);

    // clock with real time
    const now = new Date();
    const cx = 58, cy = 35;
    R(cx - 5, cy - 5, 11, 11, PAL.ink); R(cx - 4, cy - 4, 9, 9, '#f8f0d8');
    R(cx, cy - 4, 1, 1, PAL.ink); R(cx + 4, cy, 1, 1, PAL.ink); R(cx, cy + 4, 1, 1, PAL.ink); R(cx - 4, cy, 1, 1, PAL.ink);
    const hand = (ang, len, c) => { for (let i = 0; i <= len; i++) R(cx + Math.round(Math.sin(ang) * i), cy - Math.round(Math.cos(ang) * i), 1, 1, c); };
    hand(((now.getHours() % 12) + now.getMinutes() / 60) * Math.PI / 6, 2, PAL.ink);
    hand(now.getMinutes() * Math.PI / 30, 3, '#c83838');

    // Claude monitor
    drawScreen(g, 37, 80, 15, 11, t, st.claudeScreen, '#58e870', 1);
    // Qwen monitors
    const qs = st.qwenStatus;
    const qMode = qs === 'busy' ? 'tokens' : qs === 'offline' ? 'off' : qs === 'loading' ? 'loading' : 'idle';
    drawScreen(g, 212, 80, 12, 10, t, qMode, '#c8a0ff', 2);
    drawScreen(g, 227, 80, 12, 10, t, qMode === 'tokens' ? 'code' : qMode, '#58e8e8', 3);
    // lava lamp
    R(205, 85, 4, 7, '#3a1c48');
    const ly = 86 + Math.round((Math.sin(t * 0.9) + 1) * 2);
    R(206, ly, 2, 2, '#f87838'); R(206, 90 - Math.round((Math.sin(t * 0.7) + 1)), 2, 1, '#f8a858');
    // GPU tower RGB
    if (qs !== 'offline') {
      const hue = (t * (qs === 'busy' ? 160 : 40)) % 360;
      R(242, 73, 1, 30, `hsl(${hue},90%,60%)`);
      for (const fy of [76, 84]) {
        const a = Math.floor(t * (qs === 'busy' ? 24 : 6)) % 2;
        R(244 + a, fy + 1, 3 - a, 3, '#5a5a6a'); R(245, fy + 2 - a, 1, 1 + a * 2, '#8a8a9a');
      }
      R(244, 92, 2, 1, qs === 'busy' ? '#f83838' : '#38f870');
    }

    // server rack LEDs
    for (const x of [148, 164]) {
      for (let y = 137, i = 0; y < 188; y += 5, i++) {
        const speed = st.serverBusy ? 9 : 2;
        const on1 = Math.sin(t * speed + i * 1.7 + x) > 0;
        const on2 = Math.sin(t * speed * 1.3 + i * 2.3 + x * 0.5) > 0.4;
        R(x + 10, y + 2, 1, 1, on1 ? '#38f870' : '#14401c');
        R(x + 12, y + 2, 1, 1, on2 ? '#f8a838' : '#4a3010');
      }
    }
    // terminal screen
    R(177, 167, 6, 4, '#0c2a18');
    if (st.serverBusy) { for (let i = 0; i < 3; i++) R(177, 167 + i, 1 + Math.floor((Math.sin(t * 7 + i * 2) + 1) * 2.5), 1, '#38f870'); }
    else if (Math.floor(t * 2) % 2) R(177, 170, 1, 1, '#38f870');

    // coffee machine light
    R(210, 166, 1, 1, st.coffeeOn ? '#f83838' : '#601818');

    // bench flasks (static glass, animated liquid)
    const flasks = [[50, '#58e070'], [60, '#e85898'], [74, '#58a8f8'], [98, '#f8d838']];
    for (const [fx, c] of flasks) {
      R(fx + 1, 172, 1, 3, '#c8dcf0');
      R(fx, 175, 3, 5, '#c8dcf0');
      const lvl = 1 + Math.round((Math.sin(t * 2 + fx) + 1));
      R(fx, 180 - lvl - 1, 3, lvl + 1, c);
      R(fx, 175, 1, 1, '#f8ffff');
    }
    // burner flame
    const fl = Math.floor(t * 10) % 3;
    R(66, 172 - fl % 2, 3, 3, '#5898f8'); R(67, 171 - fl, 1, 2, '#c8e8ff');

    // phone ringing
    if (st.phoneRing) {
      const s = Math.floor(t * 30) % 2;
      R(21, 89, 9, 5, '#24243a');
      R(22 + s, 91, 7, 3, '#2a2a3a'); R(21 + s, 89, 9, 1, '#4a4a6a');
      R(19, 86 + s, 1, 2, PAL.yellow); R(31, 86 + (1 - s), 1, 2, PAL.yellow); R(25, 85, 1, 2, PAL.yellow);
    }

    // street door
    if (st.doorOpen) {
      R(235, 160, 13, 32, '#0c0810');
      R(235, 160, 3, 32, '#7a4a20'); R(237, 160, 1, 32, '#5a3010');
      R(238, 188, 10, 4, 'rgba(248,216,120,0.25)');
    } else {
      R(235, 161, 13, 31, PAL.woodD); R(236, 162, 11, 13, PAL.wood); R(236, 177, 11, 13, PAL.wood);
      R(238, 164, 7, 8, night ? '#2c3458' : '#7ab0e0'); R(245, 177, 1, 2, PAL.yellow);
    }

    // night: dim the street, warm interior
    if (night > 0) R(0, 200, W, 24, `rgba(4,6,24,${0.35 * night})`);
  }

  // A tiny cartoon on the TV: rolling hills, a bouncing ball and a sun.
  function drawTv(g, x, y, w, h, t, on) {
    const R = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(a, b, c, d); };
    if (!on) { R(x, y, w, h, '#0c1018'); R(x + 2, y + 2, 4, 1, '#2a3040'); return; }
    R(x, y, w, h, '#58a8f8');
    R(x, y + h - 6, w, 6, '#38a048');
    for (let i = 0; i < w; i++) {
      const hy = Math.round(Math.sin((i + t * 8) / 5) * 2);
      R(x + i, y + h - 8 + hy, 1, 3 - hy, '#58c868');
    }
    const bx = x + Math.floor(((t * 10) % (w - 4)));
    const by = y + h - 9 - Math.abs(Math.round(Math.sin(t * 4) * 7));
    R(bx, by, 3, 3, '#f83838'); R(bx, by, 1, 1, '#f8a8a8');
    R(x + w - 7, y + 2, 4, 4, '#f8e858');
    if (Math.floor(t * 0.5) % 7 === 0) R(x, y, w, h, 'rgba(255,255,255,0.08)');
  }

  function drawArcade(g, x, y, w, h, t, on) {
    const R = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(a, b, c, d); };
    R(x, y, w, h, '#000010');
    const sx = x + 1 + Math.floor(((t * (on ? 5 : 2)) % (w - 2)));
    R(sx, y + h - 2, 2, 1, '#58e870');
    for (let i = 0; i < 3; i++) {
      const ey = y + ((Math.floor(t * (on ? 6 : 2)) + i * 3) % (h - 2));
      R(x + 1 + ((i * 3 + Math.floor(t)) % (w - 2)), ey, 1, 1, '#f83858');
    }
    if (on && Math.floor(t * 4) % 2) R(x + 1, y, 3, 1, '#f8d838');
  }

  // A car in people scale (a person is 24 px tall): 56×22, wheels on the road at y = 222.
  // Returned as a cached 72×24 sprite whose top-left sits at (carX, 200); the extra 16 px hold the night headlight beam.
  const carCache = new Map();
  function carSprite(color, night) {
    const key = `${color}|${night ? 1 : 0}`;
    if (carCache.has(key)) return carCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = 72;
    cv.height = 24;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y - 200, w, h); };
    const dark = mix(color, '#000000', 0.35), light = mix(color, '#ffffff', 0.35);
    const glass = night ? '#2c3a5a' : '#a8d8f8';
    // cabin and roof
    R(14, 201, 26, 1, dark); R(12, 202, 30, 8, color); R(13, 201, 28, 1, color);
    R(15, 203, 11, 6, glass); R(28, 203, 11, 6, glass); R(26, 202, 2, 8, dark);
    R(16, 203, 3, 1, 'rgba(255,255,255,0.5)'); R(29, 203, 3, 1, 'rgba(255,255,255,0.5)');
    // body
    R(2, 209, 52, 9, color); R(1, 211, 54, 6, color); R(2, 209, 52, 1, light);
    R(0, 215, 56, 3, dark);
    R(27, 210, 1, 6, dark); R(22, 211, 3, 1, dark); R(36, 211, 3, 1, dark);
    // lights
    R(54, 211, 2, 3, '#f8f0a0'); R(0, 211, 2, 3, '#e83838');
    if (night) R(56, 210, 16, 6, 'rgba(248,240,160,0.18)');
    // wheels with arches
    for (const wx of [8, 40]) {
      R(wx - 1, 214, 10, 2, '#1c1c22');
      R(wx, 215, 8, 7, '#141418'); R(wx + 1, 214, 6, 1, '#141418'); R(wx + 1, 222, 6, 1, '#141418');
      R(wx + 3, 217, 2, 2, '#9a9aa8');
    }
    carCache.set(key, cv);
    return cv;
  }

  // ---------------------------------------------------------------- city backdrop
  // Fills a whole screen around the building for screensaver mode.
  // g is a logical-pixel canvas BW×BH; the building's (0,0) sits at (bx, by).
  function drawBackdrop(g, BW, BH, bx, by, t, hour, carX, carColor) {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const sc = skyColors(hour);
    const street = by + TOP + 200;

    drawCity(g, R, BW, street, t, sc);
    drawSkyLife(g, R, BW, street, t, sc);
    drawStreetFront(g, R, BW, bx, street, t, sc);
    drawRoad(g, R, BW, BH, street, bx);
    drawLamps(g, R, BW, street, sc, bx - 20, (x) => x > bx - 8 && x < bx + W + 8);
    if (sc.night > 0) R(0, street, BW, 24, `rgba(4,6,24,${0.35 * sc.night})`);
  }

  // Endless street for the runner mini-game: the same city, but shops, trees and
  // lamps are laid out block by block (seeded per block), so it scrolls forever.
  // `scroll` is how far the runner has gone; props move at half speed (parallax).
  // The street goes through districts, 12 blocks each: downtown shops, a park,
  // apartment blocks with kiosks, an industrial zone. Billboards turn up anywhere.
  const EXTRA_SHOPS = [
    { name: 'АПТЕКА', wall: '#e8e8e8', aw: ['#f8f8f8', '#38a048'], win: '#c8f8d8' },
    { name: 'СУШИ', wall: '#2a2a2a', aw: ['#e83838', '#f8f8f8'], win: '#f8d8a8' },
    { name: 'МУЗЫКА', wall: '#3a2a5a', aw: ['#f878b8', '#2a2a3a'], win: '#d8a8f8' },
    { name: 'БАРБЕР', wall: '#5a3a2a', aw: ['#e83838', '#3858c8'], win: '#f8e0a8' },
    { name: 'ТЕХНО', wall: '#1c3a5a', aw: ['#58e8e8', '#1c2a4a'], win: '#a8e8f8' },
  ];
  let RUN_SHOPS = null; // SHOPS is declared further down
  const ADS = [
    ['ROMA KLIPA', 'НОВЫЙ ТРЕК', '#e858a8'], ['QWEN 27B', 'ДУМАЕТ ЗА ТЕБЯ', '#9858e8'], ['КОФЕ 24/7', 'ЗА УГЛОМ', '#a8682c'],
    ['CLAUDE', 'ПИШЕТ КОД', '#e87838'], ['ПИЦЦА', 'ЗА 30 МИНУТ', '#38a048'], ['FL STUDIO', 'БИТЫ ТУТ', '#f8a838'],
    ['CAPCUT', 'МОНТАЖ', '#3858c8'], ['ОТПУСК', 'СКОРО. НАВЕРНОЕ', '#58b8e8'],
  ];
  const ZONES = [
    [['shop', 0.55], ['tree', 0.15], ['bench', 0.08], ['stop', 0.06], ['kiosk', 0.08], ['billboard', 0.08]],
    [['tree', 0.4], ['bush', 0.25], ['bench', 0.15], ['fountain', 0.1], ['billboard', 0.04], ['kiosk', 0.06]],
    [['house', 0.5], ['tree', 0.15], ['kiosk', 0.15], ['bench', 0.06], ['stop', 0.06], ['bush', 0.08]],
    [['fence', 0.35], ['garage', 0.25], ['container', 0.2], ['billboard', 0.12], ['bush', 0.08]],
  ];
  const WIDTH = {
    stop: () => 30, tree: () => 14, bench: () => 14, bush: () => 12, kiosk: () => 24, fountain: () => 30,
    billboard: () => 46, container: () => 36, garage: () => 34, fence: (r) => 34 + Math.floor(r() * 20),
    shop: (r) => 40 + Math.floor(r() * 16), house: (r) => 44 + Math.floor(r() * 20),
  };

  function drawRunBackdrop(g, BW, BH, street, t, hour, scroll) {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const sc = skyColors(hour);
    RUN_SHOPS = RUN_SHOPS || SHOPS.concat(EXTRA_SHOPS);
    drawCity(g, R, BW, street, t, sc, scroll);
    drawSkyLife(g, R, BW, street, t, sc);
    const BLOCK = 96, off = scroll * 0.5;
    const props = [];
    for (let k = Math.floor((off - 60) / BLOCK); k * BLOCK < off + BW + 10; k++) {
      const kk = ((k % 100000) + 100000) % 100000;
      const r = rng(9000 + kk);
      const zone = ZONES[Math.floor(kk / 12) % ZONES.length];
      let x = k * BLOCK + 2;
      while (true) {
        let roll = r(), kind = zone[0][0];
        for (const [id, p] of zone) { if (roll < p) { kind = id; break; } roll -= p; }
        const w = WIDTH[kind](r);
        if (x + w > (k + 1) * BLOCK - 2) break;
        props.push({ kind, x: Math.round(x - off), w, shop: RUN_SHOPS[Math.floor(r() * RUN_SHOPS.length)], ad: ADS[Math.floor(r() * ADS.length)], seed: Math.floor(r() * 1e6) });
        x += w + 3 + Math.floor(r() * 8);
      }
    }
    // tall things go first so trees and kiosks stand in front of them
    const back = ['house', 'billboard', 'fence', 'garage'];
    paintProps(g, R, props.filter((p) => back.includes(p.kind)), street, t, sc);
    paintProps(g, R, props.filter((p) => !back.includes(p.kind)), street, t, sc);
    drawRoad(g, R, BW, BH, street, -Math.round(scroll));
    drawLamps(g, R, BW, street, sc, -Math.round(scroll * 0.5) - 20, () => false);
    if (sc.night > 0) R(0, street, BW, 24, `rgba(4,6,24,${0.35 * sc.night})`);
  }

  // props that only the runner's street has
  function paintRunProp(g, R, p, street, t, night) {
    const { x, w } = p;
    const pr = rng(p.seed);
    if (p.kind === 'house') {
      const h = 58 + Math.floor(pr() * 22), top = street - h;
      const wall = ['#8a7a6a', '#6a7a8a', '#9a6a5a', '#7a8a6a', '#8a6a8a'][p.seed % 5];
      R(x, top, w, h, wall); R(x, top, w, 2, 'rgba(0,0,0,0.3)'); R(x - 1, top - 2, w + 2, 2, '#4a4a54');
      for (let wy = top + 6; wy < street - 16; wy += 10) {
        for (let wx = x + 4; wx < x + w - 7; wx += 9) {
          const lit = night ? pr() < 0.55 : false;
          R(wx, wy, 6, 6, '#2a2a34'); R(wx + 1, wy + 1, 4, 4, lit ? '#f8d878' : night ? '#1c2440' : '#a8d0f0');
          if (!night && pr() < 0.3) R(wx + 1, wy + 1, 4, 2, ['#e8a8a8', '#a8e8a8', '#f8f8f8'][Math.floor(pr() * 3)]);
          R(wx, wy + 6, 6, 1, '#5a5a64');
        }
      }
      const dx = x + Math.floor(w / 2) - 5;
      R(dx, street - 14, 10, 14, '#3a2a1a'); R(dx + 1, street - 13, 8, 13, '#5a3a20'); R(dx - 2, street - 16, 14, 2, '#4a4a54');
      R(dx + 7, street - 7, 1, 2, '#f8d838');
    } else if (p.kind === 'fence') {
      R(x, street - 22, w, 22, '#5a6070'); R(x, street - 22, w, 1, '#7a8090');
      for (let i = x + 4; i < x + w; i += 8) R(i, street - 22, 1, 22, '#4a505c');
      const cols = ['#e858a8', '#58e8e8', '#f8d838', '#58e070', '#f87838'];
      const tag = ['ROMA', 'LOL', 'AI', 'BEAT', 'Q', 'WOW'][p.seed % 6];
      R(x + 3, street - 17, FONT.width(tag) + 4, 11, cols[p.seed % 5]);
      FONT.draw(g, tag, x + 5, street - 15, cols[(p.seed + 2) % 5]);
      for (let i = 0; i < 4; i++) R(x + 2 + Math.floor(pr() * (w - 6)), street - 6 - Math.floor(pr() * 14), 3, 1, cols[i % 5]);
    } else if (p.kind === 'garage') {
      R(x, street - 24, w, 24, '#6a6a74'); R(x - 1, street - 26, w + 2, 3, '#4a4a54');
      R(x + 3, street - 20, w - 6, 20, '#8a8a94');
      for (let yy = street - 19; yy < street; yy += 3) R(x + 3, yy, w - 6, 1, '#6a6a74');
      R(x + 3, street - 20, w - 6, 1, '#4a4a54');
      FONT.draw(g, `${10 + (p.seed % 89)}`, x + w / 2 - 5, street - 18, '#f8f8f8');
    } else if (p.kind === 'container') {
      const c = ['#c83838', '#3858c8', '#38a048', '#e8a838'][p.seed % 4];
      R(x, street - 18, w, 18, c); R(x, street - 18, w, 2, 'rgba(255,255,255,0.25)');
      for (let i = x + 3; i < x + w - 2; i += 4) R(i, street - 15, 1, 13, 'rgba(0,0,0,0.25)');
      if (p.seed % 3 === 0) { R(x + 6, street - 26, w - 12, 8, mix(c, '#000000', 0.2)); R(x + 6, street - 26, w - 12, 1, 'rgba(255,255,255,0.25)'); }
    } else if (p.kind === 'billboard') {
      const [a, b, col] = p.ad;
      R(x + 8, street - 26, 2, 26, '#3a404c'); R(x + w - 10, street - 26, 2, 26, '#3a404c');
      R(x, street - 50, w, 25, '#140c1c'); R(x + 1, street - 49, w - 2, 23, col);
      R(x + 1, street - 49, w - 2, 1, 'rgba(255,255,255,0.35)');
      const cx = x + w / 2;
      FONT.draw(g, a, Math.round(cx - FONT.width(a) / 2), street - 46, '#f8f8f8');
      const small = b.length * 6 > w - 4 ? b.slice(0, Math.floor((w - 4) / 6)) : b;
      FONT.draw(g, small, Math.round(cx - FONT.width(small) / 2), street - 36, '#140c1c');
      if (night) R(x - 2, street - 52, w + 4, 29, 'rgba(248,240,200,0.12)');
    } else if (p.kind === 'kiosk') {
      R(x, street - 22, w, 22, '#e8e8e8'); R(x - 1, street - 25, w + 2, 4, '#3858c8');
      R(x + 3, street - 18, w - 6, 9, night ? '#f8e8a8' : '#a8d0f0');
      for (let i = 0; i < 4; i++) R(x + 4 + i * 4, street - 12, 3, 3, ['#e85838', '#f8d838', '#58c858', '#58a8f8'][i]);
      R(x, street - 9, w, 9, '#c8c8d0');
      FONT.draw(g, 'ЕДА', x + 3, street - 8, '#c83838');
    } else if (p.kind === 'bush') {
      const leaf = night ? '#1c3a24' : '#38a048', leafL = night ? '#2a4c30' : '#58c868';
      R(x + 1, street - 8, 10, 8, leaf); R(x, street - 6, 12, 6, leaf); R(x + 3, street - 10, 6, 2, leaf);
      R(x + 3, street - 8, 3, 2, leafL);
      if (!night && p.seed % 2) { R(x + 2, street - 5, 1, 1, '#f878b8'); R(x + 8, street - 7, 1, 1, '#f8f8f8'); }
    } else if (p.kind === 'fountain') {
      R(x, street - 6, w, 6, '#8a8a94'); R(x + 1, street - 5, w - 2, 3, night ? '#2a4a7a' : '#58a8e8');
      R(x + w / 2 - 2, street - 16, 4, 10, '#8a8a94'); R(x + w / 2 - 6, street - 17, 12, 2, '#8a8a94');
      for (let i = 0; i < 6; i++) {
        const ph = (t * 1.5 + i / 6) % 1;
        const dx = (i % 2 ? 1 : -1) * (2 + ph * 8), dy = -20 + ph * 14 + ph * ph * 8;
        R(Math.round(x + w / 2 + dx), Math.round(street + dy), 1, 1, '#c8e8f8');
      }
      R(x + w / 2 - 1, street - 22, 2, 5, '#c8e8f8');
    } else return false;
    return true;
  }

  function drawCity(g, R, BW, street, t, sc, scroll) {
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      R(0, Math.floor((street * i) / bands), BW, Math.ceil(street / bands) + 1, mix(sc.top, sc.bot, i / (bands - 1)));
    }
    if (sc.night > 0.3) {
      const r = rng(77);
      const n = Math.floor((BW * street) / 500);
      for (let i = 0; i < n; i++) {
        const sx = Math.floor(r() * BW), sy = Math.floor(r() * street * 0.6);
        if ((Math.sin(t * 1.5 + i * 3.7) + 1) / 2 > 0.25) R(sx, sy, 1, 1, i % 9 ? '#c8c8e8' : '#f8f8d8');
      }
      const mx = Math.floor(BW * 0.82), my = Math.max(8, Math.floor(street * 0.12));
      R(mx, my, 10, 10, '#f0f0d0'); R(mx - 1, my + 2, 12, 6, '#f0f0d0'); R(mx + 2, my - 1, 6, 12, '#f0f0d0');
      R(mx + 5, my + 1, 6, 7, mix(sc.top, sc.bot, 0.15)); R(mx + 2, my + 6, 2, 1, '#c8c8a8');
    } else {
      const sx = Math.floor(BW * 0.15), sy = Math.max(8, Math.floor(street * 0.12));
      R(sx, sy, 12, 12, '#f8e878'); R(sx - 1, sy + 2, 14, 8, '#f8e878'); R(sx + 2, sy - 1, 8, 14, '#f8e878');
      for (let i = 0; i < 5; i++) {
        const cx = Math.floor(((t * (3 + i) + i * 97) % (BW + 60)) - 30);
        const cy = Math.floor(street * 0.08 + i * 13);
        R(cx, cy, 18, 3, '#f8f8f8'); R(cx + 4, cy - 2, 9, 2, '#f8f8f8'); R(cx + 2, cy + 3, 14, 1, '#d8e8f8');
      }
    }

    // two skyline layers; windows twinkle at night. With `scroll` (runner) they are laid out
    // in seeded blocks and slide by at their own parallax speed.
    const layer = (seed, minH, maxH, body, lit, litChance, par) => {
      if (scroll === undefined) { row(rng(seed), -4, BW, minH, maxH, body, lit, litChance); return; }
      const off = Math.round(scroll * par), B = 64;
      for (let k = Math.floor((off - 40) / B); k * B < off + BW; k++) {
        row(rng(seed * 7919 + (((k % 99991) + 99991) % 99991)), k * B - off, k * B - off + B, minH, maxH, body, lit, litChance);
      }
    };
    const row = (r, x, end, minH, maxH, body, lit, litChance) => {
      while (x < end) {
        const w = 10 + Math.floor(r() * 22);
        const h = Math.floor(minH + r() * (maxH - minH));
        const top = street - h;
        R(x, top, w, h, body);
        if (r() < 0.3) { R(x + Math.floor(w / 2), top - 6, 1, 6, body); }
        const s = Math.floor(r() * 1e6);
        if (sc.night > 0.3) {
          const wr = rng(s);
          for (let wy = top + 3; wy < street - 2; wy += 4) {
            for (let wx = x + 2; wx < x + w - 2; wx += 3) {
              const on = wr() < litChance !== (Math.sin(t * 0.25 + wx * 1.7 + wy * 0.9) > 0.985);
              if (on) R(wx, wy, 1, 2, lit);
            }
          }
        } else {
          const wr = rng(s);
          for (let wy = top + 3; wy < street - 2; wy += 4) {
            for (let wx = x + 2; wx < x + w - 2; wx += 3) if (wr() < 0.5) R(wx, wy, 1, 2, 'rgba(255,255,255,0.18)');
          }
        }
        x += w + 1 + Math.floor(r() * 3);
      }
    };
    const farMax = Math.min(street - 10, 170);
    layer(11, farMax * 0.35, farMax, sc.night ? '#10142c' : '#6a7ca0', '#c8a868', 0.18, 0.08);
    layer(23, 24, Math.min(street - 20, 110), sc.night ? '#0a0c1c' : '#4a5a7a', '#f8d878', 0.32, 0.2);
  }

  // sidewalk + road; `off` shifts the paving and road marks
  function drawRoad(g, R, BW, BH, street, off) {
    R(0, street, BW, 6, '#8a8a94');
    for (let x = (off % 16 + 16) % 16; x < BW; x += 16) R(x, street, 1, 6, '#6a6a74');
    R(0, street, BW, 1, '#a8a8b4');
    R(0, street + 6, BW, 1, '#c8c8d0');
    R(0, street + 7, BW, 17, '#2c2c34');
    for (let x = ((off + 4) % 16 + 16) % 16; x < BW; x += 16) R(x, street + 15, 8, 1, '#c8a838');
    R(0, street + 24, BW, Math.max(0, BH - street - 24), '#141418');
    R(0, street + 24, BW, 1, '#3a3a44');
  }

  function drawLamps(g, R, BW, street, sc, off, skip) {
    for (let x = (off % 48 + 48) % 48; x < BW; x += 48) {
      if (skip(x)) continue;
      R(x, street - 30, 2, 31, '#3a404c');
      R(x - 2, street - 31, 7, 2, '#3a404c');
      R(x + 3, street - 30, 3, 2, sc.night ? '#f8f0b0' : '#a8a8a0');
      if (sc.night > 0.3) R(x - 4, street - 28, 14, 28, 'rgba(248,232,150,0.07)');
    }
  }

  // Birds, a hot-air balloon by day, a blinking airliner light by night.
  function drawSkyLife(g, R, BW, street, t, sc) {
    if (sc.night < 0.5) {
      for (let k = 0; k < 2; k++) {
        const fx = ((t * (9 + k * 4) + k * 400) % (BW + 80)) - 40;
        const fy = Math.floor(street * (0.18 + k * 0.12) + Math.sin(t * 0.7 + k) * 4);
        for (let i = 0; i < 5; i++) {
          const bx = Math.floor(fx - Math.abs(i - 2) * 6), by = fy + (i - 2) * 3;
          const up = Math.floor(t * 4 + i) % 2;
          R(bx, by + up, 2, 1, '#2a2a3a'); R(bx + 2, by + 1 - up, 1, 1, '#2a2a3a'); R(bx + 3, by + up, 2, 1, '#2a2a3a');
        }
      }
      const hx = Math.floor(((t * 2.2 + 140) % (BW + 60)) - 30);
      const hy = Math.floor(street * 0.3 + Math.sin(t * 0.3) * 6);
      R(hx, hy, 12, 12, '#e83838'); R(hx - 1, hy + 2, 14, 7, '#e83838'); R(hx + 4, hy, 4, 12, '#f8d838');
      R(hx + 1, hy + 2, 2, 5, '#f86060');
      R(hx + 2, hy + 12, 1, 4, '#5a3a20'); R(hx + 9, hy + 12, 1, 4, '#5a3a20'); R(hx + 2, hy + 16, 8, 4, '#8a5a2a');
    } else {
      const px = Math.floor(((t * 6) % (BW + 40)) - 20), py = Math.floor(street * 0.15);
      if (Math.floor(t * 2) % 2) R(px, py, 1, 1, '#f83838'); else R(px + 3, py, 1, 1, '#f8f8f8');
    }
  }

  // Street-level life on both sides of the office: shops, cafés, trees, a bus stop,
  // traffic lights. Positions are fixed for a given screen width (seeded), the building covers the middle.
  const SHOPS = [
    { name: 'КАФЕ', wall: '#8a4a2a', aw: ['#f8f8f8', '#c83838'], win: '#f8d888' },
    { name: 'ПИЦЦА', wall: '#2a6a4a', aw: ['#f8f8f8', '#38a048'], win: '#f8c868' },
    { name: '24 ЧАСА', wall: '#3a3a6a', aw: ['#f8d838', '#3858c8'], win: '#c8e8f8' },
    { name: 'ЦВЕТЫ', wall: '#7a3a6a', aw: ['#f8f8f8', '#e858a8'], win: '#f8b8d8' },
    { name: 'КНИГИ', wall: '#5a4a3a', aw: ['#e8d8a8', '#8a5a2a'], win: '#f8e0a8' },
    { name: 'ИГРЫ', wall: '#2a2a3a', aw: ['#58e8e8', '#9858e8'], win: '#a8f8a8' },
    { name: 'ШАУРМА', wall: '#9a5a2a', aw: ['#f8d838', '#e83838'], win: '#f8c868' },
  ];

  function drawStreetFront(g, R, BW, bx, street, t, sc) {
    const night = sc.night > 0.3;
    const props = [];
    for (const dir of [-1, 1]) {
      const r = rng(dir > 0 ? 501 : 502);
      let x = dir > 0 ? bx + W + 6 : bx - 6;
      let n = 0;
      while (dir > 0 ? x < BW + 10 : x > -60) {
        const roll = r();
        const kind = n === 0 ? 'light' : n === 2 ? 'stop' : roll < 0.5 ? 'shop' : roll < 0.85 ? 'tree' : 'bench';
        const w = { light: 6, stop: 30, shop: 40 + Math.floor(r() * 16), tree: 14, bench: 14 }[kind];
        const left = dir > 0 ? x : x - w;
        props.push({ kind, x: left, w, shop: SHOPS[Math.floor(r() * SHOPS.length)], seed: Math.floor(r() * 1e6) });
        x += dir * (w + 3 + Math.floor(r() * 6));
        n++;
      }
    }
    paintProps(g, R, props, street, t, sc);
  }

  function paintProps(g, R, props, street, t, sc) {
    const night = sc.night > 0.3;
    for (const p of props) {
      const { x, w } = p;
      if (paintRunProp(g, R, p, street, t, night)) continue;
      if (p.kind === 'shop') {
        const s = p.shop, h = 34 + (p.seed % 9), top = street - h;
        R(x, top, w, h, s.wall);
        R(x, top, w, 2, 'rgba(0,0,0,0.25)');
        // sign board
        const label = s.name, tw = label.length * 6 - 1;
        R(x + 2, top + 3, w - 4, 9, '#140c1c');
        FONT.draw(g, label, x + Math.floor((w - tw) / 2), top + 4, night && Math.sin(t * 3 + p.seed) < -0.97 ? '#5a4a3a' : '#f8e8a8');
        // striped awning
        for (let i = 0; i < w; i += 4) R(x + i, top + 13, 4, 4, s.aw[(i / 4) % 2]);
        for (let i = 0; i < w; i += 4) R(x + i + 1, top + 17, 2, 1, s.aw[(i / 4) % 2]);
        // shop window with shelves and a door
        const wy = top + 19, wh = h - 21;
        R(x + 3, wy, w - 16, wh, night ? s.win : '#a8d0f0');
        if (!night) R(x + 4, wy + 1, 3, wh - 2, 'rgba(255,255,255,0.35)');
        for (let sy = wy + 4; sy < street - 2; sy += 5) R(x + 3, sy, w - 16, 1, 'rgba(60,40,30,0.45)');
        const rr = rng(p.seed);
        for (let sy = wy + 1; sy < street - 4; sy += 5) {
          for (let sx = x + 5; sx < x + w - 15; sx += 3) if (rr() < 0.5) R(sx, sy + 1, 2, 3, ['#e85838', '#58a8f8', '#f8d838', '#58c858'][Math.floor(rr() * 4)]);
        }
        R(x + w - 11, wy, 8, wh, '#3a2414'); R(x + w - 10, wy + 1, 6, wh - 1, night ? s.win : '#6a8ab0');
        R(x + w - 5, wy + Math.floor(wh / 2), 1, 2, '#f8d838');
        if (night) R(x - 2, street - 2, w + 4, 2, 'rgba(248,216,120,0.18)');
      } else if (p.kind === 'tree') {
        const cx = x + 7, sway = Math.round(Math.sin(t * 0.8 + p.seed) * 0.6);
        R(cx - 1, street - 12, 3, 12, '#5a3a20');
        const leaf = night ? '#1c3a24' : '#38a048', leafL = night ? '#2a4c30' : '#58c868', leafD = night ? '#122818' : '#287838';
        R(cx - 6 + sway, street - 26, 13, 12, leaf); R(cx - 4 + sway, street - 29, 9, 3, leaf); R(cx - 7 + sway, street - 22, 15, 6, leaf);
        R(cx - 3 + sway, street - 27, 4, 3, leafL); R(cx - 5 + sway, street - 24, 3, 2, leafL);
        R(cx - 6 + sway, street - 16, 13, 2, leafD);
        if (!night && p.seed % 3 === 0) { R(cx - 3 + sway, street - 21, 1, 1, '#e83838'); R(cx + 3 + sway, street - 19, 1, 1, '#e83838'); }
      } else if (p.kind === 'bench') {
        R(x + 1, street - 6, 12, 2, '#8a5a2a'); R(x + 1, street - 10, 12, 2, '#8a5a2a');
        R(x + 2, street - 4, 1, 4, '#3a3a44'); R(x + 11, street - 4, 1, 4, '#3a3a44');
      } else if (p.kind === 'stop') {
        R(x, street - 30, w, 3, '#3a6ab0'); R(x + 1, street - 27, 1, 27, '#8a8a94'); R(x + w - 2, street - 27, 1, 27, '#8a8a94');
        R(x + 2, street - 27, w - 4, 18, 'rgba(168,208,240,0.35)');
        R(x + 4, street - 7, w - 8, 2, '#5a5a6a'); R(x + 5, street - 5, 1, 5, '#3a3a44'); R(x + w - 6, street - 5, 1, 5, '#3a3a44');
        R(x + w + 1, street - 34, 1, 34, '#5a5a6a'); R(x + w - 2, street - 40, 8, 7, '#f8f8f8'); FONT.draw(g, 'A', x + w, street - 40, '#3858c8');
        // timetable ad
        R(x + 5, street - 24, 9, 12, night ? '#f8e8a8' : '#e8e8e8'); R(x + 6, street - 22, 7, 1, '#c83838'); R(x + 6, street - 19, 5, 1, '#8a8a94');
      } else {
        // traffic light, cycles green - yellow - red
        const ph = Math.floor(t / 4) % 3;
        R(x + 2, street - 30, 2, 30, '#3a404c');
        R(x, street - 40, 6, 13, '#202028');
        R(x + 1, street - 39, 4, 3, ph === 2 ? '#f83838' : '#4a1818');
        R(x + 1, street - 35, 4, 3, ph === 1 ? '#f8d838' : '#4a4018');
        R(x + 1, street - 31, 4, 3, ph === 0 ? '#38f870' : '#184a20');
      }
    }
  }

  function drawScreen(g, x, y, w, h, t, mode, color, seed) {
    const R = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(a, b, c, d); };
    if (mode === 'off') { R(x, y, w, h, '#101018'); R(x + 1, y + 1, 2, 1, '#2a2a3a'); return; }
    R(x, y, w, h, '#0c1a2c');
    if (mode === 'idle') {
      const px = x + Math.floor(Math.abs(((t * 6 + seed * 5) % (2 * (w - 2))) - (w - 2)));
      const py = y + Math.floor(Math.abs(((t * 4 + seed * 3) % (2 * (h - 2))) - (h - 2)));
      R(px, py, 2, 2, color);
      return;
    }
    if (mode === 'loading') {
      R(x + 1, y + h - 4, w - 2, 2, '#1c2c48');
      R(x + 1, y + h - 4, Math.floor(((t * 0.15) % 1) * (w - 2)), 2, color);
      R(x + 1, y + 2, 2 + (Math.floor(t * 3) % 3) * 2, 1, color);
      return;
    }
    if (mode === 'web') {
      R(x, y, w, 2, '#3858c8');
      R(x + 1, y + 3, w - 4, 1, '#c8c8d8'); R(x + 1, y + 5, w - 6, 1, '#8a8aa8'); R(x + 1, y + 7, w - 3, 1, '#8a8aa8');
      R(x + w - 5, y + 4, 3, 3, '#f8a838');
      return;
    }
    // scrolling code / token stream
    const r = rng(seed * 101);
    const lines = [];
    for (let i = 0; i < 40; i++) lines.push({ ind: Math.floor(r() * 3) * 2, len: 2 + Math.floor(r() * (w - 4)), c: r() < 0.25 ? '#f8d838' : r() < 0.5 ? color : '#c8c8d8' });
    const speed = mode === 'tokens' ? 7 : 3;
    const off = Math.floor(t * speed);
    for (let row = 0; row < Math.floor(h / 2); row++) {
      const L = lines[(row + off) % lines.length];
      R(x + 1 + L.ind, y + 1 + row * 2, Math.min(L.len, w - 2 - L.ind), 1, L.c);
    }
    if (Math.floor(t * 3) % 2) R(x + 1, y + h - 2, 2, 1, '#f8f8f8');
  }

  buildBackground();
  buildForeground();

  return { bg, fg, drawDynamic, drawBackdrop, drawRunBackdrop, carSprite, nightness: (hour) => skyColors(hour).night };
})();
