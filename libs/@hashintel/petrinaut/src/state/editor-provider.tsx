import { use, useRef, useState } from "react";

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

  /**
   * Start panel animation by setting isPanelAnimating in the same state
   * update that triggers the layout change, ensuring CSS transitions are
   * active before the panel's open/close state flips. A timeout clears
   * the flag after the transition completes.
   */
  const startAnimation = (
    patch: Partial<EditorState>,
  ): Partial<EditorState> => {
    if (!userSettings.showAnimations) {
      return patch;
    }
    clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isPanelAnimating: false }));
    }, 500);
    return { ...patch, isPanelAnimating: true };
  };

  const setSelection = (
    selectionOrUpdater: SelectionMap | ((prev: SelectionMap) => SelectionMap),
  ) =>
    setState((prev) => {
      const selection =
        typeof selectionOrUpdater === "function"
          ? selectionOrUpdater(prev.selection)
          : selectionOrUpdater;
      const hasSelection = selection.size > 0;
      const animate = prev.hasSelection !== hasSelection;
      return {
        ...prev,
        ...(animate ? startAnimation({}) : {}),
        selection,
        hasSelection,
      };
    });

  const actions: Omit<EditorActions, "isSelected"> = {
    setGlobalMode: (mode) =>
      setState((prev) => ({ ...prev, globalMode: mode })),
    setEditionMode: (mode) =>
      setState((prev) => ({ ...prev, editionMode: mode })),
    setCursorMode: (mode) =>
      setState((prev) => ({ ...prev, cursorMode: mode })),
    setLeftSidebarOpen: (isOpen) => {
      setState((prev) => ({
        ...prev,
        ...startAnimation({}),
        isLeftSidebarOpen: isOpen,
      }));
    },
    setLeftSidebarWidth: (width) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: width })),
    setPropertiesPanelWidth: (width) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: width })),
    setBottomPanelOpen: (isOpen) => {
      setState((prev) => ({
        ...prev,
        ...startAnimation({}),
        isBottomPanelOpen: isOpen,
      }));
    },
    toggleBottomPanel: () => {
      setState((prev) => ({
        ...prev,
        ...startAnimation({}),
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
        const animate = !prev.hasSelection;
        return {
          ...prev,
          ...(animate ? startAnimation({}) : {}),
          selection: newSelection,
          hasSelection: true,
        };
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
        const animate = prev.hasSelection !== hasSelection;
        return {
          ...prev,
          ...(animate ? startAnimation({}) : {}),
          selection: newSelection,
          hasSelection,
        };
      });
    },
    clearSelection: () => {
      setState((prev) => ({
        ...prev,
        ...(prev.hasSelection ? startAnimation({}) : {}),
        selection: new Map(),
        hasSelection: false,
      }));
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
      setState((prev) => ({
        ...prev,
        ...startAnimation({}),
        isLeftSidebarOpen: false,
        isSearchOpen: false,
        isBottomPanelOpen: false,
        selection: new Map(),
        hasSelection: false,
      }));
    },
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    setSearchOpen: (isOpen) => {
      setState((prev) => {
        // Animate when search visibility changes the sidebar appearance
        // (sidebar becomes visible due to search, or hides when search closes
        // and sidebar was not explicitly open)
        const sidebarWasVisible = prev.isLeftSidebarOpen || prev.isSearchOpen;
        const sidebarWillBeVisible = prev.isLeftSidebarOpen || isOpen;
        const animate = sidebarWasVisible !== sidebarWillBeVisible;
        return {
          ...prev,
          ...(animate ? startAnimation({}) : {}),
          isSearchOpen: isOpen,
        };
      });
    },
    triggerPanelAnimation: () => {
      setState((prev) => ({ ...prev, ...startAnimation({}) }));
    },
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
  const isSelected = (id: string) => selection.has(id);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const contextValue: EditorContextValue = {
    ...state,
    ...actions,
    isSelected,
    searchInputRef,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};
