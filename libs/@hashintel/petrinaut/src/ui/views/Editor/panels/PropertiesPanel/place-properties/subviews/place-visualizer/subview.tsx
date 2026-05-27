import { use, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "@hashintel/petrinaut-core";

import { useEvalSandbox } from "../../../../../../../../react/eval-sandbox/context";
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
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { usePlacePropertiesContext } from "../../context";

import type {
  VisualizerHostHandle,
  VisualizerProps,
} from "../../../../../../../../react/eval-sandbox/interface";
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

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const visualizerHostContainerStyle = css({
  display: "flex",
  flex: "[1]",
  minHeight: "[0]",
});

/**
 * Renders the visualizer preview for the current place via the active
 * {@link EvalSandbox} — see `react/eval-sandbox/`. The host is either:
 *
 * - inline: a React root mounted directly into our DOM container, or
 * - iframe: a sandboxed `<iframe sandbox="allow-scripts">` whose
 *   `src` is the consumer-supplied `/petrinaut-sandbox` page.
 *
 * Either way, this subview only deals with: computing props,
 * mounting/unmounting the host, and forwarding code/prop updates.
 */
const VisualizerPreview: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const { initialMarking, parameterValues } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(PlaybackContext);

  const defaultParameterValues = useDefaultParameterValues();
  const evalSandbox = useEvalSandbox();

  // Compute the visualizer's props (tokens + parameters). When the
  // place has no type or no marking, we surface an explanatory message
  // *instead of* mounting the host, so the user understands why the
  // preview is empty.
  const propsResult = useMemo<
    { kind: "ok"; props: VisualizerProps } | { kind: "message"; text: string }
  >(() => {
    if (!placeType) {
      return { kind: "message", text: "Place has no type set" };
    }

    const dimensions = placeType.elements.length;
    const tokens: Record<string, number>[] = [];

    if (totalFrames > 0 && currentFrameReader) {
      const placeTokenValues = currentFrameReader.getPlaceTokenValues(place.id);
      if (!placeTokenValues) {
        return { kind: "message", text: "Place not found in frame" };
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
    }

    const parameters = mergeParameterValues(
      parameterValues,
      defaultParameterValues,
    );
    return { kind: "ok", props: { tokens, parameters } };
  }, [
    currentFrameReader,
    defaultParameterValues,
    initialMarking,
    parameterValues,
    place.id,
    placeType,
    totalFrames,
  ]);

  // Build the host factory once per sandbox; each subview gets its own
  // mounted instance via `mount({...})` in the effect below.
  const visualizerHost = useMemo(
    () => evalSandbox.createVisualizerHost(),
    [evalSandbox],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VisualizerHostHandle | null>(null);

  // Latest code/props are forwarded through refs (updated by the
  // effects below) so the mount effect doesn't need them as deps —
  // edits go through `setCode`/`setProps` instead of tearing the host
  // down, which is critical for the iframe path.
  const codeRef = useRef<string | undefined>(undefined);
  const propsRef = useRef<VisualizerProps | null>(null);

  const hasCode = place.visualizerCode !== undefined;
  const propsReady = propsResult.kind === "ok";
  const shouldMount = hasCode && propsReady;

  // Effects fire in declaration order, so these ref-update effects
  // run *before* the mount effect on every commit — meaning the mount
  // effect always sees the latest code/props in the refs.
  useEffect(() => {
    codeRef.current = place.visualizerCode;
    handleRef.current?.setCode(place.visualizerCode ?? "");
  }, [place.visualizerCode]);

  useEffect(() => {
    const nextProps = propsResult.kind === "ok" ? propsResult.props : null;
    propsRef.current = nextProps;
    if (nextProps) {
      handleRef.current?.setProps(nextProps);
    }
  }, [propsResult]);

  // Mount/unmount the visualizer host. Re-mount only when the sandbox,
  // place, or "should we be showing the host at all" status flips.
  useEffect(() => {
    if (!shouldMount) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const code = codeRef.current;
    const props = propsRef.current;
    if (!code || !props) {
      return undefined;
    }
    const handle = visualizerHost.mount({ container, code, props });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.dispose();
    };
  }, [place.id, visualizerHost, shouldMount]);

  if (!place.visualizerCode) {
    return <div className={messageStyle}>No visualizer code defined</div>;
  }

  if (propsResult.kind === "message") {
    return <div className={messageStyle}>{propsResult.text}</div>;
  }

  return <div ref={containerRef} className={visualizerHostContainerStyle} />;
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
