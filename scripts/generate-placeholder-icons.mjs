// Generates the placeholder PWA icon/favicon assets for Phase 5, iteration 5.1
// (`.somi/plans/hinokami/phases/05-pwa-and-deploy.md`). No image-generation dependency is
// installed for this (ImageMagick/sharp/canvas are all unavailable or would trigger the
// dep-install gate) — this writes minimal valid PNG/ICO files by hand using only Node's `zlib`
// and `Buffer`. Output is a solid dark-red square (`#7f1d1d`, matching the app's dark theme),
// which the phase file explicitly says is sufficient for v1 functionality tests ("don't need to
// be polished artwork"). Not part of the DoD as a required deliverable — kept here in case icons
// need regenerating (e.g. a different placeholder color) without re-deriving the PNG/ICO byte
// layout from scratch.
//
// Usage: node scripts/generate-placeholder-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const DARK_RED = { r: 0x7f, g: 0x1d, b: 0x1d }; // zinc-950-adjacent dark red (fire tone)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Builds a minimal valid solid-color PNG (8-bit truecolor, no alpha, no interlacing). */
function buildSolidPng(width, height, { r, g, b }) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // Raw scanlines: each row prefixed with filter-type byte 0 (none), then width * RGB triplets.
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/** Wraps a PNG buffer in a minimal single-frame ICO container (PNG-in-ICO, supported since
 * Windows Vista and universally accepted by browsers/tools). */
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // color count (0 = no palette)
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // bytes in resource
  entry.writeUInt32LE(header.length + entry.length, 12); // offset to image data

  return Buffer.concat([header, entry, pngBuffer]);
}

const targets = [
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  const png = buildSolidPng(size, size, DARK_RED);
  writeFileSync(path.join(publicDir, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
}

const faviconPng = buildSolidPng(32, 32, DARK_RED);
const ico = buildIco(faviconPng, 32);
writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
console.log(`wrote favicon.ico (32x32 PNG-in-ICO, ${ico.length} bytes)`);
