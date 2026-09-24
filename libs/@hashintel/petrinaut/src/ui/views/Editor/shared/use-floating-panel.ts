import { useRef, useState } from "react";

import {
  defaultFloatingPanelLimits,
  resizeFloatingPanel,
  type FloatingPanelBounds,
  type FloatingPanelLimits,
  type FloatingResizeDirection,
} from "./use-floating-panel/resize-floating-panel";

import type { KeyboardEvent, PointerEvent } from "react";

export type { FloatingResizeDirection } from "./use-floating-panel/resize-floating-panel";

export const useFloatingPanel = <
  PanelElement extends HTMLElement = HTMLElement,
>({
  width,
  onWidthChange,
  initialHeight = 640,
  initialPosition = { right: 12, top: 12 },
  limits: overrides,
}: {
  width: number;
  onWidthChange: (width: number) => void;
  initialHeight?: number;
  initialPosition?: "center" | { right: number; top: number };
  limits?: Partial<FloatingPanelLimits>;
}) => {
  const limits = { ...defaultFloatingPanelLimits, ...overrides };
  const { gap, maxWidth } = limits;
  const panelRef = useRef<PanelElement | null>(null);
  const [position, setPosition] = useState(() => ({
    right: initialPosition === "center" ? null : initialPosition.right,
    top: initialPosition === "center" ? null : initialPosition.top,
    height: initialHeight,
  }));
  const [isInteracting, setIsInteracting] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    width: number;
    height: number;
    bounds: FloatingPanelBounds;
    direction?: FloatingResizeDirection;
  } | null>(null);

  const getBounds = () => {
    const panel = panelRef.current;
    // The containing block the panel positions against, or the parent where
    // layout is unavailable.
    const parent = panel?.offsetParent ?? panel?.parentElement;
    if (!panel || !parent) return null;
    const bounds = panel.getBoundingClientRect();
    const parentBounds = parent.getBoundingClientRect();
    return {
      right: parentBounds.right - bounds.right,
      top: bounds.top - parentBounds.top,
      width: bounds.width,
      height: bounds.height,
      parentWidth: parentBounds.width,
      parentHeight: parentBounds.height,
    };
  };

  const move = (bounds: FloatingPanelBounds, x: number, y: number) => {
    setPosition((previous) => ({
      height: previous.height,
      right: Math.min(
        Math.max(gap, bounds.parentWidth - bounds.width - gap),
        Math.max(gap, bounds.right - x),
      ),
      top: Math.min(
        Math.max(gap, bounds.parentHeight - bounds.height - gap),
        Math.max(gap, bounds.top + y),
      ),
    }));
  };

  const onPointerDown = (
    event: PointerEvent<HTMLElement>,
    direction?: FloatingResizeDirection,
  ) => {
    if (event.button !== 0 || dragRef.current) return;
    const bounds = getBounds();
    if (!bounds) return;
    if (direction) event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      bounds,
      direction,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width,
      height: position.height,
    };
    setIsInteracting(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    if (drag.direction) {
      const resized = resizeFloatingPanel(
        drag.bounds,
        drag.direction,
        delta,
        limits,
      );
      setPosition({
        right: resized.right,
        top: resized.top,
        height:
          resized.height === drag.bounds.height ? drag.height : resized.height,
      });
      const nextWidth =
        resized.width === drag.bounds.width ? drag.width : resized.width;
      if (nextWidth !== width) {
        onWidthChange(nextWidth);
      }
    } else {
      move(drag.bounds, delta.x, delta.y);
    }
  };

  const onLostPointerCapture = () => {
    dragRef.current = null;
    setIsInteracting(false);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onLostPointerCapture();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const bounds = getBounds();
    if (!bounds) return;
    const step = event.shiftKey ? 40 : 10;
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    move(bounds, delta.x, delta.y);
  };

  const pointerProps = {
    onPointerMove,
    onPointerUp,
    onPointerCancel: onLostPointerCapture,
    onLostPointerCapture,
  };
  const panelWidth = Number.isFinite(maxWidth)
    ? Math.min(width, maxWidth)
    : width;

  return {
    panelRef,
    isInteracting,
    handleProps: { ...pointerProps, onPointerDown, onKeyDown },
    getResizeHandleProps: (direction: FloatingResizeDirection) => ({
      ...pointerProps,
      onPointerDown: (event: PointerEvent<HTMLElement>) =>
        onPointerDown(event, direction),
    }),
    style: {
      "--floating-panel-width": `${panelWidth}px`,
      "--floating-panel-height": `${position.height}px`,
      "--floating-panel-right":
        position.right === null
          ? `max(${gap}px, calc((100% - var(--floating-panel-width)) / 2))`
          : `${position.right}px`,
      "--floating-panel-top":
        position.top === null
          ? `max(${gap}px, calc((100% - var(--floating-panel-height)) / 2))`
          : `${position.top}px`,
      width: `min(var(--floating-panel-width), max(0px, calc(100% - ${gap * 2}px)))`,
      maxWidth: `calc(100% - ${gap * 2}px)`,
      right: `clamp(${gap}px, var(--floating-panel-right), max(${gap}px, calc(100% - var(--floating-panel-width) - ${gap}px)))`,
      top: `clamp(${gap}px, var(--floating-panel-top), max(${gap}px, calc(100% - var(--floating-panel-height) - ${gap}px)))`,
      height: `min(var(--floating-panel-height), max(0px, calc(100% - ${gap * 2}px)))`,
      maxHeight: `calc(100% - ${gap * 2}px)`,
    },
  };
};
