import { flue } from "@flue/vite";
import { defineConfig } from "vite";

import { localChatListen } from "./src/local-dev-origins.ts";

// No @vitejs/plugin-react: the flue plugin's dev controller owns the whole
// request space and hands every request to app.ts, with no fall-through to
// vite's html middleware — so index.html is app-served and react-refresh's
// preamble injection would never run (recorded Flue fact, spec §10). Vite's
// core esbuild transform still compiles the .tsx modules.
export default defineConfig({
  plugins: [flue()],
  server: localChatListen,
});
