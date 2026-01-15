import { useState } from "react";

import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorActionsContext,
  type EditorState,
  EditorStateContext,
  initialEditorState,
} from "./editor-context";

export {
  BottomPanelTab,
  DraggingStateByNodeId,
  EditorActions,
  EditorState,
  TimelineChartType,
  useEditorActions,
  useEditorState,
  useEditorStore,
} from "./editor-context";

export type EditorProviderProps = React.PropsWithChildren;

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

  return (
    <EditorStateContext.Provider value={state}>
      <EditorActionsContext.Provider value={actions}>
        {children}
      </EditorActionsContext.Provider>
    </EditorStateContext.Provider>
  );
};
