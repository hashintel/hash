/**
 * Translates a range batch's per-run scenario-parameter draws into per-run
 * net-parameter values.
 *
 * A sweep draws values for *scenario* parameters, but a run's simulation
 * reads *net* parameters: the scenario's `parameterOverrides` expressions
 * connect the two, and they are evaluated host-side. Sending the raw draws
 * (keyed by scenario identifier) to a backend therefore does nothing unless
 * a scenario identifier happens to equal a net parameter's variable name —
 * so each run's draw re-evaluates the overrides, and the run carries the
 * net values that actually differ from the batch's midpoint compilation.
 *
 * A scenario identifier that IS a net variable name keeps working as a
 * direct override, with or without an override expression, matching how
 * the engine has always merged run values by variable name.
 */
import { createCooperativeYielder } from "./cooperative-yield";

import type { SweepRunDraws } from "./sweep-session";
import type { MonteCarloRunConfig } from "@hashintel/petrinaut-core";
import type { ExperimentRunPlan } from "@hashintel/petrinaut-core/experiments";

export type TranslateRangeRunsOptions = {
  /** The batch's runs, keyed by scenario parameter identifier. */
  runs: readonly MonteCarloRunConfig[];
  /** The batch's midpoint scenario values (every swept axis). */
  midValues: Readonly<Record<string, number>>;
  /** Net parameter values the batch compiled at `midValues`. */
  baseParameterValues: Readonly<Record<string, string>>;
  /** Compiles the scenario for one concrete swept assignment. */
  compileForValues: (swept: Readonly<Record<string, number>>) => {
    result: { parameterValues: Record<string, string> };
  };
  /** The net's parameter variable names, for direct-override passthrough. */
  netParameterVariableNames: ReadonlySet<string>;
};

/**
 * Returns runs whose `parameterValues` are keyed by net parameter variable
 * name, or undefined when no run ends up overriding anything (the whole
 * batch behaves as the midpoint compilation).
 *
 * Every returned run carries the SAME key set — the union of every name any
 * run's draws changed — with runs whose draw compiles back to a base value
 * carrying that base value explicitly. Backends lay per-run values out in
 * one uniform buffer, and a batch whose runs override different names (an
 * integer axis rounding a draw onto the midpoint, say) would otherwise be
 * refused — or, worse, keyed off a first run that happened to change
 * nothing and silently dropped.
 */
export function translateRangeRuns(
  options: TranslateRangeRunsOptions,
): MonteCarloRunConfig[] | undefined {
  const {
    runs,
    midValues,
    baseParameterValues,
    compileForValues,
    netParameterVariableNames,
  } = options;

  // Pass 1: compile each run's draws and collect which net names any run
  // actually changes (plus direct net-name draws).
  const compiledRuns = runs.map((run) => {
    const draws = run.parameterValues ?? {};
    const numericDraws: Record<string, number> = {};
    for (const [identifier, value] of Object.entries(draws)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numericDraws[identifier] = parsed;
      }
    }
    return {
      draws,
      compiledValues: compileForValues({ ...midValues, ...numericDraws }).result
        .parameterValues,
    };
  });

  const overriddenNames = new Set<string>();
  for (const { draws, compiledValues } of compiledRuns) {
    for (const [name, value] of Object.entries(compiledValues)) {
      if (baseParameterValues[name] !== value) {
        overriddenNames.add(name);
      }
    }
    for (const [identifier, value] of Object.entries(draws)) {
      if (
        netParameterVariableNames.has(identifier) &&
        baseParameterValues[identifier] !== value
      ) {
        overriddenNames.add(identifier);
      }
    }
  }
  if (overriddenNames.size === 0) {
    return undefined;
  }

  // Pass 2: every run supplies every overridden name.
  const names = [...overriddenNames].sort();
  return compiledRuns.map(({ draws, compiledValues }) => {
    const parameterValues: Record<string, string> = {};
    for (const name of names) {
      // A direct net-name draw wins only where no override expression
      // computed the name, matching how the engine merges run values.
      const direct =
        netParameterVariableNames.has(name) && draws[name] !== undefined
          ? draws[name]
          : undefined;
      parameterValues[name] =
        compiledValues[name] !== undefined &&
        compiledValues[name] !== baseParameterValues[name]
          ? compiledValues[name]
          : (direct ?? compiledValues[name] ?? baseParameterValues[name] ?? "");
    }
    return { parameterValues };
  });
}

export type TranslateRangeDrawsOptions = {
  /** The batch's per-run draws, keyed by scenario parameter identifier. */
  draws: SweepRunDraws;
  /** Aborts the translation at the next yield point (a superseded batch). */
  signal?: { readonly aborted: boolean };
  /** The batch's midpoint scenario values (every swept axis). */
  midValues: Readonly<Record<string, number>>;
  /** Net parameter values the batch compiled at `midValues`, as numbers. */
  baseParameters: Readonly<Record<string, number | boolean>>;
  /** Compiles the scenario for one concrete swept assignment, as numbers. */
  compileRunNumbers: (swept: Readonly<Record<string, number>>) => {
    parameters: Readonly<Record<string, number | boolean>>;
  };
  /** The net's parameter variable names, for direct-override passthrough. */
  netParameterVariableNames: ReadonlySet<string>;
};

/**
 * The record-form fallback: expands the draws and delegates to
 * `translateRangeRuns`, whose string values carry what a numeric plan
 * cannot.
 */
