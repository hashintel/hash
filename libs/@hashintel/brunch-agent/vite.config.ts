import { defineBrunchLibraryConfig } from "./library-vite-config.ts";

export default defineBrunchLibraryConfig(import.meta.url, {
  index: "src/index.ts",
  "interview-budget": "src/petrinaut/interview-budget.ts",
});
