import { use } from "react";

import {
  type RunClock,
  WEBGPU_FIXED_STEP_SIMULATOR_ID,
} from "@hashintel/petrinaut-core";

import {
  findSimulator,
  SimulatorsContext,
} from "../../../../../../../react/simulators/context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useExecutableDefinition } from "../../../../../../../react/state/use-executable-definition";
import { useGpuAvailability } from "../../shared/use-gpu-availability";
import {
  type ExperimentSimulatorDraft,
  resolveExperimentSimulator,
  simulatorRefusalsFor,
} from "./experiment-simulator-draft";

import type { ExperimentMetricSpecInput } from "../../../../../../../react/experiments/context";

/**
 * The simulator the form's experiment would run on, and why each of the
 * others cannot run it: the draft resolved against the registered simulators
 * and the GPU's verdict on this net with these metrics.
 *
 * Derived rather than stored, so a net edited into ineligibility after a
 * simulator was picked neither shows it as chosen nor submits it. The picker
 * and the submit read the same result, so they cannot disagree.
 */
export const useExperimentSimulator = ({
  draft,
  clock,
  metricSpecs,
}: {
  draft: ExperimentSimulatorDraft;
  clock: RunClock;
  /** The metrics the GPU would have to compute; null while they are incomplete. */
  metricSpecs: readonly ExperimentMetricSpecInput[] | null;
}) => {
  const { extensions } = use(SDCPNContext);
  const executableDefinition = useExecutableDefinition();
  const simulators = use(SimulatorsContext);
  const gpu = useGpuAvailability({
    enabled:
      findSimulator(
        simulators.registrations,
        WEBGPU_FIXED_STEP_SIMULATOR_ID,
      )?.isAvailable() === true,
    sdcpn: executableDefinition,
    extensions,
    metricSpecs,
  });
  const refusals = simulatorRefusalsFor(simulators.registrations, gpu);

  return {
    refusals,
    resolved: resolveExperimentSimulator(draft, simulators, refusals, clock),
  };
};
