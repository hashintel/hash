/**
 * Ad-hoc scenarios: an inline initial-state + parameters definition compiled
 * into a `Scenario` value at run time and never persisted into the net file.
 *
 * Three shapes cross this module, in pipeline order:
 *
 * 1. {@link AdHocScenarioState} — the form's editing state: per-place token
 *    spreadsheets whose every cell is an expression, rows that are Fixed (one
 *    token) or Dynamic (a count expression's worth of tokens, `kind:
 *    "template"` here) and mix freely within one place, shared column values,
 *    and named Variables at two scopes.
 * 2. {@link AdHocSynthesisOutput} — what synthesis emits: a code-mode
 *    {@link Scenario} (the one initial-state mode whose expressions, loops and
 *    intermediate names the existing `compileScenario` already evaluates in
 *    its hardened sandbox, so nothing in the compiler changes) plus one
 *    {@link AdHocOptimizedField} per enabled Optimize toggle, carrying the
 *    generated parameter's name, its typed domain, and the form location it
 *    came from.
 * 3. The downstream forms: `output.scenario` feeds `compileScenario` directly
 *    (plain runs), and {@link adHocOptimizationBindings} turns the optimized
 *    fields into the `parameterBindings` record of a
 *    `PetrinautOptimizationManifest` (optimization runs).
 *
 * Generated parameters take deterministic names (see
 * {@link adHocParameterName}): they are the join key from optimization
 * results back to the thing the user selected, so they derive from the source
 * rather than from randomness and must stay stable across synthesis runs.
 *
 * Expression vocabulary, matching the scenario code editor: net parameters
 * are `parameters.<name>`; top-level Variables are `scenario.<name>` (they
 * stand in for scenario parameters in this form); per-place Variables are
 * bare names. `i` and `count` are per row: inside a dynamic row, `i` runs
 * from 0 to that row's count minus one and `count` is that row's count; a
 * fixed row sees its position in the place's row list as `i` and `1` as
 * `count`. A shared column's expression evaluates per row in the same scope,
 * so it may read `i`.
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
  /**
   * A bare JavaScript identifier. Top-level Variables are referenced as
   * `scenario.<name>`; per-place Variables by the bare name.
   */
  name: string;
  type: "real" | "integer" | "boolean";
}

/**
 * One spreadsheet row. A fixed row emits one token. A dynamic ("template")
 * row emits its count's worth of tokens, the cells evaluated once per `i`;
 * the count may itself be optimized. The kinds mix freely within a place and
 * cycle from the row gutter: Fixed → Dynamic → count-Optimized → Fixed.
 */
export type AdHocRow =
  | {
      kind: "fixed";
      cells: AdHocValue[];
      /** The count from the row's last dynamic stint, restored on cycling. */
      retainedCount?: AdHocValue;
    }
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
  /**
   * Top-level Variables, referenced as `scenario.<name>`; they stand in for
   * scenario parameters in this form.
   */
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

// -- Value targets and slots -----------------------------------------------------
//
// A target names one value-carrying location in the form state; a slot names
// one editable text within it (the expression, or one optimize bound). Slots
// are the join key between synthesis errors, LSP diagnostics, and the form's
// rendering of both, so their string form must be stable and path-safe.

export type AdHocValueTarget =
  | {
      kind: "variable";
      /** `null` for a top-level Variable, the owning place otherwise. */
      placeId: string | null;
      /** Position in the owning `variables` list. */
      index: number;
    }
  | { kind: "netParameter"; parameterId: string }
  | { kind: "cell"; placeId: string; row: number; column: number }
  | { kind: "column"; placeId: string; column: number }
  | {
      kind: "count";
      placeId: string;
      /** `null` for an uncoloured place's count, the row index otherwise. */
      row: number | null;
    };

export type AdHocValuePart = "expression" | "min" | "max" | "step" | "name";

export interface AdHocSlot {
  target: AdHocValueTarget;
  part: AdHocValuePart;
}

