import {
  useInternalNode,
  useStore,
  useViewport,
  ViewportPortal,
} from "@xyflow/react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PinIcon } from "../../../../../../components/pin-icon";
import { useCanvasInsets } from "../../../../../../hooks/use-canvas-insets";
import { FloatingResizeHandles } from "../../../../../shared/floating-resize-handles";
import { getViewportRect } from "../../../../canvas-viewport";
import { useVisualizerLayout } from "./pinned-visualizer/use-visualizer-layout";
import {
  getVisualizerBounds,
  getVisualizerConnector,
} from "./pinned-visualizer/visualizer-layout";

import type { Size } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const panelStyle = css({
  position: "absolute",
  zIndex: "[1001]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.s00",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "[14px]",
  boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.16)]",
  pointerEvents: "auto",
  transformOrigin: "top left",
  "&:hover [data-visualizer-control], &:focus-within [data-visualizer-control]":
    {
      opacity: "[1]",
    },
  "&:hover [data-visualizer-drag]": { opacity: "[1]" },
});

const pinStyle = css({
  position: "absolute",
  zIndex: "[2]",
  top: "[8px]",
  right: "[8px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s100",
  backgroundColor: "[rgba(255, 255, 255, 0.72)]",
  backdropFilter: "[blur(8px) saturate(140%)]",
  border: "[1px solid rgba(255, 255, 255, 0.5)]",
  borderRadius: "[6px]",
  boxShadow: "[0 1px 3px rgba(0, 0, 0, 0.14)]",
  opacity: "[0.55]",
  "&:has(:focus-visible)": { outline: "[2px solid {colors.blue.s80}]" },
});

const dragHandleStyle = css({
  position: "absolute",
  zIndex: "[1]",
  top: "[0]",
  left: "[0]",
  width: "[100%]",
  height: "[32px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  padding: "[0]",
  borderRadius: "[13px 13px 0 0]",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  backdropFilter: "[blur(8px) saturate(140%)]",
  color: "neutral.s100",
  opacity: "[0]",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  _active: { cursor: "grabbing", opacity: "[1]" },
  _focusVisible: { opacity: "[1]", outline: "[2px solid {colors.blue.s80}]" },
});

const contentStyle = css({
  flex: "1",
  minHeight: "[0]",
  overflow: "auto",
  borderRadius: "[inherit]",
  "& > svg": { width: "[100%]", height: "[100%]", display: "block" },
});

const connectorStyle = css({
  position: "absolute",
  top: "[0]",
  left: "[0]",
  zIndex: "[1000]",
  overflow: "visible",
  pointerEvents: "none",
  color: "neutral.s110",
});

export const PinnedVisualizer = ({
  nodeId,
  name,
  initialSize,
  onUnpin,
  children,
}: {
  nodeId: string;
  name: string;
  initialSize: Size | null;
  onUnpin: () => void;
  children: ReactNode;
}) => {
  const node = useInternalNode(nodeId);
  const viewport = useViewport();
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const insets = useCanvasInsets();
  const nodeBounds = {
    x: node?.internals.positionAbsolute.x ?? 0,
    y: node?.internals.positionAbsolute.y ?? 0,
    width: node?.measured.width ?? 1,
    height: node?.measured.height ?? 1,
  };
  const { layout, getHandleProps } = useVisualizerLayout(
    nodeBounds,
    initialSize,
    getViewportRect({ width: canvasWidth, height: canvasHeight }, viewport, {
      ...insets,
      top: 72,
      bottom: Math.max(insets.bottom, 64),
    }),
  );
  const connector = getVisualizerConnector(
    nodeBounds,
    getVisualizerBounds(layout, viewport.zoom),
    viewport.zoom,
  );

  return (
    <ViewportPortal>
      {connector && (
        <svg className={connectorStyle} width={1} height={1} aria-hidden="true">
          <line
            x1={connector.start.x}
            y1={connector.start.y}
            x2={connector.end.x}
            y2={connector.end.y}
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={connector.start.x}
            cy={connector.start.y}
            r={3 / viewport.zoom}
            fill="currentColor"
          />
        </svg>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Keep control events from selecting or dragging the source node. */}
      <div
        className={`${panelStyle} nodrag nopan nowheel`}
        style={{
          left: layout.position.x,
          top: layout.position.y,
          width: layout.size.width,
          height: layout.size.height,
          transform: `scale(${1 / viewport.zoom})`,
        }}
        role="group"
        aria-label={`${name} state visualizer`}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={dragHandleStyle}
          data-visualizer-drag
          aria-label={`Move ${name} visualizer`}
          title="Drag to move · Arrow keys to nudge"
          {...getHandleProps("move")}
        >
          <svg width="24" height="4" viewBox="0 0 24 4" aria-hidden="true">
            <rect width="24" height="4" rx="2" fill="currentColor" />
          </svg>
        </button>
        <div className={pinStyle} data-visualizer-control>
          <Button
            size="xxs"
            variant="ghost"
            prefix={<PinIcon />}
            aria-label="Unpin state visualizer"
            aria-pressed
            tooltip="Unpin"
            onClick={onUnpin}
          />
        </div>
        <div className={contentStyle}>{children}</div>
        <FloatingResizeHandles
          label={`${name} visualizer`}
          getHandleProps={(direction) => ({
            tabIndex: direction === "bottom-right" ? 0 : -1,
            title: "Drag to resize · Arrow keys to resize",
            ...getHandleProps(direction),
          })}
        />
      </div>
    </ViewportPortal>
  );
};
