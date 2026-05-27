import { use } from "react";

import { Button, Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { generateDefaultLambdaCode } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { Menu } from "../../../../../../../components/menu";
import { SegmentGroup } from "../../../../../../../components/segment-group";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { useTransitionPropertiesContext } from "../../context";

import type { SubView } from "../../../../../../../components/sub-view/types";

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const segmentGroupContainerStyle = css({
  marginBottom: "[8px]",
});

const infoBoxStyle = css({
  fontSize: "xs",
  color: "[#666]",
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  padding: "[8px]",
  borderRadius: "sm",
  lineHeight: "[1.5]",
  marginBottom: "[8px]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const FiringTimeHeaderAction: React.FC = () => {
  const { transition, updateTransition } = useTransitionPropertiesContext();
  const { globalMode } = use(EditorContext);

  if (globalMode !== "edit") {
    return null;
  }

  return (
    <Menu
      animated
      trigger={
        <Button
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
          label: "Load default template",
          onClick: () => {
            updateTransition({
              transitionId: transition.id,
              update: {
                lambdaCode: generateDefaultLambdaCode(transition.lambdaType),
              },
            });
          },
        },
        {
          id: "generate-ai",
          label: (
            <Tooltip content={UI_MESSAGES.AI_FEATURE_COMING_SOON}>
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
  );
};

const TransitionFiringTimeContent: React.FC = () => {
  const { transition, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();

  return (
    <div className={contentStyle}>
      <div className={segmentGroupContainerStyle}>
        <SegmentGroup
          value={transition.lambdaType}
          options={[
            { value: "predicate", label: "Predicate" },
            { value: "stochastic", label: "Stochastic Rate" },
          ]}
          onChange={(value) => {
            updateTransition({
              transitionId: transition.id,
              update: {
                lambdaType: value as "predicate" | "stochastic",
              },
            });
          }}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>

      <div className={infoBoxStyle}>
        {transition.lambdaType === "predicate"
          ? "Define a boolean guard condition. The transition fires when this function returns true, enabling discrete control flow based on token data."
          : "Return a numeric rate representing the average number of firings per second. The transition fires stochastically according to this rate."}
      </div>

      <CodeEditor
        path={getDocumentUri("transition-lambda", transition.id)}
        language="typescript"
        value={transition.lambdaCode || ""}
        height="100%"
        onChange={(value) => {
          updateTransition({
            transitionId: transition.id,
            update: { lambdaCode: value ?? "" },
          });
        }}
        options={{ readOnly: isReadOnly }}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      />
    </div>
  );
};

export const transitionFiringTimeSubView: SubView = {
  id: "transition-firing-time",
  title: "Firing Time",
  defaultCollapsed: true,
  tooltip:
    "Define the rate at or conditions under which this transition will fire, optionally based on each set of input tokens' data (where input tokens have types).",
  component: TransitionFiringTimeContent,
  renderHeaderAction: () => <FiringTimeHeaderAction />,
  resizable: {
    minHeight: 250,
    maxHeight: 1200,
    defaultHeight: 300,
  },
};
