import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { IconButton } from "../../../../../../../components/icon-button";
import { Menu } from "../../../../../../../components/menu";
import type { SubView } from "../../../../../../../components/sub-view/types";
import { Tooltip } from "../../../../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { generateDefaultTransitionKernelCode } from "../../../../../../../core/default-codes";
import { ExpressionOutputPanel } from "../../../../../../../expression/expression-output-panel";
import { useExpressionOutput } from "../../../../../../../expression/use-expression-ir-output";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { EditorContext } from "../../../../../../../state/editor-context";
import { useTransitionPropertiesContext } from "../../context";

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "base",
});

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

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const ResultsHeaderAction: React.FC = () => {
  const { transition, places, types, updateTransition } =
    useTransitionPropertiesContext();
  const { globalMode } = use(EditorContext);

  if (globalMode !== "edit") {
    return null;
  }

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  if (!hasOutputPlaceWithType) {
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
            const inputs = transition.inputArcs
              .map((arc) => {
                const place = places.find((p) => p.id === arc.placeId);
                if (!place || !place.colorId) {
                  return null;
                }
                const type = types.find((t) => t.id === place.colorId);
                if (!type) {
                  return null;
                }
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
                if (!place || !place.colorId) {
                  return null;
                }
                const type = types.find((t) => t.id === place.colorId);
                if (!type) {
                  return null;
                }
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
  );
};

const TransitionResultsContent: React.FC = () => {
  const { transition, places, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();
  const expressionOutput = useExpressionOutput(transition, "TransitionKernel");

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  if (!hasOutputPlaceWithType) {
    return (
      <div className={messageStyle}>
        The Transition Results section is not available because none of the
        output places have a type defined. To enable this feature, assign a type
        to at least one output place.
      </div>
    );
  }

  return (
    <div className={contentStyle}>
      {expressionOutput !== null ? (
        <Group orientation="vertical" className={panelGroupStyle}>
          <Panel defaultSize={60} minSize={30} className={panelStyle}>
            <CodeEditor
              path={getDocumentUri("transition-kernel", transition.id)}
              language="typescript"
              value={transition.transitionKernelCode || ""}
              height="100%"
              onChange={(value) => {
                updateTransition(transition.id, (existingTransition) => {
                  existingTransition.transitionKernelCode = value ?? "";
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
          path={getDocumentUri("transition-kernel", transition.id)}
          language="typescript"
          value={transition.transitionKernelCode || ""}
          height="100%"
          onChange={(value) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.transitionKernelCode = value ?? "";
            });
          }}
          options={{ readOnly: isReadOnly }}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      )}
    </div>
  );
};

export const transitionResultsSubView: SubView = {
  id: "transition-results",
  title: "Transition Results",
  defaultCollapsed: true,
  tooltip:
    "This function determines the data for output tokens, optionally based on the input token data and any global parameters defined.",
  component: TransitionResultsContent,
  renderHeaderAction: () => <ResultsHeaderAction />,
  resizable: {
    minHeight: 300,
    maxHeight: 1200,
    defaultHeight: 500,
  },
};
