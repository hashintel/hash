import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      fileName: "index",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        /^node:/u,
        /^@flue\//u,
        /^@hashintel\/brunch-agent(?:\/.*)?$/u,
      ],
    },
    sourcemap: true,
  },
  root: packageRoot,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