/** Escapes an id so it is safe as one path/URI segment of a slot key. */
const encodeSlotSegment = (value: string): string =>
  encodeURIComponent(value).replace(
    /[.!'()*~]/g,
    (character) => `%${character.charCodeAt(0).toString(16)}`,
  );

/**
 * The stable string form of a slot, safe as a single URI or file path
 * segment. The form computes the same key when rendering a slot, so LSP
 * diagnostics and synthesis errors join back to the right editor.
 */
export function adHocSlotKey(slot: AdHocSlot): string {
  const { target, part } = slot;
  let base: string;
  switch (target.kind) {
    case "variable":
      base =
        target.placeId === null
          ? `var_net_${target.index}`
          : `var_${encodeSlotSegment(target.placeId)}_${target.index}`;
      break;
    case "netParameter":
      base = `param_${encodeSlotSegment(target.parameterId)}`;
      break;
    case "cell":
      base = `cell_${encodeSlotSegment(target.placeId)}_${target.row}_${target.column}`;
      break;
    case "column":
      base = `col_${encodeSlotSegment(target.placeId)}_${target.column}`;
      break;
    case "count":
      base =
        target.row === null
          ? `count_${encodeSlotSegment(target.placeId)}`
          : `count_${encodeSlotSegment(target.placeId)}_${target.row}`;
      break;
  }
  return `${base}.${part}`;
}

/**
 * The user-facing path of a target, in the prototype's attribution notation:
 * `Space › item 0 › x`, `Space › direction`, `Space › angle`, `rate`.
 */
export function adHocTargetLabel(
  target: AdHocValueTarget,
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): string {
  const placeName = (placeId: string): string =>
    context.places.find((place) => place.id === placeId)?.name ?? placeId;
  const elementName = (placeId: string, column: number): string => {
    const place = context.places.find((candidate) => candidate.id === placeId);
    const colour = place?.colorId
      ? context.types.find((type) => type.id === place.colorId)
      : undefined;
    return colour?.elements[column]?.name ?? `column ${column}`;
  };

  switch (target.kind) {
    case "variable": {
      if (target.placeId === null) {
        return (
          state.variables[target.index]?.name ?? `variable ${target.index}`
        );
      }
      const placeState = state.places[target.placeId];
      const name =
        placeState?.kind === "coloured"
          ? (placeState.variables[target.index]?.name ??
            `variable ${target.index}`)
          : `variable ${target.index}`;
      return `${placeName(target.placeId)} › ${name}`;
    }
    case "netParameter":
      return (
        context.netParameters.find(
          (parameter) => parameter.id === target.parameterId,
        )?.name ?? target.parameterId
      );
    case "cell":
      return `${placeName(target.placeId)} › item ${target.row} › ${elementName(target.placeId, target.column)}`;
    case "column":
      return `${placeName(target.placeId)} › ${elementName(target.placeId, target.column)}`;
    case "count":
      return target.row === null
        ? `${placeName(target.placeId)} › count`
        : `${placeName(target.placeId)} › item ${target.row} › count`;
  }
}

// -- Synthesis outcomes -----------------------------------------------------------

export interface AdHocSynthesisError {
  source: "variable" | "cell" | "count" | "netParameter" | "bounds";
  /** The generated parameter name, variable name, or place id that failed. */
  itemId: string;
  /** The slot the error belongs to, for rendering it at the right editor. */
  slot: AdHocSlot;
  message: string;
}

/** One enabled Optimize toggle, resolved to a generated scenario parameter. */
export interface AdHocOptimizedField {
  /** The generated parameter's deterministic `adhoc.*` name. */
  parameterName: string;
  /** The user-facing path of the source, e.g. `Space › item 0 › x`. */
  label: string;
  target: AdHocValueTarget;
  domain: PetrinautOptimizationDomain;
  /** The generated parameter's preview default. */
  default: number;
}

/**
 * What synthesis emits: the generated scenario (never persisted) and one
 * entry per enabled Optimize toggle. `scenario` feeds `compileScenario`
 * directly; {@link adHocOptimizationBindings} turns `optimizedFields` into a
 * manifest's `parameterBindings`.
 */
export interface AdHocSynthesisOutput {
  scenario: Scenario;
  optimizedFields: AdHocOptimizedField[];
}

export type SynthesizeAdHocScenarioOutcome =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: AdHocSynthesisError[] };

export type SynthesizeAdHocOptimizationOutcome =
  | { ok: true; output: AdHocSynthesisOutput }
  | { ok: false; errors: AdHocSynthesisError[] };

/**
 * The transform from synthesis output to an optimization manifest's
 * `parameterBindings`. Every generated parameter is optimized by
 * construction, so every binding is an optimize binding.
 */
