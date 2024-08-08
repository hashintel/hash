import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { RollupOptions } from "rollup";

const PRODUCTION = !process.env.ROLLUP_WATCH;
const OUT_DIR = "dist/esm";

const bundles: RollupOptions[] = [
  {
    input: ["src/main.ts"],
    output: {
      dir: OUT_DIR,
      entryFileNames: "[name].mjs",
      format: "module",
      name: "hash-backend-load",
      sourcemap: !PRODUCTION,
    },
    plugins: [
      commonjs(),
      typescript({
        declaration: true,
        outDir: OUT_DIR,
        rootDir: "src",
        sourceMap: !PRODUCTION,
        inlineSources: !PRODUCTION,
        outputToFilesystem: false,
      }),
      nodeResolve(),
    ],
    external: [
      /^@local\/.*/,
      /^@ory\/.*/,
      /^@opentelemetry\/.*/,
      "dotenv-flow",
      "uuid",
    ],
  },
];
export default bundles;
