import { HirInterpretError, interpretHir } from "../../../hir/interpret";
import {
  buildScenarioCodeContext,
  buildScenarioExpressionContext,
} from "../../../hir/surface-context";
import { typecheckHir } from "../../../hir/typecheck";
import { parseParameterValue } from "../../../parameter-values";
import { createUserKeyedRecord, getOwn } from "../../../validation/record-keys";
import { coerceTokenRecord } from "../../engine/token-values";
import { TYPE_POLICIES } from "../../engine/type-policies";

import type { HirInterpretBindings, HirValue } from "../../../hir/interpret";
import type { ScenarioHir, ScenarioHirItem } from "../../../hir/scenario";
import type { HirSurfaceContext } from "../../../hir/surface-context";
import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type {
  InitialMarking,
  InitialPlaceMarking,
  InitialTokenAttributeValue,
} from "../../api";

// -- Result types -------------------------------------------------------------

/**
 * Compiled initial state entry for a single place.
 * - Uncolored places: token count number.
 * - Colored places: array of token records keyed by color element name.
 */
export type CompiledPlaceMarking = InitialPlaceMarking;

export interface CompiledScenarioResult {
  /**
   * Resolved parameter values keyed by variableName (matches the format
   * expected by the simulation worker).
   */
  parameterValues: Record<string, string>;
  /**
   * Resolved initial marking keyed by place ID.
   */
  initialState: InitialMarking;
}

export interface ScenarioCompilationError {
  /** Which field failed: "parameterOverride", "initialState", or "scenarioParameter" */
  source: "parameterOverride" | "initialState" | "scenarioParameter";
  /** ID of the parameter or place that failed */
  itemId: string;
  /** Human-readable error message */
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

// -- HIR evaluation -----------------------------------------------------------

type NetParameterValues = Record<string, number | boolean>;

/**
 * One lowered scenario item after the value-independent half of its
 * evaluation: staleness, lowering diagnostics and the type check depend only
 * on the item and the net, so a prepared compiler runs them once and each
 * per-call evaluation only interprets.
 */
type PreparedScenarioItem =
  | { ok: true; fn: Extract<ScenarioHirItem, { ok: true }>["fn"] }
  | { ok: false; message: string };

/**
 * Type-checks one lowered scenario item against the net, or explains why it
 * cannot run. Lowering happens elsewhere (`lowerScenarioToHir`); this half is
 * pure, free of the TypeScript compiler, and independent of the values the
 * item will be evaluated at.
 */
function prepareScenarioItem(
  item: ScenarioHirItem | undefined,
  context: HirSurfaceContext,
): PreparedScenarioItem {
  if (item === undefined) {
    return {
      ok: false,
      message:
        "This scenario code has not been compiled — the lowered scenario is stale. Recompile it from the current scenario.",
    };
  }
  if (!item.ok) {
    return {
      ok: false,
      message: item.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("\n"),
    };
  }
  const checked = typecheckHir(item.fn, context);
  const errors = checked.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    return {
      ok: false,
      message: errors.map((diagnostic) => diagnostic.message).join("\n"),
    };
  }
  return { ok: true, fn: item.fn };
}