async function translateRangeDrawsAsRuns(
  options: TranslateRangeDrawsOptions,
): Promise<TranslatedRangeDraws> {
  const { draws, midValues, baseParameters, netParameterVariableNames } =
    options;
  const width = draws.identifiers.length;
  const runCount = draws.values.length / width;
  const runs: MonteCarloRunConfig[] = Array.from(
    { length: runCount },
    (_, run) => {
      const parameterValues: Record<string, string> = {};
      for (let column = 0; column < width; column++) {
        parameterValues[draws.identifiers[column]!] = String(
          draws.values[run * width + column],
        );
      }
      return { parameterValues };
    },
  );
  const baseParameterValues: Record<string, string> = {};
  for (const [name, value] of Object.entries(baseParameters)) {
    baseParameterValues[name] = String(value);
  }
  const translated = translateRangeRuns({
    runs,
    midValues,
    baseParameterValues,
    compileForValues: (swept) => {
      const { parameters } = options.compileRunNumbers(swept);
      const parameterValues: Record<string, string> = {};
      for (const [name, value] of Object.entries(parameters)) {
        parameterValues[name] = String(value);
      }
      return { result: { parameterValues } };
    },
    netParameterVariableNames,
  });
  return translated === undefined
    ? undefined
    : { kind: "runs", runs: translated };
}

export type TranslatedRangeDraws =
  | { kind: "plan"; plan: ExperimentRunPlan }
  | { kind: "runs"; runs: MonteCarloRunConfig[] }
  | undefined;

/**
 * `translateRangeRuns` over typed-array draws, producing a typed-array plan.
 *
 * Same semantics: each run's draws re-evaluate the scenario's overrides, the
 * plan carries the union of every name any run changed (runs at a base value
 * carry it explicitly — one uniform layout), a draw naming a net parameter
 * passes through directly where no override computed that name, and nothing
 * changing means no plan. The difference is shape: per-run records and
 * strings were the second-largest main-thread cost of a million-run batch,
 * and a plan is columns of doubles filled in place.
 *
 * A changed value that is not a number (a boolean override reading a swept
 * value) cannot ride a numeric plan; those batches fall back to the record
 * form via `translateRangeRuns`.
 */
export async function translateRangeDraws(
  options: TranslateRangeDrawsOptions,
): Promise<TranslatedRangeDraws> {
  const {
    draws,
    midValues,
    baseParameters,
    compileRunNumbers,
    netParameterVariableNames,
  } = options;
  const width = draws.identifiers.length;
  const runCount = width === 0 ? 0 : draws.values.length / width;
  if (runCount === 0) {
    return undefined;
  }

  // One column per net name some run changes, pre-filled with the base value
  // so runs that draw the base carry it without a separate fill pass.
  const columns = new Map<string, Float64Array>();
  const columnFor = (name: string, base: number): Float64Array => {
    let column = columns.get(name);
    if (column === undefined) {
      column = new Float64Array(runCount).fill(base);
      columns.set(name, column);
    }
    return column;
  };

  // The parameter record's key set is identical across compiles (the same
  // defaults template seeds every call), so the keys are read once.
  let parameterNames: readonly string[] | null = null;

  const yielder = createCooperativeYielder();
  const swept: Record<string, number> = { ...midValues };
  for (let run = 0; run < runCount; run++) {
    // A tighter stride than the draw loop's: an iteration here is a scenario
    // compile, not a few array writes. The abort check is independent of the
    // yield, which a hidden document skips.
    if (run % 256 === 0) {
      if (options.signal?.aborted) {
        const aborted = new Error("The batch was aborted.");
        aborted.name = "AbortError";
        throw aborted;
      }
      if (yielder.shouldYield()) {
        await yielder.yieldNow();
      }
    }
    for (let column = 0; column < width; column++) {
      swept[draws.identifiers[column]!] = draws.values[run * width + column]!;
    }
    const { parameters } = compileRunNumbers(swept);
    parameterNames ??= Object.keys(parameters);
    for (const name of parameterNames) {
      const value = parameters[name];
      const base = baseParameters[name];
      if (value === base) {
        continue;
      }
      if (typeof value !== "number" || typeof base !== "number") {
        return await translateRangeDrawsAsRuns(options);
      }
      columnFor(name, base)[run] = value;
    }
    // A direct net-name draw wins only where no override expression computed
    // the name, matching how the engine merges run values.
    for (let column = 0; column < width; column++) {
      const identifier = draws.identifiers[column]!;
      if (!netParameterVariableNames.has(identifier)) {
        continue;
      }
      const draw = draws.values[run * width + column]!;
      const base = baseParameters[identifier];
      if (typeof base !== "number") {
        // A draw aimed at a boolean net parameter cannot ride a numeric
        // plan. The record form carries the raw draw, and the engine then
        // refuses it loudly — silently dropping it here would show a swept
        // axis that has no effect.
        return await translateRangeDrawsAsRuns(options);
      }
      if (draw === base) {
        continue;
      }
      const target = columnFor(identifier, base);
      if (target[run] === base) {
        target[run] = draw;
      }
    }
  }

  if (columns.size === 0) {
    return undefined;
  }

  const ids = [...columns.keys()].sort();
  const values = new Float64Array(runCount * ids.length);
  for (const [index, id] of ids.entries()) {
    if (yielder.shouldYield()) {
      await yielder.yieldNow();
    }
    const column = columns.get(id)!;
    for (let run = 0; run < runCount; run++) {
      values[run * ids.length + index] = column[run]!;
    }
  }
  return { kind: "plan", plan: { ids, values } };
}