export function adHocOptimizationBindings(
  optimizedFields: readonly AdHocOptimizedField[],
): PetrinautOptimizationManifest["scenario"]["parameterBindings"] {
  const bindings: PetrinautOptimizationManifest["scenario"]["parameterBindings"] =
    {};
  for (const field of optimizedFields) {
    bindings[field.parameterName] = { kind: "optimize", domain: field.domain };
  }
  return bindings;
}

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
   * A count: the whole place's for an uncoloured place, one dynamic row's
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
 * identifiers (per-place Variables), `scenario.<name>` members (top-level
 * Variables) and `parameters.<name>` members (net parameters). Purely
 * lexical: it over-approximates (an identifier inside a string literal
 * counts), which errs toward reporting a dependency rather than missing one.
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
  for (const match of expression.matchAll(
    /(?<![.\w$])scenario\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/gu,
  )) {
    names.add(`scenario.${match[1]}`);
  }
  return names;
}

// -- Sandbox evaluation for bounds, defaults and totals ---------------------------

const HELPER_NAMES = Object.keys(SCENARIO_HELPERS);
const HELPER_VALUES = Object.values(SCENARIO_HELPERS);

function freeze<T extends Record<string, unknown>>(record: T): T {
  return Object.freeze(Object.assign(Object.create(null), record)) as T;
}

/**
 * Evaluates one expression in the same hardened shape `compileScenario` uses.
 * The non-optimized top-level Variables are in scope as `scenario.<name>`,
 * built in declaration order so later Variables may read earlier ones. Used
 * for bound expressions (which must resolve to constants at synthesis time),
 * for generated parameters' preview defaults, and for place totals.
 */
function evaluateConstant(
  expression: string,
  parameters: Record<string, number | boolean>,
  variables: readonly { name: string; expression: string }[],
): unknown {
  const assignments = variables
    .map(
      ({ name, expression: value }) =>
        `__adhocVars[${JSON.stringify(name)}] = (${value});`,
    )
    .join("\n");
  const body = [
    `"use strict"; var ${SHADOWED_GLOBALS};`,
    `const __adhocVars = {};`,
    `{`,
    `  const scenario = __adhocVars;`,
    assignments,
    `}`,
    `return (function (scenario) { return (${expression}); })(__adhocVars);`,
  ].join("\n");
  // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored expressions, same sandbox as compileScenario
  const fn = new Function("parameters", "scenario", ...HELPER_NAMES, body) as (
    ...args: unknown[]
  ) => unknown;
  return runSandboxed(() =>
    fn(freeze(parameters), freeze({}), ...HELPER_VALUES),
  );
}

function netParameterDefaults(
  context: AdHocSynthesisContext,
): Record<string, number | boolean> {
  const defaults: Record<string, number | boolean> = {};
  for (const parameter of context.netParameters) {
    defaults[parameter.variableName] =
      parameter.type === "boolean"
        ? parameter.defaultValue === "true" || parameter.defaultValue === "1"
        : Number(parameter.defaultValue);
  }
  return defaults;
}

function constantVariables(
  state: AdHocScenarioState,
): { name: string; expression: string }[] {
  return state.variables
    .filter((variable) => !variable.optimize)
    .map((variable) => ({
      name: variable.name,
      expression: variable.expression,
    }));
}

// -- State transitions ------------------------------------------------------------
//
// The restore rules are model semantics, not component behaviour: toggling
// Optimize must not overwrite the expression, toggling it back restores the
// previous bounds, cycling a row's kind restores its previous count, and
// re-sharing a column restores the most recent shared value. They live here
// so every consumer of the form state gets them.

/** Default bounds a first-time Optimize toggle opens with. */
export const AD_HOC_DEFAULT_OPTIMIZE: AdHocOptimizeSettings = {
  min: "0",
  max: "1",
  scale: "linear",
};

