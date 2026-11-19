import { expect, test } from "vitest";

import { createRequestSlots } from "./request-slots";

type BeforeRequest = (
  request: unknown,
  api: { readonly taskId: number },
  context: { readonly abortSignal?: AbortSignal },
) => Promise<unknown>;

/** The gate's `beforeRequest` hook, as Pi Durable calls it. */
const beforeRequestOf = (slots: ReturnType<typeof createRequestSlots>) => {
  const [registration] = slots.gate().extension.hooks ?? [];
  if (registration === undefined) throw new Error("The gate has no hook.");
  return (registration.handlers as { beforeRequest: BeforeRequest })
    .beforeRequest;
};

test("a request aborted after its slot is granted, before the hook resumes, frees the slot", async () => {
  const slots = createRequestSlots(1);
  const beforeRequest = beforeRequestOf(slots);
  const abort = new AbortController();
  const waiting = beforeRequest(
    undefined,
    { taskId: 1 },
    {
      abortSignal: abort.signal,
    },
  );
  // The slot was free, so it is granted at once; the hook resumes a microtask later.
  abort.abort(new Error("stopped"));
  await waiting.catch(() => {});
  expect(slots.state()).toEqual({ inFlight: 0, waiting: 0 });
});

test("a request that keeps running holds its slot until it aborts", async () => {
  const slots = createRequestSlots(1);
  const beforeRequest = beforeRequestOf(slots);
  const abort = new AbortController();
  await beforeRequest(undefined, { taskId: 1 }, { abortSignal: abort.signal });
  expect(slots.state()).toEqual({ inFlight: 1, waiting: 0 });
  abort.abort(new Error("stopped"));
  expect(slots.state()).toEqual({ inFlight: 0, waiting: 0 });
});
