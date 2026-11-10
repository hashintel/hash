import { useState } from "react";

import { Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { getStepName } from "../../shared/find-step";
import { getStepDisplay } from "../../shared/step-display";
import { StepIconTile } from "../../shared/step-icon-tile";

import type { ValueUse } from "../../shared/value-uses";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

const uses = css({ display: "flex", flexDirection: "column", gap: "1" });
const summary = css({ display: "flex", alignItems: "center", gap: "2" });
const label = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  p: "0",
  bg: "[transparent]",
  borderWidth: "0",
  textStyle: "xs",
  color: "fg.muted",
  cursor: "pointer",
  _hover: { color: "fg.heading" },
  _focusVisible: { color: "fg.heading" },
});
const tiles = css({ display: "flex", alignItems: "center", gap: "1" });
const tile = css({ display: "flex" });
const quiet = css({ textStyle: "xs", color: "fg.subtle" });
const list = css({ display: "flex", flexDirection: "column" });
const entry = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "8",
  px: "1.5",
  bg: "[transparent]",
  borderWidth: "0",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _focusVisible: { bg: "bg.subtle" },
});
const highlightedEntry = css({
  bg: "bg.shaded",
  _hover: { bg: "bg.shaded.hover" },
});
const entryName = css({
  flex: "1",
  minWidth: "0",
  textStyle: "sm",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const entryProperties = css({
  flexShrink: "0",
  maxWidth: "[50%]",
  textStyle: "xs",
  color: "fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const UseTile = ({ step }: { step: StepDefinition<string> }) => {
  const { icon, tone } = getStepDisplay(step);

  return <StepIconTile icon={icon} tone={tone} size="small" />;
};

/**
 * The steps that use an output, as the run ran them: "Used in" and their icons, named on hover. Clicking it lists each
 * step with the properties that take the output, and picking one highlights that step on the canvas.
 */
export const OutputUses = ({
  valueUses,
  highlightedStepId,
  onHighlightStep,
}: {
  valueUses: ValueUse[];
  highlightedStepId: string | null;
  /** `null` stops highlighting. */
  onHighlightStep: (stepId: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);

  if (valueUses.length === 0) {
    return <span className={quiet}>Not used by other steps</span>;
  }

  const highlightsOne = valueUses.some(
    ({ step }) => step.stepId === highlightedStepId,
  );

  return (
    <div className={uses}>
      <span className={summary}>
        <button
          type="button"
          className={label}
          aria-expanded={open}
          onClick={() => {
            if (open && highlightsOne) {
              onHighlightStep(null);
            }
            setOpen(!open);
          }}
        >
          Used in
          <Icon name={open ? "chevronUp" : "chevronDown"} size="xs" />
        </button>
        {!open && (
          <span className={tiles}>
            {valueUses.map(({ step }) => (
              <Tooltip
                key={step.stepId}
                position="top"
                content={getStepName(step)}
              >
                <span className={tile}>
                  <UseTile step={step} />
                </span>
              </Tooltip>
            ))}
          </span>
        )}
      </span>
      {open && (
        <div className={list}>
          {valueUses.map(({ step, properties }) => {
            const highlighted = step.stepId === highlightedStepId;

            return (
              <button
                key={step.stepId}
                type="button"
                className={cx(entry, highlighted && highlightedEntry)}
                aria-pressed={highlighted}
                onClick={() =>
                  onHighlightStep(highlighted ? null : step.stepId)
                }
              >
                <UseTile step={step} />
                <span className={entryName}>{getStepName(step)}</span>
                <span className={entryProperties}>{properties.join(", ")}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
