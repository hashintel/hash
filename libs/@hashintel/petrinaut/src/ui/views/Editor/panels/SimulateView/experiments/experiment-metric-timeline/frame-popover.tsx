/**
 * The click-to-inspect popover: a floating card next to the pointer showing
 * the selected frame's histogram (distribution) or value (scalar), placed by
 * its measured height and dismissed by an outside click.
 */
import { Portal } from "@ark-ui/react/portal";
import { useEffect, useRef } from "react";

import { Button, usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../../react/hooks/use-element-size";
import { formatNumber } from "../shared/format-number";
import { BinHistogramCanvas } from "./frame-popover/bin-histogram-canvas";
import { sampleCountFromBins } from "./shared/distribution-math";

import type {
  DistributionMetricFrame,
  MetricFrame,
  ScalarMetricFrame,
} from "./shared/metric-frames";
import type { PointerPosition } from "./shared/pointer-position";
import type { CSSProperties, RefObject } from "react";

type FramePopoverPosition = {
  x: number;
  y: number;
  placement: "above" | "below";
};

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 248;
const POPOVER_MARGIN = 10;
const POPOVER_OFFSET = 10;

const popoverStyle = css({
  position: "fixed",
  left: "[var(--frame-popover-x)]",
  top: "[var(--frame-popover-y)]",
  zIndex: "modal",
  width: "[min(340px, calc(100vw - 20px))]",
  maxHeight: "[248px]",
  overflow: "hidden",
  padding: "1.5",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0 10px 24px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.04)]",
  pointerEvents: "auto",
  userSelect: "none",
});

const closeStyle = css({
  position: "absolute",
  top: "[4px]",
  right: "[4px]",
});

const detailStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const detailHeaderStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  paddingRight: "[22px]",
});

const detailTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.s120",
  whiteSpace: "nowrap",
});

const detailMetaStyle = css({
  fontSize: "[11px]",
  color: "neutral.s80",
  whiteSpace: "nowrap",
});

const scalarValueStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function popoverPositionFor(
  pointer: PointerPosition,
  popoverHeight: number,
): FramePopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(
    POPOVER_WIDTH,
    Math.max(280, viewportWidth - POPOVER_MARGIN * 2),
  );
  const height = Math.min(
    POPOVER_MAX_HEIGHT,
    Math.max(0, Math.min(popoverHeight, viewportHeight - POPOVER_MARGIN * 2)),
  );
  const maxX = Math.max(POPOVER_MARGIN, viewportWidth - width - POPOVER_MARGIN);
  const maxY = Math.max(
    POPOVER_MARGIN,
    viewportHeight - height - POPOVER_MARGIN,
  );
  const canFitBelow =
    pointer.clientY + POPOVER_OFFSET + height <=
    viewportHeight - POPOVER_MARGIN;
  const placement = canFitBelow ? "below" : "above";
  const preferredY =
    placement === "below"
      ? pointer.clientY + POPOVER_OFFSET
      : pointer.clientY - POPOVER_OFFSET - height;

  return {
    x: clamp(pointer.clientX + POPOVER_OFFSET, POPOVER_MARGIN, maxX),
    y: clamp(preferredY, POPOVER_MARGIN, maxY),
    placement,
  };
}

const DistributionFrameHistogram = ({
  frame,
}: {
  frame: DistributionMetricFrame;
}) => {
  const sampleCount = sampleCountFromBins(frame.bins);

  return (
    <div className={detailStyle}>
      <div className={detailHeaderStyle}>
        <span className={detailTitleStyle}>{formatNumber(frame.time)}s</span>
        <span className={detailMetaStyle}>
          Frame {frame.frameNumber} - {sampleCount} sample
          {sampleCount === 1 ? "" : "s"} - {frame.bins.length} bin
          {frame.bins.length === 1 ? "" : "s"}
        </span>
      </div>
      <BinHistogramCanvas bins={frame.bins} />
    </div>
  );
};

const ScalarFrameDetail = ({ frame }: { frame: ScalarMetricFrame }) => (
  <div className={detailStyle}>
    <div className={detailHeaderStyle}>
      <span className={detailTitleStyle}>{formatNumber(frame.time)}s</span>
      <span className={detailMetaStyle}>
        Frame {frame.frameNumber} - {frame.runSampleCount} run
        {frame.runSampleCount === 1 ? "" : "s"}
      </span>
    </div>
    <div className={scalarValueStyle}>
      {frame.value === null ? "n/a" : formatNumber(frame.value)}
    </div>
  </div>
);

export const FramePopover = ({
  frame,
  pointer,
  chartRootRef,
  onClose,
}: {
  frame: MetricFrame;
  /** Where the frame was picked; the popover floats next to it. */
  pointer: PointerPosition;
  /** Pointer-downs inside this element scrub the selection, not dismiss. */
  chartRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const popoverRef = useRef<HTMLDivElement>(null);
  // Placement flips and clamps by the popover's real (border-box) height;
  // until the first measurement the popover stays hidden rather than paint
  // in the wrong place.
  const measuredSize = useElementSize(popoverRef, { box: "border" });
  const position = popoverPositionFor(
    pointer,
    measuredSize?.height ?? POPOVER_MAX_HEIGHT,
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        popoverRef.current?.contains(target) ||
        chartRootRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [chartRootRef, onClose]);

  return (
    <Portal container={portalContainerRef}>
      <div
        ref={popoverRef}
        className={popoverStyle}
        data-placement={position.placement}
        role="dialog"
        aria-label={
          frame.outputType === "distribution"
            ? `Distribution at ${formatNumber(frame.time)}s`
            : `Value at ${formatNumber(frame.time)}s`
        }
        style={
          {
            "--frame-popover-x": `${position.x}px`,
            "--frame-popover-y": `${position.y}px`,
            visibility: measuredSize ? undefined : "hidden",
          } as CSSProperties
        }
      >
        <Button
          className={closeStyle}
          variant="ghost"
          size="xxs"
          iconName="close"
          aria-label="Close"
          onClick={onClose}
        />
        {frame.outputType === "distribution" ? (
          <DistributionFrameHistogram frame={frame} />
        ) : (
          <ScalarFrameDetail frame={frame} />
        )}
      </div>
    </Portal>
  );
};
