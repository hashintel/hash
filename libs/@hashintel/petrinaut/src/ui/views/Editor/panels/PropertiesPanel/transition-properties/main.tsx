import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { getTransitionLogicAvailability } from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { createDeferredSubView } from "../../../../../components/sub-view/deferred-sub-view";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import {
  TransitionPropertiesProvider,
  type TransitionLogicNet,
} from "./context";
import { transitionMainContentSubView } from "./subviews/main";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Place, Transition } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const transitionFiringTimeSubView = createDeferredSubView({
  id: "transition-firing-time",
  title: "Firing Time",
  defaultCollapsed: true,
  tooltip:
    "Define the rate at or conditions under which this transition will fire, optionally based on each set of input tokens' data (where input tokens have types).",
  hasHeaderAction: true,
  resizable: {
    minHeight: 250,
    maxHeight: 1200,
    defaultHeight: 300,
  },
  load: async () =>
    (await import("./subviews/transition-firing-time/subview"))
      .transitionFiringTimeSubView,
});

const transitionResultsSubView = createDeferredSubView({
  id: "transition-results",
  title: "Transition Results",
  defaultCollapsed: true,
  tooltip:
    "This function determines the data for output tokens, optionally based on the input token data and any global parameters defined.",
  hasHeaderAction: true,
  resizable: {
    minHeight: 300,
    maxHeight: 1200,
    defaultHeight: 500,
  },
  load: async () =>
    (await import("./subviews/transition-results/subview"))
      .transitionResultsSubView,
});

interface TransitionPropertiesProps {
  transition: Transition;
  net: TransitionLogicNet;
  places: Place[];
  types: Color[];
  updateTransition: PetrinautMutations["updateTransition"];
  onArcWeightUpdate: PetrinautMutations["updateArcWeight"];
  updateArcPlace: PetrinautMutations["updateArcPlace"];
  removeArc: PetrinautMutations["removeArc"];
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  net,
  places,
  types,
  updateTransition,
  onArcWeightUpdate,
  updateArcPlace,
  removeArc,
}) => {
  const isReadOnly = useIsReadOnly();
  const presentation = usePetrinautPresentation();
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const logicAvailability = getTransitionLogicAvailability(
    transition,
    petriNetDefinition,
    extensions,
    net,
  );

  const subViews: SubView[] = [
    transitionMainContentSubView,
    ...(presentation.showSourceCode && logicAvailability.lambda
      ? [transitionFiringTimeSubView]
      : []),
    ...(presentation.showSourceCode && logicAvailability.transitionKernel
      ? [transitionResultsSubView]
      : []),
  ];

  return (
    <div className={containerStyle}>
      <TransitionPropertiesProvider
        transition={transition}
        sdcpn={petriNetDefinition}
        net={net}
        places={places}
        types={types}
        logicAvailability={logicAvailability}
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
