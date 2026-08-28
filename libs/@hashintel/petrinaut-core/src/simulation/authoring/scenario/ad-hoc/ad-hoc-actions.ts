/**
 * The ad-hoc form's editing model as serializable actions over
 * {@link AdHocScenarioState}, mirroring the net editor's named mutations:
 * each action has a zod input schema, `applyAdHocAction` is the pure
 * reducer, and `adHocActionCoalescingKey` names the actions that collapse
 * into one undo entry when dispatched consecutively (typing bursts).
 */

import { z } from "zod";

import {
  AD_HOC_DEFAULT_COUNT_OPTIMIZE,
  AD_HOC_DEFAULT_OPTIMIZE,
  adHocSlotKey,
  setAdHocRowKind,
  shareAdHocColumn,
  toggleAdHocOptimize,
  unshareAdHocColumn,
} from "./ad-hoc-scenario";

import type {
  AdHocColouredPlace,
  AdHocOptimizeSettings,
  AdHocPlaceState,
  AdHocRow,
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocValue,
  AdHocValueTarget,
  AdHocVariable,
} from "./ad-hoc-scenario";

// -- Action schemas -----------------------------------------------------------------

const placeIdSchema = z.string().min(1);
const indexSchema = z.number().int().nonnegative();

export const adHocValueTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("variable"),
    placeId: placeIdSchema.nullable(),
    index: indexSchema,
  }),
  z.strictObject({
    kind: z.literal("netParameter"),
    parameterId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("cell"),
    placeId: placeIdSchema,
    row: indexSchema,
    column: indexSchema,
  }),
  z.strictObject({
    kind: z.literal("column"),
    placeId: placeIdSchema,
    column: indexSchema,
  }),
  z.strictObject({
    kind: z.literal("count"),
    placeId: placeIdSchema,
    row: indexSchema.nullable(),
  }),
]) satisfies z.ZodType<AdHocValueTarget>;

const variableTypeSchema = z.enum(["real", "integer", "boolean"]);

export const adHocActionInputSchemas = {
  setExpression: z
    .strictObject({
      target: adHocValueTargetSchema,
      expression: z.string(),
    })
    .meta({ description: "Set the expression a value slot holds." }),
  setDomainField: z
    .strictObject({
      target: adHocValueTargetSchema,
      field: z.enum(["min", "max", "step", "scale"]),
      value: z.string(),
    })
    .meta({
      description:
        "Set one field of a selected value's domain (bounds, step, or scale).",
    }),
  toggleSelection: z
    .strictObject({ target: adHocValueTargetSchema, on: z.boolean() })
    .meta({
      description:
        "Turn a value's selection (Optimize / Control) on or off; bounds are retained across toggles.",
    }),
  addVariable: z.strictObject({ placeId: placeIdSchema.nullable() }).meta({
    description:
      "Append a fresh Variable (top-level when placeId is null) with a generated unique name.",
  }),
  renameVariable: z
    .strictObject({
      placeId: placeIdSchema.nullable(),
      index: indexSchema,
      name: z.string(),
      /** Also rewrite every expression referencing the old name. */
      rewriteReferences: z.boolean().optional(),
    })
    .meta({
      description: "Rename a Variable, optionally rewriting references.",
    }),
  setVariableType: z
    .strictObject({
      placeId: placeIdSchema.nullable(),
      index: indexSchema,
      variableType: variableTypeSchema,
    })
    .meta({ description: "Set a Variable's declared type." }),
  setVariableExposed: z
    .strictObject({
      index: indexSchema,
      exposed: z.boolean(),
    })
    .meta({
      description:
        "Expose a top-level Variable as a scenario parameter, or withdraw it. The synthesized scenario declares a parameter named after the Variable, defaulting to its (constant) expression.",
    }),
  deleteVariable: z
    .strictObject({ placeId: placeIdSchema.nullable(), index: indexSchema })
    .meta({ description: "Delete a Variable." }),
  duplicateVariable: z
    .strictObject({ placeId: placeIdSchema.nullable(), index: indexSchema })
    .meta({
      description:
        "Insert a copy of a Variable after it, with a unique derived name.",
    }),
  addTokenRow: z
    .strictObject({ placeId: placeIdSchema })
    .meta({ description: "Append a fixed token row with default cells." }),
  deleteTokenRow: z
    .strictObject({ placeId: placeIdSchema, row: indexSchema })
    .meta({ description: "Delete a token row." }),
  duplicateTokenRow: z
    .strictObject({ placeId: placeIdSchema, row: indexSchema })
    .meta({ description: "Insert a copy of a token row after it." }),
  setTokenRowKind: z
    .strictObject({
      placeId: placeIdSchema,
      row: indexSchema,
      rowKind: z.enum(["fixed", "dynamic", "optimized"]),
    })
    .meta({
      description:
        "Set a token row's kind; counts and bounds are retained across changes.",
    }),
  shareColumn: z
    .strictObject({
      placeId: placeIdSchema,
      field: z.string().min(1),
      column: indexSchema,
    })
    .meta({
      description: "Share one value across a column; cells are kept intact.",
    }),
  unshareColumn: z
    .strictObject({ placeId: placeIdSchema, field: z.string().min(1) })
    .meta({
      description:
        "Release a shared column; its cells reappear exactly as they were.",
    }),
} as const;

