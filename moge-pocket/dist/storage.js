const DB_NAME = 'moge-pocket';
const DB_VERSION = 1;
const STORES = ['books', 'downloads', 'settings'];
const MAX_ARCHIVE = 150 * 1024 * 1024;
const MAX_PAGE = 30 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif)$/i;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
let opening;

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('设备存储空间不足，请先删除部分离线漫画后重试。');
  if (['SecurityError', 'NotAllowedError', 'InvalidStateError'].includes(error?.name)) {
    return new Error('浏览器未允许本地存储，请使用普通浏览模式并允许网站保存数据。');
  }
  return new Error(`本地数据保存或读取失败，请重试。${error?.message ? `（${error.message}）` : ''}`);
}

export async function openStore() {
  if (!globalThis.indexedDB) throw new Error('当前浏览器不支持本地书库，请使用新版 Safari、Chrome 或 Edge。');
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    let request;
    let blocked = false;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('书库正在其他页面更新，请关闭其他墨格页面后重试。'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

async function operation(store, mode, action) {
  if (!STORES.includes(store)) throw new Error('无法识别的本地数据类型。');
  const db = await openStore();
  return new Promise((resolve, reject) => {
    let tx;
    let request;
    let value;
    try {
      tx = db.transaction(store, mode);
      request = action(tx.objectStore(store));
    } catch (error) { reject(storageError(error)); return; }
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(storageError(tx.error || request.error));
    tx.onabort = () => reject(storageError(tx.error || request.error));
  });
}

export async function getItems(store = 'books') { return operation(store, 'readonly', s => s.getAll()); }
export async function getItem(store, key) { return operation(store, 'readonly', s => s.get(key)); }
export async function putItem(store, item) {
  if (!item || typeof item.id !== 'string' || !item.id) throw new Error('待保存的数据缺少有效编号。');
  await operation(store, 'readwrite', s => s.put(item));
  return item;
}
export async function deleteItem(store, key) { return operation(store, 'readwrite', s => s.delete(key)); }

export async function clearAll() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORES, 'readwrite');
      for (const name of STORES) tx.objectStore(name).clear();
    } catch (error) { reject(storageError(error)); return; }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(storageError(tx.error));
    tx.onabort = () => reject(storageError(tx.error));
  });
}

function mimeFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' })[ext];
}

function isImage(name) {
  const normalized = name.replaceAll('\\', '/');
  const basename = normalized.split('/').pop();
  return !normalized.startsWith('__MACOSX/') && !basename.startsWith('.') && IMAGE_NAME.test(basename);
}

function zipError(detail) { return new Error(`无法导入 CBZ：${detail}`); }

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflate(bytes, expectedSize) {
  let decoder;
  try { decoder = new DecompressionStream('deflate-raw'); }
  catch { throw zipError('当前浏览器不支持此压缩格式，请升级浏览器，或先解压后选择图片导入。'); }
  const reader = new Blob([bytes]).stream().pipeThrough(decoder).getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE || size > expectedSize) {
        await reader.cancel();
        throw zipError('图片展开后的大小超过限制，或压缩包的大小信息不正确。');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error.message?.startsWith('无法导入 CBZ')) throw error;
    throw zipError('压缩图片已损坏，无法解压。');
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

