import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { serializeSnapshot, SnapshotError } from "./snapshot";
import { openSnapshot, prepareSnapshot } from "./snapshot-client";

import type { SnapshotResponse } from "./snapshot-worker-protocol";

const workers: SnapshotWorker[] = [];
class SnapshotWorker {
  onmessage: ((event: MessageEvent<SnapshotResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    workers.push(this);
  }

  reply(data: SnapshotResponse) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

const latestWorker = () => {
  const worker = workers.at(-1);
  if (!worker) throw new Error("A snapshot worker should have started");
  return worker;
};
const snapshot = { title: "SIR", definition: sirModel.petriNetDefinition };

beforeEach(() => {
  workers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("Worker", SnapshotWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("passes serialized bytes to the worker and releases it after compression", async () => {
  const pending = prepareSnapshot(snapshot, new AbortController().signal);
  const worker = latestWorker();
  expect(worker.postMessage).toHaveBeenCalledWith({
    kind: "encode",
    bytes: serializeSnapshot(snapshot),
  });
  worker.reply({ kind: "encoded", hash: "v1.br.example" });
  await expect(pending).resolves.toBe("v1.br.example");
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("validates decompressed bytes before returning a shared document", async () => {
  const pending = openSnapshot("v1.br.example", new AbortController().signal);
  latestWorker().reply({
    kind: "decoded",
    bytes: new TextEncoder().encode("null"),
  });
  await expect(pending).rejects.toEqual(new SnapshotError("invalid"));
  expect(latestWorker().terminate).toHaveBeenCalledOnce();
});

test("terminates a worker when its operation is cancelled", async () => {
  const controller = new AbortController();
  const pending = openSnapshot("v1.br.example", controller.signal);
  controller.abort();
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(latestWorker().terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("does not start a worker for an already cancelled operation", async () => {
  await expect(
    openSnapshot("v1.br.example", AbortSignal.abort()),
  ).rejects.toHaveProperty("name", "AbortError");
  expect(workers).toHaveLength(0);
});

test("stops a stalled worker after thirty seconds", async () => {
  const pending = openSnapshot("v1.br.example", new AbortController().signal);
  const rejection = expect(pending).rejects.toEqual(
    new SnapshotError("unavailable"),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await rejection;
  expect(latestWorker().terminate).toHaveBeenCalledOnce();
});

test.each(["onerror", "onmessageerror"] as const)(
  "releases a worker after %s",
  async (event) => {
    const pending = openSnapshot("v1.br.example", new AbortController().signal);
    latestWorker()[event]?.();
    await expect(pending).rejects.toEqual(new SnapshotError("unavailable"));
    expect(latestWorker().terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);
