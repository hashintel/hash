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

const getPostedMessage = (
  calls: readonly (readonly unknown[])[],
  kind: string,
) =>
  calls
    .map(
      ([message]) =>
        message as {
          kind?: string;
          requestId?: string;
          input?: unknown;
          runId?: string;
          cursor?: number;
        },
    )
    .find((message) => message.kind === kind);

const getOptimizationAttach = (calls: readonly (readonly unknown[])[]) =>
  getPostedMessage(calls, "optimizationAttach");

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
      .attachOptimizationRun("run-1")
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(getOptimizationAttach(postMessage.mock.calls)).toBeDefined();
    });
    const attachMessage = getOptimizationAttach(postMessage.mock.calls);
    const requestId = attachMessage?.requestId;
    expect(requestId).toBeDefined();
    expect(attachMessage).toMatchObject({ runId: "run-1", cursor: 0 });

    sendFromHost({
      kind: "optimizationResponseStart",
      requestId,
      ok: true,
      status: 200,
      statusText: "OK",
      hashRequestId: "req-1",
      optimizationRunId: "run-1",
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
      .attachOptimizationRun("run-2", { signal: abortController.signal })
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(getOptimizationAttach(postMessage.mock.calls)).toBeDefined();
    });
    const requestId = getOptimizationAttach(postMessage.mock.calls)?.requestId;
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

  it("classifies a mid-stream host error with its correlation ids", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const iterator = createBridgePetrinautOptimization()
      .attachOptimizationRun("run-9")
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(getOptimizationAttach(postMessage.mock.calls)).toBeDefined();
    });
    const requestId = getOptimizationAttach(postMessage.mock.calls)?.requestId;

    sendFromHost({
      kind: "optimizationResponseStart",
      requestId,
      ok: true,
      status: 200,
      statusText: "OK",
      hashRequestId: "req-9",
      optimizationRunId: "run-9",
    });
    sendFromHost({
      kind: "optimizationError",
      requestId,
      category: "network",
      message: "The optimization service connection was interrupted",
    });

    // The bridge reclassifies the host error and backfills the correlation ids
    // captured from the earlier response-start message.
    await expect(firstEvent).rejects.toMatchObject({
      name: "PetrinautOptimizationTransportError",
      category: "network",
      hashRequestId: "req-9",
      optimizationRunId: "run-9",
    });
  });

  it("resolves a created detached run's id", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const created =
      createBridgePetrinautOptimization().createOptimizationRun(input);

    await vi.waitFor(() => {
      expect(
        getPostedMessage(postMessage.mock.calls, "optimizationCreate"),
      ).toBeDefined();
    });
    const createMessage = getPostedMessage(
      postMessage.mock.calls,
      "optimizationCreate",
    );
    expect(createMessage?.input).toEqual(input);

    sendFromHost({
      kind: "optimizationCreateResult",
      requestId: createMessage?.requestId,
      ok: true,
      runId: "run-42",
    });

    await expect(created).resolves.toEqual({ runId: "run-42" });
  });

  it("rejects a failed creation with its classification, status, and retry delay", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const created =
      createBridgePetrinautOptimization().createOptimizationRun(input);

    await vi.waitFor(() => {
      expect(
        getPostedMessage(postMessage.mock.calls, "optimizationCreate"),
      ).toBeDefined();
    });
    sendFromHost({
      kind: "optimizationCreateResult",
      requestId: getPostedMessage(postMessage.mock.calls, "optimizationCreate")
        ?.requestId,
      ok: false,
      category: "http",
      status: 429,
      retryAfter: 30,
      message: "Too many concurrent optimizations",
    });

    await expect(created).rejects.toMatchObject({
      name: "PetrinautOptimizationTransportError",
      category: "http",
      httpStatus: 429,
      retryAfter: 30,
      message: "Too many concurrent optimizations",
    });
  });

  it("cancels a run created after the local create was aborted", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const abortController = new AbortController();
    const created = createBridgePetrinautOptimization().createOptimizationRun(
      input,
      { signal: abortController.signal },
    );

    await vi.waitFor(() => {
      expect(
        getPostedMessage(postMessage.mock.calls, "optimizationCreate"),
      ).toBeDefined();
    });
    abortController.abort();
    await expect(created).rejects.toMatchObject({ name: "AbortError" });

    // The host's reply arrives after the local promise already settled: the
    // run exists server-side but nobody will ever own it, so the bridge asks
    // the host to cancel it.
    sendFromHost({
      kind: "optimizationCreateResult",
      requestId: getPostedMessage(postMessage.mock.calls, "optimizationCreate")
        ?.requestId,
      ok: true,
      runId: "run-late",
    });

    await vi.waitFor(() => {
      expect(
        getPostedMessage(postMessage.mock.calls, "optimizationCancel"),
      ).toMatchObject({ runId: "run-late" });
    });
  });

  it("attaches to a run with the resume cursor and relays replayed and live events", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);
    const onAttached = vi.fn();
    const iterator = createBridgePetrinautOptimization()
      .attachOptimizationRun("run-7", { cursor: 2, onAttached })
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(
        getPostedMessage(postMessage.mock.calls, "optimizationAttach"),
      ).toBeDefined();
    });
    const attachMessage = getPostedMessage(
      postMessage.mock.calls,
      "optimizationAttach",
    );
    expect(attachMessage).toMatchObject({ runId: "run-7", cursor: 2 });

    const requestId = attachMessage?.requestId;
    sendFromHost({
      kind: "optimizationResponseStart",
      requestId,
      ok: true,
      status: 200,
      statusText: "OK",
      hashRequestId: "req-7",
      optimizationRunId: "run-7",
    });
    // A replayed event (seq 3) followed by a live terminal event (seq 4).
    sendFromHost({
      kind: "optimizationChunk",
      requestId,
      bytes: new TextEncoder().encode(
        '{"type":"trial","trial":2,"parameters":{"rate":0.4},"objective":1,"state":"complete","best":null,"seq":3}\n',
      ),
    });
    sendFromHost({
      kind: "optimizationChunk",
      requestId,
      bytes: new TextEncoder().encode(
        '{"type":"complete","requestedTrials":3,"completedTrials":3,"prunedTrials":0,"failedTrials":0,"best":null,"seq":4}\n',
      ),
    });
    sendFromHost({ kind: "optimizationEnd", requestId });

    await expect(firstEvent).resolves.toMatchObject({
      done: false,
      value: { type: "trial", trial: 2, seq: 3 },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: "complete", completedTrials: 3, seq: 4 },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    // The accepted response fired the "connected" signal exactly once.
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it("posts a fire-and-forget cancel for a detached run", async () => {
    const postMessage = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    await createBridgePetrinautOptimization().cancelOptimizationRun("run-9");

    expect(
      getPostedMessage(postMessage.mock.calls, "optimizationCancel"),
    ).toMatchObject({ runId: "run-9" });
  });
});
