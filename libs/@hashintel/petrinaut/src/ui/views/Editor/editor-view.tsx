import { use, useState } from "react";

import { type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { calculateGraphLayout, type SDCPN } from "@hashintel/petrinaut-core";
import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainWithDisruption,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";

import { usePetrinautCommands } from "../../../react";
import { ActualModeContext } from "../../../react/actual-mode-context";
import { ExperimentsContext } from "../../../react/experiments/context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import {
  WalkthroughContext,
  willShowWalkthroughDialog,
} from "../../components/walkthrough/walkthrough-context";
import { WalkthroughDialog } from "../../components/walkthrough/walkthrough-dialog";
import { exportSDCPN } from "../../file-io/export-sdcpn";
import { exportTikZ } from "../../file-io/export-tikz";
import { importSDCPN } from "../../file-io/import-sdcpn";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../SDCPN/node-dimensions";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { AiCtaModal } from "./components/ai-cta-modal";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { ImportErrorDialog } from "./components/import-error-dialog";
import { TopBar } from "./components/TopBar/top-bar";
import { AiAssistantPanel } from "./panels/ai-assistant-panel";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import { SimulateView } from "./panels/SimulateView/simulate-view";

import type { PetrinautAiAssistant } from "../../petrinaut";
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

const rowContainerStyle = css({
  height: "full",
  userSelect: "none",
});

const canvasContainerStyle = css({
  width: "full",
  position: "relative",
  flexGrow: 1,
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
export const EditorView = ({
  aiAssistant,
  hideNetManagementControls,
  slots,
  viewportActions,
}: {
  aiAssistant?: PetrinautAiAssistant;
  /**
   * See {@link TopBar} for the full semantics.
   */
  hideNetManagementControls?: "all" | "except-title";
  slots?: PetrinautSlots;
  viewportActions?: ViewportAction[];
}) => {
  const showNetManagementMenuItems = hideNetManagementControls === undefined;
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

  // Get editor context
  const {
    globalMode: mode,
    isAiAssistantOpen,
    setGlobalMode,
    editionMode,
    setEditionMode,
    cursorMode,
    setCursorMode,
    clearSelection,
    setSimulateViewMode,
    setAiAssistantOpen,
    isBottomPanelOpen,
    bottomPanelHeight,
  } = use(EditorContext);
  const { setSelectedExperimentId } = use(ExperimentsContext);
  const actualMode = use(ActualModeContext);

  const [pendingAiAssistantMessage, setPendingAiAssistantMessage] = useState<
    string | null
  >(null);
  const [isAiCtaDismissed, setIsAiCtaDismissed] = useState(false);

  const { compactNodes, showWalkthroughOnInit, setShowWalkthroughOnInit } =
    use(UserSettingsContext);
  const walkthrough = use(WalkthroughContext);
  const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;

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
      petriNetDefinition: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        subnets: [],
        componentInstances: [],
      },
    });
    clearSelection();
  }

  function handleNew() {
    handleCreateEmpty();
  }

  function handleExport() {
    exportSDCPN({ petriNetDefinition, title });
  }

  function handleExportWithoutVisualInfo() {
    exportSDCPN({ petriNetDefinition, title, removeVisualInfo: true });
  }

  function handleExportTikZ() {
    exportTikZ({ petriNetDefinition, title });
  }

  function handleRunningExperimentClick(experimentId: string) {
    setGlobalMode("simulate");
    setSimulateViewMode("experiments");
    setSelectedExperimentId(experimentId);
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
      const positions = await calculateGraphLayout(sdcpnToLoad, dims);

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

    createNewNet({
      title: loadedSDCPN.title,
      petriNetDefinition: sdcpnToLoad,
    });
    clearSelection();
  }

  const menuItems: MenuItem[] = [
    ...(showNetManagementMenuItems
      ? [
          {
            id: "new",
            text: "New",
            onClick: handleNew,
          },
        ]
      : []),
    ...(showNetManagementMenuItems && existingNets.length > 0
      ? [
          {
            id: "open",
            text: "Open",
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
          id: "export-json",
          text: "JSON",
          onClick: handleExport,
        },
        {
          id: "export-without-visuals",
          text: "JSON without visual info",
          onClick: handleExportWithoutVisualInfo,
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
    {
      id: "layout",
      text: "Layout",
      onClick: () => {
        void applyAutoLayout();
      },
    },
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
            ],
          },
        ]
      : []),
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
    <>
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
        hideNetManagementControls={hideNetManagementControls}
        mode={mode}
        onModeChange={setGlobalMode}
        onRunningExperimentClick={(experiment) =>
          handleRunningExperimentClick(experiment.id)
        }
        slots={slots}
      />

      <Stack direction="row" className={rowContainerStyle}>
        {mode === "simulate" ? (
          <SimulateView />
        ) : (
          <Box className={canvasContainerStyle}>
            {/* Left Sidebar - Tools and content panels */}
            <LeftSideBar />

            {/* Properties Panel - Right Side */}
            <PropertiesPanel />

            {/* SDCPN Visualization */}
            <SDCPNView viewportActions={viewportActions} />

            {showEmptyAiHero && (
              <AiCtaModal
                bottomClearance={isBottomPanelOpen ? bottomPanelHeight : 0}
                onDismiss={() => setIsAiCtaDismissed(true)}
                onSubmit={(message) => {
                  setPendingAiAssistantMessage(message);
                  setAiAssistantOpen(true);
                }}
              />
            )}

            {/* Bottom Panel */}
            <BottomPanel />

            <BottomBar
              mode={mode}
              editionMode={editionMode}
              onEditionModeChange={setEditionMode}
              cursorMode={cursorMode}
              onCursorModeChange={setCursorMode}
              hasAiAssistant={aiAssistant !== undefined}
            />

            {aiAssistant && (
              <AiAssistantPanel
                /** Reset state (e.g. initial messages) when the active net changes */
                key={petriNetId ?? "no-net"}
                aiAssistant={aiAssistant}
                initialMessage={pendingAiAssistantMessage}
                onInitialMessageConsumed={() =>
                  setPendingAiAssistantMessage(null)
                }
              />
            )}
          </Box>
        )}
      </Stack>
    </>
  );
};
