import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { wasm } from "@rollup/plugin-wasm";

const production = !process.env.ROLLUP_WATCH;

const outdir = (fmt, env) => {
  if (env === "node") {
    return `dist/node`;
  } else {
    return `dist/${fmt}${env === "slim" ? "-slim" : ""}`;
  }
};

const rolls = (fmt, env) => ({
  input: env !== "slim" ? "src/main.ts" : "src/main-slim.ts",
  output: {
    dir: outdir(fmt, env),
    format: fmt,
    entryFileNames: `[name].${fmt === "cjs" ? "cjs" : "js"}`,
    name: "type-system",
    sourcemap: !production,
  },
  plugins: [
    // We want to inline our wasm bundle as base64 on non-slim builds.
    env !== "slim" ? wasm({ targetEnv: "auto-inline" }) : undefined,
    typescript({
      declaration: true,
      declarationDir: outdir(fmt, env),
      outDir: outdir(fmt, env),
      rootDir: "src",
      sourceMap: !production,
      inlineSources: !production,
      outputToFilesystem: false,
    }),
    nodeResolve(),
  ],
});

export default [
  rolls("umd", "fat"),
  rolls("es", "fat"),
  rolls("cjs", "fat"),
  rolls("cjs", "node"),
  rolls("es", "slim"),
  rolls("cjs", "slim"),
];
