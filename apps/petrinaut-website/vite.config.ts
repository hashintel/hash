import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

type DevApiHandler = (request: Request) => Promise<Response>;

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const loadServerEnv = (mode: string) => {
  const env = loadEnv(mode, appRoot, "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const readRequestBody = async (
  request: IncomingMessage,
): Promise<Uint8Array | undefined> => {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    });
    request.on("end", resolve);
    request.on("error", reject);
  });

  if (chunks.length === 0) {
    return undefined;
  }

  const byteLength = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const body = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
};

const headersFromIncomingMessage = (headers: IncomingHttpHeaders): Headers => {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const headerValue of value) {
        result.append(key, headerValue);
      }
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }

  return result;
};

const isDevApiModule = (
  value: unknown,
): value is { default: DevApiHandler } => {
  const maybeModule = value as { default?: unknown };

  return typeof maybeModule.default === "function";
};

const writeResponse = async (
  response: Response,
  serverResponse: ServerResponse,
) => {
  const nodeResponse = serverResponse;
  nodeResponse.statusCode = response.status;
  nodeResponse.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (!response.body) {
    nodeResponse.end();
    return;
  }

  const reader = response.body.getReader();

  try {
    let result = await reader.read();

    while (!result.done) {
      nodeResponse.write(result.value);
      result = await reader.read();
    }

    nodeResponse.end();
  } finally {
    reader.releaseLock();
  }
};

const petrinautApiDevPlugin = (): Plugin => ({
  name: "petrinaut-api-dev",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/api/chat", (request, response) => {
      void (async () => {
        try {
          const apiModule = await server.ssrLoadModule("/api/chat.ts");
          if (!isDevApiModule(apiModule)) {
            throw new Error(
              "Expected /api/chat.ts to export a default handler.",
            );
          }

          const url = new URL(
            request.url ?? "",
            `${server.config.server.https ? "https" : "http"}://${
              request.headers.host ?? "localhost"
            }`,
          );

          await writeResponse(
            await apiModule.default(
              new Request(url, {
                body: await readRequestBody(request),
                headers: headersFromIncomingMessage(request.headers),
                method: request.method,
              }),
            ),
            response,
          );
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          const nodeResponse = response;
          nodeResponse.statusCode = 500;
          nodeResponse.end(
            error instanceof Error ? error.message : "API error",
          );
        }
      })();
    });
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
