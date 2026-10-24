/**
 * A second TypeScript language service, JSX-aware, with React's types and
 * no lib.dom: the shape a visualizer service in the LSP worker would take.
 */
import fs from "node:fs";
import path from "node:path";

import {
  ts,
  tsLibDir,
  reactTypesDir,
  csstypeDir,
  exampleVisualizers,
  ms,
} from "./common.mjs";

const withDom = process.argv.includes("--dom");
const files = new Map();
const read = (p) => fs.readFileSync(p, "utf8");
for (const lib of [
  "lib.es5.d.ts",
  "lib.es2015.core.d.ts",
  "lib.es2015.symbol.d.ts",
  "lib.es2015.iterable.d.ts",
  "lib.es2015.collection.d.ts",
  "lib.decorators.d.ts",
  "lib.decorators.legacy.d.ts",
  ...(withDom ? ["lib.dom.d.ts"] : []),
]) {
  files.set("/" + lib, read(path.join(tsLibDir, lib)));
}
// React's types resolve without lib.dom: global.d.ts carries empty DOM stubs.
files.set(
  "/node_modules/react/package.json",
  JSON.stringify({ name: "react", version: "19.2.0", types: "index.d.ts" }),
);
for (const f of ["index.d.ts", "global.d.ts", "jsx-runtime.d.ts"])
  files.set("/node_modules/react/" + f, read(path.join(reactTypesDir, f)));
files.set(
  "/node_modules/csstype/package.json",
  JSON.stringify({ name: "csstype", version: "3.0.0", types: "index.d.ts" }),
);
files.set(
  "/node_modules/csstype/index.d.ts",
  read(path.join(csstypeDir, "index.d.ts")),
);

// What the LSP would generate per place: token type, parameters, the constructor.
files.set(
  "/parameters-defs.ts",
  `export type Parameters = { gravitational_constant: number; planet_radius: number };`,
);
files.set(
  "/types/sat.ts",
  `export type Color_sat = { x: number; y: number; vx: number; vy: number; id: bigint };`,
);
files.set(
  "/places/p1/visualizer-defs.ts",
  [
    `import type { ReactElement } from "react";`,
    `import type { Parameters } from "../../parameters-defs";`,
    `import type { Color_sat } from "../../types/sat";`,
    `export type VisualizerProps = { tokens: readonly Color_sat[]; parameters: Parameters };`,
    `export declare function Visualization(fn: (props: VisualizerProps) => ReactElement): (props: VisualizerProps) => ReactElement;`,
  ].join("\n"),
);

const PREFIX = `import { Visualization } from "./visualizer-defs";\n`;
const sample = exampleVisualizers().find((v) =>
  v.name.startsWith("satellites-launcher"),
);
const VISUALIZER_FILE = "/places/p1/visualizer.tsx";
files.set(VISUALIZER_FILE, PREFIX + sample.code);

const versions = new Map();
const options = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
  lib: [...files.keys()]
    .filter((f) => f.startsWith("/lib."))
    .map((f) => f.slice(1)),
  typeRoots: [],
  types: [],
  noEmit: true,
};
const host = {
  getScriptFileNames: () =>
    [...files.keys()].filter(
      (f) => !f.startsWith("/node_modules/") && !f.startsWith("/lib."),
    ),
  getCompilationSettings: () => options,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) =>
    files.has(f) ? ts.ScriptSnapshot.fromString(files.get(f)) : undefined,
  getCurrentDirectory: () => "/",
  getDefaultLibFileName: () => "/lib.es2015.core.d.ts",
  fileExists: (f) => files.has(f),
  readFile: (f) => files.get(f),
  directoryExists: (d) =>
    [...files.keys()].some((f) => f.startsWith(d.endsWith("/") ? d : d + "/")),
  getDirectories: () => [],
};
const t0 = performance.now();
const service = ts.createLanguageService(host);
console.log(
  `lib.dom: ${withDom} | sample: ${sample.name} (${sample.code.length} chars)`,
);
const diag = (label) => {
  const t = performance.now();
  const ds = [
    ...service.getSyntacticDiagnostics(VISUALIZER_FILE),
    ...service.getSemanticDiagnostics(VISUALIZER_FILE),
  ];
  console.log(
    `${label.padEnd(44)} ${ms(t).padStart(10)}  ${ds.length} diagnostics`,
  );
  return ds;
};
console.log("createLanguageService".padEnd(44), ms(t0).padStart(10));
const first = diag("cold diagnostics (program + lib parse)");
for (const d of first)
  console.log(
    "  sample diag TS" +
      d.code +
      ": " +
      ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 160),
  );
versions.set(VISUALIZER_FILE, 1);
files.set(VISUALIZER_FILE, files.get(VISUALIZER_FILE) + "\n// edit");
diag("warm diagnostics after an edit");
versions.set(VISUALIZER_FILE, 2);
files.set(VISUALIZER_FILE, files.get(VISUALIZER_FILE) + "\n// edit 2");
diag("warm diagnostics after another edit");
const t1 = performance.now();
const completions = service.getCompletionsAtPosition(
  VISUALIZER_FILE,
  files.get(VISUALIZER_FILE).indexOf("viewBox") + 2,
  {},
);
console.log(
  "completions at an attribute".padEnd(44),
  ms(t1).padStart(10),
  completions ? `${completions.entries.length} entries` : "none",
);

// Now the checks a visualizer author needs.
const bad =
  PREFIX +
  `
export default Visualization(({ tokens, parameters }) => {
  const [n, setN] = React.useState(0);
  const data = fetch("https://example.com");
  const w = window.innerWidth;
  return (
    <svg viewBox="0 0 10 10" strokeWidht={2} onClick={() => setN(n + 1)}>
      {tokens.map((t) => <circle key={t.id} cx={t.x} cy={t.z} r={parameters.planet_radius} fill="red" />)}
      <text>{tokens.length} tokens</text>
    </svg>
  );
});`;
files.set(VISUALIZER_FILE, bad);
versions.set(VISUALIZER_FILE, 3);
const ds = diag("diagnostics for a file with 5 mistakes");
for (const d of ds) {
  const { line } = ts.getLineAndCharacterOfPosition(
    service.getProgram().getSourceFile(VISUALIZER_FILE),
    d.start,
  );
  console.log(
    `  L${line + 1 - 1} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 120)}`,
  );
}
