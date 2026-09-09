import {
  NodeToolbar,
  Position,
  useInternalNode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { lazy, Suspense, use, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

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

/**
 * Marks the pin, so pointing at the box anywhere can raise it. Written out
 * again in the wrapper's selector below: Panda reads these style objects
 * statically, and an interpolated key would not reach the stylesheet.
 */
const PIN_CLASS = "place-visualizer-pin";

const wrapperStyle = cva({
  base: {
    display: "flex",
    position: "relative",
    "&:hover .place-visualizer-pin": {
      opacity: "[1]",
    },
    // Reaching the pin by keyboard has to bring it up too, or its focus ring
    // arrives at a third of its strength.
    "&:focus-within .place-visualizer-pin": {
      opacity: "[1]",
    },
  },
  variants: {
    // Hidden until measured, so a tall box near the top never flashes behind
    // the top bar before the above/below decision settles.
    measured: {
      true: {},
      false: {
        opacity: "[0]",
        pointerEvents: "none",
      },
    },
  },
});

const tooltipStyle = css({
  display: "flex",
  // The visualizer keeps its own height rather than being stretched to the
  // box, which is what lets a tall one scroll instead of squashing.
  alignItems: "flex-start",
  maxWidth: "[90vw]",
  maxHeight: "[80vh]",
  // Enough to hold the pin, whatever the visualizer draws: one that renders
  // nothing for an empty place would otherwise collapse to its padding and
  // leave the pin hanging outside it.
  minWidth: "[38px]",
  minHeight: "[34px]",
  overflow: "auto",
  padding: "[4px]",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "md",
  boxShadow: "[0px 8px 24px rgba(0, 0, 0, 0.16)]",
});

/**
 * The pin sits over the visualizer's top-right corner rather than beside it,
 * so the box stays the size of the artwork. It holds back until the pointer
 * arrives, and stays at full strength while pinned, which is when it has to
 * be found again to release it.
 *
 * This is a surface of its own around the button, not the button's own: a
 * visualizer draws whatever it likes underneath — black, in the satellites
 * example — and every button variant in the system paints in translucent ink
 * meant for the app's own background, so a bare glyph disappears into the
 * artwork. An opaque chip with a border reads over anything, and leaves the
 * button's hover and pressed ink to sit on top of it as designed.
 *
 * Anchored on the wrapper rather than inside the box, so it keeps its corner
 * while a tall visualizer scrolls underneath.
 */
const pinStyle = cva({
  base: {
    position: "absolute",
    // 5px inside the box's top-right corner. The 12px clears the wrapper's
    // own top padding, which holds the gap to the node, so it has to stay in
    // step with `TOOLTIP_OFFSET_PX`.
    top: "[17px]",
    right: "[5px]",
    display: "flex",
    borderRadius: "md",
    border: "[1px solid {colors.neutral.bd.solid}]",
    // Keeps the button's hover ink inside the rounded corners.
    overflow: "hidden",
    transition: "[opacity 120ms ease]",
  },
  variants: {
    pinned: {
      true: { opacity: "[1]", backgroundColor: "neutral.s20" },
      false: { opacity: "[0.3]", backgroundColor: "neutral.s00" },
    },
  },
});

/**
 * Box surfacing a colored place's custom visualizer on the canvas.
 *
 * It follows the pointer by default and closes with the hover. Pinning holds
 * it open instead, so it can be watched while the timeline is scrubbed or the
 * place's initial state edited. Before a run it shows the initial marking,
 * the same state the properties panel previews.
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
        className={wrapperStyle({ measured: boxSize !== null })}
        // The gap between node and box is the wrapper's own padding, so the
        // pointer crosses it without touching the canvas.
        style={{ padding: `${TOOLTIP_OFFSET_PX}px 0` }}
        // The box counts as part of the place while the pointer is on it:
        // without this, reaching for the pin would end the hover and take the
        // box with it.
        onPointerEnter={() => setHoveredItem({ type: "place", id: nodeId })}
        onPointerLeave={clearHoveredItem}
      >
        <div ref={contentRef} className={tooltipStyle}>
          <Suspense fallback={null}>
            <DeferredPlaceStateVisualization
              place={place}
              placeType={placeType}
            />
          </Suspense>
        </div>
        <div className={cx(pinStyle({ pinned }), PIN_CLASS)}>
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
