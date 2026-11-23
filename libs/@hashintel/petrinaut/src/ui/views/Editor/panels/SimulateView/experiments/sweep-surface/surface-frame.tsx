/**
 * The footer of the sweep's surface card: the X/Y axis selects, with
 * whatever else the view controls on a second footer row, and the read-only
 * mark. The footer is a grid of label and select pairs: the
 * selects share the row's width, so the footer fits the card's narrowest
 * column without overflowing, and a view with further controls reserves its
 * second row at all times.
 */
import { Chip, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

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
  disabled = false,
  children,
}: {
  /** `label` is the name shown for a generated identifier. */
  axes: readonly { identifier: string; label?: string }[];
  xAxisId: string;
  yAxisId: string;
  onXAxisIdChange: (axisId: string) => void;
  onYAxisIdChange: (axisId: string) => void;
  /** Both selects lock: the view is read-only for now. */
  disabled?: boolean;
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
        disabled={disabled}
      />
      <SurfaceControlLabel>Y</SurfaceControlLabel>
      <Select
        size="xs"
        aria-label="Surface Y parameter"
        items={options.filter((option) => option.value !== xAxisId)}
        value={yAxisId}
        onChange={(value) => onYAxisIdChange(value ?? "")}
        disabled={disabled}
      />
      {children}
    </div>
  );
};

const readOnlyMarkStyle = css({
  gridColumn: "[3 / -1]",
  justifySelf: "end",
});

/**
 * The footer's read-only mark, in the free cells of a control row: a lock
 * and the word, purple while an optimizer drives the view, grey when the
 * view is over. Takes no room the controls would otherwise have, so locking
 * shifts nothing.
 */
export const SurfaceReadOnlyMark = ({
  reason,
}: {
  reason: "following" | "disabled";
}) => (
  <span
    className={readOnlyMarkStyle}
    title={
      reason === "following"
        ? "The optimizer drives the selection; the pickers unlock when it stops."
        : "The sweep is over; nothing computes for a new pick."
    }
    data-surface-read-only={reason}
  >
    <Chip
      size="xs"
      color={reason === "following" ? "purple" : "grey"}
      variant="soft"
      prefix={{ iconName: "lockClosed" }}
    >
      Read-only
    </Chip>
  </span>
);
