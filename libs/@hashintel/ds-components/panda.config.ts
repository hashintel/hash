import { type Config, defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export const coreConfig: Config = {
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: [
    "./src/components/**/*.{ts,tsx}",
    "./src/primitives/**/*.{ts,tsx}",
    "./src/util/**/*.{ts,tsx}",
  ],
  // `panda ship` publishes what this config extracts into every consumer's
  // stylesheet, and Panda reads story props named like CSS properties
  // (`content`, `overflow`) as styles.
  exclude: ["**/*.{stories,story}.tsx", "**/*.test.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
};

export default defineConfig(coreConfig);
