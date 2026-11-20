import {
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
  type PetrinautNavigationState,
} from "../../navigation";
import {
  type createSelectionNavigator,
  selectionToNavigation,
  type Navigate,
} from "./selection-navigator";

import type { EditorActions, EditorState } from "../editor-context";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

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

/**
 * The editor's actions, built once for an editor. Each reads what it needs
 * when it is called: the editor's own state through `setState`'s updater,
 * the location through `navigate`'s, and the rest through `read`.
 */
export const createEditorActions = ({
  navigate,
  setState,
  selectionNavigator: {
    setSelection,
    beginSelectionGesture,
    endSelectionGesture,
  },
  read,
}: {
  navigate: Navigate;
  setState: (update: (state: EditorState) => EditorState) => void;
  selectionNavigator: ReturnType<typeof createSelectionNavigator>;
  /** What the last commit showed. */
  read: () => {
    overlay: PetrinautNavigationState["overlay"];
    selection: SelectionMap;
  };
}): EditorActions => {
  const patch = (changes: Partial<EditorState>) =>
    setState((prev) => ({ ...prev, ...changes }));

  const navigateTo: EditorActions["navigateTo"] = (target) => {
    const drawerChangesOverlay =
      target.simulateDrawer !== undefined &&
      simulateDrawerToNavigationOverlay(target.simulateDrawer, read().overlay)
        ?.type !== read().overlay?.type;
    navigate(
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

  return {
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
      patch({ editionMode: "add-component", componentToAdd: component }),
    setCursorMode: (mode) => patch({ cursorMode: mode }),
    setLeftSidebarOpen: (isOpen) => patch({ isLeftSidebarOpen: isOpen }),
    setBottomPanelOpen: (isOpen) => patch({ isBottomPanelOpen: isOpen }),
    toggleBottomPanel: () => {
      setState((prev) => ({
        ...prev,
        isBottomPanelOpen: !prev.isBottomPanelOpen,
      }));
    },
    setActiveBottomPanelTab: (tab) => patch({ activeBottomPanelTab: tab }),
    isSelected: (id) => read().selection.has(id),
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
    setHoveredItem: (item: SelectionItem) => patch({ hoveredItem: item }),
    clearHoveredItem: () => patch({ hoveredItem: null }),
    openPlaceVisualizer: (placeId: string | null) =>
      patch({ openVisualizerPlaceId: placeId }),
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
    updateDraggingStateByNodeId: (updater) =>
      setState((prev) => ({
        ...prev,
        draggingStateByNodeId: updater(prev.draggingStateByNodeId),
      })),
    collapseAllPanels: () => {
      navigate({ selection: [] }, { cause: "user", action: "selection" });
      patch({
        isLeftSidebarOpen: false,
        isSearchOpen: false,
        isBottomPanelOpen: false,
      });
    },
    setTimelineChartType: (chartType) =>
      patch({ timelineChartType: chartType }),
    setTimelineView: (view) => patch({ timelineView: view }),
    setHiddenTimelineSeriesIds: (seriesIds) =>
      patch({ hiddenTimelineSeriesIds: seriesIds }),
    setSimulateViewMode: (mode) =>
      navigate(
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
    setSearchOpen: (isOpen) => patch({ isSearchOpen: isOpen }),
    setAiAssistantOpen: (isOpen) => patch({ isAiAssistantOpen: isOpen }),
    toggleAiAssistant: () => {
      setState((prev) => ({
        ...prev,
        isAiAssistantOpen: !prev.isAiAssistantOpen,
      }));
    },
  };
};
