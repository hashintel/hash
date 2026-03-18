import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { IconButton } from "../../../../../../../components/icon-button";
import { Menu } from "../../../../../../../components/menu";
import { SegmentGroup } from "../../../../../../../components/segment-group";
import type { SubView } from "../../../../../../../components/sub-view/types";
import { Tooltip } from "../../../../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { generateDefaultLambdaCode } from "../../../../../../../core/default-codes";
import { ExpressionOutputPanel } from "../../../../../../../expression/expression-output-panel";
import { useExpressionOutput } from "../../../../../../../expression/use-expression-ir-output";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { EditorContext } from "../../../../../../../state/editor-context";
import { useTransitionPropertiesContext } from "../../context";

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const panelGroupStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

const panelStyle = css({
  height: "full",
});

const resizeHandleStyle = css({
  borderLeftWidth: "thin",
  borderLeftColor: "neutral.a20",
  cursor: "ew-resize",
  backgroundColor: "[transparent]",
  transition: "[background-color 0.15s ease]",
  "&[data-separator=hover]": {
    backgroundColor: "neutral.a40",
  },
  "&[data-separator=active]": {
    backgroundColor: "blue.s60",
  },
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

const aiIconStyle = css({
  fontSize: "base",
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
        <IconButton aria-label="More options" size="xs">
          <TbDotsVertical />
        </IconButton>
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
  );
};

const TransitionFiringTimeContent: React.FC = () => {
  const { transition, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();
  const expressionOutput = useExpressionOutput(transition, "Lambda");

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
          ? "Define a boolean guard condition. The transition fires when this function returns true, enabling discrete control flow based on token data."
          : "Return a numeric rate representing the average number of firings per second. The transition fires stochastically according to this rate."}
      </div>

      {expressionOutput !== null ? (
        <Group orientation="vertical" className={panelGroupStyle}>
          <Panel defaultSize={60} minSize={30} className={panelStyle}>
            <CodeEditor
              path={getDocumentUri("transition-lambda", transition.id)}
              language="typescript"
              value={transition.lambdaCode || ""}
              height="100%"
              onChange={(value) => {
                updateTransition(transition.id, (existingTransition) => {
                  existingTransition.lambdaCode = value ?? "";
                });
              }}
              options={{ readOnly: isReadOnly }}
              tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
            />
          </Panel>
          <Separator className={resizeHandleStyle} />
          <Panel minSize={20} className={panelStyle}>
            <ExpressionOutputPanel output={expressionOutput} />
          </Panel>
        </Group>
      ) : (
        <CodeEditor
          path={getDocumentUri("transition-lambda", transition.id)}
          language="typescript"
          value={transition.lambdaCode || ""}
          height="100%"
          onChange={(value) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.lambdaCode = value ?? "";
            });
          }}
          options={{ readOnly: isReadOnly }}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      )}
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
