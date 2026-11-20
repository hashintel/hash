import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  LiveDoc,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { expect, test, vi } from "vitest";

import {
  fauxAssistantMessage,
  scriptedModel,
} from "../../../test/scripted-model";
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
  await expect(waiting).rejects.toThrow("stopped");
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

test("a restart while a generation waits for a slot costs it a model attempt", async () => {
  const context = BACKGROUND_CONTEXT;
  const storage = Object.assign(new MemoryStorage(), { close: async () => {} });
  const { models, model } = scriptedModel([fauxAssistantMessage("Answered.")]);
  const harnesses: Harness[] = [];
  /** A process with one slot, which another request holds until the returned release. */
  const openProcess = async () => {
    const slots = createRequestSlots(1);
    const holder = new AbortController();
    await beforeRequestOf(slots)(
      undefined,
      { taskId: -1 },
      { abortSignal: holder.signal },
    );
    const gate = slots.gate();
    const registry = createRegistry();
    registry.install(gate.extension);
    const harness = await Harness.open(
      storage,
      {
        models,
        registry,
        settings: { restartLimit: Infinity, retry: { baseDelayMs: 1 } },
      },
      context,
    );
    harnesses.push(harness);
    const root = await harness.root(context, {
      agent: { model, extensions: [gate.extension] },
    });
    await gate.attach(harness, context);
    harness.resume();
    const attempt = async () =>
      (await harness.snapshot(LiveDoc, root.id, context))?.generation?.attempt;
    return { root, slots, attempt, release: () => holder.abort() };
  };

  try {
    const first = await openProcess();
    await first.root.submit({ type: "input", content: "Go." }, context);
    await vi.waitFor(() => {
      expect(first.slots.state()).toEqual({ inFlight: 1, waiting: 1 });
    });
    expect(await first.attempt()).toBe(1);

    // A second process opens the storage while the first's generation waits.
    const second = await openProcess();
    await vi.waitFor(async () => {
      expect(second.slots.state()).toEqual({ inFlight: 1, waiting: 1 });
      expect(await second.attempt()).toBe(2);
    });

    second.release();
    await vi.waitFor(async () => {
      const live = await harnesses[1]!.snapshot(
        LiveDoc,
        second.root.id,
        context,
      );
      expect(live?.run).toBeUndefined();
      expect(live?.runFailure).toBeUndefined();
    });
  } finally {
    await Promise.all(
      harnesses.map((harness) => harness.close(context).catch(() => {})),
    );
  }
});
