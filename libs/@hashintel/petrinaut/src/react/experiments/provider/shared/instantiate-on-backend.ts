import type { MonteCarloExperiment } from "@hashintel/petrinaut-core";
import type {
  ExperimentBackend,
  ExperimentRequest,
  InstantiateExperimentOptions,
} from "@hashintel/petrinaut-core/experiments";

const describeBlockers = (blockers: readonly { message: string }[]): string =>
  blockers.map((blocker) => blocker.message).join("; ");

/**
 * Assesses `request` on one already-chosen backend and instantiates it,
 * throwing the blockers' messages when either step refuses.
 */
export const instantiateOnBackend = async (
  backend: ExperimentBackend,
  request: ExperimentRequest,
  options: InstantiateExperimentOptions,
): Promise<MonteCarloExperiment> => {
  const assessment = await backend.assess(request);
  if (!assessment.eligible) {
    throw new Error(describeBlockers(assessment.blockers));
  }
  const instantiated = await assessment.instantiate(options);
  if (!instantiated.ok) {
    throw new Error(describeBlockers(instantiated.blockers));
  }
  return instantiated.handle;
};
