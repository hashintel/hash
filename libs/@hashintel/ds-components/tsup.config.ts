import { globSync } from "node:fs";
import path from "node:path";

import svgr from "esbuild-plugin-svgr";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default {
  // `dist/` is this package's published payload, so it is in principle exposed
  // to the same race that shipped empty `@hashintel/ds-helpers` tarballs:
  // `@hashintel/petrinaut`'s `prepublishOnly` rebuilds this package while
  // `changeset publish` may be packing it, and this `clean` empties `dist/`.
  // Suspected, never reproduced.
  //
  // `clean: false` is *not* the fix. It leaves stale output behind, and the
  // `"./*"` entry in this package's `exports` maps straight into
  // `dist/components/`, so a deleted component's stale artifact would stay
  // importable and would still be published. That is the same objection that
  // ruled out dropping Panda's `--clean` for `ds-helpers`.
  //
  // The consistent fix is the one `ds-helpers` now uses: build into a private
  // staging directory and move it into `dist/` atomically. It is not applied
  // here because `dist/` is assembled by three independent steps that each
  // write into it directly — `build:lib:js` (this config), `build:lib:dts`
  // (`tsc -p tsconfig.dts.json` plus `scripts/generate-flat-dts.ts`) and
  // `build:buildinfo` (`panda ship --outfile dist/...`) — so staging it means
  // restructuring all three behind a single promote step. Tracked separately
  // rather than half-fixed here.
  clean: true,
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
