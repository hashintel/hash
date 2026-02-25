/* eslint-disable id-length */
/* eslint-disable curly */
import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../components/menu";
import type { SubView } from "../../../components/sub-view/types";
import { Tooltip } from "../../../components/tooltip";
import { UI_MESSAGES } from "../../../constants/ui-messages";
import { generateDefaultTransitionKernelCode } from "../../../core/default-codes";
import { CodeEditor } from "../../../monaco/code-editor";
import { getDocumentUri } from "../../../monaco/editor-paths";
import { EditorContext } from "../../../state/editor-context";
import { useTransitionPropertiesContext } from "../panels/PropertiesPanel/transition-properties-context";

const codeHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
  height: "[30px]",
});

const codeHeaderLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
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

const noOutputTypesBoxStyle = css({
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  padding: "[12px]",
  fontSize: "[12px]",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const noOutputTitleStyle = css({
  fontWeight: "medium",
  marginBottom: "[4px]",
});

const TransitionResultsContent: React.FC = () => {
  const { transition, places, types, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();
  const { globalMode } = use(EditorContext);

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  if (!hasOutputPlaceWithType) {
    return (
      <div className={noOutputTypesBoxStyle}>
        <div className={noOutputTitleStyle}>Transition Results</div>
        <div>
          The Transition Results section is not available because none of the
          output places have a type defined. To enable this feature, assign a
          type to at least one output place.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={codeHeaderStyle}>
        <div className={codeHeaderLabelStyle}>Transition Results Code</div>
        {globalMode === "edit" && (
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
                  const inputs = transition.inputArcs
                    .map((arc) => {
                      const place = places.find((p) => p.id === arc.placeId);
                      if (!place || !place.colorId) return null;
                      const type = types.find((t) => t.id === place.colorId);
                      if (!type) return null;
                      return {
                        placeName: place.name,
                        type,
                        weight: arc.weight,
                      };
                    })
                    .filter((i) => i !== null);

                  const outputs = transition.outputArcs
                    .map((arc) => {
                      const place = places.find((p) => p.id === arc.placeId);
                      if (!place || !place.colorId) return null;
                      const type = types.find((t) => t.id === place.colorId);
                      if (!type) return null;
                      return {
                        placeName: place.name,
                        type,
                        weight: arc.weight,
                      };
                    })
                    .filter((o) => o !== null);

                  updateTransition(transition.id, (existingTransition) => {
                    existingTransition.transitionKernelCode =
                      generateDefaultTransitionKernelCode(inputs, outputs);
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
      </div>
      <CodeEditor
        path={getDocumentUri("transition-kernel", transition.id)}
        language="typescript"
        value={transition.transitionKernelCode || ""}
        height={400}
        onChange={(value) => {
          updateTransition(transition.id, (existingTransition) => {
            existingTransition.transitionKernelCode = value ?? "";
          });
        }}
        options={{ readOnly: isReadOnly }}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      />
    </>
  );
};

export const transitionResultsSubView: SubView = {
  id: "transition-results",
  title: "Transition Results",
  tooltip:
    "This function determines the data for output tokens, optionally based on the input token data and any global parameters defined.",
  component: TransitionResultsContent,
};
