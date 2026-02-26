import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Whether to use css reset
  preflight: { scope: ".petrinaut-root" },

  // Prefix all utility classes (e.g. `.d_flex` → `.pn_d_flex`)
  // prefix: "pn",

  // Scope CSS variables to petrinaut root instead of :root
  cssVarRoot: ".petrinaut-root",

  // Override light/dark conditions from ds-theme preset so that
  // conditional tokens (colors) are scoped to .petrinaut-root instead of :root.
  conditions: {
    extend: {
      light: ".petrinaut-root &",
      dark: ".dark .petrinaut-root &, [data-theme='dark'] .petrinaut-root &",
    },
  },

  // Where to look for css declarations
  include: ["./src/**/*.{js,jsx,ts,tsx}", "./.storybook/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeOut: {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-10px)" },
        },
      },
    },
  },

  // Polyfill CSS @layer for embedding in HASH, where unlayered global
  // resets (* { padding: 0 }) would otherwise override layered utilities.
  polyfill: true,

  importMap: "@hashintel/ds-helpers",
  presets: ["@hashintel/ds-theme"],
});
