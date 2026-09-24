import {
  assign,
  binary,
  bool,
  changedWhen,
  conjunction,
  next,
  num,
  type ReactiveExpr,
  type ReactiveModuleDecl,
  type ReactiveModuleGraph,
  type ReactiveStatement,
  type ReactiveVariable,
  ref,
} from "../reactive-module-graph";
import {
  availableName,
  fillName,
  fireName,
  placeModuleNames,
  transitionModuleNames,
} from "./shared/names";
import {
  drawModules,
  hitVariables,
  inputTerms,
  inputVariables,
  markingTheory,
} from "./shared/step-terms";

import type { PlannedTransition, StepPlan } from "./step-plan";

/**
 * The modular shape, after Zeroth's own Petri net examples: one module per
 * transition drives a Bool flag that says it fires this round, one module
 * per place awaits the flags of its transitions and applies their tokens,
 * and the modules are composed into the system.
 *
 * A transition module reads its places latched, so it rebuilds the view a
 * Petrinaut sweep gives it by awaiting the flags of the earlier transitions
 * that take from the same place, or move tokens in a capped place it fills:
 * the firings are the ones a Petrinaut step decides, and each place's next
 * value is the step's result. The awaits run from a transition to earlier
 * ones and from a place to its transitions, so they form a DAG.
 */

/** Adds `name` once, keeping first-seen order. */
const read = (reads: string[], name: string): void => {
  if (!reads.includes(name)) {
    reads.push(name);
  }
};

type Guard = {
  update: ReactiveStatement[];
  terms: ReactiveExpr[];
  reads: string[];
};

/**
 * The tokens an input place holds once the earlier transitions taking from
 * it have consumed theirs: the place, less each earlier firing's weight.
 */
const availableTokens = (
  place: string,
  earlier: PlannedTransition[],
  guard: Guard,
): ReactiveExpr => {
  const takers = earlier.filter((transition) =>
    transition.consumes.some(([taken]) => taken === place),
  );
  read(guard.reads, place);
  if (takers.length === 0) {
    return ref(place);
  }
  const available = availableName(place);
  guard.update.push(assign(available, ref(place)));
  for (const taker of takers) {
    const weight = taker.consumes.find(([taken]) => taken === place)?.[1] ?? 0;
    read(guard.reads, fireName(taker.name));
    guard.update.push(
      assign(
        available,
        changedWhen(next(fireName(taker.name)), ref(available), "-", weight),
        `${taker.name} took ${weight}`,
      ),
    );
  }
  return ref(available);
};

/**
 * The tokens a capped place would hold if the step ended after the earlier
 * transitions: the place, plus each earlier firing's net change to it.
 */
const fillTokens = (
  place: string,
  earlier: PlannedTransition[],
  guard: Guard,
): ReactiveExpr => {
  const movers = earlier.filter(
    (transition) => (transition.deltas.get(place) ?? 0) !== 0,
  );
  read(guard.reads, place);
  if (movers.length === 0) {
    return ref(place);
  }
  const fill = fillName(place);
  guard.update.push(assign(fill, ref(place)));
  for (const mover of movers) {
    const delta = mover.deltas.get(place) ?? 0;
    read(guard.reads, fireName(mover.name));
    guard.update.push(
      assign(
        fill,
        changedWhen(
          next(fireName(mover.name)),
          ref(fill),
          delta > 0 ? "+" : "-",
          Math.abs(delta),
        ),
        `${mover.name} ${delta > 0 ? "added" : "took"} ${Math.abs(delta)}`,
      ),
    );
  }
  return ref(fill);
};

