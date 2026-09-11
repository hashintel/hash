import { MiniMap as ReactFlowMiniMap, useStore } from "@xyflow/react";
import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { useCanvasInsets } from "../../../../../hooks/use-canvas-insets";
import { miniMapFocusColor } from "../../../styles/focus";
import { miniMapPlaceFillColor } from "../../../styles/type-colors";

import type { NodeType } from "./react-flow-types";
import type { MiniMapNodeProps, MiniMapProps } from "@xyflow/react";

const miniMapClassName = css({
  backgroundColor: "white.a95",
  borderRadius: "md",
  backdropFilter: "[blur(20px)]",
  "& svg": {
    borderRadius: "md",
  },
});

const SHAPE_SIZE = 90;
const TRANSITION_WIDTH_RATIO = 1.5;
const DEFAULT_TRANSITION_FILL = "#6b7280";
const DEFAULT_COMPONENT_FILL = "#0f766e";
/** Thick and solid: at map scale a ring has to carry the whole signal. */
const FOCUS_STROKE_WIDTH = 22;

/**
 * Custom node renderer for the MiniMap.
 * Renders place nodes as circles and transition nodes as rectangles, carrying
 * the canvas's focus roles: a shape at the focused item is boxed in the
 * role's colour and the rest of the net drops far back, so a glance at the
 * map answers "where is this neighbourhood" on a net larger than the screen.
 * The map is too small for the canvas's white band, so the box and the fade
 * carry it alone.
 */
const MiniMapNode: React.FC<MiniMapNodeProps> = ({ id, x, y }) => {
  // MiniMapNodeProps doesn't include node data, so we look it up from the store
  const node = useStore(
    (state) => state.nodeLookup.get(id) as NodeType | undefined,
  );

  if (!node) {
    return null;
  }

  // Compute colors based on node type and type color
  const fill =
    node.data.kind === "place"
      ? miniMapPlaceFillColor(node.data.typeColor)
      : node.data.kind === "componentInstance"
        ? DEFAULT_COMPONENT_FILL
        : DEFAULT_TRANSITION_FILL;

  const focus = node.selected ? "focused" : node.data.focus;
  const ringColor = miniMapFocusColor(focus);
  // The pane fades the shapes outside the neighbourhood, keyed off these
  // classes, so a hover leaves every other shape's props untouched.
  const shapeClass =
    ringColor === undefined
      ? "minimap-shape"
      : "minimap-shape canvas-focus-role";
  const shapeStyle = {
    fill,
    stroke: ringColor ?? "none",
    strokeWidth: ringColor === undefined ? 0 : FOCUS_STROKE_WIDTH,
    // Solid, and painted outside the shape rather than straddling its edge,
    // so the box reads as a box and the fill stays the token type's colour.
    strokeOpacity: 1,
    paintOrder: "stroke",
  };

  if (node.data.kind === "place") {
    return (
      <circle
        cx={x + SHAPE_SIZE / 2}
        cy={y + SHAPE_SIZE / 2}
        r={SHAPE_SIZE / 2}
        className={shapeClass}
        style={shapeStyle}
      />
    );
  }

  if (node.data.kind === "componentInstance") {
    return (
      <rect
        x={x - SHAPE_SIZE}
        y={y - SHAPE_SIZE / 2}
        width={SHAPE_SIZE * TRANSITION_WIDTH_RATIO}
        height={SHAPE_SIZE}
        rx={12}
        className={shapeClass}
        style={shapeStyle}
      />
    );
  }

  return (
    <rect
      x={x - SHAPE_SIZE}
      y={y - SHAPE_SIZE / TRANSITION_WIDTH_RATIO}
      width={SHAPE_SIZE * TRANSITION_WIDTH_RATIO}
      height={SHAPE_SIZE}
      className={shapeClass}
      style={shapeStyle}
    />
  );
};

/**
 * A wrapper around ReactFlow's MiniMap with custom styling.
 * Renders place nodes as circles and transition nodes as rectangles.
 * Positions at the top right, clear of panels over the canvas.
 */
export const MiniMap: React.FC<Omit<MiniMapProps, "style">> = (props) => {
  const { isPanelAnimating } = use(EditorContext);
  const canvasInsets = useCanvasInsets();
  // True inset from the canvas edges (react-flow's default 15px panel margin
  // is zeroed below) — matches the viewport controls' offset.
  const minimapOffset = 12;

  return (
    <ReactFlowMiniMap
      {...props}
      ariaLabel=""
      className={miniMapClassName}
      style={{
        margin: 0,
        top: minimapOffset,
        right: minimapOffset + canvasInsets.right,
        bottom: "auto",
        left: "auto",
        width: 116,
        height: 65,
        transition: isPanelAnimating ? "right 150ms ease-in-out" : undefined,
      }}
      maskColor="rgba(0, 0, 0, 0.15)"
      maskStrokeWidth={0}
      nodeComponent={MiniMapNode}
      offsetScale={2}
    />
  );
};
