import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import {
  TimelineChartTypeSelector,
  TimelineViewPicker,
} from "../simulation-timeline/header";
import { useRunTimelineView } from "../simulation-timeline/use-run-timeline-view";
import { EventTimeline } from "./content";

import type { SubView } from "../../../../../../components/sub-view/types";

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const EventTimelineHeaderActions: React.FC = () => {
  const timelineView = useRunTimelineView();
  const { mode } = use(SimulationContext);
  // A Stochastic simulation draws one thing, the count of every place
  // across runs, so it has no view to pick.
  if (mode === "stochastic") {
    return (
      <div className={headerActionsStyle}>
        <TimelineChartTypeSelector />
      </div>
    );
  }
  // Firings are marks on lanes and the solver's error is read line by line:
  // neither has a stacked form.
  const stackable =
    timelineView.kind !== "per-transition" &&
    timelineView.kind !== "solver-error";

  return (
    <div className={headerActionsStyle}>
      <TimelineViewPicker />
      {stackable ? <TimelineChartTypeSelector /> : null}
    </div>
  );
};

/** The Timeline tab of a run or a Stochastic simulation. */
export const eventTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation over time. Drag to scrub, scroll sideways to pan, pinch or scroll to zoom.",
  component: EventTimeline,
  renderHeaderAction: () => <EventTimelineHeaderActions />,
  noPadding: true,
};
