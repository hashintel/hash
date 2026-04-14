import { use, useMemo } from "react";

import type { SpreadsheetColumn } from "../../../../../../../components/spreadsheet";
import { Spreadsheet } from "../../../../../../../components/spreadsheet";
import type { Color } from "../../../../../../../core/types/sdcpn";
import { PlaybackContext } from "../../../../../../../playback/context";
import { SimulationContext } from "../../../../../../../simulation/context";

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
  const { currentFrame, totalFrames } = use(PlaybackContext);

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

  // Get current marking for this place - either from simulation frame or initial marking
  const currentMarking = useMemo(() => {
    if (hasSimulation && currentFrame) {
      const placeState = currentFrame.places[placeId];
      if (!placeState) {
        return null;
      }

      const { offset, count, dimensions } = placeState;
      const placeSize = count * dimensions;
      const values = currentFrame.buffer.slice(offset, offset + placeSize);

      return { values, count };
    }

    return initialMarking.get(placeId) ?? null;
  }, [hasSimulation, currentFrame, initialMarking, placeId]);

  // Convert Float64Array marking data to number[][] for the Spreadsheet
  const data: number[][] = useMemo(() => {
    if (!currentMarking || currentMarking.count === 0) {
      return [];
    }

    const dimensions = columns.length;
    const tokens: number[][] = [];
    for (let i = 0; i < currentMarking.count; i++) {
      const tokenValues: number[] = [];
      for (let colIndex = 0; colIndex < dimensions; colIndex++) {
        tokenValues.push(currentMarking.values[i * dimensions + colIndex] ?? 0);
      }
      tokens.push(tokenValues);
    }
    return tokens;
  }, [currentMarking, columns.length]);

  // Convert number[][] back to Float64Array and save to simulation store
  const handleChange = useMemo(() => {
    if (hasSimulation || readOnly) {
      return undefined;
    }

    return (newData: number[][]) => {
      const dimensions = columns.length;
      const count = newData.length;
      const values = new Float64Array(count * dimensions);

      for (let i = 0; i < count; i++) {
        for (let col = 0; col < dimensions; col++) {
          values[i * dimensions + col] = newData[i]?.[col] ?? 0;
        }
      }

      setInitialMarking(placeId, { values, count });
    };
  }, [hasSimulation, columns.length, setInitialMarking, placeId]);

  return <Spreadsheet columns={columns} data={data} onChange={handleChange} />;
};
