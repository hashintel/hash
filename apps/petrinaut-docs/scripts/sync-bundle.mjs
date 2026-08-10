/**
 * Copies the architecture bundle into this app's content tree.
 *
 * Generating the bundle is `@local/petrinaut-arch-docs`'s job, declared in
 * `turbo.json` as a dependency of this task. This script used to spawn the
 * generator itself, which meant a cross-package build step lived in a shell call
 * that Turborepo could not see, order or report on. Now it only copies.
 *
 * Reading the bundle in place via a `glob` loader with an out-of-root `base`
 * works for `astro build` but not for `astro dev`: Astro resolves an MDX page's
 * relative image paths against the project root in dev, so `../diagrams/core.svg`
 * cannot be found. Copying sidesteps that, and is what a host embedding the
 * bundle (hash.dev) does anyway — so this stays an honest test of whether the
 * bundle is portable.
 */

import { access, cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const bundleRoot = fileURLToPath(
  new URL("../../../libs/@local/petrinaut-arch-docs/bundle/", import.meta.url),
);
const contentRoot = fileURLToPath(new URL("../src/content/", import.meta.url));

try {
  await access(bundleRoot);
} catch {
  process.stderr.write(
    `No bundle at ${bundleRoot}\n` +
      "Run this through Turborepo so the generator runs first:\n" +
      "  turbo run sync:bundle --filter @apps/petrinaut-docs\n",
  );
  process.exit(1);
}

for (const directory of ["docs", "diagrams", "components"]) {
  await rm(new URL(directory, `file://${contentRoot}`), {
    recursive: true,
    force: true,
  });
}

await mkdir(contentRoot, { recursive: true });

// `pages/` becomes `docs/` — the collection name Starlight expects.
await cp(`${bundleRoot}pages`, `${contentRoot}docs`, { recursive: true });
await cp(`${bundleRoot}diagrams`, `${contentRoot}diagrams`, {
  recursive: true,
});

// Diagram components imported by authored pages. Copied as siblings of `docs/`
// because that is the layout the bundle's own relative imports assume.
await cp(`${bundleRoot}components`, `${contentRoot}components`, {
  recursive: true,
});

// The bundle's machine-readable artefacts are served as-is, so an agent reading
// this site gets byte-identical content to one reading the bundle directly.
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(publicRoot, { recursive: true });
for (const file of ["architecture.md", "architecture.json"]) {
  await cp(`${bundleRoot}${file}`, `${publicRoot}${file}`);
}

process.stdout.write("Synced architecture bundle into src/content\n");
