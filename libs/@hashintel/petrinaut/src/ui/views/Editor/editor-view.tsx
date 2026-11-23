/**
 * @layerRoot ui.views.editor
 * @role Arranges the panels, toolbars and dialogs around the canvas
 */

import { Activity, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useComposesOnly } from "../../../react/document/use-composes-only";
import { useDocumentId } from "../../../react/document/use-document";
import {
  useEditorActions,
  useEditorMode,
} from "../../../react/state/editor-context";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { CodeNavigationProvider } from "../../monaco/code-navigation";
import { useAssistantChoice } from "../../plugins/plugin-assistant";
import { useCanvasRegistration } from "../../plugins/plugin-editor";
import { PluginRoots } from "../../plugins/plugin-outlets";
import { Stack } from "../../shared/stack";
import { NotebookView } from "../Notebook/notebook-view";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { PetrinautIconProvider } from "../shared/icon-provider";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { TopBar } from "./components/TopBar/top-bar";
import { EditViewSelector } from "./editor-view/edit-view-selector";
import {
  AssistantCommands,
  EditorAssistantPanel,
} from "./editor-view/editor-assistant";
import { EditorResizers } from "./editor-view/editor-resizers";
import { EmptyNetPrompt } from "./editor-view/empty-net-prompt";
import { UserSettings } from "./editor-view/user-settings";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import {
  SimulateView,
  SimulateViewTabs,
} from "./panels/SimulateView/simulate-view";
import { SimulationWorkspace } from "./shared/simulation-workspace";
import { SimulationCreationDrawer } from "./simulation-creation-drawer";
import { EditorCommands } from "./use-editor-commands";

// The remaining space under the TopBar, never 100% of the root: a full-height
// row overflows the root by the TopBar's height, and although the root hides
// overflow, scrollIntoView can still scroll it programmatically — pushing the
// TopBar out of view.
const rowContainerStyle = css({
  position: "relative",
  containerType: "inline-size",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  userSelect: "none",
});

const canvasContainerStyle = css({
  minWidth: "[0]",
  minHeight: "[0]",
  position: "relative",
  flex: "[1]",
});

const workspaceStyle = css({
  position: "relative",
  "--edit-view-selector-width": "[160px]",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
});

const editViewSelectorSpaceStyle = css({
  width: "[var(--edit-view-selector-width)]",
  flexShrink: "0",
});

/**
 * Drops what was deleted from the selection. A leaf, because it reads the
 * selection and the hover, which the view does not.
 */
const SelectionCleanup = () => {
  useSelectionCleanup();
  return null;
};

/** The layout of the editor: the bars, the workspace of the mode, and the assistant. */
const EditorViewContent = ({
  hideNetManagementControls,
}: {
  hideNetManagementControls?: "all" | "except-title";
}) => {
  const petriNetId = useDocumentId();
  const { registerController } = useCanvasRegistration();

  // Not by part: the mode shows and hides each `Activity`, and that has to
  // happen in the commit that changes the contexts their parts read.
  const { globalMode, editViewMode } = useEditorMode();
  const { toggleAiAssistant } = useEditorActions();
  const composesOnly = useComposesOnly();
  // Not the running plugin itself, which a streaming chat republishes for
  // every token.
  const hasAssistant = useAssistantChoice().shownId !== undefined;

  const [isEmptyNetPromptDismissed, setEmptyNetPromptDismissed] =
    useState(false);

  // The Definitions view of a net mounts when it first shows, and stays in a
  // hidden `Activity` from then on. A session that never opens it does not
  // pay for a cell per entity at load.
  const netKey = petriNetId ?? "no-net";
  const showsDefinitions =
    globalMode === "edit" && editViewMode === "definitions";
  const canvasShows =
    globalMode === "actual" ||
    (globalMode === "edit" && editViewMode === "canvas");
  const [netWithDefinitions, setNetWithDefinitions] = useState<string | null>(
    null,
  );
  if (showsDefinitions && netWithDefinitions !== netKey) {
    setNetWithDefinitions(netKey);
  }

  return (
    <>
      <EditorCommands
        canStartNet={hideNetManagementControls === undefined}
        onToggleAiAssistant={hasAssistant ? toggleAiAssistant : undefined}
      />
      <AssistantCommands />
      <PluginRoots />
      <UserSettings />
      <SelectionCleanup />

      <TopBar hideNetManagementControls={hideNetManagementControls} />

      <Stack direction="row" className={rowContainerStyle}>
        {globalMode === "simulate" && <SimulateViewTabs />}
        <SimulationWorkspace>
          {globalMode === "simulate" ? (
            <SimulateView />
          ) : (
            <div className={workspaceStyle}>
              {globalMode === "edit" && !composesOnly && <EditViewSelector />}
              <Activity mode={canvasShows ? "visible" : "hidden"}>
                <div className={canvasContainerStyle}>
                  <LeftSideBar />
                  <PropertiesPanel />
                  <SDCPNView onControllerChange={registerController} />
                  {!isEmptyNetPromptDismissed && (
                    <EmptyNetPrompt
                      onDismiss={() => setEmptyNetPromptDismissed(true)}
                    />
                  )}
                  <BottomPanel />
                </div>
              </Activity>
              {/* An editor that only composes has no Definitions view. */}
              {!composesOnly && netWithDefinitions === netKey && (
                <Activity mode={showsDefinitions ? "visible" : "hidden"}>
                  <NotebookView
                    key={netKey}
                    toolbarStart={
                      <div aria-hidden className={editViewSelectorSpaceStyle} />
                    }
                  />
                </Activity>
              )}
            </div>
          )}
          <Activity mode={canvasShows ? "visible" : "hidden"}>
            <BottomBar hasAiAssistant={hasAssistant} />
          </Activity>
          <SimulationCreationDrawer />
        </SimulationWorkspace>
        <EditorAssistantPanel />
        <EditorResizers canvasShows={canvasShows} />
      </Stack>
    </>
  );
};

export const EditorView = ({
  hideNetManagementControls,
}: React.ComponentProps<typeof EditorViewContent>) => (
  <CodeNavigationProvider>
    <PetrinautIconProvider>
      <EditorViewContent
        hideNetManagementControls={hideNetManagementControls}
      />
    </PetrinautIconProvider>
  </CodeNavigationProvider>
);
