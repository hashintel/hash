import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { countSteps } from "../../shared/step-display";
import { StepIconTile } from "../../shared/step-icon-tile";

import type { StepTone } from "../../shared/step-display";
import type { IconName } from "@hashintel/ds-components";
import type { ReactNode } from "react";

const indentPerDepth = 16;

const row = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "8",
  pr: "2",
});
const expanderSlot = css({ display: "flex", flexShrink: "0", width: "4" });
const rowLabel = css({
  flex: "1",
  justifyContent: "flex-start",
  textAlign: "left",
  "& > span:last-child": {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
const emphasizedRowLabel = css({
  "& > span:last-child": { fontWeight: "semibold" },
});
const staticRowLabel = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "1",
  minWidth: "0",
  px: "[9px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});
/* As the design system dims a disabled menu item. */
const unavailableRowLabel = css({ opacity: "[0.5]" });
const staticRowText = css({ truncate: true });
const rowEndLabel = css({
  flexShrink: "0",
  textStyle: "xs",
  color: "fg.subtle",
});
const shownOnRowHover = css({ opacity: "0", _groupHover: { opacity: "1" } });

/** A row of the left panel's lists: a step in the Steps tab, or a group or action in the Add tab. */
export const TreeRow = ({
  depth,
  icon,
  tone = "neutral",
  label,
  selected = false,
  emphasized = false,
  unavailableNote,
  expander,
  stepCount,
  status,
  onClick,
}: {
  depth: number;
  icon?: IconName;
  tone?: StepTone;
  label: string;
  selected?: boolean;
  emphasized?: boolean;
  /** Makes the row unavailable: dimmed and not clickable, with this note at its end while hovered. */
  unavailableNote?: string;
  expander?: ReactNode;
  /** Shown at the end of a group's row. */
  stepCount?: number;
  /** Shown at the end of the row, e.g. the step's state in a run. */
  status?: ReactNode;
  onClick?: () => void;
}) => {
  const iconTile = icon && (
    <StepIconTile icon={icon} tone={tone} size="small" />
  );
  const clickable = onClick !== undefined && unavailableNote === undefined;
  const labelElement = clickable ? (
    <Button
      variant="ghost"
      size="sm"
      prefix={iconTile}
      pressed={selected}
      className={cx(rowLabel, emphasized ? emphasizedRowLabel : undefined)}
      onClick={onClick}
    >
      {label}
    </Button>
  ) : (
    <span
      className={cx(
        staticRowLabel,
        unavailableNote === undefined ? undefined : unavailableRowLabel,
      )}
    >
      {iconTile}
      <span className={staticRowText}>{label}</span>
    </span>
  );

  return (
    <div
      className={cx("group", row)}
      style={{ paddingLeft: depth * indentPerDepth }}
    >
      <span className={expanderSlot}>{expander}</span>
      {labelElement}
      {stepCount !== undefined && (
        <span className={rowEndLabel}>{countSteps(stepCount)}</span>
      )}
      {unavailableNote !== undefined && (
        <span className={cx(rowEndLabel, shownOnRowHover)}>
          {unavailableNote}
        </span>
      )}
      {status}
    </div>
  );
};
