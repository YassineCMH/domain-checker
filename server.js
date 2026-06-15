const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TIMEOUT = 7000;
const CONCURRENCY = 15;

function checkDomain(domain) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const result = { domain, hasContent: false, ssl: 'none', httpStatus: null, redirectUrl: null, error: null, elapsed: null };

    function tryHttps() {
      return new Promise((res) => {
        try {
          const req = https.get({
            host: domain, path: '/', timeout: TIMEOUT,
            headers: { 'User-Agent': 'Mozilla/5.0 DomainChecker/2.0' }
          }, (resp) => {
            result.httpStatus = resp.statusCode;
            result.ssl = 'valid';
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location)
              result.redirectUrl = resp.headers.location;
            let body = '';
            resp.on('data', chunk => { if (body.length < 3000) body += chunk; });
            resp.on('end', () => { result.hasContent = body.length > 200; result.elapsed = Date.now() - t0; res(true); });
            resp.on('error', () => res(false));
          });
          req.setTimeout(TIMEOUT, () => { req.destroy(); res(false); });
          req.on('error', () => res(false));
        } catch(e) { res(false); }
      });
    }

    function tryHttp() {
      return new Promise((res) => {
        try {
          const req = http.get({
            host: domain, path: '/', timeout: TIMEOUT,
            headers: { 'User-Agent': 'Mozilla/5.0 DomainChecker/2.0' }
          }, (resp) => {
            result.httpStatus = resp.statusCode;
            result.ssl = 'none';
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
              result.redirectUrl = resp.headers.location;
              if (resp.headers.location.startsWith('https://')) result.ssl = 'redirect-https';
            }
            let body = '';
            resp.on('data', chunk => { if (body.length < 3000) body += chunk; });
            resp.on('end', () => { result.hasContent = body.length > 200; result.elapsed = Date.now() - t0; res(true); });
            resp.on('error', () => res(false));
          });
          req.setTimeout(TIMEOUT, () => { req.destroy(); res(false); });
          req.on('error', () => res(false));
        } catch(e) { res(false); }
      });
    }

    tryHttps().then(async (ok) => {
      if (!ok) {
        const ok2 = await tryHttp();
        if (!ok2) { result.error = 'Inaccessible'; result.elapsed = Date.now() - t0; }
      }
      resolve(result);
    });
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const parsed = url.parse(req.url);

  if (parsed.pathname === '/' && req.method === 'GET') {
    const file = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  if (parsed.pathname === '/stream' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let domains;
      try {
        ({ domains } = JSON.parse(body));
        if (!Array.isArray(domains) || domains.length === 0) throw new Error('invalid');
      } catch (e) { res.writeHead(400); res.end('Invalid input'); return; }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const limited = domains.slice(0, 1000);
      const total = limited.length;
      let done = 0;
      let closed = false;

      req.on('close', () => { closed = true; });

      res.write(`data: ${JSON.stringify({ type: 'start', total })}\n\n`);

      const queue = [...limited];
      async function worker() {
        while (queue.length > 0 && !closed) {
          const domain = queue.shift();
          if (!domain) break;
          const result = await checkDomain(domain);
          done++;
          if (!closed && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'result', result, done, total })}\n\n`);
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, worker);
      await Promise.all(workers);

      if (!closed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.timeout = 0;
server.listen(PORT, () => {
  console.log(`✅ Domain Checker Pro — http://localhost:${PORT}`);
  console.log(`   Concurrence : ${CONCURRENCY} domaines simultanés`);
  console.log(`   Timeout par domaine : ${TIMEOUT/1000}s`);
});
