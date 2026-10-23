/* eslint-disable no-console, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-assignment, typescript/no-unsafe-argument -- a Node CLI script that reports on the console; Node's types are outside the prototype's tsconfig */
// Saves one 1440x900 image per screen state to public/screens/<id>.webp, for the `?screens` page.
// Run: `yarn capture:flows-editor-prototype-screens [baseUrl]` (from libs/@hashintel/petrinaut), with the dev server up.
// The state ids come from the `?screens` page's own links, so the list never drifts from `screenStates`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "public", "screens");
const base = (process.argv[2] ?? "http://localhost:6011/").replace(/\/?$/, "/");

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(`${base}?screens`, { waitUntil: "networkidle" });
  const ids = await page.$$eval("figure a[href*='?state=']", (links) =>
    links.map((link) => new URL(link.href).searchParams.get("state")),
  );
  console.log(`${ids.length} screens from ${base}`);
  for (const id of ids) {
    await page.goto(`${base}?state=${id}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const png = await page.screenshot({ type: "png" });
    const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
    writeFileSync(join(outDir, `${id}.webp`), webp);
    console.log(`${id}.webp ${(webp.length / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}
