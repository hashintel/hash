import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// eslint-disable-next-line import/no-default-export -- Vitest requires a default config export.
export default defineConfig({
  resolve: {
    alias: {
      "next/router": fileURLToPath(import.meta.resolve("vinext/shims/router")),
      "next/link": fileURLToPath(import.meta.resolve("vinext/shims/link")),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  oxc: false,
  test: {
    environment: "node",
  },
});
