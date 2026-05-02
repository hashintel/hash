import { describe, expect, it, vi } from "vitest";

import type {
  ToMainMessage,
  ToWorkerMessage,
} from "../../simulation/worker/messages";
import type { SimulationFrame } from "../../simulation/context";
import type { SDCPN } from "../types/sdcpn";
import { startSimulation } from "./simulation";
import type { SimulationTransport } from "./transport";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

function makeFrame(time: number): SimulationFrame {
  return {
    time,
    places: {},
    transitions: {},
    buffer: new Float64Array(),
  };
}

/**
 * Manual transport: tests script the engine's message stream by calling
 * `simulate()` on the returned object.
 */
function makeMockTransport() {
  const sent: ToWorkerMessage[] = [];
  const listeners = new Set<(m: ToMainMessage) => void>();
  let terminated = false;

  const transport: SimulationTransport = {
    send(message) {
      sent.push(message);
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

describe("startSimulation", () => {
  it("resolves once the worker reports ready", async () => {
    const mock = makeMockTransport();
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
    });

    expect(mock.sent[0]?.type).toBe("init");

    mock.simulate({ type: "ready", initialFrameCount: 1 });

    const sim = await promise;
    expect(sim.status.get()).toBe("Ready");
    sim.dispose();
  });

  it("rejects on init error and tears down", async () => {
    const mock = makeMockTransport();
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
    });

    mock.simulate({ type: "error", message: "boom", itemId: null });

    await expect(promise).rejects.toThrow("boom");
  });

  it("appends single-frame and batch-frame messages to the frame summary", async () => {
    const mock = makeMockTransport();
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    const seen: number[] = [];
    sim.frames.subscribe((s) => seen.push(s.count));

    mock.simulate({ type: "frame", frame: makeFrame(0) });
    mock.simulate({
      type: "frames",
      frames: [makeFrame(0.01), makeFrame(0.02), makeFrame(0.03)],
    });

    expect(sim.frames.get().count).toBe(4);
    expect(sim.frames.get().latest?.time).toBe(0.03);
    expect(sim.getFrame(2)?.time).toBe(0.02);
    expect(seen).toEqual([1, 4]);

    sim.dispose();
  });

  it("emits a complete event when the worker finishes", async () => {
    const mock = makeMockTransport();
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
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
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
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
    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
      },
    });
    mock.simulate({ type: "ready", initialFrameCount: 0 });
    const sim = await promise;

    sim.dispose();
    sim.dispose();
    expect(mock.isTerminated()).toBe(true);
  });

  it("rejects when an AbortSignal fires during init", async () => {
    const mock = makeMockTransport();
    const ctrl = new AbortController();

    const promise = startSimulation({
      transport: mock.transport,
      config: {
        sdcpn: empty(),
        initialMarking: new Map(),
        parameterValues: {},
        seed: 1,
        dt: 0.01,
        maxTime: null,
        signal: ctrl.signal,
      },
    });

    ctrl.abort();

    await expect(promise).rejects.toThrow(/abort/i);
    expect(mock.isTerminated()).toBe(true);
  });
});
