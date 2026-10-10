import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: ["./src/**/*.test.{ts,tsx}"],
  importMap: "@hashintel/ds-helpers",
  outdir: "styled-system",
});
