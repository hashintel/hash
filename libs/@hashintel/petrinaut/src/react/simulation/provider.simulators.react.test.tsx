/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defineSimulator,
  DEFAULT_PETRINAUT_EXTENSIONS,
  type EventSimulation,
  type HirArtifacts,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
  type SDCPN,
  type SimulatorExperimentRequest,
  type SimulationRequest,
  type SimulatorOffer,
  type SimulatorRegistration,
} from "@hashintel/petrinaut-core";

import { PetrinautNavigationProvider } from "../navigation";
import { SimulatorsContext } from "../simulators/context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { SimulationContext, type SimulationContextValue } from "./context";
import { SimulationProvider, type SimulationCompiler } from "./provider";

afterEach(cleanup);

const sdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
  scenarios: [],
};

const sdcpnContextValue: SDCPNContextValue = {
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

const artifacts = { version: 4 } as unknown as HirArtifacts;

const makeHandle = () =>
  ({
    status: { get: () => "Ready", subscribe: () => () => {} },
    trace: {
      get: () => ({ eventCount: 1, coveredTime: 0, latest: null }),
      subscribe: () => () => {},
    },
    events: { subscribe: () => () => {} },
    placeIndexById: new Map(),
    run: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    demand: vi.fn(),
    dispose: vi.fn(),
    getEvent: () => null,
    findEventIndexAt: () => -1,
    findDiscreteEventAtOrBefore: () => null,
    findDiscreteEventAfter: () => null,
    getEventState: () => null,
    getStateAt: () => null,
  }) as unknown as EventSimulation;

/** An experiment that reports whatever status it was last put in. */
const makeExperiment = () => {
  let status: MonteCarloExperimentState = "Ready";
  const listeners = new Set<(status: MonteCarloExperimentState) => void>();
  const experiment = {
    status: {
      get: () => status,
      subscribe: (listener: (status: MonteCarloExperimentState) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    progress: { get: () => null, subscribe: () => () => {} },
    metrics: {
      get: () => ({ frames: [], latestByMetricId: {} }),
      subscribe: () => () => {},
    },
    events: { subscribe: () => () => {} },
    start: vi.fn(() => {
      status = "Running";
      for (const listener of listeners) {
        listener(status);
      }
    }),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  return experiment as typeof experiment & MonteCarloExperiment;
};

/** A simulator whose every assessment and start is recorded. */
const makeSimulator = ({
  id,
  needsHirTrees,
  start,
  startExperiment,
}: {
  id: string;
  needsHirTrees: boolean;
  start: SimulatorOffer["startRun"];
  startExperiment?: SimulatorOffer["startExperiment"];
}) => {
  const assessed = vi.fn<(request: SimulationRequest) => void>();
  const registration = defineSimulator(
    {
      id,
      label: id,
      description: "For tests.",
      parameters: {
        step: {
          type: "number",
          label: "Step",
          default: 0.5,
          min: 0,
          exclusiveMin: true,
        },
      },
      produces: { run: true, experiment: false },
    },
    {
      isAvailable: () => true,
      load: () =>
        Promise.resolve({
          needsHirTrees,
          assess: (request) => {
            assessed(request);
            return Promise.resolve({
              eligible: true,
              notes: [],
              ...(start ? { startRun: start } : {}),
              ...(startExperiment ? { startExperiment } : {}),
            });
          },
        }),
    },
  );
  return { assessed, registration: registration as SimulatorRegistration };
};

const renderProvider = (
  registrations: readonly SimulatorRegistration[],
  definition: SDCPN = sdcpn,
) => {
  const requestHirArtifacts = vi.fn<SimulationCompiler["requestHirArtifacts"]>(
    () => Promise.resolve({ artifacts, failures: [] }),
  );
  const compiler: SimulationCompiler = {
    requestHirArtifacts,
    requestScenarioHir: () => Promise.reject(new Error("No scenario here")),
  };
  const holder = { current: null as SimulationContextValue | null };
  const Capture = () => {
    holder.current = use(SimulationContext);
    return null;
  };
  render(
    <SDCPNContext.Provider
      value={{ ...sdcpnContextValue, petriNetDefinition: definition }}
    >
      <PetrinautNavigationProvider>
        <SimulatorsContext
          value={{
            registrations,
            defaultSelections: {
              quick: { simulatorId: registrations[0]!.id },
              stochastic: { simulatorId: registrations[0]!.id },
            },
          }}
        >
          <SimulationProvider
            compiler={compiler}
            initialConfiguration={{ maxTime: 12 }}
          >
            <Capture />
          </SimulationProvider>
        </SimulatorsContext>
      </PetrinautNavigationProvider>
    </SDCPNContext.Provider>,
  );
  return { getValue: () => holder.current!, requestHirArtifacts };
};

describe("SimulationProvider on a registered simulator", () => {
  it("starts the run on the selected simulator, with its parameters and the artifacts it needs", async () => {
    const handle = makeHandle();
    const plain = makeSimulator({
      id: "test.plain",
      needsHirTrees: false,
      start: () => Promise.resolve({ ok: true, handle }),
    });
    const { getValue, requestHirArtifacts } = renderProvider([
      plain.registration,
    ]);

    expect(getValue().simulatorSelection).toEqual({
      simulatorId: "test.plain",
      parameters: { step: 0.5 },
    });

    await act(() => getValue().initialize({ seed: 7 }));

    expect(plain.assessed).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 7,
        maxTime: 12,
        hirArtifacts: artifacts,
        simulatorParameters: { step: 0.5 },
      }),
    );
    // A simulator that does not read the HIR trees is not sent them.
    expect(requestHirArtifacts.mock.calls[0]![2]).toBeUndefined();
    expect(getValue().eventSimulation).toBe(handle);
  });

  it("asks for the HIR trees when the simulator reads them", async () => {
    const reader = makeSimulator({
      id: "test.reader",
      needsHirTrees: true,
      start: () => Promise.resolve({ ok: true, handle: makeHandle() }),
    });
    const { getValue, requestHirArtifacts } = renderProvider([
      reader.registration,
    ]);

    await act(() => getValue().initialize({ seed: 1 }));

    expect(requestHirArtifacts.mock.calls[0]![2]).toEqual({ includeHir: true });
  });

  it("discards the run when the simulator or a parameter changes, and keeps each simulator's values", async () => {
    const handle = makeHandle();
    const first = makeSimulator({
      id: "test.first",
      needsHirTrees: false,
      start: () => Promise.resolve({ ok: true, handle }),
    });
    const second = makeSimulator({
      id: "test.second",
      needsHirTrees: false,
      start: () => Promise.resolve({ ok: true, handle: makeHandle() }),
    });
    const { getValue } = renderProvider([
      first.registration,
      second.registration,
    ]);

    act(() => getValue().setSimulatorParameter("step", 0.25));
    await act(() => getValue().initialize({ seed: 1 }));
    expect(first.assessed).toHaveBeenCalledWith(
      expect.objectContaining({ simulatorParameters: { step: 0.25 } }),
    );
    expect(getValue().eventSimulation).toBe(handle);

    act(() => getValue().selectSimulator("test.second"));
    expect(handle.dispose).toHaveBeenCalled();
    expect(getValue().eventSimulation).toBeNull();
    expect(getValue().simulatorSelection).toEqual({
      simulatorId: "test.second",
      parameters: { step: 0.5 },
    });

    act(() => getValue().selectSimulator("test.first"));
    expect(getValue().simulatorSelection).toEqual({
      simulatorId: "test.first",
      parameters: { step: 0.25 },
    });
  });

  it("reports why a simulator refused to start, and starts nothing", async () => {
    const refusing = makeSimulator({
      id: "test.refusing",
      needsHirTrees: false,
      start: () =>
        Promise.resolve({
          ok: false,
          blockers: [
            {
              code: "run-failed-to-start",
              message: "Place Queue has no tokens to start from",
              origin: "model",
            },
          ],
        }),
    });
    const { getValue } = renderProvider([refusing.registration]);

    let failure: unknown = null;
    await act(async () => {
      await getValue()
        .initialize({ seed: 1 })
        .catch((caught: unknown) => {
          failure = caught;
        });
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Place Queue has no tokens to start from",
    );
    expect(getValue().error).toBe("Place Queue has no tokens to start from");
    expect(getValue().eventSimulation).toBeNull();
  });

  it("refuses a simulator that computes no single run", async () => {
    const batched = makeSimulator({
      id: "test.batched",
      needsHirTrees: false,
      start: undefined,
    });
    const { getValue } = renderProvider([batched.registration]);

    let failure: unknown = null;
    await act(async () => {
      await getValue()
        .initialize({ seed: 1 })
        .catch((caught: unknown) => {
          failure = caught;
        });
    });

    expect((failure as Error).message).toBe(
      "test.batched computes many runs at once, not a single run",
    );
  });
});

describe("SimulationProvider in Stochastic mode", () => {
  const withPlaces: SDCPN = {
    ...sdcpn,
    places: [
      {
        id: "queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
    ],
  };

  const stochastic = () => {
    const experiment = makeExperiment();
    const requested = vi.fn<(request: SimulatorExperimentRequest) => void>();
    const simulator = makeSimulator({
      id: "test.many",
      needsHirTrees: false,
      start: () => Promise.reject(new Error("Not a single run")),
      startExperiment: (request) => {
        requested(request);
        return Promise.resolve({ ok: true, handle: experiment });
      },
    });
    const rendered = renderProvider([simulator.registration], withPlaces);
    return { experiment, requested, simulator, ...rendered };
  };

  it("starts an experiment of the runs asked for, measuring every place's token count", async () => {
    const { experiment, requested, getValue } = stochastic();

    act(() => getValue().setMode("stochastic"));
    act(() => getValue().setRuns(250));
    await act(() => getValue().initialize({ seed: 3 }));

    expect(requested).toHaveBeenCalledWith({
      runCount: 250,
      metricSpecs: [
        expect.objectContaining({
          kind: "placeTokenCountMean",
          placeId: "queue",
          sampleRuns: "all",
          runOutput: { type: "distribution", binning: "exact" },
        }),
      ],
    });
    expect(getValue().stochasticRun).toMatchObject({
      experiment,
      runCount: 250,
      seed: 3,
      maxTime: 12,
      kept: false,
    });
    expect(getValue().eventSimulation).toBeNull();
    // Playback has the experiment's samples to move over.
    expect(getValue().playbackSource?.coverage.get()).toEqual({
      eventCount: 0,
      coveredTime: 0,
    });

    // It starts once: resuming playback finds it already going.
    act(() => getValue().run());
    act(() => getValue().run());
    expect(experiment.start).toHaveBeenCalledTimes(1);
    expect(getValue().state).toBe("Running");
  });

  it("gives a Stochastic simulation an end time when none was set", () => {
    const { getValue } = stochastic();
    act(() => getValue().setMaxTime(null));
    act(() => getValue().setMode("stochastic"));
    expect(getValue().maxTime).toBe(60);
  });

  it("ends the experiment on reset, unless something took it over", async () => {
    const first = stochastic();
    act(() => first.getValue().setMode("stochastic"));
    await act(() => first.getValue().initialize({ seed: 1 }));
    act(() => first.getValue().reset());
    expect(first.experiment.dispose).toHaveBeenCalledTimes(1);
    expect(first.getValue().stochasticRun).toBeNull();
    cleanup();

    const second = stochastic();
    act(() => second.getValue().setMode("stochastic"));
    await act(() => second.getValue().initialize({ seed: 1 }));
    act(() => second.getValue().keepStochasticRun());
    expect(second.getValue().stochasticRun?.kept).toBe(true);
    act(() => second.getValue().reset());
    expect(second.experiment.dispose).not.toHaveBeenCalled();
    expect(second.getValue().stochasticRun).toBeNull();
  });

  it("keeps a simulator and its parameters per mode", () => {
    const { getValue } = stochastic();
    act(() => getValue().setSimulatorParameter("step", 0.25));
    act(() => getValue().setMode("stochastic"));
    expect(getValue().simulatorSelection.parameters).toEqual({ step: 0.5 });
    act(() => getValue().setSimulatorParameter("step", 2));
    act(() => getValue().setMode("quick"));
    expect(getValue().simulatorSelection.parameters).toEqual({ step: 0.25 });
    act(() => getValue().setMode("stochastic"));
    expect(getValue().simulatorSelection.parameters).toEqual({ step: 2 });
  });

  it("refuses a simulator that computes no experiment", async () => {
    const single = makeSimulator({
      id: "test.single",
      needsHirTrees: false,
      start: () => Promise.resolve({ ok: true, handle: makeHandle() }),
    });
    const { getValue } = renderProvider([single.registration]);
    act(() => getValue().setMode("stochastic"));

    let failure: unknown = null;
    await act(async () => {
      await getValue()
        .initialize({ seed: 1 })
        .catch((caught: unknown) => {
          failure = caught;
        });
    });
    expect((failure as Error).message).toBe(
      "test.single computes one run at a time, not many",
    );
  });
});
