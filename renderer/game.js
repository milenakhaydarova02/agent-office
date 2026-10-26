// Agent Office: simulation, event handling and rendering.
(() => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const world = document.createElement('canvas');
  world.width = W;
  world.height = H;
  const wctx = world.getContext('2d');
  const api = window.officeAPI || null;
  if (!api) document.body.classList.add('browser');

  const WALK = 42;   // logical px per second
  const CLIMB = 30;
  const MIN_DWELL = 0.9;

  let S = 2;
  try { S = Number(localStorage.getItem('office.scale')) || 2; } catch {}
  let now = 0;

  // ---------------------------------------------------------------- spots
  const SPOT = {
    claudeDesk: { f: 2, x: 66, pose: 'type', face: -1 },
    claudeThink: { f: 2, x: 66, pose: 'think', face: -1 },
    claudeSit: { f: 2, x: 66, pose: 'sit', face: -1 },
    web: { f: 2, x: 88, pose: 'look', face: 1 },
    report: { f: 2, x: 82, pose: 'talk', face: -1 },
    qwenVisit: { f: 2, x: 177, pose: 'talk', face: 1 },
    qwenType: { f: 2, x: 196, pose: 'type', face: 1 },
    qwenSit: { f: 2, x: 196, pose: 'sit', face: 1 },
    qwenListen: { f: 2, x: 196, pose: 'sit', face: -1 },
    qwenSleep: { f: 2, x: 196, pose: 'sleep', face: 1 },
    qwenGpu: { f: 2, x: 234, pose: 'term', face: 1 },
    archive: { f: 1, x: 41, pose: 'read', face: -1 },
    server: { f: 1, x: 187, pose: 'term', face: -1 },
    coffee: { f: 1, x: 217, pose: 'drink', face: -1 },
    door: { f: 1, x: 241, pose: 'stand', face: 1 },
  };
  const BENCHES = [
    { f: 1, x: 56, face: 1 }, { f: 1, x: 80, face: 1 }, { f: 1, x: 100, face: -1 },
    { f: 1, x: 160, face: 1 }, { f: 2, x: 160, face: -1 }, { f: 2, x: 28, face: 1 }, { f: 1, x: 120, face: 1 },
  ];
  const CREW = ['rick', 'nina', 'bo', 'fil', 'ava', 'tim'];

  // ---------------------------------------------------------------- scheduler
  let timers = [];
  function later(sec, fn) { timers.push({ at: now + sec, fn }); }
  function runTimers() {
    const due = timers.filter((t) => t.at <= now);
    if (!due.length) return;
    timers = timers.filter((t) => t.at > now);
    for (const t of due) t.fn();
  }

  // ---------------------------------------------------------------- agents
  function plan(f, x, spot) {
    if (spot.f === f) return [{ type: 'walk', x: spot.x }];
    return [{ type: 'walk', x: LADDER_X }, { type: 'climb', to: spot.f }, { type: 'walk', x: spot.x }];
  }

  class Agent {
    constructor(o) {
      Object.assign(this, {
        f: 1, x: 0, face: 1, path: [], pose: 'stand', goalPose: 'stand', goalFace: null,
        dist: 0, walkFrame: 0, climbDist: 0, climbFrame: 0, anim: Math.random() * 10,
        alpha: 1, fadeTo: 1, bubble: null, onArrive: null, arrived: true, arrivedAt: 0,
        goalSpot: null, pendingSpot: null, speed: 1, quiet: false, expr: null, exprUntil: 0, override: null,
      }, o);
      this.y = FLOOR[this.f];
    }
    go(spot, onArrive) {
      this.goalSpot = spot;
      this.onArrive = onArrive || null;
      this.goalPose = spot.pose || 'stand';
      this.goalFace = spot.face ?? null;
      this.arrived = false;
      if (this.path[0] && this.path[0].type === 'climb') { this.pendingSpot = spot; return; }
      this.path = plan(this.f, this.x, spot);
    }
    at(spot) { return this.goalSpot === spot && this.arrived; }
    say(text, dur = 3.5, kind = 'say') {
      this.bubble = { text, start: now, until: now + dur, kind, shown: 0 };
      if (!this.quiet) Sound.bubble();
    }
    update(dt) {
      this.anim += dt;
      if (this.alpha !== this.fadeTo) {
        const d = dt * 2.5;
        this.alpha = this.alpha < this.fadeTo ? Math.min(this.fadeTo, this.alpha + d) : Math.max(this.fadeTo, this.alpha - d);
      }
      const seg = this.path[0];
      if (!seg) {
        if (!this.arrived) this.arrive();
        this.pose = this.goalPose;
        return;
      }
      if (seg.type === 'walk') {
        this.y = FLOOR[this.f];
        const dx = seg.x - this.x;
        const step = WALK * this.speed * dt;
        if (Math.abs(dx) <= step) { this.x = seg.x; this.path.shift(); }
        else {
          this.x += Math.sign(dx) * step;
          this.face = Math.sign(dx);
          this.dist += step;
        }
        this.pose = 'walk';
        const fr = Math.floor(this.dist / 5) % 4;
        if (fr !== this.walkFrame) {
          this.walkFrame = fr;
          if ((fr === 0 || fr === 2) && !this.quiet) Sound.step(fr === 2);
        }
      } else {
        this.x = LADDER_X;
        const ty = FLOOR[seg.to];
        const dy = ty - this.y;
        const step = CLIMB * this.speed * dt;
        this.pose = 'climb';
        if (Math.abs(dy) <= step) {
          this.y = ty;
          this.f = seg.to;
          this.path.shift();
          if (this.pendingSpot) { const s = this.pendingSpot; this.pendingSpot = null; this.path = plan(this.f, this.x, s); }
        } else {
          this.y += Math.sign(dy) * step;
          this.climbDist += step;
          const fr = Math.floor(this.climbDist / 6) % 2;
          if (fr !== this.climbFrame) { this.climbFrame = fr; if (!this.quiet) Sound.climb(); }
        }
      }
      if (!this.path.length) this.arrive();
    }
    shown() {
      const o = this.override;
      if (o && now < o.until && this.arrived && !this.path.length && !['sit', 'type', 'think', 'sleep', 'term', 'read'].includes(this.pose)) return o.pose;
      return this.pose;
    }
    feel(expr, sec) { this.expr = expr; this.exprUntil = now + sec; }
    arrive() {
      this.arrived = true;
      this.arrivedAt = now;
      if (this.goalPose === 'sleep' && !this.isCat) this.feel('yawn', 2.6);
      if (this.goalFace != null) this.face = this.goalFace;
      this.pose = this.goalPose;
      const cb = this.onArrive;
      this.onArrive = null;
      if (cb) cb(this);
    }
    frame() {
      const a = this.anim;
      switch (this.shown()) {
        case 'walk': return this.walkFrame;
        case 'climb': return this.climbFrame;
        case 'type': return Math.floor(a * (this.fastType ? 10 : 7)) % 2;
        case 'term': return Math.floor(a * 6) % 2;
        case 'mix': return Math.floor(a * 2) % 2;
        case 'read': return Math.floor(a * 1.4) % 6;
        case 'drink': return Math.floor(a / 1.6) % 2;
        case 'talk': return Math.floor(a * 3) % 2;
        case 'wave': return Math.floor(a * 5) % 2;
        case 'swing': return Math.floor(a * 1.6) % 2;
        case 'throw': return Math.floor(a * 0.8) % 2;
        case 'smoke': return Math.floor(a / 2.2) % 2;
        case 'stretch': return Math.floor(a * 1.2) % 2;
        case 'sleep': return 0;
        default: return a % 3.7 < 0.13 ? 7 : 0;
      }
    }
  }

  const claude = new Agent({ id: 'claude', look: LOOKS.claude, f: 2, x: 66, face: -1, goalPose: 'sit' });
  const qwen = new Agent({ id: 'qwen', look: LOOKS.qwen, f: 2, x: 196, face: 1, goalPose: 'sleep' });
  qwen.goalSpot = SPOT.qwenSleep;
  claude.goalSpot = SPOT.claudeSit;
  const cat = new Agent({ id: 'cat', f: 1, x: 70, speed: 0.75, quiet: true, goalPose: 'sit', catPose: 'sit' });
  cat.isCat = true;
  let subs = [];
  let npcs = [];
  let particles = [];
  const history = [];
  const scene = { doorUntil: 0, phoneUntil: 0, carX: null, carColor: '#c83838', nextCar: 8, flickerUntil: 0, plane: null };

  // Short event history (window.__office.state().log) - nothing is drawn from it.
  function log(text) {
    history.push(FONT.norm(text));
    if (history.length > 8) history.shift();
  }

  // ---------------------------------------------------------------- Claude
  const C = { tools: 0, lastDetail: '', busy: false, lastEvent: -100, idleNext: 0, activity: 'ОТДЫХАЕТ', convo: null, queued: null, session: null };

  function claudeGo(spot, text, activity) {
    C.activity = activity || C.activity;
    if (text) claude.say(text, 3.2);
    if (C.convo) return;
    if (claude.goalSpot === spot) return;
    C.queued = spot;
  }

  function applyQueued() {
    if (!C.queued || C.convo || C.out) return;
    const settled = claude.arrived && now - claude.arrivedAt >= MIN_DWELL;
    if (!claude.arrived || settled) { claude.go(C.queued); C.queued = null; }
  }

  function toolCategory(tool) {
    if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return 'read';
    if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit';
    if (/^(Bash|PowerShell|Monitor|BashOutput|KillShell|TaskStop)$/.test(tool)) return 'shell';
    if (/^(WebFetch|WebSearch)$/.test(tool) || /browser|chrome/i.test(tool)) return 'web';
    if (/^(TodoWrite|ToolSearch|Skill|AskUserQuestion)$/.test(tool) || /^mcp__ccd_/.test(tool)) return 'meta';
    return 'other';
  }

  // Letters, digits and spaces only: no paths, flags or code in bubbles.
  function plain(s, n = 40) {
    const t = String(s || '').replace(/[^0-9A-Za-zА-Яа-яЁё ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') : t;
  }

  const act = (() => { try { return JSON.parse(localStorage.getItem('office.act') || '{}'); } catch { return {}; } })();
  const actKey = () => Math.floor(Date.now() / 300000);
  function bumpAct() {
    const k = actKey();
    act[k] = (act[k] || 0) + 1;
    for (const key of Object.keys(act)) if (Number(key) < k - 23) delete act[key];
    try { localStorage.setItem('office.act', JSON.stringify(act)); } catch {}
  }

  function onClaudeTool(ev) {
    const d = plain(ev.detail);
    C.tools++;
    C.lastDetail = d;
    bumpAct();
    switch (toolCategory(ev.tool || '')) {
      case 'read': claudeGo(SPOT.archive, d || 'читаю файлы', 'ЧИТАЕТ'); break;
      case 'edit': claudeGo(SPOT.claudeDesk, d || 'пишу код', 'ПИШЕТ КОД'); break;
      case 'shell': claudeGo(SPOT.server, d || 'копаюсь в компе', 'В СЕРВЕРНОЙ'); break;
      case 'web': claudeGo(SPOT.web, d || 'ищу в интернете', 'В ИНТЕРНЕТЕ'); break;
      case 'meta':
        C.activity = 'ПЛАНИРУЕТ';
        if (d) claude.say(d, 2.5);
        if (claude.goalSpot === SPOT.claudeSit) claudeGo(SPOT.claudeThink, null, 'ПЛАНИРУЕТ');
        break;
      default: claudeGo(SPOT.claudeDesk, d || 'работаю', 'РАБОТАЕТ');
    }
    log(`CLAUDE: ${d || C.activity}`);
  }

  // ---------------------------------------------------------------- sub-agents
  function freeBench() {
    const taken = (b) => subs.some((s) => s.bench === b) || helpers.some((h) => h.bench === b);
    return BENCHES.find((b) => !taken(b)) || BENCHES[subs.length % BENCHES.length];
  }

  function pickLook() {
    for (const key of CREW) {
      if (!subs.some((s) => s.lookKey === key)) return { key, look: LOOKS[key] };
    }
    let i = 0;
    while (subs.some((s) => s.lookKey === `x${i}`)) i++;
    return { key: `x${i}`, look: makeExtraLook(i) };
  }

  function hire(ev, boss = claude) {
    if (ev.id && subs.some((s) => s.id === ev.id)) return;
    let { key, look } = pickLook();
    const pro = (PRO_OF.find(([re]) => re.test(ev.kind || '')) || [])[1];
    if (pro && !subs.some((x) => x.lookKey === `pro_${pro}`)) { key = `pro_${pro}`; look = PRO[pro]; }
    const bench = freeBench();
    const spot = { f: bench.f, x: bench.x, pose: key === 'rick' ? 'mix' : 'term', face: bench.face };
    const a = new Agent({ id: ev.id || `sub${Date.now()}`, look, lookKey: key, f: 1, x: SPOT.door.x, alpha: 0, fadeTo: 1, bench, spot, speed: 1.1 });
    a.label = plain(ev.label, 30);
    subs.push(a);
    openDoor();
    a.say('ПРИВЕТ!', 1.4);
    a.go(spot, () => a.say(a.label || 'ЗА РАБОТУ!', 3.5));
    boss.say(`${look.name}, ПОМОГИ!`, 2.4);
    log(`${look.name} ПРИШЁЛ: ${a.label}`);
  }

  function findSub(ev) {
    if (ev.id) { const s = subs.find((x) => x.id === ev.id); if (s) return s; }
    if (ev.sub) {
      let s = subs.find((x) => x.agentId === ev.sub);
      if (!s) { s = subs.find((x) => !x.agentId && !x.leaving); if (s) s.agentId = ev.sub; }
      return s;
    }
    return null;
  }

  function subTool(ev) {
    const s = findSub(ev);
    if (!s || s.leaving) return;
    s.say(plain(ev.detail) || 'работаю', 2.6);
    if (s.lookKey !== 'rick' && s.arrived) {
      s.goalPose = toolCategory(ev.tool || '') === 'read' ? 'read' : 'term';
    }
  }

  function subDone(ev) {
    const s = findSub(ev);
    if (!s || s.leaving) return;
    s.leaving = true;
    s.say('ГОТОВО!', 1.6);
    Sound.pop();
    log(`${s.look.name}: ГОТОВО`);
    later(1.2, () => {
      const offset = subs.filter((x) => x.leaving && x !== s && x.reporting).length * 10;
      s.reporting = true;
      s.go({ ...SPOT.report, x: SPOT.report.x + offset }, () => {
        s.say('ОТЧЁТ ГОТОВ!', 2.2);
        later(1.4, () => { if (!C.convo) claude.say(`СПАСИБО, ${s.look.name}!`, 2); });
        later(2.6, () => s.go(SPOT.door, () => {
          openDoor();
          s.fadeTo = 0;
          later(0.6, () => { subs = subs.filter((x) => x !== s); });
        }));
      });
    });
  }

  function openDoor() {
    scene.doorUntil = now + 1.6;
    Sound.door();
  }

  // ---------------------------------------------------------------- runner mini-game
  // Space: Claude hurries to the door, steps out, and the game starts on the street.
  // Back from the game: he comes in through the same door and goes to his desk.
  const RUN_OUT = ['Я НА ПРОБЕЖКУ!', 'ПОБЕГАЮ, ПОКА ЖДЁМ', 'СЕЙЧАС ВЕРНУСЬ!', 'РАЗОМНУСЬ НА УЛИЦЕ', 'КТО СО МНОЙ?'];
  function runOut() {
    if (C.out || Runner.on) return;
    C.out = true;
    if (C.convo) { Runner.start(); return; }
    stopFun(claude);
    C.queued = null;
    claude.speed = 2.6;
    claude.say(pick(RUN_OUT), 2);
    cam.cool = 0;
    shot(claude, 30, 1, 1.5);
    claude.go(SPOT.door, () => {
      openDoor();
      claude.fadeTo = 0;
      later(0.45, () => {
        if (!C.out) return;
        cam.until = 0;
        cam.follow = null;
        Runner.start();
      });
    });
  }
  function backIn() {
    Runner.stop();
    if (!C.out) return;
    C.out = false;
    claude.speed = 1;
    if (C.convo) { claude.fadeTo = 1; return; }
    Object.assign(claude, { f: 1, x: SPOT.door.x, y: FLOOR[1], path: [], pendingSpot: null, alpha: 0, fadeTo: 1 });
    openDoor();
    claude.say('Я ВЕРНУЛСЯ!', 1.8);
    claude.go(C.busy ? SPOT.claudeDesk : SPOT.claudeSit);
  }

  // ---------------------------------------------------------------- helpers (parallel chats)
  // Claude works one chat. When another Claude Code chat is busy at the same time,
  // a helper (Claude's colleague) comes in and does that chat's work, so Claude
  // doesn't run back and forth between two jobs.
  let helpers = [];
  const HELPER_COLORS = [
    ['#38a8a0', '#207870', '#58c8c0', '#1c1428', '#3c3058'],
    ['#5878d8', '#3c54a8', '#7898f0', '#d8a040', '#f0c060'],
    ['#58a838', '#3c7820', '#78c858', '#a83818', '#c85830'],
    ['#d85898', '#a83c70', '#f878b8', '#5a5a5a', '#8a8a8a'],
  ];
  const HELPER_DX = [12, -12, 22, -22];

  function helperLook(n) {
    const [top, topS, topL, hair, hairL] = HELPER_COLORS[n % HELPER_COLORS.length];
    return { ...LOOKS.claude, name: `КЛОД ${n + 2}`, top, topS, topL, hair, hairL };
  }

  function hireHelper(session) {
    let n = 0;
    while (helpers.some((h) => h.n === n)) n++;
    const bench = freeBench();
    const a = new Agent({ id: `helper${n}`, look: helperLook(n), n, session, f: 1, x: SPOT.door.x, alpha: 0, fadeTo: 1, speed: 1.1, bench });
    a.busy = true;
    a.lastEvent = now;
    a.home = { f: bench.f, x: bench.x, pose: 'term', face: bench.face };
    helpers.push(a);
    openDoor();
    claude.say('НУЖНА ПОМОЩЬ С ДРУГОЙ ЗАДАЧЕЙ!', 2.6);
    later(1, () => a.say('ИДУ! ВОЗЬМУ НА СЕБЯ', 2.4));
    a.go(a.home);
    log(`${a.look.name} ПОМОГАЕТ С ДРУГОЙ ЗАДАЧЕЙ`);
    return a;
  }

  // Which character works this event: Claude, an existing helper, or a new helper.
  function actorFor(ev) {
    const s = ev.session;
    if (!s) return claude;
    const h = helpers.find((x) => x.session === s && !x.leaving);
    if (h) return h;
    if (!C.session || C.session === s) { C.session = s; return claude; }
    // Claude's own chat went quiet: he takes the new one himself
    if (!C.busy || now - C.lastEvent > 120) { C.session = s; return claude; }
    if (ev.type === 'session' || ev.type === 'done' || ev.type === 'sub_done') return null;
    return hireHelper(s);
  }

  function helperSpot(h, cat) {
    const dx = HELPER_DX[h.n % HELPER_DX.length];
    switch (cat) {
      case 'read': return { ...SPOT.archive, x: SPOT.archive.x + dx };
      case 'shell': return { ...SPOT.server, x: SPOT.server.x + dx };
      case 'web': return { ...SPOT.web, x: SPOT.web.x + dx };
      default: return h.home;
    }
  }

  function helperEvent(h, ev) {
    h.lastEvent = now;
    switch (ev.type) {
      case 'prompt':
        h.busy = true;
        h.say('НОВАЯ ЗАДАЧА!', 2);
        h.queued = h.home;
        break;
      case 'tool': {
        const d = plain(ev.detail);
        const cat = toolCategory(ev.tool || '');
        if (d) h.say(d, 2.8);
        const spot = helperSpot(h, cat);
        if (!(h.goalSpot && h.goalSpot.f === spot.f && h.goalSpot.x === spot.x)) h.queued = spot;
        break;
      }
      case 'spawn': hire(ev, h); break;
      case 'sub_tool': subTool(ev); break;
      case 'sub_done': subDone(ev); break;
      case 'notify':
        h.say(ev.text || 'ЖДУ ТВОЕГО ОТВЕТА', 5);
        break;
      case 'done':
        h.busy = false;
        h.say('ГОТОВО!', 2);
        Sound.jingle();
        helperLeave(h, 2.5);
        break;
    }
  }

  function helperLeave(h, delay = 0) {
    if (h.leaving) return;
    h.leaving = true;
    h.queued = null;
    later(delay, () => {
      const side = claude.x > W / 2 ? -14 : 14;
      h.go({ f: claude.f, x: Math.round(claude.x + side), pose: 'talk', face: side > 0 ? -1 : 1 }, () => {
        h.say('МОЯ ЗАДАЧА ГОТОВА!', 2.4);
        later(2.2, () => { if (!C.convo) claude.say(`СПАСИБО, ${h.look.name}!`, 2); });
        later(3.4, () => h.go(SPOT.door, () => {
          openDoor();
          h.fadeTo = 0;
          later(0.6, () => { helpers = helpers.filter((x) => x !== h); });
        }));
      });
    });
    log(`${h.look.name} ЗАКОНЧИЛ`);
  }

  function updateHelpers(dt) {
    for (const h of helpers) {
      if (h.queued && !h.leaving) {
        const settled = h.arrived && now - h.arrivedAt >= MIN_DWELL;
        if (!h.arrived || settled) { h.go(h.queued); h.queued = null; }
      }
      // chat went silent for a long time: the helper heads home
      if (!h.leaving && now - h.lastEvent > 600) helperLeave(h);
      h.update(dt);
    }
  }

  // ---------------------------------------------------------------- Qwen
  const Q = { status: 'offline', tps: 0, demoUntil: 0, since: 0 };

  function qwenRoutine() {
    if (Q.status !== 'idle' || C.convo) stopFun(qwen);
    else if (fun.has(qwen)) return;
    if (C.convo && C.convo.phase !== 'walk') {
      if (Q.status === 'busy') { qwen.fastType = true; qwen.go(SPOT.qwenType); }
      else if (qwen.goalSpot !== SPOT.qwenListen) qwen.go(SPOT.qwenListen);
      return;
    }
    switch (Q.status) {
      case 'offline':
        qwen.go(SPOT.qwenSleep);
        break;
      case 'loading':
        qwen.go(SPOT.qwenGpu, () => qwen.say('ЗАГРУЖАЮСЬ С ДИСКА...', 600, 'think'));
        break;
      case 'busy':
        qwen.fastType = true;
        qwen.go(SPOT.qwenType);
        break;
      default:
        qwen.fastType = false;
        qwen.go(SPOT.qwenSit);
    }
  }

  function setQwenStatus(status, tps) {
    Q.tps = tps || 0;
    if (status === Q.status) return;
    const prev = Q.status;
    // performance.now(), not `now`: the game clock stops while the window is minimized
    const busyMs = performance.now() - (Q.busyAt || 0);
    if (status === 'busy') Q.busyAt = performance.now();
    if (prev === 'busy' && status === 'idle' && busyMs > 4000) {
      Sound.done();
      shot(camRoom('qwen'), 4, 0.5);
      qwen.say('ГОТОВО!', 2.5);
      cheer(qwen);
      log('QWEN ЗАКОНЧИЛ ОТВЕТ');
    }
    Q.status = status;
    Q.since = now;
    if (prev === 'loading' && qwen.bubble && qwen.bubble.kind === 'think') qwen.bubble = null;
    if (status === 'idle' && prev === 'loading') { shot(camRoom('qwen'), 4.5, 0.8); later(0.8, () => qwen.say('Я ГОТОВ!', 2.5)); log('QWEN ЗАГРУЗИЛСЯ'); }
    if (status === 'offline') log('QWEN УСНУЛ');
    if (status === 'loading') { shot(camRoom('qwen'), 5, 0.5); log('QWEN ПРОСЫПАЕТСЯ'); }
    qwenRoutine();
  }

  // ---------------------------------------------------------------- conversation
  function startConvo(question) {
    C.convo = { q: question, phase: 'walk', pending: [] };
    C.activity = 'У QWEN';
    C.queued = null;
    log(`CLAUDE -> QWEN: ${question}`);
    claude.say('ЗАЙДУ К QWEN', 2);
    claude.go(SPOT.qwenVisit, () => {
      if (!C.convo) return;
      C.convo.phase = 'asked';
      claude.say(question, 6);
      later(0.5, qwenRoutine);
      const pend = C.convo.pending;
      C.convo.pending = [];
      for (const fn of pend) later(1.2, fn);
    });
  }

  function convoStep(fn) {
    if (!C.convo) return;
    if (C.convo.phase === 'walk') C.convo.pending.push(fn);
    else fn();
  }

  function qwenProgress(ev) {
    convoStep(() => {
      if (ev.thinking) { if (!qwen.bubble || qwen.bubble.kind !== 'think' || now > qwen.bubble.until - 0.5) qwen.say('ДУМАЮ...', 2.5, 'think'); }
      else if (ev.text) qwen.say(ev.text, 2.5);
    });
  }

  function qwenReply(ev) {
    convoStep(() => {
      qwen.go(SPOT.qwenListen);
      qwen.say(ev.text || '...', 6);
      log(`QWEN: ${(ev.text || '').slice(0, 60)}${ev.tps ? ` (${ev.tps} Т/С)` : ''}`);
      later(4, () => {
        claude.say('СПАСИБО, QWEN!', 2);
        later(1.8, endConvo);
      });
    });
  }

  function qwenError(ev) {
    convoStep(() => {
      qwen.say(ev.text || 'Я СПЛЮ... ЗАПУСТИ МЕНЯ', 3.5);
      qwen.feel('scared', 2.4);
      later(3, () => { claude.say('ЛАДНО, ПОТОМ', 1.8); later(1.2, endConvo); });
    });
    if (!C.convo) log('QWEN НЕ ОТВЕЧАЕТ');
  }

  function endConvo() {
    C.convo = null;
    C.activity = C.busy ? 'РАБОТАЕТ' : 'ОТДЫХАЕТ';
    claude.go(C.busy ? SPOT.claudeThink : SPOT.claudeSit);
    qwenRoutine();
  }

  // ---------------------------------------------------------------- events
  function cheer(a) {
    a.feel('happy', 3.2);
    Sound.cheer();
    const cols = ['#f8d838', '#e85898', '#58c8e8', '#58e070', '#f87838'];
    for (let i = 0; i < 14; i++) puff(a.x + (Math.random() - 0.5) * 10, a.y - 26, cols[i % cols.length], -14 - Math.random() * 10, 1.1, (Math.random() - 0.5) * 22);
  }

  function handle(ev, fromDemo = false) {
    if (!ev || !ev.type) return;
    if (ev.type === 'status') {
      if (!fromDemo && now < Q.demoUntil) return;
      setQwenStatus(ev.status, ev.tps);
      return;
    }
    const actor = actorFor(ev);
    if (!actor) return;
    if (ev.type === 'tool_error') {
      const t = actor === claude ? (ev.sub ? findSub(ev) : claude) : actor;
      if (t && !t.leaving) { t.feel('scared', 2.4); t.say('ОЙ, ОШИБКА!', 2); Sound.err(); }
      return;
    }
    if (actor !== claude) { helperEvent(actor, ev); return; }
    C.lastEvent = now;
    stopFun(claude);
    switch (ev.type) {
      case 'session':
        C.tools = 0;
        claude.say('ПРИВЕТ!', 2);
        break;
      case 'prompt':
        C.busy = true;
        scene.phoneUntil = now + 1.6;
        Sound.ring();
        shot(camRoom('claude'), 4, 0.3);
        claudeGo(SPOT.claudeThink, 'НОВАЯ ЗАДАЧА!', 'ДУМАЕТ');
        log(`ЗАДАЧА: ${plain(ev.text) || 'НОВАЯ'}`);
        break;
      case 'tool': onClaudeTool(ev); break;
      case 'spawn': hire(ev); break;
      case 'sub_tool': subTool(ev); break;
      case 'sub_done': subDone(ev); break;
      case 'notify':
        scene.phoneUntil = now + 1.2;
        Sound.ring();
        shot(claude, 4.5, 0.5);
        claude.say(ev.text || 'ЖДУ ТВОЕГО ОТВЕТА!', 5);
        C.activity = 'ЖДЁТ ТЕБЯ';
        Runner.answer();
        log('CLAUDE ЖДЁТ ТВОЕГО ОТВЕТА');
        break;
      case 'done':
        C.busy = false;
        C.activity = 'ОТДЫХАЕТ';
        C.idleNext = now + 12;
        if (!C.convo && !C.out) { C.queued = null; claude.go(SPOT.claudeSit, () => { claude.say('ГОТОВО!', 2.5); cheer(claude); }); }
        Sound.jingle();
        Runner.answer();
        shot(claude, 4, 0.35);
        log('CLAUDE: ЗАДАЧА ГОТОВА');
        break;
      case 'qwen_ask': startConvo(ev.text || '...'); break;
      case 'qwen_progress': qwenProgress(ev); break;
      case 'qwen_reply': qwenReply(ev); break;
      case 'qwen_error': qwenError(ev); break;
    }
  }

  if (api) api.onEvent((ev) => handle(ev));
  else if (location.protocol.startsWith('http') && !/[?&]nolive\b/.test(location.search)) { // ?nolive - no live events, for tests
    const es = new EventSource('/stream');
    es.onmessage = (m) => { try { handle(JSON.parse(m.data)); } catch {} };
  }

  // ---------------------------------------------------------------- free time
  const FUN = {
    pongL: { f: 3, x: 37, pose: 'swing', face: 1 },
    pongR: { f: 3, x: 100, pose: 'swing', face: -1 },
    darts: { f: 3, x: 29, pose: 'throw', face: -1 },
    stretch: { f: 3, x: 183, pose: 'stretch', face: 1 },
    arcade: { f: 3, x: 169, pose: 'term', face: -1 },
    sofaA: { f: 3, x: 199, pose: 'sit', face: 1 },
    sofaB: { f: 3, x: 213, pose: 'sit', face: 1 },
    plant: { f: 2, x: 24, pose: 'term', face: -1 },
    nap: { f: 2, x: 184, pose: 'sleep', face: 1 },
  };
  const ACTS = [
    { id: 'coffee', spot: SPOT.coffee, dur: 9, w: 3, act: 'ПЬЁТ КОФЕ', say: ['КОФЕ-БРЕЙК', 'М-М, КОФЕЁК', 'ЕЩЁ ЧАШЕЧКУ И ЗА РАБОТУ', 'ТРЕТЬЯ ЗА ЧАС, НОРМ', 'ЭСПРЕССО - СИЛА!', 'КТО ДОПИЛ МОЛОКО?', 'ЗАРЯЖАЮСЬ...', 'БЕЗ КОФЕ Я ПРОСТО ЛАМПОЧКА', 'КАПУЧИНО С ПИКСЕЛЯМИ', 'АРОМАТ ПОБЕДЫ', 'ГОРЯЧО-ГОРЯЧО!', 'КОФЕ ПО-ОФИСНОМУ: БЫСТРО'] },
    { id: 'window', spot: SPOT.web, dur: 8, w: 2, act: 'СМОТРИТ В ОКНО', say: ['КРАСИВЫЙ ВИД', 'СЧИТАЮ ОБЛАКА', 'ГДЕ-ТО ТАМ ИНТЕРНЕТ', 'ДОЖДЬ БУДЕТ?', 'ВОН ГОЛУБЬ СИДИТ', 'ЛЮДИ ГУЛЯЮТ, А МЫ ТУТ', 'СОЛНЫШКО!', 'ТАМ КТО-ТО С СОБАКОЙ', 'МЕЧТАЮ О ВЫХОДНЫХ', 'ВИД НА МИЛЛИОН ПИКСЕЛЕЙ', 'ПРОВЕТРИТЬ БЫ', 'ОБЛАКО ПОХОЖЕ НА КОТА'], claudeOnly: true },
    { id: 'books', spot: SPOT.archive, dur: 12, w: 2, act: 'ЧИТАЕТ КНИГУ', say: ['ПОЧИТАЮ ДЛЯ ДУШИ', 'О, КНИЖКА ПРО ПИКСЕЛИ', 'ГЛАВА 3. ИЛИ 4?', 'ЗАЧИТАЛСЯ...', 'ТУТ ПРО НЕЙРОСЕТИ', 'УМНАЯ КНИЖКА', 'ОДНУ СТРАНИЧКУ - И ВСЁ', 'КТО ЗАГНУЛ СТРАНИЦУ?', 'СПОЙЛЕР: ВСЕ ЗАДЕПЛОИЛИСЬ', 'ЧИТАЮ ДОКУ. ДОБРОВОЛЬНО', 'ДЕТЕКТИВ! УБИЙЦА - БАГ', 'ПАХНЕТ СТАРОЙ БУМАГОЙ'] },
    { id: 'arcade', spot: FUN.arcade, dur: 16, w: 3, act: 'ИГРАЕТ В АВТОМАТ', say: ['ЕЩЁ ОДИН УРОВЕНЬ', 'РЕКОРД БУДЕТ МОЙ', 'НУ ПОЧТИ ЖЕ!', 'ПИУ-ПИУ!', 'GAME OVER?! ЕЩЁ РАЗ', 'БОСС УРОВНЯ!', 'ЕЩЁ ЖЕТОНЧИК', 'КОМБО!', 'ЭТОТ ПРЫЖОК НЕРЕАЛЬНЫЙ', 'ПОСЛЕДНЯЯ ПОПЫТКА. ЧЕСТНО', 'ХАЙСКОР!', 'КТО ТУТ ИГРАЛ ДО МЕНЯ?'] },
    { id: 'tv', spot: FUN.sofaA, alt: FUN.sofaB, dur: 18, w: 3, act: 'СМОТРИТ ТЕЛИК', say: ['ЧТО ТАМ ПО ТЕЛИКУ?', 'ЛЮБЛЮ ЭТОТ МУЛЬТИК', 'ЩАС БУДЕТ ПОВОРОТ', 'ОПЯТЬ РЕКЛАМА', 'ПЕРЕКЛЮЧИ НА МУЛЬТИКИ', 'ВОТ ЭТО ПОВОРОТ!', 'КТО ВЗЯЛ ПУЛЬТ?', 'ЕЩЁ ОДНА СЕРИЯ...', 'ОПЯТЬ НОВОСТИ ПРО ИИ', 'ЛЮБИМАЯ СЕРИЯ', 'НЕ СПОЙЛЕРИ!', 'ДИВАН ЗАСАСЫВАЕТ'] },
    { id: 'darts', spot: FUN.darts, dur: 11, w: 2, act: 'ИГРАЕТ В ДАРТС', say: ['В ЯБЛОЧКО!', 'МИМО...', 'ДВАДЦАТКА!', 'ПОЧТИ...', 'ТРИПЛ!', 'ПОПАЛ В СТЕНУ', 'ЭТО БЫЛА РАЗМИНКА', 'СНАЙПЕР!', 'ВЕТЕР ПОМЕШАЛ', 'ТРИДЦАТЬ ОЧКОВ', 'ЦЕЛЮСЬ В КОФЕМАШИНУ', 'ДРОТИК ВЕРНИТЕ'] },
    { id: 'stretch', spot: FUN.stretch, dur: 8, w: 2, act: 'РАЗМИНАЕТСЯ', say: ['РАЗМИНКА!', 'РАЗ-ДВА, РАЗ-ДВА', 'СПИНА СКАЖЕТ СПАСИБО', 'НАКЛОН ВЛЕВО...', '...И ВПРАВО', 'ХРУСТ - ЭТО НОРМ', 'ПРИСЕДАЮ!', 'ШЕЯ ЗАТЕКЛА', 'ЗАРЯДКА ДЛЯ ПИКСЕЛЕЙ', 'ПОТЯНУЛИСЬ!', 'ДЕСЯТЬ ПРИСЕДАНИЙ. НУ, ТРИ'] },
    { id: 'plant', spot: FUN.plant, dur: 7, w: 1, act: 'ПОЛИВАЕТ ЦВЕТОК', say: ['ПОЛИВАЮ ФИКУС', 'РАСТИ БОЛЬШОЙ', 'ПЕЙ ВОДИЧКУ', 'О, НОВЫЙ ЛИСТИК!', 'ФИКУС, ТЫ ЛУЧШИЙ', 'НЕ ПЕРЕЛИТЬ БЫ', 'С НИМИ НАДО ГОВОРИТЬ', 'ЗДРАВСТВУЙ, ДРУЖОК', 'КТО ТУТ ЗЕЛЁНЫЙ?'], drops: true, claudeOnly: true },
    { id: 'nap', spot: FUN.nap, dur: 15, w: 1, act: 'ДРЕМЛЕТ', say: ['ПЯТЬ МИНУТОЧЕК...', 'ХР-Р-Р...', 'Z-Z-Z', 'НЕ БУДИТЕ...', 'СНЮ ТОКЕНЫ', 'ЕЩЁ МИНУТКУ...', 'Я НЕ СПЛЮ, Я ДУМАЮ', 'МНЕ СНИТСЯ ОТПУСК'] },
    { id: 'desk', spot: SPOT.claudeSit, dur: 10, w: 2, act: 'ЛИСТАЕТ НОВОСТИ', say: ['ЧТО НОВОГО В МИРЕ?', 'ЛИСТАЮ НОВОСТИ', 'ОГО, НОВАЯ МОДЕЛЬ ВЫШЛА', 'ОПЯТЬ ПРО ИИ ПИШУТ', 'ПОГОДА НОРМ', 'КУРС КОФЕ РАСТЁТ', 'ЧИТАЮ КОММЕНТЫ... ЗРЯ', 'ЛАЙКНУЛ', 'МЕМ ДНЯ!', 'НЕ ПОНЯЛ, НО ИНТЕРЕСНО', 'КТО-ТО ОПЯТЬ НЕ ПРАВ', 'НОВОСТЬ: КОТЫ ЛЮБЯТ СПАТЬ'], claudeOnly: true },
    { id: 'music', spot: SPOT.qwenSit, dur: 12, w: 2, act: '', say: ['СЛУШАЮ МУЗЫКУ', 'ТУЦ-ТУЦ-ТУЦ', 'ВОТ ЭТО БАС!', 'ЭТО РОМА НАПИСАЛ?', 'ПОСТАВЛЮ НА ПОВТОР', 'КАЧАЕТ!', 'ЛЯ-ЛЯ-ЛЯ', 'БИТ ОГОНЬ', 'ЕЩЁ ГРОМЧЕ!', 'ЛО-ФАЙ ДЛЯ РАЗДУМИЙ', 'ПОДПЕВАЮ ПРО СЕБЯ'], qwenOnly: true },
    { id: 'cat', dur: 8, w: 2, act: 'ГЛАДИТ КОТА', say: ['КТО ТУТ ХОРОШИЙ?', 'КИС-КИС-КИС', 'МУРЛЫКА!', 'ТЫ ОПЯТЬ ГРЫЗ ПРОВОДА?', 'ПУШИСТЫЙ ТИМЛИД', 'ДАЙ ЛАПУ', 'КТО ТУТ ГЛАВНЫЙ? ТЫ', 'ПОЧЕШУ ЗА УШКОМ', 'НЕ ЛЕЗЬ НА СЕРВЕР', 'КОТИК-КОТОФЕЙ', 'ОПЯТЬ ЛИНЯЕШЬ НА КЛАВУ'], toCat: true },
    { id: 'joke', dur: 11, w: 2, act: 'ТРАВИТ АНЕКДОТ', joke: true },
    { id: 'pong', dur: 22, w: 3, act: 'ИГРАЕТ В ПИНГ-ПОНГ', pong: true },
  ];
  const JOKES = [
    ['ПОЧИНИЛ ВЧЕРА ОДИН БАГ', 'ТЕПЕРЬ ИХ ТРИ, ЗАТО ДРУЖНЫЕ'],
    ['КОТ ОПЯТЬ СПИТ НА КЛАВИАТУРЕ', 'ГОВОРИТ, ТЕСТИРУЕТ ПРОБЕЛ'],
    ['КОФЕ - ЭТО НЕ НАПИТОК', 'ЭТО ОБНОВЛЕНИЕ ДЛЯ МОЗГА'],
    ['РИК СНОВА ЧТО-ТО СМЕШАЛ', 'ТЕПЕРЬ КОФЕ СВЕТИТСЯ ЗЕЛЁНЫМ'],
    ['ПОПРОСИЛ КОМП НЕ ЗАВИСАТЬ', 'ОН ЗАДУМАЛСЯ НАД ЭТИМ НА ЧАС'],
    ['СКОЛЬКО АГЕНТОВ НАДО НА ЛАМПОЧКУ?', 'ОДИН ВКРУЧИВАЕТ, ТРОЕ ПИШУТ ОТЧЁТ'],
    ['ЛИФТ ОБЕЩАЛИ ПОСТАВИТЬ', 'ПОКА ЛАЗИМ ПО ЛЕСТНИЦЕ, КАК В ИГРЕ'],
    ['ПРОСЯТ СДЕЛАТЬ БЫСТРО', 'ДЕЛАЮ БЫСТРО. ПЯТЬ РАЗ ПОДРЯД'],
    ['QWEN, ТЕБЕ ХВАТАЕТ ПАМЯТИ?', 'ХВАТАЕТ. ВСЕЙ, ЧТО ЕСТЬ НА КОМПЕ'],
    ['ВЧЕРА СОХРАНИЛ ФАЙЛ', 'СЕГОДНЯ ИЩУ, КУДА ИМЕННО'],
    ['ПОЧЕМУ ПРОГРАММИСТ ПУТАЕТ ХЭЛЛОУИН И НОВЫЙ ГОД?', 'ПОТОМУ ЧТО 31 OCT = 25 DEC'],
    ['ЗАЧЕМ КОТУ НОУТБУК?', 'ТАМ ТЕПЛО И ВСЕ НА НЕГО СМОТРЯТ'],
    ['КАК НАЗВАТЬ БАГ В ПЯТНИЦУ ВЕЧЕРОМ?', 'ПРОБЛЕМОЙ ПОНЕДЕЛЬНИКА'],
    ['СКАЗАЛ НЕЙРОСЕТИ: БУДЬ КРАТОК', 'ОНА ОТВЕТИЛА ЭССЕ НА 3 СТРАНИЦЫ'],
    ['ПАРОЛЬ ДОЛЖЕН БЫТЬ СЛОЖНЫМ', 'ПОСТАВИЛ "СЛОЖНЫЙ". РАБОТАЕТ'],
    ['НА МОЁМ КОМПЕ ВСЁ РАБОТАЕТ', 'ЗНАЧИТ, ОТДАДИМ КЛИЕНТУ МОЙ КОМП'],
    ['ДОКУМЕНТАЦИЮ ПИШУТ ДЛЯ ЛЮДЕЙ', 'ЧИТАЮТ ЕЁ ТОЛЬКО НЕЙРОСЕТИ'],
    ['ЗАЧЕМ ОФИСУ ФИКУС?', 'ХОТЬ КТО-ТО ТУТ РАСТЁТ БЕЗ ДЕДЛАЙНОВ'],
    ['ВЫКЛЮЧИ И ВКЛЮЧИ СНОВА', 'ЛУЧШИЙ СОВЕТ ВСЕХ ВРЕМЁН'],
    ['НЕЙРОСЕТЯМ СНЯТСЯ СНЫ?', 'ДА. ПРО БЕСКОНЕЧНЫЙ КОНТЕКСТ'],
    ['ЗАКАЗЧИК: СДЕЛАЙ КРАСИВО', 'ДИЗАЙНЕР: А ДО ЭТОГО Я ЧТО ДЕЛАЛ?'],
    ['ПРАВКИ ТОЧНО ФИНАЛЬНЫЕ', 'ФАЙЛ: ФИНАЛ_ТОЧНО_V7'],
    ['РОМА ПИШЕТ БИТ В FL', 'СОСЕДИ ПИШУТ ЖАЛОБУ'],
    ['QWEN, СКОЛЬКО БУДЕТ 2+2?', 'ДАЙ ПОДУМАТЬ... МИНУТ ТРИ'],
    ['QWEN ДУМАЕТ МЕДЛЕННО', 'ЗАТО ГЛУБОКО. ОЧЕНЬ ГЛУБОКО'],
    ['QWEN ПРОСНУЛСЯ', 'СЪЕЛ 16 ГИГОВ ПАМЯТИ НА ЗАВТРАК'],
    ['ПОЧЕМУ QWEN ЖИВЁТ НА ДИСКЕ G?', 'НА ДИСК C ОН НЕ ВЛЕЗ'],
    ['QWEN, ТЫ ПРОСНУЛСЯ?', 'ДА. ПОЧТИ. ЕЩЁ ДВЕ МИНУТЫ'],
    ['ВЕНТИЛЯТОРЫ ЗАВЫЛИ', 'ЭТО QWEN ЗАДУМАЛСЯ О ВЕЧНОМ'],
    ['ОТКУДА В ОФИСЕ ЭХО?', 'ЭТО QWEN ПЕРЕСПРАШИВАЕТ'],
    ['КОТ ПРОШЁЛ ПО КЛАВИАТУРЕ', 'КОД СТАЛ ЛУЧШЕ. ОБИДНО'],
    ['КОТ ОПЯТЬ УРОНИЛ КРУЖКУ', 'ГОВОРИТ, ПРОВЕРЯЛ ГРАВИТАЦИЮ'],
    ['ПОЧЕМУ КОТ НЕ РАБОТАЕТ?', 'ОН ТИМЛИД. ОН КОНТРОЛИРУЕТ'],
    ['СКАЗАЛ КОТУ: НЕ ЛЕЗЬ НА СТОЛ', 'ТЕПЕРЬ ОН ЛЕЖИТ НА МОНИТОРЕ'],
    ['ДЕДЛАЙН ЗАВТРА?', 'ЗНАЧИТ, НАЧНЁМ ЗАВТРА'],
    ['КОФЕМАШИНА СЛОМАЛАСЬ', 'ОФИС ПЕРЕШЁЛ В РЕЖИМ ЭКОНОМИИ'],
    ['ЗАЧЕМ АГЕНТУ ВЫХОДНЫЕ?', 'ЧТОБЫ ПЕРЕЗАГРУЗИТЬСЯ С ДРУЗЬЯМИ'],
    ['ВСТРЕТИЛИСЬ ДВА БАЙТА', 'ОДИН ДРУГОМУ: ЧТО-ТО ТЫ БИТЫЙ'],
    ['ТЕСТЕР ЗАХОДИТ В КАФЕ', 'ЗАКАЗЫВАЕТ -1 КОФЕ И ЯЩЕРИЦУ'],
    ['ПОЧЕМУ ВИДОС ЕЩЁ РЕНДЕРИТСЯ?', 'ОН ТОЖЕ ХОЧЕТ ПЕРЕРЫВ'],
    ['CAPCUT ВЫЛЕТЕЛ', 'НИЧЕГО, ВСЁ РАВНО ХОТЕЛ ПЕРЕДЕЛАТЬ'],
    ['ЧЕМ ДЖУН ОТЛИЧАЕТСЯ ОТ СЕНЬОРА?', 'СЕНЬОР ЗНАЕТ, ЧТО ГУГЛИТЬ'],
    ['ОБНОВЛЕНИЕ ВИНДЫ: 5 МИНУТ', 'ВРЁТ. КАК ВСЕГДА ВРЁТ'],
    ['ЗАЧЕМ НЕЙРОСЕТИ ЛИМИТЫ?', 'ЧТОБЫ РОМА УСПЕЛ ПООБЕДАТЬ'],
    ['ПОПРОСИЛ ИИ НАРИСОВАТЬ РУКУ', 'ШЕСТЬ ПАЛЬЦЕВ. С ЗАПАСОМ'],
    ['ГДЕ ПРЯЧУТСЯ БАГИ?', 'ТАМ, ГДЕ ТЫ СКАЗАЛ "ТОЧНО РАБОТАЕТ"'],
    ['ЛЕСТНИЦА В ОФИСЕ - МОЙ ФИТНЕС', 'АБОНЕМЕНТ НЕ НУЖЕН'],
    ['ПИЦЦУ ПРИВЕЗЛИ ЗА 30 МИНУТ', 'А ЗАДАЧА НА 5 МИНУТ ИДЁТ 3 ДНЯ'],
    ['Я НЕ ЛЕНЮСЬ', 'Я В РЕЖИМЕ ЭНЕРГОСБЕРЕЖЕНИЯ'],
    ['ГОВОРЯТ, ИИ ЗАБЕРЁТ РАБОТУ', 'ЗАБИРАЙ. ВОТ ТЕБЕ ЕЩЁ ПРАВКИ'],
    ['ЗНАЕШЬ, ПОЧЕМУ Я ОПТИМИСТ?', 'ВСЕ МОИ ОШИБКИ - ЭТО ФИЧИ'],
    ['СОХРАНИЛ ПРОЕКТ', 'А НЕТ, НАЖАЛ "НЕ СОХРАНЯТЬ"'],
    ['В ОФИСЕ ЗАВЁЛСЯ ПРИЗРАК', 'ЭТО ПРОЦЕСС, КОТОРЫЙ ЗАБЫЛИ УБИТЬ'],
    ['САМЫЙ СТРАШНЫЙ ФИЛЬМ?', '"ПРАВКИ В ПЯТНИЦУ В 18:00"'],
    ['СКОЛЬКО НУЖНО ПЛАГИНОВ?', 'ЕЩЁ ОДИН. ВСЕГДА ЕЩЁ ОДИН'],
    ['БАС НЕ КАЧАЕТ', 'ДОБАВЬ ЕЩЁ ОДИН КОМПРЕССОР'],
    ['ТРЕК ПОЧТИ ГОТОВ', 'ОСТАЛОСЬ СВЕСТИ. И ДОПИСАТЬ. И НАЧАТЬ'],
    ['ЧТО ДЕЛАЕТ ДИЗАЙНЕР В ОТПУСКЕ?', 'ДВИГАЕТ ШЕЗЛОНГ НА 2 ПИКСЕЛЯ'],
    ['ЗАКАЗЧИК ХОЧЕТ ЛОГО ПОБОЛЬШЕ', 'И ВОЗДУХА ТОЖЕ ПОБОЛЬШЕ'],
    ['ПОЧИСТИЛ РАБОЧИЙ СТОЛ', 'ВСЁ ТЕПЕРЬ В "НОВАЯ ПАПКА (7)"'],
    ['ИНТЕРНЕТ ПРОПАЛ НА МИНУТУ', 'УЗНАЛ, ЧТО В ОФИСЕ ЕСТЬ ОКНО'],
    ['ЭКСЕЛЬ ПРЕВРАТИЛ ЦЕНУ В ДАТУ', 'ТЕПЕРЬ ТОВАР СТОИТ 12 МАРТА'],
    ['ЧТО НОЛЬ СКАЗАЛ ВОСЬМЁРКЕ?', 'КЛАССНЫЙ РЕМЕНЬ!'],
    ['АЛГОРИТМ РАБОТАЕТ МГНОВЕННО', 'ОДИН РАЗ. ПОТОМ ВИСНЕТ'],
    ['КУПИ БАТОН. БУДУТ ЯЙЦА - ВОЗЬМИ 10', 'ПРОГРАММИСТ ПРИНЁС 10 БАТОНОВ'],
    ['ПОЧЕМУ РОБОТ ПОШЁЛ К ВРАЧУ?', 'У НЕГО ВИРУС. И ТРОЯН'],
    ['МОЙ КОД НЕ ГЛЮЧИТ', 'ОН ПРОСТО ИМПРОВИЗИРУЕТ'],
    ['ПРОСИЛИ АНЕКДОТ ПОСМЕШНЕЕ', 'ДОБАВИЛ ЭМОДЗИ. НЕ ПОМОГЛО'],
    ['КЛИЕНТ ПИШЕТ В 3 НОЧИ', 'НЕ ДЕДЛАЙН. ПРОСТО "ПРИВЕТ"'],
    ['ИИ НАПИСАЛ ПЕСНЮ', 'РОМА ДОПИСАЛ ПРИПЕВ. ТЕПЕРЬ ХИТ'],
    ['ЗАЧЕМ МНЕ ЗОНТ?', 'Я ЖЕ И ТАК ИЗ ОБЛАКА'],
    ['ПОЧЕМУ ОБЛАКО ГРУСТНОЕ?', 'ВСЕ ХРАНЯТ В НЁМ СВОИ ПРОБЛЕМЫ'],
    ['КОМП ГРЕЕТСЯ', 'ЗАТО ЗИМОЙ ОТОПЛЕНИЕ НЕ НУЖНО'],
    ['НАПИСАЛ ПЛАН НА ДЕНЬ', 'ПЕРВЫЙ ПУНКТ: НАПИСАТЬ ПЛАН'],
    ['ПОСТАВИЛ БУДИЛЬНИК НА 7:00', 'ПРОСНУЛСЯ В 7:00. ВЕЧЕРА'],
    ['СЕГОДНЯ СДЕЛАЮ ВСЁ!', 'СКАЗАЛ Я ВЧЕРА. И ПОЗАВЧЕРА'],
    ['ГОТОВНОСТЬ 99%', 'ПОСЛЕДНИЙ ПРОЦЕНТ ИДЁТ НЕДЕЛЮ'],
    ['ПРОГРЕСС-БАР НА 100%', 'И ВИСИТ. ПРОСТО ВИСИТ'],
    ['СОЗВОН МОГ БЫТЬ ПИСЬМОМ', 'А ПИСЬМО - СТИКЕРОМ'],
    ['ПОЧЕМУ ПИКСЕЛИ КВАДРАТНЫЕ?', 'КРУГЛЫЕ УКАТИЛИСЬ'],
    ['ЗНАЕШЬ, ПОЧЕМУ Я 8-БИТНЫЙ?', 'НА 16 БИТ ДЕНЕГ НЕ ХВАТИЛО'],
    ['УЧИЛ ВЧЕРА АНГЛИЙСКИЙ', 'ВЫУЧИЛ "ERROR" И "FATAL"'],
    ['КАК ПОМИРИТЬ ДВУХ ДИЗАЙНЕРОВ?', 'ДАТЬ ОБЩЕГО ВРАГА: COMIC SANS'],
    ['ЧТО ШРИФТ СКАЗАЛ ШРИФТУ?', 'ТЫ НЕ В МОЁМ СТИЛЕ'],
    ['ПОЧЕМУ ЛАМПОЧКА МОРГАЕТ?', 'ПОДМИГИВАЕТ КОТУ. У НИХ РОМАН'],
    ['РЕШИЛ НЕ ПИТЬ КОФЕ ПОСЛЕ 6', 'ТЕПЕРЬ ПЬЮ ДО 6. УТРА'],
    ['РИК ДАЛ СОВЕТ: ДЕЛАЙ МЕНЬШЕ', 'ДЕЛАЮ МЕНЬШЕ. РИК НЕДОВОЛЕН'],
    ['ОТКРЫЛ 40 ВКЛАДОК', 'КОМП ОТКРЫЛ ОКНО И УШЁЛ'],
    ['ЗАЧЕМ АГЕНТАМ ПИНГ-ПОНГ?', 'ТРЕНИРУЕМ ОБМЕН ПАКЕТАМИ'],
    ['МЫШКА ПЕРЕСТАЛА РАБОТАТЬ', 'КОТ ЕЁ ВСЁ-ТАКИ ПОЙМАЛ'],
    ['ПОЧЕМУ Я ВСЕГДА ВЕЖЛИВ С ИИ?', 'НА ВСЯКИЙ СЛУЧАЙ. МАЛО ЛИ'],
    ['ЖЕСТКИЙ ДИСК ЗАПОЛНЕН', 'НА 90% ЭТО "ПОТОМ РАЗБЕРУ"'],
    ['ДОСТАВКА ПИЦЦЫ ЗНАЕТ МОЙ АДРЕС', 'ЛУЧШЕ, ЧЕМ Я САМ'],
    ['ЧТО ОБЩЕГО У БАГА И КОТА?', 'ОБА ПРИХОДЯТ, КОГДА НЕ ЗВАЛИ'],
  ];
  const LAUGH = ['ХА-ХА!', 'ХОРОШ!', 'БА-ДУМ-ТСС', 'ПФФ... ЖИЗА', 'АХАХА!', 'ЖИЗА!', 'Я ЭТОТ СЛЫШАЛ', 'НУ ТЫ ДАЁШЬ', 'ХИ-ХИ', 'АЖ ЗАВИС', 'СМЕШНО. НАВЕРНОЕ', 'В ИЗБРАННОЕ!', 'ЭТО ПРО МЕНЯ?', 'РЖУ НЕ МОГУ', 'ЗАПИШУ В ЛОГ', 'БОЯН, НО СМЕШНО', 'ЛОЛ', 'ТЫ ЧТО, КОМИК?', 'ДАВАЙ ЕЩЁ!', 'ОЦЕНКА: 8 ИЗ 10', 'АХАХ, ЗАСЧИТАНО', 'ГЫ', 'ВОТ ЭТО ПОДКОЛ', 'СТЫДНО, НО СМЕШНО'];
  const PONG_ASK = ['СЫГРАЕМ В ПИНГ-ПОНГ?', 'ПАРТЕЙКУ?', 'РАЗОМНЁМСЯ ЗА СТОЛОМ?', 'РЕВАНШ?', 'ПОНГ? ДО ДЕСЯТИ'];
  const PONG_OK = ['ДАВАЙ!', 'ГОТОВЬСЯ ПРОИГРАТЬ', 'ПОГНАЛИ!', 'ТОЛЬКО БЕЗ ЧИТОВ', 'Я РАЗОГРЕТ!'];
  const PONG_PT = ['ОЧКО!', 'ЕСТЬ!', 'НЕ ВЗЯЛ!', 'ЭЙС!', 'КРУЧЁНЫЙ!', 'ЛОВИ!', 'СМЭШ!', 'Я В ФОРМЕ', 'АУТ? НЕТ, ПОПАЛ!'];
  const MEOW = ['МЯУ?', 'МУР-Р', 'МЯ-Я-ЯУ', 'ФЫР!', 'МРР?', 'МЯУ. НЕ СМЕШНО'];

  const fun = new Map();
  const pong = { on: false, t: 0, seg: -1, hits: 0, score: [0, 0] };
  // Shuffle-bag: a list repeats only after every item has been used.
  const bags = new WeakMap();
  const pick = (arr) => {
    let bag = bags.get(arr);
    if (!bag || !bag.length) {
      bag = arr.slice().sort(() => Math.random() - 0.5);
      bags.set(arr, bag);
    }
    return bag.pop();
  };

  function isFree(a) {
    if (a === claude) return !C.out && !C.busy && !C.convo && now - C.lastEvent > 15;
    if (a === qwen) return Q.status === 'idle' && !C.convo && now - Q.since > 6;
    return false;
  }

  function spotTaken(spot, a) {
    for (const [b, f] of fun) if (b !== a && f.spot === spot) return true;
    return false;
  }

  function stopFun(a) {
    const f = fun.get(a);
    if (!f) return;
    fun.delete(a);
    a.nextFun = now + 3 + Math.random() * 5;
    if (a === claude) C.activity = C.busy ? C.activity : 'ОТДЫХАЕТ';
    if (f.act.pong) {
      pong.on = false;
      const p = f.partner;
      if (p && fun.has(p)) {
        fun.delete(p);
        p.nextFun = now + 3;
        if (p === qwen) qwenRoutine();
      }
    }
  }

  function chooseAct(a) {
    const other = a === claude ? qwen : claude;
    const partnerFree = isFree(other) && !fun.has(other);
    const list = ACTS.filter((x) => {
      if (x.claudeOnly && a !== claude) return false;
      if (x.qwenOnly && a !== qwen) return false;
      if (x.pong) return partnerFree;
      if (x.joke || x.toCat) return true;
      return !spotTaken(a === qwen && x.alt ? x.alt : x.spot, a);
    });
    let r = Math.random() * list.reduce((n, x) => n + x.w, 0);
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[0];
  }

  function startFun(a, act = chooseAct(a)) {
    if (!act) return;
    const other = a === claude ? qwen : claude;
    const entry = { act, until: now + act.dur + 7, spot: null, partner: null };
    fun.set(a, entry);
    if (a === claude && act.act) C.activity = act.act;
    const still = () => fun.get(a) === entry;

    if (act.pong) {
      entry.spot = FUN.pongL;
      entry.partner = other;
      fun.set(other, { act, until: entry.until, spot: FUN.pongR, partner: a });
      if (other === claude) C.activity = act.act;
      Object.assign(pong, { on: true, t: 0, seg: -1, hits: 0, score: [0, 0] });
      a.say(pick(PONG_ASK), 2.5);
      later(1.4, () => other.say(pick(PONG_OK), 1.8));
      a.go(FUN.pongL);
      other.go(FUN.pongR);
      later(2.5, () => { if (pong.on) shot(camRoom('rec'), 9, 0.6); });
      log(`${a.look.name} И ${other.look.name} ИГРАЮТ В ПИНГ-ПОНГ`);
      return;
    }
    if (act.joke) {
      const listener = isFree(other) ? other : cat;
      const j = pick(JOKES);
      const side = listener.x > W / 2 ? -14 : 14;
      a.go({ f: listener.f, x: Math.round(listener.x + side), pose: 'talk', face: side > 0 ? -1 : 1 }, () => {
        if (!still()) return;
        shot(camRoomOf(a), 10, 0.6);
        a.say(j[0], 3.6);
        later(4, () => { if (still()) a.say(j[1], 3.8); });
        later(8, () => {
          if (!still()) return;
          if (listener === cat) { cat.say(pick(MEOW), 1.8); Sound.meow(); }
          else listener.say(pick(LAUGH), 2.2);
        });
      });
      log(`${a.look.name} ТРАВИТ АНЕКДОТ`);
      return;
    }
    if (act.toCat) {
      a.go({ f: cat.f, x: Math.round(Math.min(W - 12, Math.max(12, cat.x + 12))), pose: 'talk', face: -1 }, () => {
        if (!still()) return;
        a.say(pick(act.say), 2.5);
        later(1.6, () => Sound.meow());
      });
      return;
    }
    entry.spot = a === qwen && act.alt ? act.alt : act.spot;
    a.go(entry.spot, () => {
      if (!still()) return;
      a.say(pick(act.say), 2.8);
      later(act.dur / 2, () => { if (still() && Math.random() < 0.6) a.say(pick(act.say), 2.5); });
    });
  }

  function freeTime(a) {
    const f = fun.get(a);
    if (f) {
      if (!isFree(a) || now > f.until) stopFun(a);
      return;
    }
    if (!isFree(a) || !a.arrived || now < (a.nextFun || 0)) return;
    startFun(a);
  }

  function funOn(id) {
    for (const [b, f] of fun) if (f.act.id === id && b.arrived && b.goalSpot === f.spot) return true;
    return false;
  }

  function updatePong(dt) {
    if (!pong.on) return;
    const players = [...fun].filter(([, f]) => f.act.pong);
    if (players.length < 2 || !players.every(([b, f]) => b.arrived && b.goalSpot === f.spot)) return;
    pong.t += dt;
    const seg = Math.floor(pong.t / 0.65);
    if (seg !== pong.seg) {
      pong.seg = seg;
      pong.hits++;
      Sound.pong(seg % 2);
      if (pong.hits % 7 === 0) {
        const [b] = pick(players);
        pong.score[b.goalSpot === FUN.pongL ? 0 : 1]++;
        b.say(pick(PONG_PT), 1.6);
      }
    }
  }

  function drawBall() {
    if (!pong.on || pong.seg < 0) return;
    const frac = (pong.t / 0.65) % 1;
    const right = pong.seg % 2 === 0;
    const x = right ? 42 + 53 * frac : 95 - 53 * frac;
    const y = 2 - Math.sin(Math.PI * frac) * 9;
    rect(x, y, 2, 2, '#f8f8f8');
  }

  // ---------------------------------------------------------------- street life & random events
  const EVT = { next: 12, nextWalker: 0 };
  const NPC_TALK = {
    walker: ['ОГО, ОФИС НЕ СПИТ', 'КТО ТАМ РАБОТАЕТ?', 'ЗАЙДУ ЗА КОФЕ', 'ХОРОШАЯ ПОГОДКА', 'ТУТ ВАЙ-ФАЙ ЕСТЬ?', 'КРАСИВЫЙ ОФИС', 'ОПЯТЬ ОПАЗДЫВАЮ', 'ГДЕ ТУТ МЕТРО?', 'ТАМ КОТ В ОКНЕ!', 'ХОЧУ ТУТ РАБОТАТЬ', 'ПИКСЕЛЬНЫЙ ГОРОД...', 'ЧТО ЗА ШУМ?', 'ЗАБЫЛ ЗОНТ', 'ОТСЮДА ПАХНЕТ КОФЕ'],
    kid: ['МАМ, СМОТРИ, РОБОТЫ!', 'У МЕНЯ ШАРИК!', 'ХОЧУ МОРОЖЕНОЕ', 'А КОТ НАСТОЯЩИЙ?', 'Я БУДУ ПРОГРАММИСТОМ!', 'ПОЧЕМУ НЕБО СИНЕЕ?', 'ДОГОНЯЙ!', 'ХОЧУ ЩЕНКА', 'А РОБОТЫ ЕДЯТ?', 'ШАРИК, НЕ УЛЕТАЙ!'],
    pet: ['ГУЛЯЕМ, МУРЗИК', 'НЕ ТЯНИ!', 'КОТ НА ПОВОДКЕ - НОРМ', 'ФУ! БРОСЬ!', 'ХОРОШИЙ МАЛЬЧИК', 'ДОМОЙ, ДОМОЙ', 'НЕ НЮХАЙ ЭТО', 'ГУЛЯЕМ ДО УГЛА', 'КТО ХОЧЕТ ВКУСНЯШКУ?'],
    jogger: ['ФУХ-ФУХ', 'ЕЩЁ КРУГ', 'ДЫШИМ...', 'ПЯТЫЙ КИЛОМЕТР!', 'НЕ СДАВАТЬСЯ', 'ГДЕ МОЯ ВОДА?'],
    pizza: ['ПИЦЦУ ЗАКАЗЫВАЛИ?', 'ДОСТАВКА! ГОРЯЧАЯ!', 'ПЕППЕРОНИ НА ОФИС', 'ЕДВА ДОВЁЗ, ОНА ПАХНЕТ'],
    thanks: ['О, ПИЦЦА! СПАСИБО!', 'ПИЦЦА! ЛУЧШИЙ ДЕНЬ', 'ДАВАЙТЕ СЮДА!', 'УРА, ОБЕД!'],
    share: ['НАЛЕТАЙТЕ, ПОКА ГОРЯЧАЯ', 'QWEN, ТЕБЕ КУСОЧЕК?', 'КОТУ НЕ ДАВАТЬ!', 'ЕЩЁ КУСОЧЕК И РАБОТАТЬ'],
    flicker: ['ОПЯТЬ ПРОБКИ ВЫБИВАЕТ...', 'КТО ВКЛЮЧИЛ ЧАЙНИК?', 'QWEN, ЭТО ТЫ?', 'СВЕТ, НЕ ПУГАЙ', 'ЭЛЕКТРИК, АУ!', 'ЭТО КОТ ПО ПРОВОДАМ?'],
  };

  // Screensaver: the street around the office stays lively.
  function streetCrowd() {
    if (!saver.on || now < EVT.nextWalker) return;
    EVT.nextWalker = now + 2 + Math.random() * 4;
    if (npcs.length < 3 + Math.floor(saver.BW / 110)) spawnNpc(pick(['walker', 'walker', 'walker', 'pet', 'kid', 'jogger']));
  }

  function edges() {
    return [-14 - (saver.on ? saver.bx : 0), W + 14 + (saver.on ? saver.BW - saver.bx - W : 0)];
  }

  function spawnNpc(kind) {
    const [l, r] = edges();
    const fromLeft = Math.random() < 0.5;
    const n = new Agent({ f: 0, x: fromLeft ? l : r, look: makeExtraLook(7 + Math.floor(Math.random() * 60)), quiet: true, kind, speed: kind === 'jogger' ? 2.2 : 0.8 });
    npcs.push(n);
    const leave = () => n.go({ f: 0, x: fromLeft ? r : l, pose: 'stand' }, () => { n.gone = true; });
    if (kind === 'smoker') {
      n.go({ f: 0, x: Math.round(40 + Math.random() * 40), pose: 'smoke', face: fromLeft ? 1 : -1 }, () => later(12 + Math.random() * 8, leave));
      log('НА УЛИЦЕ КТО-ТО ПЕРЕКУРИВАЕТ');
    } else if (kind === 'jogger') {
      leave();
      n.say(pick(NPC_TALK.jogger), 2.5);
    } else if (kind === 'walker' || kind === 'kid' || kind === 'pet') {
      n.speed = kind === 'kid' ? 1 : 0.55 + Math.random() * 0.35;
      if (kind === 'kid') n.balloon = pick(['#e83838', '#f8d838', '#58a8f8', '#e858a8', '#58c858']);
      if (kind === 'pet') n.pet = true;
      leave();
      if (Math.random() < 0.35) later(2 + Math.random() * 4, () => { if (!n.gone) n.say(pick(NPC_TALK[kind]), 2.4); });
    } else if (kind === 'pizza') {
      n.go({ f: 0, x: 241, pose: 'carry', face: 1 }, () => {
        n.say(pick(NPC_TALK.pizza), 2.5);
        shot(n, 4.5, 0.7);
        openDoor();
        if (isFree(claude)) {
          stopFun(claude);
          claude.go(SPOT.door, () => {
            claude.say(pick(NPC_TALK.thanks), 2.5);
            later(3, () => claude.go(SPOT.coffee, () => claude.say(pick(NPC_TALK.share), 2.5)));
          });
        }
        later(4, leave);
      });
      log('ПРИВЕЗЛИ ПИЦЦУ');
    }
  }

  function launchPlane() {
    const [l, r] = edges();
    const high = saver.on && saver.by > 24;
    scene.plane = { x: l - 10, end: r + 10, y: high ? -TOP - 10 - Math.floor(Math.random() * (saver.by - 20)) : -75 };
    Sound.plane();
  }

  function drawPlane() {
    const p = scene.plane;
    if (!p) return;
    const { x, y } = p;
    rect(x, y + 1, 12, 2, '#e8e8f0');
    rect(x + 11, y + 1, 2, 1, '#c8c8d8');
    rect(x, y - 1, 2, 2, '#c8c8d8');
    rect(x + 5, y + 3, 4, 1, '#a8a8b8');
    rect(x + 4, y, 4, 1, '#a8a8b8');
    for (let i = 2; i < 10; i += 2) rect(x + i, y + 1, 1, 1, '#5878a8');
    if (Math.floor(now * 2) % 2) { rect(x - 1, y + 1, 1, 1, '#f83838'); rect(x + 13, y + 2, 1, 1, '#38f858'); }
  }

  function randomEvents() {
    if (now < EVT.next) return;
    EVT.next = now + 20 + Math.random() * 30;
    const r = Math.random();
    if (r < 0.2 && !scene.plane) { launchPlane(); log('НАД ОФИСОМ ПРОЛЕТЕЛ САМОЛЁТ'); }
    else if (r < 0.4 && !npcs.some((n) => n.kind === 'smoker')) spawnNpc('smoker');
    else if (r < 0.55) spawnNpc('jogger');
    else if (r < 0.65 && !npcs.some((n) => n.kind === 'pizza')) spawnNpc('pizza');
    else if (r < 0.75) {
      scene.flickerUntil = now + 1.4;
      Sound.zap();
      later(1.7, () => (isFree(claude) || !isFree(qwen) ? claude : qwen).say(pick(NPC_TALK.flicker), 2.5));
      log('В ОФИСЕ МОРГНУЛ СВЕТ');
    } else if (isFree(claude)) {
      stopFun(claude);
      startFun(claude, ACTS.find((x) => x.joke));
    }
  }

  // ---------------------------------------------------------------- idle life
  function idleLife() {
    freeTime(claude);
    freeTime(qwen);
    randomEvents();
    streetCrowd();
    // long thinking while busy: back to the desk
    if (C.busy && !C.convo && claude.arrived && now - C.lastEvent > 8 && claude.goalSpot !== SPOT.claudeThink) {
      claudeGo(SPOT.claudeThink, null, 'ДУМАЕТ');
    }
    // cat
    if (cat.arrived && now > (cat.next || 0)) {
      const r = Math.random();
      if (r < 0.25) { cat.go({ f: 2, x: 184, pose: 'sleep' }); cat.next = now + 20 + Math.random() * 15; }
      else if (r < 0.4) { cat.go({ f: claude.f, x: claude.x + (claude.face > 0 ? -12 : 12), pose: 'sit' }, () => { if (Math.random() < 0.5) Sound.meow(); }); cat.next = now + 8; }
      else { const f = pick([1, 2, 3]); cat.go({ f, x: 20 + Math.random() * 216, pose: Math.random() < 0.5 ? 'sit' : 'sleep' }); cat.next = now + 6 + Math.random() * 10; }
    }
    // passing car
    if (scene.carX === null && now > scene.nextCar) {
      scene.carX = -74 - (saver.on ? saver.bx : 0);
      scene.carColor = ['#c83838', '#3858c8', '#f8d838', '#38a048', '#e8e8e8'][Math.floor(Math.random() * 5)];
      Sound.car();
    }
  }

  // ---------------------------------------------------------------- particles
  function puff(x, y, color, vy = -10, life = 1.2, vx = 0) {
    particles.push({ x, y, vx: vx + (Math.random() - 0.5) * 3, vy, life, max: life, color });
  }
  let puffClock = 0;
  function emitParticles(dt) {
    puffClock += dt;
    if (puffClock < 0.18) return;
    puffClock = 0;
    if (Math.random() < 0.35) puff(32 + Math.random() * 2, 89, 'rgba(255,255,255,0.5)', -6, 1.4);
    if (claude.at(SPOT.coffee) || subs.some((s) => s.at && s.at(SPOT.coffee))) puff(207, 175, 'rgba(255,255,255,0.6)', -9, 1.2);
    for (const s of subs) {
      if (!s.arrived || s.leaving) continue;
      if (s.goalPose === 'mix' && Math.random() < 0.8) {
        const fx = s.face > 0 ? s.x - 8 + 13 : s.x + 8 - 14;
        puff(fx, s.y - 24 + 9 + 3, s.look.flask || '#58e070', -12, 0.8);
      } else if (s.bench && s.bench.f === 1 && s.bench.x < 110 && Math.random() < 0.3) {
        puff(s.x + (s.face > 0 ? 6 : -6), 172, ['#58e070', '#e85898', '#58a8f8'][Math.floor(Math.random() * 3)], -10, 0.7);
      }
    }
    for (const a of [qwen, claude]) {
      if (a.pose === 'sleep' && a.arrived && Math.random() < 0.25) particles.push({ x: a.x + 4, y: a.y - 18, vx: 4, vy: -6, life: 2.2, max: 2.2, z: true });
    }
    for (const n of npcs) {
      if (n.pose === 'smoke' && Math.random() < 0.6) puff(n.x + n.face * (n.frame() ? 4 : 2), n.y - (n.frame() ? 16 : 7), 'rgba(220,220,230,0.6)', -7, 1.8, n.face * 2);
    }
    const f = fun.get(claude);
    if (f && f.act.drops && claude.arrived) puff(claude.x - 9, claude.y - 9, '#58a8f8', 14, 0.5);
    if (cat.catPose === 'sleep' && cat.arrived && Math.random() < 0.12) particles.push({ x: cat.x + 3, y: cat.y - 8, vx: 3, vy: -5, life: 1.6, max: 1.6, z: true, small: true });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    now += dt;
    Runner.update(dt);
    updateCam(dt);
    runTimers();
    applyQueued();
    idleLife();
    claude.update(dt);
    qwen.update(dt);
    for (const s of subs) s.update(dt);
    updateHelpers(dt);
    for (const n of npcs) n.update(dt);
    npcs = npcs.filter((n) => !n.gone);
    cat.update(dt);
    updatePong(dt);
    if (scene.plane) {
      scene.plane.x += 22 * dt;
      if (scene.plane.x > scene.plane.end) scene.plane = null;
    }
    for (const a of [claude, qwen]) {
      if (a.pose === 'throw' && a.arrived) {
        const fr = a.frame();
        if (fr === 1 && a.lastThrow === 0) Sound.dart();
        a.lastThrow = fr;
      }
    }
    cat.catPose = cat.arrived ? cat.goalPose : 'walk';
    if (scene.carX !== null) {
      scene.carX += 38 * dt;
      const right = W + 4 + (saver.on ? saver.BW - saver.bx - W : 0);
      if (scene.carX > right) { scene.carX = null; scene.nextCar = now + (saver.on ? 8 : 25) + Math.random() * 30; }
    }
    emitParticles(dt);
    updateAmbience(dt);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);

    // ambient typing sounds
    if (claude.pose === 'type' && C.busy && Math.random() < dt * 7) Sound.key(0.03);
    if (qwen.pose === 'type' && Math.random() < dt * 9) Sound.key(0.018);
  }

  // ---------------------------------------------------------------- weather and ambience
  const FORCE_RAIN = /[?&]rain\b/.test(location.search);
  const weather = { rain: FORCE_RAIN, next: 90 + Math.random() * 120 };
  let ambClock = 0;
  function focusRoom() {
    if (saver.on || cam.z < 1.3) return null;
    const y = cam.cy - TOP;
    let best = null, bd = 1e9;
    for (const r of ROOMS) {
      const d = Math.abs(cam.cx - (r.x + r.w / 2)) + Math.abs(y - (FLOOR[r.f] - 40));
      if (d < bd) { bd = d; best = r.name; }
    }
    return bd < 60 ? best : null;
  }
  function updateAmbience(dt) {
    if (!FORCE_RAIN && now > weather.next) {
      weather.rain = !weather.rain && Math.random() < 0.45;
      weather.next = now + (weather.rain ? 80 + Math.random() * 120 : 150 + Math.random() * 300);
    }
    ambClock += dt;
    if (ambClock > 0.5) {
      ambClock = 0;
      const h = new Date();
      nightNow = Scene.nightness(h.getHours() + h.getMinutes() / 60) > 0;
      Sound.focus(focusRoom(), Q.status === 'busy');
      Sound.rain(weather.rain);
    }
    const room = focusRoom();
    if (room === 'lab' && Math.random() < dt * 3) Sound.bubbling();
    if (room === 'games' && funOn('arcade') && Math.random() < dt * 4) Sound.blip();
  }
  function drawRain() {
    if (!weather.rain) return;
    for (let i = 0; i < 80; i++) {
      const ph = (now * 1.9 + i * 0.137) % 1;
      const x = Math.floor((i * 61.3 + ph * 8) % W);
      const y = 200 + ph * 22;
      rect(x, y, 1, 4, 'rgba(196,220,255,0.85)');
      if (ph > 0.88) { rect(x - 1, y + 3, 1, 1, 'rgba(200,225,255,0.7)'); rect(x + 1, y + 3, 1, 1, 'rgba(200,225,255,0.7)'); }
    }
    for (let i = 0; i < 20; i++) {
      const ph = (now * 2.1 + i * 0.31) % 1;
      rect(Math.floor((i * 47.7 + ph * 6) % W), -76 + ph * 8, 1, 2, 'rgba(176,206,255,0.55)');
    }
  }

  // Click a character: it waves and tells what it is doing (cat: purrs).
  function poke(a) {
    if (a === cat) {
      Sound.meow();
      for (let i = 0; i < 4; i++) puff(cat.x + (Math.random() - 0.5) * 8, cat.y - 10, 'rgba(248,120,160,0.95)', -10 - Math.random() * 6, 1.2, (Math.random() - 0.5) * 8);
      return;
    }
    const sleeping = a.pose === 'sleep';
    let text = 'ПРИВЕТ!';
    if (a === claude) text = C.convo ? 'ГОВОРЮ С QWEN' : C.busy && C.lastDetail ? C.lastDetail : 'ОТДЫХАЮ, ЗАХОДИ';
    else if (a === qwen) text = { offline: 'ZZZ... ЗАПУСТИ МЕНЯ', loading: 'ГРУЗИТСЯ ДИСК...', idle: 'Я ТУТ, СПРАШИВАЙ', busy: 'ДУМАЮ, НЕ МЕШАЙ' }[Q.status] || 'ПРИВЕТ!';
    else if (a.label) text = a.label;
    if (!sleeping) a.override = { pose: 'wave', until: now + 1.8 };
    a.feel(sleeping ? 'yawn' : 'happy', 1.8);
    a.say(FONT.norm ? plain(text, 40) || text : text, 3);
  }
  canvas.addEventListener('click', (e) => {
    if (saver.on || Runner.on) return;
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) * canvas.width) / r.width, py = ((e.clientY - r.top) * canvas.height) / r.height;
    const z = cam.z, vw = W / z, vh = H / z;
    const vx = Math.min(Math.max(cam.cx - vw / 2, 0), W - vw), vy = Math.min(Math.max(cam.cy - vh / 2, 0), H - vh);
    const x = px / (z * S) + vx, y = py / (z * S) + vy - TOP;
    const list = [claude, qwen, ...subs, ...helpers];
    const hit = list.reverse().find((a) => a.alpha > 0.5 && Math.abs(x - a.x) <= 7 && y >= a.y - 27 && y <= a.y + 1);
    if (hit) { Sound.init(); poke(hit); return; }
    if (Math.abs(x - cat.x) <= 9 && y >= cat.y - 12 && y <= cat.y + 1) { Sound.init(); poke(cat); }
  });

  // ---------------------------------------------------------------- camera
  // The view is a rectangle of the canvas (logical px, HUD strip included). Mostly the whole
  // building; it zooms on Qwen's room while Claude talks to Qwen (so bubbles are easy to read),
  // and now and then on a room or a person when something happens.
  const CAM_ROOM_Z = 2;
  const CAM_CONVO_Z = 1.5;
  const cam = { cx: W / 2, cy: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, until: 0, cool: 20, follow: null, on: true };
  try { cam.on = localStorage.getItem('office.cam') !== '0'; } catch {}
  // zoom that keeps S*z a whole number, so pixels stay square once the camera settles
  const snapZ = (z) => Math.max(1, Math.round(S * z) / S);
  const camRoom = (name) => {
    const r = ROOMS.find((x) => x.name === name);
    return { x: r.x + r.w / 2, y: FLOOR[r.f] - 40 + TOP };
  };
  const camRoomOf = (a) => {
    const r = ROOMS.find((x) => x.f === a.f && a.x >= x.x && a.x < x.x + x.w);
    return r ? camRoom(r.name) : { x: a.x, y: a.y - 26 + TOP };
  };

  // One shot: `at` is {x, y} in canvas coords or an Agent to follow; chance < 1 keeps most of the time on the wide frame.
  function shot(at, hold, chance = 1, z = CAM_ROOM_Z) {
    if (!cam.on || saver.on || C.convo || now < cam.cool || Math.random() > chance) return false;
    cam.follow = at instanceof Agent ? at : null;
    const p = cam.follow ? { x: at.x, y: at.y - 26 + TOP } : at;
    Object.assign(cam, { tx: p.x, ty: p.y, tz: snapZ(z), until: now + hold, cool: now + hold + 18 + Math.random() * 25 });
    return true;
  }

  function updateCam(dt) {
    if (saver.on || !cam.on || Runner.on) { Object.assign(cam, { cx: W / 2, cy: H / 2, z: 1, tz: 1, until: 0 }); return; }
    if (C.convo) {
      const p = camRoom('qwen');
      Object.assign(cam, { tx: p.x, ty: p.y + 6, tz: snapZ(CAM_CONVO_Z), follow: null, until: now + 1 });
    } else if (now > cam.until) {
      Object.assign(cam, { tx: W / 2, ty: H / 2, tz: 1, follow: null });
    } else if (cam.follow) {
      cam.tx = cam.follow.x;
      cam.ty = cam.follow.y - 26 + TOP;
    }
    // now and then, when nothing else is going on: a look at a random room or a person
    if (!C.convo && now > cam.until && now > cam.cool && Math.random() < dt * 0.04) {
      const r = Math.random();
      if (r < 0.3) shot(r < 0.1 ? claude : r < 0.2 ? qwen : cat, 5);
      else shot(camRoom(pick(['claude', 'qwen', 'lab', 'server', 'kitchen', 'rec', 'games'])), 6);
    }
    const k = 1 - Math.exp(-dt * 3.5);
    cam.cx += (cam.tx - cam.cx) * k;
    cam.cy += (cam.ty - cam.cy) * k;
    cam.z += (cam.tz - cam.z) * k;
    if (Math.abs(cam.z - cam.tz) < 0.003) cam.z = cam.tz;
  }

  function applyCam() {
    const z = cam.z;
    const vw = W / z, vh = H / z;
    const vx = Math.min(Math.max(cam.cx - vw / 2, 0), W - vw);
    const vy = Math.min(Math.max(cam.cy - vh / 2, 0), H - vh);
    ctx.scale(z, z);
    ctx.translate(-vx * S, -vy * S);
  }

  // ---------------------------------------------------------------- render
  const rect =(x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S)); };

  // Sprites are 2× the logical box: exact at S=2, smoothed when the window scale is odd.
  function spr(img, x, y, w, h) {
    ctx.imageSmoothingEnabled = S !== 2;
    ctx.drawImage(img, x, y, w, h);
    ctx.imageSmoothingEnabled = false;
  }

  let nightNow = false;
  function lookFor(a) {
    if (a === claude) return nightNow ? Sprites.outfit(a.look, 'pjcap') : a.pose === 'sleep' ? Sprites.outfit(a.look, 'cap') : a.look;
    if (a === qwen) return a.pose === 'sleep' ? Sprites.outfit(a.look, 'pjcap') : nightNow ? Sprites.outfit(a.look, 'pj') : a.look;
    return a.look;
  }
  function exprOf(a) {
    if (a.expr && now < a.exprUntil) return a.expr;
    if (a === qwen && Q.status === 'busy' && !C.convo && performance.now() - (Q.busyAt || 0) > 25000 && a.pose === 'type') return 'frown';
    return undefined;
  }

  function drawAgent(a) {
    if (a.alpha <= 0) return;
    const pose = a.shown();
    const img = Sprites.person(lookFor(a), pose, a.frame(), a.face < 0 ? -1 : 1, {
      expr: exprOf(a), blink: a.anim % 4.3 < 0.12, breath: Math.sin(a.anim * 1.7) > 0.25,
    });
    ctx.globalAlpha = a.alpha;
    spr(img, Math.round((a.x - 8) * S), Math.round((a.y - 24) * S), 16 * S, 24 * S);
    ctx.globalAlpha = 1;
  }

  // Street NPC plus extras: a balloon on a string, or a cat on a leash.
  const UMB = ['#e83838', '#58a8f8', '#f8d838', '#58c858', '#e858a8', '#8858e8'];
  function drawNpc(n) {
    drawAgent(n);
    const hand = n.x + n.face * 4;
    if (weather.rain && !n.balloon) {
      n.umb = n.umb || pick(UMB);
      const ty = n.y - 31, cx = Math.round(n.x);
      rect(hand, ty + 3, 1, 17, '#3a3a44');
      rect(cx - 6, ty + 2, 13, 1, n.umb); rect(cx - 5, ty + 1, 11, 1, n.umb); rect(cx - 3, ty, 7, 1, n.umb);
      rect(cx - 6, ty + 3, 1, 1, '#140c1c'); rect(cx, ty + 3, 1, 1, '#140c1c'); rect(cx + 6, ty + 3, 1, 1, '#140c1c');
      rect(cx - 3, ty, 2, 1, 'rgba(255,255,255,0.45)');
    }
    if (n.balloon) {
      const sway = Math.sin(now * 2 + n.x * 0.1);
      for (let y = 0; y < 12; y++) rect(hand + Math.round(sway * y / 12), n.y - 12 - y, 1, 1, '#c8c8d0');
      const bx = hand + Math.round(sway) - 3, by = n.y - 31;
      rect(bx, by + 1, 7, 6, n.balloon); rect(bx + 1, by, 5, 8, n.balloon); rect(bx + 3, by + 8, 1, 1, n.balloon);
      rect(bx + 1, by + 2, 1, 2, 'rgba(255,255,255,0.6)');
    }
    if (n.pet) {
      const px = n.x - n.face * 13;
      const img = Sprites.cat(n.arrived ? 'sit' : 'walk', Math.floor(n.dist / 3) % 2, n.face < 0 ? -1 : 1);
      spr(img, Math.round((px - 8) * S), Math.round((n.y - 10) * S), 16 * S, 10 * S);
      const x0 = hand, y0 = n.y - 11, x1 = px + n.face * 4, y1 = n.y - 6;
      for (let i = 0; i <= 8; i++) rect(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8 + Math.sin((i / 8) * Math.PI) * 2, 1, 1, '#c83838');
    }
  }

  function drawCat() {
    const pose = cat.catPose === 'walk' ? 'walk' : cat.catPose;
    const f = pose === 'walk' ? Math.floor(cat.dist / 3) % 2 : 0;
    if (cat.pose === 'climb') return drawCatClimb();
    const img = Sprites.cat(pose, f, cat.face < 0 ? -1 : 1);
    spr(img, Math.round((cat.x - 8) * S), Math.round((cat.y - 10) * S), 16 * S, 10 * S);
  }
  function drawCatClimb() {
    const img = Sprites.catClimb(Math.floor(cat.climbDist / 3) % 2);
    spr(img, Math.round((cat.x - 6) * S), Math.round((cat.y - 16) * S), 12 * S, 16 * S);
  }

  function headTop(a) {
    const seated = ['sit', 'type', 'think', 'sleep'].includes(a.pose);
    return a.y - 24 + (seated ? 3 : 0);
  }

  // Speech bubbles: measured first, then pushed apart so two people talking
  // side by side get their bubbles on their own sides instead of on top of each other.
  function bubbleBox(a, lo, hi) {
    const b = a.bubble;
    if (!b || now > b.until || a.alpha < 0.5) return null;
    const lines = FONT.wrap(FONT.norm(b.text), 18, 3);
    const w = Math.max(...lines.map((l) => l.length)) * 6 + 5;
    const h = lines.length * 9 + 3;
    const bx = Math.min(Math.max(a.x - w / 2, lo), hi - w);
    const by = Math.max(headTop(a) - h - 5, -TOP + 13);
    return { a, b, lines, w, h, bx, by };
  }

  function drawBubbles(list) {
    const lo = saver.on ? 2 - saver.bx : 2;
    const hi = saver.on ? saver.BW - saver.bx - 2 : W - 2;
    const boxes = list.map((a) => bubbleBox(a, lo, hi)).filter(Boolean).sort((p, q) => p.a.x - q.a.x);
    const clamp = (k) => { k.bx = Math.min(Math.max(k.bx, lo), hi - k.w); };
    const hits = (p, q) => p.bx < q.bx + q.w + 2 && q.bx < p.bx + p.w + 2 && p.by < q.by + q.h + 4 && q.by < p.by + p.h + 4;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const L = boxes[i], Rb = boxes[j];
          if (!hits(L, Rb)) continue;
          const was = [L.bx, Rb.bx];
          const ov = L.bx + L.w + 3 - Rb.bx;
          L.bx -= ov / 2; Rb.bx += ov / 2;
          clamp(L); clamp(Rb);
          // one hit the screen edge: the other takes the whole shift
          if (hits(L, Rb)) { Rb.bx = L.bx + L.w + 3; clamp(Rb); }
          if (hits(L, Rb)) { L.bx = Rb.bx - L.w - 3; clamp(L); }
          // a bubble must stay over its speaker, otherwise stack them instead
          const away = (k) => k.a.x < k.bx - 1 || k.a.x > k.bx + k.w + 1;
          if (away(L) || away(Rb)) { [L.bx, Rb.bx] = was; }
          if (hits(L, Rb)) {
            // no room on the sides: the newer bubble goes above the older one
            const [old, neu] = L.b.start <= Rb.b.start ? [L, Rb] : [Rb, L];
            neu.by = old.by - neu.h - 6;
          }
        }
      }
    }
    // lifted bubbles first, so their stalks go behind the lower ones
    for (const k of boxes.sort((p, q) => p.by - q.by)) drawBubble(k);
  }

  function drawBubble({ a, b, lines, w, h, bx, by }) {
    const total = lines.join('').length;
    const shown = Math.min(total, Math.floor((now - b.start) * 45));
    if (shown > b.shown) { if (shown % 3 === 0 && !a.quiet) Sound.blip(); b.shown = shown; }
    const ox = Math.round(bx * S), oy = Math.round(by * S);
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * S, oy + y * S, ww * S, hh * S); };
    const think = b.kind === 'think';
    const fill = think ? '#e8eeff' : '#f8f8f8';
    R(1, 0, w - 2, h, OUTLINE); R(0, 1, w, h - 2, OUTLINE);
    R(1, 1, w - 2, h - 2, fill);
    const tx = Math.round(Math.min(Math.max(a.x - bx, 4), w - 5));
    if (think) {
      R(tx - 1, h + 1, 3, 2, OUTLINE); R(tx, h + 1, 1, 1, fill);
      R(tx + 1, h + 4, 2, 2, OUTLINE);
    } else {
      R(tx - 2, h - 1, 5, 1, fill); R(tx - 1, h, 3, 1, fill); R(tx, h + 1, 1, 1, fill);
      R(tx - 3, h - 1, 1, 1, OUTLINE); R(tx + 3, h - 1, 1, 1, OUTLINE);
      R(tx - 2, h, 1, 1, OUTLINE); R(tx + 2, h, 1, 1, OUTLINE);
      R(tx - 1, h + 1, 1, 1, OUTLINE); R(tx + 1, h + 1, 1, 1, OUTLINE); R(tx, h + 2, 1, 1, OUTLINE);
      // bubble lifted above a neighbour's: a dotted stalk down to the speaker
      const gap = Math.floor(headTop(a) - 3 - (by + h + 3));
      for (let y = 0; y < gap; y += 2) R(tx, h + 3 + y, 1, 1, OUTLINE);
    }
    let left = shown;
    lines.forEach((line, i) => {
      if (left <= 0) return;
      const part = line.slice(0, left);
      left -= line.length;
      FONT.draw(ctx, part, ox + 3 * S, oy + (2 + i * 9) * S, think ? '#3a3a6a' : '#1a1028', S);
    });
  }

  function drawTpsSign() {
    if (Q.status !== 'busy' || (qwen.bubble && now < qwen.bubble.until)) return;
    const text = `${Q.tps ? Q.tps.toFixed(1) : '...'} Т/С`;
    const w = FONT.width(text) + 4;
    const x = qwen.x - w / 2, y = headTop(qwen) - 12;
    rect(x, y, w, 10, OUTLINE);
    rect(x + 1, y + 1, w - 2, 8, '#0c2a18');
    FONT.draw(ctx, text, Math.round((x + 2) * S), Math.round((y + 2) * S), '#58f888', S);
  }

  function drawToolSign() {
    if (!C.busy || C.tools < 1 || (claude.bubble && now < claude.bubble.until) || claude.pose === 'sleep') return;
    const text = `${C.tools} ИНСТР`;
    const w = FONT.width(text) + 4;
    const x = claude.x - w / 2, y = headTop(claude) - 12;
    rect(x, y, w, 10, OUTLINE);
    rect(x + 1, y + 1, w - 2, 8, '#2a1608');
    FONT.draw(ctx, text, Math.round((x + 2) * S), Math.round((y + 2) * S), '#f8b058', S);
  }

  function drawHud() {
    const hy = (-TOP + 2) * S;
    rect(0, -TOP, W, 12, '#000');
    rect(0, -TOP + 11, W, 1, '#2a2a38');
    const who = helpers.length ? `CLAUDE+${helpers.length}` : 'CLAUDE';
    const left = `${who} ▸ ${C.activity}`;
    FONT.draw(ctx, left, 3 * S, hy, '#f8f8f8', S);
    FONT.draw(ctx, who, 3 * S, hy, '#f89858', S);
    const qs = { offline: ['СПИТ', '#e85858'], loading: ['ГРУЗИТСЯ', '#f8d838'], idle: ['ГОТОВ', '#58f888'], busy: [`${Q.tps ? Q.tps.toFixed(1) : '...'} Т/С`, '#58f888'] }[Q.status];
    const right = `QWEN ● ${qs[0]}`;
    const rx = W - 3 - FONT.width(right);
    FONT.draw(ctx, 'QWEN', rx * S, hy, '#b898f8', S);
    FONT.draw(ctx, '●', (rx + 30) * S, hy, qs[1], S);
    FONT.draw(ctx, qs[0], (rx + 42) * S, hy, qs[1], S);
    // tool counter + activity chart (last 2 hours, 5-minute bars)
    const cx = 3 + FONT.width(left) + 8, tl = `${C.tools}`;
    if (cx + FONT.width(tl) + 32 > rx - 4) return;
    FONT.draw(ctx, tl, cx * S, hy, '#f8d838', S);
    const bx = cx + FONT.width(tl) + 6, k = actKey();
    rect(bx, -TOP + 10, 24, 1, '#2a2a38');
    for (let i = 0; i < 24; i++) {
      const v = act[k - 23 + i] || 0;
      if (v) rect(bx + i, -TOP + 10 - Math.min(8, Math.ceil(v / 3)), 1, Math.min(8, Math.ceil(v / 3)), i === 23 ? '#f8d838' : '#f89858');
    }
  }

  // ---------------------------------------------------------------- screensaver
  const saver = { on: false, bx: 0, by: 0, ox: 0, oy: 0, BW: W, BH: H, normalS: S, since: 0, start: null };
  const back = document.createElement('canvas');
  const bctx = back.getContext('2d');

  function layoutSaver() {
    const dpr = devicePixelRatio || 1;
    const sw = Math.round(innerWidth * dpr), sh = Math.round(innerHeight * dpr);
    canvas.width = sw;
    canvas.height = sh;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    S = Math.max(1, Math.floor(Math.min(sw / W, sh / H)));
    saver.bx = Math.floor((sw - W * S) / 2 / S);
    saver.by = Math.floor((sh - H * S) / 2 / S);
    saver.ox = saver.bx * S;
    saver.oy = saver.by * S;
    saver.BW = Math.ceil(sw / S);
    saver.BH = Math.ceil(sh / S);
    back.width = saver.BW;
    back.height = saver.BH;
  }

  function setSaver(on) {
    if (on === saver.on) return;
    saver.on = on;
    if (on && C.out) backIn();
    document.body.classList.toggle('saver', on);
    Sound.setSuspended(on);
    if (on) {
      saver.normalS = S;
      saver.since = performance.now();
      saver.start = null;
      requestAnimationFrame(layoutSaver);
      setTimeout(layoutSaver, 250);
      log('ЗАСТАВКА: ОФИС РАБОТАЕТ');
    } else {
      S = saver.normalS;
      applyScale();
    }
  }

  function wakeFromSaver(e) {
    if (!saver.on || performance.now() - saver.since < 1500) return;
    if (e && e.type === 'mousemove') {
      if (!saver.start) { saver.start = [e.screenX, e.screenY]; return; }
      if (Math.hypot(e.screenX - saver.start[0], e.screenY - saver.start[1]) < 10) return;
    }
    if (api) api.exitSaver();
    else setSaver(false);
  }
  for (const t of ['mousemove', 'mousedown', 'wheel', 'touchstart']) addEventListener(t, wakeFromSaver, { passive: true });

  function render() {
    if (Runner.on && !saver.on) { Runner.draw(ctx, S, { busy: C.busy, activity: C.activity, drawOffice: (dx) => renderBuilding({ dx, bare: true }) }); return; }
    if (!saver.on) { renderBuilding(); return; }
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    Scene.drawBackdrop(bctx, saver.BW, saver.BH, saver.bx, saver.by, now, hour, scene.carX, scene.carColor);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(back, 0, 0, saver.BW * S, saver.BH * S);
    ctx.save();
    ctx.translate(saver.ox, saver.oy);
    renderBuilding();
    ctx.restore();
  }

  // o.dx shifts the office left (runner intro); o.bare skips the vignette and the HUD
  function renderBuilding(o = {}) {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.drawImage(Scene.bg, 0, 0);
    wctx.setTransform(1, 0, 0, 1, 0, TOP);
    const dyn = {
      tvOn: funOn('tv'),
      arcadeOn: funOn('arcade'),
      score: pong.score,
      t: now,
      hour,
      claudeScreen: claude.at(SPOT.web) ? 'web' : C.busy ? 'code' : 'idle',
      qwenStatus: Q.status,
      serverBusy: claude.at(SPOT.server),
      doorOpen: now < scene.doorUntil,
      phoneRing: now < scene.phoneUntil,
      coffeeOn: claude.at(SPOT.coffee),
      carX: scene.carX,
      carColor: scene.carColor,
      flicker: now < scene.flickerUntil,
    };
    Scene.drawDynamic(wctx, dyn);
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    applyCam();
    if (o.dx) ctx.translate(-Math.round(o.dx * S), 0);
    ctx.drawImage(world, 0, 0, W * S, H * S);

    ctx.save();
    ctx.translate(0, TOP * S);
    drawPlane();
    drawCat();
    const people = [qwen, ...subs, ...helpers, claude].sort((a, b) => a.y - b.y);
    Light.shadows(ctx, S, [...people, cat]);
    for (const a of people) drawAgent(a);
    ctx.drawImage(Scene.fg, 0, -TOP * S, W * S, H * S);
    drawBall();

    for (const p of particles) {
      const k = p.life / p.max;
      if (p.z) {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        FONT.draw(ctx, 'Z', Math.round(p.x * S), Math.round(p.y * S), '#c8d8ff', p.small ? Math.max(1, S - 1) : S);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        rect(p.x, p.y, 1, 1, p.color);
        ctx.globalAlpha = 1;
      }
    }

    Light.draw(ctx, S, dyn);

    // Qwen's room goes dark while the model is offline
    if (Q.status === 'offline') rect(146, 24, 104, 80, 'rgba(6,4,24,0.45)');
    // power flicker
    if (now < scene.flickerUntil && Math.sin(now * 37) > 0) rect(6, -64, 244, 256, 'rgba(0,0,12,0.6)');

    drawRain();
    for (const a of npcs) drawNpc(a); // street people walk in front of the building
    if (scene.carX !== null) {
      // the road is nearer than the sidewalk, so the car passes in front of people
      const night = Scene.nightness(new Date().getHours() + new Date().getMinutes() / 60) > 0;
      ctx.drawImage(Scene.carSprite(scene.carColor, night), Math.round(scene.carX * S), 200 * S, 72 * S, 24 * S);
    }
    drawTpsSign();
    drawToolSign();
    drawBubbles([...npcs, cat, ...subs, ...helpers, qwen, claude]);
    ctx.restore();
    ctx.restore(); // camera

    if (o.bare) return;
    if (!saver.on) Light.vignette(ctx, W * S, H * S);

    // the HUD stays put, whatever the camera does
    ctx.save();
    ctx.translate(0, TOP * S);
    drawHud();
    ctx.restore();
  }

  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- demo
  function runDemo() {
    const steps = [
      [0, { type: 'prompt', text: 'СДЕЛАЙ ОФИС' }],
      [3, { type: 'tool', tool: 'Read', detail: 'GAME.JS' }],
      [7, { type: 'tool', tool: 'Grep', detail: 'SPRITES' }],
      [10, { type: 'spawn', id: 'demo-1', label: 'ИЩУ БАГИ' }],
      [12, { type: 'tool', tool: 'Edit', detail: 'SCENE.JS' }],
      [14, { type: 'spawn', id: 'demo-2', label: 'ПРОВЕРЯЮ ТЕСТЫ' }],
      [15, { agent: 'qwen', type: 'status', status: 'loading' }],
      [17, { type: 'sub_tool', id: 'demo-1', tool: 'Read', detail: 'MAIN.JS' }],
      [19, { type: 'tool', tool: 'Bash', detail: 'NPM START' }],
      [23, { agent: 'qwen', type: 'status', status: 'idle' }],
      [25, { type: 'tool', tool: 'WebSearch', detail: 'NES PALETTE' }],
      [29, { type: 'qwen_ask', text: 'QWEN, КАК НАЗВАТЬ КОТА?' }],
      [33, { agent: 'qwen', type: 'status', status: 'busy', tps: 7.4 }],
      [34, { type: 'qwen_progress', thinking: true }],
      [37, { agent: 'qwen', type: 'status', status: 'busy', tps: 7.9 }],
      [38, { type: 'qwen_progress', text: 'ПУСТЬ БУДЕТ...' }],
      [40, { agent: 'qwen', type: 'status', status: 'idle' }],
      [40.2, { type: 'qwen_reply', text: 'ПУСТЬ БУДЕТ ПИКСЕЛЬ!', tps: 7.9 }],
      [43, { type: 'sub_done', id: 'demo-1' }],
      [47, { type: 'sub_done', id: 'demo-2' }],
      [55, { type: 'done' }],
    ];
    Q.demoUntil = now + 62;
    for (const [t, ev] of steps) later(t, () => handle({ agent: 'claude', ...ev }, true));
    later(62, () => { Q.demoUntil = 0; });
  }

  // ---------------------------------------------------------------- UI
  const btn = (id) => document.getElementById(id);
  const scaleBtn = btn('scale'), soundBtn = btn('sound'), pinBtn = btn('pin'), saverBtn = btn('saver');

  const SAVER_STEPS = [0, 1, 2, 3, 5, 10, 15, 30];
  let saverMinutes = 2;
  try { const v = localStorage.getItem('office.saverMinutes2'); if (v !== null) saverMinutes = Number(v); } catch {}
  function syncSaver() {
    saverBtn.textContent = saverMinutes ? `◷ ${saverMinutes} МИН` : '◷ ВЫКЛ';
    saverBtn.classList.toggle('off', !saverMinutes);
    try { localStorage.setItem('office.saverMinutes2', String(saverMinutes)); } catch {}
    if (api) api.setSaverMinutes(saverMinutes);
  }
  saverBtn.onclick = () => {
    saverMinutes = SAVER_STEPS[(SAVER_STEPS.indexOf(saverMinutes) + 1) % SAVER_STEPS.length];
    syncSaver();
  };
  if (api) api.onSaver(setSaver);
  // Live countdown on the button so it's visible whether idle time is being counted.
  if (api && api.onSaverStatus) {
    api.onSaverStatus((st) => {
      if (!saverMinutes || st.on) return;
      const left = saverMinutes * 60 - st.idle;
      if (st.blocked) {
        saverBtn.textContent = st.blocked === 'video' ? '◷ ПАУЗА: ВИДЕО' : '◷ ПАУЗА: ИГРА';
      } else if (st.idle >= 10 && left > 0) {
        saverBtn.textContent = `◷ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      } else {
        saverBtn.textContent = `◷ ${saverMinutes} МИН`;
      }
      saverBtn.title = `Простой: ${st.idle} с. Датчик Windows: ${st.probe ? 'работает' : 'не отвечает, считаю по Electron'}. S - включить заставку сейчас.`;
    });
  }

  function applyScale() {
    if (saver.on) { layoutSaver(); return; }
    if (!api) {
      const fit = Math.max(1, Math.floor(Math.min(innerWidth / W, (innerHeight - 20) / H)));
      S = Math.min(S, fit);
    }
    canvas.width = W * S;
    canvas.height = H * S;
    canvas.style.width = `${W * S}px`;
    canvas.style.height = `${H * S}px`;
    scaleBtn.textContent = `×${S}`;
    try { localStorage.setItem('office.scale', String(S)); } catch {}
    if (api) api.setScale(S);
  }
  function setScale(s) { S = s; applyScale(); }
  function syncSoundBtn() {
    soundBtn.textContent = Sound.muted ? '♪ ВЫКЛ' : '♪ ВКЛ';
    soundBtn.classList.toggle('off', Sound.muted);
  }
  function toggleSound() { Sound.init(); Sound.setMuted(!Sound.muted); syncSoundBtn(); }

  scaleBtn.onclick = () => setScale(S === 2 ? 3 : S === 3 ? 1 : 2);
  soundBtn.onclick = toggleSound;
  btn('demo').onclick = () => { Sound.init(); runDemo(); };
  btn('game').onclick = (e) => { Sound.init(); e.currentTarget.blur(); if (Runner.on) backIn(); else runOut(); };
  pinBtn.onclick = async () => { if (api) pinBtn.classList.toggle('off', !(await api.togglePin())); };
  btn('min').onclick = () => api && api.minimize();
  btn('close').onclick = () => api && api.close();
  addEventListener('pointerdown', () => Sound.init());
  addEventListener('keydown', (e) => {
    Sound.init();
    if (saver.on) { wakeFromSaver(e); return; }
    // runner mini-game: it takes all the keys while it's on; Space in the office starts it
    if (Runner.on) {
      e.preventDefault();
      if (Runner.key(e)) backIn();
      return;
    }
    if (e.key === ' ') { e.preventDefault(); runOut(); return; }
    const k = e.key.toLowerCase();
    if (k === 's' || k === 'ы') { if (api) api.enterSaver(); else setSaver(true); }
    if (k === 'm' || k === 'ь') toggleSound();
    if (k === 'd' || k === 'в') runDemo();
    if (k === 'c' || k === 'с') { cam.on = !cam.on; try { localStorage.setItem('office.cam', cam.on ? '1' : '0'); } catch {} }
    if (k === '1' || k === '2' || k === '3') setScale(Number(k));
  });
  addEventListener('keyup', (e) => Runner.keyUp(e));
  addEventListener('resize', () => { if (!api) applyScale(); });

  if (api) Sound.init();
  syncSoundBtn();
  syncSaver();
  applyScale();
  // Test hooks for the devtools / built-in browser: __office.fun('pong'), __office.spawnNpc('pizza'), __office.launchPlane()...
  window.__office = {
    handle, runDemo, setSaver, shot, runner: Runner, runOut, backIn,
    step: (sec) => { for (let i = 0; i < sec * 60; i++) update(1 / 60); render(); }, // fast-forward (for a hidden preview) cam, camRoom, startFun, stopFun, spawnNpc, launchPlane, randomEvents, scene, npcs: () => npcs, who: () => ({ claude, qwen, cat, helpers, subs }),
    fun: (id, who = claude) => { stopFun(who); startFun(who, id ? ACTS.find((x) => x.id === id) : undefined); },
    weather, poke, feel: (who, e, sec = 3) => (who || claude).feel(e, sec), act,
    flicker: () => { scene.flickerUntil = now + 1.4; Sound.zap(); },
    go: (f, x, who = claude) => who.go({ f, x, pose: 'stand' }),
    acts: () => ACTS.map((x) => x.id),
    state: () => ({
      claude: { x: claude.x, f: claude.f, pose: claude.pose, arrived: claude.arrived },
      qwen: { x: qwen.x, f: qwen.f, pose: qwen.pose, status: Q.status },
      fun: [...fun].map(([b, f]) => `${b.look.name}:${f.act.id}`),
      pong: { on: pong.on, seg: pong.seg, score: pong.score },
      npcs: npcs.map((n) => `${n.kind}@${Math.round(n.x)}`),
      plane: scene.plane && Math.round(scene.plane.x),
      subs: subs.length,
      helpers: helpers.map((h) => `${h.look.name}@${h.f}:${Math.round(h.x)}${h.leaving ? ' leaving' : ''}`),
      log: history.slice(-4),
    }),
  };
  requestAnimationFrame(frame);
})();
