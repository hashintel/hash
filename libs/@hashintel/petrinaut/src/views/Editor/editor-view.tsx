import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { productionMachines } from "../../examples/broken-machines";
import { satellitesSDCPN } from "../../examples/satellites";
import { sirModel } from "../../examples/sir-model";
import { supplyChainSDCPN } from "../../examples/supply-chain";
import { supplyChainStochasticSDCPN } from "../../examples/supply-chain-stochastic";
import { useEditorStore } from "../../state/editor-provider";
import { useSDCPNStore } from "../../state/sdcpn-provider";
import { useSimulationStore } from "../../state/simulation-provider";
import { useLocalStorageSDCPNs } from "../../state/use-local-storage-sdcpns";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { LeftSideBar } from "./components/LeftSideBar/left-sidebar";
import { ModeSelector } from "./components/mode-selector";
import { PropertiesPanel } from "./components/PropertiesPanel/properties-panel";
import { exportSDCPN } from "./lib/export-sdcpn";
import { importSDCPN } from "./lib/import-sdcpn";

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView: React.FC = () => {
  // Get data from sdcpn-store
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const title = useSDCPNStore((state) => state.sdcpn.title);
  const updateTitle = useSDCPNStore((state) => state.updateTitle);
  const setSDCPN = useSDCPNStore((state) => state.setSDCPN);
  const layoutGraph = useSDCPNStore((state) => state.layoutGraph);

  // Get editor store methods
  const mode = useEditorStore((state) => state.globalMode);
  const setMode = useEditorStore((state) => state.setGlobalMode);
  const editionMode = useEditorStore((state) => state.editionMode);
  const setEditionMode = useEditorStore((state) => state.setEditionMode);
  const clearSelection = useEditorStore((state) => state.clearSelection);

  // Get simulation store method to initialize parameter values
  const initializeParameterValuesFromDefaults = useSimulationStore(
    (state) => state.initializeParameterValuesFromDefaults,
  );

  const { storedSDCPNs } = useLocalStorageSDCPNs();

  // Handler for mode change that initializes parameter values when switching to simulate mode
  function handleModeChange(newMode: "edit" | "simulate") {
    if (newMode === "simulate" && mode !== "simulate") {
      // Initialize parameter values from SDCPN defaults when switching to simulate mode
      initializeParameterValuesFromDefaults();
      // Clear selection when entering simulate mode
      clearSelection();
    }
    setMode(newMode);
  }

  function handleNew() {
    setSDCPN({
      id: `sdcpn-${Date.now()}`,
      title: "Untitled",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    });
    clearSelection();
  }

  function handleExport() {
    exportSDCPN(sdcpn);
  }

  function handleImport() {
    importSDCPN((loadedSDCPN) => {
      setSDCPN(loadedSDCPN);
      clearSelection();
    });
  }

  return (
    <Stack style={{ height: "100%" }}>
      <Stack direction="row" style={{ height: "100%", userSelect: "none" }}>
        <Box
          style={{
            width: "100%",
            position: "relative",
            flexGrow: 1,
          }}
        >
          {/* Floating Mode Selector - Top Center */}
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
            }}
          >
            <ModeSelector mode={mode} onChange={handleModeChange} />
          </div>

          {/* Left Sidebar with Menu, Title, and Tools */}
          <LeftSideBar
            menuItems={[
              {
                id: "new",
                label: "New",
                onClick: handleNew,
              },
              ...(Object.keys(storedSDCPNs).length > 0
                ? [
                    {
                      id: "open",
                      label: "Open",
                      submenu: Object.entries(storedSDCPNs)
                        .sort((a, b) =>
                          b[1].lastUpdated.localeCompare(a[1].lastUpdated),
                        )
                        .map(([id, storedRecord]) => ({
                          id: `open-${id}`,
                          label: storedRecord.sdcpn.title,
                          onClick: () => {
                            setSDCPN(storedRecord.sdcpn);
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
                      setSDCPN(supplyChainSDCPN);
                      clearSelection();
                    },
                  },
                  {
                    id: "load-example-supply-chain-stochastic",
                    label: "Supply Chain (Stochastic)",
                    onClick: () => {
                      setSDCPN(supplyChainStochasticSDCPN);
                      clearSelection();
                    },
                  },
                  {
                    id: "load-example-satellites",
                    label: "Satellites",
                    onClick: () => {
                      setSDCPN(satellitesSDCPN);
                      clearSelection();
                    },
                  },
                  {
                    id: "load-example-production-machines",
                    label: "Production Machines",
                    onClick: () => {
                      setSDCPN(productionMachines);
                      clearSelection();
                    },
                  },
                  {
                    id: "load-example-sir-model",
                    label: "SIR Model",
                    onClick: () => {
                      setSDCPN(sirModel);
                      clearSelection();
                    },
                  },
                ],
              },
            ]}
            title={title}
            onTitleChange={updateTitle}
          />

          {/* Properties Panel - Right Side */}
          <PropertiesPanel />

          {/* SDCPN Visualization */}
          <SDCPNView />

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
