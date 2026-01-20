import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "neutral",
  entry: ["./src/main.ts", "./src/components/*.tsx"],
  format: ["esm"],
  dts: true,
});
