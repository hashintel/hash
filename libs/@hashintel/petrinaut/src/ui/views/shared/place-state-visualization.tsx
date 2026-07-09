import { use, useMemo } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  coerceTokenAttributeValue,
  defaultTokenAttributeValue,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../react/execution-frame/context";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../react/hooks/use-default-parameter-values";
import { SimulationContext } from "../../../react/simulation/context";
import { compileVisualizer } from "../../lib/compile-visualizer";
import { VisualizerErrorBoundary } from "../Editor/panels/PropertiesPanel/place-properties/subviews/place-visualizer/visualizer-error-boundary";

import type { Color, Place, TokenRecord } from "@hashintel/petrinaut-core";

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
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);

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

  const tokens: TokenRecord[] = [];
  let parameters: Record<string, number | boolean> = {};

  if (totalFrames > 0 && currentFrameReader) {
    tokens.push(...currentFrameReader.getPlaceTokens(place));
    parameters = mergeParameterValues(parameterValues, defaultParameterValues);
  } else {
    const marking = initialMarking[place.id];
    if (Array.isArray(marking) && marking.length > 0) {
      // Marking records may hold uuid values as at-rest strings; coerce them
      // to runtime token values (uuid → bigint) as the engine would. Total
      // per element: a stored value that no longer converts (e.g. legacy
      // data predating a schema edit) falls back to the element's default
      // instead of crashing the panel.
      for (const token of marking) {
        const coerced: TokenRecord = {};
        for (const element of placeType.elements) {
          try {
            coerced[element.name] = coerceTokenAttributeValue(
              element,
              token[element.name],
              `Initial marking for place ${place.name}`,
            );
          } catch {
            coerced[element.name] = defaultTokenAttributeValue(element.type);
          }
        }
        tokens.push(coerced);
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
