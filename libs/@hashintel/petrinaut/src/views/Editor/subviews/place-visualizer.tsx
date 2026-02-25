import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useMemo, useState } from "react";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../components/menu";
import { OutlinedSegmentGroup } from "../../../components/outlined-segment-group";
import type { SubView } from "../../../components/sub-view/types";
import { Switch } from "../../../components/switch";
import { Tooltip } from "../../../components/tooltip";
import { UI_MESSAGES } from "../../../constants/ui-messages";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "../../../core/default-codes";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../hooks/use-default-parameter-values";
import { CodeEditor } from "../../../monaco/code-editor";
import { PlaybackContext } from "../../../playback/context";
import { SimulationContext } from "../../../simulation/context";
import { compileVisualizer } from "../../../simulation/simulator/compile-visualizer";
import { EditorContext } from "../../../state/editor-context";
import { usePlacePropertiesContext } from "../panels/PropertiesPanel/place-properties-context";
import { VisualizerErrorBoundary } from "../panels/PropertiesPanel/visualizer-error-boundary";

type ViewMode = "code" | "preview" | "split";

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const segmentGroupContainerStyle = css({
  marginBottom: "[8px]",
});

const viewContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  gap: "[4px]",
});

const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const messageStyle = css({
  padding: "[12px]",
  fontSize: "[12px]",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
});

const menuButtonStyle = css({
  background: "[transparent]",
  border: "none",
  cursor: "pointer",
  padding: "[4px]",
  display: "flex",
  alignItems: "center",
  fontSize: "[18px]",
  color: "[rgba(0, 0, 0, 0.6)]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "[16px]",
});

/**
 * Renders the visualizer preview for the current place,
 * using simulation frame data or initial marking.
 */
const VisualizerPreview: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const { initialMarking, parameterValues } = use(SimulationContext);
  const { currentFrame, totalFrames } = use(PlaybackContext);

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

  if (totalFrames > 0 && currentFrame) {
    const placeState = currentFrame.places[place.id];
    if (!placeState) {
      return <div className={messageStyle}>Place not found in frame</div>;
    }

    const { offset, count } = placeState;
    const placeSize = count * dimensions;
    const tokenValues = Array.from(
      currentFrame.buffer.slice(offset, offset + placeSize),
    );

    for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
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
      <VisualizerComponent tokens={tokens} parameters={parameters} />
    </VisualizerErrorBoundary>
  );
};

const PlaceVisualizerContent: React.FC = () => {
  const { place, updatePlace } = usePlacePropertiesContext();
  const { totalFrames } = use(PlaybackContext);
  const [viewMode, setViewMode] = useState<ViewMode>("code");

  const hasVisualizer = place.visualizerCode !== undefined;
  const isSimulationRunning = totalFrames > 0;

  if (!hasVisualizer) {
    return (
      <div className={messageStyle}>
        Enable the visualizer to define a custom token visualization for this
        place, viewable when a simulation is running.
      </div>
    );
  }

  const activeMode = isSimulationRunning ? "preview" : viewMode;

  return (
    <div className={contentStyle}>
      {!isSimulationRunning && (
        <div className={segmentGroupContainerStyle}>
          <OutlinedSegmentGroup
            value={viewMode}
            options={[
              { value: "code", label: "Code" },
              { value: "preview", label: "Preview" },
              { value: "split", label: "Split" },
            ]}
            onChange={(value) => setViewMode(value as ViewMode)}
          />
        </div>
      )}

      <div className={viewContainerStyle}>
        {(activeMode === "code" || activeMode === "split") && (
          <div className={panelStyle}>
            <CodeEditor
              path={`inmemory://sdcpn/places/${place.id}/visualizer.tsx`}
              language="typescript"
              height="100%"
              value={place.visualizerCode}
              onChange={(value) => {
                updatePlace(place.id, (existingPlace) => {
                  existingPlace.visualizerCode = value ?? "";
                });
              }}
            />
          </div>
        )}
        {(activeMode === "preview" || activeMode === "split") && (
          <div className={panelStyle}>
            <VisualizerPreview />
          </div>
        )}
      </div>
    </div>
  );
};

const VisualizerHeaderAction: React.FC = () => {
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { globalMode } = use(EditorContext);

  const [savedVisualizerCode, setSavedVisualizerCode] = useState<
    string | undefined
  >(undefined);
  useEffect(() => setSavedVisualizerCode(undefined), [place.id]);

  const hasVisualizer = place.visualizerCode !== undefined;

  return (
    <>
      {globalMode === "edit" && (
        <Switch
          checked={hasVisualizer}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          onCheckedChange={(checked) => {
            if (checked) {
              updatePlace(place.id, (existingPlace) => {
                existingPlace.visualizerCode =
                  savedVisualizerCode ?? DEFAULT_VISUALIZER_CODE;
              });
            } else {
              if (place.visualizerCode) {
                setSavedVisualizerCode(place.visualizerCode);
              }
              updatePlace(place.id, (existingPlace) => {
                existingPlace.visualizerCode = undefined;
              });
            }
          }}
        />
      )}
      {hasVisualizer && globalMode === "edit" && (
        <Menu
          trigger={
            <button type="button" className={menuButtonStyle}>
              <TbDotsVertical />
            </button>
          }
          items={[
            {
              id: "load-default",
              label: "Load default template",
              onClick: () => {
                const currentPlaceType = place.colorId
                  ? types.find((type) => type.id === place.colorId)
                  : null;

                updatePlace(place.id, (existingPlace) => {
                  existingPlace.visualizerCode = currentPlaceType
                    ? generateDefaultVisualizerCode(currentPlaceType)
                    : DEFAULT_VISUALIZER_CODE;
                });
              },
            },
            {
              id: "generate-ai",
              label: (
                <Tooltip
                  content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
                  display="inline"
                >
                  <div className={aiMenuItemStyle}>
                    <TbSparkles className={aiIconStyle} />
                    Generate with AI
                  </div>
                </Tooltip>
              ),
              disabled: true,
              onClick: () => {
                // TODO: Implement AI generation
              },
            },
          ]}
        />
      )}
    </>
  );
};

export const placeVisualizerSubView: SubView = {
  id: "place-visualizer",
  title: "Visualizer",
  tooltip:
    "Custom visualization of tokens in this place, defined by visualizer code.",
  component: PlaceVisualizerContent,
  renderHeaderAction: () => <VisualizerHeaderAction />,
  minHeight: 200,
};
