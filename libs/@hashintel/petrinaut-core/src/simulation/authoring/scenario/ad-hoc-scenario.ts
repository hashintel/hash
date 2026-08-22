/**
 * Ad-hoc scenarios: an inline initial-state + parameters definition compiled
 * into a `Scenario` value at run time and never persisted into the net file.
 *
 * The form state here is the code editor's model, constrained: per-place
 * token spreadsheets whose every cell is an expression, rows that are either
 * Fixed (one token) or a Template (a count expression's worth of tokens) and
 * may mix within one place, shared column values, and named Variables at two
 * scopes (top-level and per-place). Synthesis emits a **code-mode** scenario —
 * the one initial-state mode whose expressions, loops and intermediate names
 * the existing `compileScenario` already evaluates in its hardened sandbox —
 * so nothing in the compiler changes.
 *
 * For optimization, every part carrying an enabled Optimize toggle (a cell, a
 * shared column, a Variable, a template count, a net parameter) becomes a
 * generated scenario parameter with a deterministic name, and the part's
 * value is replaced by a reference to it. The names are the join key from
 * optimization results back to the thing the user selected, so they derive
 * from the source rather than from randomness and must stay stable across
 * synthesis runs.
 *
 * Expression vocabulary: net parameters are reached as `parameters.<name>`,
 * exactly as in every other scenario expression; ad-hoc Variables are bare
 * names. `i` and `count` are per row: inside a template row, `i` runs from 0
 * to that row's count minus one and `count` is that row's count; a fixed row
 * sees its position in the place's row list as `i` and `1` as `count`. A
 * shared column's expression evaluates per row in the same scope, so it may
 * read `i`. The namespaces cannot collide, so a Variable may share a net
 * parameter's name.
 */

import { runSandboxed, SHADOWED_GLOBALS } from "../sandbox";
import { SCENARIO_HELPERS } from "./helpers";

import type {
  PetrinautOptimizationManifest,
  PetrinautOptimizationDomain,
} from "../../../optimization";
import type {
  Color,
  Parameter,
  Place,
  Scenario,
  ScenarioParameter,
} from "../../../types/sdcpn";

// -- Form state ---------------------------------------------------------------

/** Optimization settings for one Optimize toggle, kept while toggled off. */
export interface AdHocOptimizeSettings {
  /** Lower bound; an expression that must resolve to a constant. */
  min: string;
  /** Upper bound; an expression that must resolve to a constant. */
  max: string;
  scale: "linear" | "log";
  /** Integer domains only; an expression resolving to a positive integer. */
  step?: string;
}

/**
 * One value-carrying slot. `expression` is always kept, so toggling Optimize
 * on and off never destroys what the user typed.
 */
export interface AdHocValue {
  expression: string;
  /** Non-null while the Optimize toggle is on. */
  optimize: AdHocOptimizeSettings | null;
  /**
   * The settings from the last time Optimize was on, kept while it is off so
   * toggling it back restores the previous bounds. Ignored by synthesis.
   */
  retainedOptimize?: AdHocOptimizeSettings;
}

export interface AdHocVariable extends AdHocValue {
  /** A bare JavaScript identifier; referenced by name in expressions. */
  name: string;
  type: "real" | "integer" | "boolean";
}

/**
 * One spreadsheet row. A fixed row emits one token. A template row emits its
 * count's worth of tokens, the cells evaluated once per `i`; the count may
 * itself be optimized. The two kinds mix freely within a place.
 */
export type AdHocRow =
  | { kind: "fixed"; cells: AdHocValue[] }
  | { kind: "template"; count: AdHocValue; cells: AdHocValue[] };

