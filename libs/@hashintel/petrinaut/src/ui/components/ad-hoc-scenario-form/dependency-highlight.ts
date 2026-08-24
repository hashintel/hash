/**
 * Dependency highlighting for the ad-hoc form: given the value the user is
 * focused on, compute which Variable rows, Parameter rows, and value cells
 * are connected to it — the rows its expression reads, and the cells that
 * read it. References follow the form's vocabulary: `scenario.<name>` is a
 * top-level Variable, `parameters.<name>` a net parameter, and a bare name a
 * variable of the enclosing place.
 */

import { adHocSlotKey } from "@hashintel/petrinaut-core";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocValueTarget,
} from "@hashintel/petrinaut-core";

export interface AdHocHighlight {
  /** `net.<name>` for top-level Variables, `<placeId>.<name>` per place. */
  variableKeys: ReadonlySet<string>;
  parameterIds: ReadonlySet<string>;
  /** `adHocSlotKey` of every connected value's expression slot. */
  slotKeys: ReadonlySet<string>;
}

export const EMPTY_AD_HOC_HIGHLIGHT: AdHocHighlight = {
  variableKeys: new Set(),
  parameterIds: new Set(),
  slotKeys: new Set(),
};

export const adHocVariableKey = (
  placeId: string | null,
  name: string,
): string => `${placeId ?? "net"}.${name}`;

interface ExpressionReferences {
  /** Names referenced as `scenario.<name>`. */
  scenario: Set<string>;
  /** Names referenced as `parameters.<name>`. */
  parameters: Set<string>;
  /** Bare identifiers, resolvable against the enclosing place's variables. */
  bare: Set<string>;
}

const referencePattern =
  /(scenario|parameters)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)|(?<!\.)\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;

/** Extracts the identifiers an expression references, by vocabulary. */
export function expressionReferences(expression: string): ExpressionReferences {
  const references: ExpressionReferences = {
    scenario: new Set(),
    parameters: new Set(),
    bare: new Set(),
  };
  for (const match of expression.matchAll(referencePattern)) {
    const [, prefix, prefixedName, bareName] = match;
    if (prefix && prefixedName) {
      references[prefix as "scenario" | "parameters"].add(prefixedName);
    } else if (bareName) {
      references.bare.add(bareName);
    }
  }
  return references;
}

function placeColourElements(
  context: AdHocSynthesisContext,
  placeId: string,
): { name: string }[] {
  const place = context.places.find((candidate) => candidate.id === placeId);
  const colour = place?.colorId
    ? context.types.find((type) => type.id === place.colorId)
    : undefined;
  return colour?.elements ?? [];
}

function fieldNameAt(
  context: AdHocSynthesisContext,
  placeId: string,
  column: number,
): string | undefined {
  return placeColourElements(context, placeId)[column]?.name;
}

function columnIndexOf(
  context: AdHocSynthesisContext,
  placeId: string,
  field: string,
): number | undefined {
  const index = placeColourElements(context, placeId).findIndex(
    (element) => element.name === field,
  );
  return index === -1 ? undefined : index;
}

/** Every expression in the form, with the slot it renders at and its scope. */
function collectExpressions(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): { target: AdHocValueTarget; expression: string }[] {
  const entries: { target: AdHocValueTarget; expression: string }[] = [];
  state.variables.forEach((variable, index) => {
    entries.push({
      target: { kind: "variable", placeId: null, index },
      expression: variable.expression,
    });
  });
  state.netParameters.forEach((entry) => {
    entries.push({
      target: { kind: "netParameter", parameterId: entry.parameterId },
      expression: entry.expression,
    });
  });
  for (const [placeId, place] of Object.entries(state.places)) {
    if (place.kind === "uncoloured") {
      entries.push({
        target: { kind: "count", placeId, row: null },
        expression: place.count.expression,
      });
      continue;
    }
    place.variables.forEach((variable, index) => {
      entries.push({
        target: { kind: "variable", placeId, index },
        expression: variable.expression,
      });
    });
    for (const [field, shared] of Object.entries(place.sharedColumns)) {
      const column = columnIndexOf(context, placeId, field);
      if (column !== undefined) {
        entries.push({
          target: { kind: "column", placeId, column },
          expression: shared.expression,
        });
      }
    }
    place.rows.forEach((row, rowIndex) => {
      if (row.kind === "template") {
        entries.push({
          target: { kind: "count", placeId, row: rowIndex },
          expression: row.count.expression,
        });
      }
      row.cells.forEach((cell, columnIndex) => {
        entries.push({
          target: { kind: "cell", placeId, row: rowIndex, column: columnIndex },
          expression: cell.expression,
        });
      });
    });
  }
  return entries;
}