const transitionModule = (
  plan: StepPlan,
  index: number,
): ReactiveModuleDecl => {
  const transition = plan.transitions[index];
  if (transition === undefined) {
    throw new Error(`no transition at ${index}`);
  }
  const earlier = plan.transitions.slice(0, index);
  const capacities = new Map(
    plan.places.map((place) => [place.name, place.capacity]),
  );
  const guard: Guard = { update: [], terms: [], reads: [] };
  for (const [place, weight] of transition.consumes) {
    guard.terms.push(
      binary(">=", availableTokens(place, earlier, guard), num(weight)),
    );
  }
  for (const place of plan.capped) {
    const delta = transition.deltas.get(place) ?? 0;
    if (delta > 0) {
      guard.terms.push(
        binary(
          "<=",
          binary("+", fillTokens(place, earlier, guard), num(delta)),
          num(capacities.get(place) ?? 0),
        ),
      );
    }
  }
  const inputs = inputTerms(plan, transition);
  guard.terms.push(...inputs.terms);
  for (const name of inputs.reads) {
    read(guard.reads, name);
  }
  const fires = conjunction(guard.terms);
  const rate = transition.rate === null ? "" : `, at rate ${transition.rate}`;
  return {
    ...transitionModuleNames(transition.name),
    docstring: `${transition.description}${rate}${fires === null ? ", always enabled" : ""}`,
    theory: markingTheory(plan),
    ctrl: [fireName(transition.name)],
    extl: guard.reads,
    init: [bool(false)],
    update: guard.update,
    returns: [fires ?? bool(true)],
  };
};

const placeModule = (plan: StepPlan, name: string): ReactiveModuleDecl => {
  const place = plan.places.find((candidate) => candidate.name === name);
  const movers = plan.transitions.filter(
    (transition) => (transition.deltas.get(name) ?? 0) !== 0,
  );
  const update: ReactiveStatement[] = movers.map((mover) => {
    const delta = mover.deltas.get(name) ?? 0;
    return assign(
      name,
      changedWhen(
        next(fireName(mover.name)),
        ref(name),
        delta > 0 ? "+" : "-",
        Math.abs(delta),
      ),
      `${mover.name} ${delta > 0 ? "adds" : "takes"} ${Math.abs(delta)}`,
    );
  });
  const takers = movers
    .filter((mover) => (mover.deltas.get(name) ?? 0) < 0)
    .map((mover) => mover.name);
  const adders = movers
    .filter((mover) => (mover.deltas.get(name) ?? 0) > 0)
    .map((mover) => mover.name);
  const flows = [
    ...(takers.length === 0 ? [] : [`taken by ${takers.join(", ")}`]),
    ...(adders.length === 0 ? [] : [`added by ${adders.join(", ")}`]),
  ];
  return {
    ...placeModuleNames(name),
    docstring: `${name}: ${flows.length === 0 ? "no transition moves its tokens" : flows.join(", ")}`,
    theory: markingTheory(plan),
    ctrl: [name],
    extl: movers.map((mover) => fireName(mover.name)),
    init: [num(place?.initial ?? 0)],
    update,
    returns: [ref(name)],
  };
};

export const lowerModular = (
  plan: StepPlan,
  header: string,
): ReactiveModuleGraph => {
  const theory = markingTheory(plan);
  const placeVariables: ReactiveVariable[] = plan.places.map((place) => ({
    name: place.name,
    sort: theory === "LRA" ? "real" : "int",
    role: "place",
  }));
  const fireVariables: ReactiveVariable[] = plan.transitions.map(
    (transition) => ({
      name: fireName(transition.name),
      sort: "bool",
      role: "flag",
      comment: `${transition.name} fires this step`,
    }),
  );
  const modules: ReactiveModuleDecl[] = [
    ...drawModules(plan),
    ...plan.transitions.map((_, index) => transitionModule(plan, index)),
    ...plan.places.map((place) => placeModule(plan, place.name)),
  ];
  return {
    language: "linear",
    header,
    variables: [
      ...placeVariables,
      ...inputVariables(plan),
      ...hitVariables(plan),
      ...fireVariables,
    ],
    modules,
    root: {
      kind: "compose",
      modules: modules.map((module) => module.instance),
    },
  };
};
