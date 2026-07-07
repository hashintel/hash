import { globSync } from "node:fs";
import path from "node:path";

import svgr from "esbuild-plugin-svgr";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default {
  clean: true,
  dts: true,
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    tokens: "./src/tokens.ts",
    ...componentEntries,
  },
  esbuildPlugins: [svgr()],
  format: ["esm"],
  outDir: "dist",
  platform: "neutral",
  tsconfig: "./tsconfig.build.json",
};
