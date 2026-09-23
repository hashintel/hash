import {
  assign,
  binary,
  changedWhen,
  comment,
  conjunction,
  num,
  type ReactiveExpr,
  type ReactiveModuleDecl,
  type ReactiveModuleGraph,
  type ReactiveStatement,
  type ReactiveVariable,
  ref,
} from "../reactive-module-graph";
import { fillName, fireName, netModuleNames } from "./shared/names";
import {
  drawModules,
  hitVariables,
  inputTerms,
  inputVariables,
  markingTheory,
} from "./shared/step-terms";

import type { StepPlan } from "./step-plan";

/**
 * The monolithic shape: one module drives every place, and its `update` is
 * one Petrinaut step. Transitions are swept in record order, a firing
 * consumes its input tokens at once, produced tokens land at the end of the
 * step, and a capped place tracks what it would hold if the step ended now
 * so a later producer sees an earlier one's tokens.
 *
 * Under `marking: int` on a stochastic net the draw tests move into one LRA
 * module per transition, and the step module reads their Bool flags.
 */

const SWEEP_COMMENT =
  "sweep in order; a firing consumes its input tokens at once";
const LAND_COMMENT = "end of step: produced tokens land";
const FILL_COMMENT = "tokens a capped place would hold if the step ended now";

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const floatText = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

const stepStatements = (
  plan: StepPlan,
): { update: ReactiveStatement[]; returns: ReactiveExpr[] } => {
  const capacities = new Map(
    plan.places.map((place) => [place.name, place.capacity]),
  );
  const update: ReactiveStatement[] = [];
  if (plan.capped.length > 0) {
    update.push(comment(FILL_COMMENT));
    for (const place of plan.capped) {
      update.push(assign(fillName(place), ref(place)));
    }
  }
  update.push(comment(SWEEP_COMMENT));

  const produced = new Map<string, { fire: string | null; weight: number }[]>(
    plan.places.map((place) => [place.name, []]),
  );
  for (const transition of plan.transitions) {
    const terms: ReactiveExpr[] = [];
    for (const [place, weight] of transition.consumes) {
      terms.push(binary(">=", ref(place), num(weight)));
    }
    for (const place of plan.capped) {
      const delta = transition.deltas.get(place) ?? 0;
      if (delta > 0) {
        terms.push(
          binary(
            "<=",
            binary("+", ref(fillName(place)), num(delta)),
            num(capacities.get(place) ?? 0),
          ),
        );
      }
    }
    terms.push(...inputTerms(plan, transition).terms);
    const guard = conjunction(terms);
    const fire = guard === null ? null : fireName(transition.name);
    if (guard === null) {
      update.push(comment(`${transition.description}: always enabled`));
    } else {
      update.push(
        assign(fireName(transition.name), guard, transition.description),
      );
    }
    const fireRef = fire === null ? null : ref(fire);
    for (const [place, weight] of transition.consumes) {
      update.push(assign(place, changedWhen(fireRef, ref(place), "-", weight)));
    }
    for (const place of plan.capped) {
      const delta = transition.deltas.get(place) ?? 0;
      if (delta !== 0) {
        const fill = fillName(place);
        update.push(
          assign(
            fill,
            changedWhen(
              fireRef,
              ref(fill),
              delta > 0 ? "+" : "-",
              Math.abs(delta),
            ),
          ),
        );
      }
    }
    for (const [place, weight] of transition.produces) {
      produced.get(place)?.push({ fire, weight });
    }
  }

  update.push(comment(LAND_COMMENT));
  const returns: ReactiveExpr[] = [];
  for (const place of plan.places) {
    if (plan.capped.includes(place.name)) {
      returns.push(ref(fillName(place.name)));
      continue;
    }
    for (const { fire, weight } of produced.get(place.name) ?? []) {
      update.push(
        assign(
          place.name,
          changedWhen(
            fire === null ? null : ref(fire),
            ref(place.name),
            "+",
            weight,
          ),
        ),
      );
    }
    returns.push(ref(place.name));
  }
  return { update, returns };
};

export const lowerMonolithic = (
  plan: StepPlan,
  netName: string,
  header: string,
): ReactiveModuleGraph => {
  const theory = markingTheory(plan);
  const placeVariables: ReactiveVariable[] = plan.places.map((place) => ({
    name: place.name,
    sort: theory === "LRA" ? "real" : "int",
    role: "place",
  }));
  const draws = drawModules(plan);
  const { update, returns } = stepStatements(plan);
  const extl: string[] = [];
  for (const transition of plan.transitions) {
    extl.push(...inputTerms(plan, transition).reads);
  }
  const names = netModuleNames(netName);
  const step: ReactiveModuleDecl = {
    ...names,
    docstring: `${plan.kind === "mixed" ? "Mixed" : plan.stochastic ? "Stochastic" : "Plain"} Petri net with ${plural(plan.places.length, "place")} and ${plural(plan.transitions.length, "transition")}${plan.stochastic ? `, dt = ${floatText(plan.target.dt)}` : ""}. One update is one Petrinaut step.`,
    theory,
    ctrl: plan.places.map((place) => place.name),
    extl,
    init: plan.places.map((place) => num(place.initial)),
    update,
    returns,
  };
  return {
    header,
    variables: [
      ...placeVariables,
      ...inputVariables(plan),
      ...hitVariables(plan),
    ],
    modules: [...draws, step],
    root:
      draws.length === 0
        ? { kind: "single", module: names.instance }
        : {
            kind: "compose",
            modules: [...draws.map((draw) => draw.instance), names.instance],
          },
  };
};
