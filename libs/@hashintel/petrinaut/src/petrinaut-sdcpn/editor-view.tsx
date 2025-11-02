import "./index.css";

import { Box, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import { BottomBar } from "./components/bottom-bar";
import { FloatingTitle } from "./components/floating-title";
import { HamburgerMenu } from "./components/hamburger-menu";
import { ModeSelector } from "./components/mode-selector";
import { PropertiesPanel } from "./components/properties-panel";
import { exampleSDCPN } from "./examples/example";
import { useSDCPNStore } from "./state/mod";
import { SDCPNView } from "./views/sdcpn-view";

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView = () => {
  const [mode, setMode] = useState<"edit" | "simulate">("edit");

  // Get data from sdcpn-store
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const updateTitle = useSDCPNStore((state) => state.updateTitle);
  const setSDCPN = useSDCPNStore((state) => state.setSDCPN);
  const setTokenTypes = useSDCPNStore((state) => state.setTokenTypes);
  const layoutGraph = useSDCPNStore((state) => state.layoutGraph);

  const title = sdcpn.title;

  const handleLoadExample = useCallback(() => {
    setSDCPN(exampleSDCPN);
    // Assuming exampleSDCPN has tokenTypes, or use empty array as fallback
    setTokenTypes([]);
  }, [setSDCPN, setTokenTypes]);

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
                    void layoutGraph();
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

          {/* Floating Title - Top Left (after hamburger) */}
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
