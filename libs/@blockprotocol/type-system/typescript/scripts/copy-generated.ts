#!/usr/bin/env node

/**
 * Copies the crate's generated declarations into the package.
 *
 * They have to live inside the package: relative import paths are carried over into `dist`
 * verbatim, so a path pointing outside `src` no longer resolves once it has been emitted.
 *
 * The two files reference each other by a path relative to the crate, which no longer holds once
 * they sit next to each other, so those references are rewritten on the way in.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const crateRoot = path.join(packageRoot, "..", "rust");
const targetDir = path.join(packageRoot, "src", "generated");

const sources = [
  {
    from: path.join(crateRoot, "pkg", "type-system.d.ts"),
    to: path.join(targetDir, "type-system.d.ts"),
    rewrite: { "../types/index.snap.js": "./types.js" },
  },
  {
    from: path.join(crateRoot, "types", "index.snap.d.ts"),
    to: path.join(targetDir, "types.d.ts"),
    rewrite: { "../pkg/type-system.js": "./type-system.js" },
  },
];

fs.mkdirSync(targetDir, { recursive: true });

for (const { from, to, rewrite } of sources) {
  let content = fs.readFileSync(from, "utf8");

  for (const [before, after] of Object.entries(rewrite)) {
    content = content.replaceAll(before, after);
  }

  fs.writeFileSync(to, content, "utf8");

  console.log(
    `${path.relative(packageRoot, from)} -> ${path.relative(packageRoot, to)}`,
  );
}
