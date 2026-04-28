import { globSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default defineConfig({
  platform: "neutral",
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    theme: "./src/theme.ts",
    ...componentEntries,
  },
  format: ["esm"],
  dts: true,
});
