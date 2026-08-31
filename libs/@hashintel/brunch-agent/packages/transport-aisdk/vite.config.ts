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
        headers: fileURLToPath(new URL("src/headers.ts", import.meta.url)),
        index: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [/^@hashintel\/brunch-agent(?:\/.*)?$/u, "ai", "valibot"],
    },
    sourcemap: true,
  },
  root: packageRoot,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
