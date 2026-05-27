import { css } from "@hashintel/ds-helpers/css";

import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { TransitionPropertiesProvider } from "./context";
import { transitionMainContentSubView } from "./subviews/main";
import { transitionFiringTimeSubView } from "./subviews/transition-firing-time/subview";
import { transitionResultsSubView } from "./subviews/transition-results/subview";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Place, Transition } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

interface TransitionPropertiesProps {
  transition: Transition;
  places: Place[];
  types: Color[];
  updateTransition: PetrinautMutations["updateTransition"];
  onArcWeightUpdate: PetrinautMutations["updateArcWeight"];
  updateArcPlace: PetrinautMutations["updateArcPlace"];
  removeArc: PetrinautMutations["removeArc"];
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  places,
  types,
  updateTransition,
  onArcWeightUpdate,
  updateArcPlace,
  removeArc,
}) => {
  const isReadOnly = useIsReadOnly();

  const subViews: SubView[] = [
    transitionMainContentSubView,
    transitionFiringTimeSubView,
    transitionResultsSubView,
  ];

  return (
    <div className={containerStyle}>
      <TransitionPropertiesProvider
        transition={transition}
        places={places}
        types={types}
        isReadOnly={isReadOnly}
        updateTransition={updateTransition}
        onArcWeightUpdate={onArcWeightUpdate}
        updateArcPlace={updateArcPlace}
        removeArc={removeArc}
      >
        <VerticalSubViewsContainer
          name="transition-properties"
          subViews={subViews}
        />
      </TransitionPropertiesProvider>
    </div>
  );
};
