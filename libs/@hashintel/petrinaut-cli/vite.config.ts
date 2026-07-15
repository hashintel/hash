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
      entry: resolve(packageRoot, "src/cli.ts"),
      fileName: () => "cli.js",
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
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
