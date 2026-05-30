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
        // Needed to avoid pulling in heavy and edge-incompatible deps (e.g. @babel/standalone)
        ai: resolve(packageRoot, "src/ai.ts"),
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
        "@babel/standalone",
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
