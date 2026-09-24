import {
  assign,
  binary,
  conjunction,
  disjunction,
  ite,
  next,
  not,
  type ReactiveExpr,
  type ReactiveStatement,
  ref,
} from "../reactive-module-graph";
import { slotToken } from "./colour-layout";
import {
  type LinearHirEnv,
  LinearHirRefusal,
  type TokenBinding,
  translateGuard,
  translateRate,
} from "./linear-hir";
import {
  bindName,
  enabledName,
  exponentialDrawName,
  presentName,
  seenName,
  selectName,
  takeName,
} from "./shared/names";

import type { HirFunction } from "../../hir/hir";
import type { PlannedArc, PlannedTransition, StepPlan } from "./step-plan";

/**
 * A transition's bindings: which tokens of its coloured input places it
 * takes, in the order the engine tries them. The engine enumerates the
 * combinations of token indices per arc, ascending and lexicographic, with
 * the last arc advancing fastest, and fires the first one whose guard holds.
 * Here every combination gets a Bool, the first passing one is selected with
 * an exclusion chain, and a bound attribute the kernel reads is the `ite`
 * chain over the selections.
 *
 * Because present slots form a dense prefix and consumption only clears
 * flags in slot order, the k-th present slot is the engine's index k.
 */

export type Bindings = {
  statements: ReactiveStatement[];
  /** The firing condition, or `null` when nothing can stop the firing. */
  fire: ReactiveExpr | null;
  /** Slots the firing consumes, with the Bool that says so; `null` means the firing itself. */
  takes: { place: string; slot: number; take: string | null }[];
  /** `input.<Place>[index]` as the kernel sees it: the bound token's attributes. */
  boundToken: (place: string, index: number) => TokenBinding | undefined;
  /** Inputs the bindings read, such as the exponential draw. */
  inputs: string[];
};

export type BindingsContext = {
  plan: StepPlan;
  transition: PlannedTransition;
  /** Terms every combination shares: counts, capacities, the draw or choice. */
  sharedTerms: ReactiveExpr[];
  /** The present flag of a slot as the sweep has left it so far. */
  present: (place: string, slot: number) => ReactiveExpr;
  sample: LinearHirEnv["sample"];
};

/** Ascending k-subsets of 0..n-1 in lexicographic order. */
const combinations = (count: number, size: number): number[][] => {
  const result: number[][] = [];
  const build = (start: number, chosen: number[]): void => {
    if (chosen.length === size) {
      result.push([...chosen]);
      return;
    }
    for (let slot = start; slot < count; slot++) {
      chosen.push(slot);
      build(slot + 1, chosen);
      chosen.pop();
    }
  };
  build(0, []);
  return result;
};

/** The cartesian product in arc order, the last arc advancing fastest. */
const product = (perArc: number[][][]): number[][][] =>
  perArc.reduce<number[][][]>(
    (acc, tuples) =>
      acc.flatMap((prefix) => tuples.map((tuple) => [...prefix, tuple])),
    [[]],
  );

/** The arcs whose tokens carry attributes and are bound: coloured, not inhibiting. */
const bindingArcs = (
  plan: StepPlan,
  transition: PlannedTransition,
): PlannedArc[] =>
  transition.inputArcs.filter(
    (arc) => arc.kind !== "inhibitor" && plan.layouts.has(arc.place),
  );

const envFor = (
  context: BindingsContext,
  arcs: PlannedArc[],
  combination: number[][],
  inputName = "input",
): LinearHirEnv => ({
  inputName,
  token: (place, index) => {
    const position = arcs.findIndex((arc) => arc.place === place);
    const layout = context.plan.layouts.get(place);
    const slot = combination[position]?.[index];
    return position === -1 || layout === undefined || slot === undefined
      ? undefined
      : slotToken(layout, slot);
  },
  tokenCount: (place) =>
    context.transition.inputArcs.find(
      (arc) => arc.place === place && arc.kind !== "inhibitor",
    )?.weight,
  sample: context.sample,
});

/** A refusal of the transition's own code, positioned on the item. */
export class BindingRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Runs a translation, naming the surface a refusal comes from. */
const withRefusal = <T>(surface: "guard" | "rate", compute: () => T): T => {
  try {
    return compute();
  } catch (error) {
    if (error instanceof LinearHirRefusal) {
      throw new BindingRefusal(
        error.code,
        `In the ${surface}, ${error.message}`,
      );
    }
    throw error;
  }
};

/** The guard or rate test of one combination, or `null` when the code reads nothing. */
const lambdaTerm = (
  context: BindingsContext,
  env: LinearHirEnv,
): ReactiveExpr | null => {
  const { transition } = context;
  const named = (fn: HirFunction): LinearHirEnv => ({
    ...env,
    inputName: fn.params[0]?.name ?? env.inputName,
  });
  if (transition.guard !== null) {
    const guard = transition.guard;
    return withRefusal("guard", () => translateGuard(guard, named(guard)));
  }
  if (transition.rateCode !== null) {
    const rate = transition.rateCode;
    // exp(-rate * dt) <= u  is  rate >= -ln(u) / dt, the exponential draw.
    return withRefusal("rate", () =>
      binary(
        ">=",
        translateRate(rate, named(rate)),
        next(exponentialDrawName(transition.name)),
      ),
    );
  }
  return null;
};

