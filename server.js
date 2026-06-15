const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function checkDomain(domain) {
  return new Promise((resolve) => {
    const result = { domain, hasContent: false, ssl: 'none', httpStatus: null, redirectUrl: null, error: null };
    const timeout = 10000;

    function tryHttps() {
      return new Promise((res) => {
        const req = https.get({ host: domain, path: '/', timeout, headers: { 'User-Agent': 'DomainChecker/1.0' } }, (resp) => {
          result.httpStatus = resp.statusCode;
          result.ssl = 'valid';
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            result.redirectUrl = resp.headers.location;
          }
          let body = '';
          resp.on('data', chunk => { if (body.length < 5000) body += chunk; });
          resp.on('end', () => {
            result.hasContent = body.length > 200;
            res(true);
          });
          resp.on('error', () => res(false));
        });
        req.setTimeout(timeout, () => { req.destroy(); res(false); });
        req.on('error', () => res(false));
      });
    }

    function tryHttp() {
      return new Promise((res) => {
        const req = http.get({ host: domain, path: '/', timeout, headers: { 'User-Agent': 'DomainChecker/1.0' } }, (resp) => {
          result.httpStatus = resp.statusCode;
          result.ssl = 'none';
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            result.redirectUrl = resp.headers.location;
            if (resp.headers.location.startsWith('https://')) result.ssl = 'redirect-https';
          }
          let body = '';
          resp.on('data', chunk => { if (body.length < 5000) body += chunk; });
          resp.on('end', () => {
            result.hasContent = body.length > 200;
            res(true);
          });
          resp.on('error', () => res(false));
        });
        req.setTimeout(timeout, () => { req.destroy(); res(false); });
        req.on('error', () => res(false));
      });
    }

    tryHttps().then(async (ok) => {
      if (!ok) {
        const ok2 = await tryHttp();
        if (!ok2) {
          result.error = 'Inaccessible';
          result.httpStatus = null;
        }
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

  if (parsed.pathname === '/check' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { domains } = JSON.parse(body);
        if (!Array.isArray(domains) || domains.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid input' }));
          return;
        }
        const limited = domains.slice(0, 200);
        const CONCURRENCY = 5;
        const results = [];
        for (let i = 0; i < limited.length; i += CONCURRENCY) {
          const batch = limited.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(batch.map(d => checkDomain(d)));
          results.push(...batchResults);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`✅ Domain Checker running on http://localhost:${PORT}`));
