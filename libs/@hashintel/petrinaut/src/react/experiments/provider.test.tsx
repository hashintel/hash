/**
 * @vitest-environment jsdom
 */
import { act, render, type RenderResult } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type MonteCarloUserDefinedMetricFrame,
  DEFAULT_PETRINAUT_EXTENSIONS,
  type SDCPN,
  type WorkerLike,
} from "@hashintel/petrinaut-core";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import { LanguageClientContext } from "../lsp/context";
import {
  NotificationsContext,
  type AddNotificationInput,
} from "../notifications/context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { ExperimentsContext, type ExperimentsContextValue } from "./context";
import { ExperimentsProvider } from "./provider";

import type { LanguageClientContextValue } from "../lsp/context";
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

/**
 * A net with one parameter driven by a scenario parameter, so ranged
 * scenario-parameter values reach each cell's worker as distinct
 * `parameterValues`.
 */
const RANGED_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [
    {
      id: "param-beta",
      name: "Beta",
      variableName: "beta",
      type: "real",
      defaultValue: "1",
    },
  ],
  differentialEquations: [],
  scenarios: [
    {
      id: "scenario-sweep",
      name: "Sweep",
      scenarioParameters: [{ type: "real", identifier: "x", default: 0 }],
      parameterOverrides: { "param-beta": "scenario.x * 2" },
      initialState: { type: "per_place", content: {} },
    },
  ],
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

