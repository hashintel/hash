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

/**
 * Copies a bundle directory when the generator produced one.
 *
 * Only `pages/` is always present. `components/` exists when an authored page
 * ships a diagram component, and `diagrams/` when `d2` was available to render
 * them, so both are absent from a valid bundle in ordinary cases: a bundle with
 * no `content/` at all has neither. Copying unconditionally turned that into an
 * `ENOENT` that took down `build`, `dev` and `lint:tsc` together.
 *
 * @param {string} name Directory within the bundle.
 * @param {string} destination Directory within `src/content/`.
 * @returns {Promise<void>}
 */
const copyIfPresent = async (name, destination) => {
  try {
    await access(`${bundleRoot}${name}`);
  } catch {
    return;
  }
  await cp(`${bundleRoot}${name}`, `${contentRoot}${destination}`, {
    recursive: true,
  });
};

// `pages/` becomes `docs/` — the collection name Starlight expects. Always
// present: the generator emits a page per layer even with no authored content.
await cp(`${bundleRoot}pages`, `${contentRoot}docs`, { recursive: true });

await copyIfPresent("diagrams", "diagrams");

// Diagram components imported by authored pages. Copied as siblings of `docs/`
// because that is the layout the bundle's own relative imports assume.
await copyIfPresent("components", "components");

// The bundle's machine-readable artefacts are served as-is, so an agent reading
// this site gets byte-identical content to one reading the bundle directly.
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(publicRoot, { recursive: true });
for (const file of ["architecture.md", "architecture.json"]) {
  await cp(`${bundleRoot}${file}`, `${publicRoot}${file}`);
}

process.stdout.write("Synced architecture bundle into src/content\n");
