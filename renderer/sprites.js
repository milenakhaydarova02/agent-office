// Procedural pixel-art characters. Every sprite is sketched facing right in a 16×24 box, upscaled to
// 32×48 with detail passes (same logical size on screen), outlined, and cached (left-facing variants are mirrored copies).
const OUTLINE = '#140c1c';

const LOOKS = {
  claude: {
    name: 'CLAUDE', hairStyle: 'neat',
    skin: '#f0b890', skinS: '#c8846a', hair: '#5a3418', hairL: '#8a5428',
    top: '#e0703a', topS: '#b04e24', topL: '#f89858', collar: '#f8f0e0', hem: true,
    pants: '#3a3a5c', pantsS: '#262640', shoe: '#2a1a14', shoeL: '#5a3a2a',
  },
  qwen: {
    name: 'QWEN', hairStyle: 'messy', headphones: '#f8d838', logoQ: true,
    skin: '#e8b088', skinS: '#b87c5c', hair: '#1c1428', hairL: '#3c3058',
    top: '#7448d0', topS: '#5030a0', topL: '#9870f0',
    pants: '#3c64b4', pantsS: '#284480', shoe: '#e8e8f0', shoeL: '#ffffff', shoeS: '#a8a8b8',
  },
  rick: {
    name: 'РИК', hairStyle: 'curly', goggles: true, coat: '#f4f4f8', coatS: '#c4c4d4', flask: '#58e070',
    skin: '#f4c8a0', skinS: '#cc9474', hair: '#7a4a28', hairL: '#a8703c',
    top: '#f4f4f8', topS: '#c4c4d4', topL: '#ffffff', inner: '#58a0d8', tie: '#c83838',
    pants: '#4a4a52', pantsS: '#32323a', shoe: '#2a1a14', shoeL: '#5a3a2a',
  },
  nina: {
    name: 'НИНА', hairStyle: 'pony', hat: 'hardhat', overalls: true,
    skin: '#f0c098', skinS: '#c88c6c', hair: '#c84820', hairL: '#e87040',
    top: '#e8e0d0', topS: '#b8b0a0', topL: '#ffffff',
    pants: '#3070c0', pantsS: '#205090', shoe: '#6a3a1a', shoeL: '#8a5a2a',
  },
  bo: {
    name: 'БО', hairStyle: 'hood', glasses: true, strings: true,
    skin: '#8a5a3a', skinS: '#62402a', hair: '#141018', hairL: '#2c2430',
    top: '#4a5060', topS: '#343844', topL: '#646c80',
    pants: '#24242c', pantsS: '#18181e', shoe: '#e83838', shoeL: '#ff7070',
  },
  fil: {
    name: 'ФИЛ', hairStyle: 'buzz', hat: 'fedora', mustache: true, coat: '#c8a070', coatS: '#987448', belt: '#6a4a28',
    skin: '#f0c4a0', skinS: '#c08868', hair: '#3a3a3a', hairL: '#5a5a5a', hatC: '#5a4030', band: '#2a1a14',
    top: '#c8a070', topS: '#987448', topL: '#e0bc8c', inner: '#f0f0f0', tie: '#2a4a8a',
    pants: '#4a4038', pantsS: '#322a24', shoe: '#1a1210', shoeL: '#3a2a20',
  },
  ava: {
    name: 'АВА', hairStyle: 'long', earring: '#f8d838',
    skin: '#f8d0b0', skinS: '#d09c80', hair: '#181020', hairL: '#3a2c48',
    top: '#d83050', topS: '#a01c38', topL: '#f86080',
    pants: '#2a2a38', pantsS: '#1c1c26', shoe: '#2a1a14', shoeL: '#5a3a2a',
  },
  tim: {
    name: 'ТИМ', hairStyle: 'buzz', hat: 'capback', stripes: '#f8f8f8',
    skin: '#e8a878', skinS: '#b87850', hair: '#d8a040', hairL: '#f0c060', hatC: '#28a050',
    top: '#2858c8', topS: '#1c3c90', topL: '#4878e8',
    pants: '#7a6a50', pantsS: '#5a4c38', shoe: '#f0f0f0', shoeL: '#ffffff', shoeS: '#a8a8b8',
  },
};

// Extra unique hires: generated from palette pools once the named crew is used up.
const EXTRA_NAMES = ['ЛЕО', 'ЗОЯ', 'ГЕК', 'УМА', 'ЯН', 'КИМ', 'ЕВА', 'МАКС', 'ЛИЗ', 'ДАН', 'ИДА', 'РОН'];
function makeExtraLook(i) {
  const tops = [['#30a8a0', '#207870', '#50c8c0'], ['#e8a020', '#b07010', '#f8c040'], ['#8848a8', '#603080', '#a868c8'],
    ['#58a030', '#3c7820', '#78c050'], ['#c85898', '#983c70', '#e878b8'], ['#5878a8', '#3c5480', '#7898c8']];
  const hairs = [['#2a1a10', '#4a3020'], ['#d8b058', '#f0d080'], ['#a83818', '#c85830'], ['#e8e8e8', '#ffffff'], ['#3a2a5a', '#5a4a7a']];
  const skins = [['#f0c098', '#c88c6c'], ['#c88858', '#9c6440'], ['#8a5a3a', '#62402a'], ['#f8d8b8', '#d0a888']];
  const styles = ['short', 'messy', 'long', 'pony', 'curly'];
  const t = tops[i % tops.length], h = hairs[(i * 3) % hairs.length], s = skins[(i * 5) % skins.length];
  return {
    name: EXTRA_NAMES[i % EXTRA_NAMES.length] + (i >= EXTRA_NAMES.length ? String(Math.floor(i / EXTRA_NAMES.length) + 1) : ''),
    hairStyle: styles[(i * 7) % styles.length], glasses: i % 3 === 1,
    skin: s[0], skinS: s[1], hair: h[0], hairL: h[1], top: t[0], topS: t[1], topL: t[2],
    pants: '#3a3a4a', pantsS: '#26262e', shoe: '#2a1a14', shoeL: '#5a3a2a',
  };
}

