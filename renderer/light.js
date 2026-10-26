// Lighting pass. The pixel art underneath stays pixelated; everything here is smooth
// gradients drawn at screen resolution, so light stays soft however far the camera zooms.
// All coordinates are building coordinates (the caller has already shifted the canvas by TOP).
const Light = (() => {
  const roomRect = (name) => {
    const r = ROOMS.find((x) => x.name === name);
    return { x: r.x, y: FLOOR[r.f] - 80, w: r.w, h: 80, f: r.f };
  };

  function glow(g, x, y, r, rgb, a) {
    const k = g.createRadialGradient(x, y, 0, x, y, r);
    k.addColorStop(0, `rgba(${rgb},${a})`);
    k.addColorStop(0.4, `rgba(${rgb},${a * 0.38})`);
    k.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = k;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Runs fn with drawing clipped to one room, so light never leaks through the walls.
  function inRoom(g, name, fn) {
    const r = roomRect(name);
    g.save();
    g.beginPath();
    g.rect(r.x, r.y + 3, r.w, r.h - 3);
    g.clip();
    fn(r);
    g.restore();
  }

  // Slanted sunbeam from a window down to the floor.
  function shaft(g, room, win, lean, rgb, a, floor) {
    inRoom(g, room, () => {
      const [x, y, w] = win;
      const spread = 12;
      const k = g.createLinearGradient(0, y, 0, floor);
      k.addColorStop(0, `rgba(${rgb},${a})`);
      k.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = k;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y);
      g.lineTo(x + w + lean + spread, floor);
      g.lineTo(x + lean - spread, floor);
      g.closePath();
      g.fill();
    });
  }

  const DUST = Array.from({ length: 18 }, (_, i) => ({ a: (i * 37) % 100 / 100, b: (i * 61) % 100 / 100, s: 0.5 + (i % 4) * 0.25 }));

  function dust(g, t, room, win, lean, floor, alpha) {
    inRoom(g, room, () => {
      const [x, y, w] = win;
      const len = floor - y;
      g.fillStyle = `rgba(255,248,214,${alpha})`;
      for (const d of DUST) {
        const p = (d.b + t * 0.012 * d.s) % 1;
        const px = x + d.a * w + lean * p + Math.sin(t * 0.7 * d.s + d.a * 20) * 3;
        const py = y + p * len;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 * d.s + d.b * 9));
        g.globalAlpha = tw;
        g.fillRect(px, py, 1, 1);
      }
      g.globalAlpha = 1;
    });
  }

  // Soft contact shadows, drawn under the people.
  function shadows(g, S, list) {
    g.save();
    g.scale(S, S);
    g.fillStyle = 'rgba(8,4,20,0.3)';
    for (const a of list) {
      if (!a.alpha || a.alpha < 0.3 || a.pose === 'climb') continue;
      g.globalAlpha = a.alpha;
      g.beginPath();
      g.ellipse(a.x, a.y - 0.5, a.isCat ? 5 : 7, 1.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function draw(g, S, st) {
    const { t } = st;
    const night = Scene.nightness(st.hour);
    const dusk = night > 0 && night < 0.9;
    g.save();
    g.scale(S, S);

    // 1. ambient shading + depth: every room darkens toward its corners, more so at night
    for (const r of ROOMS) {
      inRoom(g, r.name, (b) => {
        const cx = b.x + b.w / 2;
        const k = g.createRadialGradient(cx, b.y + 46, 14, cx, b.y + 46, 76);
        k.addColorStop(0, 'rgba(6,4,26,0)');
        k.addColorStop(1, `rgba(6,4,26,${0.34 + night * 0.2})`);
        g.fillStyle = k;
        g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = `rgba(8,10,40,${night * 0.28})`;
        g.fillRect(b.x, b.y, b.w, b.h);
        // floor and ceiling occlusion
        const fl = g.createLinearGradient(0, b.y + b.h - 18, 0, b.y + b.h);
        fl.addColorStop(0, 'rgba(0,0,0,0)');
        fl.addColorStop(1, 'rgba(0,0,0,0.28)');
        g.fillStyle = fl;
        g.fillRect(b.x, b.y + b.h - 18, b.w, 18);
        const ce = g.createLinearGradient(0, b.y, 0, b.y + 14);
        ce.addColorStop(0, 'rgba(0,0,0,0.3)');
        ce.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ce;
        g.fillRect(b.x, b.y, b.w, 14);
      });
    }

    // 2. light sources add up
    g.globalCompositeOperation = 'lighter';
    const flick = st.flicker ? 0.5 + 0.5 * Math.sin(t * 61) : 1;

    // ceiling lamps
    for (const r of ROOMS) {
      const lx = r.x + Math.floor(r.w / 2);
      const ly = FLOOR[r.f] - 80 + 10;
      inRoom(g, r.name, () => {
        glow(g, lx, ly, 62, '255,226,150', (0.2 - night * 0.04) * flick);
        glow(g, lx, ly + 2, 14, '255,244,200', 0.22 * flick);
      });
    }

    // sunlight / moonlight through the windows
    const wins = [
      ['claude', [75, 33, 30], -26, 104],
      ['qwen', [183, 33, 26], -20, 104],
      ['rec', [57, -55, 28], -24, 16],
      ['kitchen', [221, 126, 11], -10, 180],
    ];
    const sun = night < 0.3 ? '255,240,180' : night < 0.9 ? '255,150,90' : '110,140,255';
    const sunA = night < 0.3 ? 0.2 : night < 0.9 ? 0.16 : 0.07;
    for (const [room, win, lean, floor] of wins) {
      shaft(g, room, win, lean, sun, sunA * flick, floor);
      if (night < 0.9) dust(g, t, room, win, lean, floor, 0.55);
    }

    // screens
    const scr = { web: '90,170,255', code: '90,230,130', idle: '140,140,210' }[st.claudeScreen] || '140,140,210';
    inRoom(g, 'claude', () => {
      glow(g, 44, 86, 30, scr, st.claudeScreen === 'idle' ? 0.16 : 0.3);
      glow(g, 44, 100, 16, scr, 0.1);
    });
    const qa = { offline: 0, loading: 0.14, idle: 0.2, busy: 0.34 + 0.06 * Math.sin(t * 9) }[st.qwenStatus] || 0;
    if (qa) {
      inRoom(g, 'qwen', () => {
        glow(g, 218, 86, 28, '160,110,255', qa);
        glow(g, 233, 86, 28, '70,225,225', qa * 0.9);
        const hue = (t * (st.qwenStatus === 'busy' ? 160 : 40)) % 360;
        const rgb = hslToRgb(hue / 360, 0.9, 0.6);
        glow(g, 245, 88, 24, rgb, 0.2);
      });
    }
    inRoom(g, 'qwen', () => glow(g, 207, 90, 14, '255,140,50', 0.22));

    // server room + terminal
    inRoom(g, 'server', () => {
      const busy = st.serverBusy ? 1 : 0;
      glow(g, 163, 160, 44, '60,220,140', 0.1 + busy * 0.1);
      glow(g, 156, 150, 22, '80,150,255', 0.09);
      glow(g, 180, 169, 18, '60,240,120', 0.2);
    });
    inRoom(g, 'kitchen', () => { if (st.coffeeOn) glow(g, 210, 166, 14, '255,80,60', 0.25); });

    // lab: burner flame
    inRoom(g, 'lab', () => glow(g, 67, 173, 20, '90,150,255', 0.17 + 0.04 * Math.sin(t * 20)));

    // games and rec rooms
    inRoom(g, 'games', () => {
      if (st.tvOn) glow(g, 229, -33, 62, '90,170,255', 0.26 + 0.05 * Math.sin(t * 7));
      glow(g, 156, -12, 26, '150,100,255', st.arcadeOn ? 0.3 : 0.12);
    });
    inRoom(g, 'rec', () => glow(g, 98, -45, 16, '255,170,60', 0.14));

    // street door open: warm light spills in
    if (st.doorOpen) {
      inRoom(g, 'kitchen', () => glow(g, 240, 178, 34, '255,220,130', 0.28));
    }

    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  function hslToRgb(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return `${f(0)},${f(8)},${f(4)}`;
  }

  // Screen-space framing: soft vignette over the whole picture, after the camera is done.
  function vignette(g, w, h) {
    const k = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    k.addColorStop(0, 'rgba(0,0,0,0)');
    k.addColorStop(1, 'rgba(4,2,14,0.38)');
    g.fillStyle = k;
    g.fillRect(0, 0, w, h);
  }

  return { draw, shadows, vignette };
})();
