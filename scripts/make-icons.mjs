// Draws Echo's app icon and writes the PNG sizes the web manifest and
// Android need. Run with: npm run icons
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const PAPER = '#F8F7F4';
const WASH = '#D3E5F0';
const PIGMENT = '#8DBBD8';
const INK = '#2D6187';

// An "echo": a solid centre with two fading ripples, on a watercolor wash.
// The ripples stay inside the middle 63% so Android's mask never cuts them.
function iconSvg({ corner }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="wash" cx="40%" cy="38%" r="65%">
      <stop offset="0" stop-color="${WASH}"/>
      <stop offset="0.65" stop-color="${WASH}" stop-opacity="0.6"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pigment" cx="68%" cy="70%" r="42%">
      <stop offset="0" stop-color="${PIGMENT}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="${PIGMENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${corner}" fill="${PAPER}"/>
  <rect width="512" height="512" rx="${corner}" fill="url(#wash)"/>
  <rect width="512" height="512" rx="${corner}" fill="url(#pigment)"/>
  <g transform="translate(256 256)">
    <circle r="150" fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-width="22"/>
    <circle r="102" fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="22"/>
    <circle r="56" fill="${INK}"/>
  </g>
</svg>`;
}

const rounded = iconSvg({ corner: 112 });
const fullBleed = iconSvg({ corner: 0 });

const outputs = [
  { file: 'public/icons/icon-192.png', svg: rounded, size: 192 },
  { file: 'public/icons/icon-512.png', svg: rounded, size: 512 },
  { file: 'public/icons/maskable-512.png', svg: fullBleed, size: 512 },
  { file: 'public/icons/apple-touch-icon.png', svg: fullBleed, size: 180 },
];

for (const { file, svg, size } of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log('wrote', file);
}
await writeFile('app/icon.svg', rounded);
console.log('wrote app/icon.svg');
