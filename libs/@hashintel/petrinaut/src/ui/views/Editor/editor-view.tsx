/**
 * @layerRoot ui.views.editor
 * @role Arranges the panels, toolbars and dialogs around the canvas
 */

import { Activity, use, useState } from "react";

import { type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  calculateGraphLayout,
  layoutNodeDimensions,
  type DocumentFormat,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainWithDisruption,
  supplyChainProfit,
  vaccinationCampaign,
} from "@hashintel/petrinaut-core/examples";

import { usePetrinautCommands } from "../../../react";
import { ActualModeContext } from "../../../react/actual-mode-context";
import { usePetrinautNavigation } from "../../../react/navigation";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { VoiceSessionProvider } from "../../../react/voice-session/provider";
import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import {
  WalkthroughContext,
  willShowWalkthroughDialog,
} from "../../components/walkthrough/walkthrough-context";
import { WalkthroughDialog } from "../../components/walkthrough/walkthrough-dialog";
import { ExperimentalIconProvider } from "../../experimental-icons";
import { exportSDCPN } from "../../file-io/export-sdcpn";
import { exportTikZ } from "../../file-io/export-tikz";
import { importSDCPN } from "../../file-io/import-sdcpn";
import { KeyboardShortcut } from "../../keyboard-shortcut";
import { CodeNavigationProvider } from "../../monaco/code-navigation";
import { NotebookView } from "../Notebook/notebook-view";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { AiCtaModal } from "./components/ai-cta-modal";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { ImportErrorDialog } from "./components/import-error-dialog";
import { TopBar } from "./components/TopBar/top-bar";
import { applyAutoLayoutAndFrame } from "./editor-view/apply-auto-layout-and-frame";
import { CreateNewNetCommands } from "./editor-view/create-new-net-commands";
import {
  createNewNetMenuItem,
  shouldShowBrunchCreateNew,
} from "./editor-view/create-new-net-menu";
import { EditViewSelector } from "./editor-view/edit-view-selector";
import { emptyPetriNetDefinition } from "./editor-view/empty-petri-net-definition";
import { useCanvasControllerRegistration } from "./editor-view/use-canvas-controller-registration";
import { UserSettings } from "./editor-view/user-settings";
import { AiAssistantPanel } from "./panels/ai-assistant-panel";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import {
  SimulateView,
  SimulateViewTabs,
} from "./panels/SimulateView/simulate-view";
import { SimulationWorkspace } from "./shared/simulation-workspace";
import { SimulationCreationDrawer } from "./simulation-creation-drawer";
import { autoLayoutShortcut, EditorCommands } from "./use-editor-commands";

import type { PetrinautAiAssistant } from "../../petrinaut";
import type { PetrinautAiInputMode } from "../../types/ai-assistant-composer-control";
import type { PetrinautSlots } from "../../types/petrinaut-slots";
import type { ViewportAction } from "../../types/viewport-action";

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const formatRelativeTime = (isoTimestamp: string): string => {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffSecs = Math.round(diffMs / 1_000);
  const diffMins = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffSecs < 60) {
    return relativeTimeFormat.format(-diffSecs, "second");
  } else if (diffMins < 60) {
    return relativeTimeFormat.format(-diffMins, "minute");
  } else if (diffHours < 24) {
    return relativeTimeFormat.format(-diffHours, "hour");
  } else if (diffDays < 30) {
    return relativeTimeFormat.format(-diffDays, "day");
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(isoTimestamp));
};

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

