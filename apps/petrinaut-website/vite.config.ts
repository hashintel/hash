import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createServerAdapter } from "@whatwg-node/server";
import { defineConfig, loadEnv, type Plugin } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const loadServerEnv = (mode: string) => {
  const env = loadEnv(mode, appRoot, "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

// Mounts `api/chat.ts` during `vite dev` so the front-end can hit `/api/chat`
// on the same origin. `@whatwg-node/server` handles the Node <-> Fetch
// translation (streaming, abort signals, header semantics) that Vercel's
// production runtime performs for the deployed function.
const petrinautApiDevPlugin = (): Plugin => ({
  name: "petrinaut-api-dev",
  apply: "serve",
  configureServer(server) {
    const adapter = createServerAdapter(async (request) => {
      const apiModule = await server.ssrLoadModule("/api/chat.ts");
      const handler = (apiModule as { default?: unknown }).default;

      if (typeof handler !== "function") {
        throw new Error("Expected /api/chat.ts to export a default handler.");
      }

      try {
        return await (handler as (req: Request) => Promise<Response>)(request);
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
