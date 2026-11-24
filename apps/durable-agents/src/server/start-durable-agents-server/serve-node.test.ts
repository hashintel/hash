import { request as httpRequest, type IncomingMessage } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, expect, test } from "vitest";

import { serveNode } from "./serve-node";

const listeners: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

const chunkSize = 64 * 1024;
const chunkCount = 512;

/** A response body of `chunkCount` chunks, each made only when the server reads it: counts how far a reader pulled it. */
const countedBody = () => {
  const counter = { pulled: 0 };
  const body = new ReadableStream<Uint8Array>(
    {
      pull: (controller) => {
        if (counter.pulled === chunkCount) {
          controller.close();
          return;
        }
        counter.pulled += 1;
        controller.enqueue(
          new Uint8Array(chunkSize).fill(counter.pulled % 256),
        );
      },
    },
    { highWaterMark: 0 },
  );
  return { counter, body };
};

const get = (port: number) =>
  new Promise<IncomingMessage>((resolve, reject) => {
    httpRequest({ host: "127.0.0.1", port, path: "/" }, resolve)
      .on("error", reject)
      .end();
  });

test.each(["before response", "while streaming"] as const)(
  "a client closing %s cancels the response body",
  async (when) => {
    const entered = Promise.withResolvers<AbortSignal>();
    const release = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    const listener = await serveNode(
      async ({ signal }) => {
        entered.resolve(signal);
        if (when === "before response") await release.promise;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            cancelled.resolve();
          },
        });
        return new Response(body);
      },
      { port: 0, hostname: "127.0.0.1" },
    );
    listeners.push(listener);
    const seen = Promise.withResolvers<void>();
    const request = httpRequest(
      { host: "127.0.0.1", port: listener.port, path: "/" },
      (response) => {
        response.once("data", () => seen.resolve());
      },
    )
      .on("error", () => {})
      .end();
    try {
      const signal = await entered.promise;
      const closed = new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      if (when === "while streaming") await seen.promise;
      request.destroy();
      await closed;
      release.resolve();
      await expect(cancelled.promise).resolves.toBeUndefined();
    } finally {
      request.destroy();
      release.resolve();
    }
  },
);

test("an omitted hostname listens on loopback only", async () => {
  const listener = await serveNode(() => new Response("ok"), { port: 0 });
  listeners.push(listener);
  expect(listener.address).toBe("127.0.0.1");
});

test("a slow reader holds the response stream back instead of the server buffering it", async () => {
  const { counter, body } = countedBody();
  const listener = await serveNode(() => new Response(body), {
    port: 0,
    hostname: "127.0.0.1",
  });
  listeners.push(listener);

  const response = await get(listener.port);
  // The client reads nothing: socket buffers fill, then the server must stop pulling.
  response.pause();
  let previous = -1;
  while (counter.pulled !== previous) {
    previous = counter.pulled;
    // Settled once a while passes without a pull.
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  const pulledWhilePaused = counter.pulled;
  // 32 MiB in all; held back to a few socket and stream buffers' worth.
  expect(pulledWhilePaused).toBeLessThan(chunkCount / 4);

  // Reading again lets the rest through, all of it.
  let received = 0;
  response.on("data", (chunk: Buffer) => {
    received += chunk.length;
  });
  response.resume();
  await new Promise((resolve) => {
    response.on("end", resolve);
  });
  expect(received).toBe(chunkSize * chunkCount);
  expect(counter.pulled).toBe(chunkCount);
});

/** Send `chunks` as the request body, chunked unless `headers` declares a length; resolves with the answer. */
const send = (
  port: number,
  {
    method = "POST",
    headers = {},
    chunks = [],
  }: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly chunks?: readonly Uint8Array[];
  },
) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: "/path?query", method, headers },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body }),
        );
      },
    ).on("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });

test("a body over the byte limit is refused with 413 before the handler runs, whether declared or streamed; one within it arrives whole", async () => {
  const received: number[] = [];
  const listener = await serveNode(
    async (request) => {
      received.push((await request.arrayBuffer()).byteLength);
      return new Response("served");
    },
    { port: 0, maxBodyBytes: 1024 },
  );
  listeners.push(listener);
  const tooLarge = { status: 413, body: '{"error":"request too large"}' };
  expect(
    await send(listener.port, {
      headers: { "content-length": "1025" },
      chunks: [new Uint8Array(1025)],
    }),
  ).toEqual(tooLarge);
  expect(
    await send(listener.port, {
      chunks: [new Uint8Array(600), new Uint8Array(600)],
    }),
  ).toEqual(tooLarge);
  expect(received).toEqual([]);
  expect(
    await send(listener.port, {
      chunks: [new Uint8Array(512), new Uint8Array(512)],
    }),
  ).toEqual({ status: 200, body: "served" });
  expect(received).toEqual([1024]);
});

test("a request's URL names the listener, not the client's Host, unless the proxy in front is trusted", async () => {
  const echoUrl = (request: Request) => new Response(request.url);
  const direct = await serveNode(echoUrl, { port: 0 });
  listeners.push(direct);
  expect(
    await send(direct.port, {
      method: "GET",
      headers: { host: "attacker.example", "x-forwarded-proto": "https" },
    }),
  ).toEqual({
    status: 200,
    body: `http://127.0.0.1:${direct.port}/path?query`,
  });

  const proxied = await serveNode(echoUrl, { port: 0, trustProxy: true });
  listeners.push(proxied);
  expect(
    await send(proxied.port, {
      method: "GET",
      headers: { host: "agents.hash.ai", "x-forwarded-proto": "https" },
    }),
  ).toEqual({ status: 200, body: "https://agents.hash.ai/path?query" });
  expect(
    await send(proxied.port, {
      method: "GET",
      headers: { host: "agents.hash.ai" },
    }),
  ).toEqual({ status: 200, body: "http://agents.hash.ai/path?query" });
});

test("a handler's failure is answered 500 without its detail, and told to `onError`", async () => {
  const told: unknown[] = [];
  const failure = new Error("connection string postgres://secret");
  const listener = await serveNode(
    () => {
      throw failure;
    },
    { port: 0, onError: (error) => told.push(error) },
  );
  listeners.push(listener);
  expect(await send(listener.port, { method: "GET" })).toEqual({
    status: 500,
    body: "Internal Server Error",
  });
  expect(told).toEqual([failure]);
});
