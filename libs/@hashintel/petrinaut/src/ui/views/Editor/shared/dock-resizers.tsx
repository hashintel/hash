import { css } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { useReading } from "../../../lib/readings";
import { PanelResizer } from "../../../resize/panel-resizer";
import { docks, type DockName } from "./docks";

import type { ReactNode } from "react";

// Over the canvas and its panels, and out of the pointer's way everywhere
// but on the separators.
const layerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "sticky",
  pointerEvents: "none",
});

/** The resizer of one docked panel, around the resizers of the panels inside it. */
const DockResizer = ({
  panel,
  className,
  children,
}: {
  panel: DockName;
  className?: string;
  children?: ReactNode;
}) => {
  const dock = docks[panel];
  const size = usePanelSizes()[dock.size];
  const shown = usePanelPresence().shown[panel];
  const saveSize = useUserSettings((settings) => settings[dock.saveSize]);
  // A panel that slides is not where its stand-in is.
  const isOpen = useReading(() => shown.get() === 1);

  return (
    <PanelResizer
      id={panel}
      edge={dock.edge}
      size={size}
      isOpen={isOpen}
      minSize={dock.minSize}
      maxSize={dock.maxSize}
      label={dock.label}
      onCommit={saveSize}
      className={className}
    >
      {children}
    </PanelResizer>
  );
};

/**
 * The separators that resize the panels docked around the canvas, as a layer
 * over them.
 *
 * The resizers nest the way the panels sit: the left sidebar beside
 * everything else, the bottom panel under what is left, and the properties
 * panel beside the canvas. A press where two separators cross resizes both
 * panels.
 */
export const DockResizers = () => (
  <DockResizer panel="leftSidebar" className={layerStyle}>
    <DockResizer panel="bottomPanel">
      <DockResizer panel="propertiesPanel" />
    </DockResizer>
  </DockResizer>
);
