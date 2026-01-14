import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  include: ["./stories/**/*.{ts,tsx}", "../ds-components/src/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: ["@hashintel/ds-theme"],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
});
