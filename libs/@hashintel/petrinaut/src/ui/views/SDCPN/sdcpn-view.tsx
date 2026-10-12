/**
 * @layerRoot ui.views.canvas
 * @role Renders the net as an interactive graph, with node and arc interaction
 */

import { use, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { CanvasFrameStoreProvider } from "./canvas-frame-store";
import { canvasRenderers, defaultCanvasRenderer } from "./canvas-renderers";
import { CursorTooltip } from "./components/cursor-tooltip";
import { useContainerSize } from "./hooks/util/use-container-size";
import { useCanvasScene } from "./use-canvas-scene";

import type { CanvasController } from "./canvas-renderer";

const containerSizeSettleMs = 100;

const canvasContainerStyle = css({
  width: "[100%]",
  height: "[100%]",
  position: "relative",
});

const ignoreControllerChange = (_controller: CanvasController | null) => {};

/**
 * SDCPNView builds the renderer-agnostic scene for the active net and hands
 * it to the active canvas renderer. It measures the canvas container and only
 * mounts the renderer once the size is known, so the net renders centered
 * from its very first frame. Switching to another net remounts the frame
 * store and the renderer under it, so the store holds only the new net's
 * transitions and the renderer centers on the new net.
 */
export const SDCPNView: React.FC<{
  onControllerChange?: (controller: CanvasController | null) => void;
}> = ({ onControllerChange = ignoreControllerChange }) => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(
    canvasContainer,
    containerSizeSettleMs,
  );
  const { petriNetId } = use(SDCPNContext);
  const scene = useCanvasScene(canvasContainer);
  const Renderer = canvasRenderers[defaultCanvasRenderer];

  return (
    <div ref={canvasContainer} className={canvasContainerStyle}>
      {containerSize && (
        <CanvasFrameStoreProvider key={petriNetId}>
          <Renderer
            scene={scene}
            containerSize={containerSize}
            registerController={onControllerChange}
          />
        </CanvasFrameStoreProvider>
      )}
      <CursorTooltip />
    </div>
  );
};
