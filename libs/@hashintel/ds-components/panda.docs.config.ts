import { defineConfig } from "@pandacss/dev";

import { coreConfig } from "./panda.config";

/**
 * `panda ship` config for the published MDX docs surface: extracts the doc
 * blocks' style usage into `dist/docs/panda.buildinfo.json`, kept separate
 * from the main buildinfo so app consumers that don't render the docs pages
 * don't carry their CSS.
 */
export default defineConfig({
  ...coreConfig,
  include: ["./docs/blocks/**/*.{ts,tsx}"],
  exclude: ["**/*.gen.ts", "**/*.test.{ts,tsx}"],
});
