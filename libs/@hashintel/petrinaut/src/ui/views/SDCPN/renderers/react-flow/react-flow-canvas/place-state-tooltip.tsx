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
 * The button's diameter. Half of it is the toolbar offset that lands its
 * centre on the node's edge, so the two have to be stated together.
 */
const TRIGGER_SIZE_PX = 22;

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
  /*
   * The box's corner radius, and the source every nested corner is measured
   * from. A shape inset by `n` from the box curves at this radius minus `n`,
   * which keeps the curves parallel instead of letting the tighter ones
   * crowd inside the wider ones. Derived in CSS rather than restated, so
   * changing this one number moves the whole set.
   */
  "--visualizer-radius": "[14px]",
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
  /*
   * The artwork reaches the border rather than sitting in a frame of padding.
   * A visualizer draws its own background, square to its viewBox, and inside
   * a padded box that square corner sat visibly within the box's rounded
   * one. Scrolling clips to the padding box, which follows the radius, so
   * with no padding the artwork's corners simply become the box's.
   */
  overflow: "auto",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "[var(--visualizer-radius)]",
  boxShadow: "[0px 8px 24px rgba(0, 0, 0, 0.16)]",
});

/**
 * The button that pointing at a place offers, before the visualizer itself.
 *
 * A place's picture is worth a panel, and a panel that opens on hover alone
 * covers the net while somebody is only passing over it. So the hover offers
 * this instead: one small round button, astride the node's edge, and the
 * panel is what clicking it produces.
 *
 * The white surface belongs to this wrapper, not to the button inside it.
 * Every button variant in the system paints its hover in translucent ink
 * meant for the app's own background, and that ink beats a background set on
 * the button itself, so the opaque surface lives here and the ink lands on
 * it. Sitting astride the node's edge, the button needs none of the panel's
 * padding: the pointer reaches it off the node without crossing the canvas.
 */
const triggerStyle = css({
  display: "flex",
  // Sized here rather than by the button's own scale, because half of it is
  // the offset that centres it on the node's edge.
  width: "[22px]",
  height: "[22px]",
  borderRadius: "full",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  boxShadow: "[0 1px 4px rgba(0, 0, 0, 0.18)]",
  transition: "[background-color 120ms ease, box-shadow 120ms ease]",
  // The response to being pointed at is the surface warming and lifting. The
  // button's own hover ink is a fortieth of black, which over white is not a
  // response at all.
  _hover: {
    backgroundColor: "neutral.s30",
    boxShadow: "[0 2px 6px rgba(0, 0, 0, 0.22)]",
  },
  // As on the pin: the ring belongs out here, where nothing clips it and the
  // button's own at no offset would be lost in the rim.
  "&:has(:focus-visible)": {
    outline: "[2px solid rgba(255, 255, 255, 0.95)]",
    outlineOffset: "[1px]",
    boxShadow: "[0 0 0 5px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.18)]",
  },
});

/** Fills the surface, less its 1px rim. */
const triggerButtonStyle = css({
  width: "[20px]",
  minWidth: "[20px]",
  height: "[20px]",
  padding: "[0]",
});

/** A further 1px inside the glass, for the glass's own border. */
const pinButtonStyle = css({
  borderRadius: "[calc(var(--visualizer-radius) - 9px)]",
});

