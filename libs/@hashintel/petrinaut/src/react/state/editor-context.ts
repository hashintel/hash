import { createContext, createRef } from "react";

import {
  DEFAULT_AI_ASSISTANT_WIDTH,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "./panel-defaults";

import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type EditorGlobalMode = "edit" | "simulate" | "actual" | "notebook";
type EditorEditionMode =
  | "cursor"
  | "add-place"
  | "add-transition"
  | "add-component";
export type CursorMode = "select" | "pan";
export type BottomPanelTab =
  | "compilation"
  | "diagnostics"
  | "simulation-settings"
  | "actual-events"
  | "actual-timeline"
  | "simulation-timeline";

export type TimelineChartType = "run" | "stacked";

/**
 * How the canvas area renders net state: the Petri-net canvas itself, or the
 * Kanban projection of a status view. A canvas-level toggle rather than an
 * `EditorGlobalMode`: Kanban inspects net state during a running simulation
 * or actual stream, so the mode selector keeps its current entries.
 */
export type CanvasViewMode = "canvas" | "kanban";

export type SimulateViewMode =
  | "scenarios"
  | "metrics"
  | "experiments"
  | "status-views";

export type SimulateDrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" }
  | { type: "view-experiment"; experimentId: string }
  | { type: "create-experiment" }
  | { type: "view-status-view"; statusViewId: string }
  | { type: "create-status-view" };

export type EditorNavigationTarget = {
  globalMode?: EditorGlobalMode;
  simulateViewMode?: SimulateViewMode;
  simulateDrawer?: SimulateDrawerState;
  selection?: SelectionMap;
};

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
  /**
   * Width of the AI assistant panel. Held here rather than inside the panel so
   * the surfaces that have to keep clear of it can read it.
   */
  aiAssistantWidth: number;
  /** Rendered compact dock height; null when expanded or closed. */
  aiAssistantDockHeight: number | null;
  aiAssistantPlacement: "docked" | "floating";
  isAiAssistantCollapsed: boolean;
  activeBottomPanelTab: BottomPanelTab;
  canvasViewMode: CanvasViewMode;
  componentSubnetId: string | null;
  selection: SelectionMap;
  /** Whether any items are currently selected. */
  hasSelection: boolean;
  /** The item currently being hovered, if any. */
  hoveredItem: SelectionItem | null;
  /**
   * Places whose state visualizer is pinned open on the canvas. A pinned
   * visualizer stays up when the pointer leaves the place, so it can be
   * watched while the timeline is scrubbed or the initial state edited.
   */
  pinnedVisualizerPlaceIds: Set<string>;
  /**
   * The place whose state visualizer has been opened from the button that
   * pointing at a place offers. It belongs to that hover: moving the pointer
   * to another place, or off the canvas, closes it again. Pinning is what
   * outlasts a hover.
   */
  openVisualizerPlaceId: string | null;
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
  /** Navigate several editor surfaces as one app-history transition. */
  navigateTo: (target: EditorNavigationTarget) => void;
  setGlobalMode: (mode: EditorGlobalMode) => void;
  setEditionMode: (mode: EditorEditionMode) => void;
  setCursorMode: (mode: CursorMode) => void;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  setLeftSidebarWidth: (width: number) => void;
  setPropertiesPanelWidth: (width: number) => void;
  setAiAssistantWidth: (width: number) => void;
  setAiAssistantDockHeight: (height: number | null) => void;
  setAiAssistantPlacement: (placement: "docked" | "floating") => void;
  setAiAssistantCollapsed: (collapsed: boolean) => void;
  setBottomPanelOpen: (isOpen: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
  setActiveBottomPanelTab: (tab: BottomPanelTab) => void;
  setCanvasViewMode: (mode: CanvasViewMode) => void;
  setAddComponentMode: (subnetId: string) => void;
  /** Check whether a given ID is in the current selection. */
  isSelected: (id: string) => boolean;
  setSelection: (
    selection: SelectionMap | ((prev: SelectionMap) => SelectionMap),
    options?: { cause: "normalization" } | { batch: "react-flow" },
  ) => void;
  beginSelectionGesture: () => void;
  endSelectionGesture: () => void;
  selectItem: (item: SelectionItem) => void;
  toggleItem: (item: SelectionItem) => void;
  clearSelection: () => void;
  setHoveredItem: (item: SelectionItem) => void;
  clearHoveredItem: () => void;
  /** Pin a place's state visualizer open, or release it. */
  toggleVisualizerPin: (placeId: string) => void;
  /** Open a place's state visualizer for the hover it is part of. */
  openPlaceVisualizer: (placeId: string) => void;
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
  aiAssistantWidth: DEFAULT_AI_ASSISTANT_WIDTH,
  aiAssistantDockHeight: null,
  aiAssistantPlacement: "docked",
  isAiAssistantCollapsed: false,
  activeBottomPanelTab: "diagnostics",
  canvasViewMode: "canvas",
  componentSubnetId: null,
  selection: new Map(),
  hasSelection: false,
  hoveredItem: null,
  pinnedVisualizerPlaceIds: new Set<string>(),
  openVisualizerPlaceId: null,
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
  navigateTo: () => {},
  setGlobalMode: () => {},
  setEditionMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setAiAssistantWidth: () => {},
  setAiAssistantDockHeight: () => {},
  setAiAssistantPlacement: () => {},
  setAiAssistantCollapsed: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  setCanvasViewMode: () => {},
  setAddComponentMode: () => {},
  isSelected: () => false,
  setSelection: () => {},
  beginSelectionGesture: () => {},
  endSelectionGesture: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  toggleVisualizerPin: () => {},
  openPlaceVisualizer: () => {},
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
};

export const EditorContext = createContext<EditorContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
