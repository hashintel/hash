import { useRef, type PointerEvent } from "react";

import { useReadOnlyFeedback } from "../../../../../../react/hooks/use-read-only-feedback";

const dragThresholdPx = 6;

/**
 * Pointer handlers for the canvas pane that show the read-only notice once a
 * primary pointer moves a node more than `dragThresholdPx` on a read-only net.
 * In pan mode they stay quiet: React Flow marks only draggable nodes `nopan`,
 * so a drag that starts on a read-only node pans the canvas.
 */
export const useReadOnlyNodeDrag = ({
  readonly: readonlyNet,
  isPanMode,
}: {
  readonly readonly: boolean;
  readonly isPanMode: boolean;
}) => {
  const readonly = readonlyNet && !isPanMode;
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const notifyReadOnly = useReadOnlyFeedback();
  const clear = () => {
    start.current = null;
  };

  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      clear();
      const target = event.target;
      if (
        !readonly ||
        event.button !== 0 ||
        event.isPrimary === false ||
        !(target instanceof Element)
      )
        return;
      if (
        !target.closest(".react-flow__node, .react-flow__nodesselection-rect")
      )
        return;
      if (
        target.closest(
          "button, input, textarea, select, a, [contenteditable=true], .nodrag",
        )
      )
        return;
      start.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      const origin = start.current;
      if (!readonly || !origin || origin.pointerId !== event.pointerId) return;
      if (
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <
        dragThresholdPx
      )
        return;
      clear();
      notifyReadOnly();
    },
    onPointerUpCapture: clear,
    onPointerCancelCapture: clear,
    onPointerLeave: clear,
  };
};
