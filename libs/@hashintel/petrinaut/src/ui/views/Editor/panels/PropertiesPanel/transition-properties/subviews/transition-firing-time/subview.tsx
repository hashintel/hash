import { SegmentedControl, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  generateDefaultLambdaCode,
  getEffectiveTransitionLambdaType,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../../react";
import { useEditorState } from "../../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { CodeTemplateMenu } from "../../../code-template-menu";
import { codeSectionStyle } from "../../../styles";
import { useTransitionPropertiesContext } from "../../context";

import type { SubView } from "../../../../../../../components/sub-view/types";

const segmentGroupContainerStyle = css({
  marginTop: "[8px]",
  marginBottom: "[8px]",
});

// The SegmentedControl root is `width: fit-content` by default; `&&` doubles the
// selector's specificity so this wins over the recipe regardless of source order.
const fullWidthSegmentedControlStyle = css({
  "&&": { width: "full" },
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

const FiringTimeHeaderAction: React.FC = () => {
  const { logicAvailability, transition } = useTransitionPropertiesContext();
  const { updateTransition } = usePetrinautMutations();
  const globalMode = useEditorState((editor) => editor.globalMode);

  if (globalMode !== "edit" || !logicAvailability.lambda) {
    return null;
  }

  const lambdaType = getEffectiveTransitionLambdaType(
    transition,
    logicAvailability,
  );

  return (
    <CodeTemplateMenu
      onLoadDefault={() => {
        updateTransition({
          transitionId: transition.id,
          update: {
            lambdaType,
            lambdaCode: generateDefaultLambdaCode(lambdaType),
          },
        });
      }}
    />
  );
};

const TransitionFiringTimeContent: React.FC = () => {
  const { logicAvailability, transition } = useTransitionPropertiesContext();
  const { updateTransition } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const lambdaType = getEffectiveTransitionLambdaType(
    transition,
    logicAvailability,
  );
  const lambdaCode =
    transition.lambdaType === lambdaType ? transition.lambdaCode : "";
  const showLambdaTypeSelector = logicAvailability.stochasticLambda;

  const lambdaTypeSelector = (
    <SegmentedControl
      size="sm"
      value={lambdaType}
      items={[
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
      className={fullWidthSegmentedControlStyle}
    />
  );

  return (
    <div className={codeSectionStyle}>
      {showLambdaTypeSelector && (
        <div className={segmentGroupContainerStyle}>
          {isReadOnly ? (
            <Tooltip content={UI_MESSAGES.READ_ONLY_MODE}>
              {lambdaTypeSelector}
            </Tooltip>
          ) : (
            lambdaTypeSelector
          )}
        </div>
      )}

      <div className={infoBoxStyle}>
        {lambdaType === "predicate"
          ? "Define a boolean guard condition. The transition fires immediately — without stochastic delay — once this function returns true and input tokens are available."
          : "Return a numeric rate representing the average number of firings per second. The transition fires stochastically according to this rate."}
      </div>

      <CodeEditor
        path={getDocumentUri("transition-lambda", transition.id)}
        language="typescript"
        value={lambdaCode}
        height="100%"
        onChange={(value) => {
          if (value === undefined) {
            return;
          }

          updateTransition({
            transitionId: transition.id,
            update: { lambdaType, lambdaCode: value },
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
  canMaximize: true,
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
