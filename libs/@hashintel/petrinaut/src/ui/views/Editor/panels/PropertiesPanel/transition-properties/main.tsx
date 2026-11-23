import { use } from "react";

import { getTransitionLogicAvailability } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import { usePetrinautPresentation } from "../../../../../presentation/presentation-context";
import { VerticalSubViewsContainer } from "../../../../../sub-view/vertical-sub-views-container";
import { TransitionPropertiesContext } from "./context";
import {
  transitionFiringTimeSubView,
  transitionMainSubView,
  transitionResultsSubView,
} from "./sub-views";

import type { SubView } from "../../../../../sub-view/types";
import type { Color, Transition } from "@hashintel/petrinaut-core";

interface TransitionPropertiesProps {
  transition: Transition;
  types: Color[];
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  types,
}) => {
  const presentation = usePetrinautPresentation();
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { libraries } = use(CompositionContext);
  const logicAvailability = getTransitionLogicAvailability(
    transition,
    petriNetDefinition,
    extensions,
    activeNet,
    libraries,
  );

  const subViews: SubView[] = [
    {
      ...transitionMainSubView,
      title: `${transitionMainSubView.title} ${transition.name}`,
    },
    ...(presentation.showSourceCode && logicAvailability.lambda
      ? [transitionFiringTimeSubView]
      : []),
    ...(presentation.showSourceCode && logicAvailability.transitionKernel
      ? [transitionResultsSubView]
      : []),
  ];

  return (
    <TransitionPropertiesContext
      value={{ transition, types, logicAvailability }}
    >
      <VerticalSubViewsContainer
        key={transition.id}
        name="transition-properties"
        subViews={subViews}
      />
    </TransitionPropertiesContext>
  );
};