export type AdHocActionName = keyof typeof adHocActionInputSchemas;
export type AdHocActionInput<Name extends AdHocActionName> = z.infer<
  (typeof adHocActionInputSchemas)[Name]
>;

/** One serializable edit of the form state. */
export type AdHocAction = {
  [Name in AdHocActionName]: { type: Name } & AdHocActionInput<Name>;
}[AdHocActionName];

/**
 * The key under which consecutive dispatches collapse into one undo entry
 * (typing in one slot), or `null` for actions that always stand alone.
 */
export function adHocActionCoalescingKey(action: AdHocAction): string | null {
  switch (action.type) {
    case "setExpression":
      return `expression:${adHocSlotKey({ target: action.target, part: "expression" })}`;
    case "setDomainField":
      return action.field === "scale"
        ? null
        : `domain:${adHocSlotKey({ target: action.target, part: action.field })}`;
    case "renameVariable":
      return action.rewriteReferences
        ? null
        : `name:${adHocSlotKey({
            target: {
              kind: "variable",
              placeId: action.placeId,
              index: action.index,
            },
            part: "name",
          })}`;
    default:
      return null;
  }
}

// -- State helpers -----------------------------------------------------------------

export const EMPTY_AD_HOC_STATE: AdHocScenarioState = {
  variables: [],
  netParameters: [],
  places: {},
};

export const emptyAdHocValue = (expression = ""): AdHocValue => ({
  expression,
  optimize: null,
});

const placeElements = (context: AdHocSynthesisContext, placeId: string) => {
  const place = context.places.find((candidate) => candidate.id === placeId);
  const colour = place?.colorId
    ? context.types.find((type) => type.id === place.colorId)
    : undefined;
  return colour?.elements ?? [];
};

// Cells start empty: an empty expression synthesizes as the element type's
// neutral value, and the form shows that neutral grayed as a placeholder.
export const defaultAdHocCellsFor = (
  context: AdHocSynthesisContext,
  placeId: string,
): AdHocValue[] => placeElements(context, placeId).map(() => emptyAdHocValue());

/**
 * The form edits every place in the net; places the user has not touched are
 * absent from the state, so reading resolves each place to its state or to
 * this default.
 */
export function adHocPlaceStateFor(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string,
): AdHocPlaceState {
  const existing = state.places[placeId];
  if (existing) {
    return existing;
  }
  const place = context.places.find((candidate) => candidate.id === placeId);
  return place?.colorId
    ? { kind: "coloured", variables: [], rows: [], sharedColumns: {} }
    : { kind: "uncoloured", count: emptyAdHocValue("0") };
}

/**
 * A fresh variable name (`variable1`, `variable2`, …) no sibling uses and
 * no reserved name claims. Synthesis rejects a per-place Variable whose name
 * equals a top-level one, so generation must avoid the other scope too.
 */
export function newAdHocVariable(
  existing: AdHocVariable[],
  reserved: ReadonlySet<string> = new Set(),
): AdHocVariable {
  const names = new Set(existing.map((variable) => variable.name));
  let ordinal = 1;
  while (
    names.has(`variable${ordinal}`) ||
    reserved.has(`variable${ordinal}`)
  ) {
    ordinal += 1;
  }
  return {
    name: `variable${ordinal}`,
    type: "real",
    expression: "0",
    optimize: null,
  };
}