export interface AdHocColouredPlace {
  kind: "coloured";
  variables: AdHocVariable[];
  rows: AdHocRow[];
  /**
   * Shared column values, keyed by colour element name. A shared column's
   * value supersedes every cell in that column: the cells' own states are
   * kept (so un-sharing restores them exactly) but not evaluated and not
   * emitted as parameters while the share is in place.
   */
  sharedColumns: Record<string, AdHocValue>;
  /**
   * Shared values from columns that were un-shared, kept so re-sharing
   * restores the most recent shared value. Ignored by synthesis.
   */
  retainedSharedColumns?: Record<string, AdHocValue>;
}

export interface AdHocUncolouredPlace {
  kind: "uncoloured";
  /** Token count for the place. */
  count: AdHocValue;
}

export type AdHocPlaceState = AdHocColouredPlace | AdHocUncolouredPlace;

export interface AdHocNetParameter extends AdHocValue {
  /** `Parameter.id` of the net parameter this entry overrides. */
  parameterId: string;
}

export interface AdHocScenarioState {
  /** Top-level Variables; they replace scenario parameters in this form. */
  variables: AdHocVariable[];
  /** Overrides for net parameters; empty expression keeps the default. */
  netParameters: AdHocNetParameter[];
  /** Keyed by `Place.id`; places absent here keep an empty initial state. */
  places: Record<string, AdHocPlaceState>;
}

/** Everything from the net that synthesis resolves names and types against. */
export interface AdHocSynthesisContext {
  netParameters: Parameter[];
  places: Place[];
  types: Color[];
}

export interface AdHocSynthesisError {
  source: "variable" | "cell" | "count" | "netParameter" | "bounds";
  /** The generated parameter name, variable name, or place id that failed. */
  itemId: string;
  message: string;
}

export type SynthesizeAdHocScenarioOutcome =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: AdHocSynthesisError[] };

export type SynthesizeAdHocOptimizationOutcome =
  | {
      ok: true;
      scenario: Scenario;
      parameterBindings: PetrinautOptimizationManifest["scenario"]["parameterBindings"];
    }
  | { ok: false; errors: AdHocSynthesisError[] };

// -- Deterministic parameter names ---------------------------------------------

/**
 * Names generated parameters after their source, so an optimization result
 * row reads as the thing the user selected. Two places may share a name, so
 * repeated names take an ordinal suffix (`~2`, `~3`, …) in `places` order.
 */
export function adHocPlaceKey(places: Place[], placeId: string): string {
  const place = places.find((candidate) => candidate.id === placeId);
  if (!place) {
    return placeId;
  }
  const sameName = places.filter((candidate) => candidate.name === place.name);
  const ordinal = sameName.findIndex((candidate) => candidate.id === placeId);
  return ordinal > 0 ? `${place.name}~${ordinal + 1}` : place.name;
}

export const adHocParameterName = {
  cell: (placeKey: string, row: number, field: string): string =>
    `adhoc.${placeKey}.r${row}.${field}`,
  /** A shared column: `col` stands where a row ordinal would. */
  column: (placeKey: string, field: string): string =>
    `adhoc.${placeKey}.col.${field}`,
  variable: (scope: string, name: string): string =>
    `adhoc.var.${scope}.${name}`,
  /**
   * A count: the whole place's for an uncoloured place, one template row's
   * otherwise. Kept under its own prefix so a colour element named `count`
   * cannot collide with it.
   */
  count: (placeKey: string, row?: number): string =>
    row === undefined
      ? `adhoc.count.${placeKey}`
      : `adhoc.count.${placeKey}.r${row}`,
  netParameter: (variableName: string): string => `adhoc.param.${variableName}`,
} as const;

/** The scope segment for top-level Variables in generated parameter names. */
export const AD_HOC_TOP_LEVEL_SCOPE = "net";

// -- Validation helpers ---------------------------------------------------------

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

// Words that are reserved in the generated code's scope: the evaluator's own
// arguments, the scenario helpers, the spreadsheet vocabulary (`i`, `count`),
// and JavaScript keywords a `const` declaration would reject.
const RESERVED_NAMES = new Set([
  "parameters",
  "scenario",
  "i",
  "count",
  ...Object.keys(SCENARIO_HELPERS),
  ..."break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await".split(
    " ",
  ),
]);

