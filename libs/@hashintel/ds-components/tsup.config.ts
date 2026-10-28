import { globSync } from "node:fs";
import path from "node:path";

import svgr from "esbuild-plugin-svgr";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", {
    exclude: ["**/*.stories.tsx", "**/*.test.tsx"],
  }).map((file) => [`components/${path.basename(file, ".tsx")}`, file]),
);

// The doc blocks are importable entry points because the published raw MDX
// (dist/docs/mdx) imports them as `@hashintel/ds-components/docs/blocks/<x>`.
// Sharing the build (and its chunk splitting) with the component entries
// keeps one module instance per component across both surfaces. A block may
// live flat (`stage.tsx`) or as an entry point inside its own folder
// (`props-table/props-table.tsx`); both publish under the flat block name.
const docsBlockEntries = Object.fromEntries(
  globSync(["./docs/blocks/*.tsx", "./docs/blocks/*/*.tsx"]).flatMap((file) => {
    const name = path.basename(file, ".tsx");
    const parent = path.basename(path.dirname(file));
    if (parent !== "blocks" && parent !== name) {
      return [];
    }
    return [[`docs/blocks/${name}`, file]];
  }),
);

// Inline demo components extracted from the docs pages for the published MDX,
// staged in `.build` by scripts/generate-docs-mdx/generate-docs-demos.ts
// before this build runs; the compiled entries publish at `dist/docs/demos`.
const docsDemoEntries = Object.fromEntries(
  globSync("./.build/docs-demos/*.gen.tsx").map((file) => [
    `docs/demos/${path.basename(file, ".gen.tsx")}`,
    file,
  ]),
);

export default {
  // Everything in this package is client-side React (hooks throughout);
  // the directive makes the modules importable from React Server Components
  // (e.g. MDX compiled by a Next.js docs site). It is inert elsewhere,
  // including for the preset/tokens entries Panda configs evaluate in node.
  banner: { js: '"use client";' },
  clean: true,
  // Declarations are emitted separately via `tsc -p tsconfig.dts.json` (see
  // `build:lib`): tsup's rollup-dts worker needed ~2.9 GB heap and OOM'd on
  // memory-constrained machines.
  dts: false,
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    // The `./tokens` export exposes the preset's token definitions directly;
    // dist/tokens.js is the entry, no barrel module in src.
    tokens: "./src/preset/tokens.ts",
    // Published flat (`@hashintel/ds-components/noop`): the docs pages import
    // it, and under RSC it must come from a small client entry point rather
    // than the package barrel.
    "components/noop": "./src/util/noop.ts",
    ...componentEntries,
    ...docsBlockEntries,
    ...docsDemoEntries,
  },
  esbuildPlugins: [svgr()],
  format: ["esm"],
  outDir: "dist",
  platform: "neutral",
  tsconfig: "./tsconfig.json",
};
