import { type Config, defineConfig } from "@pandacss/dev";

import { coreConfig } from "./panda.config";

/**
 * Config for `panda ship`, which emits `dist/panda.buildinfo.json`: the
 * package's style usage, generated into every consumer's stylesheet.
 *
 * Differs from the core config only in what it extracts, so the generated
 * `@hashintel/ds-helpers` JSX types (which follow `jsxStyleProps`) keep their
 * style props:
 *
 * - `jsxStyleProps: "minimal"`: under the default `"all"`, Panda reads any
 *   prop named like a CSS property on any capitalised JSX tag as a style, so
 *   component props such as `<Tooltip position="right">` or
 *   `<OverflowRow overflow="summary">` became invalid rules. Component code
 *   styles through `css()` and recipes, never JSX style props.
 * - No story or test files: their styles are not part of the package's
 *   runtime surface.
 */
export const shipConfig: Config = {
  ...coreConfig,
  exclude: ["**/*.{stories,story}.tsx", "**/*.test.{ts,tsx}"],
  jsxStyleProps: "minimal",
};

export default defineConfig(shipConfig);
