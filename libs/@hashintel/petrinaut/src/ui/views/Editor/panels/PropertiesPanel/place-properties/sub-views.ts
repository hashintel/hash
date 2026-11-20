import { createDeferredSubView } from "../../../../../components/sub-view/deferred-sub-view";
import { PlaceIcon } from "../../../../../constants/entity-icons";
import { DeletePlaceAction, PlaceMainContent } from "./subviews/main";
import {
  PlaceDynamicsContent,
  PlaceDynamicsHeaderActions,
} from "./subviews/place-dynamics/subview";
import {
  PlaceInitialStateContent,
  StateHeaderAction,
} from "./subviews/place-initial-state/subview";

import type { SubView } from "../../../../../components/sub-view/types";

export const placeMainSubView: SubView = {
  id: "place-main-content",
  title: "Place",
  icon: PlaceIcon,
  main: true,
  component: PlaceMainContent,
  headerAction: DeletePlaceAction,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};

export const placeDynamicsSubView: SubView = {
  id: "place-dynamics",
  title: "Dynamics",
  tooltip:
    "The differential equations that move this place's tokens while it holds them, applied in order with their derivatives summed. An equation over several tokens is applied to every combination of that many tokens. Drag a row's gutter, or press Alt with an arrow key, to reorder.",
  component: PlaceDynamicsContent,
  headerAction: PlaceDynamicsHeaderActions,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};

export const placeInitialStateSubView: SubView = {
  id: "place-initial-state",
  title: "State",
  tooltip:
    "View this place’s tokens. Configure initial tokens in Simulation Settings; during simulation, this shows the current state.",
  component: PlaceInitialStateContent,
  headerAction: StateHeaderAction,
  defaultCollapsed: true,
  resizable: {
    minHeight: 250,
    defaultHeight: 300,
  },
};

export const placeVisualizerSubView = createDeferredSubView({
  id: "place-visualizer",
  canMaximize: true,
  headerActionMutates: true,
  title: "Visualizer",
  tooltip:
    "Custom visualization of tokens in this place, defined by visualizer code.",
  defaultCollapsed: true,
  retainOnCollapse: true,
  alwaysShowHeaderAction: true,
  hasHeaderAction: true,
  resizable: {
    minHeight: 200,
    defaultHeight: 300,
  },
  load: async () => {
    const section = await import("./subviews/place-visualizer/subview");
    return {
      id: "place-visualizer",
      title: "Visualizer",
      component: section.PlaceVisualizerContent,
      headerAction: section.VisualizerHeaderAction,
    };
  },
});

placeVisualizerSubView.preload();
