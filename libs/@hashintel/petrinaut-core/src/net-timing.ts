import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
} from "./extensions";
import { getPlaceDynamicsEquationIds } from "./place-dynamics";

import type { Place, SDCPN, Transition } from "./types/sdcpn";

/**
 * Whether the transition fires at a rate: a delay drawn against simulated
 * time. A predicate does not: it fires as soon as it holds.
 */
export const isTimedTransition = (
  transition: Pick<Transition, "lambdaType">,
  extensions: Pick<PetrinautExtensionSettings, "stochasticity">,
): boolean =>
  extensions.stochasticity && transition.lambdaType === "stochastic";

/** Whether the place's tokens evolve continuously while the net runs. */
export const hasRunningDynamics = (
  place: Pick<Place, "colorId" | "dynamicsEnabled" | "dynamics">,
  extensions: Pick<PetrinautExtensionSettings, "colors" | "dynamics">,
): boolean =>
  extensions.colors &&
  extensions.dynamics &&
  place.dynamicsEnabled &&
  place.colorId !== null &&
  getPlaceDynamicsEquationIds(place).length > 0;

/**
 * Whether time passes in the net.
 *
 * A net is **timed** when something in it takes time: a transition fires at
 * a rate, or a place's tokens evolve under its dynamics. A run of a timed
 * net is read against simulated time.
 *
 * A net with neither is **untimed**. Every transition is a predicate, which
 * fires as soon as it holds, so nothing separates one firing from the next
 * but their order: a run is a sequence of steps and has no clock.
 *
 * The property is inferred, never stored. Subnets count whether or not an
 * instance uses them, so the answer does not depend on flattening the net.
 */
export const isTimedNet = (
  sdcpn: Pick<SDCPN, "places" | "transitions" | "subnets">,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): boolean =>
  [sdcpn, ...(extensions.subnets ? (sdcpn.subnets ?? []) : [])].some(
    (net) =>
      net.transitions.some((transition) =>
        isTimedTransition(transition, extensions),
      ) || net.places.some((place) => hasRunningDynamics(place, extensions)),
  );

/**
 * What a run's positions count. A timed net's run is read against simulated
 * seconds. An untimed net has no clock, so its run counts steps.
 */
export type RunClock = "time" | "steps";

/** The clock a run of the net is read against, alone or in an experiment. */
export const runClockOf = (
  sdcpn: Pick<SDCPN, "places" | "transitions" | "subnets">,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): RunClock => (isTimedNet(sdcpn, extensions) ? "time" : "steps");

/**
 * The spacing of an experiment's samples on a clock that counts steps: every
 * step is sampled. A step has no part to sample between.
 */
export const STEP_SAMPLE_PERIOD = 1;

/**
 * Whether the transition is a predicate that nothing feeds: no input arc of
 * any kind. Such a transition is always enabled, so in a timed net it would
 * fire without end at one instant. In an untimed net it fires once per step.
 */
export const isSourcePredicate = (
  transition: Pick<Transition, "lambdaType" | "inputArcs">,
  extensions: Pick<PetrinautExtensionSettings, "stochasticity">,
): boolean =>
  !isTimedTransition(transition, extensions) &&
  transition.inputArcs.length === 0;
