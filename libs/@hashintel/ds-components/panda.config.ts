import { defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export default defineConfig({
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: ["./src/components/**/*.{ts,tsx}", "./src/playground/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
});
