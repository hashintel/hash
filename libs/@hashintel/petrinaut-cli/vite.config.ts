import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default defineConfig({
  build: {
    lib: {
      entry: {
        cli: resolve(packageRoot, "src/cli.ts"),
        // Spawned per shard by node-simulation-worker.ts, which resolves it as
        // a sibling of cli.js.
        "simulation-worker": resolve(
          packageRoot,
          "src/runtime/simulation-worker.entry.ts",
        ),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    rolldownOptions: {
      external: (id) =>
        id === "@hashintel/petrinaut-core" ||
        id.startsWith("@hashintel/petrinaut-core/") ||
        nodeBuiltins.has(id),
      output: {
        // Only the executable gets the shebang; a hashbang line is legal in
        // any ES module but has no place in a worker bundle.
        banner: (chunk) =>
          chunk.fileName === "cli.js" ? "#!/usr/bin/env node" : "",
      },
    },
  },
});
