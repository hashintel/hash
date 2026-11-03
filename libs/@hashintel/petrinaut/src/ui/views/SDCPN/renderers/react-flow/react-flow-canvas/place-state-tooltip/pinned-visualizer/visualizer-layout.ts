import { getOutlineAttachment } from "../../shared/outline-arcs";

import type { FloatingResizeDirection } from "../../../../../../shared/floating-resize-handles";
import type { Rect, Size } from "@hashintel/petrinaut-core";
import type { XYPosition } from "@xyflow/react";

/** Position and size are in pixels relative to the Canvas container. */
export type VisualizerLayout = { position: XYPosition; size: Size };
export type VisualizerAction = "move" | FloatingResizeDirection;

const minimumSize = { width: 180, height: 120 };

export const constrainVisualizerLayout = (
  layout: VisualizerLayout,
  viewport: Rect,
): VisualizerLayout => {
  const scale = Math.min(
    1,
    viewport.width / layout.size.width,
    viewport.height / layout.size.height,
  );
  const size = {
    width: layout.size.width * scale,
    height: layout.size.height * scale,
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
  initialSize: Size | null,
  viewport: Rect,
): VisualizerLayout => {
  const width = Math.max(1, initialSize?.width ?? 320);
  const height = Math.max(1, initialSize?.height ?? 240);
  const scale = Math.max(
    minimumSize.width / width,
    minimumSize.height / height,
    Math.min(1, 480 / width, 400 / height),
  );
  const size = { width: width * scale, height: height * scale };
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
  const { width, height } = layout.size;
  const widthChange = horizontal * delta.x;
  const heightChange = vertical * delta.y;
  const change =
    Math.abs(widthChange / width) >= Math.abs(heightChange / height)
      ? widthChange / width
      : heightChange / height;
  const anchorX = fromCenter || horizontal === 0 ? 0.5 : horizontal < 0 ? 1 : 0;
  const anchorY = fromCenter || vertical === 0 ? 0.5 : vertical < 0 ? 1 : 0;
  const origin = {
    x: layout.position.x + width * anchorX,
    y: layout.position.y + height * anchorY,
  };
  const maximumScale = Math.min(
    anchorX > 0 ? (origin.x - viewport.x) / (width * anchorX) : Infinity,
    anchorX < 1
      ? (viewport.x + viewport.width - origin.x) / (width * (1 - anchorX))
      : Infinity,
    anchorY > 0 ? (origin.y - viewport.y) / (height * anchorY) : Infinity,
    anchorY < 1
      ? (viewport.y + viewport.height - origin.y) / (height * (1 - anchorY))
      : Infinity,
  );
  const scale = Math.min(
    maximumScale,
    Math.max(
      minimumSize.width / width,
      minimumSize.height / height,
      1 + change * (fromCenter ? 2 : 1),
    ),
  );
  const size = { width: width * scale, height: height * scale };
  return {
    size,
    position: {
      x: origin.x - size.width * anchorX,
      y: origin.y - size.height * anchorY,
    },
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
