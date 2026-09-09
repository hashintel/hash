import {
  NodeToolbar,
  Position,
  useInternalNode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { use, useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { PinIcon } from "../../../../../components/pin-icon";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";

/**
 * The module that draws a visualizer, loaded on demand and remembered.
 *
 * It carries the compiler for user code, so it stays out of the canvas's own
 * chunk. Loaded through state rather than `lazy` and a boundary inside the
 * box: a boundary there lets the box mount and measure itself empty, and the
 * retry that brings the artwork in re-renders only the suspended subtree, so
 * the size the box opens at is never corrected. Held here, the box does not
 * exist until it has something to draw.
 */
type PlaceStateVisualizationComponent =
  (typeof import("../../../../shared/place-state-visualization"))["PlaceStateVisualization"];

let loadedVisualization: PlaceStateVisualizationComponent | null = null;
let pendingVisualization: Promise<PlaceStateVisualizationComponent> | null =
  null;

const loadVisualization = () => {
  pendingVisualization ??=
    import("../../../../shared/place-state-visualization").then((module) => {
      loadedVisualization = module.PlaceStateVisualization;
      return module.PlaceStateVisualization;
    });
  return pendingVisualization;
};

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

/**
 * The box grows out of the node it belongs to.
 *
 * It has to be measured before it can be placed, so it starts hidden either
 * way; opening from just under full size turns that first frame into the
 * start of a movement rather than a flash. The origin is the edge nearest the
 * node, set by the caller, so the box appears to come from the place rather
 * than from its own middle.
 */
const wrapperStyle = css({
  display: "flex",
  position: "relative",
  opacity: "[0]",
  transform: "[scale(0.96)]",
  pointerEvents: "none",
  "&[data-open='true']": {
    opacity: "[1]",
    transform: "[scale(1)]",
    pointerEvents: "auto",
  },
  "&[data-animated='true']": {
    transition:
      "[opacity 120ms ease-out, transform 160ms cubic-bezier(0.2, 0.9, 0.25, 1)]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  // Pointing anywhere at the box brings its pin forward, and so does reaching
  // it by keyboard.
  "&:hover .place-visualizer-pin": {
    opacity: "[1]",
  },
  "&:focus-within .place-visualizer-pin": {
    opacity: "[1]",
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
 * so the box stays the size of the artwork.
 *
 * A pane of frosted glass around the button, not the button's own surface: a
 * visualizer draws whatever it likes underneath — black, in the satellites
 * example — and every button variant in the system paints in translucent ink
 * meant for the app's own background, so a bare glyph disappears into the
 * artwork. Blurring what is behind it and tinting that pale gives the disc
 * the artwork's own colour while lifting it enough for a dark glyph to read
 * over anything, and leaves the button's hover and pressed ink to sit on top
 * of it as designed.
 *
 * Held back until the pointer or the keyboard reaches the box, and at full
 * strength while pinned, which is when it has to be found again to release
 * it.
 *
 * Anchored on the wrapper rather than inside the box, so it keeps its corner
 * while a tall visualizer scrolls underneath.
 */
const pinStyle = cva({
  base: {
    position: "absolute",
    // 8px inside the box's top-right corner. The 12px on top clears the
    // wrapper's own padding, which holds the gap to the node, so it has to
    // stay in step with `TOOLTIP_OFFSET_PX`.
    top: "[20px]",
    right: "[8px]",
    display: "flex",
    // The button's own radius, so the disc and the ink it holds share a
    // corner.
    borderRadius: "md",
    // A rim of light rather than a drawn border: it reads against a dark
    // artwork and dissolves into a pale one.
    border: "[1px solid rgba(255, 255, 255, 0.5)]",
    boxShadow: "[0 1px 3px rgba(0, 0, 0, 0.14)]",
    backdropFilter: "[blur(8px) saturate(140%)]",
    transition: "[opacity 120ms ease, background-color 150ms ease]",
    /*
     * The focus ring belongs to the disc, not to the button inside it: the
     * button draws its own at no offset, which lands on the disc's rim and is
     * indistinguishable from it. Ringing the disc from outside also means
     * nothing has to be clipped to keep the button's ink in, which is what
     * erased the ring in the first place.
     */
    "&:has(:focus-visible)": {
      // Two tones, because the ring floats over the visualizer's artwork:
      // the light one carries a dark picture, the dark halo beyond it carries
      // a pale one, and neither can go missing.
      outline: "[2px solid rgba(255, 255, 255, 0.95)]",
      outlineOffset: "[1px]",
      boxShadow:
        "[0 0 0 5px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.14)]",
    },
  },
  variants: {
    pinned: {
      true: {
        opacity: "[1]",
        backgroundColor: "[rgba(255, 255, 255, 0.86)]",
      },
      false: {
        opacity: "[0.72]",
        backgroundColor: "[rgba(255, 255, 255, 0.46)]",
      },
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
  const { showAnimations } = use(UserSettingsContext);
  const {
    pinnedVisualizerPlaceIds,
    toggleVisualizerPin,
    setHoveredItem,
    clearHoveredItem,
  } = use(EditorContext);

  const node = useInternalNode(nodeId);
  const { flowToScreenPosition } = useReactFlow();
  useViewport();

  // Both the initial value and the setter are wrapped: a component is a
  // function, and React would take a bare one for a lazy initialiser or a
  // state updater and call it with no props.
  const [PlaceStateVisualization, setPlaceStateVisualization] =
    useState<PlaceStateVisualizationComponent | null>(
      () => loadedVisualization,
    );

  useEffect(() => {
    if (PlaceStateVisualization) {
      return;
    }
    let cancelled = false;
    void loadVisualization().then((component) => {
      if (!cancelled) {
        setPlaceStateVisualization(() => component);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [PlaceStateVisualization]);

  const contentRef = useRef<HTMLDivElement>(null);
  // The border box: the flip below decides against the height the box
  // actually occupies, padding and border included.
  const boxSize = useElementSize(contentRef, { box: "border" });

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
    !node ||
    !PlaceStateVisualization
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
        data-animated={showAnimations}
        data-open={boxSize !== null}
        style={{
          // The gap between node and box is the wrapper's own padding, so the
          // pointer crosses it without touching the canvas.
          padding: `${TOOLTIP_OFFSET_PX}px 0`,
          // Grows from whichever edge faces the node.
          transformOrigin: placeBelow ? "top center" : "bottom center",
        }}
        // The box counts as part of the place while the pointer is on it:
        // without this, reaching for the pin would end the hover and take the
        // box with it.
        onPointerEnter={() => setHoveredItem({ type: "place", id: nodeId })}
        onPointerLeave={clearHoveredItem}
      >
        <div ref={contentRef} className={tooltipStyle}>
          <PlaceStateVisualization place={place} placeType={placeType} />
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
