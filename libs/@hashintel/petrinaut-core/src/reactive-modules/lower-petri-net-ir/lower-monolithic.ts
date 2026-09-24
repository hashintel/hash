import {
  assign,
  binary,
  changedWhen,
  comment,
  next,
  not,
  num,
  type ReactiveExpr,
  type ReactiveModuleDecl,
  type ReactiveModuleGraph,
  type ReactiveStatement,
  type ReactiveVariable,
  ref,
  scale,
} from "../reactive-module-graph";
import { BindingRefusal, lowerBindings } from "./bindings";
import {
  countExpr,
  layoutInitialValues,
  layoutVariables,
} from "./colour-layout";
import { type Producer, lowerCompaction } from "./compaction";
import { lowerDynamics } from "./dynamics";
import { lowerKernel } from "./kernels";
import {
  fillName,
  fireName,
  kernelDrawName,
  netModuleNames,
  overflowName,
  presentName,
} from "./shared/names";
import {
  drawModules,
  hitVariables,
  inputTerms,
  inputVariables,
  markingTheory,
} from "./shared/step-terms";

import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";
import type { LinearHirEnv } from "./linear-hir";
import type { PlannedTransition, StepPlan } from "./step-plan";

/**
 * The monolithic shape: one module drives every place, and its `update` is
 * one Petrinaut step. Dynamics take their Euler step first; transitions are
 * swept in record order, a firing consumes its input tokens at once,
 * produced tokens land at the end of the step, and a capped place tracks
 * what it would hold if the step ended now so a later producer sees an
 * earlier one's tokens. A coloured place is a bounded set of slots whose
 * survivors close up before the produced tokens land.
 *
 * Under `marking: int` on a stochastic uncoloured net the draw tests move
 * into one LRA module per transition, and the step module reads their Bool
 * flags.
 */

const SWEEP_COMMENT =
  "sweep in order; a firing consumes its input tokens at once";
const LAND_COMMENT = "end of step: produced tokens land";
const FILL_COMMENT = "tokens a capped place would hold if the step ended now";
const DYNAMICS_COMMENT =
  "dynamics first: one Euler step on every present token";

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const floatText = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

type StepBody = {
  update: ReactiveStatement[];
  returns: ReactiveExpr[];
  /** Draw inputs the kernels take, in allocation order. */
  drawVariables: ReactiveVariable[];
  /** Inputs the bindings read, such as exponential draws. */
  bindingInputs: string[];
  /** Coloured places whose produced tokens can overflow their slots. */
  overflowing: string[];
};

/** Draws a kernel takes: a standard normal per Gaussian, a uniform per Uniform with constant bounds. */
const createSampler = (
  transition: PlannedTransition,
  drawVariables: ReactiveVariable[],
): LinearHirEnv["sample"] => {
  let normals = 0;
  let uniforms = 0;
  return (kind, args) => {
    const [first, second] = args;
    if (
      kind === "gaussian" &&
      first?.sort === "number" &&
      second?.expr.kind === "num"
    ) {
      const name = kernelDrawName(transition.name, "z", normals++);
      drawVariables.push({
        name,
        sort: "real",
        role: "input",
        comment: `standard normal draw for ${transition.name}, each step`,
      });
      return binary("+", first.expr, scale(second.expr.value, next(name)));
    }
    if (
      kind === "uniform" &&
      first?.expr.kind === "num" &&
      second?.expr.kind === "num"
    ) {
      const name = kernelDrawName(transition.name, "v", uniforms++);
      drawVariables.push({
        name,
        sort: "real",
        role: "input",
        comment: `uniform draw for ${transition.name}, each step`,
      });
      return binary(
        "+",
        num(first.expr.value),
        scale(second.expr.value - first.expr.value, next(name)),
      );
    }
    return undefined;
  };
};

const refusal = (
  error: unknown,
  item: PetriNetIrDiagnostic["item"],
  errors: PetriNetIrDiagnostic[],
): void => {
  if (error instanceof BindingRefusal) {
    errors.push({ code: error.code, message: error.message, item });
    return;
  }
  throw error;
};

