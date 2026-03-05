import { createContext } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "../constants/ui";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

type EditorGlobalMode = "edit" | "simulate";
type EditorEditionMode = "cursor" | "add-place" | "add-transition";
export type CursorMode = "select" | "pan";
export type BottomPanelTab =
  | "diagnostics"
  | "simulation-settings"
  | "simulation-timeline";

export type TimelineChartType = "run" | "stacked";

/**
 * The state values for the editor.
 */
export type EditorState = {
  globalMode: EditorGlobalMode;
  editionMode: EditorEditionMode;
  cursorMode: CursorMode;
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
  activeBottomPanelTab: BottomPanelTab;
  selectedResourceId: string | null;
  selectedItemIds: Set<string>;
  draggingStateByNodeId: DraggingStateByNodeId;
  timelineChartType: TimelineChartType;
  isPanelAnimating: boolean;
};

/**
 * The action functions for the editor.
 */
export type EditorActions = {
  setGlobalMode: (mode: EditorGlobalMode) => void;
  setEditionMode: (mode: EditorEditionMode) => void;
  setCursorMode: (mode: CursorMode) => void;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  setLeftSidebarWidth: (width: number) => void;
  setPropertiesPanelWidth: (width: number) => void;
  setBottomPanelOpen: (isOpen: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
  setActiveBottomPanelTab: (tab: BottomPanelTab) => void;
  setSelectedResourceId: (id: string | null) => void;
  setSelectedItemIds: (ids: Set<string>) => void;
  addSelectedItemId: (id: string) => void;
  removeSelectedItemId: (id: string) => void;
  clearSelection: () => void;
  setDraggingStateByNodeId: (state: DraggingStateByNodeId) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  resetDraggingState: () => void;
  collapseAllPanels: () => void;
  setTimelineChartType: (chartType: TimelineChartType) => void;
  triggerPanelAnimation: () => void;
  __reinitialize: () => void;
};

export type EditorContextValue = EditorState & EditorActions;

export const initialEditorState: EditorState = {
  globalMode: "edit",
  editionMode: "cursor",
  cursorMode: "pan",
  isLeftSidebarOpen: true,
  leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
  propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
  isBottomPanelOpen: false,
  bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
  activeBottomPanelTab: "diagnostics",
  selectedResourceId: null,
  selectedItemIds: new Set(),
  draggingStateByNodeId: {},
  timelineChartType: "run",
  isPanelAnimating: false,
};

const DEFAULT_CONTEXT_VALUE: EditorContextValue = {
  ...initialEditorState,
  setGlobalMode: () => {},
  setEditionMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  setSelectedResourceId: () => {},
  setSelectedItemIds: () => {},
  addSelectedItemId: () => {},
  removeSelectedItemId: () => {},
  clearSelection: () => {},
  setDraggingStateByNodeId: () => {},
  updateDraggingStateByNodeId: () => {},
  resetDraggingState: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  triggerPanelAnimation: () => {},
  __reinitialize: () => {},
};

export const EditorContext = createContext<EditorContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
