/**
 * SubView registries for the Petrinaut editor panels.
 *
 * Separated from ui.ts to avoid import cycles: view files that define SubViews
 * also consume EditorContext, which imports numeric constants from ui.ts.
 */

import { actualEventsSubView } from "../views/Editor/panels/BottomPanel/subviews/actual-events";
import { diagnosticsSubView } from "../views/Editor/panels/BottomPanel/subviews/diagnostics";
import { simulationSettingsSubView } from "../views/Editor/panels/BottomPanel/subviews/simulation-settings";
import { actualTimelineSubView } from "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/actual";
import { simulationTimelineSubView } from "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/main";
import { differentialEquationsListSubView } from "../views/Editor/panels/LeftSideBar/subviews/differential-equations-list";
import { entitiesTreeSubView } from "../views/Editor/panels/LeftSideBar/subviews/entities-tree";
import { nodesListSubView } from "../views/Editor/panels/LeftSideBar/subviews/nodes-list";
import { parametersListSubView } from "../views/Editor/panels/LeftSideBar/subviews/parameters-list";
import { typesListSubView } from "../views/Editor/panels/LeftSideBar/subviews/types-list";

import type { SubView } from "../components/sub-view/types";

export const LEFT_SIDEBAR_SUBVIEWS: SubView[] = [
  nodesListSubView,
  typesListSubView,
  differentialEquationsListSubView,
  parametersListSubView,
];

export const LEFT_SIDEBAR_TREE_SUBVIEWS: SubView[] = [entitiesTreeSubView];

// Base subviews always visible in the bottom panel
export const BOTTOM_PANEL_SUBVIEWS: SubView[] = [
  diagnosticsSubView,
  simulationSettingsSubView,
];

// Bottom panel subviews visible in Actual mode.
export const ACTUAL_BOTTOM_PANEL_SUBVIEWS: SubView[] = [
  actualTimelineSubView,
  actualEventsSubView,
];

// Subviews only visible when simulation is running/paused
export const SIMULATION_ONLY_SUBVIEWS: SubView[] = [simulationTimelineSubView];
