import { use, useMemo, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "@hashintel/petrinaut-core";

import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../../../../../../react/hooks/use-default-parameter-values";
import { PlaybackContext } from "../../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { Button } from "../../../../../../../components/button";
import { Menu } from "../../../../../../../components/menu";
import { SegmentGroup } from "../../../../../../../components/segment-group";
import { Switch } from "../../../../../../../components/switch";
import { Tooltip } from "../../../../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { compileVisualizer } from "../../../../../../../lib/compile-visualizer";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { usePlacePropertiesContext } from "../../context";
import { VisualizerErrorBoundary } from "./visualizer-error-boundary";

import type { SubView } from "../../../../../../../components/sub-view/types";

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
  fontSize: "xs",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

/**
 * Renders the visualizer preview for the current place,
 * using simulation frame data or initial marking.
 */
const VisualizerPreview: React.FC = () => {
  "use no memo"; // User-authored visualizer code is compiled into a component at runtime.

  const { place, placeType } = usePlacePropertiesContext();

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
          <SegmentGroup
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
                updatePlace({
                  placeId: place.id,
                  update: { visualizerCode: value ?? "" },
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

  const [savedVisualizerCodeState, setSavedVisualizerCodeState] = useState<{
    placeId: string;
    code: string;
  } | null>(null);
  const savedVisualizerCode =
    savedVisualizerCodeState?.placeId === place.id
      ? savedVisualizerCodeState.code
      : undefined;

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
              updatePlace({
                placeId: place.id,
                update: {
                  visualizerCode:
                    savedVisualizerCode ?? DEFAULT_VISUALIZER_CODE,
                },
              });
            } else {
              if (place.visualizerCode) {
                setSavedVisualizerCodeState({
                  placeId: place.id,
                  code: place.visualizerCode,
                });
              }
              updatePlace({
                placeId: place.id,
                update: { visualizerCode: undefined },
              });
            }
          }}
        />
      )}
      {hasVisualizer && globalMode === "edit" && (
        <Menu
          animated
          trigger={
            <Button
              aria-label="More options"
              tooltip="More options"
              tooltipDisplay="inline"
              variant="ghost"
              size="xs"
              iconName="ellipsisVertical"
            />
          }
          items={[
            {
              id: "load-default",
              label: "Load default template",
              onClick: () => {
                const currentPlaceType = place.colorId
                  ? types.find((type) => type.id === place.colorId)
                  : null;

                updatePlace({
                  placeId: place.id,
                  update: {
                    visualizerCode: currentPlaceType
                      ? generateDefaultVisualizerCode(currentPlaceType)
                      : DEFAULT_VISUALIZER_CODE,
                  },
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
                    <Icon name="sparkles" size="sm" />
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
  alwaysShowHeaderAction: true,
  defaultCollapsed: true,
  resizable: {
    minHeight: 200,
    maxHeight: 1200,
    defaultHeight: 300,
  },
};
