import { flue } from "@flue/vite";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";

import { localChatListen } from "./src/server/http/local-origins.ts";

// Resolve Brunch workspace packages to their TypeScript source while serving;
// builds keep dist. See "Loading workspace source in dev" in
// apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md.
const workspaceSourceCondition = "@dev/source";

// flue() externalizes the app's direct dependencies as `name` and `name/*`.
// Rolldown matches external strings exactly, so a subpath import of a linked
// workspace package, such as `@local/hash-backend-utils/logger`, is bundled.
// The bundle then carries winston, and flue's build resolver resolves each
// bare import from the project root rather than the importer, giving winston
// the hoisted ESM `is-stream` 4 instead of its own 2: the built server throws
// `isStream is not a function` on start. Load the logger's package from
// node_modules instead, as flue intends for direct dependencies.
const buildExternals = [/^@local\/hash-backend-utils\//];

// No @vitejs/plugin-react: the flue plugin's dev controller owns the whole
// request space and hands every request to app.ts, with no fall-through to
// vite's html middleware — so index.html is app-served and react-refresh's
// preamble injection would never run (recorded Flue fact, spec §10). Vite's
// core esbuild transform still compiles the .tsx modules.
export default defineConfig(({ command }) => ({
  plugins: [flue()],
  server: localChatListen,
  ...(command === "serve"
    ? {
        resolve: {
          conditions: [workspaceSourceCondition, ...defaultClientConditions],
        },
        ssr: {
          resolve: {
            conditions: [workspaceSourceCondition, ...defaultServerConditions],
          },
        },
      }
    : { build: { rolldownOptions: { external: buildExternals } } }),
}));
