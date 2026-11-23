import { css } from "@hashintel/ds-helpers/css";

import type { ContourSurfaceFraction } from "./use-surface-drag";

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
