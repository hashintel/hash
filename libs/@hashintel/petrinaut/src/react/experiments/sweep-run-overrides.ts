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

  const translated = runs.map((run) => {
    const draws = run.parameterValues ?? {};
    const numericDraws: Record<string, number> = {};
    for (const [identifier, value] of Object.entries(draws)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numericDraws[identifier] = parsed;
      }
    }

    const compiled = compileForValues({ ...midValues, ...numericDraws });
    const parameterValues: Record<string, string> = {};
    for (const [name, value] of Object.entries(
      compiled.result.parameterValues,
    )) {
      if (baseParameterValues[name] !== value) {
        parameterValues[name] = value;
      }
    }
    // Draw identifiers that are net variable names override directly, the
    // way run values have always merged — unless an override expression
    // already produced a value for that name.
    for (const [identifier, value] of Object.entries(draws)) {
      if (
        netParameterVariableNames.has(identifier) &&
        parameterValues[identifier] === undefined &&
        baseParameterValues[identifier] !== value
      ) {
        parameterValues[identifier] = value;
      }
    }

    return { parameterValues };
  });

  const anyOverrides = translated.some(
    (run) => Object.keys(run.parameterValues).length > 0,
  );
  return anyOverrides ? translated : undefined;
}