/** Interprets a prepared item at one set of bindings. */
function interpretPreparedItem(
  prepared: PreparedScenarioItem,
  bindings: HirInterpretBindings,
): { ok: true; value: HirValue } | { ok: false; message: string } {
  if (!prepared.ok) {
    return prepared;
  }
  try {
    return { ok: true, value: interpretHir(prepared.fn, bindings) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof HirInterpretError || error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

/** Renders an interpreted value for an error message. */
function describeValue(value: HirValue): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Applies a parameter's type rules to an evaluated override value. */
function coerceOverrideValue(
  param: Parameter,
  value: HirValue,
): { ok: true; value: number | boolean } | { ok: false; message: string } {
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
}

type MarkingTokenRecord = Record<string, InitialTokenAttributeValue>;

/**
 * Coerces one raw token source through the runtime codec, then converts each
 * attribute to its at-rest form (uuid bigints become canonical lowercase
 * strings) so the compiled initial state stays JSON-serializable. Arbitrary
 * uuid inputs (free text, numbers) are normalized deterministically via
 * `toUuid` inside `coerceTokenRecord`.
 */
function compileTokenRecord(
  source: Record<string, unknown>,
  elements: Color["elements"],
): MarkingTokenRecord {
  const coerced = coerceTokenRecord(
    source,
    elements,
    "Scenario initial state token",
  );
  // Element names come from the net definition: no prototype.
  const token = createUserKeyedRecord<InitialTokenAttributeValue>();
  for (const element of elements) {
    token[element.name] = TYPE_POLICIES[element.type].encodeAtRest(
      coerced[element.name]!,
    );
  }
  return token;
}

function tokenRecordsFromRows(
  rows: readonly (number | boolean | string)[][],
  elements: Color["elements"],
): MarkingTokenRecord[] {
  return rows.map((row) => {
    const token = createUserKeyedRecord<unknown>();
    for (let i = 0; i < elements.length; i++) {
      token[elements[i]!.name] = row[i];
    }
    return compileTokenRecord(token, elements);
  });
}

function normalizeTokenRecords(
  tokens: unknown[],
  elements: Color["elements"],
): MarkingTokenRecord[] {
  return tokens.flatMap((rawToken) => {
    if (
      typeof rawToken !== "object" ||
      rawToken === null ||
      Array.isArray(rawToken)
    ) {
      return [];
    }

    const source = rawToken as Record<string, unknown>;
    return [compileTokenRecord(source, elements)];
  });
}

// -- Initial state ------------------------------------------------------------

/**
 * Evaluates a code-mode initial state body: it returns a record keyed by
 * place NAME (not ID), with numbers for uncoloured places and token-record
 * arrays for coloured ones. Writes into `initialState`; failures land in
 * `errors`.
 */
function compileCodeModeInitialState(args: {
  prepared: PreparedScenarioItem;
  bindings: HirInterpretBindings;
  placeByName: ReadonlyMap<string, Place>;
  typeById: ReadonlyMap<string, Color>;
  initialState: InitialMarking;
  errors: ScenarioCompilationError[];
}): void {
  const { bindings, errors, initialState, placeByName, prepared, typeById } =
    args;
  const evaluated = interpretPreparedItem(prepared, bindings);
  if (!evaluated.ok) {
    errors.push({
      source: "initialState",
      itemId: "__code__",
      message: `Initial state code: ${evaluated.message}`,
    });
    return;
  }
  if (typeof evaluated.value !== "object" || Array.isArray(evaluated.value)) {
    errors.push({
      source: "initialState",
      itemId: "__code__",
      message: `Initial state code must return an object, got ${typeof evaluated.value}.`,
    });
    return;
  }
  for (const [placeName, tokens] of Object.entries(evaluated.value)) {
    const place = placeByName.get(placeName);
    if (!place) {
      // Reported at evaluation as well as by the type checker: the checker
      // cannot see keys when the inferred return type collapses to unknown
      // (e.g. a ternary whose branches return different records).
      errors.push({
        source: "initialState",
        itemId: "__code__",
        message: `Initial state code returned \`${placeName}\`, which is not a place in this net.`,
      });
      continue;
    }

    if (typeof tokens === "number") {
      // Uncolored place: just a token count
      initialState[place.id] = Math.max(0, Math.round(tokens));
    } else if (Array.isArray(tokens)) {
      // Colored place: array of token objects.
      const color = place.colorId ? typeById.get(place.colorId) : undefined;
      const elements = color?.elements ?? [];
      initialState[place.id] = normalizeTokenRecords(tokens, elements);
    }
  }
}

/**
 * Evaluates per-place initial state: coloured places carry literal token
 * rows, uncoloured places an expression producing a token count. Writes into
 * `initialState`; failures land in `errors`.
 */
function compilePerPlaceInitialState(args: {
  content: Record<string, string | (number | boolean | string)[][]>;
  /** Type-checked place expressions, keyed like `content`'s string entries. */
  preparedExpressions: ReadonlyMap<string, PreparedScenarioItem>;
  bindings: HirInterpretBindings;
  placeById: ReadonlyMap<string, Place>;
  typeById: ReadonlyMap<string, Color>;
  initialState: InitialMarking;
  errors: ScenarioCompilationError[];
}): void {
  const {
    bindings,
    content,
    errors,
    initialState,
    placeById,
    preparedExpressions,
    typeById,
  } = args;
  for (const [placeId, value] of Object.entries(content)) {
    // Colored places: row data stored directly by the UI.
    if (Array.isArray(value)) {
      const place = placeById.get(placeId);
      const color = place?.colorId ? typeById.get(place.colorId) : undefined;
      const hasTokenRows = value.length > 0;

      if (hasTokenRows && !place) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}" uses colored token rows, but the place does not exist.`,
        });
        continue;
      }

      if (hasTokenRows && (!color || color.elements.length === 0)) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}" uses colored token rows, but the place has no color elements.`,
        });
        continue;
      }

      const elementCount = color?.elements.length ?? 0;
      const tooWideRow = value.find((row) => row.length > elementCount);
      if (tooWideRow) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}" has ${tooWideRow.length} values per token, but the color type has ${elementCount} elements.`,
        });
        continue;
      }

      try {
        initialState[placeId] = tokenRecordsFromRows(
          value,
          color?.elements ?? [],
        );
      } catch (error) {
        // Row coercion throws on invalid typed values (e.g. a non-finite
        // number); report it like every other compilation failure instead
        // of letting compileScenario throw.
        errors.push({
          source: "initialState",
          itemId: placeId,
          message:
            error instanceof Error
              ? error.message
              : `Invalid token rows for place "${placeId}".`,
        });
      }
      continue;
    }

    // Uncolored places: expression string → evaluate to token count
    const trimmed = value.trim();
    if (trimmed === "") {
      initialState[placeId] = 0;
      continue;
    }
    const evaluated = interpretPreparedItem(
      preparedExpressions.get(placeId) ?? {
        ok: false,
        message:
          "This scenario code has not been compiled — the lowered scenario is stale. Recompile it from the current scenario.",
      },
      bindings,
    );
    if (!evaluated.ok) {
      errors.push({
        source: "initialState",
        itemId: placeId,
        message: `Initial state for place "${placeId}": ${evaluated.message}`,
      });
      continue;
    }
    if (typeof evaluated.value !== "number" || Number.isNaN(evaluated.value)) {
      errors.push({
        source: "initialState",
        itemId: placeId,
        message: `Initial state for place "${placeId}" evaluated to ${describeValue(evaluated.value)}, expected a number.`,
      });
      continue;
    }
    initialState[placeId] = Math.max(0, Math.round(evaluated.value));
  }
}

