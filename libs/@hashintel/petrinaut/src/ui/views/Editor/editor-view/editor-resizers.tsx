import { css } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import {
  MAX_AI_ASSISTANT_WIDTH,
  MIN_AI_ASSISTANT_WIDTH,
} from "../../../constants/ui";
import { useReading } from "../../../lib/readings";
import { PanelResizer } from "../../../resize/panel-resizer";
import { docks, type DockName } from "../shared/docks";

import type { ReactNode } from "react";

// Over the editor's row, and out of the pointer's way everywhere but on the
// separators. It has no place in the stacking order of its own: the docks'
// separators and the assistant's sit at different heights.
const layerStyle = css({
  position: "absolute",
  inset: "[0]",
  pointerEvents: "none",
});

// Over the panels docked around the canvas, and under what floats over the
// editor: the bottom bar and an assistant that is a window.
const docksStyle = css({
  position: "relative",
  zIndex: "sticky",
});

// Over the docked assistant, whose edge the separator straddles.
const assistantSeparatorStyle = css({
  zIndex: "[calc(var(--z-index-sticky) + 3)]",
});

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
 * The separators that resize what is docked in the editor, in one layer over
 * the editor's row.
 *
 * The resizers nest the way the panels sit: the AI assistant beside the
 * workspace and, while the canvas shows, the left sidebar beside everything
 * else, the bottom panel under what is left, and the properties panel beside
 * the canvas. A press where two separators cross resizes both panels.
 */
export const EditorResizers = ({ canvasShows }: { canvasShows: boolean }) => {
  const { aiAssistantWidth } = usePanelSizes();
  const presence = usePanelPresence();
  // Docked, fully in view, and with the room beside the workspace its own:
  // only then is the assistant's edge where its stand-in's is.
  const isAssistantInPlace = useReading(() => {
    const shown = presence.shown.aiAssistant.get();
    const docked = presence.aiAssistantDocked.get();
    const hasRoom = presence.aiAssistantHasRoom.get();
    return shown === 1 && docked === 1 && hasRoom === 1;
  });

  return (
    <PanelResizer
      edge="right"
      size={aiAssistantWidth}
      isInPlace={isAssistantInPlace}
      minSize={MIN_AI_ASSISTANT_WIDTH}
      maxSize={MAX_AI_ASSISTANT_WIDTH}
      label="Resize AI assistant"
      className={layerStyle}
      restClassName={docksStyle}
      separatorClassName={assistantSeparatorStyle}
    >
      {canvasShows && (
        <DockResizer panel="leftSidebar">
          <DockResizer panel="bottomPanel">
            <DockResizer panel="propertiesPanel" />
          </DockResizer>
        </DockResizer>
      )}
    </PanelResizer>
  );
};
