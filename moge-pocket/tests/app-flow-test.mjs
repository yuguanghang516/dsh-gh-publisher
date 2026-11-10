/**
 * DOM/data integration checks, without a browser or HTTP server.
 * Install jsdom + fake-indexeddb outside the checkout, then run:
 * MOGE_TEST_MODULE_ROOT=/tmp/moge-checks/node_modules node --experimental-vm-modules tests/app-flow-test.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { Blob, File } from 'node:buffer';

const require = createRequire(import.meta.url);
const moduleRoot = process.env.MOGE_TEST_MODULE_ROOT || '/tmp/moge-checks/node_modules';
const { JSDOM } = require(join(moduleRoot, 'jsdom'));
const { IDBFactory } = require(join(moduleRoot, 'fake-indexeddb'));
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const dom = new JSDOM(await readFile(join(dist, 'index.html'), 'utf8'), {
  url: 'https://moge.test/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
const document = w.document;
const objectUrls = new Map();
const exportedFiles = [];
const fetchGates = new Map();
let online = true;
let nextBackup;
let remoteCatalog = JSON.parse(await readFile(join(dist, 'catalog.json'), 'utf8'));

function define(name, value) { Object.defineProperty(w, name, { value, configurable: true, writable: true }); }
for (const [name, value] of Object.entries({ Blob, File, Response, Request, Headers, TextDecoder, TextEncoder,
  DecompressionStream, structuredClone, indexedDB: new IDBFactory(), crypto: webcrypto })) define(name, value);
define('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
define('confirm', () => true);
w.scrollTo = () => {};
w.setInterval = () => 0;
w.clearInterval = () => {};
w.setTimeout = (fn, ms, ...args) => { const timer = setTimeout(fn, ms, ...args); timer.unref(); return timer; };
w.clearTimeout = clearTimeout;
Object.defineProperty(w.navigator, 'onLine', { get: () => online });
Object.defineProperty(w.navigator, 'storage', { value: {
  estimate: async () => ({ usage: 1024, quota: 500 * 1024 * 1024 }),
  persisted: async () => true, persist: async () => true,
} });
Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: async () => ({ scope: '/' }) } });
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.removeAttribute('open');
  this.dispatchEvent(new w.Event('close'));
};
w.URL.createObjectURL = blob => { const id = `blob:moge-test/${webcrypto.randomUUID()}`; objectUrls.set(id, blob); return id; };
w.URL.revokeObjectURL = id => { objectUrls.delete(id); };
w.HTMLAnchorElement.prototype.click = function () {
  if (this.download) exportedFiles.push({ name: this.download, blob: objectUrls.get(this.href) });
};
w.HTMLInputElement.prototype.click = function () {
  if (this.type === 'file' && this.id !== 'file-input' && nextBackup) {
    Object.defineProperty(this, 'files', { value: [nextBackup] });
    nextBackup = undefined;
    this.dispatchEvent(new w.Event('change'));
  }
};
define('fetch', async input => {
  if (!online) throw new TypeError('Offline fixture');
  const path = new URL(typeof input === 'string' ? input : input.url, w.location.href).pathname;
  if (fetchGates.has(path)) await fetchGates.get(path);
  if (path === '/catalog.json') return new Response(JSON.stringify(remoteCatalog), { headers: { 'Content-Type': 'application/json' } });
  try {
    const content = await readFile(join(dist, path));
    return new Response(content, { headers: { 'Content-Type': path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.cbz') ? 'application/zip' : 'image/png' } });
  } catch { return new Response('Missing fixture', { status: 404 }); }
});

const ctx = dom.getInternalVMContext();
const storage = new SourceTextModule(await readFile(join(dist, 'storage.js'), 'utf8'), { context: ctx, identifier: 'storage.js' });
const app = new SourceTextModule((await readFile(join(dist, 'app.js'), 'utf8')) + `
globalThis.__mogeTest = {
  get state() { return { started, checking, pumping, books, downloads, queue, reader, prefs, view, importing }; },
  checkUpdates, importFiles, exportBackup, restoreBackup, toggleSaved, toggleFollow, openReader
};`, { context: ctx, identifier: 'app.js' });
await app.link(specifier => {
  assert.equal(specifier, './storage.js');
  return storage;
});
await app.evaluate();
const api = w.__mogeTest;
const db = storage.namespace;
const $ = selector => document.querySelector(selector);
const click = selector => { const element = $(selector); assert.ok(element, `Missing action ${selector}`); element.click(); };
async function waitFor(predicate, label = 'application state') {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}; toast: ${$('#toast').textContent}`);
}
async function navigate(view) {
  w.location.hash = view;
  await waitFor(() => api.state.view === view, `${view} navigation`);
}
const book = id => api.state.books.find(book => book.id === id);
const report = message => console.log(`PASS ${message}`);

try {
  await waitFor(() => api.state.started && !api.state.checking, 'initial load');
  assert.equal(api.state.books.length, 4);
  assert.equal(document.querySelectorAll('.book-card').length, 4);
  assert.equal((await db.getItems('books')).length, 4);
  report('first launch persists four sample books');

  await navigate('discover');
  assert.equal(document.querySelectorAll('.book-card').length, 6);
  const search = $('#search-input');
  search.focus();
  search.dispatchEvent(new w.CompositionEvent('compositionstart', { bubbles: true }));
  search.value = '月球';
  search.dispatchEvent(new w.InputEvent('input', { bubbles: true, isComposing: true }));
  assert.equal(document.querySelectorAll('.book-card').length, 6, 'IME composition must preserve the input DOM');
  search.dispatchEvent(new w.CompositionEvent('compositionend', { bubbles: true }));
  assert.equal(document.querySelectorAll('.book-card').length, 1);
  assert.match($('.book-card h3').textContent, /月球/);
  click('[data-action="clear-search"]');
  assert.equal(document.querySelectorAll('.book-card').length, 6);
  click('[data-action="save"][data-id="cat-weekend"]');
  await waitFor(() => api.state.books.length === 5, 'add favorite');
  click('[data-action="save"][data-id="cat-weekend"]');
  await waitFor(() => api.state.books.length === 4, 'remove favorite');
  assert.equal(await db.getItem('books', 'cat-weekend'), undefined);
  report('six-story discovery, Chinese IME search, add/remove favorites');

  click('[data-action="detail"][data-id="moon-post"]');
  click('#detail-dialog [data-action="download"]');
  await waitFor(() => api.state.downloads.length === 1 && !api.state.pumping, 'actual chapter download');
  const offline = await db.getItem('downloads', 'moon-post::01');
  assert.ok(offline.archive instanceof Blob && offline.archive.size > 0);
  assert.ok(offline.coverBlob instanceof Blob && offline.coverBlob.size > 0);
  assert.equal(offline.pages.length, 3);
  assert.ok(offline.pages.every(page => page instanceof Blob && page.size > 0));
  const referencePage = await readFile(join(dist, remoteCatalog.books[0].chapters[0].pages[0]));
  assert.deepEqual(Buffer.from(await offline.pages[0].arrayBuffer()), referencePage);
  assert.equal((await db.extractComicArchive(offline.archive)).length, 3, 'exported CBZ must be importable');
  online = false;
  click('#detail-dialog .detail-actions [data-action="read"]');
  await waitFor(() => $('#reader-dialog').open && api.state.reader, 'offline reader');
  assert.match($('#reader-image').src, /^blob:/);
  assert.match($('#reader-dialog .pill').textContent, /本地阅读/);
  click('#reader-dialog [data-action="next-page"]');
  await waitFor(async () => (await db.getItem('books', 'moon-post')).read?.page === 1, 'page progress persistence');
  click('#reader-dialog [data-action="close-reader"]');
  online = true;
  report('real chapter/page blobs, CBZ roundtrip, offline reading and saved page progress');

  await api.openReader('moon-post', '01');
  const latestMoon = remoteCatalog.books.find(b => b.id === 'moon-post');
  latestMoon.chapters.push({ ...latestMoon.chapters[0], id: '02', title: '第2话 集成测试新章节' });
  await api.checkUpdates();
  assert.equal(book('moon-post').chapters.length, 2);
  assert.ok(book('moon-post').newChapterIds.includes('02'));
  await waitFor(async () => !api.state.pumping && !!await db.getItem('downloads', 'moon-post::02'), 'automatic download of new chapter');
  assert.ok((await db.getItem('downloads', 'moon-post::02')).archive.size > 0);
  click('#reader-dialog [data-action="next-page"]');
  await waitFor(() => api.state.reader?.page === 2, 'read while updating');
  await waitFor(async () => (await db.getItem('books', 'moon-post')).read?.page === 2, 'merged progress save');
  assert.equal((await db.getItem('books', 'moon-post')).chapters.length, 2, 'reading must retain newly synced chapters');
  click('#reader-dialog [data-action="close-reader"]');
  await navigate('updates');
  assert.ok($('#mobile-nav a[href="#updates"] .nav-badge'));
  click('.update-row [data-action="follow"][data-id="moon-post"]');
  await waitFor(() => !book('moon-post').following, 'cancel follow');
  assert.equal(book('moon-post').newChapterIds.length, 0);
  assert.equal($('#mobile-nav a[href="#updates"] .nav-badge'), null);
  report('new chapter comparison and automatic offline download, reading preserves updates, unfollow clears badges');

  const localFiles = [
    new File([await readFile(join(dist, 'assets/moon-post/02.png'))], 'page2.png', { type: 'image/png' }),
    new File([await readFile(join(dist, 'assets/moon-post/01.png'))], 'page1.png', { type: 'image/png' }),
  ];
  await api.importFiles(localFiles);
  const imported = api.state.books.find(b => b.local);
  assert.ok(imported?.cover instanceof Blob);
  assert.deepEqual(Buffer.from(await imported.chapters[0].pages[0].arrayBuffer()), Buffer.from(await localFiles[1].arrayBuffer()));
  await api.openReader(imported.id, '01');
  click('#reader-dialog [data-action="next-page"]');
  await waitFor(async () => (await db.getItem('books', imported.id)).read?.page === 1, 'local reading progress');
  click('#reader-dialog [data-action="close-reader"]');
  await navigate('profile');
  $('#theme-select').value = 'dark';
  $('#theme-select').dispatchEvent(new w.Event('change', { bubbles: true }));
  $('#interval-select').value = '60';
  $('#interval-select').dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(async () => (await db.getItem('settings', 'preferences'))?.checkMinutes === 60, 'preference persistence');
  await api.exportBackup();
  const backupBlob = exportedFiles.at(-1).blob;
  const backup = JSON.parse(await backupBlob.text());
  assert.ok(backup.books.find(b => b.id === imported.id).localSignature);
  assert.equal(backup.preferences.theme, 'dark');
  await api.toggleSaved(imported.id);
  await api.importFiles(localFiles);
  const reimported = api.state.books.find(b => b.local);
  assert.notEqual(reimported.id, imported.id);
  assert.equal(reimported.read, undefined);
  api.state.prefs.theme = 'light';
  api.state.prefs.checkMinutes = 15;
  nextBackup = new File([backupBlob], 'reading-backup.json', { type: 'application/json' });
  await api.restoreBackup();
  await waitFor(() => book(reimported.id).read?.page === 1 && api.state.prefs.theme === 'dark', 'restore reimported local book');
  assert.equal((await db.getItem('books', reimported.id)).read.page, 1);
  assert.equal(api.state.prefs.checkMinutes, 60);
  report('local image import, natural page order, read/backup/reimport/restore with new UUID, restored preferences');

  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });
  const forestPage = remoteCatalog.books.find(b => b.id === 'forest-radio').chapters[0].pages[0];
  fetchGates.set(forestPage, gate);
  await navigate('discover');
  click('[data-action="detail"][data-id="forest-radio"]');
  click('#detail-dialog [data-action="download"]');
  await waitFor(() => api.state.pumping, 'pending download');
  await api.toggleSaved('forest-radio');
  releaseFetch();
  await waitFor(() => !api.state.pumping, 'cancelled download completion');
  assert.equal(await db.getItem('downloads', 'forest-radio::01'), undefined);
  assert.equal(await db.getItem('books', 'forest-radio'), undefined);
  report('removing a book cancels an active download without orphaned data');
  console.log('All DOM/data integration checks passed. Browser layout, install behavior, and service-worker execution remain outside this test.');
} finally {
  dom.window.close();
}
