import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  // Generated brand artwork: ~10k pure-SVG files with no Panda styles.
  // Scanning them blows the default Node heap.
  exclude: ["./src/**/*.test.{ts,tsx}", "./src/integration-icon/geometry/**"],
  importMap: "@hashintel/ds-helpers",
  outdir: "styled-system",
});
