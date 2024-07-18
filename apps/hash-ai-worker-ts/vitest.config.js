/// <reference types="vitest" />
import { monorepoRootDir } from "@local/hash-backend-utils/environment";
// eslint-disable-next-line import/no-extraneous-dependencies
import { loadEnv } from "vite";
// eslint-disable-next-line import/no-extraneous-dependencies
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  return {
    test: {
      env:
        process.env.TEST_AI === "true"
          ? loadEnv(mode, monorepoRootDir, "")
          : undefined,
      coverage: {
        enabled: process.env.TEST_COVERAGE === "true",
        provider: "istanbul",
        reporter: ["lcov", "text"],
        include: ["**/*.{c,m,}{j,t}s{x,}"],
        exclude: ["**/node_modules/**", "**/dist/**"],
      },
      environment: "node",
    },
    plugins: [tsconfigPaths()],
  };
});
