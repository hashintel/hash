import { use, useEffect, useRef, useState } from "react";

import { ActualModeContext } from "../actual-mode-context";
import {
  navigationResourceToSimulateDrawer,
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
  usePetrinautNavigation,
} from "../navigation";
import { resolveNavigatedItems } from "../navigation/resolve-navigated-ids";
import { usePublished } from "../select-from-context";
import {
  type AssistantPlacement,
  AssistantPlacementContext,
} from "./assistant-placement-context";
import {
  type DraggingStateByNodeId,
  type EditorActions,
  EditorActionsContext,
  EditorContext,
  type EditorContextValue,
  EditorPublishedContext,
  type EditorState,
  initialEditorState,
} from "./editor-context";
import { PanelPresenceProvider } from "./panel-presence-provider";
import { ReadOnlyReasonProvider } from "./read-only-reason-provider";
import { SDCPNContext } from "./sdcpn-context";
import { useComposesOnly } from "./use-composes-only";
import { useSyncEditorToSettings } from "./use-sync-editor-to-settings";
import { UserSettingsContext } from "./user-settings-context";

import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

export type EditorProviderProps = React.PropsWithChildren;

const selectionFromNavigation = (
  items: readonly SelectionItem[],
): SelectionMap => new Map(items.map((item) => [item.id, item]));

const selectionToNavigation = (selection: SelectionMap) =>
  Array.from(selection.values());

