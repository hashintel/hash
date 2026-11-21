import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { useReading } from "../../../lib/readings";
import { PanelResizer } from "../../../resize/panel-resizer";
import { docks, type DockName } from "./docks";

import type { ReactNode } from "react";

/** The resizer of one docked panel, around the resizers of the panels inside it. */
const DockResizer = ({
  panel,
  children,
}: {
  panel: DockName;
  children?: ReactNode;
}) => {
  const dock = docks[panel];
  const size = usePanelSizes()[dock.size];
  const shown = usePanelPresence().shown[panel];
  const saveSize = useUserSettings((settings) => settings[dock.saveSize]);
  // A panel that slides is not where its stand-in is.
  const isInPlace = useReading(() => shown.get() === 1);

  return (
    <PanelResizer
      edge={dock.edge}
      size={size}
      isInPlace={isInPlace}
      minSize={dock.minSize}
      maxSize={dock.maxSize}
      label={dock.label}
      paintsBorder
      onCommit={saveSize}
    >
      {children}
    </PanelResizer>
  );
};

/**
 * The separators that resize the panels docked around the canvas. They fill
 * the element they are in, which lies over the canvas workspace.
 *
 * The resizers nest the way the panels sit: the left sidebar beside
 * everything else, the bottom panel under what is left, and the properties
 * panel beside the canvas. A press where two separators cross resizes both
 * panels.
 */
export const DockResizers = () => (
  <DockResizer panel="leftSidebar">
    <DockResizer panel="bottomPanel">
      <DockResizer panel="propertiesPanel" />
    </DockResizer>
  </DockResizer>
);
