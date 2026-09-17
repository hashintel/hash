import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/main/app/voice-interview/buffered-admission.integration.test.ts",
      "src/main/app/local-storage-demo/live-pending-tool.integration.test.ts",
      "src/main/app/local-storage-demo/workpiece-refusal-presentation.integration.test.tsx",
    ],
  },
});
