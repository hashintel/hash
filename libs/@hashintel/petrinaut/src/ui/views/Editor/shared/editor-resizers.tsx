import { css } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import {
  MAX_AI_ASSISTANT_WIDTH,
  MIN_AI_ASSISTANT_WIDTH,
} from "../../../constants/ui";
import { useReading } from "../../../lib/readings";
import { PanelResizer } from "../../../resize/panel-resizer";
import { DockResizers } from "./dock-resizers";

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

/**
 * The separators that resize what is docked in the editor: the AI assistant
 * beside the workspace and, while the canvas shows, the three panels around
 * it. One layer, so that the assistant and the bottom panel share a corner
 * like the panels do among themselves.
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
      {canvasShows && <DockResizers />}
    </PanelResizer>
  );
};
