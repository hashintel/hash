import { useRef, useState } from "react";

import type { KeyboardEvent, PointerEvent } from "react";

export const useFloatingPosition = (width: number) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ right: 12, top: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    right: number;
    top: number;
    maxRight: number;
    maxTop: number;
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
      maxRight: Math.max(12, parentBounds.width - bounds.width - 12),
      maxTop: Math.max(12, parentBounds.height - bounds.height - 12),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    const bounds = getBounds();
    if (!bounds) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      ...bounds,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setPosition({
      right: Math.min(
        drag.maxRight,
        Math.max(12, drag.right + drag.x - event.clientX),
      ),
      top: Math.min(
        drag.maxTop,
        Math.max(12, drag.top + event.clientY - drag.y),
      ),
    });
  };

  const onLostPointerCapture = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
      right: Math.min(
        bounds.maxRight,
        Math.max(12, bounds.right + delta.right),
      ),
      top: Math.min(bounds.maxTop, Math.max(12, bounds.top + delta.top)),
    });
  };

  return {
    panelRef,
    anchorForResize: () => {
      const bounds = getBounds();
      if (bounds) {
        setPosition({ right: bounds.right, top: bounds.top });
      }
    },
    isDragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onLostPointerCapture,
      onKeyDown,
    },
    style: {
      right: `clamp(12px, ${position.right}px, max(12px, calc(100% - ${width}px - 12px)))`,
      top: `clamp(12px, ${position.top}px, max(12px, calc(100% - 652px)))`,
    },
  };
};
