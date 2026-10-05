import { defineBrunchLibraryConfig } from "../core/library-vite-config.ts";

export default defineBrunchLibraryConfig(import.meta.url, {
  index: "src/index.ts",
});
