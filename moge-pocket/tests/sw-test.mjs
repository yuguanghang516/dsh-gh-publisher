/** Production Service Worker behavior in a VM; no browser, network, or dependencies. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const origin = 'https://moge.test';
const handlers = new Map();
const buckets = new Map();
const routes = new Map();
const fetches = [];
let skipWaitingCalls = 0;
let claimCalls = 0;
const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;

class MemoryCache {
  entries = new Map();
  async put(request, response) { this.entries.set(key(request), response.clone()); }
  async match(request) { return this.entries.get(key(request))?.clone(); }
  async delete(request) { return this.entries.delete(key(request)); }
}
const caches = {
  async open(name) { if (!buckets.has(name)) buckets.set(name, new MemoryCache()); return buckets.get(name); },
  async keys() { return [...buckets.keys()]; },
  async delete(name) { return buckets.delete(name); },
  async match(request) {
    for (const bucket of buckets.values()) {
      const response = await bucket.match(request);
      if (response) return response;
    }
  },
};
async function fetchFixture(request) {
  const url = new URL(typeof request === 'string' ? request : request.url, origin);
  fetches.push(url.pathname);
  const route = routes.get(url.pathname);
  if (route?.error) throw new TypeError('Fixture network unavailable');
  const response = new Response(route?.body ?? `network:${url.pathname}`, { status: route?.status || 200 });
  if (route?.redirected) Object.defineProperty(response, 'redirected', { value: true });
  return response;
}
runInNewContext(await readFile(fileURLToPath(new URL('../dist/sw.js', import.meta.url)), 'utf8'), {
  self: {
    location: { origin },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => { skipWaitingCalls++; },
    clients: { claim: async () => { claimCalls++; } },
  },
  caches, fetch: fetchFixture, URL, Response,
}, { filename: 'production-sw.js' });

async function lifecycle(name) {
  let pending;
  handlers.get(name)({ waitUntil(promise) { pending = promise; } });
  assert.ok(pending, `${name} must retain its asynchronous work`);
  await pending;
}
function request(path, { mode = 'cors', method = 'GET' } = {}) { return { url: new URL(path, origin).href, mode, method }; }
function dispatchFetch(path, options) {
  let intercepted = false;
  let response;
  handlers.get('fetch')({ request: request(path, options), respondWith(promise) { intercepted = true; response = promise; } });
  return { intercepted, response };
}

routes.set('/icon-192.png', { body: 'authentication landing page', redirected: true });
routes.set('/icon-512.png', { error: true });
await lifecycle('install');
const currentName = (await caches.keys()).find(name => name.startsWith('moge-shell-'));
assert.ok(currentName);
const shell = await caches.open(currentName);
assert.equal(await (await shell.match('/app.js')).text(), 'network:/app.js');
assert.equal(await shell.match('/icon-192.png'), undefined, 'install must not cache redirected authentication pages');
assert.equal(await shell.match('/icon-512.png'), undefined, 'an unavailable optional asset must not abort install');
assert.equal(skipWaitingCalls, 1);
console.log('PASS install caches successful shell assets and skips redirects/unavailable assets');

await (await caches.open('moge-shell-older')).put('/old.js', new Response('obsolete'));
await (await caches.open('unrelated-cache')).put('/shared', new Response('keep'));
await lifecycle('activate');
assert.equal(buckets.has('moge-shell-older'), false);
assert.equal(buckets.has(currentName), true);
assert.equal(buckets.has('unrelated-cache'), true);
assert.equal(claimCalls, 1);
console.log('PASS activation removes old shell versions while retaining current and unrelated caches');

routes.set('/', { body: 'fresh index v2' });
let event = dispatchFetch('/?screen=library', { mode: 'navigate' });
assert.ok(event.intercepted);
assert.equal(await (await event.response).text(), 'fresh index v2');
assert.equal(await (await shell.match('/index.html')).text(), 'fresh index v2');
routes.set('/', { error: true });
event = dispatchFetch('/?screen=offline', { mode: 'navigate' });
assert.equal(await (await event.response).text(), 'fresh index v2');
console.log('PASS navigation uses the network, refreshes the cached index, and falls back offline');

await shell.put('/app.js', new Response('stale app'));
routes.set('/app.js', { body: 'updated app' });
event = dispatchFetch('/app.js');
assert.ok(event.intercepted);
assert.equal(await (await event.response).text(), 'updated app');
assert.equal(await (await shell.match('/app.js')).text(), 'updated app');
routes.set('/app.js', { error: true });
assert.equal(await (await dispatchFetch('/app.js').response).text(), 'updated app');
console.log('PASS existing cached JavaScript does not hide updates and remains available offline');

for (const path of ['/catalog.json?t=123', '/assets/moon-post/01.svg', '/assets/moon-post/01.png', '/assets/moon-post/01.cbz']) {
  const before = fetches.length;
  assert.equal(dispatchFetch(path).intercepted, false, `${path} must bypass the shell cache`);
  assert.equal(fetches.length, before);
  assert.equal(await caches.match(path), undefined);
}
assert.equal(dispatchFetch('/app.js', { method: 'POST' }).intercepted, false);
assert.equal(dispatchFetch('https://another.test/app.js').intercepted, false);
console.log('PASS catalog, comic pages, archives, external requests, and writes are not implicitly intercepted/cached');

const cover = '/assets/moon-post/cover.svg';
routes.set(cover, { body: '<svg>cover fixture</svg>' });
event = dispatchFetch(cover);
assert.ok(event.intercepted);
assert.equal(await (await event.response).text(), '<svg>cover fixture</svg>');
assert.equal(await (await shell.match(cover)).text(), '<svg>cover fixture</svg>');
routes.set(cover, { error: true });
assert.equal(await (await dispatchFetch(cover).response).text(), '<svg>cover fixture</svg>');
console.log('PASS covers cache successfully and load offline');

await shell.delete('/index.html');
const fallback = await dispatchFetch('/', { mode: 'navigate' }).response;
assert.match(await fallback.text(), /请先联网打开墨格/);
console.log('All production Service Worker VM checks passed. Browser installation/lifecycle interoperability is not exercised.');
