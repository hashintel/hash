import { defineConfig } from "vitest/config";

// eslint-disable-next-line import/no-default-export -- Vitest requires a default config export.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  oxc: false,
  test: {
    environment: "node",
  },
});
