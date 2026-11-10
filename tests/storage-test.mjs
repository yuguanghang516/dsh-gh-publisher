import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractComicArchive, getItems, openStore, storageEstimate } from '../dist/storage.js';

// Independent, minimal ZIP fixture writer. The resulting files use standard local/central records.
function checksum(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const directories = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data || 'page');
    const method = entry.method ?? 0;
    const packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags || 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.size ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(entry.flags || 0, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(entry.badCrc ? 42 : checksum(data), 16);
    directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(entry.size ?? data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    directories.push(directory, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(directories);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Blob([...locals, directory, end]);
}

const pages = await extractComicArchive(zip([
  { name: 'chapter/page10.png', data: 'tenth page', method: 8 },
  { name: 'chapter/page2.jpg', data: 'second page' },
  { name: '__MACOSX/._page1.jpg', data: 'ignored' },
  { name: 'readme.txt', data: 'ignored text' },
]));
assert.deepEqual(pages.map(page => page.name), ['chapter/page2.jpg', 'chapter/page10.png']);
assert.equal(await pages[0].blob.text(), 'second page');
assert.equal(await pages[1].blob.text(), 'tenth page');
assert.equal(pages[0].blob.type, 'image/jpeg');
assert.equal(pages[1].blob.type, 'image/png');

await assert.rejects(extractComicArchive(zip([{ name: 'readme.txt' }])), /没有找到/);
await assert.rejects(extractComicArchive(zip([{ name: 'page.png', flags: 1 }])), /加密/);
await assert.rejects(extractComicArchive(zip([{ name: 'page.png', method: 12 }])), /Deflate/);
await assert.rejects(extractComicArchive(zip([{ name: 'page.png', badCrc: true }])), /校验失败/);
await assert.rejects(extractComicArchive(zip([{ name: 'page.png', size: 31 * 1024 * 1024 }])), /30 MB/);
await assert.rejects(extractComicArchive(zip([{ name: 'page.png', data: 'too much expanded data', method: 8, size: 1 }])), /大小/);
await assert.rejects(extractComicArchive(zip(Array.from({ length: 1001 }, (_, i) => ({ name: `${i}.png` })))), /1000/);
await assert.rejects(extractComicArchive(zip(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.txt`, size: 26 * 1024 * 1024 })))), /150 MB/);
await assert.rejects(extractComicArchive(new Blob(['not an archive'])), /不完整/);
await assert.rejects(extractComicArchive({ size: 151 * 1024 * 1024, arrayBuffer() { throw new Error('should not read'); } }), /150 MB/);

const zip64 = new Uint8Array(await zip([{ name: 'page.png' }]).arrayBuffer());
new DataView(zip64.buffer).setUint16(zip64.length - 12, 0xffff, true);
await assert.rejects(extractComicArchive(new Blob([zip64])), /ZIP64/);

const truncated = new Uint8Array(await zip([{ name: 'page.png' }]).arrayBuffer());
new DataView(truncated.buffer).setUint32(truncated.length - 6, 0x10000000, true);
await assert.rejects(extractComicArchive(new Blob([truncated])), /目录范围/);

await assert.rejects(getItems('unknown'), /无法识别/);
await assert.rejects(openStore(), /不支持本地书库/);
assert.deepEqual(await storageEstimate(), { usage: 0, quota: 0, persistent: false });
console.log('Storage checks passed: stored/deflated CBZ roundtrip, ordering, CRC, encryption, ZIP64, malformed ZIP, and size limits.');
