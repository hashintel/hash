import { defineBrunchLibraryConfig } from "./library-vite-config.ts";

export default defineBrunchLibraryConfig(import.meta.url, {
  index: "src/index.ts",
  client: "src/client.ts",
  ui: "src/ui.ts",
  server: "src/server.ts",
  "interview-budget": "src/petrinaut/interview-budget.ts",
  words: "src/petrinaut/words.ts",
});
