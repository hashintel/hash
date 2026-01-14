import { defineConfig } from "@pandacss/dev";
import { preset } from "./src/main";

export default defineConfig({
  strictTokens: true,
  presets: [preset],
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  jsxFramework: "react",
});
