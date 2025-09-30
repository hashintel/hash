import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  presets: ["@hashintel/ds-preset"],
  outdir: "dist",
  jsxFramework: "react",
  validation: "error",
  strictTokens: true,
  strictPropertyValues: true,
});
