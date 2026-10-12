import { createConfig, defineConfig } from "@local/oxlint";

export default defineConfig({
  extends: [
    createConfig({
      frameworks: ["vitest"],
      runtime: "node",
    }),
  ],
});
