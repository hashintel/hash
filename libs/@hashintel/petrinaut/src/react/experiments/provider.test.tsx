/**
 * @vitest-environment jsdom
 */
import {
  act,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type CompileHirArtifactsOptions,
  type MonteCarloUserDefinedMetricFrame,
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
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
import { buildSweepAxes, ExperimentsProvider } from "./provider";

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
    // Carried on every scalar frame so a sharded experiment can merge across
    // shards before reducing.
    runAggregate: { count: 2, sum: 2, min: 1, max: 1, last: 1 },
    aggregateRuns: "mean",
    aggregateTime: "none",
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

/**
 * Lets experiment setup run to the point where it reaches the worker.
 *
 * A macrotask boundary drains the entire microtask queue, so this holds however
 * many awaits setup takes. It used to await exactly two microtasks, which was the
 * count at the time and broke the moment a step was added — selection moving
 * behind `selectExperimentBackend` inserted three more (loading the backend,
 * building the request, assessing it), and every test that waits for a worker
 * message failed at once.
 */
const flushWorkerSetup = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

/**
 * Makes the WebGPU backend report itself available for the duration of `body`.
 *
 * `isWebGpuAvailable()` only checks that `navigator.gpu` exists, and jsdom has no
 * such property — so without this the backend is skipped before it is ever asked
 * about a net, and every refusal reads "not available in this environment".
 * Acquiring a device still fails, which is what makes the CPU fallback happen.
 */
const withWebGpuAvailable = async (body: () => Promise<void>) => {
  // Defined on the navigator itself rather than by replacing it: its properties
  // are prototype getters, so a spread copy would drop everything but `gpu`.
  const descriptor = Reflect.getOwnPropertyDescriptor(
    globalThis.navigator,
    "gpu",
  );
  Object.defineProperty(globalThis.navigator, "gpu", {
    configurable: true,
    value: {},
  });
  try {
    await body();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis.navigator, "gpu", descriptor);
    } else {
      Reflect.deleteProperty(globalThis.navigator, "gpu");
    }
  }
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: EMPTY_SDCPN,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
};

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
          ((sdcpn, extensions, options) =>
            Promise.resolve(compileHirArtifacts(sdcpn, extensions, options))),
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
  worker,
  onContextValue,
}: {
  addNotification?: (notification: AddNotificationInput) => string;
  requestHirArtifacts?: LanguageClientContextValue["requestHirArtifacts"];
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
      <LanguageClientOverride requestHirArtifacts={requestHirArtifacts}>
        <ExperimentsProvider
          workerFactory={() =>
            worker as WorkerLike<
              MonteCarloToWorkerMessage,
              MonteCarloToMainMessage
            >
          }
          // One shard, so a single fake worker stands in for the whole
          // experiment. Sharding itself is covered in petrinaut-core.
          experimentShardCount={1}
        >
          <ExperimentsContextConsumer onContextValue={onContextValue} />
        </ExperimentsProvider>
      </LanguageClientOverride>
    </SDCPNContext.Provider>
  </NotificationsContext>
);

function renderExperimentsProvider(
  worker: FakeMonteCarloWorker,
  options: {
    addNotification?: (notification: AddNotificationInput) => string;
    requestHirArtifacts?: LanguageClientContextValue["requestHirArtifacts"];
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
      worker={worker}
      onContextValue={captureValue}
    />,
  );

  return {
    getValue: () => valueHolder.current!,
    renderResult,
  };
}

