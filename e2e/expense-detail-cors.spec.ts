import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { SESSION_KEY } from './helpers/stub-auth';

const allowedHeaders = ['authorization', 'content-type', 'if-match', 'x-api-key', 'x-google-idtoken'];
const detail = { id: 7, amount: '-65.5500', description: 'Hermetic CORS expense', category: 'Groceries', bookingDate: '2026-07-02T14:23:45.123456+01:00', currency: 'EUR', revision: '1' };

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('native cross-origin policy blocks the old header but loads Edit Expense with dual auth and exposed ETag', async ({ page }) => {
  // Hermetic real HTTP origins, not Playwright route.fulfill (which bypasses CORS).
  // Mirrors the observed staging gateway policy: a disallowed preflight is 204
  // without allow headers/origin; detail responses own their no-store policy.
  const preflights: string[][] = [];
  const reads: Record<string, string | string[] | undefined>[] = [];
  let writes = 0;
  const api = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      const requested = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(header => header.trim()).filter(Boolean);
      preflights.push(requested);
      if (requested.every(header => allowedHeaders.includes(header))) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'DELETE,GET,OPTIONS,POST,PUT');
        res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));
      }
      res.writeHead(204).end();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') { writes++; res.writeHead(405).end('{}'); return; }
    if (req.url === '/Expense/7') {
      reads.push(req.headers);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
      res.setHeader('ETag', '"1"');
      res.end(JSON.stringify(detail));
    } else if (req.url === '/Category') {
      res.end(JSON.stringify({ categories: [{ name: 'Groceries' }] }));
    } else if (req.url === '/healthz') {
      res.end('{}');
    } else { res.writeHead(404).end('{}'); }
  });
  const apiOrigin = await listen(api);
  const root = resolve('dist/guito-ui/browser');
  let configuredBundles = 0;
  const app = createServer(async (req, res) => {
    try {
      if (req.url === '/cors-probe') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>CORS probe</title>'); return; }
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      const file = resolve(root, `.${pathname}`);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      let bytes: Buffer;
      try { bytes = await readFile(file); } catch { bytes = await readFile(resolve(root, 'index.html')); }
      if (pathname.endsWith('.js')) {
        // Only substitute the public API origin in the real production/staging
        // bundle. All application code, HttpClient and auth wiring stay intact.
        const source = bytes.toString();
        const configured = source.replace(/https:\/\/guito(?:-staging)?\.api\.kerumirembora\.com/g, apiOrigin);
        if (configured !== source) configuredBundles++;
        bytes = Buffer.from(configured);
        res.setHeader('Content-Type', 'text/javascript');
      } else if (pathname.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
      else res.setHeader('Content-Type', 'text/html');
      res.end(bytes);
    } catch { res.writeHead(500).end(); }
  });
  const appOrigin = await listen(app);
  try {
    await page.goto(`${appOrigin}/cors-probe`);
    const oldRequest = await page.evaluate(async origin => {
      try {
        await fetch(`${origin}/Expense/7`, { headers: { Authorization: 'Bearer stub', 'x-google-idtoken': 'stub', 'Cache-Control': 'no-store' } });
        return 'unexpected success';
      } catch (error) { return error instanceof Error ? error.name : 'unknown'; }
    }, apiOrigin);
    expect(oldRequest).toBe('TypeError');
    expect(preflights).toEqual([['authorization', 'cache-control', 'x-google-idtoken']]);
    expect(reads).toHaveLength(0); // Chromium blocked GET before it reached HTTP.

    await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'stub', accessToken: 'stub', expiresAt: Date.now() + 3600000 })), SESSION_KEY);
    await page.goto(`${appOrigin}/expenses/7/edit`);
    await expect(page.locator('input[id$="-description"]:visible')).toHaveValue(detail.description);
    await expect(page.locator('input[id$="-amount"]:visible')).toHaveValue('-65,5500');
    await expect(page.locator('input[id$="-time"]:visible')).toHaveValue('14:23:45');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true }).filter({ visible: true })).toBeEnabled();
    expect(configuredBundles).toBeGreaterThan(0);
    expect(reads).toHaveLength(1);
    expect(reads[0]['authorization']).toBe('Bearer stub');
    expect(reads[0]['x-google-idtoken']).toBe('stub');
    expect(reads[0]['cache-control']).toBeUndefined();
    expect(preflights.slice(1)).toContainEqual(['authorization', 'x-google-idtoken']);
    for (const requested of preflights.slice(1)) expect(requested.every(header => allowedHeaders.includes(header))).toBe(true);
    expect(writes).toBe(0);
  } finally {
    await close(app);
    await close(api);
  }
});
