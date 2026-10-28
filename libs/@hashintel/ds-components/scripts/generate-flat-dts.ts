/**
 * Writes flat declaration stubs (`dist/components/<name>.d.ts`) that re-export
 * from the directory-structured output of `tsc -p tsconfig.dts.json`.
 *
 * `tsup` flattens component JS entries to `dist/components/<name>.js`, and the
 * package's `./*` export condition maps types to the same flat path. `tsc`
 * preserves the `src/components/<Dir>/<name>.tsx` structure, so each flat stub
 * bridges the two.
 */
import { globSync, writeFileSync } from "node:fs";
import path from "node:path";

const componentFiles = globSync("./src/components/*/*.tsx", {
  exclude: ["**/*.stories.tsx", "**/*.test.tsx"],
});

for (const file of componentFiles) {
  const name = path.basename(file, ".tsx");
  const dir = path.basename(path.dirname(file));
  writeFileSync(
    path.join("dist", "components", `${name}.d.ts`),
    `export * from "./${dir}/${name}";\n`,
  );
}

// `noop` is a util module published flat (see tsup.config.ts).
writeFileSync(
  path.join("dist", "components", "noop.d.ts"),
  `export * from "../util/noop";\n`,
);

// The `./tokens` export points straight at the preset's token definitions
// (no barrel in src); bridge the flat export-map path to the structured emit.
writeFileSync(
  path.join("dist", "tokens.d.ts"),
  `export * from "./preset/tokens";\n`,
);