/** Default bounds a count's first-time Optimize opens with. */
export const AD_HOC_DEFAULT_COUNT_OPTIMIZE: AdHocOptimizeSettings = {
  min: "0",
  max: "10",
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
 * Advances a row's kind one step along the gutter cycle: Fixed → Dynamic →
 * count-Optimized → Fixed. Nothing is thrown away: leaving Dynamic retains
 * the count (bounds included) on the fixed row, and returning restores it.
 */
export function cycleAdHocRowKind(row: AdHocRow): AdHocRow {
  if (row.kind === "fixed") {
    const retained = row.retainedCount;
    const count: AdHocValue = retained
      ? { ...toggleAdHocOptimize(retained, false) }
      : { expression: "1", optimize: null };
    const { retainedCount: _restored, ...rest } = row;
    return { ...rest, kind: "template", count };
  }
  if (!row.count.optimize) {
    return {
      ...row,
      count: toggleAdHocOptimize(
        row.count,
        true,
        AD_HOC_DEFAULT_COUNT_OPTIMIZE,
      ),
    };
  }
  return {
    kind: "fixed",
    cells: row.cells,
    retainedCount: toggleAdHocOptimize(row.count, false),
  };
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

// -- Place totals -----------------------------------------------------------------

export type AdHocPlaceTotal =
  | { resolved: true; total: number }
  | { resolved: false; text: string };

/**
 * The token total a place's table shows at its bottom: the sum of every
 * row's count (1 per fixed row). It resolves to a number unless a count is
 * optimized or depends on something that is; then the unresolved parts are
 * printed as they are, joined onto whatever did resolve.
 */
export function resolveAdHocPlaceTotal(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string,
): AdHocPlaceTotal {
  const placeState = state.places[placeId];
  const parameters = netParameterDefaults(context);
  const constants = constantVariables(state);

  const optimizedNames = new Set<string>();
  for (const variable of state.variables) {
    if (variable.optimize) {
      optimizedNames.add(`scenario.${variable.name}`);
    }
  }
  for (const entry of state.netParameters) {
    if (entry.optimize) {
      const parameter = context.netParameters.find(
        (candidate) => candidate.id === entry.parameterId,
      );
      if (parameter) {
        optimizedNames.add(`parameters.${parameter.variableName}`);
      }
    }
  }

  const resolveCount = (count: AdHocValue): number | string => {
    if (count.optimize) {
      return `${count.optimize.min} … ${count.optimize.max}`;
    }
    for (const name of referencedNames(count.expression)) {
      if (optimizedNames.has(name)) {
        return count.expression;
      }
    }
    try {
      const value = evaluateConstant(count.expression, parameters, constants);
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.round(value));
      }
    } catch {
      // Falls through to printing the expression.
    }
    return count.expression;
  };

  let resolvedSum = 0;
  const unresolved: string[] = [];

  if (!placeState) {
    return { resolved: true, total: 0 };
  }
  if (placeState.kind === "uncoloured") {
    const term = resolveCount(placeState.count);
    if (typeof term === "number") {
      return { resolved: true, total: term };
    }
    return { resolved: false, text: term };
  }

  for (const row of placeState.rows) {
    if (row.kind === "fixed") {
      resolvedSum += 1;
      continue;
    }
    const term = resolveCount(row.count);
    if (typeof term === "number") {
      resolvedSum += term;
    } else {
      unresolved.push(term);
    }
  }

  if (unresolved.length === 0) {
    return { resolved: true, total: resolvedSum };
  }
  const parts = resolvedSum > 0 ? [String(resolvedSum)] : [];
  return { resolved: false, text: [...parts, ...unresolved].join(" + ") };
}

// -- Synthesis ------------------------------------------------------------------

interface OptimizedEntity {
  parameterName: string;
  /** What errors and result attribution call this entity. */
  itemId: string;
  target: AdHocValueTarget;
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
  for (const [index, variable] of state.variables.entries()) {
    const target: AdHocValueTarget = { kind: "variable", placeId: null, index };
    const nameError = validateVariableName(variable.name);
    if (nameError) {
      errors.push({
        source: "variable",
        itemId: variable.name,
        slot: { target, part: "name" },
        message: nameError,
      });
      continue;
    }
    if (topLevelNames.has(variable.name)) {
      errors.push({
        source: "variable",
        itemId: variable.name,
        slot: { target, part: "name" },
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
        target,
        type: variable.type,
        settings: variable.optimize,
        expression: variable.expression,
      });
      optimizedReferenceNames.add(`scenario.${variable.name}`);
    }
  }

