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
import type { MonteCarloRunConfig } from "@hashintel/petrinaut-core";

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
