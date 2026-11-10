import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { ActionIoTooltip } from "../../shared/action-io";
import { countSteps } from "../../shared/step-display";
import { StepIconTile } from "../../shared/step-icon-tile";

import type { StepTone } from "../../shared/step-display";
import type { IconName } from "@hashintel/ds-components";
import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";
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
const labelSlot = css({ display: "flex", flex: "1", minWidth: "0" });
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
const staticRowText = css({ truncate: true });
const stepCountLabel = css({
  flexShrink: "0",
  textStyle: "xs",
  color: "fg.subtle",
});

/** A row of the left panel's lists: a step in the Steps tab, or a group or action in the Add tab. */
export const TreeRow = ({
  depth,
  icon,
  tone = "neutral",
  label,
  selected = false,
  emphasized = false,
  expander,
  stepCount,
  status,
  actionDefinitionId,
  onClick,
}: {
  depth: number;
  icon?: IconName;
  tone?: StepTone;
  label: string;
  selected?: boolean;
  emphasized?: boolean;
  expander?: ReactNode;
  /** Shown at the end of a group's row. */
  stepCount?: number;
  /** Shown at the end of the row, e.g. the step's state in a run. */
  status?: ReactNode;
  /** An action whose inputs and outputs show while the row is hovered or focused. */
  actionDefinitionId?: FlowActionDefinitionId;
  onClick?: () => void;
}) => {
  const iconTile = icon && (
    <StepIconTile icon={icon} tone={tone} size="small" />
  );
  const labelElement = onClick ? (
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
    <span className={staticRowLabel}>
      {iconTile}
      <span className={staticRowText}>{label}</span>
    </span>
  );

  return (
    <div className={row} style={{ paddingLeft: depth * indentPerDepth }}>
      <span className={expanderSlot}>{expander}</span>
      {actionDefinitionId ? (
        <ActionIoTooltip
          actionDefinitionId={actionDefinitionId}
          className={labelSlot}
        >
          {labelElement}
        </ActionIoTooltip>
      ) : (
        labelElement
      )}
      {stepCount !== undefined && (
        <span className={stepCountLabel}>{countSteps(stepCount)}</span>
      )}
      {status}
    </div>
  );
};
