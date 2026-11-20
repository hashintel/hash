import { createRequire } from "node:module";

import { ts, WT, wtRequire, exampleVisualizers, ms } from "./common.mjs";
const uiRequire = createRequire(WT + "/libs/@hashintel/petrinaut/package.json");
const Babel = uiRequire("@babel/standalone");
let sucrase = null;
try {
  sucrase = createRequire(import.meta.url)("sucrase");
} catch {}

const samples = exampleVisualizers();
const biggest = samples.reduce((a, b) =>
  a.code.length > b.code.length ? a : b,
);
console.log(`sample: ${biggest.name}, ${biggest.code.length} chars`);

const tsOpts = {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
  fileName: "visualizer.tsx",
};
const runs = (label, fn) => {
  let t0 = performance.now();
  fn();
  const cold = ms(t0);
  t0 = performance.now();
  for (let i = 0; i < 20; i++) fn();
  const warm = ((performance.now() - t0) / 20).toFixed(2) + " ms";
  console.log(
    `${label.padEnd(28)} cold ${cold.padStart(10)}  warm avg ${warm}`,
  );
};
runs("ts.transpileModule (TS 6)", () =>
  ts.transpileModule(biggest.code, tsOpts),
);
runs("@babel/standalone ts+react", () =>
  Babel.transform(biggest.code, {
    filename: "visualizer.tsx",
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "classic" }],
    ],
  }),
);
if (sucrase)
  runs("sucrase typescript+jsx", () =>
    sucrase.transform(biggest.code, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "classic",
    }),
  );
const out = ts.transpileModule(biggest.code, tsOpts).outputText;
console.log("\nTS output head:\n" + out.split("\n").slice(0, 6).join("\n"));
