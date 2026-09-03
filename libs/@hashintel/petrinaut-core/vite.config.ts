import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { dts } from "rolldown-plugin-dts";
import { replacePlugin } from "rolldown/plugins";
import { defineConfig, esmExternalRequirePlugin } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  build: {
    lib: {
      entry: {
        index: resolve(packageRoot, "src/index.ts"),
        // Dedicated edge-safe entry exposing only the AI prompt + tool schemas.
        ai: resolve(packageRoot, "src/ai.ts"),
        // Node/tooling-only reusable model compiler. This depends on the
        // TypeScript-powered HIR compiler and must stay out of the main entry.
        "compiled-model": resolve(packageRoot, "src/compiled-model.ts"),
        // HIR compiler (bundles the TypeScript frontend, heavy; used by the
        // LSP worker internally and by tooling/playgrounds).
        hir: resolve(packageRoot, "src/hir.ts"),
        // Dependency-free instantiation of compiled HIR artifacts.
        "hir-runtime": resolve(packageRoot, "src/hir-runtime.ts"),
        optimization: resolve(packageRoot, "src/optimization.ts"),
        // Runs the Optuna study in a Pyodide worker; inlines the Python sources.
        "browser-optimization": resolve(
          packageRoot,
          "src/browser-optimization.ts",
        ),
        // Dependency-free entry: the selection vocabulary alone, for hosts that
        // validate selection in a route or a server function.
        selection: resolve(packageRoot, "src/selection.ts"),
        // Backend contract and selection. Separate entry so registering the
        // WebGPU backend does not drag the shader generator in with it: this
        // holds the contract and the worker-pool backend only.
        experiments: resolve(packageRoot, "src/experiments.ts"),
        // Experimental WebGPU compute backend. Separate entry: it is opt-in
        // and carries the whole shader generator, so it must stay out of the
        // main bundle and load only when a GPU experiment is requested.
        webgpu: resolve(packageRoot, "src/webgpu.ts"),
        "examples/index": resolve(packageRoot, "src/examples/index.ts"),
        "workers/lsp": resolve(packageRoot, "src/workers/lsp.ts"),
        "workers/monte-carlo": resolve(
          packageRoot,
          "src/workers/monte-carlo.ts",
        ),
        "workers/optimizer": resolve(packageRoot, "src/workers/optimizer.ts"),
        "workers/simulation": resolve(packageRoot, "src/workers/simulation.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "elkjs",
        "immer",
        "js-yaml",
        "uuid",
        "vscode-languageserver-types",
        "zod",
      ],
    },
    sourcemap: true,
    minify: true,
    emptyOutDir: true,
  },

  // rolldown-plugin-dts emits declaration modules that Vite must not
  // transform as JavaScript. Setting this replaces Vite's default exclusions.
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },

  define: {
    "process.versions": JSON.stringify({ pnp: undefined }),
  },

  worker: {
    plugins: () => [
      replacePlugin({
        "typeof window": '"undefined"',
        "typeof process": "'undefined'",
        "typeof process.versions.pnp": "'undefined'",
      }),
      replacePlugin(
        { "isNodeLikeSystem()": "false" },
        { delimiters: ["(?<!function )\\b", ""] },
      ),
    ],
  },

  plugins: [
    esmExternalRequirePlugin({
      // Peer (optional): only the ./hir compiler entry needs it.
      external: ["typescript"],
    }),

    command === "build" && dts({ generator: "tsgo" }),
  ],

  experimental: {
    // A worker URL resolved against the importing module survives bundling by
    // a host: it becomes `new URL(<path>, import.meta.url)`, which the host's
    // bundler copies as an asset, where a page-relative path would 404.
    renderBuiltUrl: (filename) => {
      if (filename.includes(".worker")) {
        return { relative: true };
      }
      return filename;
    },
  },
}));
