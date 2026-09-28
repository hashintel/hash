import { defineBrunchLibraryConfig } from "./library-vite-config.ts";

export default defineBrunchLibraryConfig(import.meta.url, {
  "client-tools": "src/client-tools.ts",
  constants: "src/constants.ts",
  flue: "src/flue.ts",
  index: "src/index.ts",
  ledger: "src/ledger.ts",
  workpiece: "src/workpiece.ts",
});
