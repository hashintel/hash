/**
 * Copies the architecture bundle into this app's content tree.
 *
 * Reading the bundle in place via a `glob` loader with an out-of-root `base`
 * works for `astro build` but not for `astro dev`: Astro resolves an MDX page's
 * relative image paths against the project root in dev, so `../diagrams/core.svg`
 * cannot be found. Copying sidesteps that entirely, and is what a host embedding
 * the bundle (hash.dev) does anyway — so this stays an honest test of whether the
 * bundle is portable.
 *
 * `pages/` and `diagrams/` are copied as siblings under `src/content/`, which is
 * the layout the bundle's own relative paths assume. The destination is
 * gitignored: the bundle is the committed artefact, this is a build input.
 */

import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const bundleRoot = fileURLToPath(
  new URL("../../../libs/@local/petrinaut-arch-docs/bundle/", import.meta.url),
);
const contentRoot = fileURLToPath(new URL("../src/content/", import.meta.url));

for (const directory of ["docs", "diagrams"]) {
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

process.stdout.write("Synced architecture bundle into src/content\n");
