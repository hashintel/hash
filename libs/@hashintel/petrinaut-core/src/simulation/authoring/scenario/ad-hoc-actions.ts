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

import type { ColorElementType } from "../../../types/sdcpn";
import type {
  AdHocColouredPlace,
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

/** A sensible starting expression per colour element type. */
const defaultCellExpression = (type: ColorElementType): string => {
  switch (type) {
    case "boolean":
      return "false";
    case "string":
    case "uuid":
      return '""';
    default:
      return "0";
  }
};

const placeElements = (context: AdHocSynthesisContext, placeId: string) => {
  const place = context.places.find((candidate) => candidate.id === placeId);
  const colour = place?.colorId
    ? context.types.find((type) => type.id === place.colorId)
    : undefined;
  return colour?.elements ?? [];
};

export const defaultAdHocCellsFor = (
  context: AdHocSynthesisContext,
  placeId: string,
): AdHocValue[] =>
  placeElements(context, placeId).map((element) =>
    emptyAdHocValue(defaultCellExpression(element.type)),
  );

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

/** A fresh variable name (`variable1`, `variable2`, …) no sibling uses. */
export function newAdHocVariable(existing: AdHocVariable[]): AdHocVariable {
  const names = new Set(existing.map((variable) => variable.name));
  let ordinal = 1;
  while (names.has(`variable${ordinal}`)) {
    ordinal += 1;
  }
  return {
    name: `variable${ordinal}`,
    type: "real",
    expression: "0",
    optimize: null,
  };
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

/** `name` unchanged if free, else `name2`, `name3`, … */
const dedupedName = (name: string, existing: AdHocVariable[]): string => {
  const names = new Set(existing.map((variable) => variable.name));
  if (!names.has(name)) {
    return name;
  }
  let ordinal = 2;
  while (names.has(`${name}${ordinal}`)) {
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
  return {
    ...state,
    places: {
      ...state.places,
      [placeId]: update(adHocPlaceStateFor(state, context, placeId)),
    },
  };
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

/** Applies `update` to the value a target names, creating what it needs. */
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
        return {
          ...state,
          variables: replaceAt(state.variables, target.index, {
            ...variable,
            ...update(variable),
          }),
        };
      }
      return updateColouredPlace(state, context, target.placeId, (place) => {
        const variable = place.variables[target.index];
        return variable
          ? {
              ...place,
              variables: replaceAt(place.variables, target.index, {
                ...variable,
                ...update(variable),
              }),
            }
          : place;
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
      const rest = state.netParameters.filter(
        (candidate) => candidate.parameterId !== target.parameterId,
      );
      return {
        ...state,
        netParameters: [...rest, { ...entry, ...update(entry) }],
      };
    }
    case "cell":
      return updateColouredPlace(state, context, target.placeId, (place) => {
        const row = place.rows[target.row];
        if (!row) {
          return place;
        }
        // A row created before its colour gained an element is shorter than
        // the table; pad it so the edit lands instead of silently dropping.
        const cells = [...row.cells];
        while (cells.length <= target.column) {
          cells.push(emptyAdHocValue(""));
        }
        cells[target.column] = update(cells[target.column]!);
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
        return {
          ...place,
          sharedColumns: { ...place.sharedColumns, [field]: update(shared) },
        };
      });
    case "count":
      return updatePlaceState(state, context, target.placeId, (place) => {
        if (place.kind === "uncoloured") {
          return target.row === null
            ? { ...place, count: update(place.count) }
            : place;
        }
        if (target.row === null) {
          return place;
        }
        const row = place.rows[target.row];
        if (row?.kind !== "template") {
          return place;
        }
        return {
          ...place,
          rows: replaceAt(place.rows, target.row, {
            ...row,
            count: update(row.count),
          }),
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
  if (scope === "topLevel") {
    return expression.replace(
      new RegExp(
        String.raw`\b(scenario\s*\.\s*)${escaped}(?![A-Za-z0-9_$])`,
        "g",
      ),
      `$1${newName}`,
    );
  }
  return expression.replace(
    new RegExp(String.raw`(?<![.\w$])${escaped}(?![A-Za-z0-9_$])`, "g"),
    newName,
  );
}

const rewriteValue = <V extends AdHocValue>(
  value: V,
  rewrite: (expression: string) => string,
): V => ({
  ...value,
  expression: rewrite(value.expression),
  optimize: value.optimize
    ? {
        ...value.optimize,
        min: rewrite(value.optimize.min),
        max: rewrite(value.optimize.max),
        ...(value.optimize.step !== undefined
          ? { step: rewrite(value.optimize.step) }
          : {}),
      }
    : value.optimize,
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
          },
    ),
    sharedColumns: Object.fromEntries(
      Object.entries(place.sharedColumns).map(([field, value]) => [
        field,
        rewriteValue(value, rewrite),
      ]),
    ),
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
): AdHocScenarioState =>
  placeId === null
    ? { ...state, variables: update(state.variables) }
    : updateColouredPlace(state, context, placeId, (place) => ({
        ...place,
        variables: update(place.variables),
      }));

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
      return updateValueAt(state, context, action.target, (value) => ({
        ...value,
        expression: action.expression,
      }));
    case "setDomainField":
      return updateValueAt(state, context, action.target, (value) => {
        if (!value.optimize) {
          return value;
        }
        if (action.field === "scale") {
          return {
            ...value,
            optimize: {
              ...value.optimize,
              scale: action.value === "log" ? "log" : "linear",
            },
          };
        }
        return {
          ...value,
          optimize: { ...value.optimize, [action.field]: action.value },
        };
      });
    case "toggleSelection":
      return updateValueAt(state, context, action.target, (value) =>
        toggleAdHocOptimize(
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
        newAdHocVariable(variables),
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
        return oldName === undefined
          ? state
          : updateVariableList(state, context, action.placeId, (variables) =>
              replaceAt(variables, action.index, {
                ...variables[action.index]!,
                name: action.name,
              }),
            );
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
        return variable
          ? replaceAt(variables, action.index, {
              ...variable,
              type: action.variableType,
            })
          : variables;
      });
    case "deleteVariable":
      return updateVariableList(state, context, action.placeId, (variables) =>
        removeAt(variables, action.index),
      );
    case "duplicateVariable":
      return updateVariableList(state, context, action.placeId, (variables) => {
        const variable = variables[action.index];
        if (!variable) {
          return variables;
        }
        return insertAfter(variables, action.index, {
          ...cloneValue(variable),
          name: dedupedName(variable.name, variables),
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
      return updateColouredPlace(state, context, action.placeId, (place) => ({
        ...place,
        rows: removeAt(place.rows, action.row),
      }));
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
        return row
          ? {
              ...place,
              rows: replaceAt(
                place.rows,
                action.row,
                setAdHocRowKind(row, action.rowKind),
              ),
            }
          : place;
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
