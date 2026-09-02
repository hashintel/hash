/**
 * The plot as a control: a click commits where it lands; a drag previews
 * under a crosshair and commits on release. Cancel (the browser taking a
 * touch over to scroll) and lost capture (a context menu swallowing the
 * release) abort without committing.
 */
import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

export type ContourSurfaceFraction = {
  /** Rightward fraction of the plot area, in [0, 1]. */
  x: number;
  /** Upward fraction of the plot area, in [0, 1]. */
  y: number;
};

type SurfacePointerEvent = React.PointerEvent<HTMLCanvasElement>;

export type SurfaceDragHandlers = {
  onPointerDown: (event: SurfacePointerEvent) => void;
  onPointerMove: (event: SurfacePointerEvent) => void;
  onPointerUp: (event: SurfacePointerEvent) => void;
  onPointerCancel: (event: SurfacePointerEvent) => void;
  onLostPointerCapture: (event: SurfacePointerEvent) => void;
};

const fractionAt = (event: SurfacePointerEvent): ContourSurfaceFraction => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp(1 - (event.clientY - bounds.top) / bounds.height),
  };
};

export const useSurfaceDrag = ({
  onPickFraction,
  onPreviewFraction,
}: {
  onPickFraction: ((fraction: ContourSurfaceFraction) => void) | undefined;
  onPreviewFraction:
    | ((fraction: ContourSurfaceFraction | null) => void)
    | undefined;
}): {
  /** The position under the pointer mid-drag; null outside a drag. */
  preview: ContourSurfaceFraction | null;
  handlers: SurfaceDragHandlers;
} => {
  // Touch pointers get implicit capture whether or not it was requested, so
  // capture state cannot tell this drag from a stray finger: only the pointer
  // armed on pointerdown navigates, and a display-only plot never arms.
  const [drag, setDrag] = useState<{
    pointerId: number;
    fraction: ContourSurfaceFraction;
  } | null>(null);

  const endDrag = (event: SurfacePointerEvent): boolean => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return false;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
    onPreviewFraction?.(null);
    return true;
  };

  const abort = (event: SurfacePointerEvent) => {
    endDrag(event);
  };

  return {
    preview: drag?.fraction ?? null,
    handlers: {
      onPointerDown: (event) => {
        if (
          !onPickFraction ||
          event.button !== 0 ||
          !event.isPrimary ||
          drag !== null
        ) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        const fraction = fractionAt(event);
        setDrag({ pointerId: event.pointerId, fraction });
        onPreviewFraction?.(fraction);
      },
      onPointerMove: (event) => {
        if (drag === null || drag.pointerId !== event.pointerId) {
          return;
        }
        const fraction = fractionAt(event);
        setDrag({ pointerId: event.pointerId, fraction });
        onPreviewFraction?.(fraction);
      },
      onPointerUp: (event) => {
        if (endDrag(event)) {
          onPickFraction?.(fractionAt(event));
        }
      },
      onPointerCancel: abort,
      onLostPointerCapture: abort,
    },
  };
};

// Positioned in percentages, so pointer moves never repaint the field below.
const lineXStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  width: "[1px]",
  backgroundColor: "[rgba(217, 119, 6, 0.65)]",
  pointerEvents: "none",
});

const lineYStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  height: "[1px]",
  backgroundColor: "[rgba(217, 119, 6, 0.65)]",
  pointerEvents: "none",
});

const dotStyle = css({
  position: "absolute",
  width: "[11px]",
  height: "[11px]",
  borderRadius: "full",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "[rgba(217, 119, 6, 0.95)]",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
});

/** The drag crosshair, overlaid on a relatively positioned plot frame. */
export const DragCrosshair = ({
  fraction,
}: {
  fraction: ContourSurfaceFraction;
}) => {
  const left = `${fraction.x * 100}%`;
  const top = `${(1 - fraction.y) * 100}%`;
  return (
    <>
      <div className={lineXStyle} style={{ left }} />
      <div className={lineYStyle} style={{ top }} />
      <div className={dotStyle} style={{ left, top }} />
    </>
  );
};
