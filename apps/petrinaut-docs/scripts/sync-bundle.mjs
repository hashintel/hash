/**
 * Regenerates the architecture bundle and copies it into this app's content tree.
 *
 * The bundle is build output and is not committed, so this generates it rather
 * than assuming it is on disk — one code path for both `dev` and `build`, and no
 * way to render a stale copy.
 *
 * Reading the bundle in place via a `glob` loader with an out-of-root `base`
 * works for `astro build` but not for `astro dev`: Astro resolves an MDX page's
 * relative image paths against the project root in dev, so `../diagrams/core.svg`
 * cannot be found. Copying sidesteps that, and is what a host embedding the
 * bundle (hash.dev) does anyway — so this stays an honest test of whether the
 * bundle is portable.
 */

import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const generatorRoot = fileURLToPath(
  new URL("../../../libs/@local/petrinaut-arch-docs/", import.meta.url),
);
const bundleRoot = `${generatorRoot}bundle/`;
const contentRoot = fileURLToPath(new URL("../src/content/", import.meta.url));

const generated = spawnSync("yarn", ["doc:architecture"], {
  cwd: generatorRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (generated.status !== 0) {
  process.stderr.write(
    "Failed to generate the architecture bundle; see the output above.\n",
  );
  process.exit(generated.status ?? 1);
}

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