function validateVariableName(name: string): string | null {
  if (!IDENTIFIER_PATTERN.test(name)) {
    return `"${name}" is not a valid variable name (letters, digits, _ and $, not starting with a digit).`;
  }
  if (RESERVED_NAMES.has(name)) {
    return `"${name}" is reserved and cannot name a variable.`;
  }
  if (name.startsWith("__adhoc")) {
    return `"${name}" collides with generated code; names may not start with "__adhoc".`;
  }
  return null;
}

/**
 * Conservatively extracts candidate references from an expression: bare
 * identifiers (ad-hoc Variables) and `parameters.<name>` members (net
 * parameters). Purely lexical: it over-approximates (an identifier inside a
 * string literal counts), which errs toward reporting a dependency rather
 * than missing one.
 */
function referencedNames(expression: string): Set<string> {
  const names = new Set<string>();
  for (const match of expression.matchAll(
    /(?<![.\w$])[A-Za-z_$][A-Za-z0-9_$]*/gu,
  )) {
    names.add(match[0]);
  }
  for (const match of expression.matchAll(
    /(?<![.\w$])parameters\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/gu,
  )) {
    names.add(`parameters.${match[1]}`);
  }
  return names;
}

// -- Sandbox evaluation for bounds and defaults ---------------------------------

const HELPER_NAMES = Object.keys(SCENARIO_HELPERS);
const HELPER_VALUES = Object.values(SCENARIO_HELPERS);

function freeze<T extends Record<string, unknown>>(record: T): T {
  return Object.freeze(Object.assign(Object.create(null), record)) as T;
}

/**
 * Evaluates one expression in the same hardened shape `compileScenario` uses,
 * with the non-optimized top-level Variables additionally in scope as
 * constants. Used for bound expressions (which must resolve to constants at
 * synthesis time) and for generated parameters' preview defaults.
 */
function evaluateConstant(
  expression: string,
  parameters: Record<string, number | boolean>,
  constants: readonly { name: string; expression: string }[],
): unknown {
  const declarations = constants
    .map(({ name, expression: value }) => `const ${name} = (${value});`)
    .join("\n");
  // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored expressions, same sandbox as compileScenario
  const fn = new Function(
    "parameters",
    "scenario",
    ...HELPER_NAMES,
    `"use strict"; var ${SHADOWED_GLOBALS};\n${declarations}\nreturn (${expression});`,
  ) as (...args: unknown[]) => unknown;
  return runSandboxed(() =>
    fn(freeze(parameters), freeze({}), ...HELPER_VALUES),
  );
}

// -- State transitions ------------------------------------------------------------
//
// The restore rules are model semantics, not component behaviour: toggling
// Optimize must not overwrite the expression, toggling it back restores the
// previous bounds, and re-sharing a column restores the most recent shared
// value. They live here so every consumer of the form state gets them.

/** Default bounds a first-time Optimize toggle opens with. */
export const AD_HOC_DEFAULT_OPTIMIZE: AdHocOptimizeSettings = {
  min: "0",
  max: "1",
  scale: "linear",
};

/**
 * Turns a value's Optimize toggle on or off. The expression is never
 * touched; turning on restores the retained settings (or the defaults on
 * first use), turning off retains the settings for the next time.
 */
export function toggleAdHocOptimize(
  value: AdHocValue,
  on: boolean,
  defaults: AdHocOptimizeSettings = AD_HOC_DEFAULT_OPTIMIZE,
): AdHocValue {
  if (on) {
    return {
      ...value,
      optimize: value.optimize ?? value.retainedOptimize ?? defaults,
    };
  }
  if (!value.optimize) {
    return value;
  }
  return { ...value, optimize: null, retainedOptimize: value.optimize };
}

