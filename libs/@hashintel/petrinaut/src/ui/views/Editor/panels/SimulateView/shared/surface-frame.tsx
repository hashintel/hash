/**
 * The shell both surface views share: a column holding the X/Y axis selects,
 * whatever else the view controls, the plot, and a caption that reads out the
 * drag position or the view's state line.
 */
import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const frameStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
  // Compact inline controls; the ds Select otherwise stretches to the row.
  "& [data-scope='select']": { width: "[170px]" },
  // The Select's root insists on min-content width, which overflows the
  // 170px box over the next label; a long option name fits by ellipsis.
  "& > div > div": { minWidth: "[0]" },
});

const controlLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  flexShrink: 0,
});

const captionStyle = css({
  display: "block",
  minHeight: "[16px]",
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const SurfaceFrame = ({ children }: { children: ReactNode }) => (
  <div className={frameStyle}>{children}</div>
);

export const SurfaceControlLabel = ({ children }: { children: ReactNode }) => (
  <span className={controlLabelStyle}>{children}</span>
);

/** The X and Y axis selects; `children` adds further controls to the row. */
export const SurfaceAxisControls = ({
  axes,
  xAxisId,
  yAxisId,
  onXAxisIdChange,
  onYAxisIdChange,
  children,
}: {
  axes: readonly { identifier: string }[];
  xAxisId: string;
  yAxisId: string;
  onXAxisIdChange: (axisId: string) => void;
  onYAxisIdChange: (axisId: string) => void;
  children?: ReactNode;
}) => {
  const options = axes.map((axis) => ({
    value: axis.identifier,
    text: axis.identifier,
  }));
  return (
    <div className={controlsStyle}>
      <SurfaceControlLabel>X</SurfaceControlLabel>
      <Select
        size="xs"
        aria-label="Surface X parameter"
        items={options.filter((option) => option.value !== yAxisId)}
        value={xAxisId}
        onChange={(value) => onXAxisIdChange(value ?? "")}
      />
      <SurfaceControlLabel>Y</SurfaceControlLabel>
      <Select
        size="xs"
        aria-label="Surface Y parameter"
        items={options.filter((option) => option.value !== xAxisId)}
        value={yAxisId}
        onChange={(value) => onYAxisIdChange(value ?? "")}
      />
      {children}
    </div>
  );
};

/** The state line of a view that samples its grid locally. */
export const describeSurfaceSampling = ({
  sampledCount,
  totalCells,
  runsPerCell,
  note,
}: {
  sampledCount: number;
  totalCells: number;
  runsPerCell: number;
  /** An extra clause between the progress and the navigation hint. */
  note?: string;
}): string =>
  [
    `${sampledCount} of ${totalCells} points sampled at ${runsPerCell}+ runs`,
    ...(note === undefined ? [] : [note]),
    "drag or click to navigate",
  ].join(" · ");

export const SurfaceCaption = ({
  preview,
  text,
}: {
  /** Axis readouts under the pointer mid-drag; null outside a drag. */
  preview: { x: string; y: string } | null;
  /** The state line shown outside a drag. */
  text: string;
}) => (
  <span className={captionStyle}>
    {preview ? `${preview.x} · ${preview.y} — release to navigate` : text}
  </span>
);
