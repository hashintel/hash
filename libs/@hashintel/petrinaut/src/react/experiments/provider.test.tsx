/**
 * @vitest-environment jsdom
 */
import { act, render, type RenderResult } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PlaceTokenCountDistributionFrame } from "@hashintel/petrinaut-core/simulation";
import type { SDCPN } from "@hashintel/petrinaut-core/types/sdcpn";
import {
  NotificationsContext,
  type AddNotificationInput,
} from "../notifications/context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { ExperimentsContext, type ExperimentsContextValue } from "./context";
import { ExperimentsProvider } from "./provider";
import type {
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core/simulation/monte-carlo/worker/messages";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

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

function makeDistributionFrame(): PlaceTokenCountDistributionFrame {
  return {
    frameNumber: 1,
    time: 1,
    runCount: 1,
    activeRunCount: 1,
    completedRunCount: 0,
    erroredRunCount: 0,
    places: [
      {
        placeId: "place-a",
        placeName: "Place A",
        sampleCount: 1,
        bins: [[1, 1]],
      },
    ],
  };
}

class FakeMonteCarloWorker {
  readonly sent: MonteCarloToWorkerMessage[] = [];
  readonly postMessage = vi.fn((message: MonteCarloToWorkerMessage) => {
    this.sent.push(message);
  });
  readonly terminate = vi.fn(() => {
    this.terminated = true;
    this.listeners.clear();
  });

  terminated = false;
  #listeners = new Set<
    (event: MessageEvent<MonteCarloToMainMessage>) => void
  >();

  private get listeners() {
    return this.#listeners;
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<MonteCarloToMainMessage>) => void,
  ) {
    if (type === "message") {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<MonteCarloToMainMessage>) => void,
  ) {
    if (type === "message") {
      this.#listeners.delete(listener);
    }
  }

  emit(message: MonteCarloToMainMessage) {
    for (const listener of this.#listeners) {
      listener(
        new MessageEvent<MonteCarloToMainMessage>("message", {
          data: message,
        }),
      );
    }
  }
}

const flushWorkerSetup = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: EMPTY_SDCPN,
  readonly: false,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
};

const ExperimentsContextConsumer = ({
  onContextValue,
}: {
  onContextValue: (value: ExperimentsContextValue) => void;
}) => {
  const contextValue = use(ExperimentsContext);
  onContextValue(contextValue);
  return null;
};

const TestWrapper = ({
  addNotification,
  worker,
  onContextValue,
}: {
  addNotification?: (notification: AddNotificationInput) => string;
  worker: FakeMonteCarloWorker;
  onContextValue: (value: ExperimentsContextValue) => void;
}) => (
  <NotificationsContext
    value={{
      addNotification: addNotification ?? (() => ""),
      dismissNotification: () => {},
    }}
  >
    <SDCPNContext.Provider value={sdcpnContextValue}>
      <ExperimentsProvider workerFactory={() => worker as unknown as Worker}>
        <ExperimentsContextConsumer onContextValue={onContextValue} />
      </ExperimentsProvider>
    </SDCPNContext.Provider>
  </NotificationsContext>
);

function renderExperimentsProvider(
  worker: FakeMonteCarloWorker,
  options: {
    addNotification?: (notification: AddNotificationInput) => string;
  } = {},
): {
  getValue: () => ExperimentsContextValue;
  renderResult: RenderResult;
} {
  const valueHolder = { current: null as ExperimentsContextValue | null };
  const captureValue = (value: ExperimentsContextValue) => {
    valueHolder.current = value;
  };

  const renderResult = render(
    <TestWrapper
      addNotification={options.addNotification}
      worker={worker}
      onContextValue={captureValue}
    />,
  );

  return {
    getValue: () => valueHolder.current!,
    renderResult,
  };
}

