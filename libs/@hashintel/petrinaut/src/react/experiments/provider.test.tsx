/**
 * @vitest-environment jsdom
 */
import { act, render, type RenderResult } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type MonteCarloUserDefinedMetricFrame,
  type SDCPN,
  type WorkerLike,
} from "@hashintel/petrinaut-core";

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
} from "@hashintel/petrinaut-core/workers/monte-carlo";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const CONSTANT_METRIC_SPEC = [
  {
    id: "constant",
    label: "Constant",
    kind: "expression",
    code: "return 1;",
    sampleRuns: "all",
    aggregateRuns: "mean",
    aggregateTime: "none",
  },
] as const;

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

function makeMetricFrame(): MonteCarloUserDefinedMetricFrame {
  return {
    metricId: "constant",
    label: "Constant",
    outputType: "scalar",
    frameNumber: 0,
    time: 0,
    value: 1,
    frameValue: 1,
    timeValue: null,
    runSampleCount: 2,
    timeSampleCount: 1,
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
      <ExperimentsProvider
        workerFactory={() =>
          worker as WorkerLike<
            MonteCarloToWorkerMessage,
            MonteCarloToMainMessage
          >
        }
      >
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
  it("creates an initializing experiment before the worker reports ready", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Initializing experiment",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
      });

      expect(worker.sent.map((message) => message.type)).toEqual(["init"]);
      expect(getValue().experiments).toHaveLength(1);
      expect(getValue().selectedExperimentId).toBe(experimentId);
      expect(getValue().selectedExperiment).toMatchObject({
        id: experimentId,
        name: "Initializing experiment",
        status: "initializing",
      });

      await act(async () => {
        worker.emit({ type: "ready" });
        await flushWorkerSetup();
      });

      expect(worker.sent.map((message) => message.type)).toEqual([
        "init",
        "start",
      ]);
      expect(getValue().selectedExperiment?.status).toBe("running");
    } finally {
      renderResult.unmount();
    }
  });

  it("can remove an initializing experiment before the worker reports ready", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Remove before ready",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
      });

      await act(async () => {
        getValue().removeExperiment(experimentId);
        await flushWorkerSetup();
      });

      expect(worker.sent.map((message) => message.type)).toEqual([
        "init",
        "cancel",
      ]);
      expect(worker.terminated).toBe(true);
      expect(getValue().experiments).toEqual([]);
      expect(getValue().selectedExperimentId).toBeNull();
    } finally {
      renderResult.unmount();
    }
  });

  it("can cancel an initializing experiment before the worker reports ready", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Cancel before ready",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
      });

      await act(async () => {
        getValue().cancelExperiment(experimentId);
        await flushWorkerSetup();
      });

      expect(worker.sent.map((message) => message.type)).toEqual([
        "init",
        "cancel",
      ]);
      expect(worker.terminated).toBe(true);
      expect(getValue().selectedExperiment).toMatchObject({
        id: experimentId,
        status: "cancelled",
      });
    } finally {
      renderResult.unmount();
    }
  });

  it("validates metric ids after trimming whitespace", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      await expect(
        getValue().createExperiment({
          name: "Duplicate metric ids",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: [
            {
              ...CONSTANT_METRIC_SPEC[0],
              id: " constant ",
            },
            CONSTANT_METRIC_SPEC[0],
          ],
        }),
      ).rejects.toThrow('Metric id "constant" is duplicated');
    } finally {
      renderResult.unmount();
    }
  });

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
        metricSpecs: CONSTANT_METRIC_SPEC,
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

    const frame = makeMetricFrame();
    const progress = makeProgress();
    await act(async () => {
      worker.emit({ type: "metricFrames", frames: [frame] });
      worker.emit({ type: "progress", progress });
    });

    expect(getValue().selectedExperiment?.metricFrames).toEqual([frame]);
    expect(getValue().selectedExperiment?.latestMetricFramesById).toEqual({
      constant: frame,
    });
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
          metricSpecs: CONSTANT_METRIC_SPEC,
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

  it("runs experiment metric specs in the worker", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);
    const metricSpecs = [
      {
        id: "constant",
        label: "Constant",
        kind: "expression",
        code: "return 1;",
        sampleRuns: "all",
        aggregateRuns: "mean",
        aggregateTime: "none",
      },
    ] as const;

    try {
      await act(async () => {
        const createPromise = getValue().createExperiment({
          name: "Metric experiment",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 2,
          seed: 42,
          dt: 1,
          maxTime: 1,
          metricSpecs,
        });

        await flushWorkerSetup();
        expect(worker.sent[0]).toMatchObject({
          type: "init",
          metricSpecs,
        });
        worker.emit({ type: "ready" });
        await createPromise;
      });

      const frame = makeMetricFrame();
      await act(async () => {
        worker.emit({ type: "metricFrames", frames: [frame] });
      });

      expect(
        getValue().selectedExperiment?.latestMetricFramesById.constant,
      ).toEqual(
        expect.objectContaining({
          value: 1,
          frameValue: 1,
          runSampleCount: 2,
        }),
      );
    } finally {
      renderResult.unmount();
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
          metricSpecs: CONSTANT_METRIC_SPEC,
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