  for (const entry of state.netParameters) {
    const target: AdHocValueTarget = {
      kind: "netParameter",
      parameterId: entry.parameterId,
    };
    const parameter = parameterById.get(entry.parameterId);
    if (!parameter) {
      errors.push({
        source: "netParameter",
        itemId: entry.parameterId,
        slot: { target, part: "expression" },
        message: `Net parameter "${entry.parameterId}" does not exist.`,
      });
      continue;
    }
    if (includeOptimize && entry.optimize) {
      optimized.push({
        parameterName: adHocParameterName.netParameter(parameter.variableName),
        itemId: parameter.id,
        target,
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
        slot: {
          target: { kind: "count", placeId, row: null },
          part: "expression",
        },
        message: `Place "${placeId}" does not exist.`,
      });
      continue;
    }

    if (placeState.kind === "uncoloured") {
      if (includeOptimize && placeState.count.optimize) {
        optimized.push({
          parameterName: adHocParameterName.count(placeKey),
          itemId: placeId,
          target: { kind: "count", placeId, row: null },
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
        slot: {
          target: { kind: "count", placeId, row: null },
          part: "expression",
        },
        message: `Place "${place.name}" has no colour elements; use an uncoloured entry.`,
      });
      continue;
    }
    const elementByName = new Map(
      elements.map((element, index) => [element.name, { element, index }]),
    );

    const placeVariableNames = new Set<string>();
    for (const [index, variable] of placeState.variables.entries()) {
      const target: AdHocValueTarget = { kind: "variable", placeId, index };
      const nameError = validateVariableName(variable.name);
      if (nameError) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          slot: { target, part: "name" },
          message: nameError,
        });
        continue;
      }
      if (topLevelNames.has(variable.name)) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          slot: { target, part: "name" },
          message: `Variable "${variable.name}" in place "${place.name}" shadows a top-level Variable.`,
        });
        continue;
      }
      if (placeVariableNames.has(variable.name)) {
        errors.push({
          source: "variable",
          itemId: variable.name,
          slot: { target, part: "name" },
          message: `Variable "${variable.name}" is declared twice in place "${place.name}".`,
        });
        continue;
      }
      placeVariableNames.add(variable.name);
      if (includeOptimize && variable.optimize) {
        optimized.push({
          parameterName: adHocParameterName.variable(placeKey, variable.name),
          itemId: variable.name,
          target,
          type: variable.type,
          settings: variable.optimize,
          expression: variable.expression,
        });
        optimizedReferenceNames.add(variable.name);
      }
    }

    for (const [field, shared] of Object.entries(placeState.sharedColumns)) {
      const named = elementByName.get(field);
      if (!named) {
        errors.push({
          source: "cell",
          itemId: adHocParameterName.column(placeKey, field),
          slot: {
            target: { kind: "column", placeId, column: -1 },
            part: "expression",
          },
          message: `Place "${place.name}" has no colour element "${field}" to share.`,
        });
        continue;
      }
      const target: AdHocValueTarget = {
        kind: "column",
        placeId,
        column: named.index,
      };
      if (!includeOptimize || !shared.optimize) {
        continue;
      }
      if (!optimizableElementType(named.element.type)) {
        errors.push({
          source: "cell",
          itemId: adHocParameterName.column(placeKey, field),
          slot: { target, part: "expression" },
          message: `Column "${field}" holds ${named.element.type} values, which cannot be optimized.`,
        });
        continue;
      }
      optimized.push({
        parameterName: adHocParameterName.column(placeKey, field),
        itemId: adHocParameterName.column(placeKey, field),
        target,
        type: named.element.type,
        settings: shared.optimize,
        expression: shared.expression,
      });
    }

    for (const [rowIndex, row] of placeState.rows.entries()) {
      if (includeOptimize && row.kind === "template" && row.count.optimize) {
        optimized.push({
          parameterName: adHocParameterName.count(placeKey, rowIndex),
          itemId: adHocParameterName.count(placeKey, rowIndex),
          target: { kind: "count", placeId, row: rowIndex },
          type: "integer",
          settings: row.count.optimize,
          expression: row.count.expression,
          minimumFloor: 0,
        });
      }

      for (const [columnIndex, cell] of row.cells.entries()) {
        const element = elements[columnIndex];
        const target: AdHocValueTarget = {
          kind: "cell",
          placeId,
          row: rowIndex,
          column: columnIndex,
        };
        if (!element) {
          errors.push({
            source: "cell",
            itemId: `${placeKey}.r${rowIndex}`,
            slot: { target, part: "expression" },
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
            slot: { target, part: "expression" },
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
          target,
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
  optimizedFields: AdHocOptimizedField[];
} {
  const scenarioParameters: ScenarioParameter[] = [];
  const optimizedFields: AdHocOptimizedField[] = [];

  const parameterDefaults = netParameterDefaults(context);
  const constants = constantVariables(state);

  const evaluateBound = (
    entity: OptimizedEntity,
    part: "min" | "max" | "step",
    label: string,
    expression: string,
  ): number | null => {
    for (const identifier of referencedNames(expression)) {
      if (plan.optimizedReferenceNames.has(identifier)) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          slot: { target: entity.target, part },
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
          slot: { target: entity.target, part },
          message: `The ${label} of "${entity.itemId}" evaluated to ${String(value)}, expected a finite number.`,
        });
        return null;
      }
      return value;
    } catch (error) {
      plan.errors.push({
        source: "bounds",
        itemId: entity.parameterName,
        slot: { target: entity.target, part },
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
      const minimum = evaluateBound(
        entity,
        "min",
        "minimum",
        entity.settings.min,
      );
      const maximum = evaluateBound(
        entity,
        "max",
        "maximum",
        entity.settings.max,
      );
      if (minimum === null || maximum === null) {
        continue;
      }
      if (minimum >= maximum) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          slot: { target: entity.target, part: "max" },
          message: `"${entity.itemId}" needs its maximum above its minimum (got ${minimum} and ${maximum}).`,
        });
        continue;
      }
      if (entity.settings.scale === "log" && minimum <= 0) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          slot: { target: entity.target, part: "min" },
          message: `"${entity.itemId}" uses a logarithmic scale, which needs a positive minimum.`,
        });
        continue;
      }
      if (entity.minimumFloor !== undefined && minimum < entity.minimumFloor) {
        plan.errors.push({
          source: "bounds",
          itemId: entity.parameterName,
          slot: { target: entity.target, part: "min" },
          message: `"${entity.itemId}" cannot go below ${entity.minimumFloor}.`,
        });
        continue;
      }
      if (entity.type === "integer") {
        const step = entity.settings.step
          ? evaluateBound(entity, "step", "step", entity.settings.step)
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
            slot: { target: entity.target, part: "min" },
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
    optimizedFields.push({
      parameterName: entity.parameterName,
      label: adHocTargetLabel(entity.target, state, context),
      target: entity.target,
      domain,
      default: defaultValue,
    });
  }

  return { scenarioParameters, optimizedFields };
}

