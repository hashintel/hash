/**
 * Editor-side scenario compilation: evaluates a scenario's user-code
 * surfaces with sandboxed `new Function` (see `sandbox.ts` — defense in
 * depth, not an isolation boundary). Server-side execution must use the HIR
 * program in `compile-scenario-program.ts` instead, which never passes raw
 * user text to `new Function`. The shared orchestration (evaluation order,
 * validation, coercion, error shapes) lives in `compile-scenario-core.ts`.
 */
import { runSandboxed, SHADOWED_GLOBALS } from "../sandbox";
import { compileScenarioWithEvaluators } from "./compile-scenario-core";

import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type {
  CompileScenarioOptions,
  CompileScenarioOutcome,
  NetParameterValues,
  ScenarioEvaluators,
} from "./compile-scenario-core";

export type {
  CompiledPlaceMarking,
  CompiledScenarioResult,
  CompileScenarioOptions,
  CompileScenarioOutcome,
  ScenarioCompilationError,
  ScenarioParameterValues,
} from "./compile-scenario-core";

// -- Hardened expression evaluator --------------------------------------------

/**
 * Wrap a plain object in a prototype-less, frozen copy.
 * Severs the prototype chain so `obj.constructor.constructor("return globalThis")()`
 * cannot escape to globals.
 */
function createSafeObject<T extends NetParameterValues>(obj: T): T {
  return Object.freeze(Object.assign(Object.create(null), obj));
}

/**
 * Evaluate a single JavaScript expression with `parameters` and `scenario`
 * in scope. Returns the result or throws with a descriptive message.
 *
 * Hardening:
 * - Strict mode (`this === undefined`)
 * - Prototype-less frozen objects (blocks `.constructor` chain walk on args)
 * - Dangerous globals shadowed with `var` declarations
 * - `.constructor` temporarily blocked on built-in prototypes (see
 *   `runSandboxed`) so literal-based constructor walks also fail.
 */
function evaluateExpression(
  expression: string,
  parameters: NetParameterValues,
  scenario: NetParameterValues,
): unknown {
  // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored expressions
  const fn = new Function(
    "parameters",
    "scenario",
    `"use strict"; var ${SHADOWED_GLOBALS}; return (${expression});`,
  ) as (p: NetParameterValues, s: NetParameterValues) => unknown;
  return runSandboxed(() =>
    fn(createSafeObject(parameters), createSafeObject(scenario)),
  );
}

const sandboxEvaluators: ScenarioEvaluators = {
  parameterOverride: (_paramId, expression, parameters, scenario) =>
    evaluateExpression(expression, parameters, scenario),
  initialStateExpression: (_placeId, expression, parameters, scenario) =>
    evaluateExpression(expression, parameters, scenario),
  initialStateCode: (code, parameters, scenario) => {
    // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored code
    const fn = new Function(
      "parameters",
      "scenario",
      `"use strict"; var ${SHADOWED_GLOBALS}; ${code}`,
    ) as (p: NetParameterValues, s: NetParameterValues) => unknown;
    return runSandboxed(() =>
      fn(createSafeObject(parameters), createSafeObject(scenario)),
    );
  },
};

// -- Compiler -----------------------------------------------------------------

/**
 * Compile a scenario into concrete parameter values and initial token counts.
 *
 * Evaluation order (dependencies flow top-down):
 * 1. Scenario parameter defaults → builds the `scenario` object
 * 2. Parameter overrides → each expression evaluated with `{ parameters, scenario }`
 *    → produces the final `parameters` object
 * 3. Initial state expressions → each evaluated with the resolved `{ parameters, scenario }`
 *    → produces per-place token counts
 *
 * @param scenario - The scenario to compile
 * @param netParameters - The net-level parameter definitions (for defaults and variable names)
 * @param places - All places in the SDCPN (needed for code-mode name→ID mapping)
 * @param types - All color types (needed for code-mode token flattening)
 */
export function compileScenario(
  scenario: Scenario,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
  options: CompileScenarioOptions = {},
): CompileScenarioOutcome {
  return compileScenarioWithEvaluators(
    scenario,
    netParameters,
    places,
    types,
    options,
    sandboxEvaluators,
  );
}
