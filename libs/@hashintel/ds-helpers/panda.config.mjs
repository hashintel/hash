import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  presets: ["@hashintel/ds-theme"],
  include: ["./stories/**/*.{ts,tsx}"],
  outdir: "styled-system",
  outExtension: "mjs",
  jsxFramework: "react",
  validation: "error",
  strictTokens: true,
  strictPropertyValues: true,
  preflight: false,
});