const raiseVisualizer = (state: EditorState, placeId: string): EditorState =>
  state.visualizerStack.at(-1) === placeId
    ? state
    : {
        ...state,
        visualizerStack: [
          ...state.visualizerStack.filter(
            (visualizerPlaceId) => visualizerPlaceId !== placeId,
          ),
          placeId,
        ],
      };

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const userSettings = use(UserSettingsContext);
  const composesOnly = useComposesOnly();
  const actualMode = use(ActualModeContext);
  const navigation = usePetrinautNavigation();
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
    isBottomPanelOpen: startsWithActualTimeline
      ? true
      : userSettings.isBottomPanelOpen,
    activeBottomPanelTab: startsWithActualTimeline
      ? "actual-timeline"
      : userSettings.activeBottomPanelTab,
    timelineChartType: userSettings.timelineChartType,
  }));

  const navigatedResource = navigation.state.simulateResource;
  const navigatedSelection = navigation.state.selection;
  const { scenarios, metrics } = petriNetDefinition;
  // Resolved during render, so children never see an older link's ids.
  const resolved = resolveNavigatedItems(
    { simulateResource: navigatedResource, selection: navigatedSelection },
    { scenarios, metrics },
    getItemType,
  );
  useEffect(() => {
    const resourceChanged = resolved.simulateResource !== navigatedResource;
    const selectionChanged =
      resolved.selection.length !== navigatedSelection.length ||
      resolved.selection.some(
        (item, index) => item !== navigatedSelection[index],
      );

    if (resourceChanged || selectionChanged) {
      // The checks above read the committed state, but the update is applied
      // to the host's freshest state, which an asynchronous host may already
      // have moved on from. Resolve again inside the updater so normalization
      // never writes back a selection the user has since replaced.
      navigation.navigate(
        (current) => ({
          ...current,
          ...resolveNavigatedItems(
            current,
            { scenarios, metrics },
            getItemType,
          ),
        }),
        {
          cause: "normalization",
          action: resourceChanged ? "simulation-resource" : "selection",
        },
      );
    }
  }, [
    getItemType,
    metrics,
    navigatedResource,
    navigatedSelection,
    navigation,
    resolved,
    scenarios,
  ]);

  const selectionGestureRef = useRef({ active: false, hasNavigated: false });
  const selectionNavigationMountedRef = useRef(true);
  const pendingSelectionNavigationRef = useRef<{
    updates: Array<(selection: SelectionMap) => SelectionMap>;
  } | null>(null);
  const selectionNavigationScheduledRef = useRef(false);
  const flushPendingSelectionNavigationRef = useRef<(() => void) | null>(null);

  // Not part of `state`: a change to `state` renders every reader of the
  // editor context, and the placement concerns the assistant panel alone.
  const [assistantPlacement, setAssistantPlacement] =
    useState<AssistantPlacement>("docked");

  const setSelection = (
    selectionOrUpdater: SelectionMap | ((prev: SelectionMap) => SelectionMap),
    options?: { cause: "normalization" } | { batch: "react-flow" },
  ) => {
    const selectionUpdate =
      typeof selectionOrUpdater === "function"
        ? selectionOrUpdater
        : () => selectionOrUpdater;
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
    const drawerChangesOverlay =
      target.simulateDrawer !== undefined &&
      simulateDrawerToNavigationOverlay(
        target.simulateDrawer,
        navigation.state.overlay,
      )?.type !== navigation.state.overlay?.type;
    navigation.navigate(
      (current) => ({
        ...current,
        ...(target.globalMode !== undefined ? { mode: target.globalMode } : {}),
        ...(target.editViewMode !== undefined
          ? { editView: target.editViewMode }
          : {}),
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
                : target.editViewMode !== undefined
                  ? "edit-view"
                  : "mode",
      },
    );

    // Mode, view, drawer and selection flow back in through `effectiveState`,
    // which derives them from navigation state on every render.
  };

  const actions: Omit<EditorActions, "isSelected"> = {
    navigateTo,
    setGlobalMode: (mode) => navigateTo({ globalMode: mode }),
    setEditViewMode: (view) => navigateTo({ editViewMode: view }),
    setEditionMode: (mode) =>
      setState((prev) => ({
        ...prev,
        editionMode: mode,
        componentToAdd: mode === "add-component" ? prev.componentToAdd : null,
      })),
    setAddComponentMode: (component) =>
      setState((prev) => ({
        ...prev,
        editionMode: "add-component",
        componentToAdd: component,
      })),
    setCursorMode: (mode) =>
      setState((prev) => ({ ...prev, cursorMode: mode })),
    setLeftSidebarOpen: (isOpen) => {
      setState((prev) => ({
        ...prev,
        isLeftSidebarOpen: isOpen,
      }));
    },
    setAiAssistantDockHeight: (height) =>
      setState((prev) =>
        prev.aiAssistantDockHeight === height
          ? prev
          : { ...prev, aiAssistantDockHeight: height },
      ),
    setAiAssistantCollapsed: (collapsed) => {
      setState((prev) => ({
        ...prev,
        isAiAssistantCollapsed: collapsed,
      }));
    },
    setBottomPanelOpen: (isOpen) => {
      setState((prev) => ({
        ...prev,
        isBottomPanelOpen: isOpen,
      }));
    },
    toggleBottomPanel: () => {
      setState((prev) => ({
        ...prev,
        isBottomPanelOpen: !prev.isBottomPanelOpen,
      }));
    },
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
      setState((prev) => ({
        ...prev,
        hoveredItem: item,
      })),
    clearHoveredItem: () =>
      setState((prev) => ({
        ...prev,
        hoveredItem: null,
      })),
    openPlaceVisualizer: (placeId: string | null) =>
      setState((prev) => ({ ...prev, openVisualizerPlaceId: placeId })),
    setVisualizerEditorFocus: (placeId: string, focused: boolean) =>
      setState((previous) => ({
        ...(focused ? raiseVisualizer(previous, placeId) : previous),
        focusedVisualizerPlaceId: focused
          ? placeId
          : previous.focusedVisualizerPlaceId === placeId
            ? null
            : previous.focusedVisualizerPlaceId,
      })),
    bringVisualizerToFront: (placeId) =>
      setState((previous) => raiseVisualizer(previous, placeId)),
    keepPlaceVisualizerOpen: (placeId: string) =>
      setState((previous) => {
        if (previous.keptOpenVisualizerPlaceIds.has(placeId)) return previous;
        const keptOpenVisualizerPlaceIds = new Set(
          previous.keptOpenVisualizerPlaceIds,
        );
        keptOpenVisualizerPlaceIds.add(placeId);
        return {
          ...raiseVisualizer(previous, placeId),
          keptOpenVisualizerPlaceIds,
        };
      }),
    closePlaceVisualizer: (placeId: string) =>
      setState((previous) => {
        const keptOpenVisualizerPlaceIds = new Set(
          previous.keptOpenVisualizerPlaceIds,
        );
        keptOpenVisualizerPlaceIds.delete(placeId);
        return {
          ...previous,
          keptOpenVisualizerPlaceIds,
          visualizerStack: previous.visualizerStack.filter(
            (visualizerPlaceId) => visualizerPlaceId !== placeId,
          ),
          openVisualizerPlaceId:
            previous.openVisualizerPlaceId === placeId
              ? null
              : previous.openVisualizerPlaceId,
          focusedVisualizerPlaceId:
            previous.focusedVisualizerPlaceId === placeId
              ? null
              : previous.focusedVisualizerPlaceId,
          hoveredItem:
            previous.hoveredItem?.id === placeId ? null : previous.hoveredItem,
        };
      }),
    toggleComponentInstanceFold: (instanceId: string) =>
      setState((prev) => {
        const unfoldedComponentInstanceIds = new Set(
          prev.unfoldedComponentInstanceIds,
        );
        if (!unfoldedComponentInstanceIds.delete(instanceId)) {
          unfoldedComponentInstanceIds.add(instanceId);
        }
        return { ...prev, unfoldedComponentInstanceIds };
      }),
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
      navigation.navigate(
        { selection: [] },
        { cause: "user", action: "selection" },
      );
      setState((prev) => ({
        ...prev,
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
      navigation.navigate(
        (current) =>
          current.simulateView === mode
            ? current
            : {
                ...current,
                simulateView: mode,
                simulateResource: null,
                overlay: null,
              },
        { cause: "user", action: "simulation-view" },
      ),
    setSimulateDrawer: (drawer) => navigateTo({ simulateDrawer: drawer }),
    setSearchOpen: (isOpen) =>
      setState((prev) => ({ ...prev, isSearchOpen: isOpen })),
    setAiAssistantOpen: (isOpen) => {
      setState((prev) => ({
        ...prev,
        isAiAssistantOpen: isOpen,
      }));
    },
    toggleAiAssistant: () => {
      setState((prev) => ({
        ...prev,
        isAiAssistantOpen: !prev.isAiAssistantOpen,
      }));
    },
  };

  useSyncEditorToSettings({
    cursorMode: state.cursorMode,
    isLeftSidebarOpen: state.isLeftSidebarOpen,
    isBottomPanelOpen: state.isBottomPanelOpen,
    activeBottomPanelTab: state.activeBottomPanelTab,
    timelineChartType: state.timelineChartType,
  });

  const selection = selectionFromNavigation(resolved.selection);
  const effectiveState: EditorState = {
    ...state,
    // An editor that only composes has one mode and one view of it, and no
    // tool that draws a place or a transition: one left armed reads as the
    // cursor. Placing a component is composing, so that tool stays.
    globalMode: composesOnly ? "edit" : navigation.state.mode,
    editViewMode: composesOnly ? "canvas" : navigation.state.editView,
    editionMode:
      composesOnly && state.editionMode !== "add-component"
        ? "cursor"
        : state.editionMode,
    simulateViewMode: navigation.state.simulateView,
    simulateDrawer: navigationResourceToSimulateDrawer(
      resolved.simulateResource,
      navigation.state.overlay,
    ),
    selection,
    hasSelection: selection.size > 0,
  };
  const isSelected = (id: string) => selection.has(id);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const contextValue: EditorContextValue = {
    ...effectiveState,
    ...actions,
    isSelected,
    searchInputRef,
  };
  const published = usePublished(contextValue);

  // The panels open, close, dock and float by this state. `PanelPresenceProvider`
  // reads it and has Motion animate them.
  return (
    <AssistantPlacementContext
      value={{
        placement: assistantPlacement,
        setPlacement: setAssistantPlacement,
      }}
    >
      <EditorPublishedContext value={published}>
        <EditorContext.Provider value={contextValue}>
          <EditorActionsContext value={{ ...actions, isSelected }}>
            <ReadOnlyReasonProvider>
              <PanelPresenceProvider>{children}</PanelPresenceProvider>
            </ReadOnlyReasonProvider>
          </EditorActionsContext>
        </EditorContext.Provider>
      </EditorPublishedContext>
    </AssistantPlacementContext>
  );
};
