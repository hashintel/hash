import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createServerAdapter } from "@whatwg-node/server";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

import type { IncomingMessage, ServerResponse } from "node:http";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const loadServerEnv = (mode: string) => {
  // mise injects the repository-wide Compose placeholder before Vite can load
  // the website's real local key.
  if (process.env.OPENAI_API_KEY === "dummy") {
    delete process.env.OPENAI_API_KEY;
  }

  const env = loadEnv(mode, appRoot, "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

type WebFetchApi = {
  default: { fetch: (request: Request) => Promise<Response> };
};

const createApiAdapter = (server: ViteDevServer, modulePath: string) =>
  createServerAdapter(async (request) => {
    const { default: api } = (await server.ssrLoadModule(
      modulePath,
    )) as WebFetchApi;

    try {
      return await api.fetch(request);
    } catch (error) {
      server.ssrFixStacktrace(error as Error);
      throw error;
    }
  });

// Split chat from voice so the Brunch launcher can replace `/api/chat` while
// retaining the same-origin provider-token endpoints.
const petrinautChatApiDevPlugin = (): Plugin => ({
  name: "petrinaut-chat-api-dev",
  apply: "serve",
  configureServer(server) {
    const chatAdapter = createApiAdapter(server, "/api/chat.ts");

    server.middlewares.use(
      "/api/chat",
      (request: IncomingMessage, response: ServerResponse) => {
        void chatAdapter(request, response);
      },
    );
  },
});

// Each endpoint ships a default `{ fetch }` so Vercel's Node.js runtime treats
// it as a Web fetch handler in production. Dev mirrors that same code path.
const petrinautVoiceApiDevPlugin = (): Plugin => ({
  name: "petrinaut-voice-api-dev",
  apply: "serve",
  configureServer(server) {
    const openAIRealtimeAdapter = createApiAdapter(
      server,
      "/api/voice-experiment/openai-realtime-session.ts",
    );
    const elevenLabsAdapter = createApiAdapter(
      server,
      "/api/voice-experiment/elevenlabs-conversation-token.ts",
    );

    server.middlewares.use(
      "/api/voice-experiment/openai-realtime-session",
      (request: IncomingMessage, response: ServerResponse) => {
        void openAIRealtimeAdapter(request, response);
      },
    );
    server.middlewares.use(
      "/api/voice-experiment/elevenlabs-conversation-token",
      (request: IncomingMessage, response: ServerResponse) => {
        void elevenLabsAdapter(request, response);
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
        "/api/voice-experiment/elevenlabs-brunch-diagnostics": {
          target: process.env.BRUNCH_CHAT_ORIGIN ?? "http://127.0.0.1:4321",
          changeOrigin: true,
        },
        "/api/petrinaut-opt": {
          target: process.env.PETRINAUT_OPT_ORIGIN ?? "http://127.0.0.1:4004",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/petrinaut-opt/u, ""),
        },
      },
    },

    plugins: [
      petrinautChatApiDevPlugin(),
      petrinautVoiceApiDevPlugin(),
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
