// Renders the brand mark (public/mark.svg, public/mark-maskable.svg) to the PNG/ICO assets the
// PWA manifest and HTML head reference. Uses a locally cached Chromium (Playwright's) in headless
// mode, so no image dependency is added to the project.
//
// Usage: CHROME=/path/to/chrome node scripts/generate-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chrome = process.env.CHROME;
if (!chrome) throw new Error('Set CHROME to a Chromium/Chrome executable path');
const pub = path.resolve('public');
mkdirSync(path.join(pub, 'icons'), { recursive: true });
const work = mkdtempSync(path.join(tmpdir(), 'hinokami-icons-'));

function render(svg, size, out) {
  const html = path.join(work, `icon-${size}.html`);
  const svgUrl = 'file://' + path.join(pub, svg);
  writeFileSync(html, `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${svgUrl}" width="${size}" height="${size}">`);
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${size},${size}`, `--screenshot=${path.join(pub, out)}`, 'file://' + html], { stdio: 'ignore' });
}

render('mark.svg', 32, 'icons/icon-32.png');
render('mark.svg', 180, 'apple-touch-icon.png');
render('mark.svg', 192, 'icons/icon-192.png');
render('mark.svg', 512, 'icons/icon-512.png');
render('mark-maskable.svg', 512, 'icons/icon-maskable-512.png');

// favicon.ico: a single 32x32 PNG-compressed entry.
const png = readFileSync(path.join(pub, 'icons/icon-32.png'));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, png]));
