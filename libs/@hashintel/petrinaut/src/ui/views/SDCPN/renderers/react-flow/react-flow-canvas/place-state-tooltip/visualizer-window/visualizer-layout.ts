import { getOutlineAttachment } from "../../shared/outline-arcs";

import type { FloatingResizeDirection } from "../../../../../../shared/floating-resize-handles";
import type { Rect, Size } from "@hashintel/petrinaut-core";
import type { XYPosition } from "@xyflow/react";

/** Position and size are in pixels relative to the Canvas container. */
export type VisualizerLayout = { position: XYPosition; size: Size };
export type VisualizerAction = "move" | FloatingResizeDirection;
export type VisualizerPlacement =
  | { mode: "follow"; offset: XYPosition; size: Size }
  | { mode: "fixed"; layout: VisualizerLayout };

export const createVisualizerPlacement = (
  layout: VisualizerLayout,
  node: Rect,
  mode: VisualizerPlacement["mode"],
): VisualizerPlacement =>
  mode === "fixed"
    ? { mode, layout }
    : {
        mode,
        offset: {
          x: layout.position.x - node.x - node.width / 2,
          y: layout.position.y - node.y - node.height / 2,
        },
        size: layout.size,
      };

export const resolveVisualizerLayout = (
  placement: VisualizerPlacement,
  node: Rect,
): VisualizerLayout =>
  placement.mode === "fixed"
    ? placement.layout
    : {
        position: {
          x: node.x + node.width / 2 + placement.offset.x,
          y: node.y + node.height / 2 + placement.offset.y,
        },
        size: placement.size,
      };

const defaultSize = { width: 360, height: 240 };
const minimumSize = { width: 180, height: 120 };
const maximumSize = { width: 800, height: 600 };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const constrainVisualizerLayout = (
  layout: VisualizerLayout,
  viewport: Rect,
): VisualizerLayout => {
  const size = {
    width: clamp(
      layout.size.width,
      minimumSize.width,
      Math.min(maximumSize.width, viewport.width),
    ),
    height: clamp(
      layout.size.height,
      minimumSize.height,
      Math.min(maximumSize.height, viewport.height),
    ),
  };
  return {
    size,
    position: {
      x: Math.max(
        viewport.x,
        Math.min(layout.position.x, viewport.x + viewport.width - size.width),
      ),
      y: Math.max(
        viewport.y,
        Math.min(layout.position.y, viewport.y + viewport.height - size.height),
      ),
    },
  };
};

const intersectionArea = (first: Rect, second: Rect) =>
  Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  ) *
  Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );

export const createVisualizerLayout = (
  node: Rect,
  viewport: Rect,
): VisualizerLayout => {
  const { size } = constrainVisualizerLayout(
    { position: node, size: defaultSize },
    viewport,
  );
  const gap = 16;
  const centeredX = node.x + (node.width - size.width) / 2;
  const centeredY = node.y + (node.height - size.height) / 2;
  const candidates = [
    { x: centeredX, y: node.y - size.height - gap },
    { x: node.x + node.width + gap, y: centeredY },
    { x: centeredX, y: node.y + node.height + gap },
    { x: node.x - size.width - gap, y: centeredY },
  ];
  const visibleArea = (position: XYPosition) =>
    intersectionArea({ ...size, ...position }, viewport);
  const best = candidates.reduce((chosen, candidate) =>
    visibleArea(candidate) > visibleArea(chosen) ? candidate : chosen,
  );
  return constrainVisualizerLayout({ size, position: best }, viewport);
};

export const updateVisualizerLayout = (
  layout: VisualizerLayout,
  action: VisualizerAction,
  delta: XYPosition,
  viewport: Rect,
  fromCenter = false,
): VisualizerLayout => {
  if (action === "move") {
    return constrainVisualizerLayout(
      {
        ...layout,
        position: {
          x: layout.position.x + delta.x,
          y: layout.position.y + delta.y,
        },
      },
      viewport,
    );
  }
  const horizontal = action.includes("left")
    ? -1
    : action.includes("right")
      ? 1
      : 0;
  const vertical = action.includes("top")
    ? -1
    : action.includes("bottom")
      ? 1
      : 0;
  const resizeAxis = (axis: "x" | "y", direction: number) => {
    const dimension = axis === "x" ? "width" : "height";
    const position = layout.position[axis];
    const size = layout.size[dimension];
    const viewportStart = viewport[axis];
    const viewportSize = viewport[dimension];
    if (direction === 0) return { position, size };
    const anchor = fromCenter ? 0.5 : direction < 0 ? 1 : 0;
    const origin = position + size * anchor;
    const available = Math.min(
      maximumSize[dimension],
      anchor > 0 ? (origin - viewportStart) / anchor : Infinity,
      anchor < 1
        ? (viewportStart + viewportSize - origin) / (1 - anchor)
        : Infinity,
    );
    const nextSize = clamp(
      size + direction * delta[axis] * (fromCenter ? 2 : 1),
      minimumSize[dimension],
      available,
    );
    return { position: origin - nextSize * anchor, size: nextSize };
  };
  const horizontalAxis = resizeAxis("x", horizontal);
  const verticalAxis = resizeAxis("y", vertical);
  return {
    position: { x: horizontalAxis.position, y: verticalAxis.position },
    size: { width: horizontalAxis.size, height: verticalAxis.size },
  };
};

const edgePoint = (box: Rect, target: Rect, cornerRadius: number) => {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return getOutlineAttachment(
    { position: center, width: box.width, height: box.height, cornerRadius },
    {
      x: target.x + target.width / 2 - center.x,
      y: target.y + target.height / 2 - center.y,
    },
  ).point;
};

export const getVisualizerConnector = (node: Rect, panel: Rect) =>
  intersectionArea(node, panel) > 0
    ? null
    : {
        start: edgePoint(node, panel, Math.min(node.width, node.height) / 2),
        end: edgePoint(panel, node, 14),
      };
