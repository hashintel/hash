/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";
import {
  type PetrinautConnectedOptimization,
  resolveTrialScenarioParameterValues,
} from "@hashintel/petrinaut-core/optimization";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  type SweepVisitedCell,
} from "../experiments/context";
import {
  PetrinautNavigationProvider,
  usePetrinautNavigation,
} from "../navigation";
import { PetrinautOptimizationContext } from "../optimization-context";
import { UserSettingsContext } from "../state/user-settings-context";
import {
  type OptimizationBest,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import { OptimizationsProvider } from "./provider";
import { sweepPointFor } from "./provider/create-sweep-trial-evaluator";
import {
  sirConstrainedOptimizationInput,
  sirOptimizationInput,
  sirOptimizationMetric,
} from "./sir-optimization-input.fixtures";

import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../experiments/parameter-grid";
import type { PetrinautNavigationState } from "../navigation";
import type { PropsWithChildren } from "react";

const metricId = sirOptimizationMetric.id;

/** The SIR study with the sweep's runs per step. */
const input: PetrinautOptimizationInput = {
  ...sirOptimizationInput,
  execution: { ...sirOptimizationInput.execution, seedsPerTrial: 8 },
};

/** The swept parameter of the SIR sweep a study drives, as the experiment quantizes it. */
const SWEEP_AXES: readonly ExperimentParameterAxis[] = [
  {
    identifier: "infected_ratio",
    min: 0.001,
    max: 0.2,
    stepCount: 50,
    integer: false,
  },
];

const sweep = { experimentId: "experiment-sweep", axes: SWEEP_AXES, metricId };

/** The sweep point a suggested ratio lands on. */
const sweepPointOf = (infectedRatio: number): SweepSelection => {
  const point = sweepPointFor(SWEEP_AXES, { infected_ratio: infectedRatio });
  if (point === null) {
    throw new Error("The ratio misses the sweep's axis");
  }
  return point;
};

/** The sweep's answer at a point: the objective grows with the position, so lower ratios win a minimization. */
const sweepCellAt = (point: SweepSelection): SweepVisitedCell => {
  const position = point.infected_ratio?.from ?? 0;
  return {
    position: { infected_ratio: position },
    runsCompleted: 8,
    means: { [metricId]: position / 100 },
    sampleCounts: { [metricId]: 8 },
  };
};

/** A sweep that answers every navigation at once with the cell at the point. */
const createNavigateSweep = () =>
  vi.fn((_experimentId: string, selection: SweepSelection) =>
    Promise.resolve(sweepCellAt(selection)),
  );

const CaptureContext = ({
  onValue,
}: {
  onValue: (value: OptimizationsContextValue) => void;
}) => {
  onValue(use(OptimizationsContext));
  return null;
};

const CaptureNavigation = ({
  onValue,
}: {
  onValue: (value: Readonly<PetrinautNavigationState>) => void;
}) => {
  onValue(usePetrinautNavigation().state);
  return null;
};

/** Overrides the In-browser optimization setting below the default context. */
const InBrowserOptimizationSetting = ({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...value, enableInBrowserOptimization: enabled }}
    >
      {children}
    </UserSettingsContext>
  );
};

/** Routes the provider's sweep navigations to a fake. */
const NavigateSweepOverride = ({
  navigateSweep,
  children,
}: PropsWithChildren<{
  navigateSweep: ExperimentsActionsValue["navigateSweep"];
}>) => {
  const value = use(ExperimentsActionsContext);
  return (
    <ExperimentsActionsContext value={{ ...value, navigateSweep }}>
      {children}
    </ExperimentsActionsContext>
  );
};

/** The connected capability's members a fake never exercises. */
const inertCapabilityMembers = {
  extendOptimizationRun: () => Promise.resolve(),
  releaseOptimizationRun: () => Promise.resolve(),
  dispose: () => {},
};

/**
 * A connected source whose runs stay quiet until aborted, counting connections
 * and disposals so tests can observe what the setting gates.
 */
const createQuietConnectedSource = () => {
  const calls = { connect: 0, dispose: 0 };
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: () => {
      calls.connect += 1;
      return {
        ...inertCapabilityMembers,
        createOptimizationRun: () =>
          Promise.resolve({ runId: "run-quiet-connected" }),
        // eslint-disable-next-line require-yield -- the run stays quiet until aborted
        async *attachOptimizationRun(_runId, options) {
          await new Promise<void>((resolve) => {
            options?.signal?.addEventListener("abort", resolve, {
              once: true,
            });
          });
        },
        cancelOptimizationRun: () => Promise.resolve(),
        dispose: () => {
          calls.dispose += 1;
        },
      };
    },
  };
  return { source, calls };
};

