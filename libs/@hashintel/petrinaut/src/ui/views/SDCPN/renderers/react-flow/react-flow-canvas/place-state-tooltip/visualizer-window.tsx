import { useInternalNode, useStore, useViewport } from "@xyflow/react";
import { createPortal } from "react-dom";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PinIcon } from "../../../../../../components/pin-icon";
import { useCanvasInsets } from "../../../../../../hooks/use-canvas-insets";
import { VisualizerFrame } from "../../../../../../shared/visualizer-frame";
import { FloatingResizeHandles } from "../../../../../shared/floating-resize-handles";
import { useVisualizerLayout } from "./visualizer-window/use-visualizer-layout";
import { getVisualizerBubble } from "./visualizer-window/visualizer-bubble";
import { getVisualizerAnchor } from "./visualizer-window/visualizer-layout";

import type { PointerEventHandler, ReactNode } from "react";

const panelStyle = css({
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  padding: "[1px]",
  borderRadius: "[14px]",
  pointerEvents: "auto",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  transition: "[filter 140ms ease]",
  "&[data-muted='true']:not(:hover)": { filter: "[grayscale(0.35)]" },
  "&[data-dragging='true']": {
    cursor: "grabbing",
  },
  "&[data-animated='true']": {
    transition: "[transform 140ms ease, filter 140ms ease]",
    _hover: { transform: "[scale(1.003)]" },
    "&[data-dragging='true']": { transform: "[translateY(-1px) scale(1.006)]" },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
      transform: "none",
    },
  },
  "&:hover [data-visualizer-control], &:focus-within [data-visualizer-control]":
    {
      opacity: "[1]",
      pointerEvents: "auto",
    },
  "@media (hover: none)": {
    "& [data-visualizer-control]": { opacity: "[1]", pointerEvents: "auto" },
  },
});

