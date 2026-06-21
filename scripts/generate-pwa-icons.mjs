import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const RED = '#C2304A';
const BLACK = '#000000';

// Eight twisted triangular blades fanned around the center, like a
// camera-shutter pinwheel — matches src/components/icons/Pinwheel.tsx.
const BLADE_COUNT = 8;
const CENTER = 12;
const INNER_RADIUS = 2.4;
const OUTER_RADIUS = 10.6;
const HALF_WIDTH_DEG = 13;
const TWIST_DEG = 18;

function bladePoint(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = CENTER + radius * Math.sin(rad);
  const y = CENTER - radius * Math.cos(rad);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function bladePolygon(centerAngle) {
  const inner = bladePoint(INNER_RADIUS, centerAngle - TWIST_DEG);
  const outerA = bladePoint(OUTER_RADIUS, centerAngle - HALF_WIDTH_DEG);
  const outerB = bladePoint(OUTER_RADIUS, centerAngle + HALF_WIDTH_DEG);
  return `${inner} ${outerA} ${outerB}`;
}

const bladePolygons = Array.from({ length: BLADE_COUNT }, (_, i) =>
  bladePolygon((360 / BLADE_COUNT) * i)
)
  .map((points) => `<polygon points="${points}" />`)
  .join('\n    ');

// Standard icon: pinwheel fills most of the canvas, safe for any/non-maskable use.
const standardSvg = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" fill="${BLACK}"/>
  <g fill="${RED}">
    ${bladePolygons}
  </g>
</svg>`;

// Maskable icon: extra margin so Android's mask crop never clips the glyph.
const maskableSvg = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" fill="${BLACK}"/>
  <g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="${RED}">
    ${bladePolygons}
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
