/**
 * Server-side scenario compilation through the restricted HIR pipeline.
 *
 * `compileScenarioProgram` lowers, typechecks, emits and instantiates every
 * user-code surface of a scenario ONCE (parameter-override expressions,
 * per-place initial-count expressions, the code-mode initial-state body).
 * Only compiler-emitted JavaScript is instantiated — raw manifest text never
 * reaches `new Function` (unlike the editor's sandboxed `compile-scenario.ts`,
 * which this module must not import). The returned program's `evaluate` runs
 * the shared orchestration (`compile-scenario-core.ts`) once per run/trial
 * with the pre-instantiated evaluators, so per-trial evaluation involves no
 * compilation at all.
 *
 * Note: this module (transitively) imports `typescript` — it is exported via
 * the Node-only `compiled-model` entry and must stay out of the main/browser
 * entries, mirroring `compilePetrinautModel`.
 */
import { emitUserFunctionJs } from "../../../hir/emit-js";
import { instantiateHirScenarioEvaluator } from "../../../hir/instantiate";
import { lowerTypeScriptToHir } from "../../../hir/lower-typescript";
import {
  buildScenarioExpressionContext,
  buildScenarioInitContext,
} from "../../../hir/surface-context";
import { typecheckHir } from "../../../hir/typecheck";
import { compileScenarioWithEvaluators } from "./compile-scenario-core";

import type { HirDiagnostic } from "../../../hir/hir";
import type { HirCompiledScenarioEvaluator } from "../../../hir/instantiate";
import type {
  HirScenarioExpressionContext,
  HirScenarioInitContext,
} from "../../../hir/surface-context";
import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type {
  CompileScenarioOutcome,
  ScenarioCompilationError,
  ScenarioEvaluators,
  ScenarioParameterValues,
} from "./compile-scenario-core";

/**
 * A scenario whose user-code surfaces have been compiled and instantiated.
 * `evaluate` behaves exactly like `compileScenario` for the same inputs.
 */
export type CompiledScenarioProgram = {
  evaluate(
    scenarioParameterValues?: ScenarioParameterValues,
  ): CompileScenarioOutcome;
};

export type CompileScenarioProgramOutcome =
  | { ok: true; program: CompiledScenarioProgram }
  | { ok: false; errors: ScenarioCompilationError[] };

type SurfaceCompileResult =
  | { ok: true; evaluator: HirCompiledScenarioEvaluator }
  | { ok: false; reason: string };

function formatDiagnostics(diagnostics: HirDiagnostic[]): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join("; ");
}

function compileSurface(
  code: string,
  surface: "scenarioExpression" | "scenarioInit",
  context: HirScenarioExpressionContext | HirScenarioInitContext,
): SurfaceCompileResult {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    return { ok: false, reason: formatDiagnostics(lowered.diagnostics) };
  }
  const checked = typecheckHir(lowered.fn, context);
  const errors = checked.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    return { ok: false, reason: formatDiagnostics(errors) };
  }
  return {
    ok: true,
    evaluator: instantiateHirScenarioEvaluator(emitUserFunctionJs(lowered.fn)),
  };
}

/**
 * Compiles all user-code surfaces of `scenario` through the HIR pipeline.
 * Code outside the supported TypeScript subset fails here — with one
 * positioned error per offending surface — before anything runs.
 */
export function compileScenarioProgram(
  scenario: Scenario,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
): CompileScenarioProgramOutcome {
  const errors: ScenarioCompilationError[] = [];
  const expressionContext = buildScenarioExpressionContext(
    scenario,
    netParameters,
  );

  // Compile exactly the surfaces the shared orchestration will evaluate,
  // applying its skip rules (unknown parameters, empty text, data rows).

  const overrideEvaluators = new Map<string, HirCompiledScenarioEvaluator>();
  const paramById = new Map(
    netParameters.map((parameter) => [parameter.id, parameter]),
  );
  for (const [paramId, expression] of Object.entries(
    scenario.parameterOverrides,
  )) {
    const param = paramById.get(paramId);
    const trimmed = expression.trim();
    if (!param || trimmed === "") {
      continue;
    }
    const compiled = compileSurface(
      trimmed,
      "scenarioExpression",
      expressionContext,
    );
    if (compiled.ok) {
      overrideEvaluators.set(paramId, compiled.evaluator);
    } else {
      errors.push({
        source: "parameterOverride",
        itemId: paramId,
        message: `Parameter "${param.name}": ${compiled.reason}`,
      });
    }
  }

  const initialExpressionEvaluators = new Map<
    string,
    HirCompiledScenarioEvaluator
  >();
  let initialCodeEvaluator: HirCompiledScenarioEvaluator | null = null;
  if (scenario.initialState.type === "code") {
    const code = scenario.initialState.content.trim();
    if (code !== "") {
      const compiled = compileSurface(
        code,
        "scenarioInit",
        buildScenarioInitContext(scenario, netParameters),
      );
      if (compiled.ok) {
        initialCodeEvaluator = compiled.evaluator;
      } else {
        errors.push({
          source: "initialState",
          itemId: "__code__",
          message: `Initial state code: ${compiled.reason}`,
        });
      }
    }
  } else {
    for (const [placeId, value] of Object.entries(
      scenario.initialState.content,
    )) {
      if (Array.isArray(value)) {
        // Colored token rows are pure data, not code.
        continue;
      }
      const trimmed = value.trim();
      if (trimmed === "") {
        continue;
      }
      const compiled = compileSurface(
        trimmed,
        "scenarioExpression",
        expressionContext,
      );
      if (compiled.ok) {
        initialExpressionEvaluators.set(placeId, compiled.evaluator);
      } else {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}": ${compiled.reason}`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const requireEvaluator = (
    evaluator: HirCompiledScenarioEvaluator | null | undefined,
    what: string,
  ): HirCompiledScenarioEvaluator => {
    if (!evaluator) {
      // Unreachable while the scenario is not mutated between compilation and
      // evaluation: every surface the orchestration asks for was compiled
      // above. Thrown errors surface as per-item compilation errors.
      throw new Error(`No compiled evaluator for ${what}.`);
    }
    return evaluator;
  };

  const evaluators: ScenarioEvaluators = {
    parameterOverride: (paramId, _expression, parameters, scenarioValues) =>
      requireEvaluator(
        overrideEvaluators.get(paramId),
        `the override of parameter "${paramId}"`,
      )(scenarioValues, parameters),
    initialStateExpression: (
      placeId,
      _expression,
      parameters,
      scenarioValues,
    ) =>
      requireEvaluator(
        initialExpressionEvaluators.get(placeId),
        `the initial state of place "${placeId}"`,
      )(scenarioValues, parameters),
    initialStateCode: (_code, parameters, scenarioValues) =>
      requireEvaluator(initialCodeEvaluator, "the initial state code")(
        scenarioValues,
        parameters,
      ),
  };

  return {
    ok: true,
    program: {
      evaluate: (scenarioParameterValues) =>
        compileScenarioWithEvaluators(
          scenario,
          netParameters,
          places,
          types,
          { scenarioParameterValues },
          evaluators,
        ),
    },
  };
}
