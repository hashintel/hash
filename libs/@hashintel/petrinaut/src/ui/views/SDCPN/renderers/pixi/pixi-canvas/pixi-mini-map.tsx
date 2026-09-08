import { use, useRef, type FC } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { getBoundsOfCenteredBoxes } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { PANEL_MARGIN } from "../../../../../constants/ui";
import { getViewportRect } from "../../../canvas-viewport";
import { miniMapPlaceFillColor } from "../../../styles/type-colors";
import { panBy, useViewport, type ViewportStore } from "./viewport-store";

import type { CanvasScene } from "../../../canvas-scene";
import type { Rect, Size } from "@hashintel/petrinaut-core";

const mapWidth = 116;
const mapHeight = 65;
const mapOffset = 12;
const boundsPadding = 0.1;

const defaultTransitionFill = "#6b7280";
const defaultComponentFill = "#0f766e";
const selectedColor = "#3bb9f6";
const maskColor = "rgba(0, 0, 0, 0.15)";

const mapStyle = css({
  position: "absolute",
  backgroundColor: "white.a95",
  borderRadius: "md",
  backdropFilter: "[blur(20px)]",
  overflow: "hidden",
  cursor: "grab",
  zIndex: "[4]",
  "& svg": {
    display: "block",
    borderRadius: "md",
  },
});

const union = (first: Rect, second: Rect): Rect => {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x + first.width, second.x + second.width) - x,
    height: Math.max(first.y + first.height, second.y + second.height) - y,
  };
};

/**
 * Overview of the net with the visible region cut out of a shade, as the
 * React Flow minimap draws it. Dragging the map pans the canvas.
 */
export const PixiMiniMap: FC<{
  scene: CanvasScene;
  viewport: ViewportStore;
  containerSize: Size;
}> = ({ scene, viewport, containerSize }) => {
  const { hasSelection, propertiesPanelWidth, isPanelAnimating } =
    use(EditorContext);
  const current = useViewport(viewport);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const visible = getViewportRect(containerSize, current);
  const netBounds = getBoundsOfCenteredBoxes(scene.nodes) ?? visible;
  const shown = union(netBounds, visible);
  const padX = shown.width * boundsPadding;
  const padY = shown.height * boundsPadding;
  const viewBox = {
    x: shown.x - padX,
    y: shown.y - padY,
    width: shown.width + 2 * padX,
    height: shown.height + 2 * padY,
  };
  // Scene units per map pixel, so dragging the map pans the canvas in step.
  const scale = Math.max(viewBox.width / mapWidth, viewBox.height / mapHeight);

  const panelOffset = hasSelection ? propertiesPanelWidth + PANEL_MARGIN : 0;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (!last) return;
    // Moving the map view rightwards means the canvas content moves leftwards.
    const delta = {
      x: -(event.clientX - last.x) * scale * current.zoom,
      y: -(event.clientY - last.y) * scale * current.zoom,
    };
    viewport.set(panBy(current, delta));
    dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={mapStyle}
      style={{
        top: mapOffset,
        right: mapOffset + panelOffset,
        width: mapWidth,
        height: mapHeight,
        transition: isPanelAnimating ? "right 150ms ease-in-out" : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        width={mapWidth}
        height={mapHeight}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {scene.nodes.map((node) => {
          const fill =
            node.kind === "place"
              ? miniMapPlaceFillColor(node.typeColor)
              : node.kind === "componentInstance"
                ? defaultComponentFill
                : defaultTransitionFill;
          const color = node.selected ? selectedColor : fill;
          const stroke = node.selected ? selectedColor : "none";
          return node.kind === "place" ? (
            <circle
              key={node.id}
              cx={node.position.x}
              cy={node.position.y}
              r={Math.max(node.width, node.height) / 2}
              fill={color}
              stroke={stroke}
              strokeWidth={12}
              strokeOpacity={0.4}
            />
          ) : (
            <rect
              key={node.id}
              x={node.position.x - node.width / 2}
              y={node.position.y - node.height / 2}
              width={node.width}
              height={node.height}
              rx={node.kind === "componentInstance" ? 12 : 0}
              fill={color}
              stroke={stroke}
              strokeWidth={12}
              strokeOpacity={0.4}
            />
          );
        })}
        <path
          fill={maskColor}
          fillRule="evenodd"
          d={`M${viewBox.x - viewBox.width},${viewBox.y - viewBox.height}h${viewBox.width * 3}v${viewBox.height * 3}h${-viewBox.width * 3}z M${visible.x},${visible.y}h${visible.width}v${visible.height}h${-visible.width}z`}
        />
      </svg>
    </div>
  );
};