function makeDistributionFrame(
  bins: readonly (readonly [number, number])[],
  runSampleCount: number,
): MonteCarloUserDefinedMetricFrame {
  return {
    metricId: "constant",
    label: "Constant",
    outputType: "distribution",
    frameNumber: 0,
    time: 0,
    bins,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount,
    timeSampleCount: runSampleCount,
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

function makeSdcpnContextValue(sdcpn: SDCPN): SDCPNContextValue {
  return {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "test-net",
    petriNetDefinition: sdcpn,
    readonly: false,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    setTitle: () => {},
    title: "Test",
    getItemType: () => null,
  };
}

const sdcpnContextValue = makeSdcpnContextValue(EMPTY_SDCPN);

/**
 * Overrides the (no-op) default language client so experiment expression
 * metrics compile for real — the provider requires HIR metric artifacts.
 */
const LanguageClientOverride = ({
  children,
  requestHirArtifacts,
}: React.PropsWithChildren<{
  requestHirArtifacts?: LanguageClientContextValue["requestHirArtifacts"];
}>) => {
  const value = use(LanguageClientContext);
  return (
    <LanguageClientContext.Provider
      value={{
        ...value,
        requestHirArtifacts:
          requestHirArtifacts ??
          ((sdcpn, extensions) =>
            Promise.resolve(compileHirArtifacts(sdcpn, extensions))),
      }}
    >
      {children}
    </LanguageClientContext.Provider>
  );
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
  requestHirArtifacts,
  createWorker,
  sdcpn,
  maxConcurrentCellWorkers,
  focusDebounceMs,
  onContextValue,
}: {
  addNotification?: (notification: AddNotificationInput) => string;
  requestHirArtifacts?: LanguageClientContextValue["requestHirArtifacts"];
  createWorker: () => FakeMonteCarloWorker;
  sdcpn?: SDCPN;
  maxConcurrentCellWorkers?: number;
  focusDebounceMs?: number;
  onContextValue: (value: ExperimentsContextValue) => void;
}) => (
  <NotificationsContext
    value={{
      addNotification: addNotification ?? (() => ""),
      dismissNotification: () => {},
    }}
  >
    <SDCPNContext.Provider
      value={sdcpn ? makeSdcpnContextValue(sdcpn) : sdcpnContextValue}
    >
      <LanguageClientOverride requestHirArtifacts={requestHirArtifacts}>
        <ExperimentsProvider
          workerFactory={() =>
            createWorker() as WorkerLike<
              MonteCarloToWorkerMessage,
              MonteCarloToMainMessage
            >
          }
          maxConcurrentCellWorkers={maxConcurrentCellWorkers}
          focusDebounceMs={focusDebounceMs}
        >
          <ExperimentsContextConsumer onContextValue={onContextValue} />
        </ExperimentsProvider>
      </LanguageClientOverride>
    </SDCPNContext.Provider>
  </NotificationsContext>
);

function renderExperimentsProvider(
  worker: FakeMonteCarloWorker | (() => FakeMonteCarloWorker),
  options: {
    addNotification?: (notification: AddNotificationInput) => string;
    requestHirArtifacts?: LanguageClientContextValue["requestHirArtifacts"];
    sdcpn?: SDCPN;
    maxConcurrentCellWorkers?: number;
    focusDebounceMs?: number;
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
      requestHirArtifacts={options.requestHirArtifacts}
      createWorker={typeof worker === "function" ? worker : () => worker}
      sdcpn={options.sdcpn}
      maxConcurrentCellWorkers={options.maxConcurrentCellWorkers}
      focusDebounceMs={options.focusDebounceMs ?? 0}
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

  it("ignores a compile failure after an initializing experiment is cancelled", async () => {
    const worker = new FakeMonteCarloWorker();
    const addNotification = vi.fn(() => "notification-id");
    let rejectCompilation: (reason: Error) => void = () => {};
    const requestHirArtifacts = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectCompilation = reject;
        }),
    );
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      addNotification,
      requestHirArtifacts,
    });

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Cancel during compile",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
      });

      act(() => {
        getValue().cancelExperiment(experimentId);
      });
      await act(async () => {
        rejectCompilation(new Error("late compile failure"));
        await flushWorkerSetup();
      });

      expect(getValue().selectedExperiment).toMatchObject({
        id: experimentId,
        status: "cancelled",
        error: null,
      });
      expect(worker.sent).toEqual([]);
      expect(addNotification).not.toHaveBeenCalled();
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
        const initMessage = worker.sent[0];
        expect(initMessage).toMatchObject({
          type: "init",
          metricSpecs,
        });
        if (initMessage?.type !== "init") {
          throw new Error("Expected the experiment init message");
        }
        expect(initMessage.sdcpn.metrics).toEqual([
          {
            id: "constant",
            name: "Constant",
            code: "return 1;",
          },
        ]);
        expect(initMessage.hirArtifacts?.fingerprint).toBe(
          compileHirArtifacts(initMessage.sdcpn, initMessage.extensions)
            .artifacts.fingerprint,
        );
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

  it("seeds every combination with one run, then refines the viewed selection up the ladder", async () => {
    const workers: FakeMonteCarloWorker[] = [];
    const createWorker = () => {
      const worker = new FakeMonteCarloWorker();
      workers.push(worker);
      return worker;
    };
    const addNotification = vi.fn(() => "notification-id");
    const { getValue, renderResult } = renderExperimentsProvider(createWorker, {
      addNotification,
      sdcpn: RANGED_SDCPN,
      maxConcurrentCellWorkers: 1,
    });

    const finishBatch = async (
      worker: FakeMonteCarloWorker,
      runCount: number,
      frames: MonteCarloUserDefinedMetricFrame[] = [],
    ) => {
      await act(async () => {
        worker.emit({ type: "ready" });
        await flushWorkerSetup();
        if (frames.length > 0) {
          worker.emit({ type: "metricFrames", frames });
        }
        worker.emit({
          type: "complete",
          progress: makeProgress({
            activeRuns: 0,
            advancedRuns: 0,
            completedRuns: runCount,
            allFinished: true,
            runCount,
            time: 10,
          }),
        });
        await flushWorkerSetup();
      });
    };

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Lazy sweep",
          scenarioId: "scenario-sweep",
          scenarioParameterValues: {
            x: { mode: "range", min: 0, max: 1, valueCount: 3 },
          },
          runCount: 30,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
      });

      // Seed pass: one run per combination, one worker at a time.
      expect(workers).toHaveLength(1);
      expect(workers[0]!.sent[0]).toMatchObject({
        type: "init",
        runCount: 1,
        seed: 42,
        parameterValues: { beta: "0" },
      });

      await finishBatch(workers[0]!, 1, [makeDistributionFrame([[1, 1]], 1)]);
      expect(workers).toHaveLength(2);
      expect(workers[1]!.sent[0]).toMatchObject({
        type: "init",
        runCount: 1,
        seed: 42,
        parameterValues: { beta: "1" },
      });

      await finishBatch(workers[1]!, 1);
      await finishBatch(workers[2]!, 1);

      // Baseline done; nothing is viewed, so the experiment idles.
      expect(workers).toHaveLength(3);
      const seeded = getValue().selectedExperiment!;
      expect(seeded.status).toBe("idle");
      expect(seeded.cells.map((cell) => cell.status)).toEqual([
        "idle",
        "idle",
        "idle",
      ]);
      expect(seeded.cells.map((cell) => cell.runsCompleted)).toEqual([1, 1, 1]);
      expect(seeded.cells[0]!.metricFrames).toEqual([
        makeDistributionFrame([[1, 1]], 1),
      ]);
      expect(seeded.progress).toMatchObject({
        completedRuns: 3,
        runCount: 90,
      });

      // Viewing x pinned to its last value refines only that combination:
      // 1 → 10 → 30 (clamped to the requested run count).
      act(() => {
        getValue().setExperimentRunFocus(experimentId, { x: 2 });
      });
      await act(async () => {
        await flushWorkerSetup();
      });

      expect(workers).toHaveLength(4);
      expect(workers[3]!.sent[0]).toMatchObject({
        type: "init",
        runCount: 9,
        seed: 43,
        parameterValues: { beta: "2" },
      });

      await finishBatch(workers[3]!, 9, [makeDistributionFrame([[1, 9]], 9)]);

      expect(workers).toHaveLength(5);
      expect(workers[4]!.sent[0]).toMatchObject({
        type: "init",
        runCount: 20,
        seed: 52,
        parameterValues: { beta: "2" },
      });

      await finishBatch(workers[4]!, 20, [
        makeDistributionFrame([[1, 20]], 20),
      ]);

      // The pinned combination is saturated: accumulated batches merged,
      // no further workers spawn for it.
      expect(workers).toHaveLength(5);
      const refined = getValue().selectedExperiment!;
      expect(refined.status).toBe("idle");
      expect(refined.cells[2]).toMatchObject({
        status: "complete",
        runsCompleted: 30,
      });
      // The seed batch emitted no frames, so the accumulated distribution
      // holds the two refinement batches (9 + 20 samples).
      expect(refined.cells[2]!.metricFrames).toEqual([
        makeDistributionFrame([[1, 29]], 29),
      ]);
      expect(refined.cells.map((cell) => cell.runsCompleted)).toEqual([
        1, 1, 30,
      ]);
      // Not everything reached the target, so no completion notification.
      expect(addNotification).not.toHaveBeenCalled();

      // Unpinning samples the remaining combinations, levelling up the ones
      // with the fewest runs first.
      act(() => {
        getValue().setExperimentRunFocus(experimentId, { x: null });
      });
      await act(async () => {
        await flushWorkerSetup();
      });

      expect(workers).toHaveLength(6);
      const levelled = workers[5]!.sent[0];
      expect(levelled).toMatchObject({ type: "init", runCount: 9 });
      if (levelled?.type !== "init") {
        throw new Error("Expected an init message");
      }
      expect(["0", "1"]).toContain(levelled.parameterValues.beta);
    } finally {
      renderResult.unmount();
    }
  });

  it("stops refining a combination when the view moves to another one", async () => {
    const workers: FakeMonteCarloWorker[] = [];
    const createWorker = () => {
      const worker = new FakeMonteCarloWorker();
      workers.push(worker);
      return worker;
    };
    const { getValue, renderResult } = renderExperimentsProvider(createWorker, {
      sdcpn: RANGED_SDCPN,
      maxConcurrentCellWorkers: 1,
    });

    const completeBatch = async (
      worker: FakeMonteCarloWorker,
      runCount: number,
    ) => {
      await act(async () => {
        worker.emit({ type: "ready" });
        await flushWorkerSetup();
        worker.emit({
          type: "complete",
          progress: makeProgress({
            activeRuns: 0,
            advancedRuns: 0,
            completedRuns: runCount,
            allFinished: true,
            runCount,
            time: 10,
          }),
        });
        await flushWorkerSetup();
      });
    };

    try {
      let experimentId = "";
      await act(async () => {
        experimentId = await getValue().createExperiment({
          name: "Refocused sweep",
          scenarioId: "scenario-sweep",
          scenarioParameterValues: {
            x: { mode: "range", min: 0, max: 1, valueCount: 3 },
          },
          runCount: 30,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
      });

      await completeBatch(workers[0]!, 1);
      await completeBatch(workers[1]!, 1);
      await completeBatch(workers[2]!, 1);

      // Refine x = 0; its 9-run batch starts computing.
      act(() => {
        getValue().setExperimentRunFocus(experimentId, { x: 0 });
      });
      await act(async () => {
        await flushWorkerSetup();
        workers[3]!.emit({ type: "ready" });
        await flushWorkerSetup();
      });
      expect(workers).toHaveLength(4);
      expect(workers[3]!.sent[0]).toMatchObject({
        type: "init",
        parameterValues: { beta: "0" },
      });
      expect(getValue().selectedExperiment?.status).toBe("running");

      // Moving the view to x = 1 interrupts the in-flight batch...
      act(() => {
        getValue().setExperimentRunFocus(experimentId, { x: 1 });
      });
      expect(workers[3]!.sent.map((message) => message.type)).toContain(
        "cancel",
      );

      await act(async () => {
        workers[3]!.emit({
          type: "cancelled",
          progress: makeProgress({ activeRuns: 0, advancedRuns: 0 }),
        });
        await flushWorkerSetup();
      });

      // ...discarding its partial runs, and redirects compute to x = 1.
      expect(workers[3]!.terminated).toBe(true);
      expect(getValue().selectedExperiment?.cells[0]).toMatchObject({
        status: "idle",
        runsCompleted: 1,
        inFlightMetricFrames: [],
      });
      expect(workers).toHaveLength(5);
      expect(workers[4]!.sent[0]).toMatchObject({
        type: "init",
        runCount: 9,
        parameterValues: { beta: "1" },
      });

      // Cancelling the experiment stops refinement for good.
      await act(async () => {
        getValue().cancelExperiment(experimentId);
        await flushWorkerSetup();
        workers[4]!.emit({
          type: "cancelled",
          progress: makeProgress({ activeRuns: 0, advancedRuns: 0 }),
        });
        await flushWorkerSetup();
      });

      expect(getValue().selectedExperiment?.status).toBe("cancelled");
      act(() => {
        getValue().setExperimentRunFocus(experimentId, { x: 0 });
      });
      await act(async () => {
        await flushWorkerSetup();
      });
      expect(workers).toHaveLength(5);
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
