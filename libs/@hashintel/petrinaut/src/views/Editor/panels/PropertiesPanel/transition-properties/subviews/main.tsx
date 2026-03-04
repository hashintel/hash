import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbTrash } from "react-icons/tb";

import {
  ArcItem,
  ArcList,
  type PlaceOption,
} from "../../../../../../components/arc-item";
import { IconButton } from "../../../../../../components/icon-button";
import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { SDCPNContext } from "../../../../../../state/sdcpn-context";
import { useTransitionPropertiesContext } from "../context";

const emptyArcMessageStyle = css({
  fontSize: "[12px]",
  color: "[#999]",
});

const TransitionMainContent: React.FC = () => {
  const {
    transition,
    places,
    types,
    isReadOnly,
    updateTransition,
    onArcWeightUpdate,
  } = useTransitionPropertiesContext();

  const getPlaceColor = (placeId: string): string | undefined => {
    const place = places.find((pl) => pl.id === placeId);
    if (!place?.colorId) {
      return undefined;
    }
    return types.find((tp) => tp.id === place.colorId)?.displayColor;
  };

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
        .filter((arc) => arc.placeId !== currentPlaceId)
        .map((arc) => arc.placeId),
    );
    return places.filter((pl) => !usedIds.has(pl.id)).map(toPlaceOption);
  };

  const getAvailableOutputPlaces = (currentPlaceId: string): PlaceOption[] => {
    const usedIds = new Set(
      transition.outputArcs
        .filter((arc) => arc.placeId !== currentPlaceId)
        .map((arc) => arc.placeId),
    );
    return places.filter((pl) => !usedIds.has(pl.id)).map(toPlaceOption);
  };

  const handleInputArcPlaceChange = (
    oldPlaceId: string,
    newPlaceId: string,
  ) => {
    updateTransition(transition.id, (existingTransition) => {
      const arc = existingTransition.inputArcs.find(
        (ar) => ar.placeId === oldPlaceId,
      );
      if (arc) {
        arc.placeId = newPlaceId;
      }
    });
  };

  const handleOutputArcPlaceChange = (
    oldPlaceId: string,
    newPlaceId: string,
  ) => {
    updateTransition(transition.id, (existingTransition) => {
      const arc = existingTransition.outputArcs.find(
        (ar) => ar.placeId === oldPlaceId,
      );
      if (arc) {
        arc.placeId = newPlaceId;
      }
    });
  };

  const handleDeleteInputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.inputArcs.findIndex(
        (arc) => arc.placeId === placeId,
      );
      if (index !== -1) {
        existingTransition.inputArcs.splice(index, 1);
      }
    });
  };

  const handleDeleteOutputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.outputArcs.findIndex(
        (arc) => arc.placeId === placeId,
      );
      if (index !== -1) {
        existingTransition.outputArcs.splice(index, 1);
      }
    });
  };

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={transition.name}
          onChange={(event) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.name = event.target.value;
            });
          }}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Input Arcs" collapsible>
        {transition.inputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect inputs to the transition's left side.
          </div>
        ) : (
          <ArcList>
            {transition.inputArcs.map((arc) => {
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeId={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  color={getPlaceColor(arc.placeId)}
                  disabled={isReadOnly}
                  availablePlaces={getAvailableInputPlaces(arc.placeId)}
                  onPlaceChange={(newPlaceId) =>
                    handleInputArcPlaceChange(arc.placeId, newPlaceId)
                  }
                  onWeightChange={(weight) => {
                    onArcWeightUpdate(
                      transition.id,
                      "input",
                      arc.placeId,
                      weight,
                    );
                  }}
                  onDelete={() => handleDeleteInputArc(arc.placeId)}
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
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeId={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  color={getPlaceColor(arc.placeId)}
                  disabled={isReadOnly}
                  availablePlaces={getAvailableOutputPlaces(arc.placeId)}
                  onPlaceChange={(newPlaceId) =>
                    handleOutputArcPlaceChange(arc.placeId, newPlaceId)
                  }
                  onWeightChange={(weight) => {
                    onArcWeightUpdate(
                      transition.id,
                      "output",
                      arc.placeId,
                      weight,
                    );
                  }}
                  onDelete={() => handleDeleteOutputArc(arc.placeId)}
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
  const { transition, isReadOnly } = useTransitionPropertiesContext();
  const { removeTransition } = use(SDCPNContext);

  return (
    <IconButton
      aria-label="Delete"
      colorScheme="red"
      onClick={() => {
        if (
          // eslint-disable-next-line no-alert
          window.confirm(
            `Are you sure you want to delete "${transition.name}"? All arcs connected to this transition will also be removed.`,
          )
        ) {
          removeTransition(transition.id);
        }
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
    >
      <TbTrash size={16} />
    </IconButton>
  );
};

export const transitionMainContentSubView: SubView = {
  id: "transition-main-content",
  title: "Transition",
  main: true,
  component: TransitionMainContent,
  renderHeaderAction: () => <DeleteTransitionAction />,
};
