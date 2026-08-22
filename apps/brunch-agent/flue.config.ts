import { defineConfig } from "@flue/runtime/config";

export default defineConfig({
  target: "node",
  // Exhaustive, so a typo'd provider fails at resolution instead of reaching
  // the network (Flue patterns audit, 2026-08-17).
  providers: ["anthropic"],
});
