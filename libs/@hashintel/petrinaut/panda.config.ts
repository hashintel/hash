import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Whether to use css reset
  preflight: { scope: ".petrinaut-root" },

  // Where to look for css declarations
  include: ["./src/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {},
  },

  importMap: "@hashintel/ds-helpers",
  presets: ["@hashintel/ds-theme"],
});
