import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createServerAdapter } from "@whatwg-node/server";
import { defineConfig, loadEnv, type Plugin } from "vite";

import type { IncomingMessage, ServerResponse } from "node:http";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const loadServerEnv = (mode: string) => {
  const env = loadEnv(mode, appRoot, "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

// Plugin required to serve the chat endpoint in dev.
// In production, it will be bundled and served by Vercel.
const petrinautApiDevPlugin = (): Plugin => ({
  name: "petrinaut-api-dev",
  apply: "serve",
  configureServer(server) {
    // The chat endpoint ships a default `{ fetch }` so Vercel's Node.js
    // runtime treats it as a Web fetch handler in production. We mirror the
    // same shape here so dev and prod hit the same code path.
    const adapter = createServerAdapter(async (request) => {
      const { default: api } = (await server.ssrLoadModule("/api/chat.ts")) as {
        default: { fetch: (request: Request) => Promise<Response> };
      };

      try {
        return await api.fetch(request);
      } catch (error) {
        server.ssrFixStacktrace(error as Error);
        throw error;
      }
    });

    server.middlewares.use(
      "/api/chat",
      (request: IncomingMessage, response: ServerResponse) => {
        void adapter(request, response);
      },
    );
  },
});

/** Petrinaut website dev server and production build config. */
export default defineConfig(({ mode }) => {
  loadServerEnv(mode);

  const environment = process.env.VITE_VERCEL_ENV ?? "development";
  const sentryDsn: string | undefined = process.env.SENTRY_DSN;

  return {
    define: {
      __ENVIRONMENT__: JSON.stringify(environment),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
    },
    build: {
      // Vite 8 defaults to LightningCSS which is still unstable.
      // e.g. https://github.com/parcel-bundler/lightningcss/issues/695
      cssMinify: "esbuild" as const,
    },

    preview: {
      /** vercel dev will provide a PORT to run on */
      port: process.env.PORT ? Number(process.env.PORT) : 4173,
    },
    server: {
      proxy: {
        "/api/petrinaut-opt": {
          target: process.env.PETRINAUT_OPT_ORIGIN ?? "http://127.0.0.1:4004",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/petrinaut-opt/u, ""),
        },
      },
    },

    plugins: [
      petrinautApiDevPlugin(),
      react(),
      babel({
        presets: [
          reactCompilerPreset({
            target: "19",
            compilationMode: "infer",
            // @hashintel/ds-components ships prebuilt jsx() calls; the compiler
            // can't recognize ref forwarding in that form and bails with
            // "Cannot access refs during render". Opt that package out.
            sources: (filename: string) =>
              !filename.includes("@hashintel/ds-components"),
            panicThreshold: "critical_errors",
          }),
        ],
      }),
    ],
  };
});
