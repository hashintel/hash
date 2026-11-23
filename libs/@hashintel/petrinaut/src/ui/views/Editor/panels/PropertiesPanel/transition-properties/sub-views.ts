import { TransitionIcon } from "../../../../../constants/entity-icons";
import { createDeferredSubView } from "../../../../../sub-view/deferred-sub-view";
import { DeleteTransitionAction, TransitionMainContent } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const transitionMainSubView: SubView = {
  id: "transition-main-content",
  title: "Transition",
  icon: TransitionIcon,
  main: true,
  component: TransitionMainContent,
  headerAction: DeleteTransitionAction,
  headerActionMutates: true,
};

export const transitionFiringTimeSubView = createDeferredSubView({
  id: "transition-firing-time",
  canMaximize: true,
  headerActionMutates: true,
  title: "Firing Time",
  defaultCollapsed: true,
  retainOnCollapse: true,
  tooltip:
    "Define the rate at or conditions under which this transition will fire, optionally based on each set of input tokens' data (where input tokens have types).",
  minHeight: 250,
  load: async () => {
    const section = await import("./subviews/transition-firing-time/subview");
    return {
      component: section.TransitionFiringTimeContent,
      headerAction: section.FiringTimeHeaderAction,
    };
  },
});

export const transitionResultsSubView = createDeferredSubView({
  id: "transition-results",
  canMaximize: true,
  headerActionMutates: true,
  title: "Transition Results",
  defaultCollapsed: true,
  retainOnCollapse: true,
  tooltip:
    "This function determines the data for output tokens, optionally based on the input token data and any global parameters defined.",
  minHeight: 300,
  load: async () => {
    const section = await import("./subviews/transition-results/subview");
    return {
      component: section.TransitionResultsContent,
      headerAction: section.ResultsHeaderAction,
    };
  },
});
