import {
  binary,
  bool,
  next,
  num,
  type ReactiveExpr,
  type ReactiveModuleDecl,
  type ReactiveTheory,
  type ReactiveVariable,
} from "../../reactive-module-graph";
import { choiceName, drawModuleNames, drawName, hitName } from "./names";

import type { PlannedTransition, StepPlan } from "../step-plan";

/**
 * The parts of a transition's guard that do not depend on the marking, and
 * the variables and modules they need: the draw test of a stochastic
 * transition and the choice of a controllable one. Both shapes read them.
 */

/** A coloured net or one with dynamics holds Reals, so it is lowered in LRA. */
const needsReals = (plan: StepPlan): boolean => plan.coloured || plan.dynamic;

/** Whether the draw tests live in modules of their own, with Int places. */
export const drawsAreModules = (plan: StepPlan): boolean =>
  plan.stochastic && plan.target.marking === "int" && !needsReals(plan);

/** The theory the places and the transitions are typed in. */
export const markingTheory = (plan: StepPlan): ReactiveTheory =>
  needsReals(plan) || (plan.stochastic && plan.target.marking === "real")
    ? "LRA"
    : "LIA";

export const choiceApplies = (
  plan: StepPlan,
  transition: PlannedTransition,
): boolean => transition.controllable && plan.target.control === "open";

/** The draw and choice inputs, in transition order, each declared once. */
export const inputVariables = (plan: StepPlan): ReactiveVariable[] => {
  const variables: ReactiveVariable[] = [];
  for (const transition of plan.transitions) {
    if (transition.threshold !== null) {
      variables.push({
        name: drawName(transition.name),
        sort: "real",
        role: "input",
        comment: `uniform draw for ${transition.name}, each step`,
      });
    }
    if (choiceApplies(plan, transition)) {
      variables.push({
        name: choiceName(transition.name),
        sort: "bool",
        role: "input",
        comment: `choice for ${transition.name}, each step: it fires only when chosen`,
      });
    }
  }
  return variables;
};

/** The Bool each draw module drives, when the draws are modules. */
/** The transitions that fire at a rate, in sweep order. */
const stochasticTransitions = (plan: StepPlan): PlannedTransition[] =>
  plan.transitions.filter((transition) => transition.threshold !== null);

export const hitVariables = (plan: StepPlan): ReactiveVariable[] =>
  drawsAreModules(plan)
    ? stochasticTransitions(plan).map((transition) => ({
        name: hitName(transition.name),
        sort: "bool",
        role: "flag",
        comment: `${transition.name}'s draw passed its threshold`,
      }))
    : [];

/** One LRA module per transition: its draw against its threshold, as a Bool. */
export const drawModules = (plan: StepPlan): ReactiveModuleDecl[] =>
  drawsAreModules(plan)
    ? stochasticTransitions(plan).map((transition) => ({
        ...drawModuleNames(transition.name),
        docstring: `${transition.name} at rate ${transition.rate ?? 0} fires within a step of dt = ${plan.target.dt} when its draw is at least e^(-${transition.rate ?? 0} * ${plan.target.dt})`,
        theory: "LRA",
        ctrl: [hitName(transition.name)],
        extl: [drawName(transition.name)],
        init: [bool(false)],
        update: [],
        returns: [
          binary(
            ">=",
            next(drawName(transition.name)),
            num(transition.threshold ?? 0),
          ),
        ],
      }))
    : [];

/**
 * The guard terms that do not read the marking, with the variables they
 * read: the draw test (or the draw module's flag) and the choice.
 */
export const inputTerms = (
  plan: StepPlan,
  transition: PlannedTransition,
): { terms: ReactiveExpr[]; reads: string[] } => {
  const terms: ReactiveExpr[] = [];
  const reads: string[] = [];
  if (transition.threshold !== null) {
    if (drawsAreModules(plan)) {
      terms.push(next(hitName(transition.name)));
      reads.push(hitName(transition.name));
    } else {
      terms.push(
        binary(
          ">=",
          next(drawName(transition.name)),
          num(transition.threshold),
        ),
      );
      reads.push(drawName(transition.name));
    }
  }
  if (choiceApplies(plan, transition)) {
    terms.push(next(choiceName(transition.name)));
    reads.push(choiceName(transition.name));
  }
  return { terms, reads };
};