/** The expression a target renders, or undefined when it has none. */
function expressionAt(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  target: AdHocValueTarget,
): string | undefined {
  switch (target.kind) {
    case "variable": {
      if (target.placeId === null) {
        return state.variables[target.index]?.expression;
      }
      const place = state.places[target.placeId];
      return place?.kind === "coloured"
        ? place.variables[target.index]?.expression
        : undefined;
    }
    case "netParameter":
      return state.netParameters.find(
        (entry) => entry.parameterId === target.parameterId,
      )?.expression;
    case "count": {
      const place = state.places[target.placeId];
      if (place?.kind === "uncoloured") {
        return place.count.expression;
      }
      if (place?.kind === "coloured" && target.row !== null) {
        const row = place.rows[target.row];
        return row?.kind === "template" ? row.count.expression : undefined;
      }
      return undefined;
    }
    case "cell": {
      const place = state.places[target.placeId];
      return place?.kind === "coloured"
        ? place.rows[target.row]?.cells[target.column]?.expression
        : undefined;
    }
    case "column": {
      const place = state.places[target.placeId];
      if (place?.kind !== "coloured") {
        return undefined;
      }
      const field = fieldNameAt(context, target.placeId, target.column);
      return field ? place.sharedColumns[field]?.expression : undefined;
    }
  }
}

/** The place whose variables a target's bare names resolve against. */
function scopePlaceId(target: AdHocValueTarget): string | null {
  switch (target.kind) {
    case "variable":
      return target.placeId;
    case "netParameter":
      return null;
    case "cell":
    case "column":
    case "count":
      return target.placeId;
  }
}

/**
 * The rows and cells connected to the focused value: the Variables and
 * Parameters its expression reads, plus — when the focus is itself a
 * Variable or Parameter — every value that reads it.
 */
export function computeAdHocHighlight(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  focused: AdHocValueTarget | null,
): AdHocHighlight {
  if (focused === null) {
    return EMPTY_AD_HOC_HIGHLIGHT;
  }
  const variableKeys = new Set<string>();
  const parameterIds = new Set<string>();
  const slotKeys = new Set<string>();

  // Dependencies: what the focused expression reads.
  const expression = expressionAt(state, context, focused);
  if (expression) {
    const references = expressionReferences(expression);
    for (const name of references.scenario) {
      if (state.variables.some((variable) => variable.name === name)) {
        variableKeys.add(adHocVariableKey(null, name));
      }
    }
    for (const name of references.parameters) {
      const parameter = context.netParameters.find(
        (candidate) => candidate.variableName === name,
      );
      if (parameter) {
        parameterIds.add(parameter.id);
      }
    }
    const scope = scopePlaceId(focused);
    if (scope !== null) {
      const place = state.places[scope];
      if (place?.kind === "coloured") {
        for (const name of references.bare) {
          if (place.variables.some((variable) => variable.name === name)) {
            variableKeys.add(adHocVariableKey(scope, name));
          }
        }
      }
    }
  }

  // Dependents: what reads the focused Variable or Parameter.
  const readsFocused = (():
    | ((references: ExpressionReferences, scope: string | null) => boolean)
    | null => {
    if (focused.kind === "variable") {
      if (focused.placeId === null) {
        const name = state.variables[focused.index]?.name;
        return name ? (references) => references.scenario.has(name) : null;
      }
      const place = state.places[focused.placeId];
      const name =
        place?.kind === "coloured"
          ? place.variables[focused.index]?.name
          : undefined;
      return name
        ? (references, scope) =>
            scope === focused.placeId && references.bare.has(name)
        : null;
    }
    if (focused.kind === "netParameter") {
      const name = context.netParameters.find(
        (parameter) => parameter.id === focused.parameterId,
      )?.variableName;
      return name ? (references) => references.parameters.has(name) : null;
    }
    return null;
  })();

  if (readsFocused) {
    for (const entry of collectExpressions(state, context)) {
      if (
        readsFocused(
          expressionReferences(entry.expression),
          scopePlaceId(entry.target),
        )
      ) {
        slotKeys.add(
          adHocSlotKey({ target: entry.target, part: "expression" }),
        );
      }
    }
  }

  return { variableKeys, parameterIds, slotKeys };
}
