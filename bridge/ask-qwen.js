#!/usr/bin/env node
// Bridge from Claude Code to the local Qwen (llama-server). Shows the conversation in the office.
//   node ask-qwen.js "question"              — one-off question, answer is printed to stdout
//   echo "long text" | node ask-qwen.js      — question from stdin
//   --chat NAME   keep a conversation: Qwen remembers earlier messages (bridge/chats/NAME.json)
//   --new         start the --chat conversation over
//   --list        list saved conversations     --show NAME   print a conversation
//   --status      is Qwen running? (offline / loading / ready)
//   --system "..." own system prompt           --think       turn on thinking (slow: ~3.5 tokens/s)
//   --max 1024    max answer tokens
// Tools are never sent, so through the bridge Qwen can only talk: no files, no shell, no internet.
const fs = require('fs');
const path = require('path');

const OFFICE = `http://127.0.0.1:${process.env.OFFICE_PORT || 47321}/event`;
const QWEN = process.env.QWEN_URL || 'http://127.0.0.1:9931';
const CHATS = path.join(__dirname, 'chats');
// Context is 16384 tokens; keep history well below it (~3 chars per token for Russian).
const HISTORY_CHARS = 30000;

const DEFAULT_SYSTEM =
  'Ты — Qwen, локальная нейросеть на компьютере Ромы. Сейчас с тобой говорит Claude — другой ИИ-ассистент Ромы, ' +
  'твой коллега. Он может просить совета, второе мнение, черновик текста, перевод или проверку идеи. ' +
  'Отвечай по-русски, по делу, без воды. Если не знаешь — так и скажи.';

function parseArgs(argv) {
  const out = { system: null, think: false, max: 1024, chat: null, fresh: false, list: false, show: null, status: false, text: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--system') out.system = argv[++i];
    else if (a === '--think') out.think = true;
    else if (a === '--no-think') out.think = false;
    else if (a === '--max') out.max = Number(argv[++i]) || out.max;
    else if (a === '--chat') out.chat = argv[++i];
    else if (a === '--new') out.fresh = true;
    else if (a === '--list') out.list = true;
    else if (a === '--show') out.show = argv[++i];
    else if (a === '--status') out.status = true;
    else out.text.push(a);
  }
  return out;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s.trim();
}

async function office(ev) {
  try {
    await fetch(OFFICE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'claude', ...ev }),
      signal: AbortSignal.timeout(500),
    });
  } catch {}
}

const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\s+/g, ' ');
const chatFile = (name) => path.join(CHATS, name.replace(/[^0-9A-Za-zА-Яа-яЁё_-]+/g, '_') + '.json');

function loadChat(name) {
  try { return JSON.parse(fs.readFileSync(chatFile(name), 'utf8')); } catch { return null; }
}

function saveChat(name, chat) {
  fs.mkdirSync(CHATS, { recursive: true });
  chat.updated = new Date().toISOString();
  fs.writeFileSync(chatFile(name), JSON.stringify(chat, null, 2), 'utf8');
}

// Drop the oldest exchanges (keep the system prompt) until the history fits.
function trimHistory(messages) {
  const size = () => messages.reduce((n, m) => n + m.content.length, 0);
  while (size() > HISTORY_CHARS && messages.length > 3) messages.splice(1, 2);
  return messages;
}

async function status() {
  try {
    const h = await fetch(`${QWEN}/health`, { signal: AbortSignal.timeout(2000) });
    return h.status === 200 ? 'ready' : h.status === 503 ? 'loading' : 'offline';
  } catch {
    return 'offline';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.status) {
    console.log(await status());
    return;
  }
  if (args.list) {
    const files = fs.existsSync(CHATS) ? fs.readdirSync(CHATS).filter((f) => f.endsWith('.json')) : [];
    if (!files.length) console.log('(no chats)');
    for (const f of files) {
      const c = JSON.parse(fs.readFileSync(path.join(CHATS, f), 'utf8'));
      console.log(`${f.replace(/\.json$/, '')}\t${c.messages.filter((m) => m.role !== 'system').length} msgs\t${c.updated}`);
    }
    return;
  }
  if (args.show) {
    const c = loadChat(args.show);
    if (!c) { console.error(`no chat "${args.show}"`); process.exit(1); }
    for (const m of c.messages) if (m.role !== 'system') console.log(`## ${m.role === 'user' ? 'Claude' : 'Qwen'}\n${m.content}\n`);
    return;
  }

  const question = args.text.join(' ').trim() || (await readStdin());
  if (!question) {
    if (args.chat && args.fresh) { saveChat(args.chat, { messages: [{ role: 'system', content: args.system || DEFAULT_SYSTEM }] }); console.log('new chat'); return; }
    console.error('usage: node ask-qwen.js [--chat NAME] [--new] "question"');
    process.exit(2);
  }

  const chat = (args.chat && !args.fresh && loadChat(args.chat)) || { messages: [{ role: 'system', content: args.system || DEFAULT_SYSTEM }] };
  if (args.system) chat.messages[0] = { role: 'system', content: args.system };
  chat.messages.push({ role: 'user', content: question });
  trimHistory(chat.messages);

  await office({ type: 'qwen_ask', text: short(question, 54) });

  const body = { messages: chat.messages, stream: true, max_tokens: args.max, chat_template_kwargs: { enable_thinking: args.think } };

  let res;
  try {
    res = await fetch(`${QWEN}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    await office({ type: 'qwen_error', text: 'Я СПЛЮ... ЗАПУСТИ START-QWEN.BAT' });
    console.error(`Qwen is not running at ${QWEN} (start G:\\QwenAI\\start-qwen.bat)`);
    process.exit(1);
  }
  if (!res.ok) {
    const msg = res.status === 503 ? 'ЕЩЁ ЗАГРУЖАЮСЬ, ПОДОЖДИ' : `ОШИБКА ${res.status}`;
    await office({ type: 'qwen_error', text: msg });
    console.error(`Qwen error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  let content = '';
  let reasoning = 0;
  let tps = 0;
  let lastPush = 0;
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta || {};
        if (d.content) content += d.content;
        if (d.reasoning_content) reasoning += d.reasoning_content.length;
        if (j.timings?.predicted_per_second) tps = Math.round(j.timings.predicted_per_second * 10) / 10;
      } catch {}
    }
    if (Date.now() - lastPush > 900) {
      lastPush = Date.now();
      if (content.trim()) await office({ type: 'qwen_progress', text: short(content.trim().split(/\s+/).slice(-6).join(' '), 40) });
      else if (reasoning) await office({ type: 'qwen_progress', thinking: true });
    }
  }

  const answer = content.trim();
  await office({ type: 'qwen_reply', text: short(answer || '...', 54), tps });
  if (!answer) {
    console.error(reasoning ? `Qwen spent all ${args.max} tokens thinking — raise --max or drop --think` : 'Qwen returned an empty answer');
    process.exit(1);
  }
  if (args.chat) {
    chat.messages.push({ role: 'assistant', content: answer });
    saveChat(args.chat, chat);
  }
  process.stdout.write(answer + '\n');
}

main();
