/**
 * Translates a range batch's per-run scenario-parameter draws into a per-run
 * net-parameter plan.
 *
 * A sweep draws values for *scenario* parameters, but a run's simulation
 * reads *net* parameters: the scenario's `parameterOverrides` expressions
 * connect the two, and they are evaluated host-side. Each run's draw
 * therefore re-evaluates the overrides, and the plan carries the net values
 * that differ from the batch's midpoint compilation.
 *
 * A scenario identifier that IS a net variable name passes through as a
 * direct override where no override expression computed that name, matching
 * how the engine merges run values by variable name.
 */
import { createCooperativeYielder } from "../../cooperative-yield";

import type { SweepRunDraws } from "../../sweep-session";
import type { ExperimentRunPlan } from "@hashintel/petrinaut-core/experiments";

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

/** Booleans ride the plan as 1/0; the engine parses them back by type. */
const planNumber = (value: number | boolean): number =>
  typeof value === "boolean" ? (value ? 1 : 0) : value;

/**
 * Returns a run-major plan over the union of every net name any run
 * changes, or undefined when no run changes anything (the whole batch
 * behaves as the midpoint compilation).
 *
 * Every run carries every id in the plan — a run whose draw compiles back
 * to a base value carries that base value explicitly. Backends lay per-run
 * values out in one uniform buffer, and a batch whose runs override
 * different names (an integer axis rounding a draw onto the midpoint, say)
 * would otherwise be refused or, worse, keyed off a first run that changed
 * nothing and silently dropped.
 */
export const translateRangeDraws = async (
  options: TranslateRangeDrawsOptions,
): Promise<ExperimentRunPlan | undefined> => {
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
      if (value === undefined || base === undefined || value === base) {
        continue;
      }
      columnFor(name, planNumber(base))[run] = planNumber(value);
    }
    // A direct net-name draw wins only where no override expression computed
    // the name. A draw onto a boolean parameter rides the plan as drawn and
    // the engine refuses anything but 0/1 — silently dropping it here would
    // show a swept axis that has no effect.
    for (let column = 0; column < width; column++) {
      const identifier = draws.identifiers[column]!;
      const base = baseParameters[identifier];
      if (!netParameterVariableNames.has(identifier) || base === undefined) {
        continue;
      }
      const draw = draws.values[run * width + column]!;
      const baseNumber = planNumber(base);
      if (draw === baseNumber) {
        continue;
      }
      const target = columnFor(identifier, baseNumber);
      if (target[run] === baseNumber) {
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
  return { ids, values };
};
