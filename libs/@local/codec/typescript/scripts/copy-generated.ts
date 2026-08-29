#!/usr/bin/env node

/**
 * Copies the crate's generated declarations into the package.
 *
 * They stay inside the crate as insta snapshots — `cargo insta` only finds snapshots below the
 * crate directory — so the package takes a copy rather than pointing at them, which an `exports`
 * entry cannot do.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDir = path.join(packageRoot, "..", "rust", "types");
const targetDir = path.join(packageRoot, "src", "generated");

fs.mkdirSync(targetDir, { recursive: true });

const files: [from: string, to: string][] = [
  ["index.snap.d.ts", "types.d.ts"],
  ["index.snap.js", "types.js"],
];

for (const [from, to] of files) {
  fs.copyFileSync(path.join(sourceDir, from), path.join(targetDir, to));

  console.log(`${from} -> src/generated/${to}`);
}
