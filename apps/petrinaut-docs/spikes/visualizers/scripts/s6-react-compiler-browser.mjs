import { createRequire } from "node:module";

import { exampleVisualizers, ms } from "./common.mjs";
const require = createRequire(import.meta.url);
const Babel = require("@babel/standalone");
const plugin = require("babel-plugin-react-compiler");
Babel.registerPlugin("react-compiler", plugin.default ?? plugin);

const sample = exampleVisualizers().find((v) =>
  v.name.startsWith("satellites-launcher"),
).code;
const named = sample
  .replace(
    "export default Visualization(({ tokens, parameters }) => {",
    "const Visualizer = ({ tokens, parameters }) => {",
  )
  .replace(/\}\);\s*$/, "};\nexport default Visualization(Visualizer);");

for (const [label, code, mode] of [
  ["anonymous arrow in call, mode=infer", sample, "infer"],
  ["anonymous arrow in call, mode=all", sample, "all"],
  ["named component, mode=infer", named, "infer"],
]) {
  const opts = {
    filename: "visualizer.tsx",
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }],
    ],
    plugins: [
      [
        "react-compiler",
        { target: "19", compilationMode: mode, panicThreshold: "none" },
      ],
    ],
  };
  let t0 = performance.now();
  let out;
  try {
    out = Babel.transform(code, opts).code;
  } catch (e) {
    console.log(`${label}: THREW ${e.message.slice(0, 200)}`);
    continue;
  }
  const cold = ms(t0);
  t0 = performance.now();
  for (let i = 0; i < 10; i++) Babel.transform(code, opts);
  const warm = ((performance.now() - t0) / 10).toFixed(1);
  const memoized =
    /_c\(\d+\)/.test(out) || /useMemoCache|compiler-runtime/.test(out);
  console.log(
    `${label.padEnd(40)} cold ${cold.padStart(9)} warm ${warm} ms  memoized=${memoized}  out=${out.length} chars`,
  );
  if (memoized)
    console.log(
      "   " +
        out
          .split("\n")
          .filter((l) => /_c\(|\$\[\d+\] (!==|===)|compiler-runtime/.test(l))
          .slice(0, 6)
          .join("\n   "),
    );
}
