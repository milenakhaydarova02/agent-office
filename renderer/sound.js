// Soft synth on WebAudio: bell/pluck tones, filtered noise, a small room reverb and a gentle compressor.
// (Previous NES-style version is in agent-office/backup/sound.before-upgrade.js.)
const Sound = (() => {
  let ctx = null;
  let master = null;
  let comp = null;
  let conv = null;
  let noiseBuf = null;
  let pinkBuf = null;
  let muted = false;
  let suspended = false; // silenced by screensaver mode without touching the user's choice
  let game = false;      // runner mini-game on: the office goes quiet, only these play
  const GAME = new Set(['jump', 'coin', 'crash', 'jingle', 'ring']);
  let amb = null;        // ambience bus (hum, fans, rain)
  try { muted = localStorage.getItem('office.muted') === '1'; } catch {}
  const lastAt = {};
  const level = () => (muted || suspended ? 0 : 0.4);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new AudioContext();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      const soft = ctx.createBiquadFilter(); // takes the edge off
      soft.type = 'lowpass'; soft.frequency.value = 9500;
      comp.connect(soft).connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = level();
      master.connect(comp);
      amb = ctx.createGain();
      amb.connect(master);
      // small room: decaying stereo noise impulse
      const len = Math.floor(ctx.sampleRate * 1.1);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      conv = ctx.createConvolver();
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      conv.connect(comp);
      master.connect(wet).connect(conv);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
  }

  function ready(name, gapMs) {
    if (!ctx || muted || suspended || (game && !GAME.has(name))) return false;
    const now = performance.now();
    if (gapMs && lastAt[name] && now - lastAt[name] < gapMs) return false;
    lastAt[name] = now;
    return true;
  }

  // One note: short attack (no clicks), exponential decay.
  function tone(freq, dur, type = 'sine', vol = 0.1, slideTo = null, delay = 0, out = master) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Bell: fundamental plus two inharmonic partials, long soft decay.
  function bell(freq, dur, vol, delay = 0, out = master) {
    tone(freq, dur, 'sine', vol, null, delay, out);
    tone(freq * 2.76, dur * 0.6, 'sine', vol * 0.3, null, delay, out);
    tone(freq * 5.4, dur * 0.3, 'sine', vol * 0.12, null, delay, out);
  }

  function noise(dur, vol, freq = 2000, delay = 0, type = 'bandpass', q = 0.8) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // Soft thump: sine with a quick pitch drop.
  function thud(f0, f1, dur, vol, delay = 0) { tone(f0, dur, 'sine', vol, f1, delay); }

  // Animal-ish voice: sawtooth through a sweeping formant filter, with vibrato.
  function voice(f0, f1, dur, form0, form1, vol) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = f0 * 0.025;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3.5;
    f.frequency.setValueAtTime(form0, t);
    f.frequency.linearRampToValueAtTime(form1, t + dur * 0.45);
    f.frequency.linearRampToValueAtTime(form0 * 0.9, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // Looping ambience layers (hum + hiss + rain), faded in and out by name.
  const layers = {};
  function layer(name, make) {
    if (!ctx) return null;
    if (!layers[name]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(amb);
      layers[name] = { g, ...make(g) };
    }
    return layers[name];
  }
  function setLayer(name, make, vol) {
    const l = layer(name, make);
    if (l) l.g.gain.setTargetAtTime(muted || suspended ? 0 : vol, ctx.currentTime, 0.4);
  }
  const hum = (freq, type = 'sawtooth', cutoff = 220) => (out) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff;
    o.connect(f).connect(out); o.start();
    return { o };
  };
  let dropTimer = null;
  // Looping pink noise (softer than white), through a band/high-pass filter.
  const pinkLoop = (freq, q, type = 'bandpass') => (out) => {
    if (!pinkBuf) {
      pinkBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = pinkBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
      }
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    s.buffer = pinkBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(out); s.start(Math.random() * 0.01);
    return { s };
  };

  return {
    init,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('office.muted', m ? '1' : '0'); } catch {}
      if (master) master.gain.value = level();
    },
    setGame(on) {
      game = on;
      if (amb) amb.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.15);
    },
    setSuspended(s) {
      suspended = s;
      if (master) master.gain.value = level();
    },
    // Ambience for the room the camera is looking at (null = none) and for rain.
    focus(room, qwenBusy) {
      if (!ctx) return;
      setLayer('serverHum', hum(58, 'sawtooth', 160), room === 'server' ? 0.04 : 0);
      setLayer('serverFan', pinkLoop(1100, 0.5), room === 'server' ? 0.07 : 0);
      setLayer('kettle', pinkLoop(3800, 1.2), room === 'kitchen' ? 0.05 : 0);
      setLayer('qwenFan', hum(96, 'triangle', 300), room === 'qwen' && qwenBusy ? 0.03 : 0);
    },
    // Rain: soft pink-noise bed + faint high patter + random drops.
    rain(on) {
      if (!ctx) return;
      setLayer('rainBed', pinkLoop(700, 0.35), on ? 0.112 : 0);
      setLayer('rainHigh', pinkLoop(4200, 0.5, 'highpass'), on ? 0.0084 : 0);
      if (on && !dropTimer) {
        dropTimer = setInterval(() => {
          if (!ctx || muted || suspended || game) return;
          for (let i = 0; i < 3; i++) if (Math.random() < 0.35) {
            const d = Math.random() * 0.04;
            tone(rnd(1800, 4400), rnd(0.012, 0.032), 'sine', rnd(0.0084, 0.021), rnd(900, 1500), d);
            if (Math.random() < 0.3) noise(0.03, 0.014, rnd(3000, 5000), d);
          }
        }, 45);
      } else if (!on && dropTimer) { clearInterval(dropTimer); dropTimer = null; }
    },

    // footsteps: dull sole thump + a little scuff
    step(alt) {
      if (!ready('step', 60)) return;
      thud(alt ? 135 : 110, 55, 0.07, 0.1);
      noise(0.05, 0.05, alt ? 1100 : 900, 0, 'lowpass', 0.5);
    },
    // ladder rung: quiet, dull tap (no ringing)
    climb() {
      if (!ready('climb', 150)) return;
      thud(rnd(230, 290), 140, 0.05, 0.05);
      noise(0.03, 0.025, 1100, 0, 'lowpass', 0.5);
    },
    // keyboard: click + low "bottom out" thock
    key(vol = 0.03) {
      if (!ready('key', 45)) return;
      noise(0.012, vol * 3, rnd(2200, 3200), 0, 'bandpass', 1.5);
      thud(rnd(170, 230), 110, 0.03, vol * 2.2);
    },
    blip() { if (ready('blip', 55)) { tone(880, 0.06, 'triangle', 0.04); tone(1320, 0.05, 'sine', 0.015); } },
    pop() { if (ready('pop', 100)) { tone(380, 0.09, 'sine', 0.07, 860); noise(0.02, 0.03, 2500, 0, 'highpass'); } },
    // phone: two double-rings
    ring() {
      if (!ready('ring', 1500)) return;
      [0, 0.6].forEach((t0) => {
        for (let i = 0; i < 8; i++) {
          tone(1420, 0.04, 'square', 0.022, null, t0 + i * 0.05);
          tone(1740, 0.04, 'square', 0.016, null, t0 + i * 0.05);
        }
      });
    },
    // door: wooden creak, then a soft thump
    door() {
      if (!ready('door', 300)) return;
      noise(0.28, 0.07, 380, 0, 'bandpass', 4);
      tone(95, 0.3, 'sawtooth', 0.02, 150);
      thud(90, 45, 0.18, 0.2, 0.26);
    },
    // "task done": three-note bell arpeggio + a long chord
    jingle() {
      if (!ready('jingle', 1000)) return;
      [523, 659, 784, 1047].forEach((f, i) => bell(f, 0.9, 0.07, i * 0.1));
      [523, 784].forEach((f) => tone(f, 1.4, 'triangle', 0.025, null, 0.4));
    },
    bubble() { if (ready('bubble', 120)) tone(rnd(900, 1500), 0.05, 'sine', 0.02, 600); },
    meow() {
      if (!ready('meow', 4000)) return;
      voice(560, 380, 0.5, 900, 1900, 0.09);
    },
    // car passing: low engine and tyre noise swelling then fading
    car() {
      if (!ready('car', 5000)) return;
      const t = ctx.currentTime, dur = 3.4;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true;
      f.type = 'lowpass'; f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(600, t + dur * 0.5); f.frequency.linearRampToValueAtTime(200, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t); s.stop(t + dur + 0.1);
      tone(72, dur, 'sawtooth', 0.012, 58);
    },
    pong(alt) { if (ready('pong', 150)) { tone(alt ? 1500 : 1200, 0.03, 'sine', 0.06, 900); noise(0.012, 0.04, 3000, 0, 'highpass'); } },
    dart() { if (ready('dart', 600)) { noise(0.04, 0.05, 1800, 0, 'bandpass', 1); thud(210, 90, 0.07, 0.1, 0.04); } },
    // plane: distant jet, slow swell
    plane() {
      if (!ready('plane', 8000)) return;
      const t = ctx.currentTime, dur = 6;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true;
      f.type = 'bandpass'; f.Q.value = 0.6; f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(700, t + dur * 0.5); f.frequency.linearRampToValueAtTime(320, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t); s.stop(t + dur + 0.1);
    },
    // power flicker: crackle and a falling hum
    zap() {
      if (!ready('zap', 3000)) return;
      for (let i = 0; i < 5; i++) noise(0.04, 0.07, rnd(3500, 6000), i * 0.07 + rnd(0, 0.03), 'highpass');
      tone(120, 0.5, 'sawtooth', 0.03, 45);
    },
    // "Qwen finished" notification, ~2.6 s. Plays even when muted or in screensaver mode:
    // it's a signal the user asked for, not office ambience.
    done() {
      init();
      if (!ctx) return;
      const now = performance.now();
      if (lastAt.done && now - lastAt.done < 8000) return;
      lastAt.done = now;
      const out = ctx.createGain();
      out.gain.value = 0.4;
      out.connect(ctx.destination);
      out.connect(conv);
      [523, 659, 784, 1047].forEach((f, i) => {
        bell(f, 1.0, 0.1, i * 0.13, out);
        tone(f / 2, 0.25, 'triangle', 0.1, null, i * 0.13, out);
      });
      [1047, 1319, 1568].forEach((f) => bell(f, 2.0, 0.07, 0.62, out));
      [523, 784].forEach((f) => tone(f, 2.2, 'sine', 0.09, null, 0.62, out));
    },
    err() { if (ready('err', 800)) { tone(240, 0.16, 'triangle', 0.09, 170); tone(180, 0.26, 'triangle', 0.09, 120, 0.15); } },
    bubbling() { if (ready('bubbling', 140)) tone(rnd(200, 420), 0.08, 'sine', 0.05, rnd(600, 900)); },
    // runner mini-game
    jump() { if (ready('jump', 80)) tone(330, 0.14, 'square', 0.035, 760); },
    coin() { if (ready('coin', 60)) { tone(988, 0.06, 'square', 0.03); tone(1319, 0.14, 'square', 0.03, null, 0.06); } },
    crash() { if (ready('crash', 400)) { noise(0.25, 0.1, 700, 0, 'lowpass', 0.7); tone(220, 0.35, 'square', 0.04, 70); } },
    cheer() { if (ready('cheer', 800)) [784, 988, 1319, 1568].forEach((f, i) => bell(f, 0.5, 0.05, i * 0.07)); },
  };
})();