/**
 * Shares a column: one expression supersedes every cell of `field`. The
 * initial shared value is the most recently un-shared one, then the first
 * row's cell (a best guess at intent), then an empty expression. Cells are
 * not modified, so un-sharing restores them exactly.
 */
export function shareAdHocColumn(
  place: AdHocColouredPlace,
  field: string,
  columnIndex: number,
): AdHocColouredPlace {
  if (place.sharedColumns[field]) {
    return place;
  }
  const firstRowCell = place.rows[0]?.cells[columnIndex];
  const shared: AdHocValue =
    place.retainedSharedColumns?.[field] ??
    (firstRowCell ? { ...firstRowCell } : { expression: "", optimize: null });
  return {
    ...place,
    sharedColumns: { ...place.sharedColumns, [field]: shared },
  };
}

/**
 * Un-shares a column, retaining its shared value for a later re-share. The
 * cells reappear exactly as they were, including any Optimize toggles that
 * were held but not honored while the column was shared.
 */
export function unshareAdHocColumn(
  place: AdHocColouredPlace,
  field: string,
): AdHocColouredPlace {
  const shared = place.sharedColumns[field];
  if (!shared) {
    return place;
  }
  const { [field]: _released, ...sharedColumns } = place.sharedColumns;
  return {
    ...place,
    sharedColumns,
    retainedSharedColumns: {
      ...place.retainedSharedColumns,
      [field]: shared,
    },
  };
}

// -- Synthesis ------------------------------------------------------------------

interface OptimizedEntity {
  parameterName: string;
  /** What errors and result attribution call this entity. */
  itemId: string;
  type: "real" | "integer" | "boolean";
  settings: AdHocOptimizeSettings;
  /** The kept non-optimized expression, used for the preview default. */
  expression: string;
  /** Integer counts may not go below zero. */
  minimumFloor?: number;
}

interface SynthesisPlan {
  errors: AdHocSynthesisError[];
  optimized: OptimizedEntity[];
  /** Names an optimized bound expression is forbidden to reference. */
  optimizedReferenceNames: Set<string>;
}

/** Whether a colour element's type can carry an optimization domain. */
function optimizableElementType(
  type: Color["elements"][number]["type"],
): type is "real" | "integer" | "boolean" {
  return type === "real" || type === "integer" || type === "boolean";
}

