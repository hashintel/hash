import { globSync } from "node:fs";
import path from "node:path";

import svgr from "esbuild-plugin-svgr";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default {
  // Suspected instance of the same bug that empties `ds-helpers`' published
  // `styled-system/`: `clean: true` empties `dist/`, which is this package's
  // published payload, and `@hashintel/petrinaut`'s `prepublishOnly` rebuilds
  // this package concurrently during `changeset publish`. Not reproduced —
  // flagged by analogy and by the non-monotonic published file counts.
  clean: false,
  // Declarations are emitted separately via `tsc -p tsconfig.dts.json` (see
  // `build:lib`): tsup's rollup-dts worker needed ~2.9 GB heap and OOM'd on
  // memory-constrained machines.
  dts: false,
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
