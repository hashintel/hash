import { css } from "@hashintel/ds-helpers/css";

import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { productionMachines } from "../../examples/broken-machines";
import { satellitesSDCPN } from "../../examples/satellites";
import { sirModel } from "../../examples/sir-model";
import { supplyChainStochasticSDCPN } from "../../examples/supply-chain-stochastic";
import { convertOldFormatToSDCPN } from "../../old-formats/convert-old-format";
import { useEditorStore } from "../../state/editor-provider";
import { useSDCPNContext } from "../../state/sdcpn-provider";
// import { useSimulationStore } from "../../state/simulation-provider";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
// import { ModeSelector } from "./components/mode-selector";
import { exportSDCPN } from "./lib/export-sdcpn";
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

// const modeSelectorPositionStyle = css({
//   position: "absolute",
//   top: "[24px]",
//   left: "[50%]",
//   transform: "translateX(-50%)",
//   zIndex: 1000,
// });

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
  } = useSDCPNContext();

  // Get editor store methods
  const mode = useEditorStore((state) => state.globalMode);
  // const setMode = useEditorStore((state) => state.setGlobalMode);
  const editionMode = useEditorStore((state) => state.editionMode);
  const setEditionMode = useEditorStore((state) => state.setEditionMode);
  const clearSelection = useEditorStore((state) => state.clearSelection);

  // Get simulation store method to initialize parameter values
  // const initializeParameterValuesFromDefaults = useSimulationStore(
  //   (state) => state.initializeParameterValuesFromDefaults,
  // );

  // Handler for mode change that initializes parameter values when switching to simulate mode
  // function handleModeChange(newMode: "edit" | "simulate") {
  //   if (newMode === "simulate" && mode !== "simulate") {
  //     // Initialize parameter values from SDCPN defaults when switching to simulate mode
  //     initializeParameterValuesFromDefaults();
  //     // Clear selection when entering simulate mode
  //     clearSelection();
  //   }
  //   setMode(newMode);
  // }

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

  return (
    <Stack className={`${fullHeightStyle} petrinaut-root`}>
      <Stack direction="row" className={rowContainerStyle}>
        <Box className={canvasContainerStyle}>
          {/* Floating Mode Selector - Top Center */}
          {/* <div className={modeSelectorPositionStyle}>
            <ModeSelector mode={mode} onChange={handleModeChange} />
          </div> */}

          {/* Left Sidebar with Menu, Title, and Tools */}
          <LeftSideBar
            hideNetManagementControls={hideNetManagementControls}
            menuItems={[
              {
                id: "new",
                label: "New",
                onClick: handleNew,
              },
              ...(!hideNetManagementControls &&
              Object.keys(existingNets).length > 0
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
                onClick: handleExport,
              },
              {
                id: "export-without-visuals",
                label: "Export without Visual Info",
                onClick: handleExportWithoutVisualInfo,
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
                  /**
                   * @todo H-5641: once probabilistic transition kernel available,
                   *       update this example so that the Manufacture step probabilistically
                   *       produces either good or bad product, then enable a 'Dispose' or 'Dispatch'
                   *       transition depending on which was randomly selected.
                   */
                  // {
                  //   id: "load-example-supply-chain",
                  //   label: "Supply Chain",
                  //   onClick: () => {
                  //     createNewNet(supplyChainSDCPN);
                  //     clearSelection();
                  //   },
                  // },
                  // {
                  //   id: "load-example-supply-chain-stochastic",
                  //   label: "Supply Chain (Stochastic)",
                  //   onClick: () => {
                  //     createNewNet(supplyChainStochasticSDCPN);
                  //     clearSelection();
                  //   },
                  // },
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
            ]}
            title={title}
            onTitleChange={setTitle}
          />

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
  );
};
