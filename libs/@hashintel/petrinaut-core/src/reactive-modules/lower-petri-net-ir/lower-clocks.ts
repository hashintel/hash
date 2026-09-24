import {
  and,
  assign,
  bool,
  conjunction,
  dec,
  exp,
  fired,
  ifThen,
  inc,
  isZero,
  ite,
  nat,
  nonNegative,
  nonZero,
  not,
  rate,
  ref,
  type SpnExpr,
  type SpnModuleDecl,
  type SpnModuleGraph,
  type SpnVariable,
} from "../spn-module-graph";
import {
  clockName,
  eventName,
  firedName,
  firesName,
  placeModuleNames,
  timeReference,
  transitionModuleNames,
} from "./shared/names";

import type { PlannedPlace, PlannedTransition, StepPlan } from "./step-plan";

/**
 * The clocks strategy, after Zeroth's `birth_death.py` in the SPN theory:
 * one module per transition owns a clock and an event, one module per
 * place counts tokens as it awaits the events, and the clocks are hidden.
 *
 * A transition's clock is armed with an exponential delay at its rate, runs
 * down against the time reference while its input arcs allow a firing, and
 * is re-armed when it expires; the event toggles on the same step. A place
 * applies one exclusive case per transition that moves its tokens: the
 * theory moves one token at a time and time stops at the first expiry, so
 * two events never toggle in one step.
 */

const timeRate = (factor: number): SpnExpr => rate(factor, timeReference);

/** Each input arc as the test its place must pass: empty for an inhibitor arc, non-empty otherwise. */
const arcTerms = (transition: PlannedTransition): SpnExpr[] =>
  transition.inputArcs.map((arc) =>
    arc.kind === "inhibitor" ? isZero(ref(arc.place)) : nonZero(ref(arc.place)),
  );

const transitionModule = (transition: PlannedTransition): SpnModuleDecl => {
  if (transition.rate === null) {
    throw new Error(
      `${transition.name} has no constant rate to arm a clock with`,
    );
  }
  const clock = clockName(transition.name);
  const event = eventName(transition.name);
  const fires = firesName(transition.name);
  const terms = arcTerms(transition);
  const enabled = conjunction(terms);
  const armed = exp(transition.rate);
  return {
    ...transitionModuleNames(transition.name),
    docstring: `${transition.description}, at rate ${transition.rate}`,
    ctrl: [clock, event],
    extl: [...transition.inputArcs.map((arc) => arc.place), timeReference],
    init: [armed, bool(false)],
    next: [
      assign(
        fires,
        terms.reduce((all, term) => and(all, term), isZero(ref(clock))),
      ),
    ],
    returns: [
      ite(ref(fires), armed, ref(clock)),
      ifThen(ref(fires), not(ref(event))),
    ],
    flow: [
      ifThen(
        nonNegative(clock),
        enabled === null
          ? timeRate(-1)
          : ite(enabled, timeRate(-1), timeRate(0)),
      ),
      null,
    ],
  };
};

type Mover = { transition: string; adds: boolean };

/** The transitions that change a place's count: the producers first, then the consumers. */
const moversOf = (plan: StepPlan, place: string): Mover[] => {
  const deltas = plan.transitions.map((transition) => ({
    transition: transition.name,
    delta: transition.deltas.get(place) ?? 0,
  }));
  return [
    ...deltas.filter(({ delta }) => delta > 0),
    ...deltas.filter(({ delta }) => delta < 0),
  ].map(({ transition, delta }) => ({ transition, adds: delta > 0 }));
};

/**
 * The count after the step: one case per mover, taken when its event alone
 * toggled and, for a consumer, the place holds a token; the count otherwise.
 */
const nextCount = (place: string, movers: Mover[]): SpnExpr =>
  movers.reduceRight<SpnExpr>((rest, mover, index) => {
    const others = movers.filter((_, otherIndex) => otherIndex !== index);
    const guard = conjunction([
      ref(firedName(mover.transition)),
      ...others.map((other) => not(ref(firedName(other.transition)))),
      ...(mover.adds ? [] : [nonZero(ref(place))]),
    ]);
    if (guard === null) {
      throw new Error(`the case for ${mover.transition} has no guard`);
    }
    return ite(guard, mover.adds ? inc(ref(place)) : dec(ref(place)), rest);
  }, ref(place));

const placeModule = (plan: StepPlan, place: PlannedPlace): SpnModuleDecl => {
  const movers = moversOf(plan, place.name);
  const adders = movers.filter((mover) => mover.adds);
  const takers = movers.filter((mover) => !mover.adds);
  const flows = [
    ...(adders.length === 0
      ? []
      : [`added by ${adders.map((mover) => mover.transition).join(", ")}`]),
    ...(takers.length === 0
      ? []
      : [`taken by ${takers.map((mover) => mover.transition).join(", ")}`]),
  ];
  return {
    ...placeModuleNames(place.name),
    docstring: `${place.name}: ${flows.length === 0 ? "no transition moves its tokens" : flows.join(", ")}`,
    ctrl: [place.name],
    extl: movers.map((mover) => eventName(mover.transition)),
    init: [nat(place.initial)],
    next: movers.map((mover) =>
      assign(firedName(mover.transition), fired(eventName(mover.transition))),
    ),
    returns: [nextCount(place.name, movers)],
  };
};

export const lowerClocks = (plan: StepPlan, header: string): SpnModuleGraph => {
  const variables: SpnVariable[] = [
    {
      name: timeReference,
      sort: "clock",
      role: "time",
      comment: "the time reference",
    },
    ...plan.places.map(
      (place): SpnVariable => ({
        name: place.name,
        sort: "nat",
        role: "place",
      }),
    ),
    ...plan.transitions.map(
      (transition): SpnVariable => ({
        name: clockName(transition.name),
        sort: "clock",
        role: "clock",
        comment: `time left until ${transition.name} fires`,
      }),
    ),
    ...plan.transitions.map(
      (transition): SpnVariable => ({
        name: eventName(transition.name),
        sort: "event",
        role: "event",
        comment: `toggles when ${transition.name} fires`,
      }),
    ),
  ];
  return {
    language: "spn",
    header,
    variables,
    modules: [
      ...plan.transitions.map(transitionModule),
      ...plan.places.map((place) => placeModule(plan, place)),
    ],
    hidden: plan.transitions.map((transition) => clockName(transition.name)),
  };
};
