import { describe, expect, it, vi } from "vitest";

import {
  createEngineFrame,
  createEngineFrameLayout,
} from "../frames/internal-frame";
import { createSimulation } from "./simulation";

import type {
  AbortSignalLike,
  WorkerMessageEnvelope,
  WorkerLike,
} from "../../environment";
import type { SDCPN } from "../../types/sdcpn";
import type { SimulationFrameSummary, SimulationTransport } from "../api";
import type { SimulationFramePayload } from "../worker/frame-payload";
import type { ToMainMessage, ToWorkerMessage } from "../worker/messages";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

function makeFrame(time: number): SimulationFramePayload {
  const frame = createEngineFrame(createEngineFrameLayout(empty()), {
    places: {},
    transitions: {},
    buffer: new Uint8Array(0),
  });

  return {
    time,
    frame,
  };
}

function makeAbortControllerLike(): {
  signal: AbortSignalLike;
  abort(): void;
} {
  const listeners = new Set<() => void>();
  const signal: AbortSignalLike = {
    aborted: false,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };

  return {
    signal,
    abort() {
      (signal as { aborted: boolean }).aborted = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/**
 * Manual transport: tests script the engine's message stream by calling
 * `simulate()` on the returned object.
 */
function makeMockTransport() {
  const sent: ToWorkerMessage[] = [];
  const listeners = new Set<(m: unknown) => void>();
  let terminated = false;

  const transport: SimulationTransport = {
    send(message) {
      sent.push(message as ToWorkerMessage);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate() {
      terminated = true;
      listeners.clear();
    },
  };

  return {
    transport,
    sent,
    isTerminated: () => terminated,
    simulate(message: ToMainMessage) {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}

describe("createSimulation (transport flavour)", () => {
  it("resolves once the worker reports ready", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });

    expect(mock.sent[0]?.type).toBe("init");

    mock.simulate({ type: "ready", initialFrameCount: 1 });

    const sim = await promise;
    expect(sim.status.get()).toBe("Ready");
    sim.dispose();
  });

  it("rejects on init error and tears down", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });

    mock.simulate({ type: "error", message: "boom", itemId: null });

    await expect(promise).rejects.toThrow("boom");
  });

  it("appends single-frame and batch-frame messages to the frame summary", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    const seen: number[] = [];
    sim.frames.subscribe((s: SimulationFrameSummary) => seen.push(s.count));

    mock.simulate({ type: "frame", frame: makeFrame(0) });
    mock.simulate({
      type: "frames",
      frames: [makeFrame(0.01), makeFrame(0.02), makeFrame(0.03)],
    });

    expect(sim.frames.get().count).toBe(4);
    expect(sim.frames.get().latest?.number).toBe(3);
    expect(sim.frames.get().latest?.time).toBe(0.03);
    expect(sim.getFrame(2)?.number).toBe(2);
    expect(sim.getFrame(2)?.time).toBe(0.02);
    expect(seen).toEqual([1, 4]);

    sim.dispose();
  });

  it("emits a complete event when the worker finishes", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    const events = vi.fn();
    sim.events.subscribe(events);

    mock.simulate({ type: "complete", reason: "deadlock", frameNumber: 42 });

    expect(sim.status.get()).toBe("Complete");
    expect(events).toHaveBeenCalledWith({
      type: "complete",
      reason: "deadlock",
      frameNumber: 42,
    });

    sim.dispose();
  });

  it("forwards control messages over the transport", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    sim.run();
    sim.pause();
    sim.ack(7);
    sim.setBackpressure({ maxFramesAhead: 100, batchSize: 10 });

    const types = mock.sent.map((m) => m.type);
    expect(types).toEqual(["init", "start", "pause", "ack", "setBackpressure"]);

    sim.dispose();
  });

  it("dispose() terminates the transport and is idempotent", async () => {
    const mock = makeMockTransport();
    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    sim.dispose();
    sim.dispose();
    expect(mock.isTerminated()).toBe(true);
  });

  it("rejects when an AbortSignal fires during init", async () => {
    const mock = makeMockTransport();
    const ctrl = makeAbortControllerLike();

    const promise = createSimulation({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
      signal: ctrl.signal,
    });

    ctrl.abort();

    await expect(promise).rejects.toThrow(/abort/i);
    expect(mock.isTerminated()).toBe(true);
  });
});

describe("createSimulation (createWorker flavour)", () => {
  it("builds a transport from the factory and routes messages through it", async () => {
    // Stand-in Worker — captures postMessage and lets us trigger 'message' events.
    type WorkerMessageHandler = (
      event: WorkerMessageEnvelope<ToMainMessage>,
    ) => void;

    const sentToWorker: ToWorkerMessage[] = [];
    let messageHandler: WorkerMessageHandler | null = null;
    let terminated = false;

    const fakeWorker = {
      postMessage(message: ToWorkerMessage) {
        sentToWorker.push(message);
      },
      addEventListener(type: string, handler: WorkerMessageHandler) {
        if (type === "message") {
          messageHandler = handler;
        }
      },
      removeEventListener() {},
      terminate() {
        terminated = true;
      },
    } satisfies WorkerLike<ToWorkerMessage, ToMainMessage>;

    const promise = createSimulation({
      createWorker: () => fakeWorker,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.01,
      maxTime: null,
    });

    // Yield so the createWorkerTransport's promise resolves and the
    // queued init message gets flushed.
    await Promise.resolve();
    await Promise.resolve();
    expect(sentToWorker.find((m) => m.type === "init")).toBeDefined();

    // Simulate the worker reporting ready.
    expect(messageHandler).not.toBeNull();
    const handler = messageHandler as unknown as WorkerMessageHandler;
    handler({ data: { type: "ready", initialFrameCount: 0 } });

    const sim = await promise;
    expect(sim.status.get()).toBe("Ready");

    sim.dispose();
    expect(terminated).toBe(true);
  });
});
