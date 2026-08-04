import { defineConfig } from "vitest/config";

// eslint-disable-next-line import/no-default-export -- Vitest config entrypoint
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
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
  },
});
