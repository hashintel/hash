import { useRef, useState } from "react";

import {
  createVisualizerLayout,
  updateVisualizerLayout,
} from "./visualizer-layout";

import type { VisibleSceneRect } from "../../../../../canvas-viewport";
import type { VisualizerAction, VisualizerLayout } from "./visualizer-layout";
import type { Rect, Size } from "@hashintel/petrinaut-core";
import type { ComponentProps, PointerEvent } from "react";

export const useVisualizerLayout = (
  node: Rect,
  initialSize: Size | null,
  viewport: VisibleSceneRect,
) => {
  const [layout, setLayout] = useState(() =>
    createVisualizerLayout(node, initialSize, viewport),
  );
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    layout: VisualizerLayout;
  } | null>(null);

  const endGesture = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const getHandleProps = (
    action: VisualizerAction,
  ): ComponentProps<"button"> => ({
    onPointerDown: (event) => {
      if (event.button !== 0 || gesture.current) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        layout,
      };
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setLayout(
        updateVisualizerLayout(
          current.layout,
          action,
          {
            x: event.clientX - current.x,
            y: event.clientY - current.y,
          },
          viewport.zoom,
        ),
      );
    },
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: endGesture,
    onKeyDown: (event) => {
      const step = event.shiftKey ? 20 : 5;
      const deltas: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      setLayout((previous) =>
        updateVisualizerLayout(previous, action, delta, viewport.zoom),
      );
    },
  });

  return { layout, getHandleProps };
};
