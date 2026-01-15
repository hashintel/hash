import { createContext, use, useState } from "react";

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
type EditorEditionMode = "select" | "pan" | "add-place" | "add-transition";
export type BottomPanelTab =
  | "diagnostics"
  | "simulation-settings"
  | "simulation-timeline";

export type TimelineChartType = "run" | "stacked";

/**
 * The state values for the editor.
 * Components that consume this context will re-render when any of these values change.
 */
export type EditorState = {
  globalMode: EditorGlobalMode;
  editionMode: EditorEditionMode;
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
};

/**
 * The action functions for the editor.
 * These are stable and won't cause re-renders when consumed.
 */
export type EditorActions = {
  setGlobalMode: (mode: EditorGlobalMode) => void;
  setEditionMode: (mode: EditorEditionMode) => void;
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
  setTimelineChartType: (chartType: TimelineChartType) => void;
  __reinitialize: () => void;
};

const EditorStateContext = createContext<EditorState | null>(null);
const EditorActionsContext = createContext<EditorActions | null>(null);

const initialState: EditorState = {
  globalMode: "edit",
  editionMode: "select",
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
};

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialState);

  const actions: EditorActions = {
    setGlobalMode: (mode) =>
      setState((prev) => ({ ...prev, globalMode: mode })),
    setEditionMode: (mode) =>
      setState((prev) => ({ ...prev, editionMode: mode })),
    setLeftSidebarOpen: (isOpen) =>
      setState((prev) => ({ ...prev, isLeftSidebarOpen: isOpen })),
    setLeftSidebarWidth: (width) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: width })),
    setPropertiesPanelWidth: (width) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: width })),
    setBottomPanelOpen: (isOpen) =>
      setState((prev) => ({ ...prev, isBottomPanelOpen: isOpen })),
    toggleBottomPanel: () =>
      setState((prev) => ({
        ...prev,
        isBottomPanelOpen: !prev.isBottomPanelOpen,
      })),
    setBottomPanelHeight: (height) =>
      setState((prev) => ({ ...prev, bottomPanelHeight: height })),
    setActiveBottomPanelTab: (tab) =>
      setState((prev) => ({ ...prev, activeBottomPanelTab: tab })),
    setSelectedResourceId: (id) =>
      setState((prev) => ({ ...prev, selectedResourceId: id })),
    setSelectedItemIds: (ids) =>
      setState((prev) => ({ ...prev, selectedItemIds: ids })),
    addSelectedItemId: (id) =>
      setState((prev) => {
        const newSet = new Set(prev.selectedItemIds);
        newSet.add(id);
        return { ...prev, selectedItemIds: newSet };
      }),
    removeSelectedItemId: (id) =>
      setState((prev) => {
        const newSet = new Set(prev.selectedItemIds);
        newSet.delete(id);
        return { ...prev, selectedItemIds: newSet };
      }),
    clearSelection: () =>
      setState((prev) => ({ ...prev, selectedItemIds: new Set() })),
    setDraggingStateByNodeId: (draggingState) =>
      setState((prev) => ({ ...prev, draggingStateByNodeId: draggingState })),
    updateDraggingStateByNodeId: (updater) =>
      setState((prev) => ({
        ...prev,
        draggingStateByNodeId: updater(prev.draggingStateByNodeId),
      })),
    resetDraggingState: () =>
      setState((prev) => ({ ...prev, draggingStateByNodeId: {} })),
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    __reinitialize: () => setState(initialState),
  };

  return (
    <EditorStateContext.Provider value={state}>
      <EditorActionsContext.Provider value={actions}>
        {children}
      </EditorActionsContext.Provider>
    </EditorStateContext.Provider>
  );
};

/**
 * Hook to access the editor state.
 * Components using this will re-render when any state value changes.
 */
export function useEditorState(): EditorState {
  const context = use(EditorStateContext);

  if (!context) {
    throw new Error("useEditorState must be used within EditorProvider");
  }

  return context;
}

/**
 * Hook to access the editor actions.
 * These are stable and won't cause re-renders.
 */
export function useEditorActions(): EditorActions {
  const context = use(EditorActionsContext);

  if (!context) {
    throw new Error("useEditorActions must be used within EditorProvider");
  }

  return context;
}

/**
 * Hook to access a specific piece of editor state using a selector.
 * This is provided for backward compatibility but note that it will
 * still re-render when any state changes (unlike Zustand's selector).
 * For optimal performance, use useEditorState() or useEditorActions() directly.
 */
export function useEditorStore<T>(
  selector: (state: EditorState & EditorActions) => T,
): T {
  const stateContext = use(EditorStateContext);
  const actionsContext = use(EditorActionsContext);

  if (!stateContext || !actionsContext) {
    throw new Error("useEditorStore must be used within EditorProvider");
  }

  // Combine state and actions for backward compatibility
  const combined = { ...stateContext, ...actionsContext };

  return selector(combined);
}
