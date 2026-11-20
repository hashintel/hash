/**
 * SubView registries for the Petrinaut editor panels.
 *
 * Separated from ui.ts to avoid import cycles: view files that define SubViews
 * also consume EditorContext, which imports numeric constants from ui.ts.
 */

import {
  actualEventsSubView,
  actualTimelineSubView,
  compilationSubView,
  diagnosticsSubView,
  eventTimelineSubView,
  simulationSettingsSubView,
} from "../views/Editor/panels/BottomPanel/sub-views";
import {
  componentsSubView,
  entitiesTreeSubView,
  netsListSubView,
} from "../views/Editor/panels/LeftSideBar/sub-views";

import type { SubView } from "../components/sub-view/types";

export const LEFT_SIDEBAR_SUBVIEWS = [
  entitiesTreeSubView,
  netsListSubView,
  componentsSubView,
] as const satisfies SubView[];

// Base subviews always visible in the bottom panel
export const BOTTOM_PANEL_SUBVIEWS = [
  diagnosticsSubView,
  simulationSettingsSubView,
] as const satisfies SubView[];

// Bottom panel subviews visible in Actual mode.
export const ACTUAL_BOTTOM_PANEL_SUBVIEWS = [
  actualTimelineSubView,
  actualEventsSubView,
] as const satisfies SubView[];

// Subviews only visible when simulation is running/paused
export const SIMULATION_ONLY_SUBVIEWS = [
  eventTimelineSubView,
] as const satisfies SubView[];

// Subviews gated behind a user setting rather than editor state.
export const COMPILATION_SUBVIEWS = [
  compilationSubView,
] as const satisfies SubView[];
