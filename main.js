// AgentOffice.exe --office-hook: Claude Code calls the exe itself as the hook (no Node needed).
// Electron's main process can't read stdin, so the exe re-runs itself in plain Node mode with the same pipes.
if (process.argv.includes('--office-hook')) {
  require('child_process').spawnSync(process.execPath, [require('path').join(__dirname, 'hooks', 'office-hook.js')], {
    stdio: 'inherit', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exit(0);
}

const { app, BrowserWindow, ipcMain, screen, powerMonitor, globalShortcut, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./server');
const hooks = require('./install-hooks');

const W = 256;
const H = 312;
const BAR = 20;
let win = null;
let pinned = true;
let quitting = false;

// Screensaver mode: after N idle minutes the window covers the whole display,
// any mouse/keyboard activity puts it back into its corner.
// It never starts over a full-screen game/app or while something keeps the display on (video).
const saver = { on: false, minutes: 2, since: 0, bounds: null };

// Windows probe (saver-probe.ps1): idle seconds, full-screen state, display-required flag.
let probe = { ok: false, at: 0, idle: 0, state: 0, es: 0 };
function startProbe() {
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'saver-probe.ps1')], { windowsHide: true });
  let buf = '';
  ps.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const [idle, state, es] = buf.slice(0, i).trim().split(' ').map(Number);
      buf = buf.slice(i + 1);
      if (Number.isFinite(idle)) probe = { ok: true, at: Date.now(), idle, state, es };
    }
  });
  ps.on('error', () => { probe.ok = false; });
  ps.on('exit', () => {
    probe.ok = false;
    if (!quitting) setTimeout(startProbe, 5000);
  });
  app.on('before-quit', () => { quitting = true; ps.kill(); });
}

const probeFresh = () => probe.ok && Date.now() - probe.at < 5000;
const idleSeconds = () => (probeFresh() ? probe.idle : powerMonitor.getSystemIdleTime());
function blockedBy() {
  if (!probeFresh()) return null;
  if (probe.state === 2 || probe.state === 3 || probe.state === 4) return 'fullscreen';
  if (probe.es & 0x2) return 'video';
  return null;
}

function enterSaver() {
  if (!win || saver.on) return;
  saver.on = true;
  saver.since = Date.now();
  if (win.isMinimized()) win.restore();
  saver.bounds = win.getBounds();
  const display = screen.getDisplayMatching(saver.bounds);
  win.setResizable(true);
  win.setBounds(display.bounds);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  win.focus();
  win.webContents.send('saver', true);
}

function exitSaver() {
  if (!win || !saver.on) return;
  saver.on = false;
  win.webContents.send('saver', false);
  win.setBounds(saver.bounds);
  win.setResizable(false);
  win.setAlwaysOnTop(pinned, 'floating');
}

setInterval(() => {
  if (!win) return;
  const idle = idleSeconds();
  const blocked = saver.on ? null : blockedBy();
  if (!saver.on && saver.minutes > 0 && !blocked && idle >= saver.minutes * 60) enterSaver();
  else if (saver.on && Date.now() - saver.since > 3000 && idle < 2) exitSaver();
  win.webContents.send('saver-status', { idle, blocked, probe: probeFresh(), on: saver.on });
}, 1000);

function sizeFor(scale) {
  return { width: W * scale, height: H * scale + BAR };
}

function createWindow() {
  const { width, height } = sizeFor(2);
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 16,
    y: Math.max(area.y, area.y + area.height - height - 16),
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    title: 'Agent Office',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// Ctrl+Alt+End hides the office from any app; pressing it again brings it back (without stealing focus).
const HOTKEY = 'Control+Alt+End';
function toggleVisible() {
  if (!win || win.isDestroyed()) return;
  if (saver.on) { exitSaver(); return; }
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else { if (win.isMinimized()) win.restore(); win.showInactive(); }
}

// Packaged exe: offer once to connect to Claude Code, and quietly follow the exe if it was moved.
function connectClaude() {
  if (!app.isPackaged) return;
  const want = hooks.exeCommand(process.execPath);
  const have = hooks.current();
  if (have === want) return;
  const declined = path.join(app.getPath('userData'), 'hooks-declined');
  try {
    if (have && /--office-hook/.test(have)) { hooks.write(want); return; }
    if (fs.existsSync(declined)) return;
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Подключить', 'Не сейчас'],
      defaultId: 0,
      cancelId: 1,
      title: 'Agent Office',
      message: 'Подключить офис к Claude Code?',
      detail: `В ${hooks.FILE} добавятся хуки: офис будет видеть, что делает Claude. Остальные настройки не меняются, копия сохранится рядом (.bak-office).\n\nДействует с нового чата Claude Code.`,
    });
    if (choice === 0) hooks.write(want);
    else fs.writeFileSync(declined, '');
  } catch (e) {
    dialog.showErrorBox('Agent Office', `Не получилось подключить к Claude Code:\n${e.message}`);
  }
}

app.whenReady().then(() => {
  connectClaude();
  createWindow();
  if (!globalShortcut.register(HOTKEY, toggleVisible)) console.error(`hotkey ${HOTKEY} is taken`);
  startProbe();
  startServer((ev) => {
    if (win && !win.isDestroyed()) win.webContents.send('office-event', ev);
  });
});

ipcMain.on('set-scale', (_e, scale) => {
  if (!win || saver.on) return;
  const { width, height } = sizeFor(Math.max(1, Math.min(4, scale | 0)));
  win.setContentSize(width, height);
});
ipcMain.handle('toggle-pin', () => {
  if (!win) return false;
  pinned = !pinned;
  win.setAlwaysOnTop(pinned, 'floating');
  return pinned;
});
ipcMain.on('saver-minutes', (_e, m) => { saver.minutes = Math.max(0, Number(m) || 0); });
ipcMain.on('saver-enter', enterSaver);
ipcMain.on('saver-exit', exitSaver);
ipcMain.on('minimize', () => win && win.minimize());
ipcMain.on('close', () => app.quit());

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