// Helpers by sub-agent kind: each has a prop (held in free-hand poses) and a hat.
const PRO = {
  explore: {
    name: 'ЛУПА', hairStyle: 'short', hat: 'safari', prop: 'lens',
    skin: '#f0c098', skinS: '#c88c6c', hair: '#5a3a20', hairL: '#7a5430',
    top: '#7a9040', topS: '#566a28', topL: '#9ab858', pants: '#8a7a58', pantsS: '#66583e', shoe: '#5a3a1a', shoeL: '#8a5a2a',
  },
  plan: {
    name: 'ПЛАН', hairStyle: 'neat', glasses: true, prop: 'roll',
    skin: '#f4c8a0', skinS: '#cc9474', hair: '#9a9aa8', hairL: '#c8c8d4',
    top: '#3a6aa8', topS: '#284c80', topL: '#5888c8', pants: '#2a2a38', pantsS: '#1c1c26', shoe: '#2a1a14', shoeL: '#5a3a2a',
  },
  code: {
    name: 'КОД', hairStyle: 'messy', hat: 'beanie', prop: 'laptop',
    skin: '#e8b088', skinS: '#b87c5c', hair: '#2a1a10', hairL: '#4a3020',
    top: '#3a3a4a', topS: '#262632', topL: '#585870', pants: '#2a2a38', pantsS: '#1c1c26', shoe: '#f0f0f0', shoeL: '#ffffff', shoeS: '#a8a8b8',
  },
  review: {
    name: 'ОТК', hairStyle: 'short', glasses: true, prop: 'clip', inner: '#f0f0f0', tie: '#c83838',
    skin: '#c88858', skinS: '#9c6440', hair: '#181018', hairL: '#382c38',
    top: '#58687a', topS: '#3e4a58', topL: '#788a9c', pants: '#34343e', pantsS: '#24242c', shoe: '#2a1a14', shoeL: '#5a3a2a',
  },
};
const PRO_OF = [[/explor|research|search/i, 'explore'], [/plan|architect|design/i, 'plan'], [/review|test|verif|check|guide/i, 'review'], [/cod|dev|engin|implement/i, 'code']];

