import { type Config, defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export const coreConfig: Config = {
  importMap: "@hashintel/ds-helpers",
  // Panda must only ever write inside this package. The generated styled system
  // is published as `@hashintel/ds-helpers`, but it is *not* generated there:
  // `codegen:panda` runs with `--clean`, which empties `outdir`, and pointing
  // that at another package's published payload let a concurrent
  // `changeset publish` worker empty `ds-helpers` while npm was packing it.
  // `@hashintel/ds-helpers`' own `codegen` copies this directory into place
  // atomically instead — see `libs/@hashintel/ds-helpers/scripts/sync-styled-system.mjs`.
  outdir: "styled-system",
  include: [
    "./src/components/**/*.{ts,tsx}",
    "./src/beta/**/*.{ts,tsx}",
    "./src/util/**/*.{ts,tsx}",
  ],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
};

export default defineConfig(coreConfig);
