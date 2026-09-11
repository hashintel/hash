import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/main/app/voice-interview/buffered-admission.integration.test.ts",
    ],
  },
});
