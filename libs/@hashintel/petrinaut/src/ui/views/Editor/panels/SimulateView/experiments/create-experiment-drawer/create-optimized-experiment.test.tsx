/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExperimentsActionsContext } from "../../../../../../../react/experiments/context";
import { OptimizationsContext } from "../../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import {
  makeExperiment,
  sirSdcpnContextValue,
  sweepFixtureScenario,
} from "../experiments-story-fixtures";
import { useCreateOptimizedExperiment } from "./create-optimized-experiment";

import type {
  CreateExperimentInput,
  ExperimentRecord,
  ExperimentsActionsValue,
} from "../../../../../../../react/experiments/context";
import type { OptimizationsContextValue } from "../../../../../../../react/optimizations/context";
import type { ReactNode } from "react";

/** A sweep over the fixture scenario's two parameters with one metric to read. */
const experiment: ExperimentRecord = makeExperiment(0, {
  id: "experiment-created",
  scenario: sweepFixtureScenario,
  parameterAxes: [
    {
      identifier: "transmission_rate",
      min: 0.1,
      max: 0.5,
      stepCount: 50,
      integer: false,
    },
    {
      identifier: "recovery_days",
      min: 3,
      max: 14,
      stepCount: 11,
      integer: true,
    },
  ],
  metricSpecs: [
    {
      kind: "expression",
      id: "peak",
      label: "Infected peak",
      code: "return state.places.Infected.count;",
      sampleRuns: "all",
      runOutput: { type: "distribution" },
    },
  ],
});

const input: CreateExperimentInput = {
  name: "Peak search",
  scenarioId: sweepFixtureScenario.id,
  scenarioParameterValues: {},
  adHocScenario: null,
  adHocSweeps: false,
  runCount: 1_000,
  seed: 1,
  dt: 1,
  maxTime: 180,
  metricSpecs: experiment.metricSpecs,
  computeBackend: "cpu",
  constraints: [],
};

const objective = {
  metricId: "peak",
  direction: "minimize" as const,
  steps: 12,
};

/** Fakes of both contexts whose calls land, in order, on one list. */
const makeHarness = (
  createOptimization: OptimizationsContextValue["createOptimization"] = () =>
    Promise.resolve("study-1"),
) => {
  const calls: string[] = [];
  const actions: ExperimentsActionsValue = {
    createExperiment: vi.fn(() => {
      calls.push("createExperiment");
      return Promise.resolve(experiment);
    }),
    removeExperiment: vi.fn(() => {
      calls.push("removeExperiment");
    }),
    setSelectedExperimentId: vi.fn(() => {
      calls.push("setSelectedExperimentId");
    }),
    cancelExperiment: () => {},
    setSweepSelection: () => {},
    navigateSweep: () => Promise.resolve(null),
  };
  const optimizations: OptimizationsContextValue = {
    optimizations: [],
    createOptimization: vi.fn<OptimizationsContextValue["createOptimization"]>(
      (manifest, options) => {
        calls.push("createOptimization");
        return createOptimization(manifest, options);
      },
    ),
    cancelOptimization: () => {},
    removeOptimization: () => {},
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext value={sirSdcpnContextValue}>
      <ExperimentsActionsContext value={actions}>
        <OptimizationsContext value={optimizations}>
          {children}
        </OptimizationsContext>
      </ExperimentsActionsContext>
    </SDCPNContext>
  );
  const { result } = renderHook(() => useCreateOptimizedExperiment(), {
    wrapper,
  });
  return { calls, actions, optimizations, create: result.current };
};

describe("useCreateOptimizedExperiment", () => {
  it("creates and selects a sweep without an objective, starting no study", async () => {
    const { calls, actions, optimizations, create } = makeHarness();

    await expect(create(input, null)).resolves.toBe(experiment);

    expect(actions.createExperiment).toHaveBeenCalledWith(input);
    expect(actions.setSelectedExperimentId).toHaveBeenCalledWith(
      "experiment-created",
    );
    expect(optimizations.createOptimization).not.toHaveBeenCalled();
    expect(calls).toEqual(["createExperiment", "setSelectedExperimentId"]);
  });

  it("creates, starts the study from the record, then selects, in that order", async () => {
    const { calls, optimizations, create } = makeHarness();

    await create(input, objective);

    expect(calls).toEqual([
      "createExperiment",
      "createOptimization",
      "setSelectedExperimentId",
    ]);
    const [manifest, options] = vi.mocked(optimizations.createOptimization).mock
      .calls[0]!;
    expect(options).toEqual({
      sweep: {
        experimentId: "experiment-created",
        axes: experiment.parameterAxes,
        metricId: "peak",
      },
    });
    expect(manifest).toMatchObject({
      kind: "petrinaut-optimization",
      name: "SIR Monte Carlo 0 · Minimize Infected peak",
      scenario: {
        id: sweepFixtureScenario.id,
        parameterBindings: {
          transmission_rate: { kind: "optimize" },
          recovery_days: { kind: "optimize", domain: { kind: "integer" } },
        },
      },
      objective: { metricId: "peak", direction: "minimize" },
      execution: { seedsPerTrial: 8 },
      study: { trials: 12 },
    });
  });

  it("removes the experiment, selects nothing and rethrows when the study cannot start", async () => {
    const { calls, actions, create } = makeHarness(() =>
      Promise.reject(new Error("A sweep can only be optimized in the browser")),
    );

    await expect(create(input, objective)).rejects.toThrow(
      "A sweep can only be optimized in the browser",
    );

    expect(actions.removeExperiment).toHaveBeenCalledWith("experiment-created");
    expect(actions.setSelectedExperimentId).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "createExperiment",
      "createOptimization",
      "removeExperiment",
    ]);
  });

  it("removes the experiment when the manifest itself is refused, before any study exists", async () => {
    const { actions, optimizations, create } = makeHarness();

    await expect(
      create(input, { ...objective, metricId: "missing" }),
    ).rejects.toThrow("Pick a metric to optimize");

    expect(optimizations.createOptimization).not.toHaveBeenCalled();
    expect(actions.removeExperiment).toHaveBeenCalledWith("experiment-created");
    expect(actions.setSelectedExperimentId).not.toHaveBeenCalled();
  });
});
