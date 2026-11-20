import { use } from "react";

import { defaultTokenAttributeValue, toUuid } from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { Spreadsheet } from "../../../../../../../components/spreadsheet";

import type {
  SpreadsheetCellValue,
  SpreadsheetColumn,
} from "../../../../../../../components/spreadsheet";
import type { Color, Place } from "@hashintel/petrinaut-core";

const getDefaultValue = (column: SpreadsheetColumn): SpreadsheetCellValue =>
  column.type ? defaultTokenAttributeValue(column.type) : 0;

/**
 * Converts one stored marking value to a spreadsheet cell value. uuid columns
 * may hold at-rest strings — parse them to bigints for the spreadsheet.
 * String columns keep their text verbatim.
 */
const toCellValue = (
  column: SpreadsheetColumn,
  raw: number | boolean | bigint | string | undefined,
): SpreadsheetCellValue => {
  if (raw === undefined) {
    return getDefaultValue(column);
  }
  if (column.type === "uuid") {
    return toUuid(raw);
  }
  if (column.type === "string") {
    return typeof raw === "string" ? raw : String(raw);
  }
  // Mirror the engine's coercion (parseCellValue in spreadsheet.tsx):
  // integers round, booleans accept "true"/"1" — so the display never
  // disagrees with what the run will use.
  if (typeof raw === "string") {
    if (column.type === "boolean") {
      const normalized = raw.trim().toLowerCase();
      return normalized === "true" || normalized === "1";
    }
    const parsed = Number.parseFloat(raw) || 0;
    return column.type === "integer" ? Math.round(parsed) : parsed;
  }
  return column.type === "integer" && typeof raw === "number"
    ? Math.round(raw)
    : raw;
};

interface InitialStateEditorProps {
  place: Place;
  placeType: Color;
}

/**
 * The tokens of a typed place as a read-only table: those of the current
 * frame while a run has frames, the initial marking otherwise.
 */
export const InitialStateEditor: React.FC<InitialStateEditorProps> = ({
  place,
  placeType,
}) => {
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);

  const columns: SpreadsheetColumn[] = placeType.elements.map((element) => ({
    id: element.elementId,
    name: element.name,
    type: element.type,
  }));
  const marking = initialMarking[place.id];
  const data: SpreadsheetCellValue[][] =
    totalFrames > 0 && currentFrameReader
      ? currentFrameReader
          .getPlaceTokens(place)
          .map((token) =>
            columns.map(
              (column) => token[column.name] ?? getDefaultValue(column),
            ),
          )
      : Array.isArray(marking)
        ? marking.map((token) =>
            columns.map((column) => toCellValue(column, token[column.name])),
          )
        : [];

  return <Spreadsheet columns={columns} data={data} />;
};
