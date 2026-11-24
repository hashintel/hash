import { selectStore } from "../../shared/use-store";

import type { PlaybackSource, StochasticRun } from "../context";
import type {
  MonteCarloExperimentState,
  SimulationState as CoreSimulationState,
} from "@hashintel/petrinaut-core";

const experimentStatusAsRunStatus = (
  status: MonteCarloExperimentState,
): CoreSimulationState =>
  // A cancelled experiment is over, with what it computed still to view.
  status === "Cancelled" ? "Complete" : status;

/**
 * What playback moves over in Stochastic mode: the experiment's samples. It
 * computes freely, so nothing is demanded of it.
 */
export const createStochasticPlaybackSource = ({
  experiment,
  reader,
}: Pick<StochasticRun, "experiment" | "reader">): PlaybackSource => {
  const read = () => ({
    eventCount: experiment.metrics.get().frames.length,
    coveredTime: reader.coveredTime(),
  });
  // The same object while nothing moved, as a store's value has to be.
  let coverage = read();
  const getCoverage = () => {
    const next = read();
    if (
      next.eventCount !== coverage.eventCount ||
      next.coveredTime !== coverage.coveredTime
    ) {
      coverage = next;
    }
    return coverage;
  };
  return {
    coverage: {
      get: getCoverage,
      subscribe: (listener) =>
        experiment.metrics.subscribe(() => listener(getCoverage())),
    },
    status: selectStore(experiment.status, experimentStatusAsRunStatus),
    demand: () => {},
  };
};