const Sprites = (() => {
  const cache = new Map();
  const variants = new Map();

  // Same character in other clothes: pajamas (+ nightcap, no headphones) or just a nightcap.
  function outfit(L, kind) {
    const key = `${L.name}|${kind}`;
    let v = variants.get(key);
    if (v) return v;
    v = { ...L, tag: `~${kind}` };
    if (kind === 'pj' || kind === 'pjcap') {
      Object.assign(v, { top: '#9ab0e8', topS: '#7088c8', topL: '#c0d0f8', stripes: '#e8f0ff', pants: '#7088c8', pantsS: '#5068a8', coat: null, coatS: null, inner: null, tie: null, overalls: false, belt: null, collar: null, logoQ: false });
    }
    if (kind === 'pjcap' || kind === 'cap') Object.assign(v, { hat: 'nightcap', headphones: null, goggles: false });
    variants.set(key, v);
    return v;
  }

  function outline(cv) {
    const g = cv.getContext('2d');
    const { width: w, height: h } = cv;
    const img = g.getImageData(0, 0, w, h);
    const a = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
    const marks = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push(x, y);
      }
    }
    g.fillStyle = OUTLINE;
    for (let i = 0; i < marks.length; i += 2) g.fillRect(marks[i], marks[i + 1], 1, 1);
  }

  function mirror(cv) {
    const m = document.createElement('canvas');
    m.width = cv.width;
    m.height = cv.height;
    const g = m.getContext('2d');
    g.translate(cv.width, 0);
    g.scale(-1, 1);
    g.drawImage(cv, 0, 0);
    return m;
  }

  // ---- 2× pipeline ------------------------------------------------------------
  // Sprites are first sketched on the old 16×24 grid, then upscaled to 32×48 with edge-aware
  // smoothing (EPX), bevelled/shaded per material and finished with hand-placed detail.
  const hexInt = (h) => {
    const n = parseInt(h.slice(1), 16);
    return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
  };
  function shade(h, k) {
    const n = parseInt(h.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      const t = k >= 0 ? 255 : 0, a = Math.abs(k);
      return Math.round(v + (t - v) * a);
    });
    return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function upscale(cv) {
    const w = cv.width, h = cv.height;
    const src = new Uint32Array(cv.getContext('2d').getImageData(0, 0, w, h).data.buffer);
    const out = document.createElement('canvas');
    out.width = w * 2;
    out.height = h * 2;
    const og = out.getContext('2d');
    const img = og.createImageData(w * 2, h * 2);
    const d = new Uint32Array(img.data.buffer);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
        let p1 = P, p2 = P, p3 = P, p4 = P;
        if (C === A && C !== D && A !== B) p1 = A;
        if (A === B && A !== C && B !== D) p2 = B;
        if (D === C && D !== B && C !== A) p3 = C;
        if (B === D && B !== A && D !== C) p4 = D;
        const o = y * 2 * w * 2 + x * 2;
        d[o] = p1; d[o + 1] = p2; d[o + w * 2] = p3; d[o + w * 2 + 1] = p4;
      }
    }
    og.putImageData(img, 0, 0);
    return out;
  }

  // Light rim on top edges, shadow on bottom/right edges, per material family.
  function bevel(cv, fams) {
    const w = cv.width, h = cv.height, g = cv.getContext('2d');
    const img = g.getImageData(0, 0, w, h);
    const src = new Uint32Array(img.data.buffer);
    const dst = src.slice();
    const fam = new Map(), hi = new Map(), sh = new Map();
    fams.forEach((f, i) => f.forEach((c) => {
      if (!c) return;
      const k = hexInt(c);
      fam.set(k, i);
      hi.set(k, hexInt(shade(c, 0.2)));
      sh.set(k, hexInt(shade(c, -0.24)));
    }));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, c = src[i], fi = fam.get(c);
        if (fi === undefined) continue;
        const up = y ? src[i - w] : 0, dn = y < h - 1 ? src[i + w] : 0, rt = x < w - 1 ? src[i + 1] : 0;
        if (fam.get(up) !== fi) dst[i] = hi.get(c);
        else if (fam.get(dn) !== fi) dst[i] = sh.get(c);
        else if (fam.get(rt) !== fi) dst[i] = sh.get(c);
      }
    }
    img.data.set(new Uint8ClampedArray(dst.buffer));
    g.putImageData(img, 0, 0);
  }

  // Soles and laces on the shoe colours (bottom of the sprite only).
  function shoes(cv, L) {
    const w = cv.width, h = cv.height, g = cv.getContext('2d');
    const img = g.getImageData(0, 0, w, h);
    const src = new Uint32Array(img.data.buffer);
    const dst = src.slice();
    const set = new Set([L.shoe, L.shoeL, L.shoeS].filter(Boolean).map(hexInt));
    const bright = parseInt(L.shoe.slice(1, 3), 16) > 200;
    const sole = hexInt(bright ? '#8c8c9c' : '#d8d0c4');
    const lace = hexInt(bright ? '#c0c0d0' : (L.shoeL || '#8a6a5a'));
    for (let y = 34; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!set.has(src[i])) continue;
        const dn = y < h - 1 ? src[i + w] : 0, up = src[i - w];
        if (dn === 0) dst[i] = sole;
        else if (!set.has(up) && x % 2 === 0) dst[i] = lace;
      }
    }
    img.data.set(new Uint8ClampedArray(dst.buffer));
    g.putImageData(img, 0, 0);
  }

  // Diagonal sheen strands on the hair colour.
  function hairSheen(cv, L, ymax) {
    if (!L.hair || L.hairStyle === 'hood') return;
    const w = cv.width, h = cv.height, g = cv.getContext('2d');
    const img = g.getImageData(0, 0, w, h);
    const src = new Uint32Array(img.data.buffer);
    const dst = src.slice();
    const base = hexInt(L.hair), l = hexInt(L.hairL), d = hexInt(shade(L.hair, -0.3));
    for (let y = 0; y < Math.min(h, ymax); y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i] !== base) continue;
        if ((x + 2 * y) % 7 === 0) dst[i] = l;
        else if ((x * 2 + y) % 11 === 4) dst[i] = d;
      }
    }
    img.data.set(new Uint8ClampedArray(dst.buffer));
    g.putImageData(img, 0, 0);
  }

  const famsFor = (L) => [
    [L.top, L.topS, L.topL], [L.pants, L.pantsS], [L.hair, L.hairL], [L.coat, L.coatS],
    [L.hatC], ['#f8d838', '#c8a018'], ['#d83838'], ['#6a78d8', '#4a58a8'], ['#c8b078', '#a89058'], ['#4a5a78', '#6a7a98'],
  ];

  function finishPerson(L, lo, o) {
    const cv = upscale(lo);
    bevel(cv, famsFor(L));
    shoes(cv, L);
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const { pose, f, oy, hy, hands, sleeping, blink } = o;
    const o2 = oy * 2, h2 = hy * 2;
    const F = (x, y, w, h, c) => R(x, y + h2, w, h, c);
    hairSheen(cv, L, 26 + h2);

    // shirt folds and cloth highlights
    R(14, 30 + o2, 3, 1, 'rgba(0,0,0,0.17)');
    R(16, 31 + o2, 2, 1, 'rgba(0,0,0,0.17)');
    R(11, 33 + o2, 3, 1, 'rgba(0,0,0,0.15)');
    R(10, 26 + o2, 3, 1, 'rgba(255,255,255,0.14)');
    R(18, 28 + o2, 2, 1, 'rgba(255,255,255,0.1)');

    if (L.logoQ) {
      const Q = ['.XXXX.', 'XX..XX', 'X....X', 'X....X', 'XX..XX', '.XXXXX', '....XX'];
      Q.forEach((row, yy) => { for (let xx = 0; xx < 6; xx++) if (row[xx] === 'X') R(9 + xx, 25 + yy + o2, 1, 1, '#ffffff'); });
    }

    // hands: knuckles, thumb light, finger gap
    hands.forEach(([lx, ly]) => {
      const x = lx * 2, y = ly * 2;
      R(x, y, 3, 3, L.skin);
      R(x, y + 2, 3, 1, L.skinS);
      R(x + 2, y + 1, 1, 1, L.skinS);
      R(x, y, 1, 1, shade(L.skin, 0.25));
    });

    // ---- held props (free-hand poses only)
    if (L.prop && hands[0] && ['stand', 'walk', 'talk', 'look', 'wave'].includes(pose)) {
      const x = hands[0][0] * 2, y = hands[0][1] * 2;
      if (L.prop === 'lens') {
        R(x + 1, y - 1, 1, 2, '#6a4a2a'); R(x + 2, y - 3, 1, 2, '#6a4a2a');
        R(x + 2, y - 9, 6, 6, '#b8c0d0'); R(x + 3, y - 8, 4, 4, 'rgba(190,235,255,0.7)'); R(x + 3, y - 8, 1, 1, '#ffffff');
      } else if (L.prop === 'roll') {
        R(x, y - 9, 4, 10, '#e8f0ff'); R(x, y - 9, 4, 1, '#8aa0d0'); R(x + 1, y - 6, 2, 1, '#3a6ac8'); R(x + 1, y - 4, 2, 1, '#3a6ac8'); R(x + 3, y - 9, 1, 10, '#c0cce8');
      } else if (L.prop === 'laptop') {
        R(x - 3, y - 1, 8, 4, '#8a8a9a'); R(x - 3, y - 1, 8, 1, '#c0c0d0'); R(x - 3, y + 2, 8, 1, '#5a5a6a'); R(x, y, 2, 1, '#e8e8f0');
      } else if (L.prop === 'clip') {
        R(x, y - 8, 6, 9, '#a87a48'); R(x + 1, y - 7, 4, 7, '#f8f8f8'); R(x + 2, y - 9, 2, 2, '#8a8a98');
        R(x + 1, y - 3, 1, 1, '#38b838'); R(x + 2, y - 2, 1, 1, '#38b838'); R(x + 3, y - 3, 1, 1, '#38b838'); R(x + 4, y - 4, 1, 1, '#38b838');
        R(x + 1, y - 6, 3, 1, '#b0b0c0'); R(x + 1, y - 5, 2, 1, '#b0b0c0');
      }
    }

    // ---- face
    const dark = '#1a1020';
    const mouthC = '#9a4a48';
    const expr = o.expr;
    const raise = pose === 'talk' && f % 2 ? 1 : 0;
    if (expr) F(14, 6, 8, 12, L.skin);
    F(16, 9, 4, 1, L.skinS); // lid
    if (expr === 'happy') {
      F(16, 11, 1, 1, dark); F(17, 10, 2, 1, dark); F(19, 11, 1, 1, dark);
      F(17, 8, 4, 1, L.hair);
      F(16, 14, 4, 2, 'rgba(226,96,104,0.6)');
      F(18, 16, 4, 1, '#5a1c2c'); F(19, 17, 2, 1, '#5a1c2c'); F(19, 17, 1, 1, '#e07078');
      F(24, 3, 1, 3, '#fff8a0'); F(23, 4, 3, 1, '#fff8a0');
    } else if (expr === 'scared') {
      F(15, 9, 5, 4, '#ffffff'); F(18, 10, 2, 2, dark); F(18, 10, 1, 1, '#ffffff');
      F(16, 7, 4, 1, L.hair); F(15, 8, 1, 1, L.hair);
      F(19, 15, 3, 3, '#5a1c2c'); F(16, 14, 3, 2, 'rgba(226,96,104,0.2)');
      F(23, 5, 1, 2, '#7ad8ff'); F(23, 7, 1, 1, '#c8f0ff');
    } else if (expr === 'frown') {
      F(16, 10, 2, 3, '#ffffff'); F(16, 12, 2, 1, '#d4d4e4'); F(18, 10, 2, 3, L.eye || dark); F(18, 10, 1, 1, '#ffffff');
      F(16, 8, 2, 1, L.hair); F(18, 9, 3, 1, L.hair);
      F(20, 16, 2, 1, mouthC); F(19, 17, 1, 1, mouthC); F(22, 17, 1, 1, 'rgba(0,0,0,0)');
    } else if (expr === 'yawn') {
      F(16, 11, 4, 1, '#3a2028'); F(17, 7, 4, 1, L.hair);
      F(19, 14, 3, 4, '#5a1c2c'); F(20, 16, 1, 2, '#e07078');
      F(16, 14, 3, 2, 'rgba(226,96,104,0.38)');
    } else {
      if (sleeping || blink) {
        F(16, 11, 4, 1, '#3a2028');
      } else {
        F(16, 10, 2, 3, '#ffffff'); F(16, 12, 2, 1, '#d4d4e4');
        F(18, 10, 2, 3, L.eye || dark);
        F(18, 10, 1, 1, '#ffffff'); F(19, 12, 1, 1, '#6a5a90');
      }
      F(17, 8 - raise, 4, 1, L.hair);
      F(16, 14, 3, 2, 'rgba(226,96,104,0.38)');
      if (pose === 'talk' && f % 2) { F(19, 16, 3, 2, '#5a1c2c'); F(20, 17, 2, 1, '#e07078'); }
      else if (sleeping) F(19, 17, 2, 1, mouthC);
      else { F(19, 17, 3, 1, mouthC); F(18, 16, 1, 1, '#b86a60'); }
    }
    F(22, 12, 2, 2, L.skin); F(22, 12, 1, 1, shade(L.skin, 0.25)); F(22, 14, 2, 1, L.skinS);
    F(12, 10, 2, 4, L.skinS); F(13, 11, 1, 2, shade(L.skinS, -0.25));
    if (L.earring) F(12, 14, 2, 2, L.earring);
    if (L.mustache) { F(18, 14, 5, 1, L.hair); F(19, 15, 3, 1, L.hair); F(18, 15, 1, 1, L.hair); F(20, 14, 2, 1, L.hairL); }
    if (L.glasses && !sleeping && expr !== 'happy') {
      const fr = '#1c1c24';
      F(15, 9, 6, 1, fr); F(15, 13, 6, 1, fr); F(15, 9, 1, 5, fr); F(20, 9, 1, 5, fr); F(12, 10, 3, 1, fr);
      F(16, 10, 4, 3, 'rgba(168,216,255,0.25)'); F(16, 10, 1, 1, 'rgba(255,255,255,0.7)');
    }
    if (L.goggles) {
      F(12, 4, 2, 1, '#e8ffff'); F(18, 4, 2, 1, '#e8ffff');
      F(12, 7, 4, 1, '#2a90b0'); F(18, 7, 4, 1, '#2a90b0');
    }
    if (L.headphones) {
      F(11, 0, 6, 1, '#5a5a78'); F(9, 8, 2, 1, '#5a5a78'); F(9, 13, 2, 1, '#14101c');
    }
    if (L.hat === 'fedora') {
      F(14, 0, 4, 1, shade(L.hatC, -0.3)); F(8, 4, 8, 1, shade(L.hatC, 0.2)); F(18, 2, 2, 2, '#c8a838');
    }
    if (L.hat === 'hardhat') { F(14, 0, 2, 4, '#fff0a0'); F(10, 1, 3, 1, '#fff8b0'); F(6, 5, 20, 1, '#a08010'); }
    if (L.hat === 'capback') { F(14, 2, 2, 2, '#ffffff'); F(17, 2, 1, 3, shade(L.hatC, -0.25)); }

    outline(cv);
    return cv;
  }

  function finishBack(L, lo) {
    const cv = upscale(lo);
    bevel(cv, famsFor(L));
    shoes(cv, L);
    hairSheen(cv, L, 24);
    const g = cv.getContext('2d');
    // hands gripping the rungs
    [[2, 3], [11, 3], [2, 16], [11, 16]].forEach(([lx, ly]) => {
      g.fillStyle = L.skinS; g.fillRect(lx * 2, ly * 2 + 1, 4, 1);
    });
    g.fillStyle = 'rgba(0,0,0,0.13)';
    g.fillRect(14, 24, 1, 9);
    outline(cv);
    return cv;
  }

  function finishCat(lo, pose) {
    const cv = upscale(lo);
    bevel(cv, [['#9a9aa8', '#c8c8d4', '#6a6a78']]);
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const eye = '#9ce040', pup = '#101010';
    if (pose === 'sit') {
      [[18, 4], [22, 4]].forEach(([x, y]) => { R(x, y, 2, 2, eye); R(x + 1, y, 1, 2, pup); R(x, y, 1, 1, '#e8ffb0'); });
      R(20, 6, 2, 1, '#f8a0a0');
      R(17, 1, 1, 1, '#d89090'); R(24, 1, 1, 1, '#d89090');
      R(17, 7, 1, 1, '#e8e8f0'); R(24, 7, 1, 1, '#e8e8f0');
    } else if (pose === 'sleep') {
      R(24, 12, 3, 1, '#3a3a48'); R(27, 13, 1, 1, '#f8a0a0');
    } else if (pose !== 'climb') {
      R(24, 4, 2, 2, eye); R(25, 4, 1, 2, pup); R(24, 4, 1, 1, '#e8ffb0');
      R(21, 1, 1, 1, '#d89090'); R(26, 1, 1, 1, '#d89090');
      R(30, 6, 2, 1, 'rgba(255,255,255,0.8)'); R(30, 8, 2, 1, 'rgba(255,255,255,0.8)');
    }
    outline(cv);
    return cv;
  }

  // ---- person ---------------------------------------------------------------
  function drawPerson(L, pose, f, opt = {}) {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 24;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { if (c) { g.fillStyle = c; g.fillRect(x, y, w, h); } };
    const P = (x, y, c) => R(x, y, 1, 1, c);
    const hands = [];
    const shoeS = L.shoeS || L.shoe;
    const sleeve = L.coat || L.top;
    const sleeveS = L.coatS || L.topS;

    if (pose === 'climb') return finishBack(L, drawBack(L, f, cv, R, P));

    const seated = pose === 'sit' || pose === 'type' || pose === 'sleep' || pose === 'think';
    const bob = pose === 'walk' && f % 2 === 1 ? -1 : 0;
    const oy = seated ? 3 : bob;
    const U = (x, y, w, h, c) => R(x, y + oy, w, h, c);
    const UP = (x, y, c) => R(x, y + oy, 1, 1, c);
    const HAND = (x, y) => { hands.push([x, y + oy]); R(x, y + oy, 1, 1, L.skin); };

    // legs ------------------------------------------------------------------
    if (seated) {
      R(5, 19, 7, 2, L.pants);
      R(4, 19, 1, 2, L.pantsS);
      R(10, 21, 3, 2, L.pants);
      R(10, 23, 4, 1, L.shoe);
      P(13, 23, L.shoeL);
    } else if (pose === 'walk') {
      const contact = f % 2 === 0;
      const nearFront = f === 0 || f === 1;
      const farC = L.pantsS, nearC = L.pants;
      if (contact) {
        const front = nearFront ? nearC : farC, back = nearFront ? farC : nearC;
        const frontShoe = nearFront ? L.shoe : shoeS, backShoe = nearFront ? shoeS : L.shoe;
        const drawFront = () => { R(8, 18, 3, 2, front); R(9, 20, 3, 2, front); R(10, 22, 4, 2, frontShoe); };
        const drawBack = () => { R(5, 18, 3, 2, back); R(4, 20, 3, 2, back); R(2, 22, 4, 2, backShoe); };
        if (nearFront) { drawBack(); drawFront(); } else { drawFront(); drawBack(); }
      } else {
        // passing: one leg straight, the other lifted
        const liftNear = f === 3;
        const straightC = liftNear ? farC : nearC, liftC = liftNear ? nearC : farC;
        const straightShoe = liftNear ? shoeS : L.shoe, liftShoe = liftNear ? L.shoe : shoeS;
        const straight = () => { R(6, 18, 3, 4, straightC); R(6, 22, 4, 2, straightShoe); };
        const lifted = () => { R(7, 18, 3, 2, liftC); R(8, 20, 2, 1, liftC); R(8, 21, 3, 1, liftShoe); };
        if (liftNear) { straight(); lifted(); } else { lifted(); straight(); }
      }
    } else {
      R(5, 18, 2, 4, L.pantsS);
      R(5, 22, 3, 2, shoeS);
      R(8, 18, 3, 4, L.pants);
      R(8, 22, 4, 2, L.shoe);
      P(10, 22, L.shoeL);
    }

    // back arm (behind torso) when swinging
    if (pose === 'walk' && f === 2) { U(10, 12, 2, 4, sleeveS); UP(11, 16, L.skinS); }

    // coat tail over the legs ------------------------------------------------
    if (L.coat) {
      if (seated) { U(4, 17, 3, 2, L.coatS); }
      else {
        R(4, 18 + oy, 7, 3, L.coat);
        R(4, 18 + oy, 1, 3, L.coatS);
        if (pose === 'walk') P(f % 2 ? 10 : 3, 20 + oy, L.coatS);
      }
    }

    // torso -------------------------------------------------------------------
    U(7, 10, 3, 1, L.skinS); // neck
    U(4, 11, 8, 7, L.top);
    U(4, 11, 1, 7, L.topS);
    U(6, 11, 4, 1, L.topL);
    if (L.collar) { UP(8, 11, L.collar); UP(9, 11, L.collar); }
    if (L.hem) U(4, 17, 8, 1, L.topS);
    if (L.stripes) { U(5, 13, 7, 1, L.stripes); U(5, 15, 7, 1, L.stripes); }
    if (L.inner) { U(9, 11, 2, 4, L.inner); if (L.tie) { UP(10, 12, L.tie); UP(10, 13, L.tie); UP(10, 14, L.tie); } U(8, 11, 1, 6, L.topS); }
    if (L.belt) U(4, 16, 8, 1, L.belt);
    if (L.overalls) {
      U(5, 13, 6, 5, L.pants);
      UP(5, 11, L.pants); UP(5, 12, L.pants); UP(10, 11, L.pants); UP(10, 12, L.pants);
      UP(7, 14, '#f8d838');
    }
    if (L.strings) { UP(9, 12, '#e0e0e0'); UP(9, 13, '#e0e0e0'); UP(7, 12, '#e0e0e0'); }
    if (!seated) R(4, 17 + oy, 8, 1, L.overalls ? L.pants : (L.belt || L.pantsS));

    // front arm by pose ---------------------------------------------------------
    const hand = L.skin;
    switch (pose) {
      case 'walk': {
        if (f === 0) { U(9, 12, 2, 3, sleeveS); U(10, 14, 2, 2, sleeveS); HAND(11, 16); }
        else if (f === 2) { U(6, 12, 2, 4, sleeveS); HAND(6, 16); }
        else { U(8, 12, 2, 5, sleeveS); HAND(8, 17); }
        if (L.flask && f !== 2) drawFlask(f === 0 ? 11 : 8, (f === 0 ? 13 : 14) + oy, L.flask, R, P);
        break;
      }
      case 'type': case 'sleep': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 14, 4, 2, sleeveS);
        const up = pose === 'type' && f % 2 === 1;
        HAND(13, up ? 13 : 14); HAND(14, up ? 14 : 13);
        break;
      }
      case 'think': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 9, 2, 4, sleeveS);
        HAND(10, 8); HAND(11, 9);
        break;
      }
      case 'sit': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 14, 3, 2, sleeveS);
        HAND(12, 15);
        break;
      }
      case 'term': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 14, 4, 2, sleeveS);
        HAND(13, f % 2 ? 13 : 14);
        break;
      }
      case 'mix': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 13, 3, 2, sleeveS);
        HAND(12, 13);
        drawFlask(12, 9 + oy + (f % 2), L.flask || '#58c8e8', R, P);
        break;
      }
      case 'read': {
        U(8, 12, 2, 2, sleeveS);
        U(9, 13, 2, 2, sleeveS);
        const bc = '#3858a8';
        U(11, 10, 4, 6, bc);
        U(11, 10, 1, 6, '#203870');
        U(12, 11, 3, 4, f % 2 ? '#f0f0e0' : '#e0e0d0');
        UP(12 + (f % 3), 12, '#8888a0');
        HAND(10, 13);
        break;
      }
      case 'drink': {
        const up = f % 2 === 1;
        U(8, 11, 2, 3, sleeveS);
        if (up) { U(9, 9, 2, 3, sleeveS); U(11, 6, 2, 3, '#f8f8f8'); UP(11, 6, '#6a3a1a'); HAND(10, 8); }
        else { U(9, 13, 3, 2, sleeveS); U(12, 11, 2, 3, '#f8f8f8'); UP(12, 11, '#6a3a1a'); HAND(11, 13); }
        break;
      }
      case 'look': {
        U(8, 11, 2, 3, sleeveS);
        U(9, 6, 2, 5, sleeveS);
        HAND(10, 4); HAND(11, 4);
        break;
      }
      case 'carry': {
        U(8, 12, 2, 3, sleeveS);
        U(9, 10, 6, 6, '#b0783c');
        U(9, 10, 6, 1, '#d09858');
        U(9, 12, 6, 1, '#e8c888');
        HAND(9, 14);
        break;
      }
      case 'talk': {
        if (f % 2) { U(8, 12, 2, 2, sleeveS); U(9, 11, 3, 2, sleeveS); HAND(12, 10); HAND(12, 11); }
        else { U(8, 12, 2, 4, sleeveS); U(9, 15, 2, 1, sleeveS); HAND(10, 16); }
        break;
      }
      case 'wave': {
        U(8, 12, 2, 2, sleeveS);
        U(9, 6 + (f % 2), 2, 6, sleeveS);
        HAND(10, 5 + (f % 2)); HAND(9, 5 + (f % 2));
        break;
      }
      case 'swing': {
        // ping-pong: paddle back low / forward high
        if (f % 2) { U(8, 12, 2, 2, sleeveS); U(9, 10, 3, 2, sleeveS); HAND(12, 9); U(12, 5, 3, 3, '#d83838'); UP(12, 8, '#8a5a2a'); }
        else { U(6, 12, 2, 4, sleeveS); HAND(6, 16); U(3, 15, 3, 3, '#d83838'); UP(5, 15, '#8a5a2a'); }
        break;
      }
      case 'throw': {
        // darts: aim with the arm cocked, then release
        if (f % 2) { U(8, 12, 2, 2, sleeveS); U(9, 11, 4, 2, sleeveS); HAND(13, 11); }
        else { U(7, 8, 2, 5, sleeveS); HAND(7, 7); UP(8, 6, '#f8d838'); UP(9, 5, '#c8c8d0'); }
        break;
      }
      case 'smoke': {
        if (f % 2) { U(8, 11, 2, 3, sleeveS); U(9, 9, 2, 3, sleeveS); HAND(10, 8); UP(11, 8, '#f0f0f0'); UP(12, 8, '#f87838'); }
        else { U(8, 12, 2, 5, sleeveS); HAND(8, 17); UP(9, 17, '#f0f0f0'); UP(10, 17, '#f87838'); }
        break;
      }
      case 'stretch': {
        const up = f % 2;
        U(5, 4 + up, 2, 7, sleeveS); U(9, 4 + up, 2, 7, sleeveS);
        HAND(5, 3 + up); HAND(10, 3 + up);
        break;
      }
      default: {
        U(8, 12, 2, 5, sleeveS);
        HAND(8, 17);
        UP(9, 17, L.skinS);
        if (L.flask) drawFlask(8, 15 + oy, L.flask, R, P);
      }
    }

    // head ----------------------------------------------------------------------
    const hy = oy + (pose === 'sleep' ? 3 : 0);
    const H = (x, y, w, h, c) => R(x, y + hy, w, h, c);
    const HP = (x, y, c) => R(x, y + hy, 1, 1, c);
    const sleeping = pose === 'sleep';
    const blink = !sleeping && (f === 7 || !!opt.blink);

    if (L.hairStyle === 'long') H(3, 3, 3, 9, L.hair);
    if (L.hairStyle === 'pony') { H(2, 5, 2, 4, L.hair); HP(2, 9, L.hairL); HP(3, 4, L.hair); }

    H(5, 3, 6, 7, L.skin);
    HP(11, 6, L.skin);               // nose
    H(6, 9, 4, 1, L.skinS);          // jaw shade
    HP(6, 5, L.skinS); HP(6, 6, L.skinS); // ear
    U(6, 14, 1, 3, 'rgba(0,0,0,0.13)'); // fold in the shirt

    switch (L.hairStyle) {
      case 'neat':
        H(4, 1, 7, 2, L.hair); H(4, 3, 2, 3, L.hair); H(6, 3, 4, 1, L.hair);
        HP(10, 2, L.hair); HP(6, 1, L.hairL); HP(7, 1, L.hairL); HP(8, 1, L.hairL);
        break;
      case 'messy':
        H(4, 1, 7, 2, L.hair); H(4, 3, 2, 4, L.hair); H(6, 3, 3, 1, L.hair);
        HP(5, 0, L.hair); HP(8, 0, L.hair); HP(11, 1, L.hair); HP(3, 2, L.hair); HP(10, 3, L.hair);
        HP(7, 1, L.hairL); HP(9, 1, L.hairL);
        break;
      case 'curly':
        H(3, 1, 8, 2, L.hair); H(3, 3, 3, 5, L.hair); H(6, 3, 3, 1, L.hair);
        HP(4, 0, L.hair); HP(7, 0, L.hair); HP(10, 0, L.hair); HP(11, 2, L.hair); HP(2, 4, L.hair); HP(2, 6, L.hair);
        HP(4, 1, L.hairL); HP(6, 2, L.hairL); HP(9, 1, L.hairL); HP(3, 5, L.hairL); HP(4, 7, L.hairL);
        break;
      case 'pony': case 'short':
        H(4, 1, 7, 2, L.hair); H(4, 3, 2, 4, L.hair); H(6, 3, 4, 1, L.hair);
        HP(7, 1, L.hairL); HP(8, 1, L.hairL);
        break;
      case 'long':
        H(4, 1, 7, 2, L.hair); H(6, 3, 4, 1, L.hair); HP(10, 3, L.hair);
        HP(6, 1, L.hairL); HP(7, 1, L.hairL); HP(4, 5, L.hairL);
        break;
      case 'hood':
        H(4, 1, 7, 2, L.top); H(3, 2, 3, 8, L.top); HP(11, 2, L.top); HP(11, 3, L.top);
        H(6, 2, 5, 1, L.topS); HP(7, 3, L.hair); HP(8, 3, L.hair); HP(9, 3, L.hair);
        H(3, 2, 1, 8, L.topS);
        break;
      case 'buzz':
        H(4, 2, 2, 4, L.hair); H(5, 2, 5, 1, L.hair);
        break;
    }

    if (L.hat === 'nightcap') {
      H(4, 0, 7, 3, '#6a78d8'); H(3, 2, 2, 3, '#6a78d8'); H(2, 4, 2, 3, '#4a58a8'); H(4, 2, 7, 1, '#f0e8e8');
      H(1, 6, 3, 2, '#f8f8f8');
    }
    if (L.hat === 'safari') { H(5, 0, 6, 2, '#c8b078'); H(5, 1, 6, 1, '#6a5030'); H(2, 2, 12, 1, '#a89058'); }
    if (L.hat === 'beanie') { H(4, 0, 7, 3, '#4a5a78'); H(4, 2, 7, 1, '#6a7a98'); HP(7, 0, '#8a9ab8'); }
    if (L.hat === 'hardhat') { H(4, 0, 7, 2, '#f8d838'); H(3, 2, 10, 1, '#c8a018'); HP(6, 0, '#fff8b0'); HP(7, 0, '#fff8b0'); }
    if (L.hat === 'fedora') { H(5, 0, 6, 2, L.hatC); H(5, 1, 6, 1, L.band); H(3, 2, 10, 1, L.hatC); }
    if (L.hat === 'capback') { H(4, 1, 7, 2, L.hatC); H(1, 2, 4, 1, L.hatC); HP(8, 1, '#f8f8f8'); }
    if (L.goggles) {
      H(4, 3, 7, 1, '#3a3a44');
      H(6, 2, 2, 2, '#58c8e8'); H(9, 2, 2, 2, '#58c8e8');
    }
    if (L.headphones) {
      H(5, 0, 5, 1, '#2a2a3a'); HP(4, 1, '#2a2a3a');
      H(4, 4, 2, 3, '#2a2a3a'); HP(4, 5, L.headphones); HP(5, 5, L.headphones);
    }

    return finishPerson(L, cv, { pose, f, oy, hy, hands, sleeping, blink, expr: opt.expr });
  }

  function drawFlask(x, y, liquid, R, P) {
    P(x + 1, y, '#e8f4ff');
    P(x + 1, y + 1, '#c8dcf0');
    R(x, y + 2, 3, 2, liquid);
    P(x, y + 2, '#e8ffff');
    R(x, y + 4, 3, 1, liquid);
  }

  function drawBack(L, f, cv, R, P) {
    const sleeveS = L.coatS || L.topS;
    const a = f % 2 === 0;
    // legs
    R(a ? 4 : 8, 18, 3, 4, L.pants); R(a ? 4 : 8, 22, 3, 2, L.shoe);
    R(a ? 8 : 4, 18, 3, 2, L.pantsS); R(a ? 8 : 4, 20, 3, 2, L.shoeS || L.shoe);
    // torso
    R(3, 11, 9, 7, L.coat || L.top);
    R(3, 11, 1, 7, L.coatS || L.topS);
    R(11, 11, 1, 7, L.coatS || L.topS);
    if (L.coat) R(3, 18, 9, 2, L.coat);
    if (L.overalls) { R(4, 11, 1, 6, L.pants); R(10, 11, 1, 6, L.pants); R(4, 15, 7, 3, L.pants); }
    if (L.stripes) { R(3, 13, 9, 1, L.stripes); R(3, 15, 9, 1, L.stripes); }
    R(6, 10, 3, 1, L.skinS);
    // arms reaching up
    const hi = a ? 2 : 11, lo = a ? 11 : 2;
    R(hi, 4, 2, 7, sleeveS); R(hi, 3, 2, 1, L.skin);
    R(lo, 11, 2, 5, sleeveS); R(lo, 16, 2, 1, L.skin);
    // head from behind
    const hood = L.hairStyle === 'hood';
    R(4, 1, 7, 9, hood ? L.top : (L.hairStyle === 'buzz' ? L.skin : L.hair));
    if (L.hairStyle === 'buzz') R(4, 1, 7, 4, L.hair);
    P(3, 6, L.skin); P(11, 6, L.skin);
    if (L.hairStyle === 'long') R(4, 8, 7, 4, L.hair);
    if (L.hairStyle === 'pony') { R(6, 8, 3, 4, L.hair); }
    if (!hood) { P(6, 2, L.hairL); P(8, 3, L.hairL); }
    if (L.hat === 'hardhat') { R(4, 0, 7, 3, '#f8d838'); R(3, 3, 9, 1, '#c8a018'); }
    if (L.hat === 'fedora') { R(5, 0, 5, 2, L.hatC); R(3, 2, 9, 1, L.hatC); }
    if (L.hat === 'capback') { R(4, 1, 7, 2, L.hatC); R(6, 3, 3, 1, L.hatC); }
    if (L.goggles) R(4, 4, 7, 1, '#3a3a44');
    if (L.headphones) { R(4, 1, 7, 1, '#2a2a3a'); R(3, 5, 1, 3, '#2a2a3a'); R(11, 5, 1, 3, '#2a2a3a'); }
    return cv;
  }

  // ---- cat ------------------------------------------------------------------
  function drawCat(pose, f) {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 10;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const fur = '#9a9aa8', furD = '#6a6a78', furL = '#c8c8d4', eye = '#9ce040';
    if (pose === 'sleep') {
      R(3, 6, 10, 3, fur); R(4, 5, 7, 1, fur); R(5, 6, 1, 3, furD); R(8, 6, 1, 3, furD);
      R(10, 5, 4, 3, fur); R(10, 4, 1, 1, fur); R(13, 4, 1, 1, fur); R(11, 6, 2, 1, furD);
      R(1, 8, 4, 1, furD); R(2, 7, 1, 1, furD);
    } else if (pose === 'sit') {
      R(5, 4, 5, 5, fur); R(6, 4, 1, 5, furD); R(5, 9, 6, 1, furL);
      R(8, 0, 5, 4, fur); R(8, 0, 1, 1, '#0000'); R(8, -1, 1, 1, fur);
      g.clearRect(9, 0, 3, 0);
      R(8, 0, 1, 1, fur); R(12, 0, 1, 1, fur); R(9, 1, 3, 2, fur);
      R(11, 2, 1, 1, eye); R(9, 2, 1, 1, eye);
      R(2, 8, 4, 1, furD); R(1, 7, 1, 1, furD);
    } else {
      const a = f % 2 === 0;
      R(3, 4, 8, 3, fur); R(5, 4, 1, 3, furD); R(8, 4, 1, 3, furD); R(3, 7, 8, 1, furL);
      R(10, 1, 4, 4, fur); R(10, 0, 1, 1, fur); R(13, 0, 1, 1, fur); R(12, 2, 1, 1, eye); R(14, 3, 1, 1, '#f8a0a0');
      R(1, a ? 2 : 3, 2, 1, furD); R(0, a ? 1 : 2, 1, 1, furD); R(2, 3, 1, 2, furD);
      R(a ? 3 : 4, 8, 1, 2, furD); R(a ? 9 : 8, 8, 1, 2, furD); R(a ? 5 : 6, 8, 1, 1, fur); R(a ? 10 : 9, 8, 1, 1, fur);
    }
    return finishCat(cv, pose);
  }

  // Cat climbing the ladder, seen from behind: paws reach up in turns, tail hangs and swings.
  function catClimb(f) {
    const key = `catclimb|${f}`;
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas');
    cv.width = 12;
    cv.height = 16;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const fur = '#9a9aa8', furD = '#6a6a78', furL = '#c8c8d4';
    const a = f % 2 === 0;
    // head from behind with ears
    R(3, 1, 1, 1, fur); R(8, 1, 1, 1, fur); R(3, 2, 6, 4, fur); R(4, 3, 4, 1, furL);
    // back with stripes
    R(3, 6, 6, 6, fur); R(3, 8, 6, 1, furD); R(3, 10, 6, 1, furD); R(5, 6, 2, 1, furL);
    // front paws: one up on a rung, the other lower
    R(1, a ? 2 : 5, 2, a ? 5 : 3, fur); R(9, a ? 5 : 2, 2, a ? 3 : 5, fur);
    R(1, a ? 2 : 5, 2, 1, furL); R(9, a ? 5 : 2, 2, 1, furL);
    // hind legs push off in turn
    R(2, a ? 12 : 11, 2, 2, furD); R(8, a ? 11 : 12, 2, 2, furD);
    // tail
    R(a ? 5 : 6, 12, 1, 3, furD); R(a ? 4 : 7, 15, 1, 1, furD);
    const big = finishCat(cv, 'climb');
    cache.set(key, big);
    return big;
  }

  // ---- dog ------------------------------------------------------------------
  // Same 16×10 box as the cat, faces right; a ginger mutt with a dark floppy ear.
  function drawDog(pose, f) {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 10;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const fur = '#c88a50', furD = '#8a5a30', furL = '#ecc090', ear = '#5a3820', nose = '#140c1c';
    if (pose === 'sleep') {
      R(2, 6, 11, 3, fur); R(3, 5, 7, 1, fur); R(3, 8, 9, 1, furL);
      R(10, 5, 5, 4, fur); R(10, 5, 2, 3, ear); R(14, 7, 2, 2, furL); R(15, 7, 1, 1, nose);
      R(0, 7, 2, 1, furD);
    } else if (pose === 'sit') {
      R(5, 4, 5, 5, fur); R(9, 5, 2, 4, furL); R(5, 9, 7, 1, furL);
      R(8, 0, 6, 4, fur); R(13, 2, 2, 2, furL); R(14, 2, 1, 1, nose); R(8, 0, 2, 4, ear);
      R(10, 8, 1, 2, furD); R(12, 8, 1, 2, furD);
      R(2, 7, 3, 1, furD); R(2, 6 - (f % 2), 1, 1, furD);
    } else {
      const a = f % 2 === 0;
      R(2, 4, 9, 4, fur); R(3, 7, 7, 1, furL); R(5, 4, 1, 3, furD);
      R(10, 1, 5, 4, fur); R(14, 3, 2, 2, furL); R(15, 3, 1, 1, nose); R(10, 1, 2, 3, ear);
      R(0, a ? 2 : 3, 2, 1, furD); R(1, a ? 3 : 4, 1, 1, furD);
      R(a ? 3 : 4, 8, 1, 2, furD); R(a ? 9 : 8, 8, 1, 2, furD); R(a ? 5 : 4, 8, 1, 2, fur); R(a ? 10 : 11, 8, 1, 2, fur);
    }
    const big = upscale(cv);
    bevel(big, [[fur, furL, furD]]);
    const G = big.getContext('2d');
    const P = (x, y, w, h, c) => { G.fillStyle = c; G.fillRect(x, y, w, h); };
    if (pose === 'sit') { P(24, 2, 2, 2, nose); P(24, 2, 1, 1, '#f8f8f8'); }
    else if (pose === 'sleep') P(25, 13, 3, 1, '#5a3820');
    else { P(25, 4, 2, 2, nose); P(25, 4, 1, 1, '#f8f8f8'); if (f % 2) P(28, 9, 2, 2, '#f87090'); }
    outline(big);
    return big;
  }

  function dog(pose, f, face) {
    const key = `dog|${pose}|${f}|${face}`;
    let s = cache.get(key);
    if (!s) {
      const base = drawDog(pose, f);
      s = face < 0 ? mirror(base) : base;
      cache.set(key, s);
    }
    return s;
  }

  const SEATED = ['sit', 'type', 'sleep', 'think'];
  const BREATHE = ['stand', 'sit', 'think', 'sleep', 'type', 'look', 'term'];
  // Chest rise: everything above the hips drops one sprite pixel.
  function breathe(cv, pose) {
    const cut = SEATED.includes(pose) ? 40 : 34;
    const out = document.createElement('canvas');
    out.width = cv.width;
    out.height = cv.height;
    const g = out.getContext('2d');
    g.drawImage(cv, 0, cut, cv.width, cv.height - cut, 0, cut, cv.width, cv.height - cut);
    g.drawImage(cv, 0, 0, cv.width, cut, 0, 1, cv.width, cut);
    return out;
  }

  function person(look, pose, f, face, o = {}) {
    const key = `${look.name}${look.tag || ''}|${pose}|${f}|${face}|${o.expr || ''}|${o.blink ? 1 : 0}|${o.breath ? 1 : 0}`;
    let s = cache.get(key);
    if (!s) {
      let base = drawPerson(look, pose, f, o);
      if (o.breath && BREATHE.includes(pose)) base = breathe(base, pose);
      s = face < 0 ? mirror(base) : base;
      cache.set(key, s);
    }
    return s;
  }

  function cat(pose, f, face) {
    const key = `cat|${pose}|${f}|${face}`;
    let s = cache.get(key);
    if (!s) {
      const base = drawCat(pose, f);
      s = face < 0 ? mirror(base) : base;
      cache.set(key, s);
    }
    return s;
  }

  return { person, cat, catClimb, dog, outfit };
})();
