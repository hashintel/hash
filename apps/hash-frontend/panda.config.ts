import { createRequire } from "node:module";

import { defineConfig } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";

/** Panda evaluates this config through CJS, so `__filename` is available here. */
const require = createRequire(__filename);

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
 */
export default defineConfig({
  ...scopedThemeConfig(".hash-ds-root"),

  /**
   * Styles used inside ds-components itself, plus the supply-chain tool
   * and its route pages, which author Panda `css()` calls against the ds-components preset tokens.
   */
  include: [
    require.resolve("@hashintel/ds-components/panda.buildinfo.json"),
    /** @todo these will move */
    "./src/vct/**/*.{ts,tsx}",
    "./src/pages/supply-chain/**/*.{ts,tsx}",
  ],

  exclude: [],

  // Polyfill CSS @layer, as this app's unlayered global resets would
  // otherwise override layered utilities.
  polyfill: true,

  importMap: "@hashintel/ds-helpers",
});
