import fs from "node:fs";
import path from "node:path";

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
    entryFileNames: `[name].js`,
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
    {
      name: "copy-pkg",
      resolveImportMeta: () => `""`,
      generateBundle() {
        fs.mkdirSync(path.resolve(`dist/wasm`), { recursive: true });

        fs.copyFileSync(
          path.resolve("../rust/pkg/type-system_bg.wasm"),
          path.resolve("dist/wasm/type-system.wasm"),
        );
        fs.copyFileSync(
          path.resolve("../rust/pkg/type-system_bg.wasm.d.ts"),
          path.resolve("dist/wasm/type-system.wasm.d.ts"),
        );
      },
    },
  ],
});

export default [rolls("es", "fat"), rolls("es", "slim")];