/**
 * A connected source whose run replays the given events, evaluating nothing:
 * the shape of a study whose steps the test scripts by hand.
 */
const createScriptedSource = (
  events: readonly PetrinautOptimizationEvent[],
) => {
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: () => ({
      ...inertCapabilityMembers,
      createOptimizationRun: () => Promise.resolve({ runId: "run-scripted" }),
      async *attachOptimizationRun() {
        yield* events;
      },
      cancelOptimizationRun: () => Promise.resolve(),
    }),
  };
  return source;
};

/**
 * A connected source whose study evaluates one trial per value through the
 * channel, in order, then completes — the shape of the in-browser optimizer.
 * A cancel stops the asking and ends the segment cancelled instead. The
 * complete event carries the best trial when `bestOnComplete` asks for it,
 * as the in-browser worker's does.
 */
const createEvaluatingSource = (
  infectedRatios: readonly number[],
  {
    manifest = input,
    bestOnComplete = false,
  }: { manifest?: PetrinautOptimizationInput; bestOnComplete?: boolean } = {},
) => {
  const calls = {
    connect: 0,
    dispose: 0,
    cancel: 0,
    release: [] as string[],
  };
  let cancelled = false;
  // Read through a call so the flag is re-checked after each await.
  const isCancelled = () => cancelled;
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: (channel) => {
      calls.connect += 1;
      return {
        ...inertCapabilityMembers,
        createOptimizationRun: () =>
          Promise.resolve({ runId: "run-connected" }),
        async *attachOptimizationRun(runId, options) {
          let seq = 0;
          let best: OptimizationBest | null = null;
          for (const [trial, infectedRatio] of infectedRatios.entries()) {
            const suggestedValues = { infected_ratio: infectedRatio };
            const outcome = await channel.evaluateTrial({
              runId,
              trial,
              manifest,
              suggestedValues,
              scenarioParameterValues: resolveTrialScenarioParameterValues(
                manifest,
                suggestedValues,
              ),
              seeds: [1, 2, 3],
              signal: options?.signal ?? new AbortController().signal,
            });
            if (isCancelled()) {
              break;
            }
            seq += 1;
            if (
              outcome.kind === "objective" &&
              (!best || outcome.objective < best.objective)
            ) {
              best = {
                trial,
                parameters: suggestedValues,
                objective: outcome.objective,
              };
            }
            // The in-browser worker copies what the channel reported onto
            // the trial event; so does this fake.
            yield {
              type: "trial",
              trial,
              parameters: suggestedValues,
              objective:
                outcome.kind === "objective" ? outcome.objective : null,
              state: outcome.kind === "objective" ? "complete" : "pruned",
              best: null,
              ...(outcome.constraints
                ? { constraints: outcome.constraints }
                : {}),
              seq,
            };
          }
          seq += 1;
          if (isCancelled()) {
            yield {
              type: "error",
              code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
              message: "optimization cancelled",
              retryable: false,
              resumable: false,
              seq,
            };
            return;
          }
          yield {
            type: "complete",
            requestedTrials: infectedRatios.length,
            completedTrials: infectedRatios.length,
            prunedTrials: 0,
            failedTrials: 0,
            best: bestOnComplete ? best : null,
            resumable: true,
            seq,
          };
        },
        cancelOptimizationRun: () => {
          calls.cancel += 1;
          cancelled = true;
          return Promise.resolve();
        },
        releaseOptimizationRun: (runId) => {
          calls.release.push(runId);
          return Promise.resolve();
        },
        dispose: () => {
          calls.dispose += 1;
        },
      };
    },
  };
  return { source, calls };
};

