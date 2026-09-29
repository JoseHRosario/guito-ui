/**
 * Minimal SPA static server for local e2e (Playwright webServer).
 * http-server has no history fallback, so deep links (/signin, /auth/callback)
 * 404 under it; this serves index.html for any path without a real file.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2] ?? 'dist/guito-ui/browser';
const port = Number(process.argv[3] ?? 8081);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = join(root, url === '/' ? 'index.html' : url.slice(1));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));