describe("buildSweepAxes", () => {
  const scenario = {
    id: "scenario",
    name: "Scenario",
    scenarioParameters: [
      { type: "real" as const, identifier: "beta", default: 0.5 },
      { type: "integer" as const, identifier: "count", default: 10 },
    ],
    parameterOverrides: {},
    initialState: { type: "per_place" as const, content: {} },
  };

  it("splits fixed values from sweep axes", () => {
    const { fixedValues, axes } = buildSweepAxes(scenario, {
      beta: { mode: "range", min: 0, max: 1 },
      count: { mode: "fixed", value: "12" },
    });

    expect(fixedValues).toEqual({ count: "12" });
    expect(axes).toEqual([
      { identifier: "beta", min: 0, max: 1, stepCount: 50, integer: false },
    ]);
  });

  it("gives integer parameters one step per integer on narrow intervals", () => {
    const { axes } = buildSweepAxes(scenario, {
      count: { mode: "range", min: 0, max: 20 },
    });
    expect(axes).toEqual([
      { identifier: "count", min: 0, max: 20, stepCount: 20, integer: true },
    ]);
  });

  it("rejects an invalid range with the parameter named", () => {
    expect(() =>
      buildSweepAxes(scenario, {
        beta: { mode: "range", min: 1, max: 0 },
      }),
    ).toThrow("beta");
  });

  it("ignores inputs for parameters the scenario does not declare", () => {
    const { axes } = buildSweepAxes(scenario, {
      ghost: { mode: "range", min: 0, max: 1 },
    });
    expect(axes).toEqual([]);
  });
});

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
        // The lease's reset: the worker returns to the provider's pool for
        // the next batch instead of being terminated.
        "cancel",
      ]);
      expect(worker.terminated).toBe(false);
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
        // The lease's reset before the worker returns to the pool.
        "cancel",
      ]);
      expect(worker.terminated).toBe(false);
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
    // Pooled, not terminated: the lease reset the worker for the next batch.
    expect(worker.terminated).toBe(false);
    expect(worker.sent.at(-1)?.type).toBe("cancel");

    await act(async () => {
      getValue().removeExperiment(experimentId);
    });

    expect(getValue().experiments).toEqual([]);
    expect(getValue().selectedExperimentId).toBeNull();

    renderResult.unmount();
  });

  it("reuses the pooled worker for the next experiment instead of spawning", async () => {
    // A worker that acknowledges `cancel` synchronously, like the in-process
    // worker — pooling completes within the same act() that released it.
    const workers: FakeMonteCarloWorker[] = [];
    const createAutoAckWorker = () => {
      const worker = new FakeMonteCarloWorker();
      workers.push(worker);
      const facade: WorkerLike<
        MonteCarloToWorkerMessage,
        MonteCarloToMainMessage
      > = {
        postMessage: (message) => {
          worker.postMessage(message);
          if (message.type === "cancel") {
            worker.emit({ type: "cancelled", progress: makeProgress() });
          }
        },
        addEventListener: (type, listener) => {
          worker.addEventListener(type, listener);
        },
        removeEventListener: (type, listener) => {
          worker.removeEventListener(type, listener);
        },
        terminate: worker.terminate,
      };
      return facade;
    };

    const valueHolder = { current: null as ExperimentsContextValue | null };
    const renderResult = render(
      <NotificationsContext
        value={{ addNotification: () => "", dismissNotification: () => {} }}
      >
        <SDCPNContext.Provider value={sdcpnContextValue}>
          <LanguageClientOverride requestHirArtifacts={undefined}>
            <ExperimentsProvider
              workerFactory={createAutoAckWorker}
              experimentShardCount={1}
            >
              <ExperimentsContextConsumer
                onContextValue={(value) => {
                  valueHolder.current = value;
                }}
              />
            </ExperimentsProvider>
          </LanguageClientOverride>
        </SDCPNContext.Provider>
      </NotificationsContext>,
    );
    const getValue = () => valueHolder.current!;

    const runExperiment = async () => {
      let experimentId = "";
      await act(async () => {
        const createPromise = getValue().createExperiment({
          name: "Pooled",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
        workers.at(-1)!.emit({ type: "ready" });
        experimentId = await createPromise;
      });
      await act(async () => {
        workers.at(-1)!.emit({
          type: "complete",
          progress: makeProgress({
            activeRuns: 0,
            allFinished: true,
            completedRuns: 1,
          }),
        });
      });
      await act(async () => {
        getValue().removeExperiment(experimentId);
      });
    };

    await runExperiment();
    await runExperiment();

    // One worker served both experiments: released, reset, and re-leased.
    expect(workers).toHaveLength(1);
    const initCount = workers[0]!.sent.filter(
      (message) => message.type === "init",
    ).length;
    expect(initCount).toBe(2);
    expect(workers[0]!.terminated).toBe(false);

    renderResult.unmount();
    // Unmount shuts the pool: the idle worker dies with it.
    expect(workers[0]!.terminated).toBe(true);
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

  it("asks for HIR trees only when the GPU backend is requested", async () => {
    // Only the GPU backend reads the HIR, and carrying it roughly triples the
    // artifact payload structured-cloned to every shard worker. A CPU
    // experiment must not pay for it.
    const requestedOptions: (CompileHirArtifactsOptions | undefined)[] = [];
    const requestHirArtifacts = vi.fn(
      (
        sdcpn: SDCPN,
        extensions?: PetrinautExtensionSettings,
        options?: CompileHirArtifactsOptions,
      ) => {
        requestedOptions.push(options);
        return Promise.resolve(compileHirArtifacts(sdcpn, extensions, options));
      },
    );

    for (const computeBackend of ["cpu", "webgpu"] as const) {
      const worker = new FakeMonteCarloWorker();
      const { getValue, renderResult } = renderExperimentsProvider(worker, {
        requestHirArtifacts,
      });

      try {
        await act(async () => {
          const createPromise = getValue().createExperiment({
            name: `${computeBackend} experiment`,
            scenarioId: null,
            scenarioParameterValues: {},
            runCount: 1,
            seed: 42,
            dt: 1,
            maxTime: 10,
            metricSpecs: CONSTANT_METRIC_SPEC,
            computeBackend,
          });
          // Probing the GPU adds await points before the CPU worker exists, so
          // wait for `init` rather than assuming a single flush reaches it.
          await waitFor(() => {
            expect(worker.sent.map((message) => message.type)).toContain(
              "init",
            );
          });
          worker.emit({ type: "ready" });
          await createPromise;
        });
      } finally {
        renderResult.unmount();
      }
    }

    // Both `false`, including the run that *asked* for the GPU: jsdom exposes no
    // `navigator.gpu`, so the GPU backend reports itself unavailable and is
    // skipped before it is ever assessed. Nothing then needs the HIR trees, and
    // they are not compiled — a real improvement over asking for them whenever
    // the preference was `webgpu`, since carrying them roughly triples the
    // artifact payload cloned to every shard worker.
    expect(requestedOptions).toStrictEqual([
      { includeHir: false },
      { includeHir: false },
    ]);
  });

  it("asks for HIR trees when the GPU backend is available to try", async () => {
    // The counterpart to the case above: with an adapter present the GPU backend
    // is a real candidate, so the trees it needs are compiled. It still declines
    // here — assessment succeeds and instantiation cannot get a device — which is
    // why a second, tree-free request follows for the CPU fallback.
    const requestedOptions: (CompileHirArtifactsOptions | undefined)[] = [];
    const requestHirArtifacts = vi.fn(
      (
        sdcpn: SDCPN,
        extensions?: PetrinautExtensionSettings,
        options?: CompileHirArtifactsOptions,
      ) => {
        requestedOptions.push(options);
        return Promise.resolve(compileHirArtifacts(sdcpn, extensions, options));
      },
    );

    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      requestHirArtifacts,
    });

    try {
      await withWebGpuAvailable(async () => {
        await act(async () => {
          const createPromise = getValue().createExperiment({
            name: "gpu experiment",
            scenarioId: null,
            scenarioParameterValues: {},
            runCount: 1,
            seed: 42,
            dt: 1,
            maxTime: 10,
            metricSpecs: CONSTANT_METRIC_SPEC,
            computeBackend: "webgpu",
          });
          await waitFor(() => {
            expect(worker.sent.map((message) => message.type)).toContain(
              "init",
            );
          });
          worker.emit({ type: "ready" });
          await createPromise;
        });

        expect(requestedOptions).toStrictEqual([
          { includeHir: true },
          { includeHir: false },
        ]);
        // And it ran on the CPU, with the GPU's reason recorded.
        expect(getValue().selectedExperiment?.computeBackend).toBe("cpu");
        expect(
          getValue().selectedExperiment?.computeBackendFallbackReason,
        ).not.toBeNull();
      });
    } finally {
      renderResult.unmount();
    }
  });

  it("times stepping, not setup, and freezes the clock on completion", async () => {
    // The clock is stubbed so that "the finish time does not move" is a real
    // assertion. Against the real clock the whole test runs inside a single
    // millisecond, and a re-stamped timestamp is indistinguishable from a frozen
    // one — the test passes whether or not the provider guards the stamp.
    const createdTime = 1_700_000_000_000;
    let currentTime = createdTime;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      let createPromise!: Promise<string>;

      await act(async () => {
        createPromise = getValue().createExperiment({
          name: "Timed experiment",
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

      // Before `ready`, the experiment is still compiling and spinning up its
      // worker. That is setup, not simulation, so the clock has not started.
      expect(getValue().selectedExperiment).toMatchObject({
        createdAt: createdTime,
        startedAt: null,
        finishedAt: null,
      });

      // Setup took five seconds. Stepping begins after it, so that time is not
      // charged to either backend.
      currentTime = createdTime + 5_000;
      await act(async () => {
        worker.emit({ type: "ready" });
        await createPromise;
      });

      expect(getValue().selectedExperiment).toMatchObject({
        startedAt: createdTime + 5_000,
        finishedAt: null,
      });

      currentTime = createdTime + 6_250;
      await act(async () => {
        worker.emit({
          type: "complete",
          progress: makeProgress({ allFinished: true, completedRuns: 1 }),
        });
      });

      expect(getValue().selectedExperiment).toMatchObject({
        status: "complete",
        startedAt: createdTime + 5_000,
        finishedAt: createdTime + 6_250,
      });

      // Completing disposes the handle, so a late worker message must not revive
      // the record or move its timestamps.
      currentTime = createdTime + 40_000;
      await act(async () => {
        worker.emit({ type: "progress", progress: makeProgress() });
      });

      expect(getValue().selectedExperiment).toMatchObject({
        status: "complete",
        startedAt: createdTime + 5_000,
        finishedAt: createdTime + 6_250,
      });
    } finally {
      nowSpy.mockRestore();
      renderResult.unmount();
    }
  });

  it("records when an errored experiment stopped", async () => {
    // Failure is a third path to a terminal status, separate from completion and
    // cancellation. It disposes the handle like the other two — which is what
    // releases the backend's resources — so late worker chatter reaches nobody
    // and cannot disturb the finish time.
    const createdTime = 1_700_000_000_000;
    let currentTime = createdTime;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      addNotification: () => "",
    });

    try {
      let createPromise!: Promise<string>;
      await act(async () => {
        createPromise = getValue().createExperiment({
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

      currentTime = createdTime + 1_000;
      await act(async () => {
        worker.emit({
          type: "error",
          message: "Worker failed",
          itemId: null,
        });
      });

      expect(getValue().selectedExperiment).toMatchObject({
        status: "error",
        finishedAt: createdTime + 1_000,
      });

      currentTime = createdTime + 9_000;
      await act(async () => {
        worker.emit({ type: "progress", progress: makeProgress() });
      });

      expect(getValue().selectedExperiment?.finishedAt).toBe(
        createdTime + 1_000,
      );
    } finally {
      nowSpy.mockRestore();
      renderResult.unmount();
    }
  });

  it("records when a cancelled experiment stopped", async () => {
    // Cancellation is a separate code path from completion, and an experiment
    // cancelled during setup never started at all.
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      await act(async () => {
        void getValue().createExperiment({
          name: "Cancelled during setup",
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

      const experimentId = getValue().selectedExperimentId!;
      await act(async () => {
        getValue().cancelExperiment(experimentId);
      });

      expect(getValue().selectedExperiment).toMatchObject({
        status: "cancelled",
        startedAt: null,
      });
      expect(getValue().selectedExperiment?.finishedAt).toBeGreaterThan(0);
    } finally {
      renderResult.unmount();
    }
  });

  it("records the CPU backend when no GPU backend is requested", async () => {
    const worker = new FakeMonteCarloWorker();
    const { getValue, renderResult } = renderExperimentsProvider(worker);

    try {
      await act(async () => {
        const createPromise = getValue().createExperiment({
          name: "CPU experiment",
          scenarioId: null,
          scenarioParameterValues: {},
          runCount: 1,
          seed: 42,
          dt: 1,
          maxTime: 10,
          metricSpecs: CONSTANT_METRIC_SPEC,
        });
        await flushWorkerSetup();
        // The handle only resolves once every shard reports ready.
        worker.emit({ type: "ready" });
        await createPromise;
      });

      expect(getValue().selectedExperiment).toMatchObject({
        computeBackend: "cpu",
        computeBackendFallbackReason: null,
        status: "running",
      });
      expect(worker.sent.map((message) => message.type)).toEqual([
        "init",
        "start",
      ]);
    } finally {
      renderResult.unmount();
    }
  });

  it("falls back to the CPU and records why when the GPU declines the net", async () => {
    // The GPU backend cannot serve expression metrics, so requesting it for this
    // experiment is declined. It must still run — silently switching backends is
    // wrong, and failing outright is worse.
    const worker = new FakeMonteCarloWorker();
    const notifications: AddNotificationInput[] = [];
    const { getValue, renderResult } = renderExperimentsProvider(worker, {
      addNotification: (notification) => {
        notifications.push(notification);
        return "";
      },
    });

    try {
      await withWebGpuAvailable(async () => {
        await act(async () => {
          const createPromise = getValue().createExperiment({
            name: "GPU experiment",
            scenarioId: null,
            scenarioParameterValues: {},
            runCount: 1,
            seed: 42,
            dt: 1,
            maxTime: 10,
            metricSpecs: CONSTANT_METRIC_SPEC,
            computeBackend: "webgpu",
          });
          // Probing the GPU adds await points before the CPU worker is created, so
          // `init` has not necessarily been sent after a single flush.
          await waitFor(() => {
            expect(worker.sent.map((message) => message.type)).toContain(
              "init",
            );
          });
          worker.emit({ type: "ready" });
          await createPromise;
        });

        const experiment = getValue().selectedExperiment;
        expect(experiment?.computeBackend).toBe("cpu");
        // The metric shape, not "no GPU here": with an adapter present the backend
        // is genuinely asked about the net, and this is the reason it gives.
        expect(experiment?.computeBackendFallbackReason).toMatch(
          /place token counts/i,
        );
        // It still ran, on the CPU worker.
        expect(worker.sent.map((message) => message.type)).toEqual([
          "init",
          "start",
        ]);
        // And the reason reached the user rather than being swallowed.
        expect(
          notifications.some((notification) =>
            /running on the CPU/i.test(notification.message),
          ),
        ).toBe(true);
      });
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
