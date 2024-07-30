import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { RollupOptions } from "rollup";

const PRODUCTION = !process.env.ROLLUP_WATCH;
const OUT_DIR = "dist/esm";

const bundles: RollupOptions[] = [
  {
    input: "src/main.ts",
    output: {
      dir: OUT_DIR,
      entryFileNames: "[name].mjs",
      format: "module",
      name: "hash-backend-performance",
      sourcemap: !PRODUCTION,
    },
    plugins: [
      commonjs(),
      typescript({
        outDir: OUT_DIR,
        rootDir: "src",
        sourceMap: !PRODUCTION,
        inlineSources: !PRODUCTION,
        outputToFilesystem: false,
      }),
      nodeResolve(),
    ],
    external: ["@ory/client", /^@local\/.*/],
  },
];
export default bundles;
