import { use, useRef, useState } from "react";

import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorContext,
  type EditorContextValue,
  type EditorState,
  initialEditorState,
} from "./editor-context";
import { getNodeConnections } from "../lib/get-connections";
import { SDCPNContext } from "./sdcpn-context";
import type { SelectionItem, SelectionMap } from "./selection";
import { useSyncEditorToSettings } from "./use-sync-editor-to-settings";
import { UserSettingsContext } from "./user-settings-context";

export type EditorProviderProps = React.PropsWithChildren;

const canvasSelections = (selection: SelectionMap) =>
  Array.from(selection.entries()).filter(
    ([_, s]) =>
      s.type === "arc" || s.type === "place" || s.type === "transition",
  );

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const userSettings = use(UserSettingsContext);
  const { petriNetDefinition } = use(SDCPNContext);

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
   * Returns state patch to enable panel animation. Must be spread into the
   * same setState call as the layout change so CSS transitions are active
   * before the panel's open/close state flips.
   */
  const animationPatch = (): Partial<EditorState> => {
    if (!userSettings.showAnimations) {
      return {};
    }
    return { isPanelAnimating: true };
  };

  /**
   * Schedule clearing the animation flag after transitions complete.
   * Called outside setState updaters to keep them pure.
   */
  const scheduleAnimationEnd = () => {
    if (!userSettings.showAnimations) {
      return;
    }
    clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isPanelAnimating: false }));
    }, 500);
  };

  const setSelection = (
    selectionOrUpdater: SelectionMap | ((prev: SelectionMap) => SelectionMap),
  ) => {
    scheduleAnimationEnd();
    setState((prev) => {
      const selection =
        typeof selectionOrUpdater === "function"
          ? selectionOrUpdater(prev.selection)
          : selectionOrUpdater;
      const hasSelection = selection.size > 0;
      const animate = prev.hasSelection !== hasSelection;
      return {
        ...prev,
        ...(animate ? animationPatch() : {}),
        selection,
        hasSelection,
        hasCanvasSelection: canvasSelections(selection).length > 0,
      };
    });
  };

  const actions: Omit<
    EditorActions,
    | "isSelected"
    | "isSelectedConnection"
    | "isNotSelectedConnection"
    | "selectedConnections"
    | "isHovered"
    | "isHoveredConnection"
    | "isNotHoveredConnection"
  > = {
    setGlobalMode: (mode) =>
      setState((prev) => ({ ...prev, globalMode: mode })),
    setEditionMode: (mode) =>
      setState((prev) => ({ ...prev, editionMode: mode })),
    setCursorMode: (mode) =>
      setState((prev) => ({ ...prev, cursorMode: mode })),
    setLeftSidebarOpen: (isOpen) => {
      scheduleAnimationEnd();
      setState((prev) => ({
        ...prev,
        ...animationPatch(),
        isLeftSidebarOpen: isOpen,
      }));
    },
    setLeftSidebarWidth: (width) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: width })),
    setPropertiesPanelWidth: (width) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: width })),
    setBottomPanelOpen: (isOpen) => {
      scheduleAnimationEnd();
      setState((prev) => ({
        ...prev,
        ...animationPatch(),
        isBottomPanelOpen: isOpen,
      }));
    },
    toggleBottomPanel: () => {
      scheduleAnimationEnd();
      setState((prev) => ({
        ...prev,
        ...animationPatch(),
        isBottomPanelOpen: !prev.isBottomPanelOpen,
      }));
    },
    setBottomPanelHeight: (height) =>
      setState((prev) => ({ ...prev, bottomPanelHeight: height })),
    setActiveBottomPanelTab: (tab) =>
      setState((prev) => ({ ...prev, activeBottomPanelTab: tab })),
    setSelection,
    selectItem: (item: SelectionItem) => {
      scheduleAnimationEnd();
      setState((prev) => {
        const newSelection: SelectionMap = new Map([[item.id, item]]);
        const animate = !prev.hasSelection;
        return {
          ...prev,
          ...(animate ? animationPatch() : {}),
          selection: newSelection,
          hasSelection: true,
          hasCanvasSelection: canvasSelections(newSelection).length > 0,
        };
      });
    },
    toggleItem: (item: SelectionItem) => {
      scheduleAnimationEnd();
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
          ...(animate ? animationPatch() : {}),
          selection: newSelection,
          hasSelection,
          hasCanvasSelection: canvasSelections(newSelection).length > 0,
        };
      });
    },
    clearSelection: () => {
      scheduleAnimationEnd();
      setState((prev) => ({
        ...prev,
        ...(prev.hasSelection ? animationPatch() : {}),
        selection: new Map(),
        hasSelection: false,
        hasCanvasSelection: false,
      }));
    },
    setHoveredItem: (item: SelectionItem) =>
      setState((prev) => ({ ...prev, hoveredItem: item })),
    clearHoveredItem: () =>
      setState((prev) => ({ ...prev, hoveredItem: null })),
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
      scheduleAnimationEnd();
      setState((prev) => ({
        ...prev,
        ...animationPatch(),
        isLeftSidebarOpen: false,
        isSearchOpen: false,
        isBottomPanelOpen: false,
        selection: new Map(),
        hasSelection: false,
        hasCanvasSelection: false,
      }));
    },
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    setSearchOpen: (isOpen) => {
      scheduleAnimationEnd();
      setState((prev) => {
        // Animate when search visibility changes the sidebar appearance
        // (sidebar becomes visible due to search, or hides when search closes
        // and sidebar was not explicitly open)
        const sidebarWasVisible = prev.isLeftSidebarOpen || prev.isSearchOpen;
        const sidebarWillBeVisible = prev.isLeftSidebarOpen || isOpen;
        const animate = sidebarWasVisible !== sidebarWillBeVisible;
        return {
          ...prev,
          ...(animate ? animationPatch() : {}),
          isSearchOpen: isOpen,
        };
      });
    },
    triggerPanelAnimation: () => {
      scheduleAnimationEnd();
      setState((prev) => ({ ...prev, ...animationPatch() }));
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

  const { selection, hoveredItem } = state;
  const isSelected = (id: string) => selection.has(id);

  const selectedConnections = getNodeConnections(
    petriNetDefinition.transitions,
    new Set(selection.keys()),
  );

  const isSelectedConnection = (id: string) => selectedConnections.has(id);
  const isNotSelectedConnection = (id: string) =>
    canvasSelections(selection).length > 0 &&
    !isSelected(id) &&
    !selectedConnections.has(id);

  const isHovered = (id: string) => hoveredItem?.id === id;

  const hoveredConnections = getNodeConnections(
    petriNetDefinition.transitions,
    new Set(hoveredItem ? [hoveredItem.id] : []),
  );

  const isHoveredConnection = (id: string) => hoveredConnections.has(id);
  const isNotHoveredConnection = (id: string) =>
    !!hoveredItem && !isHovered(id) && !hoveredConnections.has(id);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const contextValue: EditorContextValue = {
    ...state,
    ...actions,
    isSelected,
    isHovered,
    isHoveredConnection,
    isNotHoveredConnection,
    isSelectedConnection,
    isNotSelectedConnection,
    selectedConnections,
    searchInputRef,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};