// -- Compiler -----------------------------------------------------------------

/**
 * A scenario compiler whose value-independent work is already done.
 *
 * `compile` is `compileScenario` for one concrete assignment of the scenario
 * parameters. Preparation runs the parts that do not depend on those values —
 * expression contexts, net-parameter default parsing, the lookup maps, and
 * the type check of every override and initial-state item — so a caller that
 * compiles the same scenario at many assignments (a parameter sweep compiles
 * once per run's draws) pays them once instead of per call.
 */
export type PreparedScenarioCompiler = {
  compile(
    scenarioParameterValues?: ScenarioParameterValues,
  ): CompileScenarioOutcome;
  /**
   * `compile` without the initial state: steps 1–2 only, returning the
   * resolved parameter values. For callers that compile per run — a range
   * sweep translates every run's draws, and per-run initial markings do not
   * exist — evaluating the initial state per call would be pure waste. An
   * initial-state error does not fail this: the batch's own `compile`
   * reports any the midpoint assignment produces, and one only a specific
   * draw produces surfaces nowhere, since the per-run initial state is
   * never used.
   */
  compileParameterValues(
    scenarioParameterValues?: ScenarioParameterValues,
  ):
    | { ok: true; parameterValues: Record<string, string> }
    | { ok: false; errors: ScenarioCompilationError[] };
};

/**
 * Prepares `scenario` for repeated compilation. The inputs are captured and
 * assumed not to mutate; re-prepare after editing the scenario or the net.
 *
 * Evaluation order per `compile` call (dependencies flow top-down):
 * 1. Scenario parameter defaults → builds the `scenario` object
 * 2. Parameter overrides → each expression evaluated with `{ parameters, scenario }`
 *    → produces the final `parameters` object
 * 3. Initial state expressions → each evaluated with the resolved `{ parameters, scenario }`
 *    → produces per-place token counts
 *
 * @param scenario - The scenario to compile
 * @param hir - The scenario's lowered code (`lowerScenarioToHir`), produced
 *   where the TypeScript compiler is available (LSP worker / Node)
 * @param netParameters - The net-level parameter definitions (for defaults and variable names)
 * @param places - All places in the SDCPN (needed for code-mode name→ID mapping)
 * @param types - All color types (needed for code-mode token flattening)
 */
