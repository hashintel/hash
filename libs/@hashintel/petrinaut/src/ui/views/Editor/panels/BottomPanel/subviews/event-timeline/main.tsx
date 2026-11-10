import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

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

/**
 * The Timeline tab while the event-driven engine is selected. It shares the
 * fixed-step timeline's id so the panel treats the two as one tab.
 */
export const eventTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the run's events over time. Scroll to zoom, drag to pan, click to view a time.",
  component: EventTimeline,
  renderHeaderAction: () => <EventTimelineHeaderActions />,
  noPadding: true,
};
