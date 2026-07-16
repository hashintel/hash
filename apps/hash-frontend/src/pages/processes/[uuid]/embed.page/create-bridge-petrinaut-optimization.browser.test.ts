// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBridgePetrinautOptimization } from "./create-bridge-petrinaut-optimization";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const input = { name: "Bridge test" } as PetrinautOptimizationInput;

const getOptimizationRequest = (calls: readonly (readonly unknown[])[]) =>
  calls
    .map(([message]) => message as { kind?: string; requestId?: string })
    .find(({ kind }) => kind === "optimizationRequest");

const sendFromHost = (data: unknown) => {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window.parent }),
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBridgePetrinautOptimization", () => {
  it("relays response chunks into typed streamed events", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const iterator = createBridgePetrinautOptimization()
      .optimize(input)
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(getOptimizationRequest(postMessage.mock.calls)).toBeDefined();
    });
    const requestId = getOptimizationRequest(postMessage.mock.calls)?.requestId;
    expect(requestId).toBeDefined();

    sendFromHost({
      kind: "optimizationResponseStart",
      requestId,
      ok: true,
      status: 200,
      statusText: "OK",
    });
    sendFromHost({
      kind: "optimizationChunk",
      requestId,
      bytes: new TextEncoder().encode(
        '{"type":"started","requestedTrials":1}\n' +
          '{"type":"complete","requestedTrials":1,"completedTrials":1,"prunedTrials":0,"failedTrials":0,"best":null}\n',
      ),
    });
    sendFromHost({ kind: "optimizationEnd", requestId });

    await expect(firstEvent).resolves.toMatchObject({
      done: false,
      value: { type: "started", requestedTrials: 1 },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: "complete", completedTrials: 1 },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("relays AbortSignal cancellation to the host", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const abortController = new AbortController();
    const iterator = createBridgePetrinautOptimization()
      .optimize(input, { signal: abortController.signal })
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(getOptimizationRequest(postMessage.mock.calls)).toBeDefined();
    });
    const requestId = getOptimizationRequest(postMessage.mock.calls)?.requestId;
    abortController.abort();

    await expect(firstEvent).rejects.toMatchObject({ name: "AbortError" });
    expect(
      postMessage.mock.calls.some(
        ([message]) =>
          (message as { kind?: string; requestId?: string }).kind ===
            "optimizationAbort" &&
          (message as { requestId?: string }).requestId === requestId,
      ),
    ).toBe(true);
  });
});
