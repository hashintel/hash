/**
 * Serve a fetch handler (a Hono app's `fetch`) on Node's `http`. The app
 * declares no Node adapter package, and its requests are small JSON bodies,
 * so a request body is read whole, up to `maxBodyBytes`: a body that declares
 * or reaches more is answered 413 before any of it is held past the limit,
 * and the handler never sees it. A response body streams, chunk by chunk,
 * no faster than the client reads it, and a client that disconnects cancels
 * it.
 *
 * A request's URL names the listener, so nothing a client sends in `Host`
 * reaches it; behind a trusted proxy (`trustProxy`) it names the `Host` and
 * `X-Forwarded-Proto` the proxy forwards. A handler that throws is answered
 * 500 with no detail, and its error is told to `onError`.
 */
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type { AddressInfo } from "node:net";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

/** The largest request body served when none is given, as Brunch's HASH route allows. */
export const defaultMaxBodyBytes = 16 * 1024 * 1024;

const tooLarge = "too-large";

/** The body, whole; `tooLarge` as soon as it declares or reaches more than `maxBytes`, reading no further. */
const readBody = (
  request: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | typeof tooLarge> => {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes)
    return Promise.resolve(tooLarge);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stop = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        stop();
        request.pause();
        resolve(tooLarge);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      stop();
      resolve(new Uint8Array(Buffer.concat(chunks)));
    };
    const onError = (error: Error) => {
      stop();
      reject(error);
    };
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
  });
};

const toRequest = async (
  request: IncomingMessage,
  origin: string,
  maxBodyBytes: number,
  signal: AbortSignal,
): Promise<Request | typeof tooLarge> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, item);
  }
  const method = request.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readBody(request, maxBodyBytes);
  if (body === tooLarge) return tooLarge;
  return new Request(new URL(request.url ?? "/", origin), {
    method,
    headers,
    body,
    signal,
  });
};

/** Answer 413 and close the connection, so the rest of the body is never read. */
const refuseTooLarge = (
  incoming: IncomingMessage,
  outgoing: ServerResponse,
) => {
  outgoing.writeHead(413, {
    "content-type": "application/json",
    connection: "close",
  });
  outgoing.end(JSON.stringify({ error: "request too large" }), () => {
    incoming.destroy();
  });
};

const writeResponse = async (
  response: Response,
  outgoing: ServerResponse,
  signal: AbortSignal,
): Promise<void> => {
  // Named: without DOM types, Node's `Response.body` reads `any` chunks.
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    response.body?.getReader();
  const disconnected = () => signal.aborted || outgoing.destroyed;
  const cancel = () => {
    void reader?.cancel().catch(() => {});
  };
  const onClose = () => {
    if (!outgoing.writableFinished) cancel();
  };
  outgoing.once("close", onClose);
  try {
    if (disconnected()) return;
    outgoing.writeHead(
      response.status,
      response.statusText,
      Object.fromEntries(response.headers),
    );
    if (reader !== undefined) {
      while (!disconnected()) {
        // Each read depends on the one before.
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done || disconnected()) break;
        if (!outgoing.write(value) && !disconnected()) {
          // Avoid leaving a drain listener on a socket that closes while full.
          // eslint-disable-next-line no-await-in-loop
          await once(outgoing, "drain", { signal });
        }
      }
    }
    if (!disconnected()) outgoing.end();
  } finally {
    outgoing.off("close", onClose);
    cancel();
    reader?.releaseLock();
  }
};

export type ServeNodeOptions = {
  /** 0 listens on any free port. */
  readonly port: number;
  /** Loopback when absent. */
  readonly hostname?: string;
  /** The largest request body served; `defaultMaxBodyBytes` when absent. */
  readonly maxBodyBytes?: number;
  /**
   * Whether a proxy in front sets `Host` and `X-Forwarded-Proto`, so a
   * request's URL may name them. Off, the URL names the listener.
   */
  readonly trustProxy?: boolean;
  /** Told each error a handler threw; its answer is a 500 that names none of it. */
  readonly onError?: (error: unknown) => void;
};

/** A URL's host for `hostname`, an IPv6 address in brackets. */
const urlHost = (hostname: string) =>
  hostname.includes(":") ? `[${hostname}]` : hostname;

/** Listen on `port` and serve `handler`; resolves once listening. */
export const serveNode = async (
  handler: FetchHandler,
  {
    port,
    hostname = "127.0.0.1",
    maxBodyBytes = defaultMaxBodyBytes,
    trustProxy = false,
    onError,
  }: ServeNodeOptions,
) => {
  /** Set once listening, before any request arrives. */
  let listenerOrigin = "";
  const originOf = (incoming: IncomingMessage) => {
    if (!trustProxy || incoming.headers.host === undefined)
      return listenerOrigin;
    const protocol =
      incoming.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    return `${protocol}://${incoming.headers.host}`;
  };
  const server = createServer((incoming, outgoing) => {
    const aborted = new AbortController();
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) aborted.abort();
    });
    void (async () => {
      const request = await toRequest(
        incoming,
        originOf(incoming),
        maxBodyBytes,
        aborted.signal,
      );
      if (request === tooLarge) {
        refuseTooLarge(incoming, outgoing);
        return;
      }
      await writeResponse(await handler(request), outgoing, aborted.signal);
    })().catch((error: unknown) => {
      onError?.(error);
      if (outgoing.destroyed) return;
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { "content-type": "text/plain" });
        outgoing.end("Internal Server Error");
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
  const { address, port: boundPort } = server.address() as AddressInfo;
  listenerOrigin = `http://${urlHost(hostname)}:${boundPort}`;
  return {
    address,
    port: boundPort,
    /** Stop listening and end open connections, streams included. */
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
};
