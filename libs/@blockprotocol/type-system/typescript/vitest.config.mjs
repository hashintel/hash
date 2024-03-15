/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

// This is super hacky, but basically adds the `?url` suffix to any wasm import
// this "fixes" the current issues with vite and wasm imports
// The issue is actually more complicated than it seems:
// 1) vite does not support the ESM wasm module yet
// 2) vite-plugin-wasm does not seem to support wasm-pack properly
//  (The issue exists in the `vite-plugin-wasm` repo, but with little help:
//    https://github.com/Menci/vite-plugin-wasm/issues/9)
// 3) `wasm-pack` generated WASM glue code is unable to load `file://` prefixed URLs and panics instead
const rewriteWasmToUrl = {
  name: "vite-replace-wasm-import",
  enforce: "pre",
  async load(id) {
    if (!id.endsWith(".wasm")) {
      return null;
    }

    return `export * from "${id}?url"`;
  },
};

export default defineConfig({
  plugins: [rewriteWasmToUrl],
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
});
