import { useRef, useState } from "react";

import {
  constrainVisualizerLayout,
  createVisualizerLayout,
  createVisualizerPlacement,
  resolveVisualizerLayout,
  updateVisualizerLayout,
} from "./visualizer-layout";

import type { VisualizerAction, VisualizerLayout } from "./visualizer-layout";
import type { Rect } from "@hashintel/petrinaut-core";
import type { HTMLAttributes, PointerEvent } from "react";

export const useVisualizerLayout = (
  node: Rect,
  viewport: Rect,
  onKeepOpen: () => void,
) => {
  const [placement, setPlacement] = useState(() =>
    createVisualizerPlacement(
      createVisualizerLayout(node, viewport),
      node,
      "follow",
    ),
  );
  const layout = constrainVisualizerLayout(
    resolveVisualizerLayout(placement, node),
    viewport,
  );
  const fixed = placement.mode === "fixed";
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    layout: VisualizerLayout;
  } | null>(null);

  const toggleFixed = () => {
    onKeepOpen();
    setPlacement(
      createVisualizerPlacement(layout, node, fixed ? "follow" : "fixed"),
    );
  };

  const endGesture = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const getHandleProps = (
    action: VisualizerAction,
  ): HTMLAttributes<HTMLElement> => ({
    onFocus: (event) => {
      if (event.target === event.currentTarget) onKeepOpen();
    },
    onPointerDown: (event) => {
      event.stopPropagation();
      if (event.button !== 0 || gesture.current) return;
      const button =
        event.target instanceof Element ? event.target.closest("button") : null;
      if (button && button !== event.currentTarget) return;
      event.preventDefault();
      onKeepOpen();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(action === "move");
      gesture.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        layout,
      };
    },
    onPointerMove: (event) => {
      event.stopPropagation();
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setPlacement(
        createVisualizerPlacement(
          updateVisualizerLayout(
            current.layout,
            action,
            {
              x: event.clientX - current.x,
              y: event.clientY - current.y,
            },
            viewport,
            event.altKey,
          ),
          node,
          placement.mode,
        ),
      );
    },
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: endGesture,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      const step = event.shiftKey ? 20 : 5;
      const deltas: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.stopPropagation();
      event.preventDefault();
      onKeepOpen();
      setPlacement((previous) =>
        createVisualizerPlacement(
          updateVisualizerLayout(
            constrainVisualizerLayout(
              resolveVisualizerLayout(previous, node),
              viewport,
            ),
            action,
            delta,
            viewport,
            event.altKey,
          ),
          node,
          previous.mode,
        ),
      );
    },
  });

  return { layout, dragging, fixed, toggleFixed, getHandleProps };
};