const controlsStyle = css({
  position: "absolute",
  zIndex: "[2]",
  top: "[8px]",
  right: "[8px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s100",
  "& svg": { filter: "[drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35))]" },
  backgroundColor: "[rgba(255, 255, 255, 0.58)]",
  backdropFilter: "[blur(10px) saturate(140%)]",
  borderRadius: "[8px]",
  padding: "[2px]",
  boxShadow: "[0 1px 3px rgba(0, 0, 0, 0.14)]",
  opacity: "[0]",
  pointerEvents: "none",
  transition: "[opacity 140ms ease-out]",
  "[data-animated='false'] &": { transition: "[none]" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  "&:has(:focus-visible)": { outline: "[2px solid {colors.blue.s80}]" },
});

const dragHandleStyle = css({
  position: "absolute",
  zIndex: "[1]",
  top: "[0]",
  left: "[0]",
  width: "[100%]",
  height: "[32px]",
  border: "none",
  padding: "[0]",
  borderRadius: "[13px 13px 0 0]",
  backgroundColor: "[transparent]",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  _active: { cursor: "grabbing" },
  _focusVisible: { outline: "[none]" },
});

const contentStyle = css({
  position: "relative",
  flex: "1",
  minHeight: "[0]",
  overflow: "auto",
  borderRadius: "[13px]",
});

export const VisualizerWindow = ({
  nodeId,
  name,
  editing,
  muted,
  animated,
  stackIndex,
  onActivate,
  onKeepOpen,
  onClose,
  onEdit,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  nodeId: string;
  name: string;
  editing: boolean;
  muted: boolean;
  animated: boolean;
  stackIndex: number;
  onActivate: () => void;
  onKeepOpen: () => void;
  onClose: () => void;
  onEdit?: () => void;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  children:
    | ReactNode
    | ((size: { width: number; height: number }) => ReactNode);
}) => {
  const node = useInternalNode(nodeId);
  const viewport = useViewport();
  const container = useStore((state) =>
    state.domNode?.querySelector(".react-flow__renderer"),
  );
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const insets = useCanvasInsets();
  const nodeBounds = {
    x: (node?.internals.positionAbsolute.x ?? 0) * viewport.zoom + viewport.x,
    y: (node?.internals.positionAbsolute.y ?? 0) * viewport.zoom + viewport.y,
    width: (node?.measured.width ?? 1) * viewport.zoom,
    height: (node?.measured.height ?? 1) * viewport.zoom,
  };
  const left = Math.min(insets.left, Math.max(0, canvasWidth - 1));
  const top = Math.min(72, Math.max(0, canvasHeight - 1));
  const { layout, dragging, fixed, toggleFixed, getHandleProps } =
    useVisualizerLayout(
      nodeBounds,
      {
        x: left,
        y: top,
        width: Math.max(1, canvasWidth - left - insets.right - 48),
        height: Math.max(1, canvasHeight - top - insets.bottom - 64),
      },
      onKeepOpen,
    );
  const anchor = getVisualizerAnchor(nodeBounds, {
    ...layout.position,
    ...layout.size,
  });

  const visibleAnchor =
    anchor.x >= left &&
    anchor.x <= canvasWidth - insets.right &&
    anchor.y >= top &&
    anchor.y <= canvasHeight - insets.bottom;
  const localAnchor = visibleAnchor
    ? {
        x: anchor.x - layout.position.x,
        y: anchor.y - layout.position.y,
      }
    : null;
  const marker =
    localAnchor &&
    Math.hypot(
      Math.max(-localAnchor.x, 0, localAnchor.x - layout.size.width),
      Math.max(-localAnchor.y, 0, localAnchor.y - layout.size.height),
    ) <= 8
      ? localAnchor
      : null;
  const bubble = getVisualizerBubble(layout.size, marker ? null : localAnchor);

  if (!container) return null;

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Drag the picture while keeping control events from reaching the source node.
    <div
      className={`${panelStyle} nodrag nopan nowheel`}
      style={{
        zIndex: 1001 + stackIndex,
        left: layout.position.x,
        top: layout.position.y,
        width: layout.size.width,
        height: layout.size.height,
      }}
      data-visualizer-window
      data-editing={editing}
      data-muted={muted}
      data-dragging={dragging}
      data-animated={animated}
      data-fixed={fixed}
      role="group"
      tabIndex={-1}
      aria-label={`${name} state visualizer`}
      {...getHandleProps("move")}
      onFocusCapture={onActivate}
      onPointerDownCapture={(event) => {
        if (event.button === 0) {
          onActivate();
          if (
            event.target instanceof Element &&
            event.target.closest("[data-visualizer-content]")
          )
            onKeepOpen();
        }
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        getHandleProps("move").onKeyDown?.(event);
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        [...container.querySelectorAll<HTMLElement>(".react-flow__node")]
          .find((element) => element.dataset.id === nodeId)
          ?.focus({ preventScroll: true });
      }}
    >
      <VisualizerFrame path={bubble} marker={marker}>
        <button
          type="button"
          className={dragHandleStyle}
          data-visualizer-drag
          aria-label={`Move ${name} visualizer`}
          title="Drag to move · Arrow keys to nudge"
          {...getHandleProps("move")}
        />
        <div className={controlsStyle} data-visualizer-control>
          <Button
            size="xxs"
            variant="ghost"
            prefix={<PinIcon />}
            aria-label="Fix position on screen"
            aria-pressed={fixed}
            tooltip={fixed ? "Follow place" : "Fix position on screen"}
            className={css({
              "&[aria-pressed='true']": {
                color: "blue.s80",
                backgroundColor: "blue.s20",
              },
            })}
            onClick={toggleFixed}
          />
          {onEdit && (
            <Button
              size="xxs"
              variant="ghost"
              iconName="bracketsCurly"
              aria-label="Edit visualizer code"
              tooltip="Edit visualizer code"
              onClick={onEdit}
            />
          )}
          <Button
            size="xxs"
            variant="ghost"
            iconName="close"
            aria-label="Close state visualizer"
            tooltip="Close state visualizer"
            onClick={onClose}
          />
        </div>
        <div className={contentStyle} data-visualizer-content>
          {typeof children === "function"
            ? children({
                width: Math.max(1, layout.size.width - 2),
                height: Math.max(1, layout.size.height - 2),
              })
            : children}
        </div>
        <FloatingResizeHandles
          label={`${name} visualizer`}
          getHandleProps={(direction) => ({
            tabIndex: direction === "bottom-right" ? 0 : -1,
            title:
              "Drag to resize · Alt to resize from center · Arrow keys to resize",
            ...getHandleProps(direction),
          })}
        />
      </VisualizerFrame>
    </div>,
    container,
  );
};
