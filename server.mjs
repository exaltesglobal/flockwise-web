// Tiny production server for Hostinger's Node.js web app hosting (or any Node 18+ host).
// Serves the built app from dist/ and sends every other path to index.html so
// links like /admin/people work on refresh. No dependencies. Run: npm run build && npm start
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe);
  if (!file.startsWith(root)) file = join(root, 'index.html');
  const isAsset = existsSync(file) && statSync(file).isFile();
  if (!isAsset) file = join(root, 'index.html');
  const hashed = file.includes(`${join(root, 'assets')}`);
  res.writeHead(200, {
    ...SECURITY,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : isAsset ? 'public, max-age=86400' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Flockwise web listening on :${port}`));
