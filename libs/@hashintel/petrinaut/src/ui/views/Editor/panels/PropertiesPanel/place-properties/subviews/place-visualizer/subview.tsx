import { use, useEffect, useState } from "react";

import { Button, Icon, Menu, Toggle, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "@hashintel/petrinaut-core";

import { useStableCallback } from "../../../../../../../../react/hooks/use-stable-callback";
import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../../react/state/sdcpn-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { useCodeNavigation } from "../../../../../../../monaco/code-navigation";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { usePlacePropertiesContext } from "../../context";

import type { SubView } from "../../../../../../../components/sub-view/types";
import type { editor } from "monaco-editor";

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "neutral.fg.muted",
  lineHeight: "[1.5]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const PlaceVisualizerContent: React.FC = () => {
  const { place, updatePlace } = usePlacePropertiesContext();
  const { readonly } = use(SDCPNContext);
  const { setVisualizerEditorFocus } = use(EditorContext);
  const { focusRequest, acknowledgeFocus } = useCodeNavigation();
  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor | null>(null);
  const path = getDocumentUri("place-visualizer", place.id);
  const setFocus = useStableCallback(setVisualizerEditorFocus);
  const acknowledge = useStableCallback(acknowledgeFocus);
  const onFocus = useStableCallback(() => setFocus(place.id, true));
  const onBlur = useStableCallback(() => setFocus(place.id, false));

  const hasVisualizer = place.visualizerCode !== undefined;
  useEffect(
    () => () => setFocus(place.id, false),
    [place.id, hasVisualizer, setFocus],
  );
  useEffect(() => {
    if (!editorInstance || focusRequest?.path !== path) return;
    const frame = requestAnimationFrame(() => {
      editorInstance.focus();
      acknowledge(path);
    });
    return () => cancelAnimationFrame(frame);
  }, [editorInstance, focusRequest, path, acknowledge]);

  if (!hasVisualizer) {
    return (
      <div className={messageStyle}>
        Enable the visualizer to define a custom token visualization for this
        place. Its Canvas preview opens while you edit the code.
      </div>
    );
  }

  return (
    <div className={contentStyle}>
      <CodeEditor
        path={path}
        language="typescript"
        height="100%"
        value={place.visualizerCode}
        options={{ readOnly: readonly }}
        onMount={setEditorInstance}
        onEditorFocus={onFocus}
        onEditorBlur={onBlur}
        onChange={(value) =>
          updatePlace({
            placeId: place.id,
            update: { visualizerCode: value ?? "" },
          })
        }
      />
    </div>
  );
};

const VisualizerHeaderAction: React.FC = () => {
  const { place, types, updatePlace } = usePlacePropertiesContext();
  const { readonly: isReadOnly } = use(SDCPNContext);

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
    <div className={headerActionsStyle}>
      <Tooltip
        content={UI_MESSAGES.READ_ONLY_MODE}
        disableTooltip={!isReadOnly}
      >
        <Toggle
          aria-label="Visualizer"
          size="sm"
          tone="success"
          value={hasVisualizer}
          disabled={isReadOnly}
          onChange={(checked) => {
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
      </Tooltip>
      {hasVisualizer && (
        <Menu
          trigger={
            <Button
              disabled={isReadOnly}
              aria-label="More options"
              tooltip="More options"
              variant="ghost"
              size="xs"
              iconName="ellipsisVertical"
            />
          }
          items={[
            {
              id: "load-default",
              text: "Load default template",
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
              text: (
                <Tooltip
                  content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
                  position="bottom"
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
    </div>
  );
};

export const placeVisualizerSubView: SubView = {
  id: "place-visualizer",
  canMaximize: true,
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
