import { type Config, defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export const coreConfig: Config = {
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: ["./src/components/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
};

export default defineConfig(coreConfig);
