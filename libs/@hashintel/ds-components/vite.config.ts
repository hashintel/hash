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
    const target = ATLAS_API_URL ?? "http://127.0.0.1:4003";
    server.middlewares.use(
      "/atlas-api",
      (req: Connect.IncomingMessage, res: ServerResponse) => {
        // connect strips the `/atlas-api` mount prefix from `req.url`.
        const upstream = `${target}${req.url ?? ""}`;
        const { accept } = req.headers;
        const contentTypeIn = req.headers["content-type"];
        const method = req.method ?? "GET";
        void (async () => {
          try {
            // Forward the method and, for non-GET requests, the raw body
            // (the SALTILE endpoints are POST with JSON bodies).
            const body =
              method === "GET" || method === "HEAD"
                ? undefined
                : new Uint8Array(
                    await new Promise<Buffer>((resolve, reject) => {
                      const chunks: Buffer[] = [];
                      req.on("data", (chunk: Buffer) => chunks.push(chunk));
                      req.on("end", () => resolve(Buffer.concat(chunks)));
                      req.on("error", reject);
                    }),
                  );
            const response = await fetch(upstream, {
              method,
              headers: {
                ...(accept === undefined ? {} : { accept: String(accept) }),
                ...(contentTypeIn === undefined
                  ? {}
                  : { "content-type": String(contentTypeIn) }),
              },
              body,
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
