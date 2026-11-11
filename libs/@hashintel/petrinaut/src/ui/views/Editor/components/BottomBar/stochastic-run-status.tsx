import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { WEBGPU_FIXED_STEP_SIMULATOR_ID } from "@hashintel/petrinaut-core";

import { ExperimentsActionsContext } from "../../../../../react/experiments/context";
import { NotificationsContext } from "../../../../../react/notifications/context";
import {
  SimulationContext,
  type StochasticRun,
} from "../../../../../react/simulation/context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { useStore } from "../../../../../react/use-store";
import { ToolbarDivider } from "./toolbar-divider";

const progressStyle = css({
  flexShrink: "0",
  fontSize: "[11px]",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s95",
  whiteSpace: "nowrap",
});

/** The spacing of an experiment's samples, read off its first two. */
const samplePeriodOf = (run: StochasticRun): number => {
  const [firstSpec] = run.metricSpecs;
  const frames = firstSpec ? run.reader.metricFrames(firstSpec.id) : [];
  const first = frames[0];
  const second = frames[1];
  return first && second ? second.time - first.time : 0;
};

/**
 * How far a Stochastic simulation's runs have come, and the action that
 * lists it under Experiments so that it outlives a reset.
 */
export const StochasticRunStatus: React.FC<{ run: StochasticRun }> = ({
  run,
}) => {
  const progress = useStore(run.experiment.progress);
  const { adoptExperiment } = use(ExperimentsActionsContext);
  const { keepStochasticRun, selectedScenarioId } = use(SimulationContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const { addNotification } = use(NotificationsContext);

  const completedRuns = progress?.completedRuns ?? 0;
  const scenarioName =
    petriNetDefinition.scenarios?.find(
      (scenario) => scenario.id === selectedScenarioId,
    )?.name ?? null;

  const keep = () => {
    const name = `${scenarioName ?? "No scenario"}, ${run.runCount} runs`;
    adoptExperiment({
      name,
      handle: run.experiment,
      definition: petriNetDefinition,
      scenarioId: scenarioName === null ? null : selectedScenarioId,
      scenarioName,
      runCount: run.runCount,
      seed: run.seed,
      dt: samplePeriodOf(run),
      maxTime: run.maxTime,
      metricSpecs: run.metricSpecs,
      computeBackend:
        run.simulator.simulatorId === WEBGPU_FIXED_STEP_SIMULATOR_ID
          ? "webgpu"
          : "cpu",
    });
    keepStochasticRun();
    addNotification({
      message: `Kept as the experiment "${name}"`,
      tone: "success",
    });
  };

  return (
    <>
      <span
        className={progressStyle}
        aria-label={`${completedRuns} of ${run.runCount} runs complete`}
      >
        {completedRuns.toLocaleString()} of {run.runCount.toLocaleString()} runs
      </span>
      <Button
        size="xs"
        variant="ghost"
        onClick={keep}
        disabled={run.kept}
        tooltip={
          run.kept
            ? "Listed under Simulate › Experiments"
            : "List this simulation under Simulate › Experiments, where it outlives a reset"
        }
      >
        {run.kept ? "Kept" : "Keep as experiment"}
      </Button>
      <ToolbarDivider />
    </>
  );
};
