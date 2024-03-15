/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [],
  build: {
    target: "esnext",
  },
  test: {
    coverage: {
      enabled: process.env.TEST_COVERAGE === "true",
      provider: "istanbul",
      reporter: ["lcov", "text"],
      include: ["**/*.{c,m,}{j,t}s{x,}"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
    environment: "node",
  },
  assetsInclude: ["**/*.wasm"],
});
