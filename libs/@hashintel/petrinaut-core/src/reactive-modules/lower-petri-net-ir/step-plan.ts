import {
  type PetriNetIr,
  type PetriNetIrToken,
  type PetriNetIrTransition,
  petriNetIrArcKind,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
  type ResolvedZerothTarget,
} from "../petri-net-ir";
import { layoutColouredPlaces, type PlaceLayout } from "./colour-layout";

import type { HirFunction } from "../../hir/hir";
import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";

/**
 * One Petrinaut step, read off the IR once for every shape: which places
 * each transition takes from and adds to, the net change it makes, the
 * threshold its draw is tested against, the code it runs, how each coloured
 * place lays out its tokens, and which capped places need their pending
 * tokens tracked.
 */

/** The tokens a transition moves per place, in arc order. */
export type PlannedArcs = [place: string, weight: number][];

export type PlannedArc = {
  place: string;
  weight: number;
  kind: "standard" | "read" | "inhibitor";
};

export type CodeSurface = "lambda" | "kernel" | "dynamics";

/**
 * Turns the IR's code back into HIR. The browser hands the trees it printed
 * the strings from; a tool reading a document lowers the text.
 */
export type CodeParser = (
  code: string,
  surface: CodeSurface,
) => HirFunction | undefined;

export type PlannedTransition = {
  name: string;
  /** `Go: A -> B`, the transition as a reader sees it. */
  description: string;
  /** Every input arc, in binding order. */
  inputArcs: PlannedArc[];
  /** Standard input arcs summed per place. */
  consumes: PlannedArcs;
  produces: PlannedArcs;
  /** Net tokens a firing adds to each place it touches; zero entries left out. */
  deltas: Map<string, number>;
  /** A constant rate: mean firings per time unit while enabled. */
  rate: number | null;
  /** A constant rate's test: the transition fires when its draw is at least `e^(-rate * dt)`. */
  threshold: number | null;
  /** A rate computed from the input tokens. */
  rateCode: HirFunction | null;
  /** A predicate's condition over the input tokens. */
  guard: HirFunction | null;
  /** The kernel writing the produced tokens' attributes. */
  kernel: HirFunction | null;
  /** The model marks the firing as a controller's choice. */
  controllable: boolean;
};

export type PlannedPlace = {
  name: string;
  initial: number;
  /** A coloured place's starting tokens, in engine order. */
  rows: PetriNetIrToken[];
  capacity: number | undefined;
  /** The slots and attributes of a coloured place. */
  layout: PlaceLayout | null;
  /** The equation moving its tokens between steps. */
  dynamics: HirFunction | null;
};

export type StepPlan = {
  /** Some transition fires at a rate, so the module takes draws. */
  stochastic: boolean;
  /** Some place is coloured. */
  coloured: boolean;
  /** Some place has dynamics. */
  dynamic: boolean;
  kind: PetriNetIr["kind"];
  target: ResolvedZerothTarget;
  places: PlannedPlace[];
  layouts: Map<string, PlaceLayout>;
  /** Capped places some transition produces into: their pending tokens count. */
  capped: string[];
  transitions: PlannedTransition[];
};

/** Tokens an arc side moves per place, summed over the side's standard arcs. */
const sideTotals = (arcs: PetriNetIrTransition["inputs"]): PlannedArcs => {
  const totals = new Map<string, number>();
  for (const [place, arc] of Object.entries(arcs ?? {})) {
    if (petriNetIrArcKind(arc) !== "standard") {
      continue;
    }
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

const describeInputs = (arcs: PlannedArc[]): string =>
  arcs
    .map(
      ({ place, weight, kind }) =>
        `${kind === "standard" ? "" : `${kind} `}${weight === 1 ? place : `${weight} ${place}`}`,
    )
    .join(", ") || "nothing";

/** Parses one code string, reporting a document whose code cannot be read. */
const parsed = (
  code: string | undefined,
  surface: CodeSurface,
  parse: CodeParser,
  item: PetriNetIrDiagnostic["item"],
  errors: PetriNetIrDiagnostic[],
): HirFunction | null => {
  if (code === undefined) {
    return null;
  }
  const fn = parse(code, surface);
  if (fn === undefined) {
    errors.push({
      code: "code-not-parsed",
      message: `the ${surface} code could not be read back from the document`,
      item,
    });
    return null;
  }
  return fn;
};

export const planStep = (
  ir: PetriNetIr,
  target: ResolvedZerothTarget,
  parse: CodeParser,
  errors: PetriNetIrDiagnostic[],
): StepPlan => {
  const layouts = layoutColouredPlaces(ir, target, errors);
  const places: PlannedPlace[] = Object.entries(ir.places).map(
    ([name, place]) => {
      const item = { kind: "place" as const, id: name, name };
      const equation =
        place?.dynamics === undefined
          ? undefined
          : ir.dynamics?.[place.dynamics];
      if (place?.dynamics !== undefined && equation === undefined) {
        errors.push({
          code: "unknown-dynamics",
          message: `the place's dynamics ${place.dynamics} are not in the document`,
          item,
        });
      }
      const marking = ir.marking?.[name];
      return {
        name,
        initial: petriNetIrInitialTokens(ir, name),
        rows: Array.isArray(marking) ? marking : [],
        capacity: petriNetIrPlaceCapacity(place),
        layout: layouts.get(name) ?? null,
        dynamics: parsed(equation?.code, "dynamics", parse, item, errors),
      };
    },
  );
  const transitions: PlannedTransition[] = Object.entries(ir.transitions).map(
    ([name, transition]) => {
      const item = { kind: "transition" as const, id: name, name };
      const inputArcs: PlannedArc[] = Object.entries(
        transition.inputs ?? {},
      ).map(([place, arc]) => ({
        place,
        weight: petriNetIrArcWeight(arc),
        kind: petriNetIrArcKind(arc),
      }));
      const consumes = sideTotals(transition.inputs);
      const produces = sideTotals(transition.outputs);
      const rate = typeof transition.rate === "number" ? transition.rate : null;
      return {
        name,
        description: `${name}: ${describeInputs(inputArcs)} -> ${describeSide(produces)}`,
        inputArcs,
        consumes,
        produces,
        deltas: netDeltas(consumes, produces),
        rate,
        threshold: rate === null ? null : Math.exp(-rate * target.dt),
        rateCode: parsed(
          typeof transition.rate === "string" ? transition.rate : undefined,
          "lambda",
          parse,
          item,
          errors,
        ),
        guard: parsed(transition.guard, "lambda", parse, item, errors),
        kernel: parsed(transition.kernel, "kernel", parse, item, errors),
        controllable: transition.controllable === true,
      };
    },
  );
  const stochastic = transitions.some(
    (transition) => transition.rate !== null || transition.rateCode !== null,
  );
  const capped = places
    .filter(
      (place) =>
        place.capacity !== undefined &&
        transitions.some(
          (transition) => (transition.deltas.get(place.name) ?? 0) > 0,
        ),
    )
    .map((place) => place.name);
  return {
    stochastic,
    coloured: layouts.size > 0,
    dynamic: places.some((place) => place.dynamics !== null),
    kind: ir.kind,
    target,
    places,
    layouts,
    capped,
    transitions,
  };
};
