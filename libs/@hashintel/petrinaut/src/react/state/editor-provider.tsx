import { use, useEffect, useRef, useState } from "react";

import {
  getNodeConnections,
  type SelectionItem,
  type SelectionMap,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../actual-mode-context";
import {
  navigationResourceToSimulateDrawer,
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
  usePetrinautNavigation,
} from "../navigation";
import { ActiveNetContext } from "./active-net-context";
import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorContext,
  type EditorContextValue,
  type EditorState,
  initialEditorState,
} from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";
import { useSyncEditorToSettings } from "./use-sync-editor-to-settings";
import { UserSettingsContext } from "./user-settings-context";

export type EditorProviderProps = React.PropsWithChildren;

const canvasSelections = (selection: SelectionMap) =>
  Array.from(selection.entries()).filter(
    ([_, s]) =>
      s.type === "arc" ||
      s.type === "place" ||
      s.type === "transition" ||
      s.type === "componentInstance",
  );

const selectionFromNavigation = (
  items: readonly SelectionItem[],
): SelectionMap => new Map(items.map((item) => [item.id, item]));

const selectionToNavigation = (selection: SelectionMap) =>
  Array.from(selection.values());

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const userSettings = use(UserSettingsContext);
  const actualMode = use(ActualModeContext);
  const navigation = usePetrinautNavigation();
  const { activeNet } = use(ActiveNetContext);
  const { getItemType, petriNetDefinition } = use(SDCPNContext);
  const startsInActualMode = actualMode.available;
  const startsWithActualTimeline =
    startsInActualMode &&
    actualMode.initialState !== null &&
    (actualMode.status === "streaming" || actualMode.status === "complete");
  // Navigation-owned fields (mode, Simulate view, drawer, selection) are NOT
  // seeded here: `effectiveState` below derives them from navigation state on
  // every render, so local copies would only be a stale second source of truth.
  const [state, setState] = useState<EditorState>(() => ({
    ...initialEditorState,
    cursorMode: userSettings.cursorMode,
    isLeftSidebarOpen: userSettings.isLeftSidebarOpen,
    leftSidebarWidth: userSettings.leftSidebarWidth,
    propertiesPanelWidth: userSettings.propertiesPanelWidth,
    isBottomPanelOpen: startsWithActualTimeline
      ? true
      : userSettings.isBottomPanelOpen,
    bottomPanelHeight: userSettings.bottomPanelHeight,
    activeBottomPanelTab: startsWithActualTimeline
      ? "actual-timeline"
      : userSettings.activeBottomPanelTab,
    timelineChartType: userSettings.timelineChartType,
  }));

  const navigatedResource = navigation.state.simulateResource;
  const navigatedSelection = navigation.state.selection;
  useEffect(() => {
    const invalidResource =
      (navigatedResource?.type === "scenario" &&
        !petriNetDefinition.scenarios?.some(
          ({ id }) => id === navigatedResource.id,
        )) ||
      (navigatedResource?.type === "metric" &&
        !petriNetDefinition.metrics?.some(
          ({ id }) => id === navigatedResource.id,
        ));
    const validSelection = navigatedSelection.filter(
      (item) => getItemType(item.id) === item.type,
    );
    const hasInvalidSelection =
      validSelection.length !== navigatedSelection.length;

    if (invalidResource || hasInvalidSelection) {
      // The checks above read the committed state, but the update is applied
      // to the host's freshest state, which an asynchronous host may already
      // have moved on from. Re-filter inside the updater so normalization
      // never writes back a selection the user has since replaced.
      navigation.navigate(
        (current) => ({
          ...current,
          ...(invalidResource ? { simulateResource: null } : {}),
          ...(hasInvalidSelection
            ? {
                selection: current.selection.filter(
                  (item) => getItemType(item.id) === item.type,
                ),
              }
            : {}),
        }),
        {
          cause: "normalization",
          action: invalidResource ? "simulation-resource" : "selection",
        },
      );
    }
  }, [
    getItemType,
    navigatedResource,
    navigatedSelection,
    navigation,
    petriNetDefinition.metrics,
    petriNetDefinition.scenarios,
  ]);

  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const selectionGestureRef = useRef({ active: false, hasNavigated: false });
  const selectionNavigationMountedRef = useRef(true);
  const pendingSelectionNavigationRef = useRef<{
    updates: Array<(selection: SelectionMap) => SelectionMap>;
  } | null>(null);
  const selectionNavigationScheduledRef = useRef(false);
  const flushPendingSelectionNavigationRef = useRef<(() => void) | null>(null);

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
    options?: { cause: "normalization" } | { batch: "react-flow" },
  ) => {
    const selectionUpdate =
      typeof selectionOrUpdater === "function"
        ? selectionOrUpdater
        : () => selectionOrUpdater;
    if (!(options && "cause" in options)) {
      const current = selectionFromNavigation(navigation.state.selection);
      const preview = selectionUpdate(current);
      if (current.size > 0 !== preview.size > 0) {
        scheduleAnimationEnd();
        setState((prev) => ({ ...prev, ...animationPatch() }));
      }
    }

    const navigateSelection = (
      updates: Array<(selection: SelectionMap) => SelectionMap>,
      intent:
        | { cause: "normalization"; action: "selection" }
        | {
            cause: "user";
            action: "selection";
            phase: "discrete" | "start" | "continue";
          },
    ) => {
      const didNavigate = navigation.navigate((current) => {
        const selection = updates.reduce(
          (value, update) => update(value),
          selectionFromNavigation(current.selection),
        );
        return { ...current, selection: selectionToNavigation(selection) };
      }, intent);
      if (
        didNavigate &&
        intent.cause === "user" &&
        selectionGestureRef.current.active
      ) {
        selectionGestureRef.current.hasNavigated = true;
      }
    };

    if (options && "cause" in options) {
      navigateSelection([selectionUpdate], {
        cause: "normalization",
        action: "selection",
      });
      return;
    }

    if (!options || !("batch" in options)) {
      const gesture = selectionGestureRef.current;
      navigateSelection([selectionUpdate], {
        cause: "user",
        action: "selection",
        phase: gesture.active
          ? gesture.hasNavigated
            ? "continue"
            : "start"
          : "discrete",
      });
      return;
    }

    const pending = pendingSelectionNavigationRef.current ?? { updates: [] };
    pending.updates.push(selectionUpdate);
    pendingSelectionNavigationRef.current = pending;

    if (!selectionNavigationScheduledRef.current) {
      selectionNavigationScheduledRef.current = true;
      const flush = () => {
        selectionNavigationScheduledRef.current = false;
        flushPendingSelectionNavigationRef.current = null;
        const queued = pendingSelectionNavigationRef.current;
        pendingSelectionNavigationRef.current = null;
        if (!queued || !selectionNavigationMountedRef.current) {
          return;
        }

        const gesture = selectionGestureRef.current;
        navigateSelection(queued.updates, {
          cause: "user",
          action: "selection",
          phase: gesture.active
            ? gesture.hasNavigated
              ? "continue"
              : "start"
            : "discrete",
        });
      };
      flushPendingSelectionNavigationRef.current = flush;
      queueMicrotask(flush);
    }
  };

  const beginSelectionGesture = () => {
    selectionGestureRef.current = { active: true, hasNavigated: false };
  };

  // React Flow delivers a gesture's final selection change in the same event
  // as its end callback, and the change flushes in a microtask. Flush it while
  // the gesture still counts as active, so the gesture's last commit is a
  // continuation rather than a separate discrete history entry.
  const endSelectionGesture = () => {
    flushPendingSelectionNavigationRef.current?.();
    selectionGestureRef.current = { active: false, hasNavigated: false };
  };

  useEffect(() => {
    selectionNavigationMountedRef.current = true;
    const finishInterruptedGesture = () => {
      flushPendingSelectionNavigationRef.current?.();
      selectionGestureRef.current = { active: false, hasNavigated: false };
    };
    window.addEventListener("pointerup", finishInterruptedGesture);
    window.addEventListener("pointercancel", finishInterruptedGesture);
    window.addEventListener("blur", finishInterruptedGesture);
    return () => {
      selectionNavigationMountedRef.current = false;
      pendingSelectionNavigationRef.current = null;
      finishInterruptedGesture();
      window.removeEventListener("pointerup", finishInterruptedGesture);
      window.removeEventListener("pointercancel", finishInterruptedGesture);
      window.removeEventListener("blur", finishInterruptedGesture);
    };
  }, []);

  const navigateTo: EditorActions["navigateTo"] = (target) => {
    const hasSelection = target.selection !== undefined;
    const drawerChangesOverlay =
      target.simulateDrawer !== undefined &&
      simulateDrawerToNavigationOverlay(
        target.simulateDrawer,
        navigation.state.overlay,
      )?.type !== navigation.state.overlay?.type;
    if (hasSelection) {
      const selection = selectionFromNavigation(navigation.state.selection);
      if (selection.size > 0 !== target.selection!.size > 0) {
        scheduleAnimationEnd();
      }
    }

    navigation.navigate(
      (current) => ({
        ...current,
        ...(target.globalMode !== undefined ? { mode: target.globalMode } : {}),
        ...(target.simulateViewMode !== undefined
          ? {
              simulateView: target.simulateViewMode,
              // Switching section leaves the record behind: it belongs to the
              // section being left. A `closed` drawer here means "reset the
              // drawers for the new section", not "dismiss the drawer on top",
              // so it does not go through the overlay-aware mapping.
              simulateResource:
                target.simulateDrawer && target.simulateDrawer.type !== "closed"
                  ? simulateDrawerToNavigationResource(
                      target.simulateDrawer,
                      current,
                    )
                  : null,
              overlay: target.simulateDrawer
                ? simulateDrawerToNavigationOverlay(
                    target.simulateDrawer,
                    current.overlay,
                  )
                : current.overlay,
            }
          : target.simulateDrawer !== undefined
            ? {
                simulateResource: simulateDrawerToNavigationResource(
                  target.simulateDrawer,
                  current,
                ),
                overlay: simulateDrawerToNavigationOverlay(
                  target.simulateDrawer,
                  current.overlay,
                ),
              }
            : {}),
        ...(target.selection !== undefined
          ? { selection: selectionToNavigation(target.selection) }
          : {}),
      }),
      {
        cause: "user",
        action:
          target.selection !== undefined
            ? "selection"
            : target.simulateDrawer !== undefined
              ? drawerChangesOverlay
                ? "overlay"
                : "simulation-resource"
              : target.simulateViewMode !== undefined
                ? "simulation-view"
                : "mode",
      },
    );

    // Mode, view, and drawer flow back in through `effectiveState`, which
    // derives them from navigation state on every render; only the selection
    // animation flag lives in local state.
    const animateSelection =
      hasSelection &&
      navigation.state.selection.length > 0 !== target.selection!.size > 0;
    if (animateSelection) {
      setState((prev) => ({ ...prev, ...animationPatch() }));
    }
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
    navigateTo,
    setGlobalMode: (mode) => navigateTo({ globalMode: mode }),
    setEditionMode: (mode) =>
      setState((prev) => ({
        ...prev,
        editionMode: mode,
        componentSubnetId:
          mode === "add-component" ? prev.componentSubnetId : null,
      })),
    setAddComponentMode: (subnetId) =>
      setState((prev) => ({
        ...prev,
        editionMode: "add-component",
        componentSubnetId: subnetId,
      })),
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
    beginSelectionGesture,
    endSelectionGesture,
    selectItem: (item: SelectionItem) =>
      navigateTo({ selection: new Map([[item.id, item]]) }),
    toggleItem: (item: SelectionItem) =>
      setSelection((prev) => {
        const selection = new Map(prev);
        if (selection.has(item.id)) {
          selection.delete(item.id);
        } else {
          selection.set(item.id, item);
        }
        return selection;
      }),
    clearSelection: () => setSelection(new Map()),
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
      navigation.navigate(
        { selection: [] },
        { cause: "user", action: "selection" },
      );
      setState((prev) => ({
        ...prev,
        ...animationPatch(),
        isLeftSidebarOpen: false,
        isSearchOpen: false,
        isBottomPanelOpen: false,
      }));
    },
    setTimelineChartType: (chartType) =>
      setState((prev) => ({ ...prev, timelineChartType: chartType })),
    setTimelineView: (view) =>
      setState((prev) => ({ ...prev, timelineView: view })),
    setHiddenTimelineSeriesIds: (seriesIds) =>
      setState((prev) => ({ ...prev, hiddenTimelineSeriesIds: seriesIds })),
    setSimulateViewMode: (mode) =>
      navigateTo({
        simulateViewMode: mode,
        simulateDrawer: { type: "closed" },
      }),
    setSimulateDrawer: (drawer) => navigateTo({ simulateDrawer: drawer }),
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
    setAiAssistantOpen: (isOpen) =>
      setState((prev) => ({ ...prev, isAiAssistantOpen: isOpen })),
    toggleAiAssistant: () =>
      setState((prev) => ({
        ...prev,
        isAiAssistantOpen: !prev.isAiAssistantOpen,
      })),
    triggerPanelAnimation: () => {
      scheduleAnimationEnd();
      setState((prev) => ({ ...prev, ...animationPatch() }));
    },
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

  const selection = selectionFromNavigation(navigation.state.selection);
  const effectiveState: EditorState = {
    ...state,
    globalMode: navigation.state.mode,
    simulateViewMode: navigation.state.simulateView,
    simulateDrawer: navigationResourceToSimulateDrawer(
      navigation.state.simulateResource,
      navigation.state.overlay,
    ),
    selection,
    hasSelection: selection.size > 0,
    hasCanvasSelection: canvasSelections(selection).length > 0,
  };
  const { hoveredItem } = effectiveState;
  const isSelected = (id: string) => selection.has(id);

  const selectedConnections = getNodeConnections(
    activeNet.transitions,
    new Set(selection.keys()),
  );

  const isSelectedConnection = (id: string) => selectedConnections.has(id);
  const isNotSelectedConnection = (id: string) =>
    canvasSelections(selection).length > 0 &&
    !isSelected(id) &&
    !selectedConnections.has(id);

  const isHovered = (id: string) => hoveredItem?.id === id;

  const hoveredConnections = getNodeConnections(
    activeNet.transitions,
    new Set(hoveredItem ? [hoveredItem.id] : []),
  );

  const isHoveredConnection = (id: string) => hoveredConnections.has(id);
  const isNotHoveredConnection = (id: string) =>
    !!hoveredItem && !isHovered(id) && !hoveredConnections.has(id);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const contextValue: EditorContextValue = {
    ...effectiveState,
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