describe("ExperimentsProvider", () => {
  it("creates, streams, cancels, and removes a Monte Carlo experiment", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    let experimentId = "";
    await act(async () => {
      const createPromise = getValue().createExperiment({
        name: "Test experiment",
        scenarioId: null,
        scenarioParameterValues: {},
        runCount: 1,
        seed: 42,
        dt: 1,
        maxTime: 10,
      });

      await flushWorkerSetup();
      expect(worker.sent[0]).toMatchObject({
        type: "init",
        runCount: 1,
        seed: 42,
        dt: 1,
        maxTime: 10,
      });

      worker.emit({ type: "ready" });
      experimentId = await createPromise;
    });

    expect(worker.sent.map((message) => message.type)).toEqual([
      "init",
      "start",
    ]);
    expect(getValue().experiments).toHaveLength(1);
    expect(getValue().selectedExperimentId).toBe(experimentId);
    expect(getValue().selectedExperiment?.status).toBe("running");

    const frame = makeDistributionFrame();
    const progress = makeProgress();
    await act(async () => {
      worker.emit({ type: "distributionFrames", frames: [frame] });
      worker.emit({ type: "progress", progress });
    });

    expect(getValue().selectedExperiment?.distributionFrames).toEqual([frame]);
    expect(getValue().selectedExperiment?.progress).toEqual(progress);

    await act(async () => {
      getValue().cancelExperiment(experimentId);
    });
    expect(worker.sent.map((message) => message.type)).toContain("cancel");

    const cancelledProgress = makeProgress({
      activeRuns: 0,
      advancedRuns: 0,
      completedRuns: 1,
    });
    await act(async () => {
      worker.emit({ type: "cancelled", progress: cancelledProgress });
    });

    expect(getValue().selectedExperiment?.status).toBe("cancelled");
    expect(getValue().selectedExperiment?.progress).toEqual(cancelledProgress);
    expect(worker.terminated).toBe(true);

    await act(async () => {
      getValue().removeExperiment(experimentId);
    });

    expect(getValue().experiments).toEqual([]);
    expect(getValue().selectedExperimentId).toBeNull();

    renderResult.unmount();
  });

  it("prevents window unload while a Monte Carlo experiment is active", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const addNotification = vi.fn(() => "notification-id");
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      addNotification,
    });

    try {
      await act(async () => {
        const createPromise = getValue().createExperiment({
          name: "Blocking experiment",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
        });

        await flushWorkerSetup();
        worker.emit({ type: "ready" });
        await createPromise;
      });

      const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
        ([eventName]) => eventName === "beforeunload",
      );
      expect(beforeUnloadCall).toBeDefined();

      const beforeUnloadHandler = beforeUnloadCall![1] as (
        event: BeforeUnloadEvent,
      ) => void;
      const beforeUnloadEvent = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;
      Object.defineProperty(beforeUnloadEvent, "returnValue", {
        configurable: true,
        value: undefined,
        writable: true,
      });

      beforeUnloadHandler(beforeUnloadEvent);

      expect(beforeUnloadEvent.defaultPrevented).toBe(true);
      expect(beforeUnloadEvent.returnValue).toBe("");

      await act(async () => {
        worker.emit({ type: "complete", progress: makeProgress() });
      });

      expect(addNotification).toHaveBeenCalledWith({
        message: "Blocking experiment complete",
        tone: "success",
      });
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "beforeunload",
        beforeUnloadHandler,
      );
    } finally {
      renderResult.unmount();
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    }
  });

  it("notifies when a Monte Carlo experiment errors", async () => {
    const addNotification = vi.fn(() => "notification-id");
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      addNotification,
    });

    try {
      await act(async () => {
        const createPromise = getValue().createExperiment({
          name: "Erroring experiment",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
        });

        await flushWorkerSetup();
        worker.emit({ type: "ready" });
        await createPromise;
      });

      await act(async () => {
        worker.emit({
          type: "error",
          message: "Worker failed",
          itemId: null,
        });
      });

      expect(getValue().selectedExperiment?.status).toBe("error");
      expect(getValue().selectedExperiment?.error).toBe("Worker failed");
      expect(addNotification).toHaveBeenCalledWith({
        message: "Erroring experiment failed: Worker failed",
        tone: "error",
      });
    } finally {
      renderResult.unmount();
    }
  });
});
