import { createRequire } from "node:module";

import { defineConfig } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";
import petrinautPandaPreset from "@hashintel/petrinaut/panda-preset";

/** Panda evaluates this config through CJS, so `__filename` is available here. */
const require = createRequire(__filename);

const scopedConfig = scopedThemeConfig(".hash-ds-root");

/**
 * Generates the stylesheet backing `@hashintel/ds-components` usage in this
 * app: `panda cssgen` (part of the `codegen` script) writes
 * `src/pages/ds-components-styles.gen.css`, which is imported in
 * `_app.page.tsx`.
 *
 * Atomic utility classes are global, while the design system's preflight,
 * token variables and global styles are scoped to `.hash-ds-root` so they
 * cannot interfere with the MUI-styled rest of the app. Wrap any subtree that
 * uses themed ds-components in an element with that class.
 *
 * Petrinaut's style usage (`@hashintel/petrinaut/panda.buildinfo.json`) is
 * compiled through this same pipeline so that every Panda rule loaded in the
 * Petrinaut embed lives in one cascade-layer graph with one polyfilled
 * specificity contract (FE-1228). Because this stylesheet is a superset of
 * Petrinaut's own `dist/main.css` Panda output, any layer that is non-empty
 * there is non-empty here too — so the polyfill's synthetic `:not(#\#)`
 * boosts here are structurally guaranteed to be >= Petrinaut's, and every
 * Petrinaut rule wins at this stylesheet's boost level with Panda's canonical
 * intra-layer ordering (matching how the standalone Petrinaut site renders).
 * `dist/main.css` remains imported on the embed page for vendor CSS and the
 * `.petrinaut-root`-scoped preflight/token variables.
 */
export default defineConfig({
  ...scopedConfig,

  /**
   * The Petrinaut preset supplies the (namespaced) keyframes and token
   * extensions that Petrinaut's build-info usage refers to, keeping this
   * pipeline's theme contract identical to the one Petrinaut's own
   * `dist/main.css` is generated from.
   *
   * It is listed *before* the ds-components preset so that on conflicting
   * scalar theme values (currently only `fonts.mono`, which Petrinaut
   * overrides for its own scope) the ds-components/panda definitions win and
   * existing HASH surfaces are byte-for-byte unaffected. (Petrinaut's mono
   * font still applies inside the embed via the `.petrinaut-root`-scoped
   * `--fonts-mono` variable in `dist/main.css`.) Keyframes cannot rely on
   * ordering — Panda deep-merges same-name keyframes — which is why the
   * Petrinaut preset namespaces all of its keyframes.
   */
  presets: [petrinautPandaPreset, ...scopedConfig.presets],

  /**
   * Styles used inside ds-components itself, plus Petrinaut's shipped style
   * usage, plus the supply-chain tool and its route pages, which author Panda
   * `css()` calls against the ds-components preset tokens.
   */
  include: [
    require.resolve("@hashintel/ds-components/panda.buildinfo.json"),
    require.resolve("@hashintel/petrinaut/panda.buildinfo.json"),
    "./src/pages/supply-chain/**/*.{ts,tsx}",
  ],

  exclude: [],

  // Polyfill CSS @layer, as this app's unlayered global resets would
  // otherwise override layered utilities.
  polyfill: true,

  importMap: "@hashintel/ds-helpers",
});