/**
 * The names a fresh Variable in the given scope must not take, beyond its
 * own siblings: every per-place name for a top-level Variable, the
 * top-level names for a per-place one (shadowing is a synthesis error).
 */
function reservedVariableNames(
  state: AdHocScenarioState,
  placeId: string | null,
): Set<string> {
  const names = new Set<string>();
  if (placeId === null) {
    for (const place of Object.values(state.places)) {
      if (place.kind === "coloured") {
        for (const variable of place.variables) {
          names.add(variable.name);
        }
      }
    }
  } else {
    for (const variable of state.variables) {
      names.add(variable.name);
    }
  }
  return names;
}

const cloneValue = <V extends AdHocValue>(value: V): V => ({
  ...value,
  optimize: value.optimize ? { ...value.optimize } : null,
  ...(value.retainedOptimize
    ? { retainedOptimize: { ...value.retainedOptimize } }
    : {}),
});

const cloneRow = (row: AdHocRow): AdHocRow =>
  row.kind === "template"
    ? {
        ...row,
        count: cloneValue(row.count),
        cells: row.cells.map(cloneValue),
      }
    : {
        ...row,
        cells: row.cells.map(cloneValue),
        ...(row.retainedCount
          ? { retainedCount: cloneValue(row.retainedCount) }
          : {}),
      };

const cloneValueRecord = (
  record: Record<string, AdHocValue>,
): Record<string, AdHocValue> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, cloneValue(value)]),
  );

/** A deep copy of an ad-hoc definition (plain JSON data throughout). */
export function cloneAdHocScenarioState(
  state: AdHocScenarioState,
): AdHocScenarioState {
  return {
    variables: state.variables.map(cloneValue),
    netParameters: state.netParameters.map(cloneValue),
    places: Object.fromEntries(
      Object.entries(state.places).map(([placeId, place]) => [
        placeId,
        place.kind === "uncoloured"
          ? { ...place, count: cloneValue(place.count) }
          : {
              ...place,
              variables: place.variables.map(cloneValue),
              rows: place.rows.map(cloneRow),
              sharedColumns: cloneValueRecord(place.sharedColumns),
              ...(place.retainedSharedColumns
                ? {
                    retainedSharedColumns: cloneValueRecord(
                      place.retainedSharedColumns,
                    ),
                  }
                : {}),
            },
      ]),
    ),
  };
}

/** `name` unchanged if free, else `name2`, `name3`, … */
const dedupedName = (
  name: string,
  existing: AdHocVariable[],
  reserved: ReadonlySet<string>,
): string => {
  const names = new Set(existing.map((variable) => variable.name));
  const taken = (candidate: string) =>
    names.has(candidate) || reserved.has(candidate);
  if (!taken(name)) {
    return name;
  }
  let ordinal = 2;
  while (taken(`${name}${ordinal}`)) {
    ordinal += 1;
  }
  return `${name}${ordinal}`;
};

const replaceAt = <T>(items: T[], index: number, item: T): T[] =>
  items.map((existing, position) => (position === index ? item : existing));

const removeAt = <T>(items: T[], index: number): T[] =>
  items.filter((_, position) => position !== index);

const insertAfter = <T>(items: T[], index: number, item: T): T[] => [
  ...items.slice(0, index + 1),
  item,
  ...items.slice(index + 1),
];

function updatePlaceState(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string,
  update: (place: AdHocPlaceState) => AdHocPlaceState,
): AdHocScenarioState {
  const base = adHocPlaceStateFor(state, context, placeId);
  const next = update(base);
  // A no-op update leaves the state alone — in particular, a place absent
  // from the state is not materialized by an action that did nothing to it.
  if (next === base) {
    return state;
  }
  return { ...state, places: { ...state.places, [placeId]: next } };
}

function updateColouredPlace(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string,
  update: (place: AdHocColouredPlace) => AdHocColouredPlace,
): AdHocScenarioState {
  return updatePlaceState(state, context, placeId, (place) =>
    place.kind === "coloured" ? update(place) : place,
  );
}

/**
 * Applies `update` to the value a target names, creating what it needs. An
 * `update` that returns its input unchanged leaves the whole state
 * unchanged, reference included — the reducer's no-op contract rests on it.
 */
