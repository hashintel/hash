import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import {
  TimelineChartTypeSelector,
  TimelineViewPicker,
} from "../simulation-timeline/header";
import { EventTimeline } from "./content";

import type { SubView } from "../../../../../../components/sub-view/types";

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const EventTimelineHeaderActions: React.FC = () => {
  const { timelineView } = use(EditorContext);
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
    "View the run's events over time. Scroll to zoom, drag to pan, click to view a time.",
  component: EventTimeline,
  renderHeaderAction: () => <EventTimelineHeaderActions />,
  noPadding: true,
};
