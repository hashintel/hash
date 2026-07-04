import { formatUuid, toUuid } from "@hashintel/petrinaut-core";

import type { SpreadsheetCellValue } from "../../../../../components/spreadsheet";
import type { ScenarioFormState } from "./scenario-form";
import type { Color, Place, Scenario } from "@hashintel/petrinaut-core";

/** Row values as persisted in scenario documents (uuids are strings). */
type ScenarioTokenRow = (number | boolean | string)[];

/**
 * Context needed to translate coloured token rows between their at-rest form
 * (uuid columns as canonical strings) and the spreadsheet's runtime form
 * (uuid columns as bigints).
 */
export interface ScenarioTokenRowContext {
  places: Place[];
  typesById: Map<string, Color>;
}

function getPlaceElements(
  context: ScenarioTokenRowContext,
  placeId: string,
): Color["elements"] | undefined {
  const place = context.places.find((p) => p.id === placeId);
  const color = place?.colorId
    ? context.typesById.get(place.colorId)
    : undefined;
  return color?.elements;
}

/**
 * Converts persisted scenario rows into spreadsheet cell values: uuid columns
 * parse (or deterministically convert) to bigints; string columns pass
 * through literally; other columns pass through.
 */
export function scenarioRowsToSpreadsheetData(
  rows: ScenarioTokenRow[],
  elements: Color["elements"] | undefined,
): SpreadsheetCellValue[][] {
  return rows.map((row) =>
    row.map((cell, columnIndex): SpreadsheetCellValue => {
      if (elements?.[columnIndex]?.type === "uuid") {
        return toUuid(cell);
      }
      // String columns are literal text both at rest and in the spreadsheet.
      if (elements?.[columnIndex]?.type === "string") {
        return typeof cell === "string" ? cell : String(cell);
      }
      // Other non-uuid columns are numbers/booleans at rest; coerce any
      // stray strings so the spreadsheet never sees them.
      if (typeof cell === "string") {
        return elements?.[columnIndex]?.type === "boolean"
          ? cell.trim().toLowerCase() === "true"
          : Number.parseFloat(cell) || 0;
      }
      return cell;
    }),
  );
}

/**
 * Converts spreadsheet cell values back into the persisted (JSON-safe) row
 * form: bigint uuid values become canonical lowercase strings.
 */
export function spreadsheetDataToScenarioRows(
  data: SpreadsheetCellValue[][],
  elements: Color["elements"] | undefined,
): ScenarioTokenRow[] {
  return data.map((row) =>
    row.map((cell, columnIndex): number | boolean | string => {
      if (
        elements?.[columnIndex]?.type === "uuid" ||
        typeof cell === "bigint"
      ) {
        return formatUuid(typeof cell === "bigint" ? cell : toUuid(cell));
      }
      return cell;
    }),
  );
}

/**
 * Build a `Scenario` from the form state. Drops the draft `_key` field used
 * for stable React keys in the parameter list, and serializes uuid spreadsheet
 * values (bigints) to canonical strings so the scenario stays JSON-safe.
 *
 * @param state - the form state
 * @param id - the scenario id (use a new UUID for new scenarios, the existing
 *   scenario's id when updating)
 * @param context - places and colour types, used to type token row columns
 */
export function buildScenarioFromFormState(
  state: ScenarioFormState,
  id: string,
  context: ScenarioTokenRowContext,
): Scenario {
  return {
    id,
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    scenarioParameters: state.scenarioParams.map(
      ({ _key: _, ...rest }) => rest,
    ),
    parameterOverrides: state.parameterOverrides,
    initialState: state.initialStateAsCode
      ? { type: "code", content: state.initialStateCode }
      : {
          type: "per_place",
          content: {
            // Uncolored places: expression strings (token count)
            ...state.initialTokenCounts,
            // Colored places: rows × elements, uuids serialized to strings
            ...Object.fromEntries(
              Object.entries(state.initialTokenData).map(([placeId, rows]) => [
                placeId,
                spreadsheetDataToScenarioRows(
                  rows,
                  getPlaceElements(context, placeId),
                ),
              ]),
            ),
          },
        },
  };
}

/**
 * Extracts the coloured token rows from a persisted scenario into spreadsheet
 * form (uuid strings parsed to bigints).
 */
export function buildSpreadsheetDataFromScenario(
  scenario: Scenario,
  context: ScenarioTokenRowContext,
): Record<string, SpreadsheetCellValue[][]> {
  if (scenario.initialState.type !== "per_place") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(scenario.initialState.content).flatMap(([placeId, value]) =>
      Array.isArray(value)
        ? [
            [
              placeId,
              scenarioRowsToSpreadsheetData(
                value,
                getPlaceElements(context, placeId),
              ),
            ],
          ]
        : [],
    ),
  );
}
