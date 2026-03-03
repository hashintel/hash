import { useRef, useState } from "react";

import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorContext,
  type EditorContextValue,
  type EditorState,
  initialEditorState,
} from "./editor-context";

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialEditorState);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const triggerPanelAnimation = () => {
    clearTimeout(animationTimerRef.current);
    setState((prev) => ({ ...prev, isPanelAnimating: true }));
    // This timeout is not perfectly precise, but good enough for CSS transitions
    animationTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isPanelAnimating: false }));
    }, 500);
  };

  const actions: EditorActions = {
    setGlobalMode: (mode) =>
      setState((prev) => ({ ...prev, globalMode: mode })),
    setEditionMode: (mode) =>
      setState((prev) => ({ ...prev, editionMode: mode })),
    setLeftSidebarOpen: (isOpen) => {
      triggerPanelAnimation();
      setState((prev) => ({ ...prev, isLeftSidebarOpen: isOpen }));
    },
    setLeftSidebarWidth: (width) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: width })),
    setPropertiesPanelWidth: (width) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: width })),
    setBottomPanelOpen: (isOpen) => {
      triggerPanelAnimation();
      setState((prev) => ({ ...prev, isBottomPanelOpen: isOpen }));
    },
    toggleBottomPanel: () => {
      triggerPanelAnimation();
      setState((prev) => ({
        ...prev,
        isBottomPanelOpen: !prev.isBottomPanelOpen,
      }));
    },
    setBottomPanelHeight: (height) =>
      setState((prev) => ({ ...prev, bottomPanelHeight: height })),
    setActiveBottomPanelTab: (tab) =>
      setState((prev) => ({ ...prev, activeBottomPanelTab: tab })),
    setSelectedResourceId: (id) => {
      triggerPanelAnimation();
      setState((prev) => ({ ...prev, selectedResourceId: id }));
    },
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
    collapseAllPanels: () => {
      triggerPanelAnimation();
      setState((prev) => ({
        ...prev,
        isLeftSidebarOpen: false,
        isBottomPanelOpen: false,
        selectedResourceId: null,
      }));
    },
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    triggerPanelAnimation,
    __reinitialize: () => setState(initialEditorState),
  };

  const contextValue: EditorContextValue = {
    ...state,
    ...actions,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};
