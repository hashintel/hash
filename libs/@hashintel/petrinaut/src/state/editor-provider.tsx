import { useMemo, useState } from "react";

import { PANEL_MARGIN } from "../constants/ui";
import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorContext,
  type EditorContextValue,
  type EditorState,
  initialEditorState,
  type VisibleViewport,
} from "./editor-context";

export type EditorProviderProps = React.PropsWithChildren;

function computeVisibleViewport(params: {
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  selectedResourceId: string | null;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
}): VisibleViewport {
  return {
    top: PANEL_MARGIN,
    left: params.isLeftSidebarOpen
      ? params.leftSidebarWidth + PANEL_MARGIN * 2
      : PANEL_MARGIN,
    right: params.selectedResourceId
      ? params.propertiesPanelWidth + PANEL_MARGIN * 2
      : PANEL_MARGIN,
    bottom: params.isBottomPanelOpen
      ? params.bottomPanelHeight + PANEL_MARGIN * 2
      : PANEL_MARGIN,
  };
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialEditorState);

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
    setDraggingStateByNodeId: (draggingState: DraggingStateByNodeId) =>
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
    __reinitialize: () => setState(initialEditorState),
  };

  const visibleViewport = useMemo(
    () =>
      computeVisibleViewport({
        isLeftSidebarOpen: state.isLeftSidebarOpen,
        leftSidebarWidth: state.leftSidebarWidth,
        selectedResourceId: state.selectedResourceId,
        propertiesPanelWidth: state.propertiesPanelWidth,
        isBottomPanelOpen: state.isBottomPanelOpen,
        bottomPanelHeight: state.bottomPanelHeight,
      }),
    [
      state.isLeftSidebarOpen,
      state.leftSidebarWidth,
      state.selectedResourceId,
      state.propertiesPanelWidth,
      state.isBottomPanelOpen,
      state.bottomPanelHeight,
    ],
  );

  const contextValue: EditorContextValue = {
    ...state,
    ...actions,
    visibleViewport,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};
