import { use, useMemo } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../react/hooks/use-default-parameter-values";
import { PlaybackContext } from "../../../react/playback/context";
import { SimulationContext } from "../../../react/simulation/context";
import { compileVisualizer } from "../../lib/compile-visualizer";
import { VisualizerErrorBoundary } from "../Editor/panels/PropertiesPanel/place-properties/subviews/place-visualizer/visualizer-error-boundary";

import type { Color, Place } from "@hashintel/petrinaut-core";

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
});

interface PlaceStateVisualizationProps {
  place: Place;
  placeType: Color | null;
}

/**
 * Renders a place's custom visualizer using simulation frame data, falling back
 * to the initial marking when no simulation has run.
 */
export const PlaceStateVisualization: React.FC<
  PlaceStateVisualizationProps
> = ({ place, placeType }) => {
  "use no memo"; // User-authored visualizer code is compiled into a component at runtime.

  const { initialMarking, parameterValues } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(PlaybackContext);

  const defaultParameterValues = useDefaultParameterValues();

  const VisualizerComponent = useMemo(() => {
    if (!place.visualizerCode) {
      return null;
    }
    try {
      return compileVisualizer(place.visualizerCode);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to compile visualizer code:", error);
      return null;
    }
  }, [place.visualizerCode]);

  if (!place.visualizerCode) {
    return <div className={messageStyle}>No visualizer code defined</div>;
  }

  if (!placeType) {
    return <div className={messageStyle}>Place has no type set</div>;
  }

  const dimensions = placeType.elements.length;
  const tokens: Record<string, number>[] = [];
  let parameters: Record<string, number | boolean> = {};

  if (totalFrames > 0 && currentFrameReader) {
    const placeTokenValues = currentFrameReader.getPlaceTokenValues(place.id);
    if (!placeTokenValues) {
      return <div className={messageStyle}>Place not found in frame</div>;
    }

    const tokenValues = Array.from(placeTokenValues.values);

    for (
      let tokenIndex = 0;
      tokenIndex < placeTokenValues.count;
      tokenIndex++
    ) {
      const token: Record<string, number> = {};
      for (let colIndex = 0; colIndex < dimensions; colIndex++) {
        const dimensionName = placeType.elements[colIndex]!.name;
        token[dimensionName] =
          tokenValues[tokenIndex * dimensions + colIndex] ?? 0;
      }
      tokens.push(token);
    }

    parameters = mergeParameterValues(parameterValues, defaultParameterValues);
  } else {
    const marking = initialMarking[place.id];
    if (Array.isArray(marking) && marking.length > 0) {
      for (let tokenIndex = 0; tokenIndex < marking.length; tokenIndex++) {
        const token: Record<string, number> = {};
        for (let colIndex = 0; colIndex < dimensions; colIndex++) {
          const dimensionName = placeType.elements[colIndex]!.name;
          token[dimensionName] = marking[tokenIndex]?.[dimensionName] ?? 0;
        }
        tokens.push(token);
      }
    }

    parameters = mergeParameterValues(parameterValues, defaultParameterValues);
  }

  if (!VisualizerComponent) {
    return (
      <div className={visualizerErrorStyle}>
        Failed to compile visualizer code. Check console for errors.
      </div>
    );
  }

  return (
    <VisualizerErrorBoundary>
      {/* eslint-disable-next-line react-hooks-js/static-components -- Runtime visualizer code intentionally creates a component from user input. */}
      <VisualizerComponent tokens={tokens} parameters={parameters} />
    </VisualizerErrorBoundary>
  );
};
