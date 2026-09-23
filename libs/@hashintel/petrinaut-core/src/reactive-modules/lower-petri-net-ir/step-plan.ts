import {
  type PetriNetIr,
  type PetriNetIrTransition,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
  type ResolvedZerothTarget,
} from "../petri-net-ir";

/**
 * One Petrinaut step, read off the IR once for every shape: which places
 * each transition takes from and adds to, the net change it makes, the
 * threshold its draw is tested against, and which capped places need their
 * pending tokens tracked.
 */

/** The tokens a transition moves per place, in arc order. */
export type PlannedArcs = [place: string, weight: number][];

export type PlannedTransition = {
  name: string;
  /** `Go: A -> B`, the transition as a reader sees it. */
  description: string;
  consumes: PlannedArcs;
  produces: PlannedArcs;
  /** Net tokens a firing adds to each place it touches; zero entries left out. */
  deltas: Map<string, number>;
  /** Stochastic nets: mean firings per time unit while enabled. */
  rate: number | null;
  /** Stochastic nets: the transition fires when its draw is at least `e^(-rate * dt)`. */
  threshold: number | null;
  /** The model marks the firing as a controller's choice. */
  controllable: boolean;
};

export type PlannedPlace = {
  name: string;
  initial: number;
  capacity: number | undefined;
};

export type StepPlan = {
  /** Some transition fires at a rate, so the module takes draws. */
  stochastic: boolean;
  kind: PetriNetIr["kind"];
  target: ResolvedZerothTarget;
  places: PlannedPlace[];
  /** Capped places some transition produces into: their pending tokens count. */
  capped: string[];
  transitions: PlannedTransition[];
};

/** Tokens an arc side moves per place, summed over the side's arcs. */
const sideTotals = (arcs: PetriNetIrTransition["inputs"]): PlannedArcs => {
  const totals = new Map<string, number>();
  for (const [place, arc] of Object.entries(arcs ?? {})) {
    totals.set(place, (totals.get(place) ?? 0) + petriNetIrArcWeight(arc));
  }
  return [...totals];
};

const netDeltas = (
  consumes: PlannedArcs,
  produces: PlannedArcs,
): Map<string, number> => {
  const deltas = new Map<string, number>();
  for (const [place, weight] of produces) {
    deltas.set(place, (deltas.get(place) ?? 0) + weight);
  }
  for (const [place, weight] of consumes) {
    deltas.set(place, (deltas.get(place) ?? 0) - weight);
  }
  for (const [place, delta] of deltas) {
    if (delta === 0) {
      deltas.delete(place);
    }
  }
  return deltas;
};

const describeSide = (arcs: PlannedArcs): string =>
  arcs
    .map(([place, weight]) => (weight === 1 ? place : `${weight} ${place}`))
    .join(", ") || "nothing";

export const planStep = (
  ir: PetriNetIr,
  target: ResolvedZerothTarget,
): StepPlan => {
  const places: PlannedPlace[] = Object.entries(ir.places).map(
    ([name, place]) => ({
      name,
      initial: petriNetIrInitialTokens(ir, name),
      capacity: petriNetIrPlaceCapacity(place),
    }),
  );
  const transitions: PlannedTransition[] = Object.entries(ir.transitions).map(
    ([name, transition]) => {
      const consumes = sideTotals(transition.inputs);
      const produces = sideTotals(transition.outputs);
      // A rate written as code is refused before planning; only constants reach here.
      const rate = typeof transition.rate === "number" ? transition.rate : null;
      return {
        name,
        description: `${name}: ${describeSide(consumes)} -> ${describeSide(produces)}`,
        consumes,
        produces,
        deltas: netDeltas(consumes, produces),
        rate,
        threshold: rate === null ? null : Math.exp(-rate * target.dt),
        controllable: transition.controllable === true,
      };
    },
  );
  const stochastic = transitions.some((transition) => transition.rate !== null);
  const capped = places
    .filter(
      (place) =>
        place.capacity !== undefined &&
        transitions.some(
          (transition) => (transition.deltas.get(place.name) ?? 0) > 0,
        ),
    )
    .map((place) => place.name);
  return { stochastic, kind: ir.kind, target, places, capped, transitions };
};
