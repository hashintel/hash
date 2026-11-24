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