function collectPlan(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  includeOptimize: boolean,
): SynthesisPlan {
  const errors: AdHocSynthesisError[] = [];
  const optimized: OptimizedEntity[] = [];
  const optimizedReferenceNames = new Set<string>();
  const parameterById = new Map(
    context.netParameters.map((parameter) => [parameter.id, parameter]),
  );
  const typeById = new Map(context.types.map((type) => [type.id, type]));

  const topLevelNames = new Set<string>();
  for (const variable of state.variables) {
    const nameError = validateVariableName(variable.name);
    if (nameError) {
      errors.push({
        source: "variable",
        itemId: variable.name,
        message: nameError,
      });
      continue;
    }
    if (topLevelNames.has(variable.name)) {
      errors.push({
        source: "variable",
        itemId: variable.name,
        message: `Variable "${variable.name}" is declared twice.`,
      });
      continue;
    }
    topLevelNames.add(variable.name);
    if (includeOptimize && variable.optimize) {
      optimized.push({
        parameterName: adHocParameterName.variable(
          AD_HOC_TOP_LEVEL_SCOPE,
          variable.name,
        ),
        itemId: variable.name,
        type: variable.type,
        settings: variable.optimize,
        expression: variable.expression,
      });
      optimizedReferenceNames.add(variable.name);
    }
  }

  for (const entry of state.netParameters) {
    const parameter = parameterById.get(entry.parameterId);
    if (!parameter) {
      errors.push({
        source: "netParameter",
        itemId: entry.parameterId,
        message: `Net parameter "${entry.parameterId}" does not exist.`,
      });
      continue;
    }
    if (includeOptimize && entry.optimize) {
      optimized.push({
        parameterName: adHocParameterName.netParameter(parameter.variableName),
        itemId: parameter.id,
        type: parameter.type,
        settings: entry.optimize,
        expression:
          entry.expression.trim() === ""
            ? parameter.defaultValue
            : entry.expression,
      });
      optimizedReferenceNames.add(`parameters.${parameter.variableName}`);
    }
  }

  for (const [placeId, placeState] of Object.entries(state.places)) {
    const placeKey = adHocPlaceKey(context.places, placeId);
    const place = context.places.find((candidate) => candidate.id === placeId);
    if (!place) {
      errors.push({
        source: "cell",
        itemId: placeId,
        message: `Place "${placeId}" does not exist.`,
      });
      continue;
    }

    if (placeState.kind === "uncoloured") {
      if (includeOptimize && placeState.count.optimize) {
        optimized.push({
          parameterName: adHocParameterName.count(placeKey),
          itemId: placeId,
          type: "integer",
          settings: placeState.count.optimize,
          expression: placeState.count.expression,
          minimumFloor: 0,
        });
      }
      continue;
    }

    const colour = place.colorId ? typeById.get(place.colorId) : undefined;
    const elements = colour?.elements ?? [];
    if (elements.length === 0) {
      errors.push({
        source: "cell",
        itemId: placeId,
        message: `Place "${place.name}" has no colour elements; use an uncoloured entry.`,
      });
      continue;
    }
    const elementByName = new Map(
      elements.map((element) => [element.name, element]),
    );

    const placeVariableNames = new Set<string>();
    for (const variable of placeState.variables) {
      const nameError = validateVariableName(variable.name);
      if (nameError) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          message: nameError,
        });
        continue;
      }
      if (topLevelNames.has(variable.name)) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          message: `Variable "${variable.name}" in place "${place.name}" shadows a top-level Variable.`,
        });
        continue;
      }
      if (placeVariableNames.has(variable.name)) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          message: `Variable "${variable.name}" is declared twice in place "${place.name}".`,
        });
        continue;
      }
      placeVariableNames.add(variable.name);
      if (includeOptimize && variable.optimize) {
        optimized.push({
          parameterName: adHocParameterName.variable(placeKey, variable.name),
          itemId: variable.name,
          type: variable.type,
          settings: variable.optimize,
          expression: variable.expression,
        });
        optimizedReferenceNames.add(variable.name);
      }
    }

    for (const [field, shared] of Object.entries(placeState.sharedColumns)) {
      const element = elementByName.get(field);
      if (!element) {
        errors.push({
          source: "cell",
          itemId: adHocParameterName.column(placeKey, field),
          message: `Place "${place.name}" has no colour element "${field}" to share.`,
        });
        continue;
      }
      if (!includeOptimize || !shared.optimize) {
        continue;
      }
      if (!optimizableElementType(element.type)) {
        errors.push({
          source: "cell",
          itemId: adHocParameterName.column(placeKey, field),
          message: `Column "${field}" holds ${element.type} values, which cannot be optimized.`,
        });
        continue;
      }
      optimized.push({
        parameterName: adHocParameterName.column(placeKey, field),
        itemId: adHocParameterName.column(placeKey, field),
        type: element.type,
        settings: shared.optimize,
        expression: shared.expression,
      });
    }

    for (const [rowIndex, row] of placeState.rows.entries()) {
      if (includeOptimize && row.kind === "template" && row.count.optimize) {
        optimized.push({
          parameterName: adHocParameterName.count(placeKey, rowIndex),
          itemId: adHocParameterName.count(placeKey, rowIndex),
          type: "integer",
          settings: row.count.optimize,
          expression: row.count.expression,
          minimumFloor: 0,
        });
      }

      for (const [columnIndex, cell] of row.cells.entries()) {
        const element = elements[columnIndex];
        if (!element) {
          errors.push({
            source: "cell",
            itemId: `${placeKey}.r${rowIndex}`,
            message: `Row ${rowIndex} of place "${place.name}" has more cells than colour elements.`,
          });
          break;
        }
        // A shared column supersedes its cells: their Optimize state is kept
        // for restore but neither honored nor reported while shared.
        if (placeState.sharedColumns[element.name]) {
          continue;
        }
        if (!includeOptimize || !cell.optimize) {
          continue;
        }
        if (!optimizableElementType(element.type)) {
          errors.push({
            source: "cell",
            itemId: adHocParameterName.cell(placeKey, rowIndex, element.name),
            message: `Cell "${element.name}" holds a ${element.type} value, which cannot be optimized.`,
          });
          continue;
        }
        optimized.push({
          parameterName: adHocParameterName.cell(
            placeKey,
            rowIndex,
            element.name,
          ),
          itemId: adHocParameterName.cell(placeKey, rowIndex, element.name),
          type: element.type,
          settings: cell.optimize,
          expression: cell.expression,
        });
      }
    }
  }

  return { errors, optimized, optimizedReferenceNames };
}

