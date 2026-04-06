import sharp from 'sharp';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('cover-generator');

// Curated gradient pairs — vibrant, podcast-app friendly
const GRADIENTS = [
  { from: '#667eea', to: '#764ba2' }, // indigo → purple
  { from: '#f093fb', to: '#f5576c' }, // pink → red
  { from: '#4facfe', to: '#00f2fe' }, // blue → cyan
  { from: '#43e97b', to: '#38f9d7' }, // green → teal
  { from: '#fa709a', to: '#fee140' }, // pink → yellow
  { from: '#a18cd1', to: '#fbc2eb' }, // purple → soft pink
  { from: '#fccb90', to: '#d57eeb' }, // peach → purple
  { from: '#30cfd0', to: '#330867' }, // cyan → deep purple
];

function pickGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function escapeXmlAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
}

export async function generateCoverImage(podcastTitle: string): Promise<Buffer> {
  const size = 1400; // Apple Podcasts minimum
  const gradient = pickGradient(podcastTitle);
  const escaped = escapeXmlAttr(podcastTitle);

  // Word-wrap the title for the SVG
  const words = podcastTitle.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);

  const lineHeight = 90;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (size / 2) - (totalTextHeight / 2) + 30;

  const textLines = lines.map((line, i) =>
    `<text x="${size / 2}" y="${startY + i * lineHeight}" text-anchor="middle" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="72" font-weight="700" fill="white" letter-spacing="-1">${escapeXmlAttr(line)}</text>`
  ).join('\n    ');

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${gradient.from}"/>
      <stop offset="100%" style="stop-color:${gradient.to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)" rx="60"/>
  <rect x="80" y="${startY - 80}" width="${size - 160}" height="${totalTextHeight + 80}" rx="30" fill="rgba(0,0,0,0.2)"/>
    ${textLines}
  <text x="${size / 2}" y="${size - 120}" text-anchor="middle" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.7)">Vid2Pod</text>
  <circle cx="${size / 2}" cy="${size - 220}" r="30" fill="rgba(255,255,255,0.3)"/>
  <polygon points="${size / 2 - 10},${size - 234} ${size / 2 - 10},${size - 206} ${size / 2 + 16},${size - 220}" fill="white"/>
</svg>`;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  log.info({ title: podcastTitle, size: buffer.length }, 'Cover image generated');
  return buffer;
}
