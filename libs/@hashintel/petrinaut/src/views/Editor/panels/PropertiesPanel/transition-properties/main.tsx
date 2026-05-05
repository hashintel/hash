import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type { Color, Place, Transition } from "../../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import { TransitionPropertiesProvider } from "./context";
import { transitionMainContentSubView } from "./subviews/main";
import { transitionFiringTimeSubView } from "./subviews/transition-firing-time/subview";
import { transitionResultsSubView } from "./subviews/transition-results/subview";

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
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void,
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcDirection: "input" | "output",
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
      >
        <VerticalSubViewsContainer
          name="transition-properties"
          subViews={subViews}
        />
      </TransitionPropertiesProvider>
    </div>
  );
};
