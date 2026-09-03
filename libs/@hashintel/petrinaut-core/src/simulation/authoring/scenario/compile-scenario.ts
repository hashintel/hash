import {
  buildScenarioCodeContext,
  buildScenarioExpressionContext,
} from "../../../hir/surface-context";
import { parseParameterValue } from "../../../parameter-values";
import { createUserKeyedRecord, getOwn } from "../../../validation/record-keys";
import {
  compileCodeModeInitialState,
  compilePerPlaceInitialState,
} from "./compile-scenario/initial-state";
import {
  describeValue,
  interpretPreparedItem,
  prepareScenarioItem,
} from "./compile-scenario/prepared-items";

import type { HirInterpretBindings, HirValue } from "../../../hir/interpret";
import type { ScenarioHir } from "../../../hir/scenario";
import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type { InitialMarking, InitialPlaceMarking } from "../../api";
import type { InitialStateOutcome } from "./compile-scenario/initial-state";
import type { PreparedScenarioItem } from "./compile-scenario/prepared-items";

/**
 * A token count for an uncoloured place, or token records keyed by color
 * element name for a coloured one.
 */
export type CompiledPlaceMarking = InitialPlaceMarking;

export interface CompiledScenarioResult {
  /** Resolved parameter values keyed by variable name, as the worker reads them. */
  parameterValues: Record<string, string>;
  /** Resolved initial marking keyed by place id. */
  initialState: InitialMarking;
}

export interface ScenarioCompilationError {
  source: "parameterOverride" | "initialState" | "scenarioParameter";
  /** The parameter or place that failed, or `__code__` for the code block. */
  itemId: string;
  message: string;
}

export type CompileScenarioOutcome =
  | { ok: true; result: CompiledScenarioResult }
  | { ok: false; errors: ScenarioCompilationError[] };

export type ScenarioParameterValues = Record<string, number>;

export interface CompileScenarioOptions {
  /**
   * Concrete scenario parameter values keyed by scenario parameter identifier.
   * When omitted, the scenario's own default values are used.
   */
  scenarioParameterValues?: ScenarioParameterValues;
}

type NetParameterValues = Record<string, number | boolean>;

/**
 * A scenario compiler whose value-independent work is already done.
 *
 * Preparation runs the parts that do not depend on the scenario parameter
 * values — expression contexts, net-parameter default parsing, the lookup
 * maps, and the type check of every override and initial-state item — so a
 * caller compiling the same scenario at many assignments pays them once.
 */
export type PreparedScenarioCompiler = {
  /** `compileScenario` for one concrete assignment of the scenario parameters. */
  compile(
    scenarioParameterValues?: ScenarioParameterValues,
  ): CompileScenarioOutcome;
  /**
   * The resolved net parameter values as the numbers and booleans they
   * evaluated to, without the initial state: an initial-state error does not
   * fail this. The returned record is fresh per call.
   */
  compileParameterNumbers(
    scenarioParameterValues?: ScenarioParameterValues,
  ):
    | { ok: true; parameters: Record<string, number | boolean> }
    | { ok: false; errors: ScenarioCompilationError[] };
};

/** Applies a parameter's type rules to an evaluated override value. */
const coerceOverrideValue = (
  param: Parameter,
  value: HirValue,
): { ok: true; value: number | boolean } | { ok: false; message: string } => {
  if (param.type === "boolean") {
    return typeof value === "boolean"
      ? { ok: true, value }
      : {
          ok: false,
          message: `expression evaluated to ${describeValue(value)}, expected a boolean.`,
        };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      message: `expression evaluated to ${describeValue(value)}, expected a number.`,
    };
  }
  if (param.type === "integer" && !Number.isInteger(value)) {
    return {
      ok: false,
      message: `expression evaluated to ${describeValue(value)}, expected an integer.`,
    };
  }
  return { ok: true, value };
};

