import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
} from "./extensions";
import { getPlaceDynamicsEquationIds } from "./place-dynamics";

import type { Color, Place, SDCPN, Transition } from "./types/sdcpn";

/**
 * Whether anything in the net takes time.
 *
 * A net is **timed** when a transition fires at a rate, or when the net is
 * dynamically coloured. A run of a timed net is read against simulated time.
 *
 * Every other net is **untimed**. Each transition is a predicate, which
 * fires as soon as it holds, so nothing separates one firing from the next
 * but their order: a run is a sequence of steps and has no clock.
 */
export type NetTime = "timed" | "untimed";

/**
 * What the tokens of the net carry.
 *
 * - `none`: the net is **uncoloured**. No place has a type, and a token is
 *   one of a count.
 * - `static`: the net is **statically coloured**. A token carries values,
 *   which change only when a transition fires.
 * - `dynamic`: the net is **dynamically coloured**. A place runs dynamics,
 *   so the values of its tokens also move between two firings.
 */
export type NetColoring = "none" | "static" | "dynamic";

/**
 * Whether two runs of the net from one state can differ.
 *
 * A net is **stochastic** when a transition fires at a rate, or when its
 * code draws at random. Every other net is **deterministic**: one run is
 * every run.
 */
export type NetChance = "stochastic" | "deterministic";

/**
 * The class of a net: three facts about the model, each inferred from the
 * net and none stored.
 *
 * Time and colouring are read from the structure alone, by `netTimeOf` and
 * `netColoringOf`, which compile nothing. Chance needs the net's code, so
 * `classifyNet` infers the whole class where code is lowered.
 */
export type NetClass = {
  time: NetTime;
  coloring: NetColoring;
  /** `null` while code that may draw does not compile. */
  chance: NetChance | null;
};

/**
 * Whether the transition fires at a rate: a delay drawn against simulated
 * time. A predicate does not: it fires as soon as it holds.
 */
export const isTimedTransition = (
  transition: Pick<Transition, "lambdaType">,
  extensions: Pick<PetrinautExtensionSettings, "stochasticity">,
): boolean =>
  extensions.stochasticity && transition.lambdaType === "stochastic";

/**
 * Whether the place's tokens evolve continuously while the net runs: its
 * dynamics are on with an equation listed, and its tokens have a `real`
 * attribute for the equation to move. The engines integrate no other place.
 *
 * `types` are the token types of the net the place is in. A type that is
 * not among them is taken to have a `real` attribute.
 */
export const hasRunningDynamics = (
  place: Pick<Place, "colorId" | "dynamicsEnabled" | "dynamics">,
  extensions: Pick<PetrinautExtensionSettings, "colors" | "dynamics">,
  types: readonly Pick<Color, "id" | "elements">[],
): boolean => {
  if (
    !extensions.colors ||
    !extensions.dynamics ||
    !place.dynamicsEnabled ||
    place.colorId === null ||
    getPlaceDynamicsEquationIds(place).length === 0
  ) {
    return false;
  }
  const type = types.find(({ id }) => id === place.colorId);
  return (
    type === undefined ||
    type.elements.some((element) => element.type === "real")
  );
};

/** What the inferences below read of a net. */
type NetContent = Pick<SDCPN, "places" | "transitions" | "types" | "subnets">;

/**
 * The net and its subnets. Subnets count whether or not an instance uses
 * them, so an inference does not depend on flattening the net.
 */
const netsOf = (
  sdcpn: NetContent,
  extensions: Pick<PetrinautExtensionSettings, "subnets">,
): Pick<SDCPN, "places" | "transitions" | "types">[] => [
  sdcpn,
  ...(extensions.subnets ? (sdcpn.subnets ?? []) : []),
];

/** Whether a transition of the net fires at a rate. */
export const hasTimedTransition = (
  sdcpn: NetContent,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): boolean =>
  netsOf(sdcpn, extensions).some((net) =>
    net.transitions.some((transition) =>
      isTimedTransition(transition, extensions),
    ),
  );

/** The colouring of the net. */
export const netColoringOf = (
  sdcpn: NetContent,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): NetColoring => {
  const nets = netsOf(sdcpn, extensions);
  if (
    nets.some((net) =>
      net.places.some((place) =>
        hasRunningDynamics(place, extensions, net.types),
      ),
    )
  ) {
    return "dynamic";
  }
  return extensions.colors &&
    nets.some((net) => net.places.some((place) => place.colorId !== null))
    ? "static"
    : "none";
};

/** Whether time passes in the net. Dynamics take time, as a rate does. */
export const netTimeOf = (
  sdcpn: NetContent,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): NetTime =>
  hasTimedTransition(sdcpn, extensions) ||
  netColoringOf(sdcpn, extensions) === "dynamic"
    ? "timed"
    : "untimed";

/**
 * What a run's positions count. A timed net's run is read against simulated
 * seconds. An untimed net has no clock, so its run counts steps.
 */
export type RunClock = "time" | "steps";

/** The clock a run of the net is read against, alone or in an experiment. */
export const runClockOf = (
  sdcpn: NetContent,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): RunClock => (netTimeOf(sdcpn, extensions) === "timed" ? "time" : "steps");

/**
 * What lies between two events of a run. In a continuous run the state
 * evolves there, so every position the run covers has a state of its own.
 * In a discrete run nothing does: the state holds from one event to the
 * next, and the events are the only positions worth viewing.
 */
export type RunContinuity = "continuous" | "discrete";

/**
 * Whether a run of the net evolves between its events. It does when the net
 * is dynamically coloured, and only then.
 */
export const runContinuityOf = (
  sdcpn: NetContent,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): RunContinuity =>
  netColoringOf(sdcpn, extensions) === "dynamic" ? "continuous" : "discrete";

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
