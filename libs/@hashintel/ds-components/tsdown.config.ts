import { globSync } from "node:fs";
import path from "node:path";

import svgr from "@svgr/rollup";
import { defineConfig } from "tsdown";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default defineConfig({
  clean: true,
  dts: true,
  external: ["typescript", "pkg-types"],
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    tokens: "./src/tokens.ts",
    ...componentEntries,
  },
  format: ["esm"],
  outDir: "dist",
  platform: "neutral",
  plugins: [svgr()],
  tsconfig: "./tsconfig.build.json",
});
