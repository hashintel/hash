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
   * Only styles used inside ds-components itself — this app does not author
   * Panda styles. Add `./src` globs here if `css()` calls are introduced.
   */
  include: [require.resolve("@hashintel/ds-components/panda.buildinfo.json")],

  exclude: [],

  // Polyfill CSS @layer, as this app's unlayered global resets would
  // otherwise override layered utilities.
  polyfill: true,

  importMap: "@hashintel/ds-helpers",
});