function updateValueAt(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  target: AdHocValueTarget,
  update: (value: AdHocValue) => AdHocValue,
): AdHocScenarioState {
  switch (target.kind) {
    case "variable": {
      if (target.placeId === null) {
        const variable = state.variables[target.index];
        if (!variable) {
          return state;
        }
        const next = update(variable);
        if (next === variable) {
          return state;
        }
        return {
          ...state,
          variables: replaceAt(state.variables, target.index, {
            ...variable,
            ...next,
          }),
        };
      }
      return updateColouredPlace(state, context, target.placeId, (place) => {
        const variable = place.variables[target.index];
        if (!variable) {
          return place;
        }
        const next = update(variable);
        if (next === variable) {
          return place;
        }
        return {
          ...place,
          variables: replaceAt(place.variables, target.index, {
            ...variable,
            ...next,
          }),
        };
      });
    }
    case "netParameter": {
      const existing = state.netParameters.find(
        (entry) => entry.parameterId === target.parameterId,
      );
      const entry = existing ?? {
        parameterId: target.parameterId,
        ...emptyAdHocValue(""),
      };
      const next = update(entry);
      // A no-op leaves the state alone — in particular, it does not create
      // an entry for an absent override.
      if (next === entry) {
        return state;
      }
      const rest = state.netParameters.filter(
        (candidate) => candidate.parameterId !== target.parameterId,
      );
      return {
        ...state,
        netParameters: [...rest, { ...entry, ...next }],
      };
    }
    case "cell":
      return updateColouredPlace(state, context, target.placeId, (place) => {
        const row = place.rows[target.row];
        if (!row) {
          return place;
        }
        const current = row.cells[target.column] ?? emptyAdHocValue("");
        const next = update(current);
        if (next === current) {
          return place;
        }
        // A row created before its colour gained an element is shorter than
        // the table; pad it so the edit lands instead of silently dropping.
        const cells = [...row.cells];
        while (cells.length <= target.column) {
          cells.push(emptyAdHocValue(""));
        }
        cells[target.column] = next;
        return {
          ...place,
          rows: replaceAt(place.rows, target.row, { ...row, cells }),
        };
      });
    case "column":
      return updateColouredPlace(state, context, target.placeId, (place) => {
        const field = placeElements(context, target.placeId)[target.column]
          ?.name;
        const shared = field ? place.sharedColumns[field] : undefined;
        if (!field || !shared) {
          return place;
        }
        const next = update(shared);
        if (next === shared) {
          return place;
        }
        return {
          ...place,
          sharedColumns: { ...place.sharedColumns, [field]: next },
        };
      });
    case "count":
      return updatePlaceState(state, context, target.placeId, (place) => {
        if (place.kind === "uncoloured") {
          if (target.row !== null) {
            return place;
          }
          const next = update(place.count);
          return next === place.count ? place : { ...place, count: next };
        }
        if (target.row === null) {
          return place;
        }
        const row = place.rows[target.row];
        if (row?.kind !== "template") {
          return place;
        }
        const next = update(row.count);
        if (next === row.count) {
          return place;
        }
        return {
          ...place,
          rows: replaceAt(place.rows, target.row, { ...row, count: next }),
        };
      });
  }
}

// -- Reference rewriting ----------------------------------------------------------

const escapeForPattern = (name: string): string =>
  name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Rewrites references to a renamed Variable inside one expression:
 * `scenario.<old>` for a top-level Variable, the bare identifier for a
 * per-place one (never after a `.`, so member accesses stay put).
 */
export function rewriteAdHocReference(
  expression: string,
  scope: "topLevel" | "place",
  oldName: string,
  newName: string,
): string {
  const escaped = escapeForPattern(oldName);
  // Replacement functions, not replacement strings: `$` is a legal
  // identifier character, so a plain string would re-expand `$1`/`$$` in
  // the new name. `(?<![.\w$])` before `scenario` keeps member chains
  // rooted in another identifier (`foo.scenario.x`) untouched, matching
  // how dependency detection reads references.
  if (scope === "topLevel") {
    return expression.replace(
      new RegExp(
        String.raw`(?<![.\w$])(scenario\s*\.\s*)${escaped}(?![A-Za-z0-9_$])`,
        "g",
      ),
      (_match, prefix: string) => `${prefix}${newName}`,
    );
  }
  return expression.replace(
    new RegExp(String.raw`(?<![.\w$])${escaped}(?![A-Za-z0-9_$])`, "g"),
    () => newName,
  );
}

