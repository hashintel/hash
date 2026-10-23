import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests need the compose Postgres; `test:integration` runs them.
    exclude: [...configDefaults.exclude, "test/integration/**"],
  },
});
