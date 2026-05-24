import { useReactFlow } from "@xyflow/react";
import { use, useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { Button } from "../../../components/button";
import { PANEL_MARGIN } from "../../../constants/ui";
import { ViewportSettingsDialog } from "./viewport-settings-dialog";

import type { ViewportAction } from "../../../types/viewport-action";

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
    BASE_OFFSET + (isPropertiesPanelVisible ? propertiesPanelWidth + PANEL_MARGIN : 0);
  const bottomOffset = BASE_OFFSET + (isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0);

  return (
    <div
      className={`${containerStyle} ${animatingStyle({ animating: isPanelAnimating })}`}
      style={{ right: rightOffset, bottom: bottomOffset }}
    >
      <Button
        size="sm"
        variant="subtle"
        aria-label="Zoom in"
        tooltip="Zoom in"
        tooltipDisplay="inline"
        iconName="plus"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={() => zoomIn()}
      />
      <Button
        size="sm"
        variant="subtle"
        aria-label="Zoom out"
        tooltip="Zoom out"
        tooltipDisplay="inline"
        iconName="dash"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={() => zoomOut()}
      />
      <Button
        size="sm"
        variant="subtle"
        aria-label="Fullscreen"
        tooltip="Fullscreen"
        tooltipDisplay="inline"
        iconName="expand"
        onClick={collapseAllPanels}
      />
      <Button
        size="sm"
        variant="subtle"
        aria-label="Lock view"
        tooltip="Lock view"
        tooltipDisplay="inline"
        iconName="lockOpen"
        onClick={() => {
          // Placeholder for future lock view functionality
        }}
      />
      <Button
        size="sm"
        variant="subtle"
        aria-label="Settings"
        tooltip="Settings"
        tooltipDisplay="inline"
        iconName="gear"
        onClick={() => setIsSettingsOpen(true)}
      />
      <ViewportSettingsDialog
        open={isSettingsOpen}
        onOpenChange={(details) => setIsSettingsOpen(details.open)}
      />
      {viewportActions?.map((action) => (
        <Button
          key={action.key}
          ref={action.ref}
          size="sm"
          variant="subtle"
          aria-label={action.label}
          tooltip={action.tooltip}
          tooltipDisplay="inline"
          onClick={action.onClick}
          className={action.className}
          prefix={action.icon}
        />
      ))}
    </div>
  );
};