/** Extract supported image entries only. All names remain data, never filesystem paths. */
export async function extractComicArchive(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw zipError('请选择一个 CBZ 文件。');
  if (file.size > MAX_ARCHIVE) throw zipError('压缩包不能超过 150 MB。');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 22) throw zipError('压缩包不完整。');
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  // EOCD may be followed only by its own comment; do not accept a signature inside a comment.
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === bytes.length) {
      eocd = pos;
      break;
    }
  }
  if (eocd < 0) throw zipError('找不到 ZIP 目录，文件可能已损坏。');
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskCount = view.getUint16(eocd + 8, true);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || diskCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw zipError('暂不支持 ZIP64 格式，请解压后导入图片。');
  }
  if (disk || directoryDisk || diskCount !== count) throw zipError('不支持分卷压缩包。');
  if (count > MAX_ENTRIES) throw zipError('压缩包最多包含 1000 个文件。');
  if (directoryOffset + directorySize > eocd) throw zipError('ZIP 目录范围不正确。');
  const directoryEnd = directoryOffset + directorySize;
  const entries = [];
  let position = directoryOffset;
  let totalSize = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > directoryEnd || view.getUint32(position, true) !== 0x02014b50) throw zipError('ZIP 文件目录已损坏。');
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const startDisk = view.getUint16(position + 34, true);
    const offset = view.getUint32(position + 42, true);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > directoryEnd) throw zipError('ZIP 文件名或目录信息不完整。');
    if (flags & 0x41) throw zipError('不支持加密的压缩包，请先解密。');
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff || startDisk === 0xffff) {
      throw zipError('暂不支持 ZIP64 格式，请解压后导入图片。');
    }
    if (startDisk !== 0) throw zipError('不支持分卷压缩包。');
    // Reject ZIP64 extra fields even when the central directory did not use sentinel values.
    let extra = position + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra < extraEnd) {
      if (extra + 4 > extraEnd) throw zipError('ZIP 附加信息已损坏。');
      const kind = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (kind === 0x0001) throw zipError('暂不支持 ZIP64 格式，请解压后导入图片。');
      extra += 4 + length;
      if (extra > extraEnd) throw zipError('ZIP 附加信息已损坏。');
    }
    totalSize += size;
    if (totalSize > MAX_ARCHIVE) throw zipError('全部文件展开后不能超过 150 MB。');
    const name = new TextDecoder('utf-8').decode(bytes.subarray(position + 46, position + 46 + nameLength));
    if (isImage(name)) {
      if (size > MAX_PAGE) throw zipError('单张图片不能超过 30 MB。');
      if (method !== 0 && method !== 8) throw zipError('只支持标准 ZIP 存储或 Deflate 压缩格式。');
      entries.push({ name, flags, method, crc, compressedSize, size, offset });
    }
    position = next;
  }
  if (position !== directoryEnd) throw zipError('ZIP 目录长度与文件数不一致。');
  if (!entries.length) throw zipError('没有找到 JPG、PNG、WebP、GIF 或 AVIF 图片。');
  entries.sort((a, b) => collator.compare(a.name, b.name));
  const result = [];
  for (const entry of entries) {
    const pos = entry.offset;
    if (pos + 30 > directoryOffset || view.getUint32(pos, true) !== 0x04034b50) throw zipError('图片文件头已损坏。');
    const localFlags = view.getUint16(pos + 6, true);
    const localMethod = view.getUint16(pos + 8, true);
    const localNameLength = view.getUint16(pos + 26, true);
    const localExtraLength = view.getUint16(pos + 28, true);
    const start = pos + 30 + localNameLength + localExtraLength;
    if (localFlags & 0x41 || localMethod !== entry.method) throw zipError('图片压缩信息不一致或已加密。');
    if (start + entry.compressedSize > directoryOffset) throw zipError('压缩图片内容不完整。');
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    const data = entry.method === 0 ? compressed : await inflate(compressed, entry.size);
    if (data.byteLength !== entry.size || crc32(data) !== entry.crc) throw zipError('图片校验失败，压缩包可能已损坏。');
    result.push({ name: entry.name, blob: new Blob([data], { type: mimeFor(entry.name) }) });
  }
  return result;
}

export async function importComicFiles(input) {
  const files = Array.from(input || []);
  if (!files.length) throw new Error('请先选择图片或一个 CBZ 文件。');
  const archives = files.filter(file => /\.cbz$/i.test(file.name));
  let title;
  let pages;
  if (archives.length) {
    if (archives.length !== 1 || files.length !== 1) throw new Error('每次请选择一个 CBZ 文件，图片请单独导入。');
    title = archives[0].name.replace(/\.cbz$/i, '');
    pages = (await extractComicArchive(archives[0])).map(entry => entry.blob);
  } else {
    const images = files.filter(file => isImage(file.name)).sort((a, b) => collator.compare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
    if (!images.length) throw new Error('请选择 JPG、PNG、WebP、GIF、AVIF 图片，或一个 CBZ 文件。');
    if (images.length > MAX_ENTRIES) throw new Error('每次最多导入 1000 张图片。');
    if (images.some(file => file.size > MAX_PAGE)) throw new Error('单张图片不能超过 30 MB。');
    if (images.reduce((sum, file) => sum + file.size, 0) > MAX_ARCHIVE) throw new Error('每次导入的图片合计不能超过 150 MB。');
    const folder = images[0].webkitRelativePath?.split('/')[0];
    title = folder || images[0].name.replace(/\.[^.]+$/, '') + (images.length > 1 ? ` · ${images.length} 页` : '');
    pages = images.map(file => new Blob([file], { type: mimeFor(file.name) }));
  }
  const book = {
    id: `local-${crypto.randomUUID()}`,
    title: title.trim() || '未命名漫画',
    author: '本地导入',
    description: '仅保存在当前设备的本地漫画。',
    tags: ['本地'],
    cover: pages[0],
    chapters: [{ id: '01', title: '第 1 话', pages }],
    local: true,
    createdAt: Date.now(),
  };
  await putItem('books', book);
  return book;
}

export async function storageEstimate() {
  const result = { usage: 0, quota: 0, persistent: false };
  const storage = globalThis.navigator?.storage;
  if (!storage) return result;
  try {
    if (storage.estimate) {
      const estimate = await storage.estimate();
      result.usage = estimate.usage || 0;
      result.quota = estimate.quota || 0;
    }
    if (storage.persisted) result.persistent = await storage.persisted();
  } catch { /* Storage reporting is optional; the library still works without it. */ }
  return result;
}
