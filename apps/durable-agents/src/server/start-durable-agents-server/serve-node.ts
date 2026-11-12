/**
 * Serve a fetch handler (a Hono app's `fetch`) on Node's `http`. The app
 * declares no Node adapter package, and its requests are small JSON bodies,
 * so a request body is read whole; a response body streams, chunk by chunk,
 * no faster than the client reads it, and a client that disconnects cancels
 * it.
 */
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type { AddressInfo } from "node:net";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

const readBody = async (
  request: IncomingMessage,
): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
};

const toRequest = async (
  request: IncomingMessage,
  origin: string,
  signal: AbortSignal,
): Promise<Request> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, item);
  }
  const method = request.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  return new Request(new URL(request.url ?? "/", origin), {
    method,
    headers,
    body,
    signal,
  });
};

const writeResponse = async (
  response: Response,
  outgoing: ServerResponse,
): Promise<void> => {
  outgoing.writeHead(
    response.status,
    response.statusText,
    Object.fromEntries(response.headers),
  );
  if (response.body === null) {
    outgoing.end();
    return;
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> =
    response.body.getReader();
  const closed = new Promise<void>((resolve) => {
    outgoing.once("close", resolve);
  });
  outgoing.on("close", () => {
    if (!outgoing.writableFinished) void reader.cancel().catch(() => {});
  });
  for (;;) {
    // Each read depends on the one before.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    // A full buffer waits for the client to drain it, so a slow client
    // holds the stream back instead of the server buffering for it.
    if (!outgoing.write(value) && !outgoing.destroyed) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.race([once(outgoing, "drain"), closed]);
    }
    if (outgoing.destroyed) return;
  }
  outgoing.end();
};

/** Listen on `port` (0 for any free one) and serve `handler`; resolves once listening. */
export const serveNode = async (
  handler: FetchHandler,
  { port, hostname }: { readonly port: number; readonly hostname?: string },
) => {
  const server = createServer((incoming, outgoing) => {
    const aborted = new AbortController();
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) aborted.abort();
    });
    const origin = `http://${incoming.headers.host ?? "localhost"}`;
    void (async () => {
      const response = await handler(
        await toRequest(incoming, origin, aborted.signal),
      );
      await writeResponse(response, outgoing);
    })().catch((error: unknown) => {
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { "content-type": "text/plain" });
        outgoing.end(String(error));
      } else {
        outgoing.destroy(error instanceof Error ? error : undefined);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    /** Stop listening and end open connections, streams included. */
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
};
