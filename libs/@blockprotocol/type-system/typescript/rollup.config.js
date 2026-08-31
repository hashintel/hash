import fs from "node:fs";
import path from "node:path";

import commonjs from "@rollup/plugin-commonjs";
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
    commonjs(),
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

        // `src/generated` holds declaration files, which TypeScript passes over rather than
        // emitting. Without this copy the re-exports in the emitted `main.d.ts` dangle.
        const generatedDir = path.resolve(outdir(fmt, env), "generated");
        fs.mkdirSync(generatedDir, { recursive: true });

        for (const file of fs.readdirSync(path.resolve("src/generated"))) {
          fs.copyFileSync(
            path.resolve("src/generated", file),
            path.join(generatedDir, file),
          );
        }
      },
    },
  ],
});

export default [rolls("es", "fat"), rolls("es", "slim")];
