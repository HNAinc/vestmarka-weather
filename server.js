'use strict';
// Local development/standalone server: serves the static dashboard and runs the
// collector every 5 minutes. The hosted (GitHub Pages) version uses the same
// index.html with data committed by .github/workflows/collect.yml instead.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { tick } = require('./collect');

const PORT = Number(process.env.PORT) || 3000;
const SAMPLE_MS = 5 * 60 * 1000;

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/data/station.jsonl': ['data/station.jsonl', 'text/plain; charset=utf-8'],
  '/data/yr_hourly.json': ['data/yr_hourly.json', 'application/json'],
  '/data/yr_latest.json': ['data/yr_latest.json', 'application/json'],
};

const server = http.createServer((req, res) => {
  const entry = FILES[new URL(req.url, 'http://localhost').pathname];
  if (!entry) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, entry[0]), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  tick();
  setInterval(tick, SAMPLE_MS);
});
