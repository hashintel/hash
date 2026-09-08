import { use, useRef, type FC } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { PlaceStateVisualization } from "../../../../shared/place-state-visualization";
import {
  sceneToScreen,
  useViewport,
  type ViewportStore,
} from "./viewport-store";

import type { CanvasPlaceNode } from "../../../canvas-scene";

// Gap between the node and the box, in screen pixels.
const tooltipOffsetPx = 12;

// Screen-space height of the top bar; the box flips below the node rather than
// disappear behind it when placing it above would intrude into this zone.
const topBarSafeZonePx = 72;

const tooltipStyle = css({
  position: "absolute",
  display: "flex",
  maxWidth: "[90vw]",
  maxHeight: "[80vh]",
  overflow: "auto",
  padding: "[4px]",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "md",
  boxShadow: "[0px 8px 24px rgba(0, 0, 0, 0.16)]",
  pointerEvents: "none",
  zIndex: "[5]",
});

/**
 * Hover box surfacing a colored place's custom visualizer, positioned over
 * the canvas from the node's scene position.
 */
export const PixiPlaceStateTooltip: FC<{
  node: CanvasPlaceNode;
  viewport: ViewportStore;
}> = ({ node, viewport }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const current = useViewport(viewport);
  const contentRef = useRef<HTMLDivElement>(null);
  const boxSize = useElementSize(contentRef);

  const place = petriNetDefinition.places.find(({ id }) => id === node.id);
  const placeType = place?.colorId
    ? (petriNetDefinition.types.find(({ id }) => id === place.colorId) ?? null)
    : null;

  if (
    !place ||
    !placeType ||
    placeType.elements.length === 0 ||
    !place.visualizerCode
  ) {
    return null;
  }

  const top = sceneToScreen(current, {
    x: node.position.x,
    y: node.position.y - node.height / 2,
  });
  const bottom = sceneToScreen(current, {
    x: node.position.x,
    y: node.position.y + node.height / 2,
  });
  const boxHeight = boxSize?.height ?? 0;
  const boxWidth = boxSize?.width ?? 0;
  const placeBelow = top.y - tooltipOffsetPx - boxHeight < topBarSafeZonePx;

  return (
    <div
      ref={contentRef}
      className={tooltipStyle}
      style={{
        left: top.x - boxWidth / 2,
        top: placeBelow
          ? bottom.y + tooltipOffsetPx
          : top.y - tooltipOffsetPx - boxHeight,
        // Hide until measured so a tall box near the top never flashes behind
        // the top bar before the above/below decision settles.
        opacity: boxSize ? 1 : 0,
      }}
    >
      <PlaceStateVisualization place={place} placeType={placeType} />
    </div>
  );
};
