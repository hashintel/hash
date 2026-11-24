import { ActualEventsContent } from "./subviews/actual-events";
import { CompilationContent } from "./subviews/compilation";
import { DiagnosticsPanel } from "./subviews/diagnostics";
import { SimulationSettingsContent } from "./subviews/simulation-settings";
import { ActualTimeline } from "./subviews/timeline/actual-timeline";
import { EventTimeline } from "./subviews/timeline/run-timeline";
import { EventTimelineHeaderActions } from "./subviews/timeline/timeline-header-actions";

import type { SubView } from "../../../../sub-view/types";

// The bottom panel's own tabs. `panel.tsx` decides which of them show.

export const diagnosticsSubView: SubView = {
  id: "diagnostics",
  title: "Diagnostics",
  tooltip:
    "View the class of your net, and the problems in its code and its composition.",
  component: DiagnosticsPanel,
};

export const simulationSettingsSubView: SubView = {
  id: "simulation-settings",
  title: "Simulation Settings",
  tooltip: "Configure simulation parameters and the computation time step.",
  component: SimulationSettingsContent,
  noPadding: true,
};

/** The Timeline tab of a run or a Stochastic simulation. */
export const eventTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation over time. Drag to scrub, scroll sideways to pan, pinch or scroll to zoom.",
  component: EventTimeline,
  headerAction: EventTimelineHeaderActions,
  noPadding: true,
};

/** Listed only while the `showCompilationOutput` setting is on. */
export const compilationSubView: SubView = {
  id: "compilation",
  title: "Compilation",
  tooltip:
    "How this net's code lowered to HIR, and what stops it running on the GPU.",
  component: CompilationContent,
};

export const actualTimelineSubView: SubView = {
  id: "actual-timeline",
  title: "Timeline",
  tooltip:
    "View the actual execution timeline with compartment time-series. Click/drag to scrub through frames.",
  component: ActualTimeline,
  noPadding: true,
};

export const actualEventsSubView: SubView = {
  id: "actual-events",
  title: "Events",
  tooltip:
    "Inspect the Actual mode transition stream and export a recording or the net.",
  component: ActualEventsContent,
};
