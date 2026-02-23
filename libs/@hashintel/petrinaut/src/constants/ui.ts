/**
 * UI-related constants for the Petrinaut editor.
 */

import type { SubView } from "../components/sub-view/types";
import { diagnosticsSubView } from "../views/Editor/subviews/diagnostics";
import { differentialEquationsListSubView } from "../views/Editor/subviews/differential-equations-list";
import { nodesListSubView } from "../views/Editor/subviews/nodes-list";
import { parametersListSubView } from "../views/Editor/subviews/parameters-list";
import { simulationSettingsSubView } from "../views/Editor/subviews/simulation-settings";
import { simulationTimelineSubView } from "../views/Editor/subviews/simulation-timeline";
import { typesListSubView } from "../views/Editor/subviews/types-list";

// Panel margin (spacing around panels)
export const PANEL_MARGIN = 0;

// Resize handle
export const RESIZE_HANDLE_SIZE = 16;
export const RESIZE_HANDLE_OFFSET = -Math.floor(RESIZE_HANDLE_SIZE / 2);

// Left Sidebar
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;
export const MIN_LEFT_SIDEBAR_WIDTH = 280;
export const MAX_LEFT_SIDEBAR_WIDTH = 500;

// Properties Panel (right side)
export const DEFAULT_PROPERTIES_PANEL_WIDTH = 450;
export const MIN_PROPERTIES_PANEL_WIDTH = 250;
export const MAX_PROPERTIES_PANEL_WIDTH = 800;

// Bottom Panel
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 180;
export const MIN_BOTTOM_PANEL_HEIGHT = 100;
export const MAX_BOTTOM_PANEL_HEIGHT = 600;

//
// SubViews
//

export const LEFT_SIDEBAR_SUBVIEWS: SubView[] = [
  typesListSubView,
  differentialEquationsListSubView,
  parametersListSubView,
  nodesListSubView,
];

// Base subviews always visible in the bottom panel
export const BOTTOM_PANEL_SUBVIEWS: SubView[] = [
  diagnosticsSubView,
  simulationSettingsSubView,
];

// Subviews only visible when simulation is running/paused
export const SIMULATION_ONLY_SUBVIEWS: SubView[] = [simulationTimelineSubView];
