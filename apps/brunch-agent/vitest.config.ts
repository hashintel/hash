import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/integration/**"],
  },
});
