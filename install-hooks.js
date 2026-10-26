#!/usr/bin/env node
// Connects the office to Claude Code: adds the office hook to ~/.claude/settings.json.
// Safe to run again (old office entries are replaced). Backup: settings.json.bak-office.
//   node install-hooks.js            - install (hook runs through node)
//   node install-hooks.js --remove   - remove the office hooks
// AgentOffice.exe uses the same module and points the hook at itself (--office-hook).
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = process.env.OFFICE_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const EVENTS = {
  SessionStart: null, UserPromptSubmit: null, PreToolUse: '*', PostToolUse: 'Agent|Task',
  SubagentStop: null, Notification: null, Stop: null, PostToolUseFailure: null,
};
const isOffice = (h) => /office-hook/.test(h.command || '');
const slash = (p) => p.replace(/\\/g, '/');

function read() {
  if (!fs.existsSync(FILE)) return { s: {}, raw: null };
  const raw = fs.readFileSync(FILE, 'utf8');
  return { s: raw.trim() ? JSON.parse(raw) : {}, raw };
}

// The office hook command currently in settings, or null.
function current() {
  try {
    const { s } = read();
    for (const groups of Object.values(s.hooks || {})) {
      for (const g of groups) for (const h of g.hooks || []) if (isOffice(h)) return h.command;
    }
  } catch {}
  return null;
}

// command = null removes the office hooks.
function write(command) {
  const { s, raw } = read();
  if (raw !== null) fs.writeFileSync(FILE + '.bak-office', raw);
  else fs.mkdirSync(path.dirname(FILE), { recursive: true });

  s.hooks = s.hooks || {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOffice(h)) }))
      .filter((g) => g.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (command) {
    for (const [ev, matcher] of Object.entries(EVENTS)) {
      const group = { hooks: [{ type: 'command', command, timeout: 3 }] };
      if (matcher) group.matcher = matcher;
      (s.hooks[ev] = s.hooks[ev] || []).push(group);
    }
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n');
}

const nodeCommand = () => `"${slash(process.execPath)}" "${slash(path.join(__dirname, 'hooks', 'office-hook.js'))}"`;
const exeCommand = (exe) => `"${slash(exe)}" --office-hook`;

module.exports = { FILE, current, write, nodeCommand, exeCommand };

if (require.main === module) {
  const remove = process.argv.includes('--remove');
  try {
    write(remove ? null : nodeCommand());
  } catch (e) {
    console.error(`settings.json not changed: ${e.message}`);
    process.exit(1);
  }
  console.log(remove ? `Office hooks removed from ${FILE}` : `Office hooks installed in ${FILE}\n  ${nodeCommand()}`);
}
