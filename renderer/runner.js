// Runner mini-game: Claude runs down the endless street while you wait for an answer.
// Space / Up - jump (hold for higher), Down - duck, F / X / Right - shotgun, Enter / Esc - back to the office.
// Boosters on the way: a shotgun (3 shells, blows the nearest obstacle away) and a rocket (a few seconds of flight).
// When the answer arrives the game pauses: Enter goes to the office, any other key plays on.
// It starts with Claude stepping out of the office door; the building slides away to the left.
const Runner = (() => {
  const STREET = TOP + 200;          // sidewalk top, same as the office's street
  const GROUND = TOP + FLOOR[0];     // runner's feet
  const RX = 44;                     // runner's x on screen once the camera has caught up
  const DOOR_X = 241;                // office door: where the intro starts
  const STEP = FLOOR[0] - FLOOR[1];  // the door is a step above the sidewalk
  const INTRO = 1.8;
  const ZOOM = 1.2;                  // once the intro is over the camera is a bit closer, street at the bottom
  const GRAV = 980, JUMP = 290, HOLD_GRAV = 560, DROP = 2200;
  const SHELLS = 3, GUN_RANGE = 90, ROCKET = 4, ROCKET_Y = 58;
  const BEST_KEY = 'office.runnerBest';

  const back = document.createElement('canvas');
  back.width = W;
  back.height = H;
  const bg = back.getContext('2d');
  // obstacles and bonuses are drawn on their own layers, then glued on with a glow
  const layer = () => { const c = document.createElement('canvas'); return { c, g: c.getContext('2d') }; };
  const obsL = layer(), itemL = layer(), snap = layer();

  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch {}

  const st = {
    on: false, mode: 'intro', // intro | run | over | answer(-over) | count
    t: 0, scroll: 0, dist: 0, speed: 0, y: 0, vy: 0, duck: false, hold: false, sx: RX,
    obs: [], items: [], nextObs: 0, nextItem: 0, coffee: 0, slowUntil: 0,
    count: 0, answered: false, newBest: false, flash: 0, games: 0, pops: [], hundreds: 0, dim: 0,
    ammo: 0, kills: 0, blast: -9, rocketUntil: -9, bits: [],
  };

  const score = () => Math.floor(st.dist / 8) + st.coffee * 25 + st.kills * 15;
  const flying = () => st.t < st.rocketUntil;
  const safe = () => st.t < st.rocketUntil + 0.6; // a moment to land after the rocket
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

  function reset() {
    Object.assign(st, {
      t: 0, dist: 0, speed: 95, y: 0, vy: 0, duck: false, hold: false, sx: RX,
      obs: [], items: [], nextObs: 1.2, nextItem: 3, coffee: 0, slowUntil: 0, newBest: false, flash: 0, pops: [], hundreds: 0,
      ammo: 0, kills: 0, blast: -9, rocketUntil: -9, bits: [],
    });
  }

  function start() {
    st.on = true;
    st.answered = false;
    reset();
    Object.assign(st, { mode: 'intro', scroll: 0, runX0: 0, sx: DOOR_X, y: STEP, dim: 0, nextObs: INTRO + 1, nextItem: INTRO + 2.5 });
    st.games++;
    Sound.setGame(true);
  }
  function stop() {
    st.on = false;
    Sound.setGame(false);
  }

  function go() {
    reset();
    st.mode = 'run';
    st.games++;
    Sound.jump();
  }

  function endIntro() {
    st.sx = RX;
    st.dim = 1;
    st.mode = 'run';
  }

  // Claude finished (or is waiting for you): pause and ask.
  function answer() {
    if (!st.on) return;
    st.answered = true;
    if (st.mode === 'intro') endIntro();
    if (st.mode === 'run' || st.mode === 'count') st.mode = 'answer';
    else if (st.mode === 'over') st.mode = 'answer-over';
  }

  // returns true when the player wants back to the office
  function key(e) {
    const k = e.key;
    if (k === 'Escape') return true;
    if (k === 'Enter') return st.answered || st.mode === 'over';
    const jumpKey = k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'ц';
    const duckKey = k === 'ArrowDown' || k === 's' || k === 'ы';
    if (st.mode.startsWith('answer')) {
      st.mode = st.mode === 'answer-over' ? 'over' : 'count';
      st.count = 1.5;
      return false;
    }
    if (st.mode === 'over') {
      if (jumpKey && !e.repeat && st.t >= 0.6) go();
      return false;
    }
    if (st.mode !== 'run' && st.mode !== 'intro') return false;
    const fireKey = k === 'f' || k === 'а' || k === 'x' || k === 'ч' || k === 'ArrowRight';
    if (fireKey && !e.repeat && st.mode === 'run') { fire(); return false; }
    if (jumpKey && st.y === 0 && !st.duck) { st.vy = -JUMP; st.hold = true; Sound.jump(); }
    if (duckKey) st.duck = true;
    return false;
  }
  function keyUp(e) {
    const k = e.key;
    if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'ц') st.hold = false;
    if (k === 'ArrowDown' || k === 's' || k === 'ы') st.duck = false;
  }

  // ---------------------------------------------------------------- world
  const KINDS = [
    { id: 'bug', w: 9, h: 7, min: 0 },
    { id: 'cat', w: 12, h: 8, min: 0 },
    { id: 'error', w: 10, h: 14, min: 0 },
    { id: 'bugs', w: 21, h: 7, min: 60 },
    { id: 'server', w: 10, h: 20, min: 120 },
    { id: 'clock', w: 11, h: 11, min: 180, fly: 15 },
  ];

  function spawnObstacle() {
    const sc = score();
    const list = KINDS.filter((k) => sc >= k.min);
    const k = list[Math.floor(Math.random() * list.length)];
    st.obs.push({ ...k, x: W + 8, fly: k.fly || 0, seed: Math.random() });
    const gap = 0.75 + Math.random() * 0.9 + 22 / st.speed;
    st.nextObs = st.t + gap * Math.max(0.6, 140 / st.speed);
  }

  function spawnItem() {
    const r = Math.random(), boost = score() >= 40;
    const id = boost && r < 0.12 && !st.ammo ? 'gun' : boost && r < 0.2 && !flying() ? 'rocket' : r < 0.33 ? 'qwen' : 'coffee';
    st.items.push({ id, x: W + 8, up: Math.random() < 0.6 ? 30 : 8 });
    st.nextItem = st.t + 2.5 + Math.random() * 3.5;
  }

  // Shotgun: the nearest obstacle ahead (within range, any height) flies apart.
  function fire() {
    if (!st.ammo) return;
    st.ammo--;
    st.blast = st.t;
    Sound.shot();
    const target = st.obs.filter((o) => o.x + o.w > st.sx + 4 && o.x < st.sx + GUN_RANGE).sort((a, b) => a.x - b.x)[0];
    if (!target) return;
    st.obs = st.obs.filter((o) => o !== target);
    st.kills++;
    const cy = GROUND - target.fly - target.h / 2;
    for (let i = 0; i < 14; i++) {
      st.bits.push({ x: target.x + Math.random() * target.w, y: cy + (Math.random() - 0.5) * target.h, vx: 40 + Math.random() * 90, vy: -60 - Math.random() * 90, t: 0, c: ['#ff3838', '#f8d838', '#8a8a9a', '#f8f8f8'][i % 4] });
    }
    st.pops.push({ x: target.x + target.w / 2, y: cy - 10, text: 'БАХ! +15', t: 0 });
  }

  function hitbox() {
    const h = st.duck && st.y === 0 ? 12 : 20;
    return { x0: st.sx - 4, x1: st.sx + 4, y0: GROUND - st.y - h, y1: GROUND - st.y };
  }

  function physics(dt) {
    // rocket: rise to cruising height and stay there
    if (flying()) {
      st.y += (ROCKET_Y - st.y) * Math.min(1, dt * 4);
      st.vy = 0;
      return;
    }
    // holding the jump key makes the jump higher, Down drops faster
    const g = st.duck ? DROP : st.hold && st.vy < 0 ? HOLD_GRAV : GRAV;
    st.vy += g * dt;
    st.y -= st.vy * dt;
    if (st.y <= 0) { st.y = 0; st.vy = 0; }
  }

  function update(dt) {
    if (!st.on) return;
    if (st.mode === 'count') {
      st.count -= dt;
      if (st.count <= 0) st.mode = 'run';
      return;
    }
    st.t += dt;
    st.flash = Math.max(0, st.flash - dt);
    for (const p of st.pops) p.t += dt;
    st.pops = st.pops.filter((p) => p.t < 1);
    for (const b of st.bits) { b.t += dt; b.vy += 400 * dt; b.x += (b.vx - st.speed) * dt; b.y += b.vy * dt; }
    st.bits = st.bits.filter((b) => b.t < 0.9);

    if (st.mode === 'intro') {
      // Claude hops off the door step and speeds up; the camera catches up with him
      const k = st.t / INTRO, e = ease(k);
      st.runX0 += 95 * Math.min(1, st.t / 0.5) * dt;  // how far he ran from the door
      const worldX = DOOR_X + st.runX0;
      st.sx = worldX * (1 - e) + RX * e;
      st.scroll = worldX - st.sx;
      st.dim = ease(k);
      physics(dt);
      if (k >= 1) { endIntro(); st.t = INTRO; }
      return;
    }
    if (st.mode !== 'run') return;

    const slow = flying() ? 1.5 : st.t < st.slowUntil ? 0.6 : 1;
    st.speed = Math.min(225, 95 + st.dist / 80);
    const v = st.speed * slow;
    st.dist += v * dt;
    st.scroll += v * dt;
    physics(dt);

    if (st.t >= st.nextObs) spawnObstacle();
    if (st.t >= st.nextItem) spawnItem();
    for (const o of st.obs) o.x -= v * dt;
    for (const it of st.items) it.x -= v * dt;
    st.obs = st.obs.filter((o) => o.x + o.w > -10);
    st.items = st.items.filter((it) => it.x > -10 && !it.got);

    const b = hitbox();
    for (const o of st.obs) {
      const ox0 = o.x + 1, ox1 = o.x + o.w - 1;
      const oy1 = GROUND - o.fly, oy0 = oy1 - o.h + 1;
      if (b.x1 > ox0 && b.x0 < ox1 && b.y1 > oy0 && b.y0 < oy1 && !safe()) return crash();
    }
    for (const it of st.items) {
      const iy = GROUND - it.up;
      // in flight the rocket pulls bonuses up to Claude
      if (flying() ? Math.abs(it.x - st.sx) < 8 : Math.abs(it.x - st.sx) < 8 && iy > b.y0 - 4 && iy - 8 < b.y1) {
        it.got = true;
        const y = flying() ? b.y0 : iy;
        if (it.id === 'coffee') { st.coffee++; st.pops.push({ x: it.x, y: y - 10, text: '+25', t: 0 }); }
        else if (it.id === 'gun') { st.ammo = SHELLS; st.pops.push({ x: it.x, y: y - 10, text: 'ДРОБОВИК! F - ОГОНЬ', t: 0 }); }
        else if (it.id === 'rocket') { st.rocketUntil = st.t + ROCKET; st.pops.push({ x: it.x, y: y - 10, text: 'РАКЕТА!', t: 0 }); Sound.rocket(); }
        else { st.slowUntil = st.t + 3; st.pops.push({ x: it.x, y: y - 10, text: 'QWEN ДУМАЕТ...', t: 0 }); }
        Sound.coin();
      }
    }
    // a little sparkle every 100 points, like the dino
    const hundreds = Math.floor(score() / 100);
    if (hundreds > st.hundreds) {
      st.hundreds = hundreds;
      st.flash = 0.6;
      Sound.coin();
    }
  }

  function crash() {
    st.mode = 'over';
    st.t = 0;
    Sound.crash();
    const sc = score();
    if (sc > best) {
      best = sc;
      st.newBest = true;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
    }
  }

  // ---------------------------------------------------------------- drawing
  const pen = (g, S) => ({
    R: (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S)); },
    T: (text, x, y, c, s = 1) => FONT.draw(g, text, Math.round(x * S), Math.round(y * S), c, S * s),
    spr: (img, x, y, w, h) => { g.imageSmoothingEnabled = S !== 2; g.drawImage(img, Math.round(x * S), Math.round(y * S), w * S, h * S); g.imageSmoothingEnabled = false; },
  });

  function glowLayer(ctx, L, S, color, draw) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (L.c.width !== cw || L.c.height !== ch) { L.c.width = cw; L.c.height = ch; }
    L.g.setTransform(1, 0, 0, 1, 0, 0);
    L.g.clearRect(0, 0, cw, ch);
    L.g.setTransform(ctx.getTransform());
    draw(pen(L.g, S));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `drop-shadow(0 0 ${S}px ${color}) drop-shadow(0 0 ${S}px ${color})`;
    ctx.drawImage(L.c, 0, 0);
    ctx.restore();
  }

  function draw(ctx, S, info) {
    const sc = score();
    // day and night swap every 500 points, starting from the real time of day
    const realHour = new Date().getHours() + new Date().getMinutes() / 60;
    const realNight = realHour < 7 || realHour >= 20;
    const night = Math.floor(sc / 500) % 2 ? !realNight : realNight;
    const hour = night ? 23 : 12;
    const t = performance.now() / 1000;

    Scene.drawRunBackdrop(bg, W, H, STREET, t, hour, st.scroll);
    ctx.imageSmoothingEnabled = false;
    // the city is the backdrop: a bit washed out, so whatever is in your way stands out
    ctx.save();
    ctx.filter = `saturate(${1 - 0.45 * st.dim})`;
    ctx.drawImage(back, 0, 0, W * S, H * S);
    ctx.restore();
    // the office itself while it's still on screen (the intro starts at its door)
    if (st.scroll < W && info.drawOffice) info.drawOffice(st.scroll);
    const { R, T, spr } = pen(ctx, S);
    if (st.dim > 0) R(0, 0, W, H, `rgba(10,8,30,${0.38 * st.dim})`);
    const TC = (text, y, c, s = 1) => T(text, (W - FONT.width(text) * s) / 2, y, c, s);

    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    glowLayer(ctx, obsL, S, '#ff2840', (p) => { for (const o of st.obs) drawObstacle(o, p); });
    glowLayer(ctx, itemL, S, `rgba(255,${200 + Math.round(40 * pulse)},60,1)`, (p) => { for (const it of st.items) drawItem(it, p); });

    // runner (shadow, then Claude)
    const sh = Math.max(4, 10 - st.y / 6);
    R(st.sx - sh / 2, GROUND - 1, sh, 2, 'rgba(0,0,0,0.35)');
    const moving = (st.mode === 'run' || st.mode === 'intro') && st.y === 0;
    const fr = moving ? Math.floor((st.scroll + st.sx) / 6) % 4 : st.mode === 'over' ? 0 : 1;
    const img = Sprites.person(LOOKS.claude, st.mode === 'over' ? 'stand' : 'walk', fr, 1, { expr: st.mode === 'over' ? 'scared' : undefined });
    const top = GROUND - st.y - 24;
    if (flying()) drawRocket(R, st.sx - 9, top + 6, t);
    ctx.save();
    ctx.filter = `drop-shadow(0 0 ${Math.max(1, S / 2)}px rgba(255,255,255,${0.9 * st.dim}))`;
    if (st.duck && st.y === 0 && st.mode === 'run') spr(img, st.sx - 9, GROUND - 14, 18, 14);
    else spr(img, st.sx - 8, top, 16, 24);
    ctx.restore();
    if (st.ammo && st.mode !== 'over') {
      const gy = st.duck && st.y === 0 ? GROUND - 8 : top + 13;
      R(st.sx + 1, gy, 4, 2, '#8a5a30'); R(st.sx + 5, gy, 8, 1, '#3a3a44'); R(st.sx + 5, gy + 1, 6, 1, '#5a5a66');
      if (st.t - st.blast < 0.12) {
        R(st.sx + 13, gy - 2, 4, 5, '#f8d838'); R(st.sx + 17, gy - 1, 5, 3, '#f89838'); R(st.sx + 22, gy, 4, 1, '#f8f8f8');
      }
    }
    for (const b of st.bits) R(b.x, b.y, 2, 2, b.c);

    for (const p of st.pops) {
      ctx.globalAlpha = 1 - p.t;
      T(p.text, p.x - FONT.width(p.text) / 2, p.y - p.t * 10, '#f8d838');
      ctx.globalAlpha = 1;
    }

    // zoom in: copy the frame and blow up its lower-left part (nearest neighbour, stays crisp)
    const z = 1 + (ZOOM - 1) * st.dim;
    if (z > 1.001) {
      const cw = ctx.canvas.width, ch = ctx.canvas.height;
      if (snap.c.width !== cw || snap.c.height !== ch) { snap.c.width = cw; snap.c.height = ch; }
      snap.g.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(snap.c, 0, ch - ch / z, cw / z, ch / z, 0, 0, cw, ch);
      ctx.restore();
    }

    // HUD: score + best, coffee, and what Claude is doing right now
    R(0, 0, W, 22, 'rgba(0,0,0,0.8)');
    R(0, 22, W, 1, '#2a2a38');
    const flashOn = st.flash > 0 && Math.floor(st.flash * 10) % 2;
    T(`СЧЁТ ${String(sc).padStart(5, '0')}`, 3, 2, flashOn ? '#f8f8f8' : '#f8d838');
    T(`РЕКОРД ${String(best).padStart(5, '0')}`, 81, 2, '#b898f8');
    T(`КОФЕ ${st.coffee}`, 173, 2, '#f89858');
    if (st.ammo) T(`ДРОБЬ ${st.ammo}`, 207, 12, '#f8d838');
    if (flying()) TC(`РАКЕТА ${Math.ceil(st.rocketUntil - st.t)}`, 28, '#58e8e8');
    const status = info.busy ? `CLAUDE ▸ ${info.activity}` : st.answered ? 'CLAUDE ▸ ОТВЕТ ГОТОВ!' : 'CLAUDE ▸ ОТДЫХАЕТ';
    T(status.length > 34 ? status.slice(0, 33) + '…' : status, 3, 12, st.answered && !info.busy ? '#58f888' : '#8a8a9a');
    if (!st.ammo) T('ESC', W - 21, 12, '#5a5a6a');
    if (st.t < st.slowUntil && st.mode === 'run') TC('ЗАМЕДЛЕНИЕ', 28, '#b898f8');

    if (st.mode === 'intro' && st.t > 0.6) TC('ПРОБЕЛ - ПРЫЖОК, ВНИЗ - ПРИГНУТЬСЯ', 28, '#f8f8f8');
    else if (st.mode === 'over') panel(R, TC, [st.newBest ? 'НОВЫЙ РЕКОРД!' : 'GAME OVER', `СЧЁТ ${sc}`, 'ПРОБЕЛ - ЕЩЁ РАЗ', 'ESC - В ОФИС']);
    else if (st.mode.startsWith('answer')) {
      panel(R, TC, ['ОТВЕТ ГОТОВ!', 'ENTER - В ОФИС', 'ДРУГАЯ КЛАВИША - ИГРАТЬ'], '#58f888');
    } else if (st.mode === 'count') TC(st.count > 0.75 ? 'ГОТОВЬСЯ...' : 'ПОЕХАЛИ!', 110, '#f8f8f8', 2);
    else if (st.answered && Math.floor(st.t * 2) % 2) TC('ОТВЕТ ЖДЁТ ▸ ENTER', 28, '#58f888');
  }

  function panel(R, TC, lines, head = '#f8d838') {
    const h = 14 + lines.length * 12 + 6;
    const y = 90;
    R(28, y, W - 56, h, '#140c1c');
    R(29, y + 1, W - 58, h - 2, '#2a2440');
    R(30, y + 2, W - 60, h - 4, '#140c1c');
    TC(lines[0], y + 7, head, 2);
    lines.slice(1).forEach((l, i) => TC(l, y + 26 + i * 12, '#f8f8f8'));
  }

  function drawObstacle(o, { R, T, spr }) {
    const x = Math.round(o.x), base = GROUND - o.fly;
    if (o.id === 'bug' || o.id === 'bugs') {
      const n = o.id === 'bugs' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const bx = x + i * 12, leg = Math.floor(st.t * 8 + i) % 2;
        R(bx + 1, base - 6, 7, 5, '#e83860'); R(bx + 2, base - 7, 5, 1, '#e83860');
        R(bx + 4, base - 6, 1, 5, '#801830');
        R(bx + 2, base - 5, 1, 1, '#140c1c'); R(bx + 6, base - 4, 1, 1, '#140c1c');
        R(bx - 1, base - 6, 2, 2, '#140c1c'); R(bx - 1, base - 6, 1, 1, '#f8f8f8');
        R(bx + 1 + leg, base - 1, 1, 1, '#140c1c'); R(bx + 4 - leg, base - 1, 1, 1, '#140c1c'); R(bx + 7 + leg, base - 1, 1, 1, '#140c1c');
        R(bx - 2, base - 8, 1, 2, '#140c1c');
      }
    } else if (o.id === 'cat') {
      spr(Sprites.cat('sit', 0, -1), x - 2, base - 10, 16, 10);
    } else if (o.id === 'error') {
      R(x + 4, base - 6, 2, 6, '#8a8a9a');
      R(x, base - 14, 10, 9, '#140c1c'); R(x + 1, base - 13, 8, 7, '#ff3838');
      R(x + 4, base - 12, 2, 3, '#f8f8f8'); R(x + 4, base - 8, 2, 1, '#f8f8f8');
    } else if (o.id === 'server') {
      R(x, base - 20, 10, 20, '#140c1c'); R(x + 1, base - 19, 8, 18, '#7a8090');
      for (let yy = base - 17; yy < base - 2; yy += 4) {
        R(x + 2, yy, 6, 2, '#3a4050');
        R(x + 7, yy, 1, 1, Math.floor(st.t * 6 + yy) % 3 ? '#58f888' : '#ff3838');
      }
    } else if (o.id === 'clock') {
      const wing = Math.floor(st.t * 10) % 2;
      R(x + 1, base - 10, 9, 9, '#140c1c'); R(x, base - 9, 11, 7, '#140c1c');
      R(x + 2, base - 9, 7, 7, '#f8f8f8'); R(x + 1, base - 8, 9, 5, '#f8f8f8');
      R(x + 5, base - 8, 1, 3, '#e83838'); R(x + 5, base - 5, 3, 1, '#140c1c');
      R(x - 3, base - 8 - wing * 2, 3, 2, '#f8f8f8'); R(x + 11, base - 8 - wing * 2, 3, 2, '#f8f8f8');
      T('!', x + 12, base - 18, '#ff3838');
    }
  }

  // jetpack-style rocket on Claude's back, with a flickering flame
  function drawRocket(R, x, y, t) {
    R(x, y, 4, 11, '#140c1c'); R(x + 1, y + 1, 2, 9, '#f0f0f0'); R(x + 1, y - 1, 2, 2, '#e83838');
    R(x - 1, y + 7, 1, 4, '#e83838'); R(x + 4, y + 7, 1, 4, '#e83838');
    const f = Math.floor(t * 20) % 2;
    R(x, y + 11, 4, 3 + f, '#f8d838'); R(x + 1, y + 13 + f, 2, 3, '#f89838'); R(x + 1, y + 16 + f, 1, 2, '#e83838');
  }

  function drawItem(it, { R, T }) {
    const x = Math.round(it.x) - 3, y = GROUND - it.up - 7 + Math.round(Math.sin(st.t * 5 + it.x * 0.1));
    if (it.id === 'gun') {
      R(x - 2, y + 3, 4, 3, '#8a5a30'); R(x + 2, y + 3, 9, 2, '#3a3a44'); R(x + 2, y + 5, 7, 1, '#5a5a66');
      R(x + 3, y + 6, 1, 2, '#3a3a44');
    } else if (it.id === 'rocket') {
      R(x + 1, y + 1, 4, 7, '#f0f0f0'); R(x + 2, y - 1, 2, 2, '#e83838'); R(x, y + 6, 1, 3, '#e83838'); R(x + 5, y + 6, 1, 3, '#e83838');
      R(x + 2, y + 3, 2, 2, '#58a8f8');
      if (Math.floor(st.t * 12) % 2) R(x + 2, y + 9, 2, 2, '#f89838');
    } else if (it.id === 'coffee') {
      R(x, y + 2, 6, 5, '#f8f8f8'); R(x + 1, y + 3, 4, 3, '#e8e8f0'); R(x + 6, y + 3, 2, 2, '#f8f8f8');
      R(x + 1, y + 2, 4, 1, '#6a3a1a');
      if (Math.floor(st.t * 4) % 2) R(x + 2, y, 1, 1, '#f8f8f8'); else R(x + 3, y - 1, 1, 1, '#f8f8f8');
    } else {
      R(x - 1, y, 9, 8, '#140c1c'); R(x, y + 1, 7, 6, '#9878f8');
      T('Q', x + 1, y + 1 - 0.5, '#f8f8f8');
    }
  }

  return {
    get on() { return st.on; },
    get intro() { return st.on && st.mode === 'intro'; },
    start, stop, answer, key, keyUp, update, draw,
    give(id) { if (id === 'gun') st.ammo = SHELLS; else if (id === 'rocket') st.rocketUntil = st.t + ROCKET; },
    state: () => ({ on: st.on, mode: st.mode, score: score(), best, coffee: st.coffee, ammo: st.ammo, kills: st.kills, flying: flying(), speed: Math.round(st.speed), y: Math.round(st.y), sx: Math.round(st.sx), scroll: Math.round(st.scroll), obs: st.obs.map((o) => `${o.id}@${Math.round(o.x)}`), answered: st.answered }),
  };
})();
