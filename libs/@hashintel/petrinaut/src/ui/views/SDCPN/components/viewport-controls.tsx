import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { useReactFlow } from "@xyflow/react";
import { use, useState } from "react";

import { IconButton } from "../../../components/icon-button";
import { PANEL_MARGIN } from "../../../constants/ui";
import { EditorContext } from "../../../../react/state/editor-context";
import type { ViewportAction } from "../../../types/viewport-action";
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

export const ViewportControls: React.FC<{
  viewportActions?: ViewportAction[];
}> = ({ viewportActions }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { zoomIn, zoomOut } = useReactFlow();
  const {
    collapseAllPanels,
    hasSelection,
    propertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    isPanelAnimating,
  } = use(EditorContext);

  const isPropertiesPanelVisible = hasSelection;
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
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={() => zoomIn()}
      >
        <Icon name="plus" size="sm" />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Zoom out"
        tooltip="Zoom out"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={() => zoomOut()}
      >
        <Icon name="dash" size="sm" />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Fullscreen"
        tooltip="Fullscreen"
        onClick={collapseAllPanels}
      >
        <Icon name="expand" size="sm" />
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
        <Icon name="lockOpen" size="sm" />
      </IconButton>
      <IconButton
        size="xs"
        variant="outline"
        aria-label="Settings"
        tooltip="Settings"
        onClick={() => setIsSettingsOpen(true)}
      >
        <Icon name="gear" size="sm" />
      </IconButton>
      <ViewportSettingsDialog
        open={isSettingsOpen}
        onOpenChange={(details) => setIsSettingsOpen(details.open)}
      />
      {viewportActions?.map((action) => (
        <IconButton
          key={action.key}
          ref={action.ref}
          size="xs"
          variant="outline"
          aria-label={action.label}
          tooltip={action.tooltip}
          onClick={action.onClick}
          style={action.style}
          className={action.className}
        >
          {action.icon}
        </IconButton>
      ))}
    </div>
  );
};
