import { defineConfig } from "@pandacss/dev";
import { preset } from "./src/main";

export default defineConfig({
  // get strict feedback
  strictTokens: true,

  // Use ds-theme's own preset for the stories
  presets: [preset],

  // Whether to use css reset
  preflight: true,

  // Where to look for CSS declarations (stories only)
  include: ["./src/**/*.{ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Output directory for generated files
  outdir: "styled-system",

  // Enable JSX patterns
  jsxFramework: "react",
});
