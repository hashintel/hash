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
    extend: {
      keyframes: {
        firingRelease: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "40%": { transform: "scale(1.3)", opacity: "0.8" },
          "100%": { transform: "scale(0.5)", opacity: "0" },
        },
      },
    },
  },

  importMap: "@hashintel/ds-helpers",
  presets: ["@hashintel/ds-theme"],
});
