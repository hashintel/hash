import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "neutral",
  entry: [
    "./src/main.ts",
    "./src/preset.ts",
    "./src/theme.ts",
    "./src/tokens.ts",
    "./src/components/*.tsx",
  ],
  format: ["esm"],
  dts: true,
});
