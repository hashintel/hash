import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const production = !process.env.ROLLUP_WATCH;

const outdir = (fmt, env) => {
  if (env === "node") {
    return `dist/node`;
  } else {
    return `dist/${fmt}${env === "slim" ? "-slim" : ""}`;
  }
};

const rolls = (fmt, env) => ({
  input: "src/main.ts",
  output: {
    dir: outdir(fmt, env),
    entryFileNames: `[name].${fmt === "cjs" ? "cjs" : "js"}`,
    format: fmt,
    name: "hash-backend-performance",
    sourcemap: !production,
  },
  plugins: [
    commonjs(),
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
  external: ["@ory/client"],
});

export default [rolls("cjs", "fat")];
