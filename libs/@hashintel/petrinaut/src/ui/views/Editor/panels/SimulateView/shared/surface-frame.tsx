/**
 * The card both surface views share: the plot in the body, the state line
 * (or the drag readout) in the subtitle, and the X/Y axis selects, with
 * whatever else the view controls, in the footer.
 */
import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ChartCard } from "./chart-card";

import type { ReactNode } from "react";

/** The plot's height in pixels inside a surface card. */
export const SURFACE_PLOT_HEIGHT = 280;
/** The footer's content height: an extra-small Select. */
export const SURFACE_FOOTER_HEIGHT = 24;

const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
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

export const SurfaceFrame = ({
  title,
  caption,
  actions,
  bodyHeight,
  footer,
  children,
}: {
  title: string;
  /** The state line, or the drag readout, under the title. */
  caption: string;
  /** The header's right side, e.g. a help tooltip. */
  actions?: ReactNode;
  /** Fixed when the card shares a row; omitted when its content sizes it. */
  bodyHeight?: number;
  /** The axis selects and whatever else the view controls. */
  footer: ReactNode;
  children: ReactNode;
}) => (
  <ChartCard
    title={title}
    subtitle={caption}
    actions={actions}
    bodyHeight={bodyHeight}
    footer={footer}
    footerHeight={SURFACE_FOOTER_HEIGHT}
  >
    {children}
  </ChartCard>
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
