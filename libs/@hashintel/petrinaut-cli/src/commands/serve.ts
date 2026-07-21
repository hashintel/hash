import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { resolve } from "node:path";

import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";

import { consumeBufferedJsonLines } from "../runtime/json-lines";
import { loadSdcpnModel } from "../runtime/load-model";
import {
  handleProtocolLine,
  MAX_REQUEST_LINE_BYTES,
} from "../runtime/protocol";

import type { Writable } from "node:stream";

type ServeOptions = {
  modelPath: string;
  socketPath: string;
  signal?: AbortSignal;
  errorOutput?: Writable;
};

function writeResponse(socket: Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

export async function serve(options: ServeOptions): Promise<void> {
  const modelPath = resolve(options.modelPath);
  const sdcpn = await loadSdcpnModel(modelPath);
  const model = compilePetrinautModel({ sdcpn });
  let socketRemoved = false;

  const removeSocket = (): void => {
    if (socketRemoved) {
      return;
    }
    socketRemoved = true;
    try {
      unlinkSync(options.socketPath);
    } catch {
      // Best-effort cleanup. The socket may already be gone.
    }
  };

  const activeSockets = new Set<Socket>();
  const server = createServer((socket) => {
    activeSockets.add(socket);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      const bufferedLines = consumeBufferedJsonLines(
        buffer,
        MAX_REQUEST_LINE_BYTES,
      );
      buffer = bufferedLines.remainder;

      for (const line of bufferedLines.lines) {
        handleProtocolLine(
          model,
          line,
          (value) => writeResponse(socket, value),
          sdcpn,
        );
      }

      if (bufferedLines.requestTooLarge) {
        buffer = "";
        socket.pause();
        socket.end(
          `${JSON.stringify({
            id: null,
            error: { message: "Request line is too large" },
          })}\n`,
        );
      }
    });

    socket.on("end", () => {
      if (buffer.trim() !== "") {
        if (Buffer.byteLength(buffer, "utf8") > MAX_REQUEST_LINE_BYTES) {
          writeResponse(socket, {
            id: null,
            error: { message: "Request line is too large" },
          });
          return;
        }
        handleProtocolLine(
          model,
          buffer,
          (value) => writeResponse(socket, value),
          sdcpn,
        );
      }
    });
    socket.on("error", () => {
      // Per-connection errors are reported through the socket lifecycle.
    });
    socket.on("close", () => {
      activeSockets.delete(socket);
    });
  });
  server.on("close", removeSocket);

  if (existsSync(options.socketPath)) {
    throw new Error(
      `Socket path already exists: ${options.socketPath}. Remove it if no Petrinaut process is using it.`,
    );
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      rejectListen(error);
    };
    server.once("error", onError);
    server.once("listening", () => {
      server.off("error", onError);
      resolveListen();
    });
    server.listen(options.socketPath);
  });

  (options.errorOutput ?? process.stderr).write(
    `Petrinaut socket ready at ${options.socketPath} for model ${modelPath}\n`,
  );

  await new Promise<void>((resolveShutdown) => {
    let shuttingDown = false;
    const removeShutdownListeners = (): void => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      options.signal?.removeEventListener("abort", shutdown);
    };
    const shutdown = (): void => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      for (const socket of activeSockets) {
        socket.destroy();
      }
      server.close(() => {
        removeShutdownListeners();
        resolveShutdown();
      });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    options.signal?.addEventListener("abort", shutdown, { once: true });
    if (options.signal?.aborted) {
      shutdown();
    }
  });
}
