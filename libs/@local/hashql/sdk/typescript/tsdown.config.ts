import { defineConfig } from "tsdown";

import type { UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/main.ts", "src/do/index.ts"],
  format: "esm",
  platform: "neutral",
  unbundle: true,
  fixedExtension: false,
  dts: true,
  sourcemap: true,
});

export default config;
