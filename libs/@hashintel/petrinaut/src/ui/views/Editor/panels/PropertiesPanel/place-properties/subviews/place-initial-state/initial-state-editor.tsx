import { use, useMemo } from "react";

import type { SpreadsheetColumn } from "../../../../../../../components/spreadsheet";
import { Spreadsheet } from "../../../../../../../components/spreadsheet";
import type { Color } from "@hashintel/petrinaut-core/types/sdcpn";
import { PlaybackContext } from "../../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";

/**
 * InitialStateEditor - A component for editing initial tokens in a place
 * Stores data in SimulationStore, not in the Place definition
 */
interface InitialStateEditorProps {
  placeId: string;
  placeType: Color;
  /** Force read-only mode (e.g. when state is defined by a scenario). */
  readOnly?: boolean;
}

export const InitialStateEditor: React.FC<InitialStateEditorProps> = ({
  placeId,
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
      })),
    [placeType.elements],
  );

  // Convert current frame data or serializable initial marking to spreadsheet rows.
  const data: number[][] = useMemo(() => {
    if (hasSimulation && currentFrameReader) {
      const currentMarking = currentFrameReader.getPlaceTokenValues(placeId);
      if (!currentMarking || currentMarking.count === 0) {
        return [];
      }

      const dimensions = columns.length;
      const tokens: number[][] = [];
      for (let i = 0; i < currentMarking.count; i++) {
        const tokenValues: number[] = [];
        for (let colIndex = 0; colIndex < dimensions; colIndex++) {
          tokenValues.push(
            currentMarking.values[i * dimensions + colIndex] ?? 0,
          );
        }
        tokens.push(tokenValues);
      }
      return tokens;
    }

    const marking = initialMarking[placeId];
    if (!Array.isArray(marking)) {
      return [];
    }

    return marking.map((token) =>
      columns.map((column) => token[column.name] ?? 0),
    );
  }, [hasSimulation, currentFrameReader, placeId, columns, initialMarking]);

  // Convert spreadsheet rows back to serializable token records.
  const handleChange = useMemo(() => {
    if (hasSimulation || readOnly) {
      return undefined;
    }

    return (newData: number[][]) => {
      const tokens = newData.map((row) =>
        Object.fromEntries(
          columns.map((column, col) => [column.name, row[col] ?? 0]),
        ),
      );
      setInitialMarking(placeId, tokens);
    };
  }, [hasSimulation, readOnly, columns, setInitialMarking, placeId]);

  return <Spreadsheet columns={columns} data={data} onChange={handleChange} />;
};
