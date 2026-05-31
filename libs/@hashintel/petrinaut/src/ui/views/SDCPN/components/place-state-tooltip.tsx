import {
  NodeToolbar,
  Position,
  useInternalNode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { use, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../react/hooks/use-element-size";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { PlaceStateVisualization } from "../../shared/place-state-visualization";

// Gap between the node and the box, in screen pixels.
const TOOLTIP_OFFSET_PX = 12;

// Screen-space height of the top bar; the box flips below the node rather than
// disappear behind it when placing it above would intrude into this zone.
const TOP_BAR_SAFE_ZONE_PX = 72;

const tooltipStyle = css({
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
});

/**
 * Hover box surfacing a colored place's custom visualizer on the canvas.
 */
export const PlaceStateTooltip: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { petriNetDefinition } = use(SDCPNContext);

  const node = useInternalNode(nodeId);
  const { flowToScreenPosition } = useReactFlow();
  useViewport();

  const contentRef = useRef<HTMLDivElement>(null);
  const boxSize = useElementSize(contentRef);

  const place = petriNetDefinition.places.find((pl) => pl.id === nodeId);
  const placeType = place?.colorId
    ? (petriNetDefinition.types.find((tp) => tp.id === place.colorId) ?? null)
    : null;

  if (
    !place ||
    !placeType ||
    placeType.elements.length === 0 ||
    !place.visualizerCode ||
    !node
  ) {
    return null;
  }

  const nodeTopY = flowToScreenPosition({
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
  }).y;

  // Above-placed box grows upward from the node's top edge; flip below if its
  // top would intrude into the top bar's zone.
  const boxHeight = boxSize?.height ?? 0;
  const placeBelow =
    nodeTopY - TOOLTIP_OFFSET_PX - boxHeight < TOP_BAR_SAFE_ZONE_PX;

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible
      position={placeBelow ? Position.Bottom : Position.Top}
      offset={TOOLTIP_OFFSET_PX}
    >
      <div
        ref={contentRef}
        className={tooltipStyle}
        // Hide until measured so a tall box near the top never flashes behind
        // the top bar before the above/below decision settles.
        style={{ opacity: boxSize ? 1 : 0 }}
      >
        <PlaceStateVisualization place={place} placeType={placeType} />
      </div>
    </NodeToolbar>
  );
};
