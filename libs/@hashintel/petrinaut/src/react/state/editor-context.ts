import { createContext, createRef, use } from "react";

import {
  useSelected,
  useSelectedFields,
  type Published,
} from "../select-from-context";

import type {
  ComponentReference,
  SelectionItem,
  SelectionMap,
} from "@hashintel/petrinaut-core";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type EditorGlobalMode = "edit" | "simulate" | "actual";
export type EditViewMode = "canvas" | "definitions";
type EditorEditionMode =
  | "cursor"
  | "add-place"
  | "add-transition"
  | "add-component";
export type CursorMode = "select" | "pan";
/**
 * A tab a plugin adds to the bottom panel. Its id holds a dot, which the id
 * of none of the editor's own tabs does.
 */
export type PluginBottomPanelTab = `${string}.${string}`;

export type BottomPanelTab =
  | "compilation"
  | "diagnostics"
  | "simulation-settings"
  | "actual-events"
  | "actual-timeline"
  | "simulation-timeline"
  | PluginBottomPanelTab;

export type TimelineChartType = "run" | "stacked";

export type SimulateViewMode = "scenarios" | "metrics" | "experiments";

export type SimulateDrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" }
  | { type: "view-experiment"; experimentId: string }
  | { type: "create-experiment" };

export type EditorNavigationTarget = {
  globalMode?: EditorGlobalMode;
  editViewMode?: EditViewMode;
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
 * - `solver-error`: a series per place with dynamics, the error the adaptive
 *   solver has accumulated for it, recorded at the events of a run. Offered
 *   only while the selected simulator can produce it.
 */
export type TimelineView =
  | { kind: "per-place" }
  | { kind: "per-type" }
  | { kind: "per-transition" }
  | { kind: "metric"; metricId: string }
  | { kind: "solver-error" };

/**
 * The state values for the editor.
 */
export type EditorState = {
  globalMode: EditorGlobalMode;
  editViewMode: EditViewMode;
  editionMode: EditorEditionMode;
  cursorMode: CursorMode;
  isLeftSidebarOpen: boolean;
  isBottomPanelOpen: boolean;
  activeBottomPanelTab: BottomPanelTab;
  /** The component the next click on the canvas places an instance of. */
  componentToAdd: ComponentReference | null;
  selection: SelectionMap;
  /** Whether any items are currently selected. */
  hasSelection: boolean;
  /** The item currently being hovered, if any. */
  hoveredItem: SelectionItem | null;
  /** Windows explicitly kept open, independently of their positioning mode. */
  keptOpenVisualizerPlaceIds: Set<string>;
  /** Visualizer place IDs ordered from back to front. */
  visualizerStack: string[];
  /**
   * Component instances whose ports are unfolded on the canvas. A component
   * with many ports starts folded, its wires meeting the card's edges.
   */
  unfoldedComponentInstanceIds: Set<string>;
  /** The temporary hover or keyboard preview. */
  openVisualizerPlaceId: string | null;
  focusedVisualizerPlaceId: string | null;
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
  setEditViewMode: (view: EditViewMode) => void;
  setEditionMode: (mode: EditorEditionMode) => void;
  setCursorMode: (mode: CursorMode) => void;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  setBottomPanelOpen: (isOpen: boolean) => void;
  toggleBottomPanel: () => void;
  setActiveBottomPanelTab: (tab: BottomPanelTab) => void;
  setAddComponentMode: (component: ComponentReference) => void;
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
  keepPlaceVisualizerOpen: (placeId: string) => void;
  closePlaceVisualizer: (placeId: string) => void;
  bringVisualizerToFront: (placeId: string) => void;
  /** Unfold a component instance's ports on the canvas, or fold them again. */
  toggleComponentInstanceFold: (instanceId: string) => void;
  /** Show or dismiss a temporary preview. */
  openPlaceVisualizer: (placeId: string | null) => void;
  setVisualizerEditorFocus: (placeId: string, focused: boolean) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  collapseAllPanels: () => void;
  setTimelineChartType: (chartType: TimelineChartType) => void;
  setTimelineView: (view: TimelineView) => void;
  setHiddenTimelineSeriesIds: (seriesIds: Set<string>) => void;
  setSimulateViewMode: (mode: SimulateViewMode) => void;
  setSimulateDrawer: (drawer: SimulateDrawerState) => void;
  setSearchOpen: (isOpen: boolean) => void;
  setAiAssistantOpen: (isOpen: boolean) => void;
  toggleAiAssistant: () => void;
};

export type EditorContextValue = EditorState &
  EditorActions & {
    /** Ref to the search input element, used for focus management. */
    searchInputRef: React.RefObject<HTMLInputElement | null>;
  };

export const initialEditorState: EditorState = {
  globalMode: "edit",
  editViewMode: "canvas",
  editionMode: "cursor",
  cursorMode: "pan",
  isLeftSidebarOpen: true,
  isBottomPanelOpen: false,
  activeBottomPanelTab: "diagnostics",
  componentToAdd: null,
  selection: new Map(),
  hasSelection: false,
  hoveredItem: null,
  keptOpenVisualizerPlaceIds: new Set<string>(),
  visualizerStack: [],
  unfoldedComponentInstanceIds: new Set<string>(),
  openVisualizerPlaceId: null,
  focusedVisualizerPlaceId: null,
  draggingStateByNodeId: {},
  timelineChartType: "run",
  timelineView: { kind: "per-place" },
  hiddenTimelineSeriesIds: new Set(),
  simulateViewMode: "experiments",
  simulateDrawer: { type: "closed" },
  isSearchOpen: false,
  isAiAssistantOpen: false,
};

const DEFAULT_CONTEXT_VALUE: EditorContextValue = {
  ...initialEditorState,
  navigateTo: () => {},
  setGlobalMode: () => {},
  setEditViewMode: () => {},
  setEditionMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setActiveBottomPanelTab: () => {},
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
  keepPlaceVisualizerOpen: () => {},
  closePlaceVisualizer: () => {},
  bringVisualizerToFront: () => {},
  toggleComponentInstanceFold: () => {},
  openPlaceVisualizer: () => {},
  setVisualizerEditorFocus: () => {},
  updateDraggingStateByNodeId: () => {},
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
};

export const EditorContext = createContext<EditorContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

/** Where `EditorProvider` publishes the context value for {@link useEditorState}. */
export const EditorPublishedContext =
  createContext<Published<EditorContextValue>>(null);

/**
 * One part of the editor's state, or one of its actions. The reader renders
 * when that part changes.
 *
 * Almost every change in the editor is a change of the editor context: a
 * panel opening, a selection, a hover. `use(EditorContext)` renders its
 * reader for each of them. A component with many components below it, or one
 * of many like it, reads the parts it needs through this hook instead.
 *
 * ```tsx
 * const globalMode = useEditorState((editor) => editor.globalMode);
 * ```
 */
export const useEditorState = <Selected>(
  select: (editor: EditorContextValue) => Selected,
): Selected => useSelected(EditorContext, EditorPublishedContext, select);

/**
 * Several fields of the editor's state and actions, by name, for a reader
 * that needs more than one. It renders when one of them changes.
 *
 * ```tsx
 * const { cursorMode, selectItem } = useEditorFields("cursorMode", "selectItem");
 * ```
 */
export const useEditorFields = <Key extends keyof EditorContextValue>(
  ...keys: Key[]
): Pick<EditorContextValue, Key> =>
  useSelectedFields(EditorContext, EditorPublishedContext, keys);

/**
 * Where `EditorProvider` gives out the editor's actions, apart from its
 * state. Null where only `EditorContext` is provided, such as under a test.
 */
export const EditorActionsContext = createContext<EditorActions | null>(null);

/**
 * The editor's actions. A component that only acts on the editor reads them
 * here and renders for no change of the editor's state.
 *
 * ```tsx
 * const { selectItem } = useEditorActions();
 * ```
 */
export const useEditorActions = (): EditorActions =>
  // `use` is the one hook that may sit in a condition.
  use(EditorActionsContext) ?? use(EditorContext);

/**
 * Whether one item is selected. The reader renders when that answer changes,
 * so a list renders two of its rows when the selection moves from one to
 * another.
 */
export const useIsSelected = (id: string): boolean =>
  useEditorState((editor) => editor.selection.has(id));
