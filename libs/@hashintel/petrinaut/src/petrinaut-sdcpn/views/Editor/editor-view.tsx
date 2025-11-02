import { useState } from "react";

import { Box } from "../../components/box";
import { Stack } from "../../components/stack";
import { exampleSDCPN } from "../../examples/example";
import { useEditorStore } from "../../state/editor-provider";
import { useSDCPNStore } from "../../state/sdcpn-provider";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/bottom-bar";
import { FloatingTitle } from "./components/floating-title";
import { HamburgerMenu } from "./components/hamburger-menu";
import { ModeSelector } from "./components/mode-selector";
import { PropertiesPanel } from "./components/properties-panel";

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView: React.FC = () => {
  const [mode, setMode] = useState<"edit" | "simulate">("edit");

  // Get data from sdcpn-store
  const title = useSDCPNStore((state) => state.sdcpn.title);
  const updateTitle = useSDCPNStore((state) => state.updateTitle);
  const setSDCPN = useSDCPNStore((state) => state.setSDCPN);
  const layoutGraph = useSDCPNStore((state) => state.layoutGraph);

  // Get editor store methods
  const clearSelection = useEditorStore((state) => state.clearSelection);

  function handleNew() {
    setSDCPN({
      id: `sdcpn-${Date.now()}`,
      title: "Untitled",
      places: [],
      transitions: [],
    });
    clearSelection();
  }

  function handleLoadExample() {
    setSDCPN(exampleSDCPN);
    clearSelection();
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
          {/* Floating Hamburger Menu - Top Left */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: "24px",
              left: "24px",
              zIndex: 1000,
              gap: "16px",
              flexDirection: "row",
              justifyItems: "center",
            }}
          >
            <HamburgerMenu
              menuItems={[
                {
                  id: "new",
                  label: "New",
                  onClick: handleNew,
                },
                {
                  id: "open",
                  label: "Open",
                  onClick: () => {},
                },
                {
                  id: "layout",
                  label: "Layout",
                  onClick: layoutGraph,
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

            {/* Floating Title - Top Left (after hamburger) */}
            <FloatingTitle
              value={title}
              onChange={updateTitle}
              placeholder="Process"
            />
          </div>

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
          <SDCPNView />

          <BottomBar />
        </Box>
      </Stack>
    </Stack>
  );
};