export function prepareScenarioCompiler(
  scenario: Scenario,
  hir: ScenarioHir,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
): PreparedScenarioCompiler {
  // Scenario parameter identifiers come from the net definition: no prototype.
  const scenarioParameters = scenario.scenarioParameters.filter(
    (sp) => sp.identifier.trim() !== "",
  );

  // Net-parameter defaults parse once; a default that does not parse fails
  // identically at every assignment, so its error is precomputed too.
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

  // Overrides, type-checked once. Empty expressions keep the default and
  // unknown parameter ids are ignored, exactly as compilation always has.
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

  // Initial-state items, type-checked once — exactly those `compile` will
  // evaluate: the code block when code mode has content, else each
  // uncoloured place's non-empty expression string.
  const initialStateSpec = scenario.initialState;
  const preparedInitialStateCode: PreparedScenarioItem | null =
    initialStateSpec.type === "code" && initialStateSpec.content.trim() !== ""
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
  if (initialStateSpec.type !== "code") {
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

  /** Steps 1–2 at one assignment; both entry points build on this. */
  const evaluateParameters = (
    scenarioParameterValues?: ScenarioParameterValues,
  ): {
    errors: ScenarioCompilationError[];
    parametersObj: NetParameterValues;
    bindings: HirInterpretBindings;
  } => {
    const errors: ScenarioCompilationError[] = [];

    // ── Step 1: Build the `scenario` object from scenario parameter defaults ──

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

    // ── Step 2: Evaluate parameter overrides ──
    //
    // Start with the parsed net-level defaults, then apply each override
    // expression. Expressions have access to the base `parameters` and
    // `scenario`.

    const parametersObj: NetParameterValues = Object.assign(
      createUserKeyedRecord(),
      defaultsTemplate,
    );
    errors.push(...defaultErrors);

    // One binding pair serves every evaluation: the records are mutated in
    // place, so later expressions see earlier overrides.
    const bindings: HirInterpretBindings = {
      parameters: parametersObj,
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
      parametersObj[param.variableName] = coerced.value;
    }

    return { errors, parametersObj, bindings };
  };

  /** The worker input format: every resolved value as a string. */
  const stringifyParameters = (
    parametersObj: NetParameterValues,
  ): Record<string, string> => {
    const parameterValues = createUserKeyedRecord<string>();
    for (const [key, value] of Object.entries(parametersObj)) {
      parameterValues[key] = String(value);
    }
    return parameterValues;
  };

  const compile = (
    scenarioParameterValues?: ScenarioParameterValues,
  ): CompileScenarioOutcome => {
    const { errors, parametersObj, bindings } = evaluateParameters(
      scenarioParameterValues,
    );

    // ── Step 3: Evaluate initial state ──

    // Keyed by place id; in code mode the key set additionally derives from
    // whatever record the user-authored code block returns: no prototype.
    const initialState: InitialMarking = createUserKeyedRecord();

    if (initialStateSpec.type === "code") {
      if (preparedInitialStateCode !== null) {
        compileCodeModeInitialState({
          prepared: preparedInitialStateCode,
          bindings,
          placeByName,
          typeById,
          initialState,
          errors,
        });
      }
    } else {
      compilePerPlaceInitialState({
        content: initialStateSpec.content,
        preparedExpressions: preparedPlaceExpressions,
        bindings,
        placeById,
        typeById,
        initialState,
        errors,
      });
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      result: {
        parameterValues: stringifyParameters(parametersObj),
        initialState,
      },
    };
  };

  const compileParameterValues = (
    scenarioParameterValues?: ScenarioParameterValues,
  ):
    | { ok: true; parameterValues: Record<string, string> }
    | { ok: false; errors: ScenarioCompilationError[] } => {
    const { errors, parametersObj } = evaluateParameters(
      scenarioParameterValues,
    );
    if (errors.length > 0) {
      return { ok: false, errors };
    }
    return { ok: true, parameterValues: stringifyParameters(parametersObj) };
  };

  return { compile, compileParameterValues };
}

/**
 * Compile a scenario into concrete parameter values and initial token counts.
 *
 * One-shot form of `prepareScenarioCompiler` — same behaviour, same total
 * cost. Callers compiling the same scenario repeatedly should prepare once.
 */
export function compileScenario(
  scenario: Scenario,
  hir: ScenarioHir,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
  options: CompileScenarioOptions = {},
): CompileScenarioOutcome {
  return prepareScenarioCompiler(
    scenario,
    hir,
    netParameters,
    places,
    types,
  ).compile(options.scenarioParameterValues);
}
