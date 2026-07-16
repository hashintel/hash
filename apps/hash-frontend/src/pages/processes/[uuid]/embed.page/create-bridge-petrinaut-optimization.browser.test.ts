// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";

import { createBridgePetrinautOptimization } from "./create-bridge-petrinaut-optimization";

const input = petrinautOptimizationInputSchema.parse({
  kind: "petrinaut-optimization",
  version: 1,
  name: "Bridge test",
  model: {
    title: "Bridge model",
    definition: {
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      subnets: [],
      componentInstances: [],
      scenarios: [
        {
          id: "baseline",
          name: "Baseline",
          scenarioParameters: [
            { identifier: "rate", type: "real", default: 0.5 },
          ],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        },
      ],
      metrics: [{ id: "profit", name: "Profit", code: "return 1;" }],
    },
  },
  scenario: {
    id: "baseline",
    parameterBindings: {
      rate: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.1,
          maximum: 1,
          scale: "linear",
        },
      },
    },
  },
  objective: { metricId: "profit", direction: "maximize" },
  execution: { seed: 42, dt: 0.1, maxTime: 10 },
  study: { trials: 1, sampler: "tpe" },
});

const getOptimizationRequest = (calls: readonly (readonly unknown[])[]) =>
  calls
    .map(
      ([message]) =>
        message as { kind?: string; requestId?: string; input?: unknown },
    )
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
    const optimizationRequest = getOptimizationRequest(postMessage.mock.calls);
    const requestId = optimizationRequest?.requestId;
    expect(requestId).toBeDefined();
    expect(optimizationRequest?.input).toEqual(input);

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
