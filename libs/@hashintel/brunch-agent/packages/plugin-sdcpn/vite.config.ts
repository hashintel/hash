import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        flue: fileURLToPath(new URL("src/flue.ts", import.meta.url)),
        index: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        /^@flue\/runtime(?:\/.*)?$/u,
        /^@hashintel\/brunch-agent(?:\/.*)?$/u,
        /^@hashintel\/petrinaut-core(?:\/.*)?$/u,
        "valibot",
      ],
    },
    sourcemap: true,
  },
  root: packageRoot,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
