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
  exclude: ["**/*.stories.tsx"],
});

for (const file of componentFiles) {
  const name = path.basename(file, ".tsx");
  const dir = path.basename(path.dirname(file));
  writeFileSync(
    path.join("dist", "components", `${name}.d.ts`),
    `export * from "./${dir}/${name}";\n`,
  );
}
