import { createRequire } from "node:module";

import { defineConfig } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";
import { tokens } from "@hashintel/ds-components/tokens";

/** Panda evaluates this config through CJS, so `__filename` is available here. */
const require = createRequire(__filename);

/**
 * The DS z-index scale, mirrored to `:root`. `scopedThemeConfig` keeps token
 * variables scoped to `.hash-ds-root` (so the design system's colours can't
 * interfere with the MUI-styled app, and — critically — so conditional colour
 * tokens and the aliases that reference them resolve on the same element). The
 * z-index scale is unconditional, so it's safe to also expose globally, and it
 * must be: MUI overlays (menus, popovers) portal to `document.body`, outside
 * `.hash-ds-root`, and need to layer against it. Sourced from the tokens so the
 * values never drift from the scoped copy. Panda kebab-cases var names
 * (`skipLink` -> `--z-index-skip-link`).
 */
const zIndexRootVars = Object.fromEntries(
  Object.entries(tokens.zIndex).map(([name, token]) => [
    `--z-index-${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`,
    String(token.value),
  ]),
);

/**
 * Generates the stylesheet backing `@hashintel/ds-components` usage in this
 * app: `panda cssgen` (part of the `codegen` script) writes
 * `src/pages/ds-components-styles.gen.css`, which is imported in
 * `_app.page.tsx`.
 *
 * Atomic utility classes are global, while the design system's preflight reset,
 * token variables and global surface styles are scoped to `.hash-ds-root` so
 * they cannot interfere with the MUI-styled rest of the app (the z-index scale
 * is the one exception — see `zIndexRootVars`). Wrap any subtree that uses
 * themed ds-components in an element with that class.
 */
export default defineConfig({
  ...scopedThemeConfig(".hash-ds-root"),

  // Mirror the z-index scale to `:root`; see `zIndexRootVars`.
  globalCss: {
    ":root": zIndexRootVars,
  },

  /**
   * Styles used inside ds-components itself, plus the supply-chain tool
   * and its route pages, which author Panda `css()` calls against the ds-components preset tokens.
   */
  include: [
    require.resolve("@hashintel/ds-components/panda.buildinfo.json"),
    "./src/pages/supply-chain/**/*.{ts,tsx}",
  ],

  exclude: [],

  // Polyfill CSS @layer, as this app's unlayered global resets would
  // otherwise override layered utilities.
  polyfill: true,

  importMap: "@hashintel/ds-helpers",
});
