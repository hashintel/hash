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

import type { HirValue } from "../../../hir/interpret";
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

/**
 * Scenario code executes as type-checked, interpreted HIR — there is no
 * `new Function` and no sandbox on this path. Lowering needs the TypeScript
 * compiler, so it happens elsewhere (`lowerScenarioToHir` in `hir/scenario.ts`,
 * run by the LSP worker in the browser and inline in Node) and its result is
 * passed in; this module type-checks each item against the net and
 * interprets it.
 */
type NetParameterValues = Record<string, number | boolean>;

/** Evaluates one lowered scenario item, or explains why it cannot run. */
function evaluateScenarioItem(
  item: ScenarioHirItem | undefined,
  context: HirSurfaceContext,
  parametersObj: NetParameterValues,
  scenarioObj: NetParameterValues,
): { ok: true; value: HirValue } | { ok: false; message: string } {
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
  try {
    return {
      ok: true,
      value: interpretHir(item.fn, {
        parameters: parametersObj,
        scenario: scenarioObj,
      }),
    };
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
 * @param hir - The scenario's lowered code (`lowerScenarioToHir`), produced
 *   where the TypeScript compiler is available (LSP worker / Node)
 * @param netParameters - The net-level parameter definitions (for defaults and variable names)
 * @param places - All places in the SDCPN (needed for code-mode name→ID mapping)
 * @param types - All color types (needed for code-mode token flattening)
 */
export function compileScenario(
  scenario: Scenario,
  hir: ScenarioHir,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
  options: CompileScenarioOptions = {},
): CompileScenarioOutcome {
  const errors: ScenarioCompilationError[] = [];

  // ── Step 1: Build the `scenario` object from scenario parameter defaults ──

  // Scenario parameter identifiers come from the net definition: no prototype.
  const scenarioObj: NetParameterValues = createUserKeyedRecord();
  for (const sp of scenario.scenarioParameters) {
    if (sp.identifier.trim() === "") {
      continue;
    }

    const value =
      (options.scenarioParameterValues
        ? getOwn(options.scenarioParameterValues, sp.identifier)
        : undefined) ?? sp.default;
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
  // Start with net-level defaults, then apply each override expression.
  // Expressions have access to the base `parameters` and `scenario`.

  const parametersObj: NetParameterValues = createUserKeyedRecord();
  for (const param of netParameters) {
    try {
      parametersObj[param.variableName] = parseParameterValue(
        param,
        param.defaultValue,
      );
    } catch (error) {
      errors.push({
        source: "parameterOverride",
        itemId: param.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
    if (expression.trim() === "") {
      // No override — keep the default
      continue;
    }
    const evaluated = evaluateScenarioItem(
      getOwn(hir.parameterOverrides, paramId),
      buildScenarioExpressionContext(
        netParameters,
        scenario.scenarioParameters,
        param.type,
      ),
      parametersObj,
      scenarioObj,
    );
    if (!evaluated.ok) {
      errors.push({
        source: "parameterOverride",
        itemId: paramId,
        message: `Parameter "${param.name}": ${evaluated.message}`,
      });
      continue;
    }
    const value = evaluated.value;
    if (param.type === "boolean") {
      if (typeof value !== "boolean") {
        errors.push({
          source: "parameterOverride",
          itemId: paramId,
          message: `Parameter "${param.name}" expression evaluated to ${describeValue(value)}, expected a boolean.`,
        });
        continue;
      }
      parametersObj[param.variableName] = value;
    } else {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({
          source: "parameterOverride",
          itemId: paramId,
          message: `Parameter "${param.name}" expression evaluated to ${describeValue(value)}, expected a number.`,
        });
        continue;
      }
      if (param.type === "integer" && !Number.isInteger(value)) {
        errors.push({
          source: "parameterOverride",
          itemId: paramId,
          message: `Parameter "${param.name}" expression evaluated to ${describeValue(value)}, expected an integer.`,
        });
        continue;
      }
      parametersObj[param.variableName] = value;
    }
  }

  // ── Step 3: Evaluate initial state ──

  // Keyed by place id; in code mode the key set additionally derives from
  // whatever record the user-authored code block returns: no prototype.
  const initialState: InitialMarking = createUserKeyedRecord();
  const placeById = new Map(places.map((p) => [p.id, p]));
  const placeByName = new Map(places.map((p) => [p.name, p]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  if (scenario.initialState.type === "code") {
    // Code mode: evaluate the full code block as a function body.
    // It returns an object keyed by place NAME (not ID) → array of token objects.
    const code = scenario.initialState.content.trim();
    if (code !== "") {
      const evaluated = evaluateScenarioItem(
        hir.initialStateCode,
        buildScenarioCodeContext(
          netParameters,
          scenario.scenarioParameters,
          places,
          types,
        ),
        parametersObj,
        scenarioObj,
      );
      if (!evaluated.ok) {
        errors.push({
          source: "initialState",
          itemId: "__code__",
          message: `Initial state code: ${evaluated.message}`,
        });
      } else if (
        typeof evaluated.value !== "object" ||
        Array.isArray(evaluated.value)
      ) {
        errors.push({
          source: "initialState",
          itemId: "__code__",
          message: `Initial state code must return an object, got ${typeof evaluated.value}.`,
        });
      } else {
        for (const [placeName, tokens] of Object.entries(evaluated.value)) {
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
      const evaluated = evaluateScenarioItem(
        getOwn(hir.placeExpressions, placeId),
        buildScenarioExpressionContext(
          netParameters,
          scenario.scenarioParameters,
          "real",
        ),
        parametersObj,
        scenarioObj,
      );
      if (!evaluated.ok) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}": ${evaluated.message}`,
        });
        continue;
      }
      if (
        typeof evaluated.value !== "number" ||
        Number.isNaN(evaluated.value)
      ) {
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

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Convert parameters to string values (simulation worker input format)
  const parameterValues = createUserKeyedRecord<string>();
  for (const [key, value] of Object.entries(parametersObj)) {
    parameterValues[key] = String(value);
  }

  return { ok: true, result: { parameterValues, initialState } };
}