// -- Code generation --------------------------------------------------------------
//
// Inside generated initial-state code, `scenario` is rebound to the ad-hoc
// Variables object so user expressions read `scenario.<variable>` exactly as
// the scenario code editor's expressions read scenario parameters. The
// compiler-provided parameters object (which carries the generated `adhoc.*`
// values during optimization) stays reachable as `__adhocParams`.

/** A generated-parameter reference inside generated initial-state code. */
const initialStateReference = (parameterName: string): string =>
  `__adhocParams[${JSON.stringify(parameterName)}]`;

/** A generated-parameter reference inside a parameter-override expression. */
const overrideReference = (parameterName: string): string =>
  `scenario[${JSON.stringify(parameterName)}]`;

function valueSource(
  value: AdHocValue,
  parameterName: string,
  includeOptimize: boolean,
  reference: (parameterName: string) => string,
): string {
  return includeOptimize && value.optimize
    ? reference(parameterName)
    : `(${value.expression})`;
}

/** The `__adhocVars` assignment lines for the top-level Variables. */
function variableAssignments(
  state: AdHocScenarioState,
  includeOptimize: boolean,
  reference: (parameterName: string) => string,
): string[] {
  return state.variables.map((variable) => {
    const source = valueSource(
      variable,
      adHocParameterName.variable(AD_HOC_TOP_LEVEL_SCOPE, variable.name),
      includeOptimize,
      reference,
    );
    return `__adhocVars[${JSON.stringify(variable.name)}] = ${source};`;
  });
}

/**
 * Wraps a net-parameter override expression so it may read the top-level
 * Variables as `scenario.<name>`. Override expressions are evaluated by
 * `compileScenario` with `scenario` bound to the scenario parameters, so the
 * generated parameters stay reachable while the Variables shadow them.
 */
