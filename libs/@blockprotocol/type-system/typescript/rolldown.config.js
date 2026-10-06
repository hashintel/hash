import fs from "node:fs";
import path from "node:path";

import { wasm } from "@rollup/plugin-wasm";
import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const production = !process.env.ROLLDOWN_WATCH;

const bundles = [
  { input: "src/main.ts", outputDirectory: "dist/es", inlineWasm: true },
  {
    input: "src/main-slim.ts",
    outputDirectory: "dist/es-slim",
    inlineWasm: false,
  },
];

export default defineConfig(
  bundles.map(({ input, outputDirectory, inlineWasm }) => ({
    input,
    output: {
      dir: outputDirectory,
      format: "es",
      entryFileNames: "[name].js",
      sourcemap: !production,
    },
    plugins: [
      inlineWasm && wasm({ targetEnv: "auto-inline" }),
      dts({ generator: "tsgo", tsconfig: "./tsconfig.build.json" }),
      {
        name: "copy-wasm",
        generateBundle() {
          fs.mkdirSync(path.resolve("dist/wasm"), { recursive: true });
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
  })),
);
