// Builds AgentOffice.exe without electron-builder: Electron runtime + our files in resources\app,
// exe renamed and given the icon with rcedit, then zipped for a GitHub release.
//   node build.js [outDir]   (default dist\AgentOffice)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const rceditModule = require('rcedit');
const rcedit = rceditModule.rcedit || rceditModule;

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'dist', 'AgentOffice'));
const DIST = path.join(__dirname, 'node_modules', 'electron', 'dist');
const APP_FILES = ['main.js', 'preload.js', 'server.js', 'install-hooks.js', 'saver-probe.ps1', 'package.json', 'icon.ico', 'renderer', 'hooks', 'bridge/ask-qwen.js'];
const { version } = require('./package.json');

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(DIST, OUT, { recursive: true });
  const exe = path.join(OUT, 'AgentOffice.exe');
  fs.renameSync(path.join(OUT, 'electron.exe'), exe);
  fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });

  const app = path.join(OUT, 'resources', 'app');
  for (const f of APP_FILES) fs.cpSync(path.join(__dirname, f), path.join(app, f), { recursive: true });

  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'version-string': { ProductName: 'Agent Office', FileDescription: 'Agent Office', CompanyName: 'Roma Klipa', OriginalFilename: 'AgentOffice.exe' },
    'file-version': version,
    'product-version': version,
  });

  const zip = path.join(path.dirname(OUT), `AgentOffice-${version}-win-x64.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zip}'`], { stdio: 'inherit' });
  console.log('built', exe, '\nzip  ', zip);
}

main().catch((e) => { console.error(e); process.exit(1); });
