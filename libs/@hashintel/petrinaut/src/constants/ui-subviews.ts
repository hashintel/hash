/**
 * SubView registries for the Petrinaut editor panels.
 *
 * Separated from ui.ts to avoid import cycles: view files that define SubViews
 * also consume EditorContext, which imports numeric constants from ui.ts.
 */

import type { SubView } from "../components/sub-view/types";
import { diagnosticsSubView } from "../views/Editor/panels/BottomPanel/subviews/diagnostics";
import { simulationSettingsSubView } from "../views/Editor/panels/BottomPanel/subviews/simulation-settings";
import { simulationTimelineSubView } from "../views/Editor/panels/BottomPanel/subviews/simulation-timeline";
import { differentialEquationsListSubView } from "../views/Editor/panels/LeftSideBar/subviews/differential-equations-list";
import { nodesListSubView } from "../views/Editor/panels/LeftSideBar/subviews/nodes-list";
import { parametersListSubView } from "../views/Editor/panels/LeftSideBar/subviews/parameters-list";
import { typesListSubView } from "../views/Editor/panels/LeftSideBar/subviews/types-list";

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
