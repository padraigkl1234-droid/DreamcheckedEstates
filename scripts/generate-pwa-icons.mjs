import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const RED = '#C2304A';
const BLACK = '#000000';

// Standard icon: trident fills most of the canvas, safe for any/non-maskable use.
const standardSvg = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" fill="${BLACK}"/>
  <g stroke="${RED}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20V10" />
    <path d="M7 10h10" />
    <path d="M7 10 4 3" />
    <path d="M12 10V2" />
    <path d="M17 10 20 3" />
  </g>
</svg>`;

// Maskable icon: extra margin so Android's mask crop never clips the glyph.
const maskableSvg = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" fill="${BLACK}"/>
  <g transform="translate(12 12) scale(0.62) translate(-12 -11)" stroke="${RED}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20V10" />
    <path d="M7 10h10" />
    <path d="M7 10 4 3" />
    <path d="M12 10V2" />
    <path d="M17 10 20 3" />
  </g>
</svg>`;

const targets = [
  { svg: standardSvg, size: 192, name: 'icon-192.png' },
  { svg: standardSvg, size: 512, name: 'icon-512.png' },
  { svg: standardSvg, size: 180, name: 'apple-touch-icon.png' },
  { svg: maskableSvg, size: 192, name: 'icon-maskable-192.png' },
  { svg: maskableSvg, size: 512, name: 'icon-maskable-512.png' },
];

for (const { svg, size, name } of targets) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(join(outDir, name), buf);
  console.log('wrote', name);
}
