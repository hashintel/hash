import { useRef, type PointerEvent } from "react";

import { useReadOnlyFeedback } from "../../../../../../react/hooks/use-read-only-feedback";

export const useReadOnlyNodeDrag = (readonly: boolean) => {
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
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 6)
        return;
      clear();
      notifyReadOnly();
    },
    onPointerUpCapture: clear,
    onPointerCancelCapture: clear,
    onPointerLeave: clear,
  };
};
