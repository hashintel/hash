// `Plugin` is aliased because a workspace lint rule flags any type reference
// literally named `Plugin` (it targets ProseMirror's) regardless of import.
import { type Connect, defineConfig, type Plugin as VitePlugin } from "vite";
import svgr from "vite-plugin-svgr";

import type { ServerResponse } from "node:http";

// Destructured (not `process.env.ATLAS_API_URL`) so the index-signature access
// needs neither bracket notation (TS4111) nor a `dot-notation` lint exception.
const { ATLAS_API_URL } = process.env;

/**
 * Dev-only reverse proxy for the NetworkGraph Atlas-tiling story so the browser
 * fetches from a same-origin `/atlas-api/*` path (the `hash-graph atlas` server
 * sends no CORS headers). Implemented as a `configureServer` plugin rather than
 * `server.proxy` because Ladle drops the user Vite config's `server` block on
 * merge, whereas plugins survive. Override the target with `ATLAS_API_URL`.
 */
const atlasApiProxy = (): VitePlugin<never> => ({
  name: "atlas-api-proxy",
  configureServer(server) {
    const target = ATLAS_API_URL ?? "http://127.0.0.1:4010";
    server.middlewares.use(
      "/atlas-api",
      (req: Connect.IncomingMessage, res: ServerResponse) => {
        // connect strips the `/atlas-api` mount prefix from `req.url`.
        const upstream = `${target}${req.url ?? ""}`;
        const { accept } = req.headers;
        void (async () => {
          try {
            const response = await fetch(upstream, {
              headers:
                accept === undefined ? undefined : { accept: String(accept) },
            });
            res.statusCode = response.status;
            const contentType = response.headers.get("content-type");
            if (contentType !== null) {
              res.setHeader("content-type", contentType);
            }
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({ error: `atlas proxy failed: ${String(error)}` }),
            );
          }
        })();
      },
    );
  },
});

export default defineConfig({
  // Ladle points at this file from `.ladle/config.mjs`. Keep it limited to shared demo/build concerns.
  css: {
    postcss: "./postcss.config.cjs",
  },
  plugins: [svgr({ include: "**/*.svg" }), atlasApiProxy()],
});
