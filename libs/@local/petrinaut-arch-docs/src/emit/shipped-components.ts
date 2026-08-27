/**
 * Components the generator ships in every bundle's `components/` directory.
 *
 * Generated layer pages import these, so they are build output owned by the
 * generator, unlike the authored diagram components a repo opts into under
 * `content/components/`. The sources live in `./components/` as ordinary
 * `.tsx`/`.css` files and are copied into the bundle verbatim.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { AuthoredComponent } from "../content";

/** Module name generated pages import the facts card from. */
export const LAYER_FACTS_MODULE = "layer-facts";

/** Module name generated pages import the relations card from. */
export const LAYER_RELATIONS_MODULE = "layer-relations";

/** Module name generated pages import the source card from. */
export const LAYER_SOURCE_MODULE = "layer-source";

/** Module name generated pages import the links card from. */
export const LAYER_LINKS_MODULE = "layer-links";

/** Module name diff-annotated pages import the block marker from. */
export const DIFF_MARKER_MODULE = "diff-marker";

const shippedComponentFiles = [
  `${LAYER_FACTS_MODULE}.tsx`,
  `${LAYER_RELATIONS_MODULE}.tsx`,
  `${LAYER_SOURCE_MODULE}.tsx`,
  `${LAYER_LINKS_MODULE}.tsx`,
  `${DIFF_MARKER_MODULE}.tsx`,
  // Styling the cards share, imported by the components above.
  //
  // Resolution via `import.meta.url` works because this package always runs
  // from source (`tsx src/cli.ts`); `tsconfig.json` excludes this directory
  // from compilation, so no build ever places these files next to a compiled
  // output. If the package ever ships compiled, copy them into the output.
  "layer-cards.css",
  `${DIFF_MARKER_MODULE}.css`,
];

export const readShippedComponents = async (): Promise<AuthoredComponent[]> =>
  Promise.all(
    shippedComponentFiles.map(async (file) => ({
      path: `components/${file}`,
      name: file.replace(/\.[^.]+$/u, ""),
      contents: await readFile(
        fileURLToPath(new URL(`components/${file}`, import.meta.url)),
        "utf8",
      ),
    })),
  );
