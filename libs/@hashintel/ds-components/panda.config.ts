import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  strictTokens: true,
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  theme: {
    extend: {},
  },
  presets: ["@hashintel/ds-theme"],
  jsxFramework: "react",
});
