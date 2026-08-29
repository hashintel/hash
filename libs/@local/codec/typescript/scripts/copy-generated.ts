#!/usr/bin/env node

/**
 * Copies the crate's generated declarations into the package's sources.
 *
 * They stay inside the crate as insta snapshots — `cargo insta` only finds snapshots below the
 * crate directory — so the package takes a copy rather than pointing at them, which an `exports`
 * entry cannot do. The copy lands as a `.ts` module so that `tsc` emits it into `dist` alongside
 * everything else, rather than passing over it as a declaration file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(
  packageRoot,
  "..",
  "rust",
  "types",
  "index.snap.d.ts",
);
const targetDir = path.join(packageRoot, "src", "generated");
const target = path.join(targetDir, "types.ts");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

console.log(`${path.relative(packageRoot, source)} -> src/generated/types.ts`);
