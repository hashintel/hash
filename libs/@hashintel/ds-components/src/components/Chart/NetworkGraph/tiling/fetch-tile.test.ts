import { describe, expect, it, vi } from "vitest";

import { FetchTileError, withAtlasRetry } from "./fetch-tile";

// Zero-delay backoff keeps the retry tests fast while still exercising the loop.
const FAST = { retries: 3, baseDelayMs: 0, maxDelayMs: 0 } as const;

/** Rejects `failures` times with `error`, then resolves with `value`. */
const flaky = <T>(failures: number, error: Error, value: T) => {
  let calls = 0;
  return vi.fn((): Promise<T> => {
    calls += 1;
    return calls <= failures ? Promise.reject(error) : Promise.resolve(value);
  });
};

describe("withAtlasRetry", () => {
  it("retries a transport failure (no status) and returns the eventual success", async () => {
    const operation = flaky(2, new FetchTileError("offline"), "ok");

    await expect(withAtlasRetry(operation, FAST)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([429, 500, 503])(
    "retries a retryable %i response",
    async (status) => {
      const operation = flaky(1, new FetchTileError("busy", { status }), "ok");

      await expect(withAtlasRetry(operation, FAST)).resolves.toBe("ok");
      expect(operation).toHaveBeenCalledTimes(2);
    },
  );

  it.each([400, 404, 422])(
    "does not retry a terminal %i response",
    async (status) => {
      const error = new FetchTileError("nope", { status });
      const operation = vi.fn(() => Promise.reject(error));

      await expect(withAtlasRetry(operation, FAST)).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry a non-HTTP error (e.g. a decode failure)", async () => {
    const error = new Error("decode mismatch");
    const operation = vi.fn(() => Promise.reject(error));

    await expect(withAtlasRetry(operation, FAST)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting the retry budget and throws the last error", async () => {
    const error = new FetchTileError("still down", { status: 503 });
    const operation = vi.fn(() => Promise.reject(error));

    await expect(
      withAtlasRetry(operation, { retries: 2, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toBe(error);
    // First attempt plus two retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once the signal aborts", async () => {
    const controller = new AbortController();
    const operation = vi.fn(() => {
      // Abort as the first attempt fails, so no retry should follow.
      controller.abort();
      return Promise.reject(new FetchTileError("offline"));
    });

    await expect(
      withAtlasRetry(operation, { ...FAST, signal: controller.signal }),
    ).rejects.toBeInstanceOf(FetchTileError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
