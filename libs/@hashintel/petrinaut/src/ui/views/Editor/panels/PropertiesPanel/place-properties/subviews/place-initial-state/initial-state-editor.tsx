import { use, useMemo } from "react";

import { defaultTokenAttributeValue } from "@hashintel/petrinaut-core";

import { PlaybackContext } from "../../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { Spreadsheet } from "../../../../../../../components/spreadsheet";

import type {
  SpreadsheetCellValue,
  SpreadsheetColumn,
} from "../../../../../../../components/spreadsheet";
import type { Color, Place, TokenRecord } from "@hashintel/petrinaut-core";

const getDefaultValue = (column: SpreadsheetColumn): SpreadsheetCellValue =>
  column.type ? defaultTokenAttributeValue(column.type) : 0;

/**
 * InitialStateEditor - A component for editing initial tokens in a place
 * Stores data in SimulationStore, not in the Place definition
 */
interface InitialStateEditorProps {
  place: Place;
  placeType: Color;
  /** Force read-only mode (e.g. when state is defined by a scenario). */
  readOnly?: boolean;
}

export const InitialStateEditor: React.FC<InitialStateEditorProps> = ({
  place,
  placeType,
  readOnly = false,
}) => {
  const { initialMarking, setInitialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(PlaybackContext);

  const hasSimulation = totalFrames > 0;

  // Convert placeType elements to generic columns
  const columns: SpreadsheetColumn[] = useMemo(
    () =>
      placeType.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
        type: element.type,
      })),
    [placeType.elements],
  );

  // Convert current frame data or serializable initial marking to spreadsheet rows.
  const data: SpreadsheetCellValue[][] = useMemo(() => {
    if (hasSimulation && currentFrameReader) {
      return currentFrameReader
        .getPlaceTokens(place, placeType)
        .map((token) =>
          columns.map(
            (column) => token[column.name] ?? getDefaultValue(column),
          ),
        );
    }

    const marking = initialMarking[place.id];
    if (!Array.isArray(marking)) {
      return [];
    }

    return marking.map((token) =>
      columns.map((column) => token[column.name] ?? getDefaultValue(column)),
    );
  }, [
    hasSimulation,
    currentFrameReader,
    place,
    placeType,
    columns,
    initialMarking,
  ]);

  // Convert spreadsheet rows back to serializable token records.
  const handleChange = useMemo(() => {
    if (hasSimulation || readOnly) {
      return undefined;
    }

    return (newData: SpreadsheetCellValue[][]) => {
      const tokens: TokenRecord[] = newData.map(
        (row) =>
          Object.fromEntries(
            columns.map((column, col) => [
              column.name,
              row[col] ?? getDefaultValue(column),
            ]),
          ) as TokenRecord,
      );
      setInitialMarking(place.id, tokens);
    };
  }, [hasSimulation, readOnly, columns, setInitialMarking, place.id]);

  return <Spreadsheet columns={columns} data={data} onChange={handleChange} />;
};