function wrapOverrideExpression(
  expression: string,
  state: AdHocScenarioState,
  includeOptimize: boolean,
): string {
  if (state.variables.length === 0) {
    return expression;
  }
  const assignments = variableAssignments(
    state,
    includeOptimize,
    overrideReference,
  );
  return [
    `(() => {`,
    `  const __adhocVars = {};`,
    `  {`,
    `    const scenario = __adhocVars;`,
    ...assignments.map((line) => `    ${line}`),
    `  }`,
    `  return (function (scenario) { return (${expression}); })(__adhocVars);`,
    `})()`,
  ].join("\n");
}

function generateInitialStateCode(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  includeOptimize: boolean,
): string {
  const typeById = new Map(context.types.map((type) => [type.id, type]));
  const lines: string[] = [];

  lines.push("const __adhocParams = scenario;");
  lines.push("const __adhocVars = {};");
  lines.push("{");
  lines.push("  const scenario = __adhocVars;");
  for (const assignment of variableAssignments(
    state,
    includeOptimize,
    initialStateReference,
  )) {
    lines.push(`  ${assignment}`);
  }
  lines.push("}");
  lines.push("const __adhocOut = {};");
  lines.push("{");
  lines.push("  const scenario = __adhocVars;");

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
        initialStateReference,
      );
      lines.push(`  __adhocOut[${outKey}] = ${source};`);
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
        initialStateReference,
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
              initialStateReference,
            )
          : valueSource(
              cell,
              adHocParameterName.cell(placeKey, rowIndex, name),
              includeOptimize,
              initialStateReference,
            );
        return `${JSON.stringify(name)}: ${source}`;
      });
      return `{ ${fields.join(", ")} }`;
    };

    lines.push(`  __adhocOut[${outKey}] = (() => {`);
    lines.push("    const __adhocRows = [];");
    for (const [rowIndex, row] of placeState.rows.entries()) {
      if (row.kind === "template") {
        const countSource = valueSource(
          row.count,
          adHocParameterName.count(placeKey, rowIndex),
          includeOptimize,
          initialStateReference,
        );
        lines.push(
          `    {`,
          `      const count = Math.max(0, Math.round(${countSource}));`,
          `      for (let i = 0; i < count; i++) {`,
          ...variableDeclarations.map(
            (declaration) => `        ${declaration}`,
          ),
          `        __adhocRows.push(${rowObject(row, rowIndex)});`,
          `      }`,
          `    }`,
        );
      } else {
        lines.push(
          `    {`,
          `      const i = ${rowIndex};`,
          `      const count = 1;`,
          ...variableDeclarations.map((declaration) => `      ${declaration}`),
          `      __adhocRows.push(${rowObject(row, rowIndex)});`,
          `    }`,
        );
      }
    }
    lines.push("    return __adhocRows;", "  })();");
  }

  lines.push("}");
  lines.push("return __adhocOut;");
  return lines.join("\n");
}

function synthesize(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  includeOptimize: boolean,
):
  | { ok: true; output: AdHocSynthesisOutput }
  | { ok: false; errors: AdHocSynthesisError[] } {
  const plan = collectPlan(state, context, includeOptimize);
  const { scenarioParameters, optimizedFields } = includeOptimize
    ? resolveOptimized(plan, state, context)
    : { scenarioParameters: [], optimizedFields: [] };

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
      parameterOverrides[entry.parameterId] = overrideReference(
        adHocParameterName.netParameter(parameter.variableName),
      );
    } else if (entry.expression.trim() !== "") {
      parameterOverrides[entry.parameterId] = wrapOverrideExpression(
        entry.expression,
        state,
        includeOptimize,
      );
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

  return { ok: true, output: { scenario, optimizedFields } };
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
  return outcome.ok ? { ok: true, scenario: outcome.output.scenario } : outcome;
}

/**
 * Compiles the form state into a scenario whose Optimize selections became
 * generated scenario parameters, plus one {@link AdHocOptimizedField} per
 * selection. Pass the fields through {@link adHocOptimizationBindings} for a
 * manifest's `parameterBindings`; the scenario is never persisted.
 */
export function synthesizeAdHocOptimization(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): SynthesizeAdHocOptimizationOutcome {
  return synthesize(state, context, true);
}
