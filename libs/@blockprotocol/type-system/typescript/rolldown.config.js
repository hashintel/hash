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
        name: "check-public-imports",
        generateBundle(_options, bundle) {
          for (const chunk of Object.values(bundle)) {
            if (chunk.type !== "chunk") {
              continue;
            }

            for (const importedModule of [
              ...chunk.imports,
              ...chunk.dynamicImports,
            ]) {
              if (importedModule.startsWith("@local/")) {
                this.error(
                  `${chunk.fileName} imports from unpublished package ${importedModule}`,
                );
              }
            }
          }
        },
      },
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
