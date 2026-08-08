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
        // HIR compiler (bundles the TypeScript frontend — heavy; used by the
        // LSP worker internally and by tooling/playgrounds).
        hir: resolve(packageRoot, "src/hir.ts"),
        // Dependency-free instantiation of compiled HIR artifacts.
        "hir-runtime": resolve(packageRoot, "src/hir-runtime.ts"),
        optimization: resolve(packageRoot, "src/optimization.ts"),
        // Backend contract and selection. Separate entry so registering the
        // WebGPU backend does not drag the shader generator in with it: this
        // holds the contract and the worker-pool backend only.
        experiments: resolve(packageRoot, "src/experiments.ts"),
        // Experimental WebGPU compute backend. Separate entry: it pulls in the
        // HIR frontend and is opt-in, so it must stay out of the main bundle.
        webgpu: resolve(packageRoot, "src/webgpu.ts"),
        "examples/index": resolve(packageRoot, "src/examples/index.ts"),
        "workers/lsp": resolve(packageRoot, "src/workers/lsp.ts"),
        "workers/monte-carlo": resolve(
          packageRoot,
          "src/workers/monte-carlo.ts",
        ),
        "workers/simulation": resolve(packageRoot, "src/workers/simulation.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        // Peer (optional): only the ./hir compiler entry needs it.
        "typescript",
        "elkjs",
        "immer",
        "uuid",
        "vscode-languageserver-types",
        "zod",
      ],
    },
    sourcemap: true,
    minify: true,
    emptyOutDir: true,
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
      external: ["typescript"],
    }),

    command === "build" &&
      dts({ tsgo: true }).map((plugin) =>
        plugin.name.endsWith("fake-js")
          ? { ...plugin, enforce: "pre" }
          : plugin,
      ),
  ],

  experimental: {
    renderBuiltUrl: (filename) => {
      if (filename.includes(".worker")) {
        return `./${filename}`;
      }
      return filename;
    },
  },
}));
