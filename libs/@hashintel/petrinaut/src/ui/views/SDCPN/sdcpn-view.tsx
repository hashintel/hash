/**
 * @layerRoot ui.views.canvas
 * @role Renders the net as an interactive graph, with node and arc interaction
 */

import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from "@xyflow/react";
import { use, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { CursorTooltip } from "./components/cursor-tooltip";
import { useContainerSize } from "./hooks/util/use-container-size";
import { SDCPNCanvas } from "./sdcpn-canvas";

import type { ViewportAction } from "../../types/viewport-action";

const CONTAINER_SIZE_SETTLE_MS = 100;

const canvasContainerStyle = css({
  width: "[100%]",
  height: "[100%]",
  position: "relative",
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
});

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It measures the canvas container and only mounts the canvas once the size
 * is known, so the net renders centered from its very first frame. Switching
 * to another net remounts the canvas, centering it on the new net.
 */
export const SDCPNView: React.FC<{
  viewportActions?: ViewportAction[];
}> = ({ viewportActions }) => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(
    canvasContainer,
    CONTAINER_SIZE_SETTLE_MS,
  );

  const { petriNetId } = use(SDCPNContext);
  const { editionMode, cursorMode } = use(EditorContext);

  const isAddMode =
    editionMode === "add-place" ||
    editionMode === "add-transition" ||
    editionMode === "add-component";
  const isPanMode = editionMode === "cursor" && cursorMode === "pan";
  const paneCursor = isAddMode ? "copy" : isPanMode ? "grab" : "default";

  return (
    <div
      ref={canvasContainer}
      className={canvasContainerStyle}
      style={{
        // @ts-expect-error CSS variables work at runtime, but are not in the type system
        "--pane-cursor": paneCursor,
      }}
    >
      {containerSize && (
        <ReactFlowProvider key={petriNetId}>
          <SDCPNCanvas
            containerSize={containerSize}
            viewportActions={viewportActions}
          />
        </ReactFlowProvider>
      )}
      <CursorTooltip />
    </div>
  );
};
