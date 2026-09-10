import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "src/main/app/voice-interview/buffered-admission.integration.test.ts",
    ],
  },
});
