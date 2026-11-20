import { use, useEffect, useRef, useState } from "react";

import { ActualModeContext } from "../actual-mode-context";
import { useLatest } from "../hooks/use-latest";
import {
  navigationResourceToSimulateDrawer,
  usePetrinautNavigation,
} from "../navigation";
import { usePublished } from "../select-from-context";
import {
  type AssistantPlacement,
  AssistantPlacementContext,
} from "./assistant-placement-context";
import {
  EditorActionsContext,
  EditorContext,
  type EditorContextValue,
  EditorPublishedContext,
  type EditorState,
  initialEditorState,
} from "./editor-context";
import { createEditorActions } from "./editor-provider/editor-actions";
import {
  createSelectionNavigator,
  selectionFromNavigation,
} from "./editor-provider/selection-navigator";
import { useResolvedLocation } from "./editor-provider/use-resolved-location";
import { PanelPresenceProvider } from "./panel-presence-provider";
import { ReadOnlyReasonProvider } from "./read-only-reason-provider";
import { useComposesOnly } from "./use-composes-only";
import { useSyncEditorToSettings } from "./use-sync-editor-to-settings";
import { useUserSettingsFields } from "./user-settings-context";

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const userSettings = useUserSettingsFields(
    "cursorMode",
    "isLeftSidebarOpen",
    "isBottomPanelOpen",
    "activeBottomPanelTab",
    "timelineChartType",
  );
  const composesOnly = useComposesOnly();
  const actualMode = use(ActualModeContext);
  const { navigate, state: location } = usePetrinautNavigation();
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

  const resolved = useResolvedLocation();

  // Not part of `state`: a change to `state` renders every reader of the
  // editor context, and the placement concerns the assistant panel alone.
  const [assistantPlacement, setAssistantPlacement] =
    useState<AssistantPlacement>("docked");

  const [selectionNavigator] = useState(() =>
    createSelectionNavigator(navigate),
  );
  useEffect(() => selectionNavigator.listen(), [selectionNavigator]);

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
    globalMode: composesOnly ? "edit" : location.mode,
    editViewMode: composesOnly ? "canvas" : location.editView,
    editionMode:
      composesOnly && state.editionMode !== "add-component"
        ? "cursor"
        : state.editionMode,
    simulateViewMode: location.simulateView,
    simulateDrawer: navigationResourceToSimulateDrawer(
      resolved.simulateResource,
      location.overlay,
    ),
    selection,
    hasSelection: selection.size > 0,
  };

  // One object for the editor's life: `navigate` and `setState` never change,
  // and an action reads the rest when it is called.
  const latest = useLatest({ overlay: location.overlay, selection });
  const [actions] = useState(() =>
    createEditorActions({
      navigate,
      setState,
      selectionNavigator,
      read: () => latest.current,
    }),
  );
  // New with each selection, so a reader of the published `isSelected`
  // renders when the selection changes. The action of the same name does not.
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
        <EditorContext value={contextValue}>
          <EditorActionsContext value={actions}>
            <ReadOnlyReasonProvider globalMode={effectiveState.globalMode}>
              <PanelPresenceProvider>{children}</PanelPresenceProvider>
            </ReadOnlyReasonProvider>
          </EditorActionsContext>
        </EditorContext>
      </EditorPublishedContext>
    </AssistantPlacementContext>
  );
};
