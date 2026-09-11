/**
 * The Create Experiment drawer's one submit gesture, in one order: create the
 * experiment, start the study that drives it when an objective is given,
 * then select it — so the results drawer's first frame carries the study.
 * Shared with the story harness so the order lives in one place.
 */
import { use } from "react";

import {
  type CreateExperimentInput,
  type ExperimentRecord,
  ExperimentsActionsContext,
} from "../../../../../../../react/experiments/context";
import { type SweepObjective, useStartSweepStudy } from "../sweep-optimizer";

/**
 * Creates, starts and selects. A study that cannot start removes the
 * experiment again and rethrows with the reason; the caller keeps its form
 * and nothing is selected. Without an objective the experiment is created
 * and selected as a plain run or an idle sweep.
 */
export const useCreateOptimizedExperiment = (): ((
  input: CreateExperimentInput,
  objective: SweepObjective | null,
) => Promise<ExperimentRecord>) => {
  const { createExperiment, removeExperiment, setSelectedExperimentId } = use(
    ExperimentsActionsContext,
  );
  const startStudy = useStartSweepStudy();

  return async (input, objective) => {
    const experiment = await createExperiment(input);
    if (objective !== null) {
      try {
        await startStudy(experiment, objective);
      } catch (cause) {
        removeExperiment(experiment.id);
        throw cause;
      }
    }
    setSelectedExperimentId(experiment.id);
    return experiment;
  };
};
