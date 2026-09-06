import { SimulationTimeline } from "./content";
import { TimelineHeaderActions } from "./header";

import type { SubView } from "../../../../../../components/sub-view/types";

export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimeline,
  renderHeaderAction: () => <TimelineHeaderActions />,
  noPadding: true,
};
