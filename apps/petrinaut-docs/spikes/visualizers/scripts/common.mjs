import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const WT =
  process.env.HASH_REPO ?? path.resolve(import.meta.dirname, "../../../../..");
export const wtRequire = createRequire(WT + "/package.json");
export const ts = wtRequire("@typescript/old");
export const tsLibDir = path.join(
  path.dirname(wtRequire.resolve("@typescript/old/package.json")),
  "lib",
);
export const reactTypesDir = path.dirname(
  wtRequire.resolve("@types/react/package.json", {
    paths: [WT + "/libs/@hashintel/petrinaut"],
  }),
);
export const csstypeDir = path.dirname(
  wtRequire.resolve("csstype/package.json", { paths: [reactTypesDir] }),
);

/** Extract `visualizerCode` template literals from the example nets. */
export function exampleVisualizers() {
  const dir = path.join(WT, "libs/@hashintel/petrinaut-core/src/examples");
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const re = /visualizerCode:\s*`([\s\S]*?)`,?\n/g;
    let m;
    let index = 0;
    while ((m = re.exec(src))) {
      const code = m[1]
        .replace(/\\`/g, "`")
        .replace(/\\\$\{/g, "${")
        .replace(/\\\\/g, "\\");
      out.push({ name: `${file.replace(".ts", "")}#${index++}`, code });
    }
  }
  return out;
}

export function ms(t0) {
  return (performance.now() - t0).toFixed(1) + " ms";
}