const rewriteOptimize = (
  settings: AdHocOptimizeSettings,
  rewrite: (expression: string) => string,
): AdHocOptimizeSettings => ({
  ...settings,
  min: rewrite(settings.min),
  max: rewrite(settings.max),
  ...(settings.step !== undefined ? { step: rewrite(settings.step) } : {}),
});

// The retained stores are rewritten too: they are restore sources (a later
// toggle, kind change, or re-share puts them back into live state), so a
// rename that skipped them would restore dangling references.
const rewriteValue = <V extends AdHocValue>(
  value: V,
  rewrite: (expression: string) => string,
): V => ({
  ...value,
  expression: rewrite(value.expression),
  optimize: value.optimize ? rewriteOptimize(value.optimize, rewrite) : null,
  ...(value.retainedOptimize
    ? { retainedOptimize: rewriteOptimize(value.retainedOptimize, rewrite) }
    : {}),
});

function rewritePlace(
  place: AdHocPlaceState,
  rewrite: (expression: string) => string,
): AdHocPlaceState {
  if (place.kind === "uncoloured") {
    return { ...place, count: rewriteValue(place.count, rewrite) };
  }
  return {
    ...place,
    variables: place.variables.map((variable) =>
      rewriteValue(variable, rewrite),
    ),
    rows: place.rows.map((row) =>
      row.kind === "template"
        ? {
            ...row,
            count: rewriteValue(row.count, rewrite),
            cells: row.cells.map((cell) => rewriteValue(cell, rewrite)),
          }
        : {
            ...row,
            cells: row.cells.map((cell) => rewriteValue(cell, rewrite)),
            ...(row.retainedCount
              ? { retainedCount: rewriteValue(row.retainedCount, rewrite) }
              : {}),
          },
    ),
    sharedColumns: Object.fromEntries(
      Object.entries(place.sharedColumns).map(([field, value]) => [
        field,
        rewriteValue(value, rewrite),
      ]),
    ),
    ...(place.retainedSharedColumns
      ? {
          retainedSharedColumns: Object.fromEntries(
            Object.entries(place.retainedSharedColumns).map(
              ([field, value]) => [field, rewriteValue(value, rewrite)],
            ),
          ),
        }
      : {}),
  };
}

/**
 * Rewrites every expression that can reference the renamed Variable: the
 * whole state for a top-level one, the owning place for a per-place one.
 */
function rewriteReferencesForRename(
  state: AdHocScenarioState,
  placeId: string | null,
  oldName: string,
  newName: string,
): AdHocScenarioState {
  if (placeId === null) {
    const rewrite = (expression: string) =>
      rewriteAdHocReference(expression, "topLevel", oldName, newName);
    return {
      variables: state.variables.map((variable) =>
        rewriteValue(variable, rewrite),
      ),
      netParameters: state.netParameters.map((entry) =>
        rewriteValue(entry, rewrite),
      ),
      places: Object.fromEntries(
        Object.entries(state.places).map(([id, place]) => [
          id,
          rewritePlace(place, rewrite),
        ]),
      ),
    };
  }
  const place = state.places[placeId];
  if (place?.kind !== "coloured") {
    return state;
  }
  const rewrite = (expression: string) =>
    rewriteAdHocReference(expression, "place", oldName, newName);
  return {
    ...state,
    places: { ...state.places, [placeId]: rewritePlace(place, rewrite) },
  };
}

// -- The reducer --------------------------------------------------------------------

const updateVariableList = (
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string | null,
  update: (variables: AdHocVariable[]) => AdHocVariable[],
): AdHocScenarioState => {
  if (placeId === null) {
    const next = update(state.variables);
    return next === state.variables ? state : { ...state, variables: next };
  }
  return updateColouredPlace(state, context, placeId, (place) => {
    const next = update(place.variables);
    return next === place.variables ? place : { ...place, variables: next };
  });
};

/**
 * Applies one action to the form state. Pure; returns the same reference
 * when the action changes nothing.
 */
