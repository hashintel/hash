/**
 * What both surface cards share: the plot and footer heights that keep them
 * level with their neighbours, the X/Y axis selects for the footer, with
 * whatever else a view controls on a second footer row, and the caption
 * helpers. The footer is a grid of label and select pairs: the selects share
 * the row's width, so the footer fits the card's narrowest column without
 * overflowing, and a view with further controls reserves its second row at
 * all times.
 */
import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/** The plot's height in pixels inside a surface card. */
export const SURFACE_PLOT_HEIGHT = 280;
/** The footer's content height for one row of controls: an extra-small Select. */
export const SURFACE_FOOTER_HEIGHT = 24;
/** The footer's content height for two rows of controls and the gap between them. */
export const SURFACE_FOOTER_TWO_ROW_HEIGHT = SURFACE_FOOTER_HEIGHT * 2 + 6;

// Two label-and-select pairs per row; each select takes its share of the row
// and ellipsizes a long option name rather than pushing the next label.
const controlsStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(0, 1fr) auto minmax(0, 1fr)]",
  alignItems: "center",
  columnGap: "2",
  rowGap: "[6px]",
  width: "full",
  minWidth: "[0]",
  "& [data-scope='select']": { width: "full", minWidth: "[0]" },
  "& > div > div": { minWidth: "[0]" },
});

const controlLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  flexShrink: 0,
});

export const SurfaceControlLabel = ({ children }: { children: ReactNode }) => (
  <span className={controlLabelStyle}>{children}</span>
);

/** The X and Y axis selects on one row; `children` adds further controls on the row beneath. */
export const SurfaceAxisControls = ({
  axes,
  xAxisId,
  yAxisId,
  onXAxisIdChange,
  onYAxisIdChange,
  children,
}: {
  /** `label` is the name shown for a generated identifier. */
  axes: readonly { identifier: string; label?: string }[];
  xAxisId: string;
  yAxisId: string;
  onXAxisIdChange: (axisId: string) => void;
  onYAxisIdChange: (axisId: string) => void;
  children?: ReactNode;
}) => {
  const options = axes.map((axis) => ({
    value: axis.identifier,
    text: axis.label ?? axis.identifier,
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

/** The caption: the axis readouts under the pointer mid-drag, the state line otherwise. */
export const surfaceCaption = ({
  preview,
  text,
}: {
  /** Axis readouts under the pointer mid-drag; null outside a drag. */
  preview: { x: string; y: string } | null;
  /** The state line shown outside a drag. */
  text: string;
}): string =>
  preview ? `${preview.x} · ${preview.y} — release to navigate` : text;
