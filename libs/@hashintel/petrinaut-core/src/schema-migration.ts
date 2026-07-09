import { coerceToStoredTokenAttributeValue } from "./simulation/engine/token-values";
import { TYPE_POLICIES } from "./simulation/engine/type-policies";

import type { ColorElementType, Color, SDCPN } from "./types/sdcpn";

type ColorElement = Color["elements"][number];

/**
 * A structural edit applied to a colour type's `elements` array. Used to keep
 * positional scenario rows aligned with the schema after the edit.
 *
 * Name-only renames are NOT represented here: scenario rows are positional,
 * so renames require no row migration.
 */
export type TypeElementEdit =
  | { kind: "add"; element: ColorElement }
  | { kind: "remove"; index: number }
  | { kind: "move"; fromIndex: number; toIndex: number }
  | {
      kind: "changeType";
      index: number;
      /** The element AFTER the update was applied. */
      element: ColorElement;
    };

/** JSON-serializable cell value stored in a scenario `per_place` row. */
type ScenarioRowCell = number | boolean | string;

/**
 * Total coercion of a stored row cell to `element`'s type. Falls back to the
 * element type's default value when coercion throws (e.g. `"abc"` → `integer`
 * yields `0`). `uuid` results are stored as canonical lowercase UUID strings.
 */
const coerceStoredCell = (
  element: ColorElement,
  cell: unknown,
): ScenarioRowCell =>
  coerceToStoredTokenAttributeValue(
    element,
    cell,
    `Scenario cell for element "${element.name}"`,
  );

/** The element type's default value in its at-rest scenario-row form. */
const defaultStoredCell = (type: ColorElementType): ScenarioRowCell => {
  const policy = TYPE_POLICIES[type];
  return policy.encodeAtRest(policy.defaultValue);
};

/**
 * For each post-edit column index, computes the pre-edit column index it
 * should read its value from, or `-1` for a freshly-added column.
 */
const buildSourceIndexes = (
  edit: TypeElementEdit,
  postElements: readonly ColorElement[],
): number[] => {
  const sourceIndexes: number[] = [];
  switch (edit.kind) {
    case "add": {
      const addedIndex = postElements.findIndex(
        (element) => element.elementId === edit.element.elementId,
      );
      for (let index = 0; index < postElements.length; index++) {
        sourceIndexes.push(
          index === addedIndex ? -1 : index < addedIndex ? index : index - 1,
        );
      }
      break;
    }
    case "remove": {
      for (let index = 0; index < postElements.length; index++) {
        sourceIndexes.push(index < edit.index ? index : index + 1);
      }
      break;
    }
    case "move": {
      const { fromIndex, toIndex } = edit;
      for (let index = 0; index < postElements.length; index++) {
        if (index === toIndex) {
          sourceIndexes.push(fromIndex);
        } else if (fromIndex < toIndex) {
          sourceIndexes.push(
            index >= fromIndex && index < toIndex ? index + 1 : index,
          );
        } else {
          sourceIndexes.push(
            index > toIndex && index <= fromIndex ? index - 1 : index,
          );
        }
      }
      break;
    }
    case "changeType": {
      for (let index = 0; index < postElements.length; index++) {
        sourceIndexes.push(index);
      }
      break;
    }
  }
  return sourceIndexes;
};

/**
 * Migrates the positional `per_place` scenario rows stored against places
 * coloured by `typeId` after a structural edit to the type's `elements`
 * array.
 *
 * MUST be called inside the same document mutation that applied the edit
 * (i.e. `sdcpn` already reflects the post-edit type), so undo/redo stays
 * atomic. Behaviour per edit kind:
 *
 * - `add`: appends the new element's default value to every row.
 * - `remove`: drops the removed column from every row.
 * - `move`: applies the same permutation the elements array received.
 * - `changeType`: coerces the column's existing values to the new element
 *   type, falling back to the type's default when coercion fails. `uuid`
 *   results are stored as canonical lowercase UUID strings so documents stay
 *   JSON-serializable.
 *
 * Ragged/short rows are filled: missing cells resolve to the owning
 * element's default value. Uncoloured-place expressions (string content) and
 * `code`-mode scenarios are left untouched.
 */
export function migrateScenarioRowsForTypeEdit(
  sdcpn: SDCPN,
  typeId: string,
  edit: TypeElementEdit,
): void {
  const scenarios = sdcpn.scenarios ?? [];
  if (scenarios.length === 0) {
    return;
  }

  const type = [
    ...sdcpn.types,
    ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
  ].find((candidate) => candidate.id === typeId);
  if (!type) {
    return;
  }

  const affectedPlaceIds = new Set(
    [
      ...sdcpn.places,
      ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.places),
    ]
      .filter((place) => place.colorId === typeId)
      .map((place) => place.id),
  );
  if (affectedPlaceIds.size === 0) {
    return;
  }

  const sourceIndexes = buildSourceIndexes(edit, type.elements);
  const coerceIndex = edit.kind === "changeType" ? edit.index : -1;

  for (const scenario of scenarios) {
    if (scenario.initialState.type !== "per_place") {
      continue;
    }
    const content = scenario.initialState.content;
    for (const placeId of affectedPlaceIds) {
      const rows = content[placeId];
      if (!Array.isArray(rows)) {
        // Absent, or a string expression (uncoloured-place count).
        continue;
      }
      for (const [rowIndex, row] of rows.entries()) {
        rows[rowIndex] = type.elements.map((element, columnIndex) => {
          const sourceIndex = sourceIndexes[columnIndex]!;
          const cell = sourceIndex >= 0 ? row[sourceIndex] : undefined;
          if (columnIndex === coerceIndex) {
            return coerceStoredCell(element, cell);
          }
          return cell ?? defaultStoredCell(element.type);
        });
      }
    }
  }
}
