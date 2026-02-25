/* eslint-disable id-length */
import { css } from "@hashintel/ds-helpers/css";
import { use, useMemo } from "react";
import { TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import type { Color, Place, Transition } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { transitionFiringTimeSubView } from "../../subviews/transition-firing-time";
import { transitionResultsSubView } from "../../subviews/transition-results";
import { ArcItem } from "./sortable-arc-item";
import {
  TransitionPropertiesProvider,
  useTransitionPropertiesContext,
} from "./transition-properties-context";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const mainContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const sectionContainerStyle = css({
  marginTop: "[20px]",
});

const emptyArcMessageStyle = css({
  fontSize: "[12px]",
  color: "[#999]",
});

const arcListContainerStyle = css({
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[6px]",
  overflow: "hidden",
});

const TransitionMainContent: React.FC = () => {
  const {
    transition,
    places,
    isReadOnly,
    updateTransition,
    onArcWeightUpdate,
  } = useTransitionPropertiesContext();

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
    <div className={mainContentStyle}>
      <div>
        <div className={fieldLabelStyle}>Name</div>
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
      </div>

      <div className={sectionContainerStyle}>
        <div className={fieldLabelStyle}>Input Arcs</div>
        {transition.inputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect inputs to the transition's left side.
          </div>
        ) : (
          <div className={arcListContainerStyle}>
            {transition.inputArcs.map((arc) => {
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
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
          </div>
        )}
      </div>

      <div>
        <div className={fieldLabelStyle}>Output Arcs</div>
        {transition.outputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect outputs to the transition's right side.
          </div>
        ) : (
          <div className={arcListContainerStyle}>
            {transition.outputArcs.map((arc) => {
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
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
          </div>
        )}
      </div>
    </div>
  );
};

const DeleteTransitionAction: React.FC = () => {
  const { transition, isReadOnly } = useTransitionPropertiesContext();
  const { removeTransition } = use(SDCPNContext);

  return (
    <IconButton
      aria-label="Delete"
      variant="danger"
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

const transitionMainContentSubView: SubView = {
  id: "transition-main-content",
  title: "Transition",
  main: true,
  component: TransitionMainContent,
  renderHeaderAction: () => <DeleteTransitionAction />,
};

interface TransitionPropertiesProps {
  transition: Transition;
  places: Place[];
  types: Color[];
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void,
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  places,
  types,
  updateTransition,
  onArcWeightUpdate,
}) => {
  const isReadOnly = useIsReadOnly();

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  const subViews = useMemo(() => {
    const views: SubView[] = [
      transitionMainContentSubView,
      transitionFiringTimeSubView,
    ];

    if (hasOutputPlaceWithType) {
      views.push(transitionResultsSubView);
    }

    return views;
  }, [hasOutputPlaceWithType]);

  return (
    <div className={containerStyle}>
      <TransitionPropertiesProvider
        transition={transition}
        places={places}
        types={types}
        isReadOnly={isReadOnly}
        updateTransition={updateTransition}
        onArcWeightUpdate={onArcWeightUpdate}
      >
        <VerticalSubViewsContainer subViews={subViews} />
      </TransitionPropertiesProvider>
    </div>
  );
};
