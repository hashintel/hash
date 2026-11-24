import { use } from "react";

import { Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointPlaceId,
  type ArcEndpoint,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../../../react/document/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { Section, SectionList } from "../../../../../../shared/section";
import { portLabel, resolvePort } from "../../arc-endpoint";
import { ArcItem, ArcList, type PlaceOption } from "../../arc-item";
import { DeleteItemButton } from "../../delete-item-button";
import { DescriptionField } from "../../description-field";
import { DraftFieldInput } from "../../draft-field-input";
import { fieldsSectionStyle } from "../../styles";
import { useTransitionPropertiesContext } from "../context";

const emptyArcMessageStyle = css({
  fontSize: "xs",
  color: "neutral.fg.muted",
});

const arcSides = {
  input: {
    title: "Input Arcs",
    arcsKey: "inputArcs",
    emptyMessage: "Connect inputs to the transition's left side.",
  },
  output: {
    title: "Output Arcs",
    arcsKey: "outputArcs",
    emptyMessage: "Connect outputs to the transition's right side.",
  },
} as const;

/** The arcs on one side of the transition: what each touches and its weight. */
const ArcsSection: React.FC<{ direction: "input" | "output" }> = ({
  direction,
}) => {
  const { transition, types } = useTransitionPropertiesContext();
  const { updateArcWeight, updateArcPlace, removeArc } =
    usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const { activeNet } = use(ActiveNetContext);
  const { petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);
  const { title, arcsKey, emptyMessage } = arcSides[direction];
  const arcs = transition[arcsKey];
  const { places } = activeNet;

  const typeColor = (colorId: string | null) =>
    colorId
      ? types.find((type) => type.id === colorId)?.displayColor
      : undefined;

  // An arc can move to its own place or to one no arc of this side touches.
  const usedPlaceIds = new Set(arcs.map((arc) => getArcEndpointPlaceId(arc)));
  const availablePlaces = (currentPlaceId: string): PlaceOption[] =>
    places
      .filter(
        (place) => place.id === currentPlaceId || !usedPlaceIds.has(place.id),
      )
      .map((place) => ({
        id: place.id,
        name: place.name,
        color: typeColor(place.colorId),
      }));

  const endpointDetails = (
    endpoint: ArcEndpoint,
  ): { id: string; label: string; color?: string; placeId: string | null } => {
    if (endpoint.kind === "place") {
      const place = places.find(
        (candidate) => candidate.id === endpoint.placeId,
      );
      return {
        id: endpoint.placeId,
        label: place?.name ?? endpoint.placeId,
        color: typeColor(place?.colorId ?? null),
        placeId: endpoint.placeId,
      };
    }

    const { instance, component, port } = resolvePort(
      endpoint,
      activeNet,
      fullSdcpn,
      libraries,
    );
    return {
      id: getArcEndpointKey(endpoint),
      label: portLabel({ instance, port }),
      color: port?.colorId
        ? component?.types.find((type) => type.id === port.colorId)
            ?.displayColor
        : undefined,
      placeId: null,
    };
  };

  return (
    <Section title={title} collapsible>
      {arcs.length === 0 ? (
        <div className={emptyArcMessageStyle}>{emptyMessage}</div>
      ) : (
        <ArcList>
          {arcs.map((arc) => {
            const endpoint = getArcEndpoint(arc);
            const { id, label, color, placeId } = endpointDetails(endpoint);
            const target = {
              transitionId: transition.id,
              arcDirection: direction,
            };
            return (
              <ArcItem
                key={id}
                placeId={id}
                label={label}
                color={color}
                weight={arc.weight}
                disabled={isReadOnly}
                availablePlaces={placeId ? availablePlaces(placeId) : undefined}
                onPlaceChange={(newPlaceId) =>
                  placeId
                    ? updateArcPlace({
                        ...target,
                        oldPlaceId: placeId,
                        newPlaceId,
                      })
                    : undefined
                }
                onWeightChange={(weight) => {
                  updateArcWeight({ ...target, endpoint, weight });
                }}
                onDelete={() => removeArc({ ...target, endpoint })}
              />
            );
          })}
        </ArcList>
      )}
    </Section>
  );
};

export const TransitionMainContent: React.FC = () => {
  const { transition } = useTransitionPropertiesContext();
  const { updateTransition } = usePetrinautMutations();

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={transition.id}
          sourceValue={transition.name}
          validate={validateDisplayName}
          onCommit={(name) =>
            updateTransition({
              transitionId: transition.id,
              update: { name },
            })
          }
        />

        <DescriptionField
          sourceId={transition.id}
          sourceValue={transition.description}
          onCommit={(description) =>
            updateTransition({
              transitionId: transition.id,
              update: { description },
            })
          }
        />
      </Form.Section>

      <ArcsSection direction="input" />
      <ArcsSection direction="output" />
    </SectionList>
  );
};

export const DeleteTransitionAction: React.FC = () => {
  const { transition } = useTransitionPropertiesContext();
  const { removeTransition } = usePetrinautMutations();

  return (
    <DeleteItemButton
      label="Delete transition"
      onDelete={() => removeTransition({ transitionId: transition.id })}
    />
  );
};
