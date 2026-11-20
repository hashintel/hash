import { use } from "react";

import { Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointPlaceId,
  resolveComponent,
  type ArcEndpoint,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../../react/state/composition-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import {
  ArcItem,
  ArcList,
  type PlaceOption,
} from "../../../../../../components/arc-item";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { TransitionIcon } from "../../../../../../constants/entity-icons";
import { DeleteItemButton } from "../../delete-item-button";
import { fieldsSectionStyle } from "../../styles";
import { useTransitionPropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const emptyArcMessageStyle = css({
  fontSize: "xs",
  color: "neutral.fg.muted",
});

const TransitionMainContent: React.FC = () => {
  const {
    transition,
    places,
    types,
    isReadOnly,
    updateTransition,
    onArcWeightUpdate,
    updateArcPlace,
    removeArc,
  } = useTransitionPropertiesContext();
  const { activeNet } = use(ActiveNetContext);
  const { petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);

  const toPlaceOption = (pl: (typeof places)[number]): PlaceOption => ({
    id: pl.id,
    name: pl.name,
    color: pl.colorId
      ? types.find((tp) => tp.id === pl.colorId)?.displayColor
      : undefined,
  });

  const getAvailableInputPlaces = (currentPlaceId: string): PlaceOption[] => {
    const usedIds = new Set(
      transition.inputArcs
        .map((arc) => getArcEndpointPlaceId(arc))
        .filter((placeId): placeId is string => placeId !== null)
        .filter((placeId) => placeId !== currentPlaceId),
    );
    return places.filter((pl) => !usedIds.has(pl.id)).map(toPlaceOption);
  };

  const getAvailableOutputPlaces = (currentPlaceId: string): PlaceOption[] => {
    const usedIds = new Set(
      transition.outputArcs
        .map((arc) => getArcEndpointPlaceId(arc))
        .filter((placeId): placeId is string => placeId !== null)
        .filter((placeId) => placeId !== currentPlaceId),
    );
    return places.filter((pl) => !usedIds.has(pl.id)).map(toPlaceOption);
  };

  const endpointDetails = (
    endpoint: ArcEndpoint,
  ): { id: string; label: string; color?: string; placeId: string | null } => {
    if (endpoint.kind === "place") {
      const place = places.find(
        (candidate) => candidate.id === endpoint.placeId,
      );
      const type = place?.colorId
        ? types.find((candidate) => candidate.id === place.colorId)
        : undefined;
      return {
        id: endpoint.placeId,
        label: place?.name ?? endpoint.placeId,
        color: type?.displayColor,
        placeId: endpoint.placeId,
      };
    }

    const instance = activeNet.componentInstances.find(
      ({ id }) => id === endpoint.componentInstanceId,
    );
    const component = instance
      ? resolveComponent(fullSdcpn, instance.component, libraries)
      : undefined;
    const port = component?.places.find(
      (place) => place.id === endpoint.portPlaceId,
    );
    const color = port?.colorId
      ? component?.types.find((type) => type.id === port.colorId)?.displayColor
      : undefined;
    return {
      id: getArcEndpointKey(endpoint),
      label: `${instance?.name ?? "Unknown component"}.${
        port?.name ?? "Unknown port"
      }`,
      color,
      placeId: null,
    };
  };

  const handleInputArcPlaceChange = (
    oldPlaceId: string,
    newPlaceId: string,
  ) => {
    updateArcPlace({
      transitionId: transition.id,
      arcDirection: "input",
      oldPlaceId,
      newPlaceId,
    });
  };

  const handleOutputArcPlaceChange = (
    oldPlaceId: string,
    newPlaceId: string,
  ) => {
    updateArcPlace({
      transitionId: transition.id,
      arcDirection: "output",
      oldPlaceId,
      newPlaceId,
    });
  };

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

      <Section title="Input Arcs" collapsible>
        {transition.inputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect inputs to the transition's left side.
          </div>
        ) : (
          <ArcList>
            {transition.inputArcs.map((arc) => {
              const endpoint = getArcEndpoint(arc);
              const details = endpointDetails(endpoint);
              return (
                <ArcItem
                  key={details.id}
                  placeId={details.id}
                  label={details.label}
                  color={details.color}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  availablePlaces={
                    details.placeId
                      ? getAvailableInputPlaces(details.placeId)
                      : undefined
                  }
                  onPlaceChange={(newPlaceId) =>
                    details.placeId
                      ? handleInputArcPlaceChange(details.placeId, newPlaceId)
                      : undefined
                  }
                  onWeightChange={(weight) => {
                    onArcWeightUpdate({
                      transitionId: transition.id,
                      arcDirection: "input",
                      endpoint,
                      weight,
                    });
                  }}
                  onDelete={() =>
                    removeArc({
                      transitionId: transition.id,
                      arcDirection: "input",
                      endpoint,
                    })
                  }
                />
              );
            })}
          </ArcList>
        )}
      </Section>

      <Section title="Output Arcs" collapsible>
        {transition.outputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect outputs to the transition's right side.
          </div>
        ) : (
          <ArcList>
            {transition.outputArcs.map((arc) => {
              const endpoint = getArcEndpoint(arc);
              const details = endpointDetails(endpoint);
              return (
                <ArcItem
                  key={details.id}
                  placeId={details.id}
                  label={details.label}
                  color={details.color}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  availablePlaces={
                    details.placeId
                      ? getAvailableOutputPlaces(details.placeId)
                      : undefined
                  }
                  onPlaceChange={(newPlaceId) =>
                    details.placeId
                      ? handleOutputArcPlaceChange(details.placeId, newPlaceId)
                      : undefined
                  }
                  onWeightChange={(weight) => {
                    onArcWeightUpdate({
                      transitionId: transition.id,
                      arcDirection: "output",
                      endpoint,
                      weight,
                    });
                  }}
                  onDelete={() =>
                    removeArc({
                      transitionId: transition.id,
                      arcDirection: "output",
                      endpoint,
                    })
                  }
                />
              );
            })}
          </ArcList>
        )}
      </Section>
    </SectionList>
  );
};

const DeleteTransitionAction: React.FC = () => {
  const { transition } = useTransitionPropertiesContext();
  const { removeTransition } = usePetrinautMutations();

  return (
    <DeleteItemButton
      label="Delete transition"
      onDelete={() => removeTransition({ transitionId: transition.id })}
    />
  );
};

export const transitionMainContentSubView: SubView = {
  id: "transition-main-content",
  title: "Transition",
  icon: TransitionIcon,
  main: true,
  component: TransitionMainContent,
  renderHeaderAction: () => <DeleteTransitionAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
  resizable: {
    minHeight: 100,
    maxHeight: 1200,
    defaultHeight: 300,
  },
};
