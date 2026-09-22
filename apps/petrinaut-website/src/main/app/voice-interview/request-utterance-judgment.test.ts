import { afterEach, expect, test, vi } from "vitest";

import { createUtteranceJudgmentRequester } from "./request-utterance-judgment";

const state = { transcript: "PRIVATE", relayedBrunchText: null };
const judgment = { contribution: "social_or_backchannel", confidence: 0.9 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("posts only the state to the same-origin route and returns normalized metadata", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ ...judgment, transcript: "PRIVATE" }),
  );
  await expect(
    createUtteranceJudgmentRequester(fetch)(
      state,
      new AbortController().signal,
    ),
  ).resolves.toEqual(judgment);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("/api/voice/utterance-judgment");
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("content-type")).toBe(
    "application/json",
  );
  expect(init?.body).toBe(JSON.stringify(state));
});

test.each([
  async () => new Response("PRIVATE", { status: 502 }),
  async () => Response.json({ contribution: "unknown", confidence: 0.9 }),
  async () => new Response("not JSON"),
  async () => {
    throw new TypeError("PRIVATE offline");
  },
])("returns null on failure without retry", async (implementation) => {
  const fetch = vi.fn<typeof globalThis.fetch>(implementation);
  await expect(
    createUtteranceJudgmentRequester(fetch)(
      state,
      new AbortController().signal,
    ),
  ).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledOnce();
});

test("retains a log judgment arriving after the old one-second cutoff", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const timeout = new AbortController();
    setTimeout(() => timeout.abort(), milliseconds);
    return timeout.signal;
  });
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise((resolve, reject) => {
        setTimeout(() => resolve(Response.json(judgment)), 1_500);
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
  );
  const pending = createUtteranceJudgmentRequester(fetch)(
    state,
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(1_500);
  await expect(pending).resolves.toEqual(judgment);
  expect(fetch).toHaveBeenCalledOnce();
});

test.each(["timeout", "stop"])("cancels the request on %s", async (cause) => {
  const timeout = new AbortController();
  const stop = new AbortController();
  // Native AbortSignal.timeout is not driven by Vitest's fake clock.
  const timeoutSpy = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(timeout.signal);
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
  );
  const pending = createUtteranceJudgmentRequester(fetch)(state, stop.signal);
  (cause === "timeout" ? timeout : stop).abort();
  await expect(pending).resolves.toBeNull();
  expect(timeoutSpy).toHaveBeenCalledWith(10_000);
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

test("does not fetch after the session is already stopped", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(
    createUtteranceJudgmentRequester(fetch)(state, AbortSignal.abort()),
  ).resolves.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
