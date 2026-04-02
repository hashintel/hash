import { css, cx } from "@hashintel/ds-helpers/css";
import { use, useRef, useState } from "react";

import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { productionMachines } from "../../examples/broken-machines";
import { deploymentPipelineSDCPN } from "../../examples/deployment-pipeline";
import { satellitesSDCPN } from "../../examples/satellites";
import { probabilisticSatellitesSDCPN } from "../../examples/satellites-launcher";
import { sirModel } from "../../examples/sir-model";
import { supplyChainStochasticSDCPN } from "../../examples/supply-chain-stochastic";
import { exportSDCPN } from "../../file-format/export-sdcpn";
import { importSDCPN } from "../../file-format/import-sdcpn";
import { calculateGraphLayout } from "../../lib/calculate-graph-layout";
import { EditorContext } from "../../state/editor-context";
import { MutationContext } from "../../state/mutation-context";
import { PortalContainerContext } from "../../state/portal-container-context";
import { SDCPNContext } from "../../state/sdcpn-context";
import { useSelectionCleanup } from "../../state/use-selection-cleanup";
import type { ViewportAction } from "../../types/viewport-action";
import { UserSettingsContext } from "../../state/user-settings-context";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../SDCPN/styles/styling";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { ImportErrorDialog } from "./components/import-error-dialog";
import { TopBar } from "./components/TopBar/top-bar";
import { exportTikZ } from "./lib/export-tikz";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import { SimulateView } from "./panels/SimulateView/simulate-view";

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

const editorRootStyle = css({
  position: "relative",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s25",
});

const portalContainerStyle = css({
  position: "absolute",
  top: "0",
  left: "0",
  width: "full",
  height: "full",
  zIndex: "99999",
  pointerEvents: "none",
});

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView = ({
  hideNetManagementControls,
  viewportActions,
}: {
  hideNetManagementControls: boolean;
  viewportActions?: ViewportAction[];
}) => {
  // Get data from sdcpn-store
  const {
    createNewNet,
    existingNets,
    loadPetriNet,
    petriNetDefinition,
    title,
    setTitle,
  } = use(SDCPNContext);
  const { layoutGraph } = use(MutationContext);

  // Get editor context
  const {
    globalMode: mode,
    setGlobalMode,
    editionMode,
    setEditionMode,
    cursorMode,
    setCursorMode,
    clearSelection,
  } = use(EditorContext);

  const { compactNodes } = use(UserSettingsContext);
  const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;

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

  const menuItems = [
    ...(!hideNetManagementControls
      ? [
          {
            id: "new",
            label: "New",
            onClick: handleNew,
          },
        ]
      : []),
    ...(!hideNetManagementControls && Object.keys(existingNets).length > 0
      ? [
          {
            id: "open",
            label: "Open",
            submenu: existingNets.map((net) => ({
              id: `open-${net.netId}`,
              label: net.title,
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
      label: "Export",
      submenu: [
        {
          id: "export-json",
          label: "JSON",
          onClick: handleExport,
        },
        {
          id: "export-without-visuals",
          label: "JSON without visual info",
          onClick: handleExportWithoutVisualInfo,
        },
        {
          id: "export-tikz",
          label: "TikZ",
          onClick: handleExportTikZ,
        },
      ],
    },
    ...(!hideNetManagementControls
      ? [
          {
            id: "import",
            label: "Import",
            onClick: handleImport,
          },
        ]
      : []),
    {
      id: "layout",
      label: "Layout",
      onClick: layoutGraph,
    },
    ...(!hideNetManagementControls
      ? [
          {
            id: "load-example",
            label: "Load example",
            submenu: [
              {
                id: "load-example-supply-chain-stochastic",
                label: "Probabilistic Supply Chain",
                onClick: () => {
                  createNewNet(supplyChainStochasticSDCPN);
                  clearSelection();
                },
              },
              {
                id: "load-example-satellites",
                label: "Satellites",
                onClick: () => {
                  createNewNet(satellitesSDCPN);
                  clearSelection();
                },
              },
              {
                id: "load-example-probabilistic-satellites",
                label: "Probabilistic Satellites Launcher",
                onClick: () => {
                  createNewNet(probabilisticSatellitesSDCPN);
                  clearSelection();
                },
              },
              {
                id: "load-example-production-machines",
                label: "Production Machines",
                onClick: () => {
                  createNewNet(productionMachines);
                  clearSelection();
                },
              },
              {
                id: "load-example-sir-model",
                label: "SIR Model",
                onClick: () => {
                  createNewNet(sirModel);
                  clearSelection();
                },
              },
              {
                id: "load-example-deployment-pipeline",
                label: "Deployment Pipeline",
                onClick: () => {
                  createNewNet(deploymentPipelineSDCPN);
                  clearSelection();
                },
              },
            ],
          },
        ]
      : []),
    {
      id: "docs",
      label: "Docs",
      onClick: () => {
        window.open(
          "https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs",
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
  ];

  const portalContainerRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <Stack className={cx(editorRootStyle, "petrinaut-root")}>
        <div ref={portalContainerRef} className={portalContainerStyle} />

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

        {/* Top Bar - always visible */}
        <TopBar
          menuItems={menuItems}
          title={title}
          onTitleChange={setTitle}
          hideNetManagementControls={hideNetManagementControls}
          mode={mode}
          onModeChange={setGlobalMode}
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

              {/* Bottom Panel - Diagnostics, Simulation Settings */}
              <BottomPanel />

              <BottomBar
                mode={mode}
                editionMode={editionMode}
                onEditionModeChange={setEditionMode}
                cursorMode={cursorMode}
                onCursorModeChange={setCursorMode}
              />
            </Box>
          )}
        </Stack>
      </Stack>
    </PortalContainerContext>
  );
};
