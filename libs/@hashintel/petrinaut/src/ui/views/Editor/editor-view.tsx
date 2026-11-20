/**
 * @layerRoot ui.views.editor
 * @role Arranges the panels, toolbars and dialogs around the canvas
 */

import { Activity, use, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  useEditorActions,
  useEditorFields,
} from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useComposesOnly } from "../../../react/state/use-composes-only";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { useUserSettingsFields } from "../../../react/state/user-settings-context";
import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { ExperimentalIconProvider } from "../../experimental-icons";
import { CodeNavigationProvider } from "../../monaco/code-navigation";
import { useCanvasRegistration } from "../../plugins/plugin-editor";
import { PluginRoots } from "../../plugins/plugin-outlets";
import { usePluginOverlay } from "../../plugins/plugins-provider";
import { NotebookView } from "../Notebook/notebook-view";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { AiCtaModal } from "./components/ai-cta-modal";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { TopBar } from "./components/TopBar/top-bar";
import { EditViewSelector } from "./editor-view/edit-view-selector";
import {
  AssistantCommands,
  EditorAssistantPanel,
  useEditorAssistant,
} from "./editor-view/editor-assistant";
import { UserSettings } from "./editor-view/user-settings";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import {
  SimulateView,
  SimulateViewTabs,
} from "./panels/SimulateView/simulate-view";
import { SimulationWorkspace } from "./shared/simulation-workspace";
import { useAutoLayoutAndFrame } from "./shared/use-auto-layout-and-frame";
import { useCreateEmptyNet } from "./shared/use-create-empty-net";
import { SimulationCreationDrawer } from "./simulation-creation-drawer";
import { EditorCommands } from "./use-editor-commands";

import type { SDCPN } from "@hashintel/petrinaut-core";

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

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0;

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
const EditorViewContent = ({
  hideNetManagementControls,
}: {
  hideNetManagementControls?: "all" | "except-title";
}) => {
  const { petriNetDefinition, petriNetId } = use(SDCPNContext);
  const { registerController } = useCanvasRegistration();
  const createEmptyNet = useCreateEmptyNet();
  const autoLayoutAndFrame = useAutoLayoutAndFrame();

  const { globalMode, editViewMode, isAiAssistantOpen } = useEditorFields(
    "globalMode",
    "editViewMode",
    "isAiAssistantOpen",
  );
  const { navigateTo, setAiAssistantOpen, toggleAiAssistant } =
    useEditorActions();
  const composesOnly = useComposesOnly();
  const assistant = useEditorAssistant();

  const [isAiCtaDismissed, setIsAiCtaDismissed] = useState(false);

  // A plugin covering the canvas, such as a tour, holds back the prompt.
  const pluginOverlay = usePluginOverlay();

  // Clean up stale selections when items are deleted
  useSelectionCleanup();

  function handleRunningExperimentClick(experimentId: string) {
    navigateTo({
      globalMode: "simulate",
      simulateViewMode: "experiments",
      simulateDrawer: { type: "view-experiment", experimentId },
    });
  }

  // The empty-net prompt hands its message to the plugin assistant's
  // `onPrompt`.
  const showEmptyAiHero =
    assistant.onPrompt !== undefined &&
    !isAiAssistantOpen &&
    !isAiCtaDismissed &&
    !pluginOverlay &&
    isEmptySDCPN(petriNetDefinition);

  return (
    <>
      <EditorCommands
        applyAutoLayoutAndFrame={autoLayoutAndFrame}
        onNewNet={
          hideNetManagementControls === undefined ? createEmptyNet : undefined
        }
        onToggleAiAssistant={
          assistant.hasAssistant ? toggleAiAssistant : undefined
        }
      />
      <AssistantCommands />
      <PluginRoots />
      <UserSettings />

      <TopBar
        hideNetManagementControls={hideNetManagementControls}
        onRunningExperimentClick={(experiment) =>
          handleRunningExperimentClick(experiment.id)
        }
      />

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
                  {/* Left Sidebar - Tools and content panels */}
                  <LeftSideBar />

                  {/* Properties Panel - Right Side */}
                  <PropertiesPanel />

                  {/* SDCPN Visualization */}
                  <SDCPNView onControllerChange={registerController} />

                  {showEmptyAiHero && (
                    <AiCtaModal
                      onDismiss={() => setIsAiCtaDismissed(true)}
                      onSubmit={(message) => {
                        setAiAssistantOpen(true);
                        assistant.onPrompt?.(message);
                      }}
                    />
                  )}

                  {/* Bottom Panel */}
                  <BottomPanel />
                </Box>
              </Activity>
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
            <BottomBar hasAiAssistant={assistant.hasAssistant} />
          </Activity>
          <SimulationCreationDrawer />
        </SimulationWorkspace>
        {assistant.plugin && (
          <EditorAssistantPanel
            plugin={assistant.plugin}
            petriNetId={petriNetId}
          />
        )}
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
