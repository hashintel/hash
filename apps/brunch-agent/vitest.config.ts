import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/evaluations/persona/launch.test.ts"],
    // Built-runtime subprocess probes retain their five-second oracle budgets without competing files.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, "test/integration/**"],
  },
});
