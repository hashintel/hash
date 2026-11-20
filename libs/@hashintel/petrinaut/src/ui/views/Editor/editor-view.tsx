/**
 * @layerRoot ui.views.editor
 * @role Arranges the panels, toolbars and dialogs around the canvas
 */

import { Activity, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useDocumentId } from "../../../react/hooks/use-document";
import {
  useEditorActions,
  useEditorFields,
} from "../../../react/state/editor-context";
import { useComposesOnly } from "../../../react/state/use-composes-only";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { useUserSettingsFields } from "../../../react/state/user-settings-context";
import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { ExperimentalIconProvider } from "../../experimental-icons";
import { CodeNavigationProvider } from "../../monaco/code-navigation";
import { useAssistantChoice } from "../../plugins/plugin-assistant";
import { useCanvasRegistration } from "../../plugins/plugin-editor";
import { PluginRoots } from "../../plugins/plugin-outlets";
import { NotebookView } from "../Notebook/notebook-view";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { TopBar } from "./components/TopBar/top-bar";
import { EditViewSelector } from "./editor-view/edit-view-selector";
import {
  AssistantCommands,
  EditorAssistantPanel,
} from "./editor-view/editor-assistant";
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

  const { globalMode, editViewMode } = useEditorFields(
    "globalMode",
    "editViewMode",
  );
  const { toggleAiAssistant } = useEditorActions();
  const composesOnly = useComposesOnly();
  // Not the running plugin itself, which a streaming chat republishes for
  // every token.
  const hasAssistant = useAssistantChoice().shownId !== undefined;

  const [isEmptyNetPromptDismissed, setEmptyNetPromptDismissed] =
    useState(false);

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
              <Activity
                mode={
                  globalMode === "actual" || editViewMode === "canvas"
                    ? "visible"
                    : "hidden"
                }
              >
                <Box className={canvasContainerStyle}>
                  <LeftSideBar />
                  <PropertiesPanel />
                  <SDCPNView onControllerChange={registerController} />
                  {!isEmptyNetPromptDismissed && (
                    <EmptyNetPrompt
                      onDismiss={() => setEmptyNetPromptDismissed(true)}
                    />
                  )}
                  <BottomPanel />
                </Box>
              </Activity>
              {/* An editor that only composes has no Definitions view to keep warm. */}
              {!composesOnly && (
                <Activity
                  mode={
                    globalMode === "edit" && editViewMode === "definitions"
                      ? "visible"
                      : "hidden"
                  }
                >
                  <NotebookView
                    key={petriNetId ?? "no-net"}
                    toolbarStart={
                      <div aria-hidden className={editViewSelectorSpaceStyle} />
                    }
                  />
                </Activity>
              )}
            </div>
          )}
          <Activity
            mode={
              globalMode === "actual" ||
              (globalMode === "edit" && editViewMode === "canvas")
                ? "visible"
                : "hidden"
            }
          >
            <BottomBar hasAiAssistant={hasAssistant} />
          </Activity>
          <SimulationCreationDrawer />
        </SimulationWorkspace>
        <EditorAssistantPanel />
      </Stack>
    </>
  );
};

/**
 * The editor's icons, provided from above the view and not by it. The
 * provider hands every icon a new context value each time it renders, and the
 * view renders on every change to the document.
 */
const EditorIcons = ({ children }: { children: ReactNode }) => {
  const { enableExperimentalIconPack, showAnimations } = useUserSettingsFields(
    "enableExperimentalIconPack",
    "showAnimations",
  );

  return (
    <ExperimentalIconProvider
      enabled={enableExperimentalIconPack}
      motion={showAnimations ? "auto" : "none"}
    >
      {children}
    </ExperimentalIconProvider>
  );
};

export const EditorView = ({
  hideNetManagementControls,
}: React.ComponentProps<typeof EditorViewContent>) => (
  <CodeNavigationProvider>
    <EditorIcons>
      <EditorViewContent
        hideNetManagementControls={hideNetManagementControls}
      />
    </EditorIcons>
  </CodeNavigationProvider>
);
