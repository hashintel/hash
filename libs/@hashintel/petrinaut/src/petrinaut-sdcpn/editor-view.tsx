import "./index.css";

import { Box, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import { BottomBar } from "./components/bottom-bar";
import { FloatingTitle } from "./components/floating-title";
import { HamburgerMenu } from "./components/hamburger-menu";
import { ModeSelector } from "./components/mode-selector";
import { PropertiesPanel } from "./components/properties-panel";
import { exampleSDCPN } from "./examples/example";
import { sdcpnToPetriNet } from "./lib/sdcpn-converters";
import { SDCPNView } from "./sdcpn-view";
import { useEditorStore } from "./state/mod";
import type { ArcType, NodeType, PetriNetDefinitionObject } from "./types";
import { useLayoutGraph } from "./use-layout-graph";

type EditorViewProps = {
  /**
   * Whether to hide controls relating to net loading, creation and title setting.
   */
  hideNetManagementControls: boolean;
  /**
   * Create a new net and load it into the editor.
   */
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  /**
   * The title of the net which is currently loaded.
   */
  title: string;
  /**
   * Set the title of the net which is currently loaded.
   */
  setTitle: (title: string) => void;
  /**
   * Nodes in PetriNetDefinitionObject format (for backward compatibility)
   */
  nodes: NodeType[];
  /**
   * Arcs in PetriNetDefinitionObject format (for backward compatibility)
   */
  arcs: ArcType[];
};

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView = ({
  hideNetManagementControls,
  createNewNet,
  title,
  setTitle,
  nodes,
  arcs,
}: EditorViewProps) => {
  const [mode, setMode] = useState<"edit" | "simulate">("edit");

  const clearSelection = useEditorStore((state) => state.clearSelection);
  const layoutGraph = useLayoutGraph();

  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleLoadExample = useCallback(() => {
    const petriNetDef = sdcpnToPetriNet(exampleSDCPN);
    createNewNet({
      petriNetDefinition: petriNetDef,
      title: exampleSDCPN.title,
    });
  }, [createNewNet]);

  return (
    <Stack sx={{ height: "100%" }}>
      <Stack direction="row" sx={{ height: "100%", userSelect: "none" }}>
        <Box
          sx={{
            width: "100%",
            position: "relative",
            flexGrow: 1,
          }}
        >
          {/* Floating Hamburger Menu - Top Left */}
          {!hideNetManagementControls && (
            <div
              style={{
                position: "absolute",
                top: "24px",
                left: "24px",
                zIndex: 1000,
              }}
            >
              <HamburgerMenu
                menuItems={[
                  {
                    id: "new",
                    label: "New",
                    onClick: () => {},
                  },
                  {
                    id: "open",
                    label: "Open",
                    onClick: () => {},
                  },
                  {
                    id: "layout",
                    label: "Layout",
                    onClick: () => {
                      layoutGraph({
                        nodes,
                        arcs,
                        animationDuration: 200,
                      });
                    },
                  },
                  {
                    id: "save",
                    label: "Save",
                    onClick: () => {},
                  },
                  {
                    id: "export",
                    label: "Export",
                    onClick: () => {},
                  },
                  {
                    id: "import",
                    label: "Import",
                    onClick: () => {},
                  },
                  {
                    id: "load-example",
                    label: "Load Example",
                    onClick: () => {
                      handleLoadExample();
                    },
                  },
                ]}
              />
            </div>
          )}

          {/* Floating Title - Top Left (after hamburger) */}
          {!hideNetManagementControls && (
            <div
              style={{
                position: "absolute",
                top: "24px",
                left: "80px",
                zIndex: 1000,
              }}
            >
              <FloatingTitle
                value={title}
                onChange={setTitle}
                placeholder="Process"
              />
            </div>
          )}

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
            <ModeSelector mode={mode} onChange={setMode} />
          </div>

          {/* Properties Panel - Right Side */}
          <PropertiesPanel />

          {/* SDCPN Visualization */}
          <SDCPNView nodes={nodes} arcs={arcs} onPaneClick={handlePaneClick} />

          <BottomBar />
        </Box>
      </Stack>
    </Stack>
  );
};
