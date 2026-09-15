import { useRef, useState } from "react";

import {
  resizeFloatingPanel,
  type FloatingPanelBounds,
  type FloatingResizeDirection,
} from "./use-floating-position/resize-floating-panel";

import type { KeyboardEvent, PointerEvent } from "react";

export const useFloatingPosition = (
  width: number,
  onWidthChange: (width: number) => void,
) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ right: 12, top: 12, height: 640 });
  const [isInteracting, setIsInteracting] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    bounds: FloatingPanelBounds;
    direction?: FloatingResizeDirection;
  } | null>(null);

  const getBounds = () => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) {
      return null;
    }
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

  const onPointerDown = (
    event: PointerEvent<HTMLElement>,
    direction?: FloatingResizeDirection,
  ) => {
    if (event.button !== 0 || dragRef.current) {
      return;
    }
    const bounds = getBounds();
    if (!bounds) {
      return;
    }
    if (direction) {
      event.preventDefault();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      bounds,
      direction,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsInteracting(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.direction) {
      const resized = resizeFloatingPanel(drag.bounds, drag.direction, {
        x: event.clientX - drag.x,
        y: event.clientY - drag.y,
      });
      setPosition({
        right: resized.right,
        top: resized.top,
        height: resized.height,
      });
      onWidthChange(resized.width);
      return;
    }
    const { bounds } = drag;
    setPosition({
      height: position.height,
      right: Math.min(
        Math.max(12, bounds.parentWidth - bounds.width - 12),
        Math.max(12, bounds.right + drag.x - event.clientX),
      ),
      top: Math.min(
        Math.max(12, bounds.parentHeight - bounds.height - 12),
        Math.max(12, bounds.top + event.clientY - drag.y),
      ),
    });
  };

  const onLostPointerCapture = () => {
    dragRef.current = null;
    setIsInteracting(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const bounds = getBounds();
    if (!bounds) {
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const directions: Record<string, { right: number; top: number }> = {
      ArrowLeft: { right: step, top: 0 },
      ArrowRight: { right: -step, top: 0 },
      ArrowUp: { right: 0, top: -step },
      ArrowDown: { right: 0, top: step },
    };
    const delta = directions[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    setPosition({
      height: position.height,
      right: Math.min(
        Math.max(12, bounds.parentWidth - bounds.width - 12),
        Math.max(12, bounds.right + delta.right),
      ),
      top: Math.min(
        Math.max(12, bounds.parentHeight - bounds.height - 12),
        Math.max(12, bounds.top + delta.top),
      ),
    });
  };

  return {
    panelRef,
    isInteracting,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onLostPointerCapture,
      onKeyDown,
    },
    getResizeHandleProps: (direction: FloatingResizeDirection) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) =>
        onPointerDown(event, direction),
      onPointerMove,
      onLostPointerCapture,
    }),
    style: {
      right: `clamp(12px, ${position.right}px, max(12px, calc(100% - ${width}px - 12px)))`,
      top: `clamp(12px, ${position.top}px, max(12px, calc(100% - ${position.height + 12}px)))`,
      height: `min(${position.height}px, max(0px, calc(100% - 24px)))`,
      maxHeight: "calc(100% - 24px)",
    },
  };
};
