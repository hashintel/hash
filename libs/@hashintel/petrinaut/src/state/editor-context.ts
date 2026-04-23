import { createContext, createRef } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "../constants/ui";
import type { SelectionItem, SelectionMap } from "./selection";

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
  selection: SelectionMap;
  /** Whether any items are currently selected. */
  hasSelection: boolean;
  /** Whether any items on the canvas are currently selected. */
  hasCanvasSelection: boolean;
  /** The item currently being hovered, if any. */
  hoveredItem: SelectionItem | null;
  draggingStateByNodeId: DraggingStateByNodeId;
  timelineChartType: TimelineChartType;
  isPanelAnimating: boolean;
  isSearchOpen: boolean;
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
  setSearchOpen: (isOpen: boolean) => void;
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
  selection: new Map(),
  hasSelection: false,
  hasCanvasSelection: false,
  hoveredItem: null,
  draggingStateByNodeId: {},
  timelineChartType: "run",
  isPanelAnimating: false,
  isSearchOpen: false,
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
  setSearchOpen: () => {},
  searchInputRef: createRef<HTMLInputElement | null>(),
  triggerPanelAnimation: () => {},
  __reinitialize: () => {},
};

export const EditorContext = createContext<EditorContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
