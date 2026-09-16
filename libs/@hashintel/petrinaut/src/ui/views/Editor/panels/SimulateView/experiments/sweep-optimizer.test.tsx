/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../../../../../react/state/user-settings-context";
import {
  makeParameterSweepExperiment,
  sirSdcpnContextValue,
  sweepFixtureScenario,
} from "./experiments-story-fixtures";
import { fakeStudyInput, makeOptimizationRecord } from "./study-fixtures";
import { useSweepOptimizer } from "./sweep-optimizer";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { PetrinautOptimizationSource } from "@hashintel/petrinaut-core/optimization";
import type { ReactNode } from "react";

afterEach(cleanup);

const experiment = {
  ...makeParameterSweepExperiment(),
  scenario: sweepFixtureScenario,
};
const connectedSource: PetrinautOptimizationSource = {
  kind: "connected",
  connect: () => {
    throw new Error("The hook does not connect the optimizer");
  },
};
const objective = {
  metricId: "infected",
  direction: "minimize" as const,
  steps: 12,
};
const completedStudy: OptimizationRecord = {
  ...makeOptimizationRecord({
    input: fakeStudyInput,
    status: "complete",
    trials: [],
    best: null,
  }),
  origin: { kind: "sweep", experimentId: experiment.id },
};

const renderOptimizer = ({
  record = experiment,
  study = null,
  source = connectedSource,
  enabled = true,
}: {
  record?: ExperimentRecord;
  study?: OptimizationRecord | null;
  source?: PetrinautOptimizationSource | null;
  enabled?: boolean;
} = {}) => {
  const createOptimization = vi.fn(() => Promise.resolve("new-study"));
  const removeOptimization = vi.fn();
  const cancelOptimization = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext value={sirSdcpnContextValue}>
      <UserSettingsContext
        value={{
          ...defaultUserSettingsContextValue,
          enableInBrowserOptimization: enabled,
        }}
      >
        <PetrinautOptimizationContext value={source}>
          <OptimizationsContext
            value={{
              optimizations: study ? [study] : [],
              createOptimization,
              removeOptimization,
              cancelOptimization,
            }}
          >
            {children}
          </OptimizationsContext>
        </PetrinautOptimizationContext>
      </UserSettingsContext>
    </SDCPNContext>
  );
  return {
    ...renderHook(() => useSweepOptimizer(record), { wrapper }),
    createOptimization,
    removeOptimization,
    cancelOptimization,
  };
};

describe("useSweepOptimizer", () => {
  it.each([
    { source: null },
    { enabled: false },
    { record: { ...experiment, requestActive: true } },
    { record: { ...experiment, status: "cancelled" as const } },
    { record: { ...experiment, sweep: null } },
    { record: { ...experiment, scenario: null } },
    { record: { ...experiment, parameterAxes: [] } },
    { record: { ...experiment, metricSpecs: [] } },
    { study: { ...completedStudy, status: "running" as const } },
  ])(
    "does not offer a start for an unavailable or locked sweep: %j",
    (options) => {
      expect(renderOptimizer(options).result.current.start).toBeNull();
    },
  );

  it("starts a manual sweep and replaces a settled study only after success", async () => {
    const { result, createOptimization, removeOptimization } = renderOptimizer({
      study: completedStudy,
    });
    expect(result.current.start).not.toBeNull();
    await act(() => result.current.start!(objective));
    expect(createOptimization).toHaveBeenCalledOnce();
    expect(removeOptimization).toHaveBeenCalledWith(completedStudy.id);
    expect(createOptimization.mock.invocationCallOrder[0]).toBeLessThan(
      removeOptimization.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the previous study when a new start is rejected", async () => {
    const { result, createOptimization, removeOptimization } = renderOptimizer({
      study: completedStudy,
    });
    createOptimization.mockRejectedValueOnce(new Error("Disconnected"));
    await expect(result.current.start!(objective)).rejects.toThrow(
      "Disconnected",
    );
    expect(removeOptimization).not.toHaveBeenCalled();
  });

  it("offers Stop for the active study", () => {
    const { result, cancelOptimization } = renderOptimizer({
      study: { ...completedStudy, status: "running" },
    });
    expect(result.current.driving).not.toBeNull();
    result.current.stop();
    expect(cancelOptimization).toHaveBeenCalledWith(completedStudy.id);
  });
});
