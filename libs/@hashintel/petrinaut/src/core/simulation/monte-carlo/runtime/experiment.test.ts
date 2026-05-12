import { describe, expect, it, vi } from "vitest";

import type { SimulationTransport } from "../../api";
import type { SDCPN } from "../../../types/sdcpn";
import type { PlaceTokenCountDistributionFrame } from "../metrics";
import type {
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
  MonteCarloWorkerProgress,
} from "../worker/messages";
import { createMonteCarloExperiment } from "./experiment";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

function makeProgress(
  overrides: Partial<MonteCarloWorkerProgress> = {},
): MonteCarloWorkerProgress {
  return {
    activeRuns: 1,
    advancedRuns: 1,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
    frameNumber: 1,
    runCount: 1,
    time: 1,
    ...overrides,
  };
}

function makeDistributionFrame(
  frameNumber: number,
): PlaceTokenCountDistributionFrame {
  return {
    frameNumber,
    time: frameNumber,
    runCount: 1,
    activeRunCount: 1,
    completedRunCount: 0,
    erroredRunCount: 0,
    places: [
      {
        placeId: "place-a",
        placeName: "Place A",
        sampleCount: 1,
        bins: [[frameNumber, 1]],
      },
    ],
  };
}

function makeMockTransport() {
  const sent: MonteCarloToWorkerMessage[] = [];
  const listeners = new Set<(message: unknown) => void>();
  let terminated = false;

  const transport: SimulationTransport = {
    send(message) {
      sent.push(message as MonteCarloToWorkerMessage);
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
    simulate(message: MonteCarloToMainMessage) {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}

function createExperimentWithMockTransport(mock: {
  transport: SimulationTransport;
}) {
  return createMonteCarloExperiment({
    transport: mock.transport,
    sdcpn: empty(),
    initialMarking: {},
    parameterValues: {},
    seed: 1,
    dt: 1,
    maxTime: 10,
    runCount: 1,
  });
}

describe("createMonteCarloExperiment", () => {
  it("sends init and resolves when the worker reports ready", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);

    expect(mock.sent[0]).toMatchObject({
      type: "init",
      seed: 1,
      dt: 1,
      maxTime: 10,
      runCount: 1,
    });

    mock.simulate({ type: "ready" });

    const experiment = await promise;
    expect(experiment.status.get()).toBe("Ready");

    experiment.dispose();
  });

  it("updates progress, appends distribution frames, and emits completion", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const statusUpdates: string[] = [];
    const events = vi.fn();
    experiment.status.subscribe((status) => statusUpdates.push(status));
    experiment.events.subscribe(events);

    const firstFrame = makeDistributionFrame(1);
    const secondFrame = makeDistributionFrame(2);
    mock.simulate({
      type: "distributionFrames",
      frames: [firstFrame, secondFrame],
    });
    mock.simulate({ type: "progress", progress: makeProgress() });

    expect(experiment.distributions.get()).toEqual({
      frames: [firstFrame, secondFrame],
      latest: secondFrame,
    });
    expect(experiment.progress.get()).toMatchObject({
      frameNumber: 1,
      time: 1,
    });

    const completeProgress = makeProgress({
      activeRuns: 0,
      allFinished: true,
      completedRuns: 1,
      frameNumber: 10,
      time: 10,
    });
    mock.simulate({ type: "complete", progress: completeProgress });

    expect(experiment.status.get()).toBe("Complete");
    expect(statusUpdates).toContain("Complete");
    expect(events).toHaveBeenCalledWith({
      type: "complete",
      progress: completeProgress,
    });

    experiment.dispose();
  });

  it("forwards start and cancel messages over the transport", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    experiment.start();
    experiment.cancel();

    expect(mock.sent.map((message) => message.type)).toEqual([
      "init",
      "start",
      "cancel",
    ]);

    experiment.dispose();
  });

  it("emits cancelled and tears down idempotently", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const events = vi.fn();
    experiment.events.subscribe(events);
    const progress = makeProgress({ advancedRuns: 0 });

    mock.simulate({ type: "cancelled", progress });
    expect(experiment.status.get()).toBe("Cancelled");
    expect(events).toHaveBeenCalledWith({ type: "cancelled", progress });

    experiment.dispose();
    experiment.dispose();
    expect(mock.isTerminated()).toBe(true);
  });

  it("rejects when the worker reports an initialization error", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);

    mock.simulate({ type: "error", message: "boom", itemId: "transition-a" });

    await expect(promise).rejects.toThrow("boom");
  });

  it("emits errors reported after initialization", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const events = vi.fn();
    experiment.events.subscribe(events);

    mock.simulate({ type: "error", message: "late boom", itemId: null });

    expect(experiment.status.get()).toBe("Error");
    expect(events).toHaveBeenCalledWith({
      type: "error",
      message: "late boom",
      itemId: null,
    });

    experiment.dispose();
  });
});
