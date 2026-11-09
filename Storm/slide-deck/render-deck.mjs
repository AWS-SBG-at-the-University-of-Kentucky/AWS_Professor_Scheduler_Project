// Renders Storm/slide-deck (Slides-type source) into a standalone HTML page and a 16:9 PDF.
// Slide images point at uploaded assets (/_blob/<id>); `blobs` maps each to its file in ../qa-screenshots/.
// Usage (from the repo root): node Storm/slide-deck/render-deck.mjs [previews-dir]
// Pass a previews-dir to also save one PNG per slide.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const deckDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(deckDir, '..', '..');
const require = createRequire(join(repo, 'package.json'));
const { chromium } = require('@playwright/test');

const blobs = {
  '39c2476d4fa30dbb1765b9d7caf8f0ca': '08-preferences-320px-clipped.png',
  '6258c008462f7ca20a94873d284e19ae': '01-invalid-time-window.jpg',
  'b9f807f66a501ebf40820c887ca94456': '02-lower-ranked-needs-note.jpg',
  '96d1e71a0fbdde678811c8d9859b3530': '10-sections-grayscale.png',
  '67bf53dd9189afa99f1b1a7df686d3f4': '05-no-eligible-match.jpg',
  '6bfe71c6ee22e043db2060f959f3aceb': '07-hard-constraint-blocked.jpg',
  'fe44f56eb21e2dccf26fd7efdd6be244': '03-approved.jpg',
  'a3f1c9d2e7b84056a1d3c8e92f4b7a60': '06-focus-ring-clipped.png',
  '5d0e7b2c91a64f38b6c2e1d4a8f39c75': '09-sections-375px.png',
  'c84e1a7f3b2d4906a5e8d17b0c93f2e6': '11-unchecked-day-active-fields.png',
  '4a8d3f1e6b0c4297a5e1d8c36f70b2d9': '12-pr3-role-picker.png',
  '7b2e5a90c3d14f68a9e0b4d27c15f83a': '14-before-pr3-sections-table-crop.png',
  'e1c94d06a8b24f73b5d2c0f9a64e7b18': '15-pr3-sections-table-crop.png',
};

const deck = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8'));
const fonts = Object.values(deck.faces).map(f => `<link rel="stylesheet" href="${f.href}">`).join('\n');

const convert = html => html
  .replace(/<aside>[\s\S]*?<\/aside>/g, '')
  .replace(/\/_blob\/([0-9a-f]{32})/g, (_, id) => `../qa-screenshots/${blobs[id]}`)
  .replace(/data-crop="[\d.]+ ([\d.]+%) ([\d.]+%)" style="/g, 'style="object-position:$1 $2;')
  .replace(/<x-shape kind="diamond" style="([^"]*)"><\/x-shape>/g,
    '<div style="$1;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></div>')
  .replace(/<x-connector x1="(\d+)" y1="(\d+)" x2="(\d+)" y2="(\d+)" head="none" style="color:([^;]+);border-width:(\d+)px"><\/x-connector>/g,
    '<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><line x1="$1" y1="$2" x2="$3" y2="$4" stroke="$5" stroke-width="$6"/></svg>');

const slides = deck.order.map(id => convert(readFileSync(join(deckDir, 'slides', `${id}.html`), 'utf8'))).join('\n');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${deck.title}</title>
${fonts}
<style>
@page { size: 1920px 1080px; margin: 0 }
* { box-sizing: border-box; margin: 0 }
body { background: #555; }
section { position: relative; width: 1920px; height: 1080px; overflow: hidden; break-after: page; }
table { border-collapse: collapse; }
th, td { padding: 0.35em 0.6em; border-bottom: 1px solid #D9D4CF; text-align: left; vertical-align: top; }
th { font-weight: 700; color: #2F3749; border-bottom: 2px solid #2F3749; }
@media screen { section { margin: 0 auto 24px; } }
</style></head><body>
${slides}
</body></html>`;

const htmlPath = join(deckDir, 'FacultyPlan-QA-Review.html');
writeFileSync(htmlPath, page);

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await tab.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await tab.evaluate(() => document.fonts.ready);
console.log('fonts loaded:', await tab.evaluate(() => ['Merriweather', 'Roboto'].map(f => f + '=' + document.fonts.check(`32px ${f}`)).join(' ')));
await tab.pdf({ path: join(deckDir, 'FacultyPlan-QA-Review.pdf'), width: '1920px', height: '1080px', printBackground: true });
const sections = await tab.locator('section').all();
const previews = process.argv[2];
if (previews) {
  mkdirSync(previews, { recursive: true });
  for (const [i, s] of sections.entries()) await s.screenshot({ path: join(previews, `${String(i + 1).padStart(2, '0')}.png`), scale: 'css' });
}
await browser.close();
console.log('rendered', sections.length, 'slides');
