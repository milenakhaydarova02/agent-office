// Local event hub: receives events from Claude Code hooks and the ask-qwen bridge,
// polls llama-server for Qwen's status, and fans everything out to the office view.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.OFFICE_PORT || 47321);
const QWEN_URL = process.env.QWEN_URL || 'http://127.0.0.1:9931';
const STATIC_DIR = path.join(__dirname, 'renderer');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

function startServer(onEvent) {
  const clients = new Set();

  function emit(ev) {
    ev.ts = Date.now();
    if (onEvent) onEvent(ev);
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of clients) res.write(line);
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 65536) req.destroy(); });
      req.on('end', () => {
        try {
          const ev = JSON.parse(body);
          if (ev && typeof ev.type === 'string') emit(ev);
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end('bad json');
        }
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': hello\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET') {
      const url = req.url.split('?')[0];
      const rel = url === '/' ? 'index.html' : decodeURIComponent(url).replace(/^\/+/, '');
      const file = path.join(STATIC_DIR, rel);
      if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
      return;
    }
    res.writeHead(404).end();
  });

  server.on('error', (err) => console.error('[office] server error:', err.message));
  server.listen(PORT, '127.0.0.1', () => console.log(`[office] listening on http://127.0.0.1:${PORT}`));

  // Qwen status poller: offline / loading / idle / busy, plus tokens per second while busy.
  let lastDecoded = null;
  let lastAt = 0;
  async function pollQwen() {
    let status = 'offline';
    let tps = 0;
    try {
      const h = await fetch(`${QWEN_URL}/health`, { signal: AbortSignal.timeout(900) });
      status = h.status === 200 ? 'idle' : h.status === 503 ? 'loading' : 'offline';
      if (status === 'idle') {
        const s = await fetch(`${QWEN_URL}/slots`, { signal: AbortSignal.timeout(900) });
        if (s.ok) {
          const slots = await s.json();
          const busy = Array.isArray(slots) && slots.some((x) => x.is_processing);
          if (busy) {
            status = 'busy';
            const decoded = slots.reduce((n, x) => n + (x.next_token?.[0]?.n_decoded ?? x.n_decoded ?? 0), 0);
            const now = Date.now();
            if (lastDecoded !== null && decoded >= lastDecoded && now > lastAt) {
              tps = ((decoded - lastDecoded) * 1000) / (now - lastAt);
            }
            lastDecoded = decoded;
            lastAt = now;
          } else {
            lastDecoded = null;
          }
        }
      }
    } catch {
      status = 'offline';
    }
    emit({ agent: 'qwen', type: 'status', status, tps: Math.round(tps * 10) / 10 });
  }
  const timer = setInterval(pollQwen, 1000);
  pollQwen();

  return {
    emit,
    close() { clearInterval(timer); server.close(); },
  };
}

module.exports = { startServer, PORT };

if (require.main === module) startServer(null);
