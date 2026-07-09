import { coerceTokenRecord } from "../../engine/token-values";
import { TYPE_POLICIES } from "../../engine/type-policies";
import { runSandboxed, SHADOWED_GLOBALS } from "../sandbox";

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

// -- Hardened expression evaluator --------------------------------------------

/**
 * Wrap a plain object in a prototype-less, frozen copy.
 * Severs the prototype chain so `obj.constructor.constructor("return globalThis")()`
 * cannot escape to globals.
 */
function createSafeObject(obj: Record<string, number>): Record<string, number> {
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
  parameters: Record<string, number>,
  scenario: Record<string, number>,
): unknown {
  // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored expressions
  const fn = new Function(
    "parameters",
    "scenario",
    `"use strict"; var ${SHADOWED_GLOBALS}; return (${expression});`,
  ) as (p: Record<string, number>, s: Record<string, number>) => unknown;
  return runSandboxed(() =>
    fn(createSafeObject(parameters), createSafeObject(scenario)),
  );
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
  const token: MarkingTokenRecord = {};
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
    const token: Record<string, unknown> = {};
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
  const errors: ScenarioCompilationError[] = [];

  // ── Step 1: Build the `scenario` object from scenario parameter defaults ──

  const scenarioObj: Record<string, number> = {};
  for (const sp of scenario.scenarioParameters) {
    if (sp.identifier.trim() === "") {
      continue;
    }

    const value =
      options.scenarioParameterValues?.[sp.identifier] ?? sp.default;
    if (!Number.isFinite(value)) {
      errors.push({
        source: "scenarioParameter",
        itemId: sp.identifier,
        message: `Scenario parameter "${sp.identifier}" must be a finite number.`,
      });
      scenarioObj[sp.identifier] = sp.default;
      continue;
    }

    scenarioObj[sp.identifier] = value;
  }

  // ── Step 2: Evaluate parameter overrides ──
  //
  // Start with net-level defaults, then apply each override expression.
  // Expressions have access to the base `parameters` and `scenario`.

  const parametersObj: Record<string, number> = {};
  for (const param of netParameters) {
    parametersObj[param.variableName] = Number(param.defaultValue) || 0;
  }

  // Build a lookup: paramId → Parameter
  const paramById = new Map(netParameters.map((p) => [p.id, p]));

  for (const [paramId, expression] of Object.entries(
    scenario.parameterOverrides,
  )) {
    const param = paramById.get(paramId);
    if (!param) {
      continue;
    }
    const trimmed = expression.trim();
    if (trimmed === "") {
      // No override — keep the default
      continue;
    }
    try {
      const value = evaluateExpression(trimmed, parametersObj, scenarioObj);
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push({
          source: "parameterOverride",
          itemId: paramId,
          message: `Parameter "${param.name}" expression evaluated to ${String(value)}, expected a number.`,
        });
        continue;
      }
      parametersObj[param.variableName] = value;
    } catch (err) {
      errors.push({
        source: "parameterOverride",
        itemId: paramId,
        message: `Parameter "${param.name}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ── Step 3: Evaluate initial state ──

  const initialState: InitialMarking = {};
  const placeById = new Map(places.map((p) => [p.id, p]));
  const placeByName = new Map(places.map((p) => [p.name, p]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  if (scenario.initialState.type === "code") {
    // Code mode: evaluate the full code block as a function body.
    // It returns an object keyed by place NAME (not ID) → array of token objects.
    const code = scenario.initialState.content.trim();
    if (code !== "") {
      try {
        // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored code
        const fn = new Function(
          "parameters",
          "scenario",
          `"use strict"; var ${SHADOWED_GLOBALS}; ${code}`,
        ) as (p: Record<string, number>, s: Record<string, number>) => unknown;
        const result = runSandboxed(() =>
          fn(createSafeObject(parametersObj), createSafeObject(scenarioObj)),
        );

        if (typeof result !== "object" || result === null) {
          errors.push({
            source: "initialState",
            itemId: "__code__",
            message: `Initial state code must return an object, got ${typeof result}.`,
          });
        } else {
          for (const [placeName, tokens] of Object.entries(result)) {
            const place = placeByName.get(placeName);
            if (!place) {
              continue; // Unknown place name — skip silently
            }

            if (typeof tokens === "number") {
              // Uncolored place: just a token count
              initialState[place.id] = Math.max(0, Math.round(tokens));
            } else if (Array.isArray(tokens)) {
              // Colored place: array of token objects.
              const color = place.colorId
                ? typeById.get(place.colorId)
                : undefined;
              const elements = color?.elements ?? [];
              initialState[place.id] = normalizeTokenRecords(tokens, elements);
            }
          }
        }
      } catch (err) {
        errors.push({
          source: "initialState",
          itemId: "__code__",
          message: `Initial state code: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } else {
    // Per-place mode: evaluate each expression individually
    for (const [placeId, value] of Object.entries(
      scenario.initialState.content,
    )) {
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
      try {
        const result = evaluateExpression(trimmed, parametersObj, scenarioObj);
        if (typeof result !== "number" || Number.isNaN(result)) {
          errors.push({
            source: "initialState",
            itemId: placeId,
            message: `Initial state for place "${placeId}" evaluated to ${String(result)}, expected a number.`,
          });
          continue;
        }
        initialState[placeId] = Math.max(0, Math.round(result));
      } catch (err) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}": ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Convert parameters to string values (simulation worker input format)
  const parameterValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(parametersObj)) {
    parameterValues[key] = String(value);
  }

  return { ok: true, result: { parameterValues, initialState } };
}
