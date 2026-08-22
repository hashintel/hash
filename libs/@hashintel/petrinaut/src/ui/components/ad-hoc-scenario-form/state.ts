/**
 * Immutable update helpers for the ad-hoc scenario form.
 *
 * The behavioural rules (restore-on-toggle, share/un-share retention) live in
 * `@hashintel/petrinaut-core`'s transitions; everything here is plain
 * structural editing of `AdHocScenarioState` so the components stay renders
 * over one state value and an `onChange`.
 */

import type {
  AdHocColouredPlace,
  AdHocPlaceState,
  AdHocRow,
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocValue,
  AdHocVariable,
  Color,
} from "@hashintel/petrinaut-core";

export const EMPTY_AD_HOC_STATE: AdHocScenarioState = {
  variables: [],
  netParameters: [],
  places: {},
};

export const emptyValue = (expression = ""): AdHocValue => ({
  expression,
  optimize: null,
});

/** A sensible starting expression per colour element type. */
const defaultCellExpression = (
  type: Color["elements"][number]["type"],
): string => {
  switch (type) {
    case "boolean":
      return "false";
    case "string":
      return '""';
    case "uuid":
      return '""';
    default:
      return "0";
  }
};

export const defaultCellsFor = (elements: Color["elements"]): AdHocValue[] =>
  elements.map((element) => emptyValue(defaultCellExpression(element.type)));

/**
 * The form edits every place in the net; places the user has not touched are
 * absent from the state, so rendering resolves each place to its state or to
 * this default.
 */
export function placeStateFor(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  placeId: string,
): AdHocPlaceState {
  const existing = state.places[placeId];
  if (existing) {
    return existing;
  }
  const place = context.places.find((candidate) => candidate.id === placeId);
  const coloured = Boolean(place?.colorId);
  return coloured
    ? { kind: "coloured", variables: [], rows: [], sharedColumns: {} }
    : { kind: "uncoloured", count: emptyValue("0") };
}

export function updatePlace(
  state: AdHocScenarioState,
  placeId: string,
  context: AdHocSynthesisContext,
  update: (place: AdHocPlaceState) => AdHocPlaceState,
): AdHocScenarioState {
  return {
    ...state,
    places: {
      ...state.places,
      [placeId]: update(placeStateFor(state, context, placeId)),
    },
  };
}

export function updateColouredPlace(
  state: AdHocScenarioState,
  placeId: string,
  context: AdHocSynthesisContext,
  update: (place: AdHocColouredPlace) => AdHocColouredPlace,
): AdHocScenarioState {
  return updatePlace(state, placeId, context, (place) =>
    place.kind === "coloured" ? update(place) : place,
  );
}

export function updateRow(
  place: AdHocColouredPlace,
  rowIndex: number,
  update: (row: AdHocRow) => AdHocRow,
): AdHocColouredPlace {
  return {
    ...place,
    rows: place.rows.map((row, index) =>
      index === rowIndex ? update(row) : row,
    ),
  };
}

export function updateCell(
  place: AdHocColouredPlace,
  rowIndex: number,
  columnIndex: number,
  update: (cell: AdHocValue) => AdHocValue,
): AdHocColouredPlace {
  return updateRow(place, rowIndex, (row) => ({
    ...row,
    cells: row.cells.map((cell, index) =>
      index === columnIndex ? update(cell) : cell,
    ),
  }));
}

export function replaceVariable(
  variables: AdHocVariable[],
  index: number,
  variable: AdHocVariable,
): AdHocVariable[] {
  return variables.map((existing, position) =>
    position === index ? variable : existing,
  );
}

export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}

/** A fresh variable with a name no sibling already uses. */
export function newVariable(existing: AdHocVariable[]): AdHocVariable {
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
