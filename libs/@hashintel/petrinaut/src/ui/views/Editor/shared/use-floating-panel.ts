import { motionValue, type MotionValue } from "motion";
import { useRef, useState } from "react";

import { bindStyle, type BoundStyle } from "../../../lib/readings";
import {
  defaultFloatingPanelLimits,
  resizeFloatingPanel,
  type FloatingPanelBounds,
  type FloatingPanelLimits,
} from "./use-floating-panel/resize-floating-panel";

import type { FloatingResizeDirection } from "../../shared/floating-resize-handles";
import type { KeyboardEvent, PointerEvent, RefCallback } from "react";

/**
 * A window that floats over its parent: it moves by its handle, by the arrow
 * keys on that handle, and resizes by its edges and corners.
 *
 * Where the window is and how big are Motion values, so a move or a resize
 * sets them on every pointer move and renders nothing. Put `bindPanel()` on
 * the window as its ref and give it `box` as its style.
 */
export const useFloatingPanel = <
  PanelElement extends HTMLElement = HTMLElement,
>({
  width,
  initialHeight = 640,
  initialPosition = { right: 12, top: 12 },
  limits: overrides,
}: {
  /** The window's width, which a resize sets. */
  width: MotionValue<number>;
  initialHeight?: number;
  initialPosition?: "center" | { right: number; top: number };
  limits?: Partial<FloatingPanelLimits>;
}) => {
  const limits = { ...defaultFloatingPanelLimits, ...overrides };
  const { gap, maxWidth } = limits;
  const panelRef = useRef<PanelElement | null>(null);
  // `null` for a distance centers the window on that axis.
  const [placed] = useState(() => ({
    right: motionValue(
      initialPosition === "center" ? null : initialPosition.right,
    ),
    top: motionValue(initialPosition === "center" ? null : initialPosition.top),
    height: motionValue(initialHeight),
  }));
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
    const parent = panel?.parentElement;
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
    placed.right.set(
      Math.min(
        Math.max(gap, bounds.parentWidth - bounds.width - gap),
        Math.max(gap, bounds.right - x),
      ),
    );
    placed.top.set(
      Math.min(
        Math.max(gap, bounds.parentHeight - bounds.height - gap),
        Math.max(gap, bounds.top + y),
      ),
    );
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
      width: width.get(),
      height: placed.height.get(),
    };
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
      placed.right.set(resized.right);
      placed.top.set(resized.top);
      // A size the drag has not changed stays what it was set to, not what
      // the parent's width or height squeezed it to.
      placed.height.set(
        resized.height === drag.bounds.height ? drag.height : resized.height,
      );
      width.set(
        resized.width === drag.bounds.width ? drag.width : resized.width,
      );
    } else {
      move(drag.bounds, delta.x, delta.y);
    }
  };

  const onLostPointerCapture = () => {
    dragRef.current = null;
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
  const widthWithinLimit = () =>
    Number.isFinite(maxWidth) ? Math.min(width.get(), maxWidth) : width.get();
  // Custom properties, so that `box` can keep the window inside its parent
  // in CSS. They are set on the window, and only its own elements inherit
  // them.
  const position: BoundStyle = {
    "--floating-panel-width": () => `${widthWithinLimit()}px`,
    "--floating-panel-height": () => `${placed.height.get()}px`,
    "--floating-panel-right": () => {
      const right = placed.right.get();
      return right === null
        ? `max(${gap}px, calc((100% - var(--floating-panel-width)) / 2))`
        : `${right}px`;
    },
    "--floating-panel-top": () => {
      const top = placed.top.get();
      return top === null
        ? `max(${gap}px, calc((100% - var(--floating-panel-height)) / 2))`
        : `${top}px`;
    },
  };

  return {
    /** The window's element while it is mounted, for reading. */
    panelRef,
    /**
     * A ref for the window's element. Motion writes where the window is and
     * how big on it, as the custom properties `box` reads, together with any
     * `style` of the caller's that follows other readings.
     */
    bindPanel:
      (style?: BoundStyle): RefCallback<PanelElement> =>
      (element) => {
        if (!element) {
          return;
        }
        panelRef.current = element;
        const unbind = bindStyle(element, { ...position, ...style });
        return () => {
          unbind();
          panelRef.current = null;
        };
      },
    handleProps: { ...pointerProps, onPointerDown, onKeyDown },
    getResizeHandleProps: (direction: FloatingResizeDirection) => ({
      ...pointerProps,
      onPointerDown: (event: PointerEvent<HTMLElement>) =>
        onPointerDown(event, direction),
    }),
    /**
     * The window's box, worked out in CSS from those custom properties:
     * inside its parent and `gap` from its edges, whatever the values say.
     */
    box: {
      width: `min(var(--floating-panel-width), max(0px, calc(100% - ${gap * 2}px)))`,
      maxWidth: `calc(100% - ${gap * 2}px)`,
      right: `clamp(${gap}px, var(--floating-panel-right), max(${gap}px, calc(100% - var(--floating-panel-width) - ${gap}px)))`,
      top: `clamp(${gap}px, var(--floating-panel-top), max(${gap}px, calc(100% - var(--floating-panel-height) - ${gap}px)))`,
      height: `min(var(--floating-panel-height), max(0px, calc(100% - ${gap * 2}px)))`,
      maxHeight: `calc(100% - ${gap * 2}px)`,
    },
  };
};
