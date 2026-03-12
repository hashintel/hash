import { use, useCallback, useRef, useState } from "react";

import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorContext,
  type EditorContextValue,
  type EditorState,
  initialEditorState,
} from "./editor-context";
import type { SelectionItem, SelectionMap } from "./selection";
import { useSyncEditorToSettings } from "./use-sync-editor-to-settings";
import { UserSettingsContext } from "./user-settings-context";

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const userSettings = use(UserSettingsContext);

  const [state, setState] = useState<EditorState>(() => ({
    ...initialEditorState,
    cursorMode: userSettings.cursorMode,
    isLeftSidebarOpen: userSettings.isLeftSidebarOpen,
    leftSidebarWidth: userSettings.leftSidebarWidth,
    propertiesPanelWidth: userSettings.propertiesPanelWidth,
    isBottomPanelOpen: userSettings.isBottomPanelOpen,
    bottomPanelHeight: userSettings.bottomPanelHeight,
    activeBottomPanelTab: userSettings.activeBottomPanelTab,
    timelineChartType: userSettings.timelineChartType,
  }));

  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const triggerPanelAnimation = () => {
    if (!userSettings.showAnimations) {
      return;
    }
    clearTimeout(animationTimerRef.current);
    setState((prev) => ({ ...prev, isPanelAnimating: true }));
    // This timeout is not perfectly precise, but good enough for CSS transitions
    animationTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isPanelAnimating: false }));
    }, 500);
  };

  const setSelection = useCallback(
    (
      selectionOrUpdater: SelectionMap | ((prev: SelectionMap) => SelectionMap),
    ) =>
      setState((prev) => {
        const selection =
          typeof selectionOrUpdater === "function"
            ? selectionOrUpdater(prev.selection)
            : selectionOrUpdater;
        const hasSelection = selection.size > 0;
        if (prev.hasSelection !== hasSelection) {
          triggerPanelAnimation();
        }
        return { ...prev, selection, hasSelection };
      }),
    [],
  );

  const actions: Omit<EditorActions, "isSelected"> = {
    setGlobalMode: (mode) =>
      setState((prev) => ({ ...prev, globalMode: mode })),
    setEditionMode: (mode) =>
      setState((prev) => ({ ...prev, editionMode: mode })),
    setCursorMode: (mode) =>
      setState((prev) => ({ ...prev, cursorMode: mode })),
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
    setSelection,
    selectItem: (item: SelectionItem) => {
      setState((prev) => {
        const newSelection: SelectionMap = new Map([[item.id, item]]);
        if (!prev.hasSelection) {
          triggerPanelAnimation();
        }
        return { ...prev, selection: newSelection, hasSelection: true };
      });
    },
    toggleItem: (item: SelectionItem) => {
      setState((prev) => {
        const newSelection = new Map(prev.selection);
        if (newSelection.has(item.id)) {
          newSelection.delete(item.id);
        } else {
          newSelection.set(item.id, item);
        }
        const hasSelection = newSelection.size > 0;
        if (prev.hasSelection !== hasSelection) {
          triggerPanelAnimation();
        }
        return { ...prev, selection: newSelection, hasSelection };
      });
    },
    clearSelection: () => {
      setState((prev) => {
        if (prev.hasSelection) {
          triggerPanelAnimation();
        }
        return { ...prev, selection: new Map(), hasSelection: false };
      });
    },
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
        selection: new Map(),
        hasSelection: false,
      }));
    },
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    triggerPanelAnimation,
    __reinitialize: () => setState(initialEditorState),
  };

  useSyncEditorToSettings({
    cursorMode: state.cursorMode,
    isLeftSidebarOpen: state.isLeftSidebarOpen,
    leftSidebarWidth: state.leftSidebarWidth,
    propertiesPanelWidth: state.propertiesPanelWidth,
    isBottomPanelOpen: state.isBottomPanelOpen,
    bottomPanelHeight: state.bottomPanelHeight,
    activeBottomPanelTab: state.activeBottomPanelTab,
    timelineChartType: state.timelineChartType,
  });

  const { selection } = state;
  const isSelected = useCallback(
    (id: string) => selection.has(id),
    [selection],
  );

  const contextValue: EditorContextValue = {
    ...state,
    ...actions,
    isSelected,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};
