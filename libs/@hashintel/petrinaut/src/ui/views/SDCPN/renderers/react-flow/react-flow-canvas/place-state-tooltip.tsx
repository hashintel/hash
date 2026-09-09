import {
  NodeToolbar,
  Position,
  useInternalNode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { lazy, Suspense, use, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { PinIcon } from "../../../../../components/pin-icon";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";

const DeferredPlaceStateVisualization = lazy(async () => {
  const { PlaceStateVisualization } =
    await import("../../../../shared/place-state-visualization");
  return { default: PlaceStateVisualization };
});

// Gap between the node and the box, in screen pixels. Held as padding on the
// wrapper rather than as the toolbar's offset, so the pointer can cross from
// the node to the box without passing over the canvas and ending the hover.
const TOOLTIP_OFFSET_PX = 12;

// Screen-space height of the top bar; the box flips below the node rather than
// disappear behind it when placing it above would intrude into this zone.
const TOP_BAR_SAFE_ZONE_PX = 72;

const wrapperStyle = css({
  display: "flex",
});

const tooltipStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "[4px]",
  maxWidth: "[90vw]",
  maxHeight: "[80vh]",
  overflow: "auto",
  padding: "[4px]",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "md",
  boxShadow: "[0px 8px 24px rgba(0, 0, 0, 0.16)]",
});

/**
 * Box surfacing a colored place's custom visualizer on the canvas.
 *
 * It follows the pointer by default and closes with the hover. Pinning holds
 * it open instead, so it can be watched while the timeline is scrubbed or the
 * place's initial state edited.
 */
export const PlaceStateTooltip: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const presentation = usePetrinautPresentation();
  const { petriNetDefinition } = use(SDCPNContext);
  const {
    pinnedVisualizerPlaceIds,
    toggleVisualizerPin,
    setHoveredItem,
    clearHoveredItem,
  } = use(EditorContext);

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
    !presentation.showCustomVisualizers ||
    !place ||
    !placeType ||
    placeType.elements.length === 0 ||
    !place.visualizerCode ||
    !node
  ) {
    return null;
  }

  const pinned = pinnedVisualizerPlaceIds.has(nodeId);

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
      offset={0}
    >
      <div
        className={wrapperStyle}
        // The gap between node and box is the wrapper's own padding, so the
        // pointer crosses it without touching the canvas.
        style={{ padding: `${TOOLTIP_OFFSET_PX}px 0` }}
        // The box counts as part of the place while the pointer is on it:
        // without this, reaching for the pin would end the hover and take the
        // box with it.
        onPointerEnter={() => setHoveredItem({ type: "place", id: nodeId })}
        onPointerLeave={clearHoveredItem}
      >
        <div
          ref={contentRef}
          className={tooltipStyle}
          // Hide until measured so a tall box near the top never flashes behind
          // the top bar before the above/below decision settles.
          style={{ opacity: boxSize ? 1 : 0 }}
        >
          <Suspense fallback={null}>
            <DeferredPlaceStateVisualization
              place={place}
              placeType={placeType}
            />
          </Suspense>
          <Button
            size="xxs"
            variant="ghost"
            prefix={<PinIcon />}
            aria-label={
              pinned ? "Unpin state visualizer" : "Pin state visualizer"
            }
            aria-pressed={pinned}
            tooltip={pinned ? "Unpin" : "Keep open while you work"}
            // The box is a portal but still a child of the node in the React
            // tree, so without this a click on the pin also selects the place
            // and opens its properties.
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleVisualizerPin(nodeId);
            }}
          />
        </div>
      </div>
    </NodeToolbar>
  );
};
