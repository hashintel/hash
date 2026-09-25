import { defineBrunchLibraryConfig } from "../../library-vite-config.ts";

export default defineBrunchLibraryConfig(import.meta.url, {
  flue: "src/flue.ts",
  index: "src/index.ts",
});
