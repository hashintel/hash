import { useLayoutEffect, useRef, useState } from "react";

import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

export const useMonitorDrag = (onToggle: () => void) => {
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 16, bottom: 16 });
  const [bounds, setBounds] = useState({
    width: 0,
    height: 0,
    panelWidth: 0,
    panelHeight: 0,
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    bottom: number;
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.offsetParent;
    if (!panel || !(parent instanceof HTMLElement)) return;
    const measure = () => {
      const next = {
        width: parent.clientWidth,
        height: parent.clientHeight,
        panelWidth: panel.offsetWidth,
        panelHeight: panel.offsetHeight,
      };
      setBounds((previous) =>
        previous.width === next.width &&
        previous.height === next.height &&
        previous.panelWidth === next.panelWidth &&
        previous.panelHeight === next.panelHeight
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const clamp = (left: number, bottom: number) => ({
    left: Math.min(
      Math.max(16, bounds.width - bounds.panelWidth - 16),
      Math.max(16, left),
    ),
    bottom: Math.min(
      Math.max(16, bounds.height - bounds.panelHeight - 64),
      Math.max(16, bottom),
    ),
  });
  const visiblePosition = clamp(position.left, position.bottom);
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return {
    panelRef,
    dragging,
    position: visiblePosition,
    expandedWidth: bounds.width > 0 ? Math.min(390, bounds.width - 32) : 390,
    handleProps: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || dragRef.current) return;
        const panel = panelRef.current;
        const parent = panel?.offsetParent;
        if (!panel || !(parent instanceof HTMLElement)) return;
        const rect = panel.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        suppressClick.current = false;
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left - parentRect.left,
          bottom: parentRect.bottom - rect.bottom,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        if (!suppressClick.current && Math.hypot(deltaX, deltaY) < 4) return;
        suppressClick.current = true;
        setDragging(true);
        setPosition(clamp(drag.left + deltaX, drag.bottom - deltaY));
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        endDrag();
      },
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          suppressClick.current = false;
          return;
        }
        suppressClick.current = false;
        onToggle();
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.shiftKey ? 40 : 10;
        const directions: Record<string, { left: number; bottom: number }> = {
          ArrowLeft: { left: -step, bottom: 0 },
          ArrowRight: { left: step, bottom: 0 },
          ArrowUp: { left: 0, bottom: step },
          ArrowDown: { left: 0, bottom: -step },
        };
        const delta = directions[event.key];
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        setPosition(
          clamp(
            visiblePosition.left + delta.left,
            visiblePosition.bottom + delta.bottom,
          ),
        );
      },
    },
  };
};
