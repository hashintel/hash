import { css, cva } from "@hashintel/ds-helpers/css";
import { useReactFlow } from "@xyflow/react";
import { use, useState } from "react";
import {
  TbLockOpen,
  TbMaximize,
  TbMinus,
  TbPlus,
  TbSettings,
} from "react-icons/tb";

import { IconButton } from "../../../components/icon-button";
import { PANEL_MARGIN } from "../../../constants/ui";
import { EditorContext } from "../../../state/editor-context";
import { ViewportSettingsDialog } from "./viewport-settings-dialog";

const BASE_OFFSET = 12;

const containerStyle = css({
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  zIndex: "[900]",
});

const animatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[right 150ms ease-in-out, bottom 150ms ease-in-out]",
      },
    },
  },
});

export const ViewportControls: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { zoomIn, zoomOut } = useReactFlow();
  const {
    collapseAllPanels,
    selection,
    propertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    isPanelAnimating,
  } = use(EditorContext);

  const isPropertiesPanelVisible = selection.size > 0;
  const rightOffset =
    BASE_OFFSET +
    (isPropertiesPanelVisible ? propertiesPanelWidth + PANEL_MARGIN : 0);
  const bottomOffset =
    BASE_OFFSET + (isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0);

  return (
    <div
      className={`${containerStyle} ${animatingStyle({ animating: isPanelAnimating })}`}
      style={{ right: rightOffset, bottom: bottomOffset }}
    >
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Zoom in"
        tooltip="Zoom in"
        onClick={() => zoomIn()}
      >
        <TbPlus size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Zoom out"
        tooltip="Zoom out"
        onClick={() => zoomOut()}
      >
        <TbMinus size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Fullscreen"
        tooltip="Fullscreen"
        onClick={collapseAllPanels}
      >
        <TbMaximize size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Lock view"
        tooltip="Lock view"
        onClick={() => {
          // Placeholder for future lock view functionality
        }}
      >
        <TbLockOpen size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Settings"
        tooltip="Settings"
        onClick={() => setIsSettingsOpen(true)}
      >
        <TbSettings size={14} />
      </IconButton>
      <ViewportSettingsDialog
        open={isSettingsOpen}
        onOpenChange={(details) => setIsSettingsOpen(details.open)}
      />
    </div>
  );
};
