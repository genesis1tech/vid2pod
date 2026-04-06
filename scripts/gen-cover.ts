import { generateCoverImage } from '../src/rss/cover-generator.js';
import { writeFile } from 'fs/promises';

const title = process.argv[2] || "Marcus's Podcast Library";
const output = process.argv[3] || '/tmp/vid2pod-cover.png';

async function main() {
  const buffer = await generateCoverImage(title);
  await writeFile(output, buffer);
  console.log(`Cover generated: ${buffer.length} bytes → ${output}`);
}

main().catch(console.error);
