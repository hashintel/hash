// Regenerates every favicon / app-icon asset in `public/` from a single
// high-resolution master (`favicon-master.png`, 1024x1024) so the whole set
// stays crisp and consistent. Run with `yarn generate:icons`.
//
// Why this exists: browser tab icons are tiny (16/32 px), and quality depends
// entirely on resampling a large master down with a good filter (lanczos3)
// rather than letting the browser live-scale an over-sized PNG. We emit exact
// 16/32 px PNGs plus a multi-resolution .ico so the browser never has to.

import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const master = resolve(here, "favicon-master.png");
const publicDir = resolve(here, "..", "public");

/** High-quality square resize of the master to a transparent PNG buffer. */
const render = (size) =>
  sharp(master)
    .resize(size, size, { kernel: "lanczos3", fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** Standalone PNG assets and the sizes they ship at. */
const pngTargets = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

/** Sizes embedded in the multi-resolution favicon.ico. */
const icoSizes = [16, 32, 48];

/** Assemble a PNG-in-ICO container (supported by all modern browsers). */
const buildIco = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;

  for (const [index, { size, buffer }] of images.entries()) {
    const at = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, at); // width (0 => 256)
    entries.writeUInt8(size >= 256 ? 0 : size, at + 1); // height
    entries.writeUInt16LE(1, at + 4); // color planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(buffer.length, at + 8); // size of image data
    entries.writeUInt32LE(offset, at + 12); // offset of image data
    offset += buffer.length;
  }

  return Buffer.concat([header, entries, ...images.map((img) => img.buffer)]);
};

await Promise.all(
  pngTargets.map(async ({ file, size }) => {
    await writeFile(resolve(publicDir, file), await render(size));
    console.log(`✓ ${file} (${size}x${size})`);
  }),
);

const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({ size, buffer: await render(size) })),
);
await writeFile(resolve(publicDir, "favicon.ico"), buildIco(icoImages));
console.log(`✓ favicon.ico (${icoSizes.join("/")})`);
