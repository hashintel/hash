import { createContext, createRef, use } from "react";

import {
  useSelected,
  useSelectedFields,
  type Published,
} from "../shared/select-from-context";

import type {
  EditorGlobalMode,
  EditViewMode,
  SimulateViewMode,
} from "../navigation/navigation";
import type {
  ComponentReference,
  SelectionItem,
  SelectionMap,
} from "@hashintel/petrinaut-core";

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

/** Beside the editor in a column of its own, or over it as a window. */
export type AssistantPlacement = "docked" | "floating";

export type SimulateDrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" }
  | { type: "view-experiment"; experimentId: string }
  | { type: "create-experiment" };

type EditorNavigationTarget = {
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
  assistantPlacement: AssistantPlacement;
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
  setSelection: (
    selection: SelectionMap | ((prev: SelectionMap) => SelectionMap),
    options?: { cause: "normalization" } | { batch: "react-flow" },
  ) => void;
  beginSelectionGesture: () => void;
  endSelectionGesture: () => void;
  selectItem: (item: SelectionItem) => void;
  toggleItem: (item: SelectionItem) => void;
  clearSelection: () => void;
  keepPlaceVisualizerOpen: (placeId: string) => void;
  closePlaceVisualizer: (placeId: string) => void;
  bringVisualizerToFront: (placeId: string) => void;
  /** Unfold a component instance's ports on the canvas, or fold them again. */
  toggleComponentInstanceFold: (instanceId: string) => void;
  /** Show or dismiss a temporary preview. */
  openPlaceVisualizer: (placeId: string | null) => void;
  setVisualizerEditorFocus: (placeId: string, focused: boolean) => void;
  collapseAllPanels: () => void;
  setTimelineChartType: (chartType: TimelineChartType) => void;
  setTimelineView: (view: TimelineView) => void;
  setHiddenTimelineSeriesIds: (seriesIds: Set<string>) => void;
  setSimulateViewMode: (mode: SimulateViewMode) => void;
  setSimulateDrawer: (drawer: SimulateDrawerState) => void;
  setSearchOpen: (isOpen: boolean) => void;
  setAiAssistantOpen: (isOpen: boolean) => void;
  toggleAiAssistant: () => void;
  setAssistantPlacement: (placement: AssistantPlacement) => void;
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
  keptOpenVisualizerPlaceIds: new Set<string>(),
  visualizerStack: [],
  unfoldedComponentInstanceIds: new Set<string>(),
  openVisualizerPlaceId: null,
  focusedVisualizerPlaceId: null,
  timelineChartType: "run",
  timelineView: { kind: "per-place" },
  hiddenTimelineSeriesIds: new Set(),
  simulateViewMode: "experiments",
  simulateDrawer: { type: "closed" },
  isSearchOpen: false,
  isAiAssistantOpen: false,
  assistantPlacement: "docked",
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
  setSelection: () => {},
  beginSelectionGesture: () => {},
  endSelectionGesture: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  keepPlaceVisualizerOpen: () => {},
  closePlaceVisualizer: () => {},
  bringVisualizerToFront: () => {},
  toggleComponentInstanceFold: () => {},
  openPlaceVisualizer: () => {},
  setVisualizerEditorFocus: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  setTimelineView: () => {},
  setHiddenTimelineSeriesIds: () => {},
  setSimulateViewMode: () => {},
  setSimulateDrawer: () => {},
  setSearchOpen: () => {},
  setAiAssistantOpen: () => {},
  toggleAiAssistant: () => {},
  setAssistantPlacement: () => {},
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
 * The editor's actions: one object for the editor's life. A component that
 * only acts on the editor reads them here and renders for no change of the
 * editor's state. Each action reads what it needs when it is called.
 *
 * ```tsx
 * const { selectItem } = useEditorActions();
 * ```
 */
export const useEditorActions = (): EditorActions =>
  // `use` is the one hook that may sit in a condition.
  use(EditorActionsContext) ?? use(EditorContext);

/** The mode of the editor and the view of its Edit mode. */
type EditorMode = Pick<EditorState, "globalMode" | "editViewMode">;

/**
 * Where `EditorProvider` gives out the mode. Null where only `EditorContext`
 * is provided, such as under a test.
 */
export const EditorModeContext = createContext<EditorMode | null>(null);

/**
 * The mode, in the commit that changes it. What decides which part of the
 * editor is shown reads the mode here and not by part: a part read through
 * `useEditorState` arrives one commit later, after the contexts that follow
 * the mode have changed, the read-only reason among them. The value changes
 * with the mode alone, so its readers render for no selection.
 */
export const useEditorMode = (): EditorMode =>
  use(EditorModeContext) ?? use(EditorContext);

/**
 * Whether one item is selected. The reader renders when that answer changes,
 * so a list renders two of its rows when the selection moves from one to
 * another.
 */
export const useIsSelected = (id: string): boolean =>
  useEditorState((editor) => editor.selection.has(id));