/**
 * Builds the generated parameters and their optimization domains. Bounds must
 * resolve to constants here — at study creation — so they are evaluated in a
 * scope holding net parameter defaults and the non-optimized top-level
 * Variables, and an optimized bound may not reference an optimized entity.
 */
function resolveOptimized(
  plan: SynthesisPlan,
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): {
  scenarioParameters: ScenarioParameter[];
  parameterBindings: PetrinautOptimizationManifest["scenario"]["parameterBindings"];
} {
  const scenarioParameters: ScenarioParameter[] = [];
  const parameterBindings: PetrinautOptimizationManifest["scenario"]["parameterBindings"] =
    {};

  const parameterDefaults: Record<string, number | boolean> = {};
  for (const parameter of context.netParameters) {
    const raw = Number(parameter.defaultValue);
    parameterDefaults[parameter.variableName] =
      parameter.type === "boolean"
        ? parameter.defaultValue === "true" || parameter.defaultValue === "1"
        : raw;
  }
  const constants = state.variables
    .filter((variable) => !variable.optimize)
    .map((variable) => ({
      name: variable.name,
      expression: variable.expression,
    }));

  const evaluateBound = (
    entity: OptimizedEntity,
    label: string,
    expression: string,
  ): number | null => {
    for (const identifier of referencedNames(expression)) {
      if (plan.optimizedReferenceNames.has(identifier)) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          message: `The ${label} of "${entity.itemId}" references "${identifier}", which is itself optimized; bounds must be constant.`,
        });
        return null;
      }
    }
    try {
      const value = evaluateConstant(expression, parameterDefaults, constants);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          message: `The ${label} of "${entity.itemId}" evaluated to ${String(value)}, expected a finite number.`,
        });
        return null;
      }
      return value;
    } catch (error) {
      plan.errors.push({
        source: "bounds",
        itemId: entity.parameterName,
        message: `The ${label} of "${entity.itemId}": ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  };

  for (const entity of plan.optimized) {
    let domain: PetrinautOptimizationDomain;
    let fallbackDefault = 0;

    if (entity.type === "boolean") {
      domain = { kind: "boolean" };
    } else {
      const minimum = evaluateBound(entity, "minimum", entity.settings.min);
      const maximum = evaluateBound(entity, "maximum", entity.settings.max);
      if (minimum === null || maximum === null) {
        continue;
      }
      if (minimum >= maximum) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          message: `"${entity.itemId}" needs its maximum above its minimum (got ${minimum} and ${maximum}).`,
        });
        continue;
      }
      if (entity.settings.scale === "log" && minimum <= 0) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          message: `"${entity.itemId}" uses a logarithmic scale, which needs a positive minimum.`,
        });
        continue;
      }
      if (entity.minimumFloor !== undefined && minimum < entity.minimumFloor) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          message: `"${entity.itemId}" cannot go below ${entity.minimumFloor}.`,
        });
        continue;
      }
      if (entity.type === "integer") {
        const step = entity.settings.step
          ? evaluateBound(entity, "step", entity.settings.step)
          : 1;
        if (step === null) {
          continue;
        }
        if (
          !Number.isInteger(minimum) ||
          !Number.isInteger(maximum) ||
          !Number.isInteger(step) ||
          step <= 0
        ) {
          plan.errors.push({
            source: "bounds",
            itemId: entity.parameterName,
            message: `"${entity.itemId}" needs integer bounds and a positive integer step.`,
          });
          continue;
        }
        domain = {
          kind: "integer",
          minimum,
          maximum,
          step,
          scale: entity.settings.scale,
        };
      } else {
        domain = {
          kind: "continuous",
          minimum,
          maximum,
          scale: entity.settings.scale,
        };
      }
      fallbackDefault =
        entity.type === "integer"
          ? Math.round((minimum + maximum) / 2)
          : (minimum + maximum) / 2;
    }

    // The preview default is the kept expression's current value where it is
    // already a constant, so running the fabricated scenario standalone shows
    // exactly what the user typed; otherwise the domain midpoint stands in.
    let defaultValue = fallbackDefault;
    try {
      const current = evaluateConstant(
        entity.expression,
        parameterDefaults,
        constants,
      );
      if (typeof current === "number" && Number.isFinite(current)) {
        defaultValue = current;
      } else if (typeof current === "boolean") {
        defaultValue = current ? 1 : 0;
      }
    } catch {
      // Not a constant (it references `i`, a per-place Variable, …).
    }

    scenarioParameters.push({
      type: entity.type,
      identifier: entity.parameterName,
      default: defaultValue,
    });
    parameterBindings[entity.parameterName] = { kind: "optimize", domain };
  }

  return { scenarioParameters, parameterBindings };
}

/** A reference to a generated parameter, as written into generated code. */
const scenarioReference = (parameterName: string): string =>
  `scenario[${JSON.stringify(parameterName)}]`;

function valueSource(
  value: AdHocValue,
  parameterName: string,
  includeOptimize: boolean,
): string {
  return includeOptimize && value.optimize
    ? scenarioReference(parameterName)
    : `(${value.expression})`;
}

function generateInitialStateCode(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  includeOptimize: boolean,
): string {
  const typeById = new Map(context.types.map((type) => [type.id, type]));
  const lines: string[] = [];

  for (const variable of state.variables) {
    const source = valueSource(
      variable,
      adHocParameterName.variable(AD_HOC_TOP_LEVEL_SCOPE, variable.name),
      includeOptimize,
    );
    lines.push(`const ${variable.name} = ${source};`);
  }
  lines.push("const __adhocOut = {};");

  for (const [placeId, placeState] of Object.entries(state.places)) {
    const place = context.places.find((candidate) => candidate.id === placeId);
    if (!place) {
      continue;
    }
    const placeKey = adHocPlaceKey(context.places, placeId);
    const outKey = JSON.stringify(place.name);

    if (placeState.kind === "uncoloured") {
      const source = valueSource(
        placeState.count,
        adHocParameterName.count(placeKey),
        includeOptimize,
      );
      lines.push(`__adhocOut[${outKey}] = ${source};`);
      continue;
    }

    const elements = place.colorId
      ? (typeById.get(place.colorId)?.elements ?? [])
      : [];

    // Per-place Variables are per-row intermediates: they may read `i` (the
    // design deliberately allows it), so they are declared inside each row's
    // scope, after `i` and `count` exist, not once per place.
    const variableDeclarations = placeState.variables.map((variable) => {
      const source = valueSource(
        variable,
        adHocParameterName.variable(placeKey, variable.name),
        includeOptimize,
      );
      return `const ${variable.name} = ${source};`;
    });

    const rowObject = (row: AdHocRow, rowIndex: number): string => {
      const fields = row.cells.map((cell, columnIndex) => {
        const element = elements[columnIndex];
        const name = element ? element.name : `__column${columnIndex}`;
        const shared = placeState.sharedColumns[name];
        const source = shared
          ? valueSource(
              shared,
              adHocParameterName.column(placeKey, name),
              includeOptimize,
            )
          : valueSource(
              cell,
              adHocParameterName.cell(placeKey, rowIndex, name),
              includeOptimize,
            );
        return `${JSON.stringify(name)}: ${source}`;
      });
      return `{ ${fields.join(", ")} }`;
    };

    lines.push(`__adhocOut[${outKey}] = (() => {`);
    lines.push("  const __adhocRows = [];");
    for (const [rowIndex, row] of placeState.rows.entries()) {
      if (row.kind === "template") {
        const countSource = valueSource(
          row.count,
          adHocParameterName.count(placeKey, rowIndex),
          includeOptimize,
        );
        lines.push(
          `  {`,
          `    const count = Math.max(0, Math.round(${countSource}));`,
          `    for (let i = 0; i < count; i++) {`,
          ...variableDeclarations.map((declaration) => `      ${declaration}`),
          `      __adhocRows.push(${rowObject(row, rowIndex)});`,
          `    }`,
          `  }`,
        );
      } else {
        lines.push(
          `  {`,
          `    const i = ${rowIndex};`,
          `    const count = 1;`,
          ...variableDeclarations.map((declaration) => `    ${declaration}`),
          `    __adhocRows.push(${rowObject(row, rowIndex)});`,
          `  }`,
        );
      }
    }
    lines.push("  return __adhocRows;", "})();");
  }

  lines.push("return __adhocOut;");
  return lines.join("\n");
}

function synthesize(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  includeOptimize: boolean,
):
  | {
      ok: true;
      scenario: Scenario;
      parameterBindings: PetrinautOptimizationManifest["scenario"]["parameterBindings"];
    }
  | { ok: false; errors: AdHocSynthesisError[] } {
  const plan = collectPlan(state, context, includeOptimize);
  const { scenarioParameters, parameterBindings } = includeOptimize
    ? resolveOptimized(plan, state, context)
    : { scenarioParameters: [], parameterBindings: {} };

  if (plan.errors.length > 0) {
    return { ok: false, errors: plan.errors };
  }

  const parameterById = new Map(
    context.netParameters.map((parameter) => [parameter.id, parameter]),
  );
  const parameterOverrides: Record<string, string> = {};
  for (const entry of state.netParameters) {
    const parameter = parameterById.get(entry.parameterId);
    if (!parameter) {
      continue;
    }
    if (includeOptimize && entry.optimize) {
      parameterOverrides[entry.parameterId] = scenarioReference(
        adHocParameterName.netParameter(parameter.variableName),
      );
    } else if (entry.expression.trim() !== "") {
      parameterOverrides[entry.parameterId] = entry.expression;
    }
  }

  const scenario: Scenario = {
    id: "adhoc-scenario",
    name: "Ad-hoc scenario",
    scenarioParameters,
    parameterOverrides,
    initialState: {
      type: "code",
      content: generateInitialStateCode(state, context, includeOptimize),
    },
  };

  return { ok: true, scenario, parameterBindings };
}

/**
 * Compiles the form state into a plain scenario, ignoring Optimize toggles.
 * The result feeds `compileScenario` and is never persisted.
 */
export function synthesizeAdHocScenario(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): SynthesizeAdHocScenarioOutcome {
  const outcome = synthesize(state, context, false);
  return outcome.ok ? { ok: true, scenario: outcome.scenario } : outcome;
}

/**
 * Compiles the form state into a scenario whose Optimize selections became
 * generated scenario parameters, plus the manifest bindings for them. Feed
 * the pair into an optimization manifest; the scenario is never persisted.
 */
export function synthesizeAdHocOptimization(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): SynthesizeAdHocOptimizationOutcome {
  return synthesize(state, context, true);
}
