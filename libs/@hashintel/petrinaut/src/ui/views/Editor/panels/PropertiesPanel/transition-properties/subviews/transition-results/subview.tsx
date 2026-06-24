import { use } from "react";

import { Button, Icon, Menu, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  generateDefaultTransitionKernelCode,
  getArcEndpoint,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
import { useTransitionPropertiesContext } from "../../context";

import type { SubView } from "../../../../../../../components/sub-view/types";
import type {
  Color,
  InputArc,
  OutputArc,
  Place,
  SDCPN,
} from "@hashintel/petrinaut-core";

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

const getTypeById = ({ sdcpn, types }: { sdcpn: SDCPN; types: Color[] }) =>
  new Map(
    [
      ...sdcpn.types,
      ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
      ...types,
    ].map((type) => [type.id, type]),
  );

const createTransitionArcPlaceResolver = (
  sdcpn: SDCPN,
  net: { places: Place[]; componentInstances?: SDCPN["componentInstances"] },
): ((
  arc: InputArc | OutputArc,
) => { place: Place; placeName: string } | undefined) => {
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  const instanceById = new Map(
    (net.componentInstances ?? []).map((instance) => [instance.id, instance]),
  );

  return (arc) => {
    const endpoint = getArcEndpoint(arc);

    if (endpoint.kind === "place") {
      const place = placeById.get(endpoint.placeId);
      return place ? { place, placeName: place.name } : undefined;
    }

    const instance = instanceById.get(endpoint.componentInstanceId);
    const subnet = instance ? subnetById.get(instance.subnetId) : undefined;
    const place = subnet?.places.find(
      (p) => p.id === endpoint.portPlaceId && p.isPort,
    );

    if (!instance || !place) return undefined;
    return { place, placeName: `${instance.name}::${place.name}` };
  };
};

const ResultsHeaderAction: React.FC = () => {
  const { logicAvailability, transition, sdcpn, net, types, updateTransition } =
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
            const resolveArcPlace = createTransitionArcPlaceResolver(
              sdcpn,
              net,
            );
            const typeById = getTypeById({ sdcpn, types });

            const inputs = transition.inputArcs
              .filter((arc) => arc.type !== "inhibitor")
              .map((arc) => {
                const resolved = resolveArcPlace(arc);
                const type = resolved?.place.colorId
                  ? typeById.get(resolved.place.colorId)
                  : undefined;

                if (!resolved || !type) {
                  return null;
                }

                return {
                  placeName: resolved.placeName,
                  type,
                  weight: arc.weight,
                };
              })
              .filter((i) => i !== null);

            const outputs = transition.outputArcs
              .map((arc) => {
                const resolved = resolveArcPlace(arc);
                const type = resolved?.place.colorId
                  ? typeById.get(resolved.place.colorId)
                  : undefined;

                if (!resolved || !type) {
                  return null;
                }

                return {
                  placeName: resolved.placeName,
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
          if (value === undefined) {
            return;
          }

          updateTransition({
            transitionId: transition.id,
            update: { transitionKernelCode: value },
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
