import { css } from "@hashintel/ds-helpers/css";
import { use, useMemo } from "react";

import type { SubView } from "../../../components/sub-view/types";
import { compileVisualizer } from "../../../core/simulation/compile-visualizer";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../hooks/use-default-parameter-values";
import { SimulationContext } from "../../../state/simulation-context";
import { usePlacePropertiesContext } from "../panels/PropertiesPanel/place-properties-context";
import { VisualizerErrorBoundary } from "../panels/PropertiesPanel/visualizer-error-boundary";

const visualizerMessageStyle = css({
  padding: "[12px]",
  color: "[#666]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
});

/**
 * PlaceVisualizerOutputContent - Renders the visualizer output for a place.
 * Uses PlacePropertiesContext to access the current place data.
 */
const PlaceVisualizerOutputContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const { simulation, initialMarking, parameterValues, currentViewedFrame } =
    use(SimulationContext);

  // Get default parameter values from SDCPN definition
  const defaultParameterValues = useDefaultParameterValues();

  // Compile visualizer code once when it changes
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

  // If no visualizer code, show nothing
  if (!place.visualizerCode) {
    return (
      <div className={visualizerMessageStyle}>No visualizer code defined</div>
    );
  }

  // Get place type to determine dimensions
  if (!placeType) {
    return <div className={visualizerMessageStyle}>Place has no type set</div>;
  }

  const dimensions = placeType.elements.length;
  const tokens: Record<string, number>[] = [];
  let parameters: Record<string, number | boolean> = {};
  const frameIndex = currentViewedFrame?.number ?? 0;

  // Check if we have simulation frames or use initial marking
  if (simulation && simulation.frames.length > 0) {
    // Use currently viewed simulation frame (need raw frame for buffer access)
    const currentFrame = simulation.frames[frameIndex];
    if (!currentFrame) {
      return (
        <div className={visualizerMessageStyle}>No frame data available</div>
      );
    }

    const placeState = currentFrame.places.get(place.id);
    if (!placeState) {
      return (
        <div className={visualizerMessageStyle}>Place not found in frame</div>
      );
    }

    const { offset, count } = placeState;
    const placeSize = count * dimensions;
    const tokenValues = Array.from(
      currentFrame.buffer.slice(offset, offset + placeSize),
    );

    // Format tokens as array of objects with named dimensions
    for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
      const token: Record<string, number> = {};
      for (let colIndex = 0; colIndex < dimensions; colIndex++) {
        const dimensionName = placeType.elements[colIndex]!.name;
        token[dimensionName] =
          tokenValues[tokenIndex * dimensions + colIndex] ?? 0;
      }
      tokens.push(token);
    }

    // Merge SimulationStore values with SDCPN defaults
    parameters = mergeParameterValues(parameterValues, defaultParameterValues);
  } else {
    // Use initial marking
    const marking = initialMarking.get(place.id);
    if (marking && marking.count > 0) {
      for (let tokenIndex = 0; tokenIndex < marking.count; tokenIndex++) {
        const token: Record<string, number> = {};
        for (let colIndex = 0; colIndex < dimensions; colIndex++) {
          const dimensionName = placeType.elements[colIndex]!.name;
          token[dimensionName] =
            marking.values[tokenIndex * dimensions + colIndex] ?? 0;
        }
        tokens.push(token);
      }
    }

    // Merge SimulationStore values with SDCPN defaults
    parameters = mergeParameterValues(parameterValues, defaultParameterValues);
  }

  // Render the compiled visualizer component
  if (!VisualizerComponent) {
    return (
      <div className={visualizerErrorStyle}>
        Failed to compile visualizer code. Check console for errors.
      </div>
    );
  }

  return (
    <VisualizerErrorBoundary>
      <VisualizerComponent tokens={tokens} parameters={parameters} />
    </VisualizerErrorBoundary>
  );
};

/**
 * SubView definition for Place Visualizer Output.
 * Note: This subview requires PlacePropertiesProvider to be in the component tree.
 */
export const placeVisualizerOutputSubView: SubView = {
  id: "place-visualizer-output",
  title: "Visualizer Output",
  tooltip:
    "Custom visualization of tokens in this place, defined by the visualizer code.",
  component: PlaceVisualizerOutputContent,
  resizable: {
    defaultHeight: 200,
    minHeight: 100,
    maxHeight: 500,
  },
};
