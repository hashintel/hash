import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../components/menu";
import { OutlinedSegmentGroup } from "../../../components/outlined-segment-group";
import type { SubView } from "../../../components/sub-view/types";
import { Tooltip } from "../../../components/tooltip";
import { UI_MESSAGES } from "../../../constants/ui-messages";
import { generateDefaultLambdaCode } from "../../../core/default-codes";
import { CodeEditor } from "../../../monaco/code-editor";
import { getDocumentUri } from "../../../monaco/editor-paths";
import { EditorContext } from "../../../state/editor-context";
import { useTransitionPropertiesContext } from "../panels/PropertiesPanel/transition-properties-context";

const segmentGroupContainerStyle = css({
  marginBottom: "[8px]",
});

const infoBoxStyle = css({
  fontSize: "[12px]",
  color: "[#666]",
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  padding: "[8px]",
  borderRadius: "[4px]",
  lineHeight: "[1.5]",
  marginBottom: "[8px]",
});

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

const TransitionFiringTimeContent: React.FC = () => {
  const { transition, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();
  const { globalMode } = use(EditorContext);

  return (
    <>
      <div className={segmentGroupContainerStyle}>
        <OutlinedSegmentGroup
          value={transition.lambdaType}
          options={[
            { value: "predicate", label: "Predicate" },
            { value: "stochastic", label: "Stochastic Rate" },
          ]}
          onChange={(value) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.lambdaType = value as
                | "predicate"
                | "stochastic";
            });
          }}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>

      <div className={infoBoxStyle}>
        {transition.lambdaType === "predicate"
          ? "For a simple predicate firing check, define a boolean guard condition that must be satisfied. The transition will fire when the function returns true, enabling discrete control flow."
          : "For a stochastic firing rate, return a value that represents the average rate per second at which the transition will fire."}
      </div>

      <div className={codeHeaderStyle}>
        <div className={codeHeaderLabelStyle}>
          {transition.lambdaType === "predicate"
            ? "Predicate Firing Code"
            : "Stochastic Firing Rate Code"}
        </div>
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
                  updateTransition(transition.id, (existingTransition) => {
                    existingTransition.lambdaCode = generateDefaultLambdaCode(
                      existingTransition.lambdaType,
                    );
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
        path={getDocumentUri("transition-lambda", transition.id)}
        key={`lambda-${transition.lambdaType}-${transition.inputArcs
          .map((a) => `${a.placeId}:${a.weight}`)
          .join("-")}`}
        language="typescript"
        value={transition.lambdaCode || ""}
        height={340}
        onChange={(value) => {
          updateTransition(transition.id, (existingTransition) => {
            existingTransition.lambdaCode = value ?? "";
          });
        }}
        options={{ readOnly: isReadOnly }}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      />
    </>
  );
};

export const transitionFiringTimeSubView: SubView = {
  id: "transition-firing-time",
  title: "Firing Time",
  tooltip:
    "Define the rate at or conditions under which this transition will fire, optionally based on each set of input tokens' data (where input tokens have types).",
  component: TransitionFiringTimeContent,
};
