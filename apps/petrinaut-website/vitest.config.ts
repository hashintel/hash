import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.{ts,tsx}"],
  },
});
