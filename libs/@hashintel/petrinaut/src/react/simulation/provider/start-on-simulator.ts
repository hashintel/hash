import {
  assessSimulator,
  type EventSimulation,
  type MonteCarloExperiment,
  type SimulatorExperimentRequest,
  type SimulatorRegistration,
  type SimulatorStart,
} from "@hashintel/petrinaut-core";

import type { SimulatorSelection } from "../../simulators/context";

type BuildRequest = Parameters<typeof assessSimulator>[2];

/** A refusal's reasons as one message, the way a failed start reports. */
const refusalMessage = (
  blockers: readonly { readonly message: string }[],
): string => blockers.map((blocker) => blocker.message).join("\n");

/**
 * The handle, releasing what was loaded for it once it is disposed: whoever
 * ends the run or the experiment ends the simulator's hold with it.
 */
export const releasingOnDispose = <
  Handle extends { dispose(this: void): void },
>(
  handle: Handle,
  release: () => void,
): Handle => ({
  ...handle,
  dispose: () => {
    handle.dispose();
    release();
  },
});

/** The selected simulator's offer for the request, or throws why there is none. */
const assessOrThrow = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: BuildRequest,
) => {
  if (!registration) {
    throw new Error(`No simulator is registered as "${selection.simulatorId}"`);
  }
  const outcome = await assessSimulator(
    registration,
    selection.parameters,
    request,
  );
  if (!outcome.ok) {
    throw new Error(refusalMessage(outcome.blockers));
  }
  return { offer: outcome.offer, dispose: outcome.dispose, registration };
};

/**
 * What a start of the offer produced, or throws why it produced nothing.
 * The simulator loaded for the offer is released with the handle, or at
 * once when nothing started.
 */
const startedOrThrow = async <Handle extends { dispose(this: void): void }>(
  release: () => void,
  start: (() => Promise<SimulatorStart<Handle>>) | undefined,
  notOffered: string,
): Promise<Handle> => {
  if (!start) {
    release();
    throw new Error(notOffered);
  }
  let started: SimulatorStart<Handle>;
  try {
    // A start may throw before it returns its promise, as well as reject.
    started = await start();
  } catch (error) {
    release();
    throw error;
  }
  if (!started.ok) {
    release();
    throw new Error(refusalMessage(started.blockers));
  }
  return releasingOnDispose(started.handle, release);
};

/** Starts one run on the selected simulator, or throws why it could not. */
export const startSimulatorRun = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: BuildRequest,
): Promise<EventSimulation> => {
  const assessed = await assessOrThrow(registration, selection, request);
  return startedOrThrow(
    assessed.dispose,
    assessed.offer.startRun,
    `${assessed.registration.label} computes many runs at once, not a single run`,
  );
};

/** Starts an experiment on the selected simulator, or throws why it could not. */
export const startSimulatorExperiment = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: BuildRequest,
  experiment: SimulatorExperimentRequest,
): Promise<MonteCarloExperiment> => {
  const assessed = await assessOrThrow(registration, selection, request);
  const { startExperiment } = assessed.offer;
  return startedOrThrow(
    assessed.dispose,
    startExperiment ? () => startExperiment(experiment) : undefined,
    `${assessed.registration.label} computes one run at a time, not many`,
  );
};
