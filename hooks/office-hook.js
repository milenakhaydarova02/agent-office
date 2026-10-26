#!/usr/bin/env node
// Claude Code hook: turns hook payloads (stdin JSON) into office events.
// Never blocks Claude: always exits 0 within ~1s, even if the office is closed.
// Bubbles get plain Russian phrases ("читаю файл game"), never raw paths or commands.
const OFFICE = `http://127.0.0.1:${process.env.OFFICE_PORT || 47321}/event`;
setTimeout(() => process.exit(0), 1200);

// Letters, digits and spaces only.
const plain = (s, n = 40) => {
  const t = String(s || '').replace(/[^0-9A-Za-zА-Яа-яЁё ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') : t;
};
const fileName = (p) => plain((String(p || '').split(/[\\/]/).filter(Boolean).pop() || '').replace(/\.[^.]+$/, ''), 20);
const words = (s, k) => plain(s, 60).split(' ').filter(Boolean).slice(0, k).join(' ');
const host = (u) => { try { return plain(new URL(u).hostname.replace(/^www\./, '').split('.')[0], 20); } catch { return ''; } };
const withName = (phrase, name) => (name ? `${phrase} ${name}` : phrase);

const SHELL = [
  [/^(npm|npx|yarn|pnpm)\b.*\b(i|install|add|ci)\b/, 'ставлю пакеты'],
  [/^(npm|npx|yarn|pnpm)\b/, 'запускаю проект'],
  [/^(node|electron)\b|electron\.exe/, 'запускаю скрипт'],
  [/^(py|python\d*)\b/, 'запускаю питон'],
  [/^git\b/, 'вожусь с гитом'],
  [/^(curl|wget|invoke-webrequest|iwr)\b/, 'качаю из интернета'],
  [/^(ls|dir|get-childitem|find|tree)\b/, 'смотрю что в папках'],
  [/^(cat|head|tail|less|get-content|sed|awk|grep|rg|select-string)\b/, 'копаюсь в файлах'],
  [/^(rm|del|remove-item)\b/, 'убираю лишнее'],
  [/^(mkdir|new-item)\b/, 'создаю папку'],
  [/^(cp|mv|copy|move|copy-item|move-item|robocopy|expand-archive|unzip|tar)\b/, 'перекладываю файлы'],
  [/^ffmpeg\b|ffmpeg\.exe/, 'режу видео'],
  [/^(stop-process|kill|taskkill)\b/, 'закрываю программу'],
  [/^(get-process|tasklist|ps)\b/, 'смотрю что запущено'],
  [/nvidia-smi/, 'проверяю видеокарту'],
  [/^winsat\b/, 'тестирую диск'],
  [/^(sha256sum|certutil|get-filehash)\b/, 'проверяю файл'],
  [/^(pip|winget|choco)\b/, 'ставлю программы'],
];

// Each piece of "a && b; for x in y; do c" is tried in turn; "cd" and loop words are skipped,
// and a program given by full path ("C:/Program Files/nodejs/node.exe") counts by its name.
function shellPhrase(cmd) {
  const parts = String(cmd || '').split(/&&|\|\||[;|\n]/);
  for (let c of parts) {
    c = c.trim().replace(/^(for|while|if|then|do|else)\b\s*/i, '').replace(/^(&\s*)?["']([^"']*)["']/, (_m, _a, p) => p.split(/[\\/]/).pop().replace(/\s+/g, ''))
      .replace(/^[a-z]:\S*[\\/]/i, '').replace(/^\S*\//, '').toLowerCase();
    if (!c || /^(cd|set-location|done|fi|echo|write-host|start-sleep|sleep)\b/.test(c) || /^for\b|^\w+ in\b/.test(c)) continue;
    for (const [re, phrase] of SHELL) if (re.test(c)) return phrase;
  }
  return 'копаюсь в компе';
}

function browserPhrase(tool, i) {
  if (/navigate|preview_start|tabs_create/.test(tool)) {
    if (/^https?:\/\/(localhost|127\.|\[::1\])/i.test(i.url || '') || (!i.url && i.name)) return 'открываю свою страничку';
    return withName('открываю сайт', host(i.url));
  }
  if (/screenshot|zoom/.test(tool) || i.action === 'screenshot' || i.action === 'zoom') return 'смотрю на страницу';
  if (/get_page_text|read_page|find/.test(tool)) return 'читаю страницу';
  if (/javascript/.test(tool)) return 'колдую в браузере';
  if (/form_input|computer|batch/.test(tool)) return 'жму кнопки на сайте';
  return 'сижу в браузере';
}

function phrase(tool, i) {
  switch (tool) {
    case 'Read': case 'NotebookRead': return withName('читаю файл', fileName(i.file_path || i.notebook_path));
    case 'Grep': { const w = /^[0-9A-Za-zА-Яа-яЁё ]+$/.test(i.pattern || '') ? words(i.pattern, 3) : ''; return w ? `ищу в файлах ${w}` : 'ищу по файлам'; }
    case 'Glob': case 'LS': return 'ищу нужные файлы';
    case 'Edit': case 'MultiEdit': return withName('правлю файл', fileName(i.file_path));
    case 'Write': return withName('пишу файл', fileName(i.file_path));
    case 'NotebookEdit': return 'правлю блокнот';
    case 'Bash': case 'PowerShell': return shellPhrase(i.command);
    case 'Monitor': case 'BashOutput': return 'слежу за процессом';
    case 'KillShell': case 'TaskStop': return 'останавливаю процесс';
    case 'WebSearch': return withName('ищу в интернете', words(i.query, 4));
    case 'WebFetch': return withName('читаю сайт', host(i.url));
    case 'TodoWrite': return 'пишу список дел';
    case 'ToolSearch': return 'подбираю инструмент';
    case 'Skill': return 'достаю нужный навык';
    case 'AskUserQuestion': return 'жду твой ответ';
    case 'Artifact': return 'делаю страничку';
    default:
      if (/Browser|chrome/i.test(tool)) return browserPhrase(tool, i);
      if (/computer-use/.test(tool)) return 'управляю компом';
      if (/^mcp__ccd_turn__/.test(tool)) return 'записываю план';
      if (/^mcp__ccd_/.test(tool)) return 'навожу порядок';
      if (/figma/i.test(tool) || /^mcp__3aad/.test(tool)) return 'рисую в фигме';
      if (/^mcp__1a59/.test(tool)) return 'пишу документ';
      if (/^mcp__/.test(tool)) return 'работаю с сервисом';
      return 'работаю';
  }
}

function toEvent(p) {
  const name = p.hook_event_name;
  const tool = p.tool_name || '';
  const input = p.tool_input || {};
  const sub = p.agent_id || null;
  switch (name) {
    case 'SessionStart': return { type: 'session' };
    case 'UserPromptSubmit': return { type: 'prompt', text: plain(p.prompt, 40) };
    case 'Stop': return { type: 'done' };
    case 'SubagentStop': return { type: 'sub_done', sub };
    case 'Notification': return { type: 'notify', text: /permission|разреш/i.test(p.message || '') ? 'нужно твоё разрешение' : 'жду твоего ответа' };
    case 'PreToolUse':
      if (tool === 'Agent' || tool === 'Task') {
        return { type: 'spawn', id: p.tool_use_id, label: plain(input.description, 30) || 'помогаю', kind: input.subagent_type };
      }
      if (/ask-qwen/.test(input.command || '')) return null; // the bridge reports itself
      if (sub) return { type: 'sub_tool', sub, tool, detail: phrase(tool, input) };
      return { type: 'tool', tool, detail: phrase(tool, input) };
    case 'PostToolUse':
      if ((tool === 'Agent' || tool === 'Task') && !input.run_in_background) return { type: 'sub_done', id: p.tool_use_id };
      return null;
    case 'PostToolUseFailure':
      if (/ask-qwen/.test(input.command || '')) return null;
      return { type: 'tool_error', sub };
    default: return null;
  }
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', async () => {
  try {
    const p = JSON.parse(raw || '{}');
    const ev = toEvent(p);
    if (ev) {
      await fetch(OFFICE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // session: parallel Claude Code chats show up as separate helpers in the office
        body: JSON.stringify({ agent: 'claude', session: p.session_id ? String(p.session_id).slice(0, 12) : undefined, ...ev }),
        signal: AbortSignal.timeout(700),
      });
    }
  } catch {}
  process.exit(0);
});