/**
 * The pin sits over the visualizer's top-right corner rather than beside it,
 * so the box stays the size of the artwork.
 *
 * A pane of frosted glass around the button, not the button's own surface: a
 * visualizer draws whatever it likes underneath — black, in the satellites
 * example — and every button variant in the system paints in translucent ink
 * meant for the app's own background, so a bare glyph disappears into the
 * artwork. Blurring what is behind it and tinting that pale gives the glass
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
    // Inset 8px from the box's corner, so it curves 8px tighter.
    borderRadius: "[calc(var(--visualizer-radius) - 8px)]",
    // A rim of light rather than a drawn border: it reads against a dark
    // artwork and dissolves into a pale one.
    border: "[1px solid rgba(255, 255, 255, 0.5)]",
    boxShadow: "[0 1px 3px rgba(0, 0, 0, 0.14)]",
    backdropFilter: "[blur(8px) saturate(140%)]",
    transition: "[opacity 120ms ease, background-color 150ms ease]",
    /*
     * The focus ring belongs to the glass, not to the button inside it: the
     * button draws its own at no offset, which lands on the glass's rim and is
     * indistinguishable from it.
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
    openVisualizerPlaceId,
    toggleVisualizerPin,
    openPlaceVisualizer,
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
    !node
  ) {
    return null;
  }

  const pinned = pinnedVisualizerPlaceIds.has(nodeId);
  // Pinning outlasts the hover; opening belongs to it. Either shows the
  // panel, and until one of them does, the hover shows the button that opens
  // it. The module that draws a visualizer is only needed for the panel, so
  // the button is offered while it is still loading.
  const showVisualizer =
    (pinned || openVisualizerPlaceId === nodeId) &&
    PlaceStateVisualization !== null;

  const nodeTopY = flowToScreenPosition({
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
  }).y;

  // Above-placed box grows upward from the node's top edge; flip below if its
  // top would intrude into the top bar's zone. Decided against what is about
  // to show: the box's own height, or the button's once the box is closed,
  // since the last measured box height outlives the box.
  const shownHeight = showVisualizer ? (boxSize?.height ?? 0) : TRIGGER_SIZE_PX;
  const placeBelow =
    nodeTopY - TOOLTIP_OFFSET_PX - shownHeight < TOP_BAR_SAFE_ZONE_PX;

  const keepHovered = {
    // Both surfaces count as part of the place while the pointer is on them:
    // without this, reaching for either would end the hover and take it away.
    onPointerEnter: () => setHoveredItem({ type: "place", id: nodeId }),
    /*
     * Leaving onto a node is not leaving: the toolbar is a portal inside the
     * node's React subtree, so returning to the node fires this leave with no
     * enter to follow. Another node's own enter sets the hover for it.
     */
    onPointerLeave: (event: React.PointerEvent) => {
      const landedOn = event.relatedTarget;
      if (
        landedOn instanceof Element &&
        landedOn.closest(".react-flow__node") !== null
      ) {
        return;
      }
      clearHoveredItem();
    },
  };

  if (!showVisualizer) {
    return (
      <NodeToolbar
        nodeId={nodeId}
        isVisible
        position={placeBelow ? Position.Bottom : Position.Top}
        // Half the button back towards the node, which puts its centre on the
        // node's edge.
        offset={-TRIGGER_SIZE_PX / 2}
      >
        <div className={triggerStyle} {...keepHovered}>
          <Button
            className={triggerButtonStyle}
            size="xs"
            variant="ghost"
            shape="round"
            iconName="eye"
            aria-label="Show state visualizer"
            tooltip="Show state visualizer"
            // The button is a portal but still a child of the node in the
            // React tree, so without this a click on it also selects the
            // place and opens its properties.
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openPlaceVisualizer(nodeId);
            }}
          />
        </div>
      </NodeToolbar>
    );
  }

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
        {...keepHovered}
        // The box is a portal but still a child of the node in the React
        // tree, so without this a press or a click anywhere on it, the
        // artwork, its scrollbar or the pin, also selects the place and opens
        // its properties.
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div ref={contentRef} className={tooltipStyle}>
          <PlaceStateVisualization place={place} placeType={placeType} />
        </div>
        <div className={cx(pinStyle({ pinned }), PIN_CLASS)}>
          <Button
            className={pinButtonStyle}
            size="xxs"
            variant="ghost"
            prefix={<PinIcon />}
            aria-label={
              pinned ? "Unpin state visualizer" : "Pin state visualizer"
            }
            aria-pressed={pinned}
            tooltip={pinned ? "Unpin" : "Keep open while you work"}
            onClick={() => toggleVisualizerPin(nodeId)}
          />
        </div>
      </div>
    </NodeToolbar>
  );
};
