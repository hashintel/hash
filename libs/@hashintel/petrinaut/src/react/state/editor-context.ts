import { createContext, createRef } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "./panel-defaults";

import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type EditorGlobalMode = "edit" | "simulate" | "actual";
type EditorEditionMode =
  | "cursor"
  | "add-place"
  | "add-transition"
  | "add-component";
export type CursorMode = "select" | "pan";
export type BottomPanelTab =
  | "diagnostics"
  | "simulation-settings"
  | "actual-events"
  | "actual-timeline"
  | "simulation-timeline";

export type TimelineChartType = "run" | "stacked";

export type SimulateViewMode =
  | "scenarios"
  | "metrics"
  | "experiments"
  | "optimizations";

export type SimulateDrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" }
  | { type: "view-experiment"; experimentId: string }
  | { type: "create-experiment" };

/**
 * What is rendered on the simulation timeline chart.
 *
 * - `per-place`: a series per place, counting tokens over time.
 * - `per-type`: a series per color/type, counting tokens across all places
 *   that use that type (places with no color are aggregated as "Untyped").
 * - `per-transition`: a series per transition, plotting its cumulative
 *   firing count over time.
 * - `metric`: a single series computed by a user-authored metric function.
 */
export type TimelineView =
  | { kind: "per-place" }
  | { kind: "per-type" }
  | { kind: "per-transition" }
  | { kind: "metric"; metricId: string };

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
  componentSubnetId: string | null;
  selection: SelectionMap;
  /** Whether any items are currently selected. */
  hasSelection: boolean;
  /** Whether any items on the canvas are currently selected. */
  hasCanvasSelection: boolean;
  /** The item currently being hovered, if any. */
  hoveredItem: SelectionItem | null;
  draggingStateByNodeId: DraggingStateByNodeId;
  timelineChartType: TimelineChartType;
  /**
   * Which view is rendered in the simulation timeline chart. See
   * {@link TimelineView} for the available options.
   */
  timelineView: TimelineView;
  /**
   * Series hidden in the timeline chart, keyed by series id. Lifted here so
   * the selection survives bottom-panel tab switches, which unmount the
   * timeline subviews.
   */
  hiddenTimelineSeriesIds: Set<string>;
  /**
   * Which tab is active in the SimulateView sidebar. Lifted here so external
   * actions (e.g. the "Manage"
   * button in the timeline header) can switch it.
   */
  simulateViewMode: SimulateViewMode;
  simulateDrawer: SimulateDrawerState;
  isPanelAnimating: boolean;
  isSearchOpen: boolean;
  isAiAssistantOpen: boolean;
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
  setAddComponentMode: (subnetId: string) => void;
  /** Check whether a given ID is in the current selection. */
  isSelected: (id: string) => boolean;
  /** Check whether a node/edge is connected to any selected item via an arc. */
  isSelectedConnection: (id: string) => boolean;
  /** Check whether a node/edge is not connected to any selected item via an arc. */
  isNotSelectedConnection: (id: string) => boolean;
  /** Map of all items connected to the current selection, keyed by id. */
  selectedConnections: SelectionMap;
  setSelection: (
    selection: SelectionMap | ((prev: SelectionMap) => SelectionMap),
  ) => void;
  selectItem: (item: SelectionItem) => void;
  toggleItem: (item: SelectionItem) => void;
  clearSelection: () => void;
  setHoveredItem: (item: SelectionItem) => void;
  clearHoveredItem: () => void;
  /** Check whether a given ID is the currently hovered item. */
  isHovered: (id: string) => boolean;
  /** Check whether a given ID is connected to the currently hovered item. */
  isHoveredConnection: (id: string) => boolean;
  /** Check whether a given ID is not connected to the currently hovered item. */
  isNotHoveredConnection: (id: string) => boolean;
  setDraggingStateByNodeId: (state: DraggingStateByNodeId) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  resetDraggingState: () => void;
  collapseAllPanels: () => void;
  setTimelineChartType: (chartType: TimelineChartType) => void;
  setTimelineView: (view: TimelineView) => void;
  setHiddenTimelineSeriesIds: (seriesIds: Set<string>) => void;
  setSimulateViewMode: (mode: SimulateViewMode) => void;
  setSimulateDrawer: (drawer: SimulateDrawerState) => void;
  setSearchOpen: (isOpen: boolean) => void;
  setAiAssistantOpen: (isOpen: boolean) => void;
  toggleAiAssistant: () => void;
  triggerPanelAnimation: () => void;
  __reinitialize: () => void;
};

export type EditorContextValue = EditorState &
  EditorActions & {
    /** Ref to the search input element, used for focus management. */
    searchInputRef: React.RefObject<HTMLInputElement | null>;
  };

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
  componentSubnetId: null,
  selection: new Map(),
  hasSelection: false,
  hasCanvasSelection: false,
  hoveredItem: null,
  draggingStateByNodeId: {},
  timelineChartType: "run",
  timelineView: { kind: "per-place" },
  hiddenTimelineSeriesIds: new Set(),
  simulateViewMode: "experiments",
  simulateDrawer: { type: "closed" },
  isPanelAnimating: false,
  isSearchOpen: false,
  isAiAssistantOpen: false,
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
  setAddComponentMode: () => {},
  isSelected: () => false,
  isSelectedConnection: () => false,
  isNotSelectedConnection: () => false,
  selectedConnections: new Map(),
  setSelection: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  isHovered: () => false,
  isHoveredConnection: () => false,
  isNotHoveredConnection: () => false,
  setDraggingStateByNodeId: () => {},
  updateDraggingStateByNodeId: () => {},
  resetDraggingState: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  setTimelineView: () => {},
  setHiddenTimelineSeriesIds: () => {},
  setSimulateViewMode: () => {},
  setSimulateDrawer: () => {},
  setSearchOpen: () => {},
  setAiAssistantOpen: () => {},
  toggleAiAssistant: () => {},
  searchInputRef: createRef<HTMLInputElement | null>(),
  triggerPanelAnimation: () => {},
  __reinitialize: () => {},
};

export const EditorContext = createContext<EditorContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