const stepStatements = (
  plan: StepPlan,
  errors: PetriNetIrDiagnostic[],
): StepBody => {
  const capacities = new Map(
    plan.places.map((place) => [place.name, place.capacity]),
  );
  const present = (place: string, slot: number): ReactiveExpr =>
    ref(presentName(place, slot));
  const drawVariables: ReactiveVariable[] = [];
  const bindingInputs: string[] = [];
  const update: ReactiveStatement[] = [];

  // 1. Dynamics, before anything fires.
  const dynamic = plan.places.filter(
    (place) => place.layout !== null && place.dynamics !== null,
  );
  if (dynamic.length > 0) {
    update.push(comment(DYNAMICS_COMMENT));
    for (const place of dynamic) {
      try {
        update.push(
          ...lowerDynamics(place.layout!, place.dynamics!, plan.target.dt),
        );
      } catch (error) {
        refusal(
          error,
          { kind: "place", id: place.name, name: place.name },
          errors,
        );
      }
    }
  }

  // 2. Pending-token trackers for capped places.
  if (plan.capped.length > 0) {
    update.push(comment(FILL_COMMENT));
    for (const place of plan.capped) {
      const layout = plan.layouts.get(place);
      update.push(
        assign(
          fillName(place),
          layout === undefined
            ? ref(place)
            : countExpr(layout, (slot) => present(place, slot)),
        ),
      );
    }
  }
  update.push(comment(SWEEP_COMMENT));

  // 3. The sweep.
  const produced = new Map<string, { fire: string | null; weight: number }[]>(
    plan.places.map((place) => [place.name, []]),
  );
  const colouredProducers = new Map<string, Producer[]>(
    [...plan.layouts.keys()].map((place) => [place, []]),
  );
  for (const transition of plan.transitions) {
    const item = {
      kind: "transition" as const,
      id: transition.name,
      name: transition.name,
    };
    const shared: ReactiveExpr[] = [];
    for (const arc of transition.inputArcs) {
      const layout = plan.layouts.get(arc.place);
      if (layout === undefined) {
        shared.push(
          binary(
            arc.kind === "inhibitor" ? "<" : ">=",
            ref(arc.place),
            num(arc.weight),
          ),
        );
      } else if (arc.kind === "inhibitor") {
        shared.push(
          binary(
            "<",
            countExpr(layout, (slot) => present(arc.place, slot)),
            num(arc.weight),
          ),
        );
      }
    }
    for (const place of plan.capped) {
      const delta = transition.deltas.get(place) ?? 0;
      if (delta > 0) {
        shared.push(
          binary(
            "<=",
            binary("+", ref(fillName(place)), num(delta)),
            num(capacities.get(place) ?? 0),
          ),
        );
      }
    }
    shared.push(...inputTerms(plan, transition).terms);
    const sample = createSampler(transition, drawVariables);

    let bindings;
    try {
      bindings = lowerBindings({
        plan,
        transition,
        sharedTerms: shared,
        present,
        sample,
      });
    } catch (error) {
      refusal(error, item, errors);
      continue;
    }
    bindingInputs.push(...bindings.inputs);
    update.push(...bindings.statements);

    const fire = bindings.fire === null ? null : fireName(transition.name);
    if (bindings.fire === null) {
      update.push(comment(`${transition.description}: always enabled`));
    } else {
      update.push(
        assign(
          fireName(transition.name),
          bindings.fire,
          transition.description,
        ),
      );
    }
    const fireRef = fire === null ? null : ref(fire);

    // Consumption: counts for plain places, present flags for coloured ones.
    for (const [place, weight] of transition.consumes) {
      if (!plan.layouts.has(place)) {
        update.push(
          assign(place, changedWhen(fireRef, ref(place), "-", weight)),
        );
      }
    }
    for (const take of bindings.takes) {
      const taken = take.take === null ? fireRef : ref(take.take);
      const flag = presentName(take.place, take.slot);
      update.push(
        assign(
          flag,
          taken === null ? ref(flag) : binary("&", ref(flag), not(taken)),
        ),
      );
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

    // Production: plain counts land at the end; coloured tokens are computed now, landed later.
    const colouredOutputs = transition.produces.filter(([place]) =>
      plan.layouts.has(place),
    );
    let outs = new Map<string, ReactiveExpr[][]>();
    if (colouredOutputs.length > 0) {
      if (transition.kernel === null) {
        errors.push({
          code: "kernel-missing",
          message: "the transition produces coloured tokens without a kernel",
          item,
        });
      } else {
        try {
          const kernel = lowerKernel(
            plan,
            transition,
            transition.kernel,
            bindings.boundToken,
            sample,
          );
          update.push(...kernel.statements);
          outs = kernel.outs;
        } catch (error) {
          refusal(error, item, errors);
        }
      }
    }
    for (const [place, weight] of transition.produces) {
      if (plan.layouts.has(place)) {
        colouredProducers
          .get(place)
          ?.push({ fire: fireRef, tokens: outs.get(place) ?? [] });
      } else {
        produced.get(place)?.push({ fire, weight });
      }
    }
  }

  // 4. Landing.
  update.push(comment(LAND_COMMENT));
  const returns: ReactiveExpr[] = [];
  const overflowing: string[] = [];
  for (const place of plan.places) {
    if (place.layout !== null) {
      const { statements, overflows } = lowerCompaction(
        place.layout,
        colouredProducers.get(place.name) ?? [],
      );
      update.push(...statements);
      if (overflows) {
        overflowing.push(place.name);
      }
      for (const variable of layoutVariables(place.layout)) {
        returns.push(ref(variable.name));
      }
      continue;
    }
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
  for (const place of overflowing) {
    returns.push(ref(overflowName(place)));
  }
  return { update, returns, drawVariables, bindingInputs, overflowing };
};

export const lowerMonolithic = (
  plan: StepPlan,
  netName: string,
  header: string,
  errors: PetriNetIrDiagnostic[],
): ReactiveModuleGraph => {
  const theory = markingTheory(plan);
  const placeVariables: ReactiveVariable[] = plan.places.flatMap((place) =>
    place.layout === null
      ? [
          {
            name: place.name,
            sort: theory === "LRA" ? "real" : "int",
            role: "place",
          } satisfies ReactiveVariable,
        ]
      : layoutVariables(place.layout),
  );
  const draws = drawModules(plan);
  const { update, returns, drawVariables, bindingInputs, overflowing } =
    stepStatements(plan, errors);
  const extl: string[] = [];
  for (const transition of plan.transitions) {
    extl.push(...inputTerms(plan, transition).reads);
  }
  const exponentialInputs: ReactiveVariable[] = bindingInputs.map((name) => ({
    name,
    sort: "real",
    role: "input",
    comment: `exponential draw for ${name.slice(2)}, each step: -ln(u) / dt`,
  }));
  extl.push(
    ...bindingInputs,
    ...drawVariables.map((variable) => variable.name),
  );
  const overflowVariables: ReactiveVariable[] = overflowing.map((place) => ({
    name: overflowName(place),
    sort: "bool",
    role: "flag",
    comment: `a token produced into ${place} found no free slot, at some step`,
  }));
  const init: ReactiveExpr[] = plan.places.flatMap((place) =>
    place.layout === null
      ? [num(place.initial)]
      : layoutInitialValues(place.layout, place.rows),
  );
  init.push(
    ...overflowing.map(() => ({ kind: "bool", value: false }) as const),
  );
  const names = netModuleNames(netName);
  const colouredCount = plan.layouts.size;
  const kindText =
    plan.kind === "mixed" ? "Mixed" : plan.stochastic ? "Stochastic" : "Plain";
  const step: ReactiveModuleDecl = {
    ...names,
    docstring: `${kindText} ${colouredCount > 0 ? "coloured " : ""}Petri net with ${plural(plan.places.length, "place")}${colouredCount > 0 ? ` (${colouredCount} coloured)` : ""} and ${plural(plan.transitions.length, "transition")}${plan.stochastic || plan.dynamic ? `, dt = ${floatText(plan.target.dt)}` : ""}. One update is one Petrinaut step.`,
    theory,
    ctrl: [
      ...placeVariables.map((variable) => variable.name),
      ...overflowVariables.map((variable) => variable.name),
    ],
    extl,
    init,
    update,
    returns,
  };
  return {
    header,
    variables: [
      ...placeVariables,
      ...inputVariables(plan),
      ...exponentialInputs,
      ...drawVariables,
      ...hitVariables(plan),
      ...overflowVariables,
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