export const lowerBindings = (context: BindingsContext): Bindings => {
  const { plan, transition } = context;
  const arcs = bindingArcs(plan, transition);
  const perArc = arcs.map((arc) =>
    combinations(plan.layouts.get(arc.place)?.slots ?? 0, arc.weight),
  );
  const tuples = product(perArc);
  if (tuples.length > 4096) {
    throw new BindingRefusal(
      "binding-explosion",
      `${tuples.length} token combinations to try; the module would be too large`,
    );
  }
  const inputs =
    transition.rateCode === null ? [] : [exponentialDrawName(transition.name)];
  const statements: ReactiveStatement[] = [];
  const shared = conjunction(context.sharedTerms);

  const presenceTerms = (combination: number[][]): ReactiveExpr[] =>
    arcs.flatMap((arc, position) =>
      (combination[position] ?? []).map((slot) =>
        context.present(arc.place, slot),
      ),
    );

  // One combination: the firing is the conjunction, with no selection chain.
  if (tuples.length === 1) {
    const [combination] = tuples;
    const env = envFor(context, arcs, combination ?? []);
    const lambda = lambdaTerm(context, env);
    const fire = conjunction([
      ...(shared === null ? [] : [shared]),
      ...presenceTerms(combination ?? []),
      ...(lambda === null ? [] : [lambda]),
    ]);
    const takes = arcs.flatMap((arc, position) =>
      arc.kind === "standard"
        ? (combination?.[position] ?? []).map((slot) => ({
            place: arc.place,
            slot,
            take: null,
          }))
        : [],
    );
    return {
      statements,
      fire,
      takes,
      boundToken: (place, index) =>
        envFor(context, arcs, combination ?? []).token(place, index),
      inputs,
    };
  }

  // Several combinations: shared terms once, one Bool per combination, first match wins.
  const enabled = enabledName(transition.name);
  if (shared !== null) {
    statements.push(assign(enabled, shared, "every combination needs this"));
  }
  const seen = seenName(transition.name);
  tuples.forEach((combination, index) => {
    const env = envFor(context, arcs, combination);
    const lambda = lambdaTerm(context, env);
    const terms = [
      ...(shared === null ? [] : [ref(enabled)]),
      ...presenceTerms(combination),
      ...(lambda === null ? [] : [lambda]),
    ];
    const described = arcs
      .map(
        (arc, position) =>
          `${arc.place}[${(combination[position] ?? []).join(", ")}]`,
      )
      .join(" ");
    statements.push(
      assign(
        bindName(transition.name, index),
        conjunction(terms) ?? ref(enabled),
        described,
      ),
    );
    if (index === 0) {
      statements.push(
        assign(
          selectName(transition.name, 0),
          ref(bindName(transition.name, 0)),
        ),
      );
      statements.push(assign(seen, ref(bindName(transition.name, 0))));
    } else {
      statements.push(
        assign(
          selectName(transition.name, index),
          binary("&", ref(bindName(transition.name, index)), not(ref(seen))),
        ),
      );
      statements.push(
        assign(
          seen,
          binary("|", ref(seen), ref(bindName(transition.name, index))),
        ),
      );
    }
  });

  const takes: Bindings["takes"] = [];
  arcs.forEach((arc, position) => {
    if (arc.kind !== "standard") {
      return;
    }
    const slots = new Set(
      tuples.flatMap((combination) => combination[position] ?? []),
    );
    for (const slot of [...slots].toSorted((left, right) => left - right)) {
      const selections = tuples
        .map((combination, index) => ({ combination, index }))
        .filter(({ combination }) =>
          (combination[position] ?? []).includes(slot),
        )
        .map(({ index }) => ref(selectName(transition.name, index)));
      const take = takeName(transition.name, arc.place, slot);
      statements.push(assign(take, disjunction(selections) ?? ref(seen)));
      takes.push({ place: arc.place, slot, take });
    }
  });

  const boundToken = (
    place: string,
    index: number,
  ): TokenBinding | undefined => {
    const position = arcs.findIndex((arc) => arc.place === place);
    const layout = plan.layouts.get(place);
    if (position === -1 || layout === undefined) {
      return undefined;
    }
    const slots = tuples.map((combination) => combination[position]?.[index]);
    if (slots.some((slot) => slot === undefined)) {
      return undefined;
    }
    return slotToken(layout, 0, (attribute) => {
      // The chosen combination's slot, first match first; the last stands unguarded.
      let chain: ReactiveExpr | null = null;
      for (let choice = tuples.length - 1; choice >= 0; choice--) {
        const slot = slots[choice] ?? 0;
        const value = slotToken(layout, slot).attribute(attribute.name);
        const expr =
          value !== undefined && !("refused" in value) ? value.expr : ref("_");
        chain =
          chain === null
            ? expr
            : ite(ref(selectName(transition.name, choice)), expr, chain);
      }
      return chain ?? ref(presentName(place, 0));
    });
  };

  return { statements, fire: ref(seen), takes, boundToken, inputs };
};
