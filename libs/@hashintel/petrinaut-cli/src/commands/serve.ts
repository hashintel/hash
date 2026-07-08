import { existsSync, unlinkSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";

import { compilePetrinautModel } from "@hashintel/petrinaut-core";

import { loadSdcpnModel } from "../runtime/load-model";
import {
  parseServerRunRequest,
  toPetrinautRunConfig,
} from "../runtime/run-request";

type ServeOptions = {
  modelPath: string;
  socketPath?: string;
  host: string;
  port?: number;
};

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      throw new Error("Request body is too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function serve(options: ServeOptions): Promise<void> {
  const modelPath = resolve(options.modelPath);
  const sdcpn = await loadSdcpnModel(modelPath);
  const model = compilePetrinautModel({ sdcpn });
  let socketRemoved = false;

  const removeSocket = (): void => {
    if (!options.socketPath || socketRemoved) {
      return;
    }
    socketRemoved = true;
    try {
      unlinkSync(options.socketPath);
    } catch {
      // Best-effort cleanup. The socket may already be gone.
    }
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/metadata") {
        sendJson(response, 200, model.metadata);
        return;
      }

      if (request.method === "POST" && url.pathname === "/runs") {
        const body = await readJsonBody(request);
        const runRequest = parseServerRunRequest(body);
        const result = model.run(
          toPetrinautRunConfig(model.metadata, runRequest),
        );
        sendJson(response, 200, result);
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 400, { error: getErrorMessage(error) });
    }
  });
  server.on("close", removeSocket);

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      rejectListen(error);
    };
    server.once("error", onError);
    server.once("listening", () => {
      server.off("error", onError);
      resolveListen();
    });

    if (options.socketPath) {
      if (existsSync(options.socketPath)) {
        throw new Error(
          `Socket path already exists: ${options.socketPath}. Remove it if no server is using it.`,
        );
      }
      server.listen(options.socketPath);
      return;
    }

    if (options.port === undefined) {
      throw new Error("Serve requires --socket or --port");
    }
    server.listen(options.port, options.host);
  });

  const address = server.address();
  const location =
    typeof address === "string"
      ? `unix:${address}`
      : `${address?.address ?? options.host}:${address?.port ?? options.port}`;
  process.stderr.write(
    `Petrinaut server ready at ${location} for model ${modelPath}\n`,
  );
}