const renderProvider = ({
  source,
  navigateSweep = createNavigateSweep(),
  enabled = true,
}: {
  source: PetrinautConnectedOptimization | PetrinautOptimization;
  navigateSweep?: ExperimentsActionsValue["navigateSweep"];
  enabled?: boolean;
}) => {
  let latest: OptimizationsContextValue | null = null;
  let navigationState: Readonly<PetrinautNavigationState> | null = null;
  const tree = (isEnabled: boolean) => (
    <InBrowserOptimizationSetting enabled={isEnabled}>
      <PetrinautOptimizationContext value={source}>
        <PetrinautNavigationProvider>
          <CaptureNavigation
            onValue={(value) => {
              navigationState = value;
            }}
          />
          <NavigateSweepOverride navigateSweep={navigateSweep}>
            <OptimizationsProvider>
              <CaptureContext
                onValue={(value) => {
                  latest = value;
                }}
              />
            </OptimizationsProvider>
          </NavigateSweepOverride>
        </PetrinautNavigationProvider>
      </PetrinautOptimizationContext>
    </InBrowserOptimizationSetting>
  );
  const { rerender, unmount } = render(tree(enabled));
  return {
    getValue: () => {
      if (!latest) {
        throw new Error("Optimization context was not captured");
      }
      return latest;
    },
    getNavigation: () => {
      if (!navigationState) {
        throw new Error("Navigation state was not captured");
      }
      return navigationState;
    },
    setEnabled: (isEnabled: boolean) => rerender(tree(isEnabled)),
    unmount,
  };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OptimizationsProvider and its source", () => {
  it("treats a connected source as absent while In-browser optimization is off", async () => {
    const { source, calls } = createQuietConnectedSource();
    const { getValue } = renderProvider({ source, enabled: false });

    await expect(
      getValue().createOptimization(input, { sweep }),
    ).rejects.toThrow("Optimization is unavailable");
    expect(calls.connect).toBe(0);
    expect(getValue().optimizations).toHaveLength(0);
  });

  it("refuses a remote source: a sweep can only be optimized in the browser", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-remote" }),
      async *attachOptimizationRun() {
        yield { type: "started", requestedTrials: 2, seq: 1 };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const { getValue } = renderProvider({ source: capability, enabled: false });

    await expect(
      getValue().createOptimization(input, { sweep }),
    ).rejects.toThrow("A sweep can only be optimized in the browser");
    expect(getValue().optimizations).toHaveLength(0);
  });

  it("connects and disposes a connected source as In-browser optimization is toggled, stopping the studies made through it", async () => {
    const { source, calls } = createQuietConnectedSource();
    const { getValue, setEnabled } = renderProvider({ source });

    await act(async () => {
      await getValue().createOptimization(input, { sweep });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("running"),
    );
    expect(calls).toEqual({ connect: 1, dispose: 0 });

    setEnabled(false);
    expect(calls).toEqual({ connect: 1, dispose: 1 });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("cancelled"),
    );
    await expect(
      getValue().createOptimization(input, { sweep }),
    ).rejects.toThrow("Optimization is unavailable");

    setEnabled(true);
    await act(async () => {
      await getValue().createOptimization(input, { sweep });
    });
    expect(calls).toEqual({ connect: 2, dispose: 1 });
  });

  it("keeps the latest importance estimate a trial or the complete event carried", async () => {
    const first = { values: { infected_ratio: 1 }, completedTrials: 50 };
    const last = { values: { infected_ratio: 1 }, completedTrials: 60 };
    const trial = {
      type: "trial",
      trial: 0,
      parameters: { infected_ratio: 0.1 },
      objective: 1,
      state: "complete",
      best: null,
    } as const;
    const { getValue } = renderProvider({
      source: createScriptedSource([
        { ...trial, seq: 1 },
        { ...trial, trial: 1, importances: first, seq: 2 },
        { ...trial, trial: 2, seq: 3 },
        {
          type: "complete",
          requestedTrials: 3,
          completedTrials: 3,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          importances: last,
          seq: 4,
        },
      ]),
    });

    await act(async () => {
      await getValue().createOptimization(input, { sweep });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );

    expect(getValue().optimizations[0]?.importance).toEqual(last);
    expect(getValue().optimizations[0]?.trials[1]?.importances).toEqual(first);
    expect(getValue().optimizations[0]?.trials[2]).not.toHaveProperty(
      "importances",
    );
  });

  it("fails the study with the attachment's message when the run's stream throws", async () => {
    const source: PetrinautConnectedOptimization = {
      kind: "connected",
      connect: () => ({
        ...inertCapabilityMembers,
        createOptimizationRun: () => Promise.resolve({ runId: "run-broken" }),
        // eslint-disable-next-line require-yield -- the stream dies before its first event
        async *attachOptimizationRun() {
          await Promise.resolve();
          throw new Error("The optimizer lost its worker");
        },
        cancelOptimizationRun: () => Promise.resolve(),
      }),
    };
    const { getValue } = renderProvider({ source });

    await act(async () => {
      await getValue().createOptimization(input, { sweep });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("error"),
    );
    expect(getValue().optimizations[0]?.error).toBe(
      "The optimizer lost its worker",
    );
  });
});

describe("OptimizationsProvider driving a sweep", () => {
  it("evaluates every step through the sweep with the manifest's runs per step, parks on the best once done and releases the study on removal", async () => {
    const { source, calls } = createEvaluatingSource([0.05, 0.02], {
      bestOnComplete: true,
    });
    const navigateSweep = createNavigateSweep();
    const { getValue, getNavigation, unmount } = renderProvider({
      source,
      navigateSweep,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input, { sweep });
    });
    // The study stays in the experiment's drawer: nothing navigates to it.
    expect(getNavigation().simulateResource).toBeNull();
    expect(getValue().optimizations[0]).toMatchObject({
      origin: { kind: "sweep", experimentId: "experiment-sweep" },
    });

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    // Every step went through the sweep at the manifest's runs per step.
    expect(navigateSweep.mock.calls.slice(0, 2)).toEqual([
      ["experiment-sweep", sweepPointOf(0.05), { runCap: 8 }],
      ["experiment-sweep", sweepPointOf(0.02), { runCap: 8 }],
    ]);
    expect(getValue().optimizations[0]).toMatchObject({
      completedTrials: 2,
      best: { trial: 1 },
    });
    // Done: the sweep parks, uncapped, on the best point.
    expect(navigateSweep).toHaveBeenCalledTimes(3);
    expect(navigateSweep).toHaveBeenLastCalledWith(
      "experiment-sweep",
      sweepPointOf(0.02),
      undefined,
    );

    act(() => getValue().removeOptimization(optimizationId));
    expect(calls.release).toEqual(["run-connected"]);
    expect(getValue().optimizations).toHaveLength(0);
    expect(calls.dispose).toBe(0);
    unmount();
    expect(calls.dispose).toBe(1);
  });

  it("stops a sweep study once: the step in flight is let go, the sweep parks on it, and the worker's own cancel adds nothing", async () => {
    const { source, calls } = createEvaluatingSource([0.05, 0.02]);
    let releaseStep: (cell: SweepVisitedCell | null) => void = () => {};
    const navigateSweep = vi.fn(
      (
        _experimentId: string,
        _selection: SweepSelection,
        options?: { runCap?: number },
      ) =>
        options
          ? new Promise<SweepVisitedCell | null>((resolve) => {
              releaseStep = resolve;
            })
          : Promise.resolve(null),
    );
    const { getValue } = renderProvider({ source, navigateSweep });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input, { sweep });
    });
    await waitFor(() => expect(navigateSweep).toHaveBeenCalledTimes(1));

    act(() => getValue().cancelOptimization(optimizationId));
    expect(calls.cancel).toBe(1);
    expect(getValue().optimizations[0]?.status).toBe("cancelled");
    // The sweep parks, uncapped, on the point the stopped step was trying.
    expect(navigateSweep).toHaveBeenCalledTimes(2);
    expect(navigateSweep).toHaveBeenLastCalledWith(
      "experiment-sweep",
      sweepPointOf(0.05),
      undefined,
    );

    // The step in flight resolves; the worker acknowledges the stop.
    releaseStep(null);
    await waitFor(() => expect(getValue().optimizations[0]?.lastSeq).toBe(1));
    expect(getValue().optimizations[0]?.status).toBe("cancelled");
    expect(navigateSweep).toHaveBeenCalledTimes(2);
  });

  it("cancels a study stopped before its run has an id, once creation resolves", async () => {
    const calls = { cancel: [] as string[], attach: 0 };
    let resolveCreation: (value: { runId: string }) => void = () => {};
    const source: PetrinautConnectedOptimization = {
      kind: "connected",
      connect: () => ({
        ...inertCapabilityMembers,
        createOptimizationRun: () =>
          new Promise<{ runId: string }>((resolve) => {
            resolveCreation = resolve;
          }),
        async *attachOptimizationRun() {
          calls.attach += 1;
          yield* [];
        },
        cancelOptimizationRun: (runId) => {
          calls.cancel.push(runId);
          return Promise.resolve();
        },
      }),
    };
    const { getValue } = renderProvider({ source });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input, { sweep });
    });
    act(() => getValue().cancelOptimization(optimizationId));
    expect(getValue().optimizations[0]).toMatchObject({ status: "cancelled" });

    // The run id arrives after the stop: the run is cancelled where it was
    // made and nothing attaches.
    await act(async () => {
      resolveCreation({ runId: "run-late" });
      await Promise.resolve();
    });
    expect(calls.cancel).toEqual(["run-late"]);
    expect(calls.attach).toBe(0);
    expect(getValue().optimizations[0]).toMatchObject({ status: "cancelled" });
  });

  it("parks the sweep, uncapped, on the point it was trying when In-browser optimization is switched off mid-study", async () => {
    const { source } = createEvaluatingSource([0.05, 0.02]);
    let releaseStep: (cell: SweepVisitedCell | null) => void = () => {};
    const navigateSweep = vi.fn(
      (
        _experimentId: string,
        _selection: SweepSelection,
        options?: { runCap?: number },
      ) =>
        options
          ? new Promise<SweepVisitedCell | null>((resolve) => {
              releaseStep = resolve;
            })
          : Promise.resolve(null),
    );
    const { getValue, setEnabled } = renderProvider({ source, navigateSweep });

    await act(async () => {
      await getValue().createOptimization(input, { sweep });
    });
    await waitFor(() => expect(navigateSweep).toHaveBeenCalledTimes(1));

    act(() => setEnabled(false));
    // The source is gone before the aborted step reports, so the study's own
    // cancel finds no evaluator: the sweep still parks, uncapped, on the point
    // the step was trying.
    expect(navigateSweep).toHaveBeenCalledTimes(2);
    expect(navigateSweep).toHaveBeenLastCalledWith(
      "experiment-sweep",
      sweepPointOf(0.05),
      undefined,
    );

    releaseStep(null);
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("cancelled"),
    );
    expect(navigateSweep).toHaveBeenCalledTimes(2);
  });

  it("carries a constrained sweep's verdicts onto the trial events: an infeasible draw pruned without moving the sweep, a feasible one with its runs passed", async () => {
    const constrainedSweepInput: PetrinautOptimizationInput = {
      ...sirConstrainedOptimizationInput,
      execution: {
        ...sirConstrainedOptimizationInput.execution,
        seedsPerTrial: 8,
      },
    };
    // 0.15 breaks `infected_ratio <= 0.1`; 0.05 holds it.
    const { source } = createEvaluatingSource([0.15, 0.05], {
      manifest: constrainedSweepInput,
    });
    const navigateSweep = vi.fn(
      (
        _experimentId: string,
        selection: SweepSelection,
        _options?: { runCap?: number },
      ) =>
        Promise.resolve({
          ...sweepCellAt(selection),
          means: {
            ...sweepCellAt(selection).means,
            "constraint:infected-cap": 0.75,
          },
          sampleCounts: {
            ...sweepCellAt(selection).sampleCounts,
            "constraint:infected-cap": 8,
          },
        }),
    );
    const { getValue, unmount } = renderProvider({ source, navigateSweep });

    await act(async () => {
      await getValue().createOptimization(constrainedSweepInput, { sweep });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );

    const study = getValue().optimizations[0]!;
    expect(study).toMatchObject({ completedTrials: 1, prunedTrials: 1 });
    expect(study.trials).toEqual([
      expect.objectContaining({
        trial: 0,
        state: "pruned",
        constraints: {
          parameters: [
            { constraintId: "ratio-cap", margin: expect.any(Number) as number },
          ],
          state: [],
          infeasible: "ratio-cap",
        },
      }),
      expect.objectContaining({
        trial: 1,
        state: "complete",
        constraints: {
          parameters: [
            { constraintId: "ratio-cap", margin: expect.any(Number) as number },
          ],
          state: [
            { constraintId: "infected-cap", runsPassed: 6, runsTotal: 8 },
          ],
        },
      }),
    ]);
    // Only the feasible draw moved the sweep (plus the park once done).
    expect(
      navigateSweep.mock.calls.map(([, point, options]) => [point, options]),
    ).toEqual([
      [sweepPointOf(0.05), { runCap: 8 }],
      [sweepPointOf(0.05), undefined],
    ]);
    unmount();
  });
});
