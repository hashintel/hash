import { selectStore } from "../../shared/use-store";

import type { StochasticRun } from "../context";
import type {
  MonteCarloExperimentState,
  PlayableTrace,
  ReadableStore,
  SimulationState as CoreSimulationState,
  TraceCoverage,
} from "@hashintel/petrinaut-core";

const experimentStatusAsRunStatus = (
  status: MonteCarloExperimentState,
): CoreSimulationState =>
  // A cancelled experiment is over, with what it computed still to view.
  status === "Cancelled" ? "Complete" : status;

/** Where a Stochastic simulation's experiment stands, in the words of a run. */
export const stochasticRunStatus = ({
  experiment,
}: Pick<StochasticRun, "experiment">): ReadableStore<CoreSimulationState> =>
  selectStore(experiment.status, experimentStatusAsRunStatus);

const isOver = (status: MonteCarloExperimentState): boolean =>
  status === "Complete" || status === "Error" || status === "Cancelled";

/**
 * What playback moves over in Stochastic mode: the experiment's samples.
 * They have positions and no events, so there is nothing to step between or
 * to rest on, and the experiment computes freely, so nothing is asked of it.
 */
export const createStochasticPlaybackSource = ({
  experiment,
  reader,
}: Pick<StochasticRun, "experiment" | "reader">): PlayableTrace => {
  const read = (): TraceCoverage => ({
    eventCount: experiment.metrics.get().frames.length,
    startTime: 0,
    coveredTime: reader.coveredTime(),
    ended: isOver(experiment.status.get()),
  });
  // The same object while nothing moved, as a store's value has to be.
  let coverage = read();
  const getCoverage = () => {
    const next = read();
    if (
      next.eventCount !== coverage.eventCount ||
      next.coveredTime !== coverage.coveredTime ||
      next.ended !== coverage.ended
    ) {
      coverage = next;
    }
    return coverage;
  };
  return {
    continuity: "continuous",
    coverage: {
      get: getCoverage,
      subscribe: (listener) => {
        const notify = () => listener(getCoverage());
        const offSamples = experiment.metrics.subscribe(notify);
        const offStatus = experiment.status.subscribe(notify);
        return () => {
          offSamples();
          offStatus();
        };
      },
    },
    demand: () => {},
    findEventIndexAt: () => -1,
    getEvent: () => null,
    findDiscreteEventAtOrBefore: () => null,
    findDiscreteEventAfter: () => null,
  };
};
