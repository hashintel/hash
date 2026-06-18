import { use } from "react";

import { Button, Icon, Menu, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  generateDefaultTransitionKernelCode,
  getArcEndpointPlaceId,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { useTransitionPropertiesContext } from "../../context";

import type { SubView } from "../../../../../../../components/sub-view/types";

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const ResultsHeaderAction: React.FC = () => {
  const { logicAvailability, transition, places, types, updateTransition } =
    useTransitionPropertiesContext();
  const { globalMode } = use(EditorContext);

  if (globalMode !== "edit" || !logicAvailability.transitionKernel) {
    return null;
  }

  return (
    <Menu
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
          text: "Load default template",
          onClick: () => {
            const inputs = transition.inputArcs
              .map((arc) => {
                const placeId = getArcEndpointPlaceId(arc);
                const place = placeId
                  ? places.find((p) => p.id === placeId)
                  : null;
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
                const placeId = getArcEndpointPlaceId(arc);
                const place = placeId
                  ? places.find((p) => p.id === placeId)
                  : null;
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

            updateTransition({
              transitionId: transition.id,
              update: {
                transitionKernelCode: generateDefaultTransitionKernelCode(
                  inputs,
                  outputs,
                ),
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
  );
};

const TransitionResultsContent: React.FC = () => {
  const { transition, isReadOnly, updateTransition } =
    useTransitionPropertiesContext();

  return (
    <div className={contentStyle}>
      <CodeEditor
        path={getDocumentUri("transition-kernel", transition.id)}
        language="typescript"
        value={transition.transitionKernelCode || ""}
        height="100%"
        onChange={(value) => {
          updateTransition({
            transitionId: transition.id,
            update: { transitionKernelCode: value ?? "" },
          });
        }}
        options={{ readOnly: isReadOnly }}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      />
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
