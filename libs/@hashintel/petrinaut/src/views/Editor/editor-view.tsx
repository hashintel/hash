import { css, cx } from "@hashintel/ds-helpers/css";
import { use, useRef } from "react";

import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { productionMachines } from "../../examples/broken-machines";
import { satellitesSDCPN } from "../../examples/satellites";
import { probabilisticSatellitesSDCPN } from "../../examples/satellites-launcher";
import { satellitesPythonSDCPN } from "../../examples/satellites-python";
import { sirModel } from "../../examples/sir-model";
import { supplyChainSDCPN } from "../../examples/supply-chain";
import { supplyChainStochasticSDCPN } from "../../examples/supply-chain-stochastic";
import { convertOldFormatToSDCPN } from "../../old-formats/convert-old-format";
import { EditorContext } from "../../state/editor-context";
import { PortalContainerContext } from "../../state/portal-container-context";
import { SDCPNContext } from "../../state/sdcpn-context";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { TopBar } from "./components/TopBar/top-bar";
import { exportSDCPN } from "./lib/export-sdcpn";
import { exportTikZ } from "./lib/export-tikz";
import { importSDCPN } from "./lib/import-sdcpn";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";

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
    cursorMode,
    setCursorMode,
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
          id: "load-example-supply-chain",
          label: "Supply Chain",
          onClick: () => {
            createNewNet(supplyChainSDCPN);
            clearSelection();
          },
        },
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
          id: "load-example-satellites-python",
          label: "Satellites (Python)",
          onClick: () => {
            createNewNet(satellitesPythonSDCPN);
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
      <Stack className={cx(editorRootStyle, "petrinaut-root")}>
        <div ref={portalContainerRef} className={portalContainerStyle} />

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
              cursorMode={cursorMode}
              onCursorModeChange={setCursorMode}
            />
          </Box>
        </Stack>
      </Stack>
    </PortalContainerContext>
  );
};
