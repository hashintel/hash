import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getStepName } from "../../shared/find-step";
import { getStepDisplay } from "../../shared/step-display";
import { StepIconTile } from "../../shared/step-icon-tile";

import type { ValueUse } from "../../shared/value-uses";

/** At most this many tiles show at rest; past it, one fewer show, then "+N" for the rest. */
const tileCap = 3;
/** At most this many names show on hover, then "and N more", so a value used by many steps keeps a short tooltip. */
const nameCap = 10;

const usedIn = css({
  display: "inline-flex",
  flexShrink: "0",
  alignItems: "center",
  gap: "1.5",
  height: "6",
  px: "1.5",
  bg: "[transparent]",
  borderWidth: "0",
  borderRadius: "md",
  textStyle: "xs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
  cursor: "pointer",
  _hover: { color: "fg.heading", bg: "bg.surface.hover" },
  _focusVisible: { color: "fg.heading", bg: "bg.surface.hover" },
  "&[aria-expanded=true]": { color: "fg.heading" },
});
const tiles = css({ display: "inline-flex", alignItems: "center" });
/* Each tile sits 4px over the one before, with a ring in the panel's colour between them. */
const stackedTile = css({
  display: "flex",
  borderRadius: "sm",
  boxShadow: "[0 0 0 1.5px {colors.bgSolid.min}]",
  "& + &": { marginLeft: "-1" },
});
const moreCount = css({ marginLeft: "1", color: "fg.subtle" });
const tooltipNames = css({ display: "flex", flexDirection: "column" });
const rows = css({ display: "flex", flexDirection: "column", gap: "1" });
const row = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "full",
  minHeight: "[34px]",
  px: "1.5",
  bg: "[transparent]",
  borderWidth: "0",
  borderRadius: "md",
  textAlign: "left",
  textStyle: "sm",
  cursor: "pointer",
  _hover: { bg: "bg.surface.hover" },
  _focusVisible: { bg: "bg.surface.hover" },
});
const rowText = css({ display: "flex", flex: "1", minWidth: "0" });
const rowStep = css({
  minWidth: "0",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const rowInput = css({
  flexShrink: "0",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const separator = css({ px: "1.5" });

/**
 * "Used in" at rest: the words, then a tile in each using step's hue, overlapping, with their names on hover.
 * Clicking it opens or closes {@link UsedInRows}, which the caller places.
 */
export const UsedInButton = ({
  valueUses,
  open,
  onToggle,
}: {
  valueUses: ValueUse[];
  open: boolean;
  onToggle: () => void;
}) => {
  const names = valueUses.map(({ step }) => getStepName(step));
  const shown =
    valueUses.length > tileCap ? valueUses.slice(0, tileCap - 1) : valueUses;
  const rest = valueUses.length - shown.length;
  const namesRest = names.length - nameCap;

  return (
    <Tooltip
      position="top"
      content={
        <span className={tooltipNames}>
          {valueUses.slice(0, nameCap).map(({ step }) => (
            <span key={step.stepId}>{getStepName(step)}</span>
          ))}
          {namesRest > 0 && <span>{`and ${namesRest} more`}</span>}
        </span>
      }
    >
      <button
        type="button"
        className={usedIn}
        aria-expanded={open}
        aria-label={`Used in ${names.join(", ")}`}
        onClick={onToggle}
      >
        Used in
        <span className={tiles}>
          {shown.map(({ step }) => {
            const { icon, tone } = getStepDisplay(step);

            return (
              <span key={step.stepId} className={stackedTile}>
                <StepIconTile icon={icon} tone={tone} size="stack" />
              </span>
            );
          })}
          {rest > 0 && <span className={moreCount}>{`+${rest}`}</span>}
        </span>
      </button>
    </Tooltip>
  );
};

/** "Used in" open: a row per using step, its tile then "Step › Input". Picking one selects the step. */
export const UsedInRows = ({
  valueUses,
  onSelectStep,
}: {
  valueUses: ValueUse[];
  onSelectStep: (stepId: string) => void;
}) => (
  <span className={rows}>
    {valueUses.map(({ step, properties }) => {
      const { icon, tone } = getStepDisplay(step);

      return (
        <button
          key={step.stepId}
          type="button"
          className={row}
          onClick={() => onSelectStep(step.stepId)}
        >
          <StepIconTile icon={icon} tone={tone} size="row" />
          <span className={rowText}>
            <span className={rowStep}>{getStepName(step)}</span>
            <span className={rowInput}>
              <span className={separator}>›</span>
              {properties.join(", ")}
            </span>
          </span>
        </button>
      );
    })}
  </span>
);
