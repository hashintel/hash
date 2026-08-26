import { fileURLToPath } from "node:url";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { createServerAdapter } from "@whatwg-node/server";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { routerCodegenConfig } from "./router-codegen-config.ts";

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

const apiModules = [
  ["/api/chat", "/api/chat.ts"],
  ["/api/oembed", "/api/oembed.ts"],
  ["/api/voice/config", "/api/voice/config.ts"],
  ["/api/voice/realtime-call", "/api/voice/realtime-call.ts"],
  ["/api/voice/speech", "/api/voice/speech.ts"],
] as const;

// Plugin required to serve the Vercel fetch handlers in dev. In production,
// each file under /api is bundled and served as its own Vercel Function.
const petrinautApiDevPlugin = (): Plugin => ({
  name: "petrinaut-api-dev",
  apply: "serve",
  configureServer(server) {
    for (const [route, modulePath] of apiModules) {
      // The endpoints ship a default `{ fetch }` so Vercel's Node.js runtime
      // treats them as Web fetch handlers. Mirror that shape in development so
      // both environments exercise exactly the same handler.
      const adapter = createServerAdapter(async (request) => {
        const { default: api } = (await server.ssrLoadModule(modulePath)) as {
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
        route,
        (request: IncomingMessage, response: ServerResponse) => {
          void adapter(request, response);
        },
      );
    }
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
      tanstackRouter(routerCodegenConfig),
      react({
        // @hashintel/ds-components ships prebuilt jsx() calls; the compiler
        // can't recognize ref forwarding in that form and bails with
        // "Cannot access refs during render". Opt that package out.
        exclude: [
          /[\\/]node_modules[\\/]/,
          /[\\/]libs[\\/]@hashintel[\\/]ds-components[\\/]/,
        ],
        compiler: {
          target: "19",
          compilationMode: "infer",
          panicThreshold: "critical_errors",
        },
      }),
    ],
  };
});
