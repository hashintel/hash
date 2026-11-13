import fs from "node:fs";
/** Compile the React variants with Babel standalone, with and without the React Compiler, so the build needs no React plugin. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Babel = require("@babel/standalone");
const plugin = require("babel-plugin-react-compiler");
Babel.registerPlugin("react-compiler", plugin.default ?? plugin);
const compile = (src, compiled) =>
  Babel.transform(src, {
    filename: "x.tsx",
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }],
    ],
    plugins: compiled
      ? [
          [
            "react-compiler",
            {
              target: "19",
              compilationMode: "infer",
              panicThreshold: "all_errors",
            },
          ],
        ]
      : [],
  }).code;
for (const [name, file, compiled] of [
  ["react-flat", "flat.tsx", false],
  ["react-items", "items.tsx", false],
  ["react-items-memo", "items-memo.tsx", false],
  ["react-flat-compiled", "flat.tsx", true],
  ["react-items-compiled", "items.tsx", true],
]) {
  const out = compile(fs.readFileSync(`src/react/${file}`, "utf8"), compiled);
  fs.writeFileSync(
    `gen/${name}.js`,
    out.replace("../harness.js", "../src/harness.js"),
  );
  console.log(
    name,
    compiled ? (/_c\(/.test(out) ? "memoized" : "NOT memoized") : "plain",
    out.length,
    "chars",
  );
}
