import { use, useEffect, useState } from "react";

import { Toggle, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../../react";
import { useStableCallback } from "../../../../../../../../react/hooks/use-stable-callback";
import { useEditorActions } from "../../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../../react/state/sdcpn-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { useCodeNavigation } from "../../../../../../../monaco/code-navigation";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { CodeTemplateMenu } from "../../../code-template-menu";
import { codeSectionStyle } from "../../../styles";
import { usePlacePropertiesContext } from "../../context";

import type { editor } from "monaco-editor";

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "neutral.fg.muted",
  lineHeight: "[1.5]",
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

export const PlaceVisualizerContent: React.FC = () => {
  const { place } = usePlacePropertiesContext();
  const { updatePlace } = usePetrinautMutations();
  const { readonly } = use(SDCPNContext);
  const { setVisualizerEditorFocus } = useEditorActions();
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
    <div className={codeSectionStyle}>
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

export const VisualizerHeaderAction: React.FC = () => {
  const { place, types } = usePlacePropertiesContext();
  const { updatePlace } = usePetrinautMutations();
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
        <CodeTemplateMenu
          disabled={isReadOnly}
          onLoadDefault={() => {
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
          }}
        />
      )}
    </div>
  );
};
