import { use } from "react";

import { getTransitionLogicAvailability } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../react/state/composition-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { createDeferredSubView } from "../../../../../components/sub-view/deferred-sub-view";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { TransitionPropertiesContext } from "./context";
import { transitionMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Transition } from "@hashintel/petrinaut-core";

const transitionFiringTimeSubView = createDeferredSubView({
  id: "transition-firing-time",
  canMaximize: true,
  headerActionMutates: true,
  title: "Firing Time",
  defaultCollapsed: true,
  retainOnCollapse: true,
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
  canMaximize: true,
  headerActionMutates: true,
  title: "Transition Results",
  defaultCollapsed: true,
  retainOnCollapse: true,
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
      ...transitionMainContentSubView,
      title: `${transitionMainContentSubView.title} ${transition.name}`,
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