export function applyAdHocAction(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  action: AdHocAction,
): AdHocScenarioState {
  switch (action.type) {
    case "setExpression":
      return updateValueAt(state, context, action.target, (value) =>
        value.expression === action.expression
          ? value
          : { ...value, expression: action.expression },
      );
    case "setDomainField":
      return updateValueAt(state, context, action.target, (value) => {
        if (!value.optimize) {
          return value;
        }
        if (action.field === "scale") {
          const scale = action.value === "log" ? "log" : "linear";
          return value.optimize.scale === scale
            ? value
            : { ...value, optimize: { ...value.optimize, scale } };
        }
        return value.optimize[action.field] === action.value
          ? value
          : {
              ...value,
              optimize: { ...value.optimize, [action.field]: action.value },
            };
      });
    case "toggleSelection":
      return updateValueAt(state, context, action.target, (value) =>
        (value.optimize !== null) === action.on
          ? value
          : toggleAdHocOptimize(
              value,
              action.on,
              action.target.kind === "count"
                ? AD_HOC_DEFAULT_COUNT_OPTIMIZE
                : AD_HOC_DEFAULT_OPTIMIZE,
            ),
      );
    case "addVariable":
      return updateVariableList(state, context, action.placeId, (variables) => [
        ...variables,
        newAdHocVariable(
          variables,
          reservedVariableNames(state, action.placeId),
        ),
      ]);
    case "renameVariable": {
      const list =
        action.placeId === null
          ? state.variables
          : (() => {
              const place = state.places[action.placeId];
              return place?.kind === "coloured" ? place.variables : undefined;
            })();
      const oldName = list?.[action.index]?.name;
      if (oldName === undefined || oldName === action.name) {
        return state;
      }
      const renamed = updateVariableList(
        state,
        context,
        action.placeId,
        (variables) =>
          replaceAt(variables, action.index, {
            ...variables[action.index]!,
            name: action.name,
          }),
      );
      return action.rewriteReferences
        ? rewriteReferencesForRename(
            renamed,
            action.placeId,
            oldName,
            action.name,
          )
        : renamed;
    }
    case "setVariableType":
      return updateVariableList(state, context, action.placeId, (variables) => {
        const variable = variables[action.index];
        return variable && variable.type !== action.variableType
          ? replaceAt(variables, action.index, {
              ...variable,
              type: action.variableType,
            })
          : variables;
      });
    case "setVariableExposed":
      return updateVariableList(state, context, null, (variables) => {
        const variable = variables[action.index];
        return variable && (variable.exposed ?? false) !== action.exposed
          ? replaceAt(variables, action.index, {
              ...variable,
              exposed: action.exposed,
            })
          : variables;
      });
    case "deleteVariable":
      return updateVariableList(state, context, action.placeId, (variables) =>
        variables[action.index] ? removeAt(variables, action.index) : variables,
      );
    case "duplicateVariable":
      return updateVariableList(state, context, action.placeId, (variables) => {
        const variable = variables[action.index];
        if (!variable) {
          return variables;
        }
        return insertAfter(variables, action.index, {
          ...cloneValue(variable),
          name: dedupedName(
            variable.name,
            variables,
            reservedVariableNames(state, action.placeId),
          ),
        });
      });
    case "addTokenRow":
      return updateColouredPlace(state, context, action.placeId, (place) => ({
        ...place,
        rows: [
          ...place.rows,
          {
            kind: "fixed",
            cells: defaultAdHocCellsFor(context, action.placeId),
          },
        ],
      }));
    case "deleteTokenRow":
      return updateColouredPlace(state, context, action.placeId, (place) =>
        place.rows[action.row]
          ? { ...place, rows: removeAt(place.rows, action.row) }
          : place,
      );
    case "duplicateTokenRow":
      return updateColouredPlace(state, context, action.placeId, (place) => {
        const row = place.rows[action.row];
        return row
          ? {
              ...place,
              rows: insertAfter(place.rows, action.row, cloneRow(row)),
            }
          : place;
      });
    case "setTokenRowKind":
      return updateColouredPlace(state, context, action.placeId, (place) => {
        const row = place.rows[action.row];
        if (!row) {
          return place;
        }
        const next = setAdHocRowKind(row, action.rowKind);
        return next === row
          ? place
          : { ...place, rows: replaceAt(place.rows, action.row, next) };
      });
    case "shareColumn":
      return updateColouredPlace(state, context, action.placeId, (place) =>
        shareAdHocColumn(place, action.field, action.column),
      );
    case "unshareColumn":
      return updateColouredPlace(state, context, action.placeId, (place) =>
        unshareAdHocColumn(place, action.field),
      );
  }
}