/** The worker input format: every resolved value as a string. */
const stringifyParameters = (
  parameters: NetParameterValues,
): Record<string, string> => {
  const parameterValues = createUserKeyedRecord<string>();
  for (const [key, value] of Object.entries(parameters)) {
    parameterValues[key] = String(value);
  }
  return parameterValues;
};

/**
 * Prepares `scenario` for repeated compilation. The inputs are captured and
 * assumed not to mutate; re-prepare after editing the scenario or the net.
 *
 * Evaluation order per `compile` call, each step reading the previous:
 * 1. Scenario parameter defaults build the `scenario` object.
 * 2. Parameter override expressions, evaluated with `{ parameters, scenario }`,
 *    produce the final `parameters` object.
 * 3. Initial state expressions, evaluated with the resolved `{ parameters,
 *    scenario }`, produce the per-place marking.
 *
 * `hir` is the scenario's lowered code (`lowerScenarioToHir`), produced where
 * the TypeScript compiler is available (the LSP worker, or Node).
 */
export const prepareScenarioCompiler = (
  scenario: Scenario,
  hir: ScenarioHir,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
): PreparedScenarioCompiler => {
  const scenarioParameters = scenario.scenarioParameters.filter(
    (sp) => sp.identifier.trim() !== "",
  );

  // A default that does not parse fails identically at every assignment, so
  // its error is precomputed with the template.
  const defaultsTemplate: NetParameterValues = createUserKeyedRecord();
  const defaultErrors: ScenarioCompilationError[] = [];
  for (const param of netParameters) {
    try {
      defaultsTemplate[param.variableName] = parseParameterValue(
        param,
        param.defaultValue,
      );
    } catch (error) {
      defaultErrors.push({
        source: "parameterOverride",
        itemId: param.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Contexts share every model-derived fact; only `expected` varies per item.
  const expressionContext = buildScenarioExpressionContext(
    netParameters,
    scenario.scenarioParameters,
    "real",
  );
  const paramById = new Map(netParameters.map((p) => [p.id, p]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  // Empty expressions keep the default and unknown parameter ids are ignored.
  const preparedOverrides: {
    itemId: string;
    param: Parameter;
    prepared: PreparedScenarioItem;
  }[] = [];
  for (const [paramId, expression] of Object.entries(
    scenario.parameterOverrides,
  )) {
    const param = paramById.get(paramId);
    if (!param || expression.trim() === "") {
      continue;
    }
    preparedOverrides.push({
      itemId: paramId,
      param,
      prepared: prepareScenarioItem(getOwn(hir.parameterOverrides, paramId), {
        ...expressionContext,
        expected: param.type,
      }),
    });
  }

  // Exactly the initial-state items `compile` evaluates: the code block when
  // code mode has content, else each uncoloured place's non-empty expression.
  // An ad-hoc definition lowers to the same code-mode HIR, and its derived
  // scenarioParameters and parameterOverrides live on the scenario itself, so
  // steps 1 and 2 apply them like any other.
  const initialStateSpec = scenario.initialState;
  const hasCode =
    initialStateSpec.type === "adhoc" ||
    (initialStateSpec.type === "code" &&
      initialStateSpec.content.trim() !== "");
  const preparedInitialStateCode: PreparedScenarioItem | null = hasCode
    ? prepareScenarioItem(
        hir.initialStateCode,
        buildScenarioCodeContext(
          netParameters,
          scenario.scenarioParameters,
          places,
          types,
        ),
      )
    : null;
  const preparedPlaceExpressions = new Map<string, PreparedScenarioItem>();
  if (initialStateSpec.type === "per_place") {
    for (const [placeId, value] of Object.entries(initialStateSpec.content)) {
      if (typeof value === "string" && value.trim() !== "") {
        preparedPlaceExpressions.set(
          placeId,
          prepareScenarioItem(
            getOwn(hir.placeExpressions, placeId),
            expressionContext,
          ),
        );
      }
    }
  }

  const placeById = new Map(places.map((p) => [p.id, p]));
  const placeByName = new Map(places.map((p) => [p.name, p]));

  /** Steps 1–2 at one assignment. */
  const evaluateParameters = (
    scenarioParameterValues?: ScenarioParameterValues,
  ): {
    errors: ScenarioCompilationError[];
    parameters: NetParameterValues;
    bindings: HirInterpretBindings;
  } => {
    const errors: ScenarioCompilationError[] = [];

    const scenarioObj: NetParameterValues = createUserKeyedRecord();
    for (const sp of scenarioParameters) {
      const value =
        getOwn(scenarioParameterValues, sp.identifier) ?? sp.default;
      if (!Number.isFinite(value)) {
        errors.push({
          source: "scenarioParameter",
          itemId: sp.identifier,
          message: `Scenario parameter "${sp.identifier}" must be a finite number.`,
        });
        scenarioObj[sp.identifier] =
          sp.type === "boolean" ? sp.default !== 0 : sp.default;
        continue;
      }
      scenarioObj[sp.identifier] = sp.type === "boolean" ? value !== 0 : value;
    }

    const parameters: NetParameterValues = Object.assign(
      createUserKeyedRecord(),
      defaultsTemplate,
    );
    errors.push(...defaultErrors);

    // One binding pair serves every evaluation: the records are mutated in
    // place, so later expressions see earlier overrides.
    const bindings: HirInterpretBindings = {
      parameters,
      scenario: scenarioObj,
    };

    for (const { itemId, param, prepared } of preparedOverrides) {
      const evaluated = interpretPreparedItem(prepared, bindings);
      if (!evaluated.ok) {
        errors.push({
          source: "parameterOverride",
          itemId,
          message: `Parameter "${param.name}": ${evaluated.message}`,
        });
        continue;
      }
      const coerced = coerceOverrideValue(param, evaluated.value);
      if (!coerced.ok) {
        errors.push({
          source: "parameterOverride",
          itemId,
          message: `Parameter "${param.name}" ${coerced.message}`,
        });
        continue;
      }
      parameters[param.variableName] = coerced.value;
    }

    return { errors, parameters, bindings };
  };

  /** Step 3 at one assignment. */
  const evaluateInitialState = (
    bindings: HirInterpretBindings,
  ): InitialStateOutcome => {
    if (initialStateSpec.type === "per_place") {
      return compilePerPlaceInitialState({
        content: initialStateSpec.content,
        preparedExpressions: preparedPlaceExpressions,
        bindings,
        placeById,
        typeById,
      });
    }
    if (preparedInitialStateCode === null) {
      return { marking: createUserKeyedRecord(), errors: [] };
    }
    return compileCodeModeInitialState({
      prepared: preparedInitialStateCode,
      bindings,
      placeByName,
      typeById,
    });
  };

  return {
    compile: (scenarioParameterValues) => {
      const { errors, parameters, bindings } = evaluateParameters(
        scenarioParameterValues,
      );
      const initialState = evaluateInitialState(bindings);
      errors.push(
        ...initialState.errors.map(
          (error): ScenarioCompilationError => ({
            source: "initialState",
            ...error,
          }),
        ),
      );
      if (errors.length > 0) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        result: {
          parameterValues: stringifyParameters(parameters),
          initialState: initialState.marking,
        },
      };
    },
    compileParameterNumbers: (scenarioParameterValues) => {
      const { errors, parameters } = evaluateParameters(
        scenarioParameterValues,
      );
      return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, parameters };
    },
  };
};

/**
 * Compiles a scenario into concrete parameter values and an initial marking.
 *
 * One-shot form of `prepareScenarioCompiler`. Callers compiling the same
 * scenario repeatedly should prepare once.
 */
export const compileScenario = (
  scenario: Scenario,
  hir: ScenarioHir,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
  options: CompileScenarioOptions = {},
): CompileScenarioOutcome =>
  prepareScenarioCompiler(scenario, hir, netParameters, places, types).compile(
    options.scenarioParameterValues,
  );
