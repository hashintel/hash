import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  importMap: "@hashintel/ds-helpers",
  include: ["./src/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: ["@hashintel/ds-theme"],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
});
