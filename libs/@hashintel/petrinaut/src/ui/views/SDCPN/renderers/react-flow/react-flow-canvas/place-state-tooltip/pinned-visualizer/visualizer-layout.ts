import { getOutlineAttachment } from "../../shared/outline-arcs";

import type { FloatingResizeDirection } from "../../../../../../shared/floating-resize-handles";
import type { VisibleSceneRect } from "../../../../../canvas-viewport";
import type { Rect, Size } from "@hashintel/petrinaut-core";
import type { XYPosition } from "@xyflow/react";

/** Position is in canvas coordinates; size is in screen pixels. */
export type VisualizerLayout = { position: XYPosition; size: Size };
export type VisualizerAction = "move" | FloatingResizeDirection;

const minimumSize = { width: 180, height: 120 };

export const getVisualizerBounds = (
  { position, size }: VisualizerLayout,
  zoom: number,
): Rect => ({
  ...position,
  width: size.width / zoom,
  height: size.height / zoom,
});

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
  viewport: VisibleSceneRect,
): VisualizerLayout => {
  const width = Math.max(1, initialSize?.width ?? 320);
  const height = Math.max(1, initialSize?.height ?? 240);
  const scale = Math.max(
    minimumSize.width / width,
    minimumSize.height / height,
    Math.min(1, 480 / width, 400 / height),
  );
  const size = { width: width * scale, height: height * scale };
  const bounds = getVisualizerBounds({ position: node, size }, viewport.zoom);
  const gap = 16 / viewport.zoom;
  const centeredX = node.x + (node.width - bounds.width) / 2;
  const centeredY = node.y + (node.height - bounds.height) / 2;
  const candidates = [
    { x: centeredX, y: node.y - bounds.height - gap },
    { x: node.x + node.width + gap, y: centeredY },
    { x: centeredX, y: node.y + node.height + gap },
    { x: node.x - bounds.width - gap, y: centeredY },
  ];
  const visibleArea = (position: XYPosition) =>
    intersectionArea({ ...bounds, ...position }, viewport);
  const best = candidates.reduce((chosen, candidate) =>
    visibleArea(candidate) > visibleArea(chosen) ? candidate : chosen,
  );
  return {
    size,
    position: {
      x: Math.max(
        viewport.x,
        Math.min(best.x, viewport.x + viewport.width - bounds.width),
      ),
      y: Math.max(
        viewport.y,
        Math.min(best.y, viewport.y + viewport.height - bounds.height),
      ),
    },
  };
};

export const updateVisualizerLayout = (
  layout: VisualizerLayout,
  action: VisualizerAction,
  delta: XYPosition,
  zoom: number,
): VisualizerLayout => {
  if (action === "move") {
    return {
      ...layout,
      position: {
        x: layout.position.x + delta.x / zoom,
        y: layout.position.y + delta.y / zoom,
      },
    };
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
  const scale = Math.max(
    minimumSize.width / width,
    minimumSize.height / height,
    1 + change,
  );
  const size = { width: width * scale, height: height * scale };
  return {
    size,
    position: {
      x:
        layout.position.x +
        ((width - size.width) *
          (horizontal < 0 ? 1 : horizontal > 0 ? 0 : 0.5)) /
          zoom,
      y:
        layout.position.y +
        ((height - size.height) * (vertical < 0 ? 1 : vertical > 0 ? 0 : 0.5)) /
          zoom,
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

export const getVisualizerConnector = (
  node: Rect,
  panel: Rect,
  zoom: number,
) =>
  intersectionArea(node, panel) > 0
    ? null
    : {
        start: edgePoint(node, panel, Math.min(node.width, node.height) / 2),
        end: edgePoint(panel, node, 14 / zoom),
      };
