import { css } from "@hashintel/ds-helpers/css";
import { use, useRef } from "react";

import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { productionMachines } from "../../examples/broken-machines";
import { satellitesSDCPN } from "../../examples/satellites";
import { sirModel } from "../../examples/sir-model";
import { convertOldFormatToSDCPN } from "../../old-formats/convert-old-format";
import { EditorContext } from "../../state/editor-context";
import { PortalContainerContext } from "../../state/portal-container-context";
import { SDCPNContext } from "../../state/sdcpn-context";
// import { useSimulationStore } from "../../state/simulation-provider";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { TopBar } from "./components/TopBar/top-bar";
import { exportSDCPN } from "./lib/export-sdcpn";
import { exportTikZ } from "./lib/export-tikz";
import { importSDCPN } from "./lib/import-sdcpn";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";

const fullHeightStyle = css({
  height: "[100%]",
});

const rowContainerStyle = css({
  height: "[100%]",
  userSelect: "none",
});

const canvasContainerStyle = css({
  width: "[100%]",
  position: "relative",
  flexGrow: 1,
});

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView = ({
  hideNetManagementControls,
}: {
  hideNetManagementControls: boolean;
}) => {
  // Get data from sdcpn-store
  const {
    createNewNet,
    existingNets,
    layoutGraph,
    loadPetriNet,
    petriNetDefinition,
    title,
    setTitle,
  } = use(SDCPNContext);

  // Get editor context
  const {
    globalMode: mode,
    editionMode,
    setEditionMode,
    clearSelection,
  } = use(EditorContext);

  function handleNew() {
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

  function handleExport() {
    exportSDCPN({ petriNetDefinition, title });
  }

  function handleExportWithoutVisualInfo() {
    exportSDCPN({ petriNetDefinition, title, removeVisualInfo: true });
  }

  function handleExportTikZ() {
    exportTikZ({ petriNetDefinition, title });
  }

  function handleImport() {
    importSDCPN((loadedSDCPN) => {
      const convertedSdcpn = convertOldFormatToSDCPN(loadedSDCPN);

      createNewNet({
        title: loadedSDCPN.title,
        petriNetDefinition: convertedSdcpn ?? loadedSDCPN,
      });
      clearSelection();
    });
  }

  const menuItems = [
    {
      id: "new",
      label: "New",
      onClick: handleNew,
    },
    ...(!hideNetManagementControls && Object.keys(existingNets).length > 0
      ? [
          {
            id: "open",
            label: "Open",
            submenu: existingNets.map((net) => ({
              id: `open-${net.netId}`,
              label: net.title,
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
    {
      id: "import",
      label: "Import",
      onClick: handleImport,
    },
    {
      id: "layout",
      label: "Layout",
      onClick: layoutGraph,
    },
    {
      id: "load-example",
      label: "Load example",
      submenu: [
        {
          id: "load-example-satellites",
          label: "Satellites",
          onClick: () => {
            createNewNet(satellitesSDCPN);
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
      ],
    },
  ];

  const portalContainerRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <Stack
        ref={portalContainerRef}
        className={`${fullHeightStyle} petrinaut-root`}
      >
        {/* Top Bar - always visible */}
        <TopBar
          menuItems={menuItems}
          title={title}
          onTitleChange={setTitle}
          hideNetManagementControls={hideNetManagementControls}
          mode={mode}
          onModeChange={() => {
            // Mode change handled by TopBar; currently only "edit" is enabled
          }}
        />

        <Stack direction="row" className={rowContainerStyle}>
          <Box className={canvasContainerStyle}>
            {/* Left Sidebar - Tools and content panels */}
            <LeftSideBar />

            {/* Properties Panel - Right Side */}
            <PropertiesPanel />

            {/* SDCPN Visualization */}
            <SDCPNView />

            {/* Bottom Panel - Diagnostics, Simulation Settings */}
            <BottomPanel />

            <BottomBar
              mode={mode}
              editionMode={editionMode}
              onEditionModeChange={setEditionMode}
            />
          </Box>
        </Stack>
      </Stack>
    </PortalContainerContext>
  );
};
