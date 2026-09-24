import { markdownImportPlugin } from "@flue/vite/internal";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Brunch packages import SKILL.md natively; Flue packages those imports.
  plugins: [markdownImportPlugin()],
  test: {
    include: ["test/**/*.test.ts", "src/evaluations/persona/launch.test.ts"],
    // Built-runtime subprocess probes retain their five-second oracle budgets without competing files.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, "test/integration/**"],
  },
});