// `white-space` inherits down to the item text, whose `overflow: hidden;
// text-overflow: ellipsis` only elides on a non-wrapping line. `&&` outranks
// the menu's own max-height class, which ties on specificity.
const openSubmenuStyle = css({
  whiteSpace: "nowrap",
  "&&": {
    maxWidth: "[min(600px, 70vw)]",
    maxHeight: "[min(800px, 80vh, var(--available-height, 100vh))]",
  },
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
  aiAssistant,
  hideNetManagementControls,
  slots,
  titleEditable,
  viewportActions,
}: {
  aiAssistant?: PetrinautAiAssistant;
  /**
   * See {@link TopBar} for the full semantics.
   */
  hideNetManagementControls?: "all" | "except-title";
  slots?: PetrinautSlots;
  titleEditable: boolean;
  viewportActions?: ViewportAction[];
}) => {
  const showNetManagementMenuItems = hideNetManagementControls === undefined;
  const navigation = usePetrinautNavigation();
  // Auto-layout moves nodes, which a read-only net rejects, so the menu would
  // otherwise offer an item that silently does nothing.
  const isReadOnly = useIsReadOnly();
  // Get data from sdcpn-store
  const {
    createNewNet,
    existingNets,
    loadPetriNet,
    petriNetDefinition,
    petriNetId,
    title,
    setTitle,
  } = use(SDCPNContext);
  const { applyAutoLayout } = usePetrinautCommands();
  const {
    frameSceneAfterRender,
    registerController,
    requestFrameOnNextRegistration,
  } = useCanvasControllerRegistration();
  const runAutoLayoutAndFrame = () =>
    applyAutoLayoutAndFrame({ applyAutoLayout, frameSceneAfterRender });

  // Get editor context
  const {
    globalMode,
    editViewMode,
    isAiAssistantOpen,
    navigateTo,
    setGlobalMode,
    editionMode,
    setEditionMode,
    cursorMode,
    setCursorMode,
    clearSelection,
    setAiAssistantOpen,
    setAiAssistantCollapsed,
    isBottomPanelOpen,
    bottomPanelHeight,
  } = use(EditorContext);
  const actualMode = use(ActualModeContext);

  const [pendingAiAssistantMessage, setPendingAiAssistantMessage] = useState<
    string | null
  >(null);
  const [pendingAiInteractionMode, setPendingAiInteractionMode] =
    useState<PetrinautAiInputMode | null>(null);
  const [isAiCtaDismissed, setIsAiCtaDismissed] = useState(false);
  const [offerStartPosture, setOfferStartPosture] = useState(false);
  const [aiAssistantFocusRequest, setAiAssistantFocusRequest] = useState(0);

  const {
    brunchDemoMode,
    enableExperimentalIconPack,
    showAnimations,
    showWalkthroughOnInit,
    setShowWalkthroughOnInit,
  } = use(UserSettingsContext);
  const showBrunchCreateNew = shouldShowBrunchCreateNew({
    brunchDemoMode,
    hasAiAssistant: aiAssistant !== undefined,
  });
  const walkthrough = use(WalkthroughContext);

  const toggleAiAssistant = () => {
    if (isAiAssistantOpen) {
      setAiAssistantOpen(false);
      return;
    }
    setAiAssistantCollapsed(false);
    setAiAssistantOpen(true);
    setAiAssistantFocusRequest((request) => request + 1);
  };

  // Live open state for the walkthrough. Seeded once from the persisted
  // "show on init" preference, so toggling that preference only takes effect
  // on the next init rather than reopening the walkthrough mid-session.
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(
    showWalkthroughOnInit,
  );

  // Dismissing the walkthrough closes it for this session and clears the
  // "show on init" preference, so it doesn't reappear next init unless the
  // user re-enables it from the settings dialog.
  const closeWalkthrough = () => {
    setIsWalkthroughOpen(false);
    setShowWalkthroughOnInit(false);
  };

  const [importError, setImportError] = useState<string | null>(null);

  // Clean up stale selections when items are deleted
  useSelectionCleanup();

  function handleCreateEmpty() {
    createNewNet({
      title: "Untitled",
      petriNetDefinition: emptyPetriNetDefinition,
    });
    clearSelection();
  }

  function handleStartBlank() {
    setOfferStartPosture(false);
    setIsAiCtaDismissed(true);
    handleCreateEmpty();
    if (aiAssistant !== undefined) {
      setAiAssistantOpen(false);
    }
  }

  function handleBuildWithBrunch() {
    setIsAiCtaDismissed(true);
    setOfferStartPosture(true);
    handleCreateEmpty();
    setAiAssistantOpen(true);
  }

  function handleExport(format: DocumentFormat) {
    exportSDCPN({ petriNetDefinition, title, format });
  }

  function handleExportWithoutVisualInfo(format: DocumentFormat) {
    exportSDCPN({ petriNetDefinition, title, removeVisualInfo: true, format });
  }

  function handleExportTikZ() {
    exportTikZ({ petriNetDefinition, title });
  }

  function handleRunningExperimentClick(experimentId: string) {
    navigateTo({
      globalMode: "simulate",
      simulateViewMode: "experiments",
      simulateDrawer: { type: "view-experiment", experimentId },
    });
  }

  async function handleImport() {
    const result = await importSDCPN();
    if (!result) {
      return; // User cancelled file picker
    }

    if (!result.ok) {
      setImportError(result.error);
      return;
    }

    const { sdcpn: loadedSDCPN, hadMissingPositions } = result;
    let sdcpnToLoad = loadedSDCPN;

    // If any nodes were missing positions, run ELK layout BEFORE creating the net.
    // We must do this before createNewNet because after createNewNet triggers a
    // re-render, the mutatePetriNetDefinition closure would be stale.
    if (hadMissingPositions) {
      const positions = await calculateGraphLayout(
        sdcpnToLoad,
        layoutNodeDimensions,
      );

      if (Object.keys(positions).length > 0) {
        sdcpnToLoad = {
          ...sdcpnToLoad,
          places: sdcpnToLoad.places.map((place) => {
            const position = positions[place.id];
            return position
              ? { ...place, x: position.x, y: position.y }
              : place;
          }),
          transitions: sdcpnToLoad.transitions.map((transition) => {
            const position = positions[transition.id];
            return position
              ? { ...transition, x: position.x, y: position.y }
              : transition;
          }),
        };
      }
    }

    if (hadMissingPositions) {
      requestFrameOnNextRegistration();
    }
    createNewNet({
      title: loadedSDCPN.title,
      petriNetDefinition: sdcpnToLoad,
    });
    clearSelection();
  }

  const menuItems: MenuItem[] = [
    ...(showNetManagementMenuItems
      ? [
          createNewNetMenuItem({
            showBrunchOptions: showBrunchCreateNew,
            onBuildWithBrunch: handleBuildWithBrunch,
            onStartBlank: handleStartBlank,
          }),
        ]
      : []),
    ...(showNetManagementMenuItems && existingNets.length > 0
      ? [
          {
            id: "open",
            text: "Open",
            menuClassName: openSubmenuStyle,
            subItems: existingNets.map((net) => ({
              id: `open-${net.netId}`,
              text: net.title,
              suffix: formatRelativeTime(net.lastUpdated),
              onClick: () => {
                loadPetriNet(net.netId);
                clearSelection();
              },
            })),
          },
        ]
      : []),
    {
      id: "export",
      text: "Export",
      subItems: [
        {
          id: "export-yaml",
          text: "YAML",
          onClick: () => handleExport("yaml"),
        },
        {
          id: "export-yaml-without-visuals",
          text: "YAML without visual info",
          onClick: () => handleExportWithoutVisualInfo("yaml"),
        },
        {
          id: "export-json",
          text: "JSON",
          onClick: () => handleExport("json"),
        },
        {
          id: "export-json-without-visuals",
          text: "JSON without visual info",
          onClick: () => handleExportWithoutVisualInfo("json"),
        },
        {
          id: "export-tikz",
          text: "TikZ",
          onClick: handleExportTikZ,
        },
      ],
    },
    ...(showNetManagementMenuItems
      ? [
          {
            id: "import",
            text: "Import",
            onClick: handleImport,
          },
        ]
      : []),
    ...(isReadOnly
      ? []
      : [
          {
            id: "layout",
            text: "Layout",
            suffix: <KeyboardShortcut shortcut={autoLayoutShortcut} inMenu />,
            onClick: () => {
              void runAutoLayoutAndFrame();
            },
          },
        ]),
    ...(showNetManagementMenuItems
      ? [
          {
            id: "load-example",
            text: "Load example",
            subItems: [
              {
                id: "load-example-sir-model",
                text: "SIR Model",
                onClick: () => {
                  createNewNet(sirModel);
                  clearSelection();
                },
              },
              {
                id: "load-example-cafe-queue",
                text: "Café Queue",
                onClick: () => {
                  createNewNet(cafeQueue);
                  clearSelection();
                },
              },
              {
                id: "load-example-drone-patrol",
                text: "Drone Patrol",
                onClick: () => {
                  createNewNet(dronePatrol);
                  clearSelection();
                },
              },
              {
                id: "load-example-deployment-pipeline",
                text: "Deployment Pipeline",
                onClick: () => {
                  createNewNet(deploymentPipelineSDCPN);
                  clearSelection();
                },
              },
              {
                id: "load-example-production-machines",
                text: "Production with Machine Failure",
                onClick: () => {
                  createNewNet(productionMachines);
                  clearSelection();
                },
              },
              {
                id: "load-example-supply-chain-stochastic",
                text: "Supply Chain with Disruption",
                onClick: () => {
                  createNewNet(supplyChainWithDisruption);
                  clearSelection();
                },
              },
              {
                id: "load-example-probabilistic-satellites",
                text: "Probabilistic Satellite Launcher",
                onClick: () => {
                  createNewNet(probabilisticSatellitesSDCPN);
                  clearSelection();
                },
              },
              {
                id: "load-example-supply-chain-profit",
                text: "Supply Chain Profit",
                onClick: () => {
                  createNewNet(supplyChainProfit);
                  clearSelection();
                },
              },
              {
                id: "load-example-vaccination-campaign",
                text: "Vaccination Campaign",
                onClick: () => {
                  createNewNet(vaccinationCampaign);
                  clearSelection();
                },
              },
            ],
          },
        ]
      : []),
    {
      id: "user-settings",
      text: "User settings",
      suffix: <KeyboardShortcut shortcut="mod+," inMenu />,
      onClick: () =>
        navigation.navigate(
          { overlay: { type: "user-settings", section: "general" } },
          { cause: "user", action: "overlay" },
        ),
    },
    {
      id: "docs",
      text: "Docs",
      onClick: () => {
        window.open(
          "https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs",
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
  ];

  const showEmptyAiHero =
    aiAssistant !== undefined &&
    !isAiAssistantOpen &&
    !isAiCtaDismissed &&
    !willShowWalkthroughDialog(walkthrough, isWalkthroughOpen) &&
    isEmptySDCPN(petriNetDefinition);

  return (
    <ExperimentalIconProvider
      enabled={enableExperimentalIconPack}
      motion={showAnimations ? "auto" : "none"}
    >
      <EditorCommands
        applyAutoLayoutAndFrame={runAutoLayoutAndFrame}
        onToggleAiAssistant={aiAssistant ? toggleAiAssistant : undefined}
      />
      <UserSettings />
      <CreateNewNetCommands
        enabled={showNetManagementMenuItems}
        showBrunchOptions={showBrunchCreateNew}
        onBuildWithBrunch={handleBuildWithBrunch}
        onStartBlank={handleStartBlank}
      />
      <ImportErrorDialog
        open={importError !== null}
        onOpenChange={({ open }) => {
          if (!open) {
            setImportError(null);
          }
        }}
        errorMessage={importError ?? ""}
        onCreateEmpty={handleCreateEmpty}
      />

      <WalkthroughDialog open={isWalkthroughOpen} onClose={closeWalkthrough} />

      {/* Top Bar - always visible */}
      <TopBar
        actualModeAvailable={actualMode.available}
        menuItems={menuItems}
        title={title}
        onTitleChange={setTitle}
        titleEditable={titleEditable}
        hideNetManagementControls={hideNetManagementControls}
        mode={globalMode}
        onModeChange={setGlobalMode}
        onRunningExperimentClick={(experiment) =>
          handleRunningExperimentClick(experiment.id)
        }
        slots={slots}
      />

      {/* Voice session state is shared between the assistant panel that owns
          the session and the toolbar segment that controls it. */}
      <VoiceSessionProvider>
        <Stack direction="row" className={rowContainerStyle}>
          {globalMode === "simulate" && <SimulateViewTabs />}
          <SimulationWorkspace>
            {globalMode === "simulate" ? (
              <SimulateView />
            ) : (
              <div className={workspaceStyle}>
                {globalMode === "edit" && <EditViewSelector />}
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
                    <SDCPNView
                      onControllerChange={registerController}
                      viewportActions={viewportActions}
                    />

                    {showEmptyAiHero && (
                      <AiCtaModal
                        bottomClearance={
                          isBottomPanelOpen ? bottomPanelHeight : 0
                        }
                        onDismiss={() => setIsAiCtaDismissed(true)}
                        onStartVoiceMode={() => {
                          setPendingAiInteractionMode("voice");
                          setAiAssistantOpen(true);
                        }}
                        onSubmit={(message) => {
                          setPendingAiAssistantMessage(message);
                          setPendingAiInteractionMode("text");
                          setAiAssistantOpen(true);
                        }}
                        voiceModeAvailable={
                          aiAssistant.renderVoiceMode !== undefined
                        }
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
              <BottomBar
                mode={globalMode}
                editionMode={editionMode}
                onEditionModeChange={setEditionMode}
                cursorMode={cursorMode}
                onCursorModeChange={setCursorMode}
                hasAiAssistant={aiAssistant !== undefined}
              />
            </Activity>
            <SimulationCreationDrawer />
          </SimulationWorkspace>
          {aiAssistant && (
            <AiAssistantPanel
              /** Reset state (e.g. initial messages) when the active net changes */
              key={`ai-assistant-${petriNetId ?? "no-net"}`}
              aiAssistant={aiAssistant}
              applyAutoLayoutAndFrame={runAutoLayoutAndFrame}
              focusRequest={aiAssistantFocusRequest}
              frameSceneAfterRender={frameSceneAfterRender}
              initialMessage={pendingAiAssistantMessage}
              initialInteractionMode={pendingAiInteractionMode}
              offerStartPosture={offerStartPosture}
              onInitialMessageConsumed={() =>
                setPendingAiAssistantMessage(null)
              }
              onInitialInteractionModeConsumed={() =>
                setPendingAiInteractionMode(null)
              }
            />
          )}
        </Stack>
      </VoiceSessionProvider>
    </ExperimentalIconProvider>
  );
};

export const EditorView = (
  props: React.ComponentProps<typeof EditorViewContent>,
) => (
  <CodeNavigationProvider>
    <EditorViewContent {...props} />
  </CodeNavigationProvider>
);
