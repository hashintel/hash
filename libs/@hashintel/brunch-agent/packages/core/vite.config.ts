import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        "client-tools": fileURLToPath(
          new URL("src/client-tools.ts", import.meta.url),
        ),
        flue: fileURLToPath(new URL("src/flue.ts", import.meta.url)),
        index: fileURLToPath(new URL("src/index.ts", import.meta.url)),
        "question-marker": fileURLToPath(
          new URL("src/question-marker.ts", import.meta.url),
        ),
        storage: fileURLToPath(new URL("src/storage.ts", import.meta.url)),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [/^node:/u, /^@flue\/runtime(?:\/.*)?$/u, "valibot"],
    },
    sourcemap: true,
  },
  root: packageRoot,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